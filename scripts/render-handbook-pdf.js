#!/usr/bin/env node
/*
  Render the published handbook edition to a static PDF.

  Run by .github/workflows/render-handbook-pdf.yml (hourly + manual). Skips
  cheaply when handbook/pdf-meta.json already matches the live published
  edition, so the scheduled run is a no-op between publishes.

  Build is MULTI-PART: front matter (cover + contents) and each area are
  rendered as separate Chrome print jobs over handbook/print.html?part=...,
  then merged with pdf-lib. All running furniture — the navy section band,
  the italic edition footer, page numbers — is DRAWN ONTO THE MERGED PAGES
  with pdf-lib in the reserved @page margins, using the real carbona font
  bytes (fetched from the Typekit URL declared in system/nl-brand.css).
  Chrome's header/footer templates are not used at all: they cannot load
  webfonts, and fixed in-page elements are clipped out of the margins.

  The italic footer is carbona slanted -10° (the "RegularSlanted" cut) via
  a text skew — the variable font carries no italic axis. If the font fetch
  or parse fails, Helvetica is the logged fallback so a render never dies
  over furniture.

  Env:
    CHROME_PATH  path to a Chrome/Chromium binary (required)
    BASE_URL     origin serving the repo under / (default http://127.0.0.1:8899)
    FORCE        "1" to re-render even if pdf-meta matches
*/
'use strict';

const fs = require('fs');
const path = require('path');

const RTDB = 'https://nl-tools-default-rtdb.europe-west1.firebasedatabase.app';
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8899';
const OUT_PDF = path.join(__dirname, '..', 'handbook', 'handbook.pdf');
const OUT_META = path.join(__dirname, '..', 'handbook', 'pdf-meta.json');
const BRAND_CSS = path.join(__dirname, '..', 'system', 'nl-brand.css');
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
// Static desktop cuts (assets/fonts/) are preferred over anything derived from
// the variable webfont. Drop CarbonaRegularSlanted.otf in and the footer picks
// up the true italic cut on the next render, no code change.
function localFont(name) {
  try { const b = fs.readFileSync(path.join(FONT_DIR, name)); return b.length ? b : null; } catch (_) { return null; }
}

const ORDER = ['memorandum', 'articles', 'league-rules', 'appendices', 'board-directives'];
const SHORT = {
  memorandum: 'Memorandum', articles: 'Articles', 'league-rules': 'League Rules',
  appendices: 'Appendices', 'board-directives': 'Board Directives'
};

const MM = 72 / 25.4;                       // mm -> PDF points
// Contents-row geometry, mirroring print.html's fixed .pg--toc layout:
// @page top margin 14mm + 26 (pad) + 12 (h2) + 6 + 1.2 + 8 (rule) = 67.2mm.
const TOC = { xLeftMM: 24, xRightMM: 186, firstRowTopMM: 67.2, rowMM: 16 };
const NAVY = { r: 0x22 / 255, g: 0x3b / 255, b: 0x7c / 255 };
const MUTED = { r: 0.48, g: 0.51, b: 0.59 };

function pdfOpts() {
  return {
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '14mm', bottom: '16mm', left: '0mm', right: '0mm' }
  };
}

/* Letter-spaced caps (pdf-lib has no letter-spacing) — draw char by char. */
function spacedText(page, text, opts) {
  const { font, size, centerX, y, gapPt, color } = opts;
  const chars = text.split('');
  const widths = chars.map(c => font.widthOfTextAtSize(c, size));
  const total = widths.reduce((a, b) => a + b, 0) + gapPt * (chars.length - 1);
  let x = centerX - total / 2;
  chars.forEach((c, i) => {
    if (c !== ' ') page.drawText(c, { x, y, size, font, color });
    x += widths[i] + gapPt;
  });
}

/* Merge front + area parts and draw all running furniture:
   - navy section band (area pages, skipping each area's title page)
   - italic edition footer on every page (carbona slant -10 when available)
   - page numbers bottom-right (every page but the cover)
   - clickable contents rows                                            */
