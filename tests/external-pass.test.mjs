/* External passes and club views (nl-utils v1.69; permissions plan,
   "External passes" and "Club views"). The organisation and its zones are
   made up here; the registry is the real snapshot. Two halves: what an
   External card opens, and that Club and League cards open exactly what
   they did. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NL, REPO } from './load-canon.mjs';

const P = NL.pass;
const REG = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));
const NOW = Date.UTC(2026, 10, 16, 12);
const FB = 'ops-financial-benchmarking';
const plain = (v) => JSON.parse(JSON.stringify(v));

const ORG = {
  name: 'Made-up Regulator',
  zones: {
    fin: { name: 'Finance', code: 'FIN', tools: {
      [FB]: { level: 'access', view: 'all', reason: 'Already receives these figures', by: 'u0', at: 1 },
      'ops-club-codes': { level: 'access', reason: 'should never open', by: 'u0', at: 1 },
      'ops-people': { level: 'manage', view: 'all', reason: 'should never open', by: 'u0', at: 1 },
    } },
    later: { name: 'Later', code: 'LAT', tools: { [FB]: { level: 'manage', view: 'all', reason: 'x', by: 'u0', at: 1 } } },
  },
};
const pass = (keys) => ({ base: 'external', org: 'made-up', issued: 1, keys });

test('an External pass is issued only with an organisation', () => {
  assert.equal(P.isIssued({ base: 'external' }), false);
  assert.equal(P.isIssued(pass({})), true);
  assert.equal(P.isExternal(pass({})), true);
  assert.equal(P.isExternal({ base: 'league' }), false);
});

test('extFor: only tools that offer externals, through a view they offer', () => {
  const ext = plain(P.extFor(pass({ fin: { given: 1 } }), ORG, REG, NOW));
  assert.deepEqual(Object.keys(ext), [FB], 'Club Codes (sensitive, no view) and Access (no externals) stay shut');
  assert.deepEqual(ext[FB], { level: 'access', zones: ['fin'], view: 'all' });
});

test('extFor: Manage only where the tool offers it to externals', () => {
  const ext = P.extFor(pass({ later: { given: 1 } }), ORG, REG, NOW);
  assert.equal(ext[FB].level, 'access');
  const offering = Object.assign({}, REG, { [FB]: Object.assign({}, REG[FB], { externals: { views: ['all'], manage: true } }) });
  assert.equal(P.extFor(pass({ later: { given: 1 } }), ORG, offering, NOW)[FB].level, 'manage');
});

test('extFor: a view the tool does not offer gives nothing', () => {
  const one = { zones: { z: { tools: { [FB]: { level: 'access', view: 'one', club: 'ALD' } } } } };
  assert.deepEqual(plain(P.extFor(pass({ z: { given: 1 } }), one, REG, NOW)), {});
  const offersOne = Object.assign({}, REG, { [FB]: Object.assign({}, REG[FB], { externals: { views: ['one'] } }) });
  assert.deepEqual(plain(P.extFor(pass({ z: { given: 1 } }), one, offersOne, NOW)[FB]), { level: 'access', zones: ['z'], view: 'one', club: 'ALD' });
  const noClub = { zones: { z: { tools: { [FB]: { level: 'access', view: 'one' } } } } };
  assert.deepEqual(plain(P.extFor(pass({ z: { given: 1 } }), noClub, offersOne, NOW)), {}, 'One club with no club named');
});

test('extFor: end dates. Ended zones count for nothing; no end date wins', () => {
  assert.deepEqual(plain(P.extFor(pass({ fin: { given: 1, until: NOW - 1 } }), ORG, REG, NOW)), {});
  assert.equal(P.extFor(pass({ fin: { given: 1, until: NOW + 99 } }), ORG, REG, NOW)[FB].until, NOW + 99);
  const both = P.extFor(pass({ fin: { given: 1, until: NOW + 99 }, later: { given: 1 } }), ORG, REG, NOW)[FB];
  assert.equal(both.until, undefined, 'one zone with no end date: the tool has none');
  assert.deepEqual(plain(both.zones), ['fin', 'later']);
});

test('explain: an External card opens what pass.ext holds, at its view, and nothing else', () => {
  const p = pass({ fin: { given: 1 } });
  p.ext = P.extFor(p, ORG, REG, NOW);
  const ex = P.explain(p, REG[FB], NOW, FB);
  assert.equal(ex.level, 'access');
  assert.equal(ex.view, 'all');
  assert.equal(ex.openedBy, 'key');
  assert.equal(P.explain(p, REG[FB], NOW).level, 'off', 'no key, no lookup');
  assert.equal(P.explain(p, Object.assign({ key: FB }, REG[FB]), NOW).level, 'access', 'the key on the record');
  Object.keys(REG).filter((k) => k !== FB).forEach((k) => {
    assert.equal(P.explain(p, REG[k], NOW, k).level, 'off', k);
  });
});

test('explain: a forged pass.ext opens nothing the tool does not offer', () => {
  const p = pass({ fin: { given: 1 } });
  p.ext = { 'ops-club-codes': { level: 'manage', zones: ['fin'] }, 'ops-people': { level: 'manage', view: 'all', zones: ['fin'] },
    [FB]: { level: 'manage', view: 'all', zones: ['fin'] } };
  assert.equal(P.explain(p, REG['ops-club-codes'], NOW, 'ops-club-codes').level, 'off');
  assert.equal(P.explain(p, REG['ops-people'], NOW, 'ops-people').level, 'off');
  assert.equal(P.explain(p, REG[FB], NOW, FB).level, 'access', 'Manage capped: not offered to externals');
  p.ext[FB].until = NOW - 1;
  assert.equal(P.explain(p, REG[FB], NOW, FB).reason, 'ended');
});

test('explain: the Skeleton key never works on an External card', () => {
  const p = pass({});
  p.skeleton = { given: 1 };
  assert.equal(P.explain(p, REG['ops-people'], NOW, 'ops-people').level, 'off');
});

test('toOld: an External card gets entries only for what it opens, League-only tools included', () => {
  const p = pass({ fin: { given: 1 } });
  p.ext = P.extFor(p, ORG, REG, NOW);
  const old = plain(P.toOld(p, REG, 'external', NOW));
  const set = Object.keys(old).filter((k) => old[k] !== null);
  assert.deepEqual(set, [FB]);
  assert.equal(old[FB], 'access');
});

test('the issue form refuses an External pass, either way round', () => {
  assert.throws(() => P.build({ base: 'external' }, 'u', NOW));
  assert.throws(() => P.build({ base: 'league' }, 'u', NOW, pass({})));
});

test('club views: a Club card sees One club, a League card All clubs, named', () => {
  const club = { base: 'club', club: 'Aldershot Town', issued: 1, keys: { 'club-finance': { given: 1 } } };
  const league = { base: 'league', issued: 1, keys: { 'league-finance': { given: 1 } } };
  P.CLUB_LOGINS = true;
  try {
    assert.equal(P.explain(club, REG[FB], NOW, FB).view, 'one');
    assert.equal(P.explain(league, REG[FB], NOW, FB).view, 'all');
    assert.equal(P.explain(league, REG['ops-newsletter'] || REG['media-newsletter'] || {}, NOW).view, undefined);
  } finally { P.CLUB_LOGINS = false; }
});

/* The other half. A tool's key, now passed to explain, changes nothing for
   a Club or League card: the answer with it and without it is the same,
   for every tool, every key and every role. */
