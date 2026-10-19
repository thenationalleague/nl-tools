/* Save of the Month — unit tests for the pure logic in
   save-of-the-month/_shared.js (loaded in a VM sandbox, same pattern as
   tests/commercial-compliance.test.mjs). Covers the pieces that mislead a
   club without anyone noticing:

     · keeperAt      — the name pre-filled into a nomination. Wrong here means
                       a club nominates the wrong player's save.
     · leagueMatches — which matches a club may pick. Cups must stay out.
     · isOpen        — the screen's answer to "can I nominate"; the rules
                       make the same test with the server clock.

   The NLS shapes below are trimmed from live responses fetched 19/10/2026
   (matches list ?teamID=…&from=…&to=…, and /matches/<id>), not written from
   memory. Player names are placeholders; IDs and structure are real.
   Worked example: g2660201, Worthing 5-0 Solihull Moors (t1493),
   a half-time keeper change logged as eventTime 45, eventPeriod "2". */

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
vm.runInContext(readFileSync(join(REPO, 'save-of-the-month/_shared.js'), 'utf8'), sandbox,
  { filename: 'save-of-the-month/_shared.js' });

const SOTM = sandbox.SOTM;

/* ── fixtures (live shapes, trimmed) ──────────────────────────────────── */

const p = (id, first, last, pos, subPos) => ({
  playerID: id, playerPosition: pos, playerSubPosition: subPos ?? null,
  playerName: { knownName: null, customKnownName: null, firstName: first, lastName: last },
});

/* g2660201, Solihull Moors. The stale subOffPlayer object is kept, with the
   wrong position it really carries, so a resolver reading it would fail. */
function solihull() {
  return {
    teamID: 't1493',
    players: {
      Start: [
        p('p489806', 'Alex', 'Starter', 'Goalkeeper'),
        p('p100001', 'Out', 'Field', 'Defender'),
      ],
      Sub: [
        p('p628624', 'Sam', 'Bench', 'Substitute', 'Goalkeeper'),
        p('p100002', 'Bench', 'Mid', 'Substitute', 'Midfielder'),
      ],
    },
    events: {
      subs: [
        { eventTime: 45, eventPeriod: '2', formattedEventTime: "45'",
          substitutionEvents: { subOffID: 'p489806', subOnID: 'p628624', reason: 'Tactical',
            subOffPlayer: { playerPosition: 'Midfielder', teamID: 't295' } } },
        { eventTime: 70, eventPeriod: '2',
          substitutionEvents: { subOffID: 'p100001', subOnID: 'p100002' } },
      ],
    },
  };
}

/* ── keeperAt ─────────────────────────────────────────────────────────── */

test('keeperAt: starting keeper before a half-time change', () => {
  assert.equal(SOTM.keeperAt(solihull(), 30).name, 'Alex Starter');
});

test('keeperAt: a save in the 45th minute is the first-half keeper’s', () => {
  /* The change is logged at 45 in period "2" — it happened at the break. */
  assert.equal(SOTM.keeperAt(solihull(), 45).name, 'Alex Starter');
});

test('keeperAt: the replacement after the change', () => {
  const k = SOTM.keeperAt(solihull(), 60);
  assert.equal(k.name, 'Sam Bench');
  assert.equal(k.id, 'p628624');
});

test('keeperAt: an in-play change takes effect after its minute', () => {
  /* Shape of g2660112, Hartlepool: keeper off at 32', period "1". */
  const t = solihull();
  t.events.subs[0] = { eventTime: 32, eventPeriod: '1',
    substitutionEvents: { subOffID: 'p489806', subOnID: 'p628624' } };
  assert.equal(SOTM.keeperAt(t, 32).name, 'Alex Starter');
  assert.equal(SOTM.keeperAt(t, 33).name, 'Sam Bench');
});

test('keeperAt: an outfield substitution leaves the keeper alone', () => {
  assert.equal(SOTM.keeperAt(solihull(), 80).name, 'Sam Bench');
  const t = solihull();
  t.events.subs = [t.events.subs[1]];
  assert.equal(SOTM.keeperAt(t, 80).name, 'Alex Starter');
});

test('keeperAt: subs out of order are applied in minute order', () => {
  const t = solihull();
  t.events.subs.reverse();
  assert.equal(SOTM.keeperAt(t, 60).name, 'Sam Bench');
});

test('keeperAt: no goalkeeper in the XI is null, not a guess', () => {
  /* g2661291, Southport, 17/10/2026: the XI lists no Goalkeeper. */
  const t = solihull();
  t.players.Start[0].playerPosition = 'Defender';
  assert.equal(SOTM.keeperAt(t, 30), null);
});

test('keeperAt: two goalkeepers in the XI is null', () => {
  /* g2661198, Spennymoor, 29/08/2026: 12 starters, 2 Goalkeepers. */
  const t = solihull();
  t.players.Start.push(p('p100003', 'Second', 'Keeper', 'Goalkeeper'));
  assert.equal(SOTM.keeperAt(t, 30), null);
});

