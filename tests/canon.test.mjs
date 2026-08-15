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

test('parseDate passes through a Date and reads an epoch-ms number', () => {
  const d = new Date(2026, 3, 17, 9, 30);
  assert.equal(NL.parseDate(d), d, 'a valid Date is returned as-is');
  assert.equal(NL.parseDate(new Date('nonsense')), null, 'Invalid Date → null');
  const fromEpoch = NL.parseDate(d.getTime());
  assert.ok(fromEpoch instanceof Date && fromEpoch.getTime() === d.getTime(), 'epoch-ms number → same instant');
  assert.equal(NL.parseDate(0), null, 'falsy 0 is treated as empty, not the epoch');
});

test('formatDateTime: default, weekday, no-year, seconds', () => {
  const d = new Date(2026, 3, 17, 9, 30, 5);          // Fri 17 Apr 2026 09:30:05
  assert.equal(NL.formatDateTime(d), '17 Apr 2026, 09:30');
  assert.equal(NL.formatDateTime(d, { weekday: true }), 'Fri 17 Apr 2026, 09:30');
  assert.equal(NL.formatDateTime(d, { year: false }), '17 Apr, 09:30');
  assert.equal(NL.formatDateTime(d, { seconds: true }), '17 Apr 2026, 09:30:05');
  assert.equal(NL.formatDateTime('2026-04-17T09:05'), '17 Apr 2026, 09:05', 'pads single-digit minute');
  assert.equal(NL.formatDateTime('rubbish'), '—');
});

