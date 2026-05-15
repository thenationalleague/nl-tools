# NL Fan Widget — Handover Notes

**Source-of-truth template for building new fan-facing embed widgets that share the same shell as the Score Predictor (`embeds/score-predictor.html`).**

If you're spinning up a new embed (e.g. **MOTM selector**, polls, fan vote, etc.) on `thenationalleague.org.uk`, copy the Score Predictor as your starting point and swap only the *content* of the fixture rows + the *data shape* it writes to RTDB. Everything in this doc — auth, branding, header, navigator, sim, gate, layout, empty states — should stay identical so the family of widgets feels like one product.

The Score Predictor itself lives at:

```
embeds/score-predictor.html
```

Read that file alongside this doc. This document explains the *why* and the *invariants*. Code is the *what*.

---

## 1. Embed delivery model

- One single HTML file, copy-pasted into the CMS's "custom HTML" block on a page on `thenationalleague.org.uk` (Urban Zoo CMS).
- **The CMS strips external `<script src="…">` tags.** Inline `<script>` works. Any third-party JS (Firebase SDK) must be loaded dynamically via `document.createElement('script')` with `.onload` chaining.
- **The CMS does NOT strip `<style>`, `<link>`, or inline `<script>`.** Carbona is loaded via `@font-face` declared inline.
- Source of truth = the file in this repo. The CMS copy is a snapshot — re-paste on every change. No build pipeline.

## 2. File structure (single file)

```
<!-- header comment block: what the widget is, sim params, scope note -->
<div id="nlPredictor">     <!-- rename per widget, e.g. #nlMotm -->
  <div class="nlsp__sponsor"></div>     <!-- sponsor header        -->
  <div class="nlsp__banner" hidden></div><!-- top error/info banner -->
  <div class="nlsp__screen" hidden></div><!-- registration screen   -->
  <div class="nlsp__screen" hidden>      <!-- main screen           -->
    <div id="…datebar"></div>            <!-- matchday navigator    -->
    <div id="…hero"></div>               <!-- greeting + date       -->
    <div id="…fixtures"></div>           <!-- THE WIDGET CONTENT    -->
    <div id="…submitbar"></div>          <!-- save / submit         -->
    <div id="…reset"></div>              <!-- reset all link        -->
    <div id="…table"></div>              <!-- leaderboard           -->
  </div>
  <div class="nlsp__gate"></div>         <!-- loading + sign-in card -->
  <div class="nlsp__footer"></div>       <!-- enterprise mini-logo  -->
  <div id="…sim"></div>                  <!-- dev sim controls      -->
  <div class="nlsp__modal" hidden></div> <!-- confirm dialog        -->
</div>

<style>…</style>
<script>(function () { … })();</script>
```

Only one DOM tree, one CSS block, one IIFE. Everything scoped under the root `#id`.

## 3. CSS scoping + BEM prefix

