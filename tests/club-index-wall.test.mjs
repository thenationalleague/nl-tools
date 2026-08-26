/* The Club Directory index — the wall of 72 crests.

   It was 72 identical bordered boxes with the badge at 28px beside the name.
   Richard: "looks shit. all diff sizes etc." — and the sizes were literally
   different, because nothing set a row height and any club whose name ran to
   two lines made its own tile taller than the ones beside it.

   The rules that stop that recurring are all measurable, so they are measured
   here rather than described. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

/* THE WALL MOVED on 26/08/2026, on its second use: club-directory/public
   draws the same one, so it lives in _directory.css and _directory.js and
   both pages ask for it. These rules were written against the reader's inline
   copy and now guard the shared one — which is the point of moving it. */
const PAGE = readFileSync(join(REPO, 'club-directory/_directory.css'), 'utf8');
const DIR = readFileSync(join(REPO, 'club-directory/_directory.js'), 'utf8');
/* Both files explain at length what they replaced; a guard that fires on its
   own rationale is a guard somebody switches off. */
const CODE = DIR.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const rule = (sel) =>
  new RegExp(sel.replace(/[.#]/g, (c) => '\\' + c) + ' \\{([^}]*)\\}').exec(PAGE);

/* ------------------------------------------------------- one of everything */

test('every tile is the same height, and so is every band', () => {
  /* The original complaint, in two numbers. Without both, a two-line name
     grows its own tile and the row breaks. */
  assert.match(rule('.rd-tile__go')[1], /min-height: 140px/);
  assert.match(rule('.rd-tile__band')[1], /height: 50px/);
});

test('the crest is a fixed square in both directions', () => {
  /* Canon .nl-crest sets width AND height from --crest-size with object-fit,
     which is the brand rule quoted at that rule in nl-brand.css: "within a
     square shape so that the area of the crest is identical each time".
     Contained by max-width alone, a tall shield comes out narrow and a wide
     one short, and no two badges occupy the same area. */
  assert.match(rule('.rd-tile__crest')[1], /--crest-size: 56px/);
  assert.match(CODE, /className: 'nl-crest rd-tile__crest'/);
});

test('the columns all divide 24, and stop at six', () => {
  /* Every division has 24 clubs, so a count that divides 24 fills its last
     row. Five is the one count in range that never comes out even.

     AND SIX IS THE CEILING. Eight also divides 24, and eight was tried: it
     gave each tile about 165px on a 1440 screen, which is not enough for a
     club name at a size anyone can read. Hampton & Richmond Borough and
     Hemel Hempstead Town both ran to three lines and were clipped by the
     fixed band. Richard: "these are 8 abreast. surely way too small." */
  const counts = [...PAGE.matchAll(/\.rd-grid \{[^}]*repeat\((\d+), minmax/g)]
    .map((m) => +m[1])
    .concat([...PAGE.matchAll(/\.rd-grid \{ grid-template-columns: repeat\((\d+),/g)].map((m) => +m[1]));
  assert.ok(counts.length >= 4, 'a count at each width');
  for (const c of counts) assert.equal(24 % c, 0, `${c} columns leaves an orphan row`);
  assert.ok(!counts.includes(5), 'five is the one to avoid');
  assert.equal(Math.max.apply(null, counts), 6,
    'six across is the widest a club name survives at 14px');
});

/* ------------------------------------------------------------- the colours */

test('the band is the club’s own two colours, from one shared function', () => {
  /* Two copies of the colour rule is how a club comes out readable on the
     wall and 1.17:1 on the entry the wall opens. */
  assert.match(DIR, /clubColours: bannerColours,/, 'the banner exports its pair');
  /* renderIndex calls bannerColours directly now — it lives in the same file,
     so there is no NLDirectory to go through and nothing to drift from. */
  assert.match(CODE, /function tileStyle\(name\) \{\s*var pal = bannerColours\(name\);/);
  assert.match(CODE, /--tile-bg:/);
  assert.match(CODE, /--tile-fg:/);
});

test('the band is 14px bold, which is what makes 3:1 the bar', () => {
  /* LOAD-BEARING. At 14px and bold this is large text, where the contrast bar
     is 3:1 — and every one of the 72 clears 3:1 on its own primary and
     tertiary. Smaller and ten clubs fall under the small-text bar and would
     need their colours overruled, which is the thing the whole design is
     avoiding. tests/club-banner-colours.test.mjs holds the 3:1 floor. */
  const band = rule('.rd-tile__band')[1];
  assert.match(band, /font-size: var\(--text-sm\)/);
  assert.match(band, /font-weight: 700/);
});

test('clubs who play in white keep their white', () => {
  /* A white band on a white tile is a LAYOUT problem, and the layout fixes
     it. Overruling the palette instead made Marine a black club. */
  assert.match(PAGE, /\.rd-tile\.is-white \.rd-tile__band \{[^}]*box-shadow: inset/);
  assert.match(CODE, /function isWhiteGround/);
  /* Is it WHITE, not is it light: Harrogate's #FFF700 is lighter than most of
     the palette and yellow is what Harrogate are. */
  assert.match(CODE, /lo > 218 && \(hi - lo\) < 26/);
});

/* -------------------------------------------------------------- the states */

test('your club wears its own colours too', () => {
  /* It was --primary-50: the one card on the page in another club's red. */
  const mine = rule('.rd-mine__go')[1];
  assert.match(mine, /background: var\(--tile-bg/);
  assert.match(mine, /color: var\(--tile-fg/);
  assert.match(CODE, /class="rd-mine__go"' \+ tileStyle\(own\)/);
});

test('not-yet-signed-off fades, and does not desaturate', () => {
  /* Greyscaling made Buxton — deep blue and white — look like a club that
     plays in grey: a statement about their colours, from a rule about their
     paperwork. */
  assert.match(PAGE, /\.rd-tile\.is-pending \.rd-tile__go \{[^}]*opacity: \.42/);
  assert.ok(!/grayscale/.test(PAGE), 'nothing on this page desaturates a club');
  /* And the state is a title, not a third line — that line is what made the
     rows uneven. */
  assert.match(CODE, /title="Not yet checked"/);
  assert.ok(!/rd-tile__note/.test(CODE), 'the third line is gone');
});
