# Fixtures split – plan (parked, to be done)

**Status:** parked 13/11/2026, with a firm intention to do it. It comes after
the brand sweep and the current batch of pull requests. It is a big job: it
changes tools that are live, creates new ones and repurposes others.

Read alongside `system/fixture-management-plan.md`, which settled the record
itself (what a fixture is, the finder rules, Broadcast and AMI), and
`system/permissions-plan.md`, which settled the pass.

## The principle

**Fixture Management is the record and nothing else.** It holds the true state
of every game: which games exist, their date and kick-off, the dates they lost,
results, and corrections (Amend, Remove, Restore). Every other fixture job is
done in its own tool, which reads the record and writes only its own part.

Three rules follow:

1. **One record, one key.** Every game is known everywhere by its fixture ID.
   No tool makes its own copy of the fixture list or its own ID.
2. **A tool writes only what it owns.** Broadcast keeps its picks, Attendance
   keeps its crowds, each filed under the fixture ID in its own place.
3. **A change to the record goes through one set of rules.** When any tool
   changes a game's date or kick-off, it uses the same shared fixture rules,
   with the same reasons list and the same entry in the game's history. A move
   made in Rearrangements looks exactly like a Move made in Fixture Management.

## What changes

| Today | After |
|---|---|
| Fixture Management has four tabs: Fixtures, Rearrangements, Broadcast, Manage | Fixture Management keeps Fixtures and Manage: the record and its corrections |
| Rearrangements (the date finder) is a tab | Its own tool. On confirm it records a Move through the shared rules |
| Broadcast is a tab | Its own tool. Picks live in its own place by fixture ID; a pick that shifts a kick-off records a Move with a broadcast reason |
| Attendance reads the record's public copy; crowds are filed by fixture ID | No change: it already works this way |
| The date and move logic lives in `fixtures/_core.js`, inside one tool | Promoted to the shared system files, so no tool loads another tool's files |
| Each tab draws its own list of games | One shared fixture list component, used by all four |

The public Broadcast Selections page (`/broadcast-selections/`, "Broadcast
Travel") is a separate thing and is not part of this split. Whether it should
read the new Broadcast tool's picks is one of the questions below.

## Access – to be rethought, not carried over

Splitting the tools is what makes per-job access possible. Each tool gets its
own grants, so the pass can give someone Manage on Broadcast without letting
them remove a game or amend a result. That needs deciding tool by tool, not
copying today's grants:

- **Fixture Management:** who may correct the record (Manage) and who only
  reads it (Access).
- **Rearrangements, Broadcast:** who works each one.
- **Clubs.** Should a club see the record, or only its own games? Should a club
  see rearrangement options for its own games, or broadcast picks before they
  are public? Today the record's public copy is readable by anyone signed in.
- **The database rules** must match: a tool that may move a game may write that
  game's date, kick-off and move history and nothing else. The rules can be set
  per field, so this is possible, but it must be tested the way the Manage batch
  rules were (`tests/emulator/`). Without it, a Rearrangements user effectively
  holds Manage on the whole record.

## The work, in order

1. **Promote the shared fixture rules** (`_core.js`'s date, move and lost-date
   functions, and the move reasons) into the shared system files, with tests.
   Nothing on screen changes. This is the bulk of the real work.
2. **Build the shared fixture list component**, and move Fixture Management's
   own list onto it.
3. **Decide access** for each tool (the questions above), then write the rules
   and test them.
4. **Broadcast as its own tool**: new tool key, registry record, rules, and its
   picks moved from the record to its own place (a one-off button, report first).
5. **Rearrangements as its own tool**, last, because it works today. The tab
   leaves Fixture Management and its address forwards.
6. **Retire the tabs** and write up what moved where.

Each step is its own pull request with a way back.

## Risks

- **More than one tool writing to the record.** Covered by field-level rules
  and the shared rules: no tool writes the record by hand.
- **Drift between four lists of games.** Covered by the shared list component;
  do not start step 4 before step 2.
- **Live tools change under people.** Fixture Management and Rearrangements are
  in use. Steps 4 and 5 need a quiet week and a note to whoever uses them.

## Open questions

1. Can clubs see the record, their own games only, or nothing?
2. Do broadcast picks move out of the fixture record, or stay as fields on it
   that only the Broadcast tool may write?
3. Should the public Broadcast Selections page read the Broadcast tool's picks?
4. Does Rearrangements need Access only (suggest dates) and Manage (confirm a
   move), or is it one level?
