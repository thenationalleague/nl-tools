# UW Promo Codes

Utility Warehouse promo codes for the 72 current National League clubs.
**Registered-to-a-club model** (v3.0): every code is created against exactly
one club and can only ever be redeemed there. UW issues codes to *customers*;
a customer redeems one at the club it belongs to. Three standalone pages on
the **footage-CDN access model** (trust-level PINs/passcodes + direct links,
NO auth-guard/portal login), with a full audit trail.

| Page | Who | Gets in via | Can do |
|---|---|---|---|
| `/uw-promo/` | **Utility Warehouse** (one shared login) | shared 6-character passcode or `?u=<token>` direct link | Add codes **for one club at a time** (club dropdown required; paste a list — the default — or generate plain 6-character codes; optional batch label; ≤500/batch), revoke **unredeemed** codes, release a redeemed code (required reason), see every code with the club it belongs to, redeemed-by-club breakdown, filters, search, CSV export. The big count cards follow the club filter |
| `/uw-promo/club/` | **Each of the 72 clubs** | own `?c=<token>` direct link (the QR-code target for the point of sale) **plus a credential on every visit** — the 4-digit till PIN, or the club's manager passcode for the admin view; either alone also works without the link | **Till page**: big code entry → a valid unredeemed code *registered to this club* is redeemed here (RTDB transaction — two tills can't claim the same code) and joins the club's redeemed list. A code registered elsewhere is refused by name. Already-redeemed entry shows **which club and the exact date/time**. Revoked → "no longer valid". Clubs cannot undo — the page points them at NL. Below that: **Check a code** (read-only lookup, 10 an hour, audited). On the manager passcode only: **upload your own codes**, full code list, CSV export, the club's audit slice, and till-PIN self-service — see *Two doors, one page* |
| `/uw-promo/admin/` | **NL master (Richard)** | master passcode only (no direct link, deliberately; first-run bootstrap sets it) | Everything UW can do, plus: redeem on behalf of a club (the club it is registered to, same race-safe transaction), **register** a pre-v3.0 code to a club, revoke **redeemed** codes (typed `REVOKE`), seed/sync the roster from clubs-meta, the **list of all 72 club URLs, PINs and manager passcodes** (copy/regenerate each, **Reissue all club PINs**, **Issue missing manager passcodes**, export access CSV), **Print till cards** (one A4 card per club: crest, QR of the club link, PIN + the till steps — print-to-PDF gives the 72-page hand-out pack), audit viewer + export, sandbox reset (test mode) |

## Which club a code belongs to

Chosen from a required dropdown when the codes are created, **one club per
batch** — 25 for Hartlepool, then 25 for Sutton, never both at once. There is
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

**Codes created before v3.0 belong to no club** and stay redeemable anywhere,
which is the old pool behaviour. Filter to *Not yet registered to a club* in
either panel to find them; the master console's per-row **Register…** puts
each one right without losing its batch history.

## Status model

`active` (shown as **Unredeemed** — issued to the club, not yet used) →
`redeemed` (used at that club) → back to `active` only via a **release** by
NL/UW (required reason, recorded; the club registration is kept). `revoked`
ends a code either way (UW: unredeemed only; NL master: redeemed too, behind
a typed confirm).

Codes are matched on a stored, indexed `norm` field (uppercase, alphanumerics
only) so a till entry matches however it's typed — `7f3 k9c` finds `7F3K9C`,
and a UW-supplied code keeps whatever punctuation it arrived with. Generated
codes are 6 plain characters with no hyphen; the till entry box is free text
(64 characters) because UW's own codes are whatever length they are.

## Credentials

| Who | Credential | Why |
|---|---|---|
| NL master | 6-character alphanumeric passcode | Typed once, on a laptop, by one person |
| Utility Warehouse | 6-character alphanumeric passcode | Same |
| Each club — till | **4-digit numeric PIN** | Typed on a phone, at a till, by whoever is on shift |
| Each club — admin | 6-character **manager passcode** | Named contact, on a laptop. Never printed |

## Two doors, one page

`/uw-promo/club/` serves two jobs with two credentials on the same URL and the
same QR:

| | **Till mode** (4-digit PIN) | **Club admin** (manager passcode) |
|---|---|---|
| Redeem a code | ✅ | ✅ |
| Check a code | ✅ | ✅ |
| Redeemed list + counts | ✅ | ✅ |
| Upload own codes | ✗ | ✅ |
| Full code list, incl. unredeemed strings | ✗ | ✅ |
| CSV export | ✗ | ✅ |
| Club's slice of the audit trail | ✗ | ✅ |
| See / rotate the till PIN | ✗ | ✅ |
| Print their own till card | ✗ | ✅ |

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
CSV (Excel reads `0123` as `123`) nor a hurried retype. They are also unique
across the 72 clubs, enforced at generation: a club signing in on its PIN
alone is resolved *by* that PIN, so a duplicate would open the wrong club's
till. If an ambiguous PIN ever does reach the till page it opens nothing
rather than guessing.

