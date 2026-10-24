#!/usr/bin/env node
// BF2 Round Replay (v209, Sagara: "a wider summary - a post once a day, a week and a month with the server's players over
// that time") - a summary of a game server's rounds, posted to its Discord channel and / or Telegram chat (v220: their
// own settings, normDigestFmt - an own Discord channel or the round posts', what is in them; until then the round posts'
// channels; the admin page turns each of the three on for each server, all off until then): the day before, the week before (Monday to
// Sunday, posted on Monday), the month before (posted on the 1st) - at BF2R_DIGEST_AT (10:00) in BF2R_DIGEST_TZ
// (Europe/Bratislava). A period's rounds by their own time (the date in the demo: the game server's clock), with the
// server's fewest players (as its round posts). In it: the server's numbers (rounds, players, kills, hours, maps), the
// best ten by score (score, kills-deaths, K/D, rounds), the leaders of each kind of kill over the period (added up), the
// best in one round of the period (most kills, score, streaks, K/D, the longest kills); Discord: cards, the tables in
// monospace (notify.mjs monoTable, as the round posts' table); Telegram: text.
//
//   node digest.mjs --due                            post those due (bf2replay-digest.timer, every 10 minutes)
//   node digest.mjs --post day|week|month <server>   that server's last one now (the admin page's "Post it now")
//   node digest.mjs --show day|week|month <server>   print it, nothing sent
//
// A period is done once posted (data/.notify.json: servers[name].digestLast); a period with no rounds is done without
// a post; a post that failed is tried again at the next runs, 6 times at most. Turned on, the first one comes at the
// next 10:00 (not at once for the period that is already over).
import { opt, DOMAIN, SITE, log, notifySettings, saveNotify, serverOf, mapName, aggFns, allRounds, escTg, escDc, DRAW_RGB, cut, monoTable, send, alignedRows, tpl, DISCORD_RE } from './notify.mjs';
import fs from 'node:fs';
import { SUM_V } from './roundsidx.mjs';   // (v231)
import path from 'node:path';

export const DIGEST_TZ = String(opt('BF2R_DIGEST_TZ', 'Europe/Bratislava')).trim() || 'Europe/Bratislava';
const ATM = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(opt('BF2R_DIGEST_AT', '10:00')).trim()) || [null, '10', '00'];
export const DIGEST_AT = `${ATM[1].padStart(2, '0')}:${ATM[2]}`;
const AT_MIN = +ATM[1] * 60 + +ATM[2];
export const KINDS = ['day', 'week', 'month'];
const KIND_T = { day: 'Day', week: 'Week', month: 'Month' }, KIND_OF = { day: 'of the day', week: 'of the week', month: 'of the month' };
const KD_MIN = { day: 20, week: 50, month: 100 };   // (K/D over the period: of those with so many kills or more)
const TRIES = 6;

// the wall clock in DIGEST_TZ (a wrong zone: UTC)
function wall(t) {
  try {
    const P = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: DIGEST_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
    return { y: +P.year, m: +P.month, d: +P.day, hh: +P.hour % 24, mm: +P.minute };
  } catch (e) { const D = new Date(t); return { y: D.getUTCFullYear(), m: D.getUTCMonth() + 1, d: D.getUTCDate(), hh: D.getUTCHours(), mm: D.getUTCMinutes() }; }
}
const DAY = 86400e3, ymd = D => D.toISOString().slice(0, 10), utc = (y, m0, d) => new Date(Date.UTC(y, m0, d));
const fmt = (D, o) => D.toLocaleDateString('en-GB', { timeZone: 'UTC', ...o });
// the last period of a kind that is over by now: { kind, key, from, to, label } - from DIGEST_AT on the day it is
// posted (before that: the one before, already posted)
export function periodOf(kind, now = Date.now()) {
  const w = wall(now); let D = utc(w.y, w.m - 1, w.d);
  if (w.hh * 60 + w.mm < AT_MIN) D = new Date(+D - DAY);
  let f, t, label;
  if (kind === 'day') { f = t = new Date(+D - DAY); label = fmt(f, { weekday: 'short', day: 'numeric', month: 'short' }); }
  else if (kind === 'week') {
    const mon = new Date(+D - ((D.getUTCDay() + 6) % 7) * DAY); f = new Date(+mon - 7 * DAY); t = new Date(+mon - DAY);
    label = f.getUTCMonth() === t.getUTCMonth() ? `${f.getUTCDate()}–${fmt(t, { day: 'numeric', month: 'short' })}` : `${fmt(f, { day: 'numeric', month: 'short' })} – ${fmt(t, { day: 'numeric', month: 'short' })}`;
  } else { f = utc(D.getUTCFullYear(), D.getUTCMonth() - 1, 1); t = utc(D.getUTCFullYear(), D.getUTCMonth(), 0); label = fmt(f, { month: 'long', year: 'numeric' }); }
  return { kind, key: ymd(f), from: ymd(f), to: ymd(t), label };
}

