# Matchday Live

Contributors at grounds send 20-second vertical clips from their phones. The
clips land in a staff feed, filed under the match and the goal or card they
are about.

| Surface | Path | Who |
|---|---|---|
| Capture page | `/matchday-live/c/#<token>` | Contributors, no login. One personal link each. |
| Feed | `/matchday-live/` | Portal tool `media-matchday-live`, behind auth-guard. |

Built 15/10/2026 from the handover brief of the same date. This file records
what was decided and where the build departs from the brief, so the next change
starts from the answers.

## Decisions (Richard, 15/10/2026)

| Question (brief §10) | Answer |
|---|---|
| toolKey and department | `media-matchday-live`, Media. |
| Who manages contributors | Anyone with **Manage** (`admin`) on the tool. **Use** (`access`) reviews clips only. Defaults: superadmin Manage, League Admin Use, everyone else off. |
| Consent and licence wording | Editable in the Contributors tab, versioned in RTDB (`config/consent`). The feed pre-fills nothing. **The capture page will not send anything until a version is saved**, so unapproved wording cannot reach a contributor by accident. Saving a new version asks everyone to agree again. Who signs the wording off is still open. |
| Blaze plan | Yes. The project already runs scheduled and triggered functions. |
| Retention | Rejected clips: the video is deleted 7 days after rejection, the record kept (who sent what stays answerable). An upload unfinished after 24 hours is cleared. Approved and unreviewed clips are never deleted automatically. An end-of-season archive is not decided. |
| Back-dating (asked the same evening) | Both. **Late filing**: any contributor can send a clip until 26 hours after kick-off (about a day after full time); it files under the match's own day. **Test links**: a contributor marked *Test link* can pick any match from the last 7 days; their clips carry `test: true`, show a TEST pill, stay out of the counts and gap flags, and the rules refuse to approve them. |
| Pilot list | Not in the repo. Contributors are personal data and this repository is public; they are added in the Contributors tab. |

## Where the build departs from the brief, and why

**No public HTTPS functions, no signed URLs (brief §7).** The org's Domain
Restricted Sharing policy refuses an `allUsers` invoker on any new Cloud Run
service, so `mdlStart` / `mdlFinish` / `mdlToday` would deploy and then 403 for
everyone. That is how NL Cup Footage's signer failed (`system/retired/nl-cup-footage.md`).
Signed URLs also need an IAM grant made in a console. Instead:

- The capture page signs in anonymously and swaps its link token for a session
  through `NL.codeGate.viaFunction` — the RTDB-trigger handshake every passcode
  gate here uses. The session carries `mdl: <contributorId>` and `mdlGen` (the
  first 16 hex of the token's hash).
- The rules check `mdlGen` against the stored hash, and `active`, **on every
  read and write**. Rotating or deactivating a link stops it at once, not when
  the ID token expires.
- The limits `mdlStart` would have enforced are in the rules: a clip can only
  be created in the same write as a `pace` stamp (30 seconds apart) and a
  `quota` count (20 a day). A contributor may create a clip and then move it
  from `uploading` to `new`. Nothing else.
- Storage: create-only under the contributor's own id, video only, under 40MB.

**No second NLS poller (brief §5).** `functions/nls-ingester.js` already polls
NLS on a fixture-derived cadence and writes a deduplicated event stream. Its
output is in the nl-widgets project, behind a staff-only claim, so
`matchdayLiveSync` mirrors the slice this tool needs into
`app-data/media-matchday-live/matchdays/<ymd>/<matchId>`. It does two small
reads a minute when nothing has changed, and it writes only the matches that
moved.

**Event coverage follows NLS.** The National League has live goals, cards
and subs. North and South have **live goals only**; their cards arrive after
the match, if at all (`functions/nls/transform.js`). So a red card at a North
or South ground can be filed as "Just happened" or as a general update, but
never against the card itself until the official enters it. The Cup is left
out of v1.

**`contributors/` is readable by reviewers.** The brief made it admin-only, but
reviewers need names to read the feed. The secret parts live elsewhere:
`secrets/` (token hash) is Manage-only and `keys/` is readable by nobody.

## Data

All under `app-data/media-matchday-live/` in nl-tools RTDB; the rules are in
`system/rtdb/rules.snapshot.json`.

```
contributors/<id>     name, type club|media, club, clubOpta, outlet, credit, active, test
secrets/<id>          { tokenHash, issuedAt }          Manage only
keys/<sha256>         <id>                              write-only; the trigger's lookup
consent/<id>          { version, at }                   written by the contributor
config/consent        { version, text }                 Manage
matchdays/<ymd>/<id>  comp, ko, koMs, period, live, minute, home, away, events{}   function only
clips/<ymd>/<clipId>  contributorId, matchId, eventId | pendingEventMatch | generalKind,
                      minute, scoreAtTime, caption, storagePath, mimeType, durationSec,
                      sizeBytes, test, status uploading|new|approved|rejected, createdAt,
                      reviewedBy, reviewedAt, retaggedBy, autoMatchedAt, purgedAt
pace/<id>             last clip time
quota/<ymd>/<id>      clips sent that day
authRequests|authGrants/<uid>                           the handshake
```

Storage: `matchday-live/<ymd>/<contributorId>/<clipId>.<mp4|webm>`.

`<ymd>` is the **UTC** date the ingester files the match under, not the local date.
A clip files under its **match's** day, which for a late clip is yesterday's.

The clip-create rule checks that the named match exists in `matchdays/<ymd>`
and that `now < koMs + 93600000` (26 hours) unless the contributor is a test
link. `LATE_WINDOW_MS` in `functions/matchday-live-core.js` is the same number;
a unit test fails if one changes without the other being looked at.

The mirror backfills the last 7 days from `nls/fixtures/<comp>/<ymd>` and
`nls/events/<ymd>`, two days per run, and leaves any day it already wrote
live alone.

## Tests

- `tests/matchday-live.test.mjs` (in `npm test`): token hashing, the mirror's
  shape, ±2 minute auto-match, the retention plan.
- `tests/emulator/` (by hand, needs Java): the rules, the three functions'
  real code, and both pages end to end in Chromium. See its README.

## Known limits (v1)

- **Untested on real phones.** The emulator runs use Chromium with a fake
  camera. iPhone Safari and Android Chrome are the acceptance checks in the
  PR. Things that can only be seen on a phone: Add to Home Screen keeping the
  link, rotation mid-record, and whether iOS hands back MP4.
- Clips are stored as recorded. Chrome records MP4 where it can, older
  Android WebM, iOS MP4. Normalising to H.264 1080×1920 is v2.
- Storage rules cannot read RTDB. A rotated or deactivated link is refused by
  RTDB at once, but could still put an object in Storage until its ID token
  expires (within the hour). Such an object has no clip record, so it never
  reaches the feed.
- Staff-side Storage reads follow the rest of this bucket (any signed-in
  account with an email claim). Clip paths carry RTDB push ids and are only
  ever shown in the tool.
