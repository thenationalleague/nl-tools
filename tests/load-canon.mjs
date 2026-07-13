/* Load system/nl-utils.js (a browser IIFE) inside a Node VM sandbox so its
   PURE helpers can be unit-tested without a browser.

   nl-utils.js guards everything that needs Firebase/DOM (see the
   `if (window.firebase ...)` checks), so with light stubs for window/document/
   storage it loads cleanly and exposes window.NL. Anything that genuinely needs
   the DOM or a live roster fetch (clubPicker rendering, ensureAuth, writeAudit)
   is out of scope here — this harness covers the string/data helpers only.

   Zero dependencies: node:vm + node:fs only. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, '..');

function memStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

const stubEl = () => ({
  style: {},
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  setAttribute() {}, removeAttribute() {}, appendChild() {}, addEventListener() {},
  querySelector() { return null; }, querySelectorAll() { return []; },
});

/* Inject the outer realm's intrinsics so any Date/Object the helpers return is
   the same realm the tests assert against (keeps `instanceof` honest). */
const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
  Promise, parseInt, parseFloat, isNaN, isFinite,
  encodeURIComponent, decodeURIComponent,
  document: {
    addEventListener() {}, removeEventListener() {},
    createElement: stubEl, getElementById() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    documentElement: { style: {} }, head: stubEl(), body: stubEl(),
  },
  navigator: { clipboard: null, userAgent: 'node-test' },
  location: { search: '', href: '', hash: '' },
  localStorage: memStore(),
  sessionStorage: memStore(),
  /* Serve the real clubs-meta.json off disk so NL.clubs.load()/byName/byOpta
     can be exercised; anything else is intentionally unstubbed. */
  fetch: (url) => {
    const u = String(url).split('?')[0];
    if (u.endsWith('clubs-meta.json')) {
      const body = readFileSync(join(REPO, 'assets/data/clubs-meta.json'), 'utf8');
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(body)) });
    }
    return Promise.reject(new Error('unstubbed fetch in test sandbox: ' + url));
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(readFileSync(join(REPO, 'system/nl-utils.js'), 'utf8'), sandbox, {
  filename: 'nl-utils.js',
});

if (!sandbox.window.NL) {
  throw new Error('nl-utils.js loaded but window.NL was not defined');
}

export const NL = sandbox.window.NL;
