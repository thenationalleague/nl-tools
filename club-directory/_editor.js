/* =========================================================================
   NL Tools — Club Directory editor
   File: /club-directory/_editor.js
   Version: v3.0 (11/11/2026)

   v3.0 – (11/11/2026) Every save is live, and private details have their
          own place (Richard). There is no Publish button.
          · saveClub(): one multi-path update writes the working record,
            the club's published copy (private details taken out) and its
            private half (private/<club>, only the details kept back, with
            the club's code so the rules can let that club in). The three
            land together or not at all.
          · goLive(): the first time the editor opens after this ships,
            every club is written that way once, published/live is stamped,
            and Publish's own label/count/edition fields are cleared.
          · No more frozen copies in editions/ (the old ones stay,
            read-only): nightly backups and the monthly copy are the history.
          · A private detail still showing through a duplicate entry is
            reported after the save that caused it.
          · The padlock: "Private" on each address and number, and "All
            their contact details private" for the whole person, replace the
            "Not published" ticks. Update details is reworked: name, the
            padlock, one Contact list with "+ Email" "+ Phone", one line per
            role, Remove this person at the foot.
          · Every rename asks "Same person, or someone new?" (before, only
            people with more than one role were asked). Someone new gets the
            job and none of the old person's details; if it was their only
            job, the old person comes out.
          · Change log opens on everyone's changes with Club and Who filter
            buttons, Club starting on the club you are looking at. The
            download drops its "Live?" column: everything saved is live.

   v2.4 – (11/11/2026) Publish says what it will change before you confirm:
          the live published copy is read and compared with the one this
          press would write, club by club and person by person (added,
          removed, name / job / email / phone changed, club details), with
          the clubs' crests. "Nothing has changed" when nothing has.

   v2.3 – (11/11/2026) Change log → Download (CSV): every journalled change
          and every hand-edited field (with was / now), newest first, each
          marked whether it went out at the last Publish or is saved but not
          live yet.

   v2.2 – (11/11/2026) Editing moves into the staff page (Richard): no
          separate edit page. /club-directory/admin/ has an Edit button
          beside the club picker for anyone with Manage; pressing it starts
          this module, turns the pens on and shows Publish and Change log.
          /club-directory/admin/edit/ forwards to /club-directory/admin/?edit.
          · NLEditor.start(host) / draw(name) / search(q). The page owns the
            club list, the picker, the address and the search box, and hands
            in its own ALL, so the reading view and the overview see an edit
            at once.
          · The empty-directory "Build the directory" step and "Rebuild from
            submission" in the club details go: both read the clubs' original
            submissions, and the directory is past its import.
          · Styles moved to /club-directory/_editor.css.

   Earlier history, from when this was the page at
   /club-directory/admin/edit/ (and before that /club-directory/editor/):
  club-directory / admin / edit / index.html   (was /club-directory/editor/)
  v2.1 – (11/11/2026) A live document, not an import (Richard). The markers
          that were there to check the clubs' submissions come off the page:
          "Was:" chips, "Added by us", the green changed-marks, the tidier's
          flags, the merge note, the record readout, the "rebuild from the
          submission" banner and Mark complete / Reopen. Every record is
          always editable; Publish already sent every club, signed off or not.
          · The club chooser is canon NL.clubPicker (crest, name, division)
            through NLDirectory.picker (_directory.js v1.16), not a bare
            <select> with "— COMPLETE" on the end.
          · Re-check all goes: it re-ran the import's tidier.
          · Changes are still logged — the journal, the edit log and the
            audit are written exactly as before — and read in Change log
            (was My changes), not on the page.
          · Blank job titles still show, as "No job title": a gap to chase
            in a live record, not a fault in a submission.
          · Versions and Add organisation go (Richard). Change log is how a
            change is put back. Publish still freezes a copy of everything in
            editions/ (write-once in the rules), so a club can be recovered
            from a publication if it ever has to be; there is just no button
            for it. Publish no longer asks for a name: the copy is labelled
            "Published <date>".
          · The extension beside a phone number is set small and kept on
            one line (_directory.css, ?v=40).
  v2.0 – (11/11/2026) Editing moves behind the staff login (Richard): this
          page is /club-directory/admin/edit/, entered from the staff page,
          and gated by auth-guard instead of an editor code. The plan in
          functions/club-directory.js ("when these people are on the portal…
          `dir` is replaced by the portal's users/<uid>/role") carried out.
          · Who: Manage on Club Directory (League Admin by default, or a
            per-person grant in the portal; superadmin always). Access-level
            staff are pointed back to the overview.
          · Everyone with Manage gets what the master code had: Publish,
            Versions, Re-check all, Add organisation. The editor/master split
            belonged to codes handed to individuals; a Manage grant is already
            that decision, made in the portal.
          · Names on edits come from the person's account, and the audit trail
            records their own uid rather than a cd-ed-<key> code uid.
          · Sign out is the topbar's.
          The editor codes still work at the old address until they are
          switched off (Declutter step 3); /club-directory/editor/ now
          forwards here, and the club-code page moved to /club-directory/.
  v1.44 – (30/10/2026) Show under is a canon filter button (NL.filterButton,
          nl-utils v1.47): "Show under: All their roles", opening a tick list
          of the person's roles. The toggle pills it replaces are leaving the
          canon. Same meaning: nothing ticked is every role, ticking one from
          there is "just this one". Unticking the last role now goes back to
          all of them, so the "has to show somewhere" refusal is gone – there
          is no longer a way to ask for nowhere.
  v1.43 — (06/10/2026) Lockstep _directory.* ?v=38: the wall gains a pick
          mode for the staff page's club chooser (js v1.15, css v1.9).
          Nothing here uses it.
  v1.42 — (10/09/2026) Reseed pitch retired, same day it ran. The 10/09
          survey is seeded and published, and Richard chose a clean bar
          over a standing control: the next survey arrives as a clubs-meta
          PR anyway, and the button rides back in with it (revive from
          v1.41, one commit back). The pipeline it served is unchanged —
          clubs-meta stays the truth, its validator keeps the 90-120 x
          45-90m window.
  v1.41 — (10/09/2026) Reseed pitch, master only, in the bar. Pitch
          dimensions now live in clubs-meta (metres, "L x W m", validator
          bounds 90-120 x 45-90m) and the button projects them into every
          club record in one multi-path write — set where clubs-meta holds
          a pitch, CLEARED where it does not, because a ground under
          re-measurement should show nothing rather than the wrong number.
          Orgs untouched, sign-off ignored, one audit entry, no journal
          spam. Publish afterwards as usual.
  v1.40 — (03/09/2026) The Reorder dialog adopts canon NL.sortable
          (nl-utils v1.43 / .nl-sort, nl-brand v2.66) — the three-bar grip,
          the lift off the page while held, FLIP-animated moves, sprite
          up/down glyphs — and retires the local .ed-ord CSS and hand-rolled
          HTML5 drag it was promoted from. Same data, same Save: the dialog
          hands back ctrl.order().
  v1.39 — (03/09/2026) Reorder, per department, on org records. The HQ list
          is a hierarchy, not an alphabet, so each org department bar takes a
          Reorder button (two or more people, record not signed off): drag
          the rows or walk them with the arrows, Save writes
          rec.order[section] (_directory.js v1.14) and publish carries it.
          Surname order remains the rule for clubs and for anyone an order
          does not name. _directory.* ?v=37.
  v1.38 — (03/09/2026) Lockstep _directory.* ?v=36: club banners take a foot
          stripe in the club's second colour and card elevation (css v1.8,
          js v1.13); org banners take neither, by ruling.
  v1.37 — (03/09/2026) Publish writes published/orgs — the public wall's
          names-and-crest-keys leaf, no contacts in it — and carries an org's
          colors {primary, tertiary} into its published record. The leaf's
          public read arrives with the rules snapshot in the same PR (one
          deploy-rtdb-rules run). _directory.* ?v=35.
          And every department picker follows the record's taxonomy: an org
          offers ORG_ORDER (the HQ list's own headings — Governance & legal,
          Administration, …), a club offers ORDER, in the person editor, add
          person, add role, and the shared-mailbox editor alike.
          Add organisation takes a Banner crest too (bannerCrestName — the
          on-colour mark; the crimson banner wants the white rose where the
          tiles want the wordmark), and publish carries it.
  v1.36 — (03/09/2026) Organisation records. A master can add the League and
          related bodies ("Add organisation", in the bar) as records carrying
          org: true and an optional crestName. They draw their crest by that
          name, sit above the clubs in the picker, skip the mailing-lists
          block and both "rebuild from submission" offers (orgs are typed in —
          there is no submission), and publish carries the two root markers so
          the reader can pin and badge them. _directory.js v1.11 (?v=34)
          supplies isOrg/crestKeyOf/orgFirst. Creation is journalled through
          persist() like any other structural act.

  v1.35 — (15/08/2026) The bar is white with a red underline, not navy. Navy
          means nobody asked who you are; this page is entered with the same
          six-digit code as the reader, which was red. Same tool, same door,
          two different colours. Canon .nl-idbar, nl-brand.css v2.37. Bar
          buttons become .nl-idbar__btn in an .nl-idbar__actions group; Publish
          keeps its red as a local modifier composing with canon; the club
          selector gains a border; and "who is signed in" stops being a floated
          span and becomes the bar's subtitle, which is what __sub is for.
          This bar is the busiest in the project — a selector and five buttons
          — and converting it is what turned up the missing flex-wrap in canon,
          fixed in nl-brand.css v2.38.

  v1.34 — (13/08/2026) Shared mailboxes can be added and edited. They could
         not be, and nobody noticed for a week, because the block rendered
         only where there was already something to render: 38 clubs sent none,
         and at those clubs there was no block, so no way in. A read-only
         field with no empty state is a field that looks finished.
         The block is drawn now whether or not the club sent any, says so when
         they did not, and carries Add / Edit. The department is picked from
         the League's own list rather than typed, because the staff overview
         matches these onto mailing lists by their label and a free-typed
         "Comms" matches nothing; anything genuinely outside the list goes
         under Something else with a name of its own, which is what the clubs
         did themselves (Careers, Retail, Club Office).
         Keys are slugged — RTDB refuses . # $ / [ ] in a key and throws
         synchronously, so "Media & marketing" has to become media-marketing
         or the save takes the click handler down. An existing mailbox keeps
         its key, so an edit stays an edit rather than becoming a delete and
         an add.
         Threaded through the snapshot, the diff, the undo patch and the
         journal in the same pass, rather than discovered afterwards — which
         is what happened with the mailing lists in v1.30, where a change left
         no green marker and had no Undo behind it.
         formField() comes out of the person modal and into the file: second
         use, so it moves rather than being written twice.
  v1.33 — (12/08/2026) An address now names WHICH of the person's jobs it is
         for. Barrow asked for it and it is the ordinary case: their
         safeguarding champion is also a director twice over, and the club is
         happy for his address against the safeguarding post and not the board
         ones. 275 of the 1,070 hold more than one post.
         The mechanism half-existed — an address could carry a section since
         the per-role work — but it could say "everywhere" or "exactly one
         place" and nothing in between, and the control was a dropdown whose
         default option read "All roles". In 914 addresses it had never once
         been used, which is what a control that looks like a label gets you.
         It is a set now, and the control is laid out rather than furled: one
         canon toggle pill per role plus an All. Clicking a single role while
         All is on means "just this one", so Barrow's case is one click.
         Turning the last role off is refused rather than allowed — an address
         that appears nowhere is what the Not published tick already says, and
         two controls meaning one thing is how you get a record that disagrees
         with itself.
         A department an address is not for now says nothing rather than
         "None held", which was a small untruth: we hold one, it is for their
         other job. Naming it would only tell a reader there is an address to
         go and ask for. Cards say which post an address is for, because a
         card is the whole person and otherwise the safeguarding address reads
         as the director's address too.
  v1.32 — (10/08/2026) Whether a detail is published is now decided per
         ADDRESS and per NUMBER, not per person. The old flag was one tick
         covering everything somebody had, so a club officer happy to publish
         the club address but not their mobile could only say no to both —
         and that is the ordinary case, not the exotic one.
         Every email and every phone line in the person modal now carries its
         own "Not published" tick. The person-level tick stays for the people
         who want nothing out at all, and the 290 already carrying it keep
         working with nothing re-entered.
         Publishing is unchanged in kind: what is held back is REMOVED from
         the published copy rather than hidden in it, so a reader cannot ask
         for what it was not given. Where a channel is emptied entirely the
         published record carries a marker so the reader can still say "Not
         published" rather than the lie "None held".
         The confirm now names what is about to become public, so opening one
         address does not read like opening all of them. The change is logged
         on the same field as the address itself, so the green marker, the
         journal and the Undo button all work on it with nothing new taught.
         Two latent faults fixed on the way, both of which needed an
         object-shaped email to show themselves and now get one: the tidier's
         case pass read every address as a plain string and would have thrown
         on the first object, taking the bake with it; and the duplicate merge
         compared addresses by reference, so the same address arriving twice
         went in twice. Merging now keeps the withheld state where the two
         copies disagree — combining records must not quietly publish
         something.
  v1.31 — (07/08/2026) Publishing and versioning are one act, because they
         were always one fact: this is what the League is standing behind, as
         of now. Two buttons meant you could publish without a record of what
         you published, or freeze something nobody would ever see — and it
         meant remembering to do the second one, which is the sort of
         discipline that holds for about a fortnight.
         One press names the version, writes the frozen copy, then writes the
         published one. The frozen copy goes first: publishing without a record
         of what was published is the half worth not having. Versions is now
         the publication history, and restoring means "back to how this club
         was when we published that".
         Publish becomes master-only as a consequence. The rules make an
         edition writable by a master alone — deliberately, since an editor
         must not be able to touch the thing that exists to survive an editor —
         so an editor pressing Publish would have been refused by the database,
         which is a worse way to find out than not seeing the button. It is
         also right on its own terms: the reader is 72 clubs, and releasing to
         them is a decision rather than a step.
  v1.30 — (07/08/2026) Mailing-list changes are green and reversible, which
         they should have been from the start. diffClub never looked at leads,
         so changing one produced an empty patch: the journal entry got no
         Undo button, and there would have been nothing behind it if it had.
         And logEdit was never called, so no green marker either — changing
         who receives the League's mail left no trace at all, while changing
         somebody's job title left two.
         Leads are now in the snapshot, the diff and the restore, keyed by
         list — a list key is a plain word and safe as an RTDB key, unlike the
         paths that broke the undo body last time. The edit is logged in names
         rather than ids, so the marker reads "was Jack Lappin" and not
         "was p3k9tz2".
  v1.29 — (07/08/2026) Markers and pens landed on the wrong person. Reported
         as "Check the domain is showing against someone with no email — it
         belongs to the row below", and that was exactly it: the flag was
         right, the row was wrong.
         wireEditing worked out a row's person by COUNTING — the third row
         under Leadership is the third person in Leadership — which held only
         while the render order matched the array order. v1.28 added a surname
         sort to sectionPeople for the card view and broke it without a word.
         Every marker, every flag and every pen was offset wherever the two
         orders differed, so the pen opened somebody else's details.
         Rows carry data-pid and data-ridx now, exactly as cards already did,
         and nothing is inferred from position anywhere. Verified across three
         clubs: 49 rows, none without an id, none naming a different person
         from the record behind it.
  v1.28 — (06/08/2026) A card view, and the two things clubs sent that nothing
         had ever put on screen.
         Cards alongside the list, remembered per person rather than per club.
         A card is a business card: ONE per person, with every job they hold
         listed on it. So the card view is not grouped by department at all —
         it is a flat alphabetical pile, which is the same shape a search
         returns, so browsing and searching stop being two things to learn.
         The list stays grouped, because reading down one department's column
         of addresses looking for the wrong one is the job.
         Sorted by surname, with the surname in caps — the handbook has always
         done that and the reason survives the move to a screen: it says which
         word the list is sorted on, which for Owen Rhys Jones is otherwise a
         guess.
         SHARED MAILBOXES (34 clubs sent them) and MAILING LISTS (all 72 did)
         now render, and the lists are editable. The lists are the League's own
         eleven questions — who is your secretary, your safety officer, your
         SLO — answered with actual people, and they had been sitting unread
         in the database since the build. Nobody can correct what they cannot
         see. A list with nobody on it is flagged rather than left blank,
         because that is not an empty field, it is mail going nowhere.
  v1.27 — (06/08/2026) Publish goes out whether or not a club has been read,
         and the reader stops announcing our gaps.
         Publishing only what was marked complete is the right rule for a
         directory built at leisure and the wrong one for getting a usable
         version in front of 72 clubs now. Everything has been through the
         tidier, so an unchecked club is not raw — it is simply not yet read
         by a person. What does not relax is the contact suppression: somebody
         the club asked us to hold back is held back whether their club has
         been checked or not, because that is their decision and not a state
         of our work.
         "No job title" is now editor-only. To a club looking themselves up it
         is the League announcing a gap in its own records against a named
         member of their staff — it reads as a slight, and it is 21% of every
         role we hold. Silent where it is read, loud where it is worked on.
         Also: the undo body is written BEFORE the entry is marked undoable,
         and both writes are caught. The first cut set the flag, fired the
         write and never looked again, so a failed write left an entry
         offering a button with nothing behind it — "there is nothing held for
         that change", which is true and useless. And an unhandled rejection
         reached the global handler as "Script error.", naming nothing.
  v1.26 — (06/08/2026) THE club-card bug, actually found. Every explanation
         before this was wrong.
         The undo patch keyed its edits and changes diff BY PATH — and a path
         is "info/stadium" or "people/p3k9/roles/0/title". RTDB refuses a key
         containing a slash and refuses it by THROWING, synchronously, inside
         logJournal, which runs before the record is written. logEdit had
         already fired. So: a green "edited by hand" marker, a record that
         never changed, no journal entry to undo from, and nothing on screen
         to say why. It affected every save that touched a marker, which is
         every save.
         The diff is a list carrying the path as a field now. A person with no
         id also fell back to "#" + index, and # is illegal in a key too.
         The harness stub did not validate keys, which is exactly how a diff
         keyed on "info/stadium" passed every test here while failing on every
         save in production. It validates now.
         And a save that fails is no longer a three-second toast. It is a
         sticky red banner naming the fault and saying the screen no longer
         matches the database — because "it didn't save" is not a report
         anybody can act on.
  v1.25 — (06/08/2026) An earlier attempt at the same bug.
         Editing a club-card field produced the green "edited by hand" line and
         saved nothing: card unchanged, record unchanged, nothing in My
         changes, no way back. People edits worked throughout.
         RTDB rejects an undefined value by THROWING, synchronously, not by
         rejecting a promise. logEdit built its entry from the `from` of any
         previous edit to the same field, and an entry whose `from` had been
         dropped on write made that undefined — so the second edit of a field
         threw, taking the record write, the journal entry and the modal close
         with it, having already set the marker in memory. Every value is
         coerced now, and the write reports a failure rather than swallowing
         it.
         And the reason this took hours rather than minutes: nothing in a
         browser tells you a click handler died. Uncaught errors and unhandled
         rejections now surface as a message naming the fault and pointing at
         My changes. It cannot make the tool correct; it can stop it being
         quietly wrong, which is the difference between a bug reported
         accurately and one reported as "something's broken".
  v1.24 — (06/08/2026) Two things Richard spotted.
         Email addresses were wrapping onto two and three lines, on the one
         column people read character by character. 1180px was a measure for
         prose and this is four columns of data; the wrap goes to 1480 on wide
         screens and the email column takes the width the name and phone
         columns did not need. The longest address in the directory, 44
         characters, now sits on one line at 1280.
         And a "hotnail.com" that nothing had ever flagged. A well-formed
         address, no mismatch with the name, and mail to it goes nowhere. The
         tidier now checks the domain against the mailbox providers a person
         is likely to have and flags anything one or two letters off — paired
         with a rule that costs nothing and removes the false positives: a
         domain more than one person at the club uses is that club's domain,
         and a typo is typed once. Plus endings that are never right at all.
         Retrospective without a rebuild, because flags are re-derived on
         every draw. Three across 870 addresses: hotnail.com at Hebburn Town,
         chorleyfc.ocm at Chorley, email.com at Merthyr Town.
  v1.23 — (06/08/2026) Fixed the reported symptom: editing the club card wrote
         its green "edited by hand" line and changed nothing else — no card
         update, no record change, nothing in My changes. Person edits worked
         throughout, which is what made it look like a club-card problem.
         Three faults in a chain, all mine.
         · restoreFrom REPLACED ALL[club] with a new object. Everything the
           current render is holding — the card pen's closure among them —
           then points at an orphan, so an edit mutates an object nothing will
           ever save. It mutates in place now.
         · guardInfo fired on restore and rebuild, the two actions entitled to
           replace the details wholesale and the two brought in to recover
           from the thing it guards against. They pass a flag now.
         · When the guard did block, it did not redraw. A block that leaves
           the page showing what it tried to do is worse than no block: the
           next edit is made against a record that is not the one on screen.
           It redraws, always.
         The club-details form also saves through ALL[club] rather than the
         record it captured, so the class of fault cannot recur quietly.
  v1.22 — (06/08/2026) Club details can be rebuilt from the club's own
         submission, per club, master only. Not a backup being restored — the
         same three steps run again: what the club sent (which nothing in this
         tool can write to, so it is still their text whatever has happened
         since), through the same deterministic tidier the bake used, with
         every recorded hand edit replayed on top. A backup can be missing;
         this cannot be, unless the submission is.
         Only the details. People are never touched — they carry the admin
         team's work and there is no version of this worth trading that for.
         Offered in the empty-card notice, where the problem announces itself,
         and in the details form for a field quietly lost rather than the lot.
         Master only is enforced by the rules as well as the button: reading
         the submissions node needs the master claim, so an editor's token
         would be refused regardless.
  v1.21 — (06/08/2026) Two fixes after Billericay Town's club card came back
         empty — every ground, address, contact and social field gone, while
         the people on the same club were untouched.
         The cause is not yet found, so this makes it loud rather than
         silent. A save that would take a club from five or more held details
         to none is refused, the record is restored from the pre-change
         snapshot, and the message names the action that tried it — which is
         the thing that was missing while working out what had happened. It
         counts values rather than keys: thirty fields all holding an empty
         string renders exactly the same blank card as thirty fields that have
         gone, and the first cut of this guard waved that straight through.
         An empty card now says so, instead of rendering nothing underneath
         correction boxes still describing fields that are no longer there.
         Separately: the club-details form used Brackley Town's real ground,
         town, county, postcode, station and switchboard as placeholder text.
         On an empty form those read as entered data — on a form somebody
         opens precisely because they are unsure what is held, that is the
         worst thing to show. Every placeholder now starts "e.g." and none is
         a real club.
  v1.20 — (06/08/2026) Frozen versions. Undo protects a change; this protects
         the project. A master can freeze the whole directory — every club,
         every person, and the provenance explaining how it got that way — and
         restore a club from it later.
         Two guarantees, both in the rules rather than here, because a safety
         net a page can decide to ignore is not one. Only a master may create
         one, so an editor cannot touch the thing that exists to survive an
         editor. And it is write-once: there is no parent write grant, only a
         per-edition rule requiring the key to be empty, so nobody — master
         included — can overwrite or delete one. You supersede an edition by
         taking another.
         Restoring is per club and loud about what it discards. Putting all 72
         back with one button is the footgun already removed from undo, and
         the realistic recovery is one club anyway. A restore goes through
         saveStructure, so it lands in the journal and can itself be undone.
  v1.19 — (05/08/2026) A Publish button, and a published copy behind it.
         The reader read the directory itself and decided in the browser what
         not to show — unsigned clubs greyed out, a not-for-publication
         person's address replaced with "Not published". Both decisions were
         right and both were made after the record had already been sent.
         Behind a six-digit code that was survivable; it is not something to
         carry into a public page, and a public page is where this is going.
         Publish now builds a second copy at published/: signed-off clubs
         only, and for anyone the club asked us to keep back the contact
         details are absent rather than blanked. The person stays listed,
         because a directory that silently omits the safeguarding officer
         reads as a club without one — but there is nothing in the file to
         hide, so no rule has to be clever about that node and no page built
         against it later can leak by asking for too much.
         Complete and published are now two facts, and the sign-off box says
         which is which. Reopening a club drops it at the next publish rather
         than instantly, so readers keep a coherent version in the meantime.
  v1.18 — (05/08/2026) Undo is isolated, and nothing expires.
         Undo used to put the whole club back to how it was before the change,
         which meant reaching for a mistake made at ten quietly threw away the
         six job titles fixed at eleven. It now reverses only what its own act
         touched — the people it changed, the club-detail fields it changed —
         and leaves the rest of the club exactly where it is. The unit is the
         person rather than the field, because the acts here are person-shaped;
         the one case it cannot isolate is two changes to the SAME person, and
         the confirm now names who made the later one before you press.
         With that, the body behind an entry is a few hundred bytes rather than
         a whole club, so the twenty-per-club cap has gone. Nothing is pruned.
         The list carries club crests, since it runs across all 72 and a crest
         finds the club faster than reading the name.
  v1.17 — (05/08/2026) The paired chip says "Changed", not "Sorted", and the
         card says "1 flagged detail has since been changed" rather than
         "1 flag sorted". All the tool can observe is that the flag stopped
         firing, and a value typed wrong silences a check exactly as well as a
         value typed right — so "Sorted" was the page vouching for work it had
         not seen, which on a flag that exists precisely because nobody should
         guess is the wrong claim to make. Who changed it and what it used to
         say stay in the tooltip, which is the part a reviewer can judge.
  v1.16 — (05/08/2026) "My changes", and an undo behind it. Deleting somebody
         was final, which for a job where the point is being unsure about the
         data was the wrong thing to be certain about. Every save now leaves a
         line in an append-only journal, and the club as it was immediately
         before goes to a separate node keyed on that line.
         Two views of one record, deliberately. Yours is a working list —
         your entries, newest first, anything you have undone filtered out,
         because an undone change is not work you did. A master's is the whole
         thing including the undos, so "an editor removed the board and then
         put it back" reads as the two acts it was rather than as nothing
         having happened.
         Undo restores the people, the club's own details, the sign-off state,
         and the amber and green markers with them — a reverted edit that left
         a green chip behind would have the row claiming a change that is no
         longer there.
         Also fixed: three places rewrote the whole provenance node from a
         fixed list of keys, which would have deleted the journal on the first
         amber undo, on the first club-detail undo, and on every re-check.
  v1.15 — (05/08/2026) A flag and its resolution now sit together. A red chip
         and a green one side by side stated two facts and left you to join
         them up; a flag that had been dealt with simply vanished, so a row
         that had been through something looked like a row that never had.
         Flags are now re-derived from the tidier on every draw and compared
         with what the bake stored, which gives three states rather than one:
         still there (red), no longer there (one chip, red half and green half,
         with who fixed it and what it used to say in the tooltip), and newly
         introduced (red, immediately — an editor who types a nine-digit phone
         number finds out now rather than at the next Re-check). The club's own
         details get the same treatment as a "sorted" box on the card.
  v1.14 — (05/08/2026) Two things the consolidation got wrong.
         · Publishing somebody the club asked us to keep off is the one thing
           in this form that reaches outside the League, and it had become a
           silent tick. The old publish toggle confirmed; folding it into the
           form lost that. It asks again — and only in that direction, because
           a confirm on the safe half is noise that teaches people to click
           through the dangerous one.
         · The modal claimed to be everything about a person and showed one of
           their roles, merely naming the others. Every role is now a card in
           it, each with its own title, department and remove, so fixing two
           job titles is one visit rather than two. The row you came in from is
           marked. Remove at the foot became "Remove this person…", since
           removing one role is now a button on that role.
  v1.13 — (05/08/2026) One button per row, one screen behind it. The pen now
         opens "Update details", carrying everything about the person: name,
         job title, department, published or not, email addresses and phone
         numbers.
         It replaces four separate ways in — typing into the row itself, a
         contact-details modal, a publish toggle and a department dropdown —
         which between them had drawn an arbitrary line, where an address
         counted as "their details" and their name did not.
         Typing into the row is gone with them, and with it setEditing, the
         contenteditable cells, the placeholder dance, the live commit marker
         and the sibling strip. Two ways to change the same field is worse
         than one even when both work, and this is the one that can show a job
         title and the address that goes with it at the same time.
         The amber undo now writes to the record directly rather than through
         a cell that no longer exists, and drops its own marker as it goes.
  v1.12 — (05/08/2026) Email addresses and phone numbers are editable, which
         for a contacts directory was the wrong thing to be missing. A modal
         rather than a cell, because they are lists: 9 people hold more than
         one address and 17 more than one number, so it needs adding to and
         removing from as well as typing in.
         Each entry can optionally name the role it is for. Off by default and
         off for almost everybody — untagged means "wherever this person
         appears", which is how every existing record already behaves. It is
         there for clubs like Truro, whose safeguarding lead holds cblack@,
         commercial@ AND safeguarding@ against exactly those two roles. Nine
         cases did not justify moving contact details onto the role and
         restructuring 1,070 records.
         Also: an (i) on every red chip. The reason is the useful half of a
         flag and it sat behind a hover with nothing to advertise it.
  v1.11 — (05/08/2026) The club picker says which clubs are done — "Farnham
         Town — COMPLETE". Working through 72 of them, "have I already been
         through this one" comes up before the club is even open, and the
         answer was two clicks away on the club itself. Rebuilt after every
         sign-off and reopen rather than only at boot: a label that is right
         when the page loads and stale by the third club is worse than none.
  v1.10 — (05/08/2026) Two bugs in the green markers.
         · Enter committed the value and left the row open — contenteditable
           still on, the action strip still showing — so the edit had happened
           and nothing said so. Enter now finishes with the row. Escape puts
           the value back and closes for the same reason.
         · Typing a value back to what it was left it green. logEdit kept the
           latest `from` rather than the first, so the record said the field
           had changed from the wrong thing to the right thing and the row
           stayed marked forever. `from` is now the value before ANY hand
           edit, and returning a field to it removes the entry — with the tint
           going only if that was the row's last remaining marker.
  v1.9 — (05/08/2026) An editor's own changes now show as their own colour.
         Three things can be true of a field and only two of them were
         visible: the tidier changed it (amber, undoable), something is wrong
         with it (red, needs a person), or somebody typed over it — which is
         the one that matters most when two editors work the same club, and it
         left no mark at all.
         Green, because it is the only one of the three that is a person doing
         their job rather than a machine or a problem. The row carries a tint
         as well as a chip: reading down a club you want to see WHERE the work
         has been done, and one chip at a time does not give you that. "Added
         by us" moves to green with them, being the same kind of act.
         Marked live on commit rather than on the next redraw — a field edit
         deliberately does not re-render, so waiting for draw() meant the one
         moment you most want confirmation was the one moment nothing happened.
  v1.8 — (05/08/2026) Two things the last release got wrong.
         · A correction to a club detail was logged and never shown. The whole
           promise of this tool is that anything the League changed carries a
           marker saying what the club actually sent, and markProvenance only
           matches people/<id>/... paths — so Telford's main email was
           lower-cased and nobody was told. Info corrections now show on the
           card, amber, each with a put-it-back that restores the value AND
           drops the marker, so the record and what it says about itself stay
           in step.
         · Removing. The bin was the only icon-only control in a row of
           labelled buttons and read as decoration — the first report was that
           removing was not possible at all. It says "Remove…" now. And a
           person with several roles gets both outcomes rather than one: they
           have stopped doing this job, or they have left the club. Deciding
           from the role count meant deleting somebody with three roles took
           three separate removals, each asking a question that was not the
           one being answered.
         Found while testing: INFO_LABEL was computed at its own source
         position from an array declared further down the file, so it read a
         hoisted-but-unassigned var and threw mid-draw. Built on first use now.
  v1.7 — (05/08/2026) The club's own block goes through the tidier too (see
         _tidy.js v1.2). What it fixes shows as amber markers like any other
         correction; what it cannot fix shows as a red list at the head of the
         card, because a club detail has no row to hang a chip on and a broken
         social value is precisely the one that will not render as a link.
         Re-check all runs the info pass as well — verified idempotent across
         all 72 — and now counts job titles and club details separately.
  v1.6 — (05/08/2026) The club's own details were read-only, and the row
         actions did not say what they were for.
         · A pen on the club card opens every info field in one form —
           ground, address, contact, sponsors, socials. A modal rather than
           contenteditable cells, because half these facts are composites: the
           address is five fields, capacity is two, the station is two, and
           editing a rendered sentence is worse than editing a form.
         · "Move role to:" labels the department dropdown. Unlabelled it read
           as a filter, or as a statement of where the person already was.
         · "Add another role" hangs a second department on the person whose
           row is open — distinct from "Add someone", which mints a new one.
         · Editing somebody names their other departments under the row, each
           a button that scrolls to and flashes that entry, and marks those
           rows while the row is open. On a club the size of Merthyr the other
           rows are a screen away, so a highlight alone would have been a
           highlight on something nobody can see.
  v1.5 — (05/08/2026) Not-for-publication was invisible and unchangeable.
         290 of 1,070 people across 65 of the 72 clubs are marked to keep
         their details off the published directory. The editor shows those
         details — that is its job — but said nothing about the state, so an
         editor read an address with no way of knowing it will never reach a
         reader, and no way to change it if the club said it could.
         Every row that carries the mark now says "Not published" beside the
         details, in _directory.js so the staff view and search get it too,
         and there is a publish / unpublish toggle in the row actions. It
         confirms in both directions: the club asked for this, and overriding
         it across three departments is not something to do on one click.
  v1.4 — (05/08/2026) Add, remove and move — the three things the editor
         could not do, plus the trap that fell out of adding them.
         · Add someone: a button at the foot of the club, because a department
           with nobody in it is not rendered, so "add to Ticketing" cannot
           hang off a Ticketing heading that does not exist.
         · Remove: one button covering both of Richard's asks. Removing
           somebody's only role removes them; removing one of several leaves
           them where they still belong, and the confirm says which.
         · Move: a department picker on the row, live only while editing.
         · The rename trap. Josh Knowles is Head of Media AND programme
           editor. A new hire takes the programme, an editor types over the
           name in that row, and Josh becomes Jane in the media department
           too — carrying Josh's email into Jane's entry. That was always the
           behaviour; syncing sibling rows in v1.3 only made it visible.
           Renaming somebody with more than one role now asks which was meant.
           The replacement takes the job title and none of the contact
           details, because a new person wearing the old person's email looks
           correct and is wrong.
         · Anyone the League adds is stamped and carries an "Added by us"
           chip. The sign-off page shows clubs their own submission; quietly
           adding to it would be putting words in their mouth.
         All three are blocked on a signed-off club, and all three confirm,
         because nothing here has an undo — the amber chips can put a
         correction back, a removed person is gone.
  v1.3 — (05/08/2026) Editing the name of somebody who appears in two
         departments. The record was always right — one person, both roles,
         saved once — but the other row on screen kept the old name until a
         redraw, so an editor who renamed someone under Media scrolled to
         Programme, saw the name they had just changed, and either thought it
         had not saved or typed it again. Sibling rows now follow. Job titles
         deliberately do not: a title belongs to one role and is meant to
         differ between departments.
         Also: the name splitter took the first word as the first name, which
         made "Dr Daniel Palmer" a person whose first name is Dr — breaking
         the email-name check, sorting, and anything reading lastName. Twelve
         people across the 72 clubs carry a title or post-nominals. It now
         peels off what is already on the record plus the handful a club would
         actually type, and leaves everything else where the editor put it.
  v1.2 — (05/08/2026) Four fixes and a second door, all of them things that
         made the tool harder to use than the job it does.
         · Re-check all (master only). The bake is one-shot, correctly, which
           also means a fix to the tidier can never reach a directory that has
           already been built — and _tidy.js v1.1 turned out to have been
           missing "Director Of Football" all along. This runs only the two
           passes that are safe against edited data: minor-word casing, which
           is idempotent, and the attention scan, which writes nothing. The
           typo list, the compound split, the merge and the full recase all
           stay behind the bake, because against a record an editor has since
           corrected they would be judgements about the editor's work.
         · Hash routing. A club per URL, so an editor can send one to a
           colleague, reopen where they left off, and not lose their place on
           every refresh. The reader and the staff view already had it.
         · An empty job title renders "No job title" in italics, and editing
           it meant deleting those words first. The placeholder now clears on
           the way in and comes back if the cell is still empty on the way out.
         · Red chips for what _tidy.js v1.1 flags but will not fix: a mailbox
           that does not match the name, a phone number the wrong length, one
           title carried across two departments. The reason sits in the
           tooltip, not the chip.
         · The bake stores that flag list alongside the change log, and counts
           it in the audit entry and the master diagnostic line.
  v1.1 — (05/08/2026) The row pen is canon. .ed-pen was the third hand-rolled
         icon-only button in the repo and the reason .btn--icon was promoted
         into nl-brand.css v2.33; the local box/colour/size CSS is deleted and
         only its position survives. The glyph now comes from NL.icon() rather
         than the tool-local strokeGlyph(), which hardcodes fill/stroke onto
         the svg and so only ever renders the stroked half of the sprite.
  v1.0 — (04/08/2026) The directory, editable, behind per-person six-digit codes.

  What this is
  ------------
  Where the League's admin team keeps the directory right. Every edit writes
  straight to app-data/ops-club-directory/clubs and is attributable, because
  each editor holds their own code and therefore their own uid. A shared code
  would make the audit trail say nothing, and the audit trail is the reason
  this exists rather than people editing the database by hand.

  The margin markers
  ------------------
  Any field the bake changed carries a marker in the gutter. Click it and it
  says what the club actually sent, with one click to put it back. That is the
  difference between "we tidied your data" and "we changed something and you
  cannot see what" — and it is why _tidy.js threads a provenance log through
  every pass rather than just counting.

  The bake
  --------
  One-shot, master key only, and it refuses to run twice. It reads the raw
  submissions, runs the same tidier the sign-off pages promise clubs, and
  writes the result here with its provenance. After that the tidier never runs
  against this node again: re-running it would stomp on editor work.

  Gated by auth-guard (v2.0). Not lint-covered all the same: lint looks two
  folders deep and this page is three.
   ========================================================================= */
