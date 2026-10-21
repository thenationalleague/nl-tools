/* The helplines on the page and the helplines on the poster are ONE list.

   They were not. The poster carried its own hardcoded copy, and by the time
   anyone looked the two had already drifted: Mind's number was on the website
   and missing from the printed sheet, and a number changing would have had to
   be edited in two places with nothing to say so.

   A wrong number on a wellbeing poster is the worst failure this repo can
   ship — it is pinned to a wall, nobody re-reads it, and the person dialling
   it needs it to work. So this file checks the thing that actually matters:
   every number reaches every surface it claims to, and no surface invents one.

   Run with `npm test`. Zero dependencies. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { REPO } from './load-canon.mjs';

const content = JSON.parse(
  readFileSync(join(REPO, 'wellbeing-hub/_src/content.json'), 'utf8'));
const EDITIONS = JSON.parse(execFileSync(
  'python3', ['-I', 'scripts/build-wellbeing-hub.py', '--editions'],
  { cwd: REPO, encoding: 'utf8' }));

const SURFACES = ['page', 'poster'];
const file = (slug, surface) => readFileSync(
  join(REPO, slug, surface === 'page' ? 'index.html' : 'poster.html'), 'utf8');

/* A helpline belongs on BOTH surfaces. Anything else is an exception and has
   to be named here, with its reason — not just quietly left out of `on` in
   the content file, which is how Mind's number came to be on the website and
   missing from the printed sheet in the first place.

   Declaring deviations in the guard rather than in the data is the same
   arrangement as system/_template/.lint-waivers: the absence has to be
   argued for somewhere a reviewer will see it. */
const SURFACE_EXCEPTIONS = {
  /* The page says 999 seven times already — the urgent banner and across the
     crisis pages — so a fifth tile repeating it in the numbers grid would be
     noise. A printed sheet has no banner, so there it leads. */
  Emergency: ['poster'],
};

test('a helpline is on both surfaces unless the exception is declared here', () => {
  for (const q of content.quick) {
    const expected = SURFACE_EXCEPTIONS[q.name] || SURFACES;
    assert.deepEqual(
      [...q.on].sort(), [...expected].sort(),
      `${q.name} is set to appear on [${q.on}] but this test expects ` +
      `[${expected}]. If dropping it from a surface is deliberate, add it to ` +
      'SURFACE_EXCEPTIONS with the reason — do not just edit the content file, ' +
      'which is how Mind came to be missing from the poster.');
  }
});

test('every helpline declares a name, a number and where it appears', () => {
  for (const q of content.quick) {
    for (const k of ['name', 'value', 'note', 'poster', 'on']) {
      assert.ok(q[k], `helpline ${q.name || '?'} is missing "${k}"`);
    }
    assert.ok(q.on.length, `${q.name} appears on no surface at all`);
    for (const s of q.on) {
      assert.ok(SURFACES.includes(s), `${q.name} claims unknown surface "${s}"`);
    }
  }
});

test('there is only one list — no second copy left in the generator', () => {
  /* The hardcoded POSTER_NUMS is what caused the drift. If it ever comes
     back, the two surfaces can disagree again without anything failing. */
  const gen = readFileSync(join(REPO, 'scripts/build-wellbeing-hub.py'), 'utf8');
  assert.ok(!gen.includes('POSTER_NUMS'),
    'POSTER_NUMS is back — the poster has its own copy of the helplines again');
});

for (const ed of EDITIONS) {
  for (const surface of SURFACES) {
    test(`${ed.key} ${surface}: carries exactly the helplines it should`, () => {
      const html = file(ed.slug, surface);
      /* Comments quote old copy and would mask a missing number. */
      const body = html.replace(/<!--[\s\S]*?-->/g, '');

      for (const q of content.quick) {
        const wanted = q.on.includes(surface);
        const present = body.includes(q.value);
        if (wanted) {
          assert.ok(present,
            `${q.name} (${q.value}) is marked for the ${surface} but is not on it`);
        }
        /* Not asserting absence: 999 is marked poster-only yet appears all
           over the page's crisis copy, which is correct and deliberate. The
           risk being guarded is a number MISSING, not one appearing twice. */
      }
    });
  }
}

test('999 stays on both posters', () => {
  /* Named explicitly rather than left to the loop above. It is the number
     that matters most on a sheet pinned to a dressing-room wall, and it is
     the one most easily lost, because it is the only entry the page does not
     show in its own grid. */
  for (const ed of EDITIONS) {
    const body = file(ed.slug, 'poster').replace(/<!--[\s\S]*?-->/g, '');
    assert.match(body, /<b>999<\/b>/,
      `999 is not in ${ed.slug}'s poster helpline block`);
  }
});

test('the page and the poster agree on every number they share', () => {
  /* The wording differs by design — the page leads with the name, the sheet
     leads with the number — but the digits must not. */
  for (const ed of EDITIONS) {
    const page = file(ed.slug, 'page');
    const poster = file(ed.slug, 'poster');
    for (const q of content.quick) {
      if (q.on.includes('page') && q.on.includes('poster')) {
        assert.ok(page.includes(q.value) && poster.includes(q.value),
          `${q.name} (${q.value}) is on one surface of ${ed.slug} but not the other`);
      }
    }
  }
});
