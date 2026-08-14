/**
 * nls/schedule.js — the cadence state machine (spec §3).
 *
 * Pure. Given today's rows and a clock, it says how often to run and which
 * matches need detail. No fetch, no RTDB, no `new Date()` — every decision is
 * a function of its arguments, which is the only reason the pre-match window
 * and the trailing cooldown can be tested without waiting for a Saturday.
 *
 * THE CADENCE IS DERIVED FROM FIXTURES, NEVER HARDCODED. There is no
 * "Saturdays at 15:00" anywhere in this file and there must not be: midweek
 * Cup ties, 12:15 kick-offs, Bank Holiday Mondays and postponements all break
 * a hardcoded window, and they break it silently on the days that matter most.
 */

'use strict';

const { isLive, isFinished } = require('./transform');

const MIN = 60 * 1000;

const HOURLY = 3600;
const LIVE = 60;
const PREMATCH_OPEN = 120;      // lineup still arriving
const PREMATCH_SETTLED = 300;   // lineup complete — confirmation poll only

/* From kick-off minus this, detail is fetched unconditionally. The list
   signature cannot help here: period stays PreMatch, both scores stay null and
   the minute stays null for the whole hour, while team news lands piecemeal.
   A signature-only trigger would fetch nothing and lineups would appear at
   kick-off — for what is one of the most-watched windows of the day. */
const PREMATCH_WINDOW_MIN = 75;

/* Officials routinely enter cards and substitutions after the whistle, so the
   run does not stop at full time. */
const COOLDOWN_MIN = 20;

/**
 * Per-match decision.
 *
 * Returns { intervalSec, detail } where `detail` is:
 *   'unconditional' — fetch detail every time this match is due
 *   'onChange'      — fetch only if the list signature moved
 *   null            — do not fetch detail
 */
function matchPlan(row, now) {
  const ko = row && row.ko ? Date.parse(row.ko) : NaN;
  const period = row ? row.period : '';

  if (isLive(period)) return { intervalSec: LIVE, detail: 'onChange' };

  if (isFinished(period)) {
    /* Measured from when the ingester FIRST SAW the period flip to finished,
       not from an assumed match length.

       An earlier version used kick-off plus 115 minutes, and it was wrong in
       the direction that costs you goals. Stoppage times now routinely push a
       match past two hours: the cooldown shrank as a game ran long, and a
       match reaching full time beyond KO+135 got no tail at all — dropping to
       hourly at precisely the moment the late cards and substitutions are
       entered. `finishedAt` is stamped by the orchestrator on the first run
       that observes full time, so the twenty minutes are twenty minutes
       whatever happened on the pitch.

       Absent (a cold start after the whistle) reads as "just now", which
       grants a full tail rather than none — the safe direction. */
    const since = row.finishedAt || now;
    return now - since <= COOLDOWN_MIN * MIN
      ? { intervalSec: LIVE, detail: 'onChange' }
      : { intervalSec: HOURLY, detail: null };
  }

  if (period === 'postponed' || period === 'abandoned') {
    return { intervalSec: HOURLY, detail: null };
  }

  // Pre-match.
  if (isNaN(ko)) return { intervalSec: HOURLY, detail: null };
  const untilKo = ko - now;
  if (untilKo > PREMATCH_WINDOW_MIN * MIN) return { intervalSec: HOURLY, detail: null };

  /* North and South are tier 7 — pre-match lineups do not exist for them, so
     the completeness check would never satisfy and the 2-minute poll would run
     flat out for 75 minutes against data that is never coming. Cap it on the
     competition's declared detailAvailability rather than on a timer (spec §3). */
  if (row.detailAvailability !== 'full') {
    return { intervalSec: PREMATCH_SETTLED, detail: 'unconditional' };
  }

  return row.lineupComplete
    ? { intervalSec: PREMATCH_SETTLED, detail: 'unconditional' }
    : { intervalSec: PREMATCH_OPEN, detail: 'unconditional' };
}

