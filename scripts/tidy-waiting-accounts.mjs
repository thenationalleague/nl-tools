#!/usr/bin/env node
/* =========================================================================
   NL Tools — waiting and declined accounts hold nothing (one-off)
   File: scripts/tidy-waiting-accounts.mjs
   Version: v1.0 (14/11/2026)

   Run by Button · Tidy waiting and declined accounts
   (tidy-waiting-accounts.yml), once, then both are removed in the next PR
   (CLAUDE.md, "Retiring something").

   Until 14/11/2026 a sign-up request wrote the person's record with role
   'club', the club they typed and the tools they asked for, before anyone
   approved it, and declining a request left all three in place. The
   database rules read all three. functions/account.js and Access v2.6 stop
   new records carrying them; this clears the ones already written:
     waiting  (pending: true)   → role 'pending', no club, no tools
     declined (rejected: true)  → role 'rejected', no club, no tools
   The club and tools a person asked for stay on their admin/requests entry,
   where Access reads them when approving. Nobody else is touched.

   report (default) counts and writes nothing; tidy writes. THE LOG IS PUBLIC:
   counts only, never a uid, name, email or club.
   ========================================================================= */

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/* users/ → the multi-path update that tidies it, and counts. Pure. */
export function plan(users) {
  const updates = {};
  const n = { waiting: 0, declined: 0, waitingFixed: 0, declinedFixed: 0, withPass: 0 };
  for (const [uid, u] of Object.entries(users || {})) {
    if (!u || typeof u !== 'object') continue;
    const waiting = u.pending === true;
    const declined = !waiting && u.rejected === true;
    if (!waiting && !declined) continue;
    const role = waiting ? 'pending' : 'rejected';
    if (waiting) n.waiting++; else n.declined++;
    if (u.pass) n.withPass++;
    const hasTools = u.tools && typeof u.tools === 'object' && Object.keys(u.tools).length;
    if (u.role === role && u.club == null && !hasTools) continue;
    updates[`users/${uid}/role`] = role;
    updates[`users/${uid}/club`] = null;
    updates[`users/${uid}/tools`] = null;
    if (waiting) n.waitingFixed++; else n.declinedFixed++;
  }
  return { updates, n };
}

async function main() {
  const { DB, TOKEN, MODE = 'report' } = process.env;
  const head = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
  const res = await fetch(`${DB}/users.json`, { headers: head });
  if (!res.ok) throw new Error('Reading users: HTTP ' + res.status);
  const { updates, n } = plan(await res.json());
  const lines = ['## Waiting and declined accounts', '',
    `- Waiting for approval: ${n.waiting}, of which ${n.waitingFixed} still carry a club, a club role or tools.`,
    `- Declined: ${n.declined}, of which ${n.declinedFixed} still carry a club, a club role or tools.`,
    `- Of all these, ${n.withPass} have a pass (left as it is; check them in Access).`];
  const changes = Object.keys(updates).length / 3;
  if (MODE === 'tidy' && changes) {
    const w = await fetch(`${DB}/.json`, { method: 'PATCH', headers: head, body: JSON.stringify(updates) });
    if (!w.ok) throw new Error('Writing: HTTP ' + w.status);
    const now = Date.now();
    await fetch(`${DB}/admin/audit/${now}_tidy.json`, { method: 'PUT', headers: head, body: JSON.stringify({
      action: 'accounts_tidied', detail: `${changes} waiting or declined accounts no longer carry a club, a club role or tools`,
      uid: 'github-actions', name: 'Button · Tidy waiting and declined accounts', email: '', ts: now, at: new Date(now).toISOString() }) });
    lines.push('', `Tidied ${changes} accounts.`);
  } else {
    lines.push('', changes ? `Nothing was changed. Run again with mode **tidy** and type tidy to clear ${changes}.` : 'Nothing needs tidying.');
  }
  const text = lines.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.log('::error::' + e.message); process.exit(1); });
}
