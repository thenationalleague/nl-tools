/* Media Accreditation – the application's logic, and the rules that hold it.

   The public form at /accreditation/application/ is open to anyone, and what
   it collects includes minors' details and insurance documents. So the
   promises worth pinning are about what an anonymous session CANNOT do: read
   anything but the agreement, write an application for anyone but itself,
   skip the guardian or the club, or store a field nobody designed. The rules
   make those promises; tests/emulator/accreditation-rules.mjs runs them
   against a real database. This file holds their shape and the pure logic in
   accreditation/_shared.js, so an edit that opens a read or lets the two
   drift apart fails in npm test.

   No stubs of third parties: everything here reads files in this repo. All
   names and addresses below are placeholders. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { REPO } from './load-canon.mjs';
import { levelRule } from '../scripts/rtdb-level-rule.mjs';

const read = (p) => readFileSync(join(REPO, p), 'utf8');
const R = JSON.parse(read('system/rtdb/rules.snapshot.json')).rules['app-data']['media-accreditation'];
const REG = JSON.parse(read('system/rtdb/tools-registry.snapshot.json'))['media-accreditation'];
const STORAGE = read('system/storage/rules.snapshot.rules');
const PUB = read('accreditation/application/index.html');
const ADM = read('accreditation/admin/index.html');
const CLUB = read('accreditation/index.html');

const sandbox = {};
vm.runInNewContext(read('accreditation/_shared.js'), sandbox);
const AC = sandbox.AC;
/* Objects made inside the vm have the vm's prototypes, which deepEqual
   treats as different; a JSON round trip brings them home. */
const plain = (x) => JSON.parse(JSON.stringify(x));

const TODAY = '2026-11-01';
function app(over) {
  return Object.assign({
    person: { name: 'Alex Example', email: 'alex@example.invalid', phone: '01234 567890', address: '1 Example Road' },
    photo: 'pending',
    under18: false,
    orgType: 'freelance',
    insurance: { insurer: 'Example Insurance', policyNumber: 'P-1', limit: 5000000, start: '2026-08-01',
      expiry: '2027-07-31', namedInsured: 'Alex Example', inMyName: true, schedule: 'pending' },
    use: { channels: { website: true } },
    declarations: { refusedBefore: false, agree: true, accurate: true, dataConsent: true },
    signatureName: 'Alex Example'
  }, over || {});
}

/* ── season and reference ─────────────────────────────────────────────── */

test('the season key is the licence-number spelling of NL.season', () => {
  assert.equal(AC.seasonKey(2026), '2627');
  assert.equal(AC.seasonKey(2009), '0910');
  assert.equal(AC.seasonKey(2099), '9900');
  assert.equal(AC.seasonLabel('2627'), '2026–27');
  assert.match(AC.reference('2627', '-Nabcdefghijk123XYZ0'), /^A2627-[A-Z0-9_-]{6}$/);
});

/* ── routes and first status ──────────────────────────────────────────── */

test('the organisation type alone decides the route', () => {
  assert.equal(AC.routeFor('club'), 'club');
  for (const k of ['freelance', 'agency', 'outlet', 'other']) assert.equal(AC.routeFor(k), 'standard');
  assert.equal(AC.routeFor('nonsense'), null);
  assert.ok(AC.isTeam('agency') && AC.isTeam('outlet') && !AC.isTeam('freelance'));
});

test('an under-18 waits for a guardian; a club application waits for its club', () => {
  assert.equal(AC.initialStatus({ under18: true, route: 'club' }), 'awaiting-guardian');
  assert.equal(AC.initialStatus({ under18: false, route: 'club' }), 'awaiting-club');
  assert.equal(AC.initialStatus({ under18: false, route: 'standard' }), 'awaiting-staff');
});

/* ── validation ───────────────────────────────────────────────────────── */

test('a complete freelance application is valid', () => {
  assert.deepEqual(plain(AC.validate(app(), TODAY)), {});
});

