/**
 * NL Cup Footage — 360p preview proxy.
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
const { onObjectFinalized } = require("firebase-functions/v2/storage");
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
