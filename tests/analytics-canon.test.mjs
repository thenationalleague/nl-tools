/* system/nl-analytics.js — the GA4 tag that loads on every page of nl.tools.

   Three kinds of thing are worth a test here, and they are not the same kind:

   1. THE PROMISES. The page tells readers there is no cookie and no personal
      detail, and /wellbeing-hub/ says so on a page about suicide. Those
      sentences are only true because of four settings in this file. A
      well-meant edit — "turn on Signals, we want demographics" — would make
      the page lie without breaking anything visibly. These are the tests
      that matter.

   2. THE BEHAVIOUR. NL.track must be safe to call when the tag never
      loaded, because every call site in the estate calls it unguarded.

   3. THE WIRING. That it is actually on the pages. lint-tools.sh owns that
      (and tests/lint-tools.test.mjs covers the lint), so it is not repeated.

   Loaded in a VM sandbox rather than parsed as text where possible: a
   grep-only test passes on a file that would throw on line one.

   Run with `npm test`. Zero dependencies. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { REPO } from './load-canon.mjs';

const SRC = readFileSync(join(REPO, 'system/nl-analytics.js'), 'utf8');

/* This file explains at length which settings it does NOT use and why. A
   guard that reads its own prose fires on the comment arguing against the
   thing, which is how a guard gets switched off. Strip comments first — the
   same trap brand-canon.test.mjs documents. */
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* Load it the way a browser does, with enough of a window to run. `appended`
   collects script tags so a test can see whether the real gtag was fetched,
   and `calls` records every gtag() argument list. */
function load({ hostname = 'nl.tools', protocol = 'https:', gaId } = {}) {
  const appended = [];
  const win = {
    location: { hostname, protocol, search: '' },
    console: { warn: (m) => win._warnings.push(m) },
    _warnings: [],
  };
  if (gaId !== undefined) win.NL_GA_ID = gaId;
  const document = {
    head: { appendChild: (el) => appended.push(el) },
    createElement: () => ({ set src(v) { this._src = v; }, get src() { return this._src; } }),
  };
  win.window = win;
  win.document = document;
  vm.createContext(win);
  vm.runInContext(code, win);

  const calls = (win.dataLayer || []).map((a) => Array.from(a));
  return { win, appended, calls, config: calls.find((c) => c[0] === 'config') };
}

test('the tag loads and configures the NL Tools property', () => {
  const { appended, config } = load();
  assert.ok(config, 'gtag("config", ...) was never called');
  assert.equal(config[1], 'G-NJQ0XQ0XCK');
  assert.equal(appended.length, 1, 'expected exactly one gtag script appended');
  assert.match(appended[0].src, /googletagmanager\.com\/gtag\/js\?id=G-NJQ0XQ0XCK/);
});

/* ── The promises ──────────────────────────────────────────────────────────
   Each of these four is load-bearing for a sentence shown to a reader. */

test('no cookie is written — this is what lets every page skip a consent banner', () => {
  const { config } = load();
  assert.equal(
    config[2].client_storage, 'none',
    'client_storage must stay "none". Without it gtag writes a _ga cookie, ' +
    'which brings every page on nl.tools inside UK PECR reg. 6 and requires ' +
    'a consent banner — including /wellbeing-hub/, which somebody may open ' +
    'in a crisis.'
  );
});

test('Google Signals is off — topic opens here are Art. 9 health data', () => {
  const { config } = load();
  assert.equal(
    config[2].allow_google_signals, false,
    'Signals joins this traffic to signed-in Google profiles across sites. ' +
    '"This person opened the suicide page" is special-category health data ' +
    'under UK GDPR Art. 9 and must never reach an advertising surface.'
  );
});

test('ad personalisation is off', () => {
  const { config } = load();
  assert.equal(config[2].allow_ad_personalization_signals, false);
});

test('Consent Mode is NOT set to denied anywhere', () => {
  assert.ok(
    !/consent/i.test(code),
    'Denying analytics_storage does not send less — gtag withholds the event ' +
    'and Google models a replacement, so the per-page counts stop being ' +
    'counts. Not setting a cookie in the first place is both stricter and ' +
    'more useful. If this ever changes, change the comment in the file too.'
  );
});

