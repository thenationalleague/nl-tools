/**
 * NL Tools — Brand Exposure scan requests (the uploader's engine room).
 *
 *   brandExposureScanRequest — RTDB trigger on
 *                              app-data/ops-brand-exposure/requests/{id}.
 *                              Re-verifies the author is a superadmin, then
 *                              pumps the queue: if nothing is scanning, fires
 *                              the brand-exposure-scan Cloud Run job with this
 *                              request's parameters as per-execution env
 *                              overrides — the same overrides the CLI's
 *                              --update-env-vars sends.
 *   brandExposureScanPoll    — every minute: flips running requests to
 *                              done/failed from their execution's state,
 *                              deletes the source video on success, sweeps
 *                              failed sources after 48h, heals a stale
 *                              launch lock, pumps the queue.
 *
 * What this is for
 * ----------------
 * The tool's New match view uploads footage to uploads/ and writes a request
 * record. Before this, starting a scan meant a Cloud Shell command with five
 * env vars typed by hand — see system/board-exposure/uploader-spec.md for the
 * whole flow. This function is the part that turns "a record appeared" into
 * "a job is running" and, later, "the match is in the tool".
 *
 * Why a trigger + a poller rather than one function that waits
 * ------------------------------------------------------------
 * Event-driven gen-2 functions cap out long before a scan does (a full 90 is
 * an hour-plus of container time), so nothing here waits on the job. The
 * trigger only launches; the poller owns every slow truth: completion,
 * failure, cleanup, and the next-in-queue launch. A poller is also the shape
 * that needs no console setup — Eventarc audit-log triggers would do this
 * with fewer invocations and more clicking, and nothing in this repo may
 * depend on a console visit (system/RUNBOOK.md).
 *
 * Serial queue, on a ruling (30/08/2026)
 * --------------------------------------
 * One scan at a time. Requests created while one runs stay "queued"; the
 * poller launches the oldest next. A short-lived launch lock (requestLock)
 * makes the claim atomic across concurrent invocations; it exists only
 * between claim and the "running" stamp, and the poller removes one left
 * behind by a crash.
 *
 * Two safety rails worth naming
 * -----------------------------
 * · VIDEO_PATH pins req.video to a single object under uploads/. This
 *   function DELETES that object with Admin credentials on success and at
 *   sweep time — unconstrained, a crafted request would be an
 *   arbitrary-object-delete primitive (data/ga-hourly-archive.json is
 *   unrebuildable; see system/storage/README.md).
 * · Deleting the source on success is safe because the match script exits
 *   non-zero when it measures but fails to upload ("the job exited zero" and
 *   "the match arrived" are the same thing precisely because that lesson is
 *   already paid for — see _UPLOAD_FAILURES in board-exposure-match.py). A
 *   "succeeded" execution therefore implies the match record exists.
 *
 * IAM this needs (one-time, Cloud Shell — see the PR that added this file):
 *   the runtime service account (firebase-adminsdk-fbsvc) must hold
 *   roles/run.jobsExecutorWithOverrides + roles/run.viewer on the job (or
 *   project), and storage delete on the bucket. Grants are idempotent.
 */
const { onValueCreated } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { GoogleAuth } = require("google-auth-library");

const ROOT = "app-data/ops-brand-exposure";
const BUCKET = "nl-tools.firebasestorage.app";
const RUN_JOB =
  "projects/nl-tools/locations/europe-west2/jobs/brand-exposure-scan";
const RUN_API = "https://run.googleapis.com/v2/";
const SWEEP_AFTER_MS = 48 * 60 * 60 * 1000;
const LOCK_STALE_MS = 5 * 60 * 1000;

const SERVICE_ACCOUNT = "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com";

const TRIGGER_OPTS = {
  ref: "/" + ROOT + "/requests/{id}",
  instance: "nl-tools-default-rtdb",
  /* RTDB triggers must run in the database's region (europe-west1), which
     overrides the europe-west2 setGlobalOptions default in index.js. */
  region: "europe-west1",
  memory: "256MiB",
  maxInstances: 5,
  /* Same service account as brand-exposure.js and the rest — the gen-2
     default (compute SA) holds no Firebase roles, so RTDB drops its
     connection. */
  serviceAccount: SERVICE_ACCOUNT,
};

