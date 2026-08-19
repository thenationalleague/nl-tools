/**
 * nls/anchors.js — kick-off as an event (method note v18.0, 19/08/2026).
 *
 * NLS never emits kick-off. Every response is state — "the match is in its
 * 67th minute" — and nothing ever says when the whistle actually went. So the
 * ingester synthesises it: one KICK_OFF record per match per period, written
 * to anchors/{matchID}/{1H|2H}, derived from observations and corrected by
 * events. Everything downstream (the derived clock, the lag measurement)
 * hangs off that record.
 *
 * THE SYNTHETIC EVENT
 *   On the poll where the LIST matchPeriod first reaches FirstHalf:
 *     anchors/{matchID}/1H = { anchorUTC, source: 'list-flip',
 *                              confidence: 'low', revisions: [] }
 *   anchorUTC is the poll time of the flip — accurate to ±poll interval plus
 *   the feed's ingest batch lag (observed up to ~4 minutes), hence 'low'.
 *   A second record is written on ARRIVAL at SecondHalf — arrival, not the
 *   HalfTime→SecondHalf pair, because matches can skip HalfTime on the list.
 *
 *   Detail `period` is ignored entirely — it sits on PreMatch for the whole
 *   match. The list is the only period source trusted here.
 *
 * CORRECTION BY EVENTS
 *   Every timed detail event (goal, booking, sub) is a kick-off measurement:
 *     impliedStart = eventTimestamp − ((eventMinute − 1) − periodOffset) min
 *   with periodOffset 0 in 1H and 45 in 2H, chosen on eventPeriod and NEVER
 *   on the minute — first-half stoppage carries eventMinute > 45 with
 *   eventPeriod FirstHalf and the formula already handles it. An event in
 *   minute m occurred between m−1 and m elapsed, so impliedStart is the
 *   LATEST-POSSIBLE start: precision ±60s, better where eventTimestamp
 *   carries real seconds rather than :00.
 *
 *   If impliedStart predates the current anchor by more than 60s, re-anchor:
 *   the old value is pushed to revisions[], source becomes 'event-derived',
 *   confidence 'high'. First event wins the correction; later events only
 *   tighten (move the anchor earlier), never loosen — a "correction" that
 *   would delay kick-off is discarded, so anchors only ever move backwards
 *   in time. If the flip was never observed (poller gap), the first event
 *   creates the anchor.
 *
 * THE LAG EXHIBIT
 *   The gap between the list-flip and event-derived values is the feed's
 *   kick-off ingest lag, captured per match as ingestLagMs — a by-product
 *   worth keeping. listFlipUTC is only ever stamped from a WITNESSED flip
 *   (previous poll's period known and different); a cold-start sighting
 *   still anchors, at 'low' confidence, but never feeds the lag figure.
 *
 * THE CLOCK
 *   elapsed = now − anchorUTC (+45:00 in the second half). Display floors to
 *   minutes, single prime, capped at 45'+n / 90'+n — never counting through
 *   the cap. HalfTime and FullTime freeze the clock at its cap. Clock state
 *   lives on the anchor record, so it survives any client reload by
 *   construction: consumers derive, they never count.
 *
 * EDGE CASES, SETTLED
 *   Postponed never anchors — arrival is only FirstHalf or SecondHalf, and a
 *   postponed match reaches neither. A flip before the listed hour is
 *   legitimate (one observed 14:59:47) and is accepted — nothing here gates
 *   on the fixture's kick-off time. Extra time and penalties are outside
 *   this model: clockOf returns null for them and consumers fall back to the
 *   upstream minute, which already handles 90'+n / 120.
 *
 * Pure functions only — no fetch, no RTDB, the clock always an argument —
 * covered by tests/nls-anchors.test.mjs. The orchestrator owns the reads and
 * writes, as everywhere else in this ingester.
 */

'use strict';

const MIN_MS = 60 * 1000;

/* "More than 60s" — inside it, a difference is measurement noise (the same
   ±60s the minute-only precision carries) and re-anchoring would just churn
   revisions[]. */
