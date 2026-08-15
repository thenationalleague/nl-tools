# The Consolidation Plan — an idiot's guide

*What we're fixing across NL Tools, why you'll notice, and how it stays fixed.*
*Drafted 12 July 2026 from a five-way audit of every tool in the repo, then
stress-tested against an external architecture review (which added the "Safety
rails for the canon" section — the safeguards that stop centralised code from
becoming centralised risk).*

---

## The idea in one sentence

Every tool should get its clubs, crests, colours, dates, pop-ups and settings
from **one shared place** (`system/nl-utils.js` + `system/nl-brand.css` — "the
canon") instead of carrying its own copy — because 25 private copies of the
same thing means 25 places for it to rot.

We already did this for club pickers (14 hand-built pickers → 1 shared
component) and brand colours/fonts (tokens). This plan finishes the job.

---

## What we're sorting, in order

### 1. Six live bugs (quick fix PR)
Things that are actually wrong today, found by the audit:

| Bug | Tool | What a user sees |
|---|---|---|
| Departed clubs (Rochdale, York City…) shown as current | DAZN VIP | Wrong club list, ex-club flag never fires |
| Stadium names always blank | Travel Planner (+ matchday map) | Missing stadium labels on fixtures |
| CSV downloads misnamed `nl-archive_…` | Website Analysis | Confusing filenames |
| Admin gate checks a role that no longer exists | Website Archive + Analysis | Harmless today, a trap tomorrow |
| Two text-escaping holes | DAZN VIP, Commercial Benchmarking | Theoretical injection risk |

### 2. Crest thumbnails — the big one
Our club badges folder is **91MB** (average badge 526KB, worst 5.3MB) and we
display them at postage-stamp size. Opening one club dropdown can download
**~37MB**; the club directory ~43MB; and fans on the public site re-download
~12MB of badges **every five minutes**.

**Fix:** an auto-generated `assets/crests/thumbs/` folder — same filenames,
96px, ~15KB each (whole set ≈ 2.5MB, a 97% cut). Tools use thumbs for lists
and dropdowns, full-size stays for graphics exports. If a thumb is missing the
page falls back to the full image — a missing thumbnail is *designed to fail
safe*, not a guarantee that nothing can ever break.

**Who benefits:** everyone, immediately — dropdowns open instantly, the
directory stops chugging, phones stop burning data, and every visitor to the
public site gets a faster page.

**Impacts:** club-directory, portal, attendance, vacancies, travel-planner,
dazn-vip, programme, club-contacts, club-data, the shared
picker itself, and (via one CMS attribute change) the public-site widgets.

### 3. One address book for backend URLs
The same Google Apps Script URL is pasted into **7 tools under 4 different
variable names** (it powers invite emails, vacancy submissions, Claudio,
meeting minutes and programme-pack files). If that deployment ever changes,
someone has to find every copy by hand — miss one and that tool dies quietly.
**Fix:** `NL.endpoints` — **one controlled place to update** (rotating a URL may
still need related changes elsewhere, but only one place holds the value).

### 4. Mechanical de-duplication sweep
Delete the ~25 private copies of crest-URL building, the 9 tools still
fetching the club list themselves (the portal fetches it twice per page!),
and add `NL.clubs.byOpta()` so three tools stop building the same
Opta-ID lookup table.

### 5. Role hygiene
Canon role helpers already exist but ~6 tools still do raw `role === 'club'`
checks. Swapping them is the prerequisite for the planned `club` →
`club-admin` rename landing as a one-line change instead of a six-tool
breakage.

### 6. Dates, clipboard and friends
Fix the canon date parser to accept timestamps (the reason half the tools
wrote their own), then add small shared helpers with proven demand:
`formatDateTime`, `copy` (8 tools hand-roll copy-to-clipboard), `timeAgo`,
`csv`/`download`, `debounce`. Then delete the local copies.

### 7. `NL.modal` + `NL.confirm` — the next club picker
We have **28 pop-up dialogs across 11 tools, every one hand-wired**. Only one
closes on Escape; none trap keyboard focus; there are three competing styles
of "are you sure?". One shared component fixes the lot and upgrades
accessibility everywhere at once.

---

## Future-proofing — how this STAYS fixed

This is the most important part. Consolidation without enforcement rots.

**1. The lint gate is the law.** `system/lint-tools.sh` already runs on every
Claude session start and checks every tool's wiring. **Every consolidation
above ships with a new lint rule** so drift is caught the moment it's typed:
- hand-rolled crest URL in a tool → flagged — **NOT BUILT (15/08/2026)**
- a pasted script.google.com URL → flagged — built
- a Firebase config that doesn't match the template → flagged (new check) — **NOT BUILT**
- a tool re-declaring `esc()` / `showToast()` etc. over canon → flagged — **NOT BUILT**

> **STATUS CHECK, 15/08/2026 — read this before trusting the section above.**
>
> Three of the five rules below were never built, and the section reads as
> though they were. Anyone relying on it believes drift is being caught when it
> is not. Measured on 15/08/2026, with none of these rules in place:
>
> * **46 pages** redefine a class that already exists in `nl-brand.css`
>   — 156 separate overrides. That is the missing "re-declaring over canon"
>   rule, and it is the single largest source of drift in the repo.
> * **310 non-canon CSS classes** live in 8 stylesheets outside `system/`,
>   against canon's 194. `graphics/_shared/brand-graphic.css` alone defines
>   **99 custom properties and 5 @font-face** — more than canon's 87 and 2.
>   A second, larger design-token system, used by two pages.
> * Bare generic canon names (`.btn`, `.gate`, `.chip`, `.topbar`) are clashed
>   with **4.5× more often per class** than `nl-`prefixed ones. Naming is the
>   mechanism, not just the symptom.
> * The same duplication exists server-side: **four** implementations of
>   passcode → scoped claim in `functions/`, each documented in `index.js` as a
>   copy of the previous one ("Third instance of the same shape").
>
> The plan was sound. The enforcement step is what did not happen, and without
> it the consolidation above will rot at the same rate it is applied. Build the
> lint rules **first**, not alongside.
- nl-utils loaded without a `?v=` version → flagged

**2. New tools are born compliant.** `/new-tool` scaffolds from
`system/_template/index.html`, which carries the canonical head, versions and
wiring. A new tool starts on canon by default and lint keeps it there. The
template is updated in the same PR as any canon change (the existing lockstep
`?v=` rule).

**3. Three kinds of "single source of truth" — and they are NOT all schemas.**
This distinction matters: each is kept honest a different way, so calling them
all "schemas" hides how you actually protect each one.
- **A data schema** — `assets/data/clubs-meta.json`. A schema is a formal
  description of the *shape and rules of data*: required fields, types, unique
  Opta + FAS IDs, valid season keys,
  `stadium_name`/`optaID`/`fasID`/address/station present.
  This is the only one of the three you can **machine-validate** (see Safety
  Rails). Tools must read it via `NL.clubs`/`NL.season`, never guess at fields —
  the travel-planner stadium bug is what happens when a tool reads it by hand.
- **An API / code contract** — the `NL.*` namespace. *Not* a schema. It's a
  contract about function names, arguments, return shapes and behaviour. You
  don't validate it; you **version it and deprecate carefully** (see Safety
  Rails: backwards compatibility). Defining a local twin is lint-flagged drift.
