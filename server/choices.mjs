#!/usr/bin/env node
// BF2 Round Replay - (v249, Sagara: "детектор, порівнювальник, який перебере всі демо і на однакових ситуаціях зможе
// вивести, кому скільки разів вдається, щоб порівняти між собою") choices: who is "lucky" at flags.
//
// The page's flagChoices (the analysis's table C) has every trip a soldier made to a flag his side did not hold, with the
// flags he could have gone for instead and, for each, what his side could know then (owner, distance, team mates there,
// enemies seen / spotted / in the UAV ring / heard) and what nobody on his side knew (the other enemies there). A
// wallhack or radar shows the second part. This script:
//   1. learns, from everyone's choices, how players choose by the known part alone (a conditional logit: each flag's
//      odds by its distance, owner, height, team mates, known enemies, squad order, and how much each map's flag draws
//      each side) - the "same situation" for every choice, without needing two alike - and fits it again to each
//      player's own way of choosing (pulled towards everyone's: a back-capper meets fewer enemies of every kind);
//   2. for every player, puts the hidden enemies he met against what his own odds foretell, exactly (how unlikely so
//      few are), and how often he picked the flag with the fewest of them;
//   3. puts the players side by side: that z against the spread of everyone's, which widens with how much a player
//      has played (honest players differ a little per choice, and it adds up), less what his reading of the game - the
//      same z for the KNOWN enemies - foretells (only ever taken off), and the false-discovery q over all ranked players
//      (Benjamini-Hochberg).
// It is a reason to watch his choices (each with its round and second), never proof: voice (a team mate's "A is
// empty") is not in the demo.
//
//   node choices.mjs                every analysed round (analysis/rounds) -> data/.admin/choices.json, and the table
//     --dir D                       the analysis's rounds from elsewhere (an archive unpacked: its rounds folder)
//     --min N                       players with fewer telling choices left out of the ranking (default 15)
//     --all                         squad members who followed their leader count too (he chose, not they)
//     --arrived                     only the trips that got there (those killed on the way left out: their flag is a guess -
//                                   but without them the unlucky trips are missing, and a player often killed looks lucky)
//     --maps a,b  --since YYYY-MM-DD  --until YYYY-MM-DD   only these rounds
//     --nick NAME                   his choices, the most telling first, with links
//     --check                       is it measuring anything on our rounds: placebo (hidden enemies shuffled among choices
//                                   of the same flags and side), split halves, peeking put into real players' choices,
//                                   killed on the way (flag not known) against the ranking
//     --selftest [--players N --cheat share --style sd --trait sd --detail]   a made-up archive (the real flags,
//                                   made-up players, some of them cheaters): how many cheaters are found, and how many
//                                   honest players with them
//     --out F                       the JSON elsewhere (--out - : none)
//     --top N                       rows of the table (default 30)
// Settings as ingest.mjs: /etc/bf2replay.conf or the environment (BF2R_ROOT, BF2R_DOMAIN).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { readRoundList } from './roundsidx.mjs';

export const CHOICES_V = 1;
const conf = {};
try { for (const line of fs.readFileSync('/etc/bf2replay.conf', 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/.exec(line); if (m) conf[m[1]] = m[2]; } } catch (e) { /* no file: defaults */ }
const opt = (k, d) => process.env[k] ?? conf[k] ?? d;
const ROOT = opt('BF2R_ROOT', '/srv/bf2replay'), DOMAIN = opt('BF2R_DOMAIN', '').trim();
const HERE = path.dirname(new URL(import.meta.url).pathname);
const argv = process.argv.slice(2), has = k => argv.includes(k), val = (k, d) => { const i = argv.indexOf(k); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const BOT = /^Player \d+$/;
const linkId = n => String(n || '').replace(/\.bf2demo$/i, '');

// ---------- the page's nick rule (as the statistics merge names) ----------
function nickRule() {
  for (const f of [path.join(ROOT, 'site', 'index.html'), path.join(HERE, '..', 'site', 'index.html')]) {
    let t; try { t = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    const L = t.split('\n'), a = L.findIndex(l => l.startsWith('// @agg-begin')), b = L.findIndex(l => l.startsWith('// @agg-end')), g = L.find(l => l.startsWith('const GAME = '));
    if (g && a >= 0 && b > a) { try { return new Function(g + '\n' + L.slice(a, b).join('\n') + '\nreturn nickOf;')(); } catch (e) { /* the plain rule */ } }
  }
  return name => { const t = String(name || '').trim(); return BOT.test(t) ? t : t.split(/\s+/).pop(); };
}

// ---------- reading the rounds ----------
// the analysis's files that count (as the hints over a player's rounds): not a round taken off the list as a copy of
// another (the same demo from two demo pages - else his choices there would count twice), and only the rounds the site
// still lists (when it has a list: not for an unpacked archive elsewhere)
export function countedFiles(data = path.join(ROOT, 'data')) {
  const fileOf = n => linkId(n).replace(/[^A-Za-z0-9._-]/g, '_') + '.json.gz';
  let copies = {}; try { copies = JSON.parse(fs.readFileSync(path.join(data, '.copies.json'), 'utf8')).copies || {}; } catch (e) {}
  let listed = null; try { const L = readRoundList(fs, path, data).rounds; if (L && L.length) listed = new Set(L.map(r => fileOf(r.name))); } catch (e) {}
  return { skip: new Set(Object.keys(copies).map(fileOf)), listed };
}
export function readChoices(dir, { nickOf, maps = null, since = '', until = '', all = false, arrived = false, skip = null, listed = null } = {}) {
  nickOf = nickOf || nickRule();
  const out = [], st = { files: 0, noC: 0, rounds: 0, rows: 0, followed: 0, bots: 0, skipped: 0, died: 0, copies: 0, unlisted: 0, dupes: 0 }, lost = new Map(), seenRound = new Set();
  let files = []; try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json.gz')).sort(); } catch (e) { return { D: out, st, lost }; }
  for (const f of files) {
    st.files++;
    if (skip && skip.has(f)) { st.copies++; continue; } if (listed && !listed.has(f)) { st.unlisted++; continue; }
    let j; try { j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f)))); } catch (e) { st.skipped++; continue; }
    if (!Array.isArray(j.C) || !j.cols?.C || !j.cols?.Cc) { st.noC++; continue; }
    const meta = { ...(j.meta || {}), ...(j.round?.sum || {}) }, map = String(meta.map || j.map || '').toLowerCase(), date = String(meta.date || '');
    if (maps && !maps.has(map)) continue; if (since && date.slice(0, 10) < since) continue; if (until && date.slice(0, 10) > until) continue;
    // (the same round twice - two files of one demo: by its server, time and map)
    const rk = String(meta.server || '') + '|' + date + '|' + map; if (date && seenRound.has(rk)) { st.dupes++; continue; } seenRound.add(rk);
    st.rounds++;
    const cP = j.cols.P, pi = cP.indexOf('i'), pn = cP.indexOf('name'), who = new Map();
    for (const p of j.P || []) { const nm = String(p[pn] ?? '').trim(), nk = nickOf(nm); if (nm && !BOT.test(nk)) who.set(p[pi], [nk, nm]); }
    const c = j.cols.C, cc = j.cols.Cc, ix = k => c.indexOf(k), jx = k => cc.indexOf(k);
    const I = { p: ix('player'), t0: ix('t0'), ta: ix('tArr'), ch: ix('chosen'), tm: ix('team'), role: ix('role'), veh: ix('veh'), trip: ix('trip'), cands: ix('cands'), lead: ix('lead'), died: ix('died') };
    const J = { f: jx('flag'), d: jx('d'), own: jx('own'), lvl: jx('lvl'), mv: jx('mv'), ally: jx('ally'), kn: jx('known'), unk: jx('unk'), ord: jx('ord'), hr: jx('heard'), far: jx('unkFar') };
    const round = linkId(j.round?.name || j.name), Cf = Array.isArray(j.Cf) ? j.Cf : null;
    for (const r of j.CL || []) { const w = who.get(r[0]); if (w) lost.set(w[0], (lost.get(w[0]) || 0) + 1); }   // (killed on the way, his flag not known)
    for (const r of j.C) {
      st.rows++; const w = who.get(r[I.p]); if (!w) { st.bots++; continue; }
      const role = r[I.role], lead = I.lead >= 0 ? r[I.lead] || 0 : 0; if (role === 0 && lead && !all) { st.followed++; continue; }
      const died = I.died >= 0 ? r[I.died] || 0 : 0; if (died) { if (arrived) continue; st.died++; }
      const cands = r[I.cands].map(x => ({ f: x[J.f], fn: Cf ? String(Cf[x[J.f]] ?? x[J.f]) : String(x[J.f]), d: x[J.d], own: x[J.own], lvl: x[J.lvl] ?? 0, mv: x[J.mv] ?? 0, ally: x[J.ally], kn: x[J.kn], unk: x[J.unk], ord: x[J.ord], hr: J.hr >= 0 ? x[J.hr] || 0 : 0, far: J.far >= 0 ? x[J.far] || 0 : 0 }));
      if (cands.length < 2 || r[I.ch] < 0) { if (died && r[I.ch] < 0) lost.set(w[0], (lost.get(w[0]) || 0) + 1); continue; }
      out.push({ nick: w[0], name: w[1], round, date, map, server: String(meta.server || ''), t0: r[I.t0], ta: r[I.ta], ch: r[I.ch], tm: r[I.tm], role, lead, died, veh: r[I.veh], cands });
    }
  }
  return { D: out, st, lost };
}