async function assemble(frontBuf, areaParts, deco) {
  const { PDFDocument, PDFName, StandardFonts, rgb, degrees } = require('pdf-lib');
  const out = await PDFDocument.create();

  let font, fontIt, fontBold = null, skew = null;
  if (deco && deco.fontBytes) {
    try {
      out.registerFontkit(require('@pdf-lib/fontkit'));
      // subset:false — fontkit's subset writer emits empty glyphs for this
      // variable font (invisible text in every viewer); embedding the whole
      // decompressed TTF (~130KB once) keeps the outlines intact.
      font = await out.embedFont(deco.fontBytes, { subset: false });
      if (deco.slantedBytes) {
        fontIt = await out.embedFont(deco.slantedBytes, { subset: false });
        console.log('Footer font: carbona Slanted (true cut)');
      } else {
        fontIt = font;                       // same face, skewed at draw time
        skew = degrees(10);                  // synthetic "RegularSlanted" — right lean, level baseline
        console.log('Furniture font: carbona (synthetic slant for italic)');
      }
    } catch (e) {
      console.error('Custom font failed (' + e.message + ') — falling back to Helvetica');
      font = null;
    }
  }
  if (font && deco && deco.boldBytes) {
    try { fontBold = await out.embedFont(deco.boldBytes, { subset: false }); console.log('Band font: carbona ExtraBold'); }
    catch (e) { console.error('Bold instance failed (' + e.message + ') — band uses regular'); }
  }
  if (!font) {
    font = await out.embedFont(StandardFonts.Helvetica);
    fontIt = await out.embedFont(StandardFonts.HelveticaOblique);
    fontBold = await out.embedFont(StandardFonts.HelveticaBold);
  }
  const navy = rgb(NAVY.r, NAVY.g, NAVY.b);
  const muted = rgb(MUTED.r, MUTED.g, MUTED.b);
  const white = rgb(1, 1, 1);

  const front = await PDFDocument.load(frontBuf);
  (await out.copyPages(front, front.getPageIndices())).forEach(p => out.addPage(p));
  const frontCount = out.getPageCount();

  const starts = {};                        // areaId -> 1-based global start page
  for (const part of areaParts) {
    const doc = await PDFDocument.load(part.buf);
    starts[part.id] = out.getPageCount() + 1;
    (await out.copyPages(doc, doc.getPageIndices())).forEach(p => out.addPage(p));
  }

  const bandFor = {};                       // global 0-based page index -> area id
  areaParts.forEach(part => {
    for (let k = 1; k < part.pages; k++) bandFor[starts[part.id] - 1 + k] = part.id;
  });

  /* The DATE is the version (ruling 19/08/2026) — no edition number. The
     season identifies WHICH handbook, the date identifies HOW CURRENT, and
     between them there is nothing left for a v-number to say. */
  const footText = 'The National League Handbook' + (deco.season ? ' ' + deco.season : '') +
    (deco.pubDate ? ' · Last updated ' + deco.pubDate : '');

  out.getPages().forEach((p, i) => {
    const W = p.getWidth(), H = p.getHeight();
    // running footer — every page, centred in the bottom margin
    const fw = fontIt.widthOfTextAtSize(footText, 7.5);
    p.drawText(footText, {
      x: (W - fw) / 2, y: 8.2 * MM, size: 7.5, font: fontIt, color: muted,
      ...(skew ? { ySkew: skew } : {})
    });
    // page number — every page but the cover
    if (i > 0) {
      const n = String(i + 1);
      p.drawText(n, { x: W - 12 * MM - font.widthOfTextAtSize(n, 7.5), y: 8.2 * MM, size: 7.5, font, color: muted });
    }
    // navy section band in the top margin — full chapter title, ExtraBold caps
    const area = bandFor[i];
    if (area) {
      p.drawRectangle({ x: 0, y: H - 9.5 * MM, width: W, height: 9.5 * MM, color: navy });
      spacedText(p, ((deco.titles && deco.titles[area]) || SHORT[area] || area).toUpperCase(), {
        font: fontBold || font, size: 9.5, centerX: W / 2, y: H - 6.4 * MM, gapPt: 2.2, color: white
      });
    }
  });

  // Contents rows -> GoTo links (front part is cover p1 + contents p2).
  if (frontCount > 1) {
    const toc = out.getPage(1);
    const H = toc.getHeight();
    const annots = areaParts.map((part, i) => {
      const topPt = H - (TOC.firstRowTopMM + i * TOC.rowMM) * MM;
      const botPt = H - (TOC.firstRowTopMM + (i + 1) * TOC.rowMM) * MM;
      const target = out.getPage(starts[part.id] - 1);
      return out.context.register(out.context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Link'),
        Rect: [TOC.xLeftMM * MM, botPt, TOC.xRightMM * MM, topPt],
        Border: [0, 0, 0],
        A: { Type: PDFName.of('Action'), S: PDFName.of('GoTo'), D: [target.ref, PDFName.of('Fit')] }
      }));
    });
    toc.node.set(PDFName.of('Annots'), out.context.obj(annots));
  }

  return { bytes: await out.save(), starts, total: out.getPageCount() };
}

