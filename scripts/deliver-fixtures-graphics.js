#!/usr/bin/env node
/* ============================================================
   deliver-fixtures-graphics.js
   Version: v1.2 (10/10/2026)

   The delivery half of the fixtures & results automation. Rendering is
   scripts/build-fixtures-graphics.js; this moves its output to where
   people find it, and tells the next run what has already gone.

     node scripts/deliver-fixtures-graphics.js delivered <season> > done.txt
     node scripts/deliver-fixtures-graphics.js upload <out dir>

   WHERE THINGS GO
     Google Drive   inside DRIVE_FOLDER_ID (the "Graphics" folder in the media
                    Shared Drive), wherever the build said: each card in the
                    manifest carries its destinations, e.g.
                    Graphics/Main/National/2026-10-24 (Sat 24 Oct 2026) MD 14/
                    Graphics/Extended/National/2026-10-24 (Sat 24 Oct 2026) MD 14/
                    with the file names for each. Folders are made as needed.
                    (Before 10/10/2026: one flat folder per card.)
     Firebase       gs://nl-tools.firebasestorage.app/graphics/fixtures/
     Storage        <season>/<card id>/*.png

   ONCE ONLY
     Storage is the record of what has been delivered. A card goes to Drive
     first and to Storage second, so a card is only marked done once it is
     in both; if Drive fails, the next run tries the whole card again.
     `delivered` lists the card folders already in Storage for the season,
     one per line; a card that recorded a fingerprint of what it showed has
     it after a tab. The fingerprint is an empty object named .sig-<hash>
     beside the PNGs (Storage only, never Drive), so the list call that finds
     the cards also finds what each one showed — no extra reads. The build
     compares it, and sends a changed card again as v2, v3.

   AUTH
     GOOGLE_ACCESS_TOKEN — a bearer token for the deploy service account
     with the drive and devstorage.read_write scopes, minted by
     google-github-actions/auth in the workflow. No SDK, no key file.
     The service account must be a Content manager on the Drive folder,
     and the Drive API must be enabled on the nl-tools project.

   CHANGELOG
     v1.2 10/10/2026  Main / Extended layout: uploads each card to every
                      destination the build gives it, making nested folders as
                      needed. A card with no destinations still gets the old
                      flat folder.
     v1.2 09/10/2026  Refuses to deliver a card with no PNGs.
     v1.1 09/10/2026  Records each card's fingerprint, and lists it back.
     v1.0 09/10/2026  First version.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const BUCKET = process.env.STORAGE_BUCKET || 'nl-tools.firebasestorage.app';
const PREFIX = 'graphics/fixtures';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
/* Overridable only so the request shapes can be exercised against a local
   stand-in; the real endpoints are the defaults. Shapes follow:
   Storage  https://cloud.google.com/storage/docs/json_api/v1/objects/insert
            https://cloud.google.com/storage/docs/json_api/v1/objects/list
   Drive    https://developers.google.com/drive/api/guides/manage-uploads#multipart
            https://developers.google.com/drive/api/guides/enable-shareddrives */
const STORAGE_API = process.env.STORAGE_API || 'https://storage.googleapis.com';
const DRIVE_API = process.env.DRIVE_API || 'https://www.googleapis.com';

