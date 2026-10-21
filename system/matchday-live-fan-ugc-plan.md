# Matchday Live — fans posting from inside the ground

**Status: scoping, not built.** Drafted 15/10/2026 after the first phone
test, when Richard asked whether fans could post if they were inside the
stadium, and said it could be watered down. Nothing here should be built
until the blocking questions at the foot are answered.

Matchday Live today takes clips from **named contributors** who hold a
personal link (`matchday-live/README.md`). This document is about opening it
to **people we do not know**, gated by being at the ground.

## The first question is not technical

**Can fans' footage of the match be published at all?** The League's
broadcast partner holds rights in match footage. Goals filmed from the stand
and published by the League could conflict with that deal whoever filmed
them. The same question applies, more quietly, to contributors filming match
action today. Ask before anything else: the answer may limit fan clips to
non-action moments (atmosphere, arrivals, celebrations at full time). That
would also make every other risk below smaller.

## What a geofence is, and is not

The phone reports its own position. A browser cannot prove it, and spoofing
it takes minutes for anyone who wants to. So a geofence keeps out casual and
accidental posting; it is **not** a security boundary. Everything below
assumes some clips will come from people who are not at the ground.

Location is personal data. The design keeps it on the phone: distance to the
ground is worked out on the device (as "Find my match" already does) and only
"inside ground X" is sent. No coordinates are stored.

## Options, from lightest to heaviest

| | What it is | Gate | Identity | Effort |
|---|---|---|---|---|
| **A. Fan photos into a private queue** | Stills only, no video, straight into a moderation queue nobody outside sees. "Send us your view from the stand." | Geofence + match live | None | Small |
| **B. QR at the ground** | A per-match QR code on posters or the big screen opens the capture page for that match only. Expires at full time + 1h. Short clips (15s), atmosphere categories only. | QR **and** geofence | None | Medium |
| **C. Signed-in fans** | Embed on thenationalleague.org.uk behind the NL+ / Sports Alliance login (see the `nl-sso-club` skill). We know who posted and their club; bans stick. | Login + geofence | NL+ account | Larger: identity must be verified server-side, not trusted from the browser |
| **D. Open to anyone at a ground** | What was first asked. | Geofence only | None | Medium to build, heaviest to run |

**Recommendation: B, or A as a pilot.** B's QR is a second gate that a spoofer has to
be physically near; it expires, so leaked codes die; and it can be switched on
for one ground at a time. A is the safest way to learn the volumes first.

## What any version needs

- **Terms per upload.** Fans cannot sign the contributor licence. A short
  grant, accepted on each upload, versioned like `config/consent`.
- **Age.** A "16 or over" tick at minimum; a safeguarding view on whether
  that is enough.
- **Moderation.** Fan clips land in a **separate** queue from contributors',
  never auto-published, and unapproved fan clips are deleted after 7 days
  like rejected ones. A sell-out could produce hundreds of clips; someone has
  to be named as reviewing them on the day.
- **Spam limits that survive no identity.** Per-device limits reset when a
  browser is cleared, so add a cap per match (e.g. 200 clips) and per ground,
  enforced in the rules the same way `quota` is today.
- **People in shot.** Crowd shots include identifiable fans, possibly children.
  The terms and the moderation guidance need to say what is publishable.
- **Rules and storage.** A fan path separate from `clips/`, with its own
  rules, so contributors' rules are untouched and fan access can be switched
  off in one place.

## Questions to answer before building (Richard)

1. **Broadcast rights:** may fan footage of match action be published, or atmosphere only?
2. **Which option** (A–D), and pilot at which one or two grounds?
3. **Terms and age:** who writes and signs off the fan upload terms, and is "16 or over" acceptable?
4. **Moderation:** who reviews fan clips on a matchday, and does fan content go anywhere public, or is it for our own social use only?
