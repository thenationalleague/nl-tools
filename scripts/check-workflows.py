#!/usr/bin/env python3
"""Prove every GitHub Actions workflow in this repo is actually parseable.

Why this exists
---------------
A workflow file that GitHub cannot parse does not fail loudly. It fails
*quietly and repeatedly*: GitHub logs a run named after the file path rather
than the workflow's `name:`, concludes "No jobs were run", and does this on
every push to every branch — emailing the repo owner each time. The job it was
meant to do never runs at all.

That happened here with wellbeing-linkcheck.yml (sixteen failed runs before
anyone connected the emails to the cause). The trigger was a heredoc inside a
`run:` block: a heredoc body has to start at column 0, which closes the YAML
block scalar and invalidates everything after it.

The failure is invisible in review because the file looks fine — the damage is
in the indentation. A parser catches it in a second, so we run one.

What it checks
--------------
For every .github/workflows/*.yml and *.yaml:
  1. It parses as YAML at all.
  2. The document is a mapping.
  3. It declares triggers. NB: YAML 1.1 reads a bare `on:` key as the boolean
     True, so both spellings are accepted.
  4. It declares at least one job.

Usage: python3 scripts/check-workflows.py
Exits non-zero, listing every problem, if anything fails.
"""

import glob
import os
import sys

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: pip install pyyaml")

WORKFLOW_DIR = os.path.join(".github", "workflows")


def check(path):
    """Return a list of problems with one workflow file (empty means fine)."""
    try:
        with open(path, encoding="utf-8") as fh:
            doc = yaml.safe_load(fh)
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        where = f" at line {mark.line + 1}, column {mark.column + 1}" if mark else ""
        return [f"does not parse as YAML{where}: {getattr(exc, 'problem', exc)}"]
    except OSError as exc:
        return [f"could not be read: {exc}"]

    if not isinstance(doc, dict):
        return ["is not a YAML mapping"]

    problems = []

    # `on:` is the boolean True under YAML 1.1, which is what safe_load applies.
    if "on" not in doc and True not in doc:
        problems.append("declares no triggers (`on:`)")

    jobs = doc.get("jobs")
    if not isinstance(jobs, dict) or not jobs:
        problems.append("declares no jobs")

    return problems


def main():
    paths = sorted(
        glob.glob(os.path.join(WORKFLOW_DIR, "*.yml"))
        + glob.glob(os.path.join(WORKFLOW_DIR, "*.yaml"))
    )

    if not paths:
        print(f"No workflow files found in {WORKFLOW_DIR}/ — nothing to check.")
        return 0

    failed = 0
    for path in paths:
        problems = check(path)
        if problems:
            failed += 1
            print(f"FAIL  {path}")
            for p in problems:
                print(f"        {p}")
        else:
            print(f"ok    {path}")

    print()
    if failed:
        print(f"{failed} of {len(paths)} workflow files are broken.")
        print("GitHub would log these as failed 'No jobs were run' on every push.")
        return 1

    print(f"All {len(paths)} workflow files parse and declare triggers and jobs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
