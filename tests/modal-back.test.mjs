/* nl-utils v1.66: back closes a dialog. Run against a fake browser history
   that behaves like the real one where it matters: pushState trims forward
   entries, back() fires popstate with the landed entry's state, and a hash
   link pushes an entry and fires popstate then hashchange. Checked against a
   real Chromium as well (see the PR); this pins the rules. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshCanon } from './load-canon.mjs';

function fakeBrowser() {
  const listeners = {};
  const entries = [{ state: null, url: 'https://nl.tools/before/' }, { state: null, url: 'https://nl.tools/tool/#/a' }];
  let i = 1;
  const fire = (t, ev) => (listeners[t] || []).slice().forEach((f) => f(ev));
  const hashOf = (u) => u.split('#')[1] || '';
  const history = {
    get state() { return entries[i].state; },
    get length() { return entries.length; },
    pushState(st, _t, url) { entries.splice(i + 1); entries.push({ state: st, url: url ? String(url) : entries[i].url }); i++; },
    replaceState(st, _t, url) { entries[i] = { state: st, url: url ? String(url) : entries[i].url }; },
    back() {
      if (i === 0) return;
      const from = entries[i].url; i--;
      fire('popstate', { state: entries[i].state });
      if (hashOf(from) !== hashOf(entries[i].url)) fire('hashchange', {});
    },
  };
  const location = { get href() { return entries[i].url; }, search: '', hash: '' };
  /* A hash link: the browser's own push, not the page's pushState. */
  const nativePush = history.pushState;
  const follow = (hash) => {
    nativePush.call(history, null, '', entries[i].url.split('#')[0] + hash);
    fire('popstate', { state: null }); fire('hashchange', {});
  };
  return {
    extra: { history, location, addEventListener(t, f) { (listeners[t] ||= []).push(f); }, removeEventListener() {} },
    at: () => i, url: () => entries[i].url, count: () => entries.length, follow,
  };
}

function setup() {
  const b = fakeBrowser();
  const NL = freshCanon(b.extra);
  const open = (o) => { let closed = false; const c = NL.modal(Object.assign({ title: 'T', body: 'x', onClose() { closed = true; } }, o)); return { c, closed: () => closed }; };
  return { b, NL, open, history: b.extra.history };
}

test('back closes the dialog and stays on the page', () => {
  const { b, open, history } = setup();
  const d = open();
  assert.equal(b.count(), 3, 'one step for the dialog');
  assert.equal(b.url(), 'https://nl.tools/tool/#/a', 'same address');
  history.back();
  assert.ok(d.closed());
  assert.equal(b.at(), 1);
});

test('closed another way: no history.back, the step is reused, one back still leaves', () => {
  const { b, open, history } = setup();
  const d = open(); d.c.close();
  assert.equal(b.at(), 2, 'Close does not call back (code may navigate next)');
  const e = open();
  assert.equal(b.count(), 3, 'the next dialog reuses the spare step');
  e.c.close();
  history.back();
  assert.equal(b.at(), 0, 'one press left the page, not a press that seemed to do nothing');
});

test('nested: back closes the top dialog, then the one under it', () => {
  const { open, history } = setup();
  const a = open(); const c = open();
  history.back();
  assert.ok(c.closed()); assert.ok(!a.closed());
  history.back();
  assert.ok(a.closed());
});

test('a hash link after a dialog closed is a normal back', () => {
  const { b, open, history } = setup();
  open().c.close();
  b.follow('#/b');
  history.back();
  assert.equal(b.url(), 'https://nl.tools/tool/#/a', 'back from #/b lands on #/a');
  history.back();
  assert.equal(b.at(), 0, 'and the next back leaves, skipping the look-alike step');
});

test('a page tidying its address on a step keeps the marker; back then stops there', () => {
  const { b, open, history } = setup();
  open().c.close();
  history.replaceState(null, '', 'https://nl.tools/tool/?tab=audit#/a');
  assert.ok(history.state && history.state.nlModal, 'marker kept');
  history.back();
  assert.equal(b.at(), 1, 'a different page, so no second back');
});

test('a dialog that cannot be dismissed takes no step', () => {
  const { b, open } = setup();
  open({ dismissable: false });
  assert.equal(b.count(), 2);
});
