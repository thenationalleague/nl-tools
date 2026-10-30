/* Fixture Management — the rearrangement date finder (fixtures/_finder.js).
   Every rule tested is one settled in system/fixture-management-plan.md.
   Clubs and fixtures are invented; the calendar is a cut-down copy of
   assets/data/calendar-2026-27.json so a test says which date it means. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { REPO } from './load-canon.mjs';

const ctx = {};
vm.runInNewContext(readFileSync(join(REPO, 'fixtures/_finder.js'), 'utf8'), ctx);
const X = ctx.FixturesFinder;

const CAL = {
  finalMatchday: '2027-04-24',
  noRearrange: [{ date: '2027-03-27', why: 'Easter Saturday' }],
  blockedHours: { from: '2026-08-22', to: '2027-04-24', exempt: ['2026-11-14'] },
  entry: { 'fa-cup': { national: '4Q', north: '2Q' } },
  cups: [
    { comp: 'fa-cup', round: '2Q', date: '2026-09-19', replay: '2026-09-22' },
    { comp: 'fa-cup', round: '4Q', date: '2026-10-17', replay: '2026-10-20' },
    { comp: 'fa-cup', round: 'R1', date: '2026-11-07' },
  ],
};

const A = { name: 'Alpha Town', code: 'ALP' };
const B = { name: 'Beta United', code: 'BET' };
const C = { name: 'Gamma City', code: 'GAM' };
const D = { name: 'Delta Rovers', code: 'DEL' };

let n = 0;
const g = (home, away, date, extra = {}) => ({ key: 'k' + (++n), comp: 'national', home, away, date, ko: date ? '15:00' : null, ...extra });
const fx = (...recs) => Object.fromEntries(recs.map((r) => [r.key, r]));
const postponed = (home, away, was) => g(home, away, null, { state: 'postponed', original: { date: was, ko: '15:00' } });
const run = (game, recs, opts, more = {}) => X.slots(game, { fixtures: fx(game, ...recs), calendar: CAL, rounds: {}, distances: more.distances || { pairs: {} }, today: more.today || '2026-10-28' }, opts);
const on = (res, d) => res.slots.find((s) => s.date === d);

test('slots are Saturdays, Tuesdays and Wednesdays; Mondays and Thursdays behind their switches', () => {
  const game = postponed(A, B, '2026-10-24');
  const res = run(game, []);
  assert.ok(res.slots.length > 0);
  assert.deepEqual([...new Set(res.slots.map((s) => s.day))].sort(), ['Sat', 'Tue', 'Wed']);
  assert.equal(on(res, '2026-10-29'), undefined);
  assert.equal(on(res, '2026-11-02'), undefined);
  const thu = run(game, [], { thursdays: true });
  assert.equal(on(thu, '2026-10-29').day, 'Thu');
  assert.ok(on(thu, '2026-10-29').flags.some((f) => f.text === 'Thursday'));
  const mon = run(game, [], { mondays: true });
  assert.equal(on(mon, '2026-11-02').day, 'Mon');
});

test('a game the day before or after takes the slot out', () => {
  const game = postponed(A, B, '2026-10-24');
  /* Alpha play Tuesday 03/11: Wednesday 04/11 is out, Saturday 07/11 is in. */
  const res = run(game, [g(A, C, '2026-11-03')]);
  assert.equal(on(res, '2026-11-04'), undefined);
  assert.ok(on(res, '2026-11-07'));
});

test('a game in the anchor window takes the slot out; Monday belongs to Tuesday, Sunday to Saturday', () => {
  const game = postponed(A, B, '2026-10-24');
  const res = run(game, [g(A, C, '2026-11-02'), g(D, B, '2026-11-08')]);
  assert.equal(on(res, '2026-11-03'), undefined, 'Monday game blocks the Tuesday');
  assert.equal(on(res, '2026-11-07'), undefined, 'Sunday game blocks the Saturday');
  assert.ok(on(res, '2026-11-10'));
});

test('the last slot is the midweek before the final matchday, and Easter Saturday is never offered', () => {
  const game = postponed(A, B, '2027-03-13');
  const res = run(game, [], { thursdays: true });
  const last = res.slots.map((s) => s.date).sort().pop();
  assert.equal(last, '2027-04-22');
  assert.equal(on(res, '2027-04-24'), undefined);
  assert.equal(on(res, '2027-03-27'), undefined);
  assert.equal(on(run(game, []), '2027-04-20').day, 'Tue');
});

