/**
 * nls/events.js — turning state into events (spec §5a).
 *
 * NLS serves STATE, NOT EVENTS. Every response describes the match as it
 * stands: a goals array with minutes attached. It never says what changed
 * since the last poll, and no entry carries an entered-at timestamp. "What
 * just happened" therefore exists in exactly one place — inside the ingester,
 * for the one moment it holds the previous poll and the current one side by
 * side. Discard it and it is gone for good: a sequence of state snapshots
 * cannot be replayed into an event stream after the fact. That is why this is
 * built in step 1 and not deferred.
 *
 * The match minute is not a substitute. A goal scored at 67' may not reach the
 * feed until 15:52 because an official was slow entering it. Anything driven
 * off the minute either fires late or re-fires on every poll — hence
 * `detectedAt`, a server timestamp written when the ingester first saw the
 * entry, and the instruction to consumers to order by it.
 *
 * Pure. The caller supplies previous shaped detail, current shaped detail and
 * the set of already-seen keys, and gets back records to write.
 */

'use strict';

/* {matchID}_{teamID}_{type}_{arrayIndex}. Every component is an NLS code or an
   integer, so the result is free of the characters Firebase rejects
   (. # $ / [ ] ' and whitespace). The apostrophe in "45'+3" is the recurring
   trap in this codebase and the reason a formatted minute is never a key —
   it is carried as a display string and nothing more.

   Withdrawals are keyed on playerID rather than an index: a withdrawal is
   identified by who vanished, and array positions shuffle when a lineup is
   re-entered, which would mint a fresh key for the same withdrawal. */
function eventKey(matchID, teamID, type, suffix) {
  return [matchID, teamID, type, suffix].join('_');
}

function sideOf(detail, teamID) {
  if (!detail) return null;
  if (detail.home && detail.home.id === String(teamID)) return detail.home;
  if (detail.away && detail.away.id === String(teamID)) return detail.away;
  return null;
}

/* Context every event carries, so a live blog or a push notification can
   render one node without joining back to the match. */
function contextOf(detail) {
  return {
    matchID: detail.id,
    compKey: detail.compKey,
    competition: detail.competition,
    homeTeam: detail.home ? detail.home.name : null,
    awayTeam: detail.away ? detail.away.name : null,
    homeScore: detail.home ? detail.home.score : null,
    awayScore: detail.away ? detail.away.score : null,
  };
}

function goalEvents(detail, ctx) {
  return (detail.goals || []).map((g) => Object.assign({}, ctx, {
    eventKey: eventKey(detail.id, g.teamID, 'goal', g.idx),
    type: 'goal',
    teamID: g.teamID,
    playerID: g.playerID,
    playerName: g.playerName,
    minute: g.minute,
    formattedMinute: g.formattedMinute,
    /* The upstream entry's own wall-clock time. detectedAt says when WE first
       saw it; tsUTC says when THEY recorded it — the pair is the per-event
       ingest-lag measurement, so both ride along. */
    tsUTC: g.tsUTC || null,
    isOwnGoal: !!g.isOwnGoal,
    isPenalty: !!g.isPenalty,
  }));
}

function bookingEvents(detail, ctx) {
  return (detail.bookings || []).map((b) => Object.assign({}, ctx, {
    eventKey: eventKey(detail.id, b.teamID, 'booking', b.idx),
    type: 'booking',
    teamID: b.teamID,
    playerID: b.playerID,
    playerName: b.playerName,
    minute: b.minute,
    formattedMinute: b.formattedMinute,
    tsUTC: b.tsUTC || null,
    cardType: b.cardType || b.card || null,
  }));
}

function subEvents(detail, ctx) {
  return (detail.subs || []).map((s) => Object.assign({}, ctx, {
    eventKey: eventKey(detail.id, s.teamID, 'substitution', s.idx),
    type: 'substitution',
    teamID: s.teamID,
    playerID: s.playerOnID,
    playerName: s.playerOnName,
    playerOnID: s.playerOnID,
    playerOffID: s.playerOffID,
    playerOffName: s.playerOffName,
    minute: s.minute,
    formattedMinute: s.formattedMinute,
    tsUTC: s.tsUTC || null,
  }));
}

