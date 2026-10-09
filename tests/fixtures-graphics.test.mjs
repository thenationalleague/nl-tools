/* Fixtures & results automation — what number a card gets, and when.

   The rules were agreed with Richard on 09/10/2026 and live in
   assets/data/rounds-2026-27.json (windows) and cardTitle() in
   scripts/build-fixtures-graphics.js (wording):
   - a date inside a round's window prints that round's number, whatever
     round the game officially belongs to;
   - outside every window: plain MATCHDAY (league) / GROUP STAGE (Cup);
   - midweeks Mon–Wed, Saturdays Fri–Sun, Good Friday that day only. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { REPO } from './load-canon.mjs';

const require = createRequire(import.meta.url);
const m = require(join(REPO, 'scripts/build-fixtures-graphics.js'));
const rounds = JSON.parse(readFileSync(join(REPO, 'assets/data/rounds-2026-27.json'), 'utf8'));

test('every competition has its rounds, and no two windows overlap', () => {
  assert.equal(rounds.National.length, 46);
  assert.equal(rounds.North.length, 46);
  assert.equal(rounds.South.length, 46);
  assert.equal(rounds.Cup.length, 4);
  for (const div of ['National', 'North', 'South', 'Cup']) {
    const ws = rounds[div].map(r => [r.from, r.to, r.round]).sort();
    for (let i = 1; i < ws.length; i++) {
      assert.ok(ws[i][0] > ws[i - 1][1], `${div} rounds ${ws[i - 1][2]} and ${ws[i][2]} overlap`);
    }
    for (const r of rounds[div]) assert.ok(r.from <= r.main && r.main <= r.to, `${div} ${r.round}`);
  }
});

test('league numbering follows the window, not the official round', () => {
  assert.equal(m.cardTitle(rounds, 'National', '2026-10-09'), '13');   // Friday of a Saturday round
  assert.equal(m.cardTitle(rounds, 'National', '2026-08-27'), '4');    // Thursday before Friday 28/08
  assert.equal(m.cardTitle(rounds, 'National', '2026-09-01'), '5');    // Tuesday after bank-holiday Monday
  assert.equal(m.cardTitle(rounds, 'National', '2026-12-29'), '25');
  assert.equal(m.cardTitle(rounds, 'National', '2027-03-27'), '');     // Good Friday locks to the day
  assert.equal(m.cardTitle(rounds, 'South', '2026-09-15'), '');        // rearranged midweek, no round
  assert.equal(m.cardTitle(rounds, 'South', '2026-10-06'), '');
});

test('the Cup reads GROUP STAGE – MATCHDAY n, or GROUP STAGE between rounds', () => {
  assert.equal(m.cardTitle(rounds, 'Cup', '2026-08-18'), 'GROUP STAGE – MATCHDAY 1');
  assert.equal(m.cardTitle(rounds, 'Cup', '2026-09-09'), 'GROUP STAGE – MATCHDAY 2');
  assert.equal(m.cardTitle(rounds, 'Cup', '2026-11-03'), 'GROUP STAGE – MATCHDAY 4');
  assert.equal(m.cardTitle(rounds, 'Cup', '2026-10-06'), 'GROUP STAGE');
  assert.equal(m.cardTitle(rounds, 'Cup', '2027-02-01'), '');           // after the group stage
});

test('a round can override its wording', () => {
  const r = { Cup: [{ round: 5, from: '2027-01-12', to: '2027-01-13', title: 'QUARTER-FINALS' }] };
  assert.equal(m.cardTitle(r, 'Cup', '2027-01-12'), 'QUARTER-FINALS');
});

test('dates and seasons', () => {
  assert.equal(m.addDays('2026-10-30', 2), '2026-11-01');   // across the clocks going back
  assert.equal(m.addDays('2027-03-27', 2), '2027-03-29');   // and forward
  assert.equal(m.seasonStart('2026-08-08'), 2026);
  assert.equal(m.seasonStart('2027-04-24'), 2026);
  assert.equal(m.seasonLabel(2026), '2026-27');
  assert.equal(m.shortDate('2026-10-03'), '03Oct26');
  assert.equal(m.shortDate('2026-09-08'), '08Sep26');
});

/* NLS names three Cup guests "U21" where cup-clubs-meta has "PL2" (live,
   NL Data MCP 09/10/2026, Cup results 18/08: Ipswich Town U21, Birmingham
   City U21, Norwich City U21). The batch held the whole card back for the
   missing crests on its first Cup dry run. */
