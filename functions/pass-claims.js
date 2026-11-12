/**
 * NL Tools — a Club card puts the club on the account (passClaims).
 *
 * WHAT THIS IS  (system/permissions-plan.md, step 7, club logins — 12/11/2026)
 * -----------------------------------------------------------------------------
 * Every club-facing page (DAZN, Document Library, Financial Benchmarking, Save
 * of the Month, Commercial Compliance, the Club Directory, the Handbook
 * reader) works the same way: a typed access code is exchanged for a session
 * carrying `club: '<key>'`, and the RTDB rules open that club's data, and
 * nothing else, by comparing the claim to the club's key.
 *
 * Club logins reuse that boundary rather than building a second one: when a
 * person is issued a Club card, the same claims go onto their own account —
 * `club` / `clubName` and the Programme Packs pair `pClub` / `pClubName`, which
 * is exactly what a code holder of that club gets (functions/club-code.js
 * mints both). So a signed-in club person opens every club page without a
 * code, sees only their club, and no rules change. Their pass is their code.
 *
 * WHEN IT RUNS: whenever users/<uid>/pass is written — issued, edited,
 * approved, withdrawn. A League card, no pass, or a club this function cannot
 * find a key for removes the club claims; other custom claims on the account
 * are left alone.
 *
 * THE KEY comes from the same records the code door reads
 * (app-data/club-codes/clubs/<key>.name, or the wrapped config node), matched
 * on the club's name as the pass carries it. No key, no claim: logged, never
 * guessed.
 *
 * NOT INSTANT: a claim reaches the browser at the next token refresh (up to an
 * hour), or at once when NL.codeGate.resume asks for a fresh token, which it
 * does for a signed-in account that has no club claim yet (nl-utils v1.55).
 */
const { onValueWritten } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const CODES = "app-data/club-codes";
const CLUB_CLAIMS = ["club", "clubName", "pClub", "pClubName"];

const OPTS = {
  ref: "/users/{uid}/pass",
  instance: "nl-tools-default-rtdb",
  /* RTDB triggers run in the database's region, as club-code.js explains. */
  region: "europe-west1",
  memory: "256MiB",
  maxInstances: 10,
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
};

/* The club's key, by name. Trimmed and case-folded on both sides, because the
   pass carries the clubs-meta name and the codes records were typed. */
function clubKeyFor(name, clubs) {
  const want = String(name == null ? "" : name).trim().toLowerCase();
  if (!want) return null;
  const keys = Object.keys(clubs || {});
  for (let i = 0; i < keys.length; i++) {
    const rec = clubs[keys[i]];
    if (rec && String(rec.name || "").trim().toLowerCase() === want) return keys[i];
  }
  return null;
}

/* The account's custom claims after this pass: every other claim kept, the
   four club claims replaced — set from an issued Club card whose club has a
   key, removed otherwise. */
function nextClaims(existing, pass, clubs) {
  const out = Object.assign({}, existing || {});
  CLUB_CLAIMS.forEach((k) => { delete out[k]; });
  if (!pass || !pass.issued || pass.base !== "club") return out;
  const name = String(pass.club || "").trim();
  const key = clubKeyFor(name, clubs);
  if (!key) return out;
  out.club = key; out.clubName = name;
  out.pClub = key; out.pClubName = name;
  return out;
}

function sameClaims(a, b) {
  const ka = Object.keys(a || {}).sort(), kb = Object.keys(b || {}).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i] || a[ka[i]] !== b[kb[i]]) return false;
  }
  return true;
}

async function readClubs(db) {
  const direct = (await db.ref(CODES + "/clubs").once("value")).val();
  if (direct) return direct;
  const wrapped = (await db.ref(CODES + "/config").once("value")).val();
  return (wrapped && wrapped.clubs) || {};
}

exports.passClaims = onValueWritten(OPTS, async (event) => {
  const uid = event.params.uid;
  const after = event.data && event.data.after;
  const pass = after && after.exists() ? after.val() : null;

  let user;
  try {
    user = await admin.auth().getUser(uid);
  } catch (err) {
    logger.warn("passClaims: no sign-in account for this pass", { uid, message: err && err.message });
    return;
  }

  const clubs = await readClubs(admin.database());
  const before = user.customClaims || {};
  const next = nextClaims(before, pass, clubs);
  if (sameClaims(before, next)) return;

  if (pass && pass.base === "club" && !next.club) {
    /* The club's name only, never the person: logs on this project are read by
       more people than the database is. */
    logger.warn("passClaims: no club key for this Club card", { club: String(pass.club || "") });
  }
  await admin.auth().setCustomUserClaims(uid, Object.keys(next).length ? next : null);
  logger.info("passClaims: club claims " + (next.club ? "set" : "cleared"), { uid, club: next.club || null });
});

