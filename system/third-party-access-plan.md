# Third-party access by passcode — plan

**Status:** proposal, not built. Written 10/08/2026 for Richard to react to
before any code lands.

The question that started it: *can we drop `third-party` status and instead
issue an 8-character passcode that grants viewer access to a handful of tools?*

The short answer is yes, and it is much cheaper than it looks — but the thing
that changes is **how a third party authenticates**, not **what the role is**.
Those are two different questions and only one of them wants an answer.

---

## Keep the role, change the credential

`third-party` is not just a label on an account. It is:

- the **audience gate** — `NL.roles.realm('third-party') === 'external'`, which
  is how a tool says "clubs and outsiders never open this";
- the **defaults key** — a role absent from `tools/<toolKey>/defaults` resolves
  to `off`, which is exactly why third parties start with zero access and are
  granted tools one at a time;
- the thing the portal branches on in a dozen places (`isRestrictedRole`,
  the org-name field, the padlocked admin stop, the hidden version badge).

Delete it and all of that has to be reinvented under another name. So the role
stays. What goes is the **email-and-password account** behind it: instead of
inviting a photographer to set a password, we issue them a passcode.

---

## The one fact that makes this cheap

`system/auth-guard.js` does not care how you signed in. It waits for a live
Firebase Auth user, then reads `users/<uid>/role` and `tools/<toolKey>` and
decides. It never looks at the provider.

So if a passcode-mint function creates a `users/tp-<key>` record with
`role: 'third-party'` and a tools map, and hands back a custom token for uid
`tp-<key>`, then **the portal, the topbar, the tool cards, the access
fallback, and audit all work unchanged**. RTDB rules already allow
`auth.uid === $uid` to read its own `users/$uid` record, so nothing in
`rules.snapshot.json` needs to move for the sign-in itself.

That is the whole trick. The passcode is a different front door into the same
building, not a second building.

### What does change

| Layer | Change |
|---|---|
| `system/auth-guard.js` | **One small addition, optional but recommended** — honour an `until` (expiry) on the user record and treat an expired account as `off`. Nothing else. |
| `functions/` | One new file, `third-party.js` — the mint trigger. Auto-deploys on merge. |
| `index.html` (sign-in) | A "Have a passcode?" panel alongside sign-in / forgot / set-password. |
| `portal/index.html` | A **Passcodes** tab in the admin panel. |
| `system/rtdb/rules.snapshot.json` | Rules for the new `authRequests` / `authGrants` / `config` / `rate` nodes. One button press to deploy. |
| Every tool | Nothing. |

---

## The credential

**Eight characters, formatted in two groups: `K7QM-3PXR`.**

- **Alphabet:** a 32-character set with the ambiguous glyphs removed — no
  `0`/`O`, no `1`/`I`/`L`. These get read off a screen, emailed, and retyped,
  and "is that a one or an ell" is the failure mode that generates support
  emails. Input is upper-cased and stripped of the hyphen before comparison,
  so how someone types it does not matter.
- **Space:** 32^8 ≈ 1.1 trillion. This is the first credential in this
  codebase big enough that the throttle is a safety net rather than the entire
  control — contrast the six-digit Club Directory code (10^6), where
  `functions/club-directory.js` has to run a tight global ceiling to keep an
  exhaustive search out of reach.

### Locking, and the trap in "locks after 3 fails"

Lock the **attempting session**, never the **code**.

Every attempt in this family runs under a fresh anonymous uid, and anonymous
uids are free to mint — `functions/uw-promo.js` says so in its own comments.
So a per-uid counter is honest-mistype protection, not a security control:

- **3 failures per uid** → that session is done. Matches the ask, and no real
  person mistypes four times.
- **A global ceiling** (order of 60 failures in 10 minutes) → the actual bound
  on a distributed guess, same shape as the three existing gates.
- **Never a counter on the code itself.** If three wrong guesses disabled a
  passcode, anyone could disable any third party's access by guessing three
  times at random. That is a denial-of-service handed out for free, and at
  32^8 there is no benefit to buy with it.

### Expiry

Third-party access is time-boxed by nature — a season, a tournament, a tender,
a photographer's contract. So every passcode carries an `until` date, and the
portal shows it. This is a genuine gain over the current model, which has no
concept of an end date and relies on someone remembering to revoke.

### Revocation, and what actually stops access

Two levers, and it is worth knowing which one bites when:

1. **Flag the code `revoked`** — stops any *new* sign-in immediately.
2. **Set the user record to no access** — bites at the next page load,
   because auth-guard re-reads `users/<uid>` on every load and never trusts
   the cached session. This is the one that matters, and it needs no function
   call.

A custom-token session persists and refreshes itself, so revoking the code
alone leaves an already-signed-in device working until it reloads. Doing both
is the correct habit; the admin UI should do both from one button. (The
belt-and-braces option, `admin.auth().revokeRefreshTokens(uid)`, is available
to the Admin SDK if we ever want the harder guarantee.)

---

## Data model

Everything lives under a single root, `app-data/ops-access`, so this is one
tool's worth of config rather than a special case bolted to the portal.

```
app-data/ops-access/
  config/                       ← no client can read or write this, ever
    codes/
      <key>/                    ← push key, e.g. -Ox9…
        code:     "K7QM3PXR"    ← stored normalised (no hyphen, upper)
        org:      "Getty Images"
        name:     "Getty Images — match photography"
        tools:    { "media-graphics": "access", … }
        until:    1767225600000 ← epoch ms, or absent for open-ended
        revoked:  false
        issued:   { at, by }
  authRequests/<uid>            ← { code, at } — deleted by the trigger
  authGrants/<uid>              ← { ok, customToken, … } — deleted by client
  rate/
    uid/<uid>                   ← failure count, cleared on success
    global                      ← { n, first }
```

