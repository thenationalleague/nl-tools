/* UW vouchers: a club sees and changes its own codes only (14/11/2026).
   Run by Auto · Test database rules (tests/emulator/README.md):

     NL_REPO=/path/to/nl-tools npx firebase emulators:exec --project demo-uw \
       --only database "node uw-codes-rules.mjs"

   Until 14/11/2026 any UW session, a till PIN included, could read every
   club's codes and rewrite any of them; "one club only" was the page's
   rule, not the database's. Now a till or manager reads by its own club,
   or one code by its text (limitToFirst(1), what the till does when a code
   is typed), and writes only codes registered to its club. The claims are
   the ones functions/uw-promo.js mints: uwRole, and uwClub for a club. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ref, set, get, update, query, orderByChild, equalTo, limitToFirst } from 'firebase/database';

const env = await initializeTestEnvironment({ projectId: 'demo-uw', database: { rules: readFileSync(join(process.env.NL_REPO || '..', 'system/rtdb/rules.snapshot.json'), 'utf8'), host: '127.0.0.1', port: 9000 } });
const C = 'app-data/uw-promo/codes';
await env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), C), {
  a1: { code: 'AAA-111', norm: 'AAA111', status: 'active', club: 'ABC' },
  x1: { code: 'XXX-999', norm: 'XXX999', status: 'active', club: 'XYZ' }
}));
const ctxs = {};
const db = (uid, claims) => (ctxs[uid] ||= env.authenticatedContext(uid, claims).database());
const till = db('uw-ABC-till', { uwRole: 'till', uwClub: 'ABC' });
const mgr = db('uw-ABC-manager', { uwRole: 'manager', uwClub: 'ABC' });
const uw = db('uw-partner', { uwRole: 'uw' });

let pass = 0, fail = 0;
async function t(label, p, ok) {
  try { await (ok ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok  ', label); }
  catch (e) { fail++; console.log('XX  ', label, e.message); }
}

await t('a till lists its own club\'s codes', get(query(ref(till, C), orderByChild('club'), equalTo('ABC'))), true);
await t('not another club\'s', get(query(ref(till, C), orderByChild('club'), equalTo('XYZ'))), false);
await t('not every club\'s', get(ref(till, C)), false);
await t('a till looks up one typed code', get(query(ref(till, C), orderByChild('norm'), equalTo('XXX999'), limitToFirst(1))), true);
await t('but not without the limit', get(query(ref(till, C), orderByChild('norm'), equalTo('XXX999'))), false);
await t('a till opens its own code', get(ref(till, C + '/a1')), true);
await t('not another club\'s', get(ref(till, C + '/x1')), false);
await t('a till redeems its own code', update(ref(till, C + '/a1'), { status: 'redeemed', redeemedAt: 1 }), true);
await t('not another club\'s', update(ref(till, C + '/x1'), { status: 'redeemed', redeemedAt: 1 }), false);
await t('nor moves a code to its club', update(ref(till, C + '/x1'), { club: 'ABC' }), false);
await t('nor gives its code away', update(ref(mgr, C + '/a1'), { club: 'XYZ' }), false);
await t('a manager uploads a code for its club', set(ref(mgr, C + '/n1'), { code: 'NEW-1', norm: 'NEW1', status: 'active', club: 'ABC' }), true);
await t('not for another club', set(ref(mgr, C + '/n2'), { code: 'NEW-2', norm: 'NEW2', status: 'active', club: 'XYZ' }), false);
await t('UW reads every code', get(ref(uw, C)), true);
await t('UW dispatches any code', update(ref(uw, C + '/x1'), { dispatchedAt: 1 }), true);

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
