# Permissions – who can open what, and do what

**Status: steps 2, 3, 4 and 6 built (12/11/2026): passes decide who opens
what. Access (`/access/`) replaced the portal's admin area: people,
invites, requests, who each tool opens to (live grants) and the Audit log.
Step 5 (rules generated from grants) and 7–9 are
still to do.**
Decided with Richard on 29/10, 11/11 and 12/11/2026 (the 12/11 grilling, 30
questions, settled almost everything). What was built, and where it differs
from the words below, is in "Built so far" at the foot.
Read this before touching `auth-guard.js`, `NL.roles`, `NL.resolveToolLevel`,
the portal's people screens, `system/nl-topbar.js`, the `tools/` registry
shape, the rules generator or the login page.

The grants for every tool live in the prototype, "Permissions – who can open
what" (artifact, v40.0), which starts from Richard's saved grid of 12/11/2026.
Its "Copy for session 2" / "Save as a file" output is the hand-over for step 2.
Visual design: the "NL Tools – card and key concepts" canvas, boards 6–10
(locked 12/11 – see "The pass" below).

When built, this **replaces** `roles-and-access-plan.md`,
`staff-club-audience-plan.md`, the access tables in `tool-status-and-access.md`,
`guest-pass-plan.md` and `club-code-plan.md`. Until then those are the record
of how today's system works; this is where it is going.

**Deadline that sets the pace:** the board meeting, about 19/11/2026. Steps 2
and 3 (passes visible, nothing about access changed) are the target for it.
They are built in a fresh coding session with push access to the NL Tools
repo; this document is that session's brief.

---

## Why change it

Today a person has **one role** (Superadmin, Admin, Staff, Club Admin or Club
Staff), and each tool says what each role gets (`tools/<key>/defaults`), with a
per-person override on top. That was the right call for launch (17/08/2026:
simple first). Real life has now asked:

- **A role mixes up who you are with what you do.** "Admin" means League,
  *and* senior, *and* allowed to manage most tools.
- **Clubs share one code each.** A code says which club, never which person.
- **Outsiders have no home.**
- **"Who can open this?" is hand-written** in four documents, and they drift.
- **Exceptions pile up.** One senior League account (12/11/2026) carries nine
  per-person "exceptions"; eight change nothing and one lowers its Club
  Directory access from Manage to Use.
- **Two answers to "can I edit?".** On about a dozen tools it is the Manage
  level; on the rest it is the role. A page can follow one rule for one
  control and the other for the next. Real case, 12/11/2026: Graham, League
  Staff, saw Club Directory's **Admin** tab (shown to every League person) but
  no **Edit** button (shown only with Manage). He was set to Use, so the page
  was right, and it still looked broken. In this plan, Manage is the only
  thing that means "can edit", on every tool.

## The model

| Word | What it is | Values |
|---|---|---|
| **Card** (the base) | Where a person belongs. Exactly one each. | Club · League · External (decided 13/11, built after club logins – see "External passes") |
| **Club** | Which club. Club card only. | one of the 72 |
| **Key** | An extra job, held on top of the card. Any number. | League: Operations, Media, Commercial, Finance, Senior leadership, Tester. Club: Operations, Media, Commercial, Finance. |
| **Level** | What a person can do on one tool. | Off · Access · Manage |

On screen the card is shown as a **pass** (see "The pass").

- **Access** reads. **Manage** is anything that changes what other people see
  (saving a draft, uploading, resetting a code, a club submitting its figures).
  A person's own filters or view preferences don't count. Access and Manage
  are the words on screen (eye and pencil icons); new fields store `access` /
  `manage`, old fields are left alone until the tidy-up.
- Club and League keys with the same name are **separate keys**
  (`club.finance` ≠ `league.finance`). Board and Heads of department are not
  keys; board members are club people and come in on their club card. The
  club secretary's key is **Operations** (renamed from Secretary).
- **Skeleton key**: a separate override card. Opens every tool at Manage. Not
  a base. The word "superadmin" is retired on screen. **Two holders: Richard
  and Alastair.** Every Skeleton-key action is recorded. Each holder's own
  card shows their job title like anyone else's.
- **No per-person overrides and no one-off passes.** If one person needs
  something, they get a key. Keys go with the job, not the job title.
- Every key records **when it was given and by whom**, with an **optional end
  date** (holiday cover, short projects). It disappears on that date; holder
  and giver get a reminder a few days before. A periodic review (e.g. annual
  "who holds what" for the Skeleton holders) can be switched on later from
  the same records.
