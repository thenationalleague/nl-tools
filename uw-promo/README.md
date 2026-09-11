# UW Promo Codes

Utility Warehouse promo codes for the 72 current National League clubs.
**Registered-to-a-club model** (v3.0): every code is created against exactly
one club and can only ever be redeemed there. UW issues codes to *customers*;
a customer redeems one at the club it belongs to. Three standalone pages on
the **footage-CDN access model** (trust-level PINs/passcodes + direct links,
NO auth-guard/portal login), with a full audit trail.

| Page | Who | Gets in via | Can do |
|---|---|---|---|
| `/uw-promo/` | **Utility Warehouse** (one shared login) | shared 6-character passcode or `?u=<token>` direct link | Two method tabs — **In-store codes / Online codes** — sharing one table. In-store: **generate codes** for one in-store club at a time (generate-only; count defaults to 1; ≤500), revoke unredeemed codes, per-row **Dispatch** with confirm. Online: **Request club codes** (online clubs only; due prefilled +7, editable) — an open request renders as **placeholder rows** in the table (Requested/Overdue pill, empty code cell) that convert to Issued rows as the club uploads; per-row Dispatch; **no revoke on club-uploaded codes, ever**. Both: release a redeemed code (required reason), search, CSV export; stat cards follow tab + club filter |
| `/uw-promo/club/` | **Each of the 72 clubs** | own `?c=<token>` direct link (the QR-code target for the point of sale) plus a credential — the 4-digit till PIN (**demanded on every visit**, never stored), or the club's manager passcode (**remembered on that browser** until Sign out) | **Till page**: big code entry → a valid unredeemed code *registered to this club* is redeemed here (RTDB transaction — two tills can't claim the same code). Refusals: already-redeemed shows club + date/time, expired its expiry date, everything else ONE neutral message. **Dashboard** (manager passcode; badge reads *Dashboard · In-store method* or *· Online method*): the same table UW sees, scoped to this club — **central codes are anonymous until redeemed** (a muted count line covers what's withheld; the club's own uploads stay visible); placeholder rows carry the red **Upload** button (one input box per code still owed; part-filling fine; three undertakings + confirm); an online club **marks its own codes redeemed** (confirm first); **Check a code** only where a till lives (in-store, or central codes still in the wild); PIN self-service + own till card (in-store). No activity feed — the master console's audit is the log |
| `/uw-promo/admin/` | **NL master** | master passcode only (no direct link, deliberately; first-run bootstrap sets it; **remembered** until Sign out) | Mirrors the UW dashboard: tabs **Clubs & access · In-store codes · Online codes · Audit**, landing on Clubs & access (master passcode, UW access, the club table — method pill + pencil, contact column, credential chips with reissue glyphs, Card for in-store rows only, access CSV, print till cards). The method tabs are UW's shape plus master powers: generate-only add + Code adds on In-store, Request club codes on Online, and per-row Dispatch / Redeem… / Register… / Revoke (typed for redeemed) / Delete (typed). Sandbox reset in test mode |

## Which club a code belongs to

Chosen from a required dropdown when the codes are created, **one club per
add** — 25 for Hartlepool, then 25 for Sutton, never both at once. There is
deliberately no "any club" option: a code redeemable anywhere and a code
registered to one club cannot both be true, and the club is what the whole
model turns on. A code registered to Hartlepool and presented at Sutton is
refused, by name, at the till.

The registration is fixed for the life of the code. **Release** un-redeems a
code so it can be used again, but leaves it registered to the same club —
it rewinds the redemption, not the registration.

Enforcement is in two places: the till checks before it writes, and
`UWP.redeemTxn` (the transaction updater, unit-tested in
`tests/uw-promo.test.mjs`) refuses again inside the transaction.

**Every code is born assigned to a club** — the pre-v3.0 clubless pool is
extinct (ruling 11/09/2026: the "Not yet registered" filter bucket is gone
from both consoles). The master console's per-row **Register…** survives
only as dormant recovery machinery: it renders solely on a clubless row,
which no current door can create.

