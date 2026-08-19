/**
 * nls-ingester.js — NLS → RTDB live ingester. Step 1 of the build spec:
 * the ingester writes, nothing reads.
 *
 * WHAT IT REPLACES
 * ----------------
 * Nineteen call sites in this repo fetch nationalleagueservices.co.uk
 * independently. Fan Widgets alone makes up to sixty paginated requests on
 * load. Every browser repeats the same work, applies its own transform, and
 * reproduces the same field-handling bugs separately. This does the work once
 * and fans out over websockets — which makes live data FRESHER, not staler:
 * RTDB is a push store, so every connected client receives a change on the
 * same write rather than waiting out its own poll interval.
 *
 * WHY A SCHEDULED FUNCTION AND NOT A CLOUD RUN SERVICE
 * ---------------------------------------------------
 * The spec calls for Cloud Run. A v2 scheduled function IS Cloud Run — same
 * runtime, same container — with two differences that matter here: the Cloud
 * Scheduler jobs are created by the deploy rather than by hand, and the whole
 * thing ships through the existing deploy-functions.yml on merge to main.
 * Nobody in this organisation has CLI access, so a build that ends "then run
 * gcloud run deploy" is a build that does not ship. Deployability was the
 * deciding constraint, not preference.
 *
 * TWO JOBS, PLAIN CRON, NO SELF-LOOP
 * ----------------------------------
 * Cloud Scheduler's floor is 60 seconds. Beating it needs a self-looping
 * handler with a warm instance, overlap protection and timeout handling — a
 * whole component to supervise, to save fifteen seconds of worst-case
 * staleness against a feed that is ultimately club officials typing into a
 * portal. The lag between a goal and an official entering it dwarfs anything
 * in this pipeline. So: an hourly baseline and a minute tick, and the tick
 * returns immediately when the derived state says hourly.
 *
 * The tick's no-op path costs ONE small RTDB read and no NLS request at all.
 * That matters: it fires 43,200 times a month and almost every one of those is
 * 3am on a Tuesday.
 *
 * CADENCE IS DERIVED FROM FIXTURES, NEVER HARDCODED — see nls/schedule.js.
 *
 * LAYERS
 * ------
 *   nls/fetch.js      upstream — swappable per competition when SP lands
 *   nls/transform.js  upstream-shaped in, consumer-shaped out
 *   nls/schedule.js   the cadence state machine (pure)
 *   nls/events.js     state → events, the thing that cannot be backfilled
 *   nls/anchors.js    synthetic kick-off records, corrected by events (pure)
 *   nls/derive.js     tables and scorers
 * This file orchestrates them and owns every RTDB write.
 *
 * CHANGELOG
 *   19/08/2026  v0.2.1  Anchor backfill: past matchdays get their event-derived
 *                       KICK_OFF records on the hourly run, bounded and
 *                       resumable like the scorer backfill. Event-derived only
 *                       — no listFlipUTC, no ingestLagMs — because a poll
 *                       observation cannot be recovered after the fact.
 *   19/08/2026  v0.2.0  Kick-off anchors (method note v18.0, 19/08/2026). NLS
 *                       never emits kick-off, so the flip to FirstHalf /
 *                       arrival at SecondHalf on the LIST writes
 *                       anchors/<matchID>/<1H|2H>, and every timed detail
 *                       event then corrects it backwards. The gap between the
 *                       two is kept per match as the feed's kick-off ingest
 *                       lag. Timed events now carry tsUTC (upstream
 *                       eventTimestamp) for the same reason.
 *   09/08/2026  v0.1.0  Initial build against spec v1.2. Two-stage polling,
 *                       pre-match unconditional window, event stream with
 *                       dedup guard and retraction, official-table base with
 *                       live overlay, incremental scorers with coverage flag.
 */

'use strict';

const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

const F = require('./nls/fetch');
const T = require('./nls/transform');
const S = require('./nls/schedule');
const E = require('./nls/events');
const A = require('./nls/anchors');
const D = require('./nls/derive');

const VERSION = '0.2.1';

/* nls/ lives in nl-widgets, alongside the feed/ fixture cache and the fan
   widgets that will read it in step 2. Writing it into nl-tools would put the
   data in one project and every consumer in another. */
const WIDGETS_DB = 'https://nl-widgets-default-rtdb.europe-west1.firebasedatabase.app';
const WIDGETS_APP = 'nls-widgets';
const ROOT = 'nls';

/* Same identity as every other function in this directory: the gen-2 default
   (compute SA) holds no Firebase roles, so RTDB drops its connection. This SA
   additionally needs Firebase Realtime Database Admin ON THE nl-widgets
   PROJECT — a one-time console grant, described in functions/README.md. */
const SERVICE_ACCOUNT = 'firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com';

