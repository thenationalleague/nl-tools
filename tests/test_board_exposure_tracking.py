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


def quad_at(x, y, w=160, h=40):
    return {"quad": [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]}


class StaticFurniture(unittest.TestCase):
    """The 1.2 rule that deletes measurements — pure, so CI runs it.

    A watermark holds one screen position for the whole broadcast; no real
    board can, because the camera never stops moving. These pin both the
    catch and, more importantly, what must NOT be caught."""

    def test_watermark_is_stripped_and_board_survives(self):
        hits = {}
        for i in range(100):
            hits[i] = {"DAZN": [quad_at(1700, 80)]}          # bolted to the frame
            if i % 3 == 0:
                hits[i]["Enterprise"] = [quad_at(200 + 7 * i, 500)]   # pans about
        gone = C.strip_static(hits, 100)
        self.assertEqual(gone, {"DAZN": 100})
        self.assertTrue(all("DAZN" not in row for row in hits.values()))
        self.assertTrue(any("Enterprise" in row for row in hits.values()))

    def test_share_is_of_all_samples_not_detected_ones(self):
        # Present in 20 of 100 samples: a fifth of the match, under the 30%
        # line, stays — even though it is 100% of its own detections.
        hits = {i: {"DAZN": [quad_at(1700, 80)]} for i in range(20)}
        self.assertEqual(C.strip_static(hits, 100), {})
        self.assertEqual(len(hits), 20)

    def test_jitter_within_a_cell_still_counts_as_one_position(self):
        hits = {i: {"DAZN": [quad_at(1700 + (i % 3) * 4, 80 + (i % 2) * 3)]}
                for i in range(50)}
        self.assertEqual(C.strip_static(hits, 100), {"DAZN": 50})

    def test_a_sponsor_keeps_moving_hits_when_its_overlay_goes(self):
        # The real DAZN case: a watermark AND genuine boards. Only the fixed
        # position dies; the moving detections keep their seconds.
        hits = {}
        for i in range(100):
            hits[i] = {"DAZN": [quad_at(1700, 80)]}
            if 40 <= i < 52:
                hits[i]["DAZN"].append(quad_at(300 + 15 * (i - 40), 620))
        gone = C.strip_static(hits, 100)
        self.assertEqual(gone, {"DAZN": 100})
        kept = [i for i, row in hits.items() if row.get("DAZN")]
        self.assertEqual(kept, list(range(40, 52)))

    def test_empty_and_zero_samples_are_safe(self):
        self.assertEqual(C.strip_static({}, 100), {})
        self.assertEqual(C.strip_static({0: {"X": [quad_at(0, 0)]}}, 0), {})

    def test_wandering_box_with_locked_features_is_furniture(self):
        # The watermark that beat 1.2: partial matches anchor different parts
        # of the wide reference, so the projected box's centre wanders hundreds
        # of pixels — but the matched features never leave the overlay. 13% of
        # samples, spread across the whole match: the fine rule's exact target.
        hits = {}
        for k, i in enumerate(range(0, 989, 8)):        # ~12.5%, full span
            h = quad_at(1200 + (k % 9) * 90, 80 + (k % 4) * 30)
            h["mc"] = [1701.0 + (k % 3), 121.0 + (k % 2)]
            hits[i] = {"DAZN": [h]}
        gone = C.strip_static(hits, 989)
        self.assertEqual(gone, {"DAZN": len(range(0, 989, 8))})
        self.assertEqual(hits, {})

    def test_one_spell_at_a_spot_survives_the_fine_rule(self):
        # A board CAN hold a position through one long spell — 10% of samples
        # but all in the first quarter fails the span condition and stays.
        hits = {}
        for k, i in enumerate(range(0, 99)):
            h = quad_at(400, 500)
            h["mc"] = [450.0, 520.0]
            hits[i] = {"Enterprise": [h]}
        self.assertEqual(C.strip_static(hits, 989), {})
        self.assertEqual(len(hits), 99)

    def test_hits_without_mc_are_immune_to_the_fine_rule(self):
        # Old exports and tracked fills carry no matched-feature centroid; the
        # aggressive rule must never condemn what it cannot see.
        hits = {}
        for i in range(0, 989, 8):
            hits[i] = {"DAZN": [quad_at(1200 + (i % 90) * 9, 80)]}
        self.assertEqual(C.strip_static(hits, 989), {})


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

    def test_an_impostor_face_scores_under_the_reject_floor(self):
        # Richard's ruling at 4:10-4:27: white capitals on black matched a
        # DIFFERENT black board for 17 seconds. Judged on the textured cells
        # only — visibility()'s flat fallback would let any dark board vouch
        # for any other, which is precisely how a first draft of this floor
        # failed its own test (impostor 0.47 on visibility).
        impostor = np.zeros((80, 320), np.uint8)
        impostor[:] = 20
        cv2.putText(impostor, "ZORBA LTD", (10, 55), cv2.FONT_HERSHEY_SIMPLEX,
                    1.5, 255, 6)
        self.assertLess(C.face_agreement(self.vis_ref, impostor), C.VIS_REJECT)
        # And the floor must not eat a genuine but half-covered board: the
        # visible half's lettering still agrees.
        covered = self.board.copy()
        covered[:, :160] = self.noise[:, :160]
        self.assertGreaterEqual(C.face_agreement(self.vis_ref, covered),
                                C.VIS_REJECT)

    def test_a_textureless_reference_cannot_judge(self):
        flat = np.full((80, 320), 70, np.uint8)
        flat_ref = cv2.resize(flat, (C.VIS_W, C.VIS_H))
        self.assertIsNone(C.face_agreement(flat_ref, self.board))


