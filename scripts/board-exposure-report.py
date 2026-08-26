#!/usr/bin/env python3
"""
Assemble the standalone review page: data + frames inlined, no external hosts.

Every headline figure is computed from the detections rather than typed in, so
the same script serves any clip. Pass the match name and it does the rest:

    python3 build_report.py "Sutton United v Hartlepool" "Sutton Board Exposure"
"""
import base64
import json
import os
import statistics as st
import sys

TITLE = sys.argv[2] if len(sys.argv) > 2 else "Board Exposure"
MATCH = sys.argv[1] if len(sys.argv) > 1 else "Match"

D = json.load(open("report_data2.json"))
S = D["samples"]
IV = D["interval"]
COLOURS = {"Enterprise": "#ff4d4d", "TIC Health": "#4db2ff"}

frames = {}
for s in S:
    if s["frame"]:
        p = os.path.join("rf2", s["frame"])
        if os.path.exists(p):
            frames[s["i"]] = base64.b64encode(open(p, "rb").read()).decode()


def stats_for(name):
    idxs = [s["i"] for s in S if s["hits"].get(name)]
    if not idxs:
        return None
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
    return {
        "seconds": round(secs, 1),
        "pct": round(100 * secs / D["duration"]),
        "runs": len(runs),
        "index": round(index, 1),
        "clarity": round(st.mean([h["clarity"] for h in flat]), 2),
        "area": round(st.mean([h["area"] for h in flat]), 2),
        "most": max((len(by[i]) for i in idxs), default=0),
        "detections": len(idxs),
    }


sponsors = {n: stats_for(n) for n in D["sponsors"]}
present = [n for n, v in sponsors.items() if v]
primary = max(present, key=lambda n: sponsors[n]["index"]) if present else D["sponsors"][0]

payload = {
    "vw": D["video_w"], "vh": D["video_h"], "interval": IV,
    "duration": D["duration"], "match": MATCH,
    "sponsors": D["sponsors"], "stats": sponsors, "primary": primary,
    "colours": COLOURS,
    "samples": [{"i": s["i"], "t": s["t"], "h": s["hits"]} for s in S],
    "frames": frames,
}


def mmss(t):
    return f"{int(t//60)}:{t-int(t//60)*60:04.1f}"


