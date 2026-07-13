/**
 * NL Cup Footage — Cloud Functions.
 *   makeProxy         — makes the 360p preview proxy on upload (below).
 *   onFootageDeleted  — mirrors Storage deletes back to the catalogue (bottom).
 *
 * Trigger: a file finalised under `footage/national-league-cup/` in the nl-tools bucket.
 * For any file up to MAX_PROXY_BYTES (full matches are much larger → download-only),
 * make a small 360p ~500 kbps faststart MP4 and store it at
 * `footage/national-league-cup/proxies/<name>`. The gate is file SIZE, not the
 * filename — a mis-named highlights file still gets a preview.
 * The club page streams the proxy for preview and serves the full file for
 * download; if the proxy isn't there yet it falls back to the full file.
 *
 * This is a *proxy*, not a re-encode of the deliverable — it only touches the
 * small highlights files, so it's pennies of compute and doesn't reopen the
 * full-match cost question. See footage/README.md.
 */
const { onObjectFinalized, onObjectDeleted } = require("firebase-functions/v2/storage");
const { onValueCreated } = require("firebase-functions/v2/database");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const os = require("os");
const path = require("path");
const fs = require("fs");

admin.initializeApp();
ffmpeg.setFfmpegPath(ffmpegPath);
setGlobalOptions({ region: "europe-west2" });

const BUCKET = "nl-tools.firebasestorage.app";
// Proxy any file up to this size. Highlights/clips are small (hundreds of MB);
// full matches are 6–10 GB and stay download-only. We gate on SIZE, not the
// filename — the producer can misname a file, but they can't fake its size, so
// every normal upload gets a preview regardless of naming convention.
const MAX_PROXY_BYTES = 2 * 1024 * 1024 * 1024;   // 2 GiB

exports.makeProxy = onObjectFinalized(
  { bucket: BUCKET, memory: "4GiB", cpu: 2, timeoutSeconds: 540 },
  async (event) => {
    const obj = event.data;
    const filePath = obj.name || "";

    // Only originals under footage/national-league-cup/, .mp4, and not a proxy re-trigger.
    if (filePath.indexOf("footage/national-league-cup/") !== 0) return;
    if (filePath.indexOf("/proxies/") !== -1) return;   // don't proxy the proxies (loop-safe)
    if (!/\.mp4$/i.test(filePath)) return;

    const base = path.basename(filePath);
    // Gate on size, not filename — full matches (huge) are download-only; anything
    // smaller gets a preview proxy even if the producer named it wrong.
    const size = parseInt(obj.size || "0", 10);
    if (size > MAX_PROXY_BYTES) {
      logger.info(`Skipping large file (${size} bytes, download-only): ${base}`);
      return;
    }

    const bucket = admin.storage().bucket(obj.bucket || BUCKET);
    const proxyPath = "footage/national-league-cup/proxies/" + base;

    // Idempotent: skip if the proxy already exists.
    const [exists] = await bucket.file(proxyPath).exists();
    if (exists) {
      logger.info(`Proxy already exists: ${proxyPath}`);
      return;
    }

    const tmpIn = path.join(os.tmpdir(), base);
    const tmpOut = path.join(os.tmpdir(), "proxy_" + base);
    try {
      await bucket.file(filePath).download({ destination: tmpIn });
      await new Promise((resolve, reject) => {
        ffmpeg(tmpIn)
          .outputOptions([
            "-vf", "scale=-2:360",        // 360p, width kept even
            "-c:v", "libx264",
            "-b:v", "500k",
            "-preset", "veryfast",
            "-c:a", "aac",
            "-b:a", "64k",
            "-movflags", "+faststart",    // web-optimised → instant progressive play
          ])
          .on("end", resolve)
          .on("error", reject)
          .save(tmpOut);
      });
      await bucket.upload(tmpOut, {
        destination: proxyPath,
        metadata: { contentType: "video/mp4", cacheControl: "public,max-age=86400" },
      });
      logger.info(`Proxy written: ${proxyPath}`);
    } catch (err) {
      logger.error(`Proxy failed for ${base}: ${err && err.message}`);
      throw err;
    } finally {
      [tmpIn, tmpOut].forEach((p) => { try { fs.unlinkSync(p); } catch (e) {} });
    }
  }
);

/**
 * Mirror direct-Storage deletes back into the catalogue (self-healing).
 *
 * When a footage original is deleted — Firebase console, gsutil, or the master ✕ —
 * remove its RTDB upload record(s) and delete its 360p proxy. So deleting a file
 * straight in Storage now "just works": it disappears from every club view and
 * leaves no orphan record or orphan proxy. Deletes of a proxy itself are ignored
 * (no record points at a proxy, and it stops any delete loop).
 */
