#!/usr/bin/env node
/* ============================================================
   build-fixtures-graphics.js
   Version: v1.3 (09/10/2026)

   Makes the fixtures and results cards that are due, without anyone
   pressing anything. Run by .github/workflows/fixtures-graphics.yml on a
   timer; runnable by hand for testing.

     node scripts/build-fixtures-graphics.js --mode fixtures
     node scripts/build-fixtures-graphics.js --mode results --today 2026-10-03
     node scripts/build-fixtures-graphics.js --mode results --division North --done done.txt

   WHAT IS "DUE"
     fixtures  Two days ahead of today (UK). A round's card is made once, two
               days before the round's FIRST game, and covers every game in
               the round's window (Friday and Sunday games get day dividers).
               A day with games that sits in no round window — a rearranged
               midweek — gets its own card two days before, titled plain
               MATCHDAY.
     results   Today (UK), one card per day per competition, made as soon as
               every game that day is full time or abandoned. Postponed games
               are left off; abandoned ones print A - A. Until the last one
               finishes the run does nothing, so it can be asked often.
     early     A day with a late kick-off (two hours or more after the day's
               usual time — the 17:30 on a 3pm Saturday) gets a card as soon
               as the usual-time games are done, with the late game printed
               "v / 17:30"; the full card follows when it finishes. Card id
               "<date> <Division> Results early", tables likewise.
               --before-late replays a past day as it stood at that point.
     corrected A results card or table already sent whose content has since
               changed (a score corrected after full time) goes again as
               "<id> v2", "v3"… the same day. Each delivered card records a
               fingerprint of what it showed (see --done).
     tables    With every results card: the league's table, or the four Cup
               group tables after a group-stage day. Made only once the
               feed's table has caught up with the scores (games played in
               the table = twice the finished matches to date); until then
               the run says "table not caught up yet" and the next check
               tries again. --no-tables leaves them out; --tables-anyway
               skips the catch-up check, for testing on a past date (the
               table drawn is then today's).

   ROUND NUMBERS come from assets/data/rounds-<season>.json: a date inside a
   round's from–to window prints that round's number, whatever round the
   fixture officially belongs to; outside every window the card says plain
   MATCHDAY (the Cup: GROUP STAGE). A round can carry a "title" to override
   the wording, for the Cup's knockout rounds.

   ONCE ONLY
     --done <file> lists card ids already delivered, one per line, each
     optionally followed by a tab and the fingerprint of what it showed (the
     workflow builds it from what is already in Firebase Storage). A card
     whose id is listed is skipped, unless its fingerprint has changed.
     Card id = output folder name:
       "2026-10-10 National Results"   "2026-10-08 South Fixtures"

   OUTPUT  --out (default build/fixtures-graphics)
     <out>/<card id>/<Division> <Fixtures|Results> <10Oct26> - <1x1|4x5|9x16>.png
     <out>/<card id>/<Label> Table <10Oct26> - <size>.png   e.g. "Cup Group A Table"
     <out>/manifest.json   what was made, held back, skipped, and why
   Output is never committed.

   RENDERING
     Same as scripts/build-match-graphics.js: no dependencies. A local http
     server (Node built-in) serves the repo, headless Chromium opens a small
     page that draws each card with graphics/_shared/fixtures-card.js — the
     renderer the Fixtures & Results tool uses — and posts each PNG back.
     html-to-image is fetched from the same CDN the tool uses, through this
     server, so the page stays same-origin; set H2I_FILE to a local copy to
     render offline.

   CHANGELOG
     v1.3 09/10/2026  Abandoned games count as done and print A - A. Early
                      card for the usual-time games on a day with a late
                      kick-off. Changed results and tables go again as v2, v3.
     v1.2 09/10/2026  League tables after every results card, and Cup group
                      tables A–D in the group stage, drawn by
                      graphics/_shared/table-card.js. A card whose images
                      fail is held back on its own; the others still go.
     v1.1 09/10/2026  A day with no games answers 404; read it as empty rather
                      than failing the run. page.size 1000 + links.next +
                      totalCount check. Season-wide window for populatedDates.
     v1.0 09/10/2026  First version.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const NLS_BASE = process.env.NLS_BASE || 'https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2';
const COMPETITION_ID = { National: 89, North: 373, South: 372, Cup: 1275 };
const DIVISIONS = ['National', 'North', 'South', 'Cup'];
const FORMATS = ['1x1', '4x5', '9x16'];
const H2I_CDN = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js';
const FIXTURES_LEAD_DAYS = 2;

/* ---------- args ---------- */

