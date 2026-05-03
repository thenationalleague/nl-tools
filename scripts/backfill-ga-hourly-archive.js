/* =======================================================================
   NL Website Insights — GA Hourly Archive Backfill
   Version: 1.0
   Date: 03/05/2026

   ONE-OFF script to seed assets/data/ga-hourly-archive.json with
   historical GA4 data going back further than the rolling 90-day window
   that fetch-ga-hourly.js maintains.

   USAGE
     BACKFILL_START=2024-11-08 BACKFILL_END=2026-05-03 \
       node scripts/backfill-ga-hourly-archive.js

   Or via the backfill-ga-archive.yml workflow (workflow_dispatch with
   start_date / end_date inputs). The workflow runs this script with
   the right env vars + commits the resulting archive file.

   BEHAVIOUR
     - Reads BACKFILL_START and BACKFILL_END (YYYY-MM-DD strings).
     - Defaults BACKFILL_END to today if not set.
     - Chunks the date range into ~30-day windows so we stay well below
       GA4's 100k-row-per-query soft limit and don't time-out the API.
     - Runs each chunk through the same query shape as fetch-ga-hourly.
     - Merges all chunks into one giant in-memory by-path map.
     - Merges that map into ga-hourly-archive.json using the same
       merge-and-overwrite logic the nightly fetch uses.
     - Idempotent: re-running with the same date range overwrites only
       those dates in the archive, preserving anything outside.

   WHEN TO RUN
     - Once, on first launch of the all-time feature, with start = the
       site's launch date (≈2024-11-08) and end = today.
     - Again only if you want to re-pull a specific date range (e.g.
       GA4 backdated some hits, or a property change). Pass a narrower
       start/end to limit the work.

   COST
     - Each 30-day chunk is roughly the size of a normal nightly fetch
       (~12-15 MB raw, ~50-100k rows). 18 months ≈ 18 chunks ≈ ~5
       minutes of GA4 work. Well under daily quota.

   CHANGELOG
   v1.0 (03/05/2026) — Initial build.
======================================================================= */

const fs = require('fs');
const path = require('path');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');

const ARCHIVE_PATH = path.join(__dirname, '..', 'assets', 'data', 'ga-hourly-archive.json');
const GA_PROPERTY_ID = process.env.GA_PROPERTY_ID;
const BACKFILL_START = process.env.BACKFILL_START;
const BACKFILL_END   = process.env.BACKFILL_END || new Date().toISOString().slice(0, 10);
const CHUNK_DAYS = 30;
const PAGE_SIZE = 100000;

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log('[' + ts + '] ' + msg);
}

function dateHourToUnix(dh) {
  if (!dh || dh.length !== 10) return 0;
  return Math.floor(Date.UTC(
    parseInt(dh.slice(0, 4), 10),
    parseInt(dh.slice(4, 6), 10) - 1,
    parseInt(dh.slice(6, 8), 10),
    parseInt(dh.slice(8, 10), 10)
  ) / 1000);
}

function normalisePath(p) {
  if (!p) return '';
  let out = p.split('?')[0].split('#')[0];
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildChunks(startDate, endDate, chunkDays) {
  const chunks = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    const next = addDays(cursor, chunkDays - 1);
    const chunkEnd = next > endDate ? endDate : next;
    chunks.push({ start: cursor, end: chunkEnd });
    cursor = addDays(chunkEnd, 1);
  }
  return chunks;
}

