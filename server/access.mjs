// BF2 Round Replay (v224, Sagara: "let the admin limit the way in by a login and password, even to the page for
// watching the demos; the admin page has settings for each user: where he may go and where not") - who may open what.
//
// The rights: the parts of the site (SITE), the admins' things (the Admin tab of a round, and cards of the admin page),
// and for guests - visitors not logged in - the link previews too. Guests are kept in data/.access.json ({ guests:
// { view, list, … } }: nothing there = every part open, as before v224); each account in data/.admin-users.json has its
// own (users[name].rights). What a visitor may open: the guests' rights, and his account's on top of them (a login never
// gives less than not logged in). The site's owner may open everything.
//
// The web server asks admin.mjs about each request (/admin/api/gate: Caddy's forward_auth, nginx's auth_request) only
// while data/.access-gate is there - admin.mjs writes it when the guests may not open some part, and removes it when they
// may open all: an open site never waits for admin.mjs. needOf says which right a path needs, allowed whether rights
// have it - plain functions, the same for the gate and for the tests.
export const ACCESS_FILE = '.access.json', GATE_FILE = '.access-gate';
// [key, name, what it opens] - the parts of the site; the page hides what a visitor may not open, the web server refuses it
export const SITE = [
  ['view', 'Watch rounds', "the site's page: a round on the map, its Round stats and Weapons; a round's plain page /rounds/<round>.html"],
  ['list', 'All rounds', 'the list of rounds: the Rounds page, ‹ Newer / Older ›, /rounds/ and its months, RSS - without it a round opens only from a link to it'],
  ['players', 'Players and maps', "players' pages and comparisons, Players · all rounds, maps' pages and heat maps; /players/, /maps/"],
  ['records', 'Records', 'the Records pages /records/'],
  ['stats', 'Stats', 'clans, vehicles, the servers\' pages, search moments'],
  ['demos', 'Download demos', '⬇ Demo, and clips for the game (cut from the demo)'],
  ['clips', 'Video clips', 'the Clip button (a video or GIF made in the browser from what the page shows)'],
];
// guests only: the small pages /r/<round>, /p/<player> chat apps read for a link's card, and the map pictures of the posts
export const GUEST_EXTRA = [['share', 'Link previews', 'the cards Discord, Telegram and others show under a link to a round or a player, and the map pictures in the round posts - chat apps never log in']];
// [key, name] - the admin page's cards an account may see and use (the users and their rights: only the owner's)
export const CARDS = [
  ['rounds', 'Rounds'], ['decode', 'Being decoded'], ['disk', 'Disk, last download'], ['demos', 'Demos: what to keep'],
  ['services', 'Services'], ['analysis', 'Background analysis'], ['sources', 'Where demos come from'],
  ['posts', 'Posts about new rounds (his servers)'], ['log', 'Log'], ['hints', "Hint thresholds: the site's"],   // (v227)
];
const SITE_KEYS = SITE.map(([k]) => k), GUEST_KEYS = [...SITE_KEYS, 'share'], CARD_KEYS = CARDS.map(([k]) => k);
const all = keys => Object.fromEntries(keys.map(k => [k, true]));
// the guests' rights: as saved, a part not saved open (so a part added later is open until closed)
export function guestsOf(J) {
  const g = J && J.guests && typeof J.guests === 'object' ? J.guests : {};
  return Object.fromEntries(GUEST_KEYS.map(k => [k, g[k] !== false]));
}
// an account's rights { site: { view, … }, admin, cards: { rounds, … } }; one made before v224 (a server's admin) may
// watch everything and has the Admin tab, as he had
export function userRights(u) {
  const r = u && u.rights && typeof u.rights === 'object' ? u.rights : null;
  if (!r) return { site: all(SITE_KEYS), admin: true, cards: {}, legacy: true };
  const s = r.site && typeof r.site === 'object' ? r.site : {}, c = r.cards && typeof r.cards === 'object' ? r.cards : {};
  return { site: Object.fromEntries(SITE_KEYS.map(k => [k, s[k] === true])), admin: r.admin === true, cards: Object.fromEntries(CARD_KEYS.filter(k => c[k] === true).map(k => [k, true])) };
}
// the rights as the admin page sends them, cleaned
export function normRights(b) {
  const s = b && b.site && typeof b.site === 'object' ? b.site : {}, c = b && b.cards && typeof b.cards === 'object' ? b.cards : {};
  return { site: Object.fromEntries(SITE_KEYS.map(k => [k, !!s[k]])), admin: !!(b && b.admin), cards: Object.fromEntries(CARD_KEYS.filter(k => c[k]).map(k => [k, true])) };
}
export function normGuests(b) { const g = b && typeof b === 'object' ? b : {}; return Object.fromEntries(GUEST_KEYS.map(k => [k, !!g[k]])); }
// is the site closed to guests anywhere (so the web server has to ask)
export const gateNeeded = G => GUEST_KEYS.some(k => !G[k]);
// what a visitor may open: the guests' parts, and his account's (the owner: all)
export function siteRights(G, u, owner) {
  if (owner) return { ...all(GUEST_KEYS) };
  const R = { ...G }; if (u) { const U = userRights(u).site; for (const k of SITE_KEYS) if (U[k]) R[k] = true; }
  return R;
}
// which right a path of the site needs: 'public', a key of SITE, or one of 'any' (any part at all: the page's pictures and
// icons), 'og' (the posts' map pictures), 'shareR' / 'shareP' (a round's / a player's link preview)
export function needOf(p) {
  // (the web server matches paths without regard to case - /DATA/rounds.json is data/rounds.json to it: so here too)
  p = String(p || '/').replace(/\/{2,}/g, '/').toLowerCase();
  if (p === '/robots.txt' || p === '/favicon.ico') return 'public';
  if (p === '/' || p === '/index.html' || p === '/version.json') return 'view';
  if (p.startsWith('/assets/og/')) return 'og';
  if (p.startsWith('/assets/')) return 'any';
  if (/^\/r\/[^/]+$/.test(p)) return 'shareR';
  if (/^\/p\/[^/]+$/.test(p)) return 'shareP';
  if (p === '/data' || p.startsWith('/data/')) {
    const q = p.slice(6);
    if (q === 'rounds.json') return 'list';
    if (q === 'reprocess.json' || q.startsWith('rounds/')) return 'view';
    if (q.startsWith('demos/')) return 'demos';
    if (q.startsWith('heat/')) return 'players';
    if (q.startsWith('share/r/')) return 'shareR';
    if (q.startsWith('share/p/')) return 'shareP';
    if (q.startsWith('stats/')) {
      const s = q.slice(6);
      if (/^(server|find)\//.test(s) || ['clans.json', 'vehicles.json', 'servers.json'].includes(s)) return 'stats';
      return 'players';   // (players/, maps/, table.json, table/, names.json)
    }
    return 'view';
  }
  if (p === '/rss.xml' || p === '/sitemap.xml' || p === '/rounds' || p === '/rounds/' || p === '/rounds/index.html' || /^\/rounds\/\d{4}-\d\d\.html$/.test(p)) return 'list';
  if (p.startsWith('/rounds/')) return 'view';
  if (/^\/(players|maps)(\/|$)/.test(p)) return 'players';
  if (/^\/records(\/|$)/.test(p)) return 'records';
  return 'view';
}
export function allowed(R, need) {
  const any = R.view || R.list || R.players || R.records || R.stats || R.demos || R.share;
  if (need === 'public') return true;
  if (need === 'any') return !!any;
  if (need === 'og') return !!any;
  if (need === 'shareR') return !!(R.share || R.view);
  if (need === 'shareP') return !!(R.share || R.players);
  return !!R[need];
}
// where a refused part's visitor can still go (the login page lists them): the open parts' pages
export function openPlaces(R) {
  const L = [];
  if (R.view) L.push(['/', 'the site']); if (R.list) L.push(['/rounds/', 'all rounds']); if (R.players) L.push(['/players/', 'players']);
  if (R.records) L.push(['/records/', 'records']);
  return L;
}
