/* Club Directory — where the view switcher lives, what the grids count in,
   and why a name is shown exactly as it was typed. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const JS = readFileSync(join(REPO, 'club-directory/_directory.js'), 'utf8');
const CSS = readFileSync(join(REPO, 'club-directory/_directory.css'), 'utf8');
const READER = readFileSync(join(REPO, 'club-directory/reader/index.html'), 'utf8');
const EDITOR = readFileSync(join(REPO, 'club-directory/editor/index.html'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

test('the switcher is built where the people are, not by the page', () => {
  /* It sat at the top of the reader and the editor, above everything — which
     put it on the club INDEX, offering to show 72 crests as "list" or
     "cards" when it does neither. drawIndex() does not call renderClub, so
     building it there removes it from the index without anyone having to
     remember to hide it. */
  assert.match(JS, /function viewSwitch\(cards\)/);
  assert.match(JS, /data-view-switch/);
  for (const [name, src] of [['reader', READER], ['editor', EDITOR]]) {
    assert.ok(!/id="view"/.test(strip(src)),
      `${name} still has the page-level switcher`);
  }
});

test('both pages ask for it, and listen for it by delegation', () => {
  /* It is rebuilt on every draw, so a listener bound to the buttons
     themselves would be bound to elements that no longer exist. */
  for (const [name, src] of [['reader', READER], ['editor', EDITOR]]) {
    assert.match(src, /viewSwitch: true/, `${name} asks renderClub for it`);
    assert.match(src, /\[data-view-switch\] button/, `${name} delegates`);
  }
});

test('one definition, two callers', () => {
  /* The editor's search results build their own list without going through
     renderClub. Two copies of a control is how the two drift. */
  assert.match(JS, /viewSwitch: viewSwitch,/, 'exported');
  assert.match(EDITOR, /NLDirectory\.viewSwitch\(cards\)/);
});

test('the club grid counts in something that divides 24', () => {
  /* Every division has 24 clubs. A count that divides 24 fills its last row;
     one that does not leaves an orphan row under a full grid — and five, which
     auto-fill was picking on a laptop, is the one count in range that never
     comes out even. */
  const grid = READER.slice(READER.indexOf('.rd-grid {'));
  assert.ok(!/auto-fill|auto-fit/.test(grid.slice(0, 900)),
    'the count is chosen, not guessed');
  const counts = [...grid.slice(0, 1200).matchAll(/repeat\((\d+), minmax/g)].map((m) => +m[1]);
  assert.ok(counts.length >= 4, 'a count at each width');
  for (const c of counts) {
    assert.equal(24 % c, 0, `${c} columns leaves ${24 % c} clubs on their own row`);
  }
  assert.ok(!counts.includes(5), 'five is the one to avoid');
});

test('cards are the same size as each other', () => {
  const rule = /\.cd-cards \{([^}]*)\}/.exec(CSS);
  assert.ok(rule, '.cd-cards exists');
  assert.match(rule[1], /grid-auto-rows: 1fr/, 'every row the height of its tallest card');
  assert.ok(!/auto-fill|auto-fit/.test(rule[1]), 'and a chosen column count, so the width is round');
  /* Equal heights create space on a sparse card; anchoring the contacts to
     the foot is what stops that space reading as a mistake. */
  const lines = /\.cd-pc__lines \{([^}]*)\}/.exec(CSS);
  assert.match(lines[1], /margin-top: auto/);
  /* Four across is a narrow card, and the department chip is a fixed label up
     to SAFEGUARDING & WELFARE long. Unwrapped it took the whole row and left
     the job title breaking mid-word down a two-character column. */
  const job = /\.cd-pc__job \{([^}]*)\}/.exec(CSS);
  assert.match(job[1], /flex-wrap: wrap/);
  const title = /\.cd-pc__title \{([^}]*)\}/.exec(CSS);
  assert.match(title[1], /overflow-wrap: break-word/,
    'a title breaks between words before it breaks one');
});

test('a name is set as its owner writes it', () => {
  /* The surname was capitalised for a good reason — it says which word the
     list is sorted on — and went for a better one: the clubs fill this in
     themselves, and a directory that DISPLAYS caps teaches them to TYPE
     caps. _tidy.js already has to catch names that arrive shouted, which is
     the same problem answered from the other end.

     This guards the data, not a preference. Anything that re-cases a name
     for display makes the tool an example of the input it is trying to
     prevent. */
  const rules = strip(CSS);
  /* Department headings ARE upper-cased and stay that way — they are a fixed
     vocabulary the tool chooses, not something a club typed. The rule is
     about the fields somebody fills in. */
  for (const sel of ['.cd-row__name', '.cd-pc__name']) {
    const rule = new RegExp(sel.replace('.', '\\.') + ' \\{([^}]*)\\}').exec(rules);
    assert.ok(rule, `${sel} exists`);
    assert.ok(!/text-transform/.test(rule[1]), `${sel} re-cases what was typed`);
  }
  assert.ok(!/\.cd-sur\b/.test(rules), 'the surname span is gone from the CSS');
  const js = strip(JS);
  assert.ok(!/cd-sur|capsSurname/.test(js), 'and from the markup that fed it');
  for (const [name, src] of [['reader', READER], ['editor', EDITOR]]) {
    assert.ok(!/capsSurname/.test(strip(src)), `${name} no longer asks for it`);
  }
  /* One expression, so there is nowhere for a case rule to come back in. */
  const fn = js.slice(js.indexOf('function displayName('));
  assert.match(fn.slice(0, 200), /return esc\(fullName\(p\) \|\| 'Name not given'\);/);
});
