/* ============================================================
   Match Graphic — shared renderer
   File: /graphics/_shared/match-graphic.js

   Single source of truth for the 16:9 match graphic artwork. Both the
   interactive tool (/graphics/match-graphic/) and the batch build
   (scripts/build-match-graphics.js) call render() so a one-off made in
   the browser is pixel-identical to the one in the delivered folder.

   Club colours come from /assets/data/clubs-meta.json ONLY. Do not read
   /graphics/_shared/clubs-data.js — that mirror is stale (v1.2 vs v1.10)
   and 29 of its 72 primaries have drifted. It also lacks code/secondary/
   tertiary, which this artwork requires.

   Typeface: the local Carbona-ExtraBold OTF, NOT the carbona-variable
   face from nl-brand.css. That face is served from Typekit, which is
   domain-licensed and would be refused for a headless file:// batch run —
   failing silently to sans-serif. Using the repo copy keeps the browser
   and the batch deterministic and identical.

   DESIGN RULES (agreed 30/07/2026)
     Panels    always the club `primary`, both sides. Never `secondary` —
               a club may play in an away kit that is not its secondary.
     Bands     measured outward from the seam, per club:
               50px primary, then 25px secondary, then 25px tertiary.
               The primary band is the divider; secondary/tertiary read as
               inset pinstriping. Primary meets primary at the seam.
     Text      `secondary` when it is legible on the panel, else `tertiary`.
               Legible = contrast >= 2.5:1 AND not a both-dark pair.
               The both-dark guard exists because WCAG's ratio is unreliable
               at the dark end: it scores Chorley red-on-black at 5.26 while
               rating Worthing white-on-red only 3.89, which is backwards.
               Result across the 72: 66 secondary, 5 tertiary, 1 best-effort.
     Crests    drawn untreated. No outline, box or shadow.
   ============================================================ */
