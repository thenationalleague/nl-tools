# Declutter: the consolidation

Agreed with Richard on 28/11/2026. This is the working document for the
consolidation: read it before starting work on any tool. It replaces
`system/brand-audit.md` as the place to work from; the audit stays as the
measured detail behind it. When Estate can show the whole cleanup list, this
file retires too (see "The end").

## The aim

Every tool is built from one kit of parts and one of a few page shapes. A tool
has almost no styling of its own. If the kit lacks something, it goes into the
kit first. One list shows what is off, and when it is empty, we are done.

Rules ask a session to behave; a kit makes misbehaving hard. Prefer the kit.

## The freeze

**From 28/11/2026, no new tools are built until the consolidation is done.**

- If an idea for a new tool comes up, write it into `system/ROADMAP.md` under
  "Later" (a headline, What, Why) and stop. Do not scaffold it, mock it up or
  start it "just to see".
- Tools marked **Hold** below are paused, not in development. They stay on
  the shelf untouched. When one is picked up again it is built on the new kit.
- **Graphics are outside the freeze.** They produce images, are a separate
  family, and do not use the page shapes.
- Fixes to a live tool are fine. So is the consolidation work itself.
- The freeze lifts when every Keep tool below has been through its rebuild.

## How the work runs

Tool by tool, not one switch-over. One tool, one session, one pull request
through to live, before the next tool starts.

For each tool:

1. **Interview.** Richard describes the tool in plain English against the
   seven questions below. The session turns that into a short brief in this
   file and flags where it disagrees with the registry.
2. **Rebuild in staging** (`system/staging.md`), onto the kit and the tool's
   page shape. Clear its canon overrides and its duplicated local styling in
   the same pass, and any note in the code that names a plan document
   that no longer exists. A missing part goes into the canon first.
3. **Richard looks at it** on the two desktop screens and a phone, against a
   short smoke test: a written list of what passing means, in plain words,
   that anyone could run in a browser. The list is written before the rebuild
   starts and goes in the pull request ("What passing means"). The same list
   is run once more on the live tool after it is promoted.
4. **Promote** over the live tool, delete the staging copy, and remove the
   tool's old forwarding addresses. Tick it off here: its row in "Every tool"
   gains "Rebuilt" and the date.

The seven questions:

1. What is it for?
2. Who uses it?
3. Who can change things?
4. Does anything need sign-off?
5. Is there a public view?
6. Is it club by club?
7. Does it have a widget on the website, and what keeps that up to date?

**Page shapes are not decided yet.** They come out of the interviews, with the
tools open on a screen, not from the tools' names. Do not assign a tool to a
shape that is not written down here. So far there is one: club list and detail
(below). A tool whose centre is something bespoke (a map, a newsletter, an
image) uses the kit for the controls around it and keeps the bespoke part.

**No new machinery until two tools are rebuilt.** No new inventory file, no new
checks, no new plan documents. Keep the checks that exist. If something still
drifts after two rebuilds, add a guard for that one thing.

## Order

1. **Club Directory** (brief below). It proves every stage once.
2. Then worst first by `system/brand-audit.md` Part 3, Keep tools only.
   Attendance and Fixture Management are the two Richard has named as visibly
   off.

## Every tool

Decided in one pass on 28/11/2026. Four answers: **Keep** (in the suite, gets
the rebuild), **Hold** (paused on the shelf), **Single-use** (a one-off: out of
the suite, exempt from the rebuild, it only has to keep working), **Retire**.

