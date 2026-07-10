/* =============================================================================
   TopScorerSync.gs — NL: golden-boot / top-scorer sync from NLS
   -----------------------------------------------------------------------------
   Builds a per-season, per-competition top-scorer table from NLS match detail
   and writes it to the PROPER nl-tools RTDB under a shared, tool-agnostic realm:

       league-data/top-scorers/{season}/{compKey}/{playerID}

   This is deliberately NOT under app-data/<toolKey>/ — it is universal league
   reference data (like fixtures) that several surfaces may read (the graphics
   top-scorers builder, a future player-DB tool, etc.), owned by no single tool.

   WHAT THIS DOES (and deliberately does NOT do):
     - Reads:   fixtures already synced by FixtureSync.gs (match IDs + comp).
     - Fetches: each FINISHED match's full detail from NLS (goals w/ playerID).
     - Writes:  league-data/top-scorers/{season}/{compKey}/{playerID} tallies
                + a processed-match ledger so goals are never double-counted.
     - Does NOT: touch attendance, submissions, fixtures, or the nl-vidiprinter
                 project. Never counts own goals or shootout penalties toward a
                 player's tally. Never deletes fixtures.

   SCORING RULES (golden boot):
     - Regular goals + in-play penalties   -> COUNT
     - Own goals (goalType ~ /own/i)       -> EXCLUDED
     - Shootout penalties (events.shootout) -> EXCLUDED (separate feed array)
     - Competitions kept separate: nl / north / south / nl-cup each own a node.
     - Transfers handled for free: playerID is stable; a player who scored for
       two clubs shows a combined total with a per-team breakdown.

   STORED SHAPE (mirrors the retired nl-scorer-import tool, season-scoped):
     {
       playerID, scorer, compKey, competition, season,
       goals: <int>,
       teams: { "<Team>": { teamName, goals } },
       updatedAt
     }

   SCRIPT PROPERTIES (reused from FixtureSync — nl-tools, NOT vidiprinter):
     RTDB_URL       e.g. https://nl-tools-default-rtdb.europe-west1.firebasedatabase.app
     RTDB_SECRET    legacy DB secret (bypasses rules; the .write:false rule on
                    league-data blocks clients but not this secret)
     ATT_SEASON_ID  current season key, e.g. 2026

   ENTRY POINTS:
     topScorerSyncRun()          - ongoing: current season, live fixtures.
                                   Put on a time trigger after FixtureSync.
     topScorerBackfill('2025')   - one-shot backfill of an archived season.
                                   Re-run until it reports remaining:0 (windowed
                                   to stay under the GAS 6-min execution cap).
     topScorerRebuild('2025')    - wipe a season's table + ledger, then re-run
                                   backfill/sync to recompute cleanly.

   CHANGELOG
     v1.0  Initial. Windowed detail fetch, playerID tally, own-goal/shootout
           exclusion, processed-match ledger, per-comp season-scoped nodes.
   ============================================================================= */


/* ---- Constants -------------------------------------------------------------- */

var TS_NLS_BASE       = 'https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2';
var TS_NODE           = 'league-data/top-scorers';          /* data */
var TS_LEDGER         = 'league-data/top-scorers-sync';     /* processed-match ledger */
var TS_MATCH_BUDGET   = 120;    /* matches fetched per run — keep under GAS 6-min cap */
var TS_SLEEP_MS       = 1200;   /* pause between detail fetches (be gentle on NLS) */
var TS_RETRY_MS       = 30000;  /* backoff on 429/503 */

var TS_COMP_BY_ID = { 89: 'nl', 373: 'north', 372: 'south', 1275: 'nl-cup' };
var TS_COMP_LABEL = {
  'nl':     'National League',
  'north':  'National League North',
  'south':  'National League South',
  'nl-cup': 'NL Cup'
};


/* ---- Entry points ----------------------------------------------------------- */

function topScorerSyncRun()        { return ts_run_(null,   'trigger');  }  /* current season */
function topScorerBackfill(season) { return ts_run_(season, 'backfill'); }
function topScorerBackfill2025()   { return ts_run_('2025', 'backfill'); }  /* convenience */

