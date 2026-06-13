# Roles & access — plan of action

Status: **Phase 1 in progress** (this PR). Phases 2–3 to follow.

## The model — 3 realms, 6 roles, 2 axes

Identity (the **role**, global per user) is separate from permission **level**
(access/admin, per-tool — the existing `tools/<toolKey>/defaults` + per-user
override). Do **not** bake level into role names.

| Realm | Key | Label | Default behaviour |
|---|---|---|---|
| League | `superadmin` | Superadmin | everything, always |
| League | `admin` | League Admin | admin panel, notifications; tools default to `admin` |
| League | `staff` | League Staff | tools default to `access`, upgradeable per tool |
| Club | `club-admin` (was `club`) | Club Admin | club tools; **edits** own club's content |
| Club | `club-viewer` *(new)* | Club Viewer | club tools; **view-only** |
| External | `third-party` *(new)* | Third Party | **hidden everywhere by default**; granted tools per user; org-named; never club-scoped |

Locked decisions:
- **Keep `superadmin`/`admin`/`staff` keys**, relabel pills only (renaming them
  is ~180 cosmetic edits for no real gain; the labels carry clarity).
- **Rename `club` → `club-admin`** (substantive — pairs with `club-viewer`).
- **Club edit is global** (admin vs viewer), not per-tool. Per-tool club-edit
  toggles deliberately NOT built (would re-introduce the level model on top of
  explicit roles — worst of both).
- **Third-party can't be club-scoped**, so club-basis tools (attendance,
  directory, programme-packs, dazn-vip) are blocked for them by nature.

## Club churn

The portal club picker must source from the **current-season roster**
(`NL.season.clubsFor(meta)`), not raw `data.clubs` — then new entrants appear
and departed clubs drop automatically each season (driven by clubs-meta
`seasons.current`). The only manual seasonal task is tidying **orphaned users**
(those whose `club` left the league) and creating accounts for new clubs;
surface an "off-roster users" flag in user-admin. Club-scoped tools already
scope on the current roster, so a relegated club's tools naturally go empty —
access self-revokes without a manual switch. (RTDB rules can't read clubs-meta,
so roster-gating is UI-level; rules stay club-name-scoped — not a hole.)

## Phases (each its own PR, independently shippable, lint-clean)

### Phase 1 — Foundation *(this PR; no behaviour change)*
- `nl-utils`: `NL.roles` (realm/label) + `NL.isClubUser(role)` (scope: club-admin
  OR club-viewer OR legacy club) + `NL.canClubEdit(role)` (edit: club-admin /
  legacy club only). Helpers accept both the legacy `club` key and `club-admin`.
- `auth-guard`: defaults lookup simplified to `defaults[role]` for every role
  (a role with no entry → `hidden`, which is third-party's zero-access default);
  deprecated `orgKey` compound path removed. `session.club` is already populated
  for any user with a club value, regardless of role tier.
- **No `?v=` bump**: the helpers are additive and unused until Phase 2, the
  auth-guard change is backward-compatible, and `_headers` no-caches
  `/tools/system/*`. The lockstep bump lands in Phase 2 with the first
  consumers, so it happens once, not twice.

### Phase 2 — Club tool sweep
Migrate **attendance, club-directory, programme-packs, dazn-vip, vacancies**
from raw `role === 'club'` to `NL.isClubUser` (scope) and `NL.canClubEdit`
(edit). After this, `club-viewer` is read-only everywhere; `club-admin` edits.
**Bump `nl-utils` `?v=` in lockstep** (template + all tools) — the first real
consumers.

### Phase 3 — Rules, new roles surfaced, picker *(the one console-paste phase)*
- Rules (`rules.snapshot.json`), one rewrite: (a) **tighten** the `auth != null`
  writes — attendance `submissions`, vacancies `submissions`, judgements
  `records` — to role-scoped; (b) **rename** `club` → `club-admin` in role
  comparisons; (c) leave `third-party` absent from every `defaults` (= hidden).
- Registry (`tools-registry.snapshot.json`): `club-viewer: "access"` on club
  tools; `club` defaults key → `club-admin`.
- Portal user-admin: 6-option role picker + pills; **org-name field** when
  role is `third-party`; **club picker → `NL.season.clubsFor`**; **off-roster
  user flag**.
- Migration: rewrite any `users/<uid>/role === 'club'` → `club-admin`
  (near-no-op pre-launch).
- Owner steps: paste rules + registry; run the role migration.

### Deferred (only if a real need appears)
- Club-admins self-managing their own club's viewers.
- Per-tool club-edit toggles.

## The load-bearing security note
Until the Phase-3 rule tightening lands, several writes are `auth != null` (any
signed-in user) — so a club-viewer or third-party could write where their page
is hidden (notably attendance submissions). "View-only"/"blocked" only fully
hold once those are role-scoped. This is the real must-do that both new roles
depend on.