const SCHED_OPTS = {
  schedule: "every 1 minutes",
  timeZone: "Etc/UTC",
  region: "europe-west2",
  memory: "256MiB",
  timeoutSeconds: 120,
  /* One instance: the poller is a read-decide-write loop over shared state,
     and serialising it is cheaper than making every step a transaction —
     same reasoning as nls-ingester's SCHEDULE_OPTS. A minute tick with no
     running requests is one RTDB read; the free tier does not notice. */
  maxInstances: 1,
  retryCount: 0,
  serviceAccount: SERVICE_ACCOUNT,
};

/* Single segment under uploads/, nothing traversable. The charset is looser
   than a matchId because Richard names files things like
   "Horsham v Hampton & Richmond 18Aug26.mp4" — the constraint that matters
   is the prefix and the single segment, not the alphabet. */
const VIDEO_PATH = /^uploads\/[^/]+$/;

/* ---- Pure helpers (exported for tests) ----------------------------------- */

function validRequest(req) {
  if (!req || typeof req !== "object") return "empty request";
  if (!VIDEO_PATH.test(String(req.video || ""))) {
    return "video must name one object under uploads/";
  }
  if (!String(req.club || "").trim()) return "no home club";
  if (!String(req.match || "").trim()) return "no match title";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.date || ""))) {
    return "date must be YYYY-MM-DD";
  }
  if (req.sponsors != null && !Array.isArray(req.sponsors)) {
    return "sponsors must be a list of reference folder names";
  }
  if (!!req.ht !== !!req.restart) {
    return "half-time marks come as a pair — ht and restart together";
  }
  if (req.mode != null && req.mode !== "scan" && req.mode !== "audition") {
    return "mode must be scan or audition";
  }
  if (req.mode === "audition" &&
      !/^brand-exposure\/[a-z0-9-]+$/.test(String(req.dest || ""))) {
    return "an audition names its destination folder under brand-exposure/";
  }
  return null;
}

/* An audition leaves the source in place: its whole point is that a full
   scan of the SAME upload follows once the references are ticked. Scans
   (and their failure sweeps) keep the delete-on-terminal lifecycle. */
function shouldDeleteSource(req) {
  return !req || req.mode !== "audition";
}

/* The stage spine (v0.14): one word the tool renders instead of deriving
   "where is this match?" from three places — which is how the audition
   dead-end shipped. queued is stamped at creation by the tool; these two
   advance it. */
function stageOnLaunch(req) {
  return req && req.mode === "audition" ? "auditioning" : "scanning";
}
function stageOnDone(req) {
  return req && req.mode === "audition" ? "review" : "measured";
}

/* The env contract is scan-job/run_job.py's docstring, name for name. The
   reference-set default is partial — the safe direction: partial withholds
   share of voice, complete would invent it. */
function buildEnv(req) {
  const env = [
    ["BE_VIDEO", req.video],
    ["BE_CLUB", req.club],
    ["BE_MATCH", req.match],
    ["BE_DATE", req.date],
    ["BE_REFERENCE_SET",
      req.referenceSet === "complete" ? "complete" : "partial"],
  ];
  if (Array.isArray(req.sponsors) && req.sponsors.length) {
    env.push(["BE_SPONSORS", req.sponsors.join(",")]);
  }
  if (req.source === "full" || req.source === "highlights") {
    env.push(["BE_SOURCE_TYPE", req.source]);
  }
  if (req.start) env.push(["BE_START", req.start]);
  if (req.end) env.push(["BE_END", req.end]);
  if (req.ht && req.restart) {
    env.push(["BE_HT", req.ht]);
    env.push(["BE_RESTART", req.restart]);
  }
  if (req.mode === "audition") {
    /* run_job reads the rest only on the scan path, so the scan fields
       above ride along inert; these two are what change the run. */
    env.push(["BE_MODE", "audition"]);
    env.push(["BE_DEST", req.dest]);
  }
  return env.map(([name, value]) => ({ name, value: String(value) }));
}

/* Execution → running | done | failed.
   Shape per https://cloud.google.com/run/docs/reference/rest/v2/projects.locations.jobs.executions#Execution
   — completionTime is an RFC3339 string set only once the execution has
   finished; succeededCount/failedCount are integers. That is the doc, not a
   live call (sessions cannot reach the Run API): on the first live run,
   check the poller log against a finished execution before trusting a
   "done" — the test fixtures below are doc-derived and prove only that this
   code is consistent with the doc. */
