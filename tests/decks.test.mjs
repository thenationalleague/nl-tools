/* Decks — the three places the slide model is written down must agree.

   The page's TYPES (what the editor offers), the RTDB rules' type regex
   (what the database accepts) and the field-key pattern are each written by
   hand. If a slide type is added to the page and not the rules, every save
   of a deck holding one fails with PERMISSION_DENIED — and autosave makes
   that a deck that silently stops saving. Read straight from the files; no
   stubs. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';
import { levelRule } from '../scripts/rtdb-level-rule.mjs';

const page = readFileSync(join(REPO, 'decks/index.html'), 'utf8');
const rules = JSON.parse(readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8')).rules;
const registry = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));
const storage = readFileSync(join(REPO, 'system/storage/rules.snapshot.rules'), 'utf8');
const node = rules['app-data']['staff-decks'].decks;

function pageTypes() {
  const m = page.match(/var TYPE_ORDER = \[([^\]]+)\]/);
  assert.ok(m, 'TYPE_ORDER is in the page');
  return m[1].split(',').map((s) => s.trim().replace(/'/g, ''));
}

test('the rules accept exactly the slide types the editor offers', () => {
  const v = node.$deckId.slides.$i.type['.validate'];
  const m = v.match(/\/\^\(([^)]+)\)\$\//);
  assert.ok(m, 'type is validated against a list');
  assert.deepEqual(m[1].split('|').sort(), pageTypes().sort());
});

test('every field key the editor writes passes the rules', () => {
  const keyRe = /^[A-Za-z0-9]{1,24}$/;
  assert.ok(node.$deckId.slides.$i.fields.$f['.validate'].includes('[A-Za-z0-9]{1,24}'), 'rules pattern unchanged');
  const keys = new Set();
  for (const m of page.matchAll(/\b[FI]\('([^']+)'/g)) keys.add(m[1]);
  for (let i = 1; i <= 4; i++) keys.add('p' + i);
  for (let i = 1; i <= 3; i++) { keys.add('n' + i); keys.add('l' + i); }
  keys.add('path');
  assert.ok(keys.size > 10, 'found the field definitions');
  for (const k of keys) assert.match(k, keyRe, k);
});

test('read follows the portal grant; write also needs to be the deck\'s creator', () => {
  assert.equal(node['.read'], levelRule('staff-decks', 'access'));
  assert.ok(node.$deckId['.write'].startsWith(levelRule('staff-decks', 'access') + ' && '));
  assert.match(node.$deckId['.write'], /createdBy'\)\.val\(\) === auth\.uid/);
  assert.match(node.$deckId['.validate'], /newData\.child\('createdBy'\)\.val\(\) === data\.child\('createdBy'\)\.val\(\)/,
    'a deck cannot be handed to someone else');
});

test('registry record is work in progress and superadmin only', () => {
  const r = registry['staff-decks'];
  assert.equal(r.url, '/decks/');
  assert.equal(r.status, 'wip');
  assert.deepEqual(r.defaults, { superadmin: 'admin', admin: 'off', staff: 'off', 'club-admin': 'off', 'club-staff': 'off' });
});

test('Storage takes raster images under decks/, never SVG', () => {
  const block = storage.slice(storage.indexOf('match /decks/{deckId}/{file}'));
  const body = block.slice(0, block.indexOf('\n    }\n'));
  assert.match(body, /request\.auth\.token\.email != null/);
  assert.match(body, /contentType\.matches\('image\/\(png\|jpeg\|webp\|gif\)'\)/);
  assert.doesNotMatch(body, /svg/);
});
