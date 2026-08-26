/* The club banner's colours, and the clubs-meta fields behind them.

   The banner across the top of a club in the directory used to be the club's
   primary with their SECONDARY as the type, and it threw the club's own type
   away for white or near-black whenever that pair fell under 4.5:1 — twenty
   of the eighty-two. The guard was doing real work: Carlisle's blue on red is
   1.17:1.

   Tertiary is the field that actually holds a club's type colour. Nine clubs
   whose tertiary disagreed with their strip were corrected on 26/08/2026, and
   Scunthorpe's primary and secondary were inverted with them — they play in
   claret, and the record had the pale blue leading.

   With that done the banner needs no substitution at all: every member club
   clears 3:1 on its own primary and tertiary, which is the WCAG bar for large
   text, and .cd-banner__name is --text-xl at weight 900. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const JS = readFileSync(join(REPO, 'club-directory/_directory.js'), 'utf8');
const CSS = readFileSync(join(REPO, 'club-directory/_directory.css'), 'utf8');
const META = JSON.parse(readFileSync(join(REPO, 'assets/data/clubs-meta.json'), 'utf8'));
const members = META.clubs.filter((c) => c.division);

function lum(hex) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const c = [0, 2, 4].map((i) => {
    const v = parseInt(h.substr(i, 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => {
  const la = lum(a), lb = lum(b);
  if (la === null || lb === null) return 0;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/* ------------------------------------------------------------------ data */

test('every member club has three usable colours', () => {
  for (const c of members) {
    for (const f of ['primary', 'secondary', 'tertiary']) {
      assert.notEqual(lum((c.colors || {})[f]), null,
        `${c.name} has no usable ${f}`);
    }
  }
});

test('every club reads on its own primary and tertiary', () => {
  /* THE WHOLE REASON THE BANNER CAN STOP SUBSTITUTING. 3:1 is the bar for
     large text and the banner is large text; anything failing here would put
     a club's name somewhere between hard and impossible to read, and the fix
     is the club's record rather than a rule that overrules it. */
  const bad = members
    .map((c) => [c.name, contrast(c.colors.primary, c.colors.tertiary)])
    .filter(([, v]) => v < 3);
  assert.deepEqual(bad, [], 'these clubs would need their colours overruled');
});

test('the nine corrected clubs carry a white tertiary', () => {
  /* Named because each was checked against the strip, not derived. */
  for (const n of ['Aldershot Town', 'Braintree Town', 'Chorley', 'Hornchurch',
    'Kidderminster Harriers', 'Scunthorpe United', 'Walton & Hersham',
    'Worthing', 'Yeovil Town']) {
    const c = members.find((x) => x.name === n);
    assert.ok(c, `${n} is in the roster`);
    assert.equal(c.colors.tertiary.toUpperCase(), '#FFFFFF', `${n} types in white`);
  }
});

test('Scunthorpe lead with the claret', () => {
  /* The record had the pale blue as the primary, which made every consumer
     draw them as a pale blue club. */
  const c = members.find((x) => x.name === 'Scunthorpe United');
  assert.equal(c.colors.primary.toUpperCase(), '#8B2942');
  assert.equal(c.colors.secondary.toUpperCase(), '#759BB3');
});

/* ---------------------------------------------------------------- the rule */

test('the banner takes primary and tertiary, and substitutes neither', () => {
  const fn = JS.slice(JS.indexOf('function bannerColours('));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.match(body, /var bg = cols\.primary, fg = cols\.tertiary;/);
  /* The surviving fallback answers MISSING data. A contrast test here would
     be the old rule back, overruling a club whose two colours are merely
     bold. */
  assert.ok(!/contrast\(bg, fg\)/.test(body),
    'no contrast test decides whether to keep the club’s own colours');
  assert.match(body, /if \(lum\(fg\) === null\)/,
    'the fallback fires on unusable data only');
});

test('the banner name is large text, which is what makes 3:1 the bar', () => {
  /* If this shrinks, the 3:1 floor above stops being the right test and ten
     clubs drop under the small-text bar. */
  const rule = /\.cd-banner__name \{([^}]*)\}/.exec(CSS);
  assert.ok(rule, '.cd-banner__name exists');
  assert.match(rule[1], /font-size: var\(--text-xl\)/);
  assert.match(rule[1], /font-weight: 900/);
});