function verdictOf(exec) {
  if (!exec || !exec.completionTime) return "running";
  return (exec.succeededCount || 0) >= 1 ? "done" : "failed";
}

function failureNote(exec) {
  const short = String((exec && exec.name) || "").split("/").pop();
  return "The scan failed" + (short ? " (execution " + short + ")" : "") +
    " — the execution log has the scan's own account of why.";
}

function oldestQueued(reqs) {
  let best = null;
  Object.keys(reqs || {}).forEach((id) => {
    const r = reqs[id];
    if (!r || r.status !== "queued") return;
    if (!best || (r.at || 0) < (reqs[best].at || 0)) best = id;
  });
  return best;
}

/* ---- Run Admin API ------------------------------------------------------- */

let _auth = null;

async function runApi(method, path, body) {
  if (!_auth) {
    _auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }
  const client = await _auth.getClient();
  const res = await client.request(
    Object.assign({ url: RUN_API + path, method }, body ? { data: body } : {}));
  return res.data;
}

async function launch(db, id, req) {
  /* POST …/jobs/{job}:run returns a long-running Operation whose metadata is
     the Execution being started (name under …/executions/…) —
     https://cloud.google.com/run/docs/reference/rest/v2/projects.locations.jobs/run
     The overrides shape is the REST twin of `gcloud run jobs execute
     --update-env-vars`, which every hand-run of this job has used. */
  const op = await runApi("POST", RUN_JOB + ":run", {
    overrides: { containerOverrides: [{ env: buildEnv(req) }] },
  });
  const execution = (op && op.metadata && op.metadata.name) || null;
  await db.ref(ROOT + "/requests/" + id).update({
    status: "running",
    stage: stageOnLaunch(req),
    execution,
    startedAt: Date.now(),
  });
  logger.info("brandExposureScan: launched", { id, execution });
}

/* ---- The queue pump ------------------------------------------------------ */

async function claimLock(db, id) {
  const res = await db.ref(ROOT + "/requestLock").transaction((cur) =>
    cur ? undefined : { id, at: Date.now() });
  return res.committed;
}

async function releaseLock(db, id) {
  await db.ref(ROOT + "/requestLock").transaction((cur) =>
    cur && cur.id === id ? null : undefined);
}

async function pump(db) {
  /* Bounded walk rather than recursion: each hop either launches, fails one
     invalid request and moves on, or finds nothing to do. */
  for (let hop = 0; hop < 10; hop++) {
    const reqs = (await db.ref(ROOT + "/requests").once("value")).val() || {};
    const busy = Object.keys(reqs).some(
      (k) => reqs[k] && reqs[k].status === "running");
    if (busy) return;
    const id = oldestQueued(reqs);
    if (!id) return;
    if (!(await claimLock(db, id))) return; // another invocation is launching
    try {
      const bad = validRequest(reqs[id]);
      if (bad) {
        await db.ref(ROOT + "/requests/" + id).update({
          status: "failed", error: bad, finishedAt: Date.now(),
        });
        continue; // the next-oldest gets its turn this same pass
      }
      await launch(db, id, reqs[id]);
      return;
    } catch (err) {
      logger.error("brandExposureScan: launch failed", {
        id, message: err && err.message,
      });
      await db.ref(ROOT + "/requests/" + id).update({
        status: "failed",
        error: "Could not start the scan: " +
          ((err && err.message) || "unknown error"),
        finishedAt: Date.now(),
      }).catch(() => {});
      return;
    } finally {
      await releaseLock(db, id).catch(() => {});
    }
  }
}

/* ---- The trigger --------------------------------------------------------- */
/* onValueCreated, unlike brand-exposure.js's onValueWritten, because request
   ids are push keys — every request is a fresh path, and later status updates
   to the same path must NOT re-launch anything. */
