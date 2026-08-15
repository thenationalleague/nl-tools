/**
 * Claudio — Anthropic API proxy with tool-use support
 * File: ClaudioChat.gs
 * Version: 2.2-alpha
 * Date: 20/04/2026
 *
 * v2.2-alpha: Jacqueline (HR) goes live. 4 new tools:
 *   - getHandbookSection: fetches Company Handbook markdown from private
 *     GitHub repo (thenationalleague/internal-docs) using GITHUB_INTERNAL_TOKEN
 *     in Script Properties. 6hr CacheService caching with automatic chunking
 *     for values over 90KB. Topic matching with synonym expansion.
 *   - getMyHolidayStatus / getMyLieuStatus / getTeamAvailability: read
 *     app-data/staff-holiday-lieu RTDB nodes. Request-scoped CURRENT_USER_UID
 *     global captured in claudioChat() entry point so tools know who is asking.
 *   Triage prompt gains ROUTE:jacqueline token with 4 HR examples.
 *   Validation regex extended. Persona frames updated for 429 handling.
 *
 * v2.1-beta: Minor schema compression pass on Seth tools (getStandings,
 *   getFixtures, getRecentResults, getMatchDetail, getTeamForm, fetchNLSite).
 *   ~60 tokens saved per Seth call. No functional change.
 *
 * v2.1-alpha: SWITCHBOARD REFACTOR. Claudio is now a pure triage router.
 *   New runTriageCall_ makes a tiny classifier call (~500 tokens, no
 *   tools) returning ROUTE:X or SELF:X verdicts. New runSwitchboardTurn_
 *   dispatcher replaces runOrchestratedTurn_:
 *     ROUTE:X  \u2192 specialist called directly (no Claudio wrapper)
 *     SELF:greet \u2192 client-side hardcoded greeting (no second API call)
 *     SELF:*    \u2192 Claudio with full prompt + 2 tools
 *   Handoff markers retired. Saves ~3k tokens per orchestrated turn,
 *   ~3k per simple "hello". Keeps rc3 repeat-tool guard + rc4 429
 *   nudges + cooldown chips.
 *
 * v2.0-rc4: Per-persona 429 nudges + cooldownUntil timestamp in
 *   suggestions. Rate-limit recovery bubbles are now Claudio\'s (not the
 *   specialist\'s), in his Italian voice with "meet me in the archives"
 *   / "press box" / "office" per-persona framing. Chips carry a 45s
 *   cooldownUntil timestamp so the client can render a countdown
 *   instead of firing another 429.
 *
 * v2.0-rc3: Repeat-tool guard. runToolLoop_ tracks which tools errored
 *   this turn and short-circuits repeat calls with the same input.
 *   Prevents the runaway cost we observed where a failing tool got
 *   retried 2-3 times, inflating a single orchestrated turn to 25k+
 *   tokens. Also: tool errors now log to GAS Executions for
 *   diagnosing WHY data tools fail.
 *
 * v2.0-rc2: Friendly 429 handling. When orchestration hits a rate limit
 *   on the specialist Call 2, we detect it (Anthropic 429 in error string)
 *   and render a soft error bubble with a suggestion chip nudging the user
 *   to ask the specialist directly (bypassing orchestration). Chip is
 *   pre-seeded with the user\'s original message so the new direct chat
 *   picks up seamlessly. Claudio\'s own Call 1 429s get similar soft
 *   handling with a triage-screen nudge.
 *
 * v2.0-rc1: Pivot back from theatre. runOrchestratedTurn_ returns to
 *   real two-call orchestration but with smart gating: Call 1 uses
 *   Claudio\'s own slim prompt + only his 2 tools (cheap); Call 2 fires
 *   with the real specialist\'s prompt + tools ONLY when Claudio emits
 *   a <handoff> marker. Simple turns stay single-call. claudio_host
 *   allowlist removed. parseHandoff_ and parsePassBack_ back in active
 *   use; parseVoiceSwitches_ retained as dead code.
 *
 * v2.0-beta: SINGLE-CALL THEATRE. runOrchestratedTurn_ now makes ONE
 *   API call using the claudio_host persona (union of all tools).
 *   Claudio\'s reply is parsed for <voice-switch persona="X">...</voice-switch>
 *   markers and split into segments. Cost halves, latency drops, 429s
 *   disappear. Voice fidelity slightly compressed vs multi-call mode
 *   (accepted trade).
 *   New: parseVoiceSwitches_. Retired: handoff/pass-back marker usage
 *   (functions kept as dead code for potential rollback).
 *   New PERSONA_TOOL_ALLOWLIST key: claudio_host (17 tools union).
 *
 * v2.0-alpha-fix2: rate-limit mitigation for orchestrated turns.
 *   - callAnthropic_ now retries on HTTP 429 with exponential backoff
 *     (3 attempts, 500ms/1500ms/3000ms).
 *   - runOrchestratedTurn_ now inserts a 300ms pause between Claudio\'s
 *     call and the specialist\'s call (and again for any re-route) to
 *     reduce TPM pressure. Belt-and-braces with the retry.
 *
 * v2.0-alpha-fix1: error surfacing fixes. Orchestration errors now log
 *   to GAS Executions AND surface a truncated error string in the visible
 *   reply (instead of generic "hit a snag"). New empty-reply guard for
 *   specialists that successfully return but with no text content.
 *
 * v2.0-alpha: ORCHESTRATED TEAM ARCHITECTURE (Phase A+B of v4.0 design).
 *   claudioChat now supports a personaPrompts map in the request body.
 *   When Claudio is the active persona and personaPrompts is provided,
 *   runOrchestratedTurn_() calls Claudio first, parses <handoff> markers,
 *   invokes the target specialist, handles <pass-back> re-routing
 *   (1 pass max), and returns a segments array for multi-bubble rendering.
 *   Legacy single-persona path (runSinglePersonaTurn_) preserved for
 *   specialist-direct chats.
 *   New helpers: parseHandoff_, parsePassBack_, parseAttrs_,
 *   accumulateUsage_, composeReplyFromSegments_.
 *
 * v1.16: Added getStaff to Mark\'s allowlist so he can resolve staff names
 *        before committing them to drafts. Fixes observed Gartside-invention bug.
 *
 * v1.15: Phase 2 \u2014 Seth goes live. Out-of-scope detector now includes
 *        a "roger" pattern, so if Seth is asked a historical question
 *        (season labels like 2015-16 / 2015/16, "all-time", "ever won",
 *        decade references, "biggest win ever" etc), a chip appears
 *        pointing to Roger. The tool allowlists themselves were already
 *        correct for Seth \u2014 no schema changes needed.
 *
 * v1.14: BUG FIX — Claudio was observed calling getClubSummary despite
 *        not being in his allowlist. Cause unclear (possibly Code.gs
 *        router stripping the persona field, possibly cached schema,
 *        possibly a specific code path we haven't instrumented).
 *        Belt-and-braces fix: runTool_(name, input, persona) now
 *        rejects any tool call not in the persona's allowlist at
 *        dispatch time, regardless of how the schema was built. Also
 *        adds console logging in getToolsSchema_ so we can see the
 *        persona received on each request.
 *
 * v1.13: Out-of-scope suggestion detection. After each reply, the backend
 *        scans the user's latest message for keywords that signal a
 *        different persona should handle it ("lieu", "draft email",
 *        "this season" etc). If detected, returns a `suggestions` array
 *        alongside the reply for the UI to render as a chip below the
 *        message. Currently capped at 1 suggestion per reply. Model can
 *        also emit its own suggestions via prompt; dedup done client-side.
 *
 * v1.12: Persona-aware tool filtering. claudioChat() now accepts a
 *        `persona` field in the request body (default "claudio"). That
 *        value threads through runToolLoop_ → callAnthropic_ →
 *        getToolsSchema_(persona), which filters the 20-tool catalogue
 *        to a per-persona allowlist. PERSONA_TOOL_ALLOWLIST defines the
 *        subsets: Claudio = 2 (getStaff, fetchNLSite); Roger = 14
 *        historical + getStandings read; Seth = 5 live; Mark = 0;
 *        Jacqueline = 1. This dramatically reduces per-request tool
 *        schema weight when a persona only needs a subset. Rename of
 *        getToolsSchema_() to _getAllToolsSchema_() (internal) for the
 *        full catalogue; public getToolsSchema_(persona) returns the
 *        filtered view.
 *
 * v1.11: Five new tool schemas + dispatch entries for ClaudioStats.gs v2.8:
 *        getMatchesByCalendarDate, getMatchesByDayOfWeek, getMatchesByCalendarYear,
 *        getAllTimeMatchRecords, getPlayoffs. All schemas kept compact (~220
 *        tokens each) to preserve the v1.10 rate-limit gains. Tool count
 *        15 \u2192 20. Total schema size still under 4.6k tokens.
 *
 * v1.10: EMERGENCY PATCH. Tool schema descriptions were bloated to
 *        ~6.6k tokens (sent on EVERY request), causing rate-limit
 *        hits on fresh sessions. Compressed all 15 tool descriptions
 *        to ~3.4k tokens total. Filter-composition guidance moved out
 *        of schemas (where it was duplicated 7x) into a single block
 *        in the system prompt. No functional changes \u2014 params and
 *        dispatch unchanged. Saves ~3k tokens per request.
 *
 * v1.9: Schema updates to match ClaudioStats.gs v2.5 efficiency pass:
 *       getMostFrequentOpponents default limit 15\u219210, new `detailed`
 *       flag. getClubMatches default limit 50\u219225. getAllTimeChampions
 *       now caps at top 15 per category; new `detailed` flag for full
 *       season-by-season output.
 *
 * v1.8: Three new tool schemas added to the registry and dispatch switch:
 *       getMostFrequentOpponents, getClubMatches, getAllTimeChampions.
 *       Total tool surface now 15 tools (6 live + 6 historical club-based
 *       + 3 new cross-cutting + staff + site fetch).
 *
 * v1.7: Added dynamic filter params (venue, competition, season, seasonFrom,
 *       seasonTo) to all four club-based tool schemas: getClubSummary,
 *       getHeadToHead, getClubStreak, getClubRecords. Competition default
 *       changed to "all" (league + play-offs) \u2014 previously H2H silently
 *       excluded play-offs. NLS purge: sanitised user-facing error strings
 *       and tool-param descriptions so Claudio never surfaces "NLS" to users.
 *
 * v1.6: getHeadToHead schema gains a `perspective` parameter (clubA | clubB |
 *       neutral). Description expanded to guide Claudio on detecting the
 *       right framing from the user's phrasing.
 *
 * v1.5: Updated getLeagueTable and getHeadToHead tool descriptions to
 *       mention the new rendererPayload field and the nl-table fenced
 *       block protocol for Claudio emitting styled HTML tables.
 *
 * v1.4: Added 5 new historical-stats tools (getHeadToHead, getLeagueTable,
 *       getClubStreak, getClubRecords, getStaff) registered against the
 *       ClaudioStats.gs v2.0 engine. Full Claudio tool surface is now 12 tools.
 *
 * v1.3: Added getClubSummary tool — Claudio's first historical-stats tool.
 *       Computed from results.json + clubs-meta.json + season-notes.json via
 *       the new ClaudioStats.gs engine. Returns flat summary: seasons played,
 *       division breakdown, overall W/D/L/GF/GA/GD/winRate, first/last season,
 *       and any available phoenix/merger lineage the user can opt in.
 *
 * v1.2: Added firebaseRestURL_() and getFirebaseSecret_() helpers that the
 *       usage-tracking functions were calling. Previous v1.1 build assumed
 *       these existed in utils.gs but they did not, so every chat message
 *       hit a runtime error. No behaviour change — just the missing plumbing.
 *
 * v1.1: Adds tool-use to the v1.0 chat proxy:
 *   - 6 NLS data tools (on-the-fly aggregation from NLS API)
 *   - 1 domain-locked web fetch (thenationalleague.org.uk only)
 *
 * Aggregations happen in-memory here before results are returned to Claude,
 * so Claude never sees raw 500KB match lists. Keeps token costs sane.
 *
 * CACHING STRATEGY
 * ----------------
 * NLS match-list fetches are the expensive operation. We cache the raw
 * response in CacheService (5 min TTL). Any tool that needs match data
 * goes through fetchMatches_() which reads the cache first. This means
 * if a user asks "what's the table?" then "what's the top scorer?" within
 * the same 5-min window, the second call is free.
 *
 * TOOL-USE LOOP
 * -------------
 * Claude may request up to 3 tool calls per user message (MAX_TOOL_TURNS).
 * The flow is:
 *   1. Client sends user message + conversation history
 *   2. We call Anthropic API with tools array
 *   3. If stop_reason === 'tool_use', we run the requested tool(s),
 *      append results to messages, call API again
 *   4. Loop until stop_reason === 'end_turn' or cap reached
 *   5. Accumulate token usage across all iterations for billing
 *
 * If a tool fails, we return {error: "..."} as the tool result so Claude
 * can apologise gracefully rather than hallucinate.
 *
 * Deployment: this file is called from Code.gs's doPost router when
 * action === 'claudio'. No direct URL — always through the main router.
 *
 * Script properties required:
 *   CLAUDIO_ANTHROPIC_KEY — dedicated Anthropic API key (not shared with
 *   other tools, kept separate for billing visibility)
 */

// =============================================================================
// CONFIG
// =============================================================================
var CLAUDIO_MODEL            = 'claude-haiku-4-5-20251001';
var CLAUDIO_MAX_TOKENS       = 2048;
var CLAUDIO_DAILY_CAP        = 50;
var CLAUDIO_RATE_WINDOW_SEC  = 60;
var CLAUDIO_RATE_MAX         = 10;
var USD_TO_GBP               = 0.78;

// Haiku 4.5 pricing per million tokens (verified 17/04/2026)
var PRICE_INPUT_USD          = 1.00;
var PRICE_OUTPUT_USD         = 5.00;
var PRICE_CACHE_READ_USD     = 0.10;
var PRICE_CACHE_WRITE_USD    = 1.25;

// Tool-use configuration
var MAX_TOOL_TURNS           = 3;      // cap on tool-use iterations per message
var NLS_CACHE_TTL_SEC        = 300;    // 5 minutes — NLS match-list cache
var WEB_FETCH_CACHE_TTL_SEC  = 600;    // 10 minutes — web page cache

// NLS API
var NLS_BASE                 = 'https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2';
var NLS_SEASON_ID            = 2025;   // 2025/26 season — bump to 2026 next August
var NLS_COMPS = {
  nl:    { id: 89,  label: 'National League',       teamCount: 24 },
  north: { id: 373, label: 'National League North', teamCount: 24 },
  south: { id: 372, label: 'National League South', teamCount: 24 }
};

// Web fetch — domain allowlist. Only fetches to this host are permitted.
var WEB_FETCH_ALLOWED_HOST   = 'www.thenationalleague.org.uk';

// v4.2: Request-scoped identity context for Jacqueline HR tools.
// Set in claudioChat() on every request. GAS executes each request in a
// fresh V8 isolate so there\'s no cross-request leakage.
var CURRENT_USER_UID  = null;
var CURRENT_USER_NAME = null;

