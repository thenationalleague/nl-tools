#!/usr/bin/env node
/* ============================================================================
   build-fans-view.js — Fans' View club-by-club data extract
   ----------------------------------------------------------------------------
   Builds assets/data/fans-view.json: one record per club in the current
   clubs-meta season, each carrying the club's summer feature (the "Fans' View"
   series, or the "Welcome to the Enterprise National League" factfile where a
   Fans' View has not run yet) with its rich CMS HTML, hero image and byline.

   Why this exists
     articles-index.json already carries every article, but rebuild-index.js
     strips all markup to build its `bodyText` search field — inline images,
     links and paragraph breaks are gone. This script re-fetches the ~70 slugs
     it actually needs from the CMS /v1/byslug endpoint and keeps the HTML, so
     the fan-facing embed can render the pieces as they appear on the website.

   Output is small (~400KB) because it covers ~70 articles, not 11,000 — the
   embed cannot fetch the 30MB index.

   Usage
     node scripts/build-fans-view.js                 # fetch HTML from the CMS
     node scripts/build-fans-view.js --no-fetch      # offline: plaintext bodies
     node scripts/build-fans-view.js --standalone out.html
                                                     # self-contained demo file
                                                     # (data + crests inlined)

   ----------------------------------------------------------------------------
   CHANGELOG
   v1.0 (06/08/2026)
     - Initial version. Maps 2026-27 clubs to their Fans' View / Welcome
       article, fetches rich body HTML, emits assets/data/fans-view.json.
       --standalone inlines the JSON and crest thumbs into embeds/fans-view.html
       to produce a single downloadable file.
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT        = path.join(__dirname, '..');
const INDEX_PATH  = path.join(ROOT, 'assets/data/articles-index.json');
const CLUBS_PATH  = path.join(ROOT, 'assets/data/clubs-meta.json');
const OUT_PATH    = path.join(ROOT, 'assets/data/fans-view.json');
const TEMPLATE    = path.join(ROOT, 'embeds/fans-view.html');
const CREST_DIR   = path.join(ROOT, 'assets/crests/thumbs');

const BYSLUG_BASE = 'https://news.cms.web.gc.nationalleagueservices.co.uk/v1/byslug';
const SITE_BASE   = 'https://www.thenationalleague.org.uk';
const CREST_BASE  = 'https://nl.tools/assets/crests/thumbs/';

/* Articles published from this date on are considered part of the summer
   build-up run. The Fans' View series started 27/05/2026. */
const WINDOW_START = '2026-05-01T00:00:00Z';

/* Four Fans' View headlines name the club only in the body — nickname
   ("Silkmen"), abbreviation ("Hampton"), or a staff member rather than the
   club ("Weston's physio"). Keyed by slug so a retitle cannot silently
   reassign them. */
const SLUG_OVERRIDES = {
  '/news/2026/june/21/the-fans--view--change-coming-at-hampton--but-so-much-remains-the-same/': 'Hampton & Richmond Borough',
  '/news/2026/july/04/the-fans--view---i-m-a-big-supporter-while-keeping-weston-s-players-fighting-fit--/': 'Weston-super-Mare',
  '/news/2026/july/27/the-fans--view--harriers-hope-to-be-around-a-little-long-this-time-/': 'Kidderminster Harriers',
  '/news/2026/july/15/the-fans--view--now-sensational-silkmen-just-want-promotion--/': 'Macclesfield'
};

const FANS_VIEW_RE = /fan'?s?[’']?\s*view/i;
const WELCOME_RE   = /^Welcome to the Enterprise National League[^:]*:\s*(.+)$/i;

const args       = process.argv.slice(2);
const NO_FETCH   = args.includes('--no-fetch');
const standaloneIdx = args.indexOf('--standalone');
const STANDALONE = standaloneIdx > -1 ? args[standaloneIdx + 1] : null;

function log(msg) { process.stdout.write(msg + '\n'); }

/* ============ CLUB MATCHING ============ */

