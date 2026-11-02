/* Media Accreditation – RTDB and Storage rules, against the emulator. Not in
   npm test (needs Java + firebase-tools); run by hand when the
   app-data/media-accreditation rules or the Storage accreditation block
   change. See tests/emulator/README.md:

     NL_REPO=/path/to/nl-tools npx firebase emulators:exec --project demo-acc \
       --only database,storage "node accreditation-rules.mjs"

   The public form signs in anonymously, uploads its files, then writes one
   update: the application, a pace stamp, a quota count and a "received"
   email. What matters is that it can do exactly that and nothing else. Staff
   with Manage can read everything and save agreements; Use, plain staff and
   clubs get nothing yet. All names and addresses are placeholders. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ref, set, get, update, serverTimestamp } from 'firebase/database';

const REPO = process.env.NL_REPO || '..';
const env = await initializeTestEnvironment({
  projectId: 'demo-acc',
  database: { rules: readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8'), host: '127.0.0.1', port: 9000 },
  storage: { rules: readFileSync(join(REPO, 'system/storage/rules.snapshot.rules'), 'utf8'), host: '127.0.0.1', port: 9199 }
});
const B = 'app-data/media-accreditation/';
const SEASON = '2627';
const seed = (p, v) => env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), p), v));

await seed('users', {
  sa: { role: 'superadmin' },
  ad: { role: 'admin' },
  st: { role: 'staff' },
  stUse: { role: 'staff', tools: { 'media-accreditation': 'access' } },
  stMan: { role: 'staff', tools: { 'media-accreditation': 'admin' } },
  ca: { role: 'club-admin', club: 'Example Town' }
});
await seed('tools/media-accreditation', { defaults: { superadmin: 'admin', admin: 'admin', staff: 'off', 'club-admin': 'off', 'club-staff': 'off' } });
const AGREEMENT = { version: 1, text: 'Placeholder terms.', approvedBy: { uid: 'sa', name: 'Placeholder' }, approvedAt: 1 };
await seed(B + 'config/agreements/photography', AGREEMENT);

const anonCtx = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } });
const anon = (uid) => anonCtx(uid).database();
const db = (uid) => env.authenticatedContext(uid).database();
const nobody = env.unauthenticatedContext().database();

let seq = 0;
const ID = () => ('-Naccreditationtest' + String(++seq).padStart(4, '0')).slice(-20);

function freelance(uid, id, over) {
  const base = 'accreditation/' + SEASON + '/' + uid + '/' + id + '/';
  return Object.assign({
    uid, type: 'photography', route: 'standard', orgType: 'freelance',
    person: { name: 'Alex Example', email: 'alex@example.invalid', phone: '01234 567890', address: '1 Example Road' },
    photo: base + 'photo.jpg', under18: false,
    insurance: { insurer: 'Example Insurance', policyNumber: 'P-1', limit: 5000000, start: '2026-08-01', expiry: '2027-07-31',
      namedInsured: 'Alex Example', inMyName: true, schedule: base + 'insurance.pdf' },
    use: { channels: { website: true } },
    declarations: { refusedBefore: false, accurate: true, dataConsent: true },
    signature: { name: 'Alex Example', agreementVersion: 1, at: serverTimestamp() },
    status: 'awaiting-staff', source: 'form', createdAt: serverTimestamp()
  }, over || {});
}
function clubKid(uid, id, over) {
  const r = freelance(uid, id, Object.assign({
    route: 'club', orgType: 'club', club: 'Example Town', clubCode: 'EXT', paidOrVolunteer: 'volunteer',
    under18: true, dob: '2010-05-05', guardian: { name: 'Sam Example', email: 'sam@example.invalid', relationship: 'Parent' },
    status: 'awaiting-guardian'
  }, over || {}));
  delete r.insurance;
  return r;
}
/* The form's single update. `parts` drops or replaces pieces of it. */
function send(uid, rec, id, parts) {
  parts = parts || {};
  const u = {};
  u['applications/' + SEASON + '/' + id] = rec;
  if (parts.pace !== false) u['pace/' + uid] = serverTimestamp();
  if (parts.quota !== false) u['quota/' + uid] = parts.quota || { since: serverTimestamp(), n: 1 };
  if (parts.outbox !== false) u['outbox/' + ID()] = parts.outbox || { to: rec.person.email, template: 'received', applicationId: id, season: SEASON, status: 'queued', createdAt: serverTimestamp() };
  return update(ref(anon(uid), B), u);
}

