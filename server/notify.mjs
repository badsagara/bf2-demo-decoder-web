#!/usr/bin/env node
// BF2 Round Replay - a post about each new round in a Discord channel and / or a Telegram chat: the map, when, who won
// and the tickets, how long, players and kills, the best three by score and the link to the round (chat apps show the
// map's picture under it: the link preview, data/share/r). ingest.mjs calls it after each new round it lists.
//
//   node notify.mjs --test      a test post (the settings as they are now)
//   node notify.mjs --last      the newest round again (to see the post)
//
// Where to: a Discord webhook (Server settings -> Integrations -> Webhooks -> New webhook -> Copy webhook URL) and / or
// a Telegram bot (its token from @BotFather) and the chat it posts in (its id, or @channel). Set on the admin page
// (kept in data/.notify.json, which only the bf2replay user reads and the web server never serves), or in
// /etc/bf2replay.conf: BF2R_DISCORD_WEBHOOK, BF2R_TELEGRAM_TOKEN, BF2R_TELEGRAM_CHAT (these win). Nothing set: nothing
// is posted. Only rounds with BF2R_NOTIFY_MIN_PLAYERS players or more (6) and recorded in the last 12 hours (not old
// demos downloaded in a batch) are posted; demos made into clips by the page are not.
// (v187) What goes in a post: the admin page turns each part (POST_ITEMS) on or off for Discord and for Telegram apart
// (data/.notify.json: lines) - the best three, the server, and the round's highlights ingest.mjs sums up (sum.hl): the
// most kills on foot, in vehicles, headshots, knife, claymores, launchers on infantry, run over, explosives; the longest
// kill with a launcher, small arms, a sniper rifle and any weapon; the longest streak, the best K/D; revives, heals,
// repairs; flags; the first blood and the last one killed. All on until the admin page says otherwise.
import fs from 'node:fs';
import path from 'node:path';

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
const linesOf = (j, app) => Object.fromEntries(POST_ITEMS.map(([k]) => [k, j?.lines?.[app]?.[k] !== false]));
// the settings: /etc/bf2replay.conf first, then the admin page's file
export function notifySettings() {
  let j = {}; try { j = JSON.parse(fs.readFileSync(NOTIFY_FILE, 'utf8')) || {}; } catch (e) {}
  const pick = (k, v) => { const c = opt(k, ''); return c ? { v: c, conf: true } : { v: typeof v === 'string' ? v : '', conf: false }; };
  const d = pick('BF2R_DISCORD_WEBHOOK', j.discord), tt = pick('BF2R_TELEGRAM_TOKEN', j.telegram?.token), tc = pick('BF2R_TELEGRAM_CHAT', j.telegram?.chat);
  const mp = Math.floor(+opt('BF2R_NOTIFY_MIN_PLAYERS', '') || +j.minPlayers || 6);
  return { discord: d.v, discordConf: d.conf, tgToken: tt.v, tgTokenConf: tt.conf, tgChat: tc.v, tgChatConf: tc.conf, minPlayers: Math.max(1, Math.min(64, mp)), last: j.last || null,
    lines: { discord: linesOf(j, 'discord'), telegram: linesOf(j, 'telegram') } };
}
export function saveNotify(change) {
  let j = {}; try { j = JSON.parse(fs.readFileSync(NOTIFY_FILE, 'utf8')) || {}; } catch (e) {}
  Object.assign(j, change); if (change.telegram) j.telegram = { ...(j.telegram || {}), ...change.telegram };
  if (change.lines) j.lines = { discord: { ...(j.lines?.discord || {}), ...(change.lines.discord || {}) }, telegram: { ...(j.lines?.telegram || {}), ...(change.lines.telegram || {}) } };
  const tmp = NOTIFY_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(j, null, 1) + '\n', { mode: 0o600 }); fs.renameSync(tmp, NOTIFY_FILE);
}
const remember = (what, ok, msg) => { try { saveNotify({ last: { at: new Date().toISOString(), what, ok, msg: String(msg || '').slice(0, 300) } }); } catch (e) {} };

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
function postLines(entry, on = linesOf({}, 'discord')) {
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
// (v187) the post for a round as each app gets it (the admin page's preview)
export function postTexts(entry, S = notifySettings()) { return { discord: asDiscord(postLines(entry, S.lines.discord)), telegram: asTelegram(postLines(entry, S.lines.telegram)) }; }
// L: the lines for both apps, or a function app -> lines
async function send(L, S = notifySettings()) {
  const out = [], of = app => typeof L === 'function' ? L(app) : L;
  if (S.discord) {
    const r = await post(S.discord, { content: asDiscord(of('discord')), username: 'BF2 Round Replay', allowed_mentions: { parse: [] } }); out.push(['Discord', r]);
  }
  if (S.tgToken && S.tgChat) {
    const r = await post(`https://api.telegram.org/bot${S.tgToken}/sendMessage`, { chat_id: S.tgChat, text: asTelegram(of('telegram')), parse_mode: 'HTML' }); out.push(['Telegram', r]);
  }
  return out;
}
const told = R => R.map(([w, r]) => r.ok ? `${w}: posted` : `${w}: failed (${r.msg})`).join('; ');

// new rounds, as ingest.mjs lists them (rounds.json entries): one post each, the ones worth it
export async function notifyRounds(entries) {
  const S = notifySettings(); if (!S.discord && !(S.tgToken && S.tgChat)) return;
  for (const e of entries) {
    const s = e.sum; if (!s || s.empty || s.players < S.minPlayers || e.clip || !recent(s.date)) continue;
    const R = await send(app => postLines(e, S.lines[app]), S), m = told(R);
    log('round post', e.name, '-', m); remember(e.name, R.every(([, r]) => r.ok), m);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const S = notifySettings(), a = process.argv.slice(2);
  if (!S.discord && !(S.tgToken && S.tgChat)) { console.log('Nothing to post to: no Discord webhook, no Telegram bot token and chat (admin page, or /etc/bf2replay.conf).'); process.exit(1); }
  let L;
  if (a.includes('--test')) L = [[['BF2 Round Replay', 'b']], [['A test post: new rounds will be posted here like this.', '']], ...(DOMAIN ? [[[`https://${DOMAIN}/`, 'l']]] : [])];
  else if (a.includes('--last')) {
    let idx = { rounds: [] }; for (const f of ['.rounds-full.json', 'rounds.json']) { try { idx = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); break; } catch (e) {} }   // (v166: the whole list has the players' lines)
    const e = (idx.rounds || []).filter(r => r.sum && !r.sum.empty).sort((x, y) => String(y.sum.date).localeCompare(String(x.sum.date)))[0];
    if (!e) { console.log('No rounds yet.'); process.exit(1); }
    L = app => postLines(e, S.lines[app]);
  } else { console.log('node notify.mjs --test | --last'); process.exit(2); }
  const R = await send(L, S), m = told(R); console.log(m); remember(a.includes('--test') ? 'test' : 'newest round', R.every(([, r]) => r.ok), m);
  process.exit(R.every(([, r]) => r.ok) ? 0 : 1);
}
