/**
 * NL Cup LIVE embed — the parts that decide what a fan sees, and that no
 * amount of looking at the widget in a browser on a non-matchday can check.
 *
 * Two of these guard real traps rather than hypothetical ones:
 *
 *  - NLS calls three of the sixteen academy sides "…U21" while
 *    cup-clubs-meta.json calls every one of them "…PL2". An exact-name lookup
 *    silently loses their crest and their colours, and on a matchday that is
 *    three blank cards nobody can fix in time.
 *  - "Today" is the UK day, not the UTC day. Under BST the two disagree for
 *    every kick-off after 23:00, which is exactly when a widget that has
 *    quietly dropped a tie is least likely to be noticed.
 *
 * Functions are pulled out of the BUILT bundle, so an edit to the HTML that
 * never reaches embeds/nl-cup-live.js fails here too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'embeds/nl-cup-live.js'), 'utf8');

const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const clubsMeta = read('assets/data/clubs-meta.json');
const cupMeta   = read('assets/data/cup-clubs-meta.json');
const compsMeta = read('assets/data/competitions-meta.json');
const linksMeta = read('assets/data/nl-cup-links.json');

function extract(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced ' + name);
}

/* The suffix pattern comes out of the bundle too — it is the whole fix, and a
   copy of it here would pass while the shipped one was broken. */
const SUFFIX_DECL = src.match(/var SUFFIX = \/.*?\/i;/);
assert.ok(SUFFIX_DECL, 'SUFFIX regex is present in the bundle');
const ARM_DECL = src.match(/var ARM_MS\s+= [^;]+;/);
assert.ok(ARM_DECL, 'ARM_MS is present in the bundle');
const WINDOW_DECL = src.match(/var LIVE_WINDOW_MS = [^;]+;/);
assert.ok(WINDOW_DECL, 'LIVE_WINDOW_MS is present in the bundle');

const W = new Function(
  "var TZ = 'Europe/London'; var byKey = {};\n" + SUFFIX_DECL[0] + '\n' + ARM_DECL[0] + '\n' + WINDOW_DECL[0] + '\n' +
  ['baseName', 'suffixOf', 'normKey', 'periodState', 'parseKO', 'fmt', 'ukYmd', 'ukTime',
   'utcYmd', 'ukNextYmd', 'apiWindow', 'pickDay', 'open',
   'isHex', 'lum', 'accentFor', 'indexClubs', 'clubFor', 'shortFor', 'linkable',
   'stateFor', 'watchable'].map(extract).join('\n') +
  '\n return { baseName, suffixOf, normKey, periodState, parseKO, ukYmd, ukTime,' +
  ' ukNextYmd, apiWindow, pickDay, open,' +
  ' lum, accentFor, indexClubs, clubFor, shortFor, linkable, stateFor, watchable, ARM_MS,' +
  ' LIVE_WINDOW_MS, byKey };'
)();

W.indexClubs(clubsMeta, false);
W.indexClubs(cupMeta, true);

/* Season the widget is actually serving. */
const SEASON = clubsMeta.seasons.current;
const cup = compsMeta.competitions.find(c => c.competition === 'NL Cup');
const entrants = cup.entrants[SEASON];

const memberByCode = Object.fromEntries(clubsMeta.clubs.map(c => [c.code, c]));
const guestByCode  = Object.fromEntries(cupMeta.clubs.map(c => [c.code, c]));

/* ---------- academy-side name resolution ---------- */

test('the U21/PL2 disagreement between NLS and cup-clubs-meta collapses', () => {
  assert.equal(W.normKey('Birmingham City U21'), W.normKey('Birmingham City PL2'));
  assert.equal(W.normKey('Norwich City U21'),    W.normKey('Norwich City PL2'));
  assert.equal(W.normKey('Ipswich Town U21'),    W.normKey('Ipswich Town PL2'));
  assert.equal(W.baseName('Wolverhampton Wanderers PL2'), 'Wolverhampton Wanderers');
  assert.equal(W.baseName('Everton U23'), 'Everton');
});

test('a tile calls a side what the broadcast calls them', () => {
  /* The repo's short + the suffix NLS actually used, so the rail agrees with
     the coverage rather than with the file it read the crest from. */
  assert.equal(W.shortFor('Birmingham City U21'), 'Birmingham U21');
  assert.equal(W.shortFor('Birmingham City PL2'), 'Birmingham PL2');
  assert.equal(W.shortFor('Middlesbrough PL2'), 'Boro PL2');
  assert.equal(W.shortFor('Wolverhampton Wanderers PL2'), 'Wolves PL2');
  /* Member clubs carry no suffix and keep their own short. */
  assert.equal(W.shortFor('FC Halifax Town'), 'Halifax');
  assert.equal(W.shortFor('Hartlepool United'), 'Hartlepool');
  /* A side nobody has heard of still gets a name, not an empty tile. */
  assert.equal(W.shortFor('Some New Club U21'), 'Some New Club U21');
});

