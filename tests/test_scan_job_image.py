"""
The image must carry every script the job wrapper invokes.

The Dockerfile copies scripts BY NAME, so adding a mode to run_job.py without
adding its script to the COPY list builds a green image that fails at
execution time — after the multi-minute video download, with a "can't open
file" that reads like a broken deploy. That is not hypothetical: the diagnose
mode shipped exactly this way on 30/08/2026 and both first executions
(b9q7d, wldsf) died on it. This test makes that failure a red bar at commit
time instead of a dead execution at 10pm.

Run: python3 -m unittest discover -s tests -p 'test_*.py'
"""
import os
import re
import unittest

ROOT = os.path.join(os.path.dirname(__file__), "..")


def _read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


class ImageCarriesItsScripts(unittest.TestCase):
    def test_every_invoked_script_is_copied(self):
        run_job = _read("scan-job", "run_job.py")
        dockerfile = _read("scan-job", "Dockerfile")
        invoked = set(re.findall(r'"scripts/([\w.-]+\.py)"', run_job))
        self.assertTrue(invoked, "run_job invokes no scripts — parsing broke, "
                                 "which would make this guard silently pass")
        for name in sorted(invoked):
            self.assertIn(
                f"scripts/{name}", dockerfile,
                f"run_job invokes scripts/{name} but the Dockerfile never "
                f"COPYs it — the image builds green and every execution of "
                f"that mode dies at runtime with 'can't open file'.")


if __name__ == "__main__":
    unittest.main()
