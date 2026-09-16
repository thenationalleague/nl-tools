/* Commercial Benchmarking — unit tests for the pure logic in
   commercial-benchmarking/dashboard.js (loaded in a VM sandbox, same pattern
   as tests/commercial-compliance.test.mjs).

     · importRows  — brings late club returns into the live set. A wrong merge
                     here silently corrupts every club's percentiles, or writes
                     a club into the wrong division's benchmark; a missed
                     validation lets one bad paste half-apply.
     · recompute   — the medians / percentiles the whole dashboard is built on
                     (exercised through importRows).

   Rendering, Firebase writes and the modal are not covered — the page wires
   those through auth-guard and the editor's existing save path. */

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
  Error, parseInt, parseFloat, isNaN, isFinite, Promise,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(REPO, 'commercial-benchmarking/dashboard.js'), 'utf8'), sandbox,
  { filename: 'commercial-benchmarking/dashboard.js' });

const CB = sandbox.CBDash;
// Arrays and objects built inside the sandbox carry that realm's prototypes,
// which strict deepEqual rejects — compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));
const same = (a, b, msg) => assert.deepEqual(plain(a), b, msg);

/* ── fixture: two metrics, four roster clubs, one with no return ────────── */

function metric(v, extra) { return Object.assign({ value: v }, extra || {}); }
function club(name, division, ms, stands) {
  return {
    club: name, division, fsSponsor: '', bsSponsor: '', slSponsor: '',
    fsSector: 'Retail', bsSector: '', slSector: '', fsStart: '', bsStart: '', slStart: '',
    stands: [], standSectors: '',
    metrics: { msTicket: metric(ms), standCount: metric(stands) },
    chips: { progFormat: 'Printed' },
  };
}
function fixture() {
  const AGG = {
    meta: { leagueN: 3, divN: { National: 0, North: 2, South: 1 } },
    aggregates: {
      msTicket: { label: 'Matchday ticket', unit: '£', group: 'Ticketing', scopes: {} },
      standCount: { label: 'Stand sponsors', unit: '', group: 'Stand sponsorship', scopes: {} },
    },
    chips: {}, sectors: {},
    roster: [
      { club: 'Alpha', division: 'North', data: true },
      { club: 'Beta', division: 'North', data: true },
      { club: 'Delta', division: 'North', data: false },
      { club: 'Gamma', division: 'South', data: true },
    ],
  };
  const clubs = [
    club('Alpha', 'North', 10, 1),
    club('Beta', 'North', 20, 2),
    Object.assign({ club: 'Delta', division: 'North', metrics: {}, chips: {}, stands: [], standSectors: '', fsSponsor: '', bsSponsor: '', slSponsor: '' }, { _noData: true }),
    club('Gamma', 'South', 15, 0),
  ];
  CB.recompute(AGG, clubs);
  return { AGG, clubs };
}
const deltaRow = () => ({
  club: 'Delta', division: 'North', fsSponsor: 'Acme', fsSector: 'Manufacturing',
  metrics: { msTicket: { value: 30 }, standCount: { value: 1 } },
  chips: { progFormat: 'Digital' }, stands: [{ name: 'Acme', sector: 'Manufacturing', income: 500 }], standSectors: 'Manufacturing',
});

/* ── dry run ─────────────────────────────────────────────────────────────── */

test('dryRun reports the plan and mutates nothing', () => {
  const { AGG, clubs } = fixture();
  const before = JSON.stringify({ AGG, clubs });
  const res = CB.importRows(AGG, clubs, [deltaRow()], { dryRun: true });
  assert.equal(res.ok, true);
  same(res.added, ['Delta']);
  same(res.replaced, []);
  assert.equal(JSON.stringify({ AGG, clubs }), before);
});

/* ── every way a paste can be wrong fails whole ──────────────────────────── */

