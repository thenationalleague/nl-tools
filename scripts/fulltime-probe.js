#!/usr/bin/env node
/* fulltime-probe.js — can a GitHub runner read FA Full-Time?
 *
 * The Cloud Function in functions/fulltime.js is answered by Cloudflare's
 * "Attention Required!" challenge (HTTP 403) from Google's address space —
 * seen live 11/09/2026 on every page of every division. This probe asks the
 * same question from a GitHub runner, two ways: a plain fetch, and a real
 * headless Chrome that can run the challenge's JavaScript. It prints what
 * each got and parses the page with the production parser, so "works" means
 * rows came out, not just that a page came back.
 *
 * Read-only. No credentials, no writes. Run from Actions → "Probe FA Full-Time".
 */
'use strict';
const P = require('../functions/fulltime/parse.js');

const FT = process.env.FT_DIVISION || '355815748';   /* Academy North */
const url = P.urlsFor('table', FT)[0];

function line(label, r) {
  const rows = r.html ? P.parseTable(r.html).length : 0;
  const out = `${label}: HTTP ${r.status}, ${r.bytes} bytes, ${rows} table rows` +
    (r.title ? `, title "${r.title}"` : '') + (r.error ? `, error ${r.error}` : '');
  console.log(out);
  return { label, status: r.status, bytes: r.bytes, rows, title: r.title, error: r.error };
}

async function plain() {
  return line('plain fetch', await P.getHtml(url));
}

async function chrome() {
  const puppeteer = require('puppeteer-core');
  if (!process.env.CHROME_PATH) throw new Error('CHROME_PATH not set');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');
    const res = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    /* A challenge page runs a script and then reloads itself; give it a
       moment and read whatever the tab ends up on. */
    let html = await page.content();
    if (/Attention Required|Just a moment|challenge-platform/i.test(html)) {
      await new Promise((r) => setTimeout(r, 8000));
      try { await page.waitForSelector('.league-standings-table', { timeout: 20000 }); } catch (e) { /* stays on the challenge */ }
      html = await page.content();
    }
    return line('headless chrome', { html, status: res ? res.status() : 0, bytes: html.length, title: P.titleOf(html), redirected: '', error: '' });
  } finally {
    await browser.close();
  }
}

(async () => {
  console.log('Division ' + FT + ' (' + url.replace(/\?.*$/, '') + ')');
  const results = [];
  results.push(await plain());
  try { results.push(await chrome()); } catch (e) { results.push({ label: 'headless chrome', status: 0, bytes: 0, rows: 0, title: '', error: String(e.message || e) }); console.log('headless chrome: error ' + (e.message || e)); }
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    const fs = require('fs');
    fs.appendFileSync(summary, '## Full-Time probe — division ' + FT + '\n\n| route | HTTP | bytes | table rows | title | error |\n|---|---|---|---|---|---|\n' +
      results.map((r) => `| ${r.label} | ${r.status} | ${r.bytes} | ${r.rows} | ${r.title || ''} | ${r.error || ''} |`).join('\n') + '\n\n' +
      (results.some((r) => r.rows > 0) ? '**A route works.** ' + results.filter((r) => r.rows > 0).map((r) => r.label).join(' and ') + ' returned the standings.'
        : '**Neither route got the page.** Full-Time challenges this runner too.') + '\n');
  }
})().catch((e) => { console.error(e); process.exit(1); });
