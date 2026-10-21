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
  minPlayers: c?.minPlayers ? Math.max(1, Math.min(64, Math.floor(+c.minPlayers))) : null, last: c?.last || null, format: normFormat(c?.format), formatSet: !!c?.format
});
// the settings: /etc/bf2replay.conf first (the bot's token, the fewest players), then the admin page's file
export function notifySettings() {
  let j = readNotify(); if (!j.servers || typeof j.servers !== 'object') j = migrate(j);
  const ct = opt('BF2R_TELEGRAM_TOKEN', ''), tok = ct || (typeof j.telegram?.token === 'string' ? j.telegram.token : '');
  const mp = Math.floor(+opt('BF2R_NOTIFY_MIN_PLAYERS', '') || +j.minPlayers || 6);
  const servers = {}; for (const [n, c] of Object.entries(j.servers || {})) servers[n] = srvCfg(c);
  const templates = {}; for (const [n, t] of Object.entries(j.templates || {})) templates[n] = { format: normFormat(t?.format), lines: { discord: linesOf(t?.lines?.discord), telegram: linesOf(t?.lines?.telegram) }, at: t?.at || null };
  return { tgToken: tok, tgTokenConf: !!ct, minPlayers: Math.max(1, Math.min(64, mp)), minPlayersConf: !!opt('BF2R_NOTIFY_MIN_PLAYERS', ''), last: j.last || null, servers,
    templates, migrated: j.migrated || null, ignoredConf: ['BF2R_DISCORD_WEBHOOK', 'BF2R_TELEGRAM_CHAT'].filter(k => opt(k, '')) };
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
      for (const k of ['minPlayers', 'last', 'format']) if (srv[k] !== undefined) { if (srv[k] === null) delete o[k]; else o[k] = srv[k]; }
      for (const app of ['discord', 'telegram']) if (srv[app]?.linesAll) { o[app].lines = srv[app].linesAll; delete o[app].linesAll; }   // (v195: a template's lines, whole)
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

// ---------- (v195) the post: its layout, each server its own (servers[name].format) ----------
// Classic (as before, the default: the parts in groups, only which are on applies); or Discord as a card (an embed: a
// stripe in the winner's colour, the title a link to the round, the parts as fields - up to 3 in a row or across the
// whole card: the table - the map's picture, a line at the bottom) or as text; Telegram (no cards there) as text with
// the same order and names. The title, the line under it, the line at the bottom and the own
// text (instead of the table) are templates: {map} {when} ... and each part's key ({foot}, {best} ...); a line whose
// placeholders are all empty is left out; **bold** *italic* __underline__ ~~struck~~ `code` (Discord's own; turned into
// Telegram's HTML). The parts' order, names and width are the table's; which go to which app: lines (as before).
export const POST_VARS = [['map', 'the map'], ['when', 'day and time it started (Tue 13 Oct 21:14)'], ['date', 'the day (2026-10-13)'], ['time', 'the time (21:14)'], ['result', 'who won and the tickets'],
  ['winner', 'the side that won'], ['loser', 'the side that lost'], ['tickets', 'tickets left (87 : 72)'], ['length', 'how long (45 min)'], ['players', 'how many players'], ['kills', 'how many kills'], ['server', "the server's name"], ['link', 'the link to the round']];
export const FORMAT_DEFAULT = { style: 'classic', title: '{map} · {when}', intro: '{result} · {length} · {players} players · {kills} kills', footer: '', color: 'winner', image: 'big', cols: 3, order: POST_ITEMS.map(([k]) => k).filter(k => k !== 'server').concat('server'), labels: {}, wide: { best: true, server: true }, text: '' };
const KEYS = POST_ITEMS.map(([k]) => k), LABEL = Object.fromEntries(POST_ITEMS.map(([k, n]) => [k, n]));
const str = (v, d, n) => typeof v === 'string' ? v.replace(/\r/g, '').slice(0, n) : d;
export function normFormat(f) {
  const D = FORMAT_DEFAULT; f = f && typeof f === 'object' ? f : {};
  const order = []; for (const k of Array.isArray(f.order) ? f.order : []) if (KEYS.includes(k) && !order.includes(k)) order.push(k);
  for (const k of D.order) if (!order.includes(k)) order.push(k);   // (a part added in a later version: at the end)
  const labels = {}; for (const [k, v] of Object.entries(f.labels || {})) if (KEYS.includes(k) && typeof v === 'string' && v.trim() && v.trim() !== LABEL[k]) labels[k] = v.trim().slice(0, 80);
  const wide = {}; for (const k of KEYS) { const w = f.wide && k in f.wide ? !!f.wide[k] : !!D.wide[k]; if (w) wide[k] = true; }
  return { style: ['card', 'text'].includes(f.style) ? f.style : 'classic', title: str(f.title, D.title, 250).replace(/\n/g, ' '), intro: str(f.intro, D.intro, 1000), footer: str(f.footer, D.footer, 500), color: /^#[0-9a-f]{6}$/i.test(f.color || '') ? f.color.toLowerCase() : 'winner',
    image: ['big', 'small', 'none'].includes(f.image) ? f.image : D.image, cols: +f.cols === 2 ? 2 : 3, order, labels, wide, text: str(f.text, '', 3500) };
}
const labelOf = (F, k) => F.labels[k] || LABEL[k];
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
// each part's value for a round: { v: one line, vm: on several lines (the card) }; on: the parts this app gets (the
// longest kill with any weapon only when it is none of those three shown already)
function itemVals(entry, on) {
  const s = entry.sum, T = s.teams || [], H = s.hl || {}, V = {};
  const top = (s.P || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0) || b.k - a.k).slice(0, 3);
  if (top.length) { const L = top.map((p, k) => `${k + 1}. ${p.name}${T[p.team] ? ` (${T[p.team]})` : ''} ${p.score ?? 0}`); V.best = { v: L.join(' · '), vm: L.join('\n') }; }
  const who = o => o.who.join(', ') + (o.more ? ` +${o.more}` : ''), wpn = w => w ? ` (${w})` : '', put = (k, f) => { if (H[k]) V[k] = { v: f(H[k]) }; };
  for (const k of ['foot', 'veh', 'hs', 'knife', 'clay', 'mine', 'atInf', 'road', 'expl', 'streakFoot', 'streakVeh', 'rev', 'heal', 'rep']) put(k, o => `${who(o)} ${o.n}`);
  const same = (a, b) => a && b && a.who === b.who && a.d === b.d && a.w === b.w;
  for (const k of ['atLong', 'smallLong', 'snipLong', 'longest']) if (!(k === 'longest' && ['atLong', 'smallLong', 'snipLong'].some(q => on[q] && same(H[q], H.longest)))) put(k, o => `${o.who} ${o.d} m${wpn(o.w)}`);
  put('kd', o => `${o.who} ${o.r} (${o.k}/${o.d})`);
  put('flags', o => `${o.who} ${o.n} (${o.cap} captured, ${o.neu} neutralised)`);
  put('first', o => `${o.who} → ${o.vic}${o.w ? ` (${o.w}, ${mmss(o.t)})` : ` (${mmss(o.t)})`}`);
  put('last', o => `${o.vic} by ${o.who}${o.tk ? ' (team kill' + (o.w ? ', ' + o.w : '') + ')' : wpn(o.w)} at ${mmss(o.t)}`);
  if (s.server) V.server = { v: s.server };
  return V;
}
const linkOf = entry => DOMAIN ? `https://${DOMAIN}/r/${encodeURIComponent(entry.name.replace(/\.bf2demo(\.gz)?$/i, ''))}` : '';
function varsOf(entry, V) {
  const s = entry.sum, tk = s.tickets, T = s.teams || [], dm = /^(\d{4}-\d\d-\d\d)\s+(\d\d:\d\d)/.exec(s.date || '');
  const tickets = tk ? `${tk[0][1]} : ${tk[1][1]}` : '', won = s.winner != null && T[s.winner] ? `${T[s.winner]} won${tickets ? `, tickets ${tickets}` : ''}` : tickets ? `tickets ${tickets}` : '';
  const out = { map: mapName(s.map), when: when(s.date), date: dm ? dm[1] : '', time: dm ? dm[2] : '', result: won, winner: s.winner != null ? T[s.winner] || '' : '', loser: s.winner === 0 || s.winner === 1 ? T[1 - s.winner] || '' : '',
    tickets, length: `${Math.round((s.duration || 0) / 60)} min`, players: String(s.players ?? ''), kills: String(s.kills ?? ''), server: s.server || '', link: linkOf(entry) };
  for (const k of KEYS) if (V[k]) out[k] = V[k].v; else if (!(k in out)) out[k] = '';
  return out;
}
const escTg = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const escDc = s => String(s).replace(/([\\*_~`|>#[\]()@-])/g, '\\$1');
// (v187-v194) the classic post, as before: the highlights in groups ("Most kills - on foot: A 14 · in vehicles: B 37"), only
// which parts are on applies; the post of a server not changed in the editor (v195: style 'classic')
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
const asDiscord = L => L.map(seg => seg.map(([t, k]) => { if (k === 'l') return t; if (k !== 'b') return escDc(t); const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(t); return m[2] ? `${m[1]}**${escDc(m[2])}**${m[3]}` : t; }).join('')).join('\n').slice(0, 1900);   // (Discord's bold takes no spaces inside its stars)
const asTelegram = L => L.map(seg => seg.map(([t, k]) => k === 'b' ? `<b>${escTg(t)}</b>` : escTg(t)).join('')).join('\n').slice(0, 3900);
const MARKS = [['**', 'b'], ['__', 'u'], ['~~', 's'], ['*', 'i'], ['`', 'code']];
// one line of a template: null when it has placeholders and all of them are empty. app: 'discord' (its markdown as
// written, the values escaped), 'telegram' (the markup made HTML, all escaped) or 'plain' (markup taken out: a card's
// title and bottom line, which show no markdown). Separators (· |) left at an end or doubled by an empty value go.
function tplLine(line, vars, app) {
  const tok = []; let i = 0;
  for (const m of line.matchAll(/\{(\w+)\}/g)) { if (m.index > i) tok.push([0, line.slice(i, m.index)]); tok.push(m[1] in vars ? [m[1] === 'link' ? 2 : 1, String(vars[m[1]] ?? '')] : [0, m[0]]); i = m.index + m[0].length; }
  if (i < line.length) tok.push([0, line.slice(i)]);
  const vals = tok.filter(t => t[0]); if (vals.length && vals.every(t => !t[1])) return null;
  const T = []; for (const t of tok) { if (t[0] && !t[1]) continue; if (!t[0] && T.length && !T[T.length - 1][0]) T[T.length - 1][1] += t[1]; else T.push([t[0], t[1]]); }
  const SEP = /(\s*[·|]\s*){2,}/g;
  T.forEach((t, j) => { if (t[0]) return; let x = t[1].replace(SEP, m => ' ' + m.trim().slice(-1) + ' '); if (j === 0) x = x.replace(/^\s*[·|]\s*/, ''); if (j === T.length - 1) x = x.replace(/\s*[·|]\s*$/, ''); t[1] = x; });
  if (app === 'discord') return T.map(([v, x]) => v === 2 ? x : v ? escDc(x) : x).join('');
  if (app === 'plain') return T.map(([v, x]) => v ? x : x.replace(/\*\*|__|~~|`/g, '').replace(/(^|[^\\])\*/g, '$1')).join('').trim();
  // Telegram: each mark opens or closes its tag (nested right: closing one under others closes and opens them again)
  let out = ''; const open = [];
  for (const [v, x] of T) {
    if (v) { out += escTg(x); continue; }
    let k = 0;
    while (k < x.length) {
      const mk = MARKS.find(([m]) => x.startsWith(m, k));
      if (!mk) { out += escTg(x[k]); k++; continue; }
      const tag = mk[1], at = open.lastIndexOf(tag);
      if (at < 0) { out += `<${tag}>`; open.push(tag); }
      else { const above = open.splice(at); out += above.slice().reverse().map(t => `</${t}>`).join(''); above.shift(); for (const t of above) { out += `<${t}>`; open.push(t); } }
      k += mk[0].length;
    }
  }
  return out + open.slice().reverse().map(t => `</${t}>`).join('');
}
const tpl = (text, vars, app) => String(text || '').split('\n').map(l => tplLine(l, vars, app)).filter(l => l !== null).join('\n').trim();
const hasLink = F => [F.title, F.intro, F.footer, F.style === 'text' || F.text ? F.text : ''].some(t => /\{link\}/.test(t || ''));
// the post as text for an app: the title (bold), the line under it, the table (a part a line, or up to F.cols in a
// row: "Name: value · Name: value"), the bottom line, the link; or the own text (F.text) instead of all that
function textPost(entry, F, on, app) {
  const V = itemVals(entry, on), vars = varsOf(entry, V), L = [];
  const b = t => app === 'telegram' ? `<b>${escTg(t)}</b>` : `**${escDc(t)}**`, e = t => app === 'telegram' ? escTg(t) : escDc(t);
  if (F.text.trim()) L.push(tpl(F.text, vars, app));
  else {
    const t = tpl(F.title, vars, app); if (t) L.push(/\*\*|<b>/.test(t) ? t : app === 'telegram' ? `<b>${t}</b>` : `**${t}**`);
    const i = tpl(F.intro, vars, app); if (i) L.push(i);
    let run = [];
    const flush = () => { if (run.length) { L.push(run.join(' · ')); run = []; } };
    for (const k of F.order) {
      if (!on[k] || !V[k]) continue;
      const seg = `${b(labelOf(F, k) + ':')} ${e(V[k].v)}`;
      if (F.wide[k]) { flush(); L.push(seg); } else { run.push(seg); if (run.length >= F.cols) flush(); }
    }
    flush();
    const f = tpl(F.footer, vars, app); if (f) L.push(f);
  }
  // (too long for the app - Telegram 4096, Discord 2000: whole lines from the end go, the link stays; never a cut tag)
  const max = app === 'telegram' ? 3900 : 1990, link = vars.link && !hasLink(F) ? (app === 'telegram' ? escTg(vars.link) : vars.link) : '';
  const lines = L.filter(Boolean).join('\n').split('\n'), keep = []; let n = link.length;
  for (const l of lines) {
    if (n + l.length + 1 > max) {   // (a line too long by itself, the first: cut - for Telegram without its tags, no cut entity)
      if (!keep.length) keep.push(app === 'telegram' ? l.replace(/<\/?\w+>/g, '').slice(0, max - n - 1).replace(/&[a-z]*$/, '') : l.slice(0, max - n - 1));
      break;
    }
    keep.push(l); n += l.length + 1;
  }
  if (link) keep.push(link);
  return keep.join('\n');
}
// the post as a Discord card (an embed; Discord's limits: 25 fields, a name 256, a value 1024, the whole 6000)
const TEAM_RGB = [0xff6b4f, 0x5ea8ff], DRAW_RGB = 0xe2b547;
const cut = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
function cardPost(entry, F, on) {
  const s = entry.sum, V = itemVals(entry, on), vars = varsOf(entry, V), E = {};
  const title = tpl(F.title, vars, 'plain'); if (title) E.title = cut(title, 256);
  if (vars.link) E.url = vars.link;
  const d = tpl(F.intro, vars, 'discord'); if (d) E.description = cut(d, 4096);
  E.color = F.color !== 'winner' ? parseInt(F.color.slice(1), 16) : s.winner === 0 || s.winner === 1 ? TEAM_RGB[s.winner] : DRAW_RGB;
  const fields = []; let run = 0;
  for (const k of F.order) {
    if (!on[k] || !V[k]) continue;
    const wide = !!F.wide[k];
    if (!wide && F.cols === 2 && run === 2) { fields.push({ name: '\u200b', value: '\u200b', inline: true, blank: true }); run = 0; }   // (2 in a row: an empty third)
    fields.push({ name: cut(labelOf(F, k), 256), value: cut(escDc(V[k].vm || V[k].v), 1024), inline: !wide }); run = wide ? 0 : run + 1;
  }
  while (fields.length > 25) { const j = fields.findIndex(x => x.blank); if (j >= 0) fields.splice(j, 1); else fields.pop(); }
  E.fields = fields.map(({ name, value, inline }) => ({ name, value, inline }));
  const ft = tpl(F.footer, vars, 'plain'); if (ft) E.footer = { text: cut(ft, 2048) };
  if (DOMAIN && F.image !== 'none') { const m = String(s.map || '').toLowerCase(), img = `https://${DOMAIN}/assets/og/${fs.existsSync(path.join(SITE, 'assets', 'og', m + '.jpg')) ? m : 'site'}.jpg`; E[F.image === 'small' ? 'thumbnail' : 'image'] = { url: img }; }
  const size = () => (E.title || '').length + (E.description || '').length + (E.footer?.text || '').length + E.fields.reduce((n, x) => n + x.name.length + x.value.length, 0);
  while (size() > 5900 && E.fields.length) E.fields.pop();
  return E;
}
// (v195) the post about a round for each app, with a server's settings (c: srvCfg - format, lines; missing: the
// standard ones): { discord: { content } | { embeds }, telegram: HTML text }
export function renderPost(entry, c) {
  const F = normFormat(c?.format), on = app => linesOf(c?.[app]?.lines);
  if (F.style === 'classic') return { discord: { content: asDiscord(postLines(entry, on('discord'))) }, telegram: asTelegram(postLines(entry, on('telegram'))) };
  const dc = F.style === 'card' ? { embeds: [cardPost(entry, F, on('discord'))] } : { content: textPost(entry, F, on('discord'), 'discord') };
  return { discord: dc, telegram: textPost(entry, F, on('telegram'), 'telegram') };
}
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
// (v187) the post for a round as each app gets it (the admin page's preview); v195: with a server's settings
export function postTexts(entry, c) { const P = renderPost(entry, c); return { discord: P.discord.embeds ? { card: P.discord.embeds[0] } : { text: P.discord.content }, telegram: P.telegram }; }
// P: { discord: { content } | { embeds }, telegram: text } for the targets T (targetsOf)
async function send(P, T, S) {
  const out = [];
  for (const t of T) {
    if (t.app === 'discord') out.push(['Discord', await post(t.url, { ...P.discord, username: 'BF2 Round Replay', allowed_mentions: { parse: [] } })]);
    else out.push(['Telegram', await post(`https://api.telegram.org/bot${S.tgToken}/sendMessage`, { chat_id: t.chat, text: P.telegram, parse_mode: 'HTML' })]);
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
    const R = await send(renderPost(e, c), T, S), m = told(R);
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
    let P;
    if (a.includes('--test')) { const t = `A test post: new rounds of ${n} will be posted here like this.`; P = { discord: { content: `**BF2 Round Replay**\n${escDc(t)}${DOMAIN ? `\nhttps://${DOMAIN}/` : ''}` }, telegram: `<b>BF2 Round Replay</b>\n${escTg(t)}${DOMAIN ? `\nhttps://${DOMAIN}/` : ''}` }; }
    else { const e = newestRound(n); if (!e) { said.push(`${n}: no rounds yet`); all = false; continue; } P = renderPost(e, S.servers[n]); }
    const R = await send(P, T, S), m = told(R), ok = R.every(([, r]) => r.ok); all = all && ok;
    said.push(servers.length > 1 || want === undefined ? `${n}: ${m}` : m); remember(a.includes('--test') ? 'test' : 'newest round', ok, m, n);
  }
  console.log(said.join(' | ')); process.exit(all ? 0 : 1);
}
