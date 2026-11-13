# Brand and principles audit

13/11/2026. Every page measured against `system/style-principles.md` and the
canon (`nl-brand.css`, `nl-utils.js`, `nl-topbar.js`). This is the work list
for the brand sweep: canon changes first, then drift by theme, then every
page ranked.

## How it was measured

- **88 pages**: 42 signed-in tools and 46 other pages (club and code pages,
  forwarding stubs, the Wellbeing pages, posters). Embeds for the website
  are a separate family and are not covered.
- **Checked by script, on every page**: raw colours, pixel font sizes,
  local fonts, `!important`, canon classes restyled, action buttons with no
  icon, non-canon button kinds, typed `+` / `▾` / arrows, browser dialogs,
  dates and times formatted by the browser, native date and time boxes,
  Cancel beside Save in dialogs, emoji empty states, an `<h1>` on a tool,
  links into views, file-header history and What's new length, inline
  styles, tab sets.
- **Looked at by eye**: 20 key tools at the common screen (1280 × 600).
- **Allowed and not counted as drift**: colours in canvas and image exports
  (the Graphics tools), club colours held as data, and the Trident edition's
  own palette (a decision, below).
- Counts are from scripts and are a guide, not a verdict: "action button
  with no icon" matches a verb at the start of a button's words, so a few
  are buttons that should have none.

## The headline

**Mostly fine.** Tabs are one canon strip almost everywhere. Filters are
`NL.filterButton`, clubs are `NL.clubPicker`, tables are the canon navy
table, section headings are canon, and no page uses a browser dialog. The
wiring lint is clean on every page.

**What doesn't work**, in order of how much it shows:

1. **Buttons.** About 340 action buttons carry no icon; the dialog bar
   *cannot* carry one (a canon gap); 41 dialogs still have Cancel beside
   Save; 17 typed `+` and 18 typed `▾`; nine button kinds that are not
   canon (`btn--secondary`, `--accent`, `--note`, `--loading` and more).
2. **Dates and times.** No canon date shows the weekday, so nothing reads
   "Sat 14 Nov 2026". 48 places format dates or times with the browser's
   own rules, and 40 date or time boxes are the browser's own picker,
   which shows mm/dd/yyyy on a US-set machine. Fixture Management has a
   good date picker of its own that nothing else uses.
3. **Type.** Section headings are capped at 15px and read meek (a canon
   note already says so). Six tools still put an `<h1>` on the page, 119
   `<h2>`s sit outside a section heading, 81 font sizes are typed in pixels.
4. **Empty states.** Two sizes are needed and the canon has one; 11 use an
   emoji; 103 are local classes; several explain the product instead of
   saying what's empty.
5. **The Manage standard is not yet applied**: Document Library (Bin,
   Activity), Financial Benchmarking (Import), Programme Packs (Removed
   files, Audit), Commercial Compliance (Escalation, To review), Matchday
   Live (Contributors) and Access (Invites, Requests, Audit) all run the
   tool from tabs of their own.
6. **History in the files.** 10,500 lines of history sit in page headers
   (Attendance 1,245, the portal 927, Handbook 521, Brand Exposure 460)
   and 562 What's new entries, all shipped to every visitor.
7. **Links into views.** 31 of the 42 tools put nothing in the address, so
   a tab, a club or an open item can't be linked to.
8. **Audit words.** 48 of the 66 actions tools write to the audit log have
   no words, so the log shows the raw key.

## Part 1: canon changes

In the order to make them. Each is one pull request with the lockstep
`?v=` bump, a test and a Style Guide entry.

