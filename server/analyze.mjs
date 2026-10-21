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
//     --auto                        (v185, bf2replay-hints.timer) the background run: a few rounds a time (--limit 40,
//                                   1 at once) - those not done yet, then those done by older hint rules (the page's
//                                   HINTS_V), the newest first; no archive; then the hints over every player's rounds
//     --hints                       only the hints over every player's rounds: data/stats/hints.json (each hint's share
//                                   of soldier-rounds) and data/stats/hints/<nick>.json (the player page's card)
//     --glitch [N]                  only the glitch spots (glitch.mjs; no browser): N new rounds (default every one) into
//                                   the maps' grids of places stood (analysis/glitch), then data/stats/glitch/<map>.json;
//                                   --auto does 150 a run first (--glitch-rounds N)
//
// It needs Playwright and its Chromium once: sudo bash server/analyze.sh start (installs it in $BF2R_ROOT/analyze). The site's files
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
import { readRoundList } from './roundsidx.mjs';
import { aggGlitch } from './glitch.mjs';

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
  // (v182) rounds taken off the list as copies of others (ingest.mjs, data/.copies.json: the same demo from two demo
  // pages) stay out of the archive
  let copies = {}; try { copies = JSON.parse(fs.readFileSync(path.join(DATA, '.copies.json'), 'utf8')).copies || {}; } catch (e) { /* none */ }
  const copyFiles = new Set(Object.keys(copies).map(n => path.basename(fileOf(n))));
  const files = fs.readdirSync(RDIR).filter(f => f.endsWith('.json.gz') && !copyFiles.has(f)), left = fs.readdirSync(RDIR).filter(f => copyFiles.has(f));
  const sum = { made: new Date().toISOString(), rounds: files.length, copiesLeftOut: left.length, kinds: {}, maps: {}, pages: {}, errors: 0 };
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
  const ex = path.join(OUT, '.pack-exclude'); fs.writeFileSync(ex, left.map(f => 'rounds/' + f).join('\n') + '\n');
  execFileSync('tar', ['-cf', tar, '-X', ex, '-C', OUT, ...list]); try { fs.unlinkSync(ex); } catch (e) {}
  log(`archive: ${tar} (${(fs.statSync(tar).size / 2 ** 20).toFixed(1)} MB, ${files.length} rounds${left.length ? `; ${left.length} cop${left.length === 1 ? "y" : "ies"} of other rounds left out` : ''})`);
  return tar;
}
if (has('--pack')) { pack(); process.exit(0); }

