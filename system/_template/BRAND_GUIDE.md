# NL Tools — Brand canon

**`/tools/system/nl-brand.css` is the source of truth for all tool styling.**
This doc tells you the rules. `/tools/style-guide/index.html` renders every
component live so you can see what good looks like and copy it.

If you are an AI agent scaffolding a new tool: **read this file before
writing any CSS in the tool's `<style>` block.** Skim is fine — the rules
are short.

---

## The five rules

### 1. Use the utility classes for components

Don't roll your own. If a class exists in `nl-brand.css` for what you need,
use it. Open `/tools/style-guide/` if you can't remember the markup.

| You need | Use this | Not this |
|---|---|---|
| A button | `<button class="btn btn--primary">` | `<button style="background:var(--primary);color:#fff;padding:10px 16px;...">` |
| A status badge | `<span class="pill pill--live">Live</span>` | Custom `<span>` with rounded background |
| A table | `<div class="table-wrap"><table class="table">…` | Custom `<table>` styles |
| A page heading | `<h2 class="text-heading">` | `<h2 style="font-size:22px;font-weight:900;color:var(--navy);">` |
| An empty state | `<div class="empty-state">…` | Custom centred box |
| A modal | `<div class="modal">…` | Custom overlay |
| A toast | `NL.toast('msg', 'success')` | Custom floating div |
| Form fields | `<div class="form-panel">…` | Custom form layout |

The full inventory is in `nl-brand.css`. The live preview is in the style
guide. Both are linked from every tool's `<head>`.

### 2. Use the size tokens, not hardcoded pixels

The type ramp is responsive (`clamp()`-based) and lives in `:root`. Hardcoded
pixel values bypass it.

```css
/* GOOD */
.my-thing { font-size: var(--text-sm); }

/* BAD */
.my-thing { font-size: 13px; }
```

| Token | Use for |
|---|---|
| `--text-xs` | Kickers, char counts, fine print |
| `--text-sm` | Secondary text, hints, table cells, labels |
| `--text-base` | Standard UI text, body alt |
| `--text-md` | Subheadings, card titles |
| `--text-lg` | Section headings, page titles |
| `--text-xl` | Display headings, stat numbers |

Same rule for spacing/radii: `--radius`, `--radius-sm`, `--radius-lg`,
`--radius-pill`, `--shadow`, `--focus-ring`. Use them.

### 3. Use the colour tokens, not hex values

```css
/* GOOD */
.my-thing { color: var(--text); background: var(--off-white); }

/* BAD */
.my-thing { color: #1a2a44; background: #f4f6f9; }
```

`--primary` is NL red and is for accents/CTAs only. `--red` is a different
shade reserved for error/danger states. Don't mix them up.

### 4. Use the typography classes for prose

If you're applying multiple typographic properties (size + weight + colour +
line-height), there's almost certainly a class for it.

| Class | When |
|---|---|
| `.text-display` | Page hero, big stat numbers |
| `.text-heading` | Section headings |
| `.text-subhead` | Card titles, subheads |
| `.text-body` | Body copy |
| `.text-secondary` | Hints, descriptions, timestamps |
| `.text-label` | Kickers, fine print, all-caps labels |

### 5. Letter-spacing comes from `--tracking-*`

```css
/* GOOD */
.my-label { letter-spacing: var(--tracking-wide); }

/* BAD */
.my-label { letter-spacing: 0.08em; }
```

Three tokens: `--tracking-tight` (0.04em), `--tracking-wide` (0.08em),
`--tracking-wider` (0.12em).

---

## When custom CSS is OK

Only when no utility class exists AND the component is unique to your tool.
Even then:

- Scope every selector under your tool's root id (`#my-tool .my-class`) so it
  can't leak.
- Use tokens for every value that has one.
- If you find yourself writing the same custom CSS in two tools, that's a
  signal to promote it into `nl-brand.css` and add a section to the style
  guide.

## Verifying before merge

1. View your tool side-by-side with `/tools/style-guide/`. Buttons,
   pills, tables, headings should look like cousins of the ones in the guide,
   not strangers.
2. Grep your tool's `<style>` block for `font-size:\s*\d+px` and
   `letter-spacing:\s*0\.\d+em` and `color:\s*#`. Each hit is a potential
   token swap.
3. Open the tool at 320px wide. If something breaks, you probably hardcoded
   a pixel value where a `clamp()` token would have flexed.

---

## Quick reference card

```
COLOURS         --primary --navy --text --text-muted --off-white --border
                --red --green --amber --info --blue --purple
                (each colour also has a --*-light and --*-deep sibling
                 where useful — see token reference in style guide)

TYPOGRAPHY      --text-xs --text-sm --text-base --text-md --text-lg --text-xl
                --tracking-tight --tracking-wide --tracking-wider
                --font (always carbona-variable, never system fonts)

SURFACES        --radius (6px) --radius-sm (4px) --radius-lg (10px) --radius-pill
                --shadow --focus-ring

COMPONENTS      .btn (--primary|--navy|--ghost|--danger|--restore|--sm)
                .pill (--live|--approved|--rejected|--soon|--pending|--info|--expired)
                .pill (.role-superadmin|admin|staff|club|pending)
                .table .table-wrap
                .form-panel .form-grid .form-group .form-hint
                .modal .modal--wide .modal__head .modal__body .modal__footer
                .toolbar .toolbar__left .toolbar__right .toolbar__search .toolbar__filter
                .page-header .page-header__title .page-header__sub .page-header__actions
                .stats .stat .stat__num .stat__label
                .tabs .tab
                .empty-state .empty-state__icon .empty-state__title .empty-state__text
                .admin-banner .toast .spinner .indicator--live
                .text-display .text-heading .text-subhead .text-body .text-secondary .text-label
                .icon (--sm|--md|--lg)
                .topbar (rendered by nl-topbar.js — don't reimplement)
```
