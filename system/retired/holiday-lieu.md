# Holiday & Lieu – retired 30/10/2026, rebuild intended

`/holiday-lieu/`, toolKey `staff-holiday-lieu`. Parked since spring 2026 and never published to the live `tools/` registry, so it never appeared on the portal for anyone except superadmin. It was retired in the Declutter on the same day as Claudio, which read this tool's data (see `claudio.md`). A rebuild is intended. This record exists so that the rebuild starts from the rules already worked out and the mistakes already made, not from this code.

## What it did

It was a staff leave tracker for League employees. Each person had a month calendar showing annual leave, time off in lieu (TOIL), extra days worked, office days and notes. There was also a week view of the whole team, an org chart, and an approvals queue where approvers accepted or rejected leave and lieu claims. It had one superadmin panel. That panel held each person's contract settings (working days, allowance, rollover, lieu expiry), their line manager and approvers, the League bank holiday list, shared calendar notes, and lieu accruals logged by hand.

## The decisions that were settled

**Audience and access**
- Only League staff could use it. Registry defaults were `superadmin: admin`, `admin: admin`, `staff: access`, `club-admin: off`, `club-staff: off`, with `audience: "league"`. Phase 3a of the staff/club audience plan restricted its `app-data` to League roles in the rules.
- Approval rights came from relationships, never from role. A person could approve someone if they appeared in that person's `approverUids`, or in the older single `approverUid`, or anywhere above them in the `lineManagerUid` chain (checked up to 10 levels). Admin and superadmin had no bypass (v1.38). Nobody could approve their own request (v1.37).
- A person could have several approvers, and any one of them could approve. The approver list was pre-filled from the line manager.
- If a person had no approvers, they approved themselves: their leave and lieu bookings were written straight to the calendar. Anyone with an approver went through approval, superadmin included.

**Annual leave**
- Leave year: January to December, taken from the browser's current year.
- Entitlement = base quota (`alQuota`) + rolled-over days (`alRolloverDays`). The balance card read "remaining / total", with a note of how many days had rolled over.
- A half day always counted as 0.5, with AM or PM chosen.
- A run of several days deducted only the person's contracted working days, skipping weekends, their non-working days and bank holidays. Bank holidays were treated as given on top of the allowance.
- Pending requests were taken off the displayed balance before approval.
- Each person had their own contracted working days (`workDays`, JS day numbers, Mon–Fri by default). These drove the shading on both calendars and the leave count.

**Lieu (TOIL)**
- Lieu was earned by working on a bank holiday, on a non-working day, or as scheduled overtime on a working day. The entry modal labelled these three cases differently.
- A full day earned 1 lieu day. A half day earned 0.5, with AM or PM recorded.
- Lieu claimed by staff always needed approval before it counted. Pending claims were left out of the available balance and shown as "awaiting approval".
- Expiry was set per person: `lieuExpiryDays` after the date worked, where 0 meant it never expired. Warnings showed at 30 days ("expiring") and 7 days ("urgent").
- Lieu could not be booked beyond the balance. The lieu options were greyed out at zero.
- Accruals logged by admins skipped approval.

**Entries and changes**
- Annual leave and lieu were mutually exclusive in a single save. Office day, worked extra and note could be combined with each other.
- On weekends, non-working days and bank holidays, the only option offered was "worked" (which earns lieu).
- For anyone with an approver, a booked entry was locked. Changes went in as an amend or remove request, and the approver chose one of "Approve change", "Keep original" or "Remove entry".
- Office day was a presence marker, not leave. It showed as a strip and was never deducted from anything.

**League-wide items**
- Bank holidays were one League list, entered by hand each year by superadmin, with a label and an `accruesLieu` flag.
- Shared notes were per-date labels shown on everyone's calendar (office closed, Cup Final and so on). Only admins could write them.
- The org chart was drawn from `lineManagerUid`, labelled with `jobTitle` and falling back to the role label.