let pass = 0, fail = 0;
async function t(label, p, shouldPass) {
  try { await (shouldPass ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok  ', label); }
  catch (e) { fail++; console.log('XX  ', label, e.message); }
}
/* A fresh anonymous uid per case, so the one-a-minute pace never decides a
   test that is about something else. */
let n = 0;
const fresh = () => 'anon' + (++n);

/* ── the public form ──────────────────────────────────────────────────── */
{
  const u = fresh(), id = ID();
  await t('anonymous: a freelance application', send(u, freelance(u, id), id), true);
  await t('anonymous: cannot overwrite it', set(ref(anon(u), B + 'applications/' + SEASON + '/' + id + '/status'), 'approved'), false);
  await t('anonymous: cannot read it back', get(ref(anon(u), B + 'applications/' + SEASON + '/' + id)), false);
  const id2 = ID();
  await t('anonymous: a second within a minute is refused (pace)', send(u, freelance(u, id2), id2, { quota: { since: serverTimestamp(), n: 2 } }), false);
  await t('anonymous: can read its own pace', get(ref(anon(u), B + 'pace/' + u)), true);
  await t('anonymous: cannot read another\'s pace', get(ref(anon(fresh()), B + 'pace/' + u)), false);
}
{
  const u = fresh(), id = ID();
  await t('under 18 on the club route, awaiting guardian', send(u, clubKid(u, id), id), true);
}
for (const [label, mk, ok] of [
  ['refused: under 18 on a freelance route', (u, id) => freelance(u, id, { under18: true, dob: '2010-05-05', guardian: { name: 'S', email: 's@example.invalid', relationship: 'P' }, status: 'awaiting-guardian' }), false],
  ['refused: under 18 on the club route but skipping the guardian', (u, id) => clubKid(u, id, { status: 'awaiting-club' }), false],
  ['refused: under 18 with no guardian', (u, id) => { const r = clubKid(u, id); delete r.guardian; return r; }, false],
  ['refused: a guardian on an adult', (u, id) => freelance(u, id, { guardian: { name: 'S', email: 's@example.invalid', relationship: 'P' } }), false],
  ['adult club route, awaiting club', (u, id) => clubKid(u, id, { under18: false, dob: null, guardian: null, status: 'awaiting-club' }), true],
  ['refused: adult club route straight to staff', (u, id) => clubKid(u, id, { under18: false, dob: null, guardian: null, status: 'awaiting-staff' }), false],
  ['refused: club route carrying insurance', (u, id) => Object.assign(clubKid(u, id), { insurance: freelance(u, id).insurance }), false],
  ['refused: freelance with no insurance', (u, id) => { const r = freelance(u, id); delete r.insurance; return r; }, false],
  ['refused: freelance claiming the club route', (u, id) => freelance(u, id, { route: 'club' }), false],
  ['refused: arrives already approved', (u, id) => freelance(u, id, { status: 'approved' }), false],
  ['refused: signed against an old agreement', (u, id) => freelance(u, id, { signature: { name: 'Alex Example', agreementVersion: 0, at: serverTimestamp() } }), false],
  ['refused: someone else\'s uid', (u, id) => freelance(u, id, { uid: 'someone-else' }), false],
  ['refused: photo in another session\'s folder', (u, id) => freelance(u, id, { photo: 'accreditation/' + SEASON + '/other/' + id + '/photo.jpg' }), false],
  ['refused: schedule under another application', (u, id) => freelance(u, id, { insurance: Object.assign(freelance(u, id).insurance, { schedule: 'accreditation/' + SEASON + '/' + u + '/-Nsomethingelse00000/insurance.pdf' }) }), false],
  ['refused: an extra field', (u, id) => freelance(u, id, { notes: 'x' }), false],
  ['refused: an extra person field', (u, id) => freelance(u, id, { person: Object.assign({}, freelance(u, id).person, { dob: '2000-01-01' }) }), false],
  ['refused: unknown use', (u, id) => freelance(u, id, { use: { channels: { tiktok: true } } }), false],
  ['refused: name over 120', (u, id) => freelance(u, id, { person: Object.assign({}, freelance(u, id).person, { name: 'x'.repeat(121) }) }), false],
  ['refused: not accurate', (u, id) => freelance(u, id, { declarations: { refusedBefore: false, accurate: false, dataConsent: true } }), false],
  ['refused: refused before, no detail', (u, id) => freelance(u, id, { declarations: { refusedBefore: true, accurate: true, dataConsent: true } }), false],
  ['refused: a policy not in their name, no explanation', (u, id) => freelance(u, id, { insurance: Object.assign(freelance(u, id).insurance, { inMyName: false }) }), false],
  ['refused: source "import" from the form', (u, id) => freelance(u, id, { source: 'import' }), false],
  ['agency with photographers', (u, id) => freelance(u, id, { orgType: 'agency', org: { name: 'Example Pics', holder: 'Alex Example' },
    photographers: { '-Nphotographer000001': { name: 'Jo Example', photo: 'accreditation/' + SEASON + '/' + u + '/' + id + '/photographer--Nphotographer000001.jpg' } } }), true],
  ['refused: agency with no photographers', (u, id) => freelance(u, id, { orgType: 'agency', org: { name: 'Example Pics', holder: 'Alex Example' } }), false],
  ['refused: photographers on a freelance application', (u, id) => freelance(u, id, {
    photographers: { '-Nphotographer000001': { name: 'Jo', photo: 'accreditation/' + SEASON + '/' + u + '/' + id + '/photographer--Nphotographer000001.jpg' } } }), false]
]) {
  const u = fresh(), id = ID();
  await t(label, send(u, mk(u, id), id), ok);
}

/* the parts of the one update */
{
  let u = fresh(), id = ID();
  await t('refused: no pace stamp', send(u, freelance(u, id), id, { pace: false }), false);
  u = fresh(); id = ID();
  await t('refused: no quota count', send(u, freelance(u, id), id, { quota: false }), false);
  u = fresh(); id = ID();
  await t('no outbox entry is fine', send(u, freelance(u, id), id, { outbox: false }), true);
  u = fresh(); id = ID();
  await t('refused: outbox to someone else', send(u, freelance(u, id), id, { outbox: { to: 'victim@example.invalid', template: 'received', applicationId: id, season: SEASON, status: 'queued', createdAt: serverTimestamp() } }), false);
  u = fresh(); id = ID();
  await t('refused: outbox entry on its own', update(ref(anon(u), B), { ['outbox/' + ID()]: { to: 'alex@example.invalid', template: 'received', applicationId: id, season: SEASON, status: 'queued', createdAt: serverTimestamp() } }), false);
  u = fresh(); id = ID();
  await t('refused: outbox entry already sent', send(u, freelance(u, id), id, { outbox: { to: 'alex@example.invalid', template: 'received', applicationId: id, season: SEASON, status: 'sent', createdAt: serverTimestamp() } }), false);
}

/* quota: five in any 24 hours */
{
  const u = fresh();
  const since = Date.now() - 1000;
  await seed(B + 'quota/' + u, { since, n: 4 });
  let id = ID();
  await t('refused: a quota that moves its own window', send(u, freelance(u, id), id, { quota: { since: since - 5, n: 5 } }), false);
  const q = { since };
  id = ID();
  await t('the fifth today', send(u, freelance(u, id), id, { quota: { since: q.since, n: 5 } }), true);
  await seed(B + 'pace/' + u, Date.now() - 120000);
  id = ID();
  await t('refused: the sixth', send(u, freelance(u, id), id, { quota: { since: q.since, n: 6 } }), false);
  id = ID();
  await t('refused: resetting the window early', send(u, freelance(u, id), id, { quota: { since: serverTimestamp(), n: 1 } }), false);
  await seed(B + 'quota/' + u, { since: Date.now() - 2 * 86400000, n: 5 });
  id = ID();
  await t('a new window after 24 hours', send(u, freelance(u, id), id, { quota: { since: serverTimestamp(), n: 1 } }), true);
}

/* closed until an agreement exists */
await seed(B + 'config/agreements/photography', null);
{
  const u = fresh(), id = ID();
  await t('refused: no agreement saved yet', send(u, freelance(u, id), id), false);
}
await seed(B + 'config/agreements/photography', AGREEMENT);

/* reads */
{
  const id = ID();
  await t('signed out: refused', update(ref(nobody, B), { ['applications/' + SEASON + '/' + id]: freelance('x', id), 'pace/x': serverTimestamp(), 'quota/x': { since: serverTimestamp(), n: 1 } }), false);
}
await t('signed out cannot read the agreement', get(ref(nobody, B + 'config/agreements/photography')), false);
await t('anonymous can read the agreement', get(ref(anon(fresh()), B + 'config/agreements/photography')), true);
await t('anonymous cannot read agreement history', get(ref(anon(fresh()), B + 'config/agreementVersions')), false);
await t('anonymous cannot read the outbox', get(ref(anon(fresh()), B + 'outbox')), false);
await t('anonymous cannot read the node', get(ref(anon(fresh()), B)), false);
await t('anonymous cannot write the agreement', set(ref(anon(fresh()), B + 'config/agreements/photography'), Object.assign({}, AGREEMENT, { version: 2, approvedAt: serverTimestamp() })), false);

/* ── staff ────────────────────────────────────────────────────────────── */
for (const [uid, ok] of [['sa', true], ['ad', true], ['stMan', true], ['stUse', false], ['st', false], ['ca', false]]) {
  await t(uid + (ok ? ' reads' : ' cannot read') + ' applications', get(ref(db(uid), B + 'applications/' + SEASON)), ok);
}
const agree = (v) => ({ version: v, text: 'Placeholder terms v' + v, approvedBy: { uid: 'sa', name: 'Placeholder' }, approvedAt: serverTimestamp() });
await t('Manage saves version 2 with its history copy', update(ref(db('ad'), B + 'config'), { 'agreements/photography': agree(2), 'agreementVersions/photography/2': agree(2) }), true);
await t('refused: skipping to version 4', set(ref(db('ad'), B + 'config/agreements/photography'), agree(4)), false);
await t('refused: going back to version 1', set(ref(db('ad'), B + 'config/agreements/photography'), agree(1)), false);
await t('refused: rewriting history', set(ref(db('ad'), B + 'config/agreementVersions/photography/2'), agree(2)), false);
await t('refused: Use cannot save', set(ref(db('stUse'), B + 'config/agreements/photography'), agree(3)), false);
{
  const id = ID();
  await seed(B + 'outbox/' + id, { to: 'alex@example.invalid', template: 'received', applicationId: ID(), season: SEASON, status: 'queued', createdAt: 1 });
  await t('Manage marks an email sent', update(ref(db('ad'), B + 'outbox/' + id), { status: 'sent', sentAt: serverTimestamp(), sentBy: { uid: 'ad', name: 'Placeholder' } }), true);
}

/* ── Storage ──────────────────────────────────────────────────────────── */
const small = new Uint8Array(1024);
const big = new Uint8Array(6 * 1024 * 1024);
const st = (uid) => anonCtx(uid).storage();
const P = (uid, id, f) => 'accreditation/' + SEASON + '/' + uid + '/' + id + '/' + f;
{
  const u = fresh(), id = ID();
  await t('storage: photo in own folder', st(u).ref(P(u, id, 'photo.jpg')).put(small, { contentType: 'image/jpeg' }), true);
  await t('storage: refused overwrite', st(u).ref(P(u, id, 'photo.jpg')).put(small, { contentType: 'image/jpeg' }), false);
  await t('storage: schedule PDF', st(u).ref(P(u, id, 'insurance.pdf')).put(small, { contentType: 'application/pdf' }), true);
  await t('storage: photographer photo', st(u).ref(P(u, id, 'photographer--Nphotographer000001.png')).put(small, { contentType: 'image/png' }), true);
  await t('storage: refused photo over 5MB', st(u).ref(P(u, ID(), 'photo.jpg')).put(big, { contentType: 'image/jpeg' }), false);
  await t('storage: schedule over 5MB is fine', st(u).ref(P(u, ID(), 'insurance.pdf')).put(big, { contentType: 'application/pdf' }), true);
  await t('storage: refused a PDF as the photo', st(u).ref(P(u, ID(), 'photo.jpg')).put(small, { contentType: 'application/pdf' }), false);
  await t('storage: refused HTML as the schedule', st(u).ref(P(u, ID(), 'insurance.pdf')).put(small, { contentType: 'text/html' }), false);
  await t('storage: refused any other file name', st(u).ref(P(u, ID(), 'notes.jpg')).put(small, { contentType: 'image/jpeg' }), false);
  await t('storage: refused in another session\'s folder', st(u).ref(P('other', ID(), 'photo.jpg')).put(small, { contentType: 'image/jpeg' }), false);
  await t('storage: anonymous cannot read its upload back', st(u).ref(P(u, id, 'photo.jpg')).getDownloadURL(), false);
  await t('storage: refused delete', st(u).ref(P(u, id, 'photo.jpg')).delete(), false);
  await t('storage: a staff account reads it', env.authenticatedContext('sa', { email: 'sa@example.invalid' }).storage().ref(P(u, id, 'photo.jpg')).getDownloadURL(), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
