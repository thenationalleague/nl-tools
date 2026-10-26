/**
 * nls/players.js — one row per player per match.
 *
 * WHY ROWS AND NOT TALLIES
 * The scorer tally in derive.js answers one question: who has scored most.
 * Every other player question a preview writer asks — a run of games with a
 * goal, starts against appearances off the bench, minutes per goal, a debut
 * for a new club, who has dropped out of a side — needs the match-by-match
 * record, and NLS only ever serves one match at a time. A row per player per
 * match turns every one of those questions into a single read of that
 * player's season, and keeps the derived question out of the ingester: the
 * reader decides what "form" means, the store only records what happened.
 *
 * WHAT A ROW CAN AND CANNOT SAY
 *   - role is 'start' | 'sub' (came on) | 'unused' (named on the bench, never
 *     came on) | 'unlisted' (appears in an event but in neither lineup list —
 *     tier 7 matches often have goals entered and no team sheet at all).
 *   - Absence is the absence of a row. A row never says WHY a player was
 *     missing; injury, suspension and being dropped look identical upstream.
 *   - minutes are on the regulation clock (90, or 120 when the match went to
 *     extra time). Stoppage time is not counted: NLS minutes for added time
 *     are not reliable enough to bill a player for them, and a figure that is
 *     consistently slightly low is more useful than one that is sometimes
 *     wildly high. Null whenever the role makes them unknowable.
 *   - Captaincy is NOT recorded. shapePlayer() does not carry it and no NLS
 *     detail response read so far has been checked for it; adding a field
 *     on assumption would publish a guess as a fact.
 *
 * Pure. The caller supplies a shaped detail (transform.shapeDetail) and gets
 * back the rows to write.
 */

'use strict';

const REGULATION = 90;
const WITH_EXTRA_TIME = 120;

function hasExtraTime(detail) {
  const rt = String(detail.resultType || '').toLowerCase();
  if (rt.includes('extra') || rt.includes('penalt')) return true;
  const evs = [].concat(detail.goals || [], detail.bookings || [], detail.subs || []);
  return evs.some((e) => String(e.period || '').toLowerCase().includes('extra'));
}

function clampMinute(m, length) {
  if (m == null || isNaN(Number(m))) return null;
  return Math.max(0, Math.min(length, Number(m)));
}

function isRed(b) {
  return /red/i.test(b.card || '') || /red|second/i.test(b.cardType || '');
}

function isYellow(b) {
  return /yellow/i.test(b.card || '') && !isRed(b);
}

function resultFor(own, opp) {
  if (own == null || opp == null) return null;
  return own > opp ? 'W' : own < opp ? 'L' : 'D';
}

/**
 * Build the rows for one finished match.
 *
 * Returns { rows: { [playerID]: row }, complete, length } where `complete` is
 * true when BOTH sides have a named XI — the ledger uses it to decide whether
 * a later run should look again, because tier 7 team sheets arrive late or
 * never.
 */
