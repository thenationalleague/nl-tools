/* Brand Exposure scan requests — unit tests for the pure logic in
   functions/brand-exposure-scan.js.

   The Firebase-dependent half (the trigger, the poller, the Run Admin API
   calls) needs the emulator or a live run; what IS pinned here is every
   decision the function makes before it touches anything:

     · validRequest — the gate whose sharpest tooth is VIDEO_PATH. The
                      function deletes req.video with Admin credentials on
                      success and at sweep time, so an unconstrained path is
                      an arbitrary-object-delete primitive against a bucket
                      that holds the unrebuildable GA archive. Fail-closed
                      cases are the point.
     · buildEnv     — the env contract with scan-job/run_job.py, name for
                      name. A silently dropped BE_SPONSORS would scan (and
                      bill) the full reference tree; a defaulted-complete
                      reference set would invent share of voice.
     · verdictOf    — Execution → running|done|failed. Fixtures are derived
                      from the REST doc (URL in the source), NOT from a live
                      call — they prove consistency with the doc, which is
                      exactly as far as they go.
     · oldestQueued — the serial queue's ordering. Two requests swapping
                      places would scan someone's match before the one ahead
                      of it, which is the kind of wrong nobody reports.

   Same source-lifting trick as brand-exposure-ingest.test.mjs: the function
   file requires firebase-functions at module load, which is not installed at
   the repo root, so the pure helpers are lifted out of the SHIPPED source
   text — drift between these tests and the real file fails rather than
   passing against a stale copy. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

function lift(relPath, fnNames, constNames = []) {
  const src = readFileSync(join(ROOT, relPath), 'utf8');

  const block = (startIdx, label) => {
    assert.ok(startIdx >= 0, relPath + ' no longer defines ' + label);
    let depth = 0, j = src.indexOf('{', startIdx);
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) { j++; break; }
    }
    return src.slice(startIdx, j);
  };

  const consts = constNames.map((name) => {
    const i = src.indexOf('const ' + name + ' =');
    assert.ok(i >= 0, relPath + ' no longer defines ' + name);
    const end = src.indexOf('\n', i);
    return src.slice(i, end);
  });
  const bodies = fnNames.map((name) =>
    block(src.indexOf('function ' + name + '('), name));

  return eval('(function(){' + consts.join('\n') + '\n' + bodies.join('\n') +
    '\nreturn {' + fnNames.join(',') + '};})')();
}

const be = lift(
  'functions/brand-exposure-scan.js',
  ['validRequest', 'buildEnv', 'verdictOf', 'oldestQueued', 'failureNote',
   'shouldDeleteSource', 'stageOnLaunch', 'stageOnDone', 'othersWantVideo',
   'failedSharers', 'dismissalPlan', 'matchPrefixOf', 'othersOwnDest',
   'auditionFiles'],
  ['VIDEO_PATH']
);

const GOOD = {
  video: 'uploads/Sutton v Altrincham 18Apr26.mp4',
  club: 'Sutton United',
  match: 'Sutton United v Altrincham',
  date: '2026-04-18',
  status: 'queued',
  by: 'uid-1',
  at: 1,
};

// --- validRequest: the delete-primitive gate --------------------------------

test('a complete request passes', () => {
  assert.equal(be.validRequest(GOOD), null);
});

test('video outside uploads/ is refused — every traversal shape', () => {
  for (const video of [
    'data/ga-hourly-archive.json',          // the unrebuildable one
    'brand-exposure/x/proxy.mp4',           // another tool's output
    'uploads/../data/ga-hourly-archive.json',
    'uploads/deep/er.mp4',                  // no second segment
    'uploads/',                             // no object at all
    '',                                     //
    'Uploads/x.mp4',                        // case is not a loophole
  ]) {
    const r = { ...GOOD, video };
    assert.ok(be.validRequest(r), 'must refuse video=' + JSON.stringify(video));
  }
});

test('spaces and ampersands in the filename are fine — Richard names files that way', () => {
  assert.equal(be.validRequest(
    { ...GOOD, video: 'uploads/Horsham v Hampton & Richmond 18Aug26.mp4' }),
  null);
});

test('missing club, match or a malformed date are each refused', () => {
  assert.ok(be.validRequest({ ...GOOD, club: ' ' }));
  assert.ok(be.validRequest({ ...GOOD, match: '' }));
  assert.ok(be.validRequest({ ...GOOD, date: '18/04/2026' }));
  assert.ok(be.validRequest({ ...GOOD, date: '2026-4-18' }));
});

test('sponsors must be a list when present, and may be absent', () => {
  assert.ok(be.validRequest({ ...GOOD, sponsors: 'DAZN' }));
  assert.equal(be.validRequest({ ...GOOD, sponsors: ['DAZN'] }), null);
  assert.equal(be.validRequest({ ...GOOD, sponsors: null }), null);
});

test('null and non-object requests are refused, not thrown on', () => {
  assert.ok(be.validRequest(null));
  assert.ok(be.validRequest('scan please'));
});

// --- buildEnv: the run_job.py contract --------------------------------------

const envMap = (req) =>
  Object.fromEntries(be.buildEnv(req).map((e) => [e.name, e.value]));

test('the five always-present envs match run_job.py names and values', () => {
  const m = envMap(GOOD);
  assert.equal(m.BE_VIDEO, GOOD.video);
  assert.equal(m.BE_CLUB, 'Sutton United');
  assert.equal(m.BE_MATCH, 'Sutton United v Altrincham');
  assert.equal(m.BE_DATE, '2026-04-18');
  assert.equal(m.BE_REFERENCE_SET, 'partial');
});

test('reference set defaults to partial — the direction that withholds share of voice', () => {
  assert.equal(envMap({ ...GOOD, referenceSet: 'complete' }).BE_REFERENCE_SET,
    'complete');
  assert.equal(envMap({ ...GOOD, referenceSet: 'yes please' }).BE_REFERENCE_SET,
    'partial');
  assert.equal(envMap(GOOD).BE_REFERENCE_SET, 'partial');
});

test('sponsors join to the comma list load_tree parses; empty list sends nothing', () => {
  assert.equal(envMap({ ...GOOD, sponsors: ['DAZN', 'TIC Health'] }).BE_SPONSORS,
    'DAZN,TIC Health');
  assert.ok(!('BE_SPONSORS' in envMap({ ...GOOD, sponsors: [] })));
  assert.ok(!('BE_SPONSORS' in envMap(GOOD)));
});

test('the source switcher passes through only its two legal values', () => {
  assert.equal(envMap({ ...GOOD, source: 'full' }).BE_SOURCE_TYPE, 'full');
  assert.equal(envMap({ ...GOOD, source: 'highlights' }).BE_SOURCE_TYPE,
    'highlights');
  /* Anything else stays absent so the script derives from duration — a
     freeform value would land in argparse choices and kill the scan. */
  assert.ok(!('BE_SOURCE_TYPE' in envMap({ ...GOOD, source: 'Full match' })));
  assert.ok(!('BE_SOURCE_TYPE' in envMap(GOOD)));
});

