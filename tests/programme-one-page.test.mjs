/* Programme Packs is one page (v1.32, 13/11/2026). The console that lived at
   /programme/admin/ is the League's tabs on /programme/, so pull-to-refresh
   and the page scroll behave as on any other page (the console framed the
   Library, and a framed page cannot be pulled down). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const PAGE = read('programme/index.html');
const CON = read('programme/_console.js');
const STUB = read('programme/admin/index.html');
const CSS = read('programme/_shared.css');

test('/programme/admin/ forwards here, keeping the query and hash, and loads nothing', () => {
  assert.match(STUB, /location\.replace\('\/programme\/' \+ \(q \? '\?' \+ q : ''\) \+ location\.hash\)/);
  assert.match(STUB, /<meta http-equiv="refresh" content="0; url=\/programme\/">/);
  assert.doesNotMatch(STUB, /(src|href)="\/system\//, 'a redirect never waits on an asset');
});

test('the registry opens Programme Packs at its one address', () => {
  const reg = JSON.parse(read('system/rtdb/tools-registry.snapshot.json'));
  const rec = reg['media-programme'] || (reg.tools && reg.tools['media-programme']);
  assert.ok(rec, 'media-programme is in the registry');
  assert.equal(rec.url, '/programme/');
});

test('no framed Library, no master or embed modes', () => {
  /* A PDF preview is still a frame (the browser's own viewer); the Library is not. */
  assert.doesNotMatch(PAGE, /<iframe[^>]+programme/);
  assert.doesNotMatch(CON, /iframe/);
  assert.doesNotMatch(PAGE, /params\.get\('master'\)|params\.get\('embed'\)/);
});

test('the League door mirrors programmeAuth before asking it', () => {
  const fn = PAGE.slice(PAGE.indexOf('function enterLeague('), PAGE.indexOf('var TABS ='));
  assert.match(fn, /role === 'admin' \|\| role === 'superadmin' \|\|\s*\(u\.pass && u\.pass\.base === 'league' && entry === 'admin'\)/);
  assert.match(fn, /PP\.enterMaster\(\)/);
  const srv = read('functions/programme.js');
  assert.match(srv, /base\.val\(\) === "league" && entry\.val\(\) === "admin"/, 'the server checks the same');
  assert.match(srv, /role !== "admin" && role !== "superadmin" && !leagueManage/);
});

test('only the League loads the console, and only once signed in', () => {
  assert.match(PAGE, /if \(session\.isAdmin\) startLeagueTabs\(\);/);
  assert.match(PAGE, /js\.src = '\/programme\/_console\.js\?v=1';/);
  assert.doesNotMatch(PAGE, /<script[^>]+_console\.js/, 'never a static script tag');
});

test('the tabs: Library, Removed files, Audit, Manage; the tab is in the address', () => {
  assert.match(PAGE, /<div class="tabs pp-tabs" id="ppTabs" hidden>/);
  assert.match(PAGE, /if \(t === 'library'\) q\.delete\('tab'\); else q\.set\('tab', t\);/);
  assert.match(CON, /window\.PPConsole = \{/);
});

test('an image or video preview fits the screen whole, never enlarged', () => {
  const img = CSS.slice(CSS.indexOf('.prev__img {'), CSS.indexOf('}', CSS.indexOf('.prev__img {')));
  assert.match(img, /max-width: 100%;/);
  assert.match(img, /max-height: calc\(100dvh - 280px\)/);
  assert.doesNotMatch(img, /(^|[^-])width: 100%|height: 100%/, 'max sizes only, so a small image stays its size');
  assert.match(CSS, /\.prev__video \{ max-width: 100%; max-height: calc\(100vh - 280px\); max-height: calc\(100dvh - 280px\);/);
});

/* A stored file record has no id field (the key is the id), so the name's
   click passes the key. Passing f.id previewed nothing (v1.31). */
test('tapping a file name previews it by its key', () => {
  const h = PAGE.slice(PAGE.indexOf("each('[data-view]'"), PAGE.indexOf("each('[data-view]'") + 500);
  assert.match(h, /var id = b\.getAttribute\('data-view'\);/);
  assert.match(h, /preview\(code, id\)/);
  assert.doesNotMatch(h, /preview\(code, f\.id\)/);
});

/* v1.33: signed in to NL Tools, the NL Tools bar comes first. The club's
   white code bar and the code card used to show while the account was read. */
test('signed in, nothing white flashes before the NL Tools bar', () => {
  assert.match(PAGE, /<body>\s*(<!--[\s\S]*?-->\s*)?<div id="nlTopbar"><\/div>/, 'the bar slot is outside the hidden library');
  const draw = PAGE.slice(PAGE.indexOf('function drawAccountBar('), PAGE.indexOf('function drawAccountBar(') + 700);
  assert.ok(draw.indexOf('bar.hidden = true') < draw.indexOf('NL.codeGate.accountBar('), 'the code bar hides before the read');
  const ent = PAGE.slice(PAGE.indexOf('function enter(session)'), PAGE.indexOf('function enter(session)') + 900);
  assert.match(ent, /drawAccountBar\(\)\.then\(function \(\) \{ el\('app'\)\.style\.display = 'block';/);
  assert.doesNotMatch(ent.slice(0, ent.indexOf('drawAccountBar')), /el\('app'\)\.style\.display = 'block'/, 'the library waits for the bar');
  const lg = PAGE.slice(PAGE.indexOf('function enterLeague('), PAGE.indexOf('function drawAccountBar('));
  assert.doesNotMatch(lg, /revealGate\(\)|gateSub/, 'the League never sees the code card');
  assert.match(lg, /drawAccountBar\(\);/);
});

/* v1.35: back closing the preview is the shared dialog's job (nl-utils
   v1.66, tests/modal-back.test.mjs); the page keeps no history code of its
   own, which would take two steps for one dialog. */
test('the preview leaves back to the shared dialog', () => {
  assert.doesNotMatch(PAGE, /pushState|popstate|ppPreview/);
});