And the minted session's portal identity:

```
users/tp-<key>/
  role:  "third-party"
  org:   "Getty Images"
  name:  "Getty Images"
  tools: { … }                  ← mirrored from the code record at mint time
  until: 1767225600000
  via:   "passcode"             ← so the portal can show how they got in
```

Mirroring `tools` onto the user record (rather than pointing at the code) keeps
auth-guard's read exactly as it is today: one record, one lookup, no special
case for passcode users.

---

## The function

`functions/third-party.js` — an `onValueWritten` trigger on
`app-data/ops-access/authRequests/{uid}`, deliberately the same shape as
`club-directory.js`, `programme.js` and `uw-promo.js`. Anyone who has read one
has read this.

Why a trigger and not a callable, again: the project carries an org policy
blocking `allUsers` on new Cloud Run services, so a callable cannot be given a
public invoker, and third parties have no Google account. The RTDB-triggered
path is the org-policy-proof route. Eventarc costs a few seconds, which is
fine for a gate a device hits once.

The trigger, in order: delete the request (it holds a passcode in plain text);
check the throttle; normalise and match the code against `config/codes`;
reject expired or revoked; write/refresh `users/tp-<key>`; mint a custom token
for uid `tp-<key>`; write the grant.

---

## Where the passcode gets typed

The root sign-in page (`/index.html`) already switches between panels —
sign in, forgot password, set password from invite. A fourth panel joins them,
reached from a quiet "Have a passcode?" link under the sign-in form. Same page,
same brand, no separate URL to circulate and no second thing to explain.

A passcode holder who signs in lands on the portal like anyone else and sees
the cards they have been granted. There is no separate experience to build or
maintain, which is the main reason to do it this way rather than as a
standalone gate page.

---

## The admin UI

A fourth tab in the portal admin panel, next to Inbound / Users / Audit Log:

**Passcodes** — one row per issued code:

- organisation, and what the code is for;
- the code itself, **masked, click to reveal**, with a copy button;
- tools granted (viewer-level; the admin stop stays padlocked for restricted
  roles exactly as it is now);
- expiry, shown as a date and as "expires in 23 days" / "expired";
- last used;
- actions: **Rotate** (new code, same grant, same audit identity), **Revoke**,
  **Edit access**.

Issuing is a small form: organisation, what it's for, tools, expiry. The code
is generated server-side and revealed once on creation with a copy button —
though since it is retrievable by click-to-reveal, this is convenience rather
than a security boundary.

Two notes on the reveal: it is superadmin/admin only, like the rest of the
panel, and revealing should write an audit line. A credential you can look at
without leaving a trace is one nobody can investigate later.

---

## Audit and attribution

Each passcode gets its own uid, so every write and every audit line resolves to
a named organisation rather than to a shared "third party" login. That is
strictly better than the current position and it is the same reasoning
`club-directory.js` used when it chose one code per editor over one shared
code.

---

## Migrating the third-party accounts that exist today

Small and manual, which is proportionate:

1. List current `third-party` users from the portal.
2. Issue each a passcode carrying the same `tools` map.
3. Send it out, with an expiry date.
4. Once they have signed in on the passcode, disable the old account.

Nothing forces a big-bang cutover — email-and-password third-party accounts
keep working throughout, because nothing about the role changes. If the
passcode route proves itself, invite-a-third-party can be retired from the
invite form later; until then both routes coexist.

---

## Explicitly not in scope

The four existing passcode gates — Club Directory, Programme Packs, UW Promo,
Cup Footage — are **not** being folded into this. They are all destined for
retirement, and rebuilding them onto a shared mechanism first would be work
spent on code that is going away.

Worth recording though: the four of them plus this one make **five**
implementations of the same handshake, and the gate card UI
(`club-directory/_gate.js` + its `.gate__*` styles) is a plain canon candidate
under the repo's "second time you'd write it, promote it" rule. If any of those
four outlives its retirement date, promoting `NLGate` to `NL.passcodeGate` is
the move.

---

## What ships how

Per the repo's deployment rules, and worth stating in the PR body:

| Part | How it ships |
|---|---|
| Sign-in panel, portal admin tab | GitHub Pages — merge to `main`, no build step |
| `functions/third-party.js` | **Automatic** on merge (`deploy-functions.yml` fires on any push touching `functions/**`) |
| `rules.snapshot.json` | **One button** — Actions → `deploy-rtdb-rules.yml` → type `publish` |
| Seed `app-data/ops-access/config` | Nothing to paste — the first code is created through the admin UI |

No terminal at any point.

---

## Open questions

1. **Which tools does a passcode holder ever see?** The plan assumes
   viewer-level access to a small, explicitly-granted set, and no club scope
   (unchanged from `third-party` today). Worth naming the actual set before
   building — it may reveal that one or two tools need an audience change.
2. **One code per organisation, or one per person within it?** Per-organisation
   is simpler and is what the row design above assumes. Per-person buys real
   attribution when an agency has six photographers. Club Directory went
   per-person for exactly that reason.
3. **Default expiry** — 90 days? End of season? Or required-on-issue with no
   default, so someone has to think about it each time?
4. **Should a third party ever write anything?** The plan says no: a shared
   secret with no recovery and no way to know it has been forwarded is
   proportionate for read-only access and not for writes. If a third party
   needs to write, give them a real account.
