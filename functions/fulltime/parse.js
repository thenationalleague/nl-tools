/**
 * fulltime/parse.js — the pure half of the Full-Time ingester: HTML → rows,
 * URL building, and the fetch-then-parse step with the fetcher injected.
 * No dependencies, no Firebase, so tests/fulltime.test.mjs can load it
 * directly against the saved pages in tests/fixtures/fulltime/.
 * The orchestration (schedule, trigger, RTDB writes) is in ../fulltime.js.
 */
'use strict';

const SEASON = '395289686';   /* 2026-27 — changes yearly, here and in app.js */
const BASE = 'https://fulltime.thefa.com';
const TIMEOUT_MS = 20000;

/* key = the tool's division key; ft = Full-Time selectedDivision. Duplicated
   in graphics/academy-alliance/app.js; tests/fulltime.test.mjs keeps them equal. */
const DIVISIONS = [
  { key: 'academy-north', ft: '355815748' },
  { key: 'academy-south', ft: '681316394' },
  { key: 'alliance-a',    ft: '308197696' },
  { key: 'alliance-b',    ft: '531392282' },
  { key: 'alliance-c',    ft: '484327210' },
  { key: 'alliance-d',    ft: '900324610' },
  { key: 'alliance-e',    ft: '996619526' },
  { key: 'alliance-f',    ft: '86586371'  },
  { key: 'alliance-g',    ft: '637572765' },
  { key: 'alliance-h',    ft: '272864635' },
  { key: 'alliance-i',    ft: '421309651' },
];

// ---------------------------------------------------------------------------
// Parsing — pure, tested
// ---------------------------------------------------------------------------

function text(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function cells(tr) {
  return [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => text(m[1]));
}
/* "09/09/26" → "2026-09-09". Full-Time prints two-digit years. */
function isoDate(ddmmyy) {
  const m = String(ddmmyy || '').match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!m) return '';
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return y + '-' + m[2] + '-' + m[1];
}
function score(s) {
  const m = String(s || '').match(/^(\d{1,3})\s*-\s*(\d{1,3})$/);
  return m ? { hs: m[1], as: m[2] } : null;
}

/* table.html → [{ pos, team, p, w, d, l, f, a, gd, pts, adj }]
   The standings table carries Home / Away / Overall splits: 20 cells per row
   (pos, team, P, then 5 home, 5 away, 5 overall, GD, PTS). The graphic wants
   the overall figures. A points adjustment prints as "3 *" in the PTS cell. */
function parseTable(html) {
  const i = html.indexOf('league-standings-table');
  if (i < 0) return [];
  const body = html.slice(i);
  const out = [];
  for (const m of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const c = cells(m[1]);
    if (c.length < 20 || !/^\d+$/.test(c[0])) continue;
    const pts = c[19];
    out.push({
      pos: c[0], team: c[1], p: c[2],
      w: c[13], d: c[14], l: c[15], f: c[16], a: c[17],
      gd: c[18], pts: pts.replace(/[^\d-]/g, ''), adj: /\*/.test(pts),
    });
  }
  return out;
}

/* results.html → [{ id, date, time, home, hs, as, away, comp }]
   One <div id="fixture-N"> per result, most recent first. */
