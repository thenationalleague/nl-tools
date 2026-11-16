#!/usr/bin/env node
/* The RTDB rule for "this person's level on this tool is at least X".

   WHY THIS EXISTS
   ---------------
   Every gated tool has two permission systems. The portal and auth-guard
   decide who can OPEN a tool, from the per-user grant (Off / Use / Manage)
   and the registry's per-role defaults — NL.resolveToolLevel in
   system/nl-utils.js. The RTDB rules decide what that person can READ and
   WRITE once inside, and until 29/10/2026 almost every tool's rules were
   hand-written role checks that never looked at the grant. So a Use or
   Manage given in the portal opened the page and the database then refused
   it — Document Library on launch day, two staff with Use, PERMISSION_DENIED.

   This builds the rules expression from the same inputs, so the portal is
   the one place access is decided and the rules follow it:

     levelRule('ops-document-library', 'access')  → Use or Manage
     levelRule('ops-document-library', 'admin')   → Manage

   MIRRORS NL.resolveToolLevel EXACTLY (tests/emulator/level-rule.mjs runs
   both over the same matrix of grants, roles and defaults):
     · superadmin is always granted — auth-guard grants it before asking;
     · a per-user entry always wins, including an explicit 'off' or false;
     · entry shapes: 'access' | 'admin' strings, a legacy {access, admin}
       object, a bare `true` (= access); anything else is off;
     · with NO entry, the registry default for the role, where the role is
       normalised as NL.roles.norm does — 'club' → 'club-admin',
       'club-viewer' → 'club-staff' (falling back to the legacy key when the
       normalised one has no default), and a missing role reads as 'staff'.
     · EXCEPT where there is no account at all (16/11/2026). A session with
       no users/<uid> record (a club code, or any anonymous sign-in) has no
       role, and used to read as 'staff' too, so a tool's League Staff
       default would have opened to every code holder. A missing role now
       reads as 'staff' only for an account that exists; no account, no
       default. The portal never meets a session with no account, so it
       and this still agree on every account.

   CLI: node scripts/rtdb-level-rule.mjs <toolKey> <access|admin>
        prints the expression, for pasting into system/rtdb/rules.snapshot.json.
        node scripts/rtdb-level-rule.mjs league
        prints the League check (leagueRule, below). */

const U = "root.child('users').child(auth.uid)";
const ROLE = `${U}.child('role').val()`;
const HAS_ROLE = `${U}.child('role').exists()`;
const HAS_ACCOUNT = `${U}.exists()`;

function q(s) {
  if (!/^[a-z0-9-]+$/.test(s)) throw new Error(`levelRule: unsafe key ${JSON.stringify(s)}`);
  return `'${s}'`;
}

export function levelRule(toolKey, min, offered) {
  if (min !== 'access' && min !== 'admin') throw new Error(`levelRule: min must be access or admin, not ${min}`);
  const E = `${U}.child('tools').child(${q(toolKey)})`;
  const D = (role) => `root.child('tools').child(${q(toolKey)}).child('defaults').child(${role})`;
  /* A tool that offers no Manage (`levels` off/access in its registry
     record) never asks for 'admin': the portal cannot give it, and
     tests/rules-follow-portal.test.mjs refuses a rule that asks (14/11/2026,
     Estate's job check). The CLI passes the record's levels. */
  const levels = (min === 'admin' ? ['admin'] : ['access', 'admin'])
    .filter((L) => !offered || offered.includes(L));
  if (!levels.length) throw new Error(`levelRule: ${toolKey} offers no ${min}`);

  /* The entry, when there is one. */
  const entryIs = (L) => {
    const parts = [`${E}.val() === '${L}'`];
    if (L === 'admin') parts.push(`${E}.child('admin').val() === true`);
    if (L === 'access') {
      parts.push(`${E}.val() === true`);
      parts.push(`(${E}.child('access').val() === true && ${E}.child('admin').val() !== true)`);
    }
    return parts.join(' || ');
  };

  /* The registry default, when there is no entry. */
  const legacy = (from, to, L) =>
    `(${ROLE} === '${from}' && (${D(`'${to}'`)}.val() === '${L}' || (!${D(`'${to}'`)}.exists() && ${D(`'${from}'`)}.val() === '${L}')))`;
  const defaultIs = (L) => [
    legacy('club', 'club-admin', L),
    legacy('club-viewer', 'club-staff', L),
    `(!${HAS_ROLE} && ${HAS_ACCOUNT} && ${D("'staff'")}.val() === '${L}')`,
    `(${HAS_ROLE} && ${ROLE} !== 'club' && ${ROLE} !== 'club-viewer' && ${D(ROLE)}.val() === '${L}')`,
  ].join(' || ');

  const granted = levels.map((L) =>
    `${entryIs(L)} || (!${E}.exists() && (${defaultIs(L)}))`).join(' || ');

  return `auth != null && (${ROLE} === 'superadmin' || ${granted})`;
}

/* "This person is on the League side." The pass's card when they have one;
   with no pass, a League role (superadmin, admin, staff); and the
   superadmin role always, as the Skeleton key holders hold it. Used beside
   levelRule where a tool gives Club cards Manage over their own club's
   figures but keeps League-wide data and running the tool to the League:
   `${leagueRule()} && ${levelRule(key, 'admin')}`. First written by hand for
   Commercial Benchmarking (13/11/2026); generated from its second use,
   Attendance, and tests/rtdb-league-rule.test.mjs checks the first still
   matches. */
const PASS_BASE = `${U}.child('pass').child('base')`;
export function leagueRule() {
  const leagueRole = ['superadmin', 'admin', 'staff'].map((r) => `${ROLE} === '${r}'`).join(' || ');
  return `(${PASS_BASE}.val() === 'league' || (!${PASS_BASE}.exists() && (${leagueRole})) || ${ROLE} === 'superadmin')`;
}

/* "This External card was given every club, named, on this tool." Reads
   pass.ext, which only the server writes (functions/externals.js, from the
   organisation's zones and the tool's `externals` offer); nobody can write
   their own pass. Used beside leagueRule on a read, never a write, where a
   tool offers externals All clubs, named, and its club data is otherwise
   League only: `(${leagueRule()} || ${externalAllRule(key)}) && levelRule`.
   The level check still applies, so it takes both the server's entry and
   the tool entry Access writes from the pass. First used for Commercial
   Benchmarking (16/11/2026). */
export function externalAllRule(key) {
  return `(${PASS_BASE}.val() === 'external' && ${U}.child('pass').child('ext').child('${key}').child('view').val() === 'all')`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [key, min] = process.argv.slice(2);
  if (key === 'league' && !min) { console.log(leagueRule()); process.exit(0); }
  if (!key || !min) {
    console.error('usage: node scripts/rtdb-level-rule.mjs <toolKey> <access|admin>');
    console.error('       node scripts/rtdb-level-rule.mjs league');
    process.exit(2);
  }
  const { readFileSync } = await import('node:fs');
  const reg = JSON.parse(readFileSync(new URL('../system/rtdb/tools-registry.snapshot.json', import.meta.url), 'utf8'));
  console.log(levelRule(key, min, (reg[key] || {}).levels));
}
