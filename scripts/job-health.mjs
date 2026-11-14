#!/usr/bin/env node
/* =========================================================================
   NL Tools — which background jobs failed this week
   File: scripts/job-health.mjs
   Version: v1.0 (14/11/2026)

   Run by Timer · Background job check (job-health.yml), never by hand.
   Once a day it asks two places what failed in the last seven days and
   writes the answer to app-data/ops-estate/job-health:
     · GitHub: every run of every job in this repo, except checks on pull
       requests (those are work in progress, not the estate failing).
     · Google cloud: every timed cloud job (onSchedule in functions/), which
       Cloud Scheduler starts.
   Estate reads it to mark a cloud job whose last run failed, the way it
   already marks GitHub jobs. On Mondays (or when asked) it also sets
   note.due, and Apps Script (gas/JobHealth.js) emails the note to the
   media inbox and clears it.

   WHERE THE SHAPES COME FROM
   · GitHub, https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository
     (checked 14/11/2026): workflow_runs[] with name, path, event, status,
     conclusion, created_at, html_url; total_count; the `created` filter
     takes ">=YYYY-MM-DD"; 100 a page at most. Estate's own check
     (estate/index.html, lastRuns) reads the same fields and has been live
     since 13/11/2026.
   · Cloud Scheduler, https://docs.cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs
     (checked 14/11/2026): jobs[] with name
     (projects/P/locations/L/jobs/ID), state, lastAttemptTime, and status,
     "the response from the target for the last attempted execution", a
     google.rpc.Status, so a non-zero status.code is a failed last run.
     Firebase names a v2 timed job's Scheduler job
     firebase-schedule-<functionName>-<region>.
   · Cloud Logging, https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/entries/list
     (checked 14/11/2026): POST entries:list with resourceNames, filter,
     orderBy, pageSize, pageToken; answers entries[] and nextPageToken.
     Scheduler logs each attempt under resource.type="cloud_scheduler_job",
     resource.labels.job_id, a failed attempt at severity ERROR
     (https://docs.cloud.google.com/scheduler/docs/troubleshooting).

   THE LOGS ARE PUBLIC. This repo is public, so anyone can read a workflow
   run's log. Job names are public already (they are files in this repo);
   nothing else is printed but counts.
   ========================================================================= */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const VERSION = 'v1.0';
const DAY = 864e5;
const REPO = process.env.GITHUB_REPOSITORY || 'thenationalleague/nl-tools';
const PROJECT = 'nl-tools';
const REGIONS = ['europe-west1', 'europe-west2'];
const RTDB = 'https://nl-tools-default-rtdb.europe-west1.firebasedatabase.app';
const PATH = 'app-data/ops-estate/job-health';
/* Events that are the estate working, not someone's pull request. */
const SKIP_EVENTS = ['pull_request', 'pull_request_target'];
/* Jobs that run only when someone presses Run workflow: a failure there is
   seen by the person who pressed it. Named by how they run (CLAUDE.md,
   "Naming GitHub jobs"). */
const PRESSED = /^(Button|Recovery) · /;

