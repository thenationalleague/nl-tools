/* =========================================================================
   NL Tools — Wellbeing Hub poster QR codes, one per edition
   File: scripts/build-wellbeing-qr.js

   Writes assets/<slug>-qr.svg for every edition the Python generator declares,
   then DECODES EACH ONE BACK and refuses to finish unless it reads the
   intended URL at four sizes.

   Generating a QR is not the same as proving it works. A QR nobody has
   scanned is a rectangle of noise printed on a sheet and pinned to a
   dressing-room wall, and the person who finds out is a player holding a
   phone up to it. Small sizes are where they fail, so 96px is in the list
   deliberately.

   THE EDITION LIST IS NOT DUPLICATED HERE. It comes from
   `build-wellbeing-hub.py --editions`, because the whole point of the
   two-edition build is one source of truth: a slug typed into this file as
   well could drift from the slug the pages are built at, and the symptom
   would be a poster whose QR points at a 404.

     npm install --no-save jsqr pngjs
     CHROME_PATH=/path/to/chrome node scripts/build-wellbeing-qr.js

   Error correction is H, the highest, because posters get scuffed, printed
   smaller than intended and photographed at an angle.
   ========================================================================= */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const EC = 'H';
const QUIET = 2;      // matches the quiet margin of the original /wellbeing QR
const SCALE = 10;
const SIZES = [370, 220, 150, 96];

/* The vendored encoder (qrcode-generator 1.4.4) already in the repo for
   uw-promo. A browser global, so it is evaluated with a stub window. */
const vendor = fs.readFileSync(path.join(REPO, 'uw-promo/qrcode.vendor.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'window', vendor + '\n;module.exports = qrcode;')(
  mod, mod.exports, {});
const qrcode = mod.exports;

function buildSvg(text) {
  const qr = qrcode(0, EC);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const total = n + QUIET * 2;
  let d = '', cx = 0, cy = 0, first = true;
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) { c++; continue; }
      let len = 0;
      while (c + len < n && qr.isDark(r, c + len)) len++;
      const x = c + QUIET, y = r + QUIET + 0.5;
      if (first) { d += `M${x} ${y}h${len}`; first = false; }
      else if (y === cy) d += `m${x - cx} 0h${len}`;
      else d += `m${x - cx} ${y - cy}h${len}`;
      cx = x + len; cy = y; c += len;
    }
  }
  const px = total * SCALE;
  return {
    svg: `<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" `
       + `width="${px}" height="${px}"><path transform="scale(${SCALE})" `
       + `stroke="#1a2a44" d="${d}"/></svg>\n`,
    modules: n, px,
  };
}

(async () => {
  if (!process.env.CHROME_PATH) throw new Error('CHROME_PATH not set');
  const puppeteer = require('puppeteer-core');
  const jsQRmod = require('jsqr');
  const jsQR = jsQRmod.default || jsQRmod;
  const { PNG } = require('pngjs');

  const editions = JSON.parse(execFileSync(
    'python3', ['-I', path.join(__dirname, 'build-wellbeing-hub.py'), '--editions'],
    { cwd: REPO, encoding: 'utf8' }));

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  let failed = 0;
  try {
    const page = await browser.newPage();
    for (const ed of editions) {
      /* ?src=poster is what makes a scan distinguishable from a typed
         address in GA4 — see the hub_entry event. */
      const url = `https://nl.tools/${ed.slug}?src=poster`;
      const out = path.join(REPO, 'assets', `${ed.slug}-qr.svg`);
      const { svg, modules, px } = buildSvg(url);
      fs.writeFileSync(out, svg);
      console.log(`\n${ed.key}: wrote assets/${ed.slug}-qr.svg  `
                + `${modules} modules (+${QUIET} quiet) = ${px}px, EC=${EC}`);
      console.log(`  encodes ${url}`);

      for (const size of SIZES) {
        const html = '<!doctype html><meta charset=utf-8>'
          + `<style>html,body{margin:0;background:#fff}`
          + `img{display:block;width:${size}px;height:${size}px;image-rendering:pixelated}</style>`
          + `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`;
        await page.setContent(html);
        await new Promise((r) => setTimeout(r, 120));
        const buf = await page.$eval('img', () => null).then(
          () => page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } }));
        const png = PNG.sync.read(Buffer.from(buf));
        const res = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
        const ok = res && res.data === url;
        if (!ok) failed++;
        console.log(`  decode @${size}px: `
          + (ok ? 'OK' : `FAILED (${res ? res.data : 'no code found'})`));
      }
    }
  } finally {
    await browser.close();
  }

  if (failed) {
    console.error(`\n*** ${failed} decode(s) failed — do not ship these ***`);
    process.exit(1);
  }
  console.log('\nevery QR decoded back to its own edition URL at all four sizes');
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
