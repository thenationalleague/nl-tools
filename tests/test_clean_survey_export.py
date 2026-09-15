"""clean-survey-export.py — raw SurveyMonkey export -> cleaned workbook.

The fixture reproduces the export's shape as read from the live file on
15/09/2026: two header rows (question, then sub-answer), the respondent and
club-representative columns first, then each sponsor block as name / sector /
"Other (please specify)" / commencement / length / income. Answers are made
up. The cases are the ones that would silently corrupt a benchmark:

  * "Three Year" is 3 years, not the 1 that a digit-only parser returns;
  * "3,000+" and "£12k" are numbers, "300-500" is not and is reported;
  * "Other (please specify)" takes the free text, "N/A" is blank;
  * an empty response (club and division only) is dropped, and of two real
    responses from one club the fuller wins;
  * respondent email, IP and names never reach the output.
"""
import os, sys, tempfile, unittest, importlib.util, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_build_benchmark_rows import _import_openpyxl  # noqa: E402  (numpy-stub guard)
openpyxl = _import_openpyxl()

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, '..', 'scripts', 'clean-survey-export.py')


def _load():
    spec = importlib.util.spec_from_file_location('clean_survey_export', SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _block(name_q):
    return [(name_q, 'Open-Ended Response'), ('Sponsor Sector', 'Response'), (None, 'Other (please specify)'),
            ('Contract Commencement Date', 'Date / Time'), ('Length of Contract', 'Open-Ended Response'),
            ('Income per season (not including VAT)', 'Open-Ended Response')]


HEAD = [('Respondent ID', None), ('Start Date', None), ('End Date', None), ('IP Address', None), ('Email Address', None),
        ('First Name', None), ('Last Name', None), ('Club name', 'Response'), ('Division', 'Response'),
        ('Information of Club representative completing the form', 'Name'), (None, 'Email')] + \
    _block('Name of Front of Shirt Sponsor') + [('If you have different front of shirt sponsors…', 'Open-Ended Response')] + \
    _block('Name of Back of Shirt Sponsor') + _block('Name of Sleeve Sponsor') + \
    sum((_block('Name of Stand Sponsor - Stand %d' % s) for s in (1, 2, 3, 4)), []) + [
    ('What is your standard TV facing perimeter advertising board size', 'Open-Ended Response'),
    ('How much do you charge for a seasonal TV facing perimeter advertising board?', 'Open-Ended Response'),
    ('What is your standard non TV advertising board size', 'Open-Ended Response'),
    ('How much do you charge for a seasonal non TV perimeter advertising board?', 'Open-Ended Response'),
    ('Do you produce a matchday programme (digital or printed)?', 'Response'),
    ('If yes, is the programme…', 'Response'),
    ('If yes, please give cost for a full page seasonal advert in your programme', 'Open-Ended Response'),
    ('How much do you charge for your highest priced General Admission adult matchday ticket?', 'Open-Ended Response'),
    ('How much do you charge for your highest priced General Admission adult season ticket?', 'Open-Ended Response'),
    ('How much do you charge for your highest priced matchday hospitality ticket?', 'Open-Ended Response'),
    ('Does it include any of the following', 'None of the above'), (None, 'Food'),
    ('How much do you charge for your highest priced seasonal hospitality ticket?', 'Open-Ended Response'),
    ('Do you currently have the ability to send email communications out to your supporters?', 'Response'),
    ('If yes, do you have the ability to send out email communications on behalf of commercial partners?', 'Response'),
    ('What is your current total email database size?', 'Open-Ended Response'),
    ('Out of that total database, how many email addresses are opted in', 'Open-Ended Response'),
]
H1 = [h for h, _ in HEAD]
H2 = [s for _, s in HEAD]


def _col(q, sub=None, nth=0):
    hits = [i for i, (h, s) in enumerate(HEAD) if h == q and (sub is None or s == sub)]
    return hits[nth]


def _row(club, division, ended, **cells):
    r = [None] * len(HEAD)
    r[_col('Respondent ID')] = 1
    r[_col('Start Date')] = ended - datetime.timedelta(minutes=5)
    r[_col('End Date')] = ended
    r[_col('IP Address')] = '203.0.113.9'
    r[_col('Email Address')] = 'secretary@example.invalid'
    r[_col('First Name')] = 'Pat'; r[_col('Last Name')] = 'Example'
    r[_col('Club name')] = club; r[_col('Division')] = division
    for i, v in cells.items():
        r[int(i[1:])] = v
    return r


@unittest.skipIf(openpyxl is None, 'openpyxl not installed')
class CleanSurveyExport(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.src = os.path.join(self.tmp.name, 'export.xlsx')
        wb = openpyxl.Workbook(); ws = wb.active
        ws.append(H1); ws.append(H2)
        fs = _col('Name of Front of Shirt Sponsor'); bs = _col('Name of Back of Shirt Sponsor'); st1 = _col('Name of Stand Sponsor - Stand 1')
        tv = _col('How much do you charge for a seasonal TV facing perimeter advertising board?')
        ntv = _col('How much do you charge for a seasonal non TV perimeter advertising board?')
        prog = _col('Do you produce a matchday programme (digital or printed)?')
        db = _col('What is your current total email database size?')
        full = {
            'c%d' % fs: 'Acme Widgets', 'c%d' % (fs + 1): 'Other (please specify)', 'c%d' % (fs + 2): 'Widgetry',
            'c%d' % (fs + 3): '01/07/2025', 'c%d' % (fs + 4): 'Three Year', 'c%d' % (fs + 5): '£12k',
            'c%d' % bs: 'Rolling Co', 'c%d' % (bs + 1): 'N/A', 'c%d' % (bs + 4): 'Rolling contract', 'c%d' % (bs + 5): '3,000+',
            'c%d' % st1: 'North Stand Co', 'c%d' % (st1 + 1): 'Construction & Property', 'c%d' % (st1 + 4): '18 months', 'c%d' % (st1 + 5): 5000,
            'c%d' % tv: '300-500', 'c%d' % ntv: '600 + VAT',
            'c%d' % prog: 'No', 'c%d' % db: '4,500',
        }
        ws.append(_row('Marine', 'North', datetime.datetime(2026, 7, 20, 9, 0), **full))
        # a thinner, older Marine response: superseded
        ws.append(_row('Marine', 'North', datetime.datetime(2026, 7, 9, 9, 0), **{'c%d' % fs: 'Old Sponsor'}))
        # an empty response: dropped
        ws.append(_row('Chester', 'North', datetime.datetime(2026, 7, 21, 9, 0)))
        # a February response, outside --since
        ws.append(_row('Buxton', 'North', datetime.datetime(2026, 2, 9, 9, 0), **{'c%d' % fs: 'Feb Sponsor'}))
        wb.save(self.src)
        self.mod = _load()

    def tearDown(self):
        self.tmp.cleanup()

    def test_values_are_read_the_way_a_person_would(self):
        kept, report = self.mod.clean(self.src, since=datetime.date(2026, 6, 18))
        self.assertEqual(sorted(kept), ['Marine'])
        row = kept['Marine']['row']
        self.assertEqual(row['Front Shirt — Sponsor Name'], 'Acme Widgets')
        self.assertEqual(row['Front Shirt — Sector'], 'Widgetry', 'Other (please specify) takes the free text')
        self.assertEqual(row['Front Shirt — Contract Length'], 3.0, '"Three Year" is three years')
        self.assertEqual(row['Front Shirt — Rolling?'], 'No')
        self.assertEqual(row['Front Shirt — Income/season (£, ex-VAT)'], 12000.0)
        self.assertEqual(row['Front Shirt — Commencement'], '01/07/2025', 'dates pass through for the parser')
        self.assertEqual(row['Back Shirt — Sector'], '', 'N/A is blank')
        self.assertIsNone(row['Back Shirt — Contract Length'])
        self.assertEqual(row['Back Shirt — Rolling?'], 'Yes')
        self.assertEqual(row['Back Shirt — Income/season (£, ex-VAT)'], 3000.0)
        self.assertEqual(row['Stand 1 — Contract Length'], 1.5, '18 months')
        self.assertEqual(row['Stand 1 — Income/season (£, ex-VAT)'], 5000.0)
        self.assertIsNone(row['TV-facing board price/season (£)'], 'a range is not a figure')
        self.assertEqual(row['Non-TV board price/season (£)'], 600.0)
        self.assertEqual(row['Programme format'], 'None', 'no programme is an answer, not a blank')
        self.assertEqual(row['Total email database size'], 4500.0)
        bad = [k for k, _ in kept['Marine']['bad']]
        self.assertEqual(bad, ['TV-facing board price/season (£)'], 'the unreadable cell is reported')

    def test_empty_and_superseded_and_early_responses(self):
        kept, report = self.mod.clean(self.src, since=datetime.date(2026, 6, 18))
        why = {(c, str(d)[:10]): w for c, d, n, w in report}
        self.assertIn('empty', why[('Chester', '2026-07-21')])
        self.assertIn('superseded', why[('Marine', '2026-07-09')])
        self.assertNotIn('Buxton', [c for c, *_ in report], 'outside --since: neither kept nor reported')
        kept_all, _ = self.mod.clean(self.src)
        self.assertIn('Buxton', kept_all)

    def test_no_personal_data_reaches_the_workbook(self):
        kept, _ = self.mod.clean(self.src)
        out = os.path.join(self.tmp.name, 'clean.xlsx')
        self.mod.write(kept, out)
        ws = openpyxl.load_workbook(out).active
        cells = ' '.join(str(v) for row in ws.iter_rows(values_only=True) for v in row if v is not None)
        for needle in ('203.0.113.9', 'example.invalid', 'Pat', 'Example'):
            self.assertNotIn(needle, cells)
        self.assertEqual(ws.title, 'Data')
        self.assertEqual([c.value for c in ws[1]], self.mod.CLEAN_HEADERS)

    def test_a_changed_question_fails_loudly(self):
        wb = openpyxl.load_workbook(self.src); ws = wb.active
        ws.cell(row=1, column=_col('Club name') + 1).value = 'Team name'
        wb.save(self.src)
        with self.assertRaises(KeyError):
            self.mod.clean(self.src)


if __name__ == '__main__':
    unittest.main()
