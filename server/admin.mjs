#!/usr/bin/env node
// BF2 Round Replay - the admin page (https://<site>/admin): behind a password, it shows where the server stands (rounds,
// the decoder, the demos waiting to be decoded, decoding again after an update, the services, the disk) and does what
// otherwise needs a shell on the VPS: decode the waiting demos now, decode old rounds again (or all), try the demos that
// failed again, fetch new demos now, update from GitHub, back up; add and remove game servers / demo pages to fetch from
// (and check one first); where new rounds are posted (Discord / Telegram: notify.mjs); how many demos are decoded at once
// (v162: data/.ingest.json, with how fast each number went - to pick the best for this machine); read the services'
// logs. (v186) Which old demos ingest.mjs removes to save room (data/.demos.json, demos.mjs: their rounds stay), with what
// would go before it is saved, the demos to keep whatever the rest says, and the copies of rounds (data/.copies) removed on
// request. Nothing here deletes a round.
// (v196) The servers' admins: accounts made here by the site's owner (data/.admin-users.json: a name, a scrypt hash of the
// password, the game servers whose rounds he sees), who log in on a round's Admin tab (the page: same login, the name
// filled in) and get only that: the admins' part of the page (server/admin-round.js, cut out of the public page by
// splitpage.mjs) and the private files of the analysis (data/.admin: the players' hint cards, Glitch spot, the headshot
// odds). Everything else here is the owner's (an empty name and the password of --set-password).
// (v224) Who may open what (access.mjs): the guests' parts of the site (data/.access.json) and each account's - the parts
// of the site, the Admin tab, cards of this page; one login for all of them (the page /login, the site's Log in, this
// page), kept in data/.sessions.json (only the tokens' hashes) so that a restart logs nobody out. While some part is
// closed to guests, the web server asks /admin/api/gate about every request (data/.access-gate: Caddy's forward_auth).
//
//   node admin.mjs                  the admin server (bf2replay-admin.service, as bf2replay): http://127.0.0.1:8781,
//                                   Caddy sends /admin* to it
//   sudo node admin.mjs --set-password
//                                   set (or change) the password: asked twice, kept only as a scrypt hash in
//                                   /etc/bf2replay-admin.json (root:bf2replay, 640); no restart needed
//
// The services are started with "sudo -n systemctl start --no-block bf2replay-<x>.service", which units.sh allows the
// bf2replay user for exactly these services (/etc/sudoers.d/bf2replay-admin); the logs come from journalctl (the service
// runs in the systemd-journal group). Game servers added here go to data/.fetch-sources.json, which fetch.mjs reads
// next to BF2R_FETCH_URLS from /etc/bf2replay.conf (those stay as they are: edited there).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { notifySettings, saveNotify, DISCORD_RE, TG_TOKEN_RE, TG_CHAT_RE, POST_ITEMS, postTexts, serverOf, normFormat, FORMAT_DEFAULT, POST_VARS, linesOf, TLABEL } from './notify.mjs';
import { periodOf, digestTexts, KINDS as DIGEST_KINDS, DIGEST_AT, DIGEST_TZ, normDigestFmt, digestTargets, DG_PARTS, DG_VARS, DG_LEADERS, DG_BESTS, DG_TOP_N, DG_FMT_DEFAULT } from './digest.mjs';   // (v209: the summaries; v220: their settings)
import { expandIndex } from './roundsidx.mjs';
import { statqKeeper, statqMeta, statqNicks, statqAsk } from './statq.mjs';   // (v244: the admins' statistics)
import { SITE_FILE as HT_SITE_FILE, MINE_FILE as HT_MINE_FILE, siteSet as htSiteSet, pageSpec as htPageSpec, checkSet as htCheckSet, siteHv as htSiteHv } from './hintcfg.mjs';   // (v227)
import { demoPolicy, demoPlan, hintRounds, sourceList, linkId, oldRounds, DEMOS_FILE, DEMOS_LAST_FILE, REFETCH_FILE } from './demos.mjs';
import { ACCESS_FILE, GATE_FILE, SITE as ACC_SITE, GUEST_EXTRA as ACC_GUEST, CARDS as ACC_CARDS, guestsOf, userRights, normRights, normGuests, gateNeeded, siteRights, needOf, allowed, openPlaces } from './access.mjs';   // (v224)

const conf = {};
try { for (const line of fs.readFileSync('/etc/bf2replay.conf', 'utf8').split('\n')) { const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/.exec(line); if (m) conf[m[1]] = m[2]; } } catch (e) { /* no file: defaults */ }
const opt = (k, d) => process.env[k] ?? conf[k] ?? d;
const ROOT = opt('BF2R_ROOT', '/srv/bf2replay'), SITE = path.join(ROOT, 'site'), DATA = path.join(ROOT, 'data'), INC = path.join(ROOT, 'upload', 'incoming');
const BAD = path.join(DATA, 'bad'), SOURCES = path.join(DATA, '.fetch-sources.json');
const JOBS_FILE = path.join(DATA, '.ingest.json'), STATS_FILE = path.join(DATA, '.ingest-stats.json'), NOW_FILE = path.join(DATA, '.ingest-now.json'), JOBS_MAX = 16;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const PASS_FILE = opt('BF2R_ADMIN_PASS_FILE', '/etc/bf2replay-admin.json');
const PORT = +opt('BF2R_ADMIN_PORT', '8781'), HOST = '127.0.0.1';
const SYSTEMCTL = opt('BF2R_ADMIN_SYSTEMCTL', fs.existsSync('/usr/bin/systemctl') ? '/usr/bin/systemctl' : '/bin/systemctl');
const SUDO = opt('BF2R_ADMIN_SUDO', '/usr/bin/sudo'), JOURNALCTL = opt('BF2R_ADMIN_JOURNALCTL', 'journalctl');
const NODE = process.execPath;
const UNITS = ['ingest', 'reprocess', 'rebuild', 'fetch', 'update', 'backup', 'hints'];   // (the ones the page may start)
const STOPPABLE = ['ingest', 'reprocess', 'rebuild'];   // (v163: and stop - the decoding ones; units.sh allows it)
const SESSION_H = 12, IDLE_H = 2;   // a login lasts 12 h, or 2 h without a look at the page - and an admin's powers (the Admin tab, this page) as long in any login
const KEEP_D = 30, KEEP_IDLE_D = 14;   // (v224) "keep me logged in": 30 days, or 14 without a visit (watching only: the admin powers ask again after 12 h)
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

// ---------- the password: scrypt, kept as { salt, hash, N, r, p } ----------
const KDF = { N: 2 ** 15, r: 8, p: 1, len: 64 };
const kdf = (pw, salt, k = KDF) => crypto.scryptSync(String(pw).normalize('NFC'), Buffer.from(salt, 'base64'), k.len, { N: k.N, r: k.r, p: k.p, maxmem: 256 * k.N * k.r });
let passCache = { mt: -1, v: null };   // (v224: read again only when it changes - every request of a closed site asks)
function readPass() { let mt = 0; try { mt = fs.statSync(PASS_FILE).mtimeMs; } catch (e) { return null; } if (mt === passCache.mt) return passCache.v; let v = null; try { const j = JSON.parse(fs.readFileSync(PASS_FILE, 'utf8')); v = j && j.salt && j.hash ? j : null; } catch (e) {} passCache = { mt, v }; return v; }
function checkPass(pw) {
  const j = readPass(); if (!j || typeof pw !== 'string' || pw.length > 200) return false;
  const want = Buffer.from(j.hash, 'base64'), got = kdf(pw, j.salt, { N: j.N || KDF.N, r: j.r || KDF.r, p: j.p || KDF.p, len: want.length });
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
// (v196) the servers' admins: { users: { name: { salt, hash, N, r, p, servers: [game server names], created, by, last } } }
// (v224) and each one's rights: { site: { view, list, … }, admin (the Admin tab), cards: { rounds, … } } (access.mjs)
const USERS_FILE = path.join(DATA, '.admin-users.json'), USER_RE = /^[A-Za-z0-9_.-]{2,32}$/;
let usersCache = { mt: -1, v: null };
const readUsers = () => { let mt = 0; try { mt = fs.statSync(USERS_FILE).mtimeMs; } catch (e) { return { users: {} }; } if (mt !== usersCache.mt) { const j = readJson(USERS_FILE, null); usersCache = { mt, v: j && j.users && typeof j.users === 'object' ? j : { users: {} } }; } return JSON.parse(JSON.stringify(usersCache.v)); };
const userOf = name => { readUsers(); return name && usersCache.v ? usersCache.v.users[name] || null : null; };   // (read only: not a copy)
const writeUsers = j => { const tmp = USERS_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(j, null, 1) + '\n', { mode: 0o600 }); fs.renameSync(tmp, USERS_FILE); usersCache.mt = -1; };
// (v224) the guests' rights (data/.access.json) and the gate's flag for the web server (data/.access-gate)
const ACC_F = path.join(DATA, ACCESS_FILE), GATE_F = path.join(DATA, GATE_FILE);
let accCache = { mt: -1, v: null, signup: true };
function guests() { let mt = 0; try { mt = fs.statSync(ACC_F).mtimeMs; } catch (e) { mt = 0; } if (mt !== accCache.mt) { const J = mt ? readJson(ACC_F, {}) || {} : {}; accCache = { mt, v: guestsOf(J), signup: J.signup !== false }; } return accCache.v; }
// (v239, Sagara: "let people sign up on the site and keep their settings in their profile") may visitors make an
// account themselves - data/.access.json { signup } (the admin page, "Users and access"); open unless closed there
const signupOpen = () => { guests(); return accCache.signup !== false; };
function syncGate() {
  const on = gateNeeded(guests());
  try { if (on) { if (!fs.existsSync(GATE_F)) { fs.writeFileSync(GATE_F, 'closed: the web server asks admin.mjs about each request (written by admin.mjs)\n'); log('access: the site is closed to guests in part - the web server asks about each request'); } } else if (fs.existsSync(GATE_F)) { fs.unlinkSync(GATE_F); log('access: the site is open to guests'); } } catch (e) { log('access: could not write', GATE_F + ':', e.message); }
  return on;
}
function checkUser(name, pw) {
  const u = readUsers().users[name]; if (!u || !u.salt || !u.hash || typeof pw !== 'string' || pw.length > 200) { kdf('x', 'AAAAAAAAAAAAAAAAAAAAAA=='); return null; }   // (as long either way)
  const want = Buffer.from(u.hash, 'base64'), got = kdf(pw, u.salt, { N: u.N || KDF.N, r: u.r || KDF.r, p: u.p || KDF.p, len: want.length });
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? u : null;
}
async function setPassword() {
  const ask = async q => {
    if (!process.stdin.isTTY) { let s = ''; for await (const c of process.stdin) s += c; return s.replace(/\r?\n$/, ''); }
    process.stdout.write(q); process.stdin.setRawMode(true); let s = '';
    return await new Promise(ok => { const on = b => { for (const ch of b.toString('utf8')) { if (ch === '\r' || ch === '\n') { process.stdin.setRawMode(false); process.stdin.off('data', on); process.stdin.pause(); process.stdout.write('\n'); ok(s); return; } if (ch === '\u0003') process.exit(1); if (ch === '\u007f') s = s.slice(0, -1); else s += ch; } }; process.stdin.on('data', on); process.stdin.resume(); });
  };
  const a = await ask('New admin password: ');
  if (process.stdin.isTTY) { const b = await ask('Again: '); if (a !== b) { console.error('The two did not match: nothing changed.'); process.exit(1); } }
  if (a.length < 8) { console.error('At least 8 characters, please: nothing changed.'); process.exit(1); }
  const salt = crypto.randomBytes(16).toString('base64'), rec = { salt, hash: kdf(a, salt).toString('base64'), N: KDF.N, r: KDF.r, p: KDF.p, set: new Date().toISOString() };
  const tmp = PASS_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(rec) + '\n', { mode: 0o640 }); fs.renameSync(tmp, PASS_FILE);
  try { const gid = +(await run('id', ['-g', 'bf2replay'])).out.trim(); if (Number.isInteger(gid)) fs.chownSync(PASS_FILE, 0, gid); } catch (e) {}
  console.log(`Password set (${PASS_FILE}). Log in at https://<your site>/admin`);
}

