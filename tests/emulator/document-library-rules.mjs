/* Document Library — RTDB and Storage rules, against the emulator. Not in npm
   test (needs Java + firebase-tools); run by hand when the rules for
   app-data/ops-document-library or document-library/** change. See
   tests/emulator/README.md:

     NL_REPO=/path/to/nl-tools npx firebase emulators:exec --project demo-dl \
       --only database,storage "node document-library-rules.mjs"

   What it pins: clubs read and never write; a portal admin writes; a portal
   account that is not an admin cannot touch the records; and the bytes of a
   document can never be replaced — a rename is a metadata write and nothing
   more. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ref, set, get, remove, update, push } from 'firebase/database';

const REPO = process.env.NL_REPO || '..';
const env = await initializeTestEnvironment({
  projectId: 'demo-dl',
  database: { rules: readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8'), host: '127.0.0.1', port: 9000 },
  storage: { rules: readFileSync(join(REPO, 'system/storage/rules.snapshot.rules'), 'utf8'), host: '127.0.0.1', port: 9199 },
});

const B = 'app-data/ops-document-library/';
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.database();
  await set(ref(db, 'users/admin1'), { role: 'admin' });
  await set(ref(db, 'users/staff1'), { role: 'staff' });
  await set(ref(db, 'users/granted1'), { role: 'staff', tools: { 'ops-document-library': 'admin' } });
  await set(ref(db, B + 'folders/-F1'), { name: 'Club Licensing', createdAt: 1 });
  await set(ref(db, B + 'files/-D1'), {
    name: 'Criteria.pdf', folderId: '-F1', storagePath: 'document-library/files/-D1.pdf',
    url: 'https://firebasestorage.googleapis.com/v0/b/x/o/y', size: 10, contentType: 'application/pdf', uploadedAt: 1,
  });
  await set(ref(db, B + 'trash/-D0'), { name: 'Old.pdf', deletedAt: 1 });
});

const admin = env.authenticatedContext('admin1', { email: 'a@example.test' });
const granted = env.authenticatedContext('granted1', { email: 'g@example.test' });
const staff = env.authenticatedContext('staff1', { email: 's@example.test' });
const club = env.authenticatedContext('cc-SOL', { club: 'SOL' });
const nlCode = env.authenticatedContext('cc-NL', { club: 'NL' });
const anon = env.authenticatedContext('anon1', {});

let pass = 0, fail = 0;
async function t(label, p, shouldPass) {
  try { await (shouldPass ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok  ', label); }
  catch (e) { fail++; console.log('XX  ', label, e.message); }
}
/* One instance per context: calling .database() twice on the same context
   re-runs useEmulator on a live instance and the SDK aborts. */
const cache = new Map();
const once = (c, kind) => {
  const k = c; if (!cache.has(k)) cache.set(k, {});
  const slot = cache.get(k);
  return slot[kind] || (slot[kind] = c[kind]());
};
const db = (c) => once(c, 'database');
const file = (over = {}) => ({
  name: 'Handbook.pdf', folderId: '_root', storagePath: 'document-library/files/-D2.pdf',
  url: 'https://firebasestorage.googleapis.com/v0/b/x/o/z', size: 20, contentType: 'application/pdf', uploadedAt: 2, ...over,
});

/* ── RTDB: reading ─────────────────────────────────────────────────────── */
await t('club reads the folders', get(ref(db(club), B + 'folders')), true);
await t('club reads the files', get(ref(db(club), B + 'files')), true);
await t('the NL code reads the files', get(ref(db(nlCode), B + 'files')), true);
await t('club cannot read the bin', get(ref(db(club), B + 'trash')), false);
await t('club cannot read the activity log', get(ref(db(club), B + 'audit')), false);
await t('anonymous (pre-code) session reads nothing', get(ref(db(anon), B + 'files')), false);
await t('a staff account with no grant reads nothing', get(ref(db(staff), B + 'files')), false);
await t('admin reads the bin', get(ref(db(admin), B + 'trash')), true);

