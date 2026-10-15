# PhotoShelter Onboarding (`/photoshelter-onboarding/`, `ops-photoshelter-onboarding`) — retired 15/10/2026

## What it did

An open sign-up form for the PhotoShelter training in August 2026. Club
photographers and media officers picked which of four identical sessions
they could make, and the League assigned each person to one and emailed the
joining link. One submission was one person, not one club. A
superadmin-only console at `/admin/` read the bookings back to balance the
sessions. It never had a registry record or a portal card.

## Why it went

The training happened. Richard, 15/10/2026: "definitely dead and can be
completely wiped". Both pages were deleted. The rules for
`app-data/ops-photoshelter-onboarding` were closed to everything except an
admin in the same PR, so the open form's create-only write path is shut
whether or not anyone still holds the link.

**The bookings are gone.** They were names and email addresses for people at
72 clubs; Richard deleted the node in the Firebase console on 15/10/2026, and
the rules entry was removed afterwards. Nothing of this tool remains in RTDB.

## Decisions worth keeping

- **Open link, no portal login.** The people who need to be in the room
  mostly have no NL account. Abuse control was anonymous Firebase auth (so a
  bare REST call cannot write), a honeypot field, and create-only rules with
  per-field validation.
- **The public page can write but never read.** An open URL must not expose
  one club's people to another; reading back is admin-only.
- **Availability is not a booking.** The success screen led with "Please
  don't put a date in your diary yet", because people read their own
  availability back as a confirmed session.
- **No confirmation email.** The Apps Script receipt it was built with
  never existed in the live project and failed silently from launch. It was
  abandoned rather than fixed (15/08/2026).

The last full version of both pages is in git history, before the commit
that added this file.