// the rows: added up over the period (each kind of kill; K/D apart), and the best in one round
// (v213) the short names of the round posts' table (Sagara's)
const SUM_KEYS = [['foot', 'On foot'], ['kVeh', 'Veh'], ['hs', 'Hs'], ['kn', 'Knife'], ['cl', 'Claymores'], ['mi', 'Mines'], ['ai', 'AT on inf'], ['rd', 'Run over'], ['gr', 'Grenades'], ['gl', 'GL'], ['c4', 'C4'],
  ['hk', 'Hand-held'], ['atk', 'AT'], ['stk', 'TOW'], ['tck', 'Tank'], ['vk', 'Veh weap'], ['agk', 'AA gun'], ['ark', 'SAM'], ['aak', 'Air2Air'],
  ['rev', 'Revives'], ['heal', 'Heals'], ['rep', 'Repairs'], ['fl', 'Flags']];
const BEST_KEYS = [['k', 'Kills'], ['score', 'Score'], ['sf', 'Inf Spree'], ['sv', 'Veh Spree'], ['kd', 'K/D (10+ kills)'], ['lg', 'Far kill'], ['sl', 'Far Gun'], ['sn', 'Far Sniper'],
  ['al', 'Far AT'], ['stl', 'Far TOW'], ['tcl', 'Far Tank'], ['vl', 'Far Veh'], ['agl', 'Far AA'], ['arl', 'Far SAM'], ['aal', 'Far Air2Air']];
const whoOf = L => L.slice(0, 3).join(', ') + (L.length > 3 ? ` +${L.length - 3}` : '');
const num = v => Number(v).toLocaleString('en-GB');

