/* =============================================================================
   FixtureSync.gs — NL Attendance: fixture schedule sync from NLS
   -----------------------------------------------------------------------------
   Pulls fixture schedule data from NLS API and writes to
   /app-data/ops-attendance/fixtures/{matchID} in Firebase RTDB.

   WHAT THIS DOES (and deliberately does NOT do):
     - Writes:    match schedule (kickoff, teams, venue, matchPeriod, score)
     - Does NOT:  touch /submissions/, store NLS attendance figures, or
                  delete fixtures (additive only).

   NLS attendance data is intentionally ignored — attendance is 100% manual
   club submission. NLS provides fixture scaffolding only.

   TRIGGERS:
     - Manual:       run fixtureSyncRun() from GAS editor
     - Time-driven:  4x daily (07:00, 13:00, 18:00, 22:00 BST)
     - HTTP (later): admin button on /tools/attendance/

   CHANGELOG
   ---------
   v1.2  (2026-04-24)  FIX: diff bug that marked every record with a null
                       field as "updated" on every run. Firebase stores
                       null-valued keys as absent, so read-back shows
                       `undefined` where we wrote `null` — diff treated
                       these as different. Now treats null/undefined as
                       equivalent AND strips null fields before writing
                       so stored shape matches fetched shape.
                       PERF: bulk read of /fixtures/ (one HTTP request)
                       replaces 1,727 individual reads. Expected saving
                       ~20MB of Firebase bandwidth per run.
   v1.1  (2026-04-24)  Rate-limit handling: 2s between pages, 5s between
                       comps. Detect "quota exceeded", retry once after
                       30s. Partial-success audit action.
   v1.0  (2026-04-24)  Initial version. Full-season sync across NL Prem,
                       North, South, NL Cup. Diff-before-write. Audit
                       entries to /admin/audit/.
   ============================================================================= */


/* ---- Constants -------------------------------------------------------------- */

var FS_COMP_IDS = [
  { id: 89,   key: 'nl',       label: 'National League' },
  { id: 373,  key: 'north',    label: 'National League North' },
  { id: 372,  key: 'south',    label: 'National League South' },
  { id: 1275, key: 'nl-cup',   label: 'NL Cup' }
];

var FS_NLS_BASE       = 'https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2';
var FS_PAGE_SIZE      = 100;
var FS_MAX_PAGES      = 20;
var FS_SLEEP_PAGE_MS  = 2000;
var FS_SLEEP_COMP_MS  = 5000;
var FS_RETRY_WAIT_MS  = 30000;
var FS_SLEEP_WRITE_MS = 50;     /* Small pause between individual writes to avoid
                                   Firebase burst-limit 'Bandwidth quota exceeded'. */


/* ---- Entry points ----------------------------------------------------------- */

function fixtureSyncRun() {
  return fs_runInternal_('trigger');
}

function fixtureSyncManual(adminUid, adminName) {
  var source = 'admin';
  if (adminName) source += ':' + adminName;
  else if (adminUid) source += ':' + adminUid;
  return fs_runInternal_(source);
}


/* ---- Core run logic --------------------------------------------------------- */