## Status model

`active` (shown as **Unredeemed** — issued to the club, not yet used) →
`redeemed` (used at that club) → back to `active` only via a **release** by
NL/UW (required reason, recorded; the club registration is kept). `revoked`
ends a code either way (UW: unredeemed only; NL master: redeemed too, behind
a typed confirm).

**Central codes expire 12 months from generation** (spec item 4). Nothing is
stored: `UWP.isExpired` derives it from `createdAt`, so it covers every
central code already in the system, and `redeemTxn` refuses an expired one
inside the transaction. Panels show a derived **Expired** pill/filter/count.
Club-uploaded codes (`createdBy: club:*`) never expire here — the club's own
POS is the authority, and the 12-month promise is an upload undertaking, not
a field.

Codes are matched on a stored, indexed `norm` field (uppercase, alphanumerics
only) so a till entry matches however it's typed — `7f3 k9c` finds `7F3K9C`,
and a UW-supplied code keeps whatever punctuation it arrived with. Generated
codes are 6 plain characters with no hyphen; the till entry box is free text
(64 characters) because UW's own codes are whatever length they are.

## Credentials

**Sessions** (owner ruling 09/09/2026): the till asks for its PIN on every
visit — that URL sits behind a QR on public display, and nothing about a
till sign-in is ever stored. The three laptop surfaces (UW dashboard,
master console, club manager view) remember the **credential** in that
browser's localStorage and silently re-run the server handshake on load,
so each tab still mints its own scoped token (no shared live session
between tabs) and a rotated credential fails once, forgets itself and
shows the gate. Every surface has a **Sign out** that forgets; the club
page's "Not you?" clears any remembered manager credential too, so a
shared device never resumes as the manager.

| Who | Credential | Why |
|---|---|---|
| NL master | 6-character alphanumeric passcode | Typed once, on a laptop, by one person |
| Utility Warehouse | 6-character alphanumeric passcode | Same |
| Each club — till | **4-digit numeric PIN** | Typed on a phone, at a till, by whoever is on shift |
| Each club — admin | 6-character **manager passcode** | Named contact, on a laptop. Never printed |

## Redemption methods — unassigned / in-store / online (spec v42.0, self-serve v43.0)

("Route" in the data — `config/clubs/<CODE>/route` — and "redemption
method" everywhere a person reads it. Changing one is deliberately
ceremonial in both consoles: read-only until Edit, explicit choices, and a
warning confirm before anything is written.)

Every club carries a `route` on its config record, defaulting to
**unassigned**, and the route decides what its people can open at all:

| Route | Till PIN opens | Manager passcode opens | Codes come from |
|---|---|---|---|
| `unassigned` | Holding screen, no token | **The setup screen** (v43) | Nowhere yet — route not chosen |
| `instore` | The till (redeem) | Till + admin view (no upload) | UW/NL centrally |
| `online` | Holding screen, no token* | Admin view: upload, list, activity | The club uploads its own |

**Clubs choose their own route** (spec v43.0 §1). An unassigned club's
manager passcode mints a session scoped to a setup screen: pick in-store or
online (each card says what it means), tick the three route-specific
undertakings — the tick boxes *are* the gate; nothing saves without all
three — and give at least one **scheme contact** (name, role, email).
Saving locks the route. The till PIN deliberately cannot reach setup:
choosing a route binds the club to undertakings, and that is a manager
decision, not a till-shift one.

**Locked means locked** (§4). Reversal is an NL or UW admin act — the
Redemption methods control on the UW page, or the Method column on the
admin console —
and a route change **never touches existing codes**. Creation follows the
current route; validation honours whatever exists: a club that leaves the
in-store route keeps a working till for as long as its central codes are in
the wild (the session carries `hasCentral`, computed server-side at
sign-in), because printed cards in shops must keep working.