/* One per team, the moment that team's XI and bench first read as complete.
   This is the event the pre-match window exists to produce — without it, team
   news is a silent field change on a detail node that nothing is watching. */
function lineupEvents(prev, curr, ctx) {
  const out = [];
  ['home', 'away'].forEach((sideName) => {
    const before = prev && prev[sideName];
    const after = curr && curr[sideName];
    if (!after || !after.id) return;
    const wasComplete = Boolean(before && before.lineup &&
      before.lineup.start.length >= 11 && before.lineup.subs.length >= 1);
    const isComplete = Boolean(after.lineup &&
      after.lineup.start.length >= 11 && after.lineup.subs.length >= 1);
    if (isComplete && !wasComplete) {
      out.push(Object.assign({}, ctx, {
        eventKey: eventKey(curr.id, after.id, 'lineup', 0),
        type: 'lineup',
        teamID: after.id,
        teamName: after.name,
        formation: after.formation || null,
        minute: null,
        formattedMinute: null,
      }));
    }
  });
  return out;
}

/* A lineup that shrinks is a real event, not an error to suppress (spec §3).
   Late withdrawals happen — a player pulls up in the warm-up and the XI is
   re-entered without them. Treating that as corrupt data is how a published
   team sheet goes quietly stale. */
function withdrawalEvents(prev, curr, ctx) {
  const out = [];
  ['home', 'away'].forEach((sideName) => {
    const before = prev && prev[sideName];
    const after = curr && curr[sideName];
    if (!before || !after || !after.id) return;
    const wasStart = before.lineup ? before.lineup.start : [];
    if (wasStart.length < 11) return;      // nothing settled to withdraw from
    const nowIds = new Set((after.lineup ? after.lineup.start : []).map((p) => p.id));
    wasStart.forEach((p) => {
      if (!p || !p.id || nowIds.has(p.id)) return;
      out.push(Object.assign({}, ctx, {
        eventKey: eventKey(curr.id, after.id, 'withdrawal', p.id),
        type: 'withdrawal',
        teamID: after.id,
        teamName: after.name,
        playerID: p.id,
        playerName: p.name,
        minute: null,
        formattedMinute: null,
      }));
    });
  });
  return out;
}

/**
 * Diff two shaped detail nodes.
 *
 * Returns { created, retracted }:
 *   created   — event records not present in `seen`, ready to write
 *   retracted — keys present in the previous poll and absent now
 *
 * `seen` is the dedup guard carried across from the vidiprinter (spec §5.1).
 * It is checked rather than trusting `prev`, because `prev` is unavailable
 * after a cold start mid-match and the guard has to survive that: a restarted
 * ingester must not replay the first half into a live blog.
 */
function diffDetail(prev, curr, seen) {
  if (!curr || !curr.id) return { created: [], retracted: [] };
  const ctx = contextOf(curr);
  const has = seen instanceof Set ? (k) => seen.has(k) : (k) => Boolean(seen && seen[k]);

  const current = [].concat(
    goalEvents(curr, ctx),
    bookingEvents(curr, ctx),
    subEvents(curr, ctx),
    lineupEvents(prev, curr, ctx),
    withdrawalEvents(prev, curr, ctx));

  const created = current.filter((e) => !has(e.eventKey));

  /* An entry that was there last poll and is gone now means an official
     deleted it. The node is never deleted in response — a live blog that
     silently rewrites its own history is worse than one showing a struck-out
     line. `retracted: true` is flagged against the event and the consumer
     decides whether to strike through or hide. Lineup and withdrawal events
     are excluded: those are derived from a transition rather than from an
     array entry, so their absence this poll is normal, not a deletion. */
  const currentKeys = new Set(current.map((e) => e.eventKey));
  const prevKeys = prev ? [].concat(
    goalEvents(prev, contextOf(prev)),
    bookingEvents(prev, contextOf(prev)),
    subEvents(prev, contextOf(prev))).map((e) => e.eventKey) : [];
  const retracted = prevKeys.filter((k) => !currentKeys.has(k));

  return { created, retracted };
}

module.exports = { eventKey, diffDetail, contextOf, sideOf,
  goalEvents, bookingEvents, subEvents, lineupEvents, withdrawalEvents };
