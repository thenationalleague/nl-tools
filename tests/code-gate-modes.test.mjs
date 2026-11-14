/* NL.codeGate — two doors, one mode (nl-utils v1.57, 13/11/2026).

   A club page is in one mode at a time: signed in to NL Tools (an account,
   which has an email) or in by a club code (a custom-token session, which
   has none). resume() says which; ensure() gives an account session the NL
   Tools top bar in place of the club's white bar; the gate offers the
   sign-in as a second, quieter door.

   The Firebase stand-in is ours, shaped on the compat SDK's documented
   surface: auth().onAuthStateChanged(cb) calling back with the user or null,
   user.email (null for a custom-token sign-in), user.getIdTokenResult(force)
   resolving { claims } — https://firebase.google.com/docs/reference/js/v8/firebase.User
   and database().ref(p).once('value') resolving a snapshot with val(). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { REPO, stubEl } from './load-canon.mjs';

function canonWith(user, records, bar) {
  const rendered = [];
  const slots = [];
  const sandbox = {
    console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Boolean,
    RegExp, Error, Promise, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    TextEncoder,
    document: {
      addEventListener() {}, removeEventListener() {},
      createElement: (t) => { const e = stubEl(t); slots.push(e); return e; },
      createElementNS: (ns, t) => stubEl(t),
      getElementById() { return null; },
      querySelector(sel) { return sel === '.nl-idbar' ? bar : null; },
      querySelectorAll() { return []; },
      documentElement: { style: {} }, head: stubEl(), body: stubEl(),
    },
    navigator: { userAgent: 'node-test' },
    location: { search: '', href: '', hash: '', pathname: '/dazn/' },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    firebase: {
      auth: () => ({
        currentUser: user,
        onAuthStateChanged(cb) { setTimeout(() => cb(user), 0); return () => {}; },
      }),
      database: () => ({ ref: (p) => ({ once: () => Promise.resolve({ val: () => records[p] || null }) }) }),
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(REPO, 'system/nl-utils.js'), 'utf8'), sandbox, { filename: 'nl-utils.js' });
  sandbox.NL.renderTopbar = (s) => rendered.push(JSON.parse(JSON.stringify(s)));
  return { NL: sandbox.NL, rendered, sandbox };
}
const claims = { club: 'fgr', clubName: 'Forest Green Rovers' };
const account = { uid: 'u1', email: 'c@example.invalid', getIdTokenResult: () => Promise.resolve({ claims }) };
const code = { uid: 'cc-fgr', email: null, isAnonymous: false, getIdTokenResult: () => Promise.resolve({ claims }) };
const record = { 'users/u1': { name: 'Test Secretary', role: 'club-admin', pass: { base: 'club', club: 'Forest Green Rovers', issued: 1 } } };

test('resume says which door: an NL Tools account', async () => {
  const { NL } = canonWith(account, record, null);
  const s = await NL.codeGate.resume('club');
  assert.equal(s.mode, 'account');
  assert.equal(s.role, 'fgr');
});

test('resume says which door: a club code', async () => {
  const { NL } = canonWith(code, {}, null);
  assert.equal((await NL.codeGate.resume('club')).mode, 'code');
});

test('an account session gets the NL Tools top bar, and the club bar is hidden', async () => {
  const bar = stubEl('header'); bar.parentNode = { insertBefore() {} };
  const { NL, rendered } = canonWith(account, record, bar);
  const s = await NL.codeGate.ensure({ claim: 'club', account: { title: 'DAZN Viewership', toolKey: 'media-dazn' } });
  assert.equal(s.mode, 'account');
  assert.equal(bar.hidden, true);
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].name, 'Test Secretary');
  assert.equal(rendered[0].pass.base, 'club');
});

test('a code session keeps the club bar', async () => {
  const bar = stubEl('header');
  const { NL, rendered } = canonWith(code, {}, bar);
  const s = await NL.codeGate.ensure({ claim: 'club', account: { title: 'DAZN Viewership', toolKey: 'media-dazn' } });
  assert.equal(s.mode, 'code');
  assert.notEqual(bar.hidden, true);
  assert.equal(rendered.length, 0);
});

test('the gate offers the second door, back to this page, unless told not to', () => {
  const src = readFileSync(join(REPO, 'system/nl-utils.js'), 'utf8');
  assert.match(src, /opts\.signIn === false \? '' :/);
  assert.match(src, /<div class="gate__alt"><a href="\/\?next=' \+\s*esc\(encodeURIComponent\(location\.pathname \+ location\.search\)\)/);
  assert.match(readFileSync(join(REPO, 'system/nl-brand.css'), 'utf8'), /^\.gate__alt a \{/m);
});

test('the sign-in page goes back only to a path on this site', () => {
  const page = readFileSync(join(REPO, 'index.html'), 'utf8');
  const m = page.match(/return \(\/(.+?)\/\.test\(n\)\)/);
  assert.ok(m, 'the ?next= check in index.html has moved');
  const re = new RegExp(m[1]);
  for (const ok of ['/dazn/', '/programme/?x=1']) assert.ok(re.test(ok), ok);
  for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)']) assert.ok(!re.test(bad), bad);
});

test('every club page on the shared door asks for the account bar and loads the top bar', () => {
  for (const d of ['commercial-compliance', 'dazn', 'document-library', 'financial-benchmarking', 'save-of-the-month', 'club-directory', 'programme']) {
    const html = readFileSync(join(REPO, d, 'index.html'), 'utf8');
    assert.match(html, /<script src="\/system\/nl-topbar\.js\?v=\d+"><\/script>/, d + ': nl-topbar.js');
    assert.match(html, /accountBar|account: \{ title:/, d + ': account bar');
  }
});

test('a League account at a club page is warned that a code would sign it out', () => {
  const src = readFileSync(join(REPO, 'system/nl-utils.js'), 'utf8');
  assert.match(src, /\(signedInAs\(\) \? '<div class="gate__alt">You are signed in to NL Tools as '/);
  assert.match(src, /A code here signs you out of NL Tools in this browser\./);
  /* Document Library is one page (14/11/2026): no League page to send to. */
  for (const d of ['dazn', 'save-of-the-month', 'commercial-compliance']) {
    assert.match(readFileSync(join(REPO, d, 'index.html'), 'utf8'), /staffUrl: '\/[a-z-]+\/admin\/'/, d);
  }
});

