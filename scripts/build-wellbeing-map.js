#!/usr/bin/env node
/**
 * scripts/build-wellbeing-map.js
 *
 * Reads the public wellbeing pages and writes the starting maps the map tool
 * loads: wellbeing-map/map-live.json and wellbeing-map/map-concepts.json.
 *
 * They are named map-* rather than seed-* deliberately: .gitignore blocks
 * seed-*.json because this repo is public and data exports must never be
 * committed. These files carry no personal data — page structure and the pages'
 * own published words, with the safeguarding leads named by role only — so the
 * name keeps that guard absolute rather than carving an exception in it.
 *
 * Why a generator rather than a hand-written map
 * ----------------------------------------------
 * The point of the map tool is that colleagues start from *reality*. A map
 * typed out by hand is out of date the first time anybody edits the section
 * and nobody notices, and a wrong map is worse than no map — it gets argued
 * over as though it were true. So the seed is derived from the real markup,
 * and regenerated whenever the section changes.
 *
 *   node scripts/build-wellbeing-map.js
 *
 * What "the tangled web" actually is
 * ----------------------------------
 * Drawn literally, the section has well over two hundred links. Almost all of
 * them are the same three shared blocks repeated on every page: two "Back to
 * Wellbeing menu" buttons, the persistent statements-and-topics nav, and the
 * standard "Your next step" box that ends with a link to the support
 * directory. That is boilerplate, and drawing it fifteen times produces a
 * hairball nobody can read.
 *
 * So this generator does what the section's own DESIGN CONTRACT does: it
 * treats shared blocks as authored once. They become four locked nodes with
 * their edges drawn a single time, and each page carries flags saying which
 * shared blocks it shows. What is left over — the ten or so links an editor
 * actually chose to put in the body of a page — is the flow worth arguing
 * about.
 *
 * What happens to the copy
 * ------------------------
 * Each node carries the page's own words, converted to the small subset the
 * tool's editor can handle (NL.richText: paragraphs, bold, italic, bullets,
 * links). Two deliberate lossy conversions:
 *
 *   - Subheadings (<h2>/<h3>) become a bold paragraph. The editor has no
 *     heading button, by request, and bold reads the same way on the page.
 *   - tel: links survive as links. NL.sanitiseHtml passes tel: alongside
 *     http(s) and mailto since nl-utils v1.35 — the canon candidate this
 *     comment used to flag, actioned — so a phone number stays dialable
 *     through every edit instead of being down-converted to bold text to
 *     survive one. The <span> inside a wb-call still becomes an em dash
 *     clause so "999 Emergency services" does not run together.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

/* Two starting maps, because there are two things worth arguing about: what the
   section is now, and what the parked concept proposed instead. They are
   genuinely different shapes, not a re-skin — the live section carries the topic
   grid on every page as one shared component, while the concept makes it a page
   you navigate to behind "I am just looking". A map that flattened that
   difference would be no use for choosing between them.

   `menus` names in-page sections that are really menus, so they are drawn as
   blocks with their buttons listed rather than firing a dozen arrows. */
const SOURCES = [
  {
    label: 'The live structure',
    src: path.join(REPO, 'wellbeing', 'index.html'),
    out: path.join(REPO, 'wellbeing-map', 'map-live.json'),
    menus: []
  },
  {
    label: 'The concepts version',
    src: path.join(REPO, 'wellbeing', 'concepts', 'wellbeing-navigation.html'),
    out: path.join(REPO, 'wellbeing-map', 'map-concepts.json'),
    menus: ['topics', 'help-with']
  }
];

/* ── Zones ───────────────────────────────────────────────────────────────
   Five bands on one canvas, in the order a reader meets them. Every node
   belongs to exactly one; edges cross freely, which is the whole point of
   keeping it to a single canvas. */
