/* The two ungated pages, and the promises they make.

   club-directory/public and handbook/public open cold — no account, no code,
   no Firebase Auth. Everything they show is world-readable by design, so what
   is worth pinning is not that they work but that they cannot start showing
   MORE than was agreed:

     · the withheld contact details are absent from what the page is sent, not
       hidden by the page. That guarantee lives in the editor's publish step
       and in the rules, and both are asserted here.
     · no rule opens a node that returns more than one club at a time.
     · neither page is indexable.

   The rendering itself is checked in a browser, not here — a Node test cannot
   see a clipped band or an unstyled control. What this file holds is the part
   that is a promise rather than a look. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const read = (p) => readFileSync(join(REPO, p), 'utf8');
const DIR = read('club-directory/public/index.html');
const HB = read('handbook/public/index.html');
const RULES = JSON.parse(read('system/rtdb/rules.snapshot.json'));
const PUB = RULES.rules['app-data']['ops-club-directory'].published;

/* Both files explain the reasoning at length and would match every pattern
   below; a guard that fires on its own rationale is a guard somebody switches
   off. */
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const DIRCODE = strip(DIR);
const HBCODE = strip(HB);

/* ------------------------------------------------------------ the rules */

test('a club can be read without signing in — and only one at a time', () => {
  /* THE SHAPE OF THE WHOLE THING. RTDB rules cascade DOWN, so opening
     $club leaves every parent shut: there is no single URL that hands over
     72 clubs' contact details as one JSON file. It is a speed bump and not a
     boundary — the club names are public, so 72 requests get the same data —
     but a bulk export anyone can take by accident is a different exposure
     from one that has to be built on purpose. */
  assert.equal(PUB.clubs.$club['.read'], true, 'one club is public');
  assert.equal(PUB.clubs['.read'], undefined, 'the whole clubs node is NOT');
  assert.notEqual(PUB['.read'], true, 'the whole published node is NOT');
  assert.match(PUB['.read'], /auth != null/, 'the parent still wants a session');
});

test('nothing but the published copy is opened', () => {
  /* published is a SECOND copy the editor builds to be handed over, with the
     withheld details removed rather than flagged. Opening any of these
     instead would be opening the directory itself. */
  const cd = RULES.rules['app-data']['ops-club-directory'];
  for (const node of ['clubs', 'config', 'editions', 'provenance', 'undo', 'bake', 'audit']) {
    const r = JSON.stringify(cd[node] || {});
    assert.ok(!/"\.read":\s*true/.test(r), `${node} must not be world-readable`);
  }
  assert.equal(cd.config['.read'], false, 'the codes stay unreadable');
});

test('the stamp leaves are the only other thing open', () => {
  const open = Object.keys(PUB).filter((k) => PUB[k] && PUB[k]['.read'] === true);
  assert.deepEqual(open.sort(), ['at', 'label'],
    'only the publish stamp; anything else here is a new decision');
});

