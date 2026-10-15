/* =======================================================================
   NL Website Archive - Performance feed
   Version: 2.0
   Date: 15/10/2026

   Works out each article's views over its FIRST 14 DAYS for the Website
   Archive's Performance tab, day by day, and writes them to a small feed
   the browser loads alongside the article index.

   Inputs (both produced earlier in the same nightly job):
     assets/data/articles-index.json      the article index
     assets/data/ga-sources-archive.json  views per path, per day, per channel

   Output:
     assets/data/performance.json

   FIRST 14 DAYS
     The publish day (UK time) plus the 13 days after it, in GA4's own
     day boundaries. GA4 reports days in the property's time zone, which is
     UK time, so an article published at 23:30 counts that half hour as
     day one - the same rule for every article, so comparisons stay fair.

     Only COMPLETE days are counted: up to and including yesterday, as of
     the nightly run. An article younger than 14 complete days carries its
     age (a) and its days so far; the page compares it with what a typical
     article had at the same age, from day 2 onwards.

   JOIN
     Same rule as rebuild-index.js: every GA path ending in the article's
     numeric ID is summed (the pre-migration /slug-12345 and the modern
     /news/.../slug-12345 are one article). IDs must be 5+ digits here, so
     a modern slug that merely ends in a year (-2026) is not mistaken for an
     ID and summed with every other page that ends in that year. Slugs
     without an ID join on the path itself.

   OUTPUT SHAPE
     {
       generatedAt, schemaVersion: 1, windowDays: 7,
       dataFrom:  "2024-11-08",   first day the sources archive covers
       lastDay:   "2026-10-14",   last complete day counted
       settledTo: "2026-10-01",   last publish day with all 14 days in
       channels:  ["Organic Search", ...],
       items: {
         "<postID>": { v: 412, d: [180, 95, ...one per complete day, up to 14],
                       s: { "0": 210, "3": 40 },
                       a: 5 (complete days so far, only when under 14),
                       x: 1 (no GA rows joined, only when true) }
       }
     }
     s is keyed by index into channels. Articles published before dataFrom
     are left out: there is no first-week data for them.

   CHANGELOG
   v2.0 (15/10/2026) - 14-day window (was 7). Days are counted only once complete,
                       and young articles carry their age so the page can
                       judge them against others at the same age.
                       schemaVersion 2.
   v1.0 (15/10/2026) - Initial build.
======================================================================= */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'assets', 'data');
const INDEX_PATH = path.join(DATA_DIR, 'articles-index.json');
const SOURCES_PATH = path.join(DATA_DIR, 'ga-sources-archive.json');
const OUT_PATH = path.join(DATA_DIR, 'performance.json');
// Must match PERF_WINDOW in website-archive/index.html. Up to 28 works with
// no new fetch: fetch-ga-sources.js keeps 31 days per article.
const WINDOW_DAYS = 14;
const COMPLETE_LAG_DAYS = 1;   // the run's own day is partial; yesterday counts
const ID_RX = /-(\d{5,})$/;

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log('[' + ts + '] ' + msg);
}

const ukDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'
});

/** Publish timestamp -> YYYYMMDD in UK time, or null. */
function ukDay(iso) {
  if (!iso) return null;
  const t = new Date(iso);
  if (isNaN(t)) return null;
  const parts = {};
  ukDate.formatToParts(t).forEach(p => { parts[p.type] = p.value; });
  return parseInt(parts.year + parts.month + parts.day, 10);
}

function dayToDate(n) { return new Date(Date.UTC(Math.floor(n / 10000), Math.floor(n / 100) % 100 - 1, n % 100)); }
function dateToDay(d) { return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
function addDays(n, k) { const d = dayToDate(n); d.setUTCDate(d.getUTCDate() + k); return dateToDay(d); }
function isoToDay(iso) { return parseInt(String(iso).slice(0, 10).replace(/-/g, ''), 10); }
function dayToIso(n) { const s = String(n); return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); }

