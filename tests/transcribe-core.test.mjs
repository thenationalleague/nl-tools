/* Transcribe — the arithmetic (transcribe/_core.js).
   No model runs here. The "voices" are made-up directions in space: two clips
   of the same voice point nearly the same way, which is all the grouping
   relies on. What the real models return, and how the page behaves in a
   browser, is not covered by this file. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { REPO } from './load-canon.mjs';

const ctx = {};
vm.runInNewContext(readFileSync(join(REPO, 'transcribe/_core.js'), 'utf8'), ctx);
const C = ctx.TranscribeCore;
const SR = C.SR;

/* A repeatable random number, so a failure can be run again. */
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

/* A voice is a fixed direction; a clip of it is that direction with a little noise. */
function voices(n, seed) {
  const r = rng(seed);
  return Array.from({ length: n }, () => Float32Array.from({ length: 64 }, () => r() - 0.5));
}
function clipOf(voice, r, noise = 0.15) { return Float32Array.from(voice, (x) => x + (r() - 0.5) * noise); }

test('plan: windows start every 5 s and the last one reaches the end', () => {
  assert.deepEqual(Array.from(C.plan(4 * SR)), [0]);
  assert.deepEqual(Array.from(C.plan(10 * SR)), [0]);
  const starts = Array.from(C.plan(27 * SR));
  assert.deepEqual(starts, [0, 5 * SR, 10 * SR, 15 * SR, 20 * SR]);
  assert.ok(starts.at(-1) + C.WIN >= 27 * SR);
});

test('decode: the seven classes become who is speaking, and who is speaking alone', () => {
  /* rows: nobody, A, B, C, A+B, A+C, B+C */
  const rows = 7, logits = new Float32Array(rows * 7).fill(-5);
  for (let i = 0; i < rows; i++) logits[i * 7 + i] = 5;
  const d = C.decode(logits, rows);
  assert.deepEqual(Array.from(d.act[0]), [0, 1, 0, 0, 1, 1, 0]);
  assert.deepEqual(Array.from(d.act[1]), [0, 0, 1, 0, 1, 0, 1]);
  assert.deepEqual(Array.from(d.act[2]), [0, 0, 0, 1, 0, 1, 1]);
  assert.deepEqual(Array.from(d.solo), [-1, 0, 1, 2, -1, -1, -1]);
});

test('clip: too little of a voice is not described; a long stretch is cut to its middle', () => {
  const audio = new Float32Array(10 * SR).map((_, i) => i), rows = C.frames(10 * SR);
  const solo = new Int8Array(rows).fill(-1);
  for (let i = 0; i < 10; i++) solo[i] = 0;            /* 10 rows = 0.17 s */
  assert.equal(C.clip(audio, 0, solo, 0), null);
  solo.fill(1);                                        /* the whole window */
  const c = C.clip(audio, 0, solo, 1);
  assert.ok(Math.abs(c.seconds - rows * C.STEP / SR) < 1e-6, 'reports all the speech it found');
  assert.ok(c.audio.length / SR <= 4 && c.audio.length / SR > 3.9, 'but hands over 4 s of it');
  assert.ok(c.audio[0] > 2.5 * SR && c.audio[0] < 3.5 * SR, 'taken from the middle');
});

test('group: clips of three voices come out as three groups', () => {
  const r = rng(7), v = voices(3, 11), truth = [], units = [];
  for (let i = 0; i < 60; i++) { const who = i % 3; truth.push(who); units.push({ emb: clipOf(v[who], r), seconds: 3 }); }
  const g = C.group(units);
  assert.equal(g.count, 3);
  for (let i = 3; i < 60; i++) assert.equal(g.labels[i], g.labels[i % 3], `clip ${i} sits with its own voice`);
  assert.equal(new Set([g.labels[0], g.labels[1], g.labels[2]]).size, 3);
});

