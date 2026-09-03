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
   'auditionFiles', 'progressPath', 'progressFrom', 'refKey', 'refPath',
   'tallyScan', 'tallyAudition', 'mergeTally', 'retirements', 'excludeFor'],
  ['VIDEO_PATH', 'DEST_PATH', 'MIN_RUNS']
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

/* ---- Real progress (v0.34): the job's row, relayed, copied, drawn ---------- */

test('buildEnv hands the job its request id and a progress path, given an id', () => {
  const m = Object.fromEntries(be.buildEnv(GOOD, '-Oabc_123').map((e) => [e.name, e.value]));
  assert.equal(m.BE_REQUEST, '-Oabc_123');
  assert.equal(m.BE_PROGRESS, 'brand-exposure/progress/-Oabc_123.json');
  // no id, no progress envs — the old contract exactly
  assert.ok(!be.buildEnv(GOOD).some((e) => e.name === 'BE_PROGRESS'));
});

test('progressPath is a delete primitive and accepts only a plain key', () => {
  assert.equal(be.progressPath('-Oabc_123'), 'brand-exposure/progress/-Oabc_123.json');
  for (const bad of ['', null, 'a/b', '../refs', 'x'.repeat(65), 'a b', 'refs/partners']) {
    assert.equal(be.progressPath(bad), null, JSON.stringify(bad));
  }
});

