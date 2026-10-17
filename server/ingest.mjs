#!/usr/bin/env node
// BF2 Round Replay - server side: turns new demos (downloaded by fetch.mjs, or sent by a game server) into rounds the site lists and opens at once.
//
//   node ingest.mjs              new demos in upload/incoming -> data/demos (the demo), data/rounds (decoded), rounds.json,
//                                data/heat/<map>.json (every kill's spot, for heatmaps and player pages),
//                                data/share/r|p/*.html (link previews: /r/<round>, /p/<player>),
//                                data/www (pages for search engines: /rounds/, /players/, /maps/; /rss.xml, /sitemap.xml)
//   node ingest.mjs --reprocess  also decode again every round made by an older decoder (after a site update)
//   node ingest.mjs --rebuild    decode every kept demo again and write rounds.json from scratch
//
// The decoder is the page's own (the part of site/index.html between "// @worker-begin" and "// @worker-end"), so the
// server and the browsers always decode the same way. Settings: /etc/bf2replay.conf (BF2R_ROOT, BF2R_KEEP_EMPTY, BF2R_MIN_PLAYERS,
// BF2R_RAW_KEEP_DAYS, BF2R_MIN_FREE_GB, BF2R_RAW_AUTOCLEAN, BF2R_JOBS), or the same names in the environment.
// Decoding again (--reprocess, --rebuild) runs BF2R_JOBS demos at once in worker threads (default: as many as the CPU
// cores and the memory allow, ~1.2 GB each, at most 4) and keeps its progress in rounds.json (reprocess: done / total /
// left, for bf2replay-status and the site), and in the log: "[45/480 9%, ~1 h 10 min left]".
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

// ---------- settings ----------
const conf = {};
try { for (const line of fs.readFileSync('/etc/bf2replay.conf', 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/.exec(line); if (m) conf[m[1]] = m[2]; } } catch (e) { /* no file: defaults */ }
const opt = (k, d) => process.env[k] ?? conf[k] ?? d;
const ROOT = opt('BF2R_ROOT', '/srv/bf2replay');
const KEEP_EMPTY = opt('BF2R_KEEP_EMPTY', '0') === '1';      // keep demos of rounds nobody played (in data/empty)
const MIN_PLAYERS = Math.max(1, Math.floor(+opt('BF2R_MIN_PLAYERS', '2') || 2));   // fewer players on the field: not listed
const JOBS = Math.max(1, Math.floor(+opt('BF2R_JOBS', '0')) || Math.min(4, os.cpus().length || 1, Math.max(1, Math.floor(os.totalmem() / (1.2 * 2 ** 30)))));
const RAW_KEEP_DAYS = +opt('BF2R_RAW_KEEP_DAYS', '0');       // delete the demo itself after so many days (0: never); the decoded round stays
const MIN_FREE = (+opt('BF2R_MIN_FREE_GB', '3') || 0) * 2 ** 30, RAW_AUTOCLEAN = opt('BF2R_RAW_AUTOCLEAN', '1') !== '0';   // (a nearly full disk: step 4)
const SITE = path.join(ROOT, 'site'), DATA = path.join(ROOT, 'data'), INC = path.join(ROOT, 'upload', 'incoming');
const DIRS = { demos: path.join(DATA, 'demos'), rounds: path.join(DATA, 'rounds'), logs: path.join(DATA, 'logs'), empty: path.join(DATA, 'empty'), bad: path.join(DATA, 'bad') };
const INDEX = path.join(DATA, 'rounds.json'), HEAT_DIR = path.join(DATA, 'heat'), SHARE_DIR = path.join(DATA, 'share');
const DOMAIN = opt('BF2R_DOMAIN', '').trim();
const args = new Set(process.argv.slice(2));
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

// ---------- the page's decoder ----------
function loadDecoder() {
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), lines = html.split('\n');
  const gline = lines.find(l => l.startsWith('const GAME = '));
  const a = lines.findIndex(l => l.startsWith('// @worker-begin')), b = lines.findIndex(l => l.startsWith('// @worker-end'));
  if (!gline || a < 0 || b < a) throw new Error('site/index.html has no decoder (worker marks or GAME missing)');
  const region = lines.slice(a, b).join('\n');
  // killCause (what a kill counts as) lives in the page's main script: taken from there as well
  const k0 = html.indexOf('function killCause('), k1 = html.indexOf('\n}\n', k0);
  if (k0 < 0 || k1 < 0) throw new Error('site/index.html has no killCause');
  const kc = html.slice(k0, k1 + 2);
  const hash = crypto.createHash('sha1').update(gline).update(region).update(kc).digest('hex').slice(0, 10);
  const mod = new Function('performance', 'setTimeout', 'process', gline + '\n' + region + '\n' + kc + '\nreturn { decodeDemo, readHeader, killCause, GAME };')(performance, setTimeout, process);
  return { ...mod, hash };
}

// ---------- decoded round file (.bfr) ----------
// gzip of: 'BFR1', u32 header length, header JSON ({ name, info, tl }; typed arrays as { $ta: [type, offset, length] }
// into the bytes after the header, 8-byte aligned; Infinity / NaN as { $n: 'Infinity' }), then those bytes.
// The page reads it with bfrParse.
function bfrBuild(obj) {
  const bufs = []; let off = 0;
  const json = JSON.stringify(obj, (k, v) => {
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
      const b = Buffer.from(v.buffer, v.byteOffset, v.byteLength), at = off;
      bufs.push(b); off += b.length; const pad = (8 - (off % 8)) % 8; if (pad) { bufs.push(Buffer.alloc(pad)); off += pad; }
      return { $ta: [v.constructor.name, at, v.length] };
    }
    if (typeof v === 'number' && !Number.isFinite(v)) return { $n: String(v) };
    return v;
  });
  const head = Buffer.from(json, 'utf8'), pre = Buffer.alloc(8);
  pre.write('BFR1', 0, 'latin1'); pre.writeUInt32LE(head.length, 4);
  const gap = Buffer.alloc(((8 + head.length + 7) & ~7) - 8 - head.length);
  return zlib.gzipSync(Buffer.concat([pre, head, gap, ...bufs]), { level: 9 });
}

