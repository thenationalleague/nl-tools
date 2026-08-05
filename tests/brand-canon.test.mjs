/* Brand canon tests — the rules in nl-brand.css that are invisible until they
   break in a browser, and that lint cannot see because lint checks wiring, not
   stylesheets. Run with `npm test` (node --test). Zero dependencies.

   Scope is deliberately narrow: contracts where a plausible, well-meant edit
   silently breaks rendering somewhere else. Layout and colour choices belong in
   the Style Guide and a human's eyes, not here. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const css = readFileSync(join(REPO, 'system/nl-brand.css'), 'utf8');

/* Everything after the opening block comment — the changelog at the top of the
   file talks about fill and stroke at length, and prose is not a rule. */
const rules = css.slice(css.indexOf('*/') + 2);

function ruleBody(selector) {
  const i = rules.indexOf('\n' + selector + ' {');
  assert.notEqual(i, -1, `${selector} is present in nl-brand.css`);
  return rules.slice(i, rules.indexOf('}', i));
}

test('.btn--icon exists and is square', () => {
  const body = ruleBody('.btn--icon');
  assert.match(body, /width:\s*30px/);
  assert.match(body, /height:\s*30px/);
  assert.match(body, /padding:\s*0/);
  assert.match(body, /justify-content:\s*center/);
});

/* The load-bearing one. The sprite carries stroked UI icons (fill:none,
   stroke:currentColor) and filled brand/match icons (fill:currentColor,
   stroke:none), each declared on the symbol. A wrapper that states either
   property flattens the other kind — a hand-rolled icon button that set
   stroke:none drew a completely invisible pencil on 05/08/2026. */
test('.btn--icon sets neither fill nor stroke, so both sprite families render', () => {
  const body = ruleBody('.btn--icon');
  assert.doesNotMatch(body, /(^|[;{\s])fill\s*:/, '.btn--icon must not set fill');
  assert.doesNotMatch(body, /(^|[;{\s])stroke\s*:/, '.btn--icon must not set stroke');
});

/* Same specificity (0,1,0), so source order decides. .btn--icon must come
   after .btn--sm or a combined .btn--sm.btn--icon gets text-button padding
   back and stops being square. */
test('.btn--icon is declared after .btn--sm', () => {
  assert.ok(
    rules.indexOf('\n.btn--icon {') > rules.indexOf('\n.btn--sm {'),
    '.btn--icon must follow .btn--sm in source order'
  );
});

/* .btn--icon carries no colours by design — it composes with these. If a
   colour variant is ever renamed, the composition promise breaks silently. */
test('.btn--icon composes with the existing colour variants', () => {
  for (const variant of ['.btn--primary', '.btn--navy', '.btn--ghost', '.btn--danger']) {
    assert.ok(rules.includes(variant), `${variant} still exists to compose with`);
  }
  const body = ruleBody('.btn--icon');
  assert.doesNotMatch(body, /(^|[;{\s])(background|color)\s*:/,
    '.btn--icon must not restate colours — that is the variant\'s job');
});
