"""
Engine 1.1's gap-tracking, exercised against synthetic footage.

Two layers, split by what CI can run:

  · gap_candidates — the pure selection rule that IS the precision guard
    (bounded gaps only, capped length). Runs everywhere.
  · find_patch — the OpenCV template chase. Runs wherever opencv + numpy are
    installed (a scanning laptop, the scan container); skipped in CI, which
    deliberately installs neither. The synthetic frames here were verified
    against cv2 5.0.0 at build time, including the negative case — a tracker
    test with no "board has gone" case would pass while inventing exposure,
    which is the exact failure the correlation floor exists to stop.

Run: python3 -m unittest discover -s tests -p 'test_*.py'
"""
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))


def _stub_if_missing(name):
    """True if `name` is genuinely uninstallable here and was stubbed.

    The stub is an EMPTY module: it exists only so `import board_exposure_core`
    succeeds far enough to reach gap_candidates, which touches neither library.
    Nothing behavioural is faked — any test that would actually call into cv2
    or numpy is skipped below, never run against the stub (the lesson of the
    signInWithCustomToken stub: a fake that answers is a fake that lies).
    """
    try:
        __import__(name)
        return False
    except ImportError:
        sys.modules[name] = types.ModuleType(name)
        return True


HAVE_CV = not (_stub_if_missing("cv2") | _stub_if_missing("numpy"))
if HAVE_CV:
    import cv2
    import numpy as np
import board_exposure_core as C                        # noqa: E402


class GapCandidates(unittest.TestCase):
    def test_bounded_gaps_only(self):
        # 1..3 and 5..7 are bounded, fillable gaps; 9..19 is over the cap; and
        # nothing exists before 0 or after 20 to anchor an unbounded fill.
        self.assertEqual(C.gap_candidates([0, 4, 8, 20], 4), [(0, 4), (4, 8)])

    def test_gap_longer_than_cap_is_left_alone(self):
        self.assertEqual(C.gap_candidates([0, 10], 4), [])

    def test_adjacent_detections_have_no_gap(self):
        self.assertEqual(C.gap_candidates([3, 4, 5], 4), [])

    def test_duplicates_and_order_do_not_matter(self):
        self.assertEqual(C.gap_candidates([8, 4, 4, 0], 4), [(0, 4), (4, 8)])


def board_frame(x, blur_px=0, with_board=True, seed=7):
    """
    A 640x360 frame: noise background and (optionally) a board at horizontal
    position x — translated between frames like a pan, optionally smeared with
    a horizontal box kernel like one.

    The board is a solid ground with bold lettering, because that is what a
    perimeter board IS — structure that survives a low-pass. An earlier draft
    used random noise as the board texture and the tracker "failed" at corr
    0.35: noise is precisely the texture blur destroys, and a noise-textured
    board would defeat human eyes and SIFT alike. Fixtures must be as easy and
    as hard as the real thing, in the right ways.
    """
    rng = np.random.default_rng(seed)
    frame = rng.integers(60, 90, (360, 640, 3), dtype=np.uint8)
    if with_board:
        board = np.zeros((40, 160, 3), np.uint8)
        board[:] = (40, 160, 40)
        cv2.putText(board, "ACME", (8, 30), cv2.FONT_HERSHEY_SIMPLEX,
                    1.0, (255, 255, 255), 4)
        cv2.rectangle(board, (120, 8), (150, 32), (255, 255, 255), -1)
        frame[200:240, x:x + 160] = board
    if blur_px:
        k = np.ones((1, blur_px), np.float32) / blur_px
        frame = cv2.filter2D(frame, -1, k)
    return frame


@unittest.skipUnless(HAVE_CV, "opencv-python-headless + numpy not installed")
class FindPatch(unittest.TestCase):
    BBOX = (100, 200, 260, 240)

    def test_follows_a_pan_through_motion_blur(self):
        prev = board_frame(100)
        # 60px of travel and 15px of horizontal smear — a real pan's worth
        # between two samples half a second apart.
        cur = board_frame(160, blur_px=15)
        r = C.find_patch(prev, self.BBOX, cur)
        self.assertIsNotNone(r)
        (x0, y0, _, _), corr = r
        self.assertGreaterEqual(corr, C.TRACK_MIN_CORR)
        self.assertLess(abs(x0 - 160), 12)
        self.assertLess(abs(y0 - 200), 12)

    def test_refuses_when_the_board_is_gone(self):
        # A cut to the crowd: same noise statistics, no board. If this ever
        # passes the correlation floor, tracking is inventing exposure.
        prev = board_frame(100)
        cur = board_frame(0, with_board=False, seed=11)
        r = C.find_patch(prev, self.BBOX, cur)
        if r is not None:
            self.assertLess(r[1], C.TRACK_MIN_CORR)

    def test_chains_across_a_gap(self):
        # Three blurred frames between two sharp ones, board sliding right.
        frames = [board_frame(100),
                  board_frame(140, blur_px=12),
                  board_frame(180, blur_px=18),
                  board_frame(220, blur_px=12),
                  board_frame(260)]
        bbox = self.BBOX
        xs = []
        for prev, cur in zip(frames, frames[1:]):
            r = C.find_patch(prev, bbox, cur)
            self.assertIsNotNone(r)
            bbox, corr = r
            self.assertGreaterEqual(corr, C.TRACK_MIN_CORR)
            xs.append(bbox[0])
        for found, actual in zip(xs, [140, 180, 220, 260]):
            self.assertLess(abs(found - actual), 14)

    def test_degenerate_box_returns_none(self):
        prev = board_frame(100)
        self.assertIsNone(C.find_patch(prev, (5, 5, 12, 9), prev))


