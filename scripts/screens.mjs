/* Screenshots a tool page at the screens people actually use, signed in, so a
   change is looked at on a small screen before it ships, not after.

   WHY THIS EXISTS
   Richard works on a 1920×1200 monitor at 100%. Most staff have 1920×1080
   with Windows scaling at 150%, which leaves the browser about 1280×600 to
   draw in, a third less in each direction. A page built and checked only on
   the big screen came out cramped and scrolling on the common one
   (Fixture Management's rearrangement calendar, 28/10/2026). CLAUDE.md,
   "Two screens", is the rule; this is how it gets checked.

   WHAT IT DOES
   Serves the repo on a free port, stands in for Firebase (an in-memory
   database, seeded from --seed) and auth-guard (a signed-in superadmin with
   admin on the tool), opens the page, clicks anything given with --click,
   and saves one PNG per screen:

     desktop  1920×1080  (1920×1200 at 100%, less the browser's own bars)
     laptop   1280×600   (1920×1080 at 150%)
     phone    390×844

   For each it prints how far the page scrolls down and whether anything runs
   off the side. It exits 1 on a page error, or on sideways overflow on any
   screen: that is broken on any screen. Scrolling down is reported, not
   failed. A fixed layout may scroll on the laptop; it must not rearrange.

   USAGE
     node scripts/screens.mjs /fixtures/admin/ --seed <db.json> \
       --click '[data-tab="rearrange"]' --out <dir>

   --seed is a JSON copy of the database tree the page reads ({"app-data":
   {...}}). It is never committed (CLAUDE.md, Data handling): keep it in a
   scratch folder. --out defaults to a folder in the system temp directory.

   Not wired into `npm test`: it needs a Chromium that CI does not install.
   It exits 0 and says so if no browser is available. */

import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));

const SCREENS = [
  { name: 'desktop', width: 1920, height: 1080, note: '1920×1200 at 100%' },
  { name: 'laptop', width: 1280, height: 600, note: '1920×1080 at 150%' },
  { name: 'phone', width: 390, height: 844, note: 'phone' }
];

function args(argv) {
  const o = { page: null, seed: null, out: join(tmpdir(), 'nl-screens'), click: [], wait: 1500 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') o.seed = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--click') o.click.push(argv[++i]);
    else if (a === '--wait') o.wait = +argv[++i];
    else if (!o.page) o.page = a;
  }
  return o;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon' };

/* The repo as Pages serves it: a folder means its index.html. */
function serve() {
  return new Promise((ok) => {
    const srv = http.createServer(async (q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = join(REPO, p);
      if (!f.startsWith(REPO)) { r.writeHead(403); r.end(); return; }
      try {
        const b = await readFile(f);
        r.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
        r.end(b);
      } catch { r.writeHead(404); r.end(); }
    });
    /* Port 0: a leftover server from an earlier run cannot make this one die
       on bind and look like a pass (CLAUDE.md, stubbing). */
    srv.listen(0, '127.0.0.1', () => ok(srv));
  });
}

/* Firebase compat, as far as a tool page uses it: ref().on/once/off/set/
   update/push/remove against an in-memory tree, so saves round-trip. */
