/**
 * efl/feed.js — the EFL upstream. Nothing here shapes anything.
 *
 * The EFL feed is another deployment of the same multi-club-matches codebase
 * NLS runs (host `webapi.gc.eflservices.co.uk`, not NLS's `web.` host), so the
 * response shapes are NLS's and nls/transform.js shapes them, given the
 * competition map below. Requests go through nls/fetch.js getJson, for the
 * same timeout, User-Agent and one-line failure reporting.
 *
 * EFL DATA IS LICENSED AND INTERNAL-ONLY. Nothing read here may reach a
 * fan-facing surface: it is written to the nl-tools (staff) database, never
 * to nl-widgets, and read only by server-side identities (the EFL MCP).
 *
 * Shapes this file relies on were probed from a GitHub Actions runner on
 * 26/10/2026 (thenationalleague/efl-mcp, branch claude/probe-player-ids,
 * read back through check-run annotations):
 *   - the list endpoint filters by seasonID: League Two seasonID=2026 gave
 *     552 rows from 2026-08-15 to 2027-05-08, seasonID=2025 gave 557 rows
 *     from 2025-08-02 to 2026-05-25 (the play-off final);
 *   - page.size=1000 is honoured — 552 rows, totalCount 552, no links.next;
 *   - includePopulatedDates with a from/to day window answers 404 on this
 *     host, which is why matchdays come from the season list instead;
 *   - list rows carry competitionID, kickOffDateUTC and matchPeriod; detail
 *     carries matchID, competitionID, seasonID, kickOffUTC, period,
 *     homeTeamID, matchDetails.resultType and matchTeams[].players.Start/Sub
 *     with playerID — the same fields nls/transform.js reads.
 *
 * NEVER LOG A REQUEST URL — same reason as nls/fetch.js.
 */

'use strict';

const F = require('../nls/fetch');

const EFL_BASE = 'https://multi-club-matches.webapi.gc.eflservices.co.uk/v2';

/* The EFL's competition IDs, in the shape nls/transform.js takes as its
   optional competitions map. Keys match the EFL MCP's competition names, so
   a row's compKey is the same word a caller passes to the MCP. Verified
   against live responses 03/09/2026 (efl-mcp v1.0) — never derive these.
   `detailAvailability` is 'full' for every competition: the probe found
   complete XIs and benches on League One, League Two and both cups. */
const COMPETITIONS = {
  10: { key: 'championship', label: 'Championship', detailAvailability: 'full', source: 'efl' },
  11: { key: 'league_one',   label: 'League One',   detailAvailability: 'full', source: 'efl' },
  12: { key: 'league_two',   label: 'League Two',   detailAvailability: 'full', source: 'efl' },
  2:  { key: 'carabao',      label: 'Carabao Cup',  detailAvailability: 'full', source: 'efl' },
  7:  { key: 'trophy',       label: 'EFL Trophy',   detailAvailability: 'full', source: 'efl' },
};

const COMP_IDS = Object.keys(COMPETITIONS).map(Number);

const PAGE_SIZE = 1000;
const MAX_PAGES = 5;

/* The whole season for one competition: about 552 rows for a league, under
   100 for a cup, so normally one request. totalCount is the API's own count
   for the query, so a shortfall is a truncated fetch and is thrown rather
   than built on — a day built from half a list would be closed half-done. */
async function fetchSeasonList(compId, seasonId) {
  const rows = [];
  let total = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = EFL_BASE + '/matches/?competitionID=' + compId + '&seasonID=' + seasonId +
                '&page.number=' + page + '&page.size=' + PAGE_SIZE;
    const json = await F.getJson(url, 'efl season list ' + compId);
    const data = (json && json.data) || [];
    rows.push(...data);
    if (total == null && json && json.meta && typeof json.meta.totalCount === 'number') {
      total = json.meta.totalCount;
    }
    if (data.length < PAGE_SIZE || (total != null && rows.length >= total)) break;
  }
  if (total != null && rows.length < total) {
    throw new Error('efl season list ' + compId + ' truncated: ' + rows.length + ' of ' + total);
  }
  return rows;
}

async function fetchDetail(matchId) {
  const json = await F.getJson(EFL_BASE + '/matches/' + encodeURIComponent(matchId), 'efl detail');
  return (json && json.data) || null;
}

module.exports = { EFL_BASE, COMPETITIONS, COMP_IDS, fetchSeasonList, fetchDetail };