test('keeperAt: an empty lineup is null', () => {
  assert.equal(SOTM.keeperAt({ teamID: 't1', players: { Start: [], Sub: [] }, events: { subs: [] } }, 10), null);
  assert.equal(SOTM.keeperAt(null, 10), null);
});

test('keeperAt: a known name wins over first + last', () => {
  const t = solihull();
  t.players.Start[0].playerName.knownName = 'Ally';
  assert.equal(SOTM.keeperAt(t, 10).name, 'Ally');
});

test('squadNames: everyone in the match squad, once each, sorted', () => {
  const names = SOTM.squadNames(solihull());
  assert.deepEqual(Array.from(names), ['Alex Starter', 'Bench Mid', 'Out Field', 'Sam Bench']);
});

/* ── leagueMatches ────────────────────────────────────────────────────── */

const row = (id, comp, period, date, hs, as) => ({
  id, attributes: {
    competitionID: comp, matchPeriod: period, kickOffDateUTC: date + ' 14:00:00',
    homeTeam: { teamID: 't523', name: 'Worthing', score: hs },
    awayTeam: { teamID: 't1493', name: 'Solihull Moors', score: as },
  },
});

test('leagueMatches: league only — the NL Cup (1275) stays out', () => {
  const out = SOTM.leagueMatches([
    row('g1', 89, 'FullTime', '2026-10-10', 5, 0),
    row('g2', 1275, 'FullTime', '2026-10-14', 1, 1),
    row('g3', 373, 'FullTime', '2026-10-03', 0, 2),
    row('g4', 372, 'FullTime', '2026-10-01', 1, 0),
  ]);
  assert.deepEqual(Array.from(out.map((m) => m.id)), ['g4', 'g3', 'g1']);
});

test('leagueMatches: unplayed and postponed matches stay out', () => {
  const out = SOTM.leagueMatches([
    row('g1', 89, 'PreMatch', '2026-10-25', null, null),
    row('g2', 89, 'Postponed', '2026-10-18', null, null),
    row('g3', 89, 'FullTime', '2026-10-10', 5, 0),
  ]);
  assert.deepEqual(Array.from(out.map((m) => m.id)), ['g3']);
});

test('leagueMatches: label and date', () => {
  const [m] = SOTM.leagueMatches([row('g2660201', 89, 'FullTime', '2026-10-10', 5, 0)]);
  assert.equal(m.label, 'Worthing 5–0 Solihull Moors');
  assert.equal(m.date, '2026-10-10');
});

test('monthRange: whole UTC month, including a short February', () => {
  assert.deepEqual({ ...SOTM.monthRange('2026-09') }, { from: '2026-09-01 00:00:00Z', to: '2026-09-30 23:59:59Z' });
  assert.equal(SOTM.monthRange('2027-02').to, '2027-02-28 23:59:59Z');
});

/* ── months and the open window ───────────────────────────────────────── */

test('isOpen: needs a month; a passed closing date closes it', () => {
  const now = Date.UTC(2026, 9, 19);
  assert.equal(SOTM.isOpen(null, now), false);
  assert.equal(SOTM.isOpen({ month: 'bad' }, now), false);
  assert.equal(SOTM.isOpen({ month: '2026-09' }, now), true);
  assert.equal(SOTM.isOpen({ month: '2026-09', closesAt: now + 1 }, now), true);
  assert.equal(SOTM.isOpen({ month: '2026-09', closesAt: now - 1 }, now), false);
});

test('endOfDay: the closing date includes the whole day', () => {
  const t = SOTM.endOfDay('2026-11-07');
  const d = new Date(t);
  assert.equal(SOTM.ymd(d), '2026-11-07');
  assert.equal(SOTM.ymd(new Date(t + 1)), '2026-11-08');
});

test('freeSlot: first gap, null at five', () => {
  assert.equal(SOTM.freeSlot({}), 's1');
  assert.equal(SOTM.freeSlot({ s1: {}, s3: {} }), 's2');
  assert.equal(SOTM.freeSlot({ s1: {}, s2: {}, s3: {}, s4: {}, s5: {} }), null);
});

test('clipType: trusts a video type, falls back to the extension, refuses the rest', () => {
  assert.equal(SOTM.clipType('a.mp4', 'video/mp4'), 'video/mp4');
  assert.equal(SOTM.clipType('IMG_0001.MOV', ''), 'video/quicktime');
  assert.equal(SOTM.clipType('photo.jpg', 'image/jpeg'), null);
  assert.equal(SOTM.clipType('notes', ''), null);
});

test('flatten: one row per nomination, with its shortlist mark', () => {
  const rows = SOTM.flatten({ ALD: { s1: { minute: 10 }, s2: { minute: 20 } } }, { ALD: { s2: true } });
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.slot === 's2').short, true);
  assert.equal(rows.find((r) => r.slot === 's1').short, false);
});
