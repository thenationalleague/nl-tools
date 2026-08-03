/**
 * NL Tools — Programme Packs callables (server-validated passcodes → scoped claims).
 *
 *   programmeEnter  — a club (or the NL commercial code) exchanges its passcode
 *                     for a Firebase custom token carrying a `pClub` claim.
 *   programmeClaim  — a signed-in portal admin/superadmin exchanges their portal
 *                     session for a custom token carrying `pClub: '*'`.
 *
 * Why this exists at all
 * ----------------------
 * /programme is a pre-portal stopgap: clubs get in with a 6-character passcode,
 * not a portal account. The obvious shortcut — validate the passcode in the
 * browser and sign in anonymously — is what /uw-promo/ does, and it means the
 * anonymous token carries NO club identity. Storage Rules then cannot tell FGR
 * from Barnet, so "a club may only write its own folder" would be enforced by
 * the UI alone: anyone holding any club's code could open devtools and write
 * (or delete) all 72 folders.
 *
 * Here the passcode is checked server-side by the Admin SDK and the answer is
 * baked into the token as `pClub`. Storage Rules and RTDB rules then enforce
 * write-own for real. The passcodes themselves are never readable by a client —
 * app-data/media-programme/config is closed to everyone except a `pClub: '*'`
 * session (the admin console).
 *
 * Migration note: when /programme moves behind the portal, this whole file is
 * deleted. `pClub` is replaced by the portal's `users/<uid>/club` and the rules
 * change from `auth.token.pClub === $club` to the portal equivalent — nothing
 * else moves, because the Storage paths are keyed on the same clubs-meta code
 * the portal uses. See programme/README.md.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const CALL_OPTS = {
  cors: ["https://nl.tools", "https://thenationalleague.github.io"],
  memory: "256MiB",
  maxInstances: 5,
  /* Same service account as account.js — the gen-2 default (compute SA) holds
     no Firebase roles, so RTDB drops its connection and token minting fails. */
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
};

const ROOT = "app-data/media-programme";

/* Passcodes are generated from an unambiguous alphabet (no 0/O/1/I/L) and are
   retyped by humans off a printed card, so match on the normalised form:
   uppercase, alphanumerics only. A pasted "fyl 4k2m" still matches "FYL4K2M". */
function normCode(s) {
  return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* Constant-time-ish string compare. The passcode space (31^6 ≈ 887M) plus the
   rate limiter below is the real defence; this just removes the trivial
   early-exit timing signal from the comparison itself. */
function safeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---- Rate limiting -------------------------------------------------------
   Callers are unauthenticated by definition, so the only handle we have is the
   source IP. 20 failed attempts per hour per IP: generous for a club retyping a
   card off a bad photocopy, useless for enumerating an 887M-key space. Counters
   live under a node no client can read or write (Admin SDK bypasses rules). */
const MAX_FAILURES = 20;
const WINDOW_MS = 60 * 60 * 1000;

function rateKey(request) {
  const raw = (request.rawRequest && (request.rawRequest.ip || "")) || "unknown";
  // RTDB keys may not contain . # $ / [ ] — and IPv6 brings colons.
  return raw.replace(/[.#$/\[\]:]/g, "_").slice(0, 80) || "unknown";
}

async function checkRate(key) {
  const snap = await admin.database().ref(ROOT + "/rate/" + key).once("value");
  const rec = snap.val();
  if (!rec) return;
  if (Date.now() - (rec.first || 0) > WINDOW_MS) return;   // window expired
  if ((rec.n || 0) >= MAX_FAILURES) {
    throw new HttpsError(
      "resource-exhausted",
      "Too many incorrect passcodes. Try again in an hour, or contact the National League."
    );
  }
}

async function noteFailure(key) {
  const ref = admin.database().ref(ROOT + "/rate/" + key);
  await ref.transaction((cur) => {
    if (cur === null) return { n: 1, first: Date.now() };
    if (Date.now() - (cur.first || 0) > WINDOW_MS) return { n: 1, first: Date.now() };
    cur.n = (cur.n || 0) + 1;
    return cur;
  });
}

function clearRate(key) {
  return admin.database().ref(ROOT + "/rate/" + key).remove().catch(() => {});
}

/* ---- programmeEnter ------------------------------------------------------
   Input : { code, token? }   token = the ?c= link token, when the club arrived
                              by their direct link. It only narrows the search —
                              the passcode is always required.
   Output: { customToken, club: { code, name, division }, isNL } */
exports.programmeEnter = onCall(CALL_OPTS, async (request) => {
  const data = request.data || {};
  const code = normCode(data.code);
  const linkToken = String(data.token || "").trim().slice(0, 40);

  if (code.length < 4) {
    throw new HttpsError("invalid-argument", "Enter your passcode.");
  }

  const rk = rateKey(request);
  await checkRate(rk);

  const db = admin.database();
  const cfg = (await db.ref(ROOT + "/config").once("value")).val() || {};
  const clubs = cfg.clubs || {};

  /* Candidate set. With a link token we only compare against that one entry, so
     a club's passcode can't open a different club's folder even if two codes
     ever collided. Without a token, the passcode alone identifies the club. */
  let candidates;
  if (linkToken) {
    candidates = Object.keys(clubs)
      .filter((k) => clubs[k] && clubs[k].token === linkToken)
      .map((k) => ({ key: k, rec: clubs[k] }));
    if (cfg.nl && cfg.nl.token === linkToken) candidates.push({ key: "NL", rec: cfg.nl });
  } else {
    candidates = Object.keys(clubs).map((k) => ({ key: k, rec: clubs[k] }));
    if (cfg.nl) candidates.push({ key: "NL", rec: cfg.nl });
  }

  const hit = candidates.find((c) => c.rec && safeEqual(normCode(c.rec.passcode), code));

  if (!hit) {
    await noteFailure(rk);
    throw new HttpsError("permission-denied", "Passcode not recognised.");
  }
  await clearRate(rk);

  /* One uid per club, not per person: everyone at a club shares `pp-<CODE>`.
     Attribution is at club level anyway (that is all a shared passcode can
     honestly support), and it keeps the Auth user list at 73 rows rather than
     one per device. */
  const uid = "pp-" + hit.key;
  const customToken = await admin.auth().createCustomToken(uid, { pClub: hit.key });

  logger.info("programmeEnter", { club: hit.key, viaLink: !!linkToken });

  return {
    customToken,
    isNL: hit.key === "NL",
    club: {
      code: hit.key,
      name: hit.rec.name || (hit.key === "NL" ? "National League" : hit.key),
      division: hit.rec.division || "",
    },
  };
});

/* ---- programmeClaim ------------------------------------------------------
   The admin console at /programme/admin/ is behind auth-guard (portal login).
   It calls this with its portal session to get a `pClub: '*'` token, which it
   uses to sign into the NAMED Firebase app — so the portal session itself is
   never modified and no custom claims are written onto real user accounts.
   Output: { customToken } */
exports.programmeClaim = onCall(CALL_OPTS, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const uid = request.auth.uid;

  const role = String(
    ((await admin.database().ref("users/" + uid + "/role").once("value")).val()) || ""
  ).toLowerCase();

  if (role !== "admin" && role !== "superadmin") {
    throw new HttpsError("permission-denied", "Programme Packs administration is admin-only.");
  }

  /* Distinct uid per admin so the audit trail names the individual, unlike the
     shared club uids above. */
  const customToken = await admin.auth().createCustomToken("pp-admin-" + uid, { pClub: "*" });
  logger.info("programmeClaim", { uid, role });
  return { customToken };
});
