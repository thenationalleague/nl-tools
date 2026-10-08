/* Responsibilities — the view-only door, and the promises it makes.

   /responsibilities/view/ shows the department's map to people with no
   portal account, each with their own six-digit code. The map holds names
   and "what goes unowned when someone leaves", so what is worth pinning is
   who can read and that nobody but a superadmin can write — and both live
   in the rules and the function, not the page. A page that stopped drawing
   an Edit button would look identical whether or not the database still
   refused the write.

   The Firebase half (trigger delivery, token minting, rules enforcement)
   needs the emulator or a live run. Rendering is checked in a browser. */

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
const FN = read('functions/responsibilities.js');

/* Both pages explain themselves at length and would match the patterns
   below; a guard that fires on its own rationale gets switched off. */
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const SUPER = "root.child('users').child(auth.uid).child('role').val() === 'superadmin'";

/* The function file requires firebase-functions at load, which the repo root
   does not install. Lift the pure helpers out of the SHIPPED source and
   evaluate them together, so a change to the real function shows up here. */
function lift(names) {
  const bodies = names.map((name) => {
    const i = FN.indexOf('function ' + name + '(');
    assert.ok(i >= 0, 'functions/responsibilities.js no longer defines ' + name);
    let depth = 0, j = FN.indexOf('{', i);
    for (; j < FN.length; j++) {
      if (FN[j] === '{') depth++;
      else if (FN[j] === '}' && --depth === 0) { j++; break; }
    }
    return FN.slice(i, j);
  });
  // eslint-disable-next-line no-new-func
  return new Function(bodies.join('\n') + '\nreturn {' + names.join(',') + '};')();
}
const { normCode, pickViewer } = lift(['normCode', 'safeEqual', 'pickViewer']);

/* ------------------------------------------------------------ the rules */

test('only a superadmin can write the map', () => {
  assert.ok(NODE['.write'].includes(SUPER), 'node write is superadmin');
  assert.ok(!/auth\.token/.test(NODE['.write']), 'no code claim can write');
  /* Write rules cascade DOWN and a child rule can only ADD access, so a
     .write on people or functions would open it to whoever it names. */
  for (const k of ['people', 'functions']) {
    assert.equal(NODE[k]['.write'], undefined, `${k} must not carry its own .write`);
  }
});

test('people and functions open to a viewer code, and to nothing else', () => {
  for (const k of ['people', 'functions']) {
    assert.equal(NODE[k]['.read'], "auth != null && auth.token.resp === 'viewer'", k);
  }
  /* The node as a whole — config, rate — stays superadmin. A viewer can read
     the map and cannot read anyone's code. */
  assert.ok(NODE['.read'].includes(SUPER));
  assert.ok(!/auth\.token/.test(NODE['.read']));
  assert.equal(NODE.config, undefined, 'config inherits the superadmin-only node');
  assert.equal(NODE.rate, undefined, 'rate inherits the superadmin-only node');
});

test('the sign-in handshake can only touch its own request and grant', () => {
  for (const k of ['authRequests', 'authGrants']) {
    const r = NODE[k].$uid;
    assert.equal(r['.read'], 'auth != null && auth.uid === $uid', `${k} read`);
    assert.equal(r['.write'], 'auth != null && auth.uid === $uid', `${k} write`);
  }
  assert.match(NODE.authRequests.$uid['.validate'], /hasChildren\(\['at'\]\)/);
});

/* --------------------------------------------------------- the function */

test('normCode keeps the digits and nothing else', () => {
  assert.equal(normCode(' 123-456 '), '123456');
  assert.equal(normCode(null), '');
});

test('pickViewer opens for the right code and names who it is', () => {
  const v = { ab: { name: 'Person A', code: '123456' }, cd: { name: 'Person C', code: '654321' } };
  assert.deepEqual(pickViewer(v, '654321'), { key: 'cd', name: 'Person C' });
  assert.equal(pickViewer(v, '111111'), null);
});

test('pickViewer fails closed', () => {
  /* A gate is judged by what it refuses. */
  assert.equal(pickViewer({ a: { name: 'A', code: '' } }, ''), null, 'blank typed code');
  assert.equal(pickViewer({ a: { name: 'A' } }, ''), null, 'record with no code');
  assert.equal(pickViewer({ a: { name: 'A', code: '' } }, '000000'), null, 'blank stored code');
  assert.equal(pickViewer({ a: { name: 'A', code: '123456', revoked: true } }, '123456'), null, 'revoked');
  assert.equal(pickViewer({ 'a/b': { name: 'A', code: '123456' } }, '123456'), null, 'unsafe key for a uid');
  assert.equal(pickViewer(null, '123456'), null, 'no config at all');
});

test('the claim the function mints is the claim the rules and the page ask for', () => {
  assert.match(FN, /createCustomToken\("rp-" \+ hit\.key, \{\s*resp: "viewer", respName: hit\.name,/);
  assert.match(FN, /ref: "\/" \+ ROOT \+ "\/authRequests\/\{uid\}"/);
  assert.match(FN, /const ROOT = "app-data\/media-responsibilities";/);
  assert.match(strip(VIEW), /claim: 'resp'/);
  assert.match(strip(VIEW), /NL\.codeGate\.viaFunction\(ROOT\)/);
  assert.match(strip(VIEW), /var ROOT = 'app-data\/media-responsibilities';/);
  assert.match(read('functions/index.js'), /require\("\.\/responsibilities"\)/, 'exported');
});

/* ------------------------------------------------------------- the pages */

test('an import replaces the map and leaves the viewer codes alone', () => {
  const code = strip(EDIT);
  assert.ok(!/db\.ref\(ROOT\)\.set\(/.test(code), 'no set() on the whole node');
  assert.match(code, /db\.ref\(ROOT\)\.update\(\{ people: out\.people, functions: out\.functions \}\)/);
});

test('the view page is not indexable and is not a portal page', () => {
  assert.match(VIEW, /<meta name="robots" content="noindex, nofollow">/);
  assert.ok(!/auth-guard\.js/.test(VIEW));
});

test('the view page writes nothing to the map', () => {
  const code = strip(VIEW);
  assert.ok(!/\.(set|update|push|remove|transaction)\(/.test(code),
    'no database write calls on the view page');
  assert.ok(!/isEditing|onItemClick|panelTools/.test(code), 'no edit hooks handed to the map');
});

test('the view page reads people and functions separately, never the parent', () => {
  /* The rules open the two children and nothing else, so a read of the
     parent would be refused outright for every viewer. */
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
