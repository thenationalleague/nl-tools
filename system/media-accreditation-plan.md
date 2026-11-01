# Media Accreditation & Licences – build spec

**Status:** v1 slice 1 built 01/11/2026 (shell, registry, rules, public form into the staff queue). See `accreditation/README.md` for what is built and the decisions taken.
**Owner:** Richard (licensing owner), with support from the League admin team.
**Settled in:** grilling session, 01/11/2026.

## Changelog

| Version | Date | Changes |
|---|---|---|
| v1.0 | 01/11/2026 | First draft from the grilling session. Photography v1 scope, two-layer licence/accreditation model, video recorded as phase 3. |
| v1.1 | 01/11/2026 | Slice 1 built. §14 item 6 answered: Club Admin gets Use, Club Staff off (switched on when the club page ships). Personal link deferred to slice 2. Agreement text entered in `/admin/`, never committed. |

---

## 1. Why this exists

Photographer licensing currently runs on a Smartsheet form, a manual copy into a Drive spreadsheet, and a print-sign-scan agreement. A recent application exposed the gaps:

- **The club route is unverified.** Anyone can type a club name and appear to be covered by the League's central insurance (Guide to Member Clubs §6.14). Nobody holds a list of club photographers.
- **Nothing checks the insurance properly.** Any PDF is accepted. Nobody checks that the name on the policy is the applicant's, that it covers at least £2m, or when it ends.
- **No age check.** The agreement has no date of birth and no guardian signature, and its indemnity (clause 9) is likely unenforceable against a minor.
- **Nothing expires.** The agreement's Term runs "until cancelled or revoked", and insurance expiry dates aren't recorded.
- **Clubs can't verify anything.** Photographers give a licence number at the sign-in sheet, and the club has nothing to check it against.
- **Holders never receive a countersigned copy** of their agreement.

Smartsheet could have done most of this. The problem was that the process was never designed, not that a tool was missing.

## 2. The model – two layers

| Layer | Granted by | What it means | Scope |
|---|---|---|---|
| **Licence** | The League | The right to photograph (later: film) at League matches, on agreed terms. Requires vetting, insurance and a signed agreement. | Per season, per type |
| **Accreditation** | The home club | Access to *that club's* ground. The club's discretion, as clause 3 of the agreement and §6.14 of the club guide already say. | Per match, or a standing pass the club gives its own people |

A licence comes first. No club can accredit someone without a valid licence.

### Licence types

| Type | Who | Duration | Phase |
|---|---|---|---|
| **Photography** | Freelancers, agencies, media outlets, club photographers | Season | **v1** |
| Club video | A club's own videographer | Season, with the DAZN embargo terms attached | 3 |
| Outlet video – season | Regular news outlets (e.g. BBC/ITV regional, local paper video teams, agencies) | Season, covering the outlet's named crew | 3 |
| Outlet video – single match | One-off news visits | One match | 3 |
| Creator / freelance video | Fan channels, vloggers | Not offered. The public form says so and gives a contact address. | Open policy question |

Build the data model so that a type is a record with its own agreement text, required fields and checks. Adding video later should mean adding types, not rebuilding the tool.

## 3. Surfaces

| Surface | Path | Who | Gate |
|---|---|---|---|
| Club page | `/accreditation/` | Club users, scoped to their own club | auth-guard, Use |
| Staff console | `/accreditation/admin/` | Richard and the admin team | auth-guard, Manage |
| Public application | `/accreditation/application/` | Anyone | None: anonymous sign-in, rules-limited |
| Holder's own page | `/accreditation/application/#<token>` | One licence holder (or a guardian, with their own token) | Personal link token |

**toolKey:** `media-accreditation`, department Media. Root is the club page and staff console is `/admin/`, following the CLAUDE.md rule for tools clubs use.