const REANCHOR_THRESHOLD_MS = 60 * 1000;

const SLOTS = {
  '1H': { offsetMin: 0, capMin: 45 },
  '2H': { offsetMin: 45, capMin: 90 },
};

function iso(msEpoch) {
  return new Date(msEpoch).toISOString();
}

function msOf(isoString) {
  const n = Date.parse(isoString || '');
  return isNaN(n) ? null : n;
}

/**
 * Which anchor a LIST period observation creates, if any.
 * `prevPeriod` null means "no previous observation" (first run of the day or
 * a cold start) — that still counts as arrival: the record survives restarts
 * in RTDB, so an existing anchor is never overwritten, and a genuinely fresh
 * sighting is the best list-only estimate available, at 'low' confidence.
 */
function arrivalSlotOf(period, prevPeriod) {
  const p = String(period || '').toLowerCase();
  const prev = prevPeriod == null ? null : String(prevPeriod).toLowerCase();
  if (p === 'firsthalf' && prev !== 'firsthalf') return '1H';
  if (p === 'secondhalf' && prev !== 'secondhalf') return '2H';
  return null;
}

/* eventPeriod arrives as "FirstHalf" | "SecondHalf" | "1" | "2". Shootout
   entries carry null and extra time is outside the model — both return null
   and contribute no measurement. */
function slotOfEventPeriod(eventPeriod) {
  const p = String(eventPeriod == null ? '' : eventPeriod).toLowerCase();
  if (p === 'firsthalf' || p === '1') return '1H';
  if (p === 'secondhalf' || p === '2') return '2H';
  return null;
}

/**
 * One shaped event ({ tsUTC, minute, period }) → { slot, impliedStart } or
 * null when it cannot be a measurement: no timestamp, no minute, a period
 * outside the model, or a minute that sits before its own period starts
 * (a "44th-minute" event tagged SecondHalf implies a start in the future,
 * which is not a measurement, it is a data-entry slip).
 */
function impliedStartOf(ev) {
  if (!ev) return null;
  const slot = slotOfEventPeriod(ev.period);
  if (!slot) return null;
  const ts = msOf(ev.tsUTC);
  if (ts == null) return null;
  const minute = Number(ev.minute);
  if (!isFinite(minute) || minute < 1) return null;
  const intoPeriod = (minute - 1) - SLOTS[slot].offsetMin;
  if (intoPeriod < 0) return null;
  return { slot, impliedStart: ts - intoPeriod * MIN_MS };
}

/**
 * All of a shaped detail's timed events, reduced to the best (earliest)
 * implied start per period. Earliest, because each measurement is a
 * latest-possible bound — the minimum is the tightest.
 */
function measureDetail(detail) {
  const out = { '1H': null, '2H': null };
  [].concat(
    (detail && detail.goals) || [],
    (detail && detail.bookings) || [],
    (detail && detail.subs) || []
  ).forEach((ev) => {
    const m = impliedStartOf(ev);
    if (!m) return;
    if (out[m.slot] == null || m.impliedStart < out[m.slot]) out[m.slot] = m.impliedStart;
  });
  return out;
}

/* ingestLagMs = listFlipUTC − anchorUTC, maintained whenever both ends are
   known. Positive means the list flipped after the (event-derived) kick-off,
   which is the feed's ingest lag — the UZ exhibit. */
function withLag(record) {
  const flip = msOf(record.listFlipUTC);
  const anchor = msOf(record.anchorUTC);
  if (flip != null && anchor != null) record.ingestLagMs = flip - anchor;
  return record;
}

/**
 * A list observation arriving at this slot's period.
 *
 * `witnessed` — the previous poll's period was known and different, i.e. this
 * poll actually saw the flip rather than merely finding the match already in
 * play. Only witnessed flips stamp listFlipUTC (and so feed the lag figure).
 *
 * Returns { record, changed }. An existing anchor's anchorUTC is never
 * touched here: a flip that arrives after an event-derived anchor exists is
 * later information of lower confidence — it contributes the lag exhibit and
 * nothing else.
 */
