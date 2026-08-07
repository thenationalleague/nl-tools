#!/usr/bin/env node
/**
 * build-leaderboard.js — pre-compute the Score Predictor's leaderboard so the
 * widget stops reading every fan's raw predictions to draw it.
 *
 * Why this exists
 * ---------------
 * The widget currently computes standings in the browser from
 * `users` and `predictions` read at tree root. That root read is the whole
 * problem: it hands every client the complete list of jwtIds, which is what
 * makes the rest of the data enumerable. The rules cannot be tightened while
 * the leaderboard depends on it.
 *
 * This writes a `leaderboard/` node containing exactly what the table already
 * shows in public — a name, a crest, three numbers — and nothing else. The
 * widget then reads that instead, and `users`/`predictions` can be locked
 * down. See embeds/auth-hardening-plan.md §4.
 *
 * THE AGGREGATE MUST CARRY NO jwtIds. A row is a rendered result, not a
 * pointer. Adding an id "just for the you-highlight" would republish the id
 * list in a readable node and undo the entire exercise — hence `rowHash`,
 * which the client can match against its own id without anyone being able to
 * work backwards from it.
 *
 * It also stops the table getting slower: every client currently downloads
 * the whole predictions tree, which grows with every registration. This is a
 * small fixed read that does not.
 *
 * Scoring, ordering and filtering are ported from the widget deliberately
 * verbatim. If they drift, the table visibly changes for fans — so the pure
 * functions are exported and covered by tests/leaderboard.test.mjs.
 *
 * Usage:
 *   node scripts/build-leaderboard.js            # compute and write
 *   node scripts/build-leaderboard.js --dry-run  # compute and print, no write
 *
 * Auth: GOOGLE_ACCESS_TOKEN, a short-lived OAuth token minted by the Action's
 * Workload Identity Federation step. The NL Google org blocks service-account
 * key creation — the right policy — so nothing long-lived exists to leak, and
 * there is no key in this repo to find.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// Config — mirrors embeds/score-predictor.html. Changing one without the other
// makes the served table disagree with the widget's own arithmetic.
// ---------------------------------------------------------------------------

const DB_URL = 'https://nl-widgets-default-rtdb.europe-west1.firebasedatabase.app';
const API_BASE = 'https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2';
const COMP_IDS = [89, 373, 372];        // National, North, South
const MAX_PAGES = 10;
const IN_PLAY_MIN = 105;                // past this from KO, an unmarked match has finished
const CUTOFF_MIN = 60;                  // predictions lock this long before kick-off
const FALLBACK_SEASON_ID = 2026;

/* Salt for the row hash. Public by necessity — the widget has to compute the
   same hash from its own jwtId to find its row, so it ships in the bundle.
   That is acceptable and not a leak: the hash is a *confirmation* check, not
   a lookup. Someone already holding a jwtId could confirm that fan appears on
   the leaderboard; they still cannot list ids, which is the property that
   matters. Changing this value orphans every existing row's highlight until
   the next run, so change it in lockstep with the widget or not at all. */
const ROW_SALT = 'nl-predictor-leaderboard-v1';
const HASH_LEN = 12;

// ---------------------------------------------------------------------------
// Match helpers — ported verbatim from the widget
// ---------------------------------------------------------------------------

