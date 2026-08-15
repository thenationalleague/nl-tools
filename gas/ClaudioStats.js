/**
 * ClaudioStats.gs — historical NL statistics engine
 * Version: 2.7 (echo query in response; enforce pass-literally for club names)
 * Date: 18/04/2026
 *
 * PURPOSE
 * Claudio's historical football-data brain. The dashboards at
 * thenationalleague.org.uk/history/* compute stats live from results.json +
 * clubs-meta.json + season-notes.json. This file ports the core domain logic
 * to GAS so Claudio can call it as tools — returning small, flat JSON
 * answers rather than requiring the model to aggregate raw match data.
 *
 * ARCHITECTURE
 *   Layer 1 — data access:   loadResults_, loadMeta_, loadNotes_
 *                            Shards results.json by season into CacheService
 *                            (source file is ~7.3MB, too large for a single
 *                            cache key). Cache TTL 6 hours.
 *   Layer 2 — primitives:    normEntity_, resultFromMatch_, gfForEntity_,
 *                            isAbandonedCounting_, etc. Pure helpers ported
 *                            from the dashboard code verbatim in behaviour.
 *   Layer 3 — calculators:   computeClubSummary_, computeHeadToHead_,
 *                            computeLeagueTable_, computeClubStreak_,
 *                            computeClubRecords_
 *   Layer 4 — tool wrappers: toolGetClubSummary_, toolGetHeadToHead_,
 *                            toolGetLeagueTable_, toolGetClubStreak_,
 *                            toolGetClubRecords_, toolGetStaff_
 *
 * TOOLS (called from ClaudioChat.gs)
 *   getClubSummary(club, lineage?, scope?)
 *   getHeadToHead(clubA, clubB, lineageA?, lineageB?, scope?)
 *   getLeagueTable(season, division, asOf?)
 *   getClubStreak(club, type, scope?, lineage?)
 *   getClubRecords(club, scope?, lineage?)
 *   getStaff(name?, role?)
 *
 * CHANGELOG
 * v2.0 (17/04/2026)
 *   - Added 5 new tools: getHeadToHead, getLeagueTable, getClubStreak,
 *     getClubRecords, getStaff.
 *   - Added league-table derivation (ports v3.38i standings logic: points
 *     rules per season, PPG ranking for COVID, expulsions, points deductions,
 *     playoff-winner from actual results).
 *   - Added streak engine (wins/unbeaten/losses/winless, all-time/
 *     single-season/season-start modes).
 *   - Added records calculator (biggest wins, heaviest defeats, most goals
 *     scored/conceded, highest-scoring games).
 *   - Added staff lookup from RTDB, replacing inline staff directory.
 *
 * v1.0 (17/04/2026)
 *   - Initial build. Data layer + entity resolution + getClubSummary.
 */

// =============================================================================
// CONSTANTS
// =============================================================================
var CS_RESULTS_URL  = 'https://raw.githubusercontent.com/thenationalleague/site/refs/heads/main/results.json';
var CS_META_URL     = 'https://raw.githubusercontent.com/thenationalleague/site/refs/heads/main/clubs-meta.json';
var CS_NOTES_URL    = 'https://raw.githubusercontent.com/thenationalleague/site/refs/heads/main/season-notes.json';

// Cache TTL — 6 hours. Results change roughly weekly during the season;
// clubs-meta and season-notes change a handful of times per year.
var CS_CACHE_SECS = 60 * 60 * 6;

// Cache key prefixes. Bumping the version invalidates all cached data.
var CS_CACHE_VERSION = 'v1';
var CS_KEY_SEASON_LIST = CS_CACHE_VERSION + '_seasonList';
var CS_KEY_SEASON_PREFIX = CS_CACHE_VERSION + '_season_';   // _season_{seasonKey}
var CS_KEY_META = CS_CACHE_VERSION + '_meta';
var CS_KEY_NOTES = CS_CACHE_VERSION + '_notes';
var CS_KEY_ENTITIES = CS_CACHE_VERSION + '_entities';

// =============================================================================
// DATA ACCESS — LAYER 1
// =============================================================================

/**
 * Fetch a JSON file from a URL with a simple retry. Throws on repeated failure.
 */
function csFetchJson_(url) {
  var attempts = 0;
  var lastErr = null;
  while (attempts < 3) {
    try {
      var res = UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true
      });
      var code = res.getResponseCode();
      if (code >= 200 && code < 300) {
        return JSON.parse(res.getContentText());
      }
      lastErr = new Error('HTTP ' + code + ' from ' + url);
    } catch (e) {
      lastErr = e;
    }
    attempts++;
    Utilities.sleep(200 * attempts);
  }
  throw lastErr || new Error('Fetch failed: ' + url);
}

/**
 * Load results.json into cache as per-season shards.
 * Primary operation is expensive (7.3MB download + 46 shard writes), so this
 * runs at most once per 6-hour window. Returns the list of season keys.
 */
function csPrimeResultsCache_() {
  var raw = csFetchJson_(CS_RESULTS_URL);
  if (!raw || !Array.isArray(raw.seasons)) {
    throw new Error('results.json malformed: expected { seasons: [...] }');
  }

  var cache = CacheService.getScriptCache();
  var seasonKeys = [];

  // Shard by season. Each season is ~160KB — comfortably under the 100KB-per-key
  // limit is actually FALSE: CacheService allows 100KB per *value*. 160KB does
  // exceed it. So we need to be smarter. Let's actually split by season AND by
  // division within each season, since each division is ~50KB.
  //
  // Update: CacheService limit is 100KB per key. Let's split per season,
  // per division. For 46 seasons × ~3 divisions = ~140 keys, each ~50KB.
  raw.seasons.forEach(function(season) {
    var sKey = String(season.season || '');
    if (!sKey) return;
    seasonKeys.push(sKey);

    var divs = season.divisions || {};
    Object.keys(divs).forEach(function(divName) {
      var shardKey = CS_KEY_SEASON_PREFIX + sKey + '_' + divName;
      var payload = JSON.stringify(divs[divName] || {});
      // If the payload is larger than ~95KB we'll just not cache it and let
      // subsequent reads fall through to a full refetch. In practice the big
      // seasons (24-team NL with full match list) are ~55KB each.
      if (payload.length < 95000) {
        cache.put(shardKey, payload, CS_CACHE_SECS);
      }
    });
  });

  cache.put(CS_KEY_SEASON_LIST, JSON.stringify(seasonKeys), CS_CACHE_SECS);

  // Build and cache the entity lookup on the same pass
  csBuildEntityIndexFromRaw_(raw);

  return { raw: raw, seasonKeys: seasonKeys };
}

/**
 * Load all matches from results.json. Returns a flat array of match objects
 * annotated with .season and .leagueFull. This is the primary input for all
 * stats calculations.
 *
 * Strategy: if we have a cached season list AND all season shards are present,
 * reassemble from cache. Otherwise refetch the whole thing (and reprime cache).
 */
function csLoadAllMatches_() {
  var cache = CacheService.getScriptCache();
  var seasonListStr = cache.get(CS_KEY_SEASON_LIST);

  if (!seasonListStr) {
    // Cold cache — prime and return the raw we just fetched
    var primed = csPrimeResultsCache_();
    return csFlattenSeasons_(primed.raw.seasons);
  }

  // Try to reassemble from cache
  var seasonKeys = JSON.parse(seasonListStr);
  var seasonObjs = [];
  var missed = false;

  for (var i = 0; i < seasonKeys.length; i++) {
    var sKey = seasonKeys[i];
    var divObj = {};

    // We don't know division names up front, but all seasons have at least one
    // of these: National, North, South, North/South. Check each, skip missing.
    var divNames = ['National', 'North', 'South', 'North/South'];
    var foundAny = false;
    for (var d = 0; d < divNames.length; d++) {
      var shardKey = CS_KEY_SEASON_PREFIX + sKey + '_' + divNames[d];
      var shardStr = cache.get(shardKey);
      if (shardStr) {
        divObj[divNames[d]] = JSON.parse(shardStr);
        foundAny = true;
      }
    }

    if (!foundAny) {
      // A season we expected is no longer in cache. Refetch all.
      missed = true;
      break;
    }

    seasonObjs.push({ season: sKey, divisions: divObj });
  }

  if (missed) {
    var reprimed = csPrimeResultsCache_();
    return csFlattenSeasons_(reprimed.raw.seasons);
  }

  return csFlattenSeasons_(seasonObjs);
}

/**
 * v2.5: Narrowed match loader. Returns only matches where one of the
 * entities (normalised canonical names) is home or away. For "most played
 * opponents" and similar club-scoped queries, this cuts the data volume
 * returned by ~95% vs csLoadAllMatches_. Uses the same cache layout —
 * just filters as it flattens, so no extra fetching.
 */
function csLoadMatchesForClub_(entitiesArr) {
  var entSet = {};
  entitiesArr.forEach(function(e) { entSet[normEntity_(e)] = true; });

  var cache = CacheService.getScriptCache();
  var seasonListStr = cache.get(CS_KEY_SEASON_LIST);

  var seasonObjs;
  if (!seasonListStr) {
    var primed = csPrimeResultsCache_();
    seasonObjs = primed.raw.seasons;
  } else {
    seasonObjs = [];
    var seasonKeys = JSON.parse(seasonListStr);
    var missed = false;
    for (var i = 0; i < seasonKeys.length; i++) {
      var sKey = seasonKeys[i];
      var divObj = {};
      var divNames = ['National', 'North', 'South', 'North/South'];
      var foundAny = false;
      for (var d = 0; d < divNames.length; d++) {
        var shardKey = CS_KEY_SEASON_PREFIX + sKey + '_' + divNames[d];
        var shardStr = cache.get(shardKey);
        if (shardStr) {
          divObj[divNames[d]] = JSON.parse(shardStr);
          foundAny = true;
        }
      }
      if (!foundAny) { missed = true; break; }
      seasonObjs.push({ season: sKey, divisions: divObj });
    }
    if (missed) {
      var reprimed = csPrimeResultsCache_();
      seasonObjs = reprimed.raw.seasons;
    }
  }

  // Flatten WITH filter — only push matches where a club entity participates
  var out = [];
  seasonObjs.forEach(function(s) {
    var divs = s.divisions || {};
    Object.keys(divs).forEach(function(divName) {
      var div = divs[divName] || {};
      var matches = Array.isArray(div.matches) ? div.matches : [];
      var title = div.title || (divName + ' ' + s.season);
      matches.forEach(function(m) {
        var hE = normEntity_(m.home_entity || m.home);
        var aE = normEntity_(m.away_entity || m.away);
        if (!entSet[hE] && !entSet[aE]) return;
        out.push({
          date: m.date,
          home: normEntity_(m.home),
          away: normEntity_(m.away),
          home_entity: hE,
          away_entity: aE,
          home_goals: m.home_goals,
          away_goals: m.away_goals,
          score: m.score,
          result: m.result,
          status: m.status,
          awarded: m.awarded,
          count_goals: m.count_goals,
          count_points: m.count_points,
          neutral: m.neutral,
          venue: m.venue,
          playoffs: m.playoffs,
          playoff_round: m.playoff_round,
          cross_division: m.cross_division,
          home_aet: m.home_aet,
          away_aet: m.away_aet,
          home_agg: m.home_agg,
          away_agg: m.away_agg,
          home_pens: m.home_pens,
          away_pens: m.away_pens,
          season: s.season,
          division: divName,
          leagueFull: title
        });
      });
    });
  });
  return out;
}

/**
 * Flatten a seasons[] array from results.json into a flat match list with
 * .season and .leagueFull annotations on each match, matching the shape the
 * dashboard uses. Also normalises entity fields.
 */
function csFlattenSeasons_(seasons) {
  var out = [];
  seasons.forEach(function(s) {
    var divs = s.divisions || {};
    Object.keys(divs).forEach(function(divName) {
      var div = divs[divName] || {};
      var matches = Array.isArray(div.matches) ? div.matches : [];
      var title = div.title || (divName + ' ' + s.season);
      matches.forEach(function(m) {
        out.push({
          date: m.date,
          home: normEntity_(m.home),
          away: normEntity_(m.away),
          home_entity: normEntity_(m.home_entity || m.home),
          away_entity: normEntity_(m.away_entity || m.away),
          home_goals: m.home_goals,
          away_goals: m.away_goals,
          score: m.score,
          result: m.result,
          status: m.status,
          awarded: m.awarded,
          count_goals: m.count_goals,
          count_points: m.count_points,
          neutral: m.neutral,
          venue: m.venue,
          playoffs: m.playoffs,
          playoff_round: m.playoff_round,
          cross_division: m.cross_division,
          home_aet: m.home_aet,
          away_aet: m.away_aet,
          home_agg: m.home_agg,
          away_agg: m.away_agg,
          home_pens: m.home_pens,
          away_pens: m.away_pens,
          season: s.season,
          division: divName,
          leagueFull: title
        });
      });
    });
  });
  return out;
}

/**
 * Load clubs-meta.json. Cached whole (file is small, ~30-50KB).
 */
function csLoadMeta_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(CS_KEY_META);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* fall through */ }
  }
  var meta = csFetchJson_(CS_META_URL);
  try { cache.put(CS_KEY_META, JSON.stringify(meta), CS_CACHE_SECS); } catch (e) { /* ignore */ }
  return meta;
}

/**
 * Load season-notes.json. Cached whole.
 */
function csLoadNotes_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(CS_KEY_NOTES);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* fall through */ }
  }
  var notes = csFetchJson_(CS_NOTES_URL);
  try { cache.put(CS_KEY_NOTES, JSON.stringify(notes), CS_CACHE_SECS); } catch (e) { /* ignore */ }
  return notes;
}

// =============================================================================
// ENTITY RESOLUTION
// =============================================================================

/**
 * Build an index mapping: normalised-name-lower → canonical entity.
 * Canonical = the `entity` field from results.json (e.g. "Maidstone United
 * (original)" stays distinct from "Maidstone United"). Cached alongside the
 * season shards. Includes aliases from clubs-meta.json where available.
 */
function csBuildEntityIndexFromRaw_(raw) {
  var cache = CacheService.getScriptCache();
  var byName = {};          // lower-cased normalised name → canonical entity
  var canonicalSet = {};    // canonical entity → true

  (raw.seasons || []).forEach(function(s) {
    var divs = s.divisions || {};
    Object.keys(divs).forEach(function(divName) {
      var matches = (divs[divName] || {}).matches || [];
      matches.forEach(function(m) {
        ['home', 'away'].forEach(function(side) {
          var ent = normEntity_(m[side + '_entity'] || m[side]);
          var disp = normEntity_(m[side]);
          if (ent) canonicalSet[ent] = true;
          if (ent && !byName[ent.toLowerCase()]) byName[ent.toLowerCase()] = ent;
          if (disp && !byName[disp.toLowerCase()]) byName[disp.toLowerCase()] = ent;
        });
      });
    });
  });

  var payload = {
    byName: byName,
    canonicals: Object.keys(canonicalSet).sort()
  };
  try {
    cache.put(CS_KEY_ENTITIES, JSON.stringify(payload), CS_CACHE_SECS);
  } catch (e) {
    // Entity index may exceed 100KB for very large club sets; that's OK, we'll
    // rebuild it on next call if needed.
  }
  return payload;
}

