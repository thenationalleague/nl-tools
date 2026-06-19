/**
 * ============================================================================
 * Programme Packs — GAS handlers
 * ============================================================================
 * Add this file to the existing consolidated GAS project as ProgrammePacks.gs
 *
 * Required Script Properties (already set for the existing project):
 *   RTDB_URL              — Firebase RTDB URL
 *   RTDB_SECRET           — Firebase RTDB legacy secret
 *
 * Required NEW Script Property to set before bootstrap:
 *   PROGRAMME_PACKS_DRIVE_ROOT_ID  — Drive folder ID where the tool's tree lives
 *     Create a folder in Drive called "NL Programme Packs" first, copy its ID
 *     from the URL (the long string after /folders/), set this property to it.
 *
 * Add to doPost router (Code.gs):
 *   if (action === 'pp_bootstrap')       return pp_bootstrap(body);
 *   if (action === 'pp_upload')          return pp_upload(body);
 *   if (action === 'pp_upload_begin')    return pp_upload_begin(body);
 *   if (action === 'pp_upload_chunk')    return pp_upload_chunk(body);
 *   if (action === 'pp_download')        return pp_download(body);
 *   if (action === 'pp_download_link')   return pp_download_link(body);
 *   if (action === 'pp_preview')         return pp_preview(body);
 *   if (action === 'pp_list_folder')     return pp_list_folder(body);
 *   (plus pp_thumbnails, pp_zip, pp_delete, pp_reconcile_folder, pp_nlf_* as before)
 *   One-off from the editor: run pp_setupShareCleanupTrigger() once to install
 *   the 15-min trigger that re-locks temp-shared download files.
 *
 * NOTE: This file uses the existing Utils.gs helpers respond(), rtdbRead() and
 * rtdbWrite() — but wraps the latter two in private pp_read_/pp_write_ helpers
 * because the existing API takes (full_url, secret) and returns {ok,data}, while
 * the rest of this file is simpler with path-based calls that throw on error.
 *
 * ----------------------------------------------------------------------------
 * RTDB KEY — this tool's data lives under app-data/media-programme-packs.
 * The tool was recategorised ops -> media; the web page, the portal registry
 * and the RTDB security rules all use 'media-programme-packs'. This file MUST
 * use the same key or the server half writes/reads a different (empty) subtree
 * than the UI renders — which is exactly what caused deleted-in-Drive files to
 * persist in the UI ("ghost" files), and pp_delete / pp_reconcile_folder to
 * fail with "File not found" / "Folder mapping not found". See v0.9 changelog.
 * ----------------------------------------------------------------------------
 * ============================================================================
 */


/**
 * Returns this tool's GAS changelog (mirrors the get-changelog pattern from
 * other tools — stored as a function not a comment so the script can self-report).
 */
function pp_getChangelog() {
  return [
    {
      version: 'v1.5',
      date:    '19 June 2026',
      changes: [
        'pp_purge_legacy_folders: one-shot editor function to clean up old Drive subfolders (and their files + orphaned /files records) left behind when folders-config was slimmed. Dry-run by default; skips NL Assets. Run after pp_bootstrap.'
      ]
    },
    {
      version: 'v1.4',
      date:    '19 June 2026',
      changes: [
        'pp_list_folder now also returns driveFolderId — powers an admin/superadmin "Open in Drive" button in the folder view so they can jump straight to the underlying Drive folder to investigate.',
        'PERF: pp_list_folder no longer reads the entire /files RTDB tree on every folder-open. That enrichment (uploader/description) was unused by the page (it renders detail from STATE.files), and on a large library that read was the bulk of the open latency. It now returns just the Drive listing.'
      ]
    },
    {
      version: 'v1.3',
      date:    '19 June 2026',
      changes: [
        'Phase 3 (big-file download). New pp_download_link: for files too large for the base64 pp_download path, briefly sets the Drive file to ANYONE_WITH_LINK and returns a direct uc?export=download URL so the browser pulls bytes straight from Drive (none through GAS). pp_cleanupTempShares (15-min time trigger, installed via pp_setupShareCleanupTrigger) re-locks anything shared more than 15 min ago. Brief, unguessable, auto-revoked — same trade-off pp_zip already makes. Files under the client threshold keep the fully-private base64 path.'
      ]
    },
    {
      version: 'v1.2',
      date:    '19 June 2026',
      changes: [
        'Phase 2b (chunked upload, replaces the v1.1 direct-PUT approach). The v1.1 pp_upload_init/pp_upload_finalize had the browser PUT straight to the Drive resumable session — but Drive session URLs reject cross-origin browser PUTs (no CORS headers), so that path could never work from the page. Replaced with pp_upload_begin + pp_upload_chunk: the browser streams 8MB slices to GAS, which relays each to the resumable session server-side (no CORS in play) with the Content-Range header. Each chunk is its own call, so there is no single-request size or 6-minute limit. On the final chunk GAS writes the RTDB record. Files still land directly in the owner\'s Drive folder and are never shared.',
        'Session state between chunks is held in CacheService (6h) keyed by an uploadId; only the user who began an upload may push its chunks.'
      ]
    },
    {
      version: 'v1.1',
      date:    '19 June 2026',
      changes: [
        'Phase 2 (resumable upload, SUPERSEDED by v1.2). Added pp_upload_init + pp_upload_finalize for browser-direct PUT to a Drive resumable session. Withdrawn because Drive session URLs are not CORS-enabled for browser PUTs — see v1.2.'
      ]
    },
    {
      version: 'v1.0',
      date:    '19 June 2026',
      changes: [
        'Phase 1 (live listing) groundwork. New pp_list_folder: lists a folder straight from Drive (non-trashed only) and joins each file to its RTDB record for uploader/description. This is the source the page will render from instead of the RTDB /files mirror, so files removed from Drive can no longer appear as "ghosts" — the list IS Drive.',
        'pp_download / pp_preview / pp_delete now accept an optional driveFileId and act on it directly when no RTDB fileId is given. Lets the page operate on files that exist in Drive but have no /files record (e.g. dropped straight into Drive), which the live list surfaces.'
      ]
    },
    {
      version: 'v0.9',
      date:    '19 June 2026',
      changes: [
        'FIX (ghost files): repointed every RTDB read/write from app-data/ops-programme-packs to app-data/media-programme-packs. The tool was recategorised ops -> media (page, registry, rules and the live data all moved), but this GAS file was left on the old key. Result: the server half operated on an empty subtree while the page rendered the media- snapshot — so files removed from Drive never got pruned (reconcile/pp_delete errored against the dead key), and new uploads/deletes silently targeted the wrong place. Aligning the key makes pp_delete and pp_reconcile_folder operate on the same records the UI shows.'
      ]
    },
    {
      version: 'v0.8',
      date:    '25 April 2026',
      changes: [
        'pp_thumbnails: batched version of pp_thumbnail (up to 20 per call). Browser fetches thumbnails in groups instead of one-by-one — ~5x faster grid loads.',
        'pp_reconcile_folder: scans a single Drive folder against RTDB. Imports unknown Drive files into RTDB, marks files-missing-from-Drive as deleted, syncs renamed Drive files back to RTDB. Admin-only.',
        'pp_download self-heals: if Drive\'s filename differs from RTDB\'s stored name (someone renamed in Drive), patch RTDB silently before returning the file.'
      ]
    },
    {
      version: 'v0.7',
      date:    '25 April 2026',
      changes: [
        'pp_zip rewritten — now saves zip to Drive in _trash/zips/ and returns a direct-download URL instead of base64. Cap raised: 30→100 files, 50MB→250MB. Faster, no JS heavy lifting in browser.',
        'pp_cleanupTempZips: hourly trigger that deletes zip stages older than 1h. Setup once via pp_setupCleanupTrigger() from GAS editor.',
        'pp_delete: hard-delete a file (Drive setTrashed + RTDB remove). Drive\'s 30-day trash provides recovery.',
        'pp_purge_orphans: one-shot admin cleanup of legacy soft-deleted records (isDeleted: true) left over from earlier soft-delete behaviour.'
      ]
    },
    {
      version: 'v0.6',
      date:    '25 April 2026',
      changes: [
        'pp_zip handler — server-side ZIP build for "Download all" / pack-level downloads. Uses Utilities.zip(). Caps at 30 files / 50MB uncompressed; rejects above that with a friendly error.'
      ]
    },
    {
      version: 'v0.5',
      date:    '25 April 2026',
      changes: [
        'pp_thumbnail handler — uses Drive\'s native getThumbnail() for fast small image previews. Returns ok:false for files Drive can\'t thumbnail (rare edge cases).'
      ]
    },
    {
      version: 'v0.4',
      date:    '25 April 2026',
      changes: [
        'NL Assets folder tree: pp_nlf_create / pp_nlf_rename / pp_nlf_delete admin-only handlers.',
        'pp_upload now routes to NL Assets path when clubKey === "_nl-central" — looks up driveFolderId from nl-assets-folders/{folderKey} instead of folder-ids/{clubKey}/{folderKey}.',
        'Hard-delete cascades: deleting a folder also marks all files in subtree isDeleted (no admin restore), and trashes the Drive folder which removes its contents.',
        'Max nesting depth: 3 levels.'
      ]
    },
    {
      version: 'v0.3',
      date:    '25 April 2026',
      changes: [
        'Fix: pp_upload permission check now slugifies user.club before comparing to body.clubKey. Was rejecting all club-rep uploads because session.club is stored as display name ("Darlington") while the tool sends slugs ("darlington").'
      ]
    },
    {
      version: 'v0.2',
      date:    '25 April 2026',
      changes: [
        'Fixed RTDB call shape — wraps existing utils rtdbRead/rtdbWrite (which take url+secret and return {ok,data}) with private path-based helpers.',
        'Bootstrap subfolders now actually create.'
      ]
    },
    {
      version: 'v0.1',
      date:    '25 April 2026',
      changes: [
        'Initial Phase 0 build: bootstrap, upload, download, preview handlers added.',
        'Bootstrap creates 72 club folders + 8 seeded subfolders inside each + _trash subfolder.',
        'No tool UI yet — handlers tested via curl from terminal.'
      ]
    }
  ];
}


