---
name: new-tool
description: Scaffold a new NL Tool from the canonical template at system/_template/. Use when the user types /new-tool <slug>, asks to "create a new tool", "scaffold a tool", or "start a tool called X". Copies the template, does the find-replaces, and reminds the user about portal + auth-guard registry + RTDB rules wiring.
allowed-tools: Bash, Read, Edit, Write
---

# new-tool — scaffold a new NL Tool

You are bootstrapping a new tool in the NL Tools monorepo using the
canonical template at `system/_template/index.html`.

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

   - **portal registration** — they'll need to add a card to
     `portal/index.html` so the tool is discoverable.
   - **auth-guard registry** — they'll need to add `<category>-<slug>`
     to the access registry in `system/auth-guard.js` so the role(s)
     who should access it are allowed in. Without this, the page
     denies for everyone.
   - **RTDB rules** — if the tool reads/writes RTDB, they need to
     extend the rules to cover `app-data/<category>-<slug>/...`.

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
