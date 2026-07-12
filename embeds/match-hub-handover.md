# NL Match Hub — Handover Notes

**A supporter-facing matchday "replay" embed.** One self-contained HTML file that
replays a single finished National League matchday through three switchable views —
**Map**, **Cards**, **Ticker** — sharing one timeline and a radio-style commentary track.

- **File:** `embeds/match-hub.html` (this is the whole deliverable — no build step)
- **Live URL:** `https://thenationalleague.github.io/tools/embeds/match-hub.html`
- **Current version:** v0.14.0 / build **v20** (badge shown bottom-right of the hub)
- **Family:** fan-facing embed, same delivery model as `score-predictor.html` /
  `embeds/widget-handover.md`. It is **not** a gated staff tool — it does not use
  `auth-guard.js` and is out of scope for `lint-tools.sh`.

Read this doc alongside the file. This explains the *why* and the *swap points*;
the code is the *what*.

---

## 1. What it does (for a non-technical reader)

Press play and the matchday runs on a clock you can scrub and speed up. As each
real event lands (kick-off, goal, red card, half-time, full-time) the hub reacts:

- **Map view** — every fixture is a pin on an England + Wales map. Scores tick
  over as goals go in; a goal triggers a full-screen "sting" (tease → reveal) and
  a cinematic zoom to that ground.
- **Cards view** — a grid of live scorecards with scorers and minutes.
- **Ticker view** — a vidiprinter feed, newest on top: GOAL / RED / KO / HT / FT,
  each tagged with the scoring team and the running score.
- **Commentary bar** — a running radio-style caption: goal teases and reveals,
  storylines (table swings, comebacks, braces/hat-tricks, six-pointers), and
  kick-off previews (form, nicknames, head-to-head history).

**Desktop (≥1024px):** the map fills a tall left column while commentary and the
(always-on) ticker stack down the right; controls and footer span the bottom.
**Mobile:** a full-page app with the three views as tabs.

It is a **replay of a finished match**, on purpose. See §5 for the live path.

---

## 2. Delivery model (how it goes on the website)

Identical to the other fan embeds:

- One HTML file, copy-pasted into the CMS "custom HTML" block (Urban Zoo) on
  `thenationalleague.org.uk`. **The repo file is the source of truth; the CMS copy
  is a snapshot — re-paste on every change.**
- **The CMS strips external `<script src="…">`.** This file is fully self-contained
  (inline CSS + inline JS + `@font-face`), so there's nothing external to strip —
  it can be pasted as-is.
- It only *borrows* the NL brand: the **Carbona** font (inline `@font-face`) and a
  handful of brand colour tokens declared inline. It does **not** load
  `nl-brand.css` or any `system/` file.

---

## 3. File anatomy

```
embeds/match-hub.html
├── header comment  ─ what it is + full CHANGELOG (v0.1.0 … v0.14.0)
├── <div id="nlHub" data-view="map">  ─ the app
│   ├── .nlh__topbar     wordmark + round + Map/Cards/Ticker tab switcher
│   ├── .nlh__stage      MAP + CARDS views (tabbed on mobile, left column on desktop)
│   ├── .nlh__tickerwrap TICKER feed (a tab on mobile, the right column on desktop)
│   ├── .nlh__comm       commentary bar
│   ├── .nlh__controls   play / scrub / clock / restart / speed
│   ├── .nlh__foot       "Final table" link + version badge
│   └── .nlh__sheet      full-time league-table overlay
├── <script> __DATA__    ← THE ONLY BLOCK YOU EDIT TO CHANGE THE MATCHDAY (§4)
├── <style>              inline CSS (brand tokens, layout, animations, desktop grid)
└── <script>             the engine (timeline, painters, commentary) — rarely touched
```

- **Versioning:** bump `var BUILD = "20"` (near the top of the engine script) and
  add a `CHANGELOG` entry in the header comment on every change. The badge reads
  `?v=` from the URL if present, else `BUILD`.
- `#nlHub[data-view]` (`map` | `cards` | `ticker`) drives mobile tabbing.

---

## 4. The data contract — `window.__DATA__` (the swap point)

Everything the hub shows comes from one object between the
`/* BEGIN __DATA__ */` … `/* END __DATA__ */` markers. This block is designed to be
machine-replaceable (a GitHub Action or a live feed can regenerate just this block).
**To wire a different matchday, you replace only this object.**

