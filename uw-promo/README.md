# UW Promo Codes

Management of Utility Warehouse promo codes allocated to the 72 current
National League clubs. Three standalone pages on the **footage-CDN access
model** (trust-level passcodes + direct links, NO auth-guard/portal login),
with a full audit trail.

| Page | Who | Gets in via | Can do |
|---|---|---|---|
| `/tools/uw-promo/` | **Utility Warehouse** (one shared login) | shared passcode or `?u=<token>` direct link | Allocate codes to a club (generate straight to the club: club-prefix / UW-prefix / custom prefix, or paste a supplied list, max 500 per allocation), revoke **unredeemed** codes, see every code + status (unredeemed / redeemed / revoked), filter by club/status, search, CSV export |
| `/tools/uw-promo/club/` | **Each of the 72 clubs** | own passcode or own `?c=<token>` direct link (one page, per-club credentials — the link *is* the club's own route in) | See only their codes; mark redeemed (confirm dialog); undo a redeem (**required reason**, recorded); copy codes; redeemed/unredeemed filter. Revoked codes shown greyed for transparency |
| `/tools/uw-promo/admin/` | **NL master (Richard)** | master passcode only (no direct link, deliberately) | Everything UW can do, plus: redeem/un-redeem on behalf of a club, revoke **redeemed** codes (typed `REVOKE` confirm), seed/sync the 72-club roster from clubs-meta, manage every passcode + direct link (view / copy / regenerate), access CSV, full audit-trail viewer + export |

## Status model

`active` (shown as **Unredeemed**) → `redeemed` → (either way) `revoked`.

- UW can only revoke **unredeemed** codes; once a club has redeemed, only the
  master console can revoke (behind a typed confirm).
- Un-redeeming always requires a reason, stored on the code
  (`unredeemReason`) and in the audit trail.
- "Processed" currently *means* redeemed. If UW later adds their own
  processing step (e.g. dividend paid out to the club), add a `processed`
  status/flag alongside `redeemed` — the data model deliberately leaves room.

## Data (RTDB `app-data/uw-promo/`)

```
config/
  master            { passcode, updatedAt }
  uw                { label, passcode, token, updatedAt }
  clubs/<CODE>      { name, division, passcode, token, addedAt }   # CODE = clubs-meta 3-letter code
codes/<pushId>      { code, club, clubName, status: active|redeemed|revoked,
                      batch, createdAt, createdBy: uw|master,
                      redeemedAt?, redeemedBy?,                    # redeemedBy: club:<CODE>|uw|master
                      unredeemedAt?, unredeemedBy?, unredeemReason?,
                      revokedAt?, revokedBy? }
audit/<pushId>      { ts (server), actor: master|uw|club:<CODE>, actorLabel,
                      action: allocate|revoke|redeem|unredeem|seed-clubs|
                              regen-passcode|regen-link|bootstrap,
                      club?, clubName?, count?, batch?, codes?, detail? }
```

Rules (in `system/rtdb/rules.snapshot.json`): public read (same trust level as
`media-footage/data` — passcodes are validated client-side), writes require
(anonymous) auth, **codes can never be hard-deleted** (`newData.exists()` —
revoke is the only removal), and the **audit trail is append-only**
(`!data.exists()`). Deliberate consequence: the audit trail cannot be edited
or pruned from any of these pages, including the master console.

## Access / auth model

Identical to `/tools/footage/club/`: a **named Firebase app** (`nlUwPromo`,
in `_shared.js`) signs in **anonymously** for reads/writes so it can't clobber
a portal (superadmin) login open in another tab. Passcodes/tokens are
generated with an unambiguous alphabet (no 0/O/1/I/L) and checked client-side
against `config/` — this is trust-level gating (the security stance is
"assigned passwords are kept safe", per the owner), not cryptographic
authorisation. A leaked passcode or link is fixed by regenerating it in the
master console, which kills the old one instantly.

Sessions: UW and club pages rewrite the URL to their token link after a
correct passcode (refresh keeps working); the master console caches its
passcode in `sessionStorage` only.

## Go-live checklist (all Firebase console — repo carries snapshots only)

1. **Deploy RTDB rules** — paste the whole of
   `system/rtdb/rules.snapshot.json` into Firebase console → Realtime
   Database → Rules.
2. **Anonymous auth** must be enabled (Authentication → Sign-in method).
   The footage pages use it too, so it may already be on — verify, don't assume.
3. Open `/tools/uw-promo/admin/` → **first-run screen** → set the master
   passcode.
4. Clubs & access tab → **Seed clubs from roster** (creates the 72 clubs, each
   with a passcode + direct link) → **Create UW access**.
5. Send Utility Warehouse their link/passcode; send clubs theirs (Export
   access CSV gives the full hand-out list — treat it as a password list).

No `tools/<toolKey>` registry record and no portal card — this family is
intentionally outside the gated suite (external users have no portal logins).

## Files

- `_shared.js` — named app + anon auth, generators, audit writer, `UWP.*`
- `_shared.css` — gate card, context header bar, code-table bits (all brand tokens)
- `index.html` / `club/index.html` / `admin/index.html` — the three pages

Canon note: the passcode-gate card + context header bar now exist in both the
footage family and here — a candidate for promotion to `nl-brand.css` /
`nl-utils.js` as a shared "standalone external page" component if a third
family appears.
