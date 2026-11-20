/* The club browser: NL.clubPicker in its list form (nl-utils v1.76) and the
   .nl-browse layout (nl-brand v2.86). Rendering needs a browser and is
   checked with scripts/screens.mjs; what is pinned here is what a
   well-meant edit could break without anyone looking:

   - the club in the address (#club=FYL, principle 2.7) sits beside the
     page's other hash parts rather than wiping them;
   - the browser stays one chooser: it is a mode of NL.clubPicker and its
     Division filter is NL.filterButton (principle 5.2), pick-one;
   - the chosen row is navy, never red (principle 4.1);
   - the layout keeps its two columns on both desktop screens and only
     stacks on a phone (principle 2.5). */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, freshCanon } from './load-canon.mjs';

const css = readFileSync(join(REPO, 'system/nl-brand.css'), 'utf8');
const js = readFileSync(join(REPO, 'system/nl-utils.js'), 'utf8');

/* A location and history that behave like a browser's for replaceState. */
function withAddress(hash) {
  const location = { pathname: '/club-directory/', search: '', hash, href: '' };
  const history = {
    state: null,
    replaceState(state, title, url) {
      this.state = state;
      const i = String(url).indexOf('#');
      location.hash = i === -1 ? '' : String(url).slice(i);
    }
  };
  const NL = freshCanon({ location, history, addEventListener() {}, removeEventListener() {} });
  return { NL, location };
}

test('club browser: the chosen club goes in the address beside other parts', () => {
  const { NL, location } = withAddress('#admin');
  NL.clubPicker.hash.set('club', 'FYL');
  assert.equal(location.hash, '#club=FYL&admin');
  NL.clubPicker.hash.set('club', 'ALD');
  assert.equal(location.hash, '#club=ALD&admin', 'replaced, not added twice');
  assert.equal(NL.clubPicker.hash.get('club'), 'ALD');
  NL.clubPicker.hash.set('club', null);
  assert.equal(location.hash, '#admin', 'clearing the club leaves the rest');
});

test('club browser: a name with spaces survives the address', () => {
  const { NL, location } = withAddress('');
  NL.clubPicker.hash.set('club', 'The National League');
  assert.equal(location.hash, '#club=The%20National%20League');
  assert.equal(NL.clubPicker.hash.get('club'), 'The National League');
  NL.clubPicker.hash.set('club', null);
  assert.equal(location.hash, '');
});

test('club browser: no club in the address reads as none', () => {
  const { NL } = withAddress('#tab=lists');
  assert.equal(NL.clubPicker.hash.get('club'), null);
});

test('club browser: one chooser, built on the canon filter', () => {
  assert.match(js, /if \(options\.mode === 'list'\) return clubListPicker\(el, options\);/,
    'the list is a mode of NL.clubPicker, not a second club chooser');
  const body = js.slice(js.indexOf('function clubListPicker'), js.indexOf('window.NL.clubPicker = function'));
  assert.match(body, /window\.NL\.filterButton\(filterEl, \{[\s\S]*?label: 'Division', multiple: false/,
    'the Division filter is a pick-one NL.filterButton');
  assert.doesNotMatch(body, /class="[^"]*(chip|pill)/, 'no pill row');
});

test('club browser: the chosen club is navy, never red', () => {
  const rule = css.match(/\.club-picker--list \.club-picker__option\[aria-selected="true"\] \{([^}]*)\}/);
  assert.ok(rule, 'a rule for the chosen row');
  assert.match(rule[1], /background:\s*var\(--navy\)/);
  assert.doesNotMatch(rule[1], /--primary|--red/);
});

test('club browser: two columns on both desktop screens, stacked only on a phone', () => {
  const grid = css.match(/\.nl-browse \{([^}]*)\}/);
  assert.ok(grid, '.nl-browse exists');
  assert.match(grid[1], /grid-template-columns:\s*clamp\(/, 'the side narrows in proportion');
  const queries = [...css.matchAll(/@media \(max-width: (\d+)px\) \{\s*\.nl-browse \{/g)].map((m) => +m[1]);
  assert.deepEqual(queries, [760], 'one change of layout, below the 1280px screen');
  const block = css.slice(css.indexOf('/* MODIFIER: .club-picker--list'), css.indexOf('/* Keyboard-navigation highlight'));
  assert.doesNotMatch(block.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-f]{3,8}\b/i, 'tokens, never hex');
});
