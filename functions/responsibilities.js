/**
 * NL Tools — Responsibilities viewer code → read-only claim (RTDB-triggered).
 *
 *   responsibilitiesAuth — an RTDB trigger on
 *                          app-data/media-responsibilities/authRequests/{uid}.
 *                          Validates a six-digit viewer code with the Admin
 *                          SDK and writes back a Firebase custom token
 *                          carrying `resp: 'viewer'`.
 *
 * WHAT IT IS FOR
 * --------------
 * /responsibilities/view/ shows the department's responsibilities map to
 * named people who have no portal account. Each has their own code, so one
 * can be cut off without re-issuing the rest. The claim opens people/ and
 * functions/ for READING and nothing else — the rules keep every write
 * superadmin-only — and it opens no other tool.
 *
 * WHERE THE CODES LIVE  (never client-readable)
 * --------------------------------------------
 *   app-data/media-responsibilities/config/viewers/<key> =
 *       { name: "Their name", code: "123456", revoked?: true }
 *
 * Added by hand in the Firebase console, deliberately: a handful of people,
 * changed rarely, by the one person who maintains the tool. `<key>` is any
 * short id (letters, digits, dashes) and becomes the viewer's uid as
 * `rp-<key>`, so keep it stable — renaming the key gives the person a new
 * identity. Set `revoked: true` rather than deleting, so an old uid still
 * resolves to a name.
 *
 * REVOCATION IS NOT INSTANT. A custom claim lives in the token until it
 * refreshes — up to an hour. Revoking stops the NEXT sign-in, not a session
 * already open.
 *
 * WHY A TRIGGER AND NOT A CALLABLE
 * --------------------------------
 * The project's org policy blocks `allUsers` invokers on new Cloud Run
 * services, so a callable cannot be reached by someone with no Google
 * account. An RTDB trigger is invoked by the database, not the visitor:
 *   1. the page signs in anonymously and writes { code, at } to
 *      authRequests/<uid> (NL.codeGate.viaFunction does this);
 *   2. this trigger validates, deletes the request so a code never lingers,
 *      and writes authGrants/<uid> = { ok, customToken, role, name } — or
 *      { ok:false, error };
 *   3. the page reads the grant, deletes both nodes while it still owns that
 *      uid, then signs in with the custom token.
 */
const { onValueWritten } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const ROOT = "app-data/media-responsibilities";

const TRIGGER_OPTS = {
  ref: "/" + ROOT + "/authRequests/{uid}",
  instance: "nl-tools-default-rtdb",
  /* RTDB triggers must run in the database's region (europe-west1), which
     overrides the europe-west2 setGlobalOptions default in index.js. */
  region: "europe-west1",
  memory: "256MiB",
  maxInstances: 5,
  /* The gen-2 default (compute SA) holds no Firebase roles, so RTDB drops its
     connection and token minting fails. Same account as every other
     passcode function in this directory. */
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
};

/* Six digits, typed from a message. Anything that is not a digit is noise
   (a space, a dash someone added for readability) and is dropped. */
function normCode(s) {
  return String(s == null ? "" : s).replace(/[^0-9]/g, "");
}

/* Length-first equality that does not exit early on content. */
function safeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Whose code is this? Fails closed: a blank typed code matches nothing, and
   a record with a blank or missing code is matched by nothing — otherwise a
   half-entered record would open for anyone submitting an empty string. A
   key that would make an unsafe uid is skipped rather than trusted. */
function pickViewer(viewers, code) {
  if (!code) return null;
  const all = viewers || {};
  const key = Object.keys(all).find((k) => {
    const v = all[k];
    if (!v || v.revoked) return false;
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(k)) return false;
    const stored = normCode(v.code);
    return stored !== "" && safeEqual(stored, code);
  });
  return key ? { key, name: String(all[key].name || key) } : null;
}

