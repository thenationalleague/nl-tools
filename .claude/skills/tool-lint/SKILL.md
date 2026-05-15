---
name: tool-lint
description: Run system/lint-tools.sh to check NL Tools head structure against the canonical template at system/_template/index.html. Use when the user types /tool-lint, asks to "lint the tools", "check tool wiring", "find drift", or asks why a specific tool is misbehaving (wiring drift is a frequent culprit).
allowed-tools: Bash, Read
---

# tool-lint — check tool wiring against the template

Run the drift checker for the NL Tools monorepo and report findings.

## Steps

1. **Run the lint.** `bash system/lint-tools.sh`. Capture the output.

2. **If the output shows zero drift**, say so in one line — that's the
   useful signal. Don't fluff it up.

3. **If there's drift**, group findings by tool and present them
   compactly. For each tool list the specific issues. Don't try to
   fix anything unless the user explicitly asks — sometimes the
   "drift" is intentional (e.g. a tool that uses a different Firebase
   project, or scripts loaded via a build step).

4. **If the user asks you to fix drift**, do one tool at a time. For
   each fix:
   - Read the tool's `index.html`.
   - Compare against `system/_template/index.html`.
   - Make the minimum edit to bring the head structure back in line —
     usually a cache-bust version bump, occasionally a script move
     from body-bottom to `<head>`.
   - Re-run the lint to confirm the tool is now clean.

## Don't

- Don't edit `system/_template/index.html` to "match" a tool — the
  template is the source of truth.
- Don't bump cache-bust numbers globally without the user's say-so;
  bumping a version means every tool needs updating in lockstep,
  which is a deliberate change.