/* v1.61 (13/11/2026): a League account at a club code door is sent to the
   League page instead of being shown the code card. */
test('a League account at a code door goes to the League page', () => {
  const utils = readFileSync(join(REPO, 'system/nl-utils.js'), 'utf8');
  const open = utils.slice(utils.indexOf('function codeGateOpen('), utils.indexOf('function codeGateResume('));
  assert.match(open, /if \(signedInAs\(\) && opts\.staffUrl\) \{\s*location\.replace\(opts\.staffUrl\);/);
  const dir = readFileSync(join(REPO, 'club-directory/index.html'), 'utf8');
  assert.match(dir, /staffUrl: '\/club-directory\/admin\/'/);
  /* Programme Packs is one page (v1.32): a League account opens the
     all-clubs library here instead of being sent to a second page. */
  const pp = readFileSync(join(REPO, 'programme/index.html'), 'utf8');
  assert.match(pp, /if \(me && me\.email\) \{ enterLeague\(me\); return; \}/);
});

/* 13/11/2026: one club code door. Programme Packs checks a club's passcode
   through the shared clubCodeAuth like every club page, and the Handbook
   reader has both doors. */
test('Programme Packs: club codes through the shared door, no remembered passcode', () => {
  const pp = readFileSync(join(REPO, 'programme/_shared.js'), 'utf8');
  const enter = pp.slice(pp.indexOf('function enter(code)'), pp.indexOf('function fromClaims('));
  assert.match(enter, /NL\.codeGate\.viaFunction\(CODES_ROOT, \{ tool: 'programme' \}\)/);
  assert.doesNotMatch(enter, /requestGrant/, 'the club door no longer uses programmeAuth');
  assert.doesNotMatch(pp, /localStorage\.setItem\(REMEMBER_KEY/, 'no passcode kept on the device');
  assert.doesNotMatch(pp, /handOff:/, 'no handOff export');
  const page = readFileSync(join(REPO, 'programme/index.html'), 'utf8');
  assert.match(page, /data-tab="library">Library<\/button>[\s\S]*data-tab="access">Manage<\/button>/, 'Library first, Manage last');
  const con = readFileSync(join(REPO, 'programme/_console.js'), 'utf8');
  assert.match(con, /'\/programme\/#\/' \+ encodeURIComponent\(code\)/, 'Open shows that club in the Library');
});

test('the Handbook reader has both doors', () => {
  const r = readFileSync(join(REPO, 'handbook/_reader.js'), 'utf8');
  assert.match(r, /staffUrl: '\/handbook\/'/);
  assert.match(r, /account: \{ title: 'Handbook', toolKey: 'ops-handbook' \}/);
  assert.match(readFileSync(join(REPO, 'handbook/reader/index.html'), 'utf8'), /nl-topbar\.js\?v=/);
});
