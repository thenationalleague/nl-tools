# The reference manager

**Status: specced, not built.** The shape is decided; the open question at the
foot changes how much of it is worth building.

## What a reference is

An image of a sponsor's mark. The scan searches every sampled frame for every
reference it has been given, and what it finds becomes the measurement. Nothing
is detected that was not looked for.

The folder tree **is** the configuration:

```
refs/partners/<Sponsor>/*      searched at EVERY ground
refs/clubs/<Club>/<Sponsor>/*  searched only when that club is at home
```

The folder name is the name printed in every report, so it is taken verbatim —
`TIC Health` stays `TIC Health`, never slugged. A typo in a folder name is a
sponsor that silently never appears.

A sponsor may have as many images as you like; they all roll up under the one
name. That is how one brand with a different board design at each ground is
handled — one crop per ground, one name in the report. It is also how one brand
with several designs at the SAME ground is handled: every image is searched
independently, everything any of them finds rolls up under the folder name, and
duplicate hits on the same physical board are deduped to the strongest. Do not
split designs into folders (`Enterprise green`, `Enterprise white`) — the
folder name is the report name, so that splits one sponsor's seconds across two
lines.

**A logo lockup is not a board.** The first cloud-measured match (29/08/2026)
was scanned against the league partners' clean logo files and visibly
under-detected — boards plainly on screen, no boxes. The scan finds what it has
been shown a picture of, and what a camera sees is the whole board as designed:
Enterprise's green-and-white, DAZN's board with everything around the mark. The
reference that works is a crop of the full board, from footage or from the
artwork the boards were printed from; a logo on a white card is a fallback that
finds close-ups and misses the rest. Crops need the board a few hundred pixels
wide and sharp — from close-up shots, not wide ones.

**Per-design attribution is not recorded.** A hit carries the sponsor, never
which image found it, so "which creative got seen most" cannot be answered
after the fact. If creative-level reporting is ever sold, stamping each hit
with the matching reference's filename is a small engine change — flagged here
rather than built, because nothing yet asks the question.

## Where they live now

| | |
|---|---|
| Local runs | `refs/` beside the script, gitignored |
| Cloud runs | Firebase Storage, `brand-exposure/refs/` |
| League partners | seeded from `assets/partners/` by an Action |
| Club boards | **nowhere yet** — they exist only on whichever laptop scanned that ground |

That last row is the gap. Sutton's own boards — Telsa Media, E-Signs, GSSSG,
Skyline Roofing, genie cloud — were used in a local scan on 27/08/2026 and have
never left that machine. They are not in the repo and must not be: this
repository is public and that is somebody else's artwork.

## What the tool needs

1. **Browse** the tree — league partners, then a set per club.
2. **Add** an image to a sponsor, **replace** one, **remove** one.
3. **Create** a sponsor by naming it, since the folder name is the report name
   and typing it once beats typing it into a folder dialog.
4. **Choose what to scan**, per run.

Nothing here needs a new storage model. It is a folder browser over a prefix
that already exists, with an upload button.

## Choosing what to scan, and the trap in it

Scan time is **linear in reference count** — ten references cost roughly twice
what five do. So letting someone scan league partners only, or one club's set
only, is a real lever on the bill rather than a tidiness feature.

Two things it must not do:

**It must not let a partial scan claim to be complete.** Today
`referenceSetComplete` is a human answer typed on upload, and people will get it
wrong — they are being asked whether a reference set they cannot see covered
every board at a ground they may not have been to. Once the tool knows the full
set for a ground, the answer stops being a judgement:

- scanned everything on file for that ground → complete
- anything deselected → partial

**It must not silently change what a later match measured.** Two matches scanned
against different reference sets are not comparable, in the same way two matches
measured on different engine settings are not. The data is already there — every
match record carries the exact list of references used, not just a count — but
nothing surfaces it. The comparison views should refuse to average across
different sets as loudly as they already refuse to average across engine
profiles.

## The open question: is share of voice worth serving?

Everything above about completeness exists to serve one number, and that number
may not be one anybody wants.

Share of voice is a media-agency metric. It works when you are buying against
competitors in fixed inventory — television breaks, poster sites. At a National
League ground with twenty-odd boards, *"you had 12% of total board seconds"* is
not something a local firm paying for one board can act on.

What a sponsor can act on:

- **Seconds on screen** — concrete, comparable season to season
- **Exposure index** — those seconds weighted by how clearly the board was seen
- **The same board across grounds** — *"yours got three times at Sutton what it
  got at Barnet"*, which changes where they buy next
- **This match against a normal one** — what a televised fixture was worth
- **Whether they got what they paid for**

**None of those need a complete reference set.** Completeness is only required to
compute a *share*, because only a share has a denominator. Scan four sponsors or
forty and the seconds are the seconds.

So if share of voice goes, the hardest problem in this system goes with it: no
completeness flag, no judgement call on upload, no toggle that quietly changes a
denominator, and no reason to insist a ground's reference set is exhaustive
before a scan is worth running.

**Not a decision to take from the code.** It is a commercial question about what
partners are actually sold and what they ask for at renewal. Raised here
28/08/2026 by the person who has those conversations, and left open.

If the answer is "nobody asks for share of voice", the reference manager gets
smaller: browse, add, remove, and choose what to scan for cost — with no
completeness machinery at all.
