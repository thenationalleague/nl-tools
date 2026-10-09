/* =========================================================================
   NL Tools — usage rollup
   File: functions/usage-rollup.js

   Answers one question, nightly: WHICH TOOLS ARE ACTUALLY BEING USED.

   It was asked directly — "I liked the idea of seeing eg how often programme
   packs was viewed" — and it is the question system/tool-status-and-access.md
   exists to answer and cannot. Three tools were retired on 15/08/2026 on
   judgement rather than evidence, and the public-site tickers sat dead for
   five months because nothing was counting.

   THE DATA ALREADY EXISTS. auth-guard has written a `page_opened` audit entry
   on every gated tool open since v5.1, throttled to one per tool per tab per
   five minutes. Nothing new is collected here. This reads what is already in
   admin/audit and turns it into counters small enough for a browser to read.

   WHY A ROLLUP AND NOT A QUERY
   admin/audit is one flat node holding EVERY write from every tool, not only
   page opens — the audit hook records set/update/push/remove as well. A page
   that answered "opens per tool, last 90 days" by querying it directly would
   download ninety days of every write in the estate to count a fraction of
   them. The counters below are a few hundred bytes a day.

   WHAT IT WRITES, AND WHAT IT DELIBERATELY DOES NOT
     app-data/ops-data/daily/<YYYY-MM-DD>/<toolKey> = { opens, users }

   COUNTS ONLY. An audit entry carries uid, name and email; none of the three
   reaches this output, and `users` is a number arrived at by sizing a Set,
   never a list. "Nine people opened it" is the fact that decides whether a
   tool lives. Which nine is a different question with a different
   justification, and the answer to it stays in admin/audit behind the rules
   that already govern it.

   SELF-HEALING, SO THERE IS NO SEPARATE BACKFILL
   Each run does yesterday, then fills any missing day back to the floor,
   within a wall-clock budget. One mechanism instead of two: the first run
   backfills history, later runs are no-ops, and a week of failed runs repairs
   itself without anybody noticing. A backfill script that runs once is a
   script nobody can find the second time it is needed.

   DAYS ARE UTC, deliberately. London is UTC+1 for half the year, so a local
   day boundary means a date-range query whose edges move twice a year — a
   reliable source of off-by-one-hour bugs in exchange for correctly filing
   late-evening summer traffic. The dashboard says UTC so nobody wonders.
   ========================================================================= */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");

const OUT = "app-data/ops-data";

/* How far back to fill. page_opened only exists from auth-guard v5.1, so
   earlier days are legitimately empty rather than missing — they are written
   as empty and never revisited. */
const FLOOR_DAYS = 400;

/* A run must finish well inside its timeout, and an unfilled day is simply
   filled tomorrow. Budget is wall-clock from the start of the run. */
const BUDGET_MS = 420 * 1000;

const DAY_MS = 86400000;

