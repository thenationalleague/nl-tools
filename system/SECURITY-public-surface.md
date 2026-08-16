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
| `ops-commercial-benchmarking/aggregates` + `links/$token` | Anonymised aggregates + unguessable per-club token. | Safe |
| `ops-club-data`/`ops-club-contacts` `submissions/$token` | Token-gated submission (gated by token existence). | Safe |
| Cloud Functions (`consumeInvite`, `submitAccessRequest`, `withdrawAccessRequest`) | Require a verified Firebase token; role server-minted from the invite, never from the request body. | Safe |
| Cloud Functions (`programmeAuth`, `clubDirectoryAuth`, `uwPromoAuth`, `fanWidgetsAuth`) | RTDB-triggered; mint scoped claims after a server-side passcode/role check. | Safe |
| Storage `data/**`, `programme/{club}/**`, catch-all | Reads require an email/club claim; writes own-prefix or false; the anonymous-signin `programme` hole was explicitly closed. | Safe |
| Embeds (motm, score-predictor, judgements, vidiprinter) | Fan devices, no NL auth; SSO custom-token + App Check (reCAPTCHA v3) on the write-capable ones; judgements embed reads the public node only, no writes. | Safe |
| Firebase web API keys / reCAPTCHA site keys in source | Public-by-design client keys, not secrets. | Safe |
| `wellbeing/index.html` | A named support contact's phone/email, published on a deliberately-public page. | Review — see PII note |
| `admin/invites/$token` (`.read:true`) | Invite name/email/role, readable with the UUID token. | Review (low) |
| `ops-vacancies/analytics` (`.write:true`) | World-writable anonymous click node. | Review (low) |
| `ops-club-kits/submissions` | Public read + fully unauthenticated create (colours only). | Review (doc) |
| `admin/tool-requests` (`.write:"auth != null"`) | Any signed-in user can write the request queue. | Review (low) |
| `ops-attendance/submissions` + `archive` (`.read:"auth != null"`) | Any authenticated principal can read across clubs. | Review (low) |
| nl-widgets `users`/`predictions`/`motm` per `$jwtId` (`.read:"auth != null"`) | A fan can read another fan's forename/initial/team/prediction if they know the jwtId. | Review (low, minor PII) |
| `travel-planner` Google Maps key | Billable client key — abuse if unrestricted. | Review — verify referrer lock in GCP |

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
5. **`admin/tool-requests` writable by any authenticated user.** Signup is open,
   so "authenticated" ≈ "anyone." Low impact — admins drain the queue. *Fix
   shape: `.validate` the entry shape / match writer uid.*
6. **Broad `auth != null` reads** — `ops-attendance/submissions`+`archive` and
   the nl-widgets per-`$jwtId` fan records. Cross-principal reads are possible
   given the child key. Minor PII at most; acceptable under the two-database
   split and unguessable ids. Recorded here so it's a conscious decision.

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