function parseArgs(argv) {
  const a = { mode: null, division: 'all', today: null, out: path.join(REPO, 'build', 'fixtures-graphics'),
              done: null, formats: FORMATS.slice(), chrome: null, noTables: false, tablesAnyway: false,
              beforeLate: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--mode') a.mode = argv[++i];
    else if (k === '--division') a.division = argv[++i];
    else if (k === '--today') a.today = argv[++i];
    else if (k === '--out') a.out = path.resolve(argv[++i]);
    else if (k === '--done') a.done = argv[++i];
    else if (k === '--format') a.formats = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (k === '--chrome') a.chrome = argv[++i];
    else if (k === '--no-tables') a.noTables = true;
    else if (k === '--tables-anyway') a.tablesAnyway = true;
    else if (k === '--before-late') a.beforeLate = true;
    else if (k === '--help') { console.log('see header'); process.exit(0); }
    else throw new Error(`unknown argument: ${k}`);
  }
  if (!['fixtures', 'results'].includes(a.mode)) throw new Error('--mode must be fixtures or results');
  if (a.division !== 'all' && !DIVISIONS.includes(a.division)) {
    throw new Error(`--division must be all or one of ${DIVISIONS.join(', ')}`);
  }
  for (const f of a.formats) if (!FORMATS.includes(f)) throw new Error(`unknown --format ${f}`);
  if (a.today && !/^\d{4}-\d{2}-\d{2}$/.test(a.today)) throw new Error('--today must be YYYY-MM-DD');
  if (a.beforeLate && !a.today) throw new Error('--before-late is for testing a past date: give --today too');
  return a;
}

/* ---------- dates (UK calendar days as YYYY-MM-DD strings) ---------- */

const ukToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
function addDays(ymd, n) {
  const d = new Date(ymd + 'T12:00:00Z');          // midday: DST-proof
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/* NLS seasonID is the season's first year; the season turns over in July. */
function seasonStart(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  return m >= 7 ? y : y - 1;
}
const seasonLabel = y => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
function shortDate(ymd) {
  const d = new Date(ymd + 'T12:00:00Z');
  return String(d.getUTCDate()).padStart(2, '0') +
    /* 3 letters: newer ICU spells September "Sept" in en-GB. */
    d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }).slice(0, 3) + String(d.getUTCFullYear()).slice(2);
}

/* ---------- rounds ---------- */

