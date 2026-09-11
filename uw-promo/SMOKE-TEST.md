# UW Promo Codes — smoke test

A scripted end-to-end acceptance test of the voucher platform. Runnable by
one person wearing all three hats (R solo, four browser tabs), or as the
three-person UW demo (R = NL master · U = UW rep · N = club staff, with
credentials passed in the meeting chat). Every step states what everyone
should see; anything failed gets a note and the run continues.

| | |
|---|---|
| **Environment** | Sandbox — every URL carries `?env=test` (amber TEST MODE badge). Identical code to live, disposable data. |
| **Duration** | ~45 minutes solo, ~60 as the demo |
| **Consoles** | Admin `https://nl.tools/uw-promo/admin/?env=test` · UW via its direct link · clubs via their direct links (copied from the admin table) |

---

## Phase A — set the table (R)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| A1 | Open the sandbox console. Old data? Clubs & access → **Reset sandbox** → type `RESET` | Reloads to first-run; set a master passcode | ☐ |
| A2 | Refresh the page | "Signing you back in…" → console reopens with no typing. **Sign out** → gate returns; sign in | ☐ |
| A3 | Land on **Clubs & access** (first tab; In-store codes, Online codes, Audit beside it) → **Seed clubs from roster** | 72 rows: Method pill (amber *Unassigned*) + pencil, PIN/passcode chips each with a reissue glyph, **no Card button anywhere yet** (no in-store clubs) | ☐ |
| A4 | Club 1: **pencil** → chip selector → **In-store** → amber "What this does" list **and required contact fields** appear → fill a name/role/email → red footer button | Refuses without a valid contact; commits with one; Club 1's row now shows the contact and a **Card** button | ☐ |
| A5 | **Create UW access**; copy UW passcode + direct link; copy Club 1's and Club 2's PIN / manager passcode / direct link (Club 2 stays *Unassigned*) | Six chips copied; chat/notes hold the set | ☐ |

## Phase B — UW: in-store codes (U)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| B1 | Open the UW direct link → wrong passcode → correct passcode | Link alone never opens; wrong refused; opens on **Clubs** — every in-store row carries **Add codes**, every online row **Request codes**; the code tabs have **no add/request buttons at all** (Export CSV only) | ☐ |
| B2 | **Add codes** on Club 1's row | Modal is titled with the club — **no club dropdown**; **generate-only** — no paste; count prefilled **1** | ☐ |
| B3 | Club 1 → count **10** → confirm | 10 six-character no-hyphen codes; **Copy all**; pills read **Created**; table updates instantly | ☐ |
| B4 | On one row press **Dispatch** → confirm | Pill flips **Created → Dispatched**; one audit entry; no tick column, no floating button | ☐ |
| B5 | Refresh the tab | Signs itself back in; everything as left | ☐ |

## Phase C — the till (N, phone for realism)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| C1 | Club 1's direct link → wrong PIN → correct **4-digit PIN** | Crest gate; wrong refused; till opens — **the till always asks, nothing remembered** | ☐ |
| C2 | Type a generated code sloppily (lowercase, mid-space) → **REDEEM** | Uppercases, no dash inserted, ✅ names code + Club 1 | ☐ |
| C3 | Same code again → REDEEM | ❌ already redeemed **at Club 1**, with date/time | ☐ |
| C4 | Enter a made-up code → REDEEM | The ONE neutral refusal (support address + T&Cs); no adjudication at the till | ☐ |
| C5 | Refresh the admin tab (resumes itself), return to the till tab, redeem another code | **Works** — no permission error (the multi-tab fix) | ☐ |

## Phase D — the in-store Dashboard, and anonymity (N)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| D1 | The bare club URL (no link) → **manager passcode** | **Dashboard · In-store method** badge beside the club name; session remembered on refresh; **Sign out** works | ☐ |
| D2 | Read the code table | **Only redeemed codes are listed**; a muted line reads "*N unredeemed codes not shown — codes stay anonymous until redeemed at your till*". No unredeemed strings anywhere on the page, and none in the CSV export | ☐ |
| D3 | Look for an activity feed | **There isn't one** — the master console's audit is the log | ☐ |
| D4 | **Check a code**: the code redeemed in C2, then a made-up one | Present (this club has a till); redeemed shows club+time; nonsense refused; 10/hr counter ticks | ☐ |
| D5 | PIN section: see the PIN, print own till card | Both present (in-store only) | ☐ |

## Phase E — Club 2 sets itself up (N)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| E1 | Club 2's link → **till PIN** | Holding screen — the PIN can never reach setup | ☐ |
| E2 | The bare club URL → **manager passcode** | Setup screen: globe/shop method cards, *method* language throughout | ☐ |
| E3 | **Online** → Save unticked → refused; both ticks, no contact → refused; add a contact → **Save** | Dashboard · Online method opens: contact card, count cards — **no till, no PIN card, no checker** | ☐ |