// ---------- the round's numbers for the rounds list (the same as the page's rounds panel works out) ----------
function summarize(tl, hdr, killCause) {
  const C = tl.cols, n = C.n, T = C.times, F = T.length, dur = tl.meta.duration;
  const P0 = tl.players, pidx = new Map(P0.map((p, i) => [p.id, i]));
  const teamIn = (p, tt) => { const L = p.teams; if (!L || !L.length) return p.team; let tm = L[0][1]; for (const [ts, x] of L) { if (ts > tt + 0.05) break; tm = x; } return tm; };
  const team = (i, tt) => i === undefined || !P0[i] ? -1 : teamIn(P0[i], tt);
  const frameAt = tt => { if (!F || T[0] > tt) return -1; let lo = 0, hi = F - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= tt) lo = m; else hi = m - 1; } return lo; };
  const at = (i, tt) => {   // as the page's playerAt: between the frames around tt
    let a = frameAt(tt); if (a < 0) a = 0; const b = Math.min(F - 1, a + 1), u = b > a ? Math.max(0, Math.min(1, (tt - T[a]) / (T[b] - T[a]))) : 0;
    const ia = a * n + i, ib = b * n + i, alive = !!C.L[ia];
    if (!alive || !C.L[ib]) return { x: C.X[ia], y: C.Y[ia], alive, veh: C.VTN[C.VT[ia]] };
    return { x: C.X[ia] + (C.X[ib] - C.X[ia]) * u, y: C.Y[ia] + (C.Y[ib] - C.Y[ia]) * u, alive, veh: C.VTN[C.VT[ia]] };
  };
  const ev = tl.events.slice().sort((a, b) => a.t - b.t), kills = ev.filter(e => e.type === 'kill');
  // kill distances as the page works them out (normalize): killer to victim in the frame of the kill, from where a grenade
  // or rocket was thrown, none for placed charges and kills without a weapon
  const PLACED = new Set([5367, 5460, 5359]), thrown = ev.filter(e => e.type === 'throw' && e.path?.length);
  for (const e of kills) {
    if (e.dist !== undefined || e.killer === e.victim || PLACED.has(e.wid) || !(e.wid || e.weapon)) continue;
    const ki = pidx.get(e.killer), vi = pidx.get(e.victim), k = frameAt(e.t); if (ki === undefined || vi === undefined || k < 0) continue;
    const a = k * n + ki, b = k * n + vi, th = thrown.find(w => w.by === e.killer && Math.abs(w.t1 - e.t) < 0.6);
    e.dist = Math.round(th ? Math.hypot(th.path[0][1] - C.X[b], th.path[0][2] - C.Y[b]) : Math.hypot(C.X[a] - C.X[b], C.Y[a] - C.Y[b], C.HH[a] - C.HH[b]));
  }
  for (const e of ev) if (e.type === 'death' && e._x === undefined) e._x = kills.some(k => k.victim === e.player && k.t <= e.t + 0.5 && e.t - k.t < 60 && !ev.some(s => s.type === 'spawn' && s.player === e.player && s.t > k.t && s.t <= e.t - 1));
  const sold = P0.map((p, i) => i).filter(i => !P0[i].vehicle);
  const S = new Map(sold.map(i => [i, { k: [0, 0], d: [0, 0], tk: 0, foot: 0, veh: 0 }])), killsOf = new Map(), deathsOf = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const e of kills) {
    const ki = pidx.get(e.killer), vi = pidx.get(e.victim); if (vi === undefined) continue;
    const vt = team(vi, e.t), kt = ki === undefined ? -1 : team(ki, e.t), kv = ki !== undefined && !!at(ki, e.t - 0.05).veh, vv = !!at(vi, e.t - 0.05).veh;
    const self = ki === vi, tk = !self && kt === vt;
    if (!self && !tk && S.has(ki)) { S.get(ki).k[kv ? 1 : 0]++; push(killsOf, ki, e); }
    if (tk && S.has(ki)) S.get(ki).tk++;
    if (e.revived) continue;
    if (S.has(vi)) { S.get(vi).d[vv ? 1 : 0]++; push(deathsOf, vi, e.t); }
  }
  for (const e of ev) if (e.type === 'death' && e._x === false) { const vi = pidx.get(e.player); if (S.has(vi)) { S.get(vi).d[at(vi, e.t - 0.05).veh ? 1 : 0]++; push(deathsOf, vi, e.t); } }
  for (let k = 0; k < F; k++) { const dt = k + 1 < F ? T[k + 1] - T[k] : 0; for (const i of sold) { const e = k * n + i; if (!C.L[e]) continue; if (C.VT[e]) S.get(i).veh += dt; else S.get(i).foot += dt; } }
  const streak = i => { const L = killsOf.get(i) || [], D = deathsOf.get(i) || []; let cur = 0, best = 0; for (const [, isK] of L.map(e => [e.t, 1]).concat(D.map(t => [t, 0])).sort((a, b) => a[0] - b[0] || b[1] - a[1])) { if (isK) best = Math.max(best, ++cur); else cur = 0; } return best >= 2 ? best : 0; };
  const tk0 = [C.TK[0], C.TK[1]], tk1 = [C.TK[(F - 1) * 2], C.TK[(F - 1) * 2 + 1]], hasTk = tk0[0] > 0 || tk0[1] > 0;
  const tickets = hasTk ? [[tk0[0], tk1[0]], [tk0[1], tk1[1]]] : null, winner = tickets ? (tickets[0][1] > tickets[1][1] ? 0 : tickets[1][1] > tickets[0][1] ? 1 : null) : null;
  const P = [...S].filter(([, s]) => s.foot + s.veh > 0).map(([i, s]) => {
    const pl = P0[i], id = pl.id, tm = team(i, dur), mine = e => e.type === 'kill' && e.killer === id;
    const enemy = ev.filter(e => mine(e) && e.victim !== id && team(pidx.get(e.victim), e.t) !== team(i, e.t));
    return { name: pl.name.trim(), team: tm, win: winner !== null && tm === winner, k: s.k[0] + s.k[1], kVeh: s.k[1], d: s.d[0] + s.d[1], tk: s.tk,
      sui: ev.filter(e => mine(e) && e.victim === id).length, hs: enemy.filter(e => e.hit === 'head').length,
      rev: ev.filter(e => e.type === 'revive' && e.medic === id).length, heal: ev.filter(e => e.type === 'heal' && e.medic === id && e.player !== id).length,
      rep: ev.filter(e => e.type === 'repair' && e.by === id).length, score: (pl.pts || []).reduce((a, q) => a + q[1], 0),
      streak: streak(i), long: Math.max(0, ...enemy.map(e => e.dist || 0)), alive: Math.round(s.foot + s.veh) };
  });
  const top = P.slice().sort((a, b) => b.score - a.score)[0];
  // the kills for the heatmap of all rounds on the map: [victim x, y, killer x, y, victim's side, killer's side, kind, weapon, killer, victim]
  const r1 = v => Math.round(v * 10) / 10;
  const pts = kills.map(e => {
    const ki = pidx.get(e.killer), vi = pidx.get(e.victim); if (vi === undefined || e.killer === e.victim) return null;
    const kq = ki !== undefined ? at(ki, e.t - 0.05) : null, vq = at(vi, e.t);
    return [r1(e.x ?? vq.x), r1(e.y ?? vq.y), kq && kq.alive ? r1(kq.x) : null, kq && kq.alive ? r1(kq.y) : null, tl.teams[team(vi, e.t)]?.name || '', ki !== undefined ? tl.teams[team(ki, e.t)]?.name || '' : '',
      killCause(e, !!(kq && kq.veh)), e.weapon || '', ki !== undefined ? P0[ki].name.trim() : '', P0[vi].name.trim()];
  }).filter(Boolean);
  const map = hdr ? (hdr.fields[2].split('/').pop() || hdr.fields[2]) : String(tl.meta.map || '');
  return { date: hdr ? hdr.fields[1] : '', map, server: hdr ? hdr.fields[0] : '', duration: dur, empty: !P.length, players: P.length, kills: kills.length,
    teams: tl.teams.map(x => x.name), tickets, winner, top: top ? { name: top.name, score: top.score, team: top.team } : null, P, pts };
}