/**
 * Get (building if needed) the entity index.
 */
function csGetEntityIndex_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(CS_KEY_ENTITIES);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* fall through */ }
  }
  var raw = csFetchJson_(CS_RESULTS_URL);
  return csBuildEntityIndexFromRaw_(raw);
}

/**
 * Resolve a user-supplied club name to a canonical entity.
 * Returns { ok, entity, candidates?, reason? }.
 *
 * Matching passes (in order):
 *   1. Exact match (case-insensitive) on entity or display name
 *   2. Startswith match — "Dorking" → "Dorking Wanderers"
 *   3. Substring match — "Orient" → "Leyton Orient" (if present)
 *
 * If multiple candidates match at the same strength, returns ok=false with
 * the list so Claudio can ask the user to clarify.
 */
function csResolveClub_(userInput) {
  var q = String(userInput || '').trim();
  if (!q) return { ok: false, reason: 'empty' };

  var idx = csGetEntityIndex_();
  var canonicals = idx.canonicals || [];
  var qLower = q.toLowerCase();

  // v2.6: Pass 0 — case-insensitive EXACT match on a canonical entity name.
  // This must beat any alias/byName lookup. "Team Bath" must never resolve
  // to "Bath City" just because Bath City was indexed first as an alias.
  for (var i = 0; i < canonicals.length; i++) {
    if (canonicals[i].toLowerCase() === qLower) {
      return { ok: true, entity: canonicals[i] };
    }
  }

  // Pass 1: exact match on byName lookup (aliases + canonical)
  if (idx.byName[qLower]) {
    return { ok: true, entity: idx.byName[qLower] };
  }

  // Pass 2: startswith among canonicals (case-insensitive)
  var startsWith = canonicals.filter(function(c) {
    return c.toLowerCase().indexOf(qLower) === 0;
  });
  if (startsWith.length === 1) {
    return { ok: true, entity: startsWith[0] };
  }
  if (startsWith.length > 1 && startsWith.length <= 8) {
    return { ok: false, reason: 'ambiguous', candidates: startsWith };
  }

  // Pass 3: word-boundary match — "team bath" matches "Team Bath FC" but
  // not "Bath City". Prefer over loose substring.
  var wordRegex = new RegExp('\\b' + qLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  var wordMatches = canonicals.filter(function(c) {
    return wordRegex.test(c);
  });
  if (wordMatches.length === 1) {
    return { ok: true, entity: wordMatches[0] };
  }
  if (wordMatches.length > 1 && wordMatches.length <= 8) {
    return { ok: false, reason: 'ambiguous', candidates: wordMatches };
  }

  // Pass 4: loose substring among canonicals (last resort)
  var contains = canonicals.filter(function(c) {
    return c.toLowerCase().indexOf(qLower) !== -1;
  });
  if (contains.length === 1) {
    return { ok: true, entity: contains[0] };
  }
  if (contains.length > 1 && contains.length <= 8) {
    return { ok: false, reason: 'ambiguous', candidates: contains };
  }

  return { ok: false, reason: 'not_found', query: q };
}

/**
 * Return any phoenix/merger relatives available for a canonical entity.
 * Mirrors the dashboard's "Include ..." toggles. Used to tell Claudio which
 * alternative lineages a user might want to include.
 */
function csGetLineageOptions_(entity) {
  var meta = csLoadMeta_();
  if (!meta || !meta.relationships) return [];

  var eN = normEntity_(entity);
  var out = {};

  (meta.relationships.phoenix || []).forEach(function(p) {
    var newer = normEntity_(p['new']);
    var older = normEntity_(p.old);
    if (eN === newer && older) out[older] = true;
    else if (eN === older && newer) out[newer] = true;
  });

  (meta.relationships.merger || []).forEach(function(m) {
    var newClub = normEntity_(m['new']);
    var parents = (m.parents || []).map(normEntity_);
    if (eN === newClub) {
      parents.forEach(function(p) { if (p) out[p] = true; });
    } else if (parents.indexOf(eN) !== -1 && newClub) {
      out[newClub] = true;
    }
  });

  return Object.keys(out);
}

// =============================================================================
// PRIMITIVES — ported from dashboard code
// =============================================================================

function normEntity_(s) {
  return String(s || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .trim()
    .replace(/\s+/g, ' ');
}

function csIsNeutral_(m) {
  return !!m.neutral || (m.venue && String(m.venue).toLowerCase() === 'neutral');
}

function csIsHomeForEntity_(m, entity) {
  return normEntity_(m.home_entity || m.home) === normEntity_(entity);
}

/**
 * Returns 'W' | 'D' | 'L' | null for a given entity, respecting abandoned-game
 * rules. null means the match should be excluded from W/D/L counts entirely
 * (abandoned with no counting outcome).
 */
function csResultForEntity_(m, entity) {
  var status = String(m.status || '').toLowerCase();
  var isAbandoned = status === 'abandoned';
  var awarded = String(m.awarded || '').toLowerCase();
  var countPoints = m.count_points !== false;
  var atHome = csIsHomeForEntity_(m, entity);

  // Abandoned + awarded H/A/D
  if (isAbandoned && countPoints && (awarded === 'home' || awarded === 'away' || awarded === 'draw')) {
    if (awarded === 'draw') return 'D';
    if (awarded === 'home') return atHome ? 'W' : 'L';
    if (awarded === 'away') return atHome ? 'L' : 'W';
  }

  // Abandoned + non-counting: null (do not include in W/D/L)
  if (isAbandoned && !countPoints) return null;

  // Explicit result field
  var rr = String(m.result || '').toUpperCase();
  if (rr === 'D') return 'D';
  if (rr === 'H') return atHome ? 'W' : 'L';
  if (rr === 'A') return atHome ? 'L' : 'W';

  // Fall back to goals
  var hg = Number(m.home_goals);
  var ag = Number(m.away_goals);
  if (!isFinite(hg) || !isFinite(ag)) return null;
  if (hg === ag) return 'D';
  var homeWin = hg > ag;
  return (homeWin === atHome) ? 'W' : 'L';
}

function csGfForEntity_(m, entity) {
  var status = String(m.status || '').toLowerCase();
  if (status === 'abandoned' && m.count_goals === false) return 0;
  var hg = Number(m.home_goals), ag = Number(m.away_goals);
  if (!isFinite(hg) || !isFinite(ag)) return 0;
  return csIsHomeForEntity_(m, entity) ? hg : ag;
}

function csGaForEntity_(m, entity) {
  var status = String(m.status || '').toLowerCase();
  if (status === 'abandoned' && m.count_goals === false) return 0;
  var hg = Number(m.home_goals), ag = Number(m.away_goals);
  if (!isFinite(hg) || !isFinite(ag)) return 0;
  return csIsHomeForEntity_(m, entity) ? ag : hg;
}

function csHasResult_(m) {
  var hg = Number(m.home_goals), ag = Number(m.away_goals);
  if (isFinite(hg) && isFinite(ag)) return true;
  var rr = String(m.result || '').toUpperCase();
  if (rr === 'H' || rr === 'A' || rr === 'D') return true;
  var awarded = String(m.awarded || '').toLowerCase();
  if (String(m.status || '').toLowerCase() === 'abandoned' &&
      (awarded === 'home' || awarded === 'away' || awarded === 'draw')) return true;
  return false;
}

function csStartYear_(seasonKey) {
  var m = /^(\d{4})/.exec(String(seasonKey || ''));
  return m ? parseInt(m[1], 10) : 0;
}

function csDivKeyFromTitle_(title) {
  var s = String(title || '').toLowerCase();
  if (s.indexOf('north') !== -1 && s.indexOf('south') !== -1) return 'North/South';
  if (s.indexOf('north') !== -1) return 'North';
  if (s.indexOf('south') !== -1) return 'South';
  return 'National';
}

// =============================================================================
// CALCULATORS — LAYER 3
// =============================================================================

/**
 * Compute a club summary across its NL history, with optional filters.
 *
 * @param {Array<object>} allMatches  All matches (csLoadAllMatches_ output)
 * @param {Array<string>} entities    Canonical entities to include (one or more)
 * @param {object} filters            Validated filter object from csValidateFilters_
 *                                    { venue, competition, scope, season, seasonFrom, seasonTo }
 * @return {object} Flat summary
 */
function csComputeClubSummary_(allMatches, entities, filters) {
  var entSet = {};
  entities.forEach(function(e) { entSet[e] = true; });

  // Pre-filter down to just matches this club played in, then apply filters
  var clubMatches = [];
  for (var i = 0; i < allMatches.length; i++) {
    var m = allMatches[i];
    if (entSet[normEntity_(m.home_entity)] || entSet[normEntity_(m.away_entity)]) {
      clubMatches.push(m);
    }
  }
  var filtered = csApplyFilters_(clubMatches, filters, entSet);

  // Season presence by division
  var seasonsByDiv = { National: {}, North: {}, South: {} };

  // Aggregates
  var P = 0, W = 0, D = 0, L = 0, GF = 0, GA = 0;
  var firstSeason = null, lastSeason = null;

  filtered.forEach(function(m) {
    var entity = entSet[normEntity_(m.home_entity)] ? normEntity_(m.home_entity) : normEntity_(m.away_entity);

    var divKey = csDivKeyFromTitle_(m.leagueFull || '');
    // North/South shared-division doesn't count as division presence, but
    // matches in it are still counted in aggregate stats (when scope='all').
    var countForDivisionPresence = (divKey !== 'North/South');

    if (countForDivisionPresence && seasonsByDiv[divKey]) {
      seasonsByDiv[divKey][m.season] = true;
    }

    // First/last season
    var sy = csStartYear_(m.season);
    if (sy > 0) {
      if (!firstSeason || sy < csStartYear_(firstSeason)) firstSeason = m.season;
      if (!lastSeason || sy > csStartYear_(lastSeason)) lastSeason = m.season;
    }

    if (!csHasResult_(m)) return;

    var r = csResultForEntity_(m, entity);
    if (r === null) return;  // abandoned non-counting
    P++;
    if (r === 'W') W++;
    else if (r === 'D') D++;
    else if (r === 'L') L++;
    GF += csGfForEntity_(m, entity);
    GA += csGaForEntity_(m, entity);
  });

  // Season counts
  var natSeasons = Object.keys(seasonsByDiv.National).sort();
  var nthSeasons = Object.keys(seasonsByDiv.North).sort();
  var sthSeasons = Object.keys(seasonsByDiv.South).sort();
  var allSeasonsSet = {};
  [natSeasons, nthSeasons, sthSeasons].forEach(function(arr) {
    arr.forEach(function(s) { allSeasonsSet[s] = true; });
  });
  var totalSeasons = Object.keys(allSeasonsSet).length;

  return {
    entities: entities,
    filters: filters,
    filterDescription: csDescribeFilters_(filters),
    totalSeasons: totalSeasons,
    seasonsByDivision: {
      National: natSeasons.length,
      North: nthSeasons.length,
      South: sthSeasons.length
    },
    firstSeason: firstSeason,
    lastSeason: lastSeason,
    overall: {
      P: P,
      W: W,
      D: D,
      L: L,
      GF: GF,
      GA: GA,
      GD: GF - GA,
      winRate: P > 0 ? Math.round((W / P) * 1000) / 10 : 0
    }
  };
}

// =============================================================================
// TOOL WRAPPER — LAYER 4
// =============================================================================

/**
 * getClubSummary tool. Called from ClaudioChat.gs's runTool_.
 *
 * Input:
 *   club      (required)  — user's string, resolved fuzzily
 *   lineage   (optional)  — array of additional entity strings to combine
 *                           (phoenix/merger lineage, opt-in)
 *   scope     (optional)  — 'all' | 'national' | 'north' | 'south' (default 'all')
 *
 * Output (success):
 *   { club, entities, scope, totalSeasons, seasonsByDivision,
 *     firstSeason, lastSeason, overall: {P,W,D,L,GF,GA,GD,winRate},
 *     relatedLineage: [...]  }
 *
 * Output (error): { error, candidates? }
 */
function toolGetClubSummary_(input) {
  var input = input || {};
  var clubQuery = input.club;
  var lineage = Array.isArray(input.lineage) ? input.lineage : [];

  if (!clubQuery) {
    return { error: 'Missing required parameter: club' };
  }

  // Validate all filters in one pass
  var f = csValidateFilters_({
    scope: input.scope,
    venue: input.venue,
    competition: input.competition,
    season: input.season,
    seasonFrom: input.seasonFrom,
    seasonTo: input.seasonTo
  });
  if (f.error) return { error: f.error };

  // Resolve the club name
  var resolved = csResolveClub_(clubQuery);
  if (!resolved.ok) {
    if (resolved.reason === 'ambiguous') {
      return {
        error: 'Ambiguous club name — could be any of these. Ask the user to pick one.',
        candidates: resolved.candidates
      };
    }
    return { error: 'Club not found: "' + clubQuery + '". Try a closer match.' };
  }
  var primaryEntity = resolved.entity;

  // Resolve lineage options
  var entities = [primaryEntity];
  var skippedLineage = [];
  lineage.forEach(function(l) {
    var r = csResolveClub_(l);
    if (r.ok && entities.indexOf(r.entity) === -1) {
      entities.push(r.entity);
    } else {
      skippedLineage.push(l);
    }
  });

  // Load matches and compute
  var allMatches;
  try {
    allMatches = csLoadAllMatches_();
  } catch (e) {
    return { error: 'Could not load historical match data: ' + (e.message || String(e)) };
  }

  var summary = csComputeClubSummary_(allMatches, entities, f);

  // If the summary returned zero seasons for the chosen filters, surface that
  if (summary.totalSeasons === 0) {
    return {
      club: primaryEntity,
      entities: entities,
      filters: { scope: f.scope, venue: f.venue, competition: f.competition, season: f.season, seasonFrom: f.seasonFrom, seasonTo: f.seasonTo },
      filterDescription: summary.filterDescription,
      note: 'No matches found for ' + primaryEntity + ' with these filters (' + summary.filterDescription + ').',
      totalSeasons: 0
    };
  }

  // Available lineage options the user could opt in
  var availableLineage = csGetLineageOptions_(primaryEntity).filter(function(l) {
    return entities.indexOf(l) === -1;
  });

  var result = {
    query: clubQuery,
    club: primaryEntity,
    entities: entities,
    filters: {
      scope: f.scope,
      venue: f.venue,
      competition: f.competition,
      season: f.season,
      seasonFrom: f.seasonFrom,
      seasonTo: f.seasonTo
    },
    filterDescription: summary.filterDescription,
    totalSeasons: summary.totalSeasons,
    seasonsByDivision: summary.seasonsByDivision,
    firstSeason: summary.firstSeason,
    lastSeason: summary.lastSeason,
    overall: summary.overall
  };

  if (availableLineage.length) {
    result.relatedLineage = availableLineage;
    result.lineageNote = 'This club has related entities (phoenix/merger lineage). ' +
      'Pass them in the `lineage` parameter to include their matches too.';
  }
  if (skippedLineage.length) {
    result.skippedLineage = skippedLineage;
  }

  return result;
}

// =============================================================================
// v2.0 — ADDITIONAL PRIMITIVES
// =============================================================================

/**
 * ISO date parser: "1990-03-15" → number for comparison.
 */
function csIsoNum_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return 0;
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

/**
 * Ordinal suffix: 1 → "1st", 42 → "42nd".
 */
function csOrdinal_(n) {
  var v = Number(n) || 0;
  var suffixes = { 1: 'st', 2: 'nd', 3: 'rd' };
  var s = (v % 100 >= 11 && v % 100 <= 13) ? 'th' : (suffixes[v % 10] || 'th');
  return v + s;
}

/**
 * Season label: "1989-90" stays as-is; "1989" becomes "1989-90".
 */
function csSeasonLabel_(s) {
  var str = String(s || '');
  if (/^\d{4}-\d{2}$/.test(str)) return str;
  var y = csStartYear_(str);
  if (!y) return str;
  return y + '-' + String((y + 1) % 100).padStart(2, '0');
}

/**
 * Key a match uniquely — used to dedupe when combining entities.
 */
function csMatchKey_(m) {
  return [
    m.date || m.season,
    m.home, m.away,
    m.home_goals, m.away_goals,
    m.score || '',
    m.home_entity || '',
    m.away_entity || '',
    m.playoffs ? 'P' : '',
    m.playoff_round || '',
    m.neutral ? 'N' : ''
  ].join('|');
}

/**
 * Dedupe match array by key.
 */
function csDedupeMatches_(matches) {
  var seen = {};
  var out = [];
  for (var i = 0; i < matches.length; i++) {
    var k = csMatchKey_(matches[i]);
    if (!seen[k]) {
      seen[k] = true;
      out.push(matches[i]);
    }
  }
  return out;
}

/**
 * v2.3 — Shared filter helpers for dynamic sub-scope params.
 *
 * Each calculator uses these to narrow the base match list before running
 * its specific logic. Filters supported:
 *   venue:        'all' | 'home' | 'away' | 'neutral'
 *   competition:  'all' | 'league' | 'playoff'
 *   scope:        'all' | 'national' | 'north' | 'south'
 *   season:       exact season key e.g. '2005-06'
 *   seasonFrom:   start season key (inclusive)
 *   seasonTo:     end season key (inclusive)
 *
 * venue filtering is perspective-aware: a match is "home" if the entity
 * being queried was the home side for that match. For H2H, the perspective
 * is clubA (matches clubA-was-home). For single-club tools, the perspective
 * is the entitySet for that club.
 */

function csValidateFilters_(f) {
  f = f || {};
  var venue = String(f.venue || 'all').toLowerCase();
  var competition = String(f.competition || 'all').toLowerCase();
  var scope = String(f.scope || 'all').toLowerCase();
  if (['all', 'home', 'away', 'neutral'].indexOf(venue) === -1) {
    return { error: 'Invalid venue — use: all, home, away, neutral' };
  }
  if (['all', 'league', 'playoff'].indexOf(competition) === -1) {
    return { error: 'Invalid competition — use: all, league, playoff' };
  }
  if (['all', 'national', 'north', 'south'].indexOf(scope) === -1) {
    return { error: 'Invalid scope — use: all, national, north, south' };
  }
  var season = f.season ? String(f.season).trim() : null;
  var seasonFrom = f.seasonFrom ? String(f.seasonFrom).trim() : null;
  var seasonTo = f.seasonTo ? String(f.seasonTo).trim() : null;
  // Basic shape check — must look like YYYY-YY or YYYY
  function looksLikeSeason(s) {
    return !s || /^\d{4}(-\d{2,4})?$/.test(s);
  }
  if (!looksLikeSeason(season)) return { error: 'Invalid season — use YYYY-YY, e.g. "2005-06"' };
  if (!looksLikeSeason(seasonFrom)) return { error: 'Invalid seasonFrom' };
  if (!looksLikeSeason(seasonTo)) return { error: 'Invalid seasonTo' };
  return {
    ok: true,
    venue: venue,
    competition: competition,
    scope: scope,
    season: season,
    seasonFrom: seasonFrom,
    seasonTo: seasonTo
  };
}

/**
 * Does this match pass the competition filter?
 */
function csMatchPassesCompetition_(m, competition) {
  if (competition === 'all') return true;
  var isPlayoff = !!(m.playoffs || m.playoff_round);
  if (competition === 'playoff') return isPlayoff;
  if (competition === 'league') return !isPlayoff;
  return true;
}

/**
 * Does this match pass the scope filter (division-based)?
 * North/South shared-division matches (2004-05) are allowed in 'all' but
 * excluded from specific division scopes.
 */
function csMatchPassesScope_(m, scope) {
  if (scope === 'all') return true;
  var divKey = csDivKeyFromTitle_(m.leagueFull || '');
  if (divKey === 'North/South') return false;
  if (scope === 'national') return divKey === 'National';
  if (scope === 'north') return divKey === 'North';
  if (scope === 'south') return divKey === 'South';
  return true;
}

/**
 * Does this match pass the season / seasonFrom / seasonTo filter?
 */
function csMatchPassesSeasonRange_(m, filters) {
  if (filters.season) {
    // Exact season match — compare normalised keys
    return csSeasonLabel_(m.season) === csSeasonLabel_(filters.season);
  }
  var y = csStartYear_(m.season);
  if (!y) return !filters.seasonFrom && !filters.seasonTo;
  if (filters.seasonFrom) {
    var fromY = csStartYear_(filters.seasonFrom);
    if (fromY && y < fromY) return false;
  }
  if (filters.seasonTo) {
    var toY = csStartYear_(filters.seasonTo);
    if (toY && y > toY) return false;
  }
  return true;
}

/**
 * Does this match pass the venue filter, from the perspective of the
 * entities provided (a Set / object-as-set of normalised canonical names)?
 */
function csMatchPassesVenue_(m, venue, entitySet) {
  if (venue === 'all') return true;
  var isNeutral = csIsNeutral_(m);
  if (venue === 'neutral') return isNeutral;
  if (isNeutral) return false;  // home/away filters exclude neutral matches
  var entityIsHome = !!entitySet[normEntity_(m.home_entity)];
  if (venue === 'home') return entityIsHome;
  if (venue === 'away') return !entityIsHome;
  return true;
}

/**
 * All-in-one filter — run a match list through all active filters.
 * entitySet is a hash of canonical entities used as perspective for venue.
 */
function csApplyFilters_(matches, filters, entitySet) {
  var out = [];
  for (var i = 0; i < matches.length; i++) {
    var m = matches[i];
    if (!csMatchPassesCompetition_(m, filters.competition)) continue;
    if (!csMatchPassesScope_(m, filters.scope)) continue;
    if (!csMatchPassesSeasonRange_(m, filters)) continue;
    if (!csMatchPassesVenue_(m, filters.venue, entitySet)) continue;
    out.push(m);
  }
  return out;
}

/**
 * Human-readable description of the active filters for inclusion in
 * responses (so Claudio can mention "home games since 2015" etc).
 */
function csDescribeFilters_(filters) {
  var parts = [];
  if (filters.venue !== 'all') parts.push(filters.venue);
  if (filters.competition === 'playoff') parts.push('play-off only');
  else if (filters.competition === 'league') parts.push('league only');
  if (filters.scope !== 'all') parts.push(filters.scope);
  if (filters.season) parts.push(filters.season);
  else if (filters.seasonFrom && filters.seasonTo) parts.push(filters.seasonFrom + ' to ' + filters.seasonTo);
  else if (filters.seasonFrom) parts.push('from ' + filters.seasonFrom);
  else if (filters.seasonTo) parts.push('up to ' + filters.seasonTo);
  return parts.length ? parts.join(', ') : 'all-time';
}

/**
 * Parse the "effective date" field on a note — controls when a points
 * deduction / expulsion etc kicks in.
 */
function csIsNoteActiveAsOf_(note, asOfISO, includeUndated) {
  var ed = note && note.effectiveDate;
  if (!ed) return !!includeUndated;
  if (ed === 'start_of_season') return true;
  if (ed === 'end_of_season') return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ed)) {
    return csIsoNum_(ed) <= csIsoNum_(asOfISO);
  }
  return !!includeUndated;
}