| Tool | Answer | Note |
|---|---|---|
| Attendance | Keep | Does not match the other benchmarking tools; unwieldy on the page |
| Club Directory | Keep | First rebuild |
| Club Kits | Keep | Began as single-use and outgrew it; needs a restyle |
| Commercial Benchmarking | Keep | |
| Content Plan | Keep | Nothing else looks like it, so it probably needs a page shape of its own: a planning board. The ideas not yet built are in `system/content-plan-plan.md`, which becomes its brief |
| DAZN Viewership | Keep | |
| Document Library | Keep | |
| Financial Benchmarking | Keep | |
| Fixture Management | Keep | Counts as built; what it does is right, the look needs a serious pass. The reasoning behind its rules is in `system/fixture-management-plan.md`, kept until this rebuild |
| Handbook | Keep | |
| Judgements | Keep | Has a website widget |
| Local Media | Keep | Reshape as a media directory on the club list and detail shape: a club's local media contacts, with the national contacts as the first entry. Still two pages (a public form and a console) |
| Newsletter | Keep | The newsletter itself is bespoke; the controls around it come from the kit |
| Programme Packs | Keep | Club list and detail |
| Travel Planner | Keep | The map is the tool; kit for the controls around it |
| Vacancies | Keep | Has a website widget |
| Website Archive | Keep | |
| Wellbeing Hub | Keep | |
| Trident Wellbeing | Keep | A separate brand on purpose. Its colours become a small named set of their own at its rebuild |
| Portal, Access, My pass | Keep (plumbing) | |
| Estate | Keep (plumbing) | To become the single cleanup view; needs its own diet |
| Style Guide | Keep (plumbing) | |
| Usage (was Data) | Keep (plumbing) | Renamed 28/11/2026; needs a visual pass |
| NLS Monitor | Keep (plumbing) | Needs a strong pass |
| Roadmap | Keep (plumbing) | Good idea, hard to read; needs a pass |
| Brand Exposure | Hold | |
| Commercial Compliance | Hold | |
| Fan Widgets | Hold | Wrong shape: should become one Widgets home for everything that ends up on the website |
| Matchday Live | Hold | |
| Save of the Month | Hold | |
| Social Output | Hold | |
| Transcribe | Hold | |
| Broadcast Selections | Single-use | |
| Buzz | Single-use | |
| Responsibilities | Single-use | |
| UW Promo | Single-use | Complex, but a one-off |
| Wellbeing Map | Retired 28/11/2026 | Replaced by the Wellbeing Hub (`system/retired/wellbeing-map.md`) |
| `/wellbeing/` | Retire, not yet | A forwarding page only, but a public one: it is on printed sheets, in club emails and on the website, and the person following it is looking for help. It goes when Google Analytics shows nobody arrives by it (visits to the Hub with `src=old-wellbeing`) |

Plumbing tools are kept by default but still go through the rebuild.
Single-use tools are to move under the temp address planned for one-offs.

## Decided

- **Tool by tool**, not one agreed date for everything. This overrides
  "The moment" in `brand-audit.md`.
- **Trident Wellbeing is a separate brand on purpose.** This settles decision
  1 in `brand-audit.md`. At its rebuild its colours become a small named set
  of their own in the kit. The checks then recognise them and stop reporting
  them as a fault. The set is unlikely to be needed anywhere else.
- **Do not brand a tool that is not ready to be built.** A Hold tool arrives
  on the kit when it is picked up; it gets no separate branding pass now.
- **Forwarding pages are not wanted** (28/11/2026): people reach tools through
  the portal, not bookmarks. A removed page leaves none (`CLAUDE.md`,
  "Retiring something"). Ten that only signed-in staff ever used were
  removed on 28/11/2026: `/people/`, `/audit/`, `/club-codes/`, and the
  `/admin/` pages of Club Kits, DAZN Viewership, Document Library, Financial
  Benchmarking, Fixture Management, Programme Packs and Save of the Month.
  Club Directory's two staff ones wait for its rebuild, because a live tool
  cannot change while its staging copy is open. The addresses given to clubs
  or the public go tool by tool: removing them is part of each tool's
  sign-off (step 4). The rename of Data to Usage left none.
- **A page uses the width it has.** Empty space down the sides needs a
  reason. Every rebuild is looked at on the two desktop screens and a phone;
  there is no separate check for very wide screens. This replaces the parked
  type and scale plan, deleted 28/11/2026.
- **Version numbers have three parts: big, medium, small** (28/11/2026).
  - **Big** is which build of the tool it is. 1 is the tool as first built.
    2 is the tool rebuilt on the kit.
  - **Medium** is a change people would notice.
  - **Small** is a fix: a typo, a wording change, a correction.

  A rebuilt tool starts at **v2.0.0**, whatever its old number was. A tool
  whose number does not start with 2 has not been through, so the number is
  the mark of a rebuilt tool, beside its dated tick in "Every tool". Tools
  keep their present numbers until their rebuild.
- **The size of a change decides its route.** A big or a medium change goes
  through staging and is looked at before it goes live. A small change goes
  straight to the live tool by pull request. This is what `system/staging.md`
  already says; the version number now shows which route a change took.
- **On a phone, a button may show its picture alone** (28/11/2026). Only for
  the standard pictures, never for a page's main action, and never for
  anything that cannot be undone. The word stays for screen readers. This
  adopts canon change C13 in `brand-audit.md`.
