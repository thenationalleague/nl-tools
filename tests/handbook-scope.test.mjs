/* Helpers declared inside wire(), called from outside it.

   Written after shipping exactly that. `afterPendingSave` was declared inside
   wire(), and `takeInsert` — which lives at the top level of the same IIFE —
   called it. Every press of the insert strip threw a ReferenceError and did
   nothing at all. Richard: "effectively pressing did nothing."

   Worth a guard because of how well it hides:

     · `node --check` PARSES. It does not resolve identifiers, so a call to a
       name that cannot possibly be in scope is valid syntax and the check
       passes. Every syntax check run on that file said "syntax ok".
     · the failure is at CLICK time, so the page boots and everything else
       works.
     · a listener that throws is swallowed by the browser. No toast, no
       dialog — the control simply does nothing, which reads as a broken
       feature rather than as an error.

   WHY THIS SHAPE AND NOT A GENERAL SCOPE CHECK. The first attempt tried to
   answer "is this call in scope?" for every function in the file. It needed a
   correct brace depth across an HTML document — the <style> blocks threw that
   out — then correct containment, then regex literals and template strings
   started to matter. At which point it was a JavaScript parser with bugs, and
   it reported eight false positives on a correct file. A checker that cries
   wolf is switched off within a week.

   So this asks one question with a certain answer. wire() is where every
   event listener is bound, it is the one large nested scope in the file, and
   nothing declared inside it can be seen from outside. Anything beyond that
   needs a real parser, which is not worth building here. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

/* Comments and strings hold braces and things that look like calls. Blanked
   rather than removed, so every index still lines up with the original and
   the line numbers in a failure are true. */
function blanked(src) {
  const out = src.split('');
  let i = 0;
  const wipe = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '/*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; wipe(i, end); i = end; continue; }
    if (two === '//') { const e = src.indexOf('\n', i); const end = e < 0 ? src.length : e; wipe(i, end); i = end; continue; }
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) { j++; break; }
        if (c !== '`' && src[j] === '\n') break;   // unterminated: leave it alone
        j++;
      }
      wipe(i, j); i = j; continue;
    }
    i++;
  }
  return out.join('');
}

/* The body of a function starting at `from`, by brace matching. */
function bodyRange(src, from) {
  let depth = 0;
  const open = src.indexOf('{', from);
  if (open < 0) return null;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return [from, k + 1]; }
  }
  return null;
}

function analyse(raw) {
  const src = blanked(raw);
  const at = src.indexOf('function wire()');
  if (at < 0) return null;
  const range = bodyRange(src, at);
  if (!range) return null;
  const [start, end] = range;

  /* From the opening BRACE, not from the declaration — otherwise wire() finds
     itself, reports its own call site, and the guard fails on a correct file. */
  const open = src.indexOf('{', start);
  const declared = [];
  for (const m of src.slice(open + 1, end).matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    declared.push(m[1]);
  }

  const escapes = [];
  for (const name of new Set(declared)) {
    for (const m of src.matchAll(new RegExp('\\b' + name + '\\s*\\(', 'g'))) {
      if (m.index >= start && m.index < end) continue;                 // inside wire()
      if (/\bfunction\s+$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue;
      escapes.push({ name, line: raw.slice(0, m.index).split('\n').length });
    }
  }
  return { declared, escapes };
}

test('nothing declared inside wire() is called from outside it', () => {
  const raw = readFileSync(join(REPO, 'handbook/index.html'), 'utf8');
  const found = analyse(raw);
  assert.ok(found, 'handbook/index.html no longer has a wire() to check');
  assert.ok(found.declared.length > 0,
    'found no declarations inside wire() — the brace match has probably gone ' +
    'wrong, and a checker that silently finds nothing passes forever');

  const msg = found.escapes
    .map((e) => `  ${e.name}() at line ${e.line} — declared inside wire(), so this is a ReferenceError`)
    .join('\n');
  assert.deepEqual(found.escapes, [],
    'A call to something wire() keeps to itself. node --check will not catch ' +
    'this (it parses, it does not resolve names), and a listener that throws ' +
    'is swallowed, so the control just does nothing.\n' + msg +
    '\nMove the helper up to the top level of the page IIFE, beside the others.');
});

test('the checker can see the bug it was written for', () => {
  /* The real shape: a helper declared inside wire(), called from a top-level
     function above it. A guard that cannot fail is a guard nobody should
     trust — and an earlier version of this one passed a file that DID have
     the bug, because it was measuring brace depth across an HTML page. */
  const broken = `
    <script>
    (function () {
      function takeInsert() { afterPendingSave(function () {}); }
      function wire() {
        function afterPendingSave(fn) { fn(); }
        afterPendingSave(function () {});
      }
    })();
    </script>`;
  const found = analyse(broken);
  assert.ok(found, 'the sample has a wire()');
  assert.deepEqual(found.declared, ['afterPendingSave']);
  assert.equal(found.escapes.length, 1, 'the call from takeInsert is caught');
  assert.equal(found.escapes[0].name, 'afterPendingSave');
});

test('a helper called only from inside wire() is not reported', () => {
  /* The false positive that would get this switched off. */
  const fine = `
    <script>
    (function () {
      function wire() {
        function helper(x) { return x; }
        helper(1);
        document.addEventListener('click', function () { helper(2); });
      }
    })();
    </script>`;
  const found = analyse(fine);
  assert.deepEqual(found.declared, ['helper']);
  assert.deepEqual(found.escapes, []);
});
