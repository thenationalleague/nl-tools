/**
 * nls/fetch.js — the upstream layer. Nothing here shapes anything.
 *
 * Kept apart from transform.js on purpose (spec §8): Stats Perform have agreed
 * in principle to a direct outlet key, and since NLS is downstream of SP,
 * going direct removes a hop. When that lands, this file and transform.js are
 * what change. Consumers read the shaped node and never see anything
 * upstream-shaped, so none of them change at all.
 *
 * The upstream is resolvable PER COMPETITION for the same reason — `nl` can
 * move to SP while `north`, `south` and `cup` stay on NLS, which is the likely
 * order given SP themselves only supply post-match detail for tiers 7.
 *
 * NEVER LOG A REQUEST URL. Harmless while the feed is open and unauthenticated,
 * but an SP outlet key sits in the URL path and would otherwise end up in run
 * logs and stack traces the moment one exists (spec §7.4). Log what happened,
 * never where it came from.
 */

'use strict';

const NLS_BASE = 'https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2';

const MAX_PAGES = 20;
const PAGE_SIZE = 100;
const TIMEOUT_MS = 15000;

/* Per-competition upstream resolution. One entry today; the shape is what
   matters, so adding `{ 89: { kind: 'sp', base: ... } }` later is a config
   change rather than a rewrite. */
const UPSTREAM = {
  default: { kind: 'nls', base: NLS_BASE },
};

function upstreamFor(compId) {
  return UPSTREAM[String(compId)] || UPSTREAM.default;
}

async function getJson(url, label) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error('upstream HTTP ' + res.status + ' (' + label + ')');
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('upstream timeout (' + label + ')');
    throw new Error('upstream failed (' + label + '): ' + err.message);
  } finally {
    clearTimeout(timer);
  }
}

/* Server-side date filtering, not a season fetch filtered locally. Four
   requests — one per competition — cover every match today, which is stage 1
   of the polling model in its entirety.

   The window is UTC because that is what the endpoint filters on; see the note
   in transform.ymdOf about late kick-offs. */
function dayWindow(ymd) {
  return 'from=' + encodeURIComponent(ymd + ' 00:00:00Z') +
         '&to=' + encodeURIComponent(ymd + ' 23:59:59Z');
}

async function fetchDayList(compId, seasonId, ymd) {
  const u = upstreamFor(compId);
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = u.base + '/matches/?seasonID=' + seasonId + '&competitionID=' + compId +
                '&' + dayWindow(ymd) + '&page.number=' + page + '&page.size=' + PAGE_SIZE;
    const json = await getJson(url, 'list ' + compId);
    const data = (json && json.data) || [];
    rows.push(...data);
    const total = json && json.meta && json.meta.totalCount;
    if (data.length < PAGE_SIZE || (total != null && rows.length >= total)) break;
  }
  return rows;
}

async function fetchSeasonList(compId, seasonId) {
  const u = upstreamFor(compId);
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = u.base + '/matches/?seasonID=' + seasonId + '&competitionID=' + compId +
                '&sort=kickOffDateUTC&page.number=' + page + '&page.size=' + PAGE_SIZE;
    const json = await getJson(url, 'season list ' + compId);
    const data = (json && json.data) || [];
    rows.push(...data);
    const total = json && json.meta && json.meta.totalCount;
    if (data.length < PAGE_SIZE || (total != null && rows.length >= total)) break;
  }
  return rows;
}

async function fetchDetail(matchId, compId) {
  const u = upstreamFor(compId);
  const json = await getJson(u.base + '/matches/' + matchId, 'detail');
  return (json && json.data) || null;
}

/* The official table. Authoritative because it carries points deductions and
   Cup shootout bonuses — see the header of derive.js for why that matters. */
async function fetchTable(compId, seasonId, roundId) {
  const u = upstreamFor(compId);
  const url = u.base + '/league-tables/?competitionID=' + compId + '&seasonID=' + seasonId +
              (roundId ? '&roundID=' + encodeURIComponent(roundId) : '');
  const json = await getJson(url, 'table ' + compId + (roundId ? '/' + roundId : ''));
  return (json && json.data) || [];
}

const CLUBS_META_URL =
  'https://raw.githubusercontent.com/thenationalleague/tools/main/assets/data/clubs-meta.json';

/* Season is derived, never hardcoded (spec §6). A literal year silently serves
   last season from August, which is the failure that looks like the feed
   breaking rather than like a bug in here. clubs-meta.json is the repo's own
   single source of truth for it, and season-rollover.yml flips it. */
async function fetchCurrentSeason() {
  const json = await getJson(CLUBS_META_URL, 'clubs-meta');
  const s = json && json.seasons && json.seasons.current;
  if (!s) throw new Error('clubs-meta has no seasons.current');
  return Number(s);
}

module.exports = {
  NLS_BASE, MAX_PAGES, PAGE_SIZE,
  upstreamFor, dayWindow,
  fetchDayList, fetchSeasonList, fetchDetail, fetchTable, fetchCurrentSeason,
};
