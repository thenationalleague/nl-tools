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
