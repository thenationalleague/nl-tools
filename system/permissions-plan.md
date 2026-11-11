# Permissions – who can open what, and do what

**Status: plan, not built.** Decided with Richard on 29/10/2026 and 11/11/2026.
Built over several sessions, in the order at the foot. Read this before
touching `auth-guard.js`, `NL.roles`, `NL.resolveToolLevel`, the portal's
people screens, the `tools/` registry shape or the rules generator.

When it is built, it **replaces** four older documents, which describe the
model it retires: `roles-and-access-plan.md`, `staff-club-audience-plan.md`,
the access tables in `tool-status-and-access.md`, and `guest-pass-plan.md`
(see open question 4). Until then those are the record of how today's system
works; this is where it is going.

---

## Why change it

Today a person has **one role** (Superadmin, Admin, Staff, Club Admin or Club
Staff), and each tool says what each role gets (`tools/<key>/defaults`), with a
per-person override on top. That was the right call for launch, and the
17/08/2026 settlement said so: simple first, add complexity when real life
asks for it. Real life has now asked:

- **A role mixes up who you are with what you do.** "Admin" means League,
  *and* senior, *and* allowed to manage most tools. There is no way to say
  "League, in Commercial" or "a club's secretary" without inventing a role.
- **Clubs share one code each.** A club code says which club, never which
  person. So nothing can be given to a club's secretary and not its kit man,
  and Club Directory editing has to stay with League Admin.
- **Outsiders have no home.** The external realm was retired in August, and
  DAZN, the Trust and suppliers get a different coded link per job.
- **"Who can open this?" is hand-written** in four documents, and they drift.

## The model

Four words, one meaning each. Use them in code, comments and conversation.

| Word | What it is | Values |
|---|---|---|
| **Base** | Where a person belongs. **Everyone has exactly one.** | Club · League · External |
| **Club** | Which club. Only for the Club base. | one of the 72 |
| **Key** | Something extra a person holds on top of their base. Any number, including none. | e.g. Secretary, Media, Commercial, Finance (club side); Operations, Finance, Commercial, Media and Broadcast, Senior leadership, Board, Heads of department (League side); DAZN, Trust (external side) |
| **Level** | What a person can do on one tool. | Off · Access (read only) · Manage (anything that writes) |

(Richard called the bases "lanes" once, on 11/11/2026. The agreed word is
**Base**.)

Plus one badge: **Superadmin**, which sits on top of normal membership and
opens everything. It is a badge, not a base: a superadmin is still League with
their own keys. A lighter "can manage people" badge may follow; not yet.

### How a person's level on a tool is worked out

Each tool's record says what each base gets and what each key adds. A person
gets the **highest** level any of their grants gives them on that tool.

```
level(person, tool) =
  superadmin                        → Manage
  otherwise the highest of:
    tool.grants.base[person.base]
    tool.grants.key[k] for each key k the person holds
  nothing matched                   → Off
```

Then, on a **club-specific** tool, a Club-base person only ever sees **their
own club's** data, whatever their level. That is enforced in the database
rules, not just on the page.

So "a club's secretary manages their own Directory entry" is one grant:
Club Directory → key Secretary → Manage. No role invented, no override.

### What each tool record carries

- **Club-specific or not.** Yes means club people see their own club only.
- **Which levels it offers.** Some tools have nothing to manage and only ever
  offer Off or Access (or Off or Manage). The portal never offers a level the
  tool does not read; that rule from 17/08 stays.
- **Grants:** per base and per key.
- **Single-use or permanent.** Single-use tools live at `nl.tools/temp/<tool>`.

When a new tool is built, `/new-tool` asks in this order: **single-use or
permanent → club-specific or not → which bases and keys get what.**

### The "who can open this" panel

Admins and superadmins see an info panel on every tool listing who can open
it and who can manage it, **worked out from the grants**, never typed. The
four drifting documents above become one generated answer.

## Decisions already made, per tool

From Richard, 29/10/2026 and 11/11/2026. Everything else is decided tool by
tool in session 1.