/* ============================================================================
   TOOL DATA PATH
   ============================================================================
   Single source of truth for this tool's RTDB root. Every read/write below
   builds on PP_DATA. Keep this in lockstep with the web page's
   TOOL_DATA_PATH (programme-packs/index.html) and NL_TOOL_KEY — all three are
   'media-programme-packs'.
   ============================================================================ */
var PP_DATA = 'app-data/media-programme-packs';


/* ============================================================================
   PRIVATE RTDB WRAPPERS
   ============================================================================
   Existing Utils.gs rtdbRead/rtdbWrite take (full_url, secret) and return
   { ok, data } / { ok, error } objects. These wrappers let the rest of this
   file call them with just a path, matching the simpler convention used in
   the handler logic. Throws on error so callers can use try/catch.
   ============================================================================ */

function pp_rtdbUrl_(path) {
  var base = PropertiesService.getScriptProperties().getProperty('RTDB_URL');
  if (!base) throw new Error('RTDB_URL Script Property not set');
  // Normalise: strip leading slash from path, ensure base has no trailing slash
  base = base.replace(/\/$/, '');
  path = path.replace(/^\//, '');
  return base + '/' + path + '.json';
}

function pp_secret_() {
  var s = PropertiesService.getScriptProperties().getProperty('RTDB_SECRET');
  if (!s) throw new Error('RTDB_SECRET Script Property not set');
  return s;
}

/* Read a path. Returns the data directly (or null if path is empty).
   Throws on transport / permission error. */
function pp_read_(path) {
  var result = rtdbRead(pp_rtdbUrl_(path), pp_secret_());
  if (!result.ok) throw new Error('RTDB read failed for ' + path + ': ' + result.error);
  return result.data;  // can be null if path is empty
}

/* Write data at a path (PUT — replaces). Throws on error. */
function pp_write_(path, value) {
  var result = rtdbWrite(pp_rtdbUrl_(path), value, pp_secret_());
  if (!result.ok) throw new Error('RTDB write failed for ' + path + ': ' + result.error);
  return result;
}


/* ============================================================================
   1. BOOTSTRAP
   ============================================================================
   One-off function. Run from script editor: Run > pp_bootstrap (no body).
   Reads clubs-meta.json, creates Drive folder tree, writes folder IDs to RTDB.

   Idempotent: re-running picks up missing folders, doesn't duplicate existing.
   ============================================================================ */

function pp_bootstrap(body) {
  // body is optional — function can be invoked from editor without a body.
  // If invoked via doPost, body will exist with action='pp_bootstrap'.

  var rootId = PropertiesService.getScriptProperties().getProperty('PROGRAMME_PACKS_DRIVE_ROOT_ID');
  if (!rootId) {
    return respond({ ok: false, error: 'PROGRAMME_PACKS_DRIVE_ROOT_ID Script Property not set. Create folder in Drive, paste its ID into Project Settings > Script Properties.' });
  }

  var rootFolder;
  try { rootFolder = DriveApp.getFolderById(rootId); }
  catch (e) { return respond({ ok: false, error: 'Could not access Drive folder ' + rootId + ': ' + e.message }); }

  // Pull clubs-meta.json from GitHub
  var clubs;
  try {
    var resp = UrlFetchApp.fetch('https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/data/clubs-meta.json');
    var clubsData = JSON.parse(resp.getContentText());
    clubs = clubsData.clubs;
  } catch (e) {
    return respond({ ok: false, error: 'Could not fetch clubs-meta.json: ' + e.message });
  }

  // Pull folder templates from RTDB (must already be seeded — see 03-folder-templates.json)
  var folderTemplates;
  try { folderTemplates = pp_read_(PP_DATA + '/folders-config'); }
  catch (e) { return respond({ ok: false, error: 'Could not read folder templates: ' + e.message }); }

  if (!folderTemplates || typeof folderTemplates !== 'object') {
    return respond({ ok: false, error: 'No folders-config in RTDB. Seed /' + PP_DATA + '/folders-config/ first.' });
  }

  var folderKeys = Object.keys(folderTemplates).filter(function(k) {
    return k !== '_comment' && folderTemplates[k] && folderTemplates[k].isSeeded;
  });

  // Build the tree
  var folderIdsByClub = {};   // { clubKey: { folderKey: driveId, _root: clubFolderDriveId } }
  var report = { clubsCreated: 0, clubsSkipped: 0, foldersCreated: 0, errors: [] };

  // 0. Ensure _trash folder exists at root
  var trashId = pp_findOrCreateFolder_(rootFolder, '_trash');

  // 1. Add NL Central as a virtual club
  var nlCentralKey = '_nl-central';
  var allClubKeys = [nlCentralKey].concat(clubs.map(function(c) { return pp_clubKey_(c.name); }));

  // For NL Central we use a placeholder name
  var clubNameByKey = { '_nl-central': 'NL Central' };
  clubs.forEach(function(c) { clubNameByKey[pp_clubKey_(c.name)] = c.name; });

  for (var i = 0; i < allClubKeys.length; i++) {
    var clubKey = allClubKeys[i];
    var clubName = clubNameByKey[clubKey];
    var existingClubFolder;
    var clubFolderName = clubKey === '_nl-central' ? '_NL Central' : clubName;

    try {
      existingClubFolder = pp_findOrCreateFolder_(rootFolder, clubFolderName);
      if (!folderIdsByClub[clubKey]) folderIdsByClub[clubKey] = {};
      folderIdsByClub[clubKey]._root = existingClubFolder.getId();

      // Create each seeded folder inside the club folder
      for (var j = 0; j < folderKeys.length; j++) {
        var fk = folderKeys[j];
        var fName = folderTemplates[fk].name;
        var sub = pp_findOrCreateFolder_(existingClubFolder, fName);
        folderIdsByClub[clubKey][fk] = sub.getId();
        report.foldersCreated++;
      }
      report.clubsCreated++;
    } catch (e) {
      report.errors.push({ club: clubName, error: e.message });
      report.clubsSkipped++;
    }

    // Yield to avoid 6-min timeout on a 72-club run
    if (i % 10 === 0 && i > 0) Utilities.sleep(50);
  }

  // 2. Write the lookup table to RTDB
  try {
    pp_write_(PP_DATA + '/folder-ids', folderIdsByClub);
    pp_write_(PP_DATA + '/_trash-id', trashId.getId());
  } catch (e) {
    return respond({ ok: false, error: 'Drive tree built but RTDB write failed: ' + e.message, report: report });
  }

  // 3. Write a bootstrap audit entry
  pp_audit_('bootstrap_run', {
    userUid: 'system',
    userName: 'Bootstrap script',
    detail: 'Created/verified ' + report.foldersCreated + ' folders across ' + report.clubsCreated + ' clubs'
  });

  return respond({
    ok: true,
    message: 'Bootstrap complete',
    report: report,
    rootFolderId: rootId,
    trashFolderId: trashId.getId()
  });
}


/* ============================================================================
   2. UPLOAD
   ============================================================================
   Body:
     idToken     — Firebase ID token (verified server-side)
     clubKey     — destination club
     folderKey   — destination folder (must exist in folder-ids)
     filename    — original filename
     mimeType    — file mime type
     dataB64     — base64-encoded file content (max ~25MB)
     description — optional

   Returns:
     { ok: true, fileId, driveFileId, folderId }
   ============================================================================ */

function pp_upload(body) {
  // 1. Verify identity
  var verified = pp_verifyToken_(body.idToken);
  if (!verified.ok) return respond({ ok: false, error: 'Auth failed: ' + verified.error });
  var user = verified.user;  // { uid, email, claims, role, club }

  // 2. Permission check — depends on destination:
  //    - Club folder:  must be admin OR own-club rep
  //    - NL Assets:    must be admin/superadmin
  //    Tolerates user.club being display name ("Darlington") vs slug ("darlington").
  var userClubSlug = user.club ? pp_clubKey_(user.club) : null;
  var isAdmin = (user.role === 'superadmin' || user.role === 'admin');
  var canUpload;
  if (body.clubKey === '_nl-central') {
    canUpload = isAdmin;
    if (!canUpload) {
      return respond({ ok: false, error: 'Only NL admins can upload to National League Assets' });
    }
  } else {
    canUpload = isAdmin || (userClubSlug && userClubSlug === body.clubKey);
    if (!canUpload) {
      return respond({ ok: false, error: 'Not permitted to upload to ' + body.clubKey + ' (your club: ' + (user.club || 'none') + ')' });
    }
  }

  // 3. Validate inputs
  if (!body.clubKey || !body.folderKey || !body.filename || !body.dataB64) {
    return respond({ ok: false, error: 'Missing required fields: clubKey, folderKey, filename, dataB64' });
  }

  // 4. Resolve target Drive folder.
  //    Two lookup paths depending on whether this is a club or NL Assets upload:
  //    - Club uploads:    folder-ids/{clubKey}/{folderKey}
  //    - NL Assets:       nl-assets-folders/{folderKey}/driveFolderId
  var targetFolder;
  if (body.clubKey === '_nl-central') {
    /* NL Assets — folderKey is an nl-assets-folders push key */
    var nlf = pp_read_(PP_DATA + '/nl-assets-folders/' + body.folderKey);
    if (!nlf || !nlf.driveFolderId) {
      return respond({ ok: false, error: 'NL Assets folder not found: ' + body.folderKey });
    }
    try { targetFolder = DriveApp.getFolderById(nlf.driveFolderId); }
    catch (e) { return respond({ ok: false, error: 'Drive folder access failed: ' + e.message }); }
  } else {
    /* Club upload — use the bootstrap-populated folder-ids table */
    var folderIds = pp_read_(PP_DATA + '/folder-ids/' + body.clubKey);
    if (!folderIds || !folderIds[body.folderKey]) {
      return respond({ ok: false, error: 'Drive folder not found for ' + body.clubKey + '/' + body.folderKey + '. Run pp_bootstrap.' });
    }
    try { targetFolder = DriveApp.getFolderById(folderIds[body.folderKey]); }
    catch (e) { return respond({ ok: false, error: 'Drive folder access failed: ' + e.message }); }
  }

  // 5. Decode and create the file
  var bytes;
  try { bytes = Utilities.base64Decode(body.dataB64); }
  catch (e) { return respond({ ok: false, error: 'Base64 decode failed: ' + e.message }); }

  if (bytes.length > 25 * 1024 * 1024) {
    return respond({ ok: false, error: 'File too large (max 25MB). Got ' + Math.round(bytes.length/1024/1024) + 'MB.' });
  }

  var blob = Utilities.newBlob(bytes, body.mimeType || 'application/octet-stream', body.filename);
  var driveFile;
  try { driveFile = targetFolder.createFile(blob); }
  catch (e) { return respond({ ok: false, error: 'Drive create failed: ' + e.message }); }

  // 6. Write metadata to RTDB
  var fileId = pp_pushKey_();
  var now = Date.now();
  var meta = {
    clubKey:        body.clubKey,
    folderKey:      body.folderKey,
    name:           body.filename,
    size:           bytes.length,
    mimeType:       body.mimeType || 'application/octet-stream',
    type:           pp_typeFromMime_(body.mimeType),
    driveFileId:    driveFile.getId(),
    uploadedBy:     user.uid,
    uploadedByName: user.email,
    uploadedAt:     now,
    lastModifiedAt: now,
    lastModifiedBy: user.uid,
    description:    body.description || '',
    isDeleted:      false
  };
  try { pp_write_(PP_DATA + '/files/' + fileId, meta); }
  catch (e) {
    // Roll back the Drive file if metadata write fails
    try { driveFile.setTrashed(true); } catch (ignore) {}
    return respond({ ok: false, error: 'Metadata write failed (Drive file removed): ' + e.message });
  }

  // 7. Audit
  pp_audit_('uploaded', {
    userUid: user.uid,
    userName: user.email,
    fileId: fileId,
    fileName: body.filename,
    clubKey: body.clubKey,
    folderKey: body.folderKey
  });

  return respond({
    ok: true,
    fileId: fileId,
    driveFileId: driveFile.getId(),
    folderId: targetFolder.getId()
  });
}


/* ============================================================================
   2b. CHUNKED UPLOAD (Phase 2b) — for files too big for base64-through-GAS
   ============================================================================
   pp_upload's base64 path is capped ~25MB (base64 inflation + GAS POST limit).
   For larger files the browser streams the file to GAS in chunks, and GAS
   relays each chunk to a Drive resumable session it drives server-side.

   Why relayed through GAS (not browser->Drive directly): Drive's resumable
   session URLs reject cross-origin PUTs from a browser (no CORS headers), so a
   direct browser upload is impossible. Routing through GAS sidesteps CORS
   entirely — browser<->GAS works, and GAS<->Google is server-to-server.
   Because each chunk is its own GAS call, there is no single-request size or
   6-minute limit; arbitrarily large files work.

   Flow:
     1. pp_upload_begin  — auth + permission, mint a Drive resumable session,
                           stash it in CacheService under an uploadId, return it.
     2. pp_upload_chunk  — (called per 8MB slice) decode the chunk and PUT it to
                           the session with the resumable Content-Range header.
                           Drive answers 308 until the last chunk, then 200/201;
                           on completion GAS writes the RTDB record.

   The file lands directly in the owner's Drive folder — it is NEVER shared, so
   privacy is identical to the base64 path. Only the transport differs.

   Chunk size must be a multiple of 256KB (Drive requirement) for every chunk
   except the last. The client uses 8MB (= 32 x 256KB).
   ============================================================================ */

var PP_UPLOAD_CHUNK = 8 * 1024 * 1024;   /* 8MB — advertised to the client */

/* Resolve a (clubKey, folderKey) to its Drive folder ID. Shared by the
   chunked handlers. Returns { ok, folderId } or { ok:false, error }. */
function pp_resolveTargetFolderId_(clubKey, folderKey) {
  if (clubKey === '_nl-central') {
    var nlf = pp_read_(PP_DATA + '/nl-assets-folders/' + folderKey);
    if (!nlf || !nlf.driveFolderId) return { ok: false, error: 'NL Assets folder not found' };
    return { ok: true, folderId: nlf.driveFolderId };
  }
  var folderIds = pp_read_(PP_DATA + '/folder-ids/' + clubKey);
  if (!folderIds || !folderIds[folderKey]) {
    return { ok: false, error: 'Folder mapping not found for ' + clubKey + '/' + folderKey + '. Run pp_bootstrap?' };
  }
  return { ok: true, folderId: folderIds[folderKey] };
}

/* Permission check shared by the chunked handlers — mirrors pp_upload: NL
   Assets is admin-only, club folders allow admins or own-club reps (tolerates
   user.club being a display name vs slug). */
function pp_canUploadTo_(user, clubKey) {
  var isAdmin = (user.role === 'superadmin' || user.role === 'admin');
  if (clubKey === '_nl-central') {
    return isAdmin ? { ok: true } : { ok: false, error: 'Only NL admins can upload to National League Assets' };
  }
  var userClubSlug = user.club ? pp_clubKey_(user.club) : null;
  if (isAdmin || (userClubSlug && userClubSlug === clubKey)) return { ok: true };
  return { ok: false, error: 'Not permitted to upload to ' + clubKey + ' (your club: ' + (user.club || 'none') + ')' };
}

/* Body: { idToken, clubKey, folderKey, filename, mimeType, totalSize }
   Returns: { ok, uploadId, chunkSize } */
function pp_upload_begin(body) {
  var verified = pp_verifyToken_(body.idToken);
  if (!verified.ok) return respond({ ok: false, error: 'Auth failed: ' + verified.error });
  var user = verified.user;

  if (!body.clubKey || !body.folderKey || !body.filename || !body.totalSize) {
    return respond({ ok: false, error: 'Missing required fields: clubKey, folderKey, filename, totalSize' });
  }
  var perm = pp_canUploadTo_(user, body.clubKey);
  if (!perm.ok) return respond({ ok: false, error: perm.error });

  var target = pp_resolveTargetFolderId_(body.clubKey, body.folderKey);
  if (!target.ok) return respond({ ok: false, error: target.error });

  /* Mint the resumable session with the script's own Drive OAuth token. */
  var mime = body.mimeType || 'application/octet-stream';
  var meta = { name: body.filename, parents: [target.folderId] };
  var init = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id',
    {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
        'X-Upload-Content-Type': mime
      },
      payload: JSON.stringify(meta),
      muteHttpExceptions: true
    }
  );
  if (init.getResponseCode() !== 200) {
    return respond({ ok: false, error: 'Resumable init failed (' + init.getResponseCode() + '): ' + init.getContentText() });
  }
  var headers = init.getHeaders();
  var sessionUrl = headers['Location'] || headers['location'];
  if (!sessionUrl) return respond({ ok: false, error: 'Drive returned no upload session URL' });

  /* Stash session state for the chunk calls. CacheService (6h) is plenty for an
     in-progress upload; if evicted mid-flight the upload fails and the user
     retries. Value is tiny (URLs + a few fields), well under the 100KB cap. */
  var uploadId = pp_pushKey_();
  var state = {
    sessionUrl:     sessionUrl,
    folderId:       target.folderId,
    clubKey:        body.clubKey,
    folderKey:      body.folderKey,
    filename:       body.filename,
    mimeType:       mime,
    totalSize:      Number(body.totalSize),
    description:    body.description || '',
    uploadedBy:     user.uid,
    uploadedByName: user.email
  };
  CacheService.getScriptCache().put('ppupl_' + uploadId, JSON.stringify(state), 21600);

  return respond({ ok: true, uploadId: uploadId, chunkSize: PP_UPLOAD_CHUNK });
}

