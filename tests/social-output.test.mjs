/* Social Output — the X CSV mapper, the re-import merge, the category rules
   and the cadence maths.

   All rows here are invented. Real scraper exports hold other clubs' post
   text and never enter this repo. The column names below are this file's
   own; the mapper reads columns by alias, and the Import preview lists any
   column it did not read, so a real export is checked on screen, not here. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { REPO } from './load-canon.mjs';

const ctx = { Intl, Date };
vm.runInNewContext(readFileSync(join(REPO, 'social-output/_data.js'), 'utf8'), ctx);
const S = ctx.SocialData;
const RULES = S.DEFAULT_RULES.x;
/* Values made inside the vm context have that context's prototypes, which
   deepStrictEqual treats as different from this realm's. */
const plain = (v) => JSON.parse(JSON.stringify(v));

const row = (o) => Object.assign({
  'Tweet ID': '', 'URL': '', 'Posted At': '', 'Type': 'original', 'Author': 'TheNationalLeague',
  'Text': '', 'Link URL': '', 'Media': '', 'Media Count': '', 'Views': '', 'Likes': '', 'Replies': '',
  'Reposts': '', 'Bookmarks': ''
}, o);

const SAMPLE = [
  row({ 'Tweet ID': '1001', 'Posted At': '2026-08-08T13:05:00.000Z', 'Text': 'Team of the Week is here', 'Media': 'image', 'Media Count': '1', 'Views': '12.4K', 'Likes': '310' }),
  row({ 'Tweet ID': '1002', 'Posted At': '2026-08-08T14:47:00.000Z', 'Type': 'repost', 'Author': '@AlphaTownFC', 'Text': 'HT | Alpha 1-0 Beta', 'Media': 'image', 'Views': '9,000' }),
  row({ 'Tweet ID': '1003', 'Posted At': '2026-08-08T16:52:00.000Z', 'Type': 'repost', 'Author': 'BetaUtd', 'Text': 'FULL-TIME: Beta 2-2 Gamma', 'Media': 'image', 'Views': '40000' }),
  row({ 'Tweet ID': '1004', 'Posted At': '2026-08-09T09:00:00.000Z', 'Text': 'Read the round-up', 'Link URL': 'https://www.thenationalleague.org.uk/news/123', 'Views': '3000' }),
  row({ 'Tweet ID': '1005', 'Posted At': '2026-08-11T18:30:00.000Z', 'Text': 'What a strike', 'Media': 'video', 'Views': '5000' })
];

function parse(rows) { return S.normaliseX(rows); }

test('columns are read by alias and unknown ones are reported, not dropped silently', () => {
  const p = parse([Object.assign(row({ 'Tweet ID': '1', 'Posted At': '2026-08-08T13:05:00Z' }), { 'Mystery': 'x' })]);
  assert.deepEqual(plain(p.missing), []);
  assert.ok(p.columns.unrecognised.includes('Mystery'));
  assert.ok(p.columns.recognised.some((r) => r.startsWith('Tweet ID')));
});

test('a file with no ID or no time column is refused before anything is planned', () => {
  const p = parse([{ Text: 'hello', Views: '1' }]);
  assert.equal(p.posts.length, 0);
  assert.equal(p.missing.length, 2);
});

test('times become London wall-clock, including across BST', () => {
  assert.equal(S.toLondon('2026-08-08T13:05:00.000Z'), '2026-08-08 14:05');
  assert.equal(S.toLondon('2026-12-05T15:00:00.000Z'), '2026-12-05 15:00');
  assert.equal(S.londonToIso('2026-08-08 14:05'), '2026-08-08T13:05:00.000Z');
  assert.equal(S.parseWhen('08/08/2026 14:05'), '2026-08-08T13:05:00.000Z');
});

test('numbers accept K/M suffixes and thousands separators', () => {
  assert.equal(S.parseNumber('12.4K'), 12400);
  assert.equal(S.parseNumber('1,234'), 1234);
  assert.equal(S.parseNumber('2M'), 2000000);
  assert.equal(S.parseNumber(''), null);
});