const ZONES = [
  { id: 'header', label: 'Shared header',
    hint: 'One block on every page. Edit it once and it changes everywhere.' },
  { id: 'wayin', label: 'The way in',
    hint: 'What somebody meets first, and the threat-to-life question behind the red pill.' },
  /* The widget and the pages it reaches are one section, not two. A band of
     its own left the widget marooned in an almost-empty strip; sitting it at
     the left of the pages it feeds is both tidier and truer. */
  { id: 'flow', label: 'Topics widget and the pages',
    hint: 'The widget on the left, the pages on the right. Arrows are links an editor chose to write.' },
  { id: 'footer', label: 'Shared footer',
    hint: 'Emergency numbers and the safeguarding leads. One block, on every page.' }
];

/* Node kind is the ONE thing colour encodes on the canvas, and it is a rung on
   the same ladder the live site already shows a visitor: red (not safe now),
   amber (needs to talk today), yellow (not feeling like myself), blue (worried
   about someone else). Two structural kinds sit outside the ladder — the way
   in, and services — and they are deliberately neutral.

   Earlier this mixed urgency and category in one palette, so blue meant
   "guide" while red meant "urgent" and the colours could not be read as a
   scale. They can now.

   These are starting positions, not clinical judgements: every page's rung is
   editable in the tool, and re-rating them is exactly the argument the tool
   exists to host. */
const KIND = {
  'wb-menu':            'wayin',
  'need-help':          'wayin',
  'crisis':             'crisis',
  'urgent-support':     'urgent',
  'understanding':      'everyday',
  'helping-a-teammate': 'other',
  'support-directory':  'services'
};

const ZONE_OF = {
  'wb-menu':   'wayin',
  'need-help': 'wayin',
  'help-with': 'wayin'   /* concepts only: level two of the way in */
};

/* Short names for the boxes on the canvas. A page's <h1> is its honest name
   but some of them are a sentence, and a sentence makes a poor box. Editable
   in the tool — this is only the starting point. */
const LABEL = {
  'wb-menu':            'Front door',
  'need-help':          'Need help now?',
  'crisis':             'Crisis and suicidal thoughts',
  'urgent-support':     'Urgent support',
  'understanding':      'Understanding wellbeing',
  'depression':         'Depression and low mood',
  'helping-a-teammate': 'Helping someone else',
  'alcohol-drugs':      'Alcohol and drugs',
  'sleep-problems':     'Sleep problems',
  'help-with':          'What do you want help with?',
  'topics':             'Topics menu'
};

/* ── Small helpers ──────────────────────────────────────────────────────── */

const collapse = (s) => s.replace(/\s+/g, ' ').trim();

/* Entities have to be decoded before anything reads a label as text. The live
   section writes its arrow glyphs literally; the concept writes them as
   &#8594; — so without this, buttons came out named "Drink or drugs &#8594;". */
const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&nbsp;': ' ', '&rarr;': '\u2192', '&larr;': '\u2190', '&mdash;': '\u2014',
  '&ndash;': '\u2013', '&hellip;': '\u2026', '&ldquo;': '\u201c', '&rdquo;': '\u201d',
  '&lsquo;': '\u2018', '&rsquo;': '\u2019'
};
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&[a-zA-Z]+;/g, (m) => (ENTITIES[m.toLowerCase()] !== undefined ? ENTITIES[m.toLowerCase()] : m));

const textOf = (html) => collapse(decode(html.replace(/<[^>]+>/g, '')));

function read(src) {
  if (!fs.existsSync(src)) {
    console.error(`Cannot find ${path.relative(REPO, src)} — run this from the repo.`);
    process.exit(1);
  }
  return fs.readFileSync(src, 'utf8');
}

/* ── Copy conversion ─────────────────────────────────────────────────────
   Section markup → the subset NL.richText round-trips without loss. */
