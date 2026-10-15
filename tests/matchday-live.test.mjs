/* Matchday Live — the pure server logic in functions/matchday-live-core.js.

   What is pinned here is the part that decides things nobody watches happen:
   who a link token lets in, what a match looks like to the capture page, which
   event a "just happened" clip is filed under once the feed catches up, and
   which videos the nightly sweep deletes. The last one is the reason this file
   exists at all — a retention bug deletes someone's footage, silently, at 3am.

   The event fixtures follow the record shape nls/events.js writes (goalEvents,
   bookingEvents, contextOf) — read from that file, not remembered. The RTDB and
   Storage rules are tested against the emulator separately; see
   tests/emulator/README.md. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const C = require('../functions/matchday-live-core.js');

const DAY = 86400000;

/* ---------------------------------------------------------------- tokens */

test('token: stored form is a sha256 digest, never the token', () => {
  const t = 'abcdefghijklmnopqrstuvwxyzABCDEF';
  const h = C.hashToken(t);
  assert.equal(h, crypto.createHash('sha256').update(t).digest('hex'));
  assert.notEqual(h, t);
  assert.equal(h.length, 64);
  assert.equal(C.genOf(h), h.slice(0, 16));
});

test('token: only 32-character base64url is a token', () => {
  assert.ok(C.validToken('A'.repeat(32)));
  assert.ok(C.validToken('a-b_' + 'c'.repeat(28)));
  for (const bad of ['', 'A'.repeat(31), 'A'.repeat(33), 'A'.repeat(31) + '/', 'A'.repeat(31) + '.', null, 42]) {
    assert.equal(C.validToken(bad), false, String(bad));
  }
});

test('contributor: fail closed unless active === true and a full hash is stored', () => {
  const sec = { tokenHash: 'a'.repeat(64) };
  assert.equal(C.contributorUsable({ active: true }, sec), true);
  assert.equal(C.contributorUsable({ active: 'true' }, sec), false);
  assert.equal(C.contributorUsable({ active: false }, sec), false);
  assert.equal(C.contributorUsable({}, sec), false);
  assert.equal(C.contributorUsable({ active: true }, null), false);
  assert.equal(C.contributorUsable({ active: true }, { tokenHash: '' }), false);
  assert.equal(C.contributorUsable(null, sec), false);
});

/* ------------------------------------------------------------ the mirror */

const ROW = (id, comp, extra) => Object.assign({
  id, compKey: comp, ko: '2026-10-17T14:00:00.000Z', period: 'secondhalf',
  live: true, finished: false, postponed: false, minute: 63, formattedMinute: "63'",
  home: { id: 't1', name: 'Home FC', score: 1 }, away: { id: 't2', name: 'Away Town', score: 0 },
  updatedAt: 1000,
}, extra);

const GOAL = (matchID, teamID, idx, minute, extra) => Object.assign({
  matchID, type: 'goal', teamID, playerName: 'A Striker', minute, formattedMinute: minute + "'",
  isPenalty: false, isOwnGoal: false, detectedAt: 5000 + minute,
}, extra, { eventKey: matchID + '_' + teamID + '_goal_' + idx });

test('mirror: three divisions in, Cup out', () => {
  const md = C.buildMatchday({
    nl: { m1: ROW('m1', 'nl') }, north: { m2: ROW('m2', 'north') },
    south: { m3: ROW('m3', 'south') }, cup: { m4: ROW('m4', 'cup') },
  }, {});
  assert.deepEqual(Object.keys(md).sort(), ['m1', 'm2', 'm3']);
  assert.equal(md.m2.comp, 'north');
  assert.equal(md.m1.home.score, 1);
  assert.equal(md.m1.fm, "63'");
});

test('mirror: goals and cards kept, subs and lineups dropped, retractions honoured', () => {
  const g = GOAL('m1', 't1', 0, 62);
  const pen = GOAL('m1', 't2', 0, 70, { isPenalty: true });
  const ret = Object.assign(GOAL('m1', 't1', 1, 75), { retracted: true });
  const events = {
    [g.eventKey]: g, [pen.eventKey]: pen, [ret.eventKey]: ret,
    m1_t1_booking_0: { matchID: 'm1', type: 'booking', teamID: 't1', minute: 30, card: 'Yellow', cardType: 'YellowCard', playerName: 'A' },
    m1_t2_booking_0: { matchID: 'm1', type: 'booking', teamID: 't2', minute: 80, card: 'Yellow', cardType: 'SecondYellow', playerName: 'B' },
    m1_t1_substitution_0: { matchID: 'm1', type: 'substitution', teamID: 't1', minute: 60 },
    m1_t1_lineup_0: { matchID: 'm1', type: 'lineup', teamID: 't1', minute: null },
    m9_t1_goal_0: GOAL('m9', 't1', 0, 10),
  };
  const ev = C.buildMatchday({ nl: { m1: ROW('m1', 'nl') } }, events).m1.events;
  assert.deepEqual(Object.keys(ev).sort(), [g.eventKey, pen.eventKey, 'm1_t1_booking_0', 'm1_t2_booking_0'].sort());
  assert.equal(ev[g.eventKey].side, 'home');
  assert.equal(ev[pen.eventKey].side, 'away');
  assert.equal(ev[pen.eventKey].pen, true);
  assert.equal(ev.m1_t1_booking_0.kind, 'yellow');
  assert.equal(ev.m1_t2_booking_0.kind, 'red', 'a second yellow is a sending-off');
});

