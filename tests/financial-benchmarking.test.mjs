/* Financial Benchmarking — the import parser, the derived figures, the
   nameless comparison lists, and the rules that keep one club out of
   another's figures.

   Every club and number here is invented. Real returns are club-confidential
   and never enter this repo. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { REPO } from './load-canon.mjs';
import { levelRule } from '../scripts/rtdb-level-rule.mjs';

const ctx = {};
vm.runInNewContext(readFileSync(join(REPO, 'financial-benchmarking/_data.js'), 'utf8'), ctx);
const D = ctx.FBData;

const CLUBS = [
  { name: 'Alpha Town', short: 'Alpha', code: 'ALP', division: 'National' },
  { name: 'Beta United FC', short: 'Beta Utd', code: 'BET', division: 'National' },
  { name: 'Gamma City', short: 'Gamma', code: 'GAM', division: 'North' },
  { name: 'Delta & Epsilon', short: 'Delta', code: 'DEL', division: 'North' },
  { name: 'Zeta Rovers', short: 'Zeta', code: 'ZET', division: 'South' },
  { name: 'Former Club', short: 'Former', code: 'FOR', division: null },
];
const resolve = D.resolver(CLUBS);
const row = (...c) => c.join('\t');

/* The North and South sheet, as it pastes: a blank column between the two
   blocks and a % column after each. */
const STEP2 = [
  row('Club', 'Income Budget', 'FQR1 Income', '%', '', 'Playing Squad Budget', 'FQR1 Player Spend', '%'),
  row('Gamma City', '£1,000,000', '£250,000', '99%', '', '£400,000', '£120,000', '99%'),
  row('Delta and Epsilon FC', '800,000', '160,000', '20%', '', '300,000', '60,000', '20%'),
  row('Zeta Rovers', '500,000', '200,000', '40%', '', '250,000', '100,000', '40%'),
].join('\n');

/* The National sheet: a REVENUE / COSTS banner row above the headings. */
const NATIONAL = [
  row('', 'REVENUE', '', '', '', '', 'COSTS', ''),
  row('Club', 'INCOME BUDGET', 'MATCH REVENUE', 'COMMERCIAL/SPONSORSHIP', 'NON-MATCHDAY', 'TRANSFER INCOME/(SPEND)', 'PLAYER WAGES', 'MANAGER WAGES'),
  row('Alpha Town', '2,000,000', '300,000', '150,000', '50,000', '(40,000)', '400,000', '50,000'),
  row('Beta United', '1,000,000', '100,000', '100,000', '-', '25,000', '200,000', '40,000'),
].join('\r\n');

test('numbers read as a spreadsheet writes them', () => {
  assert.equal(D.parseNum('£1,234,567'), 1234567);
  assert.equal(D.parseNum('(40,000)'), -40000);
  assert.equal(D.parseNum('-12.5'), -12.5);
  assert.equal(D.parseNum(' 23.4% '), 23.4);
  assert.equal(D.parseNum(0), 0);
  for (const none of ['', '-', '–', 'n/a', 'TBC', null, undefined]) {
    assert.equal(D.parseNum(none), null, `${JSON.stringify(none)} is no figure, not zero`);
  }
});

test('the North and South sheet parses by heading, blank column and % columns ignored', () => {
  const p = D.parsePaste(STEP2, resolve);
  assert.equal(p.errors.length, 0, p.errors.join(' '));
  assert.equal(p.set, 'step2');
  assert.equal(p.rows.length, 3);
  const g = p.rows.find((r) => r.code === 'GAM');
  assert.equal(g.div, 'North');
  assert.equal(JSON.stringify(g.v), JSON.stringify({ incomeBudget: 1000000, fqrIncome: 250000, squadBudget: 400000, playerSpend: 120000 }));
  /* "Delta and Epsilon FC" in the sheet is "Delta & Epsilon" in clubs-meta. */
  assert.ok(p.rows.find((r) => r.code === 'DEL'), 'a name differing by &, FC and case still matches');
});

test('the percentages are worked out from the figures, not read from the sheet', () => {
  const p = D.parsePaste(STEP2, resolve);
  const f = D.figures('step2', p.rows.find((r) => r.code === 'GAM').v);
  assert.equal(f.incomePct, 25);       // the sheet said 99%
  assert.equal(f.spendPct, 30);
  assert.equal(f.spendOfIncome, 48);
  assert.equal(f.budgetRatio, 40, 'squad budget as a share of income budget');
});

test('the National sheet parses under its banner row, brackets as a negative', () => {
  const p = D.parsePaste(NATIONAL, resolve);
  assert.equal(p.errors.length, 0, p.errors.join(' '));
  assert.equal(p.set, 'national');
  assert.equal(p.rows.length, 2);
  const a = p.rows.find((r) => r.code === 'ALP');
  assert.equal(a.v.transfers, -40000);
  const f = D.figures('national', a.v);
  assert.equal(f.income, 500000);
  assert.ok(!('incomePct' in f), 'National income is not shown as a share of budget');
  /* 450,000 of wages against a 2,000,000 BUDGET, not the 500,000 received. */
  assert.equal(f.wagesOfBudget, 22.5);
});