**Public pages and personal links** use the same pattern as Matchday Live's capture page (see `matchday-live/README.md`): anonymous sign-in, then the link token is swapped for a session through `NL.codeGate.viaFunction`, the RTDB-trigger handshake. **There are no public HTTPS functions.** The org's Domain Restricted Sharing policy blocks `allUsers` on new Cloud Run services. Rules check the token-hash generation and `active` on every read and write, so a rotated or revoked link stops working at once.

The token goes after `#`, not in a query string, so it never reaches server logs.

## 4. Routes for a photography licence

### 4.1 Club route
1. The photographer applies on `/accreditation/application/` and picks **Club** as their organisation type, then chooses the club from a dropdown (`NL.clubPicker`).
2. **No insurance questions.** Club photographers, paid or volunteer, are covered by the central policy (§6.14).
3. The application lands in **that club's queue** on `/accreditation/`. The club sees the applicant's details, photo and, if they are under 18, a clear **Under 18** flag. The club confirms ("yes, they shoot for us, and we know their age") or rejects.
4. Club confirmation also creates a **standing home accreditation** for that person at that club.
5. Staff give the final sign-off (§6).

**If the club doesn't respond:** reminders go out at 3 and 7 days. After that, the application shows in `/admin/` as **Club not responding**. Staff can confirm on the club's behalf, and must record how they did it (e.g. "Phoned the club secretary, 04/11/2026"), which is kept on the record.

### 4.2 Freelance / agency / media outlet route
1. The applicant fills in the full form, including structured insurance details (§5).
2. The tool runs the checks (§6.1) and shows the results to staff.
3. Staff approve or decline.

**Agency / outlet:** one licence holder covers their named staff and contractors, as the agreement's definition of "Authorised Photographer" already allows. The application names the licence holder and lists each photographer, each with their own photo.

## 5. The application form

The form is conditional: each answer opens only the questions that apply.

**Everyone**
- Full legal name, email, phone, address
- Passport-style photo (required: it appears on the pass and in club lookups)
- **Are you under 18?** If yes, ask for date of birth and the parent or guardian's name, email and relationship. Under-18s can **only** use the club route (§7).
- Previous licence number, if renewing (pre-filled by the renewal link)

**Organisation type:** Freelance / Agency / Media outlet / Club / Other
- **Club:** club (picker), and paid staff or volunteer. No insurance section.
- **Agency / outlet:** company name, licence holder, named photographers (each with their own photo).

**Insurance** (every route except Club)
- Insurer, policy number, public liability limit, start date, expiry date
- **Named insured, exactly as on the schedule**
- Tick box: "This policy is in my name / my organisation's name." If it's unticked, an explanation is required.
- Upload the schedule (PDF/JPG/PNG)

**Use and declarations**
- Where the photos will be published (club channels, agency sales, own website, newspaper/magazine, other)
- Clubs they mainly cover (optional, helps clubs)
- Ever refused a licence or had one revoked? (Clause 8)
- Signing the agreement (§8), confirming the information is accurate, data processing consent

**Worked out by the system, never asked:** licence number, licence expiry, check results.

## 6. Approval

**Staff always give the final yes**, for both routes and for mid-season insurance updates.

### 6.1 Automatic checks (shown to staff, not decisive)

| Check | Flag when |
|---|---|
| Name on policy | The named insured doesn't match the applicant or their organisation, or the tick box is unticked |
| Cover limit | Under £2,000,000 |
| Insurance dates | Starts in the future, or ends within 30 days |
| Under 18 | Not on the club route, or no guardian signature yet |
| Duplicate | Same name + date of birth, or the same email as an existing licence this season |
| Previous refusal | They answered yes to clause 8, or a match with a revoked or suspended record |

### 6.2 Staff actions
- **Approve:** issues the licence number, records the League's countersignature (approver and time), and emails the holder the signed agreement and their personal link.
- **Decline with notes:** the notes go to the applicant, who can fix and resubmit through their link.
- **Confirm on the club's behalf:** requires a note on how it was confirmed.
- **Suspend / revoke:** requires a reason. Revocation is preceded by the hearing process in clause 14 and Appendix A of the agreement. The tool records the hearing date and outcome; it doesn't run the hearing.