@unittest.skipUnless(HAVE_CV, "opencv-python-headless + numpy not installed")
class FaceCheckInDetect(unittest.TestCase):
    """The guard wired into detect(), end to end on a synthetic frame."""

    def _detect(self, frame):
        sift = cv2.SIFT_create(nfeatures=6000)
        refs, _ = C.build_refs(
            [("ACME", self._ref_path, "partner")], sift)
        return C.detect(frame, refs, sift, cv2.BFMatcher(cv2.NORM_L2))

    def setUp(self):
        import tempfile
        rng = np.random.default_rng(9)
        board = np.zeros((40, 160, 3), np.uint8)
        board[:] = (40, 160, 40)
        cv2.putText(board, "ACME", (8, 30), cv2.FONT_HERSHEY_SIMPLEX,
                    1.0, (255, 255, 255), 4)
        cv2.rectangle(board, (120, 8), (150, 32), (255, 255, 255), -1)
        self._ref_path = tempfile.mktemp(suffix=".png")
        cv2.imwrite(self._ref_path,
                    cv2.resize(board, (480, 120),
                               interpolation=cv2.INTER_NEAREST))
        frame = rng.integers(60, 90, (360, 640, 3), dtype=np.uint8)
        frame[240:, :] = (45, 150, 45)                # grass under the board
        frame[200:240, 200:360] = board
        self.frame = frame

    def test_a_real_board_passes_the_face_check(self):
        hits = self._detect(self.frame)
        self.assertIn("ACME", hits)
        self.assertGreaterEqual(hits["ACME"][0]["visibility"], C.VIS_REJECT)

    def test_the_guard_actually_guards(self):
        # Sabotage from the other side: force every face to read as an
        # impostor and the same board must now be rejected — proving the
        # comparison in detect() is live, not decorative.
        real = C.face_agreement
        C.face_agreement = lambda *a: 0.0
        try:
            self.assertEqual(self._detect(self.frame), {})
        finally:
            C.face_agreement = real


