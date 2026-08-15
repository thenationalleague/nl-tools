# Migrating the GAS backend → Firebase Cloud Functions

**Goal:** retire the public consolidated Apps Script web app and move its work
into `nl-tools` Cloud Functions, so the backend runs on the same platform as
Auth + RTDB, with **native authentication** and repo-based deploys.

**Decided end state (locked):** the stack is **Firebase — Auth + RTDB + Storage
+ Functions — for everything**, plus **one private GAS email shim** for outbound
mail (the single "strictly necessary" bit of Apps Script). The public GAS web
app is fully decommissioned; no browser ever calls GAS again.

> **STATUS CHECK, 15/08/2026.** That is the *goal*, stated in the present tense,
> and it reads as though it has happened. It has not. **Seven pages still call
> GAS** through `NL.endpoints.gas`:
>
> `index.html` (the login page) · `portal/` · `vacancies/` · `vacancies/submit/`
> · `programme-packs/` · `claudio/` (parked, and its dispatch line is now
> commented out)
>
> (`photoshelter-onboarding/` was the eighth until v1.0 dropped its GAS call
> entirely — the email-verification flow it used had been abandoned.)
>
> Phase 0 landed in PR #468 and the migration has not moved since. GAS is not a
> residual shim — it is a live backend serving the page people sign in on.
>
> It is also no longer hand-deployed. As of 15/08/2026 `gas/` is two-way:
> `deploy-gas.yml` pushes the repo into the project and redeploys the existing
> Web App from a reviewed diff. That does not change this plan's destination —
> Functions still win on native auth, Secret Manager and no legacy RTDB secret —
> but it does remove "no repo-based deploys" from the list of reasons, and it
> means each phase can now be cut over and reverted from the Actions tab.
>
> Because it is still load-bearing, the mirror in `gas/`
> now has a sync: `.github/workflows/sync-gas.yml` pulls the live project daily
> and commits only on drift. Its first run found the mirror was six files out of
> fifteen and three of the six had drifted; the hand-pasted `.gs` copies are
> gone and `gas/*.js` is now the only copy. See `gas/README.md`.
>
> The sync covers the **consolidated** project only. Two further Apps Script web
> apps — behind the live-blog and transfer-centre embeds — were never mirrored
> at all; this doc was written as though there were one project. They are not
> being migrated: both tools are parked for a rebuild on RTDB and their Sheet
> backends dropped (`system/retired/live-blog-and-transfer-centre.md`), which keeps the answer at one project
> rather than three. The deployments still need archiving in the editor.

Status of this doc: **plan**. The interim security patch (Phase 0) is landed
in PR #468; everything below is the deliberate follow-on.

---

## Why migrate (not just tidy GAS)

The security hole in PR #468 exists *because* GAS has no built-in auth: the web
app is public, dispatches on `action`, and every handler runs as the owner with
the legacy `RTDB_SECRET` that **bypasses all database rules**. Forget one token
check and you've got a god-mode endpoint.

In a **callable Cloud Function**, `context.auth` is populated and verified by
the SDK before your code runs — the "unauthenticated privileged endpoint" *class
of bug* largely disappears. Migrating also gets us:

- **No legacy secret.** Functions use the Admin SDK (privileged, but not a
  bypass-all-rules key shipped over public HTTP).
- **One platform.** Auth, RTDB, Functions, Storage, Hosting all in `nl-tools`.
- **Repo-based, reviewable deploys.** Functions live in this repo, lint/test in
  CI, ship with `firebase deploy` — no "paste the `.gs` and redeploy by hand."
