# VIP Access Manager — build spec v2.2 (handover)

**Status: spec, not a decision. Nothing is built.** Written 18/08/2026 to hand a
fresh Claude Code session everything it needs, after v1.0 was drafted without
the repository context.

**If you are that fresh session: read this whole file before writing code, then
read `CLAUDE.md`. Three of v1.0's instructions were wrong and are corrected
below — following them would have you build the wrong thing in the wrong
place.**

---

## 0. The single most important fact

**This tool already existed. It was retired on 15/08/2026, and Richard's verdict
is that it was not fit for purpose.**

Read `system/retired/dazn-vip.md` before anything else — but read it as
**evidence, not scripture.** The repository rule is to read the retired record
so the work starts from the answered questions; it is not a rule to repeat a
build that did not work.

**Richard, 18/08/2026, on why it failed:** the presentation was off — in
particular how it divided clubs from non-clubs — and the dialogue, the
confirmation and the email generation all felt clunky. *"It needed more than
just a brand pass."*

Note what is NOT on that list: the concept, the data shape, or the idea of a
mirror. **The ambition was right and the execution was poor.** So the parts of
the old tool worth carrying are the ones about correctness (§2), and the parts
to throw away are the ones about how it looked and felt — which is most of what
a user touched.

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

### 2.1 Status model — SETTLED 18/08/2026

Richard's answer, and it lands between v1.0 and the old build:

- The slot shows **"Requested on [date]"** after a club submits. v1.0 had this.
- **Richard marks it complete** when DAZN confirms. That is the old build's
  third state, without the middle one — there is no separate "sent", because he
  is the one sending and he knows.
- **After 24 hours, the club closes it out.** See §2.1a — this is in v1.

**What NOT to build: a `sent` state.** The old build had `pending → sent →
complete` and that middle state existed so an admin could record having emailed
DAZN. Richard is the admin and the sender; a state that only tells him what he
just did is friction, and friction is what made the old tool unpleasant.

### 2.1a The 24-hour club close-out — SETTLED: in v1

Richard, 18/08/2026: *"version one, at a twenty-four hour, allow people to mark
themselves as having access... and have it so they can mark an issue, and that
would generate an email to me so that I could triage it."*

Once a request has sat for **24 hours**, the club's own view of that slot offers
two actions and no others:

| Action | What it means | What it does |
|---|---|---|
| **They're in** | the person can log in to DAZN | closes the slot to complete; the new name becomes the slot |
| **There's a problem** | 24 hours on, still no access | keeps the slot in its requested state and **emails Richard** (§2.2a) |

Design notes that matter:

- **The club is the right party to ask.** They find out first — their person
  either gets in or does not. Asking DAZN would be asking the party with the
  least incentive to answer.
- **Neither action is a nag.** The two controls appear on the slot after 24
  hours. No reminder emails, no chasing. If the club never touches it, the slot
  stays requested and Richard can still mark it complete himself — that path
  does not go away.
- **"There's a problem" is a signal, not a state machine.** It does not create a
  fourth status. It flags the slot for Richard and sends him one email. He
  triages; whatever he does next is an ordinary admin action.
- Free text on the problem report is optional and should be short — one field,
  no form. It goes in the email to Richard, not on the slot as a public note.
- Both actions are available to **Club Admin only** — the role that could submit
  the request in the first place (§4.3). Club Staff see the state, not the
  buttons.

### 2.2 Reconcile — SETTLED: no formal tab

The old build had a Reconcile tab: paste DAZN's list, diff by email, batch
apply. Richard's answer: he will see DAZN's data periodically and update by
hand, and *"ease of use of the tool"* is the point.

So: **no paste-and-diff tab.** But the admin's direct-edit path stops being an
escape hatch and becomes a primary flow — the thing he will actually use to keep
the record true. It has to be fast: find a club, change a name, done. If editing
a slot as admin takes more than a couple of clicks, this tool has the same
problem the last one had.

The one thing worth keeping from the old Reconcile: **match on email, not name.**
A person changing their surname is an edit, not a remove-plus-add.

### 2.2a Who generates email — SETTLED, and it is a rule

**Every email in this tool is triggered by a club. Admin actions are silent.**

There are exactly **two** emails, with different recipients and different jobs:

| Trigger | Goes to | Purpose |
|---|---|---|
| Club submits a swap or fills a slot | **DAZN** | the request itself |
| Club reports a problem after 24 hours (§2.1a) | **Richard** | triage |

Richard: *"me as the admin... not necessarily generating direct emails to DAZN.
I think that's reserved just for the clubs — they use it as a change or update
mechanism."*

This matters more than it looks. It means:

- The club-facing flow is the *request* channel, and its email is the product.
- The admin view is a *record-keeping* surface. Richard editing a slot means he
  is recording something that already happened, not asking DAZN for anything.
- An admin edit therefore does **not** set `requestedOn`, and does not put the
  slot into a pending state.
- **A problem report never reaches DAZN.** It is an internal escalation to
  Richard, who decides whether it becomes a chase. Wiring it to the DAZN address
  would send the third party a message about their own failure to act, from a
  club, unmediated.

Build it so an admin action cannot fire either email, and so a problem report
cannot fire the DAZN one. That is a correctness rule, not a preference.

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

### 3.1 Data path — SETTLED: fresh, and the old node goes

Richard: *"Totally fresh. The existing data is entirely out of date."*

So:

- **New: `app-data/ops-vip-access/`**, shape of the build's choosing.
- **The old `app-data/media-dazn-vip/` node is deleted**, along with its rules
  in `rules.snapshot.json`. It holds names and emails that are out of date and
  that nobody is maintaining — an orphan full of stale personal data is worse
  than no data.

