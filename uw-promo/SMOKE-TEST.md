# UW Promo Codes — three-person smoke test

A scripted end-to-end demonstration and acceptance test of the promo-code
system, run with Utility Warehouse on the call. Every feature is exercised at
least once; each test states who acts, what they do, and exactly what everyone
should see. Tick Pass/Fail as you go — anything failed gets a note and the
demo continues.

| | |
|---|---|
| **Environment** | Sandbox — every URL carries `?env=test` (amber TEST MODE badge). Identical code to live, disposable data. Nothing in this session touches live data or credentials. |
| **Duration** | ~35 minutes |
| **R** — Richard | NL master. Laptop, screen-sharing. Console: `https://thenationalleague.github.io/tools/uw-promo/admin/?env=test` |
| **U** — UW rep | Partner dashboard. Own laptop, screen-shares in Phases B and E. Link/passcode arrive via meeting chat in B1. |
| **N** — Nick | Club staff, playing **two different clubs**. Needs a **phone** (Club 1) **and** a laptop or second browser tab (Club 2). Credentials arrive via meeting chat in A4. |

**Credential handling:** everything is passed in the meeting chat; all sandbox
credentials are destroyed by the reset in Phase I, so there is no cleanup.

---

## Phase P — pre-call prep (R, ~5 min, before the meeting)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| P1 | Open the sandbox console. If old test data exists: Clubs & access → **Reset sandbox** → type `RESET` | Page reloads to the first-run screen | ☐ |
| P2 | Set a sandbox master passcode (6 chars, twice) | Console opens; Codes tab shows an empty pool | ☐ |
| P3 | Refresh the page | Passcode is demanded again before the console opens | ☐ |

Stop here — leave clubs unseeded so the call opens with A1.

---

## Phase A — NL sets the table (R, ~3 min)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| A1 | Clubs & access → **Seed clubs from roster** → confirm | "72 clubs added"; full table with crests, divisions, passcodes | ☐ |
| A2 | **Create UW access** | UW passcode chip + Copy direct link / New passcode / New link buttons appear | ☐ |
| A3 | Tap the UW passcode chip, then **Copy direct link**; paste both into meeting chat | "UW passcode copied" / "UW direct link copied" toasts; both land in chat | ☐ |
| A4 | For two clubs of Nick's choice: tap passcode chip + **Copy direct link**; paste all four items into chat labelled Club 1 / Club 2 | Both clubs' credentials in chat | ☐ |

---

## Phase B — UW logs in and loads codes (U, ~7 min, U screen-shares)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| B1 | Open the UW **direct link** from chat | UW wordmark + passcode gate — link alone does not open the dashboard | ☐ |
| B2 | Enter a **wrong** passcode | "Passcode not recognised" | ☐ |
| B3 | Enter the correct passcode | Dashboard opens: stats all zero, empty pool | ☐ |
| B4 | **Add codes** → generate **25**, batch label `Demo day` → confirm | 25 codes in `XXXX-XXXX` format listed; **Copy all** → paste into meeting chat | ☐ |
| B5 | **Add codes** → *Paste a list* → three made-up codes (e.g. `SUMMER-01`, `SUMMER-02`, `SUMMER-03`), batch label `UW supplied` | All three accepted into the pool alongside the generated ones | ☐ |
| B6 | Re-paste one of those same codes as a new batch | Rejected: "Already in the system" | ☐ |
| B7 | Filter Status → Unredeemed; search for one specific code | Table narrows correctly both times | ☐ |
| B8 | **Export CSV** | File downloads; codes carry their dashes; Status/Redeemed-at columns present | ☐ |

---

## Phase C — the till, Club 1 (N, ~5 min, on the phone)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| C1 | Open Club 1's direct link on the phone (this simulates scanning the printed QR) | **Crest-branded gate for Club 1** — not a working till | ☐ |
| C2 | Enter a wrong passcode | Rejected | ☐ |
| C3 | Enter Club 1's passcode | Till opens: UW wordmark, big entry box, empty "Redeemed at your club" list | ☐ |
| C4 | Type a `Demo day` code **sloppily** — lowercase, no dash | Input auto-uppercases and inserts the dash as typed | ☐ |
| C5 | Press **REDEEM** | ✅ dialog naming the code + Club 1, with the "apply the relevant discount on your club system" note; code appears in the club's redeemed list | ☐ |
| C6 | Enter the **same code** again → REDEEM | ❌ "already redeemed **at** [Club 1] on [today's date/time]" | ☐ |
| C7 | Everyone checks U's screen (no refresh) | The redemption shows: Redeemed at = Club 1, timestamp; "Redemptions by club" counts 1 | ☐ |

