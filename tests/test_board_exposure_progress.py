"""
The progress row — the one file the scan and the audition keep current so
the tool's card can show a measurement rather than an estimate — and the
relay in run_job.py that copies it up.

Run: python3 -m unittest discover -s tests -p 'test_*.py'
"""
import importlib.util
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import board_exposure_progress as PG  # noqa: E402


class _Clock:
    def __init__(self, now=1000.0):
        self.now = now

    def __call__(self):
        return self.now


class ProgressRow(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.path = os.path.join(self.d, "progress.json")
        self.clock = _Clock()

    def row(self):
        with open(self.path, encoding="utf-8") as f:
            return json.load(f)

    def test_phase_writes_at_once_and_tick_fills_it_in(self):
        p = PG.Progress(self.path, clock=self.clock)
        p.phase("scan", 370)
        self.assertEqual(self.row(), {"phase": "scan", "done": 0, "total": 370,
                                      "at": 1000.0, "phase_at": 1000.0})
        self.clock.now = 1601.0
        p.tick(214)
        self.assertEqual(self.row()["done"], 214)
        self.assertEqual(self.row()["at"], 1601.0)
        self.assertEqual(self.row()["phase_at"], 1000.0)

    def test_ticks_are_rate_limited_but_phases_are_not(self):
        p = PG.Progress(self.path, clock=self.clock)
        p.phase("scan", 10)
        self.clock.now += 0.2
        p.tick(1)                       # inside the interval: not written
        self.assertEqual(self.row()["done"], 0)
        self.clock.now += PG.MIN_INTERVAL
        p.tick(2)
        self.assertEqual(self.row()["done"], 2)
        self.clock.now += 0.1
        p.phase("finish")               # a phase change always lands
        self.assertEqual(self.row()["phase"], "finish")
        self.assertEqual(self.row()["total"], 0)

    def test_finish_is_a_full_row(self):
        p = PG.Progress(self.path, clock=self.clock)
        p.phase("scan", 370)
        p.finish()
        self.assertEqual(self.row()["phase"], "done")
        self.assertEqual(self.row()["done"], 370)

    def test_no_path_is_a_no_op(self):
        p = PG.Progress(None)
        p.phase("scan", 3)
        p.tick(1)
        p.finish()                       # and nothing was written anywhere
        self.assertEqual(os.listdir(self.d), [])

    def test_read_takes_only_its_own_shape(self):
        p = PG.Progress(self.path, clock=self.clock)
        p.phase("audit", 92)
        self.assertEqual(PG.read(self.path)["total"], 92)
        self.assertIsNone(PG.read(os.path.join(self.d, "missing.json")))
        with open(self.path, "w", encoding="utf-8") as f:
            f.write('{"phase": "scan", "done": 1')      # half written
        self.assertIsNone(PG.read(self.path))
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump({"phase": "scan", "done": "many", "total": 3,
                       "at": 1, "phase_at": 1}, f)
        self.assertIsNone(PG.read(self.path))


def _load_run_job():
    path = os.path.join(os.path.dirname(__file__), "..", "scan-job", "run_job.py")
    spec = importlib.util.spec_from_file_location("run_job", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class Relay(unittest.TestCase):
    """run_job's relay: the file goes up when it changed and the interval
    has passed, always when forced, never when it does not exist."""

    def setUp(self):
        self.J = _load_run_job()
        self.d = tempfile.mkdtemp()
        self.path = os.path.join(self.d, "progress.json")
        self.puts = []
        self.relay = self.J.ProgressRelay(self.path, self.puts.append, every=20)

    def write(self, phase):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump({"phase": phase}, f)

    def test_missing_file_is_not_an_upload(self):
        self.assertFalse(self.relay.relay(100.0))
        self.assertFalse(self.relay.relay(100.0, force=True))
        self.assertEqual(self.puts, [])

    def test_changed_and_due_goes_up_once(self):
        self.write("fetch")
        self.assertTrue(self.relay.relay(100.0))
        self.assertFalse(self.relay.relay(105.0))       # not due
        self.assertFalse(self.relay.relay(130.0))       # due, unchanged
        self.write("scan")
        os.utime(self.path, (200, 200))                 # a visible change
        self.assertTrue(self.relay.relay(160.0))
        self.assertEqual(self.puts, [self.path, self.path])

    def test_force_ignores_the_interval(self):
        self.write("done")
        self.assertTrue(self.relay.relay(100.0))
        self.assertTrue(self.relay.relay(101.0, force=True))
        self.assertEqual(len(self.puts), 2)

    def test_run_relaying_forces_the_last_row_after_exit(self):
        # A script that writes its row and exits: the relay must carry the
        # final row up even though the interval has not passed.
        script = os.path.join(self.d, "job.py")
        with open(script, "w", encoding="utf-8") as f:
            f.write("import json,sys\n"
                    "json.dump({'phase':'done'}, open(sys.argv[1],'w'))\n")
        rc = self.J.run_relaying([sys.executable, script, self.path], self.relay,
                                 poll=0.05)
        self.assertEqual(rc, 0)
        self.assertEqual(self.puts, [self.path])
        self.assertEqual(self.J.run_relaying([sys.executable, "-c", "raise SystemExit(3)"],
                                             None, poll=0.05), 3)


if __name__ == "__main__":
    unittest.main()
