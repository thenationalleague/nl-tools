/* Programme Packs — who may write a club's library (RTDB), against the
   emulator. Run by "Auto · Test database rules" on rules PRs.

   13/11/2026 (Richard): Access reads, Manage writes. A club code always
   carries Manage (pManage); a Club card only with Manage on the tool; the
   League console's '*' writes everywhere. Storage asks the same of uploads
   (system/storage/rules.snapshot.rules), which this database-only run does
   not cover. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ref, set, get, remove } from 'firebase/database';

const env = await initializeTestEnvironment({ projectId: 'demo-pp', database: { rules: readFileSync(join(process.env.NL_REPO || '..', 'system/rtdb/rules.snapshot.json'), 'utf8'), host: '127.0.0.1', port: 9000 } });
const ROOT = 'app-data/media-programme';
const as = (uid, claims) => env.authenticatedContext(uid, claims).database();
const code = as('pp-fgr', { pClub: 'fgr', club: 'fgr', pManage: true });
const cardManage = as('u-media', { pClub: 'fgr', club: 'fgr', pManage: true });
const cardAccess = as('u-staff', { pClub: 'fgr', club: 'fgr' });
const other = as('pp-wok', { pClub: 'wok', club: 'wok', pManage: true });
const master = as('pp-admin-x', { pClub: '*', club: '*' });
const file = { name: 'a.pdf', folderId: 'f1', storagePath: 'programme/fgr/a.pdf' };

await env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), ROOT + '/files/fgr/seed'), file));

let pass = 0, fail = 0;
async function t(label, p, ok) {
  try { await (ok ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok  ', label); }
  catch (e) { fail++; console.log('XX  ', label, e.message); }
}
await t('a club code writes its own library', set(ref(code, ROOT + '/files/fgr/x1'), file), true);
await t('a Club card with Manage writes its own library', set(ref(cardManage, ROOT + '/files/fgr/x2'), file), true);
await t('a Club card with Access reads its own library', get(ref(cardAccess, ROOT + '/files/fgr')), true);
await t('a Club card with Access cannot add a file', set(ref(cardAccess, ROOT + '/files/fgr/x3'), file), false);
await t('a Club card with Access cannot add a folder', set(ref(cardAccess, ROOT + '/folders/fgr/f9'), { name: 'New' }), false);
await t('a Club card with Access cannot remove a file', remove(ref(cardAccess, ROOT + '/files/fgr/seed')), false);
await t('a Club card with Access cannot bin a file', set(ref(cardAccess, ROOT + '/trash/fgr/seed'), file), false);
await t('another club cannot write here', set(ref(other, ROOT + '/files/fgr/x4'), file), false);
await t('the League console writes anywhere', set(ref(master, ROOT + '/files/fgr/x5'), file), true);
await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
