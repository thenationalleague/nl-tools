# Tool status & access model

The signed-off source-of-truth for **which tools are live**, **who can access
each**, and **how each behaves per role** — from the full audit with Richard.
Feeds the staff/club audience gating (`system/staff-club-audience-plan.md`).

- **21 tools** at the July audit → **13 live**, **8 parked**. The 15/08/2026
  estate purge has since retired eight of the twenty-one outright (rows marked
  ⚫ below, each with its record under `system/retired/`); the parked set is
  down to Claudio, Holiday & Lieu and the Transfer Centre.
- Audience: **11 staff-audience** (NL staff only, clubs never) · **10 club-audience**
  (NL staff + clubs). Parking doesn't change audience — it changes portal presence.

## The framework (every tool sits on these three axes)

Six roles in three realms: league (`superadmin`/`admin`/`staff`) · club
(`club-admin`/`club-viewer`) · external (`third-party`).

1. **Open the tool?** — the `audience` gate (staff-audience = club/external denied).
2. **Do what inside?** — `off`/`access`/`admin` level (`admin` = NL admin; `access`
   = NL staff / club). `superadmin` = admin everywhere. `third-party` never admin.
3. **See what data?** — league roles see all clubs; club roles see **their own club
   only** (edit-own for `club-admin` via `NL.canClubEdit`, view for `club-viewer`).

Recurring per-role shape across the club tools: **NL admin = edit all · NL staff =
view all · club-admin = edit own · club-staff = view**. Tool-specific rules
(approval queues, time-locks, subsets) layer on top, inside each tool.

## Parking

A tool with **no `tools/<toolKey>` record** is off the portal and superadmin-only
(auth-guard), while its **code stays in the repo**. So the 8 parked tools are
removed from `tools-registry.snapshot.json` and held in
`tools-registry.parked.json` (full config retained). Bring one back = move its
record back and re-paste `tools/`. No `app-data` is touched, so no data is lost.

---

## Staff-audience — NL staff only, clubs never (11)

| Tool | Status | Access model |
|------|--------|--------------|
| **Graphics & Media** | 🟢 Live | Flat — all NL staff; nothing to administer |
| **Team of the Week** | ⚫ Dashboard retired 15/08/2026 (could not read its own data); the Enterprise TOTW *graphic* lives on under Graphics & Media |
| **Travel Planner** | 🟢 Live | Flat. **UI change soon** = the brand-v3 scale / Compact-dash direction (`system/brand-v3-scale-plan.md`) |
| **Website Archive** | 🟢 Live | Flat — live & working |
| **Chase HQ** | ⚫ Retired 15/08/2026 — see `system/retired/chase-hq.md` | — |
| **Claudio** | 🅿️ Park — advanced | AI helper; serious work needed before it's genuinely useful |
| **Holiday & Lieu** | 🅿️ Park — advanced | **Admin panel** manages relationships, bank holidays, quotas. Non-admins see their own leave **and can approve leave for their reports** — the **org chart / reporting lines live in the tool and function today** (not a missing data model) |
| **Meeting Notes** | ⚫ Retired 15/08/2026 | — |
| **Tasks** | ⚫ Retired 15/08/2026 (an Intake rebuild exists unmerged on `claude/staff-portal-tool-review-vrb6kq`) | — |
| **Website Analysis** | ⚫ Retired 15/08/2026 — concept folded into Website Archive (`system/retired/website-insights-and-analysis.md`) |
| **Website Insights** | ⚫ Retired 15/08/2026 — same |

## Club-audience — NL staff + clubs (10)

| Tool | Status | NL admin | NL staff | Club admin | Club staff |
|------|--------|----------|----------|------------|------------|
| **Attendance** | 🟢 Live | edit all clubs; adjust neutral venues; all-clubs dropdown | view all (no editing) | add **own** club's attendances *(locked after X days — already defined in code; verify the value)* | view own + anonymised others |
| **Club Directory** | 🟢 Live | edit all club data | view all | edit **own** club's data | view all |
| **Commercial Benchmarking** | 🟢 Live | edit data | view benchmarks (club dropdown) | view **output only** | view **output only** |
| **Cup Footage** | ⚫ Retired 15/08/2026 | — | — | — | — |
| **DAZN VIP** | ⚫ Retired 15/08/2026 — see `system/retired/dazn-vip.md`; data kept in RTDB | — | — | — | — |
| **Handbook** | 🟢 Live | edit content | view | view | view |
| **Judgements & Decisions** | 🟢 Live | add / amend / remove all | view | view | view |
| **Programme Packs** | ⚫ Retired 15/08/2026 — superseded by `/programme/` on Firebase Storage (shipped 03/08) | — | — | — | — |
| **Transfer Centre** | 🅿️ Park — rework | — | — | — | — (prototype functions but needs bringing on-brand) |
| **Vacancies** | 🟢 Live | add / edit / remove / **approve** all | view all | add/edit **own** club's only (**still needs NL admin approval** for every submission & change) | view all |

*Notes:* Cup Footage is needed by only **~16 clubs per season**. Commercial
Benchmarking runs occasional **per-club data-collection** via a locked sub-page.

---

## Canon candidates spotted (per the "grow the canon" rule)

- **"Club proposes → NL approves"** — DAZN VIP's request-edit and Vacancies'
  club-submit-needs-approval are the **same shape**. Candidate for one shared
  submission/approval concept rather than two bespoke flows.
- **"Public flipbook projection"** — Club Directory (future public flipbook) and
  Handbook (external flipbook) both want a read-only public export from the same
  source. Same pattern twice → candidate for a shared approach.

## Tool-internal rules (live inside each tool, NOT in the access gate)

Attendance day-lock · Commercial per-club data-collection sub-page · Footage
16-club subset · Programme-Packs folder ownership · anonymised benchmarking
output · the DAZN/Vacancies approval queues · Holiday & Lieu's org-chart
approval routing.

## Bring-back checklist (for a parked tool)

1. Finish the build to "ready".
2. Move its record from `tools-registry.parked.json` → `tools-registry.snapshot.json`
   (it already carries its `audience` + `defaults`).
3. Re-paste `tools/` to RTDB; the card reappears for the right roles.
