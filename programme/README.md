# Programme Packs (`/programme`)

A 73-folder asset library for match-day programme production, on Firebase
Storage. Replaces `/programme-packs/` (Google Drive via Apps Script), which is
retired — see [Cutover](#cutover).

| Page | Who | Gets in via | Can do |
|---|---|---|---|
| `/programme/` | **The 72 clubs** | own `?c=<token>` link **plus** their 6-character passcode, or the passcode alone | Browse and download **every** club's folder. Upload, organise into folders, and remove files **in their own folder only** |
| `/programme/` | **NL commercial** | the 73rd (National League) passcode | Everything a club can do, in the **National League** folder — plus set the used-from/used-until window on an advert |
| `/programme/admin/` | **NL admin/superadmin** | **portal login** (auth-guard, `media-programme`) | Seed/sync the roster, see and regenerate every passcode + link, export the access CSV, restore or permanently delete removed files, read the audit trail |

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

**The National League folder is pinned above every view**, in both the
directory and inside any club's folder. Adverts carry an optional
`usedFrom`/`usedUntil` window so an editor sees what belongs in *this*
weekend's programme rather than a pile of thirty PNGs by October. Undated NL
assets (spec sheets, the league wordmark) are evergreen, not out of date.

**Folders are owned by the club, not mandated.** Three are seeded on a club's
first visit (Crest & Logos, Photos, Club Info) and can be renamed, deleted or
added to freely. They exist so 72 clubs converge on a common shape by inertia —
there is no cross-club search, so the reader's only navigation aid is that most
folders are named the same thing.

## Access — how write-own is actually enforced

This is the part worth reading before changing anything.

A club types a passcode. It is **not** checked in the browser. It goes to the
`programmeEnter` callable (`functions/programme.js`), which validates it with
the Admin SDK and returns a **custom token carrying a `pClub` claim** — the
club's clubs-meta code, or `NL`. Storage and RTDB rules then enforce write-own
against a claim the browser cannot forge.

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
  token minted by `programmeClaim` after it checks the caller's portal role
  server-side. The portal session is never modified and no custom claims are
  written onto real user accounts.
- **Brute force** is capped at 20 failed attempts per IP per hour, counted in a
  node no client can read or write.
- A leaked passcode or link is fixed by regenerating it in the console, which
  kills the old one instantly — including on any device that remembered it.

Passcodes use the unambiguous alphabet (no `0`/`O`/`1`/`I`/`L`), same as
`/uw-promo/`, so a printed NL access card reads consistently whichever tool
issued it. A device remembers its passcode for 30 days; **Not you?** clears it.

## Data

RTDB `app-data/media-programme/`:

```
config/
  clubs/<CODE>   { name, division, passcode, token, addedAt }   # pClub '*' only
  nl             { name, passcode, token, addedAt }             # the 73rd code
folders/<CODE>/<folderId>  { name, sortOrder, createdAt }
files/<CODE>/<fileId>      { name, folderId, size, contentType, storagePath,
                             url, uploadedAt, usedFrom?, usedUntil? }
trash/<CODE>/<fileId>      { ...file, deletedAt }
audit/<pushId>             { ts, actor, actorLabel, action, club?, detail? }
rate/<ip>                  brute-force counters (Admin SDK only)
```

Bytes: Storage `programme/<CODE>/<folderId>/<fileId>-<name>`.

`<CODE>` is the **clubs-meta 3-letter code** (or `NL`) — deliberately the same
key the portal uses. Getting this right on day one is free; getting it wrong
would mean physically moving every object in the bucket at cutover.

`url` is the download URL, stored on the record at upload time. Rendering a
folder otherwise costs one `getDownloadURL` round-trip per file, which is what
makes a 60-file folder feel broken.

Rules: `system/rtdb/rules.snapshot.json` (`app-data/media-programme`) and
`system/rtdb/storage.rules.snapshot` (`match /programme/{club}/{allPaths=**}`).

## Deploying

Nothing here auto-deploys. Four steps, all owner-run:

1. **Functions** — `firebase deploy --only functions:programmeEnter,functions:programmeClaim`
2. **Storage rules** — paste `system/rtdb/storage.rules.snapshot` into
   Firebase console → Storage → Rules
3. **RTDB rules** — paste `system/rtdb/rules.snapshot.json` into
   Firebase console → Realtime Database → Rules
4. **Tool registry** — paste the `media-programme` entry from
   `system/rtdb/tools-registry.snapshot.json` into RTDB `tools/`

Then open `/programme/admin/` and press **Seed roster**. That mints a passcode
and link for each of the current 72 clubs plus the National League, and is
additive and idempotent — re-running after promotion/relegation picks up new
clubs without touching an existing passcode.

> **One deploy-time risk.** `programmeEnter` is invoked by callers with no
> Firebase account at all, so its Cloud Run service must accept unauthenticated
> invocation. `footage/NEXT.md` records a `getFootageUrl` callable being blocked
> by the org's Domain Restricted Sharing policy for exactly this reason
> (13/07/2026). The `account.js` callables have worked from the browser since
> (`consumeInvite`, live 25/07/2026), which is the same invocation path, so this
> should be fine — but if `programmeEnter` returns 403 on first call, that
> policy is the cause. Fallback: move validation to an RTDB-triggered signer, or
> grant this one service `allUsers` invoker.

## Testing

`tests/programme.test.mjs` (`npm test`) covers the pure logic in `_shared.js`:
passcode normalisation (**including a check that it still matches the server
copy in `functions/programme.js`** — two implementations that must not drift),
filename sanitising, the storage path shape, the advert-window state machine,
and a check that `PP.MAX_BYTES` still equals the limit in the Storage rules.

Rules enforcement and the token exchange need a live run. Worth doing by hand
once after deploy:

1. Enter with club A's passcode; confirm you can browse club B and download.
2. In devtools, try `PP.ref('files/<B>/x').set({...})` → must fail
   `PERMISSION_DENIED`.
3. Try `PP.storageRef('programme/<B>/x').put(...)` → must fail unauthorised.
4. Remove a file as club A; confirm it vanishes and appears under **Removed
   files** in the console; restore it.
5. Regenerate club A's passcode in the console; confirm A's remembered device
   is bounced back to the gate on reload.

## Cutover

`/programme-packs/` (Drive + Apps Script) is superseded. Retiring it is a
separate, deliberate step and is **not** done in this change:

- delete `programme-packs/` and its `pp_*` actions in the shared Apps Script
  project's `doPost` router;
- remove `tools/media-programme-packs` from RTDB (until then the portal shows
  two Programme Packs cards) and from
  `system/rtdb/tools-registry.snapshot.json`;
- drop `app-data/media-programme-packs` and its rules block.

There is nothing to migrate — the Drive tool is unused.

## Moving behind the portal

The eventual move is a **deletion**, which is why it was built this way:

- delete `functions/programme.js` and the gate in `index.html`;
- swap `auth.token.pClub === $club` for the portal's
  `users/<uid>/club` equivalent in both rulesets;
- point `/programme/` at auth-guard with `toolKey: 'media-programme'`.

Storage paths, the RTDB shape, the upload code and the audit trail are
unchanged, because the paths are already keyed on the code the portal uses.
