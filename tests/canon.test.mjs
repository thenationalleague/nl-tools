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

test('formatTime: HH:MM 24-hour, pads, accepts Date/epoch/string like its siblings', () => {
  const d = new Date(2026, 3, 17, 9, 5);              // Fri 17 Apr 2026 09:05
  assert.equal(NL.formatTime(d), '09:05', 'pads single-digit hour and minute');
  assert.equal(NL.formatTime(new Date(2026, 3, 17, 15, 30)), '15:30', '24-hour, no am/pm');
  assert.equal(NL.formatTime(d.getTime()), '09:05', 'epoch-ms via parseDate');
  assert.equal(NL.formatTime('2026-04-17T09:05'), '09:05', 'ISO string via parseDate');
  assert.equal(NL.formatTime('17/04/2026 09:05'), '09:05', 'UK string via parseDate');
  assert.equal(NL.formatTime('rubbish'), '—');
  assert.equal(NL.formatTime(null), '—');
});

test('formatDuration: compound hours+minutes, accepts a "3600s" string, junk → —', () => {
  assert.equal(NL.formatDuration(45), '45s');
  assert.equal(NL.formatDuration(300), '5 min');
  assert.equal(NL.formatDuration(3600), '1h');
  assert.equal(NL.formatDuration(5400), '1h 30min', 'keeps the half nls-monitor used to round to "2 hr"');
  assert.equal(NL.formatDuration('3600s'), '1h', 'Routes-API duration string accepted');
  assert.equal(NL.formatDuration(90), '1 min', 'minutes floor, never round up');
  assert.equal(NL.formatDuration(5459), '1h 30min', 'leftover seconds above the minute are dropped');
  assert.equal(NL.formatDuration(7200), '2h', 'no "0min" tail on exact hours');
  assert.equal(NL.formatDuration(0), '—', 'zero reads as absent, like both pre-canon copies');
  assert.equal(NL.formatDuration(-5), '—');
  assert.equal(NL.formatDuration('rubbish'), '—');
  assert.equal(NL.formatDuration(null), '—');
  assert.equal(NL.formatDuration(undefined), '—');
});

test('formatDuration {seconds:true}: website-archive GA convention, same fallback as base', () => {
  assert.equal(NL.formatDuration(42, { seconds: true }), '42s', 'under a minute, bare seconds');
  assert.equal(NL.formatDuration(222, { seconds: true }), '3m 42s', 'minutes + seconds');
  assert.equal(NL.formatDuration(185, { seconds: true }), '3m 05s', 'remainder seconds zero-padded');
  assert.equal(NL.formatDuration(180, { seconds: true }), '3m 00s', 'exact minutes keep the 00s tail');
  assert.equal(NL.formatDuration(5400, { seconds: true }), '90m 00s', 'over an hour: minutes stay unbounded, no hours unit');
  assert.equal(NL.formatDuration('222s', { seconds: true }), '3m 42s', 'Routes-style string accepted in seconds mode too');
  assert.equal(NL.formatDuration(0, { seconds: true }), '—', 'zero reads as absent — same fallback as base, not "0s"');
  assert.equal(NL.formatDuration(-5, { seconds: true }), '—');
  assert.equal(NL.formatDuration('rubbish', { seconds: true }), '—');
  assert.equal(NL.formatDuration(null, { seconds: true }), '—');
  assert.equal(NL.formatDuration(5400), '1h 30min', 'default output unchanged by the opts arg');
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
  assert.ok(url.startsWith('/assets/crests/'), 'root-relative, same-origin');
  assert.ok(url.endsWith('/AFC%20Fylde.png'), 'encoded name + .png');
  assert.match(NL.clubs.crestUrl(''), /National%20League%20rose\.png$/);
});

test('the canon serves no asset from a third party', () => {
  /* Crests are drawn into export canvases. raw.githubusercontent does not Vary
     on Origin and sits behind a 5-minute CDN cache, so a crossOrigin request
     can be handed a cached non-CORS response, fail, and ship a graphic with the
     crest silently missing. That was diagnosed and fixed inside the graphics
     tools in August 2026; the canon kept the bug for another two weeks because
     nothing checked. This is that check. */
  for (const f of ['system/nl-utils.js', 'system/nl-topbar.js', 'system/auth-guard.js']) {
    const src = readFileSync(join(REPO, f), 'utf8');
    assert.ok(!src.includes('raw.githubusercontent.com'),
      `${f} loads an asset from raw.githubusercontent — use a same-origin path`);
  }
});