async function runReportPaginated(client, request, label) {
  const allRows = [];
  let offset = 0;
  let page = 1;
  while (true) {
    const paged = Object.assign({}, request, { limit: PAGE_SIZE, offset: offset });
    log('    ' + label + ': page ' + page + ' (offset ' + offset + ')');
    const [response] = await client.runReport(paged);
    const rows = response.rows || [];
    log('      got ' + rows.length + ' rows');
    allRows.push.apply(allRows, rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    page++;
  }
  return allRows;
}

async function main() {
  if (!GA_PROPERTY_ID) throw new Error('GA_PROPERTY_ID env var not set');
  if (!BACKFILL_START) throw new Error('BACKFILL_START env var not set (YYYY-MM-DD)');

  const chunks = buildChunks(BACKFILL_START, BACKFILL_END, CHUNK_DAYS);

  log('GA HOURLY ARCHIVE BACKFILL v1.0');
  log('  property:    ' + GA_PROPERTY_ID);
  log('  full range:  ' + BACKFILL_START + ' -> ' + BACKFILL_END);
  log('  chunk size:  ' + CHUNK_DAYS + ' days');
  log('  chunks:      ' + chunks.length);
  log('');

  const client = new BetaAnalyticsDataClient();
  const merged = {};
  let totalViews = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    log('CHUNK ' + (i + 1) + '/' + chunks.length + ': ' + chunk.start + ' -> ' + chunk.end);
    const rows = await runReportPaginated(client, {
      property: 'properties/' + GA_PROPERTY_ID,
      dateRanges: [{ startDate: chunk.start, endDate: chunk.end }],
      dimensions: [{ name: 'pagePath' }, { name: 'dateHour' }],
      metrics: [{ name: 'screenPageViews' }]
    }, 'chunk');

    rows.forEach(row => {
      const rawPath = row.dimensionValues[0].value;
      const dateHour = row.dimensionValues[1].value;
      const views = parseInt(row.metricValues[0].value, 10) || 0;
      if (!views) return;
      const p = normalisePath(rawPath);
      if (!p) return;
      const ts = dateHourToUnix(dateHour);
      if (!ts) return;
      if (!merged[p]) merged[p] = {};
      merged[p][ts] = (merged[p][ts] || 0) + views;
      totalViews += views;
    });
    log('    ' + rows.length + ' rows merged. Running totals: ' +
        Object.keys(merged).length + ' paths, ' +
        totalViews.toLocaleString() + ' views.');
    log('');
  }

  // Convert {path: {ts: views}} to {path: [[ts, views], ...]} sorted ascending
  const byPath = {};
  Object.keys(merged).forEach(p => {
    const keys = Object.keys(merged[p]).map(Number).sort((a, b) => a - b);
    byPath[p] = keys.map(k => [k, merged[p][k]]);
  });

  log('Distinct paths total:        ' + Object.keys(byPath).length);
  log('Total views in full range:   ' + totalViews.toLocaleString());

  // Merge into existing archive (if any). Same logic as fetch-ga-hourly.js
  // mergeIntoArchive — overlap on backfill range overwrites, anything
  // outside the range is preserved.
  let archive = null;
  if (fs.existsSync(ARCHIVE_PATH)) {
    try {
      archive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
      log('');
      log('Existing archive found: ' + (archive.pathCount || 0) + ' paths, ' +
          (archive.pointCount || 0).toLocaleString() + ' points, since ' +
          (archive.firstSeenDate || '?'));
    } catch (err) {
      log('WARN: existing archive could not be parsed (' + err.message + ') — will rebuild');
      archive = null;
    }
  }

  const existing = (archive && archive.hourly) ? archive.hourly : {};
  const startTs = Math.floor(new Date(BACKFILL_START + 'T00:00:00Z').getTime() / 1000);
  const endTs   = Math.floor(new Date(BACKFILL_END   + 'T23:59:59Z').getTime() / 1000);
  const out     = {};

  // Carry forward existing entries OUTSIDE the backfill range
  Object.keys(existing).forEach(p => {
    const arr = existing[p].filter(([ts]) => ts < startTs || ts > endTs);
    if (arr.length) out[p] = arr;
  });
  // Layer in the new backfill data
  Object.keys(byPath).forEach(p => {
    if (!out[p]) out[p] = [];
    out[p] = out[p].concat(byPath[p]);
    out[p].sort((a, b) => a[0] - b[0]);
  });

  // Compute metadata
  let earliestTs = Infinity, latestTs = 0, totalPoints = 0;
  Object.keys(out).forEach(p => {
    out[p].forEach(([ts]) => {
      if (ts < earliestTs) earliestTs = ts;
      if (ts > latestTs) latestTs = ts;
      totalPoints++;
    });
  });

  const payload = {
    generatedAt:    new Date().toISOString(),
    propertyId:     GA_PROPERTY_ID,
    firstSeenDate:  earliestTs === Infinity ? BACKFILL_START : new Date(earliestTs * 1000).toISOString().slice(0, 10),
    endDate:        latestTs === 0          ? BACKFILL_END   : new Date(latestTs   * 1000).toISOString().slice(0, 10),
    lastUpdatedAt:  new Date().toISOString(),
    pathCount:      Object.keys(out).length,
    pointCount:     totalPoints,
    schemaVersion:  1,
    hourly:         out
  };

  const dir = path.dirname(ARCHIVE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = ARCHIVE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload));
  fs.renameSync(tmp, ARCHIVE_PATH);

  const sizeMB = (fs.statSync(ARCHIVE_PATH).size / 1024 / 1024).toFixed(2);
  log('');
  log('Wrote ' + ARCHIVE_PATH + ' (' + sizeMB + 'MB)');
  log('  paths:           ' + Object.keys(out).length);
  log('  points:          ' + totalPoints.toLocaleString());
  log('  earliest data:   ' + payload.firstSeenDate);
  log('  latest data:     ' + payload.endDate);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
