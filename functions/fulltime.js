/**
 * fulltime.js — FA Full-Time → RTDB ingester for the Academy & Alliance
 * graphic (graphics/academy-alliance/).
 *
 * WHAT
 * ----
 * The National League Football Academy and U19 Alliance publish on FA
 * Full-Time (fulltime.thefa.com), which has no JSON feed and no CORS, so a
 * browser cannot read it. This function fetches each division's table,
 * results and fixtures pages server-side, parses the rows out of the HTML,
 * and writes them under app-data/staff-graphics/fulltime/<division>. The
 * tool reads that node behind the portal login and never touches Full-Time.
 *
 * WHY A SCHEDULED FUNCTION PLUS A TRIGGER, NOT AN ENDPOINT
 * -------------------------------------------------------
 * The org policy blocks granting public invoker to new Cloud Run services on
 * this project (see programme.js), so a callable the browser hits directly
 * cannot ship. Same answer as the NLS ingester: an hourly schedule keeps the
 * node fresh with no user action, and an RTDB trigger on
 * app-data/staff-graphics/fulltime-refresh/<uid> lets the tool ask for a
 * division to be fetched now — a Saturday-evening results card should not
 * wait for the top of the hour.
 *
 * THE PARSERS ARE THE FRAGILE PART, ON PURPOSE
 * --------------------------------------------
 * This reads HTML that the FA can restyle without notice. Every parser is a
 * pure function exported through _internals and pinned by
 * tests/fulltime.test.mjs against pages saved from the live site on
 * 10/09/2026 (tests/fixtures/fulltime/). They live in fulltime/parse.js,
 * which has no Firebase import, so the tests load them directly. A Full-Time redesign fails those
 * tests before it fails a graphic — and the tool's paste route stays as the
 * fallback either way. Nothing is parsed with a DOM library: functions/ has
 * three dependencies and this adds none.
 *
 * PAGING
 * ------
 * Results and fixtures pages default to 25 rows and offer a
 * /<kind>/1/100.html path for 100. The fetch tries the 100-row form first
 * and falls back to the plain page if that path is refused, so the worst
 * case is the same 25 rows the site shows by default.
 *
 * DIVISIONS
 * ---------
 * The eleven division IDs are duplicated in graphics/academy-alliance/app.js
 * (`ft` on each DIVISIONS entry). tests/fulltime.test.mjs asserts the two
 * lists agree, so they cannot drift silently. Season 395289686 is 2026-27;
 * it changes once a year, in both places.
 *
 * CHANGELOG
 *   10/09/2026  v1.0  First version.
 */
'use strict';

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onValueWritten } = require('firebase-functions/v2/database');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

const VERSION = '1.0';
const ROOT = 'app-data/staff-graphics/fulltime';
const REFRESH_ROOT = 'app-data/staff-graphics/fulltime-refresh';
const SERVICE_ACCOUNT = 'firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com';

const { fetchDivision, getHtml, DIVISIONS } = require('./fulltime/parse');

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/* Only kinds that fetched are written; a kind that came back null leaves the
   stored copy alone and is named in `missing`, which the tool surfaces. */
async function ingestDivision(div, db, get, now) {
  const got = await fetchDivision(div, get);
  const update = {};
  const missing = [];
  for (const kind of ['table', 'results', 'fixtures']) {
    if (got[kind]) update[kind] = got[kind]; else missing.push(kind);
  }
  update.fetchedAt = now;
  update.missing = missing;
  update.diag = got.diag;      /* what each page answered — the tool shows it when something is missing */
  update.version = VERSION;
  await db.ref(ROOT + '/' + div.key).update(update);
  logger.info('fulltime ingest', { division: div.key, table: (got.table || []).length,
    results: (got.results || []).length, fixtures: (got.fixtures || []).length, missing, diag: got.diag });
  return { key: div.key, missing };
}

async function runIngest(keys, opts) {
  const db = (opts && opts.db) || admin.database();
  const get = (opts && opts.get) || getHtml;
  const now = (opts && opts.now) || Date.now();
  const list = DIVISIONS.filter((d) => !keys || keys.indexOf(d.key) >= 0);
  const out = [];
  /* Sequential on purpose: eleven divisions × three pages in parallel is 33
     concurrent hits on a site that owes us nothing. */
  for (const div of list) out.push(await ingestDivision(div, db, get, now));
  return out;
}

// ---------------------------------------------------------------------------
// Schedules and triggers
// ---------------------------------------------------------------------------

exports.fulltimeIngestHourly = onSchedule({
  schedule: 'every 60 minutes', timeZone: 'Europe/London',
  region: 'europe-west2', serviceAccount: SERVICE_ACCOUNT,
  memory: '256MiB', timeoutSeconds: 300, maxInstances: 1, retryCount: 0,
}, async () => {
  await runIngest(null, {});
});

/* The tool writes { division, at } to fulltime-refresh/<uid>; this fetches
   that division (or all, if none named) and deletes the request. Keyed on
   uid and onValueWritten for the same reason as fan-widgets.js: a second
   press rewrites the same node. */
exports.fulltimeRefresh = onValueWritten({
  ref: '/' + REFRESH_ROOT + '/{uid}',
  instance: 'nl-tools-default-rtdb',
  region: 'europe-west1',
  serviceAccount: SERVICE_ACCOUNT,
  memory: '256MiB', maxInstances: 2,
}, async (event) => {
  if (!event.data.after.exists()) return;   // our own delete, below
  const req = event.data.after.val() || {};
  const keys = req.division && DIVISIONS.some((d) => d.key === req.division) ? [req.division] : null;
  try {
    await runIngest(keys, {});
  } finally {
    await event.data.after.ref.remove();
  }
});

exports._internals = { runIngest, ingestDivision, ROOT, REFRESH_ROOT, VERSION };
