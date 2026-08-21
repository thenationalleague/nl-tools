/**
 * NL Tools — one club code → a `club` claim (RTDB-triggered).
 *
 * WHAT THIS IS
 * ------------
 * The single credential a club uses for every club-facing gated tool. Type a
 * six-character code, get back a Firebase custom token carrying `club: '<key>'`
 * — the club's key from clubs-meta, the same vocabulary `pClub` already speaks.
 *
 * The code says WHICH CLUB. It does not say what that club may open: that is
 * decided per tool in the RTDB rules, which read the claim. Adding a third tool
 * means extending rules, not minting a third set of 72 codes.
 *
 * WHY IT EXISTS (system/club-code-plan.md)
 * ----------------------------------------
 * Two sets of 72 codes already existed before this — Programme Packs
 * (`media-programme/config.clubs`) and Club Directory (`ops-club-directory/
 * config.readers`) — and the Handbook would have made three. Settled
 * 19/08/2026: one code per club, resettable per club, covering all of them.
 *
 * The Directory is the reason the claim carries a CLUB rather than a role. Its
 * own `dir: 'reader'|'editor'|'admin'` claim says what kind of visitor you are
 * and not which club, which is exactly why it cannot show a club its own
 * withheld-contact markers and nobody else's. A club-shaped claim is not
 * tidiness; it is the mechanism that feature needs.
 *
 * FRESH CODES, NOT THE PROGRAMME ONES
 * -----------------------------------
 * Recycling the mechanism, not the codes. A code someone was handed for
 * matchday artwork must not silently become a key to a staff directory —
 * that is an access widening nobody decided, club by club. `config` here is a
 * new node and starts empty.
 *
 * Migration is additive: `pClub` keeps working untouched while these are
 * issued. Programme Packs moves onto this claim last, once the 72 hold the new
 * code.
 *
 * THE SHAPE OF config  (never client-readable — rules deny outright)
 * -----------------------------------------------------------------
 *   config/clubs/<clubKey> = { name, code, revoked?, rotatedAt? }
 *   config/nl              = { name, code }        → claim 'club: "*"'
 *
 * `revoked: true` is preferred over deleting a record, so an audit line still
 * resolves a departed club's uid to a name rather than showing a bare key.
 *
 * REVOCATION IS NOT INSTANT. A custom claim lives in the holder's token until
 * it refreshes — up to an hour. Resetting a code stops the NEXT sign-in, not
 * the session already open. Any UI offering "reset" must not imply otherwise.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * No editor/admin level. This grants read-shaped club identity and nothing
 * else; the Directory's editor codes stay where they are until someone decides
 * that editing should ride on a shared club credential, which is a different
 * question from reading (plan §7.4).
 */

"use strict";

const { onValueWritten } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const ROOT = "app-data/club-codes";

const TRIGGER_OPTS = {
  ref: "/" + ROOT + "/authRequests/{uid}",
  instance: "nl-tools-default-rtdb",
  /* RTDB triggers must run in the database's region (europe-west1), which
     overrides the europe-west2 setGlobalOptions default in index.js. */
  region: "europe-west1",
  memory: "256MiB",
  maxInstances: 10,
  /* The gen-2 default (compute SA) holds no Firebase roles, so RTDB drops its
     connection and token minting fails. Same account as the others. */
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
};

/* Codes come off an email or a printed sheet and get retyped, so match on the
   normalised form: uppercase, alphanumerics only. Identical to programme.js's
   normCode — tests/club-code.test.mjs asserts the two agree, because a club
   holding one code for both tools must not find it works in one and not the
   other over a typed space. */
