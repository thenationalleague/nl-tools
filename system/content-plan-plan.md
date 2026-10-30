# Content Plan — improvement plan (not built)

Drafted 30/10/2026 from Richard's "Content Plan – improvement ideas" note of the
same date, then checked against `content-plan/index.html` v3.6. Where the note
and the code disagreed, the code wins and the correction is recorded under
**What the code already does** so a build session does not plan work that
exists, or miss residue that the note assumed was gone.

Toolkey `media-content-plan`. Data under `app-data/media-content-plan/`.

## The idea in one paragraph

Each item tries to answer several questions with one field, and each tile shows
too much at once. Split the questions apart in the data, show less on the tile,
and the tool becomes usable by someone less confident with tech.

## What the code already does (corrections to the note)

| Note says | Code says (v3.6) | Consequence |
|---|---|---|
| Statuses are Due / Published | True — `STATUSES` is `planned` (labelled "Due") and `published`. But `'dropped'` is still handled in four places (chip, row, tick, list), with its own styling. | Dropped is **residue**, not a status. The status step reads any live `status: 'dropped'` item as Draft (so nothing disappears and nobody has to hunt for them), then removes the four branches. |
| Add series (linked items) | One link already exists: `item.linkedItemId`, a single pointer, shown as a link icon and "Linked to" in the item window. | Series **extends** this; it is not new. Existing links migrate to two-item series. |
| Multiple authors already work | True — `author`, `authorOther`, `coAuthors`. | Tiles only change how they are shown. |
| Social graphics come out grey | True — v1.1 gave category-less social items their own slate group (`--cp-social`). | Fix is "every item has a main topic", which means making category required, with a default. |
| Drop the Ideas tab | It is a live tab with its own data node, `ideas/{id}`, and rules. | Remove the tab, the node and its rules in one PR. Richard checked the live ideas 30/10/2026: nothing to keep. |
| Permissions: Media and Broadcast get Manage | There are no department-based defaults. Registry defaults are `staff: access`, `admin: access`; Manage is a per-person grant. Rules already split read (`access`) from write (`admin`). | **No change needed.** The model already fits; Media and Broadcast staff just need per-person Manage grants in the portal. |
| Three-dot menu: build it in Content Plan only, promote if a second tool needs it | `programme/` already has a three-dot button **and** right-click opening the same menu, hand-rolled. `wellbeing-map/` has a right-click menu too. | Content Plan would be the second/third copy. By the promotion rule this is a **canon candidate now**: build it as an `NL.*` helper + `nl-brand.css` component and move Programme Packs onto it, rather than writing a third private copy. |
| Website matching: "a published log already exists" | It does: `data/articles-index.json` in Firebase Storage, rebuilt daily by `rebuild-index.yml`, read by `website-archive/`. | Later phase can match against it directly. |
| Commercial needs a flag | Nothing commercial exists in code, and Richard confirmed 30/10/2026 there is no live Commercial category. | Flag only. Nothing to migrate. |

### What a tile shows today

In the month view (the busy one): kind glyph, title, club shield, link icon,
author initials, published tick — six things, before the category fill. The
week view adds the time. Platform logos appear only in the default (day panel)
form. The note's "four things" target means removing the kind glyph, shield,
link icon and logos from the tile, and turning the tick into the status button.

## Data model

Four questions per item, plus flags.

| Field | Options | Rule |
|---|---|---|
| `home` — where it lives first | `website`, `social`, `email`, `press` | Press release is new. |
| `format` — what it is | `article`, `video`, `graphic` | Only formats that fit the home are offered (website/press → article; social → video or graphic; email → none). |
| `platforms` — where it's shared | Website, X, Facebook, Instagram, TikTok, LinkedIn, YouTube | Already exists. Limited by home: a social-first item never offers Website. |
| `competitions` — which competition(s) | National, North, South, NL Cup, FA Cup, FA Trophy | Optional, any number. See **Categories**. |
| `topics` — what it's about | Config topics | At least one, any number; the first is the main one. See **Categories**. |

Flags, on any item: `clubObligation` (exists) and `commercial` (new, flag
only — decided 30/10/2026; there is no live Commercial category to migrate).