/**
 * Read the notes list from season-notes.json into a lookup.
 * Returns a function: (seasonKey, divisionName) → array of active notes
 * (filtered by asOfISO + includeUndated).
 */
function csBuildNotesIndex_(notesRaw) {
  var list = Array.isArray(notesRaw && notesRaw.notes) ? notesRaw.notes :
             Array.isArray(notesRaw) ? notesRaw : [];
  var bySeasonDiv = {};
  list.forEach(function(n) {
    if (!n || !n.season || !n.division) return;
    var skd = String(n.season) + '|' + String(n.division);
    if (!bySeasonDiv[skd]) bySeasonDiv[skd] = [];
    bySeasonDiv[skd].push({
      season: String(n.season),
      division: String(n.division),
      team: String(n.team || ''),
      entity: String(n.entity || n.team || ''),
      type: String(n.type || 'general').toLowerCase(),
      note: String(n.note || ''),
      effectiveDate: (n.effectiveDate != null && n.effectiveDate !== '') ? String(n.effectiveDate) : null,
      pointsValue: (n.pointsValue != null && n.pointsValue !== '') ? Number(n.pointsValue) : null
    });
  });
  return {
    byKey: bySeasonDiv,
    activeFor: function(seasonKey, divisionName, asOfISO, includeUndated) {
      var arr = bySeasonDiv[String(seasonKey) + '|' + String(divisionName)] || [];
      return arr.filter(function(n) { return csIsNoteActiveAsOf_(n, asOfISO, !!includeUndated); });
    },
    all: list
  };
}

/**
 * Read the seasonFormat list into a lookup.
 */
function csBuildFormatIndex_(notesRaw) {
  var formats = Array.isArray(notesRaw && notesRaw.seasonFormat) ? notesRaw.seasonFormat :
                Array.isArray(notesRaw && notesRaw.formats) ? notesRaw.formats :
                [];
  var idx = {};
  formats.forEach(function(it) {
    if (!it || !it.season || !it.division) return;
    var sk = String(it.season), dk = String(it.division);
    var po = (it.playoffs && typeof it.playoffs === 'object') ? it.playoffs : { semi: 0, eliminator: 0 };
    idx[sk + '|' + dk] = {
      season: sk,
      division: dk,
      title: it.title || '',
      champions: Number(it.champions || 1),
      automatic: Number(it.automatic || 0),
      playoffsSemi: Number(po.semi || 0),
      playoffsElim: Number(po.eliminator || 0),
      relegation: Number(it.relegation || 0),
      points: {
        winHome: Number((it.points && it.points.winHome) || 3),
        winAway: Number((it.points && it.points.winAway) || 3),
        draw:    Number((it.points && it.points.draw) || 1),
        loss:    Number((it.points && it.points.loss) || 0)
      }
    };
  });
  return idx;
}

/**
 * Build a perspective-entity resolver: given a match and a Set of entities,
 * returns the entity (if any) that played in that match. If multiple are
 * in the match (e.g. North-South play-off across lineage), returns one.
 */
function csPerspectiveForMatch_(m, entitySet) {
  var he = normEntity_(m.home_entity);
  var ae = normEntity_(m.away_entity);
  if (entitySet[he]) return he;
  if (entitySet[ae]) return ae;
  return null;
}

// =============================================================================
// v2.0 — CALCULATOR: HEAD-TO-HEAD
// =============================================================================

/**
 * Compute head-to-head stats between two groups of entities, with filters.
 *
 * @param {Array<object>} allMatches  All matches (csLoadAllMatches_ output)
 * @param {Array<string>} entitiesA   Canonical entities for clubA
 * @param {Array<string>} entitiesB   Canonical entities for clubB
 * @param {object} filters            { venue, competition, scope, season, seasonFrom, seasonTo }
 *                                    venue is from clubA's perspective.
 * @return {object}
 */
function csComputeHeadToHead_(allMatches, entitiesA, entitiesB, filters) {
  var setA = {};
  entitiesA.forEach(function(e) { setA[e] = true; });
  var setB = {};
  entitiesB.forEach(function(e) { setB[e] = true; });

  // Find all A-vs-B matches
  var candidates = [];
  for (var i = 0; i < allMatches.length; i++) {
    var m = allMatches[i];
    var he = normEntity_(m.home_entity);
    var ae = normEntity_(m.away_entity);
    var aIsHome = setA[he] && setB[ae];
    var aIsAway = setA[ae] && setB[he];
    if (!aIsHome && !aIsAway) continue;
    if (!csHasResult_(m)) continue;
    candidates.push(m);
  }

  // Apply shared filters — venue is from clubA's perspective
  var mm = csApplyFilters_(candidates, filters, setA);

  mm = csDedupeMatches_(mm);
  mm.sort(function(a, b) { return csIsoNum_(a.date) - csIsoNum_(b.date); });

  var total = mm.length;
  var aW = 0, aD = 0, aL = 0;
  var aGF = 0, aGA = 0;
  var venueH = 0, venueA = 0, venueN = 0;  // home/away/neutral (from A's perspective)
  var divNat = 0, divN = 0, divS = 0;

  // Track biggest wins/losses
  var biggestWinA = null;   // highest margin where A won
  var biggestWinB = null;   // highest margin where B won

  mm.forEach(function(m) {
    var he = normEntity_(m.home_entity);
    var aIsHome = setA[he];
    var myEntity = aIsHome ? he : normEntity_(m.away_entity);
    var r = csResultForEntity_(m, myEntity);
    if (r === null) return;  // abandoned non-counting — skip W/D/L

    if (r === 'W') aW++;
    else if (r === 'D') aD++;
    else aL++;

    var gf = csGfForEntity_(m, myEntity);
    var ga = csGaForEntity_(m, myEntity);
    aGF += gf;
    aGA += ga;

    // Venue from A's perspective
    if (csIsNeutral_(m)) venueN++;
    else if (aIsHome) venueH++;
    else venueA++;

    // Division
    var divKey = csDivKeyFromTitle_(m.leagueFull || '');
    if (divKey === 'National') divNat++;
    else if (divKey === 'North') divN++;
    else if (divKey === 'South') divS++;

    // Biggest margin (positive = A won)
    var margin = gf - ga;
    if (margin > 0) {
      if (!biggestWinA || margin > biggestWinA.margin) {
        biggestWinA = {
          date: m.date,
          score: (aIsHome ? gf : gf) + '-' + (aIsHome ? ga : ga),  // A's-perspective score
          venue: aIsHome ? 'home' : 'away',
          margin: margin,
          matchTitle: (m.home || '') + ' ' + String(m.home_goals || 0) + '-' + String(m.away_goals || 0) + ' ' + (m.away || ''),
          competition: (m.leagueFull || '').replace(/\s+\d{4}[-\u2013]\d{2,4}\s*$/, '')
        };
      }
    } else if (margin < 0) {
      var mabs = -margin;
      if (!biggestWinB || mabs > biggestWinB.margin) {
        biggestWinB = {
          date: m.date,
          score: (aIsHome ? gf : gf) + '-' + (aIsHome ? ga : ga),
          venue: aIsHome ? 'home' : 'away',
          margin: mabs,
          matchTitle: (m.home || '') + ' ' + String(m.home_goals || 0) + '-' + String(m.away_goals || 0) + ' ' + (m.away || ''),
          competition: (m.leagueFull || '').replace(/\s+\d{4}[-\u2013]\d{2,4}\s*$/, '')
        };
      }
    }
  });

  // First & last meetings (with full context)
  function fmtMeeting(m) {
    if (!m) return null;
    return {
      date: m.date,
      season: m.season,
      home: m.home,
      away: m.away,
      score: m.score || (String(m.home_goals) + '-' + String(m.away_goals)),
      competition: (m.leagueFull || '').replace(/\s+\d{4}[-\u2013]\d{2,4}\s*$/, ''),
      venue: csIsNeutral_(m) ? 'neutral' : null,
      playoff: m.playoffs ? (m.playoff_round || true) : null
    };
  }
  var firstMeeting = fmtMeeting(mm[0]);
  var lastMeeting = fmtMeeting(mm[mm.length - 1]);

  // v2.6: all meetings (newest first), capped at 100 for response size
  // safety. For longer rivalries, Claudio should point to /history/head-to-head
  // which is already surfaced via historyPageUrl.
  var newestFirst = mm.slice().sort(function(a, b) {
    return csIsoNum_(b.date) - csIsoNum_(a.date);
  });
  var allMeetings = newestFirst.slice(0, 100).map(fmtMeeting);
  var truncated = newestFirst.length > 100;

  var winRate = total > 0 ? Math.round((aW / total) * 1000) / 10 : 0;

  return {
    entitiesA: entitiesA,
    entitiesB: entitiesB,
    filters: filters,
    filterDescription: csDescribeFilters_(filters),
    total: total,
    recordA: { W: aW, D: aD, L: aL, GF: aGF, GA: aGA, GD: aGF - aGA, winRate: winRate },
    firstMeeting: firstMeeting,
    lastMeeting: lastMeeting,
    allMeetings: allMeetings,
    meetingsReturned: allMeetings.length,
    meetingsTruncated: truncated,
    venueBreakdown: { home: venueH, away: venueA, neutral: venueN },
    divisionBreakdown: { National: divNat, North: divN, South: divS },
    biggestWinA: biggestWinA,
    biggestWinB: biggestWinB
  };
}

