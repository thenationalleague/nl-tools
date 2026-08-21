/* The publish → PDF trigger, and the four ways it could go wrong quietly.

   functions/handbook-pdf.js watches publishedEditionId and asks GitHub to run
   the render workflow. Everything it does happens off in a Cloud Function
   nobody is watching, against an API this test suite cannot call, so the
   failure modes are all silent ones:

     · the workflow FILENAME is a string. Get it wrong and GitHub returns 404,
       the function logs and returns, and the only symptom is that the PDF is
       quietly back to being up to an hour late — exactly the behaviour this
       was built to remove, and indistinguishable from it.
     · the OWNER/REPO are strings too, and this repository was renamed once
       already (tools -> nl-tools, 16/08/2026).
     · a THROW would be a retry. Cloud Functions retries a failed RTDB trigger
       on a backoff, so throwing on a rejected dispatch fires the same rejected
       request again and again against a token GitHub has already refused.
     · sending `inputs: {force: true}` would make every duplicate dispatch a
       real render instead of the cheap no-op the workflow is designed around.

   None of those is visible in a log anyone reads. They are visible here. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const SRC = readFileSync(join(REPO, 'functions/handbook-pdf.js'), 'utf8');

/* The file explains at length why it does not throw and why it sends no
   inputs — so a naive grep for "throw" or "inputs" matches the prose saying it
   must not, and fails on a correct file. Code only. */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

function constant(name) {
  const m = new RegExp('const ' + name + ' = "([^"]+)"').exec(SRC);
  assert.ok(m, 'functions/handbook-pdf.js no longer defines ' + name);
  return m[1];
}

test('the workflow it dispatches actually exists', () => {
  const file = constant('WORKFLOW');
  assert.ok(existsSync(join(REPO, '.github/workflows', file)),
    `dispatches ${file}, which is not in .github/workflows — GitHub answers ` +
    '404, the function logs and returns, and the only symptom is the PDF ' +
    'silently going back to being up to an hour late');
});

test('that workflow accepts being dispatched at all', () => {
  /* workflow_dispatch is not the default. A workflow with only `schedule` is
     not startable through this API, and the 404 reads the same as a typo. */
  const wf = readFileSync(join(REPO, '.github/workflows', constant('WORKFLOW')), 'utf8');
  assert.match(wf, /^\s*workflow_dispatch:/m,
    'the render workflow must declare workflow_dispatch or it cannot be ' +
    'started through the API');
});

test('the branch it dispatches against is the one the workflow lives on', () => {
  assert.equal(constant('BRANCH'), 'main',
    'PRs land on main; dispatching a branch that does not exist is a 422');
});

test('it dispatches the repository this actually is', () => {
  /* Renamed once already — thenationalleague/tools became nl-tools on
     16/08/2026 when the repo moved to the organisation — and a stale name
     here 404s in the same unreadable way as a typo.

     Pinned as a LITERAL, not compared against the local git remote. The
     first version of this test did that and failed a correct function: a
     clone can still carry the pre-rename URL, because GitHub redirects it
     and git never has to notice. An oracle that is itself allowed to be
     stale is not an oracle. */
  assert.equal(constant('OWNER'), 'thenationalleague');
  assert.equal(constant('REPO'), 'nl-tools',
    'the repository is nl-tools; `tools` is the pre-rename name and only ' +
    'works for git, via a redirect the REST API does not follow');
});

test('a refused dispatch is logged, never thrown', () => {
  /* A throw asks Cloud Functions to retry, which re-sends a request GitHub
     has already refused — on a backoff, against a token that is not going to
     start working. The hourly cron is the fallback and needs no help. */
  assert.ok(!/throw /.test(CODE),
    'nothing here may throw: a thrown RTDB trigger is retried, and retrying ' +
    'a rejected dispatch just repeats it');
  assert.match(SRC, /catch \(err\)[\s\S]{0,200}logger\.error/,
    'a network failure is caught and logged');
  assert.match(SRC, /logger\.error\("handbook-pdf: GitHub refused/,
    'a non-204 answer is logged rather than swallowed');
});

test('it sends no inputs, so a duplicate dispatch stays a no-op', () => {
  /* The workflow compares pdf-meta.json against the live pointer and does
     nothing when they match. `force: true` would defeat exactly that, turning
     every redundant trigger into a full Chrome render and a commit. */
  assert.ok(!/inputs/.test(CODE),
    'no inputs — force must stay at its default of false');
  assert.match(SRC, /body: JSON\.stringify\(\{ ref: BRANCH \}\)/);
});

test('an empty or unchanged pointer does not start a render', () => {
  assert.match(SRC, /if \(!editionId\)[\s\S]{0,160}return;/,
    'nothing published means nothing to render');
  assert.match(SRC, /if \(was === editionId\)[\s\S]{0,160}return;/,
    'an RTDB write that does not change the value still fires the trigger');
});

test('the token is a secret, not an environment variable', () => {
  assert.match(SRC, /defineSecret\("GITHUB_DISPATCH_TOKEN"\)/);
  assert.match(SRC, /secrets: \[GITHUB_DISPATCH_TOKEN\]/,
    'declared on the trigger, or .value() is empty at runtime');
  assert.ok(!/ghp_|github_pat_/.test(SRC),
    'no token literal may ever appear in this file — the repo is public');
});

test('it is exported, or it is never deployed', () => {
  /* firebase deploy reads index.js. A function file nobody requires is a file
     that does nothing, and there is no error to notice. */
  const index = readFileSync(join(REPO, 'functions/index.js'), 'utf8');
  assert.match(index, /require\("\.\/handbook-pdf"\)/);
});
