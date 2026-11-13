/* Fixture Management v4.2 (13/11/2026): Correct, Remove and Restore, the
   league count, and the Manage tab. Read from the page, as the page has no
   module to import; the counts arithmetic is checked against clubs-meta. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const PAGE = readFileSync(join(REPO, 'fixtures/index.html'), 'utf8');
const META = JSON.parse(readFileSync(join(REPO, 'assets/data/clubs-meta.json'), 'utf8'));

test('the tab is Manage, last, with Settings, Import and Removed in that order', () => {
  const tabs = [...PAGE.matchAll(/data-tab="([a-z]+)"/g)].map((m) => m[1]);
  assert.equal(tabs[tabs.length - 1], 'manage');
  assert.ok(!PAGE.includes('data-tab="settings"'));
  const panel = PAGE.slice(PAGE.indexOf('<section data-panel="manage"'));
  const order = ['<h2>Settings</h2>', '<h2>Import</h2>', '<h2>Removed</h2>'].map((h) => panel.indexOf(h));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], 'Settings, Import, Removed');
});

test('Correct opens the clubs and competition and never changes the key', () => {
  assert.match(PAGE, /var fixedTeams = !isNew && !correct && \(comp\.league \|\| rec\.source === 'import'\);/);
  assert.match(PAGE, /id="fmeCorrect">/);
  assert.match(PAGE, /ctrl\.close\(\); openEdit\(rec, \{ correct: true \}\);/);
  /* a new key is minted only for a new tie */
  assert.match(PAGE, /if \(isNew\) \{\n\s+var key = opta \|\| F\.mintKey/);
  assert.match(PAGE, /NL\.writeAudit\('fixtures_correct'/);
});

test('Remove is for every fixture, typed, refused with a crowd, and kept for Restore', () => {
  assert.ok(!/label: 'Delete'/.test(PAGE), 'no hard delete left');
  assert.match(PAGE, /if \(!ro && rec\) \{\n\s+buttons\.push\(\{ label: 'Remove'/);
  const fn = PAGE.slice(PAGE.indexOf('function removeFixture'), PAGE.indexOf('function restoreFixture'));
  const guard = fn.indexOf('if (S.crowds[rec.key]) {');
  assert.ok(guard > 0 && guard < fn.indexOf('NL.prompt'), 'a crowd stops it before anything is asked');
  assert.match(fn, /toUpperCase\(\) !== 'REMOVE'/);
  assert.match(fn, /up\['removed\/' \+ rec\.key\] = \{ fixture: clean\(rec\)/);
  assert.match(fn, /up\['fixtures\/' \+ rec\.key\] = null;/);
  assert.match(fn, /up\['public\/' \+ rec\.key\] = null;/);
  const back = PAGE.slice(PAGE.indexOf('function restoreFixture'), PAGE.indexOf('function renderRemoved'));
  assert.match(back, /if \(S\.fixtures\[key\]\)/, 'never restores over a live fixture');
  assert.match(back, /up\['removed\/' \+ key\] = null;\n\s+patch\(up, rec\);/, 'back under the same key, public view rebuilt');
});

test('a division of 24 clubs should hold 552 league games', () => {
  assert.match(PAGE, /want: n \* \(n - 1\)/);
  assert.match(PAGE, /r\.comp === c\.key && !r\.playoff/, 'play-offs are not counted');
  for (const div of ['National', 'North', 'South']) {
    const n = META.clubs.filter((c) => c.seasons && c.seasons['2026'] === div).length;
    assert.equal(n * (n - 1), 552, div);
  }
});