// ---------- logins: a random token in an HttpOnly cookie; brute force held off per address and overall ----------
// (v224) One login for the site, its Admin tab and this page: the cookie bf2r_s on the whole site (Path=/, SameSite=Lax:
// sent when a link from a chat opens the site; a POST here still needs this page's own header, sameSite below). The
// sessions are kept in data/.sessions.json by the token's hash (a restart of admin.mjs - every update - logs nobody
// out). A login lasts 12 h (2 h without a visit), or with "keep me logged in" 30 days (14 without a visit); the admin
// powers of any login (the Admin tab, cards of this page, the owner's) last 12 h from it and 2 h without an admin's step.
const sessions = new Map();   // sha256(token) -> { exp, seen, ip, user, role ('owner' | 'user'), keep, at, admSeen, pw }
const fails = new Map();      // ip -> [times]
let allFails = [];
const FAIL_N = 5, FAIL_WIN = 15 * 60e3, ALL_N = 30, ALL_WIN = 60 * 60e3;
const clientIp = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
function blocked(ip) {
  const now = Date.now(); allFails = allFails.filter(t => now - t < ALL_WIN);
  const L = (fails.get(ip) || []).filter(t => now - t < FAIL_WIN); fails.set(ip, L);
  if (L.length >= FAIL_N) return Math.ceil((L[0] + FAIL_WIN - now) / 60e3);
  // (v224) the overall pause only for addresses with a wrong password of their own lately: many wrong ones from
  // elsewhere don't lock everybody out (a user with no mistake still gets in)
  if (allFails.length >= ALL_N && L.length) return Math.ceil((allFails[0] + ALL_WIN - now) / 60e3);
  return 0;
}
const SESS_F = path.join(DATA, '.sessions.json'), COOKIE = 'bf2r_s';
const tokHash = t => crypto.createHash('sha256').update(String(t)).digest('base64url');
let sessDirty = false, sessTimer = 0;
function sessLoad() {
  const j = readJson(SESS_F, null), now = Date.now();
  if (j && j.s && typeof j.s === 'object') for (const [h, x] of Object.entries(j.s)) if (x && now < x.exp) sessions.set(h, x);
}
function sessSave(now) {
  clearTimeout(sessTimer); sessTimer = 0; sessDirty = false;
  const t = Date.now(); for (const [h, x] of sessions) if (t > x.exp) sessions.delete(h);
  try { const tmp = SESS_F + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ v: 1, s: Object.fromEntries(sessions) }) + '\n', { mode: 0o600 }); fs.renameSync(tmp, SESS_F); } catch (e) { log('sessions not saved:', e.message); }
}
const sessLater = () => { sessDirty = true; if (!sessTimer) sessTimer = setTimeout(sessSave, 60e3); };   // (a visit's time: at most once a minute)
const cookieOf = req => { const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{20,})`).exec(req.headers.cookie || ''); return m ? m[1] : null; };
function sessionOf(req) {
  const tok = cookieOf(req); if (!tok) return null;
  const h = tokHash(tok), s = sessions.get(h), now = Date.now(); if (!s) return null;
  const idle = s.keep ? KEEP_IDLE_D * 86400e3 : IDLE_H * 3600e3;
  let gone = now > s.exp || now - s.seen > idle;
  if (!gone && s.role === 'owner') { const P = readPass(); if (!P || (s.pw && P.set && s.pw !== P.set)) gone = true; }   // (a new owner's password: logged out)
  if (!gone && s.role !== 'owner') { const u = userOf(s.user); if (!u) gone = true; else s.servers = Array.isArray(u.servers) ? u.servers : []; }
  if (gone) { sessions.delete(h); sessLater(); return null; }
  if (now - s.seen > 30e3) { s.seen = now; sessLater(); }
  s.h = h; return s;
}
const admOk = s => !!s && Date.now() - (s.at || 0) < SESSION_H * 3600e3 && Date.now() - (s.admSeen || s.at || 0) < IDLE_H * 3600e3;
const admTouch = s => { if (s && Date.now() - (s.admSeen || 0) > 30e3) { s.admSeen = Date.now(); sessLater(); } };
const isOwnerS = s => !!s && s.role === 'owner';
// what a login may do: the site's parts (with the guests'), the Admin tab and its servers, this page's cards (owner: all)
function rightsOfS(s) {
  const G = guests(), own = isOwnerS(s), u = s && !own ? userOf(s.user) : null, R = userRights(u);
  return { site: siteRights(G, u, own), admin: own || (!!u && R.admin), cards: own ? Object.fromEntries(ACC_CARDS.map(([k]) => [k, true])) : (u ? R.cards : {}), owner: own, servers: own ? null : (u?.servers || []) };
}
const canCard = (s, k) => admOk(s) && (isOwnerS(s) || !!rightsOfS(s).cards[k]);
const srvOk = (s, name) => isOwnerS(s) || (s?.servers || []).includes(name);
const secure = req => String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
const cookieStr = (req, tok, maxAge) => `${COOKIE}=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req) ? '; Secure' : ''}`;
// (the cookie of before v224, Path=/admin, cleared too)
const setCookie = (req, res, tok, maxAge) => res.setHeader('Set-Cookie', [cookieStr(req, tok, maxAge), `bf2r_admin=x; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure(req) ? '; Secure' : ''}`]);

// (v224) a login: a random token in the cookie, its hash in the sessions (v239: the login's and the sign-up's)
function startSession(req, res, user, keep, ip) {
  const old = cookieOf(req); if (old) sessions.delete(tokHash(old));   // (a login again: the old one goes)
  const tok = crypto.randomBytes(32).toString('base64url'), now = Date.now(), life = keep ? KEEP_D * 86400e3 : SESSION_H * 3600e3;
  sessions.set(tokHash(tok), { exp: now + life, seen: now, ip, user: user || null, role: user ? 'user' : 'owner', keep: !!keep, at: now, admSeen: now, ...(user ? {} : { pw: readPass()?.set || null }) });
  sessSave();
  if (user) { try { const j = readUsers(); if (j.users[user]) { j.users[user].last = new Date().toISOString(); writeUsers(j); } } catch (e) {} }
  setCookie(req, res, tok, Math.round(life / 1000));
}
// ---------- (v239) sign-up, the profile's settings, his own password and account ----------
// Sign-up: a name (2-32 letters, digits, . _ -; none taken, whatever its case), a password of 8 or more; at most
// SIGNUP_IP from an address an hour and SIGNUP_ALL from everywhere, SIGNUP_MAX accounts in all; a form field only robots
// fill (website) refuses it quietly. The account: self, no rights of its own - it opens what guests may.
const SIGNUP_IP = 3, SIGNUP_ALL = 30, SIGNUP_MAX = 5000, SIGNUP_WIN = 3600e3;
const signups = new Map(); let allSignups = [];
function signup(b, ip) {
  if (!signupOpen()) return { ok: false, code: 403, msg: 'signing up is closed on this site: ask its owner for an account' };
  const now = Date.now(); allSignups = allSignups.filter(x => now - x < SIGNUP_WIN);
  const mine = (signups.get(ip) || []).filter(x => now - x < SIGNUP_WIN); signups.set(ip, mine);
  if (mine.length >= SIGNUP_IP || allSignups.length >= SIGNUP_ALL) return { ok: false, code: 429, msg: 'too many new accounts lately: try again in an hour' };
  if (b.website) return { ok: false, code: 400, msg: 'could not sign up', wait: true };   // (robots)
  const name = String(b.user || '').trim(), pw = typeof b.password === 'string' ? b.password : '';
  if (!USER_RE.test(name) || /^owner$/i.test(name)) return { ok: false, msg: 'a name: 2-32 letters, digits, . _ - (not "owner")' };
  if (pw.length < 8 || pw.length > 200) return { ok: false, msg: 'the password: at least 8 characters' };
  if (pw.toLowerCase() === name.toLowerCase()) return { ok: false, msg: 'the password: not the name' };
  const j = readUsers();
  if (Object.keys(j.users).some(n => n.toLowerCase() === name.toLowerCase())) return { ok: false, code: 409, msg: 'this name is taken: another one, please' };
  if (Object.keys(j.users).length >= SIGNUP_MAX) return { ok: false, code: 503, msg: 'no new accounts for now: the site has as many as it keeps' };
  const salt = crypto.randomBytes(16).toString('base64');
  j.users[name] = { salt, hash: kdf(pw, salt).toString('base64'), N: KDF.N, r: KDF.r, p: KDF.p, pwSet: new Date().toISOString(), created: new Date().toISOString(), by: 'self', self: true, servers: [], rights: normRights({ site: {} }) };
  writeUsers(j); mine.push(now); allSignups.push(now);
  return { ok: true, name };
}
// his settings (the map's, for now: { map: {…} }), data/.prefs/<name>.json - the owner's @owner.json (no account has @)
const PREFS = path.join(DATA, '.prefs'), PREFS_MAX = 32768;
const prefsF = s => path.join(PREFS, (isOwnerS(s) ? '@owner' : s.user) + '.json');
function prefsGet(s) { const j = readJson(prefsF(s), null); return { ok: true, data: j && j.data && typeof j.data === 'object' ? j.data : null, at: j?.at || null }; }
function prefsSet(b, s) {
  const d = b && b.data; if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, msg: 'no settings' };
  const txt = JSON.stringify(d); if (txt.length > PREFS_MAX) return { ok: false, msg: `too much: ${Math.round(PREFS_MAX / 1024)} KB at the most` };
  fs.mkdirSync(PREFS, { recursive: true, mode: 0o700 });
  const f = prefsF(s), tmp = f + '.tmp', at = new Date().toISOString(); fs.writeFileSync(tmp, JSON.stringify({ at, data: d }) + '\n', { mode: 0o600 }); fs.renameSync(tmp, f);
  return { ok: true, at };
}
const prefsDrop = name => { try { fs.unlinkSync(path.join(PREFS, name + '.json')); } catch (e) {} };
// his own password (an account's - the owner's is set on the VPS): the old one first; his other logins end
function myPassword(b, s, req) {
  if (isOwnerS(s)) return { ok: false, msg: "the owner's password is set on the VPS (admin.mjs --set-password)" };
  if (!checkUser(s.user, b.old)) return { ok: false, code: 401, msg: 'the old password is wrong' };
  const pw = typeof b.password === 'string' ? b.password : ''; if (pw.length < 8 || pw.length > 200) return { ok: false, msg: 'the new password: at least 8 characters' };
  const j = readUsers(), u = j.users[s.user]; if (!u) return { ok: false, msg: 'no such account' };
  const salt = crypto.randomBytes(16).toString('base64'); Object.assign(u, { salt, hash: kdf(pw, salt).toString('base64'), N: KDF.N, r: KDF.r, p: KDF.p, pwSet: new Date().toISOString() }); writeUsers(j);
  let n = 0; for (const [k, x] of sessions) if (x.user === s.user && x.role !== 'owner' && k !== s.h) { sessions.delete(k); n++; } sessSave();
  log(`account ${s.user}: password changed by himself`); return { ok: true, msg: 'password changed' + (n ? ` (${n} other login${n === 1 ? '' : 's'} ended)` : '') };
}
// his own account away (one he made himself; those the owner made, the owner removes): with its settings, logged out
function myDelete(b, s) {
  if (isOwnerS(s)) return { ok: false, msg: 'not the owner' };
  const u = readUsers().users[s.user]; if (!u) return { ok: false, msg: 'no such account' };
  if (!u.self) return { ok: false, msg: "an account the site's owner made: he removes it" };
  if (!checkUser(s.user, b.password)) return { ok: false, code: 401, msg: 'wrong password' };
  const j = readUsers(); delete j.users[s.user]; writeUsers(j); logoutUser(s.user); prefsDrop(s.user);
  log(`account ${s.user}: removed by himself`); return { ok: true };
}

// ---------- helpers ----------
function run(cmd, args, { timeout = 20e3, cwd } = {}) {
  return new Promise(ok => execFile(cmd, args, { timeout, cwd, maxBuffer: 4 * 2 ** 20, env: process.env }, (err, out, errOut) => ok({ code: err ? (err.code ?? 1) : 0, out: String(out || ''), err: String(errOut || '') + (err && err.killed ? '\n(stopped: took too long)' : '') })));
}
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const writeJson = (f, v) => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v, null, 1) + '\n'); fs.renameSync(tmp, f); };
const listDir = d => { try { return fs.readdirSync(d); } catch (e) { return []; } };
const demoFiles = d => listDir(d).filter(f => /\.bf2demo(\.gz)?$/i.test(f));
const sizeOf = f => { try { return fs.statSync(f).size; } catch (e) { return 0; } };

// the site's decoder hash (as ingest.mjs makes it), cached by the page's modification time
let decCache = { mt: 0, hash: '?', ver: '?' };
function siteDecoder() {
  const f = path.join(SITE, 'index.html'); let mt = 0; try { mt = fs.statSync(f).mtimeMs; } catch (e) { return decCache; }
  if (mt === decCache.mt) return decCache;
  let hash = '?', ver = '?';
  try { ver = readJson(path.join(SITE, 'version.json'), {}).v || '?'; } catch (e) {}
  try {
    const html = fs.readFileSync(f, 'utf8'), L = html.split('\n');
    if (ver === '?') ver = (/const APP_VERSION = '(v\d+)'/.exec(html) || [])[1] || '?';
    const g = L.find(l => l.startsWith('const GAME = ')), a = L.findIndex(l => l.startsWith('// @worker-begin')), b = L.findIndex(l => l.startsWith('// @worker-end'));
    const k0 = html.indexOf('function killCause('), k1 = html.indexOf('\n}\n', k0);
    hash = crypto.createHash('sha1').update(g).update(L.slice(a, b).join('\n')).update(html.slice(k0, k1 + 2)).digest('hex').slice(0, 10);
  } catch (e) {}
  return (decCache = { mt, hash, ver });
}
// the round list, cached by its modification time (v176: data/.rounds-full.json - rounds.json is compact; it only when
// the whole list is not there)
let idxCache = { mt: 0, f: '', d: null };
function index() {
  let f = path.join(DATA, '.rounds-full.json'), mt = 0;
  try { mt = fs.statSync(f).mtimeMs; } catch (e) { f = path.join(DATA, 'rounds.json'); try { mt = fs.statSync(f).mtimeMs; } catch (e2) { return { rounds: [] }; } }
  if (mt !== idxCache.mt || f !== idxCache.f) idxCache = { mt, f, d: expandIndex(readJson(f, { rounds: [] })) };
  return idxCache.d || { rounds: [] };
}
// the services: systemctl show (works without root)
async function units() {
  const names = UNITS.map(u => `bf2replay-${u}.service`).concat(['bf2replay-fetch.timer', 'bf2replay-backup.timer', 'bf2replay-hints.timer', 'bf2replay-update.timer', 'bf2replay-ingest.path']);
  const r = await run(SYSTEMCTL, ['show', '--no-pager', '-p', 'Id,ActiveState,SubState,Result,ExecMainStartTimestamp,ExecMainExitTimestamp,NextElapseUSecRealtime,LastTriggerUSec,LoadState', ...names]);
  const out = {};
  for (const block of r.out.split(/\n\s*\n/)) {
    const o = {}; for (const line of block.split('\n')) { const i = line.indexOf('='); if (i > 0) o[line.slice(0, i)] = line.slice(i + 1); }
    if (o.Id) out[o.Id.replace(/^bf2replay-/, '')] = { state: o.ActiveState, sub: o.SubState, result: o.Result, loaded: o.LoadState, started: o.ExecMainStartTimestamp || null, ended: o.ExecMainExitTimestamp || null, next: o.NextElapseUSecRealtime || null, last: o.LastTriggerUSec || null };
  }
  return { units: out, ok: r.code === 0 || Object.keys(out).length > 0 };
}
// the demo sources: BF2R_FETCH_URLS (from /etc/bf2replay.conf) and the ones added here
const envSources = () => opt('BF2R_FETCH_URLS', '').split(/[\s,]+/).filter(Boolean);
const addedSources = () => { const j = readJson(SOURCES, null); return Array.isArray(j?.sources) ? j.sources.filter(s => s && typeof s.url === 'string') : []; };
// (v210) how often each page is read (fetch.mjs): its own (data/.fetch-sources.json every[url]: minutes, 'day', 'off'),
// else BF2R_FETCH_EVERY (10; 0: once a day at BF2R_FETCH_AT); when each was read last: data/.fetch-due.json
const EVERY_OK = [1, 2, 3, 5, 10, 15, 30, 60, 180, 360, 720, 'day', 'off'];
const srcEvery = () => { const j = readJson(SOURCES, null); return j?.every && typeof j.every === 'object' ? j.every : {}; };
const defEvery = () => { const v = String(opt('BF2R_FETCH_EVERY', '')).trim(); return v === '' || !/^\d+$/.test(v) ? 10 : +v === 0 ? 'day' : Math.min(1440, +v); };
const saveSources = (L, E) => { const j = readJson(SOURCES, {}) || {}; writeJson(SOURCES, { ...j, sources: L, every: E ?? (j.every || {}) }); };
function sourceEvery(b) {
  const url = String(b.url || '').trim(), v = b.every === '' || b.every == null ? null : /^\d+$/.test(String(b.every)) ? +b.every : String(b.every);
  if (!envSources().includes(url) && !addedSources().some(s => s.url === url)) return { ok: false, msg: 'not in the list' };
  if (v !== null && !EVERY_OK.includes(v)) return { ok: false, msg: 'how often: 1-720 minutes, day or off' };
  const E = { ...srcEvery() }; if (v === null) delete E[url]; else E[url] = v;
  saveSources(addedSources(), E); const said = v === null ? `as all (${everyText(defEvery())})` : everyText(v);
  log('demo source', url, 'read:', said); return { ok: true, msg: `${url}: ${said}` };
}
const everyText = v => v === 'off' ? 'not read (off)' : v === 'day' ? `once a day at ${String(opt('BF2R_FETCH_AT', '05:30')).trim() || '05:30'}` : v === 1 ? 'every minute' : v < 60 ? `every ${v} min` : `every ${v / 60} h`;
const SOURCE_RE = /^(https?:\/\/[^\s"'<>]{3,300}|[A-Za-z0-9][A-Za-z0-9.-]{0,252}(:\d{1,5})?)$/;
// what was fetched from each host (data/.fetched.json)
function fetchedByHost() {
  const seen = readJson(path.join(DATA, '.fetched.json'), {}), by = {};
  for (const [k, v] of Object.entries(seen || {})) {
    if (!v || v.skipped) continue; let h = ''; try { h = new URL(v.from || k).host; } catch (e) { h = '?'; }
    const o = by[h] || (by[h] = { n: 0, bytes: 0, last: null }); o.n++; o.bytes += v.bytes || 0; if (v.at && (!o.last || v.at > o.last)) o.last = v.at;
  }
  return by;
}

// (v224) C: the cards of an account that is not the owner's ({ rounds: true, … }) - only what they show; null: all
async function state(C = null) {
  const want = k => !C || !!C[k], dec = siteDecoder(), o = { now: new Date().toISOString(), site: { version: dec.ver, decoder: dec.hash } };
  if (want('rounds')) {
    const idx = index(), R = idx.rounds || [], cur = R.filter(r => r.decoder === dec.hash).length, servers = {};
    for (const r of R) { const s = r.server || r.sum?.server || '?'; servers[s] = (servers[s] || 0) + 1; }
    const newest = R.reduce((b, r) => !b || (r.added || '') > (b.added || '') ? r : b, null);
    // (v226) the older decoder's rounds split: demo here / to download again / cannot be decoded again by themselves
    const OR = oldRounds({ rounds: R, hash: dec.hash, source: sourceList(DATA), refetch: !!demoPolicy(DATA, opt).refetch });
    o.rounds = { total: R.length, current: cur, old: R.length - cur, oldHere: OR.here, oldBack: OR.back, stuck: OR.stuck, servers, newest: newest ? { name: newest.name, added: newest.added || null } : null };
    o.records = recordsState();   // (v206)
  }
  if (want('hints')) o.hints = htState();   // (v227)
  if (want('decode')) {
    const idx = index(), inc = listDir(INC), incDemos = inc.filter(f => /\.bf2demo(\.gz)?$/i.test(f)), parts = inc.filter(f => f.endsWith('.part')), bad = demoFiles(BAD);
    Object.assign(o, { reprocess: idx.reprocess || null, lastReprocess: readJson(path.join(DATA, 'reprocess.json'), null),
      queue: { demos: incDemos.length, bytes: incDemos.reduce((s, f) => s + sizeOf(path.join(INC, f)), 0), parts: parts.length, files: incDemos.sort().slice(0, 12) },
      bad: { demos: bad.length, files: bad.sort().slice(-12) }, decode: decodeState() });
    if (!o.rounds) o.rounds = { total: (idx.rounds || []).length };   // (the "decode every round again" question says how many)
  }
  if (want('disk')) { let disk = null; try { const st = fs.statfsSync(DATA); disk = { free: st.bavail * st.bsize, total: st.blocks * st.bsize }; } catch (e) {} o.disk = disk; o.fetchLast = readJson(path.join(DATA, '.fetch-last.json'), null); }
  if (want('services')) { const u = await units(); o.units = u.units; o.systemd = u.ok; if (!o.rounds) o.rounds = { total: (index().rounds || []).length }; }
  if (want('sources')) o.sources = { env: envSources(), added: addedSources(), fetched: fetchedByHost(), every: srcEvery(), def: defEvery(), at: String(opt('BF2R_FETCH_AT', '05:30')).trim() || '05:30', looked: readJson(path.join(DATA, '.fetch-due.json'), {})?.looked || {}, choices: EVERY_OK };
  if (want('posts')) o.notify = notifyState();
  if (want('demos')) o.demos = demoState();
  if (want('analysis')) o.analysis = analysisState();
  if (!C) {
    o.settings = Object.fromEntries(Object.keys({ ...conf, ...process.env }).filter(k => /^BF2R_/.test(k) && !/PASS/.test(k)).sort().map(k => [k, /TOKEN|WEBHOOK|SECRET|KEY/.test(k) && opt(k, '') ? '(set: not shown)' : opt(k, '')]));
    Object.assign(o, { password: !!readPass(), users: usersState(), servers: knownServers(), access: accessState() });
  }
  return o;
}
// (v224) the post settings an account with the card "Posts" sees: his servers only, and none of the shared ones' secrets
function notifyFor(N, s) {
  if (isOwnerS(s)) return N;
  return { ...N, servers: N.servers.filter(v => srvOk(s, v.name)), tgToken: N.tgToken ? 'set' : '', mine: true };
}
// (v162) how many demos ingest.mjs decodes at once: BF2R_JOBS from /etc/bf2replay.conf when set (it wins), else the
// number chosen here (data/.ingest.json; 0 = automatic), else automatic - the cores, the memory at ~1.2 GB a demo, at
// most 4 (as ingest.mjs works it out). With the machine, what is being decoded now and how fast each number went
const autoJobs = () => Math.min(4, os.cpus().length || 1, Math.max(1, Math.floor(os.totalmem() / (1.2 * 2 ** 30))));
function memAvailable() { try { const m = /MemAvailable:\s+(\d+) kB/.exec(fs.readFileSync('/proc/meminfo', 'utf8')); if (m) return +m[1] * 1024; } catch (e) {} return os.freemem(); }
function decodeState() {
  const conf = Math.max(0, Math.floor(+opt('BF2R_JOBS', '0')) || 0), set = Math.max(0, Math.floor(+readJson(JOBS_FILE, {})?.jobs) || 0), auto = autoJobs();
  let now = readJson(NOW_FILE, null);
  if (now && !(now.pid && fs.existsSync('/proc/' + now.pid) && Date.now() - Date.parse(now.updated || 0) < 30 * 60e3)) now = null;   // (left behind by a run that was stopped)
  const cpus = os.cpus();
  return { conf: conf || null, set, auto, jobs: Math.min(JOBS_MAX, conf || set || auto), max: JOBS_MAX, cpus: cpus.length, cpu: String(cpus[0]?.model || '').replace(/\s+/g, ' ').trim(),
    mem: os.totalmem(), avail: memAvailable(), load: os.loadavg().map(x => +x.toFixed(2)), now, stats: readJson(STATS_FILE, null), procs: procs() };
}
// (v163) the decoding runs now, from /proc: each ingest.mjs (node) - new demos, again (--reprocess) or all again
// (--rebuild) - since when, and whether it started before the last update (the old code: the site or ingest.mjs is newer
// than it); and the flock in front of each (the services run "flock -w 7200 .ingest.lock node ingest.mjs"): one with no
// ingest.mjs under it yet is waiting for the lock - another run has it
function procs() {
  let boot = 0; try { boot = +((/^btime (\d+)/m.exec(fs.readFileSync('/proc/stat', 'utf8')) || [])[1] || 0); } catch (e) { return null; }
  if (!boot) return null;
  const HZ = 100, L = [];
  for (const pid of listDir('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    let cmd = []; try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean); } catch (e) { continue; }
    const i = cmd.findIndex(a => /(^|\/)ingest\.mjs$/.test(a)); if (i < 0) continue;
    let st = ''; try { st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); } catch (e) { continue; }
    const f = st.slice(st.lastIndexOf(')') + 2).split(' ');   // (from the 3rd field on: state, ppid, ... starttime is the 22nd)
    const args = cmd.slice(i + 1), kind = args.includes('--rebuild') ? 'rebuild' : args.includes('--reprocess') ? 'reprocess' : 'ingest';
    L.push({ pid: +pid, ppid: +f[1], start: boot + +f[19] / HZ, flock: /(^|\/)flock$/.test(cmd[0]), kind });
  }
  const mt = fl => { try { return fs.statSync(fl).mtimeMs / 1000; } catch (e) { return 0; } }, upd = Math.max(mt(path.join(SITE, 'index.html')), mt(path.join(HERE, 'ingest.mjs')));
  const runs = L.filter(p => !p.flock), out = [];
  for (const p of runs) out.push({ kind: p.kind, pid: p.pid, since: new Date(p.start * 1000).toISOString(), old: upd > 0 && p.start < upd - 1 });
  for (const p of L.filter(p => p.flock && !runs.some(r => r.ppid === p.pid))) out.push({ kind: p.kind, pid: p.pid, since: new Date(p.start * 1000).toISOString(), waiting: true });
  return out.sort((a, b) => !!a.waiting - !!b.waiting || a.since.localeCompare(b.since));
}
function jobsSet(b) {
  if (b.reset) { const S = readJson(STATS_FILE, null); writeJson(STATS_FILE, { machine: S?.machine || '', by: {}, since: new Date().toISOString() }); log('decoding speeds cleared'); return { ok: true, msg: 'speeds cleared: they are measured again from the next demos' }; }
  const n = Math.floor(+b.jobs); if (!(n >= 0 && n <= JOBS_MAX)) return { ok: false, msg: `0 (automatic) to ${JOBS_MAX}` };
  writeJson(JOBS_FILE, { jobs: n, set: new Date().toISOString() }); log('demos decoded at once:', n || 'automatic');
  const conf = Math.max(0, Math.floor(+opt('BF2R_JOBS', '0')) || 0);
  return { ok: true, msg: (n ? `${n} at once` : `automatic (${autoJobs()} at once here)`) + (conf ? ` - but BF2R_JOBS=${conf} in /etc/bf2replay.conf wins: remove it there` : ': from the next demo on (also while decoding now)') };
}
// ---------- (v192) the background analysis (analyze.mjs --auto, bf2replay-hints): how far it is ----------
// The rounds it looks at (6+ soldiers, not copies) against those done with the page's hint rules now (HINTS_V; the round
// files' rules: analysis/.hv.json), the last run's pace and so when all are done; the glitch grids (analysis/glitch/
// summary.json, glitch.mjs); the players' hint cards (data/.admin/hints.json). Worked out at most every 30 s.
let anCache = { at: 0, v: null }, hvPage = { mt: 0, v: 0, ver: '' };
// (v193) a run of analyze.mjs still going (a pid of a run that ended without saying so may be another program's by now)
const alive = pid => { if (!pid) return false; try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('analyze.mjs'); } catch (e) { if (fs.existsSync('/proc/self')) return false; try { process.kill(pid, 0); return true; } catch (e2) { return false; } } };
const dirBytes = d => { let b = 0; for (const f of listDir(d)) b += sizeOf(path.join(d, f)); return b; };
// (v193) the archives in analysis/ (analyze.mjs --pack): name, size, when, and what is in each (its .tar.json beside it -
// for an archive made before v193, summary.json read out of it once, in the background, and kept as its .tar.json)
const ARCH_RE = /^bf2-analysis-[A-Za-z0-9._-]+\.tar$/;
let archBusy = false;
function archives() {
  const OUTD = path.join(ROOT, 'analysis'), out = [];
  for (const f of listDir(OUTD)) {
    const part = f.endsWith('.tar.part'), name = part ? f.slice(0, -5) : f; if (!ARCH_RE.test(name)) continue;
    let st; try { st = fs.statSync(path.join(OUTD, f)); } catch (e) { continue; }
    const j = part ? null : readJson(path.join(OUTD, f + '.json'), null);
    if (!part && !j && !archBusy) { archBusy = true; run('tar', ['-xOf', path.join(OUTD, f), '--occurrence=1', 'summary.json'], { timeout: 120e3 }).then(r => { let sum = null; try { sum = JSON.parse(r.out); } catch (e) {} try { writeJson(path.join(OUTD, f + '.json'), { file: f, bytes: st.size, old: true, ...(sum || { unknown: true }) }); } catch (e) {} archBusy = false; anCache.at = 0; }); }
    out.push({ file: f, part, bytes: st.size, at: st.mtime.toISOString(), site: j?.site || (/-(v\d+)\.tar$/.exec(name) || [])[1] || null, rounds: j?.rounds ?? null, pages: j?.pages || null, hv: j?.hv || null, hvNow: j?.hvNow ?? null, made: j?.made || null, glitch: j?.glitch || null, old: !!j?.old, unknown: !!j?.unknown });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
function pageVer() { pageHintsV(); return hvPage.ver; }
// ---------- (v227) the hints' thresholds (hintcfg.mjs): the site's set - the owner and the accounts with the right
// ('hints'), sent from the page's editor; each admin's own (any account with the Admin tab) ----------
const HT_ADM = () => path.join(HERE, 'admin-round.js'), htMineF = () => path.join(DATA, '.admin', HT_MINE_FILE);
function htState() {
  const S = htSiteSet(DATA), P = htPageSpec(HT_ADM()), by = new Map((P.spec || []).map(s => [s.k, s]));
  return { n: (P.spec || []).length, changed: Object.entries(S.values).map(([k, v]) => ({ k, v, d: by.get(k)?.d ?? null, h: by.get(k)?.h || '', l: by.get(k)?.l || '' })), off: S.off, at: S.at, by: S.by, hv: pageHintsV() };
}
function htSiteSave(b, s) {
  const P = htPageSpec(HT_ADM()), c = htCheckSet(b, P, false); if (c.bad.length) return { ok: false, msg: c.bad.slice(0, 5).join('; ') };
  fs.mkdirSync(path.join(DATA, '.admin'), { recursive: true });
  const f = path.join(DATA, '.admin', HT_SITE_FILE), was = htSiteSet(DATA), v = { values: c.values, off: c.off, at: new Date().toISOString(), by: whoOf(s) };
  if (!Object.keys(v.values).length && !v.off.length) { try { fs.unlinkSync(f); } catch (e) {} } else writeJson(f, v);
  anCache.at = 0;   // (the analysis card: the new rules at once)
  log(`hint thresholds (the site's) by ${whoOf(s)}: ${Object.keys(v.values).length} changed${v.off.length ? ', off: ' + v.off.join(' ') : ''} (were ${Object.keys(was.values).length}${was.off.length ? ' + ' + was.off.length + ' off' : ''}) - hint rules ${pageHintsV()}`);
  return { ok: true, site: htSiteSet(DATA) };
}
function htMineGet(s) { const all = readJson(htMineF(), {}) || {}, m = all[whoOf(s)] || null; return { ok: true, mine: m }; }
function htMineSave(b, s) {
  const P = htPageSpec(HT_ADM()), c = htCheckSet(b, P, true); if (c.bad.length) return { ok: false, msg: c.bad.slice(0, 5).join('; ') };
  fs.mkdirSync(path.join(DATA, '.admin'), { recursive: true });
  const all = readJson(htMineF(), {}) || {}, who = whoOf(s), m = { values: c.values, off: c.off, on: c.on, use: !!(b && b.use), at: new Date().toISOString() };
  if (!Object.keys(m.values).length && !m.off.length && !m.on.length && !m.use) delete all[who]; else all[who] = m;
  writeJson(htMineF(), all);
  return { ok: true, mine: all[who] || null };
}
function pageHintsV() {   // (v196: HINTS_V is in the admins' part of the page, server/admin-round.js)
  const f = path.join(SITE, 'index.html'), g = path.join(HERE, 'admin-round.js'); let mt = 0; try { mt = fs.statSync(f).mtimeMs + fs.statSync(g).mtimeMs; } catch (e) { return 0; }
  if (mt !== hvPage.mt) { let v = 0, ver = '', av = 0; try { const t = fs.readFileSync(f, 'utf8'), a = fs.readFileSync(g, 'utf8'); v = +((/const HINTS_V = (\d+)/.exec(a) || /const HINTS_V = (\d+)/.exec(t) || [])[1] || 0); ver = (/const APP_VERSION = '(v\d+)'/.exec(t) || [])[1] || ''; av = +((/const ANALYZE_V = (\d+)/.exec(a) || [])[1] || 0); } catch (e) {} hvPage = { mt, v, ver, av }; }
  // (v227) with the site's hint thresholds: HINTS_V.<hash> while they differ from the recommended (hintcfg.mjs)
  return hvPage.v ? htSiteHv(hvPage.v, DATA, HT_ADM()) : hvPage.v;
}
// (v248) how many rounds the analysis does at once - as analyze.mjs works it out: BF2R_ANALYZE_JOBS from
// /etc/bf2replay.conf when set (it wins), else the number chosen here (analysis/.auto-set.json jobs; 0 = automatic), else
// automatic: the cores less two, the memory at ~1.5 GB a page (60% of it), at most 12. With the machine and how fast each
// number went (analysis/.jobs-stats.json, written by analyze.mjs)
const AN_JOBS_MAX = 16, AN_PAGE_GB = 1.5;
const anAutoJobs = () => Math.max(1, Math.min(12, (os.cpus().length || 1) - 2, Math.floor(os.totalmem() * 0.6 / (AN_PAGE_GB * 2 ** 30))));
function anJobsState(OUTD) {
  const conf = Math.max(0, Math.floor(+opt('BF2R_ANALYZE_JOBS', '0')) || 0), set = Math.max(0, Math.floor(+(readJson(path.join(OUTD, '.auto-set.json'), {}) || {}).jobs) || 0), auto = anAutoJobs();
  return { conf: conf || null, set, auto, jobs: Math.min(AN_JOBS_MAX, conf || set || auto), max: AN_JOBS_MAX, pageGb: AN_PAGE_GB, cpus: os.cpus().length, mem: os.totalmem(), avail: memAvailable(), load: os.loadavg().map(x => +x.toFixed(2)), stats: readJson(path.join(OUTD, '.jobs-stats.json'), null) };
}
function analysisState() {
  if (anCache.v && Date.now() - anCache.at < (anCache.v.pack?.on || anCache.v.running ? 5e3 : 30e3)) return anCache.v;
  const OUTD = path.join(ROOT, 'analysis'), HV = pageHintsV(), hv = readJson(path.join(OUTD, '.hv.json'), {}) || {}, failed = readJson(path.join(OUTD, 'failed.json'), {}) || {};
  const copies = readJson(path.join(DATA, '.copies.json'), {})?.copies || {}, fileOf = n => String(n || '').replace(/\.bf2demo$/i, '').replace(/[^A-Za-z0-9._-]/g, '_') + '.json.gz';
  const R = (index().rounds || []).filter(r => r.sum && !r.sum.empty && r.bfr && !copies[r.name] && !((r.sum.players ?? 0) < 6));
  // (v249: a round done with the hint rules now but an older analysis - without the flag choices - is not done yet either;
  // v251: nor one whose analysis the index has no version of - the background run reads it from the file and puts it in)
  const AV = hvPage.av || 0;
  let cur = 0, old = 0; for (const r of R) { const f = fileOf(r.name), v = hv[f]; if (v === undefined) continue; if (String(v) === String(HV) && !(AV && (hv['v:' + f] ?? 0) < AV)) cur++; else old++; }   // (v227: HINTS_V.<hash> - the same, or older)
  const auto = readJson(path.join(OUTD, 'auto.json'), null), run = readJson(path.join(OUTD, 'run.json'), null);
  const runOn = !!(run && !run.ended && alive(run.pid)), autoOn = !!(auto && !auto.ended && alive(auto.pid));
  const secs = auto && auto.ended && auto.done ? (Date.parse(auto.ended) - Date.parse(auto.started)) / 1000 : null;
  // (v248) when all is done: at the pace measured for the number at once now (analysis/.jobs-stats.json), else the last
  // run's (its rounds over its time) - a run goes on batch after batch now, with 5 minutes between runs of 95
  const J = anJobsState(OUTD), sp = J.stats?.by?.[J.jobs], left = Math.max(0, R.length - cur);
  const rate = sp && sp.n >= 3 && sp.secs ? sp.n / sp.secs * J.jobs : secs && auto.done ? auto.done / secs : null;
  const pw = fs.existsSync(path.join(ROOT, 'analyze', 'node_modules', 'playwright', 'package.json'));
  const gl = readJson(path.join(OUTD, 'glitch', 'summary.json'), null), hc = readJson(path.join(DATA, '.admin', 'hints.json'), null);
  const set = readJson(path.join(OUTD, '.auto-set.json'), {}) || {}, note = readJson(path.join(OUTD, 'auto-note.json'), null);
  const pk = readJson(path.join(OUTD, '.pack.json'), null), packing = !!(pk && !pk.ended && alive(pk.pid));
  const v = { hv: HV, total: R.length, cur, old, none: Math.max(0, R.length - cur - old), failed: Object.keys(failed).length, auto: auto ? { started: auto.started, ended: auto.ended || null, done: auto.done || 0, rounds: auto.rounds || 0, jobs: auto.jobs || 1, running: auto.running ?? null, batch: auto.batch || null, failed: auto.failed || 0, secs } : null,
    set: { paused: set.paused || null }, jobs: J, note, site: pageVer(),
    pack: pk ? { started: pk.started, ended: pk.ended || null, file: pk.file || null, bytes: pk.bytes || 0, error: pk.error || null, on: packing, dead: !pk.ended && !packing } : null,
    archives: archives(), roundsBytes: dirBytes(path.join(OUTD, 'rounds')),
    manual: run ? { started: run.started, ended: run.ended || null, on: runOn, done: run.done || 0, rounds: run.rounds || 0 } : null,
    running: autoOn ? 'auto' : runOn ? 'manual' : null, eta: left && rate ? Math.round(left / rate * (1 + 300 / (95 * 60))) : left ? null : 0, rate, playwright: pw, off: opt('BF2R_HINTS', '1') === '0',
    glitch: gl ? { at: gl.at, minRounds: gl.minRounds, maps: gl.maps, left: gl.left, stays: gl.stays, hints: gl.hints } : null, cards: hc ? { at: hc.at, rounds: hc.rounds, players: hc.players, scores: hc.scores || null } : null };   // (v214: + the suspicion scores' top)
  anCache = { at: Date.now(), v }; return v;
}

