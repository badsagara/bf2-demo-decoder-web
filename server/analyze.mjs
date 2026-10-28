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
//     --jobs N                      rounds at once (v248: else BF2R_ANALYZE_JOBS in /etc/bf2replay.conf, else the admin
//                                   page's choice - Background analysis, Rounds at once -, else automatic: the cores
//                                   less two, the memory at ~PAGE_GB a page, at most 12; before v248 at most 3)
//     --limit N                     at most N rounds this run
//     --maps a,b                    only these maps (strike_at_karkand,dalian_plant)
//     --min-players N               rounds with fewer soldiers left out (default 6)
//     --since YYYY-MM-DD            rounds recorded since then
//     --timeout S                   a round that takes longer is given up (default 900 s; in failed.json)
//     --fresh                       do again the rounds already done
//     --pack                        only make the archive of what is done (v193: named with the site's version,
//                                   bf2-analysis-<date>-<version>.tar, with a .json beside it of what is in it; the
//                                   admin page makes and downloads it too)
//     --no-pack                     no archive at the end
//     --auto                        (v185, bf2replay-hints.timer) the background run: those not done yet, then those
//                                   done by older hint rules (the page's HINTS_V), the newest first; no archive; then
//                                   the hints over every player's rounds. (v248) As many at once as --jobs says, in
//                                   batches of 40 a page at once (BATCH): after each, the players' hint cards are
//                                   written and the list looked at again (new rounds first); the run goes on, batch
//                                   after batch, while rounds are left and its time (95 min; the service's limit is
//                                   2 h) is not up - no more 5 minutes between batches of 40, one at a time, and no
//                                   "All rounds now" (v193-v246). The admin page's say (analysis/.auto-set.json):
//                                   paused (nothing is done), how many at once (looked at again every 5 s: the run
//                                   follows a change at once); what each run did: analysis/auto-note.json
//     --hints                       only the hints over every player's rounds: data/.admin/hints.json (each hint's share
//                                   of soldier-rounds) and data/.admin/hints/<nick>.json (the player page's card; v196:
//                                   the admins' - data/stats before)
//     --glitch [N]                  only the glitch spots (glitch.mjs; no browser): N new rounds (default every one) into
//                                   the maps' grids of places stood (analysis/glitch), then data/.admin/glitch/<map>.json;
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
import { alertRound } from './alerts.mjs';   // (v214)
import { siteHv as htSiteHv } from './hintcfg.mjs';   // (v227)
import { sameAs as decSame } from './decoders.mjs';   // (v229)

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
// (v193) named with the site's version (bf2-analysis-<date>-<version>.tar) and with <name>.tar.json beside it: what is in
// it (summary.json's numbers: rounds, the page versions and hint rules they were done with, the decoders); the glitch
// spots' files too (analysis/glitch: the stays, the maps' grids while they are under 300 MB together, and the page's
// data/.admin/glitch, data/.admin/hints.json - data/stats before v196). Made as .part and renamed when done; analysis/.pack.json says how it went
// (the admin page shows it)
const PACKF = path.join(OUT, '.pack.json'), GRIDS_MAX = 300 * 2 ** 20;
function pack() {
  if (!fs.existsSync(RDIR)) { log('nothing to pack: no', RDIR); return null; }
  const st0 = { started: new Date().toISOString(), pid: process.pid };
  try { fs.writeFileSync(PACKF, JSON.stringify(st0)); } catch (e) {}
  try {
    // (v182) rounds taken off the list as copies of others (ingest.mjs, data/.copies.json: the same demo from two demo
    // pages) stay out of the archive
    let copies = {}; try { copies = JSON.parse(fs.readFileSync(path.join(DATA, '.copies.json'), 'utf8')).copies || {}; } catch (e) { /* none */ }
    const copyFiles = new Set(Object.keys(copies).map(n => path.basename(fileOf(n))));
    const all = fs.readdirSync(RDIR), files = all.filter(f => f.endsWith('.json.gz') && !copyFiles.has(f)), left = all.filter(f => copyFiles.has(f));
    let page = ''; try { page = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'); } catch (e) {}
    const site = (/const APP_VERSION = '(v\d+)'/.exec(page) || [])[1] || 'v0', hvNow = pageHv();
    const sum = { made: new Date().toISOString(), site, hvNow, rounds: files.length, copiesLeftOut: left.length, kinds: {}, maps: {}, pages: {}, hv: {}, decoders: {}, errors: 0 };
    for (const f of files) {
      try {
        const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RDIR, f))));
        sum.maps[d.map] = (sum.maps[d.map] || 0) + 1; sum.pages[d.page] = (sum.pages[d.page] || 0) + 1; sum.hv[d.hv || 0] = (sum.hv[d.hv || 0] || 0) + 1; if (d.errs?.length) sum.errors++;
        const dc = d.round?.decoder || '?'; sum.decoders[dc] = (sum.decoders[dc] || 0) + 1;
        for (const h of d.H || []) sum.kinds[h.kind] = (sum.kinds[h.kind] || 0) + 1;
      } catch (e) { sum.errors++; }
    }
    // the glitch spots
    const GD = path.join(OUT, 'glitch'), gl = [], gData = [];
    if (fs.existsSync(GD)) {
      const gf = fs.readdirSync(GD).filter(f => f.endsWith('.json')), grids = gf.filter(f => f !== 'summary.json' && f !== 'stays.json');
      const gb = grids.reduce((b, f) => { try { return b + fs.statSync(path.join(GD, f)).size; } catch (e) { return b; } }, 0);
      for (const f of gf) if (!grids.includes(f) || gb <= GRIDS_MAX) gl.push('glitch/' + f);
      sum.glitch = { files: gl.length, grids: grids.length, gridsBytes: gb, gridsIn: gb <= GRIDS_MAX };
    }
    for (const f of ['.admin/hints.json', '.admin/glitch']) if (fs.existsSync(path.join(DATA, f))) gData.push(f);
    fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(sum, null, 1));
    const name = `bf2-analysis-${sum.made.slice(0, 10)}-${site}.tar`, tar = path.join(OUT, name);
    const list = ['summary.json', 'rounds', ...['failed.json', 'run.json', 'auto.json', 'auto-note.json'].filter(f => fs.existsSync(path.join(OUT, f))), ...gl];
    const ex = path.join(OUT, '.pack-exclude'); fs.writeFileSync(ex, left.map(f => 'rounds/' + f).concat(['*.part', '*.tmp']).join('\n') + '\n');
    // (the background run may be writing a round meanwhile: a file that changes or goes while it is read is no failure)
    try { execFileSync('tar', ['-cf', tar + '.part', '--warning=no-file-changed', '--warning=no-file-removed', '--ignore-failed-read', '-X', ex, '-C', OUT, ...list, ...(gData.length ? ['-C', DATA, ...gData] : [])], { stdio: ['ignore', 'ignore', 'pipe'] }); }
    catch (e) { if (e.status !== 1) throw new Error('tar: ' + String(e.stderr || e.message).trim().split('\n').pop()); }
    try { fs.unlinkSync(ex); } catch (e) {}
    fs.renameSync(tar + '.part', tar);
    const bytes = fs.statSync(tar).size;
    fs.writeFileSync(tar + '.json', JSON.stringify({ file: name, bytes, ...sum }, null, 1));
    fs.writeFileSync(PACKF, JSON.stringify({ ...st0, ended: new Date().toISOString(), file: name, bytes, rounds: files.length }));
    log(`archive: ${tar} (${(bytes / 2 ** 20).toFixed(1)} MB, ${files.length} rounds, site ${site}${left.length ? `; ${left.length} cop${left.length === 1 ? "y" : "ies"} of other rounds left out` : ''})`);
    return tar;
  } catch (e) {
    try { fs.writeFileSync(PACKF, JSON.stringify({ ...st0, ended: new Date().toISOString(), error: String(e.message || e).slice(0, 300) })); } catch (e2) {}
    throw e;
  }
}
if (has('--pack')) { try { pack(); } catch (e) { log('archive not made:', e.message); process.exit(1); } process.exit(0); }