function toEditorHtml(html) {
  let s = html;

  /* A choice button carries three spans: the wording, a longer description and
     an arrow glyph. Only the wording names the route — leave the other two in
     and a button ends up called "I am just looking Read anything you like, no
     need to have a problem →". */
  s = s.replace(/<span class="wb-choice__go"[^>]*>[\s\S]*?<\/span>/g, '');
  s = s.replace(/<span class="wb-choice__d"[^>]*>[\s\S]*?<\/span>/g, '');

  // Shared blocks are represented as flags on the node, not as copy.
  s = s.replace(/<a class="btn[^"]*wb-back[^"]*"[^>]*>[\s\S]*?<\/a>/g, '');
  s = s.replace(/<div class="wb-next">[\s\S]*?<\/div>\s*<\/div>/g, '');
  s = s.replace(/<div class="wb-next">[\s\S]*?<\/div>/g, '');

  // Subheadings read as bold paragraphs; the editor has no heading button.
  s = s.replace(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g,
    (_, inner) => `<p><strong>${collapse(inner)}</strong></p>`);

  // Card wrappers (wb-999, wb-svc) carry layout only — unwrap them.
  s = s.replace(/<\/?div[^>]*>/g, '');

  // tel: links stay links — NL.sanitiseHtml passes tel: since nl-utils
  // v1.35, so they survive editing. The <span> inside a wb-call still
  // becomes an em dash clause so "999 Emergency services" does not run
  // together once the span's styling is gone.
  s = s.replace(/<a[^>]*href="(tel:[^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_, href, inner) => {
    const parts = inner.split(/<span[^>]*>/);
    const num = textOf(parts[0]);
    const rest = parts[1] ? textOf(parts[1]) : '';
    return `<a href="${href}">${rest ? `${num} — ${rest}` : num}</a>`;
  });

  // Keep href on real links, drop target/rel/class.
  s = s.replace(/<a[^>]*href="([^"]+)"[^>]*>/g, (_, href) => `<a href="${href}">`);

  // Strip attributes from structural tags, drop anything else.
  s = s.replace(/<(p|ul|li|strong|em|b|i)[^>]*>/g, '<$1>');
  s = s.replace(/<span[^>]*>|<\/span>/g, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');

  // Tidy whitespace without gluing words together.
  s = s.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
  s = s.replace(/<p><\/p>/g, '');

  // A tel: link can be left bare between blocks once its wrapper divs are
  // unwrapped. NL.sanitiseHtml would wrap it on load anyway; do it here so
  // the committed seed reads properly in a diff too. (<strong> kept in the
  // alternation for safety, though nothing produces a bare one any more.)
  s = s.replace(/(^|<\/p>|<\/ul>)(<a href="tel:[^"]*">[^<]*<\/a>|<strong>[^<]*<\/strong>)(?=<p>|<ul>|$)/g, '$1<p>$2</p>');

  return s;
}

/* Statement and answer labels come from a button that ends in a → glyph. */
const stripArrow = (s) => textOf(s).replace(/[\u2192\u21a0\u279c>]+$/, '').trim();

/* ── Section parsing ────────────────────────────────────────────────────── */
function parseSections(src) {
  const main = src.slice(src.indexOf('<main class="wb">'), src.indexOf('</main>'));
  const out = [];
  const re = /<section class="wb-page" id="([a-z0-9-]+)">([\s\S]*?)<\/section>/g;
  let m;
  while ((m = re.exec(main))) {
    const [, id, raw] = m;

    const kicker = (raw.match(/<p class="text-label wb-kicker">([\s\S]*?)<\/p>/) || [])[1];
    const title = (raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
    const hasNext = /<div class="wb-next">/.test(raw);

    // Body is everything bar the kicker and the h1, which become fields.
    let body = raw
      .replace(/<p class="text-label wb-kicker">[\s\S]*?<\/p>/, '')
      .replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '');

    out.push({
      id,
      title: title ? textOf(title) : id,
      kicker: kicker ? textOf(kicker) : '',
      body: toEditorHtml(body),
      nextStep: hasNext
    });
  }
  return out;
}

/* ── Shared blocks ───────────────────────────────────────────────────────
   The header, the statements, the topic grid and the footer. Parsed from the
   real markup so their labels are the real words, then locked. */
function parseShared(src) {
  const header = src.slice(src.indexOf('<header class="wb-top">'), src.indexOf('</header>'));
  const foot = src.slice(src.indexOf('<footer class="wb-foot">'), src.indexOf('</footer>'));

  /* The concept has no persistent nav at all — its topic grid is a page you go
     to. So this can legitimately be empty, and everything downstream has to
     cope rather than slicing from -1 and parsing the whole document. */
  const navAt = src.indexOf('<nav class="wb-nav"');
  const nav = navAt === -1 ? '' : src.slice(navAt, src.indexOf('</nav>', navAt));

  const headerEdges = [];
  const brand = header.match(/<a class="wb-brand" href="(#[a-z-]+)"/);
  if (brand) headerEdges.push({ to: brand[1].slice(1), label: 'Rose and title' });
  const now = header.match(/<a class="wb-now" href="(#[a-z-]+)">([\s\S]*?)<\/a>/);
  if (now) headerEdges.push({ to: now[1].slice(1), label: stripArrow(now[2]) });

  // The statements block: four coloured choices, each with its own wording.
  const statements = [];
  const stRe = /<a class="wb-choice wb-choice--([a-z]+)" href="#([a-z-]+)">[\s\S]*?<span class="wb-choice__t">([\s\S]*?)<\/span>/g;
  let s;
  while ((s = stRe.exec(nav))) {
    statements.push({ to: s[2], label: stripArrow(s[3]), tone: s[1] });
  }

  /* The nav holds two separate card groups under their own headings: the topic
     grid, then "Supporting someone, or looking for a service". They are two
     components on the page and they are two blocks here, so either can be put on
     a page or taken off it without the other. */
  const groups = [];
  const groupRe = /<div class="wb-cards([^"]*)">([\s\S]*?)<\/div>/g;
  let g;
  while ((g = groupRe.exec(nav))) {
    const items = [];
    const cardRe = /<a href="#([a-z-]+)">([^<]+)<\/a>/g;
    let c;
    while ((c = cardRe.exec(g[2]))) items.push({ to: c[1], label: textOf(c[2]) });
    if (items.length) groups.push(items);
  }
  const cards = groups.length ? groups[0] : [];
  const support = groups.length > 1 ? groups[1] : [];

  const numbers = [];
  const numRe = /<a href="tel:([0-9]+)">([^<]+)<\/a>\s*<span>([^<]*)<\/span>/g;
  let n;
  while ((n = numRe.exec(foot))) numbers.push({ number: textOf(n[2]), who: textOf(n[3]) });

  const leads = [];
  const leadRe = /<div class="wb-sg__n">([^<]+)<\/div>\s*<div class="wb-sg__r">([^<]+)<\/div>/g;
  let l;
  while ((l = leadRe.exec(foot))) leads.push({ name: textOf(l[1]), role: textOf(l[2]) });

  return { headerEdges, statements, cards, support, numbers, leads, hasNav: navAt !== -1 };
}

