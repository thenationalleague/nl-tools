# Fixture feed cache – retired 29/10/2026

An hourly GitHub job (`build-feed-cache.yml` running `scripts/build-feed-cache.js`)
that copied the season's fixtures from National League Services into
`feed/fixtures/<season>` and `feed/meta/<season>` on the **nl-widgets** database.
Retired in the Declutter on 29/10/2026. Last version in git: commit `9e61777`.

## What it was for

Step 1 of the plan in `embeds/rtdb-cache-model.md`: the League keeping **its
own copy** of its fixture data, so tools and fan widgets stop asking NLS
directly. At the time 19 places fetched NLS on their own; Fan Widgets alone made
up to 60 paginated requests per load, and the predictor leaderboard pulled about
1,650 fixtures every 15 minutes.

| Step | What | Happened? |
|---|---|---|
| 1 | Write the copy, nothing reads it | Yes – this job |
| 2 | Fan Widgets reads the copy, NLS kept as fallback | No |
| 3 | Score Predictor and Team of the Week read it, after a licensing check on showing NLS data to fans | No |

## Why it went

- **Nothing ever read it.** Its own header said so, and a search of every tool,
  embed, function and script on 29/10/2026 found no reader of `feed/`.
- **Overtaken.** The plan said the real destination was "an ingester polling
  on a tight interval and writing to RTDB". That now exists:
  `functions/nls-ingester.js` writes `nls/` on the same database every minute,
  and Matchday Live and NLS Monitor read it.
- It ran 24 times a day for no consumer.

## What stays true if this comes back

The idea, **widgets read the League's own data rather than NLS**, is still
sound and is on the Declutter revive list. Build it on the `nls/` import, not by
reviving this job. The rules from the plan that still apply:

1. Cadence appears nowhere in a path. Live and slow data share one root.
2. Every node carries `lastUpdated`, and a reader decides for itself whether
   it is too old to show. Stale-and-showing is the dangerous state.
3. Fetch and transform stay separate, because the upstream may change from
   NLS to Opta's own feed.
4. **Licensing first.** Showing NLS data to fans from our own copy needs
   sign-off before any fan-facing widget reads it. That is the same open
   question Matchday Live has.
5. Check the nl-widgets database billing tier before putting fan traffic on it.

## Left behind on purpose

- The `feed` block in `system/rtdb/nl-widgets.rules.snapshot.json`. Removing a
  rule needs a rules deploy, and a read rule over an unused path harms nothing.
  Take it out the next time those rules change for another reason.
- Whatever is stored under `feed/` on nl-widgets. It is a few hundred KB of
  fixtures. Delete it from the Firebase console if wanted. Nothing depends on it.
- Comments that mention it in `system/nl-utils.js` and
  `functions/nls-ingester.js`. Editing either file has a cost (a lockstep
  version bump, or a redeploy of every function), so they wait for the next
  real change to those files.
