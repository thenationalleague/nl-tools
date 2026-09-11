/* Academy & Alliance graphic — name resolution.

   The competition's published tables print team names like
   "Hartlepool United FC U19 Hartlepool Unit" (truncated at ~40 chars) and
   "Woking (Youth & Academy) U19 Elite Devel". resolveTeam() has to find the
   club in that. The fixtures below are every name from all eleven divisions'
   tables as pasted on 10/09/2026, with the name each should print (the Divisional Constitution 2026-27
   spelling) and where its crest comes from — a clubs-meta record, or `null`
   when the crest file is simply named after the printed name. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { REPO } from './load-canon.mjs';

const meta = JSON.parse(readFileSync(join(REPO, 'assets/data/clubs-meta.json'), 'utf8'));
const src = readFileSync(join(REPO, 'graphics/academy-alliance/app.js'), 'utf8');

const window = {
  NL: {
    escHtml: (s) => String(s == null ? '' : s),
    clubs: {
      meta: () => meta,
      load: () => Promise.resolve(meta),
      all: () => Promise.resolve(meta.clubs),
      byName: (n) => meta.clubs.find((c) => c.name.toLowerCase() === String(n || '').toLowerCase()) || null,
    },
  },
};
window.window = window;
const ctx = vm.createContext({ window, NL: window.NL, document: {}, localStorage: {}, console });
vm.runInContext(src, ctx, { filename: 'app.js' });
const resolve = window.TOOL.resolveTeam;

/* [pasted name, division, printed name, crest source (roster record or null)] */
const CASES = [
  // Academy North
  ['FC Halifax Town U19', 'academy-north', 'FC Halifax Town', 'FC Halifax Town'],
  ['Solihull Moors U19 Elite NLA Academy', 'academy-north', 'Solihull Moors', 'Solihull Moors'],
  ['AFC Fylde U19 National League North', 'academy-north', 'AFC Fylde', 'AFC Fylde'],
  ['South Shields U19 s', 'academy-north', 'South Shields', 'South Shields'],
  ['Chester FC U19 Scholars', 'academy-north', 'Chester', 'Chester'],
  ['Hartlepool United FC U19 Hartlepool Unit', 'academy-north', 'Hartlepool United', 'Hartlepool United'],
  ['Southport FC U19 Academy', 'academy-north', 'Southport', 'Southport'],
  ['Harrogate Town FC U19 Academy', 'academy-north', 'Harrogate Town', 'Harrogate Town'],
  ['Altrincham FC U19 AFC Red', 'academy-north', 'Altrincham', 'Altrincham'],
  ['Gateshead FC U19 Academy North', 'academy-north', 'Gateshead', 'Gateshead'],
  ['Boston United FC U19 Academy Division', 'academy-north', 'Boston United', 'Boston United'],
  ['Hednesford Town U19', 'academy-north', 'Hednesford Town', 'Hednesford Town'],
  ['Morecambe FC U19 Morecambe FC U19', 'academy-north', 'Morecambe', 'Morecambe'],
  // Academy South
  ['Southend United Community Sports Club U1', 'academy-south', 'Southend United', 'Southend United'],
  ['Sutton United FC U19 Sutton United U19', 'academy-south', 'Sutton United', 'Sutton United'],
  ['Woking (Youth & Academy) U19 Elite Devel', 'academy-south', 'Woking', 'Woking'],
  ['Dagenham & Redbridge FC U19', 'academy-south', 'Dagenham & Redbridge', 'Dagenham & Redbridge'],
  ['Eastleigh FC U19 EDS', 'academy-south', 'Eastleigh', 'Eastleigh'],
  ['Aldershot Town U19 ( Aldershot) (NLYA)', 'academy-south', 'Aldershot Town', 'Aldershot Town'],
  ['Oxford City FC Velocity National League', 'academy-south', 'Oxford City', 'Oxford City'],
  ['Forest Green Rovers U19', 'academy-south', 'Forest Green Rovers', 'Forest Green Rovers'],
  ['Maidstone United FC U19 Academy', 'academy-south', 'Maidstone United', 'Maidstone United'],
  ['Dorking Wanderers FC U19', 'academy-south', 'Dorking Wanderers', 'Dorking Wanderers'],
  ['Slough Town FC U19 Academy U19', 'academy-south', 'Slough Town', 'Slough Town'],
  ['Boreham Wood U19 U19 Whites', 'academy-south', 'Boreham Wood', 'Boreham Wood'],
  ['Wealdstone FC U19 Wealdstone FC', 'academy-south', 'Wealdstone', 'Wealdstone'],
  ['Maidenhead United CT U19', 'academy-south', 'Maidenhead United', 'Maidenhead United'],
  // Alliance A
  ['Chelmsford City U19', 'alliance-a', 'Chelmsford City', 'Chelmsford City'],
  ['Lowestoft Town FC U19', 'alliance-a', 'Lowestoft Town', null],
  ['AFC Sudbury U19 Academy', 'alliance-a', 'AFC Sudbury', null],
  ['Enfield Town FC U19 Academy - Yellows', 'alliance-a', 'Enfield Town', 'Enfield Town'],
  ['Billericay Town U19', 'alliance-a', 'Billericay Town', 'Billericay Town'],
  ['Aveley U19 NL', 'alliance-a', 'Aveley', null],
  ['Wroxham F.C. U19', 'alliance-a', 'Wroxham', null],
  ["Bishop's Stortford FC U19", 'alliance-a', "Bishop's Stortford", null],
  ['Kings Lynn Town FC U19 Academy', 'alliance-a', "King's Lynn Town", "King's Lynn Town"],
  ['Barking U19 Blues', 'alliance-a', 'Barking', null],
  ['Hertford Town U19 Hertford Town Whites', 'alliance-a', 'Hertford Town', null],
  // Alliance B
  ['Tonbridge Angels FC U19 Academy', 'alliance-b', 'Tonbridge Angels', 'Tonbridge Angels'],
  ['Dartford FC U19 Academy Whites', 'alliance-b', 'Dartford', null],
  ['Folkestone Invicta FC U19 Academy', 'alliance-b', 'Folkestone Invicta', 'Folkestone Invicta'],
  ['Eastbourne Borough FC U19', 'alliance-b', 'Eastbourne Borough', 'Eastbourne Borough'],
  ['Maidstone United FC U19 Academy (2)', 'alliance-b', 'Maidstone United', 'Maidstone United'],
  ['Burgess Hill Town U19 Burgess Hill Town', 'alliance-b', 'Burgess Hill', null],
  ['Ebbsfleet United Youth U19 Academy', 'alliance-b', 'Ebbsfleet United', 'Ebbsfleet United'],
  ['Whitstable Town FC U19 Academy U19', 'alliance-b', 'Whitstable Town', null],
  ['Dover Athletic FC U19 Academy Whites', 'alliance-b', 'Dover Athletic', 'Dover Athletic'],
  // Alliance C
  ['Hertford Town Hertford Town Blues U19', 'alliance-c', 'Hertford Town', null],
  ['Chesham United FC U19', 'alliance-c', 'Chesham United', 'Chesham United'],
  ['Slough Town FC U19 STFC Academy', 'alliance-c', 'Slough Town', 'Slough Town'],
  ['Flackwell Heath FC U19 National Alliance', 'alliance-c', 'Flackwell Heath', null],
  ['Hemel Hempstead Town U19 Alliance', 'alliance-c', 'Hemel Hempstead', 'Hemel Hempstead Town'],
  ['Wellingborough Town U19', 'alliance-c', 'Wellingborough', null],
  ['Bedford Town U19 Academy', 'alliance-c', 'Bedford Town', 'Bedford Town'],
  ['Barnet FC U18 SS2', 'alliance-c', 'Barnet', null],
  ['Wealdstone FC U19 National League Allian', 'alliance-c', 'Wealdstone', 'Wealdstone'],
  ['Brentford FC CST (Youth) U19', 'alliance-c', 'Brentford CST', null],
  // Alliance D
  ['Dagenham & Redbridge FC Pathway', 'alliance-d', 'Dagenham & Redbridge', 'Dagenham & Redbridge'],
  ['Hollands And Blair U19', 'alliance-d', 'Hollands & Blair', null],
  ['Faversham Town FC U19 Alliance', 'alliance-d', 'Faversham Town', null],
  ['Cray Wanderers Youth U19 Academy Nationa', 'alliance-d', 'Cray Wanderers', null],
  ['Dartford FC U19 Academy Yellows', 'alliance-d', 'Dartford', null],
  ['Dover Athletic FC U19 Academy Blues', 'alliance-d', 'Dover Athletic', 'Dover Athletic'],
  ['Folkestone Invicta FC U19 Folkestone Inv', 'alliance-d', 'Folkestone Invicta', 'Folkestone Invicta'],
  ['Bromley FC U19 Bromley Academy 2.1', 'alliance-d', 'Bromley', null],
  ['Ramsgate FC U19', 'alliance-d', 'Ramsgate', null],
  // Alliance E
  ['Basingstoke Town Youth U19', 'alliance-e', 'Basingstoke Town', null],
  ['Dorchester Town FC U19 Dorchester Town U', 'alliance-e', 'Dorchester Town', null],
  ['Eastleigh FC U19 Yellows', 'alliance-e', 'Eastleigh', 'Eastleigh'],
  ['Havant & Waterlooville FC U19 HSDC', 'alliance-e', 'Havant & Waterlooville', null],
  ['Torquay United Youth U19 Torquay United', 'alliance-e', 'Torquay United', 'Torquay United'],
  ['Weston super Mare AFC U19 WsM AFC', 'alliance-e', 'Weston-super-Mare', 'Weston-super-Mare'],
  ['Wimborne Town FC U19 WTFC academy', 'alliance-e', 'Wimborne Town', null],
  ['Yeovil Town FC U19 19 College', 'alliance-e', 'Yeovil Town', 'Yeovil Town'],
  // Alliance F
  ['Boreham Wood U19 U19 Blues', 'alliance-f', 'Boreham Wood', 'Boreham Wood'],
  ['AFC Greenwich Borough U19 Div F', 'alliance-f', 'AFC Greenwich Borough', null],
  ['Sutton United FC U19 Sutton United U19 2', 'alliance-f', 'Sutton United', 'Sutton United'],
  ['Chatham Town Youth U19 YA Athletic', 'alliance-f', 'Chatham Town', null],
  ['Carshalton Athletic FC U19 Carshalton At', 'alliance-f', 'Carshalton Athletic', null],
  ['Dorking Wanderers FC U19 NL Alliance Div', 'alliance-f', 'Dorking Wanderers', 'Dorking Wanderers'],
  ['Eastleigh FC U19 Blues', 'alliance-f', 'Eastleigh', 'Eastleigh'],
  ['Bromley FC U19 Bromley FC Academy 1.1', 'alliance-f', 'Bromley', null],
  ['Metropolitan Police FC (Surrey) U19 Firs', 'alliance-f', 'Metropolitan Police', null],
  ['Dartford FC U19 Academy Reds', 'alliance-f', 'Dartford', null],
  ['Woking (Youth & Academy) U19 2nd Years N', 'alliance-f', 'Woking', 'Woking'],
  // Alliance G
  ['Tamworth U19', 'alliance-g', 'Tamworth', 'Tamworth'],
  ['Boldmere St Michaels U19', 'alliance-g', 'Boldmere St Michaels', null],
  ['Racing Club Warwick U19', 'alliance-g', 'Racing Club Warwick', null],
  ['Stourbridge U19 Academy', 'alliance-g', 'Stourbridge', null],
  ['Stratford Town U19 Academy', 'alliance-g', 'Stratford Town', null],
  ['Ilkeston Town Juniors U19 Town', 'alliance-g', 'Ilkeston Town', null],
  ['Rugby Town U19 National League', 'alliance-g', 'Rugby Town', null],
  ['Boston United FC U19 Regional Division', 'alliance-g', 'Boston United', 'Boston United'],
  ['Solihull Moors U19 NLA Regional', 'alliance-g', 'Solihull Moors', 'Solihull Moors'],
  ['Alvechurch Foundation U19 FE', 'alliance-g', 'Alvechurch', null],
  ['Redditch United U19 Academy', 'alliance-g', 'Redditch United', null],
  ['Hednesford Town U19 Development', 'alliance-g', 'Hednesford Town', 'Hednesford Town'],
  // Alliance H
  ['Gateshead FC U19 I Division', 'alliance-h', 'Gateshead', 'Gateshead'],
  ['Pontefract Collieries U19', 'alliance-h', 'Pontefract Collieries', null],
  ['Guiseley AFC U19', 'alliance-h', 'Guiseley', null],
  ['South Shields U19 Div I', 'alliance-h', 'South Shields', 'South Shields'],
  ['Blyth Spartans AFC U19 Under 19', 'alliance-h', 'Blyth Spartans', null],
  ['Blyth Town U19 Blyth Town', 'alliance-h', 'Blyth Town', null],
  ['Harrogate Town FC U19', 'alliance-h', 'Harrogate Town', 'Harrogate Town'],
  ['Hartlepool United FC U19 Hartlepool Unit', 'alliance-h', 'Hartlepool United', 'Hartlepool United'],
  ['Heaton Stannington Juniors U19 Heaton St', 'alliance-h', 'Heaton Stannington', null],
  ['Darlington FC U19 s', 'alliance-h', 'Darlington', 'Darlington'],
  // Alliance I
  ['Chesterfield FC U19 NLYA', 'alliance-i', 'Chesterfield', null],
  ['Marine FC U19 Marine Academy', 'alliance-i', 'Marine', 'Marine'],
  ['Chorley FC U19 BTEC', 'alliance-i', 'Chorley', 'Chorley'],
  ['Alfreton Town FC U19 (NL U19)', 'alliance-i', 'Alfreton Town', 'Alfreton Town'],
  ['Buxton FC U19 Academy', 'alliance-i', 'Buxton', 'Buxton'],
  ['Oldham Athletic FC U19', 'alliance-i', 'Oldham Athletic', null],
  ['Rochdale AFC U19 Rochdale AFC U19', 'alliance-i', 'Rochdale', 'Rochdale'],
  ['Stockport County FC U19 Football Educati', 'alliance-i', 'Stockport County', null],
  ['FC Halifax Town U19 B', 'alliance-i', 'FC Halifax Town', 'FC Halifax Town'],
  ['AFC Fylde U19 AFC Fylde Whites', 'alliance-i', 'AFC Fylde', 'AFC Fylde'],
  ['FC United Of Manchester U19 FC United of', 'alliance-i', 'FC United of Manchester', null],
];

