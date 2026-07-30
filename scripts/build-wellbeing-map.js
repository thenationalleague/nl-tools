#!/usr/bin/env node
/**
 * scripts/build-wellbeing-map.js
 *
 * Reads the live public section at wellbeing/index.html and writes the seed
 * for the map tool at wellbeing-map/seed.json.
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
 *   - tel: links become plain text. NL.sanitiseHtml only passes http(s) and
 *     mailto, so a tel: href would be silently dropped on the first edit;
 *     better that the number is visibly text than invisibly broken. The
 *     numbers still read correctly, and they are re-linked on the live page.
 *     (Allowing tel: in NL.sanitiseHtml is a fair canon candidate — any tool
 *     holding contact copy will hit this.)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'wellbeing', 'index.html');
const OUT = path.join(REPO, 'wellbeing-map', 'seed.json');

/* ── Zones ───────────────────────────────────────────────────────────────
   Five bands on one canvas, in the order a reader meets them. Every node
   belongs to exactly one; edges cross freely, which is the whole point of
   keeping it to a single canvas. */
const ZONES = [
  { id: 'header', label: 'Shared header',
    hint: 'On every page. Locked — change it here and it changes everywhere.' },
  { id: 'wayin', label: 'The way in',
    hint: 'What somebody meets first, and the threat-to-life question behind the red pill.' },
  { id: 'topicsnav', label: 'Topics widget',
    hint: 'The grid of topic buttons. It sits on every page, so it is drawn once.' },
  { id: 'flow', label: 'The pages',
    hint: 'Every page in the section. Arrows here are links an editor chose to write.' },
  { id: 'footer', label: 'Shared footer',
    hint: 'Emergency numbers and the safeguarding leads. On every page. Locked.' }
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
  'need-help': 'wayin'
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
  'sleep-problems':     'Sleep problems'
};

/* ── Small helpers ──────────────────────────────────────────────────────── */

const collapse = (s) => s.replace(/\s+/g, ' ').trim();
const textOf = (html) => collapse(html.replace(/<[^>]+>/g, ''));

function read() {
  if (!fs.existsSync(SRC)) {
    console.error(`Cannot find ${path.relative(REPO, SRC)} — run this from the repo.`);
    process.exit(1);
  }
  return fs.readFileSync(SRC, 'utf8');
}

/* ── Copy conversion ─────────────────────────────────────────────────────
   Section markup → the subset NL.richText round-trips without loss. */
function toEditorHtml(html) {
  let s = html;

  // Shared blocks are represented as flags on the node, not as copy.
  s = s.replace(/<a class="btn[^"]*wb-back[^"]*"[^>]*>[\s\S]*?<\/a>/g, '');
  s = s.replace(/<div class="wb-next">[\s\S]*?<\/div>\s*<\/div>/g, '');
  s = s.replace(/<div class="wb-next">[\s\S]*?<\/div>/g, '');

  // Subheadings read as bold paragraphs; the editor has no heading button.
  s = s.replace(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g,
    (_, inner) => `<p><strong>${collapse(inner)}</strong></p>`);

  // Card wrappers (wb-999, wb-svc) carry layout only — unwrap them.
  s = s.replace(/<\/?div[^>]*>/g, '');

  // tel: links become their own text. <span> inside a wb-call becomes an
  // em dash clause so "999 Emergency services" does not run together.
  s = s.replace(/<a[^>]*href="tel:[^"]*"[^>]*>([\s\S]*?)<\/a>/g, (_, inner) => {
    const parts = inner.split(/<span[^>]*>/);
    const num = textOf(parts[0]);
    const rest = parts[1] ? textOf(parts[1]) : '';
    return rest ? `<strong>${num} — ${rest}</strong>` : `<strong>${num}</strong>`;
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

  // A converted tel: link can be left as a bare <strong> between blocks.
  // NL.sanitiseHtml would wrap it on load anyway; do it here so the committed
  // seed reads properly in a diff too.
  s = s.replace(/(^|<\/p>|<\/ul>)(<strong>[^<]*<\/strong>)(?=<p>|<ul>|$)/g, '$1<p>$2</p>');

  return s;
}

