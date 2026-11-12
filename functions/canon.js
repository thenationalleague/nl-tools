/**
 * NL Tools — the shared canon (system/nl-utils.js), loaded on the server.
 *
 * WHY: the access rules (NL.pass: explain, toOld, withLiveAll) must have ONE
 * copy. The browser loads system/nl-utils.js; a function that worked them out
 * from its own copy would drift from it, and a drift here is someone opening
 * a tool the page says they cannot, or the reverse. So the function loads the
 * same file.
 *
 * WHERE FROM: Firebase deploys the functions/ folder only, so the deploy
 * workflow copies system/nl-utils.js to functions/canon/nl-utils.js first
 * (.github/workflows/deploy-functions.yml; the copy is git-ignored). Run from
 * the repo (the tests), the file is read from system/ directly.
 *
 * HOW: nl-utils.js is a browser script that guards everything needing the DOM
 * or Firebase, so it runs in a node:vm sandbox with a few inert stand-ins for
 * window, document and storage, the same way tests/load-canon.mjs loads it.
 * Only the pure helpers are used here.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function source() {
  const shipped = path.join(__dirname, "canon", "nl-utils.js");
  if (fs.existsSync(shipped)) return fs.readFileSync(shipped, "utf8");
  return fs.readFileSync(path.join(__dirname, "..", "system", "nl-utils.js"), "utf8");
}

function inertEl() {
  return {
    style: {}, children: [], classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild(c) { return c; }, insertBefore(c) { return c; }, removeChild(c) { return c; },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
  };
}
function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
}

let cached = null;
/* window.NL from system/nl-utils.js. Loaded once per instance. */
function loadCanon() {
  if (cached) return cached;
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    TextEncoder,
    document: {
      addEventListener() {}, removeEventListener() {},
      createElement: inertEl, createElementNS: inertEl, getElementById() { return null; },
      querySelector() { return null; }, querySelectorAll() { return []; },
      documentElement: { style: {} }, head: inertEl(), body: inertEl(),
    },
    navigator: { userAgent: "nl-tools-functions" },
    location: { search: "", href: "", hash: "" },
    localStorage: memStore(),
    sessionStorage: memStore(),
    fetch: () => Promise.reject(new Error("no fetch on the server canon")),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source(), sandbox, { filename: "nl-utils.js" });
  if (!sandbox.NL || !sandbox.NL.pass) throw new Error("nl-utils.js loaded without NL.pass");
  cached = sandbox.NL;
  return cached;
}

module.exports = { loadCanon };
