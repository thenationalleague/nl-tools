/* Every fan-facing script parses.

   widgets/news-ticker-widget.js shipped with one missing brace on 2 March 2026
   and rendered nothing on the public site until 15 August — a script that
   fails to parse runs none of itself, so there was no error and no ticker,
   and nothing here was looking. These files have no build step and no owner
   watching the public site after an edit; this gate is the substitute.

   Scope: standalone .js in widgets/ and embeds/ (classic scripts), plus every
   inline <script> block in embeds/*.html. Syntax only — nothing executes, so
   no fetch fires and no DOM is needed.

   Two extraction details, both learned by getting them wrong on the first run:
   HTML comments are stripped before scanning, because the embeds' header
   comments document the CMS's script-stripping with a literal "<script src=…>"
   example and a naive scan matches inside it; and type="module" blocks go
   through node --check on an .mjs file, because new Function cannot parse
   import statements. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'nl-parse-'));
let tmpN = 0;

function classicParses(source, label) {
  try { new Function(source); return null; }
  catch (e) { return `${label}: ${e.message}`; }
}

function moduleParses(source, label) {
  const p = join(TMP, `block-${tmpN++}.mjs`);
  writeFileSync(p, source);
  try { execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' }); return null; }
  catch (e) { return `${label}: ${String(e.stderr).split('\n').slice(0, 3).join(' ')}`; }
}

for (const dir of ['widgets', 'embeds']) {
  for (const f of readdirSync(join(REPO, dir)).sort()) {
    if (f.endsWith('.js')) {
      test(`${dir}/${f} parses`, () => {
        const err = classicParses(readFileSync(join(REPO, dir, f), 'utf8'), f);
        assert.equal(err, null, err ?? undefined);
      });
    }
    if (f.endsWith('.html')) {
      test(`${dir}/${f} inline scripts parse`, () => {
        const html = readFileSync(join(REPO, dir, f), 'utf8')
          .replace(/<!--[\s\S]*?-->/g, '');
        // Inline blocks only — <script src> has no body to parse.
        const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)];
        const errs = blocks.map((m, i) =>
          /type\s*=\s*["']?module/i.test(m[1])
            ? moduleParses(m[2], `block ${i + 1} (module)`)
            : classicParses(m[2], `block ${i + 1}`)
        ).filter(Boolean);
        assert.deepEqual(errs, []);
      });
    }
  }
}
