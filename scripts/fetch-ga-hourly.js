/* =======================================================================
   NL Website Insights - GA Hourly Fetch
   Version: 1.0
   Date: 28/04/2026

   Queries GA4 for hour-level page-view data so we can analyse article
   performance trajectories - "first 72 hours" curves, time-of-day
   publishing patterns, decay rates.

   Output: assets/data/ga-hourly.json

   AUTH
     Same WIF setup as fetch-ga-metrics.js. No JSON keys needed.

   QUERY SHAPE
     Dimension:  pagePath, dateHour    (dateHour format YYYYMMDDHH)
     Metric:     screenPageViews
     Date range: last 30 days (start conservative; extend later if quota allows)

   OUTPUT SHAPE
     {
       generatedAt:  "...",
       startDate:    "2026-03-29",
       endDate:      "2026-04-28",
       windowDays:   30,
       pathCount:    NNNN,
       hourly: {
         "/news/2026/april/19/...": [
           [unixTimestamp, views],
           [unixTimestamp, views],
           ...
         ],
         ...
       }
     }

     Each path's array is sorted ascending by timestamp. Empty hours are
     omitted (sparse), so consumers should iterate through the array
     rather than expecting a value for every hour.

   PATH NORMALISATION
     Same as fetch-ga-metrics.js: strip query string, fragment, trailing
     slash. So legacy and modern URLs that share a numeric ID get summed
     by the consumer (Insights tool) using the same ID-suffix join we
     use in the archive's rebuild-index.js merge.

   COST CONSIDERATIONS
     - 30 days x 24 hours = 720 hour-buckets per path
     - ~1000-2000 paths receive views in any 30-day window
     - Sparse output - we expect ~30,000-100,000 rows back from GA
     - Typical response under 5MB compressed
     - GA4 Data API quota: ~5-50 tokens per query, well within standard tier
     - First run is heavier than subsequent: most paths cold for 30 days

   CHANGELOG
   v1.0 (28/04/2026) - Initial build for Insights tool
======================================================================= */

const fs = require('fs');
const path = require('path');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');

const OUTPUT_PATH = path.join(__dirname, '..', 'assets', 'data', 'ga-hourly.json');
const GA_PROPERTY_ID = process.env.GA_PROPERTY_ID;
const WINDOW_DAYS = 30;
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
}

main().catch(err => {
  console.error('FATAL:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
