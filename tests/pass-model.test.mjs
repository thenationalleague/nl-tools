/* The pass model — NL.pass, and the grants in the registry snapshot.

   system/permissions-plan.md decided how a level is worked out from a card,
   keys and a tool's grants. NL.pass is the one copy of that rule. Today it
   only DISPLAYS (My pass, View as, the "who can open this" panel); from step 6
   it decides who gets in. So these tests are written for the day it decides:
   every branch of the rule, the fail-closed cases, and the grants Richard
   agreed on 12/11/2026 read back through the resolver, tool by tool. A wrong
   'manage' here becomes, at step 6, someone editing 72 clubs' data.

   No stubs of anything outside this repo: the resolver is pure, and the
   registry it reads is the snapshot in system/rtdb/. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NL, REPO } from './load-canon.mjs';
import { convert } from '../scripts/permissions-import.mjs';

const P = NL.pass;
/* NL lives in a VM sandbox, so its arrays and objects have that realm's
   prototypes and deepEqual calls them different. Compare plain copies. */
const plain = (v) => JSON.parse(JSON.stringify(v));
const REGISTRY = JSON.parse(readFileSync(join(REPO, 'system/rtdb/tools-registry.snapshot.json'), 'utf8'));
const NOW = Date.UTC(2026, 10, 12, 12);
const DAY = 86400000;

const k = (...ids) => Object.fromEntries(ids.map((id) => [id, { given: NOW - DAY, by: 'u-a' }]));
const league = (...keys) => ({ base: 'league', keys: k(...keys) });
const club = (name, ...keys) => ({ base: 'club', club: name, keys: k(...keys) });
const level = (pass, key) => P.level(pass, REGISTRY[key], NOW);

/* A made-up tool of the ordinary shape, for the branches the real grid does
   not happen to exercise. */
const tool = (perm) => ({ label: 'Test', permissions: {
  for: 'both', shelf: 'main', clubData: 'none', sensitive: false, levels: ['off', 'access', 'manage'],
  grants: { base: { league: 'access', club: 'off' }, key: { 'league-operations': 'manage', 'club-media': 'access' } },
  ...perm,
} });

test('no pass, or a club card with no club, opens nothing', () => {
  for (const p of [null, undefined, {}, { base: 'club' }, { base: 'external' }]) {
    const ex = P.explain(p, tool(), NOW);
    assert.equal(ex.level, 'off');
    assert.equal(ex.reason, 'no-pass');
  }
});

test('the Skeleton key opens every tool at Manage, Structure and Sandbox included', () => {
  const sk = { base: 'league', skeleton: { given: NOW, by: 'x' } };
  for (const key of Object.keys(REGISTRY)) assert.equal(level(sk, key), 'manage', key);
  assert.equal(P.explain(sk, tool({ shelf: 'structural' }), NOW).openedBy, 'skeleton');
});

test('a tool with no permissions on its record opens for nobody but the Skeleton key', () => {
  assert.equal(P.level(league('league-operations'), { label: 'x' }, NOW), 'off');
  assert.equal(P.explain(league(), { label: 'x' }, NOW).reason, 'no-record');
});

test('Structure is closed to everyone else, whatever the grants say', () => {
  const t = tool({ shelf: 'structural', grants: { base: { league: 'manage', club: 'manage' }, key: {} } });
  assert.equal(P.level(league('league-tester'), t, NOW), 'off');
  for (const key of ['ops-data', 'ops-estate', 'ops-nls-monitor', 'staff-style-guide', 'media-responsibilities']) {
    assert.equal(REGISTRY[key].permissions.shelf, 'structural', `${key} is on the Structure shelf (rule 3)`);
    assert.equal(level(league('league-operations', 'league-media', 'league-senior', 'league-tester'), key), 'off', key);
  }
});

