/* DAZN Viewing — the import parser, the per-club filing, the averages, and
   the rules that keep one club out of another's figures.

   All numbers here are invented. The real workbook is DAZN-confidential and
   never enters this repo; it was reconciled against these functions out of
   tree (all 67 clubs matched its Club summary sheet exactly, 12/10/2026). */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { REPO } from './load-canon.mjs';

const ctx = {};
vm.runInNewContext(readFileSync(join(REPO, 'dazn/_data.js'), 'utf8'), ctx);
const D = ctx.DAZNData;

const HEAD = ['Date', 'Home', 'Away', 'Division (home club)', 'UK views', 'International views',
  'Total views', 'UK minutes', 'International minutes', 'Total minutes', 'Avg mins watched',
  'Shown in UK?', 'Club tab index'].join('\t');
const row = (...c) => c.join('\t');
const CODES = { 'Alpha Town': 'ALP', 'Beta United': 'BET', 'Gamma City': 'GAM' };
const codeOf = (n) => CODES[n] || null;

const SHEET = [
  HEAD,
  row('09/08/2025', 'Alpha Town', 'Beta United', 'National League', '1,000', '100', '1,100', '50,000.5', '5,000', '55,000.5', '50', 'Yes – Sat, whole round available', ''),
  row('16/08/2025', 'Beta United', 'Alpha Town', 'National League', '40', '200', '240', '1,000', '10,000', '11,000', '45.8', 'No – Sat 3pm', ''),
  row('19/08/2025', 'Gamma City', 'Alpha Town', 'National League', '500', '50', '550', '20,000', '2,000', '22,000', '40', 'Yes', ''),
].join('\n');

test('a pasted sheet parses by header name, UK dates and thousands separators included', () => {
  const p = D.parsePaste(SHEET);
  assert.equal(p.errors.length, 0, p.errors.join(' '));
  assert.equal(p.rows.length, 3);
  const r = p.rows[0];
  assert.equal(r.date, '2025-08-09');
  assert.equal(r.div, 'National');
  assert.equal(r.ukViews, 1000);
  assert.equal(r.ukMins, 50000.5);
  assert.equal(r.avail, 'round');
  assert.equal(p.rows[1].avail, 'intl');
  assert.equal(p.rows[2].avail, 'uk');
});

test('a bad row is reported with its line number and nothing is guessed', () => {
  const p = D.parsePaste([HEAD, row('31/02/2025', 'Alpha Town', 'Beta United', 'Conference', 'x', '1', '', '1', '1', '', '', 'Maybe', '')].join('\n'));
  assert.equal(p.rows.length, 0);
  assert.equal(p.errors.length, 1);
  assert.match(p.errors[0], /^Line 2: /);
  for (const bit of ['date', 'division', 'uk views', 'shown in UK?']) assert.ok(p.errors[0].includes(bit), bit);
});

test('a paste without the header row is refused, naming what is missing', () => {
  const p = D.parsePaste(row('09/08/2025', 'Alpha Town', 'Beta United'));
  assert.equal(p.rows.length, 0);
  assert.match(p.errors[0], /header row/);
});

test('every game is filed under both clubs, keyed on date and club codes', () => {
  const b = D.buildSeason(D.parsePaste(SHEET).rows, codeOf);
  assert.ok(b.season);
  assert.equal(Object.keys(b.season.matches).length, 3);
  assert.ok(b.season.clubs.ALP.matches['20250809-ALP-BET']);
  assert.ok(b.season.clubs.BET.matches['20250809-ALP-BET']);
  assert.equal(Object.keys(b.season.clubs.ALP.matches).length, 3);
  assert.equal(b.season.clubs.GAM.div, 'National');
});

test('an unknown club name stops the whole import rather than dropping games', () => {
  const rows = D.parsePaste(SHEET.replace('Gamma City', 'Gamma Citty')).rows;
  const b = D.buildSeason(rows, codeOf);
  assert.equal(b.season, null);
  assert.deepEqual([...b.unmatched], ['Gamma Citty']);
});

test('the same game twice is refused', () => {
  const lines = SHEET.split('\n');
  const b = D.buildSeason(D.parsePaste([...lines, lines[1]].join('\n')).rows, codeOf);
  assert.equal(b.season, null);
  assert.match(b.errors[0], /appears twice/);
});

test('Saturday 3pm UK views count in totals but not in the UK-shown average', () => {
  const b = D.buildSeason(D.parsePaste(SHEET).rows, codeOf);
  const s = D.summarise(b.season.clubs.ALP.matches, 'ALP');
  assert.equal(s.games, 3);
  assert.equal(s.home, 1);
  assert.equal(s.away, 2);
  assert.equal(s.intlOnly, 1);
  assert.equal(s.ukViews, 1540);                      // 1000 + 40 + 500
  assert.equal(s.avgUkPerUkShown, 750);               // (1000 + 500) / 2, the 40 left out
  assert.equal(s.views, 1890);
  assert.equal(s.avgMins, 88000.5 / 1890);            // total minutes ÷ total views
  assert.equal(s.top.date, '2025-08-09');
});

test('a division average built from too few games is not shown', () => {
  const bench = { games: 4, ukShownGames: 4, avgUkPerUkShown: 900, avgIntlPerGame: 80, avgMins: 70 };
  assert.equal(D.MIN_BENCH_GAMES, 5);
  assert.equal(D.benchFigure(bench, 'avgMins'), null);
  assert.equal(D.benchFigure({ ...bench, games: 5 }, 'avgMins'), 70);
  assert.equal(D.benchFigure({ ...bench, games: 30, ukShownGames: 3 }, 'avgUkPerUkShown'), null);
});

