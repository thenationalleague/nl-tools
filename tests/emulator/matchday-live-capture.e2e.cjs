/* Matchday Live — the capture page end to end in headless Chromium with a
   fake portrait camera (portrait.y4m, see README.md), against the emulators,
   with the real matchdayLiveAuth handler answering requests: no-token state,
   sign-in, record, pre-selected event, consent gate, upload, offline queue
   in IndexedDB, and a deactivated link refused. */
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
process.env.GCLOUD_PROJECT = 'nl-tools';
const assert = require('assert');
const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const REPO = process.env.NL_REPO;
const FN = REPO + '/functions/';
const admin = require(FN + 'node_modules/firebase-admin');
const index = require(FN + 'index.js');
const { chromium } = require('playwright');

const db = admin.database();
const R = 'app-data/media-matchday-live';
const YMD = new Date().toISOString().slice(0, 10);
const TOKEN = 'Tk' + 'x'.repeat(30);
const HASH = crypto.createHash('sha256').update(TOKEN).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, label) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(300); }
  throw new Error('timed out: ' + label);
}

(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8080', '--bind', '127.0.0.1'], { cwd: REPO, stdio: 'ignore' });
  await sleep(800);
  await db.ref().set(null);
  await db.ref(R).set({
    contributors: { c1: { name: 'Sam Test', type: 'club', club: 'Boreham Wood', clubOpta: 't1', active: true } },
    secrets: { c1: { tokenHash: HASH } },
    keys: { [HASH]: 'c1' },
    config: { consent: { version: 1, text: 'Draft wording line one.\nLine two.' } },
    matchdays: { [YMD]: { m1: {
      comp: 'nl', ko: YMD + 'T14:00:00.000Z', koMs: Date.now() - 70 * 60000, period: 'secondhalf', live: true, finished: false,
      minute: 63, fm: "63'", updatedAt: Date.now(),
      home: { id: 't1', name: 'Boreham Wood', score: 1 }, away: { id: 't2', name: 'Away Town', score: 0 },
      events: {
        m1_t1_goal_0: { kind: 'goal', minute: 62, fm: "62'", side: 'home', player: 'A Striker', at: 1 },
        m1_t2_booking_0: { kind: 'yellow', minute: 50, side: 'away', player: 'K Card', at: 1 },
      },
    } } },
  });
  // The trigger, as the platform would call it.
  const fire = (snap) => index.matchdayLiveAuth.run({ params: { uid: snap.key },
    data: { after: { exists: () => true, val: () => snap.val() } } });
  db.ref(R + '/authRequests').on('child_added', fire);
  db.ref(R + '/authRequests').on('child_changed', fire);

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--use-file-for-fake-video-capture=' + path.join(__dirname, 'portrait.y4m'),
      '--autoplay-policy=no-user-gesture-required', '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessChecks,PrivateNetworkAccessSendPreflights'],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.grantPermissions(['camera', 'microphone'], { origin: 'http://127.0.0.1:8080' });
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route('https://www.gstatic.com/firebasejs/**', (route) => {
    const f = route.request().url().split('/').pop();
    route.fulfill({ path: path.join(__dirname, 'node_modules/firebase', f), contentType: 'application/javascript' });
  });
  await page.route('https://use.typekit.net/**', (route) => route.abort());
  await page.route('**/matchday-live/c/', async (route) => {
    const resp = await route.fetch();
    let html = await resp.text();
    html = html.replace(/(appId:\s*"[^"]+"\s*\n\s*\}\);)/,
      "$1\n    firebase.auth().useEmulator('http://127.0.0.1:9099', { disableWarnings: true });" +
      "\n    firebase.database().useEmulator('127.0.0.1', 9000);" +
      "\n    firebase.storage().useEmulator('127.0.0.1', 9199);");
    assert.ok(html.includes('useEmulator'), 'emulator injection');
    await route.fulfill({ response: resp, body: html });
  });

  // 1. No token at all
  await page.goto('http://127.0.0.1:8080/matchday-live/c/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#s-stop:not([hidden])', { timeout: 20000 });
  assert.match(await page.textContent('#stopMsg'), /personal link/);
  console.log('no-token state ok');

  // 2. Valid link → home
  await page.goto('http://127.0.0.1:8080/matchday-live/c/#' + TOKEN, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector('#s-home:not([hidden])', { timeout: 40000 }); }
  catch (e) {
    console.log('STATE', await page.evaluate(() => ({
      screens: ['s-wait','s-stop','s-home','s-pick','s-review'].filter((i) => !document.getElementById(i).hidden),
      stop: document.getElementById('stopMsg').textContent, wait: document.getElementById('waitMsg').textContent })));
    console.log('ERRORS', errors.join('\n'));
    console.log('DB', JSON.stringify((await db.ref(R).once('value')).val()).slice(0, 1500));
    throw e;
  }
  assert.match(await page.textContent('#idSub'), /Hi Sam · Boreham Wood/);
  assert.match(await page.textContent('#matchBox'), /1–0/);
  assert.match(await page.textContent('#matchBox'), /63′/);
  console.log('signed in, match shown');

  // 3. Record ~3s, stop
  await page.click('#btnRecord');
  await page.waitForSelector('#cam:not([hidden])');
  await sleep(1500);
  assert.equal(await page.isVisible('#upright'), false, 'portrait viewport is not flagged');
  await page.click('#btnRec');
  await sleep(3000);
  await page.click('#btnRec');
  await page.waitForSelector('#s-review:not([hidden])', { timeout: 10000 });
  await page.waitForFunction(() => document.getElementById('preview').videoHeight > 0, null, { timeout: 10000 });
  const dims = await page.evaluate(() => [document.getElementById('preview').videoWidth, document.getElementById('preview').videoHeight]);
  console.log('recorded', dims.join('x'));
  assert.deepEqual(dims, [720, 1280], 'drawn onto the fixed upright frame');
  assert.equal(await page.isDisabled('#btnSend'), false);
  const pressed = await page.textContent('.cap-opt[aria-pressed="true"]');
  assert.match(pressed, /A Striker/, 'recent goal pre-selected, got: ' + pressed);
  assert.equal(await page.isVisible('#consentBox'), true);
  assert.match(await page.textContent('#tagList'), /Just happened/);

  // 4. Send without consent → refused; with → sent
  await page.fill('#caption', 'Back post header');
  await page.click('#btnSend');
  assert.equal(await page.isVisible('#s-review'), true, 'blocked without consent');
  await page.check('#consentTick');
  await page.click('#btnSend');
  const first = await until(async () => {
    const v = (await db.ref(R + '/clips/' + YMD).once('value')).val() || {};
    const k = Object.keys(v).find((id) => v[id].status === 'new');
    return k ? Object.assign({ id: k }, v[k]) : null;
  }, 30000, 'first clip new');
  assert.equal(first.eventId, 'm1_t1_goal_0');
  assert.equal(first.caption, 'Back post header');
  assert.equal(first.scoreAtTime, '1–0');
  assert.equal(first.contributorId, 'c1');
  const [meta] = await admin.storage().bucket('nl-tools.firebasestorage.app').file(first.storagePath).getMetadata();
  assert.ok(Number(meta.size) > 1000, 'video uploaded: ' + meta.size);
  assert.match(meta.contentType, /^video\//);
  assert.equal((await db.ref(R + '/consent/c1/version').once('value')).val(), 1);
  assert.equal((await db.ref(R + '/quota/' + YMD + '/c1').once('value')).val(), 1);
  await page.waitForFunction(() => /1 clip sent today/.test(document.getElementById('sentToday').textContent), null, { timeout: 10000 });
  console.log('clip sent:', first.storagePath, meta.size + ' bytes', meta.contentType);

  // 5. Offline: queued, then sent on reconnect (and the 30s pace waited out)
  await page.click('#btnRecord');
  await page.waitForSelector('#cam:not([hidden])');
  await sleep(1000);
  await page.click('#btnRec'); await sleep(2000); await page.click('#btnRec');
  await page.waitForSelector('#s-review:not([hidden])');
  assert.equal(await page.isVisible('#consentBox'), false, 'consent not asked twice');
  await page.click('.cap-opt >> text=General update');
  await ctx.setOffline(true);
  await page.click('#btnSend');
  await page.waitForFunction(() => /waiting for signal/.test(document.getElementById('queueNote').textContent), null, { timeout: 5000 });
  const queued = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('matchday-live', 1);
    r.onsuccess = () => { const g = r.result.transaction('queue').objectStore('queue').getAll(); g.onsuccess = () => res(g.result.length); };
  }));
  assert.equal(queued, 1, 'clip held in IndexedDB');
  console.log('offline: queued in IndexedDB');
  await ctx.setOffline(false);
  const second = await until(async () => {
    const v = (await db.ref(R + '/clips/' + YMD).once('value')).val() || {};
    const k = Object.keys(v).find((id) => id !== first.id && v[id].status === 'new');
    return k ? v[k] : null;
  }, 90000, 'second clip new');
  assert.equal(second.eventId, undefined);
  assert.equal((await db.ref(R + '/quota/' + YMD + '/c1').once('value')).val(), 2);
  await page.waitForFunction(() => document.getElementById('queueNote').hidden, null, { timeout: 10000 });
  console.log('back online: sent, queue empty');

  // 6. Test link: pick a match from days ago, filed under that day, marked test
  const OLD = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  await db.ref(R + '/matchdays/' + OLD + '/old1').set({ comp: 'south', ko: OLD + 'T14:00:00.000Z', koMs: Date.parse(OLD + 'T14:00:00.000Z'),
    period: 'fulltime', live: false, finished: true, home: { id: 't8', name: 'Old Home', score: 3 }, away: { id: 't9', name: 'Old Away', score: 3 } });
  await db.ref(R + '/contributors/c1/test').set(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#s-pick:not([hidden])', { timeout: 30000 });
  assert.match(await page.textContent('#pickList'), /Old Home 3–3 Old Away/);
  await page.click('.cap-opt >> text=Old Home');
  await page.waitForSelector('#s-home:not([hidden])');
  assert.equal(await page.isVisible('#testNote'), true);
  await sleep(31000);   // the 30-second pace from the last clip
  await page.click('#btnRecord');
  await page.waitForSelector('#cam:not([hidden])');
  await sleep(1000);
  await page.click('#btnRec'); await sleep(2000); await page.click('#btnRec');
  await page.waitForSelector('#s-review:not([hidden])');
  await page.click('#btnSend');
  const old = await until(async () => {
    const v = (await db.ref(R + '/clips/' + OLD).once('value')).val() || {};
    const k = Object.keys(v).find((id) => v[id].status === 'new');
    return k ? v[k] : null;
  }, 30000, 'test clip new');
  assert.equal(old.test, true); assert.equal(old.matchId, 'old1');
  assert.match(old.storagePath, new RegExp('^matchday-live/' + OLD + '/'));
  console.log('test link: past match filed under its own day, marked test');
  await db.ref(R + '/contributors/c1/test').set(null);

  // 7. No match yet → the page picks today's up when it arrives, no reload
  await db.ref(R + '/matchdays/' + YMD).set(null);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /No Boreham Wood match today/.test(document.getElementById('matchBox').textContent), null, { timeout: 30000 });
  await db.ref(R + '/matchdays/' + YMD + '/m2').set({ comp: 'nl', ko: YMD + 'T19:45:00.000Z', koMs: Date.now() + 3600000,
    period: 'prematch', live: false, finished: false, home: { id: 't1', name: 'Boreham Wood', score: null }, away: { id: 't3', name: 'Late Arrivals' } });
  await page.waitForFunction(() => /Late Arrivals/.test(document.getElementById('matchBox').textContent), null, { timeout: 10000 });
  console.log('fixtures arriving later are picked up without a reload');

  // 8. Deactivate → the page refuses on next load
  await db.ref(R + '/contributors/c1/active').set(false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#s-stop:not([hidden])', { timeout: 60000 });
  assert.match(await page.textContent('#stopMsg'), /no longer active/);
  console.log('deactivated link refused');

  // 9. A camera that hands over a WIDE picture (what phones do) still gives
  //    an upright file and a usable Send button — the v1.1 bug.
  await db.ref(R + '/contributors/c1/active').set(true);
  await db.ref(R + '/matchdays/' + YMD + '/m2/koMs').set(Date.now() - 600000);
  const wide = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--use-file-for-fake-video-capture=' + path.join(__dirname, 'landscape.y4m'),
      '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessChecks,PrivateNetworkAccessSendPreflights'],
  });
  const wctx = await wide.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await wctx.grantPermissions(['camera', 'microphone'], { origin: 'http://127.0.0.1:8080' });
  const wp = await wctx.newPage();
  await wp.route('https://use.typekit.net/**', (r) => r.abort());
  await wp.route('https://www.gstatic.com/firebasejs/**', (r) => r.fulfill({ path: path.join(__dirname, 'node_modules/firebase', r.request().url().split('/').pop()), contentType: 'application/javascript' }));
  await wp.route('**/matchday-live/c/?debug', async (route) => {
    const resp = await route.fetch();
    const html = (await resp.text()).replace(/(appId:\s*"[^"]+"\s*\n\s*\}\);)/,
      "$1\n    firebase.auth().useEmulator('http://127.0.0.1:9099', { disableWarnings: true });" +
      "\n    firebase.database().useEmulator('127.0.0.1', 9000);\n    firebase.storage().useEmulator('127.0.0.1', 9199);");
    await route.fulfill({ response: resp, body: html });
  });
  await wp.goto('http://127.0.0.1:8080/matchday-live/c/?debug#' + TOKEN, { waitUntil: 'domcontentloaded' });
  await wp.waitForSelector('#s-home:not([hidden])', { timeout: 60000 });
  await wp.click('#btnRecord');
  await wp.waitForFunction(() => /track/.test(document.getElementById('camDebug').textContent), null, { timeout: 10000 });
  console.log('wide camera reports:', await wp.textContent('#camDebug'));
  await wp.click('#btnRec'); await sleep(2000); await wp.click('#btnRec');
  await wp.waitForSelector('#s-review:not([hidden])');
  await wp.waitForFunction(() => document.getElementById('preview').videoHeight > 0, null, { timeout: 10000 });
  const wdims = await wp.evaluate(() => [document.getElementById('preview').videoWidth, document.getElementById('preview').videoHeight]);
  assert.deepEqual(wdims, [720, 1280], 'wide camera → upright file');
  assert.equal(await wp.isVisible('#sidewaysNote'), false, 'no false sideways warning');
  assert.equal(await wp.isDisabled('#btnSend'), false);
  console.log('wide camera: upright 720x1280, Send enabled —', await wp.textContent('#reviewDebug'));
  await wide.close();

  const real = errors.filter((e) => !/favicon|crests|Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(e));
  if (real.length) console.log('page errors:\n' + real.join('\n'));
  await browser.close();
  server.kill();
  process.exit(real.length ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
