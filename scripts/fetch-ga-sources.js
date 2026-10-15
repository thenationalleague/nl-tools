/* =======================================================================
   NL Website Archive - GA Daily Traffic Sources
   Version: 1.1
   Date: 15/10/2026

   Queries GA4 for news-article page views per day, per channel (Organic
   Search, Organic Social, Direct, Referral and so on) and keeps them in an
   accumulating archive. This is what lets the Website Archive's
   Performance tab show an article's FIRST-7-DAY views split by where
   readers came from. fetch-ga-metrics.js already splits views by channel,
   but only as a lifetime total, and fetch-ga-hourly.js has no channel at
   all. Day-level is fine-grained enough for a 7-day window and is around
   24 times fewer rows than hourly.

   Output:
     assets/data/ga-sources-archive.json   Accumulating archive

   WHAT IS KEPT
     Article paths only:
       - /news/ paths, for the first KEEP_DAYS days after the publish date
         in the URL (/news/2026/september/2/...). Without this cut the
         archive would grow every night with long-tail views of years-old
         articles. A /news/ path with no readable date is kept in full.
       - Pre-migration paths: before the October 2025 site move, articles
         lived at the root as /slug-12345. Those carry no date, so they are
         kept in full. GA4 holds them from November 2024 until the move, so
         they are a fixed, finite set rather than something that grows.
     rebuild-index.js joins both shapes to an article by the trailing
     numeric ID, and build-performance.js does the same.

   RUN MODES
     Nightly (archive present):  re-fetch the last REFRESH_DAYS days and
                                 merge. GA4 data settles within ~72 hours,
                                 so a 14-day refresh corrects late rows
                                 with room to spare.
     Seed / re-seed:             SOURCES_FROM=YYYY-MM-DD fetches from that
                                 date, one calendar month per query, and
                                 merges (rows outside the range are kept).
     Archive absent, no SOURCES_FROM: refuse. The archive may hold days GA4
                                 no longer serves, so a missing copy is
                                 never quietly replaced - a failed download
                                 must not overwrite the bucket with less.

   AUTH
     Same WIF setup as fetch-ga-metrics.js. No JSON keys needed.

   QUERY SHAPE
     Dimensions: pagePath, date, sessionDefaultChannelGroup
     Metric:     screenPageViews

   OUTPUT SHAPE
     {
       generatedAt, propertyId, firstSeenDate, endDate, lastUpdatedAt,
       pathCount, pointCount, keepDays, schemaVersion: 1,
       channels: ["Direct", "Organic Search", ...],   append-only index
       daily: {
         "/news/2026/september/2/...": [[20260902, 1, 412], ...]
       }
     }
     Each entry is [YYYYMMDD, channel index, views], sorted by day then
     channel. Zero rows are omitted. Paths are normalised exactly as in
     fetch-ga-hourly.js (no query string, fragment or trailing slash).

     The channel list is append-only so an index never changes meaning:
     a new channel GA4 starts reporting goes on the end.

   MERGE RULE
     Every row for a day inside the new fetch's range is replaced, for
     every path - including paths that got nothing in the new fetch, so
     a value GA4 later revises down to zero does not linger. Days outside
     the range are left untouched.

   CHANGELOG
   v1.1 (15/10/2026) - Keeps pre-migration /slug-12345 paths, which v1.0
                       dropped, losing first-7-day views for everything
                       published before the October 2025 site move. Prints
                       a ::notice summary so the run page shows the result
                       without opening the log.
   v1.0 (15/10/2026) - Initial build. Nightly 14-day refresh, monthly
                       chunked seeding from SOURCES_FROM, /news/ paths
                       only, first 31 days after publish only.
======================================================================= */

const fs = require('fs');
const path = require('path');

const ARCHIVE_PATH = path.join(__dirname, '..', 'assets', 'data', 'ga-sources-archive.json');
const GA_PROPERTY_ID = process.env.GA_PROPERTY_ID;
const SOURCES_FROM = (process.env.SOURCES_FROM || '').trim();
const REFRESH_DAYS = 14;
const KEEP_DAYS = 31;
const PAGE_SIZE = 100000;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log('[' + ts + '] ' + msg);
}

function isoDay(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return isoDay(d); }
function dayNum(iso) { return parseInt(iso.replace(/-/g, ''), 10); }
function dayToMs(n) { return Date.UTC(Math.floor(n / 10000), Math.floor(n / 100) % 100 - 1, n % 100); }

