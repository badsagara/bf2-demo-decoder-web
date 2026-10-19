#!/usr/bin/env node
// BF2 Round Replay - the analysis of many rounds (todo 146; v175): every decoded round of the site opened in the site's
// own page, in a headless browser on the server, and its numbers taken out - every kill with the killer's aim over the
// 2 s before it, the distance, the sight line, when he first saw the victim; every hint as the page makes it now, with its
// figures; the flags' capture stretches; jumps on foot; spots; each soldier's totals; the decoder's counts (the page's
// analysisDump: the columns are in each file). From them the hints' thresholds can be set on thousands of rounds, with
// no new run for each new threshold.
//
//   node analyze.mjs                one file a round in $BF2R_ROOT/analysis/rounds (a round already done is skipped:
//                                   the run goes on from where it stopped), then the archive
//                                   $BF2R_ROOT/analysis/bf2-analysis-<date>.tar (what to send to Claude)
//     --jobs N                      rounds at once (default: the cores less one, ~1.5 GB of memory each, at most 3)
//     --limit N                     at most N rounds this run
//     --maps a,b                    only these maps (strike_at_karkand,dalian_plant)
//     --min-players N               rounds with fewer soldiers left out (default 6)
//     --since YYYY-MM-DD            rounds recorded since then
//     --timeout S                   a round that takes longer is given up (default 900 s; in failed.json)
//     --fresh                       do again the rounds already done
//     --pack                        only make the archive of what is done
//     --no-pack                     no archive at the end
//
// It needs Playwright and its Chromium once: sudo bash server/analyze-setup.sh (in $BF2R_ROOT/analyze). The site's files
// ($BF2R_ROOT/site) and rounds ($BF2R_ROOT/data) are served to the browser by this script itself on 127.0.0.1 (no web
// server or domain needed). It runs at a low priority (nice 15), so the site and the decoding of new demos go first.
// Settings as ingest.mjs: /etc/bf2replay.conf or the environment (BF2R_ROOT); BF2R_CHROMIUM = a browser to use instead.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import os from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const conf = {};
try { for (const line of fs.readFileSync('/etc/bf2replay.conf', 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/.exec(line); if (m) conf[m[1]] = m[2]; } } catch (e) { /* no file: defaults */ }
const opt = (k, d) => process.env[k] ?? conf[k] ?? d;
const ROOT = opt('BF2R_ROOT', '/srv/bf2replay');
const SITE = path.join(ROOT, 'site'), DATA = path.join(ROOT, 'data'), OUT = path.join(ROOT, 'analysis'), RDIR = path.join(OUT, 'rounds');
const argv = process.argv.slice(2), has = k => argv.includes(k), val = (k, d) => { const i = argv.indexOf(k); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);
const linkId = n => String(n || '').replace(/\.bf2demo$/i, '');
const fileOf = n => path.join(RDIR, linkId(n).replace(/[^A-Za-z0-9._-]/g, '_') + '.json.gz');

// ---------- the archive ----------
function pack() {
  if (!fs.existsSync(RDIR)) { log('nothing to pack: no', RDIR); return null; }
  const files = fs.readdirSync(RDIR).filter(f => f.endsWith('.json.gz'));
  const sum = { made: new Date().toISOString(), rounds: files.length, kinds: {}, maps: {}, pages: {}, errors: 0 };
  for (const f of files) {
    try {
      const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RDIR, f))));
      sum.maps[d.map] = (sum.maps[d.map] || 0) + 1; sum.pages[d.page] = (sum.pages[d.page] || 0) + 1; if (d.errs?.length) sum.errors++;
      for (const h of d.H || []) sum.kinds[h.kind] = (sum.kinds[h.kind] || 0) + 1;
    } catch (e) { sum.errors++; }
  }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(sum, null, 1));
  const tar = path.join(OUT, `bf2-analysis-${new Date().toISOString().slice(0, 10)}.tar`);
  const list = ['summary.json', 'rounds', ...['failed.json', 'run.json'].filter(f => fs.existsSync(path.join(OUT, f)))];
  execFileSync('tar', ['-cf', tar, '-C', OUT, ...list]);
  log(`archive: ${tar} (${(fs.statSync(tar).size / 2 ** 20).toFixed(1)} MB, ${files.length} rounds)`);
  return tar;
}
if (has('--pack')) { pack(); process.exit(0); }

