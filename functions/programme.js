/**
 * NL Tools — Programme Packs passcode → scoped claim (RTDB-triggered).
 *
 *   programmeAuth — an RTDB trigger on app-data/media-programme/authRequests/{uid}.
 *                   Validates the club passcode (or the caller's portal role)
 *                   with the Admin SDK and writes back a Firebase custom token
 *                   carrying a `pClub` claim.
 *
 * Why a trigger and not a callable
 * --------------------------------
 * This started as two onCall callables. They deployed, but Firebase could not
 * grant them a public invoker: the project carries an org policy that blocks
 * `allUsers` on new Cloud Run services ("Failed to set the IAM Policy on the
 * Service .../programmeenter", 03/08/2026). Clubs have no Google account, so an
 * un-invokable callable is a dead end. footage/NEXT.md hit the same wall on
 * 13/07/2026 with getFootageUrl and records the RTDB-triggered path as the
 * org-policy-proof alternative — this is that path.
 *
 * Cost of the swap: Eventarc delivery adds seconds (footage measured ~15-20s,
 * structural rather than cold-start). That killed it for video previews, which
 * happen constantly. Here it runs on a passcode gate that a device hits once
 * every 30 days, behind a spinner — an acceptable trade for real enforcement.
 *
 * What this buys
 * --------------
 * The passcode is never checked in the browser and `config` is never readable
 * by a client. The answer comes back as a `pClub` claim (a club's clubs-meta
 * code, or 'NL', or '*' for NL admins) that Storage and RTDB rules enforce
 * write-own against. With plain anonymous auth the token would carry no club
 * identity at all, so the rules could not tell FGR from Barnet and anyone
 * holding any club's code could write or remove all 72 folders.
 *
 * Flow
 * ----
 *   1. Client signs in anonymously (Identity Toolkit — no Cloud Run, so the org
 *      policy does not apply) and writes { code, token? } to authRequests/<uid>.
 *   2. This trigger validates, deletes the request (the passcode never lingers),
 *      and writes authGrants/<uid> = { ok, customToken, club } — or { ok:false }.
 *   3. Client reads the grant, deletes both nodes while it still owns that uid,
 *      then signs in with the custom token.
 *
 * Admin variant: the caller is already signed in on the portal (auth-guard), so
 * it writes { admin: true } and this checks users/<uid>/role server-side.
 *
 * Migration note: when /programme moves behind the portal, this file is deleted.
 * `pClub` is replaced by the portal's users/<uid>/club and the rules change from
 * `auth.token.pClub === $club` to the portal equivalent — nothing else moves,
 * because the Storage paths are keyed on the same clubs-meta code the portal
 * uses. See programme/README.md.
 */
const { onValueWritten } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const ROOT = "app-data/media-programme";

const TRIGGER_OPTS = {
  ref: "/" + ROOT + "/authRequests/{uid}",
  instance: "nl-tools-default-rtdb",
  /* RTDB triggers must run in the database's region (europe-west1), which
     overrides the europe-west2 setGlobalOptions default in index.js. */
  region: "europe-west1",
  memory: "256MiB",
  maxInstances: 10,
  /* Same service account as account.js — the gen-2 default (compute SA) holds
     no Firebase roles, so RTDB drops its connection and token minting fails. */
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
};

/* Passcodes come off a printed card and get retyped, so match on the normalised
   form: uppercase, alphanumerics only. The client has its own copy in
   programme/_shared.js — tests/programme.test.mjs asserts the two agree. */
