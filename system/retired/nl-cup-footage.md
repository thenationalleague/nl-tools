# NL Cup Footage — retired 15/08/2026, concept kept

The tool is deleted. This is the record of what it was for and what was already
decided, so a future build starts from the settled questions rather than from
nothing. **Nothing here is built. Nothing here should be built until someone
asks for it again.**

## What it did

Delivered match footage to the 32 clubs of the National League Cup — 16 National
League, 16 Premier League 2. Each club previewed and downloaded **its own**
games; NL staff saw everything; an external producer uploaded.

Three pages: a master console for NL, a club view, a producer upload page.

## The decisions worth keeping

These were settled with the owner and are the expensive part. A rebuild that
re-argues them wastes the work.

| Area | Decision |
|---|---|
| **Access matrix** | NL admin manages and sees all · NL staff view + download all, cannot edit · clubs see only their own games · producer uploads only |
| **Access method** | Portal login for NL people; passcode or direct link for outside (PL2 clubs, producer). NL clubs could use either. |
| **Ingest** | Producer treated like a PL2 club — gated page, anonymous auth with upload scope, no NL account. Straight to Firebase Storage. |
| **File → game** | Auto-mapped by filename. An unmatched file **forces the producer to map it** before it counts as delivered, so NL never chases orphans. |
| **Naming** | `YYYY-MM-DD_<HOME>_<AWAY>_<TYPE>_<VARIANT>.mp4`. `TYPE` = `HL`\|`FMR`, extensible. `VARIANT` = `CLEAN`\|`DIRTY`. Club codes match `clubs-meta`. Parser case-insensitive and tolerant — an unknown `TYPE` ingests to "needs retag" rather than being dropped. |
| **Availability** | **No approval step.** Footage is live to clubs the instant it uploads. The producer can re-map or delete their own files for 24h, then it locks. NL keeps a pull-back override. |
| **Files per game** | A flexible list (`game.files[]`), not a fixed 2×2 grid — reality includes missing fulls and extra clips. |
| **Preview** | Highlights preview inline from a 360p ~500kbps faststart proxy, auto-generated on upload. Fulls are download-only, full quality. |
| **Scope** | 64 group + 7 knockout = 71 games; knockout teams unlock as clubs qualify. |

## The two hard problems a rebuild inherits

**1. The download lock has no fast, policy-compliant path.** Two were built and
both rejected (13/07/2026):

- A `getFootageUrl` **callable** — callables must be publicly invokable, and the
  org's Domain Restricted Sharing policy forbids that (`allUsers` invoker → 403).
- An **RTDB-triggered signer**, which is policy-proof but added **15–20 seconds**
  per preview. Structural Eventarc delivery latency, not a cold start;
  `minInstances: 1` did not help. Direct `getDownloadURL` is sub-second.

Loosening the org policy was rejected. So access rested on **UI scoping** — clubs
only ever saw their own games — with Storage rules open to any signed-in user
holding a URL. That was an accepted trade-off for 32 known clubs, and it is the
first thing to re-decide if this returns.

The signing logic is in git history: `functions/index.js`, `signFootageUrl` /
`onFootageUrlRequest`.

**2. Credentials were in the page.** `footage/data.js` was committed to this
public repo and contained the producer passcode and every club's access token,
and the gate checked the typed code against that same file in the browser. A
gate whose answer key ships with the question is a screen, not a boundary.

If this is rebuilt, the codes go server-side — `NL.codeGate.viaFunction()` in
`nl-utils.js` is the pattern, the same handshake the club directory uses.

## What was deleted, and what was not

Deleted: the three pages, `data.js`, the RTDB rules node `app-data/media-footage`,
the registry record, and the `makeProxy` Cloud Function that generated preview
proxies on upload.

**Not deleted, and needing a human:**

- **The Storage bucket.** Anything under `footage/national-league-cup/` is still
  there and still costs money. Removing the tool does not remove the video.
- **The Storage rules block** for `footage/**` stays until the bucket is cleared —
  deleting the rule first would orphan files nobody can reach or tidy.
- **The credentials in git history.** Deleting `data.js` removes it from the
  working tree, not from the 3,000-odd commits behind it. `PROD24` and every
  club token should be treated as public, permanently. They grant nothing once
  the pages are gone, but do not reuse them.

## Why it went

Never reached real use. The Cup ran, the tool did not carry it, and it was
sitting in the estate as three pages, a Cloud Function, a rules node, a Storage
tree and a set of public credentials — all of which had to be dragged through
every canon sweep and security review. The concept is sound and the decisions
above are good; the code was cost without return.
