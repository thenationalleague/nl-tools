/* The two-page tools moved to one address (system/one-address-plan.md,
   14/11/2026): the club page and the staff page are one page, through the
   canon door (NL.codeGate.door). Each one added here is checked the same
   way. Financial Benchmarking has its own fuller file too. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const REG = JSON.parse(read('system/rtdb/tools-registry.snapshot.json'));
const TOOLS = [
  { dir: 'financial-benchmarking', key: 'ops-financial-benchmarking' },
  { dir: 'dazn', key: 'media-dazn' },
  { dir: 'save-of-the-month', key: 'media-save-of-the-month' },
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

for (const { dir, key } of TOOLS) {
  test(`${dir}: /admin/ forwards, keeping the query and hash, loading nothing`, () => {
    const stub = read(`${dir}/admin/index.html`);
    assert.match(stub, new RegExp(`location\\.replace\\('/${esc(dir)}/' \\+ \\(q \\? '\\?' \\+ q : ''\\) \\+ location\\.hash\\)`));
    assert.doesNotMatch(stub, /(src|href)="\/system\//);
  });

  test(`${dir}: the registry opens it at its one address`, () => {
    assert.equal(REG[key].url, `/${dir}/`);
  });

  test(`${dir}: one page through the canon door`, () => {
    const page = read(`${dir}/index.html`);
    assert.match(page, new RegExp(`NL\\.codeGate\\.door\\(\\{\\s*toolKey: '${esc(key)}'`));
    assert.doesNotMatch(page, /auth-guard\.js/, 'auth-guard would send a code holder to sign in');
    assert.doesNotMatch(page, /staffUrl/);
    assert.doesNotMatch(page, new RegExp(`href="/${esc(dir)}/admin/"`));
    assert.doesNotMatch(page, /_toolDeferredSession/);
    assert.match(page, /<header class="nl-idbar" hidden>/);
    assert.match(page, /showCode: function \(\) \{ document\.querySelector\('\.nl-idbar'\)\.hidden = false; \}/);
    assert.match(page, /\$\('pageWrap'\)\.style\.display = 'block';\s*window\.TOOL\.boot\(session\);/);
    assert.match(page, /<div id="pageWrap">/);
    assert.match(page, /window\.TOOL\.boot = function \(session\)/);
  });
}