/* Body: { idToken, uploadId, offset, dataB64 }
   Returns (mid-upload): { ok, done:false, received }
   Returns (final chunk): { ok, done:true, fileId, driveFileId, size } */
function pp_upload_chunk(body) {
  var verified = pp_verifyToken_(body.idToken);
  if (!verified.ok) return respond({ ok: false, error: 'Auth failed: ' + verified.error });
  var user = verified.user;

  if (!body.uploadId || body.offset == null || !body.dataB64) {
    return respond({ ok: false, error: 'Missing required fields: uploadId, offset, dataB64' });
  }

  var cache = CacheService.getScriptCache();
  var raw = cache.get('ppupl_' + body.uploadId);
  if (!raw) return respond({ ok: false, error: 'Upload session expired or unknown — please restart the upload' });
  var state = JSON.parse(raw);

  /* Only the user who began the upload may push chunks to it. */
  if (state.uploadedBy !== user.uid) {
    return respond({ ok: false, error: 'This upload belongs to another user' });
  }

  var bytes;
  try { bytes = Utilities.base64Decode(body.dataB64); }
  catch (e) { return respond({ ok: false, error: 'Base64 decode failed: ' + e.message }); }

  var offset = Number(body.offset);
  var total  = state.totalSize;
  var end    = offset + bytes.length - 1;

  /* PUT this slice to the resumable session. No Authorization header — the
     session URL itself authorises. followRedirects:false so the 308 "Resume
     Incomplete" comes back to us instead of being chased. */
  var resp = UrlFetchApp.fetch(state.sessionUrl, {
    method: 'put',
    contentType: state.mimeType,
    headers: { 'Content-Range': 'bytes ' + offset + '-' + end + '/' + total },
    payload: bytes,
    followRedirects: false,
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();

  if (code === 308) {
    /* More to come. Drive's Range header reports bytes stored; fall back to end+1. */
    return respond({ ok: true, done: false, received: end + 1 });
  }

  if (code === 200 || code === 201) {
    /* Upload complete — Drive returns the file resource (fields=id). */
    var fileMeta;
    try { fileMeta = JSON.parse(resp.getContentText()); }
    catch (e) { return respond({ ok: false, error: 'Upload finished but Drive response was unreadable: ' + e.message }); }
    var driveFileId = fileMeta.id;
    if (!driveFileId) return respond({ ok: false, error: 'Upload finished but Drive returned no file id' });

    /* Authoritative size/mime from Drive; also re-confirms the file is real. */
    var driveFile;
    try { driveFile = DriveApp.getFileById(driveFileId); }
    catch (e) { return respond({ ok: false, error: 'Uploaded file not found after completion: ' + e.message }); }

    var size = driveFile.getSize();
    var mime = driveFile.getMimeType();
    var fileId = pp_pushKey_();
    var now = Date.now();
    var meta = {
      clubKey:        state.clubKey,
      folderKey:      state.folderKey,
      name:           state.filename,
      size:           size,
      mimeType:       mime,
      type:           pp_typeFromMime_(mime),
      driveFileId:    driveFileId,
      uploadedBy:     state.uploadedBy,
      uploadedByName: state.uploadedByName,
      uploadedAt:     now,
      lastModifiedAt: now,
      lastModifiedBy: state.uploadedBy,
      description:    state.description || '',
      isDeleted:      false,
      uploadMethod:   'chunked'
    };
    try { pp_write_(PP_DATA + '/files/' + fileId, meta); }
    catch (e) {
      try { driveFile.setTrashed(true); } catch (ignore) {}
      return respond({ ok: false, error: 'Metadata write failed (Drive file removed): ' + e.message });
    }

    cache.remove('ppupl_' + body.uploadId);

    pp_audit_('uploaded', {
      userUid: state.uploadedBy, userName: state.uploadedByName, fileId: fileId,
      fileName: state.filename, clubKey: state.clubKey, folderKey: state.folderKey,
      via: 'chunked', size: size
    });

    return respond({ ok: true, done: true, fileId: fileId, driveFileId: driveFileId, size: size });
  }

  /* Any other code is a real failure. */
  return respond({ ok: false, error: 'Chunk upload failed (HTTP ' + code + '): ' + resp.getContentText() });
}


/* ============================================================================
   3. DOWNLOAD
   ============================================================================
   Body:
     idToken — Firebase ID token
     fileId  — RTDB file ID

   Returns:
     { ok: true, url, expiresAt }
       url is a signed Drive download URL valid for ~5 minutes
   ============================================================================ */

function pp_download(body) {
  var verified = pp_verifyToken_(body.idToken);
  if (!verified.ok) return respond({ ok: false, error: 'Auth failed: ' + verified.error });

  /* Accept either an RTDB fileId or a driveFileId (live-listing path). */
  var resolved = pp_resolveFile_(body);
  if (!resolved.ok) return respond({ ok: false, error: resolved.error });
  var meta = resolved.meta;  /* may be null when called by driveFileId */

  var driveFile;
  try { driveFile = DriveApp.getFileById(resolved.driveFileId); }
  catch (e) { return respond({ ok: false, error: 'Drive file access failed: ' + e.message }); }

  /* Self-healing: if a matching RTDB record exists and Drive's name has drifted
     from it (renamed directly in Drive), patch RTDB silently. */
  var driveName = driveFile.getName();
  if (meta && meta._id && driveName && driveName !== meta.name) {
    try {
      pp_write_(PP_DATA + '/files/' + meta._id + '/name', driveName);
      pp_write_(PP_DATA + '/files/' + meta._id + '/lastReconciledAt', Date.now());
      meta.name = driveName;
    } catch (e) { /* swallow — the download still works regardless */ }
  }

  var blob = driveFile.getBlob();
  var b64 = Utilities.base64Encode(blob.getBytes());

  return respond({
    ok: true,
    filename: (meta && meta.name) || driveName,
    mimeType: (meta && meta.mimeType) || driveFile.getMimeType(),
    size: (meta && meta.size) || driveFile.getSize(),
    dataB64: b64
  });
}


/* ============================================================================
   3b. BIG-FILE DOWNLOAD (Phase 3) — temp link-and-revoke
   ============================================================================
   pp_download base64-encodes the whole file through GAS, which fails for large
   files (base64 inflation + GAS response/memory limits) — the same wall uploads
   hit. For files over the client's threshold, the page asks for a temporary
   direct-download link instead:

     1. pp_download_link  — auth, briefly set the Drive file to ANYONE_WITH_LINK,
                            record it under /shared-temp, return a direct
                            uc?export=download URL. The browser downloads straight
                            from Drive's CDN (no bytes through GAS).
     2. pp_cleanupTempShares — a time-driven trigger re-locks (sets PRIVATE) any
                            file shared more than ~15 min ago and clears the
                            record. Install once via pp_setupShareCleanupTrigger().

   The exposure is brief, via an unguessable URL, and auto-revoked — the same
   trade-off pp_zip already makes for bulk downloads. Files under the threshold
   never get shared (they keep the fully-private base64 path).
   ============================================================================ */

/* Body: { idToken, fileId | driveFileId }
   Returns: { ok, downloadUrl, filename, driveFileId } */
function pp_download_link(body) {
  var verified = pp_verifyToken_(body.idToken);
  if (!verified.ok) return respond({ ok: false, error: 'Auth failed: ' + verified.error });

  var resolved = pp_resolveFile_(body);
  if (!resolved.ok) return respond({ ok: false, error: resolved.error });
  var driveFileId = resolved.driveFileId;
  var meta = resolved.meta;

  var file;
  try { file = DriveApp.getFileById(driveFileId); }
  catch (e) { return respond({ ok: false, error: 'Drive file access failed: ' + e.message }); }

  /* Self-healing rename (same as pp_download) so the link serves the right name. */
  var driveName = file.getName();
  if (meta && meta._id && driveName && driveName !== meta.name) {
    try {
      pp_write_(PP_DATA + '/files/' + meta._id + '/name', driveName);
      meta.name = driveName;
    } catch (e) { /* swallow */ }
  }

  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) { return respond({ ok: false, error: 'Could not create download link: ' + e.message }); }

  /* Record so the cleanup trigger can re-lock it even if the user vanishes. */
  try {
    pp_write_(PP_DATA + '/shared-temp/' + driveFileId, { sharedAt: Date.now(), by: verified.user.uid });
  } catch (e) { /* non-fatal — trigger also re-locks anything ANYONE-shared it finds */ }

  pp_audit_('download_link', {
    userUid: verified.user.uid, userName: verified.user.email,
    driveFileId: driveFileId, fileName: (meta && meta.name) || driveName
  });

  return respond({
    ok: true,
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + driveFileId + '&confirm=t',
    filename: (meta && meta.name) || driveName,
    driveFileId: driveFileId
  });
}

/* Time-driven trigger: re-lock (set PRIVATE) any temp-shared file older than
   ~15 minutes and clear its record. Install once via pp_setupShareCleanupTrigger(). */
function pp_cleanupTempShares() {
  try {
    var shared = pp_read_(PP_DATA + '/shared-temp') || {};
    var cutoff = Date.now() - (15 * 60 * 1000);
    var revoked = 0;
    Object.keys(shared).forEach(function(driveFileId) {
      var rec = shared[driveFileId];
      if (!rec) return;
      if ((rec.sharedAt || 0) >= cutoff) return;   /* still inside the window */
      try {
        DriveApp.getFileById(driveFileId).setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
        revoked++;
      } catch (e) { /* file may be gone; clear the record anyway */ }
      try { pp_write_(PP_DATA + '/shared-temp/' + driveFileId, null); } catch (e) { /* ignore */ }
    });
    if (revoked > 0) Logger.log('pp_cleanupTempShares: re-locked ' + revoked + ' file(s)');
  } catch (e) {
    Logger.log('pp_cleanupTempShares error: ' + e.message);
  }
}

/* Run once from the GAS editor to install the 15-minute share-cleanup trigger. */
function pp_setupShareCleanupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'pp_cleanupTempShares') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('pp_cleanupTempShares').timeBased().everyMinutes(15).create();
  Logger.log('pp_cleanupTempShares trigger installed (every 15 min)');
}