- **A design system** — brand tokens in `nl-brand.css` + reusable components +
  the Style Guide as the living reference (its samples are now the *real*
  components, so the reference can't drift). *Not* a schema either. Kept honest
  by consistency and review.

**4. Automatic regeneration where it helps.** The crest thumbnails are
regenerated by a **GitHub Action that fires whenever a crest PNG is added or
changed** — drop a new badge in, a pipeline rebuilds the thumb, no human step.
(Same pattern as the article-index and club-news pipelines.) Nothing "updates
itself"; a scheduled/triggered robot re-runs. The runtime fallback
(thumb → full → rose) is the belt to that braces.

**5. One rule of thumb going forward:** *if two tools need the **same
behaviour for the same underlying reason**, consider promoting it to canon with
a lint rule; behaviour that merely looks similar but is domain-specific stays
local.* That qualifier is load-bearing — it's exactly why Team-of-the-Week's
picker was NOT forced onto the shared component.

---

## Safety rails for the canon

Consolidation **centralises risk as well as code.** Today a bad local helper
breaks one tool; once every tool leans on the canon, a bad change to a shared
file can break many at once. So the canon has to be treated as **shared
infrastructure**, not just a convenient utility file. The lint gate above
prevents *drift* — but note its limit: **lint can prove a tool calls
`NL.clubs.byOpta()`; it cannot prove the correct club comes back.** These rails
cover what lint can't.

- **Shared behaviour is tested.** Every new or changed canon helper gets a
  focused automated test (club/season lookups, `byOpta`, role helpers, date
  parsing, escaping, CSV, endpoint presence, thumbnail-path resolution). Each
  bug fixed in the first PR gains a regression test where practical. This is
  the thing lint fundamentally cannot do.
- **Shared data is validated.** A script checks `clubs-meta.json` on every
  change: required fields, types, unique Opta IDs, valid season keys, that
  every club's crest file actually exists, and the current/departed rules. Run
  it in the crest/data Action so bad data can't land silently. (This is the
  "data schema" from Future-proofing #3 made *enforceable* rather than just
  documented.)