/* Carbona bytes: the woff2 URL is declared once, in nl-brand.css. The woff2 is
   DECOMPRESSED to a raw TTF (PDF font programs must be sfnt, not woff2 — raw
   woff2 was the source of the invisible-furniture bug), then the glyph
   outlines are sanity-checked so blank text can never ship again. */
async function fetchBrandFont() {
  try {
    const css = fs.readFileSync(BRAND_CSS, 'utf8');
    const m = css.match(/url\("(https:\/\/use\.typekit\.net[^"]+)"\)\s*format\("woff2"\)/);
    if (!m) throw new Error('no typekit woff2 url in nl-brand.css');
    const res = await fetch(m[1]);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const woff2 = Buffer.from(await res.arrayBuffer());
    const ttf = Buffer.from(await require('wawoff2').decompress(woff2));
    const cmds = require('@pdf-lib/fontkit').create(ttf).layout('M').glyphs[0].path.commands.length;
    if (!cmds) throw new Error('decompressed font has empty glyph outlines');
    console.log('Fetched carbona woff2 (' + woff2.length + ' b) -> ttf (' + ttf.length + ' b), M outline ok (' + cmds + ' cmds)');
    return ttf;
  } catch (e) {
    console.error('Carbona fetch failed (' + e.message + ') — furniture falls back to Helvetica');
    return null;
  }
}

/* Pin the variable font at wght=800 for the band — the default instance is 400.
   Uses fonttools' instancer (installed by the workflow); null on any failure. */
function instanceBold(ttfBytes) {
  const os = require('os');
  const cp = require('child_process');
  try {
    const src = path.join(os.tmpdir(), 'carbona.ttf');
    const dst = path.join(os.tmpdir(), 'carbona-800.ttf');
    fs.writeFileSync(src, ttfBytes);
    cp.execSync('python3 -m fontTools.varLib.instancer --quiet -o ' + JSON.stringify(dst) + ' ' + JSON.stringify(src) + ' wght=800', { stdio: 'pipe' });
    const out = fs.readFileSync(dst);
    console.log('Instanced carbona at wght=800 (' + out.length + ' bytes)');
    return out;
  } catch (e) {
    console.error('wght=800 instancing failed (' + (e.stderr ? e.stderr.toString().slice(0, 200) : e.message) + ') — band uses regular');
    return null;
  }
}

