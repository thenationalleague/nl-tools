# Retired tools — what they were for

One file per tool that has been deleted, recording the concept and the settled
decisions so a future build starts from the answered questions rather than from
nothing.

**Nothing here is a plan to build.** These are records. A tool comes back only
when someone asks for it, and when they do, this is where the thinking is.

| File | Retired | Was |
|---|---|---|
| [`live-blog-and-transfer-centre.md`](live-blog-and-transfer-centre.md) | 15/08/2026 | Two fan-facing embeds on a Google Sheet backend. Front-ends kept in `embeds/`, unplugged. |
| [`website-insights-and-analysis.md`](website-insights-and-analysis.md) | 15/08/2026 | Two of three views over one read-only dataset. Merged into `website-archive`, which survives — the agreed IA is in here. |
| [`nl-cup-footage.md`](nl-cup-footage.md) | 15/08/2026 | Match-footage delivery to 32 Cup clubs. Three pages, two Cloud Functions, a Storage tree. |
| [`public-site-tickers.md`](public-site-tickers.md) | 15/08/2026 | Three Sheet-fed CMS ticker widgets. All silently dead since March — one missing brace, one identity theft, one squatter. |
| [`dazn-vip.md`](dazn-vip.md) | 15/08/2026 | VIP request log for the DAZN feed. The proposes→approves→confirms shape and the Reconcile tab are the keepers. |
| [`chase-hq.md`](chase-hq.md) | 15/08/2026 | Commercial-chasing CRM, parked since July. Backend deleted; the unanswered question was ownership, not code. |
| [`league-tables.md`](league-tables.md) | 28/08/2026 | Canvas table-graphic tool, superseded by the Broadsheet rebuild at `/graphics/table-graphic/`. Its position-band palette was canon's, and was wrong. |

## Why one place

These started in three: `embeds/REBUILD.md`, `website-archive/REBUILD.md`,
`footage/CONCEPT.md` — three locations, two names, and one of them living inside
a directory that otherwise held nothing at all. A record nobody can find is not
a record.

## The distinction this directory draws

- **`system/retired/<tool>.md`** — the tool is **gone**. This is a post-mortem.
- **`<tool>/REBUILD.md`** — the tool is **alive** and being reworked. The spec
  sits with the code it will replace. `programme-packs/REBUILD.md` is the
  example.

If a tool with a `REBUILD.md` is later retired, its doc moves here.

## What a good entry contains

Judged by what was actually useful when writing these three:

1. **What it did**, in a paragraph. Not features — the job.
2. **The decisions that were settled**, especially with an owner. These are the
   expensive part and the part a rebuild would otherwise re-argue.
3. **The hard problems it hit**, and what was tried and rejected. NL Cup Footage
   burned two working implementations of a download lock before concluding
   neither was viable; that is worth more than the code was.
4. **What was deliberately not deleted**, and what still costs money. Retiring a
   tool rarely retires its data.
5. **Why it went.** Briefly, and honestly.

What none of them needs is the code. Git has that.

## Superseded rather than retired

One entry that is not a post-mortem, because the concept did not go anywhere —
it moved.

**Programme Packs (`/programme-packs/`)**, deleted 15/08/2026. Superseded by
**`/programme/`**, which shipped on 03/08/2026 and said so in its own header:
"Replaces /programme-packs/ (Google Drive via Apps Script), which is retired:
the Drive proxy was the source of the ghost-file drift, the manual redeploy
dance and the GAS quota ceilings. Bytes now live in Firebase Storage."

The replacement ran for twelve days while the original stayed on the portal,
kept its RTDB node, and kept seventeen `pp_*` routes plus a Drive browser live
in Apps Script. There is no concept to preserve here: `/programme/` and
`/programme/admin/` are the concept, working.

`programme-packs/REBUILD.md` went with it — a v2 spec for a rebuild that had
already happened somewhere else.

**club-data (`/club-data/`)**, deleted 15/08/2026. Superseded by
**club-contacts**, whose v2.8 absorbed the club-information capture as a wizard
step and whose header has said "THIS IS THE UNIFIED FORM — supersedes the old
club-data tool" since June. The two ran side by side for two months. RTDB
`app-data/ops-club-data` still holds the collected returns; the rules stay
until the data goes.

**graphics/fixtures-results**, deleted 15/08/2026. Superseded by
graphics/fixtures-graphic, which said in its own header it was "intended to
replace it in a later pass". Richard confirmed which was the keeper; the pass
happened.
