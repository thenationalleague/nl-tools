/**
 * NL Tools — Broadcast Selections access code → viewer claim (RTDB-triggered).
 *
 *   broadcastSelectionsAuth — trigger on
 *     app-data/pub-broadcast-selections/authRequests/{uid}
 *
 * The travel-for-broadcast-fixtures page (/broadcast-selections/) is reachable
 * only by URL and gated by a handful of access codes — one per audience, so a
 * code can be revoked without disturbing the others. Codes live at
 *
 *   app-data/pub-broadcast-selections/config/codes/<CODE> = "<audience name>"
 *                                            (or { name, revoked? } for revocation)
 *
 * — the CODE itself is the node key, uppercase A–Z0–9 — readable by no client.
 * A plain string value keeps console entry to one key/value pair per code;
 * swap it for { name, revoked: true } to switch a code off without deleting
 * its history.
 * This trigger checks a typed code with the Admin SDK and mints a custom token
 * carrying { bsel: 'viewer', bselName: <name> }; the page resumes on the
 * `bsel` claim so a code is typed once per browser, not per visit.
 *
 * Deliberately the same shape as uw-promo.js / programme.js /
 * club-directory.js — read one, read all four. Same org-policy reason for an
 * RTDB trigger rather than a callable (public invokers are blocked on new
 * Cloud Run services and code holders have no Google account); same
 * request/grant handshake driven by NL.codeGate.viaFunction; same uid and
 * global throttles. No per-audience throttle is needed here: a 6-character
 * A–Z0–9 space behind the global ceiling is ample for a two-code roster.
 */
const { onValueWritten } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const ROOT = "app-data/pub-broadcast-selections";

const TRIGGER_OPTS = {
  ref: "/" + ROOT + "/authRequests/{uid}",
  instance: "nl-tools-default-rtdb",
  /* RTDB triggers must run in the database's region (europe-west1), which
     overrides the europe-west2 setGlobalOptions default in index.js. */
  region: "europe-west1",
  memory: "256MiB",
  maxInstances: 10,
  /* Same service account as the rest of the family — the gen-2 default
     (compute SA) holds no Firebase roles, so RTDB drops its connection and
     token minting fails. */
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
};

function normCode(s) {
  return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* Constant-time-ish compare — removes the trivial early-exit timing signal.
   The throttle below is the real defence. */
function safeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const MAX_UID_FAILURES = 10;
const MAX_GLOBAL_FAILURES = 120;
const GLOBAL_WINDOW_MS = 10 * 60 * 1000;

function windowed(cur, windowMs, max) {
  if (!cur) return false;
  if (Date.now() - (cur.first || 0) > windowMs) return false;
  return (cur.n || 0) >= max;
}

async function throttled(uid) {
  const db = admin.database();
  const [uidSnap, globalSnap] = await Promise.all([
    db.ref(ROOT + "/rate/uid/" + uid).once("value"),
    db.ref(ROOT + "/rate/global").once("value"),
  ]);
  if ((uidSnap.val() || 0) >= MAX_UID_FAILURES) return true;
  return windowed(globalSnap.val(), GLOBAL_WINDOW_MS, MAX_GLOBAL_FAILURES);
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

/* onValueWritten, not onValueCreated — same reasoning as uw-promo.js: the
   request path is keyed on a stable uid, so a request left behind by a blip
   would make every later attempt an UPDATE, which onValueCreated ignores
   forever. Deletions are ignored, which keeps it loop-safe. */
exports.broadcastSelectionsAuth = onValueWritten(TRIGGER_OPTS, async (event) => {
  const uid = event.params.uid;
  const after = event.data && event.data.after;
  if (!after || !after.exists()) return;    // our own delete — nothing to do
  const req = after.val() || {};
  const db = admin.database();

  /* Delete the request first, whatever happens next: it carries a code in
     plain text and has no reason to outlive this invocation. */
  await db.ref(ROOT + "/authRequests/" + uid).remove().catch(() => {});
  const grant = (payload) => db.ref(ROOT + "/authGrants/" + uid).set(payload);

  try {
    const code = normCode(req.code);
    if (code.length !== 6) return grant({ ok: false, error: "Enter your 6-character code." });

    if (await throttled(uid)) {
      return grant({
        ok: false,
        error: "Too many incorrect attempts. Try again later, or contact the National League.",
      });
    }

    const codes = (await db.ref(ROOT + "/config/codes").once("value")).val() || {};
    const key = Object.keys(codes).find(
      (k) => codes[k] && !(codes[k] && codes[k].revoked) && safeEqual(normCode(k), code)
    );

    if (!key) {
      await noteFailure(uid);
      logger.info("broadcastSelectionsAuth: rejected", { uid });
      return grant({ ok: false, error: "Code not recognised." });
    }

    await db.ref(ROOT + "/rate/uid/" + uid).remove().catch(() => {});
    const rec = codes[key];
    const name = (typeof rec === "string" ? rec : rec && rec.name) || "Viewer";
    /* One uid per code, not per person — attribution is at audience level,
       which is all a shared code can honestly support. */
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "viewer";
    const customToken = await admin.auth().createCustomToken(
      "bsel-" + slug, { bsel: "viewer", bselName: name }
    );
    logger.info("broadcastSelectionsAuth: granted", { name });
    return grant({ ok: true, customToken, role: "viewer", name });
  } catch (err) {
    logger.error("broadcastSelectionsAuth failed", { uid, message: err && err.message });
    /* Always leave a grant behind — the client waits on this node, and a
       silent failure would hang the gate until its timeout. */
    return grant({ ok: false, error: "Something went wrong. Please try again." });
  }
});

exports._internals = { normCode, safeEqual, ROOT };