(function (root) {
  'use strict';

  var W = 1920, H = 1080;

  /* Seam: a slight lean off vertical, top-right to bottom-left. */
  var SEAM_TOP_X = 1060, SEAM_BOT_X = 900;

  /* Band widths, outward from the seam centre, per club. */
  var BAND_PRIMARY = 50, BAND_SECONDARY = 25, BAND_TERTIARY = 25;

  var CREST_H = 292;
  var CODE_SIZE = 202;
  var CODE_GAP = 44;               /* crest baseline to code cap height */
  var SIDE_CENTRE_L = 440;         /* code/crest column centres */
  var SIDE_CENTRE_R = 1480;
  var BADGE_H_LANDSCAPE = 270;     /* division marks are 2400x1662 */
  var BADGE_H_PORTRAIT = 340;      /* NL Cup is 2400x3303 */

  var MIN_RATIO = 2.5;             /* admits Braintree 2.61, King's Lynn 2.76 */
  var DARK_FLOOR = 0.25;           /* reject pairs where both colours are dark */

  var FONT_FAMILY = 'NLCarbonaExtraBold';

  /* ---------- colour helpers ---------- */

  function toRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function luminance(hex) {
    var c = toRgb(hex).map(function (v) {
      var s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /* Hue/lightness proximity — used to spot two panels that would read as a
     single flat field. Kept as a reporting aid for the batch build; it does
     NOT change the artwork, because panels always stay on primary. */
  function readsAsSameField(a, b) {
    var ra = toRgb(a), rb = toRgb(b);
    var ha = rgbToHl(ra), hb = rgbToHl(rb);
    var dh = Math.abs(ha.h - hb.h);
    dh = Math.min(dh, 1 - dh) * 360;
    return dh < 18 && Math.abs(ha.l - hb.l) * 100 < 16;
  }

  function rgbToHl(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var l = (mx + mn) / 2, h = 0, d = mx - mn;
    if (d !== 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
      if (h < 0) h += 1;
    }
    return { h: h, l: l };
  }

  function isLegible(bg, fg) {
    return contrast(bg, fg) >= MIN_RATIO &&
           Math.max(luminance(bg), luminance(fg)) >= DARK_FLOOR;
  }

  /* Resolve the drawing colours for one club. */
  function resolveColours(colors) {
    var p = colors.primary, s = colors.secondary, t = colors.tertiary;
    var text, basis;
    if (isLegible(p, s)) { text = s; basis = 'secondary'; }
    else if (isLegible(p, t)) { text = t; basis = 'tertiary'; }
    else {
      text = contrast(p, s) >= contrast(p, t) ? s : t;
      basis = 'best-effort';
    }
    return { panel: p, text: text, textBasis: basis, secondary: s, tertiary: t };
  }

  /* ---------- geometry ---------- */

  function seamX(y) {
    return SEAM_TOP_X + (SEAM_BOT_X - SEAM_TOP_X) * (y / H);
  }

  function fillBand(ctx, x1, x2, colour) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(SEAM_TOP_X + x1, 0);
    ctx.lineTo(SEAM_TOP_X + x2, 0);
    ctx.lineTo(SEAM_BOT_X + x2, H);
    ctx.lineTo(SEAM_BOT_X + x1, H);
    ctx.closePath();
    ctx.fill();
  }

  /* Fill an ordered run of bands moving outward from the seam.
     Adjacent bands of the same colour are merged into ONE fill. Two abutting
     paths each antialias their shared edge and the coverage does not sum to
     1, so a block drawn as two fills lets the panel colour bleed through the
     join as a visible line — measured at up to (237,195,199) against white
     over red. 47 of the 72 clubs have secondary === tertiary, so merging is
     the common path, and it yields a single 50px stripe for them. */
  function bandRuns(specs) {
    var runs = [];
    specs.forEach(function (s) {
      var last = runs[runs.length - 1];
      if (last && String(last.colour).toLowerCase() === String(s.colour).toLowerCase()) {
        last.width += s.width;
      } else {
        runs.push({ width: s.width, colour: s.colour });
      }
    });
    return runs;
  }

  function fillBands(ctx, sign, specs) {
    var runs = bandRuns(specs);
    var at = BAND_PRIMARY;
    runs.forEach(function (r) {
      var near = at, far = at + r.width;
      if (sign < 0) fillBand(ctx, -far, -near, r.colour);
      else fillBand(ctx, near, far, r.colour);
      at = far;
    });
  }

  /* Lay the two panels down as a solid ground plus one clipped wedge on top,
     rather than two shapes meeting along the seam.

     Two abutting fills each antialias their shared edge and the coverage does
     not sum to 1, so the seam came out as a 1px run of partly transparent
     pixels (alpha as low as 192). Against white — a document, a light web page
     — that reads as a pale line down the diagonal. Painting the away colour
     across the whole canvas first and clipping the home wedge over it leaves
     no shared edge, so every pixel is fully opaque and the seam antialiases
     cleanly between the two colours.

     Same reasoning as bandRuns(); the bands themselves are safe because they
     are drawn over already-opaque ground. */
  function fillPanels(ctx, homeColour, awayColour) {
    ctx.fillStyle = awayColour;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(SEAM_TOP_X, 0);
    ctx.lineTo(SEAM_BOT_X, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = homeColour;
    ctx.fill();
    ctx.restore();
  }

  /* ---------- drawing ---------- */

  function drawContain(ctx, img, cx, cy, maxH) {
    if (!img || !img.width) return 0;
    var scale = maxH / img.height;
    var w = img.width * scale, h = maxH;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    return w;
  }

  /* Draw one club's crest-over-code column. */
  function drawSide(ctx, cx, crest, code, textColour) {
    var blockH = CREST_H + CODE_GAP + CODE_SIZE * 0.72;
    var top = (H - blockH) / 2;
    drawContain(ctx, crest, cx, top + CREST_H / 2, CREST_H);
    ctx.fillStyle = textColour;
    ctx.font = '800 ' + CODE_SIZE + 'px "' + FONT_FAMILY + '", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(code, cx, top + CREST_H + CODE_GAP + CODE_SIZE * 0.72);
  }

  /**
   * Render the match graphic.
   *
   * ctx     2D context of a 1920x1080 canvas
   * fixture { home, away, competition } — home/away are club records from
   *         clubs-meta.json (need code + colors), competition names the badge
   * assets  { homeCrest, awayCrest, badge } — loaded Image/ImageBitmap objects
   */
  function render(ctx, fixture, assets) {
    var home = fixture.home, away = fixture.away;
    var hc = resolveColours(home.colors);
    var ac = resolveColours(away.colors);

    ctx.clearRect(0, 0, W, H);

    /* Panels first — primary meets primary at the seam. */
    fillPanels(ctx, hc.panel, ac.panel);

    /* Inset bands. Offsets run outward from the seam, so the primary band
       sits against the seam and the stripes are set back inside each panel.
       Same-coloured neighbours merge into one fill — see fillBands(). */
    fillBands(ctx, -1, [{ width: BAND_SECONDARY, colour: hc.secondary },
                        { width: BAND_TERTIARY,  colour: hc.tertiary }]);
    fillBands(ctx, +1, [{ width: BAND_SECONDARY, colour: ac.secondary },
                        { width: BAND_TERTIARY,  colour: ac.tertiary }]);

    drawSide(ctx, SIDE_CENTRE_L, assets.homeCrest, home.code, hc.text);
    drawSide(ctx, SIDE_CENTRE_R, assets.awayCrest, away.code, ac.text);

    /* Competition badge, centred on the seam. It carries its own white
       plate and black border, so it needs no light/dark variant. */
    if (assets.badge) {
      var portrait = assets.badge.height > assets.badge.width;
      drawContain(ctx, assets.badge, W / 2, H / 2,
                  portrait ? BADGE_H_PORTRAIT : BADGE_H_LANDSCAPE);
    }

    return {
      homeText: hc.textBasis,
      awayText: ac.textBasis,
      panelsMerge: readsAsSameField(hc.panel, ac.panel)
    };
  }

  root.NL_MATCH_GRAPHIC = {
    WIDTH: W,
    HEIGHT: H,
    FONT_FAMILY: FONT_FAMILY,
    BANDS: { primary: BAND_PRIMARY, secondary: BAND_SECONDARY, tertiary: BAND_TERTIARY },
    MIN_RATIO: MIN_RATIO,
    DARK_FLOOR: DARK_FLOOR,
    render: render,
    bandRuns: bandRuns,
    resolveColours: resolveColours,
    readsAsSameField: readsAsSameField,
    contrast: contrast,
    luminance: luminance,
    seamX: seamX
  };
})(typeof window !== 'undefined' ? window : this);
