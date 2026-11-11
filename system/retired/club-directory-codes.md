# Club Directory codes – retired 11/11/2026

Not a tool: the Directory's own sign-in codes. The Club Directory itself is live.
Last version in git with them: commit `2ddd8d9`
(`git checkout 2ddd8d9 -- club-directory/_gate.js functions/club-directory.js`).

## What went

- `functions/club-directory.js` (`clubDirectoryAuth`), an RTDB trigger that
  swapped a six-digit code for a custom token carrying a `dir` claim.
- `club-directory/_gate.js`, its browser half.
- Three kinds of code it accepted, all kept in
  `app-data/ops-club-directory/config`:
  - **editor** (`config/editors`): one per named person, for editing before
    the editor had a login. Switched off earlier the same day, when editing
    moved behind the portal login on `/club-directory/admin/`.
  - **master** (an editor code marked `master`, or a superadmin arriving with
    `{ admin: true }`): the one-off build and whole-node writes.
  - **reader** (`config/readers`, one per club, and the original shared
    `config/reader`): read the published copy. Issued in August 2026, before
    club codes existed.
- Rules: the `dir === 'reader'` read on `published`, and the `authRequests`,
  `authGrants` and `rate` nodes the handshake used.

## What replaced them

Clubs sign in to `/club-directory/` with their **club code**
(`functions/club-code.js`, `NL.codeGate`), the same one as the Handbook and
Programme Packs. A club code also opens that club's own private details;
a reader code never could. League staff use `/club-directory/admin/` with
their portal login. The admin team knew the reader codes were going.

## Cleared

11/11/2026, by a one-off workflow (PR #1479, removed after its run): the code
lists (`config/editors` 5, `config/readers` 72, `config/reader`), the
handshake's leftovers (`authGrants` 5, `rate` 2) and the 6 `cd-*` sign-in
accounts. All of it was saved first to the private bucket, at
`nl-tools-monthly-backups/retired/2026-11-11T18-45-33-947Z/club-directory-codes.json`.

## Also cleared: the frozen copies

Same day, by a second one-off workflow (PR #1481, removed after its run):
`app-data/ops-club-directory/editions` (31 frozen copies Publish used to take,
about 21 MB, unread since the change log and undo replaced them) and `bake`
(the record of the one-off build). The daily and monthly database backups do
the frozen copies' job. Both saved first to
`nl-tools-monthly-backups/retired/2026-11-11T18-51-52-192Z/club-directory-frozen-copies.json`;
their rules went in the same PR.
