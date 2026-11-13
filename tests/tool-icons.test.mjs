/* Tool icons and portal cards (portal v16.2, 13/11/2026). Every tool has its
   own drawn icon in assets/icons/tools.svg (symbol id = tool key), and every
   portal card is the same size, which holds the registry's words to lengths
   that fit two lines each on the 1280px screen. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SVG = readFileSync(join(REPO, 'assets/icons/tools.svg'), 'utf8');
const REG = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));
const symbols = [...SVG.matchAll(/<symbol id="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g)].map((m) => ({ id: m[1], body: m[2] }));

test('every tool in the registry has an icon', () => {
  const ids = new Set(symbols.map((s) => s.id));
  for (const key of Object.keys(REG)) assert.ok(ids.has(key), `${key} has no icon in assets/icons/tools.svg`);
});

test('no two tools share an icon, and no icon is left over', () => {
  assert.equal(new Set(symbols.map((s) => s.id)).size, symbols.length, 'an id appears twice');
  assert.equal(new Set(symbols.map((s) => s.body)).size, symbols.length, 'two icons are the same drawing');
  for (const s of symbols) assert.ok(REG[s.id], `${s.id} is not a tool any more`);
});

test('the sprite is a valid SVG file for <use> (no double hyphen in a comment)', () => {
  /* An HTML page forgives "--" inside a comment; an SVG file loaded by
     <use href> does not, and then shows nothing at all. It happened while
     this file was being drawn. */
  for (const c of SVG.matchAll(/<!--([\s\S]*?)-->/g)) assert.doesNotMatch(c[1], /--/, 'double hyphen in a comment');
});

test('card words fit: names to 24 characters, descriptions to 34', () => {
  for (const [key, r] of Object.entries(REG)) {
    assert.ok(String(r.label || '').length <= 24, `${key}: name "${r.label}" is over 24 characters`);
    assert.ok(String(r.description || '').length <= 34, `${key}: description "${r.description}" is over 34 characters`);
  }
});