/* A database key may not hold . $ # [ ] / — job files all end ".yml". */
export const keyOf = (file) => String(file).split('/').pop().replace(/\.ya?ml$/, '').replace(/[.$#[\]/]/g, '_');

/* GitHub runs → one entry per job: how many ran, how many failed, and how
   its last finished run went. Runs arrive newest first. */
export function summariseGitHub(runs) {
  const jobs = {};
  for (const r of runs) {
    if (SKIP_EVENTS.includes(r.event) || PRESSED.test(r.name || '') || r.status !== 'completed' || !r.path) continue;
    const file = r.path.replace(/@.*$/, '');
    const k = keyOf(file);
    const j = jobs[k] || (jobs[k] = { file, name: r.name || file, runs: 0, failed: 0, last: null, lastFailed: null });
    j.runs++;
    const bad = r.conclusion === 'failure' || r.conclusion === 'timed_out' || r.conclusion === 'startup_failure';
    if (bad) {
      j.failed++;
      if (!j.lastFailed) j.lastFailed = { at: Date.parse(r.created_at), url: r.html_url };
    }
    if (!j.last) j.last = { ok: !bad, at: Date.parse(r.created_at), url: r.html_url };
  }
  return jobs;
}

/* Scheduler jobs + their ERROR log entries → one entry per timed cloud
   job, keyed by the function's name. */
export function summariseCloud(schedJobs, errorEntries) {
  const fails = {};
  for (const e of errorEntries) {
    const id = e && e.resource && e.resource.labels && e.resource.labels.job_id;
    if (id) fails[id] = (fails[id] || 0) + 1;
  }
  const jobs = {};
  for (const s of schedJobs) {
    const id = String(s.name || '').split('/').pop();
    const m = /^firebase-schedule-(.+)-(europe-[a-z]+\d)$/.exec(id);
    if (!m) continue;
    const code = s.status && s.status.code;
    jobs[m[1]] = {
      name: m[1], region: m[2], state: s.state || '',
      failed: fails[id] || 0,
      last: s.lastAttemptTime ? { ok: !code, at: Date.parse(s.lastAttemptTime) } : null
    };
  }
  return jobs;
}

/* The note, in plain words. `does` maps an estate id (gh:<file>,
   fn:<name>) to the line Estate shows under the job. */
export function composeNote(health, does) {
  const items = [];
  const gh = (health.github && health.github.jobs) || {};
  for (const j of Object.values(gh)) {
    if (!j.failed) continue;
    items.push({ name: j.name, does: does['gh:' + j.file.split('/').pop()] || '', failed: j.failed, runs: j.runs,
      still: !!(j.last && !j.last.ok), url: (j.lastFailed && j.lastFailed.url) || '', where: 'GitHub' });
  }
  const cl = (health.cloud && health.cloud.jobs) || {};
  for (const j of Object.values(cl)) {
    const still = !!(j.last && !j.last.ok);
    if (!j.failed && !still) continue;
    items.push({ name: j.name, does: does['fn:' + j.name] || '', failed: j.failed, runs: null, still, url: '', where: 'Google cloud' });
  }
  items.sort((a, b) => (b.still - a.still) || (b.failed - a.failed) || a.name.localeCompare(b.name));
  const n = items.length;
  const subject = n ? `NL Tools: ${n} background job${n === 1 ? '' : 's'} failed this week`
    : 'NL Tools: no background job failed this week';
  const lines = [];
  if (health.since && health.at) lines.push(`Background jobs, ${ddmm(Date.parse(health.since))} to ${ddmm(health.at)}.`, '');
  if (!n) lines.push('Every background job that ran in the last seven days worked.');
  const block = (title, list) => {
    if (!list.length) return;
    lines.push('', title);
    for (const it of list) {
      const times = it.runs ? `failed ${it.failed} of ${it.runs} runs` : (it.failed ? `failed ${it.failed} time${it.failed === 1 ? '' : 's'}` : 'its last run failed');
      lines.push(`• ${it.name} (${it.where}): ${times}.` + (it.does ? ` It ${lower(it.does)}.` : ''));
      if (it.url) lines.push(`  ${it.url}`);
    }
  };
  block('Still failing at its last run, so it needs a look:', items.filter((i) => i.still));
  block('Failed during the week, but its last run worked:', items.filter((i) => !i.still));
  const gaps = [];
  if (health.github && !health.github.ok) gaps.push('GitHub jobs could not be checked: ' + health.github.error);
  if (health.cloud && !health.cloud.ok) gaps.push('Cloud jobs could not be checked: ' + health.cloud.error);
  if (gaps.length) lines.push('', ...gaps);
  lines.push('', 'Every job, with what it does: https://nl.tools/estate/');
  return { subject, text: lines.join('\n').replace(/^\n+/, ''), failing: n };
}
const ddmm = (t) => new Date(t).toISOString().slice(0, 10).split('-').reverse().join('/');
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1).replace(/\.$/, '');

/* ------------------------------------------------------------------ I/O */

async function getJson(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}

async function githubRuns(since) {
  const out = [];
  const head = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) head.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  for (let page = 1; page <= 20; page++) {
    const j = await getJson(`https://api.github.com/repos/${REPO}/actions/runs?per_page=100&page=${page}&created=%3E%3D${since}`, { headers: head });
    out.push(...(j.workflow_runs || []));
    if (!j.workflow_runs || j.workflow_runs.length < 100) break;
  }
  return out;
}

