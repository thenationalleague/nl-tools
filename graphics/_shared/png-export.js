/* ============================================================
   Graphic PNG export — shared
   File: /graphics/_shared/png-export.js
   Version: v1.0 (09/10/2026)

   One export path for the DOM-drawn graphics (fixtures/results card,
   league table) and for the scheduled batch that renders them, so a fix
   to how crests are captured lands everywhere at once. Before this, the
   same wait-then-inline routine lived in three tools and the same
   crest-loss bug was fixed three separate times.

   Needs window.htmlToImage (html-to-image 1.11.11) on the page. The caller
   must have the graphic unscaled at full size before calling.

   API (window.NL_GFX_EXPORT)
     toPng(el, width, height) → Promise<{ blob, late, missing[] }>
       late     number of images that never loaded (drawn blank)
       missing  their file names, so an error can say which

   CHANGELOG
     v1.0 09/10/2026  Lifted from graphics/_shared/fixtures-card.js v1.1,
                      which had it from fixtures-app.js v1.11.
   ============================================================ */
(function (root) {
  "use strict";

  function toPng(el, width, height) {
    var restore = function () {};
    return Promise.resolve(document.fonts && document.fonts.ready).then(function () {
      /* Wait for every crest and logo to finish loading FIRST: inlineImages
         can only convert an image the browser already holds, so exporting
         before they land silently drops them. */
      var pending = [].slice.call(el.querySelectorAll("img"));
      return Promise.all(pending.map(function (img) { return whenImageReady(img, 10000); }))
        .then(function (ok) { return { ok: ok, imgs: pending }; });
    }).then(function (res) {
      var missing = res.imgs.filter(function (img, i) {
        /* An image a tool hid on purpose (onerror → display:none) still counts:
           the graphic went out without it. */
        return !res.ok[i];
      }).map(function (img) { return decodeURIComponent(img.getAttribute("src") || "").split("/").pop(); });
      restore = inlineImages(el);   /* pre-inline so the canvas isn't tainted */
      return root.htmlToImage.toBlob(el, {
        width: width, height: height, pixelRatio: 1, cacheBust: false,
        backgroundColor: getComputedStyle(el).backgroundColor
      }).then(function (blob) { return { blob: blob, late: missing.length, missing: missing }; });
    }).then(function (r) { try { restore(); } catch (e) {} return r; },
            function (err) { try { restore(); } catch (e) {} throw err; });
  }

  /* Resolve once an <img> has decoded, or once it's clear it won't. */
  function whenImageReady(img, ms) {
    return new Promise(function (resolve) {
      if (img.complete && img.naturalWidth) return resolve(true);
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onError);
        resolve(ok);
      }
      function onLoad() { finish(!!img.naturalWidth); }
      function onError() { finish(false); }
      var timer = setTimeout(function () { finish(false); }, ms || 10000);
      img.addEventListener("load", onLoad);
      img.addEventListener("error", onError);
    });
  }

  /* Convert every <img> to a data URL via canvas so html-to-image never
     fetches cross-origin. An image that can't be converted is blanked for
     the capture, so export is never blocked. Returns a restore fn. */
  function inlineImages(rootEl) {
    var BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    var imgs = [].slice.call(rootEl.querySelectorAll("img"));
    var restores = [];
    imgs.forEach(function (img) {
      var src = img.getAttribute("src") || "";
      if (!src || src.indexOf("data:") === 0) return;
      var done = false;
      try {
        if (img.complete && img.naturalWidth) {
          var c = document.createElement("canvas");
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext("2d").drawImage(img, 0, 0);
          var url = c.toDataURL("image/png");   /* throws if tainted */
          restores.push([img, src]); img.setAttribute("src", url); done = true;
        }
      } catch (e) {}
      if (!done) { restores.push([img, src]); img.setAttribute("src", BLANK); }
    });
    return function () { restores.forEach(function (p) { p[0].setAttribute("src", p[1]); }); };
  }

  root.NL_GFX_EXPORT = { VERSION: "v1.0", toPng: toPng, whenImageReady: whenImageReady, inlineImages: inlineImages };
})(typeof window !== "undefined" ? window : this);
