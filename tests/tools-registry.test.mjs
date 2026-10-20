/* The tools registry — system/rtdb/tools-registry.snapshot.json.

   That file IS the live tools/ node: since 20/10/2026 a merge that changes it
   publishes it, so a mistake here reaches every portal card on merge. These
   tests hold the parts a person edits by hand to the rules agreed for them:

   - a card's description is one short line. They had grown to six lines
     ("The National League handbook — Memorandum, Articles, League Rules,
     Appendices and Board Directives, with computed clause numbering…") and
     were cut to 40 characters on 20/10/2026;
   - `status` and `shelf` only take values the portal knows how to shelve. A
     typo would not fail anywhere else: the card would quietly land on the
     wrong shelf;
   - every record a gated page asks for exists. A page whose NL_TOOL_KEY has
     no record turns away everyone but the superadmin — the exact fault the
     auto-publish exists to stop — and this catches it before merge.

   No stubs: everything here reads files in this repo. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));
const parked = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.parked.json'), 'utf8'));
const records = Object.entries(registry);

const MAX_DESCRIPTION = 40;
const STATUSES = ['wip'];                 // absent means live
const SHELVES = ['club', 'website'];      // absent means the audience decides
const AUDIENCES = ['league', 'club', 'staff', 'meta'];

test('every card description fits on one short line', () => {
  for (const [key, rec] of records) {
    assert.ok(rec.description && rec.description.trim(), `${key} has no description`);
    assert.ok(rec.description.length <= MAX_DESCRIPTION,
      `${key}: "${rec.description}" is ${rec.description.length} characters; keep it to ${MAX_DESCRIPTION}`);
  }
});

test('every card has a title and an icon, and no two share an icon', () => {
  const seen = new Map();
  for (const [key, rec] of records) {
    assert.ok(rec.label && rec.label.trim(), `${key} has no label`);
    assert.ok(rec.icon, `${key} has no icon`);
    assert.ok(!seen.has(rec.icon), `${key} and ${seen.get(rec.icon)} both use ${rec.icon}`);
    seen.set(rec.icon, key);
  }
});

test('status, shelf and audience only take values the portal shelves', () => {
  for (const [key, rec] of records) {
    if ('status' in rec) assert.ok(STATUSES.includes(rec.status), `${key}: unknown status "${rec.status}"`);
    if ('shelf' in rec) assert.ok(SHELVES.includes(rec.shelf), `${key}: unknown shelf "${rec.shelf}"`);
    if ('audience' in rec) assert.ok(AUDIENCES.includes(rec.audience), `${key}: unknown audience "${rec.audience}"`);
  }
});

/* Every gated page in the estate, found the way lint-tools.sh finds them:
   index.html at depth one or two that loads auth-guard and declares a key. */
function gatedPages() {
  const out = [];
  const skip = new Set(['node_modules', '.git', 'system', 'tests', 'scripts', 'functions', 'assets', 'lab', 'brand-dev']);
  const visit = (dir, depth) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (!name.isDirectory() || name.name.startsWith('.') || skip.has(name.name)) continue;
      const sub = join(dir, name.name);
      const page = join(sub, 'index.html');
      if (existsSync(page)) {
        const src = readFileSync(page, 'utf8');
        const m = src.match(/var\s+NL_TOOL_KEY\s*=\s*['"]([^'"]+)['"]/);
        if (m && src.includes('/system/auth-guard.js')) out.push({ page: page.slice(REPO.length + 1), key: m[1] });
      }
      if (depth < 2) visit(sub, depth + 1);
    }
  };
  visit(REPO, 1);
  return out;
}

test('every gated page has a registry record, or is parked on purpose', () => {
  const pages = gatedPages();
  assert.ok(pages.length > 20, `found only ${pages.length} gated pages — the scan is broken, not the estate`);
  for (const { page, key } of pages) {
    assert.ok(key in registry || key in parked,
      `${page} asks for tools/${key}, which is in neither the registry nor the parked list — ` +
      'everyone but the superadmin would be turned away');
  }
});