test('every pasted team name prints as the constitution has it', () => {
  const bad = [];
  for (const [raw, div, display] of CASES) {
    const r = resolve(raw, div);
    if (r.display !== display) bad.push(`${raw} → "${r.display}", expected "${display}"`);
  }
  assert.deepEqual(bad, []);
});

test('crest source: a roster record where one exists, else the printed name', () => {
  const rosterNames = new Set(meta.clubs.map((c) => c.name));
  const bad = [];
  for (const [raw, div, display, club] of CASES) {
    const r = resolve(raw, div);
    if (club && !rosterNames.has(club)) { bad.push(`${raw}: test expects roster club "${club}" which is not in clubs-meta`); continue; }
    if (r.club !== club) bad.push(`${raw} → crest from ${JSON.stringify(r.club)}, expected ${JSON.stringify(club)}`);
    if (r.name !== (club || display)) bad.push(`${raw} → crest file "${r.name}", expected "${club || display}"`);
  }
  assert.deepEqual(bad, []);
});

test('a name resolves without a division too, from the whole constitution', () => {
  assert.equal(resolve('Hollands And Blair U19').display, 'Hollands & Blair');
  assert.equal(resolve('Kings Lynn Town FC U19 Academy').display, "King's Lynn Town");
});

test('whole-word match: Chester never claims Chesterfield', () => {
  assert.equal(resolve('Chesterfield FC U19 NLYA', 'alliance-i').display, 'Chesterfield');
  assert.equal(resolve('Chester FC U19 Scholars', 'alliance-i').display, 'Chester');
});

