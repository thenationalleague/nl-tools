---
target: travel-planner usability review
total_score: 23
p0_count: 1
p1_count: 2
timestamp: 2026-07-24T17-59-58Z
slug: travel-planner-index-html
---
# Critique — Travel Planner (travel-planner/index.html, v39.6)
Method: dual-agent (A: design review · B: detector + stubbed browser render)
Score: 23/40 (Acceptable — strong output surface, under-designed input model)

## Heuristic scores
1 Visibility of status 3 — dead ~1.5s poll before pickers mount; swallowed Maps/Places failures leave "Custom" a blank dead end
2 Match to real world 2 — away-side routing model never stated; "Extra time after full-time" collides with football's extra time
3 User control 3 — preset click auto-fires a search but mode/direction don't; no cancel of in-flight search
4 Consistency 2 — "Manual Journey" tab vs "Custom Fixture" panel; Start-point button swaps station↔stadium name on mode flip; hand-rolled tab bar duplicates canon .tab
5 Error prevention 2 — empty custom address still calls API; DRIVE-to-match silently uses arrival−3h departure heuristic
6 Recognition vs recall 3 — great fixture list; but user must recall "origin is always the away side"
7 Flexibility 3 — URL state, last club, KO presets, multi-station merge; zero keyboard efficiency
8 Aesthetic/minimal 3 — board is tight; Manual panel crams ~8 control groups; emoji noise
9 Error recovery 1 — raw Google e.message dumped to user; no retry/translation
10 Help 1 — nothing explains whose journey is planned

## Priority issues
[P0] Away-side routing model invisible — doFixSearch always routes away station → home ground; home-fixture users get the opponent's journey with no explanation. Fix: explicit "Planning the away journey: X → Y" line or an origin choice; rename "Start point" to "Depart from <name>".
[P1] Keyboard/screen-reader blocked at step 2 — .tp__fix-item/.tp__alt-chip/.tp__drive-card/.tp__leg are div-onclick, no tabindex/role/keydown; labels lack for=; toggles lack aria-pressed; results innerHTML with no live region/focus move.
[P1] Hostile failure states at max investment — raw API errors, empty-address searches allowed, silent Places failure. Fix: translated errors + retry, validate custom address, fallback text input.
[P2] Results never answer "will I make it?" — show "Arrives 14:07 — 53 min before 15:00 KO" and disclose the drive −3h heuristic; measured 19px KO chips / 25-29px preset pills / 24px clear button fail 44px touch targets (browser-measured).
[P3] Dead/half-wired code — duplicate getEnabledModes, orphaned setTransport, dead .tp__tt/.tp__select CSS, .pac-container styles for a widget no longer used, GKEY/GK duplicate key.

## Detector (Assessment B)
index.html: side-tab L164 (selection-state border — classified intentional affordance), flat-type-hierarchy L115 (10-16px; partially legitimate density, but 10px chips corroborate the touch-target failure).
matchday-map.html: layout-transition L117 (6→9px micro swatch, negligible); broken-image ×2 = false positives (comments, not markup).
Browser evidence: stubbed render (auth-guard stripped) at 1280/390 — no horizontal overflow, clean reflow; tiny targets confirmed; club data/fonts blocked in sandbox so picker/results states not exercisable.
Runtime note: stations.json fetched from raw.githubusercontent.com at runtime — external dependency.

## Personas
Alex: empty panel during 1.5s mount poll; unpredictable search triggering; no keyboard path.
Casey: 19px KO chips; shake-only validation (silent failure if not watching the field); KO buffer absent from results; 35-char truncation.
Sam: cannot select a fixture at all (div onclick); unnamed sliders; emoji read aloud in toggles; results announce nothing.

## Strengths
1. Journey board is genuine craft: consolidated walks, CRS codes, same-station connections, line colours, agency aliases.
2. State engineering: shareable URL state, last-club memory, multi-station parallel search + departure-expansion passes.
3. Direction-aware progressive disclosure landed well (v39.6).

## Questions
1. Who is actually in the car? Should step one be "where are you starting from?" instead of hard-coding away-side logistics?
2. Why two modes? Manual Journey duplicates ~150 lines and caused the setDir cross-contamination bug — one flow with a "build fixture manually" escape hatch?
3. Is the deliverable a transit board or an answer? Headline = KO buffer (green/amber/red), board as detail?
