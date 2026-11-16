/**
 * NL Tools — External passes on the server (permissions plan, "External
 * passes" and "Club views", 16/11/2026).
 *
 * An organisation outside the League and its clubs is set up in Access
 * (Externals tab, Skeleton key only) at externals/<org>: its name, colours
 * and zones, each zone listing the tools it opens, at what level and, for a
 * tool with club data, which club view. A person on an External card holds
 * some of those zones as keys on their pass.
 *
 *   externalInvites  admin/external-invites/<id> created by a Skeleton key
 *                    holder → the account (Firebase Auth, created here if
 *                    new) and its users/<uid> record with the External pass.
 *                    The page then sends Firebase's own set-a-password email.
 *                    A trigger, not a callable: a new callable cannot be given
 *                    a public invoker on this project (org policy).
 *   externalPasses   users/<uid>/pass written → that person's pass.ext
 *   externalOrgs     externals/<org> written → pass.ext for its people
 *   externalNightly  once a day → everyone's, for zones that ended and tools
 *                    that stopped offering a view
 *
 * pass.ext is what the zones open, worked out by NL.pass.extFor (one copy,
 * system/nl-utils.js via canon.js). The door reads it (NL.pass.explain);
 * the per-tool entries the database rules read (users/<uid>/tools) are
 * written from it in the same update (NL.pass.toOld), so nobody has to press
 * Apply passes after a zone changes.
 * Only the server writes it, and the resolver checks it against the tool's
 * record again, so a hand-edited ext cannot open what the tool does not
 * offer.
 */
const { onValueWritten, onValueCreated } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { loadCanon } = require("./canon");
const { extUpdate, checkInvite, externalUser } = require("./externals-core");

const DB_OPTS = {
  instance: "nl-tools-default-rtdb",
  region: "europe-west1",
  memory: "256MiB",
  maxInstances: 5,
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
};

function auditLine(db, action, detail, by, target) {
  const now = Date.now();
  const key = String(now) + "_" + Math.random().toString(36).slice(2, 8);
  const entry = { action, detail, uid: by || "system", name: by ? "" : "NL Tools", email: "", ts: now, at: new Date(now).toISOString() };
  if (target && target.uid) { entry.targetUid = target.uid; entry.targetName = target.name || ""; entry.targetEmail = target.email || ""; }
  const u = {};
  u["admin/audit/" + key] = entry;
  if (target && target.uid) u["admin/audit-by-user/" + target.uid + "/" + key] = entry;
  return db.ref().update(u);
}

async function syncOne(db, NL, uid, registry, orgs) {
  const [passSnap, toolsSnap] = await Promise.all([db.ref("users/" + uid + "/pass").once("value"), db.ref("users/" + uid + "/tools").once("value")]);
  const pass = passSnap.val(), tools = toolsSnap.val();
  let org = null;
  if (NL.pass.isExternal(pass)) {
    if (!(pass.org in orgs)) orgs[pass.org] = (await db.ref("externals/" + pass.org).once("value")).val();
    org = orgs[pass.org];
  }
  const u = extUpdate(NL, uid, pass, org, registry, Date.now(), tools);
  if (Object.keys(u).length) await db.ref().update(u);
  return Object.keys(u).length;
}

exports.externalPasses = onValueWritten(Object.assign({ ref: "/users/{uid}/pass" }, DB_OPTS), async (event) => {
  const db = admin.database();
  const NL = loadCanon();
  const registry = (await db.ref("tools").once("value")).val() || {};
  const n = await syncOne(db, NL, event.params.uid, registry, {});
  if (n) logger.info("externalPasses: ext brought in line", { uid: event.params.uid });
});

async function syncWhere(db, NL, test) {
  const [users, tools] = await Promise.all([db.ref("users").once("value"), db.ref("tools").once("value")]);
  const all = users.val() || {}, registry = tools.val() || {}, orgs = {};
  let changed = 0;
  for (const uid of Object.keys(all)) {
    const p = all[uid] && all[uid].pass;
    if (!test(p)) continue;
    changed += await syncOne(db, NL, uid, registry, orgs);
  }
  return changed;
}

exports.externalOrgs = onValueWritten(Object.assign({ ref: "/externals/{org}" }, DB_OPTS), async (event) => {
  const db = admin.database();
  const NL = loadCanon();
  const org = event.params.org;
  const changed = await syncWhere(db, NL, (p) => !!p && p.base === "external" && p.org === org);
  logger.info("externalOrgs: done", { changed });
});

exports.externalNightly = onSchedule({
  schedule: "25 3 * * *",
  timeZone: "Europe/London",
  region: "europe-west1",
  memory: "256MiB",
  timeoutSeconds: 120,
  maxInstances: 1,
  serviceAccount: DB_OPTS.serviceAccount,
}, async () => {
  const db = admin.database();
  const NL = loadCanon();
  const changed = await syncWhere(db, NL, (p) => !!p && (p.base === "external" || !!p.ext));
  logger.info("externalNightly: done", { changed });
});

async function isSkeleton(db, uid) {
  const u = (await db.ref("users/" + uid).once("value")).val() || {};
  return u.role === "superadmin" || !!(u.pass && u.pass.skeleton);
}

exports.externalInvites = onValueCreated(Object.assign({ ref: "/admin/external-invites/{id}" }, DB_OPTS), async (event) => {
  const db = admin.database();
  const id = event.params.id;
  const ref = db.ref("admin/external-invites/" + id);
  const req = event.data.val() || {};
  const done = (result) => ref.child("result").set(Object.assign({ at: Date.now() }, result));
  try {
    /* The rules let only a Skeleton key holder write here, naming
       themselves; checked again so a rules mistake cannot mint a pass. */
    if (!req.by || !(await isSkeleton(db, req.by))) return done({ ok: false, error: "Only the Skeleton key sets up External passes." });
    const orgId = String(req.org || "");
    const org = orgId ? (await db.ref("externals/" + orgId).once("value")).val() : null;
    const now = Date.now();
    const checked = checkInvite(req, org, now);
    if (checked.error) return done({ ok: false, error: checked.error });
    const ok = checked.ok;

    let authUser = null;
    try { authUser = await admin.auth().getUserByEmail(ok.email); } catch (e) {
      if (!e || e.code !== "auth/user-not-found") throw e;
    }
    if (authUser) {
      const existing = (await db.ref("users/" + authUser.uid).once("value")).val();
      if (existing) return done({ ok: false, error: "That email already has an NL Tools account. Change it in People instead." });
    } else {
      authUser = await admin.auth().createUser({ email: ok.email, displayName: ok.name });
    }
    await db.ref("users/" + authUser.uid).set(externalUser(ok, orgId, org, req.by, now));
    await auditLine(db, "external_invited",
      "Set up on an External card for " + (org.name || orgId) + " (" + ok.zones.length + (ok.zones.length === 1 ? " zone" : " zones") +
        (ok.until ? ", ends " + new Date(ok.until).toISOString().slice(0, 10) : ", no end date") + ")",
      req.by, { uid: authUser.uid, name: ok.name, email: ok.email });
    logger.info("externalInvites: account set up", { org: orgId, zones: ok.zones.length });
    return done({ ok: true, uid: authUser.uid, email: ok.email });
  } catch (e) {
    logger.error("externalInvites failed", e);
    return done({ ok: false, error: "Could not set up the account. Try again, or check the cloud job's log." });
  }
});
