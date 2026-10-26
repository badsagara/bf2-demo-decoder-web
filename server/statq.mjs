// BF2 Round Replay - (v244, Sagara: "a constructor for the admins: they pick the person, the parameter, how to judge it
// and the period - and get the statistics") statq: the analysed rounds - the background analysis's files,
// analysis/rounds/<round>.json.gz (the page's analysisDump) - as columns in memory, and the questions put to them.
//
// Kept of each round: every kill (K: distance, height, where it hit, the killer's aim, reaction, the sight line, ... as
// the analysis has them), each soldier's round (P: kills, deaths, spots, time alive, ...) and his presses of the trigger
// per weapon (Q, rounds analysed since v214: presses, seconds held, bullets as the magazine's count says). ~90 bytes a
// kill: 900 000 kills ~ 80 MB. Made at the first question (some seconds), in a worker thread: the admin server keeps
// answering, and the reading's leftovers (the files' JSON) go with the worker - only the columns come over. The files
// the analysis writes or rewrites later are added here (a rewritten round's old rows are left out), the whole made
// again once a quarter of it is old; let go after 30 minutes without a question.
//
// A question: whose (a player's nick, as the site's statistics merge names: the page's nickOf), what (his kills, the
// kills of him, his rounds, his presses), which parameter and how to judge it (count, sum, mean, median, 10th / 90th
// percentile, min, max, share of those that ..., per round), only where (up to 4 conditions on other parameters), the
// weapon (one), the days, a server, a map. The answer: his value, everyone else's together, where he stands among the
// players with enough of them (and the highest), the odds of his share at everyone else's, the spread of the values
// (his against everyone's), week by week, and his events (each with its round and second - to watch).
// Bots ("Player N") are left out. A server admin's questions see only his servers' rounds.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

export const STATQ_V = 1;
const IDLE_MS = 30 * 60e3, STALE_MS = 3 * 60e3, MAX_EVENTS = 300, MAX_WEEKS = 60;
const BOT = /^Player \d+$/;
const CAUSE = ['small', 'veh', 'expl', 'at', 'emp', 'none'], HIT = ['head', 'body', 'limb'], ENG = ['first', 'even', 'second', 'ambush', 'blind'], STANCE = [0, 1, 2];
const CAUSE_N = ['small arms', 'a vehicle', 'an explosive', 'anti-tank', 'an emplacement', 'other'], HIT_N = ['head', 'body', 'arms & legs'],
  ENG_N = ['he saw him first', 'both at once', 'the victim saw him first', 'an ambush (never seen)', 'blind (he never saw him)'], STANCE_N = ['standing', 'crouching', 'lying'], YES_N = ['no', 'yes'];

// ---------- columns ----------
const K_SPEC = [['r', Int32Array], ['t', Float32Array], ['kn', Int32Array], ['vn', Int32Array], ['w', Int16Array], ['cause', Int8Array], ['hit', Int8Array],
  ['tk', Int8Array], ['kveh', Int8Array], ['vveh', Int8Array], ['d', Float32Array], ['dz', Float32Array], ['kst', Int8Array], ['vst', Int8Array],
  ['kv', Float32Array], ['vv', Float32Array], ['ping', Float32Array], ['err', Float32Array], ['err5', Float32Array], ['brg', Float32Array],
  ['react', Float32Array], ['eng', Int8Array], ['los', Float32Array], ['press', Float32Array], ['fog', Float32Array], ['smoke', Int8Array],
  ['perr', Float32Array], ['hp', Float32Array]];
const P_SPEC = [['r', Int32Array], ['n', Int32Array], ['k', Int16Array], ['dd', Int16Array], ['tk', Int16Array], ['small', Int16Array], ['hsn', Int16Array],
  ['hsh', Int16Array], ['spots', Int16Array], ['alive', Float32Array], ['foot', Float32Array], ['ping', Float32Array]];
const Q_SPEC = [['r', Int32Array], ['n', Int32Array], ['w', Int16Array], ['p', Int32Array], ['h', Float32Array], ['b', Float32Array], ['bn', Int32Array], ['alive', Float32Array]];
function table(spec, from) {
  const T = { n: 0, cap: 1 << 14, c: {}, spec };
  if (from) { T.n = from.n; T.cap = from.cap; T.c = from.c; }   // (the columns from the worker)
  else for (const [k, C] of spec) T.c[k] = new C(T.cap);
  T.push = vals => {
    if (T.n === T.cap) { T.cap = T.cap < (1 << 20) ? T.cap * 2 : Math.ceil(T.cap * 1.25); for (const [k, C] of spec) { const a = new C(T.cap); a.set(T.c[k]); T.c[k] = a; } }
    for (let j = 0; j < spec.length; j++) T.c[spec[j][0]][T.n] = vals[j];
    T.n++;
  };
  // (the room past the rows, after the whole is made: a little, for the rounds still to come)
  T.trim = () => { const cap = Math.max(1024, Math.ceil(T.n * 1.05)); if (cap >= T.cap) return; T.cap = cap; for (const [k, C] of spec) T.c[k] = T.c[k].slice(0, cap); };
  return T;
}
const num = v => v == null || v === '' || !Number.isFinite(+v) ? NaN : +v;
const cat = (L, v) => L.indexOf(v);
const intOr = (v, d = -1) => v == null || !Number.isFinite(+v) ? d : +v;
const dayOf = s => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(s || '')); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : -1; };
const dayStr = d => new Date(d * 864e5).toISOString().slice(0, 10);

