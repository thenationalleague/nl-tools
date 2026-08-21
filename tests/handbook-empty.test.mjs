/* Which clauses the editor is allowed to erase.

   Richard: "what happens to clauses left empty? In my mind they're simply
   erased on exit if empty."

   Agreed, and the sweep is easy. The dangerous half is the definition of
   "empty", because this runs unattended on a 1,203-node legal document and
   the person who finds a mistake finds it much later, in a published PDF.
   Every assertion below is a clause the sweep must NOT take:

     · a parent whose own line is blank. Real shape in a legal text — "6.4"
       with nothing on it and 6.4.1–6.4.9 underneath. Its children ARE its
       content, and taking the parent takes all of them.
     · a table clause. Its content is not in `body`, so the naive text test
       calls it empty.
     · a heading with no text under it yet.
     · an ARTICLE. An empty section is one someone has just made and is about
       to fill, and deleting it takes its place in the numbering with it.

   The function is lifted out of the page and evaluated here, so what is
   tested is what ships — the same trick tests/handbook-insert.test.mjs uses. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const SRC = readFileSync(join(REPO, 'handbook/index.html'), 'utf8');

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

// eslint-disable-next-line no-new-func
const isEmptyClause = new Function(lift('isEmptyClause') + '\nreturn isEmptyClause;')();

const clause = (o) => Object.assign(
  { parentId: 'a', order: 0, kind: 'clause', numStyle: 'decimal', title: '', body: '' }, o);

test('a clause with nothing at all in it is empty', () => {
  assert.equal(isEmptyClause(clause({}), false), true);
});

test('markup with no words in it is still empty', () => {
  /* contenteditable leaves this behind constantly — click in, click out. */
  for (const body of ['<p></p>', '<p><br></p>', '<br>', '   ', '<p>&nbsp;</p>'.replace('&nbsp;', ' ')]) {
    assert.equal(isEmptyClause(clause({ body }), false), true, JSON.stringify(body));
  }
});

test('a single character saves it', () => {
  assert.equal(isEmptyClause(clause({ body: '<p>a</p>' }), false), false);
});

test('a parent with no text of its own is NOT empty', () => {
  /* The one that would do real damage: its sub-clauses are its content. */
  assert.equal(isEmptyClause(clause({}), true), false);
});

test('a heading with no text under it yet is NOT empty', () => {
  assert.equal(isEmptyClause(clause({ title: 'Registration' }), false), false);
});

test('a table clause is NOT empty', () => {
  /* Its content lives in `table`, so a body-only test calls it blank. */
  assert.equal(isEmptyClause(clause({ kind: 'table' }), false), false);
  assert.equal(isEmptyClause(clause({ table: { header: ['a'], rows: [] } }), false), false);
});

test('an article is never swept, however blank', () => {
  assert.equal(isEmptyClause(clause({ parentId: null }), false), false);
});

test('a missing node is not empty', () => {
  assert.equal(isEmptyClause(null, false), false);
  assert.equal(isEmptyClause(undefined, false), false);
});

test('a clause added and never typed in goes as soon as focus leaves it', () => {
  /* Richard: "if I added a clause and then didn't type anything and I click
     away, I want it simply removed, as though I never clicked. Otherwise I'm
     accidentally setting up loads of blank clauses."

     Four things hold this together and each one is a silent failure:

       · the flag is cleared by `input`, NOT by the save. Text is written on
         BLUR, so at the moment focus leaves, S.nodes still holds the empty
         body — checking against it would delete what had just been typed.
       · the id is captured at focusout and passed in. A tick later the insert
         strip may have added another clause and moved the flag onto it, and
         the sweep would take the new one instead.
       · focus landing on the action bar is not clicking away. A bar press
         blurs the clause it is about to act on.
       · the flag is set in commitAdd, the one place every add goes through. */
  const wire = SRC.slice(SRC.indexOf('function wire()'));

  assert.match(lift('commitAdd'), /S\.virgin = newId \|\| null/,
    'set at the single choke point, or the next add to be written skips it');

  assert.match(wire, /addEventListener\('input'[\s\S]{0,300}S\.virgin = null/,
    'a keystroke must clear the flag — the save is too late');

  assert.match(wire, /addEventListener\('focusout'[\s\S]{0,240}sweepVirgin\(id,/,
    'the id must be captured at focusout, not read off S.virgin a tick later');

  const sweep = lift('sweepVirgin');
  assert.match(sweep, /function sweepVirgin\(id, now\)/,
    'sweepVirgin takes the id it was asked about');
  assert.match(sweep, /closest\('#ceActs'\)/,
    'focus moving to the action bar is not clicking away');
  assert.match(sweep, /isEmptyClause\(/,
    'it must use the same definition of empty as the sweep on exit, not a ' +
    'second, looser one');
  assert.match(sweep, /commit\(c, /,
    'through commit(), so it is undoable like everything else');
});

test('the sweep runs on leaving edit mode, behind the pending save', () => {
  /* Two things that are invisible until they go wrong.

     Blur is what saves the clause you are typing in, and it fires on the way
     out. Sweep before that lands and the sweep clones a stale tree — erasing
     the words that were being written. Same trap the insert strip fell into.

     And it must go through commit(), which is the single write path and the
     only thing that pushes an undo snapshot. Writing direct would work, and
     would leave the deletion with no way back. */
  const leave = lift('leaveEdit');
  assert.match(leave, /afterPendingSave\(/,
    'leaveEdit must wait for the outgoing blur to save before sweeping');
  assert.match(leave, /pruneEmptyClauses\(\)/);

  const prune = lift('pruneEmptyClauses');
  assert.match(prune, /commit\(c, 'Removed /,
    'the sweep must go through commit(), or it cannot be undone');
  assert.match(prune, /NL\.toast/,
    'it must say how many it took — silent deletion in a legal document is ' +
    'worse than the clutter it removes');
});
