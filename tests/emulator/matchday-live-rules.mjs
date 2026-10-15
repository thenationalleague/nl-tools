/* Matchday Live — the RTDB and Storage rules, against the Firebase emulator.

   NOT part of `npm test`: it needs firebase-tools and Java, and CI is
   zero-dependency. Run it by hand whenever the media-matchday-live rules or
   the matchday-live Storage block change — see tests/emulator/README.md.

   It reads the deployed snapshots straight from system/, so what passes here
   is what the deploy-rtdb-rules and deploy-storage-rules workflows ship.
   Every assertFails was watched pass for the right reason: the Storage
   overwrite case failed first (13.35 allowed a second put on `allow create`),
   which is why that block carries `resource == null`. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';

const REPO = process.env.NL_REPO || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = 'app-data/media-matchday-live';
const TS = { '.sv': 'timestamp' };
const YMD = '2026-10-17';
const TOKEN = 'A'.repeat(32);
const HASH = crypto.createHash('sha256').update(TOKEN).digest('hex');
const GEN = HASH.slice(0, 16);

const env = await initializeTestEnvironment({
  projectId: 'demo-mdl',
  database: { rules: readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8'), host: '127.0.0.1', port: 9000 },
  storage: { rules: readFileSync(join(REPO, 'system/storage/rules.snapshot.rules'), 'utf8'), host: '127.0.0.1', port: 9199 },
});

async function seed() {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref().set({
      users: {
        sa: { role: 'superadmin' },
        la: { role: 'admin' },
        laOff: { role: 'admin', tools: { 'media-matchday-live': 'off' } },
        st: { role: 'staff' },
        stAdm: { role: 'staff', tools: { 'media-matchday-live': 'admin' } },
      },
      'app-data': { 'media-matchday-live': {
        contributors: {
          c1: { name: 'Test One', type: 'club', active: true },
          c2: { name: 'Test Two', type: 'media', active: false },
        },
        secrets: { c1: { tokenHash: HASH }, c2: { tokenHash: HASH } },
        keys: { [HASH]: 'c1' },
        matchdays: { [YMD]: { m1: { comp: 'nl', home: { name: 'H' }, away: { name: 'A' } } } },
        config: { consent: { version: 1, text: 'x' } },
      } },
    });
  });
}

const contrib = (id = 'c1', gen = GEN) =>
  env.authenticatedContext('mdl-' + id, { mdl: id, mdlGen: gen }).database();
const user = (uid, extra = {}) =>
  env.authenticatedContext(uid, Object.assign({ email: uid + '@example.test' }, extra)).database();
const anon = () => env.unauthenticatedContext().database();

function clipUpdate(id, clipId, extra = {}) {
  return {
    ['clips/' + YMD + '/' + clipId]: Object.assign({
      contributorId: id, matchId: 'm1', status: 'uploading', createdAt: TS,
      storagePath: 'matchday-live/' + YMD + '/' + id + '/' + clipId + '.webm',
      mimeType: 'video/webm', minute: 63, caption: 'Back post', eventId: 'e1',
    }, extra),
    ['pace/' + id]: TS,
    ['quota/' + YMD + '/' + id]: 1,
  };
}

test.beforeEach(seed);
test.after(() => env.cleanup());

test('signed-out client reads nothing', async () => {
  for (const p of ['contributors', 'secrets', 'keys', 'clips/' + YMD, 'matchdays/' + YMD, 'config', 'consent', 'meta']) {
    await assertFails(anon().ref(R + '/' + p).once('value'));
  }
});

test('anonymous (pre-handshake) client can only write its own auth request', async () => {
  const a = env.authenticatedContext('anon1', { firebase: { sign_in_provider: 'anonymous' } }).database();
  await assertSucceeds(a.ref(R + '/authRequests/anon1').set({ code: TOKEN, at: TS }));
  await assertFails(a.ref(R + '/authRequests/other').set({ code: TOKEN }));
  await assertFails(a.ref(R + '/matchdays/' + YMD).once('value'));
  await assertFails(a.ref(R + '/authGrants/anon1').set({ ok: true }));
  await assertSucceeds(a.ref(R + '/authGrants/anon1').remove());
});

test('contributor: reads today, own record, consent text; not the list', async () => {
  const d = contrib();
  await assertSucceeds(d.ref(R + '/matchdays/' + YMD).once('value'));
  await assertSucceeds(d.ref(R + '/contributors/c1').once('value'));
  await assertSucceeds(d.ref(R + '/config/consent').once('value'));
  await assertFails(d.ref(R + '/contributors').once('value'));
  await assertFails(d.ref(R + '/contributors/c2').once('value'));
  await assertFails(d.ref(R + '/clips/' + YMD).once('value'));
  await assertFails(d.ref(R + '/secrets/c1').once('value'));
});

test('contributor: create clip, then finish it; nothing more', async () => {
  const d = contrib();
  await assertSucceeds(d.ref(R).update(clipUpdate('c1', 'k1')));
  await assertSucceeds(d.ref(R + '/clips/' + YMD + '/k1').once('value'));
  await assertSucceeds(d.ref(R + '/clips/' + YMD + '/not-yet').once('value'));
  await assertFails(d.ref(R + '/clips/' + YMD + '/k1/status').set('approved'));
  await assertSucceeds(d.ref(R + '/clips/' + YMD + '/k1/status').set('new'));
  await assertFails(d.ref(R + '/clips/' + YMD + '/k1/status').set('new'));
  await assertFails(d.ref(R + '/clips/' + YMD + '/k1/caption').set('edited'));
  await assertFails(d.ref(R + '/clips/' + YMD + '/k1').remove());
});

test('contributor: clip without pace + quota in the same write is refused', async () => {
  const d = contrib();
  const u = clipUpdate('c1', 'k1');
  await assertFails(d.ref(R + '/clips/' + YMD + '/k1').set(u['clips/' + YMD + '/k1']));
  delete u['quota/' + YMD + '/c1'];
  await assertFails(d.ref(R).update(u));
});

test('contributor: 30-second pace, and pace cannot be reset by deleting it', async () => {
  const d = contrib();
  await assertSucceeds(d.ref(R).update(clipUpdate('c1', 'k1')));
  const u2 = clipUpdate('c1', 'k2'); u2['quota/' + YMD + '/c1'] = 2;
  await assertFails(d.ref(R).update(u2));
  await assertFails(d.ref(R + '/pace/c1').remove());
  await assertFails(d.ref(R + '/quota/' + YMD + '/c1').remove());
});

test('contributor: 20 clips a day, not 21', async () => {
  await env.withSecurityRulesDisabled((ctx) => ctx.database().ref(R).update({
    'pace/c1': 1, ['quota/' + YMD + '/c1']: 19,
  }));
  const d = contrib();
  const u = clipUpdate('c1', 'k20'); u['quota/' + YMD + '/c1'] = 20;
  await assertSucceeds(d.ref(R).update(u));
  await env.withSecurityRulesDisabled((ctx) => ctx.database().ref(R + '/pace/c1').set(1));
  const u2 = clipUpdate('c1', 'k21'); u2['quota/' + YMD + '/c1'] = 21;
  await assertFails(d.ref(R).update(u2));
});

test("contributor: cannot read someone else's clip", async () => {
  await env.withSecurityRulesDisabled((ctx) => ctx.database().ref(R + '/clips/' + YMD + '/theirs')
    .set({ contributorId: 'c2', matchId: 'm1', status: 'new', createdAt: 1, mimeType: 'video/mp4',
      storagePath: 'matchday-live/' + YMD + '/c2/theirs.mp4' }));
  await assertFails(contrib().ref(R + '/clips/' + YMD + '/theirs').once('value'));
});

test('contributor: cannot file under another id or another path', async () => {
  const d = contrib();
  await assertFails(d.ref(R).update(clipUpdate('c2', 'k1')));
  const u = clipUpdate('c1', 'k1');
  u['clips/' + YMD + '/k1'].storagePath = 'matchday-live/' + YMD + '/c9/k1.webm';
  await assertFails(d.ref(R).update(u));
  const u3 = clipUpdate('c1', 'k1', { status: 'approved' });
  await assertFails(d.ref(R).update(u3));
  const u4 = clipUpdate('c1', 'k1', { caption: 'x'.repeat(81) });
  await assertFails(d.ref(R).update(u4));
  const u5 = clipUpdate('c1', 'k1', { sneaky: true });
  await assertFails(d.ref(R).update(u5));
});

test('rotated link (gen mismatch) and deactivated contributor are refused at once', async () => {
  const stale = contrib('c1', 'f'.repeat(16));
  await assertFails(stale.ref(R + '/matchdays/' + YMD).once('value'));
  await assertFails(stale.ref(R).update(clipUpdate('c1', 'k1')));
  const off = contrib('c2');
  await assertFails(off.ref(R + '/matchdays/' + YMD).once('value'));
  await assertFails(off.ref(R).update(clipUpdate('c2', 'k1')));
});

test('contributor: consent once, stamped by the server', async () => {
  const d = contrib();
  await assertSucceeds(d.ref(R + '/consent/c1').set({ version: 1, at: TS }));
  await assertFails(d.ref(R + '/consent/c1').set({ version: 1, at: 5 }));
  await assertFails(d.ref(R + '/consent/c2').set({ version: 1, at: TS }));
});

test('reviewers: League Admin by default, explicit off and plain staff refused', async () => {
  await contrib().ref(R).update(clipUpdate('c1', 'k1'));
  const la = user('la');
  await assertSucceeds(la.ref(R + '/clips/' + YMD).once('value'));
  await assertSucceeds(la.ref(R + '/contributors').once('value'));
  await assertSucceeds(la.ref(R + '/clips/' + YMD + '/k1').update({ status: 'approved', reviewedBy: 'la', reviewedAt: TS }));
  await assertSucceeds(la.ref(R + '/clips/' + YMD + '/k1').update({ eventId: 'e2', pendingEventMatch: null }));
  await assertFails(la.ref(R + '/clips/' + YMD + '/k1').update({ contributorId: 'c2' }));
  await assertFails(la.ref(R + '/clips/' + YMD + '/k1').remove());
  await assertFails(la.ref(R + '/secrets').once('value'));
  await assertFails(la.ref(R + '/contributors/c3').set({ name: 'X', type: 'club', active: true }));
  await assertFails(user('laOff').ref(R + '/clips/' + YMD).once('value'));
  await assertFails(user('st').ref(R + '/clips/' + YMD).once('value'));
});

test('tool admins manage contributors, links and consent wording', async () => {
  for (const uid of ['sa', 'stAdm']) {
    const d = user(uid);
    const h = crypto.createHash('sha256').update(uid).digest('hex');
    await assertSucceeds(d.ref(R).update({
      ['contributors/n_' + uid]: { name: 'New', type: 'media', active: true },
      ['secrets/n_' + uid]: { tokenHash: h },
      ['keys/' + h]: 'n_' + uid,
    }));
    await assertSucceeds(d.ref(R + '/secrets').once('value'));
    await assertFails(d.ref(R + '/keys').once('value'));
    await assertSucceeds(d.ref(R + '/config/consent').set({ version: 2, text: 'y' }));
  }
  await assertFails(user('la').ref(R + '/config/consent').set({ version: 2, text: 'y' }));
});

test('nobody but the function writes matchdays or meta', async () => {
  await assertFails(user('sa').ref(R + '/matchdays/' + YMD + '/m1').set({ x: 1 }));
  await assertFails(user('sa').ref(R + '/meta/sync').set({ x: 1 }));
});

/* ---- Storage ---- */
const vid = new Uint8Array([0, 0, 0, 1]);
const path = (id, f = 'k1.webm') => 'matchday-live/' + YMD + '/' + id + '/' + f;