// ---------- (v185, todo 226) the hints over every player's rounds ----------
// From the rounds done with the page's hint rules (HINTS_V): for each soldier on the field 60 s or more, which hints
// named him; everyone's share of soldier-rounds with each (data/stats/hints.json) and each player's rounds with each,
// with up to 5 of the newest such rounds (data/stats/hints/<nick slug>.json, nicks as the stats' own: the page's
// nickOf / nickSlug). A summary of each round file is kept in analysis/.hints-cache.json (by its time), so a run reads
// only the new ones.
const AUTO = has('--auto');
const pageText = () => fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const pageHv = () => +((/const HINTS_V = (\d+)/.exec(pageText()) || [])[1] || 0);
function aggFns() {
  const L = pageText().split('\n'), a = L.findIndex(l => l.startsWith('// @agg-begin')), b = L.findIndex(l => l.startsWith('// @agg-end')), g = L.find(l => l.startsWith('const GAME = '));
  if (!g || a < 0 || b < a) return null;
  return new Function(g + '\n' + L.slice(a, b).join('\n') + '\nreturn { nickOf, nickSlug };')();
}
const HVI = path.join(OUT, '.hv.json');   // file -> the hint rules it was done with
let hvIdx = null;
const hvLoad = () => { if (!hvIdx) { try { hvIdx = JSON.parse(fs.readFileSync(HVI, 'utf8')); } catch (e) { hvIdx = {}; } } return hvIdx; };
const hvSave = () => { if (hvIdx) { try { fs.writeFileSync(HVI + '.tmp', JSON.stringify(hvIdx)); fs.renameSync(HVI + '.tmp', HVI); } catch (e) {} } };
const hvOf = f => { const I = hvLoad(); if (I[f] !== undefined) return I[f]; let v = 0; try { v = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RDIR, f)))).hv || 0; } catch (e) {} return (I[f] = v); };
function aggHints() {
  const F = aggFns(), HV = pageHv(); if (!F || !HV) { log('hints: the page has no hint rules version (HINTS_V)'); return; }
  if (!fs.existsSync(RDIR)) return;
  let copies = {}; try { copies = JSON.parse(fs.readFileSync(path.join(DATA, '.copies.json'), 'utf8')).copies || {}; } catch (e) {}
  const skip = new Set(Object.keys(copies).map(n => path.basename(fileOf(n))));
  // only the rounds the site still lists (one taken off it - fewer players than BF2R_MIN_PLAYERS, removed - counts no more)
  let listed = null; try { const L = readRoundList(fs, path, DATA).rounds; if (L && L.length) listed = new Set(L.map(r => path.basename(fileOf(r.name)))); } catch (e) {}
  const CF = path.join(OUT, '.hints-cache.json'); let cache = {}; try { cache = JSON.parse(fs.readFileSync(CF, 'utf8')); } catch (e) {}
  const out = {}; let read = 0;
  for (const f of fs.readdirSync(RDIR)) {
    if (!f.endsWith('.json.gz') || skip.has(f) || (listed && !listed.has(f))) continue;
    let st; try { st = fs.statSync(path.join(RDIR, f)); } catch (e) { continue; }
    let c = cache[f];
    if (!c || c.mt !== st.mtimeMs) {
      try {
        const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RDIR, f)))); read++;
        const pc = Object.fromEntries((d.cols?.P || []).map((n, i) => [n, i])), byI = new Map(), pl = [];
        for (const r of d.P || []) { if ((r[pc.aliveS] || 0) < 60) continue; byI.set(r[pc.i], pl.length); pl.push(String(r[pc.name] || '').trim()); }
        const hc = new Map(); for (const h of d.H || []) { const j = byI.get(h.actor); if (j === undefined) continue; const k = j + '|' + h.kind; hc.set(k, (hc.get(k) || 0) + 1); }
        c = cache[f] = { mt: st.mtimeMs, hv: d.hv || 0, name: d.round?.name || d.name, date: d.meta?.date || '', pl, h: [...hc].map(([k, n]) => { const [j, kind] = k.split('|'); return [+j, kind, n]; }) };
        hvLoad()[f] = d.hv || 0;
      } catch (e) { continue; }
    }
    out[f] = c;
  }
  for (const f of Object.keys(cache)) if (!out[f]) delete cache[f];
  try { fs.writeFileSync(CF + '.tmp', JSON.stringify(cache)); fs.renameSync(CF + '.tmp', CF); } catch (e) {}
  hvSave();
  // count
  const kinds = {}, P = new Map(); let rounds = 0, sr = 0;
  const R = Object.values(out).filter(c => c.hv === HV).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  for (const c of R) {
    rounds++; sr += c.pl.length;
    const seen = new Map(); for (const [j, kind, n] of c.h) { const k = j + '|' + kind; seen.set(k, n); }
    c.pl.forEach((name, j) => {
      const nick = F.nickOf(name); if (/^Player \d+$/.test(nick)) return;
      let o = P.get(nick); if (!o) P.set(nick, o = { name, rounds: 0, k: {}, ex: {} }); o.rounds++;
    });
    const done = new Set();
    for (const [j, kind, n] of c.h) {
      const nick = F.nickOf(c.pl[j]); const o = P.get(nick); if (!o) continue;
      const kk = nick + '|' + kind; if (done.has(kk)) continue; done.add(kk);
      if (!kinds[kind]) kinds[kind] = [0, 0]; kinds[kind][0]++;
      const a = o.k[kind] || (o.k[kind] = [0, 0]); a[0]++; a[1] += n;
      const L = o.ex[kind] || (o.ex[kind] = []); if (L.length < 5) L.push([c.name, n]);
    }
  }
  for (const k of Object.keys(kinds)) kinds[k][1] = sr;
  const SD = path.join(DATA, 'stats'), HD = path.join(SD, 'hints'); fs.mkdirSync(HD, { recursive: true });
  const put = (f, v) => { const t = JSON.stringify(v); let old = null; try { old = fs.readFileSync(f, 'utf8'); } catch (e) {} if (old !== t) { fs.writeFileSync(f + '.tmp', t); fs.renameSync(f + '.tmp', f); return 1; } return 0; };
  let wrote = 0; const keep = new Set();
  for (const [nick, o] of P) { if (!Object.keys(o.k).length) continue; const fn = F.nickSlug(nick) + '.json'; keep.add(fn); wrote += put(path.join(HD, fn), { hv: HV, nick, name: o.name, rounds: o.rounds, k: o.k, ex: o.ex }); }
  for (const f of fs.readdirSync(HD)) if (f.endsWith('.json') && !keep.has(f)) { try { fs.unlinkSync(path.join(HD, f)); } catch (e) {} }
  put(path.join(SD, 'hints.json'), { hv: HV, at: new Date().toISOString(), rounds, soldierRounds: sr, players: P.size, kinds });
  log(`hints over every player's rounds: ${rounds} rounds (hint rules ${HV}), ${P.size} players, ${keep.size} with hints (${wrote} files written)${read ? `, ${read} round files read` : ''}`);
}
if (has('--hints')) { aggHints(); process.exit(0); }
// (v185, todo 185) glitch spots (glitch.mjs): the decoded rounds into each map's grid of places stood, then the hints
function glitchStep(budget) {
  const F = aggFns(); if (!F) { log('glitch spots: the page has no nickOf'); return; }
  let copies = {}; try { copies = JSON.parse(fs.readFileSync(path.join(DATA, '.copies.json'), 'utf8')).copies || {}; } catch (e) {}
  const rounds = (readRoundList(fs, path, DATA).rounds || []).filter(r => r.bfr && r.sum && !r.sum.empty && !copies[r.name]);
  return aggGlitch({ DATA, OUT, rounds, nickOf: F.nickOf, budget, log });
}
if (has('--glitch')) { glitchStep(+val('--glitch', 0) || 1e9); process.exit(0); }
// (v185) a background run while analyze.sh's own run is going: left for the next time
if (AUTO) {
  if (opt('BF2R_HINTS', '1') === '0') { console.log('BF2R_HINTS=0 (/etc/bf2replay.conf): the background analysis is off'); process.exit(0); }
  try { const ri = JSON.parse(fs.readFileSync(path.join(OUT, 'run.json'), 'utf8')); if (!ri.ended && ri.pid) { process.kill(ri.pid, 0); console.log('a run of analyze.sh is going (pid ' + ri.pid + '): the background analysis waits'); process.exit(0); } } catch (e) { /* none, or it has ended */ }
  // (the glitch grids need no browser: done first, up to 150 new rounds a run - ~0.5 s each)
  try { os.setPriority(15); } catch (e) {}
  try { glitchStep(+val('--glitch-rounds', 0) || 150); } catch (e) { log('glitch spots not done:', e.message); }
}

