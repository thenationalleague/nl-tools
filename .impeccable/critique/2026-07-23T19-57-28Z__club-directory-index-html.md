---
target: club-directory tool (readability critique)
total_score: 25
p0_count: 1
p1_count: 2
timestamp: 2026-07-23T19-57-28Z
slug: club-directory-index-html
---
Method: dual-agent (A: design review · B: deterministic detector scan)

# Club Directory critique — club-directory/index.html v0.47

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Saving a person gives no success feedback; builder copy buttons are dead (selector mismatch) |
| 2 | Match System / Real World | 3 | Domain language mostly excellent; "person/post", "Completion" nav label leak |
| 3 | User Control and Freedom | 3 | Back-button/hash anchoring is excellent; but no undo on delete, person modal has no Escape/focus trap |
| 4 | Consistency and Standards | 2 | Hand-rolled confirm/tabs vs canon NL.confirm/.tabs; ~200 lines dead CSS; page pinned 1200px vs canon 1700px |
| 5 | Error Prevention | 3 | Explicit-blank checkboxes, duplicate-merge prompts, seed overwrite refusal — strong |
| 6 | Recognition Rather Than Recall | 3 | Crests + global search with jump-and-flash; "(none = all clubs)" must be learned |
| 7 | Flexibility and Efficiency | 3 | 3 copy formats, deep links; zero keyboard shortcuts; search silently inert outside directory view |
| 8 | Aesthetic and Minimalist Design | 2 | THE complaint: data at 12–13px under 9px tracked-caps headers; no middle type register |
| 9 | Error Recovery | 2 | "Refresh to re-sync before editing further" — burden on user, no retry |
| 10 | Help and Documentation | 2 | Good micro-help in person panel; no help for builder mental model |
| **Total** | | **25/40** | **Acceptable — functional, careful data flows, weak presentation and feedback** |

## Anti-Patterns Verdict

Not AI slop — bespoke, domain-literate, colour-disciplined (shade ladders used correctly, club-colour accents, no gradients/glass/hero-metrics). But it fails the product trust test through an **eyebrow monoculture**: virtually every structural heading is a 9–12px uppercase letter-spaced micro-label (34 uppercase declarations, 19+ with wide tracking; .s2-sec-hd 11px/0.22em, .cp-panel__hd, .l1-div-hd, .lb-panel-hd, 9px table headers ×3). Section headers are smaller than the data they head.

Deterministic scan: 4 findings — 2 broken-image FALSE POSITIVES (img tags inside comments), single-font FALSE POSITIVE (brand mandates one family), 1 confirmed low-impact layout transition (width animation on .cp-meter__bar L1142). Grep evidence: 49 lines of 9–11px font sizes; 13 !important lines; 3 real #fff (should be var(--white)); 16 real rgba() vs the repo's no-rgba rule (several are shadows/scrims where ladder guidance arguably doesn't apply); 33 inline style="" in JS-built strings (token-based, except dynamic accent L3018). Zero side-stripes, zero gradient text.

Browser overlays skipped: page is Firebase auth-gated, no credentials in this environment. Source-level review only.

## Overall Impression

The model layer (data integrity, navigation state, colour discipline) is stronger than most commercial CRMs. The presentation layer opted out of the brand's fluid type system px by px: everything readable got smaller than the canon intends, and every heading became a whisper in tracked caps. The single biggest opportunity: delete the local font-size system and let nl-brand's --text-* tokens breathe, then rebuild the club page as a readable document rather than an admin table — which also pre-builds the club-facing guide.

## What's Working