test('reposts are keyed rt_<id>, marked not own, and carry the original time flag', () => {
  const p = parse(SAMPLE).posts;
  const rt = p.find((x) => x.id === '1002');
  assert.equal(S.postKey(rt), 'rt_1002');
  assert.equal(rt.isOwn, false);
  assert.equal(rt.timeIsOriginal, true);
  assert.equal(rt.author, 'AlphaTownFC');
  assert.equal(S.postKey(p[0]), '1001');
});

test('an rt_ key column or a status URL also yields the right ID', () => {
  const p = parse([
    { key: 'rt_77', url: '', time: '2026-08-08T13:05:00Z' },
    { key: '', url: 'https://x.com/a/status/88', time: '2026-08-08T13:05:00Z' }
  ]).posts;
  assert.equal(p[0].kind, 'repost');
  assert.equal(S.postKey(p[0]), 'rt_77');
  assert.equal(p[1].id, '88');
});

test('default rules: TOTW, HT, FT, website share, DAZN-less video falls to reactive', () => {
  const p = parse(SAMPLE).posts;
  const cat = (id) => S.categorise(p.find((x) => x.id === id), RULES).category;
  assert.equal(cat('1001'), 'TOTW');
  assert.equal(cat('1002'), 'HT graphic');
  assert.equal(cat('1003'), 'FT graphic');
  assert.equal(cat('1004'), 'Website share');
  assert.equal(cat('1005'), 'Reactive');
});

test('keywords match whole words, so "ht" does not fire on "that"', () => {
  const post = { isOwn: false, kind: 'repost', text: 'that was close', media: 'image' };
  assert.equal(S.categorise(post, RULES).category, 'Other reshare');
});

test('importing the same file twice changes nothing but metrics', () => {
  const posts = parse(SAMPLE).posts;
  const first = S.planImport(posts, {}, { month: '2026-08', rules: RULES, now: 'T1' });
  assert.equal(first.stats.created, 5);
  /* Store exactly what the first import wrote. */
  const stored = JSON.parse(JSON.stringify(first.updates));
  const again = S.planImport(parse(SAMPLE).posts, stored, { month: '2026-08', rules: RULES, now: 'T2' });
  assert.equal(again.stats.created, 0);
  assert.equal(again.stats.updated, 0);
  assert.equal(again.stats.unchanged, 5);
  assert.deepEqual(plain(again.updates), {});

  const bumped = SAMPLE.map((r) => r['Tweet ID'] === '1001' ? Object.assign({}, r, { Views: '15K' }) : r);
  const third = S.planImport(parse(bumped).posts, stored, { month: '2026-08', rules: RULES, now: 'T3' });
  assert.equal(third.stats.updated, 1);
  assert.deepEqual(plain(Object.keys(third.updates).sort()), ['1001/metrics', '1001/metricsAt']);
  assert.equal(third.updates['1001/metrics'].views, 15000);
});

test('a manually set category survives a re-import and a rules re-run', () => {
  const posts = parse(SAMPLE).posts;
  const stored = JSON.parse(JSON.stringify(S.planImport(posts, {}, { month: '2026-08', rules: RULES, now: 'T1' }).updates));
  stored['1005'].category = 'Goal clip';
  stored['1005'].categoryManual = true;
  const again = S.planImport(parse(SAMPLE).posts, stored, { month: '2026-08', rules: RULES, now: 'T2' });
  assert.ok(!('1005/category' in again.updates));
  const rerun = S.planRerun(stored, RULES);
  assert.ok(!('1005/category' in rerun.updates));

  /* And proof the guard is what holds it: unset the flag and it moves. */
  stored['1005'].categoryManual = false;
  assert.equal(S.planRerun(stored, RULES).updates['1005/category'], 'Reactive');
});

test('own posts outside the month are skipped; reposts dated earlier are kept', () => {
  const rows = [
    row({ 'Tweet ID': '1', 'Posted At': '2026-09-01T09:00:00Z' }),
    row({ 'Tweet ID': '2', 'Posted At': '2026-07-30T09:00:00Z', 'Type': 'repost' })
  ];
  const plan = S.planImport(parse(rows).posts, {}, { month: '2026-08', rules: RULES });
  assert.equal(plan.stats.outside, 1);
  assert.ok(plan.updates['rt_2']);
  assert.ok(!plan.updates['1']);
});

