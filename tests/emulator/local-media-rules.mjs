/* Local Media – RTDB rules, against the emulator. Not in npm test (needs
   Java + firebase-tools); run by hand when app-data/media-local-media rules
   change. See tests/emulator/README.md:

     NL_REPO=/path/to/nl-tools npx firebase emulators:exec --project demo-lm \
       --only database "node local-media-rules.mjs"

   The public form signs in anonymously and pushes one submission. What
   matters is that it can do exactly that and nothing else: never read, never
   overwrite or delete, never write status or the staff-added list, and never
   store a field the form does not have. Staff with the tool can do the rest.
   All names and addresses below are placeholders. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ref, set, get, remove, update, serverTimestamp } from 'firebase/database';

const env = await initializeTestEnvironment({ projectId: 'demo-lm', database: { rules: readFileSync(join(process.env.NL_REPO || '..', 'system/rtdb/rules.snapshot.json'), 'utf8'), host: '127.0.0.1', port: 9000 } });
const B = 'app-data/media-local-media/';
const seed = (p, v) => env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), p), v));

await seed('users', {
  sa: { role: 'superadmin' },
  ad: { role: 'admin' },
  st: { role: 'staff' },
  st2: { role: 'staff', tools: { 'media-local-media': 'access' } },
  ad2: { role: 'admin', tools: { 'media-local-media': 'off' } },
  ca: { role: 'club-admin', club: 'Aldershot Town' }
});
await seed('tools/media-local-media', { defaults: { superadmin: 'admin', admin: 'admin', staff: 'off', 'club-admin': 'off', 'club-staff': 'off' } });

const anon = env.authenticatedContext('anon1', { firebase: { sign_in_provider: 'anonymous' } }).database();
const anon2 = env.authenticatedContext('anon2', { firebase: { sign_in_provider: 'anonymous' } }).database();
const nobody = env.unauthenticatedContext().database();
const db = (uid) => env.authenticatedContext(uid).database();

const ID = (n) => ('-Nlocalmediatest' + String(n).padStart(4, '0')).slice(0, 20);
const contact = { name: 'Alex Example', organisation: 'Example Gazette', type: 'newspaper', email: 'sport@example.invalid' };
const sub = (uid, extra) => ({ uid, at: serverTimestamp(), club: 'Aldershot Town', clubKey: 'ALD',
  submitter: { name: 'Sam Example' }, contacts: { [ID(900)]: contact }, ...(extra || {}) });

let pass = 0, fail = 0;
async function t(label, p, shouldPass) {
  try { await (shouldPass ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok  ', label); }
  catch (e) { fail++; console.log('XX  ', label, e.message); }
}
const S = (n) => B + 'submissions/' + ID(n);

/* ── the public form ──────────────────────────────────────────────────── */
await t('anonymous: a minimal submission', set(ref(anon, S(1)), sub('anon1')), true);
await t('anonymous: with submitter email, phone, every type', set(ref(anon, S(2)), sub('anon1', {
  submitter: { name: 'Sam Example', email: 'sam@example.invalid' },
  contacts: Object.fromEntries(['newspaper', 'online', 'radio', 'tv', 'podcast', 'fanzine', 'fansite', 'creator', 'other']
    .map((type, i) => [ID(800 + i), { ...contact, type, phone: '01234 567890' }]))
})), true);
await t('anonymous: a generic inbox (no name)', set(ref(anon, S(3)), sub('anon1', { contacts: { [ID(900)]: { organisation: 'Example FM', type: 'radio', email: 'sport@example.invalid' } } })), true);
await t('anonymous: cannot overwrite its own submission', set(ref(anon, S(1)), sub('anon1')), false);
await t('anonymous: cannot add to an existing submission', set(ref(anon, S(1) + '/contacts/' + ID(901)), contact), false);
await t('anonymous: cannot delete', remove(ref(anon, S(1))), false);
await t('another anonymous user cannot touch it', set(ref(anon2, S(1)), sub('anon2')), false);
await t('anonymous: uid must be its own', set(ref(anon, S(4)), sub('someone-else')), false);
await t('signed out: refused', set(ref(nobody, S(5)), sub('x')), false);
await t('anonymous: cannot read submissions', get(ref(anon, B + 'submissions')), false);
await t('anonymous: cannot read one submission', get(ref(anon, S(1))), false);
await t('anonymous: cannot read the node', get(ref(anon, B)), false);
await t('anonymous: cannot write status', set(ref(anon, B + 'status/' + ID(1) + '/' + ID(900)), 'happy'), false);
await t('anonymous: cannot write manual', set(ref(anon, B + 'manual/' + ID(50)), { club: 'X', clubKey: '', organisation: 'X', type: 'tv', email: 'a@b.cc', addedBy: { uid: 'anon1' }, at: serverTimestamp() }), false);

