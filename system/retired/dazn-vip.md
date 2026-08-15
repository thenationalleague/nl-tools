# DAZN VIP (`/dazn-vip/`)

Retired 15/08/2026, from "Live — rework" status. The rework never started, and
a tool wearing a live badge it does not earn is worse than a parked one.

## What it did

A request log and email-handoff helper for the DAZN feed's VIP access list.
It never managed DAZN access directly: clubs requested changes to their VIP
list, NL admins forwarded the request to DAZN by email, and updated the local
mirror once DAZN confirmed. One page, no admin sibling — the role gates lived
inside it (club = own list + request; staff = browse all; admin = action the
queue and manage non-club orgs).

Lifecycle per request: `pending` (club submitted) → `sent` (NL admin emailed
DAZN; mirror still shows the old state) → `complete` (DAZN confirmed; mirror
updates). That three-state honesty — the mirror never claims what DAZN has not
confirmed — was the tool's whole point.

## The logic worth keeping

1. **Club proposes → NL approves → external party confirms.** The July audit
   already flagged the first two thirds as a canon candidate (DAZN VIP and
   Vacancies are the same shape). DAZN VIP added the third leg: when the real
   authority is outside the building, the local record needs a "sent but not
   confirmed" state, not a boolean.
2. **The Reconcile tab (v1.6).** Paste the external party's authoritative list,
   diff it against the mirror (matched by email, so a name change renders as an
   edit, not remove+add), type OVERWRITE, apply in one batched update, stamp
   `lastVerifiedAt` per org. Orgs missing from the paste are left untouched —
   honest about what was verified. Any future tool mirroring an external
   authority should steal this wholesale.
3. **The v1.7 lesson, learned the hard way:** the page once embedded a seed TSV
   of ~400 names and emails in a public repo. Stripped 25/07/2026, but the repo
   is public and history is forever — treat that list as disclosed. No future
   tool ships seed data in the page.

## What remains

- **RTDB `app-data/media-dazn-vip/`** — orgs, VIP lists, request queue, per-org
  audit. Real operational data; deleting it is a separate decision for whoever
  owns the DAZN relationship. Rules for the path stay in `rules.snapshot.json`
  until the data goes (same order-of-operations as Cup Footage's bucket: rule
  and data leave together, never the rule first).
- **RTDB `tools/media-dazn-vip`** — delete in the console; the record is out of
  the repo snapshot as of this retirement.

## Why it went

Seasonal tool, flagged "rework" in the July audit, rework unstarted, and the
estate purge (15/08/2026) applied the standard: live means someone would notice
by Friday if it broke. Nobody would have. The concept returns, if it returns,
through the shared proposes→approves shape rather than as a bespoke rebuild.
