#!/usr/bin/env node
// BF2 Round Replay - server side: turns new demos (downloaded by fetch.mjs, or sent by a game server) into rounds the site lists and opens at once.
//
//   node ingest.mjs              new demos in upload/incoming -> data/demos (the demo), data/rounds (decoded), rounds.json,
//                                data/heat/<map>.json (every kill's spot, for heatmaps and player pages),
//                                data/share/r|p/*.html (link previews: /r/<round>, /p/<player>)
//   node ingest.mjs --reprocess  also decode again every round made by an older decoder (after a site update)
//   node ingest.mjs --rebuild    decode every kept demo again and write rounds.json from scratch
//
// The decoder is the page's own (the part of site/index.html between "// @worker-begin" and "// @worker-end"), so the
// server and the browsers always decode the same way. Settings: /etc/bf2replay.conf (BF2R_ROOT, BF2R_KEEP_EMPTY, BF2R_MIN_PLAYERS,
// BF2R_RAW_KEEP_DAYS), or the same names in the environment.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

// ---------- settings ----------
const conf = {};
try { for (const line of fs.readFileSync('/etc/bf2replay.conf', 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/.exec(line); if (m) conf[m[1]] = m[2]; } } catch (e) { /* no file: defaults */ }
const opt = (k, d) => process.env[k] ?? conf[k] ?? d;
const ROOT = opt('BF2R_ROOT', '/srv/bf2replay');
const KEEP_EMPTY = opt('BF2R_KEEP_EMPTY', '0') === '1';      // keep demos of rounds nobody played (in data/empty)
const MIN_PLAYERS = Math.max(1, Math.floor(+opt('BF2R_MIN_PLAYERS', '2') || 2));   // fewer players on the field: not listed
const RAW_KEEP_DAYS = +opt('BF2R_RAW_KEEP_DAYS', '0');       // delete the demo itself after so many days (0: never); the decoded round stays
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
// a round off the list: its demo goes (to data/empty with BF2R_KEEP_EMPTY), its decoded round and kill spots too
function dropRound(idx, name, src) {
  try { if (src && fs.existsSync(src)) { if (KEEP_EMPTY) fs.renameSync(src, path.join(DIRS.empty, name)); else fs.unlinkSync(src); } } catch (e) { log('could not remove', name, '-', e.message); }
  const base = baseOf(name);
  for (const f of fs.readdirSync(DIRS.rounds)) if (f.startsWith(base + '.')) fs.unlinkSync(path.join(DIRS.rounds, f));
  const old = idx.rounds.findIndex(r => r.name === name); if (old >= 0) idx.rounds.splice(old, 1);
  heatPut(name, null);
}
async function processDemo(dec, idx, src, name, { move }) {
  const t0 = Date.now(), { tl, hdr, info } = await decodeFile(dec, src);
  const old = idx.rounds.findIndex(r => r.name === name), sum = tl ? summarize(tl, hdr, dec.killCause) : null;
  if (!tl || sum.empty || sum.players < MIN_PLAYERS) {
    // nobody played (no spawn, or nobody was ever alive on the field), or fewer than BF2R_MIN_PLAYERS did (one soldier
    // alone on an empty server): no round to list
    dropRound(idx, name, src);
    log(sum && !sum.empty ? `round with ${sum.players} player${sum.players === 1 ? '' : 's'} (not listed: BF2R_MIN_PLAYERS ${MIN_PLAYERS})` : 'empty round', name);
    return;
  }
  const base = baseOf(name), bfrName = `${base}.${dec.hash}.bfr`;
  for (const f of fs.readdirSync(DIRS.rounds)) if (f.startsWith(base + '.') && f !== bfrName) fs.unlinkSync(path.join(DIRS.rounds, f));   // made by an older decoder
  const bfr = bfrBuild({ name, info, tl }), tmp = path.join(DIRS.rounds, bfrName + '.tmp');
  fs.writeFileSync(tmp, bfr); fs.renameSync(tmp, path.join(DIRS.rounds, bfrName));
  if (move) fs.renameSync(src, path.join(DIRS.demos, name));
  const entry = { name, demo: 'demos/' + name, bfr: 'rounds/' + bfrName, bytes: info.bytes, bfrBytes: bfr.length, decoder: dec.hash, added: old >= 0 ? idx.rounds[old].added : new Date().toISOString(), sum };
  heatPut(name, entry.sum);
  if (old >= 0) idx.rounds[old] = entry; else idx.rounds.push(entry);
  log('round', name, `${(info.bytes / 1e6).toFixed(1)} MB -> ${(bfr.length / 1e6).toFixed(1)} MB`, `${entry.sum.players} players, ${entry.sum.kills} kills`, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

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
    const names = args.has('--rebuild') ? fs.readdirSync(DIRS.demos).filter(f => /\.bf2demo(\.gz)?$/i.test(f)) : idx.rounds.filter(r => r.decoder !== dec.hash).map(r => r.name);
    if (args.has('--rebuild')) idx.rounds = idx.rounds.filter(r => names.includes(r.name) || fs.existsSync(path.join(DATA, r.bfr)));
    for (const name of names) {
      const src = path.join(DIRS.demos, name);
      if (!fs.existsSync(src)) { log('no demo left for', name, '(kept as it was)'); continue; }
      try { await processDemo(dec, idx, src, name, { move: false }); changed = true; writeIndex(idx, dec); }
      catch (e) { log('could not decode again', name, '-', e.message); }
    }
  }
  // 3. demos older than BF2R_RAW_KEEP_DAYS go (the decoded round stays and still opens)
  if (RAW_KEEP_DAYS > 0) {
    const limit = Date.now() - RAW_KEEP_DAYS * 86400e3;
    for (const r of idx.rounds) {
      const f = path.join(DIRS.demos, r.name);
      if (r.demo && fs.existsSync(f) && fs.statSync(f).mtimeMs < limit) { fs.unlinkSync(f); delete r.demo; changed = true; log('demo removed (kept', RAW_KEEP_DAYS, 'days):', r.name); }
    }
  }
  if (changed || idx.moved || !idx.heat || !fs.existsSync(INDEX)) writeIndex(idx, dec);
  else { try { writeShares(idx, dec); } catch (e) { log('link previews not written:', e.message); } }   // (a new domain or preview pictures after a site update; only changed files are written)
}
main().catch(e => { log('error:', e.stack || e.message); process.exit(1); });
