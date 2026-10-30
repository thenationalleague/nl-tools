# Site demo – retired 30/10/2026, concept kept

A mock-up of The National League's public website at `nl.tools/site-demo/`:
home, news, article, table and fixtures pages, built with Astro. Made in four
pull requests over 16–17/08/2026 (#929, #930, #932, #935) as an early concept
for the League running its own website and CMS instead of the current
supplier. Retired in the Declutter on 30/10/2026. The source in `site/` went
with it. Last version in git: commit `6a0ae99`
(`git checkout 6a0ae99 -- site site-demo`).

The concept is on the Declutter revive list. The code is not the starting
point (see "Why it went").

## What it did

It showed what a League-owned public site could look and feel like on a phone,
using real content, with nothing published anywhere official. Each page had a
"Demo build – not the live National League website" strip across the top and
was set to `noindex`.

| Page | Showed | Data came from |
|---|---|---|
| Home | Lead-story hero, swipeable news rail, top eight of the table, next National League matchday, a results ribbon | News live in the browser; the rest fixed when the page was built |
| News | Latest 24 stories as cards | Live in the browser |
| Article | One story: title, hero image, body, share button, reading-progress bar | Live in the browser, `?slug=` in the URL |
| Table | Full National League table with position bands and form | A JSON file committed by hand |
| Fixtures | Next four National League matchdays, with DAZN badges | `assets/data/fixtures-2026-27.json` at build time |

National League only. North, South, club pages, search, a publishing CMS,
moving images off the supplier and redirects from old URLs were all left out
on purpose.

## How it got its data

It never called the NLS football API. Three sources:

- **News and images: the current supplier's CMS API, called from the
  visitor's browser.** `news.cms.web.gc.nationalleagueservices.co.uk/v2/search`
  for lists and `/v1/byslug` for one article. Images came through
  `images.gc.nationalleagueservices.co.uk/fit-in/<size>/`, because the raw S3
  bucket behind it refuses anonymous requests. The article renderer handled
  the CMS widget types (text, image, gallery, quote), following the one in
  Website Archive. Pulling at build time was tried and failed: the build
  machine could not reach the CMS.
- **Table and results ribbon: snapshots typed into `site/src/data/`.** The
  table dates from 15/08/2026, two games into the season. The ribbon shows the
  results of Saturday 15 August. Neither was ever refreshed.
- **Fixtures: the repo's fixture file**, filtered to "from the build date
  onwards". The last build was on 17/08/2026, so the page has shown 22 August
  to 1 September ever since.

Crests came from `/assets/crests/` with the rose as the fallback. Short club
codes came from `clubs-meta.json`.

## How it was built

Astro 5 source in `site/`. `npm run build` built into `site/dist/` and then
copied the result over `site-demo/`, which was committed and served by GitHub
Pages. It was the only build step in a repo that otherwise has none, and it
needed a terminal. No Action ran it, so only a Claude session could rebuild
it. It used one library (Embla, for the news rail). The brand tokens and the
Carbona font link were copied into a separate `brand.css` instead of loading
`/system/nl-brand.css`, because a public page should not carry the staff
tools' auth-guard or canon.

Things tried and kept, worth looking at again: fading between pages (Astro
view transitions), loading a page when the user hovers over its link, images
that load blurred and then sharpen, sections that appear on scroll, a
vidiprinter-style results ribbon, native share on phones (copies the link on
desktop), and every animation switched off for users who ask for less motion.
Tested for sideways scrolling on a 390px phone.

## The hard problems it hit

1. **Search engines and link previews saw nothing.** All news was filled in
   by the browser, and every article was one shared page with `?slug=` on the
   end. A crawler or a WhatsApp preview got "Loading…". That is the main
   reason the current thinking pre-builds news when it is published.
2. **Fixed snapshots went stale without anyone noticing.** The table, the
   results and the "next up" fixtures all froze in August. Anything live has
   to be fetched in the page, not baked in.
3. **It was a new shop front on the supplier's stockroom.** News, images and
   article bodies all still came from the supplier's CMS and image service.
   When the contract ends those addresses may stop working. Owning the website
   means owning the articles and the images.
4. **It copied the brand instead of using it.** The separate `brand.css`
   included position-band colours as CSS tokens, which canon has since ruled
   out (`NL.positionBands` only). A rebuild needs a decision on how a public
   site uses the design system without forking it.
5. **A build only a terminal could run.** That does not fit an estate where
   everything ships through GitHub Actions.

## Current thinking, 29–30/10/2026 (not decisions)

From a discussion on 29–30/10/2026. Nothing here is agreed.

- **Timing.** The website contract ends at the end of this season.
- **Shape: "shop front and stockroom".**
  - *Shop front:* a static public site on Firebase Hosting rather than GitHub
    Pages, which has a soft limit of about 100 GB a month. News is pre-built
    when it is published, so search engines and link previews get real pages.
    Live data (scores, tables) is fetched in the page from the League's own
    every-minute NLS import (`nls/`, written by `functions/nls-ingester.js`),
    not from NLS directly.
  - *Stockroom:* an editing back end. Either a headless CMS (Sanity,
    Storyblok, Payload) or one built in-house around the existing Article
    Composer editor. Either way it needs drafts, version history, scheduling
    and preview.
  - Caching is cleared on publish.
- **Volume.** Around 12,000 news articles are already archived, growing by
  about 500 a year.
- **Bus factor.** League-owned accounts, break-glass logins, and a small
  retainer with an outside developer who tests the runbook every quarter.

Open questions the demo raised and did not answer:

- Showing NLS data to fans from the League's own copy needs licensing
  sign-off. This is the same open question as in `fixture-feed-cache.md` and
  Matchday Live.
- Redirects from the current site's article URLs, so search rankings and old
  links survive.
- Moving images off the supplier's storage, and getting the article archive
  out in a form the League holds.
- Scope at launch: North, South, club pages, search.

## Left behind on purpose

- `assets/data/fixtures-2026-27.json`, `clubs-meta.json` and
  `/assets/crests/`. Other tools use all of them.
- The CMS endpoints above. Website Archive and `scripts/rebuild-index.js`
  still call them.
- Article Composer (`/public/article-composer/`), the candidate editor for an
  in-house back end.

Nothing else. It had no registry record, no RTDB data, no rules, no Action
and nothing that costs money. The URL stops working when the change merges,
with no redirect.

## Why it went

It was a two-day spike that had not changed since 17/08/2026. It sat on a
public URL looking like the League's website while showing a table from the
second game of the season. Its build could not be run without a terminal.
The current thinking (different hosting, news pre-built at publish, an editing
back end) would not start from this code. The concept stays; to recover the
code, check out `6a0ae99 -- site site-demo`.
