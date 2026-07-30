/* Locks the match graphic's colour and band rules against regression.

   These encode decisions made with the brand owner, not arbitrary defaults —
   see the header of graphics/_shared/match-graphic.js. The named club cases
   are the ones the rules were chosen to satisfy, so a change that breaks them
   is a change of intent, not a refactor. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

/* The module is a browser IIFE that attaches to `window` or `this`. Run it in
   a bare function scope and collect the global it exports. */
function loadModule() {
  const src = readFileSync(join(REPO, 'graphics/_shared/match-graphic.js'), 'utf8');
  const scope = {};
  new Function('window', 'globalThis', src).call(scope, scope, scope);
  assert.ok(scope.NL_MATCH_GRAPHIC, 'module did not export NL_MATCH_GRAPHIC');
  return scope.NL_MATCH_GRAPHIC;
}

const MG = loadModule();
const clubs = JSON.parse(readFileSync(join(REPO, 'assets/data/clubs-meta.json'), 'utf8'));
const byName = new Map(clubs.clubs.map(c => [c.name, c]));
const members = clubs.clubs.filter(
  c => ['National', 'North', 'South'].includes(c.division));

const colours = name => {
  const c = byName.get(name);
  assert.ok(c, `club not in clubs-meta: ${name}`);
  return c.colors;
};

test('canvas is 16:9 at 1920x1080', () => {
  assert.equal(MG.WIDTH, 1920);
  assert.equal(MG.HEIGHT, 1080);
});

test('bands are 50 primary / 25 secondary / 25 tertiary', () => {
  assert.deepEqual(MG.BANDS, { primary: 50, secondary: 25, tertiary: 25 });
});

test('the four delivery formats exist with the right dimensions', () => {
  assert.deepEqual(Object.keys(MG.FORMATS).sort(),
                   ['16x9', '1x1', '4x5', '9x16']);
  assert.deepEqual([MG.FORMATS['16x9'].w, MG.FORMATS['16x9'].h], [1920, 1080]);
  assert.deepEqual([MG.FORMATS['1x1'].w, MG.FORMATS['1x1'].h], [1080, 1080]);
  assert.deepEqual([MG.FORMATS['4x5'].w, MG.FORMATS['4x5'].h], [1080, 1350]);
  assert.deepEqual([MG.FORMATS['9x16'].w, MG.FORMATS['9x16'].h], [1080, 1920]);
  assert.equal(MG.DEFAULT_FORMAT, '16x9');
});

test('every format matches the aspect ratio its name claims', () => {
  for (const [name, f] of Object.entries(MG.FORMATS)) {
    const [a, b] = name.split('x').map(Number);
    assert.ok(Math.abs(f.w / f.h - a / b) < 0.001,
              `${name} is ${f.w}x${f.h}, which is not ${a}:${b}`);
  }
});

test('portrait formats stack, landscape and square sit side by side', () => {
  /* Both portrait frames are only 1080 wide. A vertical seam there leaves
     ~500px per club, which squeezes the code badly, so they split
     horizontally and each club gets the full width. */
  assert.equal(MG.FORMATS['16x9'].split, 'x');
  assert.equal(MG.FORMATS['1x1'].split, 'x');
  assert.equal(MG.FORMATS['4x5'].split, 'y');
  assert.equal(MG.FORMATS['9x16'].split, 'y');
});

test('a stacked format gives its code more room than the square', () => {
  /* The whole reason 4:5 stacks: side by side it needed a 138px code. */
  assert.ok(MG.FORMATS['4x5'].codeSize > MG.FORMATS['1x1'].codeSize,
            'stacking should buy larger type, not smaller');
});

test('every format carries a complete geometry set', () => {
  const need = ['w', 'h', 'split', 'seamA', 'seamB', 'bands', 'crestH',
                'codeSize', 'codeGap', 'laneA', 'laneB',
                'badgeLandscape', 'badgePortrait'];
  for (const [name, f] of Object.entries(MG.FORMATS)) {
    for (const k of need) {
      assert.ok(f[k] !== undefined, `${name} is missing ${k}`);
    }
    assert.equal(f.bands.length, 3, `${name} needs three band widths`);
    assert.ok(f.laneA < f.laneB, `${name} lanes must be ordered`);
  }
});

test('an unknown format throws rather than silently rendering 16:9', () => {
  assert.ok(!('3x2' in MG.FORMATS), 'pick a name that really is not a format');
  assert.throws(() => MG.format('3x2'), /unknown match-graphic format/);
});

