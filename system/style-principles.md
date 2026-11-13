# Style principles

How every NL Tools page should look and behave. The canon (`nl-brand.css`,
`nl-utils.js`) says what a thing looks like; these say where it goes and
when to use it. Draft, 13/11/2026: written to be argued with, then held to.

**Work in progress.** The **[new]** rules are not applied across the estate
yet. Before they are, there is one more full review of these principles
against every page (the brand sweep, `system/brand-audit.md`), and an agreed
moment to make the big changes in one go. Until then, a change to a tool
follows the **[law]** rules and the **[new]** ones where it is touching that
part of the page anyway; nobody reworks a tool to a **[new]** rule on its
own.

Each line is one rule. **[law]** is already enforced or agreed;
**[new]** is proposed here; **[consider]** is not yet decided either way.
**[check]** means a machine can test it, so Estate or the lint should flag it
rather than relying on someone noticing.

## 1. Foundations

1. Every tool should feel built on the same day by the same person. **[law]**
2. If two things should look the same, they use the same rule. Same token, different rendering, is a bug. **[law]**
3. Fewer components, one style. Anything new retires more than it adds. **[law]**
4. Tokens, never raw values: colour, spacing, radius, type size. The only exceptions are image and canvas exports. **[law] [check]**
5. Check by eye on the two desktop screens and a phone before shipping. "Same token" is not proof. **[law]**
6. A pattern written twice is a canon candidate; promote it rather than copying it. **[law]**

## 2. Page structure

1. One address per tool. Who sees what is decided by the pass, not the URL. **[law]**
2. The top bar carries the tool's title. The page never repeats it as a heading. **[law] [check]**
3. Tabs are the tool's main views, in order of use. **Manage** is always last. **[law]**
4. A tab holds a different job. A different way of looking at the same things is a view switcher inside the tab (Fixtures: Standard, Broadcast, Attendance). **[new]**
5. A page does not rearrange itself for a smaller screen. Columns narrow; panels scroll. **[law]**
6. Inside a tab, parts are section headings; pieces inside a part are panels with a navy head. **[new]**
7. What you'd send someone is in the address: the tab, the view, the club, the open item (`#club=ALD`, `?tab=codes`). A link that asks for more than the person may see opens the nearest view they can, quietly, with no error. Filters stay out of the address. **[new]**

## 3. Type

1. Carbona only, in its Regular, Bold and ExtraBold cuts. Nothing falls back to a system font, form fields included. **[law] [check]**
2. Sizes come from the canon scale only. No local font sizes. **[new] [check]**
3. One heading ladder, top to bottom: the top bar title, a section heading, a panel head, a field label. Nothing in between, and no local heading styles. **[new] [check]**
4. Uppercase is for labels, heads and tabs. Never for content. **[new]**
5. A value looks like a value wherever it appears. A club name, date or number shown read-only matches the text inside an input. **[new]**
6. Muted text is for secondary information, never for something the reader must act on. **[new]**

## 4. Colour

1. Red marks where you are (the active tab). Navy marks what you have chosen. **[law]**
2. A button's colour says its job, from the canon variants only:
   - **Primary** (red fill): the one main action, usually Save.
   - **Danger** (red tint, red words): destructive (Remove, Delete, Withdraw). Always with its icon and set apart on the left, so it never reads as Save.
   - **Navy** (navy fill): a second important action that starts something (Results, Issue a code).
   - **Ghost** (outline): everything else, Cancel and Close included.
   No other button colours; `.btn--secondary` is not canon. **[new] [check]**
3. Status colours mean the same thing everywhere: green done, amber needs a look, red wrong or destructive, blue information. **[new]**
4. Club colours appear only on club identity: the pass sticker, a club header, a crest seat. Never on controls. **[new]**
5. Competitions always use their pill colours (National, North, South, NL Cup, FA Cup, FA Trophy). **[law]**
6. No colour carries meaning on its own. It always comes with a word or an icon. **[new]**

## 5. Controls

