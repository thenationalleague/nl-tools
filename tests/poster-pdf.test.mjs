/* The Wellbeing Hub poster ships as a PDF, because a browser print dialog
   mangles the HTML (background graphics off by default, its own header and
   footer, fit-to-printable-area). wellbeing-hub/poster.pdf is therefore the
   artefact people actually print — and a committed artefact rendered from a
   committed source is a drift hazard: edit the HTML, forget the PDF, and the
   sheet on the wall is the old one with nothing to say so.

   A comment asking the next person to remember is not a guard. This is.    */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const HTML = 'wellbeing-hub/poster.html';
const PDF = 'wellbeing-hub/poster.pdf';

/* Last commit to touch a path, as a unix timestamp. */
function lastCommit(p) {
  const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', p], {
    cwd: REPO, encoding: 'utf8',
  }).trim();
  return out ? Number(out) : 0;
}

test('the poster PDF exists and is a single A4 page', () => {
  const abs = join(REPO, PDF);
  assert.ok(existsSync(abs), `${PDF} is missing — run scripts/render-wellbeing-poster.js`);
  const buf = readFileSync(abs);
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-', `${PDF} is not a PDF`);

  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.equal(pages, 1,
    `${PDF} has ${pages} pages — a dressing-room poster is one sheet; the layout has overflowed`);
});

/* Timestamps come from git, not the filesystem: a fresh clone gives every
   file the checkout time, so mtimes would make this test pass always. */
test('the poster PDF is not older than the HTML it was rendered from', () => {
  const html = lastCommit(HTML);
  const pdf = lastCommit(PDF);

  /* Both unknown means this is running somewhere without history (a shallow
     clone deep enough to miss them). Skip rather than fail on a guess. */
  if (!html || !pdf) return;

  assert.ok(pdf >= html,
    `${HTML} was committed ${Math.round((html - pdf) / 60)} min after ${PDF}.\n` +
    `The printed sheet no longer matches the source. Re-render it:\n` +
    `  npm install --no-save puppeteer-core\n` +
    `  python3 -m http.server 8899 --bind 127.0.0.1\n` +
    `  CHROME_PATH=<chrome> node scripts/render-wellbeing-poster.js`);
});