test('Club and League cards: the key passed to explain changes nothing', () => {
  const clubKeys = ['club-operations', 'club-media', 'club-commercial', 'club-finance'];
  const leagueKeys = ['league-operations', 'league-media', 'league-finance', 'league-tester'];
  const cards = [];
  clubKeys.forEach((k) => cards.push({ base: 'club', club: 'Aldershot Town', issued: 1, keys: { [k]: { given: 1 } } }));
  cards.push({ base: 'club', club: 'Aldershot Town', issued: 1 });
  leagueKeys.forEach((k) => cards.push({ base: 'league', issued: 1, keys: { [k]: { given: 1 } } }));
  cards.push({ base: 'league', issued: 1, skeleton: { given: 1 } });
  cards.forEach((c) => Object.keys(REG).forEach((k) => {
    assert.deepEqual(plain(P.explain(c, REG[k], NOW, k)), plain(P.explain(c, REG[k], NOW)), k);
    ['club-admin', 'club-staff', 'staff', 'admin'].forEach((role) => {
      const u = { role, pass: c, tools: {} };
      assert.equal(NL.accountLevel.from(u, REG[k], k), NL.accountLevel.from(u, REG[k]), k + ' ' + role);
    });
  }));
});

test('an External card is never a League account', () => {
  assert.equal(NL.accountLevel.isLeague({ role: 'external', pass: pass({}) }), false);
});
