/* The handbook reader's URL forms.

   Reported live, 22/08/2026: /handbook/reader/ returned a 404.

   Not weird once you look at the layout. reader.html is a FILE. GitHub Pages
   serves it at /handbook/reader.html and, resolving an extensionless path to
   the .html beside it, at /handbook/reader. A TRAILING SLASH asks for a
   directory index, and there was none — so the one form a person is most
   likely to type, and a mail client most likely to linkify, was the one that
   failed, on a page handed out to 72 clubs.

   The directory index exists now and does nothing but send you next door. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const REDIRECT = join(REPO, 'handbook/reader/index.html');

test('a trailing slash resolves', () => {
  assert.ok(existsSync(REDIRECT), '/handbook/reader/ has an index');
  /* And the page it points at is still there. A redirect to a file somebody
     later moved is a 404 with an extra hop. */
  assert.ok(existsSync(join(REPO, 'handbook/reader.html')));
});

test('the redirect carries the fragment', () => {
  /* THE POINT OF THE FIX. The reader deep-links clauses as #<area>/<nodeId> —
     that is how one person sends another a rule — so a redirect that dropped
     the fragment would land every shared clause link on the cover. That is
     not a smaller bug than the 404, only a quieter one. */
  const src = readFileSync(REDIRECT, 'utf8');
  assert.match(src, /location\.replace\('\/handbook\/reader\.html' \+ location\.search \+ location\.hash\)/);
  /* replace, not assign: Back should go where the reader came from rather
     than bouncing through here and forward again. */
  assert.ok(!/location\.href\s*=/.test(src));
});

test('it still works with no JavaScript', () => {
  /* Neither fallback can carry a fragment — meta refresh and a plain href
     both drop it — so they are the floor, not the mechanism. */
  const src = readFileSync(REDIRECT, 'utf8');
  assert.match(src, /http-equiv="refresh" content="0; url=\/handbook\/reader\.html"/);
  assert.match(src, /<a href="\/handbook\/reader\.html">/);
});

test('the signpost is not the page', () => {
  /* Two copies of the handbook reader at two URLs is the drift this repo
     keeps having to undo. This file is 60 lines of signpost: no Firebase, no
     club-code gate, no handbook content, and nothing for a search engine. */
  const src = readFileSync(REDIRECT, 'utf8');
  assert.ok(!/firebase/i.test(src), 'it reads nothing');
  assert.ok(!/codeGate/.test(src), 'and gates nothing — the gate is on the reader');
  assert.match(src, /rel="canonical" href="https:\/\/nl\.tools\/handbook\/reader\.html"/);
  assert.match(src, /name="robots" content="noindex, follow"/);
});