// ---------- the model: how players choose by what they could know ----------
// each flag's features (the flag-of-the-map-and-side draws are added as one-hot columns with their own ridge)
const BASE = ['log distance', 'log distance (driving)', 'nearest', "the enemy's", 'height', 'moving his way', 'team mates there', 'known enemies there', "his squad's order", 'heard only'];
const xBase = (D, c, dmin) => { const ld = Math.log(c.d + 20); return [ld, D.veh ? ld : 0, c.d === dmin ? 1 : 0, c.own, c.lvl, Math.max(-1, Math.min(1, c.mv)), Math.log1p(c.ally), Math.log1p(c.kn), c.ord, Math.log1p(c.hr)]; };
function design(D, minFx = 30) {
  // (a flag by its name: the round's layer - 16, 32, 64 players - has its own set of flags, numbered in its own order)
  const cnt = new Map(); for (const d of D) for (const c of d.cands) { const k = d.map + '|' + c.fn + '|' + d.tm; cnt.set(k, (cnt.get(k) || 0) + 1); }
  const fx = new Map(); for (const [k, n] of cnt) if (n >= minFx) fx.set(k, BASE.length + fx.size);
  const P = BASE.length + fx.size;
  for (const d of D) { const dmin = Math.min(...d.cands.map(c => c.d)); d.X = d.cands.map(c => { const x = xBase(d, c, dmin), k = fx.get(d.map + '|' + c.fn + '|' + d.tm); return { x, fx: k ?? -1 }; }); }
  return { P, fx };
}
const dotRow = (b, r) => { let s = 0; for (let k = 0; k < r.x.length; k++) s += b[k] * r.x[k]; if (r.fx >= 0) s += b[r.fx]; return s; };
function probs(b, d) { const u = d.X.map(r => dotRow(b, r)), m = Math.max(...u), e = u.map(v => Math.exp(v - m)), s = e.reduce((a, v) => a + v, 0); return e.map(v => v / s); }
// Newton's method on the conditional log-likelihood, a ridge on every weight (heavier on the flags' draws)
function fit(D, P, { lam = 1, lamFx = 5, iters = 30 } = {}) {
  let b = new Array(P).fill(0), ll = -Infinity;
  for (let it = 0; it < iters; it++) {
    const g = new Array(P).fill(0), H = Array.from({ length: P }, () => new Float64Array(P)); let L = 0;
    for (const d of D) {
      const p = probs(b, d), nb = BASE.length, xbar = new Float64Array(P);
      d.X.forEach((r, c) => { for (let k = 0; k < nb; k++) xbar[k] += p[c] * r.x[k]; if (r.fx >= 0) xbar[r.fx] += p[c]; });
      const ch = d.X[d.ch]; L += Math.log(Math.max(1e-300, p[d.ch]));
      for (let k = 0; k < nb; k++) g[k] += ch.x[k] - xbar[k]; if (ch.fx >= 0) g[ch.fx] += 1; for (let k = nb; k < P; k++) g[k] -= xbar[k];
      d.X.forEach((r, c) => {
        const idx = [], v = []; for (let k = 0; k < nb; k++) { idx.push(k); v.push(r.x[k] - xbar[k]); }
        // (the one-hot columns: dense difference over the flags of this choice)
        const seen = new Set(); for (const q of d.X) if (q.fx >= 0 && !seen.has(q.fx)) { seen.add(q.fx); idx.push(q.fx); v.push((r.fx === q.fx ? 1 : 0) - xbar[q.fx]); }
        for (let a = 0; a < idx.length; a++) for (let e = 0; e < idx.length; e++) H[idx[a]][idx[e]] += p[c] * v[a] * v[e];
      });
    }
    for (let k = 0; k < P; k++) { const l = k < BASE.length ? lam : lamFx; L -= 0.5 * l * b[k] * b[k]; g[k] -= l * b[k]; H[k][k] += l; }
    const step = solve(H, g); if (!step) break;
    let t = 1, nb2; for (;;) { nb2 = b.map((v, k) => v + t * step[k]); if (llOf(D, nb2, lam, lamFx) >= L - 1e-9 || t < 1e-3) break; t /= 2; }
    b = nb2; if (Math.abs(L - ll) < 1e-6 * Math.max(1, Math.abs(L))) { ll = L; break; } ll = L;
  }
  return { b, ll: llOf(D, b, lam, lamFx) };
}
function llOf(D, b, lam, lamFx) { let L = 0; for (const d of D) L += Math.log(Math.max(1e-300, probs(b, d)[d.ch])); b.forEach((v, k) => { L -= 0.5 * (k < BASE.length ? lam : lamFx) * v * v; }); return L; }
function solve(A, y) {
  const n = y.length, M = A.map((r, i) => [...r, y[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; if (Math.abs(M[p][c]) < 1e-12) return null; [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; if (!f) continue; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

// (each player's own way of choosing) his own weights for the known part, fitted on his own choices and pulled towards
// everyone's (a ridge of LAM_STYLE round them; the flags' draws stay everyone's). A player who always goes for the far
// flags nobody fights over (back-capping) meets fewer enemies of every kind: by his own weights that is his way, not
// luck - his hidden enemies are set against his own odds. (Fitted on the known part only, so a cheater's pull away from
// hidden enemies stays in what is left, unless it looks like a way of choosing everyone could have.)
const LAM_STYLE = 10;
function styleFit(L, bPop, { lam = LAM_STYLE, iters = 10 } = {}) {
  const nb = BASE.length, full = w => { const f = bPop.slice(); for (let k = 0; k < nb; k++) f[k] = w[k]; return f; };
  let b = bPop.slice(0, nb);
  for (let it = 0; it < iters; it++) {
    const B = full(b), g = new Array(nb).fill(0), H = Array.from({ length: nb }, () => new Float64Array(nb));
    for (const d of L) {
      const p = probs(B, d), xb = new Float64Array(nb); d.X.forEach((r, c) => { for (let k = 0; k < nb; k++) xb[k] += p[c] * r.x[k]; });
      const ch = d.X[d.ch]; for (let k = 0; k < nb; k++) g[k] += ch.x[k] - xb[k];
      d.X.forEach((r, c) => { for (let a = 0; a < nb; a++) { const va = r.x[a] - xb[a]; if (!va) continue; for (let e = 0; e < nb; e++) H[a][e] += p[c] * va * (r.x[e] - xb[e]); } });
    }
    for (let k = 0; k < nb; k++) { g[k] -= lam * (b[k] - bPop[k]); H[k][k] += lam; }
    const st = solve(H, g); if (!st) break; const mx = Math.max(...st.map(Math.abs)), f = mx > 2 ? 2 / mx : 1;
    b = b.map((v, k) => v + f * st[k]); if (mx < 1e-4) break;
  }
  return full(b);
}
// every player's choices scored against his own odds too (d.s2)
function restyle(D, bPop, style = true) {
  if (!style) { for (const d of D) d.s2 = null; return; }
  const by = new Map(); for (const d of D) { if (!by.has(d.nick)) by.set(d.nick, []); by.get(d.nick).push(d); }
  for (const L of by.values()) { const B = styleFit(L, bPop); for (const d of L) { d.pS = probs(B, d); d.s2 = score(d, d.pS); } }
}

// ---------- what each choice tells ----------
// H: the hidden enemies at a flag (on it, and on the way in); K: the known ones
const hidOf = c => c.unk + c.far, knOf = c => c.kn;
function score(d, p) {
  const H = d.cands.map(hidOf), K = d.cands.map(knOf), hmin = Math.min(...H), tell = H.some(h => h !== hmin);
  const eH = H.reduce((a, h, c) => a + p[c] * h, 0), vH = H.reduce((a, h, c) => a + p[c] * h * h, 0) - eH * eH;
  const eK = K.reduce((a, h, c) => a + p[c] * h, 0), vK = K.reduce((a, h, c) => a + p[c] * h * h, 0) - eK * eK;
  const pMin = H.reduce((a, h, c) => a + (h === hmin ? p[c] : 0), 0);
  return { tell, hit: tell && H[d.ch] === hmin ? 1 : 0, pMin: tell ? pMin : 0, sH: eH - H[d.ch], vH: Math.max(0, vH), sK: eK - K[d.ch], vK: Math.max(0, vK), pCh: p[d.ch], H, K, p, eH };
}
// P(X >= o) for a sum of independent Bernoullis (exact)
function pbTail(ps, o) { let f = new Float64Array(ps.length + 2); f[0] = 1; ps.forEach((p, k) => { for (let j = k + 1; j >= 1; j--) f[j] = f[j] * (1 - p) + f[j - 1] * p; f[0] *= 1 - p; }); let s = 0; for (let j = o; j <= ps.length; j++) s += f[j]; return Math.min(1, Math.max(0, s)); }
// the hidden enemies he would meet over all his telling choices, exactly (each choice's few counts and their odds, put
// together one by one): P(as few as he met or fewer), the middle of the step counted half - hidden enemies are rare, so
// the sum is lopsided and a plain z would run ahead of it out in the tail. Returned as the z with that tail.
export function metTail(list) {   // [[counts], [odds], chosen]
  let f = new Float64Array(1); f[0] = 1; let obs = 0;
  for (const [H, p, ch] of list) {
    const mx = Math.max(...H), g = new Float64Array(f.length + mx);
    for (let s = 0; s < f.length; s++) { const v = f[s]; if (!v) continue; for (let c = 0; c < H.length; c++) g[s + H[c]] += v * p[c]; }
    f = g; obs += H[ch];
  }
  let lo = 0; for (let s = 0; s < obs && s < f.length; s++) lo += f[s];
  const pv = Math.min(1, Math.max(1e-300, lo + 0.5 * (f[obs] || 0)));
  return -probit(pv);
}
// the inverse of the normal distribution (Acklam)
function probit(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572], c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425; if (p <= 0) return -40; if (p >= 1) return 40;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
const phiC = z => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), y = 0.3989422804 * Math.exp(-z * z / 2) * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + 1.330274429 * t)))); return z > 0 ? y : 1 - y; };   // P(Z > z)
const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
// the spread of everyone's z, as it grows with his information I (the sum of his choices' variances): z ~ N(m·√I, a + τ²·I).
// m: everyone's own lean per choice (a model is never quite right: where the fighting is, both sides' men are); a: more
// than 1 when choices of one round hang together (the same campers trip after trip); τ²: honest players differ a little
// per choice (game sense, a squad that talks), which adds up over many choices - a regular's z spreads wider than a
// newcomer's, and one spread for all would flag regulars. Fitted to the ranked players, the 2.5% farthest by it left out
// of each fit (a few cheaters don't move it) and the rest scaled back. Under 30 ranked players: not fitted (plain z, no q).
const NULL_CUT = 5.024, NULL_KEEP = 0.851;   // (χ²₁ cut at its 97.5th percentile keeps 0.851 of its mean: P(χ²₃ < 5.024) / 0.975)
export function nullFit(R) {
  let m = 0, a = 1, t2 = 0;
  if (R.length < 30) return { m, a, t2, plain: true };
  for (let it = 0; it < 8; it++) {
    const keep = R.filter(o => (o.z - m * Math.sqrt(o.I)) ** 2 / (a + t2 * o.I) < NULL_CUT);
    let sw = 0, swy = 0; for (const o of keep) { const w = 1 / (a + t2 * o.I); sw += w * o.I; swy += w * o.z * Math.sqrt(o.I); } m = sw ? swy / sw : 0;
    let S = 0, Sx = 0, Sy = 0, Sxx = 0, Sxy = 0;
    for (const o of keep) { const w = 1 / (a + t2 * o.I) ** 2, r2 = (o.z - m * Math.sqrt(o.I)) ** 2 / NULL_KEEP; S += w; Sx += w * o.I; Sy += w * r2; Sxx += w * o.I * o.I; Sxy += w * o.I * r2; }
    const den = S * Sxx - Sx * Sx; let b1 = den > 0 ? (S * Sxy - Sx * Sy) / den : 0, b0 = S ? (Sy - b1 * Sx) / S : 1;
    if (b1 < 0) { b1 = 0; b0 = S ? Sy / S : 1; }
    a = Math.max(0.8, b0); t2 = Math.max(0, b1);
  }
  return { m, a, t2, plain: false };
}
const stdz = (z, I, N) => (z - N.m * Math.sqrt(I)) / Math.sqrt(N.a + N.t2 * I);
function players(D, min, lostBy = null) {
  const by = new Map();
  for (const d of D) {
    let o = by.get(d.nick); if (!o) by.set(d.nick, o = { nick: d.nick, name: d.name, rounds: new Set(), n: 0, tell: 0, hit: 0, ps: [], sH: 0, vH: 0, sK: 0, vK: 0, met: 0, exp: 0, moments: [], hl: [], kl: [] });
    o.name = d.name; o.rounds.add(d.round); o.n++; const s = d.s2 || d.s, k = d.s;   // (the hidden enemies against his own odds; the known ones against everyone's)
    if (!s.tell) continue;
    o.tell++; o.hit += s.hit; o.ps.push(s.pMin); o.sH += s.sH; o.vH += s.vH; o.sK += k.sK; o.vK += k.vK; o.met += s.H[d.ch]; o.exp += s.eH;
    o.hl.push([s.H, s.p, d.ch]); if (k.vK > 0) o.kl.push([k.K, k.p, d.ch]);
    o.moments.push({ round: d.round, t: d.t0, map: d.map, date: d.date, why: +(s.sH * (1 - s.pCh)).toFixed(3), d });
  }
  const L = [...by.values()].map(o => {
    const E = o.ps.reduce((a, p) => a + p, 0), lost = lostBy ? lostBy.get(o.nick) || 0 : 0;
    return { ...o, hl: undefined, kl: undefined, rounds: o.rounds.size, E, pHit: o.tell ? pbTail(o.ps, o.hit) : 1, zH: o.vH > 0 ? metTail(o.hl) : 0, zK: o.vK > 0 ? metTail(o.kl) : 0, lost, lostShare: lost / Math.max(1, lost + o.n) };
  });
  const ranked = L.filter(o => o.tell >= min), N = nullFit(ranked.map(o => ({ z: o.zH, I: o.vH }))), NK = nullFit(ranked.map(o => ({ z: o.zK, I: o.vK })));
  // the luck ratio (met fewer hidden enemies than foretold), shrunk to everyone's: (O + a) / (E + a), a from the spread
  const rr = ranked.map(o => o.E > 0 ? o.hit / o.E : 1), vr = rr.length > 2 ? rr.reduce((a, r) => a + (r - 1) ** 2, 0) / rr.length : 0, mPois = ranked.length ? ranked.reduce((a, o) => a + 1 / Math.max(1, o.E), 0) / ranked.length : 0;
  const tau2 = Math.max(1e-3, vr - mPois), ga = 1 / tau2;
  for (const o of L) { o.z = N.plain ? o.zH : stdz(o.zH, o.vH, N); o.zKn = NK.plain ? o.zK : stdz(o.zK, o.vK, NK); }
  // beyond his reading of the game: an honest good player avoids the enemies he can't know of a little too (sound, timing,
  // knowing the map) and is high on the known ones as well - the hidden z less what the known z foretells over everyone
  // (a straight line through the ranked players). Only taken off, never added: a player low on the known ones (one who
  // goes looking for a fight) gets nothing from it; and nothing set again round it after (that would lift some)
  let slope = 0;
  if (!N.plain) { const rk = ranked.filter(o => Math.abs(o.z) < 3), mx = rk.reduce((a, o) => a + o.zKn, 0) / (rk.length || 1), my = rk.reduce((a, o) => a + o.z, 0) / (rk.length || 1); let sxx = 0, sxy = 0; for (const o of rk) { sxx += (o.zKn - mx) ** 2; sxy += (o.zKn - mx) * (o.z - my); } slope = sxx > 0 ? Math.max(0, sxy / sxx) : 0; }
  for (const o of L) {
    o.zR = o.z - slope * Math.max(0, o.zKn); o.p = phiC(o.zR);
    o.ratio = o.E > 0 ? o.hit / o.E : null; o.shrunk = (o.hit + ga) / (o.E + ga);
    const sh = o.hit + ga, rt = o.E + ga; o.ci = [gammaQ(sh, 0.05) / rt, gammaQ(sh, 0.95) / rt];
    o.ranked = o.tell >= min;
  }
  // Benjamini-Hochberg over the ranked players (none while the spread is not fitted: the plain z is not to be trusted
  // that far out)
  const Rk = L.filter(o => o.ranked).sort((x, y) => x.p - y.p), m = Rk.length; let q = 1;
  for (let k = m - 1; k >= 0; k--) { q = Math.min(q, Rk[k].p * m / (k + 1)); Rk[k].q = N.plain ? null : q; }
  for (const o of L) if (!o.ranked) o.q = null;
  return { L, nul: { m: N.m, a: N.a, t2: N.t2, mK: NK.m, aK: NK.a, t2K: NK.t2, slope, ga, ranked: m, plain: N.plain } };
}
// a quantile of Gamma(k, 1) (Wilson-Hilferty)
function gammaQ(k, pr) { const z = pr === 0.05 ? -1.6449 : pr === 0.95 ? 1.6449 : 0; const c = 1 / (9 * k); return k * Math.max(0, 1 - c + z * Math.sqrt(c)) ** 3; }