function normCode(s) {
  return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* Constant-time-ish compare — removes the trivial early-exit timing signal.
   The passcode space (31^6 ≈ 887M) plus the throttle below is the real
   defence. */
function safeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Which club does this passcode open?
 *
 * A link token narrows the search to the entry it belongs to, so a passcode
 * cannot open a different club's folder even if two codes ever collided. But a
 * token that matches NOTHING must not veto a correct passcode: regenerating a
 * club's access rotates the passcode AND the link, so the moment the console
 * reissues, every bookmark and every emailed URL in that club carries a dead
 * ?c=. Filtering on it and stopping there turned a valid new passcode into
 * "Passcode not recognised" (Sutton, 04/08/2026) — the one error message that
 * sends someone back to the console convinced the regeneration failed.
 *
 * So a stale token degrades to passcode-only, which is exactly what the bare
 * URL already offers every visitor. Nothing is given away: the token narrows
 * when it is real and is ignored when it is not.
 */
function pickClub(cfg, code, linkToken) {
  const clubs = (cfg && cfg.clubs) || {};
  const all = Object.keys(clubs).map((k) => ({ key: k, rec: clubs[k] }));
  if (cfg && cfg.nl) all.push({ key: "NL", rec: cfg.nl });

  const match = (list) =>
    list.find((c) => c.rec && safeEqual(normCode(c.rec.passcode), code)) || null;

  if (linkToken) {
    const scoped = all.filter((c) => c.rec && c.rec.token === linkToken);
    if (scoped.length) return match(scoped);   // live link — it decides
  }
  return match(all);
}

/* ---- Throttle ------------------------------------------------------------
   A trigger sees no source IP, so unlike the callable version this cannot rate
   limit per caller. An attacker can also mint anonymous uids freely, making a
   per-uid counter weak on its own. So both are kept, and the global one is what
   actually bounds a distributed guess:

     · per-uid : 10 failures        — stops the naive retype-forever loop
     · global  : 120 failures / 10m — bounds everyone, at a level no honest
                                      week of 72 clubs logging in comes close to

   At the global ceiling, exhausting a 31^6 space would take ~140 years, and
   every attempt still costs an anonymous signup (itself IP-throttled by
   Identity Toolkit) plus a function invocation. If the global trip ever fires
   in normal use, raise it — but look at the audit trail first. */
const MAX_UID_FAILURES = 10;
const MAX_GLOBAL_FAILURES = 120;
const GLOBAL_WINDOW_MS = 10 * 60 * 1000;

async function throttled(uid) {
  const db = admin.database();
  const [uidSnap, globalSnap] = await Promise.all([
    db.ref(ROOT + "/rate/uid/" + uid).once("value"),
    db.ref(ROOT + "/rate/global").once("value"),
  ]);
  if ((uidSnap.val() || 0) >= MAX_UID_FAILURES) return true;
  const g = globalSnap.val();
  if (g && Date.now() - (g.first || 0) <= GLOBAL_WINDOW_MS && (g.n || 0) >= MAX_GLOBAL_FAILURES) {
    return true;
  }
  return false;
}

async function noteFailure(uid) {
  const db = admin.database();
  await Promise.all([
    db.ref(ROOT + "/rate/uid/" + uid).transaction((n) => (n || 0) + 1),
    db.ref(ROOT + "/rate/global").transaction((cur) => {
      if (cur === null) return { n: 1, first: Date.now() };
      if (Date.now() - (cur.first || 0) > GLOBAL_WINDOW_MS) return { n: 1, first: Date.now() };
      cur.n = (cur.n || 0) + 1;
      return cur;
    }),
  ]);
}

/* ---- The trigger --------------------------------------------------------- */
/* onValueWritten, not onValueCreated. The request path is keyed on a stable
   uid, so it is only ever a *create* the first time that user signs in. If a
   request is ever left behind — the function was down, errored, or the trigger
   was not yet delivering — every later attempt by that user is an UPDATE, and
   an onValueCreated trigger would ignore it forever. That is a permanent
   lockout for exactly the user unlucky enough to hit a blip, so it must be
   onValueWritten. Deletions (including this function's own) are ignored, which
   also keeps it loop-safe. */
exports.programmeAuth = onValueWritten(TRIGGER_OPTS, async (event) => {
  const uid = event.params.uid;
  const after = event.data && event.data.after;
  if (!after || !after.exists()) return;   // our own delete, or a clear — nothing to do
  const req = after.val() || {};
  const db = admin.database();

  /* Delete the request first, whatever happens next: it carries a passcode in
     plain text and there is no reason for it to outlive this invocation. */
  await db.ref(ROOT + "/authRequests/" + uid).remove().catch(() => {});

  const grant = (payload) => db.ref(ROOT + "/authGrants/" + uid).set(payload);

  try {
    /* ---- Admin path: caller is signed in on the portal ------------------ */
    if (req.admin === true) {
      const role = String(
        (await db.ref("users/" + uid + "/role").once("value")).val() || ""
      ).toLowerCase();

      if (role !== "admin" && role !== "superadmin") {
        logger.warn("programmeAuth: admin claim refused", { uid, role });
        return grant({ ok: false, error: "Programme Packs administration is admin-only." });
      }
      /* Distinct uid per admin so the audit trail names the individual, unlike
         the shared club uids below. */
      const customToken = await admin.auth().createCustomToken("pp-admin-" + uid, { pClub: "*" });
      logger.info("programmeAuth: admin granted", { uid, role });
      return grant({
        ok: true, customToken, isNL: true,
        club: { code: "*", name: "National League", division: "" },
      });
    }

    /* ---- Club path: passcode ------------------------------------------- */
    if (await throttled(uid)) {
      return grant({
        ok: false,
        error: "Too many incorrect passcodes. Try again later, or contact the National League.",
      });
    }

    const code = normCode(req.code);
    if (code.length < 4) return grant({ ok: false, error: "Enter your passcode." });

    const cfg = (await db.ref(ROOT + "/config").once("value")).val() || {};
    const linkToken = String(req.token || "").trim().slice(0, 40);
    const hit = pickClub(cfg, code, linkToken);

    if (!hit) {
      await noteFailure(uid);
      logger.info("programmeAuth: passcode rejected", { uid, viaLink: !!linkToken });
      return grant({ ok: false, error: "Passcode not recognised." });
    }

    await db.ref(ROOT + "/rate/uid/" + uid).remove().catch(() => {});

    /* One uid per club, not per person: everyone at a club shares `pp-<CODE>`.
       Attribution is at club level anyway — all a shared passcode can honestly
       support — and it keeps the Auth user list at 73 rows, not one per
       device. */
    const customToken = await admin.auth()
      .createCustomToken("pp-" + hit.key, { pClub: hit.key });

    logger.info("programmeAuth: club granted", { club: hit.key, viaLink: !!linkToken });
    return grant({
      ok: true,
      customToken,
      isNL: hit.key === "NL",
      club: {
        code: hit.key,
        name: hit.rec.name || (hit.key === "NL" ? "National League" : hit.key),
        division: hit.rec.division || "",
      },
    });
  } catch (err) {
    logger.error("programmeAuth failed", { uid, message: err && err.message });
    /* Always leave a grant behind — the client waits on this node, and a silent
       failure would hang the gate until its timeout rather than saying so. */
    return grant({ ok: false, error: "Something went wrong. Please try again." });
  }
});
