# GAS authz — invite & approval actions (Phase 7)

**Status:** client-side fix landed in this PR (`portal/index.html` v5.95 +
`gas/Notifications.gs` mirror). **The GAS-side guards below must be pasted into
the Apps Script project and re-deployed (new version of the existing
deployment) for the fix to take effect.** Until then the hole is open.

## The vulnerability (critical — privilege escalation)

The consolidated Apps Script web app is deployed **Execute as: Me / Who has
access: Anyone**, and its `/exec` URL is public (it ships in `nl-utils.js` as
`NL.endpoints.gas`). `doPost` (see `gas/Code.gs`) dispatches on `action` with
**no authentication** — every handler runs with the owner's identity and the
`RTDB_SECRET`, which bypasses all Realtime Database security rules.

`sendInvite` (Invite.gs) writes `/admin/invites/<token>` with a caller-supplied
`role` — including `admin` / `superadmin` — using that god-mode secret. Chain:

1. Attacker POSTs `{action:'sendInvite', email:'them@…', role:'superadmin'}` to
   the public URL. Invite is written; an invite email is sent from the org alias.
2. They accept, set a password, sign in.
3. `portal/index.html` consumes the invite and writes
   `users/<uid>/role = invite.role` on first login (a self-created record the
   RTDB rules permit).
4. They are now superadmin. Full takeover.

The four **notification** handlers (`notifyAdmin`, `confirmRequest`,
`sendApproval`, `sendRejection`) only send email — they don't write roles — but
`sendApproval`/`sendRejection` represent an **admin decision**, so an
unauthenticated caller can send "approved/rejected" mail from the org alias to
any address. `notifyAdmin`/`confirmRequest` are fired by the *pre-registration*
request form (the requester has no account yet), so they **cannot** require an
ID token — they need a separate abuse control (reCAPTCHA / rate limit), tracked
as a follow-up, not fixed here.

## The fix

Three parts. The client half (parts 3) is committed in this PR; parts 1–2 are
GAS and must be pasted + redeployed.

### 1. `Utils.gs` — one shared verifier (reuses the ProgrammePacks pattern)

Add this function. It mirrors `pp_verifyToken_` in
`programme-packs/gas/ProgrammePacks.gs` so there is **one** verifier across the
backend (verify the Firebase ID token → resolve the caller's role from RTDB):

```javascript
/* ---- Shared caller verification (privileged actions) ---------------------
   Verify a Firebase ID token from the client and resolve the caller's role
   from RTDB. Returns { ok:true, user:{uid,email,role,club} } or { ok:false,
   error }. Mirrors ProgrammePacks.gs pp_verifyToken_ — keep them in step. */
function verifyCaller_(idToken) {
  if (!idToken) return { ok: false, error: 'Sign-in required.' };
  var config = getConfig();
  var apiKey = PropertiesService.getScriptProperties().getProperty('FIREBASE_API_KEY');
  if (!apiKey)          return { ok: false, error: 'FIREBASE_API_KEY not set.' };
  if (!config.rtdbUrl)  return { ok: false, error: 'RTDB_URL not set.' };
  try {
    var resp = UrlFetchApp.fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + apiKey,
      { method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return { ok: false, error: 'Invalid or expired sign-in.' };
    var data = JSON.parse(resp.getContentText());
    if (!data.users || !data.users[0]) return { ok: false, error: 'Token has no user.' };
    var u = data.users[0];
    var prof = rtdbRead(config.rtdbUrl + '/users/' + u.localId + '.json', config.rtdbSecret);
    if (!prof.ok || !prof.data) return { ok: false, error: 'No user profile.' };
    return { ok: true, user: { uid: u.localId, email: u.email,
             role: prof.data.role || 'club', club: prof.data.club || null } };
  } catch (e) {
    return { ok: false, error: 'Verification failed: ' + e.message };
  }
}
```

### 2a. `Invite.gs` — gate `sendInvite`

Insert at the **very top** of `sendInvite(body)`, before any other work:

```javascript
  /* --- AuthZ: league admins only may invite; only a superadmin may mint an
         admin/superadmin invite (no privilege escalation via invite). --- */
  var caller = verifyCaller_(body.idToken);
  if (!caller.ok) return { ok: false, error: caller.error };
  if (caller.user.role !== 'admin' && caller.user.role !== 'superadmin') {
    return { ok: false, error: 'Admins only.' };
  }
  /* Tier the effective role. On resend, body.role may be blank and the stored
     invite's role is reused — apply the SAME check to whatever role will be
     written (resolve it from the existing /admin/invites record if blank). */
  var wantRole = String(body.role || '').trim();
  if ((wantRole === 'admin' || wantRole === 'superadmin') &&
      caller.user.role !== 'superadmin') {
    return { ok: false, error: 'Only a superadmin can invite an admin or superadmin.' };
  }
```

> If your `sendInvite` reuses an existing invite's role when `body.role` is
> empty (the resend paths), resolve that stored role first and run the
> `wantRole` tier-check against it too — otherwise a plain admin could resend a
> pending superadmin invite.

### 2b. `Notifications.gs` — gate `sendApproval` and `sendRejection`

Insert at the **very top** of **both** `sendApproval(body)` and
`sendRejection(body)`:

```javascript
  var caller = verifyCaller_(body.idToken);
  if (!caller.ok) return { ok: false, error: caller.error };
  if (caller.user.role !== 'admin' && caller.user.role !== 'superadmin') {
    return { ok: false, error: 'Admins only.' };
  }
```

Leave `notifyAdmin` and `confirmRequest` **unchanged** — they are the
pre-registration request flow and have no signed-in caller. (Mirrored in
`gas/Notifications.gs` in this repo, with the guards applied.)

### 3. Portal client — send the token (DONE in this PR)

`portal/index.html` v5.95 adds `nlGasFetch(payload)`, which attaches a fresh
`firebase.auth().currentUser.getIdToken()` as `payload.idToken`. The five
sensitive call sites (`sendInvite` ×3, `sendApproval`, `sendRejection`) now
route through it. `notifyAdmin`/`confirmRequest` in the root `index.html`
request form are left as bare fetches (pre-auth by design).

## Deploy checklist

1. Paste `verifyCaller_` into **Utils.gs**.
2. Add the guard to **`sendInvite`** (Invite.gs) and the tier check.
3. Add the guard to **`sendApproval`** + **`sendRejection`** (Notifications.gs)
   — or paste the mirrored `gas/Notifications.gs` from this repo.
4. **Deploy → Manage deployments → ✎ existing Web App deployment → New
   version → Deploy** (keeps the `/exec` URL stable).
5. Smoke test: signed-in admin can still invite/approve/reject; a raw
   `curl`/POST with no `idToken` (or a club-role token) gets `Admins only.`;
   an admin cannot mint a `superadmin` invite.

## Follow-up (separate)

`notifyAdmin` / `confirmRequest` remain open to email-spam from the org alias
(pre-auth by necessity). Proper fix: reCAPTCHA v3 token on the public request
form, verified GAS-side, and/or a per-email rate limit. Tracked, not in this PR.
