# Fan widget auth hardening — plan

**Status:** proposed, not started. Written 02/08/2026.
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

## 3. The question that gates the whole thing

**Can we verify the Sports Alliance JWT's signature server-side?**

Everything above depends on it. If the mint endpoint accepts an unverified
token it is *worse than today*: anyone could forge a `jwtId` and be handed a
Firebase identity for it, converting a read-exposure into full impersonation.

What we need from Sports Alliance, in order of preference:

1. A **JWKS endpoint** (public keys) plus the expected `iss` and `aud` values.
   Standard, no shared secrets, keys rotate cleanly. This is the normal answer
   and almost certainly exists.
2. A **shared secret** if the tokens are HMAC-signed (`HS256`). Workable, but
   the secret must live only in function config, never in a widget.
3. A **token introspection / userinfo endpoint** we can call server-to-server
   to validate a token and get the claims back. Slower (a network hop per
   sign-in) but acceptable.

If none of these are available, the fallback is for NL to run its own exchange
at `signin.thenationalleague.org.uk` — which is a conversation with whoever
owns that, not something the widgets can solve.

**Action: ask Sports Alliance for the JWKS URL, issuer and audience before any
code is written.** The rest of the plan is straightforward; this is the risk.

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

## 5. Rollout order

Sequenced so nothing breaks in production at any step.

1. **Discovery** — obtain JWKS/issuer/audience from Sports Alliance (§3).
2. **Enable billing.** Cloud Functions need the Blaze plan to make outbound
   requests (fetching JWKS is outbound). Cost at this traffic is pennies, but
   it is a plan change someone has to approve.
3. **Build the mint endpoint.** Verify signature, expiry, issuer, audience.
   Mint with `uid = jwtId`. Rate-limit per IP. Log failures without logging
   token contents.
4. **Widgets sign in with the custom token**, falling back to anonymous if the
   endpoint fails, while rules are still permissive. Nothing changes for fans;
   this proves the token path in production.
5. **Verify** `auth.uid === jwtId` for real sessions before touching rules.
6. **Lock Team of the Week first** — `motm` and `motm-names` to ownership
   rules. Smallest blast radius, no aggregation needed.
7. **Build and schedule leaderboard aggregation**, and point the Score
   Predictor at `leaderboard/` instead of the raw trees. Confirm the tables
   match what they show today.
8. **Lock `predictions` and `users`** to ownership rules.
9. **Remove the anonymous fallback** from step 4, so a mint failure is a hard
   failure rather than a silent downgrade to the weak path.

Steps 6 and 8 are the only ones that can break a fan's experience, and both
are reversible by reverting the rules document.

---

## 6. Effort and risks

Realistically **several days**, not an afternoon — and dependent on §3
resolving quickly. Roughly: half a day for the function, half for the widget
sign-in changes, one to two days for leaderboard aggregation and matching the
existing table behaviour, plus rules and testing.

Risks worth naming up front:

- **Unverifiable SSO tokens** (§3). Blocks everything. Ask first.
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
  exposure into impersonation.
- **Do not** put the widgets behind ownership rules before the leaderboard
  aggregation exists — the Score Predictor's tables will silently empty.
- **Do not** try to fix this with obscurity (hashing ids, renaming paths).
  The client is public; the only real fix is server-verified identity.
