/* External passes (16/11/2026): who may set up an organisation and its
   people, who may read it, and that an External account reaches Financial
   Benchmarking only through the entry the server writes for it. Also
   re-proves the club code route: a code session reads its own club's row
   and nothing that names every club. Commercial Benchmarking (16/11/2026)
   opens to an External card only with both the server's All clubs entry
   and the tool entry Access writes. Run by Auto · Test database rules
   (tests/emulator/README.md). Made-up people, organisations and figures. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ref, set, get, update } from 'firebase/database';

const REPO = process.env.NL_REPO || '..';
const env = await initializeTestEnvironment({ projectId: 'demo-externals', database: {
  rules: readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8'), host: '127.0.0.1', port: 9000 } });
const REG = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));
const FB = 'ops-financial-benchmarking';
const CB = 'ops-commercial-benchmarking';
const CBALL = { [CB]: { level: 'access', view: 'all', zones: ['com'] } };
const ORG = { name: 'Made-up Regulator', zones: { fin: { name: 'Finance', code: 'FIN',
  tools: { [FB]: { level: 'access', view: 'all', reason: 'Already receives these figures', by: 'skel', at: 1 } } } } };

await env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database()), {
  tools: { [FB]: REG[FB], [CB]: REG[CB] },
  users: {
    skel: { role: 'staff', name: 'S', pass: { base: 'league', issued: 1, skeleton: { given: 1 } } },
    staff: { role: 'staff', name: 'L', pass: { base: 'league', issued: 1 } },
    ext1: { role: 'external', name: 'E', org: 'Made-up Regulator', pass: { base: 'external', org: 'reg', issued: 1, keys: { fin: { given: 1 } } },
      tools: { [FB]: 'access' } },
    ext2: { role: 'external', name: 'F', pass: { base: 'external', org: 'other', issued: 1, keys: { x: { given: 1 } } } },
    /* Commercial Benchmarking: both locks, the tool entry only, the
       server's entry only, and the server's entry for one club. */
    extcb: { role: 'external', name: 'G', pass: { base: 'external', org: 'reg', issued: 1, keys: { com: { given: 1 } }, ext: CBALL }, tools: { [CB]: 'access' } },
    exttool: { role: 'external', name: 'H', pass: { base: 'external', org: 'reg', issued: 1, keys: { com: { given: 1 } } }, tools: { [CB]: 'access' } },
    extext: { role: 'external', name: 'I', pass: { base: 'external', org: 'reg', issued: 1, keys: { com: { given: 1 } }, ext: CBALL } },
    extone: { role: 'external', name: 'J', pass: { base: 'external', org: 'reg', issued: 1, keys: { com: { given: 1 } },
      ext: { [CB]: { level: 'access', view: 'one', club: 'ABC', zones: ['com'] } } }, tools: { [CB]: 'access' } },
    clubcard: { role: 'club-staff', name: 'K', pass: { base: 'club', club: 'Testham Town', issued: 1 }, tools: { [CB]: 'access' } },
    leaguecb: { role: 'staff', name: 'P', pass: { base: 'league', issued: 1 }, tools: { [CB]: 'access' } },
    leagueops: { role: 'admin', name: 'M', pass: { base: 'league', issued: 1, keys: { 'league-operations': { given: 1 } } } },
  },
  externals: { reg: ORG, other: { name: 'Other', zones: { x: { name: 'X', code: 'XXX' } } } },
  'app-data': { [FB]: {
    index: { '2026': { q1: { at: 1, clubs: 2 } } },
    returns: { '2026': { q1: {
      clubs: { ABC: { div: 'National', v: { incomeBudget: 1 } }, XYZ: { div: 'National', v: { incomeBudget: 2 } } },
      bench: { National: { incomeBudget: [1, 2] } } } } },
  },
  [CB]: {
    aggregates: { roster: [{ club: 'Testham Town', data: true }, { club: 'Otherby Rovers', data: true }] },
    clubs: { 'Testham Town': { club: 'Testham Town', metrics: { a: 1 } }, 'Otherby Rovers': { club: 'Otherby Rovers', metrics: { a: 2 } } },
  } },
}));

const ctxs = {};
const db = (uid, claims) => (ctxs[uid] ||= (uid ? env.authenticatedContext(uid, claims) : env.unauthenticatedContext()).database());
const skel = db('skel'), staff = db('staff'), ext1 = db('ext1'), ext2 = db('ext2');
const extcb = db('extcb'), exttool = db('exttool'), extext = db('extext'), extone = db('extone'), clubcard = db('clubcard'), leagueops = db('leagueops'), leaguecb = db('leaguecb');
const cbCode = db('anon-code-TST', { club: 'TST', clubName: 'Testham Town' });
const code = db('anon-code-ABC', { club: 'ABC' });
const anon = db('anon-plain');

