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
  'Production', 'DAZN', 'AMI', 'Match State', 'Goals H', 'Goals A', 'Goals AET H', 'Goals AET A',
  'Goals pens H', 'Goals pens A', 'Result H/D/A', 'OptaID'];
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

test('a return fixture entered the wrong way round is turned round, not merged', () => {
  /* The published schedule has the reverse pairing on the second row's date;
     the sheet copied the first game's Opta ID down. v1.0 merged the two and
     lost a game. */
  const seed = { fixtures: [
    ['15/08/2026', 'National', 'Alpha Town', 'Beta United', '15:00', 0],
    ['19/12/2026', 'National', 'Beta United', 'Alpha Town', '15:00', 0],
  ] };
  const r = build(sheet(
    lg({ Date: '15/08/2026', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g1', 'Goals H': '3', 'Goals A': '0' }),
    lg({ Date: '19/12/2026', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g1' })), '', seed);
  assert.equal(r.counts.total, 2);
  assert.equal(r.fixtures.g1.date, '2026-08-15');
  assert.equal(r.fixtures.g1.attempts.length, 0, 'the played game invents no postponement');
  const back = Object.values(r.fixtures).find((f) => f.home.name === 'Beta United');
  assert.equal(back.date, '2026-12-19');
  assert.equal(back.optaID, null, 'the borrowed ID is dropped');
  assert.ok(r.problems.some((p) => p.kind === 'reversed'));
});

test('two rows for one pairing that the schedule cannot explain are both kept', () => {
  const r = build(sheet(
    lg({ Date: '15/08/2026', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g1' }),
    lg({ Date: '22/08/2026', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g2' })));
  assert.equal(r.counts.total, 2);
  assert.ok(r.problems.some((p) => p.kind === 'duplicate'));
});

test('FA ties: an outside club is kept by name, the result says who went through', () => {
  const r = build(sheet(
    { Date: '19/09/2026', Time: '3pm', MD: 'R2Q', Competition: 'FA Cup', 'Home team': 'Nowhere Athletic', Score: '2-4',
      'Away team': 'Alpha Town', 'Goals H': '2', 'Goals A': '4', 'Result H/D/A': 'A Cup', OptaID: '#N/A' },
    { Date: '19/09/2026', Time: '3pm', MD: 'R2Q', Competition: 'FA Cup', 'Home team': 'Gamma City', Score: '2-2',
      'Away team': 'Somewhere FC', 'Goals H': '2', 'Goals A': '2', 'Result H/D/A': 'D Cup' }));
  const ties = Object.values(r.fixtures);
  const a = ties.find((t) => t.home.name === 'Nowhere Athletic');
  assert.deepEqual(JSON.parse(JSON.stringify(a.home)), { name: 'Nowhere Athletic' });
  assert.equal(a.wentThrough, 'away');
  assert.equal(F.resultText(a.result), '2-4');
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
  assert.deepEqual(Object.keys(p1).sort(), ['away', 'broadcast', 'comp', 'date', 'home', 'ko', 'neutral', 'optaID', 'playoff', 'result', 'round', 'score', 'venue']);
  assert.equal(F.publicView(r.fixtures.g2).broadcast, null);
  assert.equal(F.publicView(r.fixtures.g3).broadcast, null);
});

test('results import with extra time and penalties, written the way the sheet writes them', () => {
  const r = build(sheet({ Date: '22/09/2026', MD: 'R2QR', Competition: 'FA Cup', 'Home team': 'Gamma City', 'Away team': 'Somewhere FC',
    'Goals H': '0', 'Goals A': '0', 'Goals AET H': '1', 'Goals AET A': '1', 'Goals pens H': '4', 'Goals pens A': '3', 'Result H/D/A': 'H pen Cup' }));
  const t = Object.values(r.fixtures)[0];
  assert.equal(F.resultText(t.result), '0-0 (1-1 aet, 4-3 p)');
  assert.equal(t.wentThrough, 'home');
});

test('an FA replay won in extra time goes through, though the sheet says D Cup', () => {
  /* The sheet's Result column records the 90 minutes: Dorking 3-3 (5-4 aet)
     was 'D Cup' in the real workbook. */
  const r = build(sheet({ Date: '22/09/2026', MD: 'R2QR', Competition: 'FA Cup', 'Home team': 'Gamma City', 'Away team': 'Somewhere FC',
    'Goals H': '3', 'Goals A': '3', 'Goals AET H': '5', 'Goals AET A': '4', 'Result H/D/A': 'D Cup' }));
  assert.equal(Object.values(r.fixtures)[0].wentThrough, 'home');
});

test('parseScore reads every form the sheet uses, and nothing else', () => {
  const j = (x) => JSON.parse(JSON.stringify(x));
  assert.deepEqual(j(F.parseScore('2-1')), { h: 2, a: 1, aet: null, pens: null, source: 'paste' });
  assert.deepEqual(j(F.parseScore(' 1-1 (4-5 p) ')).pens, { h: 4, a: 5 });
  assert.deepEqual(j(F.parseScore('3-3 (5-4 aet)')).aet, { h: 5, a: 4 });
  const both = j(F.parseScore('0-0 (1-1 aet, 4-3 p)'));
  assert.deepEqual([both.aet, both.pens], [{ h: 1, a: 1 }, { h: 4, a: 3 }]);
  assert.equal(F.parseScore('16th vs 19th'), null);
  assert.equal(F.parseScore('#N/A'), null);
});

test('a pasted day of results finds its fixtures, in the sheet\'s columns or a bare home/score/away', () => {
  const r = build(sheet(
    lg({ Date: '18/08/2026', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g1' }),
    lg({ Date: '18/08/2026', 'Home team': 'Gamma City', 'Away team': 'Delta Rovers', OptaID: 'g2', 'Goals H': '1', 'Goals A': '0' })));
  const out = F.resultsFromPaste(r.fixtures, [
    '18/08/2026 19:00\tC4\tNational\tAlpha Town\t 5-2 \tBeta United',
    'Gamma City\t2-0\tDelta Rovers',
    'Nobody FC\t1-0\tNowhere',
  ].join('\n'), NL.parseDate);
  assert.equal(out.matches.length, 2);
  assert.equal(F.resultText(out.matches[0].result), '5-2');
  assert.equal(out.matches[1].differs, true, 'a different score already held is flagged, not silently taken');
  assert.equal(out.unmatched.length, 1);
});

test('postponing takes the date off; a new date stamps the rescheduling', () => {
  const r = build(sheet(lg({ Date: '07/11/2026', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g1' })));
  const p = F.loseDate(r.fixtures.g1, { outcome: 'postponed', reason: 'Weather: Frozen', at: '2026-11-06T10:00:00.000Z' });
  assert.equal(p.date, null);
  assert.equal(p.state, 'postponed');
  assert.equal(F.publicView(p), null);
  assert.equal(r.fixtures.g1.date, '2026-11-07', 'the original record is not changed');
  const s2 = F.setDate(p, '2026-12-01', '19:45', '2026-11-10T09:00:00.000Z');
  assert.equal(s2.date, '2026-12-01');
  assert.equal(s2.attempts.length, 1);
  assert.equal(s2.attempts[0].rescheduledAt, '2026-11-10T09:00:00.000Z');
  const moved = F.setDate(s2, '2026-12-02', '19:45', '2026-11-11T09:00:00.000Z');
  assert.equal(moved.attempts[1].outcome, 'moved');
});

test('abandoning keeps the minute; removing a mistaken lost date gives the date back', () => {
  const r = build(sheet(lg({ Date: '24/10/2026', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g1' })));
  const a = F.loseDate(r.fixtures.g1, { outcome: 'abandoned', reason: 'Weather: Waterlogged', minute: 37, at: '2026-10-24T15:37:00.000Z' });
  assert.equal(a.attempts[0].minute, 37);
  const back = F.dropAttempt(a, 0);
  assert.equal(back.date, '2026-10-24');
  assert.equal(back.state, 'scheduled');
  assert.equal(back.attempts.length, 0);
});

test('NLS results fill an empty score and an Opta ID, and flag a different score', () => {
  /* NLS shape from a live call to /v2/matches/?seasonID=2026&competitionID=1275,
     28/10/2026: attributes.kickOffDateUTC 'YYYY-MM-DD HH:MM:SS' (UTC),
     matchPeriod 'FullTime', homeTeam/awayTeam { teamID, name, score,
     penaltyScore }. */
  const nls = [
    { id: 'g9', attributes: { competitionID: 1275, kickOffDateUTC: '2026-08-18 18:00:00', matchPeriod: 'FullTime',
      homeTeam: { teamID: 't1', name: 'Alpha Town', score: 1, penaltyScore: 4 },
      awayTeam: { teamID: 't99', name: 'Somewhere PL2', score: 1, penaltyScore: 5 } } },
    { id: 'g2', attributes: { competitionID: 89, kickOffDateUTC: '2026-08-08 14:00:00', matchPeriod: 'FullTime',
      homeTeam: { teamID: 't3', name: 'Gamma City', score: 2, penaltyScore: null },
      awayTeam: { teamID: 't4', name: 'Delta Rovers', score: 0, penaltyScore: null } } },
    { id: 'g3', attributes: { competitionID: 89, kickOffDateUTC: '2026-11-07 15:00:00', matchPeriod: 'PreMatch',
      homeTeam: { teamID: 't3', name: 'Gamma City', score: null }, awayTeam: { teamID: 't1', name: 'Alpha Town', score: null } } },
  ];
  const res = F.nlsResults(nls);
  assert.equal(res.length, 3);
  assert.equal(res.find((n) => n.id === 'g3').result, null, 'an unplayed game carries no result');
  const r = build(sheet(
    { Date: '18/08/2026', Time: '7pm', MD: 'A1', Competition: 'NL Cup', 'Home team': 'Alpha Town', 'Away team': 'Gamma City' },
    lg({ Date: '08/08/2026', 'Home team': 'Gamma City', 'Away team': 'Delta Rovers', OptaID: 'g2', 'Goals H': '2', 'Goals A': '1' })));
  const london = (t) => new Date(t + 3600e3).toISOString().slice(0, 10);
  const m = F.matchNls(r.fixtures, res, london, (id) => ({ t1: 'Alpha Town' })[id] || null);
  const cup = m.find((x) => x.nls === 'g9');
  assert.equal(cup.optaID, 'g9');
  assert.equal(F.resultText(cup.result), '1-1 (4-5 p)');
  assert.equal(m.find((x) => x.nls === 'g2').differs, true);
});

test('an unplayed NLS game fills a missing Opta ID and nothing else', () => {
  const nls = [{ id: 'g7', attributes: { competitionID: 89, kickOffDateUTC: '2026-12-19 15:00:00', matchPeriod: 'PreMatch',
    homeTeam: { teamID: 't2', name: 'Beta United', score: null }, awayTeam: { teamID: 't1', name: 'Alpha Town', score: null } } }];
  const r = build(sheet(lg({ Date: '19/12/2026', 'Home team': 'Beta United', 'Away team': 'Alpha Town' })));
  const m = F.matchNls(r.fixtures, F.nlsResults(nls), (t) => new Date(t).toISOString().slice(0, 10), () => null);
  assert.equal(m.length, 1);
  assert.equal(m[0].optaID, 'g7');
  assert.equal(m[0].result, null);
});

test('a day reads by competition, then kick-off', () => {
  const r = build(sheet(
    lg({ Date: '28/10/2026', Time: '7.45pm', Competition: 'South', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g1' }),
    lg({ Date: '28/10/2026', Time: '7.45pm', Competition: 'National', 'Home team': 'Gamma City', 'Away team': 'Delta Rovers', OptaID: 'g2' }),
    lg({ Date: '28/10/2026', Time: '7pm', Competition: 'National', 'Home team': 'Delta Rovers', 'Away team': 'Alpha Town', OptaID: 'g3' })));
  const order = Object.values(r.fixtures).sort(F.compare).map((f) => f.key);
  assert.deepEqual(order, ['g3', 'g2', 'g1']);
});

/* Attendance archive records. Shapes from the code that writes them:
   gas/FixtureSync.js fs_mapNlsFixtureToRecord_ (the NLS copy) and
   attendance/index.html submitAddCupFixtureForm (by hand). Invented clubs. */
const OPTA = { t1: { name: 'Alpha Town', code: 'ALP' }, t2: { name: 'Beta United', code: 'BET' },
  t3: { name: 'Gamma City', code: 'GAM' } };
const london = (t) => { const d = new Date(t + 3600e3); return { date: d.toISOString().slice(0, 10), ko: d.toISOString().slice(11, 16) }; };
const att = (fixtures) => F.fromAttendance(fixtures, { clubByOpta: (id) => OPTA[id] || null, clubOf, london });

test('a past season comes over from Attendance keyed by its match IDs, scores and neutral tags kept', () => {
  const r = att({
    g100: { competitionKey: 'nl', kickoffUTC: '2025-08-09 14:00:00', matchPeriod: 'FullTime',
      homeTeamID: 't1', homeTeamName: 'Alpha Town', awayTeamID: 't2', awayTeamName: 'Beta United', homeScore: 2, awayScore: 1 },
    manual_fa_cup_20251101_gammacity_v_nowhere: { competitionKey: 'fa-cup', kickoffUTC: '2025-11-01T15:00:00',
      homeTeamID: 't3', homeTeamName: 'Gamma City', awayTeamName: 'Nowhere FC', homeScore: 0, awayScore: 1,
      isNeutral: true, venueName: 'Somewhere Park' },
  });
  const l = r.fixtures.g100;
  assert.equal(l.optaID, 'g100');
  assert.equal(l.date, '2025-08-09');
  assert.equal(l.ko, '15:00', 'NLS kick-offs are UTC, shown in UK time');
  assert.equal(F.resultText(l.result), '2-1');
  const c = r.fixtures.manual_fa_cup_20251101_gammacity_v_nowhere;
  assert.equal(c.ko, '15:00', 'a hand-typed kick-off is already UK time');
  assert.equal(c.optaID, null);
  assert.equal(c.wentThrough, 'away');
  assert.equal(c.neutral, true);
  assert.equal(F.publicView(c).venue, 'Somewhere Park');
  assert.deepEqual(JSON.parse(JSON.stringify(F.publicView(l).score)), { h: 2, a: 1 });
});

test('a league game after a club has played its whole league season is a play-off', () => {
  /* Three clubs: a full league season is 2 × (3 − 1) = 4 games each. */
  const g = (id, day, h, a) => [id, { competitionKey: 'nl', kickoffUTC: '2026-0' + day + ' 14:00:00', matchPeriod: 'FullTime',
    homeTeamID: h, homeTeamName: OPTA[h].name, awayTeamID: a, awayTeamName: OPTA[a].name, homeScore: 1, awayScore: 0 }];
  const r = att(Object.fromEntries([
    g('g1', '1-01', 't1', 't2'), g('g2', '1-08', 't2', 't3'), g('g3', '1-15', 't3', 't1'),
    g('g4', '1-22', 't2', 't1'), g('g5', '1-29', 't3', 't2'), g('g6', '2-05', 't1', 't3'),
    g('g7', '5-01', 't1', 't2'),
  ]));
  assert.equal(r.fixtures.g6.playoff, null);
  assert.equal(r.fixtures.g7.comp, 'national');
  assert.equal(r.fixtures.g7.playoff, true);
});

test('an Attendance game left postponed with no score comes over awaiting a date', () => {
  const r = att({ g9: { competitionKey: 'south', kickoffUTC: '2026-01-10 15:00:00', matchPeriod: 'Postponed',
    postponementReason: 'Frozen pitch', homeTeamID: 't1', homeTeamName: 'Alpha Town', awayTeamID: 't2', awayTeamName: 'Beta United' } });
  assert.equal(r.fixtures.g9.date, null);
  assert.equal(r.fixtures.g9.attempts[0].reason, 'Frozen pitch');
});

test('a workbook row kept for a postponed date folds into the played game as a lost date', () => {
  /* The 2025-26 sheet keeps each lost date as its own row beside the
     played one (212 of them). */
  const r = build(sheet(
    lg({ Date: '09/08/2025', 'Home team': 'Alpha Town', 'Away team': 'Beta United', 'Match State': 'Postponed' }),
    lg({ Date: '16/09/2025', Time: '7.45pm', 'Home team': 'Alpha Town', 'Away team': 'Beta United', 'Goals H': '1', 'Goals A': '0' })));
  assert.equal(r.counts.total, 1);
  const f = Object.values(r.fixtures)[0];
  assert.equal(f.date, '2025-09-16');
  assert.equal(f.attempts[0].date, '2025-08-09');
  assert.equal(f.attempts[0].outcome, 'postponed');
  assert.equal(r.problems.filter((p) => p.kind === 'duplicate').length, 0);
});

test('the 2025-26 sheet\'s play-off labels and DAZN pick column read correctly', () => {
  const r = build(sheet(
    { Date: '03/05/2026', Time: '3pm', MD: 'SF', Competition: 'National Playoffs', 'Home team': 'Alpha Town', 'Away team': 'Beta United' }));
  const po = Object.values(r.fixtures)[0];
  assert.equal(po.comp, 'national', 'a play-off belongs to its division');
  assert.equal(po.playoff, true);
});

test('a past season keys to the Attendance archive: Opta IDs by date and clubs, FA ties by the archive or its ID formula', () => {
  const r = build(sheet(
    lg({ Date: '09/08/2025', 'Home team': 'Alpha Town', 'Away team': 'Beta United' }),
    { Date: '01/11/2025', MD: 'R1', Competition: 'FA Cup', 'Home team': 'Gamma City', 'Away team': 'Nowhere & District' },
    { Date: '08/11/2025', MD: 'R2', Competition: 'FA Trophy', 'Home team': 'Gamma City', 'Away team': 'Somewhere FC' },
    lg({ Date: '10/08/2025', 'Home team': 'Delta Rovers', 'Away team': 'Gamma City' })));
  /* Shapes as gas/FixtureSync.js and attendance's Add cup fixture write them. */
  const archive = {
    g500: { kickoffUTC: '2025-08-09 14:00:00', homeTeamName: 'Alpha Town', awayTeamName: 'Beta United' },
    manual_fa_trophy_20251108_x: { kickoffUTC: '2025-11-08T15:00:00', homeTeamName: 'Gamma City', awayTeamName: 'Somewhere F.C.' },
  };
  const k = F.keyToAttendance(r.fixtures, archive);
  const keys = Object.keys(k.fixtures).sort();
  assert.ok(keys.includes('g500'));
  assert.equal(k.fixtures.g500.optaID, 'g500');
  assert.ok(keys.includes('manual_fa_trophy_20251108_x'), 'matched on date and home club when names differ');
  assert.ok(keys.includes('manual_fa-cup_20251101_gammacity_v_nowhereanddistrict'), 'no archive match: Attendance\'s own ID formula');
  assert.equal(k.matched, 2);
  assert.equal(k.formula, 1);
  assert.equal(k.unmatched.length, 1);
  assert.equal(k.unmatched[0].home.name, 'Delta Rovers');
});

test('a held extra-time result agrees with NLS\'s single final score', () => {
  const held = F.parseScore('0-0 (1-0 aet)');
  assert.equal(F.agreesWithNls(held, F.parseScore('1-0')), true);
  assert.equal(F.agreesWithNls(F.parseScore('2-0'), F.parseScore('3-1')), false);
  assert.equal(F.agreesWithNls(F.parseScore('1-1 (4-5 p)'), F.parseScore('1-1 (4-5 p)')), true);
  assert.equal(F.agreesWithNls(F.parseScore('1-1 (4-5 p)'), F.parseScore('1-1 (5-4 p)')), false);
});

test('a play-off between clubs who also met in the league is its own game, not a duplicate', () => {
  const r = build(sheet(
    lg({ Date: '10/01/2026', Competition: 'South', 'Home team': 'Alpha Town', 'Away team': 'Beta United', 'Goals H': '1', 'Goals A': '0' }),
    { Date: '02/05/2026', Time: '3pm', MD: 'SF', Competition: 'South Playoffs', 'Home team': 'Alpha Town', 'Away team': 'Beta United', 'Goals H': '2', 'Goals A': '2' }));
  assert.equal(r.counts.total, 2);
  assert.equal(r.counts.playoffs, 1);
  assert.equal(r.problems.filter((p) => p.kind === 'duplicate' || p.kind === 'reversed').length, 0);
  const po = Object.values(r.fixtures).find((f) => f.playoff);
  assert.equal(po.comp, 'south');
  assert.equal(po.round, 'SF');
});

test('a bare Playoffs label takes the home club\'s division', () => {
  const r = F.build({ fixtures: sheet({ Date: '02/05/2026', Time: '3pm', MD: 'SF', Competition: 'Playoffs',
    'Home team': 'Alpha Town', 'Away team': 'Beta United' }), clubOf, parseDate: NL.parseDate,
    divisionOf: (n) => (n === 'Alpha Town' ? 'North' : null) });
  assert.equal(Object.values(r.fixtures)[0].comp, 'north');
});

test('a broadcast game given a new date is marked for review; an unavailable one is not', () => {
  const r = build(sheet(
    lg({ Date: '07/11/2026', 'Home team': 'Alpha Town', 'Away team': 'Beta United', OptaID: 'g1', Broadcast: 'Worldwide' }),
    lg({ Date: '07/11/2026', 'Home team': 'Gamma City', 'Away team': 'Delta Rovers', OptaID: 'g2', Broadcast: 'Unavailable' })));
  const at = '2026-11-01T10:00:00.000Z';
  assert.equal(F.setDate(r.fixtures.g1, '2026-11-10', '19:45', at).broadcast.review, true);
  assert.equal(F.setDate(r.fixtures.g2, '2026-11-10', '19:45', at).broadcast.review, undefined);
  assert.equal(F.setDate(r.fixtures.g1, '2026-11-07', '15:00', at).broadcast.review, undefined, 'same date and kick-off: nothing to review');
});
