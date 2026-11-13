/* Programme Packs console: the tab it opens on draws without a click.
   The default tab is Library (v1.10), and none of the data watchers redraw
   Library, so before v1.11 the console sat on its loading line until a tab
   was pressed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('../programme/admin/index.html', import.meta.url), 'utf8');
const boot = PAGE.slice(PAGE.indexOf('window.TOOL.boot = function'), PAGE.indexOf('if (window._toolDeferredSession)'));

test('the Library draws as soon as the session is in', () => {
  assert.match(boot, /ready = true;[\s\S]{0,200}if \(tab === 'library'\) render\(\);/);
});

test('whichever tab is open draws once the roster is in', () => {
  assert.match(boot, /clubs\.forEach\(function \(c\) \{ BY_CODE\[c\.code\] = c; \}\);\s*render\(\);/);
});

test('the Library is the library: no line above it, no second way to open it, one scroll', () => {
  assert.doesNotMatch(PAGE, /Open in its own tab/);
  assert.doesNotMatch(PAGE, /Everything here acts as the National League/);
  assert.match(PAGE, /html\.pp-lib-open, html\.pp-lib-open body \{ overflow: hidden; \}/);
  assert.match(PAGE, /window\.innerHeight - f\.getBoundingClientRect\(\)\.top/);
});
