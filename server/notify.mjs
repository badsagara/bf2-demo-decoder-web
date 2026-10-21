#!/usr/bin/env node
// BF2 Round Replay - a post about each new round in a Discord channel and / or a Telegram chat: the map, when, who won
// and the tickets, how long, players and kills, the best three by score and the link to the round (chat apps show the
// map's picture under it: the link preview, data/share/r). ingest.mjs calls it after each new round it lists.
//
//   (node notify.mjs --test / --last: see below)
//
// Where to: a Discord webhook (Server settings -> Integrations -> Webhooks -> New webhook -> Copy webhook URL) and / or
// a Telegram bot (its token from @BotFather) and the chat it posts in (its id, or @channel). Set on the admin page
// (kept in data/.notify.json, which only the bf2replay user reads and the web server never serves). Nothing set:
// nothing is posted. Only rounds with BF2R_NOTIFY_MIN_PLAYERS players or more (6; the admin page's, or the server's
// own) and recorded in the last 12 hours (not old demos downloaded in a batch) are posted; demos made into clips by the
// page are not.
// (v187) What goes in a post: the admin page turns each part (POST_ITEMS) on or off for Discord and for Telegram apart
// (data/.notify.json: lines) - the best three, the server, and the round's highlights ingest.mjs sums up (sum.hl): the
// most kills on foot, in vehicles, headshots, knife, claymores, launchers on infantry, run over, explosives; the longest
// kill with a launcher, small arms, a sniper rifle and any weapon; the longest streak, the best K/D; revives, heals,
// repairs; flags; the first blood and the last one killed. All on until the admin page says otherwise.
// (v194) Each game server its own: a round is posted only where its server (the name in the demo, sum.server) is set
// up on the admin page - its own Discord webhook and / or Telegram chat (one bot, its token, for all chats), each on or
// off, with its own parts (POST_ITEMS) and, if it wants, its own fewest players. A server not set up is not posted
// (new ones show on the admin page with their rounds). data/.notify.json: { telegram: { token }, minPlayers,
// servers: { <server name>: { discord: { on, webhook, lines }, telegram: { on, chat, lines }, minPlayers, last } } }.
// The settings of before (one webhook, one chat, one set of parts) were given to every server with rounds in the
// last 30 days, once (migrated; the old ones kept as legacy). BF2R_TELEGRAM_TOKEN in /etc/bf2replay.conf still wins;
// BF2R_DISCORD_WEBHOOK / BF2R_TELEGRAM_CHAT there were only taken into that first copy.
//
//   node notify.mjs --test [server]     a test post to that server's channels (or every server's)
//   node notify.mjs --last [server]     that server's newest round again (or each server's)
import fs from 'node:fs';
import path from 'node:path';
import { readRoundList } from './roundsidx.mjs';