function parseResults(html) {
  const i = html.indexOf('results-table-2');
  if (i < 0) return [];
  const body = html.slice(i);
  const out = [];
  const blocks = body.split(/(?=<div id="fixture-\d+")/);
  for (const b of blocks) {
    const id = (b.match(/<div id="fixture-(\d+)"/) || [])[1];
    if (!id) continue;
    const dt = b.match(/datetime-col[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/);
    const home = b.match(/home-team-col[^>]*>[\s\S]*?team-name[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/);
    const away = b.match(/road-team-col[^>]*>[\s\S]*?team-name[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/);
    const sc = b.match(/score-col[^>]*>([\s\S]*?)<\/div>/);
    const comp = b.match(/fg-col[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);
    const s = score(text(sc && sc[1]));
    if (!home || !away || !s) continue;
    out.push({
      id, date: isoDate(text(dt && dt[1])), time: text(dt && dt[2]),
      home: text(home[1]), hs: s.hs, as: s.as, away: text(away[1]),
      comp: text(comp && comp[1]),
    });
  }
  return out;
}

/* fixtures.html → [{ id, date, time, home, away, venue, comp, status }]
   One <tr> per fixture: type, date/time, home, logo, score ("VS"), logo,
   away, venue, competition, status/notes ("Postponed", or blank). */
function parseFixtures(html) {
  const i = html.indexOf('fixtures-table');
  if (i < 0) return [];
  const body = html.slice(i);
  const out = [];
  for (const m of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tr = m[1];
    if (!/displayFixture\.html\?id=/.test(tr)) continue;
    const id = (tr.match(/displayFixture\.html\?id=(\d+)/) || [])[1];
    const c = cells(tr);
    if (c.length < 10) continue;
    const dt = c[1].match(/^(\d{2}\/\d{2}\/\d{2,4})\s*(\d{2}:\d{2})?/);
    out.push({
      id, date: isoDate(dt && dt[1]), time: (dt && dt[2]) || '',
      home: c[2], away: c[6], venue: c[7], comp: c[8], status: c[9] || '',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

function query(ft) {
  return 'selectedSeason=' + SEASON + '&selectedFixtureGroupAgeGroup=0&selectedDivision=' + ft + '&selectedCompetition=0';
}
/* Two candidate URLs per kind: the 100-row paged path, then the plain page.
   The table has no paging. */
function urlsFor(kind, ft) {
  if (kind === 'table') return [BASE + '/table.html?' + query(ft)];
  return [BASE + '/' + kind + '/1/100.html?' + query(ft), BASE + '/' + kind + '.html?' + query(ft)];
}

/* Browser-like headers on purpose: Full-Time sits behind an edge that has
   been seen to answer a bare server fetch with an empty or challenge page
   while the same URL renders in a browser. Every attempt records what came
   back — status, size, redirect target, page title — because "missed" on
   its own tells nobody why. Never logs or stores cookies. */
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-GB,en;q=0.9',
  'cache-control': 'no-cache',
};
function titleOf(html) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 80) : '';
}
/* → { html|null, status, bytes, title, redirected, error } */
async function getHtml(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal, redirect: 'follow' });
    const html = await res.text();
    return { html: res.ok ? html : null, status: res.status, bytes: html.length, title: titleOf(html),
      redirected: res.redirected ? String(res.url).replace(/\?.*$/, '') : '' , error: '' };
  } catch (e) {
    return { html: null, status: 0, bytes: 0, title: '', redirected: '', error: String(e && e.name === 'AbortError' ? 'timeout' : (e && e.message) || e).slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

const PARSERS = { table: parseTable, results: parseResults, fixtures: parseFixtures };

/* One kind for one division: first URL whose page parses to at least one
   row wins. `rows` is null when every candidate failed or parsed empty, so
   the caller keeps the previous good copy rather than blanking the node;
   `tried` says what each candidate answered. A fetcher may return a bare
   string (the tests do) or the { html, status… } record getHtml returns. */
async function fetchKind(kind, ft, get) {
  const tried = [];
  for (const url of urlsFor(kind, ft)) {
    const got = await get(url);
    const rec = (got && typeof got === 'object') ? got : { html: got || null, status: got ? 200 : 0, bytes: got ? got.length : 0, title: titleOf(got), redirected: '', error: '' };
    const rows = rec.html ? PARSERS[kind](rec.html) : [];
    tried.push({ path: url.replace(BASE, '').replace(/\?.*$/, ''), status: rec.status, bytes: rec.bytes, title: rec.title, redirected: rec.redirected, error: rec.error, rows: rows.length });
    if (rows.length) return { rows, tried };
  }
  return { rows: null, tried };
}

async function fetchDivision(div, get) {
  const [table, results, fixtures] = await Promise.all([
    fetchKind('table', div.ft, get),
    fetchKind('results', div.ft, get),
    fetchKind('fixtures', div.ft, get),
  ]);
  return { table: table.rows, results: results.rows, fixtures: fixtures.rows,
    diag: { table: table.tried, results: results.tried, fixtures: fixtures.tried } };
}


module.exports = { parseTable, parseResults, parseFixtures, isoDate, titleOf, urlsFor, getHtml, fetchKind, fetchDivision, DIVISIONS, SEASON, BASE };