test('the 35-day window runs both ways from the original date and later slots still show', () => {
  const game = postponed(A, B, '2026-10-24');
  const res = run(game, []);
  assert.equal(on(res, '2026-11-28').within35, true);
  assert.equal(on(res, '2026-12-01').within35, false);
  /* Postponed well ahead: a date before the original can bring it forward. */
  const ahead = run(postponed(A, B, '2026-12-19'), []);
  assert.equal(on(ahead, '2026-11-17').within35, true, '32 days before');
  assert.equal(on(ahead, '2026-11-10').within35, false, '39 days before');
  assert.equal(ahead.windowFrom, '2026-11-14');
  assert.equal(ahead.windowTo, '2027-01-23');
  assert.ok(on(res, '2027-02-02'));
  const firstOut = res.slots.findIndex((s) => !s.within35);
  assert.ok(res.slots.slice(firstOut).every((s) => !s.within35), 'within 35 days sorts first');
});

test('cleanest first: a flagged slot sorts after an unflagged one inside the window', () => {
  const game = postponed(A, B, '2026-10-24');
  /* Alpha play Thursday 05/11, so Tuesday 03/11 has two days' rest. */
  const res = run(game, [g(A, C, '2026-11-05')]);
  const s = on(res, '2026-11-03');
  assert.ok(s.flags.some((f) => /within 48h/.test(f.text)));
  assert.ok(res.slots.indexOf(s) > res.slots.indexOf(on(res, '2026-11-10')));
});

test('a club possibly still in the FA Cup has the round flagged; one beaten is not', () => {
  const game = postponed(A, B, '2026-10-24');
  /* Alpha beat in 4Q; Beta through. R1 on 07/11. */
  const ties = [
    g(C, A, '2026-10-17', { comp: 'fa-cup', round: '4Q', result: { h: 2, a: 0 } }),
    g(B, D, '2026-10-18', { comp: 'fa-cup', round: '4Q', result: { h: 1, a: 1, aet: { h: 1, a: 1 }, pens: { h: 5, a: 4 } } }),
  ];
  const s = on(run(game, ties, {}, { today: '2026-10-28' }), '2026-11-07');
  const texts = s.flags.map((f) => f.text);
  assert.ok(texts.some((t) => t === 'BET in FAC R1?'));
  assert.ok(!texts.some((t) => /^ALP in/.test(t)));
});

test('a slot outside the 35 days is flagged first and never clean; one inside is not flagged for it', () => {
  const game = postponed(A, B, '2026-09-12');
  const res = run(game, [], {}, { today: '2026-09-13' });
  const out = res.slots.find((x) => !x.within35);
  assert.ok(out, 'there is a slot outside the window');
  assert.equal(out.flags[0].cat, 'window', 'listed first');
  /* With another flag on the day it still comes first. */
  const busy = on(run(game, [g(C, D, null, { comp: 'fa-cup', round: 'R1' })], {}, { today: '2026-11-01' }), '2026-11-07');
  assert.ok(busy.flags.length > 1);
  assert.equal(busy.flags[0].cat, 'window', 'first, ahead of the cup flag');
  assert.equal(out.flags[0].level, 'amber', 'so never green');
  assert.match(out.flags[0].text, /^\d+ days from the original date$/);
  assert.ok(res.slots.filter((x) => x.within35).every((x) => !x.flags.some((f) => f.cat === 'window')));
});

test('a round drawn without a club means it is out; a round before its division enters means nothing', () => {
  const game = postponed(A, B, '2026-09-12');
  const drawn = [g(C, D, null, { comp: 'fa-cup', round: 'R1' })];
  const r1 = on(run(game, drawn, {}, { today: '2026-11-01' }), '2026-11-07');
  /* 56 days out, so the window flag comes first (v1.7); the cup flag is the point here. */
  assert.deepEqual([...r1.flags.filter((f) => f.cat !== 'window').map((f) => f.text)], ['FAC R1 Saturday, both out']);
  /* National clubs enter at 4Q: the 2Q replay Tuesday is no concern of theirs. */
  const q2 = on(run(game, [], {}, { today: '2026-09-13' }), '2026-09-22');
  assert.ok(!q2.flags.some((f) => /FAC/.test(f.text)));
});