Planned-versus-reactive is **not** a field. The website backfill answers it.

### Mapping today's records

Stored today as `lane` + `format` (see the header of `content-plan/index.html`).

| Today | Becomes |
|---|---|
| `lane: web` | home `website`, format `article` |
| `lane: club` (pre-flag) | home `website`, format `article`, `clubObligation: true` |
| `lane: social`, `format: vid` | home `social`, format `video` |
| `lane: social`, `format: gfx` / `ad` / `otd` | home `social`, format `graphic` — keep `ad`/`otd` as a sub-detail field so the sheet's detail survives, as it does now |
| `lane: social`, no format | home `social`, format unset — shown as "video or graphic?", as now |
| `lane: crm` | home `email` |

Read old and new shapes side by side for one release (the code already does
this for `lane: club`), so nothing breaks before a one-off migration writes
the new fields. The week/month lanes stay driven by home.

## Status

| Status | Meaning | Tile |
|---|---|---|
| Draft | Planned, not done or scheduled | Normal |
| Scheduled | Really scheduled for a set time | Normal + clock |
| Published | Gone out | Faint diagonal cross-hatch, slightly faded, title readable, tick |

- `planned` maps to Draft. `published` stays. Dropped — see above.
- The status control on the tile becomes a button that steps Draft → Scheduled
  → Published.
- **Overdue** is worked out, never stored: Draft after its date, or Scheduled
  with no time.
- **Auto-flip** (Scheduled with a time that has passed → Published). Risk: there
  is no server job, and most viewers have Access only, so they cannot write.
  Show it as Published as soon as the time passes (worked out on screen), and
  write the change the next time someone with Manage loads the page. Do not
  add a Cloud Function for this alone.
- **Shares**: each platform tick is planned or shared. Published with shares
  outstanding shows a small "shares pending" marker.
- **Live link** field. Pasting a link on a website item marks it Published.
  Optional on social items.

## Tiles and layout

A tile shows four things: title, topic colour, status, who's doing it.
Everything else moves inside the item window.

- **People** — initials in small circles, overlapping for several people.
  Check the topbar avatar ladder (`.topbar__avatar--staff-N` in
  `nl-brand.css`) before styling these; a small avatar stack is a plausible
  canon component.
- **Club / Commercial** — small text tags, replacing the shield.
- **Colour** — every tile takes its topic colour (needs category required).
- **Lanes** — a clear header on the Web and Social lanes; email as a slim third
  lane.
- **Three-dot menu** — Duplicate first. Visible on hover on desktop, always on
  phones; right-click opens the same menu. Built as canon (see corrections).
- **Day notes** — pencil only on hover and smaller than the plus; a day with a
  note shows it as a strip across the top of the day. Covers key dates (cup
  draws, awards).
- **Add item button** — removed on desktop (the per-day plus does the job);
  kept on phones, where it asks for a date.
- **Quick add** — title, date, web or social. The rest under "More details".
- **Today view** (optional) — what's due today and still in Draft for the
  signed-in person.

Check every tile change at both screen sizes (`node scripts/screens.mjs`).

## Series, linked items, tasks

- A **series** links separate pieces of work (different people or statuses).
  Example: Player and Manager of the Month — shortlist, nominations deadline,
  contact winners, press release, announcement. Opening any part shows the set.
- Not for a story and its shares: those stay one item with share ticks.
- A series of two replaces today's `linkedItemId`.
- **Tasks** — prep work and deadlines, drawn as a plain line: no fill, smaller
  text, small coloured dot. A filter hides them.
- **Repeating bundles** — later.

## Categories (rethink, 30/10/2026)

Richard, after checking live Settings: categories need rethinking. An item can
be North **and** South **and** NL Cup; the list has unused entries and is
missing some; and it needs better control. Picking two or more must be easy.

The cause is that one list answers two questions. "National", "North", "FA
Cup" say **which competition**; "Awards", "Statements", "Trust" say **what
it's about**. A North awards story has to give up one of them. So, two fields,
both multi-select:

