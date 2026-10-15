/* Matchday Live — the three functions' real code (matchday-live.js) against the
   database, auth and storage emulators: the auth trigger's grant and refusals,
   the minute sync (mirror, auto-match, no-op on an unchanged run) and the
   retention sweep. Run from the scratch directory — see README.md. */
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
process.env.GCLOUD_PROJECT = 'nl-tools';
const assert = require('assert');
const crypto = require('crypto');
const FN = process.env.NL_REPO + '/functions/';
const admin = require(FN + 'node_modules/firebase-admin');
const index = require(FN + 'index.js');
const M = require(FN + 'matchday-live.js');
const db = admin.database();
const wdb = admin.apps.find((a) => a.name === 'nls-widgets') ||
  admin.initializeApp({ databaseURL: 'https://nl-widgets-default-rtdb.europe-west1.firebasedatabase.app' }, 'nls-widgets');
const W = wdb.database();
const R = 'app-data/media-matchday-live';
const YMD = '2026-10-17';
const TOKEN = 'B'.repeat(32), HASH = crypto.createHash('sha256').update(TOKEN).digest('hex');

function ev(uid, val) {
  return { params: { uid }, data: { after: { exists: () => val != null, val: () => val } } };
}

(async () => {
  await db.ref().set(null); await W.ref().set(null);
  await db.ref(R).set({
    contributors: { c1: { name: 'Sam Test', type: 'club', active: true }, c2: { name: 'Off', type: 'media', active: false } },
    secrets: { c1: { tokenHash: HASH }, c2: { tokenHash: crypto.createHash('sha256').update('C'.repeat(32)).digest('hex') } },
    keys: { [HASH]: 'c1', [crypto.createHash('sha256').update('C'.repeat(32)).digest('hex')]: 'c2' },
  });

  // --- auth trigger
  await index.matchdayLiveAuth.run(ev('u1', { code: TOKEN }));
  let g = (await db.ref(R + '/authGrants/u1').once('value')).val();
  assert.equal(g.ok, true, JSON.stringify(g)); assert.equal(g.role, 'c1'); assert.equal(g.name, 'Sam Test');
  const payload = JSON.parse(Buffer.from(g.customToken.split('.')[1], 'base64url').toString());
  assert.equal(payload.uid, 'mdl-c1'); assert.equal(payload.claims.mdl, 'c1'); assert.equal(payload.claims.mdlGen, HASH.slice(0, 16));
  assert.equal((await db.ref(R + '/authRequests/u1').once('value')).exists(), false, 'request deleted');
  await index.matchdayLiveAuth.run(ev('u2', { code: 'C'.repeat(32) }));
  g = (await db.ref(R + '/authGrants/u2').once('value')).val();
  assert.equal(g.ok, false); assert.match(g.error, /no longer active/);
  await index.matchdayLiveAuth.run(ev('u3', { code: 'nope' }));
  assert.equal((await db.ref(R + '/authGrants/u3').once('value')).val().ok, false);
  await index.matchdayLiveAuth.run(ev('u4', null)); // delete event: no grant
  assert.equal((await db.ref(R + '/authGrants/u4').once('value')).exists(), false);
  console.log('auth trigger ok');

  // --- sync: no meta → no-op
  let r = await M._internals.runSync(Date.now());
  assert.equal(r.ran, false);
  // seed ingester output in the shape nls-ingester writes
  await W.ref('nls').set({
    meta: { ingest: { ymd: YMD, lastRun: 111 } },
    live: { index: {
      nl: { [YMD]: { m1: { id: 'm1', compKey: 'nl', ko: YMD + 'T14:00:00.000Z', period: 'secondhalf', live: true, finished: false,
        minute: 63, formattedMinute: "63'", home: { id: 't1', name: 'Home FC', score: 1 }, away: { id: 't2', name: 'Away', score: 0 }, updatedAt: 5 } } },
      cup: { [YMD]: { m9: { id: 'm9', compKey: 'cup', home: { id: 'a' }, away: { id: 'b' } } } },
    } },
    events: { [YMD]: { m1_t1_goal_0: { matchID: 'm1', type: 'goal', teamID: 't1', playerName: 'A Striker', minute: 62, detectedAt: 7 } } },
  });
  await db.ref(R + '/clips/' + YMD).set({
    p1: { contributorId: 'c1', matchId: 'm1', status: 'new', minute: 64, pendingEventMatch: true, createdAt: 1, storagePath: 'x', mimeType: 'video/mp4' },
    p2: { contributorId: 'c1', matchId: 'm1', status: 'new', minute: 80, pendingEventMatch: true, createdAt: 1, storagePath: 'y', mimeType: 'video/mp4' },
  });
  r = await M._internals.runSync(Date.now());
  assert.equal(r.ran, true); assert.equal(r.written, 1); assert.equal(r.matched, 1);
  const md = (await db.ref(R + '/matchdays/' + YMD).once('value')).val();
  assert.deepEqual(Object.keys(md), ['m1']); assert.equal(md.m1.events.m1_t1_goal_0.player, 'A Striker');
  const clips = (await db.ref(R + '/clips/' + YMD).once('value')).val();
  assert.equal(clips.p1.eventId, 'm1_t1_goal_0'); assert.equal(clips.p1.pendingEventMatch, undefined);
  assert.equal(clips.p2.pendingEventMatch, true);
  r = await M._internals.runSync(Date.now());
  assert.equal(r.ran, false, 'same ingester run → no-op');
  await W.ref('nls/meta/ingest/lastRun').set(222);
  r = await M._internals.runSync(Date.now());
  assert.equal(r.ran, true); assert.equal(r.written, 0, 'nothing moved → nothing written');
  await W.ref('nls/live/index/nl/' + YMD + '/m1/home/score').set(2);
  await W.ref('nls/meta/ingest/lastRun').set(333);
  r = await M._internals.runSync(Date.now());
  assert.equal(r.written, 1);
  assert.equal((await db.ref(R + '/matchdays/' + YMD + '/m1/home/score').once('value')).val(), 2);
  console.log('sync ok');

  // --- retention
  const bucket = admin.storage().bucket('nl-tools.firebasestorage.app');
  const day = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  const pathOld = 'matchday-live/' + day + '/c1/old.mp4', pathKeep = 'matchday-live/' + day + '/c1/keep.mp4';
  await bucket.file(pathOld).save(Buffer.from('x')); await bucket.file(pathKeep).save(Buffer.from('y'));
  await db.ref(R + '/clips/' + day).set({
    old: { contributorId: 'c1', status: 'rejected', reviewedAt: Date.now() - 8 * 86400000, storagePath: pathOld, createdAt: 1 },
    keep: { contributorId: 'c1', status: 'approved', reviewedAt: 1, storagePath: pathKeep, createdAt: 1 },
    stuck: { contributorId: 'c1', status: 'uploading', storagePath: 'matchday-live/' + day + '/c1/none.mp4', createdAt: 1 },
  });
  r = await M._internals.runRetention(Date.now());
  assert.deepEqual(r, { purged: 1, dropped: 1 });
  assert.equal((await bucket.file(pathOld).exists())[0], false);
  assert.equal((await bucket.file(pathKeep).exists())[0], true);
  const after = (await db.ref(R + '/clips/' + day).once('value')).val();
  assert.ok(after.old.purgedAt); assert.equal(after.stuck, undefined); assert.equal(after.keep.status, 'approved');
  r = await M._internals.runRetention(Date.now());
  assert.deepEqual(r, { purged: 0, dropped: 0 }, 'second run is a no-op');
  console.log('retention ok');
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
