/* The row actions on Club Codes are canon buttons, and they stay that way.

   This page has hand-rolled its own action control three separate times in
   one day — .cc-mini, then .cc-act, then .cc-more — each time immediately
   after the previous one was replaced with the canon component, and each
   time the same complaint came back: "they are also just written and not
   buttons. Surely button for action is in our canon?"

   It is: .btn + .btn--icon + a colour variant. A grep is cheap and the
   review that catches this by eye evidently is not. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const PAGE = readFileSync(join(REPO, 'club-codes/index.html'), 'utf8');
const SPRITE = readFileSync(join(REPO, 'assets/icons/sprites.svg'), 'utf8');
const BRAND = readFileSync(join(REPO, 'system/nl-brand.css'), 'utf8');

/* The prose above every rule explains what was replaced and why, so a grep
   over the raw file matches the sentence naming the dead class. Code only. */
const CODE = PAGE
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '');

test('the actions are built by one function, not written out per row', () => {
  assert.match(CODE, /function iconBtn\(/);
  assert.match(CODE, /class="btn btn--icon btn--/,
    'canon shape: .btn for the component, .btn--icon for the shape, a ' +
    'colour variant for the emphasis');
});

test('no row action is a hand-rolled control', () => {
  for (const dead of ['cc-mini', 'cc-act', 'cc-more']) {
    assert.ok(!new RegExp('\\.?' + dead + '\\b').test(CODE),
      `.${dead} is a private copy of .btn — three of these have been ` +
      'written and removed already');
  }
});

test('every icon button says what it is, twice', () => {
  /* There is no text node in the button, so without aria-label a screen
     reader announces "button" and nothing else; without title a mouse user
     gets no way at all to learn what the glyph means. */
  const calls = [...CODE.matchAll(/iconBtn\(([\s\S]*?)\n/g)];
  assert.ok(calls.length >= 4, 'every row action goes through iconBtn');
  const fn = CODE.slice(CODE.indexOf('function iconBtn'));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.match(body, /title="/);
  assert.match(body, /aria-label="/);
  assert.match(body, /esc\(label\)/,
    'the label carries a club or person name, so it is escaped like any ' +
    'other interpolation');
});

test('the glyphs it asks for are in the sprite', () => {
  /* A missing symbol renders an empty <svg>: a button that is there, is the
     right size, works when clicked, and shows nothing. */
  const names = new Set([...CODE.matchAll(/iconBtn\('([a-z-]+)'/g)].map((m) => m[1]));
  assert.ok(names.size >= 3, 'found the icon names');
  for (const n of names) {
    assert.ok(SPRITE.includes(`id="icon-${n}"`),
      `#icon-${n} is not in assets/icons/sprites.svg — the button would ` +
      'render as an empty box');
  }
});

test('the open state of Activity is a canon variant, not a page override', () => {
  /* An expanded disclosure has to look pressed. Doing that with a page rule
     on .btn is exactly the canon override lint refuses; swapping the colour
     variant says the same thing using the design system. */
  assert.match(CODE, /open \? 'navy' : 'ghost'/);
  assert.match(CODE, /aria-expanded="/, 'it is a disclosure, so it says so');
  assert.match(BRAND, /\.btn--navy \{/, 'the variant it swaps to exists');
});

test('danger stays on the one action that deletes', () => {
  const variants = [...CODE.matchAll(/iconBtn\('[a-z-]+', [^,]+, '(\w+)'/g)].map((m) => m[1]);
  assert.equal(variants.filter((v) => v === 'danger').length, 1,
    'Remove deletes a person; Reset re-issues and the holder carries on. ' +
    'Two red buttons side by side for those is two buttons you cannot tell ' +
    'apart');
});

test('the club and its people use the same action columns, in the same order', () => {
  /* Separate grids, so only identical named areas make them line up — the
     original complaint was Reset sitting at two different x positions
     depending on whose row it was. */
  assert.match(PAGE, /grid-template-areas: "crest name code act1 act2 act3"/);
  assert.match(PAGE, /grid-template-areas: "\. name code act1 act2 act3"/);
  const cols = /\.cc-row, \.cc-user \{[\s\S]*?grid-template-columns: ([^;]+);/.exec(PAGE);
  assert.ok(cols, 'the shared column definition is still shared');
  assert.match(cols[1], /32px 32px 32px/,
    'three fixed action tracks; `auto` sizes each grid to its own content ' +
    'and nothing agrees with anything');
});

test('the phone layout puts the crest against the name', () => {
  /* Column one was widened to 104px so the code chip had room on line two,
     which left a 74px hole between a 30px crest and the club name. */
  const mob = PAGE.slice(PAGE.lastIndexOf('@media (max-width: 640px)'));
  assert.match(mob, /grid-template-columns: 30px minmax\(0, 1fr\)/,
    'the crest column is crest-sized');
  assert.match(mob, /"code  code act1 act2 act3"/,
    'the code spans the first two columns instead of widening the first');
});

test('the divider bounds a club, not a row', () => {
  /* On .cc-row the hairline fell between a club and its own people. */
  assert.match(PAGE, /\.cc-club \{ border-bottom/);
  assert.ok(!/\.cc-row \{[^}]*border-bottom/.test(PAGE));
  assert.match(CODE, /'<div class="cc-club">'/);
});
