/*
  Programme Packs — minimal ZIP writer
  Version: v1.0 (03/08/2026) — initial build.
  File: /programme/_zip.js

  Builds a ZIP in the browser with no dependency and no build step, which is
  the repo's whole posture. Exposes window.PPZip:

    PPZip.crc32(bytes)            → unsigned 32-bit CRC (pure, tested)
    PPZip.build(entries)          → Blob   entries: [{ name, data: Uint8Array }]
    PPZip.uniqueName(name, taken) → a non-colliding entry name (pure, tested)

  Stored, not deflated
  --------------------
  Every entry uses method 0 (store). What goes in these packs is PNG, JPEG and
  PDF — all already compressed — so deflate would spend CPU to save a percent or
  two, and it would mean shipping an inflate/deflate implementation or a vendored
  library for no gain. A stored ZIP is a completely standard archive: Finder,
  File Explorer and every unzip tool open it without comment.

  Deliberately not streamed: the whole archive is assembled in memory. A club
  folder is tens of megabytes of stills, and the alternative (a streaming writer
  or a server-side zipper) is a lot of machinery for a case that fits in a tab.
  The caller is responsible for not asking for something absurd — see MAX_BYTES
  in _shared.js and the guard in the download flow.
*/
(function () {
  'use strict';

  /* Standard CRC-32 (IEEE 802.3), table built once on first use. */
  var TABLE = null;
  function table() {
    if (TABLE) return TABLE;
    TABLE = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      TABLE[n] = c >>> 0;
    }
    return TABLE;
  }

  function crc32(bytes) {
    var t = table(), c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ZIP stores names as bytes. Everything here is written UTF-8 with the
     language-encoding flag set, so accented club names survive the round trip
     instead of arriving as mojibake. */
  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var out = [], s = unescape(encodeURIComponent(String(str)));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xFF);
    return new Uint8Array(out);
  }

  /* Two files in one folder can legitimately share a name — different uploads,
     same filename — and a ZIP with duplicate entries unpacks unpredictably.
     Suffix the later ones the way a desktop would: "crest (2).png". */
  function uniqueName(name, taken) {
    name = String(name || 'file');
    if (!taken[name]) { taken[name] = true; return name; }
    var dot = name.lastIndexOf('.');
    var stem = dot > 0 ? name.slice(0, dot) : name;
    var ext = dot > 0 ? name.slice(dot) : '';
    for (var n = 2; n < 10000; n++) {
      var candidate = stem + ' (' + n + ')' + ext;
      if (!taken[candidate]) { taken[candidate] = true; return candidate; }
    }
    taken[name + '-' + Date.now()] = true;
    return name + '-' + Date.now();
  }

  function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
  function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }

  /* entries: [{ name, data: Uint8Array }] → Blob (application/zip) */
  function build(entries) {
    var parts = [], central = [], offset = 0;
    var FLAG_UTF8 = 0x0800;

    entries.forEach(function (e) {
      var nameBytes = utf8(e.name);
      var data = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data || 0);
      var crc = crc32(data);

      /* DOS timestamp fields are left at zero. Unzip tools show an epoch date
         rather than refusing the archive, and the real timestamps live in the
         library anyway — carrying them would mean a date conversion for
         cosmetics. */
      var local = [].concat(
        u32(0x04034b50), u16(20), u16(FLAG_UTF8), u16(0),
        u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0)
      );
      parts.push(new Uint8Array(local), nameBytes, data);

      central.push([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(FLAG_UTF8), u16(0),
        u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset)
      ));
      central.push(nameBytes);

      offset += local.length + nameBytes.length + data.length;
    });

    var centralParts = [], centralSize = 0;
    central.forEach(function (c) {
      var arr = c instanceof Uint8Array ? c : new Uint8Array(c);
      centralParts.push(arr);
      centralSize += arr.length;
    });

    var eocd = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0),
      u16(entries.length), u16(entries.length),
      u32(centralSize), u32(offset), u16(0)
    ));

    return new Blob(parts.concat(centralParts, [eocd]), { type: 'application/zip' });
  }

  window.PPZip = { crc32: crc32, build: build, uniqueName: uniqueName, utf8: utf8 };
})();
