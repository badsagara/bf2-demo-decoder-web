#!/usr/bin/env node
// BF2 Round Replay - server side: download new demos from the game servers' public demo pages.
// For game servers you can't install anything on (e.g. a clan's server that publishes its demos on a web page):
// every page in BF2R_FETCH_URLS is read, each link to a .bf2demo that wasn't fetched before is downloaded into
// upload/incoming, and ingest.mjs takes it from there (the same as an uploaded demo): rounds with players are decoded
// and listed on the site, rounds nobody played are dropped. Run every 10 minutes by bf2replay-fetch.timer
// (BF2R_FETCH_EVERY; 0 = once a day at BF2R_FETCH_AT): a round is on the site a few minutes after it ends. A run that
// finds nothing new writes nothing to the log, only data/.fetch-last.json (when it looked, what it found: bf2replay-status).
//
//   node fetch.mjs                      download what's new
//   node fetch.mjs --list               only show what it would download (and how much)
//   node fetch.mjs --probe 1.2.3.4 ...  only look: what each address leads to (server name, demo page, demos listed);
//                                       without addresses: the ones in BF2R_FETCH_URLS
//
// Settings (/etc/bf2replay.conf or the environment):
//   BF2R_FETCH_URLS       where the demos are (space separated), each one either
//                         - a page that lists them (http://... or https://...); a plain folder listing works, or
//                         - a game server: its IP or name, with :port if not the usual (its game port 16567 or its query
//                           port, 29900 by default) - asked (GameSpy query, UDP) for the demo page its settings name
//                           (sv.demoIndexURL / sv.demoDownloadURL); when it doesn't answer: its web server, http://IP/
//                         A page filed by month: {YYYY-MM} in the address (read for this month and the last).
//                         Which server a round comes from is in the demo itself (its name), so the site tells them apart.
//                         All pages are read first, then the new demos are downloaded newest first over all of them.
//   BF2R_FETCH_SINCE      YYYY-MM-DD: skip demos recorded before this day (empty = all the page lists)
//   BF2R_FETCH_MAX        at most this many downloads per run (0 = no limit, the default; the rest come on the next run)
//   BF2R_FETCH_MIN_BYTES  skip smaller demos (empty 45-minute rounds are ~400 KB; default 0 = take all and let ingest
//                         decide by the players in it)
//   BF2R_FETCH_PAUSE      seconds between two downloads (default 1, to go easy on the game server's web page)
//   BF2R_MIN_FREE_GB      stop downloading when the disk with data/ has less free space than this (default 3)
// What was fetched is kept in data/.fetched.json, so a demo comes once even if ingest drops it as an empty round.
import fs from 'node:fs';
import path from 'node:path';
import dgram from 'node:dgram';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const conf = {};
try { for (const line of fs.readFileSync('/etc/bf2replay.conf', 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/.exec(line); if (m) conf[m[1]] = m[2]; } } catch (e) { /* no file: defaults */ }
const opt = (k, d) => process.env[k] ?? conf[k] ?? d;
const ROOT = opt('BF2R_ROOT', '/srv/bf2replay');
const URLS = opt('BF2R_FETCH_URLS', '').split(/[\s,]+/).filter(Boolean);
const SINCE = opt('BF2R_FETCH_SINCE', '');
const MAX = Math.max(0, +opt('BF2R_FETCH_MAX', '0') || 0);   // (0: no limit)
const MIN_BYTES = +opt('BF2R_FETCH_MIN_BYTES', '0') || 0;
const PAUSE = Math.max(0, +opt('BF2R_FETCH_PAUSE', '1') || 0);
const MIN_FREE = (+opt('BF2R_MIN_FREE_GB', '3') || 0) * 2 ** 30;
const INC = path.join(ROOT, 'upload', 'incoming'), STATE = path.join(ROOT, 'data', '.fetched.json');
const LIST = process.argv.includes('--list'), PROBE = process.argv.includes('--probe');
const PROBE_ADDR = PROBE ? process.argv.slice(process.argv.indexOf('--probe') + 1).filter(a => !a.startsWith('--')) : [];
const DEMOS = path.join(ROOT, 'data', 'demos');
const UA = 'bf2replay-fetch/1.0 (BF2 Round Replay; downloads each demo once)';
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

// what was fetched: by its address ({ file, bytes, from, at } or { skipped }); entries from before several servers
// (fetch 1.0) are by the demo's name, and count for the server they came from
let seen = {};
try { seen = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { /* first run */ }
const save = () => { const tmp = STATE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(seen, null, 1)); fs.renameSync(tmp, STATE); };
const hostOf = u => { try { return new URL(u).host; } catch (e) { return ''; } };
const seenAt = (name, url) => seen[url] || (seen[name] && (!seen[name].from || hostOf(seen[name].from) === hostOf(url)) ? seen[name] : null);
// the file name here: the demo's own, unless a demo of another server has it already (two servers can start a round in
// the same second): then the server's address in front (1.2.3.4_auto_2026_10_15_20_00_00.bf2demo)
const taken = new Set(Object.entries(seen).map(([k, v]) => v.file || (/^[\w.\-]+\.bf2demo$/i.test(k) ? k : null)).filter(Boolean));
const fileFor = (name, url) => !taken.has(name) && !fs.existsSync(path.join(INC, name)) && !fs.existsSync(path.join(DEMOS, name)) ? name : hostOf(url).replace(/[^\w.-]+/g, '-') + '_' + name;

// the day a demo was recorded: from its name (auto_2026_09_29_19_52_11.bf2demo), else from Last-Modified
const nameDay = n => { const m = /(20\d\d)[_-](\d\d)[_-](\d\d)/.exec(n); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };
const mb = b => (b / 1048576).toFixed(1) + ' MB';
// free space on the disk that holds data/ (the demo is moved there, and its decoded round written next to it)
const freeBytes = () => { try { const s = fs.statfsSync(path.join(ROOT, 'data')); return s.bavail * s.bsize; } catch (e) { return Infinity; } };

// the demos a page lists: Map(name -> address). Links (href, src, url=), addresses in the text, a name in a link's query
// (download.php?file=...); and, for an index that only names them (XML, text), the names alone - under dl (where the
// server says its demos lie) or next to the page
async function links(page, dl) {
  const res = await fetch(page, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30e3) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text(), out = new Map(), from = res.url || page, ok = n => /^[\w.\-]+\.bf2demo$/i.test(n);
  for (const m of html.matchAll(/(?:href|src|url)\s*=\s*["']?([^"'\s>]+)|(https?:\/\/[^\s"'<>]+)/gi)) {
    let u; try { u = new URL((m[1] || m[2]).replace(/&amp;/g, '&'), from); } catch (e) { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    let name; try { name = [decodeURIComponent(u.pathname.split('/').pop()), ...[...u.searchParams.values()].map(v => v.split('/').pop())].find(ok); } catch (e) { continue; }
    if (name && !out.has(name)) out.set(name, u.href);
  }
  const base = dl ? (dl.endsWith('/') ? dl : dl + '/') : from;
  for (const m of html.matchAll(/[\w.\-]+\.bf2demo\b/gi)) if (ok(m[0]) && !out.has(m[0])) { try { out.set(m[0], new URL(m[0], base).href); } catch (e) {} }
  return out;
}

// a game server's settings, by its query port (GameSpy 3 as BF2 answers it, no challenge): { hostname, bf2_d_idx (demo
// index page), bf2_d_dl (where the demos lie), bf2_autorec ('1': records every round), mapname, numplayers, ... }
function gsQuery(host, port, ms = 3000) {
  return new Promise((ok, fail) => {
    let sock; try { sock = dgram.createSocket(host.includes(':') ? 'udp6' : 'udp4'); } catch (e) { fail(e); return; }
    const sid = Buffer.from([0x42, 0x46, 0x32, 0x52]), parts = []; let last = -1;
    const done = (e, v) => { clearTimeout(timer); try { sock.close(); } catch (x) {} if (e) fail(e); else ok(v); };
    const timer = setTimeout(() => done(new Error(`no answer on UDP ${port}`)), ms);
    sock.on('error', e => done(e));
    sock.on('message', b => {
      if (b.length < 5 || b[0] !== 0 || !b.subarray(1, 5).equals(sid)) return;
      if (b.subarray(5, 14).toString('latin1') === 'splitnum\0') { const id = b[14]; if (id & 0x80) last = id & 0x7f; parts[id & 0x7f] = b.subarray(16); }
      else { parts[0] = b.subarray(5); last = 0; }
      if (last < 0 || parts.filter(Boolean).length !== last + 1) return;
      const f = Buffer.concat(parts).toString('latin1').split('\0'), kv = {};
      for (let k = 0; k + 1 < f.length && f[k]; k += 2) kv[f[k]] = f[k + 1];
      done(null, kv);
    });
    // FE FD, 00 = info, the session id, FF 00 00 = the server's settings only (no players, no teams), 01 = may split
    sock.send(Buffer.concat([Buffer.from([0xfe, 0xfd, 0x00]), sid, Buffer.from([0xff, 0x00, 0x00, 0x01])]), port, host, e => { if (e) done(e); });
  });
}

// one BF2R_FETCH_URLS entry -> { page, dl, label, note }: a page as it is; a game server asked for its demo page
async function source(entry) {
  if (/^https?:\/\//i.test(entry)) return { page: entry, label: entry };
  const m = /^\[?([^\]]+?)\]?(?::(\d+))?$/.exec(entry.replace(/\/+$/, '')); if (!m) return { label: entry, note: 'not an address' };
  const host = m[1], port = m[2] ? +m[2] : null, ports = [...new Set([port && port !== 16567 ? port : null, 29900].filter(Boolean))], web = `http://${host.includes(':') ? '[' + host + ']' : host}/`;
  for (const qp of ports) {
    let kv; try { kv = await gsQuery(host, qp); } catch (e) { continue; }
    const name = (kv.hostname || '').trim(), idx = (kv.bf2_d_idx || '').trim(), dl = (kv.bf2_d_dl || '').trim(), rec = kv.bf2_autorec;
    const label = `${entry} (${name || 'no name'}${rec === '0' ? ', does not record demos' : ''})`;
    const fix = u => u && !/^https?:\/\//i.test(u) ? 'http://' + u : u;
    if (idx || dl) return { page: fix(idx || dl), dl: fix(dl) || undefined, label };
    return { label, note: 'its settings name no demo page (sv.demoIndexURL / sv.demoDownloadURL): give the page itself' };
  }
  return { page: web, label: `${entry} (no answer on UDP ${ports.join(' / ')}: trying its web server)` };
}

// what the file's headers say about it: still being recorded (a folder the running server writes into: wait until it
// hasn't changed for 3 minutes), recorded before BF2R_FETCH_SINCE, smaller than BF2R_FETCH_MIN_BYTES; null = take it
function verdict(name, h) {
  const lm = Date.parse(h.get('last-modified') || ''), size = +(h.get('content-length') || NaN);
  if (Number.isFinite(lm) && Date.now() - lm < 180e3) return { why: 'busy' };
  if (SINCE && !nameDay(name) && Number.isFinite(lm) && new Date(lm).toISOString().slice(0, 10) < SINCE) return { why: 'old' };
  if (MIN_BYTES && Number.isFinite(size) && size < MIN_BYTES) return { why: Number.isFinite(lm) ? 'small' : 'busy' };
  return { why: null, size };
}

async function download(name, url, file) {
  // the headers first (HEAD); a web server that doesn't answer HEAD gets a GET, and the checks run on its headers
  const head = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30e3) });
  if (!head.ok && ![403, 405, 501].includes(head.status)) throw new Error(`HTTP ${head.status}`);
  let v = head.ok ? verdict(name, head.headers) : null;
  if (v?.why) return v.why;
  if (LIST && v) return { would: v.size };
  if (v && freeBytes() - (Number.isFinite(v.size) ? v.size : 0) < MIN_FREE) return 'full';
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30 * 60e3) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  if (!v) {
    v = verdict(name, res.headers);
    const stop = v.why || (LIST ? { would: v.size } : freeBytes() - (Number.isFinite(v.size) ? v.size : 0) < MIN_FREE ? 'full' : null);
    if (stop) { await res.body.cancel().catch(() => {}); return stop; }
  }
  const part = path.join(INC, file + '.part');
  try {
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(part, { mode: 0o664 }));
    const got = fs.statSync(part).size, want = +(res.headers.get('content-length') || NaN);
    if (res.headers.get('content-encoding') == null && Number.isFinite(want) && got !== want) throw new Error(`cut off (${got} of ${want} bytes)`);
    if (!got) throw new Error('empty file');
    fs.renameSync(part, path.join(INC, file));   // (ingest skips .part names)
    return got;
  } catch (e) { try { fs.unlinkSync(part); } catch (e2) {} throw e; }
}

