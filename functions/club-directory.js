/**
 * NL Tools — Club Directory passcode → scoped claim (RTDB-triggered).
 *
 *   clubDirectoryAuth — an RTDB trigger on
 *                       app-data/ops-club-directory/authRequests/{uid}.
 *                       Validates a six-digit code with the Admin SDK and
 *                       writes back a Firebase custom token carrying a `dir`
 *                       claim.
 *
 * Why a trigger and not a callable
 * --------------------------------
 * Same wall programme.js hit on 03/08/2026: the project carries an org policy
 * blocking `allUsers` on new Cloud Run services, so a callable cannot be given
 * a public invoker, and the people using this tool have no Google account. The
 * RTDB-triggered path is the org-policy-proof alternative. See programme.js for
 * the full account — this is deliberately the same shape, so anyone who has
 * read one has read both.
 *
 * Two kinds of code, one gate
 * ---------------------------
 *   · editor — one code per named person, minted and revoked individually.
 *              The uid is `cd-ed-<key>`, so every write in admin/audit and in
 *              app-data/ops-club-directory/audit names who made it. A shared
 *              code would make the audit trail say nothing, and an audit trail
 *              is the whole reason this tool exists rather than people editing
 *              the database by hand.
 *   · reader — one shared code for the whole League, uid `cd-reader`. Read
 *              only; attribution is meaningless and unwanted here.
 *
 * The claim is `dir: 'editor' | 'reader'`, which the RTDB rules enforce
 * against. With plain anonymous auth the token would carry nothing, so the
 * rules could not tell a reader from an editor and anyone who opened the page
 * could rewrite all 72 clubs.
 *
 * Flow (identical to programme.js)
 * --------------------------------
 *   1. Client signs in anonymously (Identity Toolkit — no Cloud Run, so the
 *      org policy does not apply) and writes { code } to authRequests/<uid>.
 *   2. This trigger validates, deletes the request (the code never lingers),
 *      and writes authGrants/<uid> = { ok, customToken, role, name } — or
 *      { ok:false, error }.
 *   3. Client reads the grant, deletes both nodes while it still owns that uid,
 *      then signs in with the custom token.
 *
 * Migration note: when these people are on the portal, this file is deleted.
 * `dir` is replaced by the portal's users/<uid>/role and the rules change from
 * `auth.token.dir === 'editor'` to the portal equivalent. Nothing else moves.
 */
const { onValueWritten } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const ROOT = "app-data/ops-club-directory";

const TRIGGER_OPTS = {
  ref: "/" + ROOT + "/authRequests/{uid}",
  instance: "nl-tools-default-rtdb",
  /* RTDB triggers must run in the database's region (europe-west1), which
     overrides the europe-west2 setGlobalOptions default in index.js. */
  region: "europe-west1",
  memory: "256MiB",
  maxInstances: 10,
  /* Same service account as account.js and programme.js — the gen-2 default
     (compute SA) holds no Firebase roles, so RTDB drops its connection and
     token minting fails. */
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
};

/* Codes are read off a screen and retyped, so match on the normalised form.
   Digits only here, unlike programme's alphanumerics: these are spoken aloud
   over the phone to admin staff, and a six-digit number survives that where
   "is that a B or a D" does not. */
function normCode(s) {
  return String(s == null ? "" : s).replace(/[^0-9]/g, "");
}

/* Constant-time-ish compare — removes the trivial early-exit timing signal.
   A six-digit space is only 10^6, so unlike programme.js the throttle below is
   doing nearly all of the work, not merely bounding a large space. */
function safeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Who does this code belong to? Editors first, then the single reader code.
   An editor record is { name, code, revoked? }; `revoked` is preferred over
   deletion so the audit trail keeps resolving a departed editor's uid to a
   name rather than showing a bare key. */
function pickHolder(cfg, code) {
  const editors = (cfg && cfg.editors) || {};
  const hit = Object.keys(editors).find((k) => {
    const e = editors[k];
    return e && !e.revoked && safeEqual(normCode(e.code), code);
  });
  if (hit) {
    /* `master: true` on an editor record is the only route to the one-shot
       build and to writing the clubs node whole. It has to live in config,
       which no client can read or write, because the alternative was the
       portal admin path — and the people holding these codes have no portal
       account, which is the entire reason this gate exists. As shipped there
       was no way to reach the build at all. */
    return {
      role: editors[hit].master === true ? "admin" : "editor",
      key: hit,
      name: editors[hit].name || hit
    };
  }
  if (cfg && cfg.reader && safeEqual(normCode(cfg.reader.code), code)) {
    return { role: "reader", key: "reader", name: "Reader" };
  }
  return null;
}