test('progressFrom takes the row the job writes and nothing else', () => {
  const row = { phase: 'scan', done: 214, total: 370, at: 1756800000.5, phase_at: 1756799400 };
  assert.deepEqual(be.progressFrom(JSON.stringify(row)), row);
  assert.deepEqual(be.progressFrom(JSON.stringify({ ...row, done: 214.9 })).done, 214);
  for (const bad of ['', '{', 'null', '[]', JSON.stringify({ ...row, phase: 3 }),
    JSON.stringify({ ...row, done: -1 }), JSON.stringify({ ...row, total: 'many' }),
    JSON.stringify({ ...row, at: null }), JSON.stringify({ phase: 'scan' })]) {
    assert.equal(be.progressFrom(bad), null, bad);
  }
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

test('a scan that names its dest gets the same audition-file sweep (03/09/2026)', () => {
  // Scans carry dest now; the audition that preceded them left audition-*.png
  // in the match folder, and auditionFiles keeps the match's own files safe.
  const plan = be.dismissalPlan({
    a: { video: V, status: 'done', mode: 'scan', dest: DEST, dismissed: 1 },
  }, 'a');
  assert.equal(plan.destPrefix, DEST + '/');
  // no dest, no sweep — requests from before the change
  assert.equal(be.dismissalPlan({ a: { video: V, status: 'done', dismissed: 1 } }, 'a').destPrefix, null);
});

/* ---- Reference records (03/09/2026) --------------------------------------
   One record per reference file per ground: runs, fired, frames only it
   found, retired. The tally comes from the run's own export; the
   retirement rule prunes per ground; BE_EXCLUDE carries the result. */

test('refKey encodes exactly the characters RTDB refuses, reversibly', () => {
  for (const s of ['DAZN artwork Follow your club.png', 'A.F.C. Fylde',
                   'clubs/Harrogate Town/Enterprise/cutout 1.png', '100% #1 [x] $y']) {
    const k = be.refKey(s);
    assert.ok(!/[.#$\[\]\/]/.test(k), 'still has a forbidden char: ' + k);
    assert.equal(decodeURIComponent(k), s);
  }
  assert.equal(be.refKey('a.b'), 'a%2Eb');
});

test('refPath is the string load_tree compares against .exclude', () => {
  assert.equal(be.refPath('Harrogate Town', 'Enterprise', 'partner', 'cad.png'),
    'partners/Enterprise/cad.png');
  assert.equal(be.refPath('Harrogate Town', 'Enterprise', 'club', 'cutout 1.png'),
    'clubs/Harrogate Town/Enterprise/cutout 1.png');
});

const EXPORT = {
  club: 'Harrogate Town',
  references: [
    { sponsor: 'Enterprise', scope: 'partner', file: 'cad.png' },
    { sponsor: 'Enterprise', scope: 'club', file: 'cutout 1.png' },
    { sponsor: 'DAZN', scope: 'partner', file: 'fyc.png' },
  ],
  hits: {
    // 0: both Enterprise files find the board — nobody's unique frame
    0: { Enterprise: [{ r: 'cad.png', n: 12 }, { r: 'cutout 1.png', n: 9 }] },
    // 1: only the cutout
    1: { Enterprise: [{ r: 'cutout 1.png', n: 8 }] },
    // 2: only the cutout again, plus a tracked hit that names nobody
    2: { Enterprise: [{ r: 'cutout 1.png', n: 8 }, { n: 0, t: 1 }] },
    // 3: a tracked-only frame is no file's evidence
    3: { Enterprise: [{ n: 0, t: 1 }] },
  },
};

test('tallyScan: runs from the reference list, fired and unique from attributed hits', () => {
  const t = be.tallyScan(EXPORT);
  assert.deepEqual(Object.keys(t).sort(), [
    'clubs/Harrogate Town/Enterprise/cutout 1.png',
    'partners/DAZN/fyc.png',
    'partners/Enterprise/cad.png',
  ]);
  assert.deepEqual(t['partners/Enterprise/cad.png'],
    { sponsor: 'Enterprise', path: 'partners/Enterprise/cad.png', scope: 'partner',
      runs: 1, fired: 1, unique: 0, file: 'cad.png' });
  assert.deepEqual(t['clubs/Harrogate Town/Enterprise/cutout 1.png'],
    { sponsor: 'Enterprise', path: 'clubs/Harrogate Town/Enterprise/cutout 1.png', scope: 'club',
      runs: 1, fired: 1, unique: 2, file: 'cutout 1.png' });
  // in the set, never fired: a run against it, nothing to its name
  assert.deepEqual(t['partners/DAZN/fyc.png'],
    { sponsor: 'DAZN', path: 'partners/DAZN/fyc.png', scope: 'partner',
      runs: 1, fired: 0, unique: 0, file: 'fyc.png' });
});

test('tallyScan: a hit naming a file outside the reference list is ignored, not invented', () => {
  const t = be.tallyScan({ club: 'X', references: [{ sponsor: 'E', scope: 'partner', file: 'a.png' }],
    hits: { 0: { E: [{ r: 'ghost.png', n: 9 }] } } });
  assert.deepEqual(Object.keys(t), ['partners/E/a.png']);
  assert.equal(t['partners/E/a.png'].fired, 0);
});

test('tallyAudition: the verdict rows already carry fired and unique', () => {
  const t = be.tallyAudition({ club: 'Harrogate Town', refs: [
    { sponsor: 'Enterprise', scope: 'partner', file: 'cad.png', fired: 18, unique: 3 },
    { sponsor: 'TIC Health', scope: 'partner', file: 'tic.png', fired: 0, unique: 0 },
  ] });
  assert.equal(t['partners/Enterprise/cad.png'].fired, 1);
  assert.equal(t['partners/Enterprise/cad.png'].unique, 3);
  assert.equal(t['partners/TIC Health/tic.png'].fired, 0);
  assert.equal(t['partners/TIC Health/tic.png'].runs, 1);
});

test('mergeTally adds a run to a record and touches nothing else', () => {
  const prev = { path: 'p', runs: 2, fired: 1, unique: 4, retired: 5, from: 'm1' };
  const next = be.mergeTally(prev, { runs: 1, fired: 1, unique: 0 }, 'm2', 99);
  assert.deepEqual(next, { runs: 3, fired: 2, unique: 4, lastRun: 'm2', lastAt: 99 });
  assert.equal(Object.assign({}, prev, next).retired, 5);
  assert.deepEqual(be.mergeTally(undefined, { runs: 1, fired: 0, unique: 0 }, 'm', 7),
    { runs: 1, fired: 0, unique: 0, lastRun: 'm', lastAt: 7 });
});

const rec = (runs, fired, unique, extra) => Object.assign({ runs, fired, unique }, extra || {});

test('retirements: two runs with nothing unique retires a file while another carries the sponsor', () => {
  const recs = { Enterprise: { cad: rec(2, 2, 0), cutout: rec(2, 2, 11) } };
  assert.deepEqual(be.retirements(recs), [['Enterprise', 'cad']]);
});

test('retirements: one run is not enough evidence; the floor is a parameter', () => {
  const recs = { Enterprise: { cad: rec(1, 0, 0), cutout: rec(1, 1, 5) } };
  assert.deepEqual(be.retirements(recs), []);
  assert.deepEqual(be.retirements(recs, 1), [['Enterprise', 'cad']]);
});

test('retirements: never a sponsor’s last file — duplicates keep the one that fired most', () => {
  const recs = { Enterprise: { a: rec(3, 3, 0), b: rec(3, 1, 0) } };
  assert.deepEqual(be.retirements(recs), [['Enterprise', 'b']]);
  // a lone dead file stays too: retiring it would leave the sponsor unmeasurable by design
  assert.deepEqual(be.retirements({ TIC: { only: rec(4, 0, 0) } }), []);
});

test('retirements: an already retired file is out of the reckoning', () => {
  const recs = { Enterprise: { a: rec(3, 3, 0, { retired: 1 }), b: rec(3, 1, 0) } };
  assert.deepEqual(be.retirements(recs), []);   // b is the last active file
});

test('excludeFor lists the retired paths, sorted, and nothing else', () => {
  const recs = {
    Enterprise: { a: { path: 'partners/Enterprise/a.png', retired: 1 },
                  b: { path: 'clubs/X/Enterprise/b.png' } },
    DAZN: { c: { path: 'partners/DAZN/c.png', retired: 2 }, d: { retired: 3 } },
  };
  assert.deepEqual(be.excludeFor(recs), ['partners/DAZN/c.png', 'partners/Enterprise/a.png']);
  assert.deepEqual(be.excludeFor(null), []);
});

test('buildEnv carries BE_EXCLUDE one path per line, and not at all when empty', () => {
  const withIt = Object.fromEntries(be.buildEnv(GOOD, 'req1', ['partners/DAZN/c.png', 'clubs/X/E/b.png'])
    .map((e) => [e.name, e.value]));
  assert.equal(withIt.BE_EXCLUDE, 'partners/DAZN/c.png\nclubs/X/E/b.png');
  const without = be.buildEnv(GOOD, 'req1', []).map((e) => e.name);
  assert.ok(!without.includes('BE_EXCLUDE'));
  assert.ok(!be.buildEnv(GOOD).some((e) => e.name === 'BE_EXCLUDE'));
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
