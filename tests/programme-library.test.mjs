/* Programme Packs: the file library layout (style principles 14).
   One answer to "where am I, and where will this go": the path, the folder
   as the heading, one bar that is the folder's actions or the selection's,
   one list of folders then files. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../programme/_shared.css', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../programme/index.html', import.meta.url), 'utf8');
const SPRITE = readFileSync(new URL('../assets/icons/sprites.svg', import.meta.url), 'utf8');
const club = PAGE.slice(PAGE.indexOf('function renderClub'), PAGE.indexOf('function canPreview'));

test('14.1 the path to here, then the folder as the heading', () => {
  assert.match(club, /<nav class="lib__path" aria-label="Where you are">/);
  assert.match(club, /data-go="dir">All clubs<\/button>/);
  assert.match(club, /<h2 class="lib__title">' \+ esc\(hereName\)/);
});

test('nothing sits above where you are: the League card heads the directory only', () => {
  assert.match(PAGE, /if \(view\.club\) \{ el\('nlPanel'\)\.innerHTML = ''; renderClub\(view\.club\); \}/);
});

test('14.3 one bar: Upload and New folder, with their icons', () => {
  assert.match(club, /id="uploadBtn">' \+ iconHtml\('upload'\) \+ 'Upload<\/button>/);
  assert.match(club, /id="addFolder">' \+ iconHtml\('folder-add'\) \+ 'New folder<\/button>/);
});

test('14.4 ticking anything turns the same bar into the selection bar', () => {
  const sel = club.slice(club.indexOf('if (n) {'), club.indexOf('} else if (writable) {'));
  assert.match(sel, /<div class="lib__bar is-sel">/);
  assert.match(sel, /id="selClear" aria-label="Clear selection"/);
  assert.match(sel, /' \+ n \+ ' selected<\/span>'/);
  assert.match(sel, /id="selZip"/);
  assert.match(sel, /writable \? '<button class="btn btn--ghost btn--sm" id="selMove">/);
  assert.match(sel, /writable && picked\.length \? '<button class="btn btn--danger btn--sm" id="selRemove">/);
  assert.doesNotMatch(club, / disabled/, 'no greyed-out buttons waiting for a selection');
});

test('the bar sticks flush under whatever is above it', () => {
  assert.match(CSS, /\.lib__bar \{[^}]*position: sticky; top: var\(--sel-top, 74px\);/);
});

test('14.5 folders then files; a file name previews, every row has its ⋯', () => {
  assert.ok(club.indexOf('subs.map(function (f) { return folderRow(') < club.indexOf('files.map(function (f) { return fileRow('));
  assert.match(PAGE, /data-view="' \+ esc\(f\.id\) \+ '"/);
  assert.match(PAGE, /if \(canPreview\(f\)\) preview\(code, id\); else downloadFile\(code, f\);/);
  assert.match(PAGE, /data-filemenu="/);
  assert.match(PAGE, /data-menu="/);
});

test('14.6 a drop names where the files will land', () => {
  assert.match(club, /data-drop-label="Drop to upload to ' \+ esc\(hereName\)/);
  assert.match(CSS, /\.lib__body\.is-over::after \{ content: attr\(data-drop-label\);/);
  assert.match(PAGE, /root\.querySelector\('\.lib__body'\)/);
});

test('14.7 the drop box shows only in an empty folder', () => {
  assert.match(club, /\} else if \(writable\) \{\s*\/\* 14\.7[^*]*\*\/\s*html \+= '<div class="drop"/);
  assert.doesNotMatch(PAGE, /nothing confidential/);
});

test('the old layout is gone, styles and all', () => {
  for (const c of ['pack', 'tile', 'fold', 'crumb', 'folder', 'sel-bar']) {
    assert.doesNotMatch(CSS, new RegExp(`^\\.${c}(__[\\w-]+)? \\{`, 'm'), `.${c} rules removed`);
  }
  assert.doesNotMatch(PAGE, /function fileTile\(/);
});

test('the sprite carries the library icons, stroked like the UI set', () => {
  for (const n of ['folder', 'folder-add', 'file', 'more', 'move']) {
    const m = new RegExp(`<symbol id="icon-${n}"[\\s\\S]*?</symbol>`).exec(SPRITE);
    assert.ok(m, `#icon-${n} is in the sprite`);
    assert.ok(m[0].includes('stroke="currentColor"') && m[0].includes('fill="none"'), `${n} is stroked`);
  }
});

test('the selection bar measures whichever top bar shows', () => {
  /* The code bar when it shows; otherwise the NL Tools bar, which is
     sticky too (v1.32). */
  assert.match(PAGE, /var top = bar && !bar\.hidden && bar\.style\.display !== 'none' \? bar : el\('nlTopbar'\);/);
  assert.match(PAGE, /var h = top \? top\.getBoundingClientRect\(\)\.height : 0;/);
});
