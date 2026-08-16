/* Brand canon tests — the rules in nl-brand.css that are invisible until they
   break in a browser, and that lint cannot see because lint checks wiring, not
   stylesheets. Run with `npm test` (node --test). Zero dependencies.

   Scope is deliberately narrow: contracts where a plausible, well-meant edit
   silently breaks rendering somewhere else. Layout and colour choices belong in
   the Style Guide and a human's eyes, not here. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const css = readFileSync(join(REPO, 'system/nl-brand.css'), 'utf8');

/* Everything after the opening block comment — the changelog at the top of the
   file talks about fill and stroke at length, and prose is not a rule. */
const rules = css.slice(css.indexOf('*/') + 2);

function ruleBody(selector) {
  const i = rules.indexOf('\n' + selector + ' {');
  assert.notEqual(i, -1, `${selector} is present in nl-brand.css`);
  return rules.slice(i, rules.indexOf('}', i));
}

test('.btn--icon exists and is square', () => {
  const body = ruleBody('.btn--icon');
  assert.match(body, /width:\s*30px/);
  assert.match(body, /height:\s*30px/);
  assert.match(body, /padding:\s*0/);
  assert.match(body, /justify-content:\s*center/);
});

/* The load-bearing one. The sprite carries stroked UI icons (fill:none,
   stroke:currentColor) and filled brand/match icons (fill:currentColor,
   stroke:none), each declared on the symbol. A wrapper that states either
   property flattens the other kind — a hand-rolled icon button that set
   stroke:none drew a completely invisible pencil on 05/08/2026. */