test('group: told how many people there are, it stops at that number', () => {
  const r = rng(3), v = voices(4, 5), units = [];
  for (let i = 0; i < 40; i++) units.push({ emb: clipOf(v[i % 4], r), seconds: 3 });
  assert.equal(C.group(units).count, 4);
  assert.equal(C.group(units, { count: 2 }).count, 2);
  assert.equal(C.group(units, { count: 6 }).count, 6);
});

test('group: a few stray seconds do not become a person, unless a number was asked for', () => {
  const r = rng(9), v = voices(3, 21), units = [];
  for (let i = 0; i < 40; i++) units.push({ emb: clipOf(v[i % 2], r), seconds: 3 });
  units.push({ emb: clipOf(v[2], r), seconds: 2 });    /* one cough */
  assert.equal(C.group(units).count, 2);
  assert.equal(C.group(units, { count: 3 }).count, 3);
});

test('group: a short recording of two people stays two', () => {
  const r = rng(4), v = voices(2, 8);
  const units = [{ emb: clipOf(v[0], r), seconds: 3.9 }, { emb: clipOf(v[1], r), seconds: 4.6 }, { emb: clipOf(v[1], r), seconds: 4.6 }];
  assert.equal(C.group(units).count, 2);
});

test('group: a clip too short to trust joins the nearest group and never starts one', () => {
  const r = rng(2), v = voices(3, 13), units = [];
  for (let i = 0; i < 20; i++) units.push({ emb: clipOf(v[i % 2], r), seconds: 3 });
  units.push({ emb: clipOf(v[0], r), seconds: 0.6 });  /* voice 0, briefly */
  units.push({ emb: clipOf(v[2], r), seconds: 0.6 });  /* a third voice, briefly */
  const g = C.group(units);
  assert.equal(g.count, 2);
  assert.equal(g.labels[20], g.labels[0]);
  assert.ok(g.labels[21] === g.labels[0] || g.labels[21] === g.labels[1]);
});

test('group: nothing to go on gives no groups', () => {
  assert.equal(C.group([]).count, 0);
});

/* A track: one voice's row of a window, active between two times. */
function track(startSec, fromSec, toSec, unit) {
  const rows = C.frames(C.WIN), act = new Uint8Array(rows);
  for (let i = 0; i < rows; i++) { const t = startSec + i * C.STEP / SR; if (t >= fromSec && t < toSec) act[i] = 1; }
  return { start: startSec * SR, act, unit };
}

test('attribute: each line goes to whoever speaks for most of it, numbered in order of first appearance', () => {
  /* group 1 speaks 0–4 s and 8–10 s, group 0 speaks 4–8 s */
  const tracks = [track(0, 0, 4, 0), track(0, 4, 8, 1), track(0, 8, 10, 2)];
  const labels = Int32Array.from([1, 0, 1]);
  const lines = [{ start: 0, end: 3.5 }, { start: 3.5, end: 7.5 }, { start: 7.5, end: 10 }];
  const r = C.attribute(tracks, labels, 2, lines, 10 * SR);
  assert.deepEqual(Array.from(r.speakers), [0, 1, 0]);
  assert.equal(r.count, 2);
  assert.deepEqual(Array.from(r.seconds, Math.round), [6, 4]);
});

test('attribute: a line nobody was heard on goes with the line before it', () => {
  const tracks = [track(0, 0, 3, 0), track(0, 6, 9, 1)];
  const lines = [{ start: 0, end: 3 }, { start: 3.5, end: 5.5 }, { start: 6, end: 9 }];
  const r = C.attribute(tracks, Int32Array.from([0, 1]), 2, lines, 10 * SR);
  assert.deepEqual(Array.from(r.speakers), [0, 0, 1]);
});

test('attribute: a voice that was never described is left out, and no speakers at all still gives one', () => {
  const lines = [{ start: 0, end: 5 }];
  const r = C.attribute([track(0, 0, 5, -1)], new Int32Array(0), 0, lines, 10 * SR);
  assert.deepEqual(Array.from(r.speakers), [0]);
  assert.equal(r.count, 1);
});