test('the division average carries averages and counts, never games', () => {
  const b = D.buildSeason(D.parsePaste(SHEET).rows, codeOf);
  assert.deepEqual([...Object.keys(b.season.bench.National)].sort(),
    ['avgIntlPerGame', 'avgMins', 'avgUkPerUkShown', 'games', 'ukShownGames']);
});

test('rules: a club code reads its own club node and the averages, nothing else', () => {
  const rules = JSON.parse(readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8'));
  const n = rules.rules['app-data']['media-dazn'];
  assert.ok(n, 'media-dazn rules missing');
  assert.ok(!/token\.club/.test(n['.read']), 'the whole node must not be club-readable');
  assert.ok(!/token\.club|staff/.test(n['.write']), 'only admins import');
  assert.equal(n.seasons.$season.clubs.$club['.read'], 'auth != null && auth.token.club === $club');
  assert.equal(n.seasons.$season.matches, undefined, 'matches must not be opened to clubs');
});

test('the club page checks the code server-side, against the one club code', () => {
  const page = readFileSync(join(REPO, 'dazn/reader/index.html'), 'utf8');
  assert.match(page, /NL\.codeGate\.viaFunction\('app-data\/club-codes'/);
  assert.match(page, /claim: 'club'/);
  assert.ok(!/auth-guard\.js/.test(page));
});

test('dates are read however the sheet displays them, and never guessed', () => {
  /* The workbook's Matches sheet displays "Sat, 9 Aug 2025", and the first
     real paste was refused on every row because only numeric dates were
     read. A spreadsheet copies the DISPLAYED text, so every format a cell
     might be set to has to be understood. */
  for (const s of ['Sat, 9 Aug 2025', 'Sat 9 Aug 2025', '9 Aug 2025', '9 August 2025',
                   '09-Aug-25', '9th Aug 2025', '09/08/2025', '9/8/2025', '2025-08-09', '2025-08-09 00:00:00']) {
    assert.equal(D.parseDate(s), '2025-08-09', s);
  }
  assert.equal(D.parseDate('Tue, 30 Sept 2025'), '2025-09-30');
  for (const s of ['31 Feb 2026', '9 Agu 2025', '9 Augus 2025', 'Aug 9', 'next Saturday', '']) {
    assert.equal(D.parseDate(s), null, s);
  }
});

test('a lone dash is zero, because that is how the sheet displays zero', () => {
  /* Number format #,##0;-#,##0;– — the third section is the zero case.
     Two Saturday 3pm games with no UK views pasted as "–" and were refused. */
  for (const s of ['\u2013', '\u2014', '-', ' \u2013 ']) assert.equal(D.parseNum(s), 0, JSON.stringify(s));
  assert.equal(D.parseNum('--'), null);
  assert.equal(D.parseNum(''), null);
});

test('games sort by date until a header is clicked, and nothing is labelled "most watched"', () => {
  /* The biggest game is the longest bar; a pill saying so was asked to go
     (12/10/2026). Date order is the default because a season reads in order. */
  const view = readFileSync(join(REPO, 'dazn/_view.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');   // code, not the changelog
  assert.match(view, /sort: \{ key: 'date', dir: 1 \}/);
  assert.match(view, /aria-sort/);
  assert.ok(!/Most watched/i.test(view), 'the "Most watched" pill is back');
  assert.ok(!/class="pill/.test(view));
});

test('filters narrow by UK availability, venue and month, and combine', () => {
  const win = { DAZNData: D };
  vm.runInNewContext(readFileSync(join(REPO, 'dazn/_view.js'), 'utf8'), { window: win, Intl });
  const f = win.DAZNView.applyFilters;
  const games = [...Object.values(D.buildSeason(D.parsePaste(SHEET).rows, codeOf).season.clubs.ALP.matches)];
  const n = (F) => f(games, 'ALP', { uk: 'all', venue: 'all', month: 'all', ...F }).length;
  assert.equal(n({}), 3);
  assert.equal(n({ uk: 'intl' }), 1);                 // the Saturday 3pm game
  assert.equal(n({ uk: 'uk' }), 2);                   // whole-round Saturday counts as shown
  assert.equal(n({ venue: 'home' }), 1);
  assert.equal(n({ venue: 'away' }), 2);
  assert.equal(n({ uk: 'intl', venue: 'home' }), 0);
  assert.equal(n({ month: '2025-08' }), 3);
  assert.equal(n({ month: '2025-09' }), 0);
});

test('the dashboard styles never override canon with !important', () => {
  /* v16 forced the canon .stats grid and .table padding with !important,
     and that is where "it ignores our canon" started. Canon is used through
     its modifiers or not at all; what canon lacks is built under .dz-*. */
  const css = readFileSync(join(REPO, 'dazn/_view.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/!important/.test(css), 'dazn/_view.css uses !important');
  for (const cls of ['.stats', '.stat', '.table', '.chip', '.filter-bar', '.form-panel']) {
    const re = new RegExp('(^|[\\s,}])\\' + cls + '\\s*\\{', 'm');
    assert.ok(!re.test(css), `dazn/_view.css restyles canon ${cls} directly`);
  }
});