// =============================================================================
// ENTRY POINT — called by Code.gs router when action === 'claudio'
// =============================================================================
function claudioChat(body) {
  try {
    var uid      = body.uid;
    var name     = body.name     || 'User';
    var email    = body.email    || '';
    var messages = body.messages || [];
    var system   = body.system   || '';
    var persona  = body.persona  || 'claudio';
    // v4.0-alpha: personaPrompts is a map of {personaKey: systemPrompt} that
    // the client sends so the backend can invoke any specialist mid-turn
    // when Claudio emits a <handoff> marker. If missing, orchestration is
    // disabled and the backend behaves as v3.x (single-persona-per-turn).
    var personaPrompts = body.personaPrompts || null;

    if (!uid)                   return { ok: false, error: 'Missing uid' };
    if (!messages.length)       return { ok: false, error: 'Missing messages' };
    if (!system)                return { ok: false, error: 'Missing system prompt' };

    // v4.2: stash identity context for tools that need it (Jacqueline HR tools).
    // Request-scoped \u2014 GAS runs each request in a fresh execution, so no state leak.
    CURRENT_USER_UID  = uid;
    CURRENT_USER_NAME = name;

    var apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDIO_ANTHROPIC_KEY');
    if (!apiKey) return { ok: false, error: 'API key not configured' };

    var isAdmin = body.isAdmin === true;
    var usage   = getUsage_(uid);
    if (!isAdmin && usage.count >= CLAUDIO_DAILY_CAP) {
      return {
        ok: false,
        error: 'Daily message limit reached (' + CLAUDIO_DAILY_CAP + '). Resets at midnight UK time.',
        count: usage.count,
        cost_pence: usage.cost_pence
      };
    }

    if (!checkRate_(uid)) {
      return { ok: false, error: 'Too many messages too fast. Wait a moment.' };
    }

    // v4.1-alpha: switchboard dispatch. Triage first, then route to
    // specialist / Claudio-self / hardcoded greeting.
    var orchResult;
    if (persona === 'claudio' && personaPrompts && Object.keys(personaPrompts).length > 0) {
      orchResult = runSwitchboardTurn_(apiKey, system, messages, personaPrompts);
    } else {
      orchResult = runSinglePersonaTurn_(apiKey, system, messages, persona);
    }

    if (!orchResult.ok) {
      return { ok: false, error: orchResult.error };
    }

    var costPence = computeCostPence_(orchResult.usage);
    recordUsage_(uid, costPence, orchResult.usage);

    var userLastMsg = '';
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && typeof messages[i].content === 'string') {
        userLastMsg = messages[i].content;
        break;
      }
    }
    // v4.0-rc2: if the orchestrator produced suggestions (e.g. a 429 nudge),
    // those take precedence over out-of-scope detection \u2014 they\'re more
    // actionable for the user right now. Seed any empty-seed suggestion
    // with the user\'s original message so the specialist-direct chat
    // picks up where Claudio left off.
    var suggestions;
    if (orchResult.suggestions && orchResult.suggestions.length) {
      suggestions = orchResult.suggestions.map(function(s) {
        if (!s.seededPrompt && userLastMsg) s.seededPrompt = userLastMsg;
        return s;
      });
    } else {
      suggestions = detectOutOfScope_(orchResult.finalPersona || persona, userLastMsg);
    }

    return {
      ok:           true,
      reply:        orchResult.reply,
      persona:      orchResult.finalPersona || persona,
      segments:     orchResult.segments || null,
      specialReply: orchResult.specialReply || null,   // v4.1: 'hardcoded_greeting' etc
      cost_pence:   costPence,
      tokens: {
        input:       orchResult.usage.input_tokens       || 0,
        output:      orchResult.usage.output_tokens      || 0,
        cache_read:  orchResult.usage.cache_read_input_tokens  || 0,
        cache_write: orchResult.usage.cache_creation_input_tokens || 0
      },
      tool_calls:   orchResult.toolCalls,
      suggestions:  suggestions,
      count:        usage.count + 1,
      cost_today:   usage.cost_pence + costPence
    };
  } catch (err) {
    return { ok: false, error: 'Claudio error: ' + (err.message || err) };
  }
}

// v4.1-alpha: switchboard triage. Tiny classifier call with no tools.
// Returns one of:
//   ROUTE:roger | ROUTE:seth | ROUTE:mark
//   SELF:greet   (hardcoded client-side greeting, no second API call)
//   SELF:staff   (Claudio calls getStaff himself)
//   SELF:procedural (Claudio answers from knowledge \u2014 NL operations, his role)
//   SELF:chat    (general chat, thanks, summarising pasted text, brainstorm)
//   SELF:unknown (safe fallback \u2014 Claudio decides)
//
// Cost target: ~500 tokens per call. Prompt is deliberately minimal.
function runTriageCall_(apiKey, messages) {
  var triagePrompt = [
    'You are a TRIAGE ROUTER for an internal tool at The National League (English football\'s fifth tier).',
    '',
    'Read the LATEST user message in the conversation and output EXACTLY ONE routing token. Output nothing else \u2014 no explanation, no quotes, no punctuation. Just the token.',
    '',
    'ROUTING TOKENS:',
    '- ROUTE:roger  \u2014 historical football data: past seasons (1979 to 2024-25), all-time records, league tables, head-to-heads, streaks, club records, playoffs. Anything "how did X do in Y", "biggest wins in YYYY", "who\'s won most titles", "historical match records".',
    '- ROUTE:seth   \u2014 THIS SEASON live data: current league standings, fixtures (upcoming), recent results (last weeks), current team form, match goalscorers. Anything with "this season", "currently", "last weekend", "recent form", "now".',
    '- ROUTE:mark   \u2014 drafting/writing tasks: emails, letters, press notes, LinkedIn posts, statements, internal comms, editing text for onward use. Anything like "draft", "write me", "put together a note", "edit this".',
    '- ROUTE:jacqueline \u2014 HR topics: holiday, lieu/TOIL, sickness, expenses, maternity/paternity, grievance, disciplinary, probation, hybrid working, any Company Handbook policy question. Also personal balance queries: "how many holidays have I got left", "how much lieu do I have", "is Tom off next week", "who\'s on leave Friday". Anything about company policy, personal leave balances, or team availability.',
    '- SELF:greet   \u2014 pure greetings: "hello", "hi", "morning", "hey", "ciao", with no actual question attached.',
    '- SELF:staff   \u2014 asking who someone is at NL, their role, who handles X: "who is Phil?", "who\'s the CEO?", "who handles comms?", "who\'s my line manager?".',
    '- SELF:procedural \u2014 NL operations: "when does the season start?", "how does promotion work?", "what divisions are there?". General NL knowledge.',
    '- SELF:chat    \u2014 thanks, acknowledgments, chitchat, brainstorming, summarising pasted text, general conversation not covered above.',
    '- SELF:unknown \u2014 if you genuinely can\'t tell. Rare.',
    '',
    'EXAMPLES:',
    'User: "hello"  \u2192  SELF:greet',
    'User: "what were the biggest wins in 2002-03"  \u2192  ROUTE:roger',
    'User: "how\'s Altrincham doing this season"  \u2192  ROUTE:seth',
    'User: "draft me an email to Phil about Saturday"  \u2192  ROUTE:mark',
    'User: "how many holidays have I got left"  \u2192  ROUTE:jacqueline',
    'User: "what\'s the TOIL policy"  \u2192  ROUTE:jacqueline',
    'User: "is Tom off next week"  \u2192  ROUTE:jacqueline',
    'User: "what\'s the sickness procedure"  \u2192  ROUTE:jacqueline',
    'User: "who is Michaela"  \u2192  SELF:staff',
    'User: "when does the season start"  \u2192  SELF:procedural',
    'User: "thanks"  \u2192  SELF:chat',
    'User: "who\'s won the most league titles"  \u2192  ROUTE:roger',
    'User: "what\'s the fixture list for next week"  \u2192  ROUTE:seth',
    'User: "can you write me a LinkedIn post announcing the new fixture"  \u2192  ROUTE:mark',
    '',
    'Output ONLY the token. Nothing else.'
  ].join('\n');

  // Use a very tight max_tokens ceiling to prevent any verbose output
  var payload = {
    model: CLAUDIO_MODEL,
    max_tokens: 20,
    system: triagePrompt,
    messages: messages
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload)
  };

  try {
    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
    var code = res.getResponseCode();
    if (code !== 200) {
      return {
        ok: false,
        error: 'Triage ' + code + ': ' + res.getContentText().substring(0, 200),
        usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
      };
    }
    var data = JSON.parse(res.getContentText());
    var text = '';
    for (var i = 0; i < (data.content || []).length; i++) {
      if (data.content[i].type === 'text') text += data.content[i].text;
    }
    // Clean the token \u2014 strip whitespace/newlines
    var verdict = text.trim().split(/\s+/)[0] || 'SELF:unknown';
    // Validate verdict format
    var valid = /^(ROUTE|SELF):(roger|seth|mark|jacqueline|greet|staff|procedural|chat|unknown)$/.test(verdict);
    if (!valid) {
      console.log('[Triage] invalid verdict: "' + verdict + '" \u2014 falling back to SELF:unknown');
      verdict = 'SELF:unknown';
    }
    return {
      ok: true,
      verdict: verdict,
      usage: data.usage || { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    };
  } catch (e) {
    return {
      ok: false,
      error: 'Triage exception: ' + (e.message || String(e)),
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    };
  }
}

// v4.1-alpha: switchboard dispatcher. Runs triage first, then
// dispatches to the correct handler. Replaces the handoff-marker-based
// orchestration of v4.0.
//
// Returns a shape compatible with runOrchestratedTurn_ so claudioChat
// doesn\'t need to know which version it\'s using.
function runSwitchboardTurn_(apiKey, claudioSystem, messages, personaPrompts) {
  var accUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0
  };

  // Step 1: triage
  var triage = runTriageCall_(apiKey, messages);
  if (!triage.ok) {
    console.log('[Switchboard] triage failed: ' + triage.error + ' \u2014 falling back to Claudio full');
    // Fall through with unknown verdict
    triage = { ok: true, verdict: 'SELF:unknown', usage: triage.usage };
  }
  accumulateUsage_(accUsage, triage.usage);

  var verdict = triage.verdict;
  console.log('[Switchboard] verdict: ' + verdict);

  // Step 2a: hardcoded greeting \u2014 client handles it, no second API call
  if (verdict === 'SELF:greet') {
    return {
      ok: true,
      reply: '',
      segments: [],
      usage: accUsage,
      toolCalls: [],
      finalPersona: 'claudio',
      specialReply: 'hardcoded_greeting'   // client picks from pool
    };
  }

  // Step 2b: route to specialist
  if (verdict.indexOf('ROUTE:') === 0) {
    var targetPersona = verdict.split(':')[1];
    var targetPrompt = personaPrompts ? personaPrompts[targetPersona] : null;

    if (!targetPrompt) {
      console.log('[Switchboard] no prompt for ' + targetPersona + ', falling back to Claudio');
      // Fall through to Claudio-self
    } else {
      var specialistResult = runToolLoop_(apiKey, targetPrompt, messages, targetPersona);

      if (!specialistResult.ok) {
        console.log('[Switchboard] specialist ' + targetPersona + ' failed: ' + specialistResult.error);

        // 429-specific recovery \u2014 same per-persona nudge as v4.0-rc4
        var is429 = (specialistResult.error || '').indexOf('Anthropic 429') !== -1 ||
                    (specialistResult.error || '').indexOf('rate_limit') !== -1;

        if (is429) {
          var personaFrames = {
            roger: {
              claudioLine: 'Ah, senti \u2014 the system\'s moving a bit quick just now. Give it a moment, then pop through to Roger in the archives \u2014 he\'ll have the ledger ready for you.',
              chipLabel: 'To the archives \u2192'
            },
            seth: {
              claudioLine: 'Allora, the wires are a touch busy. Just a moment, then head over to the press box \u2014 Seth will have the feed up.',
              chipLabel: 'To the press box \u2192'
            },
            mark: {
              claudioLine: 'Eh, the system wants a breath. Give it a moment, then come through to Mark\'s office \u2014 he\'ll get the draft started.',
              chipLabel: 'To Mark\'s office \u2192'
            },
            jacqueline: {
              claudioLine: 'Allora, the system\'s paused for a moment. Give it a breath then head over to Jacqueline \u2014 she\'ll have the handbook ready.',
              chipLabel: 'To HR \u2192'
            }
          };
          var frame = personaFrames[targetPersona] || {
            claudioLine: 'Ah \u2014 the system\'s busy. Try again in a moment.',
            chipLabel: 'Go direct \u2192'
          };
          var cooldownUntil = Date.now() + (45 * 1000);
          return {
            ok: true,
            reply: frame.claudioLine,
            segments: [{ persona: 'claudio', content: frame.claudioLine, kind: 'error' }],
            usage: accUsage,
            toolCalls: [],
            finalPersona: 'claudio',
            suggestions: [{
              persona: targetPersona,
              label: frame.chipLabel,
              seededPrompt: '',
              cooldownUntil: cooldownUntil
            }]
          };
        }

        // Non-429 error \u2014 render debug bubble
        return {
          ok: true,
          reply: 'Sorry \u2014 I hit a snag. (Debug: ' + (specialistResult.error || 'unknown').substring(0, 120) + ')',
          segments: [{ persona: targetPersona, content: 'Sorry \u2014 I hit a snag pulling that together.', kind: 'error' }],
          usage: accUsage,
          toolCalls: [],
          finalPersona: targetPersona
        };
      }

      accumulateUsage_(accUsage, specialistResult.usage);
      return {
        ok: true,
        reply: specialistResult.reply || '',
        segments: [{ persona: targetPersona, content: specialistResult.reply || '', kind: 'answer' }],
        usage: accUsage,
        toolCalls: specialistResult.toolCalls || [],
        finalPersona: targetPersona
      };
    }
  }

  // Step 2c: Claudio-self (staff / procedural / chat / unknown)
  // Call with his full prompt + his own 2 tools
  var claudioResult = runToolLoop_(apiKey, claudioSystem, messages, 'claudio');
  if (!claudioResult.ok) {
    console.log('[Switchboard] Claudio-self failed: ' + claudioResult.error);

    var is429Claudio = (claudioResult.error || '').indexOf('Anthropic 429') !== -1 ||
                       (claudioResult.error || '').indexOf('rate_limit') !== -1;
    if (is429Claudio) {
      var busyLine = 'Ah \u2014 the system\'s a bit busy right now. Give it a few moments and try again.';
      return {
        ok: true,
        reply: busyLine,
        segments: [{ persona: 'claudio', content: busyLine, kind: 'error' }],
        usage: accUsage,
        toolCalls: [],
        finalPersona: 'claudio'
      };
    }
    return { ok: false, error: 'Claudio failed: ' + claudioResult.error };
  }

  accumulateUsage_(accUsage, claudioResult.usage);
  return {
    ok: true,
    reply: claudioResult.reply || '',
    segments: [{ persona: 'claudio', content: claudioResult.reply || '', kind: 'answer' }],
    usage: accUsage,
    toolCalls: claudioResult.toolCalls || [],
    finalPersona: 'claudio'
  };
}

// v4.0-alpha: legacy single-persona path \u2014 same as v3.x.
// Wrap runToolLoop_ and return in the same shape as runOrchestratedTurn_.
function runSinglePersonaTurn_(apiKey, system, messages, persona) {
  var loop = runToolLoop_(apiKey, system, messages, persona);
  if (!loop.ok) return loop;
  return {
    ok: true,
    reply: loop.reply,
    segments: [{ persona: persona, content: loop.reply, kind: 'answer' }],
    usage: loop.usage,
    toolCalls: loop.toolCalls,
    finalPersona: persona
  };
}

