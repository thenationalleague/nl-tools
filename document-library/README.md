# Document Library (`/document-library`)

Where the League keeps documents for clubs: rules, guidance, templates, forms.
One library for everyone. There is no per-club folder and no club filter.

| Page | Who | Gets in via | Can do |
|---|---|---|---|
| `/document-library/` | **every club**, and anyone holding the League's own code | their access code (the one credential, `functions/club-code.js`) | Browse, search, preview and download everything. Change nothing |
| `/document-library/admin/` at **Manage** | admins and superadmins by default, anyone else set to Manage in the portal | portal login (auth-guard, `ops-document-library`) | Everything: upload files and whole folders, new folder, rename, move, remove to the Bin, restore, delete for good, and read the Activity log |
| `/document-library/admin/` at **Use** | anyone set to Use in the portal | portal login | Browse, search, preview, download and read the Activity log. No Bin, no changes |

## The name on screen is the name on disk

The library behaves like a folder on a computer, and the promise behind that is
that a document has one name everywhere: in the list, in the preview, in the
file a club saves, and inside a zip. Four rules hold it, all canon helpers in
`NL.files` (nl-utils v1.46):

- **Desktop-legal names** (`cleanName`). Nothing Windows refuses
  (`\ / : * ? " < > |`, a trailing dot, `CON`, `NUL`…). A name that's valid here
  saves unchanged wherever it lands.
- **No two names alike in one folder**, ignoring case, with files and folders
  counted together (`uniqueIn`). Windows and macOS both treat `Budget.pdf` and
  `budget.pdf` as the same file, so a zip of a folder holding both would lose
  one when unpacked. An upload that clashes becomes `Budget (2).pdf`. A rename
  or move that would clash is refused, because changing a name as a side
  effect of something else would break the promise.
- **A rename keeps the extension** (`keepExt`). Type `Final` for `Report.docx`
  and you get `Final.docx`. Type `Final.pdf` and you get `Final.pdf.docx`,
  because it's still a Word file.
- **A rename reaches the stored file** (`contentDisposition`). The console
  rewrites the object's `Content-Disposition` metadata before it writes the
  new name to the record, so even the raw download URL saves under the new
  name. The order matters: if it fails, the old name stays everywhere.

**The bytes never move.** A document is stored at
`document-library/files/<fileId>.<ext>`, keyed on its id and never on its
name or folder. Renaming and moving are database writes, so they're instant
and never re-upload anything.

## Data

RTDB `app-data/ops-document-library/`:

| Node | Shape | Read | Write |
|---|---|---|---|
| `folders/<id>` | `{ name, parentId?, createdAt }` | club code, Use, Manage | Manage |
| `files/<id>` | `{ name, folderId, size, contentType, storagePath, url, uploadedAt, thumb*/medium*? }`; `folderId: '_root'` = top level | club code, Use, Manage | Manage |
| `trash/<id>` | the file record + `deletedAt`, `deletedBy` | Use, Manage | Manage |
| `audit/<id>` | `{ ts, actor, who, action, detail }` | Use, Manage | Manage; a club may append its own `download` lines only |

"Manage" and "Use" are the portal's levels for `ops-document-library`: a
person's own setting if they have one, otherwise the registry default for
their role, with superadmin always at Manage. The rules are **generated**
from those same two places by `scripts/rtdb-level-rule.mjs`, never written
by hand. Until 29/10/2026 they checked roles only, so two staff set to Use
in the portal could open the page and were then refused by the database.
`tests/emulator/level-rule.mjs` runs the generated rule against
`NL.resolveToolLevel` over every grant shape, role and default the live data
can hold, and they have to agree.

Storage `document-library/**`: readable by a club-code session or any portal
account. Writable by portal accounts only, because Storage rules can't read
RTDB roles. An object nothing points at is listed nowhere, and the records
are admin-only. Bytes can never be replaced: create needs an empty path, and
update is allowed only when the md5 is unchanged, which is exactly the
metadata write a rename makes. HTML, XHTML, JavaScript and SVG are refused,
because they execute when a browser opens the download URL.

Both rule sets are in `system/rtdb/rules.snapshot.json` and
`system/storage/rules.snapshot.rules`, tested against the emulator by
`tests/emulator/document-library-rules.mjs`.

## Things worth knowing

- **Download links are bearer links.** Firebase download URLs carry a token.
  Anyone holding a copied URL can fetch that file without a code. The same is
  true of Programme Packs. Removing a document from the library stops it
  being listed, but doesn't revoke a URL someone already copied. Deleting it
  for good does.
- **Previews never leave our storage.** PDFs, images, video and audio use the
  browser's own viewers. Word `.docx` renders in the tab through the vendored
  viewer at `/system/_vendor/`. Excel and PowerPoint download instead:
  previewing them means handing the file's URL to Microsoft or Google
  (decided 28/10/2026).
- **No "replace with a new version".** Decided 28/10/2026: updating a
  document means removing the old one and uploading the new one.
- **Club downloads are logged**, previews are not. The Activity tab shows
  which club downloaded what.
- **Bulk download needs bucket CORS**, the same `system/storage/cors.json`
  Programme Packs uses. Single files save without it.
- The page code is `_library.js` (the browser, both pages) and
  `_library.css`. The file-browser CSS is a flagged canon candidate. See the
  note at the top of `_library.css`.
