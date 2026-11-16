#!/usr/bin/env node
/* The old access report: how much still depends on the old model.

   WHY THIS EXISTS
   ---------------
   Access is decided by the pass now, but the old model is still there
   underneath: roles, per-person tool entries, per-role defaults, the
   "League only" label. The permissions plan ("Clearing the old model") lists
   each part and what lets it go. This counts, from the live database, what
   still leans on each one, so a part is removed when the count says it can
   be, never on a guess.

   COUNTS ONLY. It runs in GitHub Actions, whose logs are public on this
   repo, so it never prints a name, an email, a uid or a club. Role names,
   tool keys and numbers only.

   CLI (the workflow runs this):
     node scripts/old-access-report.mjs <users.json> <tools.json> [<access-grants.json>]
   prints the report as plain lines, then `JSON <one line>` for anything
   that wants to read it. Tested in tests/old-access-report.test.mjs. */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const LEAGUE_ROLES = ['superadmin', 'admin', 'staff'];
const CLUB_ROLES = ['club-admin', 'club-staff'];
const OLD_CLUB_ROLES = ['club', 'club-viewer'];
const WAITING_ROLES = ['pending', 'rejected'];
const KNOWN_ROLES = [...LEAGUE_ROLES, ...CLUB_ROLES, ...OLD_CLUB_ROLES, ...WAITING_ROLES];

function bump(o, k) { o[k] = (o[k] || 0) + 1; }

/* The shape of one per-person tool entry. 'level' is today's shape. */
function entryShape(v) {
  if (v === 'off' || v === 'access' || v === 'admin') return 'level';
  if (v === 'hidden') return 'hidden';
  if (v === true) return 'true';
  if (v && typeof v === 'object') return 'object';
  return 'other';
}

/* NL: the canon (functions/canon.js). entryUpdates: from
   functions/pass-entries-core.js, the same comparison the cloud jobs make. */
export function oldAccessReport(NL, entryUpdates, users, tools, liveGrants, now) {
  users = users || {};
  tools = tools || {};
  const registry = NL.pass.withLiveAll(tools, liveGrants || null);
  const r = {
    accounts: 0,
    withPass: 0,
    withoutPass: { league: 0, club: 0, waiting: 0, none: 0, other: 0 },
    roles: {},
    oldClubRoles: 0,
    entries: { total: 0, level: 0, hidden: 0, true: 0, object: 0, other: 0, unknownTool: 0 },
    unknownTools: {},
    drift: { accounts: 0, entries: 0 },
    registry: { tools: 0, withDefaults: 0, audience: {}, placeholder: 0 },
  };

  Object.keys(users).forEach((uid) => {
    const u = users[uid];
    if (!u || typeof u !== 'object') return;
    r.accounts++;
    const role = typeof u.role === 'string' ? u.role : '';
    bump(r.roles, KNOWN_ROLES.includes(role) ? role : (role ? 'other' : 'none'));
    if (OLD_CLUB_ROLES.includes(role)) r.oldClubRoles++;

    const issued = NL.pass.isIssued(u.pass);
    if (issued) r.withPass++;
    else if (LEAGUE_ROLES.includes(role)) r.withoutPass.league++;
    else if (CLUB_ROLES.includes(role) || OLD_CLUB_ROLES.includes(role)) r.withoutPass.club++;
    else if (WAITING_ROLES.includes(role)) r.withoutPass.waiting++;
    else if (!role) r.withoutPass.none++;
    else r.withoutPass.other++;

    const t = u.tools && typeof u.tools === 'object' ? u.tools : {};
    Object.keys(t).forEach((key) => {
      r.entries.total++;
      r.entries[entryShape(t[key])]++;
      if (!tools[key]) { r.entries.unknownTool++; bump(r.unknownTools, key); }
    });

    if (issued) {
      const n = Object.keys(entryUpdates(NL, uid, u, registry, now)).length;
      if (n) { r.drift.accounts++; r.drift.entries += n; }
    }
  });

  Object.keys(tools).forEach((key) => {
    const rec = tools[key];
    if (!rec || typeof rec !== 'object') return;
    r.registry.tools++;
    if (rec.defaults && Object.keys(rec.defaults).length) r.registry.withDefaults++;
    if (rec.audience) bump(r.registry.audience, String(rec.audience));
    if (rec.placeholder) r.registry.placeholder++;
  });
  return r;
}

/* Plain lines for the Actions summary, each saying what the count decides. */
export function reportLines(r) {
  const w = r.withoutPass;
  const noPass = w.league + w.club + w.waiting + w.none + w.other;
  const L = [];
  L.push(`Accounts: ${r.accounts}. With a pass: ${r.withPass}. Without: ${noPass}.`);
  L.push(`  Without a pass, by old role: League ${w.league}, club ${w.club}, waiting or declined ${w.waiting}, no role ${w.none}, other ${w.other}.`);
  L.push(`  Roles and per-role defaults can go when League and club without a pass are both 0.`);
  L.push(`Roles in use: ${Object.keys(r.roles).sort().map((k) => `${k} ${r.roles[k]}`).join(', ') || 'none'}.`);
  L.push(`  Old club role names (club, club-viewer): ${r.oldClubRoles}. The rules stop translating them at 0.`);
  const e = r.entries;
  L.push(`Per-person tool entries: ${e.total}. Today's shape ${e.level}; old shapes: object ${e.object}, true ${e.true}, "hidden" ${e.hidden}, other ${e.other}.`);
  L.push(`  The rules stop accepting old shapes when all four are 0.`);
  L.push(`  For tools no longer in the registry: ${e.unknownTool}${e.unknownTool ? ' (' + Object.keys(r.unknownTools).sort().map((k) => `${k} ${r.unknownTools[k]}`).join(', ') + ')' : ''}. These can be cleared now.`);
  L.push(`Accounts whose entries differ from their pass: ${r.drift.accounts} (${r.drift.entries} entries). Should be 0: the cloud jobs keep them in step.`);
  const g = r.registry;
  L.push(`Registry: ${g.tools} tools; with per-role defaults ${g.withDefaults}; "League only" label: ${Object.keys(g.audience).sort().map((k) => `${k} ${g.audience[k]}`).join(', ') || 'none'}; marked placeholder ${g.placeholder}.`);
  return L;
}

function main(argv) {
  const [usersPath, toolsPath, grantsPath] = argv;
  if (!usersPath || !toolsPath) {
    console.error('usage: node scripts/old-access-report.mjs <users.json> <tools.json> [<access-grants.json>]');
    process.exit(2);
  }
  const read = (p) => (p ? JSON.parse(readFileSync(p, 'utf8') || 'null') : null);
  const { loadCanon } = require('../functions/canon.js');
  const { entryUpdates } = require('../functions/pass-entries-core.js');
  const r = oldAccessReport(loadCanon(), entryUpdates, read(usersPath), read(toolsPath), read(grantsPath), Date.now());
  reportLines(r).forEach((l) => console.log(l));
  /* The JSON line carries tool keys and counts, never a uid. */
  console.log('JSON ' + JSON.stringify(r));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
