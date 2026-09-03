/**
 * NL Tools — Consolidated GAS
 * Version: v2.5 (15/08/2026)
 *
 * The shared Apps Script ROUTER — the doGet/doPost entry points that dispatch
 * to the per-tool handlers. gas/ is the source of truth and deploys from the
 * repo (see gas/README.md); it is no longer a mirror to keep in lockstep.
 *
 * v2.5 (15/08/2026) — Programme Packs retired, superseded by /programme/ on
 * Firebase Storage. Removed: all 17 pp_* routes, the Drive browser routes
 * (getTree / getDownloadUrl / getThumbnail) and their handler files
 * ProgrammePacks.js and Drive.js. doGet is now a stub — it existed only to
 * serve the Drive browser. **This retires the last Google Drive dependency in
 * the project.**
 *
 * WHAT IS LEFT after that and the AI kill switch: invites, access requests,
 * approvals and vacancies. Seven actions, and every one of them is "touch RTDB,
 * then send an email" — see system/gas-to-functions-migration.md.
 *
 * NOTE ON THE CHANGELOG BELOW: entries from v2.4 back describe pp_* and Drive
 * routes at length. They are history, not live routes. Nothing dispatches them.
 *
 * CHANGELOG
 * v2.4 (19/06/2026)
 *   - Programme Packs: added pp_download_link to the router (Phase 3 big-file
 *     download — temp link-and-revoke for files too large for base64). Handler
 *     in ProgrammePacks.gs v1.3. Also run pp_setupShareCleanupTrigger() once.
 *
 * v2.3 (19/06/2026)
 *   - Programme Packs: swapped the Phase 2 upload routes — pp_upload_init/
 *     pp_upload_finalize (browser-direct PUT, blocked by Drive's lack of CORS)
 *     replaced by pp_upload_begin + pp_upload_chunk (chunked upload relayed
 *     through GAS). Handlers in ProgrammePacks.gs v1.2.
 *
 * v2.2 (19/06/2026)
 *   - Programme Packs: added pp_upload_init + pp_upload_finalize to the router
 *     (Phase 2 resumable upload — superseded by v2.3). Handlers in
 *     ProgrammePacks.gs v1.1.
 *
 * v2.1 (19/06/2026)
 *   - Programme Packs: added pp_list_folder to the doPost router (live Drive
 *     listing — the page reads what Drive actually holds, so files removed from
 *     Drive can't linger as "ghosts"). Handler in ProgrammePacks.gs v1.0.
 *   - Corrected the Deployment note (see bottom): update the EXISTING deployment
 *     with a NEW VERSION to keep the /exec URL stable. The old note said "always
 *     create a new deployment", which changes the URL and silently breaks the
 *     tool pages that call a fixed PP_GAS_URL.
 *
 * v2.0 (25/04/2026)
 *   - Programme Packs additions:
 *     * pp_thumbnails — batched version of pp_thumbnail (up to 20 per call,
 *       ~5x faster grid loads vs sequential single-thumb calls)
 *     * pp_reconcile_folder — admin-triggered Drive↔RTDB sync for one folder.
 *       Imports new Drive files, marks orphans deleted, fixes renames.
 *     * pp_download is now self-healing: if Drive's name has drifted from
 *       RTDB's, it silently patches RTDB before serving the download.
 *
 * v1.9 (25/04/2026)
 *   - Programme Packs: pp_zip rewritten to return Drive download URL
 *     (was returning base64 — capped ~50MB; URL approach raises cap to 250MB
 *     and offloads bytes to Drive's CDN). Temp zips auto-purged hourly.
 *   - Added pp_delete (hard delete of file: trash Drive file + remove RTDB)
 *     and pp_purge_orphans (one-shot cleanup of legacy soft-deleted records).
 *
 * v1.8 (25/04/2026)
 *   - Added Programme Packs pp_zip action — server-side ZIP for "Download all"
 *     with size guards (max 30 files, 50MB total uncompressed).
 *
 * v1.7 (25/04/2026)
 *   - Added Programme Packs pp_thumbnail action — fast small previews for
 *     grid view (uses Drive's native getThumbnail).
 *
 * v1.6 (25/04/2026)
 *   - Added Programme Packs NL Assets folder management actions:
 *     pp_nlf_create, pp_nlf_rename, pp_nlf_delete
 *     (admin-only — supports the dynamic folder tree inside National League Assets)
 *
 * v1.5 (25/04/2026)
 *   - Added Programme Packs actions to doPost router:
 *     pp_bootstrap, pp_upload, pp_download, pp_preview
 *     Routes to handlers in ProgrammePacks.gs (Drive-backed asset library)
 *   - New Script Properties required:
 *     PROGRAMME_PACKS_DRIVE_ROOT_ID — Drive folder ID for the tool's tree root
 *     FIREBASE_API_KEY              — Public Firebase Web API key (for ID token verification)
 *
 * v1.4 (23/04/2026)
 *   - Added meetingNotes action to doPost router
 *     Routes to generateMeetingMinutes() in MeetingNotes.gs
 *     Uses separate MEETING_NOTES_ANTHROPIC_KEY Script Property for billing separation
 *
 * v1.3 (17/04/2026)
 *   - Added claudio action to doPost router
 *     Routes to claudioChat() in ClaudioChat.gs (Anthropic API proxy for NL AI assistant)
 *     Uses separate CLAUDIO_ANTHROPIC_KEY Script Property for billing separation
 *
 * v1.2 (17/04/2026)
 *   - Added chaseEmail action to doPost router
 *     Proxies Anthropic API call server-side for Chase HQ
 *     Key stored in ANTHROPIC_KEY Script Property
 *
 * v1.1 (08/04/2026)
 *   - Added vacancies actions to doPost router:
 *     vacancies_requestCode, vacancies_validateCode,
 *     vacancies_submit, vacancies_submitAuthed
 *
 * v1.0 (03/04/2026)
 *   - Initial consolidated build
 *
 * Single GAS project handling:
 *   - Invite & token flow (invite.gs)
 *   - Email notifications (notifications.gs)
 *   - Shared Drive file browser (drive.gs)
 *   - Email templates (emails.gs)
 *   - Shared utilities (utils.gs)
 *   - Vacancies email verification & submissions (vacancies.gs)
 *   - Chase HQ AI email generation (chaseEmail.gs)
 *   - Claudio AI assistant chat proxy (claudioChat.gs)
 *   - Meeting Notes AI minutes generation (MeetingNotes.gs)
 *   - Programme Packs Drive-backed asset library (ProgrammePacks.gs)
 *
 * Script Properties required:
 *   FIREBASE_CONTINUE_URL          — Login page URL e.g. https://nl.tools/
 *   SENDER_ALIAS                   — From address e.g. media@thenationalleague.org.uk
 *   RTDB_URL                       — Firebase RTDB URL e.g. https://nl-tools-default-rtdb.europe-west1.firebasedatabase.app
 *   RTDB_SECRET                    — Firebase RTDB legacy secret
 *   DRIVE_ID                       — Shared Files root folder ID e.g. 185haCQLXK1jHDxahFquGMkwyzNIjrZd5
 *   ANTHROPIC_KEY                  — Anthropic API key (Claudio; Chase HQ retired 15/08/2026)
 *   CLAUDIO_ANTHROPIC_KEY          — Anthropic API key for Claudio AI assistant (ClaudioChat.gs) — separate billing
 *   MEETING_NOTES_ANTHROPIC_KEY    — Anthropic API key for Meeting Notes minutes (MeetingNotes.gs) — separate billing
 *   PROGRAMME_PACKS_DRIVE_ROOT_ID  — Drive folder ID for Programme Packs tree root (ProgrammePacks.gs)
 *   FIREBASE_API_KEY               — Public Firebase Web API key (used by ProgrammePacks.gs for token verification)
 *
 * Services required:
 *   Drive API — Services → Drive API → Add
 *
 * Deployment:
 *   Deploy → Manage Deployments → edit (✎) the EXISTING Web App deployment →
 *     Version dropdown → "New version" → Deploy
 *   Execute as: Me
 *   Who has access: Anyone
 *   IMPORTANT: Update the EXISTING deployment with a NEW VERSION — do NOT create
 *     a brand-new deployment. The tool pages call a FIXED /exec URL (e.g.
 *     PP_GAS_URL in programme-packs/index.html). A new deployment gets a NEW
 *     /exec URL, so the pages would keep hitting the OLD code and your changes
 *     would appear to do nothing. Only ever create a new deployment if you also
 *     update that hardcoded URL in every client that calls it.
 */

