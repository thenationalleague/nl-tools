/* Line breaks typed into the handbook, and where they used to go.

   Reported by a colleague of Richard's, editing the referee fee tariff. The
   report called them carriage returns; quoted as sent, but the thing Enter
   inserts is a LINE BREAK, and that is the word used everywhere below.

   "Is there also a way to get carriage returns saved — I keep trying it in
   the fee tariff (referee fees, 14.7) but any time I go out of edit it takes
   the carriage returns away."

   TWO separate causes, in two separate code paths, both of which delete a
   line break and neither of which reports anything:

     · TABLE CELLS were read back with `cell.textContent`. textContent drops a
       <br> entirely — it does not even leave a space — so the lines someone
       typed were concatenated into one on save. This is the one that bit him:
       a fee tariff is a table.

     · CLAUSE BODIES ran through sanitize(), whose allow-list has no `div`.
       Chrome wraps each new line in a <div> when Enter is pressed in a
       contenteditable holding bare text, and clean() UNWRAPPED those — two
       lines silently becoming one. sanitize() did carry a <div> -> <p>
       replacement, but on the serialised string at the very end, by which
       point every div had already been removed. Dead code sitting on top of
       the bug it was meant to prevent, which is how it survived unnoticed.

   cellText and sanitize both need a DOM, which these tests do not have, so
   what is pinned here is the pure half plus the mechanism of the other half.
   That is deliberate rather than lazy: both failures are failures of WHICH
   FUNCTION IS CALLED, and that is exactly what source inspection can see. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, NL } from './load-canon.mjs';

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

/* esc IS NL.escHtml on the page, so the canon helper is the real one. */
// eslint-disable-next-line no-new-func
const cellHtml = new Function('esc', lift('cellHtml') + '\nreturn cellHtml;')(NL.escHtml);

test('a newline in a cell is drawn as a line break', () => {
  assert.equal(cellHtml('Step 1\nStep 2'), 'Step 1<br>Step 2');
});

test('several lines all survive', () => {
  assert.equal(cellHtml('a\nb\nc'), 'a<br>b<br>c');
});

test('a cell is still escaped — the break is the ONLY markup allowed out', () => {
  /* Cells are stored as plain text and have never had a sanitiser. If the
     newline conversion were done by trusting the stored string, a cell would
     become an injection point on a page 72 clubs read. */
  const out = cellHtml('<script>alert(1)</script>\nnext');
  assert.ok(!out.includes('<script'), 'no live markup may escape a cell');
  assert.ok(out.includes('&lt;script'), 'it is escaped, not stripped');
  assert.equal(out.split('<br>').length, 2, 'and the break still works');
});

test('empty and missing cells do not become "null" or "undefined"', () => {
  for (const v of [null, undefined, '']) assert.equal(cellHtml(v), '');
});

test('the cell is READ with something that understands a line break', () => {
  /* textContent is the bug. It returns "Line oneLine two" for a cell holding
     "Line one<br>Line two" — the two lines are welded together with not even
     a space between them. */
  const save = lift('saveTableCell');
  assert.match(save, /cellText\(cell\)/,
    'saveTableCell must read the cell with cellText');
  assert.ok(!/cell\.textContent/.test(save),
    'textContent silently discards every <br> in the cell');

  const read = lift('cellText');
  assert.match(read, /tag === 'br'[\s\S]{0,40}\\n/, 'a <br> becomes a newline');
  assert.match(read, /tag === 'div' \|\| tag === 'p'/,
    'Chrome wraps new lines in divs and Firefox splits paragraphs — both are ' +
    'a line break and neither is a <br>');
});

test('sanitize turns a div into a paragraph instead of deleting it', () => {
  const s = lift('sanitize');
  assert.match(s, /if \(tag === 'div'\)[\s\S]{0,220}createElement\('p'\)/,
    'a div is a line break, not rubbish — unwrapping it merges two lines');

  /* The conversion must happen INSIDE clean(), before the allow-list can
     throw the element away. Doing it afterwards on the serialised string is
     precisely the version that never fired. */
  const divAt = s.indexOf("tag === 'div'");
  const okAt = s.indexOf('OK_TAGS.indexOf(tag)');
  assert.ok(divAt >= 0 && okAt >= 0 && divAt < okAt,
    'divs must be converted before the allow-list unwraps them');

  assert.ok(!/replace\(\/<div>\/gi/.test(s),
    'the old string replacement is gone — it ran after every div had already ' +
    'been removed, so it could not ever have done anything');
});

test('the allow-list still refuses live markup', () => {
  /* The div change widens what sanitize accepts. It must not have widened it
     to anything that runs. */
  const list = /var OK_TAGS = \[([^\]]*)\]/.exec(SRC);
  assert.ok(list, 'OK_TAGS still exists');
  for (const bad of ['script', 'iframe', 'style', 'object', 'embed', 'form', 'div']) {
    assert.ok(!list[1].includes("'" + bad + "'"),
      bad + ' must not be on the allow-list' +
      (bad === 'div' ? ' — divs are converted, not permitted' : ''));
  }
});

test('a phrase spanning a line break inside a cell is still searchable', () => {
  const t = lift('tableText');
  assert.match(t, /replace\(\/\\s\+\/g, ' '\)/,
    'cells hold newlines now, so the search text has to flatten them or a ' +
    'phrase running across one stops matching');
});
