#!/usr/bin/env node
/*
  Render the published handbook edition to a static PDF.

  Run by .github/workflows/render-handbook-pdf.yml (hourly + manual). Skips
  cheaply when handbook/pdf-meta.json already matches the live published
  edition, so the scheduled run is a no-op between publishes.

  Build is MULTI-PART: front matter (cover + contents) and each area are
  rendered as separate Chrome print jobs over handbook/print.html?part=...,
  then merged with pdf-lib. That buys three things a single pass can't do:
    - a running section strip in every page header, current section
      highlighted ("Memorandum · Articles · League Rules · ..."),
    - real page numbers in the contents (?pages=id:n,... on the front part),
    - global page numbers stamped bottom-right at merge time.
  Clickable contents rows are re-created as link annotations over the fixed
  16mm TOC row geometry (see the .pg--toc comment in print.html — keep the
  TOC constants below in sync).

  Env:
    CHROME_PATH  path to a Chrome/Chromium binary (required)
    BASE_URL     origin serving the repo under /tools/ (default http://127.0.0.1:8899)
    FORCE        "1" to re-render even if pdf-meta matches
*/
'use strict';

const fs = require('fs');
const path = require('path');

const RTDB = 'https://nl-tools-default-rtdb.europe-west1.firebasedatabase.app';
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8899';
const OUT_PDF = path.join(__dirname, '..', 'handbook', 'handbook.pdf');
const OUT_META = path.join(__dirname, '..', 'handbook', 'pdf-meta.json');

const ORDER = ['memorandum', 'articles', 'league-rules', 'appendices', 'board-directives'];
const SHORT = {
  memorandum: 'Memorandum', articles: 'Articles', 'league-rules': 'League Rules',
  appendices: 'Appendices', 'board-directives': 'Board Directives'
};

const MM = 72 / 25.4;                       // mm -> PDF points
// Contents-row geometry, mirroring print.html's fixed .pg--toc layout:
// @page top margin 14mm + 26 (pad) + 12 (h2) + 6 + 1.2 + 8 (rule) = 67.2mm.
const TOC = { xLeftMM: 24, xRightMM: 186, firstRowTopMM: 67.2, rowMM: 16 };

const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The "where am I" strip: every section listed, the current one highlighted.
function headerStrip(presentIds, currentId) {
  const items = presentIds.map(id => {
    const on = id === currentId;
    return '<span style="' + (on
      ? 'color:#9e0000;font-weight:bold;'
      : 'color:#8a92a6;') + '">' + escHtml(SHORT[id] || id) + '</span>';
  }).join('<span style="color:#c3c9d6;"> &middot; </span>');
  return '<div style="width:100%;text-align:center;font-size:6.5pt;font-family:Helvetica,Arial,sans-serif;letter-spacing:.02em;">' + items + '</div>';
}

function footerLine(label, pubDate) {
  return '<div style="width:100%;text-align:center;font-size:7pt;font-style:italic;color:#7a8296;font-family:Helvetica,Arial,sans-serif;">' +
    'The National League Handbook · Edition ' + escHtml(label) + (pubDate ? ' · Published ' + escHtml(pubDate) : '') + '</div>';
}

function pdfOpts(headerHtml, footerHtml) {
  return {
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: headerHtml || '<div></div>',
    footerTemplate: footerHtml || '<div></div>',
    margin: { top: '14mm', bottom: '16mm', left: '0mm', right: '0mm' }
  };
}

/* Merge front + area parts; stamp global page numbers (all pages but the
   cover); lay clickable link zones over the contents rows. */
