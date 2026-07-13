/* Canon helper tests — proves the shared NL.* helpers return the RIGHT answer,
   which lint cannot. Run with `npm test` (node --test). Zero dependencies.

   Scope: pure string/date/club-data helpers. DOM/Firebase-bound helpers
   (clubPicker rendering, ensureAuth, writeAudit) are exercised by the layperson
   smoke test on each PR, not here. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NL, REPO } from './load-canon.mjs';

const meta = JSON.parse(readFileSync(join(REPO, 'assets/data/clubs-meta.json'), 'utf8'));

test('NL.endpoints.gas is present and is an Apps Script exec URL', () => {
  assert.equal(typeof NL.endpoints, 'object');
  assert.match(NL.endpoints.gas, /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/);
});

test('NL namespace loads', () => {
  assert.ok(NL, 'window.NL present');
  for (const fn of ['escHtml', 'escJ', 'parseDate', 'formatDate', 'formatDateShort']) {
    assert.equal(typeof NL[fn], 'function', `NL.${fn} is a function`);
  }
  assert.equal(typeof NL.clubs.crestUrl, 'function');
  assert.equal(typeof NL.season.clubsFor, 'function');
});

test('escHtml escapes all five entities and preserves falsy non-null', () => {
  assert.equal(NL.escHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(NL.escHtml(0), '0');       // regression guard: local esc() copies drop 0 → ''
  assert.equal(NL.escHtml(false), 'false');
  assert.equal(NL.escHtml(null), '');
  assert.equal(NL.escHtml(undefined), '');
});

test('escJ escapes backslash then single-quote', () => {
  assert.equal(NL.escJ(`a\\b'c`), `a\\\\b\\'c`);
  assert.equal(NL.escJ(null), '');
});

test('parseDate accepts UK + ISO strings and rejects junk', () => {
  const uk = NL.parseDate('17/04/2026');
  assert.equal(uk.getFullYear(), 2026);
  assert.equal(uk.getMonth(), 3); // April
  assert.equal(uk.getDate(), 17);
  const iso = NL.parseDate('2026-04-17T09:30');
  assert.equal(iso.getHours(), 9);
  assert.equal(NL.parseDate('not a date'), null);
  assert.equal(NL.parseDate(''), null);
  assert.equal(NL.parseDate(null), null);
});

test('formatDate / formatDateShort produce the canon shapes', () => {
  assert.equal(NL.formatDate('2026-04-17'), '17 April 2026');
  assert.equal(NL.formatDateShort('2026-04-17'), '17 Apr 2026');
  assert.equal(NL.formatDate('rubbish'), '—');
});

test('clubs.crestUrl encodes the name and falls back to the rose', () => {
  const url = NL.clubs.crestUrl('AFC Fylde');
  assert.ok(url.startsWith('https://'), 'absolute URL');
  assert.ok(url.endsWith('/AFC%20Fylde.png'), 'encoded name + .png');
  assert.match(NL.clubs.crestUrl(''), /National%20League%20rose\.png$/);
});

test('clubs.crestUrl tiers: thumb + medium folders; no-arg unchanged', () => {
  const full = NL.clubs.crestUrl('AFC Fylde');
  assert.ok(NL.clubs.crestUrl('AFC Fylde', 'thumb').endsWith('/thumbs/AFC%20Fylde.png'), 'thumb path');
  assert.ok(NL.clubs.crestUrl('AFC Fylde', 'medium').endsWith('/medium/AFC%20Fylde.png'), 'medium path');
  assert.ok(!full.includes('/thumbs/') && !full.includes('/medium/'), 'no-arg stays full-res');
  assert.equal(NL.clubs.crestUrl('', 'thumb'), NL.clubs.ROSE, 'empty name → rose (any size)');
  assert.equal(NL.clubs.crestUrl('', 'medium'), NL.clubs.ROSE, 'empty name → rose (any size)');
});

test('clubs.wireCrestImg degrades thumb → full → rose', () => {
  const img = { src: '', onerror: null, style: {} };
  NL.clubs.wireCrestImg(img, 'Barrow', false);
  img.src = NL.clubs.crestUrl('Barrow', 'thumb');
  img.onerror();                                   // thumb 404
  assert.equal(img.src, NL.clubs.crestUrl('Barrow'), 'falls back to full-res');
  img.onerror();                                   // full 404
  assert.equal(img.src, NL.clubs.ROSE, 'then to the rose');
});

test('clubs.load + byOpta / byName resolve real records', async () => {
  await NL.clubs.load();
  const byOpta = NL.clubs.byOpta('t3360');           // AFC Fylde
  assert.ok(byOpta && byOpta.name === 'AFC Fylde', 'byOpta finds the club');
  assert.equal(NL.clubs.byOpta('t-nope'), null, 'unknown teamID → null');
  assert.equal(NL.clubs.byOpta(''), null, 'empty → null');
  assert.equal(NL.clubs.byName('AFC Fylde').optaID, 't3360', 'byName agrees');
});

test('roles: norm / label / realm / isClubUser fold the legacy "club" key', () => {
  // norm — legacy 'club' → 'club-admin', empty → 'staff', else identity
  assert.equal(NL.roles.norm('club'), 'club-admin');
  assert.equal(NL.roles.norm(''), 'staff');
  assert.equal(NL.roles.norm(undefined), 'staff');
  assert.equal(NL.roles.norm('club-viewer'), 'club-viewer');
  assert.equal(NL.roles.norm('admin'), 'admin');

  // label — legacy 'club' shares the club-admin label
  assert.equal(NL.roles.label('club'), 'Club Admin');
  assert.equal(NL.roles.label('club-admin'), 'Club Admin');
  assert.equal(NL.roles.label('superadmin'), 'Superadmin');
  assert.equal(NL.roles.label('unknown'), 'unknown');

  // realm — legacy 'club' resolves to the club realm
  assert.equal(NL.roles.realm('club'), 'club');
  assert.equal(NL.roles.realm('club-viewer'), 'club');
  assert.equal(NL.roles.realm('staff'), 'league');
  assert.equal(NL.roles.realm('third-party'), 'external');
  assert.equal(NL.roles.realm('nonsense'), null);

  // isClubUser — every club tier incl. legacy 'club'; nothing else
  assert.ok(NL.isClubUser('club') && NL.isClubUser('club-admin') && NL.isClubUser('club-viewer'));
  assert.ok(!NL.isClubUser('staff') && !NL.isClubUser('third-party') && !NL.isClubUser(''));
});

test('season.current / keys / label read the registry', () => {
  assert.equal(NL.season.current(meta), '2026');
  assert.deepEqual(NL.season.keys(meta), ['2026', '2025']);
  assert.equal(NL.season.label(meta, '2026'), '2026-27');
  assert.equal(NL.season.label(meta, '2027'), '2027-28'); // derived when absent
});

test('season.clubsFor resolves division to that season and drops departed clubs', () => {
  const active = NL.season.clubsFor(meta, '2026');
  const expected = meta.clubs.filter((c) => c.seasons && c.seasons['2026'] != null);
  assert.equal(active.length, expected.length);
  assert.ok(active.length > 0, 'current roster is non-empty');

  // division must be resolved to the season's value, not the raw top-level field
  for (const c of active) {
    const src = meta.clubs.find((x) => x.name === c.name);
    assert.equal(c.division, src.seasons['2026'], `${c.name} division resolved to season`);
  }

  // departed clubs (no 2026 entry) must NOT appear — this is the dazn-vip bug class
  const activeNames = new Set(active.map((c) => c.name));
  for (const c of meta.clubs) {
    if (!c.seasons || c.seasons['2026'] == null) {
      assert.ok(!activeNames.has(c.name), `${c.name} is departed but appears in current roster`);
    }
  }
});
