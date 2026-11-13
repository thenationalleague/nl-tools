/* On screen, the pass's stickers are zones, not keys (Roadmap, decided
   13/11/2026). Ids, data and code keep "key"; only the words people read
   change. "Skeleton key" is the name of a pass, not a zone, and stays. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const read = (p) => readFileSync(join(REPO, p), 'utf8');

test('the who-can-open list names zones', () => {
  const utils = read('system/nl-utils.js');
  assert.match(utils, /k\.name \+ ' zone', level: byRank\(l\)/);
  assert.doesNotMatch(utils, /k\.name \+ ' key'/);
});

test('My pass says zones where people read it', () => {
  const pass = read('pass/index.html');
  assert.doesNotMatch(pass, /<label>Keys<\/label>/);
  assert.equal((pass.match(/<label>Zones<\/label>/g) || []).length, 2);
  assert.doesNotMatch(pass, /no keys/);
});

/* Passwords and your account (Roadmap, 13/11/2026). */
test('My pass has an Account section that changes your own password, current one first', () => {
  const pass = read('pass/index.html');
  assert.match(pass, /sec\.id = 'account';/);
  const fn = pass.slice(pass.indexOf('function changePassword'), pass.indexOf('function passwordError'));
  assert.ok(fn.indexOf('reauthenticateWithCredential') > 0 && fn.indexOf('reauthenticateWithCredential') < fn.indexOf('updatePassword'),
    'the current password is checked before the new one is set');
  assert.match(fn, /NL\.writeAudit\('password_changed'/);
  assert.match(pass, /code === 'auth\/invalid-credential'/, 'the code a wrong password gets with enumeration protection on');
});

test('the menu under the circle links to Account', () => {
  assert.match(read('system/nl-topbar.js'), /item\('\/pass\/#account', 'lock', 'Account'/);
});
