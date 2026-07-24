# Brand v3 — the scale & design-system pass (planning)

**Status:** parked / not started. This is a scoped future project, not in-flight work.
**Owner:** Richard.
**Why it's parked:** it touches shared canon (every tool at once), so it needs a
deliberate run with usage headroom — not a squeeze between other tasks.

> One-line pitch: recalibrate the shared type/spacing/control scale so the tools
> look right on a **real 1920×1200 at 100%**, and do it **wholesale across every
> tool in lockstep** — not one tool at a time.

---

## The problem (observed, then confirmed in the CSS)

On a 1920×1200 screen at 100% the tools look **tiny and needlessly narrow** —
small text, small buttons, content not using the page width. Colleagues on
150%-scaled displays see it "fine", which is exactly the tell: **the scale was
implicitly tuned for a ~1280–1440px effective viewport** (what a 150%-zoomed
1080p/1200p panel renders), so a true 100% viewport gets no benefit.

It isn't subjective. The canon proves it:

- **`clamp()` ceilings are hit too early.** e.g. `--text-sm: clamp(12px, 0.75vw + 8px, 15px)`.
  At 1920px the fluid term wants ~22px but it's **capped at 15**. Every text token
  maxes out around 1280–1400px width — the extra screen buys zero upscaling.
- **Body / controls are fixed small.** `.btn` is `13px` font / `11px 20px` padding
  (~36px tall). Fine at 150%, cramped at 100%.
- **Headings are capped at ~15px.** `system/nl-brand.css` even carries a
  `TODO(v2.x)` admitting the `.section-head h2` clamp ceiling (15px) *contradicts*
  the documented `--text-lg` scale (20–26px), and that bumping it "would visibly
  change every tool."
- **Width isn't used with intent.** The page container is wide (`max-width: 1700px`),
  but card grids cap columns low (e.g. portal `minmax(clamp(200px,18vw,280px),1fr)`,
  tasks kanban columns `270px`, card titles `13px` / meta `11px`), so a wide screen
  gets *more small cards + whitespace*, not bigger, more legible ones.

## Root cause, in one sentence

The type/spacing/control scale is calibrated for a zoomed viewport; the clamp
ceilings + fixed small control sizing mean a native 1920 @ 100% renders
under-scaled. **The design has no "large screen" tier.**

---

## The principles (what "done" looks like)

1. **Fluid type with realistic ceilings.** Raise the `--text-*` clamp upper bounds
   so text keeps growing past 1440px toward the *already-documented* token sizes
   (body ~15–16px, section headings 20–26px). Highest-leverage single change.
2. **Controls sized for 100%.** Base button/input/target height ~44–52px with
   15–16px labels, so the UI never *relies* on the user being zoomed in.
3. **Use width with intent.** Cap grids to fewer, larger columns (raise the
   `minmax` floor / add a max column count) so big screens get generously-sized
   cards, not a denser mosaic.
4. **Define a reference viewport and QA at it.** The design implicitly assumes a
   zoomed browser; it must be checked at **1920×1200 @ 100%**, not the dev's zoom.

## Concrete starting point (illustrative, not final)

The change lands in `system/nl-brand.css` `:root` and the shared component sizing:

| Token / rule        | Today                                   | Proposed direction              |
|---------------------|-----------------------------------------|---------------------------------|
| `--text-xs`         | `clamp(10px, 0.6vw + 7px, 13px)`        | raise ceiling ~14px             |
| `--text-sm`         | `clamp(12px, 0.75vw + 8px, 15px)`       | ceiling ~16px                   |
| `--text-base`       | `clamp(14px, 0.85vw + 10px, 17px)`      | floor 15, ceiling ~18px         |
| `--text-md`         | `clamp(16px, 0.9vw + 12px, 20px)`       | ceiling ~22px                   |
| `--text-lg`         | `clamp(20px, 1.2vw + 14px, 26px)`       | keep — but actually *apply* it  |
| `.section-head h2`  | `clamp(13px, …, 15px)` (the TODO)       | promote to `--text-lg`          |
| `.btn`              | `13px` / `11px 20px` (~36px tall)       | `15–16px` / ~48–52px tall       |
| card grid floors    | `minmax(~200–280px, 1fr)`               | raise floor (~300–340px)        |

The mockups in `./brand-v3-mockups/` show the target on three different UI
patterns, all at 1920×1200 @ 100% with the real Carbona brand font:

- `travel-planner.png` — form + itinerary + map (wide split layout)
- `portal.png` — the tool-card dashboard (the original complaint)
- `tasks.png` — a dense board (where small 13/11px card text bites hardest)

(`.html` sources sit alongside each PNG so the target is reproducible.)

---

## Why it MUST be wholesale, not one tool at a time

The sizes live in **shared canon** (`--text-*` clamps, `.btn`, grid patterns in
`system/nl-brand.css`). Bumping them changes **every tool at once** — that's the
`TODO`'s exact worry, and it's a feature, not a bug: one edit, consistent result.
Doing it per-tool would fork the scale and re-introduce the drift this whole
consolidation programme spent weeks removing.

So this is a **"brand v3 scale" pass**: one canon change + a **per-tool QA sweep**,
tested tool-by-tool at the reference viewport, shipped as a coordinated set (not
a trickle of one-off tweaks). Ballpark: a focused half-day-plus of design + a
QA pass across the ~20 tools.

## Scope of the wider "brand v3" (what "do it properly" means)

Not just the scale numbers — the pass is the moment to align the whole
**design system** (the tokens + their documentation), distinct from the
`NL.*` **code contract** and the `clubs-meta.json` **data schema** (those are
separate and NOT in scope here):

1. **The scale** — the token/control/grid recalibration above.
2. **The living brand guide** — the Style Guide tool (`/style-guide/`,
   superadmin) is the canonical visual reference; update it in lockstep so it
   *shows* the v3 scale and stays the source of truth.
3. **Spacing & density tokens** — review the spacing ramp and default paddings
   at the same time (they suffer the same "tuned for zoom" issue).
4. **Cross-tool QA** — a checklist run at 1920×1200 @ 100% per tool: no clipped
   layouts, tables/boards still scannable, grids reflow sensibly, dark-mode /
   print unaffected, mobile breakpoints still hold.
5. **Docs & rollback** — bump `nl-brand.css` `?v=` in lockstep (per the canon
   rules in `CLAUDE.md`), note the version rule, keep a one-commit rollback.

## Rollout shape (when it's picked up)

1. Draft the new token values + control sizing in `nl-brand.css` behind the same
   `?v=` lockstep mechanism.
2. Update the Style Guide tool to render the v3 scale.
3. QA sweep tool-by-tool at the reference viewport; fix any layout that assumed
   the old (smaller) sizes — parallel-agent friendly, like the Step 5/7 sweeps.
4. One coordinated PR (or a short series), lint clean, `?v=` bumped in lockstep.

---

## Pointers

- The stale `TODO(v2.x)` in `system/nl-brand.css` (the `.section-head h2` clamp)
  is the first crumb of this project — resolve it *as part of* v3, not before.
- This sits **after** the consolidation programme (see `CONSOLIDATION.md`); the
  canon it cleaned up is precisely what makes a one-shot scale change safe.
