#!/usr/bin/env python3
"""
Roll two clips into one comparison — the shape a league-wide report would take.

Raw seconds are not comparable across packages of different lengths, so the
headline rate here is seconds per minute of package. That, and separating time
from quality, is what stops a wide static camera beating a tight one purely by
holding the perimeter in shot.
"""
import base64
import json
import os
import statistics as st

import cv2

CLIPS = [
    ("Harrogate Town v Barnet", "clip1b"),
    ("Sutton United v Hartlepool", "clip2"),
]
COLOURS = {"Enterprise": "#c0392b", "TIC Health": "#1565c0"}
GRID = (20, 36)


def load(dirname):
    return json.load(open(os.path.join(dirname, "report_data2.json")))


def analyse(D):
    S, IV = D["samples"], D["interval"]
    out = {"duration": D["duration"], "vw": D["video_w"], "vh": D["video_h"],
           "samples": len(S), "sponsors": {}}
    for name in D["sponsors"]:
        idxs = [s["i"] for s in S if s["hits"].get(name)]
        if not idxs:
            out["sponsors"][name] = None
            continue
        by = {s["i"]: s["hits"].get(name, []) for s in S}
        runs, cur = [], [idxs[0]]
        for i in idxs[1:]:
            if i - cur[-1] <= 3:
                cur.append(i)
            else:
                runs.append(cur)
                cur = [i]
        runs.append(cur)
        runs = [r for r in runs if len(r) >= 2]
        flat = [h for i in idxs for h in by[i]]
        secs = sum((r[-1] - r[0] + 1) * IV for r in runs)
        index = sum((r[-1] - r[0] + 1) * IV
                    * st.mean([h["clarity"] for i in r for h in by[i]]) for r in runs)
        heat = [[0.0] * GRID[1] for _ in range(GRID[0])]
        for i in idxs:
            for h in by[i]:
                cx = sum(p[0] for p in h["quad"]) / 4
                cy = sum(p[1] for p in h["quad"]) / 4
                r = min(GRID[0] - 1, max(0, int(cy / D["video_h"] * GRID[0])))
                c = min(GRID[1] - 1, max(0, int(cx / D["video_w"] * GRID[1])))
                heat[r][c] += h["clarity"]
        out["sponsors"][name] = {
            "seconds": round(secs, 1),
            "per_min": round(secs / (D["duration"] / 60), 1),
            "pct": round(100 * secs / D["duration"]),
            "runs": len(runs),
            "index": round(index, 1),
            "index_per_min": round(index / (D["duration"] / 60), 1),
            "clarity": round(st.mean([h["clarity"] for h in flat]), 2),
            "area": round(st.mean([h["area"] for h in flat]), 3),
            "longest": round(max((r[-1] - r[0] + 1) * IV for r in runs), 1),
            "heat": heat,
        }
    return out


def backdrop(dirname, D):
    """One representative frame per ground, for the heatmaps to sit on."""
    for s in D["samples"]:
        if s["frame"] and s["hits"]:
            p = os.path.join(dirname, "rf2", s["frame"])
            if os.path.exists(p):
                img = cv2.imread(p)
                img = cv2.resize(img, (520, int(520 * img.shape[0] / img.shape[1])))
                ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 62])
                return base64.b64encode(buf.tobytes()).decode()
    return None


matches = []
for label, d in CLIPS:
    D = load(d)
    a = analyse(D)
    a["name"] = label
    a["bg"] = backdrop(d, D)
    matches.append(a)

names = sorted({n for m in matches for n in m["sponsors"]})
totals = {}
for n in names:
    got = [m for m in matches if m["sponsors"].get(n)]
    if not got:
        totals[n] = None
        continue
    dur = sum(m["duration"] for m in got)
    totals[n] = {
        "seconds": round(sum(m["sponsors"][n]["seconds"] for m in got), 1),
        "index": round(sum(m["sponsors"][n]["index"] for m in got), 1),
        "matches": len(got),
        "of": len(matches),
        "per_min": round(sum(m["sponsors"][n]["seconds"] for m in got) / (dur / 60), 1),
    }

payload = {"matches": matches, "sponsors": names, "totals": totals, "colours": COLOURS,
           "grid": GRID}

