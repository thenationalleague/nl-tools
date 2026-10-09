#!/usr/bin/env node
/* ============================================================
   build-fixtures-graphics.js
   Version: v1.0 (09/10/2026)

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
               every game that day is marked full time. Postponed and
               abandoned games are left off. Until the last one finishes the
               run does nothing, so the workflow can poll every 15 minutes.

   ROUND NUMBERS come from assets/data/rounds-<season>.json: a date inside a
   round's from–to window prints that round's number, whatever round the
   fixture officially belongs to; outside every window the card says plain
   MATCHDAY (the Cup: GROUP STAGE). A round can carry a "title" to override
   the wording, for the Cup's knockout rounds.

   ONCE ONLY
     --done <file> lists card ids already delivered, one per line (the
     workflow builds it from what is already in Firebase Storage). A card
     whose id is listed is skipped. Card id = output folder name:
       "2026-10-10 National Results"   "2026-10-08 South Fixtures"

   OUTPUT  --out (default build/fixtures-graphics)
     <out>/<card id>/<Division> <Fixtures|Results> <10Oct26> - <1x1|4x5|9x16>.png
     <out>/manifest.json   what was made, what was skipped and why
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
              done: null, formats: FORMATS.slice(), chrome: null };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--mode') a.mode = argv[++i];
    else if (k === '--division') a.division = argv[++i];
    else if (k === '--today') a.today = argv[++i];
    else if (k === '--out') a.out = path.resolve(argv[++i]);
    else if (k === '--done') a.done = argv[++i];
    else if (k === '--format') a.formats = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (k === '--chrome') a.chrome = argv[++i];
    else if (k === '--help') { console.log('see header'); process.exit(0); }
    else throw new Error(`unknown argument: ${k}`);
  }
  if (!['fixtures', 'results'].includes(a.mode)) throw new Error('--mode must be fixtures or results');
  if (a.division !== 'all' && !DIVISIONS.includes(a.division)) {
    throw new Error(`--division must be all or one of ${DIVISIONS.join(', ')}`);
  }
  for (const f of a.formats) if (!FORMATS.includes(f)) throw new Error(`unknown --format ${f}`);
  if (a.today && !/^\d{4}-\d{2}-\d{2}$/.test(a.today)) throw new Error('--today must be YYYY-MM-DD');
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
    d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }) + String(d.getUTCFullYear()).slice(2);
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

async function nls(params) {
  const url = `${NLS_BASE}/matches/?${params.join('&')}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`NLS ${r.status}`);
      return await r.json();
    } catch (e) {
      if (attempt >= 3) throw new Error(`${e.message} — ${url}`);
      await new Promise(res => setTimeout(res, 2000 * attempt));
    }
  }
}
/* Days with games this season: meta.populatedDates, which comes back
   whatever window is asked for. */
async function populatedDates(season, division) {
  const j = await nls([`seasonID=${season}`, `competitionID=${COMPETITION_ID[division]}`,
    'includePopulatedDates=true', 'from=2000-01-01%2000:00:00Z', 'to=2000-01-01%2023:59:59Z',
    'page.number=1', 'page.size=1']);
  return Object.keys((j.meta && j.meta.populatedDates) || {}).sort();
}
async function matchesBetween(season, division, from, to) {
  const j = await nls([`seasonID=${season}`, `competitionID=${COMPETITION_ID[division]}`,
    `from=${encodeURIComponent(from + ' 00:00:00Z')}`, `to=${encodeURIComponent(to + ' 23:59:59Z')}`,
    'sort=kickOffDateUTC', 'page.number=1', 'page.size=100']);
  return j.data || [];
}
const period = m => String((m.attributes || {}).matchPeriod || '').toLowerCase();
/* By matchPeriod only — NLS keeps postponementReason on a game after it is
   rearranged (see buildRows in fixtures-card.js). */
const isPostponed = m => period(m) === 'postponed';
const isAbandoned = m => period(m) === 'abandoned';
const isFinished = m => period(m) === 'fulltime' || period(m) === 'postmatch';