- **Competition** — a fixed set, not config: National, North, South, NL Cup
  from `assets/data/competitions-meta.json` (the schema every other tool
  reads), plus FA Cup and FA Trophy, which that schema does not hold (they are
  not NL competitions; keep them tool-local unless a second tool needs them).
  Colours: `--div-national`, `--div-north`, `--div-south` exist in canon. NL
  Cup, FA Cup and FA Trophy have no tokens (today's categories use `--purple`,
  `--primary`, `--navy-300`). A `--div-nlcup` belongs in canon, because the
  match pills want it too. The two FA cups stay tool-local. Optional: plenty
  of content is about no competition.
- **Topic** — the editable list in Settings, minus the competition entries.
  At least one; the first picked is the main topic.

**Picking several** — one control per field: a row of toggle chips for
competition (a closed set of six, so chips are allowed), and a searchable
picker for topic (an open set, so not chips). Selected topics show as removable
chips, the main one first; drag or "make main" changes which leads. No
separate "main" and "extras" fields — that is two controls for one decision.

**Tile colour** — topic colour for the fill (the main topic). Competition shows
as a thin edge strip, split into segments when there are several, so "North
and South" reads at a glance without a second fill. Replaces today's football
categories doing double duty as colours.

**Better control** (Settings → Topics):
- Usage count beside each topic, so unused ones are obvious.
- **Archive** instead of delete: hidden from the picker, kept on old items.
- **Merge**: pick two, every item moves to one, the other is archived. Moves
  the topic wherever it appears in an item's list, not only the main one.
- Rename and reorder (reorder exists).

**Migration** — today's competition-named categories (`national`, `north`,
`south`, `nlcup`, `facup`, `fatrophy`) become competitions, with no topic set.
Those items are flagged "needs a topic" rather than being given a guess.
`football` becomes the topic "Match" (name to confirm). Every other category
becomes a topic.

## Housekeeping

- Remove the Ideas tab, the `ideas/` node and its rules. Checked 30/10/2026:
  nothing in it worth keeping.

## Build order

Tiles first (decided 30/10/2026): a visible quick win with no migration risk,
and it tests whether the calmer tile is easier before the bigger change.

1. **Tiles** — four-thing tile, initials circles, Club tag, day-note strip,
   lane headers, Add item button change. Make a topic required with a default
   so no tile is grey. No data shape change.
2. **Three-dot menu + Duplicate** — promoted to canon; Programme Packs moved
   onto it in the same PR.
3. **Status** — Draft / Scheduled / Published, overdue, live link, share
   states; clear the dropped residue.
4. **Data model** — home / format / shares split, Commercial flag,
   competition + topic split, migration of existing records, press release
   home.
5. **Topic controls** — usage counts, archive, merge; remove Ideas.
6. **Series and tasks** — replacing `linkedItemId`.
7. **Later** — website matching against `articles-index.json`, backfill,
   then social via the Social Output tool.

Each step is its own PR. Steps 3 and 4 touch stored data and need the rules in
`system/rtdb/rules.snapshot.json` checked (rules deploy is a button press).

## Parked or dropped

| Idea | Decision | Why |
|---|---|---|
| Ideas tab | Dropped | Not used |
| Approval workflows | Dropped | Overkill for a team this size |
| Routine / reactive / original field | Parked | Two questions; backfill answers planned vs reactive |
| Monthly report | Parked | Easy to generate later |
| Read-only share link | Parked | Internal viewing is covered by Access |
| Required links on social posts | Dropped | Too much upkeep |
| Logging every reactive social post | Dropped | The plan is for planned content |
| Templates | Replaced | Duplicate covers routine items |

## Open questions

- [ ] Which topics are missing, and which live ones are unused (the usage
      counts in step 5 will show the second).
- [ ] What to call today's "Football" topic once competitions are separate
      ("Match"?).
- [ ] Competition and topic split: Claude's proposal, not yet agreed.
- [ ] Task dot colour, and whether deadline and action tasks differ.
- [ ] What default topic a new social item gets once a topic is required.

Answered 30/10/2026: no live ideas worth keeping; no live Commercial category,
and Commercial is a flag only. Live `status: 'dropped'` items need no check:
the status step reads any it finds as Draft.