/* ============================================================================
   4. PREVIEW
   ============================================================================
   Body:
     idToken — Firebase ID token
     fileId  — RTDB file ID

   Returns:
     { ok: true, embedUrl }
       Drive's preview iframe URL. Requires the file to have a temporary
       read-by-link permission set; we set it for 10 minutes then remove.
       For Phase 0 we keep this simple — Phase 1 will refine.
   ============================================================================ */

function pp_preview(body) {
  var verified = pp_verifyToken_(body.idToken);
  if (!verified.ok) return respond({ ok: false, error: 'Auth failed: ' + verified.error });

  /* Accept either an RTDB fileId or a driveFileId (live-listing path). */
  var resolved = pp_resolveFile_(body);
  if (!resolved.ok) return respond({ ok: false, error: resolved.error });

  // Phase 0 placeholder: return the embed URL but note it requires the file
  // to be shared. The page currently falls back to pp_download for the bytes.
  return respond({
    ok: true,
    embedUrl: 'https://drive.google.com/file/d/' + resolved.driveFileId + '/preview',
    note: 'Embed URL only works if file is shared; page falls back to pp_download.'
  });
}

/* Returns a small thumbnail of the file as base64 — used by grid view in the
   browser. Drive's getThumbnail() is fast (~100-200ms) and small (~10-50KB).
   For images, PDFs, and many doc types Drive auto-generates one. For files
   without a thumbnail (some video, archive types) returns ok:false and the
   client falls back to a type icon.

   No permission check here beyond auth — read access matches pp_download.  */
function pp_thumbnail(body) {
  var verified = pp_verifyToken_(body.idToken);
  if (!verified.ok) return respond({ ok: false, error: 'Auth failed: ' + verified.error });

  var meta = pp_read_(PP_DATA + '/files/' + body.fileId);
  if (!meta) return respond({ ok: false, error: 'File not found' });
  if (meta.isDeleted) return respond({ ok: false, error: 'File has been deleted' });

  var file;
  try { file = DriveApp.getFileById(meta.driveFileId); }
  catch (e) { return respond({ ok: false, error: 'Drive access failed: ' + e.message }); }

  var thumbBlob;
  try { thumbBlob = file.getThumbnail(); }
  catch (e) { return respond({ ok: false, error: 'No thumbnail available' }); }

  if (!thumbBlob) return respond({ ok: false, error: 'No thumbnail available' });

  return respond({
    ok:       true,
    fileId:   body.fileId,
    dataB64:  Utilities.base64Encode(thumbBlob.getBytes()),
    mimeType: thumbBlob.getContentType() || 'image/png'
  });
}