// ---------- the run ----------
export function analyse(D, { min = 15, style = true, lost = null } = {}) {
  const { P, fx } = design(D); const t0 = Date.now(), M = fit(D, P);
  for (const d of D) { d.p = probs(M.b, d); d.s = score(d, d.p); }
  restyle(D, M.b, style);
  const nullLL = D.reduce((a, d) => a - Math.log(d.cands.length), 0);
  return { M, fx, P, ...players(D, min, lost), fitMs: Date.now() - t0, pseudoR2: 1 - M.ll / nullLL };
}
const linkOf = (round, t, name) => (DOMAIN ? 'https://' + DOMAIN + '/' : '/') + '#round=' + encodeURIComponent(round) + '&t=' + Math.max(0, Math.round(t - 3)) + '&p=' + encodeURIComponent(name);
function table(L, top) {
  const R = L.filter(o => o.ranked).sort((x, y) => y.zR - x.zR).slice(0, top), f = (v, k = 1) => v == null ? '-' : (v >= 0 && k >= 0 ? ' ' : '') + v.toFixed(k);
  const rows = R.map(o => [o.name.slice(0, 24).padEnd(24), String(o.rounds).padStart(4), String(o.tell).padStart(5), `${o.hit}/${o.E.toFixed(1)}`.padStart(10), (o.ratio == null ? '-' : o.ratio.toFixed(2)).padStart(5), `${o.shrunk.toFixed(2)} [${o.ci[0].toFixed(2)}-${o.ci[1].toFixed(2)}]`.padStart(17), `${(o.exp - o.met).toFixed(1)}`.padStart(7), f(o.z, 2).padStart(6), f(o.zKn, 2).padStart(6), f(o.zR, 2).padStart(7), `${Math.round(o.lostShare * 100)}%`.padStart(5), (o.q == null ? '-' : o.q < 0.001 ? '<.001' : o.q.toFixed(3)).padStart(6)].join(' '));
  return ['player                   rnds  tell  emptiest   x/E  shrunk [90%]       avoided  z hid  z kn  beyond  lost      q', ...rows].join('\n');
}
// is it measuring anything, on our own rounds
// trusted: the nicks the admins trust (data/.admin/review/trusted.json) - honest by their word, so a reference: hardly any of
// them should stand out
export function trustedNicks(data = path.join(ROOT, 'data')) { try { return new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(data, '.admin', 'review', 'trusted.json'), 'utf8')).nicks || {})); } catch (e) { return new Set(); } }
export function check(D, min, lost, { runs = 20, reps = 10, trusted = null } = {}) {
  const out = {}, rnd = mulberry(7);
  const base = analyse(D, { min, lost }), ranked = base.L.filter(o => o.ranked);
  const by = new Map(); for (const d of D) { if (!by.has(d.nick)) by.set(d.nick, []); by.get(d.nick).push(d); }
  // (a player's z against the same spread of everyone's as the real run)
  const zOf = (o, N = base.nul) => { if (N.plain) return o.zH; const z = (o.zH - N.m * Math.sqrt(o.vH)) / Math.sqrt(N.a + N.t2 * o.vH), zk = (o.zK - N.mK * Math.sqrt(o.vK)) / Math.sqrt(N.aK + N.t2K * o.vK); return z - N.slope * Math.max(0, zk); };
  const copyOf = d => ({ ...d });
  // 1. split halves: each player's rounds by date, every other one; his z in each half (a real trait keeps its place)
  const half = h => { const pick = []; for (const L of by.values()) { const rs = [...new Set(L.map(d => d.date + '|' + d.round))].sort(); const keep = new Set(rs.filter((r, k) => k % 2 === h)); for (const d of L) if (keep.has(d.date + '|' + d.round)) pick.push(copyOf(d)); } return pick; };
  const H0 = half(0), H1 = half(1); restyle(H0, base.M.b); restyle(H1, base.M.b);
  const A = players(H0, Math.floor(min / 2)).L, B = new Map(players(H1, Math.floor(min / 2)).L.map(o => [o.nick, o]));
  const both = A.filter(o => o.ranked && B.get(o.nick)?.ranked);
  out.split = { players: both.length, r: pearson(both.map(o => [o.zH / Math.sqrt(1 + 0 * o.vH), B.get(o.nick).zH])), rKnown: pearson(both.map(o => [o.zK, B.get(o.nick).zK])) };
  // 2. placebo: the hidden enemies of choices with the same flags and side (and map) shuffled among them - the flags'
  // own share of them stays, any player's link to them goes: nobody should be found
  const strata = new Map(); D.forEach((d, k) => { const key = d.map + '|' + d.tm + '|' + d.cands.map(c => c.fn).join(','); if (!strata.has(key)) strata.set(key, []); strata.get(key).push(k); });
  let anyRun = 0, flagged = 0, nP = 0; const zs = [];
  for (let r = 0; r < runs; r++) {
    const S = D.map(copyOf);
    for (const ks of strata.values()) { if (ks.length < 2) continue; const hv = ks.map(k => D[k].cands.map(c => [c.unk, c.far])); for (let i = hv.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [hv[i], hv[j]] = [hv[j], hv[i]]; } ks.forEach((k, i) => { S[k].cands = D[k].cands.map((c, ci) => ({ ...c, unk: hv[i][ci][0], far: hv[i][ci][1] })); }); }
    for (const d of S) { d.s = score(d, d.p); d.s2 = d.pS ? score(d, d.pS) : null; }
    const P = players(S, min); let f = 0; for (const o of P.L) if (o.ranked) { nP++; zs.push(o.zR); if (o.q != null && o.q < 0.05) f++; }
    flagged += f; if (f) anyRun++;
  }
  const mz = zs.reduce((a, z) => a + z, 0) / (zs.length || 1), sz = Math.sqrt(zs.reduce((a, z) => a + (z - mz) ** 2, 0) / (zs.length || 1));
  out.placebo = { runs, playerRuns: nP, flaggedAtQ05: flagged, runsWithAny: anyRun, zMean: +mz.toFixed(3), zSd: +sz.toFixed(3), over3: zs.filter(z => z > 3).length };
  // 3. peeking put into real players' choices: of a player's telling choices, a share turned to the emptiest flag (the
  // likeliest of them by his odds) - is he found, against the real run's spread
  const shares = [0.1, 0.2, 0.3, 0.5]; out.inject = [];
  const peek = (L, sh) => { const S = L.map(d => { const c = copyOf(d); if (!d.s.tell || rnd() >= sh) return c; const H = d.cands.map(hidOf), hm = Math.min(...H); let k = -1, bp = -1; H.forEach((h, i) => { if (h === hm && d.p[i] > bp) { bp = d.p[i]; k = i; } }); c.ch = k; c.s = score(c, d.p); return c; }); restyle(S, base.M.b); return players(S, 0).L[0]; };
  for (const sh of shares) {
    let det = 0, det3 = 0, tot = 0; const z = [];
    for (let r = 0; r < reps; r++) for (const o0 of ranked) { const o = peek(by.get(o0.nick), sh); if (!o) continue; const zz = zOf(o), pz = phiC(zz); tot++; z.push(zz); if (pz < 0.01) det++; if (pz < 0.001) det3++; }
    out.inject.push({ share: sh, players: ranked.length, runs: tot, detectedP01: tot ? det / tot : 0, detectedP001: tot ? det3 / tot : 0, medianZ: median(z) });
  }
  out.byChoices = [];
  for (const [lo, hi] of [[15, 30], [30, 60], [60, 120], [120, 1e9]]) {
    const who = ranked.filter(o => o.tell >= lo && o.tell < hi); let det = 0, tot = 0;
    for (let r = 0; r < reps; r++) for (const o0 of who) { const o = peek(by.get(o0.nick), 0.3); if (!o) continue; tot++; if (phiC(zOf(o)) < 0.01) det++; }
    out.byChoices.push({ tell: hi < 1e9 ? `${lo}-${hi - 1}` : `${lo}+`, players: who.length, detectedP01At30pct: tot ? det / tot : null });
  }
  // 4. killed on the way with his flag not known: a player who often is loses more of his unlucky trips - does it go
  // with his z (it should not)
  out.lost = { r: pearson(ranked.map(o => [o.lostShare, o.zR])), share: ranked.length ? +median(ranked.map(o => o.lostShare)).toFixed(3) : null };
  // 5. the trusted players: how many of them stand out
  if (trusted && trusted.size) { const T = ranked.filter(o => trusted.has(o.nick)); out.trusted = { listed: trusted.size, ranked: T.length, flaggedAtQ05: T.filter(o => isQ(o.q)).length, over2: T.filter(o => o.zR > 2).length, zMedian: T.length ? +median(T.map(o => o.zR)).toFixed(2) : null }; }
  out.at = new Date().toISOString(); out.runs = runs; out.reps = reps;
  return out;
}
function pearson(P) { const n = P.length; if (n < 3) return null; const mx = P.reduce((a, p) => a + p[0], 0) / n, my = P.reduce((a, p) => a + p[1], 0) / n; let sx = 0, sy = 0, sxy = 0; for (const [x, y] of P) { sx += (x - mx) ** 2; sy += (y - my) ** 2; sxy += (x - mx) * (y - my); } return sx && sy ? +(sxy / Math.sqrt(sx * sy)).toFixed(3) : null; }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- a made-up archive with known cheaters: does the method find them, and only them ----------
// The flags of each made-up choice are real ones (the choices read, drawn again and again), so distances, owners, known
// and hidden enemies are as the server's rounds have them; only who chose what is made up: honest players by the model's
// weights, each with his own game sense (known enemies avoided more or less - and the hidden ones a third as much: a
// good player reads sound and timing too), cheaters the same plus a pull away from hidden enemies.
const isQ = q => q != null && q < 0.05;
export function makeArchive(T, { players: NP = 300, cheat = 0.05, pull = [0.4, 0.8, 1.5], seed = 11, styleSd = 0.5, traitSd = 0.15 } = {}) {
  const rnd = mulberry(seed), gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const { P } = design(T); const M = fit(T, P), b = M.b.slice(0, BASE.length).concat(new Array(P - BASE.length).fill(0));
  const kIdx = BASE.indexOf('known enemies there'), people = [], D = [];
  for (let k = 0; k < NP; k++) {
    const rounds = Math.max(1, Math.floor(Math.exp(rnd() * Math.log(300)))), n = Math.max(1, Math.round(rounds * (2 + 4 * rnd())));   // (1 to 300 rounds - a few regulars, many who come now and then - 2-6 choices a round)
    const skill = 0.35 * gauss(), cheater = rnd() < cheat, g = cheater ? pull[Math.floor(rnd() * pull.length)] : 0;
    const trait = cheater ? 0 : traitSd * gauss();   // (an honest player's own luck with hidden enemies, apart from his game sense: a squad that talks, ...)
    const who = { nick: 'p' + k, cheater, pull: g, skill, trait, n }; people.push(who);
    const bi = b.map((v, q) => q < BASE.length ? v + styleSd * gauss() : v);   // (his own way of choosing: far or near flags, with team mates or alone, ...)
    for (let j = 0; j < n; j++) {
      const t = T[Math.floor(rnd() * T.length)], u = t.X.map((r, c) => dotRow(bi, r) - skill * Math.log1p(t.cands[c].kn) * 2 - (skill / 3 + trait + g) * hidOf(t.cands[c])), m = Math.max(...u), e = u.map(v => Math.exp(v - m)), s = e.reduce((a, v) => a + v, 0);
      let x = rnd() * s, c = 0; while (c < e.length - 1 && (x -= e[c]) > 0) c++;
      D.push({ ...t, nick: who.nick, name: who.nick, round: 'sim' + k + '_' + Math.floor(j * rounds / n), date: String(Math.floor(j * rounds / n)).padStart(5, '0'), ch: c, X: undefined });
    }
  }
  return { D, people };
}
export function selfTest(T, { players: NP = 300, cheat = 0.05, pull = [0.4, 0.8, 1.5], seed = 11, min = 15, detail = false, styleSd = 0.5, traitSd = 0.15, style = true } = {}) {
  const { D, people } = makeArchive(T, { players: NP, cheat, pull, seed, styleSd, traitSd });
  const A = analyse(D, { min, style }), by = new Map(A.L.map(o => [o.nick, o])), R = people.filter(p => by.get(p.nick)?.ranked);
  const auc = key => { const pos = R.filter(p => p.cheater).map(p => by.get(p.nick)[key]), neg = R.filter(p => !p.cheater).map(p => by.get(p.nick)[key]); let w = 0; for (const a of pos) for (const c of neg) w += a > c ? 1 : a === c ? 0.5 : 0; return pos.length && neg.length ? w / (pos.length * neg.length) : null; };
  const fl = R.filter(p => isQ(by.get(p.nick).q)), tp = fl.filter(p => p.cheater).length;
  const byPull = pull.map(g => { const c = R.filter(p => p.cheater && p.pull === g); return { pull: g, cheaters: c.length, found: c.filter(p => isQ(by.get(p.nick).q)).length }; });
  const byN = [[15, 40], [40, 100], [100, 250], [250, 1e9]].map(([lo, hi]) => { const c = R.filter(p => p.cheater && by.get(p.nick).tell >= lo && by.get(p.nick).tell < hi); return { tell: hi < 1e9 ? `${lo}-${hi - 1}` : `${lo}+`, cheaters: c.length, found: c.filter(p => isQ(by.get(p.nick).q)).length }; });
  const top = R.filter(p => !p.cheater).sort((x, y) => by.get(y.nick).zR - by.get(x.nick).zR).slice(0, 3).map(p => ({ skill: +p.skill.toFixed(2), trait: +p.trait.toFixed(2), tell: by.get(p.nick).tell, zHid: +by.get(p.nick).z.toFixed(2), zBeyond: +by.get(p.nick).zR.toFixed(2) }));
  const r = { templates: T.length, choices: D.length, players: NP, ranked: R.length, cheaters: R.filter(p => p.cheater).length, aucHidden: auc('z'), aucBeyond: auc('zR'), aucKnown: auc('zKn'), flagged: fl.length, truePos: tp, falsePos: fl.length - tp, byPull, byN, topHonest: top, slope: +A.nul.slope.toFixed(3) };
  if (detail) r.cheaterList = R.filter(p => p.cheater).map(p => { const o = by.get(p.nick); return { pull: p.pull, tell: o.tell, z: +o.z.toFixed(2), zR: +o.zR.toFixed(2), p: +o.p.toExponential(1), q: o.q == null ? null : +o.q.toFixed(3) }; });
  if (detail) r.null = A.nul;
  if (detail) r.falseList = R.filter(p => !p.cheater && isQ(by.get(p.nick).q)).map(p => { const o = by.get(p.nick); return { skill: +p.skill.toFixed(2), trait: +p.trait.toFixed(2), tell: o.tell, zH: +o.zH.toFixed(2), I: +o.vH.toFixed(1), z: +o.z.toFixed(2), zKn: +o.zKn.toFixed(2), zR: +o.zR.toFixed(2) }; });
  return r;
}