The route gate lives in the auth **function**, not the page: an unassigned
club's correct till PIN gets a holding response and no Firebase token is
minted, so nothing is readable behind it. Correct-credential holding
responses do not touch the failure throttles. *An online club's grant
carries no PIN and no link token **unless** central codes exist for it
(the `hasCentral` case above) — a QR till card cannot exist for a club with
no till, and the print path has nothing to print.

The admin console's Clubs & access tab is the system of record: a Route
column per club (audited on change), and a ledger line — N in-store,
N online, **N unassigned** — where the unassigned number is the chase list.
Seeding new clubs sets `unassigned`, so a club is switched off until it
completes its own setup. A route change takes effect at the club's next
sign-in; open sessions keep their shape until they re-enter.

Central codes for online or unassigned clubs aren't blocked — the add-codes
dropdowns mark those clubs instead, so a batch doesn't land where no shop
will redeem it by accident.

## Scheme contacts (spec v43.0 §3)

Every club names at least one scheme contact at setup — who NL and UW
actually ring when a batch is overdue or an upload looks wrong. Stored at
`contacts/<CODE>` in RTDB (name, role, email — **never in git**; this repo
is public), readable and editable by that club's manager and by NL/UW.
The club admin view shows the contacts in their own card with an Edit flow
(audited as `contact`); the master console surfaces the first contact per
club in Clubs & access. Multiple contacts are allowed.

## The request → dispatch lifecycle (spec v43.0 §5)

Every code carries a visible pipeline, and the pre-dispatch stage is named
for **who acted**: a centrally created code reads **Created**, a
club-uploaded one reads **Issued** — issuing is a club act.

| Face | Meaning | Set by |
|---|---|---|
| **Created / Issued** | Code exists, not yet sent out | Creation (UW/NL → Created; club upload → Issued) |
| **Dispatched** | Physically sent out | UW page bulk flow: tick codes → confirm → `dispatchedAt`/`dispatchedBy` in one multi-update, audited |
| **Redeemed** | Used | The till, as ever |

These are **derived faces** (`UWP.faceOf` over `statusOf` + the
`dispatchedAt` flag), never a stored status — expired/redeemed/revoked
always win.

**Requests are logged, never operated — and a request IS empty rows.**
UW (partner page) or NL (master console) raises one against an online
club; from then on nothing on the request is ever pressed. It renders as
one **placeholder row per code still owed** in the code table itself —
Requested pill (Overdue past due), empty code cell — and each club upload
converts one placeholder into a real Issued row. "Fulfilled" is not a
label: it is having no placeholders left. Dispatch is **per row** with its
own confirm. An **online club marks its own codes redeemed** (confirm
first, audited) — its store is where fans redeem, so the club closes the
loop and the Redeemed counts move for online codes too.

**Overdue chasing is internal only** (§7): a scheduled Cloud Function
(`uwPromoOverdue`, daily 08:30 UK) pokes the GAS router when requests are
past due **and still short of their quantity** — a fully supplied request
can never be chased; the GAS side reads the requests, codes, club names and recipients
itself with the server credential and emails the digest to the
`config/support/notify` list. The poke carries no content, so an outside
caller can only make it send the true digest to the configured people.
Clubs are never emailed by the platform — that would need fan/club personal
data flows the spec explicitly rejected.

Codes left behind by a route change appear in the club admin view as a
read-only **previous scheme** block — visible history, no actions.

## The voucher's value is master-set config

NL sets it on Clubs & access (**Voucher value** card — "65" or "£65", whole
pounds, stored as an integer at `config/value`). It rides to clubs in their
sign-in grant, `UWP.VALUE` renders it, and every mention in copy reads
"the agreed value (£N)". Clubs see a change at their next sign-in. £50 is
the fallback for a grant that predates the field.

## Two doors, one page

`/uw-promo/club/` serves two jobs with two credentials on the same URL and the
same QR:

| | **Till mode** (4-digit PIN) | **Club admin** (manager passcode) |
|---|---|---|
| Redeem a code (in-store route) | ✅ | ✅ |
| Redeemed list + counts (in-store) | ✅ | ✅ |
| Check a code | ✗ | ✅ |
| Route setup / first sign-in (unassigned) | ✗ | ✅ |
| Scheme contacts — view and edit | ✗ | ✅ |
| Requests & history (counts, overdue banner) | ✗ | ✅ |
| Upload own codes (online route) | ✗ | ✅ |
| Full code list, incl. unredeemed strings | ✗ | ✅ |
| CSV export | ✗ | ✅ |
| Club's slice of the audit trail | ✗ | ✅ |
| See / rotate the till PIN (in-store) | ✗ | ✅ |
| Print their own till card (in-store) | ✗ | ✅ |

The reason is not tidiness. **The PIN is printed on the till card, next to a QR
code, at a public kiosk** — realistically semi-public. It must not also be the
credential that lets someone upload codes and tick three undertakings binding
the club to £50 a code. Redemption and undertaking-giving are different risks
and now need different secrets. A badge in the header says which door you came
in by, and the till card still prints **only** the PIN.

Till mode deliberately never prints unredeemed code strings (a screen facing a
queue); club admin does, because it's the club's own stock list on a laptop.

## The credentials are real now (v4.0)

Until v4.0 every credential here was compared **in the browser** against
`app-data/uw-promo/config`, and that node was world-readable. Anyone who
opened the database URL could read all 72 till PINs. The gate was a courtesy,
not a control, and the README said so.

That is fixed. `functions/uw-promo.js` (`uwPromoAuth`) validates the PIN or
passcode with the Admin SDK and returns a Firebase custom token carrying a
claim; `config` is now readable only by a minted **master** token. Third
instance of the shape `programme.js` and `club-directory.js` already use.

| Claim | Who |
|---|---|
| `uwRole: 'till'`, `uwClub: <CODE>` | club staff — redeem + check |
| `uwRole: 'manager'`, `uwClub: <CODE>` | club admin |
| `uwRole: 'uw'` | Utility Warehouse |
| `uwRole: 'master'` | NL master console |

**It has to be an RTDB trigger, not a callable.** The project carries an org
policy blocking `allUsers` on new Cloud Run services, so a callable cannot be
given a public invoker, and club staff have no Google account. `programme.js`
hit this on 03/08/2026 and footage on 13/07/2026 — both wrote it down, which
is why this took an afternoon rather than a day.

**Cost:** Eventarc delivery is seconds, not milliseconds, so the gate now
shows "Checking…" for a beat. Acceptable on a gate; it is why footage rejected
the same path for video previews.

**Throttling — and the one thing we can do that `programme` cannot.** A
trigger sees no source IP and anonymous uids are free, so per-uid counting is
weak and a global ceiling is what really bounds a distributed guess. Both are
kept. But a 4-digit PIN is a 9,000-wide space where programme's is 31⁶ ≈ 887M,
and a global-only limit would not hold it. What saves it is that our `?c=`
token names the club *before* the PIN is compared — programme has no
equivalent, since its passcode alone identifies the club. So failures are also
counted **per club**: 10 an hour puts a full sweep of one club's PIN space at
~900 hours and locks out only that club. That is what lets the PIN stay short
enough to type at a till.

Remaining honest limits: `codes` and `audit` are readable by *any* minted
session, because the till has to be able to say "that one is registered to
Hartlepool", which needs a lookup across all of them. So a club can, with
effort, read the code list. That is a much smaller exposure than before —
it now requires a valid credential rather than just the URL — but it is not
nothing, and closing it properly would mean a server-side lookup endpoint.

Club PINs never start with `0` — a leading zero survives neither the access
CSV (Excel reads `0123` as `123`) nor a hurried retype. They stay unique
across the 72 clubs, enforced at generation, so the roster and printed cards
are unambiguous. A till PIN only signs in from the club's own `?c=` link
(ruling 10/09/2026) — the linkless door is manager passcodes only, and a
valid PIN typed without a link fails exactly like a wrong one.

