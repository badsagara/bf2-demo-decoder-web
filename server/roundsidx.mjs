// BF2 Round Replay - (v176) the site's round list, data/rounds.json, compact: what every visit of the site loads. One
// array a round instead of an object (the columns are named in the file: compact), its server and its teams as numbers
// into the file's own lists (servers, teams), the length in whole seconds (cut, as the page shows it: m:ss); what the page can work out is left out - the
// demo's place (demos/<name>), the decoded round's (rounds/<name>.<decoder>.bfr), its decoder (the file's) - and the
// server's own figures (sizes, when it came) are only in data/.rounds-full.json. What is not as usual goes in the
// round's last element (x): demo (0: gone; or another place), bfr, d (another decoder), se (empty), s (other summary
// figures), o (other fields). ~3 times smaller than v166's (6000 rounds: 3.1 MB -> ~1 MB, ~400 -> ~160 KB sent).
// The page (expandIndex, the same rule) and the server's scripts turn it back into the usual objects.
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

// the list a script on the server works from: data/.rounds-full.json, else rounds.json (expanded)
export function readRoundList(fs, path, DATA) {
  for (const f of ['.rounds-full.json', 'rounds.json']) { try { const d = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); if (Array.isArray(d.rounds)) return expandIndex(d); } catch (e) { /* the next */ } }
  return { rounds: [] };
}