function normCode(s) {
  return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* Constant-time-ish compare — removes the trivial early-exit timing signal.
   The code space plus the throttle below is the real defence. */
function safeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Which club does this code open? The code alone is the whole credential —
   no link token narrowing the search. Programme Packs carried one and it cost
   a club a day of "Passcode not recognised" on a correct new passcode, because
   rotating the code rotated the token in every bookmark alongside it. The
   collision that token guarded is prevented at issue time instead: the console
   refuses to mint a code another club already holds. */
/* The stored field is `passcode` on the relocated Programme records and `code`
   on anything minted since. Both are read, because the relocation is a move
   rather than a rewrite: renaming 72 live secrets in flight is a second thing
   to go wrong for no benefit, and a record that opens under one name and not
   the other is the worst possible outcome of tidying. */
function storedCode(rec) {
  return normCode((rec && (rec.passcode || rec.code)) || "");
}

function pickClub(cfg, code) {
  const clubs = (cfg && cfg.clubs) || {};
  const all = Object.keys(clubs).map((k) => ({ key: k, rec: clubs[k] }));
  if (cfg && cfg.nl) all.push({ key: "NL", rec: cfg.nl });
  /* An EMPTY code matches nothing, and an empty STORED code is matched by
     nothing. Both halves are needed and neither is theoretical: safeEqual('','')
     is true, so a config record whose `code` field is missing or blank — a
     half-finished entry, a club added before its code was minted — would open
     for anybody submitting an empty string. The trigger does reject anything
     under four characters before it reaches here, but that is one guard, in
     one caller, in a different function from the door it protects. The door
     refuses on its own account.
     (functions/programme.js has the same shape and the same latent hole; it is
     covered by the same length guard and should get this line too.) */
  if (!code) return null;
  return all.find((c) =>
    c.rec && !c.rec.revoked &&
    storedCode(c.rec) !== "" &&
    safeEqual(storedCode(c.rec), code)) || null;
}

/* ---- Throttle ------------------------------------------------------------
   A trigger sees no source IP, so this cannot rate limit per caller, and an
   attacker can mint anonymous uids freely — which makes a per-uid counter weak
   on its own. Both are kept, and the global one is what actually bounds a
   distributed guess:

     · per-uid : 10 failures        — stops the naive retype-forever loop
     · global  : 120 failures / 10m — bounds everyone, at a level no honest
                                      week of 72 clubs signing in comes close to

   If the global trip ever fires in normal use, raise it — but read the audit
   trail first. Deliberately the same numbers as programme.js: two gates with
   the same job and different ceilings is a difference someone has to hold in
   their head for no benefit. */
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

/* ---- The trigger ---------------------------------------------------------
   onValueWritten, not onValueCreated. The request path is keyed on a stable
   uid, so it is only ever a *create* the first time that user signs in. If a
   request is left behind — the function was down, errored, or the trigger was
   not yet delivering — every later attempt by that user is an UPDATE, and an
   onValueCreated trigger would ignore it forever. That is a permanent lockout
   for exactly the user unlucky enough to hit a blip. Deletions (including this
   function's own) are ignored, which also keeps it loop-safe. */
exports.clubCodeAuth = onValueWritten(TRIGGER_OPTS, async (event) => {
  const uid = event.params.uid;
  const after = event.data && event.data.after;
  if (!after || !after.exists()) return;   // our own delete, or a clear
  const req = after.val() || {};
  const db = admin.database();

  /* Delete the request first, whatever happens next: it carries a code in
     plain text and there is no reason for it to outlive this invocation. */
  await db.ref(ROOT + "/authRequests/" + uid).remove().catch(() => {});

  const grant = (payload) => db.ref(ROOT + "/authGrants/" + uid).set(payload);

  try {
    /* ---- NL path: caller is already signed in on the portal -------------
       Staff open these tools from the portal and should not be typing a club
       code to do it. `club: "*"` is the same wildcard pClub uses, so rules
       written for one read the other without a second branch. */
    if (req.staff === true) {
      const role = String(
        (await db.ref("users/" + uid + "/role").once("value")).val() || ""
      ).toLowerCase();

      if (role !== "staff" && role !== "admin" && role !== "superadmin") {
        logger.warn("clubCodeAuth: staff claim refused", { uid, role });
        return grant({ ok: false, error: "This needs a National League account." });
      }
      /* Distinct uid per person here, unlike the shared club uids below: a
         named account is signing in, so the audit trail can name them. */
      const customToken = await admin.auth()
        .createCustomToken("cc-staff-" + uid, { club: "*", pClub: "*" });
      logger.info("clubCodeAuth: staff granted", { uid, role });
      return grant({
        ok: true, customToken, isNL: true,
        role: "*", name: "National League",
        club: { code: "*", name: "National League" },
      });
    }

    /* ---- Club path: the code -------------------------------------------- */
    if (await throttled(uid)) {
      return grant({
        ok: false,
        error: "Too many incorrect codes. Try again later, or contact the National League.",
      });
    }

    const code = normCode(req.code);
    if (code.length < 4) return grant({ ok: false, error: "Enter your club code." });

    /* Same node Programme reads, with the same fallback while the relocation
       is in flight — see the CODES note in functions/programme.js. One
       credential, one home, two doors onto it. */
    let cfg = (await db.ref(ROOT + "/config").once("value")).val();
    if (!cfg || !cfg.clubs) {
      cfg = (await db.ref("app-data/media-programme/config").once("value")).val() || {};
      if (cfg.clubs) logger.info("clubCodeAuth: codes read from the OLD location");
    }
    const hit = pickClub(cfg, code);

    if (!hit) {
      await noteFailure(uid);
      /* The code itself is never logged, on the rejected path least of all —
         a near-miss in a log line is a near-miss written down. */
      logger.info("clubCodeAuth: code rejected", { uid });
      return grant({ ok: false, error: "Code not recognised." });
    }

    await db.ref(ROOT + "/rate/uid/" + uid).remove().catch(() => {});

    /* One uid per club, not per person: everyone at a club shares `cc-<key>`.
       Attribution is at club level anyway — all a shared code can honestly
       support — and it keeps the Auth user list at 73 rows rather than one per
       device. Anyone wanting per-person attribution wants an account, which is
       a different door (system/roles-and-access-plan.md). */
    /* BOTH CLAIMS — see the matching note in programme.js. A club signing in
       here must keep Programme Packs working, because the two gates otherwise
       fight: signInWithCustomToken replaces the session, so whichever was
       opened last would be the only one that worked. */
    const customToken = await admin.auth()
      .createCustomToken("cc-" + hit.key, { club: hit.key, pClub: hit.key });

    logger.info("clubCodeAuth: club granted", { club: hit.key });
    /* `role` and `name` at the TOP LEVEL, because that is the shape
       NL.codeGate resolves with — codeGateExchange returns { role: g.role,
       name: g.name } and nothing else. The first version returned only the
       nested `club` object, so the reader's identity bar had nothing to read
       and fell back to "The National League" on a club's own sign-in. The
       nested object stays for callers that want the pair together. */
    const clubName = hit.rec.name ||
      (hit.key === "NL" ? "National League" : hit.key);
    return grant({
      ok: true,
      customToken,
      isNL: hit.key === "NL",
      role: hit.key,
      name: clubName,
      club: { code: hit.key, name: clubName },
    });
  } catch (err) {
    logger.error("clubCodeAuth failed", { uid, message: err && err.message });
    /* Always leave a grant behind — the client waits on this node, and a silent
       failure would hang the gate until its timeout rather than saying so. */
    return grant({ ok: false, error: "Something went wrong. Please try again." });
  }
});

/* Exported for tests. Not part of the deployed surface. */
exports._internals = { normCode, safeEqual, pickClub, ROOT };