exports.brandExposureScanRequest = onValueCreated(TRIGGER_OPTS, async (event) => {
  const id = event.params.id;
  const req = (event.data && event.data.val()) || {};
  const db = admin.database();
  const ref = db.ref(ROOT + "/requests/" + id);

  try {
    /* The rules gate creation to superadmins and pin `by` to auth.uid; this
       re-verifies because the function holds Admin credentials and a rules
       regression must not quietly become a job-launch primitive. */
    const role = String(
      (await db.ref("users/" + (req.by || "none") + "/role").once("value"))
        .val() || "").toLowerCase();
    if (role !== "superadmin") {
      logger.warn("brandExposureScan: refused", { id, by: req.by || null });
      return ref.update({
        status: "failed",
        error: "Scan requests are superadmin-only.",
        finishedAt: Date.now(),
      });
    }

    const bad = validRequest(req);
    if (bad) {
      /* Fail at creation, visibly, rather than when its turn comes. */
      return ref.update({
        status: "failed", error: bad, finishedAt: Date.now(),
      });
    }

    await pump(db);
  } catch (err) {
    logger.error("brandExposureScanRequest failed", {
      id, message: err && err.message,
    });
    /* Leave a status behind — the tool subscribes to this record, and a
       silent failure would show "queued" forever. The poller's pump gives a
       transient blip a second chance every minute anyway. */
    await ref.update({
      status: "failed",
      error: "Something went wrong starting the scan. Try again.",
      finishedAt: Date.now(),
    }).catch(() => {});
  }
});

/* ---- The poller ---------------------------------------------------------- */
exports.brandExposureScanPoll = onSchedule(SCHED_OPTS, async () => {
  const db = admin.database();
  const now = Date.now();
  const reqs = (await db.ref(ROOT + "/requests").once("value")).val() || {};

  for (const id of Object.keys(reqs)) {
    const r = reqs[id];
    if (!r) continue;

    if (r.status === "running") {
      if (!r.execution) {
        /* Launched but the execution name never landed — a crash between the
           API call and the stamp. After a grace period, call it failed so the
           queue moves; the execution (if any) finishes harmlessly. */
        if ((r.startedAt || 0) < now - LOCK_STALE_MS) {
          await db.ref(ROOT + "/requests/" + id).update({
            status: "failed", stage: "failed",
            error: "The scan started but its execution was never recorded.",
            finishedAt: now,
          });
        }
        continue;
      }
      let exec;
      try {
        exec = await runApi("GET", r.execution);
      } catch (err) {
        logger.warn("brandExposureScanPoll: execution fetch failed", {
          id, message: err && err.message,
        });
        continue; // transient — next minute tries again
      }
      const verdict = verdictOf(exec);
      if (verdict === "running") continue;
      if (verdict === "done") {
        /* Source deletion is safe here and only here — see the header. */
        if (shouldDeleteSource(r) && VIDEO_PATH.test(String(r.video || ""))) {
          try {
            await admin.storage().bucket(BUCKET).file(r.video).delete();
          } catch (err) {
            logger.warn("brandExposureScanPoll: source delete failed", {
              id, message: err && err.message,
            });
          }
        }
        await db.ref(ROOT + "/requests/" + id).update({
          status: "done", stage: stageOnDone(r), finishedAt: now,
        });
      } else {
        await db.ref(ROOT + "/requests/" + id).update({
          status: "failed", stage: "failed", error: failureNote(exec),
          finishedAt: now,
        });
      }
    } else if (
      r.status === "failed" && !r.swept && shouldDeleteSource(r) &&
      VIDEO_PATH.test(String(r.video || "")) &&
      (r.finishedAt || r.at || 0) < now - SWEEP_AFTER_MS
    ) {
      /* The 48h ruling: one retry window with the source still in place,
         then the bucket stops accumulating dead footage. `swept` stays on
         the record so the tool can say "source cleared" rather than
         offering a retry that would 404. */
      try {
        await admin.storage().bucket(BUCKET).file(r.video).delete();
      } catch (err) {
        /* Already gone is the common case (a retried request shares the
           same source object). Sweeping is best-effort either way. */
      }
      await db.ref(ROOT + "/requests/" + id).update({ swept: now });
    }
  }

  /* A lock left behind by a crash between claim and stamp. */
  const lock = (await db.ref(ROOT + "/requestLock").once("value")).val();
  if (lock && (lock.at || 0) < now - LOCK_STALE_MS) {
    const holder = reqs[lock.id];
    if (!holder || holder.status !== "running") {
      await db.ref(ROOT + "/requestLock").remove();
    }
  }

  await pump(db);
});

/* Exported for tests. */
exports._internals = {
  validRequest, buildEnv, verdictOf, oldestQueued, failureNote, VIDEO_PATH,
  shouldDeleteSource, stageOnLaunch, stageOnDone,
};