/* Batched version of pp_thumbnail — fetches up to 20 thumbnails in a single
   GAS execution. Browser sends an array of fileIds, gets back an object map
   keyed by fileId. Files that fail (or have no thumbnail) come back as
   { ok: false, error: '...' } — caller falls back to type icon for those.

   Why batch: each individual call has ~200ms of GAS auth + roundtrip overhead
   on top of the ~300ms of actual thumbnail work. Batching amortises the
   overhead — 10 thumbs in one call is ~3-4x faster than 10 sequential calls.

   Cap: 20 per batch. Beyond that we risk the 6-minute execution limit on
   slow Drive responses. UI lazy-loads in batches.

   Body: { idToken, fileIds: [id, id, ...] } */
function pp_thumbnails(body) {
  var verified = pp_verifyToken_(body.idToken);
  if (!verified.ok) return respond({ ok: false, error: 'Auth failed: ' + verified.error });

  var fileIds = body.fileIds || [];
  if (!fileIds.length) return respond({ ok: false, error: 'No fileIds specified' });
  if (fileIds.length > 20) return respond({ ok: false, error: 'Max 20 thumbs per batch' });

  var allFiles = pp_read_(PP_DATA + '/files') || {};
  var results = {};

  for (var i = 0; i < fileIds.length; i++) {
    var fid = fileIds[i];
    var meta = allFiles[fid];
    if (!meta || meta.isDeleted || !meta.driveFileId) {
      results[fid] = { ok: false, error: 'File not found' };
      continue;
    }
    try {
      var driveFile = DriveApp.getFileById(meta.driveFileId);
      var thumbBlob = driveFile.getThumbnail();
      if (!thumbBlob) { results[fid] = { ok: false, error: 'No thumbnail' }; continue; }
      results[fid] = {
        ok:       true,
        dataB64:  Utilities.base64Encode(thumbBlob.getBytes()),
        mimeType: thumbBlob.getContentType() || 'image/png'
      };
    } catch (e) {
      results[fid] = { ok: false, error: e.message };
    }
  }

  return respond({ ok: true, results: results });
}


/* Build a ZIP and return a temporary Drive download URL.
   Architecture:
     1. Build zip from blobs as before
     2. Save to Drive in _trash/zips/ folder (created if missing)
     3. Set "anyone with link" sharing for direct-download access
     4. Return the direct-download URL
   The zip file lives in the bootstrap _trash folder so cleanup is trivial —
   anything older than 1 hour can be deleted by a scheduled trigger
   (pp_cleanupTempZips, see end of this file). Drive's own 30-day Trash
   cycle catches anything we miss.

   Caps: 100 files / 250MB total uncompressed. The 250MB cap is the practical
   limit on what GAS can build in a single 6-min execution; bigger packs
   should be downloaded by folder.

   Body: { idToken, fileIds: [...], zipName?: 'pack.zip' } */
function pp_zip(body) {
  var verified = pp_verifyToken_(body.idToken);
  if (!verified.ok) return respond({ ok: false, error: 'Auth failed: ' + verified.error });

  var fileIds = body.fileIds || [];
  if (!fileIds.length)            return respond({ ok: false, error: 'No files specified' });
  if (fileIds.length > 100)       return respond({ ok: false, error: 'Too many files (max 100 per zip). Download by folder.' });

  var SIZE_CAP = 250 * 1024 * 1024;   /* 250MB cap on total uncompressed bytes */
  var allFiles = pp_read_(PP_DATA + '/files') || {};

  var blobs = [];
  var totalBytes = 0;
  var skipped = [];
  var usedNames = {};

  for (var i = 0; i < fileIds.length; i++) {
    var fid = fileIds[i];
    var meta = allFiles[fid];
    if (!meta || meta.isDeleted) { skipped.push(fid); continue; }

    var driveFile;
    try { driveFile = DriveApp.getFileById(meta.driveFileId); }
    catch (e) { skipped.push(fid); continue; }

    var size = parseInt(meta.size, 10) || 0;
    if (totalBytes + size > SIZE_CAP) {
      return respond({
        ok: false,
        error: 'Files exceed 250MB total. Download by folder instead.',
        cappedAtFile: i,
        bytesSoFar: totalBytes
      });
    }

    var blob;
    try { blob = driveFile.getBlob(); }
    catch (e) { skipped.push(fid); continue; }

    /* Dedupe filenames inside the zip */
    var name = meta.name || ('file-' + fid);
    if (usedNames[name]) {
      var dot = name.lastIndexOf('.');
      var stem = dot > 0 ? name.substring(0, dot) : name;
      var ext  = dot > 0 ? name.substring(dot) : '';
      var n = 1;
      while (usedNames[stem + ' (' + n + ')' + ext]) n++;
      name = stem + ' (' + n + ')' + ext;
    }
    usedNames[name] = true;
    blob.setName(name);

    blobs.push(blob);
    totalBytes += size;
  }

  if (!blobs.length) {
    return respond({ ok: false, error: 'No valid files to zip', skipped: skipped });
  }

  /* Build the zip blob */
  var zipBlob;
  try { zipBlob = Utilities.zip(blobs, body.zipName || 'programme-pack.zip'); }
  catch (e) { return respond({ ok: false, error: 'Zip failed: ' + e.message }); }

  /* Save to Drive — in our _trash folder, under a 'zips' subfolder.
     The cleanup trigger purges these after 1 hour. */
  var zipFile;
  try {
    var trashFolder = pp_getTrashFolder_();
    var zipsFolder = pp_findOrCreateFolder_(trashFolder, 'zips');
    zipFile = zipsFolder.createFile(zipBlob);
  } catch (e) {
    return respond({ ok: false, error: 'Saving zip to Drive failed: ' + e.message });
  }

  /* Make it shareable via direct link. "Anyone with the link can view."
     The URL is unguessable — no security risk beyond someone leaking it,
     and the file disappears within 1 hour anyway. */
  try {
    zipFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    /* Fallback: even without explicit sharing, owner can download. But the
       browser would need to be signed into the same Google account, which
       won't be the case for users. Treat this as a hard failure. */
    try { zipFile.setTrashed(true); } catch (ignore) {}
    return respond({ ok: false, error: 'Could not make zip downloadable: ' + e.message });
  }

  /* Direct-download URL pattern: GET on uc?export=download&id=X returns the
     bytes with appropriate Content-Disposition. Confirmed working for files
     <100MB; for larger ones Drive may show a "scan for viruses?" interstitial,
     but appending &confirm=t works around it. */
  var fileId = zipFile.getId();
  var downloadUrl = 'https://drive.google.com/uc?export=download&id=' + fileId + '&confirm=t';

  pp_audit_('zip_downloaded', {
    userUid:    verified.user.uid,
    userName:   verified.user.email,
    fileCount:  blobs.length,
    totalBytes: totalBytes,
    skipped:    skipped.length,
    zipFileId:  fileId
  });

  return respond({
    ok:          true,
    downloadUrl: downloadUrl,
    filename:    body.zipName || 'programme-pack.zip',
    fileCount:   blobs.length,
    skipped:     skipped,
    totalBytes:  totalBytes,
    zipFileId:   fileId,
    expiresIn:   '1 hour'
  });
}

/* Resolve (or create) the _trash folder used for ZIP staging.
   Cached in /{PP_DATA}/_trash-id for fast lookup. */
function pp_getTrashFolder_() {
  var trashId = pp_read_(PP_DATA + '/_trash-id');
  if (trashId) {
    try { return DriveApp.getFolderById(trashId); }
    catch (e) { /* fall through, will recreate */ }
  }
  /* Find or create _trash inside the tool root. */
  var rootId = PropertiesService.getScriptProperties().getProperty('PROGRAMME_PACKS_DRIVE_ROOT_ID');
  if (!rootId) throw new Error('PROGRAMME_PACKS_DRIVE_ROOT_ID Script Property is missing');
  var root = DriveApp.getFolderById(rootId);
  var trash = pp_findOrCreateFolder_(root, '_trash');
  pp_write_(PP_DATA + '/_trash-id', trash.getId());
  return trash;
}

/* Time-driven trigger: deletes any temp zip file in _trash/zips/ older than
   1 hour. Set up once via pp_setupCleanupTrigger() (run from GAS editor). */
function pp_cleanupTempZips() {
  try {
    var trashFolder = pp_getTrashFolder_();
    var iter = trashFolder.getFoldersByName('zips');
    if (!iter.hasNext()) return;
    var zipsFolder = iter.next();

    var oneHourAgo = Date.now() - (60 * 60 * 1000);
    var files = zipsFolder.getFiles();
    var deleted = 0;
    while (files.hasNext()) {
      var f = files.next();
      if (f.getDateCreated().getTime() < oneHourAgo) {
        try { f.setTrashed(true); deleted++; } catch (e) { /* ignore */ }
      }
    }
    if (deleted > 0) Logger.log('pp_cleanupTempZips: trashed ' + deleted + ' old zip(s)');
  } catch (e) {
    Logger.log('pp_cleanupTempZips error: ' + e.message);
  }
}

/* Run once from GAS editor to install the hourly cleanup trigger. */
function pp_setupCleanupTrigger() {
  /* Remove any existing instances to avoid duplicates */
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'pp_cleanupTempZips') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('pp_cleanupTempZips')
    .timeBased()
    .everyHours(1)
    .create();
  Logger.log('pp_cleanupTempZips trigger installed (hourly)');
}


/* Hard-delete a file: trash the Drive file (Drive's own 30-day trash gives
   recovery), and remove the RTDB metadata.

   Called both for individual file delete (single fileId) and as the engine
   behind the orphan purge (called per fileId in a loop).

   Permission: file uploader, OR admin/superadmin. */
