# Handbook editor — making it usable

**Status: §3.1–3.4 BUILT 21/08/2026 (handbook v0.40). §3.5 parked.**

Drafted and built 21/08/2026, after Richard: *"the editor is a mess. it is way
too tricky. this is unusable really."*

He is right, and it is measurable rather than a matter of taste.

---

## 1. The diagnosis, in numbers

Counted from the committed seed (`handbook/seed-*.json`), which is what the
live draft was built from:

| Area | Nodes | With a heading |
|---|---:|---:|
| League Rules | 560 | 50 (8%) |
| Appendices | 399 | 47 (11%) |
| Articles | 188 | 31 (16%) |
| Memorandum | 40 | 1 (2%) |
| Board Directives | 16 | 0 |
| **Total** | **1,203** | **129 (10%)** |

In edit mode, `renderNode()` emits for **every one** of those nodes:

- a **"Heading (optional)"** placeholder row — even though 90% of clauses do
  not have a heading and never will
- an **11-control toolbar**: `+ clause`, `+ sub`, `+ table`, `← outdent`,
  `indent →`, `↑`, `↓`, a numbering `<select>`, `¹₂ fix…`, `✕`, plus a
  separator

**League Rules alone therefore renders 6,160 controls and ~510 empty heading
placeholders.** The screenshot is not a rendering fault; it is the design
working as written. Two of every three rows on screen are furniture.

The controls also outnumber the content *per clause*. "Agent" shall be as
defined in the Rules of The FA. — nine words, one line, sitting between an
empty heading placeholder and eleven buttons.

---

## 2. The constraint that shapes the fix

`render()` (handbook/index.html) does `host.innerHTML = html` — it rebuilds
the whole area. The document is `contenteditable`, so **any re-render destroys
the caret and the selection**.

That rules out the obvious fix. "Only draw the toolbar on the selected clause"
cannot be implemented by setting `S.selectedId` on `focusin` and calling
`render()`: the click that selects a clause would throw away the cursor the
user just placed. Selection is already tracked (`S.selectedId`, set on
`focusin` at line ~1706) and already used for a highlight class — it just
cannot drive a re-render.

So the toolbar has to stop being part of the rendered document.

---

## 3. The plan, in priority order

### 3.1 One floating toolbar, not 1,203 inline ones — **the whole fix**

Delete `toolbar(node)` from `renderNode()`. Render **one** toolbar element,
once, outside `#ceDoc`. On `focusin`, position it against the focused clause
(absolute, pinned to that clause's top-right, or a fixed bar at the foot on
narrow screens) and point its buttons at `S.selectedId`.

Why this and not a re-render: it touches one element's `style.transform` and
never rebuilds the document, so the caret is untouched. It also removes ~6,000
DOM nodes from the biggest area, which is a real load-time and typing-latency
win on a 560-clause document, not only a visual one.

The document then renders as **the document** — numbers, headings, text.
Which is what someone proof-reading league rules actually needs to see.

*Effort: a day. Risk: the positioning maths on scroll and on nested clauses.*

### 3.2 Stop drawing empty heading placeholders

`renderNode()` currently emits the heading field when `node.title || editing`.
Change to: emit it when the node **has** a title, or when the node is the
selected one and the toolbar offers an "add heading" action.

That removes ~1,080 placeholder rows across the handbook and roughly halves
what is on screen, on its own, independent of 3.1.

*Effort: an hour. Risk: low — it is a render condition.*

### 3.3 Move the four arrows to the keyboard

`← outdent`, `indent →`, `↑`, `↓` are four of the eleven controls and they
have universal bindings in every outliner ever written:

- **Tab** / **Shift-Tab** — indent, outdent
- **Alt+↑** / **Alt+↓** — move up, move down

Bind those, and keep the buttons only in the floating toolbar for people who
do not know them. Four controls out of the per-clause surface at zero cost in
capability.

