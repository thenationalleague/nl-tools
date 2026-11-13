/* Manage on DAZN and Club Codes (13/11/2026), against the emulator. Run by
   "Auto · Test database rules".

   DAZN: the League side reads at Access and imports or edits at Manage; a
   club code still reads only its own club and the averages. Club Codes: the
   Codes tab in Access reads at Access and changes a code at Manage, and the
   Programme Packs console's own token (pClub '*') keeps its door until
   Programme Packs moves to the pass. Everyone here is made up. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ref, set, get } from 'firebase/database';

const REPO = process.env.NL_REPO || '..';
const env = await initializeTestEnvironment({ projectId: 'demo-manage-b2', database: { rules: readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8'), host: '127.0.0.1', port: 9000 } });
const REGISTRY = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));
const DAZN = 'media-dazn', CODES = 'ops-club-codes';
const all = (lvl) => ({ [DAZN]: lvl, [CODES]: lvl });
const person = (base, entries, role) => ({ role: role || 'staff', pass: { base, issued: 1 }, tools: entries || {} });
const users = {
  'u-man':   person('league', all('admin')),
  'u-acc':   person('league', all('access'), 'admin'),       // League card, Access; old role admin
  'u-off':   person('league', all('off')),
  'u-club':  person('club', all('admin'), 'club-admin'),     // a Club card whose entries say Manage
  'u-sa':    { role: 'superadmin' },
  'u-oldad': { role: 'admin' },                              // no pass, old League admin
  'u-oldst': { role: 'staff' },                              // no pass, old League staff
};
const db = Object.fromEntries(Object.keys(users).map((u) => [u, env.authenticatedContext(u).database()]));
const clubCode = env.authenticatedContext('cc-tst', { club: 'TST' }).database();
const ppAdmin = env.authenticatedContext('pp-admin-x', { pClub: '*', club: '*' }).database();

await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.database();
  for (const k of [DAZN, CODES]) await set(ref(d, 'tools/' + k), REGISTRY[k]);
  for (const [uid, u] of Object.entries(users)) await set(ref(d, 'users/' + uid), u);
});

let pass = 0, fail = 0;
async function t(label, p, ok) {
  try { await (ok ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok  ', label); }
  catch (e) { fail++; console.log('XX  ', label, e.message); }
}
const D = 'app-data/' + DAZN, C = 'app-data/club-codes';

/* DAZN */
await t('DAZN: Manage imports a season', set(ref(db['u-man'], D + '/seasons/2026/x'), 1), true);
await t('DAZN: Manage saves an override', set(ref(db['u-man'], D + '/overrides/2026/g1'), { neutral: true }), true);
await t('DAZN: Access reads everything', get(ref(db['u-acc'], D)), true);
await t('DAZN: Access cannot import, whatever the old role', set(ref(db['u-acc'], D + '/seasons/2026/x'), 1), false);
await t('DAZN: Off reads nothing', get(ref(db['u-off'], D)), false);
await t('DAZN: a Club card at Manage cannot read the League view', get(ref(db['u-club'], D)), false);
await t('DAZN: a Club card at Manage cannot import', set(ref(db['u-club'], D + '/seasons/2026/x'), 1), false);
await t('DAZN: superadmin imports', set(ref(db['u-sa'], D + '/seasons/2026/x'), 1), true);
await t('DAZN: no pass, old staff still reads', get(ref(db['u-oldst'], D)), true);
await t('DAZN: no pass, old staff cannot import', set(ref(db['u-oldst'], D + '/seasons/2026/x'), 1), false);
await t('DAZN: no pass, old admin imports', set(ref(db['u-oldad'], D + '/seasons/2026/x'), 1), true);
await t('DAZN: a club code reads its own club', get(ref(clubCode, D + '/seasons/2026/clubs/TST')), true);
await t('DAZN: a club code cannot read another club', get(ref(clubCode, D + '/seasons/2026/clubs/OTH')), false);
await t('DAZN: a club code reads the averages', get(ref(clubCode, D + '/seasons/2026/bench')), true);

/* Club Codes */
await t('Codes: Manage issues a code', set(ref(db['u-man'], C + '/clubs/TST'), { passcode: 'ABC234' }), true);
await t('Codes: Manage reads recent sign-ins', get(ref(db['u-man'], C + '/usage')), true);
await t('Codes: Access reads the codes', get(ref(db['u-acc'], C + '/clubs')), true);
await t('Codes: Access reads the League code', get(ref(db['u-acc'], C + '/nl')), true);
await t('Codes: Access cannot change a code, whatever the old role', set(ref(db['u-acc'], C + '/clubs/TST'), { passcode: 'XYZ789' }), false);
await t('Codes: Off reads nothing', get(ref(db['u-off'], C + '/clubs')), false);
await t('Codes: a Club card at Manage reads nothing', get(ref(db['u-club'], C + '/clubs')), false);
await t('Codes: no pass, old staff reads nothing', get(ref(db['u-oldst'], C + '/clubs')), false);
await t('Codes: no pass, old admin changes a code', set(ref(db['u-oldad'], C + '/clubs/TST'), { passcode: 'XYZ789' }), true);
await t('Codes: superadmin changes a code', set(ref(db['u-sa'], C + '/config/x'), 1), true);
await t('Codes: the Programme Packs console still reads', get(ref(ppAdmin, C + '/clubs')), true);
await t('Codes: the Programme Packs console still writes', set(ref(ppAdmin, C + '/clubs/TST'), { passcode: 'ABC234' }), true);
await t('Codes: a club code reads no codes', get(ref(clubCode, C + '/clubs')), false);

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
