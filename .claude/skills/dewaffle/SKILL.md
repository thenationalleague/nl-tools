---
name: dewaffle
description: Audit a page's user-facing copy for waffle — over-explanation, restated labels, unasked-for reassurance, boilerplate — and propose the cuts. Use when the user types /dewaffle <path>, says a page is "waffle", "over-explaining", "cluttered", "too wordy", or asks to trim, tighten or strip the copy. Also use before shipping any club-facing or public page. Reports and proposes; only edits when told to.
allowed-tools: Read, Grep, Glob, Edit, Bash
---

# dewaffle — cut the copy that is not doing a job

Generated copy fails the same way every time: it explains instead of
asking. The page ends up talking about itself, and the thing it wants
the reader to do is buried under three sentences of throat-clearing.

This skill finds those lines and proposes their removal. It does **not**
rewrite copy into different copy — the fix for waffle is nearly always
deletion, not a better paragraph.

## The test

A line of user-facing text earns its place only if it does one of three
things:

1. **Changes what the user does** — an instruction they would otherwise
   get wrong.
2. **Warns of a consequence** — something irreversible, or a cost they
   cannot see.
3. **Answers a question they would otherwise have to ask** — and would
   actually ask, not one invented for them.

Everything else goes.

## The six patterns

Look for these in order. They cover almost every real case.

1. **Restatement.** The line says what a label, placeholder, heading,
   button or control already says. A hint reading "Optional." under a
   field whose placeholder starts "Optional." is the pure form.
2. **Preamble.** Explaining the product, the project or the context
   before asking the question. Nobody who followed a link to a form
   needs a paragraph on what the platform is before they can give you a
   date.
3. **Justification.** Selling the ask, or flattering the reader for
   answering. "It genuinely shapes what we cover." "Your input is
   invaluable."
4. **Unasked-for reassurance.** Comfort for an anxiety the reader did
   not arrive with. "No problem." "Nothing else to do for now." "Don't
   worry."
5. **Boilerplate.** Privacy notes, data-handling notes and disclaimers
   nobody requested and nobody reads. (Flag these rather than deleting
   silently — occasionally one is there for a reason. Say so and let the
   user decide.)
6. **Second-sentence duplication.** Two sentences doing one sentence's
   job. Two instructions for one action read as *two actions*.

## What NOT to cut

- Anything stating a **consequence** ("this cannot be undone").
- Anything correcting a **likely misreading** — the review dialog on
  the PhotoShelter form exists because a grid of dates reads as
  pick-one. That is copy doing real work.
- **Error and empty states.** They are read at the exact moment someone
  is stuck, which is the one moment more words help.
- Code comments. This skill is about what the *user* sees. The
  repository's comments explain *why* and stay long on purpose.

## Steps

1. **Read the page.** Take every user-visible string: HTML text nodes,
   `placeholder`, `title`, `aria-label`, and strings built in JS for
   toasts, modals, validation and success screens. Grep is not enough on
   its own — the JS strings are where half the waffle hides.
2. **Test each line** against the three-part test above, then name which
   of the six patterns it matches.
3. **Report before editing.** One line per finding:
   `path:line — [pattern] "the copy" → cut`
   Group by pattern when there are many. Give a count.
4. **Ask before applying**, unless the user already said to just do it.
   Boilerplate (pattern 5) is always confirmed, never assumed.
5. **On apply:** delete the markup, then delete any CSS class and JS
   reference that existed only to serve it. A removed paragraph that
   leaves its `.ps-foot` rule behind is half a job.
6. **Re-check the page still works** — deleting an element that JS
   addresses by id will throw. Grep the id before you cut it.
7. Bump the page version and add a changelog entry, per the repo
   convention.

## Reporting style

Be specific and short. The user wants to see the offending sentence and
a verdict, not an essay about tone. If the page is clean, say so in one
line — do not manufacture findings to look thorough.
