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

## Left behind

`config/editors`, `config/readers` and `config/reader` are dead data in the
live database, and the `cd-*` users in Firebase Authentication are dead
accounts. Neither can do anything now: no function honours the codes and no
rule honours the claim. Delete them in the console when convenient.
