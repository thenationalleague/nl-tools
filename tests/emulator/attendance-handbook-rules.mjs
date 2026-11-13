/* Attendance and the Handbook on the pass (13/11/2026) — who may write, against
   the emulator. Run by "Auto · Test database rules" on rules PRs.

   Both tools now offer Manage. Writes follow the person's tool entry (which
   Access writes from their pass) as scripts/rtdb-level-rule.mjs builds it:
     · Attendance submissions: Manage, League or Club (a club's Operations
       or Media holder submits its figures);
     · Attendance fixtures and both audit logs, and every Handbook write:
       League card and Manage (leagueRule beside levelRule).
   People without a pass still go by their role's registry default. Everyone
   here is made up. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ref, set, get } from 'firebase/database';

const REPO = process.env.NL_REPO || '..';
const env = await initializeTestEnvironment({ projectId: 'demo-att-hb', database: { rules: readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8'), host: '127.0.0.1', port: 9000 } });
const REGISTRY = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));
const ATT = 'ops-attendance', HB = 'ops-handbook';
const A = 'app-data/' + ATT, H = 'app-data/' + HB;

/* One database() per context: a second call re-points a running instance at
   the emulator and the SDK throws. */
const as = (uid, claims) => env.authenticatedContext(uid, claims).database();
const person = (base, entries, role) => ({ role: role || 'staff', pass: { base, issued: 1 }, tools: entries || {} });
const users = {
  'u-ops':     person('league', { [ATT]: 'admin', [HB]: 'admin' }),          // League Operations
  'u-staff':   person('league', { [ATT]: 'access', [HB]: 'access' }, 'admin'), // League card, no key; old role admin
  'u-cluboes': person('club', { [ATT]: 'admin', [HB]: 'access' }, 'club-admin'), // Club Operations
  'u-clubbo':  person('club', { [ATT]: 'access', [HB]: 'access' }, 'club-staff'), // Club card, no key
  'u-sa':      { role: 'superadmin' },
  'u-oldadm':  { role: 'admin' },        // no pass, old League admin role
  'u-oldclub': { role: 'club-admin' },   // no pass, old club secretary role
  'u-oldstaff':{ role: 'staff' },        // no pass, old League staff role
};
const db = Object.fromEntries(Object.keys(users).map((u) => [u, as(u)]));
const codeOnly = as('cc-tst', { club: 'TST', clubName: 'Testham Town' });

await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.database();
  await set(ref(d, 'tools/' + ATT), REGISTRY[ATT]);
  await set(ref(d, 'tools/' + HB), REGISTRY[HB]);
  for (const [uid, u] of Object.entries(users)) await set(ref(d, 'users/' + uid), u);
  await set(ref(d, H + '/editions/e1'), { title: 'x' });
  await set(ref(d, H + '/publishedEditionId'), 'e0');
});

let pass = 0, fail = 0;
async function t(label, p, ok) {
  try { await (ok ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok  ', label); }
  catch (e) { fail++; console.log('XX  ', label, e.message); }
}
const sub = { matchID: 'm1', clubName: 'Testham Town', total: 1000 };
const fix = { kickoffUTC: 1, competitionID: 89 };

/* Attendance */
await t('League Operations edits fixtures', set(ref(db['u-ops'], A + '/fixtures/f1'), fix), true);
await t('League Operations submits figures', set(ref(db['u-ops'], A + '/archive/2026/submissions/s1'), sub), true);
await t('League Operations reads the audit log', get(ref(db['u-ops'], A + '/submissions-audit')), true);
await t('a League card without a key cannot edit fixtures, whatever its old role', set(ref(db['u-staff'], A + '/fixtures/f1'), fix), false);
await t('a League card without a key cannot submit', set(ref(db['u-staff'], A + '/archive/2026/submissions/s2'), sub), false);
await t('a club Operations holder submits its figures', set(ref(db['u-cluboes'], A + '/archive/2026/submissions/s3'), sub), true);
await t('a club Operations holder cannot edit fixtures', set(ref(db['u-cluboes'], A + '/fixtures/f1'), fix), false);
await t('a club Operations holder cannot read the audit log', get(ref(db['u-cluboes'], A + '/submissions-audit')), false);
await t('a Club card without a key cannot submit', set(ref(db['u-clubbo'], A + '/archive/2026/submissions/s4'), sub), false);
await t('superadmin edits fixtures', set(ref(db['u-sa'], A + '/fixtures/f1'), fix), true);
await t('no pass, old admin role: still edits fixtures', set(ref(db['u-oldadm'], A + '/fixtures/f1'), fix), true);
await t('no pass, old club secretary role: still submits', set(ref(db['u-oldclub'], A + '/archive/2026/submissions/s5'), sub), true);
await t('no pass, old staff role: no longer submits', set(ref(db['u-oldstaff'], A + '/archive/2026/submissions/s6'), sub), false);
await t('fixtures stay public to read', get(ref(env.unauthenticatedContext().database(), A + '/fixtures')), true);

/* Handbook */
await t('League Operations saves the draft', set(ref(db['u-ops'], H + '/draft/x'), { t: 1 }), true);
await t('League Operations publishes', set(ref(db['u-ops'], H + '/publishedEditionId'), 'e1'), true);
await t('a League card without a key cannot save the draft', set(ref(db['u-staff'], H + '/draft/x'), { t: 2 }), false);
await t('a League card without a key reads the draft', get(ref(db['u-staff'], H + '/draft')), true);
await t('a Club card never saves the draft', set(ref(db['u-cluboes'], H + '/draft/x'), { t: 3 }), false);
await t('superadmin saves the draft', set(ref(db['u-sa'], H + '/draft/x'), { t: 4 }), true);
await t('no pass, old admin role: still saves the draft', set(ref(db['u-oldadm'], H + '/draft/x'), { t: 5 }), true);
await t('a club code reads past editions', get(ref(codeOnly, H + '/editions')), true);
await t('League Operations reads past editions', get(ref(db['u-ops'], H + '/editions')), true);
await t('a League card without a key cannot list past editions', get(ref(db['u-staff'], H + '/editions')), false);

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
