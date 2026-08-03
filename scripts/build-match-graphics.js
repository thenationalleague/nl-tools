#!/usr/bin/env node
/* ============================================================
   build-match-graphics.js

   Renders the per-club match graphic set and lays it out as a folder
   tree ready to upload to Google Drive.

     node scripts/build-match-graphics.js --out ./build/match-graphics
     node scripts/build-match-graphics.js --clubs "Woking,Forest Green Rovers"
     node scripts/build-match-graphics.js --split division --zip
     node scripts/build-match-graphics.js --clubs "Chester" --format 16x9,1x1,9x16

   Full documentation, including how to add the NL Cup and extra formats:
   graphics/match-graphic/README.md

   Output is NEVER committed. ~205KB per graphic at 16:9, 1,656 unique
   renders, 3,312 placed copies, about 632MB in total.

   HOW IT WORKS
     A graphic is rendered once and placed into the folder of every side
     that is an NL member club. League fixtures therefore get two copies
     (one per club, byte-identical); an NL Cup tie against a Premier
     League or Championship representative side gets one, because those
     clubs have no folder of their own.

     Rendering uses graphics/_shared/match-graphic.js — the same module the
     interactive tool uses — so a graphic made in the browser and one made
     here are identical.

   NO NEW DEPENDENCIES
     This repo runs close to dependency-free, so rather than pulling in
     Playwright the script starts a small local http server (Node built-in),
     points headless Chromium at it, and lets the page POST each finished
     PNG back. Serving over http rather than file:// also keeps the local
     @font-face load reliable.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');

/* ---------- args ---------- */

function parseArgs(argv) {
  const a = { out: path.join(REPO, 'build', 'match-graphics'), clubs: null,
              split: 'club', zip: false, chrome: null, season: '2026-27',
              formats: ['16x9'] };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--out') a.out = path.resolve(argv[++i]);
    else if (k === '--clubs') a.clubs = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (k === '--format') a.formats = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (k === '--split') a.split = argv[++i];
    else if (k === '--zip') a.zip = true;
    else if (k === '--chrome') a.chrome = argv[++i];
    else if (k === '--season') a.season = argv[++i];
    else if (k === '--help') { console.log('see header'); process.exit(0); }
    else throw new Error(`unknown argument: ${k}`);
  }
  if (!['club', 'division', 'none'].includes(a.split)) {
    throw new Error(`--split must be club, division or none (got ${a.split})`);
  }
  const known = knownFormats();
  for (const f of a.formats) {
    if (!known.includes(f)) {
      throw new Error(`unknown --format "${f}" (have ${known.join(', ')})`);
    }
  }
  return a;
}

/* Read the format table straight out of the renderer so the script can never
   drift from it. */
function knownFormats() {
  const src = fs.readFileSync(
    path.join(REPO, 'graphics/_shared/match-graphic.js'), 'utf8');
  const scope = {};
  new Function('window', 'globalThis', src).call(scope, scope, scope);
  return Object.keys(scope.NL_MATCH_GRAPHIC.FORMATS);
}

function findChrome(explicit) {
  const candidates = [explicit, process.env.CHROME_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean);
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  const globbed = safeGlobChrome();
  if (globbed) return globbed;
  throw new Error('Could not find Chromium. Pass --chrome /path/to/chrome or set CHROME_PATH.');
}

