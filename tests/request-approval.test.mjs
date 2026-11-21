/* Requests ask for zones; approving is issuing the pass (16/11/2026; sign-in
   page v5.5, My pass v2.12, Access v2.13). The server half is run for real in
   tests/access-sweep.test.mjs; these pin the pages. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const signin = readFileSync(join(REPO, 'index.html'), 'utf8');
const pass = readFileSync(join(REPO, 'pass/index.html'), 'utf8');
const fn = (src, name) => src.slice(src.indexOf('function ' + name + '('), src.indexOf('\n  }\n', src.indexOf('function ' + name + '(')));

test('the sign-up asks for Club zones and a reason, never tools or a role', () => {
  assert.match(signin, /name: name, club: club, jobTitle: jobTitle, zones: zones, reason: reason/);
  assert.doesNotMatch(signin, /selectedTools|name="reqTool"/);
  assert.match(signin, /P\.KEYS\.filter\(function \(k\) \{ return k\.base === 'club'; \}\)/, 'only the Club zones are offered');
  assert.match(signin, /if \(Object\.keys\(zones\)\.length && !reason\)/, 'a zone asked for needs a reason');
});

test('the issue form fills from a waiting request and only from a waiting one for that person', () => {
  assert.match(pass, /if \(req && req\.uid === uid && req\.status === 'pending'\) STATE\.issue\.request = /);
  const c = fn(pass, 'choosePerson');
  assert.match(c, /iss\.base = 'club';/, 'a request is for a Club card');
  assert.match(c, /req\.zones\[z\] === true && P\.KEY\[z\] && P\.KEY\[z\]\.base === 'club'/, 'only Club zones asked for are ticked');
  assert.match(c, /'Approve and issue pass'/);
});

test('invites are issued on the same form: a pass left in the sender\'s name, a role from the card, never chosen', () => {
  const s = fn(pass, 'sendInviteNow');
  assert.match(s, /passRef\.set\(\{ pass: pass, by: STATE\.session\.uid, at: now \}\)/, 'the pass waits beside the invite, in the sender\'s name');
  assert.ok(s.indexOf('passRef.set(') < s.indexOf("action: 'sendInvite'"), 'left before the email goes, so it is there when the link is used');
  assert.match(s, /var role = pass\.base === 'league' \? 'staff' : \(P\.holds\(pass, 'club-operations'\) \? 'club-admin' : 'club-staff'\);/);
  assert.match(s, /db\.ref\('admin\/external-invites'\)\.push\(\)/, 'an External invite makes the account through the cloud job');
  assert.match(s, /if \(result && result\.ok === false\) \{ passRef\.remove\(\)/, 'a refused invite takes its pass away');
  const access = readFileSync(join(REPO, 'access/index.html'), 'utf8');
  assert.match(access, /href="\/pass\/\?view=issue&invite=1"/);
  assert.doesNotMatch(access, /name="pcInvRole"|pcInvRoles/, 'no role to choose');
});