function loadRounds(label) {
  const p = path.join(REPO, 'assets', 'data', `rounds-${label}.json`);
  if (!fs.existsSync(p)) {
    console.warn(`  ! no ${path.relative(REPO, p)} — every card will say plain MATCHDAY`);
    return {};
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function roundFor(rounds, division, ymd) {
  return (rounds[division] || []).find(r => r.from <= ymd && ymd <= r.to) || null;
}
/* The header text. League: "13" → MATCHDAY 13, "" → MATCHDAY. The Cup's
   group rounds read "GROUP STAGE – MATCHDAY 3" (breaks at the dash) and a
   group-stage date outside every window reads GROUP STAGE. */
function cardTitle(rounds, division, ymd) {
  const r = roundFor(rounds, division, ymd);
  if (r && r.title) return r.title;
  if (division !== 'Cup') return r ? String(r.round) : '';
  if (r) return `GROUP STAGE – MATCHDAY ${r.round}`;
  const group = rounds.Cup || [];
  const lastGroupDay = group.length ? group[group.length - 1].to : '';
  return ymd <= lastGroupDay ? 'GROUP STAGE' : '';
}

/* ---------- National League Services ---------- */

/* An empty window is a 404, not an empty list. Seen 09/10/2026 on the first
   live run: North on 03/10/2026 (no North games that day) answered 404. So a
   404 is read as "no games" and only other failures are retried. */
async function nls(params) {
  /* A single argument that is a URL (or path) is a links.next to follow. */
  const url = /^(https?:)?\//.test(params[0]) ? new URL(params[0], NLS_BASE + '/').href
                                              : `${NLS_BASE}/matches/?${params.join('&')}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return { data: [], meta: {}, links: {}, empty: true };
      if (!r.ok) throw new Error(`NLS ${r.status}`);
      return await r.json();
    } catch (e) {
      if (attempt >= 3) throw new Error(`${e.message} — ${url}`);
      await new Promise(res => setTimeout(res, 2000 * attempt));
    }
  }
}
/* Days with games this season: meta.populatedDates. Asked over the whole
   season so the window is never empty (an empty one would 404). */
async function populatedDates(season, division) {
  const j = await nls([`seasonID=${season}`, `competitionID=${COMPETITION_ID[division]}`,
    'includePopulatedDates=true',
    `from=${encodeURIComponent(season + '-07-01 00:00:00Z')}`,
    `to=${encodeURIComponent((season + 1) + '-06-30 23:59:59Z')}`,
    'page.number=1', 'page.size=1']);
  const days = Object.keys((j.meta && j.meta.populatedDates) || {}).sort();
  if (!days.length) console.warn(`  ! ${division}: NLS lists no match days for season ${season}`);
  return days;
}
/* page.size: the documented 100 maximum is wrong (a 557-row request is
   proven), so ask for 1000, follow links.next, and check the total against
   meta.totalCount — see the nl-data-feed skill. A window here is a few days,
   so this is one request in practice. */
async function matchesBetween(season, division, from, to) {
  let j = await nls([`seasonID=${season}`, `competitionID=${COMPETITION_ID[division]}`,
    `from=${encodeURIComponent(from + ' 00:00:00Z')}`, `to=${encodeURIComponent(to + ' 23:59:59Z')}`,
    'sort=kickOffDateUTC', 'page.number=1', 'page.size=1000']);
  const rows = (j.data || []).slice();
  const total = j.meta && j.meta.totalCount;
  for (let guard = 0; j.links && j.links.next && guard < 20; guard++) {
    j = await nls([j.links.next]);
    rows.push(...(j.data || []));
  }
  if (typeof total === 'number' && rows.length !== total) {
    throw new Error(`NLS returned ${rows.length} of ${total} matches for ${division} ${from}–${to}`);
  }
  return rows;
}
const period = m => String((m.attributes || {}).matchPeriod || '').toLowerCase();
/* By matchPeriod only — NLS keeps postponementReason on a game after it is
   rearranged (see buildRows in fixtures-card.js). */
const isPostponed = m => period(m) === 'postponed';
const isAbandoned = m => period(m) === 'abandoned';
const isFinished = m => period(m) === 'fulltime' || period(m) === 'postmatch';
const isDone = m => isFinished(m) || isAbandoned(m);

/* ---------- late kick-offs ----------
   The day's usual kick-off is the most common one. A game two hours or
   more after it is late: on a 3pm Saturday the 17:30 is late, a 15:30 is
   not. Kick-off times are read in UK time, the way the card prints them. */
const LATE_GAP_MIN = 120;
function koMinutes(m) {
  const s = String((m.attributes || {}).kickOffDateUTC || '').trim();
  if (!s) return null;
  const d = new Date(s.replace(' ', 'T').replace(/Z?$/, 'Z'));
  if (isNaN(d)) return null;
  const [h, mi] = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit',
    minute: '2-digit', hour12: false }).split(':').map(Number);
  return h * 60 + mi;
}
function splitLate(data) {
  const counts = {};
  let usual = null, most = 0;
  for (const m of data) {
    const k = koMinutes(m);
    if (k == null) continue;
    counts[k] = (counts[k] || 0) + 1;
    if (counts[k] > most || (counts[k] === most && k < usual)) { most = counts[k]; usual = k; }
  }
  if (usual == null) return { early: data, late: [] };
  const late = data.filter(m => koMinutes(m) != null && koMinutes(m) >= usual + LATE_GAP_MIN);
  return { early: data.filter(m => !late.includes(m)), late };
}
/* The early card prints only what is decided. A late game the run catches
   already under way must show "v", not its live score as a result. */
function withoutLiveScores(data) {
  return data.map(m => {
    if (isDone(m)) return m;
    const a = m.attributes || {};
    const blank = t => t ? { ...t, score: null, penaltyScore: null } : t;
    return { ...m, attributes: { ...a, homeTeam: blank(a.homeTeam), awayTeam: blank(a.awayTeam) } };
  });
}

/* ---------- once only, and corrections ----------
   A fingerprint is a short hash of exactly what a card shows: for results,
   every game's score, shootout and state; for a table, every row. A card
   already sent with the same fingerprint is not sent again; a different one
   goes as the next version. A card recorded without a fingerprint (sent
   before v1.3) is never re-sent. */
const crypto = require('crypto');
const hash = parts => crypto.createHash('sha1').update(parts.join('\n')).digest('hex').slice(0, 12);
function resultsSig(data) {
  return hash(data.map(m => {
    const a = m.attributes || {}, h = a.homeTeam || {}, w = a.awayTeam || {};
    return [m.id, period(m), h.score, w.score, h.penaltyScore, w.penaltyScore].join(':');
  }).sort());
}
function tableSig(rows) {
  return hash(rows.map(r => {
    const a = r.attributes || {};
    return [r.id, a.position, a.played, a.won, a.drawn, a.lost, a.goalsFor, a.goalsAgainst, a.points].join(':');
  }));
}
function parseDone(text) {
  const done = new Map();
  for (const line of String(text || '').split('\n')) {
    const [id, sig] = line.split('\t').map(s => (s || '').trim());
    if (id) done.set(id, sig || '');
  }
  return done;
}
/* The id this content should go out under, or null if it already has. */
function versionedId(base, sig, done) {
  let n = 1, last = done.has(base) ? base : null;
  for (let v = 2; done.has(`${base} v${v}`); v++) { n = v; last = `${base} v${v}`; }
  if (!last) return { id: base, version: 1 };
  const was = done.get(last);
  if (!was || was === sig) return null;
  return { id: `${base} v${n + 1}`, version: n + 1 };
}

/* ---------- what is due ---------- */

async function dueCards(args, rounds, season, done) {
  const today = args.today || ukToday();
  const divisions = args.division === 'all' ? DIVISIONS : [args.division];
  const cards = [], skipped = [];

  for (const division of divisions) {
    if (args.mode === 'fixtures') {
      const target = addDays(today, FIXTURES_LEAD_DAYS);
      const days = await populatedDates(season, division);
      if (!days.includes(target)) { skipped.push({ division, reason: `no games on ${target}` }); continue; }
      const r = roundFor(rounds, division, target);
      const cardDays = r ? days.filter(d => r.from <= d && d <= r.to) : [target];
      if (cardDays[0] !== target) {
        skipped.push({ division, reason: `${target} is mid-round — the round's card went out two days before ${cardDays[0]}` });
        continue;
      }
      const data = (await matchesBetween(season, division, cardDays[0], cardDays[cardDays.length - 1]))
        .filter(m => !isPostponed(m) && !isAbandoned(m));
      if (!data.length) { skipped.push({ division, reason: `every game ${cardDays[0]} postponed` }); continue; }
      cards.push({ division, mode: 'fixtures', date: target, days: cardDays,
                   matchday: cardTitle(rounds, division, target), data });
    } else {
      let all = await matchesBetween(season, division, today, today);
      /* --before-late (testing only): replay a past day as it stood when its
         usual-time games had finished and the late ones had not started. */
      if (args.beforeLate) {
        const { late } = splitLate(all.filter(m => !isPostponed(m)));
        all = all.map(m => late.includes(m)
          ? withoutLiveScores([{ ...m, attributes: { ...m.attributes, matchPeriod: 'PreMatch' } }])[0] : m);
      }
      const data = all.filter(m => !isPostponed(m));
      if (!data.length) { skipped.push({ division, reason: `no games on ${today}` }); continue; }
      const card = { kind: 'fixtures', division, mode: 'results', date: today, days: [today],
                     matchday: cardTitle(rounds, division, today), leftOff: all.length - data.length,
                     label: division };
      const live = data.filter(m => !isDone(m));
      if (!live.length) {
        const base = `${today} ${division} Results`;
        const sig = resultsSig(data);
        const v = versionedId(base, sig, done);
        if (!v) { skipped.push({ division, reason: `${base} already delivered, unchanged` }); }
        else {
          cards.push({ ...card, data, id: v.id, sig, version: v.version,
                       suffix: v.version > 1 ? `v${v.version}` : '' });
        }
        if (!args.noTables) cards.push(...await tableCards(division, season, today, rounds, done, skipped, args.tablesAnyway, ''));
        continue;
      }
      const { early, late } = splitLate(data);
      if (late.length && early.every(isDone) && late.some(m => !isDone(m))) {
        const id = `${today} ${division} Results early`;
        if (!done.has(id)) {
          cards.push({ ...card, data: withoutLiveScores(data), id, suffix: 'early', early: true });
        } else skipped.push({ division, reason: `${id} already delivered; waiting for ${live.length} late game(s)` });
        if (!args.noTables) cards.push(...await tableCards(division, season, today, rounds, done, skipped, args.tablesAnyway, 'early'));
        continue;
      }
      skipped.push({ division, reason: `${live.length} of ${data.length} not finished` });
    }
  }

  for (const c of cards) {
    if (!c.id) c.id = `${c.date} ${c.division} Fixtures`;
    if (!c.label) c.label = c.division;
    const kindWord = c.kind === 'table' ? 'Table' : c.mode === 'results' ? 'Results' : 'Fixtures';
    const tail = c.suffix ? ` ${c.suffix}` : '';
    c.files = args.formats.map(f => ({ format: f, file: `${c.label} ${kindWord} ${shortDate(c.date)}${tail} - ${f}.png` }));
  }
  return { today, cards, skipped };
}

