# RTDB config snapshots

Reference copies of the **live Firebase RTDB configuration** for the
`nl-tools` project. Claude Code (and humans) have no read access to the
live database from a repo checkout — these files are the canonical
in-repo answer to "what's deployed right now?".

| File | Mirrors | Live home |
|---|---|---|
| `rules.snapshot.json` | The full database security rules | Firebase console → Realtime Database → Rules |
| `tools-registry.snapshot.json` | The `tools/` node (tool registry: labels, urls, role defaults) | RTDB `tools/` (drives the portal cards **and** auth-guard access defaults) |
| `tools-registry.parked.json` | Holding pen for tools pulled off the portal (back in planning). **NOT deployed** — records live here instead of in `tools/`, so those tools are superadmin-only + invisible while their code stays in the repo. See `system/tool-status-and-access.md`. | — (never pasted) |

## The contract

1. **These snapshots are reference, not deployment.** Nothing applies them
   automatically. The live console is authoritative; these files document it.
2. **Any PR that needs a rules change edits `rules.snapshot.json`** (the
   full document) and flags in the PR body that it must be pasted into the
   Firebase console. No more partial rule files — `dazn-vip/dazn-vip.rules.json`
   is a historical subset and should not be extended.
3. **Any PR that adds/changes a tool registry entry edits
   `tools-registry.snapshot.json`** the same way (paste target: RTDB `tools/`
   node, or edit the single tool's record in the portal admin).
4. **After changing config directly in the console**, re-export and commit
   the snapshot so the repo catches up. (Console → ⋮ → Export JSON for the
   node, or copy the rules text.)
5. **Before telling anyone a registry record or rule is missing, check
   here first.**

## Intentionally public reads — do NOT "fix" these

Several `app-data/*` paths are `".read": true` (readable without login) **on
purpose** — they feed no-login capability pages and external site widgets.
Tightening them to `auth != null` would break a live feature. Leave them:

| Path | Why it's public |
|---|---|
| `ops-judgements/records` | An **external widget on thenationalleague.org.uk** reads published disciplinary decisions anonymously. |
| `ops-commercial-benchmarking/aggregates` + `.../links/$token` | `commercial-benchmarking/link.html` — a no-login capability page for clubs without an account (anonymised data, unguessable token). |
| `media-footage/data` + `.../uploads` | `footage/club` (`?c=` token + passcode) and `footage/producer` (`?p=` token) — external capability pages, no NL account. (Footage's per-club scoping is being reworked; handle there.) |
| `ops-club-data/*/submissions/$token`, `ops-club-contacts/*/submissions/$token` | Invite-token submission flows — access is gated by *token existence*, not login. |
| `ops-vacancies/analytics` | Public **write** for anonymous click tracking (by design). |

Rule of thumb: a broad `".read": true` here is usually load-bearing for a
capability page or a public widget — **confirm the consumer before locking**.
Staff-audience tools are the opposite: their `app-data` is league-only (locked
in the audience-gating work); see `system/staff-club-audience-plan.md`.

## Known divergence risk

These are manual snapshots — they can drift if someone edits the console
and forgets step 4. When a tool misbehaves in a way that smells like
rules/registry (denied for everyone, PERMISSION_DENIED on a path the
snapshot says is writable), trust the console over this folder, then
re-sync the snapshot.

Snapshots last verified against live: **14 Jul 2026** (tools registry + rules).
