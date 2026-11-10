/* ============================================================
   Canvas art — shared
   File: /graphics/_shared/canvas-art.js
   Version: v1.0 (10/11/2026)

   Draws a large image small on a canvas without crunching it. Used by the
   canvas-drawn graphics: Round Up and Monthly Awards Full Photo. It lived in
   the Round Up alone (v1.4, 24/10/2026) until a second tool needed it.

   WHY
   One drawImage from a big image straight to a small size, at the default
   ("low") smoothing, is what crunched the Enterprise National League badge:
   2,400px drawn at 110. Halving the image until it is within twice the size
   it lands at, then one high-quality step, keeps it clean. Placing it on
   whole pixels stops the canvas resampling it a second time. Each size is
   kept on the image, so dragging or redrawing at the same size is cheap.

   API (window.NL_GFX_ART)
     draw(g, img, x, y, w, h, k)
       g     the 2D context, already transformed by k
       img   an <img> or canvas
       x, y, w, h  where it lands, in the graphic's own units
       k     the context's scale (2 for a sharp preview, 1 for the export)
   ============================================================ */
(function (root) {
  "use strict";

  function sized(img, tw, th) {
    var cache = img._gfxSized || (img._gfxSized = {});
    var key = tw + "x" + th;
    if (!cache[key]) {
      var keys = Object.keys(cache);
      if (keys.length > 12) delete cache[keys[0]];
      var src = img, sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
      while (sw / 2 >= tw && sh / 2 >= th) {
        var half = document.createElement("canvas");
        half.width = Math.round(sw / 2); half.height = Math.round(sh / 2);
        var hg = half.getContext("2d");
        hg.imageSmoothingQuality = "high";
        hg.drawImage(src, 0, 0, half.width, half.height);
        src = half; sw = half.width; sh = half.height;
      }
      var out = document.createElement("canvas");
      out.width = tw; out.height = th;
      var og = out.getContext("2d");
      og.imageSmoothingQuality = "high";
      og.drawImage(src, 0, 0, tw, th);
      cache[key] = out;
    }
    return cache[key];
  }

  function draw(g, img, x, y, w, h, k) {
    k = k || 1;
    var tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k));
    g.drawImage(sized(img, tw, th), Math.round(x * k) / k, Math.round(y * k) / k, tw / k, th / k);
  }

  root.NL_GFX_ART = { VERSION: "v1.0", draw: draw };
})(typeof window !== "undefined" ? window : this);
