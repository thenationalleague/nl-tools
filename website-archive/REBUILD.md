# Website tools — one app, not three

**Status, 15/08/2026:** `website-insights` and `website-analysis` are retired.
`website-archive` survives and is where their work belongs.

## Why one app

All three read exactly the same four files and none of them writes anything:

```
assets/data/articles-index.json      the NL CMS article index
assets/data/ga-metrics.json          GA4 per-path metrics
assets/data/ga-hourly.json           GA4 hourly, recent
assets/data/ga-hourly-archive.json   GA4 hourly, accumulating
```

Built nightly by `.github/workflows/rebuild-index.yml`
(`fetch-ga-metrics.js` → `fetch-ga-hourly.js` → `rebuild-index.js`), which is
untouched and still running — Website Archive depends on it.

Three separate pages over one read-only dataset is three sets of chrome, three
period selectors and three places to fix a bug. They were never three tools;
they were three views someone had not yet had time to merge.

## The merge was already started

`website-analysis` (v0.2, 13/07/2026) described itself in its own header as:

> Phase 1 skeleton. Sets up the agreed IA (Browse + Performance with
> Trends/Timing/Outliers sub-tabs), a page-level period selector, and a
> side-drawer for article detail. **No business logic ported yet** — subsequent
> commits port Browse from website-archive and Performance views from
> [insights].

So this consolidation is not a new idea. It was agreed, scaffolded, and then
stopped for a month with nothing ported. **The information architecture below
is the surviving decision — reuse it rather than re-deciding it.**

```
Browse                     ← port from website-archive (it already has this)
Performance
  ├── Trends
  ├── Timing               ← the cohort + heatmap work from insights
  └── Outliers
+ page-level period selector (30d / 90d / all time)
+ side-drawer for article detail
```

## What Insights actually did, and what is worth carrying

`website-insights` (v1.11, 03/05/2026) was the only one of the three with real
analytical machinery, and it is the part that would hurt to lose. Named here so
a rebuild knows what to look for rather than reinventing it:

| Function | What it did |
|---|---|
| `computeCohortSeries` | grouped articles into publish-time cohorts and produced a comparable series per cohort |
| `cumulativeFromPublish` | re-based every article's traffic to hours-since-publish, so a Tuesday 9am story and a Saturday 5pm story can be compared at all |
| `drawCohortSVG` / `drawSingleCurveSVG` | hand-rolled SVG curve rendering, no chart library |
| `drawHeatmapGrid` | day × hour publish-performance grid |
| `buildHourlyIndex` | indexed the hourly feed by path for lookup |
| `coercePeriod` | normalised the 30d / 90d / all-time toggle, including the lazy-load of the 21MB archive only when "all time" is chosen |

The lazy-load is worth keeping as a rule, not just an implementation: the
archive is large and most sessions never need it.

Retrieve any of it from git history — both files were live until 15/08/2026:

```
git log --oneline -- website-insights/index.html
git show <sha>:website-insights/index.html
```

## Read this before rebuilding: the feeds are a repository problem

The four files above total **~95 MB**, and the nightly job rewrites them
wholesale and commits them. Git keeps every night's copy forever.

```
.git                        489 MB
ga-metrics.json              36 MB   × 125 commits
articles-index.json          29 MB   × 123 commits
ga-hourly-archive.json       21 MB
ga-hourly.json              9.2 MB
```

Every clone pays for that, including every CI run. A rebuilt app that keeps the
same delivery model inherits the problem and makes it worse by lasting longer.
Worth solving first, or at least deciding deliberately not to:

- **Actions artefact or a data-only branch** — the pipeline stops writing to
  `main`, so history stops growing. Smallest change.
- **Firebase Storage** — the app fetches at runtime instead of the files being
  committed at all. Matches where Programme Packs is going.
- **Keep as-is** — fine, but say so on purpose rather than by default.

## What was deleted

- `website-insights/` — the analytical views. Registry record was **parked**;
  last substantive commit 18/05/2026, so 89 days idle when retired.
- `website-analysis/` — the merge skeleton. Registry record was **parked**; no
  business logic was ever ported into it.

Both were parked already, which means they were off the portal and nobody could
reach them. Deleting them changes nothing for any user; it removes two shells
that would otherwise have to be dragged through every canon sweep.

`website-archive` is untouched and still registered.