**Calendar display**
- Fill precedence: annual leave, then lieu taken, then worked, then note. Office day added a 6px bottom strip on top of whatever fill the cell had.
- Half days split the cell: top half for AM, bottom half for PM.
- Pending requests showed as dashed pills that could be clicked to retract. A rejected request showed its reason in red.
- Ranges: My Calendar ran 12 months either side of today. Team View showed one week, Monday to Sunday, up to a year either side.
- Colours followed the brand v2.44 ruling. Tool-specific states (worked, rejected and so on) map onto the system hues: leave on the primary pastel, lieu `--purple-light`, worked `--blue-light`, bank holiday `--amber-light` with `--amber-deep` numerals. They never become canon tokens. `tests/brand-canon.test.mjs` still asserts that no `--cal-*` tokens exist.

## Data shapes

Recorded so the data can be exported or migrated without reverse-engineering it. All paths are under `app-data/staff-holiday-lieu/`.

- `entries/{uid}/{pushId}`: `type`, `date`, `endDate` (always set), `note`, plus `overtimeSize`, `overtimeAmPm` and `lieuDays` on worked days.
  Types: `annual-leave`, `annual-leave-am`, `annual-leave-pm`, `annual-leave-half` (older type, displayed as PM), `lieu-taken`, `lieu-taken-am`, `lieu-taken-pm`, `office-day`, `overtime` ("Worked Extra"), `other` ("Note").
- `requests/{uid}/{pushId}`: the same fields as an entry, plus `status` (`pending` / `approved` / `rejected`), `submittedAt`, `approverUids`, the older `approverUid`, `approvedBy`/`approvedAt` or `rejectedBy`/`rejectedAt`, and `comment`.
  Amend and remove requests also carry `entryId`, `entryType`, `originalDate` and `originalEndDate`.
- `lieu-earned/{uid}/{pushId}`: `dateWorked`, `days`, `reason`, `overtimeSize`, `overtimeAmPm`, `status`, `submittedAt`, `approverUids`, `expiryDate`, and the approval fields.
  Accruals logged by admins have only `dateWorked`, `days` and `reason`, and no `status`. Having no status meant confirmed.
- `bank-holidays/{year}/{YYYY-MM-DD}`: `label`, `accruesLieu`.
- `shared-notes/{year}/{YYYY-MM-DD}`: `label`, `addedBy`, `addedAt`.
- On the shared `users/{uid}` record: `workSettings` (`workDays`, `alQuota`, `alRolloverDays`, `alRolloverExpiry`, `lieuExpiryDays`), `lineManagerUid`, `approverUids`, and the older `approverUid`, which was cleared on every settings save.

## The hard problems it hit

1. **Dates and British Summer Time.** `addDays` built dates at local midnight and called `toISOString()`. During BST that returned the previous day, so the date loop never moved forward, and one booking became 400 copies (v1.16). It was fixed with UTC arithmetic on `YYYY-MM-DD` strings, plus a 400-step safety cap on every loop (v1.8). A rebuild should keep dates as strings and use the canon date helpers.
2. **Start-up races.** `init()` could fire three times from `nlAuthReady`, each time attaching another set of listeners (v1.15). Reads were also refused before the auth token was ready, which led to the `getIdToken(true)` workaround (v1.6, v1.11). Listener error handlers then cleared state on `PERMISSION_DENIED`, so a refresh showed a blank calendar (v1.18). Auth-guard v6+ now fires `nlAuthReady` only after a live token, which makes most of this unnecessary. The rule that survives: an error handler must never wipe data it already holds.
3. **The approver model never matched the rules.** Three separate gaps:
   - The Approvals tab was shown only to admin and superadmin, but approval rights were relational.
   - The rules let only the owner or an admin write another person's `entries`, `requests` and `lieu-earned`. A staff-role line manager could not record an approval even if they reached the button.
   - The tool listened on the whole `lieu-earned` node, but reading that node was admin-only. Staff therefore loaded no lieu at all: their balance read zero and their reports' claims never appeared for them.

   `system/tool-status-and-access.md` said approval for reports "works today". The code says it did not, for anyone below admin. In a rebuild, approvers should be stored as a map (`approvers/{uid}: true`), not an array, so the rules can check membership directly. Rules should be generated with `scripts/rtdb-level-rule.mjs` and only then layered with the relational check.
