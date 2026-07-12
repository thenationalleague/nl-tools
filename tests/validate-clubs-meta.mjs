/* Structural + integrity validator for assets/data/clubs-meta.json — turns the
   documented data schema into an ENFORCED one. Errors fail CI; warnings are
   surfaced but don't (so a pre-existing gap doesn't block unrelated PRs).

   Run standalone:  node tests/validate-clubs-meta.mjs
   Or via the test: npm test  (tests/clubs-meta.test.mjs asserts zero errors)

   Zero dependencies: node:fs only. */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

export function validateClubsMeta(repo = REPO) {
  const errors = [];
  const warnings = [];
  const E = (m) => errors.push(m);
  const W = (m) => warnings.push(m);

  let meta;
  try {
    meta = JSON.parse(readFileSync(join(repo, 'assets/data/clubs-meta.json'), 'utf8'));
  } catch (e) {
    return { errors: ['clubs-meta.json is missing or not valid JSON: ' + e.message], warnings };
  }

  // ── top-level ────────────────────────────────────────────────────────────
  if (!meta.version) W('top-level "version" is missing');
  const seasons = meta.seasons;
  if (!seasons || typeof seasons !== 'object') {
    E('"seasons" object is missing');
  } else {
    if (!seasons.current) E('"seasons.current" is missing');
    if (!seasons.list || typeof seasons.list !== 'object') {
      E('"seasons.list" is missing');
    } else if (seasons.current && !(seasons.current in seasons.list)) {
      E(`seasons.current "${seasons.current}" is not a key in seasons.list`);
    }
  }
  const seasonKeys = new Set(Object.keys((seasons && seasons.list) || {}));

  if (!Array.isArray(meta.clubs) || meta.clubs.length === 0) {
    return { errors: [...errors, '"clubs" is missing or empty'], warnings };
  }

  // ── per-club ─────────────────────────────────────────────────────────────
  const optaSeen = new Map();
  const nameSeen = new Map();
  let currentRoster = 0;

  meta.clubs.forEach((c, i) => {
    const at = `clubs[${i}] (${c && c.name ? c.name : '??'})`;
    if (!c || typeof c !== 'object') { E(`${at}: not an object`); return; }

    if (!c.name || typeof c.name !== 'string') E(`${at}: missing/invalid "name"`);
    if (!c.code || typeof c.code !== 'string') E(`${at}: missing/invalid "code"`);
    if (!c.optaID) W(`${at}: missing "optaID"`);

    if (c.name) {
      nameSeen.set(c.name, (nameSeen.get(c.name) || 0) + 1);
      // crest file must exist (raw.githubusercontent + every tool key on <name>.png)
      const crest = join(repo, 'assets/crests', c.name + '.png');
      if (!existsSync(crest)) W(`${at}: no crest file assets/crests/${c.name}.png`);
      else {
        for (const tier of ['thumbs', 'medium']) {
          if (!existsSync(join(repo, 'assets/crests', tier, c.name + '.png'))) {
            W(`${at}: no ${tier} tier assets/crests/${tier}/${c.name}.png (run build-crest-thumbs)`);
          }
        }
      }
    }
    if (c.optaID) optaSeen.set(c.optaID, (optaSeen.get(c.optaID) || 0) + 1);

    if (c.seasons && typeof c.seasons === 'object') {
      for (const k of Object.keys(c.seasons)) {
        if (!seasonKeys.has(k)) E(`${at}: season key "${k}" not in seasons.list`);
      }
      if (seasons && seasons.current && c.seasons[seasons.current] != null) currentRoster++;
    } else {
      W(`${at}: no "seasons" map (won't appear in any season roster)`);
    }

    if (c.division != null && typeof c.division !== 'string') E(`${at}: "division" not a string`);
  });

  // ── uniqueness ───────────────────────────────────────────────────────────
  for (const [id, n] of optaSeen) if (n > 1) E(`duplicate optaID "${id}" on ${n} clubs`);
  for (const [nm, n] of nameSeen) if (n > 1) E(`duplicate club name "${nm}" on ${n} records`);

  // ── roster sanity ────────────────────────────────────────────────────────
  if (seasons && seasons.current && currentRoster === 0) {
    E(`current season "${seasons.current}" has an empty roster`);
  }

  return { errors, warnings, stats: { clubs: meta.clubs.length, currentRoster } };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const { errors, warnings, stats } = validateClubsMeta();
  if (stats) console.log(`clubs-meta: ${stats.clubs} clubs, ${stats.currentRoster} in current roster`);
  warnings.forEach((w) => console.warn('  ⚠ ' + w));
  if (errors.length) {
    errors.forEach((e) => console.error('  ✗ ' + e));
    console.error(`\nFAIL: ${errors.length} error(s), ${warnings.length} warning(s)`);
    process.exit(1);
  }
  console.log(`OK: 0 errors, ${warnings.length} warning(s)`);
}
