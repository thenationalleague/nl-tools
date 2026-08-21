/* Handbook draft-vs-published diff — unit tests for handbook/hb-diff.js.

   The thing this has to get right is RENUMBERING, and it is the reason the
   module exists. Clause numbers in the handbook are never stored: they are
   computed from the tree every time it renders. Delete one clause and every
   later clause in that article gets a new printed number, so a diff that
   compares by number reports one deletion as forty changes and hides the
   deletion among them.

   Every test below is really the same question asked a different way: does
   this report what a person did, or what fell out of it?

   Fixtures are invented clause text. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

const sandbox = { console, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(REPO, 'handbook/hb-diff.js'), 'utf8'), sandbox);
const D = sandbox.HB_DIFF;

/* An array built inside the vm has the vm's Array.prototype, so deepEqual —
   which is deepStrictEqual under assert/strict — refuses it against a plain
   host array with "same structure but not reference-equal". Copy anything
   crossing back before comparing. */
const host = (a) => Array.from(a);

/* --------------------------------------------------------------- helpers */

/* A flat clause tree, the shape the editor stores: parentId + order, no
   number anywhere. `n('a', null, 0, 'text')` is a root clause. */
function n(id, parentId, order, body, extra) {
  return Object.assign({ id, parentId, order, kind: 'clause', numStyle: 'decimal', body }, extra || {});
}
function mapOf(list) {
  const m = {};
  list.forEach((x) => { m[x.id] = x; });
  return m;
}
/* Decimal numbering over one level, which is all these fixtures need — the
   real engine lives in index.html and is not what is under test here. */
function numbers(nodes) {
  const out = {};
  const roots = Object.keys(nodes)
    .filter((id) => nodes[id].parentId == null)
    .sort((a, b) => nodes[a].order - nodes[b].order);
  roots.forEach((id, i) => {
    out[id] = String(i + 1);
    Object.keys(nodes)
      .filter((k) => nodes[k].parentId === id)
      .sort((a, b) => nodes[a].order - nodes[b].order)
      .forEach((k, j) => { out[k] = (i + 1) + '.' + (j + 1); });
  });
  return out;
}
function diff(pubList, drfList) {
  const pub = mapOf(pubList), drf = mapOf(drfList);
  return D.diffArea(pub, numbers(pub), drf, numbers(drf));
}

/* ------------------------------------------------------- the renumbering */

test('deleting one clause is one change, not forty', () => {
  /* The whole point. Ten sub-clauses, the second is deleted, and the eight
     below it all get a new printed number. */
  const kids = (n) => Array.from({ length: n }, (_, i) =>
    ({ id: 'k' + i, parentId: 'a', order: i, kind: 'clause', numStyle: 'decimal', body: 'Clause text ' + i }));
  const pub = [n('a', null, 0, 'Registration of players'), ...kids(10)];
  const drf = pub.filter((x) => x.id !== 'k1');

  const r = diff(pub, drf);
  assert.equal(r.removed.length, 1, 'one deletion');
  assert.equal(r.edited.length, 0);
  assert.equal(r.moved.length, 0, 'nothing MOVED — the survivors sat still and were renumbered');
  assert.equal(D.areaTotal(r), 1, 'the badge says 1');
  assert.equal(r.renumbered, 8, 'and the eight below it are counted once, as a consequence');
});

test('the deletion names the number it had when it was published', () => {
  /* A removed clause has no number in the draft — it is not there. Showing
     nothing, or the number now occupied by its successor, both mislead. */
  const pub = [n('a', null, 0, 'Head'), n('b', 'a', 0, 'First'), n('c', 'a', 1, 'Second')];
  const drf = [pub[0], pub[2]];
  const r = diff(pub, drf);
  assert.equal(r.removed[0].number, '1.1');
  assert.equal(r.removed[0].label, 'First');
});

test('a pure renumber is never listed as a change', () => {
  const pub = [n('a', null, 0, 'One'), n('b', null, 1, 'Two')];
  const drf = [n('a', null, 5, 'One'), n('b', null, 9, 'Two')]; // same order, different values
  const r = diff(pub, drf);
  assert.equal(D.areaTotal(r), 0, 'order VALUES changed but the sequence did not');
  assert.equal(r.renumbered, 0);
});