## 7. Under-18s

- Club route only. Freelance under-18s are blocked on the form, with an explanation.
- A parent or guardian countersigns through their own emailed link (§8). The application can't reach staff until they have signed.
- The club's confirmation screen shows **Under 18** clearly, because safeguarding at the ground is the club's responsibility.
- **Dependency:** Marsh must confirm in writing that the central policy covers club volunteers and staff under 18 (§14). Until then, under-18 applications are held at staff sign-off with a banner saying so.

## 8. The agreement and signing

- The agreement text lives in the tool, **versioned in RTDB** (`config/agreements/<type>`), and is editable in `/admin/`. As with Matchday Live's consent wording, **the form won't accept applications until an approved version is saved**, so unapproved wording can't go out by accident.
- **Click-to-sign:** the signer types their full name and ticks to agree. The tool stores the agreement version, the typed name, the time and the session.
- **Guardian:** signs the same way through their own link.
- **League countersignature:** recorded automatically on staff approval, with the approver's name and time.
- **Signed copy:** a PDF of the agreement text, both signatures and their timestamps is emailed to the holder on approval and can be downloaded from their page at any time. Today holders never get a countersigned copy.

**The template needs a legal refresh before it goes into the tool** (§14): it covers still photos only, has no date of birth or guardian block, has broken cross-references in clause 6(b), ignores the club insurance route in clause 5, and has an open-ended Term.

## 9. Seasons, expiry and renewal

- **Season scoping:** every licence belongs to a season (`2627`), using `NL.season.fromDate`. Season start and end dates are set in `config/seasons/<season>`.
- **Licence numbers:** keep the existing format, `NL2627-###`, numbered within each season.
- **Expiry:** whichever comes first of the season end and the insurance expiry date. Club-route licences run to the season end.
- **Mid-season insurance renewal:** the holder uploads a new schedule and details through their link. Staff check it. On approval, the expiry date updates to the new min(season end, new insurance expiry). While it's pending, the old expiry stands.
- **Reminders** to the holder 30 days and 7 days before expiry, and on the day it lapses.
- **Season renewal:** each summer (date in config), last season's holders get a **Renew** email. Their page pre-fills last year's details, and they confirm, update their insurance and sign the new season's agreement. A renewal is a new licence, with a new number, for the new season.

## 10. Club page (`/accreditation/`)

- **Waiting for you:** club-route applications to confirm or reject.
- **Our people:** the club's standing accreditations, with licence status and expiry.
- **Check a licence:** type in or scan any licence number to see photo, name, type, status, expiry and who they shoot for. Nothing else is shown. **Signed-in clubs only**, so no photographer data is ever public. This matters especially for minors.
- **Report a problem:** from a lookup result, with the match and a note. It goes to `/admin/` and builds a history per holder. It doesn't change the licence by itself.

## 11. The pass

On the holder's page, printable and on-phone:
- Photo, name, licence number, type, season, expiry, and the club(s) they shoot for (club route)
- A **QR code** that opens `/accreditation/?check=<licence number>`. A signed-in club user lands straight on the lookup result. Anyone else sees the sign-in page.
- The pass carries no other personal details.

## 12. Staff console (`/accreditation/admin/`)

- **Queue:** awaiting staff / awaiting club / club not responding / awaiting guardian / insurance updates. Each shows the check results from §6.1.
- **Licences:** all licences for the season, filterable by type, route, club, status and expiry window.
- **Issues:** problems reported by clubs, per holder.
- **Agreements:** versioned agreement text for each type.
- **Seasons:** season dates and the renewal-invite date.
- **Import:** see §13.
- **Outbox:** queued emails with a copy button, as a fallback if the email shim is down (§13).
- **Archive:** a manual "archive" action for a licence or season. Nothing is deleted automatically (§15).

## 13. Import and email