class PermanenceTier(unittest.TestCase):
    """Engine 1.5's half of the fine rule — Richard's ruling as code:
    "anything permanently on screen is not a board." Pure, so CI runs it.

    The 1.4 rerun proved the share tier alone is gameable by accident: the
    face check thinned the watermark to ~5% of samples, under the 8% floor,
    and 50+ phantom seconds walked back in. Permanence judges presence
    across the match's separate stretches instead — no real board re-lands
    on one 16px feature cell in five of eight windows of a broadcast."""

    def _watermark(self, idxs, cell_mc=(1701.0, 121.0)):
        hits = {}
        for k, i in enumerate(idxs):
            h = quad_at(1200 + (k % 9) * 90, 80 + (k % 4) * 30)
            h["mc"] = [cell_mc[0] + (k % 3), cell_mc[1] + (k % 2)]
            hits[i] = {"DAZN": [h]}
        return hits

    def test_five_percent_watermark_spread_across_the_match_is_stripped(self):
        # 50 of 989 samples — half the old share floor — but present in every
        # eighth of the video. Exactly the 1.4 leak, exactly the ruling.
        hits = self._watermark(range(0, 989, 20))
        gone = C.strip_static(hits, 989)
        self.assertEqual(gone, {"DAZN": 50})
        self.assertEqual(hits, {})

    def test_one_long_spell_is_not_permanence(self):
        # A real board CAN hold a spot for a fifth of the match in ONE spell —
        # 200 consecutive samples span two windows, not five, and survive.
        hits = self._watermark(range(0, 200), cell_mc=(450.0, 520.0))
        self.assertEqual(C.strip_static(hits, 989), {})
        self.assertEqual(len(hits), 200)

    def test_a_handful_of_flickers_never_condemns_a_cell(self):
        # Six lone samples in six windows sit under the absolute floor
        # (2% of samples): permanence needs presence, not coincidence.
        hits = self._watermark(range(0, 989, 165))
        self.assertEqual(C.strip_static(hits, 989), {})

    def test_the_tier_is_doing_the_work(self):
        # Sabotage: demand more windows than exist and the same watermark
        # must survive — proving the strip above came from the permanence
        # tier, not from the share tier catching it by accident.
        hits = self._watermark(range(0, 989, 20))
        fine = C.static_fine_positions(hits, 989, episodes=9)
        self.assertEqual(fine, {})


@unittest.skipUnless(HAVE_CV, "opencv-python-headless + numpy not installed")
class WholeFaceNcc(unittest.TestCase):
    """The 1.5 identity floor that cannot abstain. The DAZN impostors lived
    in face_agreement's abstention: a mostly-dark reference offers almost no
    textured cells, the cell test returned None, and the hit walked. Global
    NCC always has an opinion about layout."""

    def setUp(self):
        # A DAZN-shaped reference: mostly dark panel, small bright mark high
        # left, slogan block low right. Layout IS the identity.
        ref = np.full((80, 320), 15, np.uint8)
        cv2.putText(ref, "DAZN", (14, 34), cv2.FONT_HERSHEY_SIMPLEX,
                    1.1, 245, 5)
        cv2.rectangle(ref, (200, 52), (300, 70), 230, -1)
        self.ref = ref
        self.vis_ref = cv2.resize(ref, (C.VIS_W, C.VIS_H))
        # A different black board: same palette, different layout — the
        # impostor class from the 29/08 adjudication.
        imp = np.full((80, 320), 18, np.uint8)
        cv2.putText(imp, "ZORBA HIRE", (60, 66), cv2.FONT_HERSHEY_SIMPLEX,
                    1.0, 240, 5)
        cv2.rectangle(imp, (10, 8), (46, 30), 235, -1)
        self.impostor = imp

    def test_impostor_layout_fails_where_cell_test_cannot_judge(self):
        ncc = C.face_ncc(self.vis_ref, self.impostor)
        self.assertIsNotNone(ncc)
        self.assertLess(ncc, C.FACE_NCC_REJECT)
        # The point of the floor: face_ok must reject this hit even if the
        # cell test abstained or waved it through.
        self.assertFalse(C.face_ok(self.vis_ref, self.impostor))

    def test_true_board_survives_blur_and_distance(self):
        # Small on screen and smeared by a pan — the honest worst case for a
        # genuine board. Global structure survives a low-pass.
        small = cv2.resize(self.ref, (64, 16))
        k = np.ones((1, 9), np.float32) / 9
        blurred = cv2.filter2D(small, -1, k)
        self.assertGreaterEqual(C.face_ncc(self.vis_ref, blurred),
                                C.FACE_NCC_REJECT)
        self.assertTrue(C.face_ok(self.vis_ref, blurred))

    def test_half_covered_true_board_survives(self):
        rng = np.random.default_rng(5)
        covered = self.ref.copy()
        covered[:, :160] = rng.integers(0, 255, (80, 160), dtype=np.uint8)
        self.assertGreaterEqual(C.face_ncc(self.vis_ref, covered),
                                C.FACE_NCC_REJECT)

    def test_featureless_sides_abstain(self):
        flat = np.full((80, 320), 70, np.uint8)
        self.assertIsNone(C.face_ncc(cv2.resize(flat, (C.VIS_W, C.VIS_H)),
                                     flat))
        self.assertIsNone(C.face_ncc(self.vis_ref, None))
        self.assertIsNone(C.face_ncc(None, self.ref))