test('a qualifying replay Tuesday is flagged for a club still in', () => {
  const game = postponed(A, B, '2026-10-10');
  const tie = g(A, C, '2026-10-17', { comp: 'fa-cup', round: '4Q' });
  /* Tie unplayed as of today: Alpha might be replaying on Tue 20/10. */
  const s = on(run(game, [tie], {}, { today: '2026-10-12' }), '2026-10-20');
  assert.ok(s.flags.some((f) => f.text === 'ALP in FAC 4Q replay?'));
  const done = { ...tie, result: { h: 2, a: 0 } };
  const after = on(run(game, [done], {}, { today: '2026-10-18' }), '2026-10-20');
  assert.ok(!after.flags.some((f) => /^ALP in/.test(f.text)), 'a decided tie needs no replay');
});

test('Article 48: a worldwide game on a blocked Saturday is flagged, an exempt Saturday and a Tuesday are not', () => {
  const game = postponed(A, B, '2026-10-24');
  game.broadcast = { availability: 'worldwide' };
  const res = run(game, []);
  assert.ok(on(res, '2026-10-31').flags.some((f) => /Blocked hours/.test(f.text)));
  assert.ok(!on(res, '2026-11-14').flags.some((f) => /Blocked hours/.test(f.text)));
  assert.ok(!on(res, '2026-11-03').flags.some((f) => /Blocked hours/.test(f.text)));
  game.broadcast = { availability: 'overseas' };
  assert.ok(!on(run(game, []), '2026-10-31').flags.some((f) => /Blocked hours/.test(f.text)));
});

test('three away in a row is amber with each trip terse; four is red', () => {
  const game = postponed(A, B, '2026-10-24');
  const distances = { pairs: { 'ALP|BET': [186.2, 190], 'GAM|BET': [40, 55], 'DEL|BET': [12, 25] } };
  const three = on(run(game, [g(C, B, '2026-11-14'), g(D, B, '2026-11-21')], {}, { distances }), '2026-11-10');
  const f3 = three.flags.find((f) => /away in a row/.test(f.text));
  assert.equal(f3.level, 'amber');
  assert.equal(f3.text, 'BET 3 away in a row');
  assert.deepEqual(JSON.parse(JSON.stringify(f3.items)), [
    { date: '2026-11-10', text: 'This game (A) · 372 mi round trip' },
    { date: '2026-11-14', text: 'Gamma City (A) · 80 mi round trip' },
    { date: '2026-11-21', text: 'Delta Rovers (A) · 24 mi round trip' }]);
  const four = on(run(game, [g(C, B, '2026-11-14'), g(D, B, '2026-11-21'), g(C, B, '2026-11-28', { comp: 'fa-trophy' })], {}, { distances }), '2026-11-10');
  assert.equal(four.flags.find((f) => /away in a row/.test(f.text)).level, 'red');
});

test('a neutral game neither breaks nor extends a run', () => {
  const game = postponed(A, B, '2026-10-24');
  const res = run(game, [g(A, C, '2026-11-14'), g(C, A, '2026-11-17', { neutral: true }), g(A, D, '2026-11-21')]);
  assert.ok(on(res, '2026-11-10').flags.some((f) => f.text === 'ALP 3 home in a row'));
});

test('another game pencilled into the slot is a soft flag, not a block', () => {
  const game = postponed(A, B, '2026-10-24');
  const other = X.pencil(postponed(A, C, '2026-10-17'), '2026-11-10', '19:45', 1);
  const s = on(run(game, [other]), '2026-11-10');
  assert.ok(s, 'slot still offered');
  assert.ok(s.flags.some((f) => f.text === 'Pencilled ALP v GAM'));
  assert.equal(X.unpencil(other).pencils, undefined);
  /* A record from before the shortlist, with one rec.pencil, still counts. */
  const legacy = { ...postponed(A, D, '2026-10-17'), pencil: { date: '2026-11-17', ko: '19:45', at: 1 } };
  assert.ok(on(run(game, [legacy]), '2026-11-17').flags.some((f) => f.text === 'Pencilled ALP v DEL'));
});

test('the to-do list runs oldest original first with each club\'s backlog', () => {
  const list = X.todo(fx(postponed(A, B, '2026-10-24'), postponed(C, A, '2026-09-12'), g(A, D, '2026-11-01')));
  assert.deepEqual([...list.map((x) => x.original)], ['2026-09-12', '2026-10-24']);
  assert.deepEqual({ ...list[0].backlog }, { home: 0, away: 1 });
});

