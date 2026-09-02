#!/usr/bin/env python3
"""
Brand Exposure — one match, measured on Cloud Run.

Fetches the references and the uploaded video out of Firebase Storage, then
runs scripts/board-exposure-match.py exactly as a person would on a laptop and
lets it upload its own results. This file is plumbing; it contains no detection
logic and must never grow any. Two implementations of the detector would drift
inside a month and the drift would show up as a number, not an error.

Two identities, on purpose
--------------------------
  · READS  use the runtime service account through the metadata server. It is
    granted objectViewer and nothing more, so this job can fetch artwork and
    footage and cannot write a byte.
  · WRITES use an ingest key, from Secret Manager, exactly as the laptop does —
    which buys a token scoped to the one match named in the environment. A
    service-account key with write access would be a credential that could
    overwrite every match in the tool; this one can overwrite the match it was
    asked to measure and nothing else.

The source video is not deleted here, for the same reason: this job cannot
delete anything. Whoever started it clears up after a successful run.

Environment (all set by the trigger, none baked into the image):
    BE_BUCKET          nl-tools.firebasestorage.app
    BE_VIDEO           object path of the uploaded source, under uploads/
    BE_CLUB            home club, must match a refs/clubs/<name> folder
    BE_MATCH           'Home v Away'
    BE_DATE            YYYY-MM-DD
    BE_START, BE_END   optional kick-off / final whistle, '18:30' style
    BE_HT, BE_RESTART  optional half-time whistle / second-half kick-off, as
                       a pair — the break between them is skipped entirely,
                       so half-time adverts never count and its frames are
                       never billed
    BE_REFERENCE_SET   complete | partial
    BE_SOURCE_TYPE     optional full | highlights — how the footage is
                       recorded on the report. Absent = derived from
                       duration (>45 min = full).
    BE_SPONSORS        optional comma list of reference FOLDER names — scan
                       only these. Empty means everything. A subset makes the
                       scan reference-set partial whatever BE_REFERENCE_SET
                       says (the match script enforces it).
    BE_INGEST_KEY      the key, injected from Secret Manager
    BE_REFS_PREFIX     default brand-exposure/refs
    BE_FPS             optional sample rate override
    BE_MODE            scan (default) | sweep | diagnose | audition — sweep
                       trials the sensitivity grid against a labels file and
                       uploads nothing; diagnose measures what a finished
                       scan's missed frames look like (blur / compression /
                       starvation) and writes diagnose.json beside the
                       export; audition runs the per-reference casting call
                       on a few hundred sharpest-in-window frames and writes
                       audition.json + candidate crops to BE_DEST for the
                       tool's tick/untick view
    BE_LABELS          sweep + diagnose: a labels filename baked into the
                       image under /app/labels (from
                       system/board-exposure/labels/), or a bucket object
                       path to download
    BE_DETECTIONS      diagnose only: bucket object path of the finished
                       scan's export, e.g.
                       brand-exposure/<match-id>/detections.json — the
                       diagnose output lands in the same folder
    BE_DEST            audition only: bucket folder the outputs land in,
                       e.g. brand-exposure/<match-id> — explicit like
                       BE_DETECTIONS, so nothing re-derives a match id
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

METADATA = ("http://metadata.google.internal/computeMetadata/v1/"
            "instance/service-accounts/default/token")
STORAGE = "https://storage.googleapis.com/storage/v1/b/{bucket}/o"
WORK = "/tmp/be"


def log(msg):
    print(f"[scan] {msg}", flush=True)


def die(msg, code=2):
    print(f"[scan] FAILED: {msg}", file=sys.stderr, flush=True)
    sys.exit(code)


def env(name, default=None, required=False):
    v = os.environ.get(name, default)
    if required and not v:
        # Almost always a re-run typed short. The run parameters arrive as
        # execution overrides — `execute --update-env-vars=…` — which apply to
        # one execution and are never written to the job, so a bare `execute`
        # starts a container with none of them and dies here in five seconds.
        # Saying so is the whole point: the bare failure looks like a broken
        # image, and once cost half an hour of blaming an innocent deploy.
        die(f"{name} is not set. Every run must pass the full "
            f"--update-env-vars=… list; it is a per-execution override and does "
            f"not persist on the job, so a shortened re-run arrives with "
            f"nothing set. See system/board-exposure/CLOUD.md.")
    return v


def access_token():
    """A token for the runtime service account, from the metadata server.

    No key file and no google-cloud-storage dependency — the metadata server is
    always there on Cloud Run and this is twenty lines against a library that
    would be twenty megabytes.
    """
    req = urllib.request.Request(METADATA, headers={"Metadata-Flavor": "Google"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())["access_token"]
    except urllib.error.URLError as e:
        die(f"could not reach the metadata server for a token: {e.reason}. "
            f"This only runs on Cloud Run.")


TOKEN_TTL = 45 * 60     # the metadata server's tokens live an hour; re-mint well inside it


class Token:
    """The runtime service account's access token, re-minted once it is
    TOKEN_TTL old. Storage calls take one of these and ask for the string at
    request time, never at the top of main().

    This file used to fetch one token before the video download and hand the
    same string to every call, including the uploads at the very end. A scan
    never noticed: its results go up through the match script's own
    ingest-key sign-in, minted at upload time. An audition and a diagnose
    write through THIS file, and on 02/09/2026 the Harrogate audition ran
    for ninety minutes on one core, finished, and died on its first upload
    with a token that had expired half an hour earlier — every result thrown
    away at the last step, the log ending in 401. Audition 1.4 makes that
    run take minutes, which hides the fault; this removes it.
    """

    def __init__(self, mint=access_token, clock=time.time):
        self._mint, self._clock = mint, clock
        self._value, self._at = None, 0.0

    def get(self):
        now = self._clock()
        if self._value is None or now - self._at >= TOKEN_TTL:
            self._value = self._mint()
            self._at = now
        return self._value


def storage_list(bucket, prefix, token):
    """Every object under a prefix. Paged, because a reference tree with a
    folder per sponsor per club goes past 1000 sooner than you would think."""
    out, page = [], None
    while True:
        q = {"prefix": prefix, "maxResults": "1000"}
        if page:
            q["pageToken"] = page
        url = STORAGE.format(bucket=bucket) + "?" + urllib.parse.urlencode(q)
        req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token.get()})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            die(f"listing {prefix} failed: {e.code} {e.reason}. "
                f"The runtime service account needs objectViewer on {bucket}.")
        out += [o["name"] for o in d.get("items", []) if not o["name"].endswith("/")]
        page = d.get("nextPageToken")
        if not page:
            return out


def storage_get(bucket, name, dest, token):
    url = (STORAGE.format(bucket=bucket) + "/" +
           urllib.parse.quote(name, safe="") + "?alt=media")
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token.get()})
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    try:
        with urllib.request.urlopen(req, timeout=1800) as r, open(dest, "wb") as f:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
    except urllib.error.HTTPError as e:
        die(f"downloading {name} failed: {e.code} {e.reason}")
    return dest


def storage_put(bucket, name, path, token):
    """Upload one file. Same twenty-lines-not-twenty-megabytes reasoning as
    the token fetch; the runtime service account already writes this bucket.
    Content type follows the extension — a PNG stored as application/json
    is a download the tool's <img> tags cannot show."""
    ctype = ("image/png" if name.endswith(".png") else "application/json")
    url = (STORAGE.format(bucket=bucket).replace(
        "/storage/v1/", "/upload/storage/v1/") + "?" +
        urllib.parse.urlencode({"uploadType": "media", "name": name}))
    with open(path, "rb") as f:
        body = f.read()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": "Bearer " + token.get(),
        "Content-Type": ctype,
    })
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            r.read()
    except urllib.error.HTTPError as e:
        die(f"uploading {name} failed: {e.code} {e.reason}. The runtime "
            f"service account needs roles/storage.objectAdmin on {bucket} "
            f"(objectCreator alone cannot overwrite on a re-run) — the "
            f"one-time grant is recorded in "
            f"system/board-exposure/uploader-spec.md.")


