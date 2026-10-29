/* Local Media – the public form, the press list, and the rules between them.

   The form at /local-media/ is open to anyone who has the link, and what it
   collects is other people's contact details. So the promises worth pinning
   are about what it CANNOT do: read anything back, change or delete a
   submission once sent, or store a field nobody designed. The rules make
   those promises; the emulator test (tests/emulator/local-media-rules.mjs)
   runs them against a real database. This file holds their shape, so an edit
   that quietly opens a read or drops a cap fails in npm test, and it tests
   the pure logic in local-media/_shared.js the two pages share.

   No stubs of third parties: everything here reads files in this repo. All
   names and addresses below are placeholders. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { REPO } from './load-canon.mjs';

const read = (p) => readFileSync(join(REPO, p), 'utf8');
const RULES = JSON.parse(read('system/rtdb/rules.snapshot.json'));
const R = RULES.rules['app-data']['media-local-media'];
const REG = JSON.parse(read('system/rtdb/tools-registry.snapshot.json'))['media-local-media'];
const PUB = read('local-media/index.html');
const ADM = read('local-media/admin/index.html');
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('local-media/_shared.js'), sandbox, { filename: 'local-media/_shared.js' });
const LM = sandbox.LM;
const keys = (list) => Array.from(list, (x) => x.key);

/* ------------------------------------------------------------ the rules */

test('nothing under media-local-media is world-readable', () => {
  assert.ok(R, 'the rules block exists');
  assert.ok(!/"\.read":\s*true/.test(JSON.stringify(R)), 'no .read: true anywhere in the block');
  assert.match(R['.read'], /auth != null/);
  assert.match(R['.read'], /=== 'superadmin'/);
  /* Only league roles reach the tool-level test, so an anonymous form user
     (no users/ record, no role) fails before any default is looked up. */
  assert.match(R['.read'], /=== 'admin' \|\| root\.child\('users'\)\.child\(auth\.uid\)\.child\('role'\)\.val\(\) === 'staff'\)/);
  assert.match(R['.read'], /child\('defaults'\)/, 'the registry default is the fallback');
  for (const node of ['submissions', 'status', 'manual']) {
    assert.equal(R[node]['.read'], undefined, `${node} has no read of its own`);
  }
  assert.equal(R['.write'], undefined, 'no blanket write over the whole node');
});

test('the public can only create a submission, carrying its own uid', () => {
  const w = R.submissions.$id['.write'];
  const pub = w.slice(0, w.indexOf(') || ('));
  assert.match(pub, /auth != null/);
  assert.match(pub, /!data\.exists\(\)/, 'create-only: no overwrite');
  assert.match(pub, /newData\.exists\(\)/, 'and no delete');
  assert.match(pub, /newData\.child\('uid'\)\.val\(\) === auth\.uid/);
  assert.equal(R.submissions['.write'], undefined, 'no write on the list itself');
  /* The other half of the OR is the staff test, the same as the read. */
  assert.ok(w.includes(R['.read']), 'staff edit and delete with the read test');
  assert.equal(R.status['.write'], R['.read']);
  assert.equal(R.manual['.write'], R['.read']);
});

test('every level of a submission refuses fields nobody designed', () => {
  const s = R.submissions.$id;
  assert.equal(s.$other['.validate'], false);
  assert.equal(s.submitter.$other['.validate'], false);
  assert.equal(s.contacts.$contactId.$other['.validate'], false);
  assert.equal(R.manual.$mid.$other['.validate'], false);
  assert.equal(R.manual.$mid.addedBy.$other['.validate'], false);
  assert.deepEqual(Object.keys(s).filter((k) => !k.startsWith('.') && k !== '$other').sort(),
    ['at', 'club', 'clubKey', 'contacts', 'submitter', 'uid']);
  assert.deepEqual(Object.keys(s.contacts.$contactId).filter((k) => !k.startsWith('.') && k !== '$other').sort(),
    ['email', 'name', 'organisation', 'phone', 'type']);
});

test('keys are push-id-like', () => {
  const PUSH = '.matches(/^[-_A-Za-z0-9]{20}$/)';
  assert.ok(R.submissions.$id['.validate'].startsWith('$id' + PUSH));
  assert.ok(R.submissions.$id.contacts.$contactId['.validate'].startsWith('$contactId' + PUSH));
  assert.ok(R.manual.$mid['.validate'].startsWith('$mid' + PUSH));
  assert.ok(R.status.$sid['.validate'].startsWith('$sid' + PUSH));
  assert.ok(R.status.$sid.$cid['.validate'].startsWith('$cid' + PUSH));
});

