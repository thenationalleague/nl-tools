/* =========================================================================
   NL Tools — render the Wellbeing Hub poster to PDF
   File: scripts/render-wellbeing-poster.js

   Renders wellbeing-hub/poster.html to wellbeing-hub/poster.pdf.

   WHY A FILE AND NOT Ctrl+P
   A print-first HTML page is at the mercy of whoever presses print. Chrome
   ships with "Background graphics" OFF, adds its own header and footer, and
   defaults to "Fit to printable area" — so the navy masthead, the glyph
   plates and the margins all come out differently on every machine, and on
   most of them wrong. Reported as "the ctrl p mangles it totally", which is
   exactly what those defaults do.

   The handbook reached the same conclusion first; see the comment at the top
   of .github/workflows/render-handbook-pdf.yml — serve a real file, not a
   print dialog. This follows that renderer's pattern deliberately:
   puppeteer-core, CHROME_PATH, no new dependency in package.json.

   TWO SETTINGS DO THE WORK
     preferCSSPageSize  honours `@page { size: A4; margin: 11mm }` from the
       poster's own stylesheet. WITHOUT it the renderer applies its own
       geometry and ignores that margin — which is how an earlier check of
       this poster "measured" a layout no printer would ever produce.
     printBackground    paints the masthead and the chips. This is the one a
       human has to go and find under "More settings".

   USAGE
     npm install --no-save puppeteer-core
     python3 -m http.server 8899 --bind 127.0.0.1     # from the repo root
     CHROME_PATH=/path/to/chrome node scripts/render-wellbeing-poster.js

   A server is needed because the poster pulls the rose, the QR and the three
   Carbona faces by absolute path. The script REFUSES to write a PDF if any
   asset failed, rather than quietly producing a sheet with a blank square
   where the QR should be — the one fault nobody would notice until it was on
   a wall.

   The committed PDF must not drift from the HTML. tests/poster-pdf.test.mjs
   fails the build if poster.html was committed more recently than poster.pdf.
   ========================================================================= */

const fs = require('fs');
const path = require('path');

// ?render=1 is the opt-out from the poster's own print blocker. Pressing
// Ctrl+P on poster.html deliberately prints a line of instruction instead of
// the sheet, because a browser's print settings wreck it — and page.pdf()
// emulates print media, so without this the blocker would empty the very
// file it exists to protect. The assertion below proves the opt-out took.
const URL_ = process.env.POSTER_URL || 'http://127.0.0.1:8899/wellbeing-hub/poster.html?render=1';
const OUT = path.join(__dirname, '..', 'wellbeing-hub', 'poster.pdf');

(async () => {
  if (!process.env.CHROME_PATH) throw new Error('CHROME_PATH not set');
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    const failed = [];
    page.on('requestfailed', (r) => failed.push(r.url()));

    await page.goto(URL_, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);

    if (failed.length) {
      throw new Error('asset(s) failed to load — refusing to render a broken poster:\n  ' + failed.join('\n  '));
    }

    // Prove the print blocker is OFF for us before writing anything. A page
    // count cannot catch this: the blocker's instruction sheet is also one
    // page, so a silently-broken opt-out would ship a poster.pdf that reads
    // "Print the PDF, not this page" and pass every check below.
    await page.emulateMediaType('print');
    const print = await page.evaluate(() => {
      const d = (sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).display : 'missing';
      };
      return { sheet: d('.sheet'), note: d('.printnote') };
    });
    if (print.sheet === 'none' || print.sheet === 'missing' || print.note !== 'none') {
      throw new Error(
        'the poster\'s print blocker is still on — refusing to render.\n' +
        `  .sheet display in print media: ${print.sheet} (want anything but none)\n` +
        `  .printnote display in print media: ${print.note} (want none)\n` +
        '  The URL must carry ?render=1, and the script at the foot of ' +
        'poster.html must set html.is-render from it.'
      );
    }

    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const pages = (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (pages !== 1) throw new Error(`expected 1 page, got ${pages} — the poster has overflowed A4`);

    fs.writeFileSync(OUT, pdf);
    console.log(`wrote ${OUT}  ${pdf.length} bytes, ${pages} page`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