/* ── RTDB: writing ─────────────────────────────────────────────────────── */
await t('admin adds a file record', set(ref(db(admin), B + 'files/-D2'), file()), true);
await t('a granted tool admin adds one', set(ref(db(granted), B + 'files/-D3'), file({ storagePath: 'document-library/files/-D3.pdf' })), true);
await t('admin renames a file', set(ref(db(admin), B + 'files/-D1/name'), 'Criteria 2026-27.pdf'), true);
await t('admin moves a file', set(ref(db(admin), B + 'files/-D1/folderId'), '_root'), true);
await t('admin makes a folder', set(ref(db(admin), B + 'folders/-F2'), { name: 'Finance', parentId: '-F1', createdAt: 2 }), true);
await t('admin bins a file', update(ref(db(admin), B), { 'trash/-D2': { ...file(), deletedAt: 3 }, 'files/-D2': null }), true);
await t('club cannot add a file', set(ref(db(club), B + 'files/-X1'), file()), false);
await t('club cannot rename a file', set(ref(db(club), B + 'files/-D1/name'), 'Hacked.pdf'), false);
await t('club cannot delete a folder', remove(ref(db(club), B + 'folders/-F1')), false);
await t('staff without a grant cannot add a file', set(ref(db(staff), B + 'files/-X2'), file()), false);
await t('a record must point inside document-library/files/', set(ref(db(admin), B + 'files/-X3'), file({ storagePath: 'programme/SOL/x.pdf' })), false);
await t('an empty name is refused', set(ref(db(admin), B + 'files/-D1/name'), ''), false);
await t('a folder with an unknown field is refused', set(ref(db(admin), B + 'folders/-F3'), { name: 'x', createdAt: 1, colour: 'red' }), false);

/* ── RTDB: the club download log ──────────────────────────────────────── */
const entry = (over = {}) => ({ ts: 5, actor: 'club:SOL', action: 'download', detail: 'Criteria.pdf', ...over });
await t('club logs its own download', set(push(ref(db(club), B + 'audit')), entry()), true);
await t('club cannot log as another club', set(push(ref(db(club), B + 'audit')), entry({ actor: 'club:ALD' })), false);
await t('club cannot log anything but a download', set(push(ref(db(club), B + 'audit')), entry({ action: 'delete' })), false);
const logged = push(ref(db(admin), B + 'audit'));
await set(logged, entry({ actor: 'staff:admin1', action: 'upload' }));
await t('club cannot overwrite a log line', set(ref(db(club), B + 'audit/' + logged.key), entry()), false);

/* ── Storage ──────────────────────────────────────────────────────────── */
const st = (c) => once(c, 'storage');
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49]);   // %PDF-1
const OTHER = new Uint8Array([37, 80, 68, 70, 45, 50]);
const meta = { contentType: 'application/pdf', contentDisposition: 'inline; filename="Criteria.pdf"' };
await t('admin uploads a document', st(admin).ref('document-library/files/-S1.pdf').put(PDF, meta), true);
await t('club reads it', st(club).ref('document-library/files/-S1.pdf').getMetadata(), true);
await t('anonymous cannot read it', st(anon).ref('document-library/files/-S1.pdf').getMetadata(), false);
await t('club cannot upload', st(club).ref('document-library/files/-S2.pdf').put(PDF, meta), false);
await t('rename = metadata write, allowed',
  st(admin).ref('document-library/files/-S1.pdf').updateMetadata({ contentDisposition: 'inline; filename="Renamed.pdf"' }), true);
await t('club cannot rename the stored file',
  st(club).ref('document-library/files/-S1.pdf').updateMetadata({ contentDisposition: 'inline; filename="x.pdf"' }), false);
/* What this does NOT prove: the emulator (firebase-tools 13) evaluates a
   re-upload over an existing object as a CREATE, so `resource == null` is
   what refuses it here — even `allow update: if true` cannot let it through
   (checked 28/10/2026). Production evaluates the same put as an UPDATE, and
   there the md5Hash clause is the guard. The emulator cannot show that
   clause working; removing it leaves this test green. */
await t('nobody can replace the bytes of an existing document',
  st(admin).ref('document-library/files/-S1.pdf').put(OTHER, meta), false);
await t('HTML is refused', st(admin).ref('document-library/files/-S3.html').put(PDF, { contentType: 'text/html' }), false);
await t('SVG is refused', st(admin).ref('document-library/files/-S4.svg').put(PDF, { contentType: 'image/svg+xml' }), false);
await t('club cannot delete', st(club).ref('document-library/files/-S1.pdf').delete(), false);
await t('admin deletes (emptying the bin)', st(admin).ref('document-library/files/-S1.pdf').delete(), true);

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