@unittest.skipUnless(HAVE_CV, "opencv-python-headless + numpy not installed")
class TrackedFaceCheck(unittest.TestCase):
    """Engine 1.5: the tracker answers the identity question too. Same
    frames-on-disk harness as CloseBlurredGaps, now with reference faces."""

    def _run(self, faces):
        import tempfile
        bem = _load_match_module()
        d = tempfile.mkdtemp()
        files = []
        for i, x in enumerate([100, 140, 180, 220, 260]):
            f = board_frame(x, blur_px=(14 if 0 < i < 4 else 0))
            p = os.path.join(d, f"f{i}.png")
            cv2.imwrite(p, f)
            files.append(p)
        real = {"scope": "partner",
                "quad": [[100, 200], [260, 200], [260, 240], [100, 240]],
                "board": None, "logo_area": 2.8, "area": 2.8,
                "inliers": 30, "clarity": 0.6}
        far = dict(real, quad=[[260, 200], [420, 200], [420, 240], [260, 240]])
        h = {0: {"ACME": [real]}, 4: {"ACME": [far]}}
        return bem.close_blurred_gaps(h, files, 0.5, faces), h

    def _acme_face(self):
        board = np.zeros((40, 160, 3), np.uint8)
        board[:] = (40, 160, 40)
        cv2.putText(board, "ACME", (8, 30), cv2.FONT_HERSHEY_SIMPLEX,
                    1.0, (255, 255, 255), 4)
        cv2.rectangle(board, (120, 8), (150, 32), (255, 255, 255), -1)
        return cv2.resize(cv2.cvtColor(board, cv2.COLOR_BGR2GRAY),
                          (C.VIS_W, C.VIS_H))

    def test_matching_face_still_fills_through_blur(self):
        # The recall tracking exists for: blurred true patches must PASS,
        # or the face check un-ships engine 1.1.
        n, h = self._run({"ACME": [self._acme_face()]})
        self.assertEqual(n, 3)
        self.assertEqual(sorted(h), [0, 1, 2, 3, 4])

    def test_wrong_face_stops_the_chain(self):
        # The 4:10-4:27 mechanism: anchors exist, patches track cleanly, but
        # the patch is not this sponsor's board. A dark different-layout face
        # for "ACME" means every patch fails identity and the gap stays open.
        imp = np.full((C.VIS_H, C.VIS_W), 15, np.uint8)
        cv2.putText(imp, "ZORBA", (30, 34), cv2.FONT_HERSHEY_SIMPLEX,
                    0.9, 245, 3)
        n, h = self._run({"ACME": [imp]})
        self.assertEqual(n, 0)
        self.assertEqual(sorted(h), [0, 4])

    def test_no_faces_means_no_check(self):
        n, h = self._run(None)
        self.assertEqual(n, 3)

    def test_the_gate_is_live(self):
        # Sabotage: an impossible floor must stop even the matching face —
        # proving the fill above passed BECAUSE of the check, not despite it.
        old = C.FACE_NCC_REJECT
        C.FACE_NCC_REJECT = 0.99
        try:
            n, _ = self._run({"ACME": [self._acme_face()]})
            self.assertEqual(n, 0)
        finally:
            C.FACE_NCC_REJECT = old


