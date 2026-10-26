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

/* Extra time, decided on the evidence the EFL feed actually carries rather
   than on resultType alone. nls/players.js reads any penalty result as extra
   time, but EFL cup ties level after 90 minutes mostly go straight to
   penalties, and an aggregate tie can go to extra time with no event in it.
   Probed 26/10/2026 across every non-normal result and every play-off match
   in 2023/24–2025/26 (163 matches):
     - when extra time was played, matchTeams[].extraScore is set on both
       sides — 0 when nobody scored in it (the 2023/24 League Two and 2024/25
       League One play-off finals, both decided on penalties after extra
       time) — and events carry eventPeriod ExtraFirstHalf / ExtraSecondHalf
       or the numeric periods 3 / 4;
     - when a tie went straight to penalties, extraScore is null and no
       event is in an extra-time period, whatever stoppage time ran to. */
function wentToExtraTime(detail) {
  if (!detail) return false;
  if (/extra/i.test(String(detail.resultType || ''))) return true;
  if ([detail.home, detail.away].some((s) => s && s.extraScore != null)) return true;
  const evs = [].concat(detail.goals || [], detail.bookings || [], detail.subs || []);
  return evs.some((e) => /extra|^[34]$/i.test(String(e.period == null ? '' : e.period)));
}

function straightToPenalties(detail) {
  return Boolean(detail) && /penalt/i.test(String(detail.resultType || '')) && !wentToExtraTime(detail);
}

/* buildPlayerRows decides 90 or 120 from resultType and event periods, so the
   EFL evidence is handed to it as a resultType it already understands. */
function buildRows(detail, now) {
  let input = detail;
  if (wentToExtraTime(detail)) input = Object.assign({}, detail, { resultType: 'AfterExtraTime' });
  else if (straightToPenalties(detail)) input = Object.assign({}, detail, { resultType: 'NormalResult' });
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
  /* Replaces the whole entry, so a previous lastError goes with it. */
  const ledger = P.ledgerEntry(detail, built, now, ((prevLedger && prevLedger.attempts) || 0) + 1);
  updates[base + 'matches/' + detail.id] = ledger;
  await store.update(updates);
  return ledger;
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
    const due = day.finished.filter((r) => P.isDue(ledgers[r.id], now, RETRY_MS));

    let dayErrors = 0;
    let dayWritten = 0;
    await mapPool(due, CONCURRENCY, async (r) => {
      try {
        const d = T.shapeDetail(await feed.fetchDetail(r.id), now, EF.COMPETITIONS);
        if (!d) throw new Error('detail could not be shaped');
        ledgers[r.id] = await writeMatch(store, seasonID, d, ledgers[r.id], now);
        dayWritten += 1;
      } catch (err) {
        dayErrors += 1;
        /* Recorded, so the six-hour retry applies instead of a refetch every
           hour; earlier pids are kept so a corrected sheet can still remove
           their rows (nls/players.js failureLedger). */
        const entry = P.failureLedger(ledgers[r.id], r.id, key, now, err && err.message);
        try {
          await store.update({ ['players/' + seasonID + '/matches/' + r.id]: entry });
          ledgers[r.id] = entry;
        } catch (writeErr) {
          /* The store itself is failing; leave the ledger as it was, so
             the match stays due and the day stays open. */
        }
      }
    });
    fetched += due.length;
    written += dayWritten;
    errors += dayErrors;

    /* The shared closing rule (nls/players.js dayClosed): every team sheet
       in, or — past the retry window — every match has had its look, a
       failing fetch MAX_FAILED_ATTEMPTS times. The one EFL addition: a fresh
       day with a result still not entered stays open, or that match would
       never be built. */
    const ids = day.finished.map((r) => r.id);
    const closable = P.dayClosed(ledgers, ids, ymd, giveUpBefore) &&
      (!day.unsettled || ymd < giveUpBefore);
    if (closable) {
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
  seasonOf, wentToExtraTime, straightToPenalties, buildRows, groupByDay, planDays,
  writeMatch, runBackfill,
};