### Import
- A CSV upload **in the browser, in `/admin/`**, using `NL.csv`, with a **column-matching step** (choose which column is the name, licence number, company, email and so on).
- Imported records are marked `source: import` and `incomplete: true`. They count as valid licences until the season ends, and show "details missing" to staff.
- **Never committed to the repo.** The CSV goes straight from the browser into RTDB.
- **Later (not in the prototype):** catch-up emails asking imported holders to complete their insurance details, the under-18 question and the e-signature by a deadline.

### Email
- Sent **from accreditation@** through the **private Apps Script email shim** (the locked decision in `system/gas-to-functions-migration.md`), so replies land with Richard and the admin team.
- If the shim isn't live yet, the prototype writes each email to the **Outbox** in `/admin/` with a copy button.

| Email | To | When |
|---|---|---|
| Application received + personal link | Applicant | On submit |
| Guardian signature request | Guardian | On submit, under-18 |
| Confirmation request | Club users with Use on the tool for that club | On submit, club route; reminders at 3 and 7 days |
| Approved + signed agreement + pass link | Holder | On approval |
| Declined with notes | Applicant | On decline |
| Insurance expiring | Holder | 30 days, 7 days, on the day |
| Renew for next season | Last season's holders | Renewal date in config |
| Lost my link | Holder | On request (sent to the email on file only) |

## 14. Dependencies and open questions

| # | Item | Owner | Blocks |
|---|---|---|---|
| 1 | **Marsh:** does the central policy cover club photographers under 18 (paid and volunteer)? Do clubs have to declare them? Is £2m right for freelancers? Should we ask for indemnity to principal? Is a scheme policy for freelancers possible? | Richard | Under-18 approvals going live |
| 2 | **Agreement refresh:** a video version, a guardian block, clause 5 club route, Term tied to the season, the clause 6(b) cross-references, a date-of-birth field | Whoever handles the League's legal work | Going live (the prototype can use the current text) |
| 3 | **Email shim:** confirm it exists and can send from accreditation@ | Richard | Real email (the Outbox covers the prototype) |
| 4 | **DAZN:** news access and third-party filming terms in the contract; Appendix F of the Rules | Richard | Phase 3 (video) |
| 5 | **Retention:** decision is to keep everything (§15). Worth a check with whoever handles data protection | Richard | Nothing (risk noted) |
| 6 | ~~**Club users:** which club roles get Use by default?~~ **Answered 01/11/2026:** Club Admin Use, Club Staff off. | Richard | – |
| 7 | **SOP:** rewrite "SOP – Photographer Licenses" once the tool is live | Richard | – |

## 15. Data and privacy

- **The repo is public.** No names, emails, test fixtures or exports in it. Everything personal lives in RTDB and Storage behind rules.
- **Retention: keep everything.** That's Richard's decision, so there is no automatic deletion. **Known risk:** data protection law expects personal data not to be kept longer than needed, and the weakest spot is minors' details and ID photos kept indefinitely. The manual Archive (§12) gives a way to tidy up later.
- **Least exposure:** clubs see only the lookup fields (§10) and full details of their own applicants. Insurance documents and guardian details are Manage-only.
- **Storage:** uploads are create-only under the anonymous session's own path, with type and size limits (images up to 5MB, PDFs up to 10MB). Storage rules can't read RTDB (a known limit, as in Matchday Live), so an upload with no matching record never reaches the console.
- **Abuse limits** in the rules, as in Matchday Live: an application can only be created together with a pace stamp and a daily quota per anonymous session.

## 16. Data sketch

All under `app-data/media-accreditation/` in nl-tools RTDB.

