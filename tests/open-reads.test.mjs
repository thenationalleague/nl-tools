/* Which parts of the database anyone signed in, or anyone at all, can read.

   "Signed in" used to mean League staff. It no longer does: a club code
   session is signed in, a Matchday Live contributor link is signed in, and
   since club logins a Club card account is signed in with an email too. So
   a rule of `auth != null` (or `true`) is a decision that every one of them
   may read it. This file is the list of those decisions. A new one fails
   the test until it is added here with its reason.

   Two were closed on 14/11/2026 after this list was first drawn up:
   admin/invites-pending (every unused invite with its token: anyone holding
   a club code could have taken a League invite) and
   app-data/ops-club-kits/submissions (open to the world for a form retired
   on 15/10/2026). tests/emulator/exposure-rules.mjs checks both against the
   emulator. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const rules = JSON.parse(readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8')).rules;

const OPEN = {
  '/tools': 'the tool list: the portal and every door read it',
  '/access-grants': 'each tool\'s live grants: every door reads them on load',
  '/admin/invites/$token': 'one invite, by its secret token: the invite link reads it before an account exists',
  '/admin/welcome-messages': 'the portal\'s welcome notes',
  '/app-data/ops-vacancies/listings': 'job adverts, public by design',
  '/app-data/ops-vacancies/analytics': 'view counts on the public adverts',
  '/app-data/ops-judgements/records': 'published judgements, public by design',
  '/app-data/ops-attendance/fixtures': 'the fixture list clubs enter attendances against',
  '/app-data/ops-attendance/submissions': 'TO DECIDE: every club\'s submitted attendances, readable by any club session',
  '/app-data/ops-attendance/archive': 'TO DECIDE: past seasons\' attendances, readable by any club session',
  '/app-data/ops-fixture-management/seasons/$season/public': 'the public half of the fixtures record',
  '/app-data/ops-club-directory/published/at': 'when the open directory was last published',
  '/app-data/ops-club-directory/published/label': 'the open directory\'s label',
  '/app-data/ops-club-directory/published/orgs': 'the open directory\'s organisations',
  '/app-data/ops-club-directory/published/clubs/$club': 'the open directory: only what clubs agreed to publish',
  '/app-data/ops-commercial-benchmarking/aggregates': 'averages across clubs, with no club named',
  '/app-data/ops-handbook/draft': 'TO DECIDE: the handbook draft, readable by any club session',
  '/app-data/ops-handbook/publishedEditionId': 'which handbook edition is current'
};

function openReads(node, path = '', out = []) {
  for (const [k, v] of Object.entries(node)) {
    if (k === '.read') {
      const s = typeof v === 'string' ? v.trim() : v;
      if (s === true || s === 'true' || s === 'auth != null' || /^auth != null && auth\.token\.email != null$/.test(s)) out.push(path || '/');
    } else if (v && typeof v === 'object' && !k.startsWith('.')) openReads(v, path + '/' + k, out);
  }
  return out;
}

test('every part of the database open to anyone signed in is a recorded decision', () => {
  const found = openReads(rules);
  const unknown = found.filter((p) => !OPEN[p]);
  assert.deepEqual(unknown, [], 'open to every signed-in session (club codes included). Close it, or add it to OPEN with the reason:\n  ' + unknown.join('\n  '));
  const gone = Object.keys(OPEN).filter((p) => !found.includes(p));
  assert.deepEqual(gone, [], 'no longer open: take it off OPEN');
});

test('pending invites and kit submissions are not among them', () => {
  const found = openReads(rules);
  assert.ok(!found.includes('/admin/invites-pending'));
  assert.ok(!found.includes('/app-data/ops-club-kits/submissions'));
  assert.equal(rules.admin['invites-pending']['.read'], rules.admin.requests['.read'], 'read as pending requests are');
});
