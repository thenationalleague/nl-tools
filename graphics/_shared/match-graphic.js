/* ============================================================
   Match Graphic — shared renderer
   File: /graphics/_shared/match-graphic.js

   Single source of truth for the match graphic artwork. Both the
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
     Bands     measured outward from the seam, per club: primary, then
               secondary, then tertiary. The primary band is the divider;
               secondary/tertiary read as inset pinstriping. Primary meets
               primary at the seam. 50/25/25 at 16:9, scaled per format.
     Text      `secondary` when it is legible on the panel, else `tertiary`.
               Legible = contrast >= 2.5:1 AND not a both-dark pair.
               The both-dark guard exists because WCAG's ratio is unreliable
               at the dark end: it scores Chorley red-on-black at 5.26 while
               rating Worthing white-on-red only 3.89, which is backwards.
               Result across the 72: 66 secondary, 5 tertiary, 1 best-effort.
     Crests    drawn untreated. No outline, box or shadow.

   FORMATS
     16x9  1920x1080  landscape, seam leans off vertical, home left
     1x1   1080x1080  square, same vertical seam, tighter type
     4x5   1080x1350  portrait-ish, still a vertical seam, home left
     9x16  1080x1920  tall portrait, seam leans off HORIZONTAL, home top

     4:5 is still wide enough for a vertical seam. 9:16 is not — it would
     leave two 540px slivers with nowhere for a crest — so the tall portrait
     splits the other way and stacks the clubs. Everything else — colours,
     band order, badge on the seam — is identical, so all four formats read
     as one family.

   VERSION
     Bump RENDER_VERSION on any change that alters output pixels. The batch
     manifest records it, so a delivered folder can always be traced back to
     the code that drew it.
   ============================================================ */
