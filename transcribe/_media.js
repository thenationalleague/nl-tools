/* Transcribe — reading a large video (transcribe/_media.js).

   The page's first way of reading a recording hands the browser the whole
   file. A browser will not hold more than about 2 GB that way, and a long
   video is bigger than that, though the sound in it is a few dozen MB. This
   reads only the sound: it finds where each piece of audio sits in the file,
   reads those pieces and nothing else, and has the browser decode them a few
   at a time. Works on MP4, MOV and M4A, in a browser that has AudioDecoder.

   The file is opened with mp4box (README.md says from where). What is taken
   from it, and how that is known:
   - createFile(false): parse the index, skip the picture and sound data;
     appendBuffer(MP4BoxBuffer.fromArrayBuffer(bytes, position)) returns the
     position it wants next, which is how the skipped data is never read.
   - onReady(info): info.audioTracks[n] = { id, codec, nb_samples,
     audio: { sample_rate, channel_count } }, info.isFragmented.
   - getTrackSamplesInfo(id): [{ offset, size, cts, duration, timescale,
     description }], offset and size in bytes within the file.
   - description.esds.esd.findDescriptor(4).findDescriptor(5).data: the few
     bytes an AAC decoder needs first.
   - track.edits[n].media_time: how much of the start of the sound is padding
     the encoder added, in the track's own time units (track.timescale).
   All five are the shapes in mp4box 2.6.0's own type file
   (dist/all-*.d.mts), and all five were run in Chrome on 25/11/2026 against
   files written by ffmpeg: index first, index last, fragmented, MOV, and one
   of 2.4 GB.

   TranscribeMedia.isMp4(file)             -> boolean
   TranscribeMedia.decodeMp4(file, tick)   -> Promise<Float32Array>, 16 kHz mono
     tick(done, total) is called as it goes. Rejects with an Error whose
     .plain is a sentence fit to show. */