test('trims ride along only when set', () => {
  const m = envMap({ ...GOOD, start: '18:30', end: '1:52:30' });
  assert.equal(m.BE_START, '18:30');
  assert.equal(m.BE_END, '1:52:30');
  assert.ok(!('BE_START' in envMap(GOOD)));
});

test('half-time marks travel as a pair or not at all', () => {
  const m = envMap({ ...GOOD, ht: '45:10', restart: '1:01:30' });
  assert.equal(m.BE_HT, '45:10');
  assert.equal(m.BE_RESTART, '1:01:30');
  assert.ok(!('BE_HT' in envMap(GOOD)));
  /* One without the other never reaches the job — and validRequest refuses
     the request outright, so a lone mark fails visibly at creation. */
  assert.ok(!('BE_HT' in envMap({ ...GOOD, ht: '45:10' })));
  assert.ok(be.validRequest({ ...GOOD, ht: '45:10' }));
  assert.ok(be.validRequest({ ...GOOD, restart: '1:01:30' }));
  assert.equal(be.validRequest({ ...GOOD, ht: '45:10', restart: '1:01:30' }),
    null);
});

test('every env value is a string — the Run API rejects numbers', () => {
  for (const e of be.buildEnv({ ...GOOD, start: 1110 })) {
    assert.equal(typeof e.value, 'string', e.name);
  }
});

