#!/usr/bin/env node
// BF2 Round Replay - (v196) the page in two. From the whole page (src/index.html) it writes the public one
// (site/index.html) and the admins' part (server/admin-round.js): what is between "// @admin-begin" and "// @admin-end"
// (the hints for admins and all that goes with them: their rules and thresholds, the Admin tab) and between
// "// @agg-admin-begin" and "// @agg-admin-end" (in the numbers over all rounds: his headshots against what his weapons
// give). admin.mjs hands the admins' part only to a logged-in admin (the page runs it then: adminEval), analyze.mjs to
// its own browser; ingest.mjs adds its @agg-admin part to the page's @agg one. Claude runs it before each release:
//   node server/splitpage.mjs [src/index.html] [site/index.html] [server/admin-round.js]
// It stops (writing nothing) when the markers don't pair up, or a marker is left in the public page.
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname), REPO = path.dirname(HERE);
const [src = path.join(REPO, 'src', 'index.html'), pub = path.join(REPO, 'site', 'index.html'), adm = path.join(HERE, 'admin-round.js')] = process.argv.slice(2);
const L = fs.readFileSync(src, 'utf8').split('\n'), P = [], A = [];
let mode = null, parts = 0, aggParts = 0;
const die = m => { console.error('splitpage: ' + m + ' - nothing written'); process.exit(1); };
L.forEach((l, i) => {
  const t = l.trim(), at = ` (line ${i + 1})`;
  if (t === '// @admin-begin') { if (mode) die('@admin-begin inside another part' + at); mode = 'a'; parts++; A.push(`// ---- part ${parts} (page line ${i + 2}) ----`); return; }
  if (t === '// @admin-end') { if (mode !== 'a') die('@admin-end without its begin' + at); mode = null; return; }
  if (t === '// @agg-admin-begin') { if (mode) die('@agg-admin-begin inside another part' + at); mode = 'g'; aggParts++; A.push(l); return; }
  if (t === '// @agg-admin-end') { if (mode !== 'g') die('@agg-admin-end without its begin' + at); mode = null; A.push(l); return; }
  (mode ? A : P).push(l);
});
if (mode) die('a part not closed at the end');
const page = P.join('\n');
if (/@admin-(begin|end)|@agg-admin-/.test(page)) die('a marker left in the public page');
const ver = (/const APP_VERSION = '(v\d+)'/.exec(page) || [])[1]; if (!ver) die('no APP_VERSION in the page');
const js = `// BF2 Round Replay ${ver} - the admins' part of the page (server/splitpage.mjs wrote it from src/index.html: do not edit here).\n`
  + `// Handed over by admin.mjs only to a logged-in admin; the page runs it with its own names in sight (adminEval).\n`
  + `const ADM_V = '${ver}';\n` + A.join('\n') + '\n';
fs.writeFileSync(pub + '.tmp', page); fs.renameSync(pub + '.tmp', pub);
fs.writeFileSync(adm + '.tmp', js); fs.renameSync(adm + '.tmp', adm);
console.log(`${ver}: ${path.relative(REPO, pub)} ${(page.length / 1024).toFixed(0)} KB, ${path.relative(REPO, adm)} ${(js.length / 1024).toFixed(0)} KB (${parts} parts, ${aggParts} in the numbers over all rounds)`);
