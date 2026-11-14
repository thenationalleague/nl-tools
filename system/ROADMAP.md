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

### Matchday Live on the club code door
What: Matchday Live's contributors use personal links today. When it leaves Sandbox, they open it the same way as every club page: a club code (named holders, so each clip still says who filed it) or a Club card with the Club Media zone.
Why: One way in for clubs. It waits for launch because the personal links are part of the pilot.

### Retire programmeAuth's club path
What: Programme Packs now checks club codes through the shared door (13/11/2026). After a week with no club using the old route, remove the club-passcode half of programmeAuth, leaving only the console's sign-in.
Why: Two copies of the code check, throttle and log is what this tidy is for.

### Sign-up and approvals
What: Club people ask; everyone else is invited. A club secretary shares one sign-up link with their staff. The link already names the club, so each person adds their name, job title and the zones they need, with a one-line reason, and League Operations approves, usually within a day. League Operations can also invite club staff directly. League staff and externals never ask: they are invited, and the invite sets their card and zones. A Pending list and a bell show what is waiting. People can ask for an extra zone later.
Why: This is the last part of the new model people actually meet. Without it, new people still come in the old way, and you would have to invite every member of every club by hand.
- While waiting, the person sees a "pending" page, not an empty portal.
- The approver sees exactly what each requested zone opens before saying yes.
- Every email the system sends is logged in Access's Audit tab. Invites and approvals get a Resend button, and a Copy link option so an invite can go by WhatsApp if the email never arrives.
- The request email stops saying "admin panel".
- Everyone signs in with email and password. No emailed sign-in links each time (decided 13/11): they hang every sign-in on someone's inbox.
- Email stays in Apps Script for now. The log records that an email was sent, not whether it arrived.

## Next

### One address for each tool
What: The merges are done: every two-page tool is one page now, where the pass decides the view, and the old /admin/ addresses forward. Left: delete the "League only" label from the registry.
Why: People type one address. Two pages per tool means two places to keep in step.

### Private and Public shelves, and guest links
What: One-off tools for your own use move to /private/, on a shelf only the Skeleton key sees. Each shows its age and has a Retire button. A guest link lets one named person open one private tool, with an end date, a switch-off and a log of every open. Broadcast Travel moves first, with its old staff code door removed. The Trust Cup frame moves to Graphics.
Why: You can see what has been built, and clear it away when its job is done, instead of it living on forever.

### Testing as four people
What: Go through NL Tools as League staff with no zones, a League Operations zone holder, the dummy club on its Club card, and a club code while signed out.
Why: Everything so far has been checked on made-up data. This is the check with real sign-ins.
Waiting on: you

### A weekly note when something fails
What: One plain-English note a week to a work inbox: which background jobs failed and what that means. Estate already marks a GitHub job whose last run failed (13/11/2026); the weekly note, and the same check for the cloud jobs, are still to do.
Waiting on: you (which inbox)
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

### Reset emails from an NL address
What: Password reset emails come from Firebase's own address. Point them at an NL address so they don't land in spam. Change password (My pass → Account) and Send reset link (Access) are built (13/11/2026).
Why: A reset email that lands in spam is a locked-out person phoning you.
Waiting on: you

## Later

### Public pages under /public/
What: Every page with no door lives at nl.tools/public/<name>/. Four already do (Academy & Alliance, Article Composer, Fixtures Graphic, Trust Cup). The two that don't, the open Club Directory and the open Handbook, move there, and their old addresses forward. One rule in the site's settings covers the whole folder, and a test fails any page with no door outside it.
Why: The address alone tells anyone whether a page is safe to send outside the League.
- The handbook PDF stays where it is: a PDF cannot forward, so moving it breaks links already sent.
- Club Directory and Handbook are hidden from Google on purpose; one rule for the folder would hide the other four too.
Waiting on: you – should everything under /public/ be hidden from Google?

