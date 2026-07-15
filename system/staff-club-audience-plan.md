# Staff / Club audience gating — plan of action

**Status:** planned / not started.
**Owner:** Richard.
**Goal:** ONE unambiguous, structurally-enforced access boundary — **a club-realm
user can never reach a staff-audience tool** — with every paper-thin parallel
mechanism (the `department` field, the `media`/`ops`/`staff` naming convention,
the convention-based `defaults` lockout) **retired** in favour of a single source
of truth. Tools renamed to match, so nothing is left implying a rule it doesn't
enforce.

---

## Why this is needed (what's true today)

The staff-vs-club boundary is currently **skin-deep — a UX redirect, not a
security boundary:**

- **`auth-guard.checkAccess` ignores category entirely.** Access is decided only
  by the per-user entry (`users/<uid>/tools/<toolKey>` = off/access/admin) or the
  tool's `defaults[role]`. Nothing checks "is this a staff tool". One wrong
  `defaults` value or one manual grant lets a club user in.
- **The RTDB rules don't enforce it either.** Many `app-data/<toolKey>` paths are
  `".read": true` (world-readable); writes are gated by superadmin/admin, not by
  audience. A signed-in club user could read a staff tool's data directly.
- **Three parallel, half-overlapping mechanisms** all *imply* the boundary and
  none *guarantee* it: the `toolKey` prefix (`staff-`/`ops-`/`media-`), the
  `department` field on each record, and the per-role `defaults`. They can drift.
- **The category doesn't even mean "audience".** `media-*` tools (DAZN VIP,
  Footage, Programme Packs, Transfer Centre) all default **club → access** — they
  are club-facing. "media" describes *function*, not *who can see it*.

The one thing that IS consistent today — and the reason this migration is
low-risk — is that `defaults` already encode the audience mechanically:

| Current prefix        | club-admin / club-viewer default | → audience        |
|-----------------------|----------------------------------|-------------------|
| `staff-*` (11 tools)  | `off` / `off`                    | **staff-only**    |
| `ops-*` (6 tools)     | `access` / `access`              | **club-accessible** |
| `media-*` (4 tools)   | `access` / `access`              | **club-accessible** |

So the audience field can be **seeded straight from the existing defaults** and
then reviewed — no guesswork.

## Draft classification (Phase 0 sign-off list — 21 tools)

**`audience: "staff"` (staff-only — club-realm hard-denied):**
`staff-chase-hq` (retired placeholder), `staff-claudio`, `staff-graphics`,
`staff-holiday-lieu`, `staff-meeting-notes`, `staff-tasks`,
`staff-team-of-the-week`, `staff-travel-planner`, `staff-website-analysis`,
`staff-website-archive`, `staff-website-insights`.

**`audience: "club"` (club-accessible — club + staff):**
`media-dazn-vip`, `media-footage`, `media-programme-packs`,
`media-transfer-centre`, `ops-attendance`, `ops-club-directory`,
`ops-commercial-benchmarking`, `ops-handbook`, `ops-judgements`,
`ops-vacancies`.

> Semantics: `staff` = internal, club NEVER sees it. `club` = clubs use it (and
> staff can too). Review each — e.g. is Handbook/Judgements/Vacancies truly
> club-accessible, or staff-only? — this list is the seed, not the verdict.

---

## Target model (the single source of truth)

- **`audience: "staff" | "club"`** on every `tools/<toolKey>` record. This is the
  ONLY thing that defines the boundary.
- **Enforced in two places, belt-and-braces:**
  1. `auth-guard` — hard-deny before any grant: `if NL.roles.realm(role) === 'club'
     && toolData.audience === 'staff' → redirect`, *regardless* of entry/defaults.
  2. **RTDB rules** — gate `app-data/<toolKey>` reads/writes by cross-referencing
     `root.child('tools').child($toolKey).child('audience')` against the caller's
     role. This is the real security boundary (and closes the world-readable gap).
- **Retired:** the `department` field, the `staff`/`ops`/`media` category concept,
  and any reliance on `defaults` or the key prefix to imply audience. `defaults`
  stays for the off/access/admin *level*, but no longer carries the staff/club
  *boundary* — that's `audience`'s single job.
- **Portal** groups into two buckets (Staff / Club) off `audience`.

---

## The toolKey rename — do it, but with eyes open

You want the naming retired too, so nothing implies an unenforced rule. Agreed —
but two honest points that shape *how*:

1. **The rename adds zero enforcement.** A key prefix is an inert string;
   `auth-guard` and the rules enforce off the `audience` **field**, not the key.
   So renaming is **hygiene** (remove a misleading vestige), not **safety**. Ship
   the safety (Phases 1–4) first; it stands on its own.
