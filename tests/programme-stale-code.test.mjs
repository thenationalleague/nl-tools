/* Programme Packs: a club code session minted before codes carried Manage
   (pManage, 13/11/2026) can read the library but the rules refuse its
   uploads, moves and deletes, and its claims never refresh. _shared.js v2.2
   signs such a session out so the gate asks for the passcode again.

   fromClaims is lifted out of _shared.js and run against stub users, so the
   test checks behaviour, not wording. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const SRC = read('programme/_shared.js');
const PAGE = read('programme/index.html');

function lift() {
  const start = SRC.indexOf('  function fromClaims(u) {');
  assert.ok(start > 0, 'fromClaims is in _shared.js');
  const end = SRC.indexOf('\n  }\n', start) + 4;
  const ctx = {
    PP: {}, signedOut: 0,
    NL: { codeGate: { signOut() { ctx.signedOut++; return Promise.resolve(); } } },
    ensureDefaultApp() { return {}; }, VIA_ADMIN: false, app: null, session: null,
  };
  vm.createContext(ctx);
  vm.runInContext(SRC.slice(start, end), ctx);
  return ctx;
}

const user = (claims, email) => ({
  email: email || null, isAnonymous: false,
  getIdTokenResult() { return Promise.resolve({ claims }); },
});

test('a code session without pManage is signed out and the gate asks again', async () => {
  const ctx = lift();
  const s = await ctx.fromClaims(user({ club: 'BUX', pClub: 'BUX' }));
  assert.equal(s, null, 'no session from an old code token');
  assert.equal(ctx.signedOut, 1, 'the old session is signed out');
  assert.equal(ctx.PP.reenter, true, 'the gate is told why');
});

test('a code session with pManage enters and can write', async () => {
  const ctx = lift();
  const s = await ctx.fromClaims(user({ club: 'BUX', pClub: 'BUX', pManage: true }));
  assert.equal(s.code, 'BUX');
  assert.equal(s.canWrite, true);
  assert.equal(ctx.signedOut, 0);
});

test('a Club card without Manage keeps its view-only session', async () => {
  const ctx = lift();
  const s = await ctx.fromClaims(user({ pClub: 'BUX' }, 'someone@example.org'));
  assert.equal(s.canWrite, false);
  assert.equal(s.viaCard, true);
  assert.equal(ctx.signedOut, 0, 'an account is never signed out here');
});

test('the gate says why it is asking again, and the page loads the new _shared.js', () => {
  assert.match(PAGE, /PP\.reenter \? 'Enter your club passcode again/);
  assert.match(PAGE, /\/programme\/_shared\.js\?v=12/);
});
