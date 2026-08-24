/* Commercial Compliance — unit tests for the pure logic in
   commercial-compliance/_shared.js (loaded in a VM sandbox, same pattern as
   tests/programme.test.mjs). Covers the pieces that silently corrupt a season
   of compliance records if wrong:

     · periodsFor    — period keys are RTDB paths and due dates drive the
                       escalation list; a fencepost here mis-chases 72 clubs.
     · isMaterialEdit— decides when an obligation versions. A false negative
                       rewrites what clubs owe without a version; a false
                       positive versions on every typo fix.
     · clubRollup /
       overdueOpen   — the dashboard cell states and the chase list.

   Firebase-dependent behaviour (writes, auth, rules) is not covered here —
   the page wires those through auth-guard and the audit hook. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

const sandbox = {
  console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp,
  Error, parseInt, parseFloat, isNaN, isFinite,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(REPO, 'commercial-compliance/_shared.js'), 'utf8'), sandbox,
  { filename: 'commercial-compliance/_shared.js' });

const CC = sandbox.CC;

/* ── seasons ──────────────────────────────────────────────────────────── */

test('seasonBounds: 1 Jul to 30 Jun', () => {
  const b = CC.seasonBounds('2026');
  assert.equal(CC.ymd(b.start), '2026-07-01');
  assert.equal(CC.ymd(b.end), '2027-06-30');
});

test('seasonBounds throws on a bad key', () => {
  assert.throws(() => CC.seasonBounds('current'));
});

test('seasonLabel derives YYYY-YY', () => {
  assert.equal(CC.seasonLabel('2026'), '2026-27');
  assert.equal(CC.seasonLabel('2099'), '2099-00');
});

/* ── periods: season cadence ──────────────────────────────────────────── */

test('season cadence: one period, due defaults to season end', () => {
  const p = CC.periodsFor({ cadence: 'season' }, '2026');
  assert.equal(p.length, 1);
  assert.equal(p[0].key, 'season');
  assert.equal(CC.ymd(p[0].due), '2027-06-30');
});

test('season cadence: explicit dueDate wins', () => {
  const p = CC.periodsFor({ cadence: 'season', dueDate: '2026-08-15' }, '2026');
  assert.equal(CC.ymd(p[0].due), '2026-08-15');
});

test('missing cadence defaults to season', () => {
  assert.equal(CC.periodsFor({}, '2026')[0].key, 'season');
});

test('unknown cadence throws rather than inventing periods', () => {
  assert.throws(() => CC.periodsFor({ cadence: 'fortnightly' }, '2026'));
});

/* ── periods: monthly cadence ─────────────────────────────────────────── */

test('monthly: 12 periods Jul→Jun with the year rollover', () => {
  const p = CC.periodsFor({ cadence: 'monthly' }, '2026');
  assert.equal(p.length, 12);
  assert.equal(p[0].key, '2026-07');
  assert.equal(p[5].key, '2026-12');
  assert.equal(p[6].key, '2027-01');
  assert.equal(p[11].key, '2027-06');
});

test('monthly: default due is month end, February included', () => {
  const p = CC.periodsFor({ cadence: 'monthly' }, '2026');
  assert.equal(CC.ymd(p[0].due), '2026-07-31');
  const feb = p.find((x) => x.key === '2027-02');
  assert.equal(CC.ymd(feb.due), '2027-02-28');
});

test('monthly: dueDay clamps to short months', () => {
  const p = CC.periodsFor({ cadence: 'monthly', dueDay: 31 }, '2026');
  assert.equal(CC.ymd(p.find((x) => x.key === '2026-09').due), '2026-09-30');
  assert.equal(CC.ymd(p.find((x) => x.key === '2027-02').due), '2027-02-28');
  assert.equal(CC.ymd(p.find((x) => x.key === '2026-08').due), '2026-08-31');
});

test('monthly: dueDay applies when it fits', () => {
  const p = CC.periodsFor({ cadence: 'monthly', dueDay: 5 }, '2026');
  assert.equal(CC.ymd(p[0].due), '2026-07-05');
});

/* ── periods: weekly cadence ──────────────────────────────────────────── */

test('weekly: Mondays covering the season, due the following Sunday', () => {
  const p = CC.periodsFor({ cadence: 'weekly' }, '2026');
  /* 1 Jul 2026 is a Wednesday → first Monday on/before is 29 Jun 2026;
     30 Jun 2027 is a Wednesday → last Monday is 28 Jun 2027; 53 weeks. */
  assert.equal(p[0].key, '2026-06-29');
  assert.equal(p[p.length - 1].key, '2027-06-28');
  assert.equal(p.length, 53);
  for (const w of p) {
    const mon = CC.parseYmd(w.key);
    assert.equal(mon.getDay(), 1, w.key + ' is not a Monday');
    assert.equal((w.due - mon) / 86400000, 6, w.key + ' due is not its Sunday');
  }
});

test('weekly period keys are unique (they are RTDB paths)', () => {
  const p = CC.periodsFor({ cadence: 'weekly' }, '2026');
  assert.equal(new Set(p.map((x) => x.key)).size, p.length);
});

/* ── overdue fencepost ────────────────────────────────────────────────── */

