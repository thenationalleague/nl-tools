# UW Promo Codes

Utility Warehouse promo codes for the 72 current National League clubs.
**Pool model**: UW puts codes into a central pool and issues them to
*customers*; a club claims a code by redeeming it at the till. Three
standalone pages on the **footage-CDN access model** (trust-level passcodes +
direct links, NO auth-guard/portal login), with a full audit trail.

| Page | Who | Gets in via | Can do |
|---|---|---|---|
| `/uw-promo/` | **Utility Warehouse** (one shared login) | shared passcode or `?u=<token>` direct link | Add codes to the pool (generate 8-character `XXXX-XXXX`, or paste their own list; optional batch label; ≤500/batch), revoke **unredeemed** codes, release a redeemed code back to the pool (required reason), see every code + which club redeemed it and when, redemptions-by-club breakdown, filters, search, CSV export |
| `/uw-promo/club/` | **Each of the 72 clubs** | own `?c=<token>` direct link (the QR-code target for the point of sale) **plus their passcode on every visit**; passcode alone also works without the link | **Till page**: big code entry → a valid unredeemed code locks to this club (RTDB transaction — two tills can't claim the same code) and joins the club's redeemed list on the same page. Already-redeemed entry shows **which club and the exact date/time**. Revoked → "no longer valid". Clubs cannot undo — the page points them at NL |
| `/uw-promo/admin/` | **NL master (Richard)** | master passcode only (no direct link, deliberately; first-run bootstrap sets it) | Everything UW can do, plus: redeem on behalf of a club (club picker, same race-safe transaction), revoke **redeemed** codes (typed `REVOKE`), seed/sync the roster from clubs-meta, the **list of all 72 club URLs + passcodes** (copy per club, regenerate, export access CSV), **Print till cards** (one A4 card per club: crest, QR of the club link, passcode + the four till steps — print-to-PDF gives the 72-page hand-out pack), audit viewer + export, sandbox reset (test mode) |

## Status model

`active` (shown as **Unredeemed**, sitting in the open pool) →
`redeemed` (locked to the club that entered it) → back to `active` only via a
**release** by NL/UW (required reason, recorded). `revoked` ends a code either
way (UW: unredeemed only; NL master: redeemed too, behind a typed confirm).

Codes are matched on a stored, indexed `norm` field (uppercase, alphanumerics
only) so a till entry matches however it's typed — `7f3k 9c2m` finds `7F3K-9C2M`.

## Data (RTDB `app-data/uw-promo/`)

```
config/
  master            { passcode, updatedAt }
  uw                { label, passcode, token, updatedAt }
  clubs/<CODE>      { name, division, passcode, token, addedAt }   # CODE = clubs-meta 3-letter code
codes/<pushId>      { code, norm, status: active|redeemed|revoked,
                      batch, batchLabel?, createdAt, createdBy: uw|master,
                      club?, clubName?,                            # set when redeemed (locked-to club)
                      redeemedAt?, redeemedBy?,                    # redeemedBy: club:<CODE>|master
                      releasedAt?, releasedBy?, releaseReason?, releasedFrom?,
                      revokedAt?, revokedBy? }
audit/<pushId>      { ts (server), actor: master|uw|club:<CODE>, actorLabel,
                      action: add-codes|redeem|release|revoke|seed-clubs|
                              regen-passcode|regen-link|bootstrap,
                      club?, clubName?, count?, batch?, codes?, detail? }
```

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
a portal (superadmin) login open in another tab. Passcodes/tokens are
generated with an unambiguous alphabet (no 0/O/1/I/L) and checked client-side
against `config/` — trust-level gating ("assigned passwords are kept safe"),
not cryptographic authorisation. A leaked passcode, link or printed QR is
fixed by regenerating it in the master console, which kills the old one
instantly.

The 72 club links are stable URLs — point a QR code at each club's link. As
of v2.1 the link only **identifies** the club (crest-branded gate): the club
passcode is required on **every visit** before the till opens, so a QR on
public display at the point of sale doesn't hand the till to anyone who
scans it.

## Testing / simulation

Two layers:

1. **Unit tests** — `tests/uw-promo.test.mjs` (zero-dependency `node:test`,
   runs with `npm test` and in the canon-checks CI on any `tests/**` change).
   Covers code normalisation, generation (uniqueness/alphabet/collisions) and
   the `UWP.redeemTxn` state machine (lock-to-club, abort on
   redeemed/revoked, null-retry passthrough) — the transaction updater is a
   pure function in `_shared.js` precisely so this is testable.
2. **Sandbox mode** — append **`?env=test`** to any of the three pages and
   the whole family runs against `app-data/uw-promo-test` instead of live
   data, with an amber TEST MODE badge. Direct links generated in test mode
   carry the flag, so sandbox club links/QRs stay in the sandbox. Walkthrough:
   open `/admin/?env=test` → bootstrap a sandbox master passcode → seed clubs
   → create UW access → open the sandbox UW link, add codes → open a sandbox
   club link, redeem one at the "till" → watch it appear against the club in
   the UW/admin panels → release/revoke it. **Reset sandbox** (Clubs & access
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
6. Send Utility Warehouse their link/passcode; generate club QR codes from
   the **Export access CSV** links (treat the CSV as a password list).

No `tools/<toolKey>` registry record and no portal card — this family is
intentionally outside the gated suite (external users have no portal logins).

## Files

- `_shared.js` — named app + anon auth, env/sandbox switch, generators,
  `redeemTxn`, audit writer, `UWP.*`
- `_shared.css` — gate card, context header bar, code widgets, test banner (all brand tokens)
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