test('timeAgo: ladder tiers then absolute fallback', () => {
  const now = Date.now();
  assert.equal(NL.timeAgo(now - 10 * 1000), 'just now');
  assert.equal(NL.timeAgo(now - 5 * 60 * 1000), '5m ago');
  assert.equal(NL.timeAgo(now - 3 * 3600 * 1000), '3h ago');
  assert.equal(NL.timeAgo(now - 2 * 86400 * 1000), '2d ago');
  assert.equal(NL.timeAgo(now + 60 * 1000), 'just now', 'future/skew clamps to just now');
  const old = new Date(2026, 3, 17, 9, 30);
  assert.equal(NL.timeAgo(old), NL.formatDateTime(old), '>=7d old → absolute formatDateTime');
  assert.equal(NL.timeAgo('rubbish'), '—');
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

test('clubs.guests loads the NL Cup guest sides, sorted and shaped', async () => {
  const guests = await NL.clubs.guests();
  assert.ok(Array.isArray(guests) && guests.length > 0, 'returns a non-empty array');

  const names = guests.map((c) => c.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), 'name-sorted');

  for (const g of guests) {
    assert.ok(g.name && g.code && g.colors, `${g.name}: has name, code and colours`);
    assert.ok(g.colors.primary && g.colors.secondary && g.colors.tertiary,
      `${g.name}: carries all three colours the match graphic needs`);
  }

  // Memoised: a second call must not re-fetch (the sandbox would still serve,
  // so assert identity of the resolved value instead).
  assert.equal(await NL.clubs.guests(), guests, 'promise-memoised');
});

test('guests stay OUT of the member roster', async () => {
  await NL.clubs.load();
  await NL.clubs.guests();

  const fulham = NL.clubs.guestByName('Fulham PL2');
  assert.ok(fulham, 'guestByName finds a guest');
  assert.equal(fulham.crestName, 'Fulham', 'crestName points at the parent badge');

  // The whole reason the two files are separate: a tool filtering clubs-meta
  // on division must never see a side that was never an NL member.
  assert.equal(NL.clubs.byName('Fulham PL2'), null, 'byName does not resolve a guest');
  const all = await NL.clubs.all();
  assert.equal(all.filter((c) => /\bPL2$/.test(c.name)).length, 0, 'clubs.all has no guests');

  assert.equal(NL.clubs.guestByName('AFC Fylde'), null, 'guestByName does not resolve a member');
  assert.equal(NL.clubs.guestByName(''), null, 'empty → null');
});

test('csv: RFC-4180 escaping, CRLF rows, optional BOM', () => {
  assert.equal(NL.csv([['a', 'b'], ['c', 'd']]), 'a,b\r\nc,d');
  // comma, quote and newline each force quoting; internal quotes doubled
  assert.equal(NL.csv([['x,y', 'he said "hi"', 'line1\nline2']]),
    '"x,y","he said ""hi""","line1\nline2"');
  assert.equal(NL.csv([[1, 0, null, undefined]]), '1,0,,', 'numbers incl 0; null/undefined → empty');
  assert.equal(NL.csv([['é']], { bom: true }), '\ufeff' + 'é', 'BOM prefixed when asked');
  assert.equal(NL.csv([]), '', 'no rows → empty string');
});

test('copy / download are exposed (behaviour covered by smoke test)', () => {
  assert.equal(typeof NL.copy, 'function');
  assert.equal(typeof NL.download, 'function');
});

test('modal / confirm / prompt / alert are exposed (behaviour covered by smoke test)', () => {
  for (const fn of ['modal', 'confirm', 'prompt', 'alert']) {
    assert.equal(typeof NL[fn], 'function', `NL.${fn} is a function`);
  }
  // confirm/prompt/alert return promises without throwing under the DOM stub
  assert.ok(NL.confirm('ok?') instanceof Promise);
  assert.ok(NL.prompt('name?') instanceof Promise);
  assert.ok(NL.alert('hi') instanceof Promise);
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

/* ── NL.csvParse — the reverse of NL.csv (v1.26) ────────────────────────
   The cases below are exactly the ones a split(',') implementation gets
   wrong, which is why this helper exists rather than each tool rolling
   its own.

   plain() works around a vm-harness artifact, not a behaviour difference:
   load-canon injects the outer realm's intrinsics, but an array LITERAL
   evaluated inside the sandbox still gets the sandbox's Array prototype,
   so assert/strict's deepEqual rejects it as "same structure, not
   reference-equal". Normalising through JSON is lossless for the
   string-array shapes csvParse returns. */
const plain = (v) => JSON.parse(JSON.stringify(v));

test('csvParse handles plain rows, both line endings, and no phantom trailing row', () => {
  assert.deepEqual(plain(NL.csvParse('a,b\r\n1,2')), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(plain(NL.csvParse('a,b\n1,2')), [['a', 'b'], ['1', '2']], 'bare LF');
  assert.deepEqual(plain(NL.csvParse('a,b\r\n1,2\r\n')), [['a', 'b'], ['1', '2']], 'trailing newline');
  assert.deepEqual(plain(NL.csvParse('')), [], 'empty input');
  assert.deepEqual(plain(NL.csvParse('a,,c')), [['a', '', 'c']], 'empty cells preserved');
});

test('csvParse honours quoting: commas, escaped quotes and newlines inside cells', () => {
  assert.deepEqual(plain(NL.csvParse('a,b\r\n1,"x,y"')), [['a', 'b'], ['1', 'x,y']]);
  assert.deepEqual(plain(NL.csvParse('a\r\n"say ""hi"""')), [['a'], ['say "hi"']]);
  assert.deepEqual(plain(NL.csvParse('a,b\r\n"line1\nline2",z')),
    [['a', 'b'], ['line1\nline2', 'z']], 'LF inside quotes is not a row break');
  assert.deepEqual(plain(NL.csvParse('a\r\n"x\r\ny"')), [['a'], ['x\r\ny']], 'CRLF inside quotes');
});

test('csvParse strips the UTF-8 BOM Excel writes', () => {
  assert.deepEqual(plain(NL.csvParse('﻿matchID,home')), [['matchID', 'home']],
    'BOM must not glue itself to the first header name');
});

test('csvParse header mode keys rows, trims names and pads short rows', () => {
  assert.deepEqual(plain(NL.csvParse('a,b\r\n1,"x,y"', { header: true })), [{ a: '1', b: 'x,y' }]);
  assert.deepEqual(plain(NL.csvParse(' a , b \r\n1,2', { header: true })), [{ a: '1', b: '2' }]);
  assert.deepEqual(plain(NL.csvParse('a,b,c\r\n1,2', { header: true })), [{ a: '1', b: '2', c: '' }]);
  assert.deepEqual(plain(NL.csvParse('a,b', { header: true })), [], 'header only → no rows');
});

test('csvParse round-trips NL.csv output, including real club names', () => {
  const rows = [
    ['matchID', 'home', 'away'],
    ['g2660046', 'Braintree Town', 'Dagenham & Redbridge'],
    ['g2660047', 'Truro City', 'Dog and Duck FC, Reserves'],
    ['g2660048', 'Hampton & Richmond Borough', 'he said "hi"']
  ];
  assert.deepEqual(plain(NL.csvParse(NL.csv(rows))), rows);
  assert.deepEqual(plain(NL.csvParse(NL.csv(rows, { bom: true }))), rows, 'BOM variant round-trips too');
});

/* ── NL.codeGate ───────────────────────────────────────────────────────────
   The gate renders a screen and runs the caller's verify. It makes no security
   claim of its own, and the surface is shaped so nobody can mistake one for
   the other: viaFunction is the boundary, and it is named and separate.

   Rendering needs a DOM the sandbox does not have, so these cover the surface
   and the contracts a caller depends on. The keystroke path is covered by the
   smoke test on the PR that converts each page. */

test('NL.codeGate exposes the whole surface', () => {
  assert.equal(typeof NL.codeGate, 'object');
  for (const fn of ['open', 'ensure', 'resume', 'viaFunction', 'openAsAdmin', 'signOut']) {
    assert.equal(typeof NL.codeGate[fn], 'function', `NL.codeGate.${fn} is a function`);
  }
});

/* A verify is the only thing that decides whether anyone gets in. Defaulting
   it to anything — even a rejecting stub — would make a gate with no check
   look like a working gate, so it throws at call time instead. */
test('NL.codeGate.open refuses to render without a verify', () => {
  assert.throws(() => NL.codeGate.open({ title: 'x' }), /verify/);
  assert.throws(() => NL.codeGate.open({ title: 'x', verify: 'yes' }), /verify/);
});

test('NL.codeGate.viaFunction returns a verify, not a result', () => {
  const verify = NL.codeGate.viaFunction('app-data/ops-club-directory');
  assert.equal(typeof verify, 'function');
  assert.equal(verify.length, 1, 'takes the code');
});

/* resume() answers "is someone already through?" — with no claim to look for
   the honest answer is nobody, not a thrown error on a page that has not
   loaded Firebase yet. */
test('NL.codeGate.resume with no claim resolves to null', async () => {
  assert.equal(await NL.codeGate.resume(), null);
  assert.equal(await NL.codeGate.resume(''), null);
});