test('blocked hours: 15:00 overlaps, 12:30 and 17:30 do not, an exempt Saturday never does', () => {
  const cal = { blockedHours: { from: '2026-08-22', to: '2027-04-24', start: '14:45', end: '17:15', exempt: ['2026-11-14'] } };
  assert.equal(X.overlapsBlocked(cal, '2026-10-31', '15:00'), true);
  assert.equal(X.overlapsBlocked(cal, '2026-10-31', '12:30'), false);
  assert.equal(X.overlapsBlocked(cal, '2026-10-31', '17:30'), false);
  assert.equal(X.overlapsBlocked(cal, '2026-10-31', '13:00'), true, '13:00 runs into 14:45');
  assert.equal(X.overlapsBlocked(cal, '2026-11-14', '15:00'), false);
  assert.equal(X.overlapsBlocked(cal, '2026-11-03', '15:00'), false, 'a Tuesday');
});

test('two away games in a row, each a round trip over the limit, are flagged; the limit can move', () => {
  const game = postponed(A, B, '2026-10-24');
  const distances = { pairs: { 'ALP|BET': [150, 170], 'GAM|BET': [120, 140], 'DEL|BET': [40, 50] } };
  const recs = [g(C, B, '2026-11-14'), g(B, D, '2026-11-21')];
  const s = on(run(game, recs, {}, { distances }), '2026-11-10');
  const f = s.flags.find((x) => /long trips/.test(x.text));
  assert.equal(f.text, 'BET 2 long trips in a row');
  assert.deepEqual([...f.items.map((x) => x.date)], ['2026-11-10', '2026-11-14']);
  assert.ok(!on(run(game, recs, { longTrip: 300 }, { distances }), '2026-11-10').flags.some((x) => /long trips/.test(x.text)));
  /* A short trip next door is no long pair. */
  const short = on(run(game, [g(D, B, '2026-11-14')], {}, { distances: { pairs: { 'ALP|BET': [150, 170], 'DEL|BET': [40, 50] } } }), '2026-11-10');
  assert.ok(!short.flags.some((x) => /long trips/.test(x.text)));
});

test('an international window is a soft flag', () => {
  const cal = { ...CAL, internationalWindows: [{ from: '2026-11-09', to: '2026-11-17' }] };
  const game = postponed(A, B, '2026-10-24');
  const res = X.slots(game, { fixtures: fx(game), calendar: cal, rounds: {}, distances: { pairs: {} }, today: '2026-10-28' }, {});
  assert.ok(on(res, '2026-11-10').flags.some((f) => f.level === 'info' && f.text === 'International window'));
  assert.ok(!on(res, '2026-11-07').flags.some((f) => f.text === 'International window'));
});

test('Fridays and Sundays are behind their switches', () => {
  const game = postponed(A, B, '2026-10-24');
  assert.equal(on(run(game, []), '2026-11-06'), undefined);
  assert.equal(on(run(game, [], { fridays: true }), '2026-11-06').day, 'Fri');
  assert.equal(on(run(game, [], { sundays: true }), '2026-11-08').day, 'Sun');
});

test('every flag has a category, and a within-48h flag lists the nearby game with its kick-off', () => {
  const game = postponed(A, B, '2026-10-24');
  const cats = new Set([...X.CATS.map((c) => c.key)]);
  const res = run(game, [g(A, C, '2026-11-05'), g(C, B, '2026-11-14'), g(D, B, '2026-11-21')], { thursdays: true, mondays: true });
  res.slots.forEach((s) => s.flags.forEach((f) => assert.ok(cats.has(f.cat), 'no category: ' + f.text)));
  const near = on(res, '2026-11-03').flags.find((f) => f.cat === 'proximity');
  assert.equal(near.text, 'ALP within 48h');
  assert.deepEqual(JSON.parse(JSON.stringify(near.items)), [{ date: '2026-11-05', text: 'Gamma City (H) · 15:00' }]);
});

