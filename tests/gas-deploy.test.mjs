/* Publish Apps Script must carry deletions to the live project (14/11/2026).
   clasp 3.3.0's `clasp push` builds its change list from the repo's files
   only (core/files.js getChangedFiles, read in the published package), so a
   file deleted from gas/ was "already up to date" and stayed live. The
   workflow now replaces the project's contents with gas/ and checks live
   afterwards. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const WF = read('.github/workflows/deploy-gas.yml');
const step = (name) => {
  const i = WF.indexOf(`- name: ${name}`);
  assert.ok(i > -1, `step "${name}" exists`);
  const j = WF.indexOf('- name:', i + 8);
  return WF.slice(i, j === -1 ? undefined : j);
};

test('the push sends the whole of gas/, not clasp push', () => {
  const push = step('Push gas/ into the project');
  assert.match(push, /node scripts\/gas-push-all\.mjs/);
  assert.doesNotMatch(push.replace(/#.*$/gm, ''), /clasp push/);
});

test('live is checked against gas/ after the push, before any redeploy', () => {
  const check = step('Check live now holds exactly gas/');
  assert.match(check, /clasp pull/);
  assert.match(check, /exit 1/);
  assert.ok(WF.indexOf('Check live now holds exactly gas/') < WF.indexOf('Redeploy the existing Web App deployment'));
});

test('the script uses clasp\'s own full upload', () => {
  const s = read('scripts/gas-push-all.mjs');
  assert.match(s, /clasp\.files\.push\(\)/);
  assert.match(s, /initAuth\(/);
  assert.doesNotMatch(s, /refresh_token|client_secret/, 'never handles the credential itself');
});

test('the retired FixtureSync stays out of gas/', () => {
  assert.ok(!existsSync(new URL('../gas/FixtureSync.js', import.meta.url)));
});
