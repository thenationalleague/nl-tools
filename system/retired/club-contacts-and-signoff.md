# Club Contacts and Club Sign-off (`/club-contacts/`, `/club-signoff/`) — retired 15/10/2026

## What they did

The summer 2026 exercise that built the Club Directory, in two rounds.

- **Club Contacts** (`ops-club-contacts`): each club got a private link
  (a capability token, no login) to a guided form for its details, shared
  inboxes and people. It replaced `club-data` in June. The superadmin
  console at `/admin/` issued the 72 links, reviewed submissions, and
  printed **Handbook forms**, one club's record per page.
- **Club Sign-off** (`ops-club-signoff`): the same private links opened a
  page showing each club what the League had tidied in its entry and asking
  it to check a handful of flagged items. The console tracked replies.

## Why they went

The work moved into the tools that now own it. Richard, 15/10/2026: the
Handbook is live and managed through the Club Directory and the Handbook,
the two separate tools. Nothing still sends clubs to either page.

## What is kept, and why

- **`app-data/ops-club-contacts/submissions` stays.** The Club Directory
  editor reads it to rebuild "the club's original, with the changes
  applied". It is the text the club actually typed, and nothing else holds
  it. Do not delete it while that feature exists.
- **`app-data/ops-club-signoff/responses` and `ops-club-contacts/invites`
  stay** as records, admin-read only.
- **The token doors are closed.** The rules let anyone holding a link read
  that club's submission (staff names, personal mobiles, home addresses) and
  write to it. Those `$token` rules were removed in the same PR, so the old
  links reach nothing.
- **`club-directory/_tidy.js` stays.** It was written so the sign-off page
  and the directory editor applied identical tidying. The editor is its
  only caller now.

## Decisions worth keeping

- **A capability link beats a login for a one-off return.** Clubs had no
  accounts and needed none. The token was the credential, and the rules
  keyed on it.
- **Promise and action from one function.** Sign-off told a club what the
  League would change by running the same tidy code that later changed it,
  so the two could not disagree.
- **Phone validation is loose and never blocking.** Count digits (7 to 15),
  ignore formatting, warn rather than refuse. Strict checks rejected
  correct numbers in common forms such as "+44 (0)7…".

The last versions of all four pages are in git history, before the commit
that added this file.
