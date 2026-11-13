/* Manage on Newsletter, Club Kits, Save of the Month and Brand Exposure
   (13/11/2026), against the emulator. Run by "Auto · Test database rules".

   Writes follow the person's tool entry (written from their pass by Access)
   as scripts/rtdb-level-rule.mjs builds it, beside leagueRule: the League
   side reads at Access and writes at Manage; a Club card never reaches the
   League-wide nodes, whatever its entry says. Clubs keep their own doors
   (Save of the Month nominations by club claim; Brand Exposure's per-match
   token). Everyone here is made up. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ref, set, get } from 'firebase/database';

const REPO = process.env.NL_REPO || '..';
const env = await initializeTestEnvironment({ projectId: 'demo-manage-b1', database: { rules: readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8'), host: '127.0.0.1', port: 9000 } });
const REGISTRY = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));
const NEWS = 'staff-newsletter', KITS = 'ops-club-kits', SOTM = 'media-save-of-the-month', BE = 'ops-brand-exposure';
const all = (lvl) => ({ [NEWS]: lvl, [KITS]: lvl, [SOTM]: lvl, [BE]: lvl });
const person = (base, entries, role) => ({ role: role || 'staff', pass: { base, issued: 1 }, tools: entries || {} });
const users = {
  'u-man':   person('league', all('admin')),                 // a League key holder with Manage everywhere here
  'u-acc':   person('league', all('access'), 'admin'),       // League card, Access; old role admin
  'u-off':   person('league', all('off')),
  'u-club':  person('club', all('admin'), 'club-admin'),     // a Club card whose entries say Manage
  'u-sa':    { role: 'superadmin' },
  'u-oldad': { role: 'admin' },                              // no pass, old League admin
  'u-oldst': { role: 'staff' },                              // no pass, old League staff
};
/* One database() per context: a second call re-points a running instance
   at the emulator and the SDK throws. */
const db = Object.fromEntries(Object.keys(users).map((u) => [u, env.authenticatedContext(u).database()]));
const clubCode = env.authenticatedContext('cc-tst', { club: 'TST' }).database();
const beToken = env.authenticatedContext('be-1', { be: 'm1' }).database();

await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.database();
  for (const k of [NEWS, KITS, SOTM, BE]) await set(ref(d, 'tools/' + k), REGISTRY[k]);
  for (const [uid, u] of Object.entries(users)) await set(ref(d, 'users/' + uid), u);
  await set(ref(d, 'app-data/' + SOTM + '/config'), { month: '2026-11' });
});

let pass = 0, fail = 0;
async function t(label, p, ok) {
  try { await (ok ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok  ', label); }
  catch (e) { fail++; console.log('XX  ', label, e.message); }
}
/* A kit record must hold club, season, outfield and gk (the rules validate it). */
const KIT = { club: 'Testham Town', season: '2026', outfield: { a: 1 }, gk: { a: 1 } };
const N = 'app-data/' + NEWS, K = 'app-data/' + KITS, S = 'app-data/' + SOTM, B = 'app-data/' + BE;

/* Newsletter: Manage only, League only */
await t('Newsletter: Manage reads and writes', set(ref(db['u-man'], N + '/editions/e1'), { t: 1 }), true);
await t('Newsletter: Access cannot read, whatever the old role', get(ref(db['u-acc'], N + '/editions')), false);
await t('Newsletter: a Club card never gets in', get(ref(db['u-club'], N + '/editions')), false);
await t('Newsletter: no pass, old admin role still writes', set(ref(db['u-oldad'], N + '/library/l1'), { t: 1 }), true);
await t('Newsletter: no pass, old staff role no longer reads', get(ref(db['u-oldst'], N + '/editions')), false);

/* Club Kits */
await t('Club Kits: Manage edits a club', set(ref(db['u-man'], K + '/submissions/Testham Town'), KIT), true);
await t('Club Kits: Access looks', get(ref(db['u-acc'], K + '/submissions')), true);
await t('Club Kits: Access cannot edit', set(ref(db['u-acc'], K + '/submissions/Testham Town'), KIT), false);
await t('Club Kits: a Club card cannot edit', set(ref(db['u-club'], K + '/submissions/Testham Town'), KIT), false);
await t('Club Kits: superadmin edits', set(ref(db['u-sa'], K + '/submissions/Testham Town'), KIT), true);

/* Save of the Month */
await t('SOTM: League Manage shortlists', set(ref(db['u-man'], S + '/shortlist/2026-11/TST/n1'), true), true);
await t('SOTM: League Access reads every club', get(ref(db['u-acc'], S + '/nominations')), true);
await t('SOTM: League Access cannot shortlist', set(ref(db['u-acc'], S + '/shortlist/2026-11/TST/n1'), true), false);
await t('SOTM: League Access cannot open a month', set(ref(db['u-acc'], S + '/config'), { month: '2026-12' }), false);
await t('SOTM: a Club card at Manage cannot read every club', get(ref(db['u-club'], S + '/nominations')), false);
await t('SOTM: a Club card at Manage cannot shortlist', set(ref(db['u-club'], S + '/shortlist/2026-11/TST/n1'), true), false);
await t('SOTM: a club code still reads the open month', get(ref(clubCode, S + '/config')), true);
await t('SOTM: a club code still reads its own nominations', get(ref(clubCode, S + '/nominations/2026-11/TST')), true);
await t('SOTM: League Off reads nothing', get(ref(db['u-off'], S + '/nominations')), false);

/* Brand Exposure */
await t('BE: League Access reads matches', get(ref(db['u-acc'], B + '/matches')), true);
await t('BE: League Access cannot change a match', set(ref(db['u-acc'], B + '/matches/m1/x'), 1), false);
await t('BE: League Manage changes a match', set(ref(db['u-man'], B + '/matches/m1/x'), 1), true);
await t('BE: a Club card cannot read matches', get(ref(db['u-club'], B + '/matches')), false);
await t('BE: the per-match token still writes its match', set(ref(beToken, B + '/matches/m1/y'), 1), true);
await t('BE: the token cannot write another match', set(ref(beToken, B + '/matches/m2/y'), 1), false);
await t('BE: League Off reads nothing', get(ref(db['u-off'], B + '/matches')), false);

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
