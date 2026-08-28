/* Fixtures & Results Graphic — NLS load tests.

   The graphic's own layout is checked by eye; this covers the part that
   can't be, and that silently produces a wrong graphic when it breaks:
   turning an NLS matches response into the tool's rows.

   The functions are not exported — the tool is an IIFE served as-is with no
   build step. So the National League Services section is sliced out of the
   shipped file by its comment markers and run verbatim against stubs. That
   means these assertions are made about the code that actually ships, and a
   rename of those markers fails loudly rather than silently testing nothing.

   Run with `npm test` (node --test). Zero dependencies, no network. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const APP = join(REPO, 'graphics/fixtures-graphic/fixtures-app.js');
const START = '  /* ---------------- National League Services';
const END   = '  /* ---------------- team roster';

const meta = JSON.parse(readFileSync(join(REPO, 'assets/data/clubs-meta.json'), 'utf8'));
const optaIndex = Object.fromEntries(meta.clubs.filter(c => c.optaID).map(c => [c.optaID, c]));

function loadSection() {
  const src = readFileSync(APP, 'utf8');
  const a = src.indexOf(START), b = src.indexOf(END);
  assert.ok(a >= 0, `marker not found in fixtures-app.js: ${START}`);
  assert.ok(b > a,  `marker not found in fixtures-app.js: ${END}`);

  const status = [];
  const state = { division: 'National', mode: 'fixtures', rows: [] };
  const body = `
    var MAX_ROWS = 12;
    var NLS_BASE = "";
    var COMPETITION_ID = { National: 89, North: 373, South: 372, Cup: 1275 };
    var NL = {
      clubs:  { meta: function () { return META; }, byOpta: function (id) { return OPTA[id] || null; } },
      season: { current: function (m) { return m && m.seasons && m.seasons.current; },
                fromDate: function () { return 2026; } }
    };
    function setStatus(m) { STATUS.push(m); }
    function escapeHtml(s) { return String(s == null ? "" : s); }
    function syncPasteFromRows() {}
    function buildGrid() {}
    function save() {}
    function render() {}
    function $() { return null; }
    ${src.slice(a, b)}
    return { applyMatches: applyMatches, koTime: koTime, koDay: koDay,
             dividerLabel: dividerLabel, nlsTeamName: nlsTeamName,
             dateOptionLabel: dateOptionLabel };
  `;
  const api = new Function('META', 'OPTA', 'STATUS', 'state', body)(meta, optaIndex, status, state);
  return { ...api, state, status: () => status.join(' · ') };
}

/* An NLS list-endpoint match, trimmed to the fields the tool reads. */
function match(homeID, awayID, kickOffUTC, homeScore = null, awayScore = null, postponed = null) {
  return { attributes: {
    homeTeam: { teamID: homeID, name: 'unused', score: homeScore },
    awayTeam: { teamID: awayID, name: 'unused', score: awayScore },
    kickOffDateUTC: kickOffUTC,
    postponementReason: postponed
  } };
}
const optaFor = name => {
  const club = meta.clubs.find(c => c.name === name);
  assert.ok(club && club.optaID, `${name} needs an optaID in clubs-meta`);
  return club.optaID;
};
/* Six all-15:00 matches, the shape of an ordinary Saturday card. */
function saturday() {
  const names = ['Aldershot Town', 'Altrincham', 'Boston United', 'Barrow',
                 'Carlisle United', 'Eastleigh', 'Forest Green Rovers', 'Gateshead',
                 'FC Halifax Town', 'Hartlepool United', 'Harrogate Town', 'Boreham Wood'];
  const out = [];
  for (let i = 0; i < names.length; i += 2) {
    out.push(match(optaFor(names[i]), optaFor(names[i + 1]), '2026-08-29 14:00:00'));
  }
  return out;
}

test('kick-off times are printed in UK time, not the UTC the feed sends', () => {
  const { koTime } = loadSection();
  assert.equal(koTime('2026-08-28 18:45:00'), '19:45', 'BST: 18:45Z is a 19:45 kick-off');
  assert.equal(koTime('2026-08-28T18:45:00Z'), '19:45', 'the T/Z form parses identically');
  assert.equal(koTime('2026-12-02 19:45:00'), '19:45', 'GMT: no shift in winter');
  assert.equal(koTime(''), '');
  assert.equal(koTime('not a date'), '');
});

test('a match is filed under its UK day, and dividers read as a date', () => {
  const { koDay, dividerLabel } = loadSection();
  assert.equal(koDay('2026-08-29 14:00:00'), '2026-08-29');
  assert.equal(dividerLabel('2026-08-29'), 'SAT 29 AUG');
  assert.equal(dividerLabel('2026-12-26'), 'SAT 26 DEC');
});

test('date options stay short enough to read inside the select', () => {
  const { dateOptionLabel } = loadSection();
  assert.equal(dateOptionLabel('2026-08-29', { count: 12 }), 'Sat 29 Aug (12)');
  assert.equal(dateOptionLabel('2026-08-25', { count: 1 }), 'Tue 25 Aug (1)');
  assert.equal(dateOptionLabel('2026-08-25', null), 'Tue 25 Aug');
  for (const n of [1, 12]) {
    assert.ok(dateOptionLabel('2026-08-29', { count: n }).length <= 16,
      'a longer label was being cut off mid-word in the panel');
  }
});