### External passes
What: A third kind of pass, for organisations outside the League and its clubs: DAZN, the Trust, agencies, freelancers. In Access, a new Externals tab: you set up the organisation first (name, colours and an uploaded logo), then its zones, then invite its people. Each zone has a plain name ("Broadcast"), a three-letter code (suggested from the name, changeable, never a duplicate) and the tools it opens. Each person holds one or more of their organisation's zones.
Why: Partners and freelancers need one or two tools each, with a name on every sign-in, not a shared code. After club logins, as planned.
- Invite-only. There is no way for an external to ask for access.
- A pass needs at least one zone: the External card opens nothing by itself.
- Fine-grained by zones, never by person. If one person needs more, their organisation gets another zone ("DAZN Reporting" beside "DAZN Broadcast"). When someone leaves, removing their pass leaves nothing behind.
- Every tool is closed to externals unless its record switches it on, and a new tool starts closed, so forgetting only ever keeps someone out.
- Access is the most an external gets, unless the tool was built for more (uploading to Programme Packs).
- Externals never get the League's view across all 72 clubs. Each tool says what an external sees there; if it says nothing, they see nothing.
- Sensitive tools can never be opened to externals: Club Codes, both benchmarking tools, Responsibilities and Access. That is locked three times: Access doesn't offer them, the pass refuses them, and the database rules refuse anyone on an External card. Changing which tools are sensitive is a pull request, not a tickbox.
- Logos live in file storage in their own folder, starting empty, so changing one is an upload, not a pull request.
- Only the Skeleton key runs the Externals tab to begin with.
- First tools: Programme Packs (freelance programme editors see every club's library; it is a shared working space) and Fixture Management (view only).
- First organisation: the Trust, with Content Plan (view only), Document Library and Graphics (making its own posts, nothing more). If the Trust ever needs to see across every club like League staff, it becomes its own card instead.
- Later candidates: Brand Exposure (a sponsor sees only its own boards, once that tool is finished), Matchday Live for freelance reporters, Graphics for freelance designers, Content Plan for agencies.

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

### Club Kits as a tool people use
What: Redesign Club Kits around using the kits, not collecting them. It was built to gather every club's kit colours; that job is done, and it stayed because the kits are useful, but the page is still shaped like a collection console.
Why: The data is worth more as something people look things up in than as a form that has done its job.

### Full league history beyond the National League
What: Add every club's Football League results to our own history, so a club's whole league story sits on one timeline and head-to-heads span both: every league meeting between two clubs, wherever it was played. Two public datasets cover England's top four divisions from 1888 (engsoccerdata, and a database built on it that is kept up to date); our EFL connector only goes back to 2021.
Why: Many of our clubs had Football League years, and clubs want their whole history, not the part since they joined us.
- Ask both compilers first, and credit them on every answer: one dataset is marked for non-commercial use with credit, the other states no terms.
- Built in advance, not in the live database: each club's history and each head-to-head worked out ahead, like the results archive, so searches are instant and free.
- The real work is which club is which. A list to check and sign off, linking each Football League name to one of our clubs, with phoenix clubs, renames and mergers marked (the old Aldershot is not Aldershot Town). Never combined without asking.
- A short list of adjustments beside the results, so every table matches the record books: points awarded for a game never played (Scunthorpe v Exeter, 1974), points deducted, and seasons wiped from the record (1939/40).
- Not covered: history in the leagues below us before 1979.

### A new assistant, for clubs first
What: A chat with Claude on API credit, with a team of agents, each with its own voice, typeface, character and skill set, answering questions through connectors such as the NL Data MCP. Clubs first, starting with the League's history: "when did we last beat Yeovil away?", "our record against Gateshead", head-to-heads for programme notes. A Club card already knows which club is asking. Each person's zones decide what it can reach.
Why: Clubs can't easily get the League's history anywhere else, and programme editors need head-to-heads every week. Claudio's idea was right; the build wasn't. The shape is kept in system/retired/claudio.md.
- Every answer comes from the results archive, never the model's memory, and says plainly what the archive doesn't hold (attendances, referees, goalscorers, managers, grounds). Clubs print what they're given.
- Answers cost almost nothing: the connector works the answer out and the model only words it, repeated questions are answered from a store, and only the agent's own tools go with each message.
- Our own site is a research source too: the Website Archive's articles, searched in advance, so an answer can add what we wrote at the time, with a link to it. Only our own words; other publications stay out.
- Programme Packs is a natural home, as the programme editors are already there.
