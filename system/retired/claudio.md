# Claudio – retired 30/10/2026, rebuild intended

The tool is deleted: `claudio/index.html`, `gas/ClaudioChat.js`, `gas/ClaudioStats.js`, its avatar `assets/icons/claudio.svg`, and its parked registry record. This file records what it was for and what was already decided, so a rebuild starts from the answered questions. **Nothing here is built.** Last version in git: commit `6a0ae99` (`git checkout 6a0ae99 -- claudio gas/ClaudioChat.js gas/ClaudioStats.js`).

## What it did

It was an AI assistant for NL staff, at `/claudio/` (`staff-claudio`). Staff chatted with a small "team" of personas, and each persona had its own job, voice and set of data tools. It answered questions on National League history from 1979-80 onwards and on the current season from the live NLS feed. It drafted emails and statements, and answered HR questions from the staff Company Handbook and the user's own holiday and lieu records. Conversations were saved per user and could be reopened, renamed and deleted.

The page sent each message to the consolidated Apps Script web app (`action: 'claudio'`). Apps Script called the Anthropic Messages API, ran any tool calls, and returned the reply with token counts and a cost in pence.

Four days built nearly all of it: v1.0 on 17/04/2026 to v4.2 on 20/04/2026. Later versions only migrated it to the canon.

## The personas

| Persona | Job | Tools | Voice |
|---|---|---|---|
| **Claudio** | Front desk and router | `getStaff`, `fetchNLSite` | Warm, paternal, Ranieri-inflected English with a single Italian opener ("Allora…", "Certo!"). Hard rules against pidgin, phonetic spelling and translating the Italian. |
| **Roger** | Club historian, 1979-80 onwards | 25 historical tools plus a read of the current table | A retired librarian with trainspotter energy, neutral across all clubs, at most one tangent per reply |
| **Seth** | Current season, live data | `getStandings`, `getFixtures`, `getRecentResults`, `getMatchDetail`, `getTeamForm` | A young journalist in a BBC Sport register. Team names and scores in bold. |
| **Mark** | Comms and drafting | `getStaff` only, for resolving names | A brisk editor. Drafts came in fenced blocks that rendered with a Copy button. |
| **Jacqueline** | HR, handbook and leave | `getStaff`, `getHandbookSection`, `getMyHolidayStatus`, `getMyLieuStatus`, `getTeamAvailability` | Warm and human |

Each persona had its own typeface, all from one Adobe Fonts kit. The kit stays because the TOTW graphic uses it too. Each persona also had its own identity colour (`--persona-*`), kept tool-local by the nl-brand policy.

## The decisions that were settled

- **Model:** Haiku 4.5 (`claude-haiku-4-5-20251001`) at $1/$5 per million input/output tokens. Max 2,048 output tokens, and the system prompt was marked for prompt caching.
- **One key per tool.** Claudio had its own Anthropic key so its spend showed separately on the bill.
- **Limits:** 50 messages per user per day (UK day), 10 messages a minute, the last 15 messages sent as history, and at most 3 tool rounds per message. Each reply showed its cost, and Apps Script recorded a daily count and cost per user.
- **Routing settled on a switchboard** (v4.1), after three other designs failed (see below):
  - A tiny classifier call of about 500 tokens, with no tools, returns one token: `ROUTE:roger|seth|mark|jacqueline` or `SELF:greet|staff|procedural|chat|unknown`.
  - A `ROUTE:` verdict calls the specialist directly.
  - `SELF:greet` makes no second call; the page picks one of six canned greetings.
  - Any other `SELF:` verdict lets Claudio answer.
  - Expected cost per turn: about 500 tokens for "hello" and about 7,500 for a specialist answer.
- **Each persona's tool allowlist was enforced twice:** in the tool list sent to the model, and again when a tool call was run. The second check was added after Claudio called a tool he was never given.
- **Totals and summaries are computed on the server, not by the model.** Tools returned small, flat JSON. The model never saw raw match lists.
- **No top-scorers tool.** NLS goal events have known gaps, so a summed total cannot be trusted (see `single-fixture-and-top-scorers.md`).
- **Never name NLS to users,** and never send them to another site.
- **Web fetch only from the League's own site,** `www.thenationalleague.org.uk`.
- **Rules the prompts enforced, each one learned the hard way:**
  - Pass club names to tools exactly as the user wrote them. Spelling fixes are fine; swapping one real club for another is not.
  - Ask before combining phoenix or merger lineage.
  - Never invent a name. Use a first name alone, a `[SURNAME]` placeholder, or look the person up with `getStaff`.
  - For record or history questions, call the honours tools rather than guess at titles.
  - List plainly what the data does not hold: attendance, referees, goalscorers, managers, stadiums, bookings.
- **Two registers.** The chat used the persona's voice. Anything the user would send on was written in plain NL British English.
- **Rich tables.** Tools returned a `rendererPayload`, and the page drew it as a styled table from an `nl-table` fenced block. Unclosed or malformed blocks were dropped quietly, so the answer survived in the prose.
- **Access:** league audience only. Staff could use it, admin and superadmin could manage, and club roles were off.

## The hard problems it hit

**1. The backend trusted the browser.** This is the reason it cannot simply be switched back on. The request body carried `uid`, `isAdmin`, the system prompt and every specialist prompt, and nothing checked an ID token. Anyone with the public `/exec` URL could:
- spend the key with any system prompt they liked, which made it an open Anthropic proxy;
- skip the daily cap by sending `isAdmin: true`;
- pass anyone's `uid` and read that person's holiday and lieu through Jacqueline;
- get every staff member's email and line manager from `getStaff`.

