# Fan widget auth hardening — plan

**Status:** proposed, not started. Written 02/08/2026; revised the same day
after Sports Alliance confirmed no verification material is available, so the
live plan is **§3a (Plan B)**, not §2.
**Applies to:** `embeds/score-predictor.html`, `embeds/motm.html` (both on the
shared `nl-widgets` Firebase project).
**Do this before the widgets are public.** It is not urgent for a preview site.

---

## 1. What is wrong today

Both widgets authenticate to Firebase with `signInAnonymously()`. Anonymous
auth gives `auth.uid` a random value with **no relationship to the fan**. The
fan's real identity is the `id` claim of the NL+ SSO JWT (referred to
throughout the code and this document as the `jwtId`), which Firebase never
sees.

The consequence is that security rules can only ever assert `auth != null` —
"some signed-in client" — never "this fan's own record". And `auth != null` is
not a meaningful barrier: anyone who loads the page has it, and the Firebase
web config is necessarily present in the client bundle, so the same credential
can be obtained and used directly against the REST API.

### Current exposure

| Path | Read | Write | Contains |
|---|---|---|---|
| `users` | **whole tree**, any client | write-once per `$jwtId` | forename, surname initial, club, crest |
| `predictions` | **whole tree**, any client | any client, any `$jwtId` | every fan's scorelines, all season |
| `motm/$jwtId` | any client that knows an id | any client, any `$jwtId` | player picked, free-text note |
| `motm-names/$jwtId` | none | any client, any `$jwtId` | attribution full name |

`users` and `predictions` being readable at the root is what makes the rest
easy: they hand out the complete list of `jwtId`s, which is the only thing
`motm` reads require.

**Not exposed:** passwords, tokens, email addresses, full names (closed in
v2.5 by moving them to `motm-names`, which grants clients no read).

**Exposed:** first name + surname initial + supported club + full prediction
history for every registered fan, plus the free text of nomination notes. And
integrity, not just confidentiality — any client can write to any fan's
predictions or nominations if it knows the id.

Severity is moderate, not critical: it is low-sensitivity personal data and
there is no credential leak. But it is the kind of thing that should not be
true of a public, sponsored page.

---

## 2. Target architecture

```
browser                          mint endpoint (Cloud Function)      Firebase
  |                                        |                            |
  |-- POST /mint  { ssoJwt } ------------->|                            |
  |                                        |-- verify signature         |
  |                                        |   against Sports Alliance  |
  |                                        |-- createCustomToken(       |
  |                                        |     uid = jwtId )          |
  |<------------- { firebaseToken } -------|                            |
  |                                                                     |
  |-- signInWithCustomToken(firebaseToken) ---------------------------->|
  |<-- session where auth.uid === jwtId --------------------------------|
```

Rules then become ownership assertions:

```json
"predictions": {
  "$jwtId": {
    ".read":  "auth.uid === $jwtId",
    ".write": "auth.uid === $jwtId",
    ...
  }
}
```

**The data does not move.** Everything is already keyed by `jwtId`, and the
new `uid` *is* the `jwtId`, so every existing path stays valid. There is no
migration and no backfill — a significant saving, and the reason this is worth
doing properly rather than patching around.

---

## 3. Verified identity is not available

**Sports Alliance will not be providing signature verification material**
(JWKS, shared secret or introspection). Confirmed 02/08/2026.

Without it, §2 cannot be built safely. A mint endpoint that accepts an
unverified token is *worse than doing nothing*: anyone could present a forged
`jwtId` and be handed a Firebase identity for it, turning today's read
exposure into full impersonation. **Do not build the mint endpoint on an
unverified token.** That is the single most important line in this document.

### One check worth doing before accepting this

Discovery endpoints are a convention, not a favour — they are frequently
already public without the provider being asked. Costs ten seconds:

```
https://sso.sportsalliance.com/.well-known/openid-configuration
```

If that returns JSON containing a `jwks_uri`, everything in §2 is back on the
table and no cooperation is needed. Also worth a look: the `iss` claim inside
a real token points at whichever host actually issues it, and
`signin.thenationalleague.org.uk` is an NL-controlled domain — whoever
administers it may have more room than "ask Sports Alliance" implies.

**Until one of those turns something up, proceed with §3a instead.**

---

## 3a. Plan B — mitigation without verified identity

Be clear about what this is: **mitigation, not a fix.** While identity is
asserted by the client and cannot be checked, no rule can express "this fan's
own record". These measures reduce what an attacker can reach and how easily,
they do not make records private in the way §2 would.

Ordered by value for effort:

### 1. Firebase App Check — the biggest single win

Attests that requests come from *your registered app* rather than any client
holding the (necessarily public) Firebase config. Available today, no Sports
Alliance involvement, and the project is already on Blaze.

This closes the easiest attack: lifting the config out of the bundle and
hitting the REST API with a script. It does not stop a determined party
driving a real browser on the real page, so treat it as raising the cost, not
as a wall.

### 2. Make the trees non-enumerable

Move `.read` down to `$jwtId` for `users` and `predictions`, exactly as
already done for `motm`:

```json
"predictions": { "$jwtId": { ".read": "auth != null", ... } }
```

You then have to *know* an id to read a record, rather than listing everyone.
Today `users` and `predictions` hand out the complete set of ids, which is
what makes the rest trivial.