// v4.0-rc1: SMART-GATED two-call orchestration. Claudio runs with his
// OWN prompt + ONLY his 2 tools (cheap). His prompt instructs him to
// emit <handoff persona="X" theatrical="yes|no">intro</handoff> when
// the question needs a specialist. If present, we fire Call 2 with the
// specialist\'s real system prompt + real tool allowlist. Full specialist
// fidelity restored; simple turns stay cheap.
//
// Cost profile:
//   - Simple "hello" or staff lookup: 1 call, ~3,500 tokens
//   - Orchestrated specialist question: 2 calls, ~7,500 tokens
//   - Failed / mis-routed: 2-3 calls
//
// Input: personaPrompts = {roger, seth, mark} from client
// Returns: {ok, reply, segments, usage, toolCalls, finalPersona}
function runOrchestratedTurn_(apiKey, system, messages, personaPrompts) {
  var accUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0
  };
  var allToolCalls = [];
  var segments = [];

  // Call 1: Claudio with his own prompt + only his 2 tools (cheap)
  var claudioResult = runToolLoop_(apiKey, system, messages, 'claudio');
  if (!claudioResult.ok) {
    console.log('[Orchestration] claudio failed: ' + (claudioResult.error || '(no error)'));

    // v4.0-rc2: even Claudio\'s own call can 429 if budget is exhausted.
    // Return a friendlier reply rather than a hard error, with a general
    // nudge to use specialists directly via the triage screen.
    var is429Claudio = (claudioResult.error || '').indexOf('Anthropic 429') !== -1 ||
                       (claudioResult.error || '').indexOf('rate_limit') !== -1;
    if (is429Claudio) {
      return {
        ok: true,
        reply: 'Ah \u2014 the system\'s a bit busy right now. Could you try again in a moment? Or click "New chat" and pick a specialist card directly \u2014 that bypasses me entirely.',
        segments: [{
          persona: 'claudio',
          content: 'Ah \u2014 the system\'s a bit busy right now. Could you try again in a moment? Or click "New chat" and pick a specialist card directly \u2014 that bypasses me entirely.',
          kind: 'error'
        }],
        usage: accUsage,
        toolCalls: [],
        finalPersona: 'claudio'
      };
    }
    return { ok: false, error: 'Claudio failed: ' + claudioResult.error };
  }
  accumulateUsage_(accUsage, claudioResult.usage);
  allToolCalls = allToolCalls.concat(claudioResult.toolCalls || []);

  var claudioReply = claudioResult.reply || '';
  var handoff = parseHandoff_(claudioReply);

  // No handoff \u2014 Claudio answered himself. Single-call turn, done.
  if (!handoff) {
    segments.push({ persona: 'claudio', content: claudioReply, kind: 'answer' });
    return {
      ok: true,
      reply: claudioReply,
      segments: segments,
      usage: accUsage,
      toolCalls: allToolCalls,
      finalPersona: 'claudio'
    };
  }

  // Handoff emitted. If theatrical, capture Claudio\'s intro line as its
  // own segment; if silent, no Claudio bubble appears.
  var claudioIntro = handoff.theatrical ? (handoff.introText || '').trim() : '';
  if (claudioIntro) {
    segments.push({ persona: 'claudio', content: claudioIntro, kind: 'intro' });
  }

  var targetPersona = handoff.persona;
  var targetPrompt = personaPrompts ? personaPrompts[targetPersona] : null;

  if (!targetPrompt) {
    // Client didn\'t send the prompt for this persona. Fallback to Claudio\'s reply.
    console.log('[Orchestration] no prompt available for ' + targetPersona + ', falling back to Claudio');
    segments.push({
      persona: 'claudio',
      content: claudioIntro || 'I\'d hand that to a colleague, but I can\'t reach them right now. Try again?',
      kind: 'answer'
    });
    return {
      ok: true,
      reply: composeReplyFromSegments_(segments),
      segments: segments,
      usage: accUsage,
      toolCalls: allToolCalls,
      finalPersona: 'claudio'
    };
  }

  // Call 2: real specialist with their own prompt + real tool allowlist.
  // Small delay to reduce TPM pressure on successive calls.
  Utilities.sleep(300);
  var specialistResult = runToolLoop_(apiKey, targetPrompt, messages, targetPersona);
  if (!specialistResult.ok) {
    console.log('[Orchestration] specialist ' + targetPersona + ' failed: ' + (specialistResult.error || '(no error)'));

    // v4.0-rc4: detect 429 specifically. Render the nudge as a CLAUDIO
    // bubble (it\'s him apologising, not the specialist), with per-persona
    // "come to my space" framing. The suggestion chip includes a cooldown
    // timestamp so the client can render a countdown rather than firing
    // a call that will also 429.
    var is429 = (specialistResult.error || '').indexOf('Anthropic 429') !== -1 ||
                (specialistResult.error || '').indexOf('rate_limit') !== -1;

    if (is429) {
      // Per-persona "come to my space" framing. Claudio speaks in Italian
      // voice; specialist teaser comes at the end in their register.
      var personaFrames = {
        roger: {
          claudioLine: 'Ah, senti \u2014 the system\'s moving a bit quick just now. Give it a moment, then pop through to Roger in the archives \u2014 he\'ll have the ledger ready for you.',
          chipLabel: 'To the archives \u2192'
        },
        seth: {
          claudioLine: 'Allora, the wires are a touch busy. Just a moment, then head over to the press box \u2014 Seth will have the feed up.',
          chipLabel: 'To the press box \u2192'
        },
        mark: {
          claudioLine: 'Eh, the system wants a breath. Give it a moment, then come through to Mark\'s office \u2014 he\'ll get the draft started.',
          chipLabel: 'To Mark\'s office \u2192'
        },
        jacqueline: {
          claudioLine: 'Ah, just a moment \u2014 things are busy. Head through to Jacqueline when you\'re ready.',
          chipLabel: 'To HR \u2192'
        }
      };
      var frame = personaFrames[targetPersona] || {
        claudioLine: 'Ah \u2014 the system\'s a bit busy. Try again in a moment, or tap the card below to go direct.',
        chipLabel: 'Go direct \u2192'
      };

      // 45-second cooldown \u2014 Anthropic TPM resets on a rolling per-minute
      // basis, so 45s gives a safety margin before the chip fires.
      var COOLDOWN_MS = 45 * 1000;
      var cooldownUntil = Date.now() + COOLDOWN_MS;

      // Nudge bubble is CLAUDIO\'s (replaces any prior intro segment).
      // If Claudio had an intro segment, use that AND add the nudge line;
      // otherwise just the nudge.
      segments = segments.filter(function(s) { return s.kind !== 'intro'; });
      segments.push({
        persona: 'claudio',
        content: (claudioIntro ? claudioIntro + '\n\n' : '') + frame.claudioLine,
        kind: 'error'
      });

      return {
        ok: true,
        reply: composeReplyFromSegments_(segments),
        segments: segments,
        usage: accUsage,
        toolCalls: allToolCalls,
        finalPersona: 'claudio',
        suggestions: [{
          persona: targetPersona,
          label: frame.chipLabel,
          seededPrompt: '',                 // will be filled with userLastMsg in claudioChat
          cooldownUntil: cooldownUntil      // v4.0-rc4: client renders countdown until this timestamp
        }]
      };
    } else {
      segments.push({
        persona: targetPersona,
        content: 'Sorry \u2014 I hit a snag pulling that together. (Debug: ' +
                 (specialistResult.error || 'unknown error').substring(0, 120) + ')',
        kind: 'error'
      });
    }
    return {
      ok: true,
      reply: composeReplyFromSegments_(segments),
      segments: segments,
      usage: accUsage,
      toolCalls: allToolCalls,
      finalPersona: targetPersona
    };
  }

  // Empty-reply guard
  if (!specialistResult.reply || !specialistResult.reply.trim()) {
    console.log('[Orchestration] specialist ' + targetPersona + ' returned empty reply');
    accumulateUsage_(accUsage, specialistResult.usage);
    segments.push({
      persona: targetPersona,
      content: 'Sorry \u2014 I couldn\'t put together a reply. Could you try asking differently?',
      kind: 'error'
    });
    return {
      ok: true,
      reply: composeReplyFromSegments_(segments),
      segments: segments,
      usage: accUsage,
      toolCalls: allToolCalls,
      finalPersona: targetPersona
    };
  }

  accumulateUsage_(accUsage, specialistResult.usage);
  allToolCalls = allToolCalls.concat(specialistResult.toolCalls || []);

  // Check for pass-back (specialist mis-routed \u2014 give one re-route chance)
  var passBack = parsePassBack_(specialistResult.reply);
  if (!passBack) {
    segments.push({ persona: targetPersona, content: specialistResult.reply, kind: 'answer' });
    return {
      ok: true,
      reply: composeReplyFromSegments_(segments),
      segments: segments,
      usage: accUsage,
      toolCalls: allToolCalls,
      finalPersona: targetPersona
    };
  }

  // Pass-back detected. Render the pass-back line, then fire Call 3.
  var passBackText = (passBack.introText || '').trim();
  if (passBackText) {
    segments.push({ persona: targetPersona, content: passBackText, kind: 'passback' });
  }

  var reroutePersona = passBack.toPersona;
  var reroutePrompt = personaPrompts ? personaPrompts[reroutePersona] : null;
  if (!reroutePrompt || reroutePersona === targetPersona) {
    return {
      ok: true,
      reply: composeReplyFromSegments_(segments),
      segments: segments,
      usage: accUsage,
      toolCalls: allToolCalls,
      finalPersona: targetPersona
    };
  }

  Utilities.sleep(300);
  var rerouteResult = runToolLoop_(apiKey, reroutePrompt, messages, reroutePersona);
  if (!rerouteResult.ok) {
    segments.push({
      persona: reroutePersona,
      content: 'Sorry \u2014 I hit a snag pulling that together.',
      kind: 'error'
    });
    return {
      ok: true,
      reply: composeReplyFromSegments_(segments),
      segments: segments,
      usage: accUsage,
      toolCalls: allToolCalls,
      finalPersona: reroutePersona
    };
  }
  accumulateUsage_(accUsage, rerouteResult.usage);
  allToolCalls = allToolCalls.concat(rerouteResult.toolCalls || []);

  segments.push({
    persona: reroutePersona,
    content: rerouteResult.reply || '',
    kind: 'answer'
  });

  return {
    ok: true,
    reply: composeReplyFromSegments_(segments),
    segments: segments,
    usage: accUsage,
    toolCalls: allToolCalls,
    finalPersona: reroutePersona
  };
}

// Parse a Claudio reply that may contain <voice-switch persona="X">...</voice-switch>
// markers. Kept for backwards compat but NOT used in v4.0-rc1 \u2014 we\'re back
// to handoff-based real orchestration. Retained as dead code for potential
// future use if a hybrid mode is wanted.
function parseVoiceSwitches_(text) {
  if (!text) return [];

  var segments = [];
  var cursor = 0;
  var re = /<voice-switch\s+([^>]*)>([\s\S]*?)<\/voice-switch>/gi;
  var m;

  while ((m = re.exec(text)) !== null) {
    // Any Claudio text before this marker
    if (m.index > cursor) {
      var pre = text.substring(cursor, m.index).trim();
      if (pre) {
        segments.push({
          persona: 'claudio',
          content: pre,
          kind: segments.length === 0 ? 'intro' : 'bridge'
        });
      }
    }

    // The voice-switched segment
    var attrs = parseAttrs_(m[1]);
    var speaker = (attrs.persona || '').toLowerCase();
    var inner = (m[2] || '').trim();
    if (speaker && inner) {
      segments.push({
        persona: speaker,
        content: inner,
        kind: 'answer'
      });
    }

    cursor = m.index + m[0].length;
  }

  // Any Claudio text after the last marker
  if (cursor < text.length) {
    var post = text.substring(cursor).trim();
    if (post) {
      segments.push({
        persona: 'claudio',
        content: post,
        kind: segments.length === 0 ? 'answer' : 'outro'
      });
    }
  }

  // If there were NO markers at all, treat whole reply as one Claudio answer
  if (segments.length === 0 && text.trim()) {
    segments.push({ persona: 'claudio', content: text.trim(), kind: 'answer' });
  }

  return segments;
}

// Parse <handoff persona="X" theatrical="yes|no">intro text</handoff> from a reply.
// Returns {persona, theatrical, introText, remainder} or null if no handoff.
// (Kept for potential fallback; no longer used in v4.0-beta theatre mode.)
// Intro text is everything BEFORE + INSIDE the tag (Claudio may have set the
// scene before the tag). Remainder is anything after the closing tag.
function parseHandoff_(text) {
  if (!text) return null;
  var match = text.match(/<handoff\s+([^>]*)>([\s\S]*?)<\/handoff>/i);
  if (!match) {
    // Also accept self-closing: <handoff persona="X" theatrical="no" />
    var selfClose = text.match(/<handoff\s+([^\/>]*)\/>/i);
    if (!selfClose) return null;
    var attrs = parseAttrs_(selfClose[1]);
    return {
      persona: (attrs.persona || '').toLowerCase(),
      theatrical: (attrs.theatrical || 'no').toLowerCase() === 'yes',
      introText: text.substring(0, selfClose.index).trim(),
      remainder: text.substring(selfClose.index + selfClose[0].length).trim()
    };
  }
  var attrs2 = parseAttrs_(match[1]);
  var before = text.substring(0, match.index);
  var inside = match[2];
  var combinedIntro = (before + ' ' + inside).trim();
  return {
    persona: (attrs2.persona || '').toLowerCase(),
    theatrical: (attrs2.theatrical || 'no').toLowerCase() === 'yes',
    introText: combinedIntro,
    remainder: text.substring(match.index + match[0].length).trim()
  };
}

// Parse <pass-back to="X">intro text</pass-back>
function parsePassBack_(text) {
  if (!text) return null;
  var match = text.match(/<pass-back\s+([^>]*)>([\s\S]*?)<\/pass-back>/i);
  if (!match) return null;
  var attrs = parseAttrs_(match[1]);
  var before = text.substring(0, match.index);
  var inside = match[2];
  var combinedIntro = (before + ' ' + inside).trim();
  return {
    toPersona: (attrs.to || '').toLowerCase(),
    introText: combinedIntro
  };
}

// Very small attribute parser: name="value" pairs.
function parseAttrs_(attrString) {
  var attrs = {};
  var re = /(\w+)\s*=\s*"([^"]*)"/g;
  var m;
  while ((m = re.exec(attrString)) !== null) {
    attrs[m[1].toLowerCase()] = m[2];
  }
  return attrs;
}

function accumulateUsage_(acc, u) {
  if (!u) return;
  acc.input_tokens                += (u.input_tokens || 0);
  acc.output_tokens               += (u.output_tokens || 0);
  acc.cache_read_input_tokens     += (u.cache_read_input_tokens || 0);
  acc.cache_creation_input_tokens += (u.cache_creation_input_tokens || 0);
}

// Assemble segments into a single flat reply string for legacy rendering.
// The client primarily uses the segments array, but this gives us a fallback.
function composeReplyFromSegments_(segments) {
  return segments.map(function(s) { return s.content; }).filter(Boolean).join('\n\n');
}

/**
 * v3.0 Session 3: backend out-of-scope detection.
 * For each persona, defines regex patterns that signal a question
 * belongs to a different teammate. Returns suggestions array (max 1
 * currently \u2014 first match wins).
 */