// =============================================================================
// v2.0 — CALCULATOR: LEAGUE TABLE (ported from v3.38i standings dashboard)
// =============================================================================

/**
 * Ported point-rule lookup. Throws if a season+division combination is missing
 * from season-notes.json's seasonFormat, because the standings would be wrong
 * otherwise. The dashboard does the same.
 */
function csPointsRuleFor_(formatIdx, seasonKey, divisionName) {
  var fmt = formatIdx[String(seasonKey) + '|' + String(divisionName)];
  if (!fmt) throw new Error('Missing season format for ' + seasonKey + ' / ' + divisionName);
  return fmt.points;
}

function csSeasonFormatFor_(formatIdx, seasonKey, divisionName) {
  var fmt = formatIdx[String(seasonKey) + '|' + String(divisionName)];
  if (!fmt) throw new Error('Missing season format for ' + seasonKey + ' / ' + divisionName);
  return fmt;
}

/**
 * Initialise a team-stats row.
 */
function csInitStats_() {
  return { P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 };
}

/**
 * Add a single match's effects into team stats (ported from dashboard).
 */
function csAddMatchToStats_(stats, match, ptsRule) {
  var home = normEntity_(match.home_entity || match.home);
  var away = normEntity_(match.away_entity || match.away);
  var hg = Number(match.home_goals);
  var ag = Number(match.away_goals);
  if (!home || !away) return;
  if (!isFinite(hg) || !isFinite(ag)) return;

  var status = String(match.status || '').toLowerCase();
  var isAbandoned = status === 'abandoned';
  var awarded = String(match.awarded || '').toLowerCase();
  var countGoals = match.count_goals !== false;
  var countPoints = match.count_points !== false;

  if (isAbandoned && !countGoals && !countPoints) return;

  if (!stats[home]) stats[home] = csInitStats_();
  if (!stats[away]) stats[away] = csInitStats_();
  var H = stats[home], A = stats[away];

  if (countGoals) {
    H.GF += hg; H.GA += ag;
    A.GF += ag; A.GA += hg;
  }
  if (!countPoints) return;

  H.P++; A.P++;

  if (isAbandoned) {
    if (awarded === 'home') { H.W++; A.L++; H.Pts += ptsRule.winHome; return; }
    if (awarded === 'away') { A.W++; H.L++; A.Pts += ptsRule.winAway; return; }
    if (awarded === 'draw') { H.D++; A.D++; H.Pts += ptsRule.draw; A.Pts += ptsRule.draw; return; }
    if (awarded === 'none' || awarded === '') { H.P--; A.P--; return; }
  }

  if (hg > ag) { H.W++; A.L++; H.Pts += ptsRule.winHome; }
  else if (hg < ag) { A.W++; H.L++; A.Pts += ptsRule.winAway; }
  else { H.D++; A.D++; H.Pts += ptsRule.draw; A.Pts += ptsRule.draw; }
}

/**
 * Sort standings — points > GD > GF > team name.
 */
function csSortStandings_(rows) {
  rows.sort(function(a, b) {
    if (b.Pts !== a.Pts) return b.Pts - a.Pts;
    if (b.GD !== a.GD) return b.GD - a.GD;
    if (b.GF !== a.GF) return b.GF - a.GF;
    return String(a.team).localeCompare(String(b.team));
  });
  rows.forEach(function(r, i) { r.pos = i + 1; });
  return rows;
}

/**
 * Compute the league table for a specific season and division.
 * Ports v3.38i dashboard logic: points rules from notes, expulsions,
 * points deductions (date-effective), PPG ranking for covid seasons,
 * playoff winner detection from actual match results.
 *
 * @param {object} seasonObj  The season object from results.json
 * @param {object} notesIdx   From csBuildNotesIndex_
 * @param {object} formatIdx  From csBuildFormatIndex_
 * @param {string} divisionName 'National' | 'North' | 'South'
 * @param {string} asOfISO    Date cutoff, or null for full-season
 * @param {boolean} finalMode Whether to apply end-of-season rules
 * @return {Array} standings rows
 */
/**
 * Compute the league table. Ports the v3.38i dashboard logic in full:
 *   - Base standings from matches, respecting abandoned/awarded/non-counting
 *   - Expulsions (notes type "expelled")
 *   - Points deductions (notes type "points_deduction")
 *   - PPG ranking for covid (notes type "ppg")
 *   - Zone classification (champion, promoted, playoff-semi, playoff-elim,
 *     relegated/relegation-zone) driven by seasonFormat from season-notes.json
 *   - Playoff winner detection from results.json (90min > aet > pens)
 *   - Clinched-* emphasis for as-of tables (mathematical lock-in)
 *   - Movement arrows (up/down) for final-mode
 *   - Zone boundaries for dotted dividers
 *
 * Returns an object: { rows, zones, deductions, playoffWinner, isFinal, usesPPG }
 */
function csComputeLeagueTable_(seasonObj, notesIdx, formatIdx, divisionName, asOfISO, finalMode) {
  var seasonKey = String(seasonObj.season);
  var div = seasonObj.divisions && seasonObj.divisions[divisionName];
  if (!div) throw new Error('Division not found: ' + divisionName + ' in ' + seasonKey);

  var matches = Array.isArray(div.matches) ? div.matches : [];
  var ptsRule = csPointsRuleFor_(formatIdx, seasonKey, divisionName);
  var fmt = csSeasonFormatFor_(formatIdx, seasonKey, divisionName);
  var asNum = csIsoNum_(asOfISO);

  var activeNotes = notesIdx.activeFor(seasonKey, divisionName, asOfISO, !!finalMode);

  // Expelled teams (as of this date)
  var expelled = {};
  activeNotes.forEach(function(n) {
    if (n.type === 'expelled' || n.type === 'expulsion') {
      var k = normEntity_(n.entity || n.team);
      if (k) expelled[k] = true;
    }
  });

  // Known teams = union of every home/away entity in the matches
  var knownTeams = {};
  matches.forEach(function(m) {
    var h = normEntity_(m.home_entity || m.home);
    var a = normEntity_(m.away_entity || m.away);
    if (h) knownTeams[h] = true;
    if (a) knownTeams[a] = true;
  });
  // Also include expelled teams that may have no matches in the filtered window
  Object.keys(expelled).forEach(function(k) { knownTeams[k] = true; });

  // Compute stats (excluding playoffs; respecting as-of date and expelled exclusion)
  var stats = {};
  matches.forEach(function(m) {
    if (m.playoffs || m.playoff_round) return;
    var d = String(m.date || '').slice(0, 10);
    if (!d) return;
    if (asNum > 0 && csIsoNum_(d) > asNum) return;

    var h = normEntity_(m.home_entity || m.home);
    var a = normEntity_(m.away_entity || m.away);
    if (!h || !a) return;
    if (expelled[h] || expelled[a]) return;

    var mNorm = {};
    for (var k in m) mNorm[k] = m[k];
    mNorm.home_entity = h;
    mNorm.away_entity = a;
    mNorm.home = h;
    mNorm.away = a;
    csAddMatchToStats_(stats, mNorm, ptsRule);
  });

  // Build row array
  var rows = [];
  Object.keys(knownTeams).forEach(function(entity) {
    var s = stats[entity] || csInitStats_();
    s.GD = s.GF - s.GA;
    var isExpelled = !!expelled[entity];
    rows.push({
      entity: entity,
      team: entity,
      pos: 0,
      P: isExpelled ? 0 : s.P,
      W: isExpelled ? 0 : s.W,
      D: isExpelled ? 0 : s.D,
      L: isExpelled ? 0 : s.L,
      GF: isExpelled ? 0 : s.GF,
      GA: isExpelled ? 0 : s.GA,
      GD: isExpelled ? 0 : s.GD,
      Pts: isExpelled ? 0 : s.Pts,
      classes: isExpelled ? ['expelled'] : [],
      move: '',
      deductionTotal: 0   // points net deduction applied
    });
  });

  csSortStandings_(rows);

  // Apply points deductions
  var deductionsList = activeNotes.filter(function(n) {
    return n.type === 'points_deduction' && isFinite(n.pointsValue);
  });
  var deductionByEntity = {};
  if (deductionsList.length) {
    deductionsList.forEach(function(n) {
      var k = normEntity_(n.entity || n.team);
      if (!k) return;
      deductionByEntity[k] = (deductionByEntity[k] || 0) + Number(n.pointsValue);
    });
    rows.forEach(function(r) {
      if (deductionByEntity[r.entity]) {
        r.Pts += deductionByEntity[r.entity];
        r.deductionTotal = deductionByEntity[r.entity];
      }
    });
    csSortStandings_(rows);
  }

  // PPG ranking for covid seasons
  var usesPPG = activeNotes.some(function(n) { return n.type === 'ppg'; });
  if (usesPPG) {
    rows.forEach(function(r) { r._ppg = r.P > 0 ? (r.Pts / r.P) : 0; });
    rows.sort(function(a, b) {
      if (b._ppg !== a._ppg) return b._ppg - a._ppg;
      if (b.Pts !== a.Pts) return b.Pts - a.Pts;
      if (b.GD !== a.GD) return b.GD - a.GD;
      if (b.GF !== a.GF) return b.GF - a.GF;
      return String(a.team).localeCompare(String(b.team));
    });
    rows.forEach(function(r, i) { r.pos = i + 1; });
    rows.forEach(function(r) { delete r._ppg; });
  }

  // Zones calculation (from seasonFormat)
  var activeRows = rows.filter(function(r) { return r.classes.indexOf('expelled') === -1; });
  var teamCount = activeRows.length;
  var bands = {
    championStart:   fmt.champions > 0 ? 1 : null,
    championEnd:     fmt.champions > 0 ? fmt.champions : null,
    automaticStart:  fmt.automatic > 0 ? (fmt.champions + 1) : null,
    automaticEnd:    fmt.automatic > 0 ? (fmt.champions + fmt.automatic) : null,
    semiStart:       fmt.playoffsSemi > 0 ? (fmt.champions + fmt.automatic + 1) : null,
    semiEnd:         fmt.playoffsSemi > 0 ? (fmt.champions + fmt.automatic + fmt.playoffsSemi) : null,
    elimStart:       fmt.playoffsElim > 0 ? (fmt.champions + fmt.automatic + fmt.playoffsSemi + 1) : null,
    elimEnd:         fmt.playoffsElim > 0 ? (fmt.champions + fmt.automatic + fmt.playoffsSemi + fmt.playoffsElim) : null,
    relegationLine:  fmt.relegation > 0 ? (teamCount - fmt.relegation) : null
  };

  // Apply zone classes
  rows.forEach(function(r) {
    if (r.classes.indexOf('expelled') !== -1) return;
    var pos = r.pos;
    if (bands.championEnd && pos <= bands.championEnd) {
      r.classes.push('champion');
      if (finalMode) r.move = 'up';
    } else if (bands.automaticEnd && pos <= bands.automaticEnd) {
      r.classes.push('promoted');
      if (finalMode) r.move = 'up';
    } else if (bands.semiEnd && pos >= bands.semiStart && pos <= bands.semiEnd) {
      r.classes.push('playoff-semi');
    } else if (bands.elimEnd && pos >= bands.elimStart && pos <= bands.elimEnd) {
      r.classes.push('playoff-elim');
    }
    if (bands.relegationLine != null && pos > bands.relegationLine) {
      r.classes.push(finalMode ? 'relegated' : 'relegation-zone');
      if (finalMode) r.move = 'down';
    }
  });

  // Playoff winner detection (final-mode only)
  var playoffWinner = null;
  if (finalMode && (bands.semiEnd || bands.elimEnd)) {
    playoffWinner = csFindPlayoffWinner_(seasonObj, divisionName);
    if (playoffWinner) {
      var winnerEntity = normEntity_(playoffWinner);
      rows.forEach(function(r) {
        if (r.entity === winnerEntity) {
          // Remove playoff classes, add promoted
          r.classes = r.classes.filter(function(c) { return c !== 'playoff-semi' && c !== 'playoff-elim'; });
          if (r.classes.indexOf('promoted') === -1) r.classes.push('promoted');
          r.move = 'up';
        }
      });
    }
  }

  // Expelled teams always have downward movement
  rows.forEach(function(r) {
    if (r.classes.indexOf('expelled') !== -1) r.move = 'down';
  });

  // Clinched-* emphasis for as-of tables (not final)
  if (!finalMode) {
    csApplyClinchedClasses_(rows, bands, ptsRule, fmt);
  }

  return {
    rows: rows,
    zones: bands,
    deductionsByEntity: deductionByEntity,
    playoffWinner: playoffWinner,
    isFinal: !!finalMode,
    usesPPG: usesPPG,
    notes: activeNotes
  };
}

/**
 * Find the play-off winner for a season/division from results.json play-off
 * matches. Precedence: 90min > aet > pens. Looks at matches in the division,
 * or in North/South shared-fixtures for 2004-05-style playoffs.
 */
