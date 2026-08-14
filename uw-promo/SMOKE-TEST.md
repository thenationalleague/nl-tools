# UW Promo Codes — three-person smoke test

A scripted end-to-end demonstration and acceptance test of the promo-code
system, run with Utility Warehouse on the call. Every feature is exercised at
least once; each test states who acts, what they do, and exactly what everyone
should see. Tick Pass/Fail as you go — anything failed gets a note and the
demo continues.

| | |
|---|---|
| **Environment** | Sandbox — every URL carries `?env=test` (amber TEST MODE badge). Identical code to live, disposable data. Nothing in this session touches live data or credentials. |
| **Duration** | ~50 minutes |
| **R** — Richard | NL master. Laptop, screen-sharing. Console: `https://nl.tools/uw-promo/admin/?env=test` |
| **U** — UW rep | Partner dashboard. Own laptop, screen-shares in Phases B and E. Link/passcode arrive via meeting chat in B1. |
| **N** — Nick | Club staff, playing **two different clubs**. Needs a **phone** (Club 1) **and** a laptop or second browser tab (Club 2). Credentials arrive via meeting chat in A5. |

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
| A1 | Clubs & access → **Seed clubs from roster** → confirm | "72 clubs added"; full table with crests, divisions, and a **4-digit PIN** per club — the PIN column, not a 6-character passcode | ☐ |
| A2 | Scan the PIN column for duplicates or any PIN starting `0` | Every PIN is different, none starts with a zero | ☐ |
| A3 | **Create UW access** | UW passcode chip (6 characters — UW is not a till) + Copy direct link / New passcode / New link buttons appear | ☐ |
| A4 | Tap the UW passcode chip, then **Copy direct link**; paste both into meeting chat | "UW passcode copied" / "UW direct link copied" toasts; both land in chat | ☐ |
| A5 | For two clubs of Nick's choice: tap PIN chip + **Copy direct link**; paste all four items into chat labelled Club 1 / Club 2 | Both clubs' credentials in chat | ☐ |

---

## Phase B — UW logs in and loads codes (U, ~7 min, U screen-shares)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| B1 | Open the UW **direct link** from chat | UW wordmark + passcode gate — link alone does not open the dashboard | ☐ |
| B2 | Enter a **wrong** passcode | "Passcode not recognised" | ☐ |
| B3 | Enter the correct passcode | Dashboard opens: stats all zero, empty pool | ☐ |
| B4 | **Add codes** — look at the dialog before touching it | **Paste a list of codes** is already selected (generating is second), and there's a **required club dropdown** at the top | ☐ |
| B5 | Leave the club unset, paste three made-up codes, press **Add codes** | Refused: "Choose the club these codes are for" — nothing is added | ☐ |
| B6 | Pick **Club 1**, paste three made-up codes (e.g. `SUMMER01`, `SUMMER02`, `SUMMER03`), batch label `UW supplied` → confirm | Confirm names Club 1 and says they can only be redeemed there; all three land, Club column = Club 1 | ☐ |
| B7 | **Add codes** → Club 1 → switch to *Generate codes for me* → **25**, batch label `Demo day` | 25 codes listed, each **6 plain characters, no hyphen**; **Copy all** → paste into meeting chat | ☐ |
| B8 | **Add codes** → **Club 2** → generate **10**, label `Club 2 batch` | Registered to Club 2, not Club 1 | ☐ |
| B9 | Look for any way to add one batch to two clubs at once | **There isn't one** — one club per batch, by design | ☐ |
| B10 | Re-paste one of the `UW supplied` codes as a new batch | Rejected: "Already in the system" | ☐ |
| B11 | Set the **club filter to Club 2** | The big count cards drop to Club 2's numbers only (10 in pool) and name Club 2; table matches | ☐ |
| B12 | Club filter back to **All clubs**; filter Status → Unredeemed; search one specific code | Cards return to the full totals; table narrows correctly both times | ☐ |
| B13 | **Export CSV** | File downloads; the third column is **Club** and is filled in for every row, redeemed or not | ☐ |

---

## Phase C — the till, Club 1 (N, ~5 min, on the phone)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| C1 | Open Club 1's direct link on the phone (this simulates scanning the printed QR) | **Crest-branded gate for Club 1** — not a working till | ☐ |
| C2 | Enter a wrong PIN | Rejected: "PIN not recognised" | ☐ |
| C3 | Enter Club 1's **4-digit PIN** | Till opens: UW wordmark, big entry box showing `***`, empty "Redeemed at your club" list, and a **Still to be redeemed** count matching Club 1's batches | ☐ |
| C4 | Check the stats and the page for any list of Club 1's *unredeemed* codes | Only a **count** — the unredeemed codes are never printed on screen | ☐ |
| C5 | Type a `Demo day` code **sloppily** — lowercase, with a space in the middle | Input uppercases; **no dash is inserted**; it still matches | ☐ |
| C6 | Press **REDEEM** | ✅ dialog naming the code + Club 1, with the "apply the relevant discount on your club system" note; code appears in the club's redeemed list | ☐ |
| C7 | Enter the **same code** again → REDEEM | ❌ "already redeemed **at** [Club 1] on [today's date/time]" | ☐ |
| C8 | Everyone checks U's screen (no refresh) | The redemption shows against Club 1 with a timestamp; "Redeemed by club" reads 1 / [Club 1's total] | ☐ |

