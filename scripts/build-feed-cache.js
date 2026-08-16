#!/usr/bin/env node
/**
 * build-feed-cache.js — the National League's own copy of its fixture data.
 *
 * Step 1 of the RTDB cache model (see embeds/rtdb-cache-model.md). Writes the
 * node. Changes no consumer. Additive by construction: nothing reads this yet,
 * so it cannot break anything that exists.
 *
 * WHY
 * ---
 * Nineteen places in this repo fetch nationalleagueservices.co.uk directly.
 * Fan Widgets alone makes up to sixty paginated requests on load, and the
 * leaderboard job pulls the same ~1,650 fixtures every quarter of an hour.
 * That is the same slow-changing data, fetched repeatedly, by everything —
 * and it means a third party owns the League's fixtures, results and history
 * with no copy on this side.
 *
 * SHAPE, AND WHY IT IS THIS SHAPE
 * -------------------------------
 * Designed so live match state can arrive later without a rebuild. Stats
 * Perform have agreed in principle to a direct outlet key, and the intended
 * destination is a Cloud Run ingester writing live state into RTDB. If this
 * node assumed "only slow-changing data lives here", it would need
 * restructuring once consumers depended on it.
 *
 *   feed/
 *     meta/<seasonId>          lastUpdated, source, counts
 *     fixtures/<seasonId>/<matchday>/<matchId>
 *     ...                      live/ lands here later as a SIBLING
 *
 * Three rules follow from that, and they are load-bearing:
 *
 *   1. Cadence appears nowhere in a path. No /hourly/, no /15min/. Live state
 *      writing every few seconds and fixtures writing every few hours have to
 *      coexist under one root without either name being a lie.
 *   2. Every node carries lastUpdated. A consumer decides for itself whether
 *      what it just read is too old to render — see §5 of the brief. Stale and
 *      rendering is the dangerous state; empty is merely unhelpful.
 *   3. Fetch and transform are separate functions. The eventual upstream is
 *      likely Opta SDAPI rather than NLS, with different field names. Swapping
 *      it must mean rewriting fetchSeason(), not every consumer — so nothing
 *      upstream-shaped is allowed past toFeedFixture().
 *
 * SLICES, NOT ONE FAT NODE
 * ------------------------
 * Fixtures are grouped per matchday so a client reads the twenty records it
 * needs rather than the season's sixteen hundred. That is the right call for
 * bandwidth, and it is also the right call for licensing: the Stats Perform
 * work order is league-use-only, and serving one match to a page that needs it
 * is materially different from publishing a season in bulk.
 *
 * ACCESS
 * ------
 * Deny-by-default. feed/ grants read to the staff claim only, which covers
 * Fan Widgets (step 2) and no fan. Public read is a step 3 decision and needs
 * the licensing question settled first — it is not this script's to make.
 *
 * Usage:
 *   node scripts/build-feed-cache.js            # fetch, transform, write
 *   node scripts/build-feed-cache.js --dry-run  # fetch, transform, print
 *
 * Auth: GOOGLE_ACCESS_TOKEN from the Action's Workload Identity Federation
 * step. Nothing long-lived exists and there is no key in this repo.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const DB_URL = 'https://nl-widgets-default-rtdb.europe-west1.firebasedatabase.app';
const API_BASE = 'https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2';
const COMP_IDS = [89, 373, 372];        // National, North, South
const MAX_PAGES = 20;
const SOURCE = 'nls';                   // recorded on every write, so a later
                                        // upstream swap is visible in the data

// ---------------------------------------------------------------------------
// Season
// ---------------------------------------------------------------------------

/* Same July boundary as the widgets, the leaderboard job and
   season-rollover.yml, which flips clubs-meta at 02:00 on 1 July.
   Mirrors canon NL.season.fromDate (system/nl-utils.js) — Node has no
   window.NL, so keep this copy in lockstep. */
function deriveSeasonId(d) {
  return (d.getMonth() + 1) >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}

function currentSeasonId(now) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/clubs-meta.json'), 'utf8'));
    const s = meta && meta.seasons && meta.seasons.current;
    if (s) return Number(s);
    console.warn('clubs-meta has no seasons.current — falling back to the clock');
  } catch (e) {
    console.warn('clubs-meta unreadable (' + e.message + ') — falling back to the clock');
  }
  return deriveSeasonId(now || new Date());
}

// ---------------------------------------------------------------------------
// Transform — the boundary. Nothing above this line may leak below it.
// ---------------------------------------------------------------------------

function normaliseUtc(s) {
  if (!s) return null;
  const iso = s.indexOf('T') >= 0 ? s : s.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/* Europe/London, not UTC: a 20:00 kick-off in June belongs to that day's
   matchday, and every consumer in this repo already keys on that string. */
function matchdayOf(ko) {
  return ko ? ko.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) : '';
}

/* THE SWAPPABLE BOUNDARY.

   Upstream-shaped in, consumer-shaped out. Field names on the left are NLS's
   and are expected to change when the upstream does; field names on the right
   are the contract this repo depends on and must not.

   Returns null for anything unusable rather than a half-record — a fixture
   with no kick-off cannot be filed under a matchday, and a consumer reading a
   record is entitled to assume it is complete. */
