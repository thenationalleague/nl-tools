/* The League check and the two tools moved onto the pass on 13/11/2026.
   leagueRule (scripts/rtdb-level-rule.mjs) was written by hand for Commercial
   Benchmarking first, then generated for Attendance. These keep every user
   of it on the generated text, so the copies cannot drift. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';
import { levelRule, leagueRule } from '../scripts/rtdb-level-rule.mjs';

const RULES = JSON.parse(readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8')).rules['app-data'];
const REG = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));
const A = 'auth != null && ';
const leagueManage = (k) => A + leagueRule() + ' && ' + levelRule(k, 'admin').slice(A.length);

test('Commercial Benchmarking still uses the generated League check', () => {
  assert.ok(RULES['ops-commercial-benchmarking'].clubs['.read'].includes(leagueRule()));
});

test('Attendance: fixtures and audit logs are League and Manage; submissions are Manage', () => {
  const a = RULES['ops-attendance'];
  assert.equal(a.fixtures['.write'], leagueManage('ops-attendance'));
  assert.equal(a['fixtures-audit']['.read'], leagueManage('ops-attendance'));
  assert.equal(a['submissions-audit']['.read'], leagueManage('ops-attendance'));
  assert.equal(a.submissions['.write'], levelRule('ops-attendance', 'admin'));
});

test('Handbook: every write is League and Manage', () => {
  const h = RULES['ops-handbook'];
  for (const w of [h.draft['.write'], h.editions['.write'], h.publishedEditionId['.write'], h.audit['.write'], h.audit['.read']]) {
    assert.equal(w, leagueManage('ops-handbook'));
  }
  assert.ok(h.editions['.read'].includes('auth.token.club != null'), 'club codes still read past editions');
});

test('both tools offer Manage, so the pass can give it', () => {
  for (const k of ['ops-attendance', 'ops-handbook']) {
    assert.deepEqual(REG[k].levels, ['off', 'access', 'admin'], k);
    assert.deepEqual(REG[k].permissions.levels, ['off', 'access', 'manage'], k);
  }
  assert.equal(REG['ops-attendance'].defaults['club-admin'], 'admin', 'a club secretary without a pass still submits');
});

test('neither page decides by the old role', () => {
  const att = readFileSync(join(REPO, 'attendance/index.html'), 'utf8');
  const body = att.slice(att.indexOf('function who()'));
  assert.ok(!/S\.session\.role/.test(body), 'Attendance never reads S.session.role in its code');
  assert.ok(!/NL\.canClubEdit\(|NL\.isClubUser\(S\.session/.test(att));
  const hb = readFileSync(join(REPO, 'handbook/index.html'), 'utf8');
  assert.match(hb, /function canEdit\(\)\s*\{ return S\.level === 'admin'; \}/);
  assert.match(hb, /function canSeed\(\)\s*\{ return S\.skeleton; \}/);
});
