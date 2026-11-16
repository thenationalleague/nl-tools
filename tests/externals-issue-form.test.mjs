/* One issue form for every card (pass v2.11, access v2.12, nl-utils v1.71):
   an External account's pass is ticked on /pass/?view=issue like anyone's,
   by the Skeleton key only, and never crosses the External line. The
   builder is tested in tests/external-pass.test.mjs; these pin the page. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const pass = readFileSync(join(REPO, 'pass/index.html'), 'utf8');
const access = readFileSync(join(REPO, 'access/index.html'), 'utf8');
const ext = readFileSync(join(REPO, 'access/_externals.js'), 'utf8');
const fn = (src, name) => src.slice(src.indexOf('function ' + name + '('), src.indexOf('\n  }\n', src.indexOf('function ' + name + '(')));

test('only the Skeleton key issues to an External account, and only it sees the External card', () => {
  assert.match(fn(pass, 'canIssueTo'), /if \(\(u\.pass && P\.isExternal\(u\.pass\)\) \|\| u\.role === 'external'\) return !!r\.skeleton;/);
  assert.match(pass, /\(rights\.skeleton \? '<label><input type="radio" name="issueBase" value="external" disabled> External card<\/label>' : ''\)/);
  assert.match(fn(access, 'canEdit'), /if \(P\.isExternal\(u\.pass\) \|\| u\.role === 'external'\) return sk\(\);/);
});

test('choosing a person locks the card to their side of the External line', () => {
  const c = fn(pass, 'choosePerson');
  assert.match(c, /var external = \(p && P\.isExternal\(p\)\) \|\| u\.role === 'external';/);
  assert.match(c, /r\.disabled = external \? r\.value !== 'external' : \(r\.value === 'external' \|\|/);
});

test('saving an External card writes the pass and its organisation, never tool entries or ext', () => {
  const s = fn(pass, 'saveIssue');
  const extBranch = s.slice(s.indexOf('if (P.isExternal(pass)) {'), s.indexOf('} else {', s.indexOf('if (P.isExternal(pass)) {')));
  assert.match(extBranch, /updates\[base \+ 'orgKey'\] = pass\.org;/);
  assert.doesNotMatch(extBranch, /tools\//, 'the server writes the entries from what the zones open');
  assert.doesNotMatch(s, /\/ext'\]|pass\/ext/, 'and ext is the server\'s alone');
  assert.match(fn(pass, 'previewPass'), /pass\.ext = P\.extFor\(/, 'the preview shows what the zones would open');
});

test('Access sends an External person to the issue form; Externals no longer edits zones itself', () => {
  assert.match(ext, /location\.href = '\/pass\/\?view=issue&uid=' \+ encodeURIComponent\(el\.getAttribute\('data-zones'\)\)/);
  assert.doesNotMatch(ext, /function editPersonZones/);
  assert.doesNotMatch(ext, /users\/' \+ uid \+ '\/pass\/keys/, 'no second place writes a pass');
});
