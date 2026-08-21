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
   subpath — firebase-admin/app, /auth, /database.

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
  assert.match(CODE, /require\(['"]firebase-admin\/app['"]\)/);
  assert.match(CODE, /require\(['"]firebase-admin\/auth['"]\)/);
  assert.match(CODE, /require\(['"]firebase-admin\/database['"]\)/);
});

test('the app is initialised with an explicit credential', () => {
  /* applicationDefault() reads the ADC file the auth step exports. Leaving the
     credential off works on some surfaces and not on a bare runner, and the
     failure looks like a permissions problem rather than a missing argument —
     which is the same wrong-target diagnosis this whole file exists to stop. */
  assert.match(CODE, /applicationDefault\s*\(\s*\)/);
});

test('the custom token carries the wildcard club claim the rules read', () => {
  /* `club: '*'` is the same wildcard pClub uses, so a rule written for one
     reads the other without a second branch. A different spelling here would
     leave the renderer authenticated and still denied. */
  assert.match(CODE, /createCustomToken\([^)]*\{\s*club:\s*['"]\*['"]\s*\}/);
});

test('the token never reaches a URL', () => {
  /* It is injected as a page variable. A query parameter would land in the
     Actions log, in any proxy log in front of it, and in the history of
     anyone handed the link. */
  assert.match(CODE, /evaluateOnNewDocument/);
  assert.ok(!/renderToken[^\n]*(\?|&)[a-z]+=/i.test(CODE),
    'the render token must not be appended to a URL');
});

test('firebase-admin is pinned to a major version in the workflow', () => {
  /* Unpinned, `npm install firebase-admin` takes whatever is newest. v13
     removed the namespace API without this repo noticing; the next major can
     do the same to the modular one. A pin turns that from a silent 4am
     failure into a deliberate upgrade. */
  assert.match(WORKFLOW, /firebase-admin@\^?\d+/,
    'pin firebase-admin in the install step so a new major cannot land unannounced');
});