test('a Cup guest named U21 by NLS still finds its parent crest', () => {
  const win = {};
  new Function('window', readFileSync(join(REPO, 'graphics/_shared/fixtures-card.js'), 'utf8'))(win);
  const guests = JSON.parse(readFileSync(join(REPO, 'assets/data/cup-clubs-meta.json'), 'utf8')).clubs;
  const clubs = {
    byName: () => null,
    guestByName: n => guests.find(g => g.name.toLowerCase() === String(n).toLowerCase()) || null
  };
  const C = win.NL_FIXTURES_CARD;
  assert.equal(C.crestKey(clubs, 'Ipswich Town U21'), 'Ipswich Town');
  assert.equal(C.crestKey(clubs, 'Birmingham City U21'), 'Birmingham City');
  assert.equal(C.crestKey(clubs, 'Fulham PL2'), 'Fulham');
  assert.equal(C.crestKey(clubs, 'Woking'), 'Woking');
});

/* League-table rows. Response shape as graphics/table-graphic reads it from
   the live league-tables endpoint (data[].id = NLS teamID; attributes.
   teamName, position, played, won, drawn, lost, goalsFor, goalsAgainst,
   goalDifference, points) — the tool has loaded real tables with it since
   11/09/2026. */
test('table rows come out in position order, signed GD, U21 guests as PL2', () => {
  const win = {};
  new Function('window', readFileSync(join(REPO, 'graphics/_shared/table-card.js'), 'utf8'))(win);
  const T = win.NL_TABLE_CARD;
  const row = (id, teamName, position, gd, points) => ({ id, attributes: {
    teamName, position, played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 4, goalsAgainst: 4 - gd,
    goalDifference: gd, points } });
  const clubs = { byOpta: () => null };
  const rows = T.buildRows([row('b', 'Woking', 2, 0, 4), row('a', 'Ipswich Town U21', 1, 3, 7),
                            row('c', 'Hornchurch', 3, -2, 1)], clubs);
  assert.deepEqual(rows.map(r => r.team), ['Ipswich Town PL2', 'Woking', 'Hornchurch']);
  assert.deepEqual(rows.map(r => r.gd), ['+3', '0', '-2']);
  assert.ok(rows.every(r => r.flag === '-'), 'the feed has no zones, so nothing is marked');
  assert.equal(T.title(''), 'CURRENT STANDINGS');
  assert.equal(T.title('12'), 'MATCHDAY 12');
  assert.equal(T.title('final'), 'FINAL STANDINGS');
});

/* Cup ties level after 90 go straight to penalties. NLS list endpoint:
   homeTeam/awayTeam.penaltyScore, null unless a shootout — live-confirmed in
   the nls-data-structure skill (g2634031, Hemel Hempstead 1-1
   Weston-super-Mare, 5-6 on pens, 28/04/2026). */
test('a shootout comes through as pens; a normal result carries none', () => {
  const win = {};
  new Function('window', readFileSync(join(REPO, 'graphics/_shared/fixtures-card.js'), 'utf8'))(win);
  const C = win.NL_FIXTURES_CARD;
  const clubs = { byName: () => null, byOpta: () => null, guestByName: () => null };
  const m = (h, a, hs, as, hp = null, ap = null) => ({ attributes: {
    homeTeam: { name: h, score: hs, penaltyScore: hp }, awayTeam: { name: a, score: as, penaltyScore: ap },
    kickOffDateUTC: '2026-09-08 18:00:00', matchPeriod: 'FullTime' } });
  const built = C.buildRows([m('Woking', 'Fulham PL2', 1, 1, 5, 6), m('Chester', 'Everton PL2', 2, 0)], clubs);
  const pens = built.rows.find(r => r.home === 'Woking');
  const plain = built.rows.find(r => r.home === 'Chester');
  assert.deepEqual([pens.hp, pens.ap], ['5', '6']);
  assert.equal(plain.hp, undefined);
  assert.equal(plain.ap, undefined);
});

