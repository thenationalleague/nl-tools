#!/usr/bin/env node
/* scripts/permissions-import.mjs — v1.0 (12/11/2026)

   Copies the grants from the "Permissions – who can open what" prototype into
   the tools registry snapshot, under each record's `permissions` key.

     node scripts/permissions-import.mjs <file>          write the snapshot
     node scripts/permissions-import.mjs <file> --check  report only

   <file> is the prototype's "Save as a file" output (or the "Copy for
   session 2" text saved to a file): { saved, tools: { <toolKey>: {...} } }.

   Why a script and not a hand edit: the prototype is where the grid is
   decided, and the registry is where it lives. Doing the copy by hand once is
   fine; doing it by hand every time the grid changes is how the two drift.

   What it changes on the way in, and why:
   - Key ids lose their dot. The prototype says `league.operations`; Firebase
     refuses a dot in a key, so the registry says `league-operations`. The
     publish would fail with HTTP 400 otherwise, after the merge.
   - Everything else is kept word for word, including the prototype's own
     values for shelf (main / sandbox / structural) and club data (none / all /
     own / bench), so a later export imports cleanly on top. NL.pass.CLUB_DATA
     and NL.pass.SHELF hold the words shown on screen.
   - `permissions` is NESTED, not spread across the record. The record already
     has `levels`, `shelf` and `audience` with today's meanings, read by
     auth-guard and the portal. Writing the new values over them would change
     who gets in on the day of the merge. Nested, the old guard cannot see them.

   Nothing else in a record is touched. A tool in the file but not in the
   registry, or the other way round, is reported and skipped. */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = join(REPO, 'system/rtdb/tools-registry.snapshot.json');

const LEVELS = ['off', 'access', 'manage'];
const KEY_IDS = [
  'league.operations', 'league.media', 'league.commercial', 'league.finance', 'league.senior', 'league.tester',
  'club.operations', 'club.media', 'club.commercial', 'club.finance',
];
const FOR = ['league', 'both'];
const SHELF = ['main', 'sandbox', 'structural'];
const CLUB_DATA = ['none', 'all', 'own', 'bench'];

/* Per-tool facts the plan decided that the prototype grid has no column for.
   Kept here, beside the import, so the next import cannot drop them. */
const EXTRA = {
  'media-matchday-live': { testers: false }, /* plan, per-tool notes: "Sandbox, no testers" */
};

export function convert(src) {
  const tools = src.tools || src;
  const out = {}, problems = [];
  for (const [key, t] of Object.entries(tools)) {
    const bad = (why) => problems.push(`${key}: ${why}`);
    if (!FOR.includes(t.for)) bad(`for "${t.for}"`);
    if (!SHELF.includes(t.shelf)) bad(`shelf "${t.shelf}"`);
    if (!CLUB_DATA.includes(t.clubData)) bad(`clubData "${t.clubData}"`);
    const levels = (t.levels || []).filter((l) => LEVELS.includes(l));
    if (!levels.includes('off') || !levels.includes('access')) bad(`levels ${JSON.stringify(t.levels)}`);
    const g = t.grants || {};
    const base = {};
    for (const b of ['league', 'club']) {
      const v = (g.base || {})[b] || 'off';
      if (!LEVELS.includes(v)) bad(`grant base.${b} "${v}"`);
      base[b] = v;
    }
    const keyGrants = {};
    for (const [k, v] of Object.entries(g.key || {})) {
      if (!KEY_IDS.includes(k)) { bad(`unknown key "${k}"`); continue; }
      if (!LEVELS.includes(v)) { bad(`grant ${k} "${v}"`); continue; }
      if (v !== 'off') keyGrants[k.replace('.', '-')] = v;
    }
    const rec = {
      for: t.for,
      shelf: t.shelf,
      clubData: t.clubData,
      sensitive: !!t.sensitive,
      lifespan: t.lifespan || 'permanent',
      levels,
      grants: { base, key: keyGrants },
      ...(EXTRA[key] || {}),
    };
    /* Firebase drops an empty object, and a record that reads back without
       `grants.key` would look different from the snapshot to the publish
       check. Say "none" in a way that survives the round trip. */
    if (!Object.keys(rec.grants.key).length) delete rec.grants.key;
    out[key] = rec;
  }
  return { out, problems };
}

function main() {
  const [file, flag] = process.argv.slice(2);
  if (!file) { console.error('usage: node scripts/permissions-import.mjs <prototype-export.json> [--check]'); process.exit(2); }
  const { out, problems } = convert(JSON.parse(readFileSync(file, 'utf8')));
  const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const notInRegistry = Object.keys(out).filter((k) => !(k in snap));
  const notInFile = Object.keys(snap).filter((k) => !(k in out));
  let changed = 0;
  for (const [k, rec] of Object.entries(out)) {
    if (!(k in snap)) continue;
    if (JSON.stringify(snap[k].permissions) !== JSON.stringify(rec)) changed++;
    snap[k].permissions = rec;
  }
  console.log(`${Object.keys(out).length} tools in the file, ${changed} with new or changed permissions.`);
  if (notInRegistry.length) console.log(`In the file, not the registry (skipped): ${notInRegistry.join(', ')}`);
  if (notInFile.length) console.log(`In the registry, not the file (left without permissions): ${notInFile.join(', ')}`);
  if (problems.length) { console.error('Problems:\n  ' + problems.join('\n  ')); process.exit(1); }
  if (flag === '--check') return;
  writeFileSync(SNAPSHOT, JSON.stringify(snap, null, 2) + '\n');
  console.log('Wrote system/rtdb/tools-registry.snapshot.json');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
