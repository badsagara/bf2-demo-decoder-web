#!/usr/bin/env node
// BF2 Round Replay (v209, Sagara: "a wider summary - a post once a day, a week and a month with the server's players over
// that time") - a summary of a game server's rounds, posted to the channels of its round posts (notify.mjs; the admin
// page turns each of the three on for each server, all off until then): the day before, the week before (Monday to
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
import { opt, DOMAIN, SITE, log, notifySettings, saveNotify, targetsOf, serverOf, mapName, aggFns, allRounds, escTg, escDc, DRAW_RGB, cut, monoTable, send } from './notify.mjs';
import fs from 'node:fs';
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
const SUM_KEYS = [['foot', 'On foot'], ['kVeh', 'In vehicles'], ['hs', 'Headshots'], ['kn', 'Knife'], ['cl', 'Claymores'], ['mi', 'Mines'], ['ai', 'AT on infantry'], ['rd', 'Run over'], ['ex', 'Explosives'],
  ['hk', 'Hand-held'], ['atk', 'Hand-held AT'], ['stk', 'TOW / HJ-8'], ['tck', 'Tank cannon'], ['vk', 'Vehicle weapons'], ['agk', 'AA guns'], ['ark', 'AA rockets'], ['aak', 'Air-to-air'],
  ['rev', 'Revives'], ['heal', 'Heals'], ['rep', 'Repairs'], ['fl', 'Flags']];
const BEST_KEYS = [['k', 'Kills'], ['score', 'Score'], ['sf', 'Streak on foot'], ['sv', 'Streak in vehicles'], ['kd', 'K/D (10+ kills)'], ['lg', 'Longest kill'], ['sl', 'Longest small arms'], ['sn', 'Longest sniper'],
  ['al', 'Longest launcher'], ['stl', 'Longest TOW / HJ-8'], ['tcl', 'Longest tank cannon'], ['vl', 'Longest vehicle'], ['agl', 'Longest AA gun'], ['arl', 'Longest AA rocket'], ['aal', 'Longest air-to-air']];
const whoOf = L => L.slice(0, 3).join(', ') + (L.length > 3 ? ` +${L.length - 3}` : '');
const num = v => Number(v).toLocaleString('en-GB');

