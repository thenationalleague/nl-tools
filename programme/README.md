# Programme Packs (`/programme`)

A 73-folder asset library for match-day programme production, on Firebase
Storage. Replaces `/programme-packs/` (Google Drive via Apps Script), which is
retired — see [Cutover](#cutover).

| Page | Who | Gets in via | Can do |
|---|---|---|---|
| `/programme/` | **The 72 clubs** | their 6-character passcode | Browse and download **every** club's folder. Upload, organise into folders, and remove files **in their own folder only** |
| `/programme/` | **NL commercial** | the 73rd (National League) passcode | Everything a club can do, in the **National League** folder |
| `/programme/admin/` | **NL admin/superadmin** | **portal login** (auth-guard, `media-programme`) | Everything, everywhere: the **Library** tab is the club page in master mode — browse and manage all 73 folders. Plus: seed/sync the roster, see and regenerate every passcode, export the access CSV, restore or permanently delete removed files, generate previews for images uploaded before previews existed, read the audit trail |

## The model

**Read-all, write-own.** Any club can browse and download all 72 folders. That
is the product, not a leak: the home club needs the *away* club's crest and
squad photo on Tuesday for Saturday. Own-club-only would make the directory
decorative.

Two consequences, both deliberate:

- Clubs are told at the point of upload that everything they add is visible to
  all 72 clubs. `Miscellaneous` is **not** a seeded folder — in a read-all
  library, a folder called Miscellaneous is where a sponsor contract ends up.
- Empty clubs stay **listed and visibly empty** in the directory. That quiet
  acknowledgement is the point, and it stops working if you hide them.

**The National League sits at the top of the directory**, in brand crimson —
a 73rd entry rather than a different kind of thing. Advert expiry is managed by
hand: a `usedFrom`/`usedUntil` window existed briefly and was removed, because
adverts change rarely enough that maintaining dates cost more than it saved.

**Folders are owned by the club, and optional.** Nothing is pre-created; a club
makes what it needs, nested up to six deep, or none at all. **The club root is
a folder like any other** — files can be dropped, listed, selected, moved and
removed there without inventing a folder to hold them. They carry
`folderId: '_root'`, so a root file is an ordinary record with an ordinary
storage path rather than a null that every read has to special-case, and the
view treats a missing folder id as that key rather than as "no folder".

**Drag-and-drop is aimed, and takes folders.** The whole folder surface takes a
drop, and every subfolder tile on it takes one more precisely — files go
straight into *Squad Photos* without opening it first. Exactly one target is
highlighted at a time, so where the files will land is never a guess. A club
that can only read a folder takes no drops at all.

Dropping a **folder** recreates the tree rather than uploading the folder
itself. `dataTransfer.files` reports a directory as a zero-byte `File` with no
type, so the obvious code stores a useless 0-byte asset named after the folder
and discards its contents; the entry API (`webkitGetAsEntry`) is the only way to
see that an item is a directory and walk into it. A name that already exists at
that level is **reused, not duplicated** — the way copying into a folder on a
desktop merges. Anything deeper than the **six**-level ceiling is flattened into
the deepest folder that fits, and says so in a toast of its own — refusing the
drop would mean the club reorganising on their own machine and trying again, but
flattening loses the structure they built, so it cannot ride along as a clause
on a green message.

The ceiling was three until 04/08/2026, which was right for a folder built here
by hand and wrong for one dragged off a desktop: a real working folder is
routinely four or five deep, and a drop of four folders came in as one flat
heap. A cap still exists so the breadcrumb and the Move picker stay readable.

**Content type is canonicalised on upload**, extension first, browser second.
`File.type` comes from the OS registry on Windows and reports a `.zip` as
`application/x-zip-compressed`; the Storage rule refused `application/x-*`
outright, so an ordinary 51MB zip failed with a permission error. The rule now
blocks only what *executes* when a browser opens the download URL inline —
HTML, XHTML, JavaScript — because content type is client-supplied anyway, so a
prefix ban stopped nobody determined and only ever caught honest uploads. What
bounds that path is write-own.

Uploads run **four at a time**. A dropped folder can be two hundred stills, and
firing two hundred simultaneous Storage puts makes every one of them slower
while the browser's connection limit turns the progress list into a wall of
stalled bars.

**Folders and files select and move together.** Tick either, then Move, and
folders re-parent (`parentId`) while files re-file (`folderId`) in one go. The
picker will not offer a folder its own subtree, or a target that would push the
branch past the depth ceiling — a folder beyond it falls off the tree walk
and reappears as an orphan at the top, which reads as "my folder moved somewhere
random". Remove stays files-only: a folder is deleted from its own ⋯ menu or its head,
and only when nothing would be lost with it.

**Deleting a folder** is blocked by files, not by folders. Empty subfolders are
deleted along with it — "delete the folders inside it first" is a chore the tool
can do itself, and it left folders undeletable for a reason the page never
showed. Anything holding files is refused with the count, because *"empty the
folder first"* does not say where to look when the files are two levels down.

**Making a folder does not open it.** `newFolder` used to assign `view.folderId`
directly, which is the one thing the page forbids: `navigate()` owns the view,
and writing behind its back left the hash and breadcrumb reading *root* while
`view.folderId` was the new folder. The next New folder then landed inside the
last one.

**Ordering is alphabetical and not editable**, for folders and files alike. A
manual sort order is hidden state nobody maintains, and across 72 clubs it
would mean 72 arrangements of the same three folders — the opposite of what
someone hunting through another club's library needs.

**Every image carries three sizes** — the canon crest vocabulary: a **thumb**
(360px long edge) that the grid tiles draw, a **medium** (1600px long edge)
that the eye/preview modal shows, and the **full** original, which only
Download touches. Before this, a folder of twenty 20MB photos pulled 400MB
just to draw its grid, for every visitor, every time.

The two smaller sizes are **rendered in the browser at upload** (canvas) and
their URLs stored on the file record beside `url` — *not* served by a resize
endpoint. That is not a style choice: the org policy that blocks public
invokers on new Cloud Run services (the same wall programmeEnter and
getFootageUrl hit) makes an on-demand proxy URL unreachable from a browser,
and the RTDB-trigger workaround pays ~15-20s of Eventarc latency per request,
which is what killed the retired footage tool's previews. Pre-rendering at
upload costs the uploader about a second and nobody else anything.

Variants live at `programme/<CODE>/_previews/<fileId>-<tier>.<ext>` — inside
the club's own prefix, so the existing Storage rules cover them unchanged
(write-own, clubs cannot delete), and keyed on fileId alone, so moving a file
between folders (an RTDB-only change) never strands them. PNG sources keep
alpha and stay PNG; JPEG/WebP flatten to JPEG. A tier the source already fits
inside is skipped. Types a canvas can't or shouldn't resize get no variants —
SVG/TIFF/PSD/EPS/PDF because nothing decodes them there, GIF because a canvas
keeps one frame and a tile that used to animate would freeze; tiles fall back
to the original when an `<img>` can show it and to the type icon when it
cannot — a PSD used to render as a broken image.

**Images uploaded before previews existed get theirs from the console** —
the *Generate previews* button on the Access pane fetches each original's
bytes (same bucket CORS the zip feature needs), renders the tiers in the
admin's browser under the `'*'` session, and stamps the record. `previewsAt`
marks a file done — including "ran, image too small to need any" — so the
button is idempotent and failures are retried on the next press.

**Bulk download** is a stored (uncompressed) zip built in the browser —
`programme/_zip.js`, no dependency and no build step. What goes in these packs
is PNG, JPEG and PDF, all already compressed, so deflate would spend CPU for a
percent or two. Right-click a folder (or use its ⋯ button) for that folder and
everything under it; the club root offers the whole pack.

> **Bulk download needs bucket CORS.** It reads file bytes into the tab, which
> a browser will only do cross-origin if the bucket allows the origin —
> confirmed live on 03/08/2026, where the first attempt failed exactly as the
> UI predicted. The config is `system/storage/cors.json`; there is no
> console UI for bucket CORS, so it is applied from Cloud Shell.
> Single-file downloads never touch this: the browser saves those directly and
> the page never sees the bytes. So "bulk fails, single works" has one cause,
> and the UI names it rather than reporting a generic network error.

## Access — how write-own is actually enforced

This is the part worth reading before changing anything.

A club types a passcode. It is **not** checked in the browser. The client signs
in anonymously, writes the passcode to `authRequests/<uid>`, and waits on
`authGrants/<uid>`; the `programmeAuth` RTDB trigger
(`functions/programme.js`) validates it with the Admin SDK and writes back a
**custom token carrying a `pClub` claim** — the club's clubs-meta code, or `NL`.
Storage and RTDB rules then enforce write-own against a claim the browser cannot
forge. The trigger deletes the request immediately, so a passcode never lingers
in the database.

**Why a trigger and not a callable.** It was a callable first. It deployed, but
Firebase could not grant it a public invoker — the project carries an org policy
blocking `allUsers` on new Cloud Run services (`Failed to set the IAM Policy on
the Service .../programmeenter`, 03/08/2026). Clubs have no Google account, so
an un-invokable callable is a dead end. `footage/NEXT.md` hit the same wall on
13/07/2026 and records the RTDB-triggered path as the org-policy-proof
alternative; this is that path. Anonymous sign-in goes through Identity Toolkit,
not Cloud Run, so it is unaffected.

**The cost is latency.** Eventarc delivery is seconds, not milliseconds —
footage measured ~15-20s and found it structural rather than cold-start. That
killed it for video previews, which happen constantly. Here it runs on a gate a
device hits once every 30 days, behind a spinner that says so after 3s. The
client gives up at 60s.

**The master view** (`/programme/?master=1`) is the library's third door,
beside the passcode and the remembered device: an NL admin gets the console's
`'*'` session on the club page itself, so all 73 folders browse **and**
manage in one place — `canWrite()` and both rulesets already understood
`'*'`; only the entry path was missing. The console's **Library** tab embeds
exactly this (`&embed=1` drops the idbar and keeps folder navigation out of
the console's history). The flag grants nothing: it needs a **live portal
sign-in on every boot** — a persisted `'*'` session on a machine whose portal
login has gone is signed out, not adopted — and the role check happens
server-side in `programmeAuth`. With a live portal session, a persisted `'*'`
is adopted to skip the ~15-20s Eventarc exchange, but only by the portal user
it was minted for (`pp-admin-<uid>`): anyone else at that keyboard goes back
through the exchange under their own name and their own role check, so the
audit can never carry the previous admin's identity. Master actions audit as
`master`, unlike **Open as**, which acts as the club (marked `viaAdmin`).

This is the one deliberate difference from `/uw-promo/`, where passcodes are
world-readable and compared client-side. With anonymous auth the token carries
no club identity, so Storage Rules cannot tell FGR from Barnet and "a club may
only write its own folder" would be enforced by the UI alone — anyone holding
any club's code could open devtools and write or delete all 72 folders. Here no
client ever reads a passcode: `config` is closed to everything except a
`pClub: '*'` session.

- **Clubs cannot delete bytes.** Storage rules deny `delete` to everything but
  a `'*'` session. "Remove" moves the RTDB record to `trash/<CODE>/`, so the
  file leaves every view immediately and the console can restore it. That
  matters most in this pre-portal window, where a passcode is shared and
  nothing is attributable to a named person.
- **The admin console runs two Firebase apps.** The default app holds the
  portal session (auth-guard); the named app `nlProgramme` holds a `pClub: '*'`
  token minted by `programmeAuth` after it checks the caller's portal role
  server-side (the admin request is written from the default app, so the
  trigger sees the real portal uid). The portal session is never modified and no custom claims are
  written onto real user accounts.
- **Brute force** is throttled at 10 failures per uid and 120 per 10 minutes
  globally, in a node no client can read or write. A trigger sees no source IP
  and anonymous uids are free to mint, so the global ceiling is what actually
  bounds a distributed guess: at that rate a 31^6 space takes ~140 years, and
  every attempt still costs an anonymous signup (IP-throttled by Identity
  Toolkit) plus an invocation.
- A leaked passcode is fixed by regenerating it in the console, which kills the
  old one instantly — including on any device that remembered it. **The club's
  link is unaffected**, because it carries no credential: it is
  `/programme/?club=<CODE>` and all it does is put the club's crest on the gate.

  A second random string, `?c=<token>`, sat in that link until 04/08/2026. It
  granted nothing — the bare URL has always accepted a passcode on its own — and
  existed only to narrow the server's search in case two clubs ever drew the
  same six characters. But regenerating rotated it too, so every bookmark and
  emailed URL in the club went stale and a correct new passcode came back
  *"Passcode not recognised"*: the one message that sends someone to the console
  convinced the regeneration itself had failed (Sutton, 04/08/2026). The
  collision it arbitrated is now **prevented** — the console will not mint a
  passcode another club already holds. A `token` field may linger on records
  seeded before then; nothing reads it.

Passcodes use the unambiguous alphabet (no `0`/`O`/`1`/`I`/`L`), same as
`/uw-promo/`, so a printed NL access card reads consistently whichever tool
issued it. A device remembers its passcode for 30 days; **Not you?** clears it.

## Data

RTDB `app-data/media-programme/`:

```
config/
  clubs/<CODE>   { name, division, passcode, addedAt }   # pClub '*' only
  nl             { name, passcode, addedAt }             # the 73rd code
authRequests/<uid>         { code, admin?, at }   # own uid only; deleted by the trigger
authGrants/<uid>           { ok, customToken?, club?, error? }   # own uid only
folders/<CODE>/<folderId>  { name, parentId?, createdAt }   parentId = subfolder
files/<CODE>/<fileId>      { name, folderId, size, contentType, storagePath,
                             url, uploadedAt,
                             previewsAt?, thumbUrl?, thumbPath?,   # three-size
                             mediumUrl?, mediumPath? }             # previews
                           folderId '_root' = top level
trash/<CODE>/<fileId>      { ...file, deletedAt }
audit/<pushId>             { ts, actor, actorLabel, action, club?, detail? }
rate/{uid/<uid>,global}    throttle counters (Admin SDK only)
```

Bytes: Storage `programme/<CODE>/<folderId>/<fileId>-<name>`, with preview
tiers at `programme/<CODE>/_previews/<fileId>-<tier>.<ext>` (`_previews`
cannot collide with a folderId — those are push keys, always `-`-led, or the
literal `_root`).

`<CODE>` is the **clubs-meta 3-letter code** (or `NL`) — deliberately the same
key the portal uses. Getting this right on day one is free; getting it wrong
would mean physically moving every object in the bucket at cutover.

`url` is the download URL, stored on the record at upload time. Rendering a
folder otherwise costs one `getDownloadURL` round-trip per file, which is what
makes a 60-file folder feel broken.

Rules: `system/rtdb/rules.snapshot.json` (`app-data/media-programme`) and
`system/storage/rules.snapshot.rules` (`match /programme/{club}/{allPaths=**}`).

## Deploying

1. **Functions** — automatic. `.github/workflows/deploy-functions.yml` runs on
   any push to `main` touching `functions/**` and deploys every function in the
   directory, with `--force` so anything removed from source is deleted from
   the project. Confirm the run is green.
2. **Storage rules** — paste `system/storage/rules.snapshot.rules` into
   Firebase console → Storage → Rules
3. **RTDB rules** — Actions → **Deploy RTDB rules** → Run workflow → type
   `publish`. It deploys `system/rtdb/rules.snapshot.json` in full; nothing is
   pasted.
4. **Tool registry** — paste the `media-programme` entry from
   `system/rtdb/tools-registry.snapshot.json` into RTDB `tools/`

Then open `/programme/admin/` and press **Seed roster**. That mints a passcode
for each of the current 72 clubs plus the National League, and is
additive and idempotent — re-running after promotion/relegation picks up new
clubs without touching an existing passcode.

> **Leftovers from the first attempt.** The callable version deployed two
> services, `programmeEnter` and `programmeClaim`, before failing on the invoker
> grant. They are no longer in the source, so the next deploy removes them
> (`--force` lets it delete non-interactively). If they linger, they are inert —
> nothing can invoke them — but delete them by hand to keep the console honest.

## Testing

`tests/programme.test.mjs` (`npm test`) covers the pure logic in `_shared.js`,
plus the server's `pickClub` and `normCode` pulled straight out of
`functions/programme.js` — two implementations of normalisation that must not
drift, and a match rule that must ignore a legacy `token` field. Also filename
sanitising, the storage path shape, the shape of a club link, and a check that
`PP.MAX_BYTES` still equals the limit in the Storage rules.

Rules enforcement and the token exchange need a live run. Worth doing by hand
once after deploy:

1. Enter with club A's passcode; confirm the gate resolves (allow a few
   seconds), and that you can browse club B and download.
2. In devtools, try `PP.ref('files/<B>/x').set({...})` → must fail
   `PERMISSION_DENIED`.
3. Try `PP.storageRef('programme/<B>/x').put(...)` → must fail unauthorised.
4. Remove a file as club A; confirm it vanishes and appears under **Removed
   files** in the console; restore it.
5. Regenerate club A's passcode in the console; confirm A's remembered device
   is bounced back to the gate on reload, and that A's **existing link** still
   works with the new passcode — that is the Sutton case.

## Cutover

Done. `/programme-packs/` (Drive + Apps Script) was deleted on 15/08/2026 —
the directory, its `REBUILD.md`, all 17 `pp_*` routes in the shared Apps
Script router, the `tools/media-programme-packs` registry record and the
`app-data/media-programme-packs` rules block. The decision record is in
`system/retired/README.md`. Nothing was migrated, because nothing was in it.

The callables from this tool's first attempt, `programmeEnter` and
`programmeClaim`, are gone too: `deploy-functions.yml` runs
`firebase deploy --force`, which deletes any function absent from source, and
several deploys have shipped since they left it. If either still shows in the
Firebase console, that is the thing to check, not the code.

## Moving behind the portal

**Settled direction (02/09/2026):** this is not a staff tool that clubs are
let into. It is one tool with two faces, and the portal already knows how to
do that — `NL.isClubUser` and the per-role `defaults` in the registry are the
whole mechanism.

- **One page, `/programme/`, under auth-guard.** A club-admin or club-staff
  user lands in the library with their own club's folder writable and every
  other folder readable — exactly today's passcode session, minus the passcode.
  NL staff land in the same library with read-all. Admins get the console's
  jobs (trash, audit, storage) folded in rather than a second page.
- **The registry record moves**, it does not multiply: `url` becomes
  `/programme/`, `label` loses "(admin)", `defaults` widen to
  `club-admin: access`, `club-staff: access`, `staff: access`,
  `admin: admin`, `superadmin: admin`, and `audience` widens from `league`
  so club users can see the card at all.
- **`toolKey` stays `media-programme`.** The `media-` prefix is filing, not
  access — access is the `defaults` block above. Every Storage path and every
  RTDB node is keyed on this string, so renaming it would mean physically
  moving every object in the bucket for a cosmetic gain.

The move itself is still a **deletion**, which is why it was built this way:

- delete `functions/programme.js` and the gate in `index.html`;
- swap `auth.token.pClub === $club` for the portal's
  `users/<uid>/club` equivalent in both rulesets;
- point `/programme/` at auth-guard with `toolKey: 'media-programme'`.

Storage paths, the RTDB shape, the upload code and the audit trail are
unchanged, because the paths are already keyed on the code the portal uses.
Passcodes stay live until every club has a portal login; the two can coexist,
since both end in the same `pClub`-shaped authorisation.