test('Sandbox is closed unless you hold Tester, and then it is at least Access', () => {
  const t = tool({ shelf: 'sandbox', grants: { base: { league: 'off', club: 'off' }, key: { 'league-media': 'manage' } } });
  assert.equal(P.level(league('league-media'), t, NOW), 'off', 'the launch grant does not count before launch');
  assert.equal(P.level(league('league-tester'), t, NOW), 'access', 'Tester alone: Access');
  assert.equal(P.level(league('league-tester', 'league-media'), t, NOW), 'manage', 'Tester: the launch level when higher');
  assert.ok(P.explain(league('league-tester'), t, NOW).parts.some((x) => x.id === 'league-tester'));
  const withCard = tool({ shelf: 'sandbox' });
  assert.equal(P.explain(league('league-tester'), withCard, NOW).openedBy, 'key', 'Tester opened it, not the card');
});

test('Matchday Live is in Sandbox with no testers', () => {
  assert.equal(REGISTRY['media-matchday-live'].permissions.testers, false);
  assert.equal(level(league('league-tester', 'league-media'), 'media-matchday-live'), 'off');
});

test('a League-only tool never opens for a Club card, whatever the club grants say', () => {
  const t = tool({ for: 'league', grants: { base: { league: 'access', club: 'manage' }, key: { 'club-operations': 'manage' } } });
  const ex = P.explain(club('Forest Green Rovers', 'club-operations'), t, NOW);
  assert.equal(ex.level, 'off');
  assert.equal(ex.reason, 'league-only');
});

test('otherwise the highest of the card grant and each held key', () => {
  const ex = P.explain(league('league-operations'), tool(), NOW);
  assert.equal(ex.level, 'manage');
  assert.equal(ex.openedBy, 'key');
  assert.deepEqual(plain(ex.parts), [{ id: 'card', level: 'access' }, { id: 'league-operations', level: 'manage' }]);
  const card = P.explain(league('league-finance'), tool(), NOW);
  assert.equal(card.level, 'access');
  assert.equal(card.openedBy, 'card', 'a key that adds nothing does not take the credit');
});

test('a level is capped at the highest the tool offers', () => {
  const t = tool({ levels: ['off', 'access'] });
  assert.equal(P.level(league('league-operations'), t, NOW), 'access');
});

test('a key from the other side of the pass counts for nothing', () => {
  const t = tool({ grants: { base: { league: 'off', club: 'off' }, key: { 'league-media': 'manage', 'club-media': 'manage' } } });
  assert.equal(P.level({ base: 'club', club: 'Woking', keys: k('league-media') }, t, NOW), 'off');
  assert.equal(P.level({ base: 'league', keys: k('club-media') }, t, NOW), 'off');
  assert.equal(P.level(club('Woking', 'club-media'), t, NOW), 'manage');
});

test('a key past its end date is gone; one with a date still to come still counts', () => {
  const t = tool();
  const ended = { base: 'league', keys: { 'league-operations': { given: NOW - 9 * DAY, by: 'x', until: NOW - 1 } } };
  const running = { base: 'league', keys: { 'league-operations': { given: NOW - 9 * DAY, by: 'x', until: NOW + DAY } } };
  assert.equal(P.level(ended, t, NOW), 'access');
  assert.equal(P.level(running, t, NOW), 'manage');
  assert.deepEqual(plain(P.keysHeld(ended, NOW)), []);
});

test('unknown level words and unknown keys fail closed', () => {
  const t = tool({ grants: { base: { league: 'admin', club: 'yes' }, key: { 'league-made-up': 'manage' } } });
  assert.equal(P.level({ base: 'league', keys: k('league-made-up') }, t, NOW), 'off');
});

/* ---- the grid agreed on 12/11/2026, read back through the resolver ---- */

test('every registry record carries permissions in the shape the resolver reads', () => {
  for (const [key, rec] of Object.entries(REGISTRY)) {
    const p = rec.permissions;
    assert.ok(p, `${key} has no permissions`);
    assert.ok(['league', 'both'].includes(p.for), key);
    assert.ok(['main', 'sandbox', 'structural'].includes(p.shelf), key);
    assert.ok(['none', 'all', 'own', 'bench'].includes(p.clubData), key);
    for (const id of Object.keys((p.grants && p.grants.key) || {})) {
      assert.ok(P.KEY[id], `${key}: unknown key ${id}`);
      assert.ok(!id.includes('.'), `${key}: ${id} has a dot, which Firebase refuses`);
    }
  }
});