test('acceptance 3: an under-18 cannot choose a non-club route', () => {
  const e = AC.validate(app({ under18: true, dob: '2010-05-05',
    guardian: { name: 'Sam Example', email: 'sam@example.invalid', relationship: 'Parent' } }), TODAY);
  assert.equal(e.orgType, 'Under-18s can only apply through their club.');
});

test('an under-18 on the club route needs no insurance, but does need a guardian', () => {
  const base = app({ under18: true, dob: '2010-05-05', orgType: 'club', club: 'Example Town', clubCode: 'EXT',
    paidOrVolunteer: 'volunteer', insurance: null });
  assert.deepEqual(Object.keys(AC.validate(base, TODAY)).sort(), ['guardianEmail', 'guardianName', 'guardianRelationship']);
  const ok = Object.assign({}, base, { guardian: { name: 'Sam Example', email: 'sam@example.invalid', relationship: 'Parent' } });
  assert.deepEqual(plain(AC.validate(ok, TODAY)), {});
});

test('a date of birth that makes someone 18 cannot sit beside "under 18"', () => {
  const e = AC.validate(app({ under18: true, orgType: 'club', club: 'X', clubCode: 'EXT', paidOrVolunteer: 'paid',
    dob: '2008-11-01', guardian: { name: 'S', email: 's@example.invalid', relationship: 'P' } }), TODAY);
  assert.ok(e.dob);
  const e2 = AC.validate(app({ under18: true, orgType: 'club', club: 'X', clubCode: 'EXT', paidOrVolunteer: 'paid',
    dob: '2008-11-02', guardian: { name: 'S', email: 's@example.invalid', relationship: 'P' } }), TODAY);
  assert.equal(e2.dob, undefined, 'a day short of 18 is under 18');
});

test('the guardian must have their own email', () => {
  const e = AC.validate(app({ under18: true, orgType: 'club', club: 'X', clubCode: 'EXT', paidOrVolunteer: 'paid',
    dob: '2010-01-01', guardian: { name: 'S', email: 'alex@example.invalid', relationship: 'P' } }), TODAY);
  assert.ok(e.guardianEmail);
});

test('a policy not in the applicant\'s name needs an explanation', () => {
  const e = AC.validate(app({ insurance: Object.assign({}, app().insurance, { inMyName: false }) }), TODAY);
  assert.ok(e.explanation);
});

test('an agency names at least one photographer, each with a photo', () => {
  const e = AC.validate(app({ orgType: 'agency', org: { name: 'Example Pics', holder: 'Alex Example' }, photographers: [] }), TODAY);
  assert.ok(e.photographers);
  const e2 = AC.validate(app({ orgType: 'agency', org: { name: 'Example Pics', holder: 'Alex Example' },
    photographers: [{ id: 'p1', name: 'Jo Example', photo: null }] }), TODAY);
  assert.ok(e2.photographer0Photo);
});

test('the signature must be the name given', () => {
  assert.ok(AC.validate(app({ signatureName: 'Someone Else' }), TODAY).signatureName);
  assert.equal(AC.validate(app({ signatureName: '  alex   example ' }), TODAY).signatureName, undefined);
});

test('money is read the ways people type it', () => {
  assert.equal(AC.parseMoney('£5,000,000'), 5000000);
  assert.equal(AC.parseMoney('2m'), 2000000);
  assert.equal(AC.parseMoney('2.5 million'), 2500000);
  assert.equal(AC.parseMoney('500k'), 500000);
  assert.equal(AC.parseMoney('lots'), null);
});

/* ── the record ───────────────────────────────────────────────────────── */

