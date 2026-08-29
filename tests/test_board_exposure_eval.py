"""
The eval harness's scoring maths, pinned.

Deliberately dependency-free (no cv2, no numpy) so CI can run it: the whole
point of the eval is that engine tuning answers to a measurement, and a
measurement whose own maths is untested is just a second opinion. Shapes here
are constructed to the documented export format, not copied from a run — see
CLAUDE.md, "When you stub a third party, say where the shape came from":
the hits shape is asserted against _scan()'s serialiser by the tracking tests
next door, so these fixtures cannot drift from the real export unnoticed.

Run: python3 -m unittest discover -s tests -p 'test_*.py'
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from board_exposure_eval import (  # noqa: E402
    LabelError, load_labels, merge_spans, overall, parse_clock, rollup, score,
    sponsor_of)


class ParseClock(unittest.TestCase):
    def test_forms(self):
        self.assertEqual(parse_clock("18:30"), 18 * 60 + 30)
        self.assertEqual(parse_clock("1:52:30"), 3600 + 52 * 60 + 30)
        self.assertEqual(parse_clock("1110"), 1110.0)
        self.assertIsNone(parse_clock(None))
        self.assertIsNone(parse_clock(""))

    def test_refuses_nonsense(self):
        with self.assertRaises(LabelError):
            parse_clock("half past nine")
        with self.assertRaises(LabelError):
            parse_clock("1:2:3:4")


class LoadLabels(unittest.TestCase):
    def test_window_and_spans(self):
        window, truth = load_labels([
            "window,0:00,2:00",
            "# a comment",
            "",
            "Enterprise,0:12,0:31",
            "Enterprise,0:55,1:04",
            "DAZN,0:20,0:48",
        ])
        self.assertEqual(window, (0.0, 120.0))
        self.assertEqual(truth["Enterprise"], [(12.0, 31.0), (55.0, 64.0)])
        self.assertEqual(truth["DAZN"], [(20.0, 48.0)])

    def test_default_window_is_last_end(self):
        window, _ = load_labels(["DAZN,0:10,0:30", "DAZN,1:00,1:20"])
        self.assertEqual(window, (0.0, 80.0))

    def test_refuses_backwards_and_malformed(self):
        with self.assertRaises(LabelError):
            load_labels(["DAZN,0:30,0:10"])
        with self.assertRaises(LabelError):
            load_labels(["DAZN,0:10"])
        with self.assertRaises(LabelError):
            load_labels(["window,0:00,2:00"])   # no sponsor rows at all


def hit(tracked=False):
    """One serialised hit, minimal fields the scorer reads."""
    h = {"clarity": 0.5, "area": 0.2}
    if tracked:
        h["tracked"] = True
    return h


class Score(unittest.TestCase):
    # interval 1.0 and grace 0 make every expectation countable on fingers.

    def test_counts_are_exact(self):
        truth = {"DAZN": [(2.0, 5.0)]}
        hits = {2: {"DAZN": [hit()]}, 3: {"DAZN": [hit()]},
                8: {"DAZN": [hit()]}}                 # 8 is outside the span
        s = score(truth, (0.0, 10.0), hits, 1.0, grace=0.0)["DAZN"]
        self.assertEqual((s["tp"], s["fn"], s["fp"]), (2, 2, 1))
        self.assertAlmostEqual(s["recall"], 2 / 4)
        self.assertAlmostEqual(s["precision"], 2 / 3)

    def test_grace_zone_scores_nothing(self):
        truth = {"DAZN": [(2.0, 5.0)]}
        # Samples at 2 and 5 sit ON the edges; grace 0.5 excuses them, so the
        # only scored inside samples are 3 and 4.
        s = score(truth, (0.0, 10.0), {3: {"DAZN": [hit()]}}, 1.0,
                  grace=0.5)["DAZN"]
        self.assertEqual((s["tp"], s["fn"], s["fp"]), (1, 1, 0))

    def test_tracked_samples_counted_separately(self):
        truth = {"DAZN": [(1.0, 3.0)]}
        hits = {1: {"DAZN": [hit()]}, 2: {"DAZN": [hit(tracked=True)]},
                3: {"DAZN": [hit()]}}
        s = score(truth, (0.0, 5.0), hits, 1.0, grace=0.0)["DAZN"]
        self.assertEqual(s["tp"], 3)
        self.assertEqual(s["tracked_tp"], 1)

    def test_string_keys_from_json_are_accepted(self):
        # json.load hands back {"2": {...}}, never {2: {...}}.
        truth = {"DAZN": [(2.0, 2.0 + 0.5)]}
        s = score(truth, (0.0, 4.0), {"2": {"DAZN": [hit()]}}, 1.0,
                  grace=0.0)["DAZN"]
        self.assertEqual(s["tp"], 1)

    def test_window_bounds_the_scoring(self):
        truth = {"DAZN": [(2.0, 3.0)]}
        # A phantom at t=9 is outside the labelled window: not scored.
        hits = {2: {"DAZN": [hit()]}, 3: {"DAZN": [hit()]},
                9: {"DAZN": [hit()]}}
        s = score(truth, (0.0, 5.0), hits, 1.0, grace=0.0)["DAZN"]
        self.assertEqual(s["fp"], 0)

    def test_unlabelled_sponsor_not_scored(self):
        truth = {"DAZN": [(2.0, 3.0)]}
        hits = {2: {"DAZN": [hit()], "Enterprise": [hit()]}}
        self.assertEqual(list(score(truth, (0.0, 5.0), hits, 1.0)), ["DAZN"])


class PerBoardRollup(unittest.TestCase):
    def test_slash_names_roll_up_to_the_sponsor(self):
        self.assertEqual(sponsor_of("Enterprise/goal-left"), "Enterprise")
        self.assertEqual(sponsor_of("DAZN"), "DAZN")
        t = rollup({"Enterprise/goal-left": [(0.0, 10.0)],
                    "Enterprise/dugout": [(8.0, 20.0)],
                    "DAZN/corner": [(5.0, 6.0)]})
        self.assertEqual(t, {"Enterprise": [(0.0, 20.0)], "DAZN": [(5.0, 6.0)]})

    def test_merge_kills_interior_edges(self):
        # A labeller splitting at a shot cut (…-3:09, 3:09-…) must not leave a
        # grace hole in the middle of unbroken presence.
        self.assertEqual(merge_spans([(178.0, 189.0), (189.0, 213.0)]),
                         [(178.0, 213.0)])
        self.assertEqual(merge_spans([(5.0, 6.0), (8.0, 9.0)]),
                         [(5.0, 6.0), (8.0, 9.0)])

    def test_the_committed_answer_sheet_parses(self):
        p = os.path.join(os.path.dirname(__file__), "..", "system",
                         "board-exposure", "labels",
                         "2026-04-18-sutton-united-v-altrincham.csv")
        with open(p, encoding="utf-8") as f:
            window, truth = load_labels(f)
        self.assertEqual(window, (0.0, 8 * 60 + 14.0))
        rolled = rollup(truth)
        self.assertIn("Enterprise", rolled)
        self.assertIn("DAZN", rolled)
        # Every span forwards, inside the window.
        for spans in truth.values():
            for s, e in spans:
                self.assertLess(s, e)
                self.assertLessEqual(e, window[1])


class Overall(unittest.TestCase):
    def test_pools_samples_not_rates(self):
        per = {"A": {"tp": 9, "fp": 0, "fn": 1, "tracked_tp": 0},
               "B": {"tp": 0, "fp": 0, "fn": 10, "tracked_tp": 0}}
        o = overall(per)
        # Pooled recall is 9/20 — averaging the two rates would say 45% too,
        # but only because the sponsors are balanced; the point is the pool.
        self.assertAlmostEqual(o["recall"], 9 / 20)
        self.assertIsNone(o["precision"] if o["tp"] + o["fp"] == 0 else None)


if __name__ == "__main__":
    unittest.main()