let pass = 0, fail = 0;
async function t(label, p, ok) {
  try { await (ok ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok  ', label); }
  catch (e) { fail++; console.log('XX  ', label, e.message); }
}

/* Organisations */
await t('the Skeleton key sets up an organisation', set(ref(skel, 'externals/new'), { name: 'New', zones: { z: { name: 'Zone', code: 'ZON' } } }), true);
await t('League staff cannot', set(ref(staff, 'externals/new2'), { name: 'New' }), false);
await t('an External account cannot', update(ref(ext1, 'externals/reg/zones/fin/tools/' + FB), { level: 'manage' }), false);
await t('a zone code is three capital letters', set(ref(skel, 'externals/bad'), { name: 'Bad', zones: { z: { name: 'Z', code: 'zz1' } } }), false);
await t('a tool in a zone needs a reason', set(ref(skel, 'externals/bad'), { name: 'Bad', zones: { z: { name: 'Z', code: 'ZZZ', tools: { [FB]: { level: 'access' } } } } }), false);
await t('no level beyond Manage', set(ref(skel, 'externals/bad'), { name: 'Bad', zones: { z: { name: 'Z', code: 'ZZZ', tools: { [FB]: { level: 'owner', reason: 'r' } } } } }), false);
await t('a member reads its own organisation', get(ref(ext1, 'externals/reg')), true);
await t('not another organisation', get(ref(ext1, 'externals/other')), false);
await t('not the list of organisations', get(ref(ext1, 'externals')), false);
await t('League staff do not read organisations', get(ref(staff, 'externals/reg')), false);
await t('the Skeleton key reads them all', get(ref(skel, 'externals')), true);

/* Invites */
const inv = { org: 'reg', email: 'person@example.org', name: 'Person', zones: { fin: true }, by: 'skel', at: 1 };
await t('the Skeleton key asks for an account, in its own name', set(ref(skel, 'admin/external-invites/i1'), inv), true);
await t('not in someone else\'s name', set(ref(skel, 'admin/external-invites/i2'), Object.assign({}, inv, { by: 'staff' })), false);
await t('not for an organisation that does not exist', set(ref(skel, 'admin/external-invites/i3'), Object.assign({}, inv, { org: 'nope' })), false);
await t('not with a result already written', set(ref(skel, 'admin/external-invites/i4'), Object.assign({}, inv, { result: { ok: true } })), false);
await t('not over an earlier request', set(ref(skel, 'admin/external-invites/i1'), inv), false);
await t('League staff cannot ask', set(ref(staff, 'admin/external-invites/i5'), Object.assign({}, inv, { by: 'staff' })), false);
await t('an External account cannot ask', set(ref(ext1, 'admin/external-invites/i6'), Object.assign({}, inv, { by: 'ext1' })), false);
await t('only the Skeleton key reads the requests', get(ref(staff, 'admin/external-invites')), false);

/* Financial Benchmarking */
await t('an External account with the server\'s entry reads every club, named', get(ref(ext1, 'app-data/' + FB + '/returns')), true);
await t('one without it reads nothing', get(ref(ext2, 'app-data/' + FB + '/returns')), false);
await t('an External account cannot write the figures', set(ref(ext1, 'app-data/' + FB + '/returns/2026/q1/clubs/ABC/v/incomeBudget'), 9), false);
await t('nor give itself the entry', set(ref(ext2, 'users/ext2/tools/' + FB), 'access'), false);
await t('nor change its own pass', set(ref(ext2, 'users/ext2/pass/ext'), { [FB]: { level: 'access', view: 'all' } }), false);
await t('nor change its own zones', set(ref(ext1, 'users/ext1/pass/keys/x'), { given: 1 }), false);

/* Commercial Benchmarking: All clubs, named, for an External card */
const CBC = 'app-data/' + CB + '/clubs';
await t('CB: an External card with both entries reads every club, named', get(ref(extcb, CBC)), true);
await t('CB: not with the tool entry alone', get(ref(exttool, CBC)), false);
await t('CB: not with the server\'s entry alone', get(ref(extext, CBC)), false);
await t('CB: not with a One club entry', get(ref(extone, CBC)), false);
await t('CB: another organisation\'s External card reads nothing', get(ref(ext2, CBC)), false);
await t('CB: an External card never writes', set(ref(extcb, CBC + '/Testham Town/metrics/a'), 9), false);
await t('CB: nor signs off a club\'s figures', set(ref(extcb, CBC + '/Testham Town/confirm'), { confirmed: true, at: 1 }), false);
await t('CB: a Club card still reads no other club', get(ref(clubcard, CBC)), false);
await t('CB: League staff at Access still read it', get(ref(leaguecb, CBC)), true);
await t('CB: League staff at Off do not', get(ref(staff, CBC)), false);
await t('CB: a club code reads its own row', get(ref(cbCode, CBC + '/Testham Town')), true);
await t('CB: not another club\'s', get(ref(cbCode, CBC + '/Otherby Rovers')), false);
await t('CB: not every club', get(ref(cbCode, CBC)), false);
await t('CB: a plain anonymous session reads no row', get(ref(anon, CBC)), false);
await t('CB: nobody gives themselves the server\'s entry', set(ref(exttool, 'users/exttool/pass/ext'), CBALL), false);
await t('CB: League Operations cannot make an External card', set(ref(leagueops, 'users/newext'),
  { role: 'external', name: 'N', pass: { base: 'external', org: 'reg', issued: 1, ext: CBALL }, tools: { [CB]: 'access' } }), false);

/* The club code route, unchanged */
await t('a club code reads its own club\'s row', get(ref(code, 'app-data/' + FB + '/returns/2026/q1/clubs/ABC')), true);
await t('not another club\'s row', get(ref(code, 'app-data/' + FB + '/returns/2026/q1/clubs/XYZ')), false);
await t('not every club\'s rows', get(ref(code, 'app-data/' + FB + '/returns/2026/q1/clubs')), false);
await t('not the whole return', get(ref(code, 'app-data/' + FB + '/returns')), false);
await t('its division\'s unnamed lists', get(ref(code, 'app-data/' + FB + '/returns/2026/q1/bench/National')), true);
await t('a plain anonymous session reads no row', get(ref(anon, 'app-data/' + FB + '/returns/2026/q1/clubs/ABC')), false);
await t('nor the whole return', get(ref(anon, 'app-data/' + FB + '/returns')), false);
await t('a code session cannot read organisations', get(ref(code, 'externals/reg')), false);

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
