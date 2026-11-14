/* Two reads that were open to anyone signed in, closed 14/11/2026. Run by
   Auto · Test database rules on any change to the rules (see
   tests/emulator/README.md):

     NL_REPO=/path/to/nl-tools npx firebase emulators:exec --project demo-exp \
       --only database "node exposure-rules.mjs"

   admin/invites-pending holds every unused invite: name, email, role and
   its token. "Signed in" stopped meaning League staff once club codes and
   club logins arrived (a code session is signed in too), and the token is
   the only secret an invite has: with it and the email, anyone could take
   the account the invite was for. It is now read only by those who manage
   accounts, as admin/requests always was.

   ops-club-kits/submissions was readable by anyone at all, for the public
   kit form retired 15/10/2026, and a League edit stamps the editor's
   address into the record. It now needs a League card and Access on Club
   Kits (manage-batch1-rules.mjs checks Access still reads it). */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ref, get, set } from 'firebase/database';

const env = await initializeTestEnvironment({ projectId: 'demo-exp', database: { rules: readFileSync(join(process.env.NL_REPO || '..', 'system/rtdb/rules.snapshot.json'), 'utf8'), host: '127.0.0.1', port: 9000 } });
await env.withSecurityRulesDisabled(async (ctx) => {
  const root = ctx.database();   /* once: a second database() call re-initialises */
  await set(ref(root, 'users'), {
    sa: { role: 'superadmin' },
    ad: { role: 'admin', pass: { base: 'league' } },
    st: { role: 'staff', pass: { base: 'league' } },
    cl: { role: 'club-admin', club: 'X', pass: { base: 'club', club: 'X' } },
    /* A sign-up waiting for approval, as account.js writes it since
       14/11/2026, and as it wrote it before (the shape the one-off tidy
       clears). */
    wt: { role: 'pending', pending: true, tools: {} },
    old: { role: 'club', club: 'X', pending: true, tools: { 'ops-club-codes': 'access' } }
  });
  await set(ref(root, 'admin/invites-pending/k1'), { email: 'someone@example.invalid', token: 't-made-up', role: 'staff' });
  await set(ref(root, 'app-data/ops-club-kits/submissions/X'), { outfield: [], editedBy: 'someone@example.invalid' });
});
/* One context per person: asking twice re-initialises the app, which the
   emulator refuses. */
const ctxs = {};
const db = (uid, claims) => (ctxs[uid] ||= env.authenticatedContext(uid, claims).database());
const anon = env.unauthenticatedContext().database();

let pass = 0, fail = 0;
async function t(label, p, shouldPass) {
  try { await (shouldPass ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok  ', label); }
  catch (e) { fail++; console.log('XX  ', label, e.message); }
}

const INV = 'admin/invites-pending';
await t('the superadmin role reads pending invites', get(ref(db('sa'), INV)), true);
await t('the admin role reads pending invites', get(ref(db('ad'), INV)), true);
await t('League staff cannot', get(ref(db('st'), INV)), false);
await t('a club account cannot', get(ref(db('cl'), INV)), false);
await t('a club code session cannot', get(ref(db('code1', { club: 'X' }), INV)), false);
await t('signed out cannot', get(ref(anon, INV)), false);

const KITS = 'app-data/ops-club-kits/submissions';
await t('the superadmin role reads kit submissions', get(ref(db('sa'), KITS)), true);
await t('a club account cannot', get(ref(db('cl'), KITS)), false);
await t('a club code session cannot', get(ref(db('code1', { club: 'X' }), KITS)), false);
await t('signed out cannot', get(ref(anon, KITS)), false);

const DIR = 'app-data/ops-club-directory/clubs/X';
const CB = 'app-data/ops-commercial-benchmarking/clubs/X';
await t('a waiting sign-up cannot read a club\'s directory entry', get(ref(db('wt'), DIR)), false);
await t('a waiting sign-up cannot read a club\'s benchmarking', get(ref(db('wt'), CB)), false);
await t('the old waiting shape could (so the tidy is needed)', get(ref(db('old'), DIR)), true);

const AUD = 'admin/audit/';
await t('anyone signed in logs their own action', set(ref(db('st'), AUD + 'k1'), { uid: 'st', action: 'x' }), true);
await t('nobody logs an action as someone else', set(ref(db('st'), AUD + 'k2'), { uid: 'sa', action: 'x' }), false);
await t('a code session cannot log as a person', set(ref(db('code1', { club: 'X' }), AUD + 'k3'), { uid: 'sa', action: 'x' }), false);
await t('an action about someone files under them too', set(ref(db('ad'), 'admin/audit-by-user/cl/k4'), { uid: 'ad', targetUid: 'cl', action: 'x' }), true);
await t('but not under a third person', set(ref(db('ad'), 'admin/audit-by-user/st/k5'), { uid: 'ad', targetUid: 'cl', action: 'x' }), false);
await t('the old tool requests node is closed', set(ref(db('st'), 'admin/tool-requests/k6'), { x: 1 }), false);
await t('the old notifications node is closed', set(ref(db('st'), 'admin/notifications/sa/k7'), { x: 1 }), false);

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
