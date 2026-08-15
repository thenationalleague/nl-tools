/* =========================================================================
   drive.gs — Shared Drive file browser
   ========================================================================= */

var MAX_PREVIEW_BYTES = 20 * 1024 * 1024; /* 20MB cap for base64 preview */

/* ---- Get full folder tree ------------------------------------------------ */
function getTree() {
  var config = getConfig();
  if (!config.driveId) return { ok: false, error: 'DRIVE_ID not set in Script Properties.' };
  var tree = getFolderContents(config.driveId);
  return { ok: true, tree: tree };
}

function getFolderContents(folderId) {
  var items   = [];
  var folders = [];
  var files   = [];

  var params = {
    q:                         '"' + folderId + '" in parents and trashed = false',
    includeItemsFromAllDrives: true,
    supportsAllDrives:         true,
    corpora:                   'allDrives',
    orderBy:                   'folder,name',
    fields:                    'files(id, name, mimeType, iconLink, thumbnailLink, modifiedTime, size, webViewLink)',
    pageSize:                  1000
  };

  var result   = Drive.Files.list(params);
  var fileList = result.files || [];

  fileList.forEach(function(f) {
    if (f.mimeType === 'application/vnd.google-apps.folder') {
      folders.push(f);
    } else {
      files.push(f);
    }
  });

  folders.forEach(function(folder) {
    items.push({
      type:     'folder',
      id:       folder.id,
      name:     folder.name,
      children: getFolderContents(folder.id)
    });
  });

  files.forEach(function(file) {
    items.push({
      type:          'file',
      id:            file.id,
      name:          file.name,
      mimeType:      file.mimeType,
      iconUrl:       file.iconLink      || '',
      modifiedTime:  file.modifiedTime  || '',
      size:          file.size          || 0,
      webViewLink:   file.webViewLink   || '',
      thumbnailLink: file.thumbnailLink || '',
      previewUrl:    buildPreviewUrl(file)
    });
  });

  return items;
}

/* ---- Build preview URL --------------------------------------------------- */
function buildPreviewUrl(file) {
  var mime = file.mimeType || '';
  if (mime.indexOf('application/vnd.google-apps') === 0) return 'https://drive.google.com/file/d/' + file.id + '/preview';
  if (mime === 'application/pdf')                         return 'https://drive.google.com/file/d/' + file.id + '/preview';
  if (mime.indexOf('image/') === 0)                       return 'https://drive.google.com/thumbnail?id=' + file.id + '&sz=w800';
  if (mime.indexOf('video/') === 0)                       return 'https://drive.google.com/file/d/' + file.id + '/preview';
  return '';
}

/* ---- Get download URL ---------------------------------------------------- */
function getDownloadUrl(fileId) {
  if (!fileId) return { ok: false, error: 'fileId required.' };
  try {
    var file = DriveApp.getFileById(fileId);
    return { ok: true, url: 'https://drive.google.com/uc?export=download&id=' + fileId, name: file.getName() };
  } catch(err) {
    return { ok: false, error: err.message };
  }
}

/* ---- Serve file as base64 JSON (images, audio, PDFs) -------------------- */
function serveThumbnail(fileId) {
  if (!fileId) return { ok: false, error: 'missing fileId' };
  try {
    var file = DriveApp.getFileById(fileId);
    var mime = file.getMimeType() || '';
    var blob;

    if (mime.indexOf('image/') === 0) {
      blob = file.getThumbnail();
      if (!blob) blob = file.getBlob();
    } else if (mime.indexOf('audio/') === 0) {
      if (file.getSize() > MAX_PREVIEW_BYTES) return { ok: false, error: 'File too large to preview.' };
      blob = file.getBlob();
    } else if (mime === 'application/pdf') {
      if (file.getSize() > MAX_PREVIEW_BYTES) return { ok: false, error: 'PDF too large to preview. Please download instead.' };
      blob = file.getBlob();
    } else {
      return { ok: false, error: 'Preview not supported for this file type.' };
    }

    if (!blob) return { ok: false, error: 'Could not read file.' };
    return { ok: true, data: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType() || mime };
  } catch(err) {
    return { ok: false, error: err.message };
  }
}