/**
 * Whole-run decision.
 *
 * rows — today's shaped index rows, each optionally carrying `lineupComplete`
 *        from the last stored detail (absent is treated as incomplete).
 * now  — epoch ms.
 */
function derivePlan(rows, now) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return { mode: 'idle', intervalSec: HOURLY, liveCount: 0, targets: [] };
  }

  const targets = [];
  let intervalSec = HOURLY;
  let liveCount = 0;
  let anyPrematch = false;
  let anyCooldown = false;
  let nextWindow = Infinity;

  list.forEach((row) => {
    const plan = matchPlan(row, now);
    if (plan.intervalSec < intervalSec) intervalSec = plan.intervalSec;
    if (isLive(row.period)) liveCount += 1;
    if (plan.detail) {
      targets.push({ id: row.id, mode: plan.detail, intervalSec: plan.intervalSec });
      if (plan.detail === 'unconditional') anyPrematch = true;
      else if (isFinished(row.period)) anyCooldown = true;
    } else {
      /* Lookahead. Without it an hourly run at 13:00 would not look again
         until 14:00, and a 15:00 kick-off whose pre-match window opens at
         13:45 would lose its first quarter of an hour of team news. Waking
         exactly when the window opens costs one extra run per matchday. */
      const ko = row.ko ? Date.parse(row.ko) : NaN;
      if (!isNaN(ko) && !isLive(row.period) && !isFinished(row.period)) {
        const opensIn = (ko - PREMATCH_WINDOW_MIN * MIN - now) / 1000;
        if (opensIn > 0 && opensIn < nextWindow) nextWindow = opensIn;
      }
    }
  });

  if (nextWindow < intervalSec) intervalSec = Math.max(LIVE, Math.round(nextWindow));

  const mode = liveCount ? 'live'
    : anyPrematch ? 'prematch'
      : anyCooldown ? 'cooldown'
        : 'idle';

  return { mode, intervalSec, liveCount, targets };
}

/**
 * The cheap no-op the minute job needs (spec §3, "Build with plain cron").
 *
 * Cloud Scheduler fires this every minute all week. Waking the ingester into
 * four NLS requests each time — 40,000 a month, almost all of them at 3am on a
 * Tuesday against a feed that is club officials typing into a portal — would
 * be indefensible. So the tick first reads the interval the last run asked
 * for and, when it is not yet due, returns without touching the network.
 *
 * `snapshot` is meta/ingest: { ymd, lastRun, intervalSec, mode }.
 * Anything missing or from another day means "run" — a stale cache must never
 * be able to keep the ingester asleep through a matchday.
 *
 * THE PREVIOUS RUN'S OWN PLAN IS THE ONLY PACE. There is deliberately no
 * clock-derived window here any more. There used to be one, bounded at the
 * last kick-off plus an assumed match length, and it meant a match running
 * past that bound could fall out of the run window WHILE STILL IN PLAY.
 * derivePlan already returns 3600 when there is nothing to do and 60 when
 * there is, including a lookahead to the next pre-match window opening, so
 * pacing on intervalSec is both simpler and correct at the edges. It is also
 * self-terminating: each run recomputes the plan from fresh rows, so once the
 * last cooldown expires the interval returns to hourly on its own.
 */
function shouldRun(snapshot, now, todayYmd) {
  const s = snapshot || {};
  if (!s.ymd || s.ymd !== todayYmd) return { run: true, reason: 'new-day' };
  if (!s.lastRun) return { run: true, reason: 'no-previous-run' };

  /* Minus a slack second, so a scheduler firing at 59.8s past is not held for
     a whole further minute. */
  const due = (s.intervalSec || LIVE) * 1000 - 1000;
  if (now - s.lastRun < due) return { run: false, reason: 'not-due' };
  return { run: true, reason: s.mode || 'due' };
}

module.exports = {
  HOURLY, LIVE, PREMATCH_OPEN, PREMATCH_SETTLED,
  PREMATCH_WINDOW_MIN, COOLDOWN_MIN,
  matchPlan, derivePlan, shouldRun,
};