const SCHEDULE_OPTS = {
  region: 'europe-west2',
  serviceAccount: SERVICE_ACCOUNT,
  memory: '512MiB',
  timeoutSeconds: 300,
  /* One instance. Two ingesters diffing the same match against the same
     previous state would both decide an event is new, and the dedup guard is
     a read-then-write rather than a transaction. Serialising is cheaper than
     making every event write atomic. */
  maxInstances: 1,
  retryCount: 0,
};

/* Second admin app, pointed at nl-widgets by URL. No credential file exists or
   could exist — it authenticates as the runtime service account above. */
function widgetsApp() {
  const existing = admin.apps.find((a) => a && a.name === WIDGETS_APP);
  if (existing) return existing;
  return admin.initializeApp({ databaseURL: WIDGETS_DB }, WIDGETS_APP);
}

function db() {
  return widgetsApp().database();
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function read(path) {
  const snap = await db().ref(ROOT + '/' + path).once('value');
  return snap.val();
}

/* Every write in this ingester goes through here or through updateMulti.
   RTDB pushes to every connected client on every write, so re-writing
   identical content wakes every open browser and bills for the egress for
   nothing (spec §4). `prevHash` is what the caller last wrote. */
async function writeIfChanged(path, value, prevHash) {
  const hash = T.contentHash(value);
  if (prevHash && hash === prevHash) return { written: false, hash };
  await db().ref(ROOT + '/' + path).set(value);
  return { written: true, hash };
}

async function updateMulti(updates) {
  if (!updates || !Object.keys(updates).length) return 0;
  await db().ref(ROOT).update(updates);
  return Object.keys(updates).length;
}

/* Bounded concurrency. Thirty-five detail fetches let loose at once against a
   feed this size is antisocial, and the run has 300 seconds regardless. */
async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------------------
// Season
// ---------------------------------------------------------------------------

/* Cached in meta/season and refreshed daily, so the ingester is not fetching
   clubs-meta.json from raw.githubusercontent once a minute. */
async function resolveSeason(now, todayYmd) {
  const cached = await read('meta/season');
  if (cached && cached.seasonID && cached.ymd === todayYmd) return cached.seasonID;
  const seasonID = await F.fetchCurrentSeason();
  await db().ref(ROOT + '/meta/season').set({ seasonID, ymd: todayYmd, updatedAt: now });
  return seasonID;
}

// ---------------------------------------------------------------------------
// Stage 1 — the list
// ---------------------------------------------------------------------------

/**
 * One request per competition. Returns shaped rows plus the competitions that
 * failed, because a partial failure must never blank the ones that worked
 * (spec §7.5) — the three that succeeded are written and the fourth is left at
 * its last known value with its existing updatedAt.
 */
async function fetchIndex(seasonID, todayYmd, now) {
  const results = await Promise.all(T.COMP_IDS.map(async (compId) => {
    try {
      const res = await F.fetchDayList(compId, seasonID, todayYmd);
      const rows = res.rows.map((m) => T.shapeIndexRow(m, now)).filter(Boolean);
      return { compId, key: T.compKeyOf(compId), rows, ok: true,
               populatedDates: res.populatedDates };
    } catch (err) {
      /* The reason goes in the LINE, and the extra field is called anything
         but `message`. firebase-functions' logger uses that key for the log
         line itself, so a payload field of that name clobbers the real error
         and leaves you staring at "list fetch failed" with no cause. This is
         documented in fan-widgets.js and I wrote it anyway, which is why the
         better diagnostics added in the previous change never reached anyone.

         An error that hides its reason costs more than the failure does. */
      const why = (err && err.message) || String(err);
      logger.error('list fetch failed (' + T.compKeyOf(compId) + '): ' + why,
        { compId, reason: why });
      return { compId, key: T.compKeyOf(compId), rows: [], ok: false, reason: why };
    }
  }));
  return results;
}

// ---------------------------------------------------------------------------
// Stage 2 — detail, and the event stream
// ---------------------------------------------------------------------------

/**
 * Fetch, shape, diff and write one match's detail.
 *
 * The read of the previous shaped node does triple duty: it gates the write on
 * a content hash, it supplies the previous state the event diff needs, and it
 * carries the lineup-completeness the pre-match cadence reads. One read, three
 * jobs — which is why event detection is close to free here (spec §5a).
 */
async function ingestDetail(row, now, serverNow) {
  const prev = await read('live/matches/' + row.id);
  const raw = await F.fetchDetail(row.id, row.comp);
  const curr = T.shapeDetail(raw, now);
  if (!curr) return { id: row.id, ok: false, reason: 'unshapeable' };

  curr.detailFetchedAt = now;

  /* Discovery, not an error. detailAvailability is our assumption about what a
     competition supplies, and for the National League Cup it is a conservative
     guess — the Cup is contested across tiers, so National League coverage was
     not safe to assume. If a pre-match lineup ever turns up for a competition
     we marked 'scores', that assumption is wrong and worth one line in the log
     to say so. Deliberately gated on pre-match: tier 7 does publish lineups
     after the whistle, and logging those would say nothing. */
  if (curr.detailAvailability !== 'full' && curr.lineupComplete &&
      !curr.live && !curr.finished) {
    logger.info('NLS_DETAIL_AVAILABILITY_UNDERSTATED', {
      compKey: curr.compKey, matchID: curr.id,
      note: 'pre-match lineup published for a competition marked scores-only',
    });
  }

  /* Kick-off measurement first: goal/booking/sub timestamps imply when the
     half actually started, and the anchor should tighten on the same poll
     that delivered the evidence. Detail `period` is deliberately not read
     for this — it sits on PreMatch all match; each event names its own. */
  const anchorsTouched = await applyAnchorMeasurements(curr, now);

  const seenKeys = await readSeenFor(curr);
  const { created, retracted } = E.diffDetail(prev, curr, seenKeys);

  const updates = {};

  /* Append only. A correction upstream produces a NEW event, never an edit —
     otherwise a live blog silently rewrites its own history. */
  created.forEach((e) => {
    const ymd = T.ymdOf(curr.ko ? new Date(curr.ko) : new Date(now)) || T.ymdOf(new Date(now));
    updates['events/' + ymd + '/' + e.eventKey] =
      Object.assign({}, e, { detectedAt: serverNow, retracted: false });
    updates['seen/' + e.eventKey] = true;
  });

  /* An entry that has vanished was deleted by an official. Flag it, never
     delete the node — the consumer decides between striking through and
     hiding, and neither is the ingester's call to make. */
  retracted.forEach((key) => {
    const ymd = T.ymdOf(curr.ko ? new Date(curr.ko) : new Date(now)) || T.ymdOf(new Date(now));
    updates['events/' + ymd + '/' + key + '/retracted'] = true;
    updates['events/' + ymd + '/' + key + '/retractedAt'] = serverNow;
  });

  await updateMulti(updates);

  const changed = !prev || T.contentHash(prev) !== T.contentHash(curr);
  if (changed) await db().ref(ROOT + '/live/matches/' + row.id).set(curr);

  return {
    id: row.id, ok: true, changed,
    created, retractedCount: retracted.length,
    lineupComplete: curr.lineupComplete,
    detailFetchedAt: now,
    anchorsTouched,
  };
}

// ---------------------------------------------------------------------------
// Kick-off anchors — the synthetic event NLS never emits
// (nls/anchors.js carries the method; this owns the reads and writes)
// ---------------------------------------------------------------------------

/**
 * Stage 1's contribution: the LIST arriving at FirstHalf/SecondHalf writes the
 * low-confidence anchor. Only rows whose period moved since the previous run
 * reach RTDB here — a match sitting in its half costs nothing per poll. The
 * record itself survives restarts, so a cold start mid-half reads the anchor
 * it wrote earlier and leaves it alone.
 *
 * An anchor failure is contained: it must never cost the run its index write
 * or its event stream.
 */
async function applyAnchorArrivals(rows, now) {
  let touched = 0;
  await Promise.all(rows.map(async (row) => {
    const slot = A.arrivalSlotOf(row.period, row.prevPeriod);
    if (!slot) return;
    try {
      const path = 'anchors/' + row.id + '/' + slot;
      const existing = await read(path);
      /* Witnessed = the previous poll's period was known and different, i.e.
         this poll saw the flip itself rather than finding the match already
         in play — only those observations feed the lag exhibit. */
      const r = A.applyListArrival(existing, now, row.prevPeriod != null);
      if (r.changed) {
        await db().ref(ROOT + '/' + path).set(r.record);
        touched += 1;
      }
    } catch (err) {
      const why = (err && err.message) || String(err);
      logger.error('anchor arrival failed (' + row.id + '): ' + why,
        { matchID: row.id, reason: why });
    }
  }));
  return touched;
}

/**
 * Stage 2's contribution: every timed event on a fetched detail is a kick-off
 * measurement, and the best one per period corrects the anchor backwards —
 * or creates it, when a poller gap meant the flip was never observed.
 */
async function applyAnchorMeasurements(detail, now) {
  const measured = A.measureDetail(detail);
  let touched = 0;
  for (const slot of ['1H', '2H']) {
    if (measured[slot] == null) continue;
    try {
      const path = 'anchors/' + detail.id + '/' + slot;
      const existing = await read(path);
      const r = A.applyMeasurement(existing, measured[slot], now);
      if (r.changed) {
        await db().ref(ROOT + '/' + path).set(r.record);
        touched += 1;
      }
    } catch (err) {
      const why = (err && err.message) || String(err);
      logger.error('anchor measurement failed (' + detail.id + '): ' + why,
        { matchID: detail.id, reason: why });
    }
  }
  return touched;
}

/* The dedup guard, checked rather than inferred from the previous node —
   `prev` is absent after a cold start mid-match, and a restarted ingester must
   not replay the first half into a live blog (spec §5a). Only the keys this
   match could produce are read, so the guard never loads the day. */
async function readSeenFor(detail) {
  const ids = [detail.home && detail.home.id, detail.away && detail.away.id].filter(Boolean);
  const seen = new Set();
  await Promise.all(ids.map(async (teamID) => {
    /* seen/ is flat and keyed by eventKey, which is prefixed by matchID_teamID
       — so a bounded range query returns exactly this match's keys. \uf8ff is
       the highest code point Firebase will index, which is what turns a range
       query into a prefix query; it is not a typo. */
    const snap = await db().ref(ROOT + '/seen')
      .orderByKey()
      .startAt(detail.id + '_' + teamID + '_')
      .endAt(detail.id + '_' + teamID + '_')
      .once('value');
    Object.keys(snap.val() || {}).forEach((k) => seen.add(k));
  }));
  return seen;
}

// ---------------------------------------------------------------------------
// Derived — tables and scorers
// ---------------------------------------------------------------------------

const CUP_GROUPS = ['A', 'B', 'C', 'D'];

/**
 * Official table as the base, in-play matches applied on top.
 *
 * `refreshBase` is true on the hourly run only. During a live window the base
 * is reused from what was last written, so a 60s cadence does not mean a
 * league-table request a minute — the settled part of the table cannot have
 * moved without a match finishing, and when one does the next hourly run
 * absorbs it.
 */
async function writeTables(seasonID, indexResults, now, refreshBase) {
  const written = [];
  for (const res of indexResults) {
    if (res.key === 'cup') continue;                 // groups, handled below
    try {
      const existing = await read('derived/tables/' + res.key);
      let base = existing && Array.isArray(existing.base) ? existing.base : null;

      if (refreshBase || !base) {
        const raw = await F.fetchTable(res.compId, seasonID);
        const shaped = D.shapeTable(raw);
        /* An empty table means "not initialised yet" (seen pre-season on North
           and South) — never a reason to overwrite a good one. */
        if (shaped.length) base = shaped;
      }
      if (!base || !base.length) continue;

      const { rows, applied } = D.applyLiveToTable(base, res.rows);
      const node = {
        compKey: res.key,
        season: seasonID,
        basis: applied ? 'official+live' : 'official',
        liveMatchesApplied: applied,
        base: base,
        rows: rows,
        updatedAt: now,
        source: 'nls',
      };
      const prevHash = existing ? T.contentHash(existing) : null;
      const r = await writeIfChanged('derived/tables/' + res.key, node, prevHash);
      if (r.written) written.push(res.key);
    } catch (err) {
      const why = (err && err.message) || String(err);
      logger.error('table build failed (' + res.key + '): ' + why, { compKey: res.key, reason: why });
    }
  }

  if (refreshBase) {
    /* Cup groups only exist while the cup is running; their absence is normal
       and must not be logged as a failure every hour of the summer. */
    const groups = {};
    for (const g of CUP_GROUPS) {
      try {
        const shaped = D.shapeTable(await F.fetchTable(1275, seasonID, g));
        if (shaped.length) groups[g] = { rows: shaped };
      } catch (err) { /* group not running */ }
    }
    if (Object.keys(groups).length) {
      const existing = await read('derived/tables/cup');
      const node = { compKey: 'cup', season: seasonID, basis: 'official',
        groups, updatedAt: now, source: 'nls' };
      const r = await writeIfChanged('derived/tables/cup', node,
        existing ? T.contentHash(existing) : null);
      if (r.written) written.push('cup');
    }
  }

  return written;
}

/** Fold newly detected goals into the running tally, per competition. */
async function writeScorers(createdByComp, now) {
  const touched = [];
  for (const [compKey, events] of Object.entries(createdByComp)) {
    if (!events.length) continue;
    const existing = (await read('derived/scorers/' + compKey)) || {};
    const { scorers, added } = D.mergeScorers(existing, events, now);
    if (!added) continue;
    const updates = {};
    Object.keys(scorers).forEach((pid) => {
      if (T.contentHash(existing[pid]) !== T.contentHash(scorers[pid])) {
        updates['derived/scorers/' + compKey + '/' + pid] = scorers[pid];
      }
    });
    await updateMulti(updates);
    touched.push(compKey + ':' + added);
  }
  return touched;
}

/**
 * The coverage flag (spec §5.2).
 *
 * A scorer table that silently under-reports because clubs never entered goal
 * events is worse than one that admits the gap. Hourly only — it needs the
 * season's list rows, which is ~24 requests, and the number does not move
 * between minutes.
 */
async function writeCoverage(seasonID, now) {
  for (const compId of T.COMP_IDS) {
    const key = T.compKeyOf(compId);
    try {
      const raw = await F.fetchSeasonList(compId, seasonID);
      const rows = raw.map((m) => T.shapeIndexRow(m, now)).filter(Boolean);
      const scorers = (await read('derived/scorers/' + key)) || {};
      const accounted = D.tallyTotal(scorers, 0);
      const cov = D.goalsUnaccounted(rows, accounted);
      const existing = await read('derived/coverage/' + key);
      await writeIfChanged('derived/coverage/' + key,
        Object.assign({ compKey: key, season: seasonID, updatedAt: now,
          pendingBackfillDays: (await read('meta/backfill/' + key + '/pending')) || 0,
          note: 'goalsUnaccounted are goals in finished matches for which no goal event exists in the tally. Own goals are never credited to a scorer and always count toward the gap. While pendingBackfillDays is above zero the figure is our catch-up, not a claim about upstream.' }, cov),
        existing ? T.contentHash(existing) : null);

      /* The fixture node — slow-changing schedule, grouped per matchday so a
         consumer reads a day rather than a season. Hash-gated per day, so a
         season of unchanged fixtures writes nothing. */
      await writeFixtures(key, rows, now);
    } catch (err) {
      const why = (err && err.message) || String(err);
      logger.error('coverage/fixtures build failed (' + key + '): ' + why, { compKey: key, reason: why });
    }
  }
}

async function writeFixtures(compKey, rows, now) {
  const byDay = {};
  rows.forEach((r) => {
    const ymd = T.ymdOf(new Date(r.ko));
    if (!ymd) return;
    (byDay[ymd] || (byDay[ymd] = {}))[r.id] = {
      id: r.id, comp: r.comp, compKey: r.compKey, ko: r.ko,
      period: r.period, finished: r.finished, postponed: r.postponed,
      home: { id: r.home.id, name: r.home.name, crest: r.home.crest, score: r.home.score },
      away: { id: r.away.id, name: r.away.name, crest: r.away.crest, score: r.away.score },
      updatedAt: now, source: 'nls',
    };
  });
  const existing = (await read('fixtures/' + compKey)) || {};
  for (const [ymd, day] of Object.entries(byDay)) {
    const prevHash = existing[ymd] ? T.contentHash(existing[ymd]) : null;
    await writeIfChanged('fixtures/' + compKey + '/' + ymd, day, prevHash);
  }
}

/**
 * meta/calendar/<compKey> — { '2026-08-08': 12, ... }
 *
 * Just the date and the count; the day name upstream supplies is derivable and
 * would only be a second thing to keep in step.
 */
async function writeCalendar(results, seasonID, now) {
  for (const res of results) {
    if (!res.populatedDates) continue;
    const days = {};
    Object.keys(res.populatedDates).forEach((ymd) => {
      const v = res.populatedDates[ymd];
      const n = Number(v && v.count != null ? v.count : v);
      if (n > 0) days[ymd] = n;
    });
    if (!Object.keys(days).length) continue;
    const node = { compKey: res.key, season: seasonID, days, updatedAt: now, source: 'nls' };
    const existing = await read('meta/calendar/' + res.key);
    await writeIfChanged('meta/calendar/' + res.key, node,
      existing ? T.contentHash(existing) : null);
  }
}

/**
 * Scorer backfill for matchdays the ingester was not running for.
 *
 * WHY THIS IS NOT THE EVENT STREAM
 * The scorer tally is incremental — it counts goals detected live — which
 * means a season that started before the ingester did has no named scorers at
 * all, and the coverage flag then reports OUR gap as if it were upstream's.
 * "45 goals, 0 with a named scorer, no goal event entered upstream" was an
 * assertion about NLS that nobody had checked. It was wrong: the detail was
 * there, we had simply never asked for it.
 *
 * So the tally is backfilled from match detail. The EVENT STREAM deliberately
 * is not. Events carry `detectedAt`, consumers are told to order by it, and
 * back-dating a season of goals into today would dump sixteen hundred matches
 * into the top of a live blog. §5a's "cannot be backfilled" stands — what is
 * being recovered here is a COUNT, which is derivable from state, not a
 * sequence of moments, which is not.
 *
 * Their keys are still written to seen/ so that if one of these matches is
 * ever fetched live, its goals do not emit as though they had just happened.
 *
 * Bounded per run and resumable: each competition records the matchdays it has
 * finished with, so an interrupted catch-up resumes rather than restarting.
 */
const BACKFILL_DAYS_PER_RUN = 5;

async function backfillScorers(seasonID, now, todayYmd) {
  const summary = [];
  for (const compId of T.COMP_IDS) {
    const key = T.compKeyOf(compId);
    try {
      const cal = await read('meta/calendar/' + key);
      if (!cal || !cal.days) continue;
      const done = (await read('meta/backfill/' + key)) || {};
      const doneDays = done.days || {};

      /* Past days only. Today is the live path's job, and a future day has
         nothing to count. */
      const pending = Object.keys(cal.days).sort()
        .filter((d) => d < todayYmd && !doneDays[d]);
      if (!pending.length) continue;

      for (const ymd of pending.slice(0, BACKFILL_DAYS_PER_RUN)) {
        const listed = await F.fetchDayList(compId, seasonID, ymd);
        const rows = listed.rows.map((m) => T.shapeIndexRow(m, now)).filter(Boolean);
        const finished = rows.filter((r) => r.finished);

        const details = await mapPool(finished, 4, async (r) => {
          try { return T.shapeDetail(await F.fetchDetail(r.id, r.comp), now); }
          catch (err) { return null; }
        });

        const goals = [];
        const seenUpdates = {};
        details.filter(Boolean).forEach((d) => {
          E.goalEvents(d, E.contextOf(d)).forEach((g) => {
            goals.push(g);
            seenUpdates['seen/' + g.eventKey] = true;
          });
        });

        if (goals.length) {
          const existing = (await read('derived/scorers/' + key)) || {};
          const merged = D.mergeScorers(existing, goals, now).scorers;
          const updates = Object.assign({}, seenUpdates);
          Object.keys(merged).forEach((pid) => {
            if (T.contentHash(existing[pid]) !== T.contentHash(merged[pid])) {
              updates['derived/scorers/' + key + '/' + pid] = merged[pid];
            }
          });
          await updateMulti(updates);
        }

        await db().ref(ROOT + '/meta/backfill/' + key + '/days/' + ymd).set(true);
        summary.push(key + '/' + ymd + ':' + goals.length);
      }

      const left = pending.length - Math.min(pending.length, BACKFILL_DAYS_PER_RUN);
      await db().ref(ROOT + '/meta/backfill/' + key + '/pending').set(left);
    } catch (err) {
      const why = (err && err.message) || String(err);
      logger.error('scorer backfill failed (' + key + '): ' + why, { compKey: key, reason: why });
    }
  }
  return summary;
}

/**
 * Anchor backfill for matchdays the ingester was not running for.
 *
 * The event-derived half of a kick-off is DERIVABLE FROM STATE: the
 * eventTimestamp, eventMinute and eventPeriod the formula needs all persist
 * on the detail response indefinitely, so fetching a past day's details and
 * running the same measurement produces exactly what the live path would
 * have converged on. Same doctrine as the scorer backfill above — a derived
 * value is recoverable from state; a sequence of observations is not.
 *
 * Which is also the honest limit: the LIST-FLIP half cannot be recovered,
 * because nothing stores past poll observations. Backfilled anchors are
 * event-derived/high only, carry no listFlipUTC and no ingestLagMs — the
 * kick-off ingest-lag exhibit only ever comes from a witnessed flip.
 * Matches with no timed events stay unanchored rather than guessed at.
 *
 * A separate done-ledger from the scorer backfill (meta/anchor-backfill/*),
 * because the scorer ledger marked its days done before anchors existed —
 * sharing it would either re-run scorers or never run anchors.
 */
async function backfillAnchors(seasonID, now, todayYmd) {
  const summary = [];
  for (const compId of T.COMP_IDS) {
    const key = T.compKeyOf(compId);
    try {
      const cal = await read('meta/calendar/' + key);
      if (!cal || !cal.days) continue;
      const done = (await read('meta/anchor-backfill/' + key)) || {};
      const doneDays = done.days || {};

      /* Past days only — today belongs to the live path. */
      const pending = Object.keys(cal.days).sort()
        .filter((d) => d < todayYmd && !doneDays[d]);
      if (!pending.length) continue;

      for (const ymd of pending.slice(0, BACKFILL_DAYS_PER_RUN)) {
        const listed = await F.fetchDayList(compId, seasonID, ymd);
        const rows = listed.rows.map((m) => T.shapeIndexRow(m, now)).filter(Boolean);
        /* Finished matches, plus abandoned ones — an abandoned match still
           kicked off, and its first-half events are legitimate measurements.
           Postponed never anchors: it never reaches this filter. */
        const played = rows.filter((r) => r.finished || r.period === 'abandoned');

        let written = 0;
        await mapPool(played, 4, async (r) => {
          try {
            const d = T.shapeDetail(await F.fetchDetail(r.id, r.comp), now);
            if (!d) return;
            /* Two statements on purpose: `written += await x` reads `written`
               BEFORE the await suspends, so concurrent workers lose counts. */
            const n = await applyAnchorMeasurements(d, now);
            written += n;
          } catch (err) { /* one match's detail failing must not stall the day */ }
        });

        await db().ref(ROOT + '/meta/anchor-backfill/' + key + '/days/' + ymd).set(true);
        summary.push(key + '/' + ymd + ':' + written);
      }

      const left = pending.length - Math.min(pending.length, BACKFILL_DAYS_PER_RUN);
      await db().ref(ROOT + '/meta/anchor-backfill/' + key + '/pending').set(left);
    } catch (err) {
      const why = (err && err.message) || String(err);
      logger.error('anchor backfill failed (' + key + '): ' + why, { compKey: key, reason: why });
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

async function runIngest(now, opts) {
  const options = opts || {};
  const started = Date.now();
  const todayYmd = T.ymdOf(new Date(now));
  const serverNow = admin.database.ServerValue.TIMESTAMP;

  const snapshot = (await read('meta/ingest')) || {};

  if (!options.force) {
    const decision = S.shouldRun(snapshot, now, todayYmd);
    if (!decision.run) {
      /* The cheap no-op. One small read, no NLS request. */
      return { ran: false, reason: decision.reason };
    }
  }

  /* Spec §7.1 — alert on write ABSENCE, not just write error. An ingester that
     has stopped produces no errors at all, which is why a silent Saturday is
     the real risk. This is the signal a log-based alert policy attaches to;
     the policy itself is a console setup, described in functions/README.md. */
  if (snapshot.mode === 'live' && snapshot.lastSuccess &&
      now - snapshot.lastSuccess > 5 * 60 * 1000) {
    logger.error('NLS_INGEST_STALE', {
      lastSuccess: snapshot.lastSuccess,
      staleMs: now - snapshot.lastSuccess,
      note: 'no successful ingest for over 5 minutes during a live window',
    });
  }

  const seasonID = await resolveSeason(now, todayYmd);
  const indexResults = await fetchIndex(seasonID, todayYmd, now);
  const okResults = indexResults.filter((r) => r.ok);
  const failed = indexResults.filter((r) => !r.ok).map((r) => r.key);

  /* Carry the REASON into RTDB, not just the fact of failure.
     Cloud Logging is where this belonged in principle and where it was useless
     in practice: the only person who needs it has console access and a monitor
     page already open, and making them cross to Logs Explorer to find out why
     a red box is red is a worse tool than one that just says. Truncated, and
     never containing a request URL — an outlet key would sit in its path. */
  const failureReasons = {};
  indexResults.filter((r) => !r.ok).forEach((r) => {
    failureReasons[r.key] = String(r.reason || 'unknown').slice(0, 300);
  });

  /* One competition failing is a blip and is handled by leaving that node at
     its last known value. ALL FOUR failing is not four blips — it is the
     upstream being unreachable, and it deserves a single loud line rather than
     four routine ones, because it is the only shape of failure where the
     ingester is writing nothing at all. This is what to alert on alongside
     NLS_INGEST_STALE. */
  if (failed.length === T.COMP_IDS.length) {
    logger.error('NLS_UPSTREAM_UNREACHABLE', {
      failed: failed,
      note: 'every competition list fetch failed — see the preceding "list fetch failed" lines for the cause',
    });
  }

  /* Previous index rows carry lineupComplete and detailFetchedAt from the last
     detail fetch, which is what the pre-match cadence and the per-match due
     check read. Four small reads. */
  const prevIndex = {};
  await Promise.all(okResults.map(async (res) => {
    prevIndex[res.key] = (await read('live/index/' + res.key + '/' + todayYmd)) || {};
  }));

  const rows = [];
  okResults.forEach((res) => {
    res.rows.forEach((row) => {
      const prevRow = prevIndex[res.key][row.id] || {};
      row.lineupComplete = Boolean(prevRow.lineupComplete);
      row.detailFetchedAt = prevRow.detailFetchedAt || 0;
      row.prevSignature = T.signatureOf(prevRow);
      /* What the LIST said last run — the anchor arrival detector compares
         against it. Null on the first sighting of the day or a cold start,
         which anchors at low confidence but never claims a witnessed flip. */
      row.prevPeriod = prevRow.period || null;
      /* Stamped on the first run that observes full time, and carried
         thereafter. This is what the 20-minute cooldown is measured from —
         see the finished branch of schedule.matchPlan for why an assumed
         match length was the wrong thing to measure from. */
      row.finishedAt = row.finished ? (prevRow.finishedAt || now) : null;
      rows.push(row);
    });
  });

  /* Kick-off anchors from the list, BEFORE detail runs — so when the flip and
     the first timed events land on the same poll, the event correction in
     ingestDetail revises the anchor this run just created rather than racing
     it. Detail `period` never participates: it sits on PreMatch for the whole
     match, so the list is the only period source read here. */
  const anchorArrivals = await applyAnchorArrivals(rows, now);

  const plan = S.derivePlan(rows, now);
  const byId = new Map(rows.map((r) => [r.id, r]));

  /* Stage 2's gate. `onChange` fetches only where the signature moved — on a
     typical Saturday minute that is five or six matches, not thirty-five.
     `unconditional` is the pre-match exception: the signature CANNOT move
     while team news arrives, so a signature-only trigger would fetch nothing
     and lineups would appear at kick-off (spec §3). */
  const due = plan.targets.filter((t) => {
    const row = byId.get(t.id);
    if (!row) return false;
    if (t.mode === 'onChange') return T.signatureOf(row) !== row.prevSignature;
    return now - (row.detailFetchedAt || 0) >= t.intervalSec * 1000 - 1000;
  });

  const detailResults = await mapPool(due, 6, async (t) => {
    try {
      return await ingestDetail(byId.get(t.id), now, serverNow);
    } catch (err) {
      const why = (err && err.message) || String(err);
      logger.error('detail ingest failed (' + t.id + '): ' + why, { matchID: t.id, reason: why });
      return { id: t.id, ok: false };
    }
  });

  /* Fold detail outcomes back into the index rows before writing them, so the
     next run's cadence decision reads a current lineupComplete. */
  const createdByComp = {};
  let anchorCorrections = 0;
  detailResults.forEach((r) => {
    if (!r || !r.ok) return;
    anchorCorrections += r.anchorsTouched || 0;
    const row = byId.get(r.id);
    if (row) {
      row.lineupComplete = r.lineupComplete;
      row.detailFetchedAt = r.detailFetchedAt;
    }
    (r.created || []).forEach((e) => {
      (createdByComp[e.compKey] || (createdByComp[e.compKey] = [])).push(e);
    });
  });

  /* Write the index per competition-day. Only the competitions that fetched
     successfully are touched — the failed one keeps its last known value and
     its existing updatedAt, which is the whole of §7.5. */
  let indexWrites = 0;
  for (const res of okResults) {
    const node = {};
    res.rows.forEach((row) => {
      const clean = Object.assign({}, row);
      delete clean.prevSignature;
      delete clean.prevPeriod;
      node[row.id] = clean;
    });
    const r = await writeIfChanged('live/index/' + res.key + '/' + todayYmd, node,
      T.contentHash(prevIndex[res.key]));
    if (r.written) indexWrites += 1;
  }

  /* The season matchday calendar, arriving free on the list request. Without
     it nothing can discover WHICH days have fixtures: the rules grant reads
     per day and never at the parent, so a consumer has to name its day. The
     calendar is what turns "name a day" into something browsable rather than
     something you guess at. Under meta/, which is granted wholesale. */
  await writeCalendar(okResults, seasonID, now);

  const scorerTouches = await writeScorers(createdByComp, now);
  /* ALL competitions, not just the ones whose day list worked. The official
     league table is its own request and does not depend on today's card at
     all — passing only okResults meant a day-list failure silently suppressed
     every table, so the Tables tab looked broken for a reason that had nothing
     to do with tables. A competition with no live rows simply gets its
     official table with no overlay, which is correct. */
  const tableWrites = await writeTables(seasonID, indexResults, now, Boolean(options.hourly));
  if (options.hourly) {
    /* Backfill BEFORE coverage, so the gap the coverage flag reports is the
       real one rather than the catch-up still in progress. */
    await backfillScorers(seasonID, now, todayYmd);
    await backfillAnchors(seasonID, now, todayYmd);
    await writeCoverage(seasonID, now);
  }

  const createdCount = Object.values(createdByComp).reduce((n, a) => n + a.length, 0);

  const meta = {
    version: VERSION,
    lastRun: now,
    lastSuccess: failed.length === T.COMP_IDS.length ? (snapshot.lastSuccess || null) : now,
    durationMs: Date.now() - started,
    ymd: todayYmd,
    season: seasonID,
    mode: plan.mode,
    intervalSec: plan.intervalSec,
    liveCount: plan.liveCount,
    matchesToday: rows.length,
    detailFetched: due.length,
    eventsCreated: createdCount,
    anchorWrites: anchorArrivals + anchorCorrections,
    indexWrites: indexWrites,
    tablesWritten: tableWrites,
    scorersTouched: scorerTouches,
    errorCount: failed.length,
    failedCompetitions: failed,
    failureReasons: failureReasons,
    /* Diagnostic only — the tick paces on intervalSec, not on these. Kept
       because "what did it think today's card was" is the first question
       anyone asks of a run that behaved oddly. */
    kickoffs: rows.map((r) => Date.parse(r.ko)).filter((n) => !isNaN(n)),
    source: 'nls',
  };
  await db().ref(ROOT + '/meta/ingest').set(meta);

  logger.info('nls ingest', {
    mode: plan.mode, live: plan.liveCount, matches: rows.length,
    detail: due.length, events: createdCount,
    anchors: meta.anchorWrites, failed: failed,
    ms: meta.durationMs,
  });

  return { ran: true, meta };
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

/* The minute tick. Derives its own state and returns immediately when the
   state says hourly — a cheap no-op, one small read, no upstream traffic. */
exports.nlsIngestTick = onSchedule(
  Object.assign({ schedule: 'every 1 minutes', timeZone: 'Etc/UTC' }, SCHEDULE_OPTS),
  async () => {
    const result = await runIngest(Date.now(), {});
    if (!result.ran) logger.debug('tick no-op', { reason: result.reason });
  });

/* The hourly baseline. Always runs the full pass: official tables, the season
   fixture node and the scorer coverage flag, none of which the minute tick
   touches. */
exports.nlsIngestHourly = onSchedule(
  Object.assign({ schedule: 'every 1 hours', timeZone: 'Etc/UTC' }, SCHEDULE_OPTS),
  async () => {
    await runIngest(Date.now(), { force: true, hourly: true });
  });

/* Exported for tests and for a future manual backfill entry point. */
exports._internals = { runIngest, ingestDetail, writeTables, writeScorers, VERSION };
