/* No account, no defaults (16/11/2026). A session with no users/<uid>
   record (a club code, or any anonymous sign-in) used to be read by the
   generated level rules as League Staff, so a tool's League Staff default
   would have opened to every code holder. Now it gets no default at all.

   This is the proof that the change closes only that, and that every read a
   club code makes today still works. It loads the deployed rules
   (system/rtdb/rules.snapshot.json) and the same rules with the change
   taken back out, side by side, with the real registry's defaults, and
   tries every path in the rules that can be read, as a session with no
   account: no claims, and each club-code claim the rules look for. It prints
   every path where the two disagree, and fails if a code session loses a
   read it has today.

   Run by Auto · Test database rules (tests/emulator/README.md). */
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ref, get, set } from 'firebase/database';

const REPO = process.env.NL_REPO || '..';
const NEW = readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8');
const ADDED = "root.child('users').child(auth.uid).exists() && ";
const OLD = NEW.split("!root.child('users').child(auth.uid).child('role').exists() && " + ADDED)
  .join("!root.child('users').child(auth.uid).child('role').exists() && ");
if (OLD === NEW) { console.log('XX  the change is not in the rules'); process.exit(1); }
const REG = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));

const envNew = await initializeTestEnvironment({ projectId: 'demo-noacct-new', database: { rules: NEW, host: '127.0.0.1', port: 9000 } });
const envOld = await initializeTestEnvironment({ projectId: 'demo-noacct-old', database: { rules: OLD, host: '127.0.0.1', port: 9000 } });
for (const env of [envNew, envOld]) {
  await env.withSecurityRulesDisabled((ctx) => set(ref(ctx.database(), 'tools'), REG));
}

/* Every path with a .read, with each $variable filled in. */
const paths = [];
(function walk(node, path) {
  if (!node || typeof node !== 'object') return;
  if (typeof node['.read'] === 'string' || node['.read'] === true) paths.push(path.join('/'));
  Object.keys(node).forEach((k) => { if (k[0] !== '.') walk(node[k], path.concat(k)); });
})(JSON.parse(NEW).rules, []);
const fill = (p) => p.split('/').map((s) => (s[0] === '$' ? (/club|code/i.test(s) ? 'ABC' : (/season/i.test(s) ? '2026' : 'x1')) : s)).join('/') || '/';

/* Club-code claims the rules ask about, from the rules themselves. */
const claimNames = [...new Set([...NEW.matchAll(/auth\.token\.([A-Za-z]+)/g)].map((m) => m[1]))]
  .filter((c) => !['email', 'email_verified', 'firebase', 'league', 'uid'].includes(c));
const sessions = [{ label: 'no claims', claims: {} }];
claimNames.forEach((c) => sessions.push({ label: c + ' ABC', claims: { [c]: 'ABC' } }));
sessions.push({ label: 'club NL', claims: { club: 'NL' } }, { label: 'club *', claims: { club: '*' } });

let lost = 0, closed = 0, same = 0;
for (const s of sessions) {
  const uid = 'noaccount-' + s.label.replace(/\W/g, '');
  const dbNew = envNew.authenticatedContext(uid, s.claims).database();
  const dbOld = envOld.authenticatedContext(uid, s.claims).database();
  for (const p of paths) {
    const path = fill(p);
    const a = await get(ref(dbOld, path)).then(() => true, () => false);
    const b = await get(ref(dbNew, path)).then(() => true, () => false);
    if (a === b) { same++; continue; }
    if (a && !b) {
      if (Object.keys(s.claims).length) { lost++; console.log('XX  %s lost a read: %s', s.label, path); }
      else { closed++; console.log('closed  %s: %s', s.label, path); }
    } else { lost++; console.log('XX  %s GAINED a read: %s', s.label, path); }
  }
}
await envNew.cleanup(); await envOld.cleanup();
console.log(`\n${paths.length} paths × ${sessions.length} sessions: ${same} unchanged, ${closed} closed to an anonymous session with no claims, ${lost} problems`);
console.log('claims tried: ' + claimNames.join(', '));
process.exit(lost ? 1 : 0);