```js
window.__DATA__ = {
  round: 39,
  season: "2025-26",
  competition: "National League",

  // England + Wales coastline — array of [lng, lat]. Leave as-is; it's fixed geography.
  gb: [ [-2.669,51.622], … 138 points … ],

  // Club identity, keyed by Opta id. One entry per club appearing this round.
  clubs: {
    t300: {
      name:"Woking", short:"Woking", nick:"The Cards",
      lat:51.3063, lng:-0.5589,          // pin position (club's ground)
      venue:"Kingfield",                 // used in commentary ("over to Kingfield")
      col:{ p:"#B50F1C", s:"#FFFFFF", t:"#FFFFFF" }, // primary / secondary / text
      pos:11,                            // league position going into the round
      winless:0, unbeaten:4, wins:2, losses:0        // form-streak flags for previews
    },
    …
  },

  // League table AFTER the previous round — drives the FT table overlay re-sort.
  prior: {
    t300: { P:38, W:13, D:12, L:13, GF:54, GA:45, Pts:51 },
    …
  },

  // The fixtures, each with its real event list.
  fixtures: [
    {
      gc:"g2578814",          // unique game id (any stable string)
      home:"t300", away:"t434",
      hs:3, as:2,             // final score (sanity/reconcile only; live score is derived from events)
      date:"2026-03-21T12:30:00Z",
      slot:"12:30",          // kick-off label shown pre-match
      pp:false,              // postponed?
      h2h:{ p:32, hw:8, aw:18, d:6, f:2003, l:2025, lr:"H" }, // head-to-head, NL-only (see below)
      events:[
        { min:12, type:"goal", team:"t300", name:"J. Gbode", strk:2 },
        { min:30, type:"goal", team:"t434", name:"B. Peart" },
        { min:61, type:"red",  team:"t444", name:"F. Maguire", sec:true },
        …
      ]
    },
    …
  ]
};
```

**Field notes**

- `clubs[key].col` = `{p,s,t}` → primary / secondary / text colours. Used for pin
  boards, goal stings and ticker crests.
- `winless / unbeaten / wins / losses` = current streak lengths; the kick-off
  preview turns these into phrases ("chasing a fourth straight win").
- **`events`** is the heart of it. Each event: `min` (match minute; use `>90` /
  `>45` for stoppage — the hub renders `90+n`), `type` (`goal` | `red`), `team`
  (the Opta key of the team it's *for*), `name` (scorer / player). Optional:
  - `strk` — the scorer's running tally *in this match* (2 = brace, 3 = hat-trick),
    used by commentary.
  - `sec` — red card was a second yellow.
  - `og` — own goal (renders "(OG)"). *Not currently populated by the source feed.*
  The engine derives the running score, per-match full-time (stoppage-aware),
  half-time break and the master clock entirely from `events` + `slot`.
- **`h2h`** = head-to-head history: `p` played, `hw` home-entity wins, `aw`
  away-entity wins, `d` draws, `f` first meeting (year), `l` last meeting (year),
  `lr` last result (`H`/`A`/`D`). **This is National-League-only** (from
  `results.json`, matched on club *entity*, not name), which is why every H2H line
  in commentary carries a scope caveat ("…in the National League").

---

## 5. "Live later" — it's a data swap, not a rewrite

This was the founding scope decision: the timeline engine does not care whether the
match is finished or in progress. Going live needs **two** changes, both isolated:

1. **Feed the data.** Regenerate the `__DATA__` block from a live source instead of
   hardcoding it — same shape, `events` growing as the match plays. (A GitHub Action
   or a small fetch shim can own the `BEGIN/END __DATA__` block.)
2. **Follow real time.** Add a "live mode" that drives the clock from wall-time /
   feed timestamps instead of the manual scrubber (the playhead follows "now").

Neither touches the views, the commentary engine, the map or the ticker. Until
then it runs as a replay you scrub by hand.

---

## 6. Known limitations / honest caveats

- **Replay only** — no live feed wired yet (§5).
- **Scorer names are initials + surname** ("J. Gbode"). Full first names need a
  richer source feed; the hub will render whatever `name` string it's given.
- **Own goals aren't flagged** in the current data (all `og:false`). If the source
  starts marking them, set `og:true` on the event and it renders "(OG)".
- **H2H is NL-only.** Clubs with EFL history (e.g. Carlisle, York) have far more
  meetings than the record shows — hence the mandatory caveat wording.
- Fixed to the Round 39 matchday until `__DATA__` is swapped.

---

## 7. Where the code lives if you need to change behaviour

| You want to change…                        | Look at…                                                    |
|--------------------------------------------|-------------------------------------------------------------|
| the matchday / scores / scorers            | `__DATA__` block only (§4)                                  |
| commentary wording / storylines            | the `C_*` phrase pools + `storylineSegs` / `kickoffSegs`    |
| desktop layout                             | the `@media (min-width:1024px)` grid in `<style>`           |
| pin placement / de-overlap                 | `layoutPins()`                                              |
| goal sting / zoom timing                   | `stingTease` / `revealGoal` / `zoomTo` + the `tick()` loop  |
| tab / view switching                       | `setView()` + `#nlHub[data-view]` CSS                       |
| brand colours / font                       | inline tokens + the Carbona `@font-face` at top of `<style>`|

Verify UI changes by opening the file in a browser (no build). Draft PR for the
latest work: **PR #363** on `thenationalleague/tools`.
