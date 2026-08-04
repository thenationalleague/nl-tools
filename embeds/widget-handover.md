# NL Fan Widget — Handover Notes

**Source-of-truth template for building new fan-facing embed widgets that share the same shell as the Score Predictor (`embeds/score-predictor.html`).**

If you're spinning up a new embed (e.g. **MOTM selector**, polls, fan vote, etc.) on `thenationalleague.org.uk`, copy the Score Predictor as your starting point and swap only the *content* of the fixture rows + the *data shape* it writes to RTDB. Everything in this doc — auth, branding, header, navigator, sim, gate, layout, empty states — should stay identical so the family of widgets feels like one product.

The Score Predictor itself lives at:

```
embeds/score-predictor.html
```

Read that file alongside this doc. This document explains the *why* and the *invariants*. Code is the *what*.

---

> **Auth hardening is outstanding.** Both widgets sign in to Firebase
> anonymously, so security rules cannot assert record ownership — see
> [`auth-hardening-plan.md`](auth-hardening-plan.md) for what is exposed and
> the plan to fix it. Do it before the widgets go public.

## 1. Embed delivery model

- One single HTML file, copy-pasted into the CMS's "custom HTML" block on a page on `thenationalleague.org.uk` (Urban Zoo CMS).
- **The CMS strips external `<script src="…">` tags.** Inline `<script>` works. Any third-party JS (Firebase SDK) must be loaded dynamically via `document.createElement('script')` with `.onload` chaining.
- **The CMS does NOT strip `<style>`, `<link>`, or inline `<script>`.** Carbona is loaded via `@font-face` declared inline.
- Source of truth = the file in this repo.

### Hosted delivery (score-predictor) — no more re-pasting

The score-predictor is additionally published as a **hosted bundle** at
`https://nl.tools/embeds/score-predictor.js`, generated from the HTML by
`scripts/build-embeds.js` and rebuilt on every push to `main` by
`.github/workflows/build-embeds.yml`. The CMS carries a permanent snippet
instead of a pasted copy, so **merging to main is the release**:

```html
<div data-nl-score-predictor></div>
<script src="https://nl.tools/embeds/score-predictor.js" defer></script>
```

If a given CMS block strips `<script src>` (see the note above — the
`widgets/*.js` tickers embed fine with a plain tag, so it is not universal),
the same bundle loads through an inline loader, which the CMS does allow:

```html
<div data-nl-score-predictor></div>
<script>
  (function(){var s=document.createElement('script');
   s.src='https://nl.tools/embeds/score-predictor.js';document.body.appendChild(s);})();
</script>
```

The bundle inlines its own CSS and markup as strings — it does **not** fetch
the HTML at runtime, so no CORS dependency. It mounts into the marker div
(falling back to `<body>` with a console warning), refuses to mount twice,
and logs its version on mount. `_headers` serves `/embeds/*` as
`no-cache, must-revalidate`, because a cached bundle would pin the public
site to an old widget with nothing to bust from the CMS side.

**Do not hand-edit `embeds/score-predictor.js`.** Edit the HTML; CI
regenerates. PRs run `build-embeds.js --check` and fail on drift.

The same mechanism now carries `embeds/motm.js` and
`embeds/club-directory.js` — add an entry to the `EMBEDS` array in
`scripts/build-embeds.js` and the bundle builds itself.

### The club directory is the static outlier

`embeds/club-directory.html` is a crest grid of one division's clubs, each
card linking out to that club's own website. It is the one embed in this
family with **no Firebase, no SSO and no auth** — nothing on it is
personalised, so most of this document (§8–§12, §19, §21) simply does not
apply to it. What it does share: the single-file shape, the inlined canon
tokens, Carbona, the crest-tier asset paths, and `pickTextColor`.

Two things about it are worth copying elsewhere. Its club list is **seeded
inline and then upgraded from `clubs-meta.json`**, so it paints on the first
frame, survives a failed fetch, and picks up promotion/relegation each summer
without the CMS block being re-pasted. And its columns step on **container
width, not viewport width** (`container-type: inline-size` + `@container`) —
an embed never owns the viewport, and the same block has to work full-bleed
and inside a narrow article column.