| # | Change | Why | Clears |
|---|---|---|---|
| C1 | **Dialog bar.** `NL.modal` buttons take an `icon` and a `start` flag (sits apart on the left). Retire Fixture Management's local `.fm-foot-start`. | Every dialog breaks the icon rule today, and only one has Remove set apart. | Icons in every dialog; principle 6.4 everywhere |
| C2 | **Dates and times.** `NL.formatDateShort` returns "Sat 14 Nov 2026"; add `NL.formatDay` for "Sat 14 Nov" where the year is a heading; `NL.formatDate` (long month) retires. `NL.formatTime` (15:00) already exists. | Principle 5.5 and 5.6 in one place, not 48. | 48 browser formatters |
| C3 | **Date picker.** Promote Fixture Management's picker to `NL.datePicker` (with a time field), the same look as `.nl-select`. | Native boxes differ per browser and show US order on some machines. | 40 native date and time boxes |
| C4 | **Buttons.** The four kinds and nothing else (principle 4.2). Map `--secondary` → ghost; `--accent` → navy; `--loading` becomes a canon `.is-loading` state; `--note`, `--play`, `--go`, `--blk`, `--i`, `--link` are renamed page-local or removed. | Nine kinds outside the canon. | 37 buttons |
| C5 | **Empty states.** Add `.empty-state--inline` (one quiet line inside a panel). No emoji; a sprite icon is optional. | Two real sizes; one canon. | 103 local empty states, 11 emoji |
| C6 | **Form pieces.** Promote `.field-value` (a read-only value in a form) and `.check` (tick box and its sentence) from Fixture Management. | Both are needed wherever a form shows a fixed value or a tick box. | Mixed value and tick-box styles |
| C7 | **Type scale.** Resolve the 15px cap on section headings, with the rest of the parked scale pass (`brand-v3-scale-plan.md`). Every tool changes at once, so it ships with screenshots of all of them. | Section headings read meek. | Principle 3.2 and 3.3 |
| C8 | **Sprite.** Add copy, more (three dots), archive, restore and move. Add a canon "more" menu: Content Plan and Programme Packs each hand-roll one. | Buttons borrow the wrong icon or go without. | Icon coverage |
| C9 | **Audit words.** Add the 48 missing actions to `NL.audit.LABELS` (list below). | The log reads as code. | Principle 11.4 |
| C10 | **Top bar.** The version badge decides "League" from the pass's card, not the old role. It keeps the number. | Everything else moved to the pass on 12/11. | Principle 13.2 |
| C11 | **Override backlog.** Delete the 39 lines for pages that no longer exist. `.btn` is restyled on 10 pages and `.page` on 7, mostly with no reason given: find the need behind them (a toolbar-height button; a dense page's padding) and meet it in the canon. | The backlog hides what the canon is missing. | 135 lines → under 60 |
| C13 | **Icon-only buttons on a phone** (principle 6.7, to consider). A canon marker on a button lets its words drop under phone width, for the standard icons only; never the main action or anything that can't be undone. A test enforces both. | Worded button rows wrap or crush on a phone (the Programme Packs selection bar, 13/11). | Phone button rows |
| C14 | **File library layout** (principles section 14). One canon component for folder pages: location and heading, one action bar that becomes the selection bar, folders then files with a ⋯ per row, drop anywhere, drop box only when empty. Programme Packs and Document Library move onto it. | Two hand-built libraries; the Programme Packs one is busy on a phone and doesn't say where an upload lands (13/11). | Both libraries |
| C12 | **Lint checks** for what can be tested: an action button with no icon, a typed `+`/`▾`/arrow, Cancel with Save, a pixel font size, a browser date formatter, a header over its last five versions. Report first, then fail on new ones, as the override backlog does. | Drift shows itself instead of waiting to be noticed. | Holds the line after the sweep |

**The audit actions with no words (C9):** access_way_back, add_match,
attendance_clear, be-ref-delete, be-ref-delete-all, be-ref-move,
be-review-promote, club-code-add-person, club-code-issue,
club-code-remove-person, club-code-reset, club-code-reset-person,
clubkits_edit, content_plan_bulk, content_plan_clear, content_plan_config,
content_plan_create, content_plan_cup_delete, content_plan_cup_paste,
content_plan_delete, content_plan_idea_add, content_plan_idea_delete,
content_plan_idea_scheduled, content_plan_import, directory_guard,
directory_live, directory_structure, discard, edit, edit-lock-takeover,
edit-mode, export_csv, financial_return_delete, financial_return_import,
fixtures_correct, fixtures_crowd, fixtures_from_attendance, fixtures_import,
fixtures_move, fixtures_remove, fixtures_restore, fixtures_results, import,
newsletter_export, publish, restore, revert, scan_request. (The password
and fixture ones are already worded in an open pull request.)

## Part 2: drift by theme

Each theme is fixed across all its pages in one go, after the canon change
it depends on.

**D1. Action buttons without icons** (about 340; needs C1, C8). Worst:
Brand Exposure 30, UW Promo admin 27, Commercial Compliance 20, Fixture
Management 16, Programme Packs 16 + 12, UW Promo club 16, Handbook 7,
Responsibilities 8, Club Kits 8, Club Directory admin 10, Graphics tools
(TOTW 10, Monthly Awards 10). One verb, one icon, everywhere:

| Verb | Icon | Verb | Icon |
|---|---|---|---|
| Add, New | add | Upload, Import | upload |
| Remove, Delete | delete | Download, Export | download |
| Edit, Amend | edit | Send, Publish | send (after) |
| Refresh, Reset, Restore | refresh | Print | print |
| Search | search | Copy | copy (new) |
| Move | move (new) | Back / Next | back / forward |

**D2. Typed symbols** (37). `+ Add …` on Vacancies, Judgements,
Commercial Compliance, Club Kits, Local Media, Programme Packs and the
Wellbeing map (7); typed `▾` on Broadcast Selections (4), Fan Widgets (3),
Attendance, Estate, Club Directory and Website Archive. Each becomes the
sprite icon.

**D3. Dialog bars** (needs C1). 41 Cancel buttons beside Save: Content
Plan 6, Responsibilities 5, Fixture Management 4, Newsletter 4,
Commercial Compliance 3, UW Promo admin 3, and others. Remove set apart on
the left wherever a dialog can remove.

**D4. Dates and times** (needs C2, C3). Browser formatters: Website
Archive 11, Broadcast Selections 10, Attendance 6, Fixture Management 5,
Data 3. Native date/time boxes: Fixture Management 9, Vacancies 6,
Graphics TOTW 5, My pass 3, and 14 more pages.

**D5. Headings and type.** `<h1>` on Data, Graphics, Handbook,
Newsletter, Style Guide (4) and Website Archive. Local heading styles
(Social Output's month title; Fixture Management's international panel was
fixed today). Pixel font sizes: My pass 15, Brand Exposure 14, the
Wellbeing map 8, the two Article Composers 6 each, Content Plan 4. Local
fonts: the Graphics tools name fonts directly in exports (allowed), the
Trident pages (decision below).

**D6. Colour.** Raw colours outside exports and data: Website Archive 29,
My pass 17, Brand Exposure 14, Travel Planner 7, Club Kits 6, Fixture
Management 4. `!important`: Brand Exposure 15, Social Output 13, Access
11, Travel Planner 7, Vacancies 5, Commercial Compliance 5.

**D7. Empty states and copy** (needs C5). Emoji: Document Library,
Judgements, Attendance, Commercial Compliance, UW Promo club,
Responsibilities, Matchday Live. Waffle in empty states: Brand Exposure
("so the pile is the point"), Data (a paragraph on how counting works),
Newsletter ("to get started"). Run `/dewaffle` on each tool as it is
swept.

**D8. The Manage standard.** Move running-the-tool tabs into one Manage
tab with its sections: Document Library (Bin → Removed, Activity →
History), Financial Benchmarking (Import), Programme Packs (Removed files →
Removed, Audit → History), Commercial Compliance (To review → Pending),
Matchday Live (Contributors → Settings), Access (Invites and Requests →
Pending, Audit → History). Brand Exposure's "How it works", "The two
routes" and "How it learned" are reading, not tabs: move them to one help
page.

**D9. Links into views.** Add the tab, view, club and open item to the
address (principle 2.7) on the 31 tools without it, starting with those
people send links to: Fixture Management, Attendance, Club Kits, Document
Library, Judgements, Vacancies, Commercial Compliance, Programme Packs.

**D10. History in the files.** Trim every header and What's new to its
last five versions, a tool at a time as it is touched (Attendance, the
portal, Handbook, Brand Exposure, UW Promo club, Broadcast Selections,
Wellbeing Hub and Trident first: each carries 300+ lines). Check while
trimming that no entry names a club, a person or an incident.

**D11. Inline styles** (846; Style Guide's 251 are demos and fine).
Vacancies 79, Commercial Compliance 61, Broadcast Selections 48, Brand
Exposure 45, Attendance 39, UW Promo admin 34: move them to classes.

**D12. Tab sets that look different.** Website Archive's two tabs are a
short strip, not the full-width canon one. Commercial Compliance puts a
second tab strip ("Needs attention / Full grid") under the first: that
is a view switcher (principle 2.4) and should look like one.

## Part 3: every page, ranked

Score = a weighted count of the findings (higher is worse). Pages scoring
3 or under are listed after the table.

| Page | Kind | Score | Findings |
|---|---|---|---|
| broadcast-selections/ | Page | 290 | raw colours 241 (most are club colours in its pasted season data, which is fine), px font sizes 4, canon classes restyled 2, typed + / carets 4, dates/times by browser 10, history lines 334, inline styles 48 |
| brand-exposure/ | Tool | 135 | raw colours 14, px font sizes 14, !important 15, canon classes restyled 8, action buttons without icons 30, non-canon buttons 3, dates/times by browser 1, native date/time boxes 2, Cancel beside Save (dialogs) 1, history lines 460, What's new entries 37, inline styles 45 |
| trident-wellbeing/ | Page | 121 | raw colours 93 (Trident's own palette: decide whether it gets tokens), local fonts 8, !important 3, canon classes restyled 2, history lines 370 |
| style-guide/ | Tool | 82 | raw colours 7, action buttons without icons 15, non-canon buttons 3, typed + / carets 3, native date/time boxes 1, emoji empty states 1, h1 on page 4, history lines 209, What's new entries 39, inline styles 251 |
| website-archive/ | Tool | 76 | raw colours 29, px font sizes 1, !important 1, canon classes restyled 1, action buttons without icons 4, typed + / carets 1, dates/times by browser 11, native date/time boxes 2, h1 on page 1, history lines 289, What's new entries 17 |
| trident-wellbeing/poster.html | Page | 67 | raw colours 41, px font sizes 2, local fonts 8, canon classes restyled 2, history lines 69 |
| wellbeing-map/ | Page | 52 | px font sizes 8, canon classes restyled 1, non-canon buttons 8, typed + / carets 7, Cancel beside Save (dialogs) 1, history lines 224 |
| attendance/ | Tool | 49 | raw colours 3, canon classes restyled 1, typed + / carets 2, dates/times by browser 6, emoji empty states 1, history lines 1245, What's new entries 51, inline styles 39 |
| handbook/ | Tool | 49 | px font sizes 1, canon classes restyled 6, action buttons without icons 7, Cancel beside Save (dialogs) 1, h1 on page 1, history lines 521, What's new entries 66 |
| pass/ | Tool | 49 | raw colours 17, px font sizes 15, !important 1, native date/time boxes 3, history lines 71, What's new entries 7 |
| / (sign-in page) | Page | 46 | raw colours 2, px font sizes 1, !important 1, canon classes restyled 10, action buttons without icons 10, history lines 100 |
| travel-planner/ | Tool | 46 | raw colours 7, !important 7, canon classes restyled 5, non-canon buttons 7, history lines 136, inline styles 22 |
| handbook/print.html | Page | 45 | px font sizes 3, !important 1, canon classes restyled 12, action buttons without icons 2 |
| vacancies/ | Tool | 43 | !important 5, canon classes restyled 3, action buttons without icons 9, non-canon buttons 3, typed + / carets 1, dates/times by browser 1, native date/time boxes 6, history lines 163, What's new entries 10, inline styles 79 |
| commercial-compliance/admin/ | Tool | 42 | raw colours 1, px font sizes 1, !important 5, action buttons without icons 20, typed + / carets 1, native date/time boxes 2, Cancel beside Save (dialogs) 3, emoji empty states 1, history lines 92, What's new entries 8, inline styles 61 |
| fixtures/ | Tool | 42 | raw colours 4, px font sizes 3, !important 2, action buttons without icons 16, dates/times by browser 5, native date/time boxes 9, Cancel beside Save (dialogs) 4, history lines 63 |
| newsletter/ | Tool | 40 | raw colours 1, local fonts 2, !important 2, canon classes restyled 7, Cancel beside Save (dialogs) 4, h1 on page 1, history lines 261, What's new entries 19 |
| content-plan/ | Tool | 38 | raw colours 1, px font sizes 4, non-canon buttons 8, dates/times by browser 2, native date/time boxes 1, Cancel beside Save (dialogs) 6, history lines 243, What's new entries 8 |
| uw-promo/admin/ | Page | 38 | canon classes restyled 1, action buttons without icons 27, native date/time boxes 1, Cancel beside Save (dialogs) 3, history lines 237, inline styles 34 |
| uw-promo/club/ | Page | 35 | px font sizes 2, !important 2, canon classes restyled 2, action buttons without icons 16, Cancel beside Save (dialogs) 2, emoji empty states 1, history lines 367 |
| graphics/monthly-awards/ | Tool | 34 | raw colours 15, local fonts 3, !important 1, action buttons without icons 10, dates/times by browser 1 |
| judgements/ | Tool | 32 | canon classes restyled 7, action buttons without icons 5, typed + / carets 1, native date/time boxes 2, emoji empty states 2, history lines 85 |
| club-kits/ | Tool | 31 | raw colours 6, !important 3, canon classes restyled 2, action buttons without icons 8, typed + / carets 1, Cancel beside Save (dialogs) 2, history lines 99, What's new entries 10, inline styles 21 |
| public/article-composer/ | Page | 28 | px font sizes 6, canon classes restyled 4, action buttons without icons 4, history lines 69 |
| club-directory/admin/ | Tool | 26 | px font sizes 2, action buttons without icons 10, non-canon buttons 1, typed + / carets 2, history lines 266, What's new entries 21 |
| programme/admin/ | Tool | 25 | canon classes restyled 2, action buttons without icons 16, history lines 92, What's new entries 8, inline styles 23 |
| access/ | Tool | 24 | !important 11, action buttons without icons 6, non-canon buttons 1, Cancel beside Save (dialogs) 2, history lines 127, What's new entries 12 |
| portal/ | Tool | 24 | raw colours 1, !important 1, canon classes restyled 1, action buttons without icons 1, typed + / carets 1, history lines 927, What's new entries 35 |
| uw-promo/ | Page | 24 | px font sizes 3, canon classes restyled 2, action buttons without icons 8, native date/time boxes 1, Cancel beside Save (dialogs) 2, history lines 255 |
| graphics/table-graphic/ | Tool | 21 | raw colours 2, !important 1, canon classes restyled 4, action buttons without icons 2, history lines 79, What's new entries 20 |
| graphics/awards-full-photo/ | Tool | 19 | raw colours 5, local fonts 3, action buttons without icons 4, dates/times by browser 1, What's new entries 10 |
| social-output/ | Tool | 19 | px font sizes 1, !important 13, action buttons without icons 2, dates/times by browser 1 |
| vacancies/submit/ | Page | 18 | !important 5, canon classes restyled 3, action buttons without icons 2, dates/times by browser 1, native date/time boxes 2 |
| wellbeing-hub/ | Page | 17 | raw colours 5, local fonts 3, !important 3, history lines 370 |
| graphics/article-composer/ | Tool | 16 | px font sizes 6, action buttons without icons 4 |
| graphics/awards-shortlist/ | Tool | 16 | raw colours 5, local fonts 3, !important 1, action buttons without icons 2, dates/times by browser 1 |
| programme/ | Page | 16 | action buttons without icons 12, typed + / carets 1, Cancel beside Save (dialogs) 1, history lines 136 |
| club-directory/meta-reference.html | Page | 15 | raw colours 3, action buttons without icons 4, typed + / carets 2, dates/times by browser 1, emoji empty states 1, history lines 69 |
| graphics/totw/ | Tool | 15 | local fonts 1, !important 1, action buttons without icons 10, native date/time boxes 5, history lines 153, What's new entries 6 |
| graphics/fixtures-graphic/ | Tool | 13 | canon classes restyled 3, What's new entries 21 |
| responsibilities/ | Tool | 13 | action buttons without icons 8, Cancel beside Save (dialogs) 5, history lines 72 |
| fan-widgets/ | Tool | 12 | action buttons without icons 2, typed + / carets 3, dates/times by browser 1, history lines 61, What's new entries 11 |
| graphics/ | Tool | 12 | raw colours 1, px font sizes 1, canon classes restyled 2, h1 on page 1 |
| graphics/round-up/ | Tool | 12 | raw colours 1, local fonts 2, action buttons without icons 6, What's new entries 6 |
| estate/ | Tool | 11 | action buttons without icons 2, typed + / carets 2, dates/times by browser 1, history lines 140, What's new entries 12 |
| graphics/match-graphic/ | Tool | 11 | local fonts 1, canon classes restyled 1, action buttons without icons 6, history lines 78 |
| wellbeing-hub/poster.html | Page | 11 | raw colours 1, px font sizes 2, local fonts 3, history lines 69 |
| data/ | Tool | 9 | dates/times by browser 3, h1 on page 1 |
| document-library/admin/ | Tool | 9 | !important 1, action buttons without icons 4, emoji empty states 2 |
| graphics/academy-alliance/ | Tool | 9 | raw colours 4, action buttons without icons 4, What's new entries 7 |
| nls-monitor/ | Tool | 9 | canon classes restyled 1, action buttons without icons 6, history lines 65 |
| public/academy-alliance/ | Page | 9 | raw colours 4, action buttons without icons 4, What's new entries 7 |
| save-of-the-month/admin/ | Tool | 9 | !important 2, action buttons without icons 6, native date/time boxes 1, history lines 62, What's new entries 9 |
| save-of-the-month/ | Page | 9 | action buttons without icons 6, dates/times by browser 1, Cancel beside Save (dialogs) 1, history lines 73 |
| local-media/admin/ | Tool | 8 | action buttons without icons 5, typed + / carets 1, Cancel beside Save (dialogs) 1 |
| public/trust-cup/ | Page | 8 | raw colours 1, action buttons without icons 6, history lines 64, What's new entries 8 |
| wellbeing/ | Page | 7 | raw colours 3, px font sizes 1, local fonts 1 |
| commercial-benchmarking/ | Page | 6 | canon classes restyled 1, history lines 99, What's new entries 15 |
| dazn/admin/ | Tool | 6 | action buttons without icons 2, history lines 121, What's new entries 19 |
| matchday-live/ | Tool | 6 | action buttons without icons 3, typed + / carets 1, native date/time boxes 2, Cancel beside Save (dialogs) 1 |
| local-media/ | Page | 5 | action buttons without icons 3, typed + / carets 1 |
| matchday-live/c/ | Page | 5 | !important 1, action buttons without icons 2, emoji empty states 1, history lines 63 |

**Clean (3 or under):** the club and reader pages of Club Directory, DAZN,
Document Library, Handbook and Commercial Benchmarking; Financial
Benchmarking and its admin page; Responsibilities' viewer; Commercial
Compliance's club page; the Roadmap; the forwarding stubs (People, Audit,
Club Codes, Club Kits admin, Fixtures admin); 404.

## Decisions for Richard

1. **Trident's palette.** The Trident Wellbeing page and poster use their
   own colours and fonts (93 and 41 raw colours). Either they become a
   token family (`--trident-*`) like the division colours, or they stay a
   deliberate exception, written down.
2. **Broadcast Selections** holds a whole season's data in the page,
   including every club's colours. Move the data to a file (or the
   database) so the page is only the page?
3. **Order of the sweep.** Suggested below; say if another order suits.
4. **The moment.** The principles are a work in progress. Before the sweep
   starts, one more full review of them against every page, then an agreed
   date to make the big changes in one go.
5. **Icon-only buttons on a phone** (C13): adopt, and with which icons?

## Suggested order

Step 0: the full review of the principles, and an agreed moment to start.

1. **Canon, wave 1** (one PR each): C1 dialog bar, C2 dates, C9 audit
   words, C10 top bar, C11 backlog clean-up. Small, and every later fix
   needs them.
2. **Canon, wave 2:** C3 date picker, C4 buttons, C5 empty states, C6 form
   pieces, C8 sprite and the "more" menu, C13 icon-only buttons on a phone
   if adopted.
3. **Themes D1–D3 across the estate** (icons, typed symbols, dialog bars):
   the biggest visible gain.
4. **Tools, worst first**, each in one PR that clears everything for that
   tool (D4–D12), with screenshots: Brand Exposure, Website Archive, My
   pass, Attendance, Handbook, Vacancies, Commercial Compliance, Fixture
   Management, Newsletter, Content Plan, then down the table.
5. **C7 type scale**, once the tools are consistent enough that one change
   moves them all the same way.
6. **C12 lint checks** switched to failing, so the estate stays this way.