class GraphicsCorners(unittest.TestCase):
    """Engine 1.6, rule one: broadcast furniture lives in the top corners;
    a board's matched features never do — zero of 643 genuine hits across
    two grounds. Pure, so CI runs it."""

    def test_corner_membership(self):
        self.assertTrue(C.in_graphics_corner(1900, 120, 1920, 1080))
        self.assertTrue(C.in_graphics_corner(100, 100, 1920, 1080))
        self.assertFalse(C.in_graphics_corner(960, 120, 1920, 1080))   # top centre
        self.assertFalse(C.in_graphics_corner(1900, 500, 1920, 1080))  # right edge, low
        self.assertFalse(C.in_graphics_corner(960, 540, 1920, 1080))   # mid-frame

    def test_watermark_class_stripped_boards_kept(self):
        wm = quad_at(1200, 80)                 # projected box wanders mid-frame
        wm["mc"] = [1901.0, 121.0]             # matched features locked top-right
        board = quad_at(400, 500)
        board["mc"] = [460.0, 520.0]
        hits = {0: {"DAZN": [dict(wm)], "Enterprise": [dict(board)]},
                1: {"DAZN": [dict(wm)]}}
        gone = C.strip_corner(hits, 1920, 1080)
        self.assertEqual(gone, {"DAZN": 2})
        self.assertEqual(sorted(hits), [0])
        self.assertIn("Enterprise", hits[0])
        self.assertNotIn("DAZN", hits[0])

    def test_no_dims_means_no_strip(self):
        wm = quad_at(1700, 40)
        wm["mc"] = [1901.0, 121.0]
        hits = {0: {"DAZN": [wm]}}
        self.assertEqual(C.strip_corner(hits, 0, 0), {})
        self.assertEqual(len(hits), 1)