// the admins' file: data/.admin/choices.json (served to a logged-in admin as the analysis's other files)
// one run's players: ranked first by beyond; the most telling moments of those with 5 or more telling choices (each with
// its server, and per flag: name, distance, hidden on it, hidden on the way in, known, his own odds in %)
function playersJson(A) {
  return A.L.filter(o => o.tell > 0).sort((x, y) => y.zR - x.zR).map(o => ({ nick: o.nick, name: o.name, rounds: o.rounds, choices: o.n, telling: o.tell, emptiest: o.hit, foretold: +o.E.toFixed(2), ratio: o.ratio == null ? null : +o.ratio.toFixed(3), shrunk: +o.shrunk.toFixed(3), ci: o.ci.map(v => +v.toFixed(3)), avoided: +(o.exp - o.met).toFixed(2), z: +o.z.toFixed(3), zKnown: +o.zKn.toFixed(3), zBeyond: +o.zR.toFixed(3), lost: o.lost, lostShare: +o.lostShare.toFixed(3), p: +o.p.toExponential(3), q: o.q == null ? null : +o.q.toFixed(4), ranked: o.ranked,
    moments: o.tell < 5 ? [] : o.moments.sort((x, y) => y.why - x.why).slice(0, 10).map(m => { const pp = m.d.pS || m.d.p || []; return { round: m.round, t: m.t, map: m.map, date: m.date, server: m.d.server || '', chosen: m.d.ch, died: m.d.died || 0, cands: m.d.cands.map((c, k) => [c.fn, c.d, c.unk, c.far, c.kn, Math.round((pp[k] || 0) * 100)]), link: linkOf(m.round, m.t, o.name) }; }) }));
}
const nulJson = N => Object.fromEntries(Object.entries(N).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(4) : v]));
export function choicesJson(A, D, st, min) {
  const tell = D.filter(d => d.s.tell).length;
  return { v: CHOICES_V, at: new Date().toISOString(), rounds: st.rounds, choices: D.length, telling: tell, followed: st.followed, min,
    weights: Object.fromEntries(BASE.map((k, i) => [k, +A.M.b[i].toFixed(3)])), flagDraws: A.fx.size, pseudoR2: +A.pseudoR2.toFixed(3), null: nulJson(A.nul), players: playersJson(A) };
}
// (v250) each server on its own too (its own model, its own spread of everyone's - a server's own crowd and ways): a
// server's admin sees his servers' only (admin.mjs). Servers with fewer than 100 choices: left out
export function byServerJson(D, min) {
  const by = new Map(); for (const d of D) { const k = d.server || ''; if (!by.has(k)) by.set(k, []); by.get(k).push(d); }
  const out = {};
  for (const [sv, L] of by) {
    if (!sv || L.length < 100) continue;
    const S = L.map(d => ({ ...d, X: undefined, p: undefined, pS: undefined, s: undefined, s2: undefined })), A = analyse(S, { min });
    out[sv] = { rounds: new Set(S.map(d => d.round)).size, choices: S.length, telling: S.filter(d => d.s.tell).length, pseudoR2: +A.pseudoR2.toFixed(3), null: nulJson(A.nul), players: playersJson(A) };
  }
  return out;
}
const writeJson = (f, J) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(J)); fs.renameSync(f + '.tmp', f); };
// (analyze.mjs --auto, after the hints over every player's rounds) the admins' file again, when a round's file is newer
// than it - at most once an hour (some seconds for thousands of rounds)
export function runChoices({ dir = path.join(ROOT, 'analysis', 'rounds'), data = path.join(ROOT, 'data'), out = path.join(data, '.admin', 'choices.json'), min = 15, every = 3600e3, force = false, log = () => {} } = {}) {
  let made = 0; try { made = fs.statSync(out).mtimeMs; } catch (e) {}
  if (!force && made && Date.now() - made < every) return null;
  let newest = 0; try { for (const f of fs.readdirSync(dir)) if (f.endsWith('.json.gz')) newest = Math.max(newest, fs.statSync(path.join(dir, f)).mtimeMs); } catch (e) { log('flag choices: no analysed rounds'); return null; }
  if (!force && made && newest <= made) return null;
  const t0 = Date.now(), { D, st, lost } = readChoices(dir, countedFiles(data));
  if (D.length < 20) { log(`flag choices: ${D.length} choices so far (${st.noC} rounds analysed before v249) - too few, not written`); return null; }
  const A = analyse(D, { min, lost }), J = choicesJson(A, D, st, min);
  J.byServer = byServerJson(D, min);
  // (v250) the checks (placebo, split halves, peeking put in, the trusted players) once a day - some minutes on a big site
  let old = null; try { old = JSON.parse(fs.readFileSync(out, 'utf8')).check || null; } catch (e) {}
  if (old && old.at && Date.now() - Date.parse(old.at) < 24 * 3600e3) J.check = old;
  else { try { const tc = Date.now(); J.check = check(D, min, lost, { runs: 10, reps: 3, trusted: trustedNicks(data) }); J.check.ms = Date.now() - tc; } catch (e) { log('flag choices: the check went wrong:', e.message); } }
  writeJson(out, J);
  log(`flag choices: ${st.rounds} rounds, ${D.length} choices (${J.telling} telling), ${A.nul.ranked} players ranked, ${J.players.filter(p => isQ(p.q)).length} at q < 0.05; ${Object.keys(J.byServer).length} servers on their own${J.check && J.check !== old ? `; checked (placebo: ${J.check.placebo.flaggedAtQ05} flagged)` : ''}; ${Math.round((Date.now() - t0) / 1000)} s`);
  return J;
}

