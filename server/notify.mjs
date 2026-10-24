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
export const opt = (k, d) => process.env[k] ?? conf[k] ?? d;
export const ROOT = opt('BF2R_ROOT', '/srv/bf2replay'), DATA = path.join(ROOT, 'data'), SITE = path.join(ROOT, 'site');
export const NOTIFY_FILE = path.join(DATA, '.notify.json');
export const DOMAIN = opt('BF2R_DOMAIN', '').trim();
const MAX_AGE_H = 12;
export const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

export const DISCORD_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,200}$/;
export const TG_TOKEN_RE = /^\d{5,15}:[\w-]{30,60}$/, TG_CHAT_RE = /^(?:-?\d{3,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;

// (v187) the parts of a post: [key, name, what it is] - all on by default, for each app apart
export const POST_ITEMS = [
  ['best', 'Best three', 'the best three by score, with their side'],
  // (v207, Sagara: "the end of the round in Discord, and more") the scoreboard as at the round's end, the records it broke
  ['board', 'Scoreboard', "each side's best five by score, with kills and deaths - as the game's screen at the round's end"],
  ['records', 'New records', "a record of the server the round broke (in one round: of all time, the last 30 or 7 days - as the site's Records)"],
  // (v215, Sagara's todo 265) a player passing 1,000 / 2,500 / 5,000 / 10,000 / 25,000 kills or 100 / 250 / 500 / 1,000 rounds on the server
  ['miles', 'Milestones', 'a player who passed 1,000 / 2,500 / 5,000 / 10,000 kills or 100 / 250 / 500 / 1,000 rounds on this server with this round'],
  ['server', 'Server', "the server's name"],
  ['foot', 'Kills on foot', 'most enemies killed on foot'], ['veh', 'Kills in vehicles', 'most enemies killed from vehicles'],
  ['hs', 'Headshots', 'most headshots'], ['knife', 'Knife', 'most knife kills'], ['clay', 'Claymores', 'most claymore kills'], ['mine', 'Mines', 'most kills with AT mines'],
  ['atInf', 'Launchers on infantry', 'most soldiers on foot killed with a hand-held launcher (SRAW, Eryx, RPG-7)'],
  ['road', 'Run over', 'most soldiers run over with a vehicle'], 
  // (v210, Sagara: grenades and mines apart) the explosives each their own - "Explosives" (all of them) is no more
  ['gren', 'Grenades', 'most kills with hand grenades'], ['gl', 'Grenade launcher', "most kills with the rifles' grenade launchers (M203, GP-30, GP-25, F2000 / SA80)"], ['c4', 'C4', 'most C4 kills'],
  ['atLong', 'Longest launcher kill', 'with a hand-held launcher'], ['smallLong', 'Longest small-arms kill', 'rifles, machine guns, pistols, shotguns - not a sniper rifle or a launcher'],
  ['snipLong', 'Longest sniper kill', 'with a sniper rifle'], ['longest', 'Longest kill', 'with any weapon, vehicles too'],
  // (v207) the weapons' groups of the Records (ingest.mjs summarize: recGroup) - off until turned on
  ['handMost', 'Kills with hand-held weapons', 'most kills with rifles, machine guns, pistols, shotguns (no sniper rifles)'], ['atMost', 'Kills with hand-held anti-tank', 'most kills with SRAW, Eryx, RPG-7'],
  ['standMost', 'Kills with TOW / HJ-8', 'most kills with the anti-tank launchers on a stand'], ['standLong', 'Longest TOW / HJ-8 kill', 'with an anti-tank launcher on a stand'],
  ['tankMost', 'Kills with tank cannons', 'most kills with the tanks\' cannons'], ['tankLong', 'Longest tank cannon kill', "with a tank's cannon"],
  ['vehMost', 'Kills with other vehicle weapons', 'most kills from vehicles (no tank cannons, no anti-air)'], ['vehLong', 'Longest vehicle kill', 'from a vehicle (no tank cannons, no anti-air)'],
  ['aaGunMost', 'Kills with anti-air guns', 'most kills with Tunguska, Type 95 AA, M6 Linebacker guns, Phalanx'], ['aaGunLong', 'Longest anti-air gun kill', 'with an anti-air gun'],
  ['aaRktMost', 'Kills with anti-air rockets', 'most kills with Igla / Stinger, M6 Stinger, SA-19, QW-2, Sea Sparrow'], ['aaRktLong', 'Longest anti-air rocket kill', 'with an anti-air rocket from the ground'],
  ['a2aMost', 'Kills with air-to-air missiles', 'most kills with Sidewinder, Archer, the Eurofighter\'s'], ['a2aLong', 'Longest air-to-air kill', 'with an air-to-air missile'],
  ['streakFoot', 'Kill streak on foot', 'most kills on foot in a row without dying'], ['streakVeh', 'Kill streak in vehicles', 'most kills from vehicles in a row without dying'], ['kd', 'Best K/D', 'of those with 10 kills or more'],
  ['rev', 'Revives', 'most revives'], ['heal', 'Heals', 'most heals'], ['rep', 'Repairs', 'most repairs'],
  ['flags', 'Flags', 'most flags captured and neutralised'], ['first', 'First blood', 'the first kill of the round'], ['last', 'Last killed', 'the last soldier killed in the round']
];
// (v208, Sagara: "a table - one row, one kind of kill, not a group") Discord as a table: the short names of its rows
// (a part's own name from the editor wins)
export const TLABEL = {   // (v213: Sagara's short names, so a row fits a narrow card)
  foot: 'On foot', veh: 'Veh', hs: 'Hs', knife: 'Knife', clay: 'Claymores', mine: 'Mines', atInf: 'AT on inf', road: 'Run over', gren: 'Grenades', gl: 'GL', c4: 'C4',
  atLong: 'Far AT', smallLong: 'Far Gun', snipLong: 'Far Sniper', longest: 'Far kill', handMost: 'Hand-held', atMost: 'AT', standMost: 'TOW', standLong: 'Far TOW',
  tankMost: 'Tank', tankLong: 'Far Tank', vehMost: 'Veh weap', vehLong: 'Far Veh', aaGunMost: 'AA gun', aaGunLong: 'Far AA', aaRktMost: 'SAM', aaRktLong: 'Far SAM',
  a2aMost: 'Air2Air', a2aLong: 'Far Air2Air', streakFoot: 'Inf Spree', streakVeh: 'Veh Spree', kd: 'Best K/D', rev: 'Revives', heal: 'Heals', rep: 'Repairs', flags: 'Flags', first: 'First blood', last: 'Last killed' };
// (missing: on - but the weapons' groups of v207: off, so a server's posts don't grow by themselves)
const OFF_NEW = new Set(['handMost', 'atMost', 'standMost', 'standLong', 'tankMost', 'tankLong', 'vehMost', 'vehLong', 'aaGunMost', 'aaGunLong', 'aaRktMost', 'aaRktLong', 'a2aMost', 'a2aLong']);
// (v210) the three parts that were "Explosives": on or off as that one was
const WAS_EXPL = new Set(['gren', 'gl', 'c4']);
export const linesOf = (o) => Object.fromEntries(POST_ITEMS.map(([k]) => [k, o && k in o ? o[k] !== false : o && WAS_EXPL.has(k) && 'expl' in o ? o.expl !== false : !OFF_NEW.has(k)]));
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
  minPlayers: c?.minPlayers ? Math.max(1, Math.min(64, Math.floor(+c.minPlayers))) : null, last: c?.last || null, format: normFormat(c?.format), formatSet: !!c?.format,
  // (v209) the summaries of its rounds (digest.mjs): which are on, the last period each was done for, the last one sent
  digest: { day: !!c?.digest?.day, week: !!c?.digest?.week, month: !!c?.digest?.month }, digestLast: c?.digestLast && typeof c.digestLast === 'object' ? { ...c.digestLast } : {},
  digestTry: c?.digestTry && typeof c.digestTry === 'object' ? { ...c.digestTry } : {}, digestLog: c?.digestLog && typeof c.digestLog === 'object' && !c.digestLog.at ? { ...c.digestLog } : {},
  // (v214, todo 265) the admins' private channel: a round's hints for admins once the background analysis has done it
  // (alerts.mjs) - strong ones only, or strong and ordinary ones
  alert: { on: !!c?.alert?.on, webhook: typeof c?.alert?.webhook === 'string' ? c.alert.webhook : '', min: c?.alert?.min === 'hint' ? 'hint' : 'strong', log: c?.alert?.log || null },
  // (v220, Sagara: "Discord settings for the digests too") the summaries' own settings as saved (digest.mjs normDigestFmt
  // fills them in): their Discord channel (own webhook, or the round posts'), Telegram, what is in them and how
  digestFmt: c?.digestFmt && typeof c.digestFmt === 'object' ? { ...c.digestFmt } : null
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
      for (const k of ['minPlayers', 'last', 'format', 'digest', 'digestLast', 'digestTry', 'digestLog', 'digestFmt']) if (srv[k] !== undefined) { if (srv[k] === null) delete o[k]; else o[k] = srv[k]; }
      if (srv.alert !== undefined) o.alert = { ...(o.alert || {}), ...srv.alert };   // (v214)
      for (const app of ['discord', 'telegram']) if (srv[app]?.linesAll) { o[app].lines = srv[app].linesAll; delete o[app].linesAll; }   // (v195: a template's lines, whole)
      j.servers[server] = o;
    }
  }
  writeNotify(j);
}
// where a server's rounds go: [{ app, url | chat, lines }]
export function targetsOf(S, server) {
  const c = S.servers[server], out = []; if (!c) return out;
  if (c.discord.on && c.discord.webhook) out.push({ app: 'discord', url: c.discord.webhook, lines: c.discord.lines });
  if (c.telegram.on && c.telegram.chat && S.tgToken) out.push({ app: 'telegram', chat: c.telegram.chat, lines: c.telegram.lines });
  return out;
}
const remember = (what, ok, msg, server) => { try { const last = { at: new Date().toISOString(), what, ok, msg: String(msg || '').slice(0, 300), ...(server ? { server } : {}) }; if (server && notifySettings().servers[server]) saveNotify({ last }, server, { last }); else saveNotify({ last }); } catch (e) {} };

