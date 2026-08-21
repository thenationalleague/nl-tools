/* The handbook editor's structural view — guide lines, folding, the
   breadcrumb and the level chip.

   All four answer one complaint: the editor gives you the VERBS for
   restructuring — indent, outdent, move, add sub — and almost none of the
   ORIENTATION. You can perform a structural change; you cannot see the
   structure you are changing.

   The hanging rule is why. It pulls every decimal sub-clause back out to its
   parent's gutter, so 6, 6.1 and 6.1.2 all start at the same left edge and a
   rulebook reads as text rather than as a staircase. That is right for
   reading and it means depth is carried entirely by the number — so a clause
   numbered (a) or (i), or not numbered at all, has no depth cue at all.
   Richard: "it's not clear where we stop indentation."

   So the editor gets a tree and the reader keeps its column. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const PAGE = readFileSync(join(REPO, 'handbook/index.html'), 'utf8');
const CSS = readFileSync(join(REPO, 'system/nl-brand.css'), 'utf8');
/* Both files explain at length what they replaced, and a guard that fires on
   its own rationale is a guard somebody switches off. */
const CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
const RULES = CSS.slice(CSS.indexOf('*/') + 2);

/* ------------------------------------------------------------ guide lines */

test('editing suspends the hanging rule, reading keeps it', () => {
  /* Both halves matter. Without the first the tree has no indentation to
     draw a line beside; without the second the published handbook becomes a
     staircase. */
  assert.match(RULES, /\.nl-clause:not\(\.nl-clause--nonum\):not\(\.nl-clause--bullet\)\s*\n?\s*> \.nl-clause__body > \.nl-clause\[data-num="decimal"\] \{ margin-left: -58px; \}/,
    'reading still hangs');
  assert.match(RULES, /\.nl-doc\.is-editing[\s\S]{0,200}margin-left: 0;/,
    'editing does not');
});

test('the guide uses ::after, because ::before is the selection bar', () => {
  /* One element, one of each. The selection marker got there first. */
  assert.match(RULES, /\.nl-doc\.is-editing \.nl-clause__body > \.nl-clause::after/);
  assert.match(RULES, /\.nl-clause\.is-sel::before/, 'the selection bar still owns ::before');
});

test('the guide bridges the gap between siblings', () => {
  /* .nl-clause carries margin: 9px 0. A segment that stopped at its own box
     would draw the guide as a dashed ladder rather than one line. */
  const rule = /\.nl-doc\.is-editing \.nl-clause__body > \.nl-clause::after \{([^}]*)\}/.exec(RULES);
  assert.ok(rule, 'the guide rule exists');
  assert.match(rule[1], /top:\s*-\d/, 'reaches above its own box');
  assert.match(rule[1], /bottom:\s*-\d/, 'and below it');
  assert.match(rule[1], /pointer-events:\s*none/,
    'it sits over a contenteditable document and must not swallow a click');
});

test('the selected clause lights its line of descent', () => {
  assert.match(RULES, /\.nl-clause\.is-branch > \.nl-clause__body > \.nl-clause::after/);
  assert.match(CODE, /BRANCH = \{\};/);
  assert.match(CODE, /ancestryOf\(S\.selectedId\)/);
});

test('the lit branch moves with the selection, not with the render', () => {
  /* paintSelection exists precisely to avoid a re-render on every click, so
     is-branch — which render writes — would otherwise stay lit on whichever
     clause happened to be selected when the document was last rebuilt. */
  const fn = CODE.slice(CODE.indexOf('function paintSelection('));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.match(body, /querySelectorAll\('\.is-branch'\)/, 'clears the old branch');
  assert.match(body, /classList\.add\('is-branch'\)/, 'and lights the new one');
});