test('every field is length-capped at the caps the form uses', () => {
  const c = R.submissions.$id.contacts.$contactId, s = R.submissions.$id;
  const cap = (rule) => +String(rule['.validate']).match(/length <= (\d+)/)[1];
  assert.equal(cap(c.name), LM.MAX.name);
  assert.equal(cap(c.organisation), LM.MAX.organisation);
  assert.equal(cap(c.email), LM.MAX.email);
  assert.equal(cap(c.phone), LM.MAX.phone);
  assert.equal(cap(s.club), LM.MAX.club);
  assert.equal(cap(s.submitter.name), LM.MAX.name);
  assert.equal(cap(s.submitter.email), LM.MAX.email);
  assert.equal(cap(R.manual.$mid.club), LM.MAX.club);
  /* And the form carries the same caps as maxlength. */
  assert.match(PUB, /id="lmName"[^>]*maxlength="120"/);
  assert.match(PUB, /id="lmEmail"[^>]*maxlength="254"/);
});

test('name is optional, organisation, type and email are not', () => {
  const v = R.submissions.$id.contacts.$contactId['.validate'];
  assert.match(v, /hasChildren\(\['organisation', 'type', 'email'\]\)/);
  assert.ok(!/'name'/.test(v), 'a desk or newsroom inbox has no name');
  /* But a name that is there is not empty. */
  assert.match(R.submissions.$id.contacts.$contactId.name['.validate'], /length > 0/);
});