## Phase F — request → placeholder rows → issued → dispatched → redeemed

| # | Action | Expected | Pass |
|---|--------|----------|------|
| F1 | UW tab → **Clubs** → **Request codes** on Club 2's row | Modal is titled with the club — **no dropdown**; qty; due prefilled +7, editable | ☐ |
| F2 | **3** codes, due edited to **yesterday** → **Raise request** | **Three placeholder rows appear in the Online codes table**: empty code cell, **Overdue** pill, Club 2, raised-just-now. No separate requests table exists — and back on **Clubs**, Club 2's row now also shows **Remind** (drafts the chase email; the button exists only while a club is overdue and short) | ☐ |
| F3 | Club 2's Dashboard | The same three placeholder rows, each with a red **Upload** button; banner "3 still to supply"; count cards read 3 requested | ☐ |
| F4 | **Upload** on a placeholder → tick the three undertakings → **the form shows exactly 3 input boxes** → fill **2** → upload | Toast only; two placeholders become **Issued** rows with real codes; one **Overdue** placeholder remains; banner "1 still to supply" | ☐ |
| F5 | Upload the last one | No placeholders left — the ask is simply complete; banner clears | ☐ |
| F6 | UW tab: the three read **Issued** | **No Revoke button** on club-uploaded codes; **Dispatch** each (or spot-check one) → **Dispatched** | ☐ |
| F7 | Club 2's Dashboard: every uploaded row — **Issued or Dispatched** — has **Mark redeemed** → press one → confirm | Row flips **Redeemed** with today's date (an Issued code may jump straight to Redeemed — it's live in the club's own store from upload); UW and admin see it immediately — the online loop closes club-side | ☐ |

## Phase G — the console mirrors, and master powers (R)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| G1 | Admin → **In-store codes** / **Online codes** tabs | UW's exact shape: same stats ("Codes uploaded" online, no Expired card there), same placeholder rows, same per-row Dispatch — plus Redeem… / Revoke / Delete on rows, generate-only add + **Code adds** on In-store, **Request club codes** on Online | ☐ |
| G2 | **Delete** a code (typed `DELETE`); **Revoke** a redeemed one (typed `REVOKE`) | Master-only powers work; each leaves an audit entry | ☐ |
| G3 | **Audit** tab | Every action from A–F attributed: adds, dispatches, redemptions (incl. the club-marked one), requests, method changes with contact names | ☐ |
| G4 | **Code adds** | Grouped by date stamp + club + author; no batch labels anywhere; delete-unused keeps redeemed codes | ☐ |

## Phase H — method change with codes in the wild (R + N)

| # | Action | Expected | Pass |
|---|--------|----------|------|
| H1 | UW tab → **Redemption methods** → Club 1 → pencil → **Online** | Consequences banner notes the till keeps working; contact fields prefilled from A4; red footer button | ☐ |
| H2 | Club 1's Dashboard (bare URL, manager passcode) | Badge *Dashboard · Online method*; **till still live** (central codes in the wild); checker still present (same reason); central codes in the read-only **previous scheme** block — still redeemed-only, anonymity holds | ☐ |
| H3 | Move Club 1 back to **In-store**, same ceremony | Round trip clean | ☐ |

## Phase I — phone lap + wrap

| # | Action | Expected | Pass |
|---|--------|----------|------|
| I1 | UW dashboard + Club 2's Dashboard on a phone | Everything fits — no sideways pan; Upload buttons inside the fold | ☐ |
| I2 | (Live-only, note) 12-month expiry, overdue digest email, upload-notify email | Asserted by unit tests / require live schedule + notify list — not sandbox-visible | ☐ |
| I3 | Clubs & access → **Reset sandbox** → `RESET` | Wipes to first-run; no cleanup | ☐ |

---

## Coverage map

| Capability | Steps |
|---|---|
| Gates, sessions (laptop surfaces remember, till never does), Sign out, multi-tab isolation | A2, B1, B5, C1, C5, D1 |
| Generate-only adds, in-store-only dropdown, one-club-per-add | B2–B3 |
| One-table lifecycle: request = placeholder rows → Issued → Dispatched → Redeemed; fulfilment = no placeholders left | F1–F7, G1 |
| Per-row dispatch with confirm | B4, F6, G1 |
| Club-side redemption marking (online) | F7 |
| **Central codes anonymous to the club until redeemed** (table, CSV, previous-scheme) | D2, H2 |
| No club activity feed; one audit, on the console | D3, G3 |
| Method ceremony with forced contact; till + checker survive on central codes; setup gates (ticks + contact); holding screens | A4, E1–E3, H1–H3 |
| Neutral till refusals; race-safe redemption; checker scoping | C2–C4, D4, E3 |
| Master powers: delete, revoke-redeemed, code adds by date stamp | G2, G4 |
| Phone layouts | I1 |