// --- verdictOf: doc-derived Execution fixtures ------------------------------

test('no completionTime means still running, whatever the counts say', () => {
  assert.equal(be.verdictOf({ name: 'x' }), 'running');
  assert.equal(be.verdictOf({ succeededCount: 1 }), 'running');
  assert.equal(be.verdictOf(null), 'running');
});

test('completionTime plus a succeeded task is done; without one, failed', () => {
  assert.equal(be.verdictOf(
    { completionTime: '2026-08-30T20:00:00Z', succeededCount: 1 }), 'done');
  assert.equal(be.verdictOf(
    { completionTime: '2026-08-30T20:00:00Z', failedCount: 1 }), 'failed');
  assert.equal(be.verdictOf(
    { completionTime: '2026-08-30T20:00:00Z' }), 'failed');
});

test('failureNote names the execution when it can and stays calm when it cannot', () => {
  assert.match(be.failureNote(
    { name: 'projects/p/locations/l/jobs/j/executions/scan-abc12' }),
  /scan-abc12/);
  assert.ok(be.failureNote(null).length > 0);
});

// --- oldestQueued: the serial queue's ordering ------------------------------

test('picks the oldest queued request and ignores every other status', () => {
  assert.equal(be.oldestQueued({
    a: { status: 'done', at: 1 },
    b: { status: 'queued', at: 30 },
    c: { status: 'queued', at: 20 },
    d: { status: 'running', at: 2 },
    e: { status: 'failed', at: 3 },
  }), 'c');
});

test('empty, null and no-queued all yield null', () => {
  assert.equal(be.oldestQueued({}), null);
  assert.equal(be.oldestQueued(null), null);
  assert.equal(be.oldestQueued({ a: { status: 'done', at: 1 } }), null);
});

test('a request with no timestamp sorts first rather than never', () => {
  assert.equal(be.oldestQueued({
    a: { status: 'queued', at: 5 },
    b: { status: 'queued' },
  }), 'b');
});

/* ---- Audition mode (v0.13): the tool launches auditions, not Cloud Shell */

test('audition mode needs a well-formed destination folder', () => {
  assert.equal(be.validRequest({ ...GOOD, mode: 'audition',
    dest: 'brand-exposure/2026-08-18-horsham-v-hampton-and-richmond' }), null);
  assert.match(String(be.validRequest({ ...GOOD, mode: 'audition' })),
    /destination/);
  assert.match(String(be.validRequest({ ...GOOD, mode: 'audition',
    dest: 'uploads/evil' })), /destination/);
  assert.match(String(be.validRequest({ ...GOOD, mode: 'audition',
    dest: 'brand-exposure/x/../../data' })), /destination/);
});

test('unknown modes are refused, absent and scan pass', () => {
  assert.equal(be.validRequest({ ...GOOD }), null);
  assert.equal(be.validRequest({ ...GOOD, mode: 'scan' }), null);
  assert.match(String(be.validRequest({ ...GOOD, mode: 'sweep' })), /mode/);
});

test('buildEnv sends BE_MODE and BE_DEST for auditions only', () => {
  const dest = 'brand-exposure/2026-08-18-horsham-v-hampton-and-richmond';
  const aud = be.buildEnv({ ...GOOD, mode: 'audition', dest });
  const names = aud.map((e) => e.name);
  assert.ok(names.includes('BE_MODE'));
  assert.equal(aud.find((e) => e.name === 'BE_DEST').value, dest);
  const scan = be.buildEnv({ ...GOOD });
  assert.ok(!scan.some((e) => e.name === 'BE_MODE' || e.name === 'BE_DEST'));
});

