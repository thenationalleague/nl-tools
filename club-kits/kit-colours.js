/*
  club-kits/kit-colours.js  v1 (30/07/2026)

  The kit COLOUR TAXONOMY and the colour picker, shared by both pages of this
  tool: the public form (index.html) and the admin console (admin.html).

  Extracted when the console gained in-place editing. Before that only the form
  needed the list, so it lived there; the moment a second page needed to let
  someone PICK a colour, keeping two copies would have guaranteed drift. This
  is deliberately TOOL-LOCAL rather than promoted to system/ — it is a domain
  vocabulary for one collection, not something a second tool would want, so it
  carries no canonical ?v= and no lockstep bump. (See the promotion policy in
  CLAUDE.md and the top of system/nl-brand.css.)

  Submissions stay SELF-DESCRIBING regardless — each stored colour carries its
  own label and hex — so nothing that reads a record depends on this file. It
  is only needed to OFFER choices.

  Exposes window.NLKit:
    COLOURS   family -> shades, the source list
    OPTS      flattened, one entry per selectable colour
    PATTERNS  shirt arrangements
    DETAILS   lighter shorts/socks equivalents
    GARMENTS  [key, label, max colours]
    colourField(mount, value, onChange)  the type-ahead picker
    patternLabel(garment, isShirt)       human label for an arrangement

  Pair with kit-colours.css, which carries the picker's styles.

  NOTE the colour picker here is a canon candidate: NL.clubPicker is the same
  control welded to clubs. Promoting a generic NL.combobox means a lockstep ?v=
  bump across the template and every tool, so it stays here for now.
*/
(function () {
  'use strict';

  function esc(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var COLOURS = [
    ['white',  'White', [
      ['white','White','#FFFFFF'], ['cream','Cream','#F5EFE0'], ['off-white','Off-white','#EFEEE9'] ]],
    ['black',  'Black', [
      ['black','Black','#111111'], ['charcoal','Charcoal','#36393D'] ]],
    ['grey',   'Grey', [
      ['light-grey','Light grey','#C9CCD1'], ['grey','Grey','#8A8F98'],
      ['dark-grey','Dark grey','#4A4E55'], ['silver','Silver','#C0C4CC'] ]],
    ['red',    'Red', [
      ['red','Red','#D0021B'], ['scarlet','Scarlet','#F5333F'], ['dark-red','Dark red','#8E1420'] ]],
    ['claret', 'Claret', [
      ['claret','Claret','#7A263A'], ['burgundy','Burgundy','#5C1A2B'], ['maroon','Maroon','#6B1F2E'] ]],
    ['pink',   'Pink', [
      ['pink','Pink','#F49AC2'], ['hot-pink','Hot pink','#E6007E'], ['neon-pink','Neon pink','#FF2D95'] ]],
    ['orange', 'Orange', [
      ['orange','Orange','#F5821F'], ['burnt-orange','Burnt orange','#B8500F'], ['neon-orange','Neon orange','#FF6A00'] ]],
    ['amber',  'Amber / gold', [
      ['amber','Amber','#FFB300'], ['gold','Gold','#D4AF37'], ['mustard','Mustard','#C9A227'] ]],
    ['yellow', 'Yellow', [
      ['yellow','Yellow','#FFE000'], ['lemon','Lemon','#FFF14F'],
      ['neon-yellow','Neon yellow','#EAFF00'], ['volt','Volt','#CDFF00'] ]],
    ['green',  'Green', [
      ['green','Green','#00A650'], ['mint','Mint green','#A8E6CF'], ['lime','Lime green','#B4D000'],
      ['emerald','Emerald green','#009B63'], ['forest','Forest green','#1B5E33'],
      ['bottle','Bottle green','#12452A'], ['neon-green','Neon green','#39FF14'] ]],
    ['teal',   'Teal', [
      ['teal','Teal','#008080'], ['turquoise','Turquoise','#30D5C8'], ['aqua','Aqua','#5FE0D0'] ]],
    ['blue',   'Blue', [
      ['blue','Blue','#0057B8'], ['sky','Sky blue','#6CACE4'], ['light-blue','Light blue','#8FC7E8'],
      ['royal','Royal blue','#0033A0'], ['electric','Electric blue','#0B7FFF'] ]],
    ['navy',   'Navy', [
      ['navy','Navy','#12284C'], ['midnight','Midnight navy','#0B1A33'] ]],
    ['purple', 'Purple', [
      ['purple','Purple','#6A2C91'], ['lilac','Lilac','#C8A2C8'], ['lavender','Lavender','#B57EDC'],
      ['violet','Violet','#7F00FF'], ['neon-purple','Neon purple','#B026FF'] ]],
    ['brown',  'Brown', [
      ['brown','Brown','#6B4423'], ['tan','Tan','#B08D57'], ['stone','Stone','#D6CCC2'] ]]
  ];

  /* Flat option list, built once. */
  var OPTS = [];
  COLOURS.forEach(function (f) {
    f[2].forEach(function (s) {
      OPTS.push({ family: f[0], familyLabel: f[1], shade: s[0], label: s[1], hex: s[2] });
    });
  });

  /* Shirt patterns. "Plain" is explicit so a 2-colour shirt that is really
     just a trimmed plain shirt has somewhere honest to go. */
  var PATTERNS = [
    ['plain','Plain'], ['stripes','Stripes'], ['pinstripes','Pinstripes'], ['hoops','Hoops'],
    ['halves','Halves'], ['quarters','Quarters'], ['sash','Sash (diagonal)'], ['chevrons','Chevrons'],
    ['checks','Checks'], ['gradient','Gradient / fade'], ['print','All-over print / graphic'],
    ['panels','Panels (shoulder / side)'], ['sleeves','Coloured sleeves'], ['trim','Trim only'],
    ['speckle','Speckle / splash'], ['other','Other']
  ];
  /* Lighter equivalent for shorts + socks — a two-colour sock is otherwise
     ambiguous between a trim and a hoop. */
  var DETAILS = [ ['trim','Trim'], ['stripe','Stripe / panel'], ['hoops','Hoops'], ['other','Other'] ];

  var GARMENTS = [ ['shirt','Shirt',3], ['shorts','Shorts',2], ['socks','Socks',2] ];

  /* ── Colour combobox ───────────────────────────────────────────────────
     Type-ahead over OPTS, grouped by family, free text allowed. This is the
     canon candidate noted in the file header: NL.clubPicker is this same
     control specialised to clubs. */
  function colourField(host, value, onChange) {
    var open = false, act = -1, shown = [];

    host.className = 'cb';
    host.innerHTML =
      '<div class="cb__wrap">' +
        '<span class="cb__sw"></span>' +
        '<input class="cb__in" type="text" autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list" placeholder="Start typing a colour…">' +
        '<button type="button" class="cb__x" aria-label="Clear" style="display:none;">&times;</button>' +
      '</div><div class="cb__list" role="listbox"></div>';

    var sw = host.querySelector('.cb__sw'), input = host.querySelector('.cb__in'),
        clear = host.querySelector('.cb__x'), list = host.querySelector('.cb__list');

    function paint(v) {
      input.value = v ? v.label : '';
      clear.style.display = v ? '' : 'none';
      if (v && v.hex) { sw.style.background = v.hex; sw.classList.remove('cb__sw--none'); }
      else { sw.style.background = ''; sw.classList.add('cb__sw--none'); }
    }

    function filtered(q) {
      q = String(q || '').trim().toLowerCase();
      if (!q) return OPTS.slice();
      return OPTS.filter(function (o) {
        return o.label.toLowerCase().indexOf(q) > -1 ||
               o.family.indexOf(q) > -1 || o.shade.indexOf(q) > -1;
      });
    }

    function render(q) {
      shown = filtered(q);
      var typed = String(input.value || '').trim();
      var exact = shown.some(function (o) { return o.label.toLowerCase() === typed.toLowerCase(); });
      var html = '', lastFam = null;
      shown.forEach(function (o, i) {
        if (o.family !== lastFam) { html += '<div class="cb__grp">' + esc(o.familyLabel) + '</div>'; lastFam = o.family; }
        html += '<button type="button" class="cb__opt' + (i === act ? ' act' : '') + '" role="option" data-i="' + i + '">' +
                  '<span class="cb__sw" style="background:' + o.hex + '"></span>' +
                  '<span>' + esc(o.label) + '</span></button>';
      });
      /* Free-text escape hatch — kept, but marked so it can be reviewed. */
      if (typed && !exact) {
        html += '<button type="button" class="cb__opt cb__free" role="option" data-free="1">' +
                  '<span class="cb__sw cb__sw--none"></span><span>Use “<em>' + esc(typed) + '</em>” as entered</span></button>';
      }
      if (!html) html = '<div class="cb__grp">No match — keep typing to enter it as free text</div>';
      list.innerHTML = html;
      var a = list.querySelector('.cb__opt.act'); if (a) a.scrollIntoView({ block: 'nearest' });
    }

    function show() { open = true; list.classList.add('open'); input.setAttribute('aria-expanded', 'true'); render(input.value); }
    function hide() { open = false; act = -1; list.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); }

    function commit(v) { value = v; paint(v); hide(); onChange(v); }
    function commitFree() {
      var t = String(input.value || '').trim();
      if (!t) { commit(null); return; }
      var hit = OPTS.filter(function (o) { return o.label.toLowerCase() === t.toLowerCase(); })[0];
      commit(hit ? { family: hit.family, shade: hit.shade, label: hit.label, hex: hit.hex }
                 : { family: null, shade: null, label: t, hex: null, raw: true });
    }

    input.addEventListener('focus', show);
    input.addEventListener('click', show);
    input.addEventListener('input', function () { if (!open) show(); act = -1; render(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) { show(); return; } act = Math.min(act + 1, shown.length - 1); render(input.value); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(act - 1, -1); render(input.value); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (open && act > -1 && shown[act]) { var o = shown[act]; commit({ family:o.family, shade:o.shade, label:o.label, hex:o.hex }); }
        else commitFree();
      } else if (e.key === 'Escape') { hide(); }
    });
    /* Blur commits synchronously — a deferred commit loses the race against
       any re-render caused by the click that took the focus away. */
    input.addEventListener('blur', function () { if (input.isConnected) commitFree(); });

    list.addEventListener('mousedown', function (e) {
      var b = e.target.closest('.cb__opt'); if (!b) return;
      e.preventDefault();
      if (b.hasAttribute('data-free')) { commitFree(); return; }
      var o = shown[+b.getAttribute('data-i')];
      if (o) commit({ family: o.family, shade: o.shade, label: o.label, hex: o.hex });
    });
    clear.addEventListener('mousedown', function (e) { e.preventDefault(); input.value = ''; commit(null); });

    paint(value);
    return host;
  }

  function patternLabel(garment, isShirt) {
    /* Single-colour shirts are locked to Plain and say so; shorts and socks
       have no arrangement at one colour. */
    if (garment.colours.length < 2) return isShirt ? 'Plain' : '';
    var key = isShirt ? garment.pattern : garment.detail;
    if (!key) return '';
    if (key === 'other') return String(isShirt ? garment.patternOther : garment.detailOther).trim() || 'Other';
    var src = isShirt ? PATTERNS : DETAILS;
    for (var i = 0; i < src.length; i++) if (src[i][0] === key) return src[i][1];
    return key;
  }

  window.NLKit = {
    COLOURS: COLOURS, OPTS: OPTS, PATTERNS: PATTERNS, DETAILS: DETAILS,
    GARMENTS: GARMENTS, colourField: colourField, patternLabel: patternLabel
  };
})();