if (import.meta.url === 'file://' + process.argv[1] || process.argv[1]?.endsWith('choices.mjs')) {
  const num = (k, d) => { const v = Number(val(k, '')); return val(k, '') !== '' && Number.isFinite(v) ? v : d; };
  const dir = val('--dir', path.join(ROOT, 'analysis', 'rounds')), min = num('--min', 15), top = num('--top', 30);
  const maps = val('--maps', '') ? new Set(val('--maps', '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean)) : null;
  const flt = has('--dir') ? {} : countedFiles();   // (an archive elsewhere: every file in it)
  const { D, st, lost } = readChoices(dir, { maps, since: val('--since', ''), until: val('--until', ''), all: has('--all'), arrived: has('--arrived'), ...flt });
  console.log(`${st.rounds} rounds with choices (${st.noC} analysed before v249 - none yet${st.copies + st.dupes ? `; ${st.copies + st.dupes} copies of other rounds left out` : ''}${st.unlisted ? `, ${st.unlisted} no more listed` : ''}), ${D.length} choices of players (${has('--arrived') ? 'killed on the way left out' : st.died + ' of them killed on the way'}; ${st.followed} squad members who followed their leader${has('--all') ? ' - counted' : ' - left out'}, ${st.bots} of bots)`);
  if (has('--selftest')) {
    const T = D.filter(d => d.cands.length >= 2); if (T.length < 20) { console.log('too few choices to make an archive up from'); process.exit(0); }
    for (const seed of [11, 12, 13]) { const r = selfTest(T, { seed, players: num('--players', 300), cheat: num('--cheat', 0.05), styleSd: num('--style', 0.5), traitSd: num('--trait', 0.15), min, detail: has('--detail') }); console.log(JSON.stringify(r)); }
    process.exit(0);
  }
  if (D.length < 20) { console.log('too few choices to compare: let the background analysis go over more rounds'); process.exit(0); }
  const A = analyse(D, { min, lost }), J = choicesJson(A, D, st, min), N = A.nul;
  console.log(`telling choices (the flags differed in hidden enemies): ${J.telling}; the model: ${A.P} weights (${A.fx.size} flag draws), pseudo-R² ${A.pseudoR2.toFixed(3)}, ${A.fitMs} ms`);
  console.log('weights: ' + BASE.map((k, i) => `${k} ${A.M.b[i].toFixed(2)}`).join(' · '));
  console.log(`players ranked (${min}+ telling choices): ${N.ranked}; ` + (N.plain ? 'under 30: the plain z and no q (the spread of everyone\'s needs more players)\n' : `everyone's lean ${N.m.toFixed(3)} a choice, spread ${N.a.toFixed(2)} + ${N.t2.toFixed(3)} × information; the known z takes off ${N.slope.toFixed(2)} of its rise\n`));
  if (N.ranked) console.log(table(A.L, top) + '\n');
  console.log('emptiest: how often he picked the flag with the fewest hidden enemies / how often his odds would; x/E their ratio, shrunk to everyone\'s with its 90% range;\navoided: hidden enemies foretold minus met; z hid: against the spread of everyone\'s; z kn: the same for the known enemies (his reading of the game);\nbeyond: z hid less what his z kn foretells (the ranking); lost: his trips that ended in his death with the flag not known; q: false discovery over the ranked players');
  const nk = val('--nick', '');
  if (nk) {
    const o = A.L.find(x => x.nick.toLowerCase() === nk.toLowerCase() || x.name.toLowerCase() === nk.toLowerCase());
    if (!o) console.log('\nno such player: ' + nk);
    else {
      console.log(`\n${o.name}: ${o.n} choices in ${o.rounds} rounds, ${o.tell} telling; emptiest ${o.hit} / ${o.E.toFixed(1)} foretold (p ${o.pHit.toExponential(1)}), avoided ${(o.exp - o.met).toFixed(1)} hidden enemies; z ${o.z.toFixed(2)}, known ${o.zKn.toFixed(2)}, beyond ${o.zR.toFixed(2)}${o.q != null ? ', q ' + o.q.toFixed(3) : ''}; killed on the way, flag not known: ${o.lost}`);
      for (const m of o.moments.sort((x, y) => y.why - x.why).slice(0, 15)) {
        const d = m.d, pp = d.pS || d.p, fl = (d.died ? '(killed on the way) ' : '') + d.cands.map((c, k) => `${k === d.ch ? '>' : ' '}${c.fn} ${c.d} m: ${c.unk}+${c.far} hidden, ${c.kn} known, odds ${(pp[k] * 100).toFixed(0)}%`).join(' | ');
        console.log(`  ${m.date} ${m.map} ${Math.round(m.t)} s  ${fl}\n    ${linkOf(m.round, m.t, o.name)}`);
      }
    }
  }
  const outF = val('--out', path.join(ROOT, 'data', '.admin', 'choices.json'));
  if (has('--check')) {
    const C = check(D, min, lost, { trusted: has('--dir') ? null : trustedNicks() }); J.check = C;
    console.log('\ncheck:');
    console.log(`  split halves (each player's rounds, every other one): ${C.split.players} players, r = ${C.split.r ?? '-'} for the hidden enemies (a real trait keeps its place), ${C.split.rKnown ?? '-'} for the known ones`);
    console.log(`  placebo (hidden enemies shuffled among choices of the same flags and side, ${C.placebo.runs} times): ${C.placebo.flaggedAtQ05} flagged at q < 0.05 in ${C.placebo.runsWithAny} runs of ${C.placebo.runs} (of ${C.placebo.playerRuns} player-runs); beyond: mean ${C.placebo.zMean}, spread ${C.placebo.zSd} (should be ~0 and ~1), over 3: ${C.placebo.over3}`);
    for (const r of C.inject) console.log(`  peeking put in, ${Math.round(r.share * 100)}% of telling choices: found at p < 0.01 in ${(r.detectedP01 * 100).toFixed(0)}% of ${r.runs} runs (p < 0.001: ${(r.detectedP001 * 100).toFixed(0)}%), his z ${r.medianZ.toFixed(1)} in the middle`);
    for (const r of C.byChoices) console.log(`  with ${r.tell} telling choices (${r.players} players), 30% peeked: found at p < 0.01 in ${r.detectedP01At30pct == null ? '-' : (r.detectedP01At30pct * 100).toFixed(0) + '%'}`);
    console.log(`  killed on the way with the flag not known: ${C.lost.share == null ? '-' : Math.round(C.lost.share * 100) + '%'} of a player's trips in the middle; its link to beyond r = ${C.lost.r ?? '-'} (should be ~0)`);
    if (C.trusted) console.log(`  the trusted players (${C.trusted.listed} on the list, ${C.trusted.ranked} ranked): ${C.trusted.flaggedAtQ05} at q < 0.05, ${C.trusted.over2} with beyond over 2, beyond ${C.trusted.zMedian ?? '-'} in the middle (should be ~0)`);
  }
  if (outF !== '-') { J.byServer = byServerJson(D, min); try { writeJson(outF, J); console.log('\nwritten: ' + outF + ` (and ${Object.keys(J.byServer).length} servers on their own)`); } catch (e) { console.log('\nnot written (' + e.message + ')'); } }
}
