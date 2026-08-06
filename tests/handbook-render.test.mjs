/* Handbook render trigger — unit tests for the pure decision in
   functions/handbook.js.

   The function itself cannot be imported here: requiring it pulls in
   firebase-functions, which is installed under functions/ and not at the repo
   root where `npm test` runs. So the same approach as
   tests/programme.test.mjs — lift the pure function out of the module text and
   run it in a VM sandbox.

   What is actually at stake. This predicate is the only thing standing between
   a write of publishedEditionId and a GitHub Actions run. Get it wrong in one
   direction and a publish renders nothing, leaving the Download button serving
   the previous edition until the hourly poll catches up. Get it wrong in the
   other and every unrelated write to that key starts a headless-Chrome job.

   Not covered here: the dispatch itself (needs a live token and would fire a
   real workflow) and the RTDB trigger wiring. See functions/README.md for the
   manual check. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'functions', 'handbook.js'), 'utf8');

function loadShouldDispatch() {
  const match = SRC.match(/function shouldDispatch\(before, after\) \{[\s\S]*?\n\}/);
  assert.ok(
    match,
    'shouldDispatch not found in functions/handbook.js — if it was renamed or ' +
    'reshaped, update this extraction rather than deleting the test'
  );
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(match[0] + '\nthis.shouldDispatch = shouldDispatch;', sandbox);
  return sandbox.shouldDispatch;
}

const shouldDispatch = loadShouldDispatch();

test('a new edition id dispatches', () => {
  assert.equal(shouldDispatch('edition-6', 'edition-7'), true);
});

test('first ever publish dispatches', () => {
  assert.equal(shouldDispatch(null, 'edition-1'), true);
});

test('re-writing the same id does not dispatch', () => {
  /* RTDB fires on any write, including one that stores the value already
     there. The workflow would no-op against pdf-meta.json, but the point of
     the doorbell is not paying for runs that find nothing. */
  assert.equal(shouldDispatch('edition-7', 'edition-7'), false);
});

test('unpublishing does not dispatch', () => {
  /* Deleting the pointer leaves no edition to render, and the render script
     would resolve an empty id and fail. */
  assert.equal(shouldDispatch('edition-7', null), false);
  assert.equal(shouldDispatch('edition-7', undefined), false);
});

test('a blank or whitespace id does not dispatch', () => {
  assert.equal(shouldDispatch('edition-7', ''), false);
  assert.equal(shouldDispatch('edition-7', '   '), false);
});

test('a non-string id does not dispatch', () => {
  /* publishedEditionId is a pointer key. Anything else means something
     upstream is wrong, and dispatching on it would hide that. */
  assert.equal(shouldDispatch(null, 7), false);
  assert.equal(shouldDispatch(null, { id: 'edition-7' }), false);
  assert.equal(shouldDispatch(null, true), false);
});