test('the record stores only what the route asked', () => {
  const ctx = { uid: 'u1', now: 1, agreementVersion: 3 };
  const club = plain(AC.record(app({ orgType: 'club', club: 'Example Town', clubCode: 'EXT', paidOrVolunteer: 'paid',
    dob: '2010-01-01', guardian: { name: 'x', email: 'x@example.invalid', relationship: 'x' } }), ctx));
  assert.equal(club.route, 'club');
  assert.equal(club.status, 'awaiting-club');
  assert.equal(club.insurance, undefined, 'a club route stores no insurance, whatever the form held');
  assert.equal(club.guardian, undefined, 'an adult stores no guardian');
  assert.equal(club.dob, undefined);
  assert.equal(club.signature.agreementVersion, 3);

  const free = plain(AC.record(app({ previousLicence: 'nl2526 014' }), ctx));
  assert.equal(free.status, 'awaiting-staff');
  assert.equal(free.club, undefined);
  assert.equal(free.previousLicence, 'NL2526014', 'cleaned to what the rules accept');
  assert.deepEqual(free.use.channels, { website: true });
  assert.equal(free.insurance.explanation, undefined);
});

/* ── checks (spec §6.1) ───────────────────────────────────────────────── */

const flags = (a, others) => Object.fromEntries(AC.checks(Object.assign({ id: 'me', route: AC.routeFor(a.orgType) }, a), TODAY, others || [])
  .map((c) => [c.key, c.flag]));

test('acceptance 1: a mismatched policy name is flagged', () => {
  assert.equal(flags(app()).policyName, false);
  assert.equal(flags(app({ insurance: Object.assign({}, app().insurance, { namedInsured: 'Somebody Else' }) })).policyName, true);
  assert.equal(flags(app({ insurance: Object.assign({}, app().insurance, { inMyName: false, explanation: 'x' }) })).policyName, true);
});

test('a policy in a trading name that contains the applicant matches', () => {
  assert.ok(AC._nameMatches('Alex Example Photography Ltd', ['Alex Example']));
  assert.ok(AC._nameMatches('Mr Alex Example', ['Alex Example']));
  assert.ok(AC._nameMatches('Example Pics Limited', ['Alex Example', 'Example Pics']));
  assert.ok(!AC._nameMatches('Example', ['Alex Example']), 'a surname alone is a flag');
});

test('cover under £2m and dates near expiry are flagged', () => {
  const ins = app().insurance;
  assert.equal(flags(app({ insurance: Object.assign({}, ins, { limit: 1000000 }) })).cover, true);
  assert.equal(flags(app({ insurance: Object.assign({}, ins, { limit: 2000000 }) })).cover, false);
  assert.equal(flags(app({ insurance: Object.assign({}, ins, { expiry: '2026-11-20' }) })).insDates, true);
  assert.equal(flags(app({ insurance: Object.assign({}, ins, { start: '2026-12-01' }) })).insDates, true);
  assert.equal(flags(app()).insDates, false);
});

test('duplicates by email, or by name and date of birth', () => {
  const others = [{ id: 'x1', person: { name: 'Other', email: 'alex@example.invalid' } }];
  assert.equal(flags(app(), others).duplicate, true);
  assert.equal(flags(app(), [{ id: 'me', person: app().person }]).duplicate, false, 'not a duplicate of itself');
  const kid = app({ dob: '2010-01-01' });
  assert.equal(flags(kid, [{ id: 'x2', dob: '2010-01-01', person: { name: 'alex  EXAMPLE', email: 'other@example.invalid' } }]).duplicate, true);
});

test('an under-18 is flagged until the guardian signs; a refusal is flagged', () => {
  const kid = { under18: true, orgType: 'club', route: 'club', person: app().person, declarations: { refusedBefore: true, refusedDetail: 'x' } };
  const f = Object.fromEntries(AC.checks(kid, TODAY, []).map((c) => [c.key, c.flag]));
  assert.equal(f.under18, true);
  assert.equal(f.refusal, true);
  assert.equal(f.policyName, undefined, 'no insurance checks on the club route');
});

/* ── the rules ────────────────────────────────────────────────────────── */

const MANAGE = levelRule('media-accreditation', 'admin') + " && root.child('users').child(auth.uid).child('role').exists()";
const A = R.applications.$season.$id;

test('the whole node is Manage, from the generated rule', () => {
  assert.equal(R['.read'], MANAGE);
  assert.equal(R['.write'], MANAGE);
});