test('a side nobody lists is cleaned, not dropped', () => {
  assert.equal(resolve('Sporting Khalsa FC U19 Academy Whites').display, 'Sporting Khalsa');
  assert.equal(resolve('AFC Telford United Youth U19').display, 'AFC Telford United');
});

test('empty and junk input do not throw', () => {
  const e = resolve('');   /* built inside the VM, so its prototype differs — compare fields, not identity */
  assert.equal(e.club, null); assert.equal(e.name, ''); assert.equal(e.display, '');
  assert.equal(resolve('U19').club, null);
});

/* ---- paste shapes (added 10/09/2026, both pastes as Richard copied them off Full-Time) ---- */
/* rows are built inside the VM, so compare by value, not prototype */
const parseFixtures = (t) => JSON.parse(JSON.stringify(window.TOOL.parseFixtures(t)));

test('a fixtures table copied off Full-Time: pair either side of VS, date heading, postponed dropped', () => {
  const paste = [
    'Type\tDate / Time\tHome Team\t\tAway Team\tVenue\tCompetition\tStatus / Notes',
    'NOR\t02/09/26 13:00\tChester FC U19 Scholars\t\tVS\t\tGateshead FC U19 Academy North\tKING GEORGE V SPORTS HUB\tNLFA North Division\tPostponed',
    'NOR\t23/09/26 14:00\tAFC Fylde U19 National League North\t\tVS\t\tGateshead FC U19 Academy North\tMILL FARM SPORTS VILLAGE\tNLFA North Division\t',
    'NOR\t23/09/26 14:00\tChester FC U19 Scholars\t\tVS\t\tHarrogate Town FC U19 Academy\tKING GEORGE V SPORTS HUB\tNLFA North Division\t',
  ].join('\n');
  const rows = parseFixtures(paste);
  assert.equal(rows.length, 2, 'header and the postponed row are dropped; one date so no heading');
  assert.deepEqual(rows[0], { home: 'AFC Fylde U19 National League North', away: 'Gateshead FC U19 Academy North', hs: '', as: '', ko: '14:00' });
  assert.equal(rows[1].away, 'Harrogate Town FC U19 Academy');
});

