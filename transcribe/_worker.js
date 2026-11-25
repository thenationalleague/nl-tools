/* Transcribe — the engine (transcribe/_worker.js).

   Runs off the page so the page stays responsive. Takes one recording as
   16 kHz mono samples, transcribes it 30 s at a time, then works out who
   spoke when. The recording never leaves this browser: what is fetched is
   the models, once, from Hugging Face, and the browser keeps them.

   The library is Transformers.js, fetched at a fixed version (README.md
   says from where, and why it is not committed). The arithmetic is _core.js. This file is only the plumbing between
   the two, and the three places it touches something that is not ours:

   - pipeline('automatic-speech-recognition', …)(samples, { return_timestamps: true })
       -> { text, chunks: [{ timestamp: [start, end|null], text }] }
     (the library's src/pipelines/automatic-speech-recognition.js)
   - AutoModelForAudioFrameClassification for onnx-community/pyannote-segmentation-3.0:
       ({ input_values: Tensor[1, 1, samples] }) -> { logits: Tensor[1, rows, 7] }
     (the model card's own example, huggingface.co/onnx-community/pyannote-segmentation-3.0)
   - AutoModel for onnx-community/wespeaker-voxceleb-resnet34-LM, fed by its
     own feature extractor: one tensor out, 256 numbers per clip. Its model
     card is empty, so nothing here trusts its names: it is fed under whatever
     its one input is called, and its answer is found by shape. (Run in Chrome
     on 25/11/2026 against a copy of the model with other names; no difference.)

   Messages in:   { type: 'run', audio, model, speakers }   { type: 'stop' }
                  { type: 'regroup', count }
   Messages out:  { type: 'status', stage, done, total }    { type: 'lines', lines }
                  { type: 'speakers', speakers, count, seconds }
                  { type: 'done', stopped }                 { type: 'error', message } */
'use strict';

importScripts('_core.js' + self.location.search);

var C = self.TranscribeCore;
var LIBRARY = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';
var SEGMENTER = 'onnx-community/pyannote-segmentation-3.0';
var EMBEDDER = 'onnx-community/wespeaker-voxceleb-resnet34-LM';

var T = null;                 /* the library, once imported */
var loaded = {};              /* models by id, so a second recording does not load them again */
var stopped = false;
var kept = null;              /* { tracks, units, lines, total } from the last run, for regrouping */

function post(m) { self.postMessage(m); }

/* The models run without ever handing control back, so a loop of them would not
   hear "stop" until it had finished. This lets a waiting message in. */
function breathe() { return new Promise(function (ok) { setTimeout(ok, 0); }); }

function library() {
  if (T) return Promise.resolve(T);
  return import(LIBRARY).then(function (mod) {
    T = mod;
    /* Without this the library first looks for each model on our own site. */
    T.env.allowLocalModels = false;
    return T;
  });
}

function downloading(info) {
  if (info && info.status === 'progress_total') post({ type: 'status', stage: 'download', done: info.loaded, total: info.total });
}

function once(id, make) {
  if (!loaded[id]) loaded[id] = make().catch(function (e) { delete loaded[id]; throw e; });
  return loaded[id];
}

function transcriber(model) {
  return once(model, function () {
    return T.pipeline('automatic-speech-recognition', model, { device: 'wasm', dtype: 'q8', progress_callback: downloading });
  });
}

function speakerModels() {
  return Promise.all([
    once(SEGMENTER, function () {
      return T.AutoModelForAudioFrameClassification.from_pretrained(SEGMENTER, { device: 'wasm', dtype: 'fp32', progress_callback: downloading });
    }),
    once(EMBEDDER, function () {
      return T.AutoModel.from_pretrained(EMBEDDER, { device: 'wasm', dtype: 'fp32', progress_callback: downloading });
    }),
    once(EMBEDDER + '#features', function () { return T.AutoFeatureExtractor.from_pretrained(EMBEDDER); })
  ]);
}

