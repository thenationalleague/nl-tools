/**
 * nls/transform.js — THE SWAPPABLE BOUNDARY.
 *
 * Upstream-shaped in, consumer-shaped out. Field names on the left of every
 * assignment below are NLS's and are expected to change when the upstream
 * does; field names on the right are the contract `nls/` publishes and must
 * not. Stats Perform have agreed in principle to a direct outlet key, so this
 * file is the one that gets rewritten when that lands — and nothing else
 * should have to be. (Spec §8.)
 *
 * Pure functions only. No fetch, no RTDB, no clock reads beyond the `now`
 * that callers pass in — that is what makes the whole thing testable in
 * tests/nls-ingester.test.mjs without touching the network.
 *
 * The quirks handled here are the ones §6 of the spec lists, and each is
 * handled exactly once so that no consumer ever meets it:
 *
 *   - `matchPeriod` is the master switch. A finished match sits at
 *     matchMinutes: 95 / formattedMatchTime: "90'+5" indefinitely; trusting
 *     the minute is precisely what makes a widget show a finished game as live.
 *   - List and detail disagree on field names for the same value
 *     (matchPeriod/period, crest/crestURL, kickOffDateUTC/kickOffUTC).
 *   - Dates arrive without the `T` separator.
 *   - `matchID` inside an event's player object refers to the match where that
 *     player was first registered, not this one. Never read it.
 *   - Firebase keys cannot contain . # $ / [ ] ' or whitespace, and
 *     "45'+3" contains an apostrophe. Nothing is ever keyed on a minute.
 */

'use strict';

const crypto = require('crypto');

/* Competition identity. compKey is what appears in node paths; the numeric ID
   is upstream's and stays on this side of the boundary except as `comp`, which
   consumers may want for a deep link back to NLS. */
const COMPETITIONS = {
  89:   { key: 'nl',    label: 'National League',     detailAvailability: 'full' },
  373:  { key: 'north', label: 'National North',      detailAvailability: 'scores' },
  372:  { key: 'south', label: 'National South',      detailAvailability: 'scores' },
  1275: { key: 'cup',   label: 'National League Cup', detailAvailability: 'scores' },
};

const COMP_IDS = Object.keys(COMPETITIONS).map(Number);

/* `detailAvailability` is a data-quality flag, not a bug report (spec §6).
   The National League is Stats Perform tier 9 — live lineups, formations and
   in-play events. North and South are tier 7: live scores with goalscorers,
   but lineups, bookings and substitutions only arrive post-match, if at all.
   A live lineup view is therefore correct to be empty for north/south, and a
   consumer that knows this renders an honest empty state instead of looking
   broken. The Cup is conservatively 'scores' — it is contested across tiers,
   so the National League's own coverage is not a safe assumption for it.

     'full'   — expect lineups, formations, bookings, subs live
     'scores' — expect scores and goalscorers live; detail post-match at best */
function competitionOf(compId) {
  return COMPETITIONS[Number(compId)] || null;
}

function compKeyOf(compId) {
  const c = competitionOf(compId);
  return c ? c.key : null;
}

// ---------------------------------------------------------------------------
// Dates and periods
// ---------------------------------------------------------------------------

/* "2026-03-24 19:45:00" → Date. The missing `T` is not optional to fix:
   Safari rejects the space form outright and V8 parses it as local time, so
   the same string yields two different instants depending on where it runs. */