// ---------- (v186, todo 230) the demos: what takes the room, which old ones go (demos.mjs) ----------
// the room each part of /srv/bf2replay takes (walked at most once a minute: thousands of files)
let duCache = { at: 0, v: null };
function duAll() {
  if (duCache.v && Date.now() - duCache.at < 60e3) return duCache.v;
  const walk = (d, depth = 0) => { let n = 0, b = 0; for (const f of listDir(d)) { const p = path.join(d, f); let st; try { st = fs.lstatSync(p); } catch (e) { continue; } if (st.isDirectory()) { if (depth < 4) { const w = walk(p, depth + 1); n += w.n; b += w.b; } } else if (st.isFile()) { n++; b += st.size; } } return { n, b }; };
  const parts = { demos: path.join(DATA, 'demos'), rounds: path.join(DATA, 'rounds'), copies: path.join(DATA, '.copies'), empty: path.join(DATA, 'empty'), bad: BAD, incoming: INC, analysis: path.join(ROOT, 'analysis'), playwright: path.join(ROOT, 'analyze'), backup: path.join(ROOT, 'backup') };
  const v = {}; for (const [k, d] of Object.entries(parts)) v[k] = walk(d);
  { const w = walk(DATA); let inParts = 0; for (const k of ['demos', 'rounds', 'copies', 'empty', 'bad']) inParts += v[k].b; v.other = { n: 0, b: Math.max(0, w.b - inParts) }; }
  for (const f of listDir(DATA).filter(f => /^old-/.test(f))) { const w = walk(path.join(DATA, f)); v.old = { n: (v.old?.n || 0) + w.n, b: (v.old?.b || 0) + w.b }; }
  duCache = { at: Date.now(), v }; return v;
}
const demoInputs = () => ({ rounds: index().rounds || [], hash: siteDecoder().hash, hints: hintRounds(DATA), source: sourceList(DATA) });
function planOut(plan) {
  const by = {}; for (const x of plan.remove) by[x.why] = (by[x.why] || 0) + 1;
  return { n: plan.remove.length, bytes: plan.remove.reduce((s, x) => s + x.bytes, 0), by, back: plan.back, kept: plan.kept, demos: plan.demos, total: plan.bytes, after: plan.after, over: plan.over,
    names: plan.remove.slice(0, 15).map(x => ({ name: x.name, bytes: x.bytes, at: x.at, back: x.back, why: x.why })) };
}
function demoState() {
  const P = demoPolicy(DATA, opt), I = demoInputs(), R = I.rounds;
  const plan = demoPlan({ ...I, policy: P });
  const gone = R.filter(r => !r.demo && r.sum && !r.sum.empty), back = gone.filter(r => I.source.has(r.name)).length;
  const rf = readJson(path.join(DATA, REFETCH_FILE), null), byName = new Set(R.map(r => linkId(r.name)));
  return {
    policy: { keepDays: P.keepDays, keepDaysConf: P.keepDaysConf, maxGB: P.maxGB, keepHinted: !!P.keepHinted, keepUnlisted: !!P.keepUnlisted, refetch: !!P.refetch, refetchPerRun: P.refetchPerRun, set: P.set },
    keep: Object.entries(P.keep).map(([n, at]) => ({ name: n, at, here: byName.has(linkId(n)) })),
    du: duAll(), plan: planOut(plan), gone: gone.length, back, hints: { alive: I.hints.alive, at: I.hints.at, rounds: I.hints.rounds.size },
    source: I.source.size, refetch: rf ? { want: (rf.want || []).length, at: rf.at } : null, last: readJson(path.join(DATA, DEMOS_LAST_FILE), null),
    autoclean: opt('BF2R_RAW_AUTOCLEAN', '1') !== '0', minFree: (+opt('BF2R_MIN_FREE_GB', '3') || 0) * 2 ** 30
  };
}
const demoFields = (b, P) => {
  const o = {}, bad = [];
  if (b.keepDays !== undefined) { const n = Math.floor(+b.keepDays); if (n >= 0 && n <= 3650) o.keepDays = n; else bad.push('days: 0 to 3650'); }
  if (b.maxGB !== undefined) { const n = +b.maxGB; if (n >= 0 && n <= 1e5) o.maxGB = Math.round(n * 10) / 10; else bad.push('GB: 0 or more'); }
  if (b.keepHinted !== undefined) o.keepHinted = !!b.keepHinted;
  if (b.keepUnlisted !== undefined) o.keepUnlisted = !!b.keepUnlisted;   // (v226)
  if (b.refetch !== undefined) o.refetch = !!b.refetch;
  if (b.refetchPerRun !== undefined) { const n = Math.floor(+b.refetchPerRun); if (n >= 1 && n <= 500) o.refetchPerRun = n; else bad.push('a run: 1 to 500'); }
  return { o, bad };
};
function demosPreview(b) {
  const P = demoPolicy(DATA, opt), { o, bad } = demoFields(b, P); if (bad.length) return { ok: false, msg: bad.join(', ') };
  const Q = { ...P, ...o }; if (P.keepDaysConf) Q.keepDays = P.keepDaysConf;
  return { ok: true, plan: planOut(demoPlan({ ...demoInputs(), policy: Q })) };
}
function demosSet(b) {
  const f = path.join(DATA, DEMOS_FILE), cur = readJson(f, {}) || {}, { o, bad } = demoFields(b, demoPolicy(DATA, opt)); if (bad.length) return { ok: false, msg: bad.join(', ') };
  const v = { ...cur, ...o, set: new Date().toISOString() }; writeJson(f, v); duCache.at = 0;
  log('demo settings:', JSON.stringify({ keepDays: v.keepDays, maxGB: v.maxGB, keepHinted: v.keepHinted, keepUnlisted: v.keepUnlisted, refetch: v.refetch, refetchPerRun: v.refetchPerRun }));
  const conf = Math.max(0, Math.floor(+opt('BF2R_RAW_KEEP_DAYS', '0')) || 0);
  return { ok: true, msg: 'saved: ingest applies them at its next run (within 2 min, or "Remove now")' + (conf && o.keepDays !== undefined ? ` - but BF2R_RAW_KEEP_DAYS=${conf} in /etc/bf2replay.conf wins for the days: remove it there` : '') };
}
// a round by its name, its link (https://…/r/<id>, …#round=<id>) or id
function roundOf(s) {
  s = String(s || '').trim(); if (!s) return null;
  const m = /(?:\/r\/|[#&?]round=)([^&#?\s/]+)/.exec(s); let id = m ? decodeURIComponent(m[1]) : s.split('/').pop();
  id = linkId(id); return (index().rounds || []).find(r => linkId(r.name) === id) || null;
}
function demosKeep(b) {
  const f = path.join(DATA, DEMOS_FILE), cur = readJson(f, {}) || {}, keep = { ...(cur.keep || {}) };
  if (b.on === false) { const k = Object.keys(keep).find(n => linkId(n) === linkId(b.round)); if (!k) return { ok: false, msg: 'not on the list' }; delete keep[k]; writeJson(f, { ...cur, keep }); log('demo no longer kept:', k); return { ok: true, msg: `${k}: off the list (its demo goes by the settings)` }; }
  const r = roundOf(b.round); if (!r) return { ok: false, msg: 'no such round on the site: its name (auto_2026_10_18_20_28_05), its link or id' };
  if (keep[r.name]) return { ok: false, msg: 'already on the list' };
  keep[r.name] = new Date().toISOString(); writeJson(f, { ...cur, keep }); log('demo kept:', r.name);
  return { ok: true, msg: `${r.name}: its demo stays${r.demo ? '' : ' - it is gone already (it comes back only if "download again" brings it for a new decoder)'}` };
}
// the copies of rounds (v182: the same demo from two demo pages - data/.copies): removed, the list of them stays
function copiesDelete() {
  const d = path.join(DATA, '.copies'); let n = 0, bytes = 0;
  for (const f of listDir(d)) { const p = path.join(d, f); try { const st = fs.lstatSync(p); if (!st.isFile()) continue; fs.unlinkSync(p); n++; bytes += st.size; } catch (e) {} }
  const sz = bytes >= 2 ** 30 ? (bytes / 2 ** 30).toFixed(1) + ' GB' : Math.round(bytes / 2 ** 20) + ' MB';
  duCache.at = 0; log('copies of rounds removed:', n, 'files,', sz);
  return { ok: true, msg: `${n} file${n === 1 ? '' : 's'} removed (${sz}); the links to those copies still open the same rounds` };
}

// (v153) the round posts (notify.mjs): where to, with the secrets shown only by their last 4 characters. (v194) Each
// game server its own channels and parts: the servers set up, and those with rounds in the last 90 days (not posted
// until set up), with their rounds
function notifyState() {
  const N = notifySettings(), tail = v => v ? '…' + v.slice(-4) : '', day = n => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);
  const seen = new Map(), d30 = day(30), d90 = day(90);
  for (const r of index().rounds || []) {
    if (!r.sum || r.sum.empty) continue;
    const n = serverOf(r), d = String(r.sum.date || ''); let o = seen.get(n); if (!o) seen.set(n, o = { n30: 0, total: 0, newest: '' });
    o.total++; if (d.slice(0, 10) >= d30) o.n30++; if (d > o.newest) o.newest = d;
  }
  const names = new Set([...Object.keys(N.servers), ...[...seen].filter(([, o]) => o.newest.slice(0, 10) >= d90).map(([n]) => n)]);
  const servers = [...names].map(name => {
    const c = N.servers[name], o = seen.get(name) || { n30: 0, total: 0, newest: '' };
    return { name, set: !!c, rounds30: o.n30, rounds: o.total, newest: o.newest || null, minPlayers: c?.minPlayers ?? null, last: c?.last || null, format: c ? c.format : normFormat(null), formatSet: !!c?.formatSet,
      discord: c ? { on: c.discord.on, webhook: tail(c.discord.webhook), lines: c.discord.lines } : null, telegram: c ? { on: c.telegram.on, chat: c.telegram.chat, lines: c.telegram.lines } : null,
      digest: c ? { ...c.digest } : null, digestLog: c ? c.digestLog : null, digestTry: c ? c.digestTry : null,   // (v209)
      digestFmt: c ? (F => ({ ...F, dcWebhook: tail(F.dcWebhook) }))(normDigestFmt(c.digestFmt, c)) : null, digestTo: c ? digestTargets(N, name).map(t => t.app === 'discord' ? (t.own ? 'discord-own' : 'discord') : t.app) : [],   // (v220)
      alert: c ? { on: c.alert.on, webhook: tail(c.alert.webhook), min: c.alert.min, log: c.alert.log } : null };   // (v214)
  }).sort((a, b) => (b.set - a.set) || String(b.newest || '').localeCompare(String(a.newest || '')) || a.name.localeCompare(b.name));
  return { tgToken: tail(N.tgToken), tgTokenConf: N.tgTokenConf, minPlayers: N.minPlayers, minPlayersConf: N.minPlayersConf, last: N.last, domain: !!opt('BF2R_DOMAIN', '').trim(),
    items: POST_ITEMS.map(([k, name, what]) => ({ k, name, what, on: linesOf({})[k], ...(TLABEL[k] ? { short: TLABEL[k] } : {}) })), servers, migrated: N.migrated, ignoredConf: N.ignoredConf,
    digestAt: DIGEST_AT, digestTz: DIGEST_TZ, digestPeriods: Object.fromEntries(DIGEST_KINDS.map(k => [k, periodOf(k)])),
    digestParts: DG_PARTS, digestVars: DG_VARS, digestLeaders: DG_LEADERS, digestBests: DG_BESTS, digestTopN: DG_TOP_N, digestFmtDefault: DG_FMT_DEFAULT,   // (v220)
    vars: POST_VARS, formatDefault: FORMAT_DEFAULT, templates: Object.entries(N.templates).map(([name, t]) => ({ name, ...t })).sort((a, b) => a.name.localeCompare(b.name)) };   // (v195: the post editor)
}
const cleanLines = o => { const keys = new Set(POST_ITEMS.map(([k]) => k)), L = {}; for (const [k, v] of Object.entries(o || {})) if (keys.has(k)) L[k] = !!v; return L; };
const notifyFile = () => readJson(path.join(DATA, '.notify.json'), {}) || {};
const linesOf2 = linesOf;   // (v207: the parts new in v207 off unless turned on)
const knownServer = name => !!notifySettings().servers[name] || (index().rounds || []).some(r => r.sum && !r.sum.empty && serverOf(r) === name);
function notifySet(b) {
  const said = [];
  if (b.server !== undefined) {   // (v194) one server's settings
    const name = String(b.server || ''); if (!name || name.length > 300) return { ok: false, msg: 'which server?' };
    if (!knownServer(name)) return { ok: false, msg: 'no rounds of such a server' };
    if (b.remove) { saveNotify({}, name, null); log(`round posts (${name}): removed`); return { ok: true, msg: `${name}: its rounds are no more posted` }; }
    const N = notifySettings(), cur = N.servers[name], srv = {};
    if (b.discord) {
      const d = {};
      if (b.discord.webhook !== undefined) { const v = String(b.discord.webhook || '').trim(); if (v && !DISCORD_RE.test(v)) return { ok: false, msg: 'not a Discord webhook address (https://discord.com/api/webhooks/<number>/<token>)' }; d.webhook = v; d.on = !!v; said.push(v ? 'Discord webhook saved (on)' : 'Discord webhook removed'); }
      if (b.discord.on !== undefined) { d.on = !!b.discord.on; said.push(`Discord ${d.on ? 'on' : 'off'}${d.on && !cur?.discord.webhook && !d.webhook ? ' (no webhook yet: add one)' : ''}`); }
      if (b.discord.lines) { d.lines = cleanLines(b.discord.lines); said.push('Discord parts saved'); }
      srv.discord = d;
    }
    if (b.telegram) {
      const t = {};
      if (b.telegram.chat !== undefined) { const v = String(b.telegram.chat || '').trim(); if (v && !TG_CHAT_RE.test(v)) return { ok: false, msg: 'not a Telegram chat: its id (-100… for a group or channel) or @channelname' }; t.chat = v; t.on = !!v; said.push(v ? `Telegram chat ${v} saved (on)${N.tgToken ? '' : ' - the bot\'s token is still needed (above)'}` : 'Telegram chat removed'); }
      if (b.telegram.on !== undefined) { t.on = !!b.telegram.on; said.push(`Telegram ${t.on ? 'on' : 'off'}${t.on && !cur?.telegram.chat && !t.chat ? ' (no chat yet: add one)' : ''}`); }
      if (b.telegram.lines) { t.lines = cleanLines(b.telegram.lines); said.push('Telegram parts saved'); }
      srv.telegram = t;
    }
    if (b.format !== undefined) { srv.format = b.format === null ? null : normFormat(b.format); said.push(b.format === null ? 'the post: back to classic' : `the post saved (${srv.format.style === 'card' ? 'Discord: a card' : srv.format.style === 'table' ? 'Discord: a table' : srv.format.style === 'text' ? 'Discord: text' : 'classic'})`); }   // (v195)
    if (b.minPlayers !== undefined) {
      if (b.minPlayers === null || b.minPlayers === '' || b.minPlayers === 0) { srv.minPlayers = null; said.push(`fewest players: as all (${N.minPlayers})`); }
      else { const n = Math.floor(+b.minPlayers); if (!(n >= 1 && n <= 64)) return { ok: false, msg: 'players: 1 to 64' }; srv.minPlayers = n; said.push(`rounds with ${n}+ players`); }
    }
    if (b.digest !== undefined) {   // (v209) the summaries: a day, a week, a month - one turned on starts at the next one due (not the period over already)
      const was = cur?.digest || {}, d = {}, last = { ...(cur?.digestLast || {}) };
      for (const k of DIGEST_KINDS) { d[k] = b.digest[k] !== undefined ? !!b.digest[k] : !!was[k]; if (d[k] && !was[k]) last[k] = periodOf(k).key; }
      srv.digest = d; srv.digestLast = last;
      const on = DIGEST_KINDS.filter(k => d[k]); said.push(on.length ? `summaries: ${on.join(', ')} (at ${DIGEST_AT})` : 'no summaries');
    }
    if (b.digestFmt !== undefined) {   // (v220) the summaries' own settings: where they go, what is in them
      const f = b.digestFmt && typeof b.digestFmt === 'object' ? b.digestFmt : {}, was = cur?.digestFmt || {}, o = { ...was };
      if (f.dcWebhook !== undefined) {
        const v = String(f.dcWebhook || '').trim(); if (v && !DISCORD_RE.test(v)) return { ok: false, msg: 'not a Discord webhook address (https://discord.com/api/webhooks/<number>/<token>)' };
        if (v && v === cur?.alert?.webhook) return { ok: false, msg: "that is the admin channel's webhook: the summaries are public" };
        o.dcWebhook = v; if (v) o.dcOn = true; said.push(v ? 'summaries: their own Discord channel (on)' : "summaries: to the round posts' Discord channel");
      }
      for (const [k, w] of [['dcOn', 'Discord'], ['tgOn', 'Telegram']]) if (f[k] !== undefined) { o[k] = !!f[k]; said.push(`summaries on ${w}: ${o[k] ? 'on' : 'off'}`); }
      const CONTENT = ['title', 'intro', 'content', 'footer', 'color', 'topN', 'rows', 'parts', 'leaders', 'bests'];
      if (CONTENT.some(k => f[k] !== undefined)) { const n = normDigestFmt({ ...o, ...f, dcWebhook: o.dcWebhook }, cur); for (const k of CONTENT) o[k] = n[k]; said.push('the summary saved'); }
      if (f.reset) { for (const k of CONTENT) delete o[k]; said.push('the summary: back to the standard one'); }
      const n = normDigestFmt(o, cur); o.dcOn = n.dcOn; o.tgOn = n.tgOn;   // (from now on its own, not the round posts')
      srv.digestFmt = o;
    }
    if (b.alert !== undefined) {   // (v214) the admins' private channel
      const a = {};
      if (b.alert.webhook !== undefined) { const v = String(b.alert.webhook || '').trim(); if (v && !DISCORD_RE.test(v)) return { ok: false, msg: 'not a Discord webhook address (https://discord.com/api/webhooks/<number>/<token>)' }; if (v && v === cur?.discord?.webhook) return { ok: false, msg: 'that is the public channel\'s webhook: the admin channel must be a private one' }; a.webhook = v; a.on = !!v; said.push(v ? 'admin channel webhook saved (on)' : 'admin channel webhook removed'); }
      if (b.alert.on !== undefined) { a.on = !!b.alert.on; said.push(`admin channel ${a.on ? 'on' : 'off'}${a.on && !cur?.alert?.webhook && !a.webhook ? ' (no webhook yet: add one)' : ''}`); }
      if (b.alert.min !== undefined) { a.min = b.alert.min === 'hint' ? 'hint' : 'strong'; said.push(`admin channel: ${a.min === 'hint' ? 'strong and ordinary hints' : 'strong hints'}`); }
      srv.alert = a;
    }
    if (!said.length) return { ok: false, msg: 'nothing to change' };
    saveNotify({}, name, srv); log(`round posts (${name}):`, said.join(', '));
    return { ok: true, msg: `${name}: ${said.join(' · ')}` };
  }
  // (v195) the post's templates (for any server) and one post for every server set up
  const linesIn = L => ({ discord: cleanLines(L?.discord), telegram: cleanLines(L?.telegram) });
  if (b.template !== undefined) {
    const name = String(b.template?.name || '').trim().slice(0, 60); if (!name) return { ok: false, msg: 'a name for the template' };
    const T = { ...(notifyFile().templates || {}) }; T[name] = { format: normFormat(b.template.format), lines: linesIn(b.template.lines), at: new Date().toISOString() };
    saveNotify({ templates: T }); log('round posts: template saved:', name); return { ok: true, msg: `template "${name}" saved` };
  }
  if (b.templateRemove !== undefined) {
    const name = String(b.templateRemove || ''), T = { ...(notifyFile().templates || {}) }; if (!(name in T)) return { ok: false, msg: 'no such template' };
    delete T[name]; saveNotify({ templates: T }); log('round posts: template removed:', name); return { ok: true, msg: `template "${name}" removed` };
  }
  if (b.applyAll !== undefined) {
    const F = normFormat(b.applyAll.format), L = linesIn(b.applyAll.lines), names = Object.keys(notifySettings().servers);
    if (!names.length) return { ok: false, msg: 'no server is set up yet' };
    for (const n of names) saveNotify({}, n, { format: F, discord: { linesAll: { ...linesOf2(L.discord) } }, telegram: { linesAll: { ...linesOf2(L.telegram) } } });
    log(`round posts: one post for all ${names.length} servers`); return { ok: true, msg: `this post now on all ${names.length} server${names.length === 1 ? '' : 's'} set up (their channels stay)` };
  }
  if (b.tgToken !== undefined) {
    const t = String(b.tgToken || '').trim(); if (t && !TG_TOKEN_RE.test(t)) return { ok: false, msg: "not a Telegram bot token (from @BotFather: 123456789:AA…)" };
    saveNotify({ telegram: { token: t } }); said.push(t ? 'Telegram bot saved' : 'Telegram bot removed (no Telegram posts)');
  }
  if (b.minPlayers !== undefined) { const n = Math.floor(+b.minPlayers); if (!(n >= 1 && n <= 64)) return { ok: false, msg: 'players: 1 to 64' }; saveNotify({ minPlayers: n }); said.push(`rounds with ${n}+ players (where a server says nothing else)`); }
  if (!said.length) return { ok: false, msg: 'nothing to change' };
  log('round posts:', said.join(', '));
  return { ok: true, msg: said.join(' · ') };
}
// (v187) the post about a round as Discord and Telegram would get it, nothing sent: the round named, or the server's
// newest (v194: with the server's parts - or those given, the boxes as they are on the page)
function notifyPreview(b) {
  const srv = b.server !== undefined ? String(b.server) : null;
  const R = (index().rounds || []).filter(r => r.sum && !r.sum.empty && (srv === null || serverOf(r) === srv));
  const r = b.round ? roundOf(b.round) : R.sort((x, y) => String(y.sum.date).localeCompare(String(x.sum.date)))[0];
  if (!r || !r.sum) return { ok: false, msg: b.round ? 'no such round on the site' : 'no rounds of this server yet' };
  const c = srv !== null ? notifySettings().servers[srv] : null;
  const cfg = { format: b.format !== undefined ? normFormat(b.format) : c?.format, discord: { lines: { ...(c?.discord.lines || {}), ...(b.lines?.discord || {}) } }, telegram: { lines: { ...(c?.telegram.lines || {}), ...(b.lines?.telegram || {}) } } };
  return { ok: true, round: r.name, server: serverOf(r), hl: !!r.sum.hl, ...postTexts(r, cfg) };
}
async function notifyRun(arg, server) {
  const r = await run(NODE, [path.join(HERE, 'notify.mjs'), arg, ...(server ? [String(server)] : [])], { timeout: 60e3 });
  const out = (r.out + (r.err ? '\n' + r.err : '')).trim();
  return { ok: r.code === 0, msg: out.split('\n').pop() || (r.code === 0 ? 'posted' : 'failed') };
}

// ---------- actions ----------
// (v163) stop a decoding run: it finishes writing the round list and ends (from v163 on; an older ingest.mjs just ends -
// a round it was writing is listed again by the next run); what it had not got to waits for the next one
async function stopUnit(u) {
  if (!STOPPABLE.includes(u)) return { ok: false, msg: 'only the decoding services can be stopped here' };
  const r = await run(SUDO, ['-n', SYSTEMCTL, 'stop', '--no-block', `bf2replay-${u}.service`]);
  if (r.code === 0) { log('stopped', `bf2replay-${u}`); return { ok: true, msg: `bf2replay-${u} stopped: what it had not decoded yet waits for the next run` }; }
  const why = (r.err || r.out).trim().split('\n').pop();
  return { ok: false, msg: `could not stop bf2replay-${u}: ${why || 'error ' + r.code}${/password|sudoers|not allowed/i.test(why) ? ' (the permission comes with units.sh: wait a minute after the update, or run sudo bash /srv/bf2replay/repo/server/units.sh; or on the VPS: sudo systemctl stop bf2replay-' + u + ')' : ''}` };
}
// (v206, Sagara: "a button on the admin page: Recalculate all records") every round summed up again from its decoded file
// (no decoding: ~0.5 s a round) - its kills, distances, highlights for the posts, records; then the Records, players' and
// maps' pages and the numbers over all rounds. ingest.mjs does it at its next run (started now): data/.resum-request.json
function recordsState() {
  const rd = f => readJson(path.join(DATA, f), null);
  return { asked: rd('.resum-request.json'), done: rd('.resum-done.json'), now: rd('.resum-now.json') };
}
async function recordsAgain() {
  const S = recordsState();
  if (S.asked?.at && (!S.done?.at || S.done.at < S.asked.at)) return { ok: false, msg: `already asked for ${S.asked.at.replace('T', ' ').slice(0, 16)} UTC${S.now ? `: ${S.now.done} of ${S.now.total} rounds done` : ': it starts with the next decoding run'}` };
  writeJson(path.join(DATA, '.resum-request.json'), { at: new Date().toISOString(), by: 'admin page' });
  log('records: all rounds to be summed up again (asked for on the admin page)');
  const r = await startUnit('ingest');
  const n = (index().rounds || []).filter(x => x.bfr && x.sum && !x.sum.empty).length;
  return { ok: true, msg: `all ${n} rounds will be summed up again (~${Math.max(1, Math.round(n * 0.5 / 60))} min)${r.ok ? ': started' : ': it starts by itself within 2 minutes'} - then the records and the pages are written again` };
}
async function startUnit(u) {
  if (!UNITS.includes(u)) return { ok: false, msg: 'unknown service' };
  if (u === 'fetch') try { writeJson(path.join(DATA, '.fetch-now.json'), { at: new Date().toISOString() }); } catch (e) {}   // (v210: every page, not only those whose time is up)
  const r = await run(SUDO, ['-n', SYSTEMCTL, 'start', '--no-block', `bf2replay-${u}.service`]);
  if (r.code === 0) { log('started', `bf2replay-${u}`); return { ok: true, msg: `bf2replay-${u} started` }; }
  const why = (r.err || r.out).trim().split('\n').pop();
  return { ok: false, msg: `could not start bf2replay-${u}: ${why || 'error ' + r.code}${/password|sudoers|not allowed/i.test(why) ? ' (the permission comes with units.sh: wait a minute after the update, or run sudo bash /srv/bf2replay/repo/server/units.sh)' : ''}` };
}
// (v193) the background analysis from the admin page (analysis/.auto-set.json, read by analyze.mjs --auto before and
// between rounds): run now; pause (the rounds being done are finished first) and go on; (v248) how many rounds at once
// (read again by a run every 5 s) and clearing the speeds measured (all rounds now - v193-v246 - is no more: a run does
// them all by itself now, batch after batch); make the archive (analyze.mjs --pack, in the background: a few minutes)
// and remove one
const AND = () => path.join(ROOT, 'analysis');
function anSet(f) { const F = path.join(AND(), '.auto-set.json'), o = readJson(F, {}) || {}; f(o); for (const k of Object.keys(o)) if (o[k] == null) delete o[k]; fs.mkdirSync(AND(), { recursive: true }); writeJson(F, o); anCache.at = 0; return o; }
async function analysisAct(b) {
  const what = String(b.do || ''), now = new Date().toISOString();
  anCache.at = 0; const A = analysisState(), busy = A.running === 'auto';
  if (what === 'run' || what === 'resume') {
    anSet(o => { o.paused = null; });
    if (A.running === 'manual') return { ok: true, msg: 'analyze.sh start is running: the background analysis goes on after it' };
    const r = await startUnit('hints'); if (!r.ok) return r;
    return { ok: true, msg: busy ? 'it is running already: it goes on' : 'started: first the glitch grids (a minute or two), then the rounds in the page' };
  }
  if (what === 'jobs') {
    if (b.reset) { const S = readJson(path.join(AND(), '.jobs-stats.json'), null); fs.mkdirSync(AND(), { recursive: true }); writeJson(path.join(AND(), '.jobs-stats.json'), { machine: S?.machine || '', by: {}, since: now }); log('analysis speeds cleared'); anCache.at = 0; return { ok: true, msg: 'speeds cleared: they are measured again from the next rounds' }; }
    const n = Math.floor(+b.jobs); if (!(n >= 0 && n <= AN_JOBS_MAX)) return { ok: false, msg: `0 (automatic) to ${AN_JOBS_MAX}` };
    anSet(o => { o.jobs = n || null; }); log('rounds analysed at once:', n || 'automatic');
    const conf = Math.max(0, Math.floor(+opt('BF2R_ANALYZE_JOBS', '0')) || 0);
    return { ok: true, msg: (n ? `${n} at once` : `automatic (${anAutoJobs()} at once here)`) + (conf ? ` - but BF2R_ANALYZE_JOBS=${conf} in /etc/bf2replay.conf wins: remove it there` : busy ? ': the run going now follows it within seconds' : ': from the next run on') };
  }
  if (what === 'boost' || what === 'unboost') { anSet(o => { o.boost = null; }); return { ok: true, msg: 'no longer needed (v248): every run does all the rounds that need it, several at once' }; }
  if (what === 'pause') { anSet(o => { o.paused = now; }); return { ok: true, msg: 'paused' + (busy ? ': the run going now finishes the round it is on and stops' : '') + '; nothing more until "Go on"' }; }
  if (what === 'pack') {
    if (A.pack?.on) return { ok: false, msg: 'an archive is being made already' };
    let free = Infinity; try { const st = fs.statfsSync(AND()); free = st.bavail * st.bsize; } catch (e) {}
    const need = Math.round(A.roundsBytes * 1.02) + 64 * 2 ** 20;
    if (free < need + 2 ** 30) return { ok: false, msg: `not enough room for it: it takes about ${(need / 2 ** 30).toFixed(1)} GB, ${(free / 2 ** 30).toFixed(1)} GB free (1 GB stays free); remove an older archive first` };
    fs.mkdirSync(AND(), { recursive: true });
    const lf = fs.openSync(path.join(AND(), '.pack.log'), 'w');
    const ch = spawn(NODE, [path.join(HERE, 'analyze.mjs'), '--pack'], { detached: true, stdio: ['ignore', lf, lf], env: process.env, cwd: ROOT });
    fs.closeSync(lf); try { os.setPriority(ch.pid, 15); } catch (e) {}
    ch.on('error', e => log('archive not started:', e.message)); ch.unref();
    try { writeJson(path.join(AND(), '.pack.json'), { started: now, pid: ch.pid }); } catch (e) {}
    anCache.at = 0; log('archive of the analysis started, pid', ch.pid);
    return { ok: true, msg: `making the archive (about ${(need / 2 ** 30).toFixed(1)} GB): a few minutes; "Download" comes when it is done` };
  }
  if (what === 'archive-delete') {
    const f = String(b.file || ''), name = f.endsWith('.part') ? f.slice(0, -5) : f;
    if (!ARCH_RE.test(name) || f.includes('/')) return { ok: false, msg: 'no such archive' };
    if (A.pack?.on && f.endsWith('.part')) return { ok: false, msg: 'it is being made now' };
    let n = 0; for (const x of f === name ? [f, f + '.json'] : [f]) { try { fs.unlinkSync(path.join(AND(), x)); n++; } catch (e) {} }
    anCache.at = 0; log('analysis archive removed:', f);
    return n ? { ok: true, msg: `removed: ${f}` } : { ok: false, msg: 'not there' };
  }
  return { ok: false, msg: 'unknown' };
}
// (v193) an archive to the browser (behind the login, as all here); resumable (Range)
function sendArchive(req, res, name) {
  name = String(name || '');
  if (!ARCH_RE.test(name)) return send(res, 404, { error: 'no such archive' });
  const f = path.join(AND(), name); let st; try { st = fs.statSync(f); } catch (e) { return send(res, 404, { error: 'no such archive' }); }
  const tag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`, lm = st.mtime.toUTCString();
  const H = { 'Content-Type': 'application/x-tar', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no', 'Referrer-Policy': 'no-referrer', 'Accept-Ranges': 'bytes', ETag: tag, 'Last-Modified': lm };
  let a = 0, z = st.size - 1, code = 200;
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || ''), ir = req.headers['if-range'];
  if (m && (!ir || ir === tag || ir === lm)) {
    a = +m[1]; if (m[2]) z = Math.min(z, +m[2]);
    if (a > z || a >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
    code = 206; H['Content-Range'] = `bytes ${a}-${z}/${st.size}`;
  }
  H['Content-Length'] = z - a + 1; res.writeHead(code, H);
  if (req.method === 'HEAD') return res.end();
  const rs = fs.createReadStream(f, { start: a, end: z }); rs.on('error', () => res.destroy()); res.on('close', () => rs.destroy()); rs.pipe(res);
  if (!a) log('analysis archive downloaded:', name, 'from', clientIp(req));
}
// (v197) a round for its Admin tab: what the page can't know - where its demo came from and when, its copies, the
// analysis of it, whether its demo is kept or goes (demos.mjs). A server's admin: only his servers' rounds
const jsonByMt = new Map();   // (files read again only when they change: .fetched.json can be big)
function readJsonMt(f, d) { let mt = 0; try { mt = fs.statSync(f).mtimeMs; } catch (e) { return d; } const c = jsonByMt.get(f); if (c && c.mt === mt) return c.v; const v = readJson(f, d); jsonByMt.set(f, { mt, v }); return v; }
const anFileOf = n => String(n || '').replace(/\.bf2demo$/i, '').replace(/[^A-Za-z0-9._-]/g, '_') + '.json.gz';
let planCache = { at: 0, v: null };
function demoPlanNow() { if (planCache.v && Date.now() - planCache.at < 60e3) return planCache.v; const I = demoInputs(), plan = demoPlan({ ...I, policy: demoPolicy(DATA, opt) }); planCache = { at: Date.now(), v: new Map(plan.remove.map(x => [x.name, x.why])) }; return planCache.v; }
function roundInfo(name, s) {
  const r = roundOf(name); if (!r || !r.sum) return { ok: false, msg: 'no such round' };
  if (!srvOk(s, r.sum.server)) return { ok: false, msg: 'not one of the servers of your account' };
  const F = readJsonMt(path.join(DATA, '.fetched.json'), {}) || {}, C = readJsonMt(path.join(DATA, '.copies.json'), {})?.copies || {};
  const last = u => { try { return decodeURIComponent(String(u).split('?')[0].split('/').pop() || ''); } catch (e) { return ''; } };
  const got = Object.entries(F).filter(([u, v]) => last(u) === r.name || (v && v.of === r.name)).map(([u, v]) => ({ url: u, at: v?.at || null, bytes: v?.bytes ?? null, skipped: v?.skipped || null }));
  const copies = Object.entries(C).filter(([, v]) => v && v.of === r.name).map(([n, v]) => ({ name: n, at: v.at || null, bytes: v.bytes ?? null }));
  const OUTD = path.join(ROOT, 'analysis'), af = path.join(OUTD, 'rounds', anFileOf(r.name)), hv = (readJsonMt(path.join(OUTD, '.hv.json'), {}) || {})[anFileOf(r.name)];
  const failed = (readJsonMt(path.join(OUTD, 'failed.json'), {}) || {})[r.name] || null; let aAt = null; try { aAt = fs.statSync(af).mtime.toISOString(); } catch (e) {}
  const dp = path.join(DATA, r.demo || ('demos/' + r.name)), here = !!r.demo && fs.existsSync(dp), goes = here ? demoPlanNow().get(r.name) || null : null;
  const keep = readJson(path.join(DATA, DEMOS_FILE), {})?.keep || {};
  return { ok: true, name: r.name, server: r.sum.server, added: r.added || null, bytes: r.bytes ?? null, decoder: r.decoder || null, siteDecoder: siteDecoder().hash, sumV: r.sumV ?? null,
    bfr: r.bfr ? { file: r.bfr, bytes: sizeOf(path.join(DATA, r.bfr)) } : null,
    demo: { here, bytes: here ? sizeOf(dp) : null, goes, kept: !!keep[r.name] || !!keep[linkId(r.name)] },
    listed: sourceList(DATA).get(r.name) || null, got, copies, copyOf: C[r.name]?.of || null,
    analysis: { at: aAt, hv: hv ?? null, hvNow: pageHintsV(), failed } };
}
// (v198) the admins' review: marks on a round's hints (checked / a false alarm / suspicious), notes on a round and on a
// player (every admin sees them), the trusted players (not highlighted: the owner's for every server, a server admin's
// for his servers). data/.admin/review: rounds/<round>.json { marks: { key: { state, by, at, note } }, notes: [...] },
// players/<nick>.json { nick, notes: [...] }, trusted.json { nicks: { nick: { by, at, why, servers } } }
const REV = path.join(DATA, '.admin', 'review'), REV_STATES = ['ok', 'false', 'sus'];
const nickSlugS = nick => { const n = String(nick), s = n.replace(/[^A-Za-z0-9_.-]+/g, '_'); if (s === n) return s; let h = 0x811c9dc5; for (const ch of n) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return s + '-' + h.toString(16).padStart(8, '0').slice(0, 6); };   // (the page's nickSlug)
const revRoundFile = name => path.join(REV, 'rounds', linkId(name).replace(/[^A-Za-z0-9._-]/g, '_') + '.json');
const revPlayerFile = nick => path.join(REV, 'players', nickSlugS(nick) + '.json');
const revWrite = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); writeJson(f, v); };
const whoOf = s => s.role === 'owner' ? 'owner' : s.user || 'owner', isOwner = isOwnerS;
const txt = (v, n) => String(v ?? '').replace(/\r/g, '').trim().slice(0, n);
function revRound(s, name) {
  const r = roundOf(name); if (!r || !r.sum) return { err: 'no such round' };
  if (!srvOk(s, r.sum.server)) return { err: 'not one of the servers of your account' };
  return { r };
}
function trustedFor(server) { const T = readJson(path.join(REV, 'trusted.json'), {})?.nicks || {}, out = {}; for (const [n, e] of Object.entries(T)) if (!e.servers || !server || e.servers.includes(server)) out[n] = e; return out; }
// ---------- (v250) the flag choices (server/choices.mjs: data/.admin/choices.json) for the admins' page #achoices ----------
// The owner: every server together and each on its own; a server's admin: his servers', each on its own (that server's
// players as its own rounds have them - never the whole site's). The trusted players marked (as the review keeps them).
// "Work it out again": the owner, or an account with the card Background analysis (analyze.mjs --choices, in the
// background: seconds to a few minutes)
const CHOICES_F = () => path.join(DATA, '.admin', 'choices.json'), CHRUN_F = () => path.join(ROOT, 'analysis', '.choices-run.json');
function choicesFor(s, R) {
  const J = readJsonMt(CHOICES_F(), null), own = R.owner, run = readJson(CHRUN_F(), null);
  const base = { ok: true, running: !!(run && !run.ended && alive(run.pid)), canRun: own || !!R.cards.analysis, at: J?.at || null, ranAt: run?.started || null };
  if (!J) return { ...base, scopes: [] };
  const mark = (L, srv) => { const T = trustedFor(srv); return (L || []).map(p => T[p.nick] ? { ...p, trusted: true } : p); };
  const scopes = [];
  if (own) scopes.push({ key: '', label: 'All servers', rounds: J.rounds, choices: J.choices, telling: J.telling, null: J.null, pseudoR2: J.pseudoR2, players: mark(J.players, null) });
  for (const [sv, o] of Object.entries(J.byServer || {})) if (own || srvOk(s, sv)) scopes.push({ key: sv, label: sv, ...o, players: mark(o.players, sv) });
  return { ...base, min: J.min, check: J.check || null, known: J.known || null, scopes, mine: own ? null : (s.servers || []) };
}
function choicesRun(s, R) {
  if (!R.owner && !R.cards.analysis) return { ok: false, msg: "working it out again is the owner's, or an account's with the card Background analysis" };
  const run = readJson(CHRUN_F(), null); if (run && !run.ended && alive(run.pid)) return { ok: false, msg: 'it is being worked out already' };
  fs.mkdirSync(path.dirname(CHRUN_F()), { recursive: true });
  const lf = fs.openSync(path.join(path.dirname(CHRUN_F()), '.choices.log'), 'w');
  const ch = spawn(NODE, [path.join(HERE, 'analyze.mjs'), '--choices'], { detached: true, stdio: ['ignore', lf, lf], env: process.env, cwd: ROOT });
  fs.closeSync(lf); try { os.setPriority(ch.pid, 15); } catch (e) {}
  ch.on('error', e => log('flag choices not started:', e.message));
  ch.on('exit', () => { try { const o = readJson(CHRUN_F(), {}) || {}; if (o.pid === ch.pid) writeJson(CHRUN_F(), { ...o, ended: new Date().toISOString() }); } catch (e) {} });
  ch.unref();
  try { writeJson(CHRUN_F(), { started: new Date().toISOString(), pid: ch.pid, by: whoOf(s) }); } catch (e) {}
  log(`flag choices: worked out again by ${whoOf(s)}, pid`, ch.pid);
  return { ok: true, msg: 'being worked out again: seconds to a few minutes (longer once a day, with its checks) - the page shows it when it is done' };
}
// ---------- (v244) the admins' statistics: the analysed rounds in memory (statq.mjs), made at the first question ----------
// (the players' nicks as the site's statistics merge them: the page's nickOf - its "@agg" part, as analyze.mjs takes it)
let SQ = null;
// (as code: the store is made in a worker thread, which makes its own nickOf of it)
function pageNickSrc() {
  try {
    const L = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8').split('\n'), a = L.findIndex(l => l.startsWith('// @agg-begin')), b = L.findIndex(l => l.startsWith('// @agg-end')), g = L.find(l => l.startsWith('const GAME = '));
    if (g && a >= 0 && b > a) { const src = g + '\n' + L.slice(a, b).join('\n') + '\nreturn nickOf;'; new Function(src)(); return src; }
  } catch (e) { log('statq: the page\'s nickOf did not load:', e.message); }
  return '';   // (statq.mjs: the simple rule - the last word of the name)
}
const statq = () => SQ || (SQ = statqKeeper({ dir: path.join(ROOT, 'analysis', 'rounds'), nickSrc: pageNickSrc(), log }));
function revGet(b, s) {
  const { r, err } = revRound(s, b.round); if (err) return { ok: false, msg: err };
  const R = readJson(revRoundFile(r.name), {}) || {}, P = {};
  for (const n of (Array.isArray(b.nicks) ? b.nicks : []).slice(0, 256).map(x => String(x).slice(0, 64))) { const j = readJson(revPlayerFile(n), null); if (j?.notes?.length) P[n] = j.notes; }
  return { ok: true, round: r.name, marks: R.marks || {}, notes: R.notes || [], players: P, trusted: trustedFor(r.sum.server), me: whoOf(s), owner: isOwner(s) };
}
function revMark(b, s) {
  const { r, err } = revRound(s, b.round); if (err) return { ok: false, msg: err };
  const key = txt(b.key, 300), st = b.state == null ? null : String(b.state); if (!key) return { ok: false, msg: 'which hint?' };
  if (st !== null && !REV_STATES.includes(st)) return { ok: false, msg: 'checked, false or sus' };
  const f = revRoundFile(r.name), R = readJson(f, {}) || {}; R.marks = R.marks || {};
  if (st === null) delete R.marks[key]; else R.marks[key] = { state: st, by: whoOf(s), at: new Date().toISOString(), ...(b.note ? { note: txt(b.note, 1000) } : {}), ...(b.what ? { what: txt(b.what, 400), t: +b.t || 0 } : {}) };
  revWrite(f, R); log(`review: ${whoOf(s)} marked ${key} in ${r.name}: ${st || 'cleared'}`);
  return { ok: true, msg: st === null ? 'mark cleared' : st === 'ok' ? 'marked: checked, nothing there' : st === 'false' ? 'marked: a false alarm' : 'marked: suspicious' };
}
function revNote(b, s) {
  const me = whoOf(s), now = new Date().toISOString(); let f, J, about;
  if (b.round) { const { r, err } = revRound(s, b.round); if (err) return { ok: false, msg: err }; f = revRoundFile(r.name); J = readJson(f, {}) || {}; about = r.name; }
  else if (b.nick) { const n = txt(b.nick, 64); if (!n) return { ok: false, msg: 'which player?' }; f = revPlayerFile(n); J = readJson(f, null) || { nick: n }; about = n; }
  else return { ok: false, msg: 'a round or a player' };
  J.notes = Array.isArray(J.notes) ? J.notes : [];
  if (b.remove) { const i = J.notes.findIndex(x => x.id === b.remove); if (i < 0) return { ok: false, msg: 'no such note' }; if (J.notes[i].by !== me && !isOwner(s)) return { ok: false, msg: 'only its writer (or the site\'s owner) removes a note' }; J.notes.splice(i, 1); revWrite(f, J); return { ok: true, msg: 'note removed' }; }
  const t = txt(b.text, 2000); if (!t) return { ok: false, msg: 'an empty note' };
  J.notes.push({ id: crypto.randomBytes(6).toString('hex'), by: me, at: now, text: t, ...(b.nick && b.inRound ? { round: txt(b.inRound, 200) } : {}) });
  if (J.notes.length > 500) J.notes = J.notes.slice(-500);
  revWrite(f, J); log(`review: ${me} wrote a note on ${about}`); return { ok: true, msg: 'note saved' };
}
function revTrusted(b, s) {
  const n = txt(b.nick, 64); if (!n) return { ok: false, msg: 'which player?' };
  const f = path.join(REV, 'trusted.json'), J = readJson(f, {}) || {}; J.nicks = J.nicks || {}; const cur = J.nicks[n], me = whoOf(s);
  if (b.on && cur && cur.by !== me && !isOwner(s)) return { ok: false, msg: `${n}: already trusted (by ${cur.by})` };
  if (b.on) { J.nicks[n] = { by: me, at: new Date().toISOString(), why: txt(b.why, 300), servers: isOwner(s) ? null : (s.servers || []) }; revWrite(f, J); log(`review: ${me} trusts ${n}`); return { ok: true, msg: `${n}: trusted${isOwner(s) ? '' : ' (on your servers)'} - his hints are not highlighted` }; }
  if (!cur) return { ok: false, msg: 'not on the list' };
  if (cur.by !== me && !isOwner(s)) return { ok: false, msg: `on the list by ${cur.by}: only he (or the site's owner) takes him off` };
  delete J.nicks[n]; revWrite(f, J); log(`review: ${me} no more trusts ${n}`); return { ok: true, msg: `${n}: no more trusted` };
}
// (v196) the servers' admins: made, changed (password, servers) and removed by the owner; a change ends their logins
// (v224) the users: each one's rights too (access.mjs: the site's parts, the Admin tab, this page's cards); and the
// guests' (data/.access.json) - which closes the site, or parts of it, to whoever is not logged in
function usersState() {
  const U = readUsers().users, now = Date.now();
  return Object.entries(U).map(([name, u]) => ({ name, servers: u.servers || [], rights: userRights(u), created: u.created || null, last: u.last || null, by: u.by || null, self: !!u.self, in: [...sessions.values()].some(x => x.user === name && x.role !== 'owner' && now < x.exp), adm: [...sessions.values()].some(x => x.user === name && x.role !== 'owner' && now < x.exp && admOk(x)) }))   // (v246: adm - his admin powers still on in a login).sort((a, b) => a.name.localeCompare(b.name));
}
function accessState() { return { guests: guests(), gate: fs.existsSync(GATE_F), site: ACC_SITE, guestExtra: ACC_GUEST, cards: ACC_CARDS, open: openPlaces(guests()), signup: signupOpen() }; }
function knownServers() { const S = new Set(); for (const r of index().rounds || []) if (r.sum && !r.sum.empty && r.sum.server) S.add(r.sum.server); return [...S].sort(); }
const logoutUser = name => { let n = 0; for (const [k, x] of sessions) if (x.user === name && x.role !== 'owner') { sessions.delete(k); n++; } if (n) sessSave(); return n; };
function userSet(b) {
  const name = String(b.name || '').trim(); if (!USER_RE.test(name) || name.toLowerCase() === 'owner') return { ok: false, msg: 'a name: 2-32 letters, digits, . _ - (not "owner")' };
  const j = readUsers(), u = j.users[name], said = [];
  if (!u && !b.password) return { ok: false, msg: 'a password for the new account' };
  const o = u ? { ...u } : { created: new Date().toISOString(), by: 'owner', servers: [] };
  if (b.password) { const pw = String(b.password); if (pw.length < 8 || pw.length > 200) return { ok: false, msg: 'the password: at least 8 characters' }; const salt = crypto.randomBytes(16).toString('base64'); Object.assign(o, { salt, hash: kdf(pw, salt).toString('base64'), N: KDF.N, r: KDF.r, p: KDF.p, pwSet: new Date().toISOString() }); said.push(u ? 'password changed' : 'made'); }
  if (Array.isArray(b.servers)) { o.servers = [...new Set(b.servers.map(x => String(x).slice(0, 300)).filter(Boolean))]; said.push(`servers: ${o.servers.length ? o.servers.join(', ') : 'none'}`); }
  if (b.rights !== undefined) {   // (v224)
    const R = normRights(b.rights); o.rights = R;
    const site = ACC_SITE.filter(([k]) => R.site[k]).map(([, n]) => n), cards = ACC_CARDS.filter(([k]) => R.cards[k]).map(([, n]) => n);
    said.push(`may open: ${site.length ? site.join(', ') : 'nothing of the site but what guests may'}${R.admin ? '; the Admin tab' : ''}${cards.length ? '; on the admin page: ' + cards.join(', ') : ''}`);
  } else if (!u) o.rights = normRights({ site: { view: true, list: true, players: true, records: true, stats: true, clips: true } });   // (a new account without rights given: watching, no admin)
  if (!said.length) return { ok: false, msg: 'nothing to change' };
  j.users[name] = o; writeUsers(j);
  if (u && b.password) logoutUser(name);   // (a new password: logged out)
  log(`account ${name}:`, said.join(', ')); return { ok: true, msg: `${name}: ${said.join(' · ')}` };
}
function userRemove(b) {
  const name = String(b.name || ''), j = readUsers(); if (!j.users[name]) return { ok: false, msg: 'no such account' };
  delete j.users[name]; writeUsers(j); logoutUser(name); prefsDrop(name);   // (v239: his settings too)
  { const all = readJson(htMineF(), null); if (all && all[name]) { delete all[name]; writeJson(htMineF(), all); } }   // (v227: his own hint thresholds go too)
  log(`account ${name}: removed`); return { ok: true, msg: `${name}: removed (logged out)` };
}
function accessSet(b) {
  const G = normGuests(b.guests), J = readJson(ACC_F, {}) || {}, su = typeof b.signup === 'boolean' ? b.signup : J.signup !== false;   // (v239: sign-ups)
  writeJson(ACC_F, { ...J, guests: G, signup: su, set: new Date().toISOString() }); try { fs.chmodSync(ACC_F, 0o600); } catch (e) {}
  accCache.mt = -1; const on = syncGate();
  const open = [...ACC_SITE, ...ACC_GUEST].filter(([k]) => G[k]).map(([, n]) => n);
  log('access for guests:', open.length ? open.join(', ') : 'nothing');
  return { ok: true, msg: (on ? (open.length ? `guests may open: ${open.join(', ')} - the rest needs a login` : 'the site is closed: everything needs a login') : 'the site is open to everyone') + (su ? ' · visitors may sign up' : ' · signing up closed') };
}
// the demos that could not be decoded (data/bad) back into the queue: the ingest service's path unit sees them at once
function retryBad() {
  let n = 0, skipped = 0;
  fs.mkdirSync(INC, { recursive: true });
  for (const f of demoFiles(BAD)) { const dst = path.join(INC, f); if (fs.existsSync(dst)) { skipped++; continue; } try { fs.renameSync(path.join(BAD, f), dst); n++; } catch (e) { skipped++; } }
  log('failed demos back in the queue:', n);
  return { ok: true, msg: `${n} demo${n === 1 ? '' : 's'} back in the queue${skipped ? `, ${skipped} skipped (already there)` : ''}` };
}
function addSource(url) {
  url = String(url || '').trim();
  if (!SOURCE_RE.test(url)) return { ok: false, msg: 'not an address: a page (http://… or https://…) or a game server (IP or name, :port if not the usual)' };
  const L = addedSources(); if (L.some(s => s.url === url) || envSources().includes(url)) return { ok: false, msg: 'already in the list' };
  L.push({ url, added: new Date().toISOString() }); saveSources(L); log('demo source added:', url);
  return { ok: true, msg: `added: ${url} (read at the next fetch, or press "Fetch new demos now")` };
}
function removeSource(url) {
  const L = addedSources(), M = L.filter(s => s.url !== url);
  if (M.length === L.length) return { ok: false, msg: envSources().includes(url) ? 'this one is in /etc/bf2replay.conf (BF2R_FETCH_URLS): remove it there' : 'not in the list' };
  const E = { ...srcEvery() }; delete E[url]; saveSources(M, E); log('demo source removed:', url); return { ok: true, msg: `removed: ${url} (its demos and rounds stay)` };
}
// fetch.mjs --probe / --list: only looks, writes nothing
async function fetchLook(args, timeout) {
  const r = await run(NODE, [path.join(HERE, 'fetch.mjs'), ...args], { timeout });
  return { ok: r.code === 0, out: (r.out + (r.err ? '\n' + r.err : '')).trim().slice(-20000) || '(no answer)' };
}
async function journal(u, n) {
  if (!['ingest', 'reprocess', 'rebuild', 'fetch', 'update', 'backup', 'hints', 'digest', 'admin', 'all'].includes(u)) return { ok: false, out: 'unknown service' };
  const who = u === 'all' ? ['-u', 'bf2replay-*'] : ['-u', `bf2replay-${u}`];
  const r = await run(JOURNALCTL, [...who, '-n', String(Math.max(10, Math.min(500, n || 120))), '--no-pager', '-o', 'short-iso'], { timeout: 15e3 });
  const out = (r.out || r.err).trim();
  return { ok: r.code === 0, out: out || '(nothing)', noAccess: /not seeing messages|No journal files|permission/i.test(out) };
}

// ---------- the server ----------
function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
// (v196) a file to a logged-in admin: never cached, nothing else about it said
function sendFile(res, f, type) {
  let b; try { b = fs.readFileSync(f); } catch (e) { return send(res, 404, { error: 'not found' }); }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': b.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); res.end(b);
}
const bodyOf = req => new Promise((ok, no) => { let s = ''; req.on('data', c => { s += c; if (s.length > 1e5) { no(new Error('too big')); req.destroy(); } }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } }); req.on('error', no); });
// (a POST must come from the page itself: the same host, and the header only a script on the page sends)
const sameSite = req => { const o = req.headers.origin, h = req.headers['x-forwarded-host'] || req.headers.host; if (req.headers['x-bf2r'] !== '1') return false; if (!o) return true; try { return new URL(o).host === h; } catch (e) { return false; } };