const FIREBASE = `
window.__db = window.__seed || {};
function get(p){return p.split('/').filter(Boolean).reduce((o,k)=>o&&o[k],window.__db)}
function put(p,v){const ks=p.split('/').filter(Boolean);let o=window.__db;ks.slice(0,-1).forEach(k=>{o[k]=o[k]||{};o=o[k]});
  if(v===null)delete o[ks[ks.length-1]];else o[ks[ks.length-1]]=JSON.parse(JSON.stringify(v))}
const L=[];function fire(){L.forEach(([p,cb])=>cb({val:()=>get(p),exists:()=>get(p)!=null}))}
function snap(p){return {val:()=>get(p),exists:()=>get(p)!=null}}
window.firebase={apps:[1],initializeApp(){},app(){return{}},
  auth(){return{currentUser:{uid:'screens',email:'screens@example.invalid',getIdToken:()=>Promise.resolve('t')},
    onAuthStateChanged(cb){cb(this.currentUser);return()=>{}}}},
  database(){return{ref(p){p=p||'';return{
    on(e,cb){L.push([p,cb]);cb(snap(p));return cb},off(){for(let i=L.length-1;i>=0;i--)if(L[i][0]===p)L.splice(i,1)},
    once(){return Promise.resolve(snap(p))},
    set(v){put(p,v);fire();return Promise.resolve()},
    update(o){Object.keys(o).forEach(k=>put(p+'/'+k,o[k]));fire();return Promise.resolve()},
    remove(){put(p,null);fire();return Promise.resolve()},
    push(v){const k='k'+Date.now()+Math.random().toString(36).slice(2,6);if(v!==undefined)put(p+'/'+k,v);fire();return Object.assign(Promise.resolve(),{key:k})},
    orderByChild(){return this},limitToLast(){return this},equalTo(){return this},child(c){return window.firebase.database().ref(p+'/'+c)}
  }}}}};`;

const GUARD = `document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('pageWrap').style.display='block';
  window.nlAuthReady&&window.nlAuthReady({role:'superadmin',toolLevel:'admin',email:'screens@example.invalid',uid:'screens',name:'Screens'});
});`;

async function main() {
  const o = args(process.argv.slice(2));
  if (!o.page) { console.error('usage: node scripts/screens.mjs <page path> [--seed db.json] [--click selector]... [--out dir]'); process.exit(2); }
  let chromium;
  /* import() ignores NODE_PATH, where a machine-wide Playwright lives;
     require() does not. */
  try { ({ chromium } = await import('playwright')); }
  catch {
    try { ({ chromium } = createRequire(import.meta.url)('playwright')); }
    catch { console.log('screens: no Playwright here, nothing checked.'); return; }
  }
  const seed = o.seed ? JSON.parse(readFileSync(o.seed, 'utf8')) : {};
  await mkdir(o.out, { recursive: true });

  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  let browser;
  try { browser = await chromium.launch(); }
  catch (e) { console.log('screens: no browser here, nothing checked (' + e.message.split('\n')[0] + ')'); srv.close(); return; }

  let failed = false;
  for (const sc of SCREENS) {
    const pg = await browser.newPage({ viewport: { width: sc.width, height: sc.height } });
    const errors = [];
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.route('**/*', (rt) => {
      const u = rt.request().url();
      if (u.includes('gstatic.com/firebasejs')) return rt.fulfill({ body: u.includes('app-compat') ? FIREBASE : '', contentType: 'text/javascript' });
      if (u.includes('/system/auth-guard.js')) return rt.fulfill({ body: GUARD, contentType: 'text/javascript' });
      if (u.startsWith(base)) return rt.continue();
      return rt.fulfill({ status: 404, body: '' });
    });
    /* Pages fetch their own assets by absolute site URL; keep those local. */
    await pg.addInitScript(() => {
      const f = window.fetch;
      window.fetch = (u, x) => f(String(u).replace(/^https?:\/\/nl\.tools/, ''), x);
    });
    await pg.addInitScript((sd) => { window.__seed = sd; }, seed);
    await pg.goto(base + o.page);
    await pg.waitForTimeout(o.wait);
    for (const sel of o.click) { await pg.click(sel); await pg.waitForTimeout(600); }
    const m = await pg.evaluate(() => ({
      down: document.documentElement.scrollHeight - innerHeight,
      side: document.documentElement.scrollWidth - innerWidth
    }));
    const file = join(o.out, sc.name + '.png');
    await pg.screenshot({ path: file });
    const bad = m.side > 0 || errors.length;
    if (bad) failed = true;
    console.log((bad ? 'FAIL ' : 'ok   ') + sc.name.padEnd(8) + (sc.width + '×' + sc.height).padEnd(11) + sc.note.padEnd(20) +
      'scrolls ' + Math.max(0, m.down) + 'px down' + (m.side > 0 ? ', ' + m.side + 'px off the side' : '') + '  ' + file);
    errors.forEach((e) => console.log('       page error: ' + e));
    await pg.close();
  }
  await browser.close();
  srv.close();
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
