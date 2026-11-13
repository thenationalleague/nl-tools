/* The pass decides everywhere (auth-guard v16.3, portal v16.3).
   Runs the door's own decision code (decideByPass and the helpers it calls,
   lifted out of system/auth-guard.js by name) against made-up people, and
   checks the portal asks the same question. No real people: every pass and
   role here is invented. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NL, REPO } from './load-canon.mjs';

const GUARD = readFileSync(join(REPO, 'system/auth-guard.js'), 'utf8');
const PORTAL = readFileSync(join(REPO, 'portal/index.html'), 'utf8');
const REGISTRY = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));
const NOW = Date.now();
const k = (...ids) => Object.fromEntries(ids.map((id) => [id, { given: NOW - 86400000, by: 'u-a' }]));
const league = (...keys) => ({ base: 'league', keys: k(...keys), issued: { at: NOW - 86400000, by: 'u-a' } });
const club = (...keys) => ({ base: 'club', club: 'Example Town', keys: k(...keys), issued: { at: NOW - 86400000, by: 'u-a' } });
const skeleton = () => ({ ...league(), skeleton: { given: NOW - 86400000, by: 'u-a' } });

/* Lift a named function declaration out of a source file. */
function lift(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' not found');
  let depth = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  return src.slice(start, i + 1);
}

/* Ask the door: returns what the page would get. */
function door(toolKey, session, { path = '/somewhere/' } = {}) {
  const out = { level: null, granted: false, unavailable: null, redirect: null, audit: [] };
  const NLx = Object.create(NL);
  NLx.writeAudit = (a, d) => out.audit.push(a + ' ' + d);
  const ctx = {
    NL: NLx, NL_TOOL_KEY: toolKey, sessionStorage: { getItem() { return null; }, setItem() {} },
    location: { pathname: path, replace(u) { out.redirect = u; } },
    grantAccess() { out.granted = true; },
    showUnavailable(s, reason) { out.unavailable = reason; },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const access = GUARD.match(/var ACCESS_TOOL = '([^']+)'/)[1];
  vm.runInContext(['var ACCESS_TOOL = ' + JSON.stringify(access) + ';',
    lift(GUARD, 'toClubPage'), lift(GUARD, 'notePassFinding'),
    lift(GUARD, 'oldDoorLevel'), lift(GUARD, 'decideByPass')].join('\n'), ctx);
  const rec = REGISTRY[toolKey];
  ctx.decideByPass(session, rec);
  out.level = session.toolLevel;
  return out;
}
const as = (pass, role = '') => ({ pass, role, tools: {} });

/* The fix itself: "League only" read the old role, so this person saw the
   card on the portal and was refused at the door. */
test('a League pass with an old club role opens a League tool', () => {
  const r = door('staff-website-archive', as(league(), 'club-staff'));
  assert.equal(r.granted, true);
  assert.equal(r.level, 'access');
});

test('a League pass with no role at all opens what its card grants', () => {
  const r = door('media-content-plan', as(league('league-media'), ''));
  assert.equal(r.level, 'admin', 'the Media key gives Manage');
});

test('the superadmin role no longer opens a tool the pass does not', () => {
  const r = door('staff-newsletter', as(league(), 'superadmin'));
  assert.equal(r.granted, false);
  assert.equal(r.unavailable, 'no access (pass)');
});

test('the Skeleton key opens everything at Manage, whatever the role', () => {
  for (const key of ['staff-newsletter', 'ops-club-codes', 'ops-estate']) {
    const r = door(key, as(skeleton(), 'staff'));
    assert.equal(r.level, 'admin', key);
  }
});

test('the way back in: the superadmin role always opens Access, and it is logged', () => {
  const r = door('ops-people', as(league(), 'superadmin'));
  assert.equal(r.level, 'admin');
  assert.ok(r.audit.some((a) => a.startsWith('access_way_back')));
});

test('the way back in opens Access only, and only for the superadmin role', () => {
  assert.equal(door('ops-people', as(league(), 'admin')).granted, false);
  assert.equal(door('ops-club-codes', as(league(), 'superadmin')).granted, false);
});

test('a Club card at a League tool is refused, whatever its keys', () => {
  const r = door('ops-fixture-management', as(club('club-operations'), 'club-admin'));
  assert.equal(r.granted, false);
});

test('a Club card at a League tool with a club page goes to the club page', () => {
  const r = door('media-programme', as(club('club-media'), 'club-admin'), { path: '/programme/admin/' });
  assert.equal(r.redirect, '/programme/');
  assert.equal(r.granted, false);
});

test('the guard sends every issued pass to decideByPass before any role check', () => {
  const check = lift(GUARD, 'checkAccess');
  const toPass = check.indexOf('decideByPass(');
  assert.ok(toPass > 0);
  assert.ok(toPass < check.indexOf("session.role === 'superadmin'"), 'the pass is asked before the superadmin role');
  assert.ok(toPass < check.indexOf('toolData.audience'), 'the pass is asked before the League-only check');
});

test('the portal asks the pass before the superadmin role, and opens Access the same way', () => {
  const fn = lift(PORTAL, 'getAccessLevel');
  const passAt = fn.indexOf('NL.pass.isIssued(ud.pass)');
  assert.ok(passAt > 0);
  assert.ok(passAt < fn.indexOf("ud.role === 'superadmin') return 'admin'"));
  assert.ok(!/STATE\.isSuperAdmin/.test(fn), 'no superadmin shortcut ahead of the pass');
  assert.match(fn, /toolKey === 'ops-people' && ud\.role === 'superadmin'/);
  assert.equal(GUARD.match(/var ACCESS_TOOL = '([^']+)'/)[1], 'ops-people');
});