2. **Don't re-encode audience into the key.** Renaming to `staff-*`/`club-*` would
   recreate the exact dual-source-of-truth you're retiring (key prefix vs field,
   free to drift). The clean end state is **pure-slug keys** — `vacancies`,
   `dazn-vip`, `attendance` — where the key is an opaque id and `audience` is the
   sole place audience lives.

**The rename is a live data migration** (this is the expensive, risky phase). For
each tool the `toolKey` is baked into four places: `tools/<toolKey>`,
`app-data/<toolKey>/…`, every `users/<uid>/tools/<toolKey>` grant, and the RTDB
rules — plus the app's own `window.NL_TOOL.toolKey` / `var NL_TOOL_KEY`. Do it
behind a **compatibility window** (auth-guard reads new key, falls back to old)
so no one is locked out mid-migration, one tool at a time, verified per tool.

---

## Phased rollout (safety first, hygiene last)

**Phase 0 — Classify & sign off.** Confirm the staff/club list above (the draft
seed). This is the crux decision; everything keys off it.

**Phase 1 — Add `audience` (additive, no behaviour change).** Write `audience` to
all 21 records in `system/rtdb/tools-registry.snapshot.json`; paste to RTDB.
Nothing enforces it yet — safe.

**Phase 2 — Enforce in `auth-guard`.** Add the hard-deny check (club realm +
`audience === 'staff'`). Bump `?v=` in lockstep. Now mis-granting is impossible
client-side. `department` still present (harmless) for now.

**Phase 3 — Enforce in RTDB rules.** Add audience cross-reference gating on
`app-data/<toolKey>` reads/writes; close the `".read": true` gap. **Test in the
Firebase rules simulator**, snapshot the old rules for rollback, deploy off-peak.
This is the true security boundary.

**Phase 4 — Portal regroup.** Two buckets (Staff / Club) driven off `audience`;
drop the media/ops/staff grouping UI and the "restricted role" special-casing.

**Phase 5 — Retire `department`.** Remove the now-unused field from records +
snapshot. One mechanism left standing: `audience`.

**Phase 6 — (optional, requested) Rename toolKeys to pure slugs.** The live
migration, behind a compatibility window, one tool at a time. Hygiene only —
sequence it last so the guarantee is already in force before any keys move.

**Phase 7 — (separate audit) GAS endpoints.** See below.

---

## Your GAS question

**Google Apps Script is unaffected by the access-model change** — it's a separate
backend (Drive/Sheets via `NL.endpoints.gas`), orthogonal to RTDB toolKeys. Even
in Phase 6 it only matters if a GAS endpoint hard-codes a toolKey (unlikely; GAS
deals with Drive folders / Sheets).

**But** — one honest caveat — GAS endpoints are their **own trust boundary**. If a
staff tool's GAS endpoint doesn't check the caller's role, a club user with the
URL could call it directly; the RTDB audience gate doesn't extend to GAS. That's
true today, independent of this work. So "fully lock club out of staff tools"
ultimately means auth-guard + RTDB rules **and** a role check inside any sensitive
GAS endpoint. Worth a separate Phase-7 audit; not a blocker for Phases 0–6.

---

## Risks & safety rails

- **Rules can lock people out.** Test every rules change in the simulator against
  a staff uid, a club uid and an admin uid before deploying; keep the prior
  `rules.snapshot.json` for instant rollback; deploy off-peak.
- **Audience misclassification** → wrong people gain/lose access. Phase 0 sign-off
  is the mitigation.
- **Key migration lockout** (Phase 6) → compatibility window + per-tool verify.
- Every RTDB change lands in the `system/rtdb/*.snapshot.json` files in the same
  PR (per the snapshot contract in `system/rtdb/README.md`) and is pasted to the
  console by the owner — sessions can't read/write the live DB.

## Acceptance criteria

A **club-realm** user attempting a **staff-audience** tool is denied at **all
three** layers, verified per audience:
1. **Portal** — the tool isn't shown.
2. **auth-guard** — direct navigation silently redirects.
3. **RTDB rules** — a direct read/write of its `app-data` is rejected.

And a **staff** user still reaches every tool; a **club** user still reaches every
`club`-audience tool. One field (`audience`) explains every decision.

---

## Pointers
- Enforcement today: `system/auth-guard.js` (`checkAccess`), `system/rtdb/rules.snapshot.json`,
  `system/rtdb/tools-registry.snapshot.json` (the `department` field + `defaults`).
- Role helpers to build on: `NL.roles.realm(role)` (`league`/`club`/`external`),
  `NL.isClubUser(role)` — already the right abstraction to gate on.
- Related parked work: `system/brand-v3-scale-plan.md` (the portal regroup in
  Phase 4 is a natural place to also land the v3 visual direction — Compact-dash).