/* Decided 09/10/2026: Cup academy sides print without PL2 / U21 / U23 (the
   graphic already says National League Cup; the tag caused the wraps). The
   tagged name still drives the crest lookup. */
test('Cup guests print without their PL2 / U21 tag, on cards and tables', () => {
  const guests = JSON.parse(readFileSync(join(REPO, 'assets/data/cup-clubs-meta.json'), 'utf8')).clubs;
  const guestByName = n => guests.find(g => g.name.toLowerCase() === String(n).toLowerCase()) || null;
  const load = f => { const w = {}; new Function('window', readFileSync(join(REPO, f), 'utf8'))(w); return w; };
  const C = load('graphics/_shared/fixtures-card.js').NL_FIXTURES_CARD;
  const T = load('graphics/_shared/table-card.js').NL_TABLE_CARD;
  const clubs = { byName: () => null, guestByName };
  assert.equal(C.teamDisplay(clubs, 'Fulham PL2', 'wrap'), 'FULHAM');
  assert.equal(C.teamDisplay(clubs, 'Ipswich Town U21', 'wrap'), 'IPSWICH TOWN');
  assert.equal(C.teamDisplay(clubs, 'West Bromwich Albion PL2', 'short'), 'WEST BROM');
  assert.equal(C.teamDisplay(clubs, 'Woking', 'wrap'), 'WOKING');
  assert.equal(C.crestKey(clubs, 'Ipswich Town U21'), 'Ipswich Town', 'the crest still comes from the tagged record');
  /* Full names on tables too, guests included (09/10/2026) — not their
     tight-space short names, which mixed WOLVES with FC HALIFAX TOWN. */
  assert.equal(T.teamDisplay(clubs, 'Wolverhampton Wanderers PL2'), 'WOLVERHAMPTON WANDERERS');
  assert.equal(T.teamDisplay(clubs, 'Norwich City U21'), 'NORWICH CITY');
  assert.equal(T.teamDisplay(clubs, 'FC Halifax Town'), 'FC HALIFAX TOWN');
  assert.equal(T.teamDisplay(clubs, 'Gateshead'), 'GATESHEAD');
});

/* ---------- v1.3: abandoned, late kick-offs, corrections ----------
   Match shapes are the NLS list endpoint's as the batch already reads them:
   attributes.kickOffDateUTC "YYYY-MM-DD HH:MM:SS" (UTC), matchPeriod
   (FullTime / PostMatch / Postponed / Abandoned, nls-data-structure skill),
   homeTeam/awayTeam.score and .penaltyScore. */
const g = (id, ko, period, hs = null, as = null, extra = {}) => ({ id, attributes: {
  kickOffDateUTC: ko, matchPeriod: period,
  homeTeam: { name: 'Home ' + id, score: hs, penaltyScore: null },
  awayTeam: { name: 'Away ' + id, score: as, penaltyScore: null }, ...extra } });

test('an abandoned game prints A - A, and a shootout is not printed for it', () => {
  const win = {};
  new Function('window', readFileSync(join(REPO, 'graphics/_shared/fixtures-card.js'), 'utf8'))(win);
  const C = win.NL_FIXTURES_CARD;
  const clubs = { byName: () => null, byOpta: () => null, guestByName: () => null };
  const built = C.buildRows([g('1', '2026-10-10 14:00:00', 'Abandoned', 1, 0), g('2', '2026-10-10 14:00:00', 'FullTime', 2, 2)], clubs);
  const aa = built.rows.find(r => r.home === 'Home 1');
  assert.deepEqual([aa.hs, aa.as], ['A', 'A']);
  assert.equal(aa.hp, undefined);
  assert.equal(built.rows.find(r => r.home === 'Home 2').hs, '2');
  assert.ok(m.isDone({ attributes: { matchPeriod: 'Abandoned' } }), 'an abandoned game does not hold the card up');
});