```
config/seasons/<season>          start, end, renewalInviteDate
config/agreements/<type>         version, text, approvedBy, approvedAt
config/types/<type>              label, phase, offered, needsInsurance, minAge rules
applications/<season>/<id>       type, route, person{}, org{}, club, clubOpta, paidOrVolunteer,
                                 under18, dob?, guardian{}?, insurance{}?, use{}, declarations{},
                                 status, checks{}, clubDecision{by, at, note, onBehalf?},
                                 staffDecision{by, at, notes}, createdAt, source
licences/<season>/<number>       applicationId, holder{}, type, route, clubs{}, issuedAt,
                                 expiresAt, status active|expired|suspended|revoked,
                                 signatures{holder, guardian?, league}, agreementVersion
insuranceUpdates/<number>/<id>   insurance{}, status, decidedBy, decidedAt
accreditations/<club>/<season>/<number>   standing: true, grantedBy, at   (phase 2 adds per-match)
issues/<number>/<id>             club, matchId?, note, by, at, staffNote
secrets/<holderId>               { tokenHash, issuedAt }          Manage only
keys/<sha256>                    <holderId>                        write-only; the trigger's lookup
outbox/<id>                      to, template, payload, status, sentAt
pace/<uid>, quota/<ymd>/<uid>    abuse limits
authRequests|authGrants/<uid>    the codeGate handshake
```

Storage: `accreditation/<season>/<applicationId>/<photo|insurance>.<ext>`.

Rules come from `node scripts/rtdb-level-rule.mjs media-accreditation access|admin`, **never hand-written role checks** (see CLAUDE.md, "When you add a new tool"). Club scope must also restrict club users to their own club's `applications` and `accreditations`.

## 17. Phases

| Phase | Scope |
|---|---|
| **v1 (prototype)** | Photography licences: public form, holder page with personal link, club-route confirmation and standing home accreditation, staff console with checks, click-to-sign with guardian and League countersignature, signed PDF, pass with QR, club lookup and problem reports, seasons and expiry, mid-season insurance update, CSV import, Outbox. |
| **2** | Per-match accreditation requests (photo and video holders ask the home club for a fixture), match lists the club can approve and print as a sign-in sheet (fixtures from the NLS mirror), catch-up emails for imported holders. |
| **3** | Video licence types (§18), once the §14 dependencies are cleared. |

## 18. Future: video

Recorded now so phase 3 starts from settled answers.

- **Rights background:** the League holds broadcast rights (Rules Appendix F; DAZN deal to 2031). Clubs *may* film matches, but publish only within the DAZN embargo and guidelines (club guide §6.7). An away club needs the home club's written permission (7 days ahead suggested; a fee is allowed if the footage goes behind a paywall). Broadcasters wanting news footage are referred to the League, and footage comes from the DAZN broadcast (§6.8).
- **Club video:** a season licence through the club route, with the DAZN embargo terms attached. The home ground is covered by a standing accreditation. Away matches are a per-match accreditation request to the home club.
- **Outlet video (season):** one licence per organisation per season, covering named crew. News use only, filming away from the match action (fans, arrivals, interviews), with match action supplied by the League from the DAZN broadcast. Organisation-level insurance. Staff approve once per season.
- **Outlet video (single match):** for one-off visits. The request goes **straight to the home club**. If the club accredits it, that also issues the one-off licence, and the League is notified with a **48-hour window to override**. No staff step otherwise. The requester does all the work.
- **Creators / freelance video:** not offered. An open policy question for Richard and DAZN.

## 19. Acceptance checks for the prototype

1. A freelance application with a mismatched policy name shows the name flag in `/admin/`.
2. A club-route application appears only in that club's queue, and not in any other club's.
3. An under-18 applicant can't choose a non-club route, and their application can't reach staff until the guardian has signed.
4. On approval, the holder gets the licence number, a signed PDF with all signatures, and a working personal link.
5. A licence's expiry equals min(season end, insurance expiry), and updates after an approved mid-season insurance upload.
6. Rotating a holder's link stops the old link at once.
7. The QR on the pass opens the lookup for a signed-in club user and the sign-in page for anyone else.
8. A CSV import with a column-matching step creates incomplete licences and leaves no file in the repo.
9. `bash system/lint-tools.sh --strict` passes, and `tests/rules-follow-portal.test.mjs` passes with the new rules.
10. Checked on iPhone Safari and Android Chrome: the form, photo upload, holder page and pass.