test('a missing figure stays missing, and takes its derived figures with it', () => {
  const p = D.parsePaste(NATIONAL, resolve);
  const b = p.rows.find((r) => r.code === 'BET');
  assert.ok(!('nonMatchday' in b.v), 'a dash is not stored as zero');
  const f = D.figures('national', b.v);
  assert.equal(f.nonMatchday, null);
  assert.equal(f.income, null, 'a total with a part missing is not a total');
  assert.equal(f.wagesOfBudget, 24, 'wages against budget do not need the income lines');
  assert.equal(f.playerWages, 200000);
  assert.equal(D.figures('step2', { fqrIncome: 5, incomeBudget: 0 }).incomePct, null, 'no percentage of a zero budget');
});

test('an unrecognised club is handed back to be named, not dropped or guessed', () => {
  const p = D.parsePaste(STEP2.replace('Zeta Rovers', 'Zetta'), resolve);
  assert.equal(p.rows.length, 2);
  assert.equal(p.unmatched.length, 1);
  assert.equal(p.unmatched[0].name, 'Zetta');
  assert.equal(p.unmatched[0].v.incomeBudget, 500000);
});

test('a club in the wrong sheet, a club twice, and a sheet with no headings are refused', () => {
  const wrong = D.parsePaste(STEP2.replace('Zeta Rovers', 'Alpha Town'), resolve);
  assert.match(wrong.errors.join(' '), /Alpha Town is a National club/);
  const twice = D.parsePaste(STEP2 + '\n' + row('Gamma', '1', '1', '', '', '1', '1', ''), resolve);
  assert.match(twice.errors.join(' '), /Gamma City appears twice/);
  assert.ok(D.parsePaste('Alpha Town\t1\t2', resolve).errors.length);
  assert.ok(D.parsePaste(row('Club', 'Something Else') + '\n' + row('Alpha Town', '1'), resolve).errors.length);
  assert.equal(resolve('Former Club'), null, 'a club with no division this season is not on the roster');
});

test('comparison lists hold figures only: no names, no codes, each sorted on its own', () => {
  const clubs = {};
  for (const r of D.parsePaste(STEP2, resolve).rows) clubs[r.code] = { div: r.div, v: r.v };
  for (const r of D.parsePaste(NATIONAL, resolve).rows) clubs[r.code] = { div: r.div, v: r.v };
  const bench = D.benchAll(clubs);
  assert.equal(JSON.stringify(Object.keys(bench).sort()), JSON.stringify(['National', 'North', 'South']));
  assert.equal(JSON.stringify(bench.North.incomeBudget), JSON.stringify([800000, 1000000]));
  assert.equal(JSON.stringify(bench.North.incomePct), JSON.stringify([20, 25]));
  assert.equal(JSON.stringify(bench.National.transfers), JSON.stringify([-40000, 25000]));
  assert.equal(bench.National.nonMatchday.length, 1, 'a club with no figure is not in that list');
  const text = JSON.stringify(bench);
  for (const c of CLUBS) {
    assert.ok(!text.includes(c.name) && !text.includes(`"${c.code}"`), `${c.name} is not named in the lists`);
  }
  assert.ok(!('matchRevenue' in bench.North), 'North holds no National-only figure');
});

test('North and South merge into one sorted list', () => {
  const both = D.combine({ incomeBudget: [800000, 1000000] }, { incomeBudget: { 0: 500000 } });
  assert.equal(JSON.stringify(both.incomeBudget), JSON.stringify([500000, 800000, 1000000]));
  assert.equal(D.median(both.incomeBudget), 800000);
  assert.equal(D.median([1, 2, 3, 10]), 2.5);
  assert.equal(D.median([]), null);
});

test('position is said against the median, never as a rank', () => {
  assert.equal(D.againstMedian('money', 920000, 800000, 'North'), '£120,000 above the North median');
  assert.equal(D.againstMedian('money', 700000, 800000, 'North and South'), '£100,000 below the North and South median');
  assert.equal(D.againstMedian('money', 800000, 800000, 'North'), 'On the North median');
  assert.equal(D.againstMedian('pct', 33.25, 25, 'South'), '8.3 points above the South median');
  assert.equal(D.againstMedian('pct', 24, 25, 'South'), '1.0 point below the South median');
  assert.equal(D.againstMedian('money', null, 800000, 'North'), '');
  assert.equal(D.money(-40000), '-£40,000');
  assert.equal(D.percent(23.44), '23.4%');
});

test('abbreviated names match, and a name that could be two clubs matches neither', () => {
  const r = D.resolver([
    { name: 'Eta United', short: 'Eta', code: 'ETA', division: 'South' },
    { name: 'Theta Town', short: 'Theta', code: 'THE', division: 'South' },
    { name: 'Iota City', short: 'Iota C', code: 'IOC', division: 'North' },
    { name: 'Iota United', short: 'Iota U', code: 'IOU', division: 'North' },
  ]);
  assert.equal(r('Eta Utd').code, 'ETA');
  assert.equal(D.normName("Kappa's Lynn"), D.normName('Kappas Lynn'), 'an apostrophe is not a space');
  assert.equal(r('ETA UTD.').code, 'ETA');
  assert.equal(r('Theta').code, 'THE');
  assert.equal(r('Theta United').code, 'THE', 'the wrong last word still means the only Theta');
  assert.equal(r('Iota Utd').code, 'IOU', 'an exact name wins over a shared stem');
  assert.equal(r('Iota'), null, 'two clubs called Iota: ask, do not guess');
  assert.equal(r('Iota Town'), null);
});