const conf = {};
try { for (const line of fs.readFileSync('/etc/bf2replay.conf', 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/.exec(line); if (m) conf[m[1]] = m[2]; } } catch (e) { /* no file: defaults */ }
const opt = (k, d) => process.env[k] ?? conf[k] ?? d;
const ROOT = opt('BF2R_ROOT', '/srv/bf2replay'), DATA = path.join(ROOT, 'data'), SITE = path.join(ROOT, 'site');
export const NOTIFY_FILE = path.join(DATA, '.notify.json');
const DOMAIN = opt('BF2R_DOMAIN', '').trim();
const MAX_AGE_H = 12;
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

export const DISCORD_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,200}$/;
export const TG_TOKEN_RE = /^\d{5,15}:[\w-]{30,60}$/, TG_CHAT_RE = /^(?:-?\d{3,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;

// (v187) the parts of a post: [key, name, what it is] - all on by default, for each app apart
export const POST_ITEMS = [
  ['best', 'Best three', 'the best three by score, with their side'], ['server', 'Server', "the server's name"],
  ['foot', 'Kills on foot', 'most enemies killed on foot'], ['veh', 'Kills in vehicles', 'most enemies killed from vehicles'],
  ['hs', 'Headshots', 'most headshots'], ['knife', 'Knife', 'most knife kills'], ['clay', 'Claymores', 'most claymore kills'], ['mine', 'Mines', 'most kills with AT mines'],
  ['atInf', 'Launchers on infantry', 'most soldiers on foot killed with a hand-held launcher (SRAW, Eryx, RPG-7)'],
  ['road', 'Run over', 'most soldiers run over with a vehicle'], ['expl', 'Explosives', 'most kills with grenades, grenade launchers, C4, mines, claymores'],
  ['atLong', 'Longest launcher kill', 'with a hand-held launcher'], ['smallLong', 'Longest small-arms kill', 'rifles, machine guns, pistols, shotguns - not a sniper rifle or a launcher'],
  ['snipLong', 'Longest sniper kill', 'with a sniper rifle'], ['longest', 'Longest kill', 'with any weapon, vehicles too'],
  ['streakFoot', 'Kill streak on foot', 'most kills on foot in a row without dying'], ['streakVeh', 'Kill streak in vehicles', 'most kills from vehicles in a row without dying'], ['kd', 'Best K/D', 'of those with 10 kills or more'],
  ['rev', 'Revives', 'most revives'], ['heal', 'Heals', 'most heals'], ['rep', 'Repairs', 'most repairs'],
  ['flags', 'Flags', 'most flags captured and neutralised'], ['first', 'First blood', 'the first kill of the round'], ['last', 'Last killed', 'the last soldier killed in the round']
];
const linesOf = (o) => Object.fromEntries(POST_ITEMS.map(([k]) => [k, o?.[k] !== false]));   // (missing: on)
const readNotify = () => { try { return JSON.parse(fs.readFileSync(NOTIFY_FILE, 'utf8')) || {}; } catch (e) { return {}; } };
const writeNotify = j => { const tmp = NOTIFY_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(j, null, 1) + '\n', { mode: 0o600 }); fs.renameSync(tmp, NOTIFY_FILE); };
export const NO_SERVER = '(no server name)';
export const serverOf = e => String(e?.sum?.server || '').trim() || NO_SERVER;
// (v194) the settings of before, once, to every server with rounds in the last 30 days (where they were posted to)
function migrate(j) {
  const dc = opt('BF2R_DISCORD_WEBHOOK', '') || (typeof j.discord === 'string' ? j.discord : ''), chat = opt('BF2R_TELEGRAM_CHAT', '') || j.telegram?.chat || '';
  const servers = {};
  if (dc || chat) {
    let R = []; try { R = readRoundList(fs, path, DATA).rounds || []; } catch (e) {}
    const since = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10), seen = new Set();
    for (const r of R) if (r.sum && !r.sum.empty && String(r.sum.date || '').slice(0, 10) >= since) seen.add(serverOf(r));
    for (const n of seen) servers[n] = { discord: { on: !!dc, webhook: dc, lines: { ...(j.lines?.discord || {}) } }, telegram: { on: !!chat, chat, lines: { ...(j.lines?.telegram || {}) } } };
  }
  const out = { ...j, servers, migrated: { at: new Date().toISOString(), servers: Object.keys(servers).length }, legacy: { discord: j.discord || '', chat: j.telegram?.chat || '', lines: j.lines || null } };
  delete out.discord; delete out.lines; if (out.telegram) delete out.telegram.chat;
  try { writeNotify(out); if (Object.keys(servers).length) log(`round posts: each server its own now; the old settings given to ${Object.keys(servers).length} server(s) with rounds in the last 30 days`); } catch (e) {}
  return out;
}
const srvCfg = c => ({
  discord: { on: !!c?.discord?.on, webhook: typeof c?.discord?.webhook === 'string' ? c.discord.webhook : '', lines: linesOf(c?.discord?.lines) },
  telegram: { on: !!c?.telegram?.on, chat: typeof c?.telegram?.chat === 'string' ? c.telegram.chat : '', lines: linesOf(c?.telegram?.lines) },
  minPlayers: c?.minPlayers ? Math.max(1, Math.min(64, Math.floor(+c.minPlayers))) : null, last: c?.last || null
});
// the settings: /etc/bf2replay.conf first (the bot's token, the fewest players), then the admin page's file
export function notifySettings() {
  let j = readNotify(); if (!j.servers || typeof j.servers !== 'object') j = migrate(j);
  const ct = opt('BF2R_TELEGRAM_TOKEN', ''), tok = ct || (typeof j.telegram?.token === 'string' ? j.telegram.token : '');
  const mp = Math.floor(+opt('BF2R_NOTIFY_MIN_PLAYERS', '') || +j.minPlayers || 6);
  const servers = {}; for (const [n, c] of Object.entries(j.servers || {})) servers[n] = srvCfg(c);
  return { tgToken: tok, tgTokenConf: !!ct, minPlayers: Math.max(1, Math.min(64, mp)), minPlayersConf: !!opt('BF2R_NOTIFY_MIN_PLAYERS', ''), last: j.last || null, servers,
    migrated: j.migrated || null, ignoredConf: ['BF2R_DISCORD_WEBHOOK', 'BF2R_TELEGRAM_CHAT'].filter(k => opt(k, '')) };
}
// change: { telegram: { token }, minPlayers, last } and / or server: name with srv: { discord: {...}, telegram: {...},
// minPlayers, last } (merged; srv null: the server's settings gone - its rounds no more posted)
export function saveNotify(change, server, srv) {
  let j = readNotify(); if (!j.servers || typeof j.servers !== 'object') j = migrate(j);
  for (const [k, v] of Object.entries(change || {})) { if (k === 'telegram') j.telegram = { ...(j.telegram || {}), ...v }; else j[k] = v; }
  if (server !== undefined) {
    if (srv === null) delete j.servers[server];
    else {
      const o = j.servers[server] || {};
      for (const app of ['discord', 'telegram']) if (srv[app]) { const a = { ...(o[app] || {}), ...srv[app] }; if (srv[app].lines) a.lines = { ...(o[app]?.lines || {}), ...srv[app].lines }; o[app] = a; }
      for (const k of ['minPlayers', 'last']) if (srv[k] !== undefined) { if (srv[k] === null) delete o[k]; else o[k] = srv[k]; }
      j.servers[server] = o;
    }
  }
  writeNotify(j);
}
// where a server's rounds go: [{ app, url | chat, lines }]
function targetsOf(S, server) {
  const c = S.servers[server], out = []; if (!c) return out;
  if (c.discord.on && c.discord.webhook) out.push({ app: 'discord', url: c.discord.webhook, lines: c.discord.lines });
  if (c.telegram.on && c.telegram.chat && S.tgToken) out.push({ app: 'telegram', chat: c.telegram.chat, lines: c.telegram.lines });
  return out;
}
const remember = (what, ok, msg, server) => { try { const last = { at: new Date().toISOString(), what, ok, msg: String(msg || '').slice(0, 300), ...(server ? { server } : {}) }; if (server && notifySettings().servers[server]) saveNotify({ last }, server, { last }); else saveNotify({ last }); } catch (e) {} };