/* ---------- what is due ---------- */

async function dueCards(args, rounds, season) {
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
      const all = await matchesBetween(season, division, today, today);
      const data = all.filter(m => !isPostponed(m) && !isAbandoned(m));
      if (!data.length) { skipped.push({ division, reason: `no games on ${today}` }); continue; }
      const live = data.filter(m => !isFinished(m));
      if (live.length) { skipped.push({ division, reason: `${live.length} of ${data.length} not finished` }); continue; }
      cards.push({ division, mode: 'results', date: today, days: [today],
                   matchday: cardTitle(rounds, division, today), data,
                   leftOff: all.length - data.length });
    }
  }

  for (const c of cards) {
    c.id = `${c.date} ${c.division} ${c.mode === 'results' ? 'Results' : 'Fixtures'}`;
    c.files = args.formats.map(f => ({ format: f,
      file: `${c.division} ${c.mode === 'results' ? 'Results' : 'Fixtures'} ${shortDate(c.date)} - ${f}.png` }));
  }
  return { today, cards, skipped };
}

/* ---------- render harness ---------- */

function harnessHtml() {
  return `<!doctype html><meta charset="utf-8"><title>rendering</title>
<link rel="stylesheet" href="/system/nl-brand.css">
<link rel="stylesheet" href="/graphics/_shared/brand-graphic.css">
<link rel="stylesheet" href="/graphics/fixtures-graphic/fixtures-styles.css">
<style>html,body{margin:0;background:#fff} #host{width:1080px}</style>
<div id="host"></div>
<script src="/__h2i.js"></script>
<script src="/system/nl-utils.js"></script>
<script src="/graphics/_shared/fixtures-card.js"></script>
<script>
(async function(){
  var post = function(p, body){ return fetch(p, { method:'POST', body: body }); };
  try {
    var work = await (await fetch('/__work')).json();
    await NL.clubs.load();
    await NL.clubs.guests().catch(function(){ return []; });
    /* Load every cut the card uses before anything is drawn, or the first
       card falls back to sans-serif (the faces are font-display: swap). */
    await Promise.all(['Carbona-Regular','Carbona-Bold','Carbona-ExtraBold'].map(function(f){
      return document.fonts.load('40px "' + f + '"');
    }));
    await document.fonts.ready;
    var C = window.NL_FIXTURES_CARD, host = document.getElementById('host');
    for (var i = 0; i < work.length; i++) {
      var j = work[i];
      var built = C.buildRows(j.data, NL.clubs);
      for (var k = 0; k < j.files.length; k++) {
        var spec = j.files[k];
        var gfx = await C.render(host, { division: j.division, format: spec.format, mode: j.mode,
          matchday: j.matchday, fit: 'wrap', season: j.season, rows: built.rows }, NL.clubs);
        var out = await C.toPng(gfx, spec.format);
        var title = gfx.querySelector('.gfx-title').innerText.replace(/\\n/g, ' / ');
        await fetch('/__png?card=' + encodeURIComponent(j.id) + '&file=' + encodeURIComponent(spec.file) +
          '&late=' + out.late + '&rows=' + built.matches.length + '&trimmed=' + (built.trimmed ? 1 : 0) +
          '&title=' + encodeURIComponent(title), { method: 'POST', body: out.blob });
      }
    }
    await post('/__done', 'ok');
  } catch (err) {
    await post('/__done', 'ERROR ' + (err && err.stack || err));
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

    if (p === '/' || p === '/__render') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(harnessHtml()); }
    if (p === '/__work') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(work)); }
    if (p === '/__h2i.js') {
      try {
        if (!h2i) h2i = process.env.H2I_FILE ? fs.readFileSync(process.env.H2I_FILE)
                                             : Buffer.from(await (await fetch(H2I_CDN)).arrayBuffer());
        res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(h2i);
      } catch (e) { state.done = `ERROR could not load html-to-image: ${e.message}`; res.writeHead(502); return res.end(); }
    }
    if (p === '/__png' && req.method === 'POST') {
      const buf = await body();
      const card = u.searchParams.get('card'), file = u.searchParams.get('file');
      fs.mkdirSync(path.join(outDir, card), { recursive: true });
      fs.writeFileSync(path.join(outDir, card, file), buf);
      state.rendered.push({ card, file, bytes: buf.length, late: +u.searchParams.get('late'),
        rows: +u.searchParams.get('rows'), trimmed: u.searchParams.get('trimmed') === '1',
        title: u.searchParams.get('title') });
      res.writeHead(204); return res.end();
    }
    if (p === '/__done' && req.method === 'POST') { state.done = (await body()).toString(); res.writeHead(204); return res.end(); }

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

  const { cards, skipped } = await dueCards(args, rounds, season);
  const done = new Set(args.done && fs.existsSync(args.done)
    ? fs.readFileSync(args.done, 'utf8').split('\n').map(s => s.trim()).filter(Boolean) : []);
  const work = [];
  for (const c of cards) {
    if (done.has(c.id)) skipped.push({ division: c.division, reason: `${c.id} already delivered` });
    else work.push({ ...c, season: seasonLabel(season) });
  }
  skipped.forEach(s => console.log(`  skip        ${s.division}: ${s.reason}`));

  fs.rmSync(args.out, { recursive: true, force: true });
  fs.mkdirSync(args.out, { recursive: true });
  const manifest = { generated: new Date().toISOString(), mode: args.mode, today,
    pretend: !!args.today, season: seasonLabel(season), cards: [], skipped };

  if (!work.length) {
    console.log('  nothing due');
    fs.writeFileSync(path.join(args.out, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return;
  }
  work.forEach(c => console.log(`  make        ${c.id}  (${c.data.length} games, title "${c.matchday || 'MATCHDAY'}")`));

  const state = { rendered: [], done: null };
  const server = startServer(work, args.out, state);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const proc = spawn(findChrome(args.chrome), ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--disable-dev-shm-usage',
    '--window-size=1200,2000', `http://127.0.0.1:${port}/__render`], { stdio: 'ignore' });

  const expected = work.reduce((n, c) => n + c.files.length, 0);
  const started = Date.now();
  while (state.done === null && Date.now() - started < Math.max(120000, expected * 15000)) {
    await new Promise(r => setTimeout(r, 250));
  }
  proc.kill();
  server.close();

  if (state.done === null) throw new Error(`timed out with ${state.rendered.length}/${expected} rendered`);
  if (state.done.startsWith('ERROR')) throw new Error(`render failed: ${state.done}`);
  if (state.rendered.length !== expected) throw new Error(`incomplete: ${state.rendered.length}/${expected}`);

  /* A card with a crest or badge that never loaded is not published. */
  const broken = new Set(state.rendered.filter(r => r.late > 0).map(r => r.card));
  for (const c of work) {
    const files = state.rendered.filter(r => r.card === c.id);
    manifest.cards.push({ id: c.id, division: c.division, mode: c.mode, days: c.days,
      title: files[0] && files[0].title, games: files[0] && files[0].rows,
      trimmed: files.some(f => f.trimmed), leftOff: c.leftOff || 0,
      files: files.map(f => f.file), missingImages: broken.has(c.id) });
    console.log(`  made        ${c.id}  "${files[0] && files[0].title}"${broken.has(c.id) ? '  — MISSING IMAGES' : ''}`);
  }
  fs.writeFileSync(path.join(args.out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (broken.size) {
    for (const id of broken) fs.rmSync(path.join(args.out, id), { recursive: true, force: true });
    throw new Error(`${broken.size} card(s) had images that did not load and were held back: ${[...broken].join(', ')}`);
  }
}

if (require.main === module) {
  main().catch(e => { console.error(`\n  ${e.message}`); process.exit(1); });
}
module.exports = { addDays, seasonStart, seasonLabel, roundFor, cardTitle, shortDate };