// ---------- (v185, todo 226) the hints over every player's rounds ----------
// From the rounds done with the page's hint rules (HINTS_V): for each soldier on the field 60 s or more, which hints
// named him; everyone's share of soldier-rounds with each (data/.admin/hints.json) and each player's rounds with each,
// with up to 5 of the newest such rounds (data/.admin/hints/<nick slug>.json, nicks as the stats' own: the page's
// nickOf / nickSlug). A summary of each round file is kept in analysis/.hints-cache.json (by its time), so a run reads
// only the new ones.
const AUTO = has('--auto');
// (v212: function declarations - set before the module runs: pack() with --pack, above, uses pageHv; as consts they
// were not yet there - "Cannot access 'pageHv' before initialization", the admin page's "Make an archive")
function pageText() { return fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'); }
// (v196: the hint rules are the admins' part of the page - server/admin-round.js - no more in site/index.html)
function admText() { try { return fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'admin-round.js'), 'utf8'); } catch (e) { return ''; } }
// (v227) with the site's hint thresholds: HINTS_V.<hash> while they differ from the recommended (hintcfg.mjs) - a new set
// sends every round through again
function pageHv() { const v = +((/const HINTS_V = (\d+)/.exec(admText() || pageText()) || [])[1] || 0); return v ? htSiteHv(v, DATA, path.join(path.dirname(new URL(import.meta.url).pathname), 'admin-round.js')) : v; }
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
// (v225) the decoder of the round's .bfr a file was worked out from ('' not known): a round decoded again since by a new
// decoder (v225: where a soldier looks - the head's way, not the body's) is looked at again, as for new hint rules
const decOf = f => { const I = hvLoad(), k = '@' + f; if (I[k] !== undefined) return I[k]; let v = ''; try { v = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RDIR, f)))).round?.decoder || ''; } catch (e) {} return (I[k] = v); };
const NOT_SUS = new Set(['tk', 'claycap', 'clay', 'idle', 'spotspam', 'outside', 'teamsw', 'tkrev', 'prone', 'bhop', 'afkbot']);   // (v214: + the new rule ones)
// (v214, todo 265: a suspicion score on the player card) log10 of P(X >= k), X ~ Binomial(n, p), summed in logs
function tail10(k, n, p) {
  if (k <= 0) return 0; if (p <= 0) return -Infinity; if (p >= 1) return 0;
  const lp = Math.log(p), lq = Math.log(1 - p); let lc = 0, m = -Infinity; const L = [];
  for (let j = 1; j <= n; j++) { lc += Math.log((n - j + 1) / j); if (j >= k) { const v = lc + j * lp + (n - j) * lq; L.push(v); if (v > m) m = v; } }
  let sm = 0; for (const v of L) sm += Math.exp(v - m); return Math.min(0, (m + Math.log(sm)) / Math.LN10);
}
const SCORE_KIND_MAX = 10, SCORE_MIN_ROUNDS = 10, NOT_SCORED = new Set([...NOT_SUS, 'thru']);
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
    if (!c || c.mt !== st.mtimeMs || c.cv !== 2) {
      try {
        const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RDIR, f)))); read++;
        const pc = Object.fromEntries((d.cols?.P || []).map((n, i) => [n, i])), byI = new Map(), pl = [];
        for (const r of d.P || []) { if ((r[pc.aliveS] || 0) < 60) continue; byI.set(r[pc.i], pl.length); pl.push(String(r[pc.name] || '').trim()); }
        const hc = new Map(); for (const h of d.H || []) { const j = byI.get(h.actor); if (j === undefined) continue; const k = j + '|' + h.kind; hc.set(k, (hc.get(k) || 0) + 1); }
        // (v186) the round's hints for admins (as the page's own count in "For admins": not the information ones, team kills,
        // claymores at a flag, idle, spot spam, out of bounds, unsure artillery) - its demo is kept for them (demos.mjs)
        const sus = [...new Set((d.H || []).filter(h => h && !h.info && !NOT_SUS.has(h.kind) && !(h.kind === 'arty' && !h.sure)).map(h => h.kind))];
        c = cache[f] = { cv: 2, mt: st.mtimeMs, hv: d.hv || 0, name: d.round?.name || d.name, date: d.meta?.date || '', pl, sus, h: [...hc].map(([k, n]) => { const [j, kind] = k.split('|'); return [+j, kind, n]; }) };
        hvLoad()[f] = d.hv || 0; hvLoad()['@' + f] = d.round?.decoder || '';
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
      let o = P.get(nick); if (!o) P.set(nick, o = { name, rounds: 0, k: {}, ex: {}, mon: {} }); o.rounds++;
      // (v214) by month: his rounds, and those with a hint that counts (not the rules' ones)
      const ym = String(c.date || '').slice(0, 7); if (ym) { const m = o.mon[ym] || (o.mon[ym] = [0, 0]); m[0]++; if (c.h.some(([j2, kind]) => j2 === j && !NOT_SCORED.has(kind))) m[1]++; }
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
  // (v214) the suspicion score: over each kind of hint he had, how unlikely his share of rounds with it is at everyone's
  // (log10 odds, the same as the card's lines), at most SCORE_KIND_MAX a kind, kinds under 1 in 10 left out; where he
  // stands among the players with SCORE_MIN_ROUNDS rounds or more
  for (const o of P.values()) {
    let v = 0; const top = [];
    for (const [kind, [n]] of Object.entries(o.k)) { if (NOT_SCORED.has(kind) || !kinds[kind] || !sr) continue; const lo = tail10(n, o.rounds, Math.max(1e-6, kinds[kind][0] / sr)); if (lo <= -1) { v += Math.min(SCORE_KIND_MAX, -lo); top.push([kind, Math.round(lo * 10) / 10]); } }
    o.score = Math.round(v * 10) / 10; o.top = top.sort((a, b) => a[1] - b[1]).slice(0, 4);
  }
  const ranked = [...P.values()].filter(o => o.rounds >= SCORE_MIN_ROUNDS).map(o => o.score).sort((a, b) => a - b);
  const pctOf = v => { let lo = 0, hi = ranked.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ranked[m] < v) lo = m + 1; else hi = m; } return ranked.length ? Math.round(lo / ranked.length * 1000) / 10 : null; };
  const qs = f => ranked.length ? ranked[Math.min(ranked.length - 1, Math.floor(ranked.length * f))] : null;
  const topList = [...P.entries()].filter(([, o]) => o.rounds >= SCORE_MIN_ROUNDS && o.score > 0).sort((a, b) => b[1].score - a[1].score).slice(0, 30).map(([nick, o]) => [nick, o.name, o.score, o.rounds, o.top.map(x => x[0])]);
  const SD = path.join(DATA, '.admin'), HD = path.join(SD, 'hints'); fs.mkdirSync(HD, { recursive: true });   // (v196: the admins' - admin.mjs hands them over after a login)
  const put = (f, v) => { const t = JSON.stringify(v); let old = null; try { old = fs.readFileSync(f, 'utf8'); } catch (e) {} if (old !== t) { fs.writeFileSync(f + '.tmp', t); fs.renameSync(f + '.tmp', f); return 1; } return 0; };
  let wrote = 0; const keep = new Set();
  for (const [nick, o] of P) { if (!Object.keys(o.k).length) continue; const fn = F.nickSlug(nick) + '.json'; keep.add(fn); wrote += put(path.join(HD, fn), { hv: HV, nick, name: o.name, rounds: o.rounds, k: o.k, ex: o.ex, score: { v: o.score, pct: o.rounds >= SCORE_MIN_ROUNDS ? pctOf(o.score) : null, of: ranked.length, top: o.top, mon: Object.entries(o.mon).sort().map(([k, v]) => [k, ...v]) } }); }
  for (const f of fs.readdirSync(HD)) if (f.endsWith('.json') && !keep.has(f)) { try { fs.unlinkSync(path.join(HD, f)); } catch (e) {} }
  put(path.join(SD, 'hints.json'), { hv: HV, at: new Date().toISOString(), rounds, soldierRounds: sr, players: P.size, kinds, scores: { n: ranked.length, minRounds: SCORE_MIN_ROUNDS, p50: qs(0.5), p90: qs(0.9), p99: qs(0.99), top: topList } });
  // (v186) every round looked at, with its hints for admins: which demos to keep (demos.mjs; ingest.mjs, the admin page)
  { const HR = {}; for (const c of Object.values(out)) if (c.name) HR[c.name] = c.sus || [];
    const t = path.join(DATA, '.hint-rounds.json'); try { fs.writeFileSync(t + '.tmp', JSON.stringify({ at: new Date().toISOString(), rounds: HR })); fs.renameSync(t + '.tmp', t); } catch (e) { log('hint rounds not written:', e.message); } }
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
// (v193) the admin page's say over the background run: analysis/.auto-set.json { paused: when, jobs: 0-16 } (either may be
// missing; v248: jobs - "boost", All rounds now of v193-v246, is no more: dropped when found); what a run did, for the
// admin page: analysis/auto-note.json { at, kind, msg, ... }
const SETF = path.join(OUT, '.auto-set.json'), NOTEF = path.join(OUT, 'auto-note.json');
const autoSet = () => { try { return JSON.parse(fs.readFileSync(SETF, 'utf8')) || {}; } catch (e) { return {}; } };
const autoSetPut = o => { try { const t = SETF + '.tmp'; fs.writeFileSync(t, JSON.stringify(o)); fs.renameSync(t, SETF); } catch (e) {} };
const note = (kind, msg, x = {}) => { if (!AUTO) return; try { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(NOTEF, JSON.stringify({ at: new Date().toISOString(), kind, msg, ...x })); } catch (e) {} };
// (v193) a run of this script still going (a pid in run.json of a run that ended without saying so may be another
// program's by now: it is this script only when its command line says so)
const alive = pid => { if (!pid) return false; try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('analyze.mjs'); } catch (e) { if (fs.existsSync('/proc/self')) return false; try { process.kill(pid, 0); return true; } catch (e2) { return false; } } };
const RUN_BUDGET = AUTO ? (+val('--budget', 0) || 95) * 60e3 : Infinity;
// (v248) how many rounds at once: --jobs N (for the whole run), else BF2R_ANALYZE_JOBS in /etc/bf2replay.conf, else the
// admin page's choice (analysis/.auto-set.json jobs; 0 = automatic), else automatic - the cores less two (the site and the
// decoding of new demos keep theirs; it runs at a low priority anyway), the memory at PAGE_GB a page (60% of it), at most
// 12; admin.mjs works it out the same way. Looked at again after each round and every 5 s: a change on the admin page
// takes effect at once - more pages are opened, or as many as are too many close after their round. Before v248: the
// background run 1 at once, analyze.sh and All rounds now the cores less one, at most 3
const JOBS_MAX = 16, PAGE_GB = 1.5;
const autoJobs = () => Math.max(1, Math.min(12, (os.cpus().length || 1) - 2, Math.floor(os.totalmem() * 0.6 / (PAGE_GB * 2 ** 30))));
const ARG_JOBS = Math.max(0, Math.floor(+val('--jobs', 0)) || 0), CONF_JOBS = Math.max(0, Math.floor(+opt('BF2R_ANALYZE_JOBS', '0')) || 0);
function jobsWanted() {
  if (ARG_JOBS) return Math.min(JOBS_MAX, ARG_JOBS);
  if (CONF_JOBS) return Math.min(JOBS_MAX, CONF_JOBS);
  const j = Math.floor(+autoSet().jobs) || 0; return j > 0 ? Math.min(JOBS_MAX, j) : autoJobs();
}
// (v185) a background run while analyze.sh's own run is going: left for the next time
if (AUTO) {
  if (opt('BF2R_HINTS', '1') === '0') { const m = 'BF2R_HINTS=0 (/etc/bf2replay.conf): the background analysis is off'; console.log(m); note('off', m); process.exit(0); }
  { const S = autoSet(); if (S.paused) { const m = 'paused on the admin page (since ' + S.paused + '): nothing done'; console.log(m); note('paused', m); process.exit(0); } }
  try { const ri = JSON.parse(fs.readFileSync(path.join(OUT, 'run.json'), 'utf8')); if (!ri.ended && alive(ri.pid)) { const m = 'a run of analyze.sh is going (pid ' + ri.pid + '): the background analysis waits'; console.log(m); note('waits', m, { pid: ri.pid }); process.exit(0); } } catch (e) { /* none, or it has ended */ }
  // (the glitch grids need no browser: done first, up to 150 new rounds a run - ~0.5 s each)
  try { os.setPriority(15); } catch (e) {}
  try { const g = glitchStep(+val('--glitch-rounds', 0) || 150); if (g) note('glitch', `glitch grids: ${g.done} rounds added${g.left ? `, ${g.left} to go` : ''}`, { glitch: g }); } catch (e) { log('glitch spots not done:', e.message); }
}

