# Canon safety harness

The safety floor for the consolidation programme (see
[`../system/CONSOLIDATION.md`](../system/CONSOLIDATION.md) → *Safety rails for
the canon*). Everything here is **zero-dependency** — built-in `node:test` +
`node:fs` + `node:vm`, no `npm install` needed to run it.

## Run it

```bash
npm test              # canon helper tests + clubs-meta structural check
npm run validate:clubs # full clubs-meta report incl. warnings (missing crests etc.)
```

## What's here

| File | Does |
|---|---|
| `load-canon.mjs` | Loads `system/nl-utils.js` (a browser IIFE) in a VM sandbox with light window/document stubs, exposes `NL`. Covers the pure string/date/club helpers; DOM/Firebase-bound helpers are out of scope (they're covered by each PR's layperson smoke test). |
| `canon.test.mjs` | Asserts the shared helpers return the **right answer** — escaping, date parsing/formatting, crest URLs, season lookups, and that `season.clubsFor` drops departed clubs (the dazn-vip bug class). |
| `validate-clubs-meta.mjs` | Enforces the clubs-meta **data schema**: required fields, unique Opta IDs + names, valid season keys, crest-file existence, non-empty current roster. Errors fail CI; warnings don't. |
| `clubs-meta.test.mjs` | Fails `npm test` if the validator reports any structural error. |
| `BASELINE.md` | Pre-consolidation measurements, so each step can show its effect. |

## The rule: a canon change ships with a canon check

- **New/changed `NL.*` helper** → add or update a test in `canon.test.mjs`.
- **Fixed bug in shared behaviour** → add a regression test where practical.
- **New field or rule in `clubs-meta.json`** → extend `validate-clubs-meta.mjs`.

CI (`.github/workflows/canon-checks.yml`) runs `npm test` on any PR touching
`system/nl-utils.js`, `assets/data/clubs-meta.json`, `assets/crests/**` or
`tests/**`.

## Rollback & versioning (canon governance)

- The four `system/*` files are versioned with `?v=N`, bumped **in lockstep**
  across the template + every tool head (enforced by `system/lint-tools.sh`).
  A version bump is the deliberate "this shared file changed" signal.
- **To roll back** a bad canon release: revert the merge commit (restores the
  file *and* its `?v=`), or re-bump forward to a corrected version. Never edit a
  live shared file in place with no recoverable prior version.
- **Breaking changes** to an `NL.*` helper are avoided: prefer additive changes;
  a breaking change needs a migration plan + temporary compatibility route, and
  the old form is removed only after every consumer has moved.
- **Owner:** Richard (superadmin, sole developer) — shared changes are
  deliberate and reviewed, not casual.
