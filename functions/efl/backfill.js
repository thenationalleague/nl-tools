/**
 * efl/backfill.js — the EFL player-row backfill, minus the scheduler.
 *
 * One row per player per finished EFL match, built by nls/players.js from a
 * detail shaped by nls/transform.js with the EFL competition map. The rows
 * have the NLS row's shape exactly, plus `source: 'efl'`, so one reader can
 * serve both stores.
 *
 * WHERE IT IS WRITTEN, AND WHY NOT NEXT TO THE NLS ROWS
 * EFL data is the EFL's, licensed, and internal-only. The NLS rows live in
 * nl-widgets, the fan-facing database; these go to the nl-tools (staff)
 * database under efl/, whose root the rules keep closed. Nothing in a
 * browser can read them — only server-side identities (the EFL MCP's Cloud
 * Run service account, by IAM).
 *
 * Layout under efl/:
 *   players/<season>/apps/<playerID>/<matchID>   the row
 *   players/<season>/squads/<teamID>/<playerID>  name
 *   players/<season>/teams/<teamID>              club name (no clubs-meta here)
 *   players/<season>/matches/<matchID>           the ledger (complete, pids)
 *   meta/player-backfill/<compKey>/days/<ymd>    a matchday finished
 *   meta/player-backfill/<compKey>/pending       matchdays still to build
 *   meta/players                                 the last run's summary
 *
 * WHY THE WHOLE SEASON LIST AND NOT A DAY LIST
 * The NLS backfill discovers matchdays from includePopulatedDates. The EFL
 * host answers that query with a 404 (probed 26/10/2026 — see efl/feed.js),
 * but it does honour seasonID with page.size=1000, so one request per
 * competition per run gives every match and its kick-off. Five requests an
 * hour, about 1,900 rows, is cheap; matchdays are grouped from it here.
 *
 * Bounded and resumable: days are taken oldest first across all five
 * competitions, until MATCHES_PER_RUN detail fetches or TIME_BUDGET_MS. A
 * season's 1,656 league matches plus the cups is about fourteen runs, so a
 * fresh season or a lost ledger is rebuilt inside a day.
 *
 * Pure apart from the `store` and `feed` the caller passes in, which is what
 * lets tests/efl-players.test.mjs run it against an in-memory store.
 */

'use strict';

const T = require('../nls/transform');
const P = require('../nls/players');
const EF = require('./feed');

const ROOT = 'efl';
const MATCHES_PER_RUN = 150;
const TIME_BUDGET_MS = 200 * 1000;
const RETRY_MS = 6 * 60 * 60 * 1000;
const RETRY_DAYS = 7;
const CONCURRENCY = 6;

/* The season is the first year of the campaign. From June the season just
   ended is over (the play-off finals finish in May), so June onwards belongs
   to the next one — the same rule the EFL MCP's resolveSeason uses, so both
   ends agree on what "the current season" means. */
