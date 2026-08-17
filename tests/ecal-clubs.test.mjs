/* eCal club map tests — clubs-meta.json is the single source of truth for
   every club's eCal widget id, and two eCal builds carry their own copy of it:

     ecal/nl-ecal-splash.js    the site-wide interstitial (loaded via GTM)
     ecal/nl-ecal-banner.html  the advert block, pasted into the Urban Zoo CMS

   Neither can read clubs-meta at runtime cheaply: they run on
   thenationalleague.org.uk while clubs-meta lives on nl.tools, so it is a
   cross-origin fetch of a 151K file to obtain 72 short ids — latency and a CORS
   dependency for no gain. The copies stay, and these tests make them
   unmergeable if they drift.

   That is the whole point. The two maps agree today; the failure mode is the
   day a club is promoted, relegated or reissued an id, somebody updates
   clubs-meta (the obvious place), and the eCal builds carry on serving the old
   value in silence — no error, no lint failure, just the wrong club's fixtures
   syncing to a fan's calendar. This estate has shipped that exact bug before
   (club-news served April headlines until August; tools/ops-estate held a stale
   registry copy for weeks). A failing test is how it gets caught in the PR
   instead of in someone's calendar. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const meta = JSON.parse(readFileSync(join(REPO, 'assets/data/clubs-meta.json'), 'utf8'));

/* name -> widget id for the CURRENT SEASON's clubs, from the source of truth.
   Scoped to the season on purpose: clubs-meta keeps departed clubs (82 records
   against 72 in the league) and those correctly have no eCal calendar. Keying
   off seasons.current means the test maintains itself — promote a club and it
   fails until that club has an id and both builds carry it; relegate one and it
   fails until both builds drop it. */
const season = String(meta.seasons.current);
const currentClubs = meta.clubs.filter((c) => season in (c.seasons || {}));

const truth = new Map();
for (const club of currentClubs) {
  const id = club?.ecal?.widget_id;
  if (id) truth.set(club.name, id);
}

/* Pull the "Club Name":"24-hex-id" pairs out of an eCal build's CLUBS literal. */
function mapFromSource(relPath) {
  const src = readFileSync(join(REPO, relPath), 'utf8');
  const body = src.slice(src.indexOf('var CLUBS'), src.indexOf('};', src.indexOf('var CLUBS')));
  const pairs = [...body.matchAll(/"([^"]+)"\s*:\s*"([0-9a-f]{24})"/g)];
  return new Map(pairs.map(([, name, id]) => [name, id]));
}

const BUILDS = [
  ['ecal/nl-ecal-splash.js', 'splash'],
  ['ecal/nl-ecal-banner.html', 'banner'],
];

test('every current-season club has an eCal widget id', () => {
  const without = currentClubs.filter((c) => !c?.ecal?.widget_id).map((c) => c.name);
  assert.deepEqual(without, [],
    `in the ${season} season but missing ecal.widget_id: ${without.join(', ')}`);
  assert.ok(truth.size >= 70, `expected the full club list, got ${truth.size}`);
});

test('no departed club is still carrying an eCal widget id', () => {
  const stale = meta.clubs
    .filter((c) => !(season in (c.seasons || {})) && c?.ecal?.widget_id)
    .map((c) => c.name);
  assert.deepEqual(stale, [],
    `out of the league but still holding an eCal calendar: ${stale.join(', ')}`);
});

test('every eCal widget id in clubs-meta is a 24-char hex id', () => {
  const bad = [...truth].filter(([, id]) => !/^[0-9a-f]{24}$/.test(id));
  assert.deepEqual(bad, [], `malformed widget ids: ${JSON.stringify(bad)}`);
});

for (const [path, label] of BUILDS) {
  test(`${label}: club map matches clubs-meta exactly`, () => {
    const built = mapFromSource(path);

    assert.ok(built.size > 0, `${path}: no CLUBS map found — has the literal moved?`);

    /* Same club set, both directions. A club added to clubs-meta and forgotten
       here is the promotion case; one left here after leaving clubs-meta is the
       relegation case. Both are drift and both fail. */
    const missing = [...truth.keys()].filter((n) => !built.has(n));
    const extra = [...built.keys()].filter((n) => !truth.has(n));
    assert.deepEqual(missing, [], `${path}: in clubs-meta but not in the map: ${missing.join(', ')}`);
    assert.deepEqual(extra, [], `${path}: in the map but not in clubs-meta: ${extra.join(', ')}`);

    /* Same ids. This is the one that catches a reissued widget id — the
       failure that is invisible at a glance because the club name still looks
       right. */
    const wrong = [...truth].filter(([n, id]) => built.get(n) !== id)
      .map(([n, id]) => `${n}: build has ${built.get(n)}, clubs-meta has ${id}`);
    assert.deepEqual(wrong, [], `${path}: widget id drift:\n  ${wrong.join('\n  ')}`);
  });
}

test('the splash and the banner agree with each other', () => {
  const [a, b] = BUILDS.map(([p]) => mapFromSource(p));
  const disagree = [...a].filter(([n, id]) => b.get(n) !== id)
    .map(([n, id]) => `${n}: splash ${id} vs banner ${b.get(n)}`);
  assert.deepEqual(disagree, [], `splash/banner disagree:\n  ${disagree.join('\n  ')}`);
});
