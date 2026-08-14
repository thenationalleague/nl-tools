#!/usr/bin/env node
/**
 * build-embeds.js — turn a self-contained embed HTML file into a hosted,
 * self-mounting JS bundle.
 *
 * Why this exists
 * ---------------
 * The embeds in embeds/*.html are pasted into the Urban Zoo CMS in full,
 * which means every release needs a manual copy/paste. Serving the same
 * widget as a single JS file from nl.tools lets the CMS carry a permanent
 * two-line snippet instead, so merging to main updates the live site.
 *
 * A <script src> is not subject to CORS, so this deliberately inlines the
 * markup and CSS as string literals rather than fetching the HTML at
 * runtime — no cross-origin request, no dependency on nl.tools sending
 * Access-Control-Allow-Origin.
 *
 * The HTML file stays the single source of truth. This output is generated
 * and committed by .github/workflows/build-embeds.yml; do not hand-edit it.
 *
 * Usage:  node scripts/build-embeds.js [--check]
 *         --check exits 1 if any generated file is out of date (for CI).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Each entry: the source HTML, the JS to emit, and the attribute the host
// page uses to mark its mount point.
const EMBEDS = [
  {
    src: 'embeds/score-predictor.html',
    out: 'embeds/score-predictor.js',
    mountAttr: 'data-nl-score-predictor',
    globalFlag: '__nlScorePredictorMounted',
    name: 'Score Predictor',
  },
  {
    src: 'embeds/motm.html',
    out: 'embeds/motm.js',
    mountAttr: 'data-nl-motm',
    globalFlag: '__nlMotmMounted',
    name: 'Team of the Week',
  },
  {
    src: 'embeds/club-directory.html',
    out: 'embeds/club-directory.js',
    mountAttr: 'data-nl-clubs',
    globalFlag: '__nlClubDirectoryMounted',
    name: 'Club Directory',
  },
  {
    src: 'embeds/judgements.html',
    out: 'embeds/judgements.js',
    mountAttr: 'data-nl-judgements',
    globalFlag: '__nlJudgementsMounted',
    name: 'Judgements & Decisions',
  },
  {
    src: 'embeds/nl-cup-live.html',
    out: 'embeds/nl-cup-live.js',
    mountAttr: 'data-nl-cup-live',
    globalFlag: '__nlCupLiveMounted',
    name: 'NL Cup Live',
  },
  // Same source, same everything, fed a made-up fixture list — the cup plays
  // on ~10 days a season and the band correctly shows nothing on the other
  // 355, so there is otherwise no way to look at it in the real page template.
  // Built from the widget rather than forked from it, so it cannot drift.
  {
    src: 'embeds/nl-cup-live.html',
    out: 'embeds/nl-cup-live-test.js',
    mountAttr: 'data-nl-cup-live-test',
    globalFlag: '__nlCupLiveTestMounted',
    name: 'NL Cup Live (test)',
    prelude: 'scripts/nl-cup-live-test-prelude.js',
  },
];

// Pull the three parts out of the embed. The embeds follow a fixed shape —
// a leading block comment, one markup block, one <style>, one <script> —
// so this asserts that shape rather than trying to parse HTML generally.
function extract(html, srcPath) {
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];

  if (styles.length !== 1) {
    throw new Error(`${srcPath}: expected exactly 1 <style> block, found ${styles.length}`);
  }
  if (scripts.length !== 1) {
    throw new Error(`${srcPath}: expected exactly 1 inline <script> block, found ${scripts.length}`);
  }
  if (/<script[^>]+src=/.test(html)) {
    throw new Error(`${srcPath}: external <script src> found — the CMS strips these, so the embed must stay self-contained`);
  }

  // Markup is everything before the <style>, minus the header comments.
  const markup = html
    .slice(0, html.indexOf('<style>'))
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  if (!markup.startsWith('<div')) {
    throw new Error(`${srcPath}: expected the markup block to start with a <div>`);
  }

  return { markup, css: styles[0][1], js: scripts[0][1] };
}

// Read the widget's own version so the bundle can announce itself in the
// console — makes "is the CDN serving the new one yet?" answerable without
// diffing a 120KB file.
function versionOf(html) {
  const m = html.match(/NL_CHANGELOG\s*=\s*\[\s*'([^']+)'/) ||
            html.match(/^\s{7}\d{2}\/\d{2}\/\d{4}\s+(v[\d.]+)/m);
  return m ? m[1] : 'unknown';
}

function build(embed) {
  const srcPath = path.join(ROOT, embed.src);
  const html = fs.readFileSync(srcPath, 'utf8');
  const { markup, css, js } = extract(html, embed.src);
  const version = versionOf(html);

  // A prelude runs inside mount(), after the markup is in the DOM and before
  // the widget's own code — which is the only window in which it can stub a
  // fetch the widget is about to make.
  const prelude = embed.prelude
    ? fs.readFileSync(path.join(ROOT, embed.prelude), 'utf8')
    : '';

  // JSON.stringify handles every escaping concern (quotes, newlines,
  // backslashes, the Carbona data URIs) in one go.
  return `/* ${embed.name} — GENERATED FILE, DO NOT EDIT.${embed.prelude ? `
 *
 * TEST BUILD. Serves made-up fixtures from ${embed.prelude} so the widget can
 * be seen on a day the competition is not playing. Never put this on a page
 * fans use — it would be showing them games that do not exist, and it will
 * say so on the band itself. Do not put it on the same page as the live
 * bundle either: both mount markup with the same element ids.` : ''}
 *
 * Built from ${embed.src} by scripts/build-embeds.js.
 * Edit the HTML file and let CI regenerate this.
 *
 * Embed on the public site with:
 *   <div ${embed.mountAttr}></div>
 *   <script src="https://nl.tools/${embed.out}" defer></script>
 *
 * If the CMS strips <script src>, use an inline loader instead:
 *   <div ${embed.mountAttr}></div>
 *   <script>
 *     (function(){var s=document.createElement('script');
 *      s.src='https://nl.tools/${embed.out}';document.body.appendChild(s);})();
 *   </script>
 */
