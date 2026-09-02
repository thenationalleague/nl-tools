"""
Board-exposure progress — a small JSON file the job keeps current, so the
tool can show a percentage that is a measurement rather than an estimate.

The scan and the audition each report through one of these: the phase they
are in, how far through it they are, and when the phase began. run_job.py
copies the file to Storage on a timer while the script runs; the poller
function copies it onto the request record every minute; the tool draws
it. The card's estimate ("about 8 min", "past the estimate") was a guess
from the clip length, and on 02/09/2026 it read "-1%" on one card and
"21 min so far · past the ~15 min estimate" on the next. Richard: a
percentage has to be a percentage of actual progress.

Shape, one row:

    {"phase": "scan", "done": 214, "total": 370,
     "at": 1756800000.0, "phase_at": 1756799400.0}

`total` is 0 for a phase with no countable steps (frame extraction, the
proxy build) — the tool shows the phase's name and holds the bar. Phases:
scan   extract · scan · finish · proxy · upload · done
audition   score · audit · relaxed · crops · done

Writes are atomic (temp file + rename) and rate-limited, so a frame loop
can tick every frame without thrashing the disk. A Progress built on None
is a no-op, so scripts run unchanged when nobody asked for a file.
"""
import json
import os
import time

MIN_INTERVAL = 1.0      # seconds between writes; phase changes always write
FIELDS = ("phase", "done", "total", "at", "phase_at")


class Progress:
    def __init__(self, path, clock=time.time):
        self.path = path
        self._clock = clock
        self.phase_name = None
        self.total = 0
        self.done = 0
        self.phase_at = 0.0
        self._last = 0.0

    def phase(self, name, total=0):
        """Enter a phase. `total` is how many steps it has, 0 when unknown."""
        self.phase_name = str(name)
        self.total = max(0, int(total or 0))
        self.done = 0
        self.phase_at = self._clock()
        self._write(force=True)

    def tick(self, done, total=None):
        """Steps completed in the current phase."""
        self.done = max(0, int(done))
        if total is not None:
            self.total = max(0, int(total))
        self._write()

    def finish(self):
        self.phase_name = "done"
        self.done = self.total
        self._write(force=True)

    def row(self):
        return {"phase": self.phase_name, "done": self.done, "total": self.total,
                "at": round(self._clock(), 1), "phase_at": round(self.phase_at, 1)}

    def _write(self, force=False):
        if not self.path:
            return
        now = self._clock()
        if not force and now - self._last < MIN_INTERVAL:
            return
        self._last = now
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.row(), f)
        os.replace(tmp, self.path)


def read(path):
    """The row in a progress file, or None when there is no readable row —
    a missing file, a half-written one, or a shape this module never wrote."""
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        return None
    if not isinstance(d, dict) or not all(k in d for k in FIELDS):
        return None
    try:
        return {"phase": str(d["phase"]), "done": max(0, int(d["done"])),
                "total": max(0, int(d["total"])),
                "at": float(d["at"]), "phase_at": float(d["phase_at"])}
    except (TypeError, ValueError):
        return None
