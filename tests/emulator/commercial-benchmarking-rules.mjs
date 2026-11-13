/* Commercial Benchmarking — who may read a club's row and sign it off (RTDB),
   against the emulator. Run by "Auto · Test database rules" on rules PRs.

   13/11/2026: the private token links are retired. A club reads its own row
   with its club code or a Club card (both carry `clubName`), matched to the
   row's key case-folded, and confirms its figures at clubs/<club>/confirm.
   Nothing reads links/ any more. Club names here are made up.

   Later the same day, one page: the League side reads every row at Access
   and writes at Manage, from the person's tool entry (written from their
   pass) as scripts/rtdb-level-rule.mjs builds it, and only on a League card:
   a Club card's Access entry opens its own row, never the whole node. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ref, set, get, serverTimestamp } from 'firebase/database';

const env = await initializeTestEnvironment({ projectId: 'demo-cb', database: { rules: readFileSync(join(process.env.NL_REPO || '..', 'system/rtdb/rules.snapshot.json'), 'utf8'), host: '127.0.0.1', port: 9000 } });
const ROOT = 'app-data/ops-commercial-benchmarking';
const as = (uid, claims) => env.authenticatedContext(uid, claims).database();
const code = as('cc-tst', { club: 'TST', clubName: 'Testham Town' });
const codeCase = as('cc-tst-2', { club: 'TST', clubName: 'testham town' });
const other = as('cc-oth', { club: 'OTH', clubName: 'Otherby Rovers' });
const league = as('cc-nl', { club: 'NL', clubName: 'National League' });
const noClaim = as('u-plain', {});
const anon = env.unauthenticatedContext().database();
const row = { club: 'Testham Town', division: 'North', metrics: { frontShirt: { value: 1 } } };
const yes = { confirmed: true, at: serverTimestamp() };

/* One database() per context: a second call tries to point an instance that
   is already running at the emulator again, and the SDK throws. */
const KEY = 'ops-commercial-benchmarking';
const REG = JSON.parse(readFileSync(join(process.env.NL_REPO || '..', 'system/rtdb/tools-registry.snapshot.json'), 'utf8'))[KEY];
const person = (base, entry, role) => ({ role: role || 'staff', pass: { base, issued: 1 }, tools: entry ? { [KEY]: entry } : {} });
const commercial = as('u-com'), finance = as('u-fin'), operations = as('u-ops'), cardAccess = as('u-card'), superadmin = as('u-sa');

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.database();
  await set(ref(db, 'tools/' + KEY), REG);
  await set(ref(db, 'users/u-com'), person('league', 'admin'));
  await set(ref(db, 'users/u-fin'), person('league', 'access'));
  await set(ref(db, 'users/u-ops'), person('league', 'off', 'admin'));
  await set(ref(db, 'users/u-card'), person('club', 'access'));
  await set(ref(db, 'users/u-sa'), { role: 'superadmin' });
  await set(ref(db, ROOT + '/clubs/Testham Town'), row);
  await set(ref(db, ROOT + '/clubs/Otherby Rovers'), { club: 'Otherby Rovers' });
  await set(ref(db, ROOT + '/links/tok'), row);
});

let pass = 0, fail = 0;
async function t(label, p, ok) {
  try { await (ok ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok  ', label); }
  catch (e) { fail++; console.log('XX  ', label, e.message); }
}
await t('a club code reads its own row', get(ref(code, ROOT + '/clubs/Testham Town')), true);
await t('the name matches whatever its case', get(ref(codeCase, ROOT + '/clubs/Testham Town')), true);
await t('a club code cannot read another club', get(ref(code, ROOT + '/clubs/Otherby Rovers')), false);
await t('a club code cannot list every club', get(ref(code, ROOT + '/clubs')), false);
await t('a League code has no club row', get(ref(league, ROOT + '/clubs/Testham Town')), false);
await t('signed in without a club claim reads nothing', get(ref(noClaim, ROOT + '/clubs/Testham Town')), false);
await t('signed out reads nothing', get(ref(anon, ROOT + '/clubs/Testham Town')), false);
await t('the aggregates stay public', get(ref(anon, ROOT + '/aggregates')), true);
await t('a club confirms its own figures', set(ref(code, ROOT + '/clubs/Testham Town/confirm'), yes), true);
await t('a club can take its confirmation back', set(ref(code, ROOT + '/clubs/Testham Town/confirm'), { confirmed: false, at: serverTimestamp() }), true);
await t('a confirmation needs a yes/no', set(ref(code, ROOT + '/clubs/Testham Town/confirm'), { confirmed: 'yes', at: serverTimestamp() }), false);
await t('a confirmation cannot be dated ahead', set(ref(code, ROOT + '/clubs/Testham Town/confirm'), { confirmed: true, at: Date.now() + 86400000 }), false);
await t('a club cannot confirm for another club', set(ref(other, ROOT + '/clubs/Testham Town/confirm'), yes), false);
await t('a club cannot change its figures', set(ref(code, ROOT + '/clubs/Testham Town/metrics'), {}), false);
await t('the old token links are closed', get(ref(anon, ROOT + '/links/tok')), false);
await t('nobody writes a token link', set(ref(anon, ROOT + '/links/tok/confirm'), { confirmed: true }), false);
await t('League Manage reads every club', get(ref(commercial, ROOT + '/clubs')), true);
await t('League Manage edits a club row', set(ref(commercial, ROOT + '/clubs/Testham Town/metrics'), { frontShirt: { value: 2 } }), true);
await t('League Manage saves the aggregates', set(ref(commercial, ROOT + '/aggregates/meta'), { leagueN: 1 }), true);
await t('League Access reads every club', get(ref(finance, ROOT + '/clubs')), true);
await t('League Access cannot edit', set(ref(finance, ROOT + '/clubs/Testham Town/metrics'), {}), false);
await t('League Access cannot save the aggregates', set(ref(finance, ROOT + '/aggregates/meta'), { leagueN: 2 }), false);
await t('League Off (Operations) reads nothing', get(ref(operations, ROOT + '/clubs')), false);
await t('a Club card at Access cannot read every club', get(ref(cardAccess, ROOT + '/clubs')), false);
await t('superadmin reads every club', get(ref(superadmin, ROOT + '/clubs')), true);
await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
