# One address per tool

**Status: started 12/11/2026.** Fixture Management moved to `/fixtures/`
(it was at `/fixtures/admin/` with nothing at `/fixtures/`, so the obvious
address was a 404). Club Kits had already made the same move on 15/10/2026.

## The rule

A tool lives at **one address**, its own: `/fixtures/`, not
`/fixtures/admin/`. An `/admin/` page exists only while the front page is
something else that has to stay: a page entered by **code**, for people who
have no account. When a move happens, the old address keeps a forwarding
page (meta refresh plus script, keeping the query and hash; the Club Kits and
Fixtures stubs are the shape), and the registry `url` changes in the same PR.

Who sees what on that one page is decided by the pass (auth-guard v16.0),
not by which address they typed. So a "forward-facing view" and a "staff
console" are two views of one page, not two pages.

This overrides "club root + `/admin/`" in `system/tool-status-and-access.md`
and the two-door shape at the top of `system/fixture-management-plan.md`.

## Where every two-page tool stands

| Tool | Front page | `/admin/` | Can it merge now? |
|---|---|---|---|
| Fixture Management | none, until 12/11/2026 | the console | **Done** (12/11/2026) |
| Club Kits | the console | forwards | **Done** (15/10/2026) |
| Club Directory | the directory, by code | editor | No: the code door is how clubs read it |
| Commercial Compliance | club page, by code | console | No: clubs submit by code |
| Commercial Benchmarking | one page | none | **Done** (13/11/2026): a code or a Club card shows that club; a League account sees every club at its level. Built without auth-guard, which would send a code holder to sign in |
| DAZN Viewership | club page, by code | console | No: clubs read by code |
| Document Library | one page | forwards | **Done** (14/11/2026): the code door stays for clubs; a Club card opens it read-only; a League account sees it at its level, with Activity, and at Manage the Bin and every change |
| Financial Benchmarking | club page, by code | console | No: clubs submit by code |
| Local Media | public form | console | No: the form is public |
| Programme Packs | one page | forwards | **Done** (13/11/2026): the passcode door stays beside sign-in; a Club card opens its club; the League with Manage gets every folder plus Removed files, Audit and Manage as tabs |
| Save of the Month | club page, by code | console | No: clubs nominate by code |
| UW Promo | partner page | console (not a registry tool) | No: the partner uses it |

## Club logins have started (12/11/2026)

A Club card holder now opens a tool's club page signed in, with no code: the
pass puts the club's code claim on their account (`functions/pass-claims.js`)
and the registry's `clubUrl` sends them there. That is the first half of
merging the two pages; the second is the signed-in page serving both views.

## What unlocks the rest

Club logins (permissions plan, step 7). Once a club person can sign in with a
Club card, the code page and the console can become one signed-in page whose
view follows the pass, with the code door kept beside it for as long as codes
are wanted (Richard, 12/11/2026: codes stay). Each tool is its own PR:

1. The signed-in page learns the club view (a Club card sees its own club).
2. The front address serves the signed-in page to anyone signed in, and the
   code door to anyone who is not.
3. `/admin/` becomes a forwarding page; the registry `url` drops `/admin/`.

Local Media's public form and UW Promo's partner page are not club pages and
stay where they are.

**First in the queue: Programme Packs** (Richard, 12/11/2026). It is the one
club page a Club card cannot reach today: its library signs clubs in through
its own passcode route (`programmeAuth`) and keeps those sessions apart from
real accounts by design, so the club claim on a signed-in account is not
read there. Merging its two pages, with `programmeAuth` taught to accept a
Club card, closes that loose end.
**Done 13/11/2026:** one page at `/programme/`; `/programme/admin/` forwards there.

**Club Codes is no longer a two-page tool to merge:** it became the Codes
tab of Access (`/access/?tab=codes`) on 12/11/2026, and `/club-codes/`
forwards there.