// ---------- the store ----------
function newStore() {
  return { at: Date.now(), files: new Map(), rounds: [], dead: 0, nicks: new Map(), nickKey: [], nickName: [], weapons: new Map(), wName: [],
    servers: new Map(), sName: [], maps: new Map(), mName: [], K: table(K_SPEC), P: table(P_SPEC), Q: table(Q_SPEC), qRounds: 0, dayMin: Infinity, dayMax: -Infinity };
}
const idOf = (M, L, v) => { let k = M.get(v); if (k === undefined) { k = L.length; M.set(v, k); L.push(v); } return k; };
function addRound(S, j, nickOf) {
  const cK = j.cols?.K || [], cP = j.cols?.P || [], cQ = j.cols?.Q || [], ix = (c, k) => c.indexOf(k);
  const meta = { ...(j.meta || {}), ...(j.round?.sum || {}) }, name = j.round?.name || j.name, day = dayOf(meta.date);   // (the server's name: as the rounds' list has it)
  if (!name || day < 0) return -1;
  const r = S.rounds.length;
  S.rounds.push({ name, day, s: idOf(S.servers, S.sName, String(meta.server || '')), m: idOf(S.maps, S.mName, String(meta.map || j.map || '').toLowerCase()), date: String(meta.date || '') });
  S.dayMin = Math.min(S.dayMin, day); S.dayMax = Math.max(S.dayMax, day);
  // soldiers: his index in the round -> his nick (bots: none)
  const pI = ix(cP, 'i'), pName = ix(cP, 'name'), who = new Map(), rn = S.rounds[r].nm = new Map();   // (nm: each one's name in this round - the links follow him by it)
  for (const p of j.P || []) {
    const nm = String(p[pName] ?? '').trim(), nk = nickOf(nm); if (!nm || BOT.test(nk)) continue;
    let id = S.nicks.get(nk); if (id === undefined) { id = S.nickName.length; S.nicks.set(nk, id); S.nickKey.push(nk); S.nickName.push(nm); }
    S.nickName[id] = nm; who.set(p[pI], id); if (!rn.has(id)) rn.set(id, nm);
  }
  const P = S.P, g = k => ix(cP, k);
  const alive = new Map();
  for (const p of j.P || []) {
    const id = who.get(p[pI]); if (id === undefined) continue;
    const al = num(p[g('aliveS')]); alive.set(id, (alive.get(id) || 0) + (Number.isFinite(al) ? al : 0));
    P.push([r, id, intOr(p[g('kills')], 0), intOr(p[g('deaths')], 0), intOr(p[g('tk')], 0), intOr(p[g('small')], 0), intOr(p[g('hsN')], 0), intOr(p[g('hsHead')], 0),
      intOr(p[g('spots')], 0), al, num(p[g('footM')]), num(p[g('pingMed')])]);
  }
  // kills
  const k = K => ix(cK, K), kT = k('t'), kK = k('killer'), kV = k('victim'), kW = k('weapon'), kC = k('cause'), kH = k('hit'), kTk = k('tk'), kKv = k('kveh'), kVv = k('vveh'),
    kD = k('d'), kDz = k('dz'), kKs = k('kst'), kVs = k('vst'), kKsp = k('kv'), kVsp = k('vv'), kP = k('ping'), kE = k('err'), kB = k('brgRate'), kR = k('react'),
    kEn = k('eng'), kLk = k('losK'), kLx = k('losX'), kPr = k('press'), kF = k('fog'), kSm = k('smoke'), kPe = k('pitchErr'), kHp = k('hp');
  const at = (row, c) => c < 0 ? null : row[c];
  for (const e of j.K || []) {
    const kn = who.has(e[kK]) ? who.get(e[kK]) : -1, vn = who.has(e[kV]) ? who.get(e[kV]) : -1;
    if (kn < 0 && vn < 0) continue;
    const wn = String(at(e, kW) || ''), w = wn ? idOf(S.weapons, S.wName, wn) : -1;
    const er = at(e, kE), hp = at(e, kHp), lx = at(e, kLx), lk = at(e, kLk), lv = lx != null ? lx : lk;
    S.K.push([r, num(at(e, kT)), kn, vn, w, cat(CAUSE, at(e, kC)), cat(HIT, at(e, kH)), intOr(at(e, kTk)) > 0 ? 1 : 0, at(e, kKv) ? 1 : 0, at(e, kVv) ? 1 : 0,
      num(at(e, kD)), num(at(e, kDz)), intOr(at(e, kKs)), intOr(at(e, kVs)), num(at(e, kKsp)), num(at(e, kVsp)), num(at(e, kP)),
      Array.isArray(er) && er.length ? num(er[er.length - 1]) : NaN, Array.isArray(er) && er.length >= 6 ? num(er[er.length - 6]) : NaN, num(at(e, kB)), num(at(e, kR)),
      cat(ENG, at(e, kEn)), lv == null || !Number.isFinite(+lv) ? NaN : +lv >= 100 ? (+lv - 100) / 10 : +lv / 10, num(at(e, kPr)), num(at(e, kF)), intOr(at(e, kSm)),
      num(at(e, kPe)), Array.isArray(hp) && hp.length ? num(hp[hp.length - 1]) : NaN]);
  }
  // presses of the trigger, on foot, per soldier and weapon; bullets: the magazine's count between his presses of it
  if (j.Q && cQ.length) {
    S.qRounds++;
    const q = K => ix(cQ, K), qP = q('player'), qT = q('t'), qH = q('hold'), qBt = q('button'), qA = q('ammo'), qW = q('weapon'), qF = q('foot'), G = new Map();
    for (const e of j.Q) {
      if (e[qBt] !== 0 || e[qF] !== 1) continue; const id = who.get(e[qP]); if (id === undefined || !e[qW]) continue;
      const key = id + '|' + e[qW]; let o = G.get(key); if (!o) G.set(key, o = { id, w: idOf(S.weapons, S.wName, String(e[qW])), L: [] });
      o.L.push([+e[qT], +e[qH] || 0, e[qA] == null ? null : +e[qA]]);
    }
    for (const o of G.values()) {
      o.L.sort((a, b) => a[0] - b[0]); let h = 0, b = 0, bn = 0;
      for (let i = 0; i < o.L.length; i++) { const [t, hold, am] = o.L[i]; h += hold; const nx = o.L[i + 1]; if (nx && am != null && nx[2] != null && nx[0] - t < 20 && am > nx[2]) { b += am - nx[2]; bn++; } }
      S.Q.push([r, o.id, o.w, o.L.length, h, bn ? b : NaN, bn, alive.get(o.id) ?? NaN]);
    }
  }
  return r;
}
const pause = () => new Promise(ok => setImmediate(ok));
const listDir = dir => { try { return fs.readdirSync(dir).filter(f => f.endsWith('.json.gz')); } catch (e) { return null; } };
const mtOf = p => { try { return fs.statSync(p).mtimeMs; } catch (e) { return 0; } };
// read these files into S, a few at a time (~40 ms, then the server's other work)
async function addFiles(S, dir, names, nickOf) {
  let t = Date.now(), n = 0, bad = 0;
  for (const f of names) {
    const p = path.join(dir, f), mt = mtOf(p); let r = -1;
    try { r = addRound(S, JSON.parse(zlib.gunzipSync(fs.readFileSync(p))), nickOf); n++; } catch (e) { bad++; }
    S.files.set(f, { mt, r });
    if (Date.now() - t > 40) { await pause(); t = Date.now(); }
  }
  return { n, bad };
}
async function build(dir, nickOf, log) {
  const S = newStore(), t0 = Date.now(), names = (listDir(dir) || []).sort();
  const { n, bad } = await addFiles(S, dir, names, nickOf);
  S.K.trim(); S.P.trim(); S.Q.trim();
  S.ms = Date.now() - t0; S.at = Date.now();
  if (log) log(`statq: ${n} rounds, ${S.K.n} kills, ${S.P.n} soldier-rounds, ${S.Q.n} rows of presses in ${S.ms} ms${bad ? `, ${bad} unreadable` : ''}`);
  return S;
}
// the store across threads: its columns' buffers moved, the rest copied
function storeOut(S) {
  const tb = T => ({ n: T.n, cap: T.cap, c: T.c }), bufs = [];
  for (const T of [S.K, S.P, S.Q]) for (const k in T.c) bufs.push(T.c[k].buffer);
  return [{ ...S, K: tb(S.K), P: tb(S.P), Q: tb(S.Q) }, bufs];
}
function storeIn(o) { return { ...o, K: table(K_SPEC, o.K), P: table(P_SPEC, o.P), Q: table(Q_SPEC, o.Q) }; }
const nickFrom = src => { try { const f = new Function(src)(); if (typeof f === 'function') return f; } catch (e) {} return name => { const t = String(name || '').trim(); return BOT.test(t) ? t : t.split(/\s+/).pop(); }; };
if (!isMainThread && workerData && workerData.statqBuild) {
  const lines = [];
  build(workerData.dir, nickFrom(workerData.nickSrc), (...a) => lines.push(a.join(' '))).then(S => { const [o, bufs] = storeOut(S); parentPort.postMessage({ S: o, log: lines }, bufs); }, e => parentPort.postMessage({ err: e.message }));
}
function buildAside(dir, nickSrc, log) {
  return new Promise((ok, no) => {
    let w; try { w = new Worker(new URL(import.meta.url), { workerData: { statqBuild: true, dir, nickSrc } }); } catch (e) { return build(dir, nickFrom(nickSrc), log).then(ok, no); }   // (no workers: here)
    let done = false;
    w.once('message', m => { done = true; if (m.err) return no(new Error(m.err)); for (const l of m.log || []) if (log) log(l); ok(storeIn(m.S)); });
    w.once('error', e => { if (!done) { done = true; no(e); } });
    w.once('exit', c => { if (!done) { done = true; no(new Error('the worker stopped (' + c + ')')); } });
  });
}
// what the analysis has written since: new or rewritten files (to add; a rewritten round's old rows: left out) and gone ones
function changes(S, dir) {
  const names = listDir(dir); if (!names) return null;
  const add = [], old = [], here = new Set(names);
  for (const f of names) { const o = S.files.get(f), mt = mtOf(path.join(dir, f)); if (!o) add.push(f); else if (o.mt !== mt) { add.push(f); old.push(f); } }
  for (const f of S.files.keys()) if (!here.has(f)) old.push(f);
  return { add: add.sort(), old };
}
function letGo(S, files) { for (const f of files) { const o = S.files.get(f); if (o && o.r >= 0 && !S.rounds[o.r].dead) { S.rounds[o.r].dead = 1; S.dead++; } S.files.delete(f); } }
// nickSrc: code returning the page's nickOf (the worker makes its own of it)
export function statqKeeper({ dir, nickSrc, log, staleMs = STALE_MS }) {
  let S = null, used = 0, busy = null, checkedAt = 0; const nickOf = nickFrom(nickSrc);
  setInterval(() => { if (S && !busy && Date.now() - used > IDLE_MS) { S = null; if (log) log('statq: let go (unused)'); } }, 60e3).unref?.();
  const make = () => busy || (busy = buildAside(dir, nickSrc, log).then(x => { S = x; checkedAt = Date.now(); }, e => { if (log) log('statq:', e.message); }).finally(() => { busy = null; }));
  const refresh = () => {
    const c = changes(S, dir); if (!c || !c.add.length && !c.old.length) return;
    if (S.dead + c.old.length > S.rounds.length / 4) { make(); return; }   // (a quarter old: the whole again; the old one answers meanwhile)
    const T = S; busy = (async () => { letGo(T, c.old); const { n } = await addFiles(T, dir, c.add, nickOf); T.at = Date.now(); if (log) log(`statq: ${n} rounds added, ${c.old.length} let go`); })()
      .catch(e => { if (log) log('statq:', e.message); }).finally(() => { busy = null; });
  };
  return {
    async get() {
      used = Date.now();
      if (!S) { await make(); return S || newStore(); }
      if (!busy && Date.now() - checkedAt > staleMs) { checkedAt = Date.now(); refresh(); }   // (in the background: the rows so far answer meanwhile)
      return S;
    },
    state: () => S ? { rounds: S.rounds.length - S.dead, kills: S.K.n, at: new Date(S.at).toISOString(), ms: S.ms, busy: !!busy } : { busy: !!busy },
  };
}