// a server's summary of a period: null fields when it had no rounds
export function digestOf(server, kind, now = Date.now()) {
  const S = notifySettings(), c = S.servers[server], mp = c?.minPlayers || S.minPlayers, P = periodOf(kind, now), A = aggFns();
  if (!A || !A.recVal || !A.REC_KEYS) throw new Error("the page's records code did not load (site/index.html)");
  const R = allRounds().filter(r => { const s = r.sum, d = String(s?.date || '').slice(0, 10); return s && !s.empty && Array.isArray(s.P) && serverOf(r) === server && (s.players || 0) >= mp && d >= P.from && d <= P.to; })
    .sort((a, b) => String(a.sum.date).localeCompare(String(b.sum.date)));
  const out = { server, kind, period: P, minPlayers: mp, rounds: R.length };
  if (!R.length) return out;
  const bot = n => /^Player \d+$/.test(A.nickOf(n)), unit = Object.fromEntries(A.REC_KEYS.map(([k, , u]) => [k, u || '']));
  // the server's numbers
  const nicks = new Set(), maps = new Map(); let kills = 0, secs = 0;
  for (const r of R) { kills += r.sum.kills || 0; secs += r.sum.duration || 0; const m = String(r.sum.map || '').toLowerCase(); maps.set(m, (maps.get(m) || 0) + 1); for (const p of r.sum.P) if (!bot(p.name)) nicks.add(A.nickOf(p.name)); }
  out.numbers = { rounds: R.length, players: nicks.size, kills, hours: Math.round(secs / 360) / 10, maps: [...maps].map(([m, n]) => [mapName(m), n, m]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) };
  // each player over the period, by nick (his name of the newest round)
  const M = new Map();
  for (const r of R) { const seen = new Set(); for (const p of r.sum.P) {
    if (bot(p.name)) continue; const nk = A.nickOf(p.name); let a = M.get(nk); if (!a) M.set(nk, a = { name: p.name, rounds: 0, score: 0, k: 0, d: 0, sums: {} });
    a.name = p.name; if (!seen.has(nk)) { a.rounds++; seen.add(nk); }
    a.score += p.score || 0; a.k += p.k || 0; a.d += p.d || 0;
    for (const [k] of SUM_KEYS) { const [v] = A.recVal(p, k); if (v > 0) a.sums[k] = (a.sums[k] || 0) + v; }
  } }
  const all = [...M.values()];
  out.top = all.slice().sort((a, b) => b.score - a.score || b.k - a.k || a.d - b.d).slice(0, 10).map(a => ({ name: a.name, score: a.score, k: a.k, d: a.d, kd: Math.round(a.k / Math.max(1, a.d) * 100) / 100, rounds: a.rounds }));
  // the leaders, added up (a tie: all of them, the first three named)
  out.leaders = [];
  for (const [k, label] of SUM_KEYS) {
    let best = 0, who = []; for (const a of all) { const v = a.sums[k] || 0; if (v > best) { best = v; who = [a.name]; } else if (v === best && v > 0) who.push(a.name); }
    if (best > 0) out.leaders.push({ k, label, v: String(best), who: whoOf(who) });
  }
  { const min = KD_MIN[kind]; let best = 0, who = []; for (const a of all) { if (a.k < min) continue; const v = Math.round(a.k / Math.max(1, a.d) * 100) / 100; if (v > best) { best = v; who = [`${a.name} (${a.k}/${a.d})`]; } else if (v === best) who.push(`${a.name} (${a.k}/${a.d})`); }
    if (best > 0) out.leaders.push({ k: 'kd', label: `K/D (${min}+ kills)`, v: best.toFixed(2), who: whoOf(who) }); }
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

// Discord: cards (a message holds 10 and 6000 letters: more messages when it is more) - the numbers and the best ten;
// the leaders; the best in one round
export function discordOf(D) {
  const N = D.numbers, E = [];
  const fitRows = (head, rows, build) => { let d = build(rows); while (d.length > 4090 && rows.length > 1) { rows = rows.slice(0, -1); d = build(rows); } return d; };
  const first = { title: cut(titleOf(D), 256), color: DRAW_RGB };
  const link = linkOf(D); if (link) first.url = link;
  const head = `**${num(N.rounds)} round${N.rounds === 1 ? '' : 's'}** · ${num(N.players)} players · ${num(N.kills)} kills · ${N.hours} h\n${escDc('Maps: ' + mapsLine(N))}`;
  const top = D.top.map((a, i) => [String(i + 1), num(a.score), `${a.k}-${a.d}`, a.kd.toFixed(2), String(a.rounds), a.name]);
  first.description = fitRows(['#'], top, rows => `${head}\n**Top ${rows.length} by score**\n${monoTable(['#', 'Score', 'K-D', 'K/D', 'Rnd', 'Player'], rows)}`);
  if (DOMAIN) { const m = N.maps[0]?.[2] || ''; first.thumbnail = { url: `https://${DOMAIN}/assets/og/${m && fs.existsSync(path.join(SITE, 'assets', 'og', m + '.jpg')) ? m : 'site'}.jpg` }; }   // (the map played most)
  E.push(first);
  if (D.leaders.length) E.push({ color: DRAW_RGB, description: fitRows([], D.leaders.map(x => [x.label, x.v, x.who]), rows => `**Leaders ${KIND_OF[D.kind]}** · added up\n${monoTable(['Most', 'Total', 'Player'], rows)}`) });
  if (D.bests.length) E.push({ color: DRAW_RGB, description: fitRows([], D.bests.map(x => [x.label, x.v, x.who + (x.where ? ` (${x.where})` : '')]), rows => `**Best in one round ${KIND_OF[D.kind]}**\n${monoTable(['Record', 'Best', 'Player'], rows)}`) });
  E[E.length - 1].footer = { text: `BF2 Round Replay · rounds with ${D.minPlayers}+ players, by the time in the demo` };
  // into messages
  const size = e => (e.title || '').length + (e.description || '').length + (e.footer?.text || '').length;
  const msgs = []; let cur = [], n = 0;
  for (const e of E) { if (cur.length && (n + size(e) > 5900 || cur.length >= 10)) { msgs.push({ embeds: cur }); cur = []; n = 0; } cur.push(e); n += size(e); }
  if (cur.length) msgs.push({ embeds: cur });
  return msgs;
}
// Telegram: text (HTML), as many messages as it takes (4096 letters each; whole lines)
export function telegramOf(D) {
  const N = D.numbers, b = t => `<b>${escTg(t)}</b>`, L = [b(titleOf(D)), escTg(`${num(N.rounds)} round${N.rounds === 1 ? '' : 's'} · ${num(N.players)} players · ${num(N.kills)} kills · ${N.hours} h`), escTg('Maps: ' + mapsLine(N))];
  L.push('', b(`Top ${D.top.length} by score`)); D.top.forEach((a, i) => L.push(escTg(`${i + 1}. ${a.name} ${num(a.score)} (${a.k}–${a.d}, K/D ${a.kd.toFixed(2)}, ${a.rounds} round${a.rounds === 1 ? '' : 's'})`)));
  if (D.leaders.length) { L.push('', b(`Leaders ${KIND_OF[D.kind]} (added up)`)); for (const x of D.leaders) L.push(`${b(x.label + ':')} ${escTg(`${x.who} ${x.v}`)}`); }
  if (D.bests.length) { L.push('', b(`Best in one round ${KIND_OF[D.kind]}`)); for (const x of D.bests) L.push(`${b(x.label + ':')} ${escTg(`${x.who} ${x.v}${x.where ? ` (${x.where})` : ''}`)}`); }
  const link = linkOf(D); if (link) L.push('', escTg(link));
  const msgs = []; let cur = '';
  for (const l of L) { if (cur && cur.length + l.length + 1 > 3900) { msgs.push(cur.replace(/\n+$/, '')); cur = ''; } cur += (cur ? '\n' : '') + l; }
  if (cur.trim()) msgs.push(cur.replace(/\n+$/, ''));
  return msgs;
}
// the admin page's preview
export function digestTexts(server, kind, now = Date.now()) {
  const D = digestOf(server, kind, now), base = { ok: true, server, kind, period: D.period, rounds: D.rounds, minPlayers: D.minPlayers };
  if (!D.rounds) return { ...base, discord: [], telegram: [] };
  return { ...base, discord: discordOf(D).flatMap(m => m.embeds), telegram: telegramOf(D) };
}
// to a server's channels (the round posts'): each message in turn; [[app, { ok, msg }]]
async function deliver(D, T, S) {
  const out = [], dc = discordOf(D), tg = telegramOf(D);
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
    const what = `${kind} ${P.label}`, T = targetsOf(S, server);
    if (!T.length) { saveSrv(server, x => ({ digestLast: { ...x.digestLast, [kind]: P.key }, digestLog: { ...x.digestLog, [kind]: { at: new Date().toISOString(), what, ok: false, msg: 'no Discord or Telegram on: not posted' } } })); log(`summary (${server}) ${what}: no Discord webhook or Telegram chat on - not posted`); continue; }   // (done: not posted late when one is turned on)
    let D; try { D = digestOf(server, kind, now); } catch (e) { log(`summary (${server}) ${what}: ${e.message}`); continue; }
    if (!D.rounds) { saveSrv(server, x => ({ digestLast: { ...x.digestLast, [kind]: P.key }, digestLog: { ...x.digestLog, [kind]: { at: new Date().toISOString(), what, ok: true, msg: 'no rounds: nothing posted' } } })); log(`summary (${server}) ${what}: no rounds with ${D.minPlayers}+ players - nothing posted`); continue; }
    const R = await deliver(D, T, S), ok = R.every(([, r]) => r.ok), m = told(R); n++;
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
  if (a[0] === '--show') { if (!D.rounds) { console.log(`no rounds with ${D.minPlayers}+ players: ${kind} ${D.period.label}`); process.exit(0); } console.log(JSON.stringify(discordOf(D), null, 1)); console.log(telegramOf(D).join('\n----\n')); process.exit(0); }
  if (!D.rounds) { console.log(`${KIND_T[kind]} ${D.period.label}: no rounds with ${D.minPlayers}+ players - nothing to post`); process.exit(1); }
  const T = targetsOf(S, server); if (!T.length) { console.log(`Nothing to post to for "${server}": no Discord webhook or Telegram chat on.`); process.exit(1); }
  const R = await deliver(D, T, S), ok = R.every(([, r]) => r.ok), m = told(R);
  saveSrv(server, x => ({ digestLog: { ...x.digestLog, [kind]: { at: new Date().toISOString(), what: `${kind} ${D.period.label} (by hand)`, ok, msg: m } } }));
  console.log(m); process.exit(ok ? 0 : 1);
}
