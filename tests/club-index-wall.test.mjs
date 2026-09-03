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
const BRAND = readFileSync(join(REPO, 'system/nl-brand.css'), 'utf8');
const UTILS = readFileSync(join(REPO, 'system/nl-utils.js'), 'utf8');
const PROG = readFileSync(join(REPO, 'programme/index.html'), 'utf8');
const PROG_CSS = readFileSync(join(REPO, 'programme/_shared.css'), 'utf8');
const DIR = readFileSync(join(REPO, 'club-directory/_directory.js'), 'utf8');
/* Both files explain at length what they replaced; a guard that fires on its
   own rationale is a guard somebody switches off. */
const CODE = DIR.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const rule = (sel) =>
  new RegExp(sel.replace(/[.#]/g, (c) => '\\' + c) + ' \\{([^}]*)\\}').exec(PAGE);

/* ------------------------------------------------------- one of everything */

test('every tile is the same height, and so is every name block', () => {
  /* The original complaint, in two numbers. Without both, a two-line name
     grows its own tile and the row breaks. */
  assert.match(rule('.rd-tile__go')[1], /min-height: 146px/);
  assert.match(rule('.rd-tile__name')[1], /height: 46px/);
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

test('the club’s colours are the TRIM, not the tile', () => {
  /* It was the other way round: the whole name band painted in the club's
     primary with its tertiary as the type. That worked — all 72 clear 3:1
     that way — but 72 saturated blocks in one view is a wall of colour rather
     than a directory. Richard: "the colour blocks, can we sub in to be same
     as the programme pack".

     Programme Packs had solved it weeks earlier with two bands along the base
     of a white card, so this is that, promoted to canon rather than copied. */
  assert.match(CODE, /NL\.clubs\.bandsHtml\(n\)/, 'the wall asks canon for the trim');
  assert.ok(!/rd-tile__band/.test(PAGE), 'the full-colour band is gone');
  assert.ok(!/--tile-bg/.test(PAGE + CODE), 'and so are the properties that painted it');
});

test('the trim is canon, defined once, used by both tools', () => {
  /* Third use is what earned it: programme's .dir__card, programme's .own,
     and this. A fourth copy is the thing canon exists to stop. */
  assert.match(BRAND, /\.nl-club-bands \{/, 'the component is in nl-brand.css');
  assert.match(BRAND, /\.nl-club-bands i:first-child \{ height: 6px; \}/);
  assert.match(BRAND, /\.nl-club-bands--lg i:first-child \{ height: 8px; \}/);
  assert.match(UTILS, /bandsHtml: function\(club, opts\)/, 'the writer is in nl-utils');
  /* Programme stopped carrying its own. */
  assert.ok(!/\.dir__bands \{/.test(PROG_CSS), 'programme still defines its own bands');
  assert.match(PROG, /NL\.clubs\.bandsHtml\(c\)/, 'programme asks canon for them');
});

test('the hex is validated before it goes inline', () => {
  /* The data is ours, but a colour field is one bad edit away from being an
     attribute escape. Programme had this right and was the only caller that
     did; promoting the component brought the check with it. */
  assert.match(UTILS, /\/\^#\[0-9a-fA-F\]\{3,8\}\$\/\.test/);
  assert.match(UTILS, /hex\(c\.primary, 'var\(--navy\)'\)/, 'and falls back to a token');
});

test('the name is on white, so no club is bound by a contrast floor', () => {
  /* THE POINT OF THE CHANGE, not a side effect. With the name on the club's
     own primary, ten clubs sat under the small-text bar and the type had to
     be 14px bold to clear 3:1 as large text. On white that constraint is
     gone and no club's colours can ever need overruling to make its own name
     readable.

     The club BANNER inside an entry still uses primary + tertiary and still
     holds the 3:1 floor — one big word on a full-width panel is a different
     problem, and tests/club-banner-colours.test.mjs keeps it. */
  const name = rule('.rd-tile__name')[1];
  assert.match(name, /color: var\(--navy\)/);
  assert.ok(!/background/.test(name), 'the name block must not be painted');
});

test('a white-playing club still shows a trim', () => {
  /* Thirteen of them. Without the hairline the primary band vanishes into
     the card — which is why the rule lives on the canon component rather
     than being remembered per caller. */
  assert.match(BRAND, /\.nl-club-bands \{[^}]*border-top: 1px solid var\(--border\)/);
  /* And the old per-tile workaround is gone with the thing it worked around. */
  assert.ok(!/is-white/.test(PAGE + CODE), 'the white-ground special case is retired');
});

test('your club is a card like the others, wearing the heavier trim', () => {
  /* It was painted in its own colours, which was right when the wall was
     blocks of colour and made it the one loud card once the wall went quiet.
     Being the wrong SHAPE is what makes it findable; being the wrong colour
     never was. */
  const mine = rule('.rd-mine__go')[1];
  assert.match(mine, /background: var\(--white\)/);
  assert.match(mine, /position: relative/, 'the trim is absolute to it');
  assert.match(CODE, /bandsHtml\(own, \{ lg: true \}\)/);
});

/* -------------------------------------------------------------- the states */

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
