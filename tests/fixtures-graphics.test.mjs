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