// a server's summary of a period: null fields when it had no rounds
export function digestOf(server, kind, now = Date.now()) {
  const S = notifySettings(), c = S.servers[server], mp = c?.minPlayers || S.minPlayers, P = periodOf(kind, now), A = aggFns();
  if (!A || !A.recVal || !A.REC_KEYS) throw new Error("the page's records code did not load (site/index.html)");
  const R = allRounds().filter(r => { const s = r.sum, d = String(s?.date || '').slice(0, 10); return s && !s.empty && Array.isArray(s.P) && serverOf(r) === server && (s.players || 0) >= mp && d >= P.from && d <= P.to; })
    .sort((a, b) => String(a.sum.date).localeCompare(String(b.sum.date)));
  const out = { server, kind, period: P, minPlayers: mp, rounds: R.length };
  // (v231) rounds of the period still summed up by an older summarize (ingest.mjs SUM_V: after an update every round is
  // summed up again, ~0.5 s each) - runDue waits for them (v221-v230's summaries had no score)
  out.stale = R.filter(r => r.bfr && (r.sumV || 1) < SUM_V).length;
  if (!R.length) return out;
  const bot = n => /^Player \d+$/.test(A.nickOf(n)), unit = Object.fromEntries(A.REC_KEYS.map(([k, , u]) => [k, u || '']));
  // the server's numbers
  const nicks = new Set(), maps = new Map(); let kills = 0, secs = 0;
  for (const r of R) { kills += r.sum.kills || 0; secs += r.sum.duration || 0; const m = String(r.sum.map || '').toLowerCase(); maps.set(m, (maps.get(m) || 0) + 1); for (const p of r.sum.P) if (!bot(p.name)) nicks.add(A.nickOf(p.name)); }
  out.numbers = { rounds: R.length, players: nicks.size, kills, hours: Math.round(secs / 360) / 10, maps: [...maps].map(([m, n]) => [mapName(m), n, m]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) };
  // each player over the period, by nick (his name of the newest round)
  const M = new Map();
  for (const r of R) { const seen = new Set(); for (const p of r.sum.P) {
    if (bot(p.name)) continue; const nk = A.nickOf(p.name); let a = M.get(nk); if (!a) M.set(nk, a = { name: p.name, rounds: 0, score: 0, k: 0, d: 0, sums: {}, y: { dw: 0, dl: 0, dm: 0, n: 0 } });
    a.name = p.name; if (!seen.has(nk)) { a.rounds++; seen.add(nk); }
    a.score += p.score || 0; a.k += p.k || 0; a.d += p.d || 0;
    if (p.y) { a.y.dw += p.y.dw || 0; a.y.dl += p.y.dl || 0; a.y.dm += p.y.dm || 0; a.y.n++; }   // (v215: duels, damage)
    for (const [k] of SUM_KEYS) { const [v] = A.recVal(p, k); if (v > 0) a.sums[k] = (a.sums[k] || 0) + v; }
  } }
  const all = [...M.values()];
  out.top = all.slice().sort((a, b) => b.score - a.score || b.k - a.k || a.d - b.d).slice(0, 10).map(a => ({ name: a.name, score: a.score, k: a.k, d: a.d, kd: Math.round(a.k / Math.max(1, a.d) * 100) / 100, rounds: a.rounds }));
  // (v215, Sagara's todo 265) the player of the day / week / month: the most score a round, with 2 / 3 / 5 rounds or more
  { const min = { day: 2, week: 3, month: 5 }[kind] || 3, C = all.filter(a => a.rounds >= min).sort((a, b) => b.score / b.rounds - a.score / a.rounds || b.k / Math.max(1, b.d) - a.k / Math.max(1, a.d));
    if (C.length) { const a = C[0]; out.pow = { name: a.name, rounds: a.rounds, spr: Math.round(a.score / a.rounds), k: a.k, d: a.d, kd: Math.round(a.k / Math.max(1, a.d) * 100) / 100, min, ...(a.y.dw + a.y.dl ? { duel: Math.round(a.y.dw / (a.y.dw + a.y.dl) * 100) } : {}), ...(a.y.n ? { dmr: Math.round(a.y.dm / a.y.n) } : {}) }; } }
  // the leaders, added up (a tie: all of them, the first three named)
  out.leaders = [];
  for (const [k, label] of SUM_KEYS) {
    let best = 0, who = []; for (const a of all) { const v = a.sums[k] || 0; if (v > best) { best = v; who = [a.name]; } else if (v === best && v > 0) who.push(a.name); }
    if (best > 0) out.leaders.push({ k, label, v: String(best), who: whoOf(who), whoL: who });
  }
  { const min = KD_MIN[kind]; let best = 0, who = [], wl = []; for (const a of all) { if (a.k < min) continue; const v = Math.round(a.k / Math.max(1, a.d) * 100) / 100; if (v > best) { best = v; who = [`${a.name} (${a.k}/${a.d})`]; wl = [a]; } else if (v === best) { who.push(`${a.name} (${a.k}/${a.d})`); wl.push(a); } }
    if (best > 0) out.leaders.push({ k: 'kd', label: `K/D (${min}+ kills)`, v: best.toFixed(2), who: whoOf(who), whoL: wl.map(a => a.name), ex: wl.length === 1 ? `(${wl[0].k}/${wl[0].d})` : '' }); }
  // the best in one round (a tie: the earlier round)
  out.bests = [];
  for (const [k, label] of BEST_KEYS) {
    let b = null; for (const r of R) for (const p of r.sum.P) { if (bot(p.name)) continue; const [v, w] = A.recVal(p, k); if (v > 0 && (!b || v > b.v)) b = { v, w: w || '', who: p.name, r }; }
    if (!b) continue;
    const where = [b.w, out.numbers.maps.length > 1 ? mapName(b.r.sum.map) : '', kind === 'day' ? '' : fmt(new Date(String(b.r.sum.date).slice(0, 10) + 'T00:00:00Z'), { day: 'numeric', month: 'short' })].filter(Boolean).join(', ');
    out.bests.push({ k, label, v: unit[k] === 'm' ? `${b.v} m` : k === 'kd' ? Number(b.v).toFixed(2) : String(b.v), who: b.who, where });
  }
  // (the longest kill with any weapon: not when it is one of the weapons' groups' longest already)
  const lg = out.bests.find(x => x.k === 'lg'); if (lg && out.bests.some(x => x !== lg && ['sl', 'sn', 'al', 'stl', 'tcl', 'vl', 'agl', 'arl', 'aal'].includes(x.k) && x.v === lg.v && x.who === lg.who && x.where === lg.where)) out.bests.splice(out.bests.indexOf(lg), 1);
  return out;
}
const linkOf = D => DOMAIN ? `https://${DOMAIN}/#rounds=1&srv=${encodeURIComponent(D.server)}&from=${D.period.from}&to=${D.period.to}${D.minPlayers > 1 ? `&min=${D.minPlayers}` : ''}` : '';
const titleOf = D => `${KIND_T[D.kind]} summary: ${D.period.label} · ${D.server}`;
const mapsLine = (N, n = 5) => N.maps.slice(0, n).map(([m, c]) => `${m} ${c}`).join(' · ') + (N.maps.length > n ? ` · +${N.maps.length - n} more` : '');