---

## Phase D — the race (N on both devices, ~3 min)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| D1 | N signs into **Club 2** on the laptop (direct link + passcode from chat) | Second till open under a different crest | ☐ |
| D2 | R reads out one fresh code; N types it into **both** tills, then presses REDEEM on each as near-simultaneously as possible | **Exactly one** ✅; the other gets ❌ naming the winning club and time | ☐ |
| D3 | Check U's screen | One redemption recorded, attributed to the winning club only | ☐ |

---

## Phase E — UW's controls (U, ~4 min, U screen-shares)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| E1 | **Revoke** an unredeemed code (confirm dialog) | Status → Revoked | ☐ |
| E2 | N enters the revoked code at a till | ❌ "This code is no longer valid" | ☐ |
| E3 | **Release** the Phase-D winning code (reason required, e.g. `demo — wrong till`) | Status → Unredeemed; it disappears from the winning club's list | ☐ |
| E4 | N redeems that released code from the **other** club | ✅ — proves a released code returns to the open pool for anyone | ☐ |
| E5 | U looks for a Delete button anywhere | **There isn't one** — deletion is NL-only | ☐ |

---

## Phase F — NL master powers (R, ~5 min)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| F1 | **Redeem…** on an unredeemed code, choosing a club (the phone-in scenario) | Code locks to that club; appears on their till page list | ☐ |
| F2 | **Revoke** a redeemed code | Demands typing `REVOKE`; wrong text refuses | ☐ |
| F3 | **Delete** a single code | Demands typing `DELETE`; code vanishes from every panel incl. U's screen | ☐ |
| F4 | **Batches** → `Demo day` row → **Delete unused (N)** | Confirm states how many **redeemed codes will be kept**; after typing `DELETE`, unused ones go, redeemed ones remain | ☐ |

---

## Phase G — the receipts (R, ~3 min)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| G1 | Audit tab | Every action from Phases A–F listed with actor, action, club, detail (incl. release reason) | ☐ |
| G2 | Filter by actor: Utility Warehouse → Clubs → NL master | Each filter shows only that party's actions | ☐ |
| G3 | Filter by action: Delete | The F3/F4 deletions are recorded — deletions leave a trace | ☐ |
| G4 | **Export CSV** | Audit downloads | ☐ |

Line to land with UW: *the audit trail is append-only — not even the master
console can edit or prune it.*

---

## Phase H — print cards (R, ~3 min)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| H1 | Clubs & access → **Card** on Nick's Club 1 | Print preview: club crest + UW wordmark side by side, QR, passcode, the four till steps, proper top margin | ☐ |
| H2 | N scans the on-screen QR with his phone | Lands on Club 1's gate (passcode still required — the QR is safe on public display) | ☐ |
| H3 | (Mention, don't run) **Print till cards** | One click → 72-page print-to-PDF hand-out pack | ☐ |

---

## Phase I — wrap (R, ~2 min)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| I1 | Clubs & access → **Reset sandbox** → type `RESET` | Everything wiped on screen; page reloads to first-run. No residue, no cleanup | ☐ |
| I2 | Decision: if UW are happy, agree the go-live moment | Live setup = re-run Phases P+A on the real console (no `?env=test`) and send UW their **real** link + passcode — ~5 minutes | ☐ |

---

## Coverage map (what each test proves)

| Capability | Tests |
|---|---|
| Gates: master / UW / club, wrong-passcode rejection, link ≠ login | P2–P3, B1–B3, C1–C3 |
| Code creation: generate, paste-own, batch labels, duplicate rejection, 500 cap | B4–B6 |
| Redemption: sloppy entry, dash formatting, ✅ + discount note, lock-to-club | C4–C5 |
| Duplicate + race protection ("redeemed **at**") | C6, D1–D3 |
| Live cross-panel updates | C7, D3, F3 |
| Revoke / release-to-pool / re-redemption | E1–E4 |
| NL-only powers: redeem-on-behalf, revoke-redeemed, delete, batch delete (keeps redeemed) | E5, F1–F4 |
| Audit: completeness, attribution, deletions traced, export | G1–G4 |
| Filters, search, CSV exports | B7–B8, G2–G4 |
| Print cards + QR round-trip | H1–H3 |
| Sandbox isolation + reset | P1, I1 |