function normalisePath(p) {
  if (!p) return '';
  let out = p.split('?')[0].split('#')[0];
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

/** Publish day from /news/2026/september/2/... as YYYYMMDD, or null. */
function publishDay(p) {
  const m = /^\/news\/(\d{4})\/([a-z]+)\/(\d{1,2})(\/|$)/i.exec(p);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[2].toLowerCase());
  if (mi < 0) return null;
  return parseInt(m[1], 10) * 10000 + (mi + 1) * 100 + parseInt(m[3], 10);
}

/**
 * Keep news paths only, and only from the day before publish (time zones)
 * to KEEP_DAYS after it. Undated news paths are kept whole.
 */
const LEGACY_RX = /^\/[^/]+-\d+$/;

function keepRow(p, day) {
  if (LEGACY_RX.test(p)) return true;
  if (!p.startsWith('/news/')) return false;
  const pub = publishDay(p);
  if (pub === null) return true;
  const diff = Math.round((dayToMs(day) - dayToMs(pub)) / 86400000);
  return diff >= -1 && diff <= KEEP_DAYS;
}

/** Split [start, end] into calendar-month ranges, so no single query is huge. */
function monthChunks(start, end) {
  const out = [];
  let cur = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (cur <= last) {
    const monthEnd = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
    const chunkEnd = monthEnd < last ? monthEnd : last;
    out.push([isoDay(cur), isoDay(chunkEnd)]);
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return out;
}

/**
 * Turn GA rows into { path: [[day, channelIndex, views]] }, growing the
 * channel list as new channels appear. Rows that normalise to the same
 * (path, day, channel) are summed. Views GA4 lumped into "(other)" are
 * counted and returned so the caller can warn.
 */
function rowsToDaily(rows, channels) {
  const sums = {};
  let other = 0;
  rows.forEach(row => {
    const rawPath = row.dimensionValues[0].value;
    const date = row.dimensionValues[1].value;
    const channel = row.dimensionValues[2].value || 'Unassigned';
    const views = parseInt(row.metricValues[0].value, 10) || 0;
    if (!views) return;
    if (rawPath === '(other)') { other += views; return; }
    const p = normalisePath(rawPath);
    if (!p || !/^\d{8}$/.test(date)) return;
    const day = parseInt(date, 10);
    if (!keepRow(p, day)) return;
    let ci = channels.indexOf(channel);
    if (ci < 0) { channels.push(channel); ci = channels.length - 1; }
    const key = day + '|' + ci;
    sums[p] = sums[p] || {};
    sums[p][key] = (sums[p][key] || 0) + views;
  });
  const daily = {};
  Object.keys(sums).forEach(p => {
    daily[p] = Object.keys(sums[p]).map(k => {
      const [d, ci] = k.split('|');
      return [parseInt(d, 10), parseInt(ci, 10), sums[p][k]];
    }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  });
  return { daily, other };
}

/**
 * Replace every row for days in [fromDay, toDay] (YYYYMMDD numbers) with
 * the fresh rows, across all paths. Returns a new daily map.
 */
function mergeDaily(existing, fresh, fromDay, toDay) {
  const merged = {};
  Object.keys(existing || {}).forEach(p => {
    const kept = existing[p].filter(([d]) => d < fromDay || d > toDay);
    if (kept.length) merged[p] = kept;
  });
  Object.keys(fresh).forEach(p => {
    merged[p] = (merged[p] || []).concat(fresh[p]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  });
  return merged;
}

async function runReportPaginated(client, request, label) {
  const allRows = [];
  let offset = 0;
  let page = 1;
  while (true) {
    const paged = Object.assign({}, request, { limit: PAGE_SIZE, offset: offset });
    const [response] = await client.runReport(paged);
    const rows = response.rows || [];
    log('  ' + label + ' page ' + page + ': ' + rows.length + ' rows');
    allRows.push.apply(allRows, rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    page++;
  }
  return allRows;
}

function readArchive() {
  if (!fs.existsSync(ARCHIVE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
  } catch (err) {
    throw new Error('existing archive could not be parsed (' + err.message + ') - not overwriting it');
  }
}

async function main() {
  if (!GA_PROPERTY_ID) throw new Error('GA_PROPERTY_ID env var not set');
  if (SOURCES_FROM && !/^\d{4}-\d{2}-\d{2}$/.test(SOURCES_FROM)) {
    throw new Error('SOURCES_FROM must be YYYY-MM-DD, got "' + SOURCES_FROM + '"');
  }

  const archive = readArchive();
  if (!archive && !SOURCES_FROM) {
    throw new Error('ga-sources-archive.json is missing and SOURCES_FROM is not set. ' +
      'If this is the first run, run the workflow with a seed date. Otherwise the bucket ' +
      'download failed, and seeding over it could lose days GA4 no longer serves.');
  }

  const endDate = isoDay(new Date());
  const startDate = SOURCES_FROM || daysAgo(REFRESH_DAYS);
  const mode = SOURCES_FROM ? (archive ? 're-seed' : 'seed') : 'nightly';

  log('GA SOURCES FETCH v1.0');
  log('  property:    ' + GA_PROPERTY_ID);
  log('  mode:        ' + mode);
  log('  date range:  ' + startDate + ' -> ' + endDate);

  const { BetaAnalyticsDataClient } = require('@google-analytics/data');
  const client = new BetaAnalyticsDataClient();
  const channels = archive && Array.isArray(archive.channels) ? archive.channels.slice() : [];

  let daily = archive && archive.daily ? archive.daily : {};
  let otherViews = 0;
  const returned = [];

  for (const [from, to] of monthChunks(startDate, endDate)) {
    const rows = await runReportPaginated(client, {
      property: 'properties/' + GA_PROPERTY_ID,
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: [{ name: 'pagePath' }, { name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'screenPageViews' }]
    }, from.slice(0, 7));
    const fresh = rowsToDaily(rows, channels);
    otherViews += fresh.other;
    if (rows.length) returned.push(from.slice(0, 7));
    daily = mergeDaily(daily, fresh.daily, dayNum(from), dayNum(to));
  }

  if (otherViews) {
    log('WARN: GA4 grouped ' + otherViews.toLocaleString() + ' views under "(other)" - too many distinct rows in one query. Split the chunks smaller if this grows.');
  }
  if (mode !== 'nightly') {
    log('Months GA4 returned rows for: ' + (returned.length ? returned[0] + ' to ' + returned[returned.length - 1] + ' (' + returned.length + ')' : 'none'));
  }

  let pointCount = 0, earliest = Infinity;
  Object.keys(daily).forEach(p => daily[p].forEach(([d]) => { pointCount++; if (d < earliest) earliest = d; }));
  const earliestIso = earliest === Infinity ? startDate
    : String(earliest).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');

  const payload = {
    generatedAt:   new Date().toISOString(),
    propertyId:    GA_PROPERTY_ID,
    firstSeenDate: earliestIso,
    endDate:       endDate,
    lastUpdatedAt: new Date().toISOString(),
    pathCount:     Object.keys(daily).length,
    pointCount:    pointCount,
    keepDays:      KEEP_DAYS,
    schemaVersion: 1,
    channels:      channels,
    daily:         daily
  };

  const dir = path.dirname(ARCHIVE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = ARCHIVE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload));
  fs.renameSync(tmp, ARCHIVE_PATH);

  const sizeMB = (fs.statSync(ARCHIVE_PATH).size / 1024 / 1024).toFixed(2);
  log('');
  log('  channels:      ' + channels.join(', '));
  log('  paths:         ' + payload.pathCount);
  log('  points:        ' + pointCount.toLocaleString());
  log('  earliest data: ' + earliestIso);
  log('  file size:     ' + sizeMB + 'MB');

  // A notice shows on the run's summary page, so the outcome can be read
  // without opening the step log.
  if (process.env.GITHUB_ACTIONS) {
    console.log('::notice title=GA traffic sources::' + mode + ' ' + startDate + ' to ' + endDate +
      ', data from ' + earliestIso + ', ' + payload.pathCount + ' paths, ' + pointCount + ' points, ' + sizeMB + 'MB');
  }
}

if (require.main === module) {
  main().catch(err => {
    if (process.env.GITHUB_ACTIONS) console.log('::error title=GA traffic sources::' + String(err.message).replace(/\r?\n/g, ' '));
    console.error('FATAL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
}

module.exports = { monthChunks, rowsToDaily, mergeDaily, normalisePath, publishDay, keepRow };