test('clubs.crestUrl tiers: thumb + medium folders; no-arg unchanged', () => {
  const full = NL.clubs.crestUrl('AFC Fylde');
  assert.ok(NL.clubs.crestUrl('AFC Fylde', 'thumb').endsWith('/thumbs/AFC%20Fylde.png'), 'thumb path');
  assert.ok(NL.clubs.crestUrl('AFC Fylde', 'medium').endsWith('/medium/AFC%20Fylde.png'), 'medium path');
  assert.ok(!full.includes('/thumbs/') && !full.includes('/medium/'), 'no-arg stays full-res');
  assert.equal(NL.clubs.crestUrl('', 'thumb'), NL.clubs.ROSE, 'empty name → rose (any size)');
  assert.equal(NL.clubs.crestUrl('', 'medium'), NL.clubs.ROSE, 'empty name → rose (any size)');
});

test('clubs.crestImgHtml emits an escaped, data-crest-carrying <img> per tier', () => {
  const html = NL.clubs.crestImgHtml('AFC Fylde', 'thumb');
  assert.ok(html.startsWith('<img '), 'an <img> tag');
  assert.ok(html.includes('data-crest="AFC Fylde"'), 'carries data-crest for the wiring sweep');
  assert.ok(html.includes('src="/assets/crests/thumbs/AFC%20Fylde.png"'), 'thumb tier URL');
  assert.ok(html.includes('alt=""'), 'decorative alt by default');
  assert.ok(!html.includes('onerror'), 'no inline fallback — wiring stays a post-insertion pass');

  assert.ok(NL.clubs.crestImgHtml('AFC Fylde', 'medium').includes('src="/assets/crests/medium/AFC%20Fylde.png"'), 'medium tier URL');
  assert.ok(NL.clubs.crestImgHtml('AFC Fylde').includes('src="/assets/crests/AFC%20Fylde.png"'), 'no size arg → full-res');

  const opts = NL.clubs.crestImgHtml('Barrow', 'thumb', { className: 'ps-crest', alt: 'Barrow crest' });
  assert.ok(opts.includes('class="ps-crest"'), 'opts.className');
  assert.ok(opts.includes('alt="Barrow crest"'), 'opts.alt override');
  assert.ok(!NL.clubs.crestImgHtml('Barrow', 'thumb').includes('class='), 'no class attribute unless asked');
});

test('clubs.crestImgHtml escapes a hostile club name everywhere it appears', () => {
  const html = NL.clubs.crestImgHtml('<img src=x onerror=alert(1)>"FC', 'thumb');
  assert.ok(!html.includes('<img src=x'), 'name cannot open a tag');
  assert.ok(html.includes('data-crest="&lt;img src=x onerror=alert(1)&gt;&quot;FC"'), 'escaped in data-crest');
  assert.ok(html.includes('%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E%22FC.png'), 'URL-encoded in src');
  assert.equal((html.match(/<img /g) || []).length, 1, 'exactly one tag comes out');
});

test('sanitiseHtml href whitelist: tel: survives, javascript: still does not (v1.35)', () => {
  /* sanitiseHtml itself walks real DOM nodes (innerHTML parsing), which this
     sandbox deliberately does not stub — so test the gate itself: extract the
     href whitelist regex from the source and run it. tel: joined http(s) and
     mailto in v1.35; before that, build-wellbeing-map.js had to down-convert
     every phone link to bold text so the first edit would not silently drop
     it. The second half is the one that must never loosen: the whitelist is
     the only thing between user-entered rich text and a javascript: href. */
  const src = readFileSync(join(REPO, 'system/nl-utils.js'), 'utf8');
  const m = src.match(/if \(\/(\^\([^/]+\))\/(\w*)\.test\(href\)\) clean\.setAttribute\('href', href\)/);
  assert.ok(m, 'the href whitelist guard is present in sanitiseHtml');
  const gate = new RegExp(m[1], m[2]);
  for (const ok of ['https://nl.tools/x', 'http://example.com', 'mailto:media@thenationalleague.org.uk',
                    'tel:08088020133', 'tel:999', 'TEL:116123']) {
    assert.ok(gate.test(ok), `${ok} passes the whitelist`);
  }
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>',
                     'vbscript:x', 'file:///etc/passwd', '//evil.example', '#crisis-tel:trick']) {
    assert.ok(!gate.test(bad), `${bad} is refused an href`);
  }
});