- **Everyone starts with no card.** Cards are given deliberately, one by one
  (not pre-filled from today's roles).
- **Who gives out cards and keys:** League Operations give out Club cards and
  club keys only. League cards, League keys, Tester and the Skeleton key stay
  with the Skeleton key holders.

### Working out a level

```
level(person, tool) =
  skeleton key                         → Manage
  tool on the Structure shelf          → Off
  tool on the Sandbox shelf            → Off, unless the person holds Tester:
                                          then max(launch level, Access)
  tool is League only, person is Club  → Off
  otherwise the highest of:
    tool.grants.base[person.base]
    tool.grants.key[k] for each key k the person holds
  nothing matched                      → Off
```

Then the tool's **club data** setting limits what a Club-card person sees,
enforced in the database rules:

- **Same for every club** – Handbook, Document Library, Judgements
- **Own club only** – DAZN Viewership, Save of the Month (a pure submission tool)
- **Every club, changes own** – Club Directory, Programme Packs, Attendance,
  Vacancies
- **Own club, others anonymous** – Commercial and Financial Benchmarking

Tools a person can't open are not shown to them at all.

### What each tool record carries

- **For:** League only, or League and clubs. League only always wins over any
  club grant.
- **Shelf:** Main, Sandbox (in progress; testers and Skeleton key only) or
  Structure (Skeleton key only, permanently).
- **Club data:** one of the four above.
- **Levels offered**, **grants** per card and per key, **sensitive** flag,
  single-use or permanent (single-use at `nl.tools/temp/<tool>`).

When a new tool is built, `/new-tool` asks: single-use or permanent → League
only or clubs too → club data → grants. It starts in Sandbox; moving it to
Main is the launch, and everyone holding the right keys has it at once.
Graphics is one tool: open it and you get every graphics sub-tool (split one
out only when a specific person needs one sub-tool alone).

### Rules agreed on 12/11

1. **The League card opens anything that's for looking at.** Tools for making
   things – Graphics, Fan Widgets, Newsletter – belong to the team that makes
   them.
2. **Sensitive tools stay keys-only:** Club Codes, both benchmarking tools,
   Responsibilities. On both benchmarking tools clubs only ever get Access;
   Manage sits with the matching League team (Commercial for Commercial
   Benchmarking, Finance for Financial Benchmarking).
3. **Structure** = Data, Estate, NLServices API, Style Guide, Responsibilities.
4. **Club Codes:** Access = see codes to hand out; Manage = reset or change.
   League Operations hold Manage; nobody else opens it.
5. **Newsletter:** a place for making it (the PDF is the output). Media
   manage; everyone else Off.
6. **View as:** testers and the Skeleton key can see the *portal* as any
   person, real or made-up (which tools, which level, why). Opening a tool
   as someone else is Skeleton key only.
7. **The "who can open this" panel** on every tool, for admins, worked out
   from the grants, never typed.

### How a tool is managed (standard, adopted 12/11)

1. Access never shows an edit control – no greyed-out buttons, nothing.
2. Changing the thing in front of you happens **in place** (an Edit button on
   the item). Running the tool – imports, settings, approvals, the bin, bulk
   uploads – happens in a **Manage tab**.
3. The Manage tab is **always the last tab, on the tool's own page**. The nine
   separate `/admin/` pages move into it a tool at a time, as each is touched.
4. Clubs only ever edit in place, and only their own things; they never see a
   Manage tab. Club Directory, Attendance, Programme Packs and Save of the
   Month need both styles.

## The pass (design locked 12/11)

On screen the card is a **pass**: a lanyard accreditation pass. Boards 6–10
of the canvas are the reference; boards 1–5 were the earlier concepts.

- **Where it lives:** its own page, **`nl.tools/pass`**. Reached from the
  small pass and the "My pass" item in the menu under the circle, and from
  the Access denied page ("see your pass"). Shows only your own pass;
  anyone else's is "View as". Since 13/11 it is also the account page:
  password and sign-in settings sit at its foot (see "Your account").
- **The pass:** strap and metal clip threaded through a slot; header band in
  the club's (or League's) colour with the crest on a white seat; name and job
  title; a sticker for each key held, with its code (OPS, MED…) and name; keys
  not held are empty slots with a faint icon, no text; footer "League staff ·
  issued 12 NOV 2026" (date as day, three-letter month, year). The Skeleton
  key is a big black sticker stuck across the holder's own pass: a
  full-height skull and ACCESS ALL AREAS on two lines, nothing else
  (changed 12/11 from a second pass behind, which hid on a phone).
- **Club colours:** band = the club's primary (secondary if the primary is
  near-white); stickers use the other colour; the club's own pair is kept
  whenever it is readable.
- **Motion:** the pass falls straight in, catches on the strap with a small
  wobble, then swings gently from a pivot well above the screen. No hover
  effect. Motion is off for people whose device asks for less motion.
