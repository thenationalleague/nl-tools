#!/usr/bin/env node
/*
  fetch-table-baseline.js — capture the OFFICIAL NLS league tables as a
  date-stamped daily baseline, holding full history.

  Why: a matchday's "start of day" table must be locked BEFORE a ball is
  kicked. The scheduled run (01:00 UTC = 1am UK in winter, 2am in summer —
  always after midnight UK, always hours before the earliest kick-off)
  freezes that truth. The official endpoint is authoritative: it carries
  points deductions and (cup) shootout bonus points that arithmetic over
  results cannot reproduce.

  Output: one file per day, assets/data/table-baselines/<YYYY-MM-DD>.json
    {
      "capturedAt": "…", "season": "2026",
      "competitions": {
        "nl":    { "rows": [ { teamID, team, pos, P, W, D, L, GF, GA, Pts } ] },
        "north": { … }, "south": { … },
        "cup":   { "groups": { "A": { "rows": […] }, … } }   // when running
      }
    }
  A same-day rerun overwrites that day's file. Until 14/11/2026 every day went
  into one growing file (2.8 MB by then) that was committed again each night,
  so git kept a full copy per day. A file per day is written once and never
  touched again: about 9 KB a day. Readers only ever want one date, so they
  fetch that file. Form, start-of-day position and goal difference are not
  kept: nothing reads them (GD is GF minus GA).

  Consumers: the Match Hub's live mode seeds its start-of-day table (D.prior)
  from here; over time the archive doubles as the official as-of-date table
  history that no feed otherwise provides. Movement semantics: sdPos
  (startDayPosition) is recorded for completeness but display code derives
  its own movement vs the locked baseline — see match-hub v0.18.1 notes.

  Public football data only — safe to commit (same policy as articles-index).
*/
"use strict";

const fs = require("fs");
const path = require("path");

const API = "https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2";
const REPO = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO, "assets", "data", "table-baselines");
const LEAGUES = { nl: 89, north: 373, south: 372 };
const CUP_ID = 1275, CUP_GROUPS = ["A", "B", "C", "D"];

async function getJSON(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function mapRows(data) {
  return (data || []).filter(r => {
    // an uninitialised table comes back as a single all-null stub row
    // (seen on North/South pre-season) — treat that as "no table yet"
    const a = (r && r.attributes) || {};
    return r && r.id && (a.teamName || a.teamShortName) && a.position != null;
  }).map(r => {
    const a = r.attributes || {};
    return {
      teamID: r.id, team: a.teamName || a.teamShortName || r.id,
      pos: a.position, sdPos: a.startDayPosition,
      P: a.played, W: a.won, D: a.drawn, L: a.lost,
      GF: a.goalsFor, GA: a.goalsAgainst, GD: a.goalDifference,
      Pts: a.points, form: a.form || null
    };
  }).sort((x, y) => (x.pos || 999) - (y.pos || 999));
}

(async function main() {
  // season from the repo's own clubs-meta (single source of truth)
  const meta = JSON.parse(fs.readFileSync(path.join(REPO, "assets", "data", "clubs-meta.json"), "utf8"));
  const season = meta.seasons.current;

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const competitions = {};
  let fetched = 0;

  for (const [key, id] of Object.entries(LEAGUES)) {
    try {
      const j = await getJSON(`${API}/league-tables/?competitionID=${id}&seasonID=${season}`);
      const rows = mapRows(j.data);
      if (rows.length) { competitions[key] = { rows }; fetched++; }
      else console.error(`WARN: ${key} table returned no rows`);
    } catch (e) {
      console.error(`WARN: ${key} table fetch failed — ${e.message}`);
    }
  }

  // cup groups — only present while the cup is running; absence is normal
  const groups = {};
  for (const g of CUP_GROUPS) {
    try {
      const j = await getJSON(`${API}/league-tables/?competitionID=${CUP_ID}&seasonID=${season}&roundID=${g}`);
      const rows = mapRows(j.data);
      if (rows.length) groups[g] = { rows };
    } catch (e) { /* cup group not available — fine */ }
  }
  if (Object.keys(groups).length) { competitions.cup = { groups }; fetched++; }

  if (!fetched) {
    console.error("FAILED: no tables could be fetched — baseline NOT updated.");
    process.exit(1);
  }

  const KEEP = ["teamID", "team", "pos", "P", "W", "D", "L", "GF", "GA", "Pts"];
  const slim = rows => rows.map(r => Object.fromEntries(KEEP.map(k => [k, r[k] === undefined ? null : r[k]])));
  for (const c of Object.values(competitions)) {
    if (c.rows) c.rows = slim(c.rows);
    if (c.groups) for (const g of Object.values(c.groups)) g.rows = slim(g.rows);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `${day}.json`);
  fs.writeFileSync(out, JSON.stringify({ capturedAt: now.toISOString(), season: String(season), competitions }) + "\n");
  console.error(`Baseline captured for ${day} (season ${season}): ${Object.keys(competitions).join(", ")} → ${path.relative(REPO, out)}`);
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
