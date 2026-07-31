#!/usr/bin/env node
/*
  build-match-hub-round.js — regenerate the Match Hub __DATA__ block for ANY
  completed matchday, straight from NLS (the authoritative source) + the
  repo's clubs-meta.json + the all-time results master (h2h).

  Usage:
    node scripts/build-match-hub-round.js --date 2026-03-21            # print block to stdout
    node scripts/build-match-hub-round.js --date 2026-03-21 --patch    # splice into embeds/match-hub.html
    node scripts/build-match-hub-round.js --date 2025-11-08 --comp north
  Options:
    --comp nl|north|south   competition (default nl)
    --season YYYY           override the derived seasonID (first year of season)
    --light                 skip per-match history detail fetches — loses
                            scorer tallies/streaks, late-goal identity and
                            referee card rates, but is ~450 requests cheaper
    --cache DIR             HTTP cache dir (default: .mh-cache in os tmpdir);
                            safe to delete, makes re-runs near-instant
    --out FILE              write the block to FILE instead of stdout
    --patch                 replace the BEGIN/END __DATA__ block (and the
                            footer replay date) in embeds/match-hub.html

  Emits the same shape the hub already consumes — clubs (with pos, form
  streaks, home/away split streaks, ident.cs / ident.late), prior standings,
  and fixtures (att, ref, refY, h2h, events with pen/og/sec/cameo/strk/tally).
  Field-shape reference: the nls-data-structure notes; API is public, no auth.

  NOTE data policy: this emits FOOTBALL data (public sports results), no
  personal data beyond players' public match records — same as the site.
*/
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const API = "https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2";
const META_URL = "https://raw.githubusercontent.com/thenationalleague/tools/main/assets/data/clubs-meta.json";
const ALLTIME_URL = "https://raw.githubusercontent.com/thenationalleague/site/main/results.json";
const COMPS = { nl: { id: 89, name: "National League", div: "National" },
                north: { id: 373, name: "National League North", div: "North" },
                south: { id: 372, name: "National League South", div: "South" } };

// ---- CLI ------------------------------------------------------------------
const args = {};
process.argv.slice(2).forEach((a, i, arr) => {
  if (a.startsWith("--")) args[a.slice(2)] = (arr[i + 1] && !arr[i + 1].startsWith("--")) ? arr[i + 1] : true;
});
const DATE = args.date;
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) {
  console.error("Required: --date YYYY-MM-DD (a completed matchday). See header for options.");
  process.exit(1);
}
const COMP = COMPS[args.comp || "nl"];
if (!COMP) { console.error("--comp must be nl|north|south"); process.exit(1); }
// season = first year of the campaign (Aug–Dec → same year, Jan–Jul → previous)
const SEASON = args.season ? String(args.season)
  : String(Number(DATE.slice(0, 4)) - (Number(DATE.slice(5, 7)) <= 6 ? 1 : 0));
const LIGHT = !!args.light;
const CACHE_DIR = typeof args.cache === "string" ? args.cache : path.join(os.tmpdir(), ".mh-cache");
const REPO = path.resolve(__dirname, "..");
const HUB = path.join(REPO, "embeds", "match-hub.html");

// ---- fetch with disk cache ------------------------------------------------
fs.mkdirSync(CACHE_DIR, { recursive: true });
async function getJSON(url, { cacheable = true } = {}) {
  const key = path.join(CACHE_DIR, crypto.createHash("sha1").update(url).digest("hex") + ".json");
  if (cacheable && fs.existsSync(key)) return JSON.parse(fs.readFileSync(key, "utf8"));
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const j = await res.json();
  if (cacheable) fs.writeFileSync(key, JSON.stringify(j));
  return j;
}
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const n = i++; out[n] = await fn(items[n], n); }
  }));
  return out;
}

// ---- helpers --------------------------------------------------------------
const norm = s => (s || "").replace(" ", "T");
const dateOf = m => (m.attributes.kickOffDateUTC || "").slice(0, 10);
const isFT = m => ["fulltime", "postmatch"].includes((m.attributes.matchPeriod || "").toLowerCase());
// "45'+3" → 48, "90'+8" → 98, "12'" → 12
function evMin(w) {
  const f = String(w.formattedEventTime || "");
  const m = /^(\d+)'(?:\+(\d+))?/.exec(f);
  if (m) return Number(m[1]) + (m[2] ? Number(m[2]) : 0);
  return Number(w.eventMinute || w.eventTime || 0);
}
const pname = p => { const n = (p && p.playerName) || {}; return n.knownName || n.customKnownName || [n.firstName, n.lastName].filter(Boolean).join(" ") || "Unknown"; };
const seasonStartYear = s => Number(String(s).slice(0, 4)); // "2003-04" → 2003

