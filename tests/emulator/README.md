# Emulator tests

Rules tests that need the Firebase emulator, so they are **not** in `npm test`
(which is zero-dependency and gates every PR). Run them by hand when the rules
they cover change. They read `system/rtdb/rules.snapshot.json` and
`system/storage/rules.snapshot.rules` directly, so they test what deploys.

Needs Java and, in a scratch directory outside the repo:

```bash
npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10
```

Then copy the test into that directory (Node resolves the packages from the
file's own location) and run it there, pointing `NL_REPO` back at the repo, with
a `firebase.json` that enables the database (port 9000) and storage (port 9199)
emulators:

```bash
cp /path/to/nl-tools/tests/emulator/matchday-live-rules.mjs .
NL_REPO=/path/to/nl-tools npx firebase emulators:exec --project demo-mdl \
  --only database,storage "node --test matchday-live-rules.mjs"
```

The file name deliberately does not end `.test.mjs`, so the CI glob
(`tests/*.test.mjs`) cannot pick it up and fail for want of an emulator.

The three `.cjs` drivers run the real code rather than the rules alone. Copy
them into the same scratch directory and run them the same way, with the auth
emulator (port 9099) added. They also need, in that directory:

```bash
ffmpeg -f lavfi -i testsrc=size=360x640:rate=30 -t 4 -pix_fmt yuv420p portrait.y4m
ffmpeg -f lavfi -i testsrc=size=360x640:rate=30 -t 2 -pix_fmt yuv420p -c:v libx264 sample.mp4
ln -s "$(npm root -g)/playwright" node_modules/playwright
(cd /path/to/nl-tools/functions && npm ci)
NL_REPO=/path/to/nl-tools npx firebase emulators:exec --project nl-tools \
  --only database,storage,auth \
  "node matchday-live-functions.cjs && node matchday-live-feed.e2e.cjs && node matchday-live-capture.e2e.cjs"
```

The browser drivers serve the Firebase SDK from the local `firebase` package
(the sandbox could not reach gstatic) and switch off Chromium's local-network
checks so the page may call the emulator ports. Neither is a change to the pages.

| File | Covers |
|---|---|
| `matchday-live-rules.mjs` | `app-data/media-matchday-live` and Storage `matchday-live/**`: who reads what, the contributor's create-then-finish clip lifecycle, the 30-second pace and 20-a-day count, rotated and deactivated links refused at once, reviewer vs Manage, the 26-hour late window, test links. |
| `matchday-live-functions.cjs` | `functions/matchday-live.js` itself: the auth trigger grants, refuses a deactivated or malformed token and deletes the request; the sync skips the Cup, auto-matches within ±2 minutes, no-ops on an unchanged ingester run and writes only matches that moved; the 7-day backfill; retention purges a rejected clip after 7 days and drops a stuck upload. |
| `matchday-live-capture.e2e.cjs` | The capture page in Chromium with a fake portrait camera. |
| `matchday-live-feed.e2e.cjs` | The staff feed behind the real auth-guard. |

`save-of-the-month-rules.mjs` covers `app-data/media-save-of-the-month`: database
emulator only, so `--only database` and project `demo-sotm`.
