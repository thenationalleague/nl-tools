/* ============================================================
   Graphic preview fit — shared
   File: /graphics/_shared/preview-fit.js
   Version: v1.1 (31/10/2026)

   Scales a graphic drawn at full size (1080 wide) down to fit the preview
   column and the window, so the whole card is on screen without the page
   scrolling. Used by the Fixtures & Results, League Table and Academy &
   Alliance tools, which each carried their own copy of this until 28/10/2026
   — and all three copies let the page overrun the window by a few pixels.

   WHY THE HEIGHT IS WORKED OUT THE WAY IT IS
   The preview is sticky, so it must not measure where it happens to sit: a
   taller graphic moves the pinned panel, which changes the space it reports,
   which grows the graphic again — it crept larger on every redraw once the
   page was scrolled. So the budget comes from things that don't move when
   the graphic resizes: the preview's top (the sticky offset, or where it
   sits unscrolled, whichever is lower), the preview's own header, and the
   padding and border below the graphic.

   The old copies left out the space below the graphic (the preview's bottom
   padding and border, and the page's bottom padding) and used the sticky
   offset even before the page scrolls, when the preview sits lower than it.
   Together that overran a 1080p window by about 34px: the "ever so slight
   scroll" reported on 28/10/2026.

   THE CONTROL COLUMN
   The preview fitting was not enough on its own: a long column of controls
   beside it (a 12-game list) still made the page scroll. So fit() also
   sets --column-h on the page: the height left for a column, top to the
   bottom of the window. A tool caps its control panel at that height and
   lets one flexible part (a list) take the space that is left and scroll
   by itself. Unset (none) in the single-column layout, where the page
   scrolls anyway.

   CHANGELOG
     v1.1 31/10/2026  Sets --column-h for the control panel.
     v1.0 28/10/2026  Lifted out of the three tools.

   API (window.NL_GFX_FIT)
     fit(stageWrap, gfxHost, width, height)
       stageWrap  the element the preview sits in (inside .preview)
       gfxHost    holds the .gfx element; sized to the scaled card
       width/height  the card's full size in pixels
   ============================================================ */
(function (root) {
  "use strict";

  function px(v) { return parseFloat(v) || 0; }

  function fit(stageWrap, gfxHost, width, height) {
    var gfx = gfxHost && gfxHost.querySelector(".gfx");
    if (!gfx) return;
    var availW = stageWrap.clientWidth - 24;
    var availH = root.innerHeight - 24;
    var column = "none";

    var preview = stageWrap.closest ? stageWrap.closest(".preview") : stageWrap.parentNode;
    if (preview) {
      var pv = getComputedStyle(preview);
      var pinned = (pv.position === "sticky" || pv.position === "fixed") ? px(pv.top) : NaN;
      /* Not pinned (the single-column layout): the preview scrolls with the
         page, so the window is the only limit worth applying. */
      if (!isNaN(pinned)) {
        var page = preview.parentNode, pg = getComputedStyle(page);
        /* Where the preview sits before any scrolling: its column's top plus
           the column's top padding. Read from the column, not the preview,
           because a stuck preview reports its stuck position. */
        var unscrolled = page.getBoundingClientRect().top + root.scrollY + px(pg.paddingTop);
        var top = Math.max(pinned, unscrolled);
        var chrome = stageWrap.getBoundingClientRect().top - preview.getBoundingClientRect().top;
        var below = px(pv.paddingBottom) + px(pv.borderBottomWidth) + px(pg.paddingBottom);
        availH = root.innerHeight - top - chrome - below - 2;
        column = Math.max(320, Math.floor(root.innerHeight - unscrolled - px(pg.paddingBottom) - 2)) + "px";
      }
      preview.parentNode.style.setProperty("--column-h", column);
    }

    var scale = Math.min(1, availW / width);
    if (availH > 160) scale = Math.min(scale, availH / height);
    gfx.style.transformOrigin = "top left";
    gfx.style.transform = "scale(" + scale + ")";
    gfxHost.style.width = (width * scale) + "px";
    gfxHost.style.height = (height * scale) + "px";
  }

  root.NL_GFX_FIT = { VERSION: "v1.1", fit: fit };
})(typeof window !== "undefined" ? window : this);