/* ---------- league tables ----------
   A table goes out after every results card: same trigger (every game that
   day full time), one per league, and one per group A–D after a Cup
   group-stage day. The feed's table can lag the scores, so a table is only
   made once it has caught up: the games played across the table(s) must
   equal twice the finished matches to date. Until then the run says so and
   the next check tries again. */
const CUP_GROUPS = ['A', 'B', 'C', 'D'];
async function leagueTable(season, division, group) {
  const j = await nls([`${NLS_BASE}/league-tables/?competitionID=${COMPETITION_ID[division]}` +
    `&seasonID=${season}` + (group ? `&roundID=${group}` : '')]);
  return j.data || [];
}
async function tableCards(division, season, today, rounds, done, skipped, anyway, stage) {
  const groups = division === 'Cup' ? CUP_GROUPS : [null];
  const label = g => g ? `Cup Group ${g}` : division;
  const id = g => `${today} ${label(g)} Table` + (stage ? ` ${stage}` : '');
  if (division === 'Cup') {
    const group = rounds.Cup || [];
    const lastGroupDay = group.length ? group[group.length - 1].to : '';
    if (!lastGroupDay || today > lastGroupDay) {
      skipped.push({ division, reason: 'no Cup tables after the group stage' });
      return [];
    }
  }
  /* An early table goes once. The day's table is checked again on every
     run, so a correction that moves it is sent as the next version. */
  if (stage && groups.every(g => done.has(id(g)))) return [];

  const tables = [];
  for (const g of groups) tables.push({ g, data: await leagueTable(season, division, g) });
  const played = tables.reduce((n, t) => n + t.data.reduce((m, r) => m + (Number((r.attributes || {}).played) || 0), 0), 0);
  const finished = (await matchesBetween(season, division, `${season}-07-01`, today)).filter(isFinished).length;
  /* --tables-anyway (testing only): the live table is always today's, so a
     pretend past date can never pass this check. */
  if (played !== finished * 2 && !anyway) {
    skipped.push({ division, reason: `table not caught up yet — ${played / 2} games in the table, ${finished} finished` });
    return [];
  }
  const r = roundFor(rounds, division, today);
  const out = [];
  for (const t of tables) {
    if (!t.data.length) continue;
    const sig = tableSig(t.data);
    const v = stage ? (done.has(id(t.g)) ? null : { id: id(t.g), version: 1 }) : versionedId(id(t.g), sig, done);
    if (!v) continue;
    out.push({ kind: 'table', division, tableDivision: t.g ? `Cup${t.g}` : division, mode: 'table',
      date: today, days: [today], matchday: r ? String(r.round) : '', data: t.data,
      id: v.id, label: label(t.g), sig, version: v.version,
      suffix: [stage, v.version > 1 ? `v${v.version}` : ''].filter(Boolean).join(' ') });
  }
  return out;
}