- Every selector starts with `#nlPredictor` (or your widget's root id) to prevent style bleed in or out.
- Class names use a BEM-style prefix: `.nlsp__row`, `.nlsp__teamline`, `.nlsp__btn`, `.nlsp__modal-card`, etc.
- Pick a unique prefix per widget so multiple NL widgets on the same page never collide. For MOTM: `#nlMotm` + `.nlsm__`.
- `box-sizing: border-box` on the root + all descendants — host pages may use `content-box`.

## 4. Typography — Carbona Variable (inline)

```css
@font-face {
  font-family: "carbona-variable";
  src: url("https://use.typekit.net/af/184cf2/0000000000000000774c3175/31/l?primer=…&fvd=n4&v=3") format("woff2"),
       url("https://use.typekit.net/af/184cf2/0000000000000000774c3175/31/d?primer=…&fvd=n4&v=3") format("woff");
  font-display: swap;
  font-style: normal;
  font-weight: 200 900;
  font-stretch: normal;
}
```

Always pair `font-weight: N` with `font-variation-settings: 'wght' N` for cross-browser correctness on the variable font.

Weight ladder used throughout:
- 400 — body
- 600 — semi-bold prose
- 700 — pill / small-caps labels
- 800 — table headers, labels, team names
- 900 — titles, score numbers, primary buttons

Body base size **15px** fixed (not fluid `clamp()` — embeds don't own the viewport).

## 5. Brand tokens

Declared as CSS variables on the root:

```css
#nlPredictor {
  --primary:#9e0000;            /* NL red — CTAs, focus rings, active states */
  --navy:#223b7c;               /* table headers, dark surfaces (sparingly)  */
  --red:#d4380d;  --red-light:#fff1ec;      /* error                         */
  --green:#1a7030; --green-light:#edf7ee;   /* success / FT                  */
  --amber:#c96f15; --amber-light:#fef6ec;   /* warning                       */
  --info:#3b82f6;  --info-light:#eef2ff;    /* informational                 */
  --gold:#b8860b;  --gold-light:#fff5d4;    /* own-team / exact pill         */

  --white:#ffffff; --off-white:#f4f6f9;
  --text:#1a2a44; --text-muted:#5a6a82;
  --border:#dde3ed;

  --radius:6px;
  --shadow:0 2px 12px rgba(10,22,40,.10);

  font-family:'carbona-variable','carbona',sans-serif;
  font-size:15px; line-height:1.5;
  font-variation-settings:'wght' 400;
  color:var(--text); -webkit-font-smoothing:antialiased;
  max-width:680px; margin:24px auto; padding:0 12px;
}
```

**Brand notes:**
- Red `#9e0000` is the only red used as a brand accent. Reserve `--red` for *error* signalling (different shade).
- Navy `#223b7c` is reserved for "secondary surfaces" — use sparingly, not as bulk row background.
- Gold `--gold` signals multipliers (own-team boost, exact-score "champion" pill).
- **Sponsor accent** is Enterprise green `#34ab56` — used only as the 2px hairline under the sponsor strip.

## 6. Sponsor header (the black bar)

Three-column grid: Enterprise left, "WIDGET TITLE" centred, NL division logo + user team crest right.

```
[Enterprise]              SCORE PREDICTOR              [NL] [team]
```

- **Always visible**, including during loading and signed-out states.
- The team crest only appears once the user has registered.
- The NL division logo changes based on the user's team (`assets/divisions/National.png` / `North.png` / `South.png` — derived from the team's `competitionID`).
- For a new widget: swap the centre title (e.g. `MAN OF THE MATCH`).

Render is called from `boot()` *after* `state` and the comp-lookup helpers are defined (this matters — see §17).

## 7. Footer

Single muted Enterprise logo, centred at the bottom, divided from the leaderboard by a thin border. Always visible. Brand-respectful — no large lockups.

## 8. Authentication: SSO + Firebase Anonymous Auth

Two distinct identity layers:

### 8a. NL+ SSO (Sports Alliance / Two Circles)

- Fans sign in via `https://signin.thenationalleague.org.uk/auth/login`.
- After successful sign-in, the SSO sets a cookie `_gc_sa_sso_access` on `.thenationalleague.org.uk`.
- It's a **JWT** (`alg: HS256`) — JS-readable on www and beta.
- Decoded payload contains the fields we use:

```json
{
  "id":             "Urj5sV0gKEC1RIh20Tt2dg",   // canonical user ID (use this as RTDB key)
  "forename":       "Richard",
  "surname":        "Dorman",
  "email":          "rckdorman@gmail.com",
  "favourite_team": "Solihull Moors",            // used as registration default
  "tenant_id":      "EBLzD6derkq3NH7m9Rp2mQ"    // NL tenant — see sign-in URL below
}
```

We can't *verify* the signature (HS256 needs the shared secret) — we just decode and trust. Acceptable threat model because the `id` claim is a 22-char opaque random string (not enumerable).

### 8b. Firebase Anonymous Auth

Used purely so RTDB rules can be `auth != null`. The Firebase UID has no relation to the JWT id — we key data by JWT id everywhere.

### Sign-in URL pattern

The CTA on the signed-out gate links to the exact URL shape the NL site itself uses:

```
https://signin.thenationalleague.org.uk/auth/login
  ?tenantid=EBLzD6derkq3NH7m9Rp2mQ
  &returnvisitorurl=<encoded current href>
  &successredirecturl=<encoded current href>
  &loginSuccess=true
  &mandatory=false
```

`SSO_TENANT_ID = 'EBLzD6derkq3NH7m9Rp2mQ'` is hardcoded as a constant. Both redirect params are set to `window.location.href` so the fan lands back on the predictor regardless of subdomain (beta/www).

### JWT detection (race-safe)

The SSO cookie is sometimes not on `document.cookie` immediately at script load — Nuxt hydration / SSO middleware writes it asynchronously. `waitForJwt(4000)` polls every 200ms for up to 4 seconds before deciding the user is signed out and rendering the sign-in card. While waiting, the gate's spinner card stays visible. On cached/refresh visits the synchronous first check resolves immediately.

## 9. Loading & signed-out gate

One centred card (`#…-gate`) handles both. No blur, no overlay, no fake placeholder fixtures. Two modes:

1. **`renderGateLoading()`** — NL+ red lozenge logo + spinner + "Loading…". Shown from script load all the way through Firebase init + fixtures fetch.
2. **`renderGateSignIn()`** — NL+ logo + "Sign in with NL+ to play for free" + a single primary button with the sign-in URL.

`NLPLUS_LOGO_URL` is a constant pointing at `assets/logos/NL+ red lozenge.png` (served via raw.githubusercontent.com).

`hideGate()` is called inside the first `listenAll` listener firing — i.e. the moment data lands and the predictor is ready to display.

## 10. RTDB project

```js
var FIREBASE_CONFIG = {
  apiKey:            'AIzaSyB3-woStjYeeEJxfGPXkoIaO48zCzQ3mA0',
  authDomain:        'nl-score-predictor.firebaseapp.com',
  databaseURL:       'https://nl-score-predictor-default-rtdb.europe-west1.firebasedatabase.app',
  projectId:         'nl-score-predictor',
  storageBucket:     'nl-score-predictor.firebasestorage.app',
  messagingSenderId: '164767666899',
  appId:             '1:164767666899:web:6a2320d96fa2dd2009fa26'
};
var APP_NAME = 'nlPredictor';  // named app — prevents clashes with other NL widgets on the same page
```

**For a new widget**: spin up a **new dedicated Firebase project** (e.g. `nl-motm`). Keep fan/consumer data isolated from the staff `nl-tools` project. Repeat the setup:

1. Create project → enable Realtime Database (europe-west1) → start in locked mode.
2. Authentication → Sign-in method → enable **Anonymous**.
3. Authentication → Settings → Authorized domains → add `www.thenationalleague.org.uk`, `beta.thenationalleague.org.uk`, `thenationalleague.org.uk`.
4. Realtime Database → Rules → paste the rules JSON (see `score-predictor.rules.json` for the template).
5. Project Settings → Web App → grab the `firebaseConfig` snippet → drop into the widget.

### Firebase SDK loaded dynamically

```js
var FB_SDK_URL = 'https://www.gstatic.com/firebasejs/10.12.0/';
var FB_SDK = ['firebase-app-compat.js','firebase-auth-compat.js','firebase-database-compat.js'];
function loadFirebase() {
  return FB_SDK.reduce(function (p, name) {
    return p.then(function () { return loadScript(FB_SDK_URL + name); });
  }, Promise.resolve());
}
```

Use compat SDK (v10.12.0) — same API as the rest of `tools/` so behaviour is familiar.

Init with a **named app** so multiple NL widgets on the same page don't conflict:

```js
fbApp  = firebase.initializeApp(FIREBASE_CONFIG, APP_NAME);
fbAuth = firebase.auth(fbApp);
fbDb   = firebase.database(fbApp);
```

## 11. RTDB schema (Score Predictor — model for the new widget)

```
users/{jwtId}
  ├─ teamId          string
  ├─ teamName        string
  ├─ crestUrl        string
  ├─ forename        string
  ├─ surnameInitial  string
  ├─ email           string
  └─ registeredAt    number (server timestamp)

predictions/{jwtId}/{matchday}/{matchId}
  ├─ home            number (0..20)
  ├─ away            number (0..20)
  ├─ joker           boolean (legacy field — always false now)
  └─ submittedAt     number (server timestamp)
```

**For MOTM**, replace `predictions/` with whatever shape MOTM needs (e.g. `motm/{jwtId}/{matchId}` → `{ playerId, submittedAt }`). Keep `users/` identical — same registration model.

### Rules pattern

Anyone authed can read all data (leaderboards). Writes are scoped per-`$matchId` with field validation. Top-level deny by default. Registration is **create-only** (`!data.exists()`) so the team lock is immutable.

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "users": {
      ".read": "auth != null",
      "$jwtId": {
        ".write": "auth != null && !data.exists()",
        ".validate": "newData.hasChildren(['teamId','teamName','forename','registeredAt'])",
        "teamId":         { ".validate": "newData.isString() && newData.val().length <= 20" },
        "teamName":       { ".validate": "newData.isString() && newData.val().length <= 80" },
        "crestUrl":       { ".validate": "newData.isString() && newData.val().length <= 400" },
        "forename":       { ".validate": "newData.isString() && newData.val().length <= 50" },
        "surnameInitial": { ".validate": "newData.isString() && newData.val().length <= 2" },
        "email":          { ".validate": "newData.isString() && newData.val().length <= 200" },
        "registeredAt":   { ".validate": "newData.isNumber()" }
      }
    }
    /* …per-feature subtree(s) here… */
  }
}
```

**Important rules gotcha**: don't `.remove()` a parent path (e.g. `predictions/{jwtId}/{matchday}`) — the rules only grant `.write` at the `$matchId` level so deleting the parent 403s. Reset by `.update(nulls)` on the parent with each child key mapped to `null` — each individual delete satisfies the per-child write rule.

## 12. Registration (one-time team lock)

First-visit flow: registration screen, full team list across all 3 NL divisions (grouped by `<optgroup>`), defaulting to the user's `favourite_team` claim if it matches.

Saved registration is **immutable** (rule: `auth != null && !data.exists()`). No edit, no delete. Fan-facing: *"This locks for the season. Pick carefully — you can't change your team later."*

For MOTM: same registration screen, same RTDB shape, same lock policy. The team determines which division's matches the user sees + ranks against.

## 13. Multi-competition support

All three NL divisions wired:

```js
var COMPS = {
  89:  { id: 89,  name: 'National Division',     shortName: 'National', logoFile: 'National.png' },
  373: { id: 373, name: 'National League North', shortName: 'North',    logoFile: 'North.png'    },
  372: { id: 372, name: 'National League South', shortName: 'South',    logoFile: 'South.png'    }
};
var COMP_IDS = Object.keys(COMPS).map(Number);
var DEFAULT_COMP_ID = 89;
```

**Fetch fans out across all three competitions in parallel** (`Promise.all(COMP_IDS.map(fetchCompetition))`) — adds ~1s to first load but only once. Pagination is via `page.number` (max 10 pages = 1000 matches per comp; season is ~550).

**Team → competition lookup is derivable from the merged fixture list** — no schema change needed for existing registrations:

```js
function teamCompId(teamId) { /* walks state.allMatches to find any match with this team */ }
function userCompId() { return state.registration ? teamCompId(state.registration.teamId) : null; }
```

Filters apply at three points:
- `recomputeMatchday()` — only matches in user's comp
- `uniqueMatchdayKeys()` (drives the datebar) — only matchdays in user's comp
- `renderTable()` — leaderboard scoped to fellow-division players

## 14. Fixture API

Endpoint: `https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2/matches/`

Public; no auth; CORS open from any origin.

Query: `?competitionID={id}&seasonID={year}&sort=kickOffDateUTC&page.number={n}&page.size=100`

Sort is documented as "ascending" but in practice returns newest-first regardless — **paginate through all pages** rather than relying on sort direction.

Match object shape:

```json
{
  "id": "g2578817",
  "type": "matches",
  "attributes": {
    "kickOffDateUTC": "2025-08-09 15:00:00",  // UTC, no 'T' separator — normalise with .replace(' ','T') + 'Z'
    "matchPeriod": "PreMatch",                  // see enum below
    "competitionID": 89,
    "homeTeam": { "teamID": "t434", "name": "York City", "shortName": "York", "crest": "…", "score": null },
    "awayTeam": { "teamID": "t2479", "name": "Rochdale", "shortName": "Rochdale", "crest": "…", "score": null }
  }
}
```

### `matchPeriod` enum

| Value | Meaning | State |
|---|---|---|
| `PreMatch` | Not started | `pre` (or `future` if >7 days) |
| `FirstHalf` / `HalfTime` / `SecondHalf` / `ExtraTime` / `Penalties` | In progress | `live` |
| `FullTime` / `PostMatch` | Finished | `post` |
| `Postponed` | Postponed | `postponed` — render void, no scoring |
| `Abandoned` | Abandoned | `abandoned` — render void, no scoring |

### Computed state per match (`stateOf(m, now)`)

- `postponed` / `abandoned` — taken straight from `matchPeriod`.
- `future` — KO is >168h (7 days) from now. Predictions not yet open.
- `pre` — within 7 days of KO. Editable.
- `live` — KO has happened, KO + 105 min hasn't.
- `post` — KO + 105 min has passed.

## 15. Matchday navigator (the datebar)

Horizontally scrollable strip of every matchday in the season (in the user's division). Pill per matchday with `WED 6 AUG` / `SAT 9 AUG` format.

- **Default selection**: today (in BST) if today has matches; otherwise the next upcoming matchday after `simNow()`. Today's date pill gets a red border even when not active.
- **Click to select** — `setSelectedMatchday(key)` re-runs `recomputeMatchday()` and re-renders.
- **Click-drag scroll** for desktop mice. Threshold 15px before drag engages. `is-dragging` class only applied once a real drag starts (NOT on plain `mousedown`) — otherwise `pointer-events: none` on child pills swallows clicks. Suppress synthetic click after drag via capture-phase listener keyed off a `didScroll` boolean.
- **Touch viewports** keep native momentum scroll.
- Active pill auto-`scrollIntoView({ inline: 'center' })` on render.

## 16. Sim datetime (dev / demo only)

Two separate `<input type="date">` + `<input type="time">` (NOT `datetime-local` — it has a typing quirk where minute "4" auto-commits to "04"). Plus a "Now" button to clear back to the real clock.

URL flag: `?sim=<ISO>` (e.g. `?sim=2025-08-09T14:00:00Z`). `?sim=off` explicitly disables. No param = real clock. Default is visible during dev.

Sim drives:
- `simNow()` — what time is "now" for state computation
- `defaultMatchdayKey()` — what matchday to navigate to by default

Decoupling between `state.selectedMatchday` (explicit user choice from the navigator) and `state.sim.fixed` (what time is "now") means you can browse a Saturday's fixtures while simulating from a Tuesday in a different month, to test future-locked states.

In production you can hide the sim controls entirely via `?sim=off`.

## 17. Load order (critical!)

The IIFE order matters. `var` declarations hoist but stay `undefined` until their line executes; function declarations hoist completely.

**Rule**: don't call `renderSponsor()` / `renderFooter()` at script-load time — they read `state.registration` and call `userCompId()`, both of which need their declarations to have run.

Always call them from inside `boot()`, which runs at the *end* of the IIFE:

```js
(function boot() {
  renderSponsor();
  renderFooter();
  renderGateLoading();
  waitForJwt(4000).then(function (claims) {
    if (!claims || !claims.id) { renderGateSignIn(); return; }
    startSignedIn(claims);
  });
})();
```

This bit me once on the Score Predictor — sponsor rendered an empty black bar and nothing else loaded because `state` was undefined when `renderSponsor` ran.

## 18. Per-row state machine (pattern to copy)

Each fixture row goes through these states. The pattern is reusable for MOTM (just replace "submit prediction" with "pick MOTM"):

| State | Meaning | UI |
|---|---|---|
| `empty` | No prediction made yet, pre-KO, within edit window | Editable inputs / picker |
| `submitted` | Prediction saved, pre-KO | Locked display + hover "EDIT" pill on right edge |
| `editing` | User re-opened row | Editable inputs + inline SAVE / CANCEL controls under the row |
| `future` | More than 7 days from KO | Locked, "Opens Sat 16 Aug" |
| `live` | Match in progress | Locked, pulse dot + "Live", show user's prediction |
| `post` | Match finished | Final score, verdict, points pill |
| `postponed` / `abandoned` | API matchPeriod | Greyed, "Prediction voided" |

**Hover EDIT pill** sits absolutely on the right edge of the row, opacity 0 → 1 on row hover (always slightly visible on touch). Click → enters `editing` state. SAVE / CANCEL appear inline under the row, never as floating buttons.

## 19. Submit / save / reset

- **Bulk submit** (`#…submitbar`) — disabled until every awaiting row has full input. One RTDB `.update()` writes all rows in one batch.
- **Per-row save** — when re-opening a submitted row, SAVE / CANCEL controls. Save is explicit (not blur-to-save), because blur was too implicit and the user wanted a clear confirm.
- **Reset all** — small underlined "Reset all predictions" link between fixtures and leaderboard. Only shown when every match is still pre-KO. Custom in-widget confirm modal (not `window.confirm()`). Reset via per-child `null` update, not parent `.remove()`.

