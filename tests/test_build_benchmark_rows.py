"""build-benchmark-rows.py — the late-returns parser.

Builds a small cleaned-workbook lookalike (sheet `Data`, the real headers,
club names from the tool's own roster, made-up figures) and checks that the
rows the tool's importer will receive are the ones a careful operator would
expect: a good row passes with the right shape, and each of the three ways a
row can be wrong — off the roster, in the wrong division, no figures — is
skipped with a reason rather than written.

Needs openpyxl (the parser does); skips itself where it is not installed, the
same way the board-exposure tests skip without cv2.
"""
import os, sys, json, tempfile, unittest, importlib.util


def _import_openpyxl():
    """Under `unittest discover` the board-exposure files run first and, on a
    machine without numpy, leave an EMPTY stub module in sys.modules
    (tests/_bexp_cv.py explains why). openpyxl's `try: import numpy` then
    succeeds and dies on `numpy.short`. Lift the stub for the import — openpyxl
    handles a genuinely missing numpy — and put it back for whatever runs
    next, which may still need it to load an engine script."""
    stub = sys.modules.get('numpy')
    if stub is not None and getattr(stub, '_nl_stub', False):
        del sys.modules['numpy']
    else:
        stub = None
    try:
        import openpyxl
        return openpyxl
    except ImportError:  # pragma: no cover
        return None
    finally:
        if stub is not None:
            sys.modules['numpy'] = stub


openpyxl = _import_openpyxl()

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, '..', 'scripts', 'build-benchmark-rows.py')

HEADERS = [
    'Club', 'Division',
    'Top GA matchday ticket (£)', 'Top GA season ticket (£)',
    'Front Shirt — Sponsor Name', 'Front Shirt — Sector', 'Front Shirt — Income/season (£, ex-VAT)',
    'Front Shirt — Contract Length', 'Front Shirt — Commencement', 'Front Shirt — Rolling?',
    'Back Shirt — Sponsor Name', 'Back Shirt — Sector', 'Back Shirt — Income/season (£, ex-VAT)',
    'Back Shirt — Contract Length', 'Back Shirt — Commencement', 'Back Shirt — Rolling?',
    'Sleeve — Sponsor Name', 'Sleeve — Sector', 'Sleeve — Income/season (£, ex-VAT)',
    'Sleeve — Contract Length', 'Sleeve — Commencement', 'Sleeve — Rolling?',
] + [h % s for s in (1, 2, 3, 4) for h in (
    'Stand %d — Sponsor Name', 'Stand %d — Sector', 'Stand %d — Income/season (£, ex-VAT)')] + [
    'TV-facing board price/season (£)', 'Non-TV board price/season (£)',
    'Top matchday hospitality (£)', 'Top seasonal hospitality (£)',
    'Full-page programme advert/season (£)',
    'Total email database size', 'Opted-in to partner emails',
    'Programme format', 'Can email supporters?', 'Can email on behalf of partners?',
]


def _row(**kv):
    return [kv.get(h) for h in HEADERS]


def _load():
    spec = importlib.util.spec_from_file_location('build_benchmark_rows', SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@unittest.skipIf(openpyxl is None, 'openpyxl not installed')
class BuildBenchmarkRows(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.xlsx = os.path.join(self.tmp.name, 'cleaned.xlsx')
        wb = openpyxl.Workbook()
        ws = wb.active; ws.title = 'Data'
        ws.append(HEADERS)
        # good row — a real roster club in its real division
        ws.append(_row(**{'Club': 'Marine', 'Division': 'North',
                          'Top GA matchday ticket (£)': 15, 'Top GA season ticket (£)': 220,
                          'Front Shirt — Sponsor Name': 'Acme Widgets', 'Front Shirt — Sector': 'Manufacturing',
                          'Front Shirt — Income/season (£, ex-VAT)': 12000, 'Front Shirt — Contract Length': 2,
                          'Front Shirt — Commencement': '2024-07', 'Front Shirt — Rolling?': 'No',
                          'Back Shirt — Sponsor Name': 'vacant',
                          'Stand 1 — Sponsor Name': 'North Stand Co', 'Stand 1 — Sector': 'Construction',
                          'Stand 1 — Income/season (£, ex-VAT)': 3000,
                          'Stand 2 — Sponsor Name': '0', 'Stand 2 — Income/season (£, ex-VAT)': 0,
                          'TV-facing board price/season (£)': '300-500',
                          'Programme format': 'Printed', 'Can email supporters?': 'Yes'}))
        # wrong division for a roster club
        ws.append(_row(**{'Club': 'Marine', 'Division': 'South', 'Top GA matchday ticket (£)': 15}))
        # not on the roster at all
        ws.append(_row(**{'Club': 'Nowhere Athletic', 'Division': 'North', 'Top GA matchday ticket (£)': 15}))
        # roster club, right division, but every figure blank
        ws.append(_row(**{'Club': 'Chester', 'Division': 'North'}))
        # a blank trailing row — must not become a club
        ws.append([None] * len(HEADERS))
        wb.save(self.xlsx)
        self.mod = _load()

    def tearDown(self):
        self.tmp.cleanup()

    def test_good_row_has_the_stored_shape(self):
        rows, report = self.mod.build(self.xlsx)
        self.assertEqual([r['club'] for r in rows], ['Marine'])
        p = rows[0]
        self.assertEqual(p['division'], 'North')
        self.assertEqual(p['fsSponsor'], 'Acme Widgets')
        self.assertEqual(p['bsSponsor'], '', 'placeholder sponsor names are wiped at source')
        self.assertEqual(p['fsStart'], '2024-07')
        self.assertEqual(p['chips']['progFormat'], 'Printed')
        self.assertEqual(p['metrics']['msTicket'], {'value': 15})
        self.assertEqual(p['metrics']['frontShirt']['value'], 12000)
        self.assertIsNone(p['metrics']['tvBoard']['value'], 'a price range is not a clean figure')
        # no percentiles at this stage — the tool's recompute adds them
        self.assertNotIn('divPct', p['metrics']['msTicket'])
        # placeholder stand dropped: one real stand, count/total/avg agree
        self.assertEqual([s['name'] for s in p['stands']], ['North Stand Co'])
        self.assertEqual(p['metrics']['standCount']['value'], 1.0)
        self.assertEqual(p['metrics']['standTotal']['value'], 3000.0)
        self.assertEqual(p['metrics']['standAvg']['value'], 3000.0)
        self.assertEqual(p['standSectors'], 'Construction')

    def test_bad_rows_are_skipped_with_a_reason(self):
        rows, report = self.mod.build(self.xlsx)
        by = {}
        for club, div, n, probs in report:
            by.setdefault((club, div), probs)
        self.assertEqual(by[('Marine', 'North')], [])
        self.assertIn('division', by[('Marine', 'South')][0])
        self.assertIn('roster', by[('Nowhere Athletic', 'North')][0])
        self.assertIn('no figures', by[('Chester', 'North')][0])
        self.assertEqual(len(report), 4, 'the blank trailing row is not a club')

    def test_output_is_a_json_array_the_importer_accepts(self):
        rows, _ = self.mod.build(self.xlsx)
        s = json.dumps(rows)
        self.assertTrue(s.startswith('['))
        back = json.loads(s)
        self.assertEqual(back[0]['club'], 'Marine')


if __name__ == '__main__':
    unittest.main()