/* -------------------------------------------------------------- reorders */

test('swapping two clauses reports the ones that moved, not everything after them', () => {
  /* Naive "first index that differs" says four clauses moved here. Two did. */
  const pub = ['a', 'b', 'c', 'd', 'e'].map((id, i) => n(id, null, i, 'Clause ' + id));
  const drf = ['a', 'c', 'b', 'd', 'e'].map((id, i) => n(id, null, i, 'Clause ' + id));
  const r = diff(pub, drf);
  assert.equal(r.moved.length, 1,
    'one clause out of place is enough to explain the swap — the LIS keeps ' +
    'the other four');
  assert.equal(r.edited.length, 0);
  assert.ok(['b', 'c'].includes(r.moved[0].id));
});

test('a clause moved to another article is a move, not a delete and an add', () => {
  const pub = [n('a', null, 0, 'A'), n('b', null, 1, 'B'), n('x', 'a', 0, 'The clause')];
  const drf = [n('a', null, 0, 'A'), n('b', null, 1, 'B'), n('x', 'b', 0, 'The clause')];
  const r = diff(pub, drf);
  assert.equal(r.moved.length, 1);
  assert.equal(r.moved[0].toParent, true, 'it changed parent, which is worth saying');
  assert.equal(r.added.length, 0);
  assert.equal(r.removed.length, 0);
  assert.equal(r.moved[0].wasNumber, '1.1');
  assert.equal(r.moved[0].number, '2.1');
});

test('a clause that was both moved and rewritten is one entry, not two', () => {
  const pub = [n('a', null, 0, 'A'), n('b', null, 1, 'B'), n('x', 'a', 0, 'Old wording')];
  const drf = [n('a', null, 0, 'A'), n('b', null, 1, 'B'), n('x', 'b', 0, 'New wording')];
  const r = diff(pub, drf);
  assert.equal(r.edited.length, 1);
  assert.equal(r.moved.length, 0, 'the move rides on the edit rather than doubling the count');
  assert.equal(r.edited[0].alsoMoved, true);
  assert.equal(D.areaTotal(r), 1);
});

/* ----------------------------------------------------------------- edits */

test('an edit is an edit, and an unchanged clause is silent', () => {
  const pub = [n('a', null, 0, 'The fee is £250.'), n('b', null, 1, 'Unchanged.')];
  const drf = [n('a', null, 0, 'The fee is £500.'), n('b', null, 1, 'Unchanged.')];
  const r = diff(pub, drf);
  assert.equal(r.edited.length, 1);
  assert.equal(r.edited[0].number, '1');
  assert.equal(r.edited[0].textChanged, true);
});

test('formatting-only changes say so', () => {
  /* The words are identical and the numbering style is not. Reporting
     "edited" and nothing else sends someone hunting for a wording change
     that does not exist. */
  const pub = [n('a', null, 0, 'Same words')];
  const drf = [n('a', null, 0, 'Same words', { numStyle: 'lower-alpha' })];
  const r = diff(pub, drf);
  assert.equal(r.edited.length, 1);
  assert.equal(r.edited[0].styleOnly, true);
  assert.equal(r.edited[0].textChanged, false);
});

test('a missing field and an empty one are the same thing', () => {
  /* Firebase drops nulls on write, so a clause with no title reads back
     without the key. Comparing raw would report every such clause as
     edited on the first publish after any save. */
  const pub = [{ id: 'a', parentId: null, order: 0, kind: 'clause', numStyle: 'decimal', body: 'Text', title: null }];
  const drf = [{ id: 'a', parentId: null, order: 0, kind: 'clause', numStyle: 'decimal', body: 'Text' }];
  assert.equal(D.areaTotal(diff(pub, drf)), 0);
});

test('updatedAt and updatedBy are not changes', () => {
  /* commit() stamps both on every save. If they counted, opening a clause
     and saving it untouched would show as an edit. */
  const pub = [n('a', null, 0, 'Text', { updatedAt: 1, updatedBy: 'someone' })];
  const drf = [n('a', null, 0, 'Text', { updatedAt: 2, updatedBy: 'someone else' })];
  assert.equal(D.areaTotal(diff(pub, drf)), 0);
});

