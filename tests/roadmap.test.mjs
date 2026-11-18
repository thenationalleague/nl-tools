/* Roadmap — system/ROADMAP.md is the one source /roadmap/ reads. These hold
   the file to the shape its header promises, and the page's parser to the
   file. A malformed item would vanish from the page without an error. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const MD = readFileSync(join(REPO, 'system/ROADMAP.md'), 'utf8');
const PAGE = readFileSync(join(REPO, 'roadmap/index.html'), 'utf8');

const src = PAGE.slice(PAGE.indexOf('function parse(md)'), PAGE.indexOf('window.ROADMAP'));
const box = {}; vm.createContext(box);
vm.runInContext(src + ';this.parse = parse;', box);
const wsrc = PAGE.slice(PAGE.indexOf('  function waitParts(w)'), PAGE.indexOf('  function who(w)'));
vm.runInContext(wsrc + ';this.waitParts = waitParts;', box);
const groups = JSON.parse(JSON.stringify(box.parse(MD)));

test('three groups, in order: Now, Next, Later', () => {
  assert.deepEqual(groups.map((g) => g.name), ['Now', 'Next', 'Later']);
});

test('every item says what and why', () => {
  for (const g of groups) for (const it of g.items) {
    assert.ok(it.what, `${it.title}: no What line`);
    assert.ok(it.why, `${it.title}: no Why line`);
  }
});

test('Now stays short', () => {
  assert.ok(groups[0].items.length <= 6, `Now has ${groups[0].items.length} items; keep it to a handful`);
});

test('every headline appears once', () => {
  const titles = groups.flatMap((g) => g.items.map((i) => i.title));
  assert.equal(new Set(titles).size, titles.length);
});

test('the file holds no email addresses (it is public)', () => {
  assert.doesNotMatch(MD, /[\w.+-]+@[\w-]+\.[\w.]+/);
});

test('the parser skips the header comment and reads the optional lines', () => {
  const g = JSON.parse(JSON.stringify(box.parse('<!--\n## Not a group\n-->\n## Now\n### A\nWhat: w\nWhy: y\n- p\nWaiting on: you\nstray line\n')));
  assert.deepEqual(g, [{ name: 'Now', items: [{ title: 'A', what: 'w', why: 'y', points: ['p'], waiting: 'you' }] }]);
});

/* The pill names who it waits on, nothing more: a dash once put a whole
   question in it (18/11/2026). */
test('the Waiting on pill holds only who, however the detail is written', () => {
  for (const [w, who, detail] of [
    ['you (one press)', 'you', 'one press'],
    ['you \u2013 should everything be hidden?', 'you', 'should everything be hidden?'],
    ['you - the date', 'you', 'the date'],
    ['you: two screenshots', 'you', 'two screenshots'],
    ['you', 'you', ''],
  ]) assert.deepEqual({ ...box.waitParts(w) }, { who, detail }, w);
  for (const g of groups) for (const it of g.items) if (it.waiting) {
    const p = box.waitParts(it.waiting);
    assert.ok(p.who.split(/\s+/).length <= 3 && !/[?.]/.test(p.who), `${it.title}: the pill would read "Waiting on ${p.who}"`);
  }
});