test('nothing is world-readable, and anonymous sessions read only the agreement and their own limits', () => {
  const reads = [];
  (function walk(node, path) {
    for (const [k, v] of Object.entries(node)) {
      if (k === '.read') reads.push([path, v]);
      else if (v && typeof v === 'object') walk(v, path + '/' + k);
    }
  })(R, '');
  for (const [path, rule] of reads) {
    assert.notEqual(rule, true, path + ' is world-readable');
    if (rule === MANAGE) continue;
    assert.ok(['/config/agreements/$type', '/pace/$uid', '/quota/$uid'].includes(path), 'unexpected read at ' + path + ': ' + rule);
  }
});

test('an application is created once, by its own uid, against the current agreement, with pace and quota', () => {
  const w = A['.write'];
  for (const part of [
    '!data.exists()',
    "newData.child('uid').val() === auth.uid",
    "newData.child('createdAt').val() === now",
    "child('config').child('agreements').child(newData.child('type').val()).child('version').val()",
    "child('pace').child(auth.uid).val() === now",
    "child('quota').child(auth.uid).child('n')"
  ]) assert.ok(w.includes(part), 'application write is missing: ' + part);
});

test('acceptance 3, in the rules: an under-18 is club-route only and starts awaiting a guardian', () => {
  assert.ok(A['.validate'].includes("newData.child('under18').val() !== true || newData.child('route').val() === 'club'"));
  assert.ok(A['.write'].includes("newData.child('under18').val() === true ? newData.child('status').val() === 'awaiting-guardian'"));
  assert.ok(A.dob['.validate'].includes("newData.parent().child('under18').val() === true"));
  assert.ok(A.insurance['.validate'].includes("newData.parent().child('route').val() === 'standard'"));
});

