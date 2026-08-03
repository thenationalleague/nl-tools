/**
 * NL Tools — Cloud Functions.
 *   makeProxy         — makes the 360p preview proxy on upload (below).
 *   onFootageDeleted  — mirrors Storage deletes back to the catalogue (bottom).
 *   consumeInvite / submitAccessRequest / withdrawAccessRequest
 *                     — account-lifecycle callables (server-minted roles).
 *                       See account.js and system/rtdb/SECURITY-role-self-grant.md.
 *   programmeEnter / programmeClaim
 *                     — Programme Packs passcode → scoped `pClub` claim, so
 *                       Storage/RTDB rules can enforce write-own for passcode
 *                       (non-portal) clubs. See programme.js.
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
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const os = require("os");
const path = require("path");
const fs = require("fs");

/* Explicit databaseURL: the RTDB lives in europe-west1, and the SDK's guessed
   default (<project>.firebaseio.com) only serves US instances — connecting to
   it hangs forever. Symptom when missing: any function touching RTDB stalls
   to its timeout (seen live 25/07/2026 on consumeInvite). */
admin.initializeApp({
  databaseURL: "https://nl-tools-default-rtdb.europe-west1.firebasedatabase.app",
});
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
// Account-lifecycle callables (invite acceptance, access requests) — the
// server-side role writes that closed the self-grant hole. Kept in their own
// module; exported from here so `firebase deploy --only functions` sees them.
Object.assign(exports, require("./account"));

// Programme Packs passcode → scoped-claim callables (programmeEnter /
// programmeClaim). Same reason as above: exported here so a plain
// `firebase deploy --only functions` picks them up. See functions/programme.js.
Object.assign(exports, require("./programme"));

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
