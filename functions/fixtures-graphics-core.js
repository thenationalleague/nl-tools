/**
 * The deciding half of fixtures-graphics-trigger.js, kept free of Firebase
 * so tests/fixtures-graphics-trigger.test.mjs can load it on its own.
 * Version: v1.0 (09/10/2026)
 */

"use strict";

const crypto = require("crypto");

const QUIET_MS = 5 * 60 * 1000;      // wait after the last change
const FOLLOW_UP_MS = 15 * 60 * 1000; // between asks for the same scores
const ASKS = 3;                       // the first ask and two follow-ups

function ukDate(now) {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
/* NLS season = first year; it turns over in July. */
function seasonOf(ymd) {
  const [y, m] = ymd.split("-").map(Number);
  return m >= 7 ? y : y - 1;
}

const ENDED = ["fulltime", "postmatch", "abandoned", "postponed"];
/* Every ended game with what it would print. A game still being played is
   left out, so a goal mid-game changes nothing. */
function fingerprint(matches) {
  const parts = [];
  for (const m of matches || []) {
    const a = m.attributes || {};
    const period = String(a.matchPeriod || "").toLowerCase();
    if (!ENDED.includes(period)) continue;
    const h = a.homeTeam || {}, w = a.awayTeam || {};
    parts.push([m.id, period === "postmatch" ? "fulltime" : period,
      h.score, w.score, h.penaltyScore, w.penaltyScore].join(":"));
  }
  if (!parts.length) return "";
  parts.sort();
  return crypto.createHash("sha1").update(parts.join("\n")).digest("hex").slice(0, 16);
}

/* What to do this tick, from the fingerprint now and the saved state.
   Returns { write: newState|null, dispatch: bool }. */
function decide(fp, state, now) {
  const s = state || {};
  if (!fp) return { write: null, dispatch: false };
  if (fp !== s.fp) {
    return { write: { ...s, fp, changedAt: now }, dispatch: false };
  }
  if (now - (s.changedAt || 0) < QUIET_MS) return { write: null, dispatch: false };
  if (fp !== s.dispatchedFp) {
    return { write: { ...s, dispatchedFp: fp, dispatchedAt: now, asks: 1 }, dispatch: true };
  }
  if ((s.asks || 0) < ASKS && now - (s.dispatchedAt || 0) >= FOLLOW_UP_MS) {
    return { write: { ...s, dispatchedAt: now, asks: (s.asks || 0) + 1 }, dispatch: true };
  }
  return { write: null, dispatch: false };
}

module.exports = { fingerprint, decide, ukDate, seasonOf, QUIET_MS, FOLLOW_UP_MS, ASKS };