(function (root) {
  'use strict';

  var LIBRARY = 'https://cdn.jsdelivr.net/npm/mp4box@2.6.0/dist/mp4box.all.mjs';
  var INDEX_READ = 4 * 1048576;     /* bytes read at a time while looking for the index */
  var RUN_MAX = 1048576;            /* bytes of sound read at a time */
  var LEAD_MAX = 600;               /* seconds: a sound track that starts later than this is not padded */
  var PIECES_MAX = 4e6;             /* compressed sound is ~50 pieces a second; uncompressed is 48,000 */

  function plain(message) { var e = new Error(message); e.plain = message; return e; }

  function isMp4(file) {
    return /\.(mp4|m4a|m4v|mov|3gp)$/i.test(file.name || '') || /^(video|audio)\/(mp4|quicktime|x-m4a|3gpp)/.test(file.type || '');
  }

  /* Find a box of this kind anywhere inside a sample description. QuickTime nests it. */
  function find(box, kind, depth) {
    if (!box || depth > 4) return null;
    if (box[kind]) return box[kind];
    var kids = box.boxes || [];
    for (var i = 0; i < kids.length; i++) { var got = find(kids[i], kind, depth + 1); if (got) return got; }
    return null;
  }

  function firstBytes(description) {
    var esds = find(description, 'esds', 0);
    try {
      var info = esds.esd.findDescriptor(4).findDescriptor(5);
      return info && info.data ? new Uint8Array(info.data) : null;
    } catch (e) { return null; }
  }

  /* Read the file's index and return where its sound is. */
  async function index(file, lib) {
    var mp4 = lib.createFile(false), info = null, broken = null, pos = 0, uncompressed = false;
    mp4.onReady = function (i) { info = i; };
    /* The library lists every piece of every track as soon as it has the index. Sound
       stored uncompressed (common in MOV from cameras and editors) counts each sample
       as a piece: a long recording is hundreds of millions of them, which would freeze
       the page. Such a track is left unlisted and reported instead. This leans on the
       library's inside (buildTrakSampleLists, stbl.stsz.sample_count), so it is only
       done where both are there. */
    var list = mp4.buildTrakSampleLists;
    if (typeof list === 'function') {
      mp4.buildTrakSampleLists = function (trak) {
        var stbl = trak && trak.mdia && trak.mdia.minf && trak.mdia.minf.stbl, size = stbl && (stbl.stsz || stbl.stz2);
        if (size && size.sample_count > PIECES_MAX) {
          trak.samples = []; trak.samples_duration = 0; trak.samples_size = 0;
          if (trak.mdia.hdlr && trak.mdia.hdlr.handler === 'soun') uncompressed = true;
          return;
        }
        return list.call(mp4, trak);
      };
    }
    mp4.onError = function (where, message) { broken = message || where; };
    /* A fragmented file keeps a little index in front of every few seconds, so all of it is walked. */
    while (pos < file.size && !broken && !(info && !info.isFragmented)) {
      var bytes = await file.slice(pos, Math.min(file.size, pos + INDEX_READ)).arrayBuffer();
      var next = mp4.appendBuffer(lib.MP4BoxBuffer.fromArrayBuffer(bytes, pos));
      pos = next > pos ? next : pos + bytes.byteLength;
    }
    mp4.flush();
    if (!info) throw plain('That file could not be read as audio. It may be damaged or cut short.');
    var track = info.audioTracks && info.audioTracks[0];
    var samples = track ? mp4.getTrackSamplesInfo(track.id) || [] : [];
    if (!samples.length) {
      var other = (info.tracks || []).some(function (t) { return t.audio || /^(sowt|twos|lpcm|in24|in32|fl32|fl64|ipcm|fpcm|raw )/.test(t.codec || ''); });
      if (uncompressed || (!track && other)) throw plain('The sound in that file is stored in a way that cannot be read from a file this large. Export its audio as M4A or MP3 and use that.');
      throw plain('There is no sound in that file.');
    }
    return { track: track, samples: samples };
  }

  async function decodeMp4(file, tick) {
    if (typeof AudioDecoder === 'undefined' || typeof EncodedAudioChunk === 'undefined') {
      throw plain('This browser cannot read a video this large. Use Chrome or Edge.');
    }
    var C = root.TranscribeCore;
    var lib = await import(LIBRARY);
    var found = await index(file, lib), track = found.track, samples = found.samples;

    var config = { codec: track.codec, sampleRate: track.audio.sample_rate, numberOfChannels: track.audio.channel_count };
    var first = firstBytes(samples[0].description);
    if (first) config.description = first;
    var ok = await AudioDecoder.isConfigSupported(config).then(function (r) { return r && r.supported; }, function () { return false; });
    if (!ok) throw plain('The sound in that file is in a format this browser cannot play (' + track.codec + '). Export the audio as M4A or MP3 and use that.');

    var out = [], total = 0, convert = null, failed = null;
    function keep(part) { if (part.length) { out.push(part); total += part.length; } }

    /* An encoder puts a few hundredths of a second of padding before the sound and
       the file says how much. Left in, every time on the transcript would be late by it. */
    var padding = 0, skip = -1;
    for (var e = 0; e < (track.edits || []).length; e++) {
      if (track.edits[e].media_time > 0) { padding = track.edits[e].media_time / track.timescale; break; }
    }

    /* The sound can start after the picture does. Keep the gap, so the times on the
       transcript match the times in a video player. */
    var lead = samples[0].cts / samples[0].timescale;
    if (lead > 0.02 && lead < LEAD_MAX) keep(new Float32Array(Math.round(lead * C.SR)));

    var decoder = new AudioDecoder({
      output: function (frame) {
        try {
          var n = frame.numberOfFrames, ch = frame.numberOfChannels, mono = new Float32Array(n), plane = new Float32Array(n);
          for (var c = 0; c < ch; c++) {
            frame.copyTo(plane, { planeIndex: c, format: 'f32-planar' });
            for (var i = 0; i < n; i++) mono[i] += plane[i] / ch;
          }
          if (!convert) { convert = C.resampler(frame.sampleRate); skip = Math.round(padding * frame.sampleRate); }
          if (skip > 0) { var cut = Math.min(skip, n); mono = mono.subarray(cut); skip -= cut; }
          if (mono.length) keep(convert.push(mono));
        } catch (e) { failed = failed || e; }
        frame.close();
      },
      error: function (e) { failed = failed || e; }
    });
    decoder.configure(config);

    var i = 0;
    while (i < samples.length && !failed) {
      /* Sound is stored in short runs between the pictures: read one run at a time. */
      var from = samples[i].offset, to = from + samples[i].size, j = i + 1;
      while (j < samples.length && samples[j].offset === to && to - from < RUN_MAX) { to += samples[j].size; j++; }
      var bytes = await file.slice(from, to).arrayBuffer();
      if (bytes.byteLength < to - from) throw plain('That file is cut short: its index points past its end.');
      for (; i < j; i++) {
        var s = samples[i];
        decoder.decode(new EncodedAudioChunk({
          type: 'key',
          timestamp: Math.round(s.cts * 1e6 / s.timescale),
          duration: Math.round(s.duration * 1e6 / s.timescale),
          data: new Uint8Array(bytes, s.offset - from, s.size)
        }));
      }
      while (decoder.decodeQueueSize > 64 && !failed) {
        await new Promise(function (go) { decoder.addEventListener('dequeue', go, { once: true }); setTimeout(go, 200); });
      }
      if (tick) tick(i, samples.length);
    }
    if (!failed) await decoder.flush().catch(function (e) { failed = failed || e; });
    try { decoder.close(); } catch (e) { /* already closed by its own error */ }
    if (failed) throw plain('The sound in that file could not be decoded (' + (failed.message || failed) + ').');
    if (convert) keep(convert.end());
    if (!total) throw plain('There is no sound in that file.');

    var audio = new Float32Array(total), at = 0;
    for (var k = 0; k < out.length; k++) { audio.set(out[k], at); at += out[k].length; }
    return audio;
  }

  root.TranscribeMedia = { isMp4: isMp4, decodeMp4: decodeMp4 };
})(typeof self !== 'undefined' ? self : this);