async function cloud(token, since) {
  const head = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const sched = [];
  for (const loc of REGIONS) {
    const j = await getJson(`https://cloudscheduler.googleapis.com/v1/projects/${PROJECT}/locations/${loc}/jobs?pageSize=500`, { headers: head });
    sched.push(...(j.jobs || []));
  }
  const entries = [];
  let pageToken = '', capped = false;
  for (let i = 0; i < 10; i++) {
    const j = await getJson('https://logging.googleapis.com/v2/entries:list', { method: 'POST', headers: head, body: JSON.stringify({
      resourceNames: ['projects/' + PROJECT],
      filter: `resource.type="cloud_scheduler_job" AND severity>=ERROR AND timestamp>="${since}T00:00:00Z"`,
      orderBy: 'timestamp desc', pageSize: 1000, pageToken: pageToken || undefined
    }) });
    entries.push(...(j.entries || []));
    pageToken = j.nextPageToken || '';
    if (!pageToken) break;
    if (i === 9) capped = true;
  }
  return { sched, entries, capped };
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const now = Date.now();
  const since = new Date(now - 7 * DAY).toISOString().slice(0, 10);
  const due = args.includes('--note') || new Date(now).getUTCDay() === 1;
  const health = { at: now, since, version: VERSION };

  try { health.github = { ok: true, jobs: summariseGitHub(await githubRuns(since)) }; }
  catch (e) { health.github = { ok: false, error: 'GitHub said ' + e.message, jobs: {} }; }

  const token = process.env.GCP_TOKEN;
  if (!token) health.cloud = { ok: false, error: 'no Google sign-in', jobs: {} };
  else {
    try {
      const c = await cloud(token, since);
      health.cloud = { ok: true, jobs: summariseCloud(c.sched, c.entries), capped: c.capped };
    } catch (e) {
      health.cloud = { ok: false, jobs: {}, error: e.status === 403
        ? 'this job is not allowed to read Cloud Scheduler or the logs (see the run log for the fix)' : 'Google said ' + e.message };
    }
  }

  const estate = JSON.parse(readFileSync(new URL('../system/estate.json', import.meta.url), 'utf8'));
  const does = {};
  for (const [k, v] of Object.entries(estate.items || {})) if (v && v.does) does[k] = v.does;
  const note = composeNote(health, does);
  health.note = { subject: note.subject, text: note.text, due };

  const g = Object.values(health.github.jobs), c = Object.values(health.cloud.jobs);
  console.log(`GitHub: ${health.github.ok ? `${g.length} jobs, ${g.filter((j) => j.failed).length} with a failure` : 'not checked'}`);
  console.log(`Cloud:  ${health.cloud.ok ? `${c.length} timed jobs, ${c.filter((j) => j.failed || (j.last && !j.last.ok)).length} with a failure` : 'not checked'}`);
  console.log(`Note:   ${note.failing} failing; ${due ? 'due to send' : 'not due today'}`);

  if (write) {
    if (!token) throw new Error('--write needs GCP_TOKEN');
    const res = await fetch(`${RTDB}/${PATH}.json`, { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(health) });
    if (!res.ok) throw new Error('Writing the result: HTTP ' + res.status);
    console.log('Written.');
  }
  if (!health.cloud.ok && /not allowed/.test(health.cloud.error)) {
    /* The note says so too, so it reaches the inbox; this is the fix. */
    console.log('To let this job read the cloud jobs, once: IAM → nl-archive-ga-reader → add the roles');
    console.log('Cloud Scheduler Viewer and Logs Viewer:');
    console.log('  https://console.cloud.google.com/iam-admin/iam?project=nl-tools&authuser=media%40thenationalleague.org.uk');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
