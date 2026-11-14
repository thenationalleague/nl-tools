/* gas-push-all.mjs — make the live Apps Script project hold exactly gas/.

   Why this exists (14/11/2026): `clasp push` (3.3.0) only uploads when a file
   in the repo has changed. It builds its change list from the repo's files
   alone (core/files.js, getChangedFiles: "iterate over local files and
   compare with their remote counterparts"), so a file deleted from the repo
   but still in the live project is not a change. It prints "Script is
   already up to date." and uploads nothing, and the live project keeps the
   file. That is how FixtureSync.js outlived its retirement on 13/11/2026.

   clasp's own upload, `clasp.files.push()` (core/files.js), sends the whole
   file list to the Apps Script API's projects.updateContent, which replaces
   the project's contents: anything not in the list is removed
   (https://developers.google.com/apps-script/api/reference/rest/v1/projects/updateContent).
   This calls that upload directly, so a deletion reaches live, using clasp's
   own sign-in from ~/.clasprc.json. Nothing here touches the credential.

   It imports clasp's internal modules by file path from the global install,
   so it is tied to the clasp version the workflows pin (3.3.0). If that pin
   moves, check these two imports still exist.

   Run from the repo root with .clasp.json pointing rootDir at gas/:
     node scripts/gas-push-all.mjs           # replace live with gas/
     node scripts/gas-push-all.mjs --probe   # only check clasp's modules load
     node scripts/gas-push-all.mjs --list    # what would go up; no sign-in
*/
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
const base = join(root, '@google', 'clasp', 'build', 'src');
const load = (p) => import(pathToFileURL(join(base, p)).href);

const { initAuth } = await load('auth/auth.js');
const { initClaspInstance } = await load('core/clasp.js');
if (typeof initAuth !== 'function' || typeof initClaspInstance !== 'function') {
  console.error('::error::clasp\'s internal modules have moved. Check the pinned clasp version against scripts/gas-push-all.mjs.');
  process.exit(1);
}
if (process.argv.includes('--probe')) {
  console.log('clasp modules found.');
  process.exit(0);
}

if (process.argv.includes('--list')) {
  const clasp = await initClaspInstance({});
  const local = await clasp.files.collectLocalFiles();
  for (const f of local) console.log(`${f.localPath} -> ${f.remotePath} (${f.type})`);
  process.exit(0);
}

const auth = await initAuth({ userKey: 'default' });
if (!auth || !auth.credentials) {
  console.error('::error::clasp has no sign-in. Check CLASP_CREDENTIALS.');
  process.exit(1);
}
const clasp = await initClaspInstance({ credentials: auth.credentials });
const files = await clasp.files.push();
if (!files || !files.length) {
  console.error('::error::Nothing was uploaded: gas/ held no files clasp manages.');
  process.exit(1);
}
console.log(`Replaced the live project's contents with ${files.length} files from gas/:`);
for (const f of files) console.log(`└─ ${f.localPath}`);