Division comes from the host page, so one bundle serves all three:

```html
<div data-nl-clubs="National"></div>   <!-- or North / South -->
<script src="https://nl.tools/embeds/club-directory.js" defer></script>
```

An iframe is deliberately *not* used: the widget reads the SSO cookie via
`document.cookie` for `favourite_team`, and a cross-origin iframe on
`nl.tools` cannot see `thenationalleague.org.uk` cookies, which would break
club personalisation entirely.

## 2. File structure (single file)

```
<!-- header comment block: what the widget is, sim params, scope note -->
<div id="nlPredictor">     <!-- rename per widget, e.g. #nlMotm -->
  <div class="nlsp__sponsor"></div>     <!-- navy header bar       -->
  <div class="nlsp__banner" hidden></div><!-- top error/info banner -->
  <div class="nlsp__screen" hidden></div><!-- registration screen   -->
  <div class="nlsp__screen" hidden>      <!-- main screen           -->
    <div id="…datebar"></div>            <!-- matchday navigator    -->
    <div id="…hero"></div>               <!-- greeting + date       -->
    <div id="…fixtures"></div>           <!-- hero card + KO groups -->
    <div id="…submitbar"></div>          <!-- save / submit         -->
    <div id="…reset"></div>              <!-- reset all link        -->
    <div id="…table"></div>              <!-- leaderboard           -->
    <div id="…clubtable"></div>          <!-- club v club           -->
  </div>
  <div class="nlsp__gate"></div>         <!-- loading + sign-in card -->
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

The palette **mirrors NL canon (`system/nl-brand.css`) verbatim** — embeds
can't load the portal stylesheet, so the token values are inlined. If canon
changes, re-copy the values; never invent shades locally.

```css
#nlPredictor {
  --primary:#9e0000; --primary-50:#fcf4f2; --primary-300:#dfa197;
  --primary-600:#7e0000; --primary-700:#600000;   /* ladder = hover/active   */
  --navy:#223b7c; --navy-600:#192e63;             /* header surface          */
  --red:#d4380d;  --red-light:#fff1ec;            /* error                   */
  --green:#1a7030; --green-light:#edf7ee;         /* success / FT            */
  --amber:#c96f15; --amber-light:#fef6ec;         /* exact-score / own-club  */
  --accent-live:#4ade80;                          /* live pulse dots only    */

  --white:#ffffff; --off-white:#f4f6f9;
  --text:#1a2a44; --text-muted:#5a6a82;
  --border:#dde3ed;

  --radius:6px;
  --shadow:0 2px 12px rgba(10,22,40,.10);
  --focus-ring:0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);

  font-family:'carbona-variable','carbona',sans-serif;
  font-size:15px; line-height:1.5;
  font-variation-settings:'wght' 400;
  color:var(--text); -webkit-font-smoothing:antialiased;
  max-width:680px; margin:24px auto; padding:0 12px;
}
```

**Brand notes:**
- Red `#9e0000` is the only red used as a brand accent. Reserve `--red` for *error* signalling (different shade).
- Hover/active on solid brand buttons = ladder stops (`--primary-600` / `--primary-700`), never `color-mix(…, black)`.
- **No gold.** Gold was retired from the brand; `--amber` carries the exact-score / own-club signals.
- Live pulse dots use `--accent-live`; the "Live" label text uses `--green`.
- The hero card's background comes from **club colours** (clubs-meta.json), not brand tokens — navy fallback.

## 6. Header (the navy bar)

Three-column grid on `--navy` with a 2px `--primary` hairline: division wide
lockup left, "WIDGET TITLE" centred, user's club crest right. No separate
sponsor logo — the wide lockup (`assets/divisions/National-wide.png` /
`North-wide.png` / `South-wide.png`, its own white rounded card with the
sponsor inside it) carries sponsorship.

```
[division wide lockup]        SCORE PREDICTOR              [club crest]
```

- **Always visible**, including during loading and signed-out states.
- The club crest only appears once the user has registered.
- The wide lockup switches with the user's division (derived from the team's `competitionID`; National fallback).
- For a new widget: swap the centre title (e.g. `MAN OF THE MATCH`).

Render is called from `boot()` *after* `state` and the comp-lookup helpers are defined (this matters — see §17).

