// BF2 Round Replay - (v176) the site's round list, data/rounds.json, compact: what every visit of the site loads. One
// array a round instead of an object (the columns are named in the file: compact), its server and its teams as numbers
// into the file's own lists (servers, teams), the length in whole seconds (cut, as the page shows it: m:ss); what the page can work out is left out - the
// demo's place (demos/<name>), the decoded round's (rounds/<name>.<decoder>.bfr), its decoder (the file's) - and the
// server's own figures (sizes, when it came) are only in data/.rounds-full.json. What is not as usual goes in the
// round's last element (x): demo (0: gone; or another place), bfr, d (another decoder), se (empty), s (other summary
// figures), o (other fields). ~3 times smaller than v166's (6000 rounds: 3.1 MB -> ~1 MB, ~400 -> ~160 KB sent).
// The page (expandIndex, the same rule) and the server's scripts turn it back into the usual objects.
// (v264) rounds.json only the fresh rounds, the older ones a file a month: writeRoundLists below.
import crypto from 'node:crypto';
// (v231) SUM_V: how a round is summed up (ingest.mjs summarize - its history is there); a round summed up by an older
// one is summed up again from its .bfr. Here, so digest.mjs knows it too: a summary waits while its rounds are redone
export const SUM_V = 20;   // (v255: a kill by a man the demo had no soldier for - no distance, not a vehicle's on the bullet's line; v254: a squad's leader the one made so last; kills from a vehicle's seat measured from the vehicle - ingest.mjs; v234: the sights' zoom as the view's height)
export const IDX_COLS = ['name', 'date', 'map', 'server', 'duration', 'players', 'kills', 'teams', 'tickets', 'winner', 'top', 'x'];
const SUM_KEYS = new Set(['date', 'map', 'server', 'duration', 'empty', 'players', 'kills', 'teams', 'tickets', 'winner', 'top']);
const ENTRY_KEYS = new Set(['name', 'demo', 'bfr', 'decoder', 'sum']), SERVER_ONLY = new Set(['bytes', 'bfrBytes', 'added', 'resumAt']);   // (v206: resumAt - when "Recalculate all records" did it)
const baseOf = name => String(name).replace(/\.bf2demo(\.gz)?$/i, '');

// entries as data/.rounds-full.json has them (sum without its players' lines and kills) -> the compact list
export function compactIndex(head, rounds) {
  const servers = [], teams = [], sIdx = new Map(), tIdx = new Map();
  const num = (L, M, v) => { const k = JSON.stringify(v); if (!M.has(k)) { M.set(k, L.length); L.push(v); } return M.get(k); };
  const rows = rounds.map(r => {
    const s = r.sum, x = {};
    if (r.demo !== 'demos/' + r.name) x.demo = r.demo || 0;
    if ((r.decoder || null) !== (head.decoder || null)) x.d = r.decoder || 0;
    if (r.bfr !== (r.decoder ? `rounds/${baseOf(r.name)}.${r.decoder}.bfr` : undefined)) x.bfr = r.bfr || 0;
    const o = {}; for (const [k, v] of Object.entries(r)) if (!ENTRY_KEYS.has(k) && !SERVER_ONLY.has(k)) o[k] = v; if (Object.keys(o).length) x.o = o;
    if (!s) { x.nosum = 1; return [r.name, null, null, -1, null, null, null, -1, null, null, null, x]; }
    if (s.empty) x.se = 1;
    const os = {}; for (const [k, v] of Object.entries(s)) if (!SUM_KEYS.has(k)) os[k] = v; if (Object.keys(os).length) x.s = os;
    const row = [r.name, s.date ?? null, s.map ?? null, s.server != null ? num(servers, sIdx, s.server) : -1, s.duration != null ? Math.floor(s.duration) : null,
      s.players ?? null, s.kills ?? null, s.teams ? num(teams, tIdx, s.teams) : -1, s.tickets ?? null, s.winner ?? null, s.top ? [s.top.name, s.top.score, s.top.team] : null];
    if (Object.keys(x).length) row.push(x);
    return row;
  });
  return { ...head, version: 3, slim: true, compact: IDX_COLS, servers, teams, rounds: rows };
}

// the compact list -> entries as before (a list that is not compact is left as it is)
export function expandIndex(d) {
  if (!d || !Array.isArray(d.compact) || !Array.isArray(d.rounds)) return d;
  const c = Object.fromEntries(d.compact.map((k, i) => [k, i])), S = d.servers || [], T = d.teams || [];
  d.rounds = d.rounds.map(a => {
    if (!Array.isArray(a)) return a;
    const at = k => c[k] === undefined ? undefined : a[c[k]], x = at('x') || {}, name = at('name');
    const decoder = 'd' in x ? x.d || undefined : d.decoder || undefined, r = { name };
    if (!('demo' in x)) r.demo = 'demos/' + name; else if (x.demo) r.demo = x.demo;
    if (!('bfr' in x)) { if (decoder) r.bfr = `rounds/${baseOf(name)}.${decoder}.bfr`; } else if (x.bfr) r.bfr = x.bfr;
    if (decoder) r.decoder = decoder;
    Object.assign(r, x.o || {});
    if (!x.nosum) {
      const si = at('server'), ti = at('teams'), top = at('top');
      r.sum = { date: at('date'), map: at('map'), server: si >= 0 ? S[si] : undefined, duration: at('duration'), empty: !!x.se, players: at('players'), kills: at('kills'),
        teams: ti >= 0 ? T[ti] : undefined, tickets: at('tickets'), winner: at('winner'), top: top ? { name: top[0], score: top[1], team: top[2] } : null, ...(x.s || {}) };
    }
    return r;
  });
  return d;
}