function normaliseUtc(s) {
  if (!s) return null;
  const iso = s.indexOf('T') >= 0 ? s : s.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
function dateOf(m) {
  const a = (m && m.attributes) || {};
  return String(a.kickOffDateUTC || a.kickoffDateUTC || a.kickOffDate || a.kickoffDate || a.date || '');
}
function koOf(m) { return normaliseUtc(dateOf(m)); }
function periodOf(m) { return ((m && m.attributes && m.attributes.matchPeriod) || '').toLowerCase(); }

/* Europe/London date, not UTC: a 20:00 kick-off in June is still that day's
   matchday, and the widget keys predictions by this string. */
function bstDateOf(d) {
  if (!d) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}
function matchdayKeyOf(m) { return bstDateOf(koOf(m)); }
function monthOfMatchday(mdKey) { return String(mdKey || '').slice(0, 7); }

/* Only 'post' counts towards a tally. An in-play period is not believed
   forever — a match abandoned mid-game, or a feed that simply stops updating,
   would otherwise never settle. This is the widget's stateOf() reduced to the
   cases scoring cares about; 'live', 'pre' and 'unresolved' all collapse to
   "not counted", which is the same outcome as the widget's fuller version. */
function isSettled(m, now) {
  const p = periodOf(m);
  if (p === 'postponed' || p === 'abandoned') return false;
  if (p === 'fulltime' || p === 'postmatch') return true;
  if (p === 'firsthalf' || p === 'halftime' || p === 'secondhalf' ||
      p === 'extratime' || p === 'penalties') {
    return false;
  }
  // PreMatch, or a period we do not recognise: fall back to the clock, exactly
  // as the widget does for a snapshot that went stale between fetches. Past
  // IN_PLAY_MIN from kick-off with no contradicting period, the widget calls
  // it 'post' and counts it — so this must too, or a match the feed never
  // marked FullTime would score in the browser and not in the aggregate.
  const ko = koOf(m);
  if (!ko) return false;
  return (now - ko) / 60000 >= IN_PLAY_MIN;
}

function outcome(h, a) { return h > a ? 'H' : (h < a ? 'A' : 'D'); }

/* Counting model — no points. 'exact' implies a correct result too. */
function verdictOf(predH, predA, realH, realA) {
  if (predH == null || predA == null || realH == null || realA == null) return null;
  if (predH === realH && predA === realA) return 'exact';
  if (outcome(predH, predA) === outcome(realH, realA)) return 'result';
  return 'wrong';
}

function rowHash(jwtId) {
  return crypto.createHash('sha256').update(ROW_SALT + String(jwtId)).digest('hex').slice(0, HASH_LEN);
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/* One user's tally over a scope. `scope` is {kind:'season'} | {kind:'month',
   key:'YYYY-MM'} | {kind:'day', key:'YYYY-MM-DD'}. */
function tallyFor(predsByDay, matches, scope, now) {
  const t = { results: 0, exacts: 0, settled: 0 };
  for (const m of matches) {
    const md = matchdayKeyOf(m);
    if (scope.kind === 'month' && monthOfMatchday(md) !== scope.key) continue;
    if (scope.kind === 'day' && md !== scope.key) continue;
    const p = predsByDay[md] && predsByDay[md][m.id];
    if (!p) continue;
    if (!isSettled(m, now)) continue;
    const v = verdictOf(p.home, p.away, m.attributes.homeTeam.score, m.attributes.awayTeam.score);
    if (v == null) continue;
    t.settled += 1;
    if (v === 'exact') { t.exacts += 1; t.results += 1; }
    else if (v === 'result') { t.results += 1; }
  }
  return t;
}

/* Rows for one scope, in the widget's display order: results desc, exacts
   desc, then forename A-Z. Rows with nothing settled are dropped — the widget
   drops them too, except for the signed-in fan's own row, which it can add
   back from data it already holds.

   Field names are short because this is read by every client on every load:
   n name, c crest, t teamId, tn teamName, r results, e exacts, s settled,
   h row hash. `t` is a club id, not a person — it is what lets the widget
   filter to "fans of my club" without another read. */
function buildRows(users, predictions, matches, scope, now) {
  const rows = [];
  for (const jwtId of Object.keys(users)) {
    const reg = users[jwtId];
    if (!reg || !reg.forename) continue;
    const t = tallyFor(predictions[jwtId] || {}, matches, scope, now);
    /* Everyone who has registered appears in the SEASON table, even on nought
       — the season is the thing you are taking part in, and a fan who has just
       signed up should be able to find themselves in it.

       A narrower scope drops them. A fan who joined in November has not scored
       nothing in October; they were not there, and a row of zeroes in a month
       they sat out reads as a failure rather than an absence. Same reasoning
       as the widget only offering periods that have actually happened. */
    if (!t.settled && scope.kind !== 'season') continue;
    rows.push({
      n: (reg.forename + ' ' + (reg.surnameInitial || '')).trim(),
      c: reg.crestUrl || '',
      t: reg.teamId || '',
      tn: reg.teamName || '',
      r: t.results,
      e: t.exacts,
      s: t.settled,
      h: rowHash(jwtId),
      _sort: reg.forename || '',
    });
  }
  rows.sort((a, b) => {
    if (b.r !== a.r) return b.r - a.r;
    if (b.e !== a.e) return b.e - a.e;
    return a._sort.localeCompare(b._sort);
  });
  return rows.map((r) => { delete r._sort; return r; });
}

/* Every scope the widget can ask for: the whole season, each month that has a
   matchday, and each matchday. Club-v-club is deliberately NOT precomputed —
   the widget derives it by grouping these same rows by `t`, so the two tables
   cannot disagree. */
function scopesFor(matches) {
  const days = new Set();
  const months = new Set();
  for (const m of matches) {
    const k = matchdayKeyOf(m);
    if (!k) continue;
    days.add(k);
    months.add(monthOfMatchday(k));
  }
  return {
    season: [{ kind: 'season' }],
    month: [...months].sort().map((key) => ({ kind: 'month', key })),
    day: [...days].sort().map((key) => ({ kind: 'day', key })),
  };
}

function buildPayload(users, predictions, matches, now) {
  const scopes = scopesFor(matches);
  const out = {
    season: { rows: buildRows(users, predictions, matches, scopes.season[0], now) },
    month: {},
    day: {},
    updatedAt: now.getTime(),
    salt: ROW_SALT,   // so a widget built against an older salt can detect the mismatch
  };
  for (const s of scopes.month) out.month[s.key] = { rows: buildRows(users, predictions, matches, s, now) };
  for (const s of scopes.day) out.day[s.key] = { rows: buildRows(users, predictions, matches, s, now) };
  return out;
}

/* The cutoff for every fixture, as epoch ms, for the security rules to compare
   server time against.

   The widget already refuses to submit after this moment, but that is a
   courtesy: the rule was ".write": "auth != null", so anyone with devtools
   could post a prediction once a match had kicked off — or once it had
   finished. A cutoff the client owns is not a cutoff.

   Written by this job because it already holds the fixture list and a
   credential no browser has. A match with no entry here cannot be predicted at
   all: the rule compares against a missing value and denies. That is the right
   way round — a fixture added upstream in the last few minutes is briefly
   unpredictable, rather than briefly unprotected. */
function buildLocks(matches) {
  const out = {};
  for (const m of matches) {
    const ko = koOf(m);
    const md = matchdayKeyOf(m);
    if (!ko || !md || !m.id) continue;
    (out[md] || (out[md] = {}))[m.id] = ko.getTime() - CUTOFF_MIN * 60000;
  }
  return out;
}

// ---------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------

function currentSeasonId() {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/clubs-meta.json'), 'utf8'));
    const s = meta && meta.seasons && meta.seasons.current;
    return s ? Number(s) : FALLBACK_SEASON_ID;
  } catch (e) {
    return FALLBACK_SEASON_ID;
  }
}

async function fetchCompetition(compId, seasonId) {
  let all = [];
  for (let n = 1; n <= MAX_PAGES; n++) {
    const url = API_BASE + '/matches/?competitionID=' + compId + '&seasonID=' + seasonId +
                '&sort=kickOffDateUTC&page.number=' + n + '&page.size=100';
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' (comp ' + compId + ')');
    const json = await res.json();
    const d = (json && json.data) || [];
    all = all.concat(d);
    const total = json && json.meta && json.meta.totalCount;
    if (d.length < 100 || (total != null && all.length >= total)) break;
  }
  return all;
}