// (v220, Sagara: "Discord settings not only for the round posts but for the digests too") each server's summaries their
// own settings (data/.notify.json servers[name].digestFmt; the admin page: "The summary"): where they go - Discord to
// their own channel (a webhook of their own) or to the round posts' one, whether the round posts go there or not;
// Telegram to the round posts' chat - what is in them (DG_PARTS; the top's length; which leaders and bests), the title,
// a line under it, a text above the cards (a mention: @here, <@&role>), the bottom line, the stripe's colour, and the
// leaders' and bests' tables: exact columns (monospace, as up to v219) or bold numbers with a | before them (as the
// round posts' table)
export const DG_PARTS = [['numbers', 'Numbers', 'rounds, players, kills and hours of the period'], ['maps', 'Maps', 'the maps played, the most first'],
  ['pow', 'Player of the period', 'the most score a round (with 2 / 3 / 5 rounds or more)'], ['top', 'Top by score', 'score, kills-deaths, K/D and rounds of the best'],
  ['leaders', 'Leaders', 'the most of each kind of kill over the period, added up'], ['bests', 'Best in one round', 'the most in one round of the period, the longest kills'],
  ['thumb', 'Map picture', 'the map played most, top right (Discord)'], ['link', 'Link', "to the period's rounds on the site"]];
export const DG_VARS = [['kind', 'Day / Week / Month'], ['period', 'the period (Mon 19 Oct, 12–18 Oct, October 2026)'], ['from', 'its first day'], ['to', 'its last day'], ['server', "the server's name"],
  ['rounds', 'rounds'], ['players', 'players'], ['kills', 'kills'], ['hours', 'hours played'], ['pow', 'the player of the period'], ['min', 'fewest players a round counted has'], ['link', 'the link to the rounds']];
