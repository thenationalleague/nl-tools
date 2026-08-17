# Vendored viewer libraries

Third-party, minified, committed as-is so the repo stays build-free and the
library page never loads code from a CDN at runtime. Loaded LAZILY by
`/programme/index.html` — only when someone first previews a Word document,
never on page load.

| File | Package | Version | Licence | sha256 |
|---|---|---|---|---|
| `jszip.min.js` | [jszip](https://www.npmjs.com/package/jszip) | 3.10.1 | MIT/GPLv3 dual | `acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e` |
| `docx-preview.min.js` | [docx-preview](https://www.npmjs.com/package/docx-preview) | 0.4.0 | Apache-2.0 | `051ef503f2677d53159a388b7384e950eda41ea4e47a103e5e36f124d7faea40` |

Both fetched from the npm registry (integrity-checked by npm) on 17/08/2026.
To upgrade: `npm pack <pkg>@<version>`, copy the `dist/*.min.js`, update this
table with the new sha256. Do not edit the files themselves.

Why these exist: a .docx can only be previewed by rendering it. The zero-effort
routes (Microsoft's or Google's embedded viewers) work by handing the file's
URL to a third party to fetch — shipping a club's material to someone else for
a convenience, which /programme/ explicitly refuses to do. docx-preview
renders the document in the viewer's own browser; the bytes never leave
Firebase Storage. JSZip is its dependency (a .docx is a zip).
