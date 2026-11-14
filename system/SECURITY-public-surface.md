# Public-surface safety register

What is reachable **without a National League account**, and why each thing is
safe or accepted. This is the checklist a change should be measured against
before any part of a tool faces the public — the artefact the estate lacked
until the 16/08/2026 audit.

**Scope:** the `nl-tools` and `nl-widgets` Firebase projects, the static
GitHub Pages site at `nl.tools`, Cloud Functions, and Storage. Authority:
`system/rtdb/rules.snapshot.json`, `system/rtdb/nl-widgets.rules.snapshot.json`
and `system/storage/rules.snapshot.rules` **are** the deployed documents, so
they are ground truth. Live *data* cannot be read from the repo — where a
verdict depends on data or on GCP console config, it says so.

**Headline (16/08/2026 audit): the public surface is fundamentally sound. No
critical or high risk.** The self-signup-as-staff takeover vector is closed and
verified in code (login v5.0 no longer writes `users/<uid>`; rules forbid client
self-creates; `functions/account.js` mints roles server-side from admin-minted
invites). The two databases are correctly split. No genuinely-private key ships
to a browser. Everything below is low severity — accepted trade-offs and
documentation, not holes.

**14/11/2026 sweep: that verdict had stopped being true.** The tools had
grown around it. What was found, and fixed:

- **"Signed in" is anyone.** Anonymous sign-in (the code doors) and email
  sign-up (the request form) are both open, so a rule of `auth != null`, or
  one that asks for an email address, admits anybody on the internet.
  `tests/open-reads.test.mjs` now lists every database read open to anyone
  signed in, each with its reason, and fails on a new one.
- **A sign-up held access before approval.** The request wrote the person's
  record with a club role, the club they typed and the tools they ticked, all
  of which the rules read. Waiting people now hold nothing (role `pending`);
  declined ones hold nothing (role `rejected`). A one-off tidy found no
  existing record carrying any of it.
- **Files treated an email address as League staff.** They now ask for the
  League mark, `league: true`, which only the server sets
  (`functions/pass-claims.js`).
- **Cross-club writes enforced only by the page.** UW tills could read and
  change every club's voucher codes; a club could rewrite any club's
  attendance. Both are now enforced by the rules, with emulator tests.
- **Smaller:** pending invites (with their tokens) and Club Kits submissions
  were readable by anyone signed in, or anyone at all; audit lines could be
  written in someone else's name; two unused nodes were writable; the
  request emails could be sent by anyone to any address with any link; the
  retired footage folder took uploads from anyone.

The emulator tests that pin each of these run on every rules pull request
(Auto · Test database rules).

## The rule this register enforces

A gated tool ships its HTML/JS to the browser **before** auth-guard reveals the
page — auth-guard hides `#pageWrap`, it does not stop the source downloading. So
the safety line is: **no private data in page source; all records fetched from
RTDB after `nlAuthReady` fires**, where the rules are the real gate. Every gated
tool audited follows this (inline "data" in source is field-schema comments,
never records). A new tool that embeds real data in its HTML breaks the model
even though the page looks gated.

## Register

Legend — **Safe**: correct by design. **Review**: low-severity accepted
trade-off or verification task, no code fix required now.

