#!/usr/bin/env node
/*
  Render the published handbook edition to a static PDF.

  Run by .github/workflows/render-handbook-pdf.yml (hourly + manual). Skips
  cheaply when handbook/pdf-meta.json already matches the live published
  edition, so the scheduled run is a no-op between publishes.

  How: serves nothing itself — the workflow serves the repo at
  http://127.0.0.1:8899/tools/ — and drives Chrome (CHROME_PATH from
  browser-actions/setup-chrome) over handbook/print.html, the same
  print-engineered page the in-browser "Save as PDF" uses. One renderer,
  two outputs.

  Env:
    CHROME_PATH  path to a Chrome/Chromium binary (required)
    BASE_URL     origin serving the repo under /tools/ (default http://127.0.0.1:8899)
    FORCE        "1" to re-render even if pdf-meta matches
*/
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const RTDB = 'https://nl-tools-default-rtdb.europe-west1.firebasedatabase.app';
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8899';
const OUT_PDF = path.join(__dirname, '..', 'handbook', 'handbook.pdf');
const OUT_META = path.join(__dirname, '..', 'handbook', 'pdf-meta.json');

async function rtdb(p) {
  const res = await fetch(RTDB + p);
  if (!res.ok) throw new Error('RTDB ' + p + ' -> HTTP ' + res.status);
  return res.json();
}

(async () => {
  const editionId = await rtdb('/app-data/ops-handbook/publishedEditionId.json');
  if (!editionId) {
    console.log('No published edition — nothing to render.');
    return;
  }

  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(OUT_META, 'utf8')); } catch (_) {}
  if (prev && prev.editionId === editionId && fs.existsSync(OUT_PDF) && process.env.FORCE !== '1') {
    console.log('PDF already current for edition ' + editionId + ' — skipping.');
    return;
  }

  const label = await rtdb('/app-data/ops-handbook/editions/' + editionId + '/label.json');
  const publishedAt = await rtdb('/app-data/ops-handbook/editions/' + editionId + '/publishedAt.json');
  console.log('Rendering edition', editionId, '(' + label + ')');

  if (!process.env.CHROME_PATH) throw new Error('CHROME_PATH not set');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => console.error('pageerror:', e.message));
    await page.goto(BASE_URL + '/tools/handbook/print.html', { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForSelector('.pg--cover', { timeout: 60000 });
    await page.evaluate(() => (document.fonts && document.fonts.ready) || Promise.resolve());
    await new Promise(r => setTimeout(r, 1500));  // image/paint settle

    // The running footer lives in the reserved @page bottom margin, drawn by the
    // PDF engine itself — flowed content can never overlap it. (footerTemplate
    // only supports inline styles + system fonts.)
    const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pubDate = publishedAt ? new Date(publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    await page.pdf({
      path: OUT_PDF,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: '<div style="width:100%;text-align:center;font-size:7pt;font-style:italic;color:#7a8296;font-family:Helvetica,Arial,sans-serif;">' +
        'The National League Handbook · Edition ' + escHtml(label) + (pubDate ? ' · Published ' + escHtml(pubDate) : '') + '</div>',
      margin: { top: '14mm', bottom: '16mm', left: '0mm', right: '0mm' }
    });
    fs.writeFileSync(OUT_META, JSON.stringify({
      editionId: editionId,
      label: label || '',
      publishedAt: publishedAt || null,
      renderedAt: new Date().toISOString()
    }, null, 2) + '\n');
    console.log('Wrote', OUT_PDF, '(' + fs.statSync(OUT_PDF).size + ' bytes) + pdf-meta.json');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