HTML = """<title>Two Grounds Compared</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500&display=swap">
<style>
:root{
  --primary:#9e0000; --primary-400:#c56659; --navy:#223b7c;
  --ground:#f5f6f9; --panel:#fff; --panel-2:#eef1f6;
  --ink:#11214a; --ink-2:#5a6a82; --line:#dbe1ec; --rule:#c3ccdd;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#080d18; --panel:#0e1727; --panel-2:#131e33;
    --ink:#e9eef7; --ink-2:#8ea0be; --line:#1f2c47; --rule:#2b3a5c;
  }
}
:root[data-theme="dark"]{
  --ground:#080d18; --panel:#0e1727; --panel-2:#131e33;
  --ink:#e9eef7; --ink-2:#8ea0be; --line:#1f2c47; --rule:#2b3a5c;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);
  font-family:"IBM Plex Sans",system-ui,sans-serif;font-size:15px;line-height:1.6}
.wrap{max-width:1080px;margin:0 auto;padding:34px 24px 72px}
.eyebrow{font-family:"Barlow Condensed",Impact,sans-serif;text-transform:uppercase;
  letter-spacing:.14em;font-weight:600;font-size:13px;color:var(--primary-400)}
h1{font-family:"Barlow Condensed",Impact,sans-serif;font-weight:700;
  font-size:clamp(32px,5vw,52px);line-height:1;margin:.1em 0 .18em;text-wrap:balance}
.lede{color:var(--ink-2);max-width:64ch;margin:0 0 34px;font-size:16.5px}
h2{font-family:"Barlow Condensed",sans-serif;text-transform:uppercase;letter-spacing:.11em;
  font-size:14px;font-weight:600;color:var(--ink-2);margin:38px 0 14px;
  padding-bottom:8px;border-bottom:1px solid var(--rule)}
.totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}
.tot{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px 18px 16px;
  border-top:3px solid var(--c)}
.tot .n{font-family:"Barlow Condensed",sans-serif;text-transform:uppercase;letter-spacing:.09em;
  font-weight:600;font-size:14px;color:var(--c)}
.tot .v{font-family:"Barlow Condensed",sans-serif;font-weight:700;font-size:46px;line-height:1;
  font-variant-numeric:tabular-nums;margin:.08em 0}
.tot .v small{font-size:18px;color:var(--ink-2);font-weight:600}
.tot .m{color:var(--ink-2);font-size:13px}
.flip{background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:20px 22px}
.rank{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:6px}
@media(max-width:720px){.rank{grid-template-columns:1fr}}
.rank h3{font-family:"Barlow Condensed",sans-serif;text-transform:uppercase;letter-spacing:.09em;
  font-size:12.5px;color:var(--ink-2);margin:0 0 10px;font-weight:600}
.rowbar{margin-bottom:12px}
.rowbar .lab{display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px}
.rowbar .lab b{font-weight:500}
.rowbar .lab span{font-family:"IBM Plex Mono",monospace;color:var(--ink-2);
  font-variant-numeric:tabular-nums}
.rowbar .t{height:9px;border-radius:5px;background:var(--line);overflow:hidden}
.rowbar .f{height:100%;border-radius:5px}
table{width:100%;border-collapse:collapse;font-size:14px;margin-top:4px}
th{text-align:right;font-family:"Barlow Condensed",sans-serif;text-transform:uppercase;
  letter-spacing:.08em;font-size:11.5px;color:var(--ink-2);font-weight:600;
  padding:0 0 8px;border-bottom:1px solid var(--rule)}
th:first-child,td:first-child{text-align:left}
td{padding:9px 0;border-bottom:1px solid var(--line);text-align:right;
  font-variant-numeric:tabular-nums;font-family:"IBM Plex Mono",monospace;font-size:13.5px}
td:first-child{font-family:"IBM Plex Sans",sans-serif}
tr:last-child td{border-bottom:0}
.dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:8px}
.grounds{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media(max-width:720px){.grounds{grid-template-columns:1fr}}
.gcard{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.gcard .hd{padding:14px 16px 12px}
.gcard .hd b{font-family:"Barlow Condensed",sans-serif;font-size:19px;font-weight:600;
  letter-spacing:.01em}
.gcard .hd div{color:var(--ink-2);font-size:12.5px}
.hm{position:relative;line-height:0;background:#03081b}
.hm img{width:100%;display:block;opacity:.4}
.hm canvas{position:absolute;inset:0;width:100%;height:100%}
.note{color:var(--ink-2);font-size:13px;padding:12px 16px 14px;line-height:1.55}
p.body{max-width:64ch;color:var(--ink)}
p.body.muted{color:var(--ink-2);font-size:14px}
footer{margin-top:40px;padding-top:16px;border-top:1px solid var(--rule);color:var(--ink-2);
  font-size:12.5px;max-width:74ch}
code{font-family:"IBM Plex Mono",monospace;font-size:.92em}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>

<div class="wrap">
  <div class="eyebrow">Perimeter advertising &middot; two grounds</div>
  <h1>Time and quality point different ways</h1>
  <p class="lede">Two National League highlights packages, measured the same way. The ground that
  gives Enterprise the most screen time gives it the least readable board, and the ground with the
  clearest board shows it least. Whichever you lead with decides who looks better.</p>

  <h2>Across both packages</h2>
  <div class="totals" id="totals"></div>

  <h2>The same two grounds, ranked two ways</h2>
  <div class="flip">
    <div class="rank">
      <div>
        <h3>By seconds per minute of package</h3>
        <div id="byTime"></div>
      </div>
      <div>
        <h3>By how readable the board was</h3>
        <div id="byIndex"></div>
      </div>
    </div>
    <p class="body muted" id="flipnote" style="margin:14px 0 0"></p>
  </div>

  <h2>Ground by ground</h2>
  <table>
    <thead><tr>
      <th>Ground &amp; partner</th><th>Seconds</th><th>Per min</th><th>Share</th>
      <th>Runs</th><th>Longest</th><th>Clarity</th><th>Board size</th>
    </tr></thead>
    <tbody id="rows"></tbody>
  </table>

  <h2>Where the boards sit</h2>
  <div class="grounds" id="grounds"></div>

  <h2>What this would be at 72 clubs</h2>
  <p class="body">Two packages is not a finding. But the shape holds: one row per club per match,
  a rate rather than a raw total so unequal edits stay comparable, and time reported beside quality
  rather than folded into it. Fold them together and the combined score is only as defensible as
  the weights &mdash; and on this pair those weights are what decides the order, not the footage.
  Publishing both columns is the honest version until a hand-count says how they should trade off.</p>
  <p class="body muted">The gap this cannot close on its own: a zero means not found in this
  edit, never proof a board was absent. Only a hand-count settles that, and until one exists
  every figure here is the detector marking its own homework.</p>

  <footer>
    Both packages matched against the logo files in <code>assets/partners/</code>, with nothing
    cropped from either ground. Sponsor ident cards are excluded &mdash; they are a different
    piece of inventory, and counting them inflated an earlier version of these numbers by more
    than half at Harrogate.
  </footer>
</div>

<script>
const D = __DATA__;
const col = n => D.colours[n] || '#9e0000';

document.getElementById('totals').innerHTML = D.sponsors.map(n => {
  const t = D.totals[n];
  if (!t) return `<div class="tot" style="--c:${col(n)}"><div class="n">${n}</div>
    <div class="v" style="font-size:30px">Not found</div>
    <div class="m">In neither package — which is not the same as absent.</div></div>`;
  return `<div class="tot" style="--c:${col(n)}"><div class="n">${n}</div>
    <div class="v">${t.seconds}<small>s</small></div>
    <div class="m">${t.per_min}s per minute of package · seen at ${t.matches} of ${t.of} grounds</div></div>`;
}).join('');

// Two rankings of the same four rows, so the reordering is the point.
const rows = [];
D.matches.forEach(m => D.sponsors.forEach(n => {
  const s = m.sponsors[n]; if (s) rows.push({m:m.name, n, ...s});
}));

function bars(el, key, unit){
  const sorted = [...rows].sort((a,b) => b[key]-a[key]);
  const max = sorted[0][key] || 1;
  document.getElementById(el).innerHTML = sorted.map(r => `
    <div class="rowbar">
      <div class="lab"><b><span class="dot" style="background:${col(r.n)}"></span>${r.n} — ${r.m.split(' v ')[0]}</b>
      <span>${r[key]}${unit}</span></div>
      <div class="t"><div class="f" style="width:${Math.round(100*r[key]/max)}%;background:${col(r.n)}"></div></div>
    </div>`).join('');
  return sorted;
}
const byTime = bars('byTime','per_min','s'), byIdx = bars('byIndex','clarity','');

const moved = byTime.findIndex(r => r.n===byIdx[0].n && r.m===byIdx[0].m);
const ord = k => k===0?'first':k===1?'second':k===2?'third':`${k+1}th`;
document.getElementById('flipnote').textContent =
  (byTime[0].n===byIdx[0].n && byTime[0].m===byIdx[0].m)
  ? 'Both orderings agree at the top here — on a larger set they routinely will not.'
  : `${byIdx[0].n} at ${byIdx[0].m.split(' v ')[0]} has the most readable board of the four and comes ${ord(moved)} on screen time. `
    + `${byTime[0].n} at ${byTime[0].m.split(' v ')[0]} is the reverse: most time, least readable. `
    + `The exposure index multiplies the two, so seconds dominate it and the wide camera still wins — which means the weighting, not the footage, is deciding the ranking. Nobody has calibrated those weights yet.`;

document.getElementById('rows').innerHTML = D.matches.map(m => {
  const has = D.sponsors.filter(n => m.sponsors[n]);
  const miss = D.sponsors.filter(n => !m.sponsors[n]);
  return has.map(n => {
    const s = m.sponsors[n];
    return `<tr><td><span class="dot" style="background:${col(n)}"></span>${m.name.split(' v ')[0]} — ${n}</td>
      <td>${s.seconds}</td><td>${s.per_min}</td><td>${s.pct}%</td><td>${s.runs}</td>
      <td>${s.longest}s</td><td>${s.clarity.toFixed(2)}</td><td>${s.area.toFixed(2)}%</td></tr>`;
  }).join('') + miss.map(n =>
    `<tr><td><span class="dot" style="background:${col(n)}"></span>${m.name.split(' v ')[0]} — ${n}</td>
     <td colspan="7" style="text-align:left;color:var(--ink-2);font-family:'IBM Plex Sans',sans-serif">
     not detected in this package</td></tr>`).join('');
}).join('');

document.getElementById('grounds').innerHTML = D.matches.map((m,i) => `
  <div class="gcard">
    <div class="hd"><b>${m.name}</b><div>${m.duration}s package · ${m.samples} samples</div></div>
    <div class="hm">${m.bg ? `<img src="data:image/jpeg;base64,${m.bg}" alt="">` : ''}
      <canvas id="hm${i}"></canvas></div>
    <div class="note">${D.sponsors.filter(n=>m.sponsors[n])
      .map(n=>`<span class="dot" style="background:${col(n)}"></span>${n}`).join(' &nbsp; ')}</div>
  </div>`).join('');

requestAnimationFrame(() => D.matches.forEach((m,i) => {
  const cv = document.getElementById('hm'+i); if (!cv) return;
  const r = cv.getBoundingClientRect(), dpr = devicePixelRatio||1;
  cv.width = Math.max(1,r.width*dpr); cv.height = Math.max(1,r.height*dpr);
  const c = cv.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0);
  const [G0,G1] = D.grid, cw = r.width/G1, ch = r.height/G0;
  D.sponsors.forEach(n => {
    const s = m.sponsors[n]; if (!s) return;
    let max = 0; s.heat.forEach(row => row.forEach(v => { if (v>max) max=v; }));
    const hex = col(n);
    const rgb = [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
    for (let y=0;y<G0;y++) for (let x=0;x<G1;x++){
      const v = s.heat[y][x]/(max||1); if (!v) continue;
      c.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.25+0.7*v})`;
      c.fillRect(x*cw, y*ch, cw+0.6, ch+0.6);
    }
  });
}));
</script>
"""

out = HTML.replace("__DATA__", json.dumps(payload, separators=(",", ":")))
open("compare_report.html", "w").write(out)
print(f"{len(out)/1e6:.2f} MB")
for m in matches:
    print(m["name"], {k: (v and {kk: v[kk] for kk in ('seconds','per_min','index_per_min','clarity')})
                      for k, v in m["sponsors"].items()})
print("totals:", totals)
