/* Invites (16/11/2026). The invite record (admin/invites/<token>) is written
   only by the server (Apps Script, with its own key, which these rules do
   not govern), so no account writes one directly. The pass an invite carries
   waits at admin/invite-passes/<token>: written once, by an admin, in their
   own name, and checked again by consumeInvite when the invite is used. An
   External invite may give each zone its own end date. Run by Auto · Test
   database rules. Made-up people. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ref, set, get, remove } from 'firebase/database';

const REPO = process.env.NL_REPO || '..';
const env = await initializeTestEnvironment({ projectId: 'demo-invites', database: {
  rules: readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8'), host: '127.0.0.1', port: 9000 } });

await env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database()), {
  users: {
    sa: { role: 'superadmin', name: 'S' },
    skel: { role: 'staff', name: 'K', pass: { base: 'league', issued: 1, skeleton: { given: 1 } } },
    ops: { role: 'admin', name: 'O', pass: { base: 'league', issued: 1, keys: { 'league-operations': { given: 1 } } } },
    staff: { role: 'staff', name: 'T', pass: { base: 'league', issued: 1 } },
    clubber: { role: 'club-staff', name: 'C', club: 'Testham Town', pass: { base: 'club', club: 'Testham Town', issued: 1 } },
  },
  externals: { reg: { name: 'Made-up Regulator', zones: { fin: { name: 'Finance', code: 'FIN' } } } },
  admin: { invites: { old: { email: 'x@example.invalid', role: 'staff' } } },
}));

const db = (uid) => env.authenticatedContext(uid).database();
const sa = db('sa'), skel = db('skel'), ops = db('ops'), staff = db('staff'), clubber = db('clubber');
const anon = env.unauthenticatedContext().database();

let pass = 0, fail = 0;
async function t(label, p, ok) {
  try { await (ok ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok  ', label); }
  catch (e) { fail++; console.log('XX  ', label, e.message); }
}

const clubPass = { base: 'club', club: 'Testham Town', issued: 1, keys: { 'club-media': { given: 1 } } };

/* The invite record: the server's alone */
await t('invite: League Operations cannot write an invite record', set(ref(ops, 'admin/invites/t1'), { email: 'a@example.invalid', role: 'superadmin' }), false);
await t('invite: nor can the superadmin role', set(ref(sa, 'admin/invites/t2'), { email: 'a@example.invalid', role: 'staff' }), false);
await t('invite: nor change one already sent', set(ref(ops, 'admin/invites/old/role'), 'superadmin'), false);
await t('invite: the invite link still reads its own', get(ref(anon, 'admin/invites/old')), true);

/* The pass beside it */
await t('pass: League Operations leaves a pass for an invite, in its own name', set(ref(ops, 'admin/invite-passes/t3'), { pass: clubPass, by: 'ops', at: 1 }), true);
await t('pass: not in someone else\'s name', set(ref(ops, 'admin/invite-passes/t4'), { pass: clubPass, by: 'skel', at: 1 }), false);
await t('pass: not over one already left', set(ref(ops, 'admin/invite-passes/t3'), { pass: clubPass, by: 'ops', at: 2 }), false);
await t('pass: never an External card', set(ref(sa, 'admin/invite-passes/t5'), { pass: { base: 'external', org: 'reg' }, by: 'sa', at: 1 }), false);
await t('pass: nothing extra beside it', set(ref(sa, 'admin/invite-passes/t6'), { pass: clubPass, by: 'sa', at: 1, role: 'superadmin' }), false);
await t('pass: League staff without the admin role cannot leave one', set(ref(staff, 'admin/invite-passes/t7'), { pass: clubPass, by: 'staff', at: 1 }), false);
await t('pass: nor a Club card', set(ref(clubber, 'admin/invite-passes/t8'), { pass: clubPass, by: 'clubber', at: 1 }), false);
await t('pass: an admin clears one (a revoked invite)', remove(ref(ops, 'admin/invite-passes/t3')), true);
await t('pass: League staff do not read them', get(ref(staff, 'admin/invite-passes')), false);

/* External invites: an end date per zone */
const ext = { org: 'reg', email: 'p@example.invalid', name: 'P', zones: { fin: true }, by: 'skel', at: 1 };
await t('external: an end date per zone', set(ref(skel, 'admin/external-invites/e1'), Object.assign({}, ext, { untils: { fin: Date.now() + 86400000 } })), true);
await t('external: not one in the past', set(ref(skel, 'admin/external-invites/e2'), Object.assign({}, ext, { untils: { fin: 1 } })), false);

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