test('a figure is ranked by size, largest first, ties sharing a place', () => {
  assert.equal(JSON.stringify(D.rankOf([100, 200, 300, 400], 400)), JSON.stringify({ rank: 1, of: 4 }));
  assert.equal(JSON.stringify(D.rankOf([100, 200, 300, 400], 100)), JSON.stringify({ rank: 4, of: 4 }));
  assert.equal(D.rankOf([100, 300, 300, 400], 300).rank, 2);
  assert.equal(D.rankOf([100, 200], null), null);
  assert.equal(D.rankOf([], 5), null);
  assert.equal(JSON.stringify([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 24, 48].map(D.ordinal)),
    JSON.stringify(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '24th', '48th']));
});

test('every figure the club view lays out exists, and the set names its return', () => {
  for (const set of ['national', 'step2']) {
    const keys = D.metricsOf(set).map((m) => m.key);
    const def = D.SETS[set];
    for (const k of (def.ratios || { metrics: [] }).metrics) assert.ok(keys.includes(k), k);
    for (const pn of def.panels || []) for (const k of [pn.budget, pn.actual, pn.pct]) assert.ok(keys.includes(k), k);
  }
  assert.equal(D.quarterLabel('q1', 'national'), 'SCMP1');
  assert.equal(D.quarterLabel('q3', 'step2'), 'FQR3');
  assert.equal(D.quarterLabel('q1'), 'FQR1');
});

test('finance\'s wording: the titles as asked, the return named in each', () => {
  const title = (set, key) => D.metricsOf(set).find((m) => m.key === key).label
    .replace(/\{Q\}/g, D.quarterLabel('q1', set));
  assert.equal(title('national', 'income'),
    'SCMP1 income excluding transfers, distributions, parachute payments, and prize money');
  assert.equal(title('national', 'wagesOfBudget'), 'Wages as % of budgeted income');
  assert.equal(JSON.stringify(D.SETS.national.groups[0].metrics.slice(0, 2).map((m) => m.key)),
    JSON.stringify(['incomeBudget', 'income']), 'income to date sits beside the budget');
  assert.equal(title('step2', 'budgetRatio'), 'Budgeted squad spend as a % of income');
  assert.equal(title('step2', 'spendOfIncome'), 'FQR1 squad spend as a % of FQR1 income');
  assert.equal(title('step2', 'incomePct'), 'FQR1 income as a % of budgeted income');
  assert.equal(title('step2', 'spendPct'), 'FQR1 player spend as a % of budgeted player spend');
});

/* ---- Rules and registry ---------------------------------------------------- */

const rules = JSON.parse(readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8')).rules;
const registry = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));
const KEY = 'ops-financial-benchmarking';
const node = rules['app-data'][KEY];

test('staff access is the generated rule: Use reads, Manage writes', () => {
  assert.equal(node['.read'], levelRule(KEY, 'access'));
  assert.equal(node['.write'], levelRule(KEY, 'admin'));
});

test('a club reads its own row and no other', () => {
  const ret = node.returns.$season.$quarter;
  assert.equal(ret.clubs.$club['.read'], 'auth != null && auth.token.club === $club');
  assert.equal(ret.clubs['.read'], undefined, 'no rule opens every club at once');
  assert.equal(ret['.read'], undefined);
  assert.equal(node.returns['.read'], undefined);
});

test('comparison lists open only to a club with a row in that return, National kept apart', () => {
  const rule = node.returns.$season.$quarter.bench.$div['.read'];
  assert.match(rule, /auth\.token\.club != null/);
  assert.match(rule, /child\('clubs'\)\.child\(auth\.token\.club\)\.child\('div'\)\.exists\(\)/);
  assert.match(rule, /\.val\(\) === \$div \|\| \(\$div !== 'National' && .*\.val\(\) !== 'National'\)/);
  assert.equal(node.returns.$season.$quarter.bench['.read'], undefined);
});

test('no club path can be written by a club', () => {
  const text = JSON.stringify(node.returns) + JSON.stringify(node.index);
  assert.ok(!text.includes('.write'), 'the only write rule is the staff one at the top');
});

test('registry: admins by default, staff and club accounts off, card opens the one page', () => {
  const rec = registry[KEY];
  assert.equal(JSON.stringify(rec.defaults), JSON.stringify({
    superadmin: 'admin', admin: 'admin', staff: 'off', 'club-admin': 'off', 'club-staff': 'off',
  }));
  assert.equal(rec.url, '/financial-benchmarking/');
  assert.ok(rec.levels.includes('access') && rec.levels.includes('admin'));
});