/* ---------- render harness ---------- */

const KIND = {
  fixtures: { css: '/graphics/fixtures-graphic/fixtures-styles.css', js: '/graphics/_shared/fixtures-card.js' },
  table:    { css: '/graphics/table-graphic/styles.css',            js: '/graphics/_shared/table-card.js' }
};
/* One page per kind: the two graphics' stylesheets both style .gfx, so they
   are never loaded together. */
function harnessHtml(kind) {
  const k = KIND[kind];
  return `<!doctype html><meta charset="utf-8"><title>rendering</title>
<link rel="stylesheet" href="/system/nl-brand.css">
<link rel="stylesheet" href="/graphics/_shared/brand-graphic.css">
<link rel="stylesheet" href="${k.css}">
<style>html,body{margin:0;background:#fff} #host{width:1080px}</style>
<div id="host"></div>
<script src="/__h2i.js"></script>
<script src="/system/nl-utils.js"></script>
<script src="/graphics/_shared/png-export.js"></script>
<script src="${k.js}"></script>
<script>
(async function(){
  var post = function(p, body){ return fetch(p, { method:'POST', body: body }); };
  try {
    var work = await (await fetch('/__work?kind=${kind}')).json();
    await NL.clubs.load();
    await NL.clubs.guests().catch(function(){ return []; });
    /* Load every cut the card uses before anything is drawn, or the first
       card falls back to sans-serif (the faces are font-display: swap). */
    await Promise.all(['Carbona-Regular','Carbona-Bold','Carbona-ExtraBold'].map(function(f){
      return document.fonts.load('40px "' + f + '"');
    }));
    await document.fonts.ready;
    var host = document.getElementById('host');
    var isTable = ${kind === 'table'};
    var C = isTable ? window.NL_TABLE_CARD : window.NL_FIXTURES_CARD;
    for (var i = 0; i < work.length; i++) {
      var j = work[i];
      var rows, count, trimmed = false;
      if (isTable) { rows = C.buildRows(j.data, NL.clubs); count = rows.length; }
      else { var built = C.buildRows(j.data, NL.clubs); rows = built.rows; count = built.matches.length; trimmed = built.trimmed; }
      for (var k = 0; k < j.files.length; k++) {
        var spec = j.files[k];
        var gfx = await C.render(host, isTable
          ? { division: j.tableDivision, format: spec.format, dir: '1', matchday: j.matchday, season: j.season, rows: rows }
          : { division: j.division, format: spec.format, mode: j.mode, matchday: j.matchday, fit: 'wrap', season: j.season, rows: rows },
          NL.clubs);
        var out = await C.toPng(gfx, spec.format);
        var title = gfx.querySelector('.gfx-title').innerText.replace(/\\n/g, ' / ');
        await fetch('/__png?card=' + encodeURIComponent(j.id) + '&file=' + encodeURIComponent(spec.file) +
          '&late=' + out.late + '&missing=' + encodeURIComponent((out.missing || []).join('|')) +
          '&rows=' + count + '&trimmed=' + (trimmed ? 1 : 0) + '&title=' + encodeURIComponent(title),
          { method: 'POST', body: out.blob });
      }
    }
    await post('/__done?kind=${kind}', 'ok');
  } catch (err) {
    await post('/__done?kind=${kind}', 'ERROR ' + (err && err.stack || err));
  }
})();
</script>`;
}

