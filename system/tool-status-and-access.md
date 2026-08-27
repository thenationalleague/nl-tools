# Tool status & access model

Which tools are live, who can open each, and what each role can do inside.
Rewritten 17/08/2026 against `tools-registry.snapshot.json` — the previous
version still described six roles, an external realm, and pasting the registry
into the console by hand, all three of which are gone.

The model itself is settled in `system/roles-and-access-plan.md` (the SETTLED
block, 17/08/2026). This file is the per-tool application of it. Where the two
disagree, that one wins.

## The framework — three axes

**Five roles in two realms that log in:** League (`superadmin`, `admin`,
`staff`) · Club (`club-admin`, `club-staff`). There is no external realm —
outsiders get passcode-gated coded links per job, not a login.

1. **Can you open it?** — the `audience` gate. `league` = clubs denied.
   `club` = both realms. `meta` = tooling about the estate itself; superadmin
   in practice.
2. **Can you get in?** — the per-tool level: `off` / `access` / `admin`.
   `superadmin` is always granted. With no per-user entry it falls back to
   `tools/<toolKey>/defaults[<role>]`; a role absent from `defaults` is `off`.
3. **What can you do, and to whose data?** — **role decides**, not level.
   League roles see all clubs; club roles see their own club only.

The recurring club-tool ladder is four tiers on four roles: **Club Staff view
own · Club Admin edit own · League Staff view all · League Admin edit all.**

### Why most tools declare `levels: ["off","access"]`

`admin` as a *level* is only load-bearing where a tool actually reads it, and
the 17/08 audit found **three of sixteen** do: Vacancies, Judgements and
Website Archive. Everywhere else the ladder is role. The other thirteen
therefore declare `levels: ["off","access"]` in their registry record and the
portal's access panel does not offer "Manage" for them — offering a control
that sets a value nothing reads is worse than not offering it.

Panel wording: `off` = **Off**, `access` = **Use**, `admin` = **Manage**.

### Club-side overrides do not exist