/* Statement and answer labels come from a button that ends in a → glyph. */
const stripArrow = (s) => collapse(s).replace(/[→↠➜>]+$/, '').trim();

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
  const nav = src.slice(src.indexOf('<nav class="wb-nav"'), src.indexOf('</nav>'));
  const foot = src.slice(src.indexOf('<footer class="wb-foot">'), src.indexOf('</footer>'));

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

  // The topic grid, plus the two utility cards beneath it.
  const cards = [];
  const cardsRe = /<a href="#([a-z-]+)">([^<]+)<\/a>/g;
  let c;
  while ((c = cardsRe.exec(nav))) cards.push({ to: c[1], label: textOf(c[2]) });

  const numbers = [];
  const numRe = /<a href="tel:([0-9]+)">([^<]+)<\/a>\s*<span>([^<]*)<\/span>/g;
  let n;
  while ((n = numRe.exec(foot))) numbers.push({ number: textOf(n[2]), who: textOf(n[3]) });

  const leads = [];
  const leadRe = /<div class="wb-sg__n">([^<]+)<\/div>\s*<div class="wb-sg__r">([^<]+)<\/div>/g;
  let l;
  while ((l = leadRe.exec(foot))) leads.push({ name: textOf(l[1]), role: textOf(l[2]) });

  const skip = header ? null : null;
  return { headerEdges, statements, cards, numbers, leads, skip };
}

/* ── Build ───────────────────────────────────────────────────────────────── */
function build() {
  const src = read();
  const version = (src.match(/Version:\s*(v[\d.]+)/) || [])[1] || 'unknown';
  const sections = parseSections(src);
  const shared = parseShared(src);

  const topicIds = shared.cards.map((c) => c.to);
  const nodes = [];
  const edges = [];

  const push = (n) => { nodes.push(n); return n; };

  /* Locked shared blocks. `locked` means the tool will not let anybody drag
     or delete them — their content is one block that lives on every page, so
     moving them around says nothing useful. */
  push({
    id: '_header', zone: 'header', kind: 'shared', locked: true,
    title: 'Header', label: 'Header', hash: null, kicker: 'On every page',
    body: '<p>The rose and the word <strong>Wellbeing</strong> on the left, and the red '
        + '<strong>Need help now?</strong> pill on the right. There is also a hidden '
        + '"Skip to urgent help" link for keyboard and screen-reader users.</p>',
    nextStep: false, showsTopics: false, showsFooter: false
  });

  push({
    id: '_statements', zone: 'wayin', kind: 'shared', locked: true,
    title: 'Four statements', label: 'Four statements', hash: null, kicker: 'On every page',
    body: '<p>The coloured statements. On the front page they are the main content; on '
        + 'every other page they sit underneath it, so the whole section stays one tap away.</p>'
        + '<ul>' + shared.statements.map((st) => `<li>${st.label}</li>`).join('') + '</ul>',
    nextStep: false, showsTopics: false, showsFooter: false
  });

  push({
    id: '_topics', zone: 'topicsnav', kind: 'shared', locked: true,
    title: 'Topics widget', label: 'Topics widget', hash: null, kicker: 'On every page',
    body: `<p>${shared.cards.length} buttons. Ten topics, then two under "Supporting someone, `
        + 'or looking for a service". Because it is on every page, it is drawn once here '
        + 'rather than fifteen times.</p>',
    nextStep: false, showsTopics: false, showsFooter: false
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
    nextStep: false, showsTopics: false, showsFooter: false
  });

  /* Every real page. */
  sections.forEach((sec) => {
    push({
      id: sec.id,
      zone: ZONE_OF[sec.id] || 'flow',
      kind: KIND[sec.id] || (topicIds.indexOf(sec.id) > -1 ? 'everyday' : 'everyday'),
      locked: false,
      title: sec.title,
      label: LABEL[sec.id] || sec.title,
      hash: '#' + sec.id,
      kicker: sec.kicker,
      body: sec.body,
      nextStep: sec.nextStep,
      showsTopics: true,
      showsFooter: true
    });
  });

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
      const kind = sec.id === 'need-help' ? 'answer' : 'editorial';
      edges.push({ from: sec.id, to, label: stripArrow(m[2]), kind });
    }
  });

  return {
    format: 'nl-wellbeing-map',
    formatVersion: 1,
    generated: new Date().toISOString().slice(0, 10),
    source: `/wellbeing/index.html ${version}`,
    zones: ZONES,
    nodes,
    edges
  };
}

function main() {
  const map = build();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(map, null, 2) + '\n', 'utf8');

  const byZone = {};
  map.nodes.forEach((n) => { byZone[n.zone] = (byZone[n.zone] || 0) + 1; });
  const byKind = {};
  map.edges.forEach((e) => { byKind[e.kind] = (byKind[e.kind] || 0) + 1; });

  console.log(`Wrote ${path.relative(REPO, OUT)} from ${map.source}`);
  console.log(`  ${map.nodes.length} nodes:`,
    ZONES.map((z) => `${z.id} ${byZone[z.id] || 0}`).join(', '));
  console.log(`  ${map.edges.length} edges:`,
    Object.keys(byKind).map((k) => `${k} ${byKind[k]}`).join(', '));
  const noBody = map.nodes.filter((n) => !n.body).map((n) => n.id);
  if (noBody.length) console.log(`  WARNING: no copy extracted for ${noBody.join(', ')}`);
}

main();
