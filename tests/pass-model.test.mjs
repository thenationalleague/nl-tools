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
/* The grants Richard agreed for Club cards apply from club logins (step 7).
   Tests of those grants run with the switch on; tests of today run as is. */
const afterClubLogins = (fn) => () => {
  P.CLUB_LOGINS = true;
  try { fn(); } finally { P.CLUB_LOGINS = false; }
};

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

test('a key from the other side of the pass counts for nothing', afterClubLogins(() => {
  const t = tool({ grants: { base: { league: 'off', club: 'off' }, key: { 'league-media': 'manage', 'club-media': 'manage' } } });
  assert.equal(P.level({ base: 'club', club: 'Woking', keys: k('league-media') }, t, NOW), 'off');
  assert.equal(P.level({ base: 'league', keys: k('club-media') }, t, NOW), 'off');
  assert.equal(P.level(club('Woking', 'club-media'), t, NOW), 'manage');
}));

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
  /* ops-fan-widgets' shelf: 'website' went on 13/11/2026 (Sandbox now). */
});

test('rule 1: the League card opens anything for looking at; making tools belong to their team', () => {
  const card = league();
  for (const key of ['ops-attendance', 'ops-club-directory', 'ops-handbook', 'ops-judgements', 'ops-vacancies',
    'ops-document-library', 'ops-club-kits', 'ops-fixture-management', 'media-content-plan', 'media-dazn',
    'staff-travel-planner', 'staff-website-archive', 'media-programme']) {
    assert.equal(level(card, key), 'access', key);
  }
  /* Fan Widgets left this list for Sandbox on 13/11/2026. */
  for (const key of ['staff-graphics', 'staff-newsletter']) {
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

test('the club secretary opens what the board will be shown (from club logins)', afterClubLogins(() => {
  const sec = club('Forest Green Rovers', 'club-operations');
  assert.equal(level(sec, 'ops-club-directory'), 'manage');
  assert.equal(level(sec, 'ops-vacancies'), 'manage');
  assert.equal(level(sec, 'ops-handbook'), 'access');
  assert.equal(level(sec, 'ops-club-codes'), 'off');
  const names = plain(P.summary(sec, REGISTRY, NOW).map((x) => x.label));
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), 'A–Z');
  assert.ok(!names.includes('Club Codes'));
}));

/* ── Until club logins: a Club card is held to the club role ─────────────
   Found 12/11/2026, signing in as a club dummy after the switch: the pass
   sent a club account to DAZN Viewership, Programme Packs, Document Library,
   Financial Benchmarking (League staff consoles — "not available") and the
   Club Directory editor (opened, then refused by the database). */
test('a Club card reaches a staff page only where the club role always could; a club page by its grants', () => {
  const fgr = club('Forest Green Rovers', 'club-commercial', 'club-finance');
  /* No club page yet: held to the club role. */
  assert.equal(level(fgr, 'ops-handbook'), 'access', 'Handbook: the club role\'s own level, no more');
  /* A club page (clubUrl): the agreed grants, met there by club login.
     Programme Packs joined 13/11/2026 (the library's Club card door). */
  for (const key of ['media-dazn', 'ops-document-library', 'ops-financial-benchmarking', 'ops-club-directory', 'media-programme']) {
    assert.ok(REGISTRY[key].clubUrl, key + ' has a club page');
    assert.equal(level(fgr, key), 'access', key);
  }
  for (const [role, pass] of [['club-staff', fgr], ['club-admin', club('Woking', 'club-operations', 'club-media')]]) {
    for (const [key, rec] of Object.entries(REGISTRY)) {
      if (rec.placeholder || key === 'welcome' || rec.clubUrl) continue;
      const today = P.todayLevel({ role, tools: {} }, { key, ...rec });
      assert.ok(P.rank(P.level(pass, rec, NOW)) <= P.rank(today), `${role} ${key}: above the role`);
    }
  }
});

test('the ceiling comes off at club logins', afterClubLogins(() => {
  assert.equal(level(club('Forest Green Rovers', 'club-finance'), 'ops-financial-benchmarking'), 'access');
}));

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

test('a key end date is set, kept with the key, and cleared when the form clears it', () => {
  const first = P.build({ base: 'league', keys: ['league-media'], until: { 'league-media': NOW + 7 * DAY } }, 'u-a', NOW);
  assert.equal(first.keys['league-media'].until, NOW + 7 * DAY);
  assert.equal(P.level(first, tool({ grants: { base: { league: 'off', club: 'off' }, key: { 'league-media': 'access' } } }), NOW + 8 * DAY), 'off', 'gone after the date');
  const cleared = P.build({ base: 'league', keys: ['league-media'] }, 'u-b', NOW + DAY, first);
  assert.equal(cleared.keys['league-media'].until, undefined);
  assert.equal(cleared.keys['league-media'].by, 'u-a', 'clearing the date does not re-give the key');
});

test('who may give out what: Skeleton everything, League Operations club cards only', () => {
  assert.deepEqual(plain(P.issueRights({ base: 'league', skeleton: { given: 1 } }, NOW)), { league: true, club: true, skeleton: true });
  assert.deepEqual(plain(P.issueRights(league('league-operations'), NOW)), { league: false, club: true, skeleton: false });
  assert.deepEqual(plain(P.issueRights(league('league-media'), NOW)), { league: false, club: false, skeleton: false });
  assert.deepEqual(plain(P.issueRights(club('Woking', 'club-operations'), NOW)), { league: false, club: false, skeleton: false },
    'a club secretary\'s Operations key is not League Operations');
  assert.deepEqual(plain(P.issueRights(null, NOW)), { league: false, club: false, skeleton: false });
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

/* ---- the migration report: today against the pass ---- */

test('today\'s level mirrors auth-guard: superadmin, the League gate, then the resolver', () => {
  const rec = (k) => ({ key: k, ...REGISTRY[k] });
  assert.equal(P.todayLevel({ role: 'superadmin' }, rec('ops-estate')), 'manage');
  assert.equal(P.todayLevel({ role: 'club-admin', tools: { 'ops-club-kits': 'admin' } }, rec('ops-club-kits')), 'off',
    'a stray grant never opens a League tool to a club role');
  assert.equal(P.todayLevel({ role: 'staff' }, rec('ops-club-kits')), P.fromOld(REGISTRY['ops-club-kits'].defaults.staff));
  assert.equal(P.todayLevel({ role: 'staff', tools: { 'ops-club-kits': 'off' } }, rec('ops-club-kits')), 'off', 'an explicit off wins');
});

test('the report lists only differences, A–Z, and says which way each moves', () => {
  const user = { role: 'staff', pass: league('league-operations') };
  const rows = plain(P.compare(user, REGISTRY, NOW));
  assert.ok(rows.length > 0);
  assert.deepEqual(rows.map((r) => r.label), [...rows.map((r) => r.label)].sort((a, b) => a.localeCompare(b)));
  for (const r of rows) {
    assert.notEqual(r.today, r.pass);
    assert.ok(['opens', 'closes', 'up', 'down'].includes(r.change));
  }
  const codes = rows.find((r) => r.key === 'ops-club-codes');
  assert.ok(codes && codes.change === 'opens', 'League Operations gain Club Codes, which League Staff do not open today');
  const none = plain(P.compare({ role: 'superadmin', pass: { base: 'league', skeleton: { given: 1 } } }, REGISTRY, NOW));
  assert.deepEqual(none, [], 'superadmin today and the Skeleton key agree everywhere');
});


/* ── Step 6: the old entries follow the pass ─────────────────────────────
   NL.pass.toOld writes the users/<uid>/tools entries that make today's rule
   (todayLevel, the mirror of auth-guard's old path and of the generated
   database rules) give exactly what the pass gives. The property: after
   writing them, the migration report for that person is empty — on the
   real registry, for every card and role combination in use. */
const mirrored = (pass, role) => ({ role, pass, tools: plain(P.toOld(pass, REGISTRY, role, NOW)) });
const cases = [
  ['League staff, Operations', league('league-operations'), 'staff'],
  ['League admin, Finance only', league('league-finance'), 'admin'],
  ['League admin, Operations and Senior', league('league-operations', 'league-senior'), 'admin'],
  ['League staff, Media and Tester', league('league-media', 'league-tester'), 'staff'],
  ['League staff, no keys', league(), 'staff'],
  ['Club admin, Operations and Media', club('FC Halifax Town', 'club-operations', 'club-media'), 'club-admin'],
  ['Club admin, Commercial and Finance', club('Forest Green Rovers', 'club-commercial', 'club-finance'), 'club-admin'],
  ['Club staff, no keys', club('Woking'), 'club-staff'],
];
/* One boundary stays where it is until club logins (step 7): the audience
   gate. A club role never opens a League-audience tool — Document Library
   and Programme Packs serve clubs through their own code-entry pages, not
   the staff console — even where a Club card's grants would. auth-guard
   keeps the gate ahead of the pass, so those rows are the gate's, not
   drift, and are left out here. */
const gated = (role, key) => !['superadmin', 'admin', 'staff'].includes(role) &&
  ['league', 'staff', 'meta'].includes(REGISTRY[key].audience);
for (const [name, pass, role] of cases) {
  test(`toOld: ${name} — today's rule then matches the pass on every tool`, () => {
    const left = plain(P.compare(mirrored(pass, role), REGISTRY, NOW)).filter((r) => !gated(role, r.key));
    assert.deepEqual(left, []);
  });
}

test('toOld writes only differences: a pass that matches the role default writes nothing', () => {
  const t = plain(P.toOld(league('league-operations'), REGISTRY, 'staff', NOW));
  for (const [key, v] of Object.entries(t)) {
    if (v === null) continue;
    const today = P.todayLevel({ role: 'staff', tools: {} }, { key, ...REGISTRY[key] });
    assert.notEqual(P.fromOld(v), today, `${key} written though it equals the default`);
  }
});

test('toOld leaves a superadmin, and a club role on a League-only tool, alone', () => {
  assert.ok(Object.values(plain(P.toOld(league(), REGISTRY, 'superadmin', NOW))).every((v) => v === null));
  const c = plain(P.toOld(club('Woking', 'club-operations'), REGISTRY, 'club-admin', NOW));
  assert.equal(c['ops-people'], null);
  assert.ok(!('welcome' in c));
});

test('toOld says Manage in the old words', () => {
  const t = plain(P.toOld(league('league-operations'), REGISTRY, 'staff', NOW));
  assert.ok(Object.values(t).includes('admin'));
  assert.ok(!Object.values(t).includes('manage'));
});

/* ── Live grants (v1.56) ─────────────────────────────────────────────────
   Edited in Access and saved at access-grants/<toolKey>; they replace the
   registry's grants. cleanGrants is the guard on what gets saved. */
test('a live grant replaces the registry grant; the registry is untouched', () => {
  const rec = REGISTRY['staff-graphics'];
  const live = { base: { league: 'access', club: 'off' }, key: {} };
  assert.equal(level(league(), 'staff-graphics'), 'off');
  assert.equal(P.level(league(), P.withLive(rec, live), NOW), 'access');
  assert.equal(level(league(), 'staff-graphics'), 'off', 'registry unchanged');
});

test('switching a tool off: every grant Off, and only the Skeleton key opens it', () => {
  const off = { base: { league: 'off', club: 'off' }, key: {} };
  const rec = P.withLive(REGISTRY['ops-vacancies'], off);
  assert.equal(P.level(league('league-operations'), rec, NOW), 'off');
  assert.equal(P.level({ base: 'league', skeleton: { given: 1 }, issued: 1 }, rec, NOW), 'manage');
});

test('cleanGrants drops unknown keys and levels, so a typo cannot widen access', () => {
  const g = plain(P.cleanGrants({ base: { league: 'everything', club: 'access' }, key: { 'league-media': 'manage', 'made-up': 'manage', 'league-finance': 'admin' } }));
  assert.deepEqual(g, { base: { league: 'off', club: 'access' }, key: { 'league-media': 'manage' } });
});

test('withLiveAll applies only where there is a live entry', () => {
  const all = P.withLiveAll(REGISTRY, { 'staff-graphics': { base: { league: 'access', club: 'off' } } });
  assert.equal(P.level(league(), all['staff-graphics'], NOW), 'access');
  assert.deepEqual(plain(all['ops-vacancies']), plain(REGISTRY['ops-vacancies']));
});

/* v1.59: one set of shelves for the portal and Access. Each tool on exactly
   one, named the same on both pages. */
test('shelves: the portal order, and every tool on one shelf', () => {
  const P = NL.pass;
  assert.equal(P.SHELVES.map((s) => s.label).join(' | '), 'League Tools | Club Tools | Sandbox | Control');
  const ids = P.SHELVES.map((s) => s.id);
  for (const [key, rec] of Object.entries(REGISTRY)) {
    assert.ok(ids.includes(P.shelfOf(rec)), `${key} is on a shelf`);
    if (rec.permissions && rec.permissions.shelf === 'structural') assert.equal(P.shelfOf(rec), 'control', `${key}: Skeleton key tools are on Control`);
    if (rec.permissions && rec.permissions.shelf === 'sandbox') assert.equal(P.shelfOf(rec), 'sandbox', `${key}: Sandbox`);
  }
  assert.equal(P.shelfOf({ audience: 'league', status: 'wip', permissions: { shelf: 'main' } }), 'sandbox', 'not launched yet is Sandbox');
  assert.equal(P.shelfOf({ audience: 'league', clubUrl: '/x/', permissions: { shelf: 'main' } }), 'club', 'a club page makes it a club tool');
  assert.equal(P.shelfOf({ audience: 'league', shelf: 'website' }), 'league', 'no Website shelf since v1.60');
  assert.equal(P.shelfOf({ audience: 'league' }), 'league');
});

/* 13/11/2026 (Richard): a Sandbox tool carries the grants it will launch
   with, clubs included; Sandbox itself is the gate until then. */
test('Sandbox: launch grants are set, and nobody but testers gets in yet', () => {
  const want = [
    ['ops-brand-exposure', 'club-commercial', 'access'],
    ['media-local-media', 'club-media', 'manage'],
    ['media-matchday-live', 'club-media', 'manage'],
  ];
  for (const [key, k, lv] of want) {
    const p = REGISTRY[key].permissions;
    assert.equal(p.shelf, 'sandbox', `${key} is in Sandbox`);
    assert.equal(p.for, 'both', `${key} is built for clubs too`);
    assert.equal(p.grants.key[k], lv, `${key}: ${k} at ${lv} on launch`);
    assert.equal(level(club('Woking', k), key), 'off', `${key}: no club in before launch`);
    assert.equal(level(league('league-media', 'league-commercial'), key), 'off', `${key}: no League key either`);
  }
  assert.equal(REGISTRY['ops-fan-widgets'].permissions.shelf, 'sandbox', 'Fan Widgets waits in Sandbox');
  assert.equal(REGISTRY['ops-fixture-management'].status, undefined, 'Fixture Management is launched');
  assert.equal(P.shelfOf(REGISTRY['ops-fixture-management']), 'league');
});