1. **Navigation state care**: History API anchoring with hash deep links (#club/…, #manage/…) — Back works between list ↔ club ↔ manage. Rare in internal tools.
2. **Data-integrity UX**: "No email/phone on file" explicit blanks, auto-vs-override mailing-list chips, duplicate-merge prompting, pre-filled correction mailto, non-blocking coverage warnings.
3. **Colour/brand discipline**: ladders as designed, semantic pills, club accent bars.

## Priority Issues

**[P0] Builder copy buttons are dead.** Buttons at L2497–99 carry `btn btn--navy` + `data-copy-fmt`; the click handler (L5025) and disable loop (L3895) still target the removed `.lb-copybtn` class. The mailing-list builder's entire output path does nothing on click. VERIFIED in parent context. Fix: switch both selectors to `[data-copy-fmt]`, delete dead .lb-copybtn CSS (L1574–92). → /impeccable harden

**[P1] Raise the reading floor; rejoin the brand's fluid scale.** Data at 12–13px fixed, headers at 9px, .page pinned to 1200px while canon scales body 16→21px and containers to 1700px. On staff 1920px screens every other tool grows; this one shrinks relatively. Fix: replace raw px with --text-* tokens (table body → --text-sm, primary data → --text-base, headers ≥11px at ≤0.08em tracking, nothing below --text-xs), drop the 1200px pin. → /impeccable typeset

**[P1] Rebuild heading hierarchy; retire the eyebrow monoculture.** No landmarks between 22px club name and 13px rows — the page reads as one grey texture. Fix: promote section headers to --text-md/weight 800 sentence case navy (red-underline device can stay as brand signature); keep at most one kicker style. → /impeccable layout + typeset

**[P2] Status truthfulness + save feedback.** "Demo mode: changes are in-memory only" banner renders unconditionally in renderClubPicker (L4047) — false once seeded. Saves succeed silently (persistClub toasts only failure); failure copy ("Refresh to re-sync") frightens non-technical users. Fix: gate/delete banner; toast success on .set() resolution; soften failure copy with retry. → /impeccable clarify

**[P2] Keyboard + screen-reader access.** Club cards, person cards, dashboard rows are click-handled divs/trs — main navigation is mouse-only. Person modal: no focus trap, no Escape, no role="dialog". Placeholder contrast ~2.5:1 (--navy-300, L2273); omitted-row text ~2.1:1 stacked with line-through. Fix: real buttons/anchors, modal a11y, canon NL.modal for confirm. → /impeccable audit + harden

## Persona Red Flags

**Alex (staff power user):** search inert on club pages with no indication; copy buttons dead → concludes tool is broken, returns to Outlook groups; zero keyboard support; results table unsortable.

**Sam (accessibility-dependent):** cannot reach club/person cards by keyboard at all; modal traps focus behind it; 9px headers below zoom-friendly floor; 200% zoom in 1200px column forces horizontal scroll.

**Club secretary, 60s, twice a season:** landing hero is genuinely good for them; then the person modal presents ~25 controls in four sections with 11px caps labels; saves and sees nothing → rings the League to check, the exact call this tool exists to prevent.

## Minor Observations

- Top nav is literally named .demo-bar ("removed in production" says the comment) — it IS production nav.
- ~200 lines of dead CSS acknowledged in-file (L498): .lb-copybtn, .mc-save-btn, .persona-bar, .lb-modebar…
- Correction-request strip sits above the people table; belongs at the bottom.
- .l1-hero navy→navy-600 gradient — brand has no gradient vocabulary elsewhere.
- ≤500px hides the phone column entirely with no alternative route to the number.
- formatForCopy('named') doesn't quote commas in names — Outlook paste edge case (test once buttons work).
- Changelog discipline is exemplary; protect it through any refactor.

## Questions to Consider

1. Should the club page stop being an admin table at all? Canon just gained a document-presentation system (.nl-doc/.nl-cover, v2.25) built for exactly this register — a readable club one-pager would solve the readability complaint AND pre-build the club-facing guide. The dense table could remain as a staff view.
2. What happens if you delete every local font-size and let the brand tokens breathe? The fastest win might be subtraction.
3. Do six nav modes need to be peers? Directory is the product; a 3-item nav (Directory / Mailing lists / Admin ▾) halves the first decision for every user.