test('seamPos leans across the cross axis in both orientations', () => {
  const l = MG.FORMATS['16x9'];
  assert.equal(MG.seamPos(l, 0), l.seamA);
  assert.equal(MG.seamPos(l, l.h), l.seamB);
  const p = MG.FORMATS['9x16'];
  assert.equal(MG.seamPos(p, 0), p.seamA);
  assert.equal(MG.seamPos(p, p.w), p.seamB);
});

test('render version is a semver string', () => {
  assert.match(MG.VERSION, /^\d+\.\d+\.\d+$/);
});

test('same-coloured neighbouring bands merge into one 50px run', () => {
  /* Two abutting fills antialias their shared edge and let the panel colour
     bleed through the join, so identical neighbours must become one fill. */
  const runs = MG.bandRuns([
    { width: 25, colour: '#FFFFFF' },
    { width: 25, colour: '#FFFFFF' }
  ]);
  assert.equal(runs.length, 1, 'identical colours should merge');
  assert.equal(runs[0].width, 50);
});

test('band merge is case-insensitive on hex', () => {
  const runs = MG.bandRuns([
    { width: 25, colour: '#ffffff' },
    { width: 25, colour: '#FFFFFF' }
  ]);
  assert.equal(runs.length, 1);
});

test('distinct neighbouring bands stay separate', () => {
  const runs = MG.bandRuns([
    { width: 25, colour: '#8B2942' },
    { width: 25, colour: '#000000' }
  ]);
  assert.equal(runs.length, 2);
  assert.deepEqual(runs.map(r => r.width), [25, 25]);
});

test('Worthing takes its secondary — white on red, not black', () => {
  /* 3.89:1. The reason the floor is 2.5 and not 4.0. */
  const r = MG.resolveColours(colours('Worthing'));
  assert.equal(r.textBasis, 'secondary');
  assert.equal(r.text.toUpperCase(), '#FFFFFF');
});

test('Chorley rejects its secondary — red on black is a both-dark pair', () => {
  /* WCAG scores this 5.26:1, better than Worthing's 3.89, which is backwards.
     The dark-floor guard is what catches it. */
  const c = colours('Chorley');
  assert.ok(MG.contrast(c.primary, c.secondary) > 4.5,
            'precondition: WCAG rates this pair highly');
  const r = MG.resolveColours(c);
  assert.equal(r.textBasis, 'tertiary');
  assert.equal(r.text.toUpperCase(), '#FFFFFF');
});

test("Scunthorpe keeps its maroon secondary at the 2.5 floor", () => {
  /* 2.85:1 — admitted deliberately; it matches the original hand-made graphic. */
  const r = MG.resolveColours(colours('Scunthorpe United'));
  assert.equal(r.textBasis, 'secondary');
  assert.equal(r.text.toUpperCase(), '#8B2942');
});

test('Aldershot rejects navy-on-red and falls back', () => {
  const r = MG.resolveColours(colours('Aldershot Town'));
  assert.notEqual(r.textBasis, 'secondary');
});

test('every member club resolves to a usable text colour', () => {
  const bad = [];
  for (const c of members) {
    const r = MG.resolveColours(c.colors);
    if (!/^#[0-9a-f]{6}$/i.test(r.text)) bad.push(`${c.code} bad hex ${r.text}`);
    if (r.text.toLowerCase() === c.colors.primary.toLowerCase()) {
      bad.push(`${c.code} text equals panel`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the text rule holds its agreed distribution across the 72', () => {
  const tally = { secondary: 0, tertiary: 0, 'best-effort': 0 };
  for (const c of members) tally[MG.resolveColours(c.colors).textBasis]++;
  assert.equal(members.length, 72);
  assert.deepEqual(tally, { secondary: 66, tertiary: 5, 'best-effort': 1 });
});

test('panels never use secondary — resolveColours reports primary as the panel', () => {
  /* A club may play in an away kit that is not its secondary colour, so the
     panel must always be the primary. */
  for (const c of members) {
    assert.equal(MG.resolveColours(c.colors).panel, c.colors.primary);
  }
});

test('seamX leans from 1060 at the top to 900 at the bottom', () => {
  assert.equal(MG.seamX(0), 1060);
  assert.equal(MG.seamX(1080), 900);
  assert.equal(MG.seamX(540), 980);
});