## 7. Footer

None. The old Enterprise-logo footer was removed in v2.1 — the header lockup carries the sponsor.

## 8. Authentication: SSO + Firebase Anonymous Auth

Two distinct identity layers:

### 8a. NL+ SSO (Sports Alliance / Two Circles)

- Fans sign in via `https://signin.thenationalleague.org.uk/auth/login`.
- After successful sign-in, the SSO sets a cookie `_gc_sa_sso_access` on `.thenationalleague.org.uk`.
- It's a **JWT** (`alg: HS256`) — JS-readable on www and beta.
- Decoded payload contains the fields we use:

```json
{
  "id":             "xxxxxxxxxxxxxxxxxxxxxx",   // canonical 22-char user ID (use this as RTDB key)
  "forename":       "Jane",
  "surname":        "Doe",
  "email":          "fan@example.com",
  "favourite_team": "Solihull Moors",            // used as registration default
  "tenant_id":      "EBLzD6derkq3NH7m9Rp2mQ"    // NL tenant — see sign-in URL below
}
```

(Values anonymised — this repo is public. The `email` claim exists on the JWT but is **never written to RTDB**; the widget stores forename + surname initial only.)

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
if (!exists) activateAppCheck(fbApp);   // before sign-in, see below
fbAuth = firebase.auth(fbApp);
fbDb   = firebase.database(fbApp);
```

### App Check

Both widgets carry an `APPCHECK_SITE_KEY` constant. Empty means off and the
widget behaves exactly as it did before; set to a reCAPTCHA v3 site key, it
pulls `firebase-app-check-compat.js` in second — right after `app-compat` —
and activates before anything signs in, so every request carries an
attestation.

Three invariants for anyone touching this:

- **Activation failures are swallowed on purpose.** In monitor mode an
  unattested request still succeeds, so a reCAPTCHA blocked by a privacy
  extension or a corporate proxy must not stop a fan using the widget. After
  enforcement the same failure denies at the database, which is the intended
  behaviour and still not something the widget should paper over.
- **Monitor vs enforce is a console toggle, not a code change.** One build
  serves both. Do not add a second code path for it.
- **The site key is public, the secret is not.** reCAPTCHA site keys are meant
  to ship in the page. The paired secret lives in the Firebase console and
  must never enter this repository — it is public and permanent.

Every domain the widget is pasted into has to be registered against the
reCAPTCHA key. A missing domain fails attestation silently in monitor mode
and fatally after enforcement. For a preview URL reCAPTCHA cannot verify,
load with `?appcheck=debug`, register the printed token under App Check →
Manage debug tokens, and delete it when finished — a debug token bypasses
attestation completely.

**App Check attests the app, not the fan.** It raises the cost of scripting
the REST API with a lifted config. It says nothing about who is asking, so it
must never be reported as making the widgets private.

## 11. RTDB schema (Score Predictor — model for the new widget)

```
users/{jwtId}
  ├─ teamId          string
  ├─ teamName        string
  ├─ crestUrl        string
  ├─ forename        string
  ├─ surnameInitial  string
  └─ registeredAt    number (server timestamp)

predictions/{jwtId}/{matchday}/{matchId}
  ├─ home            number (0..20)
  ├─ away            number (0..20)
  └─ submittedAt     number (server timestamp)