/* ---- Credentials -----------------------------------------------------------
   This job used to hold none at all. It worked because the handbook's edition
   nodes were world-readable, which stopped being a safe assumption the moment
   the reader grew a club-code gate: gating the rules with the renderer still
   anonymous would fail this job silently, freeze pdf-meta.json, and deny the
   print view the reader falls back TO. See system/club-code-plan.md §1.0a.

   Two consumers need covering and they authenticate differently:

     · the REST reads below — an admin access token, which bypasses rules.
     · the PAGE, driven headless — a custom token it signs in with, because a
       browser gets its answer through the rules like anyone else.

   Both come from one service account via Workload Identity Federation, the
   pattern rebuild-index.yml already uses. The pipeline holds a credential of
   its own rather than borrowing a club's: a club code in CI would break this
   job the first time somebody rotated it, and would put a live club
   credential in a secret store for no benefit.

   DEGRADES RATHER THAN BREAKS. If admin will not initialise — no ADC, a
   missing role, running locally — this logs and carries on unauthenticated,
   which is exactly what it did before. That keeps the currently-green hourly
   render green while the rules are still open, so this change cannot be the
   thing that breaks it. Once a run is seen green WITH a token, the rules can
   move. */
let adminApp = null;
let renderToken = null;

async function initCredentials() {
  try {
    const admin = require('firebase-admin');
    /* admin.app() THROWS when no default app exists; that is the documented
       way to ask. The obvious `admin.apps.length` is a v9 compat property that
       firebase-admin v13 removed, so it reads undefined and throws
       "Cannot read properties of undefined" — which the catch below then
       reported as a credentials failure, on a runner whose credentials were
       fine. Checked against the shipped SDK now rather than remembered. */
    try { adminApp = admin.app(); }
    catch (_) { adminApp = admin.initializeApp({ databaseURL: RTDB }); }
    renderToken = await admin.auth()
      .createCustomToken('handbook-renderer', { club: '*' });
    console.log('Credentials: service account, club:"*" claim minted');
  } catch (e) {
    /* Never log the token or the credential — just why we have neither. */
    console.log('Credentials: none (' + (e && e.message ? e.message.slice(0, 120) : 'unknown') +
      ') — continuing unauthenticated, which only works while the rules are open');
    adminApp = null;
    renderToken = null;
  }
}

