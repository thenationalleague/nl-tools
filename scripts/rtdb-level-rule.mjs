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

   CLI: node scripts/rtdb-level-rule.mjs <toolKey> <access|admin>
        prints the expression, for pasting into system/rtdb/rules.snapshot.json. */

const U = "root.child('users').child(auth.uid)";
const ROLE = `${U}.child('role').val()`;
const HAS_ROLE = `${U}.child('role').exists()`;

function q(s) {
  if (!/^[a-z0-9-]+$/.test(s)) throw new Error(`levelRule: unsafe key ${JSON.stringify(s)}`);
  return `'${s}'`;
}

export function levelRule(toolKey, min) {
  if (min !== 'access' && min !== 'admin') throw new Error(`levelRule: min must be access or admin, not ${min}`);
  const E = `${U}.child('tools').child(${q(toolKey)})`;
  const D = (role) => `root.child('tools').child(${q(toolKey)}).child('defaults').child(${role})`;
  const levels = min === 'admin' ? ['admin'] : ['access', 'admin'];

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
    `(!${HAS_ROLE} && ${D("'staff'")}.val() === '${L}')`,
    `(${HAS_ROLE} && ${ROLE} !== 'club' && ${ROLE} !== 'club-viewer' && ${D(ROLE)}.val() === '${L}')`,
  ].join(' || ');

  const granted = levels.map((L) =>
    `${entryIs(L)} || (!${E}.exists() && (${defaultIs(L)}))`).join(' || ');

  return `auth != null && (${ROLE} === 'superadmin' || ${granted})`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [key, min] = process.argv.slice(2);
  if (!key || !min) {
    console.error('usage: node scripts/rtdb-level-rule.mjs <toolKey> <access|admin>');
    process.exit(2);
  }
  console.log(levelRule(key, min));
}