- **Changes stay backwards-compatible.** `NL.*` is an internal API. Prefer
  **additive** changes; never silently change what an existing helper returns.
  A breaking change needs a migration plan, a temporary compatibility route,
  and removal only after every known consumer has moved. (The `crestUrl(name)`
  → `crestUrl(name,'thumb')` design already follows this: no-arg stays
  byte-identical.)
- **Every release is reversible.** Keep known-good versions of the shared
  files; version bumps are deliberate (the `?v=N` lockstep already forces
  this); and there's a defined route back if several tools fail after a deploy.
  Don't edit a live shared file in place with no recoverable prior version.
- **Every PR states what "passing" means.** The layperson smoke test stays, but
  each PR also writes down its acceptance criteria up front. For thumbnails:
  no broken crests, export quality preserved, fallback proven, a stated
  download-size improvement. For `NL.modal`: Escape closes, focus is trapped
  and restored, labelled, fully keyboard-operable.
- **The canon has a named owner.** Changes to shared APIs get an informed
  review (tests + docs + template update where relevant). **Owner today:
  Richard** (superadmin and sole developer) — stated explicitly so shared
  changes are deliberate, not casual, and nobody feels unable to touch canon.

**Sequencing:** these aren't a big upfront testing project. Step 0 is a
*lightweight baseline* (below); then the controls grow **alongside** each
migration — a helper ships with its test, a data change ships with its
validator, a component ships with its acceptance checks.

### Secondary safeguards (adopt as we go, not blockers)
- **Visible failures, not quiet ones** — log failed endpoint/data requests,
  missing metadata and unexpected role values rather than failing silently.
- **Security boundary for `NL.endpoints`** — it may hold public service URLs
  and identifiers, **never credentials or privileged secrets**.
- **Performance budgets** — turn the crest measurements into standing limits:
  never load the full crest set into a picker, no duplicate club fetches per
  page, a sane cap on shared-script size.
- **A short `NL.*` API reference** — purpose, params, return, example, fallback
  and stability/deprecation status per helper.
- **Accessibility as acceptance criteria** for every shared UI component —
  keyboard operation, focus visibility, labels, tab order, announcements,
  contrast, reduced motion.
- **Namespace discipline** — keep the surface grouped (`NL.clubs`, `NL.dates`,
  `NL.files`, `NL.roles`, `NL.ui`…) so `nl-utils.js` doesn't become an
  undifferentiated junk drawer.