function topScorerRebuild(season) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('RTDB_URL'), secret = props.getProperty('RTDB_SECRET');
  season = String(season || props.getProperty('ATT_SEASON_ID'));
  ts_delete_(url, '/' + TS_NODE + '/' + season, secret);
  ts_delete_(url, '/' + TS_LEDGER + '/' + season, secret);
  Logger.log('TopScorerSync: wiped season ' + season + ' — re-run backfill/sync to rebuild.');
  return { season: season, wiped: true };
}


/* ---- Core run --------------------------------------------------------------- */

function ts_run_(season, source) {
  var props = PropertiesService.getScriptProperties();
  var RTDB_URL    = props.getProperty('RTDB_URL');
  var RTDB_SECRET = props.getProperty('RTDB_SECRET');
  var CURRENT     = props.getProperty('ATT_SEASON_ID');

  if (!RTDB_URL || !RTDB_SECRET) {
    var msg = 'TopScorerSync: missing Script Properties (RTDB_URL / RTDB_SECRET)';
    Logger.log(msg);
    return { ok: false, error: msg };
  }
  season = String(season || CURRENT);
  var isCurrent = (season === String(CURRENT));

  /* Fixtures live under the live path for the current season, else the archive.
     Mirrors the attendance tool's fixturesPath(). */
  var fixturesPath = isCurrent
    ? '/app-data/ops-attendance/fixtures'
    : '/app-data/ops-attendance/archive/' + season + '/fixtures';

  var fixtures  = ts_read_(RTDB_URL, fixturesPath, RTDB_SECRET) || {};
  var ledgerRef = '/' + TS_LEDGER + '/' + season + '/processed';
  var processed = ts_read_(RTDB_URL, ledgerRef, RTDB_SECRET) || {};
  var tallies   = ts_read_(RTDB_URL, '/' + TS_NODE + '/' + season, RTDB_SECRET) || {};

  /* Build the to-do list: FINISHED matches not yet processed. */
  var todoAll = [];
  for (var id in fixtures) {
    var f = fixtures[id];
    if (!f) continue;
    if (String(f.matchPeriod) !== 'FullTime') continue;   /* finished games only */
    if (processed[id]) continue;
    todoAll.push(id);
  }
  var remainingBefore = todoAll.length;
  var todo = todoAll.slice(0, TS_MATCH_BUDGET);

  var changed = {};          /* compKey -> { playerID: true } written this run */
  var newlyProcessed = {};
  var goalsAdded = 0, matchesDone = 0, fetchFailed = 0;

  for (var t = 0; t < todo.length; t++) {
    var mid = todo[t];
    var fx  = fixtures[mid];
    var compKey = fx.competitionKey || TS_COMP_BY_ID[fx.competitionID] || 'unknown';

    var attrs;
    try {
      attrs = ts_fetchMatchDetail_(mid);
    } catch (e) {
      fetchFailed++;               /* leave unprocessed — retried next run */
      continue;
    }
    if (!attrs) { fetchFailed++; continue; }

    var goals = ts_extractGoals_(attrs);
    for (var g = 0; g < goals.length; g++) {
      var go = goals[g];
      if (!tallies[compKey]) tallies[compKey] = {};
      var rec = tallies[compKey][go.playerID];
      if (!rec) {
        rec = {
          playerID:    go.playerID,
          scorer:      go.scorer,
          compKey:     compKey,
          competition: TS_COMP_LABEL[compKey] || compKey,
          season:      season,
          goals:       0,
          teams:       {}
        };
        tallies[compKey][go.playerID] = rec;
      }
      rec.goals   += 1;
      rec.scorer   = go.scorer || rec.scorer;
      var tkey = ts_sanitizeKey_(go.teamName || 'Unknown');
      if (!rec.teams[tkey]) rec.teams[tkey] = { teamName: go.teamName || 'Unknown', goals: 0 };
      rec.teams[tkey].goals += 1;
      rec.updatedAt = Date.now();

      (changed[compKey] = changed[compKey] || {})[go.playerID] = true;
      goalsAdded++;
    }

    newlyProcessed[mid] = true;
    matchesDone++;
    Utilities.sleep(TS_SLEEP_MS);
  }

  /* Write back only the player records that changed this run. */
  for (var ck in changed) {
    for (var pid in changed[ck]) {
      ts_write_(RTDB_URL, '/' + TS_NODE + '/' + season + '/' + ck + '/' + pid,
                tallies[ck][pid], RTDB_SECRET);
    }
  }
  /* Patch the ledger with just the matches processed this run. */
  if (Object.keys(newlyProcessed).length) {
    ts_patch_(RTDB_URL, ledgerRef, newlyProcessed, RTDB_SECRET);
  }

  var remaining = remainingBefore - matchesDone;
  var summary = {
    season:           season,
    source:           source,
    isCurrent:        isCurrent,
    matchesProcessed: matchesDone,
    goalsAdded:       goalsAdded,
    fetchFailed:      fetchFailed,
    remaining:        remaining
  };
  ts_writeAudit_(RTDB_URL, RTDB_SECRET,
                 remaining > 0 ? 'topscorer_sync_partial' : 'topscorer_sync_run', summary);
  Logger.log('TopScorerSync: ' + JSON.stringify(summary));
  return summary;
}