(function (root) {
  'use strict';

  var RENDER_VERSION = '1.1.0';

  var MIN_RATIO = 2.5;             /* admits Braintree 2.61, King's Lynn 2.76 */
  var DARK_FLOOR = 0.25;           /* reject pairs where both colours are dark */

  var FONT_FAMILY = 'NLCarbonaExtraBold';

  /* Each format carries its own explicit geometry rather than being scaled
     from 16:9 at draw time — a single scale factor cannot serve both a wider
     and a taller frame, and type sizes need judgement, not arithmetic.

       split    'x' = seam runs top-to-bottom, clubs side by side
                'y' = seam runs left-to-right, clubs stacked
       seamA/B  seam position at each end of the cross axis
       bands    [primary, secondary, tertiary] outward from the seam
       laneA/B  centre of the home / away crest-and-code block, on the
                split axis (x for 'x', y for 'y') */
  var FORMATS = {
    '16x9': {
      w: 1920, h: 1080, split: 'x',
      seamA: 1060, seamB: 900,
      bands: [50, 25, 25],
      crestH: 292, codeSize: 202, codeGap: 44,
      laneA: 440, laneB: 1480,
      badgeLandscape: 270, badgePortrait: 340
    },
    '1x1': {
      w: 1080, h: 1080, split: 'x',
      seamA: 600, seamB: 480,
      bands: [30, 15, 15],
      crestH: 208, codeSize: 132, codeGap: 32,
      /* Lanes pushed out and the badge held small: at 1080 wide there is far
         less room either side of the seam than at 16:9, and a three-letter
         code at this size otherwise runs right up to the badge plate. These
         values leave about 30px of clear panel either side of it. */
      laneA: 230, laneB: 850,
      badgeLandscape: 160, badgePortrait: 202
    },
    '4x5': {
      /* Stacked, like 9:16. At 1080 wide a vertical seam leaves only ~500px
         per side, which forces the code down to 138px and puts it within
         26px of the badge plate. Splitting horizontally gives each club the
         full width, so the type can be half again as large. */
      w: 1080, h: 1350, split: 'y',
      seamA: 740, seamB: 610,
      bands: [40, 20, 20],
      crestH: 250, codeSize: 170, codeGap: 40,
      laneA: 330, laneB: 1020,
      badgeLandscape: 200, badgePortrait: 252
    },
    '9x16': {
      w: 1080, h: 1920, split: 'y',
      seamA: 1030, seamB: 890,
      bands: [44, 22, 22],
      crestH: 336, codeSize: 224, codeGap: 48,
      laneA: 470, laneB: 1450,
      badgeLandscape: 268, badgePortrait: 336
    }
  };

  var DEFAULT_FORMAT = '16x9';

  function format(name) {
    var f = FORMATS[name || DEFAULT_FORMAT];
    if (!f) {
      throw new Error('unknown match-graphic format: ' + name +
                      ' (have ' + Object.keys(FORMATS).join(', ') + ')');
    }
    return f;
  }

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

  /* Resolve the drawing colours for one club. Format-independent. */
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

  /* Seam position at `t` along the cross axis. For a vertical seam ('x')
     t is y and the result is an x; for a horizontal seam ('y') it is the
     reverse. */
  function seamPos(fmt, t) {
    var span = fmt.split === 'x' ? fmt.h : fmt.w;
    return fmt.seamA + (fmt.seamB - fmt.seamA) * (t / span);
  }

  /* Kept for the 16:9 reference geometry. */
  function seamX(y) { return seamPos(FORMATS['16x9'], y); }

  /* A band is a parallelogram tracking the seam, between two offsets
     measured perpendicular to it. */
  function fillBand(ctx, fmt, o1, o2, colour) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    if (fmt.split === 'x') {
      ctx.moveTo(fmt.seamA + o1, 0);
      ctx.lineTo(fmt.seamA + o2, 0);
      ctx.lineTo(fmt.seamB + o2, fmt.h);
      ctx.lineTo(fmt.seamB + o1, fmt.h);
    } else {
      ctx.moveTo(0, fmt.seamA + o1);
      ctx.lineTo(0, fmt.seamA + o2);
      ctx.lineTo(fmt.w, fmt.seamB + o2);
      ctx.lineTo(fmt.w, fmt.seamB + o1);
    }
    ctx.closePath();
    ctx.fill();
  }

  /* Merge adjacent bands of the same colour into ONE run.

     Two abutting paths each antialias their shared edge and the coverage does
     not sum to 1, so a block drawn as two fills lets the panel colour bleed
     through the join as a visible line — measured at up to (237,195,199)
     against white over red, on 115 of 115 sampled rows. 47 of the 72 clubs
     have secondary === tertiary, so merging is the common path, and for them
     it yields a single stripe of the combined width. */
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

  /* sign -1 = the home side of the seam, +1 = the away side. */
  function fillBands(ctx, fmt, sign, specs) {
    var runs = bandRuns(specs);
    var at = fmt.bands[0];
    runs.forEach(function (r) {
      var near = at, far = at + r.width;
      if (sign < 0) fillBand(ctx, fmt, -far, -near, r.colour);
      else fillBand(ctx, fmt, near, far, r.colour);
      at = far;
    });
  }

  /* Lay the two panels down as a solid ground plus one clipped wedge on top,
     rather than two shapes meeting along the seam.

     Two abutting fills each antialias their shared edge and the coverage does
     not sum to 1, so the seam came out as a 1px run of partly transparent
     pixels (alpha as low as 192, on 203 of 270 sampled rows). Against white —
     a document, a light web page — that reads as a pale line down the middle.
     Painting the away colour across the whole canvas first and clipping the
     home wedge over it leaves no shared edge, so every pixel is fully opaque
     and the seam antialiases cleanly between the two colours.

     Same reasoning as bandRuns(); the bands themselves are safe because they
     are drawn over already-opaque ground. */
  function fillPanels(ctx, fmt, homeColour, awayColour) {
    ctx.fillStyle = awayColour;
    ctx.fillRect(0, 0, fmt.w, fmt.h);

    ctx.save();
    ctx.beginPath();
    if (fmt.split === 'x') {          /* home occupies the left */
      ctx.moveTo(0, 0);
      ctx.lineTo(fmt.seamA, 0);
      ctx.lineTo(fmt.seamB, fmt.h);
      ctx.lineTo(0, fmt.h);
    } else {                          /* home occupies the top */
      ctx.moveTo(0, 0);
      ctx.lineTo(0, fmt.seamA);
      ctx.lineTo(fmt.w, fmt.seamB);
      ctx.lineTo(fmt.w, 0);
    }
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

  /* One club's crest-over-code block, centred on `lane`. The crest sits above
     the code in every format; only the axis the block is placed along changes. */
  function drawSide(ctx, fmt, lane, crest, code, textColour) {
    var blockH = fmt.crestH + fmt.codeGap + fmt.codeSize * 0.72;
    var cx, top;
    if (fmt.split === 'x') {
      cx = lane;
      top = (fmt.h - blockH) / 2;
    } else {
      cx = fmt.w / 2;
      top = lane - blockH / 2;
    }
    drawContain(ctx, crest, cx, top + fmt.crestH / 2, fmt.crestH);
    ctx.fillStyle = textColour;
    ctx.font = '800 ' + fmt.codeSize + 'px "' + FONT_FAMILY + '", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(code, cx, top + fmt.crestH + fmt.codeGap + fmt.codeSize * 0.72);
  }

  /**
   * Render the match graphic.
   *
   * ctx     2D context sized to the chosen format. Take it with
   *         { alpha: false } — the artwork is full-bleed and opaque, so an
   *         alpha channel is about 27% of the file for nothing.
   * fixture { home, away, competition } — home/away are club records from
   *         clubs-meta.json (need code + colors), competition names the badge
   * assets  { homeCrest, awayCrest, badge } — loaded Image/ImageBitmap objects
   * opts    { format } — one of FORMATS, default '16x9'
   */
  function render(ctx, fixture, assets, opts) {
    var fmt = format(opts && opts.format);
    var home = fixture.home, away = fixture.away;
    var hc = resolveColours(home.colors);
    var ac = resolveColours(away.colors);

    ctx.clearRect(0, 0, fmt.w, fmt.h);

    /* Panels first — primary meets primary at the seam. */
    fillPanels(ctx, fmt, hc.panel, ac.panel);

    /* Inset bands, outward from the seam, so the primary band sits against
       the seam and the stripes are set back inside each panel. */
    fillBands(ctx, fmt, -1, [{ width: fmt.bands[1], colour: hc.secondary },
                             { width: fmt.bands[2], colour: hc.tertiary }]);
    fillBands(ctx, fmt, +1, [{ width: fmt.bands[1], colour: ac.secondary },
                             { width: fmt.bands[2], colour: ac.tertiary }]);

    drawSide(ctx, fmt, fmt.laneA, assets.homeCrest, home.code, hc.text);
    drawSide(ctx, fmt, fmt.laneB, assets.awayCrest, away.code, ac.text);

    /* Competition badge, centred on the seam. It carries its own white
       plate and black border, so it needs no light/dark variant. */
    if (assets.badge) {
      var portrait = assets.badge.height > assets.badge.width;
      drawContain(ctx, assets.badge, fmt.w / 2, fmt.h / 2,
                  portrait ? fmt.badgePortrait : fmt.badgeLandscape);
    }

    return {
      version: RENDER_VERSION,
      format: (opts && opts.format) || DEFAULT_FORMAT,
      homeText: hc.textBasis,
      awayText: ac.textBasis,
      panelsMerge: readsAsSameField(hc.panel, ac.panel)
    };
  }

  root.NL_MATCH_GRAPHIC = {
    VERSION: RENDER_VERSION,
    FORMATS: FORMATS,
    DEFAULT_FORMAT: DEFAULT_FORMAT,
    format: format,
    /* 16:9 reference values, kept for callers and tests that predate formats */
    WIDTH: FORMATS['16x9'].w,
    HEIGHT: FORMATS['16x9'].h,
    BANDS: {
      primary: FORMATS['16x9'].bands[0],
      secondary: FORMATS['16x9'].bands[1],
      tertiary: FORMATS['16x9'].bands[2]
    },
    FONT_FAMILY: FONT_FAMILY,
    MIN_RATIO: MIN_RATIO,
    DARK_FLOOR: DARK_FLOOR,
    render: render,
    bandRuns: bandRuns,
    resolveColours: resolveColours,
    readsAsSameField: readsAsSameField,
    contrast: contrast,
    luminance: luminance,
    seamPos: seamPos,
    seamX: seamX
  };
})(typeof window !== 'undefined' ? window : this);