test('an audition never surrenders its source; everything else does', () => {
  assert.equal(be.shouldDeleteSource({ ...GOOD, mode: 'audition' }), false);
  assert.equal(be.shouldDeleteSource({ ...GOOD }), true);
  assert.equal(be.shouldDeleteSource({ ...GOOD, mode: 'scan' }), true);
});

test('the stage spine names each mode honestly', () => {
  assert.equal(be.stageOnLaunch({ mode: 'audition' }), 'auditioning');
  assert.equal(be.stageOnLaunch({}), 'scanning');
  assert.equal(be.stageOnDone({ mode: 'audition' }), 'review');
  assert.equal(be.stageOnDone({}), 'measured');
});

/* ---- Shared source lifecycle (31/08/2026): a sibling's delete must not
   strand another request, and a deleted video must kill every doomed
   Retry, not just the sweeper's own. The Southend scan hit both halves:
   its source vanished under it, then its failed card offered a retry of
   footage that no longer existed. */

const V = 'uploads/Southend v Kidderminster 28Aug26.mp4';

test('a queued or running sharer blocks the delete; terminal ones do not', () => {
  assert.equal(be.othersWantVideo({
    a: { video: V, status: 'done' },
    b: { video: V, status: 'queued' },
  }, 'a'), true);
  assert.equal(be.othersWantVideo({
    a: { video: V, status: 'done' },
    b: { video: V, status: 'running' },
  }, 'a'), true);
  assert.equal(be.othersWantVideo({
    a: { video: V, status: 'done' },
    b: { video: V, status: 'failed' },
    c: { video: V, status: 'done' },
  }, 'a'), false);
});

test('only the same video counts, and never the request itself', () => {
  assert.equal(be.othersWantVideo({
    a: { video: V, status: 'queued' },
    b: { video: 'uploads/other.mp4', status: 'queued' },
  }, 'a'), false);
  assert.equal(be.othersWantVideo({ a: { status: 'done' } }, 'a'), false);
  assert.equal(be.othersWantVideo({}, 'a'), false);
});

test('failedSharers finds every unswept failed sharer and nothing else', () => {
  const reqs = {
    a: { video: V, status: 'done' },
    b: { video: V, status: 'failed' },            // doomed retry — stamp it
    c: { video: V, status: 'failed', swept: 5 },  // already honest
    d: { video: V, status: 'queued' },            // not terminal — leave it
    e: { video: 'uploads/other.mp4', status: 'failed' },
  };
  assert.deepEqual(be.failedSharers(reqs, 'a'), ['b']);
  assert.deepEqual(be.failedSharers({ a: { status: 'failed' } }, 'a'), []);
});

/* ---- Dismissal (v0.22): the tool flags, the poller settles ---------------- */

const DEST = 'brand-exposure/2026-08-28-southend-v-kidderminster-aud';

test('a dismissed request owes its source unless a success already paid it', () => {
  const one = (r) => be.dismissalPlan({ a: r }, 'a');
  // cancelled before running: the upload landed and nothing else will clean it
  assert.equal(one({ video: V, status: 'cancelled', dismissed: 1 }).deleteSource, true);
  // failed inside the retry window: source still there
  assert.equal(one({ video: V, status: 'failed', dismissed: 1 }).deleteSource, true);
  // failed and swept: already gone
  assert.equal(one({ video: V, status: 'failed', swept: 2, dismissed: 1 }).deleteSource, false);
  // done scan: success deleted it
  assert.equal(one({ video: V, status: 'done', dismissed: 1 }).deleteSource, false);
  // done audition: the follow-up scan is now never coming
  assert.equal(one({ video: V, status: 'done', mode: 'audition', dest: DEST,
    dismissed: 1 }).deleteSource, true);
});

test('a live sibling keeps the source; the audition harvest goes regardless', () => {
  const plan = be.dismissalPlan({
    a: { video: V, status: 'done', mode: 'audition', dest: DEST, dismissed: 1 },
    b: { video: V, status: 'queued' },  // the follow-up scan — needs the file
  }, 'a');
  assert.equal(plan.deleteSource, false);
  assert.equal(plan.destPrefix, DEST + '/');
});