// ---------- (v264, todo 193) the list in pages: the fresh rounds in rounds.json, the older ones a file a month ----------
// rounds.json (what every visit loads first) has the rounds of the newest round's last FRESH_DAYS days (BF2R_FRESH_DAYS,
// 14; at least BF2R_FRESH_MIN rounds, 200); each older month is data/list/<YYYY-MM>.json, compact the same way (its own
// servers and teams), and rounds.json names them: months [{ m, n, v }], newest first - n its rounds, v its file's hash
// (the page asks for list/<m>.json?v=<v>: a browser keeps a month until its rounds change); first - the oldest round's
// day; total - every round listed. The page loads a month when something needs it (server/INSTALL.md §18, v264).
export const LIST_DIR = 'list';
export const monthOf = r => { const m = /^(\d{4}-\d\d)-\d\d/.exec(r?.sum?.date || ''); return m ? m[1] : null; };
// rounds (newest first, as the list keeps them) -> { fresh, months: [[m, rounds]] newest first }
export function splitFresh(rounds, days = 14, min = 200, now = Date.now()) {
  let top = null; for (const r of rounds) if (monthOf(r)) { top = r.sum.date.slice(0, 10); break; }
  if (!top) return { fresh: rounds, months: [] };
  const soon = new Date(now + 864e5).toISOString().slice(0, 10); if (top > soon) top = soon;   // (a game server's clock years ahead: not the whole list "old")
  const c = new Date(top + 'T00:00:00Z'); c.setUTCDate(c.getUTCDate() - Math.max(0, days)); const cut = c.toISOString().slice(0, 10);
  const fresh = [], M = new Map();
  rounds.forEach((r, i) => { const m = monthOf(r); if (!m || i < min || r.sum.date.slice(0, 10) >= cut) fresh.push(r); else { if (!M.has(m)) M.set(m, []); M.get(m).push(r); } });
  return { fresh, months: [...M].sort((a, b) => b[0].localeCompare(a[0])) };
}
const LIST_V = new Map();   // a month's file -> its hash as last written (the light writes after each demo: only a changed month again)
const putFile = (fs, f, text) => { fs.writeFileSync(f + '.tmp', text); fs.renameSync(f + '.tmp', f); };
// head (the list's own fields) and its rounds (the site's lines: slim) -> data/list/<m>.json and data/rounds.json
export function writeRoundLists(fs, path, DATA, head, rounds, { days = 14, min = 200 } = {}) {
  const dir = path.join(DATA, LIST_DIR), { fresh, months } = splitFresh(rounds, days, min), ML = [];
  if (months.length) fs.mkdirSync(dir, { recursive: true });
  for (const [m, L] of months) {
    const body = JSON.stringify(compactIndex({ month: m, decoder: head.decoder }, L)), v = crypto.createHash('sha1').update(body).digest('hex').slice(0, 10), f = path.join(dir, m + '.json');
    if (LIST_V.get(f) !== v) { let old = null; try { old = fs.readFileSync(f, 'utf8'); } catch (e) {} if (old !== body) putFile(fs, f, body); LIST_V.set(f, v); }
    ML.push({ m, n: L.filter(r => !r.empty).length, v });
  }
  let first = null; for (let i = rounds.length - 1; i >= 0 && !first; i--) if (monthOf(rounds[i])) first = rounds[i].sum.date.slice(0, 10);
  // (the months first: rounds.json never names a file not written yet)
  putFile(fs, path.join(DATA, 'rounds.json'), JSON.stringify(compactIndex({ ...head, ...(ML.length ? { months: ML, first, total: rounds.length } : {}) }, fresh)));
  try { for (const f of fs.readdirSync(dir)) if (/^\d{4}-\d\d\.json$/.test(f) && !ML.some(x => x.m + '.json' === f)) { fs.unlinkSync(path.join(dir, f)); LIST_V.delete(path.join(dir, f)); } } catch (e) { /* no folder */ }
  return { fresh: fresh.length, months: ML };
}
// rounds.json and the months it names, as one list (expanded) - what the site has; null when there is no rounds.json
export function readPublicList(fs, path, DATA) {
  let d = null; try { d = expandIndex(JSON.parse(fs.readFileSync(path.join(DATA, 'rounds.json'), 'utf8'))); } catch (e) { return null; }
  if (!d || !Array.isArray(d.rounds)) return null;
  const seen = new Set(d.rounds.map(r => r.name));
  for (const x of Array.isArray(d.months) ? d.months : []) {
    try { const L = expandIndex(JSON.parse(fs.readFileSync(path.join(DATA, LIST_DIR, String(x.m).replace(/[^0-9-]/g, '') + '.json'), 'utf8'))); for (const r of L.rounds || []) if (!seen.has(r.name)) { seen.add(r.name); d.rounds.push(r); } } catch (e) { /* a month lost: the rest */ }
  }
  delete d.months; delete d.first; delete d.total; delete d.compact; delete d.servers; delete d.teams;
  return d;
}

// the list a script on the server works from: data/.rounds-full.json, else rounds.json and its months (expanded)
export function readRoundList(fs, path, DATA) {
  try { const d = JSON.parse(fs.readFileSync(path.join(DATA, '.rounds-full.json'), 'utf8')); if (Array.isArray(d.rounds)) return expandIndex(d); } catch (e) { /* the site's */ }
  return readPublicList(fs, path, DATA) || { rounds: [] };
}