function fs_runInternal_(source) {
  var startMs = Date.now();
  var props = PropertiesService.getScriptProperties();
  var RTDB_URL = props.getProperty('RTDB_URL');
  var RTDB_SECRET = props.getProperty('RTDB_SECRET');
  var SEASON_ID = props.getProperty('ATT_SEASON_ID');

  if (!RTDB_URL || !RTDB_SECRET || !SEASON_ID) {
    var msg = 'FixtureSync: missing Script Properties (RTDB_URL / RTDB_SECRET / ATT_SEASON_ID)';
    Logger.log(msg);
    return { ok: false, error: msg };
  }

  /* STEP 1 — Bulk read all existing fixtures in ONE HTTP call.
     Replaces the previous 1,727 individual read calls. Massive bandwidth saving. */
  console.log('Bulk-reading existing fixtures from RTDB...');
  var existingAll = {};
  var bulkReadUrl = RTDB_URL + '/app-data/ops-attendance/fixtures.json';
  var bulkReadResult = rtdbRead(bulkReadUrl, RTDB_SECRET);
  if (!bulkReadResult.ok) {
    var rmsg = 'FixtureSync: bulk read failed — ' + bulkReadResult.error;
    Logger.log(rmsg);
    fs_writeAudit_('sync_fixture_fail', { source: source, fatal: rmsg }, RTDB_URL, RTDB_SECRET);
    return { ok: false, error: rmsg };
  }
  existingAll = bulkReadResult.data || {};
  console.log('  loaded ' + Object.keys(existingAll).length + ' existing fixtures');

  var totals = {
    source:         source,
    seasonID:       SEASON_ID,
    competitions:   FS_COMP_IDS.length,
    existingAtStart: Object.keys(existingAll).length,
    fetched:        0,
    added:          0,
    updated:        0,
    unchanged:      0,
    failed:         0,
    failures:       [],
    perComp:        {},
    durationMs:     0,
    fatal:          null
  };

  for (var i = 0; i < FS_COMP_IDS.length; i++) {
    var comp = FS_COMP_IDS[i];
    console.log('Starting comp ' + comp.key + ' (id=' + comp.id + ')...');
    var compCounts = {
      fetched: 0, added: 0, updated: 0, unchanged: 0, failed: 0,
      fatalError: null
    };

    var fixtures = [];
    try {
      fixtures = fs_fetchCompetitionFixtures_(comp.id, SEASON_ID);
      compCounts.fetched = fixtures.length;
      totals.fetched += fixtures.length;
      console.log('  fetched ' + fixtures.length + ' fixtures from NLS');
    } catch (err) {
      compCounts.fatalError = err.message;
      totals.failures.push({ comp: comp.key, phase: 'fetch', reason: err.message });
      totals.perComp[comp.key] = compCounts;
      console.log('  FETCH FAILED: ' + err.message);
      if (i < FS_COMP_IDS.length - 1) Utilities.sleep(FS_SLEEP_COMP_MS);
      continue;
    }

    for (var j = 0; j < fixtures.length; j++) {
      var raw = fixtures[j];
      var matchID = raw && raw.id;
      if (!matchID) {
        compCounts.failed++;
        totals.failed++;
        totals.failures.push({ comp: comp.key, reason: 'missing match.id' });
        continue;
      }

      try {
        var newRecord = fs_mapNlsFixtureToRecord_(raw, comp);
        var existing = existingAll[matchID] || null;
        var result = fs_diffAndWrite_(matchID, newRecord, existing, RTDB_URL, RTDB_SECRET);

        if (result.action === 'added')          { compCounts.added++;     totals.added++; }
        else if (result.action === 'updated')   { compCounts.updated++;   totals.updated++; }
        else if (result.action === 'unchanged') { compCounts.unchanged++; totals.unchanged++; }
        else {
          compCounts.failed++;
          totals.failed++;
          totals.failures.push({ comp: comp.key, matchID: matchID, reason: result.error || 'unknown' });
        }
      } catch (err) {
        compCounts.failed++;
        totals.failed++;
        totals.failures.push({ comp: comp.key, matchID: matchID, reason: err.message });
      }
    }

    totals.perComp[comp.key] = compCounts;
    console.log('  ' + comp.key + ' done: ' + JSON.stringify(compCounts));

    if (i < FS_COMP_IDS.length - 1) {
      console.log('  pausing ' + FS_SLEEP_COMP_MS + 'ms before next comp...');
      Utilities.sleep(FS_SLEEP_COMP_MS);
    }
  }

  totals.durationMs = Date.now() - startMs;

  var allFetchFailed = FS_COMP_IDS.every(function(c) {
    var pc = totals.perComp[c.key];
    return pc && pc.fatalError;
  });
  var anyFailure = totals.failed > 0 || totals.failures.length > 0;
  var auditAction = allFetchFailed ? 'sync_fixture_fail'
                    : anyFailure   ? 'sync_fixture_partial'
                    :                'sync_fixture_run';

  fs_writeAudit_(auditAction, totals, RTDB_URL, RTDB_SECRET);
  Logger.log('FixtureSync ' + auditAction + ': ' + JSON.stringify(totals));
  return { ok: !allFetchFailed, action: auditAction, totals: totals };
}