export const DG_LEADERS = SUM_KEYS.concat([['kd', 'K/D']]), DG_BESTS = BEST_KEYS;
export const DG_FMT_DEFAULT = { title: '{kind} summary: {period} · {server}', intro: '', content: '', footer: 'BF2 Round Replay · rounds with {min}+ players, by the time in the demo', color: 'default', topN: 10, rows: 'mono' };
export const DG_TOP_N = [3, 5, 10, 15, 20];
// the saved settings filled in (f: as saved, or the editor's; c: the server's - before any is saved, Discord and Telegram
// as its round posts are)
export function normDigestFmt(f, c) {
  f = f && typeof f === 'object' ? f : {}; const str = (v, d, n) => typeof v === 'string' ? v.slice(0, n) : d;
  const parts = {}; for (const [k] of DG_PARTS) parts[k] = f.parts && typeof f.parts === 'object' && k in f.parts ? !!f.parts[k] : true;
  const off = (o, keys) => { const r = {}; if (o && typeof o === 'object') for (const [k] of keys) if (k in o && !o[k]) r[k] = false; return r; };   // (only those turned off)
  return { set: !!Object.keys(f).length, dcOn: typeof f.dcOn === 'boolean' ? f.dcOn : !!c?.discord?.on, dcWebhook: typeof f.dcWebhook === 'string' && DISCORD_RE.test(f.dcWebhook) ? f.dcWebhook : '',
    tgOn: typeof f.tgOn === 'boolean' ? f.tgOn : !!c?.telegram?.on,
    title: str(f.title, DG_FMT_DEFAULT.title, 256), intro: str(f.intro, '', 600), content: str(f.content, '', 300), footer: str(f.footer, DG_FMT_DEFAULT.footer, 300),
    color: typeof f.color === 'string' && /^#[0-9a-f]{6}$/i.test(f.color) ? f.color.toLowerCase() : 'default',
    topN: DG_TOP_N.includes(+f.topN) ? +f.topN : DG_FMT_DEFAULT.topN, rows: f.rows === 'rows' ? 'rows' : 'mono', parts, leaders: off(f.leaders, DG_LEADERS), bests: off(f.bests, DG_BESTS) };
}
// where a server's summaries go: [{ app, url | chat, own }]
export function digestTargets(S, server, F) {
  const c = S.servers[server], out = []; if (!c) return out; F = F || normDigestFmt(c.digestFmt, c);
  const url = F.dcWebhook || c.discord.webhook; if (F.dcOn && url) out.push({ app: 'discord', url, own: !!F.dcWebhook });
  if (F.tgOn && c.telegram.chat && S.tgToken) out.push({ app: 'telegram', chat: c.telegram.chat });
  return out;
}
const varsOf = D => { const N = D.numbers || {}; return { kind: KIND_T[D.kind], period: D.period.label, from: D.period.from, to: D.period.to, server: D.server, rounds: N.rounds != null ? num(N.rounds) : '0',
  players: N.players != null ? num(N.players) : '', kills: N.kills != null ? num(N.kills) : '', hours: N.hours != null ? String(N.hours) : '', pow: D.pow?.name || '', min: String(D.minPlayers), link: linkOf(D) }; };
// (a text above the cards that mentions @here / @everyone or a role: let it ping them - the round posts never do)
const mentionsOf = t => { const roles = [...String(t).matchAll(/<@&(\d{5,25})>/g)].map(m => m[1]), all = /@(everyone|here)\b/.test(t); return all || roles.length ? { parse: all ? ['everyone'] : [], ...(roles.length ? { roles: [...new Set(roles)].slice(0, 100) } : {}) } : { parse: [] }; };