test('mirror: hash ignores updatedAt and moves when the score does', () => {
  const a = C.buildMatchday({ nl: { m1: ROW('m1', 'nl') } }, {});
  const b = C.buildMatchday({ nl: { m1: ROW('m1', 'nl', { updatedAt: 99999 }) } }, {});
  const c = C.buildMatchday({ nl: { m1: ROW('m1', 'nl', { home: { id: 't1', name: 'Home FC', score: 2 } }) } }, {});
  assert.equal(C.contentHash(a), C.contentHash(b));
  assert.notEqual(C.contentHash(a), C.contentHash(c));
});

/* --------------------------------------------------------- auto-match */

test('auto-match: event within two minutes is attached, outside is not', () => {
  const m = { events: { e1: { kind: 'goal', minute: 62, at: 1 } } };
  assert.equal(C.autoMatch({ minute: 63 }, m), 'e1');
  assert.equal(C.autoMatch({ minute: 64 }, m), 'e1');
  assert.equal(C.autoMatch({ minute: 65 }, m), null);
  assert.equal(C.autoMatch({ minute: 60 }, m), 'e1');
  assert.equal(C.autoMatch({ minute: 59 }, m), null);
});

test('auto-match: goal beats a card, then nearest, then latest seen', () => {
  const m = { events: {
    y: { kind: 'yellow', minute: 63, at: 9 },
    g: { kind: 'goal', minute: 61, at: 1 },
  } };
  assert.equal(C.autoMatch({ minute: 63 }, m), 'g');
  const two = { events: { a: { kind: 'goal', minute: 61, at: 1 }, b: { kind: 'goal', minute: 62, at: 1 } } };
  assert.equal(C.autoMatch({ minute: 63 }, two), 'b');
  const tie = { events: { a: { kind: 'goal', minute: 62, at: 1 }, b: { kind: 'goal', minute: 62, at: 7 } } };
  assert.equal(C.autoMatch({ minute: 63 }, tie), 'b');
});

test('auto-match: no minute or no match record attaches nothing', () => {
  assert.equal(C.autoMatch({}, { events: { e: { kind: 'goal', minute: 1 } } }), null);
  assert.equal(C.autoMatch({ minute: 1 }, null), null);
  assert.equal(C.autoMatch({ minute: 1 }, { events: {} }), null);
});

/* ---------------------------------------------------------- retention */

test('retention: rejected video goes at seven days after rejection, not before', () => {
  const now = 100 * DAY;
  const plan = C.retentionPlan({ '2026-10-01': {
    old: { status: 'rejected', reviewedAt: now - 7 * DAY, storagePath: 'p/old.webm' },
    young: { status: 'rejected', reviewedAt: now - 7 * DAY + 1, storagePath: 'p/young.webm' },
    done: { status: 'rejected', reviewedAt: now - 30 * DAY, storagePath: 'p/done.webm', purgedAt: 1 },
  } }, now);
  assert.deepEqual(plan, [{ ymd: '2026-10-01', clipId: 'old', action: 'purge', storagePath: 'p/old.webm' }]);
});

test('retention: approved and unreviewed clips are never touched', () => {
  const now = 400 * DAY;
  const plan = C.retentionPlan({ '2026-01-01': {
    a: { status: 'approved', reviewedAt: 1, createdAt: 1, storagePath: 'p/a' },
    n: { status: 'new', createdAt: 1, storagePath: 'p/n' },
    r: { status: 'rejected', storagePath: 'p/r' },   // no reviewedAt — cannot date it, keep it
  } }, now);
  assert.deepEqual(plan, []);
});

test('retention: an upload still unfinished a day later is dropped', () => {
  const now = 10 * DAY;
  const plan = C.retentionPlan({ d: {
    stale: { status: 'uploading', createdAt: now - DAY, storagePath: 'p/s' },
    fresh: { status: 'uploading', createdAt: now - DAY + 1, storagePath: 'p/f' },
  } }, now);
  assert.deepEqual(plan.map((p) => p.clipId + ':' + p.action), ['stale:drop']);
});

test('retention: the sweep looks back sixty UTC days and never at today', () => {
  const now = Date.parse('2026-10-15T03:40:00Z');
  const days = C.retentionDays(now, 60);
  assert.equal(days.length, 60);
  assert.equal(days[0], '2026-10-14');
  assert.equal(days[59], '2026-08-16');
  assert.ok(days.every(C.validYmd));
});

/* ------------------------------------------------- late filing + test links */

test('mirror: every match carries koMs for the late-filing rule', () => {
  const md = C.buildMatchday({ nl: { m1: ROW('m1', 'nl') } }, {});
  assert.equal(md.m1.koMs, Date.parse('2026-10-17T14:00:00.000Z'));
  const bad = C.buildMatchday({ nl: { m1: ROW('m1', 'nl', { ko: 'not a date' }) } }, {});
  assert.equal(bad.m1.koMs, null);
});

test('late filing: open until 26 hours after kick-off, then shut — unless a test link', () => {
  const m = { koMs: 1000 };
  assert.equal(C.openForClips(m, 1000 + C.LATE_WINDOW_MS - 1, false), true);
  assert.equal(C.openForClips(m, 1000 + C.LATE_WINDOW_MS, false), false);
  assert.equal(C.openForClips(m, 1000 + 30 * DAY, true), true);
  assert.equal(C.openForClips({}, 0, false), false, 'no kick-off time, no clip');
  assert.equal(C.LATE_WINDOW_MS, 93600000, 'the rules hard-code 93600000 — change both together');
});

test('backfill: the last seven UTC days, minus the ones already done', () => {
  const now = Date.parse('2026-10-15T20:00:00Z');
  assert.deepEqual(C.backfillDue(now, {}), ['2026-10-14', '2026-10-13', '2026-10-12', '2026-10-11', '2026-10-10', '2026-10-09', '2026-10-08']);
  assert.deepEqual(C.backfillDue(now, { '2026-10-14': true, '2026-10-08': true }).length, 5);
});