---

## Phase D — wrong club, and the race (N on both devices, ~5 min)

**The headline rule for this release:** a code belongs to one club and works
nowhere else.

| # | Action | Expected | Pass |
|---|--------|----------|------|
| D1 | N signs into **Club 2** on the laptop (direct link + PIN from chat) | Second till open under a different crest | ☐ |
| D2 | At the **Club 2** till, enter one of Club 1's unused `Demo day` codes → REDEEM | ❌ **"registered to [Club 1], so it can only be redeemed there"** — named, and refused | ☐ |
| D3 | Check U's screen | That code is **still unredeemed** and still shows Club 1 — the failed attempt changed nothing | ☐ |
| D4 | At the **Club 1** till, enter one of Club 2's codes → REDEEM | Refused the same way, naming Club 2 — the rule runs both directions | ☐ |
| D5 | R reads out one fresh **Club 2** code; N types it into **both** tills, then presses REDEEM on each as near-simultaneously as possible | Club 1's till refuses it as Club 2's code; Club 2's till redeems it once. (If both devices are on Club 2, exactly one ✅ and one ❌ naming the winner) | ☐ |
| D6 | Check U's screen | One redemption recorded, attributed to Club 2 only | ☐ |

---

## Phase J — checking a code (N, ~4 min, on the phone)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| J1 | Scroll to the foot of the **Club 1** till page | **Check a code** panel, saying 10 checks an hour and that checks are recorded | ☐ |
| J2 | Check a Club 1 code that has **not** been redeemed | "Genuine, and not yet redeemed", registered to Club 1 — and it stays unredeemed (nothing is used up by checking) | ☐ |
| J3 | Check the code redeemed in C6 | "Already redeemed at Club 1", with the date and time | ☐ |
| J4 | Check a **Club 2** code | "Genuine and unused, but registered to [Club 2]" | ☐ |
| J5 | Check obvious nonsense, e.g. `ZZZZZZ` | "This is not a Utility Warehouse promo code" | ☐ |
| J6 | Keep checking until the 10th | Counter under the box counts down; the 11th is refused with a "try again in N minutes" | ☐ |
| J7 | R opens the master Audit tab, filters action → **Code check** | Every one of Nick's checks is listed, against Club 1, with what each one found | ☐ |

---