exports.onFootageDeleted = onObjectDeleted(
  { bucket: BUCKET, memory: "256MiB" },
  async (event) => {
    const filePath = (event.data && event.data.name) || "";
    if (filePath.indexOf("footage/national-league-cup/") !== 0) return;
    if (filePath.indexOf("/proxies/") !== -1) return;   // a proxy was deleted → nothing to reconcile

    // 1) Drop any upload record(s) pointing at this file (uploads aren't indexed
    //    on storagePath, so read the small node and match).
    try {
      const ref = admin.database().ref("app-data/media-footage/uploads");
      const snap = await ref.once("value");
      const updates = {};
      snap.forEach((child) => {
        const v = child.val();
        if (v && v.storagePath === filePath) updates[child.key] = null;
      });
      if (Object.keys(updates).length) {
        await ref.update(updates);
        logger.info(`Removed ${Object.keys(updates).length} record(s) for deleted ${filePath}`);
      }
    } catch (err) {
      logger.error(`RTDB cleanup failed for ${filePath}: ${err && err.message}`);
    }

    // 2) Delete the matching proxy, if one was made.
    try {
      const proxyPath = "footage/national-league-cup/proxies/" + path.basename(filePath);
      await admin.storage().bucket(BUCKET).file(proxyPath).delete();
      logger.info(`Deleted proxy ${proxyPath}`);
    } catch (err) {
      // proxy may not exist (full match, or already gone) — not an error
    }
  }
);

/**
 * Per-club footage access — RTDB-mediated signed URLs (Layer 2).
 *
 * Firebase *callable* functions must be publicly invokable, which the org's Domain
 * Restricted Sharing policy forbids (allUsers invoker → 403). So instead of a
 * callable, the client writes a request to app-data/media-footage/urlRequests/<id>
 * and this EVENT-DRIVEN function (no public invoker needed) checks the caller's club
 * against the file's game (home OR away, from the CATALOGUE not the filename) and
 * writes back a short-lived (15 min) signed URL — or an error. NL staff/admin/
 * superadmin get any file.
 *
 * Caller identity — `uid` is enforced `=== auth.uid` by the RTDB write rule, so the
 * function can trust it:
 *   - Portal user  → users/<uid>/role + users/<uid>/club.
 *   - Passcode user (/club, anon) → token → app-data/media-footage/access/clubTokens/<token>.
 */
const NL_CUP_PREFIX = "footage/national-league-cup/";
function normName(s) { return String(s == null ? "" : s).trim().toLowerCase(); }

// Authorise the caller for reqPath and return a 15-min signed URL, or throw
// Error(reason) — reason is written back to the request node for the client.
async function signFootageUrl(uid, token, reqPath) {
  if (typeof reqPath !== "string" || reqPath.indexOf(NL_CUP_PREFIX) !== 0 || reqPath.indexOf("..") !== -1)
    throw new Error("bad-path");

  const userSnap = await admin.database().ref("users/" + uid).once("value");
  const user = userSnap.val() || {};
  const role = user.role || "";
  const nlFull = role === "superadmin" || role === "admin" || role === "staff";
  let club = user.club || null;                        // portal club user
  if (!nlFull && !club && token) {                     // passcode /club user
    const tSnap = await admin.database()
      .ref("app-data/media-footage/access/clubTokens/" + token).once("value");
    club = tSnap.val() || null;
  }
  if (!nlFull && !club) throw new Error("no-club-access");

  const original = reqPath.replace(NL_CUP_PREFIX + "proxies/", NL_CUP_PREFIX);
  if (!nlFull) {
    const [catSnap, upSnap] = await Promise.all([
      admin.database().ref("app-data/media-footage/data").once("value"),
      admin.database().ref("app-data/media-footage/uploads").once("value"),
    ]);
    const cat = catSnap.val() || {};
    const clubsByCode = {};
    (cat.clubs || []).forEach((c) => { if (c && c.code) clubsByCode[c.code] = c; });
    const gamesById = {};
    (cat.games || []).forEach((g) => { if (g && g.id) gamesById[g.id] = g; });

    let game = null;
    const ups = upSnap.val() || {};
    for (const k in ups) {
      if (ups[k] && ups[k].storagePath === original) { game = gamesById[ups[k].gameId] || null; break; }
    }
    if (!game) {
      (cat.games || []).forEach((g) => {
        (g.files || []).forEach((f) => { if (f && f.storagePath === original) game = g; });
      });
    }
    if (!game) throw new Error("file-not-recognised");

    const myClub = normName(club);
    const homeName = normName((clubsByCode[game.home] || {}).name);
    const awayName = normName((clubsByCode[game.away] || {}).name);
    if (myClub !== homeName && myClub !== awayName) throw new Error("not-your-club");
  }

  let signPath = reqPath;
  if (reqPath.indexOf(NL_CUP_PREFIX + "proxies/") === 0) {
    const [exists] = await admin.storage().bucket(BUCKET).file(reqPath).exists();
    if (!exists) signPath = original;
  }
  // v4 signing uses the IAM SignBlob API (Token Creator + IAM Credentials API),
  // which is what a keyless Cloud Functions runtime has (v2/default needs a key).
  const [url] = await admin.storage().bucket(BUCKET).file(signPath)
    .getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 15 * 60 * 1000 });
  return url;
}

exports.onFootageUrlRequest = onValueCreated(
  { ref: "/app-data/media-footage/urlRequests/{id}", region: "europe-west2" },
  async (event) => {
    const ref = event.data.ref;
    const req = event.data.val() || {};
    if (req.url || req.error) return;   // already fulfilled (idempotent)
    try {
      const url = await signFootageUrl(req.uid || "", req.token || null, req.path || "");
      await ref.child("url").set(url);
    } catch (err) {
      logger.error(`urlRequest failed (${req.path}): ${err && err.message}`);
      await ref.child("error").set(String((err && err.message) || "error"));
    }
  }
);