1. Name the set before choosing the control. A closed set (a few fixed options) may be tabs or a switcher. A set that can grow (clubs, people, sponsors, games) gets a searchable list or a dropdown. **[law]**
2. Choosing a club is always `NL.clubPicker`. Filtering is always `NL.filterButton`. A standalone dropdown is `.nl-select`. **[law] [check]**
3. No browser-native dialogs: `NL.confirm`, `NL.prompt` and `NL.alert` only. **[law] [check]**
4. A tick box and its words are one control. Clicking the words ticks the box, and the words read as a sentence, not a label. **[new]**
5. Dates read **Sat 14 Nov 2026** (ddd d mmm yyyy), stored as ISO. Leave out only what a heading above already says (rows under a "Sat 14 Nov 2026" heading show no date). **[law]**
6. Times are 24-hour, **15:00**, everywhere: it reads the same in every context, and kick-offs are published that way. **[law]**
7. Controls are never greyed out to say "you can't". If you can't use something, it isn't there. **[law]**

## 6. Buttons and actions

1. A button says what it does in a verb: Save, Remove, Send reset link. **[law]**
2. Every action button carries its icon from the sprite, in dialogs too. Direction and action icons go before the words, completion icons after. Neutral buttons (Save, Cancel, Close, OK) have none. Never a typed arrow. **[law] [check]**
   If no icon fits, draw one into the sprite in its style; never ship the button bare.
3. One primary button per view or dialog. **[new]**
4. Destructive buttons are red and sit apart from the rest: on the left of a bar. **[new]**
5. Order in a bar, left to right: destructive, then other actions on the thing, then the primary on the right. **[new]**
6. A dialog with Save doesn't also need Cancel. The × and Esc close it. A read-only dialog has Close. **[new]**
7. On a phone, a button may drop its words and show only its icon, when the icon is one of the standard set everyone reads the same way: add, download, upload, edit, delete, search, close, share, print, refresh, back. The words stay for screen readers and show on hover or a long press. **[new] [consider]**
   The words always stay on the main action of a screen (Save, Send, Publish), on anything that can't be undone, and on any action whose icon is not in the standard set (Move, Restore, Regenerate). The canon decides it, not each tool: a button is marked as allowed to shrink, and a test fails if a button that can't be undone is marked. Plus alone is ambiguous between "add a folder" and "upload a file", so it keeps its noun.

## 7. Dialogs and editing

1. Changing the thing in front of you happens in place, with an Edit on the item. Running the tool happens in Manage. **[law]**
2. A dialog's title is the thing's name. Its body is the thing. **[new]**
3. Every action on the thing lives in the dialog's bottom bar, never in the body. **[new]**
4. A mode (Correct, Postpone) opens as its own dialog, titled with the mode: "Correct: Bath City v Truro City". **[new]**
5. Saving is explicit. Nothing changes until Save is pressed, except a single tick or toggle that says so. **[new]**

## 8. Manage

1. One Manage tab, last, carrying a count of anything waiting. **[law]**
2. Sections in this order, only those the tool has: Pending, Settings, Import, Removed, History. **[law]**
3. Each part of a section is a panel with a navy head. **[new]**
4. Exports belong in Access, beside what they export. **[law]**
5. Seasons are never archived away. Every season stays editable in place at Manage. **[law]**
6. Access never shows an edit control. **[law]**

## 9. Lists, tables and empty states

1. Tables are the canon `.table`, with its navy header. **[law]**
2. A count sits on the tab (`.tab__count`), hidden at zero. **[law]**
3. A full empty state is for an empty page or tab. Inside a panel, the empty line is one quiet sentence. **[new]**
4. A list that can be long shows the first page and a "Show more", never everything at once. **[new]**
5. Rows open on a click. A row's actions live in the dialog it opens, not as a cluster of buttons on the row. **[new]**

## 10. Words

1. No waffle. A line earns its place only if it changes what the reader does, warns of a consequence, or answers a question they would ask. **[law]**
2. Plain English, British spelling, en dashes. Dates and times as section 5 says. **[law]**
3. Labels name the thing; buttons name the action; errors say what to do next. **[new]**
4. One word per concept, everywhere: zone, pass, card, Access, Manage, Remove. Never a synonym. **[law]**