(function () {
  'use strict';

  // Guard against the snippet appearing twice on one page — the widget owns
  // fixed element IDs, so a second copy would fight the first.
  if (window.${embed.globalFlag}) {
    if (window.console && console.warn) {
      console.warn('[${embed.name}] already mounted on this page — ignoring duplicate embed.');
    }
    return;
  }
  window.${embed.globalFlag} = true;

  var VERSION = ${JSON.stringify(version)};
  var CSS = ${JSON.stringify(css)};
  var HTML = ${JSON.stringify(markup)};

  function mount() {
    // Mount into the host page's marker div. Falling back to appending our
    // own container means a missing marker degrades to "renders at the
    // bottom" rather than "renders nowhere".
    var host = document.querySelector('[${embed.mountAttr}]');
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('${embed.mountAttr}', '');
      document.body.appendChild(host);
      if (window.console && console.warn) {
        console.warn('[${embed.name}] no [${embed.mountAttr}] element found — appended to <body>.');
      }
    }

    var style = document.createElement('style');
    style.setAttribute('data-nl-embed', ${JSON.stringify(embed.out)});
    style.textContent = CSS;
    document.head.appendChild(style);

    // Markup must be in the DOM before the widget runs — its IIFE resolves
    // every element by ID at the top and does not wait for DOMContentLoaded.
    host.innerHTML = HTML;

    if (window.console && console.info) {
      console.info('[${embed.name}] ' + VERSION + ' mounted.');
    }

${[prelude, js].filter(Boolean).join('\n')
    .split('\n').map(function (l) { return l ? '    ' + l : l; }).join('\n')}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
`;
}

function main() {
  const check = process.argv.includes('--check');
  let stale = 0;

  EMBEDS.forEach(function (embed) {
    const outPath = path.join(ROOT, embed.out);
    const next = build(embed);
    const prev = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;

    if (prev === next) {
      console.log(`up to date: ${embed.out}`);
      return;
    }
    if (check) {
      console.error(`STALE: ${embed.out} does not match ${embed.src} — run: node scripts/build-embeds.js`);
      stale += 1;
      return;
    }
    fs.writeFileSync(outPath, next);
    console.log(`wrote: ${embed.out} (${(next.length / 1024).toFixed(0)}KB)`);
  });

  if (stale) process.exit(1);
}

main();
