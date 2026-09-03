"""
The job's access token must not outlive the job.

run_job.py fetched one metadata-server token before the video download and
handed the same string to every Storage call, including the uploads at the
end. Those tokens live an hour. The 02/09/2026 Harrogate audition ran for
ninety minutes, finished, and died uploading audition.json with a token
that had expired half an hour earlier — the whole run thrown away at the
last step. Scans never showed it because their results go up through the
match script's own ingest-key sign-in, minted at upload time.

These tests drive run_job.Token with a fake clock and a fake mint, and
replay the failure against the real storage_put with urlopen stubbed, so
the Authorization header itself is what is asserted.

Run: python3 -m unittest discover -s tests -p 'test_*.py'
"""
import importlib.util
import os
import tempfile
import unittest
from unittest import mock

ROOT = os.path.join(os.path.dirname(__file__), "..")


def _load_run_job():
    path = os.path.join(ROOT, "scan-job", "run_job.py")
    spec = importlib.util.spec_from_file_location("run_job", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class TokenReMints(unittest.TestCase):
    def setUp(self):
        self.J = _load_run_job()
        self.clock = _Clock()
        self.minted = 0

        def mint():
            self.minted += 1
            return f"tok-{self.minted}"

        self.tok = self.J.Token(mint=mint, clock=self.clock)

    def test_one_token_inside_the_ttl(self):
        self.assertEqual(self.tok.get(), "tok-1")
        self.clock.now += self.J.TOKEN_TTL - 1
        self.assertEqual(self.tok.get(), "tok-1")
        self.assertEqual(self.minted, 1)

    def test_a_fresh_token_after_the_ttl(self):
        self.tok.get()
        self.clock.now += self.J.TOKEN_TTL
        self.assertEqual(self.tok.get(), "tok-2")

    def test_ttl_sits_inside_the_hour_a_token_lives(self):
        self.assertLess(self.J.TOKEN_TTL, 3600)
        self.assertGreater(self.J.TOKEN_TTL, 0)

    def test_upload_after_ninety_minutes_carries_the_fresh_token(self):
        # The Harrogate failure, replayed: a token fetched at the top of
        # main(), ninety minutes of audition, then the upload. The header on
        # the wire must carry the re-minted token, not the first one.
        seen = []

        class _Resp:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return b"{}"

        def fake_urlopen(req, timeout=None):
            seen.append(req.get_header("Authorization"))
            return _Resp()

        d = tempfile.mkdtemp()
        p = os.path.join(d, "audition.json")
        with open(p, "w", encoding="utf-8") as f:
            f.write("{}")
        self.tok.get()                       # top of main()
        self.clock.now += 90 * 60            # the audition
        with mock.patch.object(self.J.urllib.request, "urlopen", fake_urlopen):
            self.J.storage_put("bucket", "brand-exposure/x/audition.json", p,
                               self.tok)
        self.assertEqual(seen, ["Bearer tok-2"])

    def test_every_storage_call_asks_at_request_time(self):
        # No Storage function may take the token as a bare string again.
        import inspect

        for fn in (self.J.storage_list, self.J.storage_get, self.J.storage_put):
            src = inspect.getsource(fn)
            self.assertIn("token.get()", src, f"{fn.__name__} does not ask "
                          f"the Token at request time")
            self.assertNotIn('"Bearer " + token}', src)
            self.assertNotIn('"Bearer " + token,', src)


class ExcludeLines(unittest.TestCase):
    """BE_EXCLUDE (03/09/2026): one retired path per line, written to
    refs/.exclude where load_tree looks."""

    def setUp(self):
        self.J = _load_run_job()

    def test_lines_kept_in_order_without_blanks_or_repeats(self):
        raw = "partners/DAZN/b.png\n\n  clubs/Harrogate Town/Enterprise/cutout 2.png \n" \
              "partners/DAZN/b.png\n"
        self.assertEqual(self.J.exclude_lines(raw),
                         ["partners/DAZN/b.png",
                          "clubs/Harrogate Town/Enterprise/cutout 2.png"])

    def test_unset_means_nothing(self):
        self.assertEqual(self.J.exclude_lines(None), [])
        self.assertEqual(self.J.exclude_lines(""), [])


if __name__ == "__main__":
    unittest.main()
