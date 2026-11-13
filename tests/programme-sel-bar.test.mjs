/* Programme Packs: the selection bar sticks flush under whatever sits above
   it. A fixed 74px (the identity bar's height on a desktop) left a strip of
   the page showing above the bar inside the console, where the identity bar
   is hidden, and would overlap a wrapped identity bar on a phone. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../programme/_shared.css', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../programme/index.html', import.meta.url), 'utf8');

test('the selection bar sticks at --sel-top, not a fixed height', () => {
  assert.match(CSS, /\.sel-bar \{[^}]*position: sticky; top: var\(--sel-top, 74px\);/);
});

test('the library page measures the identity bar, and 0 when it is hidden', () => {
  assert.match(PAGE, /var h = bar && bar\.style\.display !== 'none' \? bar\.getBoundingClientRect\(\)\.height : 0;/);
  assert.match(PAGE, /if \(EMBED\) document\.querySelector\('\.nl-idbar'\)\.style\.display = 'none';\s*fitSelTop\(\);/);
});
