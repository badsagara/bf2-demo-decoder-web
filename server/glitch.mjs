// BF2 Round Replay - (v185, todo 185) "Glitch spot": a soldier who stays a while where, over every round of the map, no
// one else has stood - while other players have stood right there, above or below him (he is under a floor, inside a
// rock or a wall, on a roof no one climbs). Glitching into the textures ([Glitch] Gulf of Oman, bunnyhop onto walls).
// A remote hill no one else goes to is no hint: no one stood over or under him either.
//
// From the decoded rounds (data/rounds/*.bfr; no browser needed), run by analyze.mjs (--auto, --glitch):
//   - a grid of the places soldiers stood, alive on foot, every 0.5 s: cells GL_CELL m across, GL_BAND m high; each
//     cell keeps who stood in it (the stats' nicks, up to 4 of them; then only that it was more);
//   - each soldier's stays: GL_T s or more within GL_R m (and GL_DH m up or down) - the only places a hint can be at;
//   - once a map has GL_ROUNDS rounds in the grid, a stay is a hint when no one but him stood within a cell of it (the
//     27 cells round each of its cells), and GL_K or more other players stood in the same columns 5-40 m above or below.
// Files: analysis/glitch/<map>.json (the map's grid and rounds done), analysis/glitch/stays.json (the stays not yet
// ruled out: a stay once someone else stood there is dropped for good), data/stats/glitch/<map>.json (the page's:
// { gv, map, rounds, at, hits: { round: [[player id, name, t0, t1, x, y, h, others, up, down]] } }).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const GLITCH_V = 1;
const GL_CELL = 2, GL_BAND = 2.5, GL_T = 20, GL_R = 3, GL_DH = 2, GL_ROUNDS = 30, GL_K = 3, GL_MAXB = 16, GL_START = 10, GL_IDS = 4;
const X0 = 2048, B0 = 64;
const keyOf = (x, y, h) => {
  const gx = Math.floor(x / GL_CELL) + X0, gy = Math.floor(y / GL_CELL) + X0, b = Math.floor(h / GL_BAND) + B0;
  if (gx < 0 || gy < 0 || gx > 4095 || gy > 4095 || b < 0 || b > 255) return -1;
  return (gx * 4096 + gy) * 256 + b;
};
const unkey = k => [Math.floor(k / (4096 * 256)), Math.floor(k / 256) % 4096, k % 256];
const mkKey = (gx, gy, b) => (gx * 4096 + gy) * 256 + b;