test('no plan for the undismissed, the running, or the missing', () => {
  assert.equal(be.dismissalPlan({ a: { video: V, status: 'failed' } }, 'a'), null);
  assert.equal(be.dismissalPlan(
    { a: { video: V, status: 'running', dismissed: 1 } }, 'a'), null);
  assert.equal(be.dismissalPlan({}, 'a'), null);
});

test('a malformed audition dest never becomes a delete prefix', () => {
  const plan = be.dismissalPlan({ a: { video: V, status: 'done',
    mode: 'audition', dest: 'brand-exposure/x/../../refs', dismissed: 1 } }, 'a');
  assert.equal(plan.destPrefix, null);
});

/* ---- The shared match folder (02/09/2026) ---------------------------------
   An audition's dest IS the match folder. A retry writes into it again and
   the measured match's proxy and detections live there, so a dismissal
   clears only the audition's own files, and not while another request
   still owns the dest. Found with a failed Harrogate audition sitting
   beside its measured scan, Remove on offer. */

test('a retry that owns the same dest keeps the harvest folder off the plan', () => {
  const reqs = {
    a: { video: V, status: 'failed', mode: 'audition', dest: DEST, dismissed: 1 },
    b: { video: V, status: 'queued', mode: 'audition', dest: DEST },  // the retry
  };
  assert.equal(be.othersOwnDest(reqs, 'a'), true);
  const plan = be.dismissalPlan(reqs, 'a');
  assert.equal(plan.deleteSource, false);   // the retry still needs the footage
  assert.equal(plan.destPrefix, null);      // and its harvest is not a's to clear
});

test('a dismissed sibling does not own the dest; a dest-less one never did', () => {
  assert.equal(be.othersOwnDest({
    a: { dest: DEST, dismissed: 1 },
    b: { dest: DEST, dismissed: 2 },
  }, 'a'), false);
  assert.equal(be.othersOwnDest({
    a: { dest: DEST, dismissed: 1 },
    b: { video: V, status: 'queued' },
  }, 'a'), false);
  assert.equal(be.othersOwnDest({ a: { dismissed: 1 } }, 'a'), false);
  // the last owner standing still clears its own harvest
  assert.equal(be.dismissalPlan({
    a: { video: V, status: 'done', mode: 'audition', dest: DEST, dismissed: 1 },
    b: { video: V, status: 'done', mode: 'audition', dest: DEST, dismissed: 2 },
  }, 'a').destPrefix, DEST + '/');
});

test('auditionFiles keeps the audition’s own files and nothing the match owns', () => {
  const names = [
    DEST + '/audition.json',
    DEST + '/audition-enterprise-14s-31i.png',
    DEST + '/audition-wide-enterprise-101s-8i.png',
    DEST + '/audition-relaxed-tic-health-40s-5i.png',
    DEST + '/proxy.mp4',
    DEST + '/detections.json',
    DEST + '/diagnose.json',
    DEST + '/audition.json.bak',
    DEST + '/nested/audition.json',
    'brand-exposure/refs/partners/DAZN/audition-lookalike.png',
  ];
  assert.deepEqual(be.auditionFiles(names), names.slice(0, 4));
  assert.deepEqual(be.auditionFiles([]), []);
  assert.deepEqual(be.auditionFiles(undefined), []);
});

/* ---- Match cleanup: the prefix guard -------------------------------------- */

test('only a dated matchId names a storage prefix', () => {
  assert.equal(be.matchPrefixOf('2026-08-28-southend-united-v-kidderminster-harriers'),
    'brand-exposure/2026-08-28-southend-united-v-kidderminster-harriers/');
  // refs and every traversal shape stay unreachable
  for (const id of ['refs', 'refs/partners', '2026-08-28-x/../refs',
                    '', null, 'Southend v Kidderminster', '2026-08-28']) {
    assert.equal(be.matchPrefixOf(id), null, 'must refuse ' + JSON.stringify(id));
  }
});