test('.btn--icon sets neither fill nor stroke, so both sprite families render', () => {
  const body = ruleBody('.btn--icon');
  assert.doesNotMatch(body, /(^|[;{\s])fill\s*:/, '.btn--icon must not set fill');
  assert.doesNotMatch(body, /(^|[;{\s])stroke\s*:/, '.btn--icon must not set stroke');
});

/* Same specificity (0,1,0), so source order decides. .btn--icon must come
   after .btn--sm or a combined .btn--sm.btn--icon gets text-button padding
   back and stops being square. */
test('.btn--icon is declared after .btn--sm', () => {
  assert.ok(
    rules.indexOf('\n.btn--icon {') > rules.indexOf('\n.btn--sm {'),
    '.btn--icon must follow .btn--sm in source order'
  );
});

/* .btn--icon carries no colours by design — it composes with these. If a
   colour variant is ever renamed, the composition promise breaks silently. */
test('.btn--icon composes with the existing colour variants', () => {
  for (const variant of ['.btn--primary', '.btn--navy', '.btn--ghost', '.btn--danger']) {
    assert.ok(rules.includes(variant), `${variant} still exists to compose with`);
  }
  const body = ruleBody('.btn--icon');
  assert.doesNotMatch(body, /(^|[;{\s])(background|color)\s*:/,
    '.btn--icon must not restate colours — that is the variant\'s job');
});

/* ── Entry route: the bar's colour says how you got in (v2.37) ─────────────
   These four tests are the whole rule. It is a promise made to a person who
   works across several of these pages — that they can tell, before reading a
   word, whether the page knows them by name, by code, or not at all. Nothing
   in a browser complains when it is broken, and it broke once already:
   vacancies/submit wore the signed-in staff bar on a public form.

   Red is reserved. If .nl-idbar ever gains --primary as a ground, an ungated
   page can look like an authenticated one, which is the failure this exists
   to prevent. */

test('.nl-idbar is white with a red underline — you typed a code', () => {
  const body = ruleBody('.nl-idbar');
  assert.match(body, /background:\s*var\(--white\)/);
  assert.match(body, /border-bottom:\s*3px solid var\(--primary\)/);
});

test('.nl-idbar--open is navy — nobody was asked who you are', () => {
  const body = ruleBody('.nl-idbar--open');
  assert.match(body, /background:\s*var\(--navy\)/);
});

test('.nl-idbar never claims the red ground reserved for a signed-in session', () => {
  for (const sel of ['.nl-idbar', '.nl-idbar--open']) {
    assert.doesNotMatch(ruleBody(sel), /background:\s*var\(--primary\)/,
      `${sel} must not use the authenticated bar's ground`);
  }
});

test('.topbar keeps the authenticated signature it is the only holder of', () => {
  const body = ruleBody('.topbar');
  assert.match(body, /background:\s*var\(--primary\)/);
  assert.match(body, /border-bottom:\s*7px solid var\(--navy\)/);
});

/* The gate card and the bar are two halves of one flow: type a code, then be
   told who the page now thinks you are. A gate with no bar to follow it is a
   page that forgets. */
test('.gate ships with the card, input and error slots NL.codeGate renders', () => {
  for (const sel of ['.gate', '.gate__card', '.gate__title', '.gate__sub',
                     '.gate__input', '.gate__err', '.gate__logo', '.gate__lockup']) {
    assert.ok(rules.includes('\n' + sel + ' {') || rules.includes('\n' + sel + ':'),
      `${sel} is present — NL.codeGate renders it`);
  }
});

/* Deliberately excluded from the phone 16px floor at the end of the file: it is
   --text-xl already. If someone adds it there "for consistency" they shrink it. */
test('.gate__input is not caught by the small-screen 16px floor', () => {
  /* Anchor on the section header, not the first 700px query — there are three
     in the file and the earliest is nowhere near this block. Then skip past
     the section's own comment, which names the class precisely to explain why
     it is not in the list below it. */
  const head = rules.indexOf('Text-entry controls: 16px floor');
  const floor = rules.slice(rules.indexOf('*/', head));
  assert.ok(!floor.includes('.gate__input'),
    '.gate__input is --text-xl and must stay out of the 16px floor block');
});

/* The bar wraps rather than overflowing (v2.38). The club-directory editor
   carries a club selector and five buttons; the .ed-top it replaced set
   flex-wrap and canon did not, so converting it would have pushed the controls
   off the side of a laptop. Nothing in a browser complains — the row just runs
   past the edge, on the one page whose bar is busy enough to notice. */
test('.nl-idbar wraps rather than overflowing when the row runs out', () => {
  assert.match(ruleBody('.nl-idbar'), /flex-wrap:\s*wrap/);
  assert.match(ruleBody('.nl-idbar__actions'), /flex-wrap:\s*wrap/);
});

/* Wrapping only works because one child absorbs the slack. If __id ever loses
   flex: 1 the actions stop being pushed right and the bar wraps immediately. */
test('.nl-idbar__id keeps the flex: 1 the layout depends on', () => {
  const body = ruleBody('.nl-idbar__id');
  assert.match(body, /flex:\s*1/);
  assert.match(body, /min-width:\s*0/);
});

/* ── Standalone select (v2.39) ─────────────────────────────────────────────
   Promoted from nls-monitor's matchday picker on second use (Fan Widgets).
   The load-bearing part is the redrawn arrow: without appearance: none the
   platform draws its own arrow at a different size and colour on every OS,
   and the control reads as unstyled next to the brand buttons beside it. A
   well-meant "simplify: drop the gradients, keep the native arrow" undoes
   the whole reason the class exists, and no browser complains. */
test('.nl-select exists and redraws the dropdown arrow itself', () => {
  const body = ruleBody('.nl-select');
  assert.match(body, /(^|[;{\s])appearance:\s*none/, 'native arrow must be removed');
  assert.match(body, /-webkit-appearance:\s*none/);
  assert.match(body, /background-image:\s*linear-gradient/, 'arrow must be redrawn');
  assert.match(body, /var\(--text-muted\)/, 'redrawn arrow uses the brand muted ink');
});

/* Width is layout, not identity — nls-monitor's 15rem stayed tool-local and
   canon must not grow one. A min-width here would reflow every consumer. */
test('.nl-select sets no width of its own', () => {
  assert.doesNotMatch(ruleBody('.nl-select'), /(min-)?width\s*:/,
    '.nl-select must leave width to the tool');
});

/* ── Notice banner (v2.40) ─────────────────────────────────────────────────
   Promoted from five hand-rolled copies (portal .banner, fan-widgets
   .fw-warn, photoshelter-onboarding .ps-warn, club-contacts .ri-dupnote /
   .ri-softnote). Two settled rulings live here: full border rather than a
   left accent stripe (the side-accent-on-a-card pattern is design-lint
   flagged — recorded on .fw-warn when it was written), and deep ink on the
   light tint (--amber-deep / --red-deep) because the bare semantic hue does
   not read accessibly on its own -light background. */

test('.banner exists with all three variants', () => {
  for (const sel of ['.banner', '.banner--amber', '.banner--error', '.banner--info']) {
    ruleBody(sel); /* asserts presence */
  }
});

test('.banner is tokened — radius, type scale, no raw hex', () => {
  const body = ruleBody('.banner');
  assert.match(body, /border-radius:\s*var\(--radius\)/);
  assert.match(body, /font-size:\s*var\(--text-sm\)/);
  assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b/, '.banner must use tokens, not hex');
});

test('.banner variants sit on their semantic tints with readable deep ink', () => {
  const amber = ruleBody('.banner--amber');
  assert.match(amber, /background:\s*var\(--amber-light\)/);
  assert.match(amber, /color:\s*var\(--amber-deep\)/);
  const error = ruleBody('.banner--error');
  assert.match(error, /background:\s*var\(--red-light\)/);
  assert.match(error, /color:\s*var\(--red-deep\)/);
  const info = ruleBody('.banner--info');
  assert.match(info, /background:\s*var\(--blue-light\)/);
  assert.match(info, /color:\s*var\(--navy\)/);
});

test('.banner carries a full border, never a left accent stripe', () => {
  assert.match(ruleBody('.banner'), /border:\s*1px solid/);
  for (const sel of ['.banner', '.banner--amber', '.banner--error', '.banner--info']) {
    assert.doesNotMatch(ruleBody(sel), /border-left/,
      `${sel} must not reintroduce the side-accent stripe`);
  }
});

/* ── Disclosure row (v2.41) ────────────────────────────────────────────────
   Promoted from three hand-rolled <details>/<summary> skeletons
   (club-contacts/admin .cra-all__club, fan-widgets .fw-fan, estate
   .est-fam). The marker suppression is the invisible contract: drop any one
   of the three declarations and one browser family quietly renders TWO
   arrows — the canon ▸ next to the platform's own triangle — and nothing
   complains. fixtures' mini-caps togglers stayed local by ruling. */

test('.disclosure suppresses the native marker in every engine', () => {
  const body = ruleBody('.disclosure > summary');
  assert.match(body, /list-style:\s*none/, 'list-style: none for Firefox/modern engines');
  const wk = rules.indexOf('.disclosure > summary::-webkit-details-marker');
  assert.notEqual(wk, -1, 'the ::-webkit-details-marker rule is present for older WebKit');
  assert.match(rules.slice(wk, rules.indexOf('}', wk)), /display:\s*none/);
  assert.ok(rules.includes('.disclosure > summary::marker'),
    'the ::marker rule is present so no engine draws its own arrow');
});

test('.disclosure draws its own chevron and swaps it under [open]', () => {
  const closed = rules.indexOf('.disclosure > summary::before');
  assert.notEqual(closed, -1, 'the closed-state chevron is drawn by ::before');
  assert.match(rules.slice(closed, rules.indexOf('}', closed)), /content:/);
  const open = rules.indexOf('.disclosure[open] > summary::before');
  assert.notEqual(open, -1, 'an [open] state rule exists');
  assert.match(rules.slice(open, rules.indexOf('}', open)), /content:/,
    'the open state is a content swap — no transform, nothing for reduced-motion to catch');
});

/* ── Division identity (v2.42) ─────────────────────────────────────────────
   Promoted from club-directory/meta-reference's .mr-div--* pills, the only
   mapper verified to carry the navy/amber/green pairing its CANON CANDIDATE
   flag recorded. The tokens exist to settle that pairing: fixtures' pastel
   row washes and vidiprinter's embed palette already tell three different
   colour stories for the same three divisions, and a fourth invention is
   the failure these prevent. Aliases, not hex — a brand hue change must
   flow through, exactly as --proj-1…6 do. */

test('--div-* tokens exist and alias the settled division pairing', () => {
  assert.match(rules, /--div-national:\s*var\(--navy\)/,
    'National is navy — an alias, so a brand navy change flows through');
  assert.match(rules, /--div-north:\s*var\(--amber\)/,
    'North is amber');
  assert.match(rules, /--div-south:\s*var\(--green\)/,
    'South is green');
});

test('the --div-* parent hues still carry the values the pairing settled on', () => {
  /* The aliases only mean what the parents say. If a semantic hue is ever
     retuned, this fails as a prompt to re-check the North dark-text ruling
     (white on the amber does not read) rather than silently inheriting. */
  assert.match(rules, /--navy:\s*#223b7c/);
  assert.match(rules, /--amber:\s*#c96f15/);
  assert.match(rules, /--green:\s*#1a7030/);
});

test('.disclosure is tokened — navy summary, muted chevron and meta, no raw hex', () => {
  const summary = ruleBody('.disclosure > summary');
  assert.match(summary, /color:\s*var\(--navy\)/);
  assert.match(summary, /'wght' 800/);
  assert.doesNotMatch(summary, /#[0-9a-fA-F]{3,8}\b/, '.disclosure summary must use tokens, not hex');
  const meta = ruleBody('.disclosure__meta');
  assert.match(meta, /color:\s*var\(--text-muted\)/);
  assert.match(meta, /font-size:\s*var\(--text-sm\)/);
  assert.doesNotMatch(meta, /#[0-9a-fA-F]{3,8}\b/, '.disclosure__meta must use tokens, not hex');
});
