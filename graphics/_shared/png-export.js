/* ============================================================
   Graphic PNG export — shared
   File: /graphics/_shared/png-export.js
   Version: v1.1 (10/10/2026)

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
     v1.1 10/10/2026  For Safari on a slow Mac, where the TIC Health logo was
                      on screen but missing from every exported table:
                      - each image is inlined at no more than twice the size
                        it is drawn, not its full size (the 1,722px logo was
                        a ~300KB data URL for a 180px slot; Safari drops large
                        images when it draws the page into a picture);
                      - in Safari the picture is drawn twice and the first
                        thrown away — Safari only decodes images inside the
                        page-as-picture on the first pass (html-to-image's
                        known Safari issue);
                      - a slow image gets 30 seconds, not 10, and an image
                        that has already failed is not waited for at all.
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
      return Promise.all(pending.map(function (img) { return whenImageReady(img, 30000); }))
        .then(function (ok) { return { ok: ok, imgs: pending }; });
    }).then(function (res) {
      var missing = res.imgs.filter(function (img, i) {
        /* An image a tool hid on purpose (onerror → display:none) still counts:
           the graphic went out without it. */
        return !res.ok[i];
      }).map(function (img) { return decodeURIComponent(img.getAttribute("src") || "").split("/").pop(); });
      restore = inlineImages(el);   /* pre-inline so the canvas isn't tainted */
      var opts = { width: width, height: height, pixelRatio: 1, cacheBust: false,
                   backgroundColor: getComputedStyle(el).backgroundColor };
      var draw = function () { return root.htmlToImage.toBlob(el, opts); };
      return (isSafari() ? draw().then(draw) : draw())
        .then(function (blob) { return { blob: blob, late: missing.length, missing: missing }; });
    }).then(function (r) { try { restore(); } catch (e) {} return r; },
            function (err) { try { restore(); } catch (e) {} throw err; });
  }

  /* Safari, not Chrome-on-Mac (whose user agent also says Safari). */
  function isSafari() {
    var ua = (root.navigator && root.navigator.userAgent) || "";
    return /AppleWebKit/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR/.test(ua);
  }

  /* Resolve once an <img> has decoded, or once it's clear it won't. */
  function whenImageReady(img, ms) {
    return new Promise(function (resolve) {
      if (img.complete && img.naturalWidth) return resolve(true);
      /* Already failed: complete with no pixels. Its error event has been and
         gone, so waiting for one would just sit out the whole timeout. */
      if (img.complete && img.getAttribute("src")) return resolve(false);
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
          /* No bigger than twice the size it is drawn: sharp at export size,
             and small enough that Safari keeps it. */
          var drawn = img.getBoundingClientRect().width || img.naturalWidth;
          var scale = Math.min(1, (drawn * 2) / img.naturalWidth);
          var c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.naturalWidth * scale));
          c.height = Math.max(1, Math.round(img.naturalHeight * scale));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          var url = c.toDataURL("image/png");   /* throws if tainted */
          restores.push([img, src]); img.setAttribute("src", url); done = true;
        }
      } catch (e) {}
      if (!done) { restores.push([img, src]); img.setAttribute("src", BLANK); }
    });
    return function () { restores.forEach(function (p) { p[0].setAttribute("src", p[1]); }); };
  }

  root.NL_GFX_EXPORT = { VERSION: "v1.1", toPng: toPng, whenImageReady: whenImageReady, inlineImages: inlineImages, isSafari: isSafari };
})(typeof window !== "undefined" ? window : this);
