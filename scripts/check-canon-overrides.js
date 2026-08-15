#!/usr/bin/env node
/**
 * scripts/check-canon-overrides.js — the rule CONSOLIDATION.md promised.
 *
 * "Future-proofing — how this STAYS fixed" listed five lint rules that catch
 * drift the moment it is typed, one of them:
 *
 *     a tool re-declaring esc() / showToast() etc. over canon → flagged
 *
 * It was never built. Measured on 15/08/2026 with it absent: 46 pages
 * redefining a class that already exists in nl-brand.css, 156 separate
 * overrides. The plan was right; the enforcement is what did not happen.
 *
 * WHAT THIS FLAGS
 *   A page whose own <style> block defines a class that nl-brand.css already
 *   defines. Because the page's <style> loads AFTER the stylesheet, the local
 *   rule silently wins — so the page stops tracking the design system while
 *   still looking like it uses it. That is how meta-reference came to draw its
 *   own `.chip` at a different size, and how commercial-benchmarking/link.html
 *   repaints the canon `.topbar` navy.
 *
 * WHAT IT DOES NOT FLAG
 *   Locally-named classes. A page is free to define `.est-row` or `.mr-cpill`
 *   all it likes — that is the intended way to write page-specific styling, and
 *   it cannot collide with anything.
 *
 * WHY NOT ZERO-TOLERANCE
 *   A hard failure makes people rename `.btn` to `.btn2` to get past the check,
 *   which is worse than an honest override: the drift is still there and now it
 *   is disguised. vacancies/submit already does exactly this — it defines
 *   `.header` as red-with-a-7px-navy-border, which IS the canon `.topbar`,
 *   copied under a new name with a comment explaining the rename.
 *
 *   So: known overrides live in system/_template/.canon-overrides as a tracked
 *   backlog, exactly like .lint-waivers. --strict fails only on NEW ones. The
 *   backlog is printed on every run so it cannot be quietly forgotten.
 *
 * Usage:
 *   node scripts/check-canon-overrides.js            report, exit 0
 *   node scripts/check-canon-overrides.js --strict   exit 1 on unlisted overrides
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const CANON = path.join(REPO, 'system/nl-brand.css');
const BASELINE = path.join(REPO, 'system/_template/.canon-overrides');

/* Embeds are pasted into the Urban Zoo CMS, which strips <link> tags. They
   cannot load nl-brand.css at all, so every style they carry is inline by
   necessity and "overriding canon" is meaningless for them. The Style Guide is
   a specimen sheet — restyling a component is its job. */
const EXEMPT = [/^embeds\//, /^style-guide\//, /^system\/brand-v3-mockups\//, /^lab\//];

/** Top-level class selectors defined in a stylesheet or <style> block. */
function classesIn(css) {
  /* Strip comments first — a commented-out rule is not a rule. */
  const live = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Set();
  for (const m of live.matchAll(/(?:^|[\s,}>+~])\.([a-zA-Z][\w-]*)(?=[\s,{:.[>+~])/g)) {
    out.add(m[1]);
  }
  return out;
}

function htmlFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(full, acc);
    else if (e.name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

function main() {
  const strict = process.argv.includes('--strict');

  if (!fs.existsSync(CANON)) {
    console.error('check-canon-overrides: nl-brand.css not found');
    process.exit(0);
  }
  const canon = classesIn(fs.readFileSync(CANON, 'utf8'));

  /* Baseline: "<page>|<class>" per line, # comments stripped. */
  const known = new Set();
  if (fs.existsSync(BASELINE)) {
    for (let line of fs.readFileSync(BASELINE, 'utf8').split('\n')) {
      line = line.split('#')[0].trim();
      if (line) known.add(line.replace(/\s+/g, ''));
    }
  }

  const fresh = [];
  let knownCount = 0;
  let pagesWithOverrides = 0;

  for (const file of htmlFiles(REPO).sort()) {
    const relPath = path.relative(REPO, file).split(path.sep).join('/');
    if (relPath.includes('/_template/')) continue;
    if (EXEMPT.some((re) => re.test(relPath))) continue;

    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes('nl-brand.css')) continue;   // not on canon, nothing to override

    const styles = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
      .map((m) => m[1]).join('\n');
    if (!styles.trim()) continue;

    const clashes = [...classesIn(styles)].filter((c) => canon.has(c)).sort();
    if (!clashes.length) continue;
    pagesWithOverrides++;

    for (const c of clashes) {
      if (known.has(`${relPath}|${c}`)) knownCount++;
      else fresh.push({ page: relPath, cls: c });
    }
  }

  if (fresh.length) {
    console.log(`Canon overrides — NOT in the tracked backlog (${fresh.length}):`);
    for (const f of fresh) console.log(`  ${f.page}: redefines canon .${f.cls}`);
    console.log('');
    console.log('  Either use the canon class as-is, or give yours a page-specific');
    console.log('  name (.est-row, .mr-cpill). If the override is deliberate, add it to');
    console.log('  system/_template/.canon-overrides with a reason.');
    console.log('');
  }
  if (knownCount) {
    console.log(`Tracked canon overrides: ${knownCount} across ${pagesWithOverrides} page(s) ` +
                `— backlog in system/_template/.canon-overrides`);
  }
  if (!fresh.length && !knownCount) console.log('No canon overrides.');

  if (strict && fresh.length) {
    console.error(`\ncheck-canon-overrides: ${fresh.length} untracked override(s).`);
    process.exit(1);
  }
}

main();