test('the rules allow exactly the types and statuses the pages offer', () => {
  const allowed = (rule) => [...rule['.validate'].matchAll(/newData\.val\(\) === '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(allowed(R.submissions.$id.contacts.$contactId.type), keys(LM.TYPES));
  assert.deepEqual(allowed(R.manual.$mid.type), keys(LM.TYPES));
  assert.deepEqual(allowed(R.status.$sid.$cid), keys(LM.STATUSES));
  assert.deepEqual(allowed(R.manual.$mid.status), keys(LM.STATUSES));
});

test('the type list is the agreed one, Other last', () => {
  assert.deepEqual(Array.from(LM.TYPES, (t) => t.label), ['Newspaper', 'Online news', 'Radio', 'TV', 'Podcast',
    'Fanzine', 'Fan site / blog', 'Influencer / content creator', 'Other']);
});

/* --------------------------------------------------------- the registry */

test('the registry record is admin-only by default', () => {
  assert.ok(REG, 'tools/media-local-media exists');
  assert.equal(REG.url, '/local-media/admin/');
  assert.equal(REG.label, 'Local Media');
  assert.deepEqual({ ...REG.defaults }, { superadmin: 'admin', admin: 'admin', staff: 'off', 'club-admin': 'off', 'club-staff': 'off' });
  assert.deepEqual(REG.levels, ['off', 'access'], 'nothing reads an admin level');
});

/* ------------------------------------------------------------ the pages */

test('the public form has no auth-guard and reads nothing', () => {
  const code = strip(PUB);
  assert.ok(!/auth-guard\.js/.test(code), 'no auth-guard on the public page');
  assert.ok(!/\.on\(|\.once\(|\.get\(\)/.test(code), 'the form never reads the database');
  const refs = [...code.matchAll(/db\.ref\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(refs.sort(), ["", "BASE + 'submissions'"],
    'it writes the submissions list only (and generates contact keys from the root ref)');
  assert.match(code, /signInAnonymously\(\)/);
  assert.match(code, /ServerValue\.TIMESTAMP/);
  assert.match(PUB, /<meta name="robots" content="noindex, nofollow">/);
});

test('the public form offers only the 72 current clubs', () => {
  const code = strip(PUB);
  assert.match(code, /divisions: \['National', 'North', 'South'\]/);
  assert.match(code, /season: 'current'/);
  assert.ok(!/freetext/.test(code), 'no typed club names');
});

test('the console is gated by auth-guard under its own key', () => {
  assert.match(ADM, /<script src="\/system\/auth-guard\.js\?v=\d+"><\/script>/);
  assert.match(ADM, /var NL_TOOL_KEY = 'media-local-media';/);
  assert.match(ADM, /toolKey: 'media-local-media'/);
});

/* ------------------------------------------------------- the pure logic */

const C = { name: ' Alex  Example ', organisation: 'Example Gazette', type: 'newspaper', email: ' Sport@Example.Invalid ', phone: '' };

test('cleanContact trims, lower-cases the email and drops empty optionals', () => {
  const c = LM.cleanContact(C);
  assert.deepEqual({ ...c }, { organisation: 'Example Gazette', type: 'newspaper', email: 'sport@example.invalid', name: 'Alex Example' });
  const inbox = LM.cleanContact({ ...C, name: '   ' });
  assert.equal('name' in inbox, false, 'a blank name is not stored as an empty string');
});

test('contactErrors: a generic inbox is fine; organisation, type and email are required', () => {
  assert.deepEqual({ ...LM.contactErrors(C) }, {});
  assert.deepEqual({ ...LM.contactErrors({ ...C, name: '' }) }, {});
  const e = LM.contactErrors({});
  assert.deepEqual(Object.keys(e).sort(), ['email', 'organisation', 'type']);
  assert.ok(LM.contactErrors({ ...C, email: 'nope' }).email);
  assert.ok(LM.contactErrors({ ...C, type: 'blog' }).type);
  assert.ok(LM.contactErrors({ ...C, phone: '1'.repeat(41) }).phone);
  assert.ok(LM.contactErrors({ ...C, name: 'x'.repeat(121) }).name);
});

test('isEmail is loose but not empty', () => {
  for (const ok of ['a@b.cc', 'sport.desk+nl@example.co.uk']) assert.ok(LM.isEmail(ok), ok);
  for (const bad of ['', 'a@b', 'a b@c.dd', '@b.cc', 'a@.cc '.trim() + ' x']) assert.ok(!LM.isEmail(bad), bad);
});

const DATA = {
  submissions: {
    s1: { club: 'Aldershot Town', clubKey: 'ALD', at: 2, submitter: { name: 'Sam Example', email: 'sam@example.invalid' },
      contacts: { c1: { name: 'Bea', organisation: 'Gazette', type: 'newspaper', email: 'bea@example.invalid' },
        c2: { organisation: 'Example FM', type: 'radio', email: 'sport@example.invalid' } } },
    s2: { club: 'Spennymoor Town', clubKey: 'SPE', at: 3, submitter: { name: 'Kim Example' },
      contacts: { c1: { name: 'Al', organisation: 'Echo', type: 'online', email: 'al@example.invalid' } } }
  },
  status: { s1: { c2: 'opted-out' } },
  manual: {
    m1: { club: 'League-wide', clubKey: '', name: 'Jo', organisation: 'National Daily', type: 'newspaper', email: 'jo@example.invalid', status: 'happy', addedBy: { uid: 'u', name: 'Staff Example' }, at: 1 },
    m2: { club: 'Aldershot Town', clubKey: 'ALD', name: 'Bea', organisation: 'Gazette', type: 'newspaper', email: 'BEA@example.invalid', addedBy: { uid: 'u', name: 'Staff Example' }, at: 4 }
  }
};
const DIV = { ALD: 'National', SPE: 'North' };
const rows = () => LM.rows(DATA, (k) => DIV[k] || null);

test('rows: one per contact, club and staff alike, with status and division', () => {
  const r = rows();
  assert.equal(r.length, 5);
  const inbox = r.find((x) => x.organisation === 'Example FM');
  assert.equal(inbox.status, 'opted-out');
  assert.equal(inbox.name, '');
  assert.equal(inbox.division, 'National');
  assert.equal(inbox.by, 'Sam Example');
  const jo = r.find((x) => x.name === 'Jo');
  assert.equal(jo.source, 'staff');
  assert.equal(jo.division, null, 'League-wide has no division');
  assert.equal(r.find((x) => x.name === 'Al').status, 'new', 'no status recorded reads as New');
  assert.equal(r[0].club, 'League-wide', 'League-wide sorts first');
});

test('filter: clubs (several at once), division, step, type, status and text all combine', () => {
  const r = rows();
  const n = (f) => LM.filter(r, f).length;
  assert.equal(n({}), 5);
  assert.equal(n({ clubs: ['ALD'] }), 3);
  assert.equal(n({ clubs: ['ALD', 'SPE'] }), 4);
  assert.equal(n({ clubs: [''] }), 1, 'League-wide is pickable as a club');
  assert.equal(n({ division: 'North' }), 1);
  assert.equal(n({ step: '1' }), 3);
  assert.equal(n({ step: '2' }), 1);
  assert.equal(n({ step: '1', division: 'North' }), 0, 'filters combine, they do not override');
  assert.equal(n({ division: 'National', type: 'radio' }), 1);
  assert.equal(n({ status: 'new' }), 3);
  assert.equal(n({ q: 'echo' }), 1);
  assert.equal(n({ q: 'staff example' }), 2, 'search reaches who added it');
  assert.equal(n({ clubs: ['ALD'], status: 'opted-out', q: 'fm' }), 1);
});

test('emails: once each, opted-out never, and says how many were left off', () => {
  const e = LM.emails(rows());
  assert.deepEqual(Array.from(e.list).sort(), ['al@example.invalid', 'bea@example.invalid', 'jo@example.invalid']);
  assert.equal(e.skipped, 1);
});

test('csvRows: a header, one row per contact, labels not keys', () => {
  const out = LM.csvRows(rows(), () => 'DATE');
  assert.equal(out.length, 6);
  assert.deepEqual(Array.from(out[0]).slice(0, 5), ['Club', 'Division', 'Name', 'Organisation', 'Type']);
  const fm = out.find((r) => r[3] === 'Example FM');
  assert.equal(fm[1], 'National League');
  assert.equal(fm[4], 'Radio');
  assert.equal(fm[7], 'Opted out');
  assert.equal(fm[10], 'DATE');
});

test('steps follow the pyramid: National is 1, North and South are 2', () => {
  assert.equal(LM.stepOf('National'), 1);
  assert.equal(LM.stepOf('North'), 2);
  assert.equal(LM.stepOf('South'), 2);
  assert.equal(LM.stepOf(null), null);
});