test('a changed table cell is an edit', () => {
  const t = (fee) => ({ header: ['Offence', 'Fee'], rows: [['Late team sheet', fee]] });
  const pub = [n('a', null, 0, '', { table: t('£100') })];
  const drf = [n('a', null, 0, '', { table: t('£150') })];
  const r = diff(pub, drf);
  assert.equal(r.edited.length, 1);
  assert.equal(r.edited[0].tableChanged, true);
});

test('a table read back from Firebase as an object map is not a change', () => {
  /* Firebase returns sparse arrays as objects. normNode() in the editor
     coerces them back, but an edition snapshot read straight off the wire
     has not been through it. */
  const asArray = { header: ['A'], rows: [['x', 'y']] };
  const asObject = { header: { 0: 'A' }, rows: { 0: { 0: 'x', 1: 'y' } } };
  assert.equal(
    JSON.stringify(D._normTable(asArray)),
    JSON.stringify(D._normTable(asObject)));
});

/* ------------------------------------------------------------ word diff */

test('the word diff marks only the words that changed', () => {
  const ops = D.diffWords('The fee is £250 per match.', 'The fee is £500 per match.');
  assert.deepEqual(host(ops.map((o) => o.t)), ['=', '-', '+', '=']);
  assert.equal(ops[1].s, '£250');
  assert.equal(ops[2].s, '£500');
  assert.equal(ops[0].s, 'The fee is');
  assert.equal(ops[3].s, 'per match.');
});

test('an insertion at the end is an insertion', () => {
  /* PUNCTUATION TRAVELS WITH ITS WORD. "League." and "League" are different
     tokens, so appending to a sentence restrikes the word the full stop was
     on — here, "League." out and "League in writing." in.

     That is deliberate. Splitting punctuation into tokens of its own makes
     the diff technically tighter and the rendering worse: a legal clause
     where a lone comma is struck in red, with the words either side
     untouched, is harder to read than one where the phrase is restated. The
     unit of change on screen is the word, because that is the unit a person
     reading a rule change cares about. */
  const ops = D.diffWords('Clubs must notify the League.', 'Clubs must notify the League in writing.');
  assert.deepEqual(host(ops.map((o) => o.t)), ['=', '-', '+']);
  assert.equal(ops[0].s, 'Clubs must notify the');
  assert.equal(ops[1].s, 'League.');
  assert.equal(ops[2].s, 'League in writing.');
});

test('an insertion mid-sentence leaves both sides of it alone', () => {
  const ops = D.diffWords('The club shall pay the fee', 'The club shall promptly pay the fee');
  assert.deepEqual(host(ops.map((o) => o.t)), ['=', '+', '=']);
  assert.equal(ops[1].s, 'promptly');
});

test('a wholly rewritten clause does not pretend to share words', () => {
  const ops = D.diffWords('Alpha bravo charlie.', 'Delta echo foxtrot.');
  assert.deepEqual(host(ops.map((o) => o.t)), ['-', '+']);
});

test('identical text produces no marks at all', () => {
  const ops = D.diffWords('No change here.', 'No change here.');
  assert.deepEqual(host(ops.map((o) => o.t)), ['=']);
});

test('a very large rewrite falls back rather than building the table', () => {
  /* O(n·m) on 5,000 words each side is 25 million cells and a locked tab.
     Past the limit it degrades to one struck block and one new one, which
     is still true, just coarser. */
  const a = Array.from({ length: 2000 }, (_, i) => 'alpha' + i).join(' ');
  const b = Array.from({ length: 2000 }, (_, i) => 'bravo' + i).join(' ');
  const started = Date.now();
  const ops = D.diffWords(a, b);
  assert.ok(Date.now() - started < 2000, 'it returns quickly');
  assert.deepEqual(host(ops.map((o) => o.t)), ['-', '+']);
});

/* --------------------------------------------------------- html to text */

test('markup goes and the line structure stays', () => {
  assert.equal(
    D.htmlToText('<p>First line</p><p>Second <b>line</b></p>'),
    'First line\nSecond line');
  assert.equal(D.htmlToText('One<br>Two'), 'One\nTwo');
});