function csFindPlayoffWinner_(seasonObj, divisionName) {
  var divs = seasonObj.divisions || {};
  var matches = [];
  var div = divs[divisionName];
  if (div && Array.isArray(div.matches)) matches = matches.concat(div.matches);
  if (divisionName === 'North' || divisionName === 'South') {
    var shared = divs['North/South'];
    if (shared && Array.isArray(shared.matches)) matches = matches.concat(shared.matches);
  }

  var finals = matches.filter(function(m) {
    if (!m || !m.playoffs) return false;
    var pr = String(m.playoff_round || '').trim().toLowerCase();
    return pr === 'final';
  }).sort(function(a, b) {
    return csIsoNum_(String(a.date || '').slice(0, 10)) - csIsoNum_(String(b.date || '').slice(0, 10));
  });
  if (!finals.length) return null;
  var fin = finals[finals.length - 1];
  var h = normEntity_(fin.home_entity || fin.home);
  var a = normEntity_(fin.away_entity || fin.away);
  if (!h || !a) return null;

  var hg = Number(fin.home_goals), ag = Number(fin.away_goals);
  if (isFinite(hg) && isFinite(ag)) {
    if (hg > ag) return h;
    if (ag > hg) return a;
  }
  var hAet = Number(fin.home_aet), aAet = Number(fin.away_aet);
  if (isFinite(hAet) && isFinite(aAet)) {
    if (hAet > aAet) return h;
    if (aAet > hAet) return a;
  }
  var hPen = Number(fin.home_pens), aPen = Number(fin.away_pens);
  if (isFinite(hPen) && isFinite(aPen)) {
    if (hPen > aPen) return h;
    if (aPen > hPen) return a;
  }
  return null;
}

/**
 * Apply clinched-* classes to rows. A team has clinched a zone if their
 * current points already exceed the max-possible-points of the Kth-ranked
 * rival (where K is the zone-end position). Ported from v3.38i dashboard's
 * applyClinchedEmphasis.
 */
function csApplyClinchedClasses_(rows, bands, ptsRule, fmt) {
  var activeRows = rows.filter(function(r) { return r.classes.indexOf('expelled') === -1; });
  var teamCount = activeRows.length;
  var maxGames = (teamCount >= 2) ? ((teamCount - 1) * 2) : 0;
  var ptsWinMax = Math.max(Number(ptsRule.winHome || 0), Number(ptsRule.winAway || 0));

  // Calculate max-possible-points per team
  var maxPts = {};
  rows.forEach(function(r) {
    if (r.classes.indexOf('expelled') !== -1) return;
    var remaining = Math.max(0, maxGames - Number(r.P || 0));
    maxPts[r.entity] = Number(r.Pts || 0) + ptsWinMax * remaining;
  });

  function kthHighestMaxPtsAmongOthers(ownEntity, k) {
    var vals = [];
    Object.keys(maxPts).forEach(function(ent) {
      if (ent !== ownEntity) vals.push(maxPts[ent]);
    });
    vals.sort(function(a, b) { return b - a; });
    if (k <= 0 || vals.length < k) return null;
    return vals[k - 1];
  }

  var relPlaces = Math.max(0, Number(fmt.relegation || 0));
  var safePos = relPlaces > 0 ? (activeRows.length - relPlaces) : null;
  var safePtsNow = (safePos && safePos >= 1 && safePos <= activeRows.length)
    ? Number(activeRows[safePos - 1].Pts || 0) : null;

  rows.forEach(function(r) {
    if (r.classes.indexOf('expelled') !== -1) return;
    var ptsNow = Number(r.Pts || 0);
    var teamMax = maxPts[r.entity];

    // Clinched champion: current points > max possible of kth-best rival (where k = championEnd)
    if (bands.championEnd) {
      var titleThreshold = kthHighestMaxPtsAmongOthers(r.entity, bands.championEnd);
      if (titleThreshold != null && ptsNow > titleThreshold) {
        r.classes.push('clinched-champion');
        return;
      }
    }
    // Clinched playoff-semi
    if (bands.semiEnd) {
      var semiThreshold = kthHighestMaxPtsAmongOthers(r.entity, bands.semiEnd);
      if (semiThreshold != null && ptsNow > semiThreshold) {
        r.classes.push('clinched-po-semi');
        return;
      }
    }
    // Clinched playoff-elim
    if (bands.elimEnd) {
      var elimThreshold = kthHighestMaxPtsAmongOthers(r.entity, bands.elimEnd);
      if (elimThreshold != null && ptsNow > elimThreshold) {
        r.classes.push('clinched-po-elim');
      }
    }
    // Clinched relegated: teamMax < safe-line points
    if (relPlaces > 0 && safePtsNow != null && isFinite(teamMax) && teamMax < safePtsNow) {
      r.classes.push('clinched-relegated');
    }
  });
}

// =============================================================================
// v2.0 — CALCULATOR: STREAKS
// =============================================================================

/**
 * Find consecutive runs in an array matching a predicate.
 * Returns [{startIdx, endIdx, len}, ...].
 */
function csRunsInArray_(arr, pred) {
  var runs = [];
  var start = -1;
  for (var i = 0; i < arr.length; i++) {
    if (pred(arr[i])) {
      if (start === -1) start = i;
    } else {
      if (start !== -1) {
        runs.push({ startIdx: start, endIdx: i - 1, len: i - start });
        start = -1;
      }
    }
  }
  if (start !== -1) runs.push({ startIdx: start, endIdx: arr.length - 1, len: arr.length - start });
  return runs;
}

/**
 * Predicate generator for a streak type.
 */
function csStreakPredicate_(type, entitySet) {
  return function(m) {
    var entity = csPerspectiveForMatch_(m, entitySet);
    if (!entity) return false;
    var r = csResultForEntity_(m, entity);
    if (r === null) return false;
    switch (type) {
      case 'wins':     return r === 'W';
      case 'unbeaten': return r === 'W' || r === 'D';
      case 'losses':   return r === 'L';
      case 'winless':  return r !== 'W';
      default:         return false;
    }
  };
}

/**
 * Compute the longest streak(s) for a club.
 *
 * @param {Array<object>} allMatches  All matches
 * @param {Array<string>} entities    Canonical entities
 * @param {string} type               'wins' | 'unbeaten' | 'losses' | 'winless'
 * @param {string} scope              'all' | 'national' | 'north' | 'south'
 * @param {string} mode               'all' | 'single' (within one season) | 'start' (from season start)
 * @return {object}
 */
function csComputeClubStreak_(allMatches, entities, type, filters, mode) {
  var entitySet = {};
  entities.forEach(function(e) { entitySet[e] = true; });

  // Pre-filter to this club's matches with a result
  var clubMatches = [];
  for (var i = 0; i < allMatches.length; i++) {
    var m = allMatches[i];
    var pe = csPerspectiveForMatch_(m, entitySet);
    if (!pe) continue;
    if (!csHasResult_(m)) continue;
    clubMatches.push(m);
  }
  // Apply the generic filters (scope, venue, competition, season range)
  var base = csApplyFilters_(clubMatches, filters, entitySet);

  base = csDedupeMatches_(base);
  base.sort(function(a, b) { return csIsoNum_(a.date) - csIsoNum_(b.date); });

  var pred = csStreakPredicate_(type, entitySet);

  if (mode === 'all' || !mode) {
    var runs = csRunsInArray_(base, pred);
    var maxLen = 0;
    runs.forEach(function(r) { if (r.len > maxLen) maxLen = r.len; });
    if (maxLen === 0) return { length: 0, instances: [] };

    var instances = runs.filter(function(r) { return r.len === maxLen; }).map(function(r) {
      var matches = base.slice(r.startIdx, r.endIdx + 1);
      return {
        length: r.len,
        start: matches[0] ? matches[0].date : null,
        end: matches[matches.length - 1] ? matches[matches.length - 1].date : null,
        startSeason: matches[0] ? matches[0].season : null,
        endSeason: matches[matches.length - 1] ? matches[matches.length - 1].season : null,
        matches: matches.map(function(m) {
          var pe = csPerspectiveForMatch_(m, entitySet);
          var atHome = csIsHomeForEntity_(m, pe);
          var r = csResultForEntity_(m, pe);
          return {
            date: m.date,
            opponent: atHome ? m.away : m.home,
            venue: csIsNeutral_(m) ? 'N' : (atHome ? 'H' : 'A'),
            score: m.score || (String(m.home_goals) + '-' + String(m.away_goals)),
            result: r
          };
        })
      };
    });

    return { length: maxLen, instances: instances };
  }

  // single-season or season-start mode
  var bySeason = {};
  base.forEach(function(m) {
    var k = m.season || '—';
    if (!bySeason[k]) bySeason[k] = [];
    bySeason[k].push(m);
  });

  if (mode === 'single') {
    var maxLen = 0;
    var cands = [];
    Object.keys(bySeason).forEach(function(sKey) {
      var arr = bySeason[sKey];
      var runs = csRunsInArray_(arr, pred);
      runs.forEach(function(r) { if (r.len > maxLen) maxLen = r.len; });
      runs.filter(function(r) { return r.len >= 1; }).forEach(function(r) {
        cands.push({ sKey: sKey, arr: arr, run: r });
      });
    });
    if (maxLen === 0) return { length: 0, instances: [] };
    var instances = cands.filter(function(c) { return c.run.len === maxLen; }).map(function(c) {
      var matches = c.arr.slice(c.run.startIdx, c.run.endIdx + 1);
      return {
        length: c.run.len,
        season: c.sKey,
        start: matches[0] ? matches[0].date : null,
        end: matches[matches.length - 1] ? matches[matches.length - 1].date : null,
        matches: matches.map(function(m) {
          var pe = csPerspectiveForMatch_(m, entitySet);
          var atHome = csIsHomeForEntity_(m, pe);
          var r = csResultForEntity_(m, pe);
          return {
            date: m.date,
            opponent: atHome ? m.away : m.home,
            venue: csIsNeutral_(m) ? 'N' : (atHome ? 'H' : 'A'),
            score: m.score || (String(m.home_goals) + '-' + String(m.away_goals)),
            result: r
          };
        })
      };
    });
    return { length: maxLen, instances: instances };
  }

  // 'start' — from season start
  var maxLen2 = 0;
  var cands2 = [];
  Object.keys(bySeason).forEach(function(sKey) {
    var arr = bySeason[sKey];
    if (!arr.length) return;
    var i = 0;
    while (i < arr.length && pred(arr[i])) i++;
    var len = i;
    if (len > 0) {
      cands2.push({ sKey: sKey, arr: arr, len: len });
      if (len > maxLen2) maxLen2 = len;
    }
  });
  if (maxLen2 === 0) return { length: 0, instances: [] };
  var instances2 = cands2.filter(function(c) { return c.len === maxLen2; }).map(function(c) {
    var matches = c.arr.slice(0, c.len);
    return {
      length: c.len,
      season: c.sKey,
      start: matches[0] ? matches[0].date : null,
      end: matches[matches.length - 1] ? matches[matches.length - 1].date : null,
      matches: matches.map(function(m) {
        var pe = csPerspectiveForMatch_(m, entitySet);
        var atHome = csIsHomeForEntity_(m, pe);
        var r = csResultForEntity_(m, pe);
        return {
          date: m.date,
          opponent: atHome ? m.away : m.home,
          venue: csIsNeutral_(m) ? 'N' : (atHome ? 'H' : 'A'),
          score: m.score || (String(m.home_goals) + '-' + String(m.away_goals)),
          result: r
        };
      })
    };
  });
  return { length: maxLen2, instances: instances2 };
}

// =============================================================================
// v2.0 — CALCULATOR: CLUB RECORDS
// =============================================================================

/**
 * Compute best/worst/notable records for a club.
 */
function csComputeClubRecords_(allMatches, entities, filters) {
  var entitySet = {};
  entities.forEach(function(e) { entitySet[e] = true; });

  var clubMatches = [];
  for (var i = 0; i < allMatches.length; i++) {
    var m = allMatches[i];
    var pe = csPerspectiveForMatch_(m, entitySet);
    if (!pe) continue;
    if (!csHasResult_(m)) continue;
    clubMatches.push(m);
  }
  var base = csApplyFilters_(clubMatches, filters, entitySet);
  base = csDedupeMatches_(base);

  // Annotate each match with perspective data
  var anno = base.map(function(m) {
    var pe = csPerspectiveForMatch_(m, entitySet);
    var gf = csGfForEntity_(m, pe);
    var ga = csGaForEntity_(m, pe);
    var r = csResultForEntity_(m, pe);
    var atHome = csIsHomeForEntity_(m, pe);
    var opp = atHome ? m.away : m.home;
    return {
      date: m.date,
      season: m.season,
      home: m.home,
      away: m.away,
      homeGoals: m.home_goals,
      awayGoals: m.away_goals,
      score: m.score || (String(m.home_goals) + '-' + String(m.away_goals)),
      venue: csIsNeutral_(m) ? 'N' : (atHome ? 'H' : 'A'),
      opponent: opp,
      myGoals: gf,
      oppGoals: ga,
      margin: gf - ga,
      totalGoals: gf + ga,
      result: r,
      competition: (m.leagueFull || '').replace(/\s+\d{4}[-\u2013]\d{2,4}\s*$/, '')
    };
  }).filter(function(x) { return x.result !== null; });

  function topN(arr, cmp, n) {
    return arr.slice().sort(cmp).slice(0, n || 5);
  }

  function fmtRec(x) {
    return {
      date: x.date,
      season: x.season,
      score: x.myGoals + '-' + x.oppGoals + ' vs ' + x.opponent + ' (' + x.venue + ')',
      matchTitle: x.home + ' ' + (x.homeGoals == null ? '' : x.homeGoals) + '-' + (x.awayGoals == null ? '' : x.awayGoals) + ' ' + x.away,
      competition: x.competition
    };
  }

  return {
    filters: filters,
    filterDescription: csDescribeFilters_(filters),
    totalMatches: anno.length,
    best: {
      biggestWins: topN(anno.filter(function(x) { return x.margin > 0; }),
        function(a, b) { return (b.margin - a.margin) || (b.myGoals - a.myGoals) || (csIsoNum_(b.date) - csIsoNum_(a.date)); },
        5).map(fmtRec),
      mostGoalsScored: topN(anno, function(a, b) {
        return (b.myGoals - a.myGoals) || (b.totalGoals - a.totalGoals) || (csIsoNum_(b.date) - csIsoNum_(a.date));
      }, 5).map(fmtRec),
      highestScoring: topN(anno, function(a, b) {
        return (b.totalGoals - a.totalGoals) || (b.myGoals - a.myGoals) || (csIsoNum_(b.date) - csIsoNum_(a.date));
      }, 5).map(fmtRec)
    },
    worst: {
      heaviestDefeats: topN(anno.filter(function(x) { return x.margin < 0; }),
        function(a, b) { return (a.margin - b.margin) || (b.oppGoals - a.oppGoals) || (csIsoNum_(b.date) - csIsoNum_(a.date)); },
        5).map(fmtRec),
      mostGoalsConceded: topN(anno, function(a, b) {
        return (b.oppGoals - a.oppGoals) || (b.totalGoals - a.totalGoals) || (csIsoNum_(b.date) - csIsoNum_(a.date));
      }, 5).map(fmtRec)
    },
    notable: {
      firstMatch: anno.length ? fmtRec(anno.slice().sort(function(a, b) {
        return csIsoNum_(a.date) - csIsoNum_(b.date);
      })[0]) : null,
      lastMatch: anno.length ? fmtRec(anno.slice().sort(function(a, b) {
        return csIsoNum_(b.date) - csIsoNum_(a.date);
      })[0]) : null
    }
  };
}

// =============================================================================
// v2.0 — STAFF LOOKUP (from RTDB)
// =============================================================================