@unittest.skipUnless(HAVE_CV, "opencv-python-headless + numpy not installed")
class FurnitureMask(unittest.TestCase):
    """Engine 1.6, rule two — Richard's frame-stack probe: overlay an even
    spread of frames; whatever persists is furniture."""

    W, H = 640, 360

    def _frames(self, n=24, bug=True, translucent=False, locked=False,
                seed=2):
        rng = np.random.default_rng(seed)
        out = []
        for k in range(n):
            if locked:
                f = np.full((self.H, self.W), 90, np.uint8)
                cv2.putText(f, "PITCH", (200, 200),
                            cv2.FONT_HERSHEY_SIMPLEX, 2.0, 200, 8)
                f = f + rng.integers(0, 2, f.shape, dtype=np.uint8)
            else:
                # A moving world. Softened noise, deliberately: raw per-pixel
                # noise carries strong gradients EVERYWHERE, and half of them
                # agree with any threshold by coin-flip — a fixture like that
                # masks the whole frame and proves nothing about real video,
                # where the background is smooth-ish structure that MOVES.
                f = rng.integers(40, 110, (self.H, self.W), dtype=np.uint8)
                f = cv2.GaussianBlur(f, (9, 9), 0)
                x = 40 + 18 * k
                cv2.rectangle(f, (x, 250), (x + 140, 290), 30, -1)
                cv2.putText(f, "ACME", (x + 8, 280),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.9, 250, 3)
            if bug:
                if translucent:
                    over = np.full((50, 120), 10, np.uint8)
                    cv2.putText(over, "TV", (18, 40),
                                cv2.FONT_HERSHEY_SIMPLEX, 1.2, 255, 4)
                    roi = f[20:70, 500:620].astype(np.float32)
                    f[20:70, 500:620] = (0.5 * roi + 0.5 * over.astype(
                        np.float32)).astype(np.uint8)
                else:
                    cv2.rectangle(f, (500, 20), (620, 70), 245, 2)
                    cv2.putText(f, "TV", (518, 60),
                                cv2.FONT_HERSHEY_SIMPLEX, 1.2, 245, 4)
            out.append(f)
        return out

    def _write(self, frames):
        import tempfile
        d = tempfile.mkdtemp()
        files = []
        for i, f in enumerate(frames):
            p = os.path.join(d, f"f{i:03d}.png")
            cv2.imwrite(p, f)
            files.append(p)
        return files

    def test_opaque_bug_masked_moving_board_not(self):
        mask, info = C.build_furniture_mask(self._write(self._frames()))
        self.assertIsNotNone(mask)
        self.assertTrue(mask[45, 560])                 # inside the bug
        self.assertFalse(mask[270, 300])               # on the board's path
        self.assertLess(info["coverage"], C.FURN_MAX_COVERAGE)

    def test_translucent_bug_still_masked(self):
        # Half-alpha fill wobbles with the background; the OUTLINE persists,
        # which is why the probe judges edges rather than colours.
        mask, info = C.build_furniture_mask(
            self._write(self._frames(translucent=True)))
        self.assertIsNotNone(mask)
        self.assertTrue(mask[40:60, 510:600].any())

    def test_locked_camera_stands_down(self):
        mask, info = C.build_furniture_mask(
            self._write(self._frames(locked=True)))
        self.assertIsNone(mask)
        self.assertIn("locked", info["why"])

    def test_impossible_agreement_masks_nothing(self):
        # Sabotage from the other side: demand 101% persistence and the same
        # bug must survive — proving the mask above came from the agreement
        # test, not from dilation or thresholding accidents.
        mask, _ = C.build_furniture_mask(self._write(self._frames()),
                                         agree=1.01)
        self.assertTrue(mask is None or not mask.any())

    def test_strip_masked_removes_by_centre_and_none_is_noop(self):
        mask = np.zeros((360, 640), bool)
        mask[20:70, 500:620] = True
        bug = quad_at(500, 20, w=120, h=50)
        bug["mc"] = [560.0, 45.0]
        board = quad_at(100, 250)
        hits = {0: {"DAZN": [bug, dict(board)]}}
        gone = C.strip_masked(hits, mask)
        self.assertEqual(gone, {"DAZN": 1})
        self.assertEqual(len(hits[0]["DAZN"]), 1)
        self.assertEqual(C.strip_masked({0: {"X": [dict(board)]}}, None), {})


@unittest.skipUnless(HAVE_CV, "opencv-python-headless + numpy not installed")
class CompactExportKeys(unittest.TestCase):
    """The shipped detections.json dialect. The tracked flag was absent from
    every real export until 1.5 — the eval's tracked column read zero while
    the in-memory pipeline showed real counts, and nobody could see which
    phantoms tracking had grown. The compact row now carries "t" and "v",
    sparsely, and this pins the contract."""

    def test_compact_rows_carry_t_and_v_sparsely(self):
        import importlib.util, tempfile
        p = os.path.join(os.path.dirname(__file__), "..", "scripts",
                         "board_exposure_report.py")
        spec = importlib.util.spec_from_file_location("ber", p)
        R = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(R)
        detected = {"scope": "partner", "quad": [[0, 0], [10, 0], [10, 5], [0, 5]],
                    "board": None, "logo_area": 1.0, "area": 1.0,
                    "inliers": 20, "clarity": 0.5, "visibility": 0.4231}
        tracked = dict(detected, inliers=0, tracked=True, visibility=None)
        meta = {"interval": 0.5, "duration": 10.0, "n_samples": 20,
                "video_w": 1920, "video_h": 1080, "match": "T v T",
                "club": "", "sub": "", "foot": "", "source": ""}
        payload, _ = R.build(tempfile.mktemp(suffix=".html"), meta,
                             {3: {"X": [detected, tracked]}}, {},
                             {"X": "partner"})
        det_row, trk_row = payload["hits"]["3"]["X"]
        self.assertNotIn("t", det_row)
        self.assertEqual(det_row["v"], 0.423)
        self.assertEqual(trk_row["t"], 1)
        self.assertNotIn("v", trk_row)
        self.assertEqual(trk_row["n"], 0)


if __name__ == "__main__":
    unittest.main()