// ---------- what may be asked ----------
// [key, label, type: num | cat | bool, unit, tip, categories]; get(S, row) -> number (NaN unknown) / category index (-1)
const KM = [
  ['all', 'Every one', 'bool', '', 'each kill counts: count it, or per round', null, (S, i) => 1],
  ['d', 'Distance', 'num', 'm', 'killer to victim', null, (S, i) => S.K.c.d[i]],
  ['dz', 'Killer above the victim', 'num', 'm', 'height: the killer over the victim (below: negative)', null, (S, i) => S.K.c.dz[i]],
  ['hit', 'Where the killing shot hit', 'cat', '', 'from the demo (bullets only; explosions, run-overs: none)', HIT_N, (S, i) => S.K.c.hit[i]],
  ['react', 'Reaction: first in sight to the kill', 'num', 's', 'small arms on foot', null, (S, i) => S.K.c.react[i]],
  ['eng', 'Who saw whom first', 'cat', '', 'small arms on foot', ENG_N, (S, i) => S.K.c.eng[i]],
  ['err', 'Killer\'s aim off the victim at the kill', 'num', '°', 'across, small arms on foot', null, (S, i) => S.K.c.err[i]],
  ['err5', 'Killer\'s aim off the victim 0.5 s before', 'num', '°', 'across, small arms on foot', null, (S, i) => S.K.c.err5[i]],
  ['perr', 'Killer\'s aim height off the victim\'s chest', 'num', '°', 'up positive; small arms on foot', null, (S, i) => S.K.c.perr[i]],
  ['press', 'From the fire press to the kill', 'num', 's', 'the press that fired it', null, (S, i) => S.K.c.press[i]],
  ['los', 'No clear sight before the kill', 'num', 's', '0: clear at the kill; how long back to a clear line (the exact shapes when known)', null, (S, i) => S.K.c.los[i]],
  ['fog', 'Distance against the map\'s fog limit', 'num', '×', '1 = at the fog limit', null, (S, i) => S.K.c.fog[i]],
  ['brg', 'Victim crossing the killer\'s view', 'num', '°/s', 'how fast the bearing to him turned', null, (S, i) => S.K.c.brg[i]],
  ['kv', 'Killer\'s speed', 'num', 'm/s', 'over the ground', null, (S, i) => S.K.c.kv[i]],
  ['vv', 'Victim\'s speed', 'num', 'm/s', 'over the ground', null, (S, i) => S.K.c.vv[i]],
  ['kst', 'Killer\'s stance', 'cat', '', '', STANCE_N, (S, i) => S.K.c.kst[i]],
  ['vst', 'Victim\'s stance', 'cat', '', '', STANCE_N, (S, i) => S.K.c.vst[i]],
  ['ping', 'Killer\'s ping', 'num', 'ms', 'from the scoreboard', null, (S, i) => S.K.c.ping[i]],
  ['hp', 'Victim\'s health 0.1 s before', 'num', '%', 'rounds analysed since v214', null, (S, i) => S.K.c.hp[i]],
  ['smoke', 'Through smoke', 'bool', '', 'small arms on foot', YES_N, (S, i) => S.K.c.smoke[i]],
  ['tk', 'A team kill', 'bool', '', '', YES_N, (S, i) => S.K.c.tk[i]],
  ['kveh', 'Killer in a vehicle', 'bool', '', '', YES_N, (S, i) => S.K.c.kveh[i]],
  ['vveh', 'Victim in a vehicle', 'bool', '', '', YES_N, (S, i) => S.K.c.vveh[i]],
  ['cause', 'Killed by', 'cat', '', 'what kind of weapon', CAUSE_N, (S, i) => S.K.c.cause[i]],
];
const ratio = (a, b) => b > 0 ? a / b : NaN;
const PM = [
  ['all', 'Every round', 'bool', '', 'each round counts', null, (S, i) => 1],
  ['k', 'Kills', 'num', '', 'in the round', null, (S, i) => S.P.c.k[i]],
  ['dd', 'Deaths', 'num', '', 'in the round', null, (S, i) => S.P.c.dd[i]],
  ['kd', 'Kills per death', 'num', '', 'the round\'s kills / its deaths (no deaths: its kills)', null, (S, i) => S.P.c.k[i] / Math.max(1, S.P.c.dd[i])],
  ['tk', 'Team kills', 'num', '', '', null, (S, i) => S.P.c.tk[i]],
  ['small', 'Small-arms kills', 'num', '', '', null, (S, i) => S.P.c.small[i]],
  ['hsh', 'Headshot kills', 'num', '', 'kills with the hit known, to the head', null, (S, i) => S.P.c.hsh[i]],
  ['hsr', 'Headshot share', 'num', '', 'of his kills with the hit known, in the round', null, (S, i) => ratio(S.P.c.hsh[i], S.P.c.hsn[i])],
  ['spots', 'Spots', 'num', '', '', null, (S, i) => S.P.c.spots[i]],
  ['alive', 'Time alive', 'num', 'min', '', null, (S, i) => S.P.c.alive[i] / 60],
  ['kpm', 'Kills per minute alive', 'num', '', '', null, (S, i) => ratio(S.P.c.k[i], S.P.c.alive[i] / 60)],
  ['foot', 'Distance on foot', 'num', 'km', '', null, (S, i) => S.P.c.foot[i] / 1000],
  ['ping', 'Ping (the round\'s middle)', 'num', 'ms', '', null, (S, i) => S.P.c.ping[i]],
];
const QM = [
  ['p', 'Presses of the trigger', 'num', '', 'in a round, with this weapon (on foot)', null, (S, i) => S.Q.c.p[i]],
  ['h', 'Seconds the trigger was held', 'num', 's', 'in a round', null, (S, i) => S.Q.c.h[i]],
  ['hp', 'Seconds held per press', 'num', 's', '', null, (S, i) => ratio(S.Q.c.h[i], S.Q.c.p[i])],
  ['b', 'Bullets (from the magazine\'s count)', 'num', '', 'an estimate: the magazine\'s count dropping between two presses of the same weapon under 20 s apart - known for some of the presses only (about a third)', null, (S, i) => S.Q.c.b[i]],
  ['bp', 'Bullets per press', 'num', '', 'an estimate, as above', null, (S, i) => ratio(S.Q.c.b[i], S.Q.c.bn[i])],
  ['pm', 'Presses per minute alive', 'num', '', '', null, (S, i) => ratio(S.Q.c.p[i], S.Q.c.alive[i] / 60)],
];
const SIDES = {
  kills: { label: 'his kills', T: 'K', grp: 'kn', other: 'vn', M: KM, weapon: true },
  deaths: { label: 'the kills of him', T: 'K', grp: 'vn', other: 'kn', M: KM, weapon: true },
  rounds: { label: 'his rounds', T: 'P', grp: 'n', M: PM, weapon: false },
  presses: { label: 'his presses of the trigger (per round and weapon)', T: 'Q', grp: 'n', M: QM, weapon: true },
};
const AGGS = [['count', 'how many'], ['perRound', 'how many per round'], ['share', 'the share that …'], ['mean', 'the average'], ['median', 'the middle (median)'],
  ['p10', 'the low end (10th percentile)'], ['p90', 'the high end (90th percentile)'], ['min', 'the smallest'], ['max', 'the largest'], ['sum', 'the sum']];
