/* Matchday Live — the staff feed end to end behind the real auth-guard,
   against the emulators: stats, ordering, timeline, gap flag, approve,
   re-tag, share text, live arrival, division filter, contributor add /
   new link / deactivate, consent wording. Needs sample.mp4 (README.md). */
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
process.env.GCLOUD_PROJECT = 'nl-tools';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const REPO = process.env.NL_REPO;
const admin = require(REPO + '/functions/node_modules/firebase-admin');
admin.initializeApp({ databaseURL: 'https://nl-tools-default-rtdb.europe-west1.firebasedatabase.app' });
const { chromium } = require('playwright');

const db = admin.database();
const R = 'app-data/media-matchday-live';
const YMD = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, label) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(300); }
  throw new Error('timed out: ' + label);
}
const EMU = "\n    firebase.auth().useEmulator('http://127.0.0.1:9099', { disableWarnings: true });" +
  "\n    firebase.database().useEmulator('127.0.0.1', 9000);" +
  "\n    if (firebase.storage) firebase.storage().useEmulator('127.0.0.1', 9199);";

(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8080', '--bind', '127.0.0.1'], { cwd: REPO, stdio: 'ignore' });
  await sleep(800);
  await db.ref().set(null);
  await admin.auth().createUser({ uid: 'staff1', email: 'staff@example.test', password: 'password1' }).catch(() => {});
  const reg = JSON.parse(fs.readFileSync(REPO + '/system/rtdb/tools-registry.snapshot.json', 'utf8'));
  const m = (id, extra) => Object.assign({ comp: 'nl', ko: YMD + 'T14:00:00.000Z', period: 'secondhalf', live: true,
    finished: false, minute: 80, fm: "80'", updatedAt: Date.now(),
    home: { id: 't1', name: 'Home ' + id, score: 1 }, away: { id: 't2', name: 'Away ' + id, score: 0 } }, extra);
  const clip = (extra) => Object.assign({ contributorId: 'c1', matchId: 'm1', status: 'new', createdAt: Date.now(),
    mimeType: 'video/mp4' }, extra);
  await db.ref().set({
    users: { staff1: { role: 'superadmin', name: 'Test Staff', email: 'staff@example.test' } },
    tools: { 'media-matchday-live': reg['media-matchday-live'] },
    'app-data': { 'media-matchday-live': {
      contributors: { c1: { name: 'Sam Test', type: 'club', club: 'Boreham Wood', active: true } },
      matchdays: { [YMD]: {
        m1: m('m1', { events: { g1: { kind: 'goal', minute: 62, side: 'home', player: 'A Striker', at: 1 } } }),
        m2: m('m2'),
        m3: m('m3', { comp: 'north', live: false, finished: true, period: 'fulltime' }),
      } },
      clips: { [YMD]: {
        k1: clip({ eventId: 'g1', minute: 63, caption: 'Back post', storagePath: 'matchday-live/' + YMD + '/c1/k1.mp4' }),
        k2: clip({ pendingEventMatch: true, minute: 79, storagePath: 'matchday-live/' + YMD + '/c1/k2.mp4' }),
        k3: clip({ generalKind: 'halftime', minute: 45, status: 'approved', storagePath: 'matchday-live/' + YMD + '/c1/k3.mp4' }),
        k4: clip({ status: 'uploading', minute: 81, storagePath: 'matchday-live/' + YMD + '/c1/k4.mp4' }),
      } },
    } },
  });
  const vid = fs.readFileSync(path.join(__dirname, 'sample.mp4'));
  await admin.storage().bucket('nl-tools.firebasestorage.app').file('matchday-live/' + YMD + '/c1/k1.mp4').save(vid, { contentType: 'video/mp4' });

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessChecks,PrivateNetworkAccessSendPreflights'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8080' });
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
  await page.route('https://www.gstatic.com/firebasejs/**', (route) => {
    route.fulfill({ path: path.join(__dirname, 'node_modules/firebase', route.request().url().split('/').pop()), contentType: 'application/javascript' });
  });
  await page.route('https://www.googletagmanager.com/**', (route) => route.fulfill({ body: '', contentType: 'application/javascript' }));
  await page.route('https://use.typekit.net/**', (route) => route.abort());
  await page.route('**/__signin', (route) => route.fulfill({ contentType: 'text/html', body:
    '<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>' +
    '<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>' +
    '<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>' +
    '<script>firebase.initializeApp({apiKey:"AIzaSyC3az3OMnU7TdqlaWp8yrO_EjgZ36l-mXU",authDomain:"nl-tools.firebaseapp.com",' +
    'databaseURL:"https://nl-tools-default-rtdb.europe-west1.firebasedatabase.app",projectId:"nl-tools",appId:"1:801354670005:web:05d8ebad3e7e63610d03fc"});' +
    EMU + 'firebase.auth().signInWithEmailAndPassword("staff@example.test","password1").then(function(){window.done=1;},function(e){window.done=e.message;});</script>' }));
  await page.route('**/matchday-live/', async (route) => {
    const resp = await route.fetch();
    let html = await resp.text();
    html = html.replace(/(appId:\s*"[^"]+"\s*\n\s*\}\);)/, '$1' + EMU);
    assert.ok(html.includes('useEmulator'));
    await route.fulfill({ response: resp, body: html });
  });

  await page.goto('http://127.0.0.1:8080/__signin', { waitUntil: 'domcontentloaded' });
  assert.equal(await page.waitForFunction(() => window.done).then((h) => h.jsonValue()), 1);

  await page.goto('http://127.0.0.1:8080/matchday-live/', { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector('.mdl-match', { timeout: 30000 }); }
  catch (e) { console.log('URL', page.url(), 'ERR', errors.join('\n')); throw e; }
  await sleep(500);
  assert.equal(await page.textContent('#statNew'), '2', 'uploading clip not counted');
  assert.equal(await page.textContent('#statApproved'), '1');
  assert.equal(await page.textContent('#statGaps'), '1');
  const cards = await page.$$eval('.mdl-match', (els) => els.map((e) => e.textContent));
  assert.match(cards[0], /Home m1/, 'match with clips first');
  assert.match(cards[0], /A Striker/);
  assert.match(cards[0], /Waiting for its event/);
  assert.match(cards[0], /General update · Half-time/);
  assert.match(cards[0], /Back post/);
  assert.match(cards.join(' '), /No clips yet/);
  await page.waitForFunction(() => Array.prototype.some.call(document.querySelectorAll('.mdl-clip video'), (v) => v.src.indexOf('127.0.0.1:9199') !== -1), null, { timeout: 15000 }).catch(async (e) => { console.log('VIDEOS', await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('.mdl-clip video, .mdl-clip__gone'), (v) => v.tagName + ':' + (v.src || v.textContent)))); console.log(errors.join('\n')); throw e; });
  console.log('feed renders: stats, ordering, timeline, gap flag, video URL');

  // approve k1
  const k1 = page.locator('.mdl-clip', { hasText: 'Back post' });
  await k1.locator('button', { hasText: 'Approve' }).click();
  await until(async () => (await db.ref(R + '/clips/' + YMD + '/k1/status').once('value')).val() === 'approved', 5000, 'approve');
  assert.equal((await db.ref(R + '/clips/' + YMD + '/k1/reviewedBy').once('value')).val(), 'staff1');
  // retag pending k2 onto the goal
  const k2sel = page.locator('.mdl-row', { hasText: 'Waiting for its event' }).locator('select');
  await k2sel.selectOption('g1');
  await until(async () => (await db.ref(R + '/clips/' + YMD + '/k2/eventId').once('value')).val() === 'g1', 5000, 'retag');
  assert.equal((await db.ref(R + '/clips/' + YMD + '/k2/pendingEventMatch').once('value')).val(), null);
  // reject + share text
  await page.locator('.mdl-clip', { hasText: 'Half-time' }).first().locator('button', { hasText: 'Reject' }).click().catch(() => {});
  await page.locator('.mdl-clip').first().locator('button', { hasText: 'Copy share text' }).click();
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(shared, /🎥 Sam Test \/ Boreham Wood/);
  console.log('approve, retag, share text ok');

  // live arrival → toast
  await db.ref(R + '/clips/' + YMD + '/k9').set(clip9());
  function clip9() { return { contributorId: 'c1', matchId: 'm2', status: 'new', createdAt: Date.now(), mimeType: 'video/mp4', minute: 81, storagePath: 'x' }; }
  await page.waitForFunction(() => /New clip: Sam Test · Home m2 v Away m2/.test((document.querySelector('.toast') || {}).textContent || ''), null, { timeout: 5000 });
  await page.waitForFunction(() => document.getElementById('statGaps').textContent === '0');
  console.log('live arrival toast + gap cleared');

  // division filter
  await page.click('#divs .chip[data-div="north"]');
  await page.waitForFunction(() => document.querySelectorAll('.mdl-match').length === 1);
  assert.match(await page.textContent('.mdl-match'), /Home m3/);
  await page.click('#divs .chip[data-div=""]');

  // contributors tab
  assert.equal(await page.isVisible('#tabs'), true, 'superadmin sees tabs');
  await page.click('#tabs .tab[data-pane="people"]');
  await page.click('#btnAdd');
  await page.fill('.modal input >> nth=0', 'New Reporter');
  await page.selectOption('.modal select', 'media');
  await page.fill('.modal .form-group:has-text("Outlet") input', 'Local Gazette');
  await page.click('.modal button:has-text("Add and issue link")');
  await page.waitForSelector('.modal .mdl-link');
  const link1 = await page.inputValue('.modal .mdl-link');
  const tok1 = link1.split('#')[1];
  assert.match(tok1, /^[A-Za-z0-9_-]{32}$/);
  const people = (await db.ref(R + '/contributors').once('value')).val();
  const newId = Object.keys(people).find((k) => people[k].name === 'New Reporter');
  assert.equal(people[newId].outlet, 'Local Gazette');
  assert.equal(people[newId].type, 'media');
  const h1 = crypto.createHash('sha256').update(tok1).digest('hex');
  assert.equal((await db.ref(R + '/secrets/' + newId + '/tokenHash').once('value')).val(), h1);
  assert.equal((await db.ref(R + '/keys/' + h1).once('value')).val(), newId);
  await page.click('.modal button:has-text("Done")');
  console.log('contributor added; link hash stored, token not');

  await page.locator('#people tr', { hasText: 'New Reporter' }).locator('button', { hasText: 'New link' }).click();
  await page.click('.modal button:has-text("Issue new link")');
  await page.waitForSelector('.modal .mdl-link');
  const tok2 = (await page.inputValue('.modal .mdl-link')).split('#')[1];
  assert.notEqual(tok2, tok1);
  const h2 = crypto.createHash('sha256').update(tok2).digest('hex');
  assert.equal((await db.ref(R + '/keys/' + h1).once('value')).val(), null, 'old key gone');
  assert.equal((await db.ref(R + '/keys/' + h2).once('value')).val(), newId);
  await page.click('.modal button:has-text("Done")');
  console.log('link rotated');

  await page.locator('#people tr', { hasText: 'New Reporter' }).locator('button', { hasText: 'Deactivate' }).click();
  await page.click('.modal button.btn--danger');
  await until(async () => (await db.ref(R + '/contributors/' + newId + '/active').once('value')).val() === false, 5000, 'deactivate');
  console.log('deactivated');

  await page.fill('#consentText', 'Draft licence wording.');
  await page.click('#btnConsent');
  await page.click('.modal button:has-text("Save")');
  await until(async () => ((await db.ref(R + '/config/consent').once('value')).val() || {}).version === 1, 5000, 'consent');
  await page.waitForFunction(() => document.getElementById('consentVer').textContent === 'Version 1');
  console.log('consent wording saved as v1');

  const real = errors.filter((e) => !/Failed to load resource|ERR_TUNNEL|fonts|crests/.test(e));
  if (real.length) console.log('page errors:\n' + real.join('\n'));
  await browser.close();
  server.kill();
  process.exit(real.length ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
