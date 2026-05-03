/* =======================================================================
   NL Website Insights - GA Hourly Fetch
   Version: 2.0
   Date: 03/05/2026

   Queries GA4 for hour-level page-view data so we can analyse article
   performance trajectories - "first 72 hours" curves, time-of-day
   publishing patterns, decay rates.

   Outputs:
     assets/data/ga-hourly.json           Rolling 90-day window (live view)
     assets/data/ga-hourly-archive.json   Accumulating all-time archive

   The rolling file is what the Insights tool reads for 30d/90d views.
   The archive is read on demand when the user picks "All time" — it
   accumulates forward from the first run that has v2.0 of this script.

   For historical data prior to the first v2.0 run, run
   scripts/backfill-ga-hourly-archive.js with a start date.

   AUTH
     Same WIF setup as fetch-ga-metrics.js. No JSON keys needed.

   QUERY SHAPE
     Dimension:  pagePath, dateHour    (dateHour format YYYYMMDDHH)
     Metric:     screenPageViews
     Date range: last 90 days (covers full cohort comparison + decay
                 analysis; 30 days was too tight for stable cohort
                 medians on lower-volume publish slots)

   ROLLING-FILE OUTPUT SHAPE
     {
       generatedAt:  "...",
       startDate:    "2026-02-02",
       endDate:      "2026-05-03",
       windowDays:   90,
       pathCount:    NNNN,
       schemaVersion: 1,
       hourly: {
         "/news/2026/april/19/...": [
           [unixTimestamp, views],
           ...
         ],
         ...
       }
     }
     Each path's array is sorted ascending by timestamp. Empty hours are
     omitted (sparse).

   ARCHIVE-FILE OUTPUT SHAPE
     Same hourly shape, unbounded date range. Plus:
       firstSeenDate:  the earliest date covered (set on first write,
                       updated only by backfill)
       lastUpdatedAt:  ISO timestamp of last successful merge

     Merge rule: for any (path, timestamp) pair, the new fetch's value
     wins on overlap (corrects for late-arriving GA data within the 90d
     window). Anything older than the new fetch's startDate is left
     untouched.

   PATH NORMALISATION
     Same as fetch-ga-metrics.js: strip query string, fragment, trailing
     slash. So legacy and modern URLs that share a numeric ID get summed
     by the consumer (Insights tool) using the same ID-suffix join we
     use in the archive's rebuild-index.js merge.

   COST CONSIDERATIONS
     - 90 days x 24 hours = 2160 hour-buckets per path
     - ~1000-2000 paths receive views in any 90-day window
     - Sparse output - we expect ~100,000 rows back from GA
     - Typical response under 12-15 MB compressed
     - GA4 Data API quota: ~5-200 tokens per query, well within standard tier
     - Archive grows ~12-15 MB / 90 days → ~80 MB at 18 months. Crosses
       GitHub's recommended 50 MB single-file threshold around 9 months
       in. Add quarterly partitioning before that.

   CHANGELOG
   v2.0 (03/05/2026) - Adds accumulating archive (ga-hourly-archive.json)
                       so "All time" views in the Insights tool have data
                       to read. Each nightly run merges the rolling-90d
                       slice into the archive. Existing rolling-file
                       behaviour unchanged.
   v1.1 (28/04/2026) - Window extended from 30 to 90 days.
   v1.0 (28/04/2026) - Initial build for Insights tool.
======================================================================= */

const fs = require('fs');
const path = require('path');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');

const OUTPUT_PATH  = path.join(__dirname, '..', 'assets', 'data', 'ga-hourly.json');
const ARCHIVE_PATH = path.join(__dirname, '..', 'assets', 'data', 'ga-hourly-archive.json');
const GA_PROPERTY_ID = process.env.GA_PROPERTY_ID;
const WINDOW_DAYS = 90;
const PAGE_SIZE = 100000;

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log('[' + ts + '] ' + msg);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Convert "YYYYMMDDHH" to a unix timestamp (seconds since epoch UTC).
 * GA4 returns dateHour as a 10-character string like "2026042817".
 */