// an address with {YYYY-MM} in it (a server that files its demos by month: http://1.2.3.4/archive/s01/{YYYY-MM}/) is
// read for this month and the one before (UTC), so the start of a month misses nothing; {YYYY_MM} likewise
function expand(entry) {
  if (!/\{YYYY[-_]MM\}/.test(entry)) return [entry];
  const now = new Date(), m = [0, 1].map(k => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)));
  return m.map(d => entry.replace(/\{YYYY([-_])MM\}/g, (x, sep) => d.getUTCFullYear() + sep + String(d.getUTCMonth() + 1).padStart(2, '0')));
}
// when a demo was recorded, for the order: its name's date and time (auto_2026_10_15_21_00_00), else its name
const whenKey = n => { const m = /(20\d\d)[_-](\d\d)[_-](\d\d)[_-](\d\d)[_-](\d\d)[_-](\d\d)/.exec(n); return m ? m.slice(1).join('') : n; };

async function main() {
  const entries = (PROBE && PROBE_ADDR.length ? PROBE_ADDR : URLS).flatMap(expand);
  if (!entries.length) { log('no BF2R_FETCH_URLS set: nothing to fetch'); return; }
  if (!PROBE) { fs.mkdirSync(INC, { recursive: true }); fs.mkdirSync(path.dirname(STATE), { recursive: true }); }
  const n = { got: 0, bytes: 0, would: 0, wouldBytes: 0, busy: 0, skipped: 0, failed: 0, listed: 0, pages: 0 };
  const report = () => LIST
    ? log(`would download ${n.would} demos${n.wouldBytes ? ', ~' + mb(n.wouldBytes) : ''}; still being written ${n.busy}; skipped (BF2R_FETCH_SINCE / MIN_BYTES) ${n.skipped}; free on disk ${mb(freeBytes())}`)
    : log(`fetched ${n.got} demos (${mb(n.bytes)}); still being written ${n.busy} (next run); skipped ${n.skipped}` + (n.failed ? `; failed ${n.failed} (tried again next run)` : ''));
  // 1. every page: what it lists that is new
  const todo = [];
  for (const entry of entries) {
    const src = await source(entry);
    if (!src.page) { log(src.label, '-', src.note); continue; }
    const where = src.label === src.page ? src.page : `${src.label} -> ${src.page}`;
    let found;
    try { found = await links(src.page, src.dl); } catch (e) { log('could not read', where, '-', e.message); continue; }
    if (PROBE) { const names = [...found.keys()].sort((x, y) => whenKey(x).localeCompare(whenKey(y))); log(where, '-', found.size, 'demos listed', names.length ? `(oldest: ${names[0]}, newest: ${names[names.length - 1]})` : ''); continue; }
    const fresh = [...found].filter(([nm, u]) => !seenAt(nm, u) && !(SINCE && nameDay(nm) && nameDay(nm) < SINCE));
    n.listed += found.size; n.pages++;
    if (fresh.length || LIST) log(where, '-', found.size, 'demos listed,', fresh.length, 'new');
    for (const [name, url] of fresh) todo.push({ name, url });
  }
  if (PROBE) return;
  // 2. newest first over all the servers, so fresh rounds from each show up before any old backlog
  todo.sort((a, b) => whenKey(b.name).localeCompare(whenKey(a.name)));
  for (const { name, url } of todo) {
    if (MAX && n.got + n.would >= MAX) { log('limit of', MAX, 'per run reached (BF2R_FETCH_MAX); the rest next run'); break; }
    try {
      const file = fileFor(name, url), r = await download(name, url, file);
      if (r === 'busy') { log('still being written:', name); n.busy++; continue; }
      if (r?.would !== undefined) { log('would download', name, Number.isFinite(r.would) ? mb(r.would) : ''); n.would++; if (Number.isFinite(r.would)) n.wouldBytes += r.would; continue; }
      if (r === 'full') { log(`stopped: less than ${(MIN_FREE / 2 ** 30).toFixed(1)} GB free on the disk (BF2R_MIN_FREE_GB); ${name} and older ones next run`); break; }
      if (r === 'old' || r === 'small') { if (!LIST) { seen[url] = { skipped: r, at: new Date().toISOString() }; save(); } n.skipped++; continue; }
      seen[url] = { file, bytes: r, from: url, at: new Date().toISOString() }; taken.add(file); save(); n.got++; n.bytes += r;
      log('fetched', file === name ? name : `${name} as ${file}`, mb(r), `(${hostOf(url)})`);
      if (PAUSE) await new Promise(ok => setTimeout(ok, PAUSE * 1000));
    } catch (e) { log('could not download', name, '-', e.message, '(tried again next run)'); n.failed++; }
  }
  if (LIST || n.got || n.busy || n.skipped || n.failed) report();
  // (when it last looked: for bf2replay-status)
  if (!LIST) { try { const f = path.join(ROOT, 'data', '.fetch-last.json'); fs.writeFileSync(f + '.tmp', JSON.stringify({ at: new Date().toISOString(), pages: n.pages, listed: n.listed, new: todo.length, got: n.got, busy: n.busy, failed: n.failed })); fs.renameSync(f + '.tmp', f); } catch (e) {} }
}
main().catch(e => { log('error:', e.stack || e.message); process.exit(1); });