- **"My pass" screen:** the pass on the left (on a phone, above), hanging
  from under the top bar. Beside it, one alphabetical list of every tool the
  person can open, each a raised strip of the same height:
  - name and up to two lines of description;
  - a sticker for **each part of the pass that opens it**, in fixed columns
    (the rose/crest = everyone on that card, then one column per key held),
    each with a badge – eye = Access, pencil = Manage; stickers outranked by
    a higher level are faded;
  - the result on the right: **Access** or **Manage**;
  - navy strip when a key opened it, red (the club's colour for clubs) when
    the card alone did. No rose means colleagues without that key can't get
    in.
  - One line explains: Access lets you look; Manage lets you change what
    other people see.
- **Phone:** the stickers drop to a small row along the bottom of each strip.
- **No pass yet:** someone with no card sees "Your pass hasn't been issued
  yet" instead of an empty pass.

## The top bar

- **The menu under your circle** holds no tools at all: a small version of
  your pass (name, job title, key tags; a skull tag for a Skeleton key), "My
  pass", "People and cards" (only for those who can give out cards; the
  People and cards tool from step 4), "View
  as" (Skeleton key and testers only), Install as app, Sign out. It never
  scrolls. The portal home is where you go to tools.
- **A bell next to the circle** (see Approvals).
- Later: a breadcrumb in the top bar for tools with sub-pages ("Graphics ›
  Fixtures graphic", parent clickable).

## Access denied

- **Signed out:** nothing revealed; the sign-in page, then back to the page
  you wanted (`?next=` side job).
- **Signed in:** one consistent **"Access denied"** page showing the person's
  own cards and keys and what this tool needs ("View: club Media key ·
  Changes: club Operations key").
  - **Club people** get a **request button per key** that would open it: a
    key request, never a tool request. Strict pipeline: one route only
    (Pending), a one-line reason required, the approver sees everything the
    key opens before deciding, every approval and decline recorded. Club
    keys approved by League Operations.
  - **League staff** get no request buttons: the page says to **speak to the
    Operations team**. Never name individuals on this page.
  - **Sensitive tools:** no keys listed, no buttons – "speak to the
    Operations team".
  - **Tools for the other side** (a club person on a League tool): "This is
    for League staff" – nothing to request.
  - **Sandbox and Structure tools:** "Not available".
- The page (and the 404) is rebuilt in the portal's own layout – top bar and
  card styling – so it feels part of NL Tools.

## Club logins (now in scope)

Codes are retired, not kept:

1. Build club logins as part of this work.
2. Clubs request access: club, proposed keys, **job title** (printed on the
   pass). The existing request-access flow (`functions/account.js`,
   `submitAccessRequest`, server-written) gains the key picker and job title.
3. **League Operations approve every club request** and set or change the
   keys. Clubs managing their own staff is for later.
4. Email clubs about a month ahead; codes and logins run side by side (codes
   keep exactly their current powers); **codes off on a fixed date.**
5. The public Vacancies form retires on the same date; clubs submit from
   inside NL Tools.

### How people arrive (decided 13/11)

- **Clubs ask; everyone else is invited.** A club secretary shares one
  sign-up link with their staff. The link carries the club, so the person
  gives name, job title, zones wanted and a one-line reason. League
  Operations approve, seeing what each zone opens. League Operations can
  also invite club staff directly.
- **League staff and externals are invite-only.** The invite sets card,
  zones and job title; the person accepts and sets a password.
- While waiting, a club person sees a "pending" page.
- **Everyone signs in with email and password**, two-step later. No
  passwordless emailed sign-in links: every sign-in would depend on the
  person's inbox.
- **Email safety nets:** the sent log in Access's Audit tab, a **Resend**
  button on invites and approvals, and **Copy link** so an invite can be
  sent another way if the email never arrives.

## Your account (decided 13/11)

- **My pass is the account page.** An Account section at its foot: email,
  **Change password** (current password, then the new one twice), and later
  two-step sign-in. An "Account" item in the menu under the circle jumps to
  it. (This replaces "keep it separate from any account page" under The
  pass.)
- **Nobody sets or sees anyone else's password**, Skeleton key included.
  Access has a **Send reset link** button per person, which sends the same
  Firebase reset email as "Forgot password" on the sign-in page. Each send is
  written to the audit log (who, to whom, when).
- Point Firebase's reset email at an NL sender address so it isn't treated
  as spam.

## External passes (decided 13/11, built after club logins)

For organisations outside the League and its clubs: DAZN, the Trust,
agencies, freelancers.

- **An organisation record** is set up first, in a new **Externals** tab in
  Access: name, colours and a logo. Logos are uploaded to Firebase Storage in
  their own folder (empty to start; the sponsor logos already in the repo stay
  where they are), so changing one is an upload, not a pull request.
- **Zones belong to the organisation and are designed for it.** Each has a
  plain name, a three-letter code (suggested from the name, editable,
  unique across all zones) and its tools with a level. League and Club
  zones stay fixed; only external zones are custom.
- **Per-person differences come from zones, never per-person grants.** The
  "no overrides" rule holds: if one person needs more, their organisation
  gets another zone.
- **A pass needs at least one zone.** The External card itself opens
  nothing; Access refuses to issue an external pass with no zones.
- **Invite-only**, as above. Only the Skeleton key runs the Externals tab to
  begin with.
- **Closed by default.** A tool record carries an `externals` setting; absent
  means closed, and a new tool starts closed. A forgotten setting can only
  keep someone out.
- **Access is the ceiling** unless the tool was built for externals to
  change things (Programme Packs uploads).
- **Never the League view.** The tool's `externals` setting also says what an
  external sees of club data; if it says nothing, they see nothing.
- **Sensitive tools are a hard lock**, never a flag: Club Codes, Commercial
  and Financial Benchmarking, Responsibilities, Access (the registry's
  `sensitive` flag). Enforced three times: Access doesn't offer them in the
  zone editor; `NL.pass` returns Off for an External card on a sensitive
  tool whatever the data says; the database rules refuse an External card on
  those paths. Changing the sensitive list is a pull request.
- **First tools:** Programme Packs (programme editors see every club's
  library: it is a shared working space) and Fixture Management (Access,
  view only).
- **First organisation:** the Trust – Content Plan (Access), Document
  Library, Graphics (making its own posts only). If it ever needs the
  League's view across clubs, it becomes its own card, not a wider external.
- **Later candidates:** Brand Exposure (a sponsor sees only its own boards;
  needs that tool finished first), Matchday Live, Graphics for freelance
  designers, Content Plan for agencies.
- **The pass:** same NL lanyard, a third header colour, the organisation's
  logo as the big sticker, zone stickers stacked beneath, each with its plain
  name.

## Approvals and notifications

- **One approval pattern:** a club submits, it waits as **Pending**, League
  Operations approve, change or reject. Used by Club Directory edits,
  Vacancies, access requests and key requests.
- Each tool's Manage tab shows "Pending (n)".
- **A bell in the shared top bar** counts pending items for tools where you
  hold Manage. Clicking opens a short drop-down (not a modal), grouped by
  tool; each item links to the tool's Manage tab at that item. Approving
  happens in the tool, never in the drop-down.
- **Monthly club email** to each club's Operations holder: their Directory
  entry and who has NL Tools access on the club's behalf. The link opens a
  pre-filled page; corrections go to Pending.

## Per-tool notes

- **Matchday Live:** Sandbox, no testers.
- **Local Media:** Sandbox, League only, out of the monthly email; the public
  form retires with codes. Revisit later.
- **Brand Exposure, Social Output:** League card reads; in Sandbox until launch.
- **Website Archive:** offers Access only (nobody manages it).
- **Club Kits, Fixture Management:** League only, League card reads,
  Operations manage. **Content Plan:** League card reads, Media manage.
- Tools needing a **Manage level added in code:** Attendance, Brand Exposure,
  Club Codes, Club Kits, Commercial Benchmarking, Handbook, DAZN Viewership,
  Programme Packs, Save of the Month, Newsletter.
- How tools decide levels today (survey 12/11): 11 already ask the guard for
  the level (Brand Exposure, Club Directory, Content Plan, Document Library,
  Financial Benchmarking, Fixture Management, Judgements, Matchday Live,
  Social Output, Vacancies, Website Archive) and should follow the new logic
  untouched; 4 check the role directly and need swapping to "if Manage"
  (Attendance, Commercial Benchmarking, DAZN Viewership, part of Judgements);
  the rest only care whether you get in. Several tools mention `.role`,
  probably for display – confirm in step 2.
- Several tools let Access users write today (Club Codes, Club Kits at
  least). Audit and fix in step 5.

## How today maps onto it

For the migration report (step 4). Nothing changes for anyone until it has
been read and agreed.

| Today | Becomes |
|---|---|
| `superadmin` | League card + Skeleton key (Richard, Alastair) |
| `admin`, `staff` | League card + keys, given deliberately per person |
| club code | Club card, that club, no keys – until the codes-off date |
| NL holder of a club code | League, by code |
| per-person override in `users/<uid>/tools/<key>` | a key if it is a real job; otherwise dropped |
| `tools/<key>/defaults[<role>]` | `tools/<key>/grants` |
| `audience` (league / club / meta) | `for` and `shelf` |

## Build order

Codes keep working until step 9. Nothing changes for anyone's access until
step 6.

1. **Finish the decisions.** Prototype v40.0, the canvas and this document.
   Done 12/11.
2. **Hand out the keys, as data only.** `users/<uid>` gains `base`, `club`,
   `keys: { <key>: { given, by, until? } }`, `jobTitle`, `skeleton`;
   `tools/<key>` (registry, `system/rtdb/tools-registry.snapshot.json`,
   `deploy-tools-registry.yml`) gains `for`, `shelf`, `clubData`, `grants`,
   `levels`. The new resolver (successor to `NL.resolveToolLevel` in
   `nl-utils.js`) applies the rule above: pure, tested, one copy. Nothing
   reads it yet. `role` and `defaults` stay for the way back.
   **The staff list is not needed to start (agreed 12/11).** Issue one real
   pass, Richard's (League card + Skeleton key); everyone else stays
   unissued until Richard issues them himself.
3. **Show the passes (board target).** The `nl.tools/pass` page (the design
   above), the new menu under the circle, the "who can open this" panel for
   admins, "view as" on the portal for testers and the Skeleton key, and a
   basic **"issue a pass" form for Skeleton key holders** (card, club, keys,
   job title) so Richard can issue passes before the full people screens of
   step 4 exist. Display only; the old guard still decides. Mismatches are
   logged as findings. For the board, "View as" shows made-up people (e.g.
   League Operations + Media, a club secretary). Richard has **dummy
   accounts** for testing as clubs, club secretaries, club media and League
   staff – use those rather than real people.
4. **People and cards – its own tool, at `nl.tools/people/`** (decided
   12/11). It replaces three of the portal admin area's four tabs: Users,
   Invites and Requests. The Audit log covers every tool, not just people,
   so it stays out (later beside Estate, or a place of its own). Tabs:
   - **People** – everyone, with card, club, keys (with optional end dates)
     and job title. Replaces today's role plus per-tool switches and
     "exceptions". The "issue a pass" form moves here from
     `/pass/?view=issue`; `/pass/` keeps My pass and View as.
   - **Invites** – an invite sets card, keys and job title instead of a
     role. The invite email path (`nlGasSend` and `Invite.js`, with its
     retry-safe token) moves across **unchanged first**; what an invite sets
     changes in a separate step, never in the same one.
   - **Requests** – today's access requests, becoming the one **Pending**
     list (key requests join it at step 7).
   - **Manage** (last tab) – bulk jobs, and the **migration report**: every
     person's old vs new level on every tool. Richard agrees every
     difference before step 6.

   It is a tool like any other: a registry record, sensitive, keys only, on
   the Main shelf, its "who can open this" worked out from its grants.
   Skeleton key holders do everything; League Operations issue Club cards
   and club keys only. The menu's "People and cards" points here. The old
   portal tabs link across to it until they are removed. Built after the
   board meeting.
5. **New locks beside the old.** `scripts/rtdb-level-rule.mjs` generates rules
   from the grants (Firebase rules can't loop over keys, so each grant becomes
   an explicit generated `users/<uid>/keys/<key>` test;
   `tests/rules-follow-portal`). Both resolvers run and disagreements go to
   the audit. Add Manage to the tools above; swap role checks for level
   checks; stop Access users writing. The Access denied page.
6. **Switch League staff.** `auth-guard.js` obeys the new resolver; rules
   published by button. Codes unchanged.
7. **Club logins.** Request form, League Operations approvals, Pending and the
   bell, key requests, Directory approvals, Vacancies inside.
8. **Email clubs.** Month of overlap; monthly club check email starts.
9. **Codes off.** Public forms closed; remove `role`, `defaults`, `audience`
   and the retired documents; update `CLAUDE.md` and `/new-tool`.

Side jobs, any time:
- The login page returns you to the page you were trying to reach
  (`auth-guard.js` line ~520 sends to login with no return path; add
  `?next=`, and the login page accepts only paths starting with a single `/`).
- Replace the text ▸/▾ arrow in the brand stylesheet's Disclosure row (and the
  portal's ▼) with the drawn chevron everywhere.
- Rebuild the 404 page in the portal's own layout.
- Graphics: a way back up one level (breadcrumb) and a landing page whose
  cards preview what each graphic produces.

## Built so far

### Steps 2 and 3 (12/11/2026, PR "Passes: keys as data, the resolver, My pass")

Nobody's access changed. auth-guard still decides from role and defaults.

- **Grants as data.** Every record in `system/rtdb/tools-registry.snapshot.json`
  has a `permissions` object, imported from prototype v40.0 by
  `scripts/permissions-import.mjs` (run it again on a new "Save as a file"
  export; it reports and refuses anything it does not recognise).
- **The resolver** is `NL.pass` in `system/nl-utils.js` (v1.49): `explain`,
  `level`, `summary`, `whoCanOpen`, `build`, `clubColours`. Pure; tested in
  `tests/pass-model.test.mjs`, which also reads the agreed grid back through it
  rule by rule. `NL.resolveToolLevel` is untouched.
- **`/pass/`** – My pass, View as (`?view=as`) and Issue a pass
  (`?view=issue`), drawn from boards 6–10.
- **The menu under the circle** (`nl-topbar.js` v1.7): small pass, My pass,
  Who can open this, People and cards, View as, Audit log (it replaced
  Admin panel when that closed, nl-topbar v1.9), Install as app, Sign out. The "Your tools" list is gone.
- **Findings.** For anyone with a pass, auth-guard (v15.1) logs
  `pass_finding` to the audit log when the pass would give a different level
  from today's rules: once per tool per tab, after the decision is made.

Where the build differs from the words above, and why:

1. **Nested, not spread.** The plan says `tools/<key>` gains `for`, `shelf`,
   `levels`… and `users/<uid>` gains `base`, `club`, `jobTitle`… But the
   registry already has `levels`, `shelf` and `audience`, and users already
   have `club` and `jobTitle`, each with today's meaning, read by auth-guard
   and the portal. Writing the new values over them would have changed access
   on merge. So: `tools/<key>/permissions` and `users/<uid>/pass`. At step 9,
   when the old fields go, these can be flattened or left as they are.
2. **Key ids use a hyphen** (`league-operations`), not the prototype's dot:
   Firebase refuses a dot in a key, and the registry publish would have failed.
3. **The prototype's own words are kept inside `permissions`**: shelf
   `main / sandbox / structural`, club data `none / all / own / bench`, so a
   later export imports on top cleanly. `NL.pass.SHELF` and
   `NL.pass.CLUB_DATA` hold the words on screen ("Structure", "Own club,
   others anonymous"…).
4. **A level is capped at the levels a tool offers.** Ten tools have a Manage
   grant waiting on Manage being added in code (per-tool notes). Until then
   the pass shows Access there, and the "who can open this" panel says
   "Manage once the tool offers it". When step 5 adds Manage to a tool, add
   `manage` to its `permissions.levels` (re-export from the prototype, or edit
   the snapshot) and the pass follows.
5. **Matchday Live** carries `testers: false` ("Sandbox, no testers"); the
   import script adds it, as the grid has no column for it.
6. **Issuing passes: today's superadmin role may issue too**, because nobody
   holds a Skeleton key until the first pass is issued. Remove at step 6.
   League Operations issuing Club cards waits for the people screens (step 4).
7. **View as lives on `/pass/`**, not on the portal home: it shows the same
   answer (which tools, which level, why) without re-rendering the portal as
   someone else. Real people and made-up ones (eight presets for the board,
   plus "build one").
8. **`/pass/` is not a tool.** It has no registry record; auth-guard's
   `OPEN_PAGES` lets any signed-in, approved account in, because "your pass
   hasn't been issued yet" is its answer to someone with nothing.

### Step 4, first part (12/11/2026, PR "People and cards")

- **`/people/`** (`ops-people`), a tool with a registry record: sensitive,
  League Operations Manage by the pass; today auth-guard opens it to
  superadmin and League Admin, the roles that run the portal's admin area.
  Two tabs: **People** (everyone, searchable, filter by pass and card; View
  and Edit pass) and **Manage** (the migration report: per person with a
  pass, every tool where the pass differs from today, which way it moves,
  and a CSV download).
- **Key end dates** in the issue form; the key goes at the start of that day.
- **Who gives out what** is `NL.pass.issueRights`: the Skeleton key
  everything, League Operations Club cards and club keys to club people only.
- `NL.pass.todayLevel` / `compare` set today's answer (a mirror of
  auth-guard's `checkAccess`) against the pass's, tested side by side.

Where it differs from step 4 as planned:

1. **The issue form stays at `/pass/?view=issue`**, reached from People (with
   the person chosen) and leading back to it, rather than being copied into
   `/people/`. The pass drawing lives in one page; copying it would be two
   copies to drift. If the form is wanted inside People itself, promote the
   pass drawing to canon first (`nl-brand.css` + an `NL.pass` renderer).
2. **Invites and Requests moved in** (second part, 12/11/2026). Same writes
   and emails; the Apps Script calls are canon now (`NL.gas`, `NL.uuid`,
   nl-utils v1.51), and `NL.writeAudit` takes the person acted on. Two
   changes on the way: an invite no longer sets per-tool exceptions (it
   sends the role's defaults, as the old form did unless its sliders were
   moved), and Reject and Revoke ask first. The portal's Invites and
   Requests tabs are links here, and `?tab=requests` / the old
   `?tab=inbound` in admin emails land here. The Users pane and the Audit
   log stay in the portal for now.
3. **League Operations can issue only if their role is League Admin** until
   step 6: the database rules let only League Admins and the superadmin
   write `users/<uid>/pass`. Opening that to the League Operations key is a
   generated rule in step 5.
4. **Agreeing each difference** is not recorded yet; the report and its CSV
   are the record for now.
5. **Invites still set a role** (parked 12/11/2026). Until step 6 a role is
   what opens tools, so a new account needs one. The next shape: the invite
   form asks card, club, keys and job title, works out the role from them
   (League card → League Staff, League Operations → League Admin; Club card
   → Club Staff, Club Operations → Club Admin), and the account is created
   with its pass – an Apps Script change (`gas/Invite.js`, shipped by Button
   · Deploy GAS). Not needed while nobody new is being invited; due with club
   logins (step 7).

6. **The admin area closed** (third part, 12/11/2026). The Users pane moved
   in as a person page (`/people/?person=<uid>`, opened from a name or Edit):
   role, club, job title, per-tool exceptions, Restore defaults and Remove
   user, with the portal's writes and audit lines. Exceptions stay until
   step 6 because they still decide access; keys replace them then, and the
   page loses that panel. Each person page shows their last ten audit
   entries. The Audit log was its own tool (`/audit/`, `ops-audit`, Structure
   shelf, same readers as before: superadmin and League Admin) until it became
   the Audit tab of Access; its registry record was removed 13/11/2026; reading an
   entry is canon (`NL.audit`, nl-utils v1.52). The portal keeps the
   welcome-message editor; its old `?tab=` links forward to the new homes,
   so the admin request emails still land on Requests. Two small changes on
   the way: only a superadmin can make someone a superadmin (the portal let
   a League Admin pick it), and a rejected request's account is listed in
   People, marked, so it can be removed.
7. **Skeleton key only, for now** (12/11/2026, after reading the first
   migration report). People and cards and the Audit log lose their League
   Operations grants. The Audit log is Skeleton-only for good (the Structure
   shelf ignored the grant anyway). People and cards gets League Operations
   back at step 7, for club passes only, when there are club logins to
   manage. Agreed from the same report: Michaela, Matthew and League staff
   losing the Sandbox tools (Tester key only) and the Media-key tools is
   intended, and Matthew stays Finance-only.

### Step 6: passes decide (12/11/2026, PR "Passes decide")

- **auth-guard v16.0** lets anyone with an issued pass in by it
  (`NL.pass.explain`), and hands the page the pass's level as
  `session.toolLevel` (Manage is the old `admin`). Anyone without a pass is
  decided as before. Ahead of the pass: the **superadmin role** (always in,
  so a pass mistake cannot lock out the person who fixes it) and the
  **audience gate** (a club role never opens a League tool, until step 7).
  **The way back** is one line in auth-guard: `PASS_DECIDES = false`.
- **The database still reads `users/<uid>/tools`.** `NL.pass.toOld` works
  out the entries that make the old rule give what the pass gives; the
  issue form writes them with the pass, approvals write them with the new
  pass, a person page rewrites them on save, and **Apply passes** (People
  and cards → Manage) writes them for everyone at once. The Manage report is
  now "Waiting to be applied": where those entries still differ.
- The portal's cards follow the pass too (`window.nlPassDecides`).
- Done ahead of step 5 rather than after it: step 5's rules from grants
  are still worth doing (end dates, and no entries to keep in step), but
  with the entries mirrored they are no longer what the switch waits on.
  One gap until then: a key's end date closes the door on the day, but the
  entries stay until the pass is next saved or applied.

### Until club logins: a Club card is held to the club role (12/11/2026)

Found the same evening, signing in as a club dummy: the pass sent a club
account to five League staff consoles (DAZN Viewership, Programme Packs,
Document Library, Financial Benchmarking — "not available" — and the Club
Directory editor, which opened and was then refused by the database). Clubs
reach those tools by code. So `NL.pass.explain` (nl-utils v1.54) holds a
Club card to what the club role always allowed: League-audience tools off,
everything else capped at the club role's default (Club Admin's with Club
Operations, Club Staff's without). The agreed Club-card grants stay in the
registry and apply when step 7 sets `NL.pass.CLUB_LOGINS = true`.

### Step 7, first part: club logins (12/11/2026, PR "Club logins")

Richard: club logins available now, even though nobody is being invited yet.
Built on the boundary the club pages already have rather than a new one:

- **Your pass is your code.** `functions/pass-claims.js` (`passClaims`)
  writes the claims a club's access code gives (`club`, `clubName`, `pClub`,
  `pClubName`) onto a Club card holder's own account whenever their pass is
  written, and clears them for anything else. The club pages and their RTDB
  rules read the claim, so a signed-in club person opens each club page
  without a code, sees only their club, and no rules change.
- `NL.codeGate.resume` asks once for a fresh token when a signed-in account
  has no club claim yet (nl-utils v1.55), so a pass issued after sign-in is
  picked up at once.
- **`clubUrl`** in the registry names a tool's club page (DAZN Viewership,
  Document Library, Financial Benchmarking, Save of the Month, Club
  Directory). A Club card reaches those by its grants, and My pass and the
  portal link a Club card there; tools without a club page stay held to the
  club role.
- **Not yet:** Programme Packs (its club library keeps code sessions apart
  from real accounts by design, so it needs its own route through
  `programmeAuth`); the request form, approvals by League Operations, the
  bell and key requests from the plan's step 7. Save of the Month is on the
  Sandbox shelf, so a Club card does not open it until it launches.

Still to do after this: per-tool exceptions retire once passes decide,
reminders before a key ends, opening a tool as someone else, the Access
denied page, generated rules. The admin request email still says "Review in
admin panel"; its link forwards correctly, and the words change with the
next Apps Script deploy.

### Access: one admin tool, and live grants (12/11/2026, PR "Access")

- **People and cards becomes Access**, at `/access/` (registry key still
  `ops-people`, so no rules or grants move with the name). The Audit log is
  a tab of it. `/people/` and `/audit/` forward, keeping their query.
- **A Tools tab sets who each tool opens to.** Per tool, a level for the
  League card, each League key and, for a tool that is for clubs too, the
  Club card and each club key. Before saving it lists every pass holder
  whose level moves. Saving is **live**: `access-grants/<toolKey>` =
  `{ base, key, updated, updatedBy }`, read by auth-guard, the portal,
  My pass and Who can open this through `NL.pass.withLive`, and it replaces
  the registry's `permissions.grants` where present. No pull request.
  "Reset to standard" deletes the live entry. Saving also rewrites each
  pass holder's `users/<uid>/tools/<key>` (`NL.pass.toOld`), so the
  database reads what the door gives. Each save and reset is in the audit
  log with what changed (`grants_changed`, `grants_reset`).
- **The registry snapshot is no longer the whole truth for grants.** A
  merge that changes a tool's grants in the snapshot is overridden by a
  live entry until that entry is reset. The Tools tab marks a tool
  "Changed here". A nightly copy of `access-grants/` into the repo, for
  history, is still to build.
- **Who does what in Access (Richard, 12/11/2026): granting League access
  stays with the Skeleton key.** The League Operations key opens Access
  (`ops-people` grant `league-operations: access`) and works with club
  people only: club roles, Club cards, club keys, club invites, club
  requests. The Tools, Audit and Manage tabs, League people, League roles
  and League invites are the Skeleton key's. **The page holds this line;
  the database does not yet:** a League Admin role may write any user, as
  the portal always allowed. Rules from grants (step 5) move it into the
  database. `access-grants/` itself is written only by the Skeleton key or
  the superadmin role (rules; emulator test
  `tests/emulator/access-grants-rules.mjs`, not yet run: the emulator
  download is blocked in the build sandbox).
- Later: two-step sign-in (TOTP) for sensitive keys, after step 5, so the
  database can check the second factor alongside the grant.

### Step 5, first part: the database follows the pass (12/11/2026, PR "The database follows the pass")

What the plan's words describe (a generated rule expression per tool,
testing each key in turn) was set aside for something smaller that gets the
same result, because grants now change live and the expression would have to
read them too: about 10 keys × 2 sources × every tool, several hundred
kilobytes of rules against a 256KB limit.

