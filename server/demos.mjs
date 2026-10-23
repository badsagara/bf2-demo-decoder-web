// BF2 Round Replay - (v186, todo 230) which demos to keep. A round on the site lives in its decoded file (data/rounds/
// *.bfr, 5-7 MB): the map, the stats, the hints, the player pages. Its demo (data/demos, 20-35 MB - ~80% of the room a
// round takes) is needed only to decode it again when the decoder changes (as for the SF rounds in v185) and for a clip
// for the game. So old demos may go and their rounds stay - with what the admin page sets (data/.demos.json):
//   keepDays     the demos of the last N days stay (by when the round was played, not when it was downloaded); 0 = no
//                demo goes for its age (BF2R_RAW_KEEP_DAYS in /etc/bf2replay.conf, when above 0, wins)
//   keepUnlisted (v226) the days never remove a demo no page lists (any more): it could not come back, and its round
//                could never be decoded again (as 289 Lost-Soldiers rounds after v225) - only maxGB (the oldest first)
//                or a nearly full disk does
//   maxGB        the demos may take at most this much; over it the least needed go first (0 = no limit)
//   keepHinted   the demos of rounds with hints for admins stay (the background analysis: data/.hint-rounds.json;
//                while it runs, a round it has not looked at yet waits for it)
//   refetch      when the decoder changes, a round whose demo is gone is downloaded again from its demo page while the
//                page still lists it (fetch.mjs: data/.source-list.json, data/.refetch.json), decoded, and its demo goes
//                again; refetchPerRun at a time
//   keep         { round name: when }: demos kept whatever the rest says (the admin page's list)
// Never removed: a demo of a round made by an older decoder (it is decoded again from it first). Removed first: those
// whose page still lists them (they can come back), those the analysis found nothing in, the oldest.
// ingest.mjs removes them (after decoding, every run); the admin page shows the same plan before it is saved.
import fs from 'node:fs';
import path from 'node:path';

export const DEMOS_FILE = '.demos.json', HINT_ROUNDS_FILE = '.hint-rounds.json', SOURCE_LIST_FILE = '.source-list.json', REFETCH_FILE = '.refetch.json', DEMOS_LAST_FILE = '.demos-last.json';
export const DEMO_DEFAULTS = { keepDays: 0, maxGB: 0, keepHinted: true, keepUnlisted: true, refetch: true, refetchPerRun: 20 };
const GB = 2 ** 30, DAY = 86400e3, ANALYSIS_ALIVE = 3 * DAY;
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
export const linkId = n => String(n || '').replace(/\.bf2demo(\.gz)?$/i, '');