// the maps' names, as the page has them (its GAME table)
let MAPS = null;
function mapName(m) {
  if (!MAPS) { MAPS = {}; try { const line = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8').split('\n').find(l => l.startsWith('const GAME = ')); MAPS = new Function(line.replace(/^const GAME = /, 'return ').replace(/;\s*$/, ''))().maps || {}; } catch (e) {} }
  return MAPS[String(m || '').toLowerCase()]?.name || String(m || '?').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
const when = d => { const m = /^(\d{4})-(\d\d)-(\d\d)\s+(\d\d):(\d\d)/.exec(d || ''); if (!m) return d || ''; return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) + ` ${m[4]}:${m[5]}`; };
const recent = d => { const m = /^(\d{4})-(\d\d)-(\d\d)\s+(\d\d):(\d\d)/.exec(d || ''); if (!m) return true; const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]); return Math.abs(Date.now() - t) < (MAX_AGE_H + 14) * 3600e3; };   // (the server's clock may be any time zone: ±14 h)

// the post: lines, each a list of [text, kind] - kind 'b' bold, 'l' a link, '' plain - for each app's own markup; on:
// which parts (POST_ITEMS) this app gets
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function postLines(entry, on = linesOf({})) {
  const s = entry.sum, id = entry.name.replace(/\.bf2demo(\.gz)?$/i, ''), tk = s.tickets, T = s.teams || [], H = s.hl || {};
  const won = s.winner != null && T[s.winner] ? `${T[s.winner]} won${tk ? `, tickets ${tk[0][1]} : ${tk[1][1]}` : ''}` : tk ? `tickets ${tk[0][1]} : ${tk[1][1]}` : '';
  const top = (s.P || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0) || b.k - a.k).slice(0, 3);
  const L = [[[`${mapName(s.map)} · ${when(s.date)}`, 'b']], [[[won, `${Math.round((s.duration || 0) / 60)} min`, `${s.players} players`, `${s.kills} kills`].filter(Boolean).join(' · '), '']]];
  if (on.best && top.length) L.push([['Best: ', 'b'], [top.map((p, k) => `${k + 1}. ${p.name}${T[p.team] ? ` (${T[p.team]})` : ''} ${p.score ?? 0}`).join(' · '), '']]);
  // (v187) the highlights: a line for each group, its parts joined
  const who = o => o.who.join(', ') + (o.more ? ` +${o.more}` : ''), wpn = w => w ? ` (${w})` : '';
  // (a titled group: the title bold, its parts plain - "Most kills - on foot: A 14 · in vehicles: B 37"; untitled: each
  // part's name bold. The longest kill with any weapon only when it is not one of those shown already)
  const same = (a, b) => a && b && a.who === b.who && a.d === b.d && a.w === b.w;
  const group = (title, parts) => {
    const P = parts.filter(([k]) => on[k] && H[k] && !(k === 'longest' && ['atLong', 'smallLong', 'snipLong'].some(q => on[q] && same(H[q], H.longest)))).map(([k, label, f]) => [label, f(H[k])]); if (!P.length) return;
    const seg = title ? [[title, 'b'], [' - ', '']] : []; P.forEach(([label, text], i) => { if (i) seg.push([' · ', '']); seg.push([label + ': ', title ? '' : 'b'], [text, '']); }); L.push(seg);
  };
  const cnt = o => `${who(o)} ${o.n}`, far = o => `${o.who} ${o.d} m${wpn(o.w)}`;
  group('Most kills', [['foot', 'on foot', cnt], ['veh', 'in vehicles', cnt], ['hs', 'headshots', cnt], ['knife', 'knife', cnt], ['clay', 'claymores', cnt], ['mine', 'mines', cnt], ['atInf', 'launchers on infantry', cnt], ['road', 'run over', cnt], ['expl', 'explosives', cnt]]);
  group('Longest kill', [['atLong', 'launcher', far], ['smallLong', 'small arms', far], ['snipLong', 'sniper', far], ['longest', 'any', far]]);
  group('Kill streak', [['streakFoot', 'on foot', cnt], ['streakVeh', 'in vehicles', cnt]]);   // (v190: apart)
  group('', [['kd', 'Best K/D', o => `${o.who} ${o.r} (${o.k}/${o.d})`]]);
  group('Most', [['rev', 'revives', cnt], ['heal', 'heals', cnt], ['rep', 'repairs', cnt], ['flags', 'flags', o => `${o.who} ${o.n} (${o.cap} captured, ${o.neu} neutralised)`]]);
  group('', [['first', 'First blood', o => `${o.who} → ${o.vic}${o.w ? ` (${o.w}, ${mmss(o.t)})` : ` (${mmss(o.t)})`}`], ['last', 'Last killed', o => `${o.vic} by ${o.who}${o.tk ? ' (team kill' + (o.w ? ', ' + o.w : '') + ')' : wpn(o.w)} at ${mmss(o.t)}`]]);
  if (on.server && s.server) L.push([[s.server, '']]);
  if (DOMAIN) L.push([[`https://${DOMAIN}/r/${encodeURIComponent(id)}`, 'l']]);
  return L;
}
const escTg = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const escDc = s => String(s).replace(/([\\*_~`|>#[\]()@-])/g, '\\$1');
async function post(url, body) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 15e3);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    if (r.ok) return { ok: true };
    let why = ''; try { why = (await r.text()).slice(0, 200); } catch (e) {}
    return { ok: false, msg: `${r.status} ${why}`.trim() };
  } catch (e) { return { ok: false, msg: e.name === 'AbortError' ? 'no answer in 15 s' : e.message }; }
  finally { clearTimeout(tm); }
}
// each app's text: Discord's markdown, Telegram's HTML
const asDiscord = L => L.map(seg => seg.map(([t, k]) => { if (k === 'l') return t; if (k !== 'b') return escDc(t); const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(t); return m[2] ? `${m[1]}**${escDc(m[2])}**${m[3]}` : t; }).join('')).join('\n').slice(0, 1900);   // (Discord's bold takes no spaces inside its stars)
const asTelegram = L => L.map(seg => seg.map(([t, k]) => k === 'b' ? `<b>${escTg(t)}</b>` : escTg(t)).join('')).join('\n').slice(0, 3900);
// (v187) the post for a round as each app gets it (the admin page's preview); v194: with the lines given for each app
export function postTexts(entry, lines) { return { discord: asDiscord(postLines(entry, linesOf(lines?.discord))), telegram: asTelegram(postLines(entry, linesOf(lines?.telegram))) }; }
// L: the lines for every target, or a function target -> lines; T: targetsOf
async function send(L, T, S) {
  const out = [], of = t => typeof L === 'function' ? L(t) : L;
  for (const t of T) {
    if (t.app === 'discord') out.push(['Discord', await post(t.url, { content: asDiscord(of(t)), username: 'BF2 Round Replay', allowed_mentions: { parse: [] } })]);
    else out.push(['Telegram', await post(`https://api.telegram.org/bot${S.tgToken}/sendMessage`, { chat_id: t.chat, text: asTelegram(of(t)), parse_mode: 'HTML' })]);
  }
  return out;
}
const told = R => R.map(([w, r]) => r.ok ? `${w}: posted` : `${w}: failed (${r.msg})`).join('; ');

// new rounds, as ingest.mjs lists them (rounds.json entries): one post each, the ones worth it, to their server's
// channels (v194); a server not set up on the admin page: not posted
export async function notifyRounds(entries) {
  const S = notifySettings(), skipped = new Map();
  for (const e of entries) {
    const s = e.sum; if (!s || s.empty || e.clip || !recent(s.date)) continue;
    const srv = serverOf(e), c = S.servers[srv], T = targetsOf(S, srv);
    if (!c || !T.length) { const k = `"${srv}" ${c ? (c.telegram.on && c.telegram.chat && !S.tgToken ? '(its Telegram chat needs the bot\'s token on the admin page)' : '(set up, but no Discord webhook or Telegram chat on)') : '(not set up on the admin page)'}`; skipped.set(k, (skipped.get(k) || 0) + 1); continue; }
    if (s.players < (c.minPlayers || S.minPlayers)) continue;
    const R = await send(t => postLines(e, t.lines), T, S), m = told(R);
    log('round post', e.name, `(${srv})`, '-', m); remember(e.name, R.every(([, r]) => r.ok), m, srv);
  }
  for (const [k, n] of skipped) log(`round posts: ${n} new round${n === 1 ? '' : 's'} of ${k} not posted`);
}
// the newest round of a server (or of all)
function newestRound(server) {
  let R = []; try { R = readRoundList(fs, path, DATA).rounds || []; } catch (e) {}   // (v166: the whole list has the players' lines)
  return R.filter(r => r.sum && !r.sum.empty && (!server || serverOf(r) === server)).sort((x, y) => String(y.sum.date).localeCompare(String(x.sum.date)))[0] || null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const S = notifySettings(), a = process.argv.slice(2), want = a.find(x => !x.startsWith('--'));
  const servers = want !== undefined ? [want] : Object.keys(S.servers).filter(n => targetsOf(S, n).length);
  if (!a.includes('--test') && !a.includes('--last')) { console.log('node notify.mjs --test [server] | --last [server]'); process.exit(2); }
  if (want !== undefined && !S.servers[want]) { console.log(`"${want}" is not set up for posts (admin page: Posts about new rounds).`); process.exit(1); }
  if (!servers.length || !servers.some(n => targetsOf(S, n).length)) { console.log(want !== undefined ? `Nothing to post to for "${want}": no Discord webhook or Telegram chat on (or no Telegram bot token).` : 'Nothing to post to: no server has a Discord webhook or Telegram chat on (admin page).'); process.exit(1); }
  let all = true; const said = [];
  for (const n of servers) {
    const T = targetsOf(S, n); if (!T.length) continue;
    let L;
    if (a.includes('--test')) L = [[['BF2 Round Replay', 'b']], [[`A test post: new rounds of ${n} will be posted here like this.`, '']], ...(DOMAIN ? [[[`https://${DOMAIN}/`, 'l']]] : [])];
    else { const e = newestRound(n); if (!e) { said.push(`${n}: no rounds yet`); all = false; continue; } L = t => postLines(e, t.lines); }
    const R = await send(L, T, S), m = told(R), ok = R.every(([, r]) => r.ok); all = all && ok;
    said.push(servers.length > 1 || want === undefined ? `${n}: ${m}` : m); remember(a.includes('--test') ? 'test' : 'newest round', ok, m, n);
  }
  console.log(said.join(' | ')); process.exit(all ? 0 : 1);
}