test('clubs resolve on optaID, so a crest never depends on the name NLS sends', () => {
  const { nlsTeamName } = loadSection();
  assert.equal(nlsTeamName({ teamID: optaFor('Hednesford Town'), name: 'Hednesford' }), 'Hednesford Town');
  assert.equal(nlsTeamName({ teamID: 't0000000', name: 'Chelsea PL2' }), 'Chelsea PL2',
    'a side with no optaID (cup guests) keeps the feed name');
  assert.equal(nlsTeamName(null), '');
});

test('every current-season club has an optaID for the feed to match on', () => {
  const season = meta.seasons.current;
  const current = meta.clubs.filter(c => c.seasons && c.seasons[season] != null);
  const orphans = current.filter(c => !c.optaID).map(c => c.name);
  assert.deepEqual(orphans, [], 'clubs with no optaID would load without a crest');
});

test('an ordinary Saturday prints no kick-off times', () => {
  const t = loadSection();
  t.applyMatches(saturday());
  assert.equal(t.state.rows.length, 6);
  assert.ok(t.state.rows.every(r => r.divider == null), 'one day needs no dividers');
  assert.ok(t.state.rows.every(r => r.koOn === false), 'nothing is unusual, so nothing is ticked');
  assert.doesNotMatch(t.status(), /ticked/);
});

test('rows come out in the order a card lists them — earliest, then alphabetical', () => {
  const t = loadSection();
  t.applyMatches(saturday());
  const homes = t.state.rows.map(r => r.home);
  assert.deepEqual(homes, [...homes].sort((a, b) => a.localeCompare(b)));
});

test('the odd kick-off out is ticked, and only that one', () => {
  const t = loadSection();
  t.applyMatches([...saturday(),
    match(optaFor('Southend United'), optaFor('Woking'), '2026-08-29 11:30:00')]);
  const ticked = t.state.rows.filter(r => r.koOn);
  assert.equal(ticked.length, 1);
  assert.equal(ticked[0].ko, '12:30');
  assert.equal(t.state.rows[0].ko, '12:30', 'the early game leads the card');
  assert.match(t.status(), /1 kick-off ticked/);
});

test('a card spanning several days gets a divider above each one', () => {
  const t = loadSection();
  t.applyMatches([
    match(optaFor('Aldershot Town'), optaFor('Altrincham'), '2026-08-28 18:45:00'),
    match(optaFor('Boston United'), optaFor('Barrow'), '2026-08-29 14:00:00'),
    match(optaFor('Carlisle United'), optaFor('Eastleigh'), '2026-08-29 14:00:00'),
    match(optaFor('Gateshead'), optaFor('Harrogate Town'), '2026-08-31 14:00:00')
  ]);
  const shape = t.state.rows.map(r => r.divider != null ? r.divider : r.home);
  assert.deepEqual(shape, [
    'FRI 28 AUG', 'Aldershot Town',
    'SAT 29 AUG', 'Boston United', 'Carlisle United',
    'MON 31 AUG', 'Gateshead'
  ]);
});

test('postponed matches are left off the card and counted in the status line', () => {
  const t = loadSection();
  t.applyMatches([
    match(optaFor('Aldershot Town'), optaFor('Altrincham'), '2026-08-29 14:00:00'),
    match(optaFor('Boston United'), optaFor('Barrow'), '2026-08-29 14:00:00', null, null, 'Waterlogged pitch')
  ]);
  assert.equal(t.state.rows.length, 1);
  assert.match(t.status(), /1 postponed left out/);
});

test('results carry the real scoreline, and 0-0 is a score not a blank', () => {
  const t = loadSection();
  t.state.mode = 'results';
  t.applyMatches([
    match(optaFor('Aldershot Town'), optaFor('Altrincham'), '2026-08-29 14:00:00', 2, 1),
    match(optaFor('Boston United'), optaFor('Barrow'), '2026-08-29 14:00:00', 0, 0),
    match(optaFor('Carlisle United'), optaFor('Eastleigh'), '2026-08-29 14:00:00', null, null)
  ]);
  const [a, b, c] = t.state.rows;
  assert.deepEqual([a.hs, a.as], ['2', '1']);
  assert.deepEqual([b.hs, b.as], ['0', '0']);
  assert.deepEqual([c.hs, c.as], ['', '']);
  assert.match(t.status(), /1 without a score/, 'an unplayed match must not pass as a blank scoreline');
});

test('a results load with nothing played yet says so', () => {
  const t = loadSection();
  t.state.mode = 'results';
  t.applyMatches(saturday());
  assert.match(t.status(), /no scores yet/);
});

test('more matches than the graphic holds are trimmed, and the trim is reported', () => {
  const t = loadSection();
  const pool = meta.clubs.filter(c => c.optaID).slice(0, 30);
  const many = [];
  for (let i = 0; i < 30; i += 2) many.push(match(pool[i].optaID, pool[i + 1].optaID, '2026-08-29 14:00:00'));
  t.applyMatches(many);
  assert.equal(t.state.rows.filter(r => r.divider == null).length, 12);
  assert.match(t.status(), /trimmed to 12/);
});

test('an empty response leaves the current card alone', () => {
  const t = loadSection();
  t.applyMatches(saturday());
  const before = t.state.rows;
  t.applyMatches([]);
  assert.equal(t.state.rows, before, 'a bad date must not wipe the card you were working on');
  assert.match(t.status(), /No matches on that date/);
});