test('reshare views never reach a league total', () => {
  const posts = parse(SAMPLE).posts;
  const s = S.summarise(posts);
  assert.equal(s.own, 3);
  assert.equal(s.reshares, 2);
  assert.equal(s.ownViews, 12400 + 3000 + 5000);
  assert.equal(s.medianViews, 5000);
  assert.ok(S.topOwn(posts, 5).every((p) => p.isOwn));
});

test('daily counts split own from reshares by London date', () => {
  const posts = parse(SAMPLE).posts;
  const d = S.dailyCounts(posts, '2026-08');
  assert.equal(d.days.length, 31);
  assert.deepEqual(plain([d.days[7].own, d.days[7].reshare]), [1, 2]);
  assert.equal(d.days[7].dow, 6);
  assert.equal(d.undated, 0);
});

test('matchday profile finds the Saturday from its HT/FT posts and slots by 15 minutes', () => {
  const posts = parse(SAMPLE).posts.map((p) => Object.assign(p, S.categorise(p, RULES)));
  const m = S.matchdayProfile(posts, '2026-08');
  assert.deepEqual(plain(m.sat.days), ['2026-08-08']);
  assert.equal(m.mid.days.length, 0);
  /* 15:47 London -> slot 63; 17:52 -> slot 71; TOTW at 14:05 -> slot 56 (own). */
  assert.equal(m.sat.reshare[63], 1);
  assert.equal(m.sat.reshare[71], 1);
  assert.equal(m.sat.own[56], 1);
});

test('change line compares with the month before and copes with none', () => {
  const cur = { total: 10, own: 6, reshares: 4, medianViews: 900 };
  const prev = { total: 8, own: 4, reshares: 4, medianViews: 1000 };
  assert.equal(S.changeLine('X', cur, prev), 'X: Own posts up 50% (4 → 6); median views down 10% (1,000 → 900); reshares level.');
  assert.match(S.changeLine('X', cur, null), /No figures for the month before/);
  assert.match(S.changeLine('X', { total: 0 }, prev), /nothing imported/);
});

test('months run newest first and wrap the year', () => {
  assert.deepEqual(plain(S.monthsFrom('2025-11', '2026-02')), ['2026-02', '2026-01', '2025-12', '2025-11']);
  assert.equal(S.monthLabel('2026-08'), 'August 2026');
});

test('rows from other months are rejected and counted per month as overspill', () => {
  const rows = [
    row({ 'Tweet ID': '1', 'Posted At': '2026-08-10T09:00:00Z' }),
    row({ 'Tweet ID': '2', 'Posted At': '2026-09-01T09:00:00Z' }),
    row({ 'Tweet ID': '3', 'Posted At': '2026-09-02T09:00:00Z' }),
    row({ 'Tweet ID': '4', 'Posted At': '2026-07-31T09:00:00Z' })
  ];
  const plan = S.planImport(parse(rows).posts, {}, { month: '2026-08', rules: RULES });
  assert.deepEqual(plain(plan.overspill), { '2026-09': 2, '2026-07': 1 });
  assert.deepEqual(plain(Object.keys(plan.updates)), ['1']);
});

test('a multi-month file cannot carry one month\'s reshares into another', () => {
  /* Own posts in August and September, and an August-dated reshare. Imported
     as September, the reshare is August's and must not be carried. */
  const rows = [
    row({ 'Tweet ID': '1', 'Posted At': '2026-08-10T09:00:00Z' }),
    row({ 'Tweet ID': '2', 'Posted At': '2026-09-10T09:00:00Z' }),
    row({ 'Tweet ID': '3', 'Posted At': '2026-08-15T14:47:00Z', 'Type': 'repost' })
  ];
  const sep = S.planImport(parse(rows).posts, {}, { month: '2026-09', rules: RULES });
  assert.ok(!sep.updates['rt_3']);
  assert.equal(sep.stats.carried, 0);
  const aug = S.planImport(parse(rows).posts, {}, { month: '2026-08', rules: RULES });
  assert.ok(aug.updates['rt_3']);
});

test('a single-month file still carries a reshare of an older post', () => {
  const rows = [
    row({ 'Tweet ID': '1', 'Posted At': '2026-08-10T09:00:00Z' }),
    row({ 'Tweet ID': '9', 'Posted At': '2026-07-20T09:00:00Z', 'Type': 'repost' })
  ];
  const plan = S.planImport(parse(rows).posts, {}, { month: '2026-08', rules: RULES });
  assert.ok(plan.updates['rt_9']);
  assert.equal(plan.stats.carried, 1);
});

