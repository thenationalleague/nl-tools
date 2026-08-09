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
    /* No final-whistle timestamp exists upstream, so the cooldown is measured
       from kick-off plus a generous match length rather than from the whistle.
       Erring long is the safe direction: it costs one list request a minute
       for a few extra minutes and it catches the late data entry. */
    const assumedEnd = isNaN(ko) ? -Infinity : ko + 115 * MIN;
    return now - assumedEnd <= COOLDOWN_MIN * MIN
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

  list.forEach((row) => {
    const plan = matchPlan(row, now);
    if (plan.intervalSec < intervalSec) intervalSec = plan.intervalSec;
    if (isLive(row.period)) liveCount += 1;
    if (plan.detail) {
      targets.push({ id: row.id, mode: plan.detail, intervalSec: plan.intervalSec });
      if (plan.detail === 'unconditional') anyPrematch = true;
      else if (isFinished(row.period)) anyCooldown = true;
    }
  });

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
 * be indefensible. So the tick first reads the kick-off times cached by the
 * last run and, when nothing can possibly have changed, returns without
 * touching the network at all.
 *
 * `snapshot` is meta/ingest: { ymd, kickoffs: [epoch], lastRun, mode }.
 * Anything missing or from another day means "run" — a stale cache must never
 * be able to keep the ingester asleep through a matchday.
 */
function shouldRun(snapshot, now, todayYmd) {
  const s = snapshot || {};
  if (!s.ymd || s.ymd !== todayYmd) return { run: true, reason: 'new-day' };
  if (!s.lastRun) return { run: true, reason: 'no-previous-run' };

  const kickoffs = Array.isArray(s.kickoffs) ? s.kickoffs : [];
  if (!kickoffs.length) {
    return now - s.lastRun >= HOURLY * 1000
      ? { run: true, reason: 'hourly-baseline' }
      : { run: false, reason: 'no-fixtures-today' };
  }

  const earliest = Math.min.apply(null, kickoffs);
  const latest = Math.max.apply(null, kickoffs);

  /* Before the pre-match window opens, and after the last plausible cooldown
     closes, only the hourly baseline has anything to do. */
  if (now < earliest - PREMATCH_WINDOW_MIN * MIN ||
      now > latest + (115 + COOLDOWN_MIN) * MIN) {
    return now - s.lastRun >= HOURLY * 1000
      ? { run: true, reason: 'hourly-baseline' }
      : { run: false, reason: 'outside-match-window' };
  }

  /* Inside the window the previous run's own plan sets the pace, minus a
     slack second so a scheduler that fires at 59.8s is not held for a whole
     further minute. */
  const due = (s.intervalSec || LIVE) * 1000 - 1000;
  return now - s.lastRun >= due
    ? { run: true, reason: s.mode || 'in-window' }
    : { run: false, reason: 'not-due' };
}

module.exports = {
  HOURLY, LIVE, PREMATCH_OPEN, PREMATCH_SETTLED,
  PREMATCH_WINDOW_MIN, COOLDOWN_MIN,
  matchPlan, derivePlan, shouldRun,
};
