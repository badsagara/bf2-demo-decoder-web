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
// Several demos are decoded at once in worker threads - new ones (v162) and again (--reprocess, --rebuild): as many as
// the admin page says ("Being decoded": data/.ingest.json, looked at again after each demo and every 5 s, so a change
// takes effect while decoding), or BF2R_JOBS when /etc/bf2replay.conf sets it (that wins), else as many as the CPU cores
// and the memory allow (~1.2 GB each), at most 4. How fast each number went is kept in data/.ingest-stats.json and
// what is being decoded now in data/.ingest-now.json (both for the admin page). Decoding again keeps its progress in
// rounds.json too (reprocess: done / total / left, for bf2replay-status and the site), and in the log: "[45/480 9%, ~1 h
// 10 min left]".
// (v163) A run that sees the site (or this file) updated starts no more demos and ends, so the new code takes over; on
// SIGTERM it writes the round list before it goes; a demo in data/demos with no round listed is decoded again; during a
// batch only rounds.json is written after each demo (the heat files and link previews every 30 s and at the end).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { compactIndex, expandIndex } from './roundsidx.mjs';
import { demoPolicy, demoPlan, hintRounds, sourceList, refetchWanted, REFETCH_FILE, DEMOS_LAST_FILE } from './demos.mjs';