function normalisePath(p) {
  if (!p) return '';
  let out = p.split('?')[0].split('#')[0];
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

/** Index GA paths by trailing article ID (5+ digits). */
function indexPaths(daily) {
  const byId = {};
  Object.keys(daily).forEach(p => {
    const m = p.match(ID_RX);
    if (m) (byId[m[1]] = byId[m[1]] || []).push(p);
  });
  return byId;
}

/** Every GA path that belongs to this article. */
function pathsFor(slug, daily, byId) {
  const own = normalisePath(slug);
  if (!own) return [];
  const m = own.match(ID_RX);
  const out = m && byId[m[1]] ? byId[m[1]].slice() : [];
  if (daily[own] && out.indexOf(own) < 0) out.push(own);
  return out;
}

/**
 * Views over an article's first `days` complete days from its GA paths.
 * Returns { v, d, s, rows } where rows counts GA rows that fell in the window.
 */
function firstDays(paths, daily, pubDay, days) {
  const end = addDays(pubDay, days - 1);
  const d = new Array(days).fill(0);
  const s = {};
  let v = 0, rows = 0;
  paths.forEach(p => {
    (daily[p] || []).forEach(([day, ci, views]) => {
      if (day < pubDay || day > end) return;
      const k = Math.round((dayToDate(day) - dayToDate(pubDay)) / 86400000);
      d[k] += views;
      s[ci] = (s[ci] || 0) + views;
      v += views;
      rows++;
    });
  });
  return { v, d, s, rows };
}

function build(index, sources, now) {
  const daily = sources.daily || {};
  const byId = indexPaths(daily);
  const dataFrom = isoToDay(sources.firstSeenDate);
  const endDay = isoToDay(sources.endDate || isoDay(now));
  const lastDay = addDays(endDay, -COMPLETE_LAG_DAYS);
  const settledTo = addDays(lastDay, -(WINDOW_DAYS - 1));

  const items = {};
  let full = 0, young = 0, noData = 0, skipped = 0;
  (index.articles || []).forEach(a => {
    const pub = ukDay(a.publishedDateTime);
    if (!a.postID || !pub || pub < dataFrom || pub > endDay) { skipped++; return; }
    const age = Math.max(0, Math.min(WINDOW_DAYS, Math.round((dayToDate(lastDay) - dayToDate(pub)) / 86400000) + 1));
    const fw = firstDays(pathsFor(a.postSlug, daily, byId), daily, pub, age);
    const item = { v: fw.v, d: fw.d, s: fw.s };
    if (age < WINDOW_DAYS) { item.a = age; young++; }
    if (!fw.rows && age > 0) { item.x = 1; noData++; }
    else if (age === WINDOW_DAYS) full++;
    items[String(a.postID)] = item;
  });

  return {
    feed: {
      generatedAt: now.toISOString(),
      schemaVersion: 2,
      windowDays: WINDOW_DAYS,
      dataFrom: dayToIso(dataFrom),
      lastDay: dayToIso(lastDay),
      settledTo: dayToIso(settledTo),
      channels: sources.channels || [],
      items
    },
    counts: { full, young, noData, skipped }
  };
}

function isoDay(d) { return d.toISOString().slice(0, 10); }

/** Per-month count, total and median of complete-window views, for the run summary. */
function monthlySummary(index, feed) {
  const months = {};
  (index.articles || []).forEach(a => {
    const it = feed.items[String(a.postID)];
    if (!it || it.a != null || it.x) return;
    const m = String(ukDay(a.publishedDateTime)).slice(0, 6);
    (months[m] = months[m] || []).push(it.v);
  });
  return Object.keys(months).sort().map(m => {
    const vals = months[m].sort((x, y) => x - y);
    const mid = Math.floor(vals.length / 2);
    const median = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
    return { month: m.slice(0, 4) + '-' + m.slice(4), n: vals.length, total: vals.reduce((x, y) => x + y, 0), median };
  });
}

/** Median share of full-window views that came in the first n days, for complete articles since `from`. */
function earlyShare(index, feed, n, fromDay) {
  const shares = [];
  (index.articles || []).forEach(a => {
    const it = feed.items[String(a.postID)];
    if (!it || it.a != null || it.x || !it.v || ukDay(a.publishedDateTime) < fromDay) return;
    shares.push(it.d.slice(0, n).reduce((x, y) => x + y, 0) / it.v);
  });
  shares.sort((x, y) => x - y);
  if (!shares.length) return null;
  const mid = Math.floor(shares.length / 2);
  return shares.length % 2 ? shares[mid] : (shares[mid - 1] + shares[mid]) / 2;
}

function main() {
  if (!fs.existsSync(INDEX_PATH)) throw new Error('articles-index.json not found');
  if (!fs.existsSync(SOURCES_PATH)) throw new Error('ga-sources-archive.json not found - nothing to build from');
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));

  const { feed, counts } = build(index, sources, new Date());
  const tmp = OUT_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(feed));
  fs.renameSync(tmp, OUT_PATH);
  const sizeKB = Math.round(fs.statSync(OUT_PATH).size / 1024);

  log('PERFORMANCE FEED v2.0');
  log('  data from:    ' + feed.dataFrom + '   last day: ' + feed.lastDay + '   full window to: ' + feed.settledTo);
  log('  complete:     ' + counts.full);
  log('  younger:      ' + counts.young);
  log('  no GA rows:   ' + counts.noData + '  (published in range but nothing joined)');
  log('  file size:    ' + sizeKB + 'KB');
  const months = monthlySummary(index, feed);
  log('');
  log('  month     articles   total views   median');
  months.forEach(r => log('  ' + r.month + '   ' + String(r.n).padStart(8) + '   ' + String(r.total).padStart(17) + '   ' + String(r.median).padStart(6)));

  // How front-loaded readership is, on the current site (moved October 2025).
  const pct = x => x == null ? '?' : Math.round(x * 100) + '%';
  const early = [1, 2, 3].map(n => 'day ' + n + ' ' + pct(earlyShare(index, feed, n, 20251001))).join(', ');
  log('  share of first-' + WINDOW_DAYS + '-day views by: ' + early);

  if (process.env.GITHUB_ACTIONS) {
    console.log('::notice title=Share of first-' + WINDOW_DAYS + '-day views by::' + early + ' (median article, since Oct 2025)');
    console.log('::notice title=Performance feed::' + counts.full + ' with all ' + WINDOW_DAYS + ' days, ' + counts.young +
      ' younger, ' + counts.noData + ' with no GA rows, data from ' + feed.dataFrom + ', ' + sizeKB + 'KB');
    // Annotations carry one line only when read back through the API, so the
    // monthly table goes in as a single compact line.
    console.log('::notice title=Performance by month (articles/median)::' +
      months.map(r => r.month + ' ' + r.n + '/' + r.median).join(', '));
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    if (process.env.GITHUB_ACTIONS) console.log('::error title=Performance feed::' + String(err.message).replace(/\r?\n/g, ' '));
    console.error('FATAL:', err.message);
    process.exit(1);
  }
}

module.exports = { ukDay, addDays, pathsFor, indexPaths, firstDays, build, monthlySummary, earlyShare };
