/* Structural + integrity validator for assets/data/cup-clubs-meta.json and the
   `entrants` block in assets/data/competitions-meta.json.

   Sibling of validate-clubs-meta.mjs, same contract: errors fail CI, warnings
   are surfaced but don't (so a pre-existing gap doesn't block unrelated PRs).

   The two files are deliberately separate — cup-clubs-meta holds clubs that are
   NOT and never were NL members, so they must not be mistakable for the
   `division: null` former members inside clubs-meta. This validator enforces
   that separation: a code or name may not appear in both files.

   Run standalone:  node tests/validate-cup-clubs.mjs
   Or via the test: npm test  (tests/cup-clubs.test.mjs asserts zero errors)

   Zero dependencies: node:fs only. */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

const HEX = /^#[0-9A-Fa-f]{6}$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function validateCupClubs(repo = REPO) {
  const errors = [];
  const warnings = [];
  const E = (m) => errors.push(m);
  const W = (m) => warnings.push(m);

  let cup, comps, clubsMeta;
  try {
    cup = readJson(join(repo, 'assets/data/cup-clubs-meta.json'));
  } catch (e) {
    return { errors: ['cup-clubs-meta.json is missing or not valid JSON: ' + e.message], warnings };
  }
  try {
    comps = readJson(join(repo, 'assets/data/competitions-meta.json'));
  } catch (e) {
    return { errors: ['competitions-meta.json is missing or not valid JSON: ' + e.message], warnings };
  }
  try {
    clubsMeta = readJson(join(repo, 'assets/data/clubs-meta.json'));
  } catch (e) {
    return { errors: ['clubs-meta.json is missing or not valid JSON: ' + e.message], warnings };
  }

  if (!cup.version) W('cup-clubs-meta: top-level "version" is missing');
  if (!Array.isArray(cup.clubs) || cup.clubs.length === 0) {
    return { errors: [...errors, 'cup-clubs-meta: "clubs" is missing or empty'], warnings };
  }

  // ── member-side lookups, for the separation checks ───────────────────────
  const memberCodes = new Map();
  const memberNames = new Set();
  for (const c of clubsMeta.clubs || []) {
    if (c.code) memberCodes.set(c.code, c.name);
    if (c.name) memberNames.add(c.name);
  }
  const seasonKeys = new Set(Object.keys((clubsMeta.seasons && clubsMeta.seasons.list) || {}));

  // ── per guest club ───────────────────────────────────────────────────────
  const codeSeen = new Map();
  const nameSeen = new Map();
  const guestCodes = new Set();

  cup.clubs.forEach((c, i) => {
    const at = `cup-clubs[${i}] (${c && c.name ? c.name : '??'})`;
    if (!c || typeof c !== 'object') { E(`${at}: not an object`); return; }

    for (const f of ['name', 'short', 'code']) {
      if (!c[f] || typeof c[f] !== 'string') E(`${at}: missing/invalid "${f}"`);
    }
    if (!c.nickname) W(`${at}: missing "nickname"`);

    if (c.code) {
      guestCodes.add(c.code);
      codeSeen.set(c.code, (codeSeen.get(c.code) || 0) + 1);
      // A code may not mean one thing here and another in clubs-meta.
      if (memberCodes.has(c.code)) {
        E(`${at}: code "${c.code}" collides with NL member ${memberCodes.get(c.code)} in clubs-meta.json`);
      }
    }
    if (c.name) {
      nameSeen.set(c.name, (nameSeen.get(c.name) || 0) + 1);
      if (memberNames.has(c.name)) {
        E(`${at}: name collides with an NL member of the same name in clubs-meta.json`);
      }
    }

    // crestName points at the shared assets/crests/<name>.png key. It exists so
    // the record can carry the competition-correct "… PL2" name without needing
    // a duplicated badge file under that name.
    const key = c.crestName || c.name;
    if (!c.crestName) W(`${at}: no "crestName" — falling back to "name" for the crest lookup`);
    if (key) {
      if (!existsSync(join(repo, 'assets/crests', key + '.png'))) {
        E(`${at}: no crest file assets/crests/${key}.png`);
      } else {
        for (const tier of ['thumbs', 'medium']) {
          if (!existsSync(join(repo, 'assets/crests', tier, key + '.png'))) {
            W(`${at}: no ${tier} tier assets/crests/${tier}/${key}.png (run build-crest-thumbs)`);
          }
        }
      }
    }

    // colours are the only colour source for match graphics
    const col = c.colors;
    if (!col || typeof col !== 'object') {
      E(`${at}: missing "colors"`);
    } else {
      for (const slot of ['primary', 'secondary', 'tertiary']) {
        if (col[slot] == null) E(`${at}: colors.${slot} is missing`);
        else if (!HEX.test(col[slot])) E(`${at}: colors.${slot} must be #RRGGBB, got ${JSON.stringify(col[slot])}`);
      }
    }
  });

  for (const [code, n] of codeSeen) if (n > 1) E(`cup-clubs-meta: duplicate code "${code}" on ${n} records`);
  for (const [nm, n] of nameSeen) if (n > 1) E(`cup-clubs-meta: duplicate name "${nm}" on ${n} records`);

  if (cup.colorsStatus && /draft/i.test(cup.colorsStatus)) {
    W('cup-clubs-meta: colours are still marked DRAFT — verify before publishing graphics');
  }

  // ── entrants ─────────────────────────────────────────────────────────────
  // Entry is not a division: a club keeps its real league division and appears
  // here as well. `members` resolve against clubs-meta, `guests` against
  // cup-clubs-meta. null = not recorded, [] = none entered.
  let entrantSeasons = 0;
  for (const comp of comps.competitions || []) {
    if (!comp.entrants) continue;
    const cname = comp.competition;
    if (typeof comp.entrants !== 'object') { E(`${cname}: "entrants" is not an object`); continue; }

    for (const [key, sides] of Object.entries(comp.entrants)) {
      const at = `${cname} entrants[${key}]`;
      if (!seasonKeys.has(key)) E(`${at}: season key not in clubs-meta seasons.list`);
      if (!sides || typeof sides !== 'object') { E(`${at}: not an object`); continue; }
      entrantSeasons++;

      for (const [side, pool] of [['members', memberCodes], ['guests', guestCodes]]) {
        const list = sides[side];
        if (list === null) { W(`${at}.${side}: not recorded (null)`); continue; }
        if (list === undefined) { E(`${at}: "${side}" is missing — use null to mean "not recorded"`); continue; }
        if (!Array.isArray(list)) { E(`${at}.${side}: must be an array or null`); continue; }

        const seen = new Set();
        list.forEach((code) => {
          if (typeof code !== 'string') { E(`${at}.${side}: non-string code ${JSON.stringify(code)}`); return; }
          if (seen.has(code)) E(`${at}.${side}: duplicate code "${code}"`);
          seen.add(code);
          const known = pool instanceof Map ? pool.has(code) : pool.has(code);
          if (!known) {
            E(`${at}.${side}: code "${code}" not found in ${side === 'members' ? 'clubs-meta.json' : 'cup-clubs-meta.json'}`);
          }
        });
      }
    }

    // Cross-check against fixtures: every club in a fixture for this competition
    // must be a recorded entrant. Skipped for a season whose side is null, so an
    // unrecorded roster doesn't produce a wall of false errors.
    for (const [key, sides] of Object.entries(comp.entrants)) {
      const label = (clubsMeta.seasons && clubsMeta.seasons.list && clubsMeta.seasons.list[key] && clubsMeta.seasons.list[key].label) || key;
      const fx = join(repo, `assets/data/fixtures-${label}.json`);
      if (!existsSync(fx)) continue;
      if (sides.members === null || sides.guests === null) {
        W(`${cname} entrants[${key}]: fixture cross-check skipped — a side is unrecorded`);
        continue;
      }
      let doc;
      try { doc = readJson(fx); } catch { continue; }
      const byName = new Map();
      for (const c of clubsMeta.clubs || []) if (c.name) byName.set(c.name, c.code);
      for (const c of cup.clubs) if (c.name) byName.set(c.name, c.code);
      const entered = new Set([...(sides.members || []), ...(sides.guests || [])]);
      const missing = new Set();
      for (const row of doc.fixtures || []) {
        if (!Array.isArray(row) || row[1] !== cname) continue;
        for (const nm of [row[2], row[3]]) {
          const code = byName.get(nm);
          if (!code) missing.add(`${nm} (unknown club)`);
          else if (!entered.has(code)) missing.add(`${nm} (${code})`);
        }
      }
      for (const m of missing) E(`${cname} entrants[${key}]: ${m} appears in fixtures-${label}.json but is not a recorded entrant`);
    }
  }

  return {
    errors,
    warnings,
    stats: { guests: cup.clubs.length, entrantSeasons },
  };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const { errors, warnings, stats } = validateCupClubs();
  if (stats) console.log(`cup-clubs: ${stats.guests} guest clubs, ${stats.entrantSeasons} entrant season(s)`);
  warnings.forEach((w) => console.warn('  ⚠ ' + w));
  if (errors.length) {
    errors.forEach((e) => console.error('  ✗ ' + e));
    console.error(`\nFAIL: ${errors.length} error(s), ${warnings.length} warning(s)`);
    process.exit(1);
  }
  console.log(`OK: 0 errors, ${warnings.length} warning(s)`);
}