test('the new grants sit beside the old access fields, not over them', () => {
  /* levels / shelf / audience / defaults keep today's meanings until step 9:
     auth-guard and the portal read them. */
  assert.deepEqual(REGISTRY['ops-attendance'].levels, ['off', 'access']);
  assert.equal(REGISTRY['ops-attendance'].defaults.staff, 'access');
  assert.equal(REGISTRY['media-programme'].shelf, 'club');
  assert.equal(REGISTRY['ops-fan-widgets'].shelf, 'website');
});

test('rule 1: the League card opens anything for looking at; making tools belong to their team', () => {
  const card = league();
  for (const key of ['ops-attendance', 'ops-club-directory', 'ops-handbook', 'ops-judgements', 'ops-vacancies',
    'ops-document-library', 'ops-club-kits', 'ops-fixture-management', 'media-content-plan', 'media-dazn',
    'staff-travel-planner', 'staff-website-archive', 'media-programme']) {
    assert.equal(level(card, key), 'access', key);
  }
  for (const key of ['staff-graphics', 'ops-fan-widgets', 'staff-newsletter']) {
    assert.equal(level(card, key), 'off', `${key} is for making things`);
    assert.notEqual(level(league('league-media'), key), 'off', `${key} belongs to Media`);
  }
});

test('rule 2: sensitive tools are keys-only; clubs only ever read benchmarking', () => {
  for (const key of ['ops-club-codes', 'ops-commercial-benchmarking', 'ops-financial-benchmarking', 'media-responsibilities']) {
    assert.equal(REGISTRY[key].permissions.sensitive, true, `${key} is sensitive`);
    assert.equal(level(league(), key), 'off', `${key}: not on the League card`);
    assert.equal(level(club('Woking'), key), 'off', `${key}: not on the Club card`);
  }
  for (const key of ['ops-commercial-benchmarking', 'ops-financial-benchmarking']) {
    const everyClubKey = club('Woking', 'club-operations', 'club-media', 'club-commercial', 'club-finance');
    assert.notEqual(level(everyClubKey, key), 'manage', `${key}: clubs never manage`);
  }
  assert.equal(level(league('league-finance'), 'ops-financial-benchmarking'), 'manage');
});

test('rule 4: Club Codes – League Operations manage, nobody else opens it', () => {
  assert.equal(level(league('league-operations'), 'ops-club-codes'), 'access',
    'Manage is granted but not yet in the code (plan: tools needing Manage added) – capped');
  assert.equal(REGISTRY['ops-club-codes'].permissions.grants.key['league-operations'], 'manage');
  for (const id of ['league-media', 'league-commercial', 'league-finance', 'league-senior']) {
    assert.equal(level(league(id), 'ops-club-codes'), 'off', id);
  }
});

test('rule 5: Newsletter – Media manage, everyone else off', () => {
  assert.equal(REGISTRY['staff-newsletter'].permissions.grants.key['league-media'], 'manage');
  assert.equal(level(league('league-operations', 'league-commercial', 'league-finance', 'league-senior'), 'staff-newsletter'), 'off');
});

test('Website Archive offers Access only', () => {
  assert.deepEqual(REGISTRY['staff-website-archive'].permissions.levels, ['off', 'access']);
});

test('the club secretary opens what the board will be shown', () => {
  const sec = club('Forest Green Rovers', 'club-operations');
  assert.equal(level(sec, 'ops-club-directory'), 'manage');
  assert.equal(level(sec, 'ops-vacancies'), 'manage');
  assert.equal(level(sec, 'ops-handbook'), 'access');
  assert.equal(level(sec, 'ops-club-codes'), 'off');
  const names = plain(P.summary(sec, REGISTRY, NOW).map((x) => x.label));
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), 'A–Z');
  assert.ok(!names.includes('Club Codes'));
});

/* ---- the import, the panel, the form, the footer, the colours ---- */

test('the import turns the prototype\'s dotted keys into Firebase-safe ones and refuses the unknown', () => {
  const { out, problems } = convert({ tools: { 'ops-x': {
    for: 'both', shelf: 'main', clubData: 'all', levels: ['off', 'access', 'manage'],
    grants: { base: { league: 'access', club: 'off' }, key: { 'club.operations': 'manage', 'league.media': 'off' } },
  } } });
  assert.deepEqual(problems, []);
  assert.deepEqual(out['ops-x'].grants.key, { 'club-operations': 'manage' }, 'off grants are not stored');
  const bad = convert({ tools: { 'ops-y': { for: 'everyone', shelf: 'main', clubData: 'all', levels: ['off', 'access'],
    grants: { base: {}, key: { 'league.boss': 'manage' } } } } });
  assert.equal(bad.problems.length, 2);
});

