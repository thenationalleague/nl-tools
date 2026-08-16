# RTDB config snapshots

Reference copies of the **live Firebase RTDB configuration**. Claude Code (and
humans) have no read access to the live databases from a repo checkout — these
files are the canonical in-repo answer to "what's deployed right now?".

**There are two databases, on purpose.** `nl-tools` holds staff and club data —
users, roles, club records, PII. `nl-widgets` holds fan data — votes,
predictions, registrations — reached by anonymous, public, unbounded traffic.
Keeping them apart means a fan-side mistake cannot reach staff data and fan
bandwidth cannot exhaust the tools' quota. Both now deploy from this directory.

Firebase **Storage** rules and CORS used to live here too, which is how the
project ended up with three files each headed "source of truth". They are in
[`system/storage/`](../storage/) now — Storage is not a database.

| File | Mirrors | Live home |
|---|---|---|
| `rules.snapshot.json` | The full **nl-tools** security rules. **Deployed from here** — see the contract below. | Firebase console → Realtime Database → Rules (read-only reference; edits made there are overwritten by the next deploy) |
| `nl-widgets.rules.snapshot.json` | The full **nl-widgets** (fan data) security rules. **Deployed from here** too, as of 15/08/2026 — it previously sat in `embeds/` with no deploy path at all and was pasted into the console by hand, which is how a rules document governing every fan vote and registration came to have nothing checking it matched what was running. | Same, on the `nl-widgets` project |
| `tools-registry.snapshot.json` | The `tools/` node (tool registry: labels, urls, role defaults) | RTDB `tools/` (drives the portal cards **and** auth-guard access defaults) |
| `tools-registry.parked.json` | Holding pen for tools pulled off the portal (back in planning). **NOT deployed** — records live here instead of in `tools/`, so those tools are superadmin-only + invisible while their code stays in the repo. See `system/tool-status-and-access.md`. | — (never pasted) |

## The contract

1. **Both rules files are deployed from this repo. They are not snapshots
   any more — they are the rules.** The **Deploy RTDB rules** workflow
   publishes them (Actions tab → Run workflow → type `publish`), with a
   **target** box choosing `both`, `nl-tools` or `nl-widgets`. No terminal, no
   console paste, and the repo cannot drift from live because the repo *is*
   live.

   Each project has its own config: `firebase.json` for nl-tools (it also
   carries the functions block), `firebase.nl-widgets.json` for the fan
   database. Both are committed, and both sit where `firebase-tools` expects —
   it resolves the `rules` path **relative to the config file**, which is worth
   knowing before anyone tries to generate one at run time.

   The nl-widgets deploy is checked before it runs: the root `.read` and
   `.write` must both be `false`. That file is one edit away from exposing
   every fan registration, so the default-deny is asserted rather than
   trusted.

   Deliberately manual, never on push: rules govern every tool in the project,
   and landing an unrelated PR should not be able to lock 72 clubs out of
   their data as a side effect. Read the diff, then press the button.

   The other files here remain reference only — nothing applies them
   automatically, and the live console is authoritative for those.
2. **Any PR that needs a rules change edits `rules.snapshot.json`** (the full
   document). It ships when someone runs the workflow, so say in the PR body
   that it needs one. No partial rule files — `dazn-vip/dazn-vip.rules.json`
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
| `media-footage/data` + `.../uploads` | `footage/club` (`?c=` token + passcode) and `footage/producer` (`?p=` token) — external capability pages, no NL account. (Footage's per-club scoping is being reworked; handle there.) Accepted by Richard 25/07/2026 (footage-only data). |
| `uw-promo` (whole node) | UW partner page, club till page and master console are standalone (no auth-guard), gated by client-side passcodes over **anonymous Firebase auth** — reads public + writes `auth != null` is the working model. No personal data. Known accepted trade-off (25/07/2026): writes are spoofable by anonymous users; proper hardening (server-side passcode check via a callable, App Check) only if UW abuse ever matters. |
| `ops-handbook/editions` + `publishedEditionId` | Published handbook is **public by intent** (confirmed by Richard 25/07/2026). Drafts and audit stay gated. |
| `ops-vacancies/listings` + `analytics` | Jobs-board widget embedded on thenationalleague.org.uk reads listings and writes click analytics anonymously. |
| `ops-club-data/*/submissions/$token`, `ops-club-contacts/*/submissions/$token` | Invite-token submission flows — access is gated by *token existence*, not login. |
| `ops-vacancies/analytics` | Public **write** for anonymous click tracking (by design). |
| `ops-club-kits/submissions` | `club-kits/index.html` — one no-login public URL, no auth-guard. Read is public; **create is fully unauthenticated** (`!data.exists()`, no `auth != null` clause) so a club rep with the link can submit without an account. Accepted trade-off (like `uw-promo`): anyone can submit as any club, colours only, no personal data. Reopen/edit gated to admins. |

Rule of thumb: a broad `".read": true` here is usually load-bearing for a
capability page or a public widget — **confirm the consumer before locking**.
Staff-audience tools are the opposite: their `app-data` is league-only (locked
in the audience-gating work); see `system/staff-club-audience-plan.md`.

## Known divergence risk

`rules.snapshot.json` cannot drift any more: it is what gets deployed. The
inverse risk replaces it — a console edit made in a hurry is silently reverted
by the next workflow run, so console edits to rules should be treated as
temporary and mirrored back into this file the same day.

The remaining files here are still manual snapshots and can drift if someone
edits the console and forgets step 4. When a tool misbehaves in a way that smells like
rules/registry (denied for everyone, PERMISSION_DENIED on a path the
snapshot says is writable), trust the console over this folder, then
re-sync the snapshot.

Snapshots last verified against live: **16 Aug 2026** (tools registry — exported
from the console and diffed field-by-field against
`tools-registry.snapshot.json`: same 17 records, no live-only records, zero
drift in label/icon/url/description/type/visibleToAll or any `defaults` level.
The only differences were the intended renames — `audience: "staff"` →
`"league"` on 6 records, and the `defaults` key `club-viewer` → `club-staff` on
all 17). Rules: **14 Jul 2026**.
