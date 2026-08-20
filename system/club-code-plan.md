# One club code — Handbook and Club Directory go-live

**Status: plan. The credential model is SETTLED (19/08/2026, Richard). The
go-live order is settled. Section 1 is a blocker that must be answered before
the Handbook is gated, because gating it otherwise achieves nothing.**

Two tools, one credential, Handbook first. Drafted 19/08/2026.

---

## 0. The decision, in one paragraph

**One access code per club, covering every club-facing gated tool.** Not one
code per tool. The code identifies the **club**; what that club may open is
decided in the **RTDB rules**, per tool. Codes are reset on demand, per club.
Richard, 19/08/2026: *"a single club access code, and then we can reset it on
demand."*

This replaces a situation nobody chose: **two sets of 72 codes already exist**
— Programme Packs (`config.clubs`) and Club Directory (`config.readers`) — and
the Handbook would have made three.

### 0.1 Why the credential must carry the club, not a role

Programme Packs mints `pClub: '<clubKey>'` — the real club key from
`clubs-meta`. Club Directory mints `dir: 'reader' | 'editor' | 'admin'`, which
says what *kind* of visitor you are and not *which club*.

That is exactly why the Directory cannot currently do the thing this project
exists to do: **it has no way to know that Forest Green is looking at Forest
Green.** The club-shaped claim is not a tidiness win. It is the mechanism.

### 0.2 Issue fresh codes; do not repurpose the Programme ones

Recycling the *mechanism* is right. Recycling the *codes themselves* is not.
A code someone was given for matchday artwork should not silently become a key
to colleagues' phone numbers — that is an access widening nobody decided, club
by club.

**Issue one new set of 72, retire both old sets, tell 72 clubs one thing once.**
Same build, same effort, and there is a single sentence to explain rather than
an archaeology of which code does what.

---

## 1. BLOCKER — the Handbook is already public, and not only in RTDB

**Gating `app-data/ops-handbook` gates one copy of three.** Before any code is
written, decide what happens to the other two.

| Where | What | Reachable by |
|---|---|---|
| RTDB `editions` + `publishedEditionId` | the published edition | **anyone** — rules say `.read = true` |
| `/handbook/handbook.pdf` | 152 rendered pages, committed | **anyone** with the URL |
| `handbook/seed-*.json` | the full text — league rules, articles, appendices, memorandum, board directives | **anyone**, and it is in git history forever |

The seeds alone are ~600KB of the document as structured JSON in a **public**
repository. `seed-league-rules.json` opens with the FA Standardised Membership
Rules and every clause under them.

So a club code on the reader is a sign on one door of a building with three.

**This does not stop the project.** It changes what "gated" is claimed to mean,
and that claim has to be true before 72 clubs are told it. Three honest routes:

1. **Gate the RTDB copy, accept the rest is public.** Fastest. The gate becomes
   a front door and a courtesy, not a boundary — and the Handbook is league
   rules, not personal data, so that may be entirely fine. **It must be said
   out loud rather than assumed**, because the same architecture then carries
   the Directory, where it would not be fine.
2. **Gate properly.** Rules changed on `editions`/`publishedEditionId`, the PDF
   moved to Firebase Storage behind Storage rules, the seed JSON removed from
   the repo. History still holds the old text, so this buys "not trivially
   downloadable", never "never was public".
3. **Split the difference.** Gate RTDB and move the PDF; leave the seeds, since
   they are a one-time import artefact rather than the live document.

**Recommendation was 2, minus the impossible part.**

### 1.0 SETTLED 19/08/2026 — route 3

Richard: *"yes to firebase if it is an easy job"*, then *"keep seeds for now"*.

So: **rules gated, PDF moved to Storage, seed JSON stays in the repo.** That is
route 3, and the consequence is worth stating rather than leaving to be
discovered:

> The handbook TEXT remains publicly downloadable from this repository, as
> ~600KB of structured JSON, whether or not the reader asks for a code.

