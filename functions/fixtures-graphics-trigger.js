/**
 * NL Tools — results graphics at the final whistle (scheduled).
 * Version: v1.0 (09/10/2026)
 *
 * WHAT THIS IS
 * ------------
 * .github/workflows/fixtures-graphics.yml makes the results cards and tables
 * once a day's games are finished, and delivers them to Drive and Storage.
 * Its own GitHub timer checks every 15 minutes in theory, but GitHub runs
 * scheduled jobs when it can: on 09/10/2026 the "every 15 minutes" jobs in
 * this repo were running hours apart. So this function watches the scores
 * itself and starts the workflow when something has finished.
 *
 * HOW
 * ---
 * Every two minutes from 11:00 to midnight UK it reads today's games for the
 * four competitions from National League Services and takes a fingerprint of
 * every game that has ended (full time, abandoned or postponed) with its
 * score. When the fingerprint changes it waits: another game finishing, or
 * a score being corrected, resets the wait. Five minutes after the last
 * change it asks GitHub to run the workflow once. It asks twice more, 15
 * minutes apart, because NLS's league table can trail the scores and the
 * workflow only makes a table once it has caught up.
 *
 * The workflow decides what is due. This decides only WHEN to ask, so a
 * dispatch with nothing due costs one short run and nothing else, and the
 * workflow's own "once only" record means a second ask never sends a card
 * twice.
 *
 * STATE
 * -----
 * app-data/staff-graphics/auto-trigger/<YYYY-MM-DD>:
 *   { fp, changedAt, dispatchedFp, dispatchedAt, asks }
 * Written only when something changes. Nothing personal; a hash and times.
 *
 * WHAT IT CANNOT DO
 * -----------------
 * It fires one fixed workflow in one fixed repository with fixed inputs. It
 * takes nothing from NLS beyond the fact that something changed.
 *
 * THE TOKEN
 * ---------
 * GITHUB_DISPATCH_TOKEN, the Secret Manager secret handbook-pdf.js already
 * uses: fine-grained, this repository only, Actions read and write. When it
 * expires this logs an error and the workflow's GitHub timer carries on as
 * before — later, but nothing breaks.
 *
 * CHANGELOG
 *   v1.0 09/10/2026  First version.
 */

"use strict";

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const GITHUB_DISPATCH_TOKEN = defineSecret("GITHUB_DISPATCH_TOKEN");

const OWNER = "thenationalleague";
const REPO = "nl-tools";
const WORKFLOW = "fixtures-graphics.yml";
const BRANCH = "main";

const NLS_BASE = "https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2";
/* Firm NLS competition codes (nls-data-structure skill). Same four as
   scripts/build-fixtures-graphics.js. */
const COMPETITIONS = { National: 89, North: 373, South: 372, Cup: 1275 };

const { fingerprint, decide, ukDate, seasonOf } = require("./fixtures-graphics-core");
const STATE_ROOT = "app-data/staff-graphics/auto-trigger";

/* ---------- National League Services ---------- */

/* An empty day answers 404, not an empty list (seen 09/10/2026, North on
   03/10). page.size 1000: the documented 100 maximum is wrong. */
async function todaysMatches(competitionID, ymd) {
  const q = [
    "seasonID=" + seasonOf(ymd), "competitionID=" + competitionID,
    "from=" + encodeURIComponent(ymd + " 00:00:00Z"), "to=" + encodeURIComponent(ymd + " 23:59:59Z"),
    "page.number=1", "page.size=1000",
  ].join("&");
  const res = await fetch(NLS_BASE + "/matches/?" + q);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error("NLS " + res.status + " for competition " + competitionID);
  const j = await res.json();
  return j.data || [];
}

/* ---------- GitHub ---------- */

async function dispatch() {
  const url = "https://api.github.com/repos/" + OWNER + "/" + REPO +
    "/actions/workflows/" + WORKFLOW + "/dispatches";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + GITHUB_DISPATCH_TOKEN.value(),
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    /* A real run: dry_run defaults to true for anyone pressing the button,
       so it is set off here explicitly. */
    body: JSON.stringify({ ref: BRANCH, inputs: { mode: "results", division: "all", dry_run: "false" } }),
  });
  if (res.status === 204) return true;
  const body = await res.text().catch(() => "");
  logger.error("fixtures-graphics: GitHub refused the dispatch", { status: res.status, body: body.slice(0, 500) });
  return false;
}

/* ---------- the tick ---------- */

async function tick(now) {
  const ymd = ukDate(now);
  const all = [];
  for (const id of Object.values(COMPETITIONS)) all.push(...await todaysMatches(id, ymd));
  if (!all.length) return;

  const fp = fingerprint(all);
  const ref = admin.database().ref(STATE_ROOT + "/" + ymd);
  const snap = await ref.once("value");
  const { write, dispatch: go } = decide(fp, snap.val(), now);

  if (go) {
    /* Only record the ask once GitHub has taken it, so a refused dispatch is
       tried again next tick rather than written off. */
    if (!(await dispatch())) return;
    logger.info("fixtures-graphics: asked for a results run", { day: ymd, fp, asks: write.asks });
  }
  if (write) await ref.set(write);
}

exports.fixturesGraphicsAtFullTime = onSchedule({
  schedule: "*/2 11-23 * * *",
  timeZone: "Europe/London",
  region: "europe-west2",
  memory: "256MiB",
  timeoutSeconds: 120,
  /* One at a time: two ticks reading the same state would both ask. */
  maxInstances: 1,
  retryCount: 0,
  /* The project's one Firebase identity, which holds the Secret Manager
     grant for GITHUB_DISPATCH_TOKEN (see handbook-pdf.js). */
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
  secrets: [GITHUB_DISPATCH_TOKEN],
}, async () => {
  /* Log, never throw: a throw is a failed run and nothing would retry it
     sooner than the next tick anyway. */
  try { await tick(Date.now()); }
  catch (err) { logger.error("fixtures-graphics: tick failed", { message: err && err.message }); }
});

