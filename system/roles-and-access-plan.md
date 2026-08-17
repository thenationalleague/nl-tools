# Roles & access — plan of action

> **Vocabulary reconciled — 16/08/2026.** The settled model has **two realms
> that log in** and **five roles**: League (`superadmin`, `admin`, `staff`) and
> Club (`club-admin`, `club-staff`). The old **external realm and its
> `third-party` role are retired** — outsiders get passcode-gated **coded links**
> per job, not a login (third-party had zero access on every tool anyway). The
> club read-tier was renamed **`club-viewer` → `club-staff`** to mirror League
> Staff; both legacy keys stay accepted in `NL.roles`. The audience value
> **`staff` → `league`** (it collided with the role key). The per-tool level
> words **access/admin → Use/Manage** land with the panel rebuild (step 3).
> The tables below still describe the older 6-role/`external` framing and its
> phased build — kept as the record of how we got here; the code (`NL.roles`,
> `auth-guard`) and the 16/08 access-model artifact are the ground truth.

## SETTLED — the launch model (17/08/2026)

Decided with Richard after auditing what the per-tool level actually controls.
**Simplify for launch; add complexity when real life justifies it.** Do not
re-open these without a concrete case that the simple model failed.

**1. Role is the toolset.** What a person can do is decided by their role.
The five roles are the model — League (Superadmin / Admin / Staff) and Club
(Club Admin / Club Staff). A club-side capability ladder is expressed by role:

| Attendance, as an example | Role |
|---|---|
| see own club's detail | Club Staff |
| + enter and submit own attendances | Club Admin |
| see and interact with all clubs | League Staff |
| + edit all data | League Admin |

Four tiers, four roles. No per-tool level is involved, and none is needed.

**2. The per-tool level says whether you get in, not what you can do.**
`off` / `access` are load-bearing everywhere. `admin` is NOT: the audit found
only **three of seventeen** tools read it — Vacancies, Judgements and Website
Archive. Every other tool decides from role, or has nothing to administer.
So tools declare their own ladder (`levels` in the registry) and the fourteen
that have no admin tier no longer offer "Manage". Offering a control that sets
a value nothing reads is worse than not offering it.

**3. No per-user overrides on the club side. Two tiers, locked.**
This was already true in code — club roles are capped below `admin` in the
builder, the preview *and* the save path — and it stays true by decision.
The rationale, in order of weight:

- Club-side admin is one capability wearing different hats: *act for my club*.
  A person trusted with the club's attendances is trusted with its directory
  entry. The tool-by-tool exception is theoretical; the cost is concrete.
- An override is invisible debt — a fact about access living in one person's
  record and nowhere else, silently contradicting their role.
- It re-creates the two-systems problem one level down: "what can they do?"
  stops being "read their role" and becomes "read their role, then check
  seventeen tools for exceptions."
- **It is what makes club self-service possible.** Club Admins appointing
  their own people only works if the model is one sentence. Add per-tool
  exceptions and it becomes a support burden.

If a club genuinely needs another person with admin powers, make them a
Club Admin. There is no scarcity of seats.

**4. The league side keeps the override, on the three tools that read it.**
Not an inconsistency — the override survives only where it earns its place.
"This staffer is the Vacancies approver but not a League Admin" is a real,
named job. League roles are a handful of people managed directly; club roles
are 72 clubs that cannot be.

---

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
| Club | `club-staff` *(new)* | Club Staff | club tools; **view-only** |
| External | `third-party` *(new)* | Third Party | **hidden everywhere by default**; granted tools per user; org-named; never club-scoped |

Locked decisions:
- **Keep `superadmin`/`admin`/`staff` keys**, relabel pills only (renaming them
  is ~180 cosmetic edits for no real gain; the labels carry clarity).
- **Rename `club` → `club-admin`** (substantive — pairs with `club-staff`).
- **Club edit is global** (admin vs viewer), not per-tool. Per-tool club-edit
  toggles deliberately NOT built (would re-introduce the level model on top of
  explicit roles — worst of both).
- **Third-party can't be club-scoped**, so club-basis tools (attendance,
  directory, programme, dazn-vip) are blocked for them by nature.

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
  OR club-staff OR legacy club) + `NL.canClubEdit(role)` (edit: club-admin /
  legacy club only). Helpers accept both the legacy `club` key and `club-admin`.
- `auth-guard`: defaults lookup simplified to `defaults[role]` for every role
  (a role with no entry → `hidden`, which is third-party's zero-access default);
  deprecated `orgKey` compound path removed. `session.club` is already populated
  for any user with a club value, regardless of role tier.
- **No `?v=` bump**: the helpers are additive and unused until Phase 2, the
  auth-guard change is backward-compatible, and `_headers` no-caches
  `/system/*`. The lockstep bump lands in Phase 2 with the first
  consumers, so it happens once, not twice.

### Phase 2 — Club tool sweep, UI-gated tools — **DONE**
Migrated **attendance** and **club-directory** to `NL.isClubUser` (scope) /
`NL.canClubEdit` (edit). club-staff: attendance sees its own club but can't
submit; club-directory gets the own-club hero + completion dashboard but no
Manage (new `club-staff` persona). **programme, dazn-vip, vacancies were
moved to Phase 3** — their edits write to RTDB and are rule-enforced, so the UI
affordance-hiding ships beside the rule tightening rather than alone. **No
`?v=` bump** — `nl-utils` (with the helpers) is already live under `_headers`
no-cache, so the new calls resolve; a forced bump buys nothing.

### Phase 3 — Rules, new roles surfaced, picker *(the one console-paste phase)*
- Rules (`rules.snapshot.json`), one rewrite: (a) **tighten** the `auth != null`
  writes — attendance `submissions`, vacancies `submissions`, judgements
  `records` — to role-scoped; (b) **rename** `club` → `club-admin` in role
  comparisons; (c) leave `third-party` absent from every `defaults` (= hidden).
- Registry (`tools-registry.snapshot.json`): `club-staff: "access"` on club
  tools; `club` defaults key → `club-admin`.
- Portal user-admin: 6-option role picker + pills; **org-name field** when
  role is `third-party`; **club picker → `NL.season.clubsFor`**; **off-roster
  user flag**. — **DONE (Phase 3b)**
- Migration: rewrite any `users/<uid>/role === 'club'` → `club-admin`
  (near-no-op pre-launch).
- Owner steps: paste rules + registry; run the role migration.

### Phase 3b — Portal user-admin rebuild — **DONE**
User editor + invite form rebuilt on the six-role model. One role picker
(no more org/role two-tier), conditional Club search (current-season roster
via `NL.season.clubsFor`, with an off-roster badge) and Organisation-name
field (third-party). Club roles are role-driven (sliders read-only =
defaults); third-party defaults hidden, grantable per tool; superadmin not
offered in invites. All writes (saveAccess, set-all-in-dept, invite) are
**overrides-only** — a tool equal to the role default is not stored — and the
deprecated `orgKey` is cleared on save. Portal-only change: no registry/rules
paste (third-party = omitted = hidden; club roles already landed in 3a).
Also re-fixed the `seed`/defaults bug as its own PR first. Needs manual
browser verification.

### Deferred (only if a real need appears)
- Club-admins self-managing their own club's viewers.
- Per-tool club-edit toggles.

## The load-bearing security note
Until the Phase-3 rule tightening lands, several writes are `auth != null` (any
signed-in user) — so a club-staff or third-party could write where their page
is hidden (notably attendance submissions). "View-only"/"blocked" only fully
hold once those are role-scoped. This is the real must-do that both new roles
depend on.