**Worth establishing first: how guessable is a `jwtId`?** If it is a GUID or
similar, non-enumerability is a real barrier. If it is short or sequential,
this step is close to worthless and the effort belongs elsewhere. Decode a
token and look before building on this.

**Blocked by:** the leaderboard, below.

### 3. Server-computed leaderboard (§4)

Needed for step 2 to be possible at all, and independently valuable: once
standings are pre-aggregated, nothing needs to read raw predictions, so the
most detailed personal data in the system stops being publicly readable.

### 4. Store less

The aggregate carries the display names the table needs. Raw records can then
hold less than they do now. Every field not stored is a field that cannot
leak.

### 5. Route writes through a function

A Cloud Function fronting writes can enforce the prediction cutoff and the
nomination window server-side, rate-limit, and reject implausible bulk
activity. It **cannot** prove identity — a caller can still present someone
else's `jwtId` — so this is about integrity and business rules, not
confidentiality. Worth doing after 1–3, not before.

### Residual risk after all of the above

Anyone who obtains a fan's `jwtId` can still read and overwrite that fan's
records. That is inherent to client-asserted identity and does not go away
until §2 becomes possible. Say so plainly to whoever needs to sign this off,
rather than describing the widgets as secured.

---

## 4. The leaderboard problem

This is the part that makes it more than a day's work, and it is easy to miss.

The Score Predictor's leaderboard and club-v-club table read **every fan's**
predictions and user record:

```js
fbDb.ref('users').on('value', ...)         // all registrations
fbDb.ref('predictions').on('value', ...)   // all predictions
```

Under ownership rules those reads are denied and both tables go blank. So
locking down the data **requires** replacing them with a pre-aggregated,
read-only node:

```
leaderboard/
  season/            { rows: [ { name, crest, results, exacts, settled } ] }
  month/{YYYY-MM}/   same shape
  day/{YYYY-MM-DD}/  same shape
  clubs/{scope}/     club accuracy table
  updatedAt
```

Written by a scheduled Cloud Function (admin access bypasses rules), read by
the widget with `".read": "auth != null"` — it contains only what the table
already displays publicly, so a permissive read there is fine.

Consequences to accept:
- Standings become **periodic**, not live. Every 10–15 minutes is ample; they
  only change when matches finish.
- The tie-rank and hide-zero-settled logic moves server-side and must match
  the current client behaviour exactly, or the table visibly changes.
- The Score Predictor's scope filters (season / month / matchday, all clubs /
  own club) each need a corresponding aggregate, or the client filters a
  season-wide aggregate it is allowed to read.

**Team of the Week is unaffected** — since v2.5 it only reads
`motm/{own jwtId}`, so tightening its rules changes nothing about how it
behaves. It could be locked down first, independently, as a smaller proof.

---

## 5. Rollout order (Plan B)

Sequenced so nothing breaks in production at any step.

1. **Check the discovery endpoint** (§3). If it resolves, stop and build §2
   instead — it is strictly better than everything below.
2. **Establish the `jwtId` format.** Decode a live token. This decides whether
   step 5 is worth doing.
3. **Enable App Check** on the `nl-widgets` project, in monitor-only mode
   first so you can see what would be blocked before enforcing.
4. **Build and schedule leaderboard aggregation** (§4), writing to a
   read-only `leaderboard/` node.
5. **Point the Score Predictor at `leaderboard/`** instead of the raw trees.
   Confirm the tables match what they show today before proceeding.
6. **Enforce App Check.**
7. **Move `.read` down a level** on `users` and `predictions`, making the
   trees non-enumerable. Reversible by reverting the rules document.
8. **Optionally**, route writes through a function to enforce windows and
   cutoffs server-side.

Team of the Week needs none of steps 4–5: since v2.5 it reads only
`motm/{own jwtId}`, so it is already compatible with step 7.

## 6. Effort and risks

**Plan B is roughly two to three days**: App Check is hours, leaderboard
aggregation and matching the existing table behaviour is the bulk of it, rules
and testing the rest. Plan A (§2), if the discovery check ever unblocks it,
adds about another day on top for the mint endpoint and the widget sign-in
change.

Risks worth naming up front:

- **Unverifiable SSO tokens** (§3). Already realised — this is why Plan B
  exists. The residual risk it leaves is permanent until that changes.
- **App Check is not identity.** It attests the app, not the fan. Do not let
  it be reported as "the widgets are now secure".
- **A new runtime dependency.** Today the widgets need only Firebase and NLS.
  After this they also need the mint endpoint; if it is down, nobody can sign
  in. Hence the staged fallback in step 4 and its removal only at step 9.
- **Token lifetime.** Custom tokens are single-use and short-lived, but the
  Firebase session that results is long-lived and refreshes itself. If the
  fan's SSO session expires, their Firebase session does not. Decide whether
  that matters — it probably does not for a nominations widget, but it is a
  deliberate decision rather than an oversight.
- **Aggregation drift.** If the server tally and the old client tally disagree,
  fans will notice a leaderboard that changed overnight. Compute both and
  compare before switching.

---

## 7. What not to do

- **Do not** mint tokens without verifying the signature. It turns a read
  exposure into impersonation. This is the whole reason Plan A is parked.
- **Do not** put the widgets behind ownership rules before the leaderboard
  aggregation exists — the Score Predictor's tables will silently empty.
- **Do not** try to fix this with obscurity (hashing ids, renaming paths).
  The client is public; the only real fix is server-verified identity.