test('results copied off Full-Time come one field per line: fold on the score, heading per day', () => {
  const paste = `Type

Date / Time

Home Team

Away Team

Competition

NOR

09/09/26 14:00
Morecambe FC U19 Morecambe FC U19
2 - 9
AFC Fylde U19 National League North
NLFA North Division

NOR

09/09/26 13:30
Hednesford Town U19
0 - 1
Hartlepool United FC U19 Hartlepool Unit
NLFA North Division

NOR

02/09/26 14:00
AFC Fylde U19 National League North
2 - 3
Southport FC U19 Academy
NLFA North Division
`;
  const rows = parseFixtures(paste);
  assert.equal(rows.length, 5, 'two day headings plus three matches');
  assert.match(rows[0].divider, /^WED 9 SEPT?$/);   /* en-GB short month is "Sept" in Node and Chromium alike */
  assert.deepEqual(rows[1], { home: 'Morecambe FC U19 Morecambe FC U19', away: 'AFC Fylde U19 National League North', hs: '2', as: '9', ko: '14:00' });
  assert.equal(rows[2].hs, '0'); assert.equal(rows[2].as, '1');
  assert.match(rows[3].divider, /^WED 2 SEPT?$/);
  assert.equal(rows[4].away, 'Southport FC U19 Academy');
});