test('who can open this is worked out from the grants, capped, and hides the club side of a League tool', () => {
  const w = P.whoCanOpen(REGISTRY['ops-club-kits']);
  assert.deepEqual(plain(w.rows).map((r) => [r.id, r.level]), [['league', 'access'], ['league-operations', 'access']]);
  assert.equal(w.rows[1].granted, 'manage', 'the agreed Manage is kept for the panel to mention');
  assert.equal(P.whoCanOpen({ label: 'x' }), null);
  const both = P.whoCanOpen(REGISTRY['ops-club-directory']);
  assert.ok(both.rows.some((r) => r.id === 'club-operations' && r.level === 'manage'));
});

test('issuing a pass keeps when a key was first given, and drops what does not belong', () => {
  const first = P.build({ base: 'league', jobTitle: '  Head of Operations ', keys: ['league-operations'] }, 'u-a', NOW);
  assert.equal(first.jobTitle, 'Head of Operations');
  const later = P.build({ base: 'league', jobTitle: 'Head of Operations', keys: ['league-operations', 'league-media', 'club-media', 'nope'], skeleton: true },
    'u-b', NOW + DAY, first);
  assert.deepEqual(plain(later.keys['league-operations']), { given: NOW, by: 'u-a' });
  assert.deepEqual(plain(later.keys['league-media']), { given: NOW + DAY, by: 'u-b' });
  assert.equal(Object.keys(later.keys).length, 2);
  assert.equal(later.issued, NOW);
  assert.ok(later.skeleton);
  const clubPass = P.build({ base: 'club', club: 'Woking', keys: ['club-operations'], skeleton: true }, 'u-b', NOW, later);
  assert.equal(clubPass.skeleton, undefined, 'the Skeleton key goes on a League card only');
  assert.equal(clubPass.keys['club-operations'].given, NOW, 'a move to the other side starts the keys afresh');
});

test('only the Skeleton key issues passes; Tester or Skeleton can View as', () => {
  assert.equal(P.canIssue(league('league-operations')), false);
  assert.equal(P.canIssue({ base: 'league', skeleton: { given: 1 } }), true);
  assert.equal(P.canViewAs(league('league-tester'), NOW), true);
  assert.equal(P.canViewAs(league('league-media'), NOW), false);
});

test('the pass footer date reads like the design: 12 NOV 2026', () => {
  assert.equal(P.issuedLabel(NOW), '12 NOV 2026');
  assert.equal(P.issuedLabel(undefined), '');
});

test('club colours: the pair is kept where it reads, swapped off near-white, never invisible', () => {
  const META = JSON.parse(readFileSync(join(REPO, 'assets/data/clubs-meta.json'), 'utf8'));
  const byName = (n) => META.clubs.find((c) => c.name === n);
  const fgr = P.clubColours(byName('Forest Green Rovers'));
  if (fgr) assert.ok(P.contrast(fgr.band, fgr.bandText) >= 4.5);
  for (const c of META.clubs.filter((x) => x.division)) {
    const col = P.clubColours(c);
    if (!col) continue;
    assert.ok(P.contrast(col.band, '#ffffff') >= 1.5, `${c.name}: band is not near-white`);
    assert.ok(P.contrast(col.sticker, '#ffffff') >= 1.5, `${c.name}: sticker is not near-white`);
    assert.ok(P.contrast(col.band, col.bandText) >= 4.5 || P.contrast(col.band, col.bandText) >= 3.5,
      `${c.name}: band type reads (${P.contrast(col.band, col.bandText).toFixed(2)}:1)`);
    assert.ok(P.contrast(col.sticker, col.stickerText) >= 3.5, `${c.name}: sticker type reads`);
  }
  assert.equal(P.clubColours({ colors: { primary: '#FFFFFF', secondary: '#FEFEFE' } }), null);
});