function detectOutOfScope_(activePersona, userMessage) {
  if (!userMessage) return [];
  activePersona = activePersona || 'claudio';

  // Patterns keyed by DESTINATION persona (who should handle it).
  // Applied only when activePersona != destination.
  var patterns = {
    jacqueline: {
      regex: /\b(holiday|lieu|annual leave|time off|sick leave|handbook|HR|personnel|pension|payroll|P45|P60)\b/i,
      label: 'Ask Jacqueline about HR',
      seedPrefix: ''
    },
    mark: {
      regex: /\b(draft (an? )?(email|letter|note|message|statement|release|press)|write (this|me|an? email|an? letter)|announce|send (them|a note|a message)|press release)\b/i,
      label: 'Ask Mark to draft this',
      seedPrefix: ''
    },
    seth: {
      regex: /\b(this season|this weekend|last weekend|last saturday|last tuesday|yesterday\'s|today\'s (fixtures|result|score)|current form|current goalscorer|who scored|live match)\b/i,
      label: 'Ask Seth about this season',
      seedPrefix: ''
    },
    // v3.2: historical queries \u2014 season labels like 2015-16 / 2015/16,
    // "all-time", "ever", "history", "record"-shaped questions aimed at the past.
    roger: {
      regex: /\b(all[\s-]?time|ever won|in history|\d{4}[-\/]\d{2,4}|1970s|1980s|1990s|2000s|2010s|biggest (win|defeat|score)|head[\s-]?to[\s-]?head|all[\s-]?time record|champions? list|playoff winner|relegat(ed|ion) in|promot(ed|ion) in)\b/i,
      label: 'Ask Roger about the archive',
      seedPrefix: ''
    }
  };

  var suggestions = [];
  Object.keys(patterns).forEach(function(destPersona) {
    if (destPersona === activePersona) return;
    var p = patterns[destPersona];
    if (p.regex.test(userMessage)) {
      suggestions.push({
        persona: destPersona,
        label:   p.label,
        seededPrompt: userMessage   // carry the user's original question verbatim
      });
    }
  });

  // Cap at 1 suggestion for now \u2014 multiple chips can feel pushy.
  return suggestions.slice(0, 1);
}

// =============================================================================
// TOOL-USE LOOP
// =============================================================================
/**
 * Runs the Anthropic API call, handles any tool_use requests, loops until
 * Claude stops asking for tools (or we hit the cap).
 *
 * Returns: { ok, reply, usage, toolCalls }
 *   usage accumulates tokens across all API calls in this loop
 *   toolCalls is an array of tools actually invoked (for debugging/display)
 */
function runToolLoop_(apiKey, system, messages, persona) {
  persona = persona || 'claudio';
  var workingMessages = messages.slice(); // don't mutate caller's array
  var accumulatedUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0
  };
  var toolCalls = [];
  var finalReply = '';

  for (var turn = 0; turn < MAX_TOOL_TURNS + 1; turn++) {
    var apiResult = callAnthropic_(apiKey, system, workingMessages, persona);
    if (!apiResult.ok) return { ok: false, error: apiResult.error };

    // Accumulate usage — every API call in the loop adds tokens
    var u = apiResult.data.usage || {};
    accumulatedUsage.input_tokens                += (u.input_tokens || 0);
    accumulatedUsage.output_tokens               += (u.output_tokens || 0);
    accumulatedUsage.cache_read_input_tokens     += (u.cache_read_input_tokens || 0);
    accumulatedUsage.cache_creation_input_tokens += (u.cache_creation_input_tokens || 0);

    var stopReason = apiResult.data.stop_reason;
    var content    = apiResult.data.content || [];

    // If Claude finished (no more tools needed), extract text and done
    if (stopReason !== 'tool_use') {
      finalReply = extractText_(content);
      break;
    }

    // Claude wants tool(s). Cap check FIRST — if we've already hit the max,
    // we won't send another call, but we still need to give Claude something
    // to end on. We'll turn this into a text-only reply by not continuing.
    if (turn >= MAX_TOOL_TURNS) {
      // Hit cap — extract whatever text Claude included alongside the tool request
      finalReply = extractText_(content) ||
        'I started looking that up but hit my lookup limit for this message. Ask me again and I\'ll try a different approach.';
      break;
    }

    // Append Claude's assistant message (the one with tool_use blocks) to history
    workingMessages.push({ role: 'assistant', content: content });

    // Run each tool_use block, collect results as tool_result blocks
    var toolResultBlocks = [];
    for (var i = 0; i < content.length; i++) {
      var block = content[i];
      if (block.type !== 'tool_use') continue;

      // v4.0-rc3: repeat-call guard \u2014 if the same tool with the same input
      // already returned an error this turn, don\'t call it again. Tells
      // the model explicitly it already tried. Prevents the $0.20-per-turn
      // runaway we saw where Roger retried getAllTimeMatchRecords 2-3 times.
      var callKey = block.name + ':' + JSON.stringify(block.input || {});
      var alreadyFailed = toolCalls.some(function(c) {
        return (c.name + ':' + JSON.stringify(c.input || {})) === callKey && c.errored;
      });

      if (alreadyFailed) {
        console.log('[ToolLoop] ' + persona + ' retrying already-failed ' + block.name + ' \u2014 blocking');
        toolResultBlocks.push({
          type:        'tool_result',
          tool_use_id: block.id,
          content:     JSON.stringify({
            error: 'You already tried this exact call and it errored. Don\'t retry \u2014 respond to the user with what you have, or ask them for different parameters.'
          }),
          is_error:    true
        });
        toolCalls.push({ name: block.name, input: block.input, errored: true });
        continue;
      }

      var result = runTool_(block.name, block.input || {}, persona);

      // v4.0-rc3: log tool errors so we can diagnose from GAS Executions
      if (result && result.error) {
        console.log('[ToolLoop] ' + persona + ' \u2192 ' + block.name + ' errored: ' + String(result.error).substring(0, 200));
      }

      toolCalls.push({ name: block.name, input: block.input, errored: !!(result && result.error) });

      toolResultBlocks.push({
        type:        'tool_result',
        tool_use_id: block.id,
        content:     JSON.stringify(result),
        is_error:    !!(result && result.error)
      });
    }

    // Append the user-role message containing tool_result blocks
    workingMessages.push({ role: 'user', content: toolResultBlocks });

    // Loop again — Claude will see the results and continue
  }

  return {
    ok: true,
    reply: finalReply,
    usage: accumulatedUsage,
    toolCalls: toolCalls
  };
}

function extractText_(content) {
  if (!content || !content.length) return '';
  var out = [];
  for (var i = 0; i < content.length; i++) {
    if (content[i].type === 'text' && content[i].text) out.push(content[i].text);
  }
  return out.join('\n').trim();
}

// =============================================================================
// ANTHROPIC API CALL
// =============================================================================
function callAnthropic_(apiKey, system, messages, persona) {
  persona = persona || 'claudio';
  var payload = {
    model:      CLAUDIO_MODEL,
    max_tokens: CLAUDIO_MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: system,
        cache_control: { type: 'ephemeral' }   // cache the big system prompt
      }
    ],
    messages: messages,
    tools:    getToolsSchema_(persona)
  };

  // v2.0-alpha-fix2: retry on 429 with exponential backoff.
  // Orchestration makes back-to-back calls which can trip tokens-per-minute
  // limits on lower Anthropic tiers. Rather than fail the whole turn, wait
  // a moment and retry up to 3 times (0.5s, 1.5s, 3s).
  var MAX_429_RETRIES = 3;
  var backoffMs = [500, 1500, 3000];

  for (var attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var text = response.getContentText();

    // Success
    if (code === 200) {
      try {
        return { ok: true, data: JSON.parse(text) };
      } catch (e) {
        return { ok: false, error: 'Bad JSON from Anthropic: ' + e.message };
      }
    }

    // Rate limit \u2014 retry with backoff
    if (code === 429 && attempt < MAX_429_RETRIES) {
      console.log('[Anthropic] 429 on ' + persona + ' (attempt ' + (attempt + 1) + '/' + (MAX_429_RETRIES + 1) + '), sleeping ' + backoffMs[attempt] + 'ms');
      Utilities.sleep(backoffMs[attempt]);
      continue;
    }

    // Other error, or 429 after all retries exhausted
    return { ok: false, error: 'Anthropic ' + code + ': ' + text.substring(0, 300) };
  }

  // Fallthrough (shouldn't reach)
  return { ok: false, error: 'Anthropic: exhausted retries without response' };
}

// =============================================================================
// TOOL SCHEMA — what Claude sees
// =============================================================================
/**
 * Defines the 7 tools Claudio can call. Kept in one place for maintainability.
 * Descriptions are written for Claude's benefit — clear, concrete, tell it
 * exactly when to use each tool.
 *
 * v3.0: persona-aware. The full catalogue of 20 tools lives here, but each
 * persona only sees their own subset. Claudio gets 2 (getStaff, fetchNLSite).
 * Roger gets 14 historical stats tools. Seth gets 5 live-data tools.
 * Mark gets none. Jacqueline gets none for now.
 */
var PERSONA_TOOL_ALLOWLIST = {
  claudio: ['getStaff', 'fetchNLSite'],
  roger: [
    'getClubSummary',
    'getClubMatches',
    'getHeadToHead',
    'getMostFrequentOpponents',
    'getClubStreak',
    'getClubRecords',
    'getLeagueTable',
    'getAllTimeChampions',
    'getAllTimeMatchRecords',
    'getPlayoffs',
    'getMatchesByCalendarDate',
    'getMatchesByDayOfWeek',
    'getMatchesByCalendarYear',
    'getStandings',  // the current-table read privilege
    // v2.9: 11 new tools
    'getExpulsions',
    'getPointsDeductions',
    'getAbandonedMatches',
    'getPlayoffShootouts',
    'getCrossDivisionMatches',
    'getOpeningDayMatches',
    'getLongestSeasons',
    'getPhoenixHistory',
    'getClosestTitleRaces',
    'getLastDayDrama',
    'getClubFirsts'
  ],
  seth: [
    'getStandings',
    'getFixtures',
    'getRecentResults',
    'getMatchDetail',
    'getTeamForm'
  ],
  mark: ['getStaff'],   // v1.16: Mark gains staff lookup to avoid inventing names in drafts
  jacqueline: [
    'getStaff',                // staff lookups (line managers etc)
    'getHandbookSection',      // v4.2: read company handbook from private repo
    'getMyHolidayStatus',      // v4.2: current user\'s holiday balance + entries
    'getMyLieuStatus',         // v4.2: current user\'s lieu balance + entries
    'getTeamAvailability'      // v4.2: who\'s on leave on a date/range
  ]
};

function getToolsSchema_(persona) {
  persona = persona || 'claudio';
  var allowed = PERSONA_TOOL_ALLOWLIST[persona] || PERSONA_TOOL_ALLOWLIST.claudio;
  var all = _getAllToolsSchema_();
  var filtered = all.filter(function(t) { return allowed.indexOf(t.name) !== -1; });
  // v1.14: logging \u2014 helps diagnose if wrong persona is received
  console.log('[Claudio] getToolsSchema_ persona=' + persona + ' allowed=' + allowed.length + ' returned=' + filtered.length);
  return filtered;
}