// ---------- settings ----------
const conf = {};
try { for (const line of fs.readFileSync('/etc/bf2replay.conf', 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/.exec(line); if (m) conf[m[1]] = m[2]; } } catch (e) { /* no file: defaults */ }
const opt = (k, d) => process.env[k] ?? conf[k] ?? d;
const ROOT = opt('BF2R_ROOT', '/srv/bf2replay');
const KEEP_EMPTY = opt('BF2R_KEEP_EMPTY', '0') === '1';      // keep demos of rounds nobody played (in data/empty)
const MIN_PLAYERS = Math.max(1, Math.floor(+opt('BF2R_MIN_PLAYERS', '2') || 2));   // fewer players on the field: not listed
// (v162) how many demos at once: see the top. AUTO_JOBS: the cores, the memory at ~1.2 GB a demo, at most 4
const AUTO_JOBS = Math.min(4, os.cpus().length || 1, Math.max(1, Math.floor(os.totalmem() / (1.2 * 2 ** 30)))), JOBS_MAX = 16;
const CONF_JOBS = Math.max(0, Math.floor(+opt('BF2R_JOBS', '0')) || 0);
// (BF2R_RAW_KEEP_DAYS: delete the demo itself after so many days; v186: by when the round was played, with the admin
// page's other demo settings - demos.mjs; the decoded round stays)
const MIN_FREE = (+opt('BF2R_MIN_FREE_GB', '3') || 0) * 2 ** 30, RAW_AUTOCLEAN = opt('BF2R_RAW_AUTOCLEAN', '1') !== '0';   // (a nearly full disk: step 4)
const SITE = path.join(ROOT, 'site'), DATA = path.join(ROOT, 'data'), INC = path.join(ROOT, 'upload', 'incoming');
const HERE = path.dirname(new URL(import.meta.url).pathname);   // (v196: server/admin-round.js is read from here)
const DIRS = { demos: path.join(DATA, 'demos'), rounds: path.join(DATA, 'rounds'), logs: path.join(DATA, 'logs'), empty: path.join(DATA, 'empty'), bad: path.join(DATA, 'bad') };
// (v166) rounds.json is what the site loads on every visit: a short line a round (no players' lines, no kills); the whole
// list - what this script works from - is data/.rounds-full.json, and every round's kills are in data/.kills/<map>.json
// (until v166 public: data/heat): neither is served (the web server keeps data/.* to itself); the site's views over all
// rounds come from data/stats (v165)
const INDEX = path.join(DATA, 'rounds.json'), FULL_INDEX = path.join(DATA, '.rounds-full.json'), HEAT_DIR = path.join(DATA, '.kills'), OLD_HEAT_DIR = path.join(DATA, 'heat'), SHARE_DIR = path.join(DATA, 'share');
const DOMAIN = opt('BF2R_DOMAIN', '').trim();
const args = new Set(process.argv.slice(2));
// Decoders whose rounds come out the same as the current one's (a fix that changes only demos that failed before): rounds
// they made are not decoded again after the update, only marked as made by the current decoder. (v138 used it once:
// 054e89ecf1 = 3621404639 but for maps not among the 22. v140's decoder adds to every round: none now.)
// (v156) { from: [hashes], except: [maps] }: the same, but rounds on these maps are decoded again - a629ba2a28 numbers the
// Euro Force's and Special Forces' templates (their maps below); every other round comes out byte for byte as with
// 1d5536877e (the 9 test rounds checked), so only these are decoded again
const EF_SF_MAPS = ['greatwall', 'taraba_quarry', 'operationsmokescreen', 'devils_perch', 'ghost_town', 'iron_gator', 'leviathan', 'mass_destruction', 'night_flight', 'surge', 'warlord'];
// (v161) a list of such rules: e9d9e7595f is a629ba2a28 made faster (the packets' bits read when asked, not worked out
// for every bit position first; a soldier's rides looked up from where the last frame left off; the map size's 99th
// percentile picked without sorting every position) - every round comes out byte for byte the same (80 rounds checked),
// so nothing is decoded again; rounds still made by 1d5536877e keep v156's rule
// (v185) 5e7024cf21 is f70674b7e0 with the Special Forces rounds' sides taken from the Player ghost when the kits put
// everyone on one side (todo 225): every other round comes out byte for byte the same (23 test rounds checked; of the
// 1667 rounds of the analysis only two had one side, both on SF maps), so only the EF / SF maps are decoded again
const SAME_ROUNDS = { e9d9e7595f: [{ from: ['a629ba2a28'] }, { from: ['1d5536877e'], except: EF_SF_MAPS }], '5e7024cf21': [{ from: ['f70674b7e0'], except: EF_SF_MAPS }] };
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
  // (v153) a clip the page made for the game (.bf2demo): the round before it squeezed into fewer ticks - its ticks are
  // put back as the page does when it opens one (unsqueezeDemo; a clip at the real pace is known by its name,
  // clipByName), so it decodes at the round's own pace and the site opens it at the clip. Out of the decoder's region:
  // the hash (and so every round decoded already) stays as it is
  const fnText = sig => { const i = html.indexOf(sig); if (i < 0) return null; const j = html.indexOf('\n}\n', i); return j < 0 ? null : html.slice(i, j + 2); };
  const lineText = sig => { const i = html.indexOf(sig); return i < 0 ? null : html.slice(i, html.indexOf('\n', i)); };
  const lead = /DEMO_LEAD = (\d+)/.exec(html), parts = [fnText('function demoIndex('), lineText('const stateTick = '), lineText('const isState = '), fnText('function unsqueezeDemo('), fnText('function clipByName(')];
  let clipFns = {};
  if (lead && parts.every(Boolean)) {
    try { clipFns = new Function('readHeader', `const DEMO_LEAD = ${lead[1]};\n` + parts.join('\n') + '\nreturn { unsqueezeDemo, clipByName };')(mod.readHeader); }
    catch (e) { log('clips: the page\'s unsqueezeDemo did not load:', e.message); }
  }
  // (v183) a kill's weapon when the game names none (killWeaponGuess: the killer's blast by the victim, or his vehicle) -
  // for the summary's kills; out of the hash too (a change to it sums the rounds up again: SUM_V)
  let killWeaponGuess = null; const kw = fnText('function killWeaponGuess(');
  if (kw) { try { killWeaponGuess = new Function(kw + '\nreturn killWeaponGuess;')(); } catch (e) { log('killWeaponGuess did not load:', e.message); } }
  // (v221) the kills' distances and a weapon the game named wrong put right (killFix: the page's normalize does the same)
  // - out of the hash too (SUM_V)
  let killFix = null; const kf = fnText('function killFix(');
  if (kf) { try { killFix = new Function(kf + '\nreturn killFix;')(); } catch (e) { log('killFix did not load:', e.message); } }
  return { ...mod, ...clipFns, killWeaponGuess, killFix, hash };
}
// (v183) the decoded round file back: { name, info, tl } (as the page's bfrParse) - to sum a round up again without
// decoding its demo (SUM_V)
function bfrRead(file) {
  const u8 = zlib.gunzipSync(fs.readFileSync(file));
  if (u8.toString('latin1', 0, 4) !== 'BFR1') throw new Error('not a decoded round');
  const hl = u8.readUInt32LE(4), base = (8 + hl + 7) & ~7;
  const TA = { Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray };
  return JSON.parse(u8.toString('utf8', 8, 8 + hl), (k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (v.$ta) { const [type, off, len] = v.$ta, T = TA[type]; const b = u8.buffer.slice(u8.byteOffset + base + off, u8.byteOffset + base + off + len * T.BYTES_PER_ELEMENT); return new T(b); }
      if (v.$n) return Number(v.$n);
    }
    return v;
  });
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
// (v183) SUM_V: how a round is summed up (summarize); a round summed up by an older one is summed up again from its .bfr
// (2: the kills' hit part [12] and the weapon guessed where the game names none [7] - the player page's headshots
// against his weapons, todo 219 / 221; 3, v187: hl - the round's highlights for the posts about it, notify.mjs; 4, v188:
// and the mines' kills, as the site's Round stats has them; 5, v190: the kill streaks on foot and in vehicles apart; 6,
// v192: each soldier's own of them, P[].x, for the records over many rounds; 7, v201: the kills' distances - a throw only
// for a kill by what it is, todo 245; 8, v202: a soldier's longest kill without the commander's artillery; 9, v204: the
// records of each group of weapons - hand-held, anti-tank rockets, vehicles, anti-air guns, rockets, air-to-air, todo 250;
// 10, v205: the anti-tank rockets in hand and on a stand apart, the tank cannons apart from the vehicles, todo 251; 11,
// v207: the round's highlights of the same groups for the posts, todo 253; 12, v210: the explosives apart - hand grenades,
// grenade launchers, C4 - for the posts and the records, todo 256)
const SUM_V = 16;   // (13, v215: pts' time and vehicles, P[].y - duels, damage, assists, spawns, squad, flag zones, revives, vehicles; fl - the flags; 14, v216: the field of view 90° - pts' unseen, the duels; 15, v219: 95° and the sights' zoom; 16, v221: killFix - a kill's weapon and distance put right where the game named them wrong, repairs as the game counts them)
const GL_W = /grenade launcher|^GP-\d|^M203$|\bGL\b/i, GREN_W = w => /grenade|Flashbang|Tear gas/i.test(w || '') && !GL_W.test(w || ''), C4_W = w => /^C4$/i.test(w || '');   // (as the page's HL_GL / HL_GREN / HL_C4)
// (v219) the page's field of view (VIEW_HALF, viewZoom) for the summaries: 95° across (a 16:9 screen: Hor+ since the 1.5
// patch, the camera 1.1 rad high); through the sights or a scope (the Player ghost's move code 16) narrower - here without
// the weapon itself (the page knows it): the sniper kit's rifle (slot 3) 0.25 of the height and round, a pistol (slot 2)
// 0.8, else 0.65 (the page's ZOOM_F: scopes 0.2-0.4, rifles 0.6-0.7, pistols, shotguns, SMGs 0.8)
const VIEW_ASPECT = 16 / 9, VIEW_H = Math.atan(Math.tan(0.55) * VIEW_ASPECT);
const lastAt = (L, tt) => { let v = null; for (const e of L || []) { if (e[0] > tt + 1e-6) break; v = e[1]; } return v; };
function viewHalfOf(p, tt) {
  if (!p || !((lastAt(p.mv, tt) || 0) & 16)) return VIEW_H;
  const slot = lastAt(p.items, tt); let kit = null, kt = -Infinity;
  for (const L of [p.kits, p.pk]) for (const [ts, k] of L || []) { if (ts > tt + 0.05) break; if (ts >= kt) { kit = k; kt = ts; } }
  const z = slot === 3 && kit === 'Sniper' ? 0.25 : slot === 2 ? 0.8 : 0.65, hv = 0.55 * z;
  return Math.min(1.55, (z <= 0.4 ? hv : Math.atan(Math.tan(hv) * VIEW_ASPECT)) + 10 * Math.PI / 180);   // (+ the page's ZOOM_SLACK, 10°)
}
function summarize(tl, hdr, dec) {
  const killCause = dec.killCause, guess = dec.killWeaponGuess;
  const C = tl.cols, n = C.n, T = C.times, F = T.length, dur = tl.meta.duration;
  const P0 = tl.players, pidx = new Map(P0.map((p, i) => [p.id, i]));
  const teamIn = (p, tt) => { const L = p.teams; if (!L || !L.length) return p.team; let tm = L[0][1]; for (const [ts, x] of L) { if (ts > tt + 0.05) break; tm = x; } return tm; };
  const team = (i, tt) => i === undefined || !P0[i] ? -1 : teamIn(P0[i], tt);
  const frameAt = tt => { if (!F || T[0] > tt) return -1; let lo = 0, hi = F - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= tt) lo = m; else hi = m - 1; } return lo; };
  const at = (i, tt) => {   // as the page's playerAt: between the frames around tt
    let a = frameAt(tt); if (a < 0) a = 0; const b = Math.min(F - 1, a + 1), u = b > a ? Math.max(0, Math.min(1, (tt - T[a]) / (T[b] - T[a]))) : 0;
    const ia = a * n + i, ib = b * n + i, alive = !!C.L[ia];
    if (!alive || !C.L[ib]) return { x: C.X[ia], y: C.Y[ia], alive, veh: C.VTN[C.VT[ia]], yaw: C.A[ia] };
    return { x: C.X[ia] + (C.X[ib] - C.X[ia]) * u, y: C.Y[ia] + (C.Y[ib] - C.Y[ia]) * u, alive, veh: C.VTN[C.VT[ia]], yaw: C.A[ia] };
  };
  // (v136) how the kill came at the victim (as the page's killFacing): [front 0 / side 1 / behind 2, unseen 1 / seen 0]
  const angOff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
  const facing = (vi, ki, t) => {
    const bear = (v, k) => Math.atan2(k.x - v.x, k.y - v.y), ok = (v, k) => v.alive && k.alive && !v.veh && Number.isFinite(v.yaw) && Number.isFinite(k.x) && Math.hypot(k.x - v.x, k.y - v.y) > 0.5;
    const v0 = at(vi, t - 0.1), k0 = at(ki, t - 0.1); let face = null, seen = null;
    if (ok(v0, k0)) { const d = angOff(v0.yaw, bear(v0, k0)); face = d < Math.PI / 3 ? 0 : d > Math.PI * 2 / 3 ? 2 : 1; }
    for (let tt = t - 3; tt <= t - 0.1 + 1e-6; tt += 0.2) { const v = at(vi, tt), k = at(ki, tt); if (!ok(v, k)) continue; if (seen === null) seen = 0; if (angOff(v.yaw, bear(v, k)) <= viewHalfOf(P0[vi], tt)) { seen = 1; break; } }   // (the page's VIEW_HALF and the sights' zoom: v219 - SUM_V 15)
    return [face, seen === null ? null : seen ? 0 : 1];
  };
  const ev = tl.events.slice().sort((a, b) => a.t - b.t), kills = ev.filter(e => e.type === 'kill');
  // kill distances as the page works them out (normalize, killFix): killer to victim in the frame of the kill, from where
  // a grenade or rocket was thrown, an air-to-air missile fired; none for placed charges, kills without a weapon, one the
  // killer could not have made from where he was (e.noDist); a weapon the game named wrong put right (a placed charge's
  // kill named as what he held) - v221, SUM_V 16 (v201: the throws, SUM_V 7)
  const PLACED = new Set([5367, 5460, 5359]);
  if (dec.killFix) dec.killFix(ev, pidx, C, P0, true, dec.GAME?.maps?.[String(tl.meta?.map || '').toLowerCase()]?.view); else for (const e of kills) delete e.dist;
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
  const ptsLab = P0.some(p => (p.pts || []).some(q => q[2]));   // (the score's reasons in the demo: repairs as the game counts them)
  const P = [...S].filter(([, s]) => s.foot + s.veh > 0).map(([i, s]) => {
    const pl = P0[i], id = pl.id, tm = team(i, dur), mine = e => e.type === 'kill' && e.killer === id;
    const enemy = ev.filter(e => mine(e) && e.victim !== id && team(pidx.get(e.victim), e.t) !== team(i, e.t));
    return { name: pl.name.trim(), team: tm, win: winner !== null && tm === winner, k: s.k[0] + s.k[1], kVeh: s.k[1], d: s.d[0] + s.d[1], tk: s.tk,
      sui: ev.filter(e => mine(e) && e.victim === id).length, hs: enemy.filter(e => e.hit === 'head').length,
      rev: ev.filter(e => e.type === 'revive' && e.medic === id).length, heal: ev.filter(e => e.type === 'heal' && e.medic === id && e.player !== id).length,
      rep: ptsLab ? (pl.pts || []).filter(q => /^repair$/i.test(q[2] || '')).length : ev.filter(e => e.type === 'repair' && e.by === id).length,   // (v221: as the game counts them - the page's repairsOf) score: pl.sb ? pl.sb[pl.sb.length - 1][1] : (pl.pts || []).reduce((a, q) => a + q[1], 0),   // (v132: the game's own score)
      streak: streak(i), long: Math.max(0, ...enemy.filter(e => e.dist !== undefined && !/artillery/i.test(e.weapon || '')).map(e => e.dist)), alive: Math.round(s.foot + s.veh) };   // (v202: not the commander's artillery, as the page's longKill)
  });
  const top = P.slice().sort((a, b) => b.score - a.score)[0];
  // the kills for the heatmap of all rounds on the map: [victim x, y, killer x, y, victim's side, killer's side, kind, weapon, killer, victim,
  // from the front / side / behind, unseen] (the last two: v136)
  const r1 = v => Math.round(v * 10) / 10, HIT = { head: 'h', body: 'b', limb: 'l' };
  const blasts = ev.filter(e => e.type === 'blast' && e.x != null), vehOf = new Map(P0.map((p, i) => [p.vehicle ? p.name : null, i]));
  const wOf = e => { if (e.weapon || !guess) return e.weapon || ''; const vi = pidx.get(e.victim), o = vi !== undefined ? at(vi, e.t - 0.15) : null, j = o && o.veh ? vehOf.get(o.veh) : undefined, v = j !== undefined ? at(j, e.t - 0.15) : null;
    const kp = e.kv ? P0[pidx.get(e.kv)] : null; return guess(e, blasts, v && Number.isFinite(v.x) ? v.x : e.x ?? o?.x, v && Number.isFinite(v.y) ? v.y : e.y ?? o?.y, kp ? kp.name : ''); };
  const pts = kills.map(e => {
    const ki = pidx.get(e.killer), vi = pidx.get(e.victim); if (vi === undefined || e.killer === e.victim) return null;
    const kq = ki !== undefined ? at(ki, e.t - 0.05) : null, vq = at(vi, e.t), fc = ki !== undefined ? facing(vi, ki, e.t) : [null, null];
    return [r1(e.x ?? vq.x), r1(e.y ?? vq.y), kq && kq.alive ? r1(kq.x) : null, kq && kq.alive ? r1(kq.y) : null, tl.teams[team(vi, e.t)]?.name || '', ki !== undefined ? tl.teams[team(ki, e.t)]?.name || '' : '',
      killCause(e, !!(kq && kq.veh)), wOf(e), ki !== undefined ? P0[ki].name.trim() : '', P0[vi].name.trim(), fc[0], fc[1], HIT[e.hit] || null,
      // (v215, SUM_V 13) the kill's time; the killer's and the victim's vehicle (its kind: the name without its number)
      Math.round(e.t * 10) / 10, kq && kq.alive && kq.veh ? String(kq.veh).replace(/ \d+$/, '') : '', vq.veh ? String(vq.veh).replace(/ \d+$/, '') : ''];
  }).filter(Boolean);
  // (v187) the round's highlights for the posts about it (notify.mjs: each a part the admin page turns on or off for
  // Discord and Telegram): the most kills of each kind (enemies only), the longest kills, the first and the last, with
  // ties - { n, who: [up to 3 names], more } / { d, who, w, vic } / { who, vic, w, t, tk }
  const hl = {};
  { const SNIPER = /^(M24|SVD|L96A1|M95|Type 88|SV-?98)\b|sniper/i, K = [];
    for (const e of kills) {
      const ki = pidx.get(e.killer), vi = pidx.get(e.victim); if (ki === undefined || vi === undefined || ki === vi || P0[ki].vehicle) continue;
      const kq = at(ki, e.t - 0.05), vq = at(vi, e.t - 0.05), w = wOf(e) || '', cause = killCause({ ...e, weapon: w }, !!kq.veh);
      let d = e.noRec ? null : e.dist; if (d === undefined && kq.alive && !e.noDist) { const k = frameAt(e.t); if (k >= 0) { const a = k * n + ki, b = k * n + vi; d = Math.round(Math.hypot(C.X[a] - C.X[b], C.Y[a] - C.Y[b], C.HH[a] - C.HH[b])); } }
      K.push({ t: e.t, ki, k: P0[ki].name.trim(), v: P0[vi].name.trim(), w, raw: e.weapon || '', cause, kv: !!kq.veh, vv: !!vq.veh, tk: team(ki, e.t) === team(vi, e.t), d: Number.isFinite(d) ? d : null, head: e.hit === 'head', placed: PLACED.has(e.wid) || /claymore|mine\b|^C4$/i.test(w) });
    }
    const E = K.filter(x => !x.tk);
    const most = (key, f) => { const c = new Map(); for (const x of E) if (f(x)) c.set(x.k, (c.get(x.k) || 0) + 1); let n = 0; for (const v of c.values()) n = Math.max(n, v); if (!n) return; const who = [...c].filter(([, v]) => v === n).map(([k]) => k); hl[key] = { n, who: who.slice(0, 3), more: Math.max(0, who.length - 3) }; };
    most('foot', x => !x.kv); most('veh', x => x.kv); most('clay', x => /claymore/i.test(x.w)); most('mine', x => /\bmine\b/i.test(x.w) && !/claymore/i.test(x.w)); most('hs', x => x.head); most('knife', x => /knife/i.test(x.w));
    most('atInf', x => x.cause === 'at' && !x.kv && !x.vv); most('road', x => x.kv && !x.raw && !x.vv); most('gren', x => GREN_W(x.w)); most('gl', x => GL_W.test(x.w)); most('c4', x => C4_W(x.w));   // (v210: was 'expl', all of them together)
    const far = (key, f) => { let b = null; for (const x of E) if (x.d != null && !x.placed && f(x) && (!b || x.d > b.d)) b = x; if (b) hl[key] = { d: b.d, who: b.k, w: b.w, vic: b.v }; };
    // (the commander's artillery - "M777 shell" - is no small arm; a kill with no weapon named is no record)
    const ARTY = /shell|artillery/i;
    // (v204, Sagara: records apart for hand-held weapons - no sniper rifles -, anti-tank rockets - hand-held and on a stand
    // -, vehicles, anti-air guns, anti-air rockets from the ground and air-to-air missiles) a kill's group by its weapon's
    // name (the killer may sit in a vehicle or at a stand: x.cause says 'veh' then); none for artillery, placed charges, the
    // knife; REC_N: its most-kills key, REC_D: its longest-kill key (as the page's REC_KEYS)
    // (v205: hand-held anti-tank rockets, the launchers on a stand and the tank cannons apart)
    const AT_RKT = /^(SRAW|Eryx|RPG-7)$/i, AT_STAND = /^(TOW|HJ-8 launcher)$/i, TANK_GUN = /^(M1A2|T-90|Type 98|Challenger 2|Leopard 2A6) cannon$/i, AA_GUN = /^(Tunguska cannon|Type 95 AA guns|M6 Linebacker cannon|Phalanx)$/i;
    const AA_GND = /^(Igla AA|Stinger AA|M6 Stinger|Tunguska SA-19|Type 95 QW-2|Sea Sparrow)$/i, A2A = /Sidewinder|Archer missile|^Eurofighter missiles$/i;
    const VEH_W = /Maverick|Hellfire|Kedge|minigun|cannons?\b|bombs|rockets|missile|HMG|mounted|Coaxial|Firing port/i;
    const recGroup = x => {
      if (x.placed || ARTY.test(x.w)) return null;
      if (AA_GUN.test(x.w)) return 'ag'; if (AA_GND.test(x.w)) return 'ar'; if (A2A.test(x.w)) return 'aa'; if (AT_RKT.test(x.w)) return 'at'; if (AT_STAND.test(x.w)) return 'st'; if (TANK_GUN.test(x.w)) return 'tc';
      if (!x.raw) return x.kv ? 'veh' : null;   // (no weapon named - a vehicle's name guessed for it: not hand-held)
      const c = killCause({ weapon: x.w }, false);
      if (c === 'small') return /knife|defib/i.test(x.w) ? null : VEH_W.test(x.w) ? 'veh' : SNIPER.test(x.w) ? 'sn' : 'hh';
      if (c === 'at') return 'at';
      if (c === 'veh' || c === 'emp') return 'veh';
      return null;
    };
    var REC_N = { hh: 'hk', at: 'atk', st: 'stk', tc: 'tck', veh: 'vk', ag: 'agk', ar: 'ark', aa: 'aak' }, REC_D = { hh: 'sl', sn: 'sn', at: 'al', st: 'stl', tc: 'tcl', veh: 'vl', ag: 'agl', ar: 'arl', aa: 'aal' };
    // (v207, Sagara: the posts with the same groups) the round's most kills and longest kill of each group, for the posts
    // (notify.mjs: handMost, atMost, standMost / standLong, tankMost / tankLong, vehMost / vehLong, aaGunMost / aaGunLong,
    // aaRktMost / aaRktLong, a2aMost / a2aLong; the hand-held launcher's longest stays atLong, small arms' smallLong)
    for (const [g, M, L] of [['hh', 'handMost'], ['at', 'atMost'], ['st', 'standMost', 'standLong'], ['tc', 'tankMost', 'tankLong'], ['veh', 'vehMost', 'vehLong'], ['ag', 'aaGunMost', 'aaGunLong'], ['ar', 'aaRktMost', 'aaRktLong'], ['aa', 'a2aMost', 'a2aLong']]) {
      most(M, x => recGroup(x) === g); if (L) far(L, x => recGroup(x) === g && (g !== 'veh' || !!x.raw));
    }
    far('atLong', x => x.cause === 'at' && !x.kv); far('smallLong', x => x.cause === 'small' && !x.kv && !SNIPER.test(x.w) && !ARTY.test(x.w)); far('snipLong', x => !x.kv && SNIPER.test(x.w)); far('longest', x => (!!x.raw || x.cause === 'at') && !ARTY.test(x.w));   // (a crew killed with no weapon named: only a launcher's guess counts)
    if (E.length) { const x = E[0]; hl.first = { who: x.k, vic: x.v, w: x.w, t: Math.floor(x.t) }; }
    if (K.length) { const x = K[K.length - 1]; hl.last = { who: x.k, vic: x.v, w: x.w, t: Math.floor(x.t), tk: x.tk }; }   // (times: whole seconds down, as the site shows them)
    const best = (key, f, min = 1) => { let n = 0; for (const p of P) n = Math.max(n, f(p) || 0); if (n < min) return; const who = P.filter(p => (f(p) || 0) === n).map(p => p.name); hl[key] = { n, who: who.slice(0, 3), more: Math.max(0, who.length - 3) }; };
    // (v190) the streaks apart: enemy kills on foot in a row without dying, and from vehicles (a kill of the other kind
    // neither counts nor ends it; a death does - one revived does not, as the site's streaks)
    const streak = (key, veh) => { const best = new Map();
      for (const i of sold) { const L = E.filter(x => x.ki === i && x.kv === veh), D = deathsOf.get(i) || []; let cur = 0, b = 0;
        for (const [, isK] of L.map(x => [x.t, 1]).concat(D.map(t => [t, 0])).sort((a, c) => a[0] - c[0] || c[1] - a[1])) { if (isK) b = Math.max(b, ++cur); else cur = 0; }
        if (b >= 2) best.set(P0[i].name.trim(), b); }
      let n = 0; for (const v of best.values()) n = Math.max(n, v); if (!n) return; const who = [...best].filter(([, v]) => v === n).map(([k]) => k); hl[key] = { n, who: who.slice(0, 3), more: Math.max(0, who.length - 3) }; };
    streak('streakFoot', false); streak('streakVeh', true);
    best('rev', p => p.rev); best('heal', p => p.heal); best('rep', p => p.rep);
    { let b = null; for (const p of P) if (p.k >= 10) { const r = p.k / Math.max(1, p.d); if (!b || r > b.r) b = { r, who: p.name, k: p.k, d: p.d }; } if (b) hl.kd = { r: Math.round(b.r * 100) / 100, who: b.who, k: b.k, d: b.d }; }
    { let b = null; for (const i of sold) { const L = (P0[i].pts || []).filter(q => /flag (captured|neutrali[sz]ed)/i.test(q[2] || '')), cap = L.filter(q => /captured/i.test(q[2])).length; if (L.length && (!b || L.length > b.n)) b = { n: L.length, cap, neu: L.length - cap, who: P0[i].name.trim() }; } if (b) hl.flags = b; }
    // (v192) each soldier's own of the same (P[].x, the zeros left out): the records pages over many rounds - the site's
    // Records, his player page, the map's page (the page's @agg: aggRecs, aggBests) - take each soldier's best, not only
    // the round's. kn knife, cl claymores, mi mines, ai launchers on infantry, rd run over, gr hand grenades, gl grenade launchers, c4 C4 (counts; v210 - ex,
    // all explosives together, before); al
    // launcher, sl small arms, sn sniper rifle, lg any weapon ([m, weapon]); sf / sv streaks on foot / in vehicles; fl flags
    const X = new Map(), xo = i => { let o = X.get(i); if (!o) X.set(i, o = {}); return o; }, inc = (i, k) => { const o = xo(i); o[k] = (o[k] || 0) + 1; };
    for (const x of E) {
      if (/knife/i.test(x.w)) inc(x.ki, 'kn'); if (/claymore/i.test(x.w)) inc(x.ki, 'cl'); if (/\bmine\b/i.test(x.w) && !/claymore/i.test(x.w)) inc(x.ki, 'mi');
      if (x.cause === 'at' && !x.kv && !x.vv) inc(x.ki, 'ai'); if (x.kv && !x.raw && !x.vv) inc(x.ki, 'rd'); if (GREN_W(x.w)) inc(x.ki, 'gr'); if (GL_W.test(x.w)) inc(x.ki, 'gl'); if (C4_W(x.w)) inc(x.ki, 'c4');
      const g = recGroup(x); if (REC_N[g]) inc(x.ki, REC_N[g]);
      if (x.d == null || x.placed) continue;
      const up = k => { const o = xo(x.ki); if (!o[k] || x.d > o[k][0]) o[k] = [x.d, x.w]; };
      if (REC_D[g] && (g !== 'veh' || x.raw)) up(REC_D[g]); if ((!!x.raw || x.cause === 'at') && !ARTY.test(x.w)) up('lg');
    }
    for (const i of sold) for (const [k, veh] of [['sf', false], ['sv', true]]) {
      const L = E.filter(x => x.ki === i && x.kv === veh), D = deathsOf.get(i) || []; let cur = 0, b = 0;
      for (const [, isK] of L.map(x => [x.t, 1]).concat(D.map(t => [t, 0])).sort((a, c) => a[0] - c[0] || c[1] - a[1])) { if (isK) b = Math.max(b, ++cur); else cur = 0; }
      if (b >= 2) xo(i)[k] = b;
    }
    for (const i of sold) { const n = (P0[i].pts || []).filter(q => /flag (captured|neutrali[sz]ed)/i.test(q[2] || '')).length; if (n) xo(i).fl = n; }
    const byName = new Map(P.map(p => [p.name, p])); for (const [i, o] of X) { const p = byName.get(P0[i].name.trim()); if (p && Object.keys(o).length) p.x = o; }
  }
  // (v215, Sagara's todo 265: statistics) each soldier's P[].y and the round's flags (fl) - SUM_V 13
  const fl = extraStats(tl, C, P0, pidx, team, at, ev, kills, sold, P, dur);
  const map = hdr ? (hdr.fields[2].split('/').pop() || hdr.fields[2]) : String(tl.meta.map || '');
  return { date: hdr ? hdr.fields[1] : '', map, server: hdr ? hdr.fields[0] : '', duration: dur, empty: !P.length, players: P.length, kills: kills.length,
    teams: tl.teams.map(x => x.name), tickets, winner, top: top ? { name: top.name, score: top.score, team: top.team } : null, P, pts, hl, fl };
}

