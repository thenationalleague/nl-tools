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