test('isOverdue: the due day itself is still on time', () => {
  const period = { due: new Date(2026, 7, 15) }; /* 15 Aug 2026 */
  assert.equal(CC.isOverdue(period, new Date(2026, 7, 15)), false);
  assert.equal(CC.isOverdue(period, new Date(2026, 7, 15, 23, 59)), false);
  assert.equal(CC.isOverdue(period, new Date(2026, 7, 16, 0, 1)), true);
});

/* ── material edits ───────────────────────────────────────────────────── */

const BASE = {
  title: 'Perimeter boards', notes: 'seed',
  partnerIds: { p1: true, p2: true }, cadence: 'season', dueDate: '2026-09-01',
  dueDay: null, divisions: { National: true, North: true }, criteria: 'Wide shot',
};

test('title and notes edits are cosmetic', () => {
  assert.equal(CC.isMaterialEdit(BASE, { ...BASE, title: 'Perimeter advertising boards' }), false);
  assert.equal(CC.isMaterialEdit(BASE, { ...BASE, notes: 'anything else' }), false);
});

test('each material field triggers a version', () => {
  assert.equal(CC.isMaterialEdit(BASE, { ...BASE, partnerIds: { p1: true } }), true);
  assert.equal(CC.isMaterialEdit(BASE, { ...BASE, cadence: 'monthly' }), true);
  assert.equal(CC.isMaterialEdit(BASE, { ...BASE, dueDate: '2026-10-01' }), true);
  assert.equal(CC.isMaterialEdit(BASE, { ...BASE, dueDay: 5 }), true);
  assert.equal(CC.isMaterialEdit(BASE, { ...BASE, divisions: { National: true } }), true);
  assert.equal(CC.isMaterialEdit(BASE, { ...BASE, criteria: 'Close-up' }), true);
});

test('set comparisons ignore key order and false entries', () => {
  assert.equal(CC.isMaterialEdit(BASE, { ...BASE, partnerIds: { p2: true, p1: true, p3: false } }), false);
  assert.equal(CC.isMaterialEdit(BASE, { ...BASE, divisions: { North: true, National: true, South: false } }), false);
});

test('null/empty/whitespace normalisation does not false-positive', () => {
  assert.equal(CC.isMaterialEdit({ ...BASE, dueDay: null }, { ...BASE, dueDay: '' }), false);
  assert.equal(CC.isMaterialEdit({ ...BASE, criteria: 'Wide shot' }, { ...BASE, criteria: '  Wide shot  ' }), false);
  assert.equal(CC.isMaterialEdit({ ...BASE, dueDate: null }, { ...BASE, dueDate: '' }), false);
});

/* ── rollup + escalation ──────────────────────────────────────────────── */

const MONTHLY = { cadence: 'monthly' };

test('clubRollup: judged non-compliant beats overdue beats clear', () => {
  const periods = CC.periodsFor(MONTHLY, '2026');
  const today = new Date(2026, 9, 15); /* 15 Oct 2026 → Jul, Aug, Sep due */

  let r = CC.clubRollup(periods, {
    '2026-07': { state: 'compliant' }, '2026-08': { state: 'compliant' }, '2026-09': { state: 'compliant' },
  }, today);
  assert.deepEqual({ state: r.state, due: r.due, met: r.met, open: r.open }, { state: 'clear', due: 3, met: 3, open: 0 });

  r = CC.clubRollup(periods, { '2026-07': { state: 'compliant' } }, today);
  assert.equal(r.state, 'overdue');
  assert.equal(r.open, 2);

  r = CC.clubRollup(periods, { '2026-07': { state: 'non-compliant' } }, today);
  assert.equal(r.state, 'failed');
});

test('clubRollup: nothing due yet', () => {
  const periods = CC.periodsFor({ cadence: 'season' }, '2026');
  const early = new Date(2026, 7, 1); /* 1 Aug — season due 30 Jun 2027 */
  assert.equal(CC.clubRollup(periods, {}, early).state, 'none');
  /* early tick shows as clear, not none */
  assert.equal(CC.clubRollup(periods, { season: { state: 'compliant' } }, early).state, 'clear');
});

test('clubRollup: evidence-only record still reads outstanding', () => {
  const periods = CC.periodsFor(MONTHLY, '2026');
  const today = new Date(2026, 7, 15); /* Jul due */
  const r = CC.clubRollup(periods, { '2026-07': { evidence: 'https://x' } }, today);
  assert.equal(r.state, 'overdue');
});

test('overdueOpen lists exactly the past-due unrecorded periods', () => {
  const periods = CC.periodsFor(MONTHLY, '2026');
  const today = new Date(2026, 9, 15); /* Jul, Aug, Sep due */
  const open = CC.overdueOpen(periods, { '2026-08': { state: 'compliant' } }, today);
  /* spread: the sandbox array carries the VM realm's prototype, which strict
     deepEqual rejects */
  assert.deepEqual([...open].map((p) => p.key), ['2026-07', '2026-09']);
});

/* ── states ───────────────────────────────────────────────────────────── */

test('nextState cycles outstanding → compliant → non-compliant', () => {
  assert.equal(CC.nextState('outstanding'), 'compliant');
  assert.equal(CC.nextState('compliant'), 'non-compliant');
  assert.equal(CC.nextState('non-compliant'), 'outstanding');
  assert.equal(CC.nextState(undefined), 'compliant');
});