## 11. Safety

1. An action that can't be undone asks for something typed, not just a click. **[new]**
2. An action that would strand data refuses and says what to do first. **[new]**
3. Removed things are kept and can be restored, with the same identity. **[new]**
4. Every change that matters is written to the audit log in words. **[law] [check]**

## 12. The code behind it

1. Delete what is no longer used in the same change that stops using it: the button, its styles, its function, its test. **[new] [check]**
2. A one-off stays local; a pattern used twice is promoted to the canon, and the local copies and their "canon candidate" notes go. **[law]**
3. One-off workflows and scripts are removed in the next pull request after they have run. **[law]**
4. Comments explain why, not what happened. History lives in git and the pull requests. **[new]**
5. A file's header keeps its last five versions; older entries go, because git keeps them. **[new] [check]**
6. Page styles use the page's own class names and never restyle a canon class. **[law] [check]**
7. Check the canon before writing a local style or helper; if it almost does the job, extend the canon. **[law]**

## 13. Versions and What's new

1. Every tool keeps a version number, shown on its badge in the top bar. It is how a change is seen to have landed. **[law]**
2. The badge and What's new are for League staff only, decided by the pass's card. **[new]**
3. What's new keeps the last five entries, one plain line each, written for the person using the tool. **[new]**
4. Entries say what changed, never what went wrong. No clubs, people or incidents are named, in What's new, file headers or pull requests: all of it is public. **[new]**
5. Anything sensitive about an incident never goes in the repo. **[law]**

## 14. File libraries

For any page that stores files in folders: Programme Packs, Document Library, and whatever comes next. Drafted 13/11/2026 from how Google Drive, Dropbox and a desktop folder do it, and from a phone look at Programme Packs that was busy and left it unclear where an upload would land. The aim is one answer to "where am I, and where will this go?", visible at all times.

1. **Where you are comes first.** At the top: the path to here as links (All clubs › AFC Telford United ›), then the folder you're in as the heading, not a link. Nothing else sits above it. **[new]**
2. **The folder's own housekeeping is in its ⋯ beside the heading:** rename, delete, and a folder's details. Nothing destructive sits out in the open. **[new]**
3. **One action bar, directly under the heading:** Upload (the main action, filled) and New folder. It acts on the folder named above it, so it never has to say where. **[new]**
4. **Ticking anything turns that same bar into the selection bar:** ×, "2 selected", then Download, Move, Remove. Same place, same height, so nothing below moves. Untick everything and it turns back. Never two bars, and never a bar of greyed-out buttons waiting for a selection. **[new]**
5. **Folders first, then files, in one list.** Each row: tick box, icon, name, size, and its own ⋯ for what you can do to that one item (Download, Preview, Rename, Move, Remove). Photos may show as a grid of thumbnails; everything else is a list. **[new]**
6. **Dropping works anywhere on the folder.** While you drag, the whole folder lights up with one line naming the destination ("Drop to upload to Headshots"). Dropping onto a folder in the list lights that folder instead. **[new]**
7. **No standing drop box.** The dashed box appears only as the empty state of an empty folder you can upload to, saying what to do. **[new]**
8. **An upload says where it went.** Progress shows at the top of the list while it runs; when it finishes, the new files appear in place and stay highlighted for a moment. **[new]**
9. **No explanatory lines.** The path, the heading and the buttons say it all. Only consequences are said, at the moment they happen (Remove: "Removed files can be restored from Removed files"). **[law]**
10. **Read-only is the same layout without the write actions**, with "Read only" beside the heading. Nothing reflows. **[new]**
11. **On a phone the layout stays the same.** The path shortens to its last level ("‹ AFC Telford United"), the action bar stays one row, and the selection bar may use icon-only buttons under principle 6.7. **[new]**
12. **One library, one implementation.** Programme Packs and Document Library share `NL.files` already; the layout above becomes a canon component, not two hand-built pages. **[new]**