test('clubs.wireCrestImgs sweeps img[data-crest] under a root', () => {
  const mk = (name) => ({
    src: '', onerror: null, style: {},
    getAttribute: (k) => (k === 'data-crest' ? name : null),
  });
  const a = mk('Barrow'), b = mk('AFC Fylde');
  const root = { querySelectorAll: (sel) => (sel === 'img[data-crest]' ? [a, b] : []) };
  NL.clubs.wireCrestImgs(root, true);
  assert.equal(typeof a.onerror, 'function', 'first img wired');
  assert.equal(typeof b.onerror, 'function', 'second img wired');
  a.src = NL.clubs.crestUrl('Barrow', 'thumb');
  a.onerror();                                     // thumb 404
  assert.equal(a.src, NL.clubs.crestUrl('Barrow'), 'sweep read the name back from data-crest');
  a.onerror();                                     // full 404
  assert.equal(a.style.display, 'none', 'hideOnFail passed through');
  NL.clubs.wireCrestImgs(null);                    // no root → no throw
  NL.clubs.wireCrestImgs({});                      // no querySelectorAll → no throw
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

test('roles: norm / label / realm / isClubUser fold legacy "club" + "club-viewer"', () => {
  // norm — legacy folds to canon: 'club' → 'club-admin', 'club-viewer' →
  // 'club-staff', empty → 'staff', else identity
  assert.equal(NL.roles.norm('club'), 'club-admin');
  assert.equal(NL.roles.norm('club-viewer'), 'club-staff');
  assert.equal(NL.roles.norm('club-staff'), 'club-staff');
  assert.equal(NL.roles.norm(''), 'staff');
  assert.equal(NL.roles.norm(undefined), 'staff');
  assert.equal(NL.roles.norm('admin'), 'admin');

  // label — legacy 'club' shares the club-admin label; both club-staff keys
  // share the Club Staff label
  assert.equal(NL.roles.label('club'), 'Club Admin');
  assert.equal(NL.roles.label('club-admin'), 'Club Admin');
  assert.equal(NL.roles.label('club-staff'), 'Club Staff');
  assert.equal(NL.roles.label('club-viewer'), 'Club Staff');
  assert.equal(NL.roles.label('superadmin'), 'Superadmin');
  assert.equal(NL.roles.label('unknown'), 'unknown');

  // realm — league / club only; the external realm and third-party are retired
  assert.equal(NL.roles.realm('club'), 'club');
  assert.equal(NL.roles.realm('club-staff'), 'club');
  assert.equal(NL.roles.realm('club-viewer'), 'club');
  assert.equal(NL.roles.realm('staff'), 'league');
  assert.equal(NL.roles.realm('third-party'), null);
  assert.equal(NL.roles.realm('nonsense'), null);

  // isClubUser — every club tier incl. legacy keys; nothing else
  assert.ok(NL.isClubUser('club') && NL.isClubUser('club-admin')
            && NL.isClubUser('club-staff') && NL.isClubUser('club-viewer'));
  assert.ok(!NL.isClubUser('staff') && !NL.isClubUser('third-party') && !NL.isClubUser(''));
});

test('season.fromDate flips on 1 July, not August', () => {
  // The canonical boundary: a season is named for the calendar year it starts
  // in, and NLS publishes the new season's fixtures in July. Claudio carried
  // an August-flip copy of this ternary, so each July two parts of the same
  // tool named different seasons — these four dates pin the rule.
  assert.equal(NL.season.fromDate(new Date(2026, 5, 30)), 2025, '30 June → previous year');
  assert.equal(NL.season.fromDate(new Date(2026, 6, 1)), 2026, '1 July → same year');
  assert.equal(NL.season.fromDate(new Date(2026, 11, 25)), 2026, 'December → same year');
  assert.equal(NL.season.fromDate(new Date(2027, 0, 15)), 2026, 'January → previous year');
  assert.equal(typeof NL.season.fromDate(), 'number', 'no-arg derives from the clock');
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

/* The slow notice, guarded at the source because it needs a DOM and a clock.
   What is worth pinning is not that the message exists but that its timer is
   cancelled on BOTH exits: a leaked timer fires after the caller has taken the
   card down, or overwrites the error line with "still checking" on a code that
   has already come back wrong — telling someone to keep waiting for an answer
   they have had. */
test('NL.codeGate cancels the slow notice on success and on failure alike', () => {
  const src = readFileSync(join(REPO, 'system/nl-utils.js'), 'utf8');
  const gate = src.slice(src.indexOf('function codeGateOpen('),
                         src.indexOf('function codeGateResume('));
  assert.match(gate, /slow = setTimeout\(/, 'the notice is scheduled');
  assert.match(gate, /function clearSlow\(\)/);
  const fail = gate.slice(gate.indexOf('function fail('), gate.indexOf('function submit('));
  assert.match(fail, /clearSlow\(\)/, 'a refused code must not still say "still checking"');
  assert.match(gate, /clearSlow\(\);\s*\n\s*resolve\(session\)/,
    'a resolved gate must not leave a timer writing to a card the caller has hidden');
});