function _getAllToolsSchema_() {
  return [
    {
      name: 'getStandings',
      description: 'Current league table for a division. Returns 24 teams with pos/P/W/D/L/GF/GA/GD/Pts. Current 2025/26 season only.',
      input_schema: {
        type: 'object',
        properties: {
          division: { type: 'string', enum: ['nl', 'north', 'south'], description: 'nl = National (tier 5), north/south = tier 6' }
        },
        required: ['division']
      }
    },
    {
      name: 'getFixtures',
      description: 'Upcoming fixtures in a date window. For "this weekend", "next week", "when does X play next". Up to ~50 results.',
      input_schema: {
        type: 'object',
        properties: {
          division: { type: 'string', enum: ['nl', 'north', 'south'] },
          days:     { type: 'integer', minimum: 1, maximum: 14, description: 'Days ahead (default 7, max 14)' }
        },
        required: ['division']
      }
    },
    {
      name: 'getRecentResults',
      description: 'Recent completed results in a date window. For "last weekend", "recent results". Use returned matchId with getMatchDetail for goalscorers.',
      input_schema: {
        type: 'object',
        properties: {
          division: { type: 'string', enum: ['nl', 'north', 'south'] },
          days:     { type: 'integer', minimum: 1, maximum: 14, description: 'Days back (default 7, max 14)' }
        },
        required: ['division']
      }
    },
    {
      name: 'getMatchDetail',
      description: 'Full detail for a specific match: score, goalscorers+minutes, cards, attendance, referee. Use matchId from getRecentResults.',
      input_schema: {
        type: 'object',
        properties: {
          matchId: { type: 'string', description: 'Match ID like "g2578817"' }
        },
        required: ['matchId']
      }
    },
    {
      name: 'getTeamForm',
      description:
        'Get a team\'s recent form — their last few completed matches with results. ' +
        'Use this for "how have Chesterfield been doing", "what\'s Dorking\'s form like", etc. ' +
        'Last N completed matches with opponent, score, and form string like "WWDLW". Fuzzy team name match.',
      input_schema: {
        type: 'object',
        properties: {
          team:    { type: 'string', description: 'Team name \u2014 exact or close' },
          matches: { type: 'integer', minimum: 1, maximum: 10, description: 'Count (default 5)' }
        },
        required: ['team']
      }
    },
    {
      name: 'fetchNLSite',
      description: 'Fetch a page on thenationalleague.org.uk. News, editorial, club info. For match data use dedicated tools (getStandings etc).',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path on site starting with /, e.g. "/history/our-story"' }
        },
        required: ['path']
      }
    },
    {
      name: 'getClubSummary',
      description: 'Club\'s all-time NL record (P/W/D/L/GF/GA/GD/winRate, seasons, division breakdown). For "how have they done", "tell me about X".',
      input_schema: {
        type: 'object',
        properties: {
          club: { type: 'string', description: 'Club name (fuzzy match)' },
          lineage: { type: 'array', items: { type: 'string' }, description: 'Phoenix/merger entities to combine' },
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          venue: { type: 'string', enum: ['all', 'home', 'away', 'neutral'] },
          competition: { type: 'string', enum: ['all', 'league', 'playoff'] },
          season: { type: 'string', description: 'e.g. "2005-06"' },
          seasonFrom: { type: 'string' },
          seasonTo: { type: 'string' }
        },
        required: ['club']
      }
    },
    {
      name: 'getHeadToHead',
      description: 'Two clubs\' all-time record: total, W/D/L, first/last meeting, all meetings (max 100). `perspective`: clubA|clubB|neutral. Returns rendererPayload.',
      input_schema: {
        type: 'object',
        properties: {
          clubA: { type: 'string' },
          clubB: { type: 'string' },
          lineageA: { type: 'array', items: { type: 'string' } },
          lineageB: { type: 'array', items: { type: 'string' } },
          perspective: { type: 'string', enum: ['clubA', 'clubB', 'neutral'] },
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          venue: { type: 'string', enum: ['all', 'home', 'away', 'neutral'] },
          competition: { type: 'string', enum: ['all', 'league', 'playoff'] },
          season: { type: 'string' },
          seasonFrom: { type: 'string' },
          seasonTo: { type: 'string' }
        },
        required: ['clubA', 'clubB']
      }
    },
    {
      name: 'getLeagueTable',
      description: 'Final table for season+division. Optional asOf (YYYY-MM-DD) for table at a point in time. Returns rendererPayload.',
      input_schema: {
        type: 'object',
        properties: {
          season: { type: 'string', description: 'e.g. "2005-06"' },
          division: { type: 'string', enum: ['National', 'North', 'South', 'national', 'north', 'south'] },
          asOf: { type: 'string', description: 'Optional YYYY-MM-DD' }
        },
        required: ['season', 'division']
      }
    },
    {
      name: 'getClubStreak',
      description: 'Longest streak. `type`: wins|unbeaten|losses|winless. `mode`: all|single (within season)|start (from season start).',
      input_schema: {
        type: 'object',
        properties: {
          club: { type: 'string' },
          type: { type: 'string', enum: ['wins', 'unbeaten', 'losses', 'winless'] },
          mode: { type: 'string', enum: ['all', 'single', 'start'] },
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          lineage: { type: 'array', items: { type: 'string' } },
          venue: { type: 'string', enum: ['all', 'home', 'away', 'neutral'] },
          competition: { type: 'string', enum: ['all', 'league', 'playoff'] },
          season: { type: 'string' },
          seasonFrom: { type: 'string' },
          seasonTo: { type: 'string' }
        },
        required: ['club', 'type']
      }
    },
    {
      name: 'getClubRecords',
      description: 'Best/worst/notable matches. Top 5 per category (biggest wins, heaviest defeats, highest-scoring, most goals).',
      input_schema: {
        type: 'object',
        properties: {
          club: { type: 'string' },
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          lineage: { type: 'array', items: { type: 'string' } },
          venue: { type: 'string', enum: ['all', 'home', 'away', 'neutral'] },
          competition: { type: 'string', enum: ['all', 'league', 'playoff'] },
          season: { type: 'string' },
          seasonFrom: { type: 'string' },
          seasonTo: { type: 'string' }
        },
        required: ['club']
      }
    },
    {
      name: 'getMostFrequentOpponents',
      description: 'Ranked list of a club\'s most-played opponents. Default limit 10. Pass detailed:true for full stats.',
      input_schema: {
        type: 'object',
        properties: {
          club: { type: 'string' },
          limit: { type: 'number' },
          detailed: { type: 'boolean' },
          lineage: { type: 'array', items: { type: 'string' } },
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          venue: { type: 'string', enum: ['all', 'home', 'away', 'neutral'] },
          competition: { type: 'string', enum: ['all', 'league', 'playoff'] },
          season: { type: 'string' },
          seasonFrom: { type: 'string' },
          seasonTo: { type: 'string' }
        },
        required: ['club']
      }
    },
    {
      name: 'getClubMatches',
      description: 'Flat match list. Default limit 25, max 200. Single-season queries return all matches without cap. `order`: newest|oldest. Returns rendererPayload.',
      input_schema: {
        type: 'object',
        properties: {
          club: { type: 'string' },
          limit: { type: 'number' },
          order: { type: 'string', enum: ['newest', 'oldest'] },
          lineage: { type: 'array', items: { type: 'string' } },
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          venue: { type: 'string', enum: ['all', 'home', 'away', 'neutral'] },
          competition: { type: 'string', enum: ['all', 'league', 'playoff'] },
          season: { type: 'string' },
          seasonFrom: { type: 'string' },
          seasonTo: { type: 'string' }
        },
        required: ['club']
      }
    },
    {
      name: 'getAllTimeChampions',
      description: 'Cross-club tallies: champions, playoffWinners, promoted, relegated. Top 15 per category. SLOW (5-10s).',
      input_schema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['all', 'champions', 'playoffWinners', 'promoted', 'relegated'] },
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          detailed: { type: 'boolean' }
        }
      }
    },
    {
      name: 'getMatchesByCalendarDate',
      description: 'Matches on a specific month+day across NL history. For Boxing Day, NYD, anniversary queries.',
      input_schema: {
        type: 'object',
        properties: {
          month: { type: 'number', description: '1-12' },
          day: { type: 'number', description: '1-31' },
          limit: { type: 'number' },
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          competition: { type: 'string', enum: ['all', 'league', 'playoff'] },
          season: { type: 'string' },
          seasonFrom: { type: 'string' },
          seasonTo: { type: 'string' }
        },
        required: ['month', 'day']
      }
    },
    {
      name: 'getMatchesByDayOfWeek',
      description: 'Matches by weekday. Values: Mon-Sun, or weekend|weekday|midweek. Pass `club` to scope.',
      input_schema: {
        type: 'object',
        properties: {
          dayOfWeek: { type: 'string' },
          club: { type: 'string' },
          lineage: { type: 'array', items: { type: 'string' } },
          limit: { type: 'number' },
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          venue: { type: 'string', enum: ['all', 'home', 'away', 'neutral'] },
          competition: { type: 'string', enum: ['all', 'league', 'playoff'] },
          season: { type: 'string' },
          seasonFrom: { type: 'string' },
          seasonTo: { type: 'string' },
          monthOf: { type: 'string' }
        },
        required: ['dayOfWeek']
      }
    },
    {
      name: 'getMatchesByCalendarYear',
      description: 'Matches in a calendar year (Jan-Dec, not football season). Pass `club` to scope.',
      input_schema: {
        type: 'object',
        properties: {
          year: { type: 'number' },
          club: { type: 'string' },
          lineage: { type: 'array', items: { type: 'string' } },
          limit: { type: 'number' },
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          venue: { type: 'string', enum: ['all', 'home', 'away', 'neutral'] },
          competition: { type: 'string', enum: ['all', 'league', 'playoff'] }
        },
        required: ['year']
      }
    },
    {
      name: 'getAllTimeMatchRecords',
      description: 'Cross-club extremes. `category`: biggestWin|highestScoring|mostGoalsOneTeam.',
      input_schema: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['biggestWin', 'highestScoring', 'mostGoalsOneTeam'] },
          limit: { type: 'number' },
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          competition: { type: 'string', enum: ['all', 'league', 'playoff'] },
          season: { type: 'string' },
          seasonFrom: { type: 'string' },
          seasonTo: { type: 'string' }
        },
        required: ['category']
      }
    },
    {
      name: 'getPlayoffs',
      description: 'Playoff bracket for season+division (QF/SF/Final with scores, aet, pens, aggregate).',
      input_schema: {
        type: 'object',
        properties: {
          season: { type: 'string' },
          division: { type: 'string', enum: ['National', 'North', 'South', 'national', 'north', 'south'] }
        }
      }
    },
    {
      name: 'getStaff',
      description: 'NL staff lookup by name or role. Returns name, title, org, email, line manager.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string', enum: ['superadmin', 'admin', 'staff'] }
        }
      }
    },
    {
      name: 'getExpulsions',
      description: 'Clubs expelled from NL with season, division, reason. Pass `club` to filter to one club.',
      input_schema: {
        type: 'object',
        properties: {
          club: { type: 'string' },
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] }
        }
      }
    },
    {
      name: 'getPointsDeductions',
      description: 'All points deductions in NL history with reasons, dates, values. Pass `club` to filter.',
      input_schema: {
        type: 'object',
        properties: {
          club: { type: 'string' },
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          season: { type: 'string' },
          seasonFrom: { type: 'string' },
          seasonTo: { type: 'string' }
        }
      }
    },
    {
      name: 'getAbandonedMatches',
      description: 'All abandoned matches in NL history. Pass `club` to filter to matches involving one club.',
      input_schema: {
        type: 'object',
        properties: {
          club: { type: 'string' },
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          season: { type: 'string' },
          seasonFrom: { type: 'string' },
          seasonTo: { type: 'string' }
        }
      }
    },
    {
      name: 'getPlayoffShootouts',
      description: 'Playoff matches decided by penalty shootouts across all seasons.',
      input_schema: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          season: { type: 'string' },
          seasonFrom: { type: 'string' },
          seasonTo: { type: 'string' }
        }
      }
    },
    {
      name: 'getCrossDivisionMatches',
      description: '2004-05 North/South cross-fixtures (the only season with shared North/South matchups).',
      input_schema: {
        type: 'object',
        properties: {
          season: { type: 'string' }
        }
      }
    },
    {
      name: 'getOpeningDayMatches',
      description: 'Season openers. Smart: returns a club\'s first match of each season OR first matchday of whole season. Pass `club` for club-scoped, `season` to filter, or neither for all-time season openers aggregated.',
      input_schema: {
        type: 'object',
        properties: {
          club: { type: 'string' },
          season: { type: 'string' },
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          seasonFrom: { type: 'string' },
          seasonTo: { type: 'string' }
        }
      }
    },
    {
      name: 'getLongestSeasons',
      description: 'Seasons ranked by matches played. For understanding season length differences (42 vs 44 vs 46-team seasons).',
      input_schema: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          limit: { type: 'number' }
        }
      }
    },
    {
      name: 'getPhoenixHistory',
      description: 'Phoenix clubs and merger lineages. Pass `club` for that club\'s lineage, or omit for full list.',
      input_schema: {
        type: 'object',
        properties: {
          club: { type: 'string' }
        }
      }
    },
    {
      name: 'getClosestTitleRaces',
      description: 'Title wins by narrowest points margin over runner-up. Top 10 closest races in NL history.',
      input_schema: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          limit: { type: 'number' }
        }
      }
    },
    {
      name: 'getLastDayDrama',
      description: 'Seasons where title/promotion/relegation was decided on the final matchday. Aggregates dramatic finishes.',
      input_schema: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['all', 'national', 'north', 'south'] },
          type: { type: 'string', enum: ['all', 'title', 'promotion', 'relegation'] },
          limit: { type: 'number' }
        }
      }
    },
    {
      name: 'getClubFirsts',
      description: 'A club\'s first NL match, first win, first home match, first appearance in each division.',
      input_schema: {
        type: 'object',
        properties: {
          club: { type: 'string' },
          lineage: { type: 'array', items: { type: 'string' } }
        },
        required: ['club']
      }
    },
    // ========================================================================
    // Jacqueline (HR) tools — v4.2
    // ========================================================================
    {
      name: 'getHandbookSection',
      description: 'Fetch a section of the NL Company Handbook by topic. Use whenever the user asks about policies: holidays, lieu, expenses, sickness, probation, grievance, family-friendly leave, data protection, etc. Returns the matched section as markdown. Max 3 sections per call.',
      input_schema: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Topic or policy name. e.g. "holidays", "TOIL", "maternity leave", "grievance procedure", "expenses". Fuzzy match against policy headings and content.' }
        },
        required: ['topic']
      }
    },
    {
      name: 'getMyHolidayStatus',
      description: 'Current user\'s holiday entitlement and usage for a given year. Returns total entitlement, taken, booked, remaining, plus list of entries. For "how many holidays do I have left", "when am I off next".',
      input_schema: {
        type: 'object',
        properties: {
          year: { type: 'string', description: 'Year e.g. "2026". Defaults to current year.' }
        }
      }
    },
    {
      name: 'getMyLieuStatus',
      description: 'Current user\'s TOIL (time off in lieu) balance and entries. Returns hours accrued, hours taken, balance, plus entries. For "how much lieu do I have", "any lieu to use".',
      input_schema: {
        type: 'object',
        properties: {
          year: { type: 'string', description: 'Year e.g. "2026". Defaults to current year.' }
        }
      }
    },
    {
      name: 'getTeamAvailability',
      description: 'Who is on leave (holiday or lieu) across the team on a date or date range. For "is Tom off next week", "who\'s around on Friday", "anyone off during Easter". Returns list of people and their leave type for each day.',
      input_schema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Single date YYYY-MM-DD' },
          dateFrom: { type: 'string', description: 'Range start YYYY-MM-DD' },
          dateTo: { type: 'string', description: 'Range end YYYY-MM-DD' }
        }
      }
    }
  ];
}

// =============================================================================
// TOOL DISPATCH
// =============================================================================
function runTool_(name, input, persona) {
  // v1.14: belt-and-braces \u2014 enforce the persona allowlist at the
  // dispatch layer too, not just in the schema sent to Anthropic. If for
  // any reason the wrong schema reached the model and it tried to call a
  // disallowed tool, refuse here and tell it why.
  if (persona) {
    var allowed = PERSONA_TOOL_ALLOWLIST[persona] || [];
    if (allowed.indexOf(name) === -1) {
      return {
        error: 'Tool ' + name + ' is not available to ' + persona + '. That\'s handled by a different teammate. Answer in your own voice without this data.'
      };
    }
  }

  try {
    switch (name) {
      case 'getStandings':      return toolGetStandings_(input);
      case 'getFixtures':       return toolGetFixtures_(input);
      case 'getRecentResults':  return toolGetRecentResults_(input);
      case 'getMatchDetail':    return toolGetMatchDetail_(input);
      case 'getTeamForm':       return toolGetTeamForm_(input);
      case 'fetchNLSite':       return toolFetchNLSite_(input);
      case 'getClubSummary':    return toolGetClubSummary_(input);
      case 'getHeadToHead':     return toolGetHeadToHead_(input);
      case 'getLeagueTable':    return toolGetLeagueTable_(input);
      case 'getClubStreak':     return toolGetClubStreak_(input);
      case 'getClubRecords':    return toolGetClubRecords_(input);
      case 'getMostFrequentOpponents': return toolGetMostFrequentOpponents_(input);
      case 'getClubMatches':    return toolGetClubMatches_(input);
      case 'getAllTimeChampions': return toolGetAllTimeChampions_(input);
      case 'getMatchesByCalendarDate': return toolGetMatchesByCalendarDate_(input);
      case 'getMatchesByDayOfWeek':    return toolGetMatchesByDayOfWeek_(input);
      case 'getMatchesByCalendarYear': return toolGetMatchesByCalendarYear_(input);
      case 'getAllTimeMatchRecords':   return toolGetAllTimeMatchRecords_(input);
      case 'getPlayoffs':              return toolGetPlayoffs_(input);
      case 'getStaff':          return toolGetStaff_(input);
      case 'getExpulsions':            return toolGetExpulsions_(input);
      case 'getPointsDeductions':      return toolGetPointsDeductions_(input);
      case 'getAbandonedMatches':      return toolGetAbandonedMatches_(input);
      case 'getPlayoffShootouts':      return toolGetPlayoffShootouts_(input);
      case 'getCrossDivisionMatches':  return toolGetCrossDivisionMatches_(input);
      case 'getOpeningDayMatches':     return toolGetOpeningDayMatches_(input);
      case 'getLongestSeasons':        return toolGetLongestSeasons_(input);
      case 'getPhoenixHistory':        return toolGetPhoenixHistory_(input);
      case 'getClosestTitleRaces':     return toolGetClosestTitleRaces_(input);
      case 'getLastDayDrama':          return toolGetLastDayDrama_(input);
      case 'getClubFirsts':            return toolGetClubFirsts_(input);
      // Jacqueline (HR) — v4.2
      case 'getHandbookSection':       return toolGetHandbookSection_(input);
      case 'getMyHolidayStatus':       return toolGetMyHolidayStatus_(input);
      case 'getMyLieuStatus':          return toolGetMyLieuStatus_(input);
      case 'getTeamAvailability':      return toolGetTeamAvailability_(input);
      default:                  return { error: 'Unknown tool: ' + name };
    }
  } catch (err) {
    return { error: 'Tool ' + name + ' failed: ' + (err.message || err) };
  }
}

// =============================================================================
// TOOL: getStandings
// =============================================================================
function toolGetStandings_(input) {
  var comp = NLS_COMPS[input.division];
  if (!comp) return { error: 'Unknown division: ' + input.division };

  var matches = fetchMatches_(comp.id);
  if (matches.error) return matches;

  // Build standings from all FullTime/PostMatch matches
  var tableByTeam = {};   // teamID → row

  function ensureRow(teamID, teamName) {
    if (!tableByTeam[teamID]) {
      tableByTeam[teamID] = {
        teamID: teamID,
        team:   teamName,
        P: 0, W: 0, D: 0, L: 0,
        GF: 0, GA: 0, GD: 0, Pts: 0
      };
    }
    // Update name if we find a better one (non-empty, not already set from initials)
    if (teamName && tableByTeam[teamID].team !== teamName) {
      tableByTeam[teamID].team = teamName;
    }
  }

  for (var i = 0; i < matches.length; i++) {
    var m = matches[i];
    var attrs = m.attributes || {};
    var period = String(attrs.matchPeriod || '').toLowerCase();
    if (period !== 'fulltime' && period !== 'postmatch') continue;

    var home = attrs.homeTeam || {};
    var away = attrs.awayTeam || {};
    var homeID   = home.teamID || ('t_' + (home.name || 'unknown'));
    var awayID   = away.teamID || ('t_' + (away.name || 'unknown'));
    var homeName = home.name || home.shortName || home.initials || 'Unknown';
    var awayName = away.name || away.shortName || away.initials || 'Unknown';
    var hs = (typeof home.score === 'number') ? home.score : null;
    var as = (typeof away.score === 'number') ? away.score : null;

    // Skip matches without scores (shouldn't happen if period is FT, but defensive)
    if (hs === null || as === null) continue;

    ensureRow(homeID, homeName);
    ensureRow(awayID, awayName);

    var h = tableByTeam[homeID];
    var a = tableByTeam[awayID];

    h.P++; a.P++;
    h.GF += hs; h.GA += as;
    a.GF += as; a.GA += hs;

    if (hs > as)      { h.W++; h.Pts += 3; a.L++; }
    else if (hs < as) { a.W++; a.Pts += 3; h.L++; }
    else              { h.D++; h.Pts += 1; a.D++; a.Pts += 1; }
  }

  // Convert to array, compute GD, sort, add position
  var rows = [];
  for (var key in tableByTeam) rows.push(tableByTeam[key]);
  for (var j = 0; j < rows.length; j++) rows[j].GD = rows[j].GF - rows[j].GA;
  rows.sort(function(a, b) {
    if (b.Pts !== a.Pts) return b.Pts - a.Pts;
    if (b.GD  !== a.GD)  return b.GD  - a.GD;
    if (b.GF  !== a.GF)  return b.GF  - a.GF;
    return a.team.localeCompare(b.team);
  });
  for (var k = 0; k < rows.length; k++) rows[k].pos = k + 1;

  return {
    division: comp.label,
    season: seasonLabel_(),
    table: rows.map(function(r) {
      return {
        pos: r.pos, team: r.team,
        P: r.P, W: r.W, D: r.D, L: r.L,
        GF: r.GF, GA: r.GA, GD: r.GD, Pts: r.Pts
      };
    })
  };
}