function applyListArrival(record, nowMs, witnessed) {
  if (!record) {
    const created = {
      anchorUTC: iso(nowMs),
      source: 'list-flip',
      confidence: 'low',
      revisions: [],
    };
    if (witnessed) created.listFlipUTC = iso(nowMs);
    return { record: created, changed: true };
  }
  if (witnessed && !record.listFlipUTC && record.source === 'event-derived') {
    return { record: withLag(Object.assign({}, record, { listFlipUTC: iso(nowMs) })), changed: true };
  }
  return { record, changed: false };
}

/**
 * An event-derived measurement against the current record.
 *
 * Creates the anchor when the flip was never observed; re-anchors when the
 * measurement predates the current value by more than the threshold, pushing
 * the old value to revisions[]. Anything later than the current anchor is
 * discarded — anchors only ever move backwards in time.
 *
 * Returns { record, changed }.
 */
function applyMeasurement(record, impliedStartMs, nowMs) {
  if (impliedStartMs == null) return { record, changed: false };
  if (!record) {
    return {
      record: {
        anchorUTC: iso(impliedStartMs),
        source: 'event-derived',
        confidence: 'high',
        revisions: [],
      },
      changed: true,
    };
  }
  const current = msOf(record.anchorUTC);
  if (current != null && impliedStartMs >= current - REANCHOR_THRESHOLD_MS) {
    return { record, changed: false };
  }
  /* RTDB never stores an empty array, so a record read back has no revisions
     field until the first revision lands — tolerate its absence. */
  const revisions = (Array.isArray(record.revisions) ? record.revisions : []).concat([{
    anchorUTC: record.anchorUTC,
    source: record.source,
    confidence: record.confidence,
    revisedAt: iso(nowMs),
  }]);
  const next = Object.assign({}, record, {
    anchorUTC: iso(impliedStartMs),
    source: 'event-derived',
    confidence: 'high',
    revisions,
  });
  return { record: withLag(next), changed: true };
}

function fmtMinute(minute, capMin) {
  if (minute > capMin) return capMin + "'+" + (minute - capMin);
  return minute + "'";
}

/**
 * The derived clock: anchors ({ '1H', '2H' } records, either absent) plus the
 * LIST period plus a clock → { minute, formattedMinute, basis, frozen? } or
 * null where the model makes no claim (no anchor for the period in play,
 * extra time, penalties, abandoned, postponed). Consumers fall back to the
 * upstream minute on null.
 */
function clockOf(anchors, period, nowMs) {
  const p = String(period || '').toLowerCase();
  const a1 = anchors && anchors['1H'] ? msOf(anchors['1H'].anchorUTC) : null;
  const a2 = anchors && anchors['2H'] ? msOf(anchors['2H'].anchorUTC) : null;

  if (p === 'firsthalf' && a1 != null) {
    const m = Math.max(0, Math.floor((nowMs - a1) / MIN_MS));
    return { minute: m, formattedMinute: fmtMinute(m, 45), basis: '1H' };
  }
  if (p === 'halftime' && a1 != null) {
    return { minute: 45, formattedMinute: "45'", basis: '1H', frozen: true };
  }
  if (p === 'secondhalf' && a2 != null) {
    const m = 45 + Math.max(0, Math.floor((nowMs - a2) / MIN_MS));
    return { minute: m, formattedMinute: fmtMinute(m, 90), basis: '2H' };
  }
  if ((p === 'fulltime' || p === 'postmatch') && a2 != null) {
    return { minute: 90, formattedMinute: "90'", basis: '2H', frozen: true };
  }
  return null;
}

module.exports = {
  REANCHOR_THRESHOLD_MS,
  arrivalSlotOf, slotOfEventPeriod,
  impliedStartOf, measureDetail,
  applyListArrival, applyMeasurement,
  clockOf,
};
