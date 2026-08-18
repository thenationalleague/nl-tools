# VIP Access Manager — build spec v2.0 (handover)

**Status: spec, not a decision. Nothing is built.** Written 18/08/2026 to hand a
fresh Claude Code session everything it needs, after v1.0 was drafted without
the repository context.

**If you are that fresh session: read this whole file before writing code, then
read `CLAUDE.md`. Three of v1.0's instructions were wrong and are corrected
below — following them would have you build the wrong thing in the wrong
place.**

---

## 0. The single most important fact

**This tool already existed. It was retired on 15/08/2026 and its data is still
live in RTDB.**

Read `system/retired/dazn-vip.md` before anything else. The repository rule is
explicit: *read the retired record before proposing to build something that
existed once, so the work starts from the answered questions.*

What that record settles, and what v1.0 either missed or contradicts, is in §2.

---

## 1. Corrections to v1.0

v1.0 §8 gives three instructions. All three are wrong for this repository.

| v1.0 said | Actually |
|---|---|
| "read `/tools/judgements/index.html` as the canonical reference tool" | **No.** `CLAUDE.md` has a section headed *"Derive from the canon, never from a sibling tool"*. Three tools were retired in August and each left dangling references in tools that survived. Scaffold from `system/_template/` via the `/new-tool` skill. Judgements is a fine worked example; it is not the reference. |
| "Current RTDB rules (paste from Firebase console)" | **No.** `system/rtdb/rules.snapshot.json` **is** the deployed rules document. It ships from this repo via Actions → Deploy RTDB rules. Edit that file in the PR. Never paste rules from the console. |
| "no hardcoded brand values" (correct, but incomplete) | Also: no hardcoded font sizes. Every size is a `--text-*` token. `--text-xs` is for kickers and fine print only; body text, labels, hints and buttons are `--text-sm`. Two tests enforce the 12px floor. |

Also stale: v1.0 says "Brand/UI detail intentionally light — this spec goes
through the brand tightening pass separately". There is no separate pass. The
brand rules are in `system/nl-brand.css` and the Style Guide (`/style-guide/`),
and they apply as you build.

---

## 2. What the retired tool settled

From `system/retired/dazn-vip.md`. These were decided with Richard and are the
expensive part; a rebuild that re-argues them wastes the work.

### 2.1 The three-state lifecycle — and v1.0 contradicts it

The old tool ran `pending` → `sent` → `complete`:

- **pending** — club submitted
- **sent** — NL emailed DAZN; **the mirror still shows the old state**
- **complete** — DAZN confirmed; the mirror updates

The record's words: *"That three-state honesty — the mirror never claims what
DAZN has not confirmed — was the tool's whole point."*

