#!/usr/bin/env node
// BF2 Round Replay - (v214, Sagara's todo 265: "сильні підказки в приватний Discord адмінів") a round's hints for admins
// to the server's private admin channel, once the background analysis (analyze.mjs) has done the round: called by it
// after each round (alertRound), and by hand: node alerts.mjs --test <server> (a test post to that server's channel).
// Only a round played in the last ALERT_HOURS hours (the analysis goes over old rounds again with new rules - those are
// not sent), once a round (data/.admin/alerts.json), with hints of the strength the server's setting asks for (strong;
// or strong and ordinary - never the minor ones: team kills, claymores, idle, the rules). The channel is the admins':
// the posts name players - a webhook of a private channel only.
import fs from 'node:fs';
import path from 'node:path';
import { notifySettings, saveNotify, serverOf, mapName, DOMAIN, DATA, log, escDc, cut, send } from './notify.mjs';
import { shadowKinds } from './hintcfg.mjs';   // (v254: the hints in shadow are not sent)
const ADM_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), 'admin-round.js');

export const ALERT_HOURS = 48;
const SENT = path.join(DATA, '.admin', 'alerts.json');
const readSent = () => { try { return JSON.parse(fs.readFileSync(SENT, 'utf8')) || {}; } catch (e) { return {}; } };
const writeSent = j => { try { fs.mkdirSync(path.dirname(SENT), { recursive: true }); const t = SENT + '.tmp'; fs.writeFileSync(t, JSON.stringify(j)); fs.renameSync(t, SENT); } catch (e) {} };
const mmss = t => { t = Math.max(0, Math.round(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const idOf = name => String(name || '').replace(/\.bf2demo(\.gz)?$/i, '');

// the post: { embeds: [card] } - each hint a line: what, who, when (a link to the moment)
export function alertPost(d, min = 'strong') {
  const SH = shadowKinds(DATA, ADM_FILE), need = min === 'hint' ? 1 : 2, H = (d.H || []).filter(h => (h.s ?? 0) >= need && h.tx && !SH.has(h.kind));
  if (!H.length) return null;
  const P = new Map((d.P || []).map(r => [r[0], r[1]])), sum = d.round?.sum || {}, id = idOf(d.round?.name || d.name);
  const at = t => DOMAIN ? `https://${DOMAIN}/#round=${encodeURIComponent(id)}&t=${Math.max(0, Math.round(t - 2))}` : '';
  H.sort((a, b) => (b.s - a.s) || (a.t - b.t));
  const lines = H.slice(0, 25).map(h => { const u = at(h.t); return `${h.s >= 2 ? '**' : ''}${escDc(cut(h.tx, 150))}${h.s >= 2 ? '**' : ''} · ${u ? `[${mmss(h.t)}](${u})` : mmss(h.t)}`; });
  const who = new Map(); for (const h of H) { const n = P.get(h.actor); if (n) who.set(n, (who.get(n) || 0) + 1); }
  const card = {
    title: cut(`Hints for admins · ${mapName(sum.map || d.map)} · ${String(sum.date || '').replace('T', ' ').slice(0, 16)}`, 250), ...(DOMAIN ? { url: `https://${DOMAIN}/#round=${encodeURIComponent(id)}` } : {}),
    description: cut(lines.join('\n') + (H.length > 25 ? `\n… ${H.length - 25} more on the site (Admin tab)` : ''), 4000), color: 0xd9534f,
    fields: who.size ? [{ name: 'Players', value: cut([...who].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${escDc(n)} ${c}`).join(' · '), 1000) }] : [],
    footer: { text: `${serverOf(d.round || {})} · ${H.filter(h => h.s >= 2).length} strong of ${H.length} · hints are for a closer look, not proof` }
  };
  return { embeds: [card] };
}
// after the analysis of a round (d: analyze.mjs's numbers of it)
export async function alertRound(d) {
  try {
    const sum = d?.round?.sum; if (!sum || !d.round.name) return null;
    const server = serverOf(d.round), S = notifySettings(), c = S.servers[server]?.alert; if (!c || !c.on || !c.webhook) return null;
    const played = Date.parse(String(sum.date || '').replace(' ', 'T')); if (!(played > Date.now() - ALERT_HOURS * 3600e3)) return null;
    const sent = readSent(); if (sent[d.round.name]) return null;
    const P = alertPost(d, c.min); sent[d.round.name] = new Date().toISOString();
    for (const [k, v] of Object.entries(sent)) if (Date.parse(v) < Date.now() - 30 * 86400e3) delete sent[k];
    writeSent(sent);
    if (!P) return { posted: false, why: 'no such hints' };
    const R = await send({ discord: P }, [{ app: 'discord', url: c.webhook }], S), ok = R.every(([, r]) => r.ok);
    const msg = ok ? `${d.round.name}: ${P.embeds[0].footer.text.split(' · ')[1]}` : `${d.round.name}: ${R.map(([a, r]) => a + ' ' + (r.msg || 'failed')).join(', ')}`;
    saveNotify({}, server, { alert: { log: { at: new Date().toISOString(), ok, msg } } });
    log(`admin channel (${server}):`, msg); return { posted: ok, msg };
  } catch (e) { log('admin channel:', e.message); return null; }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2), server = a.find(x => !x.startsWith('--'));
  if (!a.includes('--test') || !server) { console.log('node alerts.mjs --test <server>'); process.exit(2); }
  const c = notifySettings().servers[server]?.alert; if (!c?.webhook) { console.log(`no admin channel set for "${server}"`); process.exit(1); }
  const R = await send({ discord: { content: `**BF2 Round Replay** · a test of the admins' channel of ${escDc(server)}: hints for admins of its rounds come here once the server has analysed each round.` } }, [{ app: 'discord', url: c.webhook }], notifySettings());
  console.log(R.map(([a, r]) => a + ': ' + (r.ok ? 'sent' : r.msg || 'failed')).join(', ')); process.exit(R.every(([, r]) => r.ok) ? 0 : 1);
}