function dateHourToUnix(dh) {
  if (!dh || dh.length !== 10) return 0;
  const yyyy = parseInt(dh.slice(0, 4), 10);
  const mm   = parseInt(dh.slice(4, 6), 10) - 1;
  const dd   = parseInt(dh.slice(6, 8), 10);
  const hh   = parseInt(dh.slice(8, 10), 10);
  return Math.floor(Date.UTC(yyyy, mm, dd, hh) / 1000);
}

function normalisePath(p) {
  if (!p) return '';
  let out = p.split('?')[0].split('#')[0];
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

async function runReportPaginated(client, request, label) {
  const allRows = [];
  let offset = 0;
  let page = 1;

  while (true) {
    const paged = Object.assign({}, request, { limit: PAGE_SIZE, offset: offset });
    log('  ' + label + ': page ' + page + ' (offset ' + offset + ')');
    const [response] = await client.runReport(paged);
    const rows = response.rows || [];
    log('    got ' + rows.length + ' rows');
    allRows.push.apply(allRows, rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    page++;
  }
  return allRows;
}

async function main() {
  if (!GA_PROPERTY_ID) {
    throw new Error('GA_PROPERTY_ID env var not set');
  }

  const startDate = daysAgo(WINDOW_DAYS);
  const endDate = today();

  log('GA HOURLY FETCH v1.0');
  log('  property:    ' + GA_PROPERTY_ID);
  log('  window:      ' + WINDOW_DAYS + ' days');
  log('  date range:  ' + startDate + ' -> ' + endDate);

  const client = new BetaAnalyticsDataClient();

  log('');
  log('QUERY: pagePath x dateHour');
  const rows = await runReportPaginated(client, {
    property: 'properties/' + GA_PROPERTY_ID,
    dateRanges: [{ startDate: startDate, endDate: endDate }],
    dimensions: [
      { name: 'pagePath' },
      { name: 'dateHour' }
    ],
    metrics: [{ name: 'screenPageViews' }]
  }, 'hourly');

  log('Total rows: ' + rows.length);

  // Group by path, build sparse [timestamp, views] arrays
  const byPath = {};
  let totalViews = 0;
  rows.forEach(row => {
    const rawPath = row.dimensionValues[0].value;
    const dateHour = row.dimensionValues[1].value;
    const views = parseInt(row.metricValues[0].value, 10) || 0;
    if (!views) return;

    const p = normalisePath(rawPath);
    if (!p) return;

    const ts = dateHourToUnix(dateHour);
    if (!ts) return;

    if (!byPath[p]) byPath[p] = [];
    byPath[p].push([ts, views]);
    totalViews += views;
  });

  // Sort each path's array by timestamp ascending. Aggregate any duplicate
  // timestamps (can happen when normalised paths from different raw paths
  // collide - e.g. trailing-slash variants).
  Object.keys(byPath).forEach(p => {
    const merged = {};
    byPath[p].forEach(([ts, v]) => {
      merged[ts] = (merged[ts] || 0) + v;
    });
    const keys = Object.keys(merged).map(Number).sort((a, b) => a - b);
    byPath[p] = keys.map(k => [k, merged[k]]);
  });

  log('');
  log('Distinct paths with hourly data: ' + Object.keys(byPath).length);
  log('Total views in window:           ' + totalViews.toLocaleString());

  // Quick sanity log: top 5 paths by total views in this window
  const top5 = Object.entries(byPath)
    .map(([p, arr]) => [p, arr.reduce((sum, [, v]) => sum + v, 0)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  log('');
  log('Top 5 paths by views (last ' + WINDOW_DAYS + ' days):');
  top5.forEach(([p, v]) => {
    log('  ' + String(v).padStart(7) + '  ' + p.slice(0, 80));
  });

  // PERSIST
  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const payload = {
    generatedAt: new Date().toISOString(),
    propertyId:  GA_PROPERTY_ID,
    startDate:   startDate,
    endDate:     endDate,
    windowDays:  WINDOW_DAYS,
    pathCount:   Object.keys(byPath).length,
    schemaVersion: 1,
    hourly:      byPath
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  const sizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2);
  log('');
  log('Wrote ' + OUTPUT_PATH + ' (' + sizeMB + 'MB)');

  // Merge into the accumulating archive. Defensive: if the archive
  // already exists, read it, merge new data in, write back. Failure
  // here must not corrupt the archive or break the rolling-file write
  // we already completed above.
  try {
    log('');
    log('ARCHIVE MERGE');
    mergeIntoArchive(byPath, startDate, endDate);
  } catch (err) {
    console.error('Archive merge failed:', err.message);
    if (err.stack) console.error(err.stack);
    // Don't propagate — the rolling file is already written successfully.
    // The archive can be repaired by a subsequent run or the backfill script.
  }
}

/**
 * Merge new data into the all-time archive at ARCHIVE_PATH. New data wins
 * on overlap (corrects late-arriving GA values within the 90d window).
 * Anything older than the new fetch is left untouched.
 *
 * Atomic write: stage to a .tmp file, then rename. So a partial write
 * from a crashed process can never leave the archive in a broken state.
 */
function mergeIntoArchive(newByPath, newStartDate, newEndDate) {
  let archive = null;
  if (fs.existsSync(ARCHIVE_PATH)) {
    try {
      archive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
    } catch (err) {
      log('  WARN: existing archive could not be parsed (' + err.message + ') — will rebuild from this run');
      archive = null;
    }
  }

  const existing = (archive && archive.hourly) ? archive.hourly : {};
  const merged   = {};
  const newStartTs = Math.floor(new Date(newStartDate + 'T00:00:00Z').getTime() / 1000);

  // 1. Carry forward all existing data older than the new fetch window.
  Object.keys(existing).forEach(p => {
    const arr = existing[p].filter(([ts]) => ts < newStartTs);
    if (arr.length) merged[p] = arr;
  });

  // 2. Layer the new fetch on top — new wins on any overlap.
  Object.keys(newByPath).forEach(p => {
    if (!merged[p]) merged[p] = [];
    const seen = {};
    newByPath[p].forEach(([ts, v]) => { seen[ts] = v; });
    // Drop any existing entries that overlap the new window for this path
    merged[p] = merged[p].filter(([ts]) => ts < newStartTs);
    Object.keys(seen).forEach(ts => merged[p].push([Number(ts), seen[ts]]));
    merged[p].sort((a, b) => a[0] - b[0]);
  });

  // 3. Compute archive-wide metadata
  let earliestTs = Infinity, latestTs = 0, totalPoints = 0;
  Object.keys(merged).forEach(p => {
    merged[p].forEach(([ts]) => {
      if (ts < earliestTs) earliestTs = ts;
      if (ts > latestTs) latestTs = ts;
      totalPoints++;
    });
  });

  const firstSeenDate = (archive && archive.firstSeenDate)
    ? archive.firstSeenDate
    : (earliestTs === Infinity ? newStartDate : new Date(earliestTs * 1000).toISOString().slice(0, 10));

  const payload = {
    generatedAt:    new Date().toISOString(),
    propertyId:     GA_PROPERTY_ID,
    firstSeenDate:  firstSeenDate,
    endDate:        newEndDate,
    lastUpdatedAt:  new Date().toISOString(),
    pathCount:      Object.keys(merged).length,
    pointCount:     totalPoints,
    schemaVersion:  1,
    hourly:         merged
  };

  // Atomic write
  const tmp = ARCHIVE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload));
  fs.renameSync(tmp, ARCHIVE_PATH);

  const sizeMB = (fs.statSync(ARCHIVE_PATH).size / 1024 / 1024).toFixed(2);
  log('  paths in archive:   ' + Object.keys(merged).length);
  log('  points in archive:  ' + totalPoints.toLocaleString());
  log('  earliest data:      ' + firstSeenDate);
  log('  archive file size:  ' + sizeMB + 'MB');
  if (parseFloat(sizeMB) > 50) {
    log('  WARN: archive is over 50 MB — consider migrating to quarterly partitioning');
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
