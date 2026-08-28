/* League Table Graphic — NLS load tests.

   Same approach as tests/fixtures-graphic-nls.test.mjs, and for the same
   reason: the graphic's look is checked by eye, but turning an NLS
   league-tables response into the tool's rows cannot be, and a mistake there
   publishes a wrong table rather than an ugly one.

   The functions are not exported — the tool is served as-is with no build
   step — so the National League Services section is sliced out of the shipped
   file by its comment markers and run verbatim against stubs. Renaming a
   marker fails these tests loudly rather than quietly testing nothing.

   Run with `npm test` (node --test). Zero dependencies, no network. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const APP = join(REPO, 'graphics/table-graphic/app.js');
const START = '  /* ---------------- National League Services';
const END   = '  /* ---------------- matchday options';

const meta = JSON.parse(readFileSync(join(REPO, 'assets/data/clubs-meta.json'), 'utf8'));
const optaIndex = Object.fromEntries(meta.clubs.filter(c => c.optaID).map(c => [c.optaID, c]));

function loadSection() {
  const src = readFileSync(APP, 'utf8');
  const a = src.indexOf(START), b = src.indexOf(END);
  assert.ok(a >= 0, `marker not found in table-graphic/app.js: ${START}`);
  assert.ok(b > a,  `marker not found in table-graphic/app.js: ${END}`);

  const status = [];
  const state = { division: 'National', source: 'feed', rows: [] };
  const body = `
    var COMPETITION_ID = { National: 89, North: 373, South: 372 };
    var NLS_BASE = "";
    var E = { FLAG_NONE: "-" };
    var NL = {
      clubs:  { meta: function () { return META; }, byOpta: function (id) { return OPTA[id] || null; } },
      season: { current: function (m) { return m && m.seasons && m.seasons.current; },
                fromDate: function () { return 2026; } }
    };
    function setStatus(m) { STATUS.push(m); }
    function syncPasteFromRows() {}
    function buildGrid() {}
    function save() {}
    function render() {}
    function $() { return null; }
    ${src.slice(a, b)}
    return { applyTable: applyTable, fillZonesByPosition: fillZonesByPosition,
             clearZones: clearZones, nlsTeamName: nlsTeamName, gdText: gdText,
             nlsSeason: nlsSeason };
  `;
  const api = new Function('META', 'OPTA', 'STATUS', 'state', body)(meta, optaIndex, status, state);
  return { ...api, state, status: () => status.join(' · ') };
}

/* An NLS league-tables row, trimmed to the fields the tool reads. */
function row(teamID, position, o = {}) {
  return { id: teamID, attributes: {
    teamName: 'feed name', teamShortName: 'feed', position,
    played: o.p ?? 4, won: o.w ?? 2, drawn: o.d ?? 1, lost: o.l ?? 1,
    goalsFor: o.f ?? 6, goalsAgainst: o.a ?? 4,
    goalDifference: o.gd ?? 2, points: o.pts ?? 7 } };
}
const optaFor = name => {
  const club = meta.clubs.find(c => c.name === name);
  assert.ok(club && club.optaID, `${name} needs an optaID in clubs-meta`);
  return club.optaID;
};
/* A full 24-club division, in position order. */
function division(name = 'National') {
  const season = meta.seasons.current;
  const clubs = meta.clubs.filter(c => c.seasons && c.seasons[season] === name);
  assert.equal(clubs.length, 24, `${name} should have 24 clubs`);
  return clubs.map((c, i) => row(c.optaID, i + 1, { pts: 100 - i }));
}

test('season comes from clubs-meta, not the clock', () => {
  const { nlsSeason } = loadSection();
  assert.equal(nlsSeason(), meta.seasons.current);
});

test('clubs resolve on optaID, so the crest never depends on the feed spelling', () => {
  const { nlsTeamName } = loadSection();
  assert.equal(nlsTeamName(row(optaFor('FC Halifax Town'), 1)), 'FC Halifax Town');
  assert.equal(nlsTeamName({ id: 't0000000', attributes: { teamName: 'Someone New' } }), 'Someone New',
    'an unmatched id keeps the feed name rather than blanking the row');
});