const MIME = { '.json': 'application/json', '.js': 'text/javascript', '.png': 'image/png',
               '.otf': 'font/otf', '.css': 'text/css', '.html': 'text/html' };

function startServer(work, outDir, state) {
  let h2i = null;
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(u.pathname);
    const body = () => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });

    const kind = u.searchParams.get('kind') || 'fixtures';
    if (p === '/__render') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(harnessHtml(kind)); }
    if (p === '/__work') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(work.filter(c => c.kind === kind)));
    }
    if (p === '/__h2i.js') {
      try {
        if (!h2i) h2i = process.env.H2I_FILE ? fs.readFileSync(process.env.H2I_FILE)
                                             : Buffer.from(await (await fetch(H2I_CDN)).arrayBuffer());
        res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(h2i);
      } catch (e) { state.done[kind] = `ERROR could not load html-to-image: ${e.message}`; res.writeHead(502); return res.end(); }
    }
    if (p === '/__png' && req.method === 'POST') {
      const buf = await body();
      const card = u.searchParams.get('card'), file = u.searchParams.get('file');
      fs.mkdirSync(path.join(outDir, card), { recursive: true });
      fs.writeFileSync(path.join(outDir, card, file), buf);
      state.rendered.push({ card, file, bytes: buf.length, late: +u.searchParams.get('late'),
        missing: (u.searchParams.get('missing') || '').split('|').filter(Boolean),
        rows: +u.searchParams.get('rows'), trimmed: u.searchParams.get('trimmed') === '1',
        title: u.searchParams.get('title') });
      res.writeHead(204); return res.end();
    }
    if (p === '/__done' && req.method === 'POST') { state.done[kind] = (await body()).toString(); res.writeHead(204); return res.end(); }

    const fp = path.join(REPO, p);
    if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
}