test('the rules spell the same keys as _shared.js', () => {
  const vals = (rule) => [...rule.matchAll(/newData\.val\(\) === '([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(vals(A.orgType['.validate']), plain(AC.ORG_TYPES.map((o) => o.key)).sort());
  assert.deepEqual(vals(A.status['.validate']), plain(AC.STATUSES.map((s) => s.key)).sort());
  assert.deepEqual([...A.use.channels.$ch['.validate'].matchAll(/\$ch === '([^']+)'/g)].map((m) => m[1]).sort(),
    plain(AC.USES.map((u) => u.key)).sort());
  assert.deepEqual(vals(A.type['.validate']), plain(AC.TYPES.map((t) => t.key)).sort());
});

test('the rules cap every field where _shared.js does', () => {
  const cap = (rule) => Number((/length <= (\d+)/.exec(rule) || [])[1]);
  const M = AC.MAX;
  assert.equal(cap(A.person.name['.validate']), M.name);
  assert.equal(cap(A.person.email['.validate']), M.email);
  assert.equal(cap(A.person.phone['.validate']), M.phone);
  assert.equal(cap(A.person.address['.validate']), M.address);
  assert.equal(cap(A.guardian.relationship['.validate']), M.relationship);
  assert.equal(cap(A.org.name['.validate']), M.orgName);
  assert.equal(cap(A.insurance.insurer['.validate']), M.insurer);
  assert.equal(cap(A.insurance.policyNumber['.validate']), M.policyNumber);
  assert.equal(cap(A.insurance.namedInsured['.validate']), M.namedInsured);
  assert.equal(cap(A.insurance.explanation['.validate']), M.explanation);
  assert.equal(cap(A.use.otherText['.validate']), M.useOther);
  assert.equal(cap(A.use.clubsCovered['.validate']), M.clubsCovered);
  assert.equal(cap(A.declarations.refusedDetail['.validate']), M.refusedDetail);
  assert.equal(cap(R.config.agreements.$type.text['.validate']), M.agreementText);
  assert.match(A.previousLicence['.validate'], new RegExp('\\{1,' + M.previousLicence + '\\}'));
});

test('every level of the application refuses fields nobody designed', () => {
  for (const node of [A, A.person, A.guardian, A.org, A.photographers.$pid, A.insurance, A.use, A.declarations, A.signature,
    R.outbox.$id, R.quota.$uid]) {
    assert.deepEqual(node.$other, { '.validate': false });
  }
});

test('uploads must sit in the applicant\'s own folder for this application', () => {
  for (const r of [A.photo['.validate'], A.insurance.schedule['.validate'], A.photographers.$pid.photo['.validate']]) {
    assert.ok(r.includes("beginsWith('accreditation/' + $season + '/' + newData"), r);
    assert.ok(r.includes("child('uid').val() + '/' + $id + '/')"), r);
  }
});

test('an agreement version only ever goes up by one, and old versions are write-once', () => {
  assert.ok(R.config.agreements.$type['.validate'].includes("newData.child('version').val() === data.child('version').val() + 1"));
  assert.ok(R.config.agreementVersions.$type.$v['.validate'].includes('!data.exists()'));
});

test('the outbox takes only a "received" email, to the applicant, in the same write', () => {
  const w = R.outbox.$id['.write'];
  assert.ok(w.includes("newData.child('template').val() === 'received'"));
  assert.ok(w.includes("child('person').child('email').val()"));
  assert.ok(w.includes("child('uid').val() === auth.uid"));
  assert.ok(w.includes('!root.child('), 'the application must be new in this write');
});

test('pace is a minute and the quota five a day', () => {
  assert.match(R.pace.$uid['.validate'], /now - data\.val\(\) >= 60000/);
  assert.match(R.quota.$uid['.validate'], /<= 5\)/);
  assert.match(R.quota.$uid['.validate'], /86400000/);
});

/* ── Storage ──────────────────────────────────────────────────────────── */

test('Storage: create-only in the session\'s own folder, with the form\'s size and type limits', () => {
  const i = STORAGE.indexOf('match /accreditation/{season}/{uid}/{appId}/{file}');
  assert.ok(i > 0, 'no accreditation block');
  assert.ok(i < STORAGE.indexOf('match /{allPaths=**}'), 'the block must sit before the catch-all');
  const block = STORAGE.slice(i, STORAGE.indexOf('\n    }', i));
  assert.match(block, /request\.auth\.uid == uid/);
  assert.match(block, /resource == null/);
  assert.ok(!/allow (update|delete|write)/.test(block), 'nothing but create');
  assert.ok(block.includes('size < 5 * 1024 * 1024') && AC.PHOTO_MAX_BYTES === 5 * 1024 * 1024);
  assert.ok(block.includes('size < 10 * 1024 * 1024') && AC.DOC_MAX_BYTES === 10 * 1024 * 1024);
});

/* ── registry and pages ───────────────────────────────────────────────── */

test('the registry record: Manage for the console, clubs off until their page ships', () => {
  assert.ok(REG, 'no tools/media-accreditation record');
  assert.equal(REG.url, '/accreditation/');
  assert.ok(REG.levels.includes('admin'), 'the rules ask for Manage');
  assert.equal(REG.defaults.superadmin, 'admin');
  assert.equal(REG.defaults.admin, 'admin');
  assert.equal(REG.defaults['club-admin'], 'off');
  assert.equal(REG.defaults['club-staff'], 'off');
});

test('the public form is noindex, sends no referrer, and loads no auth-guard', () => {
  assert.match(PUB, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(PUB, /<meta name="referrer" content="no-referrer">/);
  assert.ok(!/src="\/system\/auth-guard\.js/.test(PUB));
  assert.ok(!/src="\/system\/nl-topbar\.js/.test(PUB));
});

test('the console tells a Use holder it needs Manage, and the club page sends staff on', () => {
  assert.match(ADM, /session\.toolLevel !== 'admin'/);
  assert.match(CLUB, /location\.replace\('\/accreditation\/admin\/'\)/);
});

test('the pages use the canon dialogs, never native ones', () => {
  for (const src of [PUB, ADM, CLUB]) {
    const code = src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/\b(window\.)?(alert|confirm|prompt)\(/.test(code.replace(/NL\.(alert|confirm|prompt)\(/g, '')));
  }
});