// ---------- one demo ----------
async function decodeFile(dec, file) {
  const raw = fs.readFileSync(file);
  let data; try { data = zlib.inflateSync(raw); } catch (e) { try { data = zlib.gunzipSync(raw); } catch (e2) { throw new Error('not a zlib / gzip stream'); } }
  const u8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength), hdr = dec.readHeader(u8);
  if (!hdr) throw new Error('no Battle Recorder header');
  const tl = await dec.decodeDemo(u8, null);
  const ok = tl && tl.stats && tl.stats.positions > 0 && tl.cols && tl.cols.times.length && tl.stats.spawns > 0;
  const info = { bytes: raw.length, format: 'deflate', truncated: false, dataLen: u8.length, hdr: { lead: hdr.lead, fields: hdr.fields, end: hdr.end } };
  return { tl: ok ? tl : null, hdr, info };
}
const baseOf = name => name.replace(/\.bf2demo(\.gz)?$/i, '');
// Every kill's spot of a round (sum.pts: what the heatmap of all rounds and the player pages need, ~25 KB a round) is
// kept out of rounds.json - which every visit loads - in one file per map, data/heat/<map>.json ({ rounds: { name: pts } }),
// loaded only for those; rounds.json names each file with a version (heat: { map: { file, v, rounds } }).
const HEAT = new Map();   // map -> Map(round name -> pts)
const mapOf = sum => String(sum?.map || 'unknown').toLowerCase();
const heatFile = map => map.replace(/[^a-z0-9_-]+/g, '_') + '.json';
function heatPut(name, sum) {
  for (const M of HEAT.values()) M.delete(name);
  if (!sum || !sum.pts) return;
  const m = mapOf(sum); if (!HEAT.has(m)) HEAT.set(m, new Map());
  HEAT.get(m).set(name, sum.pts); delete sum.pts;
}
function readIndex() {
  let d = { version: 2, rounds: [] };
  try { const x = JSON.parse(fs.readFileSync(INDEX, 'utf8')); if (Array.isArray(x.rounds)) d = x; } catch (e) {}
  try { for (const f of fs.readdirSync(HEAT_DIR)) if (f.endsWith('.json')) { const h = JSON.parse(fs.readFileSync(path.join(HEAT_DIR, f), 'utf8')); HEAT.set(h.map, new Map(Object.entries(h.rounds || {}))); } } catch (e) {}
  for (const r of d.rounds) if (r.sum?.pts) { heatPut(r.name, r.sum); d.moved = true; }   // (rounds.json before v67 had them inside)
  return d;
}
function writeIndex(d, dec) {
  d.rounds.sort((a, b) => String(b.sum?.date || b.name).localeCompare(String(a.sum?.date || a.name)));
  d.updated = new Date().toISOString(); d.decoder = dec.hash; d.version = 2; delete d.moved;
  // heat files: rounds no longer listed leave; a file is written only when it changed
  const names = new Set(d.rounds.map(r => r.name)), heat = {};
  fs.mkdirSync(HEAT_DIR, { recursive: true });
  for (const [m, M] of HEAT) {
    for (const n of [...M.keys()]) if (!names.has(n)) M.delete(n);
    const f = path.join(HEAT_DIR, heatFile(m));
    if (!M.size) { try { fs.unlinkSync(f); } catch (e) {} HEAT.delete(m); continue; }
    const body = JSON.stringify({ version: 1, map: m, rounds: Object.fromEntries([...M].sort((a, b) => a[0].localeCompare(b[0]))) });
    const v = crypto.createHash('sha1').update(body).digest('hex').slice(0, 10);
    let old = null; try { old = fs.readFileSync(f, 'utf8'); } catch (e) {}
    if (old !== body) { fs.writeFileSync(f + '.tmp', body); fs.renameSync(f + '.tmp', f); }
    heat[m] = { file: 'heat/' + heatFile(m), v, rounds: M.size };
  }
  d.heat = heat;
  try { writeShares(d, dec); d.share = true; } catch (e) { log('link previews not written:', e.message); }
  const tmp = INDEX + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(d)); fs.renameSync(tmp, INDEX);
  // how far decoding again is, in a file of its own: the site's progress tag reads it every 30 s while it lasts (rounds.json
  // is too big for that)
  if (d.reprocess) writeProgress({ ...d.reprocess, updated: d.updated });
}
function writeProgress(P) {
  const f = path.join(DATA, 'reprocess.json');
  try { fs.writeFileSync(f + '.tmp', JSON.stringify(P)); fs.renameSync(f + '.tmp', f); } catch (e) { log('progress not written:', e.message); }
}