const bad = [
  ['not an array', {}, /array/],
  ['empty array', [], /array/],
  ['no club name', [{ division: 'North', metrics: { msTicket: { value: 1 } } }], /no club name/],
  ['off the roster', [Object.assign(deltaRow(), { club: 'Omega' })], /not on the roster/],
  ['wrong division', [Object.assign(deltaRow(), { division: 'South' })], /roster says “North”/],
  ['unknown metric', [Object.assign(deltaRow(), { metrics: { msTicket: { value: 1 }, bogus: { value: 2 } } })], /unknown metric bogus/],
  ['non-numeric value', [Object.assign(deltaRow(), { metrics: { msTicket: { value: '30' } } })], /non-numeric value for msTicket/],
  ['no figures', [Object.assign(deltaRow(), { metrics: { msTicket: { value: null }, standCount: { value: 0 } } })], /no figures/],
  ['listed twice', [deltaRow(), deltaRow()], /listed twice/],
  ['already has data', [Object.assign(deltaRow(), { club: 'Alpha' })], /already has data/],
];
for (const [name, rows, re] of bad) {
  test(`refuses: ${name}`, () => {
    const { AGG, clubs } = fixture();
    const before = JSON.stringify({ AGG, clubs });
    const res = CB.importRows(AGG, clubs, rows);
    assert.equal(res.ok, false);
    assert.ok(res.errors.some(e => re.test(e)), `expected ${re} in ${JSON.stringify(res.errors)}`);
    assert.equal(JSON.stringify({ AGG, clubs }), before, 'nothing applied on a refusal');
  });
}

test('one bad row among good ones refuses the lot', () => {
  const { AGG, clubs } = fixture();
  const res = CB.importRows(AGG, clubs, [deltaRow(), Object.assign(deltaRow(), { club: 'Omega' })]);
  assert.equal(res.ok, false);
  assert.equal(clubs[2]._noData, true);
});

/* ── apply ───────────────────────────────────────────────────────────────── */

test('adds the club in place, flags the roster, recounts responses', () => {
  const { AGG, clubs } = fixture();
  const res = CB.importRows(AGG, clubs, [deltaRow()]);
  assert.equal(res.ok, true);
  assert.equal(clubs.length, 4, 'the roster stub is replaced, not appended');
  const d = clubs[2];
  assert.equal(d.club, 'Delta');
  assert.equal(d._noData, false);
  assert.equal(d.fsSponsor, 'Acme');
  assert.equal(d.chips.progFormat, 'Digital');
  assert.equal(AGG.roster[2].data, true);
  same(AGG.meta, { leagueN: 4, divN: { National: 0, North: 3, South: 1 } });
});

test('percentiles are recomputed for the new club AND its neighbours', () => {
  const { AGG, clubs } = fixture();
  assert.equal(clubs[0].metrics.msTicket.divPct, 25, 'Alpha among [10,20] before');
  CB.importRows(AGG, clubs, [deltaRow()]);
  const north = AGG.aggregates.msTicket.scopes.North;
  same(north.values, [10, 20, 30]);
  assert.equal(north.median, 20);
  assert.equal(clubs[2].metrics.msTicket.divPct, 83, 'Delta: 2 below + half of itself, of 3');
  assert.equal(clubs[2].metrics.msTicket.step2Pct, 88, 'Step 2 = North + South: [10,15,20,30]');
  assert.equal(clubs[0].metrics.msTicket.divPct, 17, 'Alpha shifts once Delta arrives');
  assert.equal(AGG.aggregates.msTicket.scopes.league.count, 4);
  same(AGG.sectors.front, [{ label: 'Retail', count: 3 }, { label: 'Manufacturing', count: 1 }]);
  same(AGG.chips.progFormat, { Printed: 3, Digital: 1 });
});

