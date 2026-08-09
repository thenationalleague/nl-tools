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

/* Identify ourselves. Every other NLS consumer in this repo is either a browser
   or a GitHub Actions runner, and both send a real User-Agent; Node's fetch
   sends a bare `undici`, which is the kind of thing an edge WAF drops without
   explanation. Naming the client is also simply what a well-behaved API
   consumer does — if this traffic ever needs discussing with the operator, it
   should be identifiable in their logs rather than anonymous. */
const HEADERS = {
  accept: 'application/json',
  'user-agent': 'NLTools-Ingester/1.0 (+https://nl.tools)',
};

/* Failures here get ONE line in Cloud Logging and that line has to be enough
   to tell three very different problems apart, because the fix for each is
   unrelated:

     - an HTTP status with a body    → we are being refused (WAF, rate limit)
     - an abort                      → reachable but slow
     - a cause code (ENOTFOUND,
       ECONNREFUSED, UND_ERR_*)      → DNS, egress or TLS

   The first deploy failed all four competitions with none of that captured,
   which is a diagnostic gap rather than bad luck. The response body is safe to
   log — it is what the upstream sent us. The request URL still is not, and
   still is not logged: an outlet key would sit in its path. */
async function getJson(url, label) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 200);
      throw new Error('upstream HTTP ' + res.status + ' ' + res.statusText +
        ' (' + label + ')' + (snippet ? ' — body: ' + snippet : ' — empty body'));
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('upstream timeout after ' + TIMEOUT_MS + 'ms (' + label + ')');
    }
    /* undici hides the useful part in `cause`: err.message is a flat
       "fetch failed" for everything from a bad DNS record to a TLS handshake
       rejection. The code underneath is the answer. */
    const cause = err.cause || {};
    const detail = [cause.code, cause.errno, cause.message]
      .filter(Boolean).map(String).join(' ');
    throw new Error('upstream failed (' + label + '): ' + err.message +
      (detail ? ' — cause: ' + detail : ''));
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

/* `includePopulatedDates=true` returns meta.populatedDates — every date in the
   SEASON that has fixtures, with a count — regardless of the from/to window.
   So one narrow request yields both today's card and the whole matchday
   calendar, at no extra cost.

   That calendar is what makes the data browsable at all. RTDB rules grant
   reads per day (`fixtures/<comp>/<ymd>`) and never at the parent, deliberately
   — a consumer must name the day it wants rather than subscribing to the
   season. Correct for bandwidth and for licensing, but it means nothing can
   discover WHICH days exist. Without this the only way to find a matchday is
   to guess at dates. */
async function fetchDayList(compId, seasonId, ymd) {
  const u = upstreamFor(compId);
  const rows = [];
  let populatedDates = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = u.base + '/matches/?seasonID=' + seasonId + '&competitionID=' + compId +
                '&includePopulatedDates=true&' + dayWindow(ymd) +
                '&page.number=' + page + '&page.size=' + PAGE_SIZE;
    const json = await getJson(url, 'list ' + compId);
    const meta = (json && json.meta) || {};
    if (page === 1 && meta.populatedDates) populatedDates = meta.populatedDates;
    const data = (json && json.data) || [];
    rows.push(...data);
    const total = meta.totalCount;
    if (data.length < PAGE_SIZE || (total != null && rows.length >= total)) break;
  }
  return { rows, populatedDates };
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
