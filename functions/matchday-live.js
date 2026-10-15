/**
 * NL Tools — Matchday Live. Three functions, all server-side work for the
 * contributor capture page (/matchday-live/c/) and the staff feed
 * (/matchday-live/).
 *
 *   matchdayLiveAuth      — RTDB trigger on
 *                           app-data/media-matchday-live/authRequests/{uid}.
 *                           Swaps a contributor's link token for a custom token
 *                           carrying `mdl: <contributorId>`.
 *   matchdayLiveSync      — every minute. Mirrors today's National League,
 *                           North and South matches and their goals and cards
 *                           out of the NLS ingester's data into this project,
 *                           and attaches "just happened" clips to the event that
 *                           has since arrived.
 *   matchdayLiveRetention — nightly. Deletes rejected clips' video seven days
 *                           after rejection; clears uploads that never finished.
 *
 * Pure logic lives in matchday-live-core.js and is tested there.
 *
 * WHY NOT THE HTTPS FUNCTIONS THE HANDOVER DESCRIBES
 * --------------------------------------------------
 * The handover (15/10/2026) proposed mdlStart / mdlFinish / mdlToday as public
 * HTTPS functions returning signed upload URLs. Neither half can ship here:
 *   · the org's Domain Restricted Sharing policy refuses an `allUsers` invoker
 *     on any new Cloud Run service, so a public HTTPS function deploys and then
 *     403s for everyone (NL Cup Footage, 13/07/2026; programme.js, 03/08/2026);
 *   · getSignedUrl needs serviceAccountTokenCreator granted by hand in a
 *     console, which is a deploy step nobody here can perform.
 * So the capture page signs in anonymously (Identity Toolkit, which the policy
 * does not touch), hands its link token to this trigger through the
 * NL.codeGate.viaFunction handshake, and gets back a session whose claim the
 * RTDB and Storage rules check directly. The rate limits mdlStart would have
 * enforced are enforced by the rules instead — see the `pace` and `quota`
 * nodes in system/rtdb/rules.snapshot.json.
 *
 * WHY THE MIRROR, AND NOT A SECOND NLS POLLER
 * -------------------------------------------
 * nls-ingester.js already polls NLS on a cadence derived from the fixtures and
 * turns state into a deduplicated event stream. Polling NLS again here would
 * repeat that work and its bugs. But its output lives in the nl-widgets
 * project, under rules that admit only a `staff` claim minted for superadmins,
 * so neither a contributor nor a reviewer can read it. The mirror copies the
 * small slice this tool needs into nl-tools, where the tool's own rules apply.
 *
 * It costs two small reads a minute when nothing has changed: the ingester's
 * meta and our own. It only reads the matches and events when the ingester has
 * run since last time, and only writes the matches whose content moved.
 *
 * CHANGELOG
 *   15/10/2026  v1.0  Initial build.
 */
const { onValueWritten } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const C = require("./matchday-live-core");

const ROOT = "app-data/media-matchday-live";
const BUCKET = "nl-tools.firebasestorage.app";
const SERVICE_ACCOUNT = "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com";

/* The ingester's database. Same URL and same app name as nls-ingester.js, so
   whichever module asks first creates the app and the other reuses it. The
   service account already holds Realtime Database Admin on nl-widgets for the
   ingester — no new grant. */
const WIDGETS_DB = "https://nl-widgets-default-rtdb.europe-west1.firebasedatabase.app";
const WIDGETS_APP = "nls-widgets";

function widgetsDb() {
  const existing = admin.apps.find((a) => a && a.name === WIDGETS_APP);
  return (existing || admin.initializeApp({ databaseURL: WIDGETS_DB }, WIDGETS_APP)).database();
}

/* ---- matchdayLiveAuth ----------------------------------------------------- */

/* A 192-bit token cannot be guessed, so the throttle is there to stop a broken
   page hammering the trigger rather than to hold off a search. */
const MAX_UID_FAILURES = 10;
const MAX_GLOBAL_FAILURES = 100;
const GLOBAL_WINDOW_MS = 10 * 60 * 1000;

async function throttled(uid) {
  const db = admin.database();
  const [u, g] = await Promise.all([
    db.ref(ROOT + "/rate/uid/" + uid).once("value"),
    db.ref(ROOT + "/rate/global").once("value"),
  ]);
  if ((u.val() || 0) >= MAX_UID_FAILURES) return true;
  const gv = g.val();
  return Boolean(gv && Date.now() - (gv.first || 0) <= GLOBAL_WINDOW_MS &&
    (gv.n || 0) >= MAX_GLOBAL_FAILURES);
}

