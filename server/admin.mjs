#!/usr/bin/env node
// BF2 Round Replay - the admin page (https://<site>/admin): behind a password, it shows where the server stands (rounds,
// the decoder, the demos waiting to be decoded, decoding again after an update, the services, the disk) and does what
// otherwise needs a shell on the VPS: decode the waiting demos now, decode old rounds again (or all), try the demos that
// failed again, fetch new demos now, update from GitHub, back up; add and remove game servers / demo pages to fetch from
// (and check one first); where new rounds are posted (Discord / Telegram: notify.mjs); how many demos are decoded at once
// (v162: data/.ingest.json, with how fast each number went - to pick the best for this machine); read the services'
// logs. (v186) Which old demos ingest.mjs removes to save room (data/.demos.json, demos.mjs: their rounds stay), with what
// would go before it is saved, the demos to keep whatever the rest says, and the copies of rounds (data/.copies) removed on
// request. Nothing here deletes a round.
//
//   node admin.mjs                  the admin server (bf2replay-admin.service, as bf2replay): http://127.0.0.1:8781,
//                                   Caddy sends /admin* to it
//   sudo node admin.mjs --set-password
//                                   set (or change) the password: asked twice, kept only as a scrypt hash in
//                                   /etc/bf2replay-admin.json (root:bf2replay, 640); no restart needed
//
// The services are started with "sudo -n systemctl start --no-block bf2replay-<x>.service", which units.sh allows the
// bf2replay user for exactly these services (/etc/sudoers.d/bf2replay-admin); the logs come from journalctl (the service
// runs in the systemd-journal group). Game servers added here go to data/.fetch-sources.json, which fetch.mjs reads
// next to BF2R_FETCH_URLS from /etc/bf2replay.conf (those stay as they are: edited there).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { notifySettings, saveNotify, DISCORD_RE, TG_TOKEN_RE, TG_CHAT_RE, POST_ITEMS, postTexts } from './notify.mjs';
import { expandIndex } from './roundsidx.mjs';
import { demoPolicy, demoPlan, hintRounds, sourceList, linkId, DEMOS_FILE, DEMOS_LAST_FILE, REFETCH_FILE } from './demos.mjs';

const conf = {};
try { for (const line of fs.readFileSync('/etc/bf2replay.conf', 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/.exec(line); if (m) conf[m[1]] = m[2]; } } catch (e) { /* no file: defaults */ }
const opt = (k, d) => process.env[k] ?? conf[k] ?? d;
const ROOT = opt('BF2R_ROOT', '/srv/bf2replay'), SITE = path.join(ROOT, 'site'), DATA = path.join(ROOT, 'data'), INC = path.join(ROOT, 'upload', 'incoming');
const BAD = path.join(DATA, 'bad'), SOURCES = path.join(DATA, '.fetch-sources.json');
const JOBS_FILE = path.join(DATA, '.ingest.json'), STATS_FILE = path.join(DATA, '.ingest-stats.json'), NOW_FILE = path.join(DATA, '.ingest-now.json'), JOBS_MAX = 16;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const PASS_FILE = opt('BF2R_ADMIN_PASS_FILE', '/etc/bf2replay-admin.json');
const PORT = +opt('BF2R_ADMIN_PORT', '8781'), HOST = '127.0.0.1';
const SYSTEMCTL = opt('BF2R_ADMIN_SYSTEMCTL', fs.existsSync('/usr/bin/systemctl') ? '/usr/bin/systemctl' : '/bin/systemctl');
const SUDO = opt('BF2R_ADMIN_SUDO', '/usr/bin/sudo'), JOURNALCTL = opt('BF2R_ADMIN_JOURNALCTL', 'journalctl');
const NODE = process.execPath;
const UNITS = ['ingest', 'reprocess', 'rebuild', 'fetch', 'update', 'backup', 'hints'];   // (the ones the page may start)
const STOPPABLE = ['ingest', 'reprocess', 'rebuild'];   // (v163: and stop - the decoding ones; units.sh allows it)
const SESSION_H = 12, IDLE_H = 2;   // a login lasts 12 h, or 2 h without a look at the page
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

// ---------- the password: scrypt, kept as { salt, hash, N, r, p } ----------
const KDF = { N: 2 ** 15, r: 8, p: 1, len: 64 };
const kdf = (pw, salt, k = KDF) => crypto.scryptSync(String(pw).normalize('NFC'), Buffer.from(salt, 'base64'), k.len, { N: k.N, r: k.r, p: k.p, maxmem: 256 * k.N * k.r });
function readPass() { try { const j = JSON.parse(fs.readFileSync(PASS_FILE, 'utf8')); return j && j.salt && j.hash ? j : null; } catch (e) { return null; } }
function checkPass(pw) {
  const j = readPass(); if (!j || typeof pw !== 'string' || pw.length > 200) return false;
  const want = Buffer.from(j.hash, 'base64'), got = kdf(pw, j.salt, { N: j.N || KDF.N, r: j.r || KDF.r, p: j.p || KDF.p, len: want.length });
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
async function setPassword() {
  const ask = async q => {
    if (!process.stdin.isTTY) { let s = ''; for await (const c of process.stdin) s += c; return s.replace(/\r?\n$/, ''); }
    process.stdout.write(q); process.stdin.setRawMode(true); let s = '';
    return await new Promise(ok => { const on = b => { for (const ch of b.toString('utf8')) { if (ch === '\r' || ch === '\n') { process.stdin.setRawMode(false); process.stdin.off('data', on); process.stdin.pause(); process.stdout.write('\n'); ok(s); return; } if (ch === '\u0003') process.exit(1); if (ch === '\u007f') s = s.slice(0, -1); else s += ch; } }; process.stdin.on('data', on); process.stdin.resume(); });
  };
  const a = await ask('New admin password: ');
  if (process.stdin.isTTY) { const b = await ask('Again: '); if (a !== b) { console.error('The two did not match: nothing changed.'); process.exit(1); } }
  if (a.length < 8) { console.error('At least 8 characters, please: nothing changed.'); process.exit(1); }
  const salt = crypto.randomBytes(16).toString('base64'), rec = { salt, hash: kdf(a, salt).toString('base64'), N: KDF.N, r: KDF.r, p: KDF.p, set: new Date().toISOString() };
  const tmp = PASS_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(rec) + '\n', { mode: 0o640 }); fs.renameSync(tmp, PASS_FILE);
  try { const gid = +(await run('id', ['-g', 'bf2replay'])).out.trim(); if (Number.isInteger(gid)) fs.chownSync(PASS_FILE, 0, gid); } catch (e) {}
  console.log(`Password set (${PASS_FILE}). Log in at https://<your site>/admin`);
}

// ---------- logins: a random token in an HttpOnly cookie; brute force held off per address and overall ----------
const sessions = new Map();   // token -> { exp, seen, ip }
const fails = new Map();      // ip -> [times]
let allFails = [];
const FAIL_N = 5, FAIL_WIN = 15 * 60e3, ALL_N = 30, ALL_WIN = 60 * 60e3;
const clientIp = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
function blocked(ip) {
  const now = Date.now(); allFails = allFails.filter(t => now - t < ALL_WIN);
  const L = (fails.get(ip) || []).filter(t => now - t < FAIL_WIN); fails.set(ip, L);
  if (L.length >= FAIL_N) return Math.ceil((L[0] + FAIL_WIN - now) / 60e3);
  if (allFails.length >= ALL_N) return Math.ceil((allFails[0] + ALL_WIN - now) / 60e3);
  return 0;
}
const cookieOf = req => { const m = /(?:^|;\s*)bf2r_admin=([A-Za-z0-9_-]{20,})/.exec(req.headers.cookie || ''); return m ? m[1] : null; };
function sessionOf(req) {
  const tok = cookieOf(req), s = tok && sessions.get(tok), now = Date.now();
  if (!s) return null;
  if (now > s.exp || now - s.seen > IDLE_H * 3600e3) { sessions.delete(tok); return null; }
  s.seen = now; return { tok, ...s };
}
const secure = req => String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
const setCookie = (req, res, tok, maxAge) => res.setHeader('Set-Cookie', `bf2r_admin=${tok}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure(req) ? '; Secure' : ''}`);

// ---------- helpers ----------
function run(cmd, args, { timeout = 20e3, cwd } = {}) {
  return new Promise(ok => execFile(cmd, args, { timeout, cwd, maxBuffer: 4 * 2 ** 20, env: process.env }, (err, out, errOut) => ok({ code: err ? (err.code ?? 1) : 0, out: String(out || ''), err: String(errOut || '') + (err && err.killed ? '\n(stopped: took too long)' : '') })));
}
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const writeJson = (f, v) => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v, null, 1) + '\n'); fs.renameSync(tmp, f); };
const listDir = d => { try { return fs.readdirSync(d); } catch (e) { return []; } };
const demoFiles = d => listDir(d).filter(f => /\.bf2demo(\.gz)?$/i.test(f));
const sizeOf = f => { try { return fs.statSync(f).size; } catch (e) { return 0; } };

