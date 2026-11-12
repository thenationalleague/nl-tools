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
  const consts = 'const CLUB_CLAIMS = ["club", "clubName", "pClub", "pClubName"];';
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