test('no identity is sent — not a uid, email, club or role', () => {
  for (const word of ['uid', 'email', 'user_id', 'session.role', 'NL_TOOL_KEY']) {
    assert.ok(
      !code.includes(word),
      `nl-analytics.js must not reference ${word}. Who opened what is ` +
      'recorded in RTDB under admin/audit by auth-guard, which is the right ' +
      'home for it: in-house and access controlled.'
    );
  }
});

/* ── The behaviour ─────────────────────────────────────────────────────────── */

test('NL.track exists and never throws when the tag is live', () => {
  const { win, calls } = load();
  assert.equal(typeof win.NL.track, 'function');
  win.NL.track('topic_open', { topic: 'crisis' });
  const ev = calls.concat((win.dataLayer || []).map((a) => Array.from(a)))
    .find((c) => c[0] === 'event' && c[1] === 'topic_open');
  assert.ok(ev, 'NL.track did not push an event');
  assert.deepEqual(ev[2], { topic: 'crisis' });
});

test('NL.track is a safe no-op on localhost, and nothing is measured there', () => {
  const { win, appended } = load({ hostname: 'localhost' });
  assert.equal(appended.length, 0, 'development traffic must not be measured');
  assert.equal(typeof win.NL.track, 'function');
  win.NL.track('anything', { a: 1 });   // must not throw
});

test('NL.track is a safe no-op when the id is malformed, and says why', () => {
  const { win, appended } = load({ gaId: 'not-an-id' });
  assert.equal(appended.length, 0);
  assert.equal(typeof win.NL.track, 'function');
  win.NL.track('anything');             // must not throw
  assert.ok(
    win._warnings.some((m) => /measurement id/.test(m)),
    'a malformed id silently measures nothing — it must warn'
  );
});

/* ── Drift between this file and the page that promises it ─────────────────
   /wellbeing-hub/ carries the privacy sentence a reader actually sees. The
   tag moved out of that page into canon on 08/10/2026, which is exactly the
   arrangement where one half gets edited and the other half keeps promising.
   It has happened on this page once already: the poster still said "nothing
   you look at is recorded" after GA4 went in. */

test('the hub still loads the canon tag and no longer carries its own', () => {
  const hub = readFileSync(join(REPO, 'wellbeing-hub/index.html'), 'utf8');
  const body = hub.replace(/<!--[\s\S]*?-->/g, '');
  assert.match(body, /\/system\/nl-analytics\.js\?v=\d+/);
  assert.ok(
    !/googletagmanager\.com/.test(body),
    'the hub is loading gtag itself again — two tags means every view ' +
    'counted twice. The canon file is the only place that should fetch it.'
  );
});

test('the hub does not promise it records nothing', () => {
  const hub = readFileSync(join(REPO, 'wellbeing-hub/index.html'), 'utf8');
  /* CSS and JS comments as well as HTML ones. This test is about the sentence
     a READER sees, and on its first run it fired on a `/* ... *\/` comment
     beside the @font-face rule — which was genuinely stale and has been
     fixed, but is not a promise to anybody. Prose explaining a decision has
     to be out of scope or the guard becomes a nuisance and gets deleted. */
  const body = hub
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  for (const re of [/nothing is recorded/i, /no analytics/i, /not recorded/i]) {
    assert.ok(
      !re.test(body),
      `the page says ${re} while loading a GA4 tag. Either the sentence or ` +
      'the tag has to go.'
    );
  }
});

test('the hub never sends what somebody typed into the search box', () => {
  const hub = readFileSync(join(REPO, 'wellbeing-hub/index.html'), 'utf8');
  /* The event is allowed; the value is not. Catch a params object built from
     the input's value on the same line as a track() call. */
  const bad = hub.match(/track\([^)]*\b(?:q|query|term|text)\s*:\s*[a-z]*\.?value/i);
  assert.equal(
    bad, null,
    'a search event is carrying the search text. People type free text into ' +
    'that box on a wellbeing page — report that a search happened, never what '
    + 'it was.'
  );
});