test('a member club name is never mistaken for a suffixed one', () => {
  /* "Boreham Wood" ends in a word, not a suffix — nothing may be trimmed. */
  for (const c of clubsMeta.clubs) assert.equal(W.baseName(c.name), c.name, c.name);
});

test('every side in this season\'s cup resolves to a crest file that exists', () => {
  const names = [
    ...(entrants.members || []).map(code => {
      const c = memberByCode[code];
      assert.ok(c, `clubs-meta has ${code}`);
      return c.name;
    }),
    /* Both spellings, because NLS uses one and the repo the other. */
    ...(entrants.guests || []).flatMap(code => {
      const c = guestByCode[code];
      assert.ok(c, `cup-clubs-meta has ${code}`);
      return [c.name, c.crestName + ' U21'];
    })
  ];

  for (const name of names) {
    const club = W.clubFor(name);
    for (const tier of ['thumbs', 'medium']) {
      const file = path.join(ROOT, 'assets/crests', tier, club.crestName + '.png');
      assert.ok(fs.existsSync(file), `${name} -> assets/crests/${tier}/${club.crestName}.png`);
    }
  }
});

test('a club resolves to usable colours, never a white-on-white card', () => {
  for (const code of entrants.members || []) {
    const club = W.clubFor(memberByCode[code].name);
    const accent = W.accentFor(club.colors || {});
    assert.match(accent, /^#[0-9a-fA-F]{6}$/, code);
    assert.notEqual(accent.toLowerCase(), '#ffffff', `${code} accent is not white`);
  }
});

/* ---------- the UK day ---------- */

test('today is the UK day, so BST late kick-offs land on the right card', () => {
  /* 22:30Z in August is 23:30 in Sheffield — still that evening's card. */
  assert.equal(W.ukYmd(W.parseKO('2026-08-18 22:30:00')), '2026-08-18');
  assert.equal(W.ukTime(W.parseKO('2026-08-18 22:30:00')), '23:30');
  /* 23:30Z is 00:30 the next morning — the following day's card, which is why
     the API window is widened a day either side before filtering. */
  assert.equal(W.ukYmd(W.parseKO('2026-08-18 23:30:00')), '2026-08-19');
  /* Midwinter, no offset. */
  assert.equal(W.ukYmd(W.parseKO('2026-12-16 19:45:00')), '2026-12-16');
  assert.equal(W.ukTime(W.parseKO('2026-12-16 19:45:00')), '19:45');
});

test('an NLS date without a T is read as UTC, not as local time', () => {
  assert.equal(W.parseKO('2026-08-18 18:00:00').toISOString(), '2026-08-18T18:00:00.000Z');
  assert.equal(W.parseKO(''), null);
  assert.equal(W.parseKO('nonsense'), null);
});

/* ---------- match state ---------- */

test('every NLS matchPeriod maps to a state the card can draw', () => {
  const expect = {
    PreMatch: 'pre', FirstHalf: 'live', HalfTime: 'live', SecondHalf: 'live',
    ExtraTime: 'live', Penalties: 'live',
    FullTime: 'ft', PostMatch: 'ft',
    Postponed: 'postponed', Abandoned: 'abandoned'
  };
  for (const [period, state] of Object.entries(expect)) {
    assert.equal(W.periodState(period), state, period);
    assert.equal(W.periodState(period.toLowerCase()), state, period + ' lowercased');
  }
  assert.equal(W.periodState(null), 'pre');
  assert.equal(W.periodState('SomethingNew'), 'pre');
});

/* ---------- the link map ---------- */

test('every club in nl-cup-links.json is a host in this season\'s cup', () => {
  const hosts = new Set((entrants.members || []).map(code => memberByCode[code].name));
  for (const name of Object.keys(linksMeta.links)) {
    assert.ok(hosts.has(name), `${name} is a ${SEASON} cup entrant`);
  }
});

test('every host in this season\'s cup has a slot in the link map', () => {
  for (const code of entrants.members || []) {
    const name = memberByCode[code].name;
    assert.ok(name in linksMeta.links, `${name} has a link slot`);
  }
});

/* ---------- live when the feed has not noticed ---------- */

test('a tie whose kick-off has passed reads as live even if NLS says PreMatch', () => {
  /* The real first tie of 2026-27: Hartlepool v Middlesbrough sat at
     "PreMatch" while the same feed carried goals at 5' and 8'. */
  const ko = W.parseKO('2026-08-11 14:00:00');
  const at = mins => ko.getTime() + mins * 60000;

  assert.equal(W.stateFor('PreMatch', ko, at(-5)), 'pre',  'five minutes out');
  assert.equal(W.stateFor('PreMatch', ko, at(12)), 'live', 'twelve minutes in');
  assert.equal(W.stateFor('PreMatch', ko, at(80)), 'live', 'second half');
});

test('the clock never overrides a feed that does know', () => {
  const ko = W.parseKO('2026-08-11 14:00:00');
  const at = mins => ko.getTime() + mins * 60000;
  assert.equal(W.stateFor('FullTime', ko, at(100)), 'ft');
  assert.equal(W.stateFor('Postponed', ko, at(100)), 'postponed');
  assert.equal(W.stateFor('SecondHalf', ko, at(-200)), 'live');
});

test('an unreported tie stops claiming to be live, and counts as finished', () => {
  /* A feed that never said SecondHalf cannot be trusted to say FullTime. Past
     the window the match has finished whatever the feed thinks — and calling
     it finished is what lets the band pack up instead of being held open all
     night by one tie nobody ever closed. */
  const ko = W.parseKO('2026-08-11 14:00:00');
  assert.equal(W.LIVE_WINDOW_MS, 140 * 60000);
  assert.equal(W.stateFor('PreMatch', ko, ko.getTime() + 139 * 60000), 'live');
  assert.equal(W.stateFor('PreMatch', ko, ko.getTime() + 141 * 60000), 'ft');
});

/* ---------- when the band packs up ---------- */

test('only a tie still to come or under way keeps the band open', () => {
  assert.equal(W.watchable({ state: 'pre' }), true);
  assert.equal(W.watchable({ state: 'live' }), true);
  assert.equal(W.watchable({ state: 'ft' }), false);
  assert.equal(W.watchable({ state: 'postponed' }), false);
  assert.equal(W.watchable({ state: 'abandoned' }), false);
});

test('a finished card leaves nothing behind', () => {
  /* 11/08/2026: one tie, Hartlepool 0-10 Middlesbrough, full time by 16:40.
     A front page does not want that sitting where its CTA was. */
  const day = [{ state: 'ft' }];
  assert.equal(day.some(W.watchable), false, 'the whole card is done');

  /* An evening round behind an afternoon kick-off keeps it open, though. */
  const mixed = [{ state: 'ft' }, { state: 'postponed' }, { state: 'pre' }];
  assert.equal(mixed.some(W.watchable), true, 'later ties still to come');
});

/* ---------- the eve preview (MD-1) ---------- */

test('the UK day rolls over by calendar, not by adding 24 hours', () => {
  assert.equal(W.ukNextYmd('2026-08-17'), '2026-08-18');
  assert.equal(W.ukNextYmd('2026-08-31'), '2026-09-01');
  assert.equal(W.ukNextYmd('2026-12-31'), '2027-01-01');
  /* The 25-hour night the clocks go back: midnight plus 24 hours is still
     Sunday, but the day after Sunday is Monday. */
  assert.equal(W.ukNextYmd('2026-10-25'), '2026-10-26');
});

test("the API window reaches tomorrow evening from MD-1 midnight", () => {
  /* Monday 00:30 BST is Sunday 23:30 UTC — a +1 day window ends on Monday's
     UTC day and misses every Tuesday kick-off, which is the whole preview. */
  const win = W.apiWindow(new Date('2026-08-16T23:30:00Z'));
  assert.equal(win.from, '2026-08-15 00:00:00Z');
  assert.equal(win.to,   '2026-08-18 23:59:59Z');
});

test("today's card holds the band; tomorrow's takes it only when today is done", () => {
  const at = (ko, state) => ({ ko: W.parseKO(ko), state });
  const mon = '2026-08-17', tue = '2026-08-18';
  const tueTies = [at('2026-08-18 18:00:00', 'pre'), at('2026-08-18 18:45:00', 'pre')];

  /* MD-1: nothing today, so tomorrow's round previews. */
  assert.deepEqual(W.pickDay(tueTies, mon, tue), tueTies);
  /* MD with a split round: today's ties only — tomorrow waits its turn. */
  const monLive = [at('2026-08-17 18:00:00', 'live')];
  assert.deepEqual(W.pickDay(monLive.concat(tueTies), mon, tue), monLive);
  /* Today all finished: the band hands over to tomorrow's night. */
  const monDone = [at('2026-08-17 14:00:00', 'ft')];
  assert.deepEqual(W.pickDay(monDone.concat(tueTies), mon, tue), tueTies);
  /* Nothing either day: nothing to pick, so the band stays away. */
  assert.deepEqual(W.pickDay(monDone, mon, tue), []);
});

test('the "Watch from" stream time waits for the day itself', () => {
  /* On the eve card "Watch from 18:45" would read as tonight. */
  const ko = W.parseKO('2026-08-18 18:00:00');
  const links = {};
  links[W.normKey('Hartlepool United')] = 'https://www.thenationalleague.org.uk/live/x';
  const tie = { ko, home: 'Hartlepool United', state: 'pre' };
  const eve = ko.getTime() - 20 * 3600000;   /* Monday 23:00 UK */
  const day = ko.getTime() - 5 * 3600000;    /* Tuesday 14:00 UK */

  assert.equal(W.open(tie, links, eve).from, '', 'no stream time on the eve');
  assert.equal(W.open(tie, links, eve).url, '', 'and no link either');
  assert.equal(W.open(tie, links, day).from, '18:45', 'stream time on the day');
});

/* ---------- when a tile becomes a link ---------- */

test('a tile is not a link until 15 minutes before kick-off', () => {
  const ko = W.parseKO('2026-08-18 18:00:00');
  const tie = { ko, state: 'pre' };
  const at = mins => ko.getTime() + mins * 60000;

  assert.equal(W.ARM_MS, 15 * 60000);
  assert.equal(W.linkable(tie, at(-120)), false, 'two hours out');
  assert.equal(W.linkable(tie, at(-16)),  false, 'sixteen minutes out');
  assert.equal(W.linkable(tie, at(-15)),  true,  'on the mark');
  assert.equal(W.linkable(tie, at(-14)),  true,  'fourteen minutes out');
  assert.equal(W.linkable(tie, at(30)),   true,  'in play');
});

test('a tie in play or finished is a link whatever the clock says', () => {
  /* A late kick-off, or a fixture time NLS never corrected, must not leave a
     tie that is visibly underway without a way to watch it. The same page
     carries the replay afterwards. */
  const ko = W.parseKO('2026-08-18 18:00:00');
  const early = ko.getTime() - 60 * 60000;
  assert.equal(W.linkable({ ko, state: 'live' }, early), true);
  assert.equal(W.linkable({ ko, state: 'ft' }, early), true);
});

test('an off tie is never a link, however close to kick-off', () => {
  const ko = W.parseKO('2026-08-18 18:00:00');
  const at = ko.getTime() - 60000;
  assert.equal(W.linkable({ ko, state: 'postponed' }, at), false);
  assert.equal(W.linkable({ ko, state: 'abandoned' }, at), false);
});

/* ---------- link hygiene ---------- */

test('every link points at www, never beta', () => {
  /* beta.thenationalleague.org.uk is where these URLs get copied from, and a
     fan sent there lands on a staging host. The stream id is the same on
     both, so only the host is ever wrong. */
  for (const [club, url] of Object.entries(linksMeta.links)) {
    if (!url) continue;
    assert.ok(!/\bbeta\./i.test(url), `${club} link is not on beta: ${url}`);
    /* Whole shape, not just the host: these arrive pasted, and a stream id
       that lost its last few characters looks completely fine in the JSON and
       404s the one time anybody follows it. */
    assert.match(url,
      /^https:\/\/www\.thenationalleague\.org\.uk\/live\/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/,
      `${club} link is a full www /live/<uuid> URL: ${url}`);
  }
});

test('no two clubs share a stream page', () => {
  /* Copying the row above and changing only the club name is the obvious way
     to fill this file in, and it sends one club's fans to another's game. */
  const seen = new Map();
  for (const [club, url] of Object.entries(linksMeta.links)) {
    if (!url) continue;
    assert.ok(!seen.has(url), `${club} has its own stream, not ${seen.get(url)}'s`);
    seen.set(url, club);
  }
});

test('a link is matched to a host by the same key the crest is', () => {
  /* The widget keys the map through normKey, so punctuation and case in the
     JSON cannot quietly cost a club its Watch button. */
  const keyed = {};
  for (const [name, url] of Object.entries(linksMeta.links)) keyed[W.normKey(name)] = url;
  assert.ok('fchalifaxtown' in keyed);
  assert.equal(W.normKey('FC Halifax Town'), W.normKey('fc halifax town'));
});
