/**
 * nls-anchors.test.mjs — kick-off as an event (method note v18.0, 19/08/2026).
 *
 * NLS never emits kick-off, so nls/anchors.js synthesises it: a low-confidence
 * anchor on the list flip, corrected backwards by the wall-clock timestamps
 * events carry. Everything here is pure — the clock is always an argument —
 * which is how a 14:59:47 flip, a poller gap and a 90'+4 booking can all be
 * exercised on a Tuesday morning.
 *
 * The scenario running through these tests: listed KO 15:00:00, true kick-off
 * 15:01:41 or earlier, list flip observed 15:04:30 — the ~3-minute gap being
 * exactly the ingest lag the method exists to measure.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const A = require('../functions/nls/anchors.js');
const T = require('../functions/nls/transform.js');
const E = require('../functions/nls/events.js');

const MIN = 60 * 1000;
const at = (s) => Date.parse('2026-08-08T' + s + 'Z');

const FLIP = at('15:04:30');           // poll that saw the list reach FirstHalf

// ---------------------------------------------------------------------------
// Arrival detection — list only, and Postponed can never anchor
// ---------------------------------------------------------------------------

test('the flip to FirstHalf is an arrival; sitting in it is not', () => {
  assert.equal(A.arrivalSlotOf('firsthalf', 'prematch'), '1H');
  assert.equal(A.arrivalSlotOf('firsthalf', null), '1H', 'a cold start mid-half still anchors');
  assert.equal(A.arrivalSlotOf('firsthalf', 'firsthalf'), null, 'no re-anchor per poll');
});

test('SecondHalf anchors on ARRIVAL, not on the HalfTime pair — matches skip HalfTime', () => {
  assert.equal(A.arrivalSlotOf('secondhalf', 'halftime'), '2H');
  assert.equal(A.arrivalSlotOf('secondhalf', 'firsthalf'), '2H', 'HalfTime never appeared on the list');
  assert.equal(A.arrivalSlotOf('secondhalf', 'secondhalf'), null);
});

test('no other period is an arrival — Postponed never anchors', () => {
  ['prematch', 'halftime', 'fulltime', 'postmatch', 'postponed', 'abandoned',
    'extratime', 'penalties'].forEach((p) => {
    assert.equal(A.arrivalSlotOf(p, 'prematch'), null, p + ' must not anchor');
  });
});

// ---------------------------------------------------------------------------
// The synthetic event
// ---------------------------------------------------------------------------

test('the list flip writes the low-confidence anchor', () => {
  const { record, changed } = A.applyListArrival(null, FLIP, true);
  assert.equal(changed, true);
  assert.equal(record.anchorUTC, '2026-08-08T15:04:30.000Z');
  assert.equal(record.source, 'list-flip');
  assert.equal(record.confidence, 'low');
  assert.deepEqual(record.revisions, []);
  assert.equal(record.listFlipUTC, '2026-08-08T15:04:30.000Z');
});

test('a flip before the listed hour is legitimate and accepted', () => {
  // One was observed at 14:59:47 — nothing gates the anchor on the fixture's
  // kick-off time, so the module never even sees it.
  const early = at('14:59:47');
  const { record } = A.applyListArrival(null, early, true);
  assert.equal(record.anchorUTC, '2026-08-08T14:59:47.000Z');
});

test('an unwitnessed sighting anchors but never claims a flip', () => {
  // Cold start mid-half: the anchor is the best list-only estimate, but the
  // lag exhibit must not be fed a flip nobody saw.
  const { record } = A.applyListArrival(null, FLIP, false);
  assert.equal(record.source, 'list-flip');
  assert.equal(record.listFlipUTC, undefined);
});

test('an existing anchor is never overwritten by the list', () => {
  const first = A.applyListArrival(null, FLIP, true).record;
  const again = A.applyListArrival(first, FLIP + 5 * MIN, true);
  assert.equal(again.changed, false);
  assert.equal(again.record.anchorUTC, '2026-08-08T15:04:30.000Z');
});

// ---------------------------------------------------------------------------
// Events as kick-off measurements
// ---------------------------------------------------------------------------

test('a first-half event implies the latest-possible kick-off', () => {
  // Minute 3 = between 2 and 3 elapsed, so KO is at latest ts − 2min.
  const m = A.impliedStartOf({ tsUTC: '2026-08-08T15:03:41Z', minute: 3, period: 'FirstHalf' });
  assert.equal(m.slot, '1H');
  assert.equal(m.impliedStart, at('15:01:41'));
});

test('first-half stoppage stays on the first-half offset — eventPeriod decides, never the minute', () => {
  // 45'+2 arrives as eventMinute 47 with eventPeriod FirstHalf. Switching the
  // offset on minute > 45 would compute garbage; the formula already handles it.
  const m = A.impliedStartOf({ tsUTC: '2026-08-08T15:47:30Z', minute: 47, period: 'FirstHalf' });
  assert.equal(m.slot, '1H');
  assert.equal(m.impliedStart, at('15:47:30') - 46 * MIN);
});

test('a second-half event measures the second-half anchor with the 45-minute offset', () => {
  // Minute 46 is the first minute after the restart: implied restart = ts.
  const kickIn = A.impliedStartOf({ tsUTC: '2026-08-08T16:06:10Z', minute: 46, period: 'SecondHalf' });
  assert.equal(kickIn.slot, '2H');
  assert.equal(kickIn.impliedStart, at('16:06:10'));

  const mid = A.impliedStartOf({ tsUTC: '2026-08-08T16:27:00Z', minute: 67, period: 'SecondHalf' });
  assert.equal(mid.impliedStart, at('16:27:00') - 21 * MIN);

  // 90'+4 = eventMinute 94, still SecondHalf.
  const stoppage = A.impliedStartOf({ tsUTC: '2026-08-08T17:03:00Z', minute: 94, period: 'SecondHalf' });
  assert.equal(stoppage.slot, '2H');
  assert.equal(stoppage.impliedStart, at('17:03:00') - 48 * MIN);
});

test('eventPeriod also arrives as "1" / "2" and resolves the same way', () => {
  assert.equal(A.impliedStartOf({ tsUTC: '2026-08-08T15:03:41Z', minute: 3, period: '1' }).slot, '1H');
  assert.equal(A.impliedStartOf({ tsUTC: '2026-08-08T16:27:00Z', minute: 67, period: '2' }).slot, '2H');
});

test('what cannot be a measurement contributes none', () => {
  // Shootout entries carry null period and null minute; extra time is outside
  // the model; an entry without a timestamp measures nothing; and a "44th
  // minute" tagged SecondHalf implies a restart in the future — a data slip.
  assert.equal(A.impliedStartOf({ tsUTC: '2026-08-08T17:40:00Z', minute: null, period: null }), null);
  assert.equal(A.impliedStartOf({ tsUTC: '2026-08-08T17:40:00Z', minute: 122, period: 'ExtraTimeFirstHalf' }), null);
  assert.equal(A.impliedStartOf({ tsUTC: null, minute: 3, period: 'FirstHalf' }), null);
  assert.equal(A.impliedStartOf({ tsUTC: '2026-08-08T16:06:10Z', minute: 44, period: '2' }), null);
});

test('measureDetail keeps the earliest implied start per period — the tightest bound', () => {
  const detail = {
    goals: [
      { tsUTC: '2026-08-08T15:03:41Z', minute: 3, period: 'FirstHalf' },
      { tsUTC: '2026-08-08T16:27:00Z', minute: 67, period: 'SecondHalf' },
    ],
    bookings: [
      // ts − 11min = 15:01:30 — earlier than the goal's 15:01:41, so it wins.
      { tsUTC: '2026-08-08T15:12:30Z', minute: 12, period: 'FirstHalf' },
    ],
    subs: [
      { tsUTC: null, minute: 60, period: 'SecondHalf' },   // unmeasurable, ignored
    ],
  };
  const m = A.measureDetail(detail);
  assert.equal(m['1H'], at('15:01:30'));
  assert.equal(m['2H'], at('16:27:00') - 21 * MIN);
});

// ---------------------------------------------------------------------------
// Correction — backwards only, and the lag kept as the exhibit
// ---------------------------------------------------------------------------

test('the first event re-anchors a list-flip and keeps the ingest lag', () => {
  const flip = A.applyListArrival(null, FLIP, true).record;
  const { record, changed } = A.applyMeasurement(flip, at('15:01:41'), at('15:05:10'));
  assert.equal(changed, true);
  assert.equal(record.anchorUTC, '2026-08-08T15:01:41.000Z');
  assert.equal(record.source, 'event-derived');
  assert.equal(record.confidence, 'high');
  assert.equal(record.revisions.length, 1);
  assert.equal(record.revisions[0].anchorUTC, '2026-08-08T15:04:30.000Z');
  assert.equal(record.revisions[0].source, 'list-flip');
  assert.equal(record.revisions[0].revisedAt, '2026-08-08T15:05:10.000Z');
  // 15:04:30 − 15:01:41 — the feed's kick-off ingest lag, the UZ exhibit.
  assert.equal(record.ingestLagMs, 169 * 1000);
});

test('inside 60 seconds is noise, not a revision', () => {
  const flip = A.applyListArrival(null, FLIP, true).record;
  const within = A.applyMeasurement(flip, FLIP - 59 * 1000, FLIP);
  assert.equal(within.changed, false);
  const exactly = A.applyMeasurement(flip, FLIP - 60 * 1000, FLIP);
  assert.equal(exactly.changed, false, 'the spec says MORE than 60s');
  const beyond = A.applyMeasurement(flip, FLIP - 61 * 1000, FLIP);
  assert.equal(beyond.changed, true);
});

test('later events only tighten, never loosen — an anchor never moves forwards', () => {
  const flip = A.applyListArrival(null, FLIP, true).record;
  const first = A.applyMeasurement(flip, at('15:01:41'), at('15:05:10')).record;

  // A later "correction" that would delay kick-off is discarded outright.
  const loosen = A.applyMeasurement(first, at('15:02:50'), at('15:20:00'));
  assert.equal(loosen.changed, false);
  assert.equal(loosen.record.anchorUTC, '2026-08-08T15:01:41.000Z');

  // An earlier one tightens, stacks the revision and re-measures the lag.
  const tighter = A.applyMeasurement(first, at('15:00:30'), at('15:22:00')).record;
  assert.equal(tighter.anchorUTC, '2026-08-08T15:00:30.000Z');
  assert.equal(tighter.revisions.length, 2);
  assert.equal(tighter.ingestLagMs, 240 * 1000);
});

test('a poller gap means the first event creates the anchor', () => {
  const { record, changed } = A.applyMeasurement(null, at('15:01:41'), at('15:05:10'));
  assert.equal(changed, true);
  assert.equal(record.source, 'event-derived');
  assert.equal(record.confidence, 'high');
  assert.equal(record.ingestLagMs, undefined, 'no flip was seen, so there is no lag to claim');
});

test('a flip arriving after an event-derived anchor contributes only the lag', () => {
  const fromEvent = A.applyMeasurement(null, at('15:01:41'), at('15:02:30')).record;
  const { record, changed } = A.applyListArrival(fromEvent, FLIP, true);
  assert.equal(changed, true);
  assert.equal(record.anchorUTC, '2026-08-08T15:01:41.000Z', 'lower-confidence, later — never the anchor');
  assert.equal(record.listFlipUTC, '2026-08-08T15:04:30.000Z');
  assert.equal(record.ingestLagMs, 169 * 1000);

  const again = A.applyListArrival(record, FLIP + MIN, true);
  assert.equal(again.changed, false, 'the flip is stamped once');
});

test('a record read back from RTDB has no revisions field — RTDB drops empty arrays', () => {
  const stored = { anchorUTC: '2026-08-08T15:04:30.000Z', source: 'list-flip', confidence: 'low' };
  const { record } = A.applyMeasurement(stored, at('15:01:41'), at('15:05:10'));
  assert.equal(record.revisions.length, 1);
});

// ---------------------------------------------------------------------------
// The derived clock — floors to minutes, capped, frozen at the whistle
// ---------------------------------------------------------------------------

const ANCHORS = {
  '1H': { anchorUTC: '2026-08-08T15:01:41.000Z', source: 'event-derived', confidence: 'high' },
  '2H': { anchorUTC: '2026-08-08T16:06:10.000Z', source: 'list-flip', confidence: 'low' },
};
const A1 = at('15:01:41');
const A2 = at('16:06:10');

test('the first-half clock is elapsed since the anchor, floored', () => {
  assert.equal(A.clockOf(ANCHORS, 'firsthalf', A1 + 30 * 1000).formattedMinute, "0'");
  assert.equal(A.clockOf(ANCHORS, 'firsthalf', A1 + 44 * MIN + 30 * 1000).formattedMinute, "44'");
  assert.equal(A.clockOf(ANCHORS, 'firsthalf', A1 + 45 * MIN).formattedMinute, "45'");
});

test('the clock never counts through its cap — stoppage reads 45\'+n', () => {
  const c = A.clockOf(ANCHORS, 'firsthalf', A1 + 46 * MIN + 10 * 1000);
  assert.equal(c.formattedMinute, "45'+1");
  assert.equal(A.clockOf(ANCHORS, 'firsthalf', A1 + 75 * MIN).formattedMinute, "45'+30");
});

test('the second-half clock adds 45:00 to elapsed-since-restart and caps at 90', () => {
  assert.equal(A.clockOf(ANCHORS, 'secondhalf', A2 + 30 * 1000).formattedMinute, "45'");
  assert.equal(A.clockOf(ANCHORS, 'secondhalf', A2 + 21 * MIN + 30 * 1000).formattedMinute, "66'");
  assert.equal(A.clockOf(ANCHORS, 'secondhalf', A2 + 47 * MIN + 10 * 1000).formattedMinute, "90'+2");
});

test('half time and full time freeze the clock at its cap', () => {
  const ht = A.clockOf(ANCHORS, 'halftime', at('15:50:00'));
  assert.equal(ht.formattedMinute, "45'");
  assert.equal(ht.frozen, true);
  const ft = A.clockOf(ANCHORS, 'fulltime', at('18:00:00'));
  assert.equal(ft.formattedMinute, "90'");
  assert.equal(ft.frozen, true);
});

test('where the model makes no claim, the clock says nothing', () => {
  // No anchor for the period in play, extra time, penalties, dead states —
  // consumers fall back to the upstream minute rather than a guess.
  assert.equal(A.clockOf({}, 'firsthalf', A1 + MIN), null);
  assert.equal(A.clockOf({ '1H': ANCHORS['1H'] }, 'secondhalf', A2 + MIN), null);
  assert.equal(A.clockOf(ANCHORS, 'extratime', A2 + 50 * MIN), null);
  assert.equal(A.clockOf(ANCHORS, 'penalties', A2 + 70 * MIN), null);
  assert.equal(A.clockOf({ '1H': ANCHORS['1H'] }, 'fulltime', A2 + 60 * MIN), null);
  assert.equal(A.clockOf(ANCHORS, 'postponed', A1), null);
  assert.equal(A.clockOf(ANCHORS, 'abandoned', A1 + 30 * MIN), null);
});

// ---------------------------------------------------------------------------
// Through the boundary — eventTimestamp survives shaping and the event stream
// ---------------------------------------------------------------------------

function player(id, n) {
  return { playerID: id, shirtNumber: n, playerPosition: 'Defender', formationPlace: n,
    playerName: { playerID: id, firstName: 'A', lastName: 'Player' + n, knownName: 'Player ' + n } };
}

function detailWithTimedGoal() {
  const xi = (p) => Array.from({ length: 11 }, (_, i) => player(p + (i + 1), i + 1));
  return {
    id: 'g2578817',
    attributes: {
      matchID: 'g2578817', competitionID: 89, seasonID: 2026,
      kickOffUTC: '2026-08-08 15:00:00', period: 'PreMatch',   // stuck there all match — ignored
      homeTeamID: 't434',
      homeTeam: { teamID: 't434', teamName: 'Aldershot Town', crestURL: 'https://x/1.png' },
      awayTeam: { teamID: 't2479', teamName: 'Boreham Wood', crestURL: 'https://x/2.png' },
      matchTeams: [
        { teamID: 't434', score: 1, halfScore: 1, formation: '442',
          players: { Start: xi('h'), Sub: [player('hs1', 12)] },
          events: {
            goals: [{
              eventID: '2916297187', eventMinute: 3, formattedEventTime: "3'",
              eventPeriod: 'FirstHalf',
              eventTimestamp: '2026-08-08 15:03:41.000000',   // six-digit fraction, no T
              goalEvents: { playerID: 'p1', goalType: 'Goal',
                player: { playerID: 'p1', playerName: { knownName: 'A Striker' } } },
            }],
            bookings: [], subs: [], shootout: [],
          } },
        { teamID: 't2479', score: 0, halfScore: 0, formation: '442',
          players: { Start: xi('a'), Sub: [player('as1', 12)] },
          events: { goals: [], bookings: [], subs: [], shootout: [] } },
      ],
    },
  };
}

test('eventTimestamp is normalised onto the shaped event and measures kick-off', () => {
  const shaped = T.shapeDetail(detailWithTimedGoal(), FLIP);
  assert.equal(shaped.goals[0].tsUTC, '2026-08-08T15:03:41.000Z');
  assert.equal(shaped.goals[0].period, 'FirstHalf');
  assert.equal(A.measureDetail(shaped)['1H'], at('15:01:41'));
});

test('the event stream carries tsUTC, so consumers can hold entry time against detectedAt', () => {
  const shaped = T.shapeDetail(detailWithTimedGoal(), FLIP);
  const { created } = E.diffDetail(null, shaped, new Set());
  const goal = created.find((e) => e.type === 'goal');
  assert.equal(goal.tsUTC, '2026-08-08T15:03:41.000Z');
});

test('an event without a timestamp shapes to a null tsUTC, never a broken date', () => {
  const raw = detailWithTimedGoal();
  delete raw.attributes.matchTeams[0].events.goals[0].eventTimestamp;
  const shaped = T.shapeDetail(raw, FLIP);
  assert.equal(shaped.goals[0].tsUTC, null);
  assert.equal(A.measureDetail(shaped)['1H'], null);
});
