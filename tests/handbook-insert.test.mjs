/* The handbook editor's insert boundary — where a new clause lands, and what
   number it will carry.

   Both are user-facing promises made BEFORE the change happens, which is what
   makes them worth pinning:

     · the gap says where the clause goes. Get it wrong and someone inserts
       into the wrong parent and finds out by reading the renumber preview,
       or later, or never.
     · the strip says "Add 1.1.4 here". A preview computed from a second guess
       at the numbering rules is a preview that eventually lies, and a lying
       preview is worse than none — it is trusted.

   Richard found the first one by using it: between two clauses at the SAME
   level, "after the one above" and "before the one below" were offered as if
   they were different choices. They are the same insertion.

   The functions are lifted out of the page source and evaluated here, so the
   shipped implementation is what runs — the same trick tests/programme.test.mjs
   and tests/club-code.test.mjs use on their halves. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const SRC = readFileSync(join(REPO, 'handbook/index.html'), 'utf8');

/* Pull a top-level `function name(...) { ... }` out by brace matching. */
function lift(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'handbook/index.html no longer defines ' + name);
  let depth = 0, j = SRC.indexOf('{', i);
  for (; j < SRC.length; j++) {
    if (SRC[j] === '{') depth++;
    else if (SRC[j] === '}' && --depth === 0) { j++; break; }
  }
  return SRC.slice(i, j);
}

const NAMES = ['childrenOf', 'alpha', 'roman', 'computeNumbers',
  'canonicalBoundary', 'newSpecAt', 'previewNumber'];

/* One scope, because they call each other — and a mutable S, because the page
   reads the live tree through it. */
function build(nodes) {
  const src = 'var S = { nodes: NODES };\n' + NAMES.map(lift).join('\n') +
    '\nreturn {' + NAMES.join(',') + ', S: S};';
  // eslint-disable-next-line no-new-func
  return new Function('NODES', src)(nodes);
}

/* 1
     1.1
     1.2
   2  */
const TREE = {
  a:  { id: 'a',  parentId: null, order: 0, kind: 'clause', numStyle: 'decimal', numberOverride: null },
  a1: { id: 'a1', parentId: 'a',  order: 0, kind: 'clause', numStyle: 'decimal', numberOverride: null },
  a2: { id: 'a2', parentId: 'a',  order: 1, kind: 'clause', numStyle: 'decimal', numberOverride: null },
  b:  { id: 'b',  parentId: null, order: 1, kind: 'clause', numStyle: 'decimal', numberOverride: null },
};

test('the tree numbers the way the editor says it does', () => {
  /* If this drifts, every expectation below is measuring the wrong thing. */
  const hb = build(TREE);
  const n = hb.computeNumbers(TREE);
  assert.deepEqual([n.a, n.a1, n.a2, n.b], ['1', '1.1', '1.2', '2']);
});

// --- one gap, one meaning ----------------------------------------------------

test('between two siblings, both hovers resolve to the SAME insertion', () => {
  /* The bug Richard found. Hovering the bottom of 1.1 and the top of 1.2 are
     two ways of pointing at one gap; they must not offer two choices. */
  const hb = build(TREE);
  const fromAbove = hb.canonicalBoundary('a1', 'after');
  const fromBelow = hb.canonicalBoundary('a2', 'before');
  assert.deepEqual(fromAbove, fromBelow);
  assert.deepEqual(fromAbove, { refId: 'a1', where: 'after' },
    'canonical form is "after the one above"');
});

test('"before" survives where it is genuinely a different insertion', () => {
  /* 1.1 is the FIRST child of 1. The boundary above it hosts two real
     insertions — one beside 1 (a new top-level clause) and one inside it (a
     new first sub-clause) — so both must stay on offer. */
  const hb = build(TREE);
  assert.deepEqual(hb.canonicalBoundary('a1', 'before'), { refId: 'a1', where: 'before' });
  assert.deepEqual(hb.canonicalBoundary('a', 'after'), { refId: 'a', where: 'after' });
  assert.notDeepEqual(hb.canonicalBoundary('a1', 'before'), hb.canonicalBoundary('a', 'after'));
});

test('the first top-level clause keeps its "before"', () => {
  const hb = build(TREE);
  assert.deepEqual(hb.canonicalBoundary('a', 'before'), { refId: 'a', where: 'before' });
});

test('canonicalBoundary is safe on a node that has gone', () => {
  /* The pointer can outlive a clause: hover a gap, another admin's change
     lands, render() runs. It must not throw on the way to hiding. */
  const hb = build(TREE);
  assert.deepEqual(hb.canonicalBoundary('nope', 'before'), { refId: 'nope', where: 'before' });
});

// --- the number it promises --------------------------------------------------

test('the preview names the number the new clause will actually take', () => {
  const hb = build(TREE);
  assert.equal(hb.previewNumber('a1', 'after'), '1.2', 'lands between 1.1 and 1.2');
  assert.equal(hb.previewNumber('a2', 'after'), '1.3', 'lands after the last sub-clause');
  assert.equal(hb.previewNumber('a1', 'before'), '1.1', 'lands first inside 1');
  assert.equal(hb.previewNumber('a', 'after'), '2', 'a new top-level clause after 1');
  assert.equal(hb.previewNumber('b', 'after'), '3', 'after the last top-level clause');
});

test('the preview agrees with the canonical target, not the raw hover', () => {
  /* The number on screen has to be the number for the insertion that will
     actually happen — the whole point of canonicalising before previewing. */
  const hb = build(TREE);
  const t = hb.canonicalBoundary('a2', 'before');
  assert.equal(hb.previewNumber(t.refId, t.where), hb.previewNumber('a1', 'after'));
});

test('the preview does not disturb the real tree', () => {
  /* It builds a shadow. If it ever mutated S.nodes, the document would gain a
     phantom clause from a mouse movement. */
  const hb = build(TREE);
  const before = JSON.stringify(TREE);
  hb.previewNumber('a1', 'after');
  assert.equal(JSON.stringify(TREE), before);
  assert.ok(!TREE.__preview__);
});

test('a bullet keeps its own kind rather than becoming a numbered clause', () => {
  const bullets = {
    p: { id: 'p', parentId: null, order: 0, kind: 'clause', numStyle: 'decimal', numberOverride: null },
    b1: { id: 'b1', parentId: 'p', order: 0, kind: 'bullet', numStyle: 'bullet', numberOverride: null },
  };
  const hb = build(bullets);
  const spec = hb.newSpecAt(bullets.b1, 'after');
  assert.equal(spec.kind, 'bullet');
  assert.equal(spec.numStyle, 'bullet');
  assert.equal(hb.previewNumber('b1', 'after'), '•');
});

test('the preview and the insert build the same clause', () => {
  /* newSpecAt is shared by both on purpose. If insertRelative ever stops using
     it, the number offered and the number given can part company silently. */
  const insert = lift('insertRelative');
  assert.match(insert, /newSpecAt\(t, where\)/,
    'insertRelative must build from newSpecAt, or the preview can lie');
  assert.match(insert, /n\.order = spec\.order/);
});
