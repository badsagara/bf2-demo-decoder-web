#!/usr/bin/env node
// BF2 Round Replay - server side: download new demos from the game servers' public demo pages.
// For game servers you can't install anything on (e.g. a clan's server that publishes its demos on a web page):
// every page in BF2R_FETCH_URLS is read, each link to a .bf2demo that wasn't fetched before is downloaded into
// upload/incoming, and ingest.mjs takes it from there (the same as an uploaded demo).
//
//   node fetch.mjs          download what's new
//   node fetch.mjs --list   only show what it would download
//
// Settings (/etc/bf2replay.conf or the environment):
//   BF2R_FETCH_URLS       pages that list the demos (space separated); a plain folder listing works
//   BF2R_FETCH_SINCE      YYYY-MM-DD: skip demos recorded before this day (the first run would otherwise take them all)
//   BF2R_FETCH_MAX        at most this many downloads per run (default 20; the rest come on the next runs)
//   BF2R_FETCH_MIN_BYTES  skip smaller demos (empty 45-minute rounds are ~400 KB; default 0 = take all)
// What was fetched is kept in data/.fetched.json, so a demo comes once even if ingest drops it as an empty round.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const conf = {};
try { for (const line of fs.readFileSync('/etc/bf2replay.conf', 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/.exec(line); if (m) conf[m[1]] = m[2]; } } catch (e) { /* no file: defaults */ }
const opt = (k, d) => process.env[k] ?? conf[k] ?? d;
const ROOT = opt('BF2R_ROOT', '/srv/bf2replay');
const URLS = opt('BF2R_FETCH_URLS', '').split(/[\s,]+/).filter(Boolean);
const SINCE = opt('BF2R_FETCH_SINCE', '');
const MAX = +opt('BF2R_FETCH_MAX', '20') || 20;
const MIN_BYTES = +opt('BF2R_FETCH_MIN_BYTES', '0') || 0;
const INC = path.join(ROOT, 'upload', 'incoming'), STATE = path.join(ROOT, 'data', '.fetched.json');
const LIST = process.argv.includes('--list');
const UA = 'bf2replay-fetch/1.0 (BF2 Round Replay; downloads each demo once)';
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

let seen = {};
try { seen = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { /* first run */ }
const save = () => { const tmp = STATE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(seen, null, 1)); fs.renameSync(tmp, STATE); };

// the day a demo was recorded: from its name (auto_2026_09_29_19_52_11.bf2demo), else from Last-Modified
const nameDay = n => { const m = /(20\d\d)[_-](\d\d)[_-](\d\d)/.exec(n); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };

async function links(page) {
  const res = await fetch(page, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30e3) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text(), out = new Map();
  for (const m of html.matchAll(/href\s*=\s*["']?([^"'\s>]+)/gi)) {
    let u; try { u = new URL(m[1].replace(/&amp;/g, '&'), res.url || page); } catch (e) { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    let name; try { name = decodeURIComponent(u.pathname.split('/').pop()); } catch (e) { continue; }
    if (/^[\w.\-]+\.bf2demo$/i.test(name) && !out.has(name)) out.set(name, u.href);   // (plain file names only)
  }
  return out;
}

async function download(name, url) {
  // still being recorded? (a folder that the running server writes into): wait until it hasn't changed for 3 minutes
  const head = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30e3) });
  if (!head.ok) throw new Error(`HTTP ${head.status}`);
  const lm = Date.parse(head.headers.get('last-modified') || ''), size = +(head.headers.get('content-length') || NaN);
  if (Number.isFinite(lm) && Date.now() - lm < 180e3) return 'busy';
  if (SINCE && !nameDay(name) && Number.isFinite(lm) && new Date(lm).toISOString().slice(0, 10) < SINCE) return 'old';
  if (MIN_BYTES && Number.isFinite(size) && size < MIN_BYTES) return Number.isFinite(lm) ? 'small' : 'busy';
  if (LIST) return 'would';
  const part = path.join(INC, name + '.part');
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30 * 60e3) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  try {
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(part, { mode: 0o664 }));
    const got = fs.statSync(part).size, want = +(res.headers.get('content-length') || NaN);
    if (res.headers.get('content-encoding') == null && Number.isFinite(want) && got !== want) throw new Error(`cut off (${got} of ${want} bytes)`);
    if (!got) throw new Error('empty file');
    fs.renameSync(part, path.join(INC, name));   // (ingest skips .part names)
    return got;
  } catch (e) { try { fs.unlinkSync(part); } catch (e2) {} throw e; }
}

async function main() {
  if (!URLS.length) { log('no BF2R_FETCH_URLS set: nothing to fetch'); return; }
  fs.mkdirSync(INC, { recursive: true });
  let done = 0;
  for (const page of URLS) {
    let found;
    try { found = await links(page); } catch (e) { log('could not read', page, '-', e.message); continue; }
    // newest first (the names start with the date), so a fresh round shows up before an old backlog
    const todo = [...found].filter(([n]) => !seen[n] && !(SINCE && nameDay(n) && nameDay(n) < SINCE)).sort((a, b) => b[0].localeCompare(a[0]));
    log(page, '-', found.size, 'demos listed,', todo.length, 'new');
    for (const [name, url] of todo) {
      if (done >= MAX) { log('limit of', MAX, 'per run reached; the rest next time'); return; }
      try {
        const r = await download(name, url);
        if (r === 'busy') { log('still being written:', name); continue; }
        if (r === 'would') { log('would download', name); done++; continue; }
        if (r === 'old' || r === 'small') { seen[name] = { skipped: r, at: new Date().toISOString() }; save(); continue; }
        seen[name] = { bytes: r, from: url, at: new Date().toISOString() }; save(); done++;
        log('fetched', name, (r / 1048576).toFixed(1), 'MB');
      } catch (e) { log('could not download', name, '-', e.message, '(tried again next time)'); }
    }
  }
}
main().catch(e => { log('error:', e.stack || e.message); process.exit(1); });
