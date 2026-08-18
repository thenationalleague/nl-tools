# Guest passes — scoping, not yet built

**Status: scoping. Nothing here is built. Do not build it until the four open
questions at the foot are answered.**

Drafted 18/08/2026 with Richard, after the question "how do I give a consultant
who works for one club access to two tools, without giving them an account?"

---

## The idea in one paragraph

A second way into `nl.tools`. Today there is one door: sign in, and your **role**
decides your toolset. A guest pass is a second door: type a code, and the code
itself carries a named list of tools. The holder never becomes a user, never has
a role, and sees a cut-down portal containing only the tools their pass names.

Richard's example: a consultant working for Boreham Wood needs Vacancies and the
club-facing Programme Packs. Nothing else. They should not have an account, and
they should not appear in the user list.

## What it is NOT

**It is not the `third-party` role coming back.** That role was retired on
16/08/2026 and the reasoning has not changed. The difference is not cosmetic:

| | `third-party` (retired) | Guest pass |
|---|---|---|
| Nature | an **identity** — a person | a **capability** — a job |
| Storage | a record in `users/`, with a role | a pass record; no user record |
| Resolution | the same role/level machinery as staff | its own claim, checked separately |
| Appears in the user list | yes | no |
| Can be promoted to staff | yes | no — you would create an account instead |

A role answers "who is this person". A pass answers "what may the bearer of this
code do". Keeping those separate is the whole point; the retired role failed
because it tried to be both and ended up being neither.

## Why it fits what already exists

This is not a new mechanism. Four Cloud Functions already do the same handshake:
take a passcode, validate it **server-side**, mint a **scoped claim**.

- `programmeAuth` → `pClub` (a club key, or `'*'` for master)
- `clubDirectoryAuth`, `uwPromoAuth` → `uwRole`, `fanWidgetsAuth`

RTDB rules already read those claims: `auth.token.pClub === $club`. A guest pass
is the same shape with a different payload — a list of tool keys rather than one
scope. `NL.codeGate.viaFunction()` is the client half, already in canon.

## The precedent, and its scar

The retired Cup Footage tool settled this exact two-door model:
*"Portal login for NL people; passcode or direct link for outside."* See
`system/retired/nl-cup-footage.md`.

It also left the warning, and it is the one line to carry into any build:

> Credentials were in the page. `footage/data.js` was committed to this public
> repo and contained the producer passcode and every club's access token, and
> the gate checked the typed code against that same file in the browser.
> **A gate whose answer key ships with the question is a screen, not a
> boundary.**

Codes are validated server-side or the feature does not ship.

---

## Which tools a pass may name

Eligibility is decided by **audience**, and it is an allow-list, not a
deny-list — a tool is ineligible until someone decides otherwise.

### Never — league audience (6)

`media-programme` (Programme Packs **admin** console) · `ops-fan-widgets` ·
`staff-graphics` · `staff-newsletter` · `staff-travel-planner` ·
`staff-website-archive`

These are NL staff tools. A pass must not be able to name one, and auth-guard
must refuse even if a malformed pass does.

**Note the trap in Richard's example.** "Programme Packs" is two things:
`media-programme` is the league-only admin console; the club-facing side is
`/programme/`, which is already passcode-gated and is what a consultant would
actually need. The admin console is never eligible.

### Never — meta audience (3)

`ops-estate` · `ops-nls-monitor` · `staff-style-guide`

Tooling about the estate itself. Superadmin in practice.

### Candidates — club audience (7)

`ops-attendance` · `ops-club-directory` · `ops-commercial-benchmarking` ·
`ops-fixtures` · `ops-handbook` · `ops-judgements` · `ops-vacancies`

Candidates, not approvals. Three carry data that needs a decision of its own
before a pass can name them:

| Tool | What a pass would expose |
|---|---|
| **Club Directory** | club staff contact details — **personal data** |
| **Judgements** | disciplinary records against clubs — club-confidential |
| **Attendance** | every club's gate figures |

Handbook, Fixtures and Vacancies are the safe starting set. Commercial
Benchmarking already shows clubs output only, so it is close behind.

---

## Pitfalls

These are the reasons to scope rather than build. Each is real and each needs an
answer in the design, not a discovery in production.

**1. A pass is a bearer token.** Whoever holds the code has the access. It can be
forwarded, pasted into a group chat, or left in an email after someone leaves.
There is no identity behind it, so an audit entry reads "the holder of pass
X", not a name. Vacancies lets you approve club job adverts; an approval
attributed to a code rather than a person may not be good enough.

**2. Revocation is not instant.** A custom claim lives inside the holder's token
until it refreshes — up to an hour. Deleting a pass stops the *next* sign-in,
not the current session. Any UI that says "remove access" must not imply
immediacy it does not have.

