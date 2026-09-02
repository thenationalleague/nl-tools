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


class WidePick(unittest.TestCase):
    """Audition 1.2: the far view as a fifth pick, only when the kept set is
    all near views."""

    def hit(self, t, n, area):
        return {"t": t, "inliers": n, "area": area}

    def test_far_board_offered_when_kept_set_is_all_near(self):
        near = [self.hit(3.0, 40, 0.16), self.hit(14.0, 38, 0.15),
                self.hit(35.0, 55, 0.19)]
        far = self.hit(101.0, 8, 0.03)
        chosen = A.diverse_top(near + [far], keep=3)
        self.assertEqual([h["t"] for h in chosen], [3.0, 14.0, 35.0])
        self.assertIs(A.wide_pick(near + [far], chosen), far)

    def test_nothing_offered_when_kept_set_already_spans_scales(self):
        hits = [self.hit(3.0, 40, 0.16), self.hit(60.0, 20, 0.04),
                self.hit(101.0, 8, 0.03)]
        chosen = hits[:2]
        # 0.03 is not under half of 0.04 — the set already reaches far.
        self.assertIsNone(A.wide_pick(hits, chosen))

    def test_never_a_hit_already_kept(self):
        hits = [self.hit(3.0, 40, 0.16), self.hit(60.0, 9, 0.02)]
        self.assertIsNone(A.wide_pick(hits, hits))

    def test_empty_hits(self):
        self.assertIsNone(A.wide_pick([], []))


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


