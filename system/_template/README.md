# NL Tool template

Canonical wireframe for any new NL Tool. Has the locked head order,
Firebase init, `window.NL_TOOL` / `NL_TOOL_KEY`, brand CSS, auth-guard
reveal, topbar, and a minimal app skeleton. Copy this directory to start
a new tool — don't piece one together from scratch.

## Before you start: read the brand canon

`/tools/system/nl-brand.css` is the source of truth for all tool styling.
The rules are short and live in **[`BRAND_GUIDE.md`](./BRAND_GUIDE.md)**
(this directory). The live preview of every component is at
**`/tools/style-guide/index.html`**.

Skim both before writing any CSS in your tool. If a component exists in
the brand stylesheet, use it. Don't roll your own.

## Roll out a new tool

The fast path is to ask Claude:

```
/new-tool <slug>
```

The `new-tool` skill (`.claude/skills/new-tool/SKILL.md`) handles the
copy + find-replace + portal registration prompt. If you'd rather do it
by hand:

1. Copy this directory:

   ```
   cp -r system/_template <slug>
   ```

2. Find/replace these placeholders inside `<slug>/index.html`:

   | Placeholder           | Example                                   |
   |-----------------------|-------------------------------------------|
   | `{{TOOL_TITLE}}`      | `DAZN VIP`                                |
   | `{{TOOL_SLUG}}`       | `dazn-vip` (URL path, dir name)           |
   | `{{TOOL_KEY}}`        | `media-dazn-vip` (`<category>-<slug>`)    |
   | `{{TOOL_DESCRIPTION}}`| Short one-liner shown in header           |
   | `{{TOOL_DATE}}`       | Today, e.g. `11/05/2026`                  |

   `<category>` for `TOOL_KEY` is one of `staff`, `ops`, `media`.

3. **Don't bump the `?v=N` cache-bust numbers** in the template. They
   match the current canonical versions of `nl-brand.css`,
   `nl-utils.js`, `nl-topbar.js` and `auth-guard.js`. If you bump those
   system files later, bump them everywhere — `system/lint-tools.sh`
   will catch drift.

4. Register the tool. Two places, depending on what it does:

   - **RTDB `tools/{{TOOL_KEY}}`** — write the registry entry
     (label, icon, department, url, defaults). The portal admin UI's
     Deploy button seeds the defaults to every user from there.
     `auth-guard.js` reads this entry at boot — there is **no
     hardcoded registry** in the code. Shape:
     ```json
     {
       "defaults":     { "admin": "admin", "club": "hidden",
                         "staff": "access", "superadmin": "admin" },
       "department":   "staff",
       "description":  "One-line summary.",
       "icon":         "⭐",
       "label":        "My Tool",
       "placeholder":  false,
       "type":         "staff-only",
       "url":          "/tools/{{TOOL_SLUG}}/",
       "visibleToAll": false
     }
     ```
   - **RTDB rules** — if the tool reads/writes RTDB, add a rules block
     for `app-data/{{TOOL_KEY}}/...`. Update the central rules file
     and deploy.

5. (Optional but recommended) add a `manifest.json` entry so the tool
   shows in the PWA install list.

## What the template doesn't do for you

- **Doesn't generate per-tool RTDB rules.** Write them by hand and
  deploy.
- **Doesn't seed data.** If your tool needs default data (e.g. a list
  of clubs), import it manually via the Firebase Console or write a
  seed script under `scripts/`.
- **Doesn't write the RTDB tool entry.** Until you put
  `tools/{{TOOL_KEY}}` in the nl-tools RTDB (see step 4 above),
  auth-guard has no defaults to read and the page will deny for
  everyone except superadmins.

## Drift detection

`system/lint-tools.sh` is run automatically at the start of every
Claude Code session (via the `SessionStart` hook in
`.claude/settings.json`). It diffs every tool's head structure against
this template and reports tools whose cache-bust versions, script
order, or required globals are out of sync. Run it manually any time:

```
bash system/lint-tools.sh
```

Or via Claude:

```
/tool-lint
```
