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
// (v196) The servers' admins: accounts made here by the site's owner (data/.admin-users.json: a name, a scrypt hash of the
// password, the game servers whose rounds he sees), who log in on a round's Admin tab (the page: same login, the name
// filled in) and get only that: the admins' part of the page (server/admin-round.js, cut out of the public page by
// splitpage.mjs) and the private files of the analysis (data/.admin: the players' hint cards, Glitch spot, the headshot
// odds). Everything else here is the owner's (an empty name and the password of --set-password).
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
import { notifySettings, saveNotify, DISCORD_RE, TG_TOKEN_RE, TG_CHAT_RE, POST_ITEMS, postTexts, serverOf, normFormat, FORMAT_DEFAULT, POST_VARS } from './notify.mjs';
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
// (v196) the servers' admins: { users: { name: { salt, hash, N, r, p, servers: [game server names], created, by, last } } }
const USERS_FILE = path.join(DATA, '.admin-users.json'), USER_RE = /^[A-Za-z0-9_.-]{2,32}$/;
const readUsers = () => { const j = readJson(USERS_FILE, null); return j && j.users && typeof j.users === 'object' ? j : { users: {} }; };
const writeUsers = j => { const tmp = USERS_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(j, null, 1) + '\n', { mode: 0o600 }); fs.renameSync(tmp, USERS_FILE); };
function checkUser(name, pw) {
  const u = readUsers().users[name]; if (!u || !u.salt || !u.hash || typeof pw !== 'string' || pw.length > 200) { kdf('x', 'AAAAAAAAAAAAAAAAAAAAAA=='); return null; }   // (as long either way)
  const want = Buffer.from(u.hash, 'base64'), got = kdf(pw, u.salt, { N: u.N || KDF.N, r: u.r || KDF.r, p: u.p || KDF.p, len: want.length });
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? u : null;
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
    records: recordsState(),   // (v206)
    reprocess: idx.reprocess || null, lastReprocess: readJson(path.join(DATA, 'reprocess.json'), null),
    queue: { demos: incDemos.length, bytes: incDemos.reduce((s, f) => s + sizeOf(path.join(INC, f)), 0), parts: parts.length, files: incDemos.sort().slice(0, 12) },
    bad: { demos: bad.length, files: bad.sort().slice(-12) },
    units: u.units, systemd: u.ok, fetchLast: readJson(path.join(DATA, '.fetch-last.json'), null), disk,
    sources: { env: envSources(), added: addedSources(), fetched: fetchedByHost() },
    settings, password: !!readPass(), users: usersState(), servers: knownServers(), notify: notifyState(), decode: decodeState(), demos: demoState(), analysis: analysisState()
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
// summary.json, glitch.mjs); the players' hint cards (data/.admin/hints.json). Worked out at most every 30 s.
let anCache = { at: 0, v: null }, hvPage = { mt: 0, v: 0, ver: '' };
// (v193) a run of analyze.mjs still going (a pid of a run that ended without saying so may be another program's by now)
const alive = pid => { if (!pid) return false; try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('analyze.mjs'); } catch (e) { if (fs.existsSync('/proc/self')) return false; try { process.kill(pid, 0); return true; } catch (e2) { return false; } } };
const dirBytes = d => { let b = 0; for (const f of listDir(d)) b += sizeOf(path.join(d, f)); return b; };
// (v193) the archives in analysis/ (analyze.mjs --pack): name, size, when, and what is in each (its .tar.json beside it -
// for an archive made before v193, summary.json read out of it once, in the background, and kept as its .tar.json)
const ARCH_RE = /^bf2-analysis-[A-Za-z0-9._-]+\.tar$/;
let archBusy = false;
function archives() {
  const OUTD = path.join(ROOT, 'analysis'), out = [];
  for (const f of listDir(OUTD)) {
    const part = f.endsWith('.tar.part'), name = part ? f.slice(0, -5) : f; if (!ARCH_RE.test(name)) continue;
    let st; try { st = fs.statSync(path.join(OUTD, f)); } catch (e) { continue; }
    const j = part ? null : readJson(path.join(OUTD, f + '.json'), null);
    if (!part && !j && !archBusy) { archBusy = true; run('tar', ['-xOf', path.join(OUTD, f), '--occurrence=1', 'summary.json'], { timeout: 120e3 }).then(r => { let sum = null; try { sum = JSON.parse(r.out); } catch (e) {} try { writeJson(path.join(OUTD, f + '.json'), { file: f, bytes: st.size, old: true, ...(sum || { unknown: true }) }); } catch (e) {} archBusy = false; anCache.at = 0; }); }
    out.push({ file: f, part, bytes: st.size, at: st.mtime.toISOString(), site: j?.site || (/-(v\d+)\.tar$/.exec(name) || [])[1] || null, rounds: j?.rounds ?? null, pages: j?.pages || null, hv: j?.hv || null, hvNow: j?.hvNow ?? null, made: j?.made || null, glitch: j?.glitch || null, old: !!j?.old, unknown: !!j?.unknown });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
function pageVer() { pageHintsV(); return hvPage.ver; }
function pageHintsV() {   // (v196: HINTS_V is in the admins' part of the page, server/admin-round.js)
  const f = path.join(SITE, 'index.html'), g = path.join(HERE, 'admin-round.js'); let mt = 0; try { mt = fs.statSync(f).mtimeMs + fs.statSync(g).mtimeMs; } catch (e) { return 0; }
  if (mt !== hvPage.mt) { let v = 0, ver = ''; try { const t = fs.readFileSync(f, 'utf8'), a = fs.readFileSync(g, 'utf8'); v = +((/const HINTS_V = (\d+)/.exec(a) || /const HINTS_V = (\d+)/.exec(t) || [])[1] || 0); ver = (/const APP_VERSION = '(v\d+)'/.exec(t) || [])[1] || ''; } catch (e) {} hvPage = { mt, v, ver }; }
  return hvPage.v;
}
function analysisState() {
  if (anCache.v && Date.now() - anCache.at < (anCache.v.pack?.on || anCache.v.running ? 5e3 : 30e3)) return anCache.v;
  const OUTD = path.join(ROOT, 'analysis'), HV = pageHintsV(), hv = readJson(path.join(OUTD, '.hv.json'), {}) || {}, failed = readJson(path.join(OUTD, 'failed.json'), {}) || {};
  const copies = readJson(path.join(DATA, '.copies.json'), {})?.copies || {}, fileOf = n => String(n || '').replace(/\.bf2demo$/i, '').replace(/[^A-Za-z0-9._-]/g, '_') + '.json.gz';
  const R = (index().rounds || []).filter(r => r.sum && !r.sum.empty && r.bfr && !copies[r.name] && !((r.sum.players ?? 0) < 6));
  let cur = 0, old = 0; for (const r of R) { const v = hv[fileOf(r.name)]; if (v === undefined) continue; if (v >= HV) cur++; else old++; }
  const auto = readJson(path.join(OUTD, 'auto.json'), null), run = readJson(path.join(OUTD, 'run.json'), null);
  const runOn = !!(run && !run.ended && alive(run.pid)), autoOn = !!(auto && !auto.ended && alive(auto.pid));
  const secs = auto && auto.ended && auto.done ? (Date.parse(auto.ended) - Date.parse(auto.started)) / 1000 : null;
  const left = Math.max(0, R.length - cur), perRun = auto?.rounds || 40, cycle = secs != null ? secs / Math.max(1, auto.done) * perRun + 300 : null;
  const pw = fs.existsSync(path.join(ROOT, 'analyze', 'node_modules', 'playwright', 'package.json'));
  const gl = readJson(path.join(OUTD, 'glitch', 'summary.json'), null), hc = readJson(path.join(DATA, '.admin', 'hints.json'), null);
  const set = readJson(path.join(OUTD, '.auto-set.json'), {}) || {}, note = readJson(path.join(OUTD, 'auto-note.json'), null);
  const pk = readJson(path.join(OUTD, '.pack.json'), null), packing = !!(pk && !pk.ended && alive(pk.pid));
  const v = { hv: HV, total: R.length, cur, old, none: Math.max(0, R.length - cur - old), failed: Object.keys(failed).length, auto: auto ? { started: auto.started, ended: auto.ended || null, done: auto.done || 0, rounds: auto.rounds || 0, jobs: auto.jobs || 1, boost: !!auto.boost, failed: auto.failed || 0, secs } : null,
    set: { paused: set.paused || null, boost: set.boost || null }, note, site: pageVer(),
    pack: pk ? { started: pk.started, ended: pk.ended || null, file: pk.file || null, bytes: pk.bytes || 0, error: pk.error || null, on: packing, dead: !pk.ended && !packing } : null,
    archives: archives(), roundsBytes: dirBytes(path.join(OUTD, 'rounds')),
    manual: run ? { started: run.started, ended: run.ended || null, on: runOn, done: run.done || 0, rounds: run.rounds || 0 } : null,
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

// (v153) the round posts (notify.mjs): where to, with the secrets shown only by their last 4 characters. (v194) Each
// game server its own channels and parts: the servers set up, and those with rounds in the last 90 days (not posted
// until set up), with their rounds
function notifyState() {
  const N = notifySettings(), tail = v => v ? '…' + v.slice(-4) : '', day = n => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);
  const seen = new Map(), d30 = day(30), d90 = day(90);
  for (const r of index().rounds || []) {
    if (!r.sum || r.sum.empty) continue;
    const n = serverOf(r), d = String(r.sum.date || ''); let o = seen.get(n); if (!o) seen.set(n, o = { n30: 0, total: 0, newest: '' });
    o.total++; if (d.slice(0, 10) >= d30) o.n30++; if (d > o.newest) o.newest = d;
  }
  const names = new Set([...Object.keys(N.servers), ...[...seen].filter(([, o]) => o.newest.slice(0, 10) >= d90).map(([n]) => n)]);
  const servers = [...names].map(name => {
    const c = N.servers[name], o = seen.get(name) || { n30: 0, total: 0, newest: '' };
    return { name, set: !!c, rounds30: o.n30, rounds: o.total, newest: o.newest || null, minPlayers: c?.minPlayers ?? null, last: c?.last || null, format: c ? c.format : normFormat(null), formatSet: !!c?.formatSet,
      discord: c ? { on: c.discord.on, webhook: tail(c.discord.webhook), lines: c.discord.lines } : null, telegram: c ? { on: c.telegram.on, chat: c.telegram.chat, lines: c.telegram.lines } : null };
  }).sort((a, b) => (b.set - a.set) || String(b.newest || '').localeCompare(String(a.newest || '')) || a.name.localeCompare(b.name));
  return { tgToken: tail(N.tgToken), tgTokenConf: N.tgTokenConf, minPlayers: N.minPlayers, minPlayersConf: N.minPlayersConf, last: N.last, domain: !!opt('BF2R_DOMAIN', '').trim(),
    items: POST_ITEMS.map(([k, name, what]) => ({ k, name, what })), servers, migrated: N.migrated, ignoredConf: N.ignoredConf,
    vars: POST_VARS, formatDefault: FORMAT_DEFAULT, templates: Object.entries(N.templates).map(([name, t]) => ({ name, ...t })).sort((a, b) => a.name.localeCompare(b.name)) };   // (v195: the post editor)
}
const cleanLines = o => { const keys = new Set(POST_ITEMS.map(([k]) => k)), L = {}; for (const [k, v] of Object.entries(o || {})) if (keys.has(k)) L[k] = !!v; return L; };
const notifyFile = () => readJson(path.join(DATA, '.notify.json'), {}) || {};
const linesOf2 = o => Object.fromEntries(POST_ITEMS.map(([k]) => [k, o?.[k] !== false]));
const knownServer = name => !!notifySettings().servers[name] || (index().rounds || []).some(r => r.sum && !r.sum.empty && serverOf(r) === name);
function notifySet(b) {
  const said = [];
  if (b.server !== undefined) {   // (v194) one server's settings
    const name = String(b.server || ''); if (!name || name.length > 300) return { ok: false, msg: 'which server?' };
    if (!knownServer(name)) return { ok: false, msg: 'no rounds of such a server' };
    if (b.remove) { saveNotify({}, name, null); log(`round posts (${name}): removed`); return { ok: true, msg: `${name}: its rounds are no more posted` }; }
    const N = notifySettings(), cur = N.servers[name], srv = {};
    if (b.discord) {
      const d = {};
      if (b.discord.webhook !== undefined) { const v = String(b.discord.webhook || '').trim(); if (v && !DISCORD_RE.test(v)) return { ok: false, msg: 'not a Discord webhook address (https://discord.com/api/webhooks/<number>/<token>)' }; d.webhook = v; d.on = !!v; said.push(v ? 'Discord webhook saved (on)' : 'Discord webhook removed'); }
      if (b.discord.on !== undefined) { d.on = !!b.discord.on; said.push(`Discord ${d.on ? 'on' : 'off'}${d.on && !cur?.discord.webhook && !d.webhook ? ' (no webhook yet: add one)' : ''}`); }
      if (b.discord.lines) { d.lines = cleanLines(b.discord.lines); said.push('Discord parts saved'); }
      srv.discord = d;
    }
    if (b.telegram) {
      const t = {};
      if (b.telegram.chat !== undefined) { const v = String(b.telegram.chat || '').trim(); if (v && !TG_CHAT_RE.test(v)) return { ok: false, msg: 'not a Telegram chat: its id (-100… for a group or channel) or @channelname' }; t.chat = v; t.on = !!v; said.push(v ? `Telegram chat ${v} saved (on)${N.tgToken ? '' : ' - the bot\'s token is still needed (above)'}` : 'Telegram chat removed'); }
      if (b.telegram.on !== undefined) { t.on = !!b.telegram.on; said.push(`Telegram ${t.on ? 'on' : 'off'}${t.on && !cur?.telegram.chat && !t.chat ? ' (no chat yet: add one)' : ''}`); }
      if (b.telegram.lines) { t.lines = cleanLines(b.telegram.lines); said.push('Telegram parts saved'); }
      srv.telegram = t;
    }
    if (b.format !== undefined) { srv.format = b.format === null ? null : normFormat(b.format); said.push(b.format === null ? 'the post: back to classic' : `the post saved (${srv.format.style === 'card' ? 'Discord: a card' : srv.format.style === 'text' ? 'Discord: text' : 'classic'})`); }   // (v195)
    if (b.minPlayers !== undefined) {
      if (b.minPlayers === null || b.minPlayers === '' || b.minPlayers === 0) { srv.minPlayers = null; said.push(`fewest players: as all (${N.minPlayers})`); }
      else { const n = Math.floor(+b.minPlayers); if (!(n >= 1 && n <= 64)) return { ok: false, msg: 'players: 1 to 64' }; srv.minPlayers = n; said.push(`rounds with ${n}+ players`); }
    }
    if (!said.length) return { ok: false, msg: 'nothing to change' };
    saveNotify({}, name, srv); log(`round posts (${name}):`, said.join(', '));
    return { ok: true, msg: `${name}: ${said.join(' · ')}` };
  }
  // (v195) the post's templates (for any server) and one post for every server set up
  const linesIn = L => ({ discord: cleanLines(L?.discord), telegram: cleanLines(L?.telegram) });
  if (b.template !== undefined) {
    const name = String(b.template?.name || '').trim().slice(0, 60); if (!name) return { ok: false, msg: 'a name for the template' };
    const T = { ...(notifyFile().templates || {}) }; T[name] = { format: normFormat(b.template.format), lines: linesIn(b.template.lines), at: new Date().toISOString() };
    saveNotify({ templates: T }); log('round posts: template saved:', name); return { ok: true, msg: `template "${name}" saved` };
  }
  if (b.templateRemove !== undefined) {
    const name = String(b.templateRemove || ''), T = { ...(notifyFile().templates || {}) }; if (!(name in T)) return { ok: false, msg: 'no such template' };
    delete T[name]; saveNotify({ templates: T }); log('round posts: template removed:', name); return { ok: true, msg: `template "${name}" removed` };
  }
  if (b.applyAll !== undefined) {
    const F = normFormat(b.applyAll.format), L = linesIn(b.applyAll.lines), names = Object.keys(notifySettings().servers);
    if (!names.length) return { ok: false, msg: 'no server is set up yet' };
    for (const n of names) saveNotify({}, n, { format: F, discord: { linesAll: { ...linesOf2(L.discord) } }, telegram: { linesAll: { ...linesOf2(L.telegram) } } });
    log(`round posts: one post for all ${names.length} servers`); return { ok: true, msg: `this post now on all ${names.length} server${names.length === 1 ? '' : 's'} set up (their channels stay)` };
  }
  if (b.tgToken !== undefined) {
    const t = String(b.tgToken || '').trim(); if (t && !TG_TOKEN_RE.test(t)) return { ok: false, msg: "not a Telegram bot token (from @BotFather: 123456789:AA…)" };
    saveNotify({ telegram: { token: t } }); said.push(t ? 'Telegram bot saved' : 'Telegram bot removed (no Telegram posts)');
  }
  if (b.minPlayers !== undefined) { const n = Math.floor(+b.minPlayers); if (!(n >= 1 && n <= 64)) return { ok: false, msg: 'players: 1 to 64' }; saveNotify({ minPlayers: n }); said.push(`rounds with ${n}+ players (where a server says nothing else)`); }
  if (!said.length) return { ok: false, msg: 'nothing to change' };
  log('round posts:', said.join(', '));
  return { ok: true, msg: said.join(' · ') };
}
// (v187) the post about a round as Discord and Telegram would get it, nothing sent: the round named, or the server's
// newest (v194: with the server's parts - or those given, the boxes as they are on the page)
function notifyPreview(b) {
  const srv = b.server !== undefined ? String(b.server) : null;
  const R = (index().rounds || []).filter(r => r.sum && !r.sum.empty && (srv === null || serverOf(r) === srv));
  const r = b.round ? roundOf(b.round) : R.sort((x, y) => String(y.sum.date).localeCompare(String(x.sum.date)))[0];
  if (!r || !r.sum) return { ok: false, msg: b.round ? 'no such round on the site' : 'no rounds of this server yet' };
  const c = srv !== null ? notifySettings().servers[srv] : null;
  const cfg = { format: b.format !== undefined ? normFormat(b.format) : c?.format, discord: { lines: { ...(c?.discord.lines || {}), ...(b.lines?.discord || {}) } }, telegram: { lines: { ...(c?.telegram.lines || {}), ...(b.lines?.telegram || {}) } } };
  return { ok: true, round: r.name, server: serverOf(r), hl: !!r.sum.hl, ...postTexts(r, cfg) };
}
async function notifyRun(arg, server) {
  const r = await run(NODE, [path.join(HERE, 'notify.mjs'), arg, ...(server ? [String(server)] : [])], { timeout: 60e3 });
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
// (v206, Sagara: "a button on the admin page: Recalculate all records") every round summed up again from its decoded file
// (no decoding: ~0.5 s a round) - its kills, distances, highlights for the posts, records; then the Records, players' and
// maps' pages and the numbers over all rounds. ingest.mjs does it at its next run (started now): data/.resum-request.json
function recordsState() {
  const rd = f => readJson(path.join(DATA, f), null);
  return { asked: rd('.resum-request.json'), done: rd('.resum-done.json'), now: rd('.resum-now.json') };
}
async function recordsAgain() {
  const S = recordsState();
  if (S.asked?.at && (!S.done?.at || S.done.at < S.asked.at)) return { ok: false, msg: `already asked for ${S.asked.at.replace('T', ' ').slice(0, 16)} UTC${S.now ? `: ${S.now.done} of ${S.now.total} rounds done` : ': it starts with the next decoding run'}` };
  writeJson(path.join(DATA, '.resum-request.json'), { at: new Date().toISOString(), by: 'admin page' });
  log('records: all rounds to be summed up again (asked for on the admin page)');
  const r = await startUnit('ingest');
  const n = (index().rounds || []).filter(x => x.bfr && x.sum && !x.sum.empty).length;
  return { ok: true, msg: `all ${n} rounds will be summed up again (~${Math.max(1, Math.round(n * 0.5 / 60))} min)${r.ok ? ': started' : ': it starts by itself within 2 minutes'} - then the records and the pages are written again` };
}
async function startUnit(u) {
  if (!UNITS.includes(u)) return { ok: false, msg: 'unknown service' };
  const r = await run(SUDO, ['-n', SYSTEMCTL, 'start', '--no-block', `bf2replay-${u}.service`]);
  if (r.code === 0) { log('started', `bf2replay-${u}`); return { ok: true, msg: `bf2replay-${u} started` }; }
  const why = (r.err || r.out).trim().split('\n').pop();
  return { ok: false, msg: `could not start bf2replay-${u}: ${why || 'error ' + r.code}${/password|sudoers|not allowed/i.test(why) ? ' (the permission comes with units.sh: wait a minute after the update, or run sudo bash /srv/bf2replay/repo/server/units.sh)' : ''}` };
}
// (v193) the background analysis from the admin page (analysis/.auto-set.json, read by analyze.mjs --auto before and
// between rounds): run now; all rounds now (no 40 a run; as many at once as analyze.sh would) until all are done; pause
// (the rounds being done are finished first) and go on; make the archive (analyze.mjs --pack, in the background: a few
// minutes) and remove one
const AND = () => path.join(ROOT, 'analysis');
function anSet(f) { const F = path.join(AND(), '.auto-set.json'), o = readJson(F, {}) || {}; f(o); for (const k of Object.keys(o)) if (o[k] == null) delete o[k]; fs.mkdirSync(AND(), { recursive: true }); writeJson(F, o); anCache.at = 0; return o; }
async function analysisAct(b) {
  const what = String(b.do || ''), now = new Date().toISOString();
  anCache.at = 0; const A = analysisState(), busy = A.running === 'auto';
  if (what === 'run' || what === 'resume') {
    anSet(o => { o.paused = null; });
    if (A.running === 'manual') return { ok: true, msg: 'analyze.sh start is running: the background analysis goes on after it' };
    const r = await startUnit('hints'); if (!r.ok) return r;
    return { ok: true, msg: busy ? 'it is running already: it goes on' : 'started: first the glitch grids (a minute or two), then the rounds in the page' };
  }
  if (what === 'boost') {
    if (!A.playwright) return { ok: false, msg: 'the page part needs its browser first: sudo bash /srv/bf2replay/repo/server/analyze.sh start (installs it once)' };
    anSet(o => { o.boost = now; o.paused = null; });
    if (A.running === 'manual') return { ok: true, msg: 'all rounds now: after the analyze.sh run that is going' };
    if (busy && !A.auto?.boost) return { ok: true, msg: 'all rounds now: the run going now stops after its round, the next one (in 5 minutes) does all of them, several at once' };
    const r = await startUnit('hints'); if (!r.ok) return r;
    return { ok: true, msg: 'all rounds now: started, several at once; it goes on run after run (up to 95 min each, 5 min apart) until all are done, then back to 40 a run' };
  }
  if (what === 'unboost') { anSet(o => { o.boost = null; }); return { ok: true, msg: 'back to 40 rounds a run, one at a time' + (busy ? ' (the run going now stops after its rounds)' : '') }; }
  if (what === 'pause') { anSet(o => { o.paused = now; }); return { ok: true, msg: 'paused' + (busy ? ': the run going now finishes the round it is on and stops' : '') + '; nothing more until "Go on"' }; }
  if (what === 'pack') {
    if (A.pack?.on) return { ok: false, msg: 'an archive is being made already' };
    let free = Infinity; try { const st = fs.statfsSync(AND()); free = st.bavail * st.bsize; } catch (e) {}
    const need = Math.round(A.roundsBytes * 1.02) + 64 * 2 ** 20;
    if (free < need + 2 ** 30) return { ok: false, msg: `not enough room for it: it takes about ${(need / 2 ** 30).toFixed(1)} GB, ${(free / 2 ** 30).toFixed(1)} GB free (1 GB stays free); remove an older archive first` };
    fs.mkdirSync(AND(), { recursive: true });
    const lf = fs.openSync(path.join(AND(), '.pack.log'), 'w');
    const ch = spawn(NODE, [path.join(HERE, 'analyze.mjs'), '--pack'], { detached: true, stdio: ['ignore', lf, lf], env: process.env, cwd: ROOT });
    fs.closeSync(lf); try { os.setPriority(ch.pid, 15); } catch (e) {}
    ch.on('error', e => log('archive not started:', e.message)); ch.unref();
    try { writeJson(path.join(AND(), '.pack.json'), { started: now, pid: ch.pid }); } catch (e) {}
    anCache.at = 0; log('archive of the analysis started, pid', ch.pid);
    return { ok: true, msg: `making the archive (about ${(need / 2 ** 30).toFixed(1)} GB): a few minutes; "Download" comes when it is done` };
  }
  if (what === 'archive-delete') {
    const f = String(b.file || ''), name = f.endsWith('.part') ? f.slice(0, -5) : f;
    if (!ARCH_RE.test(name) || f.includes('/')) return { ok: false, msg: 'no such archive' };
    if (A.pack?.on && f.endsWith('.part')) return { ok: false, msg: 'it is being made now' };
    let n = 0; for (const x of f === name ? [f, f + '.json'] : [f]) { try { fs.unlinkSync(path.join(AND(), x)); n++; } catch (e) {} }
    anCache.at = 0; log('analysis archive removed:', f);
    return n ? { ok: true, msg: `removed: ${f}` } : { ok: false, msg: 'not there' };
  }
  return { ok: false, msg: 'unknown' };
}
// (v193) an archive to the browser (behind the login, as all here); resumable (Range)
function sendArchive(req, res, name) {
  name = String(name || '');
  if (!ARCH_RE.test(name)) return send(res, 404, { error: 'no such archive' });
  const f = path.join(AND(), name); let st; try { st = fs.statSync(f); } catch (e) { return send(res, 404, { error: 'no such archive' }); }
  const tag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`, lm = st.mtime.toUTCString();
  const H = { 'Content-Type': 'application/x-tar', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no', 'Referrer-Policy': 'no-referrer', 'Accept-Ranges': 'bytes', ETag: tag, 'Last-Modified': lm };
  let a = 0, z = st.size - 1, code = 200;
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || ''), ir = req.headers['if-range'];
  if (m && (!ir || ir === tag || ir === lm)) {
    a = +m[1]; if (m[2]) z = Math.min(z, +m[2]);
    if (a > z || a >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
    code = 206; H['Content-Range'] = `bytes ${a}-${z}/${st.size}`;
  }
  H['Content-Length'] = z - a + 1; res.writeHead(code, H);
  if (req.method === 'HEAD') return res.end();
  const rs = fs.createReadStream(f, { start: a, end: z }); rs.on('error', () => res.destroy()); res.on('close', () => rs.destroy()); rs.pipe(res);
  if (!a) log('analysis archive downloaded:', name, 'from', clientIp(req));
}
// (v197) a round for its Admin tab: what the page can't know - where its demo came from and when, its copies, the
// analysis of it, whether its demo is kept or goes (demos.mjs). A server's admin: only his servers' rounds
const jsonByMt = new Map();   // (files read again only when they change: .fetched.json can be big)
function readJsonMt(f, d) { let mt = 0; try { mt = fs.statSync(f).mtimeMs; } catch (e) { return d; } const c = jsonByMt.get(f); if (c && c.mt === mt) return c.v; const v = readJson(f, d); jsonByMt.set(f, { mt, v }); return v; }
const anFileOf = n => String(n || '').replace(/\.bf2demo$/i, '').replace(/[^A-Za-z0-9._-]/g, '_') + '.json.gz';
let planCache = { at: 0, v: null };
function demoPlanNow() { if (planCache.v && Date.now() - planCache.at < 60e3) return planCache.v; const I = demoInputs(), plan = demoPlan({ ...I, policy: demoPolicy(DATA, opt) }); planCache = { at: Date.now(), v: new Map(plan.remove.map(x => [x.name, x.why])) }; return planCache.v; }
function roundInfo(name, s) {
  const r = roundOf(name); if (!r || !r.sum) return { ok: false, msg: 'no such round' };
  if ((s.role || 'owner') !== 'owner' && !(s.servers || []).includes(r.sum.server)) return { ok: false, msg: 'not one of the servers of your account' };
  const F = readJsonMt(path.join(DATA, '.fetched.json'), {}) || {}, C = readJsonMt(path.join(DATA, '.copies.json'), {})?.copies || {};
  const last = u => { try { return decodeURIComponent(String(u).split('?')[0].split('/').pop() || ''); } catch (e) { return ''; } };
  const got = Object.entries(F).filter(([u, v]) => last(u) === r.name || (v && v.of === r.name)).map(([u, v]) => ({ url: u, at: v?.at || null, bytes: v?.bytes ?? null, skipped: v?.skipped || null }));
  const copies = Object.entries(C).filter(([, v]) => v && v.of === r.name).map(([n, v]) => ({ name: n, at: v.at || null, bytes: v.bytes ?? null }));
  const OUTD = path.join(ROOT, 'analysis'), af = path.join(OUTD, 'rounds', anFileOf(r.name)), hv = (readJsonMt(path.join(OUTD, '.hv.json'), {}) || {})[anFileOf(r.name)];
  const failed = (readJsonMt(path.join(OUTD, 'failed.json'), {}) || {})[r.name] || null; let aAt = null; try { aAt = fs.statSync(af).mtime.toISOString(); } catch (e) {}
  const dp = path.join(DATA, r.demo || ('demos/' + r.name)), here = !!r.demo && fs.existsSync(dp), goes = here ? demoPlanNow().get(r.name) || null : null;
  const keep = readJson(path.join(DATA, DEMOS_FILE), {})?.keep || {};
  return { ok: true, name: r.name, server: r.sum.server, added: r.added || null, bytes: r.bytes ?? null, decoder: r.decoder || null, siteDecoder: siteDecoder().hash, sumV: r.sumV ?? null,
    bfr: r.bfr ? { file: r.bfr, bytes: sizeOf(path.join(DATA, r.bfr)) } : null,
    demo: { here, bytes: here ? sizeOf(dp) : null, goes, kept: !!keep[r.name] || !!keep[linkId(r.name)] },
    listed: sourceList(DATA).get(r.name) || null, got, copies, copyOf: C[r.name]?.of || null,
    analysis: { at: aAt, hv: hv ?? null, hvNow: pageHintsV(), failed } };
}
// (v198) the admins' review: marks on a round's hints (checked / a false alarm / suspicious), notes on a round and on a
// player (every admin sees them), the trusted players (not highlighted: the owner's for every server, a server admin's
// for his servers). data/.admin/review: rounds/<round>.json { marks: { key: { state, by, at, note } }, notes: [...] },
// players/<nick>.json { nick, notes: [...] }, trusted.json { nicks: { nick: { by, at, why, servers } } }
const REV = path.join(DATA, '.admin', 'review'), REV_STATES = ['ok', 'false', 'sus'];
const nickSlugS = nick => { const n = String(nick), s = n.replace(/[^A-Za-z0-9_.-]+/g, '_'); if (s === n) return s; let h = 0x811c9dc5; for (const ch of n) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return s + '-' + h.toString(16).padStart(8, '0').slice(0, 6); };   // (the page's nickSlug)
const revRoundFile = name => path.join(REV, 'rounds', linkId(name).replace(/[^A-Za-z0-9._-]/g, '_') + '.json');
const revPlayerFile = nick => path.join(REV, 'players', nickSlugS(nick) + '.json');
const revWrite = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); writeJson(f, v); };
const whoOf = s => s.user || 'owner', isOwner = s => (s.role || 'owner') === 'owner';
const txt = (v, n) => String(v ?? '').replace(/\r/g, '').trim().slice(0, n);
function revRound(s, name) {
  const r = roundOf(name); if (!r || !r.sum) return { err: 'no such round' };
  if (!isOwner(s) && !(s.servers || []).includes(r.sum.server)) return { err: 'not one of the servers of your account' };
  return { r };
}
function trustedFor(server) { const T = readJson(path.join(REV, 'trusted.json'), {})?.nicks || {}, out = {}; for (const [n, e] of Object.entries(T)) if (!e.servers || !server || e.servers.includes(server)) out[n] = e; return out; }
function revGet(b, s) {
  const { r, err } = revRound(s, b.round); if (err) return { ok: false, msg: err };
  const R = readJson(revRoundFile(r.name), {}) || {}, P = {};
  for (const n of (Array.isArray(b.nicks) ? b.nicks : []).slice(0, 256).map(x => String(x).slice(0, 64))) { const j = readJson(revPlayerFile(n), null); if (j?.notes?.length) P[n] = j.notes; }
  return { ok: true, round: r.name, marks: R.marks || {}, notes: R.notes || [], players: P, trusted: trustedFor(r.sum.server), me: whoOf(s), owner: isOwner(s) };
}
function revMark(b, s) {
  const { r, err } = revRound(s, b.round); if (err) return { ok: false, msg: err };
  const key = txt(b.key, 300), st = b.state == null ? null : String(b.state); if (!key) return { ok: false, msg: 'which hint?' };
  if (st !== null && !REV_STATES.includes(st)) return { ok: false, msg: 'checked, false or sus' };
  const f = revRoundFile(r.name), R = readJson(f, {}) || {}; R.marks = R.marks || {};
  if (st === null) delete R.marks[key]; else R.marks[key] = { state: st, by: whoOf(s), at: new Date().toISOString(), ...(b.note ? { note: txt(b.note, 1000) } : {}), ...(b.what ? { what: txt(b.what, 400), t: +b.t || 0 } : {}) };
  revWrite(f, R); log(`review: ${whoOf(s)} marked ${key} in ${r.name}: ${st || 'cleared'}`);
  return { ok: true, msg: st === null ? 'mark cleared' : st === 'ok' ? 'marked: checked, nothing there' : st === 'false' ? 'marked: a false alarm' : 'marked: suspicious' };
}
function revNote(b, s) {
  const me = whoOf(s), now = new Date().toISOString(); let f, J, about;
  if (b.round) { const { r, err } = revRound(s, b.round); if (err) return { ok: false, msg: err }; f = revRoundFile(r.name); J = readJson(f, {}) || {}; about = r.name; }
  else if (b.nick) { const n = txt(b.nick, 64); if (!n) return { ok: false, msg: 'which player?' }; f = revPlayerFile(n); J = readJson(f, null) || { nick: n }; about = n; }
  else return { ok: false, msg: 'a round or a player' };
  J.notes = Array.isArray(J.notes) ? J.notes : [];
  if (b.remove) { const i = J.notes.findIndex(x => x.id === b.remove); if (i < 0) return { ok: false, msg: 'no such note' }; if (J.notes[i].by !== me && !isOwner(s)) return { ok: false, msg: 'only its writer (or the site\'s owner) removes a note' }; J.notes.splice(i, 1); revWrite(f, J); return { ok: true, msg: 'note removed' }; }
  const t = txt(b.text, 2000); if (!t) return { ok: false, msg: 'an empty note' };
  J.notes.push({ id: crypto.randomBytes(6).toString('hex'), by: me, at: now, text: t, ...(b.nick && b.inRound ? { round: txt(b.inRound, 200) } : {}) });
  if (J.notes.length > 500) J.notes = J.notes.slice(-500);
  revWrite(f, J); log(`review: ${me} wrote a note on ${about}`); return { ok: true, msg: 'note saved' };
}
function revTrusted(b, s) {
  const n = txt(b.nick, 64); if (!n) return { ok: false, msg: 'which player?' };
  const f = path.join(REV, 'trusted.json'), J = readJson(f, {}) || {}; J.nicks = J.nicks || {}; const cur = J.nicks[n], me = whoOf(s);
  if (b.on && cur && cur.by !== me && !isOwner(s)) return { ok: false, msg: `${n}: already trusted (by ${cur.by})` };
  if (b.on) { J.nicks[n] = { by: me, at: new Date().toISOString(), why: txt(b.why, 300), servers: isOwner(s) ? null : (s.servers || []) }; revWrite(f, J); log(`review: ${me} trusts ${n}`); return { ok: true, msg: `${n}: trusted${isOwner(s) ? '' : ' (on your servers)'} - his hints are not highlighted` }; }
  if (!cur) return { ok: false, msg: 'not on the list' };
  if (cur.by !== me && !isOwner(s)) return { ok: false, msg: `on the list by ${cur.by}: only he (or the site's owner) takes him off` };
  delete J.nicks[n]; revWrite(f, J); log(`review: ${me} no more trusts ${n}`); return { ok: true, msg: `${n}: no more trusted` };
}
// (v196) the servers' admins: made, changed (password, servers) and removed by the owner; a change ends their logins
function usersState() {
  const U = readUsers().users;
  return Object.entries(U).map(([name, u]) => ({ name, servers: u.servers || [], created: u.created || null, last: u.last || null, by: u.by || null, in: [...sessions.values()].some(x => x.user === name && Date.now() < x.exp) })).sort((a, b) => a.name.localeCompare(b.name));
}
function knownServers() { const S = new Set(); for (const r of index().rounds || []) if (r.sum && !r.sum.empty && r.sum.server) S.add(r.sum.server); return [...S].sort(); }
function userSet(b) {
  const name = String(b.name || '').trim(); if (!USER_RE.test(name) || name.toLowerCase() === 'owner') return { ok: false, msg: 'a name: 2-32 letters, digits, . _ - (not "owner")' };
  const j = readUsers(), u = j.users[name], said = [];
  if (!u && !b.password) return { ok: false, msg: 'a password for the new account' };
  const o = u ? { ...u } : { created: new Date().toISOString(), by: 'owner', servers: [] };
  if (b.password) { const pw = String(b.password); if (pw.length < 8 || pw.length > 200) return { ok: false, msg: 'the password: at least 8 characters' }; const salt = crypto.randomBytes(16).toString('base64'); Object.assign(o, { salt, hash: kdf(pw, salt).toString('base64'), N: KDF.N, r: KDF.r, p: KDF.p, pwSet: new Date().toISOString() }); said.push(u ? 'password changed' : 'made'); }
  if (Array.isArray(b.servers)) { o.servers = [...new Set(b.servers.map(x => String(x).slice(0, 300)).filter(Boolean))]; said.push(`servers: ${o.servers.length ? o.servers.join(', ') : 'none'}`); }
  if (!said.length) return { ok: false, msg: 'nothing to change' };
  j.users[name] = o; writeUsers(j);
  if (u && b.password) for (const [k, x] of sessions) if (x.user === name) sessions.delete(k);   // (a new password: logged out)
  log(`round admin ${name}:`, said.join(', ')); return { ok: true, msg: `${name}: ${said.join(' · ')}` };
}
function userRemove(b) {
  const name = String(b.name || ''), j = readUsers(); if (!j.users[name]) return { ok: false, msg: 'no such account' };
  delete j.users[name]; writeUsers(j); for (const [k, x] of sessions) if (x.user === name) sessions.delete(k);
  log(`round admin ${name}: removed`); return { ok: true, msg: `${name}: removed (logged out)` };
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
// (v196) a file to a logged-in admin: never cached, nothing else about it said
function sendFile(res, f, type) {
  let b; try { b = fs.readFileSync(f); } catch (e) { return send(res, 404, { error: 'not found' }); }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': b.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); res.end(b);
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
      const b = await bodyOf(req), user = String(b.user || '').trim();
      if (!user && !readPass()) return send(res, 503, { error: 'no password set yet: on the VPS run  sudo node /srv/bf2replay/repo/server/admin.mjs --set-password' });
      // (v196) no name: the site's owner; a name: one of the servers' admins (accounts made on this page)
      const u = user ? (USER_RE.test(user) ? checkUser(user, b.password) : null) : null;
      if (user ? !u : !checkPass(b.password)) { const now = Date.now(); fails.set(ip, [...(fails.get(ip) || []), now]); allFails.push(now); log('wrong admin password from', ip, user ? `(${user})` : ''); await new Promise(r => setTimeout(r, 600)); return send(res, 401, { error: user ? 'wrong name or password' : 'wrong password' }); }
      fails.delete(ip);
      const tok = crypto.randomBytes(32).toString('base64url'), now = Date.now();
      sessions.set(tok, { exp: now + SESSION_H * 3600e3, seen: now, ip, user: user || null, role: user ? 'admin' : 'owner' });
      for (const [k, s] of sessions) if (now > s.exp) sessions.delete(k);
      if (user) { try { const j = readUsers(); if (j.users[user]) { j.users[user].last = new Date().toISOString(); writeUsers(j); } } catch (e) {} }
      setCookie(req, res, tok, SESSION_H * 3600); log(user ? `admin ${user} logged in from` : 'admin logged in from', ip); return send(res, 200, { ok: true, role: user ? 'admin' : 'owner' });
    }
    const s = sessionOf(req);
    // (v196) a server's admin: his servers (as they are now: changed or removed here, his login goes with it)
    if (s && s.role !== 'owner') { const u = readUsers().users[s.user]; if (!u) { sessions.delete(s.tok); return what === 'me' ? send(res, 200, { in: false, password: !!readPass() }) : send(res, 401, { error: 'log in first' }); } s.servers = Array.isArray(u.servers) ? u.servers : []; }
    if (what === 'me') return send(res, 200, { in: !!s, password: !!readPass(), round: !!s, user: s ? s.user || 'owner' : null, role: s ? s.role || 'owner' : null, servers: s && s.role !== 'owner' ? s.servers : null });
    if (!s) return send(res, 401, { error: 'log in first' });
    if (what === 'logout' && req.method === 'POST') { sessions.delete(s.tok); setCookie(req, res, 'x'.repeat(20), 0); return send(res, 200, { ok: true }); }
    // (v196) what a server's admin may have too: the admins' part of the page, the analysis's private files
    if (what === 'admin.js' && req.method === 'GET') return sendFile(res, path.join(HERE, 'admin-round.js'), 'text/javascript; charset=utf-8');
    if (what.startsWith('data/') && req.method === 'GET') { const rel = what.slice(5); if (!/^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)?\.json$/.test(rel) || rel.includes('..')) return send(res, 404, { error: 'not found' }); return sendFile(res, path.join(DATA, '.admin', rel), 'application/json; charset=utf-8'); }
    if (what === 'round' && req.method === 'GET') return send(res, 200, roundInfo(url.searchParams.get('name'), s));   // (v197)
    if (req.method === 'POST' && ['review-get', 'review-mark', 'review-note', 'trusted'].includes(what)) {   // (v198: any admin, his servers' rounds)
      const b = await bodyOf(req);
      return send(res, 200, what === 'review-get' ? revGet(b, s) : what === 'review-mark' ? revMark(b, s) : what === 'review-note' ? revNote(b, s) : revTrusted(b, s));
    }
    if ((s.role || 'owner') !== 'owner') return send(res, 403, { error: 'this account is for the rounds\' Admin tab only', round: true });
    if (what === 'state' && req.method === 'GET') return send(res, 200, await state());
    if (what === 'log' && req.method === 'GET') return send(res, 200, await journal(url.searchParams.get('unit') || 'all', +url.searchParams.get('n')));
    if (what === 'analysis-file' && (req.method === 'GET' || req.method === 'HEAD')) return sendArchive(req, res, url.searchParams.get('name'));
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = await bodyOf(req);
    if (what === 'start') return send(res, 200, await startUnit(String(b.unit)));
    if (what === 'records-again') return send(res, 200, await recordsAgain());   // (v206)
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
    if (what === 'analysis') return send(res, 200, await analysisAct(b));
    if (what === 'user-set') return send(res, 200, userSet(b));
    if (what === 'user-remove') return send(res, 200, userRemove(b));
    if (what === 'notify-test') return send(res, 200, b.server && !knownServer(String(b.server)) ? { ok: false, msg: 'no such server' } : await notifyRun('--test', b.server));
    if (what === 'notify-preview') return send(res, 200, notifyPreview(b));
    if (what === 'notify-last') return send(res, 200, b.server && !knownServer(String(b.server)) ? { ok: false, msg: 'no such server' } : await notifyRun('--last', b.server));
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
