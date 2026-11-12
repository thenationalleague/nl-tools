/* NL.audit — reading the audit log (nl-utils v1.52), promoted from the
   portal's Audit log pane. The entries here are this repo's own shape, as
   NL.writeAudit and the portal's writeAuditFor write them; no third party
   is stood in for. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { NL } from './load-canon.mjs';

test('a known action reads in words', () => {
  assert.equal(NL.audit.label({ action: 'access_changed' }), 'Access changed');
  assert.equal(NL.audit.label({ action: 'user_removed' }), 'User removed');
});

test('an auto-audit "<tool>_changed" names the tool', () => {
  assert.equal(NL.audit.label({ action: 'ops-vacancies_changed' }), 'Ops vacancies data changed');
});

test('an unknown action is made readable, and a missing one says so', () => {
  assert.equal(NL.audit.label({ action: 'some_new-thing' }), 'Some New Thing');
  assert.equal(NL.audit.label({}), 'Unknown action');
  assert.equal(NL.audit.label(null), 'Unknown action');
});

test('the time comes from at, ts, or the entry key, whichever is there', () => {
  const ms = Date.UTC(2026, 0, 5, 9, 30);
  const want = NL.timeAgo(ms);
  assert.equal(NL.audit.time({ at: new Date(ms).toISOString() }), want);
  assert.equal(NL.audit.time({ ts: ms }), want);
  assert.equal(NL.audit.time({ _key: ms + '_ab12cd' }), want, 'NL.writeAudit key');
  assert.equal(NL.audit.time({ _ts: String(ms) }), want, 'portal key');
  assert.equal(NL.audit.time({}), '');
});

test('the table escapes what people typed', () => {
  const html = NL.audit.table([{ action: 'invite_sent', name: 'A <b>', targetName: 'T & co', detail: '"x"', ts: Date.now() }]);
  assert.ok(html.includes('<table class="table">'));
  assert.ok(html.includes('A &lt;b&gt;'));
  assert.ok(html.includes('T &amp; co'));
  assert.ok(!html.includes('<b>'));
  assert.ok(html.includes('Invite sent'));
});
