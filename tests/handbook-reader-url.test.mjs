/* The handbook reader's URL, and the page every wrong URL lands on.

   Reported live, 22/08/2026: /handbook/reader/ returned a 404.

   Not weird once you look at the layout. reader.html was a FILE, so there was
   no directory index behind the trailing slash — the one form a person is
   most likely to type, and a mail client most likely to linkify, on a page
   handed to 72 clubs. Every other page in the estate is a directory with an
   index; this was the exception. Richard: "surely we want index.html
   everywhere no?"

   So the page moved and the old address became a signpost, because clubs
   already hold /handbook/reader.html in emails and bookmarks — a tidy-up
   that breaks the URL people have is not a tidy-up.

     /handbook/reader.html   the stub, redirects
     /handbook/reader        Pages resolves it to one of the two; both arrive
     /handbook/reader/       the page

   And there is a 404 page now, which there was not — so a wrong address
   showed GitHub's own, which to a club reads as the site being down rather
   than one link being wrong. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const PAGE = join(REPO, 'handbook/reader/index.html');
const STUB = readFileSync(join(REPO, 'handbook/reader.html'), 'utf8');
const NOTFOUND = readFileSync(join(REPO, '404.html'), 'utf8');

/* ------------------------------------------------------------- the reader */

test('the reader is a directory with an index, like everything else', () => {
  assert.ok(existsSync(PAGE));
  const src = readFileSync(PAGE, 'utf8');
  assert.match(src, /File: \/handbook\/reader\/index\.html/,
    'and the header says where it lives');
  /* It is the real page, not a second copy of the signpost. */
  assert.match(src, /codeGate/, 'the club-code gate travelled with it');
});

test('the old address still works', () => {
  /* Clubs hold /handbook/reader.html in emails, bookmarks and whatever they
     have pasted into their own systems. */
  assert.match(STUB, /location\.replace\('\/handbook\/reader\/' \+ location\.search \+ location\.hash\)/);
  assert.match(STUB, /http-equiv="refresh" content="0; url=\/handbook\/reader\/"/,
    'the no-JS floor');
  assert.match(STUB, /<a href="\/handbook\/reader\/">/, 'and the floor under that');
});

test('the redirect carries the fragment', () => {
  /* THE POINT. The reader deep-links clauses as #<area>/<nodeId> — that is
     how one person sends another a rule — so a redirect that dropped the
     fragment would land every shared clause link on the cover. Not a smaller
     bug than the 404, only a quieter one. */
  assert.match(STUB, /location\.hash/);
  /* replace, not assign: Back should go where the reader came from rather
     than bouncing through the stub and forward again. */
  assert.ok(!/location\.href\s*=/.test(STUB));
});

test('the stub is a signpost, not a second reader', () => {
  /* Two copies of one page at two URLs is the drift this repo keeps undoing.
     The stub reads nothing and gates nothing — the gate is on the page. */
  assert.ok(!/firebase/i.test(STUB));
  assert.ok(!/codeGate/.test(STUB));
  assert.match(STUB, /rel="canonical" href="https:\/\/nl\.tools\/handbook\/reader\/"/,
    'and it points at the page, not at itself');
  assert.match(STUB, /name="robots" content="noindex, follow"/);
});

/* ----------------------------------------------------------------- the 404 */

test('a wrong address gets an NL page, not GitHub’s', () => {
  assert.match(NOTFOUND, /class="nl-idbar nl-idbar--open"/,
    'the navy bar: by canon it means nobody was asked who you are, which is a 404');
  assert.match(NOTFOUND, /Page not found/);
  assert.match(NOTFOUND, /href="\/"/, 'a door for staff');
  assert.match(NOTFOUND, /href="\/handbook\/reader\/"/, 'and one for clubs');
});

test('every reference on the 404 is absolute', () => {
  /* Pages serves this one file for /x, /a/b/c and everything below, so a
     relative reference would resolve against whatever path the visitor got
     wrong — the stylesheet would 404 on the 404. */
  const refs = [...NOTFOUND.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 4, 'there are references to check');
  for (const r of refs) {
    assert.ok(/^(\/|https?:|data:|#)/.test(r), `${r} is not absolute`);
  }
});

test('the 404 does not put the URL back into the page as markup', () => {
  /* A path is attacker-controlled by definition: anyone can put anything in a
     URL and send it to somebody. */
  assert.match(NOTFOUND, /getElementById\('nfUrl'\)\.textContent =/);
  /* Comments stripped: the page explains in prose which of the two it uses
     and why, and a guard that fires on its own rationale is a guard somebody
     switches off. */
  const code = NOTFOUND.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/innerHTML/.test(code));
});
