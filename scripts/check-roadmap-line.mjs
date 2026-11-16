/* Every pull request says what it does to the roadmap (16/11/2026).

   Richard: "Every PR has to be issued with the thought of: are we
   introducing new ideas or developing existing ones, or not?" The roadmap's
   own rule is that it changes in the same pull request as the work; ten PRs
   in one evening went by without it, because nothing asked. This asks.

   The pull request body carries one line:

     Roadmap: new – <the item it adds>
     Roadmap: developed – <the item it moves on>
     Roadmap: no change – <why not>

   "new" and "developed" must change system/ROADMAP.md in the same pull
   request; "no change" must say why, in a few words at least. Run by
   Auto · Roadmap line on every pull request; checkRoadmapLine is pure and
   tested in tests/roadmap-line.test.mjs. */

export const ROADMAP = 'system/ROADMAP.md';
const LINE = /^[ \t>*_-]*Roadmap:\s*(new|developed|no change)\b[ \t]*[–—:-]?[ \t]*(.*)$/im;

export function checkRoadmapLine(body, files) {
  const m = LINE.exec(String(body || ''));
  if (!m) {
    return { ok: false, message: 'Add a line to the pull request description: "Roadmap: new – <item>", "Roadmap: developed – <item>" or "Roadmap: no change – <why>".' };
  }
  const kind = m[1].toLowerCase(), what = m[2].trim();
  const touched = (files || []).includes(ROADMAP);
  if (kind === 'no change') {
    if (what.replace(/[^A-Za-z]/g, '').length < 8) return { ok: false, message: 'Say why the roadmap does not change: "Roadmap: no change – <why>".' };
    return { ok: true, message: 'Roadmap: no change – ' + what };
  }
  if (!what) return { ok: false, message: 'Name the roadmap item: "Roadmap: ' + kind + ' – <item>".' };
  if (!touched) return { ok: false, message: 'The description says the roadmap is ' + (kind === 'new' ? 'given a new item' : 'developed') + ', but ' + ROADMAP + ' is not changed in this pull request.' };
  return { ok: true, message: 'Roadmap: ' + kind + ' – ' + what };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const body = process.env.PR_BODY || '';
  const files = String(process.env.PR_FILES || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const r = checkRoadmapLine(body, files);
  console.log((r.ok ? 'ok   ' : 'FAIL ') + r.message);
  process.exit(r.ok ? 0 : 1);
}