function normaliseUtc(s) {
  if (!s) return null;
  const iso = String(s).indexOf('T') >= 0 ? String(s) : String(s).replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/* The UTC day, which is what the NLS from/to window filters on and therefore
   what `{ymd}` in a node path has to mean. Spec §6 records the edge: a 00:30
   UK kick-off falls on the previous UTC day. Not a live issue for 15:00
   Saturdays; widen the fetch window here if late kick-offs ever appear. */
function ymdOf(d) {
  return d ? d.toISOString().slice(0, 10) : null;
}

const DEAD_PERIODS = ['fulltime', 'postmatch', 'abandoned', 'postponed'];
const LIVE_PERIODS = ['firsthalf', 'halftime', 'secondhalf', 'extratime', 'penalties'];

function periodOf(attrs) {
  /* List says matchPeriod, detail says period. Same value, two names. */
  return String((attrs && (attrs.matchPeriod || attrs.period)) || '').toLowerCase();
}

function isLive(period) {
  const p = String(period || '').toLowerCase();
  if (DEAD_PERIODS.includes(p)) return false;
  return LIVE_PERIODS.some((v) => p.includes(v));
}

function isFinished(period) {
  const p = String(period || '').toLowerCase();
  return p === 'fulltime' || p === 'postmatch';
}

/* THE MASTER SWITCH. Once a match is dead the minute is meaningless and must
   not be published — a stuck "90'+5" on a finished game is the single most
   visible symptom this ingester exists to remove. */
function minuteOf(attrs, period) {
  if (!isLive(period)) return { minute: null, formattedMinute: null };
  const raw = attrs && (attrs.matchMinutes != null ? attrs.matchMinutes : attrs.matchTime);
  const fmt = attrs && (attrs.formattedMatchTime || null);
  return {
    minute: raw == null ? null : Number(raw),
    formattedMinute: fmt == null ? null : String(fmt),
  };
}

// ---------------------------------------------------------------------------
// Names, formations, players
// ---------------------------------------------------------------------------

function num(v) {
  return v == null || v === '' ? null : Number(v);
}

function playerNameOf(p) {
  const n = (p && (p.playerName || p)) || {};
  return String(n.knownName || n.customKnownName ||
    [n.firstName, n.lastName].filter(Boolean).join(' ') || '').trim() || null;
}

/* Raw is "4231"; every consumer wants "4-2-3-1" and none of them should have
   to know that. Left alone if it already carries separators. */
function normaliseFormation(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  return s.includes('-') ? s : s.split('').join('-');
}

/* Position buckets are coarse upstream — Goalkeeper / Defender / Midfielder /
   Striker, with no left-back or right-wing (spec §6). Store what arrives.
   Inferring placement from shirt number against the formation string is a
   presentation decision and belongs in whatever draws a pitch, not here:
   invented precision in the ingester would be indistinguishable from real
   data by the time a consumer saw it. */
function shapePlayer(p) {
  if (!p || !p.playerID) return null;
  return {
    id: String(p.playerID),
    name: playerNameOf(p),
    shirt: num(p.shirtNumber),
    position: p.playerPosition ? String(p.playerPosition) : null,
    subPosition: p.playerSubPosition ? String(p.playerSubPosition) : null,
    formationPlace: num(p.formationPlace),
    // p.matchID is deliberately not read — see the header.
  };
}

function shapePlayers(list) {
  return (Array.isArray(list) ? list : []).map(shapePlayer).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Stage 1 — the light index row, shaped from the list endpoint
// ---------------------------------------------------------------------------

function listSide(t) {
  const s = t || {};
  return {
    id: s.teamID != null ? String(s.teamID) : null,
    name: String(s.name || s.shortName || s.initials || ''),
    short: s.shortName ? String(s.shortName) : null,
    crest: s.crest ? String(s.crest) : null,          // detail calls this crestURL
    score: num(s.score),
    halfScore: num(s.halfScore),
    penScore: num(s.penaltyScore),
  };
}

/* A few KB per matchday, so a scores grid or a vidiprinter subscribes to
   `live/index/{compKey}/{ymd}` and never downloads a lineup it will not draw.
   RTDB egress is metered and NLS is not, which is why scoping is not
   optional here (spec §4). */
function shapeIndexRow(m, now) {
  const a = (m && m.attributes) || {};
  const ko = normaliseUtc(a.kickOffDateUTC || a.kickoffDateUTC || a.kickOffUTC ||
                          a.kickOffDate || a.date || '');
  const comp = competitionOf(a.competitionID);
  if (!m || !m.id || !ko || !comp || !a.homeTeam || !a.awayTeam) return null;

  const period = periodOf(a);
  const { minute, formattedMinute } = minuteOf(a, period);

  return {
    id: String(m.id),
    comp: Number(a.competitionID),
    compKey: comp.key,
    competition: comp.label,
    ko: ko.toISOString(),
    period: period,
    live: isLive(period),
    finished: isFinished(period),
    postponed: period === 'postponed',
    postponementReason: a.postponementReason ? String(a.postponementReason) : null,
    resultType: a.resultType ? String(a.resultType) : null,
    minute: minute,
    formattedMinute: formattedMinute,
    home: listSide(a.homeTeam),
    away: listSide(a.awayTeam),
    detailAvailability: comp.detailAvailability,
    updatedAt: now,
    source: 'nls',
  };
}

/* Stage 2's trigger. Deliberately only the four fields that change when
   something happened on the pitch — adding anything volatile here (a crest
   URL that gains a cache-buster, say) would fire a detail fetch every minute
   for every match and turn the two-stage model back into the 35-a-minute one
   it exists to avoid. */
function signatureOf(row) {
  if (!row) return '';
  return [row.period, row.home && row.home.score, row.away && row.away.score, row.minute]
    .map((v) => (v == null ? '' : String(v))).join('|');
}

// ---------------------------------------------------------------------------
// Stage 2 — full detail
// ---------------------------------------------------------------------------

function detailSide(team, matchTeam) {
  const t = team || {};
  const mt = matchTeam || {};
  const players = mt.players || {};
  return {
    id: t.teamID != null ? String(t.teamID) : (mt.teamID != null ? String(mt.teamID) : null),
    name: String(t.teamName || t.teamShortName || t.customShortName || t.teamNameInitials || ''),
    short: t.teamShortName ? String(t.teamShortName) : null,
    official: t.teamOfficialName ? String(t.teamOfficialName) : null,
    crest: t.crestURL ? String(t.crestURL) : null,     // list calls this crest
    score: num(mt.score),
    halfScore: num(mt.halfScore),
    ninetyScore: num(mt.ninetyScore),
    extraScore: num(mt.extraScore),
    penScore: num(mt.penaltyScore),
    formation: normaliseFormation(mt.formation),
    kit: mt.kit ? {
      type: mt.kit.kitType ? String(mt.kit.kitType) : null,
      colour1: mt.kit.colour1 || null,
      colour2: mt.kit.colour2 || null,
      colour3: mt.kit.colour3 || null,
    } : null,
    lineup: {
      start: shapePlayers(players.Start),
      subs: shapePlayers(players.Sub),
    },
  };
}

/* Event array index is the canonical identity within a match — stable for a
   given team, numeric, and free of the characters Firebase rejects. Carried
   across from the vidiprinter unchanged (spec §5.1) because it is the piece
   of that build that was demonstrably right. */
function shapeGoals(events, teamID) {
  return (Array.isArray(events) ? events : []).map((e, i) => {
    const g = (e && e.goalEvents) || {};
    const type = String(g.goalType || '').toLowerCase();
    return {
      idx: i,
      teamID: String(teamID),
      playerID: g.playerID ? String(g.playerID) : null,
      playerName: playerNameOf(g.player),
      minute: num(e.eventMinute != null ? e.eventMinute : e.eventTime),
      formattedMinute: e.formattedEventTime ? String(e.formattedEventTime) : null,
      period: e.eventPeriod ? String(e.eventPeriod) : null,
      isOwnGoal: type.includes('own'),
      isPenalty: type.includes('pen'),
    };
  });
}

function shapeBookings(events, teamID) {
  return (Array.isArray(events) ? events : []).map((e, i) => {
    const b = (e && e.bookingEvents) || {};
    return {
      idx: i,
      teamID: String(teamID),
      playerID: b.playerID ? String(b.playerID) : null,
      playerName: playerNameOf(b.player),
      minute: num(e.eventMinute != null ? e.eventMinute : e.eventTime),
      formattedMinute: e.formattedEventTime ? String(e.formattedEventTime) : null,
      card: b.card ? String(b.card) : null,
      cardType: b.cardType ? String(b.cardType) : null,
      reason: b.reason ? String(b.reason) : null,
    };
  });
}

function shapeSubs(events, teamID) {
  return (Array.isArray(events) ? events : []).map((e, i) => {
    const s = (e && e.substitutionEvents) || {};
    return {
      idx: i,
      teamID: String(teamID),
      playerOnID: s.subOnID ? String(s.subOnID) : null,
      playerOnName: playerNameOf(s.subOnPlayer),
      playerOffID: s.subOffID ? String(s.subOffID) : null,
      playerOffName: playerNameOf(s.subOffPlayer),
      minute: num(e.eventMinute != null ? e.eventMinute : e.eventTime),
      formattedMinute: e.formattedEventTime ? String(e.formattedEventTime) : null,
      reason: s.reason ? String(s.reason) : null,
    };
  });
}

/* Shootout entries are split across both teams and have null eventPeriod and
   null eventMinute; eventTime counts up from 121 alternating between sides, so
   it is the only field that reconstructs the order. A single penalty can also
   appear twice with different outcomes when an official corrects an entry —
   the later eventID wins. Both facts are upstream's, so both are settled here. */
function shapeShootout(teamA, teamB) {
  const all = [];
  [teamA, teamB].forEach((mt) => {
    const evs = (mt && mt.events && mt.events.shootout) || [];
    evs.forEach((e) => {
      const s = (e && e.shootoutEvents) || {};
      all.push({
        eventID: e.eventID != null ? String(e.eventID) : null,
        teamID: mt.teamID != null ? String(mt.teamID) : null,
        order: num(e.eventTime),
        playerID: s.playerID ? String(s.playerID) : null,
        playerName: playerNameOf(s.player),
        outcome: s.outcome ? String(s.outcome) : null,
      });
    });
  });
  const byTaker = new Map();
  all.forEach((p) => {
    const k = p.teamID + '|' + p.order + '|' + p.playerID;
    const prev = byTaker.get(k);
    if (!prev || Number(p.eventID) > Number(prev.eventID)) byTaker.set(k, p);
  });
  return [...byTaker.values()].sort((a, b) => (a.order || 0) - (b.order || 0));
}

/* "Complete" for the purposes of the pre-match poll (spec §3): a named XI plus
   at least one named substitute, for BOTH teams. Requiring a full bench would
   never satisfy — squad sizes vary and officials add subs one at a time — and
   requiring only the XI would settle before the bench arrives. */
function lineupComplete(shaped) {
  const ok = (side) => side && side.lineup &&
    side.lineup.start.length >= 11 && side.lineup.subs.length >= 1;
  return Boolean(ok(shaped && shaped.home) && ok(shaped && shaped.away));
}

function shapeDetail(m, now) {
  const a = (m && m.attributes) || {};
  const comp = competitionOf(a.competitionID);
  const ko = normaliseUtc(a.kickOffUTC || a.kickOffDateUTC || a.kickoffDateUTC || '');
  if (!m || !a.matchID || !comp) return null;

  const teams = Array.isArray(a.matchTeams) ? a.matchTeams : [];
  const homeID = a.homeTeamID != null ? String(a.homeTeamID) : null;
  const find = (id) => teams.find((t) => String(t.teamID) === String(id)) || null;
  const homeMT = find(homeID) || teams[0] || null;
  const awayMT = teams.find((t) => t !== homeMT) || null;

  const period = periodOf(a);
  const { minute, formattedMinute } = minuteOf(
    Object.assign({}, a, a.matchDetails || {}), period);
  const details = a.matchDetails || {};

  const shaped = {
    id: String(a.matchID),
    comp: Number(a.competitionID),
    compKey: comp.key,
    competition: comp.label,
    season: num(a.seasonID),
    ko: ko ? ko.toISOString() : null,
    period: period,
    live: isLive(period),
    finished: isFinished(period),
    minute: minute,
    formattedMinute: formattedMinute,
    venue: a.venue ? String(a.venue) : null,
    venueCity: a.venueCity ? String(a.venueCity) : null,
    referee: (details.refereeName || a.refereeName) ? String(details.refereeName || a.refereeName) : null,
    attendance: num(details.attendance),
    resultType: details.resultType ? String(details.resultType) : null,
    winnerID: a.matchWinnerID != null ? String(a.matchWinnerID) : null,
    home: detailSide(a.homeTeam, homeMT),
    away: detailSide(a.awayTeam, awayMT),
    goals: [].concat(
      shapeGoals(homeMT && homeMT.events && homeMT.events.goals, homeMT && homeMT.teamID),
      shapeGoals(awayMT && awayMT.events && awayMT.events.goals, awayMT && awayMT.teamID)),
    bookings: [].concat(
      shapeBookings(homeMT && homeMT.events && homeMT.events.bookings, homeMT && homeMT.teamID),
      shapeBookings(awayMT && awayMT.events && awayMT.events.bookings, awayMT && awayMT.teamID)),
    subs: [].concat(
      shapeSubs(homeMT && homeMT.events && homeMT.events.subs, homeMT && homeMT.teamID),
      shapeSubs(awayMT && awayMT.events && awayMT.events.subs, awayMT && awayMT.teamID)),
    shootout: shapeShootout(homeMT, awayMT),
    detailAvailability: comp.detailAvailability,
    updatedAt: now,
    source: 'nls',
  };
  shaped.lineupComplete = lineupComplete(shaped);
  return shaped;
}

// ---------------------------------------------------------------------------
// Write-on-change
// ---------------------------------------------------------------------------

/* RTDB pushes to every connected client on every write. Re-writing a node with
   identical content therefore wakes every open browser and bills for the
   egress, for nothing — so every write in this ingester is gated on this hash
   (spec §4). `updatedAt` is excluded because it changes on every run by
   definition and would defeat the whole comparison. */
function contentHash(node) {
  const clone = JSON.parse(JSON.stringify(node == null ? null : node));
  if (clone && typeof clone === 'object') delete clone.updatedAt;
  return crypto.createHash('sha1').update(stableStringify(clone)).digest('hex');
}

function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) =>
    JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

module.exports = {
  COMPETITIONS, COMP_IDS,
  competitionOf, compKeyOf,
  normaliseUtc, ymdOf, periodOf, isLive, isFinished, minuteOf,
  playerNameOf, normaliseFormation, shapePlayer, shapePlayers,
  shapeIndexRow, signatureOf,
  shapeDetail, shapeGoals, shapeBookings, shapeSubs, shapeShootout, lineupComplete,
  contentHash, stableStringify,
};