// ---------- link previews ----------
// A link to a round (/r/<round>) or a player (/p/<player>) is a small page with the title, a line of numbers and a
// picture of the map, which chat apps (Telegram, Discord, Slack, WhatsApp, Facebook) show under the link; a visitor is
// sent on to the page itself (#round=... with the link's ?t=&p=&tab=, or #player=...). The web server maps /r/* and
// /p/* to data/share/r|p/*.html (Caddyfile.in, nginx-example.conf).
// A player is known by his nick (the last word of the name: clan tags come and go); nickOf / nickSlug are the page's own.
const nickOf = name => { const s = String(name || '').trim(); return /^Player \d+$/.test(s) ? s : s.split(/\s+/).pop(); };
const nickSlug = nick => { const s = nick.replace(/[^A-Za-z0-9_.-]+/g, '_'); if (s === nick) return s; let h = 0x811c9dc5; for (const ch of nick) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return s + '-' + h.toString(16).padStart(8, '0').slice(0, 6); };
const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dayOf = d => { const m = /^(\d{4})-(\d\d)-(\d\d)(?:\s+(\d\d:\d\d))?/.exec(d || ''); if (!m) return ''; return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) + (m[4] ? ', ' + m[4] : ''); };
const mmss = s => { s = Math.round(s || 0); return Math.floor(s / 60) + ' min'; };
function sharePage({ title, desc, image, url, go }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escH(title)} · BF2 Round Replay</title>
<meta name="description" content="${escH(desc)}">
<meta property="og:site_name" content="BF2 Round Replay">
<meta property="og:type" content="website">
<meta property="og:title" content="${escH(title)}">
<meta property="og:description" content="${escH(desc)}">
${url ? `<meta property="og:url" content="${escH(url)}">\n` : ''}<meta property="og:image" content="${escH(image)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex">
<style>body{font:16px system-ui,sans-serif;background:#111614;color:#dfe5dc;margin:40px 20px}a{color:#e2b33c}</style>
</head><body>
<p>${escH(title)}<br><small>${escH(desc)}</small></p>
<p><a id="go" href="${escH(go(''))}">Open in BF2 Round Replay</a></p>
<script>(function(){var q=new URLSearchParams(location.search),x=[];['t','p','tab'].forEach(function(k){if(q.has(k))x.push(k+'='+encodeURIComponent(q.get(k)))});location.replace(${JSON.stringify(go('@@'))}.replace('@@',x.length?'&'+x.join('&'):''));})();</script>
</body></html>
`;
}
function writeShares(d, dec) {
  const base = DOMAIN ? `https://${DOMAIN}/` : '../';   // (previews want absolute links; without a domain, relative ones)
  const ogImg = map => base + 'assets/og/' + (fs.existsSync(path.join(SITE, 'assets', 'og', map + '.jpg')) ? map : 'site') + '.jpg';
  const mapName = m => dec.GAME?.maps?.[m]?.name || m;
  const want = { r: new Map(), p: new Map() };
  for (const r of d.rounds) {
    const s = r.sum; if (!s || s.empty) continue;
    const id = r.name.replace(/\.bf2demo(\.gz)?$/i, ''), m = mapOf(s), tk = s.tickets;
    const won = s.winner != null && s.teams ? `${s.teams[s.winner]} won${tk ? `, tickets ${tk[0][1]} : ${tk[1][1]}` : ''}` : tk ? `tickets ${tk[0][1]} : ${tk[1][1]}` : '';
    const desc = [won, mmss(s.duration), `${s.players} players`, `${s.kills} kills`, s.top ? `best: ${s.top.name} (${s.top.score})` : '', s.server].filter(Boolean).join(' · ');
    want.r.set(id, sharePage({ title: `${mapName(m)} · ${dayOf(s.date)}`, desc, image: ogImg(m), url: DOMAIN ? `${base}r/${id}` : '', go: x => `../#round=${encodeURIComponent(id)}${x}` }));
  }
  // players over all rounds (rounds.json is newest first: the first name seen is his latest)
  const P = new Map();
  for (const r of d.rounds) for (const p of r.sum?.P || []) {
    const k = nickOf(p.name); if (/^Player \d+$/.test(k)) continue;
    const a = P.get(k) || { name: p.name, rounds: 0, wins: 0, k: 0, d: 0, score: 0, first: '', last: '', maps: new Map() };
    a.rounds++; if (p.win) a.wins++; a.k += p.k; a.d += p.d; a.score += p.score || 0;
    const day = (r.sum.date || '').slice(0, 10); if (!a.last) a.last = day; a.first = day;
    const m = mapOf(r.sum); a.maps.set(m, (a.maps.get(m) || 0) + 1); P.set(k, a);
  }
  for (const [nick, a] of P) {
    const day = x => x ? dayOf(x).replace(/^\w+, /, '') : '', top = [...a.maps].sort((x, y) => y[1] - x[1])[0][0];
    const desc = [`${a.rounds} round${a.rounds === 1 ? '' : 's'}${a.first ? a.first === a.last ? ` on ${day(a.last)}` : ` from ${day(a.first)} to ${day(a.last)}` : ''}`,
      `${a.k} kills, ${a.d} deaths (K/D ${(a.k / Math.max(1, a.d)).toFixed(2)})`, `won ${a.wins}`, `≈ score ${a.score}`].join(' · ');
    const slug = nickSlug(nick);
    want.p.set(slug, sharePage({ title: a.name, desc, image: ogImg(top), url: DOMAIN ? `${base}p/${slug}` : '', go: x => `../#player=${encodeURIComponent(nick)}${x}` }));
  }
  for (const kind of ['r', 'p']) {
    const dir = path.join(SHARE_DIR, kind); fs.mkdirSync(dir, { recursive: true });
    for (const [id, html] of want[kind]) {
      const f = path.join(dir, id + '.html'); let old = null; try { old = fs.readFileSync(f, 'utf8'); } catch (e) {}
      if (old !== html) { fs.writeFileSync(f + '.tmp', html); fs.renameSync(f + '.tmp', f); }
    }
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.html') && !want[kind].has(f.slice(0, -5))) fs.unlinkSync(path.join(dir, f));
  }
}
// ---------- pages for search engines, RSS ----------
// The page itself shows rounds and players from data/rounds.json with script (#round=…, #player=…), which search engines
// can't list. ingest.mjs also writes plain pages into data/www, which the web server serves at /rounds/, /players/ and
// /maps/ (Caddyfile.in, nginx-example.conf): every round with its players and numbers, every player with his rounds,
// every map; links into the replay. With a domain (BF2R_DOMAIN) also /sitemap.xml and /robots.txt; /rss.xml lists the
// newest rounds (a feed reader shows each new round). Only files whose text changed are written; pages of rounds or
// players no longer listed go.
const WWW = path.join(DATA, 'www');
const WWW_CSS = `:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0e1310;color:#dde4d6;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:#e2b547;text-decoration:none}a:hover{text-decoration:underline}header{display:flex;flex-wrap:wrap;gap:8px 20px;align-items:baseline;padding:14px 20px;border-bottom:1px solid #2b3830;background:#151c17}
.brand{font:700 20px/1 "Arial Narrow",sans-serif;letter-spacing:.04em;color:#dde4d6}.brand b{color:#e2b547}nav{display:flex;flex-wrap:wrap;gap:16px}nav a{color:#8b9a89}nav a:hover{color:#dde4d6}
main{max-width:1100px;margin:0 auto;padding:20px 16px 40px}h1{font:700 28px/1.15 "Arial Narrow",sans-serif;letter-spacing:.02em;margin:6px 0 6px}h2{font-size:17px;margin:26px 0 8px}
.sub{color:#8b9a89;margin:0 0 14px}.go{display:inline-block;margin:6px 0 14px;padding:8px 14px;border-radius:4px;background:#e2b547;color:#17130a;font-weight:600}.go:hover{text-decoration:none;filter:brightness(1.08)}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:6px 10px;border-bottom:1px solid #2b3830;text-align:left;white-space:nowrap}th{color:#8b9a89;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}.t0{color:#ff6b4f}.t1{color:#5ea8ff}.mute{color:#8b9a89}.pic{float:right;width:min(220px,38vw);margin:0 0 12px 16px;border-radius:4px;border:1px solid #2b3830}
.months{display:flex;flex-wrap:wrap;gap:6px 14px}h3{font-size:14px;margin:16px 0 6px;color:#8b9a89}table.rec tbody th{text-transform:none;letter-spacing:0;font-size:13px;color:#dde4d6;white-space:normal;min-width:170px;vertical-align:top}table.rec td{vertical-align:top;line-height:1.35}footer{max-width:1100px;margin:0 auto;padding:0 16px 30px;color:#8b9a89;font-size:13px}`;
function wwwPage({ title, desc, canon, body, abs }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escH(title)} · BF2 Round Replay</title>
<meta name="description" content="${escH(desc)}">
${abs ? `<link rel="canonical" href="${escH(abs + canon.replace(/^\//, ''))}">\n` : ''}<link rel="alternate" type="application/rss+xml" title="BF2 Round Replay: new rounds" href="/rss.xml">
<meta property="og:site_name" content="BF2 Round Replay"><meta property="og:title" content="${escH(title)}"><meta property="og:description" content="${escH(desc)}">
<style>${WWW_CSS}</style>
</head><body>
<header><a class="brand" href="/">BF2 <b>Round</b> Replay</a><nav><a href="/rounds/">Rounds</a><a href="/players/">Players</a><a href="/maps/">Maps</a><a href="/records/">Records</a><a href="/rss.xml">RSS</a></nav></header>
<main>
${body}
</main>
<footer>Battlefield 2 rounds from the Battle Recorder, decoded: every round can be watched on the map in <a href="/">BF2 Round Replay</a>.</footer>
</body></html>
`;
}
const WWW_VER = 2;   // (raise when the pages change: they are all written again; 2: records)
function writeWww(d, dec) {
  const abs = DOMAIN ? `https://${DOMAIN}/` : '';
  // nothing new (the same rounds, decoder, domain and pages as last time: bf2replay-reprocess runs this every minute): skip
  // (and the day: the records page's week and month move on)
  const stamp = crypto.createHash('sha1').update(JSON.stringify([WWW_VER, abs, !!d.share, new Date().toISOString().slice(0, 10), d.rounds.map(r => [r.name, r.decoder, r.added])])).digest('hex'), stampF = path.join(WWW, '.stamp');
  try { if (fs.readFileSync(stampF, 'utf8') === stamp) return; } catch (e) {}
  const mapName = m => dec.GAME?.maps?.[m]?.name || m;
  const idOf = name => name.replace(/\.bf2demo(\.gz)?$/i, '');
  const mk = s => mapOf(s).replace(/[^a-z0-9_-]+/g, '_');   // (a map's key as a file name)
  const R = d.rounds.filter(r => r.sum && !r.sum.empty && /^[A-Za-z0-9_.-]+$/.test(idOf(r.name)));   // (newest first)
  const files = new Map();   // path under www -> text
  const kd = (k, dd) => (k / Math.max(1, dd)).toFixed(2);
  const hasPic = m => fs.existsSync(path.join(SITE, 'assets', 'maps', m + '.webp'));
  const result = s => s.winner != null && s.teams ? `<span class="t${s.winner}">${escH(s.teams[s.winner])}</span> won${s.tickets ? ` <span class="mute">${s.tickets[0][1]} : ${s.tickets[1][1]}</span>` : ''}` : s.tickets ? `<span class="mute">${s.tickets[0][1]} : ${s.tickets[1][1]}</span>` : '–';
  const resultTxt = s => s.winner != null && s.teams ? `${s.teams[s.winner]} won${s.tickets ? `, tickets ${s.tickets[0][1]} : ${s.tickets[1][1]}` : ''}` : s.tickets ? `tickets ${s.tickets[0][1]} : ${s.tickets[1][1]}` : '';
  const roundDesc = s => [resultTxt(s), mmss(s.duration), `${s.players} players`, `${s.kills} kills`, s.top ? `best: ${s.top.name} (${s.top.score})` : '', s.server].filter(Boolean).join(' · ');
  // players over all rounds (by nick, as the page and the link previews)
  const P = new Map();
  for (const r of R) for (const p of r.sum.P || []) {
    const k = nickOf(p.name); if (/^Player \d+$/.test(k)) continue;
    const a = P.get(k) || { nick: k, name: p.name, names: new Set(), rounds: [], k: 0, d: 0, score: 0, wins: 0, hs: 0 };
    a.names.add(p.name); a.rounds.push({ r, p }); a.k += p.k; a.d += p.d; a.score += p.score || 0; a.hs += p.hs || 0; if (p.win) a.wins++;
    P.set(k, a);
  }
  const plink = name => { const k = nickOf(name); return P.has(k) ? `<a href="/players/${escH(nickSlug(k))}.html">${escH(name)}</a>` : escH(name); };
  const roundRow = (r, cols) => {
    const s = r.sum, id = idOf(r.name);
    return `<tr><td><a href="/rounds/${escH(id)}.html">${escH(dayOf(s.date))}</a></td>${cols.map ? `<td><a href="/maps/${escH(mk(s))}.html">${escH(mapName(mapOf(s)))}</a></td>` : ''}${cols.server ? `<td class="mute">${escH(s.server)}</td>` : ''}<td class="n">${mmss(s.duration)}</td><td class="n">${s.players}</td><td class="n">${s.kills}</td><td>${result(s)}</td><td>${s.top ? `${plink(s.top.name)} <span class="mute">${s.top.score}</span>` : ''}</td></tr>`;
  };
  const roundTable = (list, cols) => `<div class="wrap"><table><thead><tr><th>Started</th>${cols.map ? '<th>Map</th>' : ''}${cols.server ? '<th>Server</th>' : ''}<th class="n">Length</th><th class="n">Players</th><th class="n">Kills</th><th>Result</th><th>Best ≈ score</th></tr></thead><tbody>
${list.map(r => roundRow(r, cols)).join('\n')}
</tbody></table></div>`;
  const servers = new Set(R.map(r => r.sum.server)), manySrv = servers.size > 1;
  // rounds: the newest 100, then month by month
  const months = new Map(); for (const r of R) { const m = (r.sum.date || '').slice(0, 7) || 'unknown'; if (!months.has(m)) months.set(m, []); months.get(m).push(r); }
  const monthName = m => { const x = /^(\d{4})-(\d\d)$/.exec(m); return x ? new Date(Date.UTC(+x[1], +x[2] - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'Date unknown'; };
  const monthLinks = `<div class="months">${[...months].map(([m, L]) => `<a href="/rounds/${escH(m)}.html">${escH(monthName(m))}</a> <span class="mute">${L.length}</span>`).join(' ')}</div>`;
  files.set('rounds/index.html', wwwPage({ abs, canon: '/rounds/', title: 'Battlefield 2 rounds', desc: `${R.length} Battlefield 2 rounds from the Battle Recorder: map, players, kills, result; each one to watch on the map.`,
    body: `<h1>Battlefield 2 rounds</h1><p class="sub">${R.length} rounds${manySrv ? ` from ${servers.size} servers` : ''}, newest first. Each one opens on the map: who went where, who killed whom.</p>
${roundTable(R.slice(0, 100), { map: true, server: manySrv })}
<h2>By month</h2>${monthLinks}` }));
  for (const [m, L] of months) files.set(`rounds/${m}.html`, wwwPage({ abs, canon: `/rounds/${m}.html`, title: `Battlefield 2 rounds · ${monthName(m)}`, desc: `${L.length} Battlefield 2 rounds played in ${monthName(m)}.`,
    body: `<h1>Rounds · ${escH(monthName(m))}</h1><p class="sub">${L.length} rounds. <a href="/rounds/">All rounds</a></p>${roundTable(L, { map: true, server: manySrv })}<h2>Other months</h2>${monthLinks}` }));
  // one round: its sides and players
  for (const r of R) {
    const s = r.sum, id = idOf(r.name), m = mapOf(s), mf = mk(s);
    const sides = [0, 1].map(tm => (s.P || []).filter(p => p.team === tm).sort((a, b) => (b.score || 0) - (a.score || 0) || b.k - a.k));
    const side = (tm, L) => L.length ? `<h2><span class="t${tm}">${escH(s.teams?.[tm] || 'Team ' + (tm + 1))}</span>${s.winner === tm ? ' · won' : ''}${s.tickets ? ` <span class="mute">tickets ${s.tickets[tm][0]} → ${s.tickets[tm][1]}</span>` : ''}</h2>
<div class="wrap"><table><thead><tr><th>Player</th><th class="n">≈ Score</th><th class="n">Kills</th><th class="n">Deaths</th><th class="n">Headshots</th><th class="n">Best streak</th><th class="n">Revives</th></tr></thead><tbody>
${L.map(p => `<tr><td>${plink(p.name)}</td><td class="n">${p.score || 0}</td><td class="n">${p.k}</td><td class="n">${p.d}</td><td class="n">${p.hs || 0}</td><td class="n">${p.streak || '–'}</td><td class="n">${p.rev || 0}</td></tr>`).join('\n')}
</tbody></table></div>` : '';
    files.set(`rounds/${id}.html`, wwwPage({ abs, canon: `/rounds/${id}.html`, title: `${mapName(m)} · ${dayOf(s.date)}`, desc: `Battlefield 2 on ${mapName(m)}: ${roundDesc(s)}.`,
      body: `${hasPic(m) ? `<img class="pic" src="/assets/maps/${escH(m)}.webp" alt="Map of ${escH(mapName(m))}" width="220" height="220">` : ''}<h1>${escH(mapName(m))} · ${escH(dayOf(s.date))}</h1>
<p class="sub">${escH(s.server)} · ${mmss(s.duration)} · ${s.players} players · ${s.kills} kills</p><p>${result(s)}</p>
<a class="go" href="/#round=${encodeURIComponent(id)}">▶ Watch the round on the map</a> <a href="/maps/${escH(mf)}.html">More rounds on ${escH(mapName(m))}</a>
${side(0, sides[0])}${side(1, sides[1])}` }));
  }
  // players: everyone with his rounds
  const PL = [...P.values()].sort((a, b) => b.rounds.length - a.rounds.length || b.k - a.k);
  files.set('players/index.html', wwwPage({ abs, canon: '/players/', title: 'Battlefield 2 players', desc: `${PL.length} Battlefield 2 players: rounds, kills, deaths, K/D.`,
    body: `<h1>Players</h1><p class="sub">${PL.length} players over ${R.length} rounds, most rounds first. One player under several clan tags is one row.</p>
<div class="wrap"><table><thead><tr><th>Player</th><th class="n">Rounds</th><th class="n">Won</th><th class="n">Kills</th><th class="n">Deaths</th><th class="n">K/D</th><th class="n">≈ Score</th><th>Last played</th></tr></thead><tbody>
${PL.map(a => `<tr><td><a href="/players/${escH(nickSlug(a.nick))}.html">${escH(a.name)}</a></td><td class="n">${a.rounds.length}</td><td class="n">${a.wins}</td><td class="n">${a.k}</td><td class="n">${a.d}</td><td class="n">${kd(a.k, a.d)}</td><td class="n">${a.score}</td><td class="mute">${escH(dayOf(a.rounds[0].r.sum.date).replace(/, \d\d:\d\d$/, ''))}</td></tr>`).join('\n')}
</tbody></table></div>` }));
  for (const a of PL) {
    const slug = nickSlug(a.nick), maps = new Map(); for (const { r } of a.rounds) maps.set(mk(r.sum), (maps.get(mk(r.sum)) || 0) + 1);
    const aka = [...a.names].filter(x => x !== a.name);
    files.set(`players/${slug}.html`, wwwPage({ abs, canon: `/players/${slug}.html`, title: `${a.name} · Battlefield 2 player`, desc: `${a.name} in Battlefield 2: ${a.rounds.length} rounds, ${a.k} kills, ${a.d} deaths (K/D ${kd(a.k, a.d)}), won ${a.wins}.`,
      body: `<h1>${escH(a.name)}</h1><p class="sub">${aka.length ? `also as ${aka.map(escH).join(', ')} · ` : ''}${a.rounds.length} rounds · ${a.k} kills · ${a.d} deaths · K/D ${kd(a.k, a.d)} · won ${a.wins} · ≈ score ${a.score}${a.hs ? ` · ${a.hs} headshots` : ''}</p>
<a class="go" href="/#player=${encodeURIComponent(a.nick)}">▶ His page in the replay</a>
<h2>Maps</h2><p>${[...maps].sort((x, y) => y[1] - x[1]).map(([m, c]) => `<a href="/maps/${escH(m)}.html">${escH(mapName(m))}</a> <span class="mute">${c}</span>`).join(' · ')}</p>
<h2>Rounds</h2><div class="wrap"><table><thead><tr><th>Started</th><th>Map</th><th>Side</th><th>Result</th><th class="n">≈ Score</th><th class="n">Kills</th><th class="n">Deaths</th></tr></thead><tbody>
${a.rounds.map(({ r, p }) => { const s = r.sum; return `<tr><td><a href="/rounds/${escH(idOf(r.name))}.html">${escH(dayOf(s.date))}</a></td><td>${escH(mapName(mapOf(s)))}</td><td><span class="t${p.team}">${escH(s.teams?.[p.team] || '')}</span></td><td>${s.winner == null ? '–' : p.win ? 'Won' : 'Lost'}</td><td class="n">${p.score || 0}</td><td class="n">${p.k}</td><td class="n">${p.d}</td></tr>`; }).join('\n')}
</tbody></table></div>` }));
  }
  // maps
  const M = new Map(); for (const r of R) { const m = mk(r.sum); if (!M.has(m)) M.set(m, []); M.get(m).push(r); }
  const ML = [...M].sort((a, b) => b[1].length - a[1].length);
  files.set('maps/index.html', wwwPage({ abs, canon: '/maps/', title: 'Battlefield 2 maps', desc: `Battlefield 2 rounds by map: ${ML.map(([m, L]) => `${mapName(m)} (${L.length})`).join(', ')}.`,
    body: `<h1>Maps</h1><p class="sub">${ML.length} maps, ${R.length} rounds.</p><div class="wrap"><table><thead><tr><th>Map</th><th class="n">Rounds</th><th class="n">Kills</th><th>Last played</th></tr></thead><tbody>
${ML.map(([m, L]) => `<tr><td><a href="/maps/${escH(m)}.html">${escH(mapName(m))}</a></td><td class="n">${L.length}</td><td class="n">${L.reduce((x, r) => x + r.sum.kills, 0)}</td><td class="mute">${escH(dayOf(L[0].sum.date))}</td></tr>`).join('\n')}
</tbody></table></div>` }));
  for (const [m, L] of ML) {
    const top = new Map(); for (const r of L) for (const p of r.sum.P || []) { const k = nickOf(p.name); if (!P.has(k)) continue; const x = top.get(k) || { name: p.name, n: 0, k: 0, d: 0 }; x.n++; x.k += p.k; x.d += p.d; top.set(k, x); }
    const T = [...top.values()].sort((a, b) => b.k - a.k).slice(0, 20), wins = [0, 0], teams = L[0].sum.teams || [];
    for (const r of L) if (r.sum.winner === 0 || r.sum.winner === 1) wins[r.sum.winner]++;
    files.set(`maps/${m}.html`, wwwPage({ abs, canon: `/maps/${m}.html`, title: `${mapName(m)} · Battlefield 2 rounds`, desc: `${L.length} Battlefield 2 rounds on ${mapName(m)}: who plays there most, who kills most, every round to watch.`,
      body: `${hasPic(m) ? `<img class="pic" src="/assets/maps/${escH(m)}.webp" alt="Map of ${escH(mapName(m))}" width="220" height="220">` : ''}<h1>${escH(mapName(m))}</h1>
<p class="sub">${L.length} rounds · ${L.reduce((x, r) => x + r.sum.kills, 0)} kills${teams.length === 2 ? ` · <span class="t0">${escH(teams[0])}</span> won ${wins[0]}, <span class="t1">${escH(teams[1])}</span> ${wins[1]}` : ''}</p>
<a class="go" href="/#map=${encodeURIComponent(m)}">▶ Where they die on ${escH(mapName(m))}</a>
<h2>Most kills here</h2><div class="wrap"><table><thead><tr><th>Player</th><th class="n">Rounds</th><th class="n">Kills</th><th class="n">Deaths</th><th class="n">K/D</th></tr></thead><tbody>
${T.map(x => `<tr><td>${plink(x.name)}</td><td class="n">${x.n}</td><td class="n">${x.k}</td><td class="n">${x.d}</td><td class="n">${kd(x.k, x.d)}</td></tr>`).join('\n')}
</tbody></table></div>
<h2>Rounds</h2>${roundTable(L, { map: false, server: manySrv })}` }));
  }
  // records (v120, todo 113): the best in one round over the last 7 days, the last 30 and ever, from each round's summary
  // (kills, streak, longest kill, headshots, kills from vehicles, revives, repairs, score, K/D with 10 kills or more), and
  // who did most over each stretch (by score, as the page reckons it)
  const when = r => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(r.sum.date || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : Date.parse(r.added || '') || 0; };
  const REC = [['k', 'Most kills', v => v], ['streak', 'Longest streak (kills without dying)', v => v], ['long', 'Longest kill', v => v + ' m'], ['hs', 'Most headshots', v => v],
    ['kVeh', 'Most kills from vehicles', v => v], ['rev', 'Most revives', v => v], ['rep', 'Most repairs', v => v], ['score', 'Best score (≈)', v => v], ['kd', 'Best K/D (10 kills or more)', v => v.toFixed(2)]];
  const recVal = (p, key) => key === 'kd' ? (p.k >= 10 ? p.k / Math.max(1, p.d) : 0) : (p[key] || 0);
  const oneMap = new Set(R.map(r => mapOf(r.sum))).size < 2, shortDay = d => { const m = /^(\d{4})-(\d\d)-(\d\d)(?:\s+(\d\d:\d\d))?/.exec(d || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) + (m[4] ? ' ' + m[4] : '') : ''; };
  const rlink = r => `<a href="/rounds/${escH(idOf(r.name))}.html">${escH(shortDay(r.sum.date))}</a>${oneMap ? '' : ` <span class="mute">${escH(mapName(mapOf(r.sum)))}</span>`}`;
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const PER = [['week', 'The last 7 days', 7], ['month', 'The last 30 days', 30], ['ever', 'All rounds', Infinity]];
  const recSection = ([key, title, days]) => {
    const L = R.filter(r => days === Infinity || when(r) > today - days * 86400e3); if (!L.length) return `<h2>${escH(title)}</h2><p class="mute">No rounds.</p>`;
    const rows = REC.map(([k, name, fmt]) => {
      const all = []; for (const r of L) for (const p of r.sum.P || []) { if (/^Player \d+$/.test(nickOf(p.name))) continue; const v = recVal(p, k); if (v > 0) all.push({ v, p, r }); }
      all.sort((a, b) => b.v - a.v || when(a.r) - when(b.r)); const top = all.slice(0, 3);
      return top.length ? `<tr><th>${escH(name)}</th>${top.map((x, i) => `<td${i ? ' class="mute"' : ''}><b>${escH(String(fmt(x.v)))}</b> ${plink(x.p.name)}<br>${rlink(x.r)}</td>`).join('')}${'<td></td>'.repeat(3 - top.length)}</tr>` : '';
    }).join('\n');
    const tot = new Map(); for (const r of L) for (const p of r.sum.P || []) { const k = nickOf(p.name); if (!P.has(k)) continue; const a = tot.get(k) || { name: p.name, n: 0, k: 0, d: 0, score: 0, rev: 0, wins: 0 }; a.n++; a.k += p.k; a.d += p.d; a.score += p.score || 0; a.rev += p.rev || 0; if (p.win) a.wins++; tot.set(k, a); }
    const T = [...tot.values()].sort((a, b) => b.score - a.score || b.k - a.k).slice(0, 10);
    return `<h2 id="${key}">${escH(title)} <span class="mute">${L.length} round${L.length === 1 ? '' : 's'}</span></h2>
<div class="wrap"><table class="rec"><thead><tr><th>In one round</th><th>1st</th><th>2nd</th><th>3rd</th></tr></thead><tbody>
${rows}
</tbody></table></div>
<h3>Most over ${escH(days === Infinity ? 'all rounds' : 'these ' + days + ' days')}</h3><div class="wrap"><table><thead><tr><th>Player</th><th class="n">≈ Score</th><th class="n">Rounds</th><th class="n">Won</th><th class="n">Kills</th><th class="n">Deaths</th><th class="n">K/D</th><th class="n">Revives</th></tr></thead><tbody>
${T.map(a => `<tr><td>${plink(a.name)}</td><td class="n">${a.score}</td><td class="n">${a.n}</td><td class="n">${a.wins}</td><td class="n">${a.k}</td><td class="n">${a.d}</td><td class="n">${kd(a.k, a.d)}</td><td class="n">${a.rev}</td></tr>`).join('\n')}
</tbody></table></div>`;
  };
  files.set('records/index.html', wwwPage({ abs, canon: '/records/', title: 'Battlefield 2 records', desc: `Records of ${R.length} Battlefield 2 rounds: most kills, longest kill, longest streak, best medic, this week, this month and ever.`,
    body: `<h1>Records</h1><p class="sub">The best in one round, and who did most: <a href="#week">the last 7 days</a> · <a href="#month">the last 30 days</a> · <a href="#ever">all rounds</a>. Scores as the replay reckons them from the round's events.</p>
${PER.map(recSection).join('\n')}` }));
  // the feed: the newest 50 rounds
  const rfc = iso => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? new Date(t).toUTCString() : new Date().toUTCString(); };
  const site = abs || '/';
  files.set('rss.xml', `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>BF2 Round Replay: new rounds</title>
<link>${escH(site)}</link>
<description>New Battlefield 2 rounds, decoded from the Battle Recorder: each one to watch on the map.</description>
<language>en</language>
${abs ? `<atom:link href="${escH(abs)}rss.xml" rel="self" type="application/rss+xml"/>\n` : ''}${R.length ? `<lastBuildDate>${rfc(R.map(r => r.added).filter(Boolean).sort().pop())}</lastBuildDate>\n` : ''}${R.slice().sort((a, b) => String(b.added || '').localeCompare(String(a.added || ''))).slice(0, 50).map(r => {
    const s = r.sum, id = idOf(r.name);
    return `<item><title>${escH(`${mapName(mapOf(s))} · ${dayOf(s.date)}`)}</title><link>${escH(`${site}${d.share ? 'r/' + id : '#round=' + encodeURIComponent(id)}`)}</link><guid isPermaLink="false">bf2rr-${escH(id)}</guid><pubDate>${rfc(r.added)}</pubDate><description>${escH(roundDesc(s))}</description></item>`;
  }).join('\n')}
</channel></rss>
`);
  if (abs) {
    const urls = ['', 'rounds/', 'players/', 'maps/', 'records/', ...[...months.keys()].map(m => `rounds/${m}.html`), ...R.map(r => `rounds/${idOf(r.name)}.html`), ...PL.map(a => `players/${nickSlug(a.nick)}.html`), ...ML.map(([m]) => `maps/${m}.html`)];
    files.set('sitemap.xml', `<?xml version="1.0" encoding="utf-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${escH(abs + u)}</loc></url>`).join('\n')}\n</urlset>\n`);
    files.set('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${abs}sitemap.xml\n`);
  }
  // write what changed; remove what is no longer listed
  fs.mkdirSync(WWW, { recursive: true });
  for (const [rel, text] of files) {
    const f = path.join(WWW, rel); fs.mkdirSync(path.dirname(f), { recursive: true });
    let old = null; try { old = fs.readFileSync(f, 'utf8'); } catch (e) {}
    if (old !== text) { fs.writeFileSync(f + '.tmp', text); fs.renameSync(f + '.tmp', f); }
  }
  for (const dir of ['', 'rounds', 'players', 'maps', 'records']) {
    let L = []; try { L = fs.readdirSync(path.join(WWW, dir)); } catch (e) {}
    for (const f of L) { const rel = dir ? `${dir}/${f}` : f; if (/\.(html|xml|txt)$/.test(f) && !files.has(rel)) fs.unlinkSync(path.join(WWW, rel)); }
  }
  fs.writeFileSync(stampF, stamp);
}
// a round off the list: its demo goes (to data/empty with BF2R_KEEP_EMPTY), its decoded round and kill spots too
function dropRound(idx, name, src) {
  try { if (src && fs.existsSync(src)) { if (KEEP_EMPTY) fs.renameSync(src, path.join(DIRS.empty, name)); else fs.unlinkSync(src); } } catch (e) { log('could not remove', name, '-', e.message); }
  const base = baseOf(name);
  for (const f of fs.readdirSync(DIRS.rounds)) if (f.startsWith(base + '.')) fs.unlinkSync(path.join(DIRS.rounds, f));
  const old = idx.rounds.findIndex(r => r.name === name); if (old >= 0) idx.rounds.splice(old, 1);
  heatPut(name, null);
}
// the heavy part of a demo, also in a worker thread: decoded, summed up, packed (.bfr) - { sum, info, bfr } or { sum, drop }
async function decodeWork(dec, src, name) {
  const { tl, hdr, info } = await decodeFile(dec, src), sum = tl ? summarize(tl, hdr, dec.killCause) : null;
  if (!tl || sum.empty || sum.players < MIN_PLAYERS) return { sum, drop: true };
  return { sum, info, bfr: bfrBuild({ name, info, tl }) };
}
async function processDemo(dec, idx, src, name, { move, pre, t0 = Date.now(), note = '' }) {
  const { sum, info, bfr, drop } = pre || await decodeWork(dec, src, name);
  const old = idx.rounds.findIndex(r => r.name === name);
  if (drop) {
    // nobody played (no spawn, or nobody was ever alive on the field), or fewer than BF2R_MIN_PLAYERS did (one soldier
    // alone on an empty server): no round to list
    dropRound(idx, name, src);
    log(sum && !sum.empty ? `round with ${sum.players} player${sum.players === 1 ? '' : 's'} (not listed: BF2R_MIN_PLAYERS ${MIN_PLAYERS})` : 'empty round', name);
    return;
  }
  const base = baseOf(name), bfrName = `${base}.${dec.hash}.bfr`;
  for (const f of fs.readdirSync(DIRS.rounds)) if (f.startsWith(base + '.') && f !== bfrName) fs.unlinkSync(path.join(DIRS.rounds, f));   // made by an older decoder
  const tmp = path.join(DIRS.rounds, bfrName + '.tmp');
  fs.writeFileSync(tmp, bfr); fs.renameSync(tmp, path.join(DIRS.rounds, bfrName));
  if (move) fs.renameSync(src, path.join(DIRS.demos, name));
  const entry = { name, demo: 'demos/' + name, bfr: 'rounds/' + bfrName, bytes: info.bytes, bfrBytes: bfr.length, decoder: dec.hash, added: old >= 0 ? idx.rounds[old].added : new Date().toISOString(), sum };
  heatPut(name, entry.sum);
  if (old >= 0) idx.rounds[old] = entry; else idx.rounds.push(entry);
  log('round', name, `${(info.bytes / 1e6).toFixed(1)} MB -> ${(bfr.length / 1e6).toFixed(1)} MB`, `${entry.sum.players} players, ${entry.sum.kills} kills`, `${((Date.now() - t0) / 1000).toFixed(1)} s`, note);
}
// worker threads for decoding many demos: each loads the page's decoder itself (the same file: the same hash)
class Pool {
  constructor(n, hash) { this.free = []; this.all = []; this.wait = []; for (let i = 0; i < n; i++) { const w = new Worker(new URL(import.meta.url), { workerData: { hash } }); w.unref(); this.all.push(w); this.free.push(w); } }
  run(src, name) {
    return new Promise((res, rej) => {
      const go = w => { w.once('message', m => { this.free.push(w); if (this.wait.length) this.wait.shift()(); m.ok ? res(m.r) : rej(new Error(m.err)); }); w.postMessage({ src, name }); };
      const w = this.free.pop(); if (w) go(w); else this.wait.push(() => go(this.free.pop()));
    });
  }
  close() { for (const w of this.all) w.terminate(); }
}
const hm = s => s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round(s % 3600 / 60)} min` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`;

