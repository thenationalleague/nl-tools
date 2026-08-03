/* Wraps the cup-clubs validator so `npm test` fails on structural data errors.
   Warnings (e.g. an unrecorded entrant side, or draft colours) are reported by
   the standalone `npm run validate:cup-clubs` but don't fail this test. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCupClubs } from './validate-cup-clubs.mjs';

test('cup-clubs-meta.json + entrants have no structural errors', () => {
  const { errors } = validateCupClubs();
  assert.deepEqual(errors, [], 'cup-clubs structural errors:\n  ' + errors.join('\n  '));
});
