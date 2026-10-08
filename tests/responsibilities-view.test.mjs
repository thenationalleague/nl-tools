/* Responsibilities — the view-only door, and the promises it makes.

   /responsibilities/view/ shows the department's map to named League people
   who have no portal account. It holds names and "what goes unowned when
   someone leaves", so the guarantees worth pinning are about who can read
   and that nobody but a superadmin can write — and both of those live in the
   rules, not the page. A page that stopped drawing an Edit button would look
   identical whether or not the database still refused the write.

   Rendering is checked in a browser, not here. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const read = (p) => readFileSync(join(REPO, p), 'utf8');
const RULES = JSON.parse(read('system/rtdb/rules.snapshot.json'));
const NODE = RULES.rules['app-data']['media-responsibilities'];
const VIEW = read('responsibilities/view/index.html');
const EDIT = read('responsibilities/index.html');
const CLUBCODE = read('functions/club-code.js');

/* Both pages explain themselves at length and would match the patterns
   below; a guard that fires on its own rationale gets switched off. */
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const SUPER = "root.child('users').child(auth.uid).child('role').val() === 'superadmin'";

/* ------------------------------------------------------------ the rules */

test('only a superadmin can write anything under the node', () => {
  assert.ok(NODE['.write'].includes(SUPER), 'node write is superadmin');
  assert.ok(!/auth\.token/.test(NODE['.write']), 'no code claim can write');
  /* RTDB write rules cascade DOWN and a child rule can only ADD access, so a
     .write on any child would open that child to whoever it names. */
  for (const [k, v] of Object.entries(NODE)) {
    if (k.startsWith('.')) continue;
    assert.equal(v['.write'], undefined, `${k} must not carry its own .write`);
  }
});

test('people and functions open to a League code holder on the viewers list — and nobody else', () => {
  for (const k of ['people', 'functions']) {
    const r = NODE[k]['.read'];
    assert.match(r, /auth != null/);
    /* club: "NL" is the League's record in Club Codes. A club's own code
       carries its club key, so it is refused here however it is used. */
    assert.match(r, /auth\.token\.club === 'NL'/, `${k}: League codes only`);
    /* And the visitor's uid has to be on the list. Without this, every
       League code holder — the directory and handbook readers — could open
       the map. */
    assert.match(r, /media-responsibilities\/viewers'\)\.child\(auth\.uid\)\.exists\(\)/,
      `${k}: on the viewers list`);
    assert.match(r, /&&[^|]*&&/, `${k}: both conditions, joined with AND`);
    assert.ok(!r.includes('||'), `${k}: no OR that could widen it`);
  }
});

test('the viewers list itself is superadmin-only', () => {
  /* No child rule, so it inherits the node's superadmin read and write — a
     viewer cannot read who else is on it, or add themselves. */
  assert.equal(NODE.viewers, undefined);
  assert.ok(NODE['.read'].includes(SUPER));
  assert.ok(!/auth\.token/.test(NODE['.read']), 'the node as a whole stays superadmin');
});

/* ------------------------------------------------- the uid has to match */

test('the edit page keys a viewer by the uid Club Codes signs a named League holder in as', () => {
  /* Club Codes mints "cc-<key>-<userId>" for a named holder, and the rule
     looks that uid up on the viewers list. If either side changes shape, the
     ticked person signs in and is refused, with nothing on screen to say why. */
  assert.match(CLUBCODE, /"cc-" \+ hit\.key \+ "-" \+ hit\.userId/,
    'club-code.js uid shape for a named holder');
  assert.match(EDIT, /function viewerUid\(id\) \{ return 'cc-NL-' \+ id; \}/,
    'edit page writes viewers/cc-NL-<id>');
  assert.match(strip(EDIT), /db\.ref\('app-data\/club-codes\/nl'\)/,
    'the people offered are the National League holders');
});

test('an import replaces the map and leaves the viewers list alone', () => {
  const code = strip(EDIT);
  assert.ok(!/db\.ref\(ROOT\)\.set\(/.test(code), 'no set() on the whole node');
  assert.match(code, /db\.ref\(ROOT\)\.update\(\{ people: out\.people, functions: out\.functions \}\)/);
});

/* ------------------------------------------------------- the view page */

test('the view page signs in through Club Codes and is not indexable', () => {
  assert.match(VIEW, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(strip(VIEW), /NL\.codeGate\.viaFunction\('app-data\/club-codes'/);
  assert.ok(!/auth-guard\.js/.test(VIEW), 'a code page, not a portal page');
});

test('the view page writes nothing to the map', () => {
  const code = strip(VIEW);
  assert.ok(!/\.(set|update|push|remove|transaction)\(/.test(code),
    'no database write calls on the view page');
  assert.ok(!/isEditing|onItemClick|panelTools/.test(code), 'no edit hooks handed to the map');
});

test('the view page reads people and functions separately, never the parent', () => {
  /* The rules open the two children and nothing else, so a read of the
     parent node would be refused outright for every viewer. */
  const code = strip(VIEW);
  assert.match(code, /\['people', 'functions'\]/);
  assert.ok(!/ref\(ROOT\)\./.test(code), 'no read of the whole node');
});

test('both pages draw from the one shared map', () => {
  for (const [name, page] of [['view', VIEW], ['edit', EDIT]]) {
    assert.match(page, /\/responsibilities\/_map\.js\?v=\d+/, `${name} loads _map.js`);
    assert.match(page, /\/responsibilities\/_map\.css\?v=\d+/, `${name} loads _map.css`);
  }
  const v = (p) => p.match(/_map\.js\?v=(\d+)/)[1];
  assert.equal(v(VIEW), v(EDIT), 'same _map.js version on both pages');
});
