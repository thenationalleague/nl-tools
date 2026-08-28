/**
 * NL Tools — Brand Exposure ingest key → scoped claim (RTDB-triggered).
 *
 *   brandExposureIngest — an RTDB trigger on
 *                         app-data/ops-brand-exposure/ingestRequests/{uid}.
 *                         Validates an ingest key with the Admin SDK and writes
 *                         back a Firebase custom token carrying a `be` claim
 *                         naming the ONE match that token may write.
 *
 * What this is for
 * ----------------
 * board-exposure-match.py measures a match on a laptop and produces three
 * files: the summary, the detections, and a playback proxy. Before this, a
 * person then opened nl.tools and uploaded all three by hand. The scan already
 * knew it had finished; the second visit existed only because the script had no
 * way to authenticate. This gives it one.
 *
 * Why a trigger and not a callable
 * --------------------------------
 * The same org policy programme.js hit on 03/08/2026 blocks `allUsers` on new
 * Cloud Run services, so a new callable cannot be given a public invoker. The
 * RTDB-triggered path is the org-policy-proof alternative, and this is
 * deliberately the same shape as programme.js, club-directory.js and
 * fan-widgets.js — anyone who has read one has read all four.
 *
 * Anonymous sign-in goes through Identity Toolkit, not Cloud Run, so the policy
 * does not touch it. That is the whole reason the script can get a foot in the
 * door with no Google account and no service-account key on the laptop.
 *
 * Why a claim rather than a signed upload URL
 * -------------------------------------------
 * Signed URLs were the other option and would have meant the function calling
 * getSignedUrl, which needs the runtime service account to hold
 * roles/iam.serviceAccountTokenCreator on itself so it can reach IAM SignBlob.
 * That is a permission this project has never needed and would have to be
 * granted by hand in a console — and the whole point of the deployment story
 * here is that nothing needs a console. Minting a scoped custom token uses
 * only what three other functions in this directory already do.
 *
 * Scope: one token, one match
 * ---------------------------
 * The claim is `be: <matchId>`, not `be: true`. Storage and RTDB rules compare
 * it against the path being written, so a token leaked off a laptop can
 * overwrite the match it was minted for and nothing else — not another match,
 * not another tool, not the registry. The matchId is fixed at mint time from
 * the request, so a script cannot widen its own grant afterwards.
 *
 * Keys are stored hashed
 * ----------------------
 * Unlike the six-digit codes in club-directory.js — which are read aloud down a
 * phone and so cannot be long — an ingest key is pasted into a config file once
 * and never spoken. That buys real entropy (192 bits), which in turn means the
 * stored form can be a SHA-256 hash rather than the key itself. Nobody can read
 * a working key back out of the database, including a superadmin; the plaintext
 * is shown once at mint and then it is gone. `revoked` is preferred to deletion
 * so an audit line still resolves to who was using it.
 *
 * Flow
 * ----
 *   1. Script signs in anonymously (Identity Toolkit) and writes
 *      { key, matchId } to ingestRequests/<uid>.
 *   2. This trigger validates, deletes the request (the key never lingers), and
 *      writes ingestGrants/<uid> = { ok, customToken, matchId } — or
 *      { ok:false, error }.
 *   3. Script reads the grant and deletes it WHILE IT STILL OWNS THAT UID —
 *      the custom token signs it in as `be-<keyId>`, a different uid, and from
 *      that moment the rules will not let it tidy up after itself. Then it
 *      swaps tokens, uploads proxy.mp4 and detections.json to Storage, and
 *      writes the match record to RTDB.
 *
 * The portal path ({ admin: true }) mints and revokes keys, and is superadmin
 * only. It exists here rather than in the tool page because the key config is
 * deliberately unreadable and unwritable by every client — see the rules.
 */
const { onValueWritten } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");

const ROOT = "app-data/ops-brand-exposure";

const TRIGGER_OPTS = {
  ref: "/" + ROOT + "/ingestRequests/{uid}",
  instance: "nl-tools-default-rtdb",
  /* RTDB triggers must run in the database's region (europe-west1), which
     overrides the europe-west2 setGlobalOptions default in index.js. */
  region: "europe-west1",
  memory: "256MiB",
  maxInstances: 10,
  /* Same service account as account.js, programme.js and club-directory.js —
     the gen-2 default (compute SA) holds no Firebase roles, so RTDB drops its
     connection and token minting fails. */
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
};