def _load_match_module():
    import importlib.util
    p = os.path.join(os.path.dirname(__file__), "..", "scripts",
                     "board-exposure-match.py")
    spec = importlib.util.spec_from_file_location("bem", p)
    bem = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bem)
    return bem


@unittest.skipUnless(HAVE_CV, "opencv-python-headless + numpy not installed")
class CloseBlurredGaps(unittest.TestCase):
    """The whole pass, against frames on disk: detections at samples 0 and 4,
    a three-sample gap between them."""

    def _run(self, cut_middle):
        import tempfile
        bem = _load_match_module()
        d = tempfile.mkdtemp()
        files = []
        for i, x in enumerate([100, 140, 180, 220, 260]):
            f = board_frame(x, blur_px=(14 if 0 < i < 4 else 0),
                            with_board=not (cut_middle and i == 2))
            p = os.path.join(d, f"f{i}.png")
            cv2.imwrite(p, f)
            files.append(p)
        real = {"scope": "partner",
                "quad": [[100, 200], [260, 200], [260, 240], [100, 240]],
                "board": None, "logo_area": 2.8, "area": 2.8,
                "inliers": 30, "clarity": 0.6}
        far = dict(real, quad=[[260, 200], [420, 200], [420, 240], [260, 240]])
        h = {0: {"ACME": [real]}, 4: {"ACME": [far]}}
        return bem.close_blurred_gaps(h, files, 0.5), h

    def test_pan_gap_is_filled_with_tracked_hits(self):
        n, h = self._run(cut_middle=False)
        self.assertEqual(n, 3)
        self.assertEqual(sorted(h), [0, 1, 2, 3, 4])
        for i in (1, 2, 3):
            (t,) = h[i]["ACME"]
            self.assertTrue(t["tracked"])
            self.assertEqual(t["inliers"], 0)

    def test_cut_to_the_crowd_fills_nothing(self):
        # The board vanishes at sample 2. Neither chain can account for that
        # frame, so the WHOLE gap must stay empty — filling 1 and 3 would put
        # sponsor seconds inside a crowd shot.
        n, h = self._run(cut_middle=True)
        self.assertEqual(n, 0)
        self.assertEqual(sorted(h), [0, 4])


@unittest.skipUnless(HAVE_CV, "opencv-python-headless + numpy not installed")
class SerialisedHitShape(unittest.TestCase):
    def test_synth_hit_matches_scan_serialiser(self):
        """_synth_hit must stay field-compatible with _scan's output, because
        the report, the stats and the tool read them interchangeably."""
        bem = _load_match_module()
        gray = cv2.cvtColor(board_frame(100), cv2.COLOR_BGR2GRAY)
        h = bem._synth_hit("partner", (100, 200, 260, 240), gray, 0.8)
        scan_fields = {"scope", "quad", "board", "logo_area", "area",
                       "inliers", "clarity", "visibility"}
        self.assertTrue(scan_fields <= set(h))
        self.assertTrue(h["tracked"])
        self.assertEqual(h["inliers"], 0)
        # No homography behind a tracked hit, so no visibility — null, never a
        # number that pretends the coverage was measured.
        self.assertIsNone(h["visibility"])
        self.assertEqual(len(h["quad"]), 4)
        json_safe = __import__("json").dumps(h)      # must serialise as-is
        self.assertIn('"tracked": true', json_safe)


@unittest.skipUnless(HAVE_CV, "opencv-python-headless + numpy not installed")
class Visibility(unittest.TestCase):
    """The coverage judgement, against faces we control."""

    def setUp(self):
        rng = np.random.default_rng(3)
        board = np.zeros((80, 320), np.uint8)
        board[:] = 70
        cv2.putText(board, "ACME LTD", (10, 55), cv2.FONT_HERSHEY_SIMPLEX,
                    1.6, 255, 6)
        cv2.rectangle(board, (250, 15), (305, 65), 255, -1)
        self.board = board
        self.vis_ref = cv2.resize(board, (C.VIS_W, C.VIS_H))
        self.noise = rng.integers(0, 255, (80, 320), dtype=np.uint8)

    def test_unobstructed_board_scores_high(self):
        self.assertGreaterEqual(C.visibility(self.vis_ref, self.board.copy()), 0.9)

    def test_flat_board_is_not_called_hidden(self):
        # A solid panel has no texture to correlate; the brightness fallback is
        # what keeps a plain green board from scoring as half-covered.
        flat = np.full((80, 320), 70, np.uint8)
        flat_ref = cv2.resize(flat, (C.VIS_W, C.VIS_H))
        self.assertGreaterEqual(C.visibility(flat_ref, flat.copy()), 0.9)

    def test_half_covered_board_scores_low(self):
        covered = self.board.copy()
        covered[:, :160] = self.noise[:, :160]        # a body across half of it
        v = C.visibility(self.vis_ref, covered)
        self.assertLess(v, C.VIS_BLOCKED)
        self.assertLess(v, C.visibility(self.vis_ref, self.board.copy()))

    def test_none_face_is_none(self):
        self.assertIsNone(C.visibility(self.vis_ref, None))
        self.assertIsNone(C.visibility(None, self.board))


if __name__ == "__main__":
    unittest.main()
