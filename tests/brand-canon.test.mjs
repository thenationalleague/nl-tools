/* Brand canon tests — the rules in nl-brand.css that are invisible until they
   break in a browser, and that lint cannot see because lint checks wiring, not
   stylesheets. Run with `npm test` (node --test). Zero dependencies.

   Scope is deliberately narrow: contracts where a plausible, well-meant edit
   silently breaks rendering somewhere else. Layout and colour choices belong in
   the Style Guide and a human's eyes, not here. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { NL, REPO } from './load-canon.mjs';

const css = readFileSync(join(REPO, 'system/nl-brand.css'), 'utf8');

/* Canon is not only the stylesheet. nl-topbar.js injects its CSS as a
   JavaScript STRING and auth-guard.js writes cssText directly, so both were
   invisible to every sweep and to this file's own floor test — which read
   nl-brand.css and nothing else. The topbar renders on every page in the
   estate and its version badge sat at 10px throughout. A guard with the same
   blind spot as the sweep it guards is not a guard. */
const CANON_JS = ['system/nl-topbar.js', 'system/auth-guard.js'];
/* Comments stripped before scanning. These files explain in prose what values
   they replaced, and a guard that fires on its own changelog is a guard
   somebody switches off. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const canonJs = CANON_JS.map((f) => [f, stripComments(readFileSync(join(REPO, f), 'utf8'))]);

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
   flex: 1 the actions stop being pushed right and the bar wraps immediately.

   THE min-width HALF OF THIS TEST WAS WRONG, and it asserted the bug into
   place: it required `min-width: 0`, on the reasoning that a shrinkable
   child is what lets the row give way. The opposite is true. A child that
   can shrink to NOTHING means the row always fits, so flex-wrap never has a
   reason to fire — and the bar resolves the squeeze by deleting the identity
   it exists to state. On the handbook reader at 390px, "Handbook" became
   "H…" and "The National League" wrapped three lines deep across the button
   beside it. The same bar at 360px was perfect, because there the buttons
   genuinely did not fit and it wrapped. A floor is what makes every width
   behave like the one that already worked. */
test('.nl-idbar__id absorbs the slack, and has a floor under it', () => {
  const body = ruleBody('.nl-idbar__id');
  assert.match(body, /flex:\s*1/, 'it still takes the spare width');
  assert.ok(!/min-width:\s*0\s*[;}]/.test(body),
    'min-width: 0 lets the identity vanish, which is how the wrap stops ' +
    'firing and the bar overflows instead');
  assert.match(body, /min-width:\s*[\d.]+(rem|em|px|ch)/,
    'the bar runs out of room while the tool name is still readable');
});

/* Both lines of the identity truncate. __title has had nowrap and an ellipsis
   since it entered canon; __sub had neither, so it was the one thing in the
   bar able to paint outside its own box. */
