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