// Discord: cards (a message holds 10 and 6000 letters: more messages when it is more) - the numbers and the best ten;
// the leaders; the best in one round
const POW_OF = { day: 'of the day', week: 'of the week', month: 'of the month' };
const powLine = a => `${num(a.spr)} score a round over ${a.rounds} rounds · ${a.k}-${a.d} (K/D ${a.kd.toFixed(2)})${a.duel != null ? ` · duels won ${a.duel}%` : ''}${a.dmr != null ? ` · damage ${a.dmr} a round` : ''}`;
const leadersOf = (D, F) => F.parts.leaders ? D.leaders.filter(x => F.leaders[x.k] !== false) : [];
const bestsOf = (D, F) => F.parts.bests ? D.bests.filter(x => F.bests[x.k] !== false) : [];
export function discordOf(D, F) {
  F = F || normDigestFmt(null, null);
  const N = D.numbers, E = [], V = varsOf(D), P = F.parts, color = F.color === 'default' ? DRAW_RGB : parseInt(F.color.slice(1), 16);
  const fitRows = (rows, build) => { let d = build(rows); while (d.length > 4090 && rows.length > 1) { rows = rows.slice(0, -1); d = build(rows); } return d; };
  const first = { color }, title = tpl(F.title, V, 'plain');
  if (title) first.title = cut(title, 256);
  const link = linkOf(D); if (link && P.link) first.url = link;
  const head = [];
  if (P.numbers) head.push(`**${num(N.rounds)} round${N.rounds === 1 ? '' : 's'}** · ${num(N.players)} players · ${num(N.kills)} kills · ${N.hours} h`);
  if (P.maps) head.push(escDc('Maps: ' + mapsLine(N)));
  const intro = tpl(F.intro, V, 'discord'); if (intro) head.push(intro);
  if (P.pow && D.pow) head.push(`**Player ${POW_OF[D.kind] || ''}: ${escDc(D.pow.name)}** · ${escDc(powLine(D.pow))}`);
  const top = P.top ? D.top.slice(0, F.topN).map((a, i) => [String(i + 1), num(a.score), `${a.k}-${a.d}`, a.kd.toFixed(2), String(a.rounds), a.name]) : [];
  const desc = top.length ? fitRows(top, rows => `${head.join('\n')}${head.length ? '\n' : ''}**Top ${rows.length} by score**\n${monoTable(['#', 'Score', 'K-D', 'K/D', 'Rnd', 'Player'], rows)}`) : head.join('\n');
  if (desc) first.description = desc;
  if (!first.title && !first.description) first.description = escDc(titleOf(D));
  if (DOMAIN && P.thumb) { const m = N.maps[0]?.[2] || ''; first.thumbnail = { url: `https://${DOMAIN}/assets/og/${m && fs.existsSync(path.join(SITE, 'assets', 'og', m + '.jpg')) ? m : 'site'}.jpg` }; }   // (the map played most)
  E.push(first);
  // the leaders and the bests: exact columns, or bold numbers with a | before them (F.rows)
  const L = leadersOf(D, F), B = bestsOf(D, F);
  if (L.length) E.push({ color, description: fitRows(L, rows => `**Leaders ${KIND_OF[D.kind]}** · added up\n` + (F.rows === 'rows'
    ? alignedRows(rows.map(x => ({ label: x.label, who: { L: x.whoL || [x.who], more: 0 }, v: x.v, ex: x.ex || '' })))
    : monoTable(['Most', 'Total', 'Player'], rows.map(x => [x.label, x.v, x.who])))) });
  if (B.length) E.push({ color, description: fitRows(B, rows => `**Best in one round ${KIND_OF[D.kind]}**\n` + (F.rows === 'rows'
    ? alignedRows(rows.map(x => ({ label: x.label, who: { L: [x.who], more: 0 }, v: x.v, ex: x.where ? `(${x.where})` : '' })))
    : monoTable(['Record', 'Best', 'Player'], rows.map(x => [x.label, x.v, x.who + (x.where ? ` (${x.where})` : '')])))) });
  const ft = tpl(F.footer, V, 'plain'); if (ft) E[E.length - 1].footer = { text: cut(ft, 2048) };
  // into messages
  const size = e => (e.title || '').length + (e.description || '').length + (e.footer?.text || '').length;
  const msgs = []; let cur = [], n = 0;
  for (const e of E) { if (cur.length && (n + size(e) > 5900 || cur.length >= 10)) { msgs.push({ embeds: cur }); cur = []; n = 0; } cur.push(e); n += size(e); }
  if (cur.length) msgs.push({ embeds: cur });
  const content = tpl(F.content, V, 'discord'); if (content) { msgs[0].content = cut(content, 2000); msgs[0].allowed_mentions = mentionsOf(F.content); }
  return msgs;
}
// Telegram: text (HTML), as many messages as it takes (4096 letters each; whole lines) - the same parts and order
export function telegramOf(D, F) {
  F = F || normDigestFmt(null, null);
  const N = D.numbers, P = F.parts, V = varsOf(D), b = t => `<b>${escTg(t)}</b>`, L = [];
  const title = tpl(F.title, V, 'plain'); L.push(b(title || titleOf(D)));
  if (P.numbers) L.push(escTg(`${num(N.rounds)} round${N.rounds === 1 ? '' : 's'} · ${num(N.players)} players · ${num(N.kills)} kills · ${N.hours} h`));
  if (P.maps) L.push(escTg('Maps: ' + mapsLine(N)));
  const intro = tpl(F.intro, V, 'telegram'); if (intro) L.push(intro);
  if (P.pow && D.pow) L.push('', `${b(`Player ${POW_OF[D.kind] || ''}:`)} ${escTg(D.pow.name)} · ${escTg(powLine(D.pow))}`);   // (v215)
  if (P.top && D.top.length) { const T = D.top.slice(0, F.topN); L.push('', b(`Top ${T.length} by score`)); T.forEach((a, i) => L.push(escTg(`${i + 1}. ${a.name} ${num(a.score)} (${a.k}–${a.d}, K/D ${a.kd.toFixed(2)}, ${a.rounds} round${a.rounds === 1 ? '' : 's'})`))); }
  const LD = leadersOf(D, F), BS = bestsOf(D, F);
  if (LD.length) { L.push('', b(`Leaders ${KIND_OF[D.kind]} (added up)`)); for (const x of LD) L.push(`${b(x.label + ':')} ${escTg(`${x.who} ${x.v}`)}`); }
  if (BS.length) { L.push('', b(`Best in one round ${KIND_OF[D.kind]}`)); for (const x of BS) L.push(`${b(x.label + ':')} ${escTg(`${x.who} ${x.v}${x.where ? ` (${x.where})` : ''}`)}`); }
  const ft = tpl(F.footer, V, 'telegram'); if (ft) L.push('', `<i>${ft}</i>`);
  const link = linkOf(D); if (link && P.link) L.push('', escTg(link));
  const msgs = []; let cur = '';
  for (const l of L) { if (cur && cur.length + l.length + 1 > 3900) { msgs.push(cur.replace(/\n+$/, '')); cur = ''; } cur += (cur ? '\n' : '') + l; }
  if (cur.trim()) msgs.push(cur.replace(/\n+$/, ''));
  return msgs;
}
// the admin page's preview (fmt: the editor's settings, saved or not; none: the saved ones)
export function digestTexts(server, kind, now = Date.now(), fmt) {
  const S = notifySettings(), c = S.servers[server], F = normDigestFmt(fmt !== undefined ? fmt : c?.digestFmt, c);
  const D = digestOf(server, kind, now), T = digestTargets(S, server, F), base = { ok: true, server, kind, period: D.period, rounds: D.rounds, minPlayers: D.minPlayers, to: T.map(t => t.app === 'discord' ? (t.own ? 'Discord (its own channel)' : "Discord (the round posts' channel)") : 'Telegram') };
  if (!D.rounds) return { ...base, discord: [], telegram: [], content: '' };
  const M = discordOf(D, F);
  return { ...base, discord: M.flatMap(m => m.embeds), content: M[0]?.content || '', telegram: telegramOf(D, F) };
}
// to a server's channels (the round posts'): each message in turn; [[app, { ok, msg }]]
async function deliver(D, T, S, F) {
  const out = [], dc = discordOf(D, F), tg = telegramOf(D, F);
  for (const t of T) {
    const parts = t.app === 'discord' ? dc : tg; let res = { ok: true };
    for (const m of parts) { const R = await send(t.app === 'discord' ? { discord: m } : { telegram: m }, [t], S); res = R[0][1]; if (!res.ok) break; }
    out.push([t.app === 'discord' ? 'Discord' : 'Telegram', res]);
  }
  return out;
}
const told = R => R.map(([w, r]) => r.ok ? `${w}: posted` : `${w}: failed (${r.msg})`).join('; ');
const saveSrv = (server, f) => { const c = notifySettings().servers[server]; if (c) saveNotify({}, server, f(c)); };
// the ones due now, every server
export async function runDue(now = Date.now()) {
  const S = notifySettings(); let n = 0;
  for (const [server, c] of Object.entries(S.servers)) for (const kind of KINDS) {
    if (!c.digest[kind]) continue;
    const P = periodOf(kind, now); if (c.digestLast[kind] === P.key) continue;
    const tr = c.digestTry[kind]; if (tr && tr.key === P.key && tr.n >= TRIES) continue;
    const what = `${kind} ${P.label}`, F = normDigestFmt(c.digestFmt, c), T = digestTargets(S, server, F);
    if (!T.length) { saveSrv(server, x => ({ digestLast: { ...x.digestLast, [kind]: P.key }, digestLog: { ...x.digestLog, [kind]: { at: new Date().toISOString(), what, ok: false, msg: 'Discord and Telegram off for the summaries (or no webhook / chat): not posted' } } })); log(`summary (${server}) ${what}: Discord and Telegram off for the summaries, or no webhook or chat - not posted`); continue; }   // (done: not posted late when one is turned on)
    let D; try { D = digestOf(server, kind, now); } catch (e) { log(`summary (${server}) ${what}: ${e.message}`); continue; }
    if (D.stale) { log(`summary (${server}) ${what}: waits - ${D.stale} of its rounds are still being summed up again after the update`); continue; }   // (v231)
    if (!D.rounds) { saveSrv(server, x => ({ digestLast: { ...x.digestLast, [kind]: P.key }, digestLog: { ...x.digestLog, [kind]: { at: new Date().toISOString(), what, ok: true, msg: 'no rounds: nothing posted' } } })); log(`summary (${server}) ${what}: no rounds with ${D.minPlayers}+ players - nothing posted`); continue; }
    const R = await deliver(D, T, S, F), ok = R.every(([, r]) => r.ok), m = told(R); n++;
    log(`summary (${server}) ${what}: ${D.rounds} rounds - ${m}`);
    saveSrv(server, x => { const t2 = { ...x.digestTry }; if (ok) delete t2[kind]; else t2[kind] = { key: P.key, n: (x.digestTry[kind]?.key === P.key ? x.digestTry[kind].n : 0) + 1 };
      return { ...(ok ? { digestLast: { ...x.digestLast, [kind]: P.key } } : {}), digestTry: t2, digestLog: { ...x.digestLog, [kind]: { at: new Date().toISOString(), what, ok, msg: m } } }; });
  }
  return n;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2), kind = a[1], server = a[2];
  if (a[0] === '--due') { try { await runDue(); process.exit(0); } catch (e) { log('summaries:', e.message); process.exit(1); } }
  if ((a[0] !== '--post' && a[0] !== '--show') || !KINDS.includes(kind) || server === undefined) { console.log('node digest.mjs --due | --post day|week|month <server> | --show day|week|month <server>'); process.exit(2); }
  const S = notifySettings();
  if (!S.servers[server] && a[0] === '--post') { console.log(`"${server}" is not set up for posts (admin page: Posts about new rounds).`); process.exit(1); }
  let D; try { D = digestOf(server, kind); } catch (e) { console.log(e.message); process.exit(1); }
  if (a[0] === '--show') { if (!D.rounds) { console.log(`no rounds with ${D.minPlayers}+ players: ${kind} ${D.period.label}`); process.exit(0); } const F = normDigestFmt(S.servers[server]?.digestFmt, S.servers[server]); console.log(JSON.stringify(discordOf(D, F), null, 1)); console.log(telegramOf(D, F).join('\n----\n')); process.exit(0); }
  if (!D.rounds) { console.log(`${KIND_T[kind]} ${D.period.label}: no rounds with ${D.minPlayers}+ players - nothing to post`); process.exit(1); }
  const F = normDigestFmt(S.servers[server].digestFmt, S.servers[server]), T = digestTargets(S, server, F); if (!T.length) { console.log(`Nothing to post the summaries of "${server}" to: Discord and Telegram off for them, or no webhook or chat.`); process.exit(1); }
  const R = await deliver(D, T, S, F), ok = R.every(([, r]) => r.ok), m = told(R);
  saveSrv(server, x => ({ digestLog: { ...x.digestLog, [kind]: { at: new Date().toISOString(), what: `${kind} ${D.period.label} (by hand)`, ok, msg: m } } }));
  console.log(m); process.exit(ok ? 0 : 1);
}
