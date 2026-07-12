/**
 * NL Cup Footage — 360p preview proxy.
 *
 * Trigger: a file finalised under `footage/incoming/` in the nl-tools bucket.
 * For previewable types only (HL / CLIPS — full matches are download-only), make
 * a small 360p ~500 kbps faststart MP4 and store it at `footage/proxies/<name>`.
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

exports.makeProxy = onObjectFinalized(
  { bucket: BUCKET, memory: "2GiB", cpu: 2, timeoutSeconds: 540 },
  async (event) => {
    const obj = event.data;
    const filePath = obj.name || "";

    // Only originals under footage/incoming/, .mp4, and not a proxy re-trigger.
    if (filePath.indexOf("footage/incoming/") !== 0) return;
    if (!/\.mp4$/i.test(filePath)) return;

    const base = path.basename(filePath);
    // Type is the 4th underscore token: YYYY-MM-DD_HOME_AWAY_TYPE_VARIANT.mp4
    const type = (base.split("_")[3] || "").toUpperCase();
    const previewable = type === "HL" || type === "CLIPS" || /CLIPS/i.test(base);
    if (!previewable) {
      logger.info(`Skipping non-previewable file: ${base}`);
      return;
    }

    const bucket = admin.storage().bucket(obj.bucket || BUCKET);
    const proxyPath = "footage/proxies/" + base;

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
