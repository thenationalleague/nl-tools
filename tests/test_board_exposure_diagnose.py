"""
The recall diagnostic's pure logic, plus its one cv2 measure.

Split the same way as the tracking tests: classification, starvation
accounting and verdict wording run everywhere; the blockiness measure runs
wherever numpy is installed and is skipped in CI, never faked — a stub that
answered would only prove the test agrees with itself.

Run: python3 -m unittest discover -s tests -p 'test_*.py'
"""
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))


def _stub_if_missing(name):
    try:
        __import__(name)
        return False
    except ImportError:
        sys.modules[name] = types.ModuleType(name)
        return True


CV2_STUBBED = _stub_if_missing("cv2")
NUMPY_STUBBED = _stub_if_missing("numpy")

import board_exposure_diagnose as D  # noqa: E402


def hit(n=9, t=0, a=1.0):
    h = {"n": n, "a": a}
    if t:
        h["t"] = 1
    return h


class TruthSamples(unittest.TestCase):
    def test_grace_trims_span_edges(self):
        # Span 10..20 at 0.5s sampling with 0.75 grace: first scored sample
        # is 11.0, last is 19.0 — the same exclusion the eval applies, so the
        # diagnostic counts exactly the eval's misses.
        idx = D.truth_sample_indices({"X": [(10.0, 20.0)]}, (0.0, 100.0),
                                     0.5, 200)["X"]
        self.assertEqual(min(idx) * 0.5, 11.0)
        self.assertEqual(max(idx) * 0.5, 19.0)

    def test_window_bounds_apply(self):
        idx = D.truth_sample_indices({"X": [(0.0, 100.0)]}, (10.0, 20.0),
                                     0.5, 400)["X"]
        self.assertTrue(all(10.0 <= i * 0.5 <= 20.0 for i in idx))


class Classify(unittest.TestCase):
    TRUTH = {"X": [4, 5, 6]}

    def test_three_shelves(self):
        hits = {4: {"X": [hit(n=9)]},           # real detection
                5: {"X": [hit(n=0, t=1)]}}      # synthetic fill only
        c = D.classify(self.TRUTH, hits)["X"]
        self.assertEqual(c, {4: "found", 5: "tracked", 6: "missed"})

    def test_tracked_never_counts_as_found(self):
        # The initiation ledger's integrity: a minted fill at n=0 must stay on
        # its own shelf even alongside another sponsor's real hit.
        hits = {4: {"X": [hit(n=0, t=1)], "Y": [hit(n=12)]}}
        self.assertEqual(D.classify({"X": [4]}, hits)["X"][4], "tracked")


class Starvation(unittest.TestCase):
    def test_zoom_proxy_spans_all_sponsors(self):
        hits = {7: {"X": [], "Y": [hit(a=2.0)]}}
        self.assertEqual(D.zoom_proxy(hits, 7), 2.0)
        self.assertIsNone(D.zoom_proxy(hits, 8))

    def test_starved_misses_are_hitless_frames(self):
        truth = {"X": [1, 2]}
        hits = {2: {"Y": [hit(a=1.0)]}}  # frame 2 worked for Y; frame 1 empty
        agg = D.aggregate(D.classify(truth, hits), {}, hits)["X"]
        self.assertEqual(agg["missed"], 2)
        self.assertEqual(agg["missed_starved"], 1)


class Verdict(unittest.TestCase):
    BASE = {"missed": 10, "missed_starved": 0,
            "sharp_found_pooled": 100.0, "sharp_missed_pooled": 100.0,
            "block_found_pooled": 1.0, "block_missed_pooled": 1.0}

    def test_starvation_dominant_reading(self):
        lines = " ".join(D.verdict(dict(self.BASE, missed_starved=8)))
        self.assertIn("starvation dominates", lines)

    def test_blur_signal_reading(self):
        lines = " ".join(D.verdict(dict(self.BASE, sharp_missed_pooled=50.0)))
        self.assertIn("blur variants have real work", lines)

    def test_quiet_signals_say_so(self):
        lines = " ".join(D.verdict(dict(self.BASE)))
        self.assertIn("not meaningfully softer", lines)
        self.assertIn("not what separates", lines)


@unittest.skipIf(NUMPY_STUBBED, "numpy not installed here; runs in the container")
class Blockiness(unittest.TestCase):
    def test_blocked_image_scores_above_smooth(self):
        import numpy as np

        rng = np.random.default_rng(7)
        # 8x8 constant blocks — the compression fingerprint at its crudest.
        blocks = rng.integers(0, 255, (16, 16)).astype("float32")
        blocky = np.kron(blocks, np.ones((8, 8), dtype="float32"))
        smooth = np.tile(np.linspace(0, 255, 128, dtype="float32"), (128, 1))
        self.assertGreater(D.blockiness(blocky), 1.5)
        self.assertLess(D.blockiness(smooth), 1.2)


if __name__ == "__main__":
    unittest.main()