// (v224) a round by its name for a visitor who may watch rounds but not see the list (rounds.json closed to him): its
// line of rounds.json, as the page would have it there
let refCache = { mt: -1, d: null };
function roundRef(name) {
  const f = path.join(DATA, 'rounds.json'); let mt = 0; try { mt = fs.statSync(f).mtimeMs; } catch (e) { return null; }
  if (mt !== refCache.mt) refCache = { mt, d: expandIndex(readJson(f, { rounds: [] })) };
  const d = refCache.d || { rounds: [] }, id = linkId(String(name || '').trim()), meta = { share: !!d.share, stats: d.stats || null, decoder: d.decoder || null, updated: d.updated || null };
  if (!id) return { ok: false, msg: 'which round?', ...meta };   // (no name: what the page needs besides - the statistics' version, the previews)
  const L = (d.rounds || []).filter(r => r && r.sum && !r.sum.empty);
  const r = L.find(x => linkId(x.name) === id) || L.find(x => id.endsWith('_' + linkId(x.name)) || linkId(x.name).endsWith('_' + id));
  return r ? { ok: true, round: r, ...meta } : { ok: false, msg: 'no such round', ...meta };
}
const PAGE = path.join(HERE, 'admin.html'), LOGIN_PAGE = path.join(HERE, 'login.html');
const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const AGAIN = { error: "log in again: an admin's powers last 12 h from the login (2 h without a step)", again: true };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), p = url.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'GET' && (p === '/admin' || p === '/admin/index.html')) return send(res, 200, fs.readFileSync(PAGE), 'text/html; charset=utf-8');
    if (req.method === 'GET' && (p === '/login' || p === '/admin/login')) return send(res, 200, fs.readFileSync(LOGIN_PAGE), 'text/html; charset=utf-8');   // (v224)
    if (!p.startsWith('/admin/api/')) return send(res, 404, { error: 'not found' });
    const what = p.slice('/admin/api/'.length), ip = clientIp(req);
    // (v224) the web server's question about a request of the site (Caddy forward_auth while data/.access-gate is
    // there; nginx auth_request): may this visitor open it - yes (204), no: a page goes to the login, the rest 401 / 403
    if (what === 'gate') {
      const G = guests(); if (!gateNeeded(G)) { res.writeHead(204, noStore); return res.end(); }
      const uri = String(req.headers['x-bf2r-uri'] || req.headers['x-original-uri'] || '/');
      // the path as the web server may read it - as sent, and decoded (/data/rounds/..%2fdemos/x is data/demos/x to a
      // file server), each with its . and .. resolved: every reading must be allowed
      let raw = '/'; try { raw = new URL(uri, 'http://x').pathname; } catch (e) { raw = '/'; }
      let dec = raw; try { dec = decodeURIComponent(raw); } catch (e) { dec = raw; }
      const reads = [...new Set([raw, dec].map(x => path.posix.normalize(x.replace(/\\/g, '/'))))];
      const s = sessionOf(req), R = s ? rightsOfS(s).site : G;
      if (!/\0/.test(dec) && reads.every(x => allowed(R, needOf(x)))) { res.writeHead(204, noStore); return res.end(); }
      if (req.headers['x-bf2r-nginx']) return send(res, s ? 403 : 401, { error: 'no' });   // (nginx's auth_request takes only 2xx / 401 / 403: it sends a page to the login itself)
      const nav = req.headers['sec-fetch-mode'] === 'navigate' || (!req.headers['sec-fetch-mode'] && /text\/html/.test(String(req.headers.accept || '')));
      if (nav) { res.writeHead(302, { ...noStore, Location: '/login?next=' + encodeURIComponent(uri.startsWith('/') && !uri.startsWith('//') ? uri : '/') + (s ? '&no=1' : '') }); return res.end(); }
      return send(res, s ? 403 : 401, { error: s ? 'your account may not open this' : 'log in first', login: '/login' });
    }
    if (req.method === 'POST' && !sameSite(req)) return send(res, 403, { error: 'not from the admin page' });
    if (what === 'login' && req.method === 'POST') {
      const wait = blocked(ip); if (wait) return send(res, 429, { error: `too many wrong passwords: try again in ${wait} min` });
      const b = await bodyOf(req), user = String(b.user || '').trim();
      if (!user && !readPass()) return send(res, 503, { error: 'no password set yet: on the VPS run  sudo node /srv/bf2replay/repo/server/admin.mjs --set-password' });
      // (v196) no name: the site's owner; a name: one of the accounts made on this page
      const u = user ? (USER_RE.test(user) ? checkUser(user, b.password) : null) : null;
      if (user ? !u : !checkPass(b.password)) { const now = Date.now(); fails.set(ip, [...(fails.get(ip) || []), now]); allFails.push(now); log('wrong password from', ip, user ? `(${user})` : '(owner)'); await new Promise(r => setTimeout(r, 600)); return send(res, 401, { error: user ? 'wrong name or password' : 'wrong password' }); }
      fails.delete(ip);
      startSession(req, res, user, !!b.keep, ip); log(user ? `${user} logged in from` : 'the owner logged in from', ip, b.keep ? '(kept)' : '');
      return send(res, 200, { ok: true, role: user ? 'admin' : 'owner', user: user || 'owner' });
    }
    // (v239) a visitor makes his own account: watching as guests may (the owner gives more on the admin page), his map
    // settings kept in it; logged in at once
    if (what === 'signup' && req.method === 'POST') {
      const b = await bodyOf(req), r = signup(b, ip);
      if (!r.ok) { if (r.wait) await new Promise(ok => setTimeout(ok, 400)); return send(res, r.code || 400, { error: r.msg }); }
      startSession(req, res, r.name, !!b.keep, ip); log(`${r.name} signed up from`, ip);
      return send(res, 200, { ok: true, role: 'admin', user: r.name });
    }
    const s = sessionOf(req);
    if (what === 'me') {
      const G = guests();
      if (!s) return send(res, 200, { in: false, password: !!readPass(), round: false, rights: G, gated: gateNeeded(G), open: openPlaces(G), signup: signupOpen() });
      const R = rightsOfS(s), adm = admOk(s), cards = Object.keys(R.cards);
      return send(res, 200, { in: true, password: !!readPass(), user: R.owner ? 'owner' : s.user, role: R.owner ? 'owner' : 'admin', owner: R.owner, keep: !!s.keep, adm,
        rights: R.site, admin: R.admin, round: R.admin && adm, servers: R.servers, cards, page: adm && (R.owner || cards.length > 0), pageCards: R.owner || cards.length > 0, gated: gateNeeded(G), open: openPlaces(R.site), signup: signupOpen(), self: !R.owner && !!userOf(s.user)?.self });
    }
    if (what === 'round-ref' && req.method === 'GET') {   // (v224: a round from a link, without the list)
      const R = s ? rightsOfS(s).site : guests(); if (!R.view) return send(res, s ? 403 : 401, { error: 'may not watch rounds' });
      return send(res, 200, roundRef(url.searchParams.get('name')) || { ok: false, msg: 'no rounds' });
    }
    if (!s) return send(res, 401, { error: 'log in first' });
    if (what === 'logout' && req.method === 'POST') { sessions.delete(s.h); sessSave(); setCookie(req, res, 'x'.repeat(20), 0); return send(res, 200, { ok: true }); }
    // (v239) his own: settings, password, account - any login, no admin powers needed
    if (what === 'prefs' && req.method === 'GET') return send(res, 200, prefsGet(s));
    if (what === 'prefs' && req.method === 'POST') { const r = prefsSet(await bodyOf(req), s); return send(res, r.ok ? 200 : 400, r); }
    if (what === 'my-password' && req.method === 'POST') { const r = myPassword(await bodyOf(req), s, req); return send(res, r.ok ? 200 : r.code || 400, r); }
    if (what === 'my-delete' && req.method === 'POST') { const r = myDelete(await bodyOf(req), s); if (r.ok) setCookie(req, res, 'x'.repeat(20), 0); return send(res, r.ok ? 200 : r.code || 400, r); }
    const R = rightsOfS(s), own = R.owner;
    // (v196) the Admin tab: the admins' part of the page, the analysis's private files, a round's server side, the review
    // (v224: the accounts with the Admin tab among their rights, while their admin powers last)
    const tab = (what === 'admin.js' || what === 'round') && req.method === 'GET' || what.startsWith('data/') && req.method === 'GET' || req.method === 'POST' && ['review-get', 'review-mark', 'review-note', 'trusted'].includes(what)
      || what === 'hints-mine' || what === 'hints-site' && req.method === 'POST'   // (v227: the hints' thresholds)
      || (what === 'statq-meta' || what === 'statq-nicks') && req.method === 'GET' || what === 'statq' && req.method === 'POST'   // (v244)
      || what === 'choices' && req.method === 'GET' || what === 'choices-run' && req.method === 'POST';   // (v250)
    if (tab) {
      if (!R.admin) return send(res, 403, { error: 'this account has no Admin tab' });
      if (!admOk(s)) return send(res, 401, AGAIN);
      admTouch(s);
      if (what === 'admin.js') return sendFile(res, path.join(HERE, 'admin-round.js'), 'text/javascript; charset=utf-8');
      if (what.startsWith('data/')) { const rel = what.slice(5); if (!/^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)?\.json$/.test(rel) || rel.includes('..') || rel === HT_MINE_FILE) return send(res, 404, { error: 'not found' });
        if (rel === 'choices.json' && !own) return send(res, 403, { error: "every server's flag choices: the owner's (yours: Flag choices)" });   // (v250)
        return sendFile(res, path.join(DATA, '.admin', rel), 'application/json; charset=utf-8'); }
      if (what === 'choices') return send(res, 200, choicesFor(s, R));   // (v250)
      if (what === 'round') return send(res, 200, roundInfo(url.searchParams.get('name'), s));   // (v197)
      if (what.startsWith('statq')) {   // (v244) the statistics: a server's admin sees his servers' rounds only
        const okSrv = n => own || srvOk(s, n), S = await statq().get();
        if (what === 'statq-meta') return send(res, 200, { ok: true, ...statqMeta(S, okSrv), state: statq().state() });
        if (what === 'statq-nicks') return send(res, 200, { ok: true, nicks: statqNicks(S, url.searchParams.get('q'), okSrv) });
        const b = await bodyOf(req); let r;
        try { r = statqAsk(S, b || {}, okSrv); } catch (e) { log('statq:', e.message); r = { ok: false, msg: 'that question went wrong: ' + e.message }; }
        return send(res, 200, r);
      }
      if (what === 'hints-mine' && req.method === 'GET') return send(res, 200, htMineGet(s));   // (v227)
      if (what === 'hints-mine' && req.method !== 'POST') return send(res, 405, { error: 'method' });
      const b = await bodyOf(req);   // (v198)
      if (what === 'hints-mine') return send(res, 200, htMineSave(b, s));
      if (what === 'hints-site') return R.owner || R.cards.hints ? send(res, 200, htSiteSave(b, s)) : send(res, 403, { ok: false, msg: "the site's thresholds: the owner's, or an account's with that right", error: 'not for this account' });
      if (what === 'choices-run') return send(res, 200, choicesRun(s, R));   // (v250)
      return send(res, 200, what === 'review-get' ? revGet(b, s) : what === 'review-mark' ? revMark(b, s) : what === 'review-note' ? revNote(b, s) : revTrusted(b, s));
    }
    // this page: the owner's - or (v224) an account's cards
    if (!own && !Object.keys(R.cards).length) return send(res, 403, { error: 'this account has no part of the admin page', round: R.admin });
    if (!admOk(s)) return send(res, 401, AGAIN);
    admTouch(s);
    const no = (msg = 'not for this account') => send(res, 403, { ok: false, msg, error: msg }), card = k => own || !!R.cards[k];
    const srv = n => own || srvOk(s, String(n || ''));
    if (what === 'state' && req.method === 'GET') { const S = await state(own ? null : R.cards); if (S.notify) S.notify = notifyFor(S.notify, s); S.me = { user: own ? 'owner' : s.user, owner: own, cards: own ? ACC_CARDS.map(([k]) => k) : Object.keys(R.cards), servers: R.servers }; return send(res, 200, S); }
    if (what === 'log' && req.method === 'GET') return card('log') ? send(res, 200, await journal(url.searchParams.get('unit') || 'all', +url.searchParams.get('n'))) : no();
    if (what === 'analysis-file' && (req.method === 'GET' || req.method === 'HEAD')) return card('analysis') ? sendArchive(req, res, url.searchParams.get('name')) : no();
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = await bodyOf(req);
    if (what === 'start') { const u = String(b.unit); return card('services') || (u === 'ingest' && (card('demos') || card('decode'))) ? send(res, 200, await startUnit(u)) : no(); }
    if (what === 'records-again') return card('rounds') ? send(res, 200, await recordsAgain()) : no();   // (v206)
    if (what === 'stop') return card('decode') || card('services') ? send(res, 200, await stopUnit(String(b.unit))) : no();
    if (what === 'retry-bad') return card('decode') ? send(res, 200, retryBad()) : no();
    if (['source-add', 'source-remove', 'source-every', 'probe', 'fetch-list'].includes(what) && !card('sources')) return no();
    if (what === 'source-add') return send(res, 200, addSource(b.url));
    if (what === 'source-remove') return send(res, 200, removeSource(String(b.url || '')));
    if (what === 'source-every') return send(res, 200, sourceEvery(b));   // (v210)
    if (what === 'probe') { const a = String(b.url || '').trim(); if (a && !SOURCE_RE.test(a)) return send(res, 200, { ok: false, out: 'not an address' }); return send(res, 200, await fetchLook(a ? ['--probe', a] : ['--probe'], 60e3)); }
    if (what === 'fetch-list') return send(res, 200, await fetchLook(['--list'], 180e3));
    // (v224) the posts: a server of his (the owner: any; what is shared by all servers - the bot, the templates, the
    // fewest players for all, one post on all servers - the owner's only)
    if (['notify-set', 'notify-test', 'notify-last', 'notify-preview', 'alert-test', 'digest-preview', 'digest-post'].includes(what)) {
      if (!card('posts')) return no();
      if (!own && (b.server === undefined || b.server === null || b.server === '')) return no("the posts' shared settings are the site owner's");
      if (b.server !== undefined && b.server !== null && b.server !== '' && !srv(b.server)) return no('not one of the servers of your account');
    }
    if (what === 'notify-set') return send(res, 200, notifySet(b));
    if (['jobs-set'].includes(what) && !card('decode')) return no();
    if (what === 'jobs-set') return send(res, 200, jobsSet(b));
    if (['demos-set', 'demos-preview', 'demos-keep', 'copies-delete'].includes(what) && !card('demos')) return no();
    if (what === 'demos-set') return send(res, 200, demosSet(b));
    if (what === 'demos-preview') return send(res, 200, demosPreview(b));
    if (what === 'demos-keep') return send(res, 200, demosKeep(b));
    if (what === 'copies-delete') return send(res, 200, copiesDelete());
    if (what === 'analysis') return card('analysis') ? send(res, 200, await analysisAct(b)) : no();
    if (['user-set', 'user-remove', 'access-set'].includes(what) && !own) return no("the accounts and the site's access are the owner's");
    if (what === 'user-set') return send(res, 200, userSet(b));
    if (what === 'user-remove') return send(res, 200, userRemove(b));
    if (what === 'access-set') return send(res, 200, accessSet(b));   // (v224)
    if (what === 'notify-test') return send(res, 200, b.server && !knownServer(String(b.server)) ? { ok: false, msg: 'no such server' } : await notifyRun('--test', b.server));
    if (what === 'alert-test') {   // (v214) a test post to a server's admin channel
      if (!b.server || !knownServer(String(b.server))) return send(res, 200, { ok: false, msg: 'no such server' });
      const r = await run(NODE, [path.join(HERE, 'alerts.mjs'), '--test', String(b.server)], { timeout: 60e3 }), out = (r.out + (r.err ? '\n' + r.err : '')).trim();
      return send(res, 200, { ok: r.code === 0, msg: out.split('\n').pop() || (r.code === 0 ? 'sent' : 'failed') });
    }
    if (what === 'notify-preview') return send(res, 200, notifyPreview(b));
    if (what === 'digest-preview') { const k = String(b.kind || ''), n = String(b.server || ''); if (!DIGEST_KINDS.includes(k) || !knownServer(n)) return send(res, 200, { ok: false, msg: 'which server and summary?' }); try { const c = notifySettings().servers[n]; return send(res, 200, digestTexts(n, k, Date.now(), b.format && typeof b.format === 'object' ? { ...(c?.digestFmt || {}), ...b.format } : undefined)); } catch (e) { return send(res, 200, { ok: false, msg: e.message }); } }   // (v220: the editor's, saved or not)
    if (what === 'digest-post') { const k = String(b.kind || ''), n = String(b.server || ''); if (!DIGEST_KINDS.includes(k) || !knownServer(n)) return send(res, 200, { ok: false, msg: 'which server and summary?' }); const r = await run(NODE, [path.join(HERE, 'digest.mjs'), '--post', k, n], { timeout: 120e3 }); const out = (r.out + (r.err ? '\n' + r.err : '')).trim(); return send(res, 200, { ok: r.code === 0, msg: out.split('\n').pop() || (r.code === 0 ? 'posted' : 'failed') }); }
    if (what === 'notify-last') return send(res, 200, b.server && !knownServer(String(b.server)) ? { ok: false, msg: 'no such server' } : await notifyRun('--last', b.server));
    return send(res, 404, { error: 'not found' });
  } catch (e) { log('error:', e.stack || e.message); try { send(res, 500, { error: e.message }); } catch (e2) {} }
});