- **Staging never saves, and has no data of its own** (28/11/2026). A
  staging copy reads live data and is for checking layout, wording and how a
  page behaves. There is no second set of data kept for staging. This settles
  the question left open on 28/11/2026. Wanted later: a way to try the steps
  of a change in staging, where the page behaves as if it saved and nothing
  is written ("Pretend saves in staging" on the Roadmap).
- **Broadcast Selections keeps its data in the page.** It is a single-use
  tool, so decision 2 in `brand-audit.md` is closed.
- **One plan.** This file is the plan. The thirteen older plan documents in
  `system/` were deleted on 28/11/2026. The decisions in them that still
  stand were first moved into `permissions-plan.md`, `CLAUDE.md`,
  `ROADMAP.md` or this file.
  No new plan documents are written: a tool's decisions go in its brief here.
- **One address per tool** is the rule (`CLAUDE.md`). Three tools still have
  two pages: Local Media (a public form and a console), Commercial Compliance
  (Hold) and UW Promo (Single-use).
- **Estate is a lens.** It reads from elsewhere and holds nothing of its own.
  Who a tool is for and which passes open it are already in the registry
  (`tools-registry.snapshot.json`, `permissions`); Estate should show that in
  full, not keep a copy. Who holds each pass is live data and never goes into
  a generated file in this repo.
- **The Data tool is called Usage**, at `/usage/`. Usage stays one central
  page reading the counters; tools do not grow usage pages of their own.

## Open, for Richard

1. **The page shapes**, as they come out of the interviews.
2. **Fewer words on buttons everywhere, not only on a phone.** Richard's
   question (28/11/2026): where a picture is known to everyone, such as
   download, does the button need the word at all, on any screen? It could
   differ from tool to tool. Proposed: a short fixed list of pictures that
   may stand alone (download, print, search, refresh, close), and the word
   stays on anything particular to the tool (Publish, Approve, Reset code),
   on a page's main action, and on anything that cannot be undone. Settle it
   with Club Directory on screen, since it changes the kit for every tool.
3. **Website widgets.** The audit did not cover them and nothing checks them.
   Which tools have one, and how each is kept up to date, is asked per tool
   (question 7).

## Brief: Club Directory

From the interview on 28/11/2026.

- **For:** the details of each club, mainly the people at it. It replaces the
  printed directory.
- **Who uses it:** very widely open. League staff and people at clubs.
- **Who can change things:** people at a club update their own club's entry.
  League managers can change any.
- **Sign-off:** a change made by a club does not show until a League manager
  approves it. Until then the old detail stands. The approver is there to
  judge what a machine cannot (is this the right person?), so the form itself
  checks what a machine can: the number of digits in a phone number, the shape
  of an email address.
- **Manage means two things here**, and that needs writing down as the rule:
  for a club it is "propose a change to my club", for the League it is
  "approve it". The registry gives Manage to operations keys on both sides.
- **Private details:** some details are held for the League only and are
  never published or shown to clubs.
- **Public version:** yes. All clubs in one read-only view, for anyone outside
  who has no access. It shows everything not marked private. It is reached by
  a link that is handed out and is not listed for search engines; treat it as
  public but unadvertised. People gave their details knowing the directory is
  public, with the choice to keep them out of the public view. No new fields
  are planned.
  - Build note: the public page shows a fixed list of fields, so a field added
    later stays private until someone chooses to publish it.
- **Club by club:** yes.
- **Website widget:** none, and it should not have one.
- **Shape: club list and detail.** The clubs down the side, the chosen club
  beside them. The list of clubs appears only for someone with more than one
  club in scope; a club user sees their own club's page with no list. Two
  extras on this tool: an approval queue for League managers, and the
  read-only public view.
- **Already in place:** the club browser in the canon (`NL.clubPicker` mode
  `list`, `.nl-browse`), and a staging copy at `staging/club-directory/`.
  Start from those; check what the staging copy already does before building.

## The end

When every Keep tool has been through its rebuild:

1. Switch the lint and override checks to failing, with empty backlogs.
2. Give Estate the whole cleanup list (overrides, the audit's counts, how much
   styling each tool carries of its own) so it is the one view. Not before two
   tools are rebuilt.
3. Remove the scaffolding: the override backlog, the waiver and skip lists,
   `brand-audit.md`, the two tool plans kept as briefs (Fixture Management,
   Content Plan) if their rebuilds have not already taken them, the long
   version histories in page headers, and this file.