window.NLEditor = (function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = NL.escHtml;
  var ROOT = 'app-data/ops-club-directory';
  var ALL = {}, PROV = {}, names = [], session = null, current = '', HOST = null, STARTED = null;

  /* Remembered per person, not per club — otherwise it is chosen again on
     every one of 72. The list stays the default here: an editor's job is
     reading down a column of addresses looking for the wrong one, and a
     column is what a list is for. */
  var VIEW = 'list';
  try { VIEW = localStorage.getItem('nlcd-view') || 'list'; } catch (e) {}

  function viewOpts(extra) {
    var o = { showHidden: true, showGaps: true,
              cards: VIEW === 'cards', viewSwitch: true };
    for (var k in (extra || {})) { o[k] = extra[k]; }
    return o;
  }

  /* Drawn by renderClub above the people it applies to, and rebuilt on every
     draw — so this listens on the container rather than on buttons that do
     not exist yet. Search results build their own list without renderClub, so
     they get their own switcher below. */
  function wireView() {
    var host = $('out');
    if (!host) { return; }
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-view-switch] button');
      if (!b || !HOST.editing()) { return; }
      VIEW = b.dataset.v;
      try { localStorage.setItem('nlcd-view', VIEW); } catch (e2) {}
      var q = $('q').value;
      if (q.trim()) { search(q); }
      else if (current) { draw(current); }
    });
  }

  /* Nothing in a browser tells you a click handler died. Today an exception
     inside the club-details save took everything after it with it — the
     record write, the journal entry, the modal closing — and the only sign
     was a marker for a change that had not happened. The tool looked like it
     had a data bug for several hours because a fault had no way of reaching
     the person in front of it.

     So every uncaught error and every unhandled rejection says so. It cannot
     make the tool correct, but it can stop it being quietly wrong, which is
     the difference between a bug that gets reported accurately and one that
     gets reported as "something's broken". */
  function watchFaults() {
    window.addEventListener('error', function (e) {
      if (!HOST || !HOST.editing()) { return; }
      reportFault(e && e.error && e.error.message ? e.error.message : (e && e.message));
    });
    window.addEventListener('unhandledrejection', function (e) {
      if (!HOST || !HOST.editing()) { return; }
      var r = e && e.reason;
      reportFault(r && r.message ? r.message : String(r));
    });
  }

  var lastFault = 0;
  function reportFault(msg) {
    if (!msg) { return; }
    var now = Date.now();
    if (now - lastFault < 4000) { return; }   /* one message, not a cascade */
    lastFault = now;
    try {
      NL.toast('Something went wrong and your last action may not have saved: ' +
        msg + ' \u2014 check "Change log" before carrying on.', 'error');
    } catch (x) { /* the reporter must never be the thing that fails */ }
  }

  /* Started by the staff page the first time somebody with Manage turns
     Edit on (v2.2). The page owns the club list, the picker, the address and
     the search box; this owns everything that changes a record. ALL is the
     page's own object, not a copy, so an edit shows in the reading view and
     the overview the moment Edit is turned off. Provenance (the journal) and
     the last-published stamp are read here, once, because only an editor
     needs them. Access is the page's check and the rules' — this only ever
     runs for Manage. */
  function start(host) {
    if (STARTED) { return STARTED; }
    HOST = host;
    ALL = host.all;
    names = host.names();
    var who = host.session || {};
    session = { role: 'admin', name: who.name || who.email || 'League' };
    watchFaults();
    STARTED = Promise.all([
      firebase.database().ref(ROOT + '/provenance').once('value'),
      firebase.database().ref(ROOT + '/published/live').once('value')
    ]).then(function (res) {
      PROV = res[0].val() || {};
      $('changes').addEventListener('click', showChanges);
      wireView();
      /* The switch to live saving happens once, the first time anybody
         opens the editor after it ships: every club's page and private
         details written from the directory as it stands, so nothing saved
         under the old Publish is left behind. */
      if (!res[1].val()) { return goLive(); }
    }).catch(function (err) {
      STARTED = null;
      throw err;
    });
    return STARTED;
  }

  /* ------------------------------------------------------------ render */

  function draw(name) {
    /* A save that lands after Edit was turned off still redraws: the page
       draws it the reading way. */
    if (!HOST.editing()) { return HOST.draw(name); }
    current = name;
    var rec = ALL[name];
    if (!rec) { return; }
    rec.club = rec.club || name;
    /* The baseline the next act will be journalled against. Taken here rather
       than threaded through each mutation because every path into a change
       starts from a drawn club and ends in a save that redraws it, so "the
       state at the last draw" and "the state before this act" are the same
       thing — and this way a mutation added later gets its undo for free. */
    BEFORE[name] = snapshot(name);
    /* The page keeps the picker and the address in step with whichever way
       the club was reached — the picker, the address, an undo, a search
       hit — and clears the search box. */
    HOST.onDraw(name);
    $('out').innerHTML = NLDirectory.renderClub(rec, viewOpts());
    var crest = document.getElementById('cdCrest');
    if (crest) {
      var ck = NLDirectory.bannerCrestOf(rec);
      crest.alt = name + ' crest'; crest.hidden = false;
      NL.clubs.wireCrestImg(crest, ck, true);
      crest.src = NL.clubs.crestUrl(ck, 'medium');
    }
    wireEditing(name);
    wireReorder(name, rec);
    markGaps(name, rec);
    showClubEdit(name, rec);
    showAdd(name, rec);
    /* The pane below the club is rebuilt per club. (showMerges cleared it
       until v2.1, as a side effect; the import-era markers that ran here —
       Was, Added by us, Changed, the tidier's flags, sign-off, the record
       readout — came off the page then. The changes they showed are still
       logged, and read in Change log.) */
    $('extra').innerHTML = '';
    showInboxes(name, rec);
    showLists(name, rec);
  }

  /* Rows render from the shared module, so editability is attached afterwards
     rather than forking the presentation for one of the three doors. */
  function wireEditing(club) {
    var rec = ALL[club];
    var locked = false;
    var people = NLDirectory.arr(rec.people);
    var byId = {};
    people.forEach(function (p) { if (p.id) { byId[p.id] = p; } });

    /* Cards and rows both carry the person's id, so there is no counting to
       do. There used to be — the row's person was worked out from its
       position within its department — and it held only while the render
       order matched the array order. A surname sort in sectionPeople broke
       that without a word: pens opened the wrong person's form and every
       marker landed on the wrong row. Nothing is inferred from position now. */
    $('out').querySelectorAll('.cd-pc[data-pid]').forEach(function (card) {
      var person = byId[card.dataset.pid];
      if (person) { addPen(card, locked, club, person, 0); }
    });

    $('out').querySelectorAll('.cd-row[data-pid]').forEach(function (row) {
      var person = byId[row.dataset.pid];
      if (!person) { return; }
      var ridx = row.dataset.ridx;
      addPen(row, locked, club, person, ridx == null ? 0 : +ridx);
    });

  }

  /* ------------------------------------------- inboxes and mailing lists
     Two things every club sent us that nothing has ever put on screen.

     INBOXES are the club's shared mailboxes — club secretary, commercial,
     ticketing, safeguarding — with a phone and extension. 34 clubs sent them.

     MAILING LISTS are the League's own eleven questions: who is your
     secretary, your media contact, your safety officer, your SLO. All 72
     answered, naming actual people. This is the answer to "who do I write to
     at Chester about X", straight from the club, and it has been sitting in
     the database unread since the build.

     Nobody can correct what they cannot see, so until now none of it could be
     checked. A list with nobody on it is flagged rather than left blank: an
     unassigned mailing list is a message that goes nowhere. */
  /* The taxonomy itself lives in _directory.js as of v1.3 — the staff
     overview builds exports from the same eleven lists, and two copies is
     one too many the day a list is added. */
  var LIST_LABEL = NLDirectory.LIST_LABEL;
  var LIST_ORDER = NLDirectory.LIST_ORDER;
  var listMembers = NLDirectory.listMembers;

  /* Rendered whether or not the club sent any. The first cut returned early
     on an empty set, so at the 38 clubs that sent none the block did not
     exist \u2014 and with no block there was no way in, which is how a whole
     field ended up read-only by accident. An empty state that says so is
     the only version of this that can be added to. */
  function showInboxes(club, rec) {
    var boxes = rec.inboxes || {};
    var keys = Object.keys(boxes).filter(function (k) {
      var b = boxes[k] || {};
      return (b.email || '').trim() || (b.phone || '').trim();
    });
    var wrap = document.createElement('div');
    wrap.className = 'ed-block';
    var head = document.createElement('div');
    head.className = 'section-head';
    head.innerHTML = '<h2 class="ed-block__h">Shared mailboxes</h2>';
    wrap.appendChild(head);
    var hint = document.createElement('p');
    hint.className = 'form-hint';
    hint.textContent = 'Department addresses the club gave us, as opposed to ' +
      'a person\u2019s own.';
    wrap.appendChild(hint);

    if (!keys.length) {
      var none = document.createElement('p');
      none.className = 'cd-empty';
      none.textContent = 'None held for ' + club + '.';
      wrap.appendChild(none);
    }
    var ul = document.createElement('ul');
    ul.className = 'cd-cards';
    keys.sort().forEach(function (k) {
      var b = boxes[k] || {};
      var li = document.createElement('li');
      li.className = 'cd-pc';
      li.innerHTML = '<div class="cd-pc__top"><div class="cd-pc__id">' +
        '<div class="cd-pc__name">' + esc(b.dept || k) + '</div></div></div>' +
        '<div class="cd-pc__lines">' +
        ((b.email || '').trim()
          ? '<a class="cd-pc__line" href="mailto:' + esc(b.email) + '">' +
            '<span class="cd-pc__ic">' + NLDirectory.glyph('email') + '</span>' +
            esc(b.email) + '</a>' : '') +
        ((b.phone || '').trim()
          ? '<a class="cd-pc__line" href="tel:' + esc(b.phone) + '">' +
            '<span class="cd-pc__ic">' + NLDirectory.glyph('phone') + '</span>' +
            esc(b.phone) +
            ((b.ext || '').trim()
              ? ' <span class="cd-row__ext">ext ' + esc(b.ext) + '</span>' : '') +
            '</a>' : '') +
        '</div>';
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
    var marks = document.createElement('div');
    marks.id = 'edBoxEdits';
    wrap.appendChild(marks);
    var btn = document.createElement('button');
    btn.className = 'btn btn--sm btn--ghost';
    btn.type = 'button';
    btn.textContent = keys.length ? 'Edit shared mailboxes' : 'Add a shared mailbox';
    btn.addEventListener('click', function () { editInboxes(club, rec); });
    head.appendChild(btn);
    $('extra').appendChild(wrap);
  }

  /* A club's departmental addresses — commercial@, tickets@ — which are
     frequently the address the club would rather you used. 34 of the 72 sent
     them and nothing could touch them afterwards.

     The department is picked from the League's own list rather than typed,
     because these get matched onto mailing lists by their label on the staff
     overview, and a free-typed "Comms" matches nothing. Anything genuinely
     outside the list goes under Other with a name of its own — which is what
     the clubs did themselves: Careers, Retail, Club Office. */
  function editInboxes(club, rec) {
    var boxes = rec.inboxes || {};
    var DEPTS = NLDirectory.isOrg(rec) ? NLDirectory.ORG_ORDER : NLDirectory.ORDER;
    var rows = Object.keys(boxes).sort().map(function (k) {
      var b = boxes[k] || {};
      return { key: k, dept: b.dept || k, email: b.email || '',
               phone: b.phone || '', ext: b.ext || '', gone: false };
    });

    var wrap = document.createElement('div');
    var paint = function () {
      wrap.innerHTML = '';
      var live = rows.filter(function (r) { return !r.gone; });
      if (!live.length) {
        var p0 = document.createElement('p');
        p0.className = 'form-hint';
        p0.textContent = 'None yet. Add one below.';
        wrap.appendChild(p0);
      }
      live.forEach(function (r) {
        var card = document.createElement('div');
        card.className = 'ed-role';
        var grid = document.createElement('div');
        grid.className = 'form-grid';

        var dept = document.createElement('select');
        dept.className = 'ed-dept';
        dept.innerHTML = DEPTS.map(function (sec) {
          return '<option value="' + esc(sec) + '"' +
            (sec === r.dept ? ' selected' : '') + '>' + esc(sec) + '</option>';
        }).join('') +
          '<option value="__other"' +
          (DEPTS.indexOf(r.dept) < 0 ? ' selected' : '') +
          '>Something else…</option>';

        var other = document.createElement('input');
        other.className = 'ed-cval';
        other.value = DEPTS.indexOf(r.dept) < 0 ? r.dept : '';
        other.placeholder = 'e.g. Retail';
        other.hidden = dept.value !== '__other';
        dept.addEventListener('change', function () {
          other.hidden = dept.value !== '__other';
          r.dept = dept.value === '__other' ? other.value.trim() : dept.value;
          if (dept.value === '__other') { other.focus(); }
        });
        other.addEventListener('input', function () { r.dept = other.value.trim(); });

        var deptWrap = document.createElement('div');
        deptWrap.appendChild(dept);
        deptWrap.appendChild(other);

        var em = document.createElement('input');
        em.className = 'ed-cval'; em.type = 'email'; em.value = r.email;
        em.placeholder = 'e.g. tickets@example.co.uk';
        em.addEventListener('input', function () { r.email = em.value.trim(); });

        var ph = document.createElement('input');
        ph.className = 'ed-cval'; ph.value = r.phone;
        ph.placeholder = 'e.g. 01234 567890';
        ph.addEventListener('input', function () { r.phone = ph.value.trim(); });

        var ex = document.createElement('input');
        ex.className = 'ed-cval'; ex.value = r.ext;
        ex.placeholder = 'e.g. 204';
        ex.addEventListener('input', function () { r.ext = ex.value.trim(); });

        grid.appendChild(formField('Department', deptWrap));
        grid.appendChild(formField('Email', em));
        grid.appendChild(formField('Phone', ph));
        grid.appendChild(formField('Extension', ex));
        card.appendChild(grid);

        var drop = document.createElement('button');
        drop.className = 'btn btn--sm btn--ghost ed-del';
        drop.type = 'button';
        drop.textContent = 'Remove this mailbox';
        drop.addEventListener('click', function () { r.gone = true; paint(); });
        card.appendChild(drop);
        wrap.appendChild(card);
      });

      var add = document.createElement('button');
      add.className = 'btn btn--sm btn--ghost';
      add.type = 'button';
      add.textContent = 'Add a shared mailbox';
      add.addEventListener('click', function () {
        rows.push({ key: '', dept: DEPTS[0], email: '', phone: '',
                    ext: '', gone: false });
        paint();
      });
      wrap.appendChild(add);
    };
    paint();

    NL.modal({
      title: club + ' — shared mailboxes',
      width: 'wide',
      body: wrap,
      buttons: [
        { label: 'Cancel', className: 'btn--ghost', onClick: function (c) { c.close(); } },
        { label: 'Save mailboxes', className: 'btn--primary', onClick: function (c) {
          var next = {}, used = {};
          rows.filter(function (r) { return !r.gone; }).forEach(function (r) {
            if (!r.dept || (!r.email && !r.phone)) { return; }
            /* A key already in the record keeps it, so an edit stays an edit
               rather than becoming a delete and an add. A new one is slugged
               from the department, and RTDB refuses . # $ / [ ] in a key —
               "Media & marketing" has to become media-marketing or the save
               throws synchronously and nothing is written. */
            var key = r.key || slugKey(r.dept, used);
            used[key] = true;
            next[key] = { dept: r.dept };
            if (r.email) { next[key].email = r.email; }
            if (r.phone) { next[key].phone = r.phone; }
            if (r.ext) { next[key].ext = r.ext; }
          });

          var was = rec.inboxes || {};
          var touched = [];
          keysOf(was, next).forEach(function (k) {
            if (JSON.stringify(was[k] || null) === JSON.stringify(next[k] || null)) { return; }
            var label = function (b) {
              if (!b) { return ''; }
              return [b.email, b.phone].filter(Boolean).join(', ');
            };
            touched.push((next[k] || was[k] || {}).dept || k);
            logEdit(club, 'inboxes/' + k, label(was[k]), label(next[k]));
          });
          if (!touched.length) { c.close(); return; }

          (ALL[club] || rec).inboxes = next;
          c.close();
          saveStructure(club, 'Shared mailboxes updated (' + touched.join(', ') + ')');
        } }
      ]
    });
  }

  /* RTDB refuses . # $ / [ ] in a key and throws synchronously when handed
     one, so this is not cosmetic. `used` keeps two mailboxes named the same
     thing from becoming one. */
  /* One labelled form control. Was a closure inside the person modal until
     the mailbox editor wanted the same thing — second use, so it moves out
     rather than being written twice. */
  function formField(label, node) {
    var g = document.createElement('div');
    g.className = 'form-group';
    var l = document.createElement('label');
    l.textContent = label;
    g.appendChild(l); g.appendChild(node);
    return g;
  }

  function slugKey(dept, used) {
    var base = String(dept || 'other').toLowerCase()
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'other';
    var key = base, n = 2;
    while (used[key]) { key = base + '-' + (n++); }
    return key;
  }

  function showLists(club, rec) {
    /* Club-role lists — who is your secretary, your SLO. An organisation has
       no answer to any of the eleven, and drawing the block would announce
       "mail reaches nobody" eleven times over. */
    if (NLDirectory.isOrg(rec)) { return; }
    var wrap = document.createElement('div');
    wrap.className = 'ed-block';
    var head = document.createElement('div');
    head.className = 'section-head';
    head.innerHTML = '<h2 class="ed-block__h">Mailing lists</h2>';
    wrap.appendChild(head);
    var hint = document.createElement('p');
    hint.className = 'form-hint';
    hint.textContent = 'Who receives League mail on each subject. Everyone here ' +
      'is somebody already listed above — add the person first, then put them ' +
      'on the list.';
    wrap.appendChild(hint);

    var ul = document.createElement('ul');
    ul.className = 'ed-lists';
    var empty = 0;
    LIST_ORDER.forEach(function (key) {
      var who = listMembers(rec, key);
      if (!who.length) { empty++; }
      var li = document.createElement('li');
      li.className = 'ed-list' + (who.length ? '' : ' is-empty');
      li.innerHTML = '<span class="ed-list__k">' + esc(LIST_LABEL[key] || key) + '</span>' +
        /* Plain text, not a pill. A pill carries 9px of padding, which put
           "Nobody assigned" out of line with every name above it — in a
           two-column list the left edge is what the eye follows. */
        '<span class="ed-list__v' + (who.length ? '' : ' is-none') + '">' + (who.length
          ? who.map(function (p) { return esc(NLDirectory.fullName(p)); }).join(', ')
          : 'Nobody assigned') + '</span>';
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
    var marks = document.createElement('div');
    marks.id = 'edListEdits';
    wrap.appendChild(marks);
    if (empty) {
      var n = document.createElement('p');
      n.className = 'form-hint';
      n.innerHTML = '<b>' + empty + ' list' + (empty === 1 ? ' has' : 's have') +
        ' nobody on ' + (empty === 1 ? 'it' : 'them') + '.</b> Mail on ' +
        (empty === 1 ? 'that subject' : 'those subjects') + ' reaches nobody at ' +
        esc(club) + '.';
      wrap.appendChild(n);
    }
    var b = document.createElement('button');
    b.className = 'btn btn--sm btn--ghost';
    b.type = 'button';
    b.textContent = 'Edit lists';
    b.addEventListener('click', function () { editLists(club, rec); });
    wrap.appendChild(b);
    $('extra').appendChild(wrap);
  }

  /* Eleven lists times fourteen people was a hundred and fifty tick boxes to
     answer a question that is usually "one person, and it is that one". So
     the form shows what each list HAS and lets you take somebody off or put
     somebody on — the same shape as the page it edits, banner and all, rather
     than a wall of names repeated eleven times. */
  /* Which people a list is likely to be for: the department of the same
     name, or a job title that says so. Only ever a suggestion and a flag —
     nothing is put on or taken off a list by a match. */
  var LIST_MATCH = {
    secretary:  { dept: 'Club secretary', re: /secretar/i },
    media:      { dept: 'Media & marketing', re: /media|press|communicat|marketing/i },
    programme:  { dept: 'Programme', re: /programme/i },
    commercial: { dept: 'Commercial', re: /commercial|sponsor|partnership|hospitality/i },
    finance:    { dept: 'Finance', re: /financ|account|treasurer/i },
    ticketing:  { dept: 'Ticketing', re: /ticket|box office/i },
    medical:    { dept: 'Medical', re: /medic|physio|doctor|therapist/i },
    safety:     { dept: 'Matchday & safety', re: /safety/i },
    slo:        { re: /supporter liaison|\bslo\b/i },
    dlo:        { re: /disab|\bdlo\b/i },
    plo:        { re: /police|\bplo\b/i }
  };
  function fitsList(p, key) {
    var m = LIST_MATCH[key];
    return !!m && NLDirectory.arr(p && p.roles).some(function (r) {
      return (m.dept && r.section === m.dept) || m.re.test(r.title || '');
    });
  }
  function jobsOf(p) {
    return NLDirectory.arr(p && p.roles).map(function (r) { return (r.title || '').trim(); })
      .filter(Boolean).join(', ');
  }
  /* Who's who in a list of names: the name, then what they do. */
  function whoLabel(p) {
    var j = jobsOf(p);
    return (NLDirectory.fullName(p) || 'Someone without a name') + (j ? ' \u2013 ' + j : '');
  }
  function leadId(x) { return typeof x === 'string' ? x : ((x && x.id) || ''); }
  function listsWith(rec, id) {
    return LIST_ORDER.filter(function (k) {
      return NLDirectory.arr((rec.leads || {})[k]).map(leadId).indexOf(id) > -1;
    });
  }
  /* The people to offer for a list: those whose job fits it first. */
  function listOptions(people, key, firstLabel) {
    var fit = people.filter(function (p) { return fitsList(p, key); });
    var rest = people.filter(function (p) { return !fitsList(p, key); });
    var opt = function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(whoLabel(p)) + '</option>';
    };
    return '<option value="">' + esc(firstLabel) + '</option>' +
      (fit.length ? '<optgroup label="Job matches this list">' + fit.map(opt).join('') + '</optgroup>' : '') +
      (rest.length ? '<optgroup label="' + (fit.length ? 'Everyone else' : 'Everyone') + '">' +
        rest.map(opt).join('') + '</optgroup>' : '');
  }

  /* Somebody is leaving the directory and is on mailing lists (v3.0,
     Richard: "when we remove someone that's on a list, we aren't being
     prompted"). Asked before the removal is saved, one line per list:
     who takes their place, or nobody. Resolves to { key: id|'' }, or null
     if cancelled; resolves {} straight away when they are on no list. */
  function coverLists(club, person) {
    var rec = ALL[club] || {};
    var on = person.id ? listsWith(rec, person.id) : [];
    if (!on.length) { return Promise.resolve({}); }
    var others = NLDirectory.arr(rec.people).filter(function (p) { return p.id && p !== person; })
      .slice().sort(NLDirectory.bySurname);
    var name = NLDirectory.fullName(person) || 'They';
    var body = document.createElement('div');
    body.innerHTML = '<p class="confirm-text">' + esc(name) + ' is on ' +
      (on.length === 1 ? 'a mailing list' : on.length + ' mailing lists') +
      '. Who takes their place?</p>';
    var sels = {};
    on.forEach(function (key) {
      var row = document.createElement('label');
      row.className = 'ed-cover';
      row.innerHTML = '<span class="ed-cover__list">' + esc(LIST_LABEL[key] || key) + '</span>';
      var sel = document.createElement('select');
      sel.className = 'ed-dept';
      sel.innerHTML = listOptions(others, key, 'Nobody for now');
      row.appendChild(sel);
      body.appendChild(row);
      sels[key] = sel;
    });
    return new Promise(function (resolve) {
      var settled = false;
      var done = function (v) { if (!settled) { settled = true; resolve(v); } };
      NL.modal({
        title: 'Mailing lists',
        body: body,
        onClose: function () { done(null); },
        buttons: [
          { label: 'Cancel', className: 'btn--ghost', onClick: function (c) { c.close(); } },
          { label: 'Continue', className: 'btn--primary', onClick: function (c) {
            var out = {};
            on.forEach(function (k) { out[k] = sels[k].value; });
            done(out); c.close();
          } }
        ]
      });
    });
  }
  /* Takes the leaver off each list and puts whoever was chosen on. Returns
     the words for the journal: "– Club secretary now Jo Bloggs". */
  function applyCover(club, leaver, cover) {
    var rec = ALL[club];
    var leaverId = leaver.id;
    var people = {};
    people[leaverId] = leaver;
    NLDirectory.arr(rec.people).forEach(function (p) { if (p.id) { people[p.id] = p; } });
    var said = [];
    Object.keys(cover || {}).forEach(function (k) {
      var ids = NLDirectory.arr((rec.leads || {})[k]).map(leadId)
        .filter(function (id) { return id && id !== leaverId; });
      var to = cover[k];
      if (to && ids.indexOf(to) < 0) { ids.push(to); }
      var before = NLDirectory.arr((rec.leads || {})[k]).map(leadId);
      rec.leads = rec.leads || {};
      if (ids.length) { rec.leads[k] = ids; } else { delete rec.leads[k]; }
      var nm = function (list) {
        return list.map(function (id) { return people[id] ? NLDirectory.fullName(people[id]) : id; }).join(', ');
      };
      logEdit(club, 'leads/' + k, nm(before), nm(ids));
      said.push((LIST_LABEL[k] || k) + ' now ' + (to && people[to] ? NLDirectory.fullName(people[to]) : 'nobody'));
    });
    return said.length ? ' \u2013 ' + said.join('; ') : '';
  }

  function editLists(club, rec) {
    var people = NLDirectory.arr(rec.people).filter(function (p) { return p.id; })
      .slice().sort(NLDirectory.bySurname);
    var byId = {};
    people.forEach(function (p) { byId[p.id] = p; });

    var state = {};
    LIST_ORDER.forEach(function (k) {
      state[k] = NLDirectory.arr((rec.leads || {})[k]).filter(function (id) {
        return byId[id];
      });
    });

    var wrap = document.createElement('div');
    var paint = function () {
      wrap.innerHTML = '';
      LIST_ORDER.forEach(function (key) {
        var box = document.createElement('div');
        box.className = 'ed-lg';
        var on = state[key];
        box.innerHTML = '<h4 class="cd-dept__h">' + esc(LIST_LABEL[key] || key) + '</h4>';
        var body = document.createElement('div');
        body.className = 'ed-lg__b';
        if (!on.length) {
          body.innerHTML = '<p class="ed-lg__none">Nobody assigned \u2014 ' +
            'mail on this reaches nobody.</p>';
        } else {
          on.forEach(function (id) {
            var chip = document.createElement('span');
            chip.className = 'ed-lg__who' + (fitsList(byId[id], key) ? '' : ' is-odd');
            chip.innerHTML = esc(NLDirectory.fullName(byId[id])) +
              (jobsOf(byId[id]) ? ' <span class="ed-lg__job">' + esc(jobsOf(byId[id])) + '</span>' : '');
            if (!fitsList(byId[id], key)) {
              chip.title = 'Their job title does not mention this list \u2013 still the right person?';
            }
            var x = document.createElement('button');
            x.type = 'button';
            x.className = 'ed-lg__x';
            x.setAttribute('aria-label', 'Take ' + NLDirectory.fullName(byId[id]) +
              ' off ' + (LIST_LABEL[key] || key));
            x.textContent = '\u00d7';
            x.addEventListener('click', function () {
              state[key] = state[key].filter(function (v) { return v !== id; });
              paint();
            });
            chip.appendChild(x);
            body.appendChild(chip);
          });
        }
        var left = people.filter(function (p) { return on.indexOf(p.id) < 0; });
        if (left.length) {
          var sel = document.createElement('select');
          sel.className = 'ed-lg__add';
          sel.innerHTML = listOptions(left, key, 'Add someone\u2026');
          sel.addEventListener('change', function () {
            if (!sel.value) { return; }
            state[key] = state[key].concat(sel.value);
            paint();
          });
          body.appendChild(sel);
        }
        box.appendChild(body);
        wrap.appendChild(box);
      });
    };
    paint();

    NL.modal({
      title: club + ' \u2014 mailing lists',
      width: 'wide',
      body: wrap,
      buttons: [
        { label: 'Cancel', className: 'btn--ghost', onClick: function (c) { c.close(); } },
        { label: 'Save lists', className: 'btn--primary', onClick: function (c) {
          var next = {}, changed = [];
          LIST_ORDER.forEach(function (key) {
            var was = NLDirectory.arr((rec.leads || {})[key]);
            if (state[key].join(',') !== was.join(',')) {
              changed.push(LIST_LABEL[key] || key);
            }
            if (state[key].length) { next[key] = state[key].slice(); }
          });
          if (!changed.length) { c.close(); return; }
          /* Logged per list, in names rather than ids, so the green marker
             says who was on it before rather than "p3k9tz2 -> pf81qq4". */
          var nameOf = function (ids) {
            return NLDirectory.arr(ids).map(function (id) {
              return byId[id] ? NLDirectory.fullName(byId[id]) : id;
            }).join(', ');
          };
          LIST_ORDER.forEach(function (key) {
            var was = NLDirectory.arr((rec.leads || {})[key]);
            if (state[key].join(',') === was.join(',')) { return; }
            logEdit(club, 'leads/' + key, nameOf(was), nameOf(state[key]));
          });
          (ALL[club] || rec).leads = next;
          c.close();
          saveStructure(club, 'Mailing lists updated (' + changed.join(', ') + ')');
        } }
      ]
    });
  }

  /* ------------------------------------------------------------ going live
     Every save is live (v3.0, Richard, 11/11/2026). There is no Publish:
     the moment a club is saved, three things are written together, in one
     update, so they can never disagree:

       · clubs/<club>            the full working record (League staff only)
       · published/clubs/<club>  what readers see: the record with every
                                 detail kept back taken OUT, not hidden — a
                                 page cannot leak what it was never sent
       · private/<club>          only the details kept back, readable by
                                 League staff and by that club's own code

     Undo is Change log; history is the nightly backup (30 days) and the
     monthly copy (12 months). The frozen copies Publish used to write in
     editions/ stop; the ones already there stay, read-only. */
  var PUB_PERSON = ['id', 'title', 'firstName', 'lastName', 'postNominals',
                    'name', 'roles', 'hideContact'];

  function publishablePerson(p) {
    var out = {};
    PUB_PERSON.forEach(function (k) {
      if (p[k] !== undefined && p[k] !== null) { out[k] = clone(p[k]); }
    });
    /* The whole point. Not blanked, not flagged — not there. `added` goes too:
       whether the League typed somebody in or the club did is our business.

       Per entry as of v1.32, so a person can publish their club address and
       keep their mobile back. Same guarantee either way: what is held back is
       removed from the published copy, so no rule has to be clever and no
       reader can ask for it. hideContact still means all of it. */
    if (!p.hideContact) {
      var em = NLDirectory.arr(p.emails).filter(function (e) {
        return NLDirectory.addrOf(e).trim();
      });
      var ph = NLDirectory.arr(p.phones).filter(function (x) {
        return x && (x.number || '').trim();
      });
      var keepEm = em.filter(function (e) { return !NLDirectory.ownHide(e); });
      var keepPh = ph.filter(function (x) { return !NLDirectory.ownHide(x); });
      out.emails = clone(keepEm) || [];
      out.phones = clone(keepPh) || [];
      /* Only when a channel is emptied ENTIRELY. It is how the reader tells
         "held back" from "we do not have one" — with one of three addresses
         withheld there is nothing to say, because the reader is not owed a
         count of what it is not getting. */
      if (em.length && !keepEm.length) { out.hideEmail = true; }
      if (ph.length && !keepPh.length) { out.hidePhone = true; }
    }
    return out;
  }

  /* What publishablePerson took out, and nothing else: the private
     half of one person. hideContact means every address and number. */
  function privateOf(p) {
    var em = NLDirectory.arr(p.emails).filter(function (e) {
      return NLDirectory.addrOf(e).trim() && (p.hideContact || NLDirectory.ownHide(e));
    });
    var ph = NLDirectory.arr(p.phones).filter(function (x) {
      return x && (x.number || '').trim() && (p.hideContact || NLDirectory.ownHide(x));
    });
    if (!em.length && !ph.length) { return null; }
    var out = {};
    if (em.length) { out.emails = clone(em); }
    if (ph.length) { out.phones = clone(ph); }
    return out;
  }

  /* One club, split into its public and private halves. The code is the
     key a club's own code carries (clubs-meta), which the rules match to
     let that club, and only that club, read its private half. */
  function liveOf(name) {
    var rec = ALL[name] || {};
    var list = NLDirectory.arr(rec.people);
    var out = list.map(publishablePerson);
    var pub = { club: name, info: clone(rec.info || {}), people: out };
    var org = null;
    /* The root markers survive: readers pin organisations above the clubs
       and pick their crest by these, and an org's shared mailboxes are on
       its card. A club's mailboxes stay staff-only. */
    if (rec.org) {
      pub.org = true;
      if (rec.inboxes) { pub.inboxes = clone(rec.inboxes); }
      if (rec.colors) { pub.colors = clone(rec.colors); }
      if (rec.bannerCrestName) { pub.bannerCrestName = rec.bannerCrestName; }
      if (rec.order) { pub.order = clone(rec.order); }
      /* The wall's public leaf: name and crest key only. Always truthy —
         RTDB drops a null, and a dropped value would drop the org. */
      org = { crestName: rec.crestName || name };
    }
    if (rec.crestName) { pub.crestName = rec.crestName; }
    var meta = (!rec.org && NL.clubs && NL.clubs.byName) ? NL.clubs.byName(name) : null;
    var priv = { people: {} };
    if (meta && meta.code) { priv.code = String(meta.code).toUpperCase(); }
    list.forEach(function (p, i) {
      var held = privateOf(p);
      if (held) { priv.people[p.id || ('i' + i)] = held; }
    });
    return { pub: pub, org: org, priv: priv, leaks: escaped(name, list, out) };
  }

  function liveUpdates(name, at, into) {
    var u = into || {};
    var l = liveOf(name);
    u['clubs/' + name] = ALL[name];
    u['published/clubs/' + name] = l.pub;
    u['published/orgs/' + name] = l.org;
    u['private/' + name] = l.priv;
    u['published/at'] = at;
    u['published/by'] = session.name || 'editor';
    return { updates: u, leaks: l.leaks };
  }

  /* The one save. Every route that changes a club ends here. */
  function saveClub(name) {
    var lu = liveUpdates(name, Date.now());
    return firebase.database().ref(ROOT).update(lu.updates).then(function () {
      warnLeaks(lu.leaks);
    });
  }

  /* The switch-over, run once. Writes every club's public and private
     halves from the directory as it stands, clears what only Publish used
     (its label, counts and edition pointer), and marks the directory live. */
  function goLive() {
    var at = Date.now(), u = {}, leaks = [];
    Object.keys(ALL).forEach(function (n) { leaks = leaks.concat(liveUpdates(n, at, u).leaks); });
    u['published/live'] = at;
    u['published/label'] = null;
    u['published/edition'] = null;
    u['published/count'] = null;
    u['published/people'] = null;
    u['published/pending'] = null;
    return firebase.database().ref(ROOT).update(u).then(function () {
      NL.writeAudit('directory_live', 'Saves now go live: every club written from the directory (' +
        Object.keys(ALL).length + ' records) by ' + (session.name || 'editor'));
      NL.toast('Editing is live now: each save updates that club\u2019s page straight away.', 'success');
      warnLeaks(leaks);
    });
  }

  /* The one way a withheld detail can still go out, and it is not a fault in
     the stripping — it is the duplicates. 57 people across 26 clubs were
     entered twice, so marking a mobile not-for-publication on one record
     leaves the other record publishing the same number, and the club's
     request is defeated by a copy nobody remembered was there.

     Nothing here guesses which record is right; that is the editor's call and
     merging is a separate job. It just refuses to let it happen quietly. */
  function escaped(club, before, after) {
    var who = function (p) { return NLDirectory.fullName(p).trim().toLowerCase(); };
    /* Keyed by name AND value, not by value alone. The first cut keyed on the
       value and stopped a publish at Horsham because the club switchboard was
       withheld against one person and published against three others — which
       is not a leak, it is one public number that somebody did not want on
       their own card. The case worth stopping is the SAME PERSON twice. */
    var withheld = {};
    before.forEach(function (p) {
      var n = who(p);
      if (!n) { return; }
      var c = NLDirectory.contactsOf(p, '');
      c.emails.concat(c.phones).forEach(function (x) {
        if (x.hide) { withheld[n + '\u0000' + x.value.trim().toLowerCase()] = x.value; }
      });
    });
    if (!Object.keys(withheld).length) { return []; }
    var out = [];
    after.forEach(function (p) {
      var n = who(p);
      if (!n) { return; }
      NLDirectory.arr(p.emails).map(NLDirectory.addrOf)
        .concat(NLDirectory.arr(p.phones).map(function (x) { return x && x.number; }))
        .forEach(function (v) {
          var k = n + '\u0000' + String(v || '').trim().toLowerCase();
          if (!String(v || '').trim() || !withheld[k]) { return; }
          out.push({ club: club, value: withheld[k], on: NLDirectory.fullName(p) });
        });
    });
    return out;
  }

  /* After a save, not before it: a save cannot be undone by refusing it, so
     this says what to fix rather than asking whether to carry on. */
  function warnLeaks(leaks) {
    if (!leaks || !leaks.length) { return; }
    NL.alert(leaks.slice(0, 12).map(function (x) {
      return '\u2022 ' + x.value + ' \u2013 private on one ' + x.on + ' entry at ' + x.club +
        ', but showing on the other';
    }).join('\n') + (leaks.length > 12 ? '\n\u2026and ' + (leaks.length - 12) + ' more' : '') +
      '\n\nThe same person is in the directory twice, and only one entry marks this ' +
      'private. Mark it private on the other entry too, or remove the duplicate.',
      { title: 'A private detail is still showing' });
  }

  /* --------------------------------------------------------- the journal
     Every save leaves two records, and they are deliberately not the same
     record.

     The JOURNAL is append-only. Nothing is ever edited or deleted in it, and
     an undo does not remove the thing it undoes — it appends an entry that
     points at it. So a master looking at a club sees both halves: an editor
     removed a club's whole board, and then that editor put it back. That is
     the honest account, and it is the one worth keeping.

     The WORKING LIST is derived from the journal, not stored: your own
     entries, most recent first, with anything you have since undone filtered
     out. An undone change is not work you did; it is work you did and then
     un-did, and a to-do list that keeps showing it is lying to you.

     The body at .../undo/<club>/<id> is a PATCH, not a snapshot, and that
     distinction is the whole design. The first cut stored the club as it was
     and put the whole thing back, which meant undoing a mistake made at ten
     silently threw away the six job titles fixed at eleven. Undo now reverses
     only what its own act touched — the people it changed, the club-detail
     fields it changed — and leaves everything else exactly where it is.

     The unit of isolation is the person, not the field, because the acts this
     tool performs are person-shaped: "update details for X" changes a name, a
     title, three addresses and a publish flag as one decision, and unpicking
     it field by field would let you land halfway through somebody's move to a
     new job. The one case it does not isolate is two acts on the SAME person —
     undoing the earlier one takes the later one with it, for that person only.
     The journal entry carries the ids it touched so the confirm can say so
     before you press it.

     It lives at a separate path rather than in the journal because the editor
     loads every club's provenance at boot; the journal entry is a line of
     text, a timestamp and a short list of ids.
     Nothing is pruned. The first cut kept twenty per club, which was sized
     for whole-club snapshots at twenty-odd kilobytes each; a patch is a few
     hundred bytes and lives in a node the editor never loads at boot, so a
     cap would be throwing away the one thing this exists to keep. */
  var BEFORE = {};

  function clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }
  function same(a, b) { return JSON.stringify(a === undefined ? null : a) ===
                               JSON.stringify(b === undefined ? null : b); }

  function snapshot(club) {
    var rec = ALL[club] || {}, prov = PROV[club] || {};
    return {
      people:    clone(NLDirectory.arr(rec.people)) || [],
      info:      clone(rec.info || {}),
      leads:     clone(rec.leads || {}),
      inboxes:   clone(rec.inboxes || {}),
      signedOff: rec.signedOff || null,
      edits:     clone(NLDirectory.arr(prov.edits)) || [],
      changes:   clone(NLDirectory.arr(prov.changes)) || []
    };
  }

  function byId(list) {
    var m = {};
    /* 'i' + index, not '#' + index: # is one of the characters RTDB refuses
       in a key, and these become keys under undo/<club>/<id>/people. */
    (list || []).forEach(function (p, i) { m[(p && p.id) || ('i' + i)] = { p: p, i: i }; });
    return m;
  }
  function byPath(list) {
    var m = {};
    (list || []).forEach(function (e) { if (e && e.path) { m[e.path] = e; } });
    return m;
  }
  function keysOf() {
    var out = {};
    for (var i = 0; i < arguments.length; i++) {
      Object.keys(arguments[i] || {}).forEach(function (k) { out[k] = 1; });
    }
    return Object.keys(out);
  }

  /* before -> after, as the smallest thing that can put before back. */
  function diffClub(a, b) {
    var A = byId(a.people), B = byId(b.people), out = {}, people = {};
    keysOf(A, B).forEach(function (id) {
      var x = A[id] || null, y = B[id] || null;
      if (same(x && x.p, y && y.p)) { return; }
      people[id] = { before: x ? clone(x.p) : null, after: y ? clone(y.p) : null };
      if (x) { people[id].at = x.i; }        /* so a restored person lands back
                                                 where they were, not at the end */
    });
    if (keysOf(people).length) { out.people = people; }

    var info = {};
    keysOf(a.info, b.info).forEach(function (k) {
      if (same((a.info || {})[k], (b.info || {})[k])) { return; }
      info[k] = { before: (a.info || {})[k] == null ? null : (a.info || {})[k],
                  after:  (b.info || {})[k] == null ? null : (b.info || {})[k] };
    });
    if (keysOf(info).length) { out.info = info; }

    /* Mailing lists. Missing from the first cut, so changing one produced an
       empty patch: no Undo button on the entry, and nothing to put back if
       there had been. Keyed by list because a list key is a plain word —
       secretary, slo — and safe as an RTDB key, unlike a path. */
    var leads = {};
    keysOf(a.leads, b.leads).forEach(function (k) {
      if (same((a.leads || {})[k], (b.leads || {})[k])) { return; }
      leads[k] = { before: clone((a.leads || {})[k]) || null,
                   after:  clone((b.leads || {})[k]) || null };
    });
    if (keysOf(leads).length) { out.leads = leads; }

    /* Shared mailboxes, on the same terms and for the same reason. Keyed by
       mailbox because those keys are slugs — media-marketing, other-careers —
       and safe as RTDB keys. */
    var boxes = {};
    keysOf(a.inboxes, b.inboxes).forEach(function (k) {
      if (same((a.inboxes || {})[k], (b.inboxes || {})[k])) { return; }
      boxes[k] = { before: clone((a.inboxes || {})[k]) || null,
                   after:  clone((b.inboxes || {})[k]) || null };
    });
    if (keysOf(boxes).length) { out.inboxes = boxes; }

    if (!same(a.signedOff, b.signedOff)) {
      out.signedOff = { before: a.signedOff || null, after: b.signedOff || null };
    }
    /* The markers move with the thing they describe, or an undone edit leaves
       a green chip behind claiming a change that is no longer there.

       A LIST, carrying the path as a field. The first version used the path
       as the key — and a path is "info/stadium" or "people/p3k9/roles/0/title",
       which RTDB refuses outright: a key may not contain a slash. It threw
       synchronously inside logJournal, before the record was written, having
       already left the green marker behind. That is the whole of the
       club-card bug: a marker for a change that never saved, no journal entry
       to undo it from, and nothing on screen to say why. */
    ['edits', 'changes'].forEach(function (kind) {
      var X = byPath(a[kind]), Y = byPath(b[kind]), d = [];
      keysOf(X, Y).forEach(function (path) {
        if (same(X[path], Y[path])) { return; }
        d.push({ path: path, before: X[path] || null, after: Y[path] || null });
      });
      if (d.length) { out[kind] = d; }
    });
    return out;
  }

  /* Applies the `before` side, and only where this act actually changed
     something. Everything the act did not name is left alone. */
  function applyPatch(club, patch) {
    var rec = ALL[club] || (ALL[club] = {});
    var list = NLDirectory.arr(rec.people).slice();
    Object.keys(patch.people || {}).forEach(function (id) {
      var d = patch.people[id], i = -1;
      for (var k = 0; k < list.length; k++) {
        if (list[k] && list[k].id === id) { i = k; break; }
      }
      if (d.before == null) { if (i > -1) { list.splice(i, 1); } return; }
      if (i > -1) { list[i] = clone(d.before); return; }
      var at = typeof d.at === 'number' ? Math.min(d.at, list.length) : list.length;
      list.splice(at, 0, clone(d.before));
    });
    rec.people = list;

    if (patch.info) {
      rec.info = rec.info || {};
      Object.keys(patch.info).forEach(function (k) {
        var v = patch.info[k].before;
        if (v == null) { delete rec.info[k]; } else { rec.info[k] = clone(v); }
      });
    }
    if (patch.leads) {
      rec.leads = rec.leads || {};
      Object.keys(patch.leads).forEach(function (k) {
        var v = patch.leads[k].before;
        if (v == null) { delete rec.leads[k]; } else { rec.leads[k] = clone(v); }
      });
    }
    if (patch.inboxes) {
      rec.inboxes = rec.inboxes || {};
      Object.keys(patch.inboxes).forEach(function (k) {
        var v = patch.inboxes[k].before;
        if (v == null) { delete rec.inboxes[k]; } else { rec.inboxes[k] = clone(v); }
      });
    }
    if (patch.signedOff) { rec.signedOff = clone(patch.signedOff.before); }

    var prov = PROV[club] || (PROV[club] = {});
    var db = firebase.database();
    ['edits', 'changes'].forEach(function (kind) {
      if (!patch[kind]) { return; }
      var cur = NLDirectory.arr(prov[kind]).slice();
      NLDirectory.arr(patch[kind]).forEach(function (d) {
        if (!d || !d.path) { return; }
        cur = cur.filter(function (e) { return e.path !== d.path; });
        if (d.before) { cur.push(clone(d.before)); }
      });
      prov[kind] = cur;
      db.ref(ROOT + '/provenance/' + club + '/' + kind).set(cur);
    });
  }

  /* A short, human list of what this act touched, for the confirm and for
     spotting the one case undo cannot isolate: two acts on one person. */
  function touchedBy(club, patch) {
    var names = [];
    Object.keys(patch.inboxes || {}).forEach(function (k) {
      var b = (patch.inboxes[k] || {});
      var d = (b.after && b.after.dept) || (b.before && b.before.dept) || k;
      names.push('the ' + d + ' mailbox');
    });
    Object.keys(patch.leads || {}).forEach(function (k) {
      names.push((LIST_LABEL[k] || k) + ' list');
    });
    Object.keys(patch.people || {}).forEach(function (id) {
      var d = patch.people[id];
      var p = d.before || d.after;
      names.push(NLDirectory.fullName(p) || 'someone');
    });
    return { ids: keysOf(patch.people), names: names,
             info: !!patch.info, signedOff: !!patch.signedOff };
  }

  /* undoOf turns this into the second half of a pair rather than a new act of
     its own, which is what keeps an undo out of the working list while
     leaving it in the record. */
  function logJournal(club, what, undoOf) {
    var db = firebase.database();
    var now = snapshot(club);
    var patch = BEFORE[club] ? diffClub(BEFORE[club], now) : null;
    var ref = db.ref(ROOT + '/provenance/' + club + '/journal').push();
    var e = { id: ref.key, at: Date.now(), by: session.name || 'editor', what: what };
    if (undoOf) { e.undoOf = undoOf; }
    var prov = PROV[club] || (PROV[club] = {});
    prov.journal = prov.journal || {};
    prov.journal[ref.key] = e;
    /* Only for acts that could be undone. An undo of an undo is done by
       pressing Undo on the original again, not by stacking them. And an act
       that changed nothing measurable gets a journal line but no button —
       there would be nothing for it to put back.

       The body is written FIRST and the flag set only once it has landed. The
       first cut set undoable, fired the body write, and never looked at it
       again: when that write failed the entry sat there offering an Undo
       button with nothing behind it, and pressing it said "there is nothing
       held for that change" — which is true, and useless. An entry now
       promises an undo only if there is one.

       Both writes are caught. An unhandled rejection here reached the global
       handler as "Script error." and named nothing, which is the least
       useful message a tool can produce. */
    var body = (!undoOf && patch && keysOf(patch).length)
      ? db.ref(ROOT + '/undo/' + club + '/' + ref.key).set(patch)
          .then(function () { return true; })
          .catch(function (err) {
            NL.toast('That change was recorded but cannot be undone later: ' +
              ((err && err.message) || err), 'error');
            return false;
          })
      : Promise.resolve(false);

    body.then(function (ok) {
      if (ok) {
        e.undoable = true;
        e.touched = touchedBy(club, patch);
      }
      return ref.set(e);
    }).catch(function (err) {
      NL.toast('Could not record that change in the journal: ' +
        ((err && err.message) || err), 'error');
    });
    BEFORE[club] = now;
    return e;
  }

  /* Every club's journal, newest first, with each entry told whether it has
     since been undone. Flattened across clubs on purpose: the mistake you
     want back is rarely on the club you are looking at — you noticed it two
     clubs later, which is why you are opening this at all. */
  function journalAll() {
    var out = [];
    Object.keys(PROV).forEach(function (club) {
      var j = (PROV[club] || {}).journal;
      if (!j || typeof j !== 'object') { return; }
      Object.keys(j).forEach(function (k) {
        var e = j[k];
        if (e && e.at) { out.push({ club: club, e: e }); }
      });
    });
    var undone = {};
    out.forEach(function (x) { if (x.e.undoOf) { undone[x.e.undoOf] = x.e; } });
    out.forEach(function (x) { x.undone = undone[x.e.id] || null; });
    return out.sort(function (a, b) { return (b.e.at || 0) - (a.e.at || 0); });
  }

  function myName() { return session.name || 'editor'; }

  /* The log opens on everyone's changes, newest first (v3.0, Richard:
     "it should actually be all changes, and we should be able to filter").
     Two canon filter buttons: Club, which starts on the club you are
     looking at because "what has changed here" is nearly always the
     question, and Who, for your own or anyone else's. Undo stays on every
     change that can be put back. */
  function showChanges() {
    var body = document.createElement('div');
    body.className = 'ed-jrnl';
    var bar = document.createElement('div');
    bar.className = 'ed-jrnl__filters';
    var clubMount = document.createElement('div');
    var whoMount = document.createElement('div');
    bar.appendChild(clubMount);
    bar.appendChild(whoMount);
    var list = document.createElement('div');
    body.appendChild(bar);
    body.appendChild(list);

    var all = journalAll();
    var count = function (key) {
      var n = {};
      all.forEach(function (x) { var k = key(x); n[k] = (n[k] || 0) + 1; });
      return n;
    };
    var byClub = count(function (x) { return x.club; });
    var byWho = count(function (x) { return x.e.by || 'editor'; });
    var clubSel = current && byClub[current] ? [current] : [];
    var whoSel = [];
    NL.filterButton(clubMount, {
      label: 'Club', allLabel: 'All clubs', value: clubSel,
      options: Object.keys(byClub).sort().map(function (c) {
        return { value: c, label: c, count: byClub[c] };
      }),
      onChange: function (v) { clubSel = v; render(); }
    });
    NL.filterButton(whoMount, {
      label: 'Who', allLabel: 'Everyone', value: whoSel,
      options: Object.keys(byWho).sort().map(function (w) {
        return { value: w, label: w === myName() ? w + ' (you)' : w, count: byWho[w] };
      }),
      onChange: function (v) { whoSel = v; render(); }
    });

    var render = function () {
      all = journalAll();
      var shown = all.filter(function (x) {
        return (!clubSel.length || clubSel.indexOf(x.club) > -1) &&
               (!whoSel.length || whoSel.indexOf(x.e.by || 'editor') > -1);
      });
      if (!shown.length) {
        list.innerHTML = '<p class="cd-empty">' + (all.length
          ? 'Nothing changed for that choice.' : 'Nothing has been changed yet.') + '</p>';
        return;
      }
      /* Nothing is deleted, so the list can run long. Capped for drawing
         only, and it says so rather than trailing off; the download has
         everything. */
      var SHOW = 100, hidden = Math.max(0, shown.length - SHOW);
      list.innerHTML = '<ul class="ed-jrnl__list">' + shown.slice(0, SHOW).map(function (x) {
        var e = x.e;
        var when = NL.formatDateTime ? NL.formatDateTime(e.at) : NL.formatDate(e.at);
        return '<li class="ed-jrnl__row' + (x.undone ? ' is-undone' : '') +
            (e.undoOf ? ' is-undo' : '') + '">' +
          '<img class="ed-jrnl__crest" alt="" data-crest="' + esc(x.club) + '">' +
          '<div class="ed-jrnl__main">' +
            '<span class="ed-jrnl__what">' + esc(e.what || 'Changed') + '</span>' +
            '<span class="ed-jrnl__meta">' + esc(x.club) + ' \u00b7 ' + esc(when) +
              ' \u00b7 ' + esc(e.by || 'editor') +
              (x.undone ? ' \u00b7 undone by ' + esc(x.undone.by || 'editor') : '') +
            '</span>' +
          '</div>' +
          (!x.undone && !e.undoOf && e.undoable
            ? '<button class="btn btn--sm btn--ghost" type="button" data-club="' +
              esc(x.club) + '" data-id="' + esc(e.id) + '">Undo</button>'
            : '<span class="ed-jrnl__no">' +
              (x.undone ? 'Undone' : e.undoOf ? 'Reversal' : 'Nothing to put back') +
              '</span>') +
          '</li>';
      }).join('') + '</ul>' + (hidden
        ? '<p class="form-hint">' + hidden + ' older ' +
          (hidden === 1 ? 'change is' : 'changes are') + ' not shown here. ' +
          'Download has them all.</p>'
        : '');
      list.querySelectorAll('img[data-crest]').forEach(function (img) {
        var n = img.dataset.crest;
        img.alt = n + ' crest';
        NL.clubs.wireCrestImg(img, n, true);
        img.src = NL.clubs.crestUrl(n, 'thumb');
      });
      list.querySelectorAll('button[data-id]').forEach(function (b) {
        b.addEventListener('click', function () {
          undoJournal(b.dataset.club, b.dataset.id, ctrl);
        });
      });
    };

    render();
    var ctrl = NL.modal({
      title: 'Change log',
      size: 'lg',
      body: body,
      buttons: [
        { label: 'Download (CSV)', className: 'btn--ghost',
          onClick: function () { downloadLog(); } },
        { label: 'Close', className: 'btn--ghost',
          onClick: function (c) { c.close(); } }
      ]
    });
    return ctrl;
  }

  /* The whole log as a spreadsheet (v2.3, Richard: "can i get a change log
     export first so i can see this"). Two kinds of row, newest first:

       · Change – one per act in the journal: what was done, by whom, and
         whether it has since been undone.
       · Field  – one per field changed by hand, with what it was and what
         it is now (the edit log logEdit keeps; `from` is the value before
         any hand edit, so a field edited three times is one row).

     Every club, every editor; nothing here is filtered. Staff-only data,
     downloaded by staff, the same values the editor already shows. */
  function downloadLog() {
    var when = function (at) { return at ? NL.formatDateTime(at) : ''; };
    var rows = [];
    journalAll().forEach(function (x) {
      var e = x.e;
      rows.push({ at: e.at || 0, cells: [when(e.at), x.club, 'Change', e.what || '', '', '',
        e.by || '', x.undone ? 'Yes, by ' + (x.undone.by || 'editor') : (e.undoOf ? 'Reversal' : '')] });
    });
    Object.keys(PROV).forEach(function (club) {
      var people = {};
      NLDirectory.arr((ALL[club] || {}).people).forEach(function (p) {
        if (p.id) { people[p.id] = NLDirectory.fullName(p) || p.id; }
      });
      editList(club).forEach(function (e) {
        var m = /^([^/]+)\/(.*)$/.exec(e.path || '');
        var field = e.path || '';
        if (m && /^(info|leads|inboxes)$/.test(m[1])) {
          field = ({ info: 'Club details', leads: 'Mailing list', inboxes: 'Shared mailbox' })[m[1]] +
            ' \u2013 ' + m[2];
        } else if (m) {
          field = (people[m[1]] || 'Someone no longer listed') + ' \u2013 ' +
            m[2].replace(/^roles\/\d+\/title$/, 'job title');
        }
        rows.push({ at: e.at || 0, cells: [when(e.at), club, 'Field', field, e.from || '', e.to || '',
          e.by || '', ''] });
      });
    });
    rows.sort(function (a, b) { return b.at - a.at; });
    var csv = NL.csv([['When', 'Club', 'Kind', 'What', 'Was', 'Now', 'By', 'Undone']]
      .concat(rows.map(function (r) { return r.cells; })), { bom: true });
    NL.download('club-directory-change-log-' + new Date().toISOString().slice(0, 10) + '.csv',
      csv, 'text/csv;charset=utf-8');
    NL.toast(rows.length + (rows.length === 1 ? ' row' : ' rows') + ' downloaded', 'success');
  }

  /* Somebody else may have touched the same person since. That is the one
     thing undo cannot isolate, so it is named before you press rather than
     discovered afterwards. */
  function laterOn(club, entry) {
    var mine = (entry.touched || {}).ids || [];
    if (!mine.length) { return []; }
    var j = (PROV[club] || {}).journal || {};
    var undone = {};
    Object.keys(j).forEach(function (k) { if (j[k].undoOf) { undone[j[k].undoOf] = 1; } });
    return Object.keys(j).map(function (k) { return j[k]; })
      .filter(function (e) {
        if (e.id === entry.id || e.undoOf || undone[e.id]) { return false; }
        if ((e.at || 0) <= (entry.at || 0)) { return false; }
        return ((e.touched || {}).ids || []).some(function (id) {
          return mine.indexOf(id) > -1;
        });
      }).sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
  }

  /* The patch is fetched now rather than held in memory: almost none of them
     are ever wanted, and the editor already loads all 72 clubs' provenance at
     boot without them. */
  function undoJournal(club, id, ctrl) {
    var j = ((PROV[club] || {}).journal || {})[id];
    if (!j) { return; }
    var who = (j.touched || {}).names || [];
    var scope = who.length ? (who.length === 1 ? who[0] : who.length + ' people')
      : ((j.touched || {}).signedOff ? 'the sign-off' : 'the club\u2019s own details');
    var clash = laterOn(club, j);
    var detail = '\u201c' + (j.what || 'Change') + '\u201d. This puts ' + scope +
      ' back as they were before it, at ' + club + '. Nothing else on the club is ' +
      'touched \u2014 anything you have changed since, anywhere else, stays as it is.';
    if (clash.length) {
      detail += '\n\nBut ' + (who.length === 1 ? who[0] : 'somebody here') +
        ' has been changed again since, by ' + (clash[0].by || 'an editor') +
        ' \u2014 \u201c' + (clash[0].what || 'a change') + '\u201d. That will go back too.';
    }
    NL.confirm('Undo this change to ' + club + '?', {
      title: 'Undo',
      variant: clash.length ? 'danger' : undefined,
      detail: detail,
      confirmText: 'Undo it'
    }).then(function (ok) {
      if (!ok) { return; }
      return firebase.database().ref(ROOT + '/undo/' + club + '/' + id).once('value')
        .then(function (snap) {
          var patch = snap.val();
          if (!patch) {
            NL.toast('There is nothing held for that change, so it cannot be put ' +
              'back. The record of it stands.', 'error');
            return;
          }
          if (ctrl && ctrl.close) { ctrl.close(); }
          applyPatch(club, patch);
          return saveStructure(club, 'Undid: ' + (j.what || 'a change'), id);
        });
    }).catch(function (err) {
      NL.toast('Could not undo: ' + ((err && err.message) || err), 'error');
    });
  }

  /* ------------------------------------------------- structural changes
     Correcting a field and changing the shape of a club are different acts.
     A field edit rewrites one value in place; adding, removing or moving
     somebody changes which rows exist and which department they sit under, so
     the club has to be redrawn afterwards.

     Everything here is blocked on a signed-off club, and the destructive parts
     still confirm — a removal is the one act where the thing you are about to
     lose is on screen in front of you, and a confirm is cheaper than finding
     the undo afterwards. */
  /* A club that held a stadium, an address and six social accounts does not
     legitimately end up holding none of them. Nothing in this tool is
     supposed to be able to do that, and yet Billericay Town's card emptied
     itself. Until the cause is found this refuses the write and says so,
     which turns a silent loss into a visible one — and names the action that
     tried it, which is the thing that was missing while working out what had
     happened. It restores from the pre-change snapshot rather than just
     declining, so the record in memory matches the record on the server. */
  function guardInfo(club, what, expected) {
    /* A restore or a rebuild is entitled to replace the details wholesale,
       including with fewer than there were — that is the point of it, and the
       confirm has already said so. Blocking those was the guard firing on the
       one action brought in to recover from the thing it guards against. */
    if (expected) { return true; }
    var was = (BEFORE[club] || {}).info || {};
    var now = (ALL[club] || {}).info || {};
    /* Counting keys is not enough. Thirty keys all holding an empty string
       renders exactly the same blank card as thirty keys that have gone, and
       the first version of this guard waved that straight through. What
       matters is how much is actually held. noSponsor is excluded because it
       is a derived boolean and is always present. */
    var held = function (o) {
      return Object.keys(o).filter(function (k) {
        return k !== 'noSponsor' && String(o[k] == null ? '' : o[k]).trim() !== '';
      }).length;
    };
    if (held(was) < 5 || held(now) > 0) { return true; }
    ALL[club].info = clone(was);
    /* Redraw, always. A block that leaves the page showing what it tried to
       do is worse than no block: the next edit is made against a record that
       is not the one on screen. */
    draw(club);
    NL.alert('That would have wiped every club detail for ' + club + ' — ' +
      held(was) + ' fields down to none. It has been stopped and ' +
      'nothing was saved.\n\nThe action was: "' + what + '". Please tell Richard ' +
      'exactly what you had just done, because this should not be possible.',
      { title: 'Stopped — that would have emptied the club details' });
    NL.writeAudit('directory_guard', club + ' — blocked an info wipe during: ' + what);
    return false;
  }

  function saveStructure(club, what, undoOf, expected) {
    if (!guardInfo(club, what, expected)) { return Promise.resolve(); }
    NL.writeAudit('directory_structure',
      club + ' — ' + what + ' (' + (session.name || 'editor') + ')');
    logJournal(club, what, undoOf);
    return saveClub(club)
      .then(function () { clearFail(); NL.toast(what, 'success'); draw(club); })
      .catch(function (err) {
        /* A save that did not happen is not a three-second toast. It is the
           single most important thing on the screen: the page is now showing
           something the database does not hold, and every further edit is
           being made against a record that is not the one being saved. It
           stays until it is dismissed, and it names the fault, because "it
           didn't save" is not a report anybody can act on. */
        showFail(club, what, (err && err.message) || String(err));
      });
  }

  function clearFail() {
    var b = document.getElementById('edFail');
    if (b) { b.remove(); }
  }

  function showFail(club, what, msg) {
    clearFail();
    var box = document.createElement('div');
    box.id = 'edFail';
    box.className = 'ed-fail';
    box.innerHTML =
      '<b>That did not save.</b>' +
      '<p>' + esc(club) + ' \u2014 ' + esc(what) + '</p>' +
      '<p class="ed-fail__why">' + esc(msg) + '</p>' +
      '<p>What you see on screen is not what the database holds. Reload the ' +
      'page before doing anything else, and send this message to Richard.</p>';
    var btn = document.createElement('button');
    btn.className = 'btn btn--sm btn--ghost';
    btn.type = 'button';
    btn.textContent = 'Reload the page';
    btn.addEventListener('click', function () { location.reload(); });
    box.appendChild(btn);
    var top = HOST.failHost();
    top.insertBefore(box, top.firstChild);
    box.scrollIntoView({ block: 'center' });
  }

  /* Ids look like the ones the submission form mints — 'p' plus base-36 — so
     a person added here is indistinguishable from one that came through the
     form, which is what provenance and the sign-off links both key on. */
  function newId() {
    return 'p' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 5);
  }

  function deptSelect(value, cls, forOrg) {
    var s = document.createElement('select');
    s.className = cls || 'ed-dept';
    (forOrg ? NLDirectory.ORG_ORDER : NLDirectory.ORDER).forEach(function (name) {
      var o = document.createElement('option');
      o.value = name; o.textContent = name;
      if (name === value) { o.selected = true; }
      s.appendChild(o);
    });
    return s;
  }

  /* ------------------------------------------------------- update details
     One button per row, one screen behind it, everything about the person on
     it. It replaces four separate ways in — typing into the row itself, a
     contact-details modal, a publish toggle and a department dropdown — which
     between them had drawn an arbitrary line: an address counted as "their
     details" and their name did not.

     Typing into the row is gone with them. Two ways to change the same field
     is worse than one even when both work, and this is the one that can show
     a job title and the address that goes with it at the same time. */
  /* "+ Email", "+ Phone", "+ Role": the small add buttons under a list. */
  function smallAdd(what) {
    var b = document.createElement('button');
    b.className = 'btn btn--sm btn--ghost ed-addbtn';
    b.type = 'button';
    b.appendChild(NL.icon('add', 'sm'));
    b.appendChild(document.createTextNode(what));
    return b;
  }

  function contactRow(kind, value, sections, roles, ext, hide) {
    var row = document.createElement('div');
    row.className = 'ed-crow';
    /* Every phone record carries an ext field. All 563 are empty today and
       there is no box to type one into, but rebuilding the list from the form
       would drop it the moment somebody set one. */
    if (ext) { row.dataset.ext = ext; }
    var input = document.createElement('input');
    input.className = 'ed-cval';
    input.value = value || '';
    input.setAttribute('autocomplete', 'off');
    input.placeholder = kind === 'email' ? 'e.g. name@example.co.uk' : 'e.g. 01234 567890';
    if (kind === 'email') { input.type = 'email'; }

    /* WHICH of their jobs this address is for. Only worth asking when there
       is a choice to make — 795 of the 1,070 hold one post and see nothing.

       A canon filter button reading "Show under: All their roles". The
       dropdown that used to be here (to v1.33) defaulted to an option
       reading "All roles", which is a sentence rather than a state, and in
       914 addresses it was never used; the button names itself and says what
       is chosen, and turns navy once anything is.

       Nothing ticked is every role. Ticking one from there means "just this
       one", which is the gesture the request actually arrives as: Barrow
       wanted their man's address under Safeguarding and not under his two
       board posts, and that is one tick. Unticking the last goes back to
       every role, so there is no way to say "nowhere" – that is what the
       Not published tick is for. */
    var scope = null, scopeState = (sections || []).slice();
    if (roles.length > 1) {
      scope = document.createElement('div');
      scope.className = 'ed-cscope';
      NL.filterButton(scope, {
        label: 'Show under',
        allLabel: 'All their roles',
        options: roles.map(function (sec) { return { value: sec, label: sec }; }),
        value: scopeState,
        onChange: function (v) { scopeState = v; }
      });
    }

    /* One tick per address and per number, because that is the grain the
       decision is actually made at: a club officer will give you the club
       address for the directory and keep their mobile out of it, and until
       now saying so meant keeping BOTH out. Worded as the thing being
       withheld rather than as "publish", so the tick and the consequence
       point the same way — a ticked box means something is being kept back. */
    /* The padlock (v3.0). Private means League staff and the person's own
       club can see it, and nobody else: it is never written to the copy
       other clubs and the public read. The row tints while it is on, so a
       private detail looks private at the point you are editing it. */
    var hideLab = document.createElement('label');
    hideLab.className = 'ed-lock';
    var hideBox = document.createElement('input');
    hideBox.type = 'checkbox';
    hideBox.className = 'ed-chide__box';
    hideBox.checked = !!hide;
    hideLab.appendChild(hideBox);
    hideLab.appendChild(NL.icon('lock', 'sm'));
    hideLab.appendChild(document.createTextNode('Private'));
    hideLab.title = 'Only League staff and their own club see this ' +
      (kind === 'email' ? 'address' : 'number') + '.';
    var paint = function () { row.classList.toggle('is-private', hideBox.checked); };
    hideBox.addEventListener('change', paint);

    var del = document.createElement('button');
    del.className = 'btn btn--icon btn--ghost ed-del';
    del.type = 'button';
    del.title = 'Remove this ' + kind;
    del.setAttribute('aria-label', 'Remove this ' + kind);
    del.appendChild(NL.icon('delete'));
    del.addEventListener('click', function () { row.remove(); });

    var top = document.createElement('div');
    top.className = 'ed-crow__top';
    var kindIc = NL.icon(kind === 'email' ? 'email' : 'phone', 'sm');
    kindIc.classList.add('ed-crow__ic');
    top.appendChild(kindIc);
    top.appendChild(input);
    top.appendChild(hideLab);
    top.appendChild(del);
    row.appendChild(top);
    if (scope) { row.appendChild(scope); }
    row.__scope = function () { return scopeState.slice(); };
    paint();
    return row;
  }

  function updateDetails(club, person, ridx) {
    var rec = ALL[club];
    var roles = NLDirectory.rolesOf(person);
    var role = roles[ridx] || {};
    var here = role.section || '';
    var sections = roles.map(function (r) { return r.section; })
      .filter(function (sec, i, a) { return a.indexOf(sec) === i; });
    var others = roles.filter(function (r, i) { return i !== ridx; })
      .map(function (r) { return r.section; });
    var name0 = NLDirectory.fullName(person);

    var wrap = document.createElement('div');
    var group = function (title, hint) {
      var h = document.createElement('h4');
      h.className = 'ed-fgroup';
      h.textContent = title;
      wrap.appendChild(h);
      if (hint) {
        var p2 = document.createElement('p');
        p2.className = 'form-hint';
        p2.innerHTML = hint;
        wrap.appendChild(p2);
      }
    };
    var field = formField;
    var textbox = function (value, placeholder) {
      var i = document.createElement('input');
      i.value = value || '';
      i.setAttribute('autocomplete', 'off');
      if (placeholder) { i.placeholder = placeholder; }
      return i;
    };

    /* ---- who they are ---- */
    /* Escape each name, THEN join with the markup. Escaping the joined string
       escapes the separator too, so the dialog read "Directors&lt;/b&gt;,
       &lt;b&gt;Safeguarding & welfare" to everyone who opened somebody with
       more than one post. Same trap the department list carries a note about. */
    var nameIn = textbox(name0, 'Jane Smith');
    nameIn.className = 'ed-name';
    nameIn.setAttribute('aria-label', 'Name');
    wrap.appendChild(field('Name', nameIn));

    /* All of it private, in one switch. One address or one number is the
       padlock on its own line below. */
    var pubLab = document.createElement('label');
    pubLab.className = 'ed-lock ed-lock--all';
    var pubBox = document.createElement('input');
    pubBox.type = 'checkbox';
    pubBox.checked = !!person.hideContact;
    pubLab.appendChild(pubBox);
    pubLab.appendChild(NL.icon('lock', 'sm'));
    pubLab.appendChild(document.createTextNode('All their contact details private'));
    wrap.appendChild(pubLab);

    /* ---- how to reach them ---- */
    group('Contact', sections.length > 1
      ? 'Shared by all their roles unless you choose where one shows.' : '');
    var emailBox = document.createElement('div');
    emailBox.className = 'ed-clist';
    wrap.appendChild(emailBox);
    NLDirectory.arr(person.emails).forEach(function (e) {
      var addr = NLDirectory.addrOf(e);
      if (!addr) { return; }
      emailBox.appendChild(contactRow('email', addr,
        NLDirectory.sectionsOf(e), sections, '', NLDirectory.ownHide(e)));
    });
    var addEmail = smallAdd('Email');
    addEmail.addEventListener('click', function () {
      emailBox.appendChild(contactRow('email', '', [], sections));
    });

    var phoneBox = document.createElement('div');
    phoneBox.className = 'ed-clist';
    wrap.appendChild(phoneBox);
    NLDirectory.arr(person.phones).forEach(function (x) {
      if (!x || !(x.number || '').trim()) { return; }
      phoneBox.appendChild(contactRow('phone', x.number,
        NLDirectory.sectionsOf(x), sections, x.ext || '', NLDirectory.ownHide(x)));
    });
    var addPhone = smallAdd('Phone');
    addPhone.addEventListener('click', function () {
      phoneBox.appendChild(contactRow('phone', '', [], sections));
    });
    var adds = document.createElement('div');
    adds.className = 'ed-adds';
    adds.appendChild(addEmail);
    adds.appendChild(addPhone);
    wrap.appendChild(adds);

    /* ---- every job they do ---- */
    /* All of them, not just the row you came in from. The modal claims to be
       everything about this person, and showing one role while merely naming
       the others made a liar of it — an editor fixing two job titles had to
       close it, find the other row, and open it again. */
    group(roles.length > 1 ? 'Roles' : 'Role', '');
    var roleBox = document.createElement('div');
    roleBox.className = 'ed-roles';
    wrap.appendChild(roleBox);

    var roleRows = [];
    roles.forEach(function (r, i) {
      /* One line per job: title, department, remove. The one you opened
         is marked, because on somebody with four roles "which one was I
         looking at" is a real question. */
      var card = document.createElement('div');
      card.className = 'ed-role' + (i === ridx ? ' is-here' : '');
      var t = textbox(r.title || '', 'Job title');
      t.className = 'ed-cval';
      t.setAttribute('aria-label', 'Job title');
      var d = deptSelect(r.section, 'ed-dept', NLDirectory.isOrg(ALL[club]));
      d.setAttribute('aria-label', 'Department');
      card.appendChild(t);
      card.appendChild(d);

      var drop = document.createElement('button');
      drop.className = 'btn btn--icon btn--ghost ed-del';
      drop.type = 'button';
      drop.title = 'Remove this role';
      drop.setAttribute('aria-label', 'Remove this role');
      drop.appendChild(NL.icon('delete'));
      drop.addEventListener('click', function () {
        /* Their only role is the whole person, so that question gets asked
           rather than answered by a button labelled something smaller. */
        if (roleRows.filter(function (x) { return !x.gone; }).length < 2) {
          ctrl.close();
          removeRole(club, person, i);
          return;
        }
        entry.gone = true;
        card.remove();
      });
      card.appendChild(drop);
      roleBox.appendChild(card);

      var entry = { i: i, title: t, dept: d, gone: false };
      roleRows.push(entry);
    });

    var extra = document.createElement('div');
    extra.className = 'ed-morebtns';
    var addRole = smallAdd('Role');
    var removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn--sm btn--ghost ed-del ed-removeperson';
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove this person\u2026';
    extra.appendChild(addRole);
    extra.appendChild(removeBtn);
    wrap.appendChild(extra);

    var read = function (box) {
      return [].slice.call(box.querySelectorAll('.ed-crow')).map(function (r) {
        var h = r.querySelector('.ed-chide__box');
        return { value: r.querySelector('.ed-cval').value.trim(),
                 sections: r.__scope ? r.__scope() : [],
                 hide: !!(h && h.checked),
                 ext: r.dataset.ext || '' };
      }).filter(function (x) { return x.value; });
    };

    var ctrl = NL.modal({
      title: name0 || 'Update details',
      body: wrap,
      buttons: [
        { label: 'Cancel', className: 'btn--ghost', onClick: function (c) { c.close(); } },
        { label: 'Save', className: 'btn--primary', onClick: function (c) {
          commitDetails(club, person, ridx, {
            name: nameIn.value.trim(),
            roles: roleRows.filter(function (x) { return !x.gone; }).map(function (x) {
              return { i: x.i, title: x.title.value.trim(), section: x.dept.value };
            }),
            hide: !!pubBox.checked,
            emails: read(emailBox),
            phones: read(phoneBox)
          }, c);
        } }
      ]
    });

    addRole.addEventListener('click', function () { ctrl.close(); addRoleTo(club, person); });
    removeBtn.addEventListener('click', function () { ctrl.close(); removeWholePerson(club, person); });
    setTimeout(function () { nameIn.focus(); }, 30);
  }

  /* Everything the form changed, in one write. The rename question is asked
     last and only when it is genuinely ambiguous, so an editor correcting a
     job title is never made to answer a question about identity. */
  /* Publishing somebody the club asked us to keep off is the one thing in this
     form that reaches outside the League. It puts a real person's work email
     and mobile in front of everyone who holds the reader code, and there is no
     taking that back — so it asks, and it asks in the direction that matters.

     Only that direction. Ticking the box hides somebody, which exposes nothing
     and needs no ceremony; a confirm on the safe half would just be noise that
     teaches people to click through the dangerous one.

     This existed before the form absorbed the publish toggle and was lost in
     the process — a regression, not an oversight of the original design. */
  /* One line per address or number, with its publication state on it. This is
     what the journal stores and what the diff compares, so the tick is a
     tracked, reversible change like any other edit to the same field. */
  function contactLine(list, valueOf) {
    return NLDirectory.arr(list).map(function (x) {
      var v = String(valueOf(x) || '').trim();
      if (!v) { return ''; }
      var sec = NLDirectory.sectionsOf(x);
      return v + (sec.length ? ' (' + sec.join(' + ') + ' only)' : '') +
        (NLDirectory.ownHide(x) ? ' (not published)' : '');
    }).filter(Boolean).join(', ');
  }

  /* Asked in one direction only. Holding something back is the club's own
     request and needs no ceremony; putting something out that was held back
     is the move that cannot be taken back, so it gets named and confirmed.
     `opening` is the list of details about to become public \u2014 which with a
     per-address tick can be one line rather than the whole person. */
  function confirmPublish(person, opening, sections) {
    if (!opening.length) { return Promise.resolve(true); }
    var name = NLDirectory.fullName(person) || 'this person';
    var where = sections.length > 1
      ? ' They appear under ' + sections.join(', ') + ', and this covers all of them.'
      : '';
    var what = opening.length === 1
      ? '\u201c' + opening[0] + '\u201d'
      : opening.length + ' of their details:\n\n  ' + opening.join('\n  ');
    return NL.confirm(
      'Make ' + what + ' for ' + name + ' visible to everyone?' + where +
      '\n\nThis was private. Saving shows it on every club\u2019s page and the ' +
      'public directory straight away. Only do it if the club has said so.',
      { title: 'No longer private', variant: 'danger', confirmText: 'Yes, show it' }
    );
  }

  function commitDetails(club, person, ridx, next, ctrl) {
    var roles = NLDirectory.rolesOf(person);
    var role = roles[ridx] || {};
    var was = {
      name: NLDirectory.fullName(person),
      hide: !!person.hideContact,
      emails: contactLine(NLDirectory.arr(person.emails), NLDirectory.addrOf),
      phones: contactLine(NLDirectory.arr(person.phones), function (x) { return x && x.number; })
    };
    var pid = 'people/' + (person.id || '');

    var applyRest = function () {
      /* Rebuilt from the form rather than patched in place: a role can have
         been retitled, moved, or taken off, and reading the survivors in order
         is the only version of that which cannot leave a stale one behind.
         Anything else on a role object is carried over untouched. */
      var rolesChanged = next.roles.length !== roles.length;
      person.roles = next.roles.map(function (r) {
        var orig = roles[r.i] || {};
        if (r.title !== (orig.title || '')) {
          logEdit(club, pid + '/roles/' + r.i + '/title', orig.title || '', r.title);
          rolesChanged = true;
        }
        if (r.section !== orig.section) { rolesChanged = true; }
        var out = {};
        for (var k in orig) { if (Object.prototype.hasOwnProperty.call(orig, k)) { out[k] = orig[k]; } }
        out.title = r.title;
        out.section = r.section;
        return out;
      });
      if (next.hide !== was.hide) { person.hideContact = next.hide; }
      /* A plain string when it applies everywhere, an object only when it does
         not — so a record that gains nothing keeps the shape it had. */
      /* A plain string when it applies everywhere and is published, an
         object only when it does not — so a record that gains nothing keeps
         the shape it had, and 914 addresses are left exactly as they are. */
      person.emails = next.emails.map(function (x) {
        if (!x.sections.length && !x.hide) { return x.value; }
        var out = { address: x.value };
        if (x.sections.length) { out.sections = x.sections; }
        if (x.hide) { out.hide = true; }
        return out;
      });
      person.phones = next.phones.map(function (x) {
        var out = { number: x.value, ext: x.ext || '' };
        if (x.sections.length) { out.sections = x.sections; }
        if (x.hide) { out.hide = true; }
        return out;
      });
      /* The logged line carries the publication state, so "took Jane's mobile
         out of the directory" is a change the journal can show and the Undo
         button can reverse. Keeping it in the same entry rather than adding a
         path of its own means the green-flag pairing and the per-person undo
         both work on it with nothing new to teach them. */
      var nowEm = contactLine(NLDirectory.arr(person.emails), NLDirectory.addrOf);
      var nowPh = contactLine(NLDirectory.arr(person.phones), function (x) { return x && x.number; });
      if (nowEm !== was.emails) { logEdit(club, pid + '/emails', was.emails, nowEm); }
      if (nowPh !== was.phones) { logEdit(club, pid + '/phones', was.phones, nowPh); }

      var changed = rolesChanged || next.hide !== was.hide ||
        nowEm !== was.emails || nowPh !== was.phones ||
        NLDirectory.fullName(person) !== was.name;
      ctrl.close();
      if (!changed) { return; }
      saveStructure(club, 'Details updated for ' +
        (NLDirectory.fullName(person) || 'a person'));
    };

    /* The gate runs before anything is written, so answering No leaves the
       record exactly as it was and the form still open on the tick. */
    var proceed = function () {
      if (!next.name || next.name === was.name) { applyRest(); return; }
      renameThen();
    };

    /* Everything that was being kept back, by value, before anything is
       written. Computed here rather than inside applyRest because applyRest
       rebuilds person.emails from the form and the old state is gone. */
    var wasHidden = {};
    NLDirectory.arr(person.emails).forEach(function (e) {
      var v = NLDirectory.addrOf(e).trim();
      if (v && (was.hide || NLDirectory.ownHide(e))) { wasHidden[v] = true; }
    });
    NLDirectory.arr(person.phones).forEach(function (x) {
      var v = ((x && x.number) || '').trim();
      if (v && (was.hide || NLDirectory.ownHide(x))) { wasHidden[v] = true; }
    });
    var opening = next.hide ? [] : next.emails.concat(next.phones)
      .filter(function (x) { return !x.hide && wasHidden[x.value]; })
      .map(function (x) { return x.value; });

    if (opening.length) {
      var sections = roles.map(function (r) { return r.section; })
        .filter(function (sec, i, a) { return a.indexOf(sec) === i; });
      confirmPublish(person, opening, sections).then(function (ok) {
        if (!ok) { return; }                          /* stay open, nothing written */
        proceed();
      });
      return;
    }
    proceed();

    /* Renaming somebody who holds more than one role is genuinely ambiguous,
       and getting it wrong is the worst thing this tool can do. See the note
       on resolveRename. Hoisted, so proceed() above can call it. */
    /* Every rename asks now, one role or several (v3.0, Richard). Typing a
       new name over an old one is how a club's new secretary ends up with
       the last one's mobile, so "someone new" is offered every time and
       does it properly: a new entry, in the same job, with none of the old
       person's details. */
    function renameThen() {
      if (roles.length) {
        resolveRename(club, person, ridx, was.name, next.name).then(function (how) {
          if (!how) { return; }                     /* cancelled: change nothing */
          if (how === 'same') {
            setAt(person, 'name', next.name);
            logEdit(club, pid + '/name', was.name, next.name);
            applyRest();
          } else {
            ctrl.close();
            var mine = next.roles.filter(function (r) { return r.i === ridx; })[0];
            replaceInRole(club, person, ridx, next.name, mine);
          }
        });
        return;
      }
      setAt(person, 'name', next.name);
      logEdit(club, pid + '/name', was.name, next.name);
      applyRest();
    }
  }

  /* The whole entry, from the foot of the update form. Removing one role is
     now a button on that role, so this no longer has to ask which was meant —
     pressing this one IS the answer. */
  function removeWholePerson(club, person) {
    var name = NLDirectory.fullName(person) || 'this person';
    var sections = NLDirectory.rolesOf(person).map(function (r) { return r.section; });
    NL.confirm('Remove ' + name + ' from the directory entirely?' +
      (sections.length > 1 ? ' That is all ' + sections.length + ' of their entries — ' +
        sections.join(', ') + '.' : '') +
      '\n\nName, contact details and all. \u201cChange log\u201d at the top of ' +
      'the page will put just this person back, whenever you need it.',
      { title: 'Remove person', variant: 'danger', confirmText: 'Remove person' }
    ).then(function (ok) {
      if (!ok) { return null; }
      return coverLists(club, person);
    }).then(function (cover) {
      if (!cover) { return; }
      ALL[club].people = NLDirectory.arr(ALL[club].people)
        .filter(function (p) { return p !== person; });
      var note = applyCover(club, person, cover);
      saveStructure(club, name + ' removed from the directory' + note);
    });
  }

  /* Somebody already in the directory who also does something else. Distinct
     from "Add someone" at the foot, which mints a new person — this hangs a
     second role on the person whose row you are on. */
  function addRoleTo(club, person) {
    var name = NLDirectory.fullName(person) || 'this person';
    var held = NLDirectory.rolesOf(person).map(function (r) { return r.section; });
    var form = document.createElement('div');
    form.className = 'form-grid';
    form.innerHTML =
      '<div class="form-group"><label>Department</label><span id="arDept"></span></div>' +
      '<div class="form-group"><label>Job title</label>' +
        '<input id="arTitle" autocomplete="off" placeholder="e.g. Programme Editor"></div>' +
      '<div class="form-group span2"><p class="form-hint">' +
        esc(name) + ' is already listed under ' + esc(held.join(', ')) +
        '. Their contact details carry across — this is one person, not a copy.</p></div>';
    var isOrg = NLDirectory.isOrg(ALL[club]);
    var depts = isOrg ? NLDirectory.ORG_ORDER : NLDirectory.ORDER;
    var sel = deptSelect(depts.filter(function (d) {
      return held.indexOf(d) < 0;
    })[0] || 'Other', null, isOrg);
    sel.id = 'arDeptSel';
    form.querySelector('#arDept').appendChild(sel);

    NL.modal({
      title: 'Add a role for ' + name,
      body: form,
      buttons: [
        { label: 'Cancel', className: 'btn--ghost', onClick: function (c) { c.close(); } },
        { label: 'Add role', className: 'btn--primary', onClick: function (c) {
          var dept = sel.value;
          person.roles = NLDirectory.rolesOf(person).concat(
            { section: dept, title: form.querySelector('#arTitle').value.trim() });
          c.close();
          saveStructure(club, name + ' added to ' + dept);
        } }
      ]
    });
  }

  function removeRole(club, person, ridx) {
    var roles = NLDirectory.rolesOf(person);
    var name = NLDirectory.fullName(person) || 'this person';
    var here = roles[ridx].section;
    var rest = roles.filter(function (r, i) { return i !== ridx; })
      .map(function (r) { return r.section; });

    var dropRole = function () {
      person.roles = roles.filter(function (r, i) { return i !== ridx; });
      ALL[club].people = NLDirectory.arr(ALL[club].people);
      saveStructure(club, name + ' removed from ' + here);
    };
    var dropPerson = function () {
      coverLists(club, person).then(function (cover) {
        if (!cover) { return; }
        ALL[club].people = NLDirectory.arr(ALL[club].people)
          .filter(function (p) { return p !== person; });
        var note = applyCover(club, person, cover);
        saveStructure(club, name + ' removed from the directory' + note);
      });
    };

    /* One role: one outcome, and it is the whole entry. */
    if (!rest.length) {
      NL.confirm('Remove ' + name + ' from the directory entirely? This is their only ' +
        'role, so the whole entry goes — name, contact details and all.' +
        '\n\n\u201cChange log\u201d at the top of the page will put it back.',
        { title: 'Remove person', variant: 'danger', confirmText: 'Remove person' }
      ).then(function (ok) { if (ok) { dropPerson(); } });
      return;
    }

    /* More than one, and the two outcomes are genuinely different: they have
       stopped doing this job, or they have left the club. Deciding on their
       behalf from the role count was wrong — it meant deleting somebody with
       three roles took three separate removals, each one asking a question
       that was not the one being answered. */
    NL.modal({
      title: 'Remove ' + name,
      size: 'sm',
      body: '<p class="confirm-text">' + esc(name) + ' is listed under ' +
        esc([here].concat(rest).join(', ')) + '.</p>' +
        '<p class="confirm-text">Have they stopped doing the ' + esc(here) +
        ' job, or have they left the club altogether?</p>' +
        '<p class="form-hint">Either way, “Change log” at the top of the page ' +
        'will put it back.</p>',
      buttons: [
        { label: 'Cancel', className: 'btn--ghost', onClick: function (c) { c.close(); } },
        { label: 'Remove from ' + here, className: 'btn--ghost',
          onClick: function (c) { c.close(); dropRole(); } },
        { label: 'Delete entirely', className: 'btn--danger',
          onClick: function (c) { c.close(); dropPerson(); } }
      ]
    });
  }

  /* Adding is the one action with no row to hang off, and the department it
     belongs to may not be on screen at all — renderClub skips a department
     with nobody in it, so "add to Ticketing" cannot be a button under a
     Ticketing heading that does not exist. Hence one button at the foot and a
     department picker in the form. */
  function addPerson(club) {
    var form = document.createElement('div');
    form.className = 'form-grid';
    form.innerHTML =
      '<div class="form-group span2"><label>Name <span class="req">*</span></label>' +
        '<input id="apName" autocomplete="off" placeholder="e.g. Jane Smith"></div>' +
      '<div class="form-group"><label>Department</label><span id="apDept"></span></div>' +
      '<div class="form-group"><label>Job title</label>' +
        '<input id="apTitle" autocomplete="off" placeholder="e.g. Ticketing Manager"></div>' +
      '<div class="form-group"><label>Email</label>' +
        '<input id="apEmail" type="email" autocomplete="off"></div>' +
      '<div class="form-group"><label>Phone</label>' +
        '<input id="apPhone" autocomplete="off"></div>' +
      '<div class="form-group span2 ed-check">' +
        '<label><input type="checkbox" id="apHide"> Keep their contact details out of the ' +
        'published directory</label>' +
        '<p class="form-hint">We still hold them; the reader shows "Not published".</p></div>';
    var sel = deptSelect('Other', null, NLDirectory.isOrg(ALL[club]));
    sel.id = 'apDeptSel';
    form.querySelector('#apDept').appendChild(sel);

    var ctrl = NL.modal({
      title: 'Add someone to ' + club,
      body: form,
      buttons: [
        { label: 'Cancel', className: 'btn--ghost', onClick: function (c) { c.close(); } },
        { label: 'Add', className: 'btn--primary', onClick: function (c) {
          var name = form.querySelector('#apName').value.trim();
          if (!name) { NL.toast('A name is needed', 'error'); return; }
          var email = form.querySelector('#apEmail').value.trim();
          var phone = form.querySelector('#apPhone').value.trim();
          var person = { id: newId(), title: '', postNominals: '',
            firstName: '', lastName: '', name: name,
            emails: email ? [email] : [], phones: phone ? [{ number: phone }] : [],
            hideContact: !!form.querySelector('#apHide').checked,
            /* Stamped, because a person the League typed in is not a person
               the club submitted, and the difference has to survive. The
               sign-off page shows clubs what we hold; attributing our own
               addition to them would be putting words in their mouth. */
            added: { at: Date.now(), by: session.name || 'editor' },
            roles: [{ section: sel.value, title: form.querySelector('#apTitle').value.trim() }] };
          /* Through the same splitter the row edit uses, so an added "Dr Jane
             Smith" lands in the same fields as an edited one. */
          setAt(person, 'name', name);
          ALL[club].people = NLDirectory.arr(ALL[club].people).concat(person);
          c.close();
          saveStructure(club, name + ' added to ' + sel.value);
        } }
      ]
    });
    setTimeout(function () { form.querySelector('#apName').focus(); }, 30);
    return ctrl;
  }

  /* The HQ list is a hierarchy, not an alphabet — the CEO leads it because
     the document says so. So an org department can carry an order of its
     own: drag the rows or walk them with the arrows, stored per section
     (rec.order, _directory.js v1.14), surname for anyone added after the
     order was set. Org records only for now; a club's surname order is a
     reading convention, not an accident. */
  function wireReorder(club, rec) {
    if (!NLDirectory.isOrg(rec)) { return; }
    Array.prototype.forEach.call($('out').querySelectorAll('.cd-dept__h'), function (h) {
      var section = h.textContent;
      if (NLDirectory.sectionPeople(rec, section).length < 2) { return; }
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ed-reorder';
      b.textContent = 'Reorder';
      b.addEventListener('click', function () { reorderDept(club, section); });
      h.appendChild(b);
    });
  }

  function reorderDept(club, section) {
    var rec = ALL[club];
    /* Canon NL.sortable (nl-utils v1.43, .nl-sort in nl-brand v2.66): the
       grip, the lift, the FLIP moves and the sprite arrows. This dialog is
       where the pattern was born (v1.39, hand-rolled) and the first to
       adopt it back. A person with no id cannot be addressed by an order
       list, so they are left to the surname rule rather than listed. */
    var items = NLDirectory.sectionPeople(rec, section)
      .filter(function (p) { return p.id; })
      .map(function (p) {
        return { id: p.id, label: NLDirectory.fullName(p) || 'Name not given',
                 sub: (NLDirectory.rolesOf(p).filter(function (r) {
                   return r.section === section;
                 })[0] || {}).title || '' };
      });
    var host = document.createElement('div');
    var ctrl = NL.sortable(host, { items: items });

    NL.modal({
      title: 'Reorder ' + section,
      body: host,
      buttons: [
        { label: 'Cancel', className: 'btn--ghost', onClick: function (c) { c.close(); } },
        { label: 'Save order', className: 'btn--primary', onClick: function (c) {
          rec.order = rec.order || {};
          rec.order[section] = ctrl.order();
          c.close();
          persist(club, section + ' reordered');
        } }
      ]
    });
  }

  /* One pen per person. Pressing it turns that row's fields on and puts the
     cursor in the name; pressing it again, or clicking away, turns them off.
     Editing stays off until asked for, so a scroll on a phone cannot land in
     somebody's name and change it. */
  /* Pen when the club is open, eye when it is signed off. Same button, and the
     icon carries the permission before you press it — the pattern
     fixtures/index.html has used for a while, and better than a control that
     simply vanishes, which only raises the question. */
  function addPen(row, locked, club, person, ridx) {
    var b = document.createElement('button');
    /* Canon icon button. aria-label is load-bearing, not decoration: there is
       no text node in here, so without it the row announces "button". */
    b.className = 'btn btn--icon btn--ghost ed-pen';
    b.type = 'button';
    var label = locked ? 'View only \u2014 this club is marked complete' : 'Update details';
    b.title = label;
    b.setAttribute('aria-label', label + (person ? ' for ' +
      (NLDirectory.fullName(person) || 'this person') : ''));
    b.appendChild(NL.icon(locked ? 'eye' : 'edit'));
    if (locked || ridx == null) { b.disabled = true; row.appendChild(b); return; }
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      updateDetails(club, person, ridx);
    });
    row.appendChild(b);
  }



  /* A record holds title / firstName / lastName / postNominals separately, but
     the row shows one name and edits one name. Splitting on the first space
     alone made "Dr Daniel Palmer" a person whose first name is Dr, which then
     breaks the email-name check, sorting, and anything that reads lastName.
     Twelve people across the 72 clubs carry one of these.

     Only what is already on the record is peeled off, plus the handful of
     honorifics and post-nominals a club would actually type. Anything else
     stays in the name where the editor put it — this should not be a parser. */
  var HONORIFIC = /^(dr|mr|mrs|ms|miss|mx|sir|dame|prof|professor|rev|reverend|lord|lady|capt|major|col)\.?$/i;
  var POSTNOM  = /^(mbe|obe|cbe|kbe|dbe|bem|dl|jp|kc|qc|md|phd|frcs|mrcgp|bsc|msc|ba|ma)\.?$/i;

  function setAt(person, path, v) {
    if (path === 'name') {
      var bits = v.trim().split(/\s+/).filter(Boolean);
      var had = function (field, re) {
        var cur = (person[field] || '').trim();
        return function (w) { return (cur && w.toLowerCase() === cur.toLowerCase()) || re.test(w); };
      };
      var isTitle = had('title', HONORIFIC), isPost = had('postNominals', POSTNOM);
      var title = [], post = [];
      while (bits.length > 1 && isTitle(bits[0])) { title.push(bits.shift()); }
      while (bits.length > 1 && isPost(bits[bits.length - 1])) { post.unshift(bits.pop()); }
      person.title = title.join(' ');
      person.postNominals = post.join(' ');
      person.firstName = bits.shift() || '';
      person.lastName = bits.join(' ');
      person.name = v.trim();
      return;
    }
    var parts = path.split('/'), cur = person;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null) { cur[parts[i]] = {}; }
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = v;
  }


  /* ------------------------------------------------------ the rename trap
     Josh Knowles is Head of Media and also the programme editor: one record,
     two rows. A new hire takes over the programme, an editor opens that row
     and types "Jane Smith" over the name — and Josh becomes Jane in the media
     department too, carrying Josh's email address into Jane's entry.

     That was always the behaviour. What changed is that syncing sibling rows
     made it visible; before, the record was corrupted exactly the same way
     and the other row went on displaying the old name until a redraw, so it
     looked like it had worked.

     The fix is not to pick a side. Both readings are ordinary:
       · same human, spelling corrected  -> rename everywhere
       · different human in this job     -> the name belongs to this role only

     So ask, once, at the moment it becomes ambiguous — which is only ever a
     name, only ever on somebody with more than one role. A single-role person
     has no other entry to damage and is left alone.

     The replacement deliberately does NOT inherit the contact details. A new
     person wearing the old person's email is worse than the rename it was
     meant to fix: it looks correct and it is wrong. They arrive with nothing
     held, which the existing red chips already flag for chasing. */
  function resolveRename(club, person, ridx, from, to) {
    var roles = NLDirectory.rolesOf(person);
    var here = (roles[ridx] || {}).section || '';
    var others = roles.filter(function (r, i) { return i !== ridx; })
      .map(function (r) { return r.section; });

    return new Promise(function (resolve) {
      var settled = false;
      var done = function (v) { if (!settled) { settled = true; resolve(v); } };
      NL.modal({
        title: 'Same person, or someone new?',
        size: 'sm',
        body: '<p class="confirm-text">Is <b>' + esc(to) + '</b> the same person as ' +
          esc(from) + ' (a spelling fix or a new surname), or someone new who has taken ' +
          'over ' + esc(here) + '?</p>' +
          '<p class="form-hint">' + (others.length
            ? esc(from) + ' stays listed under ' + esc(others.join(' and ')) + '. '
            : esc(from) + ' comes out of the directory. ') +
          'Someone new gets the job but none of ' + esc(from) + '\u2019s email addresses ' +
          'or phone numbers \u2013 add theirs afterwards.</p>',
        onClose: function () { done(false); },
        buttons: [
          { label: 'Cancel', className: 'btn--ghost',
            onClick: function (c) { done(false); c.close(); } },
          { label: 'Same person', className: 'btn--ghost',
            onClick: function (c) { done('same'); c.close(); } },
          { label: 'New in ' + here, className: 'btn--primary',
            onClick: function (c) { done('new'); c.close(); } }
        ]
      });
    });
  }

  /* The new person takes the job — the role and its title — and nothing else.
     The old person keeps every other role and their own contact details. */
  function replaceInRole(club, person, ridx, name, next) {
    var roles = NLDirectory.rolesOf(person);
    var role = roles[ridx];
    var fresh = { id: newId(), title: '', postNominals: '', firstName: '', lastName: '',
      name: name, emails: [], phones: [], hideContact: !!person.hideContact,
      added: { at: Date.now(), by: session.name || 'editor',
               replacing: NLDirectory.fullName(person) },
      roles: [{ section: (next && next.section) || role.section,
                title: (next && next.title) || role.title || '' }] };
    setAt(fresh, 'name', name);
    person.roles = roles.filter(function (r, i) { return i !== ridx; });
    /* Their only job was this one: they have left, so they come out. */
    var people = NLDirectory.arr(ALL[club].people);
    var note = '';
    if (!person.roles.length) {
      people = people.filter(function (p) { return p !== person; });
    }
    ALL[club].people = people.concat(fresh);
    /* Someone who has left entirely is replaced on their mailing lists too:
       the new person was brought in to do their job. Somebody who stays
       keeps their lists — Edit lists if that should change. */
    if (!person.roles.length && person.id) {
      var cover = {};
      listsWith(ALL[club], person.id).forEach(function (k) { cover[k] = fresh.id; });
      note = applyCover(club, person, cover);
    }
    saveStructure(club, name + ' replaces ' + NLDirectory.fullName(person) +
      ' in ' + role.section + note);
  }




  /* ------------------------------------------------------------- hand edits
     Three things can be true of a field, and until now only two of them were
     visible. The tidier changed it (amber, undoable). Something is wrong with
     it (red, needs a person). Or somebody on the admin team typed over it —
     which is the one that matters most when two editors are working the same
     club, and it left no mark at all.

     Green, because it is the only one of the three that is a person doing
     their job rather than a machine or a problem. The row carries a tint as
     well as a chip: at a glance down a club you want to see WHERE the work
     has been done, and reading chips one at a time does not give you that.

     Kept alongside the bake's own log rather than inside it. The bake's
     entries can be put back; these are the deliberate ones and there is
     nothing to revert to. */
  function editList(club) {
    return NLDirectory.arr((PROV[club] || {}).edits);
  }

  /* One entry per field, and `from` is the value before ANY hand edit — not
     before the latest one. Keeping the latest meant typing something and then
     typing it back left a record saying the field had changed from the wrong
     thing to the right thing, and the row stayed green forever. Returning a
     field to where it started now removes the entry, because nothing has
     changed and the marker should say so. */
  function logEdit(club, path, from, to) {
    var prov = PROV[club] || (PROV[club] = {});
    var all = editList(club);
    var had = all.filter(function (e) { return e.path === path; })[0];
    /* Never undefined. RTDB rejects an undefined value by THROWING, not by
       rejecting a promise, so one of these in the object took the whole click
       handler down with it — after the marker had been set in memory and
       before the save ran. The result was a green "edited by hand" line over a
       record that had not changed, no journal entry, and no way back. An
       entry whose `from` was absent (a null dropped by RTDB on write) was
       enough to trigger it on the NEXT edit of the same field. */
    var str = function (v) { return String(v == null ? '' : v); };
    var base = str(had ? had.from : from);
    from = str(from); to = str(to);
    var edits = all.filter(function (e) { return e.path !== path; });
    if (to.trim() !== base.trim()) {
      edits.push({ path: path, from: base, to: to,
        by: session.name || 'editor', at: Date.now() });
    }
    prov.edits = edits;
    firebase.database().ref(ROOT + '/provenance/' + club + '/edits').set(edits)
      .catch(function (err) {
        NL.toast('Could not record that edit: ' + ((err && err.message) || err), 'error');
      });
  }

  /* ------------------------------------------------------- row markers
     Where a row's chips hang. Only the blank-job-title gap uses it since
     v2.1; the import's markers (Was, Added by us, Changed, the tidier's
     flags) came off the page then. */
  function pillsFor(row) {
    var box = row.querySelector('.ed-pills');
    if (!box) {
      box = document.createElement('div');
      box.className = 'ed-pills';
      row.appendChild(box);
    }
    return box;
  }

  /* Every role entry with no job title. 307 of 1,478 across the 72 clubs, so
     this is the most common thing the admin team has to chase. Read from the
     rendered row rather than the record, so it stays true after an edit. */
  function markGaps(name, rec) {
    $('out').querySelectorAll('.cd-row').forEach(function (row) {
      var role = row.children[1];
      if (role && role.querySelector('em')) { addGap(row, 'No job title'); }
    });
  }

  /* A gap the club left. Not ours to undo, so no action on it — it is there to
     be chased, which is what the admin team is for. */
  function addGap(row, text, why) {
    var pill = document.createElement('span');
    pill.className = 'ed-pill ed-pill--gap';
    pill.textContent = text;
    /* An (i) so the tooltip is discoverable. The reason is the useful half of
       a red flag and it was hidden behind a hover nothing advertised. */
    if (why) {
      var i = document.createElement('span');
      i.className = 'ed-i';
      i.textContent = 'i';
      i.setAttribute('aria-hidden', 'true');
      pill.appendChild(i);
    }
    /* The reason goes in the tooltip rather than the chip. "Check spelling"
       is what an editor needs to see at a glance across a whole club; why we
       think so is a sentence, and a sentence in the margin of every row is
       the wall of text the chips replaced. */
    if (why) { pill.title = why; }
    pillsFor(row).appendChild(pill);
  }

  function persist(club, what, undoOf) {
    logJournal(club, what, undoOf);
    saveClub(club)
      .then(function () { NL.toast(what, 'success'); draw(club); })
      .catch(function (err) {
        NL.toast('Could not save: ' + ((err && err.message) || err), 'error');
      });
  }

  /* ----------------------------------------------------- the club's details
     The half of the record that is not people, and until now the half nobody
     could correct: a wrong capacity, a stadium under its old name, a social
     account we hold at the wrong URL — all of it read-only, in a tool whose
     entire job is putting the record right.

     A modal rather than the contenteditable cells the rows use. Half these
     facts are composites — the address is five fields, capacity is two, the
     station is two — so editing them in place means either editing a rendered
     sentence or splitting the display, and both are worse than a form. */
  /* Placeholders are examples of SHAPE, never of content, and they say so.
     These used to be Brackley Town's actual ground, town, county, postcode,
     nearest station and switchboard — a real club's real details sitting in
     the empty boxes of every other club's form, where they read as entered
     data rather than as a hint. On a form somebody opens precisely because
     they are unsure what is held, that is the worst possible thing to show.
     Every one now starts "e.g." and none of them is a real club. */
  var INFO_FIELDS = [
    ['Ground', [
      ['stadium', 'Stadium (official)', 'e.g. Riverside Park'],
      ['stadiumSponsor', 'Stadium (sponsored)', 'Leave blank if there is no sponsor'],
      ['capacity', 'Capacity', 'e.g. 3500'],
      ['seated', 'Of which seated', 'e.g. 669'],
      ['pitchDims', 'Pitch dimensions', 'e.g. 101m x 70m'],
      ['pitchType', 'Pitch type', 'e.g. Grass']
    ]],
    ['Address', [
      ['addr1', 'Address line 1', 'e.g. Stadium Way'],
      ['addr2', 'Address line 2', ''],
      ['town', 'Town', 'e.g. Anytown'],
      ['county', 'County', 'e.g. Blankshire'],
      ['postcode', 'Postcode', 'e.g. AB1 2CD'],
      ['countyFA', 'County FA', 'e.g. Blankshire FA'],
      ['station', 'Nearest station', 'e.g. Anytown Central'],
      ['stationDistance', 'Distance (miles)', 'e.g. 1.5']
    ]],
    ['Contact', [
      ['phone', 'Switchboard', 'e.g. 01234 567890'],
      ['mainEmail', 'Main email', 'e.g. secretary@example.co.uk']
    ]],
    ['Sponsors', [
      ['spClub', 'Club sponsor', ''],
      ['spFront', 'Shirt front', ''],
      ['spBack', 'Shirt back', ''],
      ['spSleeve', 'Sleeve', ''],
      ['spShorts', 'Shorts', ''],
      ['spExtra', 'Other', '']
    ]],
    ['Website and social', [
      ['website', 'Website', 'e.g. www.example.co.uk'],
      ['x', 'X', 'e.g. https://x.com/...'],
      ['facebook', 'Facebook', 'e.g. https://www.facebook.com/...'],
      ['instagram', 'Instagram', 'e.g. https://www.instagram.com/...'],
      ['tiktok', 'TikTok', 'e.g. https://www.tiktok.com/@...'],
      ['linkedin', 'LinkedIn', 'e.g. https://uk.linkedin.com/company/...'],
      ['youtube', 'YouTube', 'e.g. https://www.youtube.com/@...']
    ]]
  ];

  function showClubEdit(club, rec) {
    var card = document.getElementById('cdCard');
    if (!card) { return; }
    var b = document.createElement('button');
    b.className = 'btn btn--icon btn--ghost ed-cardpen';
    b.type = 'button';
    b.title = 'Edit the club\u2019s details';
    b.setAttribute('aria-label', 'Edit the club\u2019s details');
    b.appendChild(NL.icon('edit'));
    b.addEventListener('click', function () { editClubInfo(club, rec); });
    card.appendChild(b);
  }

  function editClubInfo(club, rec) {
    /* Read through ALL[club] at save time rather than through the rec this
       closure captured. Belt to the braces above: even if something does
       replace the club object mid-session, the save lands on the record the
       rest of the tool is using. */
    var info = rec.info || {};
    var wrap = document.createElement('div');
    INFO_FIELDS.forEach(function (group) {
      var h = document.createElement('h4');
      h.className = 'ed-fgroup';
      h.textContent = group[0];
      wrap.appendChild(h);
      var grid = document.createElement('div');
      grid.className = 'form-grid';
      group[1].forEach(function (f) {
        var g = document.createElement('div');
        g.className = 'form-group';
        var lab = document.createElement('label');
        lab.textContent = f[1];
        var inp = document.createElement('input');
        inp.value = info[f[0]] == null ? '' : String(info[f[0]]);
        inp.setAttribute('data-info', f[0]);
        inp.setAttribute('autocomplete', 'off');
        if (f[2]) { inp.placeholder = f[2]; }
        g.appendChild(lab); g.appendChild(inp); grid.appendChild(g);
      });
      wrap.appendChild(grid);
    });

    NL.modal({
      title: club + ' \u2014 club details',
      width: 'wide',
      body: wrap,
      buttons: [
        { label: 'Cancel', className: 'btn--ghost', onClick: function (c) { c.close(); } },
        { label: 'Save details', className: 'btn--primary', onClick: function (c) {
          var next = {}, changed = [];
          for (var k in info) { if (Object.prototype.hasOwnProperty.call(info, k)) { next[k] = info[k]; } }
          wrap.querySelectorAll('[data-info]').forEach(function (inp) {
            var key = inp.getAttribute('data-info');
            var was = info[key] == null ? '' : String(info[key]);
            var now = inp.value.trim();
            if (now === was) { return; }
            next[key] = now;
            changed.push(key);
            logEdit(club, 'info/' + key, was, now);
          });
          /* One flag, one meaning. The submissions carry a noSponsor boolean
             that disagrees with the sponsored name on five clubs, so it is
             derived from the name here rather than edited alongside it. */
          next.noSponsor = !((next.stadiumSponsor || '').trim());
          if (!changed.length) { c.close(); return; }
          (ALL[club] || rec).info = next;
          c.close();
          saveStructure(club, changed.length + ' club detail' +
            (changed.length === 1 ? '' : 's') + ' updated (' + changed.join(', ') + ')');
        } }
      ].filter(Boolean)
    });
  }

  /* Sits directly under the last department, where "and one more person"
     belongs, rather than in the topbar with the club picker — that bar is
     about which club you are looking at, not what you are doing to it. */
  function showAdd(club, rec) {
    var wrap = document.createElement('div');
    wrap.className = 'ed-add';
    var b = document.createElement('button');
    b.className = 'btn btn--ghost btn--sm';
    b.type = 'button';
    b.appendChild(NL.icon('add'));
    b.appendChild(document.createTextNode('Add someone'));
    b.addEventListener('click', function () { addPerson(club); });
    wrap.appendChild(b);
    /* On the line with List / Cards (v3.0, Richard), not under the last
       department: on a big club the foot of the page is screens away. */
    var sw = $('out').querySelector('[data-view-switch]');
    if (sw) {
      var line = document.createElement('div');
      line.className = 'ed-vwline';
      sw.parentNode.insertBefore(line, sw);
      line.appendChild(sw);
      line.appendChild(wrap);
      return;
    }
    $('out').appendChild(wrap);
  }

  function search(q) {
    var hits = NLDirectory.search(ALL, q);
    if (!hits) { draw(current); return; }
    $('extra').innerHTML = '';
    if (!hits.length) { $('out').innerHTML = '<p class="cd-empty">Nothing matched that.</p>'; return; }
    var byClub = {};
    hits.forEach(function (h) { (byClub[h.club] = byClub[h.club] || []).push(h.person); });
    var cards = VIEW === 'cards';
    $('out').innerHTML = NLDirectory.viewSwitch(cards) +
      Object.keys(byClub).sort().map(function (c) {
      return '<div class="cd-dept"><h3 class="cd-dept__h">' + esc(c) + '</h3>' +
        '<ul class="' + (cards ? 'cd-cards' : 'cd-rows') + '">' +
        byClub[c].sort(NLDirectory.bySurname).map(function (p) {
          return cards ? NLDirectory.personCard(p, viewOpts())
                       : NLDirectory.personRow(p, (NLDirectory.rolesOf(p)[0] || {}).section,
                           viewOpts());
        }).join('') + '</ul></div>';
    }).join('');
  }

  return { start: start, draw: draw, search: search };
}());