/**
 * Load all staff from RTDB. Cached 1 hour.
 */
function csLoadStaff_() {
  var cache = CacheService.getScriptCache();
  var key = CS_CACHE_VERSION + '_staff';
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* fall through */ }
  }

  // Read users where role in [superadmin, admin, staff]
  var url = firebaseRestURL_('users') + '.json?auth=' + getFirebaseSecret_();
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return [];
  var data = JSON.parse(res.getContentText());
  if (!data) return [];

  var staff = [];
  Object.keys(data).forEach(function(uid) {
    var u = data[uid] || {};
    var role = String(u.role || '').toLowerCase();
    if (role !== 'superadmin' && role !== 'admin' && role !== 'staff') return;
    staff.push({
      uid: uid,
      name: u.name || '',
      email: u.email || '',
      jobTitle: u.jobTitle || '',
      org: u.org || '',
      orgKey: u.orgKey || '',
      role: role,
      lineManagerUid: u.lineManagerUid || '',
      approverUid: u.approverUid || ''
    });
  });

  // Resolve line managers/approvers to names
  var byUid = {};
  staff.forEach(function(s) { byUid[s.uid] = s.name; });
  staff.forEach(function(s) {
    s.lineManagerName = s.lineManagerUid ? (byUid[s.lineManagerUid] || '') : '';
    s.approverName = s.approverUid ? (byUid[s.approverUid] || '') : '';
  });

  try { cache.put(key, JSON.stringify(staff), 60 * 60); } catch (e) { /* may exceed 100KB, OK */ }
  return staff;
}

/**
 * Tool: getStaff — returns subset of staff matching query.
 * Inputs:
 *   name (optional) — substring match on name
 *   role (optional) — 'superadmin' | 'admin' | 'staff'
 */
function toolGetStaff_(input) {
  input = input || {};
  var nameQ = String(input.name || '').trim().toLowerCase();
  var roleQ = String(input.role || '').trim().toLowerCase();

  var all;
  try { all = csLoadStaff_(); }
  catch (e) { return { error: 'Could not load staff: ' + (e.message || String(e)) }; }

  if (!all.length) return { error: 'Staff directory is empty or not loaded.' };

  var filtered = all.filter(function(s) {
    if (nameQ && (s.name || '').toLowerCase().indexOf(nameQ) === -1) return false;
    if (roleQ && s.role !== roleQ) return false;
    return true;
  });

  if (!filtered.length) {
    return {
      total: all.length,
      matching: 0,
      note: 'No staff found matching your query.'
    };
  }

  // For verbose lists, cap at 50 entries
  var capped = filtered.slice(0, 50);

  return {
    total: all.length,
    matching: filtered.length,
    returned: capped.length,
    staff: capped.map(function(s) {
      return {
        name: s.name,
        jobTitle: s.jobTitle,
        org: s.org,
        email: s.email,
        role: s.role,
        lineManager: s.lineManagerName || null,
        approver: (s.approverName && s.approverName !== s.lineManagerName) ? s.approverName : null
      };
    })
  };
}

// =============================================================================
// v2.0 — TOOL WRAPPERS
// =============================================================================

/**
 * Short display name for a club entity. Used in h2h neutral-mode cells
 * where we show the winning team's short name in a coloured cell.
 * Rule: first word, unless that's very short ("AFC", "FC") in which case
 * first two words. Preserves "Dag & Red" etc.
 */
function csShortName_(entity) {
  var s = String(entity || '').trim();
  if (!s) return '';
  // Strip common suffixes that aren't useful in a short tag
  s = s.replace(/\s+\(original\)$/i, '');
  var words = s.split(/\s+/);
  if (!words.length) return s;
  var first = words[0];
  // "AFC", "FC", "SC" → add next word
  if (/^(AFC|FC|SC|CF)$/i.test(first) && words.length > 1) {
    return (first + ' ' + words[1]);
  }
  // "&" in first three tokens → keep the joined segment ("Dagenham & Redbridge" → "Dag & Red", actually keep full)
  if (words.length >= 3 && words[1] === '&') {
    return words[0] + ' & ' + words[2];
  }
  return first;
}

/**
 * getHeadToHead tool.
 * v2.6: adds perspective param (clubA | clubB | neutral) and returns all
 * meetings up to a cap, rather than just last-5.
 */
function toolGetHeadToHead_(input) {
  input = input || {};
  var qA = input.clubA, qB = input.clubB;
  var perspective = String(input.perspective || 'clubA').toLowerCase();

  if (!qA || !qB) return { error: 'Missing required parameter: clubA and/or clubB' };
  if (['cluba', 'clubb', 'neutral'].indexOf(perspective) === -1) {
    return { error: 'Invalid perspective — use: clubA, clubB, neutral' };
  }

  var f = csValidateFilters_({
    scope: input.scope,
    venue: input.venue,
    competition: input.competition,
    season: input.season,
    seasonFrom: input.seasonFrom,
    seasonTo: input.seasonTo
  });
  if (f.error) return { error: f.error };

  var rA = csResolveClub_(qA);
  if (!rA.ok) {
    if (rA.reason === 'ambiguous') return { error: 'Ambiguous clubA', candidates: rA.candidates };
    return { error: 'Club A not found: ' + qA };
  }
  var rB = csResolveClub_(qB);
  if (!rB.ok) {
    if (rB.reason === 'ambiguous') return { error: 'Ambiguous clubB', candidates: rB.candidates };
    return { error: 'Club B not found: ' + qB };
  }
  if (rA.entity === rB.entity) {
    return { error: 'clubA and clubB resolved to the same entity: ' + rA.entity };
  }

  var entitiesA = [rA.entity];
  var entitiesB = [rB.entity];
  (Array.isArray(input.lineageA) ? input.lineageA : []).forEach(function(l) {
    var r = csResolveClub_(l);
    if (r.ok && entitiesA.indexOf(r.entity) === -1) entitiesA.push(r.entity);
  });
  (Array.isArray(input.lineageB) ? input.lineageB : []).forEach(function(l) {
    var r = csResolveClub_(l);
    if (r.ok && entitiesB.indexOf(r.entity) === -1) entitiesB.push(r.entity);
  });

  var allMatches;
  try { allMatches = csLoadAllMatches_(); }
  catch (e) { return { error: 'Could not load match data: ' + (e.message || String(e)) }; }

  var result = csComputeHeadToHead_(allMatches, entitiesA, entitiesB, f);

  // v2.1: add per-club history summary so Claudio can phrase "haven't met
  // in our competitions" correctly for clubs who've left or never been in NL.
  function historyFor(entities) {
    var mySet = {};
    entities.forEach(function(e) { mySet[e] = true; });
    var seasons = {};
    var firstSeason = null, lastSeason = null;
    allMatches.forEach(function(m) {
      var isMine = mySet[normEntity_(m.home_entity)] || mySet[normEntity_(m.away_entity)];
      if (!isMine) return;
      var divKey = csDivKeyFromTitle_(m.leagueFull || '');
      if (divKey === 'North/South') return;
      seasons[m.season] = true;
      var sy = csStartYear_(m.season);
      if (sy > 0) {
        if (!firstSeason || sy < csStartYear_(firstSeason)) firstSeason = m.season;
        if (!lastSeason || sy > csStartYear_(lastSeason)) lastSeason = m.season;
      }
    });
    return {
      seasonsInOurLeagues: Object.keys(seasons).length,
      firstSeason: firstSeason,
      lastSeason: lastSeason
    };
  }
  result.clubAHistory = historyFor(entitiesA);
  result.clubBHistory = historyFor(entitiesB);

  // Surface available lineage options
  var availA = csGetLineageOptions_(rA.entity).filter(function(l) { return entitiesA.indexOf(l) === -1; });
  var availB = csGetLineageOptions_(rB.entity).filter(function(l) { return entitiesB.indexOf(l) === -1; });
  if (availA.length) result.availableLineageA = availA;
  if (availB.length) result.availableLineageB = availB;

  // For long rivalries, remind Claudio to link to /history
  if (result.total > 10) {
    result.historyPageUrl = 'https://www.thenationalleague.org.uk/history/head-to-head';
    result.historyPageNote = 'For the full match list, link the user to /history/head-to-head';
  }

  // v2.6: rendererPayload — Claudio emits this verbatim in an nl-table
  // block. Now shows ALL meetings (up to 100) in a scrollable styled table.
  // Perspective-aware: clubA/clubB uses W/D/L pills from that side; neutral
  // shows the winning team's short name in a coloured cell.
  if (result.total > 0 && Array.isArray(result.allMeetings) && result.allMeetings.length) {
    var labelA = entitiesA.join(' + ');
    var labelB = entitiesB.join(' + ');
    var shortA = csShortName_(rA.entity);
    var shortB = csShortName_(rB.entity);

    // Title reflects perspective
    var perspectiveLabel;
    if (perspective === 'clubb') perspectiveLabel = 'from ' + labelB + '\u2019s perspective';
    else if (perspective === 'neutral') perspectiveLabel = 'neutral';
    else perspectiveLabel = 'from ' + labelA + '\u2019s perspective';

    // Append filter description if anything non-default is active
    var filterDesc = result.filterDescription;
    if (filterDesc && filterDesc !== 'all-time') {
      perspectiveLabel += ' \u00b7 ' + filterDesc;
    }

    var countLabel = result.meetingsTruncated
      ? 'First ' + result.allMeetings.length + ' of ' + result.total + '+ meetings'
      : (result.allMeetings.length === 1 ? '1 meeting' : 'All ' + result.allMeetings.length + ' meetings');

    // v2.6: Cap rendererPayload at 30 meetings regardless of total.
    // Prevents output-token ceiling hits when Claudio copies the JSON verbatim.
    // The full `allMeetings` array stays in the main response for prose analysis.
    var H2H_RENDERER_CAP = 30;
    var renderMeetings = result.allMeetings.slice(0, H2H_RENDERER_CAP);
    var renderCapped = result.allMeetings.length > H2H_RENDERER_CAP;
    var renderTitle = labelA + ' vs ' + labelB + ' \u2014 ' + countLabel;
    if (renderCapped) {
      renderTitle = labelA + ' vs ' + labelB + ' \u2014 ' + H2H_RENDERER_CAP +
        ' most recent of ' + result.total + ' shown';
    }

    result.rendererPayload = {
      type: 'h2h-meetings',
      title: renderTitle,
      subtitle: perspectiveLabel,
      perspective: perspective,
      clubALabel: labelA,
      clubBLabel: labelB,
      clubAShort: shortA,
      clubBShort: shortB,
      entitiesA: entitiesA,
      entitiesB: entitiesB,
      scrollable: renderMeetings.length > 12,
      truncated: result.meetingsTruncated || renderCapped,
      totalMeetings: result.total,
      meetings: renderMeetings.map(function(m) {
        // Determine which side won via the score
        var sh = String(m.score || '').split('-');
        var hg = Number(sh[0]);
        var ag = Number(sh[1]);
        var outcome; // 'A' | 'B' | 'D' | ''
        if (!isFinite(hg) || !isFinite(ag)) {
          outcome = '';
        } else if (hg === ag) {
          outcome = 'D';
        } else {
          // Who is home in terms of A/B grouping?
          var homeInA = entitiesA.indexOf(normEntity_(m.home)) !== -1;
          var homeWon = hg > ag;
          if (homeWon) outcome = homeInA ? 'A' : 'B';
          else outcome = homeInA ? 'B' : 'A';
        }

        // Compute the per-perspective result code
        var resultCode;
        if (perspective === 'neutral') {
          if (outcome === 'A') resultCode = 'winA';
          else if (outcome === 'B') resultCode = 'winB';
          else if (outcome === 'D') resultCode = 'draw';
          else resultCode = '';
        } else if (perspective === 'clubb') {
          if (outcome === 'B') resultCode = 'W';
          else if (outcome === 'A') resultCode = 'L';
          else if (outcome === 'D') resultCode = 'D';
          else resultCode = '';
        } else {
          if (outcome === 'A') resultCode = 'W';
          else if (outcome === 'B') resultCode = 'L';
          else if (outcome === 'D') resultCode = 'D';
          else resultCode = '';
        }

        return {
          date: m.date,
          season: m.season,
          home: m.home,
          away: m.away,
          score: m.score,
          competition: m.competition || '',
          venue: m.venue || null,
          outcome: outcome,           // 'A' | 'B' | 'D' (objective)
          result: resultCode          // perspective-specific code for the pill
        };
      })
    };
  }

  return result;
}

/**
 * getLeagueTable tool — returns a rich response that Claudio will render
 * inline as a styled HTML table (via the nl-table fenced block protocol).
 */