The gate is therefore real for the reader and the PDF, and **not** a boundary
around the content itself. Say "sign in with your club code" to clubs — never
"this is confidential", because it is not, and one search of a public GitHub
repo proves it.

The seeds are a one-time import artefact rather than the live document, so
this is a defensible place to stop. It stops being defensible the moment the
same architecture carries the Directory, where the equivalent file would be
personal data. **The Directory ships nothing comparable to the repo. Ever.**

### 1.1 Also true, and worth deciding once

`/handbook/reader.html` is live and public today. Gating it takes something
people may already be using and puts a code in front of it. That is a
communications decision, not a technical one.

---

## 2. What gets built

### 2.1 One function, one config, one claim

Modelled on `functions/programme.js`, which is the working reference:

- **Config** at a single node, never client-readable. `.read`/`.write` false
  outright, as `ops-club-directory/config` already is.
- **Codes are never checked in the browser.** The four existing gates all
  validate server-side and this one is no different. The scar this rule comes
  from is in `system/retired/nl-cup-footage.md`: *"A gate whose answer key
  ships with the question is a screen, not a boundary."*
- **The claim carries the club key** from `clubs-meta`, plus `'*'` for NL
  staff, exactly as `pClub` does today.
- **Entitlement lives in the rules**, not in the code. Adding a third tool means
  extending rules, not minting a fourth set of codes.

The rule shapes already exist and are proven in the Programme node:

```
.read  = auth != null && auth.token.<claim> != null          // any club
.write = auth != null && auth.token.<claim> === $club        // own club only
```

### 2.2 Migration, not a big bang

`pClub` stays working while the new claim is issued alongside it. Programme
Packs keeps running throughout; its rules move to the new claim last, once the
Handbook and Directory are both on it and the 72 have the new code.

### 2.3 Revocation is not instant — say so in the UI

A custom claim lives in the holder's token until it refreshes, up to an hour.
Resetting a club's code stops the *next* sign-in, not the current session. Any
screen offering "reset" must not imply an immediacy it does not have.

---

## 3. Handbook go-live

In order. Steps 1–3 are independent of the gate and can land first.

1. **Freeze v1.** Colleagues have been editing the draft; publish the edition
   and record which one is `publishedEditionId`. Everything downstream reads
   the frozen edition, never the draft.
2. **Formatting pre-flight** — §5.
3. **Identity bar.** The reader is a public standalone page and should wear the
   white `.nl-idbar`, per the canon rule as revised 18/08/2026.
4. **Answer §1**, then apply the rules change and move the PDF.
5. **Gate the reader** with the club code.
6. **Issue codes and tell the clubs.**

The Handbook is the right pilot precisely because it holds **no personal data**.
It exercises the whole mechanism end to end, and the worst case on day one is
that somebody reads the rulebook. Prove it here; then point it at the Directory.

Note that the Handbook does not need per-club *content* scoping — every club
sees the same rules. The club key is for the identity bar and the audit line,
not to change what is rendered. Another reason it is the safe first outing.

---

## 4. Club Directory second

### 4.1 The withholding already works, and it works correctly

This was the part expected to need building. It does not. `_directory.js`
already:

- publishes a record the withheld entries were **physically removed from**,
  rather than hidden in the payload — the correct posture, and the only one
  worth having;
- publishes a **marker** in their place, so a record can say *"there was
  something here"* without carrying the something;
- renders that marker as **"Not published"**, per channel, so an email can be
  withheld while a phone number is not.

What is missing is only the audience rule. The marker is currently off in the
reader (`showHidden` false), because the reader had no way to know who was
looking.

### 4.2 So the change is small, and the club code is what enables it

With a club-shaped claim, the reader can show the marker **on the viewer's own
club's rows only**:

> **Forest Green Rovers viewing Forest Green Rovers** — sees "Not published"
> against a withheld email. Knows the record exists and that a colleague chose
> to withhold it.
>
> **Forest Green Rovers viewing anyone else** — sees nothing at all. Not a
> pill, not a gap, no signal that a record exists.

**The value is never sent to the browser in either case.** The marker is a flag,
not a redaction of a payload that is present-but-hidden. That distinction is the
whole design and it must survive whatever is built on top.

### 4.3 What must not happen

Do not "improve" this by publishing the withheld values and hiding them in the
UI so the own-club view can reveal them. It would be less code and it would be
a data breach waiting for someone to open dev tools.

---

## 5. Formatting pre-flight — before v1 is frozen

Answering *"is there anything we need to do on formatting before we go live?"*

**Real, worth doing:**

- **A stale canon flag.** `handbook/index.html:26` still says the `.nl-doc`
  block is "a strong candidate to promote" and "kept tool-local for its first
  outing". It was promoted at **nl-brand v2.25** — the tool's own changelog
  records it eleven lines further down. The comment is a promise that was kept
  and never retired, and CLAUDE.md names this exact failure. Delete it.
- **The identity bar** on `reader.html` and `print.html` — §3.3.
- **A read-through of the frozen edition** before it is announced. Computed
  clause numbering means a mis-parented node renumbers everything under it, and
  the seeds were a *"best-effort import"* from `.docx` by their own admission.
  This is a human job, not a lint rule.
- **`pdf-meta.json` is stale.** It records edition `-OydXGay…` rendered
  28/07/2026 at 152 pages. Re-render after freezing, or the Download button
  silently serves the old edition.
- **The seeds say `2025/26`.** `seed-league-rules.json` carries the FA rules for
  last season. Confirm the draft has moved on and the seeds are simply the
  historical import.

**Not a problem, contrary to what I said earlier in conversation:** the document
CSS is *not* drifted across three copies. `.nl-doc`, `.nl-cover` and `.nl-crumb`
are canon and shared; the editor's only local rules are `.is-editing`
affordances, which are legitimately tool-local. I was wrong about that.

---

## 6. What Richard presses

He has **no CLI access**. Everything ships from a browser.

| What | How |
|---|---|
| Pages, readers, gate UI | merge to `main` — no build step |
| The auth function | automatic on merge — but note `deploy-functions.yml` deploys **all** functions, not just the new one |
| RTDB rules | Actions → **Deploy RTDB rules**, type `publish` |
| Storage rules (if the PDF moves) | Actions → **Deploy storage rules**, type `publish` |
| The 72 codes | written to config in the console — never in a PR, never in this repo |

**The codes are secrets and this repository is public.** They go into RTDB
config directly. Store a hash if the design allows it; never a code, never an
example code, never a "test" code, in any file here.

---

## 7. Open questions

1. **§1 — which of the three routes.** Blocking for the Handbook gate. Nothing
   else in this plan is blocked by it.
2. **Does the Handbook reader stay at its current public URL** once gated, or
   move? People may have the link already.
3. **Who at each club receives the code?** The Programme contact and the
   Secretary are often not the same person, and the merged code reaches both
   tools. Richard has accepted the widening in principle (19/08/2026); the
   question here is only who is told.
4. **Does the Directory editor keep its own separate editor codes**, or do
   editors become a level on the club code? The reader is the merge candidate;
   editing is a different act.

## 8. Related, read before building

- `functions/programme.js` — the working reference for the whole handshake
- `system/guest-pass-plan.md` — the same shape from the other end: a pass for
  **outsiders**. A club code is for clubs; a guest pass is for a consultant
  with no club. Keep them separate or both become neither.
- `system/retired/nl-cup-footage.md` — the two-door precedent, and the scar
- `system/rtdb/rules.snapshot.json` — the deployed rules; edit here, never in
  the console
- `system/roles-and-access-plan.md` — the account model this must not duplicate
