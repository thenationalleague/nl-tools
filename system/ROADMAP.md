# Roadmap

<!--
  The plain-English list of what is being built next, read by the Roadmap
  tool (/roadmap/, Control shelf, Skeleton key only). Changed only by pull
  request: Richard reads it and corrects it in chat, Claude updates it in the
  same pull request as the work. Keep "Now" to a handful.

  Shape, which /roadmap/ reads:
    ## Now | Next | Later       a group
    ### Headline                one item
    What: …                     what needs doing (one paragraph)
    Why: …                      why it matters (one paragraph)
    - …                         optional detail, one point per line
    Waiting on: you             optional: something only the reader can do
  Anything else is ignored. This file is public: no names of people, no
  email addresses, no codes.

  The detailed plans behind each item are in system/ (permissions-plan.md,
  one-address-plan.md and the rest). This is the front, not the record.
-->

## Now

### One club code door for every club page
What: Move the Handbook reader and Matchday Live's club page onto the shared code-or-sign-in door. Fold Programme Packs' own passcode check into the shared one, and move its usage figures onto a Manage tab.
Why: One way in for clubs, one place codes are checked and logged, and less code to look after.

### The pass decides everywhere
What: Attendance and the Handbook still decide who can edit by old role. Switch them to the pass. Then remove the two checks that still sit ahead of the pass: the superadmin role and the "League only" label.
Why: Until this is done, a tool can say yes in the portal and no on the page, or the other way round.

### Manage on the nine tools granted it
What: DAZN, Programme Packs, Save of the Month, Attendance, Brand Exposure, Club Codes, Club Kits, Handbook and Newsletter are granted Manage but have no Manage level built. Build it: Access to use the tool, Manage to run it.
Why: A grant that changes nothing on screen is a promise the tool doesn't keep.

### Sign-up and approvals
What: The sign-up request asks for job title and zones. League Operations approves club people. A Pending list and a bell show what is waiting. People can ask for a zone. The request email stops saying "admin panel", and every email the system sends is logged in Access's Audit tab.
Why: This is the last part of the new model people actually meet. Without it, new people still come in the old way.
- Email stays in Apps Script for now. The log records that an email was sent, not whether it arrived.

## Next

### One address for each tool
What: Merge the remaining two-page tools (a code page plus an /admin/ page) into one page each, where the pass decides the view. Then delete the "League only" label from the registry.
Why: People type one address. Two pages per tool means two places to keep in step.

### Private and Public shelves, and guest links
What: One-off tools for your own use move to /private/, on a shelf only the Skeleton key sees. Each shows its age and has a Retire button. A guest link lets one named person open one private tool, with an end date, a switch-off and a log of every open. Broadcast Travel moves first, with its old staff code door removed. The Trust Cup frame moves to Graphics.
Why: You can see what has been built, and clear it away when its job is done, instead of it living on forever.

### Testing as four people
What: Go through NL Tools as League staff with no zones, a League Operations zone holder, the dummy club on its Club card, and a club code while signed out.
Why: Everything so far has been checked on made-up data. This is the check with real sign-ins.
Waiting on: you

### The new season checklist
What: One written list for 1 July: what the season job does by itself, and what has to be done by hand. Clubs coming in and going out, their codes, crests, club data, the new handbook edition, ECAL and anything else tied to the season.
Why: It runs once a year, so nobody will remember it. The season job has never run for real.

### A weekly note when something fails
What: One plain-English note a week to a work inbox: which background jobs failed and what that means. Failing jobs also show as "Needs a look" in Estate.
Why: Failure emails went to a personal inbox in a form nobody could read, so a daily backup failed for ten weeks unnoticed.

### Prove a backup restores
What: A button that restores a database backup into a spare test database and compares it with the live one.
Why: A backup that has never been restored is a hope, not a backup.
Waiting on: you (one press)

### Two-step sign-in for the Skeleton key
What: Turn on two-step sign-in (a code from a phone app) for the two Skeleton key accounts first.
Why: Those two accounts open everything.

### The rest of the portal
What: The tool cards and drawn icons are done (13/11/2026). Next is the page around them: the noticeboard, the header and the spacing, and the Graphics landing page as the second place the card is used.
Why: It is the first page everyone sees. When a second page uses the card, it becomes a shared component.

### Turn the pass over
What: Tap the pass on My pass and it turns over to show what it opens: Manage in one column, Access in the other, names only. The Skeleton key's back says "Every tool, Manage". The full list beside the pass stays.
Why: It is how a real accreditation pass works, and it makes the zones easy to read at a glance.

### Zones
What: On screen, the stickers on the pass are called zones, not keys.
Why: It matches the accreditation-pass idea. Only the word on screen changes.

### Claudio's leftovers
What: Delete everything left of the old Claudio assistant, its chat history included.
Why: The tool is gone and the history may hold questions nobody should keep.

### A slimmer league table snapshot
What: Keep the daily table snapshot, but save only positions and points, and keep it in the database or the backup bucket instead of GitHub.
Why: Today it is 2.4 MB a day, and GitHub keeps every copy forever.

### Wellbeing posters
What: Check by hand that the printed Wellbeing Hub and Trident posters match their pages, and remake the PDFs if not.
Why: The pages were changed after the PDFs were made.
Waiting on: you

## Later

### Clear away the old access fields
What: Once nothing reads them, remove the per-person tool entries and the jobs that keep them in step (Apply passes), the old roles, the per-role defaults on every tool, and the forwarding pages kept for old bookmarks.
Why: Two ways of deciding access is twice the chance of them disagreeing.

### Rename the tools in the database
What: Drop the old "ops-", "media-" and "staff-" starts from every tool's name in the database. A list of old and new names kept forever, a report-first copy, one switch-over, and the old copies deleted weeks later.
Why: The starts date from an idea of shelves that was dropped. Done last, when there is least to move.

### Club codes off
What: Pick a date, around January 2027. Email clubs a month before, then switch codes off; clubs sign in instead.
Why: One way in, with a name on every sign-in.
Waiting on: you (the date)

### Clubs that leave the league
What: As part of each new season, a leaving club keeps a short-lived code that opens only its own past figures, and incoming clubs get theirs.
Why: About ten clubs change every season.

### The live-match tidy
What: Decide which of Matchday Live, the Live Blog, Vidiprinter, Match Centre and the two Match Hub prototypes survive, once the new shelves put them all in front of you.
Why: Several things do roughly the same job, some in old ways.
Waiting on: you

### Video request emails as a tool
What: Turn the Apps Script that emails video requests into an NL Tools tool. Leave it alone until then: it works.
Why: It would have a proper home and a log.

### Email through a sending service
What: Send the system's emails through a sending service from a Cloud Function, with a record of whether each one arrived.
Why: Delivery you can see, and no Gmail limits. Not now: it adds a service and a cost mid-change.

### Two-step sign-in for everyone
What: After the Skeleton key accounts, offer two-step sign-in to everyone.
Why: It protects every account, not only the two that open everything.

### A new assistant
What: One chatbot connected to the data tools, where each person's zones decide what it can reach.
Why: Claudio's idea was right; the build wasn't.
