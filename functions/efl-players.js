/**
 * efl-players.js — EFL player rows, built hourly into the nl-tools database.
 *
 *   eflPlayersHourly — every hour: for the Championship, League One, League
 *                      Two, Carabao Cup and EFL Trophy, builds one row per
 *                      player per finished match on past matchdays, into
 *                      efl/players/<season>/ in the nl-tools RTDB.
 *
 * EFL DATA IS LICENSED AND INTERNAL-ONLY. That is why this writes to the
 * nl-tools (staff) database and not to nl-widgets, where the NLS rows live:
 * nl-widgets serves fans. The efl/ node has no rules entry, so the closed
 * root denies every client; the only reader is the EFL MCP on Cloud Run, by
 * its service account's IAM role. Never add a client read rule for efl/, and
 * never mirror these rows into anything public.
 *
 * Rows have the NLS row's shape (nls/players.js) with source 'efl', so the
 * same reader logic serves both. Player IDs are shared between the NLS and
 * EFL feeds — the same person carries the same playerID in both (probed
 * 26/10/2026: 95 of 97 names on both sides had the same ID; the other two
 * were different people sharing a name, and no ID appeared under two
 * names) — so an EFL row and an NLS row for one playerID are one career.
 *
 * Pure logic in efl/backfill.js and efl/feed.js, covered by
 * tests/efl-players.test.mjs. This file owns the schedule and the database.
 *
 * CHANGELOG
 *   26/10/2026  v0.1.0  First version.
 */

'use strict';

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

const B = require('./efl/backfill');
const EF = require('./efl/feed');

const VERSION = '0.1.0';

/* The default app — index.js initialises it against the nl-tools database.
   The runtime identity is the same service account every scheduled function
   here uses; it already holds Firebase Admin on nl-tools, so no new grant is
   needed to write. */
const SERVICE_ACCOUNT = 'firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com';

const SCHEDULE_OPTS = {
  region: 'europe-west2',
  serviceAccount: SERVICE_ACCOUNT,
  memory: '512MiB',
  timeoutSeconds: 300,
  /* One instance: two runs reading the same ledger would both build the
     same match. The work is idempotent, but the doubled fetches are not
     free for the supplier. */
  maxInstances: 1,
  retryCount: 0,
};

function store() {
  const ref = admin.database().ref(B.ROOT);
  return {
    read: async (path) => (await ref.child(path).once('value')).val(),
    update: async (updates) => {
      if (updates && Object.keys(updates).length) await ref.update(updates);
    },
  };
}

async function run() {
  const started = Date.now();
  const now = started;
  const todayYmd = new Date(now).toISOString().slice(0, 10);
  const seasonID = B.seasonOf(now);
  const summary = await B.runBackfill({
    store: store(),
    feed: { fetchSeasonList: EF.fetchSeasonList, fetchDetail: EF.fetchDetail },
    now, todayYmd, seasonID, started,
  });
  await admin.database().ref(B.ROOT + '/meta/players/version').set(VERSION);
  logger.info('efl players: ' + summary.matchesWritten + ' written, ' +
    summary.errorCount + ' errors, pending ' + JSON.stringify(summary.pending), {
    version: VERSION, seasonID, matchesFetched: summary.matchesFetched,
    matchesWritten: summary.matchesWritten, errorCount: summary.errorCount,
    listErrors: summary.listErrors, caughtUp: summary.caughtUp, days: summary.days,
  });
  return summary;
}

exports.eflPlayersHourly = onSchedule(
  Object.assign({ schedule: 'every 1 hours', timeZone: 'Etc/UTC' }, SCHEDULE_OPTS),
  async () => {
    try {
      await run();
    } catch (err) {
      const why = (err && err.message) || String(err);
      logger.error('efl players run failed: ' + why, { reason: why });
    }
  });

exports._internals = { run, SCHEDULE_OPTS, VERSION };
