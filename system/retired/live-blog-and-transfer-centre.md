# Live Blog + Transfer Centre — parked for rebuild

**Status, 15/08/2026: unplugged, not deleted.** Both front-ends are still here.
Their backends are gone.

## Why

Both ran off a **Google Sheet** behind an Apps Script web app. A person typed
into a spreadsheet and the page polled a `/exec` URL every 8 seconds for the
whole sheet. That was a reasonable way to ship something fast before this
project had a database; it is not a reasonable way to run it now, and neither
tool has been in real use for long enough that keeping the plumbing alive was
costing more than it returned.

Three things were wrong with the arrangement, beyond it being dated:

- **Nothing mirrored the code.** Two Apps Script projects, both fan-facing on
  the public site, with no copy in this repo and no sync. The live-blog one
  *accepted submissions* from the public. See `gas/README.md` for how the
  consolidated project's mirror was found to be six files out of fifteen — these
  two were zero out of two.
- **A spreadsheet is not a schema.** Both front-ends carry defensive field
  lookups (`pickField(item, ['clockSort', 'clock sort'])`) because column
  headings drift when a human edits a sheet. Half that parsing exists to survive
  the storage layer.
- **Polling a whole sheet every 8 seconds** is the opposite of what RTDB does
  natively, which is push you the one thing that changed.

## What is kept, and what it is worth

The presentation layer, which is the expensive part and is genuinely good:

| File | What survives |
|---|---|
| `live-blog-page.html` | 70 versions of iteration. Post cards, crest handling, the full-screen **goal sting** with the ticking scoreline digits and colour-split animation, the sticky mobile header, the boot/loading state, the supporter-note form. |
| `transfer-centre-page.html` | The **transfer sting** — crest rings, club-colour treatment, the traced-signature canvas that draws a player's name in a handwriting font (inlined, no network fetch, works on iOS), social embed auto-detection for X and Instagram, contract cards. |

Neither is a mockup. They are finished, shipped interfaces with the edge cases
already found. Rebuilding the animation work from scratch would be the waste;
rebuilding the data layer is an afternoon.

## What was deleted

- `live-blog-ticker.html`, `transfer-centre-ticker.html` — thin strip versions
  of the two pages above. Nothing in them is not in the pages.
- The whole `widgets/` family followed on 15/08/2026 — see
  [`public-site-tickers.md`](public-site-tickers.md). The modern ticker
  reference (Shadow DOM, no external `<script src>`, CMS-safe) is the
  transfers-ticker code that spent five months squatting in
  `widgets/results-ticker-widget.js` — git has it at `f938950e`.

Git history has all of them.

## How to plug either one back in

The data layer in each file is now **one function**, and everything below it is
untouched:

- **Live blog** — `loadSheetItems()` returns an array of raw items. It currently
  returns `[]`. Replace the body with an RTDB read and every card, sting and
  animation works unchanged. `CONFIG.submitUrl` is the supporter-note POST and
  is separately `null`.
- **Transfer centre** — `API_URL` is `null`. Same shape: fetch, map, render.

Both are set to `null` rather than left pointing at a dead URL on purpose. A
page that fails to reach a backend looks broken. These are not broken, they are
unplugged, and the empty state they fall into is the one they already had.

### Suggested RTDB shape

Follow the house contract in `CLAUDE.md`: a `toolKey` of `<category>-<slug>`
indexing three things — the `tools/<toolKey>` registry record, the
`app-data/<toolKey>/…` subtree, and a rules block in
`system/rtdb/rules.snapshot.json`.

```
app-data/media-live-blog/
  matches/<matchId>/
    meta/          fixture, kickoff, competition, status
    posts/<postId>/  type, minute, clockSort, team, text, media
  supporterNotes/<noteId>/   name, note, at, approved

app-data/media-transfer-centre/
  items/<itemId>/  type, player, fromClub, toClub, fee, at, media, copy
```

`media-transfer-centre` **already has a parked registry record** in
`system/rtdb/tools-registry.parked.json` — check it before writing a new one.

Two decisions the rebuild has to make that the Sheet made for you:

1. **Who writes.** The Sheet was open to whoever had the link. An RTDB rebuild
   needs an editor surface and a rule saying who may write it. The entry-route
   rule in `nl-brand.css` v2.37 applies — a code-entered editor wears
   `.nl-idbar`, a staff one goes behind auth-guard and wears `.topbar`.
2. **Public read.** These are fan-facing on `thenationalleague.org.uk`, so the
   read path has to work with no account at all. `app-data/ops-attendance/fixtures`
   is the existing precedent for a public-read node.

## Taking them off the site — this repo cannot do it

Deleting files here does **not** remove anything from
`thenationalleague.org.uk`. These are pasted into the Urban Zoo CMS, so the
embed blocks stay live until someone removes them there, and the two Apps Script
projects and their Sheets keep running until someone archives them.

Three things, in this order:

1. Remove the embed blocks from the CMS pages.
2. Archive or unpublish the two Apps Script web apps (the deployments ending
   `…Eqlzcw` and `…5YtHOFzK`). Until this is done they remain public endpoints,
   and the live-blog one still accepts submissions.
3. The Sheets can then be archived — keep them until the rebuild, in case any
   historical content is worth importing.