test('pieceEnd: a cut lands in the quietest moment of the last 6 s, never mid-word', () => {
  const r = rng(1), audio = Float32Array.from({ length: 70 * SR }, () => (r() - 0.5) * 0.2);
  audio.fill(0, 27 * SR, 27.3 * SR);                   /* a pause at 27 s */
  const end = C.pieceEnd(audio, 0);
  assert.ok(end >= 27 * SR && end <= 27.3 * SR, `cut at ${end / SR}s`);
  assert.ok(C.pieceEnd(audio, end) - end <= 30 * SR);
  assert.equal(C.pieceEnd(audio, 50 * SR), audio.length, 'the last piece runs to the end');
});

test('silent: a quiet room is silent, speech is not', () => {
  const r = rng(6);
  const room = Float32Array.from({ length: SR }, () => (r() - 0.5) * 0.002);
  const talk = Float32Array.from({ length: SR }, () => (r() - 0.5) * 0.2);
  assert.equal(C.silent(room, 0, SR), true);
  assert.equal(C.silent(talk, 0, SR), false);
});

test('clean: what the transcriber says over silence is dropped, real words are kept', () => {
  for (const junk of [' Thank you.', 'you', '(laughs)', '[BLANK_AUDIO]', '*music*', '   ']) assert.equal(C.clean(junk), '', junk);
  assert.equal(C.clean('  Thank you   for coming. '), 'Thank you for coming.');
  assert.equal(C.clean('Right [MUSIC] shall we start?'), 'Right shall we start?');
});

test('lines: times are set against the whole recording, and a missing end is filled in', () => {
  const got = C.lines({ text: 'x', chunks: [
    { timestamp: [0, 2.5], text: ' Hello there.' },
    { timestamp: [2.5, null], text: ' [BLANK_AUDIO]' },
    { timestamp: [3, null], text: ' Shall we start?' }
  ] }, 60, 28);
  assert.deepEqual(JSON.parse(JSON.stringify(got)), [
    { start: 60, end: 62.5, text: 'Hello there.' },
    { start: 63, end: 88, text: 'Shall we start?' }
  ]);
});

test('lines: a result with no timed chunks still gives its text, and times never leave the piece', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(C.lines({ text: ' Just this.' }, 30, 12))), [{ start: 30, end: 42, text: 'Just this.' }]);
  const odd = C.lines({ chunks: [{ timestamp: [29, 35], text: 'late' }, { timestamp: [5, 2], text: 'backwards' }] }, 0, 30);
  for (const l of odd) assert.ok(l.start >= 0 && l.end <= 30 && l.end > l.start, JSON.stringify(l));
});

test('the page, the engine and the arithmetic agree on their file names and models', () => {
  const page = readFileSync(join(REPO, 'transcribe/index.html'), 'utf8');
  const worker = readFileSync(join(REPO, 'transcribe/_worker.js'), 'utf8');
  assert.match(page, /new Worker\('_worker\.js\?v=' \+ VERSION\)/);
  assert.match(worker, /importScripts\('_core\.js'/);
  /* The library is asked for at one exact version, and the README names the same one. */
  const readme = readFileSync(join(REPO, 'transcribe/README.md'), 'utf8');
  const version = worker.match(/@huggingface\/transformers@(\d+\.\d+\.\d+)\/dist\/transformers\.min\.js/)[1];
  assert.ok(readme.includes(version + ','), `the README does not say ${version}`);
  /* Every model the code asks for is in the README. */
  for (const m of (page + worker).match(/(Xenova|onnx-community)\/[\w.-]+/g)) {
    const short = m.replace(/^Xenova\/whisper-(base|small)\.en$/, '-$1.en');
    assert.ok(readme.includes(short), `${m} is not in the README`);
  }
});