| Surface | Exposed pre-auth | Verdict |
|---|---|---|
| Login page (`index.html`) | Firebase web config (public key), signup UI. No data. | Safe |
| `tools` registry read (`.read:true`) | Tool labels/URLs/icons/role-defaults. No PII. Drives the login tool list. | Safe |
| Gated tool pages | HTML/JS structure only; records fetched after auth. | Safe |
| `ops-judgements/records` | Published disciplinary decisions — external widget. | Safe |
| `ops-vacancies/listings` | Job listings — jobs-board embed. | Safe |
| `ops-handbook/editions` + `publishedEditionId` | Published handbook (public by intent). | Safe |
| `ops-commercial-benchmarking/aggregates` | Anonymised aggregates and the club roster (names only). The per-club token links (`links/$token`) were retired 13/11/2026; a club reads its own row by club code (`clubName` claim). | Safe |
| `ops-club-data`, `ops-club-contacts`, `ops-club-signoff` | Retired token-link flows; token rules removed 15/10/2026, admin read only. | Closed |
| Cloud Functions (`consumeInvite`, `submitAccessRequest`, `withdrawAccessRequest`) | Require a verified Firebase token; role server-minted from the invite, never from the request body. Since 14/11/2026 a waiting request holds no club, club role or tools (`tests/access-sweep.test.mjs`). | Safe |
| Cloud Functions (`programmeAuth`, `clubDirectoryAuth`, `uwPromoAuth`, `fanWidgetsAuth`) | RTDB-triggered; mint scoped claims after a server-side passcode/role check. | Safe |
| Storage `data/**`, `programme/{club}/**`, catch-all | Since 14/11/2026 League reads and writes need the League mark (`league: true`, server-set), not an email address, which every account has; club paths need the club's own claim. `tests/emulator/storage-league-rules.mjs`. | Safe |
| Storage `footage/**` (retired) | No uploads; reads need the League mark (14/11/2026). Files to be cleared. | Closed |
| Embeds (motm, score-predictor, judgements, vidiprinter) | Fan devices, no NL auth; SSO custom-token + App Check (reCAPTCHA v3) on the write-capable ones; judgements embed reads the public node only, no writes. | Safe |
| Firebase web API keys / reCAPTCHA site keys in source | Public-by-design client keys, not secrets. | Safe |
| `wellbeing/index.html` | A named support contact's phone/email, published on a deliberately-public page. | Review — see PII note |
| `admin/invites/$token` (`.read:true`) | Invite name/email/role, readable with the UUID token. | Review (low) |
| `ops-vacancies/analytics` (`.write:true`) | World-writable anonymous click node. | Review (low) |
| `ops-club-kits/submissions` | Write admin-only since 15/10/2026; read League card and Access since 14/11/2026 (a League edit stamped the editor's address into the record). | Closed |
| `admin/invites-pending` | Read as `admin/requests` is, superadmin or admin role, since 14/11/2026 (it holds every unused invite's token). | Closed |
| UW `codes` | A till or manager reads its own club's codes, or one code by its text; writes only its own club's (14/11/2026, `tests/emulator/uw-codes-rules.mjs`). | Safe |
| Attendance `archive/<season>/submissions` | A club writes only its own home matches; the whole node is League and Manage (14/11/2026). | Safe |
| `admin/tool-requests`, `admin/notifications` | Unused; closed 14/11/2026. | Closed |
| `ops-attendance/submissions` + `archive` (`.read:"auth != null"`) | Any signed-in session, which is anyone, can read every club's figures. | Review: to decide (League only, or each club its own?) |
| `ops-handbook/draft` (`.read:"auth != null"`) | The unpublished handbook, readable by anyone signed in. | Review: to decide |
| nl-widgets `users`/`predictions`/`motm` per `$jwtId` (`.read:"auth != null"`) | A fan can read another fan's forename/initial/team/prediction if they know the jwtId. | Review (low, minor PII) |
| `travel-planner` Google Maps key | Billable client key — abuse if unrestricted. | Review — verify referrer lock in GCP |
| `media-local-media/submissions/$id` (anonymous create, 29/10/2026) | Nothing readable: no public `.read` anywhere in the block. Write is **create-only** – `!data.exists() && newData.exists()` with `uid === auth.uid`, so no overwrite or delete by the public, and no other node (`status`, `manual`) is writable by them. Every field shape- and length-capped (names, organisation, club ≤ 120; email ≤ 254 and `a@b.c` shaped; phone ≤ 40; `type` one of nine values; push-id keys; `$other: false` at every level). Form at `/local-media/`, console at `/local-media/admin/`. | Review (low) |

## The review items, in priority order

None is critical. Most are already-accepted trade-offs needing only a record.

1. **`wellbeing/index.html` — a real person's contact details in the public
   repo.** Marc Williams (EPIC) is listed with phone + email. The page's purpose
   is "contact him directly," so this reads as intentional and consented, not a
   leak — but it is the one place named-individual contact details are committed
   publicly, and the repo's data rule is otherwise absolute. **Action: confirm
   the listed person is content to be listed; then this line stands as the
   record that it was checked.**
2. **`travel-planner` Google Maps key referrer lock.** Unlike Firebase keys, an
   unrestricted Maps JS key is a billing-abuse vector. The repo cannot prove the
   restriction either way. **Action: confirm in GCP console the key has an
   HTTP-referrer allowlist (`nl.tools/*`) and Maps-only scope.**
3. **`admin/invites/$token` public read.** Anyone with a UUID invite link reads
   name/email/role. Already logged in `SECURITY-role-self-grant.md`. Token is
   unguessable and single-use. *Fix shape if ever raised: serve the pre-auth
   invite read through a callable that returns only the acceptance screen's
   fields.*
4. **`ops-vacancies/analytics` world-writable.** Anonymous clients can write
   arbitrary data, not just counts — a pollution/quota vector. Accepted. *Fix
   shape if abused: a `.validate` shape/size cap, or move tracking behind a
   callable.*
5. ~~`admin/tool-requests` writable by any authenticated user.~~ Closed
   14/11/2026: nothing used it.
6. **Broad `auth != null` reads** — `ops-attendance/submissions`+`archive` and
   the nl-widgets per-`$jwtId` fan records. Cross-principal reads are possible
   given the child key. Minor PII at most; acceptable under the two-database
   split and unguessable ids. Recorded here so it's a conscious decision.

7. **`media-local-media/submissions` is an anonymous create-only write.**
   Anyone with the link – or anyone who reads the page source – can sign in
   anonymously and push submissions. Each one is shape-capped, but the rules
   cannot count, so there is no cap on the number of submissions or of
   contacts in one, and no rate limit. What it buys an abuser is junk rows on
   a staff-only list (staff delete them in the console), never a read. *Fix
   shape if abused: a `rate/<uid>` node checked by the rule, or App Check on
   the form.* Proven by `tests/emulator/local-media-rules.mjs` (run by hand)
   and shape-checked in `tests/local-media.test.mjs` (npm test).

## Coverage gaps to close

- **`nl-vidiprinter` project rules are not snapshotted** in `system/rtdb/`. It's
  a public score-ticker feed (low sensitivity), but its rules can't be audited
  from the repo. Snapshot them into `system/rtdb/` for completeness.

## How to use this file

Before shipping anything that touches the public surface — a new no-login page,
a new `.read:true` rule, a new embed, a new Function — find the nearest row
here and match it. A new public read must earn a "Safe" line (with its consumer
named) or an explicit "Review" acceptance. If it can't, it doesn't ship public.
When a review item is actioned, update its line rather than deleting it — the
record that it was checked is the point.

_Seeded from the 16/08/2026 public-surface audit._
