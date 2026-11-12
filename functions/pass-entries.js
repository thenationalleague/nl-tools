/**
 * NL Tools — the database follows the pass (passEntries, grantEntries,
 * keyEndings). Permissions plan, step 5, first part (12/11/2026).
 *
 * WHAT THIS IS
 * -----------------------------------------------------------------------------
 * Since step 6 the pass decides at the door (auth-guard), but the database
 * rules still read each person's per-tool entries, users/<uid>/tools/<key>.
 * Until now the PAGES kept those entries in step with the pass: the issue
 * form, a person's page, an approval, a grant change in Access, and the
 * Apply passes button for anything they missed. Two things slipped through:
 * a key reaching its end date changed nothing in the database until someone
 * saved that person again, and any page that forgot to write the entries
 * left the two locks disagreeing.
 *
 * These functions make the entries the server's job, worked out by the same
 * resolver the door uses (NL.pass.toOld, from system/nl-utils.js via
 * canon.js — one copy):
 *
 *   passEntries   users/<uid>/pass written → that person's entries
 *   grantEntries  access-grants/<toolKey> written → that tool's entry for
 *                 every pass holder
 *   keyEndings    once a day → everyone holding a key that ended since the
 *                 last run, and an audit line per person
 *
 * What the pages write is unchanged and harmless: the function writes the
 * same values, and writes nothing where they already agree.
 *
 * WHAT IT DOES NOT DO: decide anything new. A grant changed in the registry
 * snapshot reaches people through the pages and Apply passes as before (a
 * merge is not a moment anyone reviewed whose access it moves; Access's
 * Manage tab is). Someone without an issued pass is left to their role.
 */
const { onValueWritten } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { loadCanon } = require("./canon");

const DB_OPTS = {
  instance: "nl-tools-default-rtdb",
  region: "europe-west1",
  memory: "256MiB",
  maxInstances: 5,
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
};

const { entryUpdates, keysEnded } = require("./pass-entries-core");

/* ── Database ─────────────────────────────────────────────────────────── */

async function registryNow(db, NL) {
  const [tools, grants] = await Promise.all([
    db.ref("tools").once("value"),
    db.ref("access-grants").once("value"),
  ]);
  return NL.pass.withLiveAll(tools.val() || {}, grants.val() || null);
}

function auditLine(db, action, detail, target) {
  const now = Date.now();
  const key = String(now) + "_" + Math.random().toString(36).slice(2, 8);
  const entry = { action, detail, uid: "system", name: "NL Tools", email: "", ts: now, at: new Date(now).toISOString() };
  if (target && target.uid) { entry.targetUid = target.uid; entry.targetName = target.name || ""; entry.targetEmail = target.email || ""; }
  const u = {};
  u["admin/audit/" + key] = entry;
  if (target && target.uid) u["admin/audit-by-user/" + target.uid + "/" + key] = entry;
  return db.ref().update(u);
}

exports.passEntries = onValueWritten(Object.assign({ ref: "/users/{uid}/pass" }, DB_OPTS), async (event) => {
  const uid = event.params.uid;
  const db = admin.database();
  const NL = loadCanon();
  const user = (await db.ref("users/" + uid).once("value")).val();
  if (!user) return;
  const updates = entryUpdates(NL, uid, user, await registryNow(db, NL), Date.now());
  const n = Object.keys(updates).length;
  if (!n) return;
  await db.ref().update(updates);
  logger.info("passEntries: entries brought in line with the pass", { uid, changed: n });
});

exports.grantEntries = onValueWritten(Object.assign({ ref: "/access-grants/{toolKey}" }, DB_OPTS), async (event) => {
  const toolKey = event.params.toolKey;
  const db = admin.database();
  const NL = loadCanon();
  const [users, registry] = await Promise.all([db.ref("users").once("value"), registryNow(db, NL)]);
  if (!registry[toolKey]) return;
  const all = users.val() || {}, updates = {};
  const now = Date.now();
  Object.keys(all).forEach((uid) => Object.assign(updates, entryUpdates(NL, uid, all[uid], registry, now, toolKey)));
  const n = Object.keys(updates).length;
  if (!n) return;
  await db.ref().update(updates);
  logger.info("grantEntries: pass holders' entries follow the tool's grants", { toolKey, changed: n });
});

/* 03:20 London, after the overnight jobs. Looks back 26 hours so a missed or
   late run is covered; a key already handled writes nothing the second time. */
exports.keyEndings = onSchedule({
  schedule: "20 3 * * *",
  timeZone: "Europe/London",
  region: "europe-west1",
  memory: "256MiB",
  timeoutSeconds: 120,
  maxInstances: 1,
  serviceAccount: DB_OPTS.serviceAccount,
}, async () => {
  const db = admin.database();
  const NL = loadCanon();
  const now = Date.now(), since = now - 26 * 3600 * 1000;
  const [users, registry] = await Promise.all([db.ref("users").once("value"), registryNow(db, NL)]);
  const all = users.val() || {};
  let people = 0;
  for (const uid of Object.keys(all)) {
    const u = all[uid];
    const ended = keysEnded(u && u.pass, since, now);
    if (!ended.length) continue;
    const updates = entryUpdates(NL, uid, u, registry, now);
    if (Object.keys(updates).length) await db.ref().update(updates);
    const names = ended.map((id) => (NL.pass.KEY[id] ? NL.pass.KEY[id].name : id)).join(", ");
    await auditLine(db, "key_ended", names + " key ended", { uid, name: u.name || "", email: u.email || "" });
    people++;
  }
  logger.info("keyEndings: done", { people });
});

