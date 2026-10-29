/* scripts/rtdb-level-rule.mjs against NL.resolveToolLevel, in the emulator.
   Not in npm test (needs Java + firebase-tools); see tests/emulator/README.md:

     NL_REPO=/path/to/nl-tools npx firebase emulators:exec --project demo-lvl \
       --only database "node level-rule.mjs"

   The rule exists so the database and the portal give the same answer to
   "what may this person do on this tool". This runs both over every
   combination of grant shape, role and registry default that the live data
   can hold, and fails on any disagreement. A mismatch here is a person the
   portal lets in and the database refuses, or worse, the other way round. */
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ref, get, set } from 'firebase/database';

const REPO = process.env.NL_REPO || '..';
const { levelRule } = await import(pathToFileURL(join(REPO, 'scripts/rtdb-level-rule.mjs')));
const { NL } = await import(pathToFileURL(join(REPO, 'tests/load-canon.mjs')));

const KEY = 'ops-level-probe';
const rules = {
  rules: {
    tools: { '.read': true, '.write': false },
    users: { '.read': false, '.write': false },
    probe: {
      access: { '.read': levelRule(KEY, 'access'), '.write': false },
      admin: { '.read': levelRule(KEY, 'admin'), '.write': false },
    },
  },
};
const env = await initializeTestEnvironment({
  projectId: 'demo-lvl',
  database: { rules: JSON.stringify(rules), host: '127.0.0.1', port: 9000 },
});

/* What the live data can hold. Entries: absent, every string the portal has
   ever written (incl. the retired 'hidden'), both legacy object shapes, a
   bare true, and a stored false. Roles: the five current ones, both legacy
   club keys, and a user with no role at all. */
const ENTRIES = [undefined, 'off', 'access', 'admin', 'hidden', 'typo', true, false,
  { access: true }, { admin: true }, { access: true, admin: true }, { access: false, admin: false }];
const ROLES = ['superadmin', 'admin', 'staff', 'club-admin', 'club-staff', 'club', 'club-viewer', undefined];
const DEFAULT_SETS = [
  null,
  { superadmin: 'admin', admin: 'admin', staff: 'off', 'club-admin': 'off', 'club-staff': 'off' },
  { admin: 'admin', staff: 'access', 'club-admin': 'access', 'club-staff': 'access' },
  { staff: 'admin' },
  { club: 'access', 'club-viewer': 'admin' },            // legacy keys only
  { club: 'access', 'club-admin': 'off' },               // normalised key wins
];

let pass = 0, fail = 0, n = 0;
for (const defaults of DEFAULT_SETS) {
  await env.withSecurityRulesDisabled((ctx) =>
    set(ref(ctx.database(), 'tools/' + KEY), defaults ? { defaults } : { label: 'probe' }));
  for (const role of ROLES) {
    for (const entry of ENTRIES) {
      const uid = 'u' + (++n);
      const user = {};
      if (role !== undefined) user.role = role;
      if (entry !== undefined) user.tools = { [KEY]: entry };
      await env.withSecurityRulesDisabled((ctx) =>
        set(ref(ctx.database(), 'users/' + uid), Object.keys(user).length ? user : { name: 'x' }));

      const expected = role === 'superadmin' ? 'admin'
        : NL.resolveToolLevel(entry, defaults ? { defaults } : {}, role);
      const db = env.authenticatedContext(uid, {}).database();
      const can = async (p) => get(ref(db, p)).then(() => true, () => false);
      const got = (await can('probe/admin')) ? 'admin' : (await can('probe/access')) ? 'access' : 'off';
      if (got === expected) pass++;
      else {
        fail++;
        console.log('XX  role=%s entry=%j defaults=%j  portal=%s rules=%s',
          role, entry, defaults, expected, got);
      }
    }
  }
}
await env.cleanup();
console.log(`\n${pass} combinations agree, ${fail} disagree`);
process.exit(fail ? 1 : 0);