/* ---- Throttle ------------------------------------------------------------
   A six-digit space is 10^6, so the throttle does nearly all the work:
     · per-uid : 5 failures         — an honest mistype never reaches it
     · global  : 30 failures / 10m  — far above a few viewers signing in,
                                      and it puts an exhaustive search
                                      beyond any useful timescale
   Every attempt also costs an anonymous sign-up (IP-throttled by Identity
   Toolkit) and a function invocation. */
const MAX_UID_FAILURES = 5;
const MAX_GLOBAL_FAILURES = 30;
const GLOBAL_WINDOW_MS = 10 * 60 * 1000;

async function throttled(db, uid) {
  const [uidSnap, globalSnap] = await Promise.all([
    db.ref(ROOT + "/rate/uid/" + uid).once("value"),
    db.ref(ROOT + "/rate/global").once("value"),
  ]);
  if ((uidSnap.val() || 0) >= MAX_UID_FAILURES) return true;
  const g = globalSnap.val();
  return !!(g && Date.now() - (g.first || 0) <= GLOBAL_WINDOW_MS &&
    (g.n || 0) >= MAX_GLOBAL_FAILURES);
}

async function noteFailure(db, uid) {
  await Promise.all([
    db.ref(ROOT + "/rate/uid/" + uid).transaction((n) => (n || 0) + 1),
    db.ref(ROOT + "/rate/global").transaction((cur) => {
      if (cur === null || Date.now() - (cur.first || 0) > GLOBAL_WINDOW_MS) {
        return { n: 1, first: Date.now() };
      }
      cur.n = (cur.n || 0) + 1;
      return cur;
    }),
  ]);
}

/* onValueWritten, not onValueCreated: the request path is keyed on a stable
   uid, so a request left behind by a blip makes every later attempt an
   UPDATE, which onValueCreated would ignore for ever. Deletions are ignored,
   which keeps it loop-safe. */
exports.responsibilitiesAuth = onValueWritten(TRIGGER_OPTS, async (event) => {
  const uid = event.params.uid;
  const after = event.data && event.data.after;
  if (!after || !after.exists()) return;   // our own delete, or a clear
  const req = after.val() || {};
  const db = admin.database();

  /* Delete the request first, whatever happens next: it carries a code in
     plain text and has no reason to outlive this invocation. */
  await db.ref(ROOT + "/authRequests/" + uid).remove().catch(() => {});

  const grant = (payload) => db.ref(ROOT + "/authGrants/" + uid).set(payload);

  try {
    if (await throttled(db, uid)) {
      return grant({ ok: false, error: "Too many incorrect codes. Try again later." });
    }

    const code = normCode(req.code);
    /* A malformed length is a typo, not a guess, so it is not counted. */
    if (code.length !== 6) return grant({ ok: false, error: "Code not recognised." });

    const viewers = (await db.ref(ROOT + "/config/viewers").once("value")).val() || {};
    const hit = pickViewer(viewers, code);

    if (!hit) {
      await noteFailure(db, uid);
      /* Never log the code, on the rejected path least of all. */
      logger.info("responsibilitiesAuth: code rejected", { uid });
      return grant({ ok: false, error: "Code not recognised." });
    }

    await db.ref(ROOT + "/rate/uid/" + uid).remove().catch(() => {});

    /* One uid per viewer, so a session is theirs and nobody else's. The name
       rides in the claims as respName — the shape NL.codeGate.resume reads —
       so a returning visitor's bar still knows who they are. */
    const customToken = await admin.auth().createCustomToken("rp-" + hit.key, {
      resp: "viewer", respName: hit.name,
    });

    /* The key, not the name: the name is the person's, and the key already
       answers every question this log is asked. */
    logger.info("responsibilitiesAuth: granted", { key: hit.key });
    return grant({ ok: true, customToken, role: "viewer", name: hit.name });
  } catch (err) {
    logger.error("responsibilitiesAuth failed", { uid, message: err && err.message });
    /* Always leave a grant behind — the page waits on this node, and a silent
       failure would hang the gate until its timeout. */
    return grant({ ok: false, error: "Something went wrong. Please try again." });
  }
});
