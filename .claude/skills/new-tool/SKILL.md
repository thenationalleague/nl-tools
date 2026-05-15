---
name: new-tool
description: Scaffold a new NL Tool from the canonical template at system/_template/. Use when the user types /new-tool <slug>, asks to "create a new tool", "scaffold a tool", or "start a tool called X". Copies the template, does the find-replaces, and reminds the user about portal + RTDB tool entry + rules wiring.
allowed-tools: Bash, Read, Edit, Write
---

# new-tool — scaffold a new NL Tool

You are bootstrapping a new tool in the NL Tools monorepo using the
canonical template at `system/_template/index.html`.

## Before you write any code

**Read `system/_template/BRAND_GUIDE.md`** — the brand canon. It tells
you which utility classes (`.btn`, `.pill`, `.table`, `.modal`, `.stats`,
`.tabs`, `.form-panel`, `.empty-state`, `.text-display` / `.text-heading`
etc.) and which CSS tokens (`--text-sm`, `--primary`, `--tracking-wide`
etc.) to use instead of writing your own. `nl-brand.css` is the source
of truth for all tool styling. Live preview of every component is at
`/tools/style-guide/index.html`.

This is non-negotiable: if you scaffold a tool and then freestyle CSS
with hardcoded font sizes, hex colours, or custom button shapes, the
tool will drift from the family and the user will reject it. Use the
classes. Use the tokens.

## Steps

1. **Confirm inputs.** You need four values. If the user gave fewer than
   all four (e.g. just `/new-tool foo`), use `AskUserQuestion` to
   collect the missing ones in one round:

   - `slug` — URL path + directory name. Lowercase, kebab-case. e.g.
     `dazn-vip`.
   - `title` — Human-readable. e.g. `DAZN VIP`.
   - `key category` — One of `staff`, `ops`, `media`. The toolKey
     becomes `<category>-<slug>` (e.g. `media-dazn-vip`).
   - `description` — One-line summary shown in the header. Keep tight.

2. **Refuse if the slug directory already exists.** Use `Read` or
   `Bash ls` to check `<slug>/`. If it exists, stop and tell the user.
   Don't overwrite.

3. **Copy the template.** Use `Bash cp -r system/_template <slug>` and
   then remove `<slug>/README.md` and `<slug>/.lint-skip` (they're for
   the template itself, not per-tool).

4. **Find-replace placeholders** in `<slug>/index.html` using `Edit`
   with `replace_all: true`:

   | Placeholder           | Value                                        |
   |-----------------------|----------------------------------------------|
   | `{{TOOL_TITLE}}`      | the title                                    |
   | `{{TOOL_SLUG}}`       | the slug                                     |
   | `{{TOOL_KEY}}`        | `<category>-<slug>`                          |
   | `{{TOOL_DESCRIPTION}}`| the description                              |
   | `{{TOOL_DATE}}`       | today's date in `DD/MM/YYYY` form            |

5. **Verify with the lint.** Run `bash system/lint-tools.sh` and confirm
   the new slug doesn't appear in any drift line.

6. **Tell the user what's NOT done.** Don't try to do these yourself
   unless the user explicitly asks — they need product decisions:

   - **RTDB tool entry** — they'll need to write `tools/<category>-<slug>`
     in the nl-tools RTDB (label, icon, department, url, defaults).
     Auth-guard reads defaults from there; there is **no hardcoded
     registry** in `auth-guard.js`. Without this entry the page denies
     for everyone except superadmins. Show them the JSON shape from
     `system/_template/README.md` step 4.
   - **RTDB rules** — if the tool reads/writes RTDB, they need to
     extend the rules to cover `app-data/<category>-<slug>/...`.
   - **Portal admin "Deploy"** — once the tool entry is saved, the
     superadmin hits Deploy in the portal admin UI to seed defaults
     onto every existing user.

7. **Don't commit unless asked.** Stop after the scaffold lands locally.

## Output

When done, give a short three-line summary:
- "Scaffolded `<slug>/` from template."
- The toolKey value.
- "Next: portal card, auth-guard registry entry, RTDB rules (if needed)."

## Don't

- Don't bump cache-bust versions in the new tool's `index.html` — the
  template carries the canonical ones.
- Don't invent a category — must be one of `staff`, `ops`, `media`.
- Don't add tool-specific business logic. That's a follow-up the user
  drives.
