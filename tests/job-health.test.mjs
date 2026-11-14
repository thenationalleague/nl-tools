/* The weekly background-job note and Estate's cloud-job flag (14/11/2026).
   The stand-in API answers below are cut down from the shapes cited at the
   top of scripts/job-health.mjs:
     GitHub runs   docs.github.com/en/rest/actions/workflow-runs (list for a
                   repository): workflow_runs[] name, path, event, status,
                   conclusion, created_at, html_url. Estate has read the same
                   fields live since 13/11/2026.
     Scheduler     docs.cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs:
                   name, state, lastAttemptTime, status (google.rpc.Status).
     Logging       docs.cloud.google.com/logging/docs/reference/v2/rest/v2/entries/list:
                   entries[].resource.labels.job_id for resource.type
                   cloud_scheduler_job.
   Every job name here is a real file or function in this repo (public); no
   person, address or key appears. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { summariseGitHub, summariseCloud, composeNote, keyOf } from '../scripts/job-health.mjs';
import { REPO } from './load-canon.mjs';
import { levelRule } from '../scripts/rtdb-level-rule.mjs';

const run = (path, conclusion, at, extra = {}) => ({ name: 'Job ' + path, path: '.github/workflows/' + path,
  event: 'schedule', status: 'completed', conclusion, created_at: at, html_url: 'https://github.com/x/runs/' + at, ...extra });

test('a database key never carries a dot', () => {
  assert.equal(keyOf('.github/workflows/rtdb-backup-check.yml'), 'rtdb-backup-check');
  assert.ok(!/[.$#[\]/]/.test(keyOf('a.b.yml')));
});

test('GitHub: counts each job, newest run decides "last"; pull requests and button presses do not count', () => {
  const jobs = summariseGitHub([
    run('table-baseline.yml', 'success', '2026-11-14T01:00:00Z'),
    run('table-baseline.yml', 'failure', '2026-11-13T01:00:00Z'),
    run('table-baseline.yml', 'failure', '2026-11-12T01:00:00Z'),
    run('sync-gas.yml', 'failure', '2026-11-14T04:40:00Z'),
    run('canon-checks.yml', 'failure', '2026-11-14T09:00:00Z', { event: 'pull_request' }),
    run('build-leaderboard.yml', null, '2026-11-14T09:00:00Z', { status: 'in_progress' }),
    run('deploy-gas.yml', 'failure', '2026-11-14T09:00:00Z', { event: 'workflow_dispatch', name: 'Button · Publish Apps Script' })
  ]);
  assert.deepEqual(Object.keys(jobs).sort(), ['sync-gas', 'table-baseline']);
  const t = jobs['table-baseline'];
  assert.equal(t.runs, 3); assert.equal(t.failed, 2);
  assert.equal(t.last.ok, true, 'recovered: the newest run worked');
  assert.equal(t.lastFailed.at, Date.parse('2026-11-13T01:00:00Z'));
  assert.equal(jobs['sync-gas'].last.ok, false);
});

test('Cloud: a Scheduler job maps to its function, a non-zero status is a failed last run', () => {
  const jobs = summariseCloud([
    { name: 'projects/nl-tools/locations/europe-west2/jobs/firebase-schedule-usageRollup-europe-west2',
      state: 'ENABLED', lastAttemptTime: '2026-11-14T03:20:00Z', status: { code: 13, message: 'INTERNAL' } },
    { name: 'projects/nl-tools/locations/europe-west1/jobs/firebase-schedule-nlsIngestTick-europe-west1',
      state: 'ENABLED', lastAttemptTime: '2026-11-14T10:00:00Z' },
    { name: 'projects/nl-tools/locations/europe-west2/jobs/someone-elses-job', state: 'ENABLED' }
  ], [
    { resource: { type: 'cloud_scheduler_job', labels: { job_id: 'firebase-schedule-usageRollup-europe-west2' } } },
    { resource: { type: 'cloud_scheduler_job', labels: { job_id: 'firebase-schedule-usageRollup-europe-west2' } } },
    { resource: { type: 'cloud_scheduler_job', labels: { job_id: 'firebase-schedule-nlsIngestTick-europe-west1' } } }
  ]);
  assert.deepEqual(Object.keys(jobs).sort(), ['nlsIngestTick', 'usageRollup']);
  assert.equal(jobs.usageRollup.last.ok, false);
  assert.equal(jobs.usageRollup.failed, 2);
  assert.equal(jobs.nlsIngestTick.last.ok, true);
  assert.equal(jobs.nlsIngestTick.failed, 1);
});

test('the note: still-failing first, in plain words, with what each job does', () => {
  const health = {
    github: { ok: true, jobs: summariseGitHub([
      run('table-baseline.yml', 'success', '2026-11-14T01:00:00Z'),
      run('table-baseline.yml', 'failure', '2026-11-13T01:00:00Z'),
      run('sync-gas.yml', 'failure', '2026-11-14T04:40:00Z')]) },
    cloud: { ok: true, jobs: { usageRollup: { name: 'usageRollup', failed: 2, last: { ok: false } } } }
  };
  const n = composeNote(health, { 'gh:sync-gas.yml': 'Backs up the Apps Script project', 'fn:usageRollup': 'Counts how often each tool is opened, for the Data tool' });
  assert.equal(n.subject, 'NL Tools: 3 background jobs failed this week');
  const still = n.text.indexOf('Still failing'), recovered = n.text.indexOf('last run worked');
  assert.ok(still > -1 && recovered > still, 'still failing comes first');
  assert.match(n.text, /usageRollup \(Google cloud\): failed 2 times\. It counts how often each tool is opened, for the Data tool\./);
  assert.match(n.text, /Job sync-gas\.yml \(GitHub\): failed 1 of 1 runs\. It backs up the Apps Script project\./);
  assert.match(n.text, /https:\/\/nl\.tools\/estate\//);
});

test('the note: a quiet week says so, and a check that could not run says so', () => {
  const n = composeNote({ at: Date.parse('2026-11-14T06:47:00Z'), since: '2026-11-07',
    github: { ok: true, jobs: {} }, cloud: { ok: false, error: 'no Google sign-in', jobs: {} } }, {});
  assert.equal(n.subject, 'NL Tools: no background job failed this week');
  assert.match(n.text, /^Background jobs, 07\/11\/2026 to 14\/11\/2026\./);
  assert.match(n.text, /Cloud jobs could not be checked: no Google sign-in/);
});

test('wiring: daily timer, Apps Script route, rules, Estate', () => {
  const wf = readFileSync(join(REPO, '.github/workflows/job-health.yml'), 'utf8');
  assert.match(wf, /^name: Timer · /m, 'named by how it runs');
  assert.match(wf, /actions: read/);
  assert.match(wf, /"action":"jobHealth_send"/);
  const code = readFileSync(join(REPO, 'gas/Code.js'), 'utf8');
  assert.match(code, /action === 'jobHealth_send'\)\s+return respond\(jobHealthSend\(\)\);/);
  const gas = readFileSync(join(REPO, 'gas/JobHealth.js'), 'utf8');
  assert.match(gas, /if \(n\.due !== true/, 'sends only when the check marked it due');
  assert.match(gas, /rtdbWrite\(base \+ '\/due\.json', false/, 'and clears it, so asking twice sends once');
  assert.ok(!/body\.\w+/.test(gas), 'nothing is taken from the request');
  const rules = JSON.parse(readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8'));
  const node = rules.rules['app-data']['ops-estate']['job-health'];
  assert.equal(node['.write'], false, 'only the workflow, with Google credentials, writes it');
  assert.equal(node['.read'], levelRule('ops-estate', 'access', ['off', 'access']), 'generated, and asks for no Manage Estate cannot give');
  assert.ok(!/child\('ops-estate'\)\.val\(\) === 'admin'/.test(node['.read']));
  const estate = readFileSync(join(REPO, 'estate/index.html'), 'utf8');
  assert.match(estate, /db\.ref\('app-data\/ops-estate\/job-health\/cloud'\)/);
  assert.match(estate, /runsOn === 'Google cloud' && cj\[/);
});