- **The server keeps the per-tool entries.** The database rules already read
  `users/<uid>/tools/<key>`, through the generated `rtdb-level-rule.mjs`
  expressions. Three functions now write those entries from the pass, with
  the door's own resolver (`NL.pass.toOld`, loaded from `system/nl-utils.js`
  by `functions/canon.js`; the deploy copies the file in):
  `passEntries` when a pass is written, `grantEntries` when a tool's live
  grants change, and `keyEndings` each night at 03:20 for keys that ended
  (with a "Key ended" audit line). The pages still write the same entries;
  the functions write only where they disagree. A grant changed in the
  registry snapshot still reaches people through Apply passes, because a
  merge is not a moment anyone reviewed whose access it moves.
- **Who may write people is in the database now** (`users` rules). The
  Skeleton key or the superadmin role: anyone. A League Admin holding a
  current League Operations key: club people only (club roles, Club cards,
  never themselves, never a League role or card, never a Skeleton key).
  Anyone else: nothing. A League Admin role with no Operations key loses
  the write it had. Proved against the emulator by
  `tests/emulator/users-rules.mjs`, run on every rules PR by
  `.github/workflows/test-rules.yml`.
- **Still to do in step 5:** per-tool rules that read levels rather than
  roles where tools still hand-write role checks; Manage on the tools that
  have none; stop Access users writing where a tool lets them.

## Safety rails

- Report before switch; run both and compare; a way back at every step.
- Every launch checked as a non-Skeleton-key person (the Skeleton key hides
  broken tools from the one person testing).
- Rules ship by button, never on merge.

## Still open

1. **Clubs managing their own staff:** later, once logins have bedded in.
2. **Rebuilding tools under `nl.tools/portal/`** for the new model:
   considering, not decided (29/10/2026).
3. **The new pass front:** one lanyard for all, red header for League, navy
   for Club, a third colour for External, a big sticker (crest or logo) with
   zones stacked beneath (13/11). The League layout and the External colour
   are settled when it is sketched, alongside turning the pass over.

Settled since: External passes (13/11, above); "zones" is the word on screen
for keys (13/11, see the Roadmap).