// =============================================================================
// TOOL: getFixtures
// =============================================================================
function toolGetFixtures_(input) {
  var comp = NLS_COMPS[input.division];
  if (!comp) return { error: 'Unknown division: ' + input.division };
  var days = Math.min(14, Math.max(1, input.days || 7));

  var matches = fetchMatches_(comp.id);
  if (matches.error) return matches;

  var now = Date.now();
  var horizon = now + (days * 86400 * 1000);

  var out = [];
  for (var i = 0; i < matches.length; i++) {
    var attrs = matches[i].attributes || {};
    var period = String(attrs.matchPeriod || '').toLowerCase();
    if (period !== 'prematch') continue;

    var ts = parseNLSDate_(attrs.kickOffDateUTC);
    if (ts === null) continue;
    if (ts < now || ts > horizon) continue;

    var home = attrs.homeTeam || {};
    var away = attrs.awayTeam || {};
    out.push({
      matchId: matches[i].id,
      date:    formatDate_(ts),
      home:    home.name || home.shortName || 'Unknown',
      away:    away.name || away.shortName || 'Unknown'
    });
  }
  out.sort(function(a, b) { return a.date.localeCompare(b.date); });

  return {
    division: comp.label,
    windowDays: days,
    fixtures: out.slice(0, 50)
  };
}

// =============================================================================
// TOOL: getRecentResults
// =============================================================================
function toolGetRecentResults_(input) {
  var comp = NLS_COMPS[input.division];
  if (!comp) return { error: 'Unknown division: ' + input.division };
  var days = Math.min(14, Math.max(1, input.days || 7));

  var matches = fetchMatches_(comp.id);
  if (matches.error) return matches;

  var now = Date.now();
  var earliest = now - (days * 86400 * 1000);

  var out = [];
  for (var i = 0; i < matches.length; i++) {
    var attrs = matches[i].attributes || {};
    var period = String(attrs.matchPeriod || '').toLowerCase();
    if (period !== 'fulltime' && period !== 'postmatch') continue;

    var ts = parseNLSDate_(attrs.kickOffDateUTC);
    if (ts === null) continue;
    if (ts < earliest || ts > now) continue;

    var home = attrs.homeTeam || {};
    var away = attrs.awayTeam || {};
    out.push({
      matchId: matches[i].id,
      date:    formatDate_(ts),
      home:    home.name || 'Unknown',
      homeScore: (typeof home.score === 'number') ? home.score : null,
      away:    away.name || 'Unknown',
      awayScore: (typeof away.score === 'number') ? away.score : null
    });
  }
  // Newest first
  out.sort(function(a, b) { return b.date.localeCompare(a.date); });

  return {
    division: comp.label,
    windowDays: days,
    results: out.slice(0, 50)
  };
}

// =============================================================================
// TOOL: getMatchDetail
// =============================================================================
function toolGetMatchDetail_(input) {
  var matchId = input.matchId;
  if (!matchId) return { error: 'matchId required' };

  var cache = CacheService.getScriptCache();
  var cached = cache.get('nls_detail_' + matchId);
  var detail;
  if (cached) {
    detail = JSON.parse(cached);
  } else {
    var response = UrlFetchApp.fetch(NLS_BASE + '/matches/' + matchId, {
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      return { error: 'Match detail fetch failed (' + response.getResponseCode() + ')' };
    }
    var parsed = JSON.parse(response.getContentText());
    detail = parsed.data || parsed;
    try { cache.put('nls_detail_' + matchId, JSON.stringify(detail), NLS_CACHE_TTL_SEC); } catch (e) {}
  }

  var attrs = detail.attributes || {};
  var matchTeams = attrs.matchTeams || [];
  var goals = [];
  var cards = [];

  for (var t = 0; t < matchTeams.length; t++) {
    var team = matchTeams[t];
    var teamObj = team.team || {};
    var teamName = teamObj.teamName || teamObj.teamShortName || 'Unknown';
    var events = team.events || {};

    var goalsArr = events.goals || [];
    for (var g = 0; g < goalsArr.length; g++) {
      var ge = goalsArr[g].goalEvents || {};
      var player = ge.player || {};
      var pname = player.playerName || {};
      var scorer = pname.knownName || pname.customKnownName ||
                   ((pname.firstName || '') + ' ' + (pname.lastName || '')).trim() ||
                   'Unknown';
      var gType = String(ge.goalType || '').toLowerCase();
      goals.push({
        team: teamName,
        scorer: scorer,
        minute: goalsArr[g].formattedEventTime || (goalsArr[g].eventMinute + "'"),
        type: gType.indexOf('own') !== -1 ? 'own goal' :
              gType.indexOf('pen') !== -1 ? 'penalty' : 'goal'
      });
    }

    var bookingsArr = events.bookings || [];
    for (var b = 0; b < bookingsArr.length; b++) {
      var be = bookingsArr[b].bookingEvents || {};
      var bplayer = be.player || {};
      var bpname = bplayer.playerName || {};
      var bname = bpname.knownName || bpname.customKnownName ||
                  ((bpname.firstName || '') + ' ' + (bpname.lastName || '')).trim() ||
                  'Unknown';
      cards.push({
        team: teamName,
        player: bname,
        minute: bookingsArr[b].formattedEventTime || '',
        card: be.card || ''
      });
    }
  }

  var home = attrs.homeTeam || {};
  var away = attrs.awayTeam || {};
  var homeTeam = (matchTeams[0] && matchTeams[0].team) ? matchTeams[0].team : home;
  var awayTeam = (matchTeams[1] && matchTeams[1].team) ? matchTeams[1].team : away;
  var homeName = homeTeam.teamName || homeTeam.teamShortName || 'Unknown';
  var awayName = awayTeam.teamName || awayTeam.teamShortName || 'Unknown';
  var homeScore = (matchTeams[0] && typeof matchTeams[0].score === 'number') ? matchTeams[0].score : null;
  var awayScore = (matchTeams[1] && typeof matchTeams[1].score === 'number') ? matchTeams[1].score : null;

  var md = attrs.matchDetails || {};
  var missingEventData = matchTeams.length > 0 &&
    (!matchTeams[0].players || !matchTeams[0].players.Start || matchTeams[0].players.Start.length === 0);

  return {
    matchId: matchId,
    date: attrs.kickOffUTC ? attrs.kickOffUTC.substring(0, 10) : '',
    home: homeName,
    homeScore: homeScore,
    away: awayName,
    awayScore: awayScore,
    venue: attrs.venue || '',
    attendance: md.attendance || null,
    referee: md.refereeName || '',
    goals: goals,
    cards: cards,
    note: missingEventData ? 'Event data for this match is incomplete \u2014 scorers and cards may be missing.' : undefined
  };
}

// =============================================================================
// TOOL: getTeamForm
// =============================================================================
function toolGetTeamForm_(input) {
  var teamQuery = (input.team || '').toLowerCase().trim();
  if (!teamQuery) return { error: 'team name required' };
  var wantN = Math.min(10, Math.max(1, input.matches || 5));

  // Search all three comps — team might be in any of them
  var allMatches = [];
  for (var key in NLS_COMPS) {
    var fetched = fetchMatches_(NLS_COMPS[key].id);
    if (!fetched.error) {
      allMatches = allMatches.concat(fetched.map(function(m) { return { comp: key, match: m }; }));
    }
  }

  // Find FT matches involving this team (fuzzy name match)
  var teamMatches = [];
  var teamID = null;
  var teamCanonicalName = null;

  for (var i = 0; i < allMatches.length; i++) {
    var m = allMatches[i].match;
    var attrs = m.attributes || {};
    var period = String(attrs.matchPeriod || '').toLowerCase();
    if (period !== 'fulltime' && period !== 'postmatch') continue;

    var home = attrs.homeTeam || {};
    var away = attrs.awayTeam || {};
    var homeNameLC = (home.name || '').toLowerCase();
    var awayNameLC = (away.name || '').toLowerCase();

    if (homeNameLC.indexOf(teamQuery) !== -1 || homeNameLC === teamQuery) {
      teamID = home.teamID;
      teamCanonicalName = home.name;
      teamMatches.push({ match: m, comp: allMatches[i].comp, home: true });
    } else if (awayNameLC.indexOf(teamQuery) !== -1 || awayNameLC === teamQuery) {
      teamID = away.teamID;
      teamCanonicalName = away.name;
      teamMatches.push({ match: m, comp: allMatches[i].comp, home: false });
    }
  }

  if (!teamMatches.length) {
    return { error: 'No team found matching "' + input.team + '" in any current NL division.' };
  }

  // Newest first
  teamMatches.sort(function(a, b) {
    var ta = parseNLSDate_((a.match.attributes || {}).kickOffDateUTC) || 0;
    var tb = parseNLSDate_((b.match.attributes || {}).kickOffDateUTC) || 0;
    return tb - ta;
  });

  var recent = teamMatches.slice(0, wantN);
  var formStr = '';
  var out = [];
  for (var r = 0; r < recent.length; r++) {
    var entry = recent[r];
    var a = entry.match.attributes || {};
    var h = a.homeTeam || {};
    var aw = a.awayTeam || {};
    var hs = (typeof h.score === 'number') ? h.score : null;
    var ascore = (typeof aw.score === 'number') ? aw.score : null;
    if (hs === null || ascore === null) continue;

    var result;
    if (entry.home) {
      result = hs > ascore ? 'W' : hs < ascore ? 'L' : 'D';
    } else {
      result = ascore > hs ? 'W' : ascore < hs ? 'L' : 'D';
    }
    formStr += result;

    out.push({
      date: formatDate_(parseNLSDate_(a.kickOffDateUTC)),
      opponent: entry.home ? aw.name : h.name,
      venue: entry.home ? 'H' : 'A',
      result: result,
      score: (entry.home ? hs : ascore) + '-' + (entry.home ? ascore : hs),
      division: NLS_COMPS[entry.comp].label
    });
  }

  return {
    team: teamCanonicalName || input.team,
    formString: formStr,  // newest-first, e.g. "WDLWW"
    recentMatches: out
  };
}

// =============================================================================
// TOOL: fetchNLSite
// =============================================================================
function toolFetchNLSite_(input) {
  var path = input.path || '';
  if (!path.startsWith('/')) {
    return { error: 'Path must start with / (relative to thenationalleague.org.uk)' };
  }

  // Hard-coded domain — cannot be overridden by the input
  var url = 'https://' + WEB_FETCH_ALLOWED_HOST + path;

  var cache = CacheService.getScriptCache();
  var cacheKey = 'web_' + Utilities.base64EncodeWebSafe(path).substring(0, 100);
  var cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  var response;
  try {
    response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true
    });
  } catch (e) {
    return { error: 'Fetch failed: ' + (e.message || e) };
  }

  if (response.getResponseCode() !== 200) {
    return { error: 'Page returned ' + response.getResponseCode(), url: url };
  }

  var html = response.getContentText();
  var text = stripHtml_(html);
  // Truncate to a sensible size — 8k chars is plenty for a summary
  if (text.length > 8000) text = text.substring(0, 8000) + '...[truncated]';

  var result = {
    url: url,
    contentLength: text.length,
    content: text,
    note: 'Content is server-rendered HTML only. Dynamic/JavaScript-loaded content (live data, fixture tables) is not captured — use the dedicated data tools for that.'
  };

  try { cache.put(cacheKey, JSON.stringify(result), WEB_FETCH_CACHE_TTL_SEC); } catch (e) {}
  return result;
}

// Strip HTML tags to extract readable text. Crude but sufficient for summarisation.
function stripHtml_(html) {
  return String(html)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// =============================================================================
// NLS MATCH-LIST FETCHER (WITH CACHE)
// =============================================================================
/**
 * Fetches all matches for a competition in the current season, paginating.
 * Cached in CacheService for NLS_CACHE_TTL_SEC.
 * Returns array of match objects (the "data" array from the NLS response).
 * Returns {error: "..."} on failure.
 */
function fetchMatches_(compID) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'nls_matches_' + compID + '_' + NLS_SEASON_ID;

  var cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  var all = [];
  var url = NLS_BASE + '/matches/?competitionID=' + compID +
            '&seasonID=' + NLS_SEASON_ID +
            '&sort=-kickOffDateUTC&page.number=1&page.size=100';
  var safety = 0;

  while (url && safety < 10) {
    safety++;
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) {
      return { error: 'Live data fetch failed (' + response.getResponseCode() + ') for comp ' + compID };
    }
    var json;
    try {
      json = JSON.parse(response.getContentText());
    } catch (e) {
      return { error: 'Live data returned non-JSON for comp ' + compID };
    }
    if (!json.data) break;
    all = all.concat(json.data);
    url = (json.links && json.links.next) ? json.links.next : null;
  }

  // Cache — but be careful of size limits (CacheService has ~100KB per key)
  // If too big, skip caching and hope for the best
  try {
    var serialised = JSON.stringify(all);
    if (serialised.length < 95000) {
      cache.put(cacheKey, serialised, NLS_CACHE_TTL_SEC);
    }
  } catch (e) {
    // Cache write failed, don't fail the fetch
  }

  return all;
}

// =============================================================================
// UTILITIES
// =============================================================================
function parseNLSDate_(str) {
  if (!str) return null;
  // NLS format: "2026-03-24 19:45:00" — no T, no timezone. Add T and Z.
  var normalised = str.indexOf('T') !== -1 ? str : str.replace(' ', 'T') + 'Z';
  var d = new Date(normalised);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function formatDate_(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  var dd = String(d.getUTCDate()).padStart(2, '0');
  var mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  var yyyy = d.getUTCFullYear();
  return yyyy + '-' + mm + '-' + dd;
}

function seasonLabel_() {
  // e.g. 2025 → "2025/26"
  return NLS_SEASON_ID + '/' + String((NLS_SEASON_ID + 1) % 100).padStart(2, '0');
}

// =============================================================================
// USAGE TRACKING (unchanged from v1.0)
// =============================================================================
function getUsage_(uid) {
  var day = todayKey_();
  var path = 'claudio/usage/' + uid + '/' + day;
  var url = firebaseRestURL_(path) + '.json?auth=' + getFirebaseSecret_();
  try {
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) return { count: 0, cost_pence: 0 };
    var data = JSON.parse(response.getContentText());
    if (!data) return { count: 0, cost_pence: 0 };
    return { count: data.count || 0, cost_pence: data.cost_pence || 0 };
  } catch (e) {
    return { count: 0, cost_pence: 0 };
  }
}