test('a cup flag says where the club is: an undecided tie and its date, a won round and the next, or the entry round', () => {
  const game = postponed(A, B, '2026-10-24');
  /* Beta's 4Q tie is drawn for 17 Oct and unplayed; Alpha won 4Q. R1 is 07/11. */
  const ties = [
    g(B, D, '2026-11-01', { comp: 'fa-cup', round: '4Q' }),
    g(A, C, '2026-10-17', { comp: 'fa-cup', round: '4Q', result: { h: 2, a: 1 } }),
  ];
  const s = on(run(game, ties, {}, { today: '2026-10-28' }), '2026-11-07');
  const bet = s.flags.find((f) => f.text === 'BET in FAC R1?');
  assert.deepEqual(JSON.parse(JSON.stringify(bet.items)), [{ date: '2026-11-01', text: '4Q: Delta Rovers (H) · 15:00' }]);
  const alp = s.flags.find((f) => f.text === 'ALP in FAC R1?');
  assert.deepEqual(JSON.parse(JSON.stringify(alp.items)), [
    { date: '2026-10-17', text: 'Won 4Q v Gamma City' },
    { date: '2026-11-07', text: 'Next: R1, tie not drawn' }]);
  /* No tie at all: the round National clubs enter. */
  const none = on(run(game, [], {}, { today: '2026-10-28' }), '2026-11-07').flags.find((f) => f.text === 'ALP in FAC R1?');
  assert.deepEqual(JSON.parse(JSON.stringify(none.items)), [{ date: '2026-10-17', text: 'Enters at 4Q, no tie entered yet' }]);
});

test('a shortlist holds up to three pencils; confirming or clearing one leaves the rest', () => {
  let r = postponed(A, B, '2026-10-24');
  r = X.pencil(r, '2026-11-17', '19:45', 1);
  r = X.pencil(r, '2026-11-10', '19:45', 2);
  r = X.pencil(r, '2026-11-24', '19:45', 3);
  assert.deepEqual([...X.pencilsOf(r).map((p) => p.date)], ['2026-11-10', '2026-11-17', '2026-11-24']);
  assert.equal(X.pencil(r, '2026-12-01', '19:45', 4), null, 'a fourth is refused');
  assert.equal(X.pencil(r, '2026-11-10', '20:00', 5).pencils.length, 3, 're-timing an existing date is not a fourth');
  assert.deepEqual([...X.pencilsOf(X.unpencil(r, '2026-11-17')).map((p) => p.date)], ['2026-11-10', '2026-11-24']);
  assert.equal(X.unpencil(r).pencils, undefined);
});

test('a ruled-out date is never offered: for this game, or for a club that cannot host or travel', () => {
  const game = postponed(A, B, '2026-10-24');
  const one = X.ruleOut(X.pencil(game, '2026-11-10', '19:45', 1), '2026-11-10', 'Both clubs said no', 2);
  assert.equal(on(run(one, []), '2026-11-10'), undefined);
  assert.equal(one.pencils, undefined, 'ruling a pencilled date out drops the pencil');
  assert.ok(on(run(game, []), '2026-11-10'), 'another game is untouched');
  const ctx = (unavailable) => X.slots(game, { fixtures: fx(game), calendar: CAL, rounds: {}, distances: { pairs: {} }, today: '2026-10-28', unavailable }, {});
  /* Alpha cannot host on 17 Nov (a ground share): Alpha are at home here. */
  assert.equal(on(ctx([{ club: 'Alpha Town', side: 'home', date: '2026-11-17', reason: 'Ground share' }]), '2026-11-17'), undefined);
  /* Alpha cannot travel on 17 Nov: irrelevant, they are at home. */
  assert.ok(on(ctx([{ club: 'Alpha Town', side: 'away', date: '2026-11-17', reason: 'No coach' }]), '2026-11-17'));
  /* Beta cannot travel on 17 Nov: Beta are away here. */
  assert.equal(on(ctx([{ club: 'Beta United', side: 'away', date: '2026-11-17', reason: 'No coach' }]), '2026-11-17'), undefined);
  assert.equal(X.offLimits(game, [{ club: 'Beta United', side: 'any', date: '2026-11-17', reason: 'x' }], '2026-11-17').club, 'Beta United');
});

test('a fixture being moved counts its 35 days from the anchor it is given', () => {
  const game = g(A, B, '2027-01-16');
  const res = run(game, [], { anchor: '2027-01-16' });
  assert.equal(res.original, '2027-01-16');
  assert.equal(on(res, '2026-12-15').within35, true);
  assert.equal(on(res, '2026-11-24').within35, false);
  assert.equal(on(res, '2027-01-16'), undefined, 'its own date is never offered');
});
