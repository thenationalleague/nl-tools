/* NL.infoTip, the (i) (nl-utils v1.70, nl-brand v2.82): what it draws, and
   how the one page-wide listener opens and closes it. The listener is driven
   here through a recording document stub; layout is not testable in Node,
   so placement is only checked to land on the screen. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NL, REPO, freshCanon } from './load-canon.mjs';

test('html: an (i) button tied to its panel, named for a screen reader, closed to start', () => {
  const h = NL.infoTip.html({ label: 'About Access & Manage', title: 'Access <and> Manage', body: ['<b>Access</b> – look', 'Second'] });
  const id = /aria-controls="(nl-info-\d+)"/.exec(h)[1];
  assert.match(h, new RegExp('<span class="info-tip__pop" id="' + id + '" role="dialog"'));
  assert.match(h, /aria-expanded="false"/);
  assert.match(h, /aria-label="About Access &amp; Manage"/, 'the label is escaped');
  assert.match(h, /<span class="info-tip__title">Access &lt;and&gt; Manage<\/span>/, 'the title is escaped');
  assert.match(h, /<span class="info-tip__p"><b>Access<\/b> – look<\/span><span class="info-tip__p">Second<\/span>/, 'body is trusted HTML, a paragraph each');
  assert.match(h, /sprites\.svg#icon-info/, 'the sprite\'s info icon');
  assert.match(h, /type="button"/, 'never submits a form it sits in');
});

test('html: every (i) gets its own panel id; a single body string is one paragraph', () => {
  const a = NL.infoTip.html({ label: 'a', body: 'x' }), b = NL.infoTip.html({ label: 'b', body: 'y' });
  assert.notEqual(/aria-controls="([^"]+)"/.exec(a)[1], /aria-controls="([^"]+)"/.exec(b)[1]);
  assert.equal((a.match(/info-tip__p"/g) || []).length, 1);
  assert.doesNotMatch(NL.infoTip.html({ label: 'no title', body: 'x' }), /info-tip__title/);
});

function page() {
  const listeners = {};
  const classes = () => { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), toggle() {} }; };
  const pop = { classList: classes(), style: {}, offsetWidth: 300, offsetHeight: 120 };
  const attrs = {};
  const btn = {
    focused: false,
    setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => attrs[k],
    getBoundingClientRect: () => ({ left: 900, right: 924, top: 500, bottom: 524, width: 24 }),
    focus() { this.focused = true; },
  };
  btn.setAttribute('aria-controls', 'nl-info-1');
  btn.setAttribute('aria-expanded', 'false');
  btn.closest = (sel) => (sel === '.info-tip__btn' ? btn : null);
  const inPop = { closest: (sel) => (sel === '.info-tip__pop' ? pop : null) };
  const elsewhere = { closest: () => null };
  const doc = {
    addEventListener: (type, fn, cap) => { (listeners[type] ||= []).push({ fn, cap }); },
    removeEventListener() {}, createElement: () => ({}), createElementNS: () => ({}),
    getElementById: (id) => (id === 'nl-info-1' ? pop : null),
    querySelector() { return null; }, querySelectorAll() { return []; },
    documentElement: { style: {}, clientWidth: 1000 }, head: {}, body: {},
  };
  freshCanon({ document: doc, innerHeight: 600, addEventListener() {} });
  const fire = (type, ev) => { let stopped = false, prevented = false;
    listeners[type].forEach((l) => l.fn(Object.assign({ preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } }, ev)));
    return { stopped, prevented }; };
  return { listeners, pop, btn, attrs, inPop, elsewhere, fire };
}

test('the listener: a click on the (i) opens its panel, on the screen, and goes no further', () => {
  const p = page();
  assert.ok(p.listeners.click.every((l) => l.cap === true), 'listens in the capture phase, before a row or a link can act');
  const r = p.fire('click', { target: p.btn });
  assert.ok(p.pop.classList.contains('is-open'));
  assert.equal(p.attrs['aria-expanded'], 'true');
  assert.ok(r.stopped && r.prevented, 'a link or clickable row around it does not also fire');
  const left = parseInt(p.pop.style.left, 10), top = parseInt(p.pop.style.top, 10);
  assert.ok(left >= 8 && left + 300 <= 1000 - 8, 'kept inside the window: ' + left);
  assert.ok(top >= 0 && top + 120 <= 600, 'below or above the button, on the screen: ' + top);
});

test('the listener: a click inside the panel keeps it open; elsewhere, the (i) again or Esc close it', () => {
  const p = page();
  p.fire('click', { target: p.btn });
  p.fire('click', { target: p.inPop });
  assert.ok(p.pop.classList.contains('is-open'), 'reading the panel does not close it');
  p.fire('click', { target: p.elsewhere });
  assert.ok(!p.pop.classList.contains('is-open'), 'a tap elsewhere closes it');
  assert.equal(p.attrs['aria-expanded'], 'false');
  p.fire('click', { target: p.btn });
  p.fire('click', { target: p.btn });
  assert.ok(!p.pop.classList.contains('is-open'), 'the (i) again closes it');
  p.fire('click', { target: p.btn });
  p.fire('keydown', { key: 'Escape' });
  assert.ok(!p.pop.classList.contains('is-open'), 'Esc closes it');
  assert.ok(p.btn.focused, 'and hands focus back to the (i)');
});

test('.info-tip in nl-brand.css: a fixed panel above dropdowns, tokened, and the Style Guide shows it', () => {
  const css = readFileSync(join(REPO, 'system/nl-brand.css'), 'utf8');
  const i = css.indexOf('\n.info-tip {'), end = css.indexOf('\n/* WIDGET: Club picker', i);
  assert.notEqual(i, -1);
  const block = css.slice(i, end);
  assert.match(block, /\.info-tip__pop \{[^}]*position: fixed/, 'fixed, so no card or dialog clips it');
  assert.match(block, /\.info-tip__pop \{[^}]*z-index: 150/, 'the dropdown rung');
  assert.match(block, /\.modal-backdrop \.info-tip__pop \{ z-index: 210; \}/, 'and above a dialog when it sits in one');
  assert.match(block, /\.info-tip__pop\.is-open \{ display: block; \}/);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'tokens only');
  const sg = readFileSync(join(REPO, 'style-guide/index.html'), 'utf8');
  assert.match(sg, /NL\.infoTip\.html\(/, 'the Style Guide shows the (i)');
});
