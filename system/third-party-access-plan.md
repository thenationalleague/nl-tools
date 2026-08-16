# Third-party access by passcode — plan  ·  SUPERSEDED 16/08/2026

**This plan is abandoned. The `third-party` role is being deleted, not kept.**

The plan (10/08/2026) proposed *keeping* the `third-party` role and only swapping
its credential — an 8-character passcode instead of an email/password account —
on the argument that the role carried load-bearing behaviour (audience gate,
defaults key, a dozen portal branches) that would be expensive to reinvent.

The 16/08/2026 access-model review took the opposite decision, and it holds:

- **The role is deleted.** In practice `third-party` had *zero* access on every
  tool anyway (absent from every `defaults`, so it resolved to `off`). It was a
  login type that could log in and see nothing — pure fog. Removing it costs
  almost nothing.
- **Outsiders get coded links, not identities.** Broadcasters, partners and print
  don't get a login, a role, or an account. They get a **passcode-gated page for
  one specific job** — the credential attaches to the *page*, not to a user. This
  is already how Programme Packs, Footage, the benchmarking links and the kit form
  work; the model just makes it the only outsider route.
- So the plan's passcode instinct was right; what it got wrong was preserving a
  role behind it. There is no role behind a coded link.

The portal retirement (stop offering the role on invite/edit; remove the org-name
flow that existed only for it) landed first; the canon removal from `NL.roles` and
`auth-guard` follows in the vocabulary-reconciliation pass. See the access model
(`system/roles-and-access-plan.md` and the 16/08 review) for the settled shape.

_Kept as the record of the decision, per the retired-work convention — not a live plan._