async function noteFailure(uid) {
  const db = admin.database();
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

const DEAD_LINK = "This link is no longer active. Ask the National League for a new one.";

/* onValueWritten rather than onValueCreated: the request path is keyed on a
   stable uid, so a request left behind by a blip makes the next attempt an
   update, which onValueCreated would ignore. Deletes are skipped, so the
   trigger's own cleanup cannot re-fire it. */
exports.matchdayLiveAuth = onValueWritten({
  ref: "/" + ROOT + "/authRequests/{uid}",
  instance: "nl-tools-default-rtdb",
  region: "europe-west1",       // RTDB triggers run in the database's region
  memory: "256MiB",
  maxInstances: 10,
  serviceAccount: SERVICE_ACCOUNT,
}, async (event) => {
  const uid = event.params.uid;
  const after = event.data && event.data.after;
  if (!after || !after.exists()) return;
  const req = after.val() || {};
  const db = admin.database();

  /* The request carries a live token in plain text — gone before anything
     else happens, whatever happens next. */
  await db.ref(ROOT + "/authRequests/" + uid).remove().catch(() => {});
  const grant = (payload) => db.ref(ROOT + "/authGrants/" + uid).set(payload);

  try {
    if (await throttled(uid)) {
      return grant({ ok: false, error: "Too many attempts. Try again in a few minutes." });
    }
    const token = String(req.code || "");
    if (!C.validToken(token)) {
      await noteFailure(uid);
      return grant({ ok: false, error: DEAD_LINK });
    }

    const hash = C.hashToken(token);
    const id = (await db.ref(ROOT + "/keys/" + hash).once("value")).val();
    const [rec, secret] = id && typeof id === "string" ? (await Promise.all([
      db.ref(ROOT + "/contributors/" + id).once("value"),
      db.ref(ROOT + "/secrets/" + id).once("value"),
    ])).map((s) => s.val()) : [null, null];

    /* The keys index and the contributor's own stored hash must agree. A
       rotation that half-landed (index written, secret not) fails closed. */
    if (!C.contributorUsable(rec, secret) || secret.tokenHash !== hash) {
      await noteFailure(uid);
      logger.info("matchdayLiveAuth: refused", { uid, known: Boolean(id) });
      return grant({ ok: false, error: DEAD_LINK });
    }

    await db.ref(ROOT + "/rate/uid/" + uid).remove().catch(() => {});

    /* uid keyed on the contributor, not on the anonymous session, so every
       write and audit line resolves to the person rather than to a throwaway
       uid per phone. */
    const customToken = await admin.auth().createCustomToken("mdl-" + id, {
      mdl: id,
      mdlName: String(rec.name || "").slice(0, 80),
      mdlGen: C.genOf(hash),
    });
    logger.info("matchdayLiveAuth: granted", { id });
    return grant({ ok: true, customToken, role: id, name: rec.name || "" });
  } catch (err) {
    logger.error("matchdayLiveAuth failed", { uid, message: err && err.message });
    /* Always leave a grant — the page waits on it and would otherwise spin to
       its timeout. */
    return grant({ ok: false, error: "Something went wrong. Please try again." });
  }
});

/* ---- matchdayLiveSync ------------------------------------------------------- */

async function runSync(now) {
  const db = admin.database();
  const wdb = widgetsDb();

  const meta = (await wdb.ref("nls/meta/ingest").once("value")).val();
  if (!meta || !C.validYmd(meta.ymd)) return { ran: false, why: "no ingest meta" };

  const syncRef = db.ref(ROOT + "/meta/sync");
  const prev = (await syncRef.once("value")).val() || {};
  /* Nothing has run upstream since our last copy — the common case, and the
     reason this is two reads rather than five. */
  if (prev.sourceRun === meta.lastRun && prev.ymd === meta.ymd) {
    return { ran: false, why: "no new ingest run" };
  }

  const ymd = meta.ymd;
  const snaps = await Promise.all(
    C.COMPS.map((c) => wdb.ref("nls/live/index/" + c + "/" + ymd).once("value"))
      .concat([wdb.ref("nls/events/" + ymd).once("value")])
  );
  const indexByComp = {};
  C.COMPS.forEach((c, i) => { indexByComp[c] = snaps[i].val() || {}; });
  const matchday = C.buildMatchday(indexByComp, snaps[C.COMPS.length].val() || {});

  /* Write per match, and only the matches that moved, so a phone watching its
     own game is not woken by a goal at another ground. */
  const prevHashes = prev.ymd === ymd ? (prev.hashes || {}) : {};
  const hashes = {};
  const updates = {};
  Object.keys(matchday).forEach((id) => {
    hashes[id] = C.contentHash({ [id]: matchday[id] });
    if (hashes[id] !== prevHashes[id]) updates[id] = matchday[id];
  });
  Object.keys(prevHashes).forEach((id) => { if (!matchday[id]) updates[id] = null; });
  if (Object.keys(updates).length) {
    await db.ref(ROOT + "/matchdays/" + ymd).update(updates);
  }

  const matched = await attachPending(db, ymd, matchday);

  await syncRef.set({
    sourceRun: meta.lastRun || null,
    ymd,
    at: now,
    matches: Object.keys(matchday).length,
    written: Object.keys(updates).length,
    hashes,
  });
  return { ran: true, written: Object.keys(updates).length, matched };
}

/* Clips tagged "just happened" wait here for the event they were filmed for. */
async function attachPending(db, ymd, matchday) {
  const snap = await db.ref(ROOT + "/clips/" + ymd)
    .orderByChild("pendingEventMatch").equalTo(true).once("value");
  const pending = snap.val() || {};
  const updates = {};
  Object.keys(pending).forEach((clipId) => {
    const clip = pending[clipId];
    const key = C.autoMatch(clip, matchday[String(clip && clip.matchId)]);
    if (!key) return;
    updates[clipId + "/eventId"] = key;
    updates[clipId + "/pendingEventMatch"] = null;
    updates[clipId + "/autoMatchedAt"] = admin.database.ServerValue.TIMESTAMP;
  });
  if (Object.keys(updates).length) {
    await db.ref(ROOT + "/clips/" + ymd).update(updates);
  }
  return Object.keys(updates).length / 3;
}

exports.matchdayLiveSync = onSchedule({
  schedule: "every 1 minutes",
  timeZone: "Etc/UTC",
  region: "europe-west2",
  serviceAccount: SERVICE_ACCOUNT,
  memory: "256MiB",
  timeoutSeconds: 60,
  /* One at a time: two overlapping runs would both read the same previous
     hashes and both write. Harmless, but pointless. */
  maxInstances: 1,
  retryCount: 0,
}, async () => {
  try {
    const r = await runSync(Date.now());
    if (r.ran) logger.info("matchdayLiveSync", r);
  } catch (err) {
    logger.error("matchdayLiveSync failed", { message: err && err.message });
  }
});

/* ---- matchdayLiveRetention ---------------------------------------------- */

async function runRetention(now) {
  const db = admin.database();
  const bucket = admin.storage().bucket(BUCKET);
  const days = C.retentionDays(now, 60);
  const snaps = await Promise.all(days.map((d) => db.ref(ROOT + "/clips/" + d).once("value")));
  const byDay = {};
  days.forEach((d, i) => { if (snaps[i].exists()) byDay[d] = snaps[i].val(); });

  const plan = C.retentionPlan(byDay, now);
  for (const p of plan) {
    if (p.storagePath) {
      /* A missing object is the outcome we wanted, not an error. */
      await bucket.file(p.storagePath).delete({ ignoreNotFound: true }).catch((e) =>
        logger.warn("matchdayLiveRetention: delete failed", { path: p.storagePath, message: e.message }));
    }
    const ref = db.ref(ROOT + "/clips/" + p.ymd + "/" + p.clipId);
    if (p.action === "purge") await ref.update({ purgedAt: now });
    else await ref.remove();
  }
  return { purged: plan.filter((p) => p.action === "purge").length,
           dropped: plan.filter((p) => p.action === "drop").length };
}

exports.matchdayLiveRetention = onSchedule({
  schedule: "every day 03:40",
  timeZone: "Europe/London",
  region: "europe-west2",
  serviceAccount: SERVICE_ACCOUNT,
  memory: "256MiB",
  timeoutSeconds: 300,
}, async () => {
  const r = await runRetention(Date.now());
  logger.info("matchdayLiveRetention", r);
});

/* Exported for the emulator run described in tests/emulator/README.md. */
exports._internals = { runSync, runRetention, attachPending };
