/* Signed out at a tool: sign in, then land back on that tool (auth-guard
   v16.4, sign-in page v5.3). Runs the guard's own run() (lifted by name out
   of system/auth-guard.js) with nobody signed in, then feeds the address it
   redirects to through the sign-in page's own ?next= check. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const GUARD = readFileSync(join(REPO, 'system/auth-guard.js'), 'utf8');
const SIGNIN = readFileSync(join(REPO, 'index.html'), 'utf8');

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

/* Where the guard sends a signed-out visitor to this address. */
async function guardRedirect(pathname, search = '', hash = '') {
  let to = null, resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const ctx = {
    location: { pathname, search, hash, replace(u) { to = u; resolveDone(); } },
    firebase: { auth: () => ({ currentUser: null, onAuthStateChanged(cb) { setTimeout(() => cb(null), 0); return () => {}; } }) },
    nlSession: { read() { return null; }, clear() {} },
    setStatus() {},
    setTimeout, clearTimeout,
    encodeURIComponent,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const login = GUARD.match(/var LOGIN_URL\s*=\s*'([^']+)'/)[1];
  vm.runInContext(['var LOGIN_URL = ' + JSON.stringify(login) + ';', 'var AUTH_TIMEOUT_MS = 1000;',
    lift(GUARD, 'waitForFirebaseUser'), lift(GUARD, 'run'), 'run();'].join('\n'), ctx);
  await Promise.race([done, new Promise((r) => setTimeout(r, 2000))]);
  return to;
}

/* What the sign-in page does after sign-in, given the address it was opened at. */
function afterSignIn(url) {
  const src = SIGNIN.match(/var NEXT_URL = \(function \(\) \{[\s\S]*?\}\)\(\);/)[0];
  const u = new URL(url, 'https://nl.tools');
  const ctx = { location: { search: u.search }, URLSearchParams };
  vm.createContext(ctx);
  vm.runInContext("var PORTAL_URL = '/portal/';\n" + src + '\nvar AFTER_SIGN_IN = NEXT_URL || PORTAL_URL;', ctx);
  return ctx.AFTER_SIGN_IN;
}

test('signed out at a tool: the guard sends you to sign in with the page you asked for', async () => {
  const to = await guardRedirect('/fixtures/', '?tab=broadcast', '#week-3');
  assert.equal(to, '/?next=' + encodeURIComponent('/fixtures/?tab=broadcast#week-3'));
});

test('round trip: after sign-in you land on the page you asked for', async () => {
  const to = await guardRedirect('/graphics/totw/', '?season=2026');
  assert.equal(afterSignIn(to), '/graphics/totw/?season=2026');
});

test('the sign-in page refuses to send you off the site', () => {
  for (const bad of ['//example.com/', '/\\example.com', 'https://example.com/', 'javascript:alert(1)', '']) {
    assert.equal(afterSignIn('/?next=' + encodeURIComponent(bad)), '/portal/', bad);
  }
});

test('waiting for approval: once approved you also go to the page you asked for', () => {
  const listener = lift(SIGNIN, 'startPendingListener');
  assert.match(listener, /location\.replace\(AFTER_SIGN_IN\)/);
});