Club roles are capped below `admin` in the panel builder, the preview and the
save path, by decision. If a club needs another person with admin powers, make
them a Club Admin. The league side keeps the per-user override, because it
earns its place on the three tools that read it ("this staffer is the Vacancies
approver but not a League Admin" is a real job).

## Deployment — the registry ships from this repo

`system/rtdb/tools-registry.snapshot.json` **is** the `tools/` node. Changing a
record means editing that file in a PR, then running **Actions →
Deploy tools registry**. Run it in `report` mode first — it diffs live against
the snapshot and writes nothing. `publish` replaces the whole node, so a record
that exists only in live is a deletion and publish refuses unless
`allow_deletions` is ticked.

Do not paste this node into the console. Hand-pasting is how `tools/ops-estate`
ended up holding an entire stale copy of the registry, nested a level too deep,
for weeks.

## Parking

A tool with **no `tools/<toolKey>` record** is off the portal and
superadmin-only, while its code stays in the repo. Parked records live in
`tools-registry.parked.json` with their full config. No `app-data` is touched,
so nothing is lost.

---

## Live — 17 records

### League audience — NL staff only, clubs never (7)

| Tool | Key | League Admin | League Staff | Notes |
|---|---|---|---|---|
| **Graphics & Media** | `staff-graphics` | Use | Use | Flat — nothing to administer |
| **Newsletter** | `staff-newsletter` | Use | Use | Flat. Monthly staff newsletter builder |
| **Travel Planner** | `staff-travel-planner` | Use | Use | Flat |
| **Website Archive** | `staff-website-archive` | Manage | Use | **Reads the admin level.** Granting Manage was a no-op until v2.7 — it read `toolPerms.admin` on a string |
| **Programme Packs (admin)** | `media-programme` | Manage | Off | Console for `/programme/`; the club-facing side is the Storage-backed page, not this |
| **Fan Widgets** | `ops-fan-widgets` | Off | Off | Superadmin only today |
| **Brand Exposure** | `ops-brand-exposure` | Manage | Off | Commercial team only — grants are per-user, like Commercial Compliance. Holds match measurements produced by `scripts/board-exposure-match.py` on a laptop; the tool never sees video |

Two tools carry a registry record but no row above: `ops-club-codes` and
`ops-commercial-compliance`. Noticed 27/08/2026 while adding Brand Exposure and
left rather than guessed at — their access models need reading off the tools
themselves, not inferred from the registry defaults.

### Club audience — NL staff + clubs (7)

| Tool | Key | League Admin | League Staff | Club Admin | Club Staff |
|---|---|---|---|---|---|
| **Attendance** | `ops-attendance` | edit all clubs; adjust neutral venues | view all | add own club's attendances (day-locked) | view own + anonymised others |
| **Club Directory** | `ops-club-directory` | edit all club data | view all | edit own club's data | view all |
| **Commercial Benchmarking** | `ops-commercial-benchmarking` | edit data | view benchmarks (club dropdown) | view output only | view output only |
| **Fixtures** | `ops-fixtures` | all clubs | all clubs | own club | own club |
| **Handbook 2026-27** | `ops-handbook` | edit content | view | view | view |
| **Judgements & Decisions** | `ops-judgements` | **Manage** — add / amend / remove all | view | view | view |
| **Vacancies** | `ops-vacancies` | **Manage** — full CRUD + approve/reject | view all | add/edit own club's; every submission needs NL approval | view all |

**One registry oddity, harmless but worth tidying:** `ops-fixtures` sets
`defaults.staff = "admin"` where all fifteen other records use `"access"`.
Fixtures does not read the level at all — it decides from role — and it
declares `levels: ["off","access"]`, so the value is dead either way. Set it to
`"access"` next time the file is opened.

### Meta audience — tooling about the estate (3)

| Tool | Key | Who |
|---|---|---|
| **Estate** | `ops-estate` | Superadmin only |
| **NLServices API** | `ops-nls-monitor` | Superadmin only |
| **Style Guide** | `staff-style-guide` | Superadmin only |

## Not a tool — Wellbeing

`/wellbeing/` is a **public page**, not a portal tool. No auth-guard, no
topbar, no Firebase, nothing recorded — a standalone section built for a
specific purpose that needs to be publicly reachable, on the club-contacts
precedent.

It held an `ops-wellbeing` registry record until 17/08/2026, which put a card
on the portal and carried per-role `defaults` that nothing enforced. The record
is gone. Do not re-add one, and do not "fix" the page by adding auth-guard —
being open is the point. It is reached by its URL.

## Parked — 3

| Tool | Key | Audience | What's needed |
|---|---|---|---|
| **Claudio** | `staff-claudio` | league | AI helper; serious work before it is genuinely useful |
| **Holiday & Lieu** | `staff-holiday-lieu` | league | Admin panel manages relationships, bank holidays, quotas. Non-admins see their own leave and approve for their reports — the org chart lives in the tool and works today |
| **Transfer Centre** | `media-transfer-centre` | club | Prototype functions; needs bringing on-brand. Sheet backend dropped — see `system/retired/live-blog-and-transfer-centre.md` |

## Retired

Gone in the 15/08/2026 purge: Team of the Week dashboard (the Enterprise TOTW
*graphic* lives on under Graphics & Media), Chase HQ, Meeting Notes, Tasks,
Website Analysis, Website Insights, Cup Footage, DAZN VIP, and the old
Programme Packs (superseded by `/programme/` on Firebase Storage).

`system/retired/` holds a record for Chase HQ, DAZN VIP, Cup Footage, and
Website Insights + Analysis — the concept and the settled decisions, so a
rebuild starts from the answered questions. **Read the record before proposing
to rebuild.** Meeting Notes, Tasks and the TOTW dashboard have no record;
recover those from git history if they are ever wanted back.

---

## Canon candidates spotted

- **"Club proposes → NL approves"** — DAZN VIP's request-edit and Vacancies'
  club-submit-needs-approval were the same shape. One shared submission /
  approval concept rather than bespoke flows per tool.
- **"Public flipbook projection"** — Club Directory (future public flipbook)
  and Handbook (external flipbook) both want a read-only public export from the
  same source.

## Tool-internal rules — live inside each tool, not in the access gate

Attendance day-lock · Commercial per-club data-collection sub-page ·
anonymised benchmarking output · the Vacancies approval queue · Holiday &
Lieu's org-chart approval routing.

## Bring-back checklist for a parked tool

1. Finish the build to "ready".
2. Move its record from `tools-registry.parked.json` →
   `tools-registry.snapshot.json` (it already carries `audience` + `defaults`;
   add `levels` unless the tool genuinely reads the admin level).
3. Run **Actions → Deploy tools registry** in `report` mode, check the diff
   shows only that record being created, then `publish`.
