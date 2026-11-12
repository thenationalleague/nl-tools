/* People and passes — who may write users/<uid>, RTDB rules, against the
   emulator. Run by hand, or by the "Auto · Test database rules" workflow on
   any pull request that changes the rules. See tests/emulator/README.md:

     NL_REPO=/path/to/nl-tools npx firebase emulators:exec --project demo-usr \
       --only database "node users-rules.mjs"

   Written 12/11/2026 with the rules (permissions plan, step 5). The line
   being held: granting League access stays with the Skeleton key. So
     - the Skeleton key, or the superadmin role: anyone, anything;
     - a League Admin holding the League Operations key: club people only —
       club roles, Club cards, never themselves, never a League role or card;
     - anyone else: nothing.
   The approval Access makes (pending off, role, pass, entries, the request's
   status, in one update) is tested as Access sends it. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ref, set, get, remove, update } from 'firebase/database';

const env = await initializeTestEnvironment({ projectId: 'demo-usr', database: { rules: readFileSync(join(process.env.NL_REPO || '..', 'system/rtdb/rules.snapshot.json'), 'utf8'), host: '127.0.0.1', port: 9000 } });
const NOW = Date.now();
const opsKey = { 'league-operations': { given: 1, by: 'x' } };
const SEED = {
  sk:    { role: 'admin', pass: { base: 'league', issued: 1, skeleton: { given: 1, by: 'x' } } },
  sa:    { role: 'superadmin' },
  ops:   { role: 'admin', pass: { base: 'league', issued: 1, keys: opsKey } },
  opsx:  { role: 'admin', pass: { base: 'league', issued: 1, keys: { 'league-operations': { given: 1, by: 'x', until: NOW - 1000 } } } },
  adm:   { role: 'admin' },
  st:    { role: 'staff', pass: { base: 'league', issued: 1 } },
  cl:    { role: 'club-admin', club: 'X', pass: { base: 'club', club: 'X', issued: 1 } },
  req:   { role: 'club', club: 'X', pending: true },
  lg:    { role: 'staff', pass: { base: 'league', issued: 1 } }
};
async function reset() { await env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database()), { users: SEED, admin: { requests: { r1: { uid: 'req', status: 'pending' } } } })); }
const db = (uid) => env.authenticatedContext(uid).database();

let pass = 0, fail = 0;
async function t(label, p, shouldPass) {
  try { await (shouldPass ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok  ', label); }
  catch (e) { fail++; console.log('XX  ', label, e.message); }
}
const clubPass = { base: 'club', club: 'X', issued: 1, keys: { 'club-operations': { given: 1, by: 'ops' } } };

await reset();
await t('Skeleton key: League person, role and pass', update(ref(db('sk'), 'users/lg'), { role: 'admin', pass: { base: 'league', issued: 1, keys: opsKey } }), true);
await reset();
await t('superadmin role: anyone', set(ref(db('sa'), 'users/lg/jobTitle'), 'x'), true);
/* set() replaces the whole node; update() on users with child keys is a
   write to each child, judged person by person (the approval below). */
await t('Skeleton key: the whole users node', set(ref(db('sk'), 'users'), SEED), true);
await reset();
await t('Operations: not the whole users node', set(ref(db('ops'), 'users'), { cl: SEED.cl }), false);
await t('Operations: an update across people is judged person by person', update(ref(db('ops'), 'users'), { cl: SEED.cl, lg: SEED.lg }), false);

await t('Operations: a club person’s job title', set(ref(db('ops'), 'users/cl/jobTitle'), 'Secretary'), true);
await t('Operations: a club person’s Club card and club keys', set(ref(db('ops'), 'users/cl/pass'), clubPass), true);
await t('Operations: a club person’s role, between club roles', set(ref(db('ops'), 'users/cl/role'), 'club-staff'), true);
await t('Operations: a club person’s tool entries', set(ref(db('ops'), 'users/cl/tools/media-dazn'), 'access'), true);
await reset();
await t('Operations: the approval Access sends', update(ref(db('ops')), {
  'users/req/pending': false, 'users/req/rejected': false, 'users/req/role': 'club-admin',
  'users/req/pass': clubPass, 'users/req/tools/media-dazn': 'access', 'admin/requests/r1/status': 'approved'
}), true);
await reset();
await t('Operations: remove a club person', remove(ref(db('ops'), 'users/cl')), true);
await reset();

await t('Operations: not a League person', set(ref(db('ops'), 'users/lg/jobTitle'), 'x'), false);
await t('Operations: not a League person’s pass', set(ref(db('ops'), 'users/lg/pass'), clubPass), false);
await t('Operations: not removing a League person', remove(ref(db('ops'), 'users/lg')), false);
await t('Operations: not a club person up to a League role', set(ref(db('ops'), 'users/cl/role'), 'staff'), false);
await t('Operations: not a club person onto a League card', set(ref(db('ops'), 'users/cl/pass'), { base: 'league', issued: 1 }), false);
await t('Operations: not a Skeleton key on anyone', set(ref(db('ops'), 'users/cl/pass/skeleton'), { given: 1, by: 'ops' }), false);
await t('Operations: not themselves', set(ref(db('ops'), 'users/ops/jobTitle'), 'x'), false);
await t('Operations key past its end date: nothing', set(ref(db('opsx'), 'users/cl/jobTitle'), 'x'), false);
await t('League Admin role with no Operations key: nothing', set(ref(db('adm'), 'users/cl/jobTitle'), 'x'), false);
await t('League staff: nothing', set(ref(db('st'), 'users/cl/jobTitle'), 'x'), false);
await t('a club account: nothing', set(ref(db('cl'), 'users/cl/jobTitle'), 'x'), false);

await t('a Skeleton key only on a League card', set(ref(db('sk'), 'users/cl/pass/skeleton'), { given: 1, by: 'sk' }), false);
await t('reading people is unchanged: League staff', get(ref(db('st'), 'users')), true);
await t('reading people is unchanged: a club account, itself only', get(ref(db('cl'), 'users/cl')), true);
await t('reading people is unchanged: a club account, not others', get(ref(db('cl'), 'users/lg')), false);

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