/** YYYY-MM-DD for a UTC day offset from today (0 = today, 1 = yesterday). */
function utcDay(offset, now) {
  return new Date((now === undefined ? Date.now() : now) - offset * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Epoch-ms bounds [start, end) of a UTC YYYY-MM-DD. */
function dayBounds(date) {
  const start = Date.parse(date + "T00:00:00.000Z");
  return { start, end: start + DAY_MS };
}

/* ── The pure half ────────────────────────────────────────────────────────
   Everything above the database line, so it can be tested without one. */

/**
 * Pull a toolKey out of an audit entry.
 *
 * auth-guard writes `detail` as the parts it has, space-joined:
 *   "Vacancies [ops-vacancies] /vacancies/"
 * The bracketed key is the one to trust — the title is a display string that
 * changes, and the path differs from the key often enough to matter
 * (/data/ is ops-data, /graphics/totw/ is media-totw).
 *
 * The bracket is absent when the page declared no toolKey, or when the title
 * and the key were identical and auth-guard skipped the duplicate. Falling
 * back to the path keeps those pages countable instead of silently dropping
 * them, which is the failure that would make the whole dashboard a lie.
 */
function toolKeyFrom(entry) {
  const detail = String((entry && entry.detail) || "");
  const bracket = detail.match(/\[([a-z0-9][a-z0-9-]*)\]/i);
  if (bracket) return bracket[1].toLowerCase();

  const path = detail.match(/(^|\s)(\/[^\s]*)/);
  if (path) {
    const slug = path[2].replace(/^\/+|\/+$/g, "").toLowerCase();
    if (slug) return "path:" + slug;
  }
  return null;
}

/**
 * Count opens and distinct people per tool for one day's audit entries.
 *
 * Returns { <toolKey>: { opens, users } } plus an `_all` row. Nothing in the
 * return value identifies anybody: `users` is a Set's size, and the Set is
 * discarded here rather than returned.
 */
function summarise(entries) {
  const byTool = new Map();
  const allUsers = new Set();
  let allOpens = 0;

  for (const entry of entries || []) {
    if (!entry || entry.action !== "page_opened") continue;
    const key = toolKeyFrom(entry);
    if (!key) continue;

    if (!byTool.has(key)) byTool.set(key, { opens: 0, users: new Set() });
    const row = byTool.get(key);
    row.opens += 1;
    allOpens += 1;

    const uid = entry.uid;
    if (typeof uid === "string" && uid) {
      row.users.add(uid);
      allUsers.add(uid);
    }
  }

  const out = {};
  for (const [key, row] of byTool) {
    out[key] = { opens: row.opens, users: row.users.size };
  }
  if (allOpens) out._all = { opens: allOpens, users: allUsers.size };
  return out;
}

/* ── The database half ───────────────────────────────────────────────────── */

/**
 * Read one UTC day out of admin/audit and write its counters.
 *
 * The range query is on KEYS, which auth-guard writes as `<epochMs>_<rand>`.
 * Millisecond timestamps are thirteen digits until the year 2286, so equal
 * length makes lexicographic order numeric order and RTDB can serve the range
 * without an index rule. `endAt(end + "")` is exclusive of the next day
 * because "<end>" sorts before "<end>_...".
 */
async function rollupDay(db, date) {
  const { start, end } = dayBounds(date);
  const snap = await db
    .ref("admin/audit")
    .orderByKey()
    .startAt(String(start))
    .endAt(String(end))
    .once("value");

  const entries = [];
  snap.forEach((child) => {
    entries.push(child.val());
  });

  const counts = summarise(entries);
  await db.ref(`${OUT}/daily/${date}`).set(counts);
  return { date, tools: Object.keys(counts).length, scanned: entries.length };
}

/** Days with no counters yet, newest first, back to the floor. */
function missingDays(written, now) {
  const out = [];
  for (let i = 1; i <= FLOOR_DAYS; i++) {
    const d = utcDay(i, now);
    if (!written[d]) out.push(d);
  }
  return out;
}

async function run(db, now) {
  const startedAt = Date.now();

  /* Shallow read: keys only, not the counters themselves. A year of days is
     365 short strings rather than a year of tool rows. */
  const written =
    (await db.ref(`${OUT}/daily`).once("value", null, { shallow: true })
      .then((s) => s.val())
      .catch(() => null)) || {};

  /* Yesterday is always redone — a run at 03:20 on the 9th wrote the 8th while
     the 8th was still being added to in the Americas, and a day is only
     complete once it is over everywhere. */
  const todo = [utcDay(1, now)];
  for (const d of missingDays(written, now)) {
    if (!todo.includes(d)) todo.push(d);
  }

  const done = [];
  for (const date of todo) {
    if (Date.now() - startedAt > BUDGET_MS) {
      logger.info("usageRollup: budget spent, remainder tomorrow", {
        done: done.length,
        remaining: todo.length - done.length,
      });
      break;
    }
    done.push(await rollupDay(db, date));
  }

  await db.ref(`${OUT}/meta`).update({
    lastRun: Date.now(),
    lastRunDays: done.length,
    floorDays: FLOOR_DAYS,
  });

  logger.info("usageRollup: done", {
    days: done.length,
    scanned: done.reduce((n, d) => n + d.scanned, 0),
  });
  return done;
}

exports.usageRollup = onSchedule(
  {
    schedule: "every day 03:20",
    timeZone: "Europe/London",
    region: "europe-west2",
    memory: "512MiB",
    timeoutSeconds: 540,
    serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
  },
  async () => {
    await run(admin.database());
  }
);

/* Exported for tests. The pure half is the half worth testing: the database
   half is two RTDB calls and a loop. */
exports._test = { toolKeyFrom, summarise, missingDays, utcDay, dayBounds, run };
