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