if (process.argv.includes('--set-password')) await setPassword();
else {
  sessLoad(); syncGate();   // (v224: the logins kept over a restart; the web server's gate as the guests' rights say)
  server.listen(PORT, HOST, () => log(`admin page on http://${HOST}:${PORT}/admin${readPass() ? '' : ' (no password set yet: sudo node ' + path.join(HERE, 'admin.mjs') + ' --set-password)'}${fs.existsSync(GATE_F) ? ' · the site closed to guests in part (data/.access-gate)' : ''}`));
  const bye = () => { if (sessDirty) sessSave(); process.exit(0); };
  process.on('SIGTERM', bye); process.on('SIGINT', bye);
  // a new version of this file (after a site update): exit, and systemd starts the new one (Restart=always)
  const me = new URL(import.meta.url).pathname, mine = [me, path.join(HERE, 'access.mjs')], mtOf = f => { try { return fs.statSync(f).mtimeMs; } catch (e) { return 0; } }, mt = mine.map(mtOf).join();
  setInterval(() => { const m = mine.map(mtOf).join(); if (m !== mt && !m.split(',').includes('0')) { log('admin.mjs changed: restarting'); bye(); } }, 30e3).unref();
  setInterval(() => { syncGate(); }, 60e3).unref();   // (data/.access.json put back by hand, or the flag removed: as it should be within a minute)
}