const OPS = ['=', '≠', '<', '≤', '>', '≥'];
export function statqCatalog() {
  const mOut = M => M.map(([k, n, t, u, tip, cats]) => ({ k, n, t, u, tip, cats }));
  return { v: STATQ_V, sides: Object.entries(SIDES).map(([k, s]) => ({ k, n: s.label, weapon: s.weapon, M: mOut(s.M) })), aggs: AGGS.map(([k, n]) => ({ k, n })), ops: OPS };
}

// ---------- the answer ----------
// (an unknown value - NaN, or -1 for a category - is let go before it is tested: known())
const test = (op, v, x) => {
  switch (op) { case '=': return v === x; case '≠': return v !== x; case '<': return v < x; case '≤': return v <= x; case '>': return v > x; case '≥': return v >= x; default: return false; }
};
const numQ = v => v == null || String(v).trim() === '' ? NaN : +v;   // (an empty value: none, not 0)
const known = (t, v) => t === 'num' ? Number.isFinite(v) : v >= 0;
function quant(sorted, p) { if (!sorted.length) return NaN; const x = (sorted.length - 1) * p, a = Math.floor(x), b = Math.ceil(x); return sorted[a] + (sorted[b] - sorted[a]) * (x - a); }
function aggOf(agg, vals, t, sh, rounds) {
  // vals: known values only; sh: the share's test
  const n = vals.length;
  switch (agg) {
    case 'count': return n;
    case 'perRound': return rounds > 0 ? n / rounds : NaN;
    case 'share': { if (!n) return NaN; let k = 0; for (const v of vals) if (sh(v)) k++; return k / n; }
    case 'sum': { let s = 0; for (const v of vals) s += v; return s; }
    case 'mean': { if (!n) return NaN; let s = 0; for (const v of vals) s += v; return s / n; }
    case 'min': { let m = Infinity; for (const v of vals) if (v < m) m = v; return n ? m : NaN; }
    case 'max': { let m = -Infinity; for (const v of vals) if (v > m) m = v; return n ? m : NaN; }
    default: { const s = Float64Array.from(vals).sort(); return quant(s, agg === 'median' ? 0.5 : agg === 'p10' ? 0.1 : 0.9); }
  }
}
// log of the binomial tail: P(X >= k) (up) or P(X <= k) (down), X ~ Bin(n, p); a normal guess past 4000
function lnGamma(z) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let x = z, y = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const q of c) s += q / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
function binTail(k, n, p, up) {
  if (n <= 0) return 1; p = Math.min(1 - 1e-9, Math.max(1e-9, p));
  if (n > 4000) { const m = n * p, sd = Math.sqrt(n * p * (1 - p)), z = up ? (k - 0.5 - m) / sd : (m - k - 0.5) / sd; return 0.5 * erfc(z / Math.SQRT2); }
  const lc = j => lnGamma(n + 1) - lnGamma(j + 1) - lnGamma(n - j + 1) + j * Math.log(p) + (n - j) * Math.log(1 - p);
  let s = 0; if (up) for (let j = k; j <= n; j++) s += Math.exp(lc(j)); else for (let j = 0; j <= k; j++) s += Math.exp(lc(j));
  return Math.min(1, s);
}
function erfc(x) { const z = Math.abs(x), t = 1 / (1 + 0.5 * z), r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }

