/* Estate v1.4 (13/11/2026): a GitHub job whose last finished run failed
   needs a look. The shape of GitHub's answer (workflow_runs[0].conclusion,
   created_at, html_url) was checked against a live call to
   /repos/thenationalleague/nl-tools/actions/workflows/<file>/runs on
   13/11/2026; it allows browsers (Access-Control-Allow-Origin: *). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const PAGE = readFileSync(join(REPO, 'estate/index.html'), 'utf8');

test('a failed last run is a Needs a look warning, first in the list', () => {
  assert.match(PAGE, /failing:\s+\{ label: 'Last run failed'/);
  assert.match(PAGE, /var WARN_ORDER = \['failing',/);
  assert.match(PAGE, /if \(run && run\.conclusion === 'failure'\) \{ r\.warns\.unshift\('failing'\);/);
});

test('it asks GitHub once per job, for finished runs on main, and keeps the answer 30 minutes', () => {
  assert.match(PAGE, /\/runs\?branch=main&status=completed&per_page=1/);
  assert.match(PAGE, /RUNS_TTL = 30 \* 60 \* 1000/);
  assert.match(PAGE, /return lastRuns\(files\)\.catch\(/, 'GitHub saying no never stops the list');
});
