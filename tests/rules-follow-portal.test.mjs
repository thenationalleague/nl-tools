/* The RTDB rules and the portal must agree on who may do what.

   The portal offers each tool the levels its registry record declares
   (`levels`), and a person's level is their own setting or the registry
   default for their role — NL.resolveToolLevel. The rules decide what that
   person can read and write. When the two disagree, the portal lets someone
   in and the database refuses them: Document Library on 29/10/2026, where
   the rules asked for a Manage grant on a tool the portal only offered Off
   and Use for, and two staff set to Use got PERMISSION_DENIED.

   Generated rules (scripts/rtdb-level-rule.mjs) remove the disagreement by
   construction; tests/emulator/level-rule.mjs proves the generated rule and
   NL.resolveToolLevel agree. This file is the part CI can run without an
   emulator. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';
import { levelRule } from '../scripts/rtdb-level-rule.mjs';

const rules = JSON.parse(readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8')).rules;
const registry = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));

/* Tools whose rules ask for a grant the portal cannot give, known and not
   yet fixed. Each entry is a promise to come back, dated. */
const KNOWN = {
  'media-save-of-the-month': "29/10/2026: rules honour a 'admin' grant; levels offer only off/access",
};

test('no tool\'s rules ask for a level the portal cannot grant', () => {
  const bad = [];
  for (const [key, rec] of Object.entries(registry)) {
    const node = rules['app-data'] && rules['app-data'][key];
    if (!node) continue;
    const levels = rec.levels || ['off', 'access', 'admin'];
    const text = JSON.stringify(node);
    const esc = key.replace(/[-]/g, '\\-');
    const asked = new Set();
    for (const m of text.matchAll(new RegExp(`child\\('tools'\\)\\.child\\('${esc}'\\)\\.val\\(\\) === '(\\w+)'`, 'g'))) asked.add(m[1]);
    for (const m of text.matchAll(new RegExp(`child\\('tools'\\)\\.child\\('${esc}'\\)\\.child\\('(access|admin)'\\)\\.val\\(\\) === true`, 'g'))) asked.add(m[1]);
    const missing = [...asked].filter((l) => !levels.includes(l));
    if (missing.length && !KNOWN[key]) bad.push(`${key}: rules check ${missing.join(', ')}; the portal offers ${levels.join('/')}`);
  }
  assert.deepEqual(bad, [], 'add the level to the registry record, or stop the rules asking for it:\n  ' + bad.join('\n  '));
});

test('a known exception that has been fixed is taken off the list', () => {
  for (const key of Object.keys(KNOWN)) {
    const levels = (registry[key] || {}).levels || ['off', 'access', 'admin'];
    const text = JSON.stringify((rules['app-data'] || {})[key] || {});
    const stillAsks = !levels.includes('admin') && text.includes(`child('${key}').val() === 'admin'`);
    assert.ok(stillAsks, `${key} no longer disagrees — delete it from KNOWN`);
  }
});

test('Document Library\'s rules are the generated ones, not hand-written', () => {
  const node = rules['app-data']['ops-document-library'];
  assert.equal(node['.read'], levelRule('ops-document-library', 'access'), 'Use or Manage reads');
  assert.equal(node['.write'], levelRule('ops-document-library', 'admin'), 'Manage writes');
  assert.deepEqual(registry['ops-document-library'].levels, ['off', 'access', 'admin'],
    'the portal offers the level the rules use');
});

test('levelRule refuses anything that is not a tool key', () => {
  assert.throws(() => levelRule("x') || true || ('", 'access'));
  assert.throws(() => levelRule('ops-x', 'owner'));
});
