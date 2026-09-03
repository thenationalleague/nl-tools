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



class RelaySurvivesItsPut(unittest.TestCase):
    """The Harrogate scan of 02/09/2026: a progress upload failed with a
    stale token, storage_put die()d inside the relay, and an hour of scan
    went with it. A status row is a courtesy to the card; it must never
    outrank the run."""

    def setUp(self):
        self.J = _load_run_job()
        self.d = tempfile.mkdtemp()
        self.path = os.path.join(self.d, "progress.json")
        self.calls = 0

    def write(self, phase):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump({"phase": phase}, f)

    def failing_put(self, path):
        self.calls += 1
        raise self.J.UploadError("uploading progress failed: 401 Unauthorized")

    def test_a_raising_put_is_counted_and_swallowed(self):
        relay = self.J.ProgressRelay(self.path, self.failing_put, every=20)
        self.write("scan")
        self.assertFalse(relay.relay(1000.0, force=True))   # did not raise
        self.assertEqual(relay.failed, 1)
        self.write("finish")
        relay.relay(1040.0, force=True)                     # still trying
        self.assertEqual(self.calls, 2)
        self.assertEqual(relay.failed, 2)

    def test_run_relaying_returns_the_scan_rc_even_when_every_put_fails(self):
        relay = self.J.ProgressRelay(self.path, self.failing_put, every=20)
        self.write("scan")
        rc = self.J.run_relaying([sys.executable, "-c", "raise SystemExit(0)"],
                                 relay, poll=0.05)
        self.assertEqual(rc, 0)
        self.assertGreaterEqual(relay.failed, 1)


class TokenLife(unittest.TestCase):
    """The metadata server caches tokens: a re-mint on a 45-minute clock can
    receive one with fifteen minutes left. The token has to be refreshed on
    the server's own expiry, with a margin, not on ours."""

    def setUp(self):
        self.J = _load_run_job()
        self.clock = _Clock(0.0)
        self.mints = 0

    def mint_short(self):
        self.mints += 1
        return (f"tok{self.mints}", 600.0)        # ten minutes of life

    def test_refreshes_before_the_server_expiry_not_at_the_cap(self):
        t = self.J.Token(mint=self.mint_short, clock=self.clock)
        self.assertEqual(t.get(), "tok1")
        self.clock.now = 600.0 - self.J.TOKEN_MARGIN - 1   # just inside the margin
        self.assertEqual(t.get(), "tok1")
        self.clock.now = 600.0 - self.J.TOKEN_MARGIN       # margin reached
        self.assertEqual(t.get(), "tok2")

    def test_a_long_lived_token_still_hits_the_cap(self):
        t = self.J.Token(mint=lambda: ("long", 3600.0), clock=self.clock)
        t.get()
        self.clock.now = self.J.TOKEN_TTL - 1
        self.assertEqual(t.get(), "long")
        mints = []
        t._mint = lambda: (mints.append(1) or "again", 3600.0)
        self.clock.now = self.J.TOKEN_TTL
        self.assertEqual(t.get(), "again")

    def test_a_bare_string_mint_falls_back_to_the_cap(self):
        n = []
        t = self.J.Token(mint=lambda: (n.append(1) or f"s{len(n)}"), clock=self.clock)
        self.assertEqual(t.get(), "s1")
        self.clock.now = self.J.TOKEN_TTL - 1
        self.assertEqual(t.get(), "s1")
        self.clock.now = self.J.TOKEN_TTL
        self.assertEqual(t.get(), "s2")


if __name__ == "__main__":
    unittest.main()
