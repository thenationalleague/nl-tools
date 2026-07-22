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

## ⚠️ Update — GAS `consumeInvite` abandoned (Workspace blocks it)

The GAS approach below was built and deployed, then **reverted** (login page
v4.7). The `nl-tools` Apps Script web app is owned by a Google **Workspace** that
**blocks anonymous access to Apps Script web apps at the org level** — an invitee
who is not signed into a Google account (every **club** invitee, and staff
accepting in a fresh browser) gets *"Sorry, unable to open the file"* and never
reaches the script. GAS web apps sit behind a Google-account gate that a
brand-new Firebase user cannot pass, so GAS is the wrong home for a
signup-time endpoint.

**Current state:** invite acceptance is back to the **client-side write** (works
for everyone). The takeover vector stays closed by the interim `users/$uid`
`.validate` rule (blocks self-granted admin/superadmin). The GAS `consumeInvite`
code remains mirrored in `gas/Invite.gs` as the reference implementation but is
**not called**.

**The real durable fix → a Firebase Cloud Function.** A callable/HTTPS Function
verifies the Firebase ID token and is reachable by any Firebase-authenticated
user (no Google-account gate), so a club invitee *can* call it. Port the
`consumeInvite` logic there, then: client calls the Function instead of writing
its own role, and the rule tightens to forbid client role writes (also closing
the self-signup-as-`staff` gap and restoring direct admin invites). This is
Phase 2 of `system/gas-to-functions-migration.md` and is now the path of record.

## The (reverted) GAS approach — kept for reference

Roles are now written by the **trusted backend**, never self-asserted by the
client. Landed in code:

- **`gas/Utils.gs`** — `verifyIdentity_(idToken) → {uid,email}` (verifies the
  token without needing an RTDB profile — the profile is being created);
  `verifyCaller_` refactored to reuse it.
- **`gas/Invite.gs`** — new **`consumeInvite(body)`**: verifies the ID token,
  re-validates the invite (email match, unused, unexpired), writes
  `users/<uid>/{role,tools,…}` with the RTDB secret, marks the invite used, and
  clears the pending record. `gas/Code.gs` routes `consumeInvite`.
- **`index.html`** (login page, v4.6) — `doSetPassword()` pre-checks the invite,
  creates the account, then calls `consumeInvite` with a fresh ID token. It **no
  longer writes `users/<uid>/role` itself.**

Because the server writes the role with the secret (bypassing rules), this
**restores direct admin/superadmin invites** — they no longer trip the interim
`.validate`.

### Deploy order (must be in this sequence)

1. **Paste the updated GAS** (`Utils.gs`, `Invite.gs`, `Code.gs`) and redeploy
   the web app (new version of the existing deployment).
2. **Ship the client** — merge the PR so `index.html` v4.6 deploys to Pages.
3. **Verify** end-to-end: accept a fresh **staff** invite and a fresh **admin**
   invite — both should complete and land in the portal.
4. **Then tighten the rule** to also block self-signup as `staff` (the last
   residual gap). Only safe *after* step 2, because until then the old client
   still self-writes `staff` on invite acceptance. Replace the `users/$uid`
   `.validate` with:

   ```
   ".validate": "root.child('users').child(auth.uid).child('role').val() === 'admin' || root.child('users').child(auth.uid).child('role').val() === 'superadmin' || !newData.child('role').exists() || newData.child('role').val() === 'club' || newData.child('role').val() === 'club-viewer'"
   ```

   *Writer is already admin/superadmin (any role), OR no role is set, OR the role
   is a self-service club role (`club`/`club-viewer`, for the request-access
   flow).* Self-signup as `staff`/`club-admin`/`admin`/`superadmin` is now
   impossible; invited users of any role still work (the server writes those).
   Test in the Playground first, then update `rules.snapshot.json` to match.

This is also a natural Phase-2 item in the Cloud Functions migration
(`system/gas-to-functions-migration.md`); the GAS `consumeInvite` becomes a
callable there.

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
