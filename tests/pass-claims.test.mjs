/* passClaims — a Club card puts its club on the account (functions/pass-claims.js).

   The pure half is lifted from the shipped source and run alone, the way
   tests/club-code.test.mjs does (firebase-functions is not installed at the
   repo root). The trigger and setCustomUserClaims are Firebase's; the claim
   NAMES are this repo's own, set to match what functions/club-code.js mints
   for a code holder, and the test checks the two files agree on them. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const SRC = readFileSync(join(REPO, 'functions/pass-claims.js'), 'utf8');
function lift(names) {
  const bodies = names.map((name) => {
    const i = SRC.indexOf('function ' + name + '(');
    assert.ok(i >= 0, 'pass-claims.js no longer defines ' + name);
    let depth = 0, j = SRC.indexOf('{', i);
    for (; j < SRC.length; j++) {
      if (SRC[j] === '{') depth++;
      else if (SRC[j] === '}' && --depth === 0) { j++; break; }
    }
    return SRC.slice(i, j);
  });
  const consts = SRC.match(/const CLUB_CLAIMS = \[[^\]]*\];/)[0];
  return eval('(function(){' + consts + bodies.join('\n') + '\nreturn {' + names.join(',') + '};})()');
}
const { clubKeyFor, nextClaims, sameClaims } = lift(['clubKeyFor', 'nextClaims', 'sameClaims']);

const CLUBS = { fgr: { name: 'Forest Green Rovers' }, wok: { name: 'Woking' }, gone: { name: 'Old Club', revoked: true } };
const clubPass = (club) => ({ base: 'club', club, issued: 1 });

test('a Club card gets the claims a code holder of that club gets', () => {
  assert.deepEqual(nextClaims({}, clubPass('Forest Green Rovers'), CLUBS),
    { club: 'fgr', clubName: 'Forest Green Rovers', pClub: 'fgr', pClubName: 'Forest Green Rovers' });
});

test('the club is matched by name, ignoring case and stray spaces', () => {
  assert.equal(clubKeyFor('  woking ', CLUBS), 'wok');
  assert.equal(clubKeyFor('', CLUBS), null);
  assert.equal(clubKeyFor('Nowhere FC', CLUBS), null);
});

test('a League card, no pass, an unissued pass or an unknown club gets no club claims', () => {
  const had = { club: 'fgr', clubName: 'x', pClub: 'fgr', pClubName: 'x' };
  assert.deepEqual(nextClaims(had, { base: 'league', issued: 1 }, CLUBS), {});
  assert.deepEqual(nextClaims(had, null, CLUBS), {});
  assert.deepEqual(nextClaims(had, { base: 'club', club: 'Woking' }, CLUBS), {});
  assert.deepEqual(nextClaims(had, clubPass('Nowhere FC'), CLUBS), {});
});

test('other claims on the account are left alone', () => {
  const out = nextClaims({ dir: 'editor', club: 'old' }, clubPass('Woking'), CLUBS);
  assert.equal(out.dir, 'editor');
  assert.equal(out.club, 'wok');
});

test('a League card can never come out with a club', () => {
  for (const base of ['league', undefined, 'external']) {
    assert.ok(!('club' in nextClaims({}, { base, club: 'Woking', issued: 1 }, CLUBS)), String(base));
  }
});

test('sameClaims spots any difference', () => {
  assert.ok(sameClaims({ a: 1 }, { a: 1 }));
  assert.ok(!sameClaims({ a: 1 }, { a: 2 }));
  assert.ok(!sameClaims({ a: 1 }, {}));
});

test('the claim names match what the club code door mints', () => {
  const cc = readFileSync(join(REPO, 'functions/club-code.js'), 'utf8');
  for (const name of ['club', 'clubName', 'pClub', 'pClubName']) {
    assert.ok(new RegExp('\\b' + name + ':').test(cc), 'club-code.js mints ' + name);
  }
});

test('Programme Packs: a Club card writes only with Manage there', () => {
  assert.equal(nextClaims({}, clubPass('Woking'), CLUBS, true).pManage, true);
  assert.ok(!('pManage' in nextClaims({}, clubPass('Woking'), CLUBS, false)));
  /* Manage gone from the pass: the write claim goes with it. */
  assert.ok(!('pManage' in nextClaims({ pClub: 'wok', pManage: true }, clubPass('Woking'), CLUBS, false)));
  /* No club key, no write, whatever the pass says. */
  assert.ok(!('pManage' in nextClaims({}, clubPass('Nowhere FC'), CLUBS, true)));
});

test('a club code always mints Programme Packs writes (codes keep Manage)', () => {
  const pp = readFileSync(join(REPO, 'functions/programme.js'), 'utf8');
  assert.match(pp, /const c = \{ pClub: hit\.key, club: hit\.key, pManage: true \};/);
  const cc = readFileSync(join(REPO, 'functions/club-code.js'), 'utf8');
  assert.match(cc, /pManage: true/);
});

/* ---- The League mark (14/11/2026) ---------------------------------------
   The file rules ask for `league: true`; only the server sets it, from the
   door's own answer (NL.accountLevel.isLeague). */
import { NL as CANON } from './load-canon.mjs';
const L = lift(['withLeague', 'isLeagueAccount']);

test('the League mark goes on League accounts only', () => {
  const yes = [
    { role: 'staff', pass: { base: 'league', issued: 1 } },
    { role: 'admin' },                                   // no pass, League role
    { role: 'superadmin' }
  ];
  const no = [
    { role: 'club-admin', club: 'Woking' },
    { role: 'staff', pass: { base: 'club', club: 'Woking', issued: 1 } }, // a Club card, whatever the old role
    { role: 'pending', pending: true },
    { role: 'staff', pending: true },                    // waiting, whatever the role says
    { role: 'admin', rejected: true },
    null
  ];
  for (const u of yes) assert.equal(L.isLeagueAccount(CANON, u), true, JSON.stringify(u));
  for (const u of no) assert.equal(L.isLeagueAccount(CANON, u), false, JSON.stringify(u));
});

test('the mark is added or taken off, and nothing else moves', () => {
  assert.deepEqual(L.withLeague({ club: 'wok' }, false), { club: 'wok' });
  assert.deepEqual(L.withLeague({ league: true, dir: 'x' }, false), { dir: 'x' });
  assert.deepEqual(L.withLeague({}, true), { league: true });
});

test('the file rules ask for the mark by the name the server sets', () => {
  const rules = readFileSync(join(REPO, 'system/storage/rules.snapshot.rules'), 'utf8');
  assert.match(SRC, /out\.league = true/);
  assert.ok(rules.includes("request.auth.token.get('league', false) == true"));
  const live = rules.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/token\.email != null/.test(live), 'a file rule still treats an email address as League');
});
