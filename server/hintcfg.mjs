// BF2 Round Replay - (v227) the hints' thresholds on the server. The page has them all (HT_SPEC in its admins' part,
// server/admin-round.js: each one's name, hint, recommended value, kind of figure, bounds); the site's set is
// data/.admin/hint-thresholds.json ({ values: { name: value }, off: [hint kinds turned off], at, by } - only what differs
// from the recommended), each admin's own set data/.admin/hint-mine.json ({ user: { values, off, on, use, at } }).
// The hint rules the background analysis works with: HINTS_V while the site's set is the recommended one, else
// HINTS_V.<hash of the set> - the same text and hash as the page's (htCanon, htHash there), so a new set sends every
// round through the analysis again. admin.mjs checks and saves the sets; analyze.mjs reads the rules.
import fs from 'node:fs';
import path from 'node:path';

export const SITE_FILE = 'hint-thresholds.json', MINE_FILE = 'hint-mine.json';
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };

// name=value;... |off=kind,...  -> FNV-1a 32, 8 hex digits (as the page)
export function htCanon(S) { const V = S?.values || {}; return Object.keys(V).sort().map(k => k + '=' + V[k]).join(';') + '|off=' + (S?.off || []).join(','); }
export function htHash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
export const htHvOf = (base, S) => S && (Object.keys(S.values || {}).length || (S.off || []).length) ? base + '.' + htHash(htCanon(S)) : base;

// the site's set as saved (data/.admin), or the recommended one (empty)
export function siteSet(DATA) { const j = readJson(path.join(DATA, '.admin', SITE_FILE), null); return j && typeof j === 'object' ? { values: j.values || {}, off: Array.isArray(j.off) ? j.off : [], at: j.at || null, by: j.by || null } : { values: {}, off: [], at: null, by: null }; }

// from the admins' part of the page: HT_SPEC (one line of JSON) and the hint kinds (ADM_KINDS)
let specCache = { mt: -1, spec: null, kinds: null };
export function pageSpec(admFile) {
  let mt = 0; try { mt = fs.statSync(admFile).mtimeMs; } catch (e) { return { spec: null, kinds: null }; }
  if (mt === specCache.mt) return specCache;
  let spec = null, kinds = null;
  try {
    const a = fs.readFileSync(admFile, 'utf8'), m = /^const HT_SPEC = (\[.*\]);$/m.exec(a); if (m) spec = JSON.parse(m[1]);
    const k = /^const ADM_KINDS = (\[.*\]);$/m.exec(a); if (k) kinds = [...k[1].matchAll(/\['([a-z]+)',/g)].map(x => x[1]);
  } catch (e) { spec = null; }
  return (specCache = { mt, spec, kinds });
}

// the hint rules with the site's set as the page takes it (cleaned by the page's spec the same way: a name no longer
// there, a figure out of its bounds or now the recommended one, a hint kind gone - left out), so that the two agree
// after a new version of the page too
export function siteHv(base, DATA, admFile) {
  const S = siteSet(DATA), P = pageSpec(admFile); if (!P.spec) return htHvOf(base, S);
  const c = checkSet(S, P, false), values = {};
  if (c.bad.length) for (const [k, x] of Object.entries(S.values || {})) { const sp = P.spec.find(q => q.k === k); if (sp && typeof x === 'number' && Number.isFinite(x) && x >= sp.mn && x <= sp.mx && (sp.t !== 'n' || Number.isInteger(x)) && x !== sp.d) values[k] = x; }
  return htHvOf(base, { values: c.bad.length ? values : c.values, off: c.off });
}

// a set sent from the page, checked against the spec: known names, numbers in bounds (whole for counts); the site's
// keeps only what differs from the recommended (keepRec: an admin's own keeps a recommended value - the site's may differ)
export function checkSet(b, P, keepRec) {
  const bad = [], values = {}, by = new Map((P.spec || []).map(s => [s.k, s])), kinds = new Set(P.kinds || []);
  if (!P.spec) return { bad: ["the page's thresholds are not there (server/admin-round.js)"] };
  for (const [k, x] of Object.entries(b && typeof b.values === 'object' && b.values ? b.values : {})) {
    const s = by.get(k); if (!s) { bad.push(k + ': no such threshold'); continue; }
    if (typeof x !== 'number' || !Number.isFinite(x) || x < s.mn || x > s.mx || (s.t === 'n' && !Number.isInteger(x))) { bad.push(`${k}: ${s.t === 'n' ? 'a whole number' : 'a number'} from ${s.mn} to ${s.mx}`); continue; }
    if (x === s.d && !keepRec) continue;
    values[k] = x;
  }
  const kl = L => [...new Set((Array.isArray(L) ? L : []).filter(k => typeof k === 'string' && kinds.has(k)))].sort();
  return { bad, values, off: kl(b && b.off), on: kl(b && b.on) };
}
