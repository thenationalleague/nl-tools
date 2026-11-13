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

Clubs open `/commercial-benchmarking/club/` with their **club code**
(`functions/club-code.js`, `NL.codeGate`), the same one as their other tools,
or signed in to NL Tools with a Club card (registry `clubUrl`). Two tabs:
**Benchmarks** and **Your figures** (what the Proof link showed). A
confirmation is saved on the club's own row, `clubs/<club>/confirm`, and the
staff page's **Confirmations** button lists who has confirmed. The rules
match the code's club name to the row's key, case-folded.
`link.html` forwards to the club page (a Proof link to Your figures).

Longer term (Richard): login only.

## Cleared

By a one-off workflow, `Button · Retire Commercial Benchmarking links`
(`.github/workflows/retire-cb-links.yml`, removed in the PR after its run):
the `links` node saved first to the private bucket at
`nl-tools-monthly-backups/retired/<date>/commercial-benchmarking-links.json`,
any confirmation copied onto the club's row, then the node deleted and an
audit line written (`cb_links_retired`). Fill in the date and counts here
after the run.