## 20. Empty states

When `state.matches` is empty, `seasonBoundary()` picks one of three messages:

- **`before`** (sim earlier than first matchday): *"Predictor not available yet. National Division kicks off on Saturday 9 August. Predictions open seven days before each match."*
- **`after`** (sim later than last matchday): *"Season ended. National Division wrapped up on Saturday 26 April. See you next season."*
- **in-season, no fixtures on this date**: *"No matches on this date. Pick another date above — National Division isn't playing on 2025-08-12."*

Rendered as a centred white card consistent with the rest of the widget.

## 21. Leaderboard

Per-division (filtered to fellow-comp players via `teamCompId`), cumulative all-time. Will be expanding to two filter dimensions (Group × Period) — see the leaderboard design discussion in the chat history. The leaderboard subscribes to the same `state.allUsers` and `state.allPreds*` data already loaded; no extra RTDB reads.

## 22. Asset paths

All assets in this repo, served via `https://raw.githubusercontent.com/thenationalleague/tools/main/…`. URL-encode `+` and spaces (`%2B`, `%20`) when constructing URLs from filenames.

- **NL+ logos** — `assets/logos/NL+ red lozenge.png`, `NL+ red square.png`, `NL+ white lozenge.png`, `NL+ white square.png`
- **Enterprise sponsor** — `assets/partners/Enterprise.png`
- **Division logos** — `assets/divisions/National.png`, `North.png`, `South.png`
- **Club crests** — `assets/crests/{Full Club Name}.png` (fallback to API's `homeTeam.crest` first — that's a CDN URL)