/* ---- Throttle ------------------------------------------------------------
   Tighter than programme.js, because the space is very much smaller. A
   six-digit code is 10^6, and at programme's 120 failures per 10 minutes an
   attacker would expect to find a valid code in under two months of
   continuous guessing. That is not an acceptable margin for a tool that can
   rewrite the contact details of 72 clubs, so:

     · per-uid : 5 failures         — an honest mistype does not reach this
     · global  : 30 failures / 10m  — well above a real day of a handful of
                                      admin staff signing in, and it puts an
                                      exhaustive search beyond 60 years

   Every attempt also costs an anonymous signup (itself IP-throttled by
   Identity Toolkit) plus a function invocation. If the global trip fires in
   normal use, look at the audit trail before raising it.

   The honest limit: this is a shared secret typed into a browser, not
   authentication. It is proportionate for a handful of trusted staff editing
   club contact details, and it should not outlive the move to portal accounts. */
const MAX_UID_FAILURES = 5;
const MAX_GLOBAL_FAILURES = 30;
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
/* onValueWritten, not onValueCreated — the request path is keyed on a stable
   uid, so a request left behind by a blip would make every later attempt an
   UPDATE, and onValueCreated would ignore it forever. That is a permanent
   lockout for whoever was unlucky. Deletions are ignored, which keeps it
   loop-safe. Same reasoning as programme.js. */
exports.clubDirectoryAuth = onValueWritten(TRIGGER_OPTS, async (event) => {
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
    /* ---- Portal path: caller is already signed in on the portal --------- */
    /* This is how the bake gets run and how editor codes are minted. Both are
       superadmin-only and neither should need a code of its own. */
    if (req.admin === true) {
      const role = String(
        (await db.ref("users/" + uid + "/role").once("value")).val() || ""
      ).toLowerCase();

      if (role !== "superadmin") {
        logger.warn("clubDirectoryAuth: admin claim refused", { uid, role });
        return grant({ ok: false, error: "Directory administration is superadmin-only." });
      }
      const customToken = await admin.auth()
        .createCustomToken("cd-admin-" + uid, { dir: "admin" });
      logger.info("clubDirectoryAuth: admin granted", { uid });
      return grant({ ok: true, customToken, role: "admin", name: "National League" });
    }

    /* ---- Code path ------------------------------------------------------ */
    if (await throttled(uid)) {
      return grant({
        ok: false,
        error: "Too many incorrect codes. Try again later, or contact the National League.",
      });
    }

    const code = normCode(req.code);
    if (code.length !== 6) return grant({ ok: false, error: "Enter your six-digit code." });

    const cfg = (await db.ref(ROOT + "/config").once("value")).val() || {};
    const hit = pickHolder(cfg, code);

    if (!hit) {
      await noteFailure(uid);
      logger.info("clubDirectoryAuth: code rejected", { uid });
      return grant({ ok: false, error: "Code not recognised." });
    }

    await db.ref(ROOT + "/rate/uid/" + uid).remove().catch(() => {});

    /* One uid per editor, not per device — that is the point of per-person
       codes. The reader shares a single uid, where attribution would be
       meaningless anyway. */
    /* uid stays keyed on the editor, not the granted role, so a master's
       edits still attribute to them by name rather than to a shared admin. */
    const customToken = await admin.auth()
      .createCustomToken("cd-" + (hit.key === "reader" ? "reader" : "ed-" + hit.key),
        { dir: hit.role, dirName: hit.name });

    logger.info("clubDirectoryAuth: granted", { role: hit.role, key: hit.key });
    return grant({ ok: true, customToken, role: hit.role, name: hit.name });
  } catch (err) {
    logger.error("clubDirectoryAuth failed", { uid, message: err && err.message });
    /* Always leave a grant behind — the client waits on this node, and a silent
       failure would hang the gate until its timeout rather than saying so. */
    return grant({ ok: false, error: "Something went wrong. Please try again." });
  }
});