const norm = s => String(s || '').toLowerCase().replace(/[’']/g, "'");

/* Name forms worth matching on: full name, short name, nickname. Anything
   shorter than four characters is dropped — "Bees", "Iron" and the like are
   fine, but two-letter fragments match everything. */
function clubTerms(club) {
  const set = new Set();
  [club.name, club.short, club.nickname].forEach(v => { if (v) set.add(norm(v)); });
  return [...set].filter(t => t.length > 3);
}

/* Score a club against one article: a name in the headline is decisive, body
   mentions only break ties. Returns the best-scoring club, or null. */
function matchClub(article, clubs) {
  const title = norm(article.postTitle);
  const body  = norm(article.bodyText);
  let best = null, bestScore = 0;

  clubs.forEach(club => {
    const terms = clubTerms(club);
    let score = 0;
    terms.forEach(t => { if (title.includes(t)) score += 100 + t.length; });
    const bodyHits = terms.reduce((n, t) => n + (body.split(t).length - 1), 0);
    score += Math.min(bodyHits, 30);
    if (score > bestScore) { bestScore = score; best = club; }
  });

  return bestScore > 0 ? best : null;
}

/* ============ CMS BODY FETCH ============ */

/* The byslug response is an array of rows; each row's rowData is a widget.
   TextBlockWidget carries prose HTML in widgetData.content. Other widget types
   (images, tweets, embeds) vary, so anything with a `content` string is kept
   and anything else is recorded so we can see what we are dropping. */
function extractHtml(byslugBody) {
  if (!Array.isArray(byslugBody) || !byslugBody[0]) return null;
  const content = byslugBody[0].content;
  if (!Array.isArray(content)) return null;

  const parts = [];
  const skipped = [];

  content.forEach(row => {
    const widget = row && row.rowData;
    if (!widget) return;
    const data = widget.widgetData || {};

    if (typeof data.content === 'string' && data.content.trim()) {
      parts.push({ type: widget.widgetType, html: data.content });
      return;
    }
    /* Image widgets name their asset rather than carrying markup. Field names
       differ between native and imported articles, so try the known shapes. */
    const img = data.imageData || data.image || null;
    const src = img && (img.location || (img.key && CMS_S3 + img.key)) ||
                data.url || data.src || null;
    if (src) {
      parts.push({
        type: widget.widgetType,
        html: '<figure><img src="' + escAttr(src) + '" alt="' +
              escAttr(data.caption || data.alt || '') + '">' +
              (data.caption ? '<figcaption>' + escHtml(data.caption) + '</figcaption>' : '') +
              '</figure>'
      });
      return;
    }
    skipped.push(widget.widgetType);
  });

  return { parts, skipped };
}

const CMS_S3 = 'https://s3.eu-west-1.amazonaws.com/gc-media-assets-v2.gc.nationalleagueservices.co.uk/';

const escHtml = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => escHtml(s).replace(/"/g, '&quot;');

async function fetchBodyHtml(postSlug) {
  const url = BYSLUG_BASE + '?postSlug=' + encodeURI(postSlug);
  const resp = await fetch(url, {
    headers: {
      accept: '*/*',
      origin: SITE_BASE,
      referer: SITE_BASE + '/'
    }
  });
  if (!resp.ok) throw new Error('byslug HTTP ' + resp.status);
  const json = await resp.json();
  if (!json.success || !json.body) return null;
  return extractHtml(json.body);
}

/* Offline fallback: the index only keeps whitespace-collapsed plaintext, so
   there are no real paragraph breaks left to recover. Group sentences into
   readable blocks and flag the record as `plaintext` so the UI can say so
   rather than passing it off as the published formatting. */
function paragraphsFromText(text, perPara = 3) {
  const sentences = String(text || '')
    .replace(/\s+/g, ' ')
    .match(/[^.!?]+[.!?]*\s*/g) || [];
  const paras = [];
  for (let i = 0; i < sentences.length; i += perPara) {
    const chunk = sentences.slice(i, i + perPara).join('').trim();
    if (chunk) paras.push('<p>' + escHtml(chunk) + '</p>');
  }
  return paras.join('\n');
}

/* ============ BUILD ============ */

async function build() {
  log('Reading ' + path.relative(ROOT, INDEX_PATH) + ' …');
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const meta  = JSON.parse(fs.readFileSync(CLUBS_PATH, 'utf8'));

  const seasonKey   = meta.seasons.current;
  const seasonLabel = meta.seasons.list[seasonKey].label;
  const clubs = meta.clubs.filter(c => c.seasons && c.seasons[seasonKey]);
  log('Season ' + seasonLabel + ' — ' + clubs.length + ' clubs');

  const cutoff = new Date(WINDOW_START);
  const recent = index.articles.filter(a => new Date(a.publishedDateTime) >= cutoff);

  /* Fans' View — one per club, the primary feature. */
  const byClub = new Map();
  const claim = (clubName, article, type) => {
    if (!clubName) return;
    const existing = byClub.get(clubName);
    /* Fans' View outranks a Welcome factfile; otherwise keep the newer piece. */
    if (existing) {
      if (existing.type === 'fans-view' && type !== 'fans-view') return;
      if (existing.type === type &&
          existing.article.publishedDateTime > article.publishedDateTime) return;
    }
    byClub.set(clubName, { article, type });
  };

  recent
    .filter(a => FANS_VIEW_RE.test(a.postTitle || ''))
    .forEach(a => {
      const name = SLUG_OVERRIDES[a.postSlug] || (matchClub(a, clubs) || {}).name;
      if (!name) log('  ! no club match: ' + a.postTitle.trim());
      claim(name, a, 'fans-view');
    });

  /* Welcome factfiles — the parallel series for clubs new to the division.
     The club is the headline suffix, so match it exactly. */
  recent.forEach(a => {
    const m = WELCOME_RE.exec((a.postTitle || '').trim());
    if (!m) return;
    const wanted = norm(m[1].trim());
    const club = clubs.find(c => norm(c.name) === wanted);
    if (!club) { log('  ! Welcome article for unknown club: ' + m[1]); return; }
    claim(club.name, a, 'welcome');
  });

  const fansView = [...byClub.values()].filter(v => v.type === 'fans-view').length;
  const welcome  = [...byClub.values()].filter(v => v.type === 'welcome').length;
  log('Matched: ' + fansView + ' Fans\' View, ' + welcome + ' Welcome, ' +
      (clubs.length - byClub.size) + ' clubs with neither');

  /* Bodies. */
  const skippedWidgets = new Set();
  const records = [];
  for (const club of clubs) {
    const hit = byClub.get(club.name) || null;
    let article = null;

    if (hit) {
      const a = hit.article;
      let html = null, source = 'plaintext';

      if (!NO_FETCH) {
        try {
          const got = await fetchBodyHtml(a.postSlug);
          if (got && got.parts.length) {
            html = got.parts.map(p => p.html).join('\n');
            source = 'cms-html';
            got.skipped.forEach(t => skippedWidgets.add(t));
          }
        } catch (err) {
          log('  ! body fetch failed for ' + a.postSlug + ': ' + err.message);
        }
      }
      if (!html) html = paragraphsFromText(a.bodyText);

      article = {
        type: hit.type,
        title: a.postTitle.trim(),
        author: a.postAuthor || '',
        published: a.publishedDateTime,
        category: a.newsCategory || '',
        url: SITE_BASE + a.postSlug,
        hero: a.imageUrl || '',
        htmlSource: source,
        html
      };
    }

    records.push({
      name: club.name,
      short: club.short || club.name,
      nickname: club.nickname || '',
      code: club.code || '',
      division: club.seasons[seasonKey],
      colors: club.colors || {},
      crest: CREST_BASE + encodeURIComponent(club.name) + '.png',
      article
    });
  }

  if (skippedWidgets.size) {
    log('Widget types carrying no renderable content: ' + [...skippedWidgets].join(', '));
  }

  /* If nothing came back as real CMS markup, the UI needs to say so rather
     than present reflowed plaintext as the published article. */
  const anyHtml = records.some(r => r.article && r.article.htmlSource === 'cms-html');

  const out = {
    generatedAt: new Date().toISOString(),
    season: seasonKey,
    seasonLabel,
    sourceIndexGeneratedAt: index.generatedAt,
    plaintextFallback: !anyHtml,
    counts: {
      clubs: clubs.length,
      fansView,
      welcome,
      none: clubs.length - byClub.size
    },
    clubs: records
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  log('Wrote ' + path.relative(ROOT, OUT_PATH) + ' — ' +
      (fs.statSync(OUT_PATH).size / 1024).toFixed(0) + 'KB');

  if (STANDALONE) writeStandalone(out);
}

/* ============ STANDALONE DEMO ============ */

/* Same UI, but with the JSON and every crest inlined as a data URI so the file
   works from a local download with no network beyond the CMS hero images. */
function writeStandalone(data) {
  const template = fs.readFileSync(TEMPLATE, 'utf8');
  const inlined = JSON.parse(JSON.stringify(data));

  let embedded = 0;
  inlined.clubs.forEach(club => {
    const file = path.join(CREST_DIR, club.name + '.png');
    if (!fs.existsSync(file)) return;
    club.crest = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    embedded++;
  });
  inlined.standalone = true;

  const marker = 'null /*__FV_INLINE__*/';
  if (template.indexOf(marker) === -1) {
    throw new Error('Template is missing the ' + marker + ' marker');
  }
  const html = template.replace(marker, JSON.stringify(inlined));

  fs.mkdirSync(path.dirname(STANDALONE), { recursive: true });
  fs.writeFileSync(STANDALONE, html);
  log('Wrote ' + STANDALONE + ' — ' + (fs.statSync(STANDALONE).size / 1024 / 1024).toFixed(2) +
      'MB, ' + embedded + ' crests inlined');
}

build().catch(err => { console.error(err); process.exit(1); });
