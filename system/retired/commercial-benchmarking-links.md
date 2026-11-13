# Commercial Benchmarking links – retired 13/11/2026

Not a tool: Commercial Benchmarking's private club links. The tool itself is
live. Last version in git with them: commit `ec2c173`
(`git checkout ec2c173 -- commercial-benchmarking/link.html`).

## What went

- `commercial-benchmarking/link.html?t=<token>`: a page with no sign-in that
  showed one club its dashboard, found by a token in the address.
  `&mode=verify` (the "Proof" link) showed the club's own figures to check
  and confirm instead.
- `app-data/ops-commercial-benchmarking/links/<token>`: a copy of each
  club's row, readable by anyone who had the token, with the club's
  confirmation (`confirm`) written back to it.
- The staff page's **Links** panel (generate, open, download as Excel) and
  "Open club link", and the token and links CSV in
  `scripts/build-benchmarks.py`.
- The `links` rules.

## Why

Richard, 13/11/2026: the commercial team had not sent the links to clubs, so
"blitz it and we reissue codes". A link that works for whoever has it cannot
be taken back from one person, says nothing about who opened it, and was a
second copy of every row to keep in step on every save.

## What replaced them

Clubs open `/commercial-benchmarking/` with their **club code**
(`functions/club-code.js`, `NL.codeGate`), the same one as their other tools,
or signed in to NL Tools with a Club card. (For one morning the club page was
`/club/`; it became part of the one page the same day, and `/club/` forwards.)
Two tabs:
**Benchmarks** and **Your figures** (what the Proof link showed). A
confirmation is saved on the club's own row, `clubs/<club>/confirm`, and the
**Confirmations** button (at Manage) lists who has confirmed. The rules
match the code's club name to the row's key, case-folded.
`link.html` forwards to the page (a Proof link to Your figures).

Longer term (Richard): login only.

## Cleared

13/11/2026, 07:48, by a one-off workflow, `Button · Retire Commercial
Benchmarking links` (PR #1515; removed in the next PR after its run). 72
links. The `links` node was saved first to the private bucket at
`nl-tools-monthly-backups/retired/2026-11-13/commercial-benchmarking-links.json`;
the 22 confirmations made through a link were copied onto their clubs' rows;
then the node was deleted, checked gone, and an audit line written
(`cb_links_retired`).

The same run's name check found 62 of the 72 benchmarking clubs with a club
code under the same name. The other 10 had left the National League since the
2025/26 survey, so they have no code this season. Clubs that leave are a
new-season question (Roadmap, Later).