function pp_delete(body) {
  var verified = pp_verifyToken_(body.idToken);
  if (!verified.ok) return respond({ ok: false, error: 'Auth failed: ' + verified.error });
  var user = verified.user;

  /* Accept either an RTDB fileId or a driveFileId (live-listing path). */
  var resolved = pp_resolveFile_(body);
  if (!resolved.ok) return respond({ ok: false, error: resolved.error });
  var meta   = resolved.meta;            /* may be null (file not in /files) */
  var rtdbId = meta ? meta._id : null;
  var driveFileId = resolved.driveFileId;

  /* Permission: admins always; otherwise only the uploader (which we can only
     verify if an RTDB record exists). A Drive-only file with no record can be
     deleted by admins only. */
  var isAdmin = (user.role === 'superadmin' || user.role === 'admin');
  var isOwner = !!(meta && meta.uploadedBy === user.uid);
  if (!isAdmin && !isOwner) {
    return respond({ ok: false, error: 'Not permitted to delete this file' });
  }

  /* Trash the Drive file. Drive holds it 30 days then permanently purges. */
  var driveError = null;
  if (driveFileId) {
    try {
      DriveApp.getFileById(driveFileId).setTrashed(true);
    } catch (e) {
      /* If Drive file is already gone, proceed anyway — we still want to clean
         up any RTDB record. Log but don't fail. */
      driveError = e.message;
    }
  }

  /* Remove the RTDB record entirely (if there is one) */
  if (rtdbId) {
    try {
      pp_write_(PP_DATA + '/files/' + rtdbId, null);
    } catch (e) {
      return respond({ ok: false, error: 'RTDB delete failed: ' + e.message });
    }
  }

  pp_audit_('hard_deleted', {
    userUid:     user.uid,
    userName:    user.email,
    fileId:      rtdbId,
    driveFileId: driveFileId,
    fileName:    meta ? meta.name : '',
    clubKey:     meta ? meta.clubKey : '',
    folderKey:   meta ? meta.folderKey : '',
    driveError:  driveError
  });

  return respond({
    ok: true,
    driveTrashed: !driveError,
    driveError:   driveError
  });
}

/* Admin-only one-shot: scan /files/ for any record with isDeleted: true
   (legacy soft-delete records from before pp_delete existed) and hard-delete
   each. Returns counts. Run this once after deploying v3.1, then never again. */
/* ----------------------------------------------------------------------------
   ONE-SHOT: purge legacy folders left over from a previous folder structure.
   ----------------------------------------------------------------------------
   When folders-config is slimmed, the old Drive subfolders (and any files in
   them) are left behind — they just stop appearing in the tool, so you can't
   delete them in-app. Run this ONCE from the editor to clean them up:

     - Trashes every Drive subfolder inside each CLUB whose name isn't one of the
       current folders-config folders (Drive's 30-day trash = recovery). This
       cascades to the files inside, which is what nukes the leftover test files.
     - Removes the orphaned /files records that pointed into those folders.

   Skips NL Assets ('_nl-central') entirely — that tree is dynamic, not driven by
   folders-config, so we must never touch it here.

   SAFETY: starts in DRY-RUN. Run it once, read the Execution log to see what it
   WOULD trash, then set DRY_RUN=false and run again to actually do it.
   Run AFTER pp_bootstrap has created the new folders. */
function pp_purge_legacy_folders() {
  var DRY_RUN = true;   /* <<< set to false to actually trash, then re-run */

  var cfg = pp_read_(PP_DATA + '/folders-config') || {};
  var currentNames = {};   /* current folder display names (what to KEEP) */
  var currentKeys  = {};
  Object.keys(cfg).forEach(function(k) {
    if (k.charAt(0) === '_') return;
    currentKeys[k] = true;
    if (cfg[k] && cfg[k].name) currentNames[cfg[k].name] = true;
  });

  var folderIds = pp_read_(PP_DATA + '/folder-ids') || {};
  var report = { dryRun: DRY_RUN, clubsScanned: 0, foldersTrashed: 0, foldersKept: 0, recordsRemoved: 0, willTrash: [] };

  Object.keys(folderIds).forEach(function(clubKey) {
    if (clubKey === '_nl-central') return;                 /* never touch NL Assets */
    var rootId = folderIds[clubKey] && folderIds[clubKey]._root;
    if (!rootId) return;
    var root;
    try { root = DriveApp.getFolderById(rootId); } catch (e) { return; }
    report.clubsScanned++;

    var subs = root.getFolders();
    while (subs.hasNext()) {
      var sub = subs.next();
      var name = sub.getName();
      if (name === '_trash' || currentNames[name]) { report.foldersKept++; continue; }
      report.foldersTrashed++;
      if (report.willTrash.length < 25) report.willTrash.push(clubKey + ' / ' + name);
      if (!DRY_RUN) { try { sub.setTrashed(true); } catch (e) { /* ignore */ } }
    }
  });

  /* Remove orphaned /files records (club files whose folderKey is no longer a
     current folder). NL Assets records are left alone. */
  var allFiles = pp_read_(PP_DATA + '/files') || {};
  Object.keys(allFiles).forEach(function(fid) {
    var f = allFiles[fid];
    if (!f || f.clubKey === '_nl-central') return;
    if (currentKeys[f.folderKey]) return;
    report.recordsRemoved++;
    if (!DRY_RUN) { try { pp_write_(PP_DATA + '/files/' + fid, null); } catch (e) { /* ignore */ } }
  });

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}


function pp_purge_orphans(body) {
  var verified = pp_verifyToken_(body.idToken);
  if (!verified.ok) return respond({ ok: false, error: 'Auth failed: ' + verified.error });
  var user = verified.user;
  if (user.role !== 'superadmin' && user.role !== 'admin') {
    return respond({ ok: false, error: 'Admins only' });
  }

  var allFiles = pp_read_(PP_DATA + '/files') || {};
  var orphanIds = [];
  Object.keys(allFiles).forEach(function(fid) {
    var f = allFiles[fid];
    if (f && f.isDeleted) orphanIds.push(fid);
  });

  var trashed = 0;
  var rtdbCleaned = 0;
  var driveErrors = [];

  orphanIds.forEach(function(fid) {
    var meta = allFiles[fid];
    if (meta.driveFileId) {
      try {
        DriveApp.getFileById(meta.driveFileId).setTrashed(true);
        trashed++;
      } catch (e) {
        driveErrors.push({ fileId: fid, error: e.message });
      }
    }
    try {
      pp_write_(PP_DATA + '/files/' + fid, null);
      rtdbCleaned++;
    } catch (e) { /* unlikely; log only */ Logger.log('purge: rtdb delete failed for ' + fid); }
  });

  pp_audit_('orphans_purged', {
    userUid:     user.uid,
    userName:    user.email,
    orphansFound: orphanIds.length,
    driveTrashed: trashed,
    rtdbCleaned:  rtdbCleaned,
    driveErrors:  driveErrors.length
  });

  return respond({
    ok: true,
    orphansFound: orphanIds.length,
    driveTrashed: trashed,
    rtdbCleaned:  rtdbCleaned,
    driveErrors:  driveErrors
  });
}


/* Reconcile a single folder's Drive contents against RTDB metadata.
   Three drift scenarios this handles:

   1. Drive has files RTDB doesn't know about ("imported")
      → create RTDB metadata records pointing at them. uploadedBy = caller.
   2. RTDB has records pointing at files no longer in Drive ("orphaned-rtdb")
      → mark those records isDeleted=true (so UI hides them) — admin can purge.
   3. Names disagree ("renamed-in-drive")
      → update RTDB's `name` to match Drive's current name.

   Drive folder ID source depends on context:
   - Club folder:  folder-ids/{clubKey}/{folderKey}
   - NL Assets:    nl-assets-folders/{folderId}/driveFolderId

   Body: { idToken, clubKey, folderKey }
     where clubKey can be '_nl-central' for NL Assets, and folderKey is then
     the nl-assets-folders push key.

   Permission: admin/superadmin only. Reconcile is a write-heavy operation
   (creates RTDB records) so we don't expose to club reps. */
