/* Access — live tool grants (access-grants/<toolKey>), RTDB rules, against
   the emulator. Not in npm test (needs Java + firebase-tools); run by hand
   when the access-grants rules change. See tests/emulator/README.md:

     NL_REPO=/path/to/nl-tools npx firebase emulators:exec --project demo-acc \
       --only database "node access-grants-rules.mjs"

   Written 12/11/2026 with the rules. What they must hold: anyone signed in
   reads (auth-guard reads a tool's grants on every page load); only the
   Skeleton key, or the superadmin role, writes; a League Operations key
   holder — who can open Access — cannot; and only known levels, under
   base / key / updated / updatedBy, are stored. The last test is the save
   Access actually makes, together with a pass holder's per-tool entry, in
   one update. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ref, set, get, remove, update } from 'firebase/database';

const env = await initializeTestEnvironment({ projectId: 'demo-acc', database: { rules: readFileSync(join(process.env.NL_REPO || '..', 'system/rtdb/rules.snapshot.json'), 'utf8'), host: '127.0.0.1', port: 9000 } });
await env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), 'users'), {
  sk:  { role: 'admin', pass: { base: 'league', skeleton: { given: 1, by: 'x' } } },
  ops: { role: 'admin', pass: { base: 'league', keys: { 'league-operations': { given: 1, by: 'x' } } } },
  sa:  { role: 'superadmin' },
  st:  { role: 'staff', pass: { base: 'league' } },
  cl:  { role: 'club-admin', club: 'X', pass: { base: 'club', club: 'X' } }
}));
const db = (uid) => env.authenticatedContext(uid).database();
const anon = env.unauthenticatedContext().database();
const G = 'access-grants/media-totw';
const good = (uid) => ({ base: { league: 'access', club: 'off' }, key: { 'league-media': 'manage' }, updated: Date.now(), updatedBy: uid });

let pass = 0, fail = 0;
async function t(label, p, shouldPass) {
  try { await (shouldPass ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok  ', label); }
  catch (e) { fail++; console.log('XX  ', label, e.message); }
}

await t('Skeleton key saves a tool', set(ref(db('sk'), G), good('sk')), true);
await t('superadmin role saves a tool', set(ref(db('sa'), G), good('sa')), true);
await t('League Operations cannot', set(ref(db('ops'), G), good('ops')), false);
await t('League staff cannot', set(ref(db('st'), G), good('st')), false);
await t('a club account cannot', set(ref(db('cl'), G), good('cl')), false);
await t('anyone signed in reads one tool', get(ref(db('cl'), G)), true);
await t('anyone signed in reads them all', get(ref(db('st'), 'access-grants')), true);
await t('signed out cannot read', get(ref(anon, G)), false);
await t('an unknown level is refused', set(ref(db('sk'), G), { ...good('sk'), base: { league: 'admin', club: 'off' } }), false);
await t('an unknown base is refused', set(ref(db('sk'), G), { ...good('sk'), base: { league: 'off', club: 'off', guest: 'access' } }), false);
await t('an unknown field is refused', set(ref(db('sk'), G), { ...good('sk'), note: 'x' }), false);
await t('base is required', set(ref(db('sk'), G), { key: {}, updated: 1, updatedBy: 'sk' }), false);
await t('updatedBy must be the writer', set(ref(db('sk'), G), good('someone-else')), false);
await t('Reset to standard (delete) by the Skeleton key', remove(ref(db('sk'), G)), true);
await t('the save Access makes: grants and an entry together', update(ref(db('sk')), {
  [G]: good('sk'), 'users/st/tools/media-totw': 'access'
}), true);
await t('League Operations cannot delete', remove(ref(db('ops'), G)), false);

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