// ---- main -----------------------------------------------------------------
(async function main() {
  console.error(`Match Hub round build — ${COMP.name}, ${DATE} (season ${SEASON})${LIGHT ? " [light]" : ""}`);

  // 1) clubs-meta: local checkout first, raw URL fallback
  let meta;
  const localMeta = path.join(REPO, "assets", "data", "clubs-meta.json");
  meta = fs.existsSync(localMeta) ? JSON.parse(fs.readFileSync(localMeta, "utf8")) : await getJSON(META_URL);
  const byOpta = {}; meta.clubs.forEach(c => { if (c.optaID) byOpta[c.optaID] = c; });

  // 2) season match list (paginated)
  let matches = [], url = `${API}/matches/?competitionID=${COMP.id}&seasonID=${SEASON}&sort=-kickOffDateUTC&page.number=1&page.size=100`;
  while (url) {
    const j = await getJSON(url, { cacheable: false });   // list changes as season runs — never cache
    matches = matches.concat(j.data || []);
    url = j.links && j.links.next;
  }
  const round = matches.filter(m => dateOf(m) === DATE && isFT(m));
  const history = matches.filter(m => dateOf(m) < DATE && isFT(m))
    .sort((a, b) => norm(a.attributes.kickOffDateUTC) < norm(b.attributes.kickOffDateUTC) ? -1 : 1);
  if (!round.length) { console.error(`No completed ${COMP.name} matches on ${DATE}.`); process.exit(1); }
  console.error(`Round: ${round.length} fixtures · history before date: ${history.length} matches`);

  // 3) prior table + form streaks + home/away splits + clean-sheet drought
  const rows = {}, seq = {};   // seq[team] = chronological [{ha,gf,ga}]
  const touch = k => { rows[k] = rows[k] || { P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, Pts: 0 }; seq[k] = seq[k] || []; };
  history.forEach(m => {
    const a = m.attributes, h = a.homeTeam.teamID, w = a.awayTeam.teamID;
    const hs = a.homeTeam.score, as = a.awayTeam.score;
    if (hs == null || as == null) return;
    touch(h); touch(w);
    [[h, hs, as, "h"], [w, as, hs, "a"]].forEach(([k, gf, ga, ha]) => {
      const r = rows[k]; r.P++; r.GF += gf; r.GA += ga;
      if (gf > ga) { r.W++; r.Pts += 3; } else if (gf === ga) { r.D++; r.Pts++; } else r.L++;
      seq[k].push({ ha, gf, ga });
    });
  });
  const table = Object.keys(rows).map(k => ({ k, ...rows[k], GD: rows[k].GF - rows[k].GA }))
    .sort((x, y) => y.Pts - x.Pts || y.GD - x.GD || y.GF - x.GF ||
      ((byOpta[x.k] || {}).name || x.k).localeCompare((byOpta[y.k] || {}).name || y.k));
  const pos = {}; table.forEach((r, i) => { pos[r.k] = i + 1; });

  function streaks(games) {   // trailing streak counts over a result sequence
    let wins = 0, losses = 0, winless = 0, unbeaten = 0;
    for (let i = games.length - 1; i >= 0; i--) { if (games[i].gf > games[i].ga) wins++; else break; }
    for (let i = games.length - 1; i >= 0; i--) { if (games[i].gf < games[i].ga) losses++; else break; }
    for (let i = games.length - 1; i >= 0; i--) { if (games[i].gf <= games[i].ga) winless++; else break; }
    for (let i = games.length - 1; i >= 0; i--) { if (games[i].gf >= games[i].ga) unbeaten++; else break; }
    return { wins, losses, winless, unbeaten };
  }
  const clubCalc = {};
  Object.keys(seq).forEach(k => {
    const all = streaks(seq[k]);
    const home = streaks(seq[k].filter(g => g.ha === "h"));
    const away = streaks(seq[k].filter(g => g.ha === "a"));
    let cs = 0; for (let i = seq[k].length - 1; i >= 0; i--) { if (seq[k][i].ga > 0) cs++; else break; }
    clubCalc[k] = { ...all,
      split: { hWinless: home.winless, hUnbeaten: home.unbeaten, aWinless: away.winless, aUnbeaten: away.unbeaten },
      ident: { cs } };
  });

  // 4) history details (unless --light): scorer tallies + streaks, late-goal
  //    identity, referee card rates. Cached, so re-runs cost nothing.
  const tallies = {};       // teamID -> playerID -> season goals (chronological)
  const scoredIn = {};      // teamID -> [Set(playerID) per match, chronological]
  const lateCount = {}, goalCount = {};   // per credited team
  const refCards = {};      // referee -> {y, games}
  if (!LIGHT) {
    console.error(`Fetching ${history.length} history match details (cached)…`);
    const details = await mapLimit(history, 8, m => getJSON(`${API}/matches/${m.id}`).catch(() => null));
    details.forEach(d => {
      if (!d || !d.data) return;
      const at = d.data.attributes, teams = at.matchTeams || [];
      const ref = (at.matchDetails && at.matchDetails.refereeName) || at.refereeName;
      if (ref) { refCards[ref] = refCards[ref] || { y: 0, games: 0 }; refCards[ref].games++; }
      teams.forEach(t => {
        const scorers = new Set();
        (t.events && t.events.goals || []).forEach(w => {
          const g = w.goalEvents; if (!g) return;
          const own = String(g.goalType || "").toLowerCase().includes("own");
          const creditTeam = t.teamID;               // goals sit under the benefiting team
          goalCount[creditTeam] = (goalCount[creditTeam] || 0) + 1;
          if (evMin(w) >= 75) lateCount[creditTeam] = (lateCount[creditTeam] || 0) + 1;
          if (!own && g.playerID) {
            tallies[creditTeam] = tallies[creditTeam] || {};
            tallies[creditTeam][g.playerID] = (tallies[creditTeam][g.playerID] || 0) + 1;
            scorers.add(g.playerID);
          }
        });
        (t.events && t.events.bookings || []).forEach(w => {
          const b = w.bookingEvents; if (!b) return;
          if (ref && String(b.card || b.cardType || "").toLowerCase() === "yellow") refCards[ref].y++;
        });
        scoredIn[t.teamID] = scoredIn[t.teamID] || [];
        scoredIn[t.teamID].push(scorers);
      });
    });
  }

  // 5) all-time h2h — entity-matched, ALL divisions of the file ("in the
  //    National League" = the whole organisation), every meeting strictly
  //    before DATE, supplemented with this season's NLS meetings the file
  //    may not carry yet (deduped by date).
  let alltime = null;
  try { alltime = await getJSON(ALLTIME_URL); }
  catch (e) { console.error("WARN: all-time results unreachable — h2h from this season's NLS results only. " + e.message); }
  function h2hFor(homeName, awayName, homeID, awayID) {
    let p = 0, hw = 0, aw = 0, d = 0, f = null, l = null, lr = null, lastDate = "";
    const seenDates = new Set();
    function add(todaysHomeIsHome, hg, ag, yr, date) {
      p++;
      f = f == null ? yr : Math.min(f, yr); l = l == null ? yr : Math.max(l, yr);
      const drew = hg === ag, homeWon = hg > ag;
      const thw = drew ? null : (todaysHomeIsHome ? homeWon : !homeWon);
      if (drew) d++; else if (thw) hw++; else aw++;
      if (date >= lastDate) { lastDate = date; lr = drew ? "D" : (thw ? "H" : "A"); }
    }
    if (alltime) (alltime.seasons || []).forEach(s => {
      const yr = seasonStartYear(s.season);
      Object.values(s.divisions || {}).forEach(div => {
        (div.matches || []).forEach(m => {
          const he = m.home_entity || m.home, ae = m.away_entity || m.away;
          const fwd = he === homeName && ae === awayName, rev = he === awayName && ae === homeName;
          if (!fwd && !rev) return;
          if (!m.date || m.date >= DATE) return;
          seenDates.add(m.date);
          add(fwd, m.home_goals, m.away_goals, yr, m.date);
        });
      });
    });
    history.forEach(m => {
      const a = m.attributes, hID = a.homeTeam.teamID, aID = a.awayTeam.teamID;
      const fwd = hID === homeID && aID === awayID, rev = hID === awayID && aID === homeID;
      if (!fwd && !rev) return;
      const dte = dateOf(m);
      if (seenDates.has(dte)) return;
      const hs = a.homeTeam.score, as = a.awayTeam.score;
      if (hs == null || as == null) return;
      add(fwd, hs, as, Number(SEASON), dte);
    });
    return p ? { p, hw, aw, d, f, l, lr } : (alltime ? { p: 0 } : null);
  }

  // 6) round fixtures — detail per match, events enriched
  console.error("Fetching round match details…");
  const roundDetails = await mapLimit(round, 6, m => getJSON(`${API}/matches/${m.id}`));
  const usedTeams = new Set();
  const fixtures = roundDetails.map(d => {
    const at = d.data.attributes, teams = at.matchTeams || [];
    const homeID = at.homeTeamID, awayID = at.awayTeamID;
    const home = teams.find(t => t.teamID === homeID), away = teams.find(t => t.teamID === awayID);
    if (!home || !away) throw new Error(`Cannot resolve home/away for ${at.matchID}`);
    usedTeams.add(homeID); usedTeams.add(awayID);
    const events = [];
    teams.forEach(t => {
      const other = t === home ? away : home;
      const subOnAt = {};   // playerID -> minute they came on
      (t.events && t.events.subs || []).forEach(w => {
        const s = w.substitutionEvents; if (s && s.subOnID) subOnAt[s.subOnID] = evMin(w);
      });
      (t.events && t.events.goals || []).forEach((w, gi) => {
        const g = w.goalEvents; if (!g) return;
        const type = String(g.goalType || "").toLowerCase();
        const own = type.includes("own"), pen = type.includes("pen");
        const min = evMin(w);
        // engine convention: OGs carry the CULPRIT's team + og:true (the
        // benefiting side is derived); normal goals carry the scoring team
        const ev = { min, type: "goal", team: own ? other.teamID : t.teamID, name: pname(g.player) };
        if (own) ev.og = true;
        if (pen) ev.pen = true;
        if (!own && g.playerID) {
          // came off the bench? (the culprit's bench for OGs is irrelevant)
          const onAt = subOnAt[g.playerID];
          if (onAt != null && onAt <= min) ev.cameo = onAt;
          if (!LIGHT) {
            const before = (tallies[t.teamID] || {})[g.playerID] || 0;
            const already = events.filter(e => e.type === "goal" && !e.og && e.team === t.teamID && e.name === ev.name).length;
            ev.tally = before + already + 1;
            // scored in N straight team games (ending today)
            const hist = scoredIn[t.teamID] || [];
            let strk = 1;
            for (let i = hist.length - 1; i >= 0; i--) { if (hist[i].has(g.playerID)) strk++; else break; }
            if (strk >= 2) ev.strk = strk;
          }
        }
        events.push(ev);
      });
      (t.events && t.events.bookings || []).forEach(w => {
        const b = w.bookingEvents; if (!b) return;
        const card = String(b.cardType || b.card || "").toLowerCase();
        if (!card.includes("red") && card !== "secondyellow") return;
        const ev = { min: evMin(w), type: "red", team: t.teamID, name: pname(b.player) };
        if (card === "secondyellow") ev.sec = true;
        events.push(ev);
      });
    });
    events.sort((a, b) => a.min - b.min);
    const ref = (at.matchDetails && at.matchDetails.refereeName) || at.refereeName || null;
    const rc = ref && refCards[ref];
    // events must reconcile to the FT score — a mismatch means NLS event data
    // is missing/partial for this match (known gap; see nls-data-structure)
    const hCalc = events.filter(e => e.type === "goal" && ((e.team === homeID) !== !!e.og)).length;
    const aCalc = events.filter(e => e.type === "goal" && !((e.team === homeID) !== !!e.og)).length;
    if (hCalc !== home.score || aCalc !== away.score)
      console.error(`WARN ${at.matchID}: events give ${hCalc}-${aCalc} but FT is ${home.score}-${away.score} — NLS event data incomplete?`);
    const hMeta = byOpta[homeID] || {}, aMeta = byOpta[awayID] || {};
    const ko = norm(at.kickOffUTC || "") + "Z";
    const slot = new Date(ko).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
    const fx = {
      gc: at.matchID, home: homeID, away: awayID, hs: home.score, as: away.score,
      date: ko, slot: slot, pp: false,
      att: (at.matchDetails && at.matchDetails.attendance) || null, ref: ref,
      h2h: h2hFor(hMeta.name || "", aMeta.name || "", homeID, awayID)
    };
    if (rc && rc.games >= 5) fx.refY = Math.round(rc.y / rc.games * 10) / 10;
    fx.events = events;
    return fx;
  }).sort((a, b) => a.date.localeCompare(b.date) ||
    ((byOpta[a.home] || {}).name || "").localeCompare((byOpta[b.home] || {}).name || ""));

  // 7) clubs block — everyone in the prior table OR playing today
  Object.keys(pos).forEach(k => usedTeams.add(k));
  const clubs = {};
  Array.from(usedTeams).forEach(k => {
    const c = byOpta[k];
    if (!c) { console.error(`WARN: ${k} not in clubs-meta — using placeholder identity`); }
    const calc = clubCalc[k] || { wins: 0, losses: 0, winless: 0, unbeaten: 0, split: {}, ident: { cs: 0 } };
    const ident = { cs: calc.ident.cs };
    if (!LIGHT && goalCount[k]) ident.late = Math.round((lateCount[k] || 0) / goalCount[k] * 100) / 100;
    clubs[k] = {
      name: c ? c.name : k, short: c ? (c.short || c.name) : k, nick: c ? (c.nickname || c.short) : k,
      lat: c ? c.lat : 53, lng: c ? c.lng : -2,
      venue: c ? (c.stadium_sponsor_name || c.stadium_name || c.short) : k,
      col: { p: c && c.colors ? c.colors.primary : "#666", s: c && c.colors ? c.colors.secondary : "#fff", t: c && c.colors ? (c.colors.tertiary || "#fff") : "#fff" },
      pos: pos[k] || null,
      winless: calc.winless, unbeaten: calc.unbeaten, wins: calc.wins, losses: calc.losses,
      split: calc.split, ident: ident
    };
  });

  // 8) matchday number = modal games-played + 1; season label from meta
  const played = table.map(r => r.P);
  const roundNo = played.length ? (played.sort((a, b) => a - b)[Math.floor(played.length / 2)] + 1) : 1;
  const seasonLabel = (meta.seasons && meta.seasons.list && meta.seasons.list[SEASON] && meta.seasons.list[SEASON].label) ||
    `${SEASON}-${String(Number(SEASON) + 1).slice(2)}`;

  // 9) gb outline — reuse the one already shipped in the hub (it's static)
  const hubSrc = fs.readFileSync(HUB, "utf8");
  // capture the outer array's full contents (inner pairs contain `],` at line
  // ends, so anchor on the `]` that is followed by the outer `],`)
  const gbMatch = /gb:\s*\[([\s\S]*?\])\s*\]\s*,/.exec(hubSrc);
  if (!gbMatch) throw new Error("Could not find the gb outline in embeds/match-hub.html");

  // ---- emit ---------------------------------------------------------------
  const jf = o => JSON.stringify(o);
  const priorOut = {}; table.forEach(r => { priorOut[r.k] = { P: r.P, W: r.W, D: r.D, L: r.L, GF: r.GF, GA: r.GA, Pts: r.Pts }; });
  let out = "";
  out += `window.__DATA__ = {\n`;
  out += `  round: ${roundNo},\n  season: ${jf(seasonLabel)},\n  competition: ${jf(COMP.name)},\n\n`;
  out += `  /* England + Wales outline — real coastline (Natural Earth). */\n  gb: [${gbMatch[1]}],\n\n`;
  out += `  /* Club identity + form (generated ${new Date().toISOString().slice(0, 10)} for ${DATE}). */\n  clubs: {\n`;
  out += Object.keys(clubs).map(k => `    ${k}:${jf(clubs[k])}`).join(",\n") + "\n  },\n\n";
  out += `  /* Standings BEFORE this matchday (drives the FT re-sort + stakes maths). */\n  prior: {\n`;
  out += Object.keys(priorOut).map(k => `    ${k}:${jf(priorOut[k])}`).join(",\n") + "\n  },\n\n";
  out += `  /* ${COMP.name} — ${DATE}: fixtures + events from NLS match detail. */\n  fixtures: [\n`;
  out += fixtures.map(f => {
    const { events, ...head } = f;
    return `    { ${Object.entries(head).map(([k, v]) => `${k}:${jf(v)}`).join(", ")},\n      events:[${events.map(jf).join(",")}] }`;
  }).join(",\n") + "\n  ]\n};\n";

  if (args.patch) {
    const patched = hubSrc.replace(
      /(\/\* BEGIN __DATA__ \*\/\n)[\s\S]*?(\/\* END __DATA__ \*\/)/,
      `$1${out}$2`);
    if (patched === hubSrc) throw new Error("BEGIN/END __DATA__ markers not found — not patched.");
    const dt = new Date(DATE + "T12:00:00Z");
    const nice = dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(/,/g, "");
    const patched2 = patched.replace(/(<span id="nlhFootDate">)[^<]*(<\/span>)/, `$1${nice}$2`);
    fs.writeFileSync(HUB, patched2);
    console.error(`Patched ${path.relative(REPO, HUB)} — round ${roundNo}, ${fixtures.length} fixtures. Bump NL_CHANGELOG/BUILD before shipping.`);
  } else if (typeof args.out === "string") {
    fs.writeFileSync(args.out, out);
    console.error(`Wrote ${args.out}`);
  } else {
    process.stdout.write(out);
  }
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