test('storage: contributor creates own video only, once', async () => {
  const s = env.authenticatedContext('mdl-c1', { mdl: 'c1', mdlGen: GEN }).storage();
  await assertSucceeds(s.ref(path('c1')).put(vid, { contentType: 'video/webm' }));
  await assertFails(s.ref(path('c1')).put(vid, { contentType: 'video/webm' }));
  await assertFails(s.ref(path('c2')).put(vid, { contentType: 'video/webm' }));
  await assertFails(s.ref(path('c1', 'x.html')).put(vid, { contentType: 'text/html' }));
  await assertSucceeds(s.ref(path('c1')).getMetadata());
  await assertFails(s.ref(path('c1')).delete());
});

test("storage: staff read, signed-out and other contributors do not", async () => {
  await env.withSecurityRulesDisabled((ctx) => ctx.storage().ref(path('c1', 'k9.mp4')).put(vid, { contentType: 'video/mp4' }));
  await assertFails(env.authenticatedContext('mdl-c2', { mdl: 'c2', mdlGen: GEN }).storage().ref(path('c1', 'k9.mp4')).getMetadata());
  await assertSucceeds(env.authenticatedContext('la', { email: 'la@example.test' }).storage().ref(path('c1', 'k9.mp4')).getDownloadURL());
  await assertFails(env.unauthenticatedContext().storage().ref(path('c1', 'k9.mp4')).getDownloadURL());
  await assertFails(env.authenticatedContext('anon', {}).storage().ref(path('c1', 'k9.mp4')).getDownloadURL());
});