// the maps' names, as the page has them (its GAME table)
let MAPS = null;
export function mapName(m) {
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
export const FORMAT_DEFAULT = { style: 'classic', title: '{map} · {when}', intro: '{result} · {length} · {players} players · {kills} kills', footer: '', color: 'winner', image: 'big', cols: 3, order: POST_ITEMS.map(([k]) => k).filter(k => k !== 'server').concat('server'), labels: {}, wide: { best: true, board: true, records: true, server: true }, text: '' };
const KEYS = POST_ITEMS.map(([k]) => k), LABEL = Object.fromEntries(POST_ITEMS.map(([k, n]) => [k, n]));
const str = (v, d, n) => typeof v === 'string' ? v.replace(/\r/g, '').slice(0, n) : d;
export function normFormat(f) {
  const D = FORMAT_DEFAULT; f = f && typeof f === 'object' ? f : {};
  const order = []; for (const k of Array.isArray(f.order) ? f.order : []) for (const q of k === 'expl' ? [...WAS_EXPL] : [k]) if (KEYS.includes(q) && !order.includes(q)) order.push(q);   // (v210: where "Explosives" was)
  for (const k of D.order) if (!order.includes(k)) order.push(k);   // (a part added in a later version: at the end)
  const labels = {}; for (const [k, v] of Object.entries(f.labels || {})) if (KEYS.includes(k) && typeof v === 'string' && v.trim() && v.trim() !== LABEL[k]) labels[k] = v.trim().slice(0, 80);
  const wide = {}; for (const k of KEYS) { const w = f.wide && k in f.wide ? !!f.wide[k] : !!D.wide[k]; if (w) wide[k] = true; }
  return { style: ['card', 'table', 'text'].includes(f.style) ? f.style : 'classic', title: str(f.title, D.title, 250).replace(/\n/g, ' '), intro: str(f.intro, D.intro, 1000), footer: str(f.footer, D.footer, 500), color: /^#[0-9a-f]{6}$/i.test(f.color || '') ? f.color.toLowerCase() : 'winner',
    image: ['big', 'small', 'none'].includes(f.image) ? f.image : D.image, cols: +f.cols === 2 ? 2 : 3, order, labels, wide, text: str(f.text, '', 3500), mono: !!f.mono };
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
  for (const k of ['foot', 'veh', 'hs', 'knife', 'clay', 'mine', 'atInf', 'road', 'gren', 'gl', 'c4', 'streakFoot', 'streakVeh', 'rev', 'heal', 'rep', ...GROUP_MOST]) put(k, o => `${who(o)} ${o.n}`);
  const same = (a, b) => a && b && a.who === b.who && a.d === b.d && a.w === b.w;
  for (const k of [...LONG_KEYS, 'longest']) if (!(k === 'longest' && LONG_KEYS.some(q => on[q] && same(H[q], H.longest)))) put(k, o => `${o.who} ${o.d} m${wpn(o.w)}`);
  // (v207) the scoreboard: each side's best five; the records the round broke
  const B = boardOf(s); if (B.length) V.board = { v: B.map(x => `${x.side}: ${x.rows.join(' · ')}`).join(' | '), vm: B.map(x => `${x.side}\n${x.rows.map((r, i) => `${i + 1}. ${r}`).join('\n')}`).join('\n\n'), sides: B };
  const NR = on.records ? newRecords(entry) : []; if (NR.length) { const L = NR.map(recText); V.records = { v: L.join(' · '), vm: L.join('\n'), list: NR }; }
  const MI = on.miles ? milestones(entry) : []; if (MI.length) { const L = MI.map(m => `${m.who}: ${m.what}`); V.miles = { v: L.join(' · '), vm: L.join('\n'), list: MI }; }   // (v215)
  put('kd', o => `${o.who} ${o.r} (${o.k}/${o.d})`);
  put('flags', o => `${o.who} ${o.n} (${o.cap} captured, ${o.neu} neutralised)`);
  put('first', o => `${o.who} → ${o.vic}${o.w ? ` (${o.w}, ${mmss(o.t)})` : ` (${mmss(o.t)})`}`);
  put('last', o => `${o.vic} by ${o.who}${o.tk ? ' (team kill' + (o.w ? ', ' + o.w : '') + ')' : wpn(o.w)} at ${mmss(o.t)}`);
  if (s.server) V.server = { v: s.server };
  return V;
}
// (v207) the parts of the weapons' groups; the longest kills that make "any weapon" needless when the same
const GROUP_MOST = ['handMost', 'atMost', 'standMost', 'tankMost', 'vehMost', 'aaGunMost', 'aaRktMost', 'a2aMost'];
const LONG_KEYS = ['atLong', 'smallLong', 'snipLong', 'standLong', 'tankLong', 'vehLong', 'aaGunLong', 'aaRktLong', 'a2aLong'];
// each side's best five by score (name score (K–D)), the winner first; [] with no players' lines
function boardOf(s, n = 5) {
  const T = s.teams || [], P = s.P || []; if (!P.length) return [];
  const sides = [0, 1].filter(tm => P.some(p => p.team === tm)).sort((a, b) => (b === s.winner) - (a === s.winner));
  return sides.map(tm => ({ tm, side: `${T[tm] || 'Team ' + (tm + 1)}${s.winner === tm ? ' (won)' : ''}`, rows: P.filter(p => p.team === tm).sort((a, b) => (b.score || 0) - (a.score || 0) || b.k - a.k).slice(0, n).map(p => `${p.name} ${p.score ?? 0} (${p.k}–${p.d})`) }));
}
// (v207) the records of the server the round broke: its soldiers' best in one round (the page's REC_KEYS / recVal - the
// site's Records) against the server's rounds played before it - of all time, the last 30 days, the last 7 (the longest
// time it beats; with fewer rounds before than REC_MIN, that time is not taken: the first rounds would break all)
const REC_MIN = { ever: 20, month: 10, week: 5 }, REC_PER = [['ever', 'all-time record', Infinity], ['month', '30-day record', 30], ['week', '7-day record', 7]];
let AGGF;
export function aggFns() {
  if (AGGF !== undefined) return AGGF; AGGF = null;
  try {
    const L = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8').split('\n'), g = L.find(l => l.startsWith('const GAME = ')), a = L.findIndex(l => l.startsWith('// @agg-begin')), b = L.findIndex(l => l.startsWith('// @agg-end'));
    if (g && a >= 0 && b > a) AGGF = new Function(g + '\n' + L.slice(a, b).join('\n') + '\nreturn { REC_KEYS: typeof REC_KEYS !== "undefined" ? REC_KEYS : null, recVal: typeof recVal === "function" ? recVal : null, nickOf };')();
    // (v208: the Records page's short names, for the table: "Sniper kill" - its lines up to the one ending "};")
    const r0 = L.findIndex(l => l.startsWith('const REC_SHORT = ')); let r1 = r0; while (r1 >= 0 && r1 < L.length - 1 && !/\};\s*$/.test(L[r1])) r1++;
    if (AGGF && r0 >= 0) try { AGGF.REC_SHORT = new Function(L.slice(r0, r1 + 1).join('\n').replace(/^const REC_SHORT = /, 'return ').replace(/;\s*$/, ''))(); } catch (e) {}
  } catch (e) { log("round posts: the page's records code did not load:", e.message); }
  return AGGF;
}
let RL = null;
export function allRounds() {   // (the whole list, the players' lines too: data/.rounds-full.json - read again when it changes)
  let mt = 0; try { mt = fs.statSync(path.join(DATA, '.rounds-full.json')).mtimeMs; } catch (e) {}
  if (RL && RL.mt === mt) return RL.R;
  let R = []; try { R = readRoundList(fs, path, DATA).rounds || []; } catch (e) {}
  RL = { mt, R }; return R;
}
const playedAt = d => { const t = Date.parse(String(d || '').replace(' ', 'T') + 'Z'); return Number.isFinite(t) ? t : null; };
export function newRecords(entry, max = 6) {
  const A = aggFns(), s = entry.sum; if (!A || !A.REC_KEYS || !A.recVal || !s || !Array.isArray(s.P)) return [];
  const t0 = playedAt(s.date); if (t0 === null) return [];
  // (v231) only rounds summed up as this one (sumV): while the rounds are summed up again after an update, the older
  // summaries may lack a figure (v221-v230: the score) and every new round would break that record
  const sv = entry.sumV || 1;
  const before = allRounds().filter(r => r.name !== entry.name && r.sum && !r.sum.empty && Array.isArray(r.sum.P) && r.sum.server === s.server && playedAt(r.sum.date) !== null && playedAt(r.sum.date) < t0 && (r.sumV || 1) >= sv);
  // (one pass over the earlier rounds: each period's count and best of every record)
  const N = {}, BEST = {}; for (const [pk] of REC_PER) { N[pk] = 0; BEST[pk] = {}; }
  for (const r of before) {
    const ago = t0 - playedAt(r.sum.date), in_ = REC_PER.filter(([, , days]) => ago <= days * 86400e3).map(([pk]) => pk);
    for (const pk of in_) N[pk]++;
    for (const p of r.sum.P) if (!/^Player \d+$/.test(A.nickOf(p.name))) for (const [k] of A.REC_KEYS) { const [v] = A.recVal(p, k); if (v > 0) for (const pk of in_) if (!(BEST[pk][k] >= v)) BEST[pk][k] = v; }
  }
  const out = [];
  for (const [k, name, unit] of A.REC_KEYS) {
    let me = null; for (const p of s.P) { if (/^Player \d+$/.test(A.nickOf(p.name))) continue; const [v, w] = A.recVal(p, k); if (v > 0 && (!me || v > me.v)) me = { v, w: w || '', who: p.name }; }
    if (!me) continue;
    for (const [pk, label] of REC_PER) {
      if (N[pk] < REC_MIN[pk]) continue;
      const best = BEST[pk][k] || 0;
      if (me.v > best) { out.push({ k, name, unit, ...me, per: pk, label, prev: best }); break; }
    }
  }
  const rank = { ever: 0, month: 1, week: 2 };
  return out.sort((a, b) => rank[a.per] - rank[b.per]).slice(0, max);
}
// (v215) the milestones this round took players past on its server: kills (enemies) and rounds
const MILE_K = [1000, 2500, 5000, 10000, 25000, 50000], MILE_R = [100, 250, 500, 1000, 2000];
export function milestones(entry) {
  const A = aggFns(), s = entry.sum; if (!A || !s || !Array.isArray(s.P)) return [];
  const t0 = playedAt(s.date); if (t0 === null) return [];
  const here = new Map(); for (const p of s.P) { const k = A.nickOf(p.name); if (!/^Player \d+$/.test(k) && !here.has(k)) here.set(k, { name: p.name, k: p.k || 0 }); }
  if (!here.size) return [];
  const tot = new Map(); for (const k of here.keys()) tot.set(k, { k: 0, r: 0 });
  for (const r of allRounds()) { if (r.name === entry.name || !r.sum || r.sum.empty || !Array.isArray(r.sum.P) || r.sum.server !== s.server) continue; const t = playedAt(r.sum.date); if (t === null || t >= t0) continue;
    const seen = new Set(); for (const p of r.sum.P) { const k = A.nickOf(p.name), o = tot.get(k); if (!o) continue; o.k += p.k || 0; if (!seen.has(k)) { o.r++; seen.add(k); } } }
  const out = [], fmtN = n => n.toLocaleString('en-GB');
  for (const [k, h] of here) { const o = tot.get(k);
    const mk = MILE_K.filter(m => o.k < m && o.k + h.k >= m).pop(); if (mk) out.push({ who: h.name, what: `${fmtN(mk)} kills on this server`, n: mk, kind: 'k' });
    const mr = MILE_R.filter(m => o.r < m && o.r + 1 >= m).pop(); if (mr) out.push({ who: h.name, what: `${fmtN(mr)} rounds on this server`, n: mr, kind: 'r' }); }
  return out.sort((a, b) => b.n - a.n).slice(0, 6);
}
const recNum = (r, v) => r.unit === 'm' ? `${v} m` : r.k === 'kd' ? Number(v).toFixed(2) : String(v);
const recText = r => `${r.name}: ${r.who} ${recNum(r, r.v)}${r.w ? ` (${r.w})` : ''} - ${r.label} (was ${recNum(r, r.prev)})`;
const linkOf = entry => DOMAIN ? `https://${DOMAIN}/r/${encodeURIComponent(entry.name.replace(/\.bf2demo(\.gz)?$/i, ''))}` : '';
function varsOf(entry, V) {
  const s = entry.sum, tk = s.tickets, T = s.teams || [], dm = /^(\d{4}-\d\d-\d\d)\s+(\d\d:\d\d)/.exec(s.date || '');
  const tickets = tk ? `${tk[0][1]} : ${tk[1][1]}` : '', won = s.winner != null && T[s.winner] ? `${T[s.winner]} won${tickets ? `, tickets ${tickets}` : ''}` : tickets ? `tickets ${tickets}` : '';
  const out = { map: mapName(s.map), when: when(s.date), date: dm ? dm[1] : '', time: dm ? dm[2] : '', result: won, winner: s.winner != null ? T[s.winner] || '' : '', loser: s.winner === 0 || s.winner === 1 ? T[1 - s.winner] || '' : '',
    tickets, length: `${Math.round((s.duration || 0) / 60)} min`, players: String(s.players ?? ''), kills: String(s.kills ?? ''), server: s.server || '', link: linkOf(entry) };
  for (const k of KEYS) if (V[k]) out[k] = V[k].v; else if (!(k in out)) out[k] = '';
  return out;
}
export const escTg = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const escDc = s => String(s).replace(/([\\*_~`|>#[\]()@-])/g, '\\$1');
// (v187-v194) the classic post, as before: the highlights in groups ("Most kills - on foot: A 14 · in vehicles: B 37"), only
// which parts are on applies; the post of a server not changed in the editor (v195: style 'classic')
function postLines(entry, on = linesOf({})) {
  const s = entry.sum, id = entry.name.replace(/\.bf2demo(\.gz)?$/i, ''), tk = s.tickets, T = s.teams || [], H = s.hl || {};
  const won = s.winner != null && T[s.winner] ? `${T[s.winner]} won${tk ? `, tickets ${tk[0][1]} : ${tk[1][1]}` : ''}` : tk ? `tickets ${tk[0][1]} : ${tk[1][1]}` : '';
  const top = (s.P || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0) || b.k - a.k).slice(0, 3);
  const L = [[[`${mapName(s.map)} · ${when(s.date)}`, 'b']], [[[won, `${Math.round((s.duration || 0) / 60)} min`, `${s.players} players`, `${s.kills} kills`].filter(Boolean).join(' · '), '']]];
  if (on.best && top.length) L.push([['Best: ', 'b'], [top.map((p, k) => `${k + 1}. ${p.name}${T[p.team] ? ` (${T[p.team]})` : ''} ${p.score ?? 0}`).join(' · '), '']]);
  if (on.board) for (const x of boardOf(s)) L.push([[x.side + ': ', 'b'], [x.rows.map((r, i) => `${i + 1}. ${r}`).join(' · '), '']]);   // (v207)
  if (on.records) for (const r of newRecords(entry)) L.push([['New record: ', 'b'], [recText(r), '']]);
  if (on.miles) for (const m of milestones(entry)) L.push([['Milestone: ', 'b'], [`${m.who} - ${m.what}`, '']]);   // (v215)
  // (v187) the highlights: a line for each group, its parts joined
  const who = o => o.who.join(', ') + (o.more ? ` +${o.more}` : ''), wpn = w => w ? ` (${w})` : '';
  // (a titled group: the title bold, its parts plain - "Most kills - on foot: A 14 · in vehicles: B 37"; untitled: each
  // part's name bold. The longest kill with any weapon only when it is not one of those shown already)
  const same = (a, b) => a && b && a.who === b.who && a.d === b.d && a.w === b.w;
  const group = (title, parts) => {
    const P = parts.filter(([k]) => on[k] && H[k] && !(k === 'longest' && LONG_KEYS.some(q => on[q] && same(H[q], H.longest)))).map(([k, label, f]) => [label, f(H[k])]); if (!P.length) return;
    const seg = title ? [[title, 'b'], [' - ', '']] : []; P.forEach(([label, text], i) => { if (i) seg.push([' · ', '']); seg.push([label + ': ', title ? '' : 'b'], [text, '']); }); L.push(seg);
  };
  const cnt = o => `${who(o)} ${o.n}`, far = o => `${o.who} ${o.d} m${wpn(o.w)}`;
  group('Most kills', [['foot', 'on foot', cnt], ['veh', 'in vehicles', cnt], ['hs', 'headshots', cnt], ['knife', 'knife', cnt], ['clay', 'claymores', cnt], ['mine', 'mines', cnt], ['atInf', 'launchers on infantry', cnt], ['road', 'run over', cnt], ['gren', 'grenades', cnt], ['gl', 'grenade launcher', cnt], ['c4', 'C4', cnt]]);
  group('Most kills with', [['handMost', 'hand-held weapons', cnt], ['atMost', 'hand-held anti-tank', cnt], ['standMost', 'TOW / HJ-8', cnt], ['tankMost', 'tank cannons', cnt], ['vehMost', 'vehicles', cnt], ['aaGunMost', 'anti-air guns', cnt], ['aaRktMost', 'anti-air rockets', cnt], ['a2aMost', 'air-to-air', cnt]]);   // (v207)
  group('Longest kill', [['atLong', 'launcher', far], ['smallLong', 'small arms', far], ['snipLong', 'sniper', far], ['standLong', 'TOW / HJ-8', far], ['tankLong', 'tank cannon', far], ['vehLong', 'vehicle', far], ['aaGunLong', 'anti-air gun', far], ['aaRktLong', 'anti-air rocket', far], ['a2aLong', 'air-to-air', far], ['longest', 'any', far]]);
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
export const tpl = (text, vars, app) => String(text || '').split('\n').map(l => tplLine(l, vars, app)).filter(l => l !== null).join('\n').trim();
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
      if (k === 'board' || k === 'records' || k === 'miles') { flush(); L.push(`${b(labelOf(F, k) + ':')}\n${V[k].vm.split('\n').filter(Boolean).map(e).join('\n')}`); continue; }   // (v207: a line each)
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
export const TEAM_RGB = [0xff6b4f, 0x5ea8ff], DRAW_RGB = 0xe2b547;
export const cut = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
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
    if (k === 'board' && V.board.sides) {   // (v207: each side a column, a row of its own)
      const blank = { name: '\u200b', value: '\u200b', inline: true, blank: true };
      if (run) { while (run < 3) { fields.push({ ...blank }); run++; } }
      for (const x of V.board.sides) fields.push({ name: cut(x.side, 256), value: cut(escDc(x.rows.map((r, i) => `${i + 1}. ${r}`).join('\n')), 1024), inline: true });
      fields.push({ ...blank }); run = 0; continue;
    }
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
// (v208) Discord as a table: a card whose text has the parts as a table in monospace (the columns line up) - a row
// each kind of kill: its name, the result, the player (last: on a phone a long one goes on to the next line, the
// columns stay); the new records a table of their own (the record, now, was, the player, under each time it beats);
// the best three and the server as text where they are in the order; the scoreboard after the text (Discord puts a
// card's fields there), each side a column. The card's title, line under it, stripe, map picture and bottom line.
const ROW_SKIP = new Set(['best', 'board', 'records', 'server', 'miles']);
const sameKill = (a, b) => a && b && a.who === b.who && a.d === b.d && a.w === b.w;
function rowOf(k, H, on) {   // (v211) { v: the number, who: { L: names, more }, ex: what goes after the number }
  const o = H[k]; if (!o) return null;
  const W = x => Array.isArray(x.who) ? { L: x.who.map(String), more: x.more || 0 } : { L: [String(x.who ?? '')], more: 0 }, one = t => ({ L: [t], more: 0 }), wp = w => w ? `(${w})` : '';
  const who = x => whoText(W(x), Infinity);
  if (k === 'longest' && LONG_KEYS.some(q => on[q] && sameKill(H[q], H.longest))) return null;
  if (k === 'longest' || LONG_KEYS.includes(k)) return { v: `${o.d} m`, who: W(o), ex: wp(o.w) };
  if (k === 'kd') return { v: String(o.r), who: W(o), ex: `(${o.k}/${o.d})` };
  if (k === 'flags') return { v: String(o.n), who: W(o), ex: `(${o.cap} cap, ${o.neu} neut)` };
  // (v218, Sagara) sub: a second line under it in the table post - first blood: the killer, then the one he killed and
  // with what; last killed: the one killed, then who killed him and with what (ex: the same in one line, for F.mono)
  if (k === 'first') return { v: mmss(o.t), who: W(o), ex: `→ ${o.vic}${o.w ? ` (${o.w})` : ''}`, sub: { who: one(String(o.vic ?? '')), w: o.w || '' } };   // (the killer in the column, his victim after)
  if (k === 'last') return { v: mmss(o.t), who: one(String(o.vic ?? '')), ex: `by ${who(o)}${o.tk ? ` (team kill${o.w ? ', ' + o.w : ''})` : o.w ? ` (${o.w})` : ''}`, sub: { who: W(o), w: (o.w || '') + (o.tk ? `${o.w ? ' ' : ''}(team kill)` : '') } };   // (the one killed in the column)
  return o.n === undefined ? null : { v: String(o.n), who: W(o), ex: '' };
}
// the names of a row, in at most max letters: a tie shortened to its first names and "+N" (A, B +3)
function whoText(W, max) {
  const all = W.L.join(', ') + (W.more ? ` +${W.more}` : ''); if (all.length <= max) return all;
  for (let n = W.L.length - 1; n >= 1; n--) { const t = W.L.slice(0, n).join(', ') + ` +${W.L.length - n + W.more}`; if (t.length <= max) return t; }
  return W.L[0] + (W.L.length > 1 || W.more ? ` +${W.L.length - 1 + W.more}` : '');
}
// a table in a code block: the first column left (at most 20 letters), the middle ones right, the last as it is; a
// string among the rows: a line of its own (a heading). No markdown inside; no ` (it would end the block). A row
// wider than a Discord card holds (~56 letters on a computer) goes on under its last column - after a name ("A, B"),
// before the weapon ("(L96A1)") - so the columns stay (Discord itself would go on at the line's start)
const LBL_MAX = 20, ROW_MAX = 55;
function wrapLast(t, at) {
  const room = ROW_MAX - at; if (t.length <= room) return t;
  const m = /^(.*\S) (\((?:[^()]|\([^()]*\))*\))$/.exec(t), toks = (m ? m[1] : t).split(/(?<=,) |(?<=→) | (?=by )/);   // (never inside a name)
  if (m) toks.push(m[2]);
  const out = []; let cur = '';
  for (const tok of toks) { if (!cur) cur = tok; else if (cur.length + 1 + tok.length <= room) cur += ' ' + tok; else { out.push(cur); cur = tok; } }
  if (cur) out.push(cur);
  return out.join('\n' + ' '.repeat(at));
}
export function monoTable(head, rows, sep = '  ') {
  const n = head.length, R = rows.filter(Array.isArray), cb = t => String(t ?? '').replace(/`/g, 'ˋ').replace(/\n/g, ' ');
  const w = head.map((h, i) => Math.max(h.length, ...R.map(r => cb(r[i]).length)));
  w[0] = Math.min(w[0], LBL_MAX);
  const at = w.slice(0, n - 1).reduce((a, x) => a + x + sep.length, 0);   // (where the last column starts)
  const fit = (t, i) => i === 0 ? (t.length > w[0] ? t.slice(0, w[0] - 1) + '.' : t.padEnd(w[0])) : i === n - 1 ? wrapLast(t, at) : t.padStart(w[i]);
  const line = r => r.map((t, i) => fit(cb(t), i)).join(sep).trimEnd();
  const out = [line(head), w.map((x, i) => '-'.repeat(i === n - 1 ? Math.min(x, 24) : x)).join(sep.replace(/ /g, '-'))];   // (plain - and .: a font without ─ … would put the columns out)
  for (const r of rows) out.push(Array.isArray(r) ? line(r) : cb(r));
  return '```\n' + out.join('\n') + '\n```';
}
// (v210, Sagara: "the numbers bold, and a | between the name and the number"; v211: "the | at one place in every row,
// by the longest nick, and the numbers at one level too") the rows as Discord text: the name and the player in
// monospace, each padded to the longest (no-break spaces: never squeezed), a | after each - so the |s stand in one
// column and the numbers start at one place - then the number bold and what goes with it (the weapon, was, ...):
// `On foot       | =SWE= =BRANDONMARTIN= |` **20**. Markdown has no bold inside code (and Discord's ANSI blocks show as
// codes on phones), so the number is out of it. A player wider than WHO_MAX: a tie shortened (A, B +3), a name cut.
// F.mono: all of it in one code block (v208), the |s too, nothing bold
// (v217, Sagara: "one space after the longest nick" - the rows wrapped again) the players' column as wide as its widest
// row in its shortest form: a nick, or a tie's first nick and "+N" (until v216 a tie in full, "A, B, C", to WHO_MAX: up
// to 9 spaces after the longest nick); a tie then as many of its nicks as fit that width (A, B / A +3)
const NBSP = '\u00a0', WHO_MAX = 26;
const codeText = t => String(t ?? '').replace(/`/g, 'ˋ').replace(/\n/g, ' ');
const whoShort = W => W.L.length > 1 || W.more ? `${W.L[0]} +${W.L.length - 1 + W.more}` : W.L[0] ?? '';
// a row's players in w letters at most: a tie's "+N" kept, its first nick cut instead (A. +3)
function whoFit(W, w) {
  const t = codeText(whoText(W, w)); if (t.length <= w) return t;
  const m = / \+\d+$/.exec(t); if (!m || w <= m[0].length + 1) return t.slice(0, w - 1) + '.';
  return t.slice(0, w - m[0].length - 1) + '.' + m[0];
}
// (v218) a row with sub (first blood, last killed): the number on its line, nothing after it; under it, with the label's
// column empty, sub's player in the players' column and after its | with what (not bold) - `            | B     |` AK-101
const subOk = r => r.sub && (whoShort(r.sub.who) || r.sub.w);
export function alignedRows(rows) {
  const R = rows.filter(r => r && typeof r === 'object');
  const lw = Math.min(LBL_MAX, Math.max(1, ...R.map(r => codeText(r.label).length))), ww = Math.min(WHO_MAX, Math.max(1, ...R.map(r => codeText(whoShort(r.who)).length), ...R.filter(subOk).map(r => codeText(whoShort(r.sub.who)).length)));
  const cell = (t, w) => { t = codeText(t); if (t.length > w) t = t.slice(0, w - 1) + '.'; return t + NBSP.repeat(w - t.length); };
  const row = r => {
    const head = '`' + cell(r.label, lw) + ' | ' + cell(whoFit(r.who, ww), ww) + ' |` **' + escDc(r.v) + '**';
    if (!subOk(r)) return head + (r.ex && !r.sub ? ' ' + escDc(r.ex) : '');   // (a last killed with no killer and no weapon: the time alone)
    return head + '\n`' + cell('', lw) + ' | ' + cell(whoFit(r.sub.who, ww) || '—', ww) + ' |`' + (r.sub.w ? ' ' + escDc(r.sub.w) : '');
  };
  return rows.map(r => !r || typeof r !== 'object' ? `*${escDc(r)}*` : row(r)).join('\n');
}
const monoRows = rows => rows.map(r => !r || typeof r !== 'object' ? r : [r.label, r.v, whoText(r.who, Infinity) + (r.ex ? ' ' + r.ex : '')]);   // (first blood: "A → B (gun)", last killed: "B by A (gun)")
const PER_HEAD = { ever: 'All time', month: 'Last 30 days', week: 'Last 7 days' };
function recTable(list, mono) {
  const A = aggFns(), rows = []; let per = '';
  for (const r of list) {
    if (r.per !== per) { per = r.per; rows.push(PER_HEAD[per] || per); }
    const label = A?.REC_SHORT?.[r.k] || r.name;
    rows.push(mono ? [label, recNum(r, r.v), recNum(r, r.prev), r.who + (r.w ? ` (${r.w})` : '')] : { label, who: { L: [r.who], more: 0 }, v: recNum(r, r.v), ex: `${r.w ? `(${r.w}) ` : ''}(was ${recNum(r, r.prev)})` });
  }
  return mono ? monoTable(['Record', 'Now', 'Was', 'Player'], rows, ' | ') : alignedRows(rows);
}
function tablePost(entry, F, on) {
  const s = entry.sum, H = s.hl || {}, V = itemVals(entry, on), vars = varsOf(entry, V), E = {};
  const title = tpl(F.title, vars, 'plain'); if (title) E.title = cut(title, 256);
  if (vars.link) E.url = vars.link;
  E.color = F.color !== 'winner' ? parseInt(F.color.slice(1), 16) : s.winner === 0 || s.winner === 1 ? TEAM_RGB[s.winner] : DRAW_RGB;
  const intro = tpl(F.intro, vars, 'discord'), blocks = [], rows = []; let at = -1;
  for (const k of F.order) {
    if (!on[k]) continue;
    if (!ROW_SKIP.has(k)) { const r = rowOf(k, H, on); if (r) { if (at < 0) { at = blocks.length; blocks.push(null); } rows.push({ label: F.labels[k] || TLABEL[k] || LABEL[k], ...r }); } continue; }
    if (k === 'board' || !V[k]) continue;
    if (k === 'records') blocks.push(`**${escDc(labelOf(F, k))}**\n${recTable(V.records.list, F.mono)}`);
    else blocks.push(V[k].vm ? `**${escDc(labelOf(F, k))}**\n${escDc(V[k].vm)}` : `**${escDc(labelOf(F, k))}:** ${escDc(V[k].v)}`);
  }
  // (Discord's limit for a card's text, 4096: the table's last rows go first)
  const desc = () => [intro, ...blocks.map((b, i) => i === at ? (rows.length ? (F.mono ? monoTable(['Kill', 'Result', 'Player'], monoRows(rows), ' | ') : alignedRows(rows)) : '') : b)].filter(Boolean).join('\n');
  while (desc().length > 4090 && rows.length) rows.pop();
  const d = desc(); if (d) E.description = cut(d, 4096);
  const fields = [];
  if (on.board && V.board?.sides) for (const x of V.board.sides) fields.push({ name: cut(x.side, 256), value: cut(escDc(x.rows.map((r, i) => `${i + 1}. ${r}`).join('\n')), 1024), inline: true });
  E.fields = fields;
  const ft = tpl(F.footer, vars, 'plain'); if (ft) E.footer = { text: cut(ft, 2048) };
  // (v213, Sagara: "the big picture at the bottom") a table never with the small picture top right: it takes its width
  // from the whole text of the card, and the rows wrap
  if (DOMAIN && F.image !== 'none') { const m = String(s.map || '').toLowerCase(), img = `https://${DOMAIN}/assets/og/${fs.existsSync(path.join(SITE, 'assets', 'og', m + '.jpg')) ? m : 'site'}.jpg`; E.image = { url: img }; }
  const size = () => (E.title || '').length + (E.description || '').length + (E.footer?.text || '').length + E.fields.reduce((n, x) => n + x.name.length + x.value.length, 0);
  while (size() > 5900 && E.fields.length) E.fields.pop();
  return E;
}
// (v195) the post about a round for each app, with a server's settings (c: srvCfg - format, lines; missing: the
// standard ones): { discord: { content } | { embeds }, telegram: HTML text }
export function renderPost(entry, c) {
  const F = normFormat(c?.format), on = app => linesOf(c?.[app]?.lines);
  if (F.style === 'classic') return { discord: { content: asDiscord(postLines(entry, on('discord'))) }, telegram: asTelegram(postLines(entry, on('telegram'))) };
  const dc = F.style === 'card' ? { embeds: [cardPost(entry, F, on('discord'))] } : F.style === 'table' ? { embeds: [tablePost(entry, F, on('discord'))] } : { content: textPost(entry, F, on('discord'), 'discord') };
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
export async function send(P, T, S) {
  const out = [];
  for (const t of T) {
    if (t.app === 'discord') out.push(['Discord', await post(t.url, { username: 'BF2 Round Replay', allowed_mentions: { parse: [] }, ...P.discord })]);   // (v220: a summary's own mentions - its text above)
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