function seasonOf(date) {
  const d = new Date(date);
  return d.getUTCMonth() >= 5 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

/* EFL cup ties level after 90 minutes go straight to penalties — there is no
   extra time in the Carabao Cup before the semi-final second legs, nor in the
   EFL Trophy. nls/players.js reads any penalty result as extra time and would
   bill every starter 120 minutes. Probed 26/10/2026: shootout ties carry
   resultType "PenaltyShootout" with matchTeams[].extraScore empty and no
   event in an extra-time period, so that is the test. A tie that genuinely
   went to extra time keeps its 120. */
function straightToPenalties(detail) {
  if (!detail || !/penalt/i.test(String(detail.resultType || ''))) return false;
  const extraScore = [detail.home, detail.away].some((s) => s && s.extraScore != null);
  const evs = [].concat(detail.goals || [], detail.bookings || [], detail.subs || []);
  const extraEvent = evs.some((e) => /extra/i.test(String(e.period || '')));
  return !extraScore && !extraEvent;
}

function buildRows(detail, now) {
  const input = straightToPenalties(detail)
    ? Object.assign({}, detail, { resultType: 'NormalResult' })
    : detail;
  const built = P.buildPlayerRows(input, now);
  Object.values(built.rows).forEach((r) => { r.source = 'efl'; });
  return built;
}

/* Season list rows → { [ymd]: { finished: [row], unsettled: n } } for one
   competition. `unsettled` counts matches on a past day that are neither
   finished nor postponed/abandoned — a result not yet entered. A day with
   one is not closed until it is a week old, or that match would be lost. */
function groupByDay(listRows, now) {
  const days = {};
  (listRows || []).forEach((m) => {
    const r = T.shapeIndexRow(m, now, EF.COMPETITIONS);
    if (!r) return;
    const ymd = r.ko.slice(0, 10);
    const day = days[ymd] || (days[ymd] = { finished: [], unsettled: 0 });
    if (r.finished) day.finished.push(r);
    else if (!r.postponed && r.period !== 'abandoned') day.unsettled += 1;
  });
  return days;
}

/* Every matchday before today not yet marked done, oldest first across all
   competitions, so the budget is spent chronologically rather than finishing
   the Championship before League Two has started. */
function planDays(byComp, doneByComp, todayYmd) {
  const plan = [];
  Object.keys(byComp).forEach((key) => {
    const done = doneByComp[key] || {};
    Object.keys(byComp[key]).forEach((ymd) => {
      if (ymd < todayYmd && !done[ymd]) plan.push({ key, ymd, day: byComp[key][ymd] });
    });
  });
  return plan.sort((a, b) => a.ymd.localeCompare(b.ymd) || a.key.localeCompare(b.key));
}

function isDue(ledger, now) {
  if (!ledger) return true;
  if (ledger.complete) return false;
  return now - (ledger.writtenAt || 0) >= RETRY_MS;
}

async function mapPool(items, limit, fn) {
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (cursor < items.length) {
      const i = cursor++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

async function writeMatch(store, seasonID, detail, prevLedger, now) {
  const built = buildRows(detail, now);
  const base = 'players/' + seasonID + '/';
  const updates = {};
  Object.values(built.rows).forEach((r) => {
    updates[base + 'apps/' + r.playerID + '/' + detail.id] = r;
    if (r.teamID) updates[base + 'squads/' + r.teamID + '/' + r.playerID] = r.name || r.playerID;
  });
  /* Club names by teamID. The EFL has no clubs-meta and its list rows carry
     no teamID, so this is the only place a reader can turn "Wrexham" into a
     teamID without fetching match detail. A hundred-odd entries a season. */
  [detail.home, detail.away].forEach((side) => {
    if (side && side.id && side.name) updates[base + 'teams/' + side.id] = side.name;
  });
  /* A corrected team sheet can remove a player; without this his phantom
     appearance would stay in his season. */
  Object.keys((prevLedger && prevLedger.pids) || {}).forEach((pid) => {
    if (!built.rows[pid]) updates[base + 'apps/' + pid + '/' + detail.id] = null;
  });
  updates[base + 'matches/' + detail.id] =
    P.ledgerEntry(detail, built, now, ((prevLedger && prevLedger.attempts) || 0) + 1);
  await store.update(updates);
  return built;
}

/**
 * One run. `store` is { read(path), update(updates) } rooted at efl/;
 * `feed` is { fetchSeasonList(compId, seasonID), fetchDetail(matchID) }.
 * Returns the summary it also writes to meta/players.
 */
async function runBackfill({ store, feed, now, todayYmd, seasonID, started, clock }) {
  const tick = clock || Date.now;
  const t0 = started == null ? tick() : started;
  const outOfTime = () => tick() - t0 > TIME_BUDGET_MS;
  const giveUpBefore = P.ymdMinusDays(todayYmd, RETRY_DAYS);

  const byComp = {};
  const doneByComp = {};
  const listErrors = [];
  for (const compId of EF.COMP_IDS) {
    const key = EF.COMPETITIONS[compId].key;
    try {
      byComp[key] = groupByDay(await feed.fetchSeasonList(compId, seasonID), now);
      doneByComp[key] = (await store.read('meta/player-backfill/' + key + '/days')) || {};
    } catch (err) {
      listErrors.push(key + ': ' + ((err && err.message) || String(err)));
    }
  }

  const plan = planDays(byComp, doneByComp, todayYmd);
  const closed = {};
  const days = [];
  let fetched = 0;
  let written = 0;
  let errors = 0;
  let stoppedEarly = false;

  for (const item of plan) {
    if (fetched >= MATCHES_PER_RUN || outOfTime()) { stoppedEarly = true; break; }
    const { key, ymd, day } = item;

    const ledgers = {};
    await Promise.all(day.finished.map(async (r) => {
      ledgers[r.id] = await store.read('players/' + seasonID + '/matches/' + r.id);
    }));
    const due = day.finished.filter((r) => isDue(ledgers[r.id], now));

    let dayErrors = 0;
    let dayWritten = 0;
    await mapPool(due, CONCURRENCY, async (r) => {
      try {
        const d = T.shapeDetail(await feed.fetchDetail(r.id), now, EF.COMPETITIONS);
        if (!d) { dayErrors += 1; return; }
        const built = await writeMatch(store, seasonID, d, ledgers[r.id], now);
        ledgers[r.id] = { complete: built.complete };
        dayWritten += 1;
      } catch (err) {
        dayErrors += 1;
      }
    });
    fetched += due.length;
    written += dayWritten;
    errors += dayErrors;

    const allComplete = day.finished.every((r) => ledgers[r.id] && ledgers[r.id].complete);
    const tooOld = ymd < giveUpBefore;
    /* Never close a day while a fetch is failing, or it would be closed on
       matches it never read. */
    if (!dayErrors && (tooOld || (allComplete && !day.unsettled))) {
      await store.update({ ['meta/player-backfill/' + key + '/days/' + ymd]: true });
      closed[key] = (closed[key] || 0) + 1;
    }
    if (due.length) days.push(key + '/' + ymd + ':' + dayWritten + (dayErrors ? '!' + dayErrors : ''));
  }

  const pending = {};
  Object.keys(byComp).forEach((key) => {
    const done = doneByComp[key] || {};
    const open = Object.keys(byComp[key]).filter((d) => d < todayYmd && !done[d]).length;
    pending[key] = Math.max(0, open - (closed[key] || 0));
  });
  const pendingUpdates = {};
  Object.keys(pending).forEach((key) => {
    pendingUpdates['meta/player-backfill/' + key + '/pending'] = pending[key];
  });
  await store.update(pendingUpdates);

  const summary = {
    seasonID,
    lastRun: now,
    matchesFetched: fetched,
    matchesWritten: written,
    errorCount: errors + listErrors.length,
    listErrors: listErrors.length ? listErrors : null,
    pending,
    caughtUp: !stoppedEarly && !listErrors.length &&
      Object.values(pending).every((n) => n === 0),
    days,
    durationMs: tick() - t0,
  };
  if (!summary.errorCount) summary.lastSuccess = now;
  /* Field by field, so a failed run leaves the last good lastSuccess in
     place — a multi-path update replaces each path it names, and RTDB
     rejects an undefined value outright. */
  const metaUpdates = {};
  Object.keys(summary).forEach((k) => { metaUpdates['meta/players/' + k] = summary[k]; });
  await store.update(metaUpdates);
  return summary;
}

module.exports = {
  ROOT, MATCHES_PER_RUN, TIME_BUDGET_MS, RETRY_MS, RETRY_DAYS,
  seasonOf, straightToPenalties, buildRows, groupByDay, planDays, isDue,
  writeMatch, runBackfill,
};