// (v215) more of each soldier's round (P[].y, zeros left out), and the round's flags:
//   dw / dl  duels won / lost: kills of a man who had him in view in the 3 s before / deaths with the killer in view (the
//            same view test as the kills' "unseen" - the sector, no walls); ak ambush kills (the victim never had him in
//            view), bd deaths blind (he never had the killer in view)
//   dm       damage done (health points): each drop of an enemy's health (10 times a second) goes to the enemies firing
//            then with their view on him within 10 deg (on foot), or firing from a vehicle within 400 m, or whose blast
//            it was (shared when several); st kills stolen - his kills of a man who lost under 30% of the health he lost
//            in the 10 s before to him and 50% or more to another; su kills set up - the other way round
//   as       kill assists (the game's, in the kill message)
//   sp / sq  spawns / of them on his squad (a squad spawn group); sl seconds near his squad leader (50 m, alive, in a
//            squad, not the leader) of ss seconds in a squad; fz seconds in a flag's zone (not the main bases)
//   rv       [seconds from a man's fall to his revive, revives] as a medic
//   vt       { vehicle kind: [seconds in it, kills from it, deaths in it] } (10 s or more)
// fl: [[flag, seconds held by side 0, by side 1, owner at the end]] (not the main bases)
function extraStats(tl, C, P0, pidx, team, at, ev, kills, sold, P, dur) {
  const n = C.n, T = C.times, F = T.length, Y = new Map(sold.map(i => [i, {}])), inc = (i, k, v = 1) => { const o = Y.get(i); if (o) o[k] = (o[k] || 0) + v; };
  const fr = tt => { if (!F || T[0] > tt) return 0; let lo = 0, hi = F - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= tt) lo = m; else hi = m - 1; } return lo; };
  const angOff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
  const kind = v => String(v || '').replace(/ \d+$/, '');
  // duels: from the view test of the kills (as pts' unseen)
  const sawIn = (a, b, t) => { for (let tt = t - 3; tt <= t - 0.1 + 1e-6; tt += 0.2) { const v = at(a, tt), k = at(b, tt); if (!v.alive || !k.alive || v.veh || !Number.isFinite(v.yaw) || !Number.isFinite(k.x) || Math.hypot(k.x - v.x, k.y - v.y) < 0.5) continue; if (angOff(v.yaw, Math.atan2(k.x - v.x, k.y - v.y)) <= viewHalfOf(P0[a], tt)) return true; } return false; };   // (v219: viewHalfOf)
  for (const e of kills) {
    const ki = pidx.get(e.killer), vi = pidx.get(e.victim); if (ki === undefined || vi === undefined || ki === vi || team(ki, e.t) === team(vi, e.t) || !Y.has(ki) || !Y.has(vi)) continue;
    const kq = at(ki, e.t - 0.05), vq = at(vi, e.t - 0.05); if (kq.veh || vq.veh) continue;
    const vSaw = sawIn(vi, ki, e.t); if (vSaw) { inc(ki, 'dw'); inc(vi, 'dl'); } else { inc(ki, 'ak'); inc(vi, 'bd'); }
    for (const a of e.assists || []) { const ai = pidx.get(a); if (ai !== undefined && ai !== ki) inc(ai, 'as'); }
  }
  // damage
  const HP = C.HP, FI = new Map(sold.map(i => [i, (P0[i].fire || []).slice().sort((a, b) => a[0] - b[0])]));
  const firing = (i, t) => { const L = FI.get(i) || []; let lo = 0, hi = L.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (L[m][0] <= t) { k = m; lo = m + 1; } else hi = m - 1; } for (let j = k; j >= 0 && t - L[j][0] < 30; j--) if (L[j][1] >= t - 0.25) return true; return false; };
  const blasts = ev.filter(e => e.type === 'blast' && e.by && e.x != null);
  const hits = new Map();   // victim -> [[t, attacker, amount]]
  if (HP) for (const j of sold) {
    for (let k = 1; k < F; k++) {
      const e = k * n + j, e0 = e - n; if (!C.L[e] || !C.L[e0]) continue; const h1 = HP[e], h0 = HP[e0]; if (!(h0 - h1 > 0.5)) continue;
      const t = T[k], tj = team(j, t), x = C.X[e], y = C.Y[e], cand = [];
      for (const i of sold) {
        if (i === j || team(i, t) === tj || !C.L[k * n + i]) continue; const q = at(i, t), d = Math.hypot(q.x - x, q.y - y); if (!(d < 400) || !firing(i, t)) continue;
        if (q.veh) cand.push(i); else if (angOff(q.yaw, Math.atan2(x - q.x, y - q.y)) <= 10 * Math.PI / 180) cand.push(i);
      }
      if (!cand.length) for (const b of blasts) { if (Math.abs(b.t - t) > 0.35 || Math.hypot(b.x - x, b.y - y) > (b.r || 8) + 2) continue; const bi = pidx.get(b.by); if (bi !== undefined && bi !== j && team(bi, t) !== tj && !cand.includes(bi)) cand.push(bi); }
      if (!cand.length) continue;
      const amt = (h0 - h1) / cand.length; for (const i of cand) { inc(i, 'dm', amt); let L = hits.get(j); if (!L) hits.set(j, L = []); L.push([t, i, amt]); }
    }
  }
  for (const e of kills) {
    const ki = pidx.get(e.killer), vi = pidx.get(e.victim); if (ki === undefined || vi === undefined || ki === vi || team(ki, e.t) === team(vi, e.t)) continue;
    const L = (hits.get(vi) || []).filter(h => h[0] >= e.t - 10 && h[0] <= e.t + 0.05); const tot = L.reduce((a, h) => a + h[2], 0); if (tot < 50) continue;
    const by = new Map(); for (const h of L) by.set(h[1], (by.get(h[1]) || 0) + h[2]);
    const mine = by.get(ki) || 0; let best = null; for (const [i, a] of by) if (i !== ki && (!best || a > best[1])) best = [i, a];
    if (mine < 0.3 * tot && best && best[1] >= 0.5 * tot) { inc(ki, 'st'); inc(best[0], 'su'); }
  }
  // spawns (each new kit is a spawn), on the squad; near the squad leader; in a flag's zone
  for (const i of sold) {
    const p = P0[i], sg = p.sgs || []; let sp = 0, sq = 0;
    for (const [ts] of p.kits || []) { sp++; let g = null; for (const [t1, v] of sg) { if (t1 > ts + 0.05) break; g = v; } if (g != null && g >= 192) sq++; }
    if (sp) { inc(i, 'sp', sp); if (sq) inc(i, 'sq', sq); }
  }
  const sqAt = (i, t) => { let o = null; for (const q of P0[i].squad || []) { if (q[0] > t + 0.05) break; o = q; } return o ? [o[1], !!o[2]] : [0, false]; };
  const flags = (tl.flags || []).filter(f => !f.main && Number.isFinite(f.x) && Number.isFinite(f.y));
  const step = Math.max(1, Math.round(1 / ((T[1] - T[0]) || 0.1)));
  for (let k = 0; k < F; k += step) {
    const t = T[k], dt = k + step < F ? T[k + step] - t : 0; if (dt <= 0) continue;
    const lead = new Map(); for (const i of sold) { if (!C.L[k * n + i]) continue; const [s2, l] = sqAt(i, t); if (s2 > 0 && l) lead.set(team(i, t) + '|' + s2, i); }
    for (const i of sold) {
      const e = k * n + i; if (!C.L[e]) continue; const x = C.X[e], y = C.Y[e];
      const [s2, l] = sqAt(i, t); if (s2 > 0 && !l) { inc(i, 'ss', dt); const li = lead.get(team(i, t) + '|' + s2); if (li !== undefined) { const f = k * n + li; if (Math.hypot(C.X[f] - x, C.Y[f] - y) <= 50) inc(i, 'sl', dt); } }
      for (const f of flags) if (Math.hypot(f.x - x, f.y - y) <= (f.r || 10) + 2) { inc(i, 'fz', dt); break; }
      if (C.VT[e]) { const v = kind(C.VTN[C.VT[e]]); if (v) { const o = Y.get(i); const vt = o.vt || (o.vt = {}); (vt[v] || (vt[v] = [0, 0, 0]))[0] += dt; } }
    }
  }
  for (const e of kills) {
    const ki = pidx.get(e.killer), vi = pidx.get(e.victim); if (ki === undefined || vi === undefined || ki === vi || team(ki, e.t) === team(vi, e.t)) continue;
    const kv = kind(at(ki, e.t - 0.05).veh), vv = kind(at(vi, e.t - 0.05).veh);
    if (kv && Y.has(ki)) { const o = Y.get(ki), vt = o.vt || (o.vt = {}); (vt[kv] || (vt[kv] = [0, 0, 0]))[1]++; }
    if (vv && Y.has(vi)) { const o = Y.get(vi), vt = o.vt || (o.vt = {}); (vt[vv] || (vt[vv] = [0, 0, 0]))[2]++; }
  }
  // revives: from the man's fall (his kill) to the revive
  for (const r of ev) {
    if (r.type !== 'revive') continue; const mi = pidx.get(r.medic); if (mi === undefined || !Y.has(mi)) continue;
    const k = kills.filter(e => e.victim === r.player && e.t <= r.t && r.t - e.t < 30).pop(); if (!k) continue;
    const o = Y.get(mi), rv = o.rv || (o.rv = [0, 0]); rv[0] += r.t - k.t; rv[1]++;
  }
  // into the lines (rounded; vehicles 10 s or more)
  const byName = new Map(P.map(p => [p.name, p]));
  for (const [i, o] of Y) {
    const p = byName.get(P0[i].name.trim()); if (!p) continue; const y = {};
    for (const [k, v] of Object.entries(o)) { if (k === 'vt') { const vt = {}; for (const [kk, a] of Object.entries(v)) if (a[0] >= 10 || a[1] || a[2]) vt[kk] = [Math.round(a[0]), a[1], a[2]]; if (Object.keys(vt).length) y.vt = vt; } else if (k === 'rv') y.rv = [Math.round(v[0] * 10) / 10, v[1]]; else if (v) y[k] = Math.round(v); }
    if (Object.keys(y).length) p.y = y;
  }
  // the flags: who held each how long, and its owner at the end
  const fl = [];
  if (C.FO && C.nf) (tl.flags || []).forEach((f, q) => { if (f.main) return; const held = [0, 0]; for (let k = 0; k + 1 < F; k++) { const o = C.FO[k * C.nf + q]; if (o === 0 || o === 1) held[o] += T[k + 1] - T[k]; } const end = C.FO[(F - 1) * C.nf + q]; fl.push([f.name || String(q), Math.round(held[0]), Math.round(held[1]), end === 0 || end === 1 ? end : null]); });
  return fl;
}
// ---------- one demo ----------
async function decodeFile(dec, file, name = path.basename(file)) {
  const raw = fs.readFileSync(file);
  let data; try { data = zlib.inflateSync(raw); } catch (e) { try { data = zlib.gunzipSync(raw); } catch (e2) { throw new Error('not a zlib / gzip stream'); } }
  const u8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength), hdr = dec.readHeader(u8);
  if (!hdr) throw new Error('no Battle Recorder header');
  const sq = dec.unsqueezeDemo ? dec.unsqueezeDemo(u8) : null, clipAt = sq ?? (dec.clipByName ? dec.clipByName(name) : null);   // (v153: a clip made by the page)
  const tl = await dec.decodeDemo(u8, null);
  const ok = tl && tl.stats && tl.stats.positions > 0 && tl.cols && tl.cols.times.length && tl.stats.spawns > 0;
  const info = { bytes: raw.length, format: 'deflate', truncated: false, dataLen: u8.length, hdr: { lead: hdr.lead, fields: hdr.fields, end: hdr.end }, ...(clipAt != null ? { clipAt, ...(sq === null ? { clipReal: true } : {}) } : {}) };
  return { tl: ok ? tl : null, hdr, info };
}
const baseOf = name => name.replace(/\.bf2demo(\.gz)?$/i, '');
// Every kill's spot of a round (sum.pts: what the player, comparison and map views need, ~25 KB a round) is kept out
// of the round list in one file per map, data/.kills/<map>.json ({ rounds: { name: pts } }; data/heat until v166, served then),
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
  // (v166) the kills from data/heat (before v166) to data/.kills, once
  if (!fs.existsSync(HEAT_DIR) && fs.existsSync(OLD_HEAT_DIR)) { try { fs.renameSync(OLD_HEAT_DIR, HEAT_DIR); log('the kills: data/heat -> data/.kills (no longer served)'); } catch (e) { log('data/heat not moved:', e.message); } }
  // (v176: rounds.json is compact - only read when the whole list is lost: back into the usual entries)
  for (const f of fs.existsSync(FULL_INDEX) ? [FULL_INDEX, INDEX] : [INDEX]) { try { const x = JSON.parse(fs.readFileSync(f, 'utf8')); if (Array.isArray(x.rounds)) { d = expandIndex(x); delete d.compact; delete d.servers; delete d.teams; break; } } catch (e) {} }
  try { for (const f of fs.readdirSync(HEAT_DIR)) if (f.endsWith('.json')) { const h = JSON.parse(fs.readFileSync(path.join(HEAT_DIR, f), 'utf8')); HEAT.set(h.map, new Map(Object.entries(h.rounds || {}))); } } catch (e) {}
  for (const r of d.rounds) if (r.sum?.pts) { heatPut(r.name, r.sum); d.moved = true; }   // (rounds.json before v67 had them inside)
  return d;
}
// ---------- (v165) the numbers over all rounds: each player's, each map's, everyone's ----------
// The site's player, comparison, map and "Players · all rounds" views were worked out in the browser from every round's
// kills (data/heat: 100+ MB with thousands of rounds) and summaries (rounds.json). They are worked out here instead, with
// the page's own code (site/index.html between "// @agg-begin" and "// @agg-end", as the decoder is taken from it: the
// same numbers), and kept in data/stats: players/<nick>.json (his rounds, his kills and deaths, with whom), maps/<map>.json,
// table.json and table/<server>.json (everyone, as the Players view lists them), names.json (each nick's latest name).
// Only what the changed rounds touch is written again; everything when that code changes (or the first time).
const STATS = path.join(DATA, 'stats'), STATS_STATE = path.join(DATA, '.stats.json');
const STATS_FORMAT = '4';   // (3, v215: clans, vehicles, servers, the moments search; 4: the player's rating in his file)   // (how this file writes them: a change here writes them all again, as a change of the page's code does)
let AGG = null;   // { fns, v }: the page's code and its hash
const aggTouch = { nicks: new Set(), maps: new Set(), any: false, full: false };
function loadAgg() {
  try {
    const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), L = html.split('\n');
    const g = L.find(l => l.startsWith('const GAME = ')), a = L.findIndex(l => l.startsWith('// @agg-begin')), b = L.findIndex(l => l.startsWith('// @agg-end'));
    if (!g || a < 0 || b < a) return null;   // (an older page: no stats)
    // (v196) and the admins' part of it (his headshots against what his weapons give: server/admin-round.js, between
    // "// @agg-admin-begin" and "// @agg-admin-end" - cut out of the public page by splitpage.mjs)
    let more = ''; try { const A = fs.readFileSync(path.join(HERE, 'admin-round.js'), 'utf8').split('\n'), x = A.indexOf('// @agg-admin-begin'), y = A.indexOf('// @agg-admin-end'); if (x >= 0 && y > x) more = A.slice(x + 1, y).join('\n'); } catch (e) {}
    const code = L.slice(a, b).join('\n') + (more ? '\n' + more : '');
    const fns = new Function(g + '\n' + code + '\nreturn { aggRounds, aggByNick, aggNames, aggTable, aggPlayer, aggMap, nickOf, nickSlug, aggRecs: typeof aggRecs === "function" ? aggRecs : null, REC_KEYS: typeof REC_KEYS !== "undefined" ? REC_KEYS : null, aggClans: typeof aggClans === "function" ? aggClans : null, aggRating: typeof aggRating === "function" ? aggRating : null, aggVehicles: typeof aggVehicles === "function" ? aggVehicles : null, aggServer: typeof aggServer === "function" ? aggServer : null, aggFind: typeof aggFind === "function" ? aggFind : null };')();   // (v192: and the records)
    return { fns, v: crypto.createHash('sha1').update(g).update(code).update(STATS_FORMAT).digest('hex').slice(0, 10) };
  } catch (e) { log('stats: the page\'s code did not load:', e.message); return null; }
}
// a round that came, changed or went: its players and its map are written again
function aggMark(sum) { if (!sum) return; aggTouch.any = true; aggTouch.maps.add(String(sum.map || '').toLowerCase()); for (const p of sum.P || []) aggTouch.nicks.add(nickOf(p.name)); }
const statsWrite = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v)); fs.renameSync(f + '.tmp', f); };
function writeStats(d) {
  if (!AGG) return;
  // (v166) a list without the players' lines (only rounds.json was there - data/.rounds-full.json lost): the stats stay as
  // they are rather than be written empty; decoding every round again (--rebuild) gives the lines back
  if (d.rounds.some(r => r.sum && !r.sum.empty && !Array.isArray(r.sum.P))) { if (!writeStats.warned) { writeStats.warned = true; log('stats not written: the round list has no players\' lines (data/.rounds-full.json missing?) - decode every round again: sudo systemctl start bf2replay-rebuild'); } return; }
  let st = null; try { st = JSON.parse(fs.readFileSync(STATS_STATE, 'utf8')); } catch (e) {}
  const full = aggTouch.full || !st || st.v !== AGG.v || !fs.existsSync(path.join(STATS, 'table.json'));
  if (!full && !aggTouch.any) { d.stats = { v: AGG.v, at: st?.at || null }; return; }
  const F = AGG.fns, t0 = Date.now();
  const RS = F.aggRounds(d.rounds.map(r => ({ name: r.name, sum: r.sum })));
  const ptsOf = r => HEAT.get(String(r.sum?.map || '').toLowerCase())?.get(r.name) || null;   // (as the page's ptsOf)
  const RT = F.aggRating ? F.aggRating(RS) : null;   // (v215: each player's rating after his latest round - his page)
  const byNick = F.aggByNick(RS), AD = path.join(DATA, '.admin', 'players'), PD = path.join(STATS, 'players'), MD = path.join(STATS, 'maps'), TD = path.join(STATS, 'table');
  // players
  const nicks = full ? [...byNick.keys()] : [...aggTouch.nicks];
  for (const nick of nicks) {
    const R = byNick.get(nick), f = path.join(PD, F.nickSlug(nick) + '.json');
    if (!R) { try { fs.unlinkSync(f); } catch (e) {} try { fs.unlinkSync(path.join(AD, F.nickSlug(nick) + '.json')); } catch (e) {} continue; }
    // (v196) what is the admins' (his headshots against what his weapons give) apart: data/.admin/players
    const { hsx, ...agg } = F.aggPlayer(nick, R, ptsOf), af = path.join(AD, F.nickSlug(nick) + '.json');
    const g = RT?.get(nick);
    statsWrite(f, { v: AGG.v, nick, rounds: R.map(x => [x.r.name, x.p]), agg, ...(g && g.n ? { rt: [Math.round(g.r), g.n, Math.round(g.hi)] } : {}) });
    if (hsx) statsWrite(af, { v: AGG.v, nick, hsx }); else { try { fs.unlinkSync(af); } catch (e) {} }
  }
  // maps
  const mapKey = r => String(r.sum.map || '').toLowerCase(), maps = full ? [...new Set(RS.map(mapKey))] : [...aggTouch.maps];
  for (const m of maps) {
    const R = RS.filter(r => mapKey(r) === m), f = path.join(MD, F.nickSlug(m || '_') + '.json');
    if (!R.length) { try { fs.unlinkSync(f); } catch (e) {} continue; }
    statsWrite(f, { v: AGG.v, map: m, agg: F.aggMap(R, ptsOf) });
  }
  // everyone: names, the Players view (all servers, and each)
  statsWrite(path.join(STATS, 'names.json'), { v: AGG.v, names: [...F.aggNames(RS)].map(([k, nm]) => [k, nm, byNick.get(k)?.length || 0]) });   // ([nick, name, rounds])   // ([nick, name] pairs: in order - an object would put nicks like "610213078" first)
  statsWrite(path.join(STATS, 'table.json'), { v: AGG.v, rows: F.aggTable(RS) });
  const srvs = [...new Set(RS.map(r => r.sum.server).filter(Boolean))];
  for (const sv of srvs) statsWrite(path.join(TD, F.nickSlug(sv) + '.json'), { v: AGG.v, server: sv, rows: F.aggTable(F.aggRounds(RS, sv)) });
  // (v215) clans, vehicles, each server's page (and all servers'), the moments search (each map's kills)
  const SV = path.join(STATS, 'server'), FD = path.join(STATS, 'find');
  if (F.aggClans) statsWrite(path.join(STATS, 'clans.json'), { v: AGG.v, clans: F.aggClans(RS) });
  if (F.aggVehicles) statsWrite(path.join(STATS, 'vehicles.json'), { v: AGG.v, kinds: F.aggVehicles(RS) });
  if (F.aggServer) { statsWrite(path.join(SV, '_all.json'), { v: AGG.v, server: null, agg: F.aggServer(RS) }); for (const sv of srvs) statsWrite(path.join(SV, F.nickSlug(sv) + '.json'), { v: AGG.v, server: sv, agg: F.aggServer(F.aggRounds(RS, sv)) }); statsWrite(path.join(STATS, 'servers.json'), { v: AGG.v, servers: srvs.map(sv => [sv, F.nickSlug(sv), RS.filter(r => r.sum.server === sv).length]) }); }
  if (F.aggFind) for (const m of maps) { const R = RS.filter(r => mapKey(r) === m), f = path.join(FD, F.nickSlug(m || '_') + '.json'); if (!R.length) { try { fs.unlinkSync(f); } catch (e) {} continue; } statsWrite(f, { v: AGG.v, map: m, ...F.aggFind(R, ptsOf) }); }
  if (full) {   // (files of players, maps and servers no longer there)
    const keepP = new Set([...byNick.keys()].map(n => F.nickSlug(n) + '.json')), keepM = new Set([...new Set(RS.map(mapKey))].map(m => F.nickSlug(m || '_') + '.json')), keepT = new Set(srvs.map(sv => F.nickSlug(sv) + '.json'));
    const keepS = new Set(['_all.json', ...srvs.map(sv => F.nickSlug(sv) + '.json')]);
    for (const [dir, keep] of [[PD, keepP], [AD, keepP], [MD, keepM], [TD, keepT], [SV, keepS], [FD, keepM]]) { let L = []; try { L = fs.readdirSync(dir); } catch (e) {} for (const f of L) if (!keep.has(f)) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} } }
  }
  const at = new Date().toISOString(); fs.writeFileSync(STATS_STATE, JSON.stringify({ v: AGG.v, at }));
  d.stats = { v: AGG.v, at };
  if (full) log(`stats: ${byNick.size} players, ${new Set(RS.map(mapKey)).size} maps, ${srvs.length} server${srvs.length === 1 ? '' : 's'} written in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  aggTouch.nicks.clear(); aggTouch.maps.clear(); aggTouch.any = false; aggTouch.full = false;
}
// light (v163): only rounds.json and the progress - during a batch, after each demo; the heat files and the link previews
// (seconds with thousands of rounds: v162 spent ~2.8 s of each demo on them with 5416 rounds, more than the decoding with
// several at once) at most every FULL_EVERY s, at the end of the batch and when the run is stopped (SIGTERM)
const FULL_EVERY = 30e3; let fullAt = 0, fullDue = false;
function writeIndex(d, dec, light = false) {
  if (light && Date.now() - fullAt < FULL_EVERY) { fullDue = true; return writeIndexLight(d, dec); }
  fullAt = Date.now(); fullDue = false;
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
    heat[m] = { file: '.kills/' + heatFile(m), v, rounds: M.size };
  }
  d.heat = heat;
  try { writeStats(d); } catch (e) { log('stats not written:', e.message); }
  try { writeShares(d, dec); d.share = true; } catch (e) { log('link previews not written:', e.message); }
  writeLists(d);
  // how far decoding again is, in a file of its own: the site's progress tag reads it every 30 s while it lasts (rounds.json
  // is too big for that)
  if (d.reprocess) writeProgress({ ...d.reprocess, updated: d.updated });
}
// (the heat files and d.heat stay as the last full write left them: they agree with each other)
function writeIndexLight(d, dec) {
  d.rounds.sort((a, b) => String(b.sum?.date || b.name).localeCompare(String(a.sum?.date || a.name)));
  d.updated = new Date().toISOString(); d.decoder = dec.hash; d.version = 2; delete d.moved;
  writeLists(d);
  if (d.reprocess) writeProgress({ ...d.reprocess, updated: d.updated });
}
// (v166) the whole list for this script, the short one for the site: each round without its players' lines (P) and kills
// (v176: and compact - an array a round, roundsidx.mjs: ~3 times smaller)
const slimSum = x => { if (!x) return x; const { P, pts, hl, fl, ...rest } = x; return rest; };   // (v187: and the posts' highlights; v215: the flags - the server pages, data/stats)
// (v202, Sagara: "a Download demo button on each round; with no demo on my server, a link to where it was downloaded
// from") a round whose demo is gone keeps where it came from: src - the link its page lists now (data/.source-list.json,
// fetch.mjs; srcOk 1) or the one it was downloaded from (data/.fetched.json: maybe gone there too); a round uploaded by a
// game server has none. The site's round line and its /rounds/<round>.html page show the button.
let srcCache = null;
function demoSources() {
  const mt = f => { try { return fs.statSync(path.join(DATA, f)).mtimeMs; } catch (e) { return 0; } }, key = mt('.source-list.json') + '|' + mt('.fetched.json');
  if (srcCache && srcCache.key === key) return srcCache;
  const live = sourceList(DATA), got = new Map(); let F = {}; try { F = JSON.parse(fs.readFileSync(path.join(DATA, '.fetched.json'), 'utf8')) || {}; } catch (e) {}
  const last = u => { try { return decodeURIComponent(String(u).split('?')[0].split('/').pop() || ''); } catch (e) { return ''; } };
  for (const [u, v] of Object.entries(F)) { if (!/^https?:\/\//i.test(u)) continue; const nm = v && v.of ? v.of : last(u); if (nm && (!got.has(nm) || !(v && v.skipped))) got.set(nm, u); }
  srcCache = { key, live, got }; return srcCache;
}
function demoSrcMark(d) {
  let S = null, ch = false;
  for (const r of d.rounds) {
    const was = (r.src || '') + '|' + (r.srcOk || 0);
    if (r.demo) { delete r.src; delete r.srcOk; }
    else {
      S = S || demoSources();
      const u = S.live.get(r.name), g = S.got.get(r.name), url = /^https?:\/\//i.test(u || '') ? u : g || null;
      if (url) { r.src = url; if (url === u) r.srcOk = 1; else delete r.srcOk; } else { delete r.src; delete r.srcOk; }
    }
    if ((r.src || '') + '|' + (r.srcOk || 0) !== was) ch = true;
  }
  return ch;
}
function writeLists(d) {
  const put = (f, text) => { fs.writeFileSync(f + '.tmp', text); fs.renameSync(f + '.tmp', f); };
  put(FULL_INDEX, JSON.stringify(d));
  const { heat, rounds, ...head } = d;
  put(INDEX, JSON.stringify(compactIndex(head, rounds.map(r => r.sum ? { ...r, sum: slimSum(r.sum) } : r))));
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
  // (v182) a copy taken off the list: its link (posted before) shows the kept round's preview and opens it
  for (const [c, x] of Object.entries(copiesRead())) { const id = baseOf(c), of = baseOf(x.of || ''); if (!want.r.has(id) && want.r.has(of)) want.r.set(id, want.r.get(of)); }
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
      `${a.k} kills, ${a.d} deaths (K/D ${(a.k / Math.max(1, a.d)).toFixed(2)})`, `won ${a.wins}`, `score ${a.score}`].join(' · ');
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
.months{display:flex;flex-wrap:wrap;gap:6px 14px}h3{font-size:14px;margin:16px 0 6px;color:#8b9a89}table.rec tbody th{text-transform:none;letter-spacing:0;font-size:13px;color:#dde4d6;white-space:normal;min-width:170px;vertical-align:top}table.rec td{vertical-align:top;line-height:1.35}footer{max-width:1100px;margin:0 auto;padding:0 16px 30px;color:#8b9a89;font-size:13px}
.dl{display:inline-block;margin:6px 8px 14px 0;padding:7px 12px;border:1px solid #2b3830;border-radius:4px;background:#151c17;font-weight:600}.dl:hover{text-decoration:none;border-color:#e2b547}.srvnav{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;margin:0 0 14px}.srvnav a,.srvnav b{padding:5px 10px;border:1px solid #2b3830;border-radius:4px;background:#151c17;font-size:13px;white-space:nowrap}.srvnav b{border-color:#e2b547;color:#e2b547}.srvnav .mute{margin-left:4px;font-weight:400}.srvnav>span:first-child{color:#8b9a89;font-size:13px}
.find{margin:0 0 12px}.find input{font:14px system-ui,sans-serif;color:#dde4d6;background:#151c17;border:1px solid #2b3830;border-radius:4px;padding:7px 10px;width:min(320px,100%)}.find input:focus{outline:2px solid #e2b547;outline-offset:1px}tr[hidden]{display:none}`;
function wwwPage({ title, desc, canon, body, abs, script }) {
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
${script ? `<script>${script}</script>\n` : ''}</body></html>
`;
}
// (v193) the players page: "Find a player" hides the rows whose names have it not (the page works without it too)
const WWW_FIND = `(function(){var f=document.getElementById('find'),c=document.getElementById('fcount'),no=document.getElementById('fnone'),R=[].slice.call(document.querySelectorAll('#pl tbody tr'));
function go(){var q=f.value.trim().toLowerCase(),n=0;R.forEach(function(r){var on=!q||r.getAttribute('data-f').indexOf(q)>=0;r.hidden=!on;if(on)n++;});c.textContent=q?n+' of '+R.length:'';no.hidden=!q||n>0;if(q&&!n)no.textContent='No player has \u201c'+f.value.trim()+'\u201d in his name.';try{history.replaceState(null,'',q?'#'+encodeURIComponent(f.value.trim()):location.pathname);}catch(e){}}
f.oninput=go;f.onkeydown=function(e){if(e.key==='Enter'){var v=R.filter(function(r){return!r.hidden;});if(v.length===1)location.href=v[0].querySelector('a').href;}};
if(location.hash.length>1){try{f.value=decodeURIComponent(location.hash.slice(1));}catch(e){}go();}})();`;
const WWW_VER = 6;   // (raise when the pages change: they are all written again; 2: records; 3, v192: the records of the highlights; 4, v193: Find a player; 5, v201: records by server; 6, v202: a round's demo to download)
function writeWww(d, dec) {
  const abs = DOMAIN ? `https://${DOMAIN}/` : '';
  // nothing new (the same rounds, decoder, domain and pages as last time: bf2replay-reprocess runs this every minute): skip
  // (and the day: the records page's week and month move on)
  const stamp = crypto.createHash('sha1').update(JSON.stringify([WWW_VER, abs, !!d.share, new Date().toISOString().slice(0, 10), d.rounds.map(r => [r.name, r.decoder, r.added, r.sumV, !!r.demo, r.src || '', r.resumAt || ''])])).digest('hex'), stampF = path.join(WWW, '.stamp');
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
  const roundTable = (list, cols) => `<div class="wrap"><table><thead><tr><th>Started</th>${cols.map ? '<th>Map</th>' : ''}${cols.server ? '<th>Server</th>' : ''}<th class="n">Length</th><th class="n">Players</th><th class="n">Kills</th><th>Result</th><th>Best score</th></tr></thead><tbody>
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
<div class="wrap"><table><thead><tr><th>Player</th><th class="n">Score</th><th class="n">Kills</th><th class="n">Deaths</th><th class="n">Headshots</th><th class="n">Best streak</th><th class="n">Revives</th></tr></thead><tbody>
${L.map(p => `<tr><td>${plink(p.name)}</td><td class="n">${p.score || 0}</td><td class="n">${p.k}</td><td class="n">${p.d}</td><td class="n">${p.hs || 0}</td><td class="n">${p.streak || '–'}</td><td class="n">${p.rev || 0}</td></tr>`).join('\n')}
</tbody></table></div>` : '';
    files.set(`rounds/${id}.html`, wwwPage({ abs, canon: `/rounds/${id}.html`, title: `${mapName(m)} · ${dayOf(s.date)}`, desc: `Battlefield 2 on ${mapName(m)}: ${roundDesc(s)}.`,
      body: `${hasPic(m) ? `<img class="pic" src="/assets/maps/${escH(m)}.webp" alt="Map of ${escH(mapName(m))}" width="220" height="220">` : ''}<h1>${escH(mapName(m))} · ${escH(dayOf(s.date))}</h1>
<p class="sub">${escH(s.server)} · ${mmss(s.duration)} · ${s.players} players · ${s.kills} kills</p><p>${result(s)}</p>
<a class="go" href="/#round=${encodeURIComponent(id)}">▶ Watch the round on the map</a> ${r.demo ? `<a class="dl" href="/data/${escH(r.demo)}" download="${escH(r.name)}" rel="nofollow">⬇ Download the demo</a>` : r.src && /^https?:\/\//i.test(r.src) ? `<a class="dl" href="${escH(r.src)}" rel="nofollow noopener noreferrer" title="No longer on this server${r.srcOk ? ': its source still lists it' : ': where it was downloaded from (it may be gone there too)'}">⬇ The demo at its source ↗</a>` : '<span class="mute">(its demo is no longer on this server)</span>'} <a href="/maps/${escH(mf)}.html">More rounds on ${escH(mapName(m))}</a>
${side(0, sides[0])}${side(1, sides[1])}` }));
  }
  // players: everyone with his rounds
  const PL = [...P.values()].sort((a, b) => b.rounds.length - a.rounds.length || b.k - a.k);
  files.set('players/index.html', wwwPage({ abs, canon: '/players/', title: 'Battlefield 2 players', desc: `${PL.length} Battlefield 2 players: rounds, kills, deaths, K/D.`,
    body: `<h1>Players</h1><p class="sub">${PL.length} players over ${R.length} rounds, most rounds first. One player under several clan tags is one row.</p>
<p class="find"><input type="search" id="find" placeholder="Find a player" aria-label="Find a player" autocomplete="off" spellcheck="false"> <span class="mute" id="fcount" aria-live="polite"></span></p>
<div class="wrap"><table id="pl"><thead><tr><th>Player</th><th class="n">Rounds</th><th class="n">Won</th><th class="n">Kills</th><th class="n">Deaths</th><th class="n">K/D</th><th class="n">Score</th><th>Last played</th></tr></thead><tbody>
${PL.map(a => `<tr data-f="${escH([a.nick, ...a.names].join(' ').toLowerCase())}"><td><a href="/players/${escH(nickSlug(a.nick))}.html">${escH(a.name)}</a></td><td class="n">${a.rounds.length}</td><td class="n">${a.wins}</td><td class="n">${a.k}</td><td class="n">${a.d}</td><td class="n">${kd(a.k, a.d)}</td><td class="n">${a.score}</td><td class="mute">${escH(dayOf(a.rounds[0].r.sum.date).replace(/, \d\d:\d\d$/, ''))}</td></tr>`).join('\n')}
</tbody></table></div><p class="mute" id="fnone" hidden></p>`, script: WWW_FIND }));
  for (const a of PL) {
    const slug = nickSlug(a.nick), maps = new Map(); for (const { r } of a.rounds) maps.set(mk(r.sum), (maps.get(mk(r.sum)) || 0) + 1);
    const aka = [...a.names].filter(x => x !== a.name);
    files.set(`players/${slug}.html`, wwwPage({ abs, canon: `/players/${slug}.html`, title: `${a.name} · Battlefield 2 player`, desc: `${a.name} in Battlefield 2: ${a.rounds.length} rounds, ${a.k} kills, ${a.d} deaths (K/D ${kd(a.k, a.d)}), won ${a.wins}.`,
      body: `<h1>${escH(a.name)}</h1><p class="sub">${aka.length ? `also as ${aka.map(escH).join(', ')} · ` : ''}${a.rounds.length} rounds · ${a.k} kills · ${a.d} deaths · K/D ${kd(a.k, a.d)} · won ${a.wins} · score ${a.score}${a.hs ? ` · ${a.hs} headshots` : ''}</p>
<a class="go" href="/#player=${encodeURIComponent(a.nick)}">▶ His page in the replay</a>
<h2>Maps</h2><p>${[...maps].sort((x, y) => y[1] - x[1]).map(([m, c]) => `<a href="/maps/${escH(m)}.html">${escH(mapName(m))}</a> <span class="mute">${c}</span>`).join(' · ')}</p>
<h2>Rounds</h2><div class="wrap"><table><thead><tr><th>Started</th><th>Map</th><th>Side</th><th>Result</th><th class="n">Score</th><th class="n">Kills</th><th class="n">Deaths</th></tr></thead><tbody>
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
    ['kVeh', 'Most kills from vehicles', v => v], ['rev', 'Most revives', v => v], ['rep', 'Most repairs', v => v], ['score', 'Best score', v => v], ['kd', 'Best K/D (10 kills or more)', v => v.toFixed(2)]];
  const recVal = (p, key) => key === 'kd' ? (p.k >= 10 ? p.k / Math.max(1, p.d) : 0) : (p[key] || 0);
  const oneMap = new Set(R.map(r => mapOf(r.sum))).size < 2, shortDay = d => { const m = /^(\d{4})-(\d\d)-(\d\d)(?:\s+(\d\d:\d\d))?/.exec(d || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) + (m[4] ? ' ' + m[4] : '') : ''; };
  const rlink = r => `<a href="/rounds/${escH(idOf(r.name))}.html">${escH(shortDay(r.sum.date))}</a>${oneMap ? '' : ` <span class="mute">${escH(mapName(mapOf(r.sum)))}</span>`}`;
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const PER = [['week', 'The last 7 days', 7], ['month', 'The last 30 days', 30], ['ever', 'All rounds', Infinity]];
  const recSection = (RR, [key, title, days]) => {
    const L = RR.filter(r => days === Infinity || when(r) > today - days * 86400e3); if (!L.length) return `<h2 id="${key}">${escH(title)}</h2><p class="mute">No rounds.</p>`;
    // (v192) with the page's records (aggRecs over REC_KEYS: the highlights too - streaks on foot and in vehicles, the
    // longest kill with a launcher / small arms / a sniper rifle, knife, claymores, mines, run over, flags...); an older
    // page: the first nine as before
    const RA = AGG?.fns?.aggRecs, RK = AGG?.fns?.REC_KEYS, RBN = new Map(L.map(r => [r.name, r]));
    const rows = RA && RK ? (() => { const A = RA(L); return RK.map(([k, name, unit]) => { const top = A[k]; if (!top) return '';
      const val = (v, w) => unit === 'm' ? `<b>${v} m</b>${w ? ` <span class="mute">${escH(w)}</span>` : ''}` : `<b>${escH(k === 'kd' ? Number(v).toFixed(2) : String(v))}</b>`;
      return `<tr><th>${escH(name)}</th>${top.map(([v, nm, rn, w], i) => `<td${i ? ' class="mute"' : ''}>${val(v, w)} ${plink(nm)}<br>${RBN.has(rn) ? rlink(RBN.get(rn)) : ''}</td>`).join('')}${'<td></td>'.repeat(3 - top.length)}</tr>`; }).join('\n'); })()
      : REC.map(([k, name, fmt]) => {
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
<h3>Most over ${escH(days === Infinity ? 'all rounds' : 'these ' + days + ' days')}</h3><div class="wrap"><table><thead><tr><th>Player</th><th class="n">Score</th><th class="n">Rounds</th><th class="n">Won</th><th class="n">Kills</th><th class="n">Deaths</th><th class="n">K/D</th><th class="n">Revives</th></tr></thead><tbody>
${T.map(a => `<tr><td>${plink(a.name)}</td><td class="n">${a.score}</td><td class="n">${a.n}</td><td class="n">${a.wins}</td><td class="n">${a.k}</td><td class="n">${a.d}</td><td class="n">${kd(a.k, a.d)}</td><td class="n">${a.rev}</td></tr>`).join('\n')}
</tbody></table></div>`;
  };
  // (v201, Sagara: "Records with a choice of the server it happened on") all servers, and a page for each: records/<server>.html
  const SV = [...servers].filter(Boolean).map(sv => [sv, R.filter(r => r.sum.server === sv)]).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const recFile = sv => sv ? `records/${nickSlug(sv)}.html` : 'records/index.html', recHref = sv => sv ? `/records/${nickSlug(sv)}.html` : '/records/';
  const srvNav = cur => manySrv ? `<nav class="srvnav" aria-label="Server"><span>Server</span>${[[null, 'All servers', R.length], ...SV.map(([sv, L]) => [sv, sv, L.length])].map(([sv, nm, n]) => sv === cur ? `<b aria-current="page">${escH(nm)}<span class="mute">${n}</span></b>` : `<a href="${recHref(sv)}">${escH(nm)}<span class="mute">${n}</span></a>`).join('')}</nav>` : '';
  for (const [sv, RR] of [[null, R], ...(manySrv ? SV : [])]) files.set(recFile(sv), wwwPage({ abs, canon: recHref(sv), title: sv ? `Battlefield 2 records · ${sv}` : 'Battlefield 2 records', desc: `Records of ${RR.length} Battlefield 2 rounds${sv ? ` on ${sv}` : ''}: most kills, longest kill, longest streak, best medic, this week, this month and ever.`,
    body: `<h1>Records${sv ? ` <span class="mute">· ${escH(sv)}</span>` : ''}</h1>${srvNav(sv)}<p class="sub">The best in one round, and who did most${sv ? ' on this server' : ''}: <a href="#week">the last 7 days</a> · <a href="#month">the last 30 days</a> · <a href="#ever">all rounds</a>. Scores as the replay reckons them from the round's events.</p>
${PER.map(per => recSection(RR, per)).join('\n')}` }));
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
    const urls = ['', 'rounds/', 'players/', 'maps/', 'records/', ...(manySrv ? SV.map(([sv]) => recHref(sv).slice(1)) : []), ...[...months.keys()].map(m => `rounds/${m}.html`), ...R.map(r => `rounds/${idOf(r.name)}.html`), ...PL.map(a => `players/${nickSlug(a.nick)}.html`), ...ML.map(([m]) => `maps/${m}.html`)];
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
  const old = idx.rounds.findIndex(r => r.name === name); if (old >= 0) { aggMark(idx.rounds[old].sum); idx.rounds.splice(old, 1); }
  heatPut(name, null);
}
// ---------- (v182) the same round twice ----------
// The same demo on two demo pages (a clan's page and the game server's own: fetch.mjs before v182 downloaded it from
// both, the second under the server's address, 1.2.3.4_auto_2026_10_03_18_21_02.bf2demo) was two rounds on the site,
// and every kill in them counted twice in the stats. One is kept - the plain name over the one with an address in front,
// else the one listed first; the other's demo and decoded round go to data/.copies (not served; nothing is deleted: remove that
// folder when you like), it leaves the list and the stats, and its link (/r/<the copy>) opens the kept round.
// data/.copies.json: { copies: { "<copy>.bf2demo": { of: "<kept>.bf2demo", at, bytes } } }. The same round = the same
// server, map, start (to the second), length, soldiers, kills and tickets.
const COPIES_DIR = path.join(DATA, '.copies'), COPIES_FILE = path.join(DATA, '.copies.json');
let COPIES = null;
const copiesRead = () => { if (!COPIES) { try { COPIES = JSON.parse(fs.readFileSync(COPIES_FILE, 'utf8')).copies || {}; } catch (e) { COPIES = {}; } } return COPIES; };
const copiesSave = () => { const f = COPIES_FILE; try { fs.writeFileSync(f + '.tmp', JSON.stringify({ copies: COPIES || {} }, null, 1)); fs.renameSync(f + '.tmp', f); } catch (e) { log('.copies.json not written:', e.message); } };
const sameKey = s => s && !s.empty && s.date && s.server ? JSON.stringify([s.date, s.server, mapOf(s), Math.round((+s.duration || 0) * 10), s.players, s.kills, s.tickets || null]) : null;
// of two listed rounds, the one to keep
const keepOf = (a, b) => b.name.endsWith('_' + a.name) ? a : a.name.endsWith('_' + b.name) ? b : String(b.added || '') < String(a.added || '') ? b : a;
function moveCopy(idx, name, src, of) {
  fs.mkdirSync(COPIES_DIR, { recursive: true });
  let bytes = null;
  try { if (src && fs.existsSync(src)) { bytes = fs.statSync(src).size; fs.renameSync(src, path.join(COPIES_DIR, name)); } } catch (e) { log('could not move', name, '-', e.message); }
  const base = baseOf(name);
  for (const f of fs.readdirSync(DIRS.rounds)) if (f.startsWith(base + '.')) { try { fs.renameSync(path.join(DIRS.rounds, f), path.join(COPIES_DIR, f)); } catch (e) { log('could not move', f, '-', e.message); } }
  const old = idx.rounds.findIndex(r => r.name === name); if (old >= 0) { aggMark(idx.rounds[old].sum); bytes ??= idx.rounds[old].bytes ?? null; idx.rounds.splice(old, 1); }
  heatPut(name, null);
  copiesRead()[name] = { of, at: new Date().toISOString(), bytes };
}
// every round listed twice (or more): the copies off the list - at the start of each run (the copies listed before v182)
function dropCopies(idx) {
  const by = new Map();
  for (const r of idx.rounds) { const k = sameKey(r.sum); if (!k) continue; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  const moves = [];
  for (const G of by.values()) if (G.length > 1) { const keep = G.reduce(keepOf); for (const r of G) if (r !== keep) moves.push([r.name, keep.name]); }
  for (const [name, of] of moves) moveCopy(idx, name, path.join(DIRS.demos, name), of);
  if (moves.length) {
    copiesSave();
    log(`${moves.length} round${moves.length === 1 ? '' : 's'} listed twice (the same demo from two demo pages): the cop${moves.length === 1 ? 'y' : 'ies'} moved to data/.copies and taken off the list, e.g. ${moves[0][0]} (the same as ${moves[0][1]})`);
  }
  return moves.length;
}
// the heavy part of a demo, also in a worker thread: decoded, summed up, packed (.bfr) - { sum, info, bfr } or { sum, drop }
async function decodeWork(dec, src, name) {
  const { tl, hdr, info } = await decodeFile(dec, src, name), sum = tl ? summarize(tl, hdr, dec) : null;
  if (!tl || sum.empty || sum.players < MIN_PLAYERS) return { sum, drop: true };
  return { sum, info, bfr: bfrBuild({ name, info, tl }) };
}
const NEW_ROUNDS = [];
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
  // (v182) a new demo of a round already listed (the same demo from another demo page): kept in data/.copies, not listed
  const twin = old < 0 && sameKey(sum) && idx.rounds.find(r => sameKey(r.sum) === sameKey(sum));
  if (twin) { moveCopy(idx, name, src, twin.name); copiesSave(); log('the same round as', twin.name, '(another demo page): moved to data/.copies, not listed -', name); return; }
  const base = baseOf(name), bfrName = `${base}.${dec.hash}.bfr`;
  for (const f of fs.readdirSync(DIRS.rounds)) if (f.startsWith(base + '.') && f !== bfrName) fs.unlinkSync(path.join(DIRS.rounds, f));   // made by an older decoder
  const tmp = path.join(DIRS.rounds, bfrName + '.tmp');
  fs.writeFileSync(tmp, bfr); fs.renameSync(tmp, path.join(DIRS.rounds, bfrName));
  if (move) fs.renameSync(src, path.join(DIRS.demos, name));
  const entry = { name, demo: 'demos/' + name, bfr: 'rounds/' + bfrName, bytes: info.bytes, bfrBytes: bfr.length, decoder: dec.hash, sumV: SUM_V, added: old >= 0 ? idx.rounds[old].added : new Date().toISOString(), sum };
  heatPut(name, entry.sum);
  if (old >= 0) aggMark(idx.rounds[old].sum); aggMark(entry.sum);   // (v165: their players' and maps' stats)
  if (old >= 0) idx.rounds[old] = entry; else idx.rounds.push(entry);
  if (old < 0 && move) NEW_ROUNDS.push({ ...entry, clip: info.clipAt != null });   // (v153: posted to Discord / Telegram after the queue, notify.mjs)
  log('round', name, `${(info.bytes / 1e6).toFixed(1)} MB -> ${(bfr.length / 1e6).toFixed(1)} MB`, `${entry.sum.players} players, ${entry.sum.kills} kills`, `${((Date.now() - t0) / 1000).toFixed(1)} s`, note);
}
// ---------- several demos at once (v162) ----------
// how many: BF2R_JOBS from /etc/bf2replay.conf when set (1-16), else the admin page's choice (data/.ingest.json:
// { jobs: 0 = automatic | 1-16 }), else AUTO_JOBS
const JOBS_FILE = path.join(DATA, '.ingest.json'), STATS_FILE = path.join(DATA, '.ingest-stats.json'), NOW_FILE = path.join(DATA, '.ingest-now.json');
function jobsWanted() {
  if (CONF_JOBS) return Math.min(JOBS_MAX, CONF_JOBS);
  let j = 0; try { j = Math.floor(+JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')).jobs) || 0; } catch (e) {}
  return j > 0 ? Math.min(JOBS_MAX, j) : AUTO_JOBS;
}
const sizeOf = f => { try { return fs.statSync(f).size; } catch (e) { return 0; } };
const writeJsonF = (f, v) => { try { fs.writeFileSync(f + '.tmp', JSON.stringify(v)); fs.renameSync(f + '.tmp', f); } catch (e) { log(path.basename(f), 'not written:', e.message); } };
// how fast each number of demos at once went on this machine (for the admin page: pick the best): per number, the demos
// decoded while that many ran side by side (the start and end of a batch, when fewer run, are left out), their bytes
// and the seconds each took; the machine's cores and memory with it (another machine: counted from scratch)
const MACHINE = `${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB`;
function speedAdd(jobs, bytes, secs) {
  let S = null; try { S = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); } catch (e) {}
  if (!S || S.machine !== MACHINE) S = { machine: MACHINE, by: {}, since: new Date().toISOString() };
  const o = S.by[jobs] || (S.by[jobs] = { n: 0, bytes: 0, secs: 0 }); o.n++; o.bytes += bytes; o.secs = +(o.secs + secs).toFixed(2); o.last = new Date().toISOString();
  writeJsonF(STATS_FILE, S);
}
// worker threads, each with the page's decoder loaded itself (the same file: the same hash); more are made as needed,
// and one given back when more run than wanted is stopped
class Pool {
  constructor(hash) { this.hash = hash; this.free = []; this.n = 0; }
  take() { if (this.free.length) return this.free.pop(); this.n++; const w = new Worker(new URL(import.meta.url), { workerData: { hash: this.hash } }); w.unref(); return w; }
  give(w, keep) { if (this.n > keep) { this.n--; w.terminate(); } else this.free.push(w); }
  run(w, src, name) {
    return new Promise((res, rej) => {
      const off = () => { w.off('message', onMsg); w.off('error', onErr); w.off('exit', onExit); };
      const onMsg = m => { off(); m.ok ? res(m.r) : rej(new Error(m.err)); };
      const onErr = e => { off(); e.dead = true; rej(e); };
      const onExit = c => { off(); const e = new Error(`the decoding thread stopped (${c}): out of memory? fewer at once on the admin page`); e.dead = true; rej(e); };
      w.on('message', onMsg); w.once('error', onErr); w.once('exit', onExit); w.postMessage({ src, name });
    });
  }
  close() { for (const w of this.free) w.terminate(); this.free = []; this.n = 0; }
}
// (v163) the site updated while this run goes on (git pull: a new site/index.html - maybe a new decoder - or a new
// ingest.mjs): no more demos are started; the ones being decoded are finished and listed, and the run ends, so that the
// next one - the new code - takes over at once (before v163 an old run went on for up to 2 h, with the old decoder,
// while bf2replay-reprocess waited for the lock)
const SELF = new URL(import.meta.url).pathname;
const updStamp = () => { try { return fs.statSync(path.join(SITE, 'index.html')).mtimeMs + ':' + fs.statSync(SELF).mtimeMs; } catch (e) { return ''; } };
let STAMP0 = null; const siteChanged = () => STAMP0 !== null && updStamp() !== STAMP0;
let FLUSH = null;   // (the round list written in full: on SIGTERM - systemctl stop, the 2 h limit - before the run ends)
// decode items ([{ name, src, bytes }]) several at once, as many as jobsWanted() says (looked at again after each demo
// and every 5 s); each result goes to done(item, pre, err, t0, k: the how-manyth done) on this thread, one after another. A single demo is
// decoded here, without a worker. P (progress): { kind, total, done, jobs, busy } - written to data/.ingest-now.json
async function decodeAll(dec, items, done, P) {
  if (!items.length) return;
  const now = () => writeJsonF(NOW_FILE, { ...P, pid: process.pid, updated: new Date().toISOString() });
  P.total = items.length; P.done = 0; P.since = new Date().toISOString(); P.jobs = Math.min(jobsWanted(), items.length); P.busy = 0; now();
  try {
    if (items.length === 1) {
      const it = items[0], t1 = Date.now(); P.busy = 1; now();
      let pre = null, err = null; try { pre = await decodeWork(dec, it.src, it.name); } catch (e) { err = e; }
      if (!err) speedAdd(1, it.bytes, (Date.now() - t1) / 1000);
      P.done = 1; P.busy = 0; await done(it, pre, err, t1, 1); return;
    }
    const pool = new Pool(dec.hash); let next = 0, busy = 0, chain = Promise.resolve(), tick = 0;
    await new Promise(resolve => {
      const pump = () => {
        const want = jobsWanted();
        if (want !== P.jobs) { log(`${want} at once now (was ${P.jobs})`); P.jobs = want; now(); }
        if (!P.stopped && next < items.length && siteChanged()) { P.stopped = true; log(`the site was updated: ${items.length - next} ${P.kind === 'again' ? 'rounds' : 'demos'} left for the next run (the new code)`); }
        const go = []; while (!P.stopped && busy < want && next < items.length) go.push(start(items[next++], want));
        for (const g of go) g.full = busy === want;   // (all of them side by side: the first ones of a batch start together)
        if (go.length) now();
        if (!busy && (P.stopped || next >= items.length)) { clearInterval(tick); chain.then(resolve); }
      };
      const start = (it, want) => {
        busy++; P.busy = busy; const w = pool.take(), t1 = Date.now(), rec = { full: false };
        pool.run(w, it.src, it.name).then(pre => [pre, null], err => [null, err]).then(([pre, err]) => {
          busy--; P.busy = busy;
          if (err && err.dead) pool.n--; else pool.give(w, jobsWanted());
          if (!err && rec.full && busy + 1 === want) speedAdd(want, it.bytes, (Date.now() - t1) / 1000);   // (ran with that many beside it to the end)
          const k = ++P.done; now();
          chain = chain.then(() => done(it, pre, err, t1, k)).catch(e => log('error after decoding', it.name, '-', e.message));
          pump();
        });
        return rec;
      };
      tick = setInterval(pump, 5000); pump();
    });
    pool.close();
  } finally { try { fs.unlinkSync(NOW_FILE); } catch (e) {} }
}
const hm = s => s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round(s % 3600 / 60)} min` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`;

async function main() {
  for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });
  STAMP0 = updStamp();
  const dec = loadDecoder(), idx = readIndex();
  FLUSH = () => writeIndex(idx, dec);
  let changed = false;
  AGG = loadAgg();
  if (AGG) { let st = null; try { st = JSON.parse(fs.readFileSync(STATS_STATE, 'utf8')); } catch (e) {} if (!st || st.v !== AGG.v || !idx.stats) { changed = true; log(st ? 'stats: the page\'s code changed - all written again' : 'stats: written for the first time'); } }
  if (args.has('--rebuild')) aggTouch.full = true;
  const S0 = SAME_ROUNDS[dec.hash], rules = (Array.isArray(S0) ? (S0.every(x => typeof x === 'string') ? [{ from: S0 }] : S0) : S0 ? [S0] : []).map(q => ({ from: q.from || [], except: new Set(q.except || []) }));
  for (const r of idx.rounds) if (rules.some(q => q.from.includes(r.decoder) && !q.except.has(mapOf(r.sum)))) { r.decoder = dec.hash; changed = true; }
  // rounds listed before with fewer players than BF2R_MIN_PLAYERS (set or raised since) leave the list
  for (const r of idx.rounds.filter(r => r.sum && !r.sum.empty && r.sum.players < MIN_PLAYERS)) {
    dropRound(idx, r.name, path.join(DIRS.demos, r.name)); changed = true;
    log(`round with ${r.sum.players} player${r.sum.players === 1 ? '' : 's'} taken off the list (BF2R_MIN_PLAYERS ${MIN_PLAYERS})`, r.name);
  }
  if (dropCopies(idx)) changed = true;   // (v182: a round listed twice)
  // 1. new demos (and round logger files) from the game server(s); a name ending .part is still being uploaded
  let incoming = []; try { incoming = fs.readdirSync(INC); } catch (e) { log('no upload folder', INC); }
  const fresh = [];
  for (const f of incoming.sort()) {
    const src = path.join(INC, f); let st = null; try { st = fs.statSync(src); } catch (e) { continue; }
    if (f.endsWith('.part') || !st.isFile()) continue;
    if (/^round_.*\.json$/i.test(f)) { fs.renameSync(src, path.join(DIRS.logs, f)); log('round log', f); continue; }
    if (!/\.bf2demo(\.gz)?$/i.test(f)) continue;
    if (fs.existsSync(path.join(DIRS.demos, f)) && idx.rounds.some(r => r.name === f)) { fs.unlinkSync(src); log('already have', f); continue; }   // (sent twice)
    fresh.push({ name: f, src, bytes: st.size });
  }
  // (v163) a demo kept in data/demos with no round listed: a run stopped between keeping it and writing the list (before
  // v163 every demo was followed by seconds of writing it, with thousands of rounds) - decoded again and listed
  { const listed = new Set(idx.rounds.map(r => r.name)), queued = new Set(fresh.map(o => o.name)), orph = [];
    for (const f of fs.readdirSync(DIRS.demos).sort()) if (/\.bf2demo(\.gz)?$/i.test(f) && !listed.has(f) && !queued.has(f)) { const src = path.join(DIRS.demos, f); try { const st = fs.statSync(src); if (st.isFile()) orph.push({ name: f, src, bytes: st.size, kept: true }); } catch (e) {} }
    if (orph.length) { log(`${orph.length} demo${orph.length === 1 ? '' : 's'} in data/demos with no round listed: decoded again`); fresh.push(...orph); } }
  // (v162) several at once (decodeAll); each round is listed as soon as it is decoded
  if (fresh.length > 1) log(`decoding ${fresh.length} new demos, ${Math.min(jobsWanted(), fresh.length)} at once`);
  const NOW = { kind: 'new' };
  await decodeAll(dec, fresh, async (it, pre, err, t1, k) => {
    const bad = e => { log('could not read', it.name, '-', e.message); try { fs.renameSync(it.src, path.join(DIRS.bad, it.name)); } catch (e2) {} };
    if (err && err.dead) log('not decoded now:', it.name, '-', err.message, '(it stays where it is: tried again at the next run)');   // (the thread stopped, not the demo's fault)
    else if (err) bad(err);
    else { try { await processDemo(dec, idx, it.src, it.name, { move: !it.kept, pre, t0: t1, note: fresh.length > 1 ? `[new ${k}/${fresh.length}, ${NOW.jobs} at once]` : '' }); changed = true; } catch (e) { bad(e); } }
    writeIndex(idx, dec, true);   // after each round, so the site lists it at once (light: the heat files and previews every 30 s)
  }, NOW);
  if (fullDue) writeIndex(idx, dec);
  // (v153) a post about each new round in Discord / Telegram, when the admin page (or bf2replay.conf) says where
  if (NEW_ROUNDS.length) { try { const { notifyRounds } = await import('./notify.mjs'); await notifyRounds(NEW_ROUNDS.splice(0)); } catch (e) { log('round posts:', e.message); } }
  // 1b. (v183) rounds summed up by an older summarize (SUM_V): summed up again from their decoded round (.bfr), without
  // decoding the demo (~0.5 s a round) - once for every round after the update; stopped by a site update or SIGTERM, the
  // rest at the next run
  // (v206, the admin page's "Recalculate all records": data/.resum-request.json { at }) every round, as if summed up by an
  // older one - each marked (resumAt) so a run stopped half way goes on with the rest; when all are done .resum-done.json
  // { at, end, n, bad, ms }; how far now: .resum-now.json
  const RQF = path.join(DATA, '.resum-request.json'), RDF = path.join(DATA, '.resum-done.json'), RNF = path.join(DATA, '.resum-now.json');
  let RQ = null; try { RQ = JSON.parse(fs.readFileSync(RQF, 'utf8')); } catch (e) {}
  let RD = null; try { RD = JSON.parse(fs.readFileSync(RDF, 'utf8')); } catch (e) {}
  const forced = RQ && RQ.at && (!RD || !RD.at || RD.at < RQ.at) ? RQ.at : null;
  { const old = idx.rounds.filter(r => ((r.sumV || 1) < SUM_V || (forced && r.resumAt !== forced)) && r.bfr && r.sum && !r.sum.empty);
    if (forced && !old.length) { writeJsonF(RDF, { at: forced, end: new Date().toISOString(), n: 0, bad: 0, ms: 0 }); try { fs.unlinkSync(RNF); } catch (e) {} }
    if (old.length && !siteChanged()) {
      const t0 = Date.now(); let k = 0, bad = 0;
      log(`summing up ${old.length} round${old.length === 1 ? '' : 's'} again (${forced ? 'asked for on the admin page: "Recalculate all records"' : `summary version ${SUM_V}`}: ${SUM_V >= 7 ? "the kills' distances, the records" : SUM_V >= 3 ? "the round's highlights for the posts" : "the kills' hit part, a weapon where the game names none"}) from the decoded rounds - no decoding`);
      for (const r of old) {
        if (siteChanged()) { log(`the site was updated: ${old.length - k} rounds left to sum up again at the next run`); break; }
        try { const B = bfrRead(path.join(DATA, r.bfr)), sum = summarize(B.tl, B.info?.hdr || null, dec); aggMark(r.sum); r.sum = sum; heatPut(r.name, sum); aggMark(sum); }
        catch (e) { bad++; log('not summed up again:', r.name, '-', e.message); }
        r.sumV = SUM_V; if (forced) r.resumAt = forced; changed = true; k++;
        if (forced && (k % 25 === 0 || k === old.length)) { try { writeJsonF(RNF, { at: forced, done: k, total: old.length, since: new Date(t0).toISOString() }); } catch (e) {} }
        if (k % 250 === 0 && k < old.length) { const el = (Date.now() - t0) / 1000; log(`summed up ${k} of ${old.length} again, ~${hm(el / k * (old.length - k))} left`); writeIndex(idx, dec, true); }
      }
      writeIndex(idx, dec); log(`summed up ${k} rounds again in ${hm((Date.now() - t0) / 1000)}${bad ? `, ${bad} could not be read (kept as they were)` : ''}`);
      if (forced && k === old.length) { writeJsonF(RDF, { at: forced, end: new Date().toISOString(), n: k, bad, ms: Date.now() - t0 }); try { fs.unlinkSync(RNF); } catch (e) {} log('all records worked out again (asked for on the admin page)'); }
    }
  }
  // 2. after a site update: rounds made by another decoder are decoded again from their demo
  if ((args.has('--reprocess') || args.has('--rebuild')) && siteChanged()) log('the site was updated: decoding again is left for the next run (the new code)');
  else if (args.has('--reprocess') || args.has('--rebuild')) {
    const all = args.has('--rebuild') ? fs.readdirSync(DIRS.demos).filter(f => /\.bf2demo(\.gz)?$/i.test(f)) : idx.rounds.filter(r => r.decoder !== dec.hash).map(r => r.name);
    if (args.has('--rebuild')) idx.rounds = idx.rounds.filter(r => all.includes(r.name) || fs.existsSync(path.join(DATA, r.bfr)));
    const gone = [], names = all.filter(name => { if (fs.existsSync(path.join(DIRS.demos, name))) return true; gone.push(name); return false; });
    // (v186: one line for them all - with demos removed there can be thousands; downloaded again by fetch.mjs while their
    // page lists them: step 3)
    if (gone.length) log(`${gone.length} round${gone.length === 1 ? '' : 's'} with no demo left: kept as ${gone.length === 1 ? 'it was' : 'they were'} (${gone.slice(0, 3).join(', ')}${gone.length > 3 ? ', …' : ''})`);
    if (names.length) {
      // (newest rounds first: rounds.json lists them so; several at once in worker threads, decodeAll; progress kept in
      // rounds.json)
      const t0 = Date.now(), P = { hash: dec.hash, total: names.length, done: 0, jobs: Math.min(jobsWanted(), names.length), since: new Date(t0).toISOString() };
      idx.reprocess = P; writeIndex(idx, dec);
      log(`decoding ${names.length} rounds again with decoder ${dec.hash}, ${P.jobs} at once`);
      const items = names.map(name => { const src = path.join(DIRS.demos, name); return { name, src, bytes: sizeOf(src) }; });
      const Q = { kind: 'again' };
      await decodeAll(dec, items, async (it, pre, err, t1) => {
        P.done++; P.jobs = Q.jobs; const el = (Date.now() - t0) / 1000, left = el / P.done * (P.total - P.done); P.left = Math.round(left);
        if (err) log('could not decode again', it.name, '-', err.message);
        else { try { await processDemo(dec, idx, it.src, it.name, { move: false, pre, t0: t1, note: `[${P.done}/${P.total} ${Math.floor(100 * P.done / P.total)}%${P.done < P.total ? ', ~' + hm(left) + ' left' : ''}, ${Q.jobs} at once]` }); changed = true; } catch (e) { log('could not write', it.name, '-', e.message); } }
        writeIndex(idx, dec, true);
      }, Q);
      if (fullDue) writeIndex(idx, dec);
      log(Q.stopped ? `decoded ${P.done} of ${P.total} rounds again in ${hm((Date.now() - t0) / 1000)}: the rest at the next run` : `decoded ${P.total} rounds again in ${hm((Date.now() - t0) / 1000)}`);
    }
    if (idx.reprocess) { const P = idx.reprocess; delete idx.reprocess; changed = true; writeProgress({ ...P, left: 0, end: new Date().toISOString() }); }   // (the tag: done)
  }
  // 3. (v186, demos.mjs) the demos that go: older than the admin page's days, over its limit (the least needed first), on
  // a nearly full disk (under BF2R_MIN_FREE_GB + 2 GB free, BF2R_RAW_AUTOCLEAN: until 2 GB more than that are free - so new
  // rounds keep coming; fetch.mjs stops downloading under BF2R_MIN_FREE_GB). Never one the admin page keeps, nor one of a
  // round made by an older decoder (decoded again from it first). Their rounds stay and open as before; the page offers
  // to open your own copy for a clip for the game.
  { const free = () => { try { const st = fs.statfsSync(DATA); return st.bavail * st.bsize; } catch (e) { return Infinity; } };
    const P = demoPolicy(DATA, opt), H = hintRounds(DATA), S = sourceList(DATA), has = r => !!r.demo && fs.existsSync(path.join(DIRS.demos, r.name));
    const short = RAW_AUTOCLEAN && MIN_FREE > 0 ? Math.max(0, MIN_FREE + 2 * 2 ** 30 - free()) : 0;
    const plan = demoPlan({ rounds: idx.rounds, policy: P, hash: dec.hash, hints: H, source: S, has, emergency: short });
    const LF = path.join(DATA, DEMOS_LAST_FILE); let last = null; try { last = JSON.parse(fs.readFileSync(LF, 'utf8')); } catch (e) {}
    if (plan.over !== !!last?.over) {   // (said once, when it starts or stops being so)
      if (plan.over) log(`the demos kept (recent ${plan.kept.recent}, with hints ${plan.kept.hinted}, on the keep list ${plan.kept.pinned}, to decode again ${plan.kept.pending}) take more than the ${P.maxGB} GB limit`);
      last = { ...(last || {}), over: plan.over }; writeJsonF(LF, last);
    }
    if (plan.remove.length) {
      const by = {}; let n = 0, bytes = 0;
      for (const x of plan.remove) {
        const r = idx.rounds.find(q => q.name === x.name); if (!r) continue;
        try { const f = path.join(DIRS.demos, r.name), b = sizeOf(f); fs.unlinkSync(f); delete r.demo; changed = true; n++; bytes += b; by[x.why] = (by[x.why] || 0) + 1; } catch (e) { log('demo not removed:', x.name, '-', e.message); }
      }
      const W = { age: `older than ${P.keepDays} days`, limit: `over the ${P.maxGB} GB limit`, disk: 'the disk nearly full' };
      log(`demos removed: ${n} (${bytes >= 2 ** 30 ? (bytes / 2 ** 30).toFixed(1) + ' GB' : Math.round(bytes / 2 ** 20) + ' MB'}; ${Object.entries(by).map(([k, v]) => `${v} ${W[k]}`).join(', ')}; ${plan.back} can be downloaded again from their page) - their rounds stay`);
      writeJsonF(LF, { at: new Date().toISOString(), n, bytes, by, back: plan.back, names: plan.remove.slice(0, 20).map(x => x.name), free: free(), over: plan.over, total: (last?.total || 0) + n, totalBytes: (last?.totalBytes || 0) + bytes });
    }
    if (short > 0 && free() < MIN_FREE) log(`disk nearly full (${(free() / 2 ** 30).toFixed(1)} GB free) and no demos left to remove: new rounds wait (BF2R_MIN_FREE_GB ${MIN_FREE / 2 ** 30})`);
    // (v186, todo 230) the rounds the decoder has changed for whose demo is gone: downloaded again by fetch.mjs while
    // their page lists them (the admin page's "download again"), decoded as a new demo would be, and their demo goes again
    const want = P.refetch ? refetchWanted({ rounds: idx.rounds, hash: dec.hash, source: S, has }) : [];
    const RF = path.join(DATA, REFETCH_FILE); let had = null; try { had = JSON.parse(fs.readFileSync(RF, 'utf8')); } catch (e) {}
    if (want.length || had?.want?.length) writeJsonF(RF, { at: new Date().toISOString(), hash: dec.hash, perRun: P.refetchPerRun, want });
    if (want.length && (!had || had.want?.length !== want.length)) log(`${want.length} round${want.length === 1 ? '' : 's'} to decode again whose demo is gone: downloaded again from their page (${P.refetchPerRun} a run)`);
  }
  try { if (demoSrcMark(idx)) changed = true; } catch (e) { log('demo sources not marked:', e.message); }   // (v202)
  if (changed || idx.moved || !idx.heat || !fs.existsSync(INDEX) || !fs.existsSync(FULL_INDEX)) writeIndex(idx, dec);
  else { try { writeShares(idx, dec); } catch (e) { log('link previews not written:', e.message); } }   // (a new domain or preview pictures after a site update; only changed files are written)
  try { writeWww(idx, dec); } catch (e) { log('pages for search engines not written:', e.message); }
}
// (v196) the analysis's files for the admins (the players' hint cards, Glitch spot) were public in data/stats until v196:
// moved to data/.admin (which the web server keeps to itself; admin.mjs hands them to a logged-in admin). Where the new
// place has them already, the old ones go to data/.admin/.old-stats (nothing removed)
function movePrivate() {
  const A = path.join(DATA, '.admin');
  for (const f of ['hints.json', 'hints', 'glitch']) {
    const from = path.join(STATS, f); if (!fs.existsSync(from)) continue;
    try {
      fs.mkdirSync(A, { recursive: true }); let to = path.join(A, f);
      if (fs.existsSync(to)) { fs.mkdirSync(path.join(A, '.old-stats'), { recursive: true }); to = path.join(A, '.old-stats', f + '-' + Date.now()); }
      fs.renameSync(from, to); log(`data/stats/${f} -> ${path.relative(DATA, to)} (the admins' now)`);
    } catch (e) { log(`data/stats/${f} not moved:`, e.message); }
  }
}
if (isMainThread) {
  movePrivate();
  process.on('SIGTERM', () => {   // (v163: systemctl stop, the service's time limit) the round list first, then out
    log('stopped: writing the round list first');
    try { if (FLUSH) FLUSH(); } catch (e) { log('the round list not written:', e.message); }
    try { fs.unlinkSync(NOW_FILE); } catch (e) {}
    process.exit(143);
  });
  main().catch(e => { log('error:', e.stack || e.message); process.exit(1); });
}
else {   // a decoding worker (Pool): the page's decoder, one demo at a time
  const dec = loadDecoder();
  parentPort.on('message', async ({ src, name }) => {
    try { if (dec.hash !== workerData.hash) throw new Error('the site changed while decoding (decoder ' + dec.hash + ')'); parentPort.postMessage({ ok: true, r: await decodeWork(dec, src, name) }); }
    catch (e) { parentPort.postMessage({ ok: false, err: e.message }); }
  });
}