test('entities are decoded, so a diff does not report &amp; against &', () => {
  assert.equal(D.htmlToText('Rules &amp; Regulations'), 'Rules & Regulations');
  assert.equal(D.htmlToText('&ldquo;the Club&rdquo;'), '“the Club”');
  assert.equal(D.htmlToText('a&#39;b'), "a'b");
});

test('an unknown entity is left alone rather than mangled', () => {
  assert.equal(D.htmlToText('&frac12;'), '&frac12;');
});

test('nothing in, nothing out', () => {
  assert.equal(D.htmlToText(null), '');
  assert.equal(D.htmlToText(undefined), '');
  assert.deepEqual(host(D.diffWords('', '')), []);
});

/* ------------------------------------------------------------ the total */

test('the badge counts changes, never their consequences', () => {
  const kids = Array.from({ length: 6 }, (_, i) =>
    ({ id: 'k' + i, parentId: 'a', order: i, kind: 'clause', numStyle: 'decimal', body: 'C' + i }));
  const pub = [n('a', null, 0, 'Head'), ...kids];
  const drf = [n('a', null, 0, 'Head'), ...kids.filter((k) => k.id !== 'k0')];
  const areas = { articles: diff(pub, drf), 'league-rules': diff(pub, pub) };
  assert.equal(D.total(areas), 1);
  assert.equal(areas.articles.renumbered, 5);
});

test('a first publish is every clause added, and nothing else', () => {
  const drf = [n('a', null, 0, 'One'), n('b', null, 1, 'Two')];
  const r = diff([], drf);
  assert.equal(r.added.length, 2);
  assert.equal(r.removed.length, 0);
  assert.equal(r.renumbered, 0);
});

test('an empty draft against a published edition is a total wipe, reported as one', () => {
  const pub = [n('a', null, 0, 'One'), n('b', null, 1, 'Two')];
  const r = diff(pub, []);
  assert.equal(r.removed.length, 2);
  assert.equal(D.areaTotal(r), 2);
});

/* --------------------------------------------------------------- the LIS */

test('the longest increasing subsequence is the one the reorder rests on', () => {
  assert.deepEqual(host(D._lisIndices([0, 1, 2, 3])), [0, 1, 2, 3]);
  assert.equal(D._lisIndices([3, 2, 1, 0]).length, 1, 'a full reversal keeps one');
  assert.deepEqual(host(D._lisIndices([])), []);
  const keep = D._lisIndices([0, 2, 1, 3, 4]);
  assert.equal(keep.length, 4, 'one element explains the swap');
});

/* ------------------------------------------------------------- the wiring

   The engine above is only useful if the page reaches it, reads the right
   things, and — the one that would fail silently in production — is allowed
   to read them at all. */

const PAGE = readFileSync(join(REPO, 'handbook/index.html'), 'utf8');
const RULES = JSON.parse(readFileSync(join(REPO, 'system/rtdb/rules.snapshot.json'), 'utf8'));
const CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
const SRC_COMMENTS = PAGE;
const SPRITE_SRC = readFileSync(join(REPO, 'assets/icons/sprites.svg'), 'utf8');

test('an admin is allowed to read the edition they are diffing against', () => {
  /* THE ONE THAT BITES. editions/ was readable only by a club token — the
     custom token the code gate mints for reader.html. A staff admin could
     WRITE an edition by publishing and then not read it back, so the review
     screen would load, deny, and report an error to the only people who can
     act on it. Rules ship by a manual workflow, so this must be right in
     the snapshot before the button is pressed. */
  const hb = RULES.rules['app-data']['ops-handbook'];
  for (const node of ['editions', 'publishedEditionId']) {
    const read = hb[node]['.read'];
    assert.match(read, /auth\.token\.club != null/, `${node}: clubs still read it`);
    assert.match(read, /'admin'/, `${node}: an admin must be able to read it to diff against it`);
    assert.match(read, /'superadmin'/);
  }
});