/* ---- NLS match detail ------------------------------------------------------- */

function ts_fetchMatchDetail_(matchID) {
  var url = TS_NLS_BASE + '/matches/' + matchID;
  for (var attempt = 1; attempt <= 2; attempt++) {
    var res  = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
    var code = res.getResponseCode();
    if (code === 200) {
      var j = JSON.parse(res.getContentText());
      return (j && j.data && j.data.attributes) ? j.data.attributes : null;
    }
    if ((code === 429 || code === 503) && attempt === 1) {
      Utilities.sleep(TS_RETRY_MS);
      continue;
    }
    throw new Error('NLS detail HTTP ' + code + ' for ' + matchID);
  }
  throw new Error('NLS detail: unreachable for ' + matchID);
}

/* Pull scoring goals from a match. Own goals and shootout pens are excluded:
   goals live in matchTeams[].events.goals; shootouts are a separate array. */
function ts_extractGoals_(attrs) {
  var out = [];
  var teams = attrs.matchTeams || [];
  for (var i = 0; i < teams.length; i++) {
    var mt = teams[i] || {};
    var teamName = (mt.team && mt.team.teamName) || null;
    var evs = (mt.events && mt.events.goals) || [];
    for (var g = 0; g < evs.length; g++) {
      var ge = evs[g] && evs[g].goalEvents;
      if (!ge || !ge.playerID) continue;
      if (/own/i.test(ge.goalType || '')) continue;        /* exclude own goals */
      out.push({
        playerID: ge.playerID,
        scorer:   ts_playerName_(ge.player && ge.player.playerName),
        teamName: teamName
      });
    }
  }
  return out;
}

function ts_playerName_(pn) {
  if (!pn) return null;
  if (pn.knownName) return pn.knownName;
  return [pn.firstName, pn.lastName].filter(function(x) { return !!x; }).join(' ') || null;
}


/* ---- RTDB REST helpers (secret auth — bypasses rules) ----------------------- */

function ts_read_(base, path, secret) {
  var res  = UrlFetchApp.fetch(base + path + '.json?auth=' + secret, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('RTDB read ' + res.getResponseCode() + ' ' + path);
  var t = res.getContentText();
  return (t && t !== 'null') ? JSON.parse(t) : null;
}

function ts_write_(base, path, obj, secret) {
  var res = UrlFetchApp.fetch(base + path + '.json?auth=' + secret, {
    method: 'put', contentType: 'application/json',
    payload: JSON.stringify(obj), muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('RTDB write ' + res.getResponseCode() + ' ' + path);
  return true;
}

function ts_patch_(base, path, obj, secret) {
  var res = UrlFetchApp.fetch(base + path + '.json?auth=' + secret, {
    method: 'patch', contentType: 'application/json',
    payload: JSON.stringify(obj), muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('RTDB patch ' + res.getResponseCode() + ' ' + path);
  return true;
}

function ts_delete_(base, path, secret) {
  UrlFetchApp.fetch(base + path + '.json?auth=' + secret, { method: 'delete', muteHttpExceptions: true });
}


/* ---- Misc ------------------------------------------------------------------- */

/* RTDB keys may not contain . $ # [ ] / — team names are otherwise safe. */
function ts_sanitizeKey_(s) {
  return String(s).replace(/[.$#\[\]\/]/g, '-');
}

function ts_writeAudit_(base, secret, action, detail) {
  var ts  = Date.now();
  var key = ts + '_' + Math.random().toString(36).substr(2, 5);
  try {
    ts_write_(base, '/admin/audit/' + key, {
      ts: ts, action: action, actor: 'topscorer-sync', detail: detail
    }, secret);
  } catch (e) { /* audit is best-effort */ }
}