async function rtdb(p) {
  /* Admin reads bypass rules entirely, so this keeps working after the flip.
     The unauthenticated fetch stays as the fallback described above. */
  if (adminApp) {
    const ref = adminApp.database().ref(p.replace(/^\//, '').replace(/\.json.*$/, ''));
    /* One caller passes ?shallow=true. The admin read fetches the whole node
       instead — a few KB more over the wire for a keys-only use, and not worth
       a second code path to avoid. */
    return (await ref.once('value')).val();
  }
  const res = await fetch(RTDB + p);
  if (!res.ok) throw new Error('RTDB ' + p + ' -> HTTP ' + res.status);
  return res.json();
}

async function settle(page) {
  await page.evaluate(() => (document.fonts && document.fonts.ready) || Promise.resolve());
  await new Promise(r => setTimeout(r, 1200));
}

async function main() {
  const puppeteer = require('puppeteer-core');

  await initCredentials();

  const editionId = await rtdb('/app-data/ops-handbook/publishedEditionId.json');
  if (!editionId) { console.log('No published edition — nothing to render.'); return; }

  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(OUT_META, 'utf8')); } catch (_) {}
  if (prev && prev.editionId === editionId && fs.existsSync(OUT_PDF) && process.env.FORCE !== '1') {
    console.log('PDF already current for edition ' + editionId + ' — skipping.');
    return;
  }

  const label = await rtdb('/app-data/ops-handbook/editions/' + editionId + '/label.json');
  /* Season as a field, with the label parse only for editions published before
     that field existed. Same resolution as reader.html and print.html. */
  const seasonField = await rtdb('/app-data/ops-handbook/editions/' + editionId + '/season.json');
  const labelSeason = (String(label || '').match(/^\s*(\d{4}\s*[-\/]\s*\d{2,4})/) || [])[1] || '';
  const season = seasonField ? String(seasonField) : labelSeason;
  const publishedAt = await rtdb('/app-data/ops-handbook/editions/' + editionId + '/publishedAt.json');
  const docKeys = Object.keys(await rtdb('/app-data/ops-handbook/editions/' + editionId + '/docs.json?shallow=true') || {});
  const present = ORDER.filter(id => docKeys.includes(id));
  if (!present.length) { console.log('Edition has no areas — nothing to render.'); return; }
  const pubDate = publishedAt ? new Date(publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  console.log('Rendering edition', editionId, '(' + label + '):', present.join(', '));

  const titles = {};
  for (const id of present) {
    titles[id] = await rtdb('/app-data/ops-handbook/editions/' + editionId + '/docs/' + id + '/title.json') || SHORT[id];
  }

  let fontBytes = localFont('CarbonaRegular.otf');
  if (fontBytes) console.log('Furniture font: local CarbonaRegular.otf (' + fontBytes.length + ' bytes)');
  else fontBytes = await fetchBrandFont();
  let boldBytes = localFont('CarbonaExtraBold.otf');
  if (boldBytes) console.log('Band font: local CarbonaExtraBold.otf (' + boldBytes.length + ' bytes)');
  else boldBytes = fontBytes ? instanceBold(fontBytes) : null;
  const slantedBytes = localFont('CarbonaRegularSlanted.otf');
  if (slantedBytes) console.log('Footer font: local CarbonaRegularSlanted.otf');

  if (!process.env.CHROME_PATH) throw new Error('CHROME_PATH not set');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => console.error('pageerror:', e.message));

    /* Hand the page its credential BEFORE any of its own script runs, and as a
       variable rather than a query parameter: a URL ends up in the Actions log,
       in any server log in front of it, and in the history of anyone handed the
       link. evaluateOnNewDocument survives every goto below, so this is set
       once rather than per navigation. */
    if (renderToken) {
      await page.evaluateOnNewDocument((t) => { window.__NL_RENDER_TOKEN = t; }, renderToken);
    }

    // Pass 1 — each area as its own part.
    const { PDFDocument } = require('pdf-lib');
    const areaParts = [];
    for (const id of present) {
      await page.goto(BASE_URL + '/handbook/print.html?part=' + id, { waitUntil: 'networkidle0', timeout: 120000 });
      await page.waitForSelector('.pg--sec', { timeout: 60000 });
      await settle(page);
      const buf = await page.pdf(pdfOpts());
      areaParts.push({ id, buf, pages: (await PDFDocument.load(buf)).getPageCount() });
      console.log('  part', id + ':', areaParts[areaParts.length - 1].pages, 'pages');
    }

    // Pass 2 — front matter with real page numbers (front page count first).
    await page.goto(BASE_URL + '/handbook/print.html?part=front', { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForSelector('.pg--toc', { timeout: 60000 });
    await settle(page);
    const frontCount = (await PDFDocument.load(await page.pdf(pdfOpts()))).getPageCount();
    let cursor = frontCount + 1;
    const pagesParam = areaParts.map(p => { const s = p.id + ':' + cursor; cursor += p.pages; return s; }).join(',');
    await page.goto(BASE_URL + '/handbook/print.html?part=front&pages=' + encodeURIComponent(pagesParam), { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForSelector('.pg--toc', { timeout: 60000 });
    await settle(page);
    const frontBuf = await page.pdf(pdfOpts());

    const { bytes, starts, total } = await assemble(frontBuf, areaParts, { label: label || '', season, pubDate, fontBytes, boldBytes, slantedBytes, titles });
    fs.writeFileSync(OUT_PDF, bytes);
    fs.writeFileSync(OUT_META, JSON.stringify({
      editionId, label: label || '', season: season || '', publishedAt: publishedAt || null,
      renderedAt: new Date().toISOString(), pages: total, sections: starts
    }, null, 2) + '\n');
    console.log('Wrote', OUT_PDF, '(' + bytes.length + ' bytes,', total, 'pages) + pdf-meta.json');
  } finally {
    await browser.close();
  }
}

module.exports = { ORDER, SHORT, TOC, MM, pdfOpts, assemble, fetchBrandFont };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