async function fetchFixtures(seasonId) {
  const results = await Promise.all(COMP_IDS.map((c) => fetchCompetition(c, seasonId)));
  return [].concat(...results).sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
}

/* The database over its REST API with an OAuth access token, rather than the
   firebase-admin SDK.

   Not a stylistic choice: the NL Google org blocks service-account keys, so
   this authenticates by Workload Identity Federation, and the credential that
   produces is an "external account" file. firebase-admin only parses
   service-account and authorized-user files and rejects it outright — "Invalid
   contents in the credentials file". The REST API takes a plain bearer token,
   which federation is perfectly able to mint.

   Side benefit: no dependency to install, so the job is a checkout and a node
   run. The token comes from the auth step and expires within the hour. */
async function dbFetch(path, token, init) {
  const res = await fetch(DB_URL + '/' + path + '.json', Object.assign({
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  }, init || {}));
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('RTDB ' + (init && init.method || 'GET') + ' ' + path + ': HTTP ' +
                    res.status + ' ' + body.slice(0, 300));
  }
  return res;
}

async function dbGet(path, token) {
  const res = await dbFetch(path, token);
  return (await res.json()) || {};
}

async function dbPut(path, value, token) {
  await dbFetch(path, token, { method: 'PUT', body: JSON.stringify(value) });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const now = new Date();
  const seasonId = currentSeasonId();

  const matches = await fetchFixtures(seasonId);
  console.log('fixtures: ' + matches.length + ' (season ' + seasonId + ')');

  const token = process.env.GOOGLE_ACCESS_TOKEN;
  if (!token) throw new Error('GOOGLE_ACCESS_TOKEN is not set — the auth step did not mint one');

  const [users, predictions] = await Promise.all([
    dbGet('users', token),
    dbGet('predictions', token),
  ]);
  console.log('users: ' + Object.keys(users).length +
              ', fans with predictions: ' + Object.keys(predictions).length);

  const payload = buildPayload(users, predictions, matches, now);
  const scopeCount = 1 + Object.keys(payload.month).length + Object.keys(payload.day).length;
  console.log('scopes: ' + scopeCount + ', season rows: ' + payload.season.rows.length +
              ', payload: ' + (JSON.stringify(payload).length / 1024).toFixed(1) + 'KB');

  // Belt and braces against the one mistake that would undo the point of this.
  const serialised = JSON.stringify(payload);
  for (const jwtId of Object.keys(users)) {
    if (serialised.includes(jwtId)) {
      throw new Error('REFUSING TO WRITE: a jwtId appears in the aggregate');
    }
  }

  if (dryRun) {
    console.log(JSON.stringify(payload.season.rows.slice(0, 5), null, 2));
    console.log('locks: ' + Object.keys(buildLocks(matches)).length + ' matchdays');
    console.log('dry run — nothing written');
    return;
  }

  await dbPut('leaderboard', payload, token);
  console.log('wrote leaderboard/ at ' + new Date(payload.updatedAt).toISOString());

  /* Write the locks every run, not just when they change. A fixture that gets
     rescheduled moves its cutoff with it, and the rule reads whatever is here
     — so this table drifting stale is the one way the lock could quietly stop
     matching the fixture list. */
  const locks = buildLocks(matches);
  await dbPut('locks', locks, token);
  console.log('wrote locks/ for ' + Object.keys(locks).length + ' matchdays');
}

module.exports = {
  outcome, verdictOf, isSettled, matchdayKeyOf, monthOfMatchday,
  tallyFor, buildRows, scopesFor, buildPayload, rowHash, ROW_SALT,
  buildLocks, CUTOFF_MIN,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}
