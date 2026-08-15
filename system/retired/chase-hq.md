# Chase HQ (`/chase-hq/`, `gas/ChaseHQ.js`)

Fully retired 15/08/2026. The front-end had already gone at brand sweep v2.19
("removed pending a structural rewrite"); this retirement deletes the last
living piece — the 91-line Apps Script backend — and its parked registry
record, and closes the "Phase 3" the gas README was waiting on.

## What it was

Provisional relationship management for commercial partnership seeking —
"chasing", literally: track who the League is courting, where each
conversation stands, and generate the chase email with AI. The backend was a
single `chaseEmail` action in the consolidated Apps Script project, proxying
the Anthropic API server-side with a key in Script Properties.

## The decisions that were settled

- **Parked-early in the July audit**: flat access (nothing to administer),
  staff-audience. It never reached the portal in earnest.
- **The AI door was shut on 15/08/2026** for cost-abuse reasons independent of
  this retirement: a public-by-construction web app forwarding to Anthropic is
  a bill waiting for a stranger, so `chaseEmail`'s router line was commented
  out when Meeting Notes died. Deleting the file finishes what the comment
  started.

## The hard problem it never solved

The concept is a CRM, and a CRM's value is the discipline of the humans
updating it, not the software. Nothing in the parked build answered who would
keep it current. A rebuild starts with that question, not with code.

## What remains

Nothing runs. `ANTHROPIC_KEY` may still sit in the Apps Script project's
Script Properties — it is shared with Claudio (parked, its own door also
shut), so leave it for Claudio's sake, but know it is there. Git has the
front-end (pre-v2.19) and `gas/ChaseHQ.js` at this commit's parent.
