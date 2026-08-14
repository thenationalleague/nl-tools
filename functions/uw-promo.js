/**
 * NL Tools — UW Promo Codes passcode/PIN → scoped claim (RTDB-triggered).
 *
 *   uwPromoAuth      — trigger on app-data/uw-promo/authRequests/{uid}
 *   uwPromoAuthTest  — the same, for the ?env=test sandbox root
 *
 * Validates a club till PIN, a club manager passcode, the Utility Warehouse
 * partner passcode or the NL master passcode with the Admin SDK, and writes
 * back a Firebase custom token carrying `uwRole` (and `uwClub` for a club).
 *
 * Why a trigger and not a callable
 * --------------------------------
 * Same wall programme.js hit on 03/08/2026 and footage on 13/07/2026: the
 * project carries an org policy blocking `allUsers` on new Cloud Run services,
 * so a callable cannot be given a public invoker, and club staff have no Google
 * account. The RTDB-triggered path is the org-policy-proof alternative. This is
 * deliberately the same shape as programme.js and club-directory.js — read one,
 * read all three.
 *
 * What this buys
 * --------------
 * Until now every credential in this family was checked in the BROWSER against
 * app-data/uw-promo/config, and that node was world-readable (`".read": true`).
 * Anyone who opened the database URL could read all 72 till PINs. The gate was
 * a courtesy, not a control. Now `config` is readable only by a minted master
 * token, the PIN is never compared client-side, and the answer comes back as a
 * claim the rules enforce.
 *
 * Throttling, and the one place we can do better than programme
 * ------------------------------------------------------------
 * A trigger sees no source IP and anonymous uids are free, so per-uid counting
 * is weak on its own and a global ceiling is what actually bounds a distributed
 * guess. Both are kept, exactly as programme does.
 *
 * But a 4-digit PIN lives in a 9,000-wide space — programme's 31^6 ≈ 887M can
 * absorb a global-only limit, and ours cannot. What saves it is that our `?c=`
 * link token names the club BEFORE the PIN is checked, which programme has no
 * equivalent of (its passcode alone identifies the club, so there is nothing to
 * scope a counter to). So when a token is supplied we count failures PER CLUB:
 * 10 an hour puts a full sweep of one club's PIN space at ~900 hours, and locks
 * out only that club rather than all 72. That is what lets the PIN stay short
 * enough to type at a till.
 *
 * Flow
 * ----
 *   1. Client signs in anonymously (Identity Toolkit — no Cloud Run, so the org
 *      policy does not apply) and writes { code, token? } to authRequests/<uid>.
 *   2. This trigger validates, deletes the request (the PIN never lingers), and
 *      writes authGrants/<uid> = { ok, customToken, ... } — or { ok:false }.
 *   3. Client reads the grant, deletes both nodes while it still owns that uid,
 *      then signs in with the custom token.
 *
 * Claims
 * ------
 *   { uwRole: 'till',    uwClub: '<CODE>' }   club staff — redeem + check
 *   { uwRole: 'manager', uwClub: '<CODE>' }   club admin — upload, history, PIN
 *   { uwRole: 'uw' }                          Utility Warehouse partner console
 *   { uwRole: 'master' }                      NL master console
 *
 * The grant also carries what the page would previously have read out of
 * `config` itself: a club gets its own record, a manager additionally gets its
 * own credentials (it just proved it holds them), and UW gets a club list with
 * no credentials in it. Master reads `config` directly — the rules allow it.
 */
const { onValueWritten } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const BASE_OPTS = {
  instance: "nl-tools-default-rtdb",
  /* RTDB triggers must run in the database's region (europe-west1), which
     overrides the europe-west2 setGlobalOptions default in index.js. */
  region: "europe-west1",
  memory: "256MiB",
  maxInstances: 10,
  /* Same service account as programme.js — the gen-2 default (compute SA)
     holds no Firebase roles, so RTDB drops its connection and token minting
     fails. */
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
};

/* Must agree with UWP.normCode in uw-promo/_shared.js —
   tests/uw-promo.test.mjs asserts the two produce the same answer. */
