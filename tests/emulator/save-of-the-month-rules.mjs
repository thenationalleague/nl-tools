/* Save of the Month — RTDB rules, against the emulator. Not in npm test (needs
   Java + firebase-tools); run by hand when app-data/media-save-of-the-month
   rules change. See tests/emulator/README.md:

     NL_REPO=/path/to/nl-tools npx firebase emulators:exec --project demo-sotm \
       --only database "node save-of-the-month-rules.mjs"

   Written 21/10/2026 after v1 of these rules refused EVERY club save: `at`
   was required by hasChildren but missing from the named children, so the
   $other:false catch-all rejected it. The first test below is that save.
   Unit tests with a stubbed database could never have seen it. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ref, set, get, remove, update, serverTimestamp } from 'firebase/database';
const env = await initializeTestEnvironment({ projectId: 'demo-sotm', database: { rules: readFileSync(join(process.env.NL_REPO || '..', 'system/rtdb/rules.snapshot.json'), 'utf8'), host: '127.0.0.1', port: 9000 } });
const B = 'app-data/media-save-of-the-month/';
const cfg = (c) => env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), B + 'config'), c));
await cfg({ month: '2026-10', closesAt: Date.now() + 86400000 });
const sol = env.authenticatedContext('u1', { club: 'SOL' }).database();
const ald = env.authenticatedContext('u2', { club: 'ALD' }).database();
const clip = { path: 'save-of-the-month/SOL/2026-10/a-clip.mp4', url: 'https://firebasestorage.googleapis.com/v0/b/x/o/y', name: 'clip.mp4', size: 2048, type: 'video/mp4' };
const rec = { matchId: 'g1', match: 'A 1–0 B', date: '2026-10-10', minute: 30, keeper: 'Alex Starter', at: serverTimestamp() };
let pass = 0, fail = 0;
async function t(label, p, shouldPass) {
  try { await (shouldPass ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok  ', label); }
  catch (e) { fail++; console.log('XX  ', label, e.message); }
}
const N = (k, c = 'SOL', m = '2026-10') => B + 'nominations/' + m + '/' + c + '/' + k;
await t('club saves a minimal nomination', set(ref(sol, N('-Nabc1')), rec), true);
await t('with context, keeperEdited and two clips', set(ref(sol, N('-Nabc2')), { ...rec, context: 'x', keeperEdited: true, clips: { c00: clip, c01: clip } }), true);
await t('legacy single clip still accepted', set(ref(sol, N('-Nabc3')), { ...rec, clip }), true);
await t('a sixth, seventh… nomination (no cap)', Promise.all([4,5,6,7].map(i => set(ref(sol, N('-Nabc' + i)), rec))), true);
await t('edit an existing nomination', set(ref(sol, N('-Nabc1')), { ...rec, minute: 44 }), true);
await t('remove own nomination', remove(ref(sol, N('-Nabc7'))), true);
await t('read own nominations', get(ref(sol, B + 'nominations/2026-10/SOL')), true);
await t('cannot read another club', get(ref(ald, B + 'nominations/2026-10/SOL')), false);
await t('cannot write for another club', set(ref(ald, N('-Nzzz')), rec), false);
await t('cannot write an unknown field', set(ref(sol, N('-Nbad1')), { ...rec, extra: 1 }), false);
await t('clip path must be own folder', set(ref(sol, N('-Nbad2')), { ...rec, clips: { c00: { ...clip, path: 'save-of-the-month/ALD/2026-10/x.mp4' } } }), false);
await t('minute out of range refused', set(ref(sol, N('-Nbad3')), { ...rec, minute: 0 }), false);
await t('bad key refused', set(ref(sol, N('bad key!')), rec), false);
await t('cannot write to a month that is not open', set(ref(sol, N('-Nabc8', 'SOL', '2026-09')), rec), false);
await t('cannot read the shortlist', get(ref(sol, B + 'shortlist')), false);
await t('cannot write config', set(ref(sol, B + 'config'), { month: '2026-11' }), false);
await cfg({ month: '2026-10', closesAt: Date.now() - 1000 });
await t('after the closing date: refused', set(ref(sol, N('-Nabc9')), rec), false);
await cfg({ month: '2026-10' });
await t('no closing date: open', set(ref(sol, N('-Nabc9')), rec), true);
await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