test('the withheld details are removed at PUBLISH, not hidden at render', () => {
  /* The load-bearing half. A page that fetched everything and declined to
     draw some of it would have already sent it. PUB_PERSON is the allowlist
     and the emails/phones are filtered behind !p.hideContact. */
  const ed = read('club-directory/editor/index.html');
  assert.match(ed, /var PUB_PERSON = \[/, 'the published person is an allowlist');
  assert.ok(!/'emails'|'phones'/.test(ed.slice(ed.indexOf('var PUB_PERSON'), ed.indexOf('function publishablePerson'))),
    'contacts are not in the allowlist — they are added under a condition');
  const fn = ed.slice(ed.indexOf('function publishablePerson('));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.match(body, /if \(!p\.hideContact\)/, 'a fully-withheld person carries no channel at all');
  assert.match(body, /ownHide\(e\)/, 'and a single withheld address is dropped on its own');
});

/* ------------------------------------------------------------ the pages */

test('neither page loads Firebase Auth', () => {
  /* An "ungated" page that loads the auth SDK acquires an anonymous user per
     visitor, and a rule of `auth != null` behind that admits everybody
     anyway — the canon's own warning at NL.codeGate. */
  for (const [name, src] of [['club-directory/public', DIRCODE], ['handbook/public', HBCODE]]) {
    assert.ok(!/firebase-auth-compat/.test(src), `${name} pulls in the auth SDK`);
  }
  /* The handbook one reads nothing from the database at all: the PDF and the
     meta beside it are static files already served publicly. */
  assert.ok(!/firebase/i.test(HBCODE), 'handbook/public touches no Firebase');
});

test('the public directory shows the same view a club gets of another club', () => {
  assert.match(DIRCODE, /renderClub\(rec, \{ showQuiet: false \}\)/,
    '"Not published" and "None held" announce there is something to ask for');
});

test('the public directory never asks for more than one club', () => {
  assert.match(DIRCODE, /published\/clubs\/' \+ encodeURIComponent\(name\)/);
  /* A people search would mean holding the whole directory, which is the one
     thing this page is built not to do. The box filters club names, from
     clubs-meta, with no database behind it. */
  assert.ok(!/NLDirectory\.search\(/.test(DIRCODE), 'no people search on the public page');
  const refs = [...DIRCODE.matchAll(/ref\(ROOT \+ '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(refs.sort(), ['/published/at', '/published/clubs/'],
    'the stamp and one named club — anything else is a wider read');
});

test('both pages are noindex, and not by robots.txt', () => {
  for (const [name, src] of [['club-directory/public', DIR], ['handbook/public', HB]]) {
    assert.match(src, /<meta name="robots" content="noindex, nofollow">/, `${name} is not noindex`);
  }
  const headers = read('_headers');
  for (const p of ['/club-directory/public/*', '/handbook/public/*', '/handbook/handbook.pdf']) {
    assert.ok(headers.includes(p), `_headers has no entry for ${p}`);
  }
  /* DELIBERATELY ABSENT. A path disallowed in robots.txt cannot be crawled,
     so the crawler never reads the noindex — and Google will still list a
     disallowed URL as a bare link when something points at it. Blocking the
     crawler is what keeps a page IN the index. */
  let robots = null;
  try { robots = read('robots.txt'); } catch (e) { /* the correct state */ }
  if (robots !== null) {
    assert.ok(!/Disallow:\s*\/(club-directory|handbook)/.test(robots),
      'a Disallow here would stop the crawler ever reading the noindex');
  }
});

test('nothing sits under either topbar title', () => {
  for (const [name, src] of [['club-directory/public', DIR], ['handbook/public', HB]]) {
    assert.ok(!/nl-idbar__sub/.test(src), `${name} still carries a sub-line`);
  }
});

/* ------------------------------------------------------- the shared wall */

test('the wall is written once, and both pages ask for it', () => {
  /* Promoted to _directory.* on its second use. Two copies would have agreed
     today and disagreed about a club's colours by Christmas, which is the one
     thing that file exists to answer once. */
  const js = read('club-directory/_directory.js');
  const css = read('club-directory/_directory.css');
  assert.match(js, /renderIndex: renderIndex,/);
  assert.match(js, /wireIndex: wireIndex,/);
  assert.match(css, /\.rd-tile__band \{/, 'the wall styles moved with it');
  for (const p of ['club-directory/reader/index.html', 'club-directory/public/index.html']) {
    assert.match(read(p), /NLDirectory\.renderIndex\(/, `${p} draws its own wall`);
  }
  /* The reader's inline copy is gone, not shadowing the shared one. */
  const rd = read('club-directory/reader/index.html');
  assert.ok(!/\.rd-tile__band \{/.test(rd), 'the reader still has its own band CSS');
  assert.ok(!/function tileStyle/.test(rd), 'the reader still has its own tileStyle');
  assert.ok(!/function isWhiteGround/.test(rd), 'the reader still has its own isWhiteGround');
});

test('every consumer of _directory.* moved to the same version', () => {
  /* Same rule as the canon `?v=`: a bump means the shared file changed, and a
     page left behind loads a wall whose CSS it does not have. */
  const seen = new Set();
  for (const p of ['club-directory/index.html', 'club-directory/editor/index.html',
    'club-directory/reader/index.html', 'club-directory/public/index.html']) {
    for (const m of read(p).matchAll(/_directory\.(?:css|js)\?v=(\d+)/g)) seen.add(m[1]);
  }
  assert.equal(seen.size, 1, `mixed versions across the family: ${[...seen].join(', ')}`);
});