/* 24 bytes → 32 base64url characters, 192 bits. Long enough that the throttle
   below is a courtesy rather than the thing holding the door shut, which is the
   opposite of club-directory.js and is entirely down to this key never having
   to be read aloud. */
const KEY_BYTES = 24;

function newKey() {
  return crypto.randomBytes(KEY_BYTES).toString("base64url");
}

function hashKey(k) {
  return crypto.createHash("sha256").update(String(k || ""), "utf8").digest("hex");
}

/* Both operands are fixed-length hex digests here, so timingSafeEqual never
   sees a length mismatch in practice — the length guard is for a malformed
   stored record, not for an attacker, who cannot vary the digest length. */
function safeEqualHex(a, b) {
  const x = Buffer.from(String(a || ""), "utf8");
  const y = Buffer.from(String(b || ""), "utf8");
  if (x.length !== y.length || x.length === 0) return false;
  return crypto.timingSafeEqual(x, y);
}

/* A matchId reaches Storage as a path segment and RTDB as a child key, so it is
   validated before it is put in a claim, not after. The script derives it from
   the fixture, which means it is attacker-influenced in the sense that whoever
   holds a key chooses it — bounded charset and length is what stops that being
   a path-traversal or a way to write somewhere structural. */
const MATCH_ID = /^[a-z0-9][a-z0-9-]{2,120}$/;

function validMatchId(s) {
  return typeof s === "string" && MATCH_ID.test(s) && s.indexOf("--") === -1;
}

/* ---- Throttle ------------------------------------------------------------
   Deliberately looser than club-directory.js, and for a stated reason: that
   door guards a six-digit space where the throttle is doing nearly all of the
   work. A 192-bit key cannot be found by guessing, so this exists to stop a
   broken script hammering the trigger, not to hold off a search. */
const MAX_UID_FAILURES = 10;
const MAX_GLOBAL_FAILURES = 100;
const GLOBAL_WINDOW_MS = 10 * 60 * 1000;

async function throttled(uid) {
  const db = admin.database();
  const [uidSnap, globalSnap] = await Promise.all([
    db.ref(ROOT + "/rate/uid/" + uid).once("value"),
    db.ref(ROOT + "/rate/global").once("value"),
  ]);
  if ((uidSnap.val() || 0) >= MAX_UID_FAILURES) return true;
  const g = globalSnap.val();
  if (g && Date.now() - (g.first || 0) <= GLOBAL_WINDOW_MS &&
      (g.n || 0) >= MAX_GLOBAL_FAILURES) {
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
      if (Date.now() - (cur.first || 0) > GLOBAL_WINDOW_MS) {
        return { n: 1, first: Date.now() };
      }
      cur.n = (cur.n || 0) + 1;
      return cur;
    }),
  ]);
}

/* Which key is this? Returns { keyId, label } or null. Every stored record is
   { label, hash, created, revoked?, lastUsed? } — never the key itself. */
function pickKey(keys, presented) {
  const h = hashKey(presented);
  const hit = Object.keys(keys || {}).find((k) => {
    const rec = keys[k];
    return rec && !rec.revoked && safeEqualHex(rec.hash, h);
  });
  return hit ? { keyId: hit, label: keys[hit].label || hit } : null;
}

/* ---- Superadmin key management ------------------------------------------
   Mint and revoke live here rather than in the tool page because config is
   readable and writable by nobody through the rules — the Admin SDK is the
   only way in, by design. A key that a client could read out of the database
   would not be a key. */
