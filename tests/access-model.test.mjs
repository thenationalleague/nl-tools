/* Access model — NL.resolveToolLevel.

   This is the one function that answers "what may this person do on this
   tool", and until 17/08/2026 there were four answers to that question in the
   estate: auth-guard's (correct) and one each in Vacancies, Judgements and
   Website Archive (all wrong, all differently). The bug they shared was that
   the per-user entry was the only input — so the registry default that had
   just granted the user entry was ignored once they were through the door,
   and a League Admin with no explicit grant landed read-only on a tool whose
   record says Manage.

   These tests exist so that cannot come back. They cover the two inputs
   (per-user entry, registry defaults), every entry shape the estate has ever
   stored, and the fail-closed cases — because the cost of a false 'admin'
   here is someone editing 72 clubs' data. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { NL } from './load-canon.mjs';

/* A registry record of the ordinary shape: League Admins manage, everyone
   else uses, and a role absent from defaults gets nothing. */
const TOOL = {
  defaults: {
    superadmin: 'admin',
    admin: 'admin',
    staff: 'access',
    'club-admin': 'access',
    'club-staff': 'access',
  },
};

const resolve = (entry, tool, role) => NL.resolveToolLevel(entry, tool, role);

test('a per-user entry wins over the registry default', () => {
  assert.equal(resolve('admin', TOOL, 'staff'), 'admin', 'promotion above the default');
  assert.equal(resolve('access', TOOL, 'admin'), 'access', 'demotion below the default');
  assert.equal(resolve('off', TOOL, 'admin'), 'off', 'an explicit off is a denial, not a gap');
});

test('no entry falls through to the registry default for the role', () => {
  /* THE regression. Every one of these went to the tool as "not admin"
     before, because the tools never looked at defaults at all. */
  assert.equal(resolve(undefined, TOOL, 'admin'), 'admin');
  assert.equal(resolve(null, TOOL, 'admin'), 'admin');
  assert.equal(resolve(undefined, TOOL, 'staff'), 'access');
  assert.equal(resolve(undefined, TOOL, 'club-staff'), 'access');
});

test('a role with no default entry gets nothing', () => {
  assert.equal(resolve(undefined, { defaults: { admin: 'admin' } }, 'staff'), 'off');
  assert.equal(resolve(undefined, { defaults: {} }, 'admin'), 'off');
});

test('no registry record at all is no access', () => {
  assert.equal(resolve(undefined, null, 'admin'), 'off');
  assert.equal(resolve(undefined, {}, 'admin'), 'off');
  assert.equal(resolve(undefined, undefined, 'superadmin'), 'off',
    'superadmin is granted by auth-guard before this is asked, not in here');
});

test('legacy role keys resolve against the canon defaults key', () => {
  /* norm(): 'club' -> club-admin, 'club-viewer' -> club-staff. A user record
     written before the 16/08 rename must not silently drop to 'off'. */
  assert.equal(resolve(undefined, TOOL, 'club'), 'access');
  assert.equal(resolve(undefined, TOOL, 'club-viewer'), 'access');
});

test('every stored entry shape the estate has used is understood', () => {
  /* The canonical string. */
  assert.equal(resolve('admin', TOOL, 'staff'), 'admin');
  assert.equal(resolve('access', TOOL, 'staff'), 'access');

  /* The legacy {access,admin} object — Website Archive handled ONLY this
     shape until v2.7, which is why a string "admin" gave nobody admin. */
  assert.equal(resolve({ access: true, admin: true }, TOOL, 'staff'), 'admin');
  assert.equal(resolve({ access: true, admin: false }, TOOL, 'staff'), 'access');
  assert.equal(resolve({ access: false, admin: false }, TOOL, 'admin'), 'off',
    'a legacy denial stays a denial — it must not fall through to the default');

  /* A bare true, from the oldest records. */
  assert.equal(resolve(true, TOOL, 'staff'), 'access');
});

test('fails closed on anything it does not recognise', () => {
  assert.equal(resolve('hidden', TOOL, 'admin'), 'off', "the retired 'hidden' is off");
  assert.equal(resolve('Admin', TOOL, 'staff'), 'off', 'case matters — no fuzzy matching');
  assert.equal(resolve('manage', TOOL, 'staff'), 'off', 'the LABEL is not the value');
  assert.equal(resolve('', TOOL, 'admin'), 'off');
  assert.equal(resolve(0, TOOL, 'admin'), 'off', 'a stored 0 is a record, not a gap');
  assert.equal(resolve(false, TOOL, 'admin'), 'off', 'a stored false is a record, not a gap');
  assert.equal(resolve(NaN, TOOL, 'admin'), 'off');
});

test('the returned value is always one of the three levels', () => {
  const LEVELS = new Set(['off', 'access', 'admin']);
  const entries = [undefined, null, true, false, 0, 1, '', 'admin', 'access', 'off',
    'hidden', 'nonsense', {}, { admin: true }, { access: true }, [], NaN];
  const roles = ['superadmin', 'admin', 'staff', 'club-admin', 'club-staff',
    'club', 'club-viewer', 'third-party', '', undefined];
  for (const e of entries) {
    for (const r of roles) {
      for (const t of [TOOL, {}, null, undefined, { defaults: {} }]) {
        const got = resolve(e, t, r);
        assert.ok(LEVELS.has(got),
          `resolve(${JSON.stringify(e)}, ${JSON.stringify(t)}, ${r}) returned ${got}`);
      }
    }
  }
});

test('the retired third-party role gets nothing from an ordinary record', () => {
  assert.equal(resolve(undefined, TOOL, 'third-party'), 'off');
});

/* NL.roles.grant — the one-line statement of what a role can do.

   It lives in canon beside NL.roles.LABELS because it is the same vocabulary:
   a role name nobody can act on is half the model. The portal shows it under
   both role pickers, so the person choosing a role can see which one submits
   their club's attendances — the question that sent Richard back to a plan
   document nothing links to. */

test('every role in the model has both a label and a grant', () => {
  const roles = ['superadmin', 'admin', 'staff', 'club-admin', 'club-staff'];
  for (const r of roles) {
    assert.ok(NL.roles.label(r), `${r} has no label`);
    assert.ok(NL.roles.grant(r), `${r} has no grant line — a picker would render a blank`);
  }
});

test('legacy role keys carry a grant too', () => {
  /* A record written before the 16/08 rename still renders in the picker. */
  assert.equal(NL.roles.grant('club'), NL.roles.grant('club-admin'));
  assert.equal(NL.roles.grant('club-viewer'), NL.roles.grant('club-staff'));
});

test('an unknown role gets an empty grant, not a placeholder', () => {
  /* '' lets the caller render nothing. A fallback string would put invented
     wording about someone's access on screen. */
  assert.equal(NL.roles.grant('third-party'), '');
  assert.equal(NL.roles.grant('nonsense'), '');
  assert.equal(NL.roles.grant(''), '');
  assert.equal(NL.roles.grant(undefined), '');
});

test('the two tiers in each realm do not describe themselves identically', () => {
  /* The whole point is that the pair is distinguishable at a glance. */
  assert.notEqual(NL.roles.grant('admin'), NL.roles.grant('staff'));
  assert.notEqual(NL.roles.grant('club-admin'), NL.roles.grant('club-staff'));
  assert.notEqual(NL.roles.grant('admin'), NL.roles.grant('club-admin'));
});
