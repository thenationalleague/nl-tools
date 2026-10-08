# The Wellbeing section (`/wellbeing/`)

A sixteen-page public mental-health section for players, staff and volunteers.
Retired 08/10/2026 and replaced by `/wellbeing-hub/`. The directory still holds
a redirect stub — see **Why it is a stub and not a deletion** below. The last
full version is **v2.3, 16/08/2026**, one 78KB file, in git history.

## What it was

One `index.html`. Sixteen pages routed by CSS `:target`, no JavaScript needed
for anything that mattered, no auth-guard, no Firebase, no analytics — reached
by its URL alone, on the `club-contacts` precedent for public pages.

Pages: a menu of four statements and eight topic cards; a "Is there a threat to
life?" triage behind the header pill; crisis, urgent support and understanding
your wellbeing; then nine topics — alcohol and drugs, anxiety, burnout,
depression, gambling, panic attacks, self-harm, sleep problems, stress.

## Why it went

Martyn Cannon (Designated Safeguarding Lead) supplied an HTML prototype for a
replacement on 05/10/2026, and `/wellbeing-hub/` was built from it over
08/10/2026 — the same content on the canon, with a search modal, an Urgent Help
route, a generated A4 poster and a PDF of it. Two public wellbeing sections
competing in search results serves nobody, which is why the hub carried
`noindex` until this retirement and why that meta is now gone.

> "wellbeing can be nuked; the hub version is now the correct one."

## The settled decisions

**The hub has eight topics; this had thirteen. That is deliberate.** Two topics
had no home in the replacement and were raised before the removal: **Burnout**
(eight mentions here, none in the hub) and **Panic attacks** (nine here, one
passing mention there). The hub was confirmed correct as it stands. The
prototype was Martyn's own work, so the shorter list is an editorial judgement
by the person who owns the content, not an oversight. The copy for both topics
is in git history at `wellbeing/index.html` v2.3 if either is ever wanted back —
adding them is a content decision for the DSL, not a code one.

Three of the old topics merged rather than vanished: anxiety and stress became
one `stress-anxiety` page, self-harm folded into the crisis page alongside
suicide, and "understanding your mental wellbeing" became `mental-health`. The
hub adds one the old section never had: `helping-someone`.

**The design contract is worth reading before building any public page.** Four
rules, and all four earned their place: nothing recorded; works without
JavaScript; works without CSS, because all pages are present in the markup in
reading order so an unstyled render is one complete document; shared blocks
authored once, outside the routed sections, so they cannot drift between pages.
The hub keeps the first three in spirit — though **not the first one literally
any more**, because GA4 landed on nl.tools on 08/10/2026 and the hub is
measured. If a future public page promises that nothing is recorded, that
promise now has to be checked against `system/nl-analytics.js`, which loads
from the canonical head.

**It was never a portal tool and should not become one.** It held an
`ops-wellbeing` registry record until 17/08/2026, which put a card on the
portal and carried per-role `defaults` that nothing enforced. The record is
gone. Being open is the point.

## Why it is a stub and not a deletion

Every route to this page is somewhere this repo cannot see. There was no portal
card, no registry record and no link from any tool — so the inbound links are a
CMS block on thenationalleague.org.uk, club emails, WhatsApp messages and
printed sheets. Deleting the directory turns all of them into a 404, and a dead
link matters more here than anywhere else in the estate: the person following
it is looking for help with their mental health.

GitHub Pages cannot send a 301, so the stub is a `meta refresh` plus a
canonical, with a real link and the two emergency numbers in the body for a
browser that honours neither. It loads no stylesheet and no script, because a
redirect that waits on an asset is a redirect that can fail to happen.

It redirects to `/wellbeing-hub/?src=old-wellbeing`, so arrivals from the old
URL are countable in GA4 without tagging the stub itself.

**The stub can go once the inbound links are updated and those arrivals stop.**

## What it broke on the way out

`scripts/build-wellbeing-map.js` read this file to generate
`wellbeing-map/map-live.json` — the starting map for the `/wellbeing-map/` flow
tool. It now refuses to run and says why. The committed JSON is unaffected, so
the map tool still works; it is a snapshot of a section that no longer exists.

Repointing it at the hub needs a parser change, not a path change: this section
used `.view` sections and the hub uses `.hub-view`, and the hub's shared blocks
sit in different places. That is the one job left behind by this retirement.
