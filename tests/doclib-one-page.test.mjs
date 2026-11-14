/* Document Library is one page (14/11/2026): clubs by code or Club card,
   the League at its level, at /document-library/. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const PAGE = read('document-library/index.html');
const STUB = read('document-library/admin/index.html');
const CON = read('document-library/_console.js');

test('/document-library/admin/ forwards, keeping the query and hash, loading nothing', () => {
  assert.match(STUB, /location\.replace\('\/document-library\/' \+ \(q \? '\?' \+ q : ''\) \+ location\.hash\)/);
  assert.doesNotMatch(STUB, /(src|href)="\/system\//);
});

test('the registry opens it at its one address', () => {
  const rec = JSON.parse(read('system/rtdb/tools-registry.snapshot.json'))['ops-document-library'];
  assert.equal(rec.url, '/document-library/');
  assert.equal(rec.clubUrl, '/document-library/');
});

test('the level is the canon one, and Off says so', () => {
  assert.match(PAGE, /NL\.accountLevel\.load\(user\.uid, KEY, db\)/);
  assert.match(PAGE, /if \(who\.level === 'off'\)/);
  assert.match(PAGE, /if \(!who\.league\) \{ codeDoor\(\); return; \}/, 'a Club card goes to the code door, which resumes its claim');
  assert.doesNotMatch(PAGE, /auth-guard\.js/, 'auth-guard would send a code holder to sign in');
  assert.doesNotMatch(PAGE, /staffUrl/, 'no League page to send anyone to');
});

test('only Manage writes and sees the Bin; the console loads only for the League', () => {
  assert.match(PAGE, /var manage = who\.level === 'manage';/);
  assert.match(PAGE, /document\.querySelector\('\[data-tab="bin"\]'\)\.hidden = !manage;/);
  assert.match(PAGE, /writable: manage,/);
  assert.match(PAGE, /writable: false,/, 'the club side never writes');
  assert.match(PAGE, /loadScript\('\/document-library\/_console\.js\?v=1'\)/);
  assert.doesNotMatch(PAGE, /<script[^>]+_console\.js/);
});

test('nothing white flashes for a signed-in visitor: the code bar starts hidden', () => {
  assert.match(PAGE, /<header class="nl-idbar" hidden>/);
  assert.match(PAGE, /function codeDoor\(\) \{\s*document\.querySelector\('\.nl-idbar'\)\.hidden = false;/);
  assert.match(PAGE, /<body>\s*(<!--[\s\S]*?-->\s*)?<div id="nlTopbar"><\/div>/);
});

test('the console\'s buttons carry icons, and its empty states have no emoji', () => {
  assert.match(CON, /icon\('refresh'\) \+ 'Restore<\/button>'/);
  assert.match(CON, /icon\('delete'\) \+ 'Delete for good<\/button>'/);
  assert.doesNotMatch(CON, /empty-state__icon/);
});
