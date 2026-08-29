#!/usr/bin/env python3
"""
The review page: one HTML file, everything inlined, no external hosts.

Sized for a full match rather than a highlights clip, which changes three
things against the clip version:

  · 10,800 samples cannot each carry an embedded frame, so a budget of frames
    is spread across the match and the viewer snaps to the nearest one.
  · Samples with no detection are not stored at all — the payload is a sparse
    map of sample index to hits, which is most of the size saving.
  · Sponsors are grouped into league partners and this club's own boards,
    because that is the distinction the report exists to make.

Every headline figure is computed from the detections. Nothing is typed in.
"""
import base64
import json
import os
import statistics as st

import board_exposure_core as C

# Distinct hues that survive being drawn small on dark navy. The National
# League primary leads, then a spread that stays apart at 3px on the timeline.
PALETTE = ["#ff4d4d", "#4db2ff", "#ffb020", "#5fd38d", "#c78bff",
           "#ff8bc4", "#7ee0d8", "#f2e14c", "#9aa8ff", "#ff9f66",
           "#8fdd52", "#ff6fa8"]


def assign_colours(sponsors):
    """Sponsor -> colour, alphabetically.

    PALETTE and this ordering are mirrored by assignColours() in
    brand-exposure/index.html, so a match looks the same in this report and in
    the tool once it is uploaded. Change one, change both.
    """
    return {n: PALETTE[i % len(PALETTE)] for i, n in enumerate(sorted(sponsors))}


