/* Financial Benchmarking is one page (14/11/2026): clubs by code or Club
   card, the League at its level, at /financial-benchmarking/, through the
   canon door (NL.codeGate.door, nl-utils v1.68). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const PAGE = read('financial-benchmarking/index.html');
const UTILS = read('system/nl-utils.js');

test('/financial-benchmarking/admin/ forwards, keeping the query and hash, loading nothing', () => {
  const stub = read('financial-benchmarking/admin/index.html');
  assert.match(stub, /location\.replace\('\/financial-benchmarking\/' \+ \(q \? '\?' \+ q : ''\) \+ location\.hash\)/);
  assert.doesNotMatch(stub, /(src|href)="\/system\//);
});

test('the page uses the canon door, not auth-guard, and never sends anyone to /admin/', () => {
  assert.match(PAGE, /NL\.codeGate\.door\(\{\s*toolKey: 'ops-financial-benchmarking'/);
  assert.doesNotMatch(PAGE, /auth-guard\.js/);
  assert.doesNotMatch(PAGE, /staffUrl/);
  assert.doesNotMatch(PAGE, /href="\/financial-benchmarking\/admin\/"/);
});

test('the League side boots as before, revealed by the door; Import only at Manage', () => {
  assert.match(PAGE, /league: function \(session\) \{\s*\$\('fbGate'\)\.hidden = true;\s*\$\('pageWrap'\)\.style\.display = 'block';\s*window\.TOOL\.boot\(session\);/);
  assert.match(PAGE, /S\.canWrite = !!session && session\.toolLevel === 'admin';/);
  assert.doesNotMatch(PAGE, /_toolDeferredSession/);
});

test('the club bar starts hidden and shows only with the code card or a code session', () => {
  assert.match(PAGE, /<header class="nl-idbar" hidden>/);
  assert.match(PAGE, /showCode: function \(\) \{ document\.querySelector\('\.nl-idbar'\)\.hidden = false; \}/);
  assert.match(PAGE, /if \(session\.mode !== 'account'\) document\.querySelector\('\.nl-idbar'\)\.hidden = false;/);
});

test('the door: a League account at its level, anyone else the code door', () => {
  const door = UTILS.slice(UTILS.indexOf('    door: function (opts) {'), UTILS.indexOf('    viaFunction: codeGateViaFunction,'));
  assert.match(door, /window\.NL\.accountLevel\.load\(user\.uid, opts\.toolKey\)/);
  assert.match(door, /if \(!who\.league\) \{ codeDoor\(\); return; \}/);
  assert.match(door, /toolLevel: who\.level === 'manage' \? 'admin' : \(who\.level === 'access' \? 'access' : 'off'\)/);
  assert.match(door, /if \(session\.toolLevel === 'off'\)/);
  assert.match(door, /if \(opts\.showCode\) opts\.showCode\(\);\s*return codeGateOpen\(c\);/);
});