test('.nl-idbar__sub truncates like the title above it', () => {
  const body = ruleBody('.nl-idbar__sub');
  assert.match(body, /white-space:\s*nowrap/);
  assert.match(body, /text-overflow:\s*ellipsis/);
  assert.match(body, /overflow:\s*hidden/);
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

/* ── Shared yellow (v2.43) ─────────────────────────────────────────────────
   Promoted from identical locals in wellbeing (--wb-yellow) and
   wellbeing-map (--wm-yellow). The value is load-bearing: #efb700 was
   chosen for LUMINANCE (roughly double --amber) so a red > amber > yellow
   severity ramp stays legible to a red-green colour-blind reader as
   lightness, not just hue. A well-meant retune towards a deeper "brand"
   yellow silently flattens that ramp. Literal hexes, matching the rest of
   the status-hue family. */
test('--yellow carries the settled luminance-chosen value with its -light companion', () => {
  assert.match(rules, /--yellow:\s*#efb700/,
    '--yellow is #efb700 — chosen for luminance, see the token comment before retuning');
  assert.match(rules, /--yellow-light:\s*#fdf8e0/,
    '--yellow-light exists — every status hue carries a -light companion');
});

/* ── Palette discipline (v2.44) ────────────────────────────────────────────
   The brand is exactly four colours; everything else is a functional
   extension with one job, a derived neutral, or an externally anchored
   reference palette. Three rulings from that pass are pinned here. */

test('reference palettes stay anchored to their real-world facts', () => {
  /* Road signs: Highway Code / DfT spec. Cards: the referee's colours,
     matching the hardcoded fills in yellow-card.svg / red-card.svg, and the
     documented colouring interface for icon-card. These are stored facts,
     not design choices — a well-meant retune towards a "nicer" shade breaks
     the anchor. Single-consumer is not disqualifying for anchored data. */
  assert.match(rules, /--road-sign-m:\s*#2563ac/, 'motorway blue is the DfT value');
  assert.match(rules, /--road-sign-a-bg:\s*#007a33/, 'A-road green ground is the DfT value');
  assert.match(rules, /--road-sign-a-fg:\s*#ffd900/, 'A-road yellow numerals are the DfT value');
  assert.match(rules, /--card-yellow:\s*#fed800/, 'booking yellow matches the sprite fill');
  assert.match(rules, /--card-red:\s*#fe0000/, 'dismissal red matches the sprite fill');
});

test('tool-domain state colours stay out of canon — no --cal-* tokens', () => {
  /* Demoted in v2.44: "worked" and "rejected" are holiday-lieu's domain
     states, nonsense as canon names. The tool maps its states onto system
     hues instead. If a calendar palette ever wants back in, it needs new
     job-named tokens and a second consumer — not these. */
  assert.doesNotMatch(rules, /--cal-/,
    'no --cal-* tokens — holiday-lieu maps its states onto system hues');
});

test('position bands live only as NL.positionBands — no --pos-* CSS twins', () => {
  /* v2.44: the CSS tokens had zero live consumers (canvas exporters read
     the JS mirror; embeds cannot read nl-brand.css) and existed only to
     drift. The mirror is the single source; these are the settled values. */
  assert.doesNotMatch(rules, /--pos-(champ|sf|qf|releg|c-fg|po-sf-bg|po-fg|r-bg|r-fg):/,
    'no --pos-* CSS tokens — NL.positionBands is the single source');
  const settled = {
    champ: '#7F99DC', sf: '#3760C8', qf: '#2D4FA4', releg: '#192C5C',
    cFg: '#000000', poSfBg: '#9aa3ad', poFg: '#000000',
    rBg: '#000000', rFg: '#ffffff',
  };
  /* Key-by-key rather than deepEqual: NL comes from a node:vm sandbox, so
     its object literals carry the vm realm's prototype. */
  assert.deepEqual(Object.keys(NL.positionBands).sort(), Object.keys(settled).sort(),
    'NL.positionBands carries exactly the settled band keys');
  for (const [k, v] of Object.entries(settled)) {
    assert.equal(NL.positionBands[k], v, `NL.positionBands.${k} is the settled value`);
  }
});

/* ── Responsive table container (v2.45) ────────────────────────────────────
   .table-wrap existed as a bare overflow-x and the estate kept hand-rolling
   what it lacked (holiday-lieu, club-directory, club-signoff, estate,
   attendance) — found live when the Style Guide's own tables blew out the
   viewport. The max-width/min-width pair is the invisible contract:
   overflow-x alone never fires when the wrap sits in a flex/grid parent,
   because the wrap itself grows to its content and props the page open
   instead of scrolling. Nothing in a browser complains when either is
   dropped — the page just gets wider on the one layout that notices. */

test('.table-wrap scrolls instead of propping the page open', () => {
  const body = ruleBody('.table-wrap');
  assert.match(body, /overflow-x:\s*auto/);
  assert.match(body, /-webkit-overflow-scrolling:\s*touch/, 'momentum scrolling on iOS');
  assert.match(body, /max-width:\s*100%/, 'must not grow past its container');
  assert.match(body, /min-width:\s*0/, 'must be shrinkable as a flex/grid child');
});

test('.table-wrap carries no chrome of its own — .table owns it', () => {
  const body = ruleBody('.table-wrap');
  assert.doesNotMatch(body, /(^|[;{\s])(border|box-shadow|background)\s*:/,
    'border/shadow/background on the wrap would double-frame every .table inside one');
  assert.match(body, /border-radius:\s*var\(--radius\)/,
    'radius (not chrome) keeps the rounded silhouette during a mid-scroll clip');
});

/* ── Button + pill rationalisation (v2.47) ─────────────────────────────────
   .btn--accent was a byte-identical alias of .btn--primary from v2.15 until
   its deletion; two names for one recipe is drift waiting to happen. The
   pill alias pairs survived as names (shared domain vocabulary) but became
   grouped selectors, so each recipe is stated exactly once and a pair
   cannot drift apart. Nothing in a browser complains if someone re-splits
   a pair "to tweak just one of them" — which is precisely the failure. */

test('.btn--accent stays deleted — .btn--primary is the one primary CTA', () => {
  /* Selector positions only — the changelog prose in the widget-index
     comment still names the variant historically, and prose is not a rule. */
  assert.doesNotMatch(rules, /\n\.btn--accent\s*[,{:]/,
    '.btn--accent must not return; it was an identical alias of .btn--primary');
});

test('the five button variants each still exist with their stated job', () => {
  for (const sel of ['.btn--primary', '.btn--navy', '.btn--ghost', '.btn--danger', '.btn--restore']) {
    assert.ok(rules.includes(sel), `${sel} exists`);
  }
});

test('pill alias pairs share one grouped rule each, so they cannot drift', () => {
  for (const [a, b] of [['live', 'approved'], ['soon', 'pending'], ['expired', 'rejected']]) {
    const re = new RegExp(`\\.pill--${a},\\s*\\n\\.pill--${b}\\s*\\{`);
    assert.match(rules, re,
      `.pill--${a} and .pill--${b} must be one grouped selector — one recipe, two names`);
    /* And neither may reappear as a standalone rule that could diverge. */
    assert.ok(!rules.includes(`\n.pill--${a} {`) && !rules.includes(`\n.pill--${b} {`),
      `.pill--${a}/.pill--${b} must not also exist as standalone rules`);
  }
});

test('.pill--postponed keeps the purple that separates called-off from coming-up', () => {
  const body = ruleBody('.pill--postponed');
  assert.match(body, /background:\s*var\(--purple-light\)/);
  assert.match(body, /color:\s*var\(--purple\)/);
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

/* Role pills against the role model.

   These two must move together and did not: the 16/08 rename split the club
   realm into club-admin and club-staff, NL.roles was updated, and nl-brand.css
   was not — so a Club Staff pill had no styling in canon at all. The portal had
   its own copy of the block, which is exactly why nobody saw it. */

test('every role in NL.roles has a pill class in canon', () => {
  const missing = Object.keys(NL.roles.LABELS)
    .filter((r) => !new RegExp(`\\.role-${r}\\b`).test(rules));
  assert.deepEqual(missing, [],
    `roles with no .role-* rule in nl-brand.css: ${missing.join(', ')}`);
});

test('canon has no pill class for a role the model does not have', () => {
  const known = new Set(Object.keys(NL.roles.LABELS));
  /* 'pending' is a state, not a role — it is the one legitimate extra. */
  known.add('pending');
  const extra = [...rules.matchAll(/^\.role-([a-z-]+)\s*\{/gm)]
    .map((m) => m[1])
    .filter((r) => !known.has(r));
  assert.deepEqual(extra, [],
    `.role-* rules for roles NL.roles does not know: ${extra.join(', ')}`);
});

test('both elevations exist and share one ink', () => {
  /* Two greys that disagree make "raised" look like a different material
     depending on which tool you are in — which is what the estate had. */
  const root = rules.slice(rules.indexOf(':root'));
  const shadow = /--shadow:\s*([^;]+);/.exec(root);
  const shadowLg = /--shadow-lg:\s*([^;]+);/.exec(root);
  assert.ok(shadow, '--shadow is defined');
  assert.ok(shadowLg, '--shadow-lg is defined');
  const ink = (v) => /rgba\(\s*([\d\s,]+?),\s*[\d.]+\s*\)/.exec(v)?.[1].replace(/\s/g, '');
  assert.equal(ink(shadow[1]), ink(shadowLg[1]),
    'the two elevations must use the same ink');
});

/* The type floor holds.

   v2.36 raised the --text-* floors because a phone was being served the
   smallest type in the system. It fixed the tokens and converted nothing, so
   19 of this file's 59 font-sizes sat below the floor the same file tells you
   never to go under — .table th at 10px, every form label and .pill at 11px,
   .topbar__dd-role at 8px. The rule existed and nothing obeyed it, and it took
   a second phone report to notice. v2.49 converted them; this stops the next
   hardcoded 11px landing unnoticed. */

test('no component in canon sets a font-size below the 12px floor', () => {
  /* The exceptions, named in the scale's comment: glyphs sized to their
     shape, and the avatar fitting ladder (2/3/4 initials in a fixed circle —
     a token would grow with the viewport and overflow it). Anything else
     below 12px is the bug this test exists for. */
  const ALLOWED = [
    /\.topbar__avatar--staff-\d/,        // fitting ladder
    /\.topbar__dd-item--active::after/,  // tick glyph
    /\.nl-doc/, /\.nl-art/, /\.nl-clause/, /\.nl-tbl/, /\.nl-cover/, // document system
  ];
  const offenders = [];
  let selector = '';
  for (const line of rules.split('\n')) {
    const sel = /^([.#a-zA-Z\[][^{}]*)\{/.exec(line);
    if (sel) selector = sel[1].trim();
    /* Plain px AND the floor of a clamp(). The v2.49 sweep matched only plain
       px, so every clamp-based size walked straight past it — including a
       .tool-tile__desc at clamp(11px, ...), which was then reported from a
       phone as unreadable. A floor is a floor however it is written. */
    const m = /font-size:\s*(?:clamp\(\s*)?(\d+(?:\.\d+)?)px/.exec(line);
    if (!m) continue;
    if (parseFloat(m[1]) >= 12) continue;
    if (ALLOWED.some((re) => re.test(selector))) continue;
    offenders.push(`${selector} — ${m[1]}px`);
  }
  assert.deepEqual(offenders, [],
    `below the 12px floor, and not a documented exception:\n  ${offenders.join('\n  ')}`);
});

test('.nl-doc is a sheet, and its shadow comes off the ladder', () => {
  /* The reading surface is a white page, not the app's ground. Two things
     worth pinning rather than the whole rule: that it HAS a ground at all,
     and that the shadow is a solid ladder colour. The brand carries no
     rgba-overlay tokens on purpose, and a shadow is the single most likely
     place for someone to reach for one. */
  const rule = css.slice(css.indexOf('\n.nl-doc {'), css.indexOf('.nl-doc__head'));
  assert.match(rule, /background:\s*var\(--white\)/,
    '.nl-doc must draw its own page, or the document reads as UI');
  assert.match(rule, /box-shadow:[^;]*var\(--navy-\d+\)/,
    'shadow from the navy ladder — the brand has no rgba overlay tokens');
  assert.ok(!/box-shadow:[^;]*rgba\(/.test(rule), 'no hand-mixed rgba in the sheet shadow');
});

test('only self-describing numbers hang; letters and romans keep their indent', () => {
  /* The distinction is the whole idea. "6.4.7" states its ancestry, so the
     indent repeats it and can go. "(a)" restarts under every parent and means
     nothing without position, so its indent is load-bearing. A rule that
     hung everything would flatten the document into ambiguity. */
  const hang = css.slice(css.indexOf('.nl-clause:not(.nl-clause--nonum)'));
  const block = hang.slice(0, hang.indexOf('}') + 1);
  assert.match(block, /data-num="decimal"/);
  assert.ok(!/data-num="lower-alpha"|data-num="lower-roman"|data-num="bullet"/.test(block),
    'letters, romans and bullets must NOT hang — their indent carries meaning');
  assert.match(block, /margin-left:\s*-58px/,
    'exactly one gutter: 46px min-width + the 12px flex gap');
});

test('a clause only hangs where its parent has a gutter to give back', () => {
  /* The hang gives back one gutter. Keyed on depth — as it was until v2.58 —
     it gave back a gutter the parent might never have had:

       · .nl-clause--nonum sets display:none on the number, which takes the
         flex gap with it, so an unnumbered parent's body starts at its own
         left edge. Its decimal child hung 58px past the text column, through
         the sheet's 34px padding, and printed its number outside the paper.
         That is Appendix Q's ANNEX 1, whose parents are headings.
       · a bullet parent's gutter is 20px + 12px, so -58px overshoots by 26.

     Both are invisible in League Rules, where every parent is numbered —
     which is exactly why a depth-keyed rule survived a version. */
  const hang = css.slice(css.indexOf('.nl-clause:not(.nl-clause--nonum)'));
  const block = hang.slice(0, hang.indexOf('}') + 1);
  assert.match(block, /:not\(\.nl-clause--nonum\)/,
    'an unnumbered parent has no gutter to give back');
  assert.match(block, /:not\(\.nl-clause--bullet\)/,
    "a bullet parent's gutter is 32px, not 58px");
  assert.match(block, />\s*\.nl-clause__body\s*>\s*\.nl-clause/,
    'the relationship is parent-to-child, not a depth number');

  assert.ok(!/\.nl-clause\[data-depth="[2-9]"\]\[data-num="decimal"\]/.test(css),
    'the depth enumeration is gone — it could not express "my parent has a ' +
    'gutter", and it stopped at 5 besides');
});

test('the clause markup carries the numbering style the hanging rule reads', () => {
  /* The stylesheet cannot tell a decimal from an (a) without being told. If
     renderNode stops emitting data-num, the rule silently matches nothing and
     the indent quietly comes back. */
  const hb = readFileSync(join(REPO, 'handbook/index.html'), 'utf8');
  assert.match(hb, /data-num="' \+ esc\(node\.numStyle \|\| 'decimal'\)/,
    'renderNode must emit data-num on every clause');
});

test('.nl-crest is square, and stays square', () => {
  /* Crest files are NOT square. The generated tiers fit the longest side to
     96px or 256px, so they come out 73x96, 96x86, 64x96 — whatever shape the
     badge is. That makes `width: X; height: auto` a trap, and the club
     directory banner fell into it: a tall narrow crest drew 68x102 while a
     wide one drew 68x61, so the banner's height moved with the club.

     The box is the constant. If height ever stops matching width here, every
     caller silently goes back to being sized by the artwork. */
  const rule = /\.nl-crest\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule, '.nl-crest still exists');
  const w = /width:\s*var\(--crest-size,\s*(\d+)px\)/.exec(rule[1]);
  const h = /height:\s*var\(--crest-size,\s*(\d+)px\)/.exec(rule[1]);
  assert.ok(w && h, 'both dimensions come from --crest-size');
  assert.equal(w[1], h[1], 'the fallback must be square too');
  assert.match(rule[1], /object-fit:\s*contain/,
    'contain, so the badge fits the box rather than filling or cropping it');
  assert.ok(!/height:\s*auto/.test(rule[1]),
    'height:auto is the exact bug this component was promoted to end');
});

test('.is-sel is actually drawn', () => {
  /* The bug this was written for is the quietest kind. handbook/index.html
     and handbook/reader/index.html both add and remove .is-sel faithfully — on the
     selected clause and on a deep-link target — and until v2.56 no stylesheet
     anywhere defined it. Every line of that bookkeeping ran correctly and
     painted nothing, in both pages, for months.

     So the guard is "does a rule exist", not "is it the right red". A class
     two pages depend on should not be able to go back to meaning nothing. */
  assert.match(css, /\.nl-clause\.is-sel[\s\S]{0,400}background:\s*var\(--primary\)/,
    '.is-sel must draw a visible marker');
  assert.match(css, /\.nl-clause\.is-sel,\s*\.nl-art\.is-sel\s*\{[^}]*position:\s*relative/,
    'the margin rule is absolutely positioned, so the clause must be its ' +
    'containing block or the rule lands somewhere else entirely');

  /* The number is a flex ITEM in the clause row, and sub-clauses live inside
     their parent's body — so the row is as tall as the whole subtree and an
     un-pinned gutter tint paints a solid column past every descendant.
     Selecting 1.1 filled the gutter down to the foot of 1.1.3. */
  assert.match(css, /\.nl-clause\.is-sel\s*>\s*\.nl-clause__num\s*\{[^}]*align-self:\s*flex-start/,
    'the selected number must not stretch — its tint would run the height ' +
    'of every clause nested underneath it');

  /* Not a shadow, deliberately: an empty clause has nothing to cast one
     around, and the empty clause is the case that most needs the marker. */
  const block = css.slice(css.indexOf('.nl-clause.is-sel'), css.indexOf('.nl-art__head > .nl-clause__text'));
  assert.ok(!/box-shadow/.test(block),
    '.is-sel must not rely on a shadow — it has to hold its shape at zero height');

  for (const page of ['handbook/index.html', 'handbook/reader/index.html']) {
    assert.match(readFileSync(join(REPO, page), 'utf8'), /is-sel/,
      page + ' sets .is-sel, which is why it is worth pinning here');
  }
});

test('an untitled article runs its prose beside the number', () => {
  /* 23 of 107 articles carry a number and no title — the whole of Board
     Directives. Both the editor and the reader emit the body INSIDE
     .nl-art__head for those, so it lands in the same gutter the number uses
     instead of below an empty title row. Without the flex sizing the body
     will not wrap and the directive runs off the page. */
  assert.match(css, /\.nl-art__head\s*>\s*\.nl-clause__text\s*\{[^}]*flex:\s*1 1 auto/);
  assert.match(css, /\.nl-art__head\s*>\s*\.nl-clause__text\s*\{[^}]*min-width:\s*0/,
    'without min-width:0 a long unbroken line refuses to wrap in a flex row');

  const hb = readFileSync(join(REPO, 'handbook/index.html'), 'utf8');
  assert.match(hb, /!showTitle && wantBody \? artBody\(true\)/,
    'renderNode must put the body inside the head when there is no title, ' +
    'or the canon rule above matches nothing');
});

test('an article and its clauses share one left edge', () => {
  /* Richard, reading League Rules: "clause six will say Registration of
     Players, and it's aligned in a certain area. But six point one, the
     content of six point one, is not aligned in the same place."

     He was right, and it was arithmetic: the article gutter was 30px and the
     clause gutter 46px, so a section title started 16px left of the text of
     its own first sub-clause. Two edges, both looking deliberate, neither
     agreeing with the other.

     Pinned as ONE number rather than two rules, because the failure mode is
     someone changing one gutter for a good reason and not the other. */
  const artNum = /\.nl-art__num\s*\{([^}]*)\}/.exec(css);
  const clNum = /\.nl-clause__num\s*\{([^}]*)\}/.exec(css);
  assert.ok(artNum && clNum, 'both number gutters still exist');
  const width = (m) => Number(/min-width:\s*(\d+)px/.exec(m[1])[1]);
  assert.equal(width(artNum), width(clNum),
    'the article number gutter and the clause number gutter must be the same ' +
    'width, or a section title and its own sub-clauses sit on different ' +
    'left edges');

  /* And the third edge: prose written straight into an article is emitted as
     a direct child of <section class="nl-art">, so it has no gutter at all
     and began at the very left of the sheet. 48 of 107 articles carry it. */
  assert.match(css,
    /\.nl-art:not\(\.nl-art--nonum\)\s*>\s*\.nl-clause__text[^{]*\{[^}]*margin-left:\s*58px/,
    'article-level prose must be pushed into the same 58px column');
  assert.match(css,
    /\.nl-art:not\(\.nl-art--nonum\)\s*>\s*\.nl-clause--nonum[^{]*\{[^}]*margin-left:\s*58px/,
    'an unnumbered depth-1 clause must be too — collapsing its gutter puts it ' +
    'flush with the PARENT text, which at depth 1 is the sheet edge');
});

test('the PDF keeps that column, in its own units', () => {
  /* print.html sets a 12mm clause gutter, so the 58px canon figure is the
     wrong length on paper. Both halves have to be restated together or the
     PDF drifts back to two edges while the screen looks right. */
  const print = readFileSync(join(REPO, 'handbook/print.html'), 'utf8');
  assert.match(print, /\.flow \.nl-art__num\s*\{[^}]*min-width:\s*12mm/,
    'the print article gutter must match the print clause gutter');
  assert.match(print,
    /\.flow \.nl-art:not\(\.nl-art--nonum\)[\s\S]{0,120}margin-left:\s*calc\(12mm \+ 12px\)/,
    'article-level prose must sit in the print column too');
});

test('nothing in the document system is pulled outside the text column', () => {
  /* A negative margin on document content escapes the page padding and puts
     the content against the edge of the sheet. That is what happened when a
     table breakout was written with offsets measured against the layout
     BEFORE hanging sub-clauses: at depth 3 it pulled the table 58px past the
     margin. Hanging itself is the ONE deliberate negative margin here — it
     moves a clause left by exactly its parent's gutter, which lands it inside
     the column, not outside it. Everything else stays put. */
  const doc = css.slice(css.indexOf('/* Article (top-level node) */'),
                        css.indexOf('/* ---- .nl-cover'));
  const offenders = [];
  for (const m of doc.matchAll(/([^{}]+)\{([^}]*margin[^}]*)\}/g)) {
    const selector = m[1].trim().split('\n').pop().trim();
    if (!/margin(-left|-right|-inline)?:\s*-/.test(m[2])) continue;
    if (/data-num="decimal"/.test(m[0])) continue;   // the hanging rule, deliberate
    offenders.push(selector + ' { ' + m[2].trim() + ' }');
  }
  assert.deepEqual(offenders, [],
    'A negative margin on document content pushes it through the page padding ' +
    'and up against the edge of the sheet:\n  ' + offenders.join('\n  '));
});

test('the PDF renderer turns the sheet off', () => {
  /* A PDF page is already paper. Left on, the sheet draws a bordered box
     around all 152 pages — and nothing in CI renders a PDF to notice. */
  const print = readFileSync(join(REPO, 'handbook/print.html'), 'utf8');
  const flow = print.slice(print.indexOf('.flow .nl-doc'), print.indexOf('.flow .nl-doc__head'));
  assert.match(flow, /background:\s*none/);
  assert.match(flow, /box-shadow:\s*none/);
  assert.match(flow, /border:\s*0/);
});

test('the type scale floors have not been lowered', () => {
  /* "Do not lower a floor back below 12px to make something fit; the fix for
     a cramped layout is the layout." — the file's own words. */
  const floors = { '--text-xs': 12, '--text-sm': 14, '--text-base': 16, '--text-md': 18, '--text-lg': 22 };
  for (const [tok, min] of Object.entries(floors)) {
    const m = new RegExp(`${tok}:\\s*clamp\\(\\s*(\\d+)px`).exec(rules);
    assert.ok(m, `${tok} is a clamp with a px floor`);
    assert.ok(Number(m[1]) >= min,
      `${tok} floor is ${m[1]}px, below the ${min}px agreed at v2.36`);
  }
});


test('canon JavaScript sets no font-size below the 12px floor either', () => {
  /* The px literals that remain are glyphs sized to their shape — a 26px
     close X — and the meta theme-color, which cannot take a var(). Anything
     that is text obeys the floor wherever it is written. */
  const offenders = [];
  for (const [file, src] of canonJs) {
    for (const m of src.matchAll(/font-size: ?(?:var\([^,)]+, *)?(\d+(?:\.\d+)?)px/g)) {
      if (parseFloat(m[1]) >= 12) continue;
      offenders.push(`${file}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [], `below the floor in canon JS:\n  ${offenders.join('\n  ')}`);
});

test('canon JavaScript hand-mixes no rgba()', () => {
  /* The brand has no rgba-overlay tokens by decision — the shade ladder and
     color-mix cover it. The two legitimate uses (--shadow, --scrim) are
     tokens in nl-brand.css, so a literal rgba here means a hand-mixed colour
     that will not follow the brand. */
  const offenders = [];
  for (const [file, src] of canonJs) {
    for (const m of src.matchAll(/rgba\(\s*\d/g)) {
      const line = src.slice(0, m.index).split('\n').length;
      offenders.push(`${file}:${line}`);
    }
  }
  assert.deepEqual(offenders, [], `hand-mixed rgba in canon JS: ${offenders.join(', ')}`);
});

/* ── --font-mono (v2.61) ───────────────────────────────────────────────────
   Promoted on the twentieth hand-rolling. The same stack was written out in
   five spellings across sixteen files, and graphics/ had gone as far as
   defining its own --font-mono privately — which is the tell: the same idea
   named the same way in a second place is a token that has not been promoted
   yet. */
test('--font-mono is a token, not twenty copies of a stack', () => {
  assert.match(rules, /--font-mono:\s*ui-monospace/,
    'the brand has no monospace face and needs one — codes, ids and slugs ' +
    'are read a character at a time');
});

test('no gated page hand-rolls the stack any more', () => {
  /* Embeds are excluded on purpose and tested for separately below. */
  const files = execSync(
    "grep -rln 'ui-monospace' --include=*.html --include=*.css . " +
    "| grep -v node_modules | grep -v '^./.claude' | grep -v '^./embeds/' || true",
    { cwd: REPO, encoding: 'utf8' }).trim();
  const offenders = files ? files.split('\n').filter((f) => f !== './system/nl-brand.css') : [];
  assert.deepEqual(offenders, [],
    'these still spell the stack out instead of using var(--font-mono): ' +
    offenders.join(', '));
});

test('the embeds keep their own copy, and that is correct', () => {
  /* They are pasted into the Urban Zoo CMS and cannot load nl-brand.css at
     all, so every value they use is mirrored verbatim. A test that "fixed"
     them would break them, so this pins the exception rather than leaving
     the next sweep to rediscover it. */
  const motm = readFileSync(join(REPO, 'embeds/score-predictor.html'), 'utf8');
  assert.match(motm, /ui-monospace/,
    'the embed still carries its own stack — it cannot reach the token');
});

test('graphics no longer shadows the token with a private copy', () => {
  const g = readFileSync(join(REPO, 'graphics/_shared/brand-graphic.css'), 'utf8');
  assert.ok(!/--font-mono:\s*ui-monospace/.test(g),
    'a token defined in two places is a token that can disagree in two places');
  assert.match(g, /var\(--font-mono\)/, 'it still USES the canon one');
});

test('the Style Guide shows it, or it is not a living reference', () => {
  const sg = readFileSync(join(REPO, 'style-guide/index.html'), 'utf8');
  assert.match(sg, /var\(--font-mono\)<\/code>/,
    'the token is named in the Typography section');
});

/* ── icon-indent / icon-outdent (21/08/2026) ──────────────────────────────
   Added for the handbook's clause toolbar, which drew these with the &larr;
   and &rarr; HTML entities: a glyph pretending to be an icon, taking its size
   and weight from whatever font is loaded and sitting on a text baseline
   rather than centred. */
test('the sprite carries indent and outdent, and they are not the chevrons', () => {
  const sprite = readFileSync(join(REPO, 'assets/icons/sprites.svg'), 'utf8');
  for (const n of ['indent', 'outdent']) {
    assert.ok(sprite.includes(`id="icon-${n}"`), `#icon-${n} is in the sprite`);
  }
  const grab = (n) => new RegExp(`<symbol id="icon-${n}"[\\s\\S]*?</symbol>`).exec(sprite)[0];
  const back = grab('back'), indent = grab('indent'), outdent = grab('outdent');
  /* A chevron beside a clause reads as "previous" and "next", which is a
     different promise from "make this a sub-clause of the one above". The
     lines are what say the operation is structural. */
  assert.ok(indent.includes('<line'), 'indent shows lines of text, not just a chevron');
  assert.ok(outdent.includes('<line'));
  assert.notEqual(indent.replace(/indent/g, ''), back.replace(/back/g, ''));

  /* One control, two directions: same lines, mirrored chevron. */
  const lines = (s) => (s.match(/<line[^>]*>/g) || []).join('');
  assert.equal(lines(indent), lines(outdent), 'the pair shares its lines');
  assert.notEqual(
    /<polyline[^>]*>/.exec(indent)[0], /<polyline[^>]*>/.exec(outdent)[0],
    'and differs only in which way the chevron points');
});

test('the handbook toolbar uses them rather than HTML entities', () => {
  const hb = readFileSync(join(REPO, 'handbook/index.html'), 'utf8');
  /* HTML comments stripped first. The markup carries a comment naming the
     four entities to explain why they are gone, and a guard that fires on
     its own rationale is a guard somebody switches off — the same lesson
     stripComments above was written for. */
  const bar = hb.slice(hb.indexOf('id="ceActs"'), hb.indexOf('id="ceCrumb"'))
    .replace(/<!--[\s\S]*?-->/g, '');
  for (const e of ['&larr;', '&rarr;', '&uarr;', '&darr;']) {
    assert.ok(!bar.includes(e), `${e} is a text arrow pretending to be an icon`);
  }
  for (const n of ['indent', 'outdent', 'up', 'down']) {
    assert.ok(bar.includes('#icon-' + n), `the ${n} button draws #icon-${n}`);
  }
  /* No text node in the button, so the label has to come from somewhere. */
  assert.match(bar, /data-op="indent" aria-label=/);
});

test('the icon buttons set neither fill nor stroke', () => {
  /* The sprite declares both per symbol — stroked UI icons, filled match
     icons — and a wrapper that states either one flattens the other kind. */
  const hb = readFileSync(join(REPO, 'handbook/index.html'), 'utf8');
  const rule = /\.hb-bar button\.hb-op \{([^}]*)\}/.exec(hb);
  assert.ok(rule, '.hb-op is styled');
  assert.doesNotMatch(rule[1], /(^|[;{\s])fill\s*:/);
  assert.doesNotMatch(rule[1], /(^|[;{\s])stroke\s*:/);
  /* Square, so the glyph is centred rather than sitting on a text baseline.
     The side is --tool-h, the one height every control in either handbook bar
     is set to — a literal here would drift the moment that changes, which is
     what it did. */
  assert.match(rule[1], /width:\s*var\(--tool-h\)/);
});

test('the Style Guide shows the new pair', () => {
  const sg = readFileSync(join(REPO, 'style-guide/index.html'), 'utf8');
  assert.match(sg, /<code>icon-indent<\/code>/);
  assert.match(sg, /<code>icon-outdent<\/code>/);
  assert.match(sg, /id="sg-indent"/, 'with its own local copy of the symbol, as the others have');
});
