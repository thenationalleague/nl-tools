# RTDB config snapshots

Reference copies of the **live Firebase RTDB configuration** for the
`nl-tools` project. Claude Code (and humans) have no read access to the
live database from a repo checkout — these files are the canonical
in-repo answer to "what's deployed right now?".

| File | Mirrors | Live home |
|---|---|---|
| `rules.snapshot.json` | The full database security rules | Firebase console → Realtime Database → Rules |
| `tools-registry.snapshot.json` | The `tools/` node (tool registry: labels, urls, role defaults) | RTDB `tools/` (drives the portal cards **and** auth-guard access defaults) |

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

## Known divergence risk

These are manual snapshots — they can drift if someone edits the console
and forgets step 4. When a tool misbehaves in a way that smells like
rules/registry (denied for everyone, PERMISSION_DENIED on a path the
snapshot says is writable), trust the console over this folder, then
re-sync the snapshot.

Snapshots last verified against live: **10 Jun 2026**.
