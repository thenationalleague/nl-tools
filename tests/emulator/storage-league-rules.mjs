/* File storage: League-only means the League mark (14/11/2026). Run by
   Auto · Test database rules, with the storage emulator (see
   tests/emulator/README.md):

     NL_REPO=/path/to/nl-tools npx firebase emulators:exec --project demo-stl \
       --only database,storage "node storage-league-rules.mjs"

   Until 14/11/2026 the League-only parts of file storage asked for an email
   address, which every account has: a Club card account, and anyone who
   signs up. They now ask for `league: true`, which only the server sets
   (functions/pass-claims.js). An account with an email and no mark is
   exactly what a sign-up looks like, so it stands in for one here. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.env.NL_REPO || '..';
const env = await initializeTestEnvironment({
  projectId: 'demo-stl',
  storage: { rules: readFileSync(join(REPO, 'system/storage/rules.snapshot.rules'), 'utf8'), host: '127.0.0.1', port: 9199 },
});
const bytes = new Uint8Array([1, 2, 3]);
const files = {
  'data/ga-hourly.json': 'application/json',
  'newsletter/library/a.png': 'image/png',
  'document-library/f1/a.pdf': 'application/pdf',
  'save-of-the-month/ABC/2026-11/a.mp4': 'video/mp4',
  'save-of-the-month/XYZ/2026-11/b.mp4': 'video/mp4',
  'footage/national-league-cup/a.mp4': 'video/mp4'
};
await env.withSecurityRulesDisabled(async (ctx) => {
  for (const [p, type] of Object.entries(files)) await ctx.storage().ref(p).put(bytes, { contentType: type });
});

const league = env.authenticatedContext('lg', { email: 'lg@example.test', league: true }).storage();
const signup = env.authenticatedContext('su', { email: 'su@example.test' }).storage();
const card = env.authenticatedContext('cc', { email: 'cc@example.test', club: 'ABC', clubName: 'Testham Town' }).storage();
const anon = env.authenticatedContext('an', {}).storage();

let pass = 0, fail = 0;
async function t(label, p, ok) {
  try { await (ok ? assertSucceeds(p) : assertFails(p)); pass++; console.log('ok  ', label); }
  catch (e) { fail++; console.log('XX  ', label, e.message); }
}

await t('a League account reads the data feeds', league.ref('data/ga-hourly.json').getMetadata(), true);
await t('a sign-up does not', signup.ref('data/ga-hourly.json').getMetadata(), false);
await t('a Club card does not', card.ref('data/ga-hourly.json').getMetadata(), false);
await t('a League account adds to the newsletter library', league.ref('newsletter/library/b.png').put(bytes, { contentType: 'image/png' }), true);
await t('a sign-up does not', signup.ref('newsletter/library/c.png').put(bytes, { contentType: 'image/png' }), false);
await t('a Club card reads a Document Library file (its club claim)', card.ref('document-library/f1/a.pdf').getMetadata(), true);
await t('a sign-up does not', signup.ref('document-library/f1/a.pdf').getMetadata(), false);
await t('a sign-up cannot delete one', signup.ref('document-library/f1/a.pdf').delete(), false);
await t('a Club card cannot delete one', card.ref('document-library/f1/a.pdf').delete(), false);
await t('a club reads its own Save of the Month clip', card.ref('save-of-the-month/ABC/2026-11/a.mp4').getMetadata(), true);
await t('but not another club\'s', card.ref('save-of-the-month/XYZ/2026-11/b.mp4').getMetadata(), false);
await t('nor can it delete another club\'s', card.ref('save-of-the-month/XYZ/2026-11/b.mp4').delete(), false);
await t('a League account reads any club\'s clip', league.ref('save-of-the-month/XYZ/2026-11/b.mp4').getMetadata(), true);
await t('nobody uploads to the retired footage folder', anon.ref('footage/national-league-cup/x.mp4').put(bytes, { contentType: 'video/mp4' }), false);
await t('nor does a League account', league.ref('footage/national-league-cup/y.mp4').put(bytes, { contentType: 'video/mp4' }), false);
await t('an anonymous session reads no footage', anon.ref('footage/national-league-cup/a.mp4').getMetadata(), false);

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