| Tool | Club-specific | League | Club | External |
|---|---|---|---|---|
| **Document Library** | no | Operations: Manage; everyone else: Access | all clubs: Access | – |
| **Attendance** | yes | can lock and unlock a club's figures | clubs: Manage their own figures | – |
| **Newsletter** | no | Media and Broadcast, Operations: Manage; others Off | Off | Off |
| **DAZN** | yes | Media and Broadcast, Operations: Manage (data import); all League: Access | clubs: Access (own) | DAZN key: Access to all clubs |
| **Handbook** | no | Operations: Manage only; all League: Access. (Superadmin edits through the badge, not through a Media key.) | all clubs: Access | – |
| **Club Directory** | yes, with a twist | League Admin (Graham, Alastair): Manage | Secretary key: Manage **own** entry; other club staff: Access. Clubs see other clubs' basic details, and their own in full. | – |
| **Judgements** | no | staff editing stays as is; it is a communication tool | Access | – |

Club Directory's twist: it is club-specific for *editing* and *private
details*, but every club can read every other club's public entry. Model it as
club-specific with a stated exception, not as two tools.

## Logins: the part that sets the pace

Keys on the club side need **a login per person**, and Richard is not yet
comfortable giving clubs logins. So the build is in two halves:

1. **Everything that does not need club logins.** League and External people
   already have accounts (or will). The model, the grants, the rules and the
   portal screens can all land with clubs still on codes.
2. **Club codes stand in for the Club base.** A club code signs in as "Club,
   that club, no keys": the **club representative**, which is what Richard
   wants as the default club access anyway. Every club-specific tool keeps
   working exactly as it does today.
3. **Club logins, later and separately.** When they come, a club person is
   Club base + their club + keys. Club Directory self-editing (Secretary key)
   is the first thing that waits on this.

Clubs keep using their club codes until Richard says otherwise.

## How today maps onto it

For the migration report (session 5). Nothing changes for anyone until the
report has been read and agreed.

| Today | Becomes |
|---|---|
| `superadmin` | League + Superadmin badge |
| `admin` | League + keys (decided per person; League Admin people get Operations) |
| `staff` | League + keys (decided per person) |
| `club-admin`, `club-staff` (accounts) | Club + their club; keys decided when club logins arrive. Today there are few or none: check. |
| club code | Club + that club, no keys (club representative) |
| NL holder of a club code | League, by code (it already is not a club) |
| per-person override in `users/<uid>/tools/<key>` | a key, if it is a real job ("Vacancies approver"); otherwise dropped |
| `tools/<key>/defaults[<role>]` | `tools/<key>/grants.base` and `grants.key` |
| `audience` (league / club / meta) | follows from grants: a tool with no Club grant is League-only, and the rules say so |
| Level words `access` / `admin` | Access / Manage on screen; whether the stored value changes is open question 3 |

## Where it lives in the code

For whoever builds it. Today's pieces, and what each becomes:

- **`users/<uid>`** gains `base`, `club` (already there for club users),
  `keys: { <key>: true }` and `superadmin: true`. `role` stays, read-only,
  until the switch-over is proven, so the old resolver can be put back.
- **`tools/<key>`** (the registry, `system/rtdb/tools-registry.snapshot.json`,
  deployed by `deploy-tools-registry.yml`) gains `clubSpecific`, `grants`,
  `lifespan`. `defaults` stays alongside until the switch.
- **`NL.resolveToolLevel`** (`nl-utils.js`) gets a successor that takes the
  person and the tool record and applies the rule above. Pure, tested, one
  copy. The portal, `auth-guard.js` and the rules generator all call it, as
  they all call `resolveToolLevel` today.
- **`scripts/rtdb-level-rule.mjs`** generates rules from the same grants, so
  the portal and the database cannot disagree (`tests/rules-follow-portal`).
  Keys in rules: Firebase rules cannot loop over a person's keys, so each
  grant becomes an explicit `root.child('users').child(auth.uid).child('keys').child('<key>').val() === true`
  test. Long, generated, never hand-written.