- **Secret Manager** for the Anthropic keys (today they're Script Properties).

**Cost:** requires the **Blaze (pay-as-you-go) plan**. At internal-tool volume
this is pennies/month, but it is a change from GAS's "free."

---

## The two reasons GAS was ever used — both now resolved

These two things are the *only* reason Apps Script was chosen. Both decisions
are now made, so neither blocks the migration.

### 1. Email — **DECISION: keep one locked-down GAS email shim**
Email is the single thing GAS does uniquely well for free: send as the Workspace
alias `media@thenationalleague.org.uk` via `MailApp`, zero setup. Firebase can't
send mail natively, and the slimmest-stack goal rules out adding a third-party
provider (Resend/SendGrid = another vendor + account + DNS). So:

- A **single GAS function that only sends mail** survives — nothing else.
- It is **never exposed to browsers.** Only Cloud Functions call it,
  server-to-server, with a **shared secret** in a header that GAS verifies. The
  public-URL problem this whole migration exists to kill simply doesn't apply —
  no user-facing client ever hits it.
- No new vendor, no DNS, no domain-wide-delegation grant; keeps free alias send.

*(Rejected: Resend/SendGrid — adds a vendor. Gmail API + domain-wide delegation —
zero GAS but more Google Cloud setup and a powerful delegation grant; not worth
it when a private shim is this small and safe.)*

### 2. Drive-backed files — **DECISION: gone, Programme Packs moves to Storage**
Programme Packs is being reworked to use **Firebase Storage** instead of Google
Drive as its own piece of work. That removes the Drive dependency entirely, so
there is **no Drive-vs-Storage question** for this migration and no
service-account-to-Drive bridge to build. The `pp_*` / `getTree` /
`getDownloadUrl` / `getThumbnail` Drive actions retire with the rework.

---

## Phases

Ordered by **security payoff first, difficulty last.** Each phase is
independently shippable; clients cut over action-by-action.

### Phase 0 — interim security patch *(DONE, PR #468)*
Auth guards on `sendInvite` / `sendApproval` / `sendRejection` on the existing
GAS, + client sends `idToken`. Closes the takeover hole while the rest is
planned. **Kill-switch option for cost-abuse:** if you want zero AI-proxy
exposure before Phase 3, comment out the `chaseEmail` (dead) and optionally
`claudio` / `generateMeetingMinutes` dispatch lines in `gas/Code.js` and
redeploy.

### Phase 1 — scaffold Functions
- **Blaze: already active** (you have it for Storage) — prerequisite done.
- `firebase init functions` (region **europe-west1**, to match RTDB).
- Establish the **callable pattern** + a shared `requireRole(context, roles)`
  middleware (the native replacement for `verifyCaller_`).
- A client helper `nlCall(name, payload)` wrapping `httpsCallable` — the
  successor to this PR's interim `nlGasFetch`.
- Put Anthropic keys in **Secret Manager**.
- Stand up the **private GAS email shim** + its shared secret, and a
  `sendMail(...)` helper Function that calls it. All later phases send mail
  through this one path.

### Phase 2 — invites, notifications, vacancies *(highest payoff)*
These are pure RTDB + email — exactly the actions with the security problem.
Migrate to callables with native auth:
- `sendInvite` / `validateInvite`, `notifyAdmin` / `confirmRequest` /
  `sendApproval` / `sendRejection`, `vacancies_*`.
- Mail goes out via the **`sendMail` helper → private GAS email shim** from
  Phase 1.
- Retire the invite-consumption self-write trust: the Function mints the
  `users/<uid>/role`, so the portal no longer writes its own role on first login.

> **Phase 2a SHIPPED (25/07/2026):** the role-write portion is done, ahead of
> the email portion. `functions/account.js` adds `consumeInvite`,
> `submitAccessRequest` and `withdrawAccessRequest` as callables (deployed by
> the existing `deploy-footage-proxy.yml` workflow); the login page (v5.0)
> calls them over the callable HTTPS protocol and no longer writes
> `users/<uid>` at all; `rules.snapshot.json` forbids client self-creates.
> See `system/rtdb/SECURITY-role-self-grant.md` for the deploy order.
> Still on GAS from this phase: `sendInvite` (email), `validateInvite`,
> `notifyAdmin` / `confirmRequest` / `sendApproval` / `sendRejection`,
> `vacancies_*` — they follow with the Phase 1 email shim.

### Phase 3 — AI proxies
> **Partly pre-empted, 15/08/2026.** All three dispatch lines are now commented
> out in `gas/Code.js`, so the cost-abuse vector is shut today rather than at
> the end of this phase. `generateMeetingMinutes` and its handler are gone with
> the tool. `chaseEmail`'s handler survives only as history. `claudio`'s handler
> stays because the tool is coming back — it needs uncommenting, or better,
> porting.

- `claudio` (Claudio) → callable, key from Secret Manager, gated by native auth.
  Uncommenting the GAS line instead would restore the exposure.
- **Delete `chaseEmail` entirely** — chase-hq was removed at brand sweep v2.19.

### Phase 4 — Programme Packs → Firebase Storage *(separate rework)*
Handled by the **Programme Packs on-Storage rework**, not this migration — when
that lands, the Drive-backed `pp_*` + `getTree` / `getDownloadUrl` /
`getThumbnail` GAS actions retire with it. No Drive work happens here; this
phase just tracks that the rework removes the last Drive dependency.

### Phase 5 — FixtureSync
`gas/FixtureSync.js` (time-driven NLS → RTDB) → **Cloud Scheduler + a Function**.
Self-contained; can move any time after Phase 1.

### Phase 6 — decommission the public GAS web app
- Remove `NL.endpoints.gas` from `nl-utils.js` (lockstep `?v=` bump).
- Delete the `gas/` router + handler mirrors.
- Retire the public Apps Script web-app deployment.
- **Keep only** the private email shim (Phase 1), reachable server-to-server by
  Functions with the shared secret — the one deliberate, non-public sliver of
  GAS that remains.

---

## Client impact

Every `NL_GAS_URL` / `nlGasFetch` call becomes an `httpsCallable`. The interim
`nlGasFetch` (PR #468) is a **stepping stone**: it already centralises these
calls and attaches the token, so swapping its body for `httpsCallable` later is
a small, single-function change rather than editing every call site again.

`FixtureSync` and the pipelines in `scripts/` are unaffected (they're already
GitHub Actions / RTDB, not the web app).

---

## Rollback / safety

Each phase leaves the old GAS action in place until its Function is verified in
production, then flips the client and removes the GAS action. No big-bang
cutover. If a Function misbehaves, point the client back at the GAS action for
that one flow while it's fixed.

---

## What I'd want before writing Phase 2 code — **resolved, 15/08/2026**

This section said the handler bodies were unseen and would be gathered phase by
phase. They are all in the repo now: `.github/workflows/sync-gas.yml` pulls the
live project daily, and the first run brought back nine files — 9,162 lines —
that had never been mirrored, including `ClaudioChat`, `ClaudioStats` and
`ProgrammePacks`. It also showed three of the six hand-pasted mirrors had
drifted from live, so those were deleted; `gas/*.js` is now the only copy.

So there is no gathering step left before Phase 2. What each phase ports is
readable in `gas/` today, and the size of the job is visible for the first time:
Claudio alone is 6,444 lines of Apps Script, which is why the AI proxies are
Phase 3 and not Phase 1.
