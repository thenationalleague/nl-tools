#!/usr/bin/env python3
"""Assemble the standalone review page: data + frames inlined, no external hosts."""
import base64
import json
import os

D = json.load(open("report_data2.json"))
FR = "rf2"

frames = {}
for s in D["samples"]:
    if s["frame"]:
        p = os.path.join(FR, s["frame"])
        if os.path.exists(p):
            frames[s["i"]] = base64.b64encode(open(p, "rb").read()).decode()

payload = {
    "vw": D["video_w"], "vh": D["video_h"],
    "interval": D["interval"], "duration": D["duration"],
    "sponsors": D["sponsors"],
    "samples": [{"i": s["i"], "t": s["t"], "h": s["hits"]} for s in D["samples"]],
    "frames": frames,
}

HTML = """<title>Harrogate Board Exposure</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
:root{
  --primary:#9e0000; --primary-400:#c56659; --primary-100:#f7e4e0;
  --navy:#223b7c; --navy-300:#9baac9; --navy-600:#192e63; --navy-900:#03081b;
  --good:#1a7030; --warn:#c96f15;
  --ground:#f3f5f9; --panel:#ffffff; --panel-2:#f7f9fc;
  --ink:#11214a; --ink-2:#5a6a82; --line:#dde3ed;
  --stage:#03081b; --stage-line:#1b2a4a;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#070c18; --panel:#0d1526; --panel-2:#111b30;
    --ink:#e8edf6; --ink-2:#8fa0bd; --line:#1e2b45;
    --primary-100:#2a0f0f; --navy-300:#6277a7;
  }
}
:root[data-theme="dark"]{
  --ground:#070c18; --panel:#0d1526; --panel-2:#111b30;
  --ink:#e8edf6; --ink-2:#8fa0bd; --line:#1e2b45;
  --primary-100:#2a0f0f; --navy-300:#6277a7;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:"IBM Plex Sans",system-ui,-apple-system,sans-serif;
  font-size:15px; line-height:1.55;
}
.wrap{max-width:1320px;margin:0 auto;padding:28px 24px 64px}
.eyebrow{
  font-family:"Barlow Condensed",Impact,sans-serif;
  text-transform:uppercase;letter-spacing:.13em;font-weight:600;
  font-size:13px;color:var(--primary-400);
}
h1{
  font-family:"Barlow Condensed",Impact,sans-serif;
  font-weight:700;font-size:clamp(30px,4.4vw,46px);line-height:1.02;
  margin:.14em 0 .1em;text-wrap:balance;letter-spacing:.005em;
}
.sub{color:var(--ink-2);max-width:62ch;margin:0 0 22px}
.cols{display:grid;grid-template-columns:minmax(0,1.62fr) minmax(300px,1fr);gap:22px;align-items:start}
@media(max-width:960px){.cols{grid-template-columns:1fr}}

.stage{background:var(--stage);border:1px solid var(--stage-line);border-radius:10px;overflow:hidden}
.viewer{position:relative;line-height:0;background:#000}
.viewer img{width:100%;height:auto;display:block}
.viewer svg{position:absolute;inset:0;width:100%;height:100%}
.quad{fill:rgba(158,0,0,.16);stroke:#ff4d4d;stroke-width:2.2;vector-effect:non-scaling-stroke}
.tag{
  font-family:"IBM Plex Mono",monospace;font-size:11px;font-weight:600;
  fill:#fff;paint-order:stroke;stroke:#03081b;stroke-width:3px;
}
.empty{
  position:absolute;inset:auto 0 0 0;padding:10px 14px;
  font-family:"IBM Plex Mono",monospace;font-size:12px;color:#7d8db0;
  background:linear-gradient(transparent,rgba(3,8,27,.85));
}
.transport{
  display:flex;align-items:center;gap:14px;padding:10px 14px;
  border-top:1px solid var(--stage-line);background:#060d1d;
}
button.play{
  font-family:"Barlow Condensed",sans-serif;text-transform:uppercase;
  letter-spacing:.1em;font-weight:600;font-size:14px;
  background:var(--primary);color:#fff;border:0;border-radius:5px;
  padding:7px 16px;cursor:pointer;
}
button.play:hover{background:#7e0000}
button.play:focus-visible,.track:focus-visible{outline:2px solid #ff6b6b;outline-offset:2px}
.tc{font-family:"IBM Plex Mono",monospace;font-size:13px;color:#9fb0d0;font-variant-numeric:tabular-nums}
.tc b{color:#fff;font-weight:600}
.legend{margin-left:auto;display:flex;gap:14px;font-size:11.5px;color:#7d8db0}
.legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px}

.track{position:relative;height:74px;background:#060d1d;border-top:1px solid var(--stage-line);cursor:pointer}
.track canvas{width:100%;height:100%;display:block}
.play-head{position:absolute;top:0;bottom:0;width:2px;background:#fff;pointer-events:none;box-shadow:0 0 7px rgba(255,255,255,.6)}

.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px 18px 16px;margin-bottom:16px}
.card h2{
  font-family:"Barlow Condensed",sans-serif;text-transform:uppercase;
  letter-spacing:.1em;font-size:13px;font-weight:600;color:var(--ink-2);
  margin:0 0 12px;
}
.big{font-family:"Barlow Condensed",sans-serif;font-weight:700;font-size:52px;line-height:.92;font-variant-numeric:tabular-nums}
.big span{font-size:20px;color:var(--ink-2);font-weight:600}
.of{color:var(--ink-2);font-size:13.5px;margin-top:4px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;margin-top:16px}
.stat .k{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-2)}
.stat .v{font-family:"IBM Plex Mono",monospace;font-size:19px;font-weight:600;font-variant-numeric:tabular-nums}
.pill{
  display:inline-flex;align-items:center;gap:6px;border-radius:99px;padding:3px 11px;
  font-size:12px;font-weight:600;border:1px solid;
}
.pill.unver{color:var(--warn);border-color:var(--warn);background:transparent}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{
  text-align:left;font-family:"Barlow Condensed",sans-serif;text-transform:uppercase;
  letter-spacing:.08em;font-size:11.5px;color:var(--ink-2);font-weight:600;
  padding:0 0 7px;border-bottom:1px solid var(--line);
}
td{padding:7px 0;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
tr:last-child td{border-bottom:0}
tbody tr{cursor:pointer}
tbody tr:hover td{color:var(--primary-400)}
td.mono{font-family:"IBM Plex Mono",monospace}
.bar{height:5px;border-radius:3px;background:var(--primary);display:block}
.heat{position:relative;border-radius:7px;overflow:hidden;background:#03081b;line-height:0}
.heat img{width:100%;display:block;opacity:.42}
.heat canvas{position:absolute;inset:0;width:100%;height:100%}
.note{font-size:12.5px;color:var(--ink-2);margin-top:10px;line-height:1.5}
footer{margin-top:26px;padding-top:16px;border-top:1px solid var(--line);color:var(--ink-2);font-size:12.5px;max-width:78ch}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>

<div class="wrap">
  <div class="eyebrow">Perimeter advertising &middot; concept</div>
  <h1>Harrogate Town v Barnet</h1>
  <p class="sub">Highlights package, 3m 28s. Every frame sampled twice a second and matched
  against the National League partner marks &mdash; using the brand&rsquo;s own logo file, not a crop
  taken from this ground. Scrub the timeline to see what the detector saw.</p>

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
          <div class="tc"><b id="tc">0:00.0</b> / 3:28.0</div>
          <div class="legend">
            <span><i style="background:#ff4d4d"></i>Enterprise</span>
            <span><i style="background:#2b3a5c"></i>no detection</span>
          </div>
        </div>
        <div class="track" id="track" tabindex="0" role="slider" aria-label="Timeline"
             aria-valuemin="0" aria-valuemax="208" aria-valuenow="0">
          <canvas id="tl"></canvas>
          <div class="play-head" id="head" style="left:0"></div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>Appearances</h2>
        <table>
          <thead><tr><th>In</th><th>Out</th><th>Held</th><th>Clarity</th></tr></thead>
          <tbody id="runs"></tbody>
        </table>
      </div>
    </section>

    <aside>
      <div class="card">
        <h2>Enterprise &mdash; time on screen</h2>
        <div class="big" id="secs">38.6<span>s</span></div>
        <div class="of">of 207.9s &mdash; 19% of the package, across 7 separate appearances</div>
        <div class="grid2">
          <div class="stat"><div class="k">Exposure index</div><div class="v" id="idx">22.0</div></div>
          <div class="stat"><div class="k">Mean clarity</div><div class="v" id="cl">0.57</div></div>
          <div class="stat"><div class="k">Board size</div><div class="v" id="ar">0.46%</div></div>
          <div class="stat"><div class="k">Most at once</div><div class="v" id="mb">2</div></div>
        </div>
        <p class="note">Exposure index is seconds weighted by how readable the board was.
        Clarity is measured from the picture &mdash; size, focus, contrast, angle &mdash; and
        deliberately kept apart from how confident the matcher is.</p>
      </div>

      <div class="card">
        <h2>TIC Health</h2>
        <span class="pill unver">Not detected &middot; unverified</span>
        <p class="note">No detections in this package. That is not the same as absent: a
        goal-focused edit may never show a far-side board, and nothing in the output separates
        that from a miss. It needs a hand-count before anyone says either.</p>
      </div>

      <div class="card">
        <h2>Where it appeared</h2>
        <div class="heat"><img id="heatbg" alt="Heatmap over a match frame"><canvas id="hm"></canvas></div>
        <p class="note">Every detection accumulated across the package, weighted by clarity.
        Enterprise sits in one band of the perimeter, which is what a placement report needs
        to price a board.</p>
      </div>


    </aside>
  </div>

  <footer>
    Concept built from a single highlights package. Every match here came from <code>assets/partners/Enterprise.png</code> &mdash; the same file the commercial tools use &mdash; against a ground the detector had never seen, which is the part that matters for doing this across 72 clubs. The numbers are still the detector&rsquo;s own and have not been checked against a hand-count, so treat this as the shape of the report rather than as evidence for a partner.
  </footer>
</div>

<script>
const D = __DATA__;
const S = D.samples, F = D.frames;
const byI = new Map(S.map(s => [s.i, s]));
let cur = 0, playing = false, timer = null;

const shot = document.getElementById('shot'), ov = document.getElementById('ov');
const tcEl = document.getElementById('tc'), head = document.getElementById('head');
const track = document.getElementById('track'), empty = document.getElementById('empty');

ov.setAttribute('viewBox', `0 0 ${D.vw} ${D.vh}`);

function fmt(t){ const m = Math.floor(t/60); return `${m}:${(t-m*60).toFixed(1).padStart(4,'0')}`; }

// Nearest sample that actually has a frame stored.
function frameFor(i){
  for (let d = 0; d < 40; d++){
    if (F[i-d] !== undefined) return i-d;
    if (F[i+d] !== undefined) return i+d;
  }
  return null;
}

function draw(i){
  cur = Math.max(0, Math.min(S.length-1, i));
  const s = byI.get(cur);
  const fi = frameFor(cur);
  if (fi !== null) shot.src = 'data:image/jpeg;base64,' + F[fi];
  tcEl.textContent = fmt(s ? s.t : 0);
  head.style.left = (100 * cur / (S.length-1)) + '%';
  track.setAttribute('aria-valuenow', (s ? s.t : 0).toFixed(1));

  const hits = (s && s.h && s.h['Enterprise']) || [];
  ov.innerHTML = hits.map(h => {
    const pts = h.quad.map(p => p.join(',')).join(' ');
    const x = Math.min(...h.quad.map(p=>p[0])), y = Math.min(...h.quad.map(p=>p[1]));
    return `<polygon class="quad" points="${pts}"></polygon>` +
           `<text class="tag" x="${x}" y="${Math.max(16,y-8)}">Enterprise &middot; clarity ${h.clarity.toFixed(2)}</text>`;
  }).join('');
  empty.textContent = hits.length
    ? `${hits.length} board${hits.length>1?'s':''} detected`
    : 'no board detected in this frame';
  empty.style.color = hits.length ? '#ff9d9d' : '#7d8db0';
}

// Timeline: a bar per sample, height by clarity, so runs read as blocks.
const tl = document.getElementById('tl');
function paintTrack(){
  const r = track.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  tl.width = r.width*dpr; tl.height = r.height*dpr;
  const c = tl.getContext('2d'); c.scale(dpr,dpr);
  c.clearRect(0,0,r.width,r.height);
  const w = r.width / S.length;
  S.forEach((s,k) => {
    const hits = (s.h && s.h['Enterprise']) || [];
    const x = k*w;
    if (!hits.length){
      c.fillStyle = '#1a2540';
      c.fillRect(x, r.height-9, Math.max(w,1), 7);
    } else {
      const cl = Math.max(...hits.map(h=>h.clarity));
      const h = 12 + cl*50;
      c.fillStyle = '#9e0000';
      c.fillRect(x, r.height-2-h, Math.max(w,1.2), h);
      c.fillStyle = 'rgba(255,120,120,.85)';
      c.fillRect(x, r.height-2-h, Math.max(w,1.2), 2);
    }
  });
  c.strokeStyle = '#243356'; c.beginPath();
  c.moveTo(0, r.height-1.5); c.lineTo(r.width, r.height-1.5); c.stroke();
}

function seek(ev){
  const r = track.getBoundingClientRect();
  const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
  draw(Math.round((x / r.width) * (S.length-1)));
}
track.addEventListener('pointerdown', e => { track.setPointerCapture(e.pointerId); seek(e); });
track.addEventListener('pointermove', e => { if (e.buttons) seek(e); });
track.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight'){ draw(cur+1); e.preventDefault(); }
  if (e.key === 'ArrowLeft'){ draw(cur-1); e.preventDefault(); }
});

const playBtn = document.getElementById('play');
playBtn.addEventListener('click', () => {
  playing = !playing;
  playBtn.textContent = playing ? 'Pause' : 'Play';
  if (playing){
    timer = setInterval(() => {
      if (cur >= S.length-1){ draw(0); }
      else draw(cur+1);
    }, 1000 * D.interval);
  } else clearInterval(timer);
});

// Runs, derived here rather than trusted from the summary.
const runs = [];
let run = null;
S.forEach(s => {
  const has = s.h && s.h['Enterprise'] && s.h['Enterprise'].length;
  if (has){
    if (run && s.i - run.last <= 3) { run.last = s.i; run.cl.push(...s.h['Enterprise'].map(h=>h.clarity)); }
    else { if (run) runs.push(run); run = {first:s.i, last:s.i, cl:s.h['Enterprise'].map(h=>h.clarity)}; }
  }
});
if (run) runs.push(run);
const kept = runs.filter(r => r.last > r.first);
document.getElementById('runs').innerHTML = kept.map(r => {
  const a = r.first*D.interval, b = (r.last+1)*D.interval;
  const cl = r.cl.reduce((x,y)=>x+y,0)/r.cl.length;
  return `<tr data-i="${r.first}"><td class="mono">${fmt(a)}</td><td class="mono">${fmt(b)}</td>` +
         `<td class="mono">${(b-a).toFixed(1)}s</td>` +
         `<td><span class="bar" style="width:${Math.round(cl*100)}%"></span></td></tr>`;
}).join('');
document.getElementById('runs').addEventListener('click', e => {
  const tr = e.target.closest('tr'); if (tr) draw(+tr.dataset.i);
});

// Heatmap, accumulated from the quads themselves.
(function(){
  const G = [24, 42], acc = Array.from({length:G[0]}, () => new Array(G[1]).fill(0));
  let max = 0;
  S.forEach(s => ((s.h && s.h['Enterprise']) || []).forEach(h => {
    const cx = h.quad.reduce((a,p)=>a+p[0],0)/4, cy = h.quad.reduce((a,p)=>a+p[1],0)/4;
    const r = Math.min(G[0]-1, Math.max(0, Math.floor(cy/D.vh*G[0])));
    const c = Math.min(G[1]-1, Math.max(0, Math.floor(cx/D.vw*G[1])));
    acc[r][c] += h.clarity; max = Math.max(max, acc[r][c]);
  }));
  const best = S.find(s => s.h && s.h['Enterprise'] && F[s.i] !== undefined);
  if (best) document.getElementById('heatbg').src = 'data:image/jpeg;base64,' + F[best.i];
  const cv = document.getElementById('hm');
  requestAnimationFrame(() => {
    const r = cv.getBoundingClientRect(), dpr = devicePixelRatio||1;
    cv.width = Math.max(1,r.width*dpr); cv.height = Math.max(1,r.height*dpr);
    const c = cv.getContext('2d'); c.scale(dpr,dpr);
    const cw = r.width/G[1], ch = r.height/G[0];
    for (let y=0;y<G[0];y++) for (let x=0;x<G[1];x++){
      const v = acc[y][x]/(max||1); if (!v) continue;
      c.fillStyle = `rgba(${Math.round(158+97*v)},${Math.round(30*(1-v))},${Math.round(40*(1-v))},${0.25+0.7*v})`;
      c.fillRect(x*cw, y*ch, cw+0.6, ch+0.6);
    }
  });
})();

addEventListener('resize', paintTrack);
paintTrack();
draw(0);
</script>
"""

out = HTML.replace("__DATA__", json.dumps(payload, separators=(",", ":")))
open("board_report.html", "w").write(out)
print(f"{len(out)/1e6:.2f} MB")