async function main() {
  for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });
  const dec = loadDecoder(), idx = readIndex();
  let changed = false;
  // rounds listed before with fewer players than BF2R_MIN_PLAYERS (set or raised since) leave the list
  for (const r of idx.rounds.filter(r => r.sum && !r.sum.empty && r.sum.players < MIN_PLAYERS)) {
    dropRound(idx, r.name, path.join(DIRS.demos, r.name)); changed = true;
    log(`round with ${r.sum.players} player${r.sum.players === 1 ? '' : 's'} taken off the list (BF2R_MIN_PLAYERS ${MIN_PLAYERS})`, r.name);
  }
  // 1. new demos (and round logger files) from the game server(s); a name ending .part is still being uploaded
  let incoming = []; try { incoming = fs.readdirSync(INC); } catch (e) { log('no upload folder', INC); }
  for (const f of incoming.sort()) {
    const src = path.join(INC, f);
    if (f.endsWith('.part') || !fs.statSync(src).isFile()) continue;
    if (/^round_.*\.json$/i.test(f)) { fs.renameSync(src, path.join(DIRS.logs, f)); log('round log', f); continue; }
    if (!/\.bf2demo(\.gz)?$/i.test(f)) continue;
    if (fs.existsSync(path.join(DIRS.demos, f)) && idx.rounds.some(r => r.name === f)) { fs.unlinkSync(src); log('already have', f); continue; }   // (sent twice)
    try { await processDemo(dec, idx, src, f, { move: true }); changed = true; }
    catch (e) { log('could not read', f, '-', e.message); try { fs.renameSync(src, path.join(DIRS.bad, f)); } catch (e2) {} }
    writeIndex(idx, dec);   // after each round, so the site lists it at once
  }
  // 2. after a site update: rounds made by another decoder are decoded again from their demo
  if (args.has('--reprocess') || args.has('--rebuild')) {
    const all = args.has('--rebuild') ? fs.readdirSync(DIRS.demos).filter(f => /\.bf2demo(\.gz)?$/i.test(f)) : idx.rounds.filter(r => r.decoder !== dec.hash).map(r => r.name);
    if (args.has('--rebuild')) idx.rounds = idx.rounds.filter(r => all.includes(r.name) || fs.existsSync(path.join(DATA, r.bfr)));
    const names = all.filter(name => { if (fs.existsSync(path.join(DIRS.demos, name))) return true; log('no demo left for', name, '(kept as it was)'); return false; });
    if (names.length) {
      // (newest rounds first: rounds.json lists them so; several at once in worker threads; progress kept in rounds.json)
      const jobs = Math.min(JOBS, names.length), pool = jobs > 1 ? new Pool(jobs, dec.hash) : null, t0 = Date.now(), P = { hash: dec.hash, total: names.length, done: 0, jobs, since: new Date(t0).toISOString() };
      idx.reprocess = P; writeIndex(idx, dec);
      log(`decoding ${names.length} rounds again with decoder ${dec.hash}, ${jobs} at once`);
      let next = 0;
      const one = async () => {
        while (next < names.length) {
          const name = names[next++], src = path.join(DIRS.demos, name), t1 = Date.now();
          let pre = null; try { pre = pool ? await pool.run(src, name) : await decodeWork(dec, src, name); } catch (e) { log('could not decode again', name, '-', e.message); }
          P.done++; const el = (Date.now() - t0) / 1000, left = el / P.done * (P.total - P.done); P.left = Math.round(left);
          if (pre) { try { await processDemo(dec, idx, src, name, { move: false, pre, t0: t1, note: `[${P.done}/${P.total} ${Math.floor(100 * P.done / P.total)}%${P.done < P.total ? ', ~' + hm(left) + ' left' : ''}]` }); changed = true; } catch (e) { log('could not write', name, '-', e.message); } }
          writeIndex(idx, dec);
        }
      };
      try { await Promise.all(Array.from({ length: jobs }, one)); } finally { if (pool) pool.close(); }
      log(`decoded ${P.total} rounds again in ${hm((Date.now() - t0) / 1000)}`);
    }
    if (idx.reprocess) { const P = idx.reprocess; delete idx.reprocess; changed = true; writeProgress({ ...P, left: 0, end: new Date().toISOString() }); }   // (the tag: done)
  }
  // 3. demos older than BF2R_RAW_KEEP_DAYS go (the decoded round stays and still opens)
  if (RAW_KEEP_DAYS > 0) {
    const limit = Date.now() - RAW_KEEP_DAYS * 86400e3;
    for (const r of idx.rounds) {
      const f = path.join(DIRS.demos, r.name);
      if (r.demo && fs.existsSync(f) && fs.statSync(f).mtimeMs < limit) { fs.unlinkSync(f); delete r.demo; changed = true; log('demo removed (kept', RAW_KEEP_DAYS, 'days):', r.name); }
    }
  }
  // 4. a nearly full disk (under BF2R_MIN_FREE_GB + 2 GB free): the oldest demos go (their rounds stay and still open, as
  // with BF2R_RAW_KEEP_DAYS, but can't be decoded again after a site update) until 2 GB more than that are free - so new
  // rounds keep coming (fetch.mjs stops downloading under BF2R_MIN_FREE_GB). BF2R_RAW_AUTOCLEAN=0: never.
  const free = () => { try { const st = fs.statfsSync(DATA); return st.bavail * st.bsize; } catch (e) { return Infinity; } };
  if (RAW_AUTOCLEAN && MIN_FREE > 0 && free() < MIN_FREE + 2 * 2 ** 30) {
    const old = idx.rounds.filter(r => r.demo && fs.existsSync(path.join(DIRS.demos, r.name))).map(r => [r, fs.statSync(path.join(DIRS.demos, r.name)).mtimeMs]).sort((a, b) => a[1] - b[1]);
    let n = 0, bytes = 0;
    for (const [r] of old) {
      if (free() >= MIN_FREE + 2 * 2 ** 30) break;
      const f = path.join(DIRS.demos, r.name); try { bytes += fs.statSync(f).size; fs.unlinkSync(f); delete r.demo; changed = true; n++; } catch (e) {}
    }
    if (n) log(`disk nearly full: removed the ${n} oldest demos (${(bytes / 2 ** 30).toFixed(1)} GB; their rounds stay), ${(free() / 2 ** 30).toFixed(1)} GB free now`);
    else if (free() < MIN_FREE) log(`disk nearly full (${(free() / 2 ** 30).toFixed(1)} GB free) and no demos left to remove: new rounds wait (BF2R_MIN_FREE_GB ${MIN_FREE / 2 ** 30})`);
  }
  if (changed || idx.moved || !idx.heat || !fs.existsSync(INDEX)) writeIndex(idx, dec);
  else { try { writeShares(idx, dec); } catch (e) { log('link previews not written:', e.message); } }   // (a new domain or preview pictures after a site update; only changed files are written)
  try { writeWww(idx, dec); } catch (e) { log('pages for search engines not written:', e.message); }
}
if (isMainThread) main().catch(e => { log('error:', e.stack || e.message); process.exit(1); });
else {   // a decoding worker (Pool): the page's decoder, one demo at a time
  const dec = loadDecoder();
  parentPort.on('message', async ({ src, name }) => {
    try { if (dec.hash !== workerData.hash) throw new Error('the site changed while decoding (decoder ' + dec.hash + ')'); parentPort.postMessage({ ok: true, r: await decodeWork(dec, src, name) }); }
    catch (e) { parentPort.postMessage({ ok: false, err: e.message }); }
  });
}
