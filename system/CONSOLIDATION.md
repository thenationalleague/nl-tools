# The Consolidation Plan — an idiot's guide

*What we're fixing across NL Tools, why you'll notice, and how it stays fixed.*
*Drafted 12 July 2026 from a five-way audit of every tool in the repo.*

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
page quietly falls back to the full image, so nothing can break.

**Who benefits:** everyone, immediately — dropdowns open instantly, the
directory stops chugging, phones stop burning data, and every visitor to the
public site gets a faster page.

**Impacts:** club-directory, portal, attendance, vacancies, travel-planner,
dazn-vip, programme-packs, club-contacts, club-data, footage, the shared
picker itself, and (via one CMS attribute change) the public-site widgets.

### 3. One address book for backend URLs
The same Google Apps Script URL is pasted into **7 tools under 4 different
variable names** (it powers invite emails, vacancy submissions, Claudio,
meeting minutes and programme-pack files). If that deployment ever changes,
someone has to find every copy by hand — miss one and that tool dies quietly.
**Fix:** `NL.endpoints` — one line to change, ever.

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
- hand-rolled crest URL in a tool → flagged
- a pasted script.google.com URL → flagged
- a Firebase config that doesn't match the template → flagged (new check)
- a tool re-declaring `esc()` / `showToast()` etc. over canon → flagged
- nl-utils loaded without a `?v=` version → flagged

**2. New tools are born compliant.** `/new-tool` scaffolds from
`system/_template/index.html`, which carries the canonical head, versions and
wiring. A new tool starts on canon by default and lint keeps it there. The
template is updated in the same PR as any canon change (the existing lockstep
`?v=` rule).

**3. Yes — we effectively have schemas.**
- **Data schema:** `assets/data/clubs-meta.json` is versioned (currently
  v1.10) with a documented shape (seasons registry, per-club season map,
  `stadium_name`, `optaID`, address, station). Tools must read it via
  `NL.clubs`/`NL.season`, never guess at fields — the travel-planner stadium
  bug is exactly what happens when a tool reads the file by hand.
- **Code schema:** the `NL.*` namespace IS the contract. If a helper exists on
  `NL`, tools call it; defining a local twin is lint-flagged drift.
- **Visual schema:** brand tokens in `nl-brand.css` + the Style Guide tool as
  the living reference (its samples are now the *real* components, so the
  reference can't drift either).

**4. Self-updating where it matters.** The crest thumbnails are generated by
a **GitHub Action that fires automatically whenever a crest PNG is added or
changed** — drop a new club badge in, the thumb appears on its own, no human
step. (Same pattern as the existing article-index and club-news pipelines.)
Plus a belt-and-braces runtime fallback (thumb → full → rose) so even a
missing thumb never breaks a page.

**5. One rule of thumb going forward:** *if two tools need it, it goes in
canon with a lint rule; if one tool needs it, it stays local.* That's how the
club picker happened, and it's the test for everything new.

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
- **Website-archive ↔ website-analysis being 40% the same file** — real, but
  it's fork-drift needing its own shared-module design; separate track.
- **Programme-packs listing departed clubs** — might be deliberate (their
  Drive folders may need to outlive relegation). Needs an owner decision, not
  a silent "fix".
- **The 4-digit email-code flow** duplicated across the two vacancies pages —
  tolerable at two copies; a shared file can't reach the public submit page
  without adding a script tag to it.

---

## Order of attack (each step = one small PR + a layperson smoke test)

1. Bug-fix PR (the six live bugs)
2. Crest thumbs: generator script + Action + canon helper + picker switch
3. Thumb migration, heaviest pages first
4. `NL.endpoints` (the 7-file URL)
5. Crest/club-data mechanical sweep
6. Role hygiene
7. Date/clipboard canon + local-copy deletion sweep
8. `NL.modal` / `NL.confirm`
9. Lint hardening rides along with every step above
