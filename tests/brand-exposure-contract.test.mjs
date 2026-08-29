/* Brand Exposure — the contract between the script and the tool.

   A match can arrive two ways: uploaded by hand from brand-exposure/index.html,
   or pushed by board-exposure-match.py when the scan finishes. Both build the
   same record, and both derive the match id the same way. Nothing enforces that
   but this file.

   Why it matters more than it looks: the id is what dedupes a match. If the two
   slug functions ever disagree by one character, the same fixture lands under
   two ids, the Matches tab shows it twice, and the Grounds tab counts one match
   as two — quietly, with no error anywhere, and with both numbers looking
   entirely plausible. That is the failure mode this repo keeps naming: the same
   idea written twice that has started to disagree.

   So the JS is lifted out of the shipped page and the Python out of the shipped
   module, and the same inputs go through both. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/* The tool's slug(), evaluated out of the page source so this tests what ships
   rather than a copy that can drift from it. */
function toolSlug() {
  const src = readFileSync(join(ROOT, 'brand-exposure/index.html'), 'utf8');
  const i = src.indexOf('function slug(');
  assert.ok(i >= 0, 'brand-exposure/index.html no longer defines slug()');
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) { j++; break; }
  }
  return eval('(' + src.slice(i, j) + ')');
}

/* The script's slugify(), run in the interpreter that will actually run it.
   Re-implementing it here in JS would defeat the point. */
function pySlug(values) {
  const out = execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, 'scripts')
import board_exposure_upload as U
print(json.dumps([U.slugify(v) for v in json.loads(sys.argv[1])]))
`, JSON.stringify(values)], { cwd: ROOT, encoding: 'utf8' });
  return JSON.parse(out);
}

function pyMatchId(date, club, opponent) {
  return execFileSync('python3', ['-c', `
import sys
sys.path.insert(0, 'scripts')
import board_exposure_upload as U
print(U.match_id_for(sys.argv[1], sys.argv[2], sys.argv[3]))
`, date, club, opponent], { cwd: ROOT, encoding: 'utf8' }).trim();
}

/* Real club and sponsor names, plus the shapes that break naive slugs:
   punctuation inside a word, an ampersand, an accent, a leading digit, runs of
   separators, and a string that slugs away to nothing. */
const CASES = [
  'Sutton United', 'Hartlepool United', 'AFC Fylde', 'Boston United',
  'Ebbsfleet United', 'St Albans City', 'Weston-super-Mare', 'Maidenhead Utd.',
  'Forest Green Rovers', 'Yeovil Town',
  'TIC Health', 'Telsa Media', 'Enterprise', 'DAZN',
  'A&B Ltd', 'Café Nero', '100%Pure', "Nando's",
  '  spaced  out  ', '---', '', 'a', 'A-B', 'a--b',
];

test('the script and the tool slug every name identically', () => {
  const js = CASES.map(toolSlug());
  const py = pySlug(CASES);
  const bad = CASES
    .map((c, i) => ({ c, js: js[i], py: py[i] }))
    .filter((r) => r.js !== r.py);
  assert.deepEqual(bad, [],
    'slug() in brand-exposure/index.html and slugify() in ' +
    'scripts/board_exposure_upload.py have drifted:\n' +
    bad.map((r) => `  ${JSON.stringify(r.c)}: tool=${r.js} script=${r.py}`).join('\n'));
});

test('both build the same match id for the same fixture', () => {
  const slug = toolSlug();
  const date = '2026-08-23', club = 'Sutton United', opp = 'Hartlepool United';
  // The tool's construction, from saveMatch().
  const fromTool = [date, slug(club), 'v', slug(opp)].join('-');
  assert.equal(fromTool, '2026-08-23-sutton-united-v-hartlepool-united');
  assert.equal(pyMatchId(date, club, opp), fromTool);
});

test('the script and the tool write the same sponsor fields', () => {
  /* build_record() in the script and saveMatch() in the page both write a
     sponsor object, and every field added to one has to reach the other or a
     match renders with gaps depending on which door it came through — the
     visibility/blockedPct pair (v0.5) is the kind of addition this exists to
     catch. The tool's keys are read from the shipped assignment; the script's
     from actually running build_record. */
  const src = readFileSync(join(ROOT, 'brand-exposure/index.html'), 'utf8');
  const i = src.indexOf('sponsors[slug(name)] = {');
  assert.ok(i >= 0, 'brand-exposure/index.html no longer builds sponsors[slug(name)]');
  const block = src.slice(i, src.indexOf('};', i))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  /* A key follows {, a comma, or a newline — which is what keeps the colon in
     a ternary ("? null : x") from reading as one. */
  const toolKeys = new Set(
    [...block.matchAll(/[{,\n]\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((m) => m[1]));

  const py = execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, 'scripts')
import board_exposure_upload as U
rec = U.build_record({"sponsors": {"X": {"seconds": 1}}, "scope": {}},
                     "Sutton United", "Barnet", "2026-08-23", "highlights",
                     True, has_proxy=False, has_detections=True)
print(json.dumps(sorted(rec["sponsors"]["x"].keys())))
`], { cwd: ROOT, encoding: 'utf8' });
  const scriptKeys = new Set(JSON.parse(py));

  assert.deepEqual([...toolKeys].sort(), [...scriptKeys].sort(),
    'saveMatch() and build_record() have drifted apart');
});

test('a match id built by the script is one the ingest function will accept', () => {
  // Three files enforce this shape and all three must agree: the script builds
  // the id, the function validates it before putting it in a token claim, and
  // the rules compare that claim against the path. A club name that produced an
  // id the function refuses would fail at the last step of a long scan.
  const src = readFileSync(join(ROOT, 'functions/brand-exposure.js'), 'utf8');
  const m = src.match(/const MATCH_ID = (\/.*\/);/);
  assert.ok(m, 'functions/brand-exposure.js no longer defines MATCH_ID');
  const re = new RegExp(m[1].slice(1, m[1].lastIndexOf('/')));

  for (const club of ['Sutton United', 'Weston-super-Mare', 'AFC Fylde',
                      "Nando's", 'St Albans City', 'Forest Green Rovers']) {
    const id = pyMatchId('2026-08-23', club, 'Barnet');
    assert.match(id, re, `the function would refuse the id for ${club}: ${id}`);
    assert.ok(!id.includes('--'), `${id} has a doubled dash, which is also refused`);
  }
});