// the site's decoder hash (as ingest.mjs makes it), cached by the page's modification time
let decCache = { mt: 0, hash: '?', ver: '?' };
function siteDecoder() {
  const f = path.join(SITE, 'index.html'); let mt = 0; try { mt = fs.statSync(f).mtimeMs; } catch (e) { return decCache; }
  if (mt === decCache.mt) return decCache;
  let hash = '?', ver = '?';
  try { ver = readJson(path.join(SITE, 'version.json'), {}).v || '?'; } catch (e) {}
  try {
    const html = fs.readFileSync(f, 'utf8'), L = html.split('\n');
    if (ver === '?') ver = (/const APP_VERSION = '(v\d+)'/.exec(html) || [])[1] || '?';
    const g = L.find(l => l.startsWith('const GAME = ')), a = L.findIndex(l => l.startsWith('// @worker-begin')), b = L.findIndex(l => l.startsWith('// @worker-end'));
    const k0 = html.indexOf('function killCause('), k1 = html.indexOf('\n}\n', k0);
    hash = crypto.createHash('sha1').update(g).update(L.slice(a, b).join('\n')).update(html.slice(k0, k1 + 2)).digest('hex').slice(0, 10);
  } catch (e) {}
  return (decCache = { mt, hash, ver });
}
// the round list, cached by its modification time (v176: data/.rounds-full.json - rounds.json is compact; it only when
// the whole list is not there)
let idxCache = { mt: 0, f: '', d: null };
function index() {
  let f = path.join(DATA, '.rounds-full.json'), mt = 0;
  try { mt = fs.statSync(f).mtimeMs; } catch (e) { f = path.join(DATA, 'rounds.json'); try { mt = fs.statSync(f).mtimeMs; } catch (e2) { return { rounds: [] }; } }
  if (mt !== idxCache.mt || f !== idxCache.f) idxCache = { mt, f, d: expandIndex(readJson(f, { rounds: [] })) };
  return idxCache.d || { rounds: [] };
}
// the services: systemctl show (works without root)
async function units() {
  const names = UNITS.map(u => `bf2replay-${u}.service`).concat(['bf2replay-fetch.timer', 'bf2replay-backup.timer', 'bf2replay-hints.timer', 'bf2replay-update.timer', 'bf2replay-ingest.path']);
  const r = await run(SYSTEMCTL, ['show', '--no-pager', '-p', 'Id,ActiveState,SubState,Result,ExecMainStartTimestamp,ExecMainExitTimestamp,NextElapseUSecRealtime,LastTriggerUSec,LoadState', ...names]);
  const out = {};
  for (const block of r.out.split(/\n\s*\n/)) {
    const o = {}; for (const line of block.split('\n')) { const i = line.indexOf('='); if (i > 0) o[line.slice(0, i)] = line.slice(i + 1); }
    if (o.Id) out[o.Id.replace(/^bf2replay-/, '')] = { state: o.ActiveState, sub: o.SubState, result: o.Result, loaded: o.LoadState, started: o.ExecMainStartTimestamp || null, ended: o.ExecMainExitTimestamp || null, next: o.NextElapseUSecRealtime || null, last: o.LastTriggerUSec || null };
  }
  return { units: out, ok: r.code === 0 || Object.keys(out).length > 0 };
}
// the demo sources: BF2R_FETCH_URLS (from /etc/bf2replay.conf) and the ones added here
const envSources = () => opt('BF2R_FETCH_URLS', '').split(/[\s,]+/).filter(Boolean);
const addedSources = () => { const j = readJson(SOURCES, null); return Array.isArray(j?.sources) ? j.sources.filter(s => s && typeof s.url === 'string') : []; };
const SOURCE_RE = /^(https?:\/\/[^\s"'<>]{3,300}|[A-Za-z0-9][A-Za-z0-9.-]{0,252}(:\d{1,5})?)$/;
// what was fetched from each host (data/.fetched.json)
function fetchedByHost() {
  const seen = readJson(path.join(DATA, '.fetched.json'), {}), by = {};
  for (const [k, v] of Object.entries(seen || {})) {
    if (!v || v.skipped) continue; let h = ''; try { h = new URL(v.from || k).host; } catch (e) { h = '?'; }
    const o = by[h] || (by[h] = { n: 0, bytes: 0, last: null }); o.n++; o.bytes += v.bytes || 0; if (v.at && (!o.last || v.at > o.last)) o.last = v.at;
  }
  return by;
}

async function state() {
  const dec = siteDecoder(), idx = index(), R = idx.rounds || [];
  const cur = R.filter(r => r.decoder === dec.hash).length, servers = {};
  for (const r of R) { const s = r.server || r.sum?.server || '?'; servers[s] = (servers[s] || 0) + 1; }
  const newest = R.reduce((b, r) => !b || (r.added || '') > (b.added || '') ? r : b, null);
  const inc = listDir(INC), incDemos = inc.filter(f => /\.bf2demo(\.gz)?$/i.test(f)), parts = inc.filter(f => f.endsWith('.part'));
  const bad = demoFiles(BAD);
  let disk = null; try { const st = fs.statfsSync(DATA); disk = { free: st.bavail * st.bsize, total: st.blocks * st.bsize }; } catch (e) {}
  const u = await units();
  const settings = Object.fromEntries(Object.keys({ ...conf, ...process.env }).filter(k => /^BF2R_/.test(k) && !/PASS/.test(k)).sort().map(k => [k, /TOKEN|WEBHOOK|SECRET|KEY/.test(k) && opt(k, '') ? '(set: not shown)' : opt(k, '')]));
  return {
    now: new Date().toISOString(), site: { version: dec.ver, decoder: dec.hash },
    rounds: { total: R.length, current: cur, old: R.length - cur, servers, newest: newest ? { name: newest.name, added: newest.added || null } : null },
    reprocess: idx.reprocess || null, lastReprocess: readJson(path.join(DATA, 'reprocess.json'), null),
    queue: { demos: incDemos.length, bytes: incDemos.reduce((s, f) => s + sizeOf(path.join(INC, f)), 0), parts: parts.length, files: incDemos.sort().slice(0, 12) },
    bad: { demos: bad.length, files: bad.sort().slice(-12) },
    units: u.units, systemd: u.ok, fetchLast: readJson(path.join(DATA, '.fetch-last.json'), null), disk,
    sources: { env: envSources(), added: addedSources(), fetched: fetchedByHost() },
    settings, password: !!readPass(), notify: notifyState(), decode: decodeState(), demos: demoState(), analysis: analysisState()
  };
}
// (v162) how many demos ingest.mjs decodes at once: BF2R_JOBS from /etc/bf2replay.conf when set (it wins), else the
// number chosen here (data/.ingest.json; 0 = automatic), else automatic - the cores, the memory at ~1.2 GB a demo, at
// most 4 (as ingest.mjs works it out). With the machine, what is being decoded now and how fast each number went
const autoJobs = () => Math.min(4, os.cpus().length || 1, Math.max(1, Math.floor(os.totalmem() / (1.2 * 2 ** 30))));
function memAvailable() { try { const m = /MemAvailable:\s+(\d+) kB/.exec(fs.readFileSync('/proc/meminfo', 'utf8')); if (m) return +m[1] * 1024; } catch (e) {} return os.freemem(); }
function decodeState() {
  const conf = Math.max(0, Math.floor(+opt('BF2R_JOBS', '0')) || 0), set = Math.max(0, Math.floor(+readJson(JOBS_FILE, {})?.jobs) || 0), auto = autoJobs();
  let now = readJson(NOW_FILE, null);
  if (now && !(now.pid && fs.existsSync('/proc/' + now.pid) && Date.now() - Date.parse(now.updated || 0) < 30 * 60e3)) now = null;   // (left behind by a run that was stopped)
  const cpus = os.cpus();
  return { conf: conf || null, set, auto, jobs: Math.min(JOBS_MAX, conf || set || auto), max: JOBS_MAX, cpus: cpus.length, cpu: String(cpus[0]?.model || '').replace(/\s+/g, ' ').trim(),
    mem: os.totalmem(), avail: memAvailable(), load: os.loadavg().map(x => +x.toFixed(2)), now, stats: readJson(STATS_FILE, null), procs: procs() };
}
// (v163) the decoding runs now, from /proc: each ingest.mjs (node) - new demos, again (--reprocess) or all again
// (--rebuild) - since when, and whether it started before the last update (the old code: the site or ingest.mjs is newer
// than it); and the flock in front of each (the services run "flock -w 7200 .ingest.lock node ingest.mjs"): one with no
// ingest.mjs under it yet is waiting for the lock - another run has it
function procs() {
  let boot = 0; try { boot = +((/^btime (\d+)/m.exec(fs.readFileSync('/proc/stat', 'utf8')) || [])[1] || 0); } catch (e) { return null; }
  if (!boot) return null;
  const HZ = 100, L = [];
  for (const pid of listDir('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    let cmd = []; try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean); } catch (e) { continue; }
    const i = cmd.findIndex(a => /(^|\/)ingest\.mjs$/.test(a)); if (i < 0) continue;
    let st = ''; try { st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); } catch (e) { continue; }
    const f = st.slice(st.lastIndexOf(')') + 2).split(' ');   // (from the 3rd field on: state, ppid, ... starttime is the 22nd)
    const args = cmd.slice(i + 1), kind = args.includes('--rebuild') ? 'rebuild' : args.includes('--reprocess') ? 'reprocess' : 'ingest';
    L.push({ pid: +pid, ppid: +f[1], start: boot + +f[19] / HZ, flock: /(^|\/)flock$/.test(cmd[0]), kind });
  }
  const mt = fl => { try { return fs.statSync(fl).mtimeMs / 1000; } catch (e) { return 0; } }, upd = Math.max(mt(path.join(SITE, 'index.html')), mt(path.join(HERE, 'ingest.mjs')));
  const runs = L.filter(p => !p.flock), out = [];
  for (const p of runs) out.push({ kind: p.kind, pid: p.pid, since: new Date(p.start * 1000).toISOString(), old: upd > 0 && p.start < upd - 1 });
  for (const p of L.filter(p => p.flock && !runs.some(r => r.ppid === p.pid))) out.push({ kind: p.kind, pid: p.pid, since: new Date(p.start * 1000).toISOString(), waiting: true });
  return out.sort((a, b) => !!a.waiting - !!b.waiting || a.since.localeCompare(b.since));
}
function jobsSet(b) {
  if (b.reset) { const S = readJson(STATS_FILE, null); writeJson(STATS_FILE, { machine: S?.machine || '', by: {}, since: new Date().toISOString() }); log('decoding speeds cleared'); return { ok: true, msg: 'speeds cleared: they are measured again from the next demos' }; }
  const n = Math.floor(+b.jobs); if (!(n >= 0 && n <= JOBS_MAX)) return { ok: false, msg: `0 (automatic) to ${JOBS_MAX}` };
  writeJson(JOBS_FILE, { jobs: n, set: new Date().toISOString() }); log('demos decoded at once:', n || 'automatic');
  const conf = Math.max(0, Math.floor(+opt('BF2R_JOBS', '0')) || 0);
  return { ok: true, msg: (n ? `${n} at once` : `automatic (${autoJobs()} at once here)`) + (conf ? ` - but BF2R_JOBS=${conf} in /etc/bf2replay.conf wins: remove it there` : ': from the next demo on (also while decoding now)') };
}
// ---------- (v192) the background analysis (analyze.mjs --auto, bf2replay-hints): how far it is ----------
// The rounds it looks at (6+ soldiers, not copies) against those done with the page's hint rules now (HINTS_V; the round
// files' rules: analysis/.hv.json), the last run's pace and so when all are done; the glitch grids (analysis/glitch/
// summary.json, glitch.mjs); the players' hint cards (data/stats/hints.json). Worked out at most every 30 s.
let anCache = { at: 0, v: null }, hvPage = { mt: 0, v: 0 };
function pageHintsV() { const f = path.join(SITE, 'index.html'); let mt = 0; try { mt = fs.statSync(f).mtimeMs; } catch (e) { return 0; } if (mt !== hvPage.mt) { let v = 0; try { v = +((/const HINTS_V = (\d+)/.exec(fs.readFileSync(f, 'utf8')) || [])[1] || 0); } catch (e) {} hvPage = { mt, v }; } return hvPage.v; }
function analysisState() {
  if (anCache.v && Date.now() - anCache.at < 30e3) return anCache.v;
  const OUTD = path.join(ROOT, 'analysis'), HV = pageHintsV(), hv = readJson(path.join(OUTD, '.hv.json'), {}) || {}, failed = readJson(path.join(OUTD, 'failed.json'), {}) || {};
  const copies = readJson(path.join(DATA, '.copies.json'), {})?.copies || {}, fileOf = n => String(n || '').replace(/\.bf2demo$/i, '').replace(/[^A-Za-z0-9._-]/g, '_') + '.json.gz';
  const R = (index().rounds || []).filter(r => r.sum && !r.sum.empty && r.bfr && !copies[r.name] && !((r.sum.players ?? 0) < 6));
  let cur = 0, old = 0; for (const r of R) { const v = hv[fileOf(r.name)]; if (v === undefined) continue; if (v >= HV) cur++; else old++; }
  const auto = readJson(path.join(OUTD, 'auto.json'), null), run = readJson(path.join(OUTD, 'run.json'), null);
  const runOn = !!(run && !run.ended && run.pid && fs.existsSync('/proc/' + run.pid)), autoOn = !!(auto && !auto.ended && auto.pid && fs.existsSync('/proc/' + auto.pid));
  const secs = auto && auto.ended && auto.done ? (Date.parse(auto.ended) - Date.parse(auto.started)) / 1000 : null;
  const left = Math.max(0, R.length - cur), perRun = auto?.rounds || 40, cycle = secs != null ? secs / Math.max(1, auto.done) * perRun + 300 : null;
  const pw = fs.existsSync(path.join(ROOT, 'analyze', 'node_modules', 'playwright', 'package.json'));
  const gl = readJson(path.join(OUTD, 'glitch', 'summary.json'), null), hc = readJson(path.join(DATA, 'stats', 'hints.json'), null);
  const v = { hv: HV, total: R.length, cur, old, none: Math.max(0, R.length - cur - old), failed: Object.keys(failed).length, auto: auto ? { started: auto.started, ended: auto.ended || null, done: auto.done || 0, failed: auto.failed || 0, secs } : null,
    running: autoOn ? 'auto' : runOn ? 'manual' : null, eta: left && cycle ? Math.round(left / perRun * cycle) : left ? null : 0, playwright: pw, off: opt('BF2R_HINTS', '1') === '0',
    glitch: gl ? { at: gl.at, minRounds: gl.minRounds, maps: gl.maps, left: gl.left, stays: gl.stays, hints: gl.hints } : null, cards: hc ? { at: hc.at, rounds: hc.rounds, players: hc.players } : null };
  anCache = { at: Date.now(), v }; return v;
}

// ---------- (v186, todo 230) the demos: what takes the room, which old ones go (demos.mjs) ----------
// the room each part of /srv/bf2replay takes (walked at most once a minute: thousands of files)
let duCache = { at: 0, v: null };
function duAll() {
  if (duCache.v && Date.now() - duCache.at < 60e3) return duCache.v;
  const walk = (d, depth = 0) => { let n = 0, b = 0; for (const f of listDir(d)) { const p = path.join(d, f); let st; try { st = fs.lstatSync(p); } catch (e) { continue; } if (st.isDirectory()) { if (depth < 4) { const w = walk(p, depth + 1); n += w.n; b += w.b; } } else if (st.isFile()) { n++; b += st.size; } } return { n, b }; };
  const parts = { demos: path.join(DATA, 'demos'), rounds: path.join(DATA, 'rounds'), copies: path.join(DATA, '.copies'), empty: path.join(DATA, 'empty'), bad: BAD, incoming: INC, analysis: path.join(ROOT, 'analysis'), playwright: path.join(ROOT, 'analyze'), backup: path.join(ROOT, 'backup') };
  const v = {}; for (const [k, d] of Object.entries(parts)) v[k] = walk(d);
  { const w = walk(DATA); let inParts = 0; for (const k of ['demos', 'rounds', 'copies', 'empty', 'bad']) inParts += v[k].b; v.other = { n: 0, b: Math.max(0, w.b - inParts) }; }
  for (const f of listDir(DATA).filter(f => /^old-/.test(f))) { const w = walk(path.join(DATA, f)); v.old = { n: (v.old?.n || 0) + w.n, b: (v.old?.b || 0) + w.b }; }
  duCache = { at: Date.now(), v }; return v;
}
const demoInputs = () => ({ rounds: index().rounds || [], hash: siteDecoder().hash, hints: hintRounds(DATA), source: sourceList(DATA) });
function planOut(plan) {
  const by = {}; for (const x of plan.remove) by[x.why] = (by[x.why] || 0) + 1;
  return { n: plan.remove.length, bytes: plan.remove.reduce((s, x) => s + x.bytes, 0), by, back: plan.back, kept: plan.kept, demos: plan.demos, total: plan.bytes, after: plan.after, over: plan.over,
    names: plan.remove.slice(0, 15).map(x => ({ name: x.name, bytes: x.bytes, at: x.at, back: x.back, why: x.why })) };
}
function demoState() {
  const P = demoPolicy(DATA, opt), I = demoInputs(), R = I.rounds;
  const plan = demoPlan({ ...I, policy: P });
  const gone = R.filter(r => !r.demo && r.sum && !r.sum.empty), back = gone.filter(r => I.source.has(r.name)).length;
  const rf = readJson(path.join(DATA, REFETCH_FILE), null), byName = new Set(R.map(r => linkId(r.name)));
  return {
    policy: { keepDays: P.keepDays, keepDaysConf: P.keepDaysConf, maxGB: P.maxGB, keepHinted: !!P.keepHinted, refetch: !!P.refetch, refetchPerRun: P.refetchPerRun, set: P.set },
    keep: Object.entries(P.keep).map(([n, at]) => ({ name: n, at, here: byName.has(linkId(n)) })),
    du: duAll(), plan: planOut(plan), gone: gone.length, back, hints: { alive: I.hints.alive, at: I.hints.at, rounds: I.hints.rounds.size },
    source: I.source.size, refetch: rf ? { want: (rf.want || []).length, at: rf.at } : null, last: readJson(path.join(DATA, DEMOS_LAST_FILE), null),
    autoclean: opt('BF2R_RAW_AUTOCLEAN', '1') !== '0', minFree: (+opt('BF2R_MIN_FREE_GB', '3') || 0) * 2 ** 30
  };
}
const demoFields = (b, P) => {
  const o = {}, bad = [];
  if (b.keepDays !== undefined) { const n = Math.floor(+b.keepDays); if (n >= 0 && n <= 3650) o.keepDays = n; else bad.push('days: 0 to 3650'); }
  if (b.maxGB !== undefined) { const n = +b.maxGB; if (n >= 0 && n <= 1e5) o.maxGB = Math.round(n * 10) / 10; else bad.push('GB: 0 or more'); }
  if (b.keepHinted !== undefined) o.keepHinted = !!b.keepHinted;
  if (b.refetch !== undefined) o.refetch = !!b.refetch;
  if (b.refetchPerRun !== undefined) { const n = Math.floor(+b.refetchPerRun); if (n >= 1 && n <= 500) o.refetchPerRun = n; else bad.push('a run: 1 to 500'); }
  return { o, bad };
};
function demosPreview(b) {
  const P = demoPolicy(DATA, opt), { o, bad } = demoFields(b, P); if (bad.length) return { ok: false, msg: bad.join(', ') };
  const Q = { ...P, ...o }; if (P.keepDaysConf) Q.keepDays = P.keepDaysConf;
  return { ok: true, plan: planOut(demoPlan({ ...demoInputs(), policy: Q })) };
}
function demosSet(b) {
  const f = path.join(DATA, DEMOS_FILE), cur = readJson(f, {}) || {}, { o, bad } = demoFields(b, demoPolicy(DATA, opt)); if (bad.length) return { ok: false, msg: bad.join(', ') };
  const v = { ...cur, ...o, set: new Date().toISOString() }; writeJson(f, v); duCache.at = 0;
  log('demo settings:', JSON.stringify({ keepDays: v.keepDays, maxGB: v.maxGB, keepHinted: v.keepHinted, refetch: v.refetch, refetchPerRun: v.refetchPerRun }));
  const conf = Math.max(0, Math.floor(+opt('BF2R_RAW_KEEP_DAYS', '0')) || 0);
  return { ok: true, msg: 'saved: ingest applies them at its next run (within 2 min, or "Remove now")' + (conf && o.keepDays !== undefined ? ` - but BF2R_RAW_KEEP_DAYS=${conf} in /etc/bf2replay.conf wins for the days: remove it there` : '') };
}
// a round by its name, its link (https://…/r/<id>, …#round=<id>) or id
function roundOf(s) {
  s = String(s || '').trim(); if (!s) return null;
  const m = /(?:\/r\/|[#&?]round=)([^&#?\s/]+)/.exec(s); let id = m ? decodeURIComponent(m[1]) : s.split('/').pop();
  id = linkId(id); return (index().rounds || []).find(r => linkId(r.name) === id) || null;
}
function demosKeep(b) {
  const f = path.join(DATA, DEMOS_FILE), cur = readJson(f, {}) || {}, keep = { ...(cur.keep || {}) };
  if (b.on === false) { const k = Object.keys(keep).find(n => linkId(n) === linkId(b.round)); if (!k) return { ok: false, msg: 'not on the list' }; delete keep[k]; writeJson(f, { ...cur, keep }); log('demo no longer kept:', k); return { ok: true, msg: `${k}: off the list (its demo goes by the settings)` }; }
  const r = roundOf(b.round); if (!r) return { ok: false, msg: 'no such round on the site: its name (auto_2026_10_18_20_28_05), its link or id' };
  if (keep[r.name]) return { ok: false, msg: 'already on the list' };
  keep[r.name] = new Date().toISOString(); writeJson(f, { ...cur, keep }); log('demo kept:', r.name);
  return { ok: true, msg: `${r.name}: its demo stays${r.demo ? '' : ' - it is gone already (it comes back only if "download again" brings it for a new decoder)'}` };
}
// the copies of rounds (v182: the same demo from two demo pages - data/.copies): removed, the list of them stays
function copiesDelete() {
  const d = path.join(DATA, '.copies'); let n = 0, bytes = 0;
  for (const f of listDir(d)) { const p = path.join(d, f); try { const st = fs.lstatSync(p); if (!st.isFile()) continue; fs.unlinkSync(p); n++; bytes += st.size; } catch (e) {} }
  const sz = bytes >= 2 ** 30 ? (bytes / 2 ** 30).toFixed(1) + ' GB' : Math.round(bytes / 2 ** 20) + ' MB';
  duCache.at = 0; log('copies of rounds removed:', n, 'files,', sz);
  return { ok: true, msg: `${n} file${n === 1 ? '' : 's'} removed (${sz}); the links to those copies still open the same rounds` };
}

// (v153) the round posts (notify.mjs): where to, with the secrets shown only by their last 4 characters
function notifyState() {
  const N = notifySettings(), tail = v => v ? '…' + v.slice(-4) : '';
  return { discord: tail(N.discord), discordConf: N.discordConf, tgToken: tail(N.tgToken), tgTokenConf: N.tgTokenConf, tgChat: N.tgChat, tgChatConf: N.tgChatConf, minPlayers: N.minPlayers, last: N.last, domain: !!opt('BF2R_DOMAIN', '').trim(),
    items: POST_ITEMS.map(([k, name, what]) => ({ k, name, what })), lines: N.lines };   // (v187: what goes in a post, for each app)
}
function notifySet(b) {
  const ch = {}, said = [];
  if (b.discord !== undefined) { const v = String(b.discord || '').trim(); if (v && !DISCORD_RE.test(v)) return { ok: false, msg: 'not a Discord webhook address (https://discord.com/api/webhooks/<number>/<token>)' }; ch.discord = v; said.push(v ? 'Discord webhook saved' : 'Discord webhook removed'); }
  if (b.tgToken !== undefined || b.tgChat !== undefined) {
    const t = b.tgToken === undefined ? undefined : String(b.tgToken || '').trim(), c = b.tgChat === undefined ? undefined : String(b.tgChat || '').trim();
    if (t && !TG_TOKEN_RE.test(t)) return { ok: false, msg: "not a Telegram bot token (from @BotFather: 123456789:AA…)" };
    if (c && !TG_CHAT_RE.test(c)) return { ok: false, msg: 'not a Telegram chat: its id (-100… for a group or channel) or @channelname' };
    ch.telegram = {}; if (t !== undefined) ch.telegram.token = t; if (c !== undefined) ch.telegram.chat = c; said.push(t === '' && c === '' ? 'Telegram removed' : 'Telegram saved');
  }
  if (b.lines !== undefined) {   // (v187) { discord: { key: bool }, telegram: { key: bool } }
    const keys = new Set(POST_ITEMS.map(([k]) => k)), L = {};
    for (const app of ['discord', 'telegram']) { const o = b.lines?.[app]; if (!o || typeof o !== 'object') continue; L[app] = {}; for (const [k, v] of Object.entries(o)) if (keys.has(k)) L[app][k] = !!v; }
    if (!Object.keys(L).length) return { ok: false, msg: 'nothing to change' };
    ch.lines = L; said.push('what goes in a post saved');
  }
  if (b.minPlayers !== undefined) { const n = Math.floor(+b.minPlayers); if (!(n >= 1 && n <= 64)) return { ok: false, msg: 'players: 1 to 64' }; ch.minPlayers = n; said.push(`rounds with ${n}+ players`); }
  if (!said.length) return { ok: false, msg: 'nothing to change' };
  saveNotify(ch); log('round posts:', said.join(', '));
  return { ok: true, msg: said.join(' · ') };
}
// (v187) the post about a round as Discord and Telegram would get it, nothing sent: the newest round, or the one named
function notifyPreview(b) {
  const R = (index().rounds || []).filter(r => r.sum && !r.sum.empty);
  const r = b.round ? roundOf(b.round) : R.sort((x, y) => String(y.sum.date).localeCompare(String(x.sum.date)))[0];
  if (!r || !r.sum) return { ok: false, msg: b.round ? 'no such round on the site' : 'no rounds yet' };
  const N = notifySettings(), T = postTexts(r, b.lines ? { ...N, lines: { discord: { ...N.lines.discord, ...(b.lines.discord || {}) }, telegram: { ...N.lines.telegram, ...(b.lines.telegram || {}) } } } : N);
  return { ok: true, round: r.name, hl: !!r.sum.hl, ...T };
}
async function notifyRun(arg) {
  const r = await run(NODE, [path.join(HERE, 'notify.mjs'), arg], { timeout: 45e3 });
  const out = (r.out + (r.err ? '\n' + r.err : '')).trim();
  return { ok: r.code === 0, msg: out.split('\n').pop() || (r.code === 0 ? 'posted' : 'failed') };
}

// ---------- actions ----------
// (v163) stop a decoding run: it finishes writing the round list and ends (from v163 on; an older ingest.mjs just ends -
// a round it was writing is listed again by the next run); what it had not got to waits for the next one
async function stopUnit(u) {
  if (!STOPPABLE.includes(u)) return { ok: false, msg: 'only the decoding services can be stopped here' };
  const r = await run(SUDO, ['-n', SYSTEMCTL, 'stop', '--no-block', `bf2replay-${u}.service`]);
  if (r.code === 0) { log('stopped', `bf2replay-${u}`); return { ok: true, msg: `bf2replay-${u} stopped: what it had not decoded yet waits for the next run` }; }
  const why = (r.err || r.out).trim().split('\n').pop();
  return { ok: false, msg: `could not stop bf2replay-${u}: ${why || 'error ' + r.code}${/password|sudoers|not allowed/i.test(why) ? ' (the permission comes with units.sh: wait a minute after the update, or run sudo bash /srv/bf2replay/repo/server/units.sh; or on the VPS: sudo systemctl stop bf2replay-' + u + ')' : ''}` };
}
async function startUnit(u) {
  if (!UNITS.includes(u)) return { ok: false, msg: 'unknown service' };
  const r = await run(SUDO, ['-n', SYSTEMCTL, 'start', '--no-block', `bf2replay-${u}.service`]);
  if (r.code === 0) { log('started', `bf2replay-${u}`); return { ok: true, msg: `bf2replay-${u} started` }; }
  const why = (r.err || r.out).trim().split('\n').pop();
  return { ok: false, msg: `could not start bf2replay-${u}: ${why || 'error ' + r.code}${/password|sudoers|not allowed/i.test(why) ? ' (the permission comes with units.sh: wait a minute after the update, or run sudo bash /srv/bf2replay/repo/server/units.sh)' : ''}` };
}
// the demos that could not be decoded (data/bad) back into the queue: the ingest service's path unit sees them at once
function retryBad() {
  let n = 0, skipped = 0;
  fs.mkdirSync(INC, { recursive: true });
  for (const f of demoFiles(BAD)) { const dst = path.join(INC, f); if (fs.existsSync(dst)) { skipped++; continue; } try { fs.renameSync(path.join(BAD, f), dst); n++; } catch (e) { skipped++; } }
  log('failed demos back in the queue:', n);
  return { ok: true, msg: `${n} demo${n === 1 ? '' : 's'} back in the queue${skipped ? `, ${skipped} skipped (already there)` : ''}` };
}
function addSource(url) {
  url = String(url || '').trim();
  if (!SOURCE_RE.test(url)) return { ok: false, msg: 'not an address: a page (http://… or https://…) or a game server (IP or name, :port if not the usual)' };
  const L = addedSources(); if (L.some(s => s.url === url) || envSources().includes(url)) return { ok: false, msg: 'already in the list' };
  L.push({ url, added: new Date().toISOString() }); writeJson(SOURCES, { sources: L }); log('demo source added:', url);
  return { ok: true, msg: `added: ${url} (read at the next fetch, or press "Fetch new demos now")` };
}
function removeSource(url) {
  const L = addedSources(), M = L.filter(s => s.url !== url);
  if (M.length === L.length) return { ok: false, msg: envSources().includes(url) ? 'this one is in /etc/bf2replay.conf (BF2R_FETCH_URLS): remove it there' : 'not in the list' };
  writeJson(SOURCES, { sources: M }); log('demo source removed:', url); return { ok: true, msg: `removed: ${url} (its demos and rounds stay)` };
}
// fetch.mjs --probe / --list: only looks, writes nothing
async function fetchLook(args, timeout) {
  const r = await run(NODE, [path.join(HERE, 'fetch.mjs'), ...args], { timeout });
  return { ok: r.code === 0, out: (r.out + (r.err ? '\n' + r.err : '')).trim().slice(-20000) || '(no answer)' };
}
async function journal(u, n) {
  if (!['ingest', 'reprocess', 'rebuild', 'fetch', 'update', 'backup', 'hints', 'admin', 'all'].includes(u)) return { ok: false, out: 'unknown service' };
  const who = u === 'all' ? ['-u', 'bf2replay-*'] : ['-u', `bf2replay-${u}`];
  const r = await run(JOURNALCTL, [...who, '-n', String(Math.max(10, Math.min(500, n || 120))), '--no-pager', '-o', 'short-iso'], { timeout: 15e3 });
  const out = (r.out || r.err).trim();
  return { ok: r.code === 0, out: out || '(nothing)', noAccess: /not seeing messages|No journal files|permission/i.test(out) };
}

// ---------- the server ----------
const PAGE = path.join(HERE, 'admin.html');
function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const bodyOf = req => new Promise((ok, no) => { let s = ''; req.on('data', c => { s += c; if (s.length > 1e5) { no(new Error('too big')); req.destroy(); } }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } }); req.on('error', no); });
// (a POST must come from the page itself: the same host, and the header only a script on the page sends)
const sameSite = req => { const o = req.headers.origin, h = req.headers['x-forwarded-host'] || req.headers.host; if (req.headers['x-bf2r'] !== '1') return false; if (!o) return true; try { return new URL(o).host === h; } catch (e) { return false; } };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), p = url.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'GET' && (p === '/admin' || p === '/admin/index.html')) return send(res, 200, fs.readFileSync(PAGE), 'text/html; charset=utf-8');
    if (!p.startsWith('/admin/api/')) return send(res, 404, { error: 'not found' });
    const what = p.slice('/admin/api/'.length), ip = clientIp(req);
    if (req.method === 'POST' && !sameSite(req)) return send(res, 403, { error: 'not from the admin page' });
    if (what === 'login' && req.method === 'POST') {
      const wait = blocked(ip); if (wait) return send(res, 429, { error: `too many wrong passwords: try again in ${wait} min` });
      if (!readPass()) return send(res, 503, { error: 'no password set yet: on the VPS run  sudo node /srv/bf2replay/repo/server/admin.mjs --set-password' });
      const b = await bodyOf(req);
      if (!checkPass(b.password)) { const now = Date.now(); fails.set(ip, [...(fails.get(ip) || []), now]); allFails.push(now); log('wrong admin password from', ip); await new Promise(r => setTimeout(r, 600)); return send(res, 401, { error: 'wrong password' }); }
      fails.delete(ip);
      const tok = crypto.randomBytes(32).toString('base64url'), now = Date.now(); sessions.set(tok, { exp: now + SESSION_H * 3600e3, seen: now, ip });
      for (const [k, s] of sessions) if (now > s.exp) sessions.delete(k);
      setCookie(req, res, tok, SESSION_H * 3600); log('admin logged in from', ip); return send(res, 200, { ok: true });
    }
    const s = sessionOf(req);
    if (what === 'me') return send(res, 200, { in: !!s, password: !!readPass() });
    if (!s) return send(res, 401, { error: 'log in first' });
    if (what === 'logout' && req.method === 'POST') { sessions.delete(s.tok); setCookie(req, res, 'x'.repeat(20), 0); return send(res, 200, { ok: true }); }
    if (what === 'state' && req.method === 'GET') return send(res, 200, await state());
    if (what === 'log' && req.method === 'GET') return send(res, 200, await journal(url.searchParams.get('unit') || 'all', +url.searchParams.get('n')));
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = await bodyOf(req);
    if (what === 'start') return send(res, 200, await startUnit(String(b.unit)));
    if (what === 'stop') return send(res, 200, await stopUnit(String(b.unit)));
    if (what === 'retry-bad') return send(res, 200, retryBad());
    if (what === 'source-add') return send(res, 200, addSource(b.url));
    if (what === 'source-remove') return send(res, 200, removeSource(String(b.url || '')));
    if (what === 'probe') { const a = String(b.url || '').trim(); if (a && !SOURCE_RE.test(a)) return send(res, 200, { ok: false, out: 'not an address' }); return send(res, 200, await fetchLook(a ? ['--probe', a] : ['--probe'], 60e3)); }
    if (what === 'fetch-list') return send(res, 200, await fetchLook(['--list'], 180e3));
    if (what === 'notify-set') return send(res, 200, notifySet(b));
    if (what === 'jobs-set') return send(res, 200, jobsSet(b));
    if (what === 'demos-set') return send(res, 200, demosSet(b));
    if (what === 'demos-preview') return send(res, 200, demosPreview(b));
    if (what === 'demos-keep') return send(res, 200, demosKeep(b));
    if (what === 'copies-delete') return send(res, 200, copiesDelete());
    if (what === 'notify-test') return send(res, 200, await notifyRun('--test'));
    if (what === 'notify-preview') return send(res, 200, notifyPreview(b));
    if (what === 'notify-last') return send(res, 200, await notifyRun('--last'));
    return send(res, 404, { error: 'not found' });
  } catch (e) { log('error:', e.stack || e.message); try { send(res, 500, { error: e.message }); } catch (e2) {} }
});

if (process.argv.includes('--set-password')) await setPassword();
else {
  server.listen(PORT, HOST, () => log(`admin page on http://${HOST}:${PORT}/admin${readPass() ? '' : ' (no password set yet: sudo node ' + path.join(HERE, 'admin.mjs') + ' --set-password)'}`));
  // a new version of this file (after a site update): exit, and systemd starts the new one (Restart=always)
  const me = new URL(import.meta.url).pathname; let mt = 0; try { mt = fs.statSync(me).mtimeMs; } catch (e) {}
  setInterval(() => { let m = 0; try { m = fs.statSync(me).mtimeMs; } catch (e) { return; } if (m !== mt) { log('admin.mjs changed: restarting'); process.exit(0); } }, 30e3).unref();
}