function normCode(s) {
  return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* Constant-time-ish compare — removes the trivial early-exit timing signal.
   The throttle below is the real defence, especially for a 4-digit PIN. */
function safeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Must agree with UWP.newPin: four digits, never a leading zero (a leading
   zero survives neither the access CSV nor a hurried retype), unique across
   the roster because a club signing in on its PIN alone is resolved BY it. */
function newPin(taken) {
  for (let i = 0; i < 20000; i++) {
    const p = String(1 + Math.floor(Math.random() * 9)) +
      String(Math.floor(Math.random() * 1000)).padStart(3, "0");
    if (!taken[p]) return p;
  }
  throw new Error("Could not find a free 4-digit PIN");
}

const MAX_UID_FAILURES = 10;
const MAX_CLUB_FAILURES = 10;
const CLUB_WINDOW_MS = 60 * 60 * 1000;        // 10 tries per club per hour
const MAX_GLOBAL_FAILURES = 120;
const GLOBAL_WINDOW_MS = 10 * 60 * 1000;

function windowed(cur, windowMs, max) {
  if (!cur) return false;
  if (Date.now() - (cur.first || 0) > windowMs) return false;
  return (cur.n || 0) >= max;
}

function bump(ref, windowMs) {
  return ref.transaction((cur) => {
    if (cur === null) return { n: 1, first: Date.now() };
    if (Date.now() - (cur.first || 0) > windowMs) return { n: 1, first: Date.now() };
    cur.n = (cur.n || 0) + 1;
    return cur;
  });
}

function makeTrigger(ROOT, name) {
  async function throttled(uid, clubKey) {
    const db = admin.database();
    const [uidSnap, globalSnap, clubSnap] = await Promise.all([
      db.ref(ROOT + "/rate/uid/" + uid).once("value"),
      db.ref(ROOT + "/rate/global").once("value"),
      clubKey ? db.ref(ROOT + "/rate/club/" + clubKey).once("value") : Promise.resolve(null),
    ]);
    if ((uidSnap.val() || 0) >= MAX_UID_FAILURES) return true;
    if (windowed(globalSnap.val(), GLOBAL_WINDOW_MS, MAX_GLOBAL_FAILURES)) return true;
    if (clubSnap && windowed(clubSnap.val(), CLUB_WINDOW_MS, MAX_CLUB_FAILURES)) return true;
    return false;
  }

  async function noteFailure(uid, clubKey) {
    const db = admin.database();
    const jobs = [
      db.ref(ROOT + "/rate/uid/" + uid).transaction((n) => (n || 0) + 1),
      bump(db.ref(ROOT + "/rate/global"), GLOBAL_WINDOW_MS),
    ];
    if (clubKey) jobs.push(bump(db.ref(ROOT + "/rate/club/" + clubKey), CLUB_WINDOW_MS));
    await Promise.all(jobs);
  }

  /* onValueWritten, not onValueCreated: the request path is keyed on a stable
     uid, so a request left behind by a blip would make every later attempt an
     UPDATE, which onValueCreated ignores forever — a permanent lockout for
     whoever was unlucky. Deletions are ignored, which keeps it loop-safe. */
  return onValueWritten(
    Object.assign({ ref: "/" + ROOT + "/authRequests/{uid}" }, BASE_OPTS),
    async (event) => {
      const uid = event.params.uid;
      const after = event.data && event.data.after;
      if (!after || !after.exists()) return;    // our own delete — nothing to do
      const req = after.val() || {};
      const db = admin.database();

      /* Delete the request first, whatever happens next: it carries a PIN in
         plain text and has no reason to outlive this invocation. */
      await db.ref(ROOT + "/authRequests/" + uid).remove().catch(() => {});
      const grant = (payload) => db.ref(ROOT + "/authGrants/" + uid).set(payload);

      try {
        const cfg = (await db.ref(ROOT + "/config").once("value")).val() || {};
        const clubs = cfg.clubs || {};

        /* ---- First run: no master passcode set yet ---------------------- */
        /* Mirrors the console's first-run screen. Only reachable while the
           master record genuinely does not exist, so it closes itself the
           moment a passcode is chosen. */
        if (req.bootstrap === true) {
          if (cfg.master && cfg.master.passcode) {
            return grant({ ok: false, error: "Already set up — enter the master passcode." });
          }
          const customToken = await admin.auth().createCustomToken("uw-master", { uwRole: "master" });
          logger.info(name + ": bootstrap granted");
          return grant({ ok: true, customToken, role: "master" });
        }

        /* ---- Manager rotating its own club's till PIN -------------------- */
        /* No credential is presented, and none is needed: the request path is
           keyed on the caller's uid, rules let you write only your own, and
           `uw-<CODE>-manager` is a uid only this function ever mints — and
           only for someone who proved they hold that club's manager passcode.
           So the uid IS the authorisation. Config is master-only now, so this
           is the one route a club has to rotate a walked card's PIN itself. */
        if (req.rotatePin === true) {
          const m = /^uw-(.+)-manager$/.exec(uid);
          if (!m) return grant({ ok: false, error: "Sign in as a club manager first." });
          const key = m[1];
          if (!clubs[key]) return grant({ ok: false, error: "Club not recognised." });
          const taken = {};
          Object.keys(clubs).forEach((k) => {
            if (k !== key && clubs[k] && clubs[k].passcode) taken[String(clubs[k].passcode)] = true;
          });
          const pin = newPin(taken);
          await db.ref(ROOT + "/config/clubs/" + key).update({ passcode: pin, updatedAt: Date.now() });
          logger.info(name + ": club rotated its own PIN", { club: key });
          return grant({ ok: true, passcode: pin });
        }

        const code = normCode(req.code);
        if (code.length < 4) return grant({ ok: false, error: "Enter your PIN or passcode." });

        /* The ?c= link names the club before anything is compared, which is
           what makes a per-club throttle possible. A bad/absent token simply
           falls through to the whole-roster search below. */
        let scoped = null;
        if (req.token) {
          const key = Object.keys(clubs).find((k) => clubs[k] && clubs[k].token === req.token);
          if (key) scoped = { key, rec: clubs[key] };
        }

        if (await throttled(uid, scoped && scoped.key)) {
          return grant({
            ok: false,
            error: "Too many incorrect attempts. Try again later, or contact the National League.",
          });
        }

        /* ---- Club: till PIN or manager passcode ------------------------- */
        const candidates = scoped
          ? [scoped]
          : Object.keys(clubs).map((k) => ({ key: k, rec: clubs[k] }));

        let hit = null;
        for (const c of candidates) {
          if (!c.rec) continue;
          if (safeEqual(normCode(c.rec.passcode), code)) { hit = { c, role: "till" }; break; }
          if (c.rec.managerPass && safeEqual(normCode(c.rec.managerPass), code)) {
            hit = { c, role: "manager" }; break;
          }
        }

        if (hit) {
          await db.ref(ROOT + "/rate/uid/" + uid).remove().catch(() => {});
          /* One uid per club per role, not per person: everyone at a club
             shares it. Attribution is at club level anyway — all a shared
             credential can honestly support — and it keeps the Auth user list
             small rather than one row per device. */
          const key = hit.c.key;
          const customToken = await admin.auth().createCustomToken(
            "uw-" + key + "-" + hit.role,
            { uwRole: hit.role, uwClub: key }
          );
          logger.info(name + ": club granted", { club: key, role: hit.role });
          return grant({
            ok: true,
            customToken,
            role: hit.role,
            club: {
              code: key,
              name: hit.c.rec.name || key,
              division: hit.c.rec.division || "",
            },
            /* A manager just proved it holds the manager passcode, so it may
               see its own till PIN and link — that is the PIN card and the
               club's own till-card printing. A till session gets neither. */
            creds: hit.role === "manager"
              ? { passcode: hit.c.rec.passcode || "", token: hit.c.rec.token || "" }
              : null,
          });
        }

        /* ---- Utility Warehouse partner console -------------------------- */
        if (cfg.uw && cfg.uw.passcode && safeEqual(normCode(cfg.uw.passcode), code)) {
          await db.ref(ROOT + "/rate/uid/" + uid).remove().catch(() => {});
          const customToken = await admin.auth().createCustomToken("uw-partner", { uwRole: "uw" });
          logger.info(name + ": UW granted");
          return grant({
            ok: true, customToken, role: "uw",
            /* The club dropdown, with nothing sensitive in it — UW never needs
               a credential, and must not be handed 72 of them. */
            clubs: Object.keys(clubs).map((k) => ({
              code: k, name: clubs[k].name || k, division: clubs[k].division || "",
            })),
          });
        }

        /* ---- NL master console ------------------------------------------ */
        if (cfg.master && cfg.master.passcode && safeEqual(normCode(cfg.master.passcode), code)) {
          await db.ref(ROOT + "/rate/uid/" + uid).remove().catch(() => {});
          const customToken = await admin.auth().createCustomToken("uw-master", { uwRole: "master" });
          logger.info(name + ": master granted");
          return grant({ ok: true, customToken, role: "master" });
        }

        await noteFailure(uid, scoped && scoped.key);
        logger.info(name + ": rejected", { uid, scoped: !!scoped });
        return grant({ ok: false, error: "Not recognised. Check with the National League." });
      } catch (err) {
        logger.error(name + " failed", { uid, message: err && err.message });
        /* Always leave a grant behind — the client waits on this node, and a
           silent failure would hang the gate until its timeout rather than
           saying so. */
        return grant({ ok: false, error: "Something went wrong. Please try again." });
      }
    }
  );
}

exports.uwPromoAuth = makeTrigger("app-data/uw-promo", "uwPromoAuth");
exports.uwPromoAuthTest = makeTrigger("app-data/uw-promo-test", "uwPromoAuthTest");
