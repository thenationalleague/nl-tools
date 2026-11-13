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
  /* Every season's figures live under archive/<season>/ (Attendance
     v2.18.0); the old root submissions node keeps its rule until it goes. */
  assert.equal(a.archive.$season.submissions['.write'], levelRule('ops-attendance', 'admin'));
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

/* Manage on Newsletter, Club Kits, Save of the Month and Brand Exposure
   (13/11/2026): the League-wide nodes read at League + Access and write at
   League + Manage, generated; the pages decide by session.toolLevel. */
const lg = (k, min) => A + leagueRule() + ' && ' + levelRule(k, min).slice(A.length);

test('batch 1: every League-wide rule is generated', () => {
  const n = RULES['staff-newsletter'], k = RULES['ops-club-kits'], s = RULES['media-save-of-the-month'], b = RULES['ops-brand-exposure'];
  for (const x of ['editions', 'library']) {
    assert.equal(n[x]['.read'], lg('staff-newsletter', 'admin'));
    assert.equal(n[x]['.write'], lg('staff-newsletter', 'admin'));
  }
  assert.equal(k.submissions.$club['.write'], lg('ops-club-kits', 'admin'));
  assert.equal(s['.read'], lg('media-save-of-the-month', 'access'));
  assert.equal(s['.write'], lg('media-save-of-the-month', 'admin'));
  assert.equal(b.matches['.read'], lg('ops-brand-exposure', 'access'));
  assert.equal(b.matches['.write'], lg('ops-brand-exposure', 'admin'));
  assert.ok(b.matches.$matchId['.write'].includes("auth.token.be === $matchId"), 'the per-match token still writes');
});

test('batch 1: all four offer Manage, in both the old and the pass fields', () => {
  for (const key of ['staff-newsletter', 'ops-club-kits', 'media-save-of-the-month', 'ops-brand-exposure']) {
    assert.deepEqual(REG[key].levels, ['off', 'access', 'admin'], key);
    assert.deepEqual(REG[key].permissions.levels, ['off', 'access', 'manage'], key);
  }
  assert.equal(REG['staff-newsletter'].defaults.staff, 'off', 'Newsletter is the Media team\'s, not every League role\'s');
});

test('batch 1: the pages decide by the level, not the role', () => {
  const read = (f) => readFileSync(join(REPO, f), 'utf8');
  assert.match(read('newsletter/index.html'), /session\.toolLevel !== 'admin'/);
  assert.match(read('club-kits/index.html'), /S\.canManage = !!\(session && session\.toolLevel === 'admin'\)/);
  assert.match(read('save-of-the-month/admin/index.html'), /S\.canManage = !!\(session && session\.toolLevel === 'admin'\)/);
  const be = read('brand-exposure/index.html');
  assert.doesNotMatch(be, /canScan = !!\(session && session\.role === 'superadmin'\);/, 'the scanner asks the pass');
  assert.match(be, /NL\.pass\.isSkeleton\(bePass\)/);
});

test('Attendance has no Season admin, and every season reads one address', () => {
  const att = readFileSync(join(REPO, 'attendance/index.html'), 'utf8');
  assert.doesNotMatch(att, /data-panel="seasonadmin"|function wireSeasonAdmin/);
  assert.match(att, /function submissionsPath\(\) \{ return BASE_PATH \+ '\/archive\/' \+ \(S\.season \|\| S\.currentSeason\) \+ '\/submissions'; \}/);
  const fm = readFileSync(join(REPO, 'fixtures/index.html'), 'utf8');
  assert.match(fm, /return 'app-data\/ops-attendance\/archive\/' \+ key \+ '\/' \+ node;/, 'Fixture Management reads the same address');
});
