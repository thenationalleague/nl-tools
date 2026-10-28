/* Fixture Management — the workbook import, the attempts history, and the
   public projection that decides what clubs can see.

   All clubs and dates here are invented. The real workbook is never
   committed (CLAUDE.md, Data handling); fixtures/_core.js was run against
   it out of tree on 28/10/2026: 1,889 fixtures, the three cases below
   (a lost row, a duplicate row, an abandonment awaiting a date) found
   as described. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { REPO, NL } from './load-canon.mjs';

const ctx = {};
vm.runInNewContext(readFileSync(join(REPO, 'fixtures/_core.js'), 'utf8'), ctx);
const F = ctx.FixturesCore;

const CLUBS = {
  'alpha town': { name: 'Alpha Town', code: 'ALP' },
  'beta united': { name: 'Beta United', code: 'BET' },
  'gamma city': { name: 'Gamma City', code: 'GAM' },
  'delta rovers': { name: 'Delta Rovers', code: 'DEL' },
};
const clubOf = (n) => CLUBS[String(n).trim().toLowerCase()] || null;

const HEAD = ['Date', 'Time', 'MD', 'Competition', 'Home team', 'Score', 'Away team', 'Broadcast',
  'Production', 'DAZN', 'AMI', 'Match State', 'Result H/D/A', 'OptaID'];
const row = (o) => HEAD.map((h) => o[h] ?? '').join('\t');
const sheet = (...rows) => [
  'Top\tToday\tBottom\t\tLast updated',
  '\t\t\t\t27/10/2026 17:39',
  HEAD.join('\t'),
  ...rows.map(row),
].join('\n');

const RHEAD = ['Original date', 'Time of postponement', 'New date', 'Date rescheduled',
  'Postponement notice', 'Competition', 'Home team', 'Away team', 'Reason'];
const rearr = (...rows) => [RHEAD.join('\t'), ...rows.map((o) => RHEAD.map((h) => o[h] ?? '').join('\t'))].join('\n');

const build = (fixtures, rearrangements, seed) =>
  F.build({ fixtures, rearrangements, seed, clubOf, parseDate: NL.parseDate });

const lg = (o) => ({ Competition: 'National', Time: '3pm', MD: '1', Broadcast: 'TBC', ...o });

test('parseKo reads the sheet\'s times and 24-hour ones alike', () => {
  assert.equal(F.parseKo('3pm'), '15:00');
  assert.equal(F.parseKo('7.45pm'), '19:45');
  assert.equal(F.parseKo('12.30pm'), '12:30');
  assert.equal(F.parseKo('15:00'), '15:00');
  assert.equal(F.parseKo('19:45:00'), '19:45');
  assert.equal(F.parseKo('noon'), null);
});

test('parseTsv keeps a quoted cell holding a tab or newline whole', () => {
  const rows = F.parseTsv('a\t"b\tc"\t"d\ne"\r\n1\t2\t3\n');
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [['a', 'b\tc', 'd\ne'], ['1', '2', '3']]);
});

test('the header is found under the sheet\'s Top/Today strip', () => {
  const r = build(sheet(lg({ Date: '08/08/2026', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g1' })));
  assert.equal(r.error, undefined);
  assert.equal(r.counts.total, 1);
  const f = r.fixtures.g1;
  assert.equal(f.date, '2026-08-08');
  assert.equal(f.ko, '15:00');
  assert.deepEqual(JSON.parse(JSON.stringify(f.home)), { name: 'Alpha Town', code: 'ALP' });
});

test('a paste without the needed headers is refused, not half-imported', () => {
  assert.match(build('Date\tHome\tAway\n08/08/2026\tA\tB').error, /No Fixtures header/);
});

test('the original date comes from the published schedule', () => {
  const seed = { fixtures: [['15/08/2026', 'National', 'Alpha Town', 'Beta United', '15:00', 0]] };
  const r = build(sheet(lg({ Date: '14/08/2026', Time: '7.45pm', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g1' })), '', seed);
  assert.deepEqual(JSON.parse(JSON.stringify(r.fixtures.g1.original)), { date: '2026-08-15', ko: '15:00' });
});

test('a rearrangement becomes a lost date with its reason and stamps', () => {
  const r = build(
    sheet(lg({ Date: '29/09/2026', Time: '7.45pm', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g1' })),
    rearr({ 'Original date': '08/08/2026 15:00', 'Time of postponement': '06/08/2026 12:26', 'New date': '29/09/2026 19:45',
      'Date rescheduled': '17/09/2026 08:34', 'Postponement notice': '2d 2h 34m', Competition: 'National',
      'Home team': 'Alpha Town', 'Away team': 'Beta United', Reason: 'Police' }));
  const a = r.fixtures.g1.attempts;
  assert.equal(a.length, 1);
  assert.equal(a[0].date, '2026-08-08');
  assert.equal(a[0].ko, '15:00');
  assert.equal(a[0].outcome, 'postponed');
  assert.equal(a[0].reason, 'Police');
  assert.equal(r.fixtures.g1.date, '2026-09-29');
});

test('a date changed with no gap is "moved", not "postponed"', () => {
  const r = build(
    sheet(lg({ Date: '14/08/2026', Time: '8pm', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g1' })),
    rearr({ 'Original date': '15/08/2026 15:00', 'Time of postponement': '29/07/2026 12:02', 'New date': '14/08/2026 20:00',
      'Date rescheduled': '29/07/2026 12:02', Competition: 'National', 'Home team': 'Alpha Town', 'Away team': 'Beta United',
      Reason: 'Mutually agreed' }));
  assert.equal(r.fixtures.g1.attempts[0].outcome, 'moved');
});

test('a sheet row left on a lost date is moved on, and the fix is reported', () => {
  const r = build(
    sheet(lg({ Date: '29/08/2026', 'Home team': 'Alpha Town', 'Away team': 'Beta United', 'Match State': 'Abandoned', OptaID: 'g1' })),
    rearr({ 'Original date': '29/08/2026 15:00', 'Time of postponement': '29/08/2026 15:37', 'New date': '29/09/2026 19:45',
      'Date rescheduled': '03/09/2026 13:34', 'Postponement notice': 'Abandoned (37m)', Competition: 'National',
      'Home team': 'Alpha Town', 'Away team': 'Beta United', Reason: 'Weather: Waterlogging' }));
  const f = r.fixtures.g1;
  assert.equal(f.date, '2026-09-29');
  assert.equal(f.ko, '19:45');
  assert.equal(f.state, 'scheduled');
  assert.equal(f.attempts[0].outcome, 'abandoned');
  assert.equal(f.attempts[0].minute, 37);
  assert.ok(r.problems.some((p) => p.kind === 'moved'));
});

test('a game awaiting a date has no date and is absent from the public view', () => {
  const r = build(
    sheet(lg({ Date: '24/10/2026', 'Home team': 'Alpha Town', 'Away team': 'Beta United', 'Match State': 'Abandoned', Broadcast: 'Overseas', OptaID: 'g1' })),
    rearr({ 'Original date': '24/10/2026 15:00', 'Time of postponement': '24/10/2026 15:14', 'Postponement notice': 'Abandoned (14m)',
      'New date': 'TBC', Competition: 'National', 'Home team': 'Alpha Town', 'Away team': 'Beta United', Reason: 'Weather: Waterlogging' }));
  const f = r.fixtures.g1;
  assert.equal(f.date, null);
  assert.equal(f.state, 'abandoned');
  assert.equal(f.attempts[0].date, '2026-10-24');
  assert.equal(F.publicView(f), null);
  assert.equal(r.counts.awaiting, 1);
});

test('postponed with no Rearrangements row still keeps the lost date, and says the reason is missing', () => {
  const r = build(sheet(lg({ Date: '07/11/2026', 'Home team': 'Alpha Town', 'Away team': 'Beta United', 'Match State': 'Postponed', OptaID: 'g1' })));
  assert.equal(r.fixtures.g1.attempts[0].outcome, 'postponed');
  assert.ok(r.problems.some((p) => p.kind === 'reason'));
});

test('two rows for one league pairing are one fixture: the earlier is a lost date', () => {
  const r = build(sheet(
    lg({ Date: '15/08/2026', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g1' }),
    lg({ Date: '19/12/2026', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g1' })));
  assert.equal(r.counts.total, 1);
  assert.equal(r.fixtures.g1.date, '2026-12-19');
  assert.equal(r.fixtures.g1.attempts[0].date, '2026-08-15');
  assert.ok(r.problems.some((p) => p.kind === 'duplicate'));
});

test('FA ties: an outside club is kept by name, the result says who went through', () => {
  const r = build(sheet(
    { Date: '19/09/2026', Time: '3pm', MD: 'R2Q', Competition: 'FA Cup', 'Home team': 'Nowhere Athletic', Score: '2-4',
      'Away team': 'Alpha Town', 'Result H/D/A': 'A Cup', OptaID: '#N/A' },
    { Date: '19/09/2026', Time: '3pm', MD: 'R2Q', Competition: 'FA Cup', 'Home team': 'Gamma City', Score: '2-2',
      'Away team': 'Somewhere FC', 'Result H/D/A': 'D Cup' }));
  const ties = Object.values(r.fixtures);
  const a = ties.find((t) => t.home.name === 'Nowhere Athletic');
  assert.deepEqual(JSON.parse(JSON.stringify(a.home)), { name: 'Nowhere Athletic' });
  assert.equal(a.wentThrough, 'away');
  assert.equal(a.score, '2-4');
  assert.equal(a.broadcast.availability, 'cup');
  assert.equal(ties.find((t) => t.home.name === 'Gamma City').wentThrough, 'replay');
  assert.equal(r.problems.filter((p) => p.kind === 'club').length, 0, 'outside clubs are expected in FA ties');
  assert.equal(r.counts.noOpta, 0, 'FA ties never get an Opta ID, so they are not counted missing');
});

test('an FA tie past its date with no result is due', () => {
  const r = build(sheet({ Date: '19/09/2026', MD: 'R2Q', Competition: 'FA Cup', 'Home team': 'Gamma City', 'Away team': 'Somewhere FC' }));
  const t = Object.values(r.fixtures)[0];
  assert.equal(F.cupResultDue(t, '2026-09-20'), true);
  assert.equal(F.cupResultDue(t, '2026-09-19'), false);
  assert.equal(F.counts(r.fixtures, '2026-09-20').cupDue, 1);
});

test('NL Cup imports as Worldwide and counts as missing its Opta ID', () => {
  const r = build(sheet({ Date: '18/08/2026', Time: '7.45pm', MD: 'A1', Competition: 'NL Cup', 'Home team': 'Alpha Town', 'Away team': 'Gamma City', OptaID: '#N/A' }));
  const t = Object.values(r.fixtures)[0];
  assert.equal(t.broadcast.availability, 'worldwide');
  assert.equal(r.counts.noOpta, 1);
});

test('a league fixture against an unknown club is reported', () => {
  const r = build(sheet(lg({ Date: '08/08/2026', 'Home team': 'Alpha Town', 'Away team': 'Alpha Twon', OptaID: 'g1' })));
  assert.ok(r.problems.some((p) => p.kind === 'club' && /Alpha Twon/.test(p.text)));
});

test('a minted key is stable for the same tie and unique across clashes', () => {
  assert.equal(F.mintKey('fa-cup', 'R2Q', 'Gamma City', 'Somewhere FC'), 'fa-cup-r2q-gamma-city-somewhere-fc');
  const r = build(sheet(
    { Date: '19/09/2026', MD: 'R2Q', Competition: 'FA Cup', 'Home team': 'Gamma City', 'Away team': 'Somewhere FC' },
    { Date: '22/09/2026', MD: 'R2Q', Competition: 'FA Cup', 'Home team': 'Gamma City', 'Away team': 'Somewhere FC' }));
  assert.deepEqual(Object.keys(r.fixtures).sort(), ['fa-cup-r2q-gamma-city-somewhere-fc', 'fa-cup-r2q-gamma-city-somewhere-fc-2']);
});

test('broadcast flags come across: Enhanced, moved by DAZN, AMI', () => {
  const r = build(sheet(lg({ Date: '08/08/2026', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g1',
    Broadcast: 'Worldwide', Production: 'Enhanced', DAZN: 'DAZN', AMI: 'AMI' })));
  assert.deepEqual(JSON.parse(JSON.stringify(r.fixtures.g1.broadcast)),
    { availability: 'worldwide', enhanced: true, daznMove: true, ami: true });
});

test('the public view shows only Worldwide or Overseas, and never AMI or the history', () => {
  const r = build(sheet(
    lg({ Date: '08/08/2026', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g1', Broadcast: 'Worldwide', AMI: 'AMI' }),
    lg({ Date: '08/08/2026', 'Home team': 'Gamma City', 'Away team': 'Delta Rovers', OptaID: 'g2', Broadcast: 'Not selected' }),
    lg({ Date: '08/08/2026', 'Home team': 'Beta United', 'Away team': 'Gamma City', OptaID: 'g3', Broadcast: 'TBC' })));
  const p1 = F.publicView(r.fixtures.g1);
  assert.equal(p1.broadcast, 'worldwide');
  assert.deepEqual(Object.keys(p1).sort(), ['away', 'broadcast', 'comp', 'date', 'home', 'ko', 'optaID', 'round']);
  assert.equal(F.publicView(r.fixtures.g2).broadcast, null);
  assert.equal(F.publicView(r.fixtures.g3).broadcast, null);
});