test('writing an edition stays admin-only', () => {
  /* Widening the read must not have widened the write. */
  const hb = RULES.rules['app-data']['ops-handbook'];
  for (const node of ['editions', 'publishedEditionId']) {
    assert.ok(!/auth\.token\.club/.test(hb[node]['.write']),
      `${node}: a club code must never be able to publish`);
  }
});

test('the page loads the diff module', () => {
  assert.match(PAGE, /<script src="hb-diff\.js\?v=\d+"><\/script>/);
  assert.match(CODE, /HB_DIFF\.diffArea\(/);
});

test('the draft timestamp is written by the single write path', () => {
  /* If anything can change the draft without moving lastEditedAt, the bar
     says "no changes since the last edition" over a draft that has them. */
  const commit = CODE.slice(CODE.indexOf('function commit('));
  assert.match(commit.slice(0, 1400), /touchDraft\(\)/);
  assert.match(CODE, /function touchDraft\(\)[\s\S]{0,400}draft\/lastEditedAt/);
});

test('the timestamp write does not earn its own audit line', () => {
  /* NL.writeAudit suppresses the automatic hook for 500ms, so touchDraft
     has to land after it or every save logs twice. */
  const commit = CODE.slice(CODE.indexOf('function commit('));
  const window = commit.slice(0, 1400);
  assert.ok(window.indexOf('writeAudit') < window.indexOf('touchDraft()'),
    'touchDraft goes after writeAudit, inside its suppression window');
});

test('no timestamp means unknown, never "nothing changed"', () => {
  /* Nobody has saved since this shipped, so the field is absent on the live
     draft. Reading absence as "up to date" would tell an admin their
     unpublished edits are already live. */
  const fn = CODE.slice(CODE.indexOf('function syncChanges('));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.match(body, /!PUB\.draftAt.*\n?.*Review changes/,
    'an absent timestamp falls back to the neutral label');
});

test('a stale count is dropped the moment the draft changes', () => {
  const fn = CODE.slice(CODE.indexOf('function touchDraft('));
  assert.match(fn.slice(0, 300), /PUB\.count = null/);
});

test('publishing clears the badge', () => {
  assert.match(CODE, /PUB\.count = 0; syncChanges\(\)/,
    'a badge still reading "not published" after a publish is how something ' +
    'gets published twice');
});

test('the review reads clause snapshots, not the baked html', () => {
  /* An edition stores a rendered html blob per area as well as its nodes.
     The blob is the bulk of it and the diff never looks at it. */
  assert.match(CODE, /'\/editions\/' \+ PUB\.id \+ '\/docs\/' \+ d\.id \+ '\/nodes'/);
});

test('the load check reads two timestamps, not the documents', () => {
  const fn = CODE.slice(CODE.indexOf('function checkPublished('));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.ok(!/draft\/docs/.test(body),
    'this runs on every page load for every admin — it must not pull five ' +
    'areas of clause text to answer a yes/no question');
  assert.match(body, /publishedEditionId/);
  assert.match(body, /draft\/lastEditedAt/);
});

test('the review cap is announced rather than silently applied', () => {
  assert.match(CODE, /REV_MAX = \d+/);
  assert.match(CODE, /more in this area are not shown/,
    'a silent top-N on a publish review reads as "that is everything"');
});

test('the review offers the publish it is a review for', () => {
  assert.match(CODE, /label: 'Publish edition'[\s\S]{0,160}publish\(\)/,
    'see it, then do it — the review is the route to publishing, not a ' +
    'detour from it');
});

test('a denied read never reports itself as "nothing published"', () => {
  /* This told the wrong story once, live. Before the rules widened,
     checkPublished could not read publishedEditionId, PUB.id stayed null,
     and the review announced "Nothing has been published yet" over a
     handbook with previous editions behind it. Richard: "why did it say no
     versions when I have Prev versions?"

     Not knowing and knowing there is nothing are different answers, and the
     first one has to name its own cause — the rules workflow — because
     that is the fix. */
  assert.match(CODE, /PUB\.error\s*\n?\s*\? 'Could not read the published edition/);
  assert.match(CODE, /Deploy RTDB rules/,
    'the message names the thing that fixes it');
  assert.match(CODE, /if \(PUB\.error \|\| !PUB\.id\) return/,
    'and it does not then list every clause as new');
});

test('the error state is cleared on each check, not sticky', () => {
  const fn = CODE.slice(CODE.indexOf('function checkPublished('));
  assert.match(fn.slice(0, 300), /PUB\.error = false/,
    'a denial before the rules landed must not outlive the fix');
});

test('opening the review re-checks rather than trusting page load', () => {
  const open = CODE.slice(CODE.indexOf('function reviewChanges('));
  assert.match(open.slice(0, 900), /Promise\.resolve\(checkPublished\(\)\)[\s\S]{0,200}loadForReview\(\)/,
    'the rules may have been deployed, or a colleague may have published, ' +
    'since this page loaded');
});

/* ----------------------------------------------- stepping back, not forward

   Two requests, one idea: taking a change away should leave the document as
   though the change never happened — not as though a second change had been
   made on top of it. */

test('an undo restores the stamps, so the clause is what it was', () => {
  /* commit() writes updatedAt/updatedBy on every changed clause. Undo goes
     through commit(), so undoing an accidental edit used to put the old text
     back and stamp it "changed a moment ago, by you". The wording stepped
     back and the record stepped forward. */
  assert.match(CODE, /function commit\(clone, label, opts\)/);
  assert.match(CODE, /if \(!opts\.keepStamps\) \{ a\.updatedAt = now; a\.updatedBy = who; \}/);
  assert.match(CODE, /commit\(step\.nodes, verb \+ ': ' \+ step\.label, \{ keepStamps: true \}\)/,
    'time travel is a restoration, not an edit');
});

test('discard puts back the edition exactly, stamps and all', () => {
  /* Editions are built with strip(), which carries no updatedAt — so a
     discarded draft has none either, and is byte-identical to what was
     published. Stamping 560 clauses as edited today by whoever pressed the
     button would be a lie told 560 times, and it would make the very next
     review report a document that matches the edition as "changed". */
  const fn = CODE.slice(CODE.indexOf('function discardAll('));
  const body = fn.slice(0, fn.indexOf('\n  function '));
  assert.match(body, /strip\(normNode\(/);
  assert.ok(!/updatedAt = /.test(body), 'no fresh stamps on a restore');
});

test('discard removes draft clauses the edition does not have', () => {
  /* An update() of the published clauses alone leaves anything ADDED since
     sitting in the draft — a discard that discards most of it. */
  const fn = CODE.slice(CODE.indexOf('function discardAll('));
  assert.match(fn.slice(0, 4000), /if \(!keep\[id\]\) updates\[id\] = null;/);
});

test('discard leaves an area the edition never carried alone', () => {
  /* publish() skips an area with no nodes, so an empty snapshot means "never
     published", not "published empty". Treating those the same would delete
     an area nobody had got round to publishing. */
  const fn = CODE.slice(CODE.indexOf('function discardAll('));
  assert.match(fn.slice(0, 4000), /if \(!list\.length\) return;/);
});

test('discard refuses while someone else is editing', () => {
  /* It rewrites all five areas, so an area another admin has open is their
     work being deleted from under them. Everything before this only ever
     wrote inside the open area, which is why the lock had never needed
     checking here. */
  const fn = CODE.slice(CODE.indexOf('function discardAll('));
  const body = fn.slice(0, 4000);
  assert.match(body, /draft\/locks/);
  assert.match(body, /!lockIsMine\(locks\[k\]\) && !lockIsStale\(locks\[k\]\)/,
    'someone else, and still live — my own lock and a dead one are both fine');
  assert.match(body, /is editing right now/);
});

test('discard is typed to confirm and clears the undo stack', () => {
  const fn = CODE.slice(CODE.indexOf('function discardAll('));
  const body = fn.slice(0, 5000);
  assert.match(body, /!== 'DISCARD'/);
  assert.match(body, /S\.undo\.length = 0; S\.redo\.length = 0;/,
    'the stack points at states that no longer exist — offering to undo the ' +
    'discard would reinstate half of one area');
});

test('discard sits in the review, not beside Publish', () => {
  assert.match(CODE, /id="hbDiscard"/);
  const body = CODE.slice(CODE.indexOf('function reviewHtml('), CODE.indexOf('function discardAll('));
  assert.match(body, /hb-rev__discard/);
  /* And only when there is something to discard. */
  assert.match(body, /if \(n\) \{[\s\S]{0,200}hb-rev__discard/);
});

/* ------------------------------------------------------- the missing middle

   Undo is twenty deep, per-area and gone on reload; the only other restore
   points were publishes. So a bad edit made three weeks ago had one remedy —
   throw away everything since — and that discard was itself the one
   irreversible act in the tool. These two close both ends. */

test('a snapshot is taken BEFORE the discard writes anything', () => {
  /* A discard that fails halfway leaves a snapshot that is merely
     redundant. A discard that succeeds without one is unrecoverable. */
  const fn = CODE.slice(CODE.indexOf('function discardAll('));
  const body = fn.slice(0, 6000);
  const snapAt = body.indexOf('takeSnapshot(');
  const writeAt = body.indexOf("'/draft/docs/'");
  assert.ok(snapAt > -1, 'discard takes a snapshot');
  assert.ok(writeAt > -1 && snapAt < writeAt,
    'and takes it before it starts overwriting the draft');
});

test('the snapshot and its index are separate nodes', () => {
  /* A snapshot is the whole handbook; the index beside it is three fields.
     Listing what restore points exist has to read the index, or opening the
     review downloads every snapshot ever taken to show three dates. */
  assert.match(CODE, /draft\/snapshots/);
  assert.match(CODE, /draft\/snapshotIndex/);
  const latest = CODE.slice(CODE.indexOf('function latestSnapshot('));
  assert.match(latest.slice(0, 500), /snapshotIndex/);
  assert.ok(!/snapshots'\)\.once/.test(latest.slice(0, 500)),
    'the picker reads the index, never the snapshots themselves');
});

test('restore points live under draft/, so no rules change ships with them', () => {
  /* draft is already "signed in can read, admin can write", which is exactly
     what a snapshot of the draft wants — and nothing reads draft wholesale,
     so the weight sits out of the way. A node of its own would need the
     manual rules workflow run before the feature worked at all. */
  const hb = RULES.rules['app-data']['ops-handbook'];
  assert.ok(!hb.snapshots, 'no separate snapshots node to have to deploy');
  assert.match(hb.draft['.write'], /'admin'/);
  assert.match(CODE, /BASE \+ '\/draft\/snapshots'/);
});

test('old restore points are pruned, and a failed prune is not a failed discard', () => {
  const fn = CODE.slice(CODE.indexOf('function pruneSnapshots('));
  const body = fn.slice(0, 900);
  assert.match(CODE, /SNAP_KEEP = \d+/);
  assert.match(body, /slice\(SNAP_KEEP\)/);
  assert.match(body, /catch/, 'clutter is not a failure');
});

test('restoring replaces the draft rather than merging into it', () => {
  /* The snapshot IS the draft as it was, so anything added since has to go
     rather than survive alongside. update() would leave it. */
  const fn = CODE.slice(CODE.indexOf('function restoreSnapshot('));
  const body = fn.slice(0, 2000);
  assert.match(body, /'\/draft\/docs'\)\.set\(docs\)/);
  assert.match(body, /!== 'RESTORE'/, 'typed to confirm — it discards in the other direction');
  assert.match(body, /S\.undo\.length = 0/);
});

test('every changed clause offers to go back on its own', () => {
  /* Without this the only remedy for one bad edit among forty good ones is
     Discard all changes. */
  assert.match(CODE, /function revertOne\(docId, kind, entry\)/);
  assert.match(CODE, /class="btn btn--icon btn--ghost hb-rev__back"/);
  assert.match(CODE, /aria-label="Put this clause back to the published version"/);
  assert.match(CODE, /sprites\.svg#icon-refresh/,
    'a circular arrow — a back chevron on the right of a row reads as ' +
    '"previous" or "collapse"');
  assert.match(SPRITE_SRC, /id="icon-refresh"/);
  assert.match(PAGE, /@media \(hover: none\) \{ \.hb-rev__back \{ opacity: 1; \} \}/,
    'a hover-only affordance is permanently dim on a phone, which reads as ' +
    'disabled');
});

test('reverting an added clause that has children is refused, not orphaning', () => {
  /* Deleting it alone leaves its children with a parentId pointing at
     nothing: they vanish from the tree without being deleted. */
  const fn = CODE.slice(CODE.indexOf('function revertOne('));
  const body = fn.slice(0, 3000);
  assert.match(body, /kids\.length/);
  assert.match(body, /put those back first/);
});

test('reverting a removed clause whose parent is gone is refused', () => {
  const fn = CODE.slice(CODE.indexOf('function revertOne('));
  const body = fn.slice(0, 3000);
  assert.match(body, /!area\.drf\[wasParent\]/);
  assert.match(body, /no longer in the draft/);
});

test('a revert does not join the per-area undo stack, and says why', () => {
  /* The stack holds snapshots of the OPEN area; the review is cross-area.
     Working for some rows and quietly corrupting others is worse than
     working the same everywhere. */
  const fn = CODE.slice(CODE.indexOf('function revertOne('));
  const body = fn.slice(0, 3000);
  assert.match(body, /if \(docId === S\.docId\) \{[\s\S]{0,120}S\.undo\.length = 0/,
    'touching the open area clears its stack rather than leaving it stale');
  assert.match(SRC_COMMENTS, /IT DOES NOT JOIN THE UNDO STACK, deliberately/);
});

test('a revert keeps the cached draft honest for the next one', () => {
  /* Two reverts in one sitting: the second must reason about a document
     that has already moved. */
  const fn = CODE.slice(CODE.indexOf('function revertOne('));
  assert.match(fn.slice(0, 3000), /delete area\.drf\[id\]/);
});

/* ------------------------------------------------------ the id is the key

   Reported from the live site: every article in the Memorandum numbered "7",
   every article in the Articles numbered "31", and every sub-clause missing.
   Seven and thirty-one are the number of root articles in those two areas.

   computeNumbers writes map[k.id] and renderNode reads numMap[node.id] — the
   PROPERTY, not the key. A stored clause with no id property therefore
   collapses the whole area onto map[undefined]: every clause renders whatever
   the last one computed, and no child renders at all, because walk() recurses
   on childrenOf(nodes, undefined).

   "Discard all changes" wrote its clauses through strip(), which does not
   include the id, and did it to all five areas at once. Every writer before it
   passed whole node objects through, so nothing had ever exercised the gap.

   Nothing was lost — the keys, the text, the parents and the order were all
   intact, only the redundant copy of the key inside the value. */

test('nodes are stamped with their key on the way in', () => {
  /* The fix that matters: it repairs a damaged draft on the next page load,
     with no database write and no migration. */
  assert.match(CODE, /function normNode\(n, id\)/);
  assert.match(CODE, /if \(id !== undefined\) n\.id = id;/);
  assert.match(CODE, /normNode\(nodes\[id\], id\)/,
    'load() has the key in hand and must pass it');
});

test('every writer that strips a node puts the id back', () => {
  /* strip() is the stored shape and deliberately has no id. The two callers
     that write a stripped node rather than a whole one have to restore it. */
  const stripDef = /function strip\(n\) \{ return \{([^}]*)\}/.exec(CODE);
  assert.ok(stripDef, 'strip() still exists');
  assert.ok(!/\bid\b/.test(stripDef[1]), 'strip() does not carry the id — that is the trap');

  for (const fn of ['discardAll', 'revertOne']) {
    const body = CODE.slice(CODE.indexOf('function ' + fn + '('));
    assert.match(body.slice(0, 4000), /v\.id = /,
      `${fn} writes stripped clauses and must restore the id`);
  }
});

test('the diff reads nodes with their keys too', () => {
  /* loadForReview computes numbers over the draft, so it had the same defect
     and would have shown a review full of identical clause numbers. */
  assert.match(CODE, /drf\[id\] = normNode\(Object\.assign\(\{\}, drfNodes\[id\]\), id\)/);
  assert.match(CODE, /pub\[nd\.id\] = normNode\(Object\.assign\(\{\}, nd\), nd\.id\)/);
});