function token() {
  const t = process.env.GOOGLE_ACCESS_TOKEN;
  if (!t) throw new Error('GOOGLE_ACCESS_TOKEN is not set');
  return t;
}
async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token()}`, ...(opts.headers || {}) } });
  if (!r.ok) {
    const body = await r.text();
    /* The two failures someone will actually hit, said in plain words. */
    if (/accessNotConfigured|has not been used in project|is disabled/.test(body)) {
      throw new Error(`The Drive API is not switched on for the nl-tools project. ${r.status}: ${body.slice(0, 300)}`);
    }
    if (r.status === 404 && url.includes('/drive/v3/')) {
      throw new Error(`Drive folder not found — has it been shared with the service account as Content manager? ${body.slice(0, 300)}`);
    }
    throw new Error(`${opts.method || 'GET'} ${url.split('?')[0]} → ${r.status}: ${body.slice(0, 300)}`);
  }
  return r.status === 204 ? null : r.json();
}

/* ---------- Firebase Storage (Cloud Storage JSON API) ---------- */

const SIG = '.sig-';
async function delivered(season) {
  const ids = new Map();
  let pageToken = '';
  do {
    const q = new URLSearchParams({ prefix: `${PREFIX}/${season}/`, fields: 'items(name),nextPageToken' });
    if (pageToken) q.set('pageToken', pageToken);
    const j = await api(`${STORAGE_API}/storage/v1/b/${BUCKET}/o?${q}`);
    for (const it of j.items || []) {
      const rest = it.name.slice(`${PREFIX}/${season}/`.length);
      const [id, file] = rest.split('/');
      if (!id) continue;
      if (!ids.has(id)) ids.set(id, '');
      if (file && file.startsWith(SIG)) ids.set(id, file.slice(SIG.length));
    }
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return [...ids.keys()].sort().map(id => ids.get(id) ? `${id}\t${ids.get(id)}` : id);
}
async function storagePut(objectName, buf, type = 'image/png') {
  const q = new URLSearchParams({ uploadType: 'media', name: objectName });
  return api(`${STORAGE_API}/upload/storage/v1/b/${BUCKET}/o?${q}`,
    { method: 'POST', headers: { 'Content-Type': type }, body: buf });
}

/* ---------- Google Drive (v3 REST, Shared Drive aware) ---------- */

const ALL_DRIVES = 'supportsAllDrives=true';
/* Folder ids found or made this run, so a path shared by many cards is
   looked up once. */
const _folders = new Map();
async function drivePath(parentId, names) {
  let id = parentId;
  for (const name of names) {
    const key = id + '/' + name;
    if (!_folders.has(key)) _folders.set(key, await driveFolder(id, name));
    id = _folders.get(key);
  }
  return id;
}
async function driveFolder(parentId, name) {
  const q = `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' ` +
            `and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const found = await api(`${DRIVE_API}/drive/v3/files?${ALL_DRIVES}` +
    `&includeItemsFromAllDrives=true&corpora=allDrives&fields=files(id)&q=${encodeURIComponent(q)}`);
  if (found.files && found.files.length) return found.files[0].id;
  const made = await api(`${DRIVE_API}/drive/v3/files?${ALL_DRIVES}&fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] })
  });
  return made.id;
}
async function driveUpload(folderId, name, buf) {
  const boundary = 'nlgfx' + Date.now().toString(36);
  const meta = JSON.stringify({ name, parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
                `--${boundary}\r\nContent-Type: image/png\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  return api(`${DRIVE_API}/upload/drive/v3/files?uploadType=multipart&${ALL_DRIVES}&fields=id`, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
  });
}

/* ---------- upload ---------- */

async function upload(outDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
  const driveParent = process.env.DRIVE_FOLDER_ID;
  if (!driveParent) throw new Error('DRIVE_FOLDER_ID is not set');
  if (!manifest.cards.length) { console.log('Nothing to deliver.'); return; }

  /* Never deliver an empty folder: a card with no PNGs is a build fault. */
  const empty = manifest.cards.filter(c => !c.files || !c.files.length);
  if (empty.length) throw new Error(`refusing to deliver cards with no PNGs: ${empty.map(c => c.id).join(', ')}`);

  for (const card of manifest.cards) {
    const files = card.files.map(f => ({ name: f, buf: fs.readFileSync(path.join(outDir, card.id, f)) }));
    const dests = card.dests && card.dests.length ? card.dests
      : [{ path: [card.id], files: card.files.map(f => ({ name: f })) }];
    const links = [];
    for (const d of dests) {
      const folderId = await drivePath(driveParent, d.path);
      /* Match each rendered PNG to its name here by size: "… - 4x5.png". */
      for (const f of files) {
        const fmt = (f.name.match(/ - (\w+)\.png$/) || [])[1];
        const named = d.files.find(x => x.format === fmt) || {};
        await driveUpload(folderId, named.name || f.name, f.buf);
      }
      links.push(`${d.path.join('/')}  https://drive.google.com/drive/folders/${folderId}`);
    }
    for (const f of files) await storagePut(`${PREFIX}/${manifest.season}/${card.id}/${f.name}`, f.buf);
    if (card.sig) await storagePut(`${PREFIX}/${manifest.season}/${card.id}/${SIG}${card.sig}`, Buffer.alloc(0), 'text/plain');
    console.log(`delivered  ${card.id}  (${files.length} files)\n  ${links.join('\n  ')}`);
  }
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'delivered' && arg) { (await delivered(arg)).forEach(line => console.log(line)); return; }
  if (cmd === 'upload' && arg) return upload(path.resolve(arg));
  throw new Error('usage: delivered <season> | upload <out dir>');
}
main().catch(e => { console.error(e.message); process.exit(1); });