async function handleAdmin(uid, req, grant) {
  const db = admin.database();
  const role = String(
    (await db.ref("users/" + uid + "/role").once("value")).val() || ""
  ).toLowerCase();

  if (role !== "superadmin") {
    logger.warn("brandExposureIngest: admin action refused", { uid, role });
    return grant({ ok: false, error: "Ingest keys are superadmin-only." });
  }

  const action = String(req.action || "");

  if (action === "mint") {
    const label = String(req.label || "").trim().slice(0, 60);
    if (!label) return grant({ ok: false, error: "Name the key so it can be revoked later." });

    const key = newKey();
    const keyId = db.ref(ROOT + "/config/keys").push().key;
    await db.ref(ROOT + "/config/keys/" + keyId).set({
      label,
      hash: hashKey(key),
      created: admin.database.ServerValue.TIMESTAMP,
      createdBy: uid,
    });
    logger.info("brandExposureIngest: key minted", { keyId, label });
    /* The only time the plaintext exists outside the laptop it is going to.
       The grant node is readable by this uid alone and the client deletes it
       as soon as it has shown the key. */
    return grant({ ok: true, action: "mint", keyId, label, key });
  }

  if (action === "revoke") {
    const keyId = String(req.keyId || "");
    if (!keyId) return grant({ ok: false, error: "No key named." });
    /* Revoked, not deleted: a deleted key leaves audit lines pointing at a bare
       id, and the question "who uploaded that?" is exactly what gets asked. */
    await db.ref(ROOT + "/config/keys/" + keyId + "/revoked").set(true);
    logger.info("brandExposureIngest: key revoked", { keyId });
    return grant({ ok: true, action: "revoke", keyId });
  }

  if (action === "list") {
    /* Metadata only — no hashes leave this function. The tool needs to show
       what exists so it can be revoked; it never needs the stored form. */
    const keys = (await db.ref(ROOT + "/config/keys").once("value")).val() || {};
    const out = {};
    Object.keys(keys).forEach((k) => {
      out[k] = {
        label: keys[k].label || k,
        created: keys[k].created || null,
        lastUsed: keys[k].lastUsed || null,
        revoked: keys[k].revoked === true,
      };
    });
    return grant({ ok: true, action: "list", keys: out });
  }

  return grant({ ok: false, error: "Unknown action." });
}

/* ---- The trigger --------------------------------------------------------- */
/* onValueWritten, not onValueCreated — the request path is keyed on a stable
   uid, so a request left behind by a blip would make every later attempt an
   UPDATE, and onValueCreated would ignore it forever. Deletions are ignored,
   which keeps it loop-safe. Same reasoning as club-directory.js. */
exports.brandExposureIngest = onValueWritten(TRIGGER_OPTS, async (event) => {
  const uid = event.params.uid;
  const after = event.data && event.data.after;
  if (!after || !after.exists()) return;   // our own delete, or a clear
  const req = after.val() || {};
  const db = admin.database();

  /* Delete the request first, whatever happens next: it carries a key in plain
     text and there is no reason for it to outlive this invocation. */
  await db.ref(ROOT + "/ingestRequests/" + uid).remove().catch(() => {});

  const grant = (payload) => db.ref(ROOT + "/ingestGrants/" + uid).set(payload);

  try {
    if (req.admin === true) return handleAdmin(uid, req, grant);

    if (await throttled(uid)) {
      return grant({ ok: false, error: "Too many failed attempts. Try again later." });
    }

    const matchId = String(req.matchId || "");
    if (!validMatchId(matchId)) {
      /* Ahead of noteFailure on purpose: a malformed id is a bug in the script,
         not a guess at a key, and it should not eat the caller's budget. */
      return grant({ ok: false, error: "That match id is not a valid one." });
    }

    const keys = (await db.ref(ROOT + "/config/keys").once("value")).val() || {};
    const hit = pickKey(keys, req.key);

    if (!hit) {
      await noteFailure(uid);
      logger.info("brandExposureIngest: key rejected", { uid });
      return grant({ ok: false, error: "That ingest key is not recognised, or has been revoked." });
    }

    await db.ref(ROOT + "/rate/uid/" + uid).remove().catch(() => {});
    await db.ref(ROOT + "/config/keys/" + hit.keyId + "/lastUsed")
      .set(admin.database.ServerValue.TIMESTAMP).catch(() => {});

    /* uid keyed on the key, not on the anonymous session, so every write and
       every audit line resolves to the machine that holds it rather than to a
       different throwaway uid each run. */
    const customToken = await admin.auth().createCustomToken("be-" + hit.keyId, {
      be: matchId,
      beKey: hit.keyId,
      beLabel: hit.label,
    });

    logger.info("brandExposureIngest: granted", { keyId: hit.keyId, matchId });
    return grant({ ok: true, customToken, matchId, label: hit.label });
  } catch (err) {
    logger.error("brandExposureIngest failed", { uid, message: err && err.message });
    /* Always leave a grant behind — the script waits on this node, and a silent
       failure would hang it until its timeout rather than saying so. */
    return grant({ ok: false, error: "Something went wrong. Please try again." });
  }
});

/* Exported for tests. */
exports._internals = { hashKey, newKey, pickKey, validMatchId, safeEqualHex };