test('sector mixes are rebuilt per scope, with the clubs each is drawn from', () => {
  const { AGG, clubs } = fixture();
  CB.importRows(AGG, clubs, [deltaRow()]);
  const sc = AGG.sectors.scopes;
  same(sc.league.front, [{ label: 'Retail', count: 3 }, { label: 'Manufacturing', count: 1 }]);
  same(sc.North.front, [{ label: 'Retail', count: 2 }, { label: 'Manufacturing', count: 1 }]);
  same(sc.South.front, [{ label: 'Retail', count: 1 }]);
  same(sc.Step2.front, plain(sc.league.front), 'Step 2 = North + South, which here is everyone');
  assert.equal(sc.league.clubs.front, 4);
  assert.equal(sc.North.clubs.front, 3);
  same(sc.North.stand, [{ label: 'Manufacturing', count: 1 }]);
  assert.equal(sc.North.clubs.stand, 1, 'stand count is clubs with any stand sector, not stands');
  same(AGG.sectors.front, plain(sc.league.front), 'the league list stays at the top level for the palette');
});

test('a sponsor named without a sector is counted as unstated, so nobody vanishes', () => {
  const { AGG, clubs } = fixture();
  const row = deltaRow(); row.bsSponsor = 'Nameless Ltd'; row.bsSector = '';
  row.stands.push({ name: 'Sectorless Stand Co', sector: '', income: 100 });
  CB.importRows(AGG, clubs, [row]);
  const sc = AGG.sectors.scopes;
  assert.equal(sc.North.unstated.back, 1);
  assert.equal(sc.North.unstated.front, 0);
  assert.equal(sc.North.unstated.stand, 1);
  assert.equal(sc.South.unstated.back, 0);
  same(sc.North.stand, [{ label: 'Manufacturing', count: 1 }], 'the sectorless stand is not in the mix');
});

test('mount-time fallback: a staff view derives per-scope sector mixes from old-shape data', () => {
  // Data saved before v1.5 has flat league-wide lists and no `scopes`.
  const { AGG, clubs } = fixture();
  CB.recomputeSectors(AGG, clubs);
  const old = { front: AGG.sectors.front, back: AGG.sectors.back, sleeve: AGG.sectors.sleeve, stand: AGG.sectors.stand };
  AGG.sectors = old;
  assert.equal(AGG.sectors.scopes, undefined);
  // mount needs a DOM; the fallback line is the first thing it does, so
  // exercise the same condition it uses.
  const opts = { staff: true };
  if (opts.staff && clubs.length > 1 && !(AGG.sectors && AGG.sectors.scopes)) CB.recomputeSectors(AGG, clubs);
  assert.ok(AGG.sectors.scopes, 'scopes derived in memory');
  same(AGG.sectors.scopes.North.front, [{ label: 'Retail', count: 2 }]);
  same(AGG.sectors.front, plain(old.front), 'the league list is unchanged');
});

test('pasted percentiles are ignored — recompute owns them', () => {
  const { AGG, clubs } = fixture();
  const row = deltaRow(); row.metrics.msTicket.divPct = 1;
  CB.importRows(AGG, clubs, [row]);
  assert.equal(clubs[2].metrics.msTicket.divPct, 83);
});

test('replace:true overwrites a club that already has data', () => {
  const { AGG, clubs } = fixture();
  const row = Object.assign(deltaRow(), { club: 'Alpha' }); row.metrics.msTicket.value = 40;
  const res = CB.importRows(AGG, clubs, [row], { replace: true });
  assert.equal(res.ok, true);
  same(res.replaced, ['Alpha']);
  same(res.added, []);
  assert.equal(clubs[0].metrics.msTicket.value, 40);
  same(AGG.aggregates.msTicket.scopes.North.values, [20, 40]);
});

test('without a roster the club is appended and the list re-sorted by division then name', () => {
  const { AGG, clubs } = fixture();
  delete AGG.roster; clubs.splice(2, 1);
  const res = CB.importRows(AGG, clubs, [Object.assign(deltaRow(), { club: 'Aardvark' })]);
  assert.equal(res.ok, true);
  same(clubs.map(c => c.club), ['Aardvark', 'Alpha', 'Beta', 'Gamma']);
});

test('without a roster an unknown division is still refused', () => {
  const { AGG, clubs } = fixture();
  delete AGG.roster;
  const res = CB.importRows(AGG, clubs, [Object.assign(deltaRow(), { division: 'Midlands' })]);
  assert.equal(res.ok, false);
  assert.match(res.errors[0], /unknown division/);
});