test('goal difference prints with its sign, and zero is not a blank', () => {
  const { gdText } = loadSection();
  assert.equal(gdText(5), '+5');
  assert.equal(gdText(-3), '-3');
  assert.equal(gdText(0), '0');
  assert.equal(gdText(null), '');
});

test('a loaded table is ordered by position and carries the full row', () => {
  const t = loadSection();
  t.applyTable([
    row(optaFor('Woking'), 3, { p: 4, w: 2, d: 1, l: 1, f: 6, a: 5, gd: 1, pts: 7 }),
    row(optaFor('Barrow'), 1, { p: 4, w: 4, d: 0, l: 0, f: 9, a: 2, gd: 7, pts: 12 }),
    row(optaFor('Tamworth'), 2, { p: 4, w: 3, d: 0, l: 1, f: 7, a: 4, gd: 3, pts: 9 })
  ]);
  assert.deepEqual(t.state.rows.map(r => r.team), ['Barrow', 'Tamworth', 'Woking']);
  assert.deepEqual(t.state.rows[0],
    { team: 'Barrow', flag: '-', p: '4', w: '4', d: '0', l: '0', f: '9', a: '2', gd: '+7', pts: '12' });
});

test('a loaded table arrives unmarked — the feed carries no zones', () => {
  const t = loadSection();
  t.applyTable(division());
  assert.equal(t.state.rows.length, 24);
  assert.ok(t.state.rows.every(r => r.flag === '-'),
    'mid-season nothing is confirmed, so nothing may claim a zone');
  assert.match(t.status(), /marks are yours to set/);
});

test('rows with no position are dropped rather than sorted to the top', () => {
  const t = loadSection();
  t.applyTable([
    row(optaFor('Barrow'), 1),
    { id: optaFor('Woking'), attributes: { teamName: 'Woking', position: null } },
    { id: 't123', attributes: { position: 2 } }
  ]);
  assert.deepEqual(t.state.rows.map(r => r.team), ['Barrow']);
});

test('an empty table leaves the current one alone', () => {
  const t = loadSection();
  t.applyTable(division());
  const before = t.state.rows;
  t.applyTable([]);
  assert.equal(t.state.rows, before);
  assert.match(t.status(), /No table published yet/);
});

test('Mark by position fills champion, both play-off tiers and relegation', () => {
  const t = loadSection();
  t.applyTable(division());
  t.fillZonesByPosition();
  const flags = t.state.rows.map(r => r.flag);
  assert.equal(flags[0], 'C', '1st is champion');
  assert.deepEqual(flags.slice(1, 3), ['SF', 'SF'], '2nd-3rd go straight to the semi-finals');
  assert.deepEqual(flags.slice(3, 7), ['QF', 'QF', 'QF', 'QF'], '4th-7th play the quarter-finals');
  assert.deepEqual(flags.slice(7, 20), Array(13).fill('-'), 'mid-table stays unmarked');
  assert.deepEqual(flags.slice(20), ['R', 'R', 'R', 'R'], 'bottom four go down');
});

test('Clear marks empties every zone', () => {
  const t = loadSection();
  t.applyTable(division());
  t.fillZonesByPosition();
  t.clearZones();
  assert.ok(t.state.rows.every(r => r.flag === '-'));
  assert.match(t.status(), /Marks cleared/);
});

test('a short table never marks relegation it cannot know about', () => {
  const t = loadSection();
  t.applyTable([1, 2, 3, 4, 5, 6, 7, 8].map((p, i) =>
    row(meta.clubs.filter(c => c.optaID)[i].optaID, p)));
  t.fillZonesByPosition();
  const flags = t.state.rows.map(r => r.flag);
  assert.deepEqual(flags, ['C', 'SF', 'SF', 'QF', 'QF', 'QF', 'QF', '-'],
    'with 8 rows there is no relegation zone to fill');
});
