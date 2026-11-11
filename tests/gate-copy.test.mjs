/* What a code gate SAYS, and which door gets to say it.

   Reported live on 26/08/2026, after the cards had already been corrected:
   "Enter your six-digit code. still getting this btw. did we not sort this?
   when a code fails."

   Two separate faults, and the first one hid the second.

     1. The cards were fixed and the SERVERS were not. Every failed attempt
        gets its message from the trigger, not the page, so the corrected
        wording only ever showed on a gate nobody had failed yet.

     2. The Club Directory reader tries two doors — club-codes first, the
        legacy Directory door as a fallback — and showed whichever answered
        LAST. The Directory door normalises to digits only, so a six-character
        alphanumeric access code arrived there as the two or three digits it
        happened to contain, missed the length check, and was answered with a
        demand for six digits. The code was six characters and correct in
        shape; nothing the person was told was true.

   So this file pins both halves: no door claims a shape that its lock does
   not accept, and the fallback never speaks. (The fallback itself went with
   the Directory reader codes on 11/11/2026; the page has one door now.) */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './load-canon.mjs';

const read = (p) => readFileSync(join(REPO, p), 'utf8');

/* Comments explain the bug at length and would match every pattern below; a
   guard that fires on its own rationale is a guard somebody switches off. */
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

/* ------------------------------------------------- what the servers say */

/* The message on a failed attempt comes from here, which is why fixing the
   cards alone changed nothing the person complaining could see. */
const DOORS = ['functions/club-code.js',
               'functions/programme.js'];

test('no door tells anyone to type digits', () => {
  for (const f of DOORS) {
    const errs = [...strip(read(f)).matchAll(/error:\s*$\s*"([^"]+)"|error:\s*"([^"]+)"/gm)]
      .map((m) => m[1] || m[2]);
    assert.ok(errs.length >= 4, `${f}: expected to find its error strings`);
    for (const e of errs) {
      assert.ok(!/digit/i.test(e), `${f} says "${e}"`);
    }
  }
});

test('the club-code door asks for an ACCESS code, not a club code', () => {
  /* The same six characters are held by the 72 clubs AND by named people at
     the League. The League is not a club, so "your club code" is asking a
     colleague for something they do not have — the fault that surfaced the
     day a new NL holder was created (22/08/2026). */
  const src = strip(read('functions/club-code.js'));
  assert.match(src, /error: "Enter your access code\."/);
  assert.ok(!/your club code/i.test(src), 'no server message says "club code"');
});

/* --------------------------------------------- which door gets to speak */

test('the Club Directory has one door, so only the club-code door speaks', () => {
  /* Fault 2 above was a second door answering last. The Directory reader
     codes behind it were retired on 11/11/2026, and with them the fallback:
     the page now hands codeGate the club-code verify and nothing else. */
  const src = strip(read('club-directory/index.html'));
  assert.match(src, /verify: clubVerify\s*\}/);
  assert.ok(!/dirVerify|NLGate/.test(src), 'the retired Directory door is wired back in');
});

/* ----------------------------------------------------- what the cards say */

test('every card that takes an alphanumeric code avoids "digit"', () => {
  /* The handbook's gate moved to handbook/_reader.js on 26/08/2026, shared
     with handbook/public. */
  for (const f of ['club-directory/index.html',
                   'handbook/_reader.js',
                   'style-guide/index.html']) {
    const subs = [...strip(read(f)).matchAll(/(?:sub:\s*'([^']+)'|class="gate__sub"[^>]*>([^<]+)<)/g)]
      .map((m) => m[1] || m[2]);
    assert.ok(subs.length >= 1, `${f}: expected a gate sub`);
    for (const s of subs) assert.ok(!/digit/i.test(s), `${f} says "${s}"`);
  }
});

test('every codeGate caller passes its own sub', () => {
  /* The canon default is shape-accurate — "Enter your 6-digit code." only
     when numeric, "Enter your code." otherwise — so it is safe to inherit.
     It is not safe to inherit ACCIDENTALLY: a gate that means to be
     alphanumeric and forgets `numeric: false` inherits a demand for digits
     along with it, which is this bug with a different author. */
  const callers = ['club-directory/index.html', 'handbook/_reader.js'];
  for (const f of callers) {
    const src = read(f);
    assert.match(src, /NL\.codeGate\.(open|ensure)\(\{[\s\S]{0,1200}?sub: '/,
      `${f} calls the gate without a sub`);
  }
});