/* ---- NLS API -------------------------------------------------------------- */

function fs_fetchCompetitionFixtures_(compID, seasonID) {
  var all = [];
  var url = FS_NLS_BASE + '/matches/?competitionID=' + compID +
            '&seasonID=' + seasonID +
            '&sort=-kickOffDateUTC' +
            '&page.number=1' +
            '&page.size=' + FS_PAGE_SIZE;
  var pagesFetched = 0;

  while (url && pagesFetched < FS_MAX_PAGES) {
    var json = fs_fetchWithRetry_(url, compID);
    if (json && json.data && json.data.length) {
      for (var k = 0; k < json.data.length; k++) all.push(json.data[k]);
    }
    url = (json && json.links && json.links.next) ? json.links.next : null;
    pagesFetched++;
    if (url) Utilities.sleep(FS_SLEEP_PAGE_MS);
  }

  return all;
}


function fs_fetchWithRetry_(url, compID) {
  for (var attempt = 1; attempt <= 2; attempt++) {
    var response = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
    var code = response.getResponseCode();
    var text = response.getContentText();

    if (code === 200) {
      if (text && text.toLowerCase().indexOf('quota exceeded') !== -1) {
        if (attempt === 1) {
          Logger.log('NLS rate-limited (comp=' + compID + ', body), waiting ' + FS_RETRY_WAIT_MS + 'ms...');
          Utilities.sleep(FS_RETRY_WAIT_MS);
          continue;
        }
        throw new Error('NLS rate limit (comp=' + compID + '): quota exceeded after retry');
      }
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('NLS fetch comp=' + compID + ' returned invalid JSON: ' + e.message);
      }
    }

    if (code === 429 || code === 503) {
      if (attempt === 1) {
        Logger.log('NLS HTTP ' + code + ' (comp=' + compID + '), waiting ' + FS_RETRY_WAIT_MS + 'ms...');
        Utilities.sleep(FS_RETRY_WAIT_MS);
        continue;
      }
    }

    throw new Error('NLS fetch failed comp=' + compID + ' HTTP ' + code + ' body=' + text.substring(0, 200));
  }
  throw new Error('NLS fetch: unreachable branch');
}


/**
 * Converts NLS match object into our stored record shape.
 *
 * Null-valued fields are INCLUDED in the output here — they're stripped
 * at write time by fs_stripNulls_(). This lets the diff compare "what
 * NLS gave us" against "what's stored" consistently.
 */
function fs_mapNlsFixtureToRecord_(raw, comp) {
  var attrs = (raw && raw.attributes) || {};
  var home = attrs.homeTeam || {};
  var away = attrs.awayTeam || {};

  return {
    matchID:            raw.id,
    competitionID:      attrs.competitionID || comp.id,
    competitionKey:     comp.key,
    competitionLbl:     comp.label,
    kickoffUTC:         attrs.kickOffDateUTC || null,
    matchPeriod:        attrs.matchPeriod || null,
    homeTeamID:         home.teamID || null,
    homeTeamName:       home.name || home.shortName || home.initials || null,
    homeScore:          (home.score === 0 || home.score) ? home.score : null,
    awayTeamID:         away.teamID || null,
    awayTeamName:       away.name || away.shortName || away.initials || null,
    awayScore:          (away.score === 0 || away.score) ? away.score : null,
    venue:              attrs.venue || null,
    postponementReason: attrs.postponementReason || null,
    lastSyncedAt:       Date.now(),
    source:             'nls-sync'
  };
}


/* ---- RTDB diff + write ------------------------------------------------------ */

/**
 * Strips null/undefined fields from an object. Firebase drops null-valued
 * keys at write time anyway — by stripping beforehand we keep the object
 * shape consistent with what the read-back will show.
 */