// ---------- Playwright ----------
const PW_DIR = path.join(ROOT, 'analyze');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(path.join(PW_DIR, 'browsers'))) process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(PW_DIR, 'browsers');
let chromium = null;
for (const base of [PW_DIR, path.dirname(new URL(import.meta.url).pathname), process.cwd()]) {
  try { chromium = createRequire(path.join(base, 'x.js'))('playwright').chromium; break; } catch (e) { /* next */ }
}
if (!chromium) { console.error('Playwright is not installed: run  sudo bash ' + path.join(path.dirname(new URL(import.meta.url).pathname), 'analyze-setup.sh')); process.exit(2); }

// ---------- what to do ----------
let idx; try { idx = JSON.parse(fs.readFileSync(path.join(DATA, '.rounds-full.json'), 'utf8')); } catch (e) { idx = JSON.parse(fs.readFileSync(path.join(DATA, 'rounds.json'), 'utf8')); }
const MIN_P = +val('--min-players', 6), MAPS = val('--maps', '') ? new Set(val('--maps').split(',').map(s => s.trim().toLowerCase())) : null, SINCE = val('--since', '');
const LIMIT = +val('--limit', 0) || Infinity, TIMEOUT = (+val('--timeout', 900) || 900) * 1000, FRESH = has('--fresh');
const soldiers = r => r.sum?.players ?? (r.sum?.teams || []).reduce((s, t) => s + (t.players || 0), 0);
let todo = (idx.rounds || []).filter(r => !r.empty && r.bfr && (!MAPS || MAPS.has(String(r.sum?.map || '').toLowerCase())) && (!SINCE || String(r.sum?.date || '') >= SINCE) && !(soldiers(r) < MIN_P));
todo.sort((a, b) => String(b.sum?.date || '').localeCompare(String(a.sum?.date || '')));   // (the newest first)
fs.mkdirSync(RDIR, { recursive: true });
const pageVer = (/const APP_VERSION = '(v\d+)'/.exec(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8')) || [])[1] || '?';
if (!FRESH) todo = todo.filter(r => { try { return !fs.statSync(fileOf(r.name)).size; } catch (e) { return true; } });
todo = todo.slice(0, LIMIT);
const failedPath = path.join(OUT, 'failed.json'); let failed = {}; try { failed = JSON.parse(fs.readFileSync(failedPath, 'utf8')); } catch (e) { /* none yet */ }
const memJobs = Math.max(1, Math.floor(os.totalmem() / (1.5 * 2 ** 30))), JOBS = Math.max(1, Math.min(16, +val('--jobs', 0) || Math.min(3, Math.max(1, os.cpus().length - 1), memJobs)));
log(`${todo.length} rounds to analyse (page ${pageVer}, ${JOBS} at once; ${MIN_P}+ soldiers${MAPS ? ', maps ' + [...MAPS].join(',') : ''}${SINCE ? ', since ' + SINCE : ''}) -> ${RDIR}`);
try { os.setPriority(15); } catch (e) { /* not allowed: as it is */ }
if (!todo.length) { if (!has('--no-pack')) pack(); process.exit(0); }

// ---------- the site's files, served to the browser here ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (u.endsWith('/')) u += 'index.html';
  const base = u.startsWith('/data/') ? DATA : SITE, rel = u.startsWith('/data/') ? u.slice(6) : u.slice(1);
  const f = path.normalize(path.join(base, rel));
  if (!f.startsWith(base + path.sep) || rel.split('/').some(s => s.startsWith('.'))) { res.writeHead(404); res.end(); return; }
  fs.stat(f, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(f).pipe(res);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// ---------- the browser ----------
const browser = await chromium.launch({
  handleSIGTERM: false, handleSIGINT: false, handleSIGHUP: false,   // (this script stops it: after the rounds being done)
  ...(opt('BF2R_CHROMIUM', '') ? { executablePath: opt('BF2R_CHROMIUM', '') } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-compositing', '--mute-audio', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run']
});
const PER_PAGE = 30;   // (a fresh page after so many rounds: its memory)
async function newPage(first) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage();
  await ctx.route(u => !String(u).startsWith(BASE), r => r.abort());   // (only the site's own files: no web fonts, nothing else)
  page.on('pageerror', e => { page._errs = (page._errs || []).concat(String(e.message || e).slice(0, 200)); });
  await page.goto(BASE + '?analyze#round=' + encodeURIComponent(linkId(first)), { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__bf2analyze && window.__bf2analyze.ready(), null, { timeout: 120000 });
  page._n = 0; return page;
}
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ': over ' + Math.round(ms / 1000) + ' s')), ms))]);
let done = 0, kills = 0, hints = 0; const started = Date.now(), total = todo.length;
const runInfo = { started: new Date().toISOString(), pid: process.pid, page: pageVer, jobs: JOBS, rounds: total, host: os.hostname(), mem: os.totalmem(), cpus: os.cpus().length };
fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(runInfo, null, 1));
let stopping = false; process.on('SIGTERM', () => { stopping = true; log('stopping after the rounds being done (SIGTERM)'); }); process.on('SIGINT', () => { stopping = true; log('stopping after the rounds being done'); });
async function worker(w) {
  let page = null;
  while (todo.length && !stopping) {
    const r = todo.shift(), t0 = Date.now();
    try {
      if (!page || page._n >= PER_PAGE) { if (page) await page.context().close().catch(() => {}); page = await newPage(r.name); }
      page._errs = [];
      const ok = await withTimeout(page.evaluate(n => window.__bf2analyze.open(n), r.name), TIMEOUT, 'opening');
      if (ok !== true) throw new Error('open: ' + ok);
      const d = await withTimeout(page.evaluate(s => window.__bf2analyze.dump(s), Math.round(TIMEOUT / 1000) - 30), TIMEOUT, 'analysing');
      if (!d || d.error) throw new Error(d ? d.error : 'no numbers');
      d.round = { name: r.name, decoder: r.decoder || null, bytes: r.bytes || null, sum: r.sum ? { ...r.sum, P: undefined, top: undefined } : null }; d.pageErrors = page._errs; d.wallMs = Date.now() - t0;
      fs.writeFileSync(fileOf(r.name) + '.part', zlib.gzipSync(JSON.stringify(d), { level: 9 })); fs.renameSync(fileOf(r.name) + '.part', fileOf(r.name));
      delete failed[r.name]; page._n++; done++; kills += d.K.length; hints += d.H.length;
      const el = (Date.now() - started) / 1000, left = el / done * todo.length;
      log(`[${done}/${total} ${Math.round(done / total * 100)}%, ~${left > 3600 ? Math.floor(left / 3600) + ' h ' : ''}${Math.round(left % 3600 / 60)} min left] ${r.name} ${(d.wallMs / 1000).toFixed(1)} s, ${d.K.length} kills, ${d.H.length} hints${d.errs.length ? ', ' + d.errs.length + ' errors' : ''}`);
    } catch (e) {
      if (stopping && !fs.existsSync(fileOf(r.name))) { log(`left for the next run: ${r.name}`); break; }
      failed[r.name] = { at: new Date().toISOString(), error: String(e.message || e).slice(0, 500) };
      log(`failed ${r.name}: ${failed[r.name].error}`);
      if (page) { await page.context().close().catch(() => {}); page = null; }
    }
    fs.writeFileSync(failedPath, JSON.stringify(failed, null, 1));
  }
  if (page) await page.context().close().catch(() => {});
}
await Promise.all(Array.from({ length: JOBS }, (_, w) => worker(w)));
await browser.close(); server.close();
runInfo.ended = new Date().toISOString(); runInfo.done = done; runInfo.failed = Object.keys(failed).length; runInfo.kills = kills; runInfo.hints = hints;
fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(runInfo, null, 1));
log(`done: ${done} rounds (${kills} kills, ${hints} hints), ${Object.keys(failed).length} failed, ${Math.round((Date.now() - started) / 60000)} min`);
if (!has('--no-pack') && !stopping) pack();
