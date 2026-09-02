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


class Furniture(unittest.TestCase):
    """Audition 1.1: the scan's furniture rules run before any crop is
    harvested, through the scan's own strip functions. The pure paths use
    the real core with plain lists — no OpenCV near them."""

    def quad(self, cx, cy, w=60, h=30):
        return [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2],
                [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]]

    def hit(self, cx, cy, inliers):
        return {"quad": self.quad(cx, cy), "mc": [cx, cy], "inliers": inliers,
                "t": 1.0, "ref": "DAZN.png"}

    def test_corner_watermark_stripped_perimeter_board_kept(self):
        import board_exposure_core as C

        row = {"DAZN": [self.hit(90, 60, 30),      # top-left corner: the bug
                        self.hit(960, 900, 12)]}   # low in frame: a board
        kept, gone = A.furniture_row(C, 0, row, 1920, 1080, None)
        self.assertEqual(gone["corner"], {"DAZN": 1})
        self.assertEqual(gone["mask"], {})
        self.assertEqual([h["inliers"] for h in kept["DAZN"]], [12])

    def test_frame_with_only_furniture_reads_as_empty(self):
        # The loop counts a frame starved when nothing real survives — a
        # sponsor whose only hits are the watermark must not read as fired.
        import board_exposure_core as C

        row = {"DAZN": [self.hit(1850, 40, 40)]}
        kept, gone = A.furniture_row(C, 3, row, 1920, 1080, None)
        self.assertEqual(kept, {})
        self.assertEqual(gone["corner"], {"DAZN": 1})

    def test_static_rule_runs_over_the_whole_sample_set(self):
        # The same sixteen pixels in most of the match's stretches is
        # furniture at any share — the permanence tier, on audition samples.
        import board_exposure_core as C

        hits = {}
        for n in range(0, 120, 3):
            hits[n] = {"DAZN": [self.hit(700, 500, 20)]}     # bolted on
        for n in (5, 40, 80):
            hits[n] = {"DAZN": [self.hit(300 + 90 * n, 950, 15)]}  # moves
        total = {}
        A.merge_counts(total, C.strip_static(hits, 120))
        self.assertEqual(total, {"DAZN": 40})
        survivors = [h for row in hits.values() for h in row["DAZN"]]
        self.assertEqual(sorted(h["inliers"] for h in survivors), [15, 15, 15])

    def test_merge_counts_accumulates(self):
        total = {"DAZN": 2}
        A.merge_counts(total, {"DAZN": 3, "Enterprise": 1})
        self.assertEqual(total, {"DAZN": 5, "Enterprise": 1})

    @unittest.skipIf(NUMPY_STUBBED, "numpy not installed here; runs in the container")
    def test_masked_hit_stripped(self):
        import numpy as np
        import board_exposure_core as C

        # Mid-frame, where the corner rule cannot claim it: only the mask
        # (a score bug, say, bolted to the centre-bottom) can.
        mask = np.zeros((1080, 1920), bool)
        mask[900:1000, 860:1060] = True
        row = {"DAZN": [self.hit(960, 950, 30)]}
        kept, gone = A.furniture_row(C, 0, row, 1920, 1080, mask)
        self.assertEqual(gone["corner"], {})
        self.assertEqual(gone["mask"], {"DAZN": 1})
        self.assertEqual(kept, {})

    @unittest.skipIf(not HAVE_CV, "opencv-python-headless + numpy not installed")
    def test_mask_from_grays_matches_the_file_path(self):
        # The audition reads its spread from the video; the scan from files.
        # Same frames in, same mask out — or the two paths have drifted.
        import tempfile

        import cv2
        import numpy as np
        import board_exposure_core as C

        rng = np.random.default_rng(7)
        frames = []
        for k in range(24):
            f = rng.integers(40, 110, (360, 640), dtype=np.uint8)
            f = cv2.GaussianBlur(f, (9, 9), 0)
            x = 40 + 18 * k
            cv2.rectangle(f, (x, 250), (x + 140, 290), 30, -1)
            cv2.putText(f, "ACME", (x + 8, 280), cv2.FONT_HERSHEY_SIMPLEX,
                        0.9, 250, 3)
            cv2.rectangle(f, (500, 20), (620, 70), 245, 2)
            cv2.putText(f, "TV", (518, 60), cv2.FONT_HERSHEY_SIMPLEX,
                        1.2, 245, 4)
            frames.append(f)
        d = tempfile.mkdtemp()
        files = []
        for i, f in enumerate(frames):
            p = os.path.join(d, f"f{i:03d}.png")
            cv2.imwrite(p, f)
            files.append(p)
        via_files, info_f = C.build_furniture_mask(files)
        via_grays, info_g = C.furniture_mask_from_grays(frames)
        self.assertIsNotNone(via_grays)
        self.assertTrue(via_grays[45, 560])
        self.assertFalse(via_grays[270, 300])
        self.assertTrue(np.array_equal(via_files, via_grays))
        self.assertEqual(info_f, info_g)


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
