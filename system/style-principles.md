# Style principles

How every NL Tools page should look and behave. The canon (`nl-brand.css`,
`nl-utils.js`) says what a thing looks like; these say where it goes and
when to use it. Draft, 13/11/2026: written to be argued with, then held to.

Each line is one rule. **[law]** is already enforced or agreed;
**[new]** is proposed here. **[check]** means a machine can test it, so
Estate or the lint should flag it rather than relying on someone noticing.

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

## 3. Type

1. Carbona only, in its Regular, Bold and ExtraBold cuts. Nothing falls back to a system font, form fields included. **[law] [check]**
2. Sizes come from the canon scale only. No local font sizes. **[new] [check]**
3. One heading ladder, top to bottom: the top bar title, a section heading, a panel head, a field label. Nothing in between, and no local heading styles. **[new] [check]**
4. Uppercase is for labels, heads and tabs. Never for content. **[new]**
5. A value looks like a value wherever it appears. A club name, date or number shown read-only matches the text inside an input. **[new]**
6. Muted text is for secondary information, never for something the reader must act on. **[new]**

## 4. Colour

1. Red marks where you are (the active tab). Navy marks what you have chosen. **[law]**
2. Status colours mean the same thing everywhere: green done, amber needs a look, red wrong or destructive, blue information. **[new]**
3. Club colours appear only on club identity: the pass sticker, a club header, a crest seat. Never on controls. **[new]**
4. Competitions always use their pill colours (National, North, South, NL Cup, FA Cup, FA Trophy). **[law]**
5. No colour carries meaning on its own. It always comes with a word or an icon. **[new]**

## 5. Controls

1. Name the set before choosing the control. A closed set (a few fixed options) may be tabs or a switcher. A set that can grow (clubs, people, sponsors, games) gets a searchable list or a dropdown. **[law]**
2. Choosing a club is always `NL.clubPicker`. Filtering is always `NL.filterButton`. A standalone dropdown is `.nl-select`. **[law] [check]**
3. No browser-native dialogs: `NL.confirm`, `NL.prompt` and `NL.alert` only. **[law] [check]**
4. A tick box and its words are one control. Clicking the words ticks the box, and the words read as a sentence, not a label. **[new]**
5. Dates are shown as people say them (Sat 14 Nov 2026), and stored as ISO. **[law]**
6. Controls are never greyed out to say "you can't". If you can't use something, it isn't there. **[law]**

## 6. Buttons and actions

1. A button says what it does in a verb: Save, Remove, Send reset link. **[law]**
2. A button that does something carries its icon from the sprite. Direction icons go before the words, completion icons after. Neutral buttons (Save, Cancel, Close, OK) have none. Never a typed arrow. **[law] [check]**
3. One primary button per view or dialog. **[new]**
4. Destructive buttons are red and sit apart from the rest: on the left of a bar. **[new]**
5. Order in a bar, left to right: destructive, then other actions on the thing, then the primary on the right. **[new]**
6. A dialog with Save doesn't also need Cancel. The × and Esc close it. A read-only dialog has Close. **[new]**

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
2. Plain English, British spelling, en dashes, dates as DD/MM/YYYY or Sat 14 Nov 2026. **[law]**
3. Labels name the thing; buttons name the action; errors say what to do next. **[new]**
4. One word per concept, everywhere: zone, pass, card, Access, Manage, Remove. Never a synonym. **[law]**

## 11. Safety

1. An action that can't be undone asks for something typed, not just a click. **[new]**
2. An action that would strand data refuses and says what to do first. **[new]**
3. Removed things are kept and can be restored, with the same identity. **[new]**
4. Every change that matters is written to the audit log in words. **[law] [check]**