Credential rotation is **per club** (ruling 10/09/2026 — the roster-wide
reissue buttons are gone): the refresh glyph beside a club's PIN, manager
passcode or link rotates that one immediately. Rotating a PIN or link means
reprinting that club's till card.

## Clubs uploading their own codes

Only **inside a request** (owner ruling 10/09/2026): each placeholder row
carries the red Upload button, and the form renders **one input box per
code still owed** — a request for 5 with 2 supplied shows 3 boxes.
Part-filling is fine; overshooting is impossible. The three undertakings
(work in the club's own system, the agreed value, valid 12+ months) must be
ticked, then a confirm restates them; the audit entry names the club, the
count, the request answered and each undertaking, and the trail is
append-only. Codes are checked against the whole system one indexed
lookup at a time before anything is written — a clash writes nothing and
is named. Codes uploaded together share one server timestamp: the date
stamp is the grouping (there are no batches or labels anywhere).

## Till cards

One A4 card per club: club crest and UW wordmark side by side, a QR of the
club's direct link, the till PIN and the steps. Print-to-PDF from the master
console gives the 72-page hand-out pack, or a single club from the per-row
**Card** button.

**A club can also print its own**, from the club admin view, next to the PIN.
The card is built at print time from the live club record, so printing right
after a PIN rotation gives a card carrying the new PIN — which is the whole
point of pairing the two in one section.

There is exactly one implementation (`UWP.tillCardHtml` / `UWP.printCards`,
styles in `_shared.css`) precisely because two pages print these now: a
club-printed card and an NL-printed one must be the same card. QR encoding is
local (`qrcode.vendor.js`) so club link tokens never reach a third-party QR
image API.

The "hide everything except the cards" print rule is scoped to a class that
`printCards` sets for the duration of the dialog. The stylesheet is shared by
all three pages, so without that scope an ordinary Ctrl+P anywhere in the
family would print a blank sheet.

## Checking a code without redeeming it

Behind the **manager door**, and only where a till lives — in-store
clubs, or a club whose central codes are still in the wild. A pure online
club has no till and no contested codes, so no checker (owner N5).
Note the pairing with N9: the dashboard never *lists* unredeemed central
strings, while the checker requires already *having* one code in hand —
opposite directions, deliberately. The till's refusal
screen is deliberately neutral so till staff can't adjudicate a contested
code — a detailed lookup sitting next to it would hand the detail straight
back. Managers get the full story: genuine or not, which club it belongs to,
whether/when it was redeemed, and now whether it has expired — without
changing anything.

Two guards. **10 lookups an hour per browser** (`UWP.rateLimit`, sliding
window in `localStorage`), and **every check is written to the audit trail**
with the club's name on it, visible under the `check` action in the master
console. The rate limit is client-side and so defeatable by clearing storage;
it is there to make fishing for live codes by hand tedious. The audit entry is
the guard that actually bites — and note that the underlying RTDB data is
world-readable by design (same trust level as the passcodes themselves), so
neither guard is a cryptographic control.

The club's own unredeemed codes are **counted** on the till page but never
listed, so nobody can read a live code off the screen and redeem it without a
customer in front of them. That is a shoulder-surfing measure, not a
containment one: the query that feeds the count returns the records, so they
are in the browser, and the RTDB path is world-readable anyway. Treat it as
"not on display", not "not obtainable".

## Data (RTDB `app-data/uw-promo/`)

```
config/
  master            { passcode, updatedAt }                        # 6-char alphanumeric
  uw                { label, passcode, token, updatedAt }          # 6-char alphanumeric
  support           { email, notify, updatedAt }   # seeded out-of-band (no console editor) — fan support address +
                                                   # upload-alert recipients.
                                                   # In RTDB, never in git
  clubs/<CODE>      { name, division, passcode, managerPass, token,
                      route: unassigned|instore|online, addedAt }
                                                                   # passcode   = 4-digit till PIN
                                                                   # managerPass = club admin view
                                                                   # CODE = clubs-meta 3-letter code
codes/<pushId>      { code, norm, status: active|redeemed|revoked,
                      club, clubName,                              # set at CREATION — the one club
                                                                   # this code can be redeemed at.
                                                                   # Absent on pre-v3.0 codes only
                      request?,                                    # id of the request an upload
                                                                   # answers — drives the derived
                                                                   # request ladder
                      createdAt,                                   # identical across one add —
                                                                   # the date stamp IS the group
                                                                   # (batch/batchLabel retired
                                                                   # 09/09/2026; old codes still
                                                                   # carry them, ignored)
                      createdBy: uw|master|club:<CODE>,            # club = self-upload
                      dispatchedAt?, dispatchedBy?,                # v43 — set by the UW bulk
                                                                   # dispatch flow; drives the
                                                                   # Issued/Dispatched faces
                      redeemedAt?, redeemedBy?,                    # redeemedBy: club:<CODE>|master
                      releasedAt?, releasedBy?, releaseReason?, releasedFrom?,
                      revokedAt?, revokedBy? }
requests/<pushId>   { club, clubName, qty, due, status: 'open',
                      raisedAt, raisedBy: uw|master }              # NL/UW write, any session
                                                                   # reads. Waiting/overdue/
                                                                   # fulfilled/dispatched are all
                                                                   # DERIVED (UWP.reqFace) — the
                                                                   # stored status never changes
contacts/<CODE>     [ { name, role, email, addedAt } ]             # v43 scheme contacts —
                                                                   # personal data, RTDB only,
                                                                   # club manager + NL/UW write
audit/<pushId>      { ts (server), actor: master|uw|club:<CODE>, actorLabel,
                      action: add-codes|redeem|check|release|revoke|register|
                              delete|seed-clubs|regen-passcode|regen-link|
                              bootstrap|route|support|request|dispatch|contact,
                      club?, clubName?, count?, request?, codes?, detail? }
```

No rules change: `club` was already an indexed field on `codes`, and `check` /
`register` are just new values in the audit `action` string.

Rules (in `system/rtdb/rules.snapshot.json`): since v4.0 `config` is
readable/writable only by a minted **master** token (with a deeper NL/UW
grant on each club's `route` for the v43 reversal flow); `codes` and `audit`
need any minted session; `requests` are written by NL/UW and readable by any
session; `contacts/<CODE>` is readable/writable by that club's manager and
NL/UW. The **audit trail is append-only** (`!data.exists()`) —
it cannot be edited or pruned from any of these pages, master included.
Codes can be **hard-deleted from the master console only** (typed `DELETE`
confirm, audited as `delete`); the UW panel has no delete. With anonymous
auth the rules can't distinguish the panels, so master-only is UI-enforced —
the same trust level as the passcodes themselves — and every deletion still
leaves its audit entry.

## Access / auth model

Identical to the retired `/footage/club/` (see `system/retired/nl-cup-footage.md`): a
**named Firebase app** (`nlUwPromo`,
in `_shared.js`) signs in **anonymously** for reads/writes so it can't clobber
a portal (superadmin) login open in another tab. Master/UW passcodes and
tokens are generated with an unambiguous alphabet (no 0/O/1/I/L); club PINs
are digits. All are checked client-side against `config/` — trust-level
gating ("assigned passwords are kept safe"), not cryptographic authorisation.
A leaked PIN, passcode, link or printed QR is fixed by regenerating it in the
master console, which kills the old one instantly.

A 4-digit PIN is a weaker secret than the 6-character passcode it replaces —
that is a deliberate trade for something a till hand can type on a phone,
and it is the *second* factor on the ordinary path: the club link identifies
the club, the PIN opens the till. It is worth having only because of what
sits behind it: a code stolen this way can still only be redeemed at the one
club it is registered to, and every redemption and check is audited.

The 72 club links are stable URLs — point a QR code at each club's link. As
of v2.1 the link only **identifies** the club (crest-branded gate): the club
PIN is required on **every visit** before the till opens, so a QR on public
display at the point of sale doesn't hand the till to anyone who scans it.

## Testing / simulation

Two layers:

1. **Unit tests** — `tests/uw-promo.test.mjs` (zero-dependency `node:test`,
   runs with `npm test` and in the canon-checks CI on any `tests/**` change).
   Covers code normalisation, generation (6-character shape, uniqueness,
   alphabet, collisions), PIN generation (4 digits, no leading zero,
   uniqueness across a full roster), the `UWP.redeemTxn` state machine
   (**refuses a code registered to another club**, redeems one registered to
   this club, still locks a pre-v3.0 code to whoever redeems it, aborts on
   redeemed/revoked, null-retry passthrough) and `UWP.rateLimit` (allows
   exactly N, sliding window, per-key budgets, fails open on corrupt state).
   The transaction updater is a pure function in `_shared.js` precisely so
   this is testable.
2. **Sandbox mode** — append **`?env=test`** to any of the three pages and
   the whole family runs against `app-data/uw-promo-test` instead of live
   data, with an amber TEST MODE badge. Direct links generated in test mode
   carry the flag, so sandbox club links/QRs stay in the sandbox. Walkthrough:
   open `/admin/?env=test` → bootstrap a sandbox master passcode → seed clubs
   → create UW access → open the sandbox UW link, add codes **for one club**
   → open that club's link, redeem one at the "till" → try the same code at a
   **second** club and watch it be refused by name → check a code from the
   foot of the till page → watch it all appear in the UW/admin panels →
   release/revoke it. **Reset sandbox** (Clubs & access
   tab, test mode only) wipes the sandbox clean; sandbox rules allow deletes,
   live rules don't.

## Go-live checklist (browser only — nothing needs a terminal)

1. **Deploy RTDB rules** — Actions → *Deploy RTDB rules* → type `publish`.
   The workflow ships `system/rtdb/rules.snapshot.json`; nothing is ever
   pasted into the Firebase console.
2. **Anonymous auth** must be enabled (Authentication → Sign-in method).
   The footage pages use it too, so it may already be on — verify, don't assume.
3. Dry-run the whole flow in **sandbox mode** (above).
4. Open `/uw-promo/admin/` → first-run screen → set the master passcode.
5. Clubs & access tab → **Seed clubs from roster** → **Create UW access**.
   Already seeded before v3.0? A note above the table counts clubs still on
   6-character passcodes — the refresh glyph beside each PIN converts one to
   a 4-digit PIN; reprint that club's till card after.
6. Send Utility Warehouse their link/passcode; generate club QR codes from
   the **Export access CSV** links (treat the CSV as a password list).
7. Set the **Voucher value** on Clubs & access if it differs from £50 —
   clubs read it from their next sign-in.

No `tools/<toolKey>` registry record and no portal card — this family is
intentionally outside the gated suite (external users have no portal logins).

## Files

- `_shared.js` — named app + anon auth, env/sandbox switch, generators,
  `redeemTxn`, `rateLimit`, `tillCardHtml`/`printCards`, audit writer, `UWP.*`
- `_shared.css` — gate card, context header bar, code widgets, till-card print
  styles, test banner (all brand tokens)
- `index.html` (UW) / `club/index.html` (till) / `admin/index.html` (master)
- `qrcode.vendor.js` — vendored QR encoder (MIT, qrcode-generator@1.4.4);
  local so club link tokens are never sent to a third-party QR image API
- `../tests/uw-promo.test.mjs` — unit tests

The UW page and till cards show `assets/partners/Utility Warehouse.png`
(dashboard falls back to the NL rose; cards hide the lockup if it fails).

Canon note: the passcode-gate card + context header bar now exist in both the
footage family and here — a candidate for promotion to `nl-brand.css` /
`nl-utils.js` as a shared "standalone external page" component if a third
family appears.
