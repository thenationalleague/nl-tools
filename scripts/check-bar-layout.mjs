/* Renders every .nl-idbar in the repo at five widths and fails on horizontal
   overflow.

   WHY THIS EXISTS
   CLAUDE.md has said for a while that "verification of UI changes is still
   manual… there is no page-render test, so a converted page that silently
   breaks will not be caught by CI". This is the smallest useful answer to that,
   written the day it cost something.

   Converting the club-directory editor onto the canon bar, I added flex-wrap
   and asserted it in two unit tests. Both passed. 272 tests passed. The page
   still ran its controls off the side of the screen below ~660px, because
   .nl-idbar__actions also carried flex-shrink: 0 — and an item that cannot
   shrink is never narrower than its content, so its own wrap had no reason to
   fire. A test that greps CSS for `flex-wrap: wrap` cannot see that. A browser
   sees it immediately.

   Not wired into `npm test`: it needs a Chromium that CI does not install. Run
   it by hand after touching .nl-idbar or any page that uses it:

       node scripts/check-bar-layout.mjs

   It exits 0 and says so if no browser is available, so it is safe to call from
   a script that might run anywhere. */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

import { execFileSync } from 'node:child_process';

/* Every page carrying a bar, found rather than listed — a list goes stale the
   first time someone adds a page and does not think to come here. */
const PAGES = execFileSync('grep', ['-rl', '--include=*.html', 'class="nl-idbar', '.'],
  { encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .map(f => f.replace(/^\.\//, ''))
  .filter(f => !f.includes('node_modules') && !f.startsWith('style-guide/'))
  .sort();

function barOf(f){
  const s = readFileSync(f,'utf8');
  const i = s.search(/<(div|header)[^>]*class="[^"]*nl-idbar/);
  if (i < 0) return null;
  // walk to the matching close tag
  let d=0, j=i;
  const tag = s.slice(i).startsWith('<header') ? 'header' : 'div';
  const re = new RegExp(`</?${tag}\\b`,'g'); re.lastIndex = i;
  let m;
  while ((m = re.exec(s))) { d += m[0][1]==='/' ? -1 : 1; if (d===0) { j = m.index + m[0].length; break; } }
  return s.slice(i, s.indexOf('>', j)+1);
}

/* Whatever Chromium this machine has. Skip rather than fail if there is none —
   the point is to be runnable, not to be another thing that breaks. */
import { existsSync, readdirSync } from 'node:fs';
function chromiumPath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(root)) return null;
  const dir = readdirSync(root).find(d => /^chromium-\d+$/.test(d));
  const p = dir && `${root}/${dir}/chrome-linux/chrome`;
  return p && existsSync(p) ? p : null;
}
const exe = chromiumPath();
if (!exe) {
  console.log('No Chromium available — skipping the bar layout check.');
  process.exit(0);
}
const b = await chromium.launch({ executablePath: exe });
const p = await b.newPage();
let bad = 0;
for (const f of PAGES) {
  const bar = barOf(f);
  if (!bar) { console.log(`${f}: no nl-idbar found`); continue; }
  await p.setContent(`<link rel="stylesheet" href="file://${process.cwd()}/system/nl-brand.css"><body style="margin:0">${bar}</body>`);
  const rows = [];
  for (const w of [1440, 1024, 768, 480, 390]) {
    await p.setViewportSize({ width: w, height: 400 });
    await p.waitForTimeout(40);
    const r = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    if (r.s > r.c) { rows.push(`${w}:OVERFLOW(${r.s})`); bad++; } else rows.push(`${w}:ok`);
  }
  console.log(`${f.padEnd(34)} ${rows.join('  ')}`);
}
await b.close();
if (bad) {
  console.error(`\n${bad} overflow(s). A bar is running off the side of the page.`);
  process.exit(1);
}
console.log('\nNo horizontal overflow at any width.');