// the settings: the admin page's, with BF2R_RAW_KEEP_DAYS (when above 0) over keepDays
export function demoPolicy(DATA, opt) {
  const j = readJson(path.join(DATA, DEMOS_FILE), {}) || {}, num = (v, d, lo, hi) => { const n = +v; return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const conf = Math.max(0, Math.floor(+opt('BF2R_RAW_KEEP_DAYS', '0')) || 0);
  return {
    keepDays: conf || Math.floor(num(j.keepDays, DEMO_DEFAULTS.keepDays, 0, 3650)), keepDaysConf: conf || null,
    maxGB: num(j.maxGB, DEMO_DEFAULTS.maxGB, 0, 1e5), keepHinted: j.keepHinted ?? DEMO_DEFAULTS.keepHinted, keepUnlisted: j.keepUnlisted ?? DEMO_DEFAULTS.keepUnlisted,
    refetch: j.refetch ?? DEMO_DEFAULTS.refetch, refetchPerRun: Math.floor(num(j.refetchPerRun, DEMO_DEFAULTS.refetchPerRun, 1, 500)),
    keep: j.keep && typeof j.keep === 'object' ? j.keep : {}, set: j.set || null
  };
}
// the rounds the analysis looked at: { alive (it ran in the last 3 days), rounds: Map(name -> [kinds of hints for admins]) }
export function hintRounds(DATA) {
  const j = readJson(path.join(DATA, HINT_ROUNDS_FILE), null);
  return { alive: !!(j && j.at && Date.now() - Date.parse(j.at) < ANALYSIS_ALIVE), at: j?.at || null, rounds: new Map(Object.entries(j?.rounds || {})) };
}
// the demos the demo pages list now (fetch.mjs, every run): Map(file name -> address)
export function sourceList(DATA) {
  const j = readJson(path.join(DATA, SOURCE_LIST_FILE), null), out = new Map();
  for (const h of Object.values(j?.hosts || {})) for (const [f, u] of Object.entries(h.files || {})) out.set(f, u);
  return out;
}
const playedAt = r => { const d = Date.parse(String(r.sum?.date || '').replace(' ', 'T') + 'Z'); return Number.isFinite(d) ? d : Date.parse(r.added || '') || 0; };

// what goes now. rounds: the full list (with demo, bytes, decoder, sum); has(name): the demo file is there (default: the
// round says so); emergency: bytes to free whatever the settings say (a nearly full disk) - then also the recent and
// hinted ones, oldest first (never the kept list nor a round waiting to be decoded again)
export function demoPlan({ rounds, policy, hash, hints, source, has = r => !!r.demo, emergency = 0, now = Date.now() }) {
  const P = policy, H = hints || { alive: false, rounds: new Map() }, S = source || new Map(), pin = new Set(Object.keys(P.keep || {}).map(linkId));
  const cut = P.keepDays > 0 ? now - P.keepDays * DAY : -Infinity;
  const why = { pinned: 0, pending: 0, recent: 0, hinted: 0, waiting: 0, unlisted: 0 }, free = [], recent = [], hinted = [], waiting = [], unl = [];
  let total = 0, n = 0;
  for (const r of rounds) {
    if (!has(r)) continue;
    const b = r.bytes || 0, at = playedAt(r), o = { r, name: r.name, bytes: b, at, back: S.has(r.name) }; total += b; n++;
    if (pin.has(linkId(r.name))) { why.pinned++; continue; }
    if (hash && r.decoder && r.decoder !== hash) { why.pending++; continue; }
    const hk = H.rounds.get(r.name);
    if (P.keepHinted && hk && hk.length) { why.hinted++; hinted.push(o); continue; }
    if (P.keepDays > 0 && at >= cut) { why.recent++; recent.push(o); continue; }   // (0 days: none is kept for being recent)
    if (P.keepHinted && H.alive && !hk) { o.waiting = true; why.waiting++; waiting.push(o); continue; }
    free.push(o);
  }
  // the least needed first: those that can come back, the oldest
  const order = (a, b) => (b.back - a.back) || (a.at - b.at);
  free.sort(order); waiting.sort(order); recent.sort((a, b) => a.at - b.at); hinted.sort((a, b) => a.at - b.at);
  const out = []; let left = total;
  const take = (o, w) => { out.push({ name: o.name, bytes: o.bytes, at: o.at, back: o.back, why: w }); left -= o.bytes; };
  // (older than keepDays, nothing keeps it; v226: unless no page lists it - then only the limit or the disk takes it)
  if (P.keepDays > 0) for (const o of free) { if (P.keepUnlisted && !o.back) { why.unlisted++; unl.push(o); } else take(o, 'age'); }
  const rest = P.keepDays > 0 ? unl : free.slice();
  if (P.maxGB > 0) for (const o of rest.concat(waiting)) { if (left <= P.maxGB * GB) break; take(o, 'limit'); }
  let need = emergency;
  if (need > 0) {
    const got = out.reduce((s, x) => s + x.bytes, 0); need -= got;
    const done = new Set(out.map(x => x.name));
    for (const o of rest.concat(waiting, recent, hinted)) { if (need <= 0) break; if (done.has(o.name)) continue; take(o, 'disk'); need -= o.bytes; }
  }
  return {
    remove: out, kept: why, demos: n, bytes: total, after: left, back: out.filter(x => x.back).length,
    over: P.maxGB > 0 && left > P.maxGB * GB   // (the kept ones alone are over the limit)
  };
}
// (v226) the rounds an older decoder made, split: with their demo here (decoded again by ingest --reprocess), to download
// again (their page lists them, not empty; refetch on), and those that cannot be decoded again by themselves (no demo,
// no page lists it any more, an empty round, or no decoder at all)
export function oldRounds({ rounds, hash, source, has = r => !!r.demo, refetch = true }) {
  const S = source || new Map(), o = { old: 0, here: 0, back: 0, stuck: 0 };
  for (const r of rounds) {
    if (r.decoder === hash) continue; o.old++;
    if (has(r)) o.here++; else if (refetch && r.decoder && r.sum && !r.sum.empty && S.has(r.name)) o.back++; else o.stuck++;
  }
  return o;
}
// the rounds whose demo is gone and that the decoder has changed for, with the address their page lists them at
export function refetchWanted({ rounds, hash, source, has = r => !!r.demo }) {
  const S = source || new Map(), out = [];
  for (const r of rounds) if (!has(r) && r.decoder && r.decoder !== hash && r.sum && !r.sum.empty && S.has(r.name)) out.push([r.name, S.get(r.name), playedAt(r)]);
  return out.sort((a, b) => b[2] - a[2]).map(([name, url]) => ({ name, url }));
}