function safeGlobChrome() {
  const base = '/opt/pw-browsers';
  if (!fs.existsSync(base)) return null;
  for (const d of fs.readdirSync(base)) {
    const p = path.join(base, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/* ---------- data ---------- */

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));

function loadData(season) {
  const clubsMeta = readJson(path.join(REPO, 'assets/data/clubs-meta.json'));
  const fixturesDoc = readJson(path.join(REPO, `assets/data/fixtures-${season}.json`));
  const comps = readJson(path.join(REPO, 'assets/data/competitions-meta.json'));

  /* Member clubs are those with a current division. Clubs carrying only a
     `seasons` history (Rochdale, York, ...) are former members and get no
     folder. */
  const members = new Map();
  for (const c of clubsMeta.clubs) {
    if (c.division === 'National' || c.division === 'North' || c.division === 'South') {
      members.set(c.name, c);
    }
  }

  /* Cup opponents live in their own file so they cannot be confused with
     former members inside clubs-meta. Absent until it is filled in. */
  const guests = new Map();
  const guestPath = path.join(REPO, 'assets/data/cup-clubs-meta.json');
  if (fs.existsSync(guestPath)) {
    for (const c of readJson(guestPath).clubs) guests.set(c.name, c);
  }

  const badges = new Map();
  for (const c of comps.competitions) if (c.logo) badges.set(c.competition, c.logo);

  return { members, guests, badges, fixtures: fixturesDoc.fixtures, fixturesDoc };
}

/* ---------- naming ---------- */

/* DD/MM/YYYY -> YYYY-MM-DD, so folders sort chronologically. */
function isoDate(d) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(d || '').trim());
  if (!m) throw new Error(`unrecognised date: ${d}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/* Only strip characters that are genuinely illegal in a folder name.
   Ampersands and apostrophes are fine and appear in real club names. */
function safeName(s) {
  return String(s).replace(/[\/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

/* Every filename carries its aspect ratio, including 16:9. NOTE: the first
   delivered set used a bare `WOK-SUT.png` for 16:9, so a re-run now produces
   `WOK-SUT-16x9.png` alongside rather than replacing it. Clear a folder before
   re-running into it if you do not want both. */
function graphicFile(homeClub, awayClub, fmt) {
  return `${homeClub.code}-${awayClub.code}-${fmt}.png`;
}

function fixtureFolder(iso, opponentName, isHome) {
  return `${iso} ${safeName(opponentName)} (${isHome ? 'H' : 'A'})`;
}

/* ---------- work list ---------- */

function buildWorkList(data, clubFilter, formats) {
  const { members, guests, badges, fixtures } = data;
  const jobs = [];
  const skipped = [];

  for (const row of fixtures) {
    const [date, competition, homeName, awayName] = row;
    const home = members.get(homeName) || guests.get(homeName);
    const away = members.get(awayName) || guests.get(awayName);

    if (!home || !away) {
      skipped.push({ date, competition, homeName, awayName,
                     reason: !home ? `no metadata for "${homeName}"`
                                   : `no metadata for "${awayName}"` });
      continue;
    }
    if (!badges.has(competition)) {
      skipped.push({ date, competition, homeName, awayName,
                     reason: `no logo for competition "${competition}"` });
      continue;
    }

    /* Placement: one copy per side that is a member club. */
    const placements = [];
    if (members.has(homeName)) {
      placements.push({ club: homeName,
                        folder: fixtureFolder(isoDate(date), awayName, true) });
    }
    if (members.has(awayName)) {
      placements.push({ club: awayName,
                        folder: fixtureFolder(isoDate(date), homeName, false) });
    }
    if (!placements.length) { // neither side is ours — nothing to deliver
      skipped.push({ date, competition, homeName, awayName,
                     reason: 'neither club is an NL member' });
      continue;
    }

    if (clubFilter && !placements.some(p => clubFilter.includes(p.club))) continue;

    jobs.push({
      iso: isoDate(date), date, competition,
      home: homeName, away: awayName,
      files: formats.map(f => ({ format: f, file: graphicFile(home, away, f) })),
      badge: badges.get(competition),
      placements: clubFilter ? placements.filter(p => clubFilter.includes(p.club))
                             : placements,
      division: members.get(homeName)?.division || members.get(awayName)?.division || 'Other'
    });
  }
  return { jobs, skipped };
}

/* ---------- render harness ---------- */

function harnessHtml() {
  return `<!doctype html><meta charset="utf-8"><title>rendering</title>
<style>
@font-face{font-family:NLCarbonaExtraBold;
  src:url('/graphics/_shared/fonts/Carbona-ExtraBold.otf') format('opentype');
  font-weight:800;font-display:block}
html,body{margin:0;background:#fff}
</style>
<canvas id="c" width="1920" height="1080"></canvas>
<script src="/graphics/_shared/match-graphic.js"></script>
<script>
function load(src){return new Promise(function(res){
  var i=new Image();
  i.onload=function(){res(i)};
  i.onerror=function(){console.warn('asset failed: '+src);res(null)};
  i.src=src;
});}

(async function(){
  var log = function(m){ return fetch('/__log',{method:'POST',body:m}); };
  try{
    var work = await (await fetch('/__work')).json();
    var clubs = await (await fetch('/assets/data/clubs-meta.json')).json();
    var byName = {}; clubs.clubs.forEach(function(c){ byName[c.name]=c; });
    try{
      var g = await (await fetch('/assets/data/cup-clubs-meta.json')).json();
      g.clubs.forEach(function(c){ byName[c.name]=c; });
    }catch(e){ /* file not present yet */ }

    /* Load the font before any text is drawn, or the first graphics would
       silently fall back to sans-serif. */
    await document.fonts.load('800 202px "NLCarbonaExtraBold"');
    await document.fonts.ready;

    var cache = {};
    async function asset(url){
      if(!(url in cache)) cache[url] = await load(url);
      return cache[url];
    }

    /* alpha:false — the graphic is full-bleed and opaque, so an alpha channel
       is dead weight in every PNG (about 27% of the file). It also removes any
       chance of a partly transparent seam. */
    var canvas = document.getElementById('c');
    var ctx = canvas.getContext('2d', { alpha: false });

    var MG = window.NL_MATCH_GRAPHIC;
    var done = 0, totalOut = work.reduce(function(n,j){ return n + j.files.length; }, 0);

    for(var i=0;i<work.length;i++){
      var j = work[i];
      var home = byName[j.home], away = byName[j.away];
      /* Guest sides carry a competition-correct name ("Fulham PL2") but share
         the member crest file ("Fulham.png"), so crestName wins over name. */
      var homeKey = (home && home.crestName) || j.home;
      var awayKey = (away && away.crestName) || j.away;
      var assets = {
        homeCrest: await asset('/assets/crests/'+encodeURIComponent(homeKey)+'.png'),
        awayCrest: await asset('/assets/crests/'+encodeURIComponent(awayKey)+'.png'),
        badge:     await asset(j.badge.split('/').map(encodeURIComponent).join('/'))
      };
      if(!assets.homeCrest || !assets.awayCrest || !assets.badge){
        await log('MISSING_ASSET '+j.files[0].file); continue;
      }

      for(var k=0;k<j.files.length;k++){
        var spec = j.files[k];
        var fmt = MG.FORMATS[spec.format];
        /* Resizing clears the canvas and resets the context, so the context
           must be taken after setting the dimensions, not before. */
        canvas.width = fmt.w; canvas.height = fmt.h;
        var ctx = canvas.getContext('2d', { alpha: false });

        var info = MG.render(ctx, {
          home: home, away: away, competition: j.competition
        }, assets, { format: spec.format });

        var blob = await new Promise(function(r){ canvas.toBlob(r, 'image/png'); });
        var buf = await blob.arrayBuffer();
        await fetch('/__png?file='+encodeURIComponent(spec.file)+
                    '&format='+encodeURIComponent(spec.format)+
                    '&version='+encodeURIComponent(info.version)+
                    '&homeText='+info.homeText+'&awayText='+info.awayText+
                    '&merge='+(info.panelsMerge?1:0),
                    { method:'POST', body: buf });
        done++;
        if(done % 50 === 1) await log('progress '+done+'/'+totalOut);
      }
    }
    await fetch('/__done',{method:'POST',body:'ok'});
  }catch(err){
    await fetch('/__done',{method:'POST',body:'ERROR '+(err&&err.message||err)});
  }
})();
</script>`;
}

/* ---------- local server ---------- */

const MIME = { '.json': 'application/json', '.js': 'text/javascript',
               '.png': 'image/png', '.otf': 'font/otf', '.css': 'text/css',
               '.html': 'text/html' };

function startServer(jobs, renderDir, state) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(u.pathname);

    if (p === '/' || p === '/__render') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(harnessHtml());
    }
    if (p === '/__work') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(jobs.map(j => ({
        home: j.home, away: j.away, competition: j.competition,
        files: j.files, badge: j.badge
      }))));
    }
    if (p === '/__png' && req.method === 'POST') {
      const file = u.searchParams.get('file');
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        fs.writeFileSync(path.join(renderDir, file), Buffer.concat(chunks));
        state.renderVersion = u.searchParams.get('version') || state.renderVersion;
        state.rendered.push({ file,
          format: u.searchParams.get('format'),
          homeText: u.searchParams.get('homeText'),
          awayText: u.searchParams.get('awayText'),
          merge: u.searchParams.get('merge') === '1' });
        res.writeHead(204).end();
      });
      return;
    }
    if (p === '/__log' && req.method === 'POST') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const m = Buffer.concat(chunks).toString();
        if (m.startsWith('MISSING_ASSET')) state.assetErrors.push(m);
        else process.stdout.write(`    ${m}\r`);
        res.writeHead(204).end();
      });
      return;
    }
    if (p === '/__done' && req.method === 'POST') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        state.done = Buffer.concat(chunks).toString();
        res.writeHead(204).end();
      });
      return;
    }

    /* static repo files */
    const fp = path.join(REPO, p);
    if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
      return res.writeHead(404).end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
  return server;
}

/* ---------- main ---------- */

async function main() {
  const args = parseArgs(process.argv);
  const chrome = findChrome(args.chrome);
  const data = loadData(args.season);
  const { jobs, skipped } = buildWorkList(data, args.clubs, args.formats);

  console.log(`Match graphics build`);
  console.log(`  season      ${args.season}`);
  console.log(`  chromium    ${chrome}`);
  console.log(`  member clubs ${data.members.size}   cup opponents ${data.guests.size}`);
  if (args.clubs) console.log(`  club filter ${args.clubs.join(', ')}`);
  console.log(`  to render   ${jobs.length} unique graphics`);
  console.log(`  placements  ${jobs.reduce((n, j) => n + j.placements.length, 0)}`);
  if (skipped.length) console.log(`  skipped     ${skipped.length} fixtures (see manifest)`);
  if (!jobs.length) { console.error('Nothing to render.'); process.exit(1); }

  fs.rmSync(args.out, { recursive: true, force: true });
  const renderDir = path.join(args.out, '_renders');
  const treeDir = path.join(args.out, 'clubs');
  fs.mkdirSync(renderDir, { recursive: true });
  fs.mkdirSync(treeDir, { recursive: true });

  /* de-duplicate: one render per unique output file */
  const unique = [];
  const seen = new Set();
  for (const j of jobs) {
    const key = j.files.map(f => f.file).join('|');
    if (!seen.has(key)) { seen.add(key); unique.push(j); }
  }

  const state = { rendered: [], assetErrors: [], done: null, renderVersion: null };
  const server = startServer(unique, renderDir, state);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  console.log(`\n  rendering on http://127.0.0.1:${port} ...`);
  const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--hide-scrollbars', '--force-device-scale-factor=1',
    '--disable-dev-shm-usage',
    `http://127.0.0.1:${port}/__render`], { stdio: 'ignore' });

  const started = Date.now();
  const expected = unique.reduce((n, j) => n + j.files.length, 0);
  const timeoutMs = Math.max(120000, expected * 3000);
  while (state.done === null && Date.now() - started < timeoutMs) {
    await new Promise(r => setTimeout(r, 250));
  }
  proc.kill();
  server.close();
  process.stdout.write('\n');

  if (state.done === null) {
    console.error(`  TIMED OUT after ${Math.round((Date.now()-started)/1000)}s ` +
                  `with ${state.rendered.length}/${expected} rendered`);
    process.exit(1);
  }
  if (state.done.startsWith('ERROR')) {
    console.error(`  render failed: ${state.done}`);
    process.exit(1);
  }
  if (state.rendered.length !== expected) {
    console.error(`  INCOMPLETE: ${state.rendered.length}/${expected} rendered`);
    state.assetErrors.slice(0, 10).forEach(e => console.error(`    ${e}`));
    process.exit(1);
  }
  console.log(`  rendered ${state.rendered.length} graphics in ` +
              `${Math.round((Date.now()-started)/1000)}s`);

  /* ---- lay out the folder tree ---- */
  let placed = 0;
  for (const j of jobs) {
    for (const pl of j.placements) {
      const dir = path.join(treeDir, safeName(pl.club), pl.folder);
      fs.mkdirSync(dir, { recursive: true });
      for (const f of j.files) {
        fs.copyFileSync(path.join(renderDir, f.file), path.join(dir, f.file));
        placed++;
      }
    }
  }
  console.log(`  placed ${placed} copies across ` +
              `${fs.readdirSync(treeDir).length} club folders`);

  /* ---- manifest ---- */
  const byText = state.rendered
    .filter(r => r.format === args.formats[0])
    .reduce((acc, r) => {
      acc[r.homeText] = (acc[r.homeText] || 0) + 1;
      acc[r.awayText] = (acc[r.awayText] || 0) + 1;
      return acc;
    }, {});
  const manifest = {
    generated: new Date().toISOString(),
    season: args.season,
    renderVersion: state.renderVersion,
    formats: args.formats,
    uniqueFixtures: unique.length,
    uniqueGraphics: expected,
    placements: placed,
    clubFilter: args.clubs || null,
    textColourBasis: byText,
    panelsMerge: state.rendered.filter(r => r.merge && r.format === args.formats[0])
                              .map(r => r.file),
    skipped,
    graphics: jobs.map(j => ({
      files: j.files.map(f => f.file), date: j.iso, competition: j.competition,
      home: j.home, away: j.away,
      placedIn: j.placements.map(p => `${p.club}/${p.folder}`)
    }))
  };
  fs.writeFileSync(path.join(args.out, 'manifest.json'),
                   JSON.stringify(manifest, null, 2));
  console.log(`  manifest.json written`);
  if (manifest.panelsMerge.length) {
    console.log(`  note: ${manifest.panelsMerge.length} graphics have two ` +
                `near-identical primaries (separated by the seam bands only)`);
  }

  /* ---- zip ---- */
  if (args.zip) {
    const zipDir = path.join(args.out, 'zips');
    fs.mkdirSync(zipDir, { recursive: true });
    const groups = new Map();
    if (args.split === 'club') {
      for (const c of fs.readdirSync(treeDir)) groups.set(c, [c]);
    } else if (args.split === 'division') {
      for (const j of jobs) {
        for (const pl of j.placements) {
          const div = data.members.get(pl.club)?.division || 'Other';
          if (!groups.has(div)) groups.set(div, []);
          if (!groups.get(div).includes(pl.club)) groups.get(div).push(pl.club);
        }
      }
    } else {
      groups.set('match-graphics', fs.readdirSync(treeDir));
    }
    for (const [name, clubs] of groups) {
      const zipPath = path.join(zipDir, `${safeName(name)}.zip`);
      execFileSync('zip', ['-r', '-q', zipPath, ...clubs.map(safeName)],
                   { cwd: treeDir, maxBuffer: 1 << 28 });
      const mb = (fs.statSync(zipPath).size / 1e6).toFixed(1);
      console.log(`  zip  ${path.basename(zipPath)}  ${mb} MB  (${clubs.length} club(s))`);
    }
  }

  console.log(`\nDone. Output: ${args.out}`);
}

main().catch(e => { console.error(e); process.exit(1); });