// the decoded round file (as ingest.mjs's bfrRead)
export function bfrRead(file) {
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

// one round: { cells: Map nick -> Set of keys, stays: [[id, name, nick, t0, t1, x, y, h, keys]] }
export function scanRound(tl, nickOf) {
  const C = tl.cols || {}, T = C.times, n = C.n, { X, Y, HH, L, VT, DN } = C, cells = new Map(), stays = [];
  if (!T || !n || !X || !Y || !HH || !L) return { cells, stays };
  const F = T.length, t00 = (T[0] || 0) + GL_START;
  tl.players.forEach((p, i) => {
    if (p.vehicle) return;
    const name = String(p.name || '').trim(), nick = nickOf(name); if (!nick || /^Player \d+$/.test(nick)) return;
    let S = cells.get(nick); if (!S) cells.set(nick, S = new Set());
    let st = null;
    const close = () => { if (st && st.t1 - st.t0 >= GL_T) stays.push([p.id, name, nick, +st.t0.toFixed(1), +st.t1.toFixed(1), +st.x.toFixed(1), +st.y.toFixed(1), +st.h.toFixed(1), [...st.k]]); st = null; };
    for (let k = 0; k < F; k += 5) {
      const e = k * n + i, x = X[e], y = Y[e], h = HH[e];
      if (!L[e] || (VT && VT[e]) || (DN && DN[e]) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(h)) { close(); continue; }
      const key = keyOf(x, y, h); if (key < 0) { close(); continue; }
      S.add(key);
      if (T[k] < t00) continue;
      if (st && Math.hypot(x - st.x, y - st.y) <= GL_R && Math.abs(h - st.h) <= GL_DH) { st.t1 = T[k]; st.k.add(key); }
      else { close(); st = { t0: T[k], t1: T[k], x, y, h, k: new Set([key]) }; }
    }
    close();
  });
  return { cells, stays };
}

// a map's grid: { v, map, rounds: [names], nicks: [nick], cells: Map key -> [nick ids] (up to GL_IDS) | -1 (more) }
function gridLoad(f, map) {
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (d.v === GLITCH_V) return { ...d, cells: new Map(d.cells), nickIdx: new Map(d.nicks.map((k, i) => [k, i])), roundSet: new Set(d.rounds) };
  } catch (e) { /* none yet */ }
  return { v: GLITCH_V, map, rounds: [], nicks: [], cells: new Map(), nickIdx: new Map(), roundSet: new Set() };
}
function gridSave(f, G) {
  const t = JSON.stringify({ v: G.v, map: G.map, rounds: G.rounds, nicks: G.nicks, cells: [...G.cells] });
  fs.writeFileSync(f + '.tmp', t); fs.renameSync(f + '.tmp', f);
}
function gridAdd(G, name, cells) {
  for (const [nick, S] of cells) {
    let id = G.nickIdx.get(nick); if (id === undefined) { id = G.nicks.length; G.nicks.push(nick); G.nickIdx.set(nick, id); }
    for (const k of S) {
      const v = G.cells.get(k);
      if (v === undefined) G.cells.set(k, [id]);
      else if (v !== -1 && !v.includes(id)) { if (v.length >= GL_IDS) G.cells.set(k, -1); else v.push(id); }
    }
  }
  G.rounds.push(name); G.roundSet.add(name);
}
// someone other than nick id `me` in cell k: 0 / 1 (or more: -1 counts as GL_IDS others)
const othersIn = (G, k, me) => { const v = G.cells.get(k); if (v === undefined) return 0; if (v === -1) return GL_IDS; return v.length - (v.includes(me) ? 1 : 0); };

// a stay against the grid: null (someone else stood there: never a hint), false (not a hint now), or the hint's figures
function judge(G, stay) {
  const me = G.nickIdx.get(stay[2]) ?? -2, keys = stay[8];
  const near = new Set(), cols = new Map();
  for (const k of keys) {
    const [gx, gy, b] = unkey(k);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (let db = -1; db <= 1; db++) near.add(mkKey(gx + dx, gy + dy, b + db));
      const c = mkKey(gx + dx, gy + dy, 0), o = cols.get(c);
      if (!o) cols.set(c, [b, b]); else { if (b < o[0]) o[0] = b; if (b > o[1]) o[1] = b; }
    }
  }
  for (const k of near) if (othersIn(G, k, me) > 0) return null;
  const ids = new Set(); let more = 0, up = null, down = null;
  for (const [c, [lo, hi]] of cols) {
    for (let b = Math.max(0, lo - GL_MAXB); b <= Math.min(255, hi + GL_MAXB); b++) {
      if (b >= lo - 1 && b <= hi + 1) continue;
      const v = G.cells.get(c + b); if (v === undefined) continue;
      if (v === -1) more = GL_IDS; else for (const id of v) if (id !== me) ids.add(id);
      const dz = (b < lo ? b - lo : b - hi) * GL_BAND;
      if (dz > 0 && (up === null || dz < up)) up = dz; if (dz < 0 && (down === null || -dz < down)) down = -dz;
    }
  }
  const others = Math.max(ids.size, more);
  return others >= GL_K ? { others, up, down } : false;
}