Always include an `onerror="this.onerror=null;…"` fallback on every `<img>` to prevent retry loops if an asset moves.

## 23. Brand do's and don'ts

- ✅ Carbona Variable, system fallback only
- ✅ Brand red `#9e0000` only as accent
- ✅ Gold `#b8860b` only for multiplier signals
- ✅ Enterprise green `#34ab56` only on the sponsor hairline
- ❌ No gold/amber Vanarama-era branding
- ❌ No dark text on `#9e0000` — always white
- ❌ Don't `position: fixed` inside the embed — fights the host page's sticky nav
- ❌ Don't load `nl-brand.css` / `nl-topbar.js` / `auth-guard.js` — these are portal-only

---

## What to change for the MOTM widget

Going widget-by-widget, here's what likely needs to differ — everything else stays.

| Layer | Score Predictor | MOTM (proposed) |
|---|---|---|
| Root ID | `#nlPredictor` | `#nlMotm` |
| BEM prefix | `.nlsp__` | `.nlsm__` |
| Sponsor title | `SCORE PREDICTOR` | `MAN OF THE MATCH` |
| RTDB project | `nl-score-predictor` | new `nl-motm` project |
| `APP_NAME` | `nlPredictor` | `nlMotm` |
| Data shape | `predictions/{jwtId}/{matchday}/{matchId}` → `{home, away, …}` | `motm/{jwtId}/{matchId}` → `{playerId, playerName, submittedAt}` |
| Per-row UI | two score inputs | dropdown / radio of players for that fixture |
| Per-row save | `home`+`away` required | `playerId` required |
| Scoring | 3 pts exact / 1 pt right outcome / multipliers | TBD (most votes win, or per-fixture leaderboard) |
| Leaderboard | per-fan total points | possibly per-player vote counts |
| Player data | n/a | TBD — separate MD coming for the player endpoint |

Everything else — auth, gate, sponsor, datebar, sim, registration, comp filtering, empty states, footer, modal, click-drag — copy verbatim.

---

## Pre-flight checklist for a new widget

- [ ] Spin up a new Firebase project (e.g. `nl-motm`), enable RTDB + Anonymous auth, add the three authorized domains.
- [ ] Paste the rules template (adjust the per-feature subtree).
- [ ] Copy `embeds/score-predictor.html` to `embeds/<new-widget>.html`.
- [ ] Rename `#nlPredictor` → `#nlYourWidget`, `.nlsp__` → `.nly__` throughout.
- [ ] Swap `FIREBASE_CONFIG` to the new project's config.
- [ ] Swap `APP_NAME`.
- [ ] Change the sponsor centre title.
- [ ] Replace fixture-row HTML + `rowHTML()` body with the new functionality.
- [ ] Replace `submitDrafts()` / `saveEdited()` / `renderReset()` to write the new shape.
- [ ] Keep auth, gate, datebar, sim, registration, multi-comp logic untouched.
- [ ] Drop into a `www.` page and check both signed-in and signed-out flows.