**3. auth-guard gains a second grant path.** That file protects all sixteen
tools. A second way to say yes is the highest-risk change in this plan. It has
to fail closed: an absent, malformed, expired or over-reaching claim grants
nothing, and the league/meta audiences are refused structurally before the
claim is even read.

**4. The audience gate has no answer for a pass holder.** They are in neither
realm. The proposal is that a pass names its tools explicitly and therefore
bypasses audience by construction — but that must be a written decision with
the league/meta allow-list enforced separately, not a gap nobody noticed.

**5. Club scoping is unsolved, and it is the one that leaks.** Richard's
consultant works for *one* club. Club roles are scoped to `session.club` —
`NL.isClubUser` / `NL.canClubEdit` and the tools' own filtering. A pass has no
club. Unless a pass also carries a club key, a consultant for Boreham Wood
opens Vacancies and sees all 72 clubs' submissions. **A pass must carry an
optional club scope, and the tools must honour it exactly as they honour a
club role.**

**6. RTDB rules do not know what a pass is.** Rules gate on `auth.token` shapes
that exist today. Adding a pass claim means rules work — the client-side gate
is presentation, the rules are the boundary. Any tool named by a pass needs
its rules extended, and that is a `deploy-rtdb-rules` run per change.

**7. PII.** A pass to Club Directory hands club staff contact details to
somebody with no account and no contract with the League. That is a data
protection question before it is a technical one.

---

## How it would be presented

**The front door.** `nl.tools` offers sign-in, plus a quieter "I have a code"
route. Not two equal buttons — the overwhelming majority are staff and clubs
signing in.

**After a valid code.** A cut-down portal: the pass's tools as cards, the org it
was issued to, nothing else. No user menu, no admin panel, no tool grid for
things they cannot open. It should be obvious it is a limited view, not a
broken one.

**Inside a tool.** Identical to any other user. The tool reads its level and
club scope the same way; it should not need to know a pass exists.

## How it would be managed

A **Passes** tab in the admin panel, alongside Users / Invites / Requests.

| Field | |
|---|---|
| Issued to | free text — "J. Smith, consultant" |
| Organisation | free text — "Boreham Wood FC" |
| Club scope | optional; a club key, or none for league-wide |
| Tools | multi-select, from the eligible list only |
| Created / last used | audit |
| Actions | **Rotate** (mints a new code, shows it once) · **Revoke** |

**The code is shown once, on issue or rotation, and never again.** Not behind a
reveal. Revealing requires reading a stored secret, and the four existing
config nodes are deliberately unreadable from the browser —
`ops-club-directory/config` is `.read = false` outright. Rotate-and-resend
answers "they have lost the code" without ever putting a live secret on screen,
and it invalidates the lost one. Store a hash, never the code.

---

## The fork: passes or accounts?

Raised by Richard, and it is the decision that shapes everything else.

A pass is deliberately cheap and anonymous. That is right for a producer who
needs upload access for one cup competition. It is arguably wrong for a
long-running consultant at a big client, where you would want to know **which
person** did a thing and to cut off one individual without disturbing the rest.

The two options are not exclusive — the estate could run both — but building
both at once is how neither gets finished.

**Suggested test for when a pass stops being enough:**

- more than one person at the same organisation needs access, **or**
- the access lasts longer than a single season or project, **or**
- they can approve, submit or edit anything, rather than only read

Any one of those, and it wants a real account with a real role. Passes stay for
short, read-mostly, one-person jobs.

Recording this now so the first awkward case is decided against a written test
rather than in the moment.

---

## Open questions — answer these before building

1. **Which tools are approved**, not merely eligible? Suggested start: Handbook,
   Fixtures, Vacancies. Club Directory, Judgements and Attendance need a
   separate data decision.
2. **Does a pass carry a club scope?** The plan says it must, or pitfall 5 is a
   data leak. Confirm.
3. **Is a bearer token acceptable on a tool with an approval action** —
   Vacancies specifically — or are passes read-only until logins exist?
4. **Passes, accounts, or both?** And if both, is the test above the right one?

## What exists already, for whoever picks this up

- `NL.codeGate` + `NL.codeGate.viaFunction()` — `system/nl-utils.js`
- Four working passcode → claim functions — `functions/programme.js`,
  `club-directory.js`, `uw-promo.js`, `fan-widgets.js`
- The claim-reading rule patterns — `system/rtdb/rules.snapshot.json`
- The settled role model this must not duplicate —
  `system/roles-and-access-plan.md`
- The precedent and its scar — `system/retired/nl-cup-footage.md`
