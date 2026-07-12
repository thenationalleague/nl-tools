# Consolidation baseline — measured 12 July 2026

Numbers captured *before* the consolidation work, so each migration can prove
its effect (Safety Rails: "before/after measures"). Update the "after" column
as steps land.

## Canon files
| File | Size | Version (`?v=`) |
|---|---|---|
| `system/nl-utils.js` | 52K | 15 |
| `system/nl-brand.css` | 68K | 21 |
| `system/nl-topbar.js` | — | 7 |
| `system/auth-guard.js` | — | 8 |

## Crest assets (Step 2/3 target)
| Metric | Baseline | Target (96px thumbs) |
|---|---|---|
| Folder | **91M** (94,305,176 bytes), 175 PNGs | ~2.5M thumbs alongside |
| Average crest | **526 KB** | ~15 KB |
| Files > 300 KB | 101 | — |
| Files > 1 MB | 19 (worst: Curzon Ashton 5.3 MB @3000px) | — |

Worst real-world page loads (audit estimates, cold cache):
| View | Crests | Est. transfer |
|---|---|---|
| club-directory (full roster) | 72–82 | ~38–43 MB |
| any club-picker dropdown opened | ~72 | ~37 MB |
| matchday-map markers | 36–72 | ~19–38 MB |
| public widgets (per visitor, re-fetched every 5 min) | ~24 | ~12.6 MB |
| vacancies live table | ~30 | ~15 MB |

## Data
- `clubs-meta.json`: 82 clubs, **72 in current (2026) roster**, 0 validator errors/warnings.

## Duplication counts to drive to zero (from the audit)
| Thing | Copies today | Step |
|---|---|---|
| Crest base URL hand-rolled | ~25 files | 3/5 |
| GAS URL (4 var names) | 7 files | 4 |
| Firebase config | 39 copies | (lint equality) |
| Direct clubs-meta fetches (gated) | 9 tools | 5 |
| Local `esc()` re-impls | ~10 files | 7 |
| Hand-wired modals | ~28 / 11 tools | 8 |

## How "after" gets measured
- Crest bytes: `du -sb assets/crests` and a per-page crest count (grep render sites).
- Duplication: the lint drift checks (once added) print the remaining count.
- Data: `npm run validate:clubs`.
- Canon correctness: `npm test`.