/* Run a one-input model on a tensor, under whatever name that input has. */
function feed(model, tensor, usual) {
  var names = [];
  for (var k in (model.sessions || {})) names = names.concat(model.sessions[k].inputNames || []);
  var inputs = {};
  inputs[names.length === 1 ? names[0] : usual] = tensor;
  return model(inputs);
}

/* A model's one answer, whatever it is called: the tensor with this many dimensions. */
function answer(out, dims) {
  for (var k in out) {
    var t = out[k];
    if (t && t.data && t.dims && t.dims.length === dims && t.dims[0] === 1) return t;
  }
  throw new Error('A speaker model returned nothing usable.');
}

async function transcribe(audio, model) {
  var asr = await transcriber(model), all = [], pos = 0;
  post({ type: 'status', stage: 'transcribe', done: 0, total: audio.length });
  while (pos < audio.length && !stopped) {
    var end = C.pieceEnd(audio, pos);
    if (!C.silent(audio, pos, end)) {
      /* A copy, not a view: the library hands the samples to code that reads the whole buffer. */
      var result = await asr(audio.slice(pos, end), { return_timestamps: true });
      var got = C.lines(result, pos / C.SR, (end - pos) / C.SR);
      if (got.length) { all = all.concat(got); post({ type: 'lines', lines: got }); }
    }
    pos = end;
    post({ type: 'status', stage: 'transcribe', done: pos, total: audio.length });
    await breathe();
  }
  return all;
}

async function listen(audio) {
  var models = await speakerModels(), segmenter = models[0], embedder = models[1], features = models[2];
  var starts = C.plan(audio.length), tracks = [], units = [];
  post({ type: 'status', stage: 'speakers', done: 0, total: starts.length });
  for (var w = 0; w < starts.length && !stopped; w++) {
    var start = starts[w], win = new Float32Array(C.WIN);
    win.set(audio.subarray(start, Math.min(audio.length, start + C.WIN)));
    var scores = answer(await feed(segmenter, new T.Tensor('float32', win, [1, 1, C.WIN]), 'input_values'), 3);
    if (scores.dims[2] !== C.CLASSES) throw new Error('The speaker model is not the one this page was built for.');
    var heard = C.decode(scores.data, scores.dims[1]);
    for (var v = 0; v < heard.act.length; v++) {
      if (heard.act[v].indexOf(1) < 0) continue;
      var c = C.clip(audio, start, heard.solo, v), u = -1;
      if (c) {
        var described = answer(await feed(embedder, (await features(c.audio)).input_features, 'input_features'), 2);
        u = units.push({ emb: Float32Array.from(described.data), seconds: c.seconds }) - 1;
      }
      tracks.push({ start: start, act: heard.act[v], unit: u });
    }
    post({ type: 'status', stage: 'speakers', done: w + 1, total: starts.length });
    await breathe();
  }
  return { tracks: tracks, units: units };
}

function regroup(count) {
  if (!kept) return;
  var g = C.group(kept.units, { count: count || 0 });
  var r = C.attribute(kept.tracks, g.labels, g.count, kept.lines, kept.total);
  post({ type: 'speakers', speakers: Array.from(r.speakers), count: r.count, seconds: r.seconds });
}

async function run(msg) {
  stopped = false; kept = null;
  var audio = msg.audio;
  await library();
  post({ type: 'status', stage: 'download', done: 0, total: 0 });
  var all = await transcribe(audio, msg.model);
  if (msg.speakers && all.length && !stopped) {
    var heard = await listen(audio);
    if (!stopped) {
      kept = { tracks: heard.tracks, units: heard.units, lines: all.map(function (l) { return { start: l.start, end: l.end }; }), total: audio.length };
      regroup(0);
    }
  }
  post({ type: 'done', stopped: stopped });
}

self.onmessage = function (e) {
  var m = e.data || {};
  if (m.type === 'stop') { stopped = true; return; }
  if (m.type === 'regroup') { try { regroup(m.count); } catch (err) { post({ type: 'error', message: String(err && err.message || err) }); } return; }
  if (m.type === 'run') run(m).catch(function (err) { post({ type: 'error', message: String(err && err.message || err) }); });
};
