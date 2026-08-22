/* lint-tools.sh itself.

   THE LINT WAS PASSING BECAUSE IT WAS CRASHING. `declare -a WAIVE_SLUG` sets
   the array attribute and creates nothing, so under `set -u` the guard
   written to handle an empty waiver list — ${#WAIVE_SLUG[@]} == 0 — was
   itself an unbound-variable error. is_waived() is only called when a page
   drifts, and nothing had drifted since the check was written, so it never
   fired. When it finally did, lint stopped mid-run, printed "3 tools clean"
   and EXITED 0: --strict would have waved real drift through CI while
   reporting a clean estate.

   Found 22/08/2026 by moving four admin consoles into directories, which
   brought them under the lint for the first time (a loose admin.html is not
   an index.html) and turned up four stale auth-guard pins that had been
   invisible for months.

   So this file tests the gate rather than the estate: given drift, does
   --strict actually fail? The other tests here all assume it does. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { REPO } from './load-canon.mjs';

/* A throwaway repo: the real system/ (so the canonical pins and the waiver
   files are the real ones) plus one tool page we control. */
function sandbox(page) {
  const dir = mkdtempSync(join(tmpdir(), 'nl-lint-'));
  cpSync(join(REPO, 'system'), join(dir, 'system'), { recursive: true });
  cpSync(join(REPO, 'scripts'), join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'faketool'));
  writeFileSync(join(dir, 'faketool/index.html'), page);
  return dir;
}

function runLint(dir) {
  try {
    const out = execFileSync('bash', [join(dir, 'system/lint-tools.sh'), '--strict'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

/* Built from the template, so the only thing wrong with it is what we break. */
const TEMPLATE = readFileSync(join(REPO, 'system/_template/index.html'), 'utf8')
  .replace(/__TOOL_TITLE__/g, 'Fake').replace(/__TOOL_KEY__/g, 'ops-fake')
  .replace(/__SLUG__/g, 'faketool').replace(/__TOOL_ICON__/g, 'star')
  .replace(/__CATEGORY__/g, 'ops');

test('a clean page passes', (t) => {
  /* The control. Without it, the failing test below could be passing because
     the sandbox is broken rather than because the drift was caught. */
  const dir = sandbox(TEMPLATE);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = runLint(dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /1 tools? clean/);
});

test('--strict fails on drift, rather than crashing quietly', (t) => {
  /* The regression. A stale pin is the commonest drift there is and the exact
     kind that sat unnoticed in four admin consoles. */
  const drifted = TEMPLATE.replace(/auth-guard\.js\?v=\d+/, 'auth-guard.js?v=1');
  assert.notEqual(drifted, TEMPLATE, 'the fixture really is drifted');
  const dir = sandbox(drifted);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = runLint(dir);
  assert.equal(r.code, 1, `--strict must exit 1 on drift.\n${r.out}`);
  assert.match(r.out, /auth-guard\.js\?v=1/);
  /* The tell that the bug is back: bash reports it and the run stops. */
  assert.ok(!/unbound variable/.test(r.out), r.out);
});

test('the waiver arrays are created, not just declared', (t) => {
  /* `declare -a X` sets an attribute; `X=()` creates the variable. Only the
     second survives `set -u`, and the difference is invisible until the first
     time something drifts. */
  const src = readFileSync(join(REPO, 'system/lint-tools.sh'), 'utf8');
  assert.ok(!/declare -a WAIVE/.test(src));
  assert.match(src, /WAIVE_SLUG=\(\); WAIVE_MATCH=\(\)/);
});