test('the selection bar is as tall as the clause, not its subtree', () => {
  /* Sub-clauses render inside their parent's body, so a bar anchored
     top-to-bottom ran from the selected clause down past its last
     descendant — the same shape of mistake the number tint made in v2.57. */
  assert.match(RULES, /\.nl-doc\.is-editing \.nl-clause\.is-sel::before \{ bottom: auto; height:/);
});

/* ---------------------------------------------------------------- folding */

test('folding hides children without touching the document', () => {
  assert.match(RULES, /\.nl-clause\.is-folded > \.nl-clause__body > \.nl-clause[\s\S]{0,120}display: none/);
  assert.match(CODE, /S\.collapsed\[fid\]/, 'a twisty toggles page state');
  /* Nothing about the tree changes — this is a way of looking. */
  const fn = CODE.slice(CODE.indexOf("var tw = e.target.closest('[data-fold-id]')"));
  assert.ok(!/commit\(/.test(fn.slice(0, 500)), 'folding never writes');
});

test('a fold says how much it is hiding', () => {
  assert.match(CODE, /function foldNote/);
  assert.match(CODE, /clauses folded/);
  assert.match(CODE, /subtreeCount\(node\.id\)/,
    'the whole subtree, not just the direct children');
});

test('the twisty is not editable text', () => {
  /* The document is contenteditable. Without this the button becomes content
     you can type into and backspace away. */
  const fn = CODE.slice(CODE.indexOf('function foldBtn('));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.match(body, /contenteditable="false"/);
  assert.match(body, /tabindex="-1"/,
    'or tabbing through the document stops at every clause');
  assert.match(body, /aria-expanded="/);
});

test('folding is an editing affordance only', () => {
  /* A reader who cannot see a clause cannot be bound by it. */
  assert.match(CODE, /var folded = editing && !!S\.collapsed\[node\.id\] && kids\.length > 0;/);
  assert.match(CODE, /fold\.hidden = !\(S\.mode === 'edit'/);
});

test('folds are cleared when the area changes', () => {
  /* They are ids from the area being left. A stale entry would fold whatever
     happened to share a key in the next one. */
  assert.match(CODE, /S\.mode = 'read'; S\.lock = null; S\.collapsed = \{\};/);
});

test('folding to a level is offered, not just one twisty at a time', () => {
  /* The point of folding a 560-clause area is to see its shape, and doing
     that a clause at a time is not seeing it. */
  assert.match(CODE, /function foldToLevel/);
  assert.match(PAGE, /data-fold-level="1"/);
  assert.match(PAGE, /data-fold-level="0"/, 'and a way back to everything open');
});

/* ------------------------------------------------------------- breadcrumb */

test('the breadcrumb follows the selection while editing', () => {
  /* It followed the SCROLL, which is a different question: the tool telling
     you where your eyes were when you had asked where your caret was. */
  assert.match(CODE, /if \(S\.mode === 'edit' && canEdit\(\) && S\.selectedId/);
  assert.match(CODE, /ancestryOf\(S\.selectedId\)\.concat\(\[S\.selectedId\]\)/);
});

test('reading keeps the scroll-spy', () => {
  /* There is no selection to report, and "which section am I looking at" is
     exactly right for a document you are moving through. */
  assert.match(CODE, /if \(spyLock\)/);
  assert.match(CODE, /currentSectionEl\(\)/);
});

test('the crumb is a route back up, not a label', () => {
  assert.match(CODE, /data-crumb="/);
  assert.match(CODE, /scrollToNode\(id\)/);
  /* A clause folded away cannot be scrolled to. */
  assert.match(CODE, /ancestryOf\(id\)\.forEach\(function \(a\) \{ delete S\.collapsed\[a\]; \}\)/);
  assert.match(RULES, /button\.nl-crumb__sec \{/, 'the button form is canon');
});

/* ------------------------------------------- level, and arrows that refuse */

test('the toolbar says how deep the clause is', () => {
  /* The number answers this for 6.1.2 and not at all for (a), a bullet or an
     unnumbered heading — which is most of what is hard to place. */
  assert.match(PAGE, /id="ceActsLevel"/);
  assert.match(CODE, /'Level ' \+ \(depthOf\(n\) \+ 1\)/);
});

test('the directional arrows grey out rather than refusing after the press', () => {
  /* All four could already refuse — "Nothing above to nest under", "Already
     at the top level" — but only once you had pressed them. */
  const fn = CODE.slice(CODE.indexOf('function syncActionBar('));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.match(body, /indent:\s+i > 0/);
  assert.match(body, /outdent: n\.parentId != null/);
  assert.match(body, /down:\s+i > -1 && i < sibs\.length - 1/);
  assert.match(body, /b\.disabled = !can\[op\]/);
});

/* ------------------------------------------------------------- the phone  */

test('the gutters shrink on a phone', () => {
  /* 46px and 58px are sized for a desktop; four levels deep on a 390px
     screen was giving a clause about four words to a line. */
  const mob = RULES.slice(RULES.lastIndexOf('@media (max-width: 620px)'));
  assert.match(mob, /\.nl-art__num, \.nl-clause__num \{ min-width: 30px; \}/);
  assert.match(mob, /margin-left: -38px/, 'the hanging offset follows the gutter');
});

/* ------------------------------------------------- the restore point offer

   Reported: "I am getting restore option on loop. Don't know what it is
   supposed to do and can't see why I'd be repeatedly offered it."

   Both halves were true. The first cut offered the most recent restore point
   whenever the review was opened — no expiry, no dismissal, no test of
   whether it still meant anything — so one discard pinned an amber bar to
   the top of that screen for the life of the tool. And the button said
   "Restore them" without saying that restoring replaces the whole draft, in
   every area, with how it stood before the discard.

   A restore point is an UNDO, not an archive. The points are still kept and
   still restorable; what is bounded is how long one nags. */

test('a restore point stops being offered once it is stale', () => {
  /* Regret about a discard arrives in minutes or hours. After that it is not
     an undo any more. */
  assert.match(CODE, /SNAP_OFFER_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(CODE, /Date\.now\(\) - top\.at > SNAP_OFFER_MS\) return null/);
});

test('publishing settles it', () => {
  /* The discarded changes are then definitively not in the handbook, and
     putting them back into a draft that has since gone out is a new decision
     rather than a correction. */
  assert.match(CODE, /PUB\.publishedAt && PUB\.publishedAt > top\.at\) return null/);
});

test('dismissed once is dismissed, per restore point', () => {
  assert.match(CODE, /function snapDismissed/);
  assert.match(CODE, /snapDismissed\(top\.id\)\) return null/);
  assert.match(CODE, /localStorage\.setItem\(SNAP_SEEN_KEY, id\)/);
  /* Per snapshot id, so the NEXT discard offers itself normally. */
  assert.match(CODE, /localStorage\.getItem\(SNAP_SEEN_KEY\) === id/);
});

test('localStorage being unavailable does not take the review down', () => {
  /* A private window throws on access, and this runs while rendering the
     screen somebody opened to decide whether to publish. */
  const fn = CODE.slice(CODE.indexOf('function snapDismissed('));
  assert.match(fn.slice(0, 400), /catch \(e\) \{ return false; \}/);
});

test('the offer says what putting them back would do', () => {
  /* "Restore them" is two words for replacing every clause in five areas. */
  assert.match(CODE, /replaces the whole draft/);
  assert.match(CODE, /anything edited since would go/);
  assert.match(CODE, /hb-rev__dismiss/, 'and it can be sent away');
});