async function assemble(frontBuf, areaParts) {
  const { PDFDocument, PDFName, StandardFonts, rgb } = require('pdf-lib');
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.HelveticaOblique);

  const front = await PDFDocument.load(frontBuf);
  (await out.copyPages(front, front.getPageIndices())).forEach(p => out.addPage(p));

  const starts = {};                        // areaId -> 1-based global start page
  for (const part of areaParts) {
    const doc = await PDFDocument.load(part.buf);
    starts[part.id] = out.getPageCount() + 1;
    (await out.copyPages(doc, doc.getPageIndices())).forEach(p => out.addPage(p));
  }

  out.getPages().forEach((p, i) => {
    if (i === 0) return;                    // the cover stays clean
    p.drawText(String(i + 1), { x: p.getWidth() - 12 * MM, y: 8 * MM, size: 7, font, color: rgb(0.48, 0.51, 0.59) });
  });

  // Contents rows -> GoTo links (front part is cover p1 + contents p2).
  if (out.getPageCount() > 1) {
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

async function rtdb(p) {
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

  const editionId = await rtdb('/app-data/ops-handbook/publishedEditionId.json');
  if (!editionId) { console.log('No published edition — nothing to render.'); return; }

  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(OUT_META, 'utf8')); } catch (_) {}
  if (prev && prev.editionId === editionId && fs.existsSync(OUT_PDF) && process.env.FORCE !== '1') {
    console.log('PDF already current for edition ' + editionId + ' — skipping.');
    return;
  }

  const label = await rtdb('/app-data/ops-handbook/editions/' + editionId + '/label.json');
  const publishedAt = await rtdb('/app-data/ops-handbook/editions/' + editionId + '/publishedAt.json');
  const docKeys = Object.keys(await rtdb('/app-data/ops-handbook/editions/' + editionId + '/docs.json?shallow=true') || {});
  const present = ORDER.filter(id => docKeys.includes(id));
  if (!present.length) { console.log('Edition has no areas — nothing to render.'); return; }
  const pubDate = publishedAt ? new Date(publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  console.log('Rendering edition', editionId, '(' + label + '):', present.join(', '));

  if (!process.env.CHROME_PATH) throw new Error('CHROME_PATH not set');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => console.error('pageerror:', e.message));
    const foot = footerLine(label || '', pubDate);

    // Pass 1 — each area as its own part, with its own section strip.
    const { PDFDocument } = require('pdf-lib');
    const areaParts = [];
    for (const id of present) {
      await page.goto(BASE_URL + '/tools/handbook/print.html?part=' + id, { waitUntil: 'networkidle0', timeout: 120000 });
      await page.waitForSelector('.pg--sec', { timeout: 60000 });
      await settle(page);
      const buf = await page.pdf(pdfOpts(headerStrip(present, id), foot));
      areaParts.push({ id, buf, pages: (await PDFDocument.load(buf)).getPageCount() });
      console.log('  part', id + ':', areaParts[areaParts.length - 1].pages, 'pages');
    }

    // Pass 2 — front matter with real page numbers (front page count first).
    await page.goto(BASE_URL + '/tools/handbook/print.html?part=front', { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForSelector('.pg--toc', { timeout: 60000 });
    await settle(page);
    const frontCount = (await PDFDocument.load(await page.pdf(pdfOpts(null, foot)))).getPageCount();
    let cursor = frontCount + 1;
    const pagesParam = areaParts.map(p => { const s = p.id + ':' + cursor; cursor += p.pages; return s; }).join(',');
    await page.goto(BASE_URL + '/tools/handbook/print.html?part=front&pages=' + encodeURIComponent(pagesParam), { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForSelector('.pg--toc', { timeout: 60000 });
    await settle(page);
    const frontBuf = await page.pdf(pdfOpts(null, foot));

    const { bytes, starts, total } = await assemble(frontBuf, areaParts);
    fs.writeFileSync(OUT_PDF, bytes);
    fs.writeFileSync(OUT_META, JSON.stringify({
      editionId, label: label || '', publishedAt: publishedAt || null,
      renderedAt: new Date().toISOString(), pages: total, sections: starts
    }, null, 2) + '\n');
    console.log('Wrote', OUT_PDF, '(' + bytes.length + ' bytes,', total, 'pages) + pdf-meta.json');
  } finally {
    await browser.close();
  }
}

module.exports = { ORDER, SHORT, TOC, MM, headerStrip, footerLine, pdfOpts, assemble };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
