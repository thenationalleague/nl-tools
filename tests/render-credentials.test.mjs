/* The handbook renderer's credential path — guarded by reading the SOURCE,
   because the thing that keeps breaking is not logic, it is which API exists.

   Two consecutive runs failed on this, each fix written from memory of the
   firebase-admin v9 namespace API and shipped without checking the installed
   package:

     · `admin.apps.length`   → "Cannot read properties of undefined"
     · `admin.auth()`        → "admin.auth is not a function"

   Both reported themselves as CREDENTIALS failures, on a runner whose
   credentials were fine, because the catch that logs them cannot tell a
   missing Google permission from a missing JavaScript property. That is the
   expensive part: the diagnosis pointed at an IAM grant that was never needed.

   firebase-admin has been modular-only since v13. Its root export is:

     applicationDefault, cert, deleteApp, getApp, getApps, initializeApp,
     refreshToken   (+ error classes, SDK_VERSION)

   No auth, no database, no app, no apps. Everything else lives behind a
   subpath — firebase-admin/app, /database.

   The chase ended somewhere better than it started. The third failure was a
   real permission — iam.serviceAccounts.signBlob — and it stayed denied on a
   service account that ALREADY held Service Account Token Creator. Rather
   than a fifth round of console-fiddling on a phone, the custom token was
   removed altogether: this job already reads the edition with admin access,
   so it hands the page the DATA instead of a credential to go and fetch the
   same data a second time. Fewer moving parts, and nothing an IAM policy can
   take away.

   These tests do not need the package installed, which is the point: they run
   in the normal suite, on every PR, and fail the moment the file reaches for
   the old shape again. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = readFileSync(join(ROOT, 'scripts/render-handbook-pdf.js'), 'utf8');
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/render-handbook-pdf.yml'), 'utf8');

/* Comments in this file legitimately NAME the removed APIs, to explain why
   they are removed. Strip them, or the guard fails on its own documentation. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const REMOVED = [
  ['admin.apps',      /\badmin\s*\.\s*apps\b/],
  ['admin.app(',      /\badmin\s*\.\s*app\s*\(/],
  ['admin.auth(',     /\badmin\s*\.\s*auth\s*\(/],
  ['admin.database(', /\badmin\s*\.\s*database\s*\(/],
  ['.database() on an app', /\bAdminApp\s*\.\s*database\s*\(|adminApp\s*\.\s*database\s*\(/],
];

for (const [name, re] of REMOVED) {
  test('the renderer does not use ' + name + ' — removed in firebase-admin v13', () => {
    assert.ok(!re.test(CODE),
      name + ' is not on the root namespace any more. Use the subpath: ' +
      "require('firebase-admin/app') / '/auth' / '/database'.");
  });
}

test('the renderer imports the modular subpaths it actually needs', () => {
  /* Two, not three. /auth went with the custom token — see below. This test
     asserted it was present and failed the moment the token was removed,
     which is a guard doing its job on itself. */
  assert.match(CODE, /require\(['"]firebase-admin\/app['"]\)/);
  assert.match(CODE, /require\(['"]firebase-admin\/database['"]\)/);
});

test('the app is initialised with an explicit credential', () => {
  /* applicationDefault() reads the ADC file the auth step exports. Leaving the
     credential off works on some surfaces and not on a bare runner, and the
     failure looks like a permissions problem rather than a missing argument —
     which is the same wrong-target diagnosis this whole file exists to stop. */
  assert.match(CODE, /applicationDefault\s*\(\s*\)/);
});

test('the renderer mints no custom token at all', () => {
  /* Removed 21/08/2026. Minting one needed iam.serviceAccounts.signBlob,
     which stayed denied on a service account that already held Service
     Account Token Creator — four rounds of console-fiddling for a permission
     that was never the problem. The page is handed the edition this job has
     already read instead, which is fewer moving parts than authenticating a
     second time to fetch the same thing, and cannot be revoked by an IAM
     policy. */
  assert.ok(!/createCustomToken/.test(CODE),
    'the renderer should hand the page DATA, not a credential');
  assert.ok(!/firebase-admin\/auth/.test(CODE),
    'the auth subpath is not needed once no token is minted');
});

test('the edition is handed to the page, before its own scripts run', () => {
  assert.match(CODE, /evaluateOnNewDocument/);
  assert.match(CODE, /__NL_EDITION/);
});

test('print.html reads the injected edition and falls back to RTDB', () => {
  /* Two callers: the renderer is handed the data, a club reads it through the
     rules like anyone else. Losing the second branch would break Download PDF
     for every club while the render kept working — invisible from CI. */
  const PRINT = readFileSync(join(ROOT, 'handbook/print.html'), 'utf8');
  assert.match(PRINT, /window\.__NL_EDITION/);
  assert.match(PRINT, /publishedEditionId/);
});

test('the admin app is closed, or the job never exits', () => {
  /* getDatabase() opens a persistent websocket. Node exits when the event
     loop drains, so that single handle hangs the step forever: the render
     finishes, the PDF is written, the log says so, and the runner sits there
     until the job timeout. Cost eleven minutes and a cancelled run to find,
     on a job every previous instance of which took 60-90 seconds.

     Must be in main's FINALLY, so a failed render cleans up too — a hang
     after an error is worse than the error. */
  assert.match(CODE, /deleteApp\s*\(/,
    'close the admin app or the process cannot exit');
  const finallyBlock = CODE.slice(CODE.lastIndexOf('} finally {'));
  assert.match(finallyBlock, /closeCredentials\s*\(\s*\)/,
    'the close must run in the finally, not only on the success path');
});

test('firebase-admin is pinned to a major version in the workflow', () => {
  /* Unpinned, `npm install firebase-admin` takes whatever is newest. v13
     removed the namespace API without this repo noticing; the next major can
     do the same to the modular one. A pin turns that from a silent 4am
     failure into a deliberate upgrade. */
  assert.match(WORKFLOW, /firebase-admin@\^?\d+/,
    'pin firebase-admin in the install step so a new major cannot land unannounced');
});
