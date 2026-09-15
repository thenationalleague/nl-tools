"""Commercial Benchmarking — club rows from a cleaned workbook, for the tool's
own importer.

The original seed (build-benchmarks.py) rebuilt the WHOLE RTDB node from the
whole dataset, which was fine when the node was empty. Once it holds live data
— corrections made in the tool's editor, capability links already sent to
clubs — a whole-node rebuild would overwrite them, and applying it means a
console import at exactly the right node with nothing between the operator
and the entire database.

So late returns go in the other way round: this script only PARSES. It reads
the same cleaned workbook layout (sheet `Data`, one club per row, the same
headers) through the same parser, and writes a JSON array of club payloads —
no percentiles, no aggregates. The tool's admin **Import rows** action takes
that array, merges it into the live data, recomputes every benchmark and
percentile, and writes through the same path its editor already uses.

Usage:
    python scripts/build-benchmark-rows.py <cleaned.xlsx> [out-rows.json]

Every row is checked before it is written: the club must be on the 72-club
roster, its division must match, and it must carry at least one figure. The
report says which rows passed and why any did not.

Nothing here is committed. The output names clubs and their commercial
figures; keep it out of the repo and delete it once imported.
"""
import sys, os, json, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('build_benchmarks', os.path.join(HERE, 'build-benchmarks.py'))
bb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bb)


def has_figures(payload):
    """Same rule as the tool's CBDash.hasData: any metric other than standCount
    (always 0–4, never null) carries a value."""
    return any(k != 'standCount' and m.get('value') is not None
               for k, m in payload['metrics'].items())


def check_row(payload):
    """-> list of problems (empty = importable)."""
    problems = []
    club = payload.get('club'); div = payload.get('division')
    if club not in bb.DIVSHORT:
        problems.append('not on the 72-club roster (check spelling against build-benchmarks.py)')
    elif bb.DIVSHORT[club] != div:
        problems.append('division is %r but the roster says %r' % (div, bb.DIVSHORT[club]))
    if not has_figures(payload):
        problems.append('no figures in any metric column')
    return problems


def build(src):
    H, data = bb.load_rows(src)
    METRICS = bb.build_metrics(H)
    rows, report = [], []
    for r in data:
        p = bb.row_payload(r, H, METRICS)
        probs = check_row(p)
        n = sum(1 for k, m in p['metrics'].items() if k != 'standCount' and m.get('value') is not None)
        report.append((p['club'], p['division'], n, probs))
        if not probs:
            rows.append(p)
    return rows, report


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else 'commercial-benchmarking-rows.json'
    rows, report = build(src)
    for club, div, n, probs in report:
        flag = 'OK  ' if not probs else 'SKIP'
        print('%s %-28s %-9s %2d figure%s%s' % (flag, club, div or '—', n, '' if n == 1 else 's',
                                                ('  — ' + '; '.join(probs)) if probs else ''))
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    skipped = sum(1 for x in report if x[3])
    print('\nWrote %s: %d club row%s ready to import%s'
          % (out, len(rows), '' if len(rows) == 1 else 's', (', %d skipped' % skipped) if skipped else ''))
    print('Next: open the tool as an admin, Import rows, paste the file contents.')


if __name__ == '__main__':
    main()