HTML = """<title>__TITLE__</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
:root{
  --primary:#9e0000; --primary-400:#c56659;
  --warn:#c96f15;
  --ground:#f3f5f9; --panel:#fff; --ink:#11214a; --ink-2:#5a6a82; --line:#dde3ed;
  --stage:#03081b; --stage-line:#1b2a4a;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#070c18; --panel:#0d1526; --ink:#e8edf6; --ink-2:#8fa0bd; --line:#1e2b45;
  }
}
:root[data-theme="dark"]{
  --ground:#070c18; --panel:#0d1526; --ink:#e8edf6; --ink-2:#8fa0bd; --line:#1e2b45;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);
  font-family:"IBM Plex Sans",system-ui,sans-serif;font-size:15px;line-height:1.55}
.wrap{max-width:1320px;margin:0 auto;padding:28px 24px 64px}
.eyebrow{font-family:"Barlow Condensed",Impact,sans-serif;text-transform:uppercase;
  letter-spacing:.13em;font-weight:600;font-size:13px;color:var(--primary-400)}
h1{font-family:"Barlow Condensed",Impact,sans-serif;font-weight:700;
  font-size:clamp(30px,4.4vw,46px);line-height:1.02;margin:.14em 0 .1em;text-wrap:balance}
.sub{color:var(--ink-2);max-width:62ch;margin:0 0 22px}
.cols{display:grid;grid-template-columns:minmax(0,1.62fr) minmax(300px,1fr);gap:22px;align-items:start}
@media(max-width:960px){.cols{grid-template-columns:1fr}}
.stage{background:var(--stage);border:1px solid var(--stage-line);border-radius:10px;overflow:hidden}
.viewer{position:relative;line-height:0;background:#000}
.viewer img{width:100%;height:auto;display:block}
.viewer svg{position:absolute;inset:0;width:100%;height:100%}
.quad{fill:rgba(255,255,255,.10);stroke-width:2.2;vector-effect:non-scaling-stroke}
.tag{font-family:"IBM Plex Mono",monospace;font-size:11px;font-weight:600;fill:#fff;
  paint-order:stroke;stroke:#03081b;stroke-width:3px}
.empty{position:absolute;inset:auto 0 0 0;padding:10px 14px;
  font-family:"IBM Plex Mono",monospace;font-size:12px;color:#7d8db0;
  background:linear-gradient(transparent,rgba(3,8,27,.85))}
.transport{display:flex;align-items:center;gap:14px;padding:10px 14px;
  border-top:1px solid var(--stage-line);background:#060d1d;flex-wrap:wrap}
button.play{font-family:"Barlow Condensed",sans-serif;text-transform:uppercase;
  letter-spacing:.1em;font-weight:600;font-size:14px;background:var(--primary);color:#fff;
  border:0;border-radius:5px;padding:7px 16px;cursor:pointer}
button.play:hover{background:#7e0000}
button.play:focus-visible,.track:focus-visible,.tab:focus-visible{outline:2px solid #ff6b6b;outline-offset:2px}
.tc{font-family:"IBM Plex Mono",monospace;font-size:13px;color:#9fb0d0;font-variant-numeric:tabular-nums}
.tc b{color:#fff;font-weight:600}
.tabs{margin-left:auto;display:flex;gap:6px}
.tab{font-family:"Barlow Condensed",sans-serif;text-transform:uppercase;letter-spacing:.09em;
  font-weight:600;font-size:13px;background:transparent;border:1px solid #2a3c60;color:#9fb0d0;
  border-radius:99px;padding:4px 13px;cursor:pointer;display:flex;align-items:center;gap:7px}
.tab i{width:9px;height:9px;border-radius:2px;display:block}
.tab[aria-pressed="true"]{color:#fff;border-color:#5d7099;background:#152banother}
.tab[aria-pressed="true"]{background:#16233d}
.track{position:relative;height:92px;background:#060d1d;border-top:1px solid var(--stage-line);cursor:pointer}
.track canvas{width:100%;height:100%;display:block}
.play-head{position:absolute;top:0;bottom:0;width:2px;background:#fff;pointer-events:none;
  box-shadow:0 0 7px rgba(255,255,255,.6)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;
  padding:18px;margin-bottom:16px}
.card h2{font-family:"Barlow Condensed",sans-serif;text-transform:uppercase;letter-spacing:.1em;
  font-size:13px;font-weight:600;color:var(--ink-2);margin:0 0 12px}
.big{font-family:"Barlow Condensed",sans-serif;font-weight:700;font-size:52px;line-height:.92;
  font-variant-numeric:tabular-nums}
.big span{font-size:20px;color:var(--ink-2);font-weight:600}
.of{color:var(--ink-2);font-size:13.5px;margin-top:4px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;margin-top:16px}
.stat .k{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-2)}
.stat .v{font-family:"IBM Plex Mono",monospace;font-size:19px;font-weight:600;
  font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:left;font-family:"Barlow Condensed",sans-serif;text-transform:uppercase;
  letter-spacing:.08em;font-size:11.5px;color:var(--ink-2);font-weight:600;padding:0 0 7px;
  border-bottom:1px solid var(--line)}
td{padding:7px 0;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
tr:last-child td{border-bottom:0}
tbody tr{cursor:pointer}
tbody tr:hover td{color:var(--primary-400)}
td.mono{font-family:"IBM Plex Mono",monospace}
.bar{height:5px;border-radius:3px;display:block}
.heat{position:relative;border-radius:7px;overflow:hidden;background:#03081b;line-height:0}
.heat img{width:100%;display:block;opacity:.42}
.heat canvas{position:absolute;inset:0;width:100%;height:100%}
.note{font-size:12.5px;color:var(--ink-2);margin-top:10px;line-height:1.5}
footer{margin-top:26px;padding-top:16px;border-top:1px solid var(--line);color:var(--ink-2);
  font-size:12.5px;max-width:78ch}
code{font-family:"IBM Plex Mono",monospace;font-size:.92em}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>

<div class="wrap">
  <div class="eyebrow">Perimeter advertising &middot; concept</div>
  <h1>__MATCH__</h1>
  <p class="sub">Highlights package, __DUR__. Sampled twice a second and matched against the
  National League partner marks &mdash; using each brand&rsquo;s own logo file, not a crop taken
  from this ground. Switch sponsor, then scrub the timeline to see what the detector saw.</p>

  <div class="cols">
    <section>
      <div class="stage">
        <div class="viewer" id="viewer">
          <img id="shot" alt="Sampled frame from the match">
          <svg id="ov" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
          <div class="empty" id="empty"></div>
        </div>
        <div class="transport">
          <button class="play" id="play" type="button">Play</button>
          <div class="tc"><b id="tc">0:00.0</b> / __DUR__</div>
          <div class="tabs" id="tabs"></div>
        </div>
        <div class="track" id="track" tabindex="0" role="slider" aria-label="Timeline"
             aria-valuemin="0" aria-valuemax="__DURSEC__" aria-valuenow="0">
          <canvas id="tl"></canvas>
          <div class="play-head" id="head" style="left:0"></div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2 id="apphead">Appearances</h2>
        <table>
          <thead><tr><th>In</th><th>Out</th><th>Held</th><th>Clarity</th></tr></thead>
          <tbody id="runs"></tbody>
        </table>
      </div>
    </section>

    <aside>
      <div class="card">
        <h2 id="sponhead">Time on screen</h2>
        <div class="big" id="secs">&mdash;</div>
        <div class="of" id="of"></div>
        <div class="grid2">
          <div class="stat"><div class="k">Exposure index</div><div class="v" id="idx">&mdash;</div></div>
          <div class="stat"><div class="k">Mean clarity</div><div class="v" id="cl">&mdash;</div></div>
          <div class="stat"><div class="k">Board size</div><div class="v" id="ar">&mdash;</div></div>
          <div class="stat"><div class="k">Most at once</div><div class="v" id="mb">&mdash;</div></div>
        </div>
        <p class="note">Exposure index is seconds weighted by how readable the board was. Clarity
        is measured from the picture &mdash; size, focus, contrast, angle &mdash; and deliberately
        kept apart from how confident the matcher is.</p>
      </div>

      <div class="card">
        <h2>Where it appeared</h2>
        <div class="heat"><img id="heatbg" alt="Heatmap over a match frame"><canvas id="hm"></canvas></div>
        <p class="note" id="heatnote">Every detection accumulated across the package, weighted by
        clarity.</p>
      </div>
    </aside>
  </div>

  <footer>
    Concept built from a single highlights package. Every match came from the logo files in
    <code>assets/partners/</code> &mdash; the same ones the commercial tools use &mdash; with nothing
    cropped from this ground, which is the part that matters for running this across 72 clubs.
    The numbers are the detector&rsquo;s own and have not been checked against a hand-count, so treat
    this as the shape of the report rather than as evidence for a partner.
  </footer>
</div>

<script>
const D = __DATA__;
const S = D.samples, F = D.frames;
let sponsor = D.primary, cur = 0, playing = false, timer = null;

const shot=document.getElementById('shot'), ov=document.getElementById('ov');
const tcEl=document.getElementById('tc'), head=document.getElementById('head');
const track=document.getElementById('track'), empty=document.getElementById('empty');
const tl=document.getElementById('tl');
ov.setAttribute('viewBox', `0 0 ${D.vw} ${D.vh}`);

const fmt = t => { const m=Math.floor(t/60); return `${m}:${(t-m*60).toFixed(1).padStart(4,'0')}`; };
const hitsAt = (s,n) => (s && s.h && s.h[n]) || [];

function frameFor(i){
  for (let d=0; d<50; d++){
    if (F[i-d]!==undefined) return i-d;
    if (F[i+d]!==undefined) return i+d;
  }
  return null;
}

// Sponsor tabs
document.getElementById('tabs').innerHTML = D.sponsors.map(n =>
  `<button class="tab" type="button" data-s="${n}" aria-pressed="${n===sponsor}">
     <i style="background:${D.colours[n]||'#fff'}"></i>${n}</button>`).join('');
document.getElementById('tabs').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if (!b) return;
  sponsor = b.dataset.s;
  document.querySelectorAll('.tab').forEach(t =>
    t.setAttribute('aria-pressed', String(t.dataset.s === sponsor)));
  renderSponsor(); paintTrack(); draw(cur);
});

function draw(i){
  cur = Math.max(0, Math.min(S.length-1, i));
  const s = S[cur], fi = frameFor(cur);
  if (fi !== null) shot.src = 'data:image/jpeg;base64,' + F[fi];
  tcEl.textContent = fmt(s ? s.t : 0);
  head.style.left = (100*cur/(S.length-1)) + '%';
  track.setAttribute('aria-valuenow', (s?s.t:0).toFixed(1));
  const col = D.colours[sponsor] || '#fff';
  const hits = hitsAt(s, sponsor);
  ov.innerHTML = hits.map(h => {
    const pts = h.quad.map(p=>p.join(',')).join(' ');
    const x = Math.min(...h.quad.map(p=>p[0])), y = Math.min(...h.quad.map(p=>p[1]));
    return `<polygon class="quad" points="${pts}" style="stroke:${col}"></polygon>` +
      `<text class="tag" x="${x}" y="${Math.max(16,y-8)}">${sponsor} &middot; clarity ${h.clarity.toFixed(2)}</text>`;
  }).join('');
  empty.textContent = hits.length
    ? `${hits.length} board${hits.length>1?'s':''} detected`
    : 'no board detected in this frame';
  empty.style.color = hits.length ? col : '#7d8db0';
}

// Time across, height up the frame, brightness by clarity — so a run reads as a
// band and you can see the board rise and fall as the camera tilts, which a bar
// chart of clarity alone throws away.
function paintTrack(){
  const r = track.getBoundingClientRect(), dpr = devicePixelRatio||1;
  tl.width = r.width*dpr; tl.height = r.height*dpr;
  const c = tl.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0);
  c.clearRect(0,0,r.width,r.height);
  const w = r.width/S.length, col = D.colours[sponsor]||'#fff';
  const rgb = col.length===7
    ? [parseInt(col.slice(1,3),16),parseInt(col.slice(3,5),16),parseInt(col.slice(5,7),16)]
    : [255,77,77];
  const PAD = 9, plot = r.height - PAD*2;

  c.strokeStyle = '#16223c'; c.lineWidth = 1;
  [0,.25,.5,.75,1].forEach(f => {
    const y = PAD + f*plot;
    c.beginPath(); c.moveTo(0, y+.5); c.lineTo(r.width, y+.5); c.stroke();
  });

  S.forEach((s,k) => {
    const hits = hitsAt(s, sponsor);
    if (!hits.length){
      c.fillStyle = '#131d33';
      c.fillRect(k*w, r.height-3, Math.max(w,1), 2);
      return;
    }
    hits.forEach(h => {
      const cy = h.quad.reduce((a,p)=>a+p[1],0)/4;
      const y = PAD + (cy/D.vh)*plot;
      const hh = Math.max(3, Math.min(11, 3 + h.area*9));
      c.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.30+0.70*h.clarity})`;
      c.fillRect(k*w, y-hh/2, Math.max(w,1.6), hh);
    });
  });

  c.font = '10px "IBM Plex Mono", monospace';
  c.fillStyle = '#54658a';
  c.fillText('top of frame', 6, PAD+9);
  c.fillText('bottom', 6, r.height-PAD-2);
}

function seek(ev){
  const r = track.getBoundingClientRect();
  const x = (ev.touches?ev.touches[0].clientX:ev.clientX) - r.left;
  draw(Math.round((x/r.width)*(S.length-1)));
}
track.addEventListener('pointerdown', e => { track.setPointerCapture(e.pointerId); seek(e); });
track.addEventListener('pointermove', e => { if (e.buttons) seek(e); });
track.addEventListener('keydown', e => {
  if (e.key==='ArrowRight'){ draw(cur+1); e.preventDefault(); }
  if (e.key==='ArrowLeft'){ draw(cur-1); e.preventDefault(); }
});

const playBtn = document.getElementById('play');
playBtn.addEventListener('click', () => {
  playing = !playing;
  playBtn.textContent = playing ? 'Pause' : 'Play';
  if (playing) timer = setInterval(() => draw(cur >= S.length-1 ? 0 : cur+1), 1000*D.interval);
  else clearInterval(timer);
});

function runsFor(n){
  const out = []; let run = null;
  S.forEach(s => {
    if (hitsAt(s,n).length){
      const cl = hitsAt(s,n).map(h=>h.clarity);
      if (run && s.i - run.last <= 3){ run.last = s.i; run.cl.push(...cl); }
      else { if (run) out.push(run); run = {first:s.i, last:s.i, cl}; }
    }
  });
  if (run) out.push(run);
  return out.filter(r => r.last > r.first);
}

function renderSponsor(){
  const st = D.stats[sponsor], col = D.colours[sponsor]||'#9e0000';
  document.getElementById('sponhead').textContent = sponsor + ' — time on screen';
  document.getElementById('apphead').textContent = sponsor + ' — appearances';
  if (!st){
    document.getElementById('secs').innerHTML = '&mdash;';
    document.getElementById('of').textContent = 'Not detected in this package — which is not the same as absent, and needs a hand-count before anyone says either.';
    ['idx','cl','ar','mb'].forEach(k => document.getElementById(k).innerHTML='&mdash;');
    document.getElementById('runs').innerHTML = '';
    return;
  }
  document.getElementById('secs').innerHTML = st.seconds + '<span>s</span>';
  document.getElementById('of').textContent =
    `of ${D.duration}s — ${st.pct}% of the package, across ${st.runs} separate appearances`;
  document.getElementById('idx').textContent = st.index.toFixed(1);
  document.getElementById('cl').textContent = st.clarity.toFixed(2);
  document.getElementById('ar').textContent = st.area.toFixed(2) + '%';
  document.getElementById('mb').textContent = st.most;

  document.getElementById('runs').innerHTML = runsFor(sponsor).map(r => {
    const a = r.first*D.interval, b = (r.last+1)*D.interval;
    const cl = r.cl.reduce((x,y)=>x+y,0)/r.cl.length;
    return `<tr data-i="${r.first}"><td class="mono">${fmt(a)}</td><td class="mono">${fmt(b)}</td>` +
      `<td class="mono">${(b-a).toFixed(1)}s</td>` +
      `<td><span class="bar" style="width:${Math.round(cl*100)}%;background:${col}"></span></td></tr>`;
  }).join('');

  // Heatmap, accumulated from the quads themselves.
  const G = [24,42], acc = Array.from({length:G[0]}, () => new Array(G[1]).fill(0));
  let max = 0;
  S.forEach(s => hitsAt(s,sponsor).forEach(h => {
    const cx = h.quad.reduce((a,p)=>a+p[0],0)/4, cy = h.quad.reduce((a,p)=>a+p[1],0)/4;
    const r = Math.min(G[0]-1, Math.max(0, Math.floor(cy/D.vh*G[0])));
    const c = Math.min(G[1]-1, Math.max(0, Math.floor(cx/D.vw*G[1])));
    acc[r][c] += h.clarity; max = Math.max(max, acc[r][c]);
  }));
  const best = S.find(s => hitsAt(s,sponsor).length && F[s.i]!==undefined);
  if (best) document.getElementById('heatbg').src = 'data:image/jpeg;base64,' + F[best.i];
  const cv = document.getElementById('hm');
  requestAnimationFrame(() => {
    const r = cv.getBoundingClientRect(), dpr = devicePixelRatio||1;
    cv.width = Math.max(1,r.width*dpr); cv.height = Math.max(1,r.height*dpr);
    const c = cv.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0);
    c.clearRect(0,0,r.width,r.height);
    const cw = r.width/G[1], ch = r.height/G[0];
    const rgb = col.length===7
      ? [parseInt(col.slice(1,3),16),parseInt(col.slice(3,5),16),parseInt(col.slice(5,7),16)]
      : [255,77,77];
    for (let y=0;y<G[0];y++) for (let x=0;x<G[1];x++){
      const v = acc[y][x]/(max||1); if (!v) continue;
      c.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.22+0.72*v})`;
      c.fillRect(x*cw, y*ch, cw+0.6, ch+0.6);
    }
  });
  document.getElementById('runs').onclick = e => {
    const tr = e.target.closest('tr'); if (tr) draw(+tr.dataset.i);
  };
}

addEventListener('resize', () => { paintTrack(); renderSponsor(); });
renderSponsor(); paintTrack(); draw(0);
</script>
"""

out = (HTML.replace("__DATA__", json.dumps(payload, separators=(",", ":")))
           .replace("__TITLE__", TITLE)
           .replace("__MATCH__", MATCH)
           .replace("__DURSEC__", str(D["duration"]))
           .replace("__DUR__", mmss(D["duration"])))
open("board_report.html", "w").write(out)
print(f"{len(out)/1e6:.2f} MB  primary={primary}")
for n, v in sponsors.items():
    print(f"  {n}: {v}")