/* ---- Config -------------------------------------------------------------- */
function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    continueUrl: props.getProperty('FIREBASE_CONTINUE_URL') || '',
    senderAlias: props.getProperty('SENDER_ALIAS')          || '',
    senderName:  'The National League',
    rtdbUrl:     props.getProperty('RTDB_URL')              || '',
    rtdbSecret:  props.getProperty('RTDB_SECRET')           || '',
    driveId:     props.getProperty('DRIVE_ID')              || ''
  };
}

/* ---- Entry point: GET -----------------------------------------------------
   doGet existed only to serve the Drive browser behind Programme Packs, which
   was retired 15/08/2026. Nothing calls it now. It stays as a stub rather than
   being deleted because an Apps Script Web App with no doGet returns a Google
   error page to anyone who opens the /exec URL in a browser, which reads as a
   broken deployment rather than a deliberate one. */
function doGet(e) {
  var p      = (e && e.parameter) ? e.parameter : {};
  var action = p.action || '';
  try {
    return respond({ ok: false, error: 'Unknown action: ' + action });
  } catch(err) {
    return respond({ ok: false, error: err.message });
  }
}

/* ---- Entry point: POST (invites + notifications + vacancies + claudio (door shut)) ----- */
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch(err) { body = {}; }
  var action = body.action || '';
  try {
    /* Invite flow. validateInvite/consumeInvite removed 16/08/2026 — invite
       acceptance is the Cloud Function consumeInvite (functions/account.js);
       the GAS routes had no caller but stayed reachable on the public URL. */
    if (action === 'sendInvite')     return respond(sendInvite(body));
    /* Notification flow */
    if (action === 'notifyAdmin')    return respond(notifyAdmin(body));
    if (action === 'confirmRequest') return respond(confirmRequest(body));
    if (action === 'sendApproval')   return respond(sendApproval(body));
    if (action === 'sendRejection')  return respond(sendRejection(body));
    /* Vacancies */
    if (action === 'uwPromo_uploadNotify')   return respond(uwPromoUploadNotify(body));

    if (action === 'vacancies_requestCode')  return vacRequestCode(body);
    if (action === 'vacancies_validateCode') return vacValidateCode(body);
    if (action === 'vacancies_submit')       return vacSubmit(body);
    if (action === 'vacancies_submitAuthed') return vacSubmitAuthed(body);
    /* AI proxies — DISABLED 15/08/2026.
       Each of these forwards to Anthropic using a key held in Script
       Properties, from a web app that is public by construction. While the
       tools in front of them are off the portal, the endpoints are cost-abuse
       surface and nothing else: anyone who knows the /exec URL can spend the
       key. The kill switch was written into the migration plan for exactly
       this situation (Phase 0, "if you want zero AI-proxy exposure").

         claudio                parked. Returning in some form, so the
                                handler stays; only the door is shut.
         chaseEmail             chase-hq fully retired 15/08/2026 — handler
                                file deleted (system/retired/chase-hq.md).
         generateMeetingMinutes meeting-notes retired 15/08/2026, handler
                                deleted with it.

       Uncomment claudio when the tool comes back — ideally as a Cloud
       Function with native auth, per Phase 3. */
    // if (action === 'claudio')        return respond(claudioChat(body));

    return respond({ ok: false, error: 'Unknown action: ' + action });
  } catch(err) {
    return respond({ ok: false, error: err.message });
  }
}
