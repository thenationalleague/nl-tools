# Staging – trying a new version of a live tool before clubs see it

**Status: agreed concept, not built.** Agreed with Richard on 14/11/2026. Build
it the first time a change actually needs it (the likely first case is the Club
Directory's list-down-the-side layout), not before. Nothing below exists in code
yet. When it is built, change this line and the row in `CLAUDE.md`.

## The problem

There is no QA function: it is Richard. Changes to a live tool currently go
straight to the clubs who use it. He wants to click around a new version at a
real address first, without a staging environment that needs looking after.

## Sandbox versus staging

Two different things, and the test is: **does a live version already exist?**

| | Sandbox (the portal shelf; registry `status: 'wip'` or not launched) | Staging |
|---|---|---|
| What | A new tool nobody depends on yet | The next version of a tool that is already live |
| Where | Its real address, e.g. `nl.tools/brand-exposure/` | A temporary copy, e.g. `nl.tools/staging/club-directory/` |
| Changes | In place: nothing breaks if it is half-finished | In the copy; the live tool keeps working |
| Ends | Graduates to a proper shelf, or is retired | Promoted over the live tool, or deleted. Never a third copy |

So a tool on Sandbox never gets a staging copy. Once it is live, bigger
changes go through staging. Small ones (a typo, a wording fix) still go straight
in. Staging is for changes worth clicking through first: a new layout, a new
flow, anything that touches how data is saved.

## Why a folder, not a subdomain

`nl.tools/staging/<slug>/` is the same site from the same repo, so the login,
the database and the `system/` canon all just work, and setting it up is one PR.

`staging.nl.tools` would need a second host (GitHub Pages serves one site per
repo), a DNS record, a new authorised domain in Firebase Auth, and a separate
login. A long-lived `staging` branch also drifts from `main` under squash merges.
What it would buy is staging **canon** changes (`auth-guard.js`,
`nl-brand.css`, `nl-topbar.js`), which a folder cannot do, because a staging copy
still loads the live `/system/` files. Revisit only if canon changes become
frequent enough to need it, and add it alongside the folder rather than instead.

## Data: read-only, always

Staging reads live data and **can never write**. There is no staging dataset.

A copy-and-redirect dataset was considered and rejected. Merging staging data
back at promotion would mean choosing, record by record, between a test edit and
a club's real one made in the meantime. And a second copy of personal data is
one more place it lives. With no staging data at all, a live page cannot
accidentally read staging data either, because there is none to read.

**Code is promoted. Data never is.** If a new version needs the data reshaped,
that is a separate, explicit migration run once against live at promotion.

Revisit only if a change genuinely cannot be judged without saving. If it is
ever built, it redirects `app-data/<toolKey>/` to a Manage-only path and is
thrown away at promotion, never merged.

## The contract

1. **A staging copy differs from live by exactly one line.** The copy is the
   live folder plus `window.NL_STAGING = { from: '<commit sha>' };` in the head,
   before `auth-guard.js`. Same `toolKey`, same data paths, same everything else.
   **Tool code never branches on staging.** Only canon reads the marker, so going
   live is removing one line and nothing else can be forgotten.

2. **Canon enforces staging, not the tool.** When `NL_STAGING` is set:
   - every RTDB write (`set`, `update`, `push`, `remove`, `transaction`) is
     refused with a "Staging: not saved" toast. The audit hook already proxies
     these in `NL.installAuditHook`; the refusal goes in the same place.
   - Firebase Storage uploads are refused the same way.
   - `auth-guard.js` admits only people whose pass gives **Manage** on that
     tool (`NL.pass`; at minimum the Skeleton key holders), whatever it would
     otherwise open to.
   - the topbar shows a STAGING badge, and the head gets
     `<meta name="robots" content="noindex">`.

   Open point for the build: whether `admin/audit` should still record
   staging visits, tagged as staging. Default: no writes at all.

3. **Going live is one PR that does three things together:** copy
   `staging/<slug>/` over `<slug>/`, remove the marker, delete `staging/<slug>/`.
   Never in parts.

4. **Checks that block the PR** (in `lint-tools.sh --strict` and/or `npm test`):
   - no file outside `staging/` contains `NL_STAGING`;
   - no file outside `staging/` links to `/staging/`;
   - a staging folder older than a few weeks without promotion or deletion
     is reported as drift;
   - the live folder has not changed since the `from` commit. If the live tool
     was hot-fixed meanwhile, promoting would erase the fix, so the check refuses
     until staging is brought up to date.

5. **Before merging:** lint and tests pass, and Richard has clicked through the
   staging copy against a short "what passing means" checklist for that change.

6. **Rollback:** a squash-merged PR is one commit. The Revert button on the PR
   puts the previous version back.

## Things to know when building it

- `lint-tools.sh` finds tool pages with `-maxdepth 3`. `staging/club-directory/`
  is covered; `staging/graphics/totw/` is one level deeper and is not. Widen the
  search for `staging/` when this is built.
- A staging copy is a copy of a sibling tool, which the canon rules otherwise
  forbid. It is allowed here only because it is temporary by contract and dies at
  promotion. That is why the age check in point 4 matters.
- The repo is public. Staging code is world-readable like everything else, and so
  is anything committed into a staging folder. Same rule as everywhere: no
  personal data in files.
- Building it touches `nl-utils.js`, `auth-guard.js` and `nl-topbar.js`, so it
  is a lockstep `?v=` bump across the template and every tool, with a test for
  the write refusal.