**v1.0 puts this out of scope** (§3: *"Status workflow beyond 'requested on
[date]' vs actioned"*) and proposes a two-state model where the slot updates the
moment the club confirms.

That is the one thing the previous build existed to prevent. If a club swaps a
slot and the tool immediately shows the new person, the tool is asserting
something DAZN has not done — and DAZN is the only real authority. A club then
believes their new VIP has access when they do not.

**This is the first decision for Richard.** Either:

- **(a) Keep two states** and accept the record is a request log, not a mirror —
  in which case the UI must never present a slot as *granted*, only as
  *requested*, and the wording matters more than the data shape; or
- **(b) Restore three states**, which costs one extra field and one admin action
  and is what the previous build concluded.

The v1.0 admin flow already has "mark a slot as actioned once DAZN confirms",
which is the third state under a different name. The two designs are closer than
they look; what is missing is what the club sees in between.

### 2.2 Reconcile — steal it

The old tool's v1.6 Reconcile tab: paste DAZN's authoritative list, diff it
against the mirror **matched by email** (so a name change renders as an edit,
not remove-plus-add), type `OVERWRITE` to confirm, apply in one batched update,
stamp `lastVerifiedAt` per org. Orgs missing from the paste are left untouched —
honest about what was actually verified.

The record says: *"Any future tool mirroring an external authority should steal
this wholesale."* Not in v1.0's scope. Worth adding, because without it the
mirror drifts from DAZN and nothing ever catches it.

### 2.3 The canon candidate

*"Club proposes → NL approves"* is flagged in `system/tool-status-and-access.md`
as a canon candidate: DAZN VIP and Vacancies are the same shape. DAZN VIP adds a
third leg — an external authority confirming. If this is built, look at whether
the shape belongs in canon rather than being written a third time.

---

## 3. Data, and the PII rule

**This is the part to get right before anything else.**

The tool's data is **names and email addresses of club staff**. That is personal
data. This repository is **public**.

The retired record, verbatim:

> **The v1.7 lesson, learned the hard way:** the page once embedded a seed TSV
> of ~400 names and emails in a public repo. Stripped 25/07/2026, but the repo
> is public and history is forever — treat that list as disclosed. No future
> tool ships seed data in the page.

Hard rules, from `CLAUDE.md` and that incident:

1. **No name, email, phone or address is ever committed** — not in a seed file,
   a fixture, a test, a comment, or an example. No exceptions.
2. VIP data lives in RTDB and reaches the browser at runtime behind auth-guard,
   gated by rules.
3. If Richard hands over a spreadsheet of current VIPs, **stop and ask where it
   should live**. Being handed a file is not permission to commit it.
4. Test fixtures use invented names.

### 3.1 There is already data at a different path

v1.0 §4 suggests `/app-data/ops-vip-access/{clubKey}/slots/{0-4}`.

**But `app-data/media-dazn-vip/` still exists in RTDB, still has rules in
`rules.snapshot.json`, and holds the real operational data** — orgs, VIP lists,
the request queue and per-org audit. The retired record deliberately left both
in place: *"deleting it is a separate decision for whoever owns the DAZN
relationship."*

So the second decision for Richard: **migrate, or start clean?**

- **Reuse `media-dazn-vip`** — the data is there, the rules are there, and the
  history is not lost. Costs: an old shape to work with, and a `media-` prefix
  for something that is arguably ops.
- **New `ops-vip-access`** — clean shape, matches v1.0. Costs: the old node
  becomes an orphan holding personal data that nobody is maintaining, which is
  its own problem and needs an explicit decision to delete.

**Do not create the new path and leave the old one sitting there.** Whichever
way it goes, the other node's fate is decided in the same PR.

Note the order-of-operations rule from the record: when data does go, **the rule
and the data leave together, never the rule first.**

---

## 4. The build

### 4.1 Scaffold

Use the `/new-tool <slug>` skill. It copies `system/_template/` and does the
placeholder swaps. Do not hand-build the `<head>`.

### 4.2 Wiring contract — current canonical values

These are correct as of 18/08/2026. **Do not copy them from another tool; read
them from `system/_template/index.html`,** which is the source of truth, and
which `lint-tools.sh` prints at the top of every run.

```
nl-brand.css ?v=48   nl-utils.js ?v=42   nl-topbar.js ?v=10   auth-guard.js ?v=16
```

Every gated page declares, before `auth-guard.js`:

```js
window.NL_TOOL = { title: 'VIP Access', toolKey: 'ops-vip-access' };
var NL_TOOL_KEY = 'ops-vip-access';
```

Plus `#pageWrap` (hidden by default), `<div id="nlTopbar"></div>`, an
`NL_CHANGELOG` array, and `window.nlAuthReady = function(session) {...}`.

**Never read RTDB before `nlAuthReady` fires.** For async flows needing a live
token mid-flight, wrap in `NL.ensureAuth().then(...)`.

Run `bash system/lint-tools.sh` before you finish. CI runs it with `--strict`.

### 4.3 Access model — read this, do not invent one

The model was settled on 17/08/2026. `system/roles-and-access-plan.md`, the
SETTLED block at the top, and `system/tool-status-and-access.md` for how it
applies per tool.

**Five roles, two realms:** League (`superadmin`, `admin`, `staff`) and Club
(`club-admin`, `club-staff`).

**Role is the toolset.** What someone can *do* comes from their role, not from a
per-tool level. For this tool that maps directly onto v1.0's two flows:

| | |
|---|---|
| Club Staff | see their club's 5 slots |
| Club Admin | + submit swaps for their club |
| League Staff | see all clubs |
| League Admin | + edit any slot, mark actioned |

**The per-tool level says whether you get *in*, not what you can do.** Only three
tools in the estate read the `admin` level; unless this one genuinely needs a
fourth tier beyond role, declare `levels: ["off","access"]` in its registry
record so the portal stops offering a "Manage" control that sets a value nothing
reads.

**Read the level from `session.toolLevel`** (auth-guard v6.5+), never from
`session.tools[key]` — the latter misses the registry default and three tools
got that wrong.

**Club scoping** is `NL.isClubUser(session.role)` and `NL.canClubEdit(role)`.
Note both take a **role string**, not the session object — passing the object
silently disables club scoping, which is a bug that shipped in Fixtures.

This answers v1.0's open question about whether admin is Richard-only: **it is
not a new question.** League Admin gets it by role. If one named person should
have it and other League Admins should not, that is a per-user exception in the
portal, not a design decision in this tool.

### 4.4 Registry and rules — two follow-ups the scaffold does NOT do

1. **`tools/<toolKey>` record** in `system/rtdb/tools-registry.snapshot.json`.
   That file **is** the registry; it deploys via Actions → Deploy tools registry
   (report mode first). Without a record the page is superadmin-only and
   invisible on the portal.
   - `audience: "club"` — clubs need it.
   - `defaults` per role, and `levels` per §4.3.
2. **Rules** for whichever `app-data/...` path §3.1 settles on, in
   `system/rtdb/rules.snapshot.json`. Rules are the boundary; the UI is
   presentation. A club must not be able to read another club's slots **at the
   rules level**, not merely be shown a filtered view.

### 4.5 Email

`NL.endpoints.gas` is the consolidated Apps Script endpoint. Source lives in
`gas/` in this repo and is two-way synced — **edit the `.js` files in `gas/`,
not the Apps Script editor.** Deploy via Actions → Deploy GAS.

Privileged GAS calls verify the caller's Firebase ID token server-side. Follow
that pattern: the portal's `nlGasFetch` attaches a fresh `idToken` and GAS
checks it. **A URL alone must not grant privilege** — Vacancies shipped an
unauthenticated write behind a public URL and it was fixed in v3.17.

Three of the GAS endpoints are spam-facing and have no reCAPTCHA yet; do not add
a fourth without one.

---

## 5. What Richard has to press

He has **no CLI access**. Everything ships through GitHub Actions from a browser.

| What | How |
|---|---|
| The tool's HTML/CSS/JS | merge to `main` — GitHub Pages, no build step |
| RTDB rules | Actions → **Deploy RTDB rules**, type `publish` |
| `tools/` registry | Actions → **Deploy tools registry** — `report` first, then `publish` |
| Apps Script | Actions → **Deploy GAS**, type `publish` |

Say in the PR body which of these the change needs. A PR that changes rules
needs one button press; one that only changes the page needs none.

---

## 6. Open questions

**Decided by Richard before or during build. The first two are blocking.**

1. **Two states or three?** (§2.1) — does the club see "requested" until DAZN
   confirms, or does the slot change immediately? Blocking: it changes the data
   shape and the whole UI.
2. **Reuse `media-dazn-vip` or start `ops-vip-access`?** (§3.1) — and in the
   same breath, what happens to the node that is not chosen. Blocking: it is the
   data path.
3. Is Reconcile (§2.2) in v1, or deferred? Without it nothing catches drift
   between the mirror and DAZN.
4. The DAZN recipient address for the GAS trigger. **Supply it directly to the
   GAS config, not in a PR** — it is a third-party contact in a public repo.
5. Tool key: `ops-vip-access` suggested. No clash in the current registry.
6. Does this tool need an `admin` *level*, or does role cover it? (§4.3 — the
   default answer is role.)

---

## 7. What "done" looks like

A layperson should be able to run this in a browser:

- A Club Admin signs in, opens the tool, sees **their own club's** five slots and
  no other club's.
- Filling an empty slot shows a confirmation naming the person being added.
  Swapping shows both names — removing X, adding Y.
- Confirming sends the email, and the slot reflects whatever §6.1 settles on.
- A Club Staff user sees the same five slots and **cannot** submit anything.
- A League Admin sees all 72 clubs, can mark a change actioned, and can edit a
  slot directly.
- Signing in as a club and editing the URL to another club's data fails **at the
  rules level**, not just in the UI.
- `bash system/lint-tools.sh --strict` is clean, `npm test` passes.
- `git log -p` for the whole branch contains **no real name or email address**.

---

## 8. Reading list for the fresh session

In this order:

1. `CLAUDE.md` — the whole file, especially *Data handling*, *Derive from the
   canon*, and *Reuse-first*
2. `system/retired/dazn-vip.md` — what this tool was and what it settled
3. `system/roles-and-access-plan.md` — the SETTLED block
4. `system/tool-status-and-access.md` — how the model applies per tool
5. `system/_template/index.html` — the wiring contract and the live `?v=` values
6. `system/nl-brand.css` — tokens, components, the type scale and its exceptions
7. `system/rtdb/README.md` — which snapshots are deployed vs reference
8. `/style-guide/` in a browser — "is X already a token?"

`/judgements/index.html` is a good worked example of a club-audience tool with
an approval flow. Read it as an example, never as the reference.

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| v2.0 | 18/08/2026 | Rewritten for handover. Corrected v1.0's three wrong references; surfaced the retired tool and its settled three-state lifecycle, Reconcile tab and PII incident; flagged the live data at `media-dazn-vip` against v1.0's proposed new path; replaced the invented access model with the settled one; added deploy routes, acceptance criteria and a reading list. |
| v1.0 | 18/08/2026 | Initial spec drafted from grill-me session, without repository context. |
