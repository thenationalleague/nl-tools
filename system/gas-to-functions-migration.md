# Migrating the GAS backend → Firebase Cloud Functions

**Goal:** retire the consolidated Apps Script web app and move its work into
`nl-tools` Cloud Functions, so the backend runs on the same platform as Auth +
RTDB, with **native authentication** and repo-based deploys. End state: **almost
no Apps Script** — only whatever we deliberately choose to leave there (see
"the two hard pieces").

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

## The two hard pieces (decide these first)

Everything else moves mechanically. These two are the reason GAS was ever used:

### 1. Email (`MailApp` as `media@thenationalleague.org.uk`)
GAS sends mail from the Workspace alias for free. Functions can't send email
natively. Options:

- **(A) Transactional provider — recommended.** [Resend](https://resend.com) or
  SendGrid, with **SPF + DKIM** on `thenationalleague.org.uk`. More reliable and
  auditable than Gmail-alias send; ~free at this volume. One-time DNS setup.
- **(B) Keep a tiny GAS email shim.** A single `doPost` that only sends mail,
  called by a Function over HTTPS with a shared secret. Keeps free send, but
  keeps a sliver of GAS alive. Acceptable as a bridge, not the end state.

**Recommendation: (A).** It's the clean answer and removes the last real reason
to keep GAS.

### 2. Drive-backed files (Programme Packs + shared-file browser)
Programme Packs uses Google Drive as free storage (upload/download/zip/
thumbnails/reconcile). Options:

- **(A) Migrate to Firebase Storage — clean long-term.** Native to the platform,
  rules-gated, but it's a **data migration** (move existing files) and has
  storage/egress cost. Do this **last**.
- **(B) Keep Drive via a service account.** A Function talks to Drive with a
  service-account credential + shared drive. No data migration; keeps a Google
  Drive dependency. Reasonable interim.

**Recommendation:** (B) as a bridge, (A) as the eventual target — but this is
the heaviest lift, so it's the last thing we touch.

---

## Phases

Ordered by **security payoff first, difficulty last.** Each phase is
independently shippable; clients cut over action-by-action.

### Phase 0 — interim security patch *(DONE, PR #468)*
Auth guards on `sendInvite` / `sendApproval` / `sendRejection` on the existing
GAS, + client sends `idToken`. Closes the takeover hole while the rest is
planned. **Kill-switch option for cost-abuse:** if you want zero AI-proxy
exposure before Phase 3, comment out the `chaseEmail` (dead) and optionally
`claudio` / `generateMeetingMinutes` dispatch lines in `gas/Code.gs` and
redeploy.

### Phase 1 — scaffold Functions
- Upgrade project to **Blaze**.
- `firebase init functions` (region **europe-west1**, to match RTDB).
- Establish the **callable pattern** + a shared `requireRole(context, roles)`
  middleware (the native replacement for `verifyCaller_`).
- A client helper `nlCall(name, payload)` wrapping `httpsCallable` — the
  successor to this PR's interim `nlGasFetch`.
- Put Anthropic keys in **Secret Manager**.

### Phase 2 — invites, notifications, vacancies *(highest payoff)*
These are pure RTDB + email — exactly the actions with the security problem.
Migrate to callables with native auth:
- `sendInvite` / `validateInvite`, `notifyAdmin` / `confirmRequest` /
  `sendApproval` / `sendRejection`, `vacancies_*`.
- **Decide + wire email provider here** (the Phase-decision above).
- Retire the invite-consumption self-write trust: the Function mints the
  `users/<uid>/role`, so the portal no longer writes its own role on first login.

### Phase 3 — AI proxies
- `claudio` (Claudio) and `generateMeetingMinutes` (Meeting Notes) → callables,
  keys from Secret Manager, gated by native auth. Kills the cost-abuse vector.
- **Delete `chaseEmail` entirely** — chase-hq was removed from the site at brand
  sweep v2.19; the router still dispatches it (`gas/Code.gs`). Dead endpoint.

### Phase 4 — Drive / Programme Packs *(heaviest)*
Per the Drive decision above. Migrate the `pp_*` + `getTree` / `getDownloadUrl`
/ `getThumbnail` actions. Storage-vs-Drive is the call to make when we get here.

### Phase 5 — FixtureSync
`gas/FixtureSync.gs` (time-driven NLS → RTDB) → **Cloud Scheduler + a Function**.
Self-contained; can move any time after Phase 1.

### Phase 6 — decommission GAS
- Remove `NL.endpoints.gas` from `nl-utils.js` (lockstep `?v=` bump).
- Delete the `gas/` mirrors (or keep only the email shim if we chose option B).
- Retire the Apps Script deployment.

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

## What I'd want before writing Phase 2 code

To turn this plan into Functions I'd need the current handler bodies I haven't
seen (`Utils.gs`, `Invite.gs`, `Vacancies.gs`, `Drive.gs`, `ClaudioChat.gs`,
`MeetingNotes.gs`) — not for the interim patch, but so the ported Functions
match today's behaviour exactly. We gather those at the start of each phase, not
all up front.