export function statqMeta(S, okSrv) {
  const srv = S.sName.map((n, k) => [n, k]).filter(([n]) => okSrv(n)).map(([n]) => n).sort();
  const okR = S.rounds.map(r => !r.dead && okSrv(S.sName[r.s]));
  const maps = new Map(); for (let r = 0; r < S.rounds.length; r++) if (okR[r]) { const m = S.mName[S.rounds[r].m]; maps.set(m, (maps.get(m) || 0) + 1); }
  const wk = new Int32Array(S.wName.length); const K = S.K.c; for (let i = 0; i < S.K.n; i++) if (K.w[i] >= 0 && okR[K.r[i]]) wk[K.w[i]]++;
  const weapons = S.wName.map((n, k) => [n, wk[k]]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  let kills = 0; for (let i = 0; i < S.K.n; i++) if (okR[K.r[i]]) kills++;
  return { ...statqCatalog(), rounds: okR.filter(Boolean).length, kills, pressRounds: S.qRounds, servers: srv, maps: [...maps].sort((a, b) => b[1] - a[1]), weapons,
    from: Number.isFinite(S.dayMin) ? dayStr(S.dayMin) : null, to: Number.isFinite(S.dayMax) ? dayStr(S.dayMax) : null, built: new Date(S.at).toISOString(), buildMs: S.ms };
}
export function statqNicks(S, q, okSrv) {
  const s = String(q || '').trim().toLowerCase(); if (s.length < 2) return [];
  const hit = []; for (const [nk, id] of S.nicks) { const nm = S.nickName[id]; if (nk.toLowerCase().includes(s) || nm.toLowerCase().includes(s)) hit.push(id); }
  if (!hit.length) return [];
  // his rounds among those this admin may see
  const want = new Set(hit), okR = S.rounds.map(r => !r.dead && okSrv(S.sName[r.s])), n = new Map(), seen = new Set(), P = S.P.c;
  for (let i = 0; i < S.P.n; i++) { const id = P.n[i]; if (!want.has(id) || !okR[P.r[i]]) continue; const key = P.r[i] * 1e6 + id; if (seen.has(key)) continue; seen.add(key); n.set(id, (n.get(id) || 0) + 1); }
  return hit.filter(id => n.get(id)).map(id => [S.nickKey[id], S.nickName[id], n.get(id)]).sort((a, b) => b[2] - a[2]).slice(0, 20);
}
export function statqAsk(S, q, okSrv) {
  const side = SIDES[q.side] || SIDES.kills, T = S[side.T], C = T.c, M = side.M;
  const md = M.find(m => m[0] === q.m) || M[0], [mk, mn, mt, mu, , mcats, get] = md;
  const agg = AGGS.some(a => a[0] === q.agg) ? q.agg : 'count';
  if ((mt === 'cat' || mt === 'bool') && !['count', 'perRound', 'share'].includes(agg)) return { ok: false, msg: `${mn}: count it, per round, or its share - it is not a number` };
  if (agg === 'perRound' && side.T !== 'K') return { ok: false, msg: 'per round: for kills (his, or of him)' };
  const nick = String(q.nick || '').trim(), me = S.nicks.has(nick) ? S.nicks.get(nick) : -1;
  if (!nick) return { ok: false, msg: 'whose? (a player)' };
  const noSuch = { ok: false, msg: `no player "${nick}" in the analysed rounds` };
  if (me < 0) return noSuch;
  if (q.server && !okSrv(String(q.server))) return { ok: false, msg: 'not one of the servers of your account' };
  { let seen = false; const P = S.P.c; for (let i = 0; i < S.P.n && !seen; i++) if (P.n[i] === me) { const o = S.rounds[P.r[i]]; if (!o.dead && okSrv(S.sName[o.s])) seen = true; } if (!seen) return noSuch; }   // (a server's admin: of his servers' players only)
  // the rounds asked about
  const d0 = q.from ? dayOf(q.from) : -Infinity, d1 = q.to ? dayOf(q.to) : Infinity, sv = q.server ? S.servers.get(q.server) : null, mp = q.map ? S.maps.get(String(q.map).toLowerCase()) : null;
  if (q.server && sv === undefined || q.map && mp === undefined) return { ok: false, msg: 'no such server or map' };
  const RM = new Uint8Array(S.rounds.length);
  for (let r = 0; r < S.rounds.length; r++) { const o = S.rounds[r]; RM[r] = !o.dead && o.day >= d0 && o.day <= d1 && (sv == null || o.s === sv) && (mp == null || o.m === mp) && okSrv(S.sName[o.s]) ? 1 : 0; }
  let wid = null; if (side.weapon && q.weapon) { wid = S.weapons.get(String(q.weapon)); if (wid === undefined) return { ok: false, msg: `no weapon "${q.weapon}"` }; }
  const conds = []; for (const c of (Array.isArray(q.c) ? q.c : []).slice(0, 4)) { const d = M.find(m => m[0] === c.m); if (!d || !OPS.includes(c.op)) continue; const cv = d[2] === 'num' ? numQ(c.v) : d[5] ? d[5].indexOf(c.v) : numQ(c.v); if (d[2] === 'num' ? !Number.isFinite(cv) : cv < 0) continue; conds.push({ get: d[6], t: d[2], op: c.op, v: cv }); }
  const shOp = OPS.includes(q.op) ? q.op : '=', shV = mt === 'num' ? numQ(q.v) : mcats ? mcats.indexOf(q.v) : numQ(q.v);
  if (agg === 'share' && (mt === 'num' ? !Number.isFinite(shV) : shV < 0)) return { ok: false, msg: 'the share that …: say of which (a value)' };
  const sh = v => test(shOp, v, shV);
  // rounds played (per round): each player's rounds among those asked about
  const plRounds = new Int32Array(S.nickName.length); { const P = S.P.c, seen = new Set(); for (let i = 0; i < S.P.n; i++) if (RM[P.r[i]]) { const key = P.r[i] * 1e6 + P.n[i]; if (!seen.has(key)) { seen.add(key); plRounds[P.n[i]]++; } } }
  // the rows
  const G = C[side.grp], R = C.r, W = side.weapon ? C.w : null, OTH = side.other ? C[side.other] : null;
  // (typed: a question over 900 000 kills leaves ~25 MB to the collector, not hundreds)
  const vals0 = new Float64Array(T.n), grps0 = new Int32Array(T.n), keptR0 = new Int32Array(T.n), mine = []; let nV = 0;
  for (let i = 0; i < T.n; i++) {
    if (!RM[R[i]]) continue; const g = G[i]; if (g < 0) continue;
    if (wid != null && W[i] !== wid) continue;
    let ok = true; for (const c of conds) { const v = c.get(S, i); if (!known(c.t, v) || !test(c.op, v, c.v)) { ok = false; break; } } if (!ok) continue;
    const v = get(S, i); if (!known(mt, v)) continue;
    vals0[nV] = v; grps0[nV] = g; keptR0[nV++] = R[i]; if (g === me) mine.push(i);
  }
  const vals = vals0.subarray(0, nV), grps = grps0.subarray(0, nV), keptR = keptR0.subarray(0, nV);
  // each player's values together (by a count of each), his, everyone else's
  const nG = S.nickName.length, at = new Int32Array(nG + 1); for (let j = 0; j < nV; j++) at[grps[j] + 1]++; for (let g = 0; g < nG; g++) at[g + 1] += at[g];
  const byG = new Float64Array(nV); { const pos = at.slice(0, nG); for (let j = 0; j < nV; j++) byG[pos[grps[j]]++] = vals[j]; }
  const ofG = g => byG.subarray(at[g], at[g + 1]);
  const his = ofG(me), others = new Float64Array(nV - his.length); others.set(byG.subarray(0, at[me])); others.set(byG.subarray(at[me + 1]), at[me]);
  let othRounds = 0; for (let n = 0; n < plRounds.length; n++) if (n !== me) othRounds += plRounds[n];
  const hisV = aggOf(agg, his, mt, sh, plRounds[me]), othV = aggOf(agg, others, mt, sh, othRounds);
  const minN = Math.max(1, Math.min(10000, +q.min || 10));
  const ranked = [];
  for (let g = 0; g < nG; g++) { if (at[g + 1] === at[g]) continue; const a = ofG(g), enough = agg === 'perRound' ? plRounds[g] >= minN : a.length >= minN; if (!enough) continue; const v = aggOf(agg, a, mt, sh, plRounds[g]); if (Number.isFinite(v)) ranked.push([g, v, agg === 'perRound' ? plRounds[g] : a.length]); }
  if (agg === 'perRound') for (let g = 0; g < plRounds.length; g++) if (plRounds[g] >= minN && at[g + 1] === at[g]) ranked.push([g, 0, plRounds[g]]);
  const low = q.order === 'low';   // the top: the highest first, or the lowest
  ranked.sort((a, b) => low ? a[1] - b[1] : b[1] - a[1]);
  let below = 0, same = 0, rank = null; const oth = ranked.filter(x => x[0] !== me);
  if (Number.isFinite(hisV)) { for (const [, v] of oth) { if (v < hisV) below++; else if (v === hisV) same++; } rank = 1 + oth.filter(x => low ? x[1] < hisV : x[1] > hisV).length; }
  const pct = oth.length && Number.isFinite(hisV) ? (below + same / 2) / oth.length : null;
  // the odds of his share at everyone else's
  let chance = null;
  if (agg === 'share' && his.length && Number.isFinite(othV)) { let k = 0; for (const v of his) if (sh(v)) k++; const up = k / his.length >= othV; chance = { k, n: his.length, p: othV, tail: binTail(k, his.length, othV, up), up }; }
  // the spread of the values: his against everyone else's
  let hist = null;
  if (mt === 'num' && agg !== 'count' && agg !== 'perRound') {
    const all = Float64Array.from(vals).sort(), lo = quant(all, 0.01), hi0 = quant(all, 0.99), hi = hi0 > lo ? hi0 : lo + 1, B = 20, w = (hi - lo) / B;
    const hb = new Array(B).fill(0), ob = new Array(B).fill(0);
    for (let j = 0; j < vals.length; j++) { const k = Math.max(0, Math.min(B - 1, Math.floor((vals[j] - lo) / w))); (grps[j] === me ? hb : ob)[k]++; }
    hist = { lo, hi, w, his: hb, oth: ob };
  } else if (mt !== 'num') {
    const L = mcats || ['no', 'yes'], hb = new Array(L.length).fill(0), ob = new Array(L.length).fill(0);
    for (let j = 0; j < vals.length; j++) { const k = vals[j]; if (k >= 0 && k < L.length) (grps[j] === me ? hb : ob)[k]++; }
    hist = { cats: L, his: hb, oth: ob };
  }
  // week by week (weeks from Monday)
  const wkOf = r => Math.floor((S.rounds[r].day + 3) / 7), wH = new Map(), wO = new Map(), wR = new Map(), wRO = new Map();
  if (nV) {   // (the values by week and his or not: counted, then laid out in one array)
    const wk = new Int32Array(nV); let w0 = Infinity, w1 = -Infinity; for (let j = 0; j < nV; j++) { const x = wk[j] = wkOf(keptR[j]); if (x < w0) w0 = x; if (x > w1) w1 = x; }
    const nW = w1 - w0 + 1, bOf = j => (grps[j] === me ? 0 : nW) + wk[j] - w0, at2 = new Int32Array(2 * nW + 1);
    for (let j = 0; j < nV; j++) at2[bOf(j) + 1]++; for (let k = 0; k < 2 * nW; k++) at2[k + 1] += at2[k];
    const lay = new Float64Array(nV); { const pos = at2.slice(0, 2 * nW); for (let j = 0; j < nV; j++) lay[pos[bOf(j)]++] = vals[j]; }
    for (let k = 0; k < nW; k++) { if (at2[k + 1] > at2[k]) wH.set(w0 + k, lay.subarray(at2[k], at2[k + 1])); if (at2[nW + k + 1] > at2[nW + k]) wO.set(w0 + k, lay.subarray(at2[nW + k], at2[nW + k + 1])); }
  }
  if (agg === 'perRound') { const P = S.P.c, seen = new Set(); for (let i = 0; i < S.P.n; i++) if (RM[P.r[i]]) { const key = P.r[i] * 1e6 + P.n[i]; if (seen.has(key)) continue; seen.add(key); const wk = wkOf(P.r[i]), M2 = P.n[i] === me ? wR : wRO; M2.set(wk, (M2.get(wk) || 0) + 1); } }
  const weeks = [...new Set([...wH.keys(), ...wR.keys()])].sort((a, b) => a - b).slice(-MAX_WEEKS).map(wk => {
    const a = wH.get(wk) || [], o = wO.get(wk) || [];
    return { from: dayStr(wk * 7 - 3), his: aggOf(agg, a, mt, sh, wR.get(wk) || 0), n: agg === 'perRound' ? wR.get(wk) || 0 : a.length, oth: aggOf(agg, o, mt, sh, wRO.get(wk) || 0), on: agg === 'perRound' ? wRO.get(wk) || 0 : o.length };
  });
  // his events: the newest first
  const evAt = i => S.rounds[R[i]].date + (side.T === 'K' ? String(Math.round(C.t[i] * 10)).padStart(6, '0') : '');
  const ev = mine.map(i => [i, evAt(i)]).sort((a, b) => a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0).slice(0, MAX_EVENTS)
    .map(([i]) => { const o = S.rounds[R[i]], v = get(S, i); return { round: o.name, date: o.date, map: S.mName[o.m], t: side.T === 'K' ? Math.round(C.t[i] * 10) / 10 : null, pn: o.nm.get(me) || S.nickName[me], with: OTH && OTH[i] >= 0 ? o.nm.get(OTH[i]) || S.nickName[OTH[i]] : null, w: W && W[i] >= 0 ? S.wName[W[i]] : null,
      v: mt === 'num' ? Math.round(v * 1000) / 1000 : mcats ? mcats[v] : v ? 'yes' : 'no', ...(agg === 'share' ? { that: sh(v) } : {}) }; });
  const r3 = v => Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null;
  return { ok: true, q: { side: q.side, m: mk, agg, op: shOp, v: q.v ?? null, order: low ? 'low' : 'high' }, who: S.nickName[me], nick, label: mn, type: mt, unit: mu,
    his: r3(hisV), hisN: agg === 'perRound' ? plRounds[me] : his.length, hisKills: his.length, oth: r3(othV), othN: agg === 'perRound' ? othRounds : others.length,
    rank, of: oth.length, pct: pct == null ? null : r3(pct), minN, top: ranked.slice(0, 10).map(([g, v, n]) => ({ who: S.nickName[g], nick: S.nickKey[g], v: r3(v), n, me: g === me })),
    chance: chance && { ...chance, p: r3(chance.p), tail: chance.tail }, hist, weeks, events: ev, rounds: plRounds[me], built: new Date(S.at).toISOString() };
}
