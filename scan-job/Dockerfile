# Brand Exposure — the measuring job, containerised for Cloud Run.
#
# This runs the SAME scripts/board-exposure-match.py that runs on a laptop. Not
# a cloud port of it, not a reimplementation — the identical file, invoked with
# the flags a person would type. Two implementations of the detector would drift
# within a month and nobody would notice, because the failure looks like a
# number rather than an error.
#
# The image carries no reference artwork and no credentials. Both arrive at run
# time: the references from Firebase Storage, the ingest key from Secret
# Manager. That keeps the image publishable and the artwork where it belongs.
FROM python:3.12-slim

# ffmpeg is the frame extractor and the proxy encoder. libGL and libglib are
# what opencv-python-headless still links against on slim — without them the
# import fails at runtime with a bare "libGL.so.1: cannot open shared object
# file", which reads like a missing package rather than a missing system lib.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg libgl1 libglib2.0-0 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Pinned, and separate from the app copy so a script edit does not re-resolve
# the wheels. opencv-python-headless rather than opencv-python: there is no
# display here and the GUI build pulls in a great deal that cannot be used.
COPY scan-job/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# The detector, the report builder, the uploader, the eval helpers and the
# CLI, unchanged. The eval module is imported by the CLI (parse_clock lives
# there), so leaving it out breaks the container at import time, not scan time.
COPY scripts/board_exposure_core.py \
     scripts/board_exposure_report.py \
     scripts/board_exposure_upload.py \
     scripts/board_exposure_eval.py \
     scripts/board-exposure-match.py \
     scripts/board-exposure-sweep.py \
     ./scripts/
# The answer sheets ride in the image so a sweep can be started with just a
# filename — BE_MODE=sweep BE_LABELS=<file>. They are hand-labelled truth,
# already public in the repo, and a few KB.
COPY system/board-exposure/labels/ ./labels/
COPY scan-job/run_job.py .

# Cloud Run Jobs give the container /tmp as tmpfs, which counts against memory.
# The job writes frames and a proxy there, so the task needs enough memory for
# both — see the deploy workflow, which sets it explicitly rather than leaving
# it at the 512Mi default that a 90-minute match blows through in minutes.
ENV PYTHONUNBUFFERED=1

ENTRYPOINT ["python", "run_job.py"]