- **Before/after measures** — for each major migration record a small baseline
  (requests, transferred bytes, load time, duplicate fetches, local copies
  removed, tools affected) and confirm the result after.

---

## Deliberately left alone (and why)

- **Embeds** (`embeds/*.html`) and **public widgets** internal code — the CMS
  strips `<script src>` tags, so they physically cannot share canon code.
  They get the thumbs *URL convention* and pointer comments, nothing more.
- **graphics/ exporters keep full-size crests** — they draw badges onto
  1080px canvases for social exports; thumbnails would look soft.
- **Team-of-the-week's club picker** — intentionally different (built from
  the week's fixtures, keyed on Opta IDs, not the club roster). Forcing the
  shared picker on it would break it.
- **Website-insights' UTC dates** — a real behavioural need (GA data is
  UTC-keyed), not drift.
- **Footage / club-contacts / club-data external pages** — standalone,
  token-gated, no canon scripts by design. Optional to migrate later.
- **Website-archive ↔ website-analysis being 40% the same file** — real, and
  RESOLVED 15/08/2026 by deletion rather than by a shared-module design.
  website-analysis was a v0.2 skeleton with the IA agreed and no business logic
  ever ported; website-insights was 89 days idle. Both were parked, so nobody
  could reach either. One app now — website-archive — with the merged plan in
  system/retired/website-insights-and-analysis.md. Two files cannot drift apart if there is one file.
- **Programme-packs listing departed clubs** — might be deliberate (their
  Drive folders may need to outlive relegation). Needs an owner decision, not
  a silent "fix".
- **The 4-digit email-code flow** duplicated across the two vacancies pages —
  tolerable at two copies; a shared file can't reach the public submit page
  without adding a script tag to it.

---

## Order of attack (each step = one small PR + a layperson smoke test + written acceptance criteria)

0. **Baseline (lightweight, do first):** record current numbers for the pages
   we're about to change (bytes transferred, requests, load time); stub a
   minimal canon **test harness** and a **clubs-meta validator**; write down
   the **rollback/version rule**; confirm the **owner** (Richard). Small — this
   is a safety floor, not a testing project.
1. Bug-fix PR (the six live bugs) — **with a regression test** for each fixed
   shared behaviour where practical.
2. Crest thumbs: generator script + Action + canon helper + picker switch —
   **with the clubs-meta/crest validator and measurable acceptance criteria**
   (no broken crests, export quality preserved, fallback proven, size cut).
3. Thumb migration, heaviest pages first — confirm before/after byte counts.
4. `NL.endpoints` (the 7-file URL) — **with the public-vs-secret rule and
   explicit error logging on failure**.
5. Crest/club-data mechanical sweep.
6. Role hygiene.
7. Date/clipboard canon + local-copy deletion sweep — **each new helper ships
   with its test**.
8. `NL.modal` / `NL.confirm` — **with formal keyboard/accessibility acceptance
   checks** (Escape, focus trap + restore, labels, keyboard-only).
9. Lint hardening, tests, docs and template updates ride **alongside** every
   step above — never a separate "we'll test it later" phase.

---

## After the programme — Brand v3 scale pass (parked, not started)

Separate from the code-consolidation above: the tools read **small and narrow
on a real 1920×1200 @ 100%** because the shared type/spacing/control scale was
tuned for a ~1280–1440px (150%-zoomed) viewport. Fixing it is a **wholesale,
cross-tool token pass** — one canon change (`nl-brand.css` `--text-*` clamps +
`.btn`/grid sizing) plus a per-tool QA sweep at the reference viewport, shipped
in lockstep. Explicitly NOT a one-tool-at-a-time job (that would re-fork the
scale this programme just unified).

Full write-up, evidence, proposed token values, and 1920×1200 mockups (Travel
Planner, Portal, Tasks): **`system/brand-v3-scale-plan.md`** + `system/brand-v3-mockups/`.
