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
 * PROGRAMME PACKS WRITES (13/11/2026): `pClub` lets a session READ its club's
 * library; uploading, moving and deleting also need `pManage`. A club code
 * mints it (codes keep Manage, Richard 13/11/2026); a Club card gets it only
 * when the pass gives Manage on Programme Packs (the club Media key, by the
 * registry's grants), so the rest of a club's people read without writing.
 * Worked out with the door's own resolver (NL.pass, functions/canon.js). A
 * change to Programme Packs' grants in Access re-runs this for every Club card
 * (programmeClaims, below).
 *
 * NOT INSTANT: a claim reaches the browser at the next token refresh (up to an
 * hour), or at once when NL.codeGate.resume asks for a fresh token, which it
 * does for a signed-in account that has no club claim yet (nl-utils v1.55).
 *
 * THE LEAGUE MARK (14/11/2026): `league: true` on every League account, the
 * one the file rules ask for (system/storage/rules.snapshot.rules). They
 * used to ask for an email address, which every account has, including
 * anyone who signs up. Who is League is NL.accountLevel.isLeague, the
 * door's own answer (the pass's card, or with no pass a League role), and
 * never someone waiting for approval or declined. Worked out from the
 * account's record as it stands, read fresh, so the three triggers below
 * that can fire together all come to the same claims:
 *   passClaims   users/<uid>/pass written
 *   leagueClaims users/<uid>/role written (approval, decline, role edits)
 *   claimsRefresh admin/claims-refresh written, by Button · Refresh account
 *                marks: every account, once (the first time, and whenever
 *                in doubt)
 */
const { onValueWritten } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const CODES = "app-data/club-codes";
const CLUB_CLAIMS = ["club", "clubName", "pClub", "pClubName", "pManage"];

/* The League mark, set or removed from the account's whole record. */
function withLeague(claims, league) {
  const out = Object.assign({}, claims || {});
  delete out.league;
  if (league) out.league = true;
  return out;
}

function isLeagueAccount(NL, user) {
  if (!user || user.pending === true || user.rejected === true) return false;
  return NL.accountLevel.isLeague(user);
}

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
   club claims replaced — set from an issued Club card whose club has a key,
   removed otherwise. `manage`: the pass gives Manage on Programme Packs. */
function nextClaims(existing, pass, clubs, manage) {
  const out = Object.assign({}, existing || {});
  CLUB_CLAIMS.forEach((k) => { delete out[k]; });
  if (!pass || !pass.issued || pass.base !== "club") return out;
  const name = String(pass.club || "").trim();
  const key = clubKeyFor(name, clubs);
  if (!key) return out;
  out.club = key; out.clubName = name;
  out.pClub = key; out.pClubName = name;
  if (manage) out.pManage = true;
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

const { loadCanon } = require("./canon");
const PROGRAMME = "media-programme";

/* Does this pass give Manage on Programme Packs? The registry record with its
   live grants (Access), resolved as the door resolves it. */
async function programmeManage(db, pass) {
  if (!pass || !pass.issued || pass.base !== "club") return false;
  const [rec, live] = await Promise.all([
    db.ref("tools/" + PROGRAMME).once("value"),
    db.ref("access-grants/" + PROGRAMME).once("value"),
  ]);
  if (!rec.exists()) return false;
  const NL = loadCanon();
  const tool = NL.pass.withLive(rec.val(), live.val());
  return NL.pass.explain(pass, tool).level === "manage";
}

/* Bring one account's claims in line with its record, read fresh. */
async function applyClaims(db, uid, clubs) {
  const record = (await db.ref("users/" + uid).once("value")).val();
  const pass = record && record.pass ? record.pass : null;
  let user;
  try {
    user = await admin.auth().getUser(uid);
  } catch (err) {
    logger.warn("passClaims: no sign-in account for this pass", { uid, message: err && err.message });
    return;
  }
  const before = user.customClaims || {};
  const next = withLeague(nextClaims(before, pass, clubs, await programmeManage(db, pass)),
    isLeagueAccount(loadCanon(), record));
  if (sameClaims(before, next)) return;

  if (pass && pass.base === "club" && !next.club) {
    /* The club's name only, never the person: logs on this project are read by
       more people than the database is. */
    logger.warn("passClaims: no club key for this Club card", { club: String(pass.club || "") });
  }
  await admin.auth().setCustomUserClaims(uid, Object.keys(next).length ? next : null);
  logger.info("passClaims: claims updated", { uid, club: next.club || null, manage: !!next.pManage, league: !!next.league });
}

exports.passClaims = onValueWritten(OPTS, async (event) => {
  const db = admin.database();
  await applyClaims(db, event.params.uid, await readClubs(db));
});

exports.leagueClaims = onValueWritten(Object.assign({}, OPTS, { ref: "/users/{uid}/role" }), async (event) => {
  const db = admin.database();
  await applyClaims(db, event.params.uid, await readClubs(db));
});

/* Every account, once. Written by Button · Refresh account marks with the
   deploy account's own credentials; no browser can write admin/. */
exports.claimsRefresh = onValueWritten(Object.assign({}, OPTS, { ref: "/admin/claims-refresh", timeoutSeconds: 540 }), async (event) => {
  if (!(event.data && event.data.after && event.data.after.exists())) return;
  /* Its own "done" write fires this again: only a fresh request runs. */
  const ask = event.data.after.val() || {};
  if (ask.done && ask.done >= (ask.at || 0)) return;
  const db = admin.database();
  const [users, clubs] = await Promise.all([db.ref("users").once("value"), readClubs(db)]);
  let n = 0, league = 0;
  for (const uid of Object.keys(users.val() || {})) {
    await applyClaims(db, uid, clubs);
    n++;
    if (isLeagueAccount(loadCanon(), (users.val() || {})[uid])) league++;
  }
  await db.ref("admin/claims-refresh").update({ done: Date.now(), accounts: n, league });
  logger.info("claimsRefresh: every account checked", { n, league });
});

/* Programme Packs' grants changed in Access: every Club card's write claim
   follows. */
exports.programmeClaims = onValueWritten(Object.assign({}, OPTS, { ref: "/access-grants/" + PROGRAMME }), async () => {
  const db = admin.database();
  const [users, clubs] = await Promise.all([db.ref("users").once("value"), readClubs(db)]);
  const all = users.val() || {};
  let n = 0;
  for (const uid of Object.keys(all)) {
    const pass = all[uid] && all[uid].pass;
    if (!pass || !pass.issued || pass.base !== "club") continue;
    await applyClaims(db, uid, clubs);
    n++;
  }
  logger.info("programmeClaims: Club cards checked", { n });
});