/* ── Build ───────────────────────────────────────────────────────────────── */
function build(cfg) {
  const src = read(cfg.src);
  const version = (src.match(/Version:\s*(v[\d.]+)/) || [])[1] || 'unknown';
  const sections = parseSections(src);
  const shared = parseShared(src);

  const topicIds = shared.cards.map((c) => c.to);
  const nodes = [];
  const edges = [];

  const push = (n) => { nodes.push(n); return n; };

  /* `locked` means "drawn as a block with its buttons listed inside" — one
     component rather than a dozen arrows. It no longer means immovable. */
  push({
    id: '_header', zone: 'header', kind: 'shared', locked: true,
    title: 'Header', label: 'Header', hash: null, kicker: 'On every page',
    body: '<p>The rose and the word <strong>Wellbeing</strong> on the left, and the red '
        + '<strong>Need help now?</strong> pill on the right. There is also a hidden '
        + '"Skip to urgent help" link for keyboard and screen-reader users.</p>',
    shows: []
  });

  if (shared.hasNav) push({
    id: '_statements', zone: 'wayin', kind: 'shared', locked: true,
    title: 'Four statements', label: 'Four statements', hash: null, kicker: 'On every page',
    body: '<p>The coloured statements. On the front page they are the main content; on '
        + 'every other page they sit underneath it, so the whole section stays one tap away.</p>'
        + '<ul>' + shared.statements.map((st) => `<li>${st.label}</li>`).join('') + '</ul>',
    shows: []
  });

  if (shared.hasNav) push({
    id: '_topics', zone: 'flow', kind: 'shared', locked: true,
    title: 'Topics widget', label: 'Topics widget', hash: null, kicker: 'On every page',
    body: `<p>The grid of ${shared.cards.length} topic buttons. Because it is on every `
        + 'page it is drawn once here rather than fifteen times. Take it off a page with '
        + "the page's own list of blocks.</p>",
    shows: []
  });

  if (shared.hasNav && shared.support.length) push({
    id: '_support', zone: 'flow', kind: 'shared', locked: true,
    title: 'Supporting someone, or looking for a service',
    label: 'Supporting someone', hash: null, kicker: 'On every page',
    body: `<p>The ${shared.support.length} buttons under "Supporting someone, or looking `
        + 'for a service", which sit below the topic grid. A separate component from the '
        + 'topics, so it can go on a page without them or the other way round.</p>',
    shows: []
  });

  /* "Your next step" is a shared block too — the same paragraph at the foot of
     ten pages, ending in a link to the support directory. It was a tick box
     called nextStep, which meant it could not be edited, moved or reused. */
  const hasNext = sections.some((sec) => sec.nextStep);
  if (hasNext) push({
    id: '_nextstep', zone: 'flow', kind: 'shared', locked: true,
    title: 'Your next step', label: 'Your next step', hash: null, kicker: 'On many pages',
    body: '<p>The box that ends a topic page: <strong>Your next step</strong>, then '
        + '"Choose one action: tell someone you trust, contact your Club Welfare Officer, '
        + 'speak to your GP, or open the support directory."</p>',
    shows: []
  });

  push({
    id: '_footer', zone: 'footer', kind: 'shared', locked: true,
    title: 'Footer', label: 'Footer', hash: null, kicker: 'On every page',
    body: '<p><strong>Emergency numbers.</strong></p><ul>'
        + shared.numbers.map((x) => `<li>${x.number} — ${x.who}</li>`).join('')
        + '</ul><p><strong>Safeguarding leads.</strong> Named on the live page, with an '
        + 'email address for each:</p><ul>'
        // Roles, not names. The names are on the live page and in the poster;
        // a third copy in here would be one more thing to forget to update,
        // and somebody would end up arguing from a stale map.
        + shared.leads.map((x) => `<li>${x.role}</li>`).join('')
        + '</ul><p>Then what these pages are, that nothing is recorded, and the review date.</p>',
    shows: []
  });

  /* Every real page. */
  sections.forEach((sec) => {
    const isMenu = cfg.menus.indexOf(sec.id) > -1;
    push({
      id: sec.id,
      zone: ZONE_OF[sec.id] || 'flow',
      kind: isMenu ? 'shared' : (KIND[sec.id] || 'everyday'),
      locked: isMenu,
      title: sec.title,
      label: LABEL[sec.id] || sec.title,
      hash: '#' + sec.id,
      kicker: sec.kicker,
      body: sec.body,
      /* Which shared blocks appear on this page. A list, not a handful of
         booleans: the booleans could only ever describe the three blocks that
         happened to exist when they were written, so a new block could not be
         put on a page at all. */
      shows: pageBlocks(sec, shared, hasNext, isMenu)
    });
  });

  /* Blocks are only listed against a page if they exist in this map. The
     concept has no persistent nav, so its pages show the header and footer
     only — which is the truthful difference between the two structures. */
  function pageBlocks(sec, sh, next, isMenu) {
    const on = ['_header'];
    if (sh.hasNav && !isMenu) {
      on.push('_statements', '_topics');
      if (sh.support.length) on.push('_support');
    }
    if (next && sec.nextStep) on.push('_nextstep');
    on.push('_footer');
    return on.filter((id) => nodes.some((n) => n.id === id));
  }

  const known = new Set(nodes.map((n) => n.id));

  /* Shared-block edges, drawn once each. */
  shared.headerEdges.forEach((e) => {
    if (known.has(e.to)) edges.push({ from: '_header', to: e.to, label: e.label, kind: 'shared' });
  });
  shared.statements.forEach((e) => {
    if (known.has(e.to)) edges.push({ from: '_statements', to: e.to, label: e.label, kind: 'statement' });
  });
  shared.cards.forEach((e) => {
    if (known.has(e.to)) edges.push({ from: '_topics', to: e.to, label: e.label, kind: 'topic' });
  });
  shared.support.forEach((e) => {
    if (known.has(e.to) && known.has('_support')) {
      edges.push({ from: '_support', to: e.to, label: e.label, kind: 'topic' });
    }
  });
  if (known.has('_nextstep') && known.has('support-directory')) {
    edges.push({ from: '_nextstep', to: 'support-directory',
      label: 'open the support directory', kind: 'topic' });
  }

  /* Editorial links: whatever survives in the body of a page after the shared
     blocks have been taken out. These are the arrows somebody chose to write. */
  sections.forEach((sec) => {
    const re = /<a href="#([a-z-]+)">([\s\S]*?)<\/a>/g;
    let m;
    const seen = new Set();
    while ((m = re.exec(sec.body))) {
      const to = m[1];
      if (!known.has(to) || to === sec.id) continue;
      const key = `${sec.id}>${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const kind = cfg.menus.indexOf(sec.id) > -1 ? 'topic'
        : (sec.id === 'need-help' || sec.id === 'wb-menu') ? 'answer' : 'editorial';
      edges.push({ from: sec.id, to, label: stripArrow(m[2]), kind });
    }
  });

  return {
    format: 'nl-wellbeing-map',
    formatVersion: 1,
    label: cfg.label,
    generated: new Date().toISOString().slice(0, 10),
    source: `/${path.relative(REPO, cfg.src)} ${version}`,
    zones: ZONES,
    nodes,
    edges
  };
}

function buildOne(cfg) {
  const map = build(cfg);
  fs.mkdirSync(path.dirname(cfg.out), { recursive: true });
  fs.writeFileSync(cfg.out, JSON.stringify(map, null, 2) + '\n', 'utf8');
  report(cfg, map);
  return map;
}

function report(cfg, map) {

  const byZone = {};
  map.nodes.forEach((n) => { byZone[n.zone] = (byZone[n.zone] || 0) + 1; });
  const byKind = {};
  map.edges.forEach((e) => { byKind[e.kind] = (byKind[e.kind] || 0) + 1; });

  console.log(`Wrote ${path.relative(REPO, cfg.out)} — ${map.label}`);
  console.log(`  from ${map.source}`);
  console.log(`  ${map.nodes.length} nodes:`,
    ZONES.map((z) => `${z.id} ${byZone[z.id] || 0}`).join(', '),
    `| ${map.nodes.filter((n) => n.locked).length} blocks`);
  console.log(`  ${map.edges.length} edges:`,
    Object.keys(byKind).map((k) => `${k} ${byKind[k]}`).join(', '));
  const noBody = map.nodes.filter((n) => !n.body).map((n) => n.id);
  if (noBody.length) console.log(`  WARNING: no copy extracted for ${noBody.join(', ')}`);
  console.log('');
}

SOURCES.forEach(buildOne);
