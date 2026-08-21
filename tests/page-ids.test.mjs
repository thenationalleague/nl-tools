/* Duplicate element ids, across every page in the estate.

   Written after breaking the handbook with one: a new action bar was given
   `id="ceBar"`, which the top toolbar had held all along. `$('ceBar')` then
   returned the toolbar, and the code that hides the action bar when nothing
   is selected hid the Read/Edit switch instead — on every render, so the
   buttons appeared for half a second on load and then vanished.

   That failure is worth a guard because of its shape rather than its size:

     · it is silent. The HTML is valid, nothing throws, and the browser hands
       back the FIRST match without complaint.
     · it fires at a distance. The symptom was in a control the change never
       touched, so the obvious place to look was the wrong place.
     · a single-file tool page runs to 1,700 lines. Nobody is holding every
       id in their head, and grep only helps if you think to grep.

   Comments are stripped before scanning. Most apparent duplicates in this
   repo are a real element plus a mention of it in a header comment
   documenting the structure — which is good practice, not a bug, and a
   checker that flagged it would be turned off within a week.

   Ids built from a template (`id="c-' + node.id + '"`) are skipped: they are
   unique at runtime and the source has no way to know it. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO } from './load-canon.mjs';

/* Known duplicates, each one a promise to come back — the same posture as
   system/_template/.lint-waivers. They are listed so a NEW one fails the
   build; they are not blessed. Every entry is a real duplicate in a live
   tool, and each is a latent version of the handbook bug: whichever element
   the code reaches for, it will always get the first. */
const KNOWN = {
  'fixtures/index.html': ['fxEffD', 'fxEffT', 'fxNote'],
  'holiday-lieu/index.html': ['alStart', 'lieuStart'],
  'travel-planner/index.html': ['routeMap'],
  'vacancies/index.html': ['vacTableBody', 'sfName', 'sfRole', 'sfEmail'],
  'wellbeing-map/index.html': ['nLab', 'rtMount', 'nBlock', 'nDel'],
};

const SKIP_DIRS = new Set(['node_modules', '.git', '_vendor']);

function pages(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { pages(full, out); continue; }
    if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

function duplicateIds(src) {
  const stripped = src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const seen = new Map();
  for (const m of stripped.matchAll(/\sid="([^"]*)"/g)) {
    const id = m[1];
    if (!id || /['+${]/.test(id)) continue;   // template-built, unique at runtime
    seen.set(id, (seen.get(id) || 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([id]) => id).sort();
}

const FILES = pages(REPO).filter((f) => !relative(REPO, f).startsWith('system/_template'));

test('every page is scanned — the walker has not silently found nothing', () => {
  /* A guard that finds no files passes forever. */
  assert.ok(FILES.length > 40, `expected the estate, found ${FILES.length} pages`);
});

for (const file of FILES) {
  const rel = relative(REPO, file).split('\\').join('/');
  test(`no new duplicate ids in ${rel}`, () => {
    const found = duplicateIds(readFileSync(file, 'utf8'));
    const allowed = KNOWN[rel] || [];
    const fresh = found.filter((id) => !allowed.includes(id));
    assert.deepEqual(fresh, [],
      `${rel} has duplicate id(s): ${fresh.join(', ')}. ` +
      'document.getElementById returns the FIRST one, so whichever piece of ' +
      'code reaches for it will silently get the wrong element. Rename one.');
  });
}

test('the waiver list has no stale entries', () => {
  /* A waiver that outlives its duplicate is a note telling the next person a
     bug exists where it does not. */
  for (const [rel, ids] of Object.entries(KNOWN)) {
    const found = duplicateIds(readFileSync(join(REPO, rel), 'utf8'));
    for (const id of ids) {
      assert.ok(found.includes(id),
        `${rel}: "${id}" is waived but is no longer duplicated — drop it from KNOWN.`);
    }
  }
});