**Order of operations, from the retired record and non-negotiable: the rule and
the data leave together, never the rule first.** Removing the rule while the
data sits there leaves personal data behind a default-deny that somebody will
later "fix" by opening it up.

Deleting live RTDB data is Richard's action in the console, not something a PR
can do. The PR removes the rules; he clears the node. Say so in the PR body, and
say which order.

### 3.2 Who holds slots — SETTLED: orgs, most of which are clubs

**There are VIP allocations that are not a club.** v1.0's assumption of "72
clubs × 5 slots, flat" is a loss of function, not a simplification.

So the data shape is **orgs-with-slots**, where the overwhelming majority of
orgs happen to be clubs. Do not model clubs as the entity and bolt everything
else on beside it; that is what produced the presentation Richard rejected.

A club org is not free-text — it keys off the existing club record
(`NL.clubs.*`, crest, key) so club scoping in §4.3 works without a second
mapping. A non-club org is a record with a name and no club key.

**Presentation — Richard, verbatim: *"One list with a filter is correct."***

One list. Clubs and non-clubs in the same table, same columns, same actions,
with a filter to narrow to one or the other. Not two tabs, not two sections
stacked, not a "clubs" screen with an "other" screen behind it. The old build's
clubs/non-clubs division read as two parallel worlds and that is the specific
thing he named as wrong.

Consequences to build for, not discover:

- Club scoping (§4.3) is unchanged for club users — a Club Admin sees their own
  club's row and nothing else, non-club orgs included in "nothing else".
- Non-club orgs have **no club users**, so they have no self-service submission
  path. Their slots are admin-maintained. The club flow and the admin flow
  already differ (§2.2a); this is the same split, not a new one.
- The 24-hour close-out (§2.1a) is therefore a club-org-only affordance. A
  non-club org's slot has no one to ask.
- Slot count is per-org, not a global constant of five. Clubs get five; assume
  nothing about the rest until Richard says.

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

Six of v1.0's questions were answered on 18/08/2026 and have moved into the
sections above (§2.1 status model, §2.1a the 24-hour close-out, §2.2 no
Reconcile tab, §2.2a the email rules, §3.1 fresh data path, §3.2 orgs not just
clubs). What is left is two facts to supply, not two decisions to make:

### 6.1 Still to supply

- **The DAZN recipient address** for the GAS trigger. **Give it to the GAS
  config directly, not in a PR** — it is a third-party contact and this repo is
  public.
- **Richard's triage address** for the problem-report email (§2.1a). Same rule:
  GAS config, never a PR. If it is the same mailbox the portal already writes
  to, reuse that key rather than adding a second.
- Confirm `ops-vip-access` as the tool key. No clash in the current registry.
- **The non-club org list** (§3.2) — who they are and how many slots each. Not a
  blocker for the build; the shape is settled and the records can be entered
  once the tool exists. Do not commit the list to this repo.

### 6.2 Answered by the settled access model, not open

v1.0 asked whether admin should be Richard-only or any staff-tools admin. **This
is not a design question for this tool.** Role is the toolset: League Admin gets
the admin view. If one named person should have it and other League Admins
should not, that is a per-user exception in the portal. See §4.3.

## 7. What "done" looks like

A layperson should be able to run this in a browser:

- A Club Admin signs in, opens the tool, sees **their own club's** five slots and
  no other club's.
- Filling an empty slot shows a confirmation naming the person being added.
  Swapping shows both names — removing X, adding Y.
- Confirming sends the email and the slot reads "Requested on [date]" — the
  previous occupant still shown, because DAZN has not acted yet.
- Richard marks it complete; only then does the new name become the slot.
- **Richard editing a slot directly sends no email at all** (§2.2a) and does not
  put the slot into a requested state.
- A slot requested less than 24 hours ago shows **no** close-out controls. The
  same slot, aged past 24 hours, offers the Club Admin *"they're in"* and
  *"there's a problem"* (§2.1a).
- *"They're in"* completes the slot with no email to anyone. *"There's a
  problem"* emails **Richard** and leaves the slot requested — and **nothing in
  that path reaches DAZN**.
- A Club Staff user sees the same five slots, including their state, and
  **cannot** submit or close out anything.
- A League Admin sees every org — clubs and non-clubs in **one list with a
  filter** (§3.2) — can mark a change actioned, and can edit a slot directly.
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
| v2.2 | 18/08/2026 | The last two design questions answered and moved into the body. §2.1a: the 24-hour club close-out is **in v1**, and it is two-way — *"they're in"* completes the slot, *"there's a problem"* emails Richard for triage. §2.2a rewritten around **two** emails with different recipients — club→DAZN is the request, club→Richard is the escalation, and a problem report must never reach DAZN. §3.2: **there are non-club orgs**, so the shape is orgs-with-slots, presented as one list with a filter rather than two parallel worlds — which is the specific presentation failure Richard named. §6 reduced from open decisions to facts still to supply. |
| v2.1 | 18/08/2026 | Four questions answered by Richard and moved into the body: status model (requested-on, admin marks complete, no `sent` state), no Reconcile tab but the admin edit path becomes primary, only club submissions generate email, and a totally fresh data node with the old one deleted. Reframed the retired record as evidence rather than scripture — Richard's verdict is that the concept was right and the execution clunky, so what carries over is correctness, not layout. Raised §6.1, non-club orgs, which his own answer surfaced and nobody had asked. |
| v2.0 | 18/08/2026 | Rewritten for handover. Corrected v1.0's three wrong references; surfaced the retired tool and its settled three-state lifecycle, Reconcile tab and PII incident; flagged the live data at `media-dazn-vip` against v1.0's proposed new path; replaced the invented access model with the settled one; added deploy routes, acceptance criteria and a reading list. |
| v1.0 | 18/08/2026 | Initial spec drafted from grill-me session, without repository context. |