test('a 17:30 on a 3pm Saturday is late; a 15:30 and a 12:30 are not', () => {
  // 14:00Z = 15:00 BST; 16:30Z = 17:30 BST
  const day = [g('a', '2026-10-10 14:00:00', 'FullTime', 1, 0), g('b', '2026-10-10 14:00:00', 'FullTime', 0, 0),
               g('c', '2026-10-10 14:30:00', 'FullTime', 2, 1), g('d', '2026-10-10 11:30:00', 'FullTime', 3, 3),
               g('e', '2026-10-10 16:30:00', 'PreMatch')];
  const { early, late } = m.splitLate(day);
  assert.deepEqual(late.map(x => x.id), ['e']);
  assert.deepEqual(early.map(x => x.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(m.splitLate(day.slice(0, 4)).late, [], 'no late game, no early card');
  // in winter the same 15:00 / 17:30 is 15:00Z / 17:30Z
  assert.deepEqual(m.splitLate([g('a', '2026-12-12 15:00:00', 'FullTime'), g('b', '2026-12-12 15:00:00', 'FullTime'),
                                g('c', '2026-12-12 17:30:00', 'PreMatch')]).late.map(x => x.id), ['c']);
});

test('the early card never prints a live score as a result', () => {
  const out = m.withoutLiveScores([g('a', '2026-10-10 14:00:00', 'FullTime', 2, 1), g('e', '2026-10-10 16:30:00', 'SecondHalf', 1, 0)]);
  assert.equal(out[0].attributes.homeTeam.score, 2);
  assert.equal(out[1].attributes.homeTeam.score, null);
  assert.equal(out[1].attributes.awayTeam.score, null);
});

test('a results row with no score prints its kick-off only when it is ticked', () => {
  const src = readFileSync(join(REPO, 'graphics/_shared/fixtures-card.js'), 'utf8');
  assert.match(src, /!scored \|\| r\.koOn === true/);
});

test('once only, and a changed card goes again as the next version', () => {
  const sigA = m.resultsSig([g('1', 'x', 'FullTime', 1, 0)]);
  const sigB = m.resultsSig([g('1', 'x', 'FullTime', 1, 1)]);
  assert.notEqual(sigA, sigB, 'a corrected score changes the fingerprint');
  assert.equal(sigA, m.resultsSig([g('1', 'x', 'PostMatch', 1, 0)].map(x => ({ ...x, attributes: { ...x.attributes, matchPeriod: 'FullTime' } }))));
  const base = '2026-10-10 National Results';
  assert.deepEqual(m.versionedId(base, sigA, new Map()), { id: base, version: 1 });
  assert.equal(m.versionedId(base, sigA, m.parseDone(`${base}\t${sigA}\n`)), null);
  assert.deepEqual(m.versionedId(base, sigB, m.parseDone(`${base}\t${sigA}\n`)), { id: `${base} v2`, version: 2 });
  assert.deepEqual(m.versionedId(base, sigA, m.parseDone(`${base}\t${sigA}\n${base} v2\t${sigB}\n`)), { id: `${base} v3`, version: 3 },
    'compared with the latest version, not the first');
  assert.equal(m.versionedId(base, sigB, m.parseDone(`${base}\n`)), null, 'a card sent before fingerprints is never re-sent');
});

/* delivered: reads a card's fingerprint back from the same list call.
   Response shape: Cloud Storage JSON API objects.list —
   https://cloud.google.com/storage/docs/json_api/v1/objects/list
   ({ items: [{ name }], nextPageToken }). A local stand-in on port 0. */
test('delivered lists each card once, with its fingerprint when it has one', async () => {
  const http = await import('node:http');
  const { execFile } = await import('node:child_process');
  const P = 'graphics/fixtures/2026-27/';
  const pages = [
    { items: [{ name: P + '2026-10-10 National Results/National Results 10Oct26 - 1x1.png' },
              { name: P + '2026-10-10 National Results/.sig-abc123def456' }], nextPageToken: 't2' },
    { items: [{ name: P + '2026-10-08 South Fixtures/South Fixtures 08Oct26 - 1x1.png' }] }
  ];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(u.searchParams.get('pageToken') === 't2' ? pages[1] : pages[0]));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const out = await new Promise((resolve, reject) => execFile(process.execPath,
    [join(REPO, 'scripts/deliver-fixtures-graphics.js'), 'delivered', '2026-27'],
    { env: { ...process.env, STORAGE_API: `http://127.0.0.1:${server.address().port}`, GOOGLE_ACCESS_TOKEN: 'test' } },
    (err, stdout, stderr) => err ? reject(new Error(stderr || err.message)) : resolve(stdout)));
  server.close();
  assert.deepEqual(out.trim().split('\n'), ['2026-10-08 South Fixtures', '2026-10-10 National Results\tabc123def456']);
  const done = m.parseDone(out);
  assert.equal(done.get('2026-10-10 National Results'), 'abc123def456');
  assert.equal(done.get('2026-10-08 South Fixtures'), '');
});

/* Every card the batch decides to make must be one a renderer picks up.
   Fixtures cards carried no `kind` from v1.2 to v1.3, so the renderer skipped
   them and the first live fixtures run (09/10/2026) delivered three empty
   Drive folders. NLS stand-in on port 0; shapes as the batch reads them —
   meta.populatedDates for match days, data[].attributes for matches
   (nls-data-structure skill). */
test('every card due, fixtures and results alike, has a renderer', async () => {
  const http = await import('node:http');
  const { execFile } = await import('node:child_process');
  const match = (id, ko, period, hs, as) => ({ id, attributes: { kickOffDateUTC: ko, matchPeriod: period,
    homeTeam: { name: 'Woking', score: hs }, awayTeam: { name: 'Sutton United', score: as } } });
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/league-tables')) { res.writeHead(404); return res.end('{}'); }
    const from = (u.searchParams.get('from') || '').slice(0, 10);
    const body = u.searchParams.get('includePopulatedDates')
      ? { data: [], meta: { populatedDates: { '2026-10-10': {} } }, links: {} }
      : { data: from <= '2026-10-10' ? [match('g1', '2026-10-10 14:00:00', 'FullTime', 1, 0)] : [], meta: { totalCount: 1 }, links: {} };
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const script = `
    const m = require(${JSON.stringify(join(REPO, 'scripts/build-fixtures-graphics.js'))});
    (async () => {
      const out = [];
      for (const [mode, today] of [['fixtures', '2026-10-08'], ['results', '2026-10-10']]) {
        const r = await m.dueCards({ mode, division: 'National', today, formats: ['1x1'], noTables: true }, {}, 2026, new Map());
        out.push(...r.cards.map(c => ({ id: c.id, kind: c.kind })));
      }
      console.log(JSON.stringify({ cards: out, kinds: Object.keys(m.KIND) }));
    })().catch(e => { console.error(e.stack); process.exit(1); });`;
  const stdout = await new Promise((resolve, reject) => execFile(process.execPath, ['-e', script],
    { env: { ...process.env, NLS_BASE: `http://127.0.0.1:${server.address().port}` } },
    (err, out, errOut) => err ? reject(new Error(errOut || err.message)) : resolve(out)));
  server.close();
  const { cards, kinds } = JSON.parse(stdout);
  assert.deepEqual(cards.map(c => c.id), ['2026-10-10 National Fixtures', '2026-10-10 National Results']);
  for (const c of cards) assert.ok(kinds.includes(c.kind), `${c.id} has kind ${c.kind}, which nothing draws`);
});

/* Matchday cards (decided 09/10/2026): on the morning of each day of a round
   that spans more than one day, a card with that day's games only. A
   one-day round gets none — the round card already is that card. Same
   stand-in shapes as above. */
test('matchday: Saturday without the Friday game, the round so far with it; nothing for a one-day round', async () => {
  const http = await import('node:http');
  const { execFile } = await import('node:child_process');
  const games = {
    '2026-10-09': [{ id: 'f1', attributes: { kickOffDateUTC: '2026-10-09 18:45:00', matchPeriod: 'FullTime',
      homeTeam: { name: 'Sutton United', score: 2 }, awayTeam: { name: 'Boreham Wood', score: 1 } } }],
    '2026-10-10': [{ id: 's1', attributes: { kickOffDateUTC: '2026-10-10 14:00:00', matchPeriod: 'PreMatch',
      homeTeam: { name: 'Woking' }, awayTeam: { name: 'Yeovil Town' } } },
      { id: 's2', attributes: { kickOffDateUTC: '2026-10-10 14:00:00', matchPeriod: 'Postponed',
      homeTeam: { name: 'Barrow' }, awayTeam: { name: 'Gateshead' } } }],
    '2026-10-13': [{ id: 't1', attributes: { kickOffDateUTC: '2026-10-13 18:45:00', matchPeriod: 'PreMatch',
      homeTeam: { name: 'Woking' }, awayTeam: { name: 'Barrow' } } }]
  };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const pd = Object.fromEntries(Object.keys(games).map(d => [d, {}]));
    const from = (u.searchParams.get('from') || '').slice(0, 10), to = (u.searchParams.get('to') || '').slice(0, 10);
    const list = Object.keys(games).filter(d => d >= from && d <= to).flatMap(d => games[d]);
    const body = u.searchParams.get('includePopulatedDates')
      ? { data: [], meta: { populatedDates: pd }, links: {} }
      : { data: list, meta: { totalCount: list.length }, links: {} };
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const rounds = { National: [{ round: 13, main: '2026-10-10', from: '2026-10-09', to: '2026-10-11' },
                              { round: 14, main: '2026-10-13', from: '2026-10-12', to: '2026-10-14' }] };
  const script = `
    const m = require(${JSON.stringify(join(REPO, 'scripts/build-fixtures-graphics.js'))});
    (async () => {
      const out = {};
      for (const today of ['2026-10-09', '2026-10-10', '2026-10-13']) {
        const r = await m.dueCards({ mode: 'matchday', division: 'National', today, formats: ['4x5'] },
          ${JSON.stringify(rounds)}, 2026, new Map());
        out[today] = r.cards.map(c => ({ id: c.id, kind: c.kind, games: c.data.map(g => g.id), title: c.matchday, file: c.files[0].file, mode: c.mode }));
      }
      console.log(JSON.stringify(out));
    })().catch(e => { console.error(e.stack); process.exit(1); });`;
  const stdout = await new Promise((resolve, reject) => execFile(process.execPath, ['-e', script],
    { env: { ...process.env, NLS_BASE: `http://127.0.0.1:${server.address().port}` } },
    (err, out, errOut) => err ? reject(new Error(errOut || err.message)) : resolve(out)));
  server.close();
  const out = JSON.parse(stdout);
  assert.deepEqual(out['2026-10-10'][0], { id: '2026-10-10 National Fixtures Sat', kind: 'fixtures', games: ['s1'],
    title: '13', file: 'National Fixtures 10Oct26 Sat - 4x5.png', mode: 'fixtures' }, 'Saturday only, postponed game left off');
  assert.deepEqual(out['2026-10-10'][1], { id: '2026-10-10 National Round so far', kind: 'fixtures', games: ['f1', 's1'],
    title: '13', file: 'National Round so far 10Oct26 - 4x5.png', mode: 'round' }, 'and the round so far, Friday included');
  assert.equal(out['2026-10-10'].length, 2);
  assert.equal(out['2026-10-09'].length, 1, 'Friday: no earlier day, so no round-so-far card');
  assert.equal(out['2026-10-09'][0].id, '2026-10-09 National Fixtures Fri', 'the Friday of a two-day round gets its own');
  assert.deepEqual(out['2026-10-09'][0].games, ['f1']);
  assert.deepEqual(out['2026-10-13'], [], 'a one-day round: the round card already shows only today');
});
