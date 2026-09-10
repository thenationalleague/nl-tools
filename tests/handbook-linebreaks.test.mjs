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

test('the cell is READ with something that keeps a line break AND the formatting', () => {
  /* textContent was the first bug: "Line one<br>Line two" came back as
     "Line oneLine two". A text walk (cellText, v0.55) was the second: it kept
     the line but flattened <ul>, <li> and <i> to words, so nothing typed with
     the toolbar survived a save (Appendix G, 10/09/2026). The cell is markup
     now and is read through the same sanitiser as a clause body. */
  const save = lift('saveTableCell');
  assert.match(save, /cellMarkup\(cell\)/,
    'saveTableCell must read the cell with cellMarkup');
  assert.ok(!/cell\.textContent/.test(save),
    'textContent silently discards every <br> in the cell');
  assert.ok(!/cellText\(/.test(save),
    'cellText flattened lists and italics to words — that was the v0.55 read');
  assert.match(save, /node\.table\.rich = true/,
    'a saved cell is markup, and the table must say so or the reader escapes it');

  const read = lift('cellMarkup');
  assert.match(read, /sanitize\(el\.innerHTML\)/,
    'the cell goes through the same allow-list as a clause body');
});

/* A cell in a rich table is drawn as stored; a cell in a table without the
   flag is the old plain text and is still escaped. Both branches have to
   hold: the first is the fix, the second is what stops an edition published
   before v0.65 showing a club a literal "<". */
test('a rich cell is drawn as the markup it holds', () => {
  assert.equal(cellHtml('Clubs must lodge:<ul><li>the <em>signed</em> declaration</li></ul>', true),
    'Clubs must lodge:<ul><li>the <em>signed</em> declaration</li></ul>');
});

test('a plain cell is still escaped, whatever it holds', () => {
  assert.equal(cellHtml('<ul><li>x</li></ul>', false), '&lt;ul&gt;&lt;li&gt;x&lt;/li&gt;&lt;/ul&gt;');
  assert.equal(cellHtml('a\nb', false), 'a<br>b');
});

test('renderTable passes the table\'s rich flag to every cell', () => {
  const r = lift('renderTable');
  assert.match(r, /var rich = !!t\.rich/);
  const calls = r.match(/cellHtml\(c, rich\)/g) || [];
  assert.equal(calls.length, 2, 'both th and td must pass the flag');
  assert.ok(!/cellHtml\(c\)/.test(r), 'a call without the flag escapes a rich cell');
});

test('normNode converts a plain table to rich on the way in, through the one shared conversion', () => {
  const nn = lift('normNode');
  assert.match(nn, /if \(!t\.rich\) n\.table = window\.HB_DIFF\.richTable\(t\)/,
    'the editor and the diff must convert identically or the first review reports every table as changed');
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
  assert.match(t, /HB_DIFF\.htmlToText\(s\)/,
    'cells are markup now: search the words, not the tags');
  assert.match(t, /replace\(\/\\s\+\/g, ' '\)/,
    'cells hold line breaks, so the search text has to flatten them or a ' +
    'phrase running across one stops matching');
});

test('the reader search strips cell markup too', () => {
  const rd = readFileSync(join(REPO, 'handbook/_reader.js'), 'utf8');
  const i = rd.indexOf('function tableText(');
  const fn = rd.slice(i, rd.indexOf('\n  }', i));
  assert.match(fn, /replace\(\/<\[\^>\]\+>\/g, ' '\)/,
    'a search for "signed declaration" must not be beaten by the <em> between the words');
});