## Phase K — the club uploads its own codes (N, ~5 min)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| K1 | At the foot of the **Club 1** till page, find **Upload your own codes** | Intro names Club 1; paste box, optional label, three tick-boxes, Upload button | ☐ |
| K2 | Paste three made-up codes, leave the tick-boxes **unticked**, press Upload | Refused — all three confirmations required; nothing added | ☐ |
| K3 | Tick all three, press Upload | Second confirm dialog restating the three undertakings and naming Club 1 | ☐ |
| K4 | Cancel it | Nothing added; the codes and ticks are still in the form | ☐ |
| K5 | Upload again and confirm | "3 codes uploaded"; form clears; tick-boxes reset; **Still to be redeemed** rises by 3 | ☐ |
| K6 | Redeem one of them at the Club 1 till | ✅ — a club's own uploaded code behaves exactly like a UW one | ☐ |
| K7 | Try another of them at the **Club 2** till | ❌ refused, naming Club 1 — self-uploaded codes obey the same one-club rule | ☐ |
| K8 | Paste a code that already exists (one of UW's from Phase B) and upload | Refused, naming the clash; **nothing** is added, not even the valid ones alongside it | ☐ |
| K9 | R checks the master Codes tab | The three codes are there against Club 1, **By = Club** (not UW or NL) | ☐ |
| K10 | R checks the Audit tab | One `add-codes` entry from Club 1, with the count, the batch, and the three undertakings recorded in the detail | ☐ |

Line to land with the club: *this is your record as much as ours — the audit
trail is append-only, so what you confirmed can't be edited afterwards by
anyone, us included.*

---

## Phase E — UW's controls (U, ~4 min, U screen-shares)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| E1 | **Revoke** an unredeemed code (confirm dialog) | Status → Revoked | ☐ |
| E2 | N enters the revoked code at its own club's till | ❌ "This code is no longer valid" | ☐ |
| E3 | **Release** the code Club 2 redeemed in D5 (reason required, e.g. `wrong till`) | Status → Unredeemed; it leaves Club 2's redeemed list — but the **Club column still reads Club 2** | ☐ |
| E4 | N tries that released code at **Club 1** | ❌ refused — releasing rewinds the redemption, not the registration | ☐ |
| E5 | N redeems that released code at **Club 2** | ✅ — it's usable again, at the club it belongs to | ☐ |
| E6 | U looks for a Delete button anywhere | **There isn't one** — deletion is NL-only | ☐ |

---

## Phase F — NL master powers (R, ~5 min)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| F1 | **Redeem…** on an unredeemed Club 1 code (the phone-in scenario) | **No club picker** — it names Club 1, because that's the only club it can be redeemed at. Confirm → appears on Club 1's till page list | ☐ |
| F2 | Set the club filter to **Club 1** and read the big cards | Cards show Club 1's numbers and say so; clearing the filter restores the totals | ☐ |
| F3 | **Revoke** a redeemed code | Demands typing `REVOKE`; wrong text refuses | ☐ |
| F4 | **Delete** a single code | Demands typing `DELETE`; code vanishes from every panel incl. U's screen | ☐ |
| F5 | **Batches** | Each batch row names its **club**; `Demo day` → **Delete unused (N)** confirm states how many **redeemed codes will be kept**; after typing `DELETE`, unused ones go, redeemed ones remain | ☐ |

---

## Phase G — the receipts (R, ~3 min)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| G1 | Audit tab | Every action from Phases A–F listed with actor, action, club, detail (incl. release reason) | ☐ |
| G2 | Filter by actor: Utility Warehouse → Clubs → NL master | Each filter shows only that party's actions | ☐ |
| G3 | Filter by action: Delete | The F4/F5 deletions are recorded — deletions leave a trace | ☐ |
| G4 | Filter by action: **Code check** | Nick’s lookups from Phase J are all there, named to his club | ☐ |
| G5 | **Export CSV** | Audit downloads | ☐ |

Line to land with UW: *the audit trail is append-only — not even the master
console can edit or prune it.*

---

## Phase H — print cards (R, ~3 min)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| H1 | Clubs & access → **Card** on Nick's Club 1 | Print preview: club crest + UW wordmark side by side, QR, the **4-digit PIN**, the till steps (incl. "codes are issued to this club only"), proper top margin | ☐ |
| H2 | N scans the on-screen QR with his phone | Lands on Club 1's gate (PIN still required — the QR is safe on public display) | ☐ |
| H3 | (Mention, don't run) **Print till cards** | One click → 72-page print-to-PDF hand-out pack | ☐ |
| H4 | **Reissue all club PINs** → type `PINS` | Every PIN in the table changes; Nick's open Club 1 till keeps working, but his PIN no longer opens a fresh sign-in — reprint required. Restore his access with the new PIN before continuing | ☐ |

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
| Gates: master / UW / club, wrong-credential rejection, link ≠ login | P2–P3, B1–B3, C1–C3 |
| Club credential is a unique 4-digit PIN; bulk reissue | A1–A2, C3, H1, H4 |
| **A code belongs to one club, chosen at creation, one club per batch** | B4–B6, B8–B9 |
| **A code is refused at any other club, both directions, changing nothing** | D2–D5 |
| Code creation: paste-first default, 6-char no-hyphen generation, batch labels, duplicate rejection | B4, B7, B10 |
| Redemption: free-text entry, no dash formatting, ✅ + discount note | C5–C6 |
| Duplicate + race protection ("redeemed **at**") | C7, D5–D6 |
| **Count cards follow the club filter** | B11–B12, F2 |
| **Voucher checker: all four verdicts, non-destructive, hourly cap** | J1–J6 |
| **Club self-upload: undertakings enforced, double confirm, global duplicate check** | K1–K8 |
| Club-uploaded codes obey the one-club rule and are attributable | K6–K7, K9–K10 |
| Club's unredeemed codes counted but never displayed | C4 |
| Live cross-panel updates | C8, D3, D6, F4 |
| Revoke / release (keeps the registration) / re-redemption at the right club | E1–E5 |
| NL-only powers: redeem-on-behalf (no picker), revoke-redeemed, delete, batch delete (keeps redeemed) | E6, F1, F3–F5 |
| Audit: completeness, attribution, checks logged, deletions traced, export | G1–G5, J7 |
| Filters, search, CSV exports (Club column) | B11–B13, G2–G5 |
| Print cards + QR round-trip | H1–H3 |
| Sandbox isolation + reset | P1, I1 |