function buildPlayerRows(detail, now) {
  if (!detail || !detail.id || !detail.home || !detail.away) {
    return { rows: {}, complete: false, length: REGULATION };
  }
  const length = hasExtraTime(detail) ? WITH_EXTRA_TIME : REGULATION;
  const sides = [detail.home, detail.away];
  const sideById = new Map(sides.map((s) => [String(s.id), s]));
  const otherSide = (teamID) => sides.find((s) => String(s.id) !== String(teamID)) || null;

  const rows = {};
  const teamOf = new Map();        // playerID → teamID, from the lineup lists

  function base(pid, name, teamID) {
    const own = sideById.get(String(teamID)) || null;
    const opp = otherSide(teamID);
    const isHome = own === detail.home;
    return {
      playerID: pid,
      name: name || null,
      matchID: detail.id,
      season: detail.season,
      compKey: detail.compKey,
      ko: detail.ko,
      teamID: own ? String(own.id) : (teamID != null ? String(teamID) : null),
      teamName: own ? own.name : null,
      oppID: opp ? String(opp.id) : null,
      oppName: opp ? opp.name : null,
      home: own ? isHome : null,
      scoreFor: own ? own.score : null,
      scoreAgainst: opp ? opp.score : null,
      result: own && opp ? resultFor(own.score, opp.score) : null,
      role: 'unlisted',
      shirt: null,
      position: null,
      on: null,
      off: null,
      minutes: null,
      goals: 0,
      penalties: 0,
      ownGoals: 0,
      yellow: 0,
      red: 0,
      sentOff: null,
      updatedAt: now,
      source: 'nls',
    };
  }

  /* Lineups first: they are the only source of a player's team that does not
     depend on which side an event was filed under. */
  sides.forEach((side) => {
    const lu = side.lineup || { start: [], subs: [] };
    (lu.start || []).forEach((p) => {
      if (!p || !p.id) return;
      const r = base(p.id, p.name, side.id);
      r.role = 'start'; r.shirt = p.shirt; r.position = p.position;
      rows[p.id] = r; teamOf.set(p.id, String(side.id));
    });
    (lu.subs || []).forEach((p) => {
      if (!p || !p.id || rows[p.id]) return;
      const r = base(p.id, p.name, side.id);
      r.role = 'unused'; r.shirt = p.shirt; r.position = p.position;
      rows[p.id] = r; teamOf.set(p.id, String(side.id));
    });
  });

  /* A player named only in an event. Their team is the event's team — except
     for an own goal, which upstream files under the side that BENEFITED, so
     the scorer belongs to the other one. */
  function ensure(pid, name, eventTeamID, ownGoal) {
    if (!pid) return null;
    if (rows[pid]) {
      if (!rows[pid].name && name) rows[pid].name = name;
      return rows[pid];
    }
    let teamID = eventTeamID;
    if (ownGoal) {
      const o = otherSide(eventTeamID);
      teamID = o ? o.id : null;
    }
    rows[pid] = base(pid, name, teamID);
    return rows[pid];
  }

  (detail.subs || []).forEach((s) => {
    const m = clampMinute(s.minute, length);
    const on = ensure(s.playerOnID, s.playerOnName, s.teamID, false);
    if (on) {
      if (on.role === 'unused' || on.role === 'unlisted') on.role = 'sub';
      on.on = m;
    }
    const off = ensure(s.playerOffID, s.playerOffName, s.teamID, false);
    if (off) off.off = m;
  });

  (detail.goals || []).forEach((g) => {
    const r = ensure(g.playerID, g.playerName, g.teamID, !!g.isOwnGoal);
    if (!r) return;
    if (g.isOwnGoal) { r.ownGoals += 1; return; }
    r.goals += 1;
    if (g.isPenalty) r.penalties += 1;
  });

  (detail.bookings || []).forEach((b) => {
    const r = ensure(b.playerID, b.playerName, b.teamID, false);
    if (!r) return;
    if (isRed(b)) {
      r.red += 1;
      const m = clampMinute(b.minute, length);
      if (m != null && (r.sentOff == null || m < r.sentOff)) r.sentOff = m;
    } else if (isYellow(b)) {
      r.yellow += 1;
    }
  });

  /* Minutes last, once every on/off/dismissal is known. A player who came on
     and went off again has both; one dismissed has his clock stopped at the
     red. An unlisted player's minutes are unknowable and stay null. */
  Object.values(rows).forEach((r) => {
    if (r.role === 'unused') { r.minutes = 0; return; }
    let from = null;
    if (r.role === 'start') from = 0;
    else if (r.role === 'sub') from = r.on;
    if (from == null) { r.minutes = null; return; }
    let to = length;
    if (r.off != null && r.off >= from) to = r.off;
    if (r.sentOff != null && r.sentOff >= from && r.sentOff < to) to = r.sentOff;
    r.minutes = Math.max(0, to - from);
  });

  const xi = (s) => s.lineup && s.lineup.start && s.lineup.start.length >= 11;
  return { rows, complete: Boolean(xi(detail.home) && xi(detail.away)), length };
}

/**
 * The per-match ledger entry. `pids` lets a re-run delete rows for players who
 * have since been removed from a corrected team sheet, rather than leaving a
 * phantom appearance behind.
 */
function ledgerEntry(detail, built, now, attempts) {
  return {
    matchID: detail.id,
    compKey: detail.compKey,
    ko: detail.ko,
    home: detail.home ? { id: String(detail.home.id), name: detail.home.name, score: detail.home.score } : null,
    away: detail.away ? { id: String(detail.away.id), name: detail.away.name, score: detail.away.score } : null,
    complete: built.complete,
    playerCount: Object.keys(built.rows).length,
    pids: Object.keys(built.rows).reduce((o, k) => { o[k] = true; return o; }, {}),
    attempts: attempts,
    writtenAt: now,
  };
}

/* ---- Retry bookkeeping (pure, so the closing rules are testable) ----------

   Two different reasons a match is not complete, and they get different
   treatment on an OLD day (past the retry window):
     - fetched, but a team sheet is missing → one look is enough; a sheet that
       has not appeared in a week is not coming;
     - the fetch itself failed (lastError set) → try MAX_FAILED_ATTEMPTS times,
       spaced by the retry interval, so a transient outage during the season
       backfill cannot close a day on matches it never read.
   A failure writes a ledger entry too, which is what stops a broken match
   being refetched every hour for ever: the retry interval applies to it. */
const MAX_FAILED_ATTEMPTS = 3;

function isDue(ledger, now, retryMs) {
  if (!ledger) return true;
  if (ledger.complete) return false;
  return now - (ledger.writtenAt || 0) >= retryMs;
}

function failureLedger(prev, matchID, compKey, now, message) {
  return Object.assign({}, prev || {}, {
    matchID: matchID,
    compKey: compKey,
    complete: false,
    attempts: ((prev && prev.attempts) || 0) + 1,
    writtenAt: now,
    lastError: String(message || 'unknown').slice(0, 200),
  });
}

/* ledgers: { matchID: entry|null } for every FINISHED match of the day. */
function dayClosed(ledgers, matchIDs, ymd, giveUpBefore) {
  const all = matchIDs.map((id) => ledgers[id] || null);
  if (all.every((l) => l && l.complete)) return true;
  if (!(ymd < giveUpBefore)) return false;
  return all.every((l) => l && (l.complete || !l.lastError ||
    (l.attempts || 0) >= MAX_FAILED_ATTEMPTS));
}

/* The retry cut-off is a UTC calendar date, matching the {ymd} the calendar
   and the day lists use. */
function ymdMinusDays(ymd, days) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

module.exports = { buildPlayerRows, ledgerEntry, hasExtraTime, ymdMinusDays,
  isDue, failureLedger, dayClosed, MAX_FAILED_ATTEMPTS,
  REGULATION, WITH_EXTRA_TIME };