test('a table copied off the Full-Time table page: overall columns, not home', () => {
  const parseTable = (t) => JSON.parse(JSON.stringify(window.TOOL.parseTable(t)));
  const paste = [
    '\t\t\tHome\t\t\t\t\tAway\t\t\t\t\tOverall\t\t\t\t\t\t',
    'Pos\tTeam\tP\tW\tD\tL\tF\tA\tW\tD\tL\tF\tA\tW\tD\tL\tF\tA\tGD\tPTS',
    '1\tFC Halifax Town U19\t2\t1\t0\t0\t5\t0\t1\t0\t0\t3\t1\t2\t0\t0\t8\t1\t7\t6',
    '6\tHartlepool United FC U19 Hartlepool Unit\t2\t0\t1\t0\t2\t2\t1\t0\t0\t1\t0\t1\t1\t0\t3\t2\t1\t3 *',
  ].join('\n');
  const rows = parseTable(paste);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { team: 'FC Halifax Town U19', label: '', adj: false, p: '2', pts: '6', gd: '7', w: '2', d: '0', l: '0', f: '8', a: '1' });
  assert.equal(rows[1].adj, true);
  assert.equal(rows[1].w, '1'); assert.equal(rows[1].d, '1');
  const ten = parseTable('1\tFC Halifax Town U19\t2\t2\t0\t0\t8\t1\t7\t6');
  assert.deepEqual([ten[0].w, ten[0].d, ten[0].l, ten[0].f, ten[0].a], ['2', '0', '0', '8', '1']);
});

test('the plain shapes still parse: "Home v Away", "Home 2-1 Away", a lone line is a heading', () => {
  const rows = parseFixtures('SAT 13 SEP\nHorsham v Southend United\nChester 2-1 Gateshead');
  assert.equal(rows[0].divider, 'SAT 13 SEP');
  assert.deepEqual(rows[1], { home: 'Horsham', away: 'Southend United', hs: '', as: '', ko: '' });
  assert.deepEqual(rows[2], { home: 'Chester', away: 'Gateshead', hs: '2', as: '1', ko: '' });
});