*Effort: half a day. Risk: Tab currently moves between contenteditable
fields — that behaviour has to be deliberately replaced, not just overridden,
or tabbing out of the document breaks.*

### 3.4 Name the controls in English

`¹₂ fix…` is unreadable and unguessable. It pins an exact number
(e.g. `13.B.4`). Call it **Number…**.

While there: `+ clause` / `+ sub` are good; `← outdent` / `indent →` become
icons once they are keyboard-first.

*Effort: minutes.*

### 3.5 Numbering style is at the wrong altitude — park, do not rush

Every clause carries its own `numStyle` dropdown. In a legal document,
numbering style is a property of a **level** — all depth-2 clauses are `(a)`,
all depth-3 are `(i)` — not of an individual clause. Per-clause control is why
the dropdown has to be on every row.

The right fix is a per-level default with a per-clause override for the rare
exception. That is a data-model change and a migration, so it is **not** part
of this pass. Recorded so the next person does not re-derive it.

---

## 4. What NOT to do

- **Do not add a WYSIWYG library.** The numbering is computed
  (`computeNumbers`), the structure is a tree in RTDB, and the reader and the
  PDF both re-render from that tree. A third-party editor would own the
  document and break all three.
- **Do not make the toolbar hover-only.** It has to work on a touch screen,
  and Richard reviews on a phone.
- **Do not re-render on selection.** See §2. This is the trap.

---

## 4a. What shipped (handbook v0.40, 21/08/2026)

§3.1, §3.2, §3.3 and §3.4 all landed together rather than in the staged order
below — the toolbar rewrite touched the same code as the renames and the
keyboard bindings, so splitting them would have meant editing the same twenty
lines three times.

Two things the plan did not anticipate, both found while building:

**A bar press blurs the clause you are typing in, and that blur is what saves
it.** The save is async, so an op firing immediately would clone a stale
`S.nodes` and commit the typing away again. Preventing the blur is not the fix
— then the typing is never saved at all. The blur has to happen and the op has
to wait, so the pending save is held on `S.pendingSave` and every bar action
awaits it.

**Clicking a clause has to select it even where nothing focusable is under the
pointer** — the number, the padding, a table cell. `focusin` alone follows the
caret, and a table has no caret of its own, so the bar would go stale on
exactly the content most likely to need reordering.

§3.5 (per-level numbering) remains parked and remains the right diagnosis.

## 5. The order this was planned in (kept for the record)

1. **3.2** — an hour, halves the noise, zero risk.
2. **3.1** — the real fix.
3. **3.4** with 3.1, since the toolbar was being rewritten anyway.
4. **3.3** after, once the floating toolbar was proven.
5. **3.5** never, until someone asks.

In the event 1–4 shipped together; see §4a. Only 5 is still open, and it is
still a no.

---

## 6. A separate matter: Appendices P, Q and R

Raised alongside the editor — *"Appendix Q is cut short, and R is missing"* —
but a different problem with a different fix, so it is written down here
rather than folded in.

**In the committed seed, P, Q and R have their headings and nothing else:**

| Appendix | Nodes | Characters |
|---|---:|---:|
| P — League Cup Competition Rules | 1 | 43 |
| Q — The Licensing System | 1 | 391 |
| R — Acquisition Materials | 1 | 34 |

Every other appendix carries its clause tree. These three carry a title and,
for Q, a fragment.

So **nothing was dropped after import — these three never came across.** That
changes the fix: it is a re-import of three appendices from the source
document, not a recovery of lost edits. `handbook/docx-import.js` is the path.

Two things to check before starting:

1. **Confirm against the live draft**, not the seed. The seed is what the
   draft was built from in the repo; Richard has been editing since, so live
   may differ. A session cannot read RTDB — this needs eyes on the console or
   the editor.
2. **P is in the same state and was not mentioned.** Worth confirming whether
   it is genuinely empty too, or whether it was filled in live.

Also absent from the seed: **G, J, L and O**. The handbook may legitimately
skip those letters — worth one look at the source rather than an assumption
in either direction.