// ---------- Playwright ----------
const PW_DIR = path.join(ROOT, 'analyze');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(path.join(PW_DIR, 'browsers'))) process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(PW_DIR, 'browsers');
let chromium = null;
for (const base of [PW_DIR, path.dirname(new URL(import.meta.url).pathname), process.cwd()]) {
  try { chromium = createRequire(path.join(base, 'x.js'))('playwright').chromium; break; } catch (e) { /* next */ }
}
if (!chromium) {
  if (AUTO) { const m = 'the background analysis needs Playwright: sudo bash ' + path.join(path.dirname(new URL(import.meta.url).pathname), 'analyze.sh') + ' start (installs it, once)'; console.log(m); note('nopw', m); process.exit(0); }
  console.error('Playwright is not installed: run  sudo bash ' + path.join(path.dirname(new URL(import.meta.url).pathname), 'analyze.sh') + ' start (installs it, once)'); process.exit(2);
}

// ---------- what to do ----------
const MIN_P = +val('--min-players', 6), MAPS = val('--maps', '') ? new Set(val('--maps').split(',').map(s => s.trim().toLowerCase())) : null, SINCE = val('--since', '');
const LIMIT = +val('--limit', 0) || Infinity, TIMEOUT = (+val('--timeout', 900) || 900) * 1000, FRESH = has('--fresh');
const soldiers = r => r.sum?.players ?? (r.sum?.teams || []).reduce((s, t) => s + (t.players || 0), 0);
const mapOf = r => String(r.sum?.map || '').toLowerCase();
// the rounds that may be looked at (the list read again each time: v248 - a background run goes on over new rounds too),
// the newest first
function listed() {
  const L = (readRoundList(fs, path, DATA).rounds || []).filter(r => !r.empty && r.bfr && (!MAPS || MAPS.has(mapOf(r))) && (!SINCE || String(r.sum?.date || '') >= SINCE) && !(soldiers(r) < MIN_P));
  return L.sort((a, b) => String(b.sum?.date || '').localeCompare(String(a.sum?.date || '')));
}
fs.mkdirSync(RDIR, { recursive: true });
const pageVer = (/const APP_VERSION = '(v\d+)'/.exec(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8')) || [])[1] || '?';
const failedPath = path.join(OUT, 'failed.json'); let failed = {}; try { failed = JSON.parse(fs.readFileSync(failedPath, 'utf8')); } catch (e) { /* none yet */ }
// (v185) the background run's list: not done yet first, then done by older hint rules; the copies of other rounds never,
// nor a round that failed with this page (it would be tried again and again: again after the next update of the site),
// nor one being done now (busy: v248, the list is looked at again between batches)
function autoList(busy) {
  let copies = {}; try { copies = JSON.parse(fs.readFileSync(path.join(DATA, '.copies.json'), 'utf8')).copies || {}; } catch (e) {}
  const HV = pageHv(), none = [], old = [];
  let skipF = 0;
  for (const r of listed()) { if (copies[r.name] || busy.has(r.name)) continue; if (failed[r.name]?.page === pageVer) { skipF++; continue; } const f = path.basename(fileOf(r.name)); let have = false; try { have = fs.statSync(fileOf(r.name)).size > 0; } catch (e) {} if (!have) none.push(r); else if (String(hvOf(f)) !== String(HV) || (r.decoder && decOf(f) && !decSame(r.decoder, decOf(f), r.sum?.map))) old.push(r); }
  // (v225) while ingest.mjs decodes the rounds again for a new decoder (data/reprocess.json), the rounds it has done come
  // first: one not done yet would be looked at now and again once it is
  { let P = null; try { P = JSON.parse(fs.readFileSync(path.join(DATA, 'reprocess.json'), 'utf8')); } catch (e) {}
    if (P && P.hash && !P.end) { const L = r => r.decoder === P.hash ? 0 : 1; for (const A of [none, old]) A.sort((a, b) => L(a) - L(b)); } }
  hvSave(); return { none, old, skipF };
}
// (v248) the background run goes batch by batch: BATCH rounds a page at once, then the players' hint cards are written
// and the list is looked at again (rounds decoded meanwhile come first) - until none are left or the run's time is up
const BATCH = +val('--batch', 0) || 40;   // (--batch N: another size, for tests)
let queue;
if (AUTO) {
  { const S = autoSet(); if (S.boost) { delete S.boost; autoSetPut(S); } }   // (v248: All rounds now is no more)
  const L = autoList(new Set());
  if (!L.none.length && !L.old.length) {
    aggHints(); const m = `nothing to do: every round is done with the hint rules now${L.skipF ? ` (${L.skipF} failed with this version of the site: tried again after its next update)` : ''}`; log(m); note('done', m, { queued: 0, failed: L.skipF }); process.exit(0);
  }
  log(`${L.none.length} rounds not looked at yet, ${L.old.length} done with older hint rules`);
  queue = L.none.concat(L.old).slice(0, BATCH * jobsWanted());
} else {
  queue = listed();
  if (!FRESH) queue = queue.filter(r => { try { return !fs.statSync(fileOf(r.name)).size; } catch (e) { return true; } });
  queue = queue.slice(0, LIMIT);
}
const JOBS = jobsWanted();
log(`${queue.length} rounds to analyse${AUTO ? ' in the first batch' : ''} (page ${pageVer}, ${JOBS} at once${ARG_JOBS ? ' (--jobs)' : CONF_JOBS ? ' (BF2R_ANALYZE_JOBS)' : ''}; ${MIN_P}+ soldiers${MAPS ? ', maps ' + [...MAPS].join(',') : ''}${SINCE ? ', since ' + SINCE : ''}) -> ${RDIR}`);
try { os.setPriority(15); } catch (e) { /* not allowed: as it is */ }
if (!queue.length) { if (!has('--no-pack')) pack(); process.exit(0); }
const RUNF = path.join(OUT, AUTO ? 'auto.json' : 'run.json');   // (v185: the background run its own, so a manual run is told apart)

// ---------- the site's files, served to the browser here ----------
const HERE_DIR = path.dirname(new URL(import.meta.url).pathname);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (u.endsWith('/')) u += 'index.html';
  // (v196) the admins' part of the page and the analysis's private files, as admin.mjs hands them to a logged-in admin
  const PRIV = path.join(DATA, '.admin'), adm = u === '/admin/api/admin.js', priv = u.startsWith('/admin/api/data/');
  const base = adm ? HERE_DIR : priv ? PRIV : u.startsWith('/data/') ? DATA : SITE, rel = adm ? 'admin-round.js' : priv ? u.slice(16) : u.startsWith('/data/') ? u.slice(6) : u.slice(1);
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
  page._n = 0; page._map = ''; return page;
}
// (v182: the timer cleared when the round is done - before, each one held the run open for up to --timeout after the last
// round, past systemd's time to stop: "State 'stop-sigterm' timed out. Killing")
const withTimeout = (p, ms, what) => { let tm; return Promise.race([p, new Promise((_, rej) => { tm = setTimeout(() => rej(new Error(what + ': over ' + Math.round(ms / 1000) + ' s')), ms); })]).finally(() => clearTimeout(tm)); };
// (v248) how fast each number of rounds at once went on this machine (the admin page: pick the best) - per number, the
// rounds done while that many pages ran side by side from their start to their end (the start and end of a run, and a
// change of the number, left out) and the seconds each took; the machine's cores and memory with it (another machine:
// counted from scratch). analysis/.jobs-stats.json, as ingest.mjs's data/.ingest-stats.json for the decoding
const STATSF = path.join(OUT, '.jobs-stats.json'), MACHINE = `${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB`;
function speedAdd(jobs, secs) {
  let S = null; try { S = JSON.parse(fs.readFileSync(STATSF, 'utf8')); } catch (e) {}
  if (!S || S.machine !== MACHINE) S = { machine: MACHINE, by: {}, since: new Date().toISOString() };
  const o = S.by[jobs] || (S.by[jobs] = { n: 0, secs: 0 }); o.n++; o.secs = +(o.secs + secs).toFixed(2); o.last = new Date().toISOString();
  try { fs.writeFileSync(STATSF + '.tmp', JSON.stringify(S)); fs.renameSync(STATSF + '.tmp', STATSF); } catch (e) {}
}
let done = 0, kills = 0, hints = 0, total = queue.length, batch = 1, running = 0, hvSavedAt = Date.now(); const started = Date.now();
const busy = new Set();   // (the rounds being done now: left out when the list is looked at again)
const runInfo = { started: new Date().toISOString(), pid: process.pid, page: pageVer, jobs: JOBS, running: 0, rounds: total, batch, host: os.hostname(), mem: os.totalmem(), cpus: os.cpus().length, done: 0 };
const writeRun = () => { try { fs.writeFileSync(RUNF, JSON.stringify(runInfo, null, 1)); } catch (e) {} };   // (v193: how far, for the admin page)
writeRun();
let stopping = false, outOfTime = false, told = '', updated = false;
// (v248) a background run that sees the site updated (git pull: a new page, new hint rules, a new analyze.mjs) takes no
// more rounds: those being done are finished, and the next run - 5 minutes later - is the new code (a run now goes on
// for up to 95 minutes, batch after batch)
const SELF = new URL(import.meta.url).pathname;
const stamp = () => [path.join(SITE, 'index.html'), path.join(HERE_DIR, 'admin-round.js'), SELF].map(f => { try { return fs.statSync(f).mtimeMs; } catch (e) { return 0; } }).join(':');
const STAMP0 = stamp();
// (v193) a background run takes new rounds while the admin page says nothing else and its time is not up
const goOn = () => {
  if (stopping) return false;
  if (!AUTO) return true;
  if (updated || stamp() !== STAMP0) { if (!updated) log('the site was updated: no more rounds this run (the next one has the new code)'); updated = true; return false; }
  if (Date.now() - started > RUN_BUDGET) { if (!outOfTime) log(`${Math.round(RUN_BUDGET / 60e3)} minutes: the rest in the next run`); outOfTime = true; return false; }
  const S = autoSet();
  if (S.paused) { if (told !== 'p') log('paused on the admin page: the rounds being done are finished first'); told = 'p'; return false; }
  return true;
};
// (v248) the background run's next batch: the players' hint cards written with what is done so far, the list looked at
// again (rounds decoded meanwhile first), BATCH rounds a page at once
function refill() {
  if (!AUTO || !goOn() || done + busy.size >= LIMIT) return false;
  const L = autoList(busy), all = L.none.concat(L.old); if (!all.length) return false;   // (the last pages finish theirs; the cards are written at the end)
  try { aggHints(); } catch (e) { log('hints not written:', e.message); }
  queue = all.slice(0, Math.min(BATCH * jobsWanted(), LIMIT - done - busy.size)); batch++; total += queue.length;
  runInfo.rounds = total; runInfo.batch = batch; writeRun();
  log(`batch ${batch}: ${queue.length} round${queue.length === 1 ? '' : 's'} (${L.none.length} not looked at yet, ${L.old.length} with older hint rules)`);
  return true;
}
// (v248) a page takes the next round of the map it has open when the batch has one: the map's sight lines, shapes and
// trees are loaded and worked out once a page, not again for each other map in between
function take(map) {
  if (!queue.length && !refill()) return null;
  const k = map ? queue.findIndex(r => mapOf(r) === map) : -1;
  return queue.splice(k < 0 ? 0 : k, 1)[0];
}
process.on('SIGTERM', () => { stopping = true; log('stopping after the rounds being done (SIGTERM)'); }); process.on('SIGINT', () => { stopping = true; log('stopping after the rounds being done'); });
// one page: round after round while there are rounds and the run goes on; (v248) it closes when more pages are open than
// are wanted now
async function worker() {
  running++; runInfo.running = running; let page = null;
  for (;;) {
    if (!goOn() || running > jobsWanted()) break;
    const r = take(page?._map); if (!r) break;
    const t0 = Date.now(), n0 = running, full = n0 === jobsWanted(); busy.add(r.name);
    try {
      if (!page || page._n >= PER_PAGE) { if (page) await page.context().close().catch(() => {}); page = await newPage(r.name); }
      page._errs = [];
      const ok = await withTimeout(page.evaluate(n => window.__bf2analyze.open(n), r.name), TIMEOUT, 'opening');
      if (ok !== true) throw new Error('open: ' + ok);
      const d = await withTimeout(page.evaluate(s => window.__bf2analyze.dump(s), Math.round(TIMEOUT / 1000) - 30), TIMEOUT, 'analysing');
      if (!d || d.error) throw new Error(d ? d.error : 'no numbers');
      d.round = { name: r.name, decoder: r.decoder || null, bytes: r.bytes || null, sum: r.sum ? { ...r.sum, P: undefined, top: undefined } : null }; d.pageErrors = page._errs; d.wallMs = Date.now() - t0; d.jobs = n0;
      fs.writeFileSync(fileOf(r.name) + '.part', zlib.gzipSync(JSON.stringify(d), { level: 9 })); fs.renameSync(fileOf(r.name) + '.part', fileOf(r.name));
      hvLoad()[path.basename(fileOf(r.name))] = d.hv || 0; hvLoad()['@' + path.basename(fileOf(r.name))] = r.decoder || '';
      await alertRound(d);   // (v214: its hints to the server's admin channel, when it has one and the round is new)
      delete failed[r.name]; page._n++; page._map = mapOf(r); done++; kills += d.K.length; hints += d.H.length;
      if (full && running === n0 && jobsWanted() === n0) speedAdd(n0, d.wallMs / 1000);   // (ran with that many beside it to the end)
      runInfo.done = done; writeRun();
      if (Date.now() - hvSavedAt > 10e3) { hvSave(); hvSavedAt = Date.now(); }   // (v248: the admin page's bar goes on during a run of 95 min, not batch by batch)
      const left = (Date.now() - started) / 1000 / done * (queue.length + busy.size - 1), of = AUTO ? `batch ${batch}, ${queue.length} left in it` : `${done}/${total} ${Math.round(done / total * 100)}%`;
      log(`[${AUTO ? done + ' done, ' + of : of}${!AUTO ? `, ~${left > 3600 ? Math.floor(left / 3600) + ' h ' : ''}${Math.round(left % 3600 / 60)} min left` : ''}] ${r.name} ${(d.wallMs / 1000).toFixed(1)} s, ${d.K.length} kills, ${d.H.length} hints${d.errs.length ? ', ' + d.errs.length + ' errors' : ''}${n0 > 1 ? ` (${n0} at once)` : ''}`);
    } catch (e) {
      if (stopping && !fs.existsSync(fileOf(r.name))) { log(`left for the next run: ${r.name}`); busy.delete(r.name); break; }
      failed[r.name] = { at: new Date().toISOString(), page: pageVer, error: String(e.message || e).slice(0, 500) };
      log(`failed ${r.name}: ${failed[r.name].error}`);
      if (page) { await page.context().close().catch(() => {}); page = null; }
    }
    busy.delete(r.name);
    try { fs.writeFileSync(failedPath, JSON.stringify(failed, null, 1)); } catch (e) {}
  }
  running--; runInfo.running = running;
  if (page) await page.context().close().catch(() => {});
}
// (v248) the pages: as many as wanted (looked at again every 5 s - more are opened at once when the number goes up), until
// the last one has closed
await new Promise(resolve => {
  const live = new Set(); let tick = null;
  const spawn = () => { const p = worker().catch(e => log('a page stopped:', e.message)).finally(() => { live.delete(p); if (!live.size) { pump(); if (!live.size) { clearInterval(tick); resolve(); } } }); live.add(p); };
  const pump = () => {
    const want = jobsWanted();
    if (want !== runInfo.jobs) { log(`${want} at once now (was ${runInfo.jobs})`); runInfo.jobs = want; writeRun(); }
    while (running < want && queue.length && goOn()) spawn();
  };
  pump(); if (!live.size) { resolve(); return; } tick = setInterval(pump, 5000);
});
await browser.close().catch(() => {}); server.closeAllConnections?.(); server.close();
runInfo.ended = new Date().toISOString(); runInfo.done = done; runInfo.failed = Object.keys(failed).length; runInfo.kills = kills; runInfo.hints = hints; runInfo.running = 0;
writeRun(); hvSave();
log(`done: ${done} rounds (${kills} kills, ${hints} hints), ${Object.keys(failed).length} failed, ${Math.round((Date.now() - started) / 60000)} min`);
if (AUTO) {
  const failedNow = Object.values(failed).filter(f => f.at >= runInfo.started).length;
  let rest = 0; try { const L = autoList(new Set()); rest = L.none.length + L.old.length; } catch (e) {}
  const ms = Date.now() - started, took = ms >= 60e3 ? `${Math.round(ms / 60e3)} min` : `${Math.round(ms / 1e3)} s`;
  const why = updated ? ' (the site was updated: the next run, with the new code, goes on)' : outOfTime ? ' (the time of a run was up: the next run goes on)' : told === 'p' ? ' (paused on the admin page)' : stopping ? ' (stopped)' : '';
  note('ran', `${done} round${done === 1 ? '' : 's'} done${failedNow ? `, ${failedNow} failed` : ''} in ${took}, ${runInfo.jobs} at once${rest > 0 ? ` · ${rest} to go${why}` : ' · all done'}`, { done, failed: failedNow, queued: rest, jobs: runInfo.jobs, secs: Math.round(ms / 1000), stopped: stopping || undefined });
  try { aggHints(); } catch (e) { log('hints not written:', e.message); }
  process.exit(0);
}
// (v182) the archive also when stopped (analyze.sh stop): what is done so far, ready to send; started again, the run goes on
if (!has('--no-pack')) { if (stopping) log('stopped: the archive of the rounds done so far'); try { pack(); } catch (e) { log('archive not made:', e.message); } }
process.exit(0);   // (nothing left to wait for)