test('gaps list empty days and days with reshares but no own post', () => {
  const plan = S.planImport(parse(SAMPLE).posts, {}, { month: '2026-08', rules: RULES });
  /* SAMPLE has posts on 08, 09 and 11 August, all with an own post. */
  assert.equal(plan.gaps.empty.length, 28);
  assert.ok(plan.gaps.empty.includes('2026-08-10'));
  assert.equal(plan.gaps.noOwn.length, 0);
  const onlyRs = S.planImport(parse([row({ 'Tweet ID': '5', 'Posted At': '2026-08-20T09:00:00Z', 'Type': 'repost' })]).posts, {}, { month: '2026-08', rules: RULES });
  assert.deepEqual(plain(onlyRs.gaps.noOwn), ['2026-08-20']);
});

test('gaps count what is already stored, so a month can be loaded in parts', () => {
  const first = parse([row({ 'Tweet ID': '1', 'Posted At': '2026-08-01T09:00:00Z' })]).posts;
  const stored = JSON.parse(JSON.stringify(S.planImport(first, {}, { month: '2026-08', rules: RULES }).updates));
  const second = parse([row({ 'Tweet ID': '2', 'Posted At': '2026-08-02T09:00:00Z' })]).posts;
  const plan = S.planImport(second, stored, { month: '2026-08', rules: RULES });
  assert.ok(!plan.gaps.empty.includes('2026-08-01'));
  assert.ok(!plan.gaps.empty.includes('2026-08-02'));
  assert.equal(plan.gaps.empty.length, 29);
});

test('known scraper columns the tool does not use are ignored, not reported as Not read', () => {
  const p = parse([Object.assign(row({ 'Tweet ID': '1', 'Posted At': '2026-08-08T13:05:00Z' }),
    { repostedBy: '', hashtags: '', scrapedAt: '2026-10-16T15:12:21.862Z', mode: 'own', Mystery: 'x' })]);
  assert.deepEqual(plain(p.columns.ignored), ['repostedBy', 'mode']);
  assert.deepEqual(plain(p.columns.unrecognised), ['Mystery']);
});

test('rule lists split on commas or semicolons', () => {
  assert.deepEqual(plain(S.listOf('half-time; ht, half time')), ['half-time', 'ht', 'half time']);
});

test('mentions, hashtags, reply and quote targets are kept; scrapedAt becomes metricsAt', () => {
  const r = Object.assign(row({ 'Tweet ID': '1', 'Posted At': '2026-08-01T07:48:00.000Z', 'Views': '8530' }),
    { mentions: "'@altrinchamfc @DAZN_NationalLg", hashtags: '#TOTW', replyTo: "'@NL_Enterprise", quotedAuthor: '',
      scrapedAt: '2026-10-16T15:12:21.862Z' });
  const p = parse([r]).posts[0];
  assert.deepEqual(plain(p.mentions), ['altrinchamfc', 'DAZN_NationalLg']);
  assert.deepEqual(plain(p.hashtags), ['TOTW']);
  assert.equal(p.replyTo, 'NL_Enterprise');
  assert.equal(p.quotedAuthor, undefined);
  const plan = S.planImport([p], {}, { month: '2026-08', rules: RULES, now: 'IMPORT' });
  assert.equal(plan.updates['1'].metricsAt, '2026-10-16T15:12:21.862Z');
});

test('a re-import fills mentions into posts stored without them, and never overwrites', () => {
  const r = Object.assign(row({ 'Tweet ID': '1', 'Posted At': '2026-08-01T07:48:00.000Z' }), { mentions: "'@a" });
  const stored = { '1': { id: '1', postedAtLocal: '2026-08-01 08:48', isOwn: true, kind: 'original', category: 'Reactive', plannerType: 'reactive' } };
  const plan = S.planImport(parse([r]).posts, stored, { month: '2026-08', rules: RULES });
  assert.deepEqual(plain(plan.updates['1/mentions']), ['a']);
  stored['1'].mentions = ['b'];
  const again = S.planImport(parse([r]).posts, stored, { month: '2026-08', rules: RULES });
  assert.ok(!('1/mentions' in again.updates));
});
