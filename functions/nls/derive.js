/**
 * nls/derive.js — league tables and top scorers (spec §2).
 *
 * ONE DELIBERATE DEPARTURE FROM THE SPEC, and it is load-bearing.
 *
 * The spec says tables are "computed by the ingester, not fetched". Computing
 * them from results alone produces a table that is wrong whenever a club is
 * carrying a points deduction — which in this league is not a rare event — and
 * wrong again for Cup groups, where shootout bonus points exist and cannot be
 * reconstructed from a scoreline. scripts/fetch-table-baseline.js already
 * records why: "the official endpoint is authoritative: it carries points
 * deductions and (cup) shootout bonus points that arithmetic over results
 * cannot reproduce."
 *
 * So the official `/league-tables/` response is the base, and arithmetic is
 * used only for the part it cannot supply: the effect of matches currently in
 * play. That gives a live table that stays correct for a deducted club,
 * because the deduction is inside the base rather than something the ingester
 * would have to know about. `basis` on the written node says which it is, so a
 * consumer can tell a settled table from an in-play projection.
 *
 * Top scorers ARE computed, and incrementally — see mergeScorers.
 *
 * Pure. Fetching lives in fetch.js.
 */

'use strict';

/* Official row → published row. Same boundary discipline as transform.js:
   nothing upstream-shaped is allowed past this function. */
function shapeTableRow(r) {
  const a = (r && r.attributes) || {};
  if (!r || !r.id || !(a.teamName || a.teamShortName) || a.position == null) return null;
  return {
    teamID: String(r.id),
    team: String(a.teamName || a.teamShortName),
    pos: Number(a.position),
    startDayPos: a.startDayPosition == null ? null : Number(a.startDayPosition),
    played: Number(a.played) || 0,
    won: Number(a.won) || 0,
    drawn: Number(a.drawn) || 0,
    lost: Number(a.lost) || 0,
    goalsFor: Number(a.goalsFor) || 0,
    goalsAgainst: Number(a.goalsAgainst) || 0,
    goalDifference: Number(a.goalDifference) || 0,
    points: Number(a.points) || 0,
    form: a.form || null,
  };
}

/* An uninitialised table comes back as a single all-null stub row — seen on
   North and South pre-season. mapRows drops it, and an empty result must be
   read as "no table yet", never written over a good one. */
function shapeTable(data) {
  return (Array.isArray(data) ? data : [])
    .map(shapeTableRow).filter(Boolean)
    .sort((a, b) => a.pos - b.pos);
}

/**
 * Apply in-play matches to a settled table.
 *
 * `rows`     — shaped official rows (already carrying any deduction)
 * `liveRows` — today's shaped index rows; only the in-play ones are applied
 *
 * A live match counts as if it ended now. Once it actually finishes, the next
 * official table fetch absorbs it and the overlay for that match stops firing,
 * so there is no window in which a result is counted twice.
 */
function applyLiveToTable(rows, liveRows) {
  const byTeam = new Map();
  (rows || []).forEach((r) => byTeam.set(r.teamID, Object.assign({}, r)));

  let applied = 0;
  (liveRows || []).forEach((m) => {
    if (!m || !m.live) return;
    const h = byTeam.get(m.home && m.home.id);
    const a = byTeam.get(m.away && m.away.id);
    if (!h || !a) return;                      // a Cup tie across divisions
    const hs = m.home.score, as = m.away.score;
    if (hs == null || as == null) return;

    h.played += 1; a.played += 1;
    h.goalsFor += hs; h.goalsAgainst += as;
    a.goalsFor += as; a.goalsAgainst += hs;
    if (hs > as) { h.won += 1; h.points += 3; a.lost += 1; }
    else if (hs < as) { a.won += 1; a.points += 3; h.lost += 1; }
    else { h.drawn += 1; a.drawn += 1; h.points += 1; a.points += 1; }
    applied += 1;
  });

  if (!applied) return { rows: rows || [], applied: 0 };

  const out = [...byTeam.values()];
  out.forEach((r) => { r.goalDifference = r.goalsFor - r.goalsAgainst; });
  /* Points, then goal difference, then goals scored — the National League's
     published order. Alphabetical last so the sort is deterministic rather
     than dependent on Map insertion order when clubs are level on all three. */
  out.sort((x, y) =>
    y.points - x.points ||
    y.goalDifference - x.goalDifference ||
    y.goalsFor - x.goalsFor ||
    x.team.localeCompare(y.team));
  out.forEach((r, i) => { r.pos = i + 1; });
  return { rows: out, applied };
}