function pp_reconcile_folder(body) {
  var verified = pp_verifyToken_(body.idToken);
  if (!verified.ok) return respond({ ok: false, error: 'Auth failed: ' + verified.error });
  var user = verified.user;

  if (user.role !== 'superadmin' && user.role !== 'admin') {
    return respond({ ok: false, error: 'Admins only' });
  }

  var clubKey   = body.clubKey;
  var folderKey = body.folderKey;
  if (!clubKey || !folderKey) {
    return respond({ ok: false, error: 'clubKey and folderKey required' });
  }

  /* Resolve target Drive folder ID */
  var driveFolderId;
  if (clubKey === '_nl-central') {
    var nlf = pp_read_(PP_DATA + '/nl-assets-folders/' + folderKey);
    if (!nlf || !nlf.driveFolderId) {
      return respond({ ok: false, error: 'NL Assets folder not found' });
    }
    driveFolderId = nlf.driveFolderId;
  } else {
    var folderIds = pp_read_(PP_DATA + '/folder-ids/' + clubKey);
    if (!folderIds || !folderIds[folderKey]) {
      return respond({ ok: false, error: 'Folder mapping not found. Run pp_bootstrap?' });
    }
    driveFolderId = folderIds[folderKey];
  }

  /* Drive side: list all files in the folder */
  var driveFolder;
  try { driveFolder = DriveApp.getFolderById(driveFolderId); }
  catch (e) { return respond({ ok: false, error: 'Drive folder access failed: ' + e.message }); }

  var driveFiles = {};   /* driveFileId → { name, size, mimeType } */
  var iter = driveFolder.getFiles();
  while (iter.hasNext()) {
    var f = iter.next();
    if (f.isTrashed()) continue;
    driveFiles[f.getId()] = {
      name:     f.getName(),
      size:     f.getSize(),
      mimeType: f.getMimeType()
    };
  }

  /* RTDB side: every non-deleted file in this folder */
  var allFiles = pp_read_(PP_DATA + '/files') || {};
  var rtdbForFolder = {};   /* fileId → meta (RTDB push key) */
  Object.keys(allFiles).forEach(function(fid) {
    var meta = allFiles[fid];
    if (!meta || meta.isDeleted) return;
    if (meta.clubKey === clubKey && meta.folderKey === folderKey) {
      rtdbForFolder[fid] = meta;
    }
  });

  /* Walk the comparison and apply fixes */
  var imported = 0;
  var renamed = 0;
  var orphanedRtdb = 0;
  var rtdbDriveIds = {};   /* set of driveFileIds currently referenced by RTDB */

  Object.keys(rtdbForFolder).forEach(function(fid) {
    var meta = rtdbForFolder[fid];
    rtdbDriveIds[meta.driveFileId] = true;

    var drive = driveFiles[meta.driveFileId];
    if (!drive) {
      /* RTDB record points at a Drive file that no longer exists. Mark deleted. */
      try {
        pp_write_(PP_DATA + '/files/' + fid + '/isDeleted', true);
        pp_write_(PP_DATA + '/files/' + fid + '/deletedAt', Date.now());
        pp_write_(PP_DATA + '/files/' + fid + '/deletedBy', user.uid);
        pp_write_(PP_DATA + '/files/' + fid + '/deleteReason', 'reconcile-drive-missing');
        orphanedRtdb++;
      } catch (e) { /* best effort */ }
      return;
    }
    /* Detect rename in Drive */
    if (drive.name !== meta.name) {
      try {
        pp_write_(PP_DATA + '/files/' + fid + '/name', drive.name);
        pp_write_(PP_DATA + '/files/' + fid + '/lastReconciledAt', Date.now());
        renamed++;
      } catch (e) { /* best effort */ }
    }
  });

  /* Now find Drive files RTDB doesn't know about */
  Object.keys(driveFiles).forEach(function(driveFileId) {
    if (rtdbDriveIds[driveFileId]) return;   /* already tracked */

    var info = driveFiles[driveFileId];
    var newId = pp_pushKey_();
    var newMeta = {
      name:           info.name,
      size:           info.size,
      mimeType:       info.mimeType,
      type:           pp_typeFromMime_(info.mimeType),
      clubKey:        clubKey,
      folderKey:      folderKey,
      driveFileId:    driveFileId,
      uploadedBy:     user.uid,
      uploadedByName: user.email,
      uploadedAt:     Date.now(),
      lastModifiedAt: Date.now(),
      importedFromDrive: true,   /* marker so we know origin */
      importedAt:     Date.now(),
      importedBy:     user.uid
    };
    try {
      pp_write_(PP_DATA + '/files/' + newId, newMeta);
      imported++;
    } catch (e) { /* best effort */ }
  });

  pp_audit_('reconciled', {
    userUid:      user.uid,
    userName:     user.email,
    clubKey:      clubKey,
    folderKey:    folderKey,
    imported:     imported,
    renamed:      renamed,
    orphanedRtdb: orphanedRtdb,
    driveCount:   Object.keys(driveFiles).length,
    rtdbCount:    Object.keys(rtdbForFolder).length
  });

  return respond({
    ok:           true,
    imported:     imported,
    renamed:      renamed,
    orphanedRtdb: orphanedRtdb,
    driveCount:   Object.keys(driveFiles).length,
    rtdbCount:    Object.keys(rtdbForFolder).length
  });
}


/* ============================================================================
   LIVE LISTING — read a folder straight from Drive (Phase 1)
   ============================================================================
   The page renders folder contents from THIS instead of the RTDB /files mirror.
   Because the list is whatever Drive actually holds (trashed files excluded by
   DriveApp.getFiles()), a file removed from Drive simply isn't returned — there
   is no "ghost" to clean up, no reconcile to run.

   We return only the Drive listing — NOT a join against the /files tree. The
   page just needs the set of Drive ids present (to hide ghosts) plus the folder
   id; it renders per-row detail (uploader/description) from the records it
   already holds in STATE.files. Reading all of /files here on every open was
   the bulk of the latency, so it's gone.

   Body: { idToken, clubKey, folderKey }   (clubKey '_nl-central' => NL Assets)
   Returns: { ok, clubKey, folderKey, driveFolderId, files: [ {
       driveFileId, name, mimeType, type, size, modifiedTime } ] }
   Permission: any authenticated user (read), matching pp_download. */
function pp_list_folder(body) {
  var verified = pp_verifyToken_(body.idToken);
  if (!verified.ok) return respond({ ok: false, error: 'Auth failed: ' + verified.error });

  var clubKey   = body.clubKey;
  var folderKey = body.folderKey;
  if (!clubKey || !folderKey) {
    return respond({ ok: false, error: 'clubKey and folderKey required' });
  }

  /* Resolve target Drive folder ID (same source map as upload/reconcile) */
  var driveFolderId;
  if (clubKey === '_nl-central') {
    var nlf = pp_read_(PP_DATA + '/nl-assets-folders/' + folderKey);
    if (!nlf || !nlf.driveFolderId) {
      return respond({ ok: false, error: 'NL Assets folder not found' });
    }
    driveFolderId = nlf.driveFolderId;
  } else {
    var folderIds = pp_read_(PP_DATA + '/folder-ids/' + clubKey);
    if (!folderIds || !folderIds[folderKey]) {
      return respond({ ok: false, error: 'Folder mapping not found. Run pp_bootstrap?' });
    }
    driveFolderId = folderIds[folderKey];
  }

  var driveFolder;
  try { driveFolder = DriveApp.getFolderById(driveFolderId); }
  catch (e) { return respond({ ok: false, error: 'Drive folder access failed: ' + e.message }); }

  /* DriveApp.getFiles() returns only non-trashed files — the whole point.
     We deliberately do NOT read the (potentially huge) /files tree here: the
     page only needs the set of Drive ids present (to hide ghosts) and renders
     row detail from the records it already holds in STATE.files. Reading all of
     /files on every folder-open was the bulk of the latency. */
  var out = [];
  var iter = driveFolder.getFiles();
  while (iter.hasNext()) {
    var f = iter.next();
    var mime = f.getMimeType();
    out.push({
      driveFileId:  f.getId(),
      name:         f.getName(),
      mimeType:     mime,
      type:         pp_typeFromMime_(mime),
      size:         f.getSize(),
      modifiedTime: f.getLastUpdated().getTime()
    });
  }

  return respond({ ok: true, clubKey: clubKey, folderKey: folderKey, driveFolderId: driveFolderId, files: out });
}


/* ============================================================================
   HELPERS
   ============================================================================ */

/* Resolve the Drive file for a request that may carry either an RTDB fileId
   (look up /files/<id>.driveFileId) or a driveFileId directly. Returns
   { ok, driveFileId, meta }  where meta is the RTDB record or null.
   Used by pp_download/pp_preview so the live-listing page can act on files
   that have no /files record yet. */
function pp_resolveFile_(body) {
  if (body.driveFileId) {
    var m = null;
    /* best-effort: find the RTDB record (for name/mime/size) if one exists */
    var all = pp_read_(PP_DATA + '/files') || {};
    Object.keys(all).some(function(fid) {
      if (all[fid] && all[fid].driveFileId === body.driveFileId && !all[fid].isDeleted) {
        m = all[fid]; m._id = fid; return true;
      }
      return false;
    });
    return { ok: true, driveFileId: body.driveFileId, meta: m };
  }
  if (body.fileId) {
    var meta = pp_read_(PP_DATA + '/files/' + body.fileId);
    if (!meta) return { ok: false, error: 'File not found: ' + body.fileId };
    if (meta.isDeleted) return { ok: false, error: 'File has been deleted' };
    meta._id = body.fileId;
    return { ok: true, driveFileId: meta.driveFileId, meta: meta };
  }
  return { ok: false, error: 'fileId or driveFileId required' };
}

/* Find an existing child folder by name, or create it. */
function pp_findOrCreateFolder_(parentFolder, name) {
  var iter = parentFolder.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();
  return parentFolder.createFolder(name);
}

/* Convert "Aldershot Town" -> "aldershot-town" (matches the convention used
   elsewhere in the portal). */
