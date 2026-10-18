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

// the settings: /etc/bf2replay.conf first, then the admin page's file
export function notifySettings() {
  let j = {}; try { j = JSON.parse(fs.readFileSync(NOTIFY_FILE, 'utf8')) || {}; } catch (e) {}
  const pick = (k, v) => { const c = opt(k, ''); return c ? { v: c, conf: true } : { v: typeof v === 'string' ? v : '', conf: false }; };
  const d = pick('BF2R_DISCORD_WEBHOOK', j.discord), tt = pick('BF2R_TELEGRAM_TOKEN', j.telegram?.token), tc = pick('BF2R_TELEGRAM_CHAT', j.telegram?.chat);
  const mp = Math.floor(+opt('BF2R_NOTIFY_MIN_PLAYERS', '') || +j.minPlayers || 6);
  return { discord: d.v, discordConf: d.conf, tgToken: tt.v, tgTokenConf: tt.conf, tgChat: tc.v, tgChatConf: tc.conf, minPlayers: Math.max(1, Math.min(64, mp)), last: j.last || null };
}
export function saveNotify(change) {
  let j = {}; try { j = JSON.parse(fs.readFileSync(NOTIFY_FILE, 'utf8')) || {}; } catch (e) {}
  Object.assign(j, change); if (change.telegram) j.telegram = { ...(j.telegram || {}), ...change.telegram };
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

// the post: lines of [text, kind] - kind 'b' bold, 'l' a link, '' plain - for each app's own markup
function postLines(entry) {
  const s = entry.sum, id = entry.name.replace(/\.bf2demo(\.gz)?$/i, ''), tk = s.tickets, T = s.teams || [];
  const won = s.winner != null && T[s.winner] ? `${T[s.winner]} won${tk ? `, tickets ${tk[0][1]} : ${tk[1][1]}` : ''}` : tk ? `tickets ${tk[0][1]} : ${tk[1][1]}` : '';
  const top = (s.P || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0) || b.k - a.k).slice(0, 3);
  const L = [[`${mapName(s.map)} · ${when(s.date)}`, 'b'], [[won, `${Math.round((s.duration || 0) / 60)} min`, `${s.players} players`, `${s.kills} kills`].filter(Boolean).join(' · '), '']];
  if (top.length) L.push(['Best: ' + top.map((p, k) => `${k + 1}. ${p.name}${T[p.team] ? ` (${T[p.team]})` : ''} ${p.score ?? 0}`).join(' · '), '']);
  if (s.server) L.push([s.server, '']);
  if (DOMAIN) L.push([`https://${DOMAIN}/r/${encodeURIComponent(id)}`, 'l']);
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
async function send(L, S = notifySettings()) {
  const out = [];
  if (S.discord) {
    const content = L.map(([t, k]) => k === 'b' ? `**${escDc(t)}**` : k === 'l' ? t : escDc(t)).join('\n').slice(0, 1900);
    const r = await post(S.discord, { content, username: 'BF2 Round Replay', allowed_mentions: { parse: [] } }); out.push(['Discord', r]);
  }
  if (S.tgToken && S.tgChat) {
    const text = L.map(([t, k]) => k === 'b' ? `<b>${escTg(t)}</b>` : escTg(t)).join('\n').slice(0, 3900);
    const r = await post(`https://api.telegram.org/bot${S.tgToken}/sendMessage`, { chat_id: S.tgChat, text, parse_mode: 'HTML' }); out.push(['Telegram', r]);
  }
  return out;
}
const told = R => R.map(([w, r]) => r.ok ? `${w}: posted` : `${w}: failed (${r.msg})`).join('; ');

// new rounds, as ingest.mjs lists them (rounds.json entries): one post each, the ones worth it
export async function notifyRounds(entries) {
  const S = notifySettings(); if (!S.discord && !(S.tgToken && S.tgChat)) return;
  for (const e of entries) {
    const s = e.sum; if (!s || s.empty || s.players < S.minPlayers || e.clip || !recent(s.date)) continue;
    const R = await send(postLines(e), S), m = told(R);
    log('round post', e.name, '-', m); remember(e.name, R.every(([, r]) => r.ok), m);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const S = notifySettings(), a = process.argv.slice(2);
  if (!S.discord && !(S.tgToken && S.tgChat)) { console.log('Nothing to post to: no Discord webhook, no Telegram bot token and chat (admin page, or /etc/bf2replay.conf).'); process.exit(1); }
  let L;
  if (a.includes('--test')) L = [['BF2 Round Replay', 'b'], ['A test post: new rounds will be posted here like this.', ''], ...(DOMAIN ? [[`https://${DOMAIN}/`, 'l']] : [])];
  else if (a.includes('--last')) {
    let idx = { rounds: [] }; try { idx = JSON.parse(fs.readFileSync(path.join(DATA, 'rounds.json'), 'utf8')); } catch (e) {}
    const e = (idx.rounds || []).filter(r => r.sum && !r.sum.empty).sort((x, y) => String(y.sum.date).localeCompare(String(x.sum.date)))[0];
    if (!e) { console.log('No rounds yet.'); process.exit(1); }
    L = postLines(e);
  } else { console.log('node notify.mjs --test | --last'); process.exit(2); }
  const R = await send(L, S), m = told(R); console.log(m); remember(a.includes('--test') ? 'test' : 'newest round', R.every(([, r]) => r.ok), m);
  process.exit(R.every(([, r]) => r.ok) ? 0 : 1);
}
