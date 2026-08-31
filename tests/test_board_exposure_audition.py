"""
The audition pass's pure logic, plus the one guard that must never leak.

Same split as the tracking and diagnose tests: window planning, sharpest
selection, crop budgeting and verdict assembly run everywhere; numpy-backed
crop clipping is skipped where numpy is genuinely absent, never stubbed.

The load-bearing test here is RelaxedFloorRestores: the candidate pass
lowers the engine's inlier floor inside a context manager, and a leaked
floor would silently turn every LATER real detection into a 4-inlier
phantom factory. The test raises mid-block and demands the floor back.

Run: python3 -m unittest discover -s tests -p 'test_*.py'
"""
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))


from _bexp_cv import HAVE_CV  # noqa: E402 — one probe for all four files;
# private copies poisoned each other under discover (see _bexp_cv.py)
CV2_STUBBED = NUMPY_STUBBED = not HAVE_CV

import board_exposure_audition as A  # noqa: E402


class PlanWindows(unittest.TestCase):
    def test_short_footage_clamps_window_count(self):
        # 60s at the default 300 windows would sample sub-second slivers;
        # the clamp holds every window to at least 2s of footage.
        planned = A.plan_windows(60.0, windows=300, per_window=3)
        self.assertEqual(len(planned), 30)

    def test_samples_spread_inside_each_window(self):
        planned = A.plan_windows(100.0, windows=10, per_window=3)
        _, times = planned[0]
        self.assertEqual(len(times), 3)
        self.assertTrue(all(0.0 < t < 10.0 for t in times))
        self.assertEqual(times, sorted(times))


class PickSharpest(unittest.TestCase):
    PLANNED = [(0, [1.0, 2.0, 3.0]), (1, [11.0, 12.0, 13.0])]

    def test_sharpest_candidate_wins_each_window(self):
        scores = {1.0: 5.0, 2.0: 50.0, 3.0: 7.0, 11.0: 9.0, 12.0: 1.0, 13.0: 2.0}
        self.assertEqual(A.pick_sharpest(self.PLANNED, scores), [2.0, 11.0])

    def test_undecodable_window_contributes_nothing(self):
        self.assertEqual(A.pick_sharpest(self.PLANNED, {12.0: 3.0}), [12.0])


class DiverseTop(unittest.TestCase):
    def hit(self, t, n):
        return {"t": t, "inliers": n}

    def test_burst_cannot_spend_the_budget(self):
        # Three strong hits within one second, one weaker hit a minute away:
        # the spread rule keeps one of the burst and the distant one.
        hits = [self.hit(10.0, 30), self.hit(10.5, 29), self.hit(11.0, 28),
                self.hit(70.0, 9)]
        kept = A.diverse_top(hits, keep=2, spread=10.0)
        self.assertEqual([h["t"] for h in kept], [10.0, 70.0])

    def test_returned_in_time_order(self):
        hits = [self.hit(90.0, 50), self.hit(5.0, 40)]
        self.assertEqual([h["t"] for h in A.diverse_top(hits, keep=2)],
                         [5.0, 90.0])


class Verdicts(unittest.TestCase):
    ENTRIES = [("TIC Health", "/refs/partners/TIC Health/TIC Health.png",
                "partner")]

    def test_dead_reference_reads_as_dead(self):
        rows = A.verdict_rows({}, self.ENTRIES)
        self.assertEqual(rows[0]["fired"], 0)
        self.assertIsNone(rows[0]["best"])

    def test_best_hit_carries_its_crop(self):
        hs = [{"t": 5.0, "inliers": 9, "area": 0.3, "clarity": 0.5,
               "crop": None},
              {"t": 40.0, "inliers": 22, "area": 1.1, "clarity": 0.8,
               "crop": "audition-tic-health-40s-22i.png"}]
        row = A.verdict_rows({("TIC Health", "TIC Health.png"): hs},
                             self.ENTRIES)[0]
        self.assertEqual(row["fired"], 2)
        self.assertEqual(row["best"]["inliers"], 22)
        self.assertEqual(row["best"]["crop"],
                         "audition-tic-health-40s-22i.png")


class RelaxedFloorRestores(unittest.TestCase):
    def test_floor_survives_an_exception(self):
        core = types.SimpleNamespace(MIN_INLIERS=7)
        with self.assertRaises(RuntimeError):
            with A.relaxed_floor(core, 4):
                self.assertEqual(core.MIN_INLIERS, 4)
                raise RuntimeError("mid-audition crash")
        self.assertEqual(core.MIN_INLIERS, 7)


@unittest.skipIf(NUMPY_STUBBED, "numpy not installed here; runs in the container")
class CropBoard(unittest.TestCase):
    def test_board_box_clips_to_frame(self):
        import numpy as np

        frame = np.zeros((100, 200, 3), dtype="uint8")
        img = A.crop_board(frame, {"board": (-10, -10, 50, 40)})
        self.assertEqual(img.shape[:2], (40, 50))

    def test_degenerate_box_returns_none(self):
        import numpy as np

        frame = np.zeros((100, 200, 3), dtype="uint8")
        self.assertIsNone(A.crop_board(frame, {"board": (10, 10, 12, 90)}))


if __name__ == "__main__":
    unittest.main()
