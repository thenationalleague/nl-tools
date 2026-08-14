# RTDB Cache Layer — Model Brief

**Version:** 1.0
**Date:** 09/08/2026
**Purpose:** Response to the RTDB caching proposal. Approves the plan, corrects one piece of reasoning, and adds two constraints that change the design.

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| 1.0 | 09/08/2026 | Initial brief. Approves steps 1–3, rebuts the "never cache live data" reasoning, adds forward-compatibility and licensing constraints. |

---

## 1. What's agreed

The core proposal stands and should proceed:

- 19 call sites fetching NLS directly, with Fan Widgets making up to 60 paginated requests on load, is the actual problem. Fixture-shaped data (matchId, kick-off, teamIDs, competition, final score, period) changes rarely and is fetched constantly. That mismatch is what the cache fixes.
- The precedent argument is correct. `leaderboard/` and `motm-windows/` are already this shape — scheduled fetch, pre-shaped node, client reads. This is an extension of a working pattern, not new architecture.
- The four risks raised are all real: RTDB is a poor query store, bandwidth flips from free to metered, a second source of truth invites disagreement, and a shared pipeline is a new single point of failure.
- The migration order is correct: write the node with no consumers, then Fan Widgets (superadmin only, so failure is invisible to fans), then predictor and MOTM with NLS retained as fallback.

**Proceed with step 1 as a scoped, additive PR.**

---

## 2. Correction: the reasoning against caching live data doesn't hold

The proposal states that putting a cache in front of live match state makes it worse, and that refreshing fast enough to compensate costs more than it saves.

That reasoning describes a **pull-through HTTP cache**, where a client request traverses an extra hop and latency is added. RTDB is not that. It is a **websocket push store**: clients hold an open connection and receive changed nodes as they are written.

The consequence is the opposite of what was stated:

- **Today:** N clients each poll NLS on independent timers. A client that just missed a write waits its full interval. Worst-case staleness = the poll interval. Load on NLS scales linearly with concurrent viewers.
- **With an ingester:** one process polls NLS on a tight interval and writes to RTDB. Every connected client receives the change on the same push, within a few hundred milliseconds. Worst-case staleness = the ingest interval, regardless of client count. Load on NLS is constant.

Fan-out therefore makes live data **fresher** and **cheaper on the upstream**, not staler. It also fixes something polling can't: one place to correct known field problems — the `matchPeriod` / `matchMinutes` / `formattedMatchTime` disagreement — rather than repeating that logic in every widget.

### The real constraint

Deferring live ingestion is still the right call, but for a different reason:

- Cloud Scheduler has a **one-minute minimum interval**. Sub-minute ingestion requires a long-running Cloud Run service with an internal loop and a warm instance — that's a cost and operational change, not a config change.
- A GitHub Actions cron **drifts 5–15 minutes** under load. Acceptable for fixtures. Useless anywhere near kick-off.
- Live ingestion needs monitoring that a fixture cache does not: a silent Saturday-afternoon failure is materially worse than a stale fixture list.

**So: "not yet, because live ingestion needs a different runtime and different monitoring" — not "never, because caching makes live data worse."**

---

## 3. Constraint A — design for live data arriving later

"Never migrate the live widgets" conflicts with the known direction of travel.

Stats Perform have agreed in principle to provision a **direct outlet key** for the National League. The intended architecture is a Cloud Run ingester polling MA1 with `delta_timestamp`, transforming, and writing to RTDB — i.e. **live data in RTDB is the destination**, initially running in parallel with the existing supplier as a proof of concept.

If the node shape is designed on the assumption that only slow-changing data will ever live there, it will need rebuilding once consumers depend on it — which is exactly the risk already identified about getting the shape wrong.

**Required of the step 1 design:**

1. Namespace so that live state can sit alongside cached fixtures without restructuring — e.g. separate sibling nodes under a shared root, rather than a schema that assumes one write cadence.
2. Every cached node carries a `lastUpdated` epoch timestamp written by the ingester.
3. Do not bake the write cadence into path names or document structure.
4. Keep the transform layer separate from the fetch layer, so a different upstream (Opta SDAPI rather than NLS) can be swapped in without rewriting consumers.

Point 4 matters most: the eventual upstream is likely to be a different API with different field names. Consumers should read the shaped node, never anything upstream-shaped.

---

## 4. Constraint B — licensing was not considered

This is absent from the proposal and needs settling before fan traffic reaches the cache.

The Stats Perform work order permits use on the official website, socials and mobile app, **league use only**. NLS data is currently served from an open, unauthenticated endpoint operated by the third-party developer, so today that exposure sits with them.

Writing NLS-derived data into an NL-controlled RTDB and serving it publicly moves part of that responsibility onto the League. Two specific points:

- **Bulk vs piecemeal.** A single fat node containing a whole season is materially different from serving the one match a page needs. Pre-shaped slices (per matchday, per competition) are the right call for bandwidth reasons anyway — they are also the right call here.
- **Rules must be deny-by-default.** Public read should be granted only on the specific paths that require it, never at the root.

**Action:** Alastair to confirm before step 3 (the first step that exposes the cache to fan traffic). Steps 1 and 2 are superadmin-only and carry no new exposure.

---

## 5. Additions to failure handling

"Loud failure handling from day one" is right but abstract. Concretely:

1. **Staleness is a client-side concern.** Consumers read `lastUpdated` and treat data beyond a defined threshold as a failure — falling back to NLS rather than rendering old data silently. Stale-but-rendering is the dangerous state, not empty.
2. **Retain the NLS fallback on Fan Widgets too**, not only on predictor and MOTM. Superadmin-only does not mean low-stakes when it's the tool being used on a Saturday afternoon.
3. **Alert on write absence, not just write error.** An ingester that stops running produces no errors at all. Alert on "no successful write in N minutes".
4. **Never log the full upstream URL** once an authenticated feed is in play — the outlet key sits in the path and will otherwise leak into logs and error traces.

---

## 6. Open question to answer before step 3

RTDB usage against the current billing tier on the `nl-widgets` project. Steps 1 and 2 are negligible. Step 3 puts fan traffic on metered bandwidth for the first time. Check before, not after.

---

## 7. Summary

| Item | Position |
|---|---|
| Step 1 — write node, no consumers | Proceed |
| Step 2 — Fan Widgets | Proceed, retain NLS fallback |
| Step 3 — predictor, MOTM | Proceed after licensing + quota check |
| Live widgets | Defer, do **not** design them out |
| Node shape | Must accommodate live data later |
| Transform layer | Must be swappable to a different upstream |
| Licensing | Alastair, before step 3 |

Proceed with step 1 as a scoped PR, designed to the constraints in sections 3 and 5.