def mmss(t):
    m = int(t // 60)
    return f"{m}:{t - m * 60:04.1f}"


def hhmm(t):
    h, rem = int(t // 3600), t % 3600
    m, s = int(rem // 60), int(rem % 60)
    return f"{h}h {m:02d}m {s:02d}s" if h else f"{m}m {s:02d}s"


def stats_for(hits_by_index, name, interval, duration):
    """Seconds, runs and the clarity-weighted index for one sponsor."""
    from board_exposure_core import runs_from

    idxs = [i for i, h in hits_by_index.items() if h.get(name)]
    if not idxs:
        return None
    runs = runs_from(idxs, interval=interval)
    if not runs:
        return None
    flat = [h for i in idxs for h in hits_by_index[i][name]]
    secs = sum((r[-1] - r[0] + 1) * interval for r in runs)
    index = sum((r[-1] - r[0] + 1) * interval
                * st.mean([h["clarity"] for i in r for h in hits_by_index[i][name]])
                for r in runs)
    # Tracked hits carry visibility None — absent from both numbers, never a
    # pretend zero. A sponsor with no measured hits at all reports null.
    vis = [h["visibility"] for h in flat if h.get("visibility") is not None]
    return {
        "seconds": round(secs, 1),
        "pct": round(100 * secs / duration, 1),
        "runs": len(runs),
        "index": round(index, 1),
        "clarity": round(st.mean([h["clarity"] for h in flat]), 2),
        "area": round(st.mean([h["area"] for h in flat]), 3),
        "logo_area": round(st.mean([h["logo_area"] for h in flat]), 3),
        "most": max(len(hits_by_index[i][name]) for i in idxs),
        "detections": len(idxs),
        "longest": round(max((r[-1] - r[0] + 1) * interval for r in runs), 1),
        "visibility": round(st.mean(vis), 2) if vis else None,
        "blockedPct": (round(100 * sum(v < C.VIS_BLOCKED for v in vis) / len(vis), 1)
                       if vis else None),
    }


def choose_frames(hits_by_index, n_samples, budget):
    """
    Which sampled frames to embed.

    Two jobs at once: the viewer must show *something* wherever the timeline is
    scrubbed, and each sponsor needs at least one frame where its board is
    clearly visible for the heatmap backdrop. So take an even spread across the
    whole match, then add the best-clarity frame for every sponsor found.
    """
    picked = set()
    for name in {n for h in hits_by_index.values() for n in h}:
        best = max((i for i, h in hits_by_index.items() if h.get(name)),
                   key=lambda i: max(x["clarity"] for x in hits_by_index[i][name]))
        picked.add(best)
    # Ceiling, not floor. Dividing 338 samples by a budget of 235 floors to a
    # stride of 1 and takes every frame — 40% over budget, and the overshoot
    # grows as the sample count approaches the budget.
    room = max(1, budget - len(picked))
    spread = max(1, -(-n_samples // room))
    for i in range(0, n_samples, spread):
        picked.add(i)
    return sorted(picked)


def build(out_path, meta, hits_by_index, frame_files, sponsors_meta):
    """
    meta          — match, club, duration, interval, n_samples, video_w/h, source
    hits_by_index — {sample index: {sponsor: [hit, ...]}}, detections only
    frame_files   — {sample index: path to a small jpeg}
    sponsors_meta — {sponsor: 'partner' | 'club'}, every sponsor searched for
    """
    interval, duration = meta["interval"], meta["duration"]
    names = sorted(sponsors_meta)
    stats = {n: stats_for(hits_by_index, n, interval, duration) for n in names}
    present = [n for n in names if stats[n]]
    primary = max(present, key=lambda n: stats[n]["index"]) if present else (names[0] if names else "—")

    frames = {}
    for i, p in sorted(frame_files.items()):
        if os.path.exists(p):
            frames[str(i)] = base64.b64encode(open(p, "rb").read()).decode()

    compact = {}
    for i, per in hits_by_index.items():
        row = {}
        for name, hs in per.items():
            row[name] = [{
                "q": [[int(round(x)), int(round(y))] for x, y in h["quad"]],
                "b": ([int(v) for v in h["board"]] if h["board"] else None),
                "c": round(h["clarity"], 2),
                "a": round(h["area"], 3),
                "n": h["inliers"],
            } for h in hs]
        if row:
            compact[str(i)] = row

    payload = {
        "vw": meta["video_w"], "vh": meta["video_h"],
        "interval": interval, "duration": duration, "n": meta["n_samples"],
        "match": meta["match"], "club": meta.get("club") or "",
        "sponsors": names, "scope": sponsors_meta,
        "stats": stats, "primary": primary,
        "colours": assign_colours(names),
        "hits": compact,
        "frames": frames,
    }

    html = (TEMPLATE
            .replace("__DATA__", json.dumps(payload, separators=(",", ":")))
            .replace("__TITLE__", meta["match"])
            .replace("__MATCH__", meta["match"])
            .replace("__SUB__", meta["sub"])
            .replace("__FOOT__", meta["foot"])
            .replace("__MINRUNSECS__", str(C.MIN_RUN_SECS))
            .replace("__BRIDGESECS__", str(C.BRIDGE_SECS))
            .replace("__DURSEC__", str(round(duration, 1)))
            .replace("__DUR__", hhmm(duration)))
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    return payload, len(html)


TEMPLATE = """<meta charset="utf-8">
<title>__TITLE__</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
:root{
  --primary:#9e0000; --primary-400:#c56659;
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
.sub{color:var(--ink-2);max-width:66ch;margin:0 0 22px}
.cols{display:grid;grid-template-columns:minmax(0,1.62fr) minmax(300px,1fr);gap:22px;align-items:start}
@media(max-width:960px){.cols{grid-template-columns:1fr}}
.stage{background:var(--stage);border:1px solid var(--stage-line);border-radius:10px;overflow:hidden}
.viewer{position:relative;line-height:0;background:#000}
.viewer img{width:100%;height:auto;display:block}
.viewer svg{position:absolute;inset:0;width:100%;height:100%}
.board{fill:rgba(255,255,255,.07);stroke-width:1.4;stroke-dasharray:5 4;vector-effect:non-scaling-stroke}
.quad{fill:rgba(255,255,255,.13);stroke-width:2.2;vector-effect:non-scaling-stroke}
.tag{font-family:"IBM Plex Mono",monospace;font-size:11px;font-weight:600;fill:#fff;
  paint-order:stroke;stroke:#03081b;stroke-width:3px}
.empty{position:absolute;inset:auto 0 0 0;padding:10px 14px;
  font-family:"IBM Plex Mono",monospace;font-size:12px;color:#7d8db0;
  background:linear-gradient(transparent,rgba(3,8,27,.85))}
.approx{position:absolute;top:0;right:0;padding:5px 10px;font-family:"IBM Plex Mono",monospace;
  font-size:10.5px;color:#7d8db0;background:rgba(3,8,27,.72);border-bottom-left-radius:7px}
.transport{display:flex;align-items:center;gap:14px;padding:10px 14px;
  border-top:1px solid var(--stage-line);background:#060d1d;flex-wrap:wrap}
button.play{font-family:"Barlow Condensed",sans-serif;text-transform:uppercase;
  letter-spacing:.1em;font-weight:600;font-size:14px;background:var(--primary);color:#fff;
  border:0;border-radius:5px;padding:7px 16px;cursor:pointer}
button.play:hover{background:#7e0000}
button.nav{background:#16233d;color:#cfdbf0;border:1px solid #2a3c60;border-radius:5px;
  padding:6px 12px;cursor:pointer;font-size:13px;line-height:1}
button.nav:hover{background:#1e2f50;color:#fff}
button.nav:disabled{opacity:.35;cursor:default}
button.nav:focus-visible{outline:2px solid #ff6b6b;outline-offset:2px}
button.play:focus-visible,.track:focus-visible,.tab:focus-visible{outline:2px solid #ff6b6b;outline-offset:2px}
.tc{font-family:"IBM Plex Mono",monospace;font-size:13px;color:#9fb0d0;font-variant-numeric:tabular-nums}
.tc b{color:#fff;font-weight:600}
.picker{padding:9px 14px;border-top:1px solid var(--stage-line);background:#060d1d;
  display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
.pgroup{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.plabel{font-family:"Barlow Condensed",sans-serif;text-transform:uppercase;letter-spacing:.1em;
  font-size:11px;font-weight:600;color:#54658a;margin-right:2px}
.tab{font-family:"Barlow Condensed",sans-serif;text-transform:uppercase;letter-spacing:.09em;
  font-weight:600;font-size:13px;background:transparent;border:1px solid #2a3c60;color:#9fb0d0;
  border-radius:99px;padding:4px 13px;cursor:pointer;display:flex;align-items:center;gap:7px}
.tab i{width:9px;height:9px;border-radius:2px;display:block}
.tab[aria-pressed="true"]{color:#fff;border-color:#5d7099;background:#16233d}
.tab.none{opacity:.5}
.track{position:relative;height:104px;background:#060d1d;border-top:1px solid var(--stage-line);cursor:pointer}
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
th.r,td.r{text-align:right}
td{padding:7px 0;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
tr:last-child td{border-bottom:0}
tbody.click tr{cursor:pointer}
tbody.click tr:hover td{color:var(--primary-400)}
td.mono{font-family:"IBM Plex Mono",monospace}
.swatch{width:9px;height:9px;border-radius:2px;display:inline-block;margin-right:7px}
.scopetag{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-2);
  border:1px solid var(--line);border-radius:99px;padding:1px 7px;margin-left:7px}
.bar{height:5px;border-radius:3px;display:block;min-width:2px}
.scroll{max-height:330px;overflow-y:auto}
.heat{position:relative;border-radius:7px;overflow:hidden;background:#03081b;line-height:0}
.heat img{width:100%;display:block;opacity:.42}
.heat canvas{position:absolute;inset:0;width:100%;height:100%}
.note{font-size:12.5px;color:var(--ink-2);margin-top:10px;line-height:1.5}
footer{margin-top:26px;padding-top:16px;border-top:1px solid var(--line);color:var(--ink-2);
  font-size:12.5px;max-width:82ch}
code{font-family:"IBM Plex Mono",monospace;font-size:.92em}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>

<div class="wrap">
  <div class="eyebrow">Perimeter advertising &middot; concept</div>
  <h1>__MATCH__</h1>
  <p class="sub">__SUB__</p>

  <div class="cols">
    <section>
      <div class="stage">
        <div class="viewer" id="viewer">
          <img id="shot" alt="Sampled frame from the match">
          <svg id="ov" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
          <div class="approx" id="approx"></div>
          <div class="empty" id="empty"></div>
        </div>
        <div class="transport">
          <button class="nav" id="prev" type="button" aria-label="Previous appearance">&#9664;</button>
          <button class="play" id="play" type="button">Play</button>
          <button class="nav" id="next" type="button" aria-label="Next appearance">&#9654;</button>
          <div class="tc"><b id="tc">0:00.0</b> / __DUR__</div>
          <div class="tc" id="apcount"></div>
        </div>
        <div class="picker" id="picker"></div>
        <div class="track" id="track" tabindex="0" role="slider" aria-label="Timeline"
             aria-valuemin="0" aria-valuemax="__DURSEC__" aria-valuenow="0">
          <canvas id="tl"></canvas>
          <div class="play-head" id="head" style="left:0"></div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <h2>Every sponsor, ranked</h2>
        <table>
          <thead><tr><th>Sponsor</th><th class="r">On screen</th><th class="r">Share</th>
            <th class="r">Index</th><th class="r">Clarity</th><th class="r">Board</th>
            <th class="r" title="Share of detections where part of the board was covered — a steward, the physio table, a player">Blocked</th></tr></thead>
          <tbody id="league" class="click"></tbody>
        </table>
        <p class="note">Index is seconds weighted by clarity, so a board held large and sharp
        outranks one held longer at the far end of the pitch.</p>
      </div>

      <div class="card">
        <h2 id="apphead">Appearances</h2>
        <div class="scroll">
          <table>
            <thead><tr><th>In</th><th>Out</th><th class="r">Held</th><th>Clarity</th></tr></thead>
            <tbody id="runs" class="click"></tbody>
          </table>
        </div>
        <p class="note" id="runsnote"></p>
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
          <div class="stat"><div class="k">Longest hold</div><div class="v" id="lg">&mdash;</div></div>
          <div class="stat"><div class="k">Most at once</div><div class="v" id="mb">&mdash;</div></div>
          <div class="stat"><div class="k">Appearances</div><div class="v" id="rn">&mdash;</div></div>
        </div>
        <p class="note">Clarity is measured from the picture &mdash; size, focus, contrast, angle
        &mdash; and deliberately kept apart from how confident the matcher is. Confidence is a
        property of the software; it has no business inside a number sold as value.</p>
      </div>

      <div class="card">
        <h2>Where it appeared</h2>
        <div class="heat"><img id="heatbg" alt="Heatmap over a match frame"><canvas id="hm"></canvas></div>
        <p class="note">Every detection accumulated across the match, weighted by clarity, over the
        frame where this board read most clearly.</p>
      </div>
    </aside>
  </div>

  <footer>__FOOT__</footer>
</div>

<script>
const D = __DATA__;
const F = D.frames, HITS = D.hits;
const FKEYS = Object.keys(F).map(Number).sort((a,b)=>a-b);
// Same appearance thresholds the measurement used, derived from the sample
// interval rather than hardcoded — a page built from a 5/s run must not group
// runs differently from the numbers printed beside it.
const MIN_RUN = Math.max(1, Math.round(__MINRUNSECS__ / D.interval));
const BRIDGE  = Math.max(0, Math.round(__BRIDGESECS__ / D.interval) - 1);
let sponsor = D.primary, cur = 0, playing = false, timer = null;

const shot=document.getElementById('shot'), ov=document.getElementById('ov');
const tcEl=document.getElementById('tc'), head=document.getElementById('head');
const track=document.getElementById('track'), empty=document.getElementById('empty');
const approx=document.getElementById('approx'), tl=document.getElementById('tl');
ov.setAttribute('viewBox', `0 0 ${D.vw} ${D.vh}`);

const fmt = t => { const m=Math.floor(t/60); return `${m}:${(t-m*60).toFixed(1).padStart(4,'0')}`; };
const held = s => s>=60 ? `${Math.floor(s/60)}m ${String(Math.round(s%60)).padStart(2,'0')}s`
                        : `${s.toFixed(1)}s`;
const hitsAt = (i,n) => (HITS[i] && HITS[i][n]) || [];

// A full match embeds a few hundred frames out of ten thousand samples, so the
// viewer snaps to the nearest one it has. Binary search, not a linear scan.
function frameFor(i){
  if (!FKEYS.length) return null;
  let lo=0, hi=FKEYS.length-1;
  while (lo<hi){ const m=(lo+hi)>>1; if (FKEYS[m]<i) lo=m+1; else hi=m; }
  const a=FKEYS[lo], b=FKEYS[Math.max(0,lo-1)];
  return Math.abs(a-i) <= Math.abs(b-i) ? a : b;
}

// Sponsors split by where their artwork came from — the league's own marks,
// which apply at all 72 grounds, and this club's boards, which do not.
(function(){
  const groups = [['League partners','partner'], [(D.club||'Club')+' boards','club']];
  document.getElementById('picker').innerHTML = groups.map(([label,scope]) => {
    const ns = D.sponsors.filter(n => D.scope[n] === scope);
    if (!ns.length) return '';
    return `<div class="pgroup"><span class="plabel">${label}</span>` + ns.map(n =>
      `<button class="tab${D.stats[n]?'':' none'}" type="button" data-s="${n}"
               aria-pressed="${n===sponsor}" title="${D.stats[n]?'':'not detected'}">
         <i style="background:${D.colours[n]}"></i>${n}</button>`).join('') + '</div>';
  }).join('');
})();
document.getElementById('picker').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if (!b) return;
  select(b.dataset.s);
});
function select(n){
  sponsor = n;
  document.querySelectorAll('.tab').forEach(t =>
    t.setAttribute('aria-pressed', String(t.dataset.s === sponsor)));
  renderSponsor(); paintTrack(); buildStops();
  draw(stops.length ? stops[0] : cur);
}

function draw(i){
  cur = Math.max(0, Math.min(D.n-1, i));
  const t = cur * D.interval, fi = frameFor(cur);
  if (fi !== null) shot.src = 'data:image/jpeg;base64,' + F[fi];
  const off = fi === null ? 0 : Math.abs(fi-cur)*D.interval;
  approx.textContent = off > D.interval ? `nearest frame, ${off.toFixed(1)}s away` : '';
  tcEl.textContent = fmt(t);
  head.style.left = (100*cur/(D.n-1)) + '%';
  track.setAttribute('aria-valuenow', t.toFixed(1));
  const col = D.colours[sponsor] || '#fff';
  const hits = hitsAt(cur, sponsor);
  ov.innerHTML = hits.map(h => {
    const pts = h.q.map(p=>p.join(',')).join(' ');
    const x = Math.min(...h.q.map(p=>p[0])), y = Math.min(...h.q.map(p=>p[1]));
    const board = h.b
      ? `<rect class="board" x="${h.b[0]}" y="${h.b[1]}" width="${h.b[2]-h.b[0]}"
              height="${h.b[3]-h.b[1]}" style="stroke:${col}"></rect>` : '';
    return board +
      `<polygon class="quad" points="${pts}" style="stroke:${col}"></polygon>` +
      `<text class="tag" x="${x}" y="${Math.max(16,y-8)}">${sponsor} &middot; clarity ${h.c.toFixed(2)}</text>`;
  }).join('');
  // Solid outline is the logo the matcher locked onto; dashed is the board it
  // grew out to, which is the inventory actually sold.
  empty.textContent = hits.length
    ? `${hits.length} board${hits.length>1?'s':''} detected — solid outline is the logo, dashed is the board`
    : (fi !== null && off > D.interval ? '' : 'no board detected in this frame');
  empty.style.color = hits.length ? col : '#7d8db0';
  paintCount();
}

// Time across, height up the frame, brightness by clarity — so a run reads as a
// band and you can see the board rise and fall as the camera tilts, which a bar
// chart of clarity alone throws away.
function paintTrack(){
  const r = track.getBoundingClientRect(), dpr = devicePixelRatio||1;
  tl.width = Math.max(1,r.width*dpr); tl.height = Math.max(1,r.height*dpr);
  const c = tl.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0);
  c.clearRect(0,0,r.width,r.height);
  const w = r.width/D.n, col = D.colours[sponsor]||'#fff';
  const rgb = [1,3,5].map(k => parseInt(col.substr(k,2),16));
  const PAD = 10, plot = r.height - PAD*2 - 12;

  c.strokeStyle = '#16223c'; c.lineWidth = 1;
  [0,.25,.5,.75,1].forEach(f => {
    const y = PAD + f*plot;
    c.beginPath(); c.moveTo(0, y+.5); c.lineTo(r.width, y+.5); c.stroke();
  });

  // Minute marks, so a two-hour timeline can be read against a match clock.
  c.strokeStyle = '#1d2c4c';
  c.font = '9.5px "IBM Plex Mono", monospace'; c.fillStyle = '#54658a';
  const stepMin = D.duration > 3600 ? 15 : (D.duration > 900 ? 5 : 1);
  for (let m = stepMin; m*60 < D.duration; m += stepMin){
    const x = (m*60/D.duration)*r.width;
    c.beginPath(); c.moveTo(x+.5, PAD); c.lineTo(x+.5, PAD+plot); c.stroke();
    c.fillText(m+"'", x+3, r.height-3);
  }

  for (const k in HITS){
    const hits = HITS[k][sponsor]; if (!hits) continue;
    const x = (+k)*w;
    hits.forEach(h => {
      const cy = h.q.reduce((a,p)=>a+p[1],0)/4;
      const y = PAD + (cy/D.vh)*plot;
      const hh = Math.max(3, Math.min(11, 3 + h.a*9));
      c.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.30+0.70*h.c})`;
      c.fillRect(x, y-hh/2, Math.max(w,1.6), hh);
    });
  }

  c.fillStyle = '#54658a';
  c.fillText('top of frame', 6, PAD+9);
  c.fillText('bottom', 6, PAD+plot-2);
}

function seek(ev){
  const r = track.getBoundingClientRect();
  const x = (ev.touches?ev.touches[0].clientX:ev.clientX) - r.left;
  draw(Math.round((x/r.width)*(D.n-1)));
}
track.addEventListener('pointerdown', e => { track.setPointerCapture(e.pointerId); seek(e); });
track.addEventListener('pointermove', e => { if (e.buttons) seek(e); });
track.addEventListener('keydown', e => {
  const jump = e.shiftKey ? 0 : 1;    // shift = appearance to appearance
  if (e.key==='ArrowRight'){ jump ? draw(cur+1) : step(1); e.preventDefault(); }
  if (e.key==='ArrowLeft'){ jump ? draw(cur-1) : step(-1); e.preventDefault(); }
});

// Not a video player, and pretending otherwise was the bug. Only a few hundred
// frames of ten thousand samples are embedded, so stepping sample-by-sample
// changes the picture roughly every forty-fifth press and reads as frozen.
// What anyone actually wants is "show me the next bit where the board is", so
// the transport walks this sponsor's appearances instead of the clock.
let stops = [];        // one sample index per appearance — its clearest moment

function buildStops(){
  stops = runsFor(sponsor).sort((a,b) => a.first - b.first).map(r => {
    let best = r.first, bestC = -1;
    for (let i = r.first; i <= r.last; i++){
      (hitsAt(i, sponsor) || []).forEach(h => { if (h.c > bestC){ bestC = h.c; best = i; } });
    }
    return best;      // the clearest frame in the run, not its first
  });
  const has = stops.length > 1;
  document.getElementById('prev').disabled = !has;
  document.getElementById('next').disabled = !has;
  if (!stops.length) playing = false;
  paintCount();
}

function nearestStop(){
  let k = -1;
  for (let i = 0; i < stops.length; i++) if (stops[i] <= cur) k = i;
  return k;
}
function paintCount(){
  const el = document.getElementById('apcount');
  if (!stops.length){ el.textContent = ''; return; }
  const k = stops.indexOf(cur);
  el.textContent = k >= 0 ? `appearance ${k+1} of ${stops.length}`
                          : `${stops.length} appearances`;
}
function step(dir){
  if (!stops.length) return;
  const k = nearestStop();
  let n = dir > 0 ? k + 1 : (cur > stops[Math.max(0,k)] ? k : k - 1);
  if (n < 0) n = stops.length - 1;
  if (n >= stops.length) n = 0;
  draw(stops[n]);
}
document.getElementById('prev').addEventListener('click', () => step(-1));
document.getElementById('next').addEventListener('click', () => step(1));

const playBtn = document.getElementById('play');
playBtn.addEventListener('click', () => {
  if (!stops.length) return;
  playing = !playing;
  playBtn.textContent = playing ? 'Pause' : 'Play';
  if (playing) timer = setInterval(() => step(1), 1600);
  else clearInterval(timer);
});

function runsFor(n){
  const keys = Object.keys(HITS).map(Number).filter(i => HITS[i][n]).sort((a,b)=>a-b);
  const out = []; let run = null;
  keys.forEach(i => {
    const cl = HITS[i][n].map(h=>h.c);
    if (run && i - run.last <= BRIDGE + 1){ run.last = i; run.cl.push(...cl); }
    else { if (run) out.push(run); run = {first:i, last:i, cl}; }
  });
  if (run) out.push(run);
  return out.filter(r => (r.last - r.first + 1) >= MIN_RUN);
}

// The whole league table, so one sponsor's number has something to sit against.
(function(){
  const rows = D.sponsors.slice().sort((a,b) =>
    (D.stats[b]?D.stats[b].index:-1) - (D.stats[a]?D.stats[a].index:-1));
  document.getElementById('league').innerHTML = rows.map(n => {
    const s = D.stats[n], col = D.colours[n];
    const tag = D.scope[n]==='club' ? `<span class="scopetag">${D.club}</span>` : '';
    if (!s) return `<tr data-s="${n}"><td><span class="swatch" style="background:${col};opacity:.4"></span>` +
      `<span style="opacity:.55">${n}</span>${tag}</td>` +
      `<td class="r mono" colspan="6" style="opacity:.55">not detected</td></tr>`;
    return `<tr data-s="${n}"><td><span class="swatch" style="background:${col}"></span>${n}${tag}</td>` +
      `<td class="r mono">${held(s.seconds)}</td><td class="r mono">${s.pct}%</td>` +
      `<td class="r mono">${s.index.toFixed(1)}</td><td class="r mono">${s.clarity.toFixed(2)}</td>` +
      `<td class="r mono">${s.area.toFixed(2)}%</td>` +
      `<td class="r mono">${s.blockedPct == null ? '—' : s.blockedPct + '%'}</td></tr>`;
  }).join('');
  document.getElementById('league').onclick = e => {
    const tr = e.target.closest('tr'); if (tr) select(tr.dataset.s);
  };
})();

function renderSponsor(){
  const st = D.stats[sponsor], col = D.colours[sponsor]||'#9e0000';
  document.getElementById('sponhead').textContent = sponsor + ' — time on screen';
  document.getElementById('apphead').textContent = sponsor + ' — appearances';
  const ids = ['idx','cl','ar','lg','mb','rn'];
  if (!st){
    document.getElementById('secs').innerHTML = '&mdash;';
    document.getElementById('of').textContent =
      'Not detected in this match — which is not the same as absent, and needs a hand-count before anyone says either.';
    ids.forEach(k => document.getElementById(k).innerHTML='&mdash;');
    document.getElementById('runs').innerHTML = '';
    document.getElementById('runsnote').textContent = '';
    return;
  }
  document.getElementById('secs').innerHTML = held(st.seconds).replace(/([a-z])/g,'<span>$1</span>');
  document.getElementById('of').textContent =
    `${st.pct}% of the match, across ${st.runs} separate appearances`;
  document.getElementById('idx').textContent = st.index.toFixed(1);
  document.getElementById('cl').textContent = st.clarity.toFixed(2);
  document.getElementById('ar').textContent = st.area.toFixed(2) + '%';
  document.getElementById('lg').textContent = held(st.longest);
  document.getElementById('mb').textContent = st.most;
  document.getElementById('rn').textContent = st.runs;

  // A full match produces hundreds of appearances. Longest first, capped, and
  // say what was cut rather than silently showing a slice.
  const all = runsFor(sponsor).sort((a,b) => (b.last-b.first) - (a.last-a.first));
  const CAP = 80, shown = all.slice(0, CAP);
  document.getElementById('runs').innerHTML = shown.map(r => {
    const a = r.first*D.interval, b = (r.last+1)*D.interval;
    const cl = r.cl.reduce((x,y)=>x+y,0)/r.cl.length;
    return `<tr data-i="${r.first}"><td class="mono">${fmt(a)}</td><td class="mono">${fmt(b)}</td>` +
      `<td class="r mono">${(b-a).toFixed(1)}s</td>` +
      `<td><span class="bar" style="width:${Math.round(cl*100)}%;background:${col}"></span></td></tr>`;
  }).join('');
  document.getElementById('runsnote').textContent = all.length > CAP
    ? `Longest ${CAP} of ${all.length} appearances. Click a row to jump the viewer there.`
    : 'Click a row to jump the viewer there.';

  const G = [24,42], acc = Array.from({length:G[0]}, () => new Array(G[1]).fill(0));
  let max = 0;
  for (const k in HITS) (HITS[k][sponsor]||[]).forEach(h => {
    const cx = h.q.reduce((a,p)=>a+p[0],0)/4, cy = h.q.reduce((a,p)=>a+p[1],0)/4;
    const r = Math.min(G[0]-1, Math.max(0, Math.floor(cy/D.vh*G[0])));
    const c = Math.min(G[1]-1, Math.max(0, Math.floor(cx/D.vw*G[1])));
    acc[r][c] += h.c; max = Math.max(max, acc[r][c]);
  });
  let best = null, bestCl = -1;
  for (const k in HITS) (HITS[k][sponsor]||[]).forEach(h => {
    if (h.c > bestCl && F[k] !== undefined){ bestCl = h.c; best = k; }
  });
  if (best === null){
    const any = Object.keys(HITS).find(k => HITS[k][sponsor] && F[frameFor(+k)] !== undefined);
    if (any !== undefined) best = frameFor(+any);
  }
  if (best !== null && F[best] !== undefined)
    document.getElementById('heatbg').src = 'data:image/jpeg;base64,' + F[best];

  const cv = document.getElementById('hm');
  requestAnimationFrame(() => {
    const r = cv.getBoundingClientRect(), dpr = devicePixelRatio||1;
    cv.width = Math.max(1,r.width*dpr); cv.height = Math.max(1,r.height*dpr);
    const c = cv.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0);
    c.clearRect(0,0,r.width,r.height);
    const cw = r.width/G[1], ch = r.height/G[0];
    const rgb = [1,3,5].map(k => parseInt(col.substr(k,2),16));
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
renderSponsor(); paintTrack(); buildStops(); draw(stops.length ? stops[0] : 0);
</script>
"""
