# Media Accreditation

Photographer licences (the League's) and club accreditation (the home club's).
Spec: `system/media-accreditation-plan.md`. This file records what is built,
what was decided, and where the build departs from the spec, so the next slice
starts from the answers.

| Surface | Path | Who | State |
|---|---|---|---|
| Public application | `/accreditation/application/` | Anyone, anonymous sign-in | **Built (slice 1)** |
| Staff console | `/accreditation/admin/` | Manage on `media-accreditation` | **Built (slice 1)**: Queue (read-only), Agreements, Outbox |
| Club page | `/accreditation/` | Club Admin (Use) | Shell. League roles are sent on to `/admin/` |
| Holder's page | `/accreditation/application/#<token>` | One holder or guardian | Slice 2 |

## Decisions (Richard, 01/11/2026)

| Question | Answer |
|---|---|
| Club defaults (spec §14 item 6) | **Club Admin: Use. Club Staff: off.** League Admin: Manage. League Staff: off. Confirming a photographer is an act-for-the-club decision, which is what Club Admin means. |
| …but in the registry today | `club-admin` is **`off`** until the club page has something on it. The registry card points at `/accreditation/`, and a card for an empty page in front of 72 clubs is worse than no card. Switch it to `access` in the PR that ships the club queue; `tests/accreditation.test.mjs` pins `off` so that change is deliberate. |
| Personal link in slice 1 | **No.** The applicant gets a reference (`A2627-XXXXXX`) on screen. The link, guardian signing and resubmission arrive together in slice 2, with the `NL.codeGate.viaFunction` trigger. |
| First agreement text | Typed into **Agreements** in `/admin/`. Never committed. The form stays closed until version 1 exists. |

## Where the build departs from the spec, and why

**Storage path carries the uid.** The spec sketches
`accreditation/<season>/<applicationId>/…`. The build uses
`accreditation/<season>/<uid>/<applicationId>/…`, because Storage rules cannot
read RTDB: the only thing they can confine an anonymous session to is a path
with its own uid in it. Without it, any session could drop a file into any
application's folder.

**Types are code, agreements are data.** `config/types/<type>` in the spec's
data sketch is `AC.TYPES` in `_shared.js` instead. A type's required fields and
checks are code anyway; its agreement text is the part that changes without a
deploy, and that is in RTDB (`config/agreements/<type>`), versioned, with every
version kept write-once under `config/agreementVersions/<type>/<v>`.

**Checks are computed when shown, not stored.** Spec §16 has `checks{}` on the
record. Computing them in the console means a duplicate that arrives later
still flags the earlier application, and a threshold change applies to
everything at once. Store a snapshot at approval if a record of "what staff
saw" is wanted.

**Quota is a rolling 24 hours, not a calendar day.** `quota/<uid> = {since, n}`.
RTDB rules cannot turn `now` into a date, so a `quota/<ymd>/<uid>` key would be
whatever the client said today was.

**Duplicate check uses applications, not licences.** Licences do not exist
until slice 2's approve step. Same rule otherwise: same email, or same name and
date of birth, this season.

## Data

All under `app-data/media-accreditation/` in nl-tools RTDB; rules in
`system/rtdb/rules.snapshot.json`.

```
config/agreements/<type>              { version, text, approvedBy{uid,name}, approvedAt }   Manage writes; any signed-in session reads
config/agreementVersions/<type>/<v>   same shape, write-once                                 Manage
applications/<season>/<id>            see AC.record in _shared.js                            created by the form; Manage reads
pace/<uid>                            last send, ≥ 60 s apart                                the session's own
quota/<uid>                           { since, n }, n ≤ 5 in 24 h                            the session's own
outbox/<id>                           { to, template, applicationId, season,
                                        status queued|sent, createdAt, sentAt?, sentBy? }   form creates "received" only; Manage
```

Storage: `accreditation/<season>/<uid>/<id>/photo.(jpg|png)`,
`photographer-<pid>.(jpg|png)`, `insurance.(pdf|jpg|png)`. Create-only by that
uid; photos ≤ 5MB, schedule ≤ 10MB. The form shrinks photos with
`NL.files.previews` first, so a phone photo fits.

The form's one write is an update of the application, the pace stamp, the
quota count and the outbox email together. The rules require all of them:
an application without a fresh pace and a changed quota is refused, and an
outbox entry must go to the email on an application created in the same write
by the same uid. So an anonymous session cannot use the outbox to address
anyone but itself.

## Tests

- `tests/accreditation.test.mjs` (in `npm test`): validation, routes, the
  record's shape, the §6.1 checks, and the rules' shape held against
  `_shared.js` (keys, caps, no stray reads).
- `tests/emulator/accreditation-rules.mjs` (by hand, needs Java): 76 cases
  against the real rules, RTDB and Storage. Watched fail with the under-18 and
  pace conditions removed.

## Known limits

- **No real phone test yet.** Acceptance check 10 (iPhone Safari, Android
  Chrome) is open. Photo picking on iOS and the date inputs are the parts to
  watch.
- **Insurance documents and Storage reads.** Staff-side Storage reads follow
  the rest of the bucket: any account with an email claim, which includes
  club accounts. The path (anonymous uid + push id) is only ever listed in a
  Manage-only node. Revisit before the club page lists any upload path.
- **Abuse limits are per anonymous session.** A determined sender can sign in
  anonymously again for a fresh uid. Firebase's own sign-up throttling is the
  backstop; App Check would be the next step if spam appears.
- **Orphan uploads.** Files go up before the record is written. If the write
  is refused, the files stay with nothing pointing at them. They never reach
  the console.