function fs_stripNulls_(obj) {
  var out = {};
  for (var k in obj) {
    if (obj[k] !== null && obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

/**
 * Compares two fixture records for meaningful equality. Ignores lastSyncedAt.
 * Treats null and undefined as equivalent (Firebase RTDB doesn't store null
 * keys, so a field we "wrote as null" reads back as undefined).
 *
 * Returns array of changed field names (empty = equal).
 */
function fs_diffFixtures_(newRec, existingRec) {
  var changes = [];
  var combined = {};
  var k;
  for (k in newRec) combined[k] = true;
  for (k in existingRec) combined[k] = true;

  for (k in combined) {
    if (k === 'lastSyncedAt') continue;

    var newVal = newRec[k];
    var oldVal = existingRec ? existingRec[k] : undefined;

    /* Normalise: null and undefined are the same thing for our purposes. */
    if ((newVal === null || newVal === undefined) &&
        (oldVal === null || oldVal === undefined)) continue;

    if (newVal !== oldVal) changes.push(k);
  }
  return changes;
}


/**
 * Diff against the already-loaded existing record (no read call here — the
 * bulk read in fs_runInternal_ provides it). Writes only if changed.
 *
 * Returns: { action: 'added' | 'updated' | 'unchanged' | 'failed',
 *            changes: [field names], error: '...' }
 */
function fs_diffAndWrite_(matchID, newRecord, existing, rtdbUrl, rtdbSecret) {
  var path = '/app-data/ops-attendance/fixtures/' + matchID + '.json';
  var fullUrl = rtdbUrl + path;
  var toWrite = fs_stripNulls_(newRecord);

  if (!existing) {
    var addResult = rtdbWrite(fullUrl, toWrite, rtdbSecret);
    if (!addResult.ok) {
      return { action: 'failed', error: 'add write failed: ' + addResult.error };
    }
    if (FS_SLEEP_WRITE_MS > 0) Utilities.sleep(FS_SLEEP_WRITE_MS);
    return { action: 'added', changes: Object.keys(toWrite) };
  }

  var changes = fs_diffFixtures_(toWrite, existing);

  if (changes.length === 0) {
    return { action: 'unchanged', changes: [] };
  }

  var updResult = rtdbWrite(fullUrl, toWrite, rtdbSecret);
  if (!updResult.ok) {
    return { action: 'failed', error: 'update write failed: ' + updResult.error };
  }
  if (FS_SLEEP_WRITE_MS > 0) Utilities.sleep(FS_SLEEP_WRITE_MS);
  return { action: 'updated', changes: changes };
}


/* ---- Audit ------------------------------------------------------------------ */

function fs_writeAudit_(action, detail, rtdbUrl, rtdbSecret) {
  var ts = Date.now();
  var suffix = Math.random().toString(36).substr(2, 5);
  var key = ts + '_' + suffix;
  var path = '/admin/audit/' + key + '.json';
  var fullUrl = rtdbUrl + path;

  var entry = {
    ts:     ts,
    action: action,
    actor:  'fixture-sync',
    detail: detail
  };

  rtdbWrite(fullUrl, entry, rtdbSecret);
}


/* ---- Changelog --------------------------------------------------------------- */

function getFixtureSyncChangelog() {
  return [
    {
      version: 'v1.2',
      date: '2026-04-24',
      changes: [
        'FIX: diff bug — null/undefined treated as equal (Firebase drops null keys).',
        'FIX: strip null fields before writing so stored shape matches fetched shape.',
        'PERF: bulk-read all fixtures in one HTTP call instead of 1,727 per run.',
        'PERF: 50ms pause between writes to avoid Firebase burst rate limit.'
      ]
    },
    {
      version: 'v1.1',
      date: '2026-04-24',
      changes: [
        'Rate-limit handling: 2s between pages, 5s between competitions.',
        'Detect "quota exceeded" responses and retry once after 30s backoff.',
        'Partial-success reporting — per-competition failures no longer abort whole run.',
        'Audit action now reflects outcome: sync_fixture_run / partial / fail.'
      ]
    },
    {
      version: 'v1.0',
      date: '2026-04-24',
      changes: [
        'Initial version.',
        'Full-season sync across NL Prem (89), North (373), South (372), NL Cup (1275).',
        'Diff-before-write — only updates records that actually changed.',
        'Writes audit entries to /admin/audit/ on success and failure.'
      ]
    }
  ];
}