function toolGetLeagueTable_(input) {
  input = input || {};
  var season = String(input.season || '').trim();
  var division = String(input.division || '').trim();
  var asOf = input.asOf ? String(input.asOf).trim() : null;

  if (!season) return { error: 'Missing required parameter: season (e.g. "2005-06")' };
  if (!division) return { error: 'Missing required parameter: division (National, North, or South)' };

  // Normalise division
  var divMap = { national: 'National', nl: 'National', north: 'North', n: 'North', south: 'South', s: 'South' };
  var divCanon = divMap[division.toLowerCase()] || division;

  // Load data
  var allMatches, notesRaw;
  try {
    allMatches = csLoadAllMatches_();
    notesRaw = csLoadNotes_();
  } catch (e) { return { error: 'Could not load data: ' + (e.message || String(e)) }; }

  // Find all matches (including playoffs) for this season/division
  var seasonMatches = allMatches.filter(function(m) { return m.season === season && m.division === divCanon; });
  if (!seasonMatches.length) {
    return { error: 'No matches found for ' + season + ' / ' + divCanon };
  }
  // Also include North/South shared matches for playoff winner detection
  var sharedMatches = [];
  if (divCanon === 'North' || divCanon === 'South') {
    sharedMatches = allMatches.filter(function(m) { return m.season === season && m.division === 'North/South'; });
  }

  // Rebuild a "season object" shape for the calculator
  var seasonObj = {
    season: season,
    divisions: (function() {
      var d = {};
      d[divCanon] = { matches: seasonMatches };
      if (sharedMatches.length) d['North/South'] = { matches: sharedMatches };
      return d;
    })()
  };

  var notesIdx = csBuildNotesIndex_(notesRaw);
  var formatIdx = csBuildFormatIndex_(notesRaw);

  // Determine asOf — if not provided, final mode
  var effectiveAsOf = asOf;
  var isFinal = !asOf;
  if (!effectiveAsOf) {
    var dates = seasonMatches.map(function(m) { return String(m.date || '').slice(0, 10); }).filter(Boolean);
    dates.sort();
    effectiveAsOf = dates.length ? dates[dates.length - 1] : '9999-12-31';
  }

  var computed;
  try {
    computed = csComputeLeagueTable_(seasonObj, notesIdx, formatIdx, divCanon, effectiveAsOf, isFinal);
  } catch (e) {
    return { error: 'Could not compute standings: ' + (e.message || String(e)) };
  }

  // Rows payload for renderer — preserve entity key for footnote matching
  var rowsPayload = computed.rows.map(function(r) {
    var classes = (r.classes || []).slice();
    var payload = {
      pos: r.pos,
      team: r.team,
      P: r.P, W: r.W, D: r.D, L: r.L,
      GF: r.GF, GA: r.GA, GD: r.GD,
      Pts: r.Pts,
      classes: classes,
      move: r.move || ''
    };
    if (r.deductionTotal) payload.deduction = r.deductionTotal;
    return payload;
  });

  // Footnote block — build human-readable lines for each relevant note
  var footnotes = [];
  var notesByEntity = {};
  (computed.notes || []).forEach(function(n) {
    var k = normEntity_(n.entity || n.team);
    if (!k) {
      // Division-wide note
      if (n.note) footnotes.push({ team: null, text: String(n.note || '') });
      return;
    }
    if (!notesByEntity[k]) notesByEntity[k] = [];
    notesByEntity[k].push(n);
  });
  // Order by row position
  rowsPayload.forEach(function(r) {
    var k = normEntity_(r.team);  // team === entity in our data
    var ns = notesByEntity[k];
    if (!ns || !ns.length) return;
    var bits = [];
    ns.forEach(function(n) {
      var suffix = '';
      if (n.effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(n.effectiveDate)) {
        var d = new Date(n.effectiveDate + 'T12:00:00Z');
        suffix = ' on ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      }
      var text = String(n.note || '').trim().replace(/[.;:,]+$/, '');
      if (text) bits.push(text + suffix);
    });
    if (bits.length) footnotes.push({ team: r.team, text: bits.join('; ') });
  });

  // Build a title for the caption
  var fmt = formatIdx[season + '|' + divCanon];
  var leagueTitle = (fmt && fmt.title) || (divCanon + ' ' + season);

  // The renderable payload — Claudio is asked to emit this verbatim in an ```nl-table``` block
  var nlTable = {
    type: 'standings',
    title: leagueTitle,
    season: season,
    division: divCanon,
    asOf: effectiveAsOf,
    isFinal: isFinal,
    usesPPG: computed.usesPPG,
    zones: {
      championEnd:    computed.zones.championEnd,
      automaticEnd:   computed.zones.automaticEnd,
      playoffSemiEnd: computed.zones.semiEnd,
      playoffElimEnd: computed.zones.elimEnd,
      relegationLine: computed.zones.relegationLine
    },
    rows: rowsPayload,
    footnotes: footnotes,
    playoffWinner: computed.playoffWinner
  };

  return {
    season: season,
    division: divCanon,
    asOf: effectiveAsOf,
    isFinal: isFinal,
    teamCount: rowsPayload.length,
    playoffWinner: computed.playoffWinner,
    // rendererPayload is what Claudio should emit in an ```nl-table``` fenced block
    rendererPayload: nlTable,
    // keep the plain rows for backwards compat / plain-text fallback
    rows: rowsPayload
  };
}

/**
 * getClubStreak tool.
 */
function toolGetClubStreak_(input) {
  input = input || {};
  var clubQ = input.club;
  var type = String(input.type || 'wins').toLowerCase();
  var mode = String(input.mode || 'all').toLowerCase();

  if (!clubQ) return { error: 'Missing required parameter: club' };
  if (['wins', 'unbeaten', 'losses', 'winless'].indexOf(type) === -1) {
    return { error: 'Invalid type — use: wins, unbeaten, losses, winless' };
  }
  if (['all', 'single', 'start'].indexOf(mode) === -1) {
    return { error: 'Invalid mode — use: all (anywhere), single (within one season), start (from season start)' };
  }

  var f = csValidateFilters_({
    scope: input.scope,
    venue: input.venue,
    competition: input.competition,
    season: input.season,
    seasonFrom: input.seasonFrom,
    seasonTo: input.seasonTo
  });
  if (f.error) return { error: f.error };

  var resolved = csResolveClub_(clubQ);
  if (!resolved.ok) {
    if (resolved.reason === 'ambiguous') return { error: 'Ambiguous club', candidates: resolved.candidates };
    return { error: 'Club not found: ' + clubQ };
  }

  var entities = [resolved.entity];
  (Array.isArray(input.lineage) ? input.lineage : []).forEach(function(l) {
    var r = csResolveClub_(l);
    if (r.ok && entities.indexOf(r.entity) === -1) entities.push(r.entity);
  });

  var allMatches;
  try { allMatches = csLoadAllMatches_(); }
  catch (e) { return { error: 'Could not load data: ' + (e.message || String(e)) }; }

  var result = csComputeClubStreak_(allMatches, entities, type, f, mode);

  return {
    club: resolved.entity,
    entities: entities,
    type: type,
    filters: f,
    filterDescription: csDescribeFilters_(f),
    mode: mode,
    length: result.length,
    instances: result.instances
  };
}

/**
 * getClubRecords tool.
 */
function toolGetClubRecords_(input) {
  input = input || {};
  var clubQ = input.club;

  if (!clubQ) return { error: 'Missing required parameter: club' };

  var f = csValidateFilters_({
    scope: input.scope,
    venue: input.venue,
    competition: input.competition,
    season: input.season,
    seasonFrom: input.seasonFrom,
    seasonTo: input.seasonTo
  });
  if (f.error) return { error: f.error };

  var resolved = csResolveClub_(clubQ);
  if (!resolved.ok) {
    if (resolved.reason === 'ambiguous') return { error: 'Ambiguous club', candidates: resolved.candidates };
    return { error: 'Club not found: ' + clubQ };
  }

  var entities = [resolved.entity];
  (Array.isArray(input.lineage) ? input.lineage : []).forEach(function(l) {
    var r = csResolveClub_(l);
    if (r.ok && entities.indexOf(r.entity) === -1) entities.push(r.entity);
  });

  var allMatches;
  try { allMatches = csLoadAllMatches_(); }
  catch (e) { return { error: 'Could not load data: ' + (e.message || String(e)) }; }

  var records = csComputeClubRecords_(allMatches, entities, f);

  return {
    club: resolved.entity,
    entities: entities,
    filters: f,
    filterDescription: csDescribeFilters_(f),
    records: records
  };
}

// =============================================================================
// v2.4 — TIER 1 NEW TOOLS
// =============================================================================

/**
 * getMostFrequentOpponents tool. v2.5 — optimised for response size.
 * - Uses csLoadMatchesForClub_ (narrows at load, 95% less data)
 * - Default limit drops to 10 (was 15)
 * - Tiered response: top 5 get W/D/L/goals; 6-N get just {opponent, meetings}
 * - Dates and full stats available with `detailed: true`
 */
function toolGetMostFrequentOpponents_(input) {
  input = input || {};
  var clubQ = input.club;
  var limit = Math.max(1, Math.min(50, parseInt(input.limit || 10, 10) || 10));
  var detailed = !!input.detailed;

  if (!clubQ) return { error: 'Missing required parameter: club' };

  var f = csValidateFilters_({
    scope: input.scope,
    venue: input.venue,
    competition: input.competition,
    season: input.season,
    seasonFrom: input.seasonFrom,
    seasonTo: input.seasonTo
  });
  if (f.error) return { error: f.error };

  var resolved = csResolveClub_(clubQ);
  if (!resolved.ok) {
    if (resolved.reason === 'ambiguous') return { error: 'Ambiguous club', candidates: resolved.candidates };
    return { error: 'Club not found: ' + clubQ };
  }

  var entities = [resolved.entity];
  (Array.isArray(input.lineage) ? input.lineage : []).forEach(function(l) {
    var r = csResolveClub_(l);
    if (r.ok && entities.indexOf(r.entity) === -1) entities.push(r.entity);
  });

  // v2.5: narrowed loader — only this club's matches
  var clubMatches;
  try { clubMatches = csLoadMatchesForClub_(entities); }
  catch (e) { return { error: 'Could not load data: ' + (e.message || String(e)) }; }

  var entSet = {};
  entities.forEach(function(e) { entSet[e] = true; });

  // Filter to results-having matches and apply shared filters
  var withResult = [];
  for (var i = 0; i < clubMatches.length; i++) {
    if (csHasResult_(clubMatches[i])) withResult.push(clubMatches[i]);
  }
  var filtered = csApplyFilters_(withResult, f, entSet);

  // Bin by opponent
  var bins = {};
  filtered.forEach(function(m) {
    var mine = entSet[normEntity_(m.home_entity)] ? m.home_entity : m.away_entity;
    var opp = entSet[normEntity_(m.home_entity)] ? m.away_entity : m.home_entity;
    var oppKey = normEntity_(opp);
    if (!oppKey) return;

    if (!bins[oppKey]) {
      bins[oppKey] = {
        opponent: opp,
        meetings: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0,
        firstMeeting: null, lastMeeting: null
      };
    }
    var b = bins[oppKey];
    b.meetings++;
    var r = csResultForEntity_(m, mine);
    if (r === 'W') b.W++;
    else if (r === 'D') b.D++;
    else if (r === 'L') b.L++;
    b.GF += csGfForEntity_(m, mine);
    b.GA += csGaForEntity_(m, mine);
    if (!b.firstMeeting || csIsoNum_(m.date) < csIsoNum_(b.firstMeeting)) b.firstMeeting = m.date;
    if (!b.lastMeeting || csIsoNum_(m.date) > csIsoNum_(b.lastMeeting)) b.lastMeeting = m.date;
  });

  var rows = Object.keys(bins).map(function(k) { return bins[k]; });
  rows.sort(function(a, b) {
    return (b.meetings - a.meetings) || (b.W - a.W) || String(a.opponent).localeCompare(String(b.opponent));
  });

  var top = rows.slice(0, limit);

  // Tiered shape: top 5 get stats, 6-N get just {opponent, meetings}.
  // In detailed mode, all returned rows get full stats + dates.
  var topOpponents = top.map(function(b, idx) {
    if (detailed) {
      return {
        opponent: b.opponent,
        meetings: b.meetings,
        W: b.W, D: b.D, L: b.L,
        GF: b.GF, GA: b.GA,
        winRate: b.meetings > 0 ? Math.round((b.W / b.meetings) * 1000) / 10 : 0,
        firstMeeting: b.firstMeeting,
        lastMeeting: b.lastMeeting
      };
    }
    if (idx < 5) {
      return {
        opponent: b.opponent,
        meetings: b.meetings,
        W: b.W, D: b.D, L: b.L
      };
    }
    return { opponent: b.opponent, meetings: b.meetings };
  });

  return {
    club: resolved.entity,
    filters: f,
    filterDescription: csDescribeFilters_(f),
    totalOpponents: rows.length,
    returned: topOpponents.length,
    topOpponents: topOpponents
  };
}

/**
 * getClubMatches tool.
 * Returns a flat match list for a club, with all standard filters.
 * Includes rendererPayload for styled table rendering.
 */
function toolGetClubMatches_(input) {
  input = input || {};
  var clubQ = input.club;
  // v2.5: default drops 50→25 (plenty for prose; user can ask for more)
  var limit = Math.max(1, Math.min(200, parseInt(input.limit || 25, 10) || 25));
  var order = String(input.order || 'newest').toLowerCase();

  if (!clubQ) return { error: 'Missing required parameter: club' };
  if (['newest', 'oldest'].indexOf(order) === -1) {
    return { error: 'Invalid order \u2014 use: newest or oldest' };
  }

  var f = csValidateFilters_({
    scope: input.scope,
    venue: input.venue,
    competition: input.competition,
    season: input.season,
    seasonFrom: input.seasonFrom,
    seasonTo: input.seasonTo
  });
  if (f.error) return { error: f.error };

  var resolved = csResolveClub_(clubQ);
  if (!resolved.ok) {
    if (resolved.reason === 'ambiguous') return { error: 'Ambiguous club', candidates: resolved.candidates };
    return { error: 'Club not found: ' + clubQ };
  }

  var entities = [resolved.entity];
  (Array.isArray(input.lineage) ? input.lineage : []).forEach(function(l) {
    var r = csResolveClub_(l);
    if (r.ok && entities.indexOf(r.entity) === -1) entities.push(r.entity);
  });

  // v2.5: narrowed loader — only this club's matches
  var clubMatches;
  try { clubMatches = csLoadMatchesForClub_(entities); }
  catch (e) { return { error: 'Could not load data: ' + (e.message || String(e)) }; }

  var entSet = {};
  entities.forEach(function(e) { entSet[e] = true; });

  var filtered = csApplyFilters_(clubMatches, f, entSet);
  filtered = csDedupeMatches_(filtered);

  // Sort
  filtered.sort(function(a, b) {
    var diff = csIsoNum_(a.date) - csIsoNum_(b.date);
    return order === 'newest' ? -diff : diff;
  });

  var total = filtered.length;
  var truncated = total > limit;
  var sliced = filtered.slice(0, limit);

  // Tally while we format
  var W = 0, D = 0, L = 0, GF = 0, GA = 0;
  var matchesOut = sliced.map(function(m) {
    var mine = entSet[normEntity_(m.home_entity)] ? m.home_entity : m.away_entity;
    var hadResult = csHasResult_(m);
    if (hadResult) {
      var r = csResultForEntity_(m, mine);
      if (r === 'W') W++;
      else if (r === 'D') D++;
      else if (r === 'L') L++;
      GF += csGfForEntity_(m, mine);
      GA += csGaForEntity_(m, mine);
    }
    var atHome = csIsHomeForEntity_(m, mine);
    var neutral = csIsNeutral_(m);
    return {
      date: m.date,
      season: m.season,
      home: m.home,
      away: m.away,
      score: m.score || (String(m.home_goals) + '-' + String(m.away_goals)),
      competition: (m.leagueFull || '').replace(/\s+\d{4}[-\u2013]\d{2,4}\s*$/, ''),
      venue: neutral ? 'neutral' : (atHome ? 'home' : 'away'),
      outcome: hadResult ? csResultForEntity_(m, mine) : null,
      playoff: m.playoffs ? (m.playoff_round || true) : null
    };
  });

  // Aggregate over the WHOLE filtered set (not just the sliced portion)
  // so summary is accurate
  var fullW = 0, fullD = 0, fullL = 0, fullGF = 0, fullGA = 0;
  filtered.forEach(function(m) {
    if (!csHasResult_(m)) return;
    var mine = entSet[normEntity_(m.home_entity)] ? m.home_entity : m.away_entity;
    var r = csResultForEntity_(m, mine);
    if (r === 'W') fullW++;
    else if (r === 'D') fullD++;
    else if (r === 'L') fullL++;
    fullGF += csGfForEntity_(m, mine);
    fullGA += csGaForEntity_(m, mine);
  });
  var playedFull = fullW + fullD + fullL;

  var shortName = csShortName_(resolved.entity);
  var title;
  if (f.season) {
    title = resolved.entity + ' \u2014 ' + f.season;
  } else if (f.seasonFrom || f.seasonTo) {
    title = resolved.entity + ' \u2014 ' + csDescribeFilters_(f);
  } else {
    title = resolved.entity + ' \u2014 match history';
  }

  var countLabel;
  if (truncated) {
    countLabel = 'Showing ' + (order === 'newest' ? 'most recent ' : 'earliest ') + sliced.length + ' of ' + total;
  } else {
    countLabel = sliced.length === 1 ? '1 match' : 'All ' + sliced.length + ' matches';
  }

  var rendererPayload = null;
  if (sliced.length > 0) {
    // v2.6: Cap rendererPayload at 30 matches regardless of `limit`.
    // Prevents Claudio hitting output-token limits when copying the JSON
    // verbatim. The full `matches` array is still in the response for prose
    // analysis; this only limits the styled-table rendering.
    var RENDERER_CAP = 30;
    var rendererMatches = matchesOut.slice(0, RENDERER_CAP);
    var rendererCapped = matchesOut.length > RENDERER_CAP;

    var renderTitle = title + ' \u2014 ' + countLabel;
    if (rendererCapped) {
      renderTitle = title + ' \u2014 ' + (order === 'newest' ? 'most recent ' : 'earliest ') +
        RENDERER_CAP + ' of ' + total + ' shown';
    }

    rendererPayload = {
      type: 'club-matches',
      title: renderTitle,
      subtitle: csDescribeFilters_(f),
      clubLabel: resolved.entity,
      clubShort: shortName,
      scrollable: rendererMatches.length > 12,
      truncated: truncated || rendererCapped,
      totalMatches: total,
      matches: rendererMatches
    };
  }

  return {
    club: resolved.entity,
    entities: entities,
    filters: f,
    filterDescription: csDescribeFilters_(f),
    totalMatches: total,
    returned: sliced.length,
    truncated: truncated,
    summary: {
      P: playedFull,
      W: fullW, D: fullD, L: fullL,
      GF: fullGF, GA: fullGA, GD: fullGF - fullGA,
      winRate: playedFull > 0 ? Math.round((fullW / playedFull) * 1000) / 10 : 0
    },
    matches: matchesOut,
    rendererPayload: rendererPayload
  };
}

/**
 * getAllTimeChampions tool.
 * Walks every season/division combination and tallies champions, play-off
 * winners, promoted clubs, and relegated clubs. Returns ranked lists.
 *
 * Performance: on-demand computation of every season's league table.
 * Accept 5-10s response time per user. No cache (user decision).
 */
function toolGetAllTimeChampions_(input) {
  input = input || {};
  var type = String(input.type || 'all').toLowerCase();
  var scope = String(input.scope || 'all').toLowerCase();

  if (['all', 'champions', 'playoffwinners', 'promoted', 'relegated'].indexOf(type) === -1) {
    return { error: 'Invalid type \u2014 use: all, champions, playoffWinners, promoted, relegated' };
  }
  if (['all', 'national', 'north', 'south'].indexOf(scope) === -1) {
    return { error: 'Invalid scope \u2014 use: all, national, north, south' };
  }

  var allMatches, notesRaw;
  try {
    allMatches = csLoadAllMatches_();
    notesRaw = csLoadNotes_();
  } catch (e) { return { error: 'Could not load data: ' + (e.message || String(e)) }; }

  var notesIdx = csBuildNotesIndex_(notesRaw);
  var formatIdx = csBuildFormatIndex_(notesRaw);

  // Build a map of {season: {division: [matches]}}
  var bySeasonDiv = {};
  allMatches.forEach(function(m) {
    if (!bySeasonDiv[m.season]) bySeasonDiv[m.season] = {};
    if (!bySeasonDiv[m.season][m.division]) bySeasonDiv[m.season][m.division] = [];
    bySeasonDiv[m.season][m.division].push(m);
  });

  var seasonKeys = Object.keys(bySeasonDiv).sort();

  // Which divisions to process
  var divMap = { national: ['National'], north: ['North'], south: ['South'], all: ['National', 'North', 'South'] };
  var divList = divMap[scope];

  // Accumulators — key: entity name, value: { club, counts: {...}, seasons: {...} }
  var accum = {};
  function bump(entity, bucket, season, division) {
    if (!entity) return;
    if (!accum[entity]) {
      accum[entity] = {
        club: entity,
        counts: { champions: 0, playoffWinners: 0, promoted: 0, relegated: 0 },
        seasons: { champions: [], playoffWinners: [], promoted: [], relegated: [] }
      };
    }
    accum[entity].counts[bucket]++;
    accum[entity].seasons[bucket].push({ season: season, division: division });
  }

  // Walk each season × division
  seasonKeys.forEach(function(sKey) {
    divList.forEach(function(divCanon) {
      var seasonMatches = bySeasonDiv[sKey][divCanon];
      if (!seasonMatches || !seasonMatches.length) return;

      // Pull shared North/South matches in if needed (for playoff detection)
      var sharedMatches = [];
      if ((divCanon === 'North' || divCanon === 'South') && bySeasonDiv[sKey]['North/South']) {
        sharedMatches = bySeasonDiv[sKey]['North/South'];
      }

      var seasonObj = {
        season: sKey,
        divisions: (function() {
          var d = {};
          d[divCanon] = { matches: seasonMatches };
          if (sharedMatches.length) d['North/South'] = { matches: sharedMatches };
          return d;
        })()
      };

      // Use final-mode league table (no asOf, finalMode=true)
      var lastDate = '9999-12-31';
      var tableResult;
      try {
        tableResult = csComputeLeagueTable_(seasonObj, notesIdx, formatIdx, divCanon, lastDate, true);
      } catch (e) {
        return;  // skip broken seasons silently
      }
      if (!tableResult || !Array.isArray(tableResult.rows)) return;

      tableResult.rows.forEach(function(row) {
        var classes = row.classes || [];
        if (classes.indexOf('champion') !== -1) bump(row.team, 'champions', sKey, divCanon);
        if (classes.indexOf('promoted') !== -1) bump(row.team, 'promoted', sKey, divCanon);
        if (classes.indexOf('relegated') !== -1) bump(row.team, 'relegated', sKey, divCanon);
      });

      // Play-off winners: find the final from the match list
      // We look for matches with playoffs=true where it's the final round,
      // then winner is promoted but not champion
      if (tableResult.playoffWinner) {
        bump(tableResult.playoffWinner, 'playoffWinners', sKey, divCanon);
      }
    });
  });

  // Build ranked lists. v2.5 — response trimmed for token efficiency.
  // Only top 15 per bucket. Seasons list collapses to {count, firstSeason,
  // lastSeason, lastDivision} unless detailed=true.
  var detailed = !!input.detailed;
  function rank(bucket) {
    var rows = Object.keys(accum)
      .filter(function(e) { return accum[e].counts[bucket] > 0; })
      .map(function(e) {
        var seasonEntries = accum[e].seasons[bucket].slice().sort(function(a, b) {
          return a.season.localeCompare(b.season);
        });
        var row = {
          club: accum[e].club,
          count: accum[e].counts[bucket]
        };
        if (detailed) {
          row.seasons = seasonEntries;
        } else {
          // Compact summary
          row.firstSeason = seasonEntries[0].season;
          row.lastSeason = seasonEntries[seasonEntries.length - 1].season;
          // Divisions they did this in (unique list) — useful for "promoted" which
          // might span multiple tiers
          var divs = {};
          seasonEntries.forEach(function(e) { divs[e.division] = true; });
          row.divisions = Object.keys(divs);
        }
        return row;
      });
    rows.sort(function(a, b) {
      return (b.count - a.count) || String(a.club).localeCompare(String(b.club));
    });
    // Cap to top 15 by default — plenty for prose ranking
    return rows.slice(0, 15);
  }

  var result = {
    scope: scope,
    divisions: divList,
    seasonsAnalysed: seasonKeys.length,
    note: 'Top 15 per category. Pass detailed:true for full season-by-season breakdown. Walks all seasons 1979-80 onward. Play-off winners detected via final match (90min > aet > pens) where data permits.'
  };

  if (type === 'all' || type === 'champions') {
    result.champions = rank('champions');
  }
  if (type === 'all' || type === 'playoffwinners') {
    result.playoffWinners = rank('playoffWinners');
  }
  if (type === 'all' || type === 'promoted') {
    result.promoted = rank('promoted');
  }
  if (type === 'all' || type === 'relegated') {
    result.relegated = rank('relegated');
  }

  return result;
}

// =============================================================================
// CHANGELOG (for getChangelog integration)
// =============================================================================
function csGetChangelog_() {
  return [
    {
      version: '2.7',
      date: '18/04/2026',
      changes: [
        'getClubSummary response now echoes the raw `query` string alongside the resolved `club` (canonical entity). Helps Claudio detect when he has silently substituted the user\'s input for a similar club. If the response shows query="Team Bath" but club="Bath City", something has gone wrong and Claudio should surface it.',
        'No functional change to resolution logic; just better response transparency.'
      ]
    },
    {
      version: '2.6',
      date: '18/04/2026',
      changes: [
        'csResolveClub_ hardened with a Pass 0: case-insensitive exact match on a canonical entity name beats any alias lookup. "Team Bath" can no longer silently resolve to "Bath City".',
        'Also adds a word-boundary match pass (\\bteam bath\\b) between startswith and loose substring, so partial queries like "team bath" match precisely rather than fuzzily.',
        'toolGetClubMatches_ rendererPayload capped at 30 matches regardless of limit param. Prevents Claudio hitting output-token limits when copying JSON verbatim. Full `matches` array still in response for prose analysis.',
        'toolGetHeadToHead_ rendererPayload similarly capped at 30. Long rivalries (Altrincham-Kidderminster, 46 meetings) now render a clean 30-row scrollable table rather than a truncated JSON mess.'
      ]
    },
    {
      version: '2.5',
      date: '18/04/2026',
      changes: [
        'Token efficiency pass on the Tier 1 tools. getMostFrequentOpponents was causing rate-limit hits in fresh sessions.',
        'New helper csLoadMatchesForClub_(entities) \u2014 filters during flatten, so club-scoped tools process 95% less data. Used by getMostFrequentOpponents and getClubMatches.',
        'getMostFrequentOpponents: default limit 15\u219210. Tiered response \u2014 top 5 get W/D/L, ranks 6-N get just {opponent, meetings}. Full detail with detailed:true.',
        'getClubMatches: default limit 50\u219225. Uses narrowed loader.',
        'getAllTimeChampions: caps output at top 15 per bucket. Seasons array per club collapses to {firstSeason, lastSeason, divisions} \u2014 full list with detailed:true.',
        'Estimated response size reduction: ~60-70% across the three new tools. Rate-limit pressure much reduced.'
      ]
    },
    {
      version: '2.4',
      date: '18/04/2026',
      changes: [
        'Three new tools added: getMostFrequentOpponents (ranked list of a club\'s most-played opponents), getClubMatches (flat match list with rendererPayload for styled display), getAllTimeChampions (cross-season counts of champions, play-off winners, promoted, relegated).',
        'All three use the shared filter system \u2014 venue, competition, season range, scope, lineage \u2014 so "Altrincham\'s most common North opponents since 2015" works in one call.',
        'getAllTimeChampions walks every season \u00d7 division combination on-demand (5-10s response time). No cache \u2014 accuracy over speed.',
        'getClubMatches replaces the previous missing capability that broke on "show me Team Bath\'s results" \u2014 now returns up to 200 matches with proper summary stats.'
      ]
    },
    {
      version: '2.3',
      date: '17/04/2026',
      changes: [
        'Added dynamic filter parameters to all four club-based tools (getClubSummary, getHeadToHead, getClubStreak, getClubRecords): `venue` (all/home/away/neutral), `competition` (all/league/playoff), `season` (single season key), `seasonFrom`/`seasonTo` (range). All default to "all" \u2014 backwards-compatible when no filters passed.',
        'KEY DEFAULT CHANGE: competition now defaults to "all" (league + playoff combined). H2H used to silently exclude playoffs; now they\'re included unless you explicitly set competition to "league". getLeagueTable unchanged \u2014 standings are always league-only by definition.',
        'All filters compose: "Altrincham\'s home record in the playoffs since 2015" = { venue:home, competition:playoff, seasonFrom:2015-16 } and applies cleanly.',
        'New helpers: csValidateFilters_, csMatchPassesCompetition_, csMatchPassesScope_, csMatchPassesSeasonRange_, csMatchPassesVenue_, csApplyFilters_, csDescribeFilters_. Shared across all four calculators \u2014 single source of truth for filter logic.',
        'Tool responses now include `filters` and `filterDescription` fields so Claudio can confirm back what was queried ("Altrincham\'s home record since 2015-16") without guessing.'
      ]
    },
    {
      version: '2.2',
      date: '17/04/2026',
      changes: [
        'getHeadToHead: added `perspective` parameter (clubA | clubB | neutral). Default is clubA. In neutral mode the rendererPayload result column shows the winning team\'s short name in a coloured cell rather than W/D/L from one side.',
        'getHeadToHead: no longer caps at 5 meetings. Returns all matches up to 100 (newest first), with `meetingsTruncated` flag if there were more. Renderer gets `scrollable: true` hint for 12+ meetings so it max-heights the table in a scroll container.',
        'Added csShortName_ helper for team short names used in neutral-mode cells ("Chester", "Hereford", "Dag & Red" etc).',
        'The `last5Meetings` field is replaced by `allMeetings`. Old field removed from API \u2014 prompt updated so Claudio uses the new field.'
      ]
    },
    {
      version: '2.1',
      date: '17/04/2026',
      changes: [
        'getLeagueTable: full port of v3.38i dashboard logic. Added split playoff-semi/playoff-elim zones (from seasonFormat), playoff winner detection from results.json (90min > aet > pens precedence), clinched-* emphasis for as-of tables (mathematical lock-in check against rivals\' max-possible-points), movement arrows (up/down) for final mode, zone boundaries returned for dotted-divider rendering.',
        'getLeagueTable: response now includes rendererPayload for nl-table fenced block, with rows + zones + deductions + footnotes + playoffWinner metadata. Claudio emits this as a styled HTML table matching the dashboard exactly.',
        'getHeadToHead: added clubAHistory and clubBHistory per-club summaries (seasons in our leagues, first season, last season). Enables Claudio to correctly phrase absence like "haven\'t met in our competitions — Chesterfield last in NL in 2005-06, Mansfield last in 2012-13" instead of the misleading "never met in football".',
        'getHeadToHead: added rendererPayload for nl-table block with last-5 meetings (W/D/L colour-coded).',
        'New helpers: csFindPlayoffWinner_, csApplyClinchedClasses_.'
      ]
    },
    {
      version: '2.0',
      date: '17/04/2026',
      changes: [
        'Added getHeadToHead — all-time record between any two clubs, with both-side phoenix/merger lineage, last-5 meetings, venue/division breakdowns, biggest wins each way.',
        'Added getLeagueTable — derived final table for any historical season/division, with optional asOf date. Ports v3.38i dashboard logic: season-specific points rules, PPG ranking for covid, expulsions, points deductions.',
        'Added getClubStreak — longest wins/unbeaten/losses/winless streaks with all-time, single-season, and season-start modes.',
        'Added getClubRecords — best/worst/notable matches structured by category (biggest wins, heaviest defeats, most goals scored, most goals conceded, highest-scoring games).',
        'Added getStaff — NL staff directory lookup from RTDB with name/role filters. Replaces inline staff list in system prompt.',
        'Added primitive helpers: csIsoNum_, csOrdinal_, csSeasonLabel_, csMatchKey_, csDedupeMatches_, csBuildNotesIndex_, csBuildFormatIndex_, csPerspectiveForMatch_.'
      ]
    },
    {
      version: '1.0',
      date: '17/04/2026',
      changes: [
        'Initial build. Data layer: per-season shard cache of results.json (6hr TTL).',
        'Entity resolution: fuzzy club name match with exact → startswith → substring.',
        'First tool: getClubSummary(club, lineage?, scope?).'
      ]
    }
  ];
}