function toFeedFixture(m, now) {
  const a = (m && m.attributes) || {};
  /* The same fallback chain build-leaderboard.js's dateOf() uses, character
     for character. Two parsers of one feed disagreeing about which field holds
     the kick-off is exactly the drift this boundary exists to prevent — and I
     had already dropped one variant from it. */
  const ko = normaliseUtc(a.kickOffDateUTC || a.kickoffDateUTC || a.kickOffDate ||
                          a.kickoffDate || a.date || '');
  if (!m || !m.id || !ko || !a.homeTeam || !a.awayTeam) return null;
  return {
    id:    String(m.id),
    ko:    ko.toISOString(),
    comp:  Number(a.competitionID) || null,
    period: String(a.matchPeriod || ''),
    home:  side(a.homeTeam),
    away:  side(a.awayTeam),
    lastUpdated: now.getTime(),
    source: SOURCE,
  };
}

function side(t) {
  return {
    id:    t.teamID != null ? String(t.teamID) : '',
    name:  String(t.name || t.shortName || ''),
    score: t.score == null ? null : Number(t.score),
  };
}

/* Grouped per matchday, so a consumer reads a day rather than a season. */
function toFeedShape(matches, now) {
  const byDay = {};
  let kept = 0, skipped = 0;
  for (const m of matches) {
    const f = toFeedFixture(m, now);
    if (!f) { skipped += 1; continue; }
    const md = matchdayOf(new Date(f.ko));
    if (!md) { skipped += 1; continue; }
    (byDay[md] || (byDay[md] = {}))[f.id] = f;
    kept += 1;
  }
  return { byDay, kept, skipped };
}

// ---------------------------------------------------------------------------
// Fetch — replaceable without touching anything above
// ---------------------------------------------------------------------------

async function fetchCompetition(compId, seasonId) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    /* Deliberately not logging the URL. Harmless today, but once an
       authenticated feed is in play the outlet key sits in the path and would
       otherwise end up in run logs and stack traces. Log what happened, never
       where it came from. */
    const url = API_BASE + '/matches/?competitionID=' + compId + '&seasonID=' + seasonId +
                '&sort=kickOffDateUTC&page.number=' + page + '&page.size=100';
    const res = await fetch(url);
    if (!res.ok) throw new Error('upstream HTTP ' + res.status + ' (competition ' + compId + ')');
    const json = await res.json();
    const rows = (json && json.data) || [];
    all.push(...rows);
    const total = json && json.meta && json.meta.totalCount;
    if (rows.length < 100 || (total != null && all.length >= total)) break;
  }
  return all;
}

async function fetchSeason(seasonId) {
  const pages = await Promise.all(COMP_IDS.map((c) => fetchCompetition(c, seasonId)));
  return pages.flat();
}

// ---------------------------------------------------------------------------
// RTDB
// ---------------------------------------------------------------------------

/* Deliberately a local copy of build-leaderboard.js's helper rather than a
   shared module. Extracting it would mean editing the job that currently
   writes locks/ and motm-windows/ — the two things holding the prediction and
   nomination deadlines — for no behaviour change. Promote it when a third
   consumer appears and the refactor can be verified on something other than
   the deadline enforcement. */
async function dbPut(p, value, token) {
  const res = await fetch(DB_URL + '/' + p + '.json', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('RTDB PUT ' + p + ': HTTP ' + res.status + ' ' + body.slice(0, 300));
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const now = new Date();
  const seasonId = currentSeasonId(now);

  const raw = await fetchSeason(seasonId);
  const { byDay, kept, skipped } = toFeedShape(raw, now);
  const days = Object.keys(byDay).sort();

  console.log('season ' + seasonId + ': ' + raw.length + ' upstream, ' +
              kept + ' cached across ' + days.length + ' matchdays' +
              (skipped ? ', ' + skipped + ' unusable' : ''));

  const meta = {
    lastUpdated: now.getTime(),
    source: SOURCE,
    seasonId: seasonId,
    fixtures: kept,
    matchdays: days.length,
    firstMatchday: days[0] || null,
    lastMatchday: days[days.length - 1] || null,
  };

  if (dryRun) {
    console.log(JSON.stringify(meta, null, 2));
    const sample = days[0];
    if (sample) {
      console.log('sample matchday ' + sample + ':');
      console.log(JSON.stringify(Object.values(byDay[sample])[0], null, 2));
    }
    console.log('dry run — nothing written');
    return;
  }

  /* Refusing to blank the node is the whole safety property here. An upstream
     that returns 200 with an empty list would otherwise wipe the only copy
     the League has, which is the exact failure this cache exists to survive. */
  if (!kept) throw new Error('REFUSING TO WRITE: upstream returned no usable fixtures');

  await dbPut('feed/fixtures/' + seasonId, byDay, token());
  await dbPut('feed/meta/' + seasonId, meta, token());
  console.log('wrote feed/fixtures/' + seasonId + ' and feed/meta/' + seasonId);
}

function token() {
  const t = process.env.GOOGLE_ACCESS_TOKEN;
  if (!t) throw new Error('GOOGLE_ACCESS_TOKEN is not set — the auth step did not mint one');
  return t;
}

module.exports = {
  deriveSeasonId, currentSeasonId,
  toFeedFixture, toFeedShape, matchdayOf, normaliseUtc,
  SOURCE,
};

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