function pp_clubKey_(clubName) {
  return clubName.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/* Mime-type to type-bucket used by the UI ('pdf', 'doc', 'xls', 'img', 'vid', 'other'). */
function pp_typeFromMime_(mime) {
  if (!mime) return 'other';
  if (mime === 'application/pdf') return 'pdf';
  if (/^image\//.test(mime)) return 'img';
  if (/^video\//.test(mime)) return 'vid';
  if (/wordprocessingml|msword/.test(mime)) return 'doc';
  if (/spreadsheetml|ms-excel/.test(mime)) return 'xls';
  return 'other';
}

/* Push-style RTDB key, like Firebase's push() — timestamp-prefixed for chronological sort. */
function pp_pushKey_() {
  var now = Date.now();
  var rand = Math.random().toString(36).substr(2, 8);
  return now + '-' + rand;
}

/* Verify a Firebase ID token. Calls Google's tokeninfo endpoint as a lightweight
   alternative to full JWT verification. Returns { ok, user: {uid,email,role,club} }
   on success; { ok:false, error } on failure. */
function pp_verifyToken_(idToken) {
  if (!idToken) return { ok: false, error: 'No idToken provided' };

  var apiKey = PropertiesService.getScriptProperties().getProperty('FIREBASE_API_KEY');
  if (!apiKey) return { ok: false, error: 'FIREBASE_API_KEY Script Property not set' };

  try {
    // Use Google's identity toolkit to verify the token
    var resp = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + apiKey, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true
    });
    var status = resp.getResponseCode();
    if (status !== 200) {
      return { ok: false, error: 'Token verification returned ' + status + ': ' + resp.getContentText() };
    }
    var data = JSON.parse(resp.getContentText());
    if (!data.users || !data.users[0]) return { ok: false, error: 'Token has no user' };
    var u = data.users[0];

    // Pull role + club from RTDB
    var profile = pp_read_('users/' + u.localId);
    if (!profile) return { ok: false, error: 'User profile not in RTDB' };

    return {
      ok: true,
      user: {
        uid:   u.localId,
        email: u.email,
        role:  profile.role || 'club',
        club:  profile.club || null
      }
    };
  } catch (e) {
    return { ok: false, error: 'Token verification threw: ' + e.message };
  }
}

/* Tool-scoped audit. Writes to /{PP_DATA}/audit/{tsKey}.
   Browser-side audit writes from the tool page also use this path. */
function pp_audit_(action, details) {
  var key = pp_pushKey_();
  var entry = {
    action: action,
    timestamp: Date.now()
  };
  Object.keys(details || {}).forEach(function(k) { entry[k] = details[k]; });
  try { pp_write_(PP_DATA + '/audit/' + key, entry); }
  catch (e) { Logger.log('Audit write failed: ' + e.message); }
}


/* ============================================================================
   NL ASSETS — admin-managed folder tree inside _nl-central
   ============================================================================
   Three handlers, all admin/superadmin only:
     pp_nlf_create  — create a folder (root or nested)
     pp_nlf_rename  — rename an existing folder
     pp_nlf_delete  — hard-delete folder + Drive folder + all contents

   Storage:
     /{PP_DATA}/nl-assets-folders/{folderId}
       { name, parentId, driveFolderId, createdBy, createdAt, sortOrder, ... }
   Files inside NL Assets use clubKey='_nl-central' and folderKey={folderId}.
   ============================================================================ */

var NL_ASSETS_MAX_DEPTH = 3;

/* Compute depth of a folder by walking parents. */
function pp_nlf_depth_(folderId, allFolders) {
  var depth = 0;
  var current = allFolders[folderId];
  while (current && current.parentId) {
    depth++;
    if (depth > 10) break;  /* infinite loop guard */
    current = allFolders[current.parentId];
  }
  return depth;
}

/* Resolve the Drive parent folder for a new NL Assets folder.
   - If parentId is null/empty: parent is the NL Central root folder
   - Otherwise: parent is the Drive folder whose ID is in the parent's record */
function pp_nlf_resolveDriveParent_(parentId) {
  if (!parentId) {
    /* root NL Assets folder = the legacy '_nl-central' root */
    var folderIds = pp_read_(PP_DATA + '/folder-ids/_nl-central');
    if (!folderIds || !folderIds._root) {
      throw new Error('NL Central root folder not found. Run pp_bootstrap.');
    }
    return DriveApp.getFolderById(folderIds._root);
  }
  var parent = pp_read_(PP_DATA + '/nl-assets-folders/' + parentId);
  if (!parent || !parent.driveFolderId) throw new Error('Parent folder not found in RTDB');
  return DriveApp.getFolderById(parent.driveFolderId);
}

function pp_nlf_create(body) {
  var verified = pp_verifyToken_(body.idToken);
  if (!verified.ok) return respond({ ok: false, error: 'Auth failed: ' + verified.error });
  var user = verified.user;

  if (user.role !== 'superadmin' && user.role !== 'admin') {
    return respond({ ok: false, error: 'Only NL admins can create folders here' });
  }

  var name = String(body.name || '').trim();
  if (!name) return respond({ ok: false, error: 'Folder name required' });
  if (name.length > 80) return respond({ ok: false, error: 'Folder name too long (max 80 chars)' });
  if (/[\\\/<>:"|?*]/.test(name)) return respond({ ok: false, error: 'Folder name has invalid characters' });

  var parentId = body.parentId || null;

  /* Depth check */
  if (parentId) {
    var allFolders = pp_read_(PP_DATA + '/nl-assets-folders') || {};
    var parentDepth = pp_nlf_depth_(parentId, allFolders);
    if (parentDepth + 1 >= NL_ASSETS_MAX_DEPTH) {
      return respond({ ok: false, error: 'Max nesting depth reached (' + NL_ASSETS_MAX_DEPTH + ' levels)' });
    }
    if (!allFolders[parentId]) {
      return respond({ ok: false, error: 'Parent folder not found' });
    }
  }

  /* Create Drive folder */
  var driveParent;
  try { driveParent = pp_nlf_resolveDriveParent_(parentId); }
  catch (e) { return respond({ ok: false, error: 'Drive lookup failed: ' + e.message }); }

  var driveFolder;
  try { driveFolder = driveParent.createFolder(name); }
  catch (e) { return respond({ ok: false, error: 'Drive create failed: ' + e.message }); }

  /* Write metadata */
  var folderId = pp_pushKey_();
  var now = Date.now();
  var meta = {
    name:           name,
    parentId:       parentId || null,
    driveFolderId:  driveFolder.getId(),
    sortOrder:      now,  /* default to creation time, admin can re-order later */
    createdBy:      user.uid,
    createdByName:  user.email,
    createdAt:      now,
    lastModifiedAt: now,
    lastModifiedBy: user.uid
  };

  try { pp_write_(PP_DATA + '/nl-assets-folders/' + folderId, meta); }
  catch (e) {
    /* Roll back Drive */
    try { driveFolder.setTrashed(true); } catch (ignore) {}
    return respond({ ok: false, error: 'Metadata write failed (Drive folder removed): ' + e.message });
  }

  pp_audit_('nlf_created', {
    userUid:    user.uid,
    userName:   user.email,
    folderId:   folderId,
    folderName: name,
    parentId:   parentId
  });

  return respond({ ok: true, folderId: folderId, driveFolderId: driveFolder.getId() });
}

function pp_nlf_rename(body) {
  var verified = pp_verifyToken_(body.idToken);
  if (!verified.ok) return respond({ ok: false, error: 'Auth failed: ' + verified.error });
  var user = verified.user;

  if (user.role !== 'superadmin' && user.role !== 'admin') {
    return respond({ ok: false, error: 'Only NL admins can rename folders' });
  }

  var folderId = body.folderId;
  var newName  = String(body.name || '').trim();
  if (!folderId) return respond({ ok: false, error: 'folderId required' });
  if (!newName)  return respond({ ok: false, error: 'New name required' });
  if (newName.length > 80) return respond({ ok: false, error: 'Folder name too long (max 80 chars)' });
  if (/[\\\/<>:"|?*]/.test(newName)) return respond({ ok: false, error: 'Folder name has invalid characters' });

  var meta = pp_read_(PP_DATA + '/nl-assets-folders/' + folderId);
  if (!meta) return respond({ ok: false, error: 'Folder not found' });

  /* Rename Drive folder */
  try {
    var driveFolder = DriveApp.getFolderById(meta.driveFolderId);
    driveFolder.setName(newName);
  } catch (e) {
    return respond({ ok: false, error: 'Drive rename failed: ' + e.message });
  }

  /* Update RTDB */
  var oldName = meta.name;
  try {
    pp_write_(PP_DATA + '/nl-assets-folders/' + folderId + '/name', newName);
    pp_write_(PP_DATA + '/nl-assets-folders/' + folderId + '/lastModifiedAt', Date.now());
    pp_write_(PP_DATA + '/nl-assets-folders/' + folderId + '/lastModifiedBy', user.uid);
  } catch (e) {
    return respond({ ok: false, error: 'Metadata update failed: ' + e.message });
  }

  pp_audit_('nlf_renamed', {
    userUid:    user.uid,
    userName:   user.email,
    folderId:   folderId,
    oldName:    oldName,
    newName:    newName
  });

  return respond({ ok: true });
}

function pp_nlf_delete(body) {
  var verified = pp_verifyToken_(body.idToken);
  if (!verified.ok) return respond({ ok: false, error: 'Auth failed: ' + verified.error });
  var user = verified.user;

  if (user.role !== 'superadmin' && user.role !== 'admin') {
    return respond({ ok: false, error: 'Only NL admins can delete folders' });
  }

  var folderId = body.folderId;
  if (!folderId) return respond({ ok: false, error: 'folderId required' });

  var meta = pp_read_(PP_DATA + '/nl-assets-folders/' + folderId);
  if (!meta) return respond({ ok: false, error: 'Folder not found' });

  /* Find all descendants (recursive) and all files in this subtree */
  var allFolders = pp_read_(PP_DATA + '/nl-assets-folders') || {};
  var allFiles   = pp_read_(PP_DATA + '/files') || {};

  var subtreeFolderIds = [folderId];
  var queue = [folderId];
  while (queue.length > 0) {
    var current = queue.shift();
    Object.keys(allFolders).forEach(function(fid) {
      if (allFolders[fid] && allFolders[fid].parentId === current) {
        subtreeFolderIds.push(fid);
        queue.push(fid);
      }
    });
  }

  /* Find files inside any folder in this subtree */
  var fileIdsToDelete = [];
  Object.keys(allFiles).forEach(function(fid) {
    var f = allFiles[fid];
    if (!f) return;
    if (f.clubKey === '_nl-central' && subtreeFolderIds.indexOf(f.folderKey) !== -1) {
      fileIdsToDelete.push(fid);
    }
  });

  /* Move root Drive folder to trash — Drive cascades to descendants */
  try {
    var driveFolder = DriveApp.getFolderById(meta.driveFolderId);
    driveFolder.setTrashed(true);
  } catch (e) {
    return respond({ ok: false, error: 'Drive delete failed: ' + e.message });
  }

  /* Cascade RTDB: remove all subtree folder records, mark all files isDeleted */
  try {
    subtreeFolderIds.forEach(function(fid) {
      pp_write_(PP_DATA + '/nl-assets-folders/' + fid, null);
    });
    fileIdsToDelete.forEach(function(fid) {
      pp_write_(PP_DATA + '/files/' + fid + '/isDeleted', true);
      pp_write_(PP_DATA + '/files/' + fid + '/deletedAt', Date.now());
      pp_write_(PP_DATA + '/files/' + fid + '/deletedBy', user.uid);
      pp_write_(PP_DATA + '/files/' + fid + '/deleteReason', 'parent-folder-deleted');
    });
  } catch (e) {
    return respond({ ok: false, error: 'RTDB cleanup failed (Drive folder is in trash): ' + e.message });
  }

  pp_audit_('nlf_deleted', {
    userUid:        user.uid,
    userName:       user.email,
    folderId:       folderId,
    folderName:     meta.name,
    foldersRemoved: subtreeFolderIds.length,
    filesRemoved:   fileIdsToDelete.length
  });

  return respond({
    ok: true,
    foldersRemoved: subtreeFolderIds.length,
    filesRemoved:   fileIdsToDelete.length
  });
}