// the whole step: new rounds into the grids (at most `budget` of them), then the hints of every map
export function aggGlitch({ DATA, OUT, rounds, nickOf, budget = 150, minRounds = GL_ROUNDS, log = console.log }) {
  const GD = path.join(OUT, 'glitch'), SD = path.join(DATA, 'stats', 'glitch'); fs.mkdirSync(GD, { recursive: true }); fs.mkdirSync(SD, { recursive: true });
  const SF = path.join(GD, 'stays.json'); let stays = {}; try { const d = JSON.parse(fs.readFileSync(SF, 'utf8')); if (d.v === GLITCH_V) stays = d.rounds || {}; } catch (e) {}
  const mapOf = r => String(r.sum?.map || '').toLowerCase(), byMap = new Map();
  for (const r of rounds) { const m = mapOf(r); if (!m || !r.bfr) continue; if (!byMap.has(m)) byMap.set(m, []); byMap.get(m).push(r); }
  const gfile = m => path.join(GD, m.replace(/[^a-z0-9_-]/g, '_') + '.json'), grids = new Map(), G = m => { if (!grids.has(m)) grids.set(m, gridLoad(gfile(m), m)); return grids.get(m); };
  // new rounds: the maps with the fewest rounds done first (they reach GL_ROUNDS sooner), the newest rounds first
  const todo = [];
  for (const [m, L] of byMap) { const g = G(m); for (const r of L) if (!g.roundSet.has(r.name)) todo.push([g.rounds.length, String(r.sum?.date || ''), m, r]); }
  todo.sort((a, b) => a[0] - b[0] || b[1].localeCompare(a[1]));
  let done = 0, failed = 0; const touched = new Set(), t0 = Date.now();
  for (const [, , m, r] of todo.slice(0, budget)) {
    let tl; try { tl = bfrRead(path.join(DATA, r.bfr)).tl; } catch (e) { failed++; continue; }
    const s = scanRound(tl, nickOf); gridAdd(G(m), r.name, s.cells); touched.add(m); done++;
    if (s.stays.length) stays[r.name] = { map: m, s: s.stays };
  }
  for (const m of touched) gridSave(gfile(m), G(m));
  // the hints: every stay not ruled out, against its map's grid now
  const listed = new Set(rounds.map(r => r.name)), hits = new Map(); let left = 0, dropped = 0;
  for (const [name, o] of Object.entries(stays)) {
    if (!listed.has(name)) { delete stays[name]; continue; }
    const g = G(o.map), keep = [];
    for (const st of o.s) {
      const j = judge(g, st); if (j === null) { dropped++; continue; }
      keep.push(st); if (!j || g.rounds.length < minRounds) continue;
      if (!hits.has(o.map)) hits.set(o.map, {}); const H = hits.get(o.map);
      (H[name] ||= []).push([st[0], st[1], st[3], st[4], st[5], st[6], st[7], j.others, j.up, j.down]);
    }
    if (keep.length) { o.s = keep; left += keep.length; } else delete stays[name];
  }
  fs.writeFileSync(SF + '.tmp', JSON.stringify({ v: GLITCH_V, rounds: stays })); fs.renameSync(SF + '.tmp', SF);
  const keepF = new Set(); let nh = 0;
  for (const [m, H] of hits) {
    const f = m.replace(/[^a-z0-9_-]/g, '_') + '.json'; keepF.add(f); nh += Object.values(H).reduce((s, L) => s + L.length, 0);
    const t = JSON.stringify({ gv: GLITCH_V, map: m, rounds: G(m).rounds.length, hits: H }); let old = null; try { old = fs.readFileSync(path.join(SD, f), 'utf8'); } catch (e) {}
    if (old !== t) { fs.writeFileSync(path.join(SD, f + '.tmp'), t); fs.renameSync(path.join(SD, f + '.tmp'), path.join(SD, f)); }
  }
  for (const f of fs.readdirSync(SD)) if (f.endsWith('.json') && !keepF.has(f)) { try { fs.unlinkSync(path.join(SD, f)); } catch (e) {} }
  const ready = [...byMap.keys()].filter(m => G(m).rounds.length >= minRounds).length;
  // (v192) for the admin page: how far the grids are (without reading them: they are megabytes each)
  try { const sm = { at: new Date().toISOString(), v: GLITCH_V, minRounds, maps: Object.fromEntries([...byMap.keys()].sort().map(m => [m, G(m).rounds.length])), left: todo.length - done, stays: left, hints: nh };
    fs.writeFileSync(path.join(GD, 'summary.json.tmp'), JSON.stringify(sm)); fs.renameSync(path.join(GD, 'summary.json.tmp'), path.join(GD, 'summary.json')); } catch (e) {}
  log(`glitch spots: ${done} new rounds into the grids${failed ? ` (${failed} unreadable)` : ''}${todo.length > done ? `, ${todo.length - done} to go` : ''} (${((Date.now() - t0) / 1000).toFixed(0)} s); ${ready} of ${byMap.size} maps with ${minRounds}+ rounds; ${left} stays left to check (${dropped} ruled out now), ${nh} hints`);
  return { done, left: todo.length - done, hints: nh };
}
