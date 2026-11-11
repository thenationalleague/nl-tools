/* Club Directory — where the view switcher lives, what the grids count in,
   and why a name is shown exactly as it was typed. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const JS = readFileSync(join(REPO, 'club-directory/_directory.js'), 'utf8');
const CSS = readFileSync(join(REPO, 'club-directory/_directory.css'), 'utf8');
const READER = readFileSync(join(REPO, 'club-directory/index.html'), 'utf8');
const EDITOR = readFileSync(join(REPO, 'club-directory/_editor.js'), 'utf8');
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
     comes out even.

     The wall moved to _directory.css on 26/08/2026, on its second use —
     club-directory/public draws the same one. */
  const grid = CSS.slice(CSS.indexOf('.rd-grid {'));
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

/* --------------------------------------------- a live document (11/11/2026)
   The import is over. The editor used to annotate every club with what the
   tidier changed, what the League added and whether somebody had signed the
   club off, and to lock a signed-off club. Richard: "this is now a live doc".
   The changes are still logged — read in Change log — but not on the page. */
const STAFF = readFileSync(join(REPO, 'club-directory/admin/index.html'), 'utf8');

test('the staff page chooses a club with the canon picker, not a bare <select>', () => {
  assert.match(JS, /function picker\(mount, opts\)/);
  assert.match(JS, /window\.NL\.clubPicker\(mount,/, 'picker() is built on NL.clubPicker');
  const live = strip(STAFF);
  assert.ok(!/<select[^>]*id="pick"/.test(live), 'the staff page still has a <select> chooser');
  assert.match(live, /NLDirectory\.picker\(\$\('pick'\)/, 'the staff page uses NLDirectory.picker');
  for (const [name, src] of [['staff view', STAFF], ['editor', EDITOR]]) {
    assert.ok(!/\$\('pick'\)\.value/.test(strip(src)), `${name} still reads the old <select>`);
  }
});

test('the editor no longer marks up a club with its import history', () => {
  const live = strip(EDITOR);
  /* Quoted as they were in code, so the changelog naming them does not trip
     this. */
  for (const gone of ["' \\u2014 COMPLETE'", "'Added by us'", "'Was: '", "'Mark complete'",
    ">Re-check all<", 'function runRecheck', 'function markProvenance', 'function markEdits', 'function showSignoff',
    'function diagnose', 'function showMerges',
    /* Change log is the one way back; Versions and Add organisation went with
       it (Richard, 11/11/2026). */
    '>Versions<', 'function showEditions', 'function restoreFrom',
    '>Add organisation<', 'function addOrganisation']) {
    assert.ok(!live.includes(gone), `editor still has ${gone}`);
  }
  assert.ok(!/signedOffBy\(/.test(live), 'editing is still gated on sign-off');
});

test('the editor still logs every change, off the page', () => {
  const live = strip(EDITOR);
  assert.match(live, /function logJournal\(/);
  assert.match(live, /function logEdit\(/);
  assert.match(strip(STAFF), /id="changes"[^>]*>Change log</);
  assert.match(live, /function persist\(club, what, undoOf\) \{\s*logJournal\(club, what, undoOf\);/);
});

test('publishing still freezes a copy, though nothing lists them any more', () => {
  const live = strip(EDITOR);
  assert.match(live, /ref\(ROOT \+ '\/editions'\)\.push\(\)/, 'Publish no longer writes an edition');
  assert.match(live, /edRef\.set\(edition\)/);
});

test('a phone extension is small and stays in one piece', () => {
  const rule = /\.cd-row__ext \{([^}]*)\}/.exec(CSS);
  assert.ok(rule, '.cd-row__ext has no rule');
  assert.match(rule[1], /font-size: var\(--text-xs\)/);
  assert.match(rule[1], /white-space: nowrap/);
  assert.ok(!/class="cd-f__sub">ext /.test(JS), 'an extension still uses the facts style');
});

/* ------------------------------------------ one page, an Edit button (v1.18)
   Editing moved onto the staff page (Richard, 11/11/2026). */
const EDIT_STUB = readFileSync(join(REPO, 'club-directory/admin/edit/index.html'), 'utf8');

test('the staff page edits in place, behind Edit, for Manage only', () => {
  const live = strip(STAFF);
  assert.match(live, /<script src="\/club-directory\/_editor\.js\?v=\d+"><\/script>/);
  assert.match(live, /<link rel="stylesheet" href="\/club-directory\/_editor\.css\?v=\d+">/);
  assert.match(live, /id="editBtn"[^>]*hidden>Edit</, 'Edit starts hidden');
  assert.match(live, /id="publish"[^>]*hidden>Publish</, 'Publish starts hidden');
  assert.match(live, /function canEdit\(\) \{[\s\S]*?ses\.role === 'superadmin' \|\| ses\.toolLevel === 'admin'/);
  assert.match(live, /NLEditor\.start\(EDIT_HOST\)/);
  assert.ok(!/admin\/edit\//.test(live), 'nothing on the staff page still points at the old edit page');
});

test('the editor is a module the page drives, not a page', () => {
  assert.match(EDITOR, /window\.NLEditor = \(function \(\) \{/);
  assert.match(EDITOR, /return \{ start: start, draw: draw, search: search \};/);
  const live = strip(EDITOR);
  for (const gone of ['nlAuthReady', '_cdBoot', "$('app')", "$('who')", 'history.replaceState',
    'function runBake', 'function rebuildInfo', 'ops-club-contacts/submissions']) {
    assert.ok(!live.includes(gone), `the editor module still has ${gone}`);
  }
  /* Shared-class rules only while editing, so the reading view is untouched. */
  const css = readFileSync(join(REPO, 'club-directory/_editor.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  for (const sel of css.match(/[^{}]+(?=\{)/g) || []) {
    for (const one of sel.split(',')) {
      if (/\.cd-/.test(one) && !/@media/.test(one)) {
        assert.match(one, /\.ed-on\b|\.ed-/, `"${one.trim()}" styles the reading view too`);
      }
    }
  }
});

test('the old edit addresses forward to the staff page in editing', () => {
  for (const src of [EDIT_STUB, readFileSync(join(REPO, 'club-directory/editor/index.html'), 'utf8')]) {
    assert.match(src, /location\.replace\('\/club-directory\/admin\/\?edit' \+ location\.hash\)/);
    assert.ok(!/auth-guard/.test(src), 'a redirect stub waits on nothing');
  }
});

test('Change log downloads the whole log, marked live or not yet live', () => {
  const live = strip(EDITOR);
  assert.match(live, /label: 'Download \(CSV\)'/);
  const fn = live.slice(live.indexOf('function downloadLog()'));
  assert.match(fn, /journalAll\(\)/, 'every journalled change');
  assert.match(fn, /editList\(club\)/, 'every hand-edited field');
  assert.match(fn, /at > PUBLISHED_AT/, 'each row says whether it is live yet');
  assert.match(fn, /NL\.csv\(/, 'canon CSV, not a hand-rolled one');
  assert.match(fn, /NL\.download\(/);
});

test('Publish says what it will change, from the live copy, before it changes it', () => {
  const live = strip(EDITOR);
  const fn = live.slice(live.indexOf('function publishConfirmed('));
  const body = fn.slice(0, fn.indexOf('\n  }\n'));
  /* Read what readers have now, then compare, then ask — in that order. */
  const read = body.indexOf("ref(ROOT + '/published/clubs').once('value')");
  const diff = body.indexOf('publishDiff(built,');
  const ask = body.indexOf('NL.modal(');
  assert.ok(read > -1 && diff > read && ask > diff, 'reads the live copy, diffs, then asks');
  assert.match(live, /function publishDiff\(built, live\)/);
  assert.match(live, /'New to the directory'/);
  assert.match(live, /'Taken out of the directory'/);
  assert.match(live, /lines\.push\('Added: '/);
  assert.match(live, /lines\.push\('Removed: '/);
});
