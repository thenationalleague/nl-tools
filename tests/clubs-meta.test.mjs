/* Wraps the clubs-meta validator so `npm test` fails on structural data errors.
   Warnings (e.g. a missing crest file) are reported by the standalone
   `npm run validate:clubs` and the data Action, but don't fail this test. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClubsMeta } from './validate-clubs-meta.mjs';

test('clubs-meta.json has no structural errors', () => {
  const { errors } = validateClubsMeta();
  assert.deepEqual(errors, [], 'clubs-meta structural errors:\n  ' + errors.join('\n  '));
});