- **Code doors** (`club-code.js`, `programme.js`, and the others listed in
  `functions/index.js`) mint claims. A club code's claim already carries the
  club; it needs nothing new to mean "Club, that club, no keys".
- **The portal's people screens** set base, club and keys, and show each
  person's resulting level on every tool, worked out, never typed.

## Safety rails

- **Report before switch.** Before the new resolver decides anything, a
  report lists, for every person and every tool, old level and new level, and
  every difference is agreed. Same report-then-act shape as the registry and
  restore workflows.
- **Run both, compare, then switch.** For a period the guard works out both
  answers and logs any disagreement to the audit, while still obeying the old
  one.
- **Superadmin always gets in.** But note the trap already recorded in
  `CLAUDE.md`: superadmin skipping the check is how a broken tool hides from
  the one person testing it. Every launch is checked as a non-superadmin.
- **Rules ship by button**, never on merge, as now.
- **A way back** at every step: old fields kept until the new ones are proven.

## Build order, one session each

1. **Decide every tool.** A standalone prototype page (or artifact) listing
   every real tool with its club-specific flag, levels and grants, plus a
   "pick a person, see what they get" preview. Richard goes through the tools
   one at a time. Output: the grants for every tool, agreed. Nothing live
   changes. This is Richard's own stated way in: concept first, all real
   tools, one at a time, then hand over.
2. **The resolver and the data shape.** New fields on `users/` and `tools/`,
   the new resolver with tests, the registry snapshot filled from session 1.
   Nothing reads them yet.
3. **Rules from grants.** The generator writes rules from the new grants;
   tests prove portal and rules agree. Not published yet.
4. **The portal's people screens.** Set base, club, keys, superadmin badge;
   the who-can-open-this panel on every tool.
5. **Migration report and switch-over.** Map every current person; Richard
   agrees the differences; run both resolvers side by side; then switch
   `auth-guard.js`, publish rules. Old fields stay for the way back.
6. **Tidy.** Remove `role`-based defaults, the audience field and the retired
   documents; update `CLAUDE.md` and `/new-tool`.
7. **Later, separately: club logins.** Club people with keys; Club Directory
   secretaries manage their own entry. Its own plan when Richard is ready.

Possibly alongside: rebuilding the tools cleanly under `nl.tools/portal/` for
the new model (Richard, 29/10/2026: considering, not decided).

## Open questions

Answer these in session 1, before anything is built.

1. **Where does the Trust sit?** One group, no subdivisions (29/10/2026). Is
   that an External base with a Trust key, or its own base?
2. **Are Keys and League groups the same thing?** This plan treats the League
   groups (Operations, Finance, and so on) as keys, so one idea covers both
   sides. Confirm.
3. **Stored level values.** Keep `access` / `admin` in the database and only
   say Access / Manage on screen (no migration), or rename the stored values
   too (cleaner, touches every rule)?
4. **Coded links for outsiders.** `guest-pass-plan.md` scoped a code that
   carries a tool list. With an External base, does an outsider get an
   account with keys instead, or do both exist (accounts for regulars like
   DAZN, codes for one-off jobs)?
5. **Per-person overrides.** This plan drops them in favour of keys
   ("Vacancies approver" becomes a key). Is there any override today that is
   not really a job and should survive?
6. **The admin badge.** Who besides superadmin manages people and keys, and
   is that a badge or a key?
7. **Heads of department.** A cross-cutting key held alongside a person's own
   team key: confirm it grants anything on its own, or is it only for
   mailing and views?

## Inputs this was built from

- Richard's decisions, 29/10/2026 (groups, levels, club-specific, per-tool
  calls, `/temp/`, the info panel) and 11/11/2026 (Base, Club, Key, Level;
  one base each; club representative as default; club self-editing waits for
  logins; clubs stay on codes).
- Today's code: `system/auth-guard.js` (`checkAccess`, the audience gate),
  `NL.roles` and `NL.resolveToolLevel` in `system/nl-utils.js`,
  `scripts/rtdb-level-rule.mjs`, the registry snapshot.
- The older plans named at the top, and `club-code-plan.md` (one club code
  for every club-facing tool, settled 19/08/2026).