/* shape and caps */
const bad = async (label, extra) => t('refused: ' + label, set(ref(anon, S(10 + pass + fail)), sub('anon1', extra)), false);
await bad('no contacts', { contacts: null });
await bad('unknown type', { contacts: { [ID(900)]: { ...contact, type: 'blog' } } });
await bad('bad email', { contacts: { [ID(900)]: { ...contact, email: 'not-an-email' } } });
await bad('email over 254', { contacts: { [ID(900)]: { ...contact, email: 'a'.repeat(250) + '@b.cc' } } });
await bad('name over 120', { contacts: { [ID(900)]: { ...contact, name: 'x'.repeat(121) } } });
await bad('empty name string', { contacts: { [ID(900)]: { ...contact, name: '' } } });
await bad('no organisation', { contacts: { [ID(900)]: { name: 'A', type: 'tv', email: 'a@b.cc' } } });
await bad('organisation over 120', { contacts: { [ID(900)]: { ...contact, organisation: 'x'.repeat(121) } } });
await bad('phone over 40', { contacts: { [ID(900)]: { ...contact, phone: '1'.repeat(41) } } });
await bad('extra contact field', { contacts: { [ID(900)]: { ...contact, notes: 'x' } } });
await bad('contact key not push-id-like', { contacts: { 'c1': contact } });
await bad('extra submission field', { extra: true });
await bad('extra submitter field', { submitter: { name: 'A', phone: '1' } });
await bad('no submitter name', { submitter: { email: 'a@b.cc' } });
await bad('club over 120', { club: 'x'.repeat(121) });
await bad('bad club key', { clubKey: 'aldershot' });
await bad('a timestamp in the future', { at: Date.now() + 86400000 });
await t('refused: submission key not push-id-like', set(ref(anon, B + 'submissions/abc'), sub('anon1')), false);

/* ── staff ────────────────────────────────────────────────────────────── */
await t('superadmin reads everything', get(ref(db('sa'), B)), true);
await t('admin (default admin) reads', get(ref(db('ad'), B)), true);
await t('staff (default off) cannot read', get(ref(db('st'), B)), false);
await t('staff granted access reads', get(ref(db('st2'), B)), true);
await t('admin switched off cannot read', get(ref(db('ad2'), B)), false);
await t('club admin cannot read', get(ref(db('ca'), B)), false);
await t('admin sets a status', set(ref(db('ad'), B + 'status/' + ID(1) + '/' + ID(900)), 'sent'), true);
await t('every status value', Promise.all(['new', 'sent', 'happy', 'opted-out'].map((v) => set(ref(db('st2'), B + 'status/' + ID(2) + '/' + ID(800)), v))), true);
await t('unknown status refused', set(ref(db('ad'), B + 'status/' + ID(1) + '/' + ID(900)), 'maybe'), false);
await t('staff (off) cannot set status', set(ref(db('st'), B + 'status/' + ID(1) + '/' + ID(900)), 'happy'), false);
await t('admin edits a club-submitted contact', set(ref(db('ad'), S(1) + '/contacts/' + ID(900)), { ...contact, name: 'Alex Edited' }), true);
await t('the edit is still validated', update(ref(db('ad'), S(1) + '/contacts/' + ID(900)), { type: 'blog' }), false);
await t('admin deletes one contact of several', remove(ref(db('ad'), S(2) + '/contacts/' + ID(800))), true);
await t('admin deletes a whole submission', remove(ref(db('ad'), S(3))), true);
await t('staff (off) cannot delete', remove(ref(db('st'), S(1))), false);
const man = { club: 'Aldershot Town', clubKey: 'ALD', name: 'Jo Example', organisation: 'Example Radio', type: 'radio', email: 'jo@example.invalid', addedBy: { uid: 'ad', name: 'Admin Example' }, at: serverTimestamp() };
await t('admin adds a contact by hand', set(ref(db('ad'), B + 'manual/' + ID(60)), man), true);
await t('league-wide: empty club key', set(ref(db('ad'), B + 'manual/' + ID(61)), { ...man, club: 'League-wide', clubKey: '', status: 'happy' }), true);
await t('admin edits it', update(ref(db('ad'), B + 'manual/' + ID(60)), { phone: '01234', updatedAt: serverTimestamp(), status: 'sent' }), true);
await t('manual: extra field refused', update(ref(db('ad'), B + 'manual/' + ID(60)), { notes: 'x' }), false);
await t('manual: bad status refused', update(ref(db('ad'), B + 'manual/' + ID(60)), { status: 'gone' }), false);
await t('admin deletes it', remove(ref(db('ad'), B + 'manual/' + ID(60))), true);
await t('staff (off) cannot add', set(ref(db('st'), B + 'manual/' + ID(62)), man), false);
await t('club admin cannot add', set(ref(db('ca'), B + 'manual/' + ID(63)), man), false);

/* The guard on top of the generated rule: levelRule reads a missing role as
   'staff', and anonymous users have no role. Open League Staff's default
   and check an anonymous user still sees nothing. */
await seed('tools/media-local-media/defaults/staff', 'access');
await t('staff default Use: staff without a grant now read', get(ref(db('st'), B)), true);
await t('staff default Use: anonymous still cannot read', get(ref(anon, B)), false);
await t('staff default Use: anonymous still cannot write status', set(ref(anon, B + 'status/' + ID(1) + '/' + ID(900)), 'happy'), false);

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
