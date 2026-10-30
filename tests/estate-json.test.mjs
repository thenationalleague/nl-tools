// system/estate.json is the hand-kept half of the Estate tool. A key that no
// longer matches anything is a note the page silently stops showing, so every
// key must point at something that exists. Added 30/10/2026 (Declutter).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const est = JSON.parse(readFileSync(join(REPO, 'system/estate.json'), 'utf8'));

const registry = Object.assign(
  {},
  JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8')),
  JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.parked.json'), 'utf8'))
);
const functionsSrc = readdirSync(join(REPO, 'functions'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(REPO, 'functions', f), 'utf8'))
  .join('\n');

const STATUSES = ['Core', 'Occasional', 'Dead', 'Not decided'];
const LIFESPANS = ['Ongoing', 'One-off'];
const KINDS = ['Tool', 'Website widget', 'Page', 'Background job'];

function toolKeyInPages(key) {
  const walk = (d) => readdirSync(join(REPO, d), { withFileTypes: true }).some((e) => {
    if (e.name.startsWith('.') || e.name === 'node_modules') return false;
    const p = d ? d + '/' + e.name : e.name;
    if (e.isDirectory()) return walk(p);
    /* The same test the inventory uses to give a page its toolKey
       (scripts/build-inventory.js), so the two can never disagree. */
    return e.name.endsWith('.html') &&
      new RegExp('NL_TOOL_KEY\\s*=\\s*[\'"]' + key + '[\'"]').test(readFileSync(join(REPO, p), 'utf8'));
  });
  return walk('');
}

test('every estate.json key points at something that exists', () => {
  const missing = Object.keys(est.items).filter((id) => {
    const [kind, ...rest] = id.split(':');
    const ref = rest.join(':');
    if (kind === 'tool') return !registry[ref] && !toolKeyInPages(ref);
    if (kind === 'page') return !existsSync(join(REPO, ref));
    if (kind === 'fn') return !new RegExp('^exports\\.' + ref + '\\s*=', 'm').test(functionsSrc);
    if (kind === 'gh') return !existsSync(join(REPO, '.github/workflows', ref));
    return true;
  });
  assert.deepEqual(missing, [], 'estate.json keys with nothing behind them (renamed or deleted?)');
});

test('estate.json uses only the agreed words', () => {
  const rows = Object.entries(est.items).map(([id, v]) => [id, v]).concat(est.extra.map((x) => [x.id, x]));
  for (const [id, v] of rows) {
    if (v.status) assert.ok(STATUSES.includes(v.status), id + ': status "' + v.status + '"');
    if (v.lifespan) assert.ok(LIFESPANS.includes(v.lifespan), id + ': lifespan "' + v.lifespan + '"');
  }
  const ids = est.extra.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, 'extra ids are unique');
  for (const x of est.extra) {
    assert.match(x.id, /^gas:/, x.id + ': extras are Apps Script projects (skills are not listed)');
    assert.ok(KINDS.includes(x.kind), x.id + ': kind "' + x.kind + '"');
    assert.ok(x.name && x.runsOn, x.id + ': needs a name and runsOn');
  }
});

test('estate.json holds no email addresses (public repo)', () => {
  assert.doesNotMatch(readFileSync(join(REPO, 'system/estate.json'), 'utf8'), /[\w.+-]+@[\w-]+\.[\w.]+/);
});
