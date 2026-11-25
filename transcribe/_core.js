/* Transcribe — the arithmetic (transcribe/_core.js).

   No browser, no model, no network: where to cut a recording into pieces the
   transcriber can take, how to tidy what it returns, and, from what two
   speaker models return, how many voices there are and which voice each line
   belongs to. Loaded by _worker.js with importScripts, and by
   tests/transcribe-core.test.mjs.

   The two models, and where their shapes come from:
   - Segmentation (pyannote segmentation 3.0): 10 s of 16 kHz audio in, one
     row of 7 scores per 270 samples out. The 7 classes are the "powerset" of
     up to three voices in that window: none, A, B, C, A+B, A+C, B+C
     (Plaquet & Bredin 2023, arXiv 2305.13262). offset 990 / step 270 are the
     values in the model's preprocessor_config.json on Hugging Face
     (onnx-community/pyannote-segmentation-3.0).
   - Embedding (WeSpeaker ResNet34-LM): a clip of one voice in, 256 numbers
     out; two clips of the same voice give numbers that point the same way.

   A voice is only "A" inside its own window, so every window's voices are
   described by an embedding and the embeddings are grouped across the whole
   recording. That grouping is the speaker list. */
(function (root) {
  'use strict';

  var SR = 16000;
  var WIN = 10 * SR;          /* what the segmentation model was trained on */
  var HOP = 5 * SR;           /* windows overlap by half, so a turn cut by one edge is whole in the next */
  var STEP = 270;             /* samples per output row */
  var OFFSET = 990;
  var GRID = 320;             /* the shared timeline counts in 20 ms */
  var POWERSET = [[], [0], [1], [2], [0, 1], [0, 2], [1, 2]];

  var MIN_CLIP = 0.4;         /* seconds of one voice alone before it is worth describing */
  var MAX_CLIP = 4;           /* seconds described per voice per window: more costs time and adds nothing */
  var STRONG_CLIP = 1.5;      /* seconds before a description is trusted to form a group */
  var MAX_STRONG = 600;       /* grouping compares every pair; beyond this the rest join the nearest group */
  var THRESHOLD = 0.5;        /* cosine distance at which two groups stop being the same voice */
  var MIN_GROUP_SECONDS = 6;  /* a group with less speech than this folds into its nearest neighbour... */
  var MIN_GROUP_SHARE = 0.15; /* ...or less than this share of all the speech, whichever is smaller (so a short clip of two people stays two) */

  function frames(samples) { return Math.max(0, Math.ceil((samples - OFFSET) / STEP)); }

  /* Where each window starts. The last one may run past the end; the caller pads it with silence. */
  function plan(total) {
    var starts = [0];
    for (var s = HOP; s + WIN - HOP < total; s += HOP) starts.push(s);
    return starts;
  }

  /* One window's scores -> three rows of 0/1, a row per voice, plus a row marking
     where exactly one voice is speaking (the only audio fit to describe a voice from). */
  function decode(logits, rows) {
    var classes = POWERSET.length, act = [new Uint8Array(rows), new Uint8Array(rows), new Uint8Array(rows)];
    var solo = new Int8Array(rows).fill(-1);
    for (var i = 0; i < rows; i++) {
      var best = 0, bestV = -Infinity, o = i * classes;
      for (var c = 0; c < classes; c++) if (logits[o + c] > bestV) { bestV = logits[o + c]; best = c; }
      var who = POWERSET[best];
      for (var k = 0; k < who.length; k++) act[who[k]][i] = 1;
      if (who.length === 1) solo[i] = who[0];
    }
    return { act: act, solo: solo };
  }

  /* The audio of one voice speaking alone in one window, joined end to end.
     Returns null when there is too little of it. */
  function clip(audio, start, solo, voice) {
    var n = 0, i, rows = solo.length;
    for (i = 0; i < rows; i++) if (solo[i] === voice && start + i * STEP + STEP <= audio.length) n++;
    if (n * STEP < MIN_CLIP * SR) return null;
    /* Keep the middle of a long stretch: the edges are where another voice is nearest. */
    var keep = Math.min(n, Math.floor(MAX_CLIP * SR / STEP)), skip = Math.floor((n - keep) / 2);
    var out = new Float32Array(keep * STEP), p = 0, seen = 0;
    for (i = 0; i < rows && p < out.length; i++) {
      var a = start + i * STEP;
      if (solo[i] !== voice || a + STEP > audio.length) continue;
      if (seen++ < skip) continue;
      out.set(audio.subarray(a, a + STEP), p); p += STEP;
    }
    return { audio: out, seconds: n * STEP / SR };
  }

  function unit(v) {
    var s = 0, i;
    for (i = 0; i < v.length; i++) s += v[i] * v[i];
    s = Math.sqrt(s) || 1;
    var out = new Float32Array(v.length);
    for (i = 0; i < v.length; i++) out[i] = v[i] / s;
    return out;
  }

  function cosDist(a, b) {
    var dot = 0, na = 0, nb = 0;
    for (var i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return 1 - dot / (Math.sqrt(na * nb) || 1);
  }

  /* Group the descriptions. Start with every description in a group of its own and keep
     joining the two closest groups (a group is described by the sum of its members) until
     the closest pair is further apart than THRESHOLD, or, when the number of people is
     known, until that many groups are left.
     units: [{ emb: Float32Array, seconds: number }]  ->  { labels: Int32Array, count } */
  function group(units, opts) {
    opts = opts || {};
    var want = opts.count > 0 ? opts.count : 0;
    var threshold = opts.threshold || THRESHOLD;
    var n = units.length, labels = new Int32Array(n).fill(-1), i, j;
    if (!n) return { labels: labels, count: 0 };

    var order = [];
    for (i = 0; i < n; i++) if (units[i].seconds >= STRONG_CLIP) order.push(i);
    if (order.length < Math.max(2, want)) { order = []; for (i = 0; i < n; i++) order.push(i); }
    order.sort(function (a, b) { return units[b].seconds - units[a].seconds; });
    if (order.length > MAX_STRONG) order.length = MAX_STRONG;

    var m = order.length, sums = [], secs = [], members = [], alive = [];
    for (i = 0; i < m; i++) {
      sums.push(Float32Array.from(unit(units[order[i]].emb)));
      secs.push(units[order[i]].seconds); members.push([order[i]]); alive.push(true);
    }
    var d = new Float32Array(m * m);
    for (i = 0; i < m; i++) for (j = i + 1; j < m; j++) d[i * m + j] = d[j * m + i] = cosDist(sums[i], sums[j]);

    var left = m;
    function closest() {
      var best = Infinity, bi = -1, bj = -1;
      for (var a = 0; a < m; a++) {
        if (!alive[a]) continue;
        for (var b = a + 1; b < m; b++) if (alive[b] && d[a * m + b] < best) { best = d[a * m + b]; bi = a; bj = b; }
      }
      return { i: bi, j: bj, d: best };
    }
    function join(a, b) {
      for (var k = 0; k < sums[a].length; k++) sums[a][k] += sums[b][k];
      secs[a] += secs[b]; members[a] = members[a].concat(members[b]); alive[b] = false; left--;
      for (var c = 0; c < m; c++) if (alive[c] && c !== a) d[a * m + c] = d[c * m + a] = cosDist(sums[a], sums[c]);
    }
    while (left > Math.max(1, want)) {
      var c = closest();
      if (c.i < 0 || (!want && c.d > threshold)) break;
      join(c.i, c.j);
    }
    /* Nobody said how many people there are: a group with only a few seconds in it is
       far more often a cough, a laugh or two people at once than a real extra person. */
    if (!want) {
      var all = 0;
      for (i = 0; i < m; i++) if (alive[i]) all += secs[i];
      var floor = Math.min(MIN_GROUP_SECONDS, all * MIN_GROUP_SHARE);
      for (;;) {
        var small = -1;
        for (i = 0; i < m; i++) if (alive[i] && secs[i] < floor && (small < 0 || secs[i] < secs[small])) small = i;
        if (small < 0 || left < 2) break;
        var near = -1, nd = Infinity;
        for (j = 0; j < m; j++) if (alive[j] && j !== small && d[small * m + j] < nd) { nd = d[small * m + j]; near = j; }
        join(near, small);
      }
    }

    var ids = [], g = 0;
    for (i = 0; i < m; i++) if (alive[i]) { ids.push(i); for (j = 0; j < members[i].length; j++) labels[members[i][j]] = g; g++; }
    /* Descriptions too short to help form the groups join whichever group they sit closest to. */
    for (i = 0; i < n; i++) {
      if (labels[i] >= 0) continue;
      var e = unit(units[i].emb), bd = Infinity, bg = 0;
      for (j = 0; j < ids.length; j++) { var dd = cosDist(e, sums[ids[j]]); if (dd < bd) { bd = dd; bg = j; } }
      labels[i] = bg;
    }
    return { labels: labels, count: g };
  }

  /* Lay every window's voices onto one timeline, then give each line of the transcript
     to whoever speaks for most of it.
     tracks: [{ start (samples), act (Uint8Array, one per row), unit (index into labels, or -1) }]
     lines:  [{ start, end }] in seconds
     ->  { speakers: Int32Array (per line, numbered in order of first appearance), count, seconds: [] } */
  function attribute(tracks, labels, count, lines, total) {
    var cells = Math.ceil(total / GRID) + 1, votes = [], g, i, t;
    for (g = 0; g < count; g++) votes.push(new Uint16Array(cells));
    for (t = 0; t < tracks.length; t++) {
      var tr = tracks[t];
      if (tr.unit < 0 || labels[tr.unit] < 0) continue;
      var v = votes[labels[tr.unit]];
      for (i = 0; i < tr.act.length; i++) {
        if (!tr.act[i]) continue;
        var cell = Math.floor((tr.start + i * STEP + OFFSET / 2) / GRID);
        if (cell < cells) v[cell]++;
      }
    }
    var raw = new Int32Array(lines.length).fill(-1);
    for (i = 0; i < lines.length; i++) {
      var a = Math.max(0, Math.floor(lines[i].start * SR / GRID)), b = Math.min(cells - 1, Math.ceil(lines[i].end * SR / GRID));
      var best = -1, bestN = 0;
      for (g = 0; g < count; g++) {
        var sum = 0;
        for (var c = a; c <= b; c++) sum += votes[g][c];
        if (sum > bestN) { bestN = sum; best = g; }
      }
      raw[i] = best;
    }
    /* A line nobody was heard on (a pause the transcriber put words to) goes with the line before it. */
    for (i = 0; i < raw.length; i++) if (raw[i] < 0) raw[i] = i ? raw[i - 1] : -1;
    for (i = raw.length - 2; i >= 0; i--) if (raw[i] < 0) raw[i] = raw[i + 1];

    /* Speaker 1 is whoever is heard first. */
    var seen = {}, next = 0, speakers = new Int32Array(lines.length), seconds = [];
    for (i = 0; i < raw.length; i++) {
      if (raw[i] < 0) { speakers[i] = 0; continue; }
      if (!(raw[i] in seen)) { seen[raw[i]] = next++; seconds.push(0); }
      speakers[i] = seen[raw[i]];
      seconds[speakers[i]] += Math.max(0, lines[i].end - lines[i].start);
    }
    if (!next) { next = 1; seconds = [0]; }
    return { speakers: speakers, count: next, seconds: seconds };
  }

  /* ── Cutting the recording up, and tidying what comes back ───────────────── */

  var PIECE = 30 * SR;        /* the transcriber takes 30 s at a time */
  var LOOK_FROM = 24 * SR;    /* so each cut is made at the quietest moment in the last 6 s */
  var SLICE = Math.round(0.05 * SR);
  var SILENT = 0.002;         /* a piece quieter than this has nobody speaking in it */

  function rms(audio, a, b) {
    var x = 0;
    for (var i = a; i < b; i++) x += audio[i] * audio[i];
    return Math.sqrt(x / Math.max(1, b - a));
  }

  /* Where the piece starting at `pos` should end, so that no word is cut in half. */
  function pieceEnd(audio, pos) {
    if (audio.length - pos <= PIECE) return audio.length;
    var best = pos + PIECE, quietest = Infinity;
    for (var f = pos + LOOK_FROM; f + SLICE <= pos + PIECE; f += SLICE) {
      var e = rms(audio, f, f + SLICE);
      if (e < quietest) { quietest = e; best = f + Math.floor(SLICE / 2); }
    }
    return best;
  }

  /* The transcriber puts words to silence ("Thank you."), so a silent piece is never sent to it. */
  function silent(audio, a, b) { return rms(audio, a, b) < SILENT; }

  /* What the transcriber says when it heard nothing, and its stage directions. */
  function clean(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    if (/^(\[[^\]]*\]|\([^)]*\)|\*[^*]*\*)$/.test(t)) return '';
    if (/^(thank you\.?|thanks for watching[.!]?|you\.?|bye\.?)$/i.test(t)) return '';
    return t.replace(/\[(BLANK_AUDIO|MUSIC|NO_SPEECH)\]/gi, '').replace(/\s+/g, ' ').trim();
  }

  /* One piece's result -> lines timed against the whole recording.
     result: { text, chunks: [{ timestamp: [start, end|null], text }] }, the shape
     Transformers.js documents for return_timestamps: true
     (src/pipelines/automatic-speech-recognition.js). The end of the last chunk can be
     null, and a start can come back later than its end; both are put right here.
     from, length: where the piece sits in the recording, in seconds. */
  function lines(result, from, length) {
    var out = [], chunks = (result && result.chunks) || [];
    if (!chunks.length && result && result.text) chunks = [{ timestamp: [0, length], text: result.text }];
    for (var i = 0; i < chunks.length; i++) {
      var text = clean(chunks[i].text);
      if (!text) continue;
      var ts = chunks[i].timestamp || [], a = +ts[0], b = ts[1] == null ? NaN : +ts[1];
      if (!(a >= 0)) a = out.length ? out[out.length - 1].end - from : 0;
      a = Math.min(a, length);
      if (!(b > a)) b = length;
      b = Math.min(b, length);
      if (!(b > a)) a = Math.max(0, b - 0.5);
      out.push({ start: from + a, end: from + b, text: text });
    }
    return out;
  }

  /* ── Changing the sample rate ─────────────────────────────────────────── */

  /* Every model here listens at 16 kHz; recordings arrive at 44.1 or 48. When the
     browser decodes a whole file it converts for us. When a large video is decoded
     a piece at a time (_media.js) it does not, so this does: each output sample is
     a weighted sum of the 64 input samples around it, the weights shaped to remove
     everything above what 16 kHz can carry (which would otherwise fold back into
     the speech as noise). Fed in pieces, it carries on where it left off.
     resampler(48000) -> { push(Float32Array) -> Float32Array, end() -> Float32Array } */
  function resampler(from) {
    if (from === SR) return { push: function (x) { return Float32Array.from(x); }, end: function () { return new Float32Array(0); } };
    var ratio = from / SR, HALF = 32, TAPS = 2 * HALF, PHASES = 256;
    var cutoff = 0.46 / Math.max(1, ratio);           /* in cycles per input sample */
    var table = new Float32Array((PHASES + 1) * TAPS), p, k;
    for (p = 0; p <= PHASES; p++) {
      var sum = 0, o = p * TAPS;
      for (k = 0; k < TAPS; k++) {
        var t = (k - HALF + 1) - p / PHASES, x = 2 * Math.PI * cutoff * t;
        var h = Math.abs(t) >= HALF ? 0 : (x === 0 ? 1 : Math.sin(x) / x) * 0.5 * (1 + Math.cos(Math.PI * t / HALF));
        table[o + k] = h; sum += h;
      }
      for (k = 0; k < TAPS; k++) table[o + k] /= sum;
    }
    var held = new Float32Array(HALF - 1), pos = HALF - 1;   /* silence before the first sample */
    function push(input) {
      var buf = new Float32Array(held.length + input.length);
      buf.set(held, 0); buf.set(input, held.length);
      var out = new Float32Array(Math.max(0, Math.ceil((buf.length - HALF - pos) / ratio) + 1)), n = 0;
      while (Math.floor(pos) + HALF < buf.length) {
        var i = Math.floor(pos), o = Math.round((pos - i) * PHASES) * TAPS, b = i - HALF + 1, acc = 0;
        for (var k = 0; k < TAPS; k++) acc += buf[b + k] * table[o + k];
        out[n++] = acc; pos += ratio;
      }
      var drop = Math.max(0, Math.floor(pos) - HALF + 1);
      held = buf.slice(drop); pos -= drop;
      return out.subarray(0, n);
    }
    return { push: push, end: function () { return push(new Float32Array(HALF)); } };
  }

  root.TranscribeCore = {
    SR: SR, WIN: WIN, HOP: HOP, STEP: STEP, CLASSES: POWERSET.length, THRESHOLD: THRESHOLD,
    frames: frames, plan: plan, decode: decode, clip: clip, group: group, attribute: attribute,
    cosDist: cosDist, pieceEnd: pieceEnd, silent: silent, clean: clean, lines: lines, resampler: resampler
  };
})(typeof self !== 'undefined' ? self : this);
