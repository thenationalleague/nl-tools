/* League Table Graphic — NLS load tests.

   Same approach as tests/fixtures-graphic-nls.test.mjs, and for the same
   reason: the graphic's look is checked by eye, but turning an NLS
   league-tables response into the tool's rows cannot be, and a mistake there
   publishes a wrong table rather than an ugly one.

   The functions are not exported — the tool is served as-is with no build
   step — so the National League Services section is sliced out of the shipped
   file by its comment markers and run verbatim against stubs. Renaming a
   marker fails these tests loudly rather than quietly testing nothing.

   Since 09/10/2026 the row-building lives in graphics/_shared/table-card.js
   (shared with the scheduled batch). That file is loaded as shipped too and
   handed to the tool section as `T`, exactly as the page does.

   Run with `npm test` (node --test). Zero dependencies, no network. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const APP = join(REPO, 'graphics/table-graphic/app.js');
const CARD = join(REPO, 'graphics/_shared/table-card.js');
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
  const win = {};
  new Function('window', readFileSync(CARD, 'utf8'))(win);
  assert.ok(win.NL_TABLE_CARD, 'table-card.js did not define NL_TABLE_CARD');
  const body = `
    var T = TCARD;
    var COMPETITION_ID = { National: 89, North: 373, South: 372, CupA: 1275, CupB: 1275, CupC: 1275, CupD: 1275 };
    var CUP_ROUND = { CupA: "A", CupB: "B", CupC: "C", CupD: "D" };
    var CUP_QUALIFY = 2;
    function isCup(div) { return !!CUP_ROUND[div || state.division]; }
    var NLS_BASE = "";
    var FETCHED = [];
    function fetch(url) { FETCHED.push(url); return new Promise(function () {}); }   /* never resolves: only the URL is under test */
    var E = { FLAG_NONE: "-" };
    var NL = {
      clubs:  { meta: function () { return META; }, byOpta: function (id) { return OPTA[id] || null; },
                load: function () { return Promise.resolve(META); } },
      season: { current: function (m) { return m && m.seasons && m.seasons.current; },
                fromDate: function () { return 2026; } }
    };
    function setStatus(m) { STATUS.push(m); }
    function syncPasteFromRows() {}
    function buildGrid() {}
    function save() {}
    function render() {}
    function $() { return { disabled: false }; }   /* the Load button, as far as the section cares */
    ${src.slice(a, b)}
    return { applyTable: applyTable, fillZonesByPosition: fillZonesByPosition,
             clearZones: clearZones,
             nlsTeamName: function (r) { return T.nlsTeamName(NL.clubs, r); },
             pl2Name: T.pl2Name, gdText: T.gdText,
             nlsSeason: nlsSeason, loadFromNLS: loadFromNLS, fetched: function () { return FETCHED; } };
  `;
  const api = new Function('META', 'OPTA', 'STATUS', 'state', 'TCARD', body)(meta, optaIndex, status, state, win.NL_TABLE_CARD);
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
  assert.equal(nlsTeamName({ id: 't0000000', attributes: { teamName: 'Manchester United U21' } }), 'Manchester United PL2',
    'a U21 guest side normalises to PL2 as it comes off the feed');
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

/* ---- National League Cup groups (added 11/09/2026) ---- */

test('a cup group asks the feed for its round, a division does not', async () => {
  const t = loadSection();
  t.state.division = 'CupB';
  t.loadFromNLS();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(t.fetched().length, 1);
  assert.match(t.fetched()[0], /competitionID=1275&/);
  assert.match(t.fetched()[0], /&roundID=B$/);
  t.state.division = 'North';
  t.loadFromNLS();
  await new Promise(r => setTimeout(r, 0));
  assert.match(t.fetched()[1], /competitionID=373&/);
  assert.doesNotMatch(t.fetched()[1], /roundID/);
});

test('pl2Name: U21 and U23 tags become PL2; anything else is untouched', () => {
  const { pl2Name } = loadSection();
  assert.equal(pl2Name('Wolverhampton Wanderers U21'), 'Wolverhampton Wanderers PL2');
  assert.equal(pl2Name('Stoke City U23'), 'Stoke City PL2');
  assert.equal(pl2Name('Derby County PL2'), 'Derby County PL2');
  assert.equal(pl2Name('FC Halifax Town'), 'FC Halifax Town');
  assert.equal(pl2Name('  Nottingham Forest u21 '), 'Nottingham Forest PL2');
});

test('Mark by position on a cup group marks the two qualifiers as Q and nothing else', () => {
  const t = loadSection();
  t.state.division = 'CupA';
  t.applyTable([1, 2, 3, 4, 5, 6, 7, 8].map((p, i) =>
    row(meta.clubs.filter(c => c.optaID)[i].optaID, p)));
  t.fillZonesByPosition();
  assert.deepEqual(t.state.rows.map(r => r.flag), ['Q', 'Q', '-', '-', '-', '-', '-', '-']);
  t.clearZones();
  assert.ok(t.state.rows.every(r => r.flag === '-'));
});

/* ---- A table at an earlier date (added 28/10/2026) ----
   The match shape below is the NLS /matches list, trimmed to the fields the
   rebuild reads. Taken from a live call on 28/10/2026
   (/v2/matches/?seasonID=2026&competitionID=89): attributes.homeTeam and
   awayTeam carry teamID, name and score (null before kick-off), and
   matchPeriod is "FullTime" once a game is over, "PreMatch" before it. The
   same day, rowsFromMatches over every finished game reproduced the live
   National, North and South tables row for row. */

function loadCard() {
  const win = {};
  new Function('window', readFileSync(CARD, 'utf8'))(win);
  return win.NL_TABLE_CARD;
}
function match(home, hs, away, as, period = 'FullTime') {
  return { attributes: { matchPeriod: period,
    homeTeam: { teamID: home, name: home, score: hs },
    awayTeam: { teamID: away, name: away, score: as } } };
}
const noClubs = { byOpta: () => null };

test('a table worked out from results counts P W D L F A and points', () => {
  const T = loadCard();
  const rows = T.rowsFromMatches([
    match('a', 2, 'b', 0),
    match('b', 1, 'c', 1),
    match('c', 0, 'a', 3)
  ], noClubs);
  assert.deepEqual(rows.map(r => [r.team, r.p, r.w, r.d, r.l, r.f, r.a, r.gd, r.pts]), [
    ['a', '2', '2', '0', '0', '5', '0', '+5', '6'],
    ['b', '2', '0', '1', '1', '1', '3', '-2', '1'],   /* level on points with c, better GD */
    ['c', '2', '0', '1', '1', '1', '4', '-3', '1']
  ]);
});

test('only finished games count; one not yet played or abandoned does not', () => {
  const T = loadCard();
  const rows = T.rowsFromMatches([
    match('a', 1, 'b', 0),
    match('a', null, 'c', null, 'PreMatch'),
    match('b', 2, 'c', 2, 'Abandoned')
  ], noClubs);
  assert.deepEqual(rows.map(r => r.team), ['a', 'b'], 'c has no finished game, so no row');
  assert.equal(rows[0].p, '1');
});

test('ties split on goal difference, then goals scored', () => {
  const T = loadCard();
  const rows = T.rowsFromMatches([
    match('a', 1, 'x', 0),   /* a: 3 pts, GD +1, F 1 */
    match('b', 3, 'y', 2),   /* b: 3 pts, GD +1, F 3 */
    match('c', 2, 'z', 0)    /* c: 3 pts, GD +2 */
  ], noClubs);
  assert.deepEqual(rows.slice(0, 3).map(r => r.team), ['c', 'b', 'a']);
});

test('a deduction comes off the points and moves the club down', () => {
  const T = loadCard();
  const games = [match('a', 1, 'b', 0), match('c', 0, 'd', 0)];
  assert.equal(T.rowsFromMatches(games, noClubs)[0].team, 'a');
  const rows = T.rowsFromMatches(games, noClubs, { a: 3 });
  assert.equal(rows.find(r => r.team === 'a').pts, '0');
  assert.deepEqual(rows.slice(0, 2).map(r => r.team), ['c', 'd']);
});

test('points from results alone, for finding the deductions the live table has', () => {
  const T = loadCard();
  assert.deepEqual(T.pointsFromMatches([match('a', 1, 'b', 0), match('b', 1, 'a', 1)]), { a: 4, b: 1 });
});

test('clubs resolve on teamID, and a U21 guest prints as PL2', () => {
  const T = loadCard();
  const halifax = optaFor('FC Halifax Town');
  const rows = T.rowsFromMatches([
    { attributes: { matchPeriod: 'FullTime',
      homeTeam: { teamID: halifax, name: 'Halifax', score: 1 },
      awayTeam: { teamID: 't0000000', name: 'Norwich City U21', score: 0 } } }
  ], { byOpta: id => optaIndex[id] || null });
  assert.deepEqual(rows.map(r => r.team), ['FC Halifax Town', 'Norwich City PL2']);
  assert.equal(rows[0].id, halifax, 'each row keeps its teamID for deductions');
});

test('titles: a number is a matchday, final and blank are standings, anything else prints as typed', () => {
  const T = loadCard();
  assert.equal(T.title('15'), 'MATCHDAY 15');
  assert.equal(T.title(''), 'CURRENT STANDINGS');
  assert.equal(T.title('final'), 'FINAL STANDINGS');
  assert.equal(T.title('Final'), 'FINAL STANDINGS');
  assert.equal(T.title('GROUP STAGE – MATCHDAY 3'), 'GROUP STAGE – MATCHDAY 3');
  assert.equal(T.title('after boxing day'), 'AFTER BOXING DAY');
});

test('no TIC Health logo on a Cup group; every league table keeps it', () => {
  const T = loadCard();
  ['CupA', 'CupB', 'CupC', 'CupD'].forEach(d => assert.equal(T.showsSponsor(d), false, d));
  ['National', 'North', 'South'].forEach(d => assert.equal(T.showsSponsor(d), true, d));
});
