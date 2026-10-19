#!/usr/bin/env node
// BF2 Round Replay: where the site stands - its version, how many rounds the current decoder has made (after a site
// update the rounds are decoded again: how far that is, how long it has left), the services, the last log lines.
//   bf2replay-status            (installed by units.sh; = node /srv/bf2replay/repo/server/status.mjs)
//   watch -n 10 bf2replay-status   (again every 10 s; Ctrl+C to stop)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readRoundList } from './roundsidx.mjs';
const conf = {};
try { for (const line of fs.readFileSync('/etc/bf2replay.conf', 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/.exec(line); if (m) conf[m[1]] = m[2]; } } catch (e) {}
const ROOT = process.env.BF2R_ROOT ?? conf.BF2R_ROOT ?? '/srv/bf2replay', SITE = path.join(ROOT, 'site'), DATA = path.join(ROOT, 'data');
const sh = (cmd, a) => { try { return execFileSync(cmd, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { return (e.stdout || '').trim(); } };
const hm = s => s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round(s % 3600 / 60)} min` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`;
// the site's decoder: the same hash as ingest.mjs makes
let ver = '?', hash = '?';
try { ver = JSON.parse(fs.readFileSync(path.join(SITE, 'version.json'), 'utf8')).v; } catch (e) {}
try {
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), L = html.split('\n');
  if (ver === '?') ver = (/const APP_VERSION = '(v\d+)'/.exec(html) || [])[1] || '?';
  const g = L.find(l => l.startsWith('const GAME = ')), a = L.findIndex(l => l.startsWith('// @worker-begin')), b = L.findIndex(l => l.startsWith('// @worker-end'));
  const k0 = html.indexOf('function killCause('), k1 = html.indexOf('\n}\n', k0);
  hash = crypto.createHash('sha1').update(g).update(L.slice(a, b).join('\n')).update(html.slice(k0, k1 + 2)).digest('hex').slice(0, 10);
} catch (e) {}
const d = readRoundList(fs, path, DATA);   // (v176: the whole list - rounds.json is compact)
const R = d.rounds || [], done = R.filter(r => r.decoder === hash).length, P = d.reprocess;
const act = u => sh('systemctl', ['is-active', u]) || '?';
console.log(`BF2 Round Replay   site ${ver}, decoder ${hash}   (${new Date().toLocaleString()})`);
console.log(`Rounds             ${R.length} listed; made by this decoder ${done} (${R.length ? Math.floor(100 * done / R.length) : 100}%)${done < R.length ? `, ${R.length - done} to decode again` : ''}`);
if (P && P.hash === hash) {
  const el = (Date.now() - Date.parse(P.since)) / 1000, rate = P.done ? el / P.done : null;
  console.log(`Decoding again     ${P.done} / ${P.total} (${Math.floor(100 * P.done / P.total)}%), ${P.jobs || 1} at once, since ${new Date(P.since).toLocaleTimeString()}${rate ? `, ~${rate.toFixed(1)} s a round, ~${hm(rate * (P.total - P.done))} left` : ''}`);
} else if (done < R.length) console.log(`Decoding again     not running yet (bf2replay-reprocess starts within a minute of the site update)`);
console.log(`Services           reprocess ${act('bf2replay-reprocess.service')} · update ${act('bf2replay-update.service')} (timer ${act('bf2replay-update.timer')}) · ingest ${act('bf2replay-ingest.service')} · fetch ${act('bf2replay-fetch.service')} · admin page ${act('bf2replay-admin.service')}`);
const next = sh('systemctl', ['show', '-P', 'NextElapseUSecRealtime', 'bf2replay-fetch.timer']);
let fl = null; try { fl = JSON.parse(fs.readFileSync(path.join(DATA, '.fetch-last.json'), 'utf8')); } catch (e) {}
if (fl) console.log(`Demo pages         looked ${hm((Date.now() - Date.parse(fl.at)) / 1000)} ago: ${fl.listed} demos listed, ${fl.new} new${fl.got ? ', ' + fl.got + ' downloaded' : ''}${fl.busy ? ', ' + fl.busy + ' still being written' : ''}${fl.failed ? ', ' + fl.failed + ' failed' : ''}${next ? ' · next ' + next : ''}`);
else if (next) console.log(`Next download      ${next}`);
let bk = []; try { bk = fs.readdirSync(path.join(ROOT, 'backup')).filter(f => /^bf2replay-.*\.tar\.gz$/.test(f)).sort(); } catch (e) {}
let df = ''; try { const st = fs.statfsSync(DATA); df = (st.bavail * st.bsize / 2 ** 30).toFixed(1) + ' GB free'; } catch (e) {}
console.log(`Disk, backups      ${df || '?'}${bk.length ? ` · last backup ${bk[bk.length - 1]} (${bk.length} kept)` : ' · no backup yet (Sundays 04:40)'}`);
const log = sh('journalctl', ['-u', 'bf2replay-reprocess', '-u', 'bf2replay-update', '-u', 'bf2replay-ingest', '-n', '4', '--no-pager', '-o', 'cat']);
if (log) console.log('Last log lines\n  ' + log.split('\n').join('\n  '));
else console.log('Last log lines     (run with sudo to see them)');