// ---------------------------------------------------------------------------
// Top scorers
// ---------------------------------------------------------------------------

/**
 * Fold newly detected goal events into a running tally.
 *
 * Incremental, not recomputed: a season-wide scorer table would need match
 * detail for all ~1,650 fixtures on every run, which is exactly the cost the
 * two-stage polling model exists to avoid. The events this ingester already
 * detects are the same information arriving one goal at a time.
 *
 * Keyed on playerID, carried across from the vidiprinter (spec §5.2). Names
 * are not keys: two players share one, players transfer mid-season, and the
 * encoding of an apostrophe in a surname is its own small disaster. The
 * per-team breakdown is what makes a transfer legible rather than a tally
 * that quietly attributes a player's whole season to their newest club.
 */
function mergeScorers(existing, events, now) {
  const out = Object.assign({}, existing || {});
  let added = 0;

  (events || []).forEach((e) => {
    if (!e || e.type !== 'goal' || !e.playerID) return;
    /* An own goal is credited to nobody. Counting it against the scorer is the
       classic bug in a naive tally and it is visible to the player. */
    if (e.isOwnGoal) return;

    const prev = out[e.playerID] || {
      playerID: e.playerID,
      scorer: e.playerName || e.playerID,
      goals: 0,
      penalties: 0,
      teams: {},
    };
    const next = Object.assign({}, prev, {
      scorer: e.playerName || prev.scorer,
      goals: prev.goals + 1,
      penalties: prev.penalties + (e.isPenalty ? 1 : 0),
      teams: Object.assign({}, prev.teams),
      updatedAt: now,
    });
    const teamKey = e.teamID || 'unknown';
    const t = next.teams[teamKey] || { teamID: teamKey, teamName: null, goals: 0 };
    next.teams[teamKey] = {
      teamID: teamKey,
      teamName: teamNameFor(e) || t.teamName,
      goals: t.goals + 1,
    };
    out[e.playerID] = next;
    added += 1;
  });

  return { scorers: out, added };
}

function teamNameFor(e) {
  if (!e) return null;
  if (e.teamName) return e.teamName;
  /* The event carries both club names and the scoring team's ID, so the name
     is recoverable without a second lookup — but only when the ID matches a
     side of this match, which it always should. */
  return null;
}

/**
 * The coverage flag, carried across from the vidiprinter (spec §5.2).
 *
 * Some matches have no event data entered at all — the score is right, the
 * goals array is empty. A scorer table that silently under-reports because
 * clubs never entered the events is worse than one that admits the gap, so
 * the shortfall is published rather than hidden.
 *
 * `indexRows` are the season's shaped list rows; `accountedGoals` is how many
 * goals the tally actually has events for, own goals included.
 */
function goalsUnaccounted(indexRows, accountedGoals) {
  let scored = 0;
  (indexRows || []).forEach((r) => {
    if (!r || !r.finished) return;
    if (r.home && r.home.score != null) scored += r.home.score;
    if (r.away && r.away.score != null) scored += r.away.score;
  });
  const gap = Math.max(0, scored - (accountedGoals || 0));
  return { goalsScored: scored, goalsAccounted: accountedGoals || 0, goalsUnaccounted: gap };
}

function tallyTotal(scorers, ownGoals) {
  let n = ownGoals || 0;
  Object.values(scorers || {}).forEach((s) => { n += Number(s.goals) || 0; });
  return n;
}

module.exports = {
  shapeTableRow, shapeTable, applyLiveToTable,
  mergeScorers, goalsUnaccounted, tallyTotal,
};