// ---------- Playwright ----------
const PW_DIR = path.join(ROOT, 'analyze');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(path.join(PW_DIR, 'browsers'))) process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(PW_DIR, 'browsers');
let chromium = null;
for (const base of [PW_DIR, path.dirname(new URL(import.meta.url).pathname), process.cwd()]) {
  try { chromium = createRequire(path.join(base, 'x.js'))('playwright').chromium; break; } catch (e) { /* next */ }
}
if (!chromium) {
  if (AUTO) { console.log('the background analysis needs Playwright: sudo bash ' + path.join(path.dirname(new URL(import.meta.url).pathname), 'analyze.sh') + ' start (installs it, once)'); process.exit(0); }
  console.error('Playwright is not installed: run  sudo bash ' + path.join(path.dirname(new URL(import.meta.url).pathname), 'analyze.sh') + ' start (installs it, once)'); process.exit(2);
}

// ---------- what to do ----------
const idx = readRoundList(fs, path, DATA);
const MIN_P = +val('--min-players', 6), MAPS = val('--maps', '') ? new Set(val('--maps').split(',').map(s => s.trim().toLowerCase())) : null, SINCE = val('--since', '');
const LIMIT = +val('--limit', 0) || Infinity, TIMEOUT = (+val('--timeout', 900) || 900) * 1000, FRESH = has('--fresh');
const soldiers = r => r.sum?.players ?? (r.sum?.teams || []).reduce((s, t) => s + (t.players || 0), 0);
let todo = (idx.rounds || []).filter(r => !r.empty && r.bfr && (!MAPS || MAPS.has(String(r.sum?.map || '').toLowerCase())) && (!SINCE || String(r.sum?.date || '') >= SINCE) && !(soldiers(r) < MIN_P));
todo.sort((a, b) => String(b.sum?.date || '').localeCompare(String(a.sum?.date || '')));   // (the newest first)
fs.mkdirSync(RDIR, { recursive: true });
const pageVer = (/const APP_VERSION = '(v\d+)'/.exec(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8')) || [])[1] || '?';
if (AUTO) {   // (v185) not done yet first, then done by older hint rules; the copies of other rounds never, nor a round
  // that failed with this page (it would be tried every 15 minutes: again after the next update of the site)
  let copies = {}; try { copies = JSON.parse(fs.readFileSync(path.join(DATA, '.copies.json'), 'utf8')).copies || {}; } catch (e) {}
  let fl = {}; try { fl = JSON.parse(fs.readFileSync(path.join(OUT, 'failed.json'), 'utf8')); } catch (e) {}
  const HV = pageHv(), none = [], old = [];
  for (const r of todo) { if (copies[r.name] || fl[r.name]?.page === pageVer) continue; const f = path.basename(fileOf(r.name)); let have = false; try { have = fs.statSync(fileOf(r.name)).size > 0; } catch (e) {} if (!have) none.push(r); else if (hvOf(f) < HV) old.push(r); }
  hvSave(); todo = none.concat(old);
  if (!todo.length) { aggHints(); process.exit(0); }
} else if (!FRESH) todo = todo.filter(r => { try { return !fs.statSync(fileOf(r.name)).size; } catch (e) { return true; } });
todo = todo.slice(0, AUTO ? (+val('--limit', 0) || 40) : LIMIT);
const failedPath = path.join(OUT, 'failed.json'); let failed = {}; try { failed = JSON.parse(fs.readFileSync(failedPath, 'utf8')); } catch (e) { /* none yet */ }
const memJobs = Math.max(1, Math.floor(os.totalmem() / (1.5 * 2 ** 30))), JOBS = Math.max(1, Math.min(16, +val('--jobs', 0) || (AUTO ? 1 : Math.min(3, Math.max(1, os.cpus().length - 1), memJobs))));
log(`${todo.length} rounds to analyse (page ${pageVer}, ${JOBS} at once; ${MIN_P}+ soldiers${MAPS ? ', maps ' + [...MAPS].join(',') : ''}${SINCE ? ', since ' + SINCE : ''}) -> ${RDIR}`);
try { os.setPriority(15); } catch (e) { /* not allowed: as it is */ }
if (!todo.length) { if (!has('--no-pack')) pack(); process.exit(0); }
const RUNF = path.join(OUT, AUTO ? 'auto.json' : 'run.json');   // (v185: the background run its own, so a manual run is told apart)

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
// (v182: the timer cleared when the round is done - before, each one held the run open for up to --timeout after the last
// round, past systemd's time to stop: "State 'stop-sigterm' timed out. Killing")
const withTimeout = (p, ms, what) => { let tm; return Promise.race([p, new Promise((_, rej) => { tm = setTimeout(() => rej(new Error(what + ': over ' + Math.round(ms / 1000) + ' s')), ms); })]).finally(() => clearTimeout(tm)); };
let done = 0, kills = 0, hints = 0; const started = Date.now(), total = todo.length;
const runInfo = { started: new Date().toISOString(), pid: process.pid, page: pageVer, jobs: JOBS, rounds: total, host: os.hostname(), mem: os.totalmem(), cpus: os.cpus().length };
fs.writeFileSync(RUNF, JSON.stringify(runInfo, null, 1));
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
      hvLoad()[path.basename(fileOf(r.name))] = d.hv || 0;
      delete failed[r.name]; page._n++; done++; kills += d.K.length; hints += d.H.length;
      const el = (Date.now() - started) / 1000, left = el / done * todo.length;
      log(`[${done}/${total} ${Math.round(done / total * 100)}%, ~${left > 3600 ? Math.floor(left / 3600) + ' h ' : ''}${Math.round(left % 3600 / 60)} min left] ${r.name} ${(d.wallMs / 1000).toFixed(1)} s, ${d.K.length} kills, ${d.H.length} hints${d.errs.length ? ', ' + d.errs.length + ' errors' : ''}`);
    } catch (e) {
      if (stopping && !fs.existsSync(fileOf(r.name))) { log(`left for the next run: ${r.name}`); break; }
      failed[r.name] = { at: new Date().toISOString(), page: pageVer, error: String(e.message || e).slice(0, 500) };
      log(`failed ${r.name}: ${failed[r.name].error}`);
      if (page) { await page.context().close().catch(() => {}); page = null; }
    }
    fs.writeFileSync(failedPath, JSON.stringify(failed, null, 1));
  }
  if (page) await page.context().close().catch(() => {});
}
await Promise.all(Array.from({ length: JOBS }, (_, w) => worker(w)));
await browser.close().catch(() => {}); server.closeAllConnections?.(); server.close();
runInfo.ended = new Date().toISOString(); runInfo.done = done; runInfo.failed = Object.keys(failed).length; runInfo.kills = kills; runInfo.hints = hints;
fs.writeFileSync(RUNF, JSON.stringify(runInfo, null, 1)); hvSave();
log(`done: ${done} rounds (${kills} kills, ${hints} hints), ${Object.keys(failed).length} failed, ${Math.round((Date.now() - started) / 60000)} min`);
if (AUTO) { try { aggHints(); } catch (e) { log('hints not written:', e.message); } process.exit(0); }
// (v182) the archive also when stopped (analyze.sh stop): what is done so far, ready to send; started again, the run goes on
if (!has('--no-pack')) { if (stopping) log('stopped: the archive of the rounds done so far'); try { pack(); } catch (e) { log('archive not made:', e.message); } }
process.exit(0);   // (nothing left to wait for)