function recordUsage_(uid, addCostPence, usage) {
  var day = todayKey_();
  var path = 'claudio/usage/' + uid + '/' + day;
  var current = getUsage_(uid);

  var body = {
    count: (current.count || 0) + 1,
    cost_pence: (current.cost_pence || 0) + addCostPence,
    last_tokens: {
      input:       usage.input_tokens || 0,
      output:      usage.output_tokens || 0,
      cache_read:  usage.cache_read_input_tokens || 0,
      cache_write: usage.cache_creation_input_tokens || 0
    },
    updated: new Date().toISOString()
  };

  var url = firebaseRestURL_(path) + '.json?auth=' + getFirebaseSecret_();
  try {
    UrlFetchApp.fetch(url, {
      method: 'put',
      contentType: 'application/json',
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
  } catch (e) {
    // Non-fatal — usage tracking shouldn't break chat
  }
}

function checkRate_(uid) {
  var cache = CacheService.getScriptCache();
  var key = 'claudio_rate_' + uid;
  var bucket = cache.get(key);
  var now = Date.now();
  if (!bucket) {
    cache.put(key, JSON.stringify([now]), CLAUDIO_RATE_WINDOW_SEC);
    return true;
  }
  var arr = JSON.parse(bucket);
  var cutoff = now - (CLAUDIO_RATE_WINDOW_SEC * 1000);
  arr = arr.filter(function(t) { return t > cutoff; });
  if (arr.length >= CLAUDIO_RATE_MAX) return false;
  arr.push(now);
  cache.put(key, JSON.stringify(arr), CLAUDIO_RATE_WINDOW_SEC);
  return true;
}

function computeCostPence_(usage) {
  var input       = usage.input_tokens                  || 0;
  var output      = usage.output_tokens                 || 0;
  var cacheRead   = usage.cache_read_input_tokens       || 0;
  var cacheWrite  = usage.cache_creation_input_tokens   || 0;

  var usd =
    (input       / 1e6) * PRICE_INPUT_USD +
    (output      / 1e6) * PRICE_OUTPUT_USD +
    (cacheRead   / 1e6) * PRICE_CACHE_READ_USD +
    (cacheWrite  / 1e6) * PRICE_CACHE_WRITE_USD;

  var gbp = usd * USD_TO_GBP;
  return Math.ceil(gbp * 100); // pence, rounded up
}

function todayKey_() {
  // UK day key — "yyyy-mm-dd" in Europe/London
  var tz = 'Europe/London';
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

// =============================================================================
// FIREBASE HELPERS
// =============================================================================
// Note: the rest of the NL-Tools GAS project uses `rtdbRead` / `rtdbWrite` from
// utils.gs, which take a full URL and secret as args. ClaudioChat.gs was
// written against a different pattern (path-based URL builder + secret getter),
// so we define those two helpers here to avoid churning utils.gs. A future
// tidy-up could unify the two patterns.

function firebaseRestURL_(path) {
  var base = PropertiesService.getScriptProperties().getProperty('RTDB_URL');
  if (!base) throw new Error('RTDB_URL script property not set');
  // Strip trailing slash on base and leading slash on path to avoid double-slash
  base = base.replace(/\/+$/, '');
  path = String(path || '').replace(/^\/+/, '');
  return base + '/' + path;
}

function getFirebaseSecret_() {
  var secret = PropertiesService.getScriptProperties().getProperty('RTDB_SECRET');
  if (!secret) throw new Error('RTDB_SECRET script property not set');
  return secret;
}

// =============================================================================
// CHANGELOG
// =============================================================================
function getChangelog() {
  return [
    {
      version: '2.2-alpha',
      date: '20/04/2026',
      changes: [
        'JACQUELINE HR PERSONA LIVE. Four new tools: getHandbookSection (fetches Company Handbook from private GitHub repo, topic-scored with synonyms, 6hr cache), getMyHolidayStatus (user\'s annual leave taken/booked), getMyLieuStatus (earned/taken/expired/balance), getTeamAvailability (team leave across date or range).',
        'Added CURRENT_USER_UID and CURRENT_USER_NAME request-scoped globals captured in claudioChat() entry point so HR tools know whose holiday to look up.',
        'fetchInternalHandbook_() fetches from github.com/thenationalleague/internal-docs/handbook.md via GITHUB_INTERNAL_TOKEN script property. Transparent chunked caching.',
        'Triage prompt extended with ROUTE:jacqueline routing token and 4 HR-specific examples. Validation regex updated to accept "jacqueline".',
        'Persona frame for Jacqueline added to 429 cooldown handling ("To HR \u2192" chip).'
      ]
    },
    {
      version: '2.1-beta',
      date: '19/04/2026',
      changes: [
        'Minor schema compression on Seth tools \u2014 ~60 tokens saved per Seth call.',
        'No functional change. Paired with ClaudioStats v2.9 cap fix.'
      ]
    },
    {
      version: '2.1-alpha',
      date: '19/04/2026',
      changes: [
        'Switchboard refactor: Claudio is now a pure triage router.',
        'runTriageCall_ classifies every message with a ~500-token call (no tools).',
        'runSwitchboardTurn_ dispatches to specialist direct (ROUTE:X) or Claudio-full (SELF:X) or hardcoded greeting (SELF:greet, zero extra API calls).',
        'Handoff marker parsing retired. Claudio prompt slimmed further.',
        'Typical cost savings: 30-85% depending on scenario.'
      ]
    },
    {
      version: '2.0-rc4',
      date: '19/04/2026',
      changes: [
        'Per-persona 429 nudge framing: Claudio speaks the recovery line in Italian voice, with "meet me in the archives" (Roger) / "press box" (Seth) / "my office" (Mark) per-persona copy.',
        'Suggestion chips now carry cooldownUntil timestamp (45s). Client renders countdown instead of firing a call that would also 429.',
        'Nudge bubble moved from specialist avatar to Claudio\'s.'
      ]
    },
    {
      version: '2.0-rc3',
      date: '19/04/2026',
      changes: [
        'Repeat-tool guard in runToolLoop_: same-tool-same-input retries short-circuited with synthetic "already tried" error.',
        'Tool errors now log to GAS Executions for diagnosis.',
        'Prevents observed 25k-token runaway turns from failing tools.'
      ]
    },
    {
      version: '2.0-rc2',
      date: '19/04/2026',
      changes: [
        'Friendly 429 handling: specialist Call 2 rate-limits now produce a soft bubble + suggestion chip to ask the specialist directly, pre-seeded with original question.',
        'Claudio Call 1 429s return a soft triage-nudge reply instead of a hard error.',
        'runOrchestratedTurn_ may return suggestions field; claudioChat prefers those over out-of-scope regex detection when present.'
      ]
    },
    {
      version: '2.0-rc1',
      date: '18/04/2026',
      changes: [
        'Pivot back from theatre mode. runOrchestratedTurn_ returns to real two-call pattern with smart gating: Claudio\'s Call 1 is cheap (own prompt + 2 tools), Call 2 fires only when handoff marker emitted.',
        'claudio_host allowlist removed.',
        'parseHandoff_ and parsePassBack_ back in active use.',
        'Simple "hello" turns stay single-call. Orchestrated turns ~8-9k tokens (was ~10k in theatre mode due to union tool schemas).'
      ]
    },
    {
      version: '2.0-beta',
      date: '18/04/2026',
      changes: [
        'Single-call theatre: runOrchestratedTurn_ now uses one API call with claudio_host persona (union tool allowlist) and parses <voice-switch> markers client-side into per-persona segments.',
        'Cost per orchestrated turn halved. 429 rate limits eliminated.',
        'parseVoiceSwitches_ added. handoff/pass-back marker parsers retained as dead code for possible rollback.'
      ]
    },
    {
      version: '2.0-alpha-fix2',
      date: '18/04/2026',
      changes: [
        'Anthropic 429 retry with exponential backoff in callAnthropic_.',
        'Pre-emptive 300ms delay between Claudio and specialist calls in orchestration to reduce TPM pressure.'
      ]
    },
    {
      version: '2.0-alpha-fix1',
      date: '18/04/2026',
      changes: [
        'Orchestration failures now log to GAS Executions and surface truncated error in visible reply.',
        'New guard for empty specialist replies (was previously appearing as generic snag error).'
      ]
    },
    {
      version: '2.0-alpha',
      date: '18/04/2026',
      changes: [
        'Phase A+B of v4.0 design: orchestrated team architecture.',
        'claudioChat accepts personaPrompts map; runOrchestratedTurn_ calls Claudio, parses <handoff> markers, invokes specialist, handles <pass-back> re-routing (1 pass max).',
        'Reply shape extended: segments array for multi-bubble rendering.',
        'Legacy single-persona path preserved via runSinglePersonaTurn_.'
      ]
    },
    {
      version: '1.16',
      date: '18/04/2026',
      changes: [
        'Added getStaff to Mark\'s allowlist so he can resolve staff names before committing them to drafts. Fixes observed Gartside-invention bug.'
      ]
    },
    {
      version: '1.15',
      date: '18/04/2026',
      changes: [
        'Phase 2 support: added "roger" pattern to out-of-scope detector so historical questions aimed at Seth (season labels, "all-time", decade refs, "biggest ever") produce a chip pointing to Roger.',
        'No schema changes \u2014 Seth\'s 5 live-data tools were already allowlisted.'
      ]
    },
    {
      version: '1.14',
      date: '18/04/2026',
      changes: [
        'runTool_ now takes a persona argument and refuses dispatch of any tool not in that persona\'s allowlist \u2014 belt-and-braces defence against Claudio calling Roger\'s tools.',
        'Added console.log in getToolsSchema_ to surface what persona arrived on each request. Aids debugging if routing breaks again.'
      ]
    },
    {
      version: '1.13',
      date: '18/04/2026',
      changes: [
        'New detectOutOfScope_() function scans the last user message for keywords belonging to a different persona (jacqueline: holiday/lieu/HR/handbook; mark: draft email/write/press; seth: this season/last weekend/current form). Returns up to 1 suggestion per reply.',
        'Response shape gains `suggestions` array: [{persona, label, seededPrompt}]. Client renders as chip below the message; click opens new chat pre-filled with seededPrompt.'
      ]
    },
    {
      version: '1.12',
      date: '18/04/2026',
      changes: [
        'Persona-aware tool filtering. claudioChat() accepts persona in body (default claudio).',
        'PERSONA_TOOL_ALLOWLIST defines subsets per teammate. Only the relevant tools ship with each request.',
        'Internal rename: getToolsSchema_() now filters by persona; _getAllToolsSchema_() holds the full catalogue.',
        'Backward compatible: older HTML clients without persona field default to claudio behaviour.'
      ]
    },
    {
      version: '1.11',
      date: '18/04/2026',
      changes: [
        'Five new tool schemas + dispatch entries to match ClaudioStats.gs v2.8 additions.',
        'Schemas: getMatchesByCalendarDate, getMatchesByDayOfWeek, getMatchesByCalendarYear, getAllTimeMatchRecords, getPlayoffs. Average ~220 tokens each, kept tight to preserve v1.10 rate-limit gains.',
        'Tool count 15 \u2192 20. Total schema size 3.4k \u2192 4.5k tokens (still well under pre-v1.10 bloat level of 6.6k).'
      ]
    },
    {
      version: '1.10',
      date: '18/04/2026',
      changes: [
        'EMERGENCY PATCH. Tool schema descriptions bloated to ~6.6k tokens (sent on every request), causing rate-limit hits on fresh sessions.',
        'Compressed all 15 tool descriptions to ~3.4k tokens total. Cut per-request cost by ~3k tokens.',
        'Filter-composition prose (venue/competition/season patterns) no longer duplicated in 7 tool descriptions \u2014 lives once in the system prompt.',
        'No functional changes to tool params, dispatch, or behaviour. Schemas still accept all existing arguments.'
      ]
    },
    {
      version: '1.9',
      date: '18/04/2026',
      changes: [
        'Schema updates aligned with ClaudioStats.gs v2.5 efficiency pass.',
        'getMostFrequentOpponents: default limit 15\u219210, new `detailed: boolean` param for full per-row stats (default off to keep token cost low).',
        'getClubMatches: default limit 50\u219225 (plenty for prose answers; Claudio can ask for more when needed).',
        'getAllTimeChampions: output capped at top 15 per category, new `detailed: boolean` param for full season-by-season breakdown (default off).'
      ]
    },
    {
      version: '1.8',
      date: '18/04/2026',
      changes: [
        'Three new tool schemas registered: getMostFrequentOpponents (ranked list of a club\'s most-played opponents), getClubMatches (flat match list with rendererPayload for styled table), getAllTimeChampions (cross-season tallies of honours across all clubs).',
        'Tool surface now 15 tools total. Dispatch switch updated with all three cases.',
        'Backed by ClaudioStats.gs v2.4 calculators using shared filter system.'
      ]
    },
    {
      version: '1.7',
      date: '17/04/2026',
      changes: [
        'Dynamic filter params added to all four club-based tool schemas (getClubSummary, getHeadToHead, getClubStreak, getClubRecords): venue (all/home/away/neutral), competition (all/league/playoff), season (single), seasonFrom/seasonTo (range). All default to "all" / unset.',
        'Competition default is now "all" (league + play-offs). Previously H2H silently excluded play-offs \u2014 this change surfaces play-off meetings by default, matching user expectation. Set competition:"league" to restore the old H2H behaviour.',
        'Tool descriptions teach Claudio to compose filters from natural phrases: "home record", "in the play-offs", "since 2015", "in the 2000s" etc, and to combine them.',
        'NLS purge: sanitised user-facing references in error strings (matchId description, missingEventData note, fetch/parse error strings) so Claudio never surfaces the NLS name to end users.'
      ]
    },
    {
      version: '1.6',
      date: '17/04/2026',
      changes: [
        'getHeadToHead gains a `perspective` input parameter: clubA (default) | clubB | neutral. Neutral mode reframes the result column around the actual winner rather than W/D/L from one side. Description expanded to instruct Claudio on choosing the right perspective from user phrasing.'
      ]
    },
    {
      version: '1.5',
      date: '17/04/2026',
      changes: [
        'Updated getLeagueTable description to instruct Claudio to emit rendererPayload verbatim inside an nl-table fenced block. UI detects that and renders a full styled HTML table matching /history/league-tables-by-season v3.38i.',
        'Updated getHeadToHead description: mentions clubAHistory/clubBHistory for phrasing clubs who\'ve left our leagues ("haven\'t met in our competitions"), and mentions rendererPayload for styled last-5 tables with W/D/L pills.',
        'No schema shape changes — only enriched descriptions.'
      ]
    },
    {
      version: '1.4',
      date: '17/04/2026',
      changes: [
        'Added 5 historical tools: getHeadToHead (two-club all-time record with both-side lineage), getLeagueTable (any historical season/division with optional asOf date), getClubStreak (longest wins/unbeaten/losses/winless with 3 scope modes), getClubRecords (structured best/worst/notable), getStaff (RTDB staff lookup replacing inline directory).',
        'Total Claudio tool surface: 12 tools (6 live NLS + 6 historical + staff + web).',
        'No API/response shape changes — all tools return flat JSON or { error }.'
      ]
    },
    {
      version: '1.3',
      date: '17/04/2026',
      changes: [
        'Added getClubSummary tool. Returns total seasons, division breakdown (National/North/South), first/last season, and overall W/D/L/GF/GA/GD/winRate for any club, across the full 1979-80 onwards NL history.',
        'Powered by new ClaudioStats.gs engine — fetches results.json + clubs-meta.json + season-notes.json from thenationalleague/site repo, shards results.json per-season in CacheService (6hr TTL), exposes pure computation helpers.',
        'Fuzzy club name matching — "Altrincham" or "Dorking" resolve to canonical entities. Ambiguous inputs return a candidates list.',
        'Phoenix/merger lineage is opt-in (matches dashboard behaviour). Response surfaces relatedLineage options when available so Claudio can offer them to the user.'
      ]
    },
    {
      version: '1.2',
      date: '17/04/2026',
      changes: [
        'Fix: added firebaseRestURL_() and getFirebaseSecret_() helpers that the usage-tracking functions were calling. Previous v1.1 build assumed these existed in utils.gs but they did not, so every chat message hit a runtime error. No behaviour change — just the missing plumbing.'
      ]
    },
    {
      version: '1.1',
      date: '17/04/2026',
      changes: [
        'Added tool-use support for 6 tools: getStandings, getFixtures, getRecentResults, getMatchDetail, getTeamForm (NLS data), plus fetchNLSite (domain-locked web fetch for thenationalleague.org.uk only).',
        'getTopScorers DELIBERATELY OMITTED: NLS data has acknowledged gaps in per-match goal event entry, so any scorer-goals aggregation built on that would be unreliable. Users are redirected to /history/top-scorers instead.',
        'Tool-use loop caps at 3 iterations per user message to prevent runaway costs.',
        'NLS match-list fetches cached in CacheService for 5 minutes — repeat queries within the window are free.',
        'All aggregation (standings, top scorers, team form) happens in GAS before results are returned to Claude. Keeps per-message token cost low.',
        'Token usage now accumulates across all iterations in a tool-use loop for accurate billing.',
        'Web fetch is hard-locked to thenationalleague.org.uk at the tool level — the path parameter cannot override the domain.'
      ]
    },
    {
      version: '1.0',
      date: '17/04/2026',
      changes: [
        'Initial Claudio chat proxy. Anthropic /v1/messages endpoint, Haiku 4.5 model, prompt caching on system prompt.',
        'Daily message cap (50/user), rate limit (10/min), cost tracking per-user in RTDB.',
        'Dedicated CLAUDIO_ANTHROPIC_KEY script property (separate from Chase HQ for billing visibility).'
      ]
    }
  ];
}
// =============================================================================
// JACQUELINE TOOLS (v4.2)
// =============================================================================

/**
 * Fetch the handbook from private GitHub repo.
 * Token stored in GAS Script Properties as GITHUB_INTERNAL_TOKEN.
 * Cached in CacheService for 6 hours.
 */
function fetchInternalHandbook_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('handbook_md_v1');
  if (cached) return cached;

  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_INTERNAL_TOKEN');
  if (!token) {
    throw new Error('GITHUB_INTERNAL_TOKEN not configured in Script Properties');
  }

  var url = 'https://api.github.com/repos/thenationalleague/internal-docs/contents/handbook.md';
  var res = UrlFetchApp.fetch(url, {
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github.v3.raw'
    },
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('Handbook fetch failed: HTTP ' + code + ' — ' + res.getContentText().substring(0, 200));
  }

  var md = res.getContentText();
  // CacheService has a 100KB limit per value — chunk if needed
  if (md.length < 100000) {
    cache.put('handbook_md_v1', md, 21600);  // 6hr
  } else {
    // Split into chunks, store separately, reassemble on read
    var CHUNK = 90000;
    var nChunks = Math.ceil(md.length / CHUNK);
    cache.put('handbook_md_v1_meta', String(nChunks), 21600);
    for (var i = 0; i < nChunks; i++) {
      cache.put('handbook_md_v1_c' + i, md.substr(i * CHUNK, CHUNK), 21600);
    }
  }
  return md;
}

function fetchInternalHandbookCached_() {
  var cache = CacheService.getScriptCache();
  var direct = cache.get('handbook_md_v1');
  if (direct) return direct;
  var meta = cache.get('handbook_md_v1_meta');
  if (meta) {
    var n = parseInt(meta, 10);
    var parts = [];
    for (var i = 0; i < n; i++) {
      var p = cache.get('handbook_md_v1_c' + i);
      if (p === null) { return fetchInternalHandbook_(); }  // chunk missing — refetch
      parts.push(p);
    }
    return parts.join('');
  }
  return fetchInternalHandbook_();
}

/**
 * Parse the handbook markdown into a flat array of sections keyed by H3
 * heading ("### Holidays" etc). Also tracks the parent H2 for context.
 */
function parseHandbookSections_(md) {
  var lines = md.split('\n');
  var sections = [];
  var currentH2 = null;
  var currentSection = null;
  var buf = [];

  function flush() {
    if (currentSection) {
      currentSection.body = buf.join('\n').trim();
      sections.push(currentSection);
    }
    buf = [];
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^## [^#]/.test(line)) {
      flush();
      currentH2 = line.replace(/^##\s+/, '').trim();
      currentSection = null;
      continue;
    }
    if (/^### /.test(line)) {
      flush();
      var title = line.replace(/^###\s+/, '').trim();
      currentSection = { title: title, parent: currentH2, body: '' };
      continue;
    }
    if (currentSection) {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * Score a section's relevance to a query. Higher = better match.
 * Matches on title (weighted heavily) and body (weighted lightly).
 */
function scoreHandbookSection_(section, query) {
  var q = String(query || '').toLowerCase().trim();
  if (!q) return 0;
  var title = String(section.title || '').toLowerCase();
  var body = String(section.body || '').toLowerCase();

  // Extract query keywords — drop stopwords
  var stopwords = {
    'the':1,'a':1,'an':1,'of':1,'for':1,'and':1,'or':1,'to':1,'in':1,'on':1,'at':1,'with':1,
    'what':1,'is':1,'do':1,'does':1,'my':1,'our':1,'your':1,'can':1,'how':1,'when':1,'why':1,
    'about':1,'tell':1,'me':1,'i':1,'policy':1
  };
  var words = q.split(/\W+/).filter(function(w) { return w.length >= 3 && !stopwords[w]; });
  if (words.length === 0) words = [q]; // fallback

  var score = 0;
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    // Exact phrase in title: big boost
    if (title === w || title.indexOf(w) !== -1) score += 20;
    // Body hits — diminishing returns
    var bodyHits = 0;
    var from = 0;
    while (true) {
      var idx = body.indexOf(w, from);
      if (idx === -1) break;
      bodyHits++;
      from = idx + w.length;
      if (bodyHits >= 5) break;
    }
    score += bodyHits * 2;
  }

  // Extra boost for title synonyms on common topic shortcuts
  var TOPIC_SYNONYMS = {
    'holidays': ['holiday', 'annual leave', 'leave', 'vacation', 'days off'],
    'overtime and time off in lieu policy': ['lieu', 'toil', 'time off in lieu', 'overtime'],
    'expenses policy': ['expenses', 'expense', 'claim', 'mileage', 'reimburse'],
    'absence through sickness or injury': ['sickness', 'sick', 'ill', 'absence'],
    'hybrid working policy': ['hybrid', 'wfh', 'remote', 'working from home', 'home working'],
    'maternity leave': ['maternity', 'pregnant', 'baby'],
    'paternity leave': ['paternity'],
    'grievance procedure': ['grievance', 'complaint'],
    'disciplinary procedure': ['disciplinary', 'discipline'],
    'probationary period': ['probation', 'probationary'],
    'ai use policy': ['ai', 'chatgpt', 'claude', 'artificial intelligence'],
    'social media policy': ['social media', 'twitter', 'facebook', 'linkedin'],
    'data protection policy': ['gdpr', 'data protection', 'data'],
    'flexible working requests policy': ['flexible working', 'flexi']
  };
  var syns = TOPIC_SYNONYMS[title];
  if (syns) {
    for (var s = 0; s < syns.length; s++) {
      if (q.indexOf(syns[s]) !== -1) score += 15;
    }
  }

  return score;
}

function toolGetHandbookSection_(input) {
  var topic = String(input.topic || '').trim();
  if (!topic) return { error: 'topic is required' };

  var md;
  try {
    md = fetchInternalHandbookCached_();
  } catch (e) {
    return { error: 'Handbook unavailable: ' + (e.message || e) };
  }

  var sections = parseHandbookSections_(md);
  if (sections.length === 0) {
    return { error: 'Handbook parsed but no sections found' };
  }

  // Score all and take top 3
  var scored = sections.map(function(s) {
    return { section: s, score: scoreHandbookSection_(s, topic) };
  }).filter(function(x) { return x.score > 0; });

  scored.sort(function(a, b) { return b.score - a.score; });
  var top = scored.slice(0, 3);

  if (top.length === 0) {
    return {
      topic: topic,
      matched: [],
      note: 'No handbook sections matched "' + topic + '". Try different keywords.',
      availableTopics: sections.slice(0, 20).map(function(s) { return s.title; })
    };
  }

  return {
    topic: topic,
    matched: top.map(function(m) {
      // Truncate body if very long (>3000 chars) — keep first half
      var body = m.section.body;
      var truncated = false;
      if (body.length > 4000) {
        body = body.substring(0, 4000) + '\n\n[section truncated \u2014 refer to full handbook for complete text]';
        truncated = true;
      }
      return {
        title: m.section.title,
        parentSection: m.section.parent,
        body: body,
        truncated: truncated,
        matchScore: m.score
      };
    })
  };
}

// ---------- RTDB tools ---------
// Read from app-data/staff-holiday-lieu (same structure as the Holiday & Lieu
// tool's UI). All three tools respect the current-user UID captured in
// claudioChat() \u2014 users only see their own holiday/lieu, except
// getTeamAvailability which reads across the team.

function hlRead_(path) {
  var url = firebaseRestURL_('app-data/staff-holiday-lieu/' + path) +
    '.json?auth=' + getFirebaseSecret_();
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('RTDB read failed ' + res.getResponseCode() + ': ' + path);
  }
  var txt = res.getContentText();
  return txt === 'null' ? null : JSON.parse(txt);
}

function hlReadUsers_() {
  var url = firebaseRestURL_('users') + '.json?auth=' + getFirebaseSecret_();
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return {};
  return JSON.parse(res.getContentText() || '{}') || {};
}

function hlDefaultYear_() {
  return String(new Date().getFullYear());
}

function hlDatesBetween_(from, to) {
  // Inclusive list of YYYY-MM-DD strings
  var out = [];
  var d = new Date(from + 'T00:00:00Z');
  var end = new Date(to + 'T00:00:00Z');
  while (d.getTime() <= end.getTime()) {
    var y = d.getUTCFullYear();
    var m = String(d.getUTCMonth() + 1).padStart(2, '0');
    var dd = String(d.getUTCDate()).padStart(2, '0');
    out.push(y + '-' + m + '-' + dd);
    d.setUTCDate(d.getUTCDate() + 1);
    if (out.length > 366) break;  // safety
  }
  return out;
}

function hlExpandEntry_(e) {
  // Return array of {date, type, note, lieuDays?, overtimeSize?, overtimeAmPm?}
  // for each day spanned by the entry
  var dates = hlDatesBetween_(e.date, e.endDate || e.date);
  return dates.map(function(d) {
    return {
      date:          d,
      type:          e.type,
      note:          e.note || '',
      lieuDays:      e.lieuDays,
      overtimeSize:  e.overtimeSize,
      overtimeAmPm:  e.overtimeAmPm
    };
  });
}

function toolGetMyHolidayStatus_(input) {
  if (!CURRENT_USER_UID) {
    return { error: 'No user identity on this request \u2014 cannot look up your holiday.' };
  }
  var year = String(input.year || hlDefaultYear_());
  var uid  = CURRENT_USER_UID;

  var entries;
  try {
    entries = hlRead_('entries/' + uid) || {};
  } catch (e) {
    return { error: 'Could not read holiday entries: ' + (e.message || e) };
  }

  var yearPrefix = year + '-';
  var annualLeave = [];
  var otherLeave = [];    // office days etc \u2014 informational

  Object.keys(entries).forEach(function(k) {
    var e = entries[k];
    if (!e || !e.date) return;
    if (e.date.indexOf(yearPrefix) !== 0 && (e.endDate || '').indexOf(yearPrefix) !== 0) return;

    if (e.type === 'annual-leave') {
      hlExpandEntry_(e).forEach(function(d) {
        if (d.date.indexOf(yearPrefix) === 0) annualLeave.push(d);
      });
    } else if (e.type === 'office-day') {
      otherLeave.push({ date: e.date, type: e.type, note: e.note || '' });
    }
  });

  annualLeave.sort(function(a, b) { return a.date < b.date ? -1 : 1; });

  // Split taken vs booked based on whether date is in past or future (UTC)
  var today = new Date().toISOString().substring(0, 10);
  var taken = annualLeave.filter(function(d) { return d.date < today; });
  var booked = annualLeave.filter(function(d) { return d.date >= today; });

  return {
    user: CURRENT_USER_NAME,
    year: year,
    daysTaken: taken.length,
    daysBooked: booked.length,
    totalDaysScheduled: annualLeave.length,
    entitlementNote: 'Standard entitlement per handbook: 23 days base + 8 public holidays (rises to 25 after 5 years, 27 after 10). Check your contract for any bespoke entitlement. Bank holidays are separate.',
    taken: taken.slice(0, 30),
    booked: booked.slice(0, 30),
    truncated: (taken.length > 30 || booked.length > 30)
  };
}

function toolGetMyLieuStatus_(input) {
  if (!CURRENT_USER_UID) {
    return { error: 'No user identity on this request \u2014 cannot look up your lieu.' };
  }
  var year = String(input.year || hlDefaultYear_());
  var uid  = CURRENT_USER_UID;

  var earned, entries;
  try {
    earned  = hlRead_('lieu-earned/' + uid) || {};
    entries = hlRead_('entries/' + uid) || {};
  } catch (e) {
    return { error: 'Could not read lieu data: ' + (e.message || e) };
  }

  var today = new Date().toISOString().substring(0, 10);
  var yearPrefix = year + '-';

  // Earned: approved lieu
  var earnedList = [];
  var earnedDays = 0;
  var expiredDays = 0;
  Object.keys(earned).forEach(function(k) {
    var e = earned[k];
    if (!e || !e.dateWorked || e.status !== 'approved') return;
    if (e.dateWorked.indexOf(yearPrefix) !== 0) return;
    earnedList.push({
      dateWorked: e.dateWorked,
      days:       e.days,
      expiryDate: e.expiryDate,
      reason:     e.reason || '',
      expired:    e.expiryDate && e.expiryDate < today
    });
    earnedDays += (e.days || 0);
    if (e.expiryDate && e.expiryDate < today) {
      expiredDays += (e.days || 0);
    }
  });

  // Taken: lieu-taken entries
  var takenList = [];
  var takenDays = 0;
  Object.keys(entries).forEach(function(k) {
    var e = entries[k];
    if (!e || e.type !== 'lieu-taken' || !e.date) return;
    if (e.date.indexOf(yearPrefix) !== 0) return;
    var dates = hlDatesBetween_(e.date, e.endDate || e.date);
    dates.forEach(function(d) {
      if (d.indexOf(yearPrefix) !== 0) return;
      takenList.push({ date: d, note: e.note || '' });
      takenDays += 1;
    });
  });

  earnedList.sort(function(a, b) { return a.dateWorked < b.dateWorked ? -1 : 1; });
  takenList.sort(function(a, b) { return a.date < b.date ? -1 : 1; });

  return {
    user: CURRENT_USER_NAME,
    year: year,
    earnedDays: Math.round(earnedDays * 100) / 100,
    takenDays: takenDays,
    expiredDays: Math.round(expiredDays * 100) / 100,
    balanceDays: Math.round((earnedDays - takenDays - expiredDays) * 100) / 100,
    earned: earnedList.slice(0, 30),
    taken: takenList.slice(0, 30),
    policyNote: 'Per handbook: TOIL must be taken within one month of being earned unless exceptional circumstances are agreed in writing by the COO.'
  };
}

function toolGetTeamAvailability_(input) {
  // Reads all users\' entries for a date or range. Returns, per date,
  // the list of people on annual-leave or lieu-taken.
  var date = String(input.date || '').trim();
  var from = String(input.dateFrom || '').trim();
  var to   = String(input.dateTo || '').trim();

  if (!date && !(from && to)) {
    // Default to today + next 7 days
    var today = new Date().toISOString().substring(0, 10);
    from = today;
    var weekOut = new Date();
    weekOut.setUTCDate(weekOut.getUTCDate() + 7);
    to = weekOut.toISOString().substring(0, 10);
  }
  if (date) { from = date; to = date; }

  var dates = hlDatesBetween_(from, to);
  if (dates.length === 0) return { error: 'Invalid date range' };
  if (dates.length > 31) return { error: 'Date range too long \u2014 max 31 days' };

  var users, allEntries;
  try {
    users      = hlReadUsers_();
    allEntries = hlRead_('entries') || {};
  } catch (e) {
    return { error: 'Could not read team data: ' + (e.message || e) };
  }

  // Build {date: [{name, uid, type, note}]}
  var byDate = {};
  dates.forEach(function(d) { byDate[d] = []; });

  Object.keys(allEntries).forEach(function(uid) {
    var u = users[uid] || {};
    var userName = u.name || 'Unknown';
    var userEntries = allEntries[uid] || {};
    Object.keys(userEntries).forEach(function(k) {
      var e = userEntries[k];
      if (!e || !e.date) return;
      if (e.type !== 'annual-leave' && e.type !== 'lieu-taken') return;
      var spans = hlDatesBetween_(e.date, e.endDate || e.date);
      spans.forEach(function(d) {
        if (byDate.hasOwnProperty(d)) {
          byDate[d].push({
            name: userName,
            uid:  uid,
            type: e.type,
            note: e.note || ''
          });
        }
      });
    });
  });

  // Compact output: drop empty dates from summary if range > 1
  var out = [];
  Object.keys(byDate).sort().forEach(function(d) {
    out.push({ date: d, people: byDate[d] });
  });

  return {
    dateRange: { from: from, to: to },
    days: out,
    note: 'Only shows annual-leave and lieu-taken. Sickness and other absences not included.'
  };
}