```

The whole `users/` tree is readable by any authed (i.e. anonymous) client, so it must never hold anything beyond the display identity above. `email` and `joker` were removed from the schema at rollout (v2.0); records/predictions written before then may still carry them — ignore on read.

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
        "registeredAt":   { ".validate": "newData.isNumber()" },
        "$other":         { ".validate": false }
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

Filters apply at two points:
- `recomputeMatchday()` — only matches in user's comp
- `uniqueMatchdayKeys()` (drives the datebar) — only matchdays in user's comp

(The leaderboard is deliberately **not** division-scoped any more — it's league-wide with its own month + club filters; see §21.)

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
| `FirstHalf` / `HalfTime` / `SecondHalf` / `ExtraTime` / `Penalties` | In progress | `live` — but only until KO + `STALE_LIVE_MIN` (240 min), then `unresolved` |
| `FullTime` / `PostMatch` | Finished | `post` |
| `Postponed` | Postponed | `postponed` — render void, no scoring |
| `Abandoned` | Abandoned | `abandoned` — render void, no scoring |

### Computed state per match (`stateOf(m, now)`)

`matchPeriod` from NLS is **authoritative when present**: `FullTime`/`PostMatch`
→ `post` (score is final), the live periods (`FirstHalf`…`Penalties`) → `live`,
`Postponed`/`Abandoned` → void. **One exception**: an in-play period is not
believed indefinitely. A match abandoned mid-game — or a feed that simply stops
updating — would otherwise sit at "Live" forever and never settle, so past
`STALE_LIVE_MIN` (240 min after KO, comfortably beyond ET + penalties) the state
becomes `unresolved`. The clock logic is the fallback for `PreMatch` and stale
snapshots (the widget refetches NLS every 2 min while any visible match is
`locked`/`live`/`unresolved`, so staleness is bounded and an `unresolved` match
heals itself the moment NLS publishes a real final period):

- `future` — KO is >168h (7 days) from now. Predictions not open; **rows hidden** (an "opens on" card shows if the whole matchday is future).
- `pre` — within 7 days of KO, more than 60 min before KO. Editable.
- `locked` — final 60 min before KO. Prediction shown, no edits.
- `live` — KO to KO + 105 min (clock fallback).
- `post` — KO + 105 min passed (clock fallback).

### KO groups + countdown

Fixtures on the matchday are boxed by kick-off time (`.nlsp__kogroup`) — a
12:30 / 15:00 / 17:30 day = three boxes. The box head is the ONLY place the
KO time appears — `"15:00 kick-offs"` (singular when the box holds one match;
the hero doesn't count, it sits outside the groups) — plus ONE status chip:
`Predictions lock in 3h 12m` (ticked every 30s via `[data-cutoff]` text
updates), then Predictions locked / Live / Full time. Per-row KO eyebrows are
gone — pre-KO rows have no meta strip at all; the backed result shows as
per-side W/D/L letter boxes on the team lines. The hero card sits above the
groups with its own countdown chip.

## 15. Matchday navigator (the datebar)

Horizontally scrollable strip of every matchday in the season (in the user's division). Pill per matchday with `WED 6 AUG` / `SAT 9 AUG` format.

- **Default selection**: today (in BST) if today has matches; otherwise the next upcoming matchday after `simNow()`. Today's date pill gets a red border even when not active.
- **Click to select** — `setSelectedMatchday(key)` re-runs `recomputeMatchday()` and re-renders.
- **Click-drag scroll** for desktop mice. Threshold 15px before drag engages. `is-dragging` class only applied once a real drag starts (NOT on plain `mousedown`) — otherwise `pointer-events: none` on child pills swallows clicks. Suppress synthetic click after drag via capture-phase listener keyed off a `didScroll` boolean.
- **Touch viewports** keep native momentum scroll.
- Active pill auto-`scrollIntoView({ inline: 'center' })` on render.

## 16. Sim datetime (dev / demo only)

Two separate `<input type="date">` + `<input type="time">` (NOT `datetime-local` — it has a typing quirk where minute "4" auto-commits to "04"). Plus a "Now" button to clear back to the real clock.

URL flag: `?sim=<ISO>` (e.g. `?sim=2025-08-09T14:00:00Z`) freezes "now" and shows the bar; `?sim=bar` shows the bar on the live clock. **No param = real clock, bar hidden — production is the default**; `?sim=off` is the explicit form of the same.

Sim drives:
- `simNow()` — what time is "now" for state computation
- `defaultMatchdayKey()` — what matchday to navigate to by default

Decoupling between `state.selectedMatchday` (explicit user choice from the navigator) and `state.sim.fixed` (what time is "now") means you can browse a Saturday's fixtures while simulating from a Tuesday in a different month, to test future-locked states.


## 17. Load order (critical!)

The IIFE order matters. `var` declarations hoist but stay `undefined` until their line executes; function declarations hoist completely.

**Rule**: don't call `renderSponsor()` at script-load time — it reads `state.registration` and calls `userCompId()`, both of which need their declarations to have run.

Always call it from inside `boot()`, which runs at the *end* of the IIFE:

```js
(function boot() {
  renderSponsor();
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
| `empty` | No prediction made yet, pre-KO, within edit window | − / + steppers per side, start at 0, cap 9 |
| `submitted` | Prediction saved, pre-KO | Locked display + W/D/L boxes + hover "EDIT" pill |
| `editing` | User re-opened row | Steppers + inline SAVE / CANCEL controls under the row |
| `future` | More than 7 days from KO | **Hidden** (whole-matchday "opens on" card if nothing is open) |
| `locked` | Final 60 min before KO | The user's pick + W/D/L boxes ("Predictions locked" lives in the group head) |
| `live` | Match in progress | REAL live score bold (2-min NLS refetch). **No meta line** — one footer strip closes the row carrying pulse dot + "Live 67'" + "Prediction: ALD 1–0 FGR" (three-letter codes from clubs-meta). No verdict wording: "on track" misleads when you're 1–0 down having predicted 2–1. Same strip on the hero, which drops its navy header while live. |
| `post` | Match finished | Final score, verdict pill (Exact score / Right result; wrong = muted tint only) |
| `postponed` / `abandoned` | API matchPeriod | Greyed, "Prediction voided" |
| `unresolved` | In-play period still set 240 min after KO | Greyed, "Awaiting result" / "Not counted", scores dashed (an abandoned match's last score is not a result). Keeps polling; becomes `post`/`abandoned`/`postponed` when NLS catches up. |

**Steppers, not free text** — two text inputs per row was 24 keyboard focuses
per matchday on a phone. `−` disables at 0, `+` disables at 9. The first tap
on a row initialises the draft with both sides at their displayed values and
marks the row "set".

**W/D/L boxes** (`.nlsp__wdlbox`) — a fixed-width letter chip beside each
side's score: grey **D** at the default 0–0, flipping to green **W** / red
**L** as the scoreline moves. Fixed size so rows never widen (an earlier
"Hartlepool win" text pill did). Shown on pre/locked rows and the hero panels
(hidden during live, where the real score would make them misread); makes the
primary scoring metric visible at the point of choice.

**Hover EDIT pill** sits absolutely on the right edge of the row, opacity 0 → 1 on row hover (always slightly visible on touch). Click → enters `editing` state. SAVE / CANCEL appear inline under the row, never as floating buttons.

### The hero card (`.nlsp__hero-card`)

The fan's own club's fixture renders as a showcase card above the KO groups:
a **canon navy top strip** (KO time · countdown chip — no "Your club" label,
the club colours say it), then the
matchup split into **two panels in each club's own colours** — home club's
primary left, away club's right (clubs-meta.json keyed by `optaID` = NLS
teamID, navy fallback) — so the opponent's colours always share the card.
72px boxed crests; scores/steppers sit in **white drop-shadowed windows**;
panel text flips dark/light off each background's luminance (`pickTextColor`,
threshold 0.68). Deliberately **not** a `.nlsp__row`, so verdict tints never
fight the club colours — but it shares `scoreCell` + the `data-*` wiring, so
steppers and edit work unchanged. Soft emphasis: every other fixture stays
available below.

## 19. Submit / save / reset

- **Bulk submit is WYSIWYG** (`#…submitbar`, "Submit N predictions") — always enabled; every open match is written at its displayed value, which makes 0–0 a first-class pick (just leave the row alone). Untouched rows stay editable per-row until each match's own 60-min cutoff. One RTDB `.update()` writes all rows in one batch.
- **Submit has no confirm step.** It writes straight through. Predictions stay editable until each match's own 60-min cutoff, so submitting is a lock-in rather than a commitment, and a modal in front of a reversible action is ceremony you'd hit every matchday. A confirm-with-review-list was built and removed (v3.2 → v3.3) — don't rebuild it without a reason that survives "but they can just edit it".
- There is deliberately **no "X/12 set" counter** either: it counted rows the fan had *tapped*, so a deliberate 0–0 read as "11/12 set" and then submitted 12. Don't reinstate it.
- **Per-row save** — when re-opening a submitted row, SAVE / CANCEL controls. Save is explicit (not blur-to-save), because blur was too implicit and the user wanted a clear confirm.
- **Reset all** — small underlined "Reset all predictions" link between fixtures and leaderboard. Only shown when every match is still pre-KO. Custom in-widget confirm modal (not `window.confirm()`). Reset via per-child `null` update, not parent `.remove()`.

## 20. Empty states

When `state.matches` is empty, `seasonBoundary()` picks one of three messages:

- **`before`** (sim earlier than first matchday): *"Predictor not available yet. National Division kicks off on Saturday 9 August. Predictions open seven days before each match."*
- **`after`** (sim later than last matchday): *"Season ended. National Division wrapped up on Saturday 26 April. See you next season."*
- **in-season, no fixtures on this date**: *"No matches on this date. Pick another date above — National Division isn't playing on 2025-08-12."*

Rendered as a centred white card consistent with the rest of the widget.

## 21. Leaderboard + club table (counting model, no points)

No points, no multipliers, no prizes. Two cumulative tables, both driven by `tallyForUser()` walking `state.allMatches` × `state.allPredsRaw` (no extra RTDB reads):

- **Leaderboard** — league-wide, ranked by **correct results (W/D/L)**, tiebroken by **exact scorelines**, then forename. Three labelled numeric columns — **Results / Exact / Games** (settled matches predicted), full meanings in `title` tooltips — no explainer sentence. Time scope via segmented chips — **Season / Month / Matchday** — with a contextual select for the last two (a late joiner can win September without being punished for missing August; a single matchday gives bragging rights for one Saturday). Club scope is a **two-state toggle**: all clubs or **your own club's fans** (crest on the chip) — deliberately not a browse-any-club list. Tied ranks display as `1, =, =, 4` (ties on results + exacts). Players with nothing settled in the filtered view are hidden (except yourself), so zero-rows never read as punishment. Names render as forename + surname initial — that's all the DB holds.
- **Club v club** — ranked by **accuracy %** (correct results ÷ settled predictions across the club's fans), tiebroken by exact-score rate. Clubs need `CLUB_TABLE_MIN_SETTLED` (20) settled predictions to rank, so a one-fan club on a hot streak can't sit at 100% and big fanbases aren't advantaged. Shares the leaderboard's month filter; the club filter doesn't apply.

## 22. Asset paths

All assets in this repo, served via `https://raw.githubusercontent.com/thenationalleague/tools/main/…`. URL-encode `+` and spaces (`%2B`, `%20`) when constructing URLs from filenames.

- **NL+ logos** — `assets/logos/NL+ red lozenge.png`, `NL+ red square.png`, `NL+ white lozenge.png`, `NL+ white square.png`
- **Division wide lockups** (header) — `assets/divisions/National-wide.png`, `North-wide.png`, `South-wide.png` (sponsor is inside the lockup; the standalone `Enterprise.png` is no longer used)
- **Division logos (square)** — `assets/divisions/National.png`, `North.png`, `South.png`
- **Club crests** — `assets/crests/{Full Club Name}.png` (fallback to API's `homeTeam.crest` first — that's a CDN URL)

Always include an `onerror="this.onerror=null;…"` fallback on every `<img>` to prevent retry loops if an asset moves.

## 23. Brand do's and don'ts

- ✅ Carbona Variable, system fallback only
- ✅ Brand red `#9e0000` only as accent; header surface is `--navy`
- ✅ `--amber` for exact-score / own-club signals; `--accent-live` for live dots
- ✅ Club colours (clubs-meta.json) only on the hero card, luminance-checked
- ❌ No gold — retired from the brand entirely
- ❌ No Enterprise green `#34ab56` / black bar — the wide lockup carries the sponsor
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
| Per-row UI | two − / + score steppers (0–9) | dropdown / radio of players for that fixture |
| Per-row save | `home`+`away` required | `playerId` required |
| Scoring | counting — correct results, exact-score tiebreak | TBD (most votes win, or per-fixture leaderboard) |
| Leaderboard | correct-results table + club accuracy % table | possibly per-player vote counts |
| Player data | n/a | TBD — separate MD coming for the player endpoint |

Everything else — auth, gate, header, datebar, sim, registration, comp filtering, empty states, modal, click-drag — copy verbatim.

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