function findChrome(explicit) {
  const candidates = [explicit, process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium',
    '/usr/bin/chromium-browser'].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  const base = '/opt/pw-browsers';
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base)) {
      const c = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(c)) return c;
    }
  }
  throw new Error('Could not find Chromium. Pass --chrome /path/to/chrome or set CHROME_PATH.');
}

/* ---------- main ---------- */

async function main() {
  const args = parseArgs(process.argv);
  const today = args.today || ukToday();
  const target = args.mode === 'fixtures' ? addDays(today, FIXTURES_LEAD_DAYS) : today;
  const season = seasonStart(target);
  const rounds = loadRounds(seasonLabel(season));

  console.log(`Fixtures graphics — ${args.mode}`);
  console.log(`  today       ${today}${args.today ? '  (pretend)' : ''}`);
  console.log(`  season      ${seasonLabel(season)}`);

  const done = parseDone(args.done && fs.existsSync(args.done) ? fs.readFileSync(args.done, 'utf8') : '');
  const { cards, skipped } = await dueCards(args, rounds, season, done);
  const work = [];
  for (const c of cards) {
    if (done.has(c.id)) skipped.push({ division: c.division, reason: `${c.id} already delivered` });
    else work.push({ ...c, season: seasonLabel(season) });
  }
  skipped.forEach(s => console.log(`  skip        ${s.division}: ${s.reason}`));

  fs.rmSync(args.out, { recursive: true, force: true });
  fs.mkdirSync(args.out, { recursive: true });
  const manifest = { generated: new Date().toISOString(), mode: args.mode, today,
    pretend: !!args.today, season: seasonLabel(season), cards: [], held: [], skipped };

  if (!work.length) {
    console.log('  nothing due');
    fs.writeFileSync(path.join(args.out, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return;
  }
  work.forEach(c => console.log(`  make        ${c.id}  (${c.kind === 'table' ? c.data.length + ' clubs' : c.data.length + ' games'}, title "${c.matchday || (c.kind === 'table' ? 'CURRENT STANDINGS' : 'MATCHDAY')}")`));

  const state = { rendered: [], done: {} };
  const server = startServer(work, args.out, state);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const chrome = findChrome(args.chrome);

  for (const kind of Object.keys(KIND)) {
    const mine = work.filter(c => c.kind === kind);
    if (!mine.length) continue;
    const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
      '--hide-scrollbars', '--force-device-scale-factor=1', '--disable-dev-shm-usage',
      '--window-size=1200,2000', `http://127.0.0.1:${port}/__render?kind=${kind}`], { stdio: 'ignore' });
    const expected = mine.reduce((n, c) => n + c.files.length, 0);
    const started = Date.now();
    while (state.done[kind] == null && Date.now() - started < Math.max(120000, expected * 15000)) {
      await new Promise(r => setTimeout(r, 250));
    }
    proc.kill();
    const got = state.rendered.filter(r => mine.some(c => c.id === r.card)).length;
    if (state.done[kind] == null) { server.close(); throw new Error(`${kind}: timed out with ${got}/${expected} rendered`); }
    if (state.done[kind].startsWith('ERROR')) { server.close(); throw new Error(`${kind}: render failed: ${state.done[kind]}`); }
    if (got !== expected) { server.close(); throw new Error(`${kind}: incomplete: ${got}/${expected}`); }
  }
  server.close();

  /* A card with a crest or badge that never loaded is held back — the rest
     still go out. The workflow fails the run afterwards so it is noticed. */
  const broken = new Set(state.rendered.filter(r => r.late > 0).map(r => r.card));
  for (const c of work) {
    const files = state.rendered.filter(r => r.card === c.id);
    const entry = { id: c.id, kind: c.kind, division: c.division, mode: c.mode, days: c.days,
      sig: c.sig || '', version: c.version || 1, early: !!c.early,
      title: files[0] && files[0].title, rows: files[0] && files[0].rows,
      trimmed: files.some(f => f.trimmed), leftOff: c.leftOff || 0, files: files.map(f => f.file) };
    if (broken.has(c.id)) {
      entry.missing = [...new Set(files.flatMap(f => f.missing))];
      manifest.held.push(entry);
      fs.rmSync(path.join(args.out, c.id), { recursive: true, force: true });
      console.log(`  HELD BACK   ${c.id}  — images did not load: ${entry.missing.join(', ') || 'unknown'}`);
    } else {
      manifest.cards.push(entry);
      console.log(`  made        ${c.id}  "${entry.title}"`);
    }
  }
  fs.writeFileSync(path.join(args.out, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

if (require.main === module) {
  main().catch(e => { console.error(`\n  ${e.message}`); process.exit(1); });
}
module.exports = { addDays, seasonStart, seasonLabel, roundFor, cardTitle, shortDate,
  splitLate, withoutLiveScores, resultsSig, tableSig, parseDone, versionedId, isDone };
