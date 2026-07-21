# RTDB authz — self-granted role escalation (critical)

**Status:** interim rule fix landed in `rules.snapshot.json` (this PR).
**You must paste the updated rules into the Firebase console** (Realtime
Database → Rules) and **test in the Rules Playground first** (steps below) for
the fix to take effect. Sessions cannot reach the live rules; this file + the
snapshot are the record.

## The vulnerability (worse than the GAS invite hole)

Firebase email/password **signup is open** — the login page calls
`createUserWithEmailAndPassword` directly (`index.html`, the request-access
flow), and the Web API key is public, so the Identity Toolkit signup endpoint is
callable by anyone regardless of the UI.

On first login the client writes its **own** role. The old `users/$uid` rule:

```
".write": "auth != null && ((auth.uid === $uid && !data.exists()) || <caller is admin/superadmin>)"
```

allows a user to create their own record when it doesn't yet exist — **with no
validation on the `role` field**. So:

1. Attacker calls the public signup endpoint → gets a uid + auth token.
2. Writes `users/<uid> = { role: "superadmin" }` straight to RTDB (the rule
   permits the self-create).
3. `auth-guard` reads `users/<uid>/role` → grants superadmin. **Full takeover.**

No invite, no GAS, no token. **This bypasses the entire Phase-7 GAS invite fix** —
that fix stops a bad *invite* being minted; this needs no invite at all. Note
too: a self-granted **admin** can then set their own role to **superadmin** (the
admin write path allows writing any `users/$uid`), so admin is as dangerous as
superadmin here — both must be blocked.

## The interim fix (in this PR — rule only, no code change)

Add a `.validate` on `users/$uid`:

```
".validate": "root.child('users').child(auth.uid).child('role').val() === 'admin' || root.child('users').child(auth.uid).child('role').val() === 'superadmin' || (newData.child('role').val() !== 'admin' && newData.child('role').val() !== 'superadmin')"
```

Reads as: **either the writer is already an admin/superadmin (they may set any
role — this is the admin user-editor / elevation path), or the new record's role
is not `admin`/`superadmin`.** A self-signer, who has no role yet, can no longer
make themselves admin or superadmin. **This closes the catastrophic takeover.**

Also tightened in this PR: `admin/requests` `.write` `true` → `auth != null`
(the request flow creates the account first, so it's always authenticated — this
just blocks anonymous writes to the requests node).

### Known trade-off of the interim fix
The rule cannot distinguish a *legitimate* admin/superadmin **invite
acceptance** from a forged self-grant — both are "an unprivileged user writing
`role = admin` on a fresh record." So while this rule is in place, a **new admin
cannot self-accept an admin invite**. Workaround: invite them as `staff`/club,
then an existing admin elevates them in the portal user-editor (that write is
allowed — the caller is already an admin). Inviting brand-new admins is rare;
elevation-after-signup is the normal path.

## The proper fix (follow-up — closes the residual gaps)

Move **all role writes server-side** so the client never asserts its own role:

1. Client creates the auth account, then calls a GAS/Function `consumeInvite`
   action with `{ token, idToken }` instead of writing `users/<uid>/role` itself
   (`index.html` ~line 835).
2. `consumeInvite` verifies the idToken (gets the uid), validates the invite
   (token + email match, unused, unexpired), then writes `users/<uid>/{role,
   tools,…}` with the RTDB secret and marks the invite used.
3. Rule tightens so a self-created record **cannot set `role` at all** (only the
   server, via the secret, may) — which also closes the **"self-signup as
   `staff` → into internal staff tools"** gap the interim rule still leaves open,
   and **restores direct admin/superadmin invites** (the server writes them).

This is a natural Phase-2 item in the Cloud Functions migration
(`system/gas-to-functions-migration.md`), but can be done on GAS first.

## Playground test steps (do before pasting live)

Firebase console → Realtime Database → Rules → **Rules Playground**:

1. **Deny self-grant.** Location `/users/ATTACKER_UID`, Write, Authenticated as
   `ATTACKER_UID` (a uid with no existing `users` record), data
   `{ "role": "superadmin", "email": "x@y.com" }` → **expect: denied.** Repeat
   with `"role":"admin"` → **denied.**
2. **Allow normal self-signup.** Same, data `{ "role": "club", "email": "…" }`
   → **expect: allowed.**
3. **Allow admin elevation.** Location `/users/SOMEONE`, Write, Authenticated as
   an existing **admin** uid, data `{ "role": "superadmin" }` → **allowed.**

If all three behave as above, paste the full rules document into the console.

## Also on the radar (lower severity — not fixed here)
- `admin/invites/$token` `.read: true` — public read of an invite record (needs
  the UUID). The acceptance page reads it pre-auth (`index.html` ~line 819), so
  tightening requires routing that read through GAS `validateInvite`. Fold into
  the proper fix.
- `admin/audit` `.write: auth != null` — any signed-in user can write audit
  entries. By design (every user's actions are audited); accepted.
- AI-proxy cost-abuse (Claudio, Meeting Notes, dead `chaseEmail`) — unrelated
  GAS item tracked in the migration plan.