**Reissue all club PINs** and **Reissue all manager passcodes** (Clubs &
access) each rotate the whole roster in one go — the second is what you reach
for when a credential has to be treated as burned rather than merely rotated.
The PIN one also converts the roster in one
go — that is the migration from the old 6-character club passcodes. It
invalidates every club's current credential immediately, so the till cards
have to be reprinted and resent.

## Clubs uploading their own codes

In the club admin view (manager passcode — **not** the till PIN). A club pastes its own
codes, optionally labels the batch, and they go live immediately — registered
to that club, because a club can only ever upload its own. There is no club
to choose and therefore nothing to get wrong.

Three undertakings must be ticked, then a second confirm dialog restates them:

1. The codes **work in that club's own till system** — the club is responsible
   for that; neither NL nor UW can test them.
2. Each code applies the **agreed £50 discount**.
3. The codes stay valid for **at least 12 months** from upload.

**Expiry is an undertaking, not a field.** Nothing stores an expiry date and
nothing enforces one at the till — the club commits to 12 months and that
commitment is what we keep. The record lives in the audit trail: the entry
names the club, the batch, the count and each undertaking, and the trail is
append-only, so not even the master console can alter it afterwards. That is
deliberately stronger evidence than a flag on the code would be.

Uploaded codes are checked against the **whole** system before anything is
written — one indexed `norm` lookup per code, ten at a time. The obvious
alternative (read the `codes` node once, build a local set) would put every
other club's codes in that club's browser, which is exactly what a club must
not have. The lookups are the reason for the **200-per-upload cap**; if a
clash is found, nothing at all is written and the clashing codes are named.

In the NL and UW panels these appear with **Club** in the "By" column
(`createdBy` is `club:<CODE>`), so a club-supplied batch is always
distinguishable from a UW or NL one.

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

At the foot of the club till page. Says whether a code is genuine, which club
it belongs to, and whether/when it was redeemed — without changing anything.

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
  clubs/<CODE>      { name, division, passcode, managerPass, token, addedAt }
                                                                   # passcode   = 4-digit till PIN
                                                                   # managerPass = club admin view
                                                                   # CODE = clubs-meta 3-letter code
codes/<pushId>      { code, norm, status: active|redeemed|revoked,
                      club, clubName,                              # set at CREATION — the one club
                                                                   # this code can be redeemed at.
                                                                   # Absent on pre-v3.0 codes only
                      batch, batchLabel?, createdAt,
                      createdBy: uw|master|club:<CODE>,            # club = self-upload
                      redeemedAt?, redeemedBy?,                    # redeemedBy: club:<CODE>|master
                      releasedAt?, releasedBy?, releaseReason?, releasedFrom?,
                      revokedAt?, revokedBy? }
audit/<pushId>      { ts (server), actor: master|uw|club:<CODE>, actorLabel,
                      action: add-codes|redeem|check|release|revoke|register|
                              delete|seed-clubs|regen-passcode|regen-link|
                              bootstrap,
                      club?, clubName?, count?, batch?, codes?, detail? }
```

No rules change: `club` was already an indexed field on `codes`, and `check` /
`register` are just new values in the audit `action` string.

Rules (in `system/rtdb/rules.snapshot.json`): public read (same trust level as
`media-footage/data` — passcodes are validated client-side), writes require
(anonymous) auth, and the **audit trail is append-only** (`!data.exists()`) —
it cannot be edited or pruned from any of these pages, master included.
Codes can be **hard-deleted from the master console only** (typed `DELETE`
confirm, audited as `delete`); the UW panel has no delete. With anonymous
auth the rules can't distinguish the panels, so master-only is UI-enforced —
the same trust level as the passcodes themselves — and every deletion still
leaves its audit entry.

## Access / auth model

Identical to `/footage/club/`: a **named Firebase app** (`nlUwPromo`,
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

## Go-live checklist (all Firebase console — repo carries snapshots only)

1. **Deploy RTDB rules** — paste the whole of
   `system/rtdb/rules.snapshot.json` into Firebase console → Realtime
   Database → Rules.
2. **Anonymous auth** must be enabled (Authentication → Sign-in method).
   The footage pages use it too, so it may already be on — verify, don't assume.
3. Dry-run the whole flow in **sandbox mode** (above).
4. Open `/uw-promo/admin/` → first-run screen → set the master passcode.
5. Clubs & access tab → **Seed clubs from roster** → **Create UW access**.
   Already seeded before v3.0? **Reissue all club PINs** converts the roster
   from 6-character passcodes to 4-digit PINs, then reprint the till cards.
6. Send Utility Warehouse their link/passcode; generate club QR codes from
   the **Export access CSV** links (treat the CSV as a password list).
7. Any codes already in the system from before v3.0 belong to no club: filter
   to *Not yet registered to a club* and **Register…** each one, or delete
   them if they were only ever tests.

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