def fetch_refs(bucket, prefix, token):
    """Mirror the reference tree out of Storage into the layout the scan expects.

    Folder-as-configuration is the whole contract — refs/partners/<Sponsor>/ is
    searched at every ground, refs/clubs/<Club>/<Sponsor>/ only at that one — so
    the prefix is stripped and the rest of the path is kept exactly as stored.
    """
    prefix = prefix.rstrip("/") + "/"
    names = storage_list(bucket, prefix, token)
    if not names:
        die(f"no references under {prefix}. Nothing to look for, so the scan "
            f"would report every sponsor as absent — which is a lie, not a zero.")
    refs = os.path.join(WORK, "refs")
    for n in names:
        rel = n[len(prefix):]
        if not rel or rel.startswith("."):
            continue
        storage_get(bucket, n, os.path.join(refs, rel), token)
    log(f"references: {len(names)} files under {prefix}")
    return refs


def main():
    t0 = time.time()
    bucket = env("BE_BUCKET", "nl-tools.firebasestorage.app")
    mode = env("BE_MODE", "scan")
    video_obj = env("BE_VIDEO", required=True)
    club = env("BE_CLUB", required=True)
    # A sweep names no match and uploads nothing, so it needs neither the
    # fixture nor the ingest key; a scan needs all of them.
    match = env("BE_MATCH", required=mode == "scan")
    date = env("BE_DATE", required=mode == "scan")
    key = env("BE_INGEST_KEY", required=mode == "scan")
    ref_set = env("BE_REFERENCE_SET", "partial")
    start, end = env("BE_START"), env("BE_END")

    os.makedirs(WORK, exist_ok=True)
    token = Token()

    # Diagnose reads an existing export instead of matching references, so
    # the reference tree (and the ingest key that lives in it) stays unfetched.
    refs = None
    if mode != "diagnose":
        refs = fetch_refs(bucket, env("BE_REFS_PREFIX", "brand-exposure/refs"),
                          token)
        # The key goes where the scan already looks for it, rather than adding
        # a second way of supplying one. One code path, already tested.
        if key:
            with open(os.path.join(refs, "ingest-key.txt"), "w",
                      encoding="utf-8") as f:
                f.write(key + "\n")

    log(f"fetching {video_obj}")
    video = storage_get(bucket, video_obj,
                        os.path.join(WORK, os.path.basename(video_obj)), token)
    log(f"video: {os.path.getsize(video) / 1e6:.0f} MB in {time.time() - t0:.0f}s")

    diagnose_out = diagnose_obj = None
    if mode in ("sweep", "diagnose"):
        name = env("BE_LABELS", required=True)
        baked = os.path.join("labels", os.path.basename(name))
        if os.path.exists(baked):
            labels = baked
        else:
            labels = storage_get(bucket, name, os.path.join(WORK, "labels.csv"),
                                 token)

    if mode == "sweep":
        # Trial run: same frames, a grid of sensitivities, scored against the
        # hand-labelled answer sheet. Writes nothing to the tool — the table in
        # this log IS the output.
        cmd = [sys.executable, "scripts/board-exposure-sweep.py",
               "--video", video, "--refs", refs, "--labels", labels,
               "--club", club, "--out-dir", WORK]
    elif mode == "diagnose":
        # Post-mortem on a finished scan: what do the missed frames look like?
        # Reads the export it names, writes diagnose.json into the same match
        # folder, touches neither the tool nor the references.
        det_obj = env("BE_DETECTIONS", required=True)
        det = storage_get(bucket, det_obj, os.path.join(WORK, "detections.json"),
                          token)
        diagnose_out = os.path.join(WORK, "diagnose.json")
        diagnose_obj = det_obj.rsplit("/", 1)[0] + "/diagnose.json"
        cmd = [sys.executable, "scripts/board_exposure_diagnose.py",
               "--detections", det, "--labels", labels,
               "--video", video, "--out", diagnose_out]
    elif mode == "audition":
        # The casting call: which references earn their place on this footage,
        # plus candidate crops for the tool's tick/untick view. Writes
        # audition.json and audition-*.png into BE_DEST, bills nothing.
        audition_dest = env("BE_DEST", required=True).strip("/")
        audition_out = os.path.join(WORK, "audition")
        cmd = [sys.executable, "scripts/board_exposure_audition.py",
               "--video", video, "--refs", refs, "--club", club,
               "--out-dir", audition_out]
        if match:
            cmd += ["--match", match]
        if date:
            cmd += ["--date", date]
    else:
        cmd = [sys.executable, "scripts/board-exposure-match.py",
               "--video", video, "--refs", refs,
               "--club", club, "--match", match, "--date", date,
               "--reference-set", ref_set,
               "--out-dir", os.path.join(WORK, "out"),
               "--upload", "-y"]
        if start:
            cmd += ["--start", start]
        if end:
            cmd += ["--end", end]
        if env("BE_HT") and env("BE_RESTART"):
            cmd += ["--ht", env("BE_HT"), "--restart", env("BE_RESTART")]
        if env("BE_FPS"):
            cmd += ["--fps", env("BE_FPS")]
        if env("BE_SPONSORS"):
            cmd += ["--sponsors", env("BE_SPONSORS")]
        if env("BE_SOURCE_TYPE") in ("full", "highlights"):
            cmd += ["--source-type", env("BE_SOURCE_TYPE")]

    log("scanning — this is the long part")
    # Streamed, not captured: Cloud Run's log tail is the only progress anyone
    # can see while this runs, and buffering it to the end would make a
    # forty-minute job look identical to a hung one.
    rc = subprocess.call(cmd)
    if rc != 0:
        die(f"the scan exited {rc}. The log above is the scan's own output.", rc)

    if mode == "diagnose":
        storage_put(bucket, diagnose_obj, diagnose_out, token)
        log(f"diagnose.json -> {diagnose_obj} (download it from the match "
            f"folder, same as the export)")
    elif mode == "audition":
        names = sorted(os.listdir(audition_out))
        for n in names:
            storage_put(bucket, f"{audition_dest}/{n}",
                        os.path.join(audition_out, n), token)
        log(f"{len(names)} audition file(s) -> {audition_dest}/ — open the "
            f"tool's Audition view to tick candidates into references")

    log(f"done in {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