4. **Two approval buttons did nothing useful.** For amend and remove requests, "Approve change" and "Approve removal" pushed a new entry whose type was `amend-entry` or `remove-entry`. They did not edit or delete the original. Only "Remove entry" did what its label said.
5. **The lieu balance was a pooled sum, not a ledger.** Available lieu = unexpired approved accruals − all lieu ever taken. As a result:
   - Lieu taken was never matched to particular accruals, so when a used accrual expired, the balance dropped a second time.
   - Half-day lieu (`lieu-taken-am`/`-pm`) was never deducted.
   - Several-day lieu deducted every calendar day, weekends included, unlike annual leave.
   - Expiry was recalculated from each person's current `lieuExpiryDays`, ignoring the stored `expiryDate`, so changing that setting rewrote every past accrual.

   A rebuild needs a ledger that uses up the accrual expiring soonest first, and fixes each expiry when the lieu is earned.
6. **Balance checks did not agree with the display.**
   - The lieu check compared a request with the confirmed balance and ignored other pending requests, so two requests could overdraw it.
   - Annual leave had no check at all against the days remaining.
   - Overtime claims always went for approval, even for someone with no approvers. If they had no line manager either, the claim stayed pending for ever.
7. **Settings that were stored but never enforced.** `alRolloverExpiry` and the bank holiday `accruesLieu` flag were saved and displayed, but nothing acted on them. Rollover was typed in by hand each year, and nothing carried the balance forward.
8. **Locking did not match what the changelog said.** The v2.0 notes say "past entries locked". In the code, every entry was locked, past or future, for anyone with an approver. Self-approvers could edit or delete anything, including the past.
9. **No notifications.** An approver found out about a request only by opening the tool and seeing the badge. Requesters were not told when a decision was made.
10. **One file.** About 3,400 lines in one page, with hand-written modals and native `confirm()`. Much of its version history is fixes for regressions its own patches had caused (v1.27, v1.28, v1.39).

## Questions a rebuild must answer first

- Who can see whose leave? Every League-role account could read every entry, notes included, and Team View showed everyone's leave type. Decide whether colleagues see only "away", and whether only approvers see the type and the note.
- Where do the rules come from? They should be taken from the Company Handbook's leave and TOIL clauses, not from this code. That covers the leave year (calendar year or contract year), rollover limits and expiry, lieu expiry, and whether a bank holiday worked earns differently from overtime.
- Do part-time staff get bank holidays pro rata, and does anything need hours rather than half days? This model only understood days and half days.
- Should bank holidays come from the published gov.uk England and Wales feed instead of being typed in each year?
- What notifications should there be, and through which channel?

## What stays behind

**Leave data: deleted 30/10/2026.** `app-data/staff-holiday-lieu/` held test entries only (dummy data, confirmed by Richard), not real leave records. It was deleted from the Firebase console on 30/10/2026 without an export.

**The rules block: removed 30/10/2026,** after the data, from `system/rtdb/rules.snapshot.json`. It leaves the live database at the next **Button · Publish database rules** run.

**Fields on the shared `users/{uid}` records.** `workSettings`, `lineManagerUid`, `approverUids` and the older `approverUid` stay on each person's record, which every League-role account can read. Nothing else reads them now. **Still to remove** (the leave data went on 30/10/2026): they are on live `users/` records, so it is a console job, one person at a time, or a one-off script run by an admin.

**Audit log.** Writes made through the tool were recorded under `admin/audit` (`holiday-lieu_changed`), and those entries stay.

**Registry.** The parked record goes with this retirement. It was never published to live `tools/`, so there is nothing to delete in the console. Any per-person grant for `staff-holiday-lieu` is now ignored.

**Cost.** Nothing runs: there are no functions, Storage files, Actions or Apps Script routes. The only cost is the RTDB data itself, which is negligible.

## Why it went

It was parked, never launched, and in practice never usable by anyone below admin, because the approval and lieu reads failed under the rules (problem 3). The lieu calculations were also wrong in ways that would have given staff incorrect balances. The concept is worth having. This code is not the place to start, because the permission model and the lieu ledger both need redesigning from the beginning. The Declutter cleared it so that the rebuild begins from this record rather than from a 3,400-line page.