The page also read the whole `users` node to build its staff list. The dispatch line was commented out on 15/08/2026 for exactly this reason. A rebuild takes the uid from a verified token and keeps all prompts on the server.

**2. A callable is not available.** The migration plan says "callable, key from Secret Manager, gated by native auth", but an org policy now blocks public invokers on new Cloud Run services, so a new callable cannot be created (see Phase 1 of `gas-to-functions-migration.md`). The tested alternative is an RTDB-triggered function, but NL Cup Footage measured **15–20 seconds** of trigger latency, which is a poor fit for chat. Which route to take is the first question for a rebuild. The secret side is solved: `defineSecret` is already used in `functions/`.

**3. Tokens per minute, and the route to the switchboard.** Four designs were tried in two days:
- **Two calls with handoff markers.** The second call hit 429 rate limits.
- **Single-call "theatre",** with Claudio performing every voice. All 17 tool definitions went into every call, so "hello" cost about 10k tokens.
- **Gated two calls.** Better, but still about 4–5k tokens for "hello".
- **The switchboard,** which was kept.

Other cost fixes along the way:
- The tool definitions had grown to 6.6k tokens and were compressed to 3.4k.
- A first message once carried a 37k-token system prompt (club metadata, season notes and tables pasted in whole), costing up to 5p. Tools replaced it.
- One turn reached 25k tokens because a failing tool was retried with the same input, so a guard now stops a repeat of a failed call.
- Rate-limit errors became an in-voice "go direct" chip with a 45-second cooldown.

**4. The model made things up.** Examples:
- It invented a surname for a real senior figure in a press-release quote.
- It silently changed "Team Bath" to "Bath City".
- It guessed at a club's titles from summary figures.
- It told a user there was "no Roger in the staff directory".

Each one became a prompt rule above. Mark got `getStaff` because of the first.

**5. The data was too big for Apps Script.** Roger's engine (`ClaudioStats`) worked from three files in the `site` repo: `results.json` (7.3MB), `clubs-meta.json` and `season-notes.json`. These were the same files behind the website's `/history/*` dashboards, and the engine reproduced their logic, including the season-by-season points rules and the points-per-game ranking for the COVID seasons. CacheService allows only 100KB per value, so the results were split by season and division and cached for 6 hours. A rebuild should read the results archive from somewhere built for it instead.

**6. Bugs a rebuild should not repeat:**
- **The usage paths never matched.** Apps Script wrote `claudio/usage/<uid>/<day>` at the database root, but the page read `app-data/staff-claudio/usage/...`. The daily counter therefore showed 0 after every reload.
- **HR questions never reached Jacqueline from the front desk.** The front desk sent prompts for Roger, Seth and Mark only, so a `ROUTE:jacqueline` verdict fell back to Claudio.
- **The season was hard-coded.** `NLS_SEASON_ID = 2025` was never bumped, so Seth would have served 2025/26 all through 2026/27.
- **The page and the backend disagreed on when the season changes.** The page's context switched on 1 August and Seth's on 1 July. That disagreement is what produced the canon `NL.season.fromDate`.

**7. HR data sources.** The handbook came from a private GitHub repo through a token in Script Properties, split into sections and cached. Leave data came from `app-data/staff-holiday-lieu`, and **Holiday & Lieu was retired the same day** (`holiday-lieu.md`). A rebuilt Jacqueline needs a new source for both.

## What stays behind

**RTDB data, not deleted.** Export or delete it from the Firebase console.
- `app-data/staff-claudio/conversations/<uid>/<conversationId>`: every user's chat history (title, persona, timestamps, messages). It may include HR questions, so treat it as personal data.
- `app-data/staff-claudio/usage/<uid>/...`: read by the page and never written by anything, so probably empty.
- `claudio/usage/<uid>/<yyyy-mm-dd>` **at the database root**: the real daily counts, costs and token figures, written by Apps Script with the legacy secret. No rules entry covers it, so only the console can reach it.

**Rules.** The `app-data/staff-claudio` block stays in the deployed rules until the next **Button · Publish database rules** run. It gives conversations owner read/write for superadmin, admin and staff roles, and usage owner read with no writes. The role check was written by hand; a rebuild should generate it with `scripts/rtdb-level-rule.mjs`.

**Apps Script.**
- **The two files stay in the live project until someone runs Button · Publish Apps Script.** Until then they are unreachable, because the dispatch line is gone from `gas/Code.js`.
- **Publish straight after merging.** Timer · Back up Apps Script pulls live into the repo every morning, so if it runs before the publish it will try to commit both files back.
- **Script Properties to delete, and revoke at source:**
  - `CLAUDIO_ANTHROPIC_KEY`, `ANTHROPIC_KEY` (shared with the retired Chase HQ) and `MEETING_NOTES_ANTHROPIC_KEY`: revoke in the Anthropic console.
  - `GITHUB_INTERNAL_TOKEN`: only the handbook tool used it. Revoke on GitHub.
  - `RTDB_SECRET`: keep it, because other Apps Script files still use it.

**Cost.** Nothing runs, and there has been no Anthropic spend since the door shut on 15/08/2026. The only remaining risk is the live keys, which stay live until they are revoked.

## Why it went

It reached an impressive shape fast, then stalled. It was taken off the portal as needing "serious work before it is genuinely useful", and its backend was shut on 15/08/2026 because a public web app forwarding to Anthropic was a bill waiting for a stranger. Since then it has been 5,467 lines of page and 6,444 lines of Apps Script that every canon sweep had to drag along, with nothing running. Its security model cannot be fixed inside Apps Script, and the HR half's data source went the same day. The personas, the switchboard and the prompt rules above are the parts worth keeping; the code is not.
