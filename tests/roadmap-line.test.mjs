/* Every pull request says what it does to the roadmap (scripts/check-roadmap-line.mjs). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';
import { checkRoadmapLine, ROADMAP } from '../scripts/check-roadmap-line.mjs';

test('no line, no pass', () => {
  assert.equal(checkRoadmapLine('Fixes the thing.', []).ok, false);
  assert.equal(checkRoadmapLine('', [ROADMAP]).ok, false);
  assert.equal(checkRoadmapLine('Roadmap: ', [ROADMAP]).ok, false, 'the template\'s empty line does not count');
});

test('new and developed must change the roadmap in the same pull request', () => {
  assert.equal(checkRoadmapLine('Roadmap: developed – Sign-up and approvals', ['pass/index.html']).ok, false);
  assert.equal(checkRoadmapLine('Roadmap: developed – Sign-up and approvals', ['pass/index.html', ROADMAP]).ok, true);
  assert.equal(checkRoadmapLine('Roadmap: new - Chosen clubs', [ROADMAP]).ok, true, 'a plain hyphen will do');
  assert.equal(checkRoadmapLine('Roadmap: new', [ROADMAP]).ok, false, 'name the item');
});

test('no change must say why', () => {
  assert.equal(checkRoadmapLine('Roadmap: no change', []).ok, false);
  assert.equal(checkRoadmapLine('Roadmap: no change – tidy', []).ok, false, 'a word is not a reason');
  assert.equal(checkRoadmapLine('Roadmap: no change – a spelling fix on one page', []).ok, true);
});

test('found anywhere in the description, in any case, after list or quote marks', () => {
  assert.equal(checkRoadmapLine('Some text.\n\n- roadmap: No Change – a check on how pull requests are written\n\nMore.', []).ok, true);
  assert.equal(checkRoadmapLine('> Roadmap: developed – Club views', [ROADMAP]).ok, true);
});

test('the workflow runs on every pull request, re-runs on an edited description, and leaves bots alone', () => {
  const wf = readFileSync(join(REPO, '.github/workflows/roadmap-line.yml'), 'utf8');
  assert.match(wf, /types: \[opened, edited, synchronize, reopened\]/);
  assert.doesNotMatch(wf, /paths:/, 'every pull request, whatever it touches');
  assert.match(wf, /PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/, 'the description goes in through the environment, never into the script');
  assert.match(wf, /endsWith\(github\.event\.pull_request\.user\.login, '\[bot\]'\)/);
});