@unittest.skipIf(not HAVE_CV, "opencv-python-headless + numpy not installed")
class FrameFeaturesOnce(unittest.TestCase):
    """Audition 1.3: detect() handed precomputed frame features returns the
    same hits as detect() computing its own — only the detector call is
    saved. Proved on a synthetic frame that actually fires."""

    def test_same_hits_with_and_without_feats(self):
        import os
        import tempfile

        import cv2
        import numpy as np
        import board_exposure_core as C

        rng = np.random.default_rng(11)
        logo = np.full((120, 360, 3), 255, np.uint8)
        cv2.rectangle(logo, (0, 0), (359, 119), (20, 90, 20), 6)
        cv2.putText(logo, "ACME", (30, 85), cv2.FONT_HERSHEY_DUPLEX, 2.4, (20, 90, 20), 6)
        cv2.circle(logo, (300, 60), 34, (0, 0, 200), -1)
        cv2.putText(logo, "hire", (270, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        d = tempfile.mkdtemp()
        path = os.path.join(d, "acme.png")
        cv2.imwrite(path, logo)

        frame = np.zeros((720, 1280, 3), np.uint8)
        frame[:, :] = (40, 120, 40)
        noise = rng.integers(0, 30, (90, 160, 3), dtype=np.uint8)
        frame = cv2.add(frame, cv2.resize(noise, (1280, 720)))
        frame[0:200] = cv2.GaussianBlur(rng.integers(60, 140, (200, 1280, 3), dtype=np.uint8), (7, 7), 0)
        frame[330:450, 400:760] = logo

        sift = cv2.SIFT_create(nfeatures=C.NFEATURES)
        matcher = cv2.BFMatcher()
        refs, skipped = C.build_refs([("ACME", path, "partner")], sift)
        self.assertTrue(refs and not skipped)

        plain = C.detect(frame, refs, sift, matcher)
        primed = C.detect(frame, refs, sift, matcher, feats=C.frame_features(frame, sift))
        self.assertTrue(plain.get("ACME"), "the synthetic board must fire, or this proves nothing")
        self.assertEqual(len(plain["ACME"]), len(primed.get("ACME", [])))
        self.assertEqual([h["inliers"] for h in plain["ACME"]],
                         [h["inliers"] for h in primed["ACME"]])
        self.assertTrue(np.allclose(plain["ACME"][0]["quad"], primed["ACME"][0]["quad"]))


class StarvedSponsors(unittest.TestCase):
    """Audition 1.4: the relaxed candidate pass is a second phase, for the
    sponsors that fired on fewer than three frames across the whole clip."""

    ENTRIES = [("DAZN", "/r/partners/DAZN/a.png", "partner"),
               ("DAZN", "/r/partners/DAZN/b.png", "partner"),
               ("TIC Health", "/r/partners/TIC Health/t.png", "partner"),
               ("Utility Warehouse", "/r/partners/Utility Warehouse/u.png",
                "partner")]

    def test_fewer_than_three_frames_is_starved(self):
        frames = {"DAZN": {1.0, 5.0, 9.0}, "TIC Health": {4.0, 8.0}}
        self.assertEqual(A.starved_sponsors(frames, self.ENTRIES),
                         {"TIC Health", "Utility Warehouse"})

    def test_a_sponsor_with_several_files_is_judged_once(self):
        self.assertEqual(A.starved_sponsors({}, self.ENTRIES),
                         {"DAZN", "TIC Health", "Utility Warehouse"})

    def test_threshold_is_a_parameter(self):
        frames = {"DAZN": {1.0, 5.0, 9.0}}
        self.assertEqual(A.starved_sponsors(frames, self.ENTRIES[:1], below=4),
                         {"DAZN"})
        self.assertEqual(A.starved_sponsors(frames, self.ENTRIES[:1], below=3),
                         set())


def _acme(cv2, np):
    """The FrameFeaturesOnce board: the one that fires."""
    logo = np.full((120, 360, 3), 255, np.uint8)
    cv2.rectangle(logo, (0, 0), (359, 119), (20, 90, 20), 6)
    cv2.putText(logo, "ACME", (30, 85), cv2.FONT_HERSHEY_DUPLEX, 2.4, (20, 90, 20), 6)
    cv2.circle(logo, (300, 60), 34, (0, 0, 200), -1)
    cv2.putText(logo, "hire", (270, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                (255, 255, 255), 2)
    return logo


def _zed(cv2, np):
    """A board that is nowhere in the clip, sharing no element with ACME —
    a first draft reused ACME's border, circle and small print with a
    different word, and the engine matched it to the ACME board."""
    logo = np.full((120, 360, 3), (30, 30, 30), np.uint8)
    cv2.putText(logo, "ZED", (20, 95), cv2.FONT_HERSHEY_TRIPLEX, 3.2, (245, 245, 245), 7)
    pts = np.array([[250, 20], [340, 20], [295, 100]], np.int32)
    cv2.fillPoly(logo, [pts], (60, 200, 240))
    cv2.line(logo, (0, 110), (359, 10), (200, 200, 200), 3)
    return logo


def _write_clip(cv2, np, path, logo, seconds=8, fps=25):
    """A pitch with a crowd band and one board panning along it — the
    FrameFeaturesOnce frame, in motion. Fresh noise every frame so the
    furniture probe sees a live picture, and the board moves so the static
    rules cannot claim it."""
    rng = np.random.default_rng(3)
    w = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (1280, 720))
    if not w.isOpened():
        raise unittest.SkipTest("no mp4v encoder in this OpenCV build")
    n = seconds * fps
    for i in range(n):
        f = np.zeros((720, 1280, 3), np.uint8)
        f[:, :] = (40, 120, 40)
        noise = rng.integers(0, 30, (90, 160, 3), dtype=np.uint8)
        f = cv2.add(f, cv2.resize(noise, (1280, 720)))
        f[0:200] = cv2.GaussianBlur(
            rng.integers(60, 140, (200, 1280, 3), dtype=np.uint8), (7, 7), 0)
        x = 200 + int(500 * i / n)
        f[330:450, x:x + 360] = logo
        w.write(f)
    w.release()


@unittest.skipIf(not HAVE_CV, "opencv-python-headless + numpy not installed")
class PoolMatchesSequential(unittest.TestCase):
    """Audition 1.4: the frames through a process pool give the same
    audition as the in-process loop — same frames, same hits, same
    candidates, same crops — on a synthetic clip whose board fires, with a
    second reference that never does so the relaxed phase runs too."""

    def audition(self, video, refs, out_dir, workers):
        import contextlib
        import io
        import json

        a = types.SimpleNamespace(video=video, refs=refs, club="Testville",
                                  match=None, date=None, out_dir=out_dir,
                                  windows=A.WINDOWS,
                                  relaxed_floor=A.RELAXED_FLOOR,
                                  workers=workers)
        with contextlib.redirect_stdout(io.StringIO()):
            A.run(a)
        with open(os.path.join(out_dir, "audition.json"), encoding="utf-8") as f:
            return json.load(f)

    def test_same_audition_across_workers(self):
        import tempfile

        import cv2
        import numpy as np

        d = tempfile.mkdtemp()
        refs = os.path.join(d, "refs")
        for word, logo in (("ACME", _acme(cv2, np)), ("ZED", _zed(cv2, np))):
            os.makedirs(os.path.join(refs, "partners", word))
            cv2.imwrite(os.path.join(refs, "partners", word, f"{word.lower()}.png"),
                        logo)
        video = os.path.join(d, "clip.mp4")
        _write_clip(cv2, np, video, _acme(cv2, np))

        one = self.audition(video, refs, os.path.join(d, "one"), workers=1)
        two = self.audition(video, refs, os.path.join(d, "two"), workers=2)

        acme = next(r for r in one["refs"] if r["sponsor"] == "ACME")
        self.assertGreater(acme["fired"], 0,
                           "the synthetic board must fire, or this proves nothing")
        self.assertEqual(one["relaxed_for"], ["ZED"])
        self.assertEqual(one.pop("workers"), 1)
        self.assertEqual(two.pop("workers"), 2)
        self.assertEqual(one, two)
        self.assertEqual(sorted(os.listdir(os.path.join(d, "one"))),
                         sorted(os.listdir(os.path.join(d, "two"))))


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
