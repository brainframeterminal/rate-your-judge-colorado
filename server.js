// Rate Your Judge Colorado — server (Node 24: node:http; PostgreSQL via `pg` in production, node:sqlite for local runs).
// Anonymous, phone-first ratings of judges / prosecutors in Colorado.
//
// Trust model (hardened after the 2026-10-12 audit):
//  • Two listeners. PUBLIC (PORT) serves the site and the public API; MODERATOR (MOD_PORT, private-network only) is the only place
//    that serves /mod.html and /api/mod/* and the only place the identity header is trusted.
//  • Devices are identified by SERVER-ISSUED, HMAC-signed tokens (issuing is rate-limited); a client cannot mint its own.
//  • Rate limits are keyed on the client network prefix taken from the trusted proxy hop, not on spoofable headers.
//  • Stored: ratings, role, outcome, a yes/no "near the courthouse" flag, hour-rounded time, the device token (unlinked from
//    the rating after RETENTION_DAYS). Never stored: name, email, IP address, coordinates, audio.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { openDb } from './db.js';
import { totpAt, scrypt } from './modauth.js';
import { spawn, execFile } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { screen, SCREEN_MESSAGES } from './screen.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const num = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : d);
const PORT = num('PORT', 8750), MOD_PORT = num('MOD_PORT', 0);                 // MOD_PORT=0 → no moderator listener
const TRUST_PROXY = num('TRUST_PROXY', 1);                                       // proxy hops in front of us (one reverse proxy = 1)
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);   // empty = any Host
const PUBLISH_MODE = process.env.PUBLISH_MODE || 'peer';                         // 'peer' = 2 confirmations publish · 'mod' = a human moderator must approve · 'visible' = shown at once as 'not reviewed yet', a moderator approves or removes later
const VOTE_MIN_AGE_H = num('VOTE_MIN_AGE_H', 0);                                 // production: 24 — only devices with an older rating may confirm/report
const MIN_N = num('MIN_PUBLIC_N', 5);
const APPEALS_ON_DEMO = process.env.JUDEX_APPEALS_DEMO === '1';                    // QA only: the pilot's fictional people never get an appeals record in production                                            // no score is shown until this many ratings
const REPEAT_DAYS = num('REPEAT_DAYS', 30), SESSION_PER_DAY = num('SESSION_PER_DAY', 60);                                      // same device may rate the same official once per this many days
const RETENTION_DAYS = num('RETENTION_DAYS', 30);
const SEED_DEMO = process.env.SEED_DEMO !== '0';
const CAPTCHA = process.env.CAPTCHA === '1';                                       // self-hosted ALTCHA-style proof-of-work on every submission (no third party)
const PRESENCE_FEET = 1000, PRESENCE_METERS = PRESENCE_FEET * 0.3048;
const CONFIRMS_TO_PUBLISH = 2;
const SECRET = process.env.JUDEX_SECRET || fs.readFileSync(path.join(ROOT, 'data', 'secret.txt'), 'utf8').trim();
const MAIL_USER = process.env.MAIL_USER || '', MAIL_PASS = process.env.MAIL_PASS || '', MAIL_TO = process.env.MAIL_TO || MAIL_USER;   // our own Migadu mailbox; unset = no e-mail
const MAIL_HOST = process.env.MAIL_HOST || 'smtp.migadu.com';
const MOD_TOKEN = process.env.JUDEX_MOD_TOKEN || '';
const ROLES = ['party', 'observer', 'juror', 'attorney'];
const APPELLATE_ROLES = ['observer', 'attorney'];
let offCache = null;   // /api/search: officials in memory for accent-free matching (60 s)
const fold = s => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const NAME_NOISE = new Set(['judge', 'justice', 'hon', 'honorable', 'the', 'da', 'deputy', 'district', 'attorney', 'jr', 'sr', 'ii', 'iii', 'iv', 'chief', 'magistrate']);   // words people type around a name   // no juries or witnesses at the Supreme Court / Court of Appeals; parties rarely speak — only lawyers and the public see the bench
const benchRank = t => ['Chief Justice', 'Justice', 'Chief Judge', 'Judge'].findIndex(p => String(t || '').startsWith(p + ',')) + 1 || 9;
const TYPES = ['judge', 'prosecutor'];
const METRICS = ['q1', 'q2', 'q3', 'q4', 'q5'];                 // meaning depends on the official's type — wording lives in the client
const OUTCOMES = ['won', 'lost', 'mixed', 'watching'];
const SUBROLES = ['defendant', 'plaintiff', 'victim', 'witness', 'family', 'other'];
const HOUR = 3600e3, DAY = 86400e3;

const courts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'courts.json'), 'utf8'));
const courtById = new Map(courts.map(c => [c.id, c]));

const db = await openDb({ url: process.env.DATABASE_URL, file: process.env.JUDEX_DB || path.join(ROOT, 'data', 'judex.db') });
const ID = db.idCol, BI = db.bigint;
await db.exec(`
${db.pragma}
CREATE TABLE IF NOT EXISTS officials (id ${ID}, court_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS reviews (
  id ${ID}, official_id ${BI} NOT NULL, role TEXT NOT NULL,
  q1 INTEGER, q2 INTEGER, q3 INTEGER, q4 INTEGER, q5 INTEGER, overall INTEGER NOT NULL,   -- NULL = "I didn't see this"
  outcome TEXT NOT NULL DEFAULT '',
  subrole TEXT NOT NULL DEFAULT '', x1 INTEGER, x2 INTEGER,          -- victim/witness extras (prosecutors only)
  present INTEGER NOT NULL, device TEXT NOT NULL, ipk TEXT NOT NULL DEFAULT '', day TEXT NOT NULL,
  comment TEXT, status TEXT NOT NULL DEFAULT 'none', created_at ${BI} NOT NULL, mod_decided INTEGER NOT NULL DEFAULT 0,
  UNIQUE (official_id, device, day));
CREATE TABLE IF NOT EXISTS votes (review_id ${BI} NOT NULL, device TEXT NOT NULL, vote INTEGER NOT NULL, created_at ${BI} NOT NULL, PRIMARY KEY (review_id, device));
CREATE TABLE IF NOT EXISTS mod_log (id ${ID}, review_id ${BI} NOT NULL, action TEXT NOT NULL, note TEXT, mod TEXT NOT NULL, created_at ${BI} NOT NULL);
CREATE TABLE IF NOT EXISTS mod_actions (id ${ID}, at ${BI} NOT NULL, mod TEXT NOT NULL, kind TEXT NOT NULL, target ${BI}, from_status TEXT, to_status TEXT, note TEXT);   -- full audit trail of every moderator action
CREATE TABLE IF NOT EXISTS suggestions (id ${ID}, created_at ${BI} NOT NULL, court_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, note TEXT, device TEXT, status TEXT NOT NULL DEFAULT 'pending', decided_by TEXT, decided_at ${BI}, official_id ${BI});
CREATE TABLE IF NOT EXISTS feedback (id ${ID}, created_at ${BI} NOT NULL, page TEXT, lang TEXT, ease INTEGER, parts TEXT, questions TEXT, text TEXT, device TEXT);
CREATE TABLE IF NOT EXISTS reports (review_id ${BI} NOT NULL, device TEXT NOT NULL, reason TEXT, created_at ${BI} NOT NULL, PRIMARY KEY (review_id, device));
CREATE TABLE IF NOT EXISTS join_requests (id ${ID}, created_at ${BI} NOT NULL, interests TEXT, contact TEXT, message TEXT, lang TEXT);
CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, created_at ${BI} NOT NULL);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS mods (id ${ID}, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, pw_salt TEXT NOT NULL, pw_hash TEXT NOT NULL, totp TEXT NOT NULL, ver INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1, created_at ${BI} NOT NULL, last_login ${BI});
CREATE TABLE IF NOT EXISTS opinions (id ${ID}, official_id ${BI} NOT NULL, case_name TEXT NOT NULL, citation TEXT NOT NULL, decided TEXT NOT NULL, outcome TEXT NOT NULL, url TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', checked TEXT NOT NULL DEFAULT '');   -- Court of Appeals decisions an appellate judge WROTE (tools/appeals/authors.py → tools/opinions-import.mjs)
CREATE TABLE IF NOT EXISTS appeals (id ${ID}, official_id ${BI} NOT NULL, court TEXT NOT NULL, case_name TEXT NOT NULL, citation TEXT NOT NULL, decided TEXT NOT NULL, outcome TEXT NOT NULL, url TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', checked TEXT NOT NULL DEFAULT '');   -- appellate decisions on a trial judge's rulings: public record, each one verified against the opinion (tools/appeals-import.mjs)
CREATE INDEX IF NOT EXISTS idx_rev_off ON reviews (official_id);
CREATE INDEX IF NOT EXISTS idx_rev_dev ON reviews (device);
`);

try { await db.exec("ALTER TABLE officials ADD COLUMN scope TEXT NOT NULL DEFAULT 'court'"); } catch {}
// "What people ask". pub: '' = shown, not reviewed yet ·
// 'published' = a moderator read it · 'held' = the screen found a possible private name/threat, hidden until a moderator decides · 'hidden' = removed
for (const col of ["share INTEGER NOT NULL DEFAULT 0", "pub TEXT NOT NULL DEFAULT ''", "pub_by TEXT NOT NULL DEFAULT ''", `pub_at ${BI}`]) { try { await db.exec(`ALTER TABLE feedback ADD COLUMN ${col}`); } catch {} }
await db.exec(`CREATE TABLE IF NOT EXISTS feedback_votes (feedback_id ${BI} NOT NULL, device TEXT NOT NULL, vote INTEGER NOT NULL, created_at ${BI} NOT NULL, PRIMARY KEY (feedback_id, device))`);
for (const col of ["source TEXT NOT NULL DEFAULT ''", "checked TEXT NOT NULL DEFAULT ''", "title TEXT NOT NULL DEFAULT ''"]) { try { await db.exec(`ALTER TABLE officials ADD COLUMN ${col}`); } catch {} }   // where a real name came from, and when it was checked (tools/roster-import.mjs)   // 'district' = listed at every courthouse of the judicial district (elected DA, district-wide judges)
// ---- demo roster: INVENTED names for prototype testing (SEED_DEMO=0 in production) --------------------
const FIRST = ['Marcus','Elena','Thomas','Priya','Daniel','Grace','Victor','Naomi','Samuel','Lucia','Henry','Aisha','Peter','Carmen','Walter','Julia','Omar','Rebecca','Isaac','Teresa'];
const LAST = ['Hartwell','Okafor','Delgado','Lindqvist','Brennan','Sato','Whitlock','Moreau','Castellan','Ferris','Novak','Abernathy','Quill','Ramos','Thornbury','Kessler','Bellamy','Ortega','Pemberton','Valdez'];
if (SEED_DEMO && (await db.prepare('SELECT COUNT(*) n FROM officials').get()).n === 0) {
  const ins = db.prepare('INSERT INTO officials (court_id, type, name, demo) VALUES (?,?,?,1)');
  const plan = { judge: ['Judge', 2], prosecutor: ['Deputy DA', 1] };
  let i = 0;
  for (const c of courts) for (const [t, [title, n]] of Object.entries(plan)) { if (c.kind === 'appellate' && t === 'prosecutor') continue; for (let k = 0; k < n; k++, i++)
    await ins.run(c.id, t, `${title} ${FIRST[(i * 7 + 3) % 20]} ${LAST[(i * 11 + 5) % 20]}`); }
}
if (SEED_DEMO && !await db.prepare("SELECT 1 FROM meta WHERE k='demo_seeded'").get()) {   // featured demo profiles: a judge (id 1) and a prosecutor (id 3) get a believable fictional history
  const ins = db.prepare(`INSERT INTO reviews (official_id, role, q1, q2, q3, q4, q5, overall, outcome, present, device, ipk, day, comment, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  let seedN = 0;
  const hex = n => 'seed' + n.toString(16).padStart(28, '0');
  const add = async (off, role, v, present, comment, status, daysAgo) => {
    const d = new Date(Date.now() - daysAgo * DAY);
    const six = v.length === 5 ? [v[0], v[1], v[2], v[3], Math.round((v[0] + v[2]) / 2), v[4]] : v;
    const outcome = role === 'observer' || role === 'juror' ? 'watching' : (seedN % 3 === 0 ? 'lost' : seedN % 3 === 1 ? 'won' : 'mixed');
    await ins.run(off, role, six[0], six[1], six[2], six[3], six[4], six[5], outcome, present, hex(++seedN), '', d.toISOString().slice(0, 10), comment || '', comment ? status : 'none', d.getTime());
  };
  const judge = [['party',[4,4,3,5,4]],['party',[3,3,2,4,3]],['party',[5,5,4,5,5]],['party',[2,3,2,3,2]],['observer',[5,5,4,5,5]],['observer',[4,5,4,5,5]],['observer',[4,4,3,4,4]],['observer',[5,4,4,5,4]],
    ['juror',[5,5,5,5,5]],['juror',[4,5,4,5,5]],['juror',[5,4,4,5,4]],['juror',[4,4,5,5,5]],['attorney',[5,4,3,4,4]],['attorney',[4,4,3,5,4]],['attorney',[5,5,4,5,5]],['attorney',[4,3,3,4,3]],['party',[4,5,4,5,4]],['observer',[5,5,5,5,5]],['juror',[4,4,4,4,4]],['attorney',[5,4,4,4,4]]];
  for (const [i, [r, v]] of judge.entries()) await add(1, r, v, i % 4 ? 1 : 0, '', '', 3 + i * 2);
  await add(1, 'juror', [5,5,5,5,5], 1, 'Explained every step to us in plain language and kept the trial moving.', 'published', 12);
  await add(1, 'attorney', [5,4,4,5,5], 1, 'Always prepared, rules quickly, treats both sides the same.', 'published', 20);
  await add(1, 'party', [3,3,2,4,3], 1, 'Hearing started 40 minutes late and nobody told us why.', 'pending', 1);
  const pros = [['party',[3,3,3,3,3]],['party',[2,2,3,3,2]],['observer',[4,4,4,4,4]],['observer',[3,4,3,4,4]],['juror',[4,4,4,5,4]],['juror',[5,4,4,5,5]],['attorney',[4,3,4,4,4]],['attorney',[5,4,4,5,5]],['attorney',[4,4,3,4,4]],['party',[3,3,4,3,3]],['observer',[4,4,4,5,4]],['juror',[4,5,4,4,4]],['party',[4,4,4,4,4]],['party',[3,4,3,4,4]],['party',[2,3,3,3,2]],['party',[5,4,4,5,5]]];
  for (const [i, [r, v]] of pros.entries()) await add(3, r, v, i % 3 ? 1 : 0, '', '', 2 + i * 3);
  const ups = db.prepare("UPDATE reviews SET subrole = ?, x1 = ?, x2 = ? WHERE id = ?");
  for (const [i, r] of (await db.prepare("SELECT id FROM reviews WHERE official_id = 3 AND role = 'party' ORDER BY id").all()).entries()) await ups.run(['victim', 'witness', 'defendant', 'victim'][i % 4], [4, 3, null, 5][i % 4], [4, 4, null, 3][i % 4], r.id);
  await add(3, 'juror', [5,4,4,5,5], 1, 'Presented the case clearly and was respectful to the defendant.', 'published', 9);
  await add(3, 'observer', [3,3,4,4,3], 1, 'Well prepared, but spoke over the defense attorney twice.', 'pending', 2);
  let rnd = 12345; const rand = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;      // fictional ratings over many courts so the district map has something to show
  const courtIds = courts.map(c => c.id);
  for (const o of await db.prepare("SELECT id, court_id FROM officials WHERE id NOT IN (1,3)").all()) {
    const ci = courtIds.indexOf(o.court_id); if (ci % 5 === 4) continue;
    const base = 2.6 + ((ci * 37) % 20) / 10, n = 3 + Math.floor(rand() * 9);
    for (let k = 0; k < n; k++) {
      const q = () => Math.max(1, Math.min(5, Math.round(base + (rand() - 0.5) * 2.4)));
      await add(o.id, ['party','observer','juror','attorney'][Math.floor(rand() * 4)], [q(), q(), q(), q(), q()], rand() < 0.7 ? 1 : 0, '', '', 1 + Math.floor(rand() * 60));
    }
  }
  await db.prepare("INSERT INTO meta VALUES ('demo_seeded', ?)").run(String(Date.now()));
}

// ---- helpers -----------------------------------------------------------------------------------
const today = () => new Date().toISOString().slice(0, 10);
const hourFloor = ms => Math.floor(ms / HOUR) * HOUR;                             // timestamps are rounded to the hour before they are stored
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, r = x => x * Math.PI / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
// client network = the address added by OUR trusted proxy (rightmost XFF entry for 1 hop), coarsened to a /24 (IPv4) or /64 (IPv6)
function netOf(req) {
  let ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (TRUST_PROXY > 0) { const p = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean); if (p.length >= TRUST_PROXY) ip = p[p.length - TRUST_PROXY].replace(/^::ffff:/, ''); }
  if (ip.includes(':')) return 'v6:' + ip.split(':').slice(0, 4).join(':');
  return 'v4:' + ip.split('.').slice(0, 3).join('.');
}
const hits = new Map();                                                           // key -> [timestamps]; swept every minute so it cannot grow without bound
function rateLimited(key, max, windowMs) {
  const now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) { const f = v.filter(t => now - t < DAY); if (f.length) hits.set(k, f); else hits.delete(k); } }, 60e3).unref();

const hmac = s => crypto.createHmac('sha256', SECRET).update(s).digest('hex').slice(0, 16);
const issueDevice = async () => { const id = crypto.randomBytes(8).toString('hex'); await db.prepare('INSERT INTO devices (id, created_at) VALUES (?,?)').run(id, hourFloor(Date.now())); return id + '.' + hmac('dev:' + id); };
const badDevice = res => json(res, 401, { error: 'Your session expired. Please try again.', code: 'device' });   // the page renews the token and retries once
function validDevice(d) {                                                          // only tokens WE signed are accepted
  d = String(d || ''); const m = d.match(/^([a-f0-9]{16})\.([a-f0-9]{16})$/);
  return !!m && crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(hmac('dev:' + m[1])));
}
// ---- e-mail notifications (feedback and "get involved" go to our own mailbox, which forwards to the owner). Plain SMTP through curl: no dependency. ----
function notify(subject, lines) {
  if (!MAIL_USER || !MAIL_PASS) return;
  const hdr = x => String(x).replace(/[\r\n]+/g, ' ').slice(0, 150);
  const msg = `From: Rate Your Judge Colorado <${MAIL_USER}>\r\nTo: ${MAIL_TO}\r\nSubject: ${hdr(subject)}\r\nDate: ${new Date().toUTCString()}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n` + lines.join('\n').replace(/\r?\n/g, '\r\n') + '\r\n';
  const p = spawn('curl', ['-sS', '--max-time', '20', '--ssl-reqd', '--url', `smtps://${MAIL_HOST}:465`, '--mail-from', MAIL_USER, '--mail-rcpt', MAIL_TO, '--user', `${MAIL_USER}:${MAIL_PASS}`, '-T', '-'], { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', d => { if (err.length < 300) err += d; });
  p.on('close', c => { if (c !== 0) console.error('mail failed', c, err.replace(MAIL_PASS, '***')); });
  p.on('error', e => console.error('mail error', e.message));
  p.stdin.on('error', () => {}); p.stdin.end(msg);
}
// ---- proof-of-work challenge (ALTCHA-compatible payload): the phone must find `number` with sha256(salt+number) == challenge ----
const sha256 = x => crypto.createHash('sha256').update(x).digest('hex');
const sig = c => crypto.createHmac('sha256', SECRET).update('altcha:' + c).digest('hex');
const usedChallenges = new Map();                                                  // challenge -> expiry; a solved puzzle works once
setInterval(() => { const now = Date.now(); for (const [k, v] of usedChallenges) if (v < now) usedChallenges.delete(k); }, 60e3).unref();
function makeChallenge(net) {
  const busy = (hits.get('rev:' + net) || []).length + (hits.get('sg:' + net) || []).length + (hits.get('fb:' + net) || []).length;
  const maxnumber = busy > 8 ? 400000 : busy > 3 ? 150000 : 50000;               // harder for a network that is already submitting a lot
  const salt = crypto.randomBytes(12).toString('hex') + '?expires=' + (Date.now() + 10 * 60e3), number = crypto.randomInt(0, maxnumber);
  const challenge = sha256(salt + number);
  return { algorithm: 'SHA-256', challenge, salt, maxnumber, signature: sig(challenge) };
}
function captchaOk(req) {
  if (!CAPTCHA) return true;
  try {
    const p = JSON.parse(Buffer.from(String(req.headers['x-captcha'] || ''), 'base64').toString('utf8'));
    const exp = Number(String(p.salt).split('?expires=')[1]);
    if (p.algorithm !== 'SHA-256' || !(exp > Date.now()) || usedChallenges.has(p.challenge)) return false;
    if (sha256(p.salt + Number(p.number)) !== p.challenge) return false;
    const a = Buffer.from(sig(p.challenge)), b = Buffer.from(String(p.signature));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    usedChallenges.set(p.challenge, exp); return true;
  } catch { return false; }
}
const deviceOf = (req, b) => String(req.headers['x-device'] || (b && b.device) || '');
const eligibleVoter = async device => !!await db.prepare('SELECT 1 FROM reviews WHERE device = ? AND created_at <= ? LIMIT 1').get(device, Date.now() - VOTE_MIN_AGE_H * HOUR);

function json(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });   // crawlers may READ the API to render pages (robots.txt allows the public reads) but never list it
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 20000) {
  return new Promise((resolve, reject) => {
    let b = '', done = false;
    const fail = e => { if (!done) { done = true; reject(e); } };
    req.on('data', d => { b += d; if (b.length > limit) { fail(new Error('too large')); req.destroy(); } });
    req.on('aborted', () => fail(new Error('aborted'))); req.on('error', fail); req.on('close', () => { if (!req.complete) fail(new Error('closed')); });
    req.on('end', () => { if (done) return; done = true; try { const v = b ? JSON.parse(b) : {}; (v && typeof v === 'object' && !Array.isArray(v)) ? resolve(v) : reject(new Error('bad body')); } catch (e) { reject(e); } });
  });
}
const idOf = v => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 && n < 2147483648 ? n : 0; };
const clean = s => (typeof s === 'string' || typeof s === 'number' ? String(s) : '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
const int15 = v => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);

// ---- statistics: nothing is shown for a group smaller than MIN_N (small groups can identify the rater) ----
async function aggregate(officialId) {
  const rows = await db.prepare('SELECT role, subrole, outcome, present, q1, q2, q3, q4, q5, overall FROM reviews WHERE official_id = ?').all(officialId);
  const blank = () => ({ n: 0, verified: 0, q1: 0, q2: 0, q3: 0, q4: 0, q5: 0, overall: 0, c: { q1: 0, q2: 0, q3: 0, q4: 0, q5: 0 } });
  const acc = { all: blank() }, out = {}, sub = {};
  const fold = (a, r) => { a.n++; a.verified += r.present ? 1 : 0; a.overall += r.overall; for (const m of METRICS) if (r[m] != null) { a[m] += r[m]; a.c[m]++; } };
  for (const r of rows) { fold(acc.all, r); fold(acc[r.role] || (acc[r.role] = blank()), r); if (r.outcome) fold(out[r.outcome] || (out[r.outcome] = blank()), r); if (r.role === 'party' && r.subrole) fold(sub[r.subrole] || (sub[r.subrole] = blank()), r); }
  const fin = a => {
    if (a.n < MIN_N) return { n: a.n, hidden: true };
    a.overall = Math.round(a.overall / a.n * 10) / 10; for (const m of METRICS) a[m] = a.c[m] ? Math.round(a[m] / a.c[m] * 10) / 10 : 0; delete a.c; return a;
  };
  for (const k of Object.keys(acc)) acc[k] = fin(acc[k]);
  for (const k of Object.keys(out)) out[k] = fin(out[k]);
  for (const k of Object.keys(sub)) sub[k] = fin(sub[k]);   // people in the case, split by their part: shown side by side, never merged (victims and defendants rate differently)
  acc.min = MIN_N; acc.outcome = out; acc.sub = sub;
  const ex = await db.prepare("SELECT COUNT(*) n, AVG(x1) x1, AVG(x2) x2, COUNT(x1) c1, COUNT(x2) c2 FROM reviews WHERE official_id = ? AND subrole IN ('victim','witness') AND (x1 IS NOT NULL OR x2 IS NOT NULL)").get(officialId);
  acc.extras = ex.n >= MIN_N ? { n: ex.n, x1: ex.c1 ? Math.round(ex.x1 * 10) / 10 : 0, x2: ex.c2 ? Math.round(ex.x2 * 10) / 10 : 0 } : null;   // shown separately, never merged into the main score
  return acc;
}
let topAppeals = null;   // /api/appeals/top cache (10 min; the record changes weekly)
const APPEAL_OUTCOMES = ['affirmed', 'affirmed_in_part', 'reversed', 'vacated', 'disapproved', 'remanded', 'dismissed'];   // disapproved: a prosecution appeal (§16-12-102) — the ruling was wrong, the verdict stands
// ---- our own copies of the court documents we link to
// built by tools/archive/build.py, uploaded by tools/archive/sync.sh; outside the app tree so a deploy never touches it
const ARCHIVE = (process.env.JUDEX_ARCHIVE || path.join(ROOT, 'data', 'archive')) + path.sep;
let copies = new Map(), copiesAt = 0;
function loadCopies() {
  copiesAt = Date.now();
  try { copies = new Map(JSON.parse(fs.readFileSync(ARCHIVE + 'manifest.json', 'utf8')).map(x => [x.url, `/archive/${x.dir}/${x.name}`])); } catch { copies = new Map(); }
}
const copyOf = u => { if (Date.now() - copiesAt > HOUR) loadCopies(); if (!u) return null; const [base, frag] = String(u).split('#'); const c = copies.get(base); return c ? c + (frag ? '#' + frag : '') : null; };
const surnameOf = n => clean(n).replace(/^(Judge|Justice|Magistrate|Deputy DA|Deputy District Attorney|District Attorney)\s+/i, '').replace(/,?\s+(Jr\.?|Sr\.?|II|III|IV|V)\s*$/i, '').trim().split(/\s+/).pop().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
async function sameSurnameAt(courtId, name) {
  const s = surnameOf(name); if (!s || s.length < 2) return [];
  return (await db.prepare('SELECT id, name, type FROM officials WHERE demo = 0 AND court_id = ?').all(courtId)).filter(o => surnameOf(o.name) === s).map(o => ({ id: Number(o.id), name: o.name, type: o.type }));
}
async function appealsOf(o) {   // a list of decided appeals with citations, never a reversal RATE: there is no public count of every case a judge heard
  if (o.demo && !APPEALS_ON_DEMO) return null;
  const items = (await db.prepare('SELECT court, case_name, citation, decided, outcome, url, note FROM appeals WHERE official_id = ? ORDER BY decided DESC').all(o.id)).filter(a => APPEAL_OUTCOMES.includes(a.outcome)).map(a => ({ ...a, copy: copyOf(a.url) }));
  if (!items.length) return null;
  const counts = {}; for (const a of items) counts[a.outcome] = (counts[a.outcome] || 0) + 1;
  return { counts, items };
}
async function opinionsOf(o) {   // an appellate judge's own written decisions: what the panel did with the trial court's ruling (a list + counts, never a rate)
  const items = (await db.prepare('SELECT case_name, citation, decided, outcome, url, published, note FROM opinions WHERE official_id = ? ORDER BY decided DESC').all(o.id)).filter(a => APPEAL_OUTCOMES.includes(a.outcome)).map(a => ({ ...a, copy: copyOf(a.url) }));
  if (!items.length) return null;
  const counts = {}; for (const a of items) counts[a.outcome] = (counts[a.outcome] || 0) + 1;
  return { counts, items, published: items.filter(a => a.published).length };
}
async function trend(officialId, total) {   // weekly average of the overall rating, last 8 weeks (only once the score itself is public)
  if (total < MIN_N) return [];
  const WEEK = 7 * DAY, now = Date.now(), out = [];
  const rows = await db.prepare('SELECT overall, created_at FROM reviews WHERE official_id = ? AND created_at > ?').all(officialId, now - 8 * WEEK);
  for (let w = 7; w >= 0; w--) {
    const lo = now - (w + 1) * WEEK, hi = now - w * WEEK, xs = rows.filter(r => r.created_at > lo && r.created_at <= hi);
    out.push({ n: xs.length, avg: xs.length ? Math.round(xs.reduce((a, r) => a + r.overall, 0) / xs.length * 10) / 10 : null });
  }
  return out;
}
async function publicComments(officialId, device) {
  const me = validDevice(device) ? device : '';
  const eligible = PUBLISH_MODE === 'peer' && !!me && await eligibleVoter(me);
  // every rating, newest first, each with who left it and that person's own answers; a comment's TEXT keeps its own rules
  return (await db.prepare(`SELECT id, role, subrole, overall, q1, q2, q3, q4, q5, comment, created_at, status, device,
      (SELECT COUNT(*) FROM votes v WHERE v.review_id = r.id AND v.vote = 1) AS up,
      (SELECT COUNT(*) FROM votes v WHERE v.review_id = r.id AND v.vote = -1) AS down,
      (SELECT vote FROM votes v WHERE v.review_id = r.id AND v.device = ?) AS myvote
    FROM reviews r WHERE official_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`).all(me || '-', officialId))
    .map(r => (r.comment && (r.status === 'held' || r.status === 'rejected' || r.status === 'flagged') && !(me && r.device === me) ? { ...r, comment: null } : r))   // held/rejected text: only its author sees it
    .map(r => ({ id: Number(r.id), role: r.role, subrole: r.subrole || '', overall: r.overall == null ? null : Number(r.overall), q: [r.q1, r.q2, r.q3, r.q4, r.q5].map(v => v == null ? null : Number(v)),
      hasText: !!(r.comment && r.comment.trim()), status: r.status, up: r.up, down: r.down, at: Number(r.created_at),
      text: r.status === 'published' || (r.status === 'pending' && PUBLISH_MODE === 'visible') || (me && r.device === me) ? r.comment : null,
      pendingText: r.status === 'pending' && eligible && r.device !== me ? r.comment : null,       // 'mod' mode: nobody but the author sees unreviewed text
      mine: !!me && r.device === me,
      canVote: r.status === 'pending' && eligible && r.device !== me,
      myVote: r.myvote == null ? 0 : Number(r.myvote),
      canReact: !!me && r.device !== me && !!(r.comment && r.comment.trim()) && (r.status === 'published' || (r.status === 'pending' && PUBLISH_MODE === 'visible')) }));
}
async function refreshStatus(reviewId) {
  if (PUBLISH_MODE !== 'peer') return;                                              // in 'mod' mode only a human can publish
  const r = await db.prepare('SELECT status FROM reviews WHERE id = ?').get(reviewId);
  if (!r || r.status !== 'pending') return;                                         // flagged / rejected / published reviews are never changed by votes
  const v = await db.prepare('SELECT SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) up, SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) down FROM votes WHERE review_id = ?').get(reviewId);
  if ((v.up || 0) >= CONFIRMS_TO_PUBLISH && (v.up || 0) > (v.down || 0)) await db.prepare("UPDATE reviews SET status='published' WHERE id=?").run(reviewId);
}

// ---- moderators: personal accounts (password + one-time code), signed session cookie; only the MODERATOR listener honours them ----
const totpOk = (secret, code) => /^\d{6}$/.test(code) && [-1, 0, 1].some(d => { const a = Buffer.from(totpAt(secret, Date.now() + d * 30000)), b = Buffer.from(code); return crypto.timingSafeEqual(a, b); });
const SESSION_H = 12;
const MOD_2FA = process.env.JUDEX_MOD_2FA !== '0';                                  // pilot: set JUDEX_MOD_2FA=0 to sign in with email + password only; unset = code required
const sessSig = s => crypto.createHmac('sha256', SECRET).update('modsess:' + s).digest('hex').slice(0, 32);
const cookieOf = (req, k) => { const m = String(req.headers.cookie || '').split(/;\s*/).find(x => x.startsWith(k + '=')); return m ? m.slice(k.length + 1) : ''; };
const secureReq = req => String(req.headers['x-forwarded-proto'] || '') === 'https';
async function modName(req, isMod, net) {
  if (!isMod) return null;                                                          // the public listener never trusts moderator credentials
  const ck = (cookieOf(req, '__Host-modsess') || cookieOf(req, 'modsess')).split('.');                                      // id . expires . version . signature
  if (ck.length === 4 && Number(ck[1]) > Date.now() && sessSig(ck.slice(0, 3).join('.')) === ck[3]) {
    const m = await db.prepare('SELECT id, name, ver, active FROM mods WHERE id = ?').get(Number(ck[0]));
    if (m && m.active && String(m.ver) === ck[2]) return m.name;
  }
  const auth = String(req.headers.authorization || '');
  if (MOD_TOKEN && auth.startsWith('Bearer ')) {                                    // optional break-glass token for scripts (off unless JUDEX_MOD_TOKEN is set)
    if (rateLimited('modauth:' + net, 10, HOUR)) return null;
    const a = Buffer.from(auth.slice(7)), b = Buffer.from(MOD_TOKEN);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return 'Moderator';
  }
  return null;
}
const failedLogins = new Map();                                                     // email -> [timestamps]; 5 failures in 15 min lock that account for the window
async function modLogin(req, res, net) {
  if (rateLimited('modlogin:' + net, 15, HOUR)) return json(res, 429, { error: 'Too many attempts. Try again later.' });
  const b = await readBody(req, 2000), email = String(b.email || '').trim().toLowerCase().slice(0, 120), now = Date.now();
  const fkey = email + '|' + net, fails = (failedLogins.get(fkey) || []).filter(t => now - t < 15 * 60e3);
  if (fails.length >= 5) return json(res, 429, { error: 'This account is locked for 15 minutes after repeated failures.' });
  const m = await db.prepare('SELECT id, name, pw_salt, pw_hash, totp, ver, active FROM mods WHERE email = ?').get(email);
  const hash = await scrypt(String(b.password || '').slice(0, 200), m ? m.pw_salt : 'x'.repeat(32));   // same work whether or not the account exists
  const pass = !!m && !!m.active && hash.length === m.pw_hash.length && crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(m.pw_hash)) && (!MOD_2FA || totpOk(m.totp, String(b.code || '').trim()));
  if (!pass) { fails.push(now); failedLogins.set(fkey, fails); return json(res, 401, { error: 'Email, password or code is wrong.' }); }
  failedLogins.delete(fkey);
  await db.prepare('UPDATE mods SET last_login = ? WHERE id = ?').run(now, m.id);
  const body = `${m.id}.${now + SESSION_H * HOUR}.${m.ver}`;
  res.setHeader('set-cookie', `${secureReq(req) ? '__Host-modsess' : 'modsess'}=${body}.${sessSig(body)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_H * 3600}${secureReq(req) ? '; Secure' : ''}`);
  return json(res, 200, { ok: true, mod: m.name });
}
const audit = async (mod, kind, target, from, to, note) => await db.prepare('INSERT INTO mod_actions (at, mod, kind, target, from_status, to_status, note) VALUES (?,?,?,?,?,?,?)').run(Date.now(), mod, kind, target, from, to, note || '');
const officialLabel = async id => { const o = await db.prepare('SELECT name, court_id FROM officials WHERE id = ?').get(id); return o ? { name: o.name, court: courtById.get(o.court_id)?.name || '' } : { name: '?', court: '' }; };

// ---- voice → text: repo script (ffmpeg + whisper.cpp); private temp dir, process-group kill, bounded queue ----
const TMP_ROOT = path.join(os.tmpdir(), 'judex-stt');
fs.mkdirSync(TMP_ROOT, { recursive: true, mode: 0o700 });
for (const d of fs.readdirSync(TMP_ROOT)) fs.rmSync(path.join(TMP_ROOT, d), { recursive: true, force: true });   // leftovers from a crash
let sttChain = Promise.resolve(), sttWaiting = 0;
function transcribe(buf, ext) {
  if (sttWaiting >= 3) return Promise.resolve('busy');
  sttWaiting++;
  const run = () => new Promise(resolve => {
    const dir = fs.mkdtempSync(path.join(TMP_ROOT, 'j-')), f = path.join(dir, 'in.' + ext);
    fs.writeFileSync(f, buf, { mode: 0o600 });
    const p = spawn(path.join(ROOT, 'bin', 'transcribe.sh'), [f], { detached: true, env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:' + (process.env.PATH || '/usr/bin:/bin'), WHISPER_LANG: 'auto' } });
    let out = '', finished = false;
    const done = v => { if (finished) return; finished = true; clearTimeout(timer); fs.rm(dir, { recursive: true, force: true }, () => {}); resolve(v); };
    const timer = setTimeout(() => { try { process.kill(-p.pid, 'SIGKILL'); } catch {} done(null); }, 60000);   // kills ffmpeg and whisper too, not just the wrapper
    p.stdout.on('data', d => { if (out.length < 5000) out += d; });
    p.on('close', code => done(code === 0 ? out.trim() : null)); p.on('error', () => done(null));
  });
  const r = sttChain.then(run).finally(() => { sttWaiting--; }); sttChain = r.catch(() => {}); return r;       // one at a time
}
function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = []; let n = 0, done = false;
    const fail = e => { if (!done) { done = true; reject(e); } };
    req.on('data', d => { n += d.length; if (n > limit) { fail(new Error('too large')); req.destroy(); } else parts.push(d); });
    req.on('aborted', () => fail(new Error('aborted'))); req.on('error', fail);
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(parts)); } });
  });
}

// ---- profile text: invented only for DEMO officials; real officials show no biography at all ------------
const PROFILE = { judge: { office: 'Judge', unit: 'Division' }, prosecutor: { office: 'Prosecutor', unit: 'Unit' } };   // real roster: the elected DA (name says 'District Attorney'); deputies added by visitors
function profileFor(o) {
  const base = { title: PROFILE[o.type].office, unitLabel: PROFILE[o.type].unit };
  if (!o.demo) return base;
  const n = o.id, since = 2004 + (n * 7) % 18;
  return { ...base, since, focus: n % 3, room: `${1 + n % 6}${'ABC'[n % 3]}`, unitIdx: n % 4 };
}
const officialRow = async id => await db.prepare('SELECT id, court_id, type, name, demo, title, scope FROM officials WHERE id = ?').get(id);   // title: appellate only ("Justice, Colorado Supreme Court")
const ordEn = n => { const x = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (x[(v - 20) % 10] || x[v] || x[0]); };
const placeOf = o => { const c = courtById.get(o.court_id); return o.title ? o.title.replace(/^[^,]*,\s*/, '') : o.scope === 'district' ? `${ordEn(Number(c.district))} Judicial District` : c.name; };   // a district-wide official's court_id is just one county of the district
const profileTitle = o => `${o.name}, ${placeOf(o)}: ratings and reviews — Rate Your Judge Colorado`;   // public/app.js sets the same title
// ---- crawlable directory: /judges (every courthouse, by judicial district) and /judges/<court id> (everyone who works there) ----
// Plain HTML links to every profile, so a search engine reaches each judge from a page, not only from the sitemap.
const SITE = 'https://rateyourjudgecolorado.com';
const escH = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const surname = n => { const w = n.replace(/^(Judge|Justice|Chief Justice|Deputy DA|District Attorney)\s+/, '').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(x => !/^(Jr\.?|Sr\.?|II|III|IV)$/.test(x)); return (w.pop() || '') + ' ' + w.join(' '); };
async function directoryRows() {
  const rows = await db.prepare('SELECT o.id, o.name, o.type, o.court_id, o.scope, o.title, COUNT(r.id) AS n, AVG(r.overall) AS av, MAX(r.created_at) AS last FROM officials o LEFT JOIN reviews r ON r.official_id = o.id WHERE o.demo = 0 GROUP BY o.id, o.name, o.type, o.court_id, o.scope, o.title').all();
  return rows.map(r => ({ ...r, id: Number(r.id), n: Number(r.n), av: r.av == null ? null : Number(r.av), last: r.last ? Number(r.last) : 0, district: courtById.get(r.court_id)?.district }))
    .sort((a, b) => surname(a.name).localeCompare(surname(b.name)));
}
function courtPeople(c, rows) {   // the same people the rating tool lists for this courthouse
  if (c.kind === 'appellate') { const at = rows.filter(r => r.court_id === c.id); return [['Colorado Supreme Court', at.filter(r => /Supreme Court/.test(r.title || ''))], ['Colorado Court of Appeals', at.filter(r => /Court of Appeals/.test(r.title || ''))]]; }
  const here = r => r.court_id === c.id && r.scope !== 'district', wide = r => r.scope === 'district' && r.district === c.district;
  const da = rows.filter(r => r.type === 'prosecutor' && wide(r)).sort((a, b) => /^District Attorney/.test(b.name) - /^District Attorney/.test(a.name));
  return [['Judges at this courthouse', rows.filter(r => r.type === 'judge' && here(r))], [`Judges serving the whole ${ordEn(Number(c.district))} Judicial District`, rows.filter(r => r.type === 'judge' && wide(r))],
    ['Prosecutors', [...da, ...rows.filter(r => r.type === 'prosecutor' && here(r))]]];
}
const scoreLine = r => r.n >= MIN_N ? `★ ${r.av.toFixed(1)} from ${r.n} ratings` : r.n ? `${r.n} ${r.n === 1 ? 'rating' : 'ratings'} so far` : 'not rated yet';
function dirShell({ title, desc, canon, ld, h1, lead, body }) {
  const head = `<!--seo-->\n<meta name="description" content="${escH(desc)}">\n<link rel="canonical" href="${canon}">\n<meta property="og:site_name" content="Rate Your Judge Colorado"><meta property="og:type" content="website"><meta property="og:title" content="${escH(title)}"><meta property="og:description" content="${escH(desc)}"><meta property="og:url" content="${canon}"><meta property="og:image" content="${SITE}/img/og-card.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">\n<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${SITE}/img/og-card.jpg">\n<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n<!--/seo-->`;
  return fs.readFileSync(path.join(ROOT, 'public', 'about.html'), 'utf8')
    .replace('<head>', () => '<head><base href="/">')                                   // these pages live one folder down; the template's links are relative
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escH(title)}</title>`).replace(/<!--seo-->[\s\S]*?<!--\/seo-->/, () => head)
    .replace('data-page="about"', 'data-page="dir"')                                   // pages.js leaves a server-rendered page as it is
    .replace(/(<main id="app"[^>]*>)[\s\S]*?(<\/main>)/, (m, a, b) => `${a}<h1>${h1}</h1><p class="lead">${lead}</p><div class="doc-grid notoc"><div class="doc-body">${body}</div></div>${b}`);
}
const crumbsLd = items => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) });
async function directoryIndex() {
  const rows = await directoryRows(), byD = new Map();
  for (const c of courts) { const k = c.kind === 'appellate' ? '0' : c.district; if (!byD.has(k)) byD.set(k, []); byD.get(k).push(c); }
  const keys = [...byD.keys()].sort((a, b) => Number(a) - Number(b));
  const count = c => { const g = courtPeople(c, rows); const j = g.filter(([h]) => !/^Prosecutors/.test(h)).reduce((n, [, l]) => n + l.length, 0), p = g.filter(([h]) => /^Prosecutors/.test(h)).reduce((n, [, l]) => n + l.length, 0);
    return [j && `${j} ${j === 1 ? 'judge' : c.kind === 'appellate' ? 'justices and judges' : 'judges'}`, p && `${p} ${p === 1 ? 'prosecutor' : 'prosecutors'}`].filter(Boolean).join(' · '); };
  const body = keys.map(k => { const list = byD.get(k).sort((a, b) => a.name.localeCompare(b.name)), counties = [...new Set(list.map(c => c.county))].join(', ');
    return `<div class="card doc"><h2>${k === '0' ? 'Statewide appellate courts' : `${ordEn(Number(k))} Judicial District`}</h2>${k === '0' ? '' : `<p class="muted">${escH(counties)}</p>`}<ul class="dirlist">${list.map(c => `<li><a href="/judges/${c.id}">${escH(c.name)}</a> <span class="muted">${count(c)}</span></li>`).join('')}</ul></div>`; }).join('');
  const title = 'Colorado judges and prosecutors by courthouse — Rate Your Judge Colorado';
  const desc = `Every judge and prosecutor on Rate Your Judge Colorado, by courthouse and judicial district: ${rows.length} real Colorado officials. Open a name to read their ratings, or rate them anonymously in 30 seconds.`;
  return dirShell({ title, desc, canon: `${SITE}/judges`, h1: 'Colorado judges and prosecutors <em>by courthouse</em>', lead: escH(`All ${rows.length} judges and prosecutors on this site, from official court and district attorney lists. Pick a courthouse to see who works there and how people rated them.`), body: `<div class="card doc"><p><a href="/prosecutors">District attorneys by judicial district</a> · <a href="/">Rate someone</a></p></div>` + body,
    ld: { '@context': 'https://schema.org', '@graph': [{ '@type': 'CollectionPage', name: title, url: `${SITE}/judges`, description: desc, isPartOf: { '@type': 'WebSite', '@id': SITE + '/#site', name: 'Rate Your Judge Colorado', url: SITE + '/' } }, crumbsLd([['Rate Your Judge Colorado', SITE + '/'], ['Judges and prosecutors', `${SITE}/judges`]])] } });
}
async function directoryProsecutors() {   // /prosecutors: the 23 district attorneys' offices, each with the deputies named on official pages
  const rows = (await directoryRows()).filter(r => r.type === 'prosecutor'), byD = new Map();
  for (const r of rows) { if (!byD.has(r.district)) byD.set(r.district, []); byD.get(r.district).push(r); }
  const counties = d => [...new Set(courts.filter(c => c.district === d).map(c => c.county))].join(', ');
  const keys = [...byD.keys()].sort((a, b) => Number(a) - Number(b));
  const das = rows.filter(r => /^District Attorney/.test(r.name)), deps = rows.length - das.length;
  const body = keys.map(k => { const l = byD.get(k), da = l.filter(r => /^District Attorney/.test(r.name)), dep = l.filter(r => !/^District Attorney/.test(r.name));
    return `<div class="card doc" id="d-${k}"><h2>${ordEn(Number(k))} Judicial District</h2><p class="muted">${escH(counties(k))}</p><ul class="dirlist">${[...da, ...dep].map(r => `<li><a href="/p/${r.id}">${escH(r.name)}</a> <span class="muted">${scoreLine(r)}</span></li>`).join('')}</ul>${dep.length ? '' : '<p class="muted">We have not added this office’s deputy district attorneys yet.</p>'}</div>`; }).join('');
  const title = 'Colorado district attorneys by judicial district: ratings and reviews — Rate Your Judge Colorado';
  const desc = `All ${das.length} elected district attorneys in Colorado and ${deps} deputy district attorneys named on official pages, by judicial district. Read how people rated them, or rate one anonymously in 30 seconds.`;
  return dirShell({ title, desc, canon: `${SITE}/prosecutors`, h1: 'Colorado district attorneys <em>by judicial district</em>', lead: escH(`Every elected district attorney in Colorado (${das.length}) and the ${deps} deputies named on their offices’ official pages. Open a name to see how people rated them.`),
    body: `<div class="card doc"><p><a href="/">Rate a prosecutor</a> · <a href="/judges">Judges and prosecutors by courthouse</a></p></div>` + body,
    ld: { '@context': 'https://schema.org', '@graph': [{ '@type': 'CollectionPage', name: title, url: `${SITE}/prosecutors`, description: desc, mainEntity: { '@type': 'ItemList', numberOfItems: das.length, itemListElement: das.sort((a, b) => Number(a.district) - Number(b.district)).map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/p/${r.id}`, name: r.name })) } },
      crumbsLd([['Rate Your Judge Colorado', SITE + '/'], ['District attorneys', `${SITE}/prosecutors`]])] } });
}
async function directoryCourt(c) {
  const rows = await directoryRows(), groups = courtPeople(c, rows).filter(([, l]) => l.length);
  const body = `<div class="card doc"><p>${escH(c.address)}</p>${c.houses ? `<p class="muted">${escH(c.houses.join(' · '))}</p>` : ''}<p><a href="/">Rate someone at this courthouse</a> · <a href="/judges">All courthouses</a></p></div>` +
    groups.map(([h, l]) => `<div class="card doc"><h2>${escH(h)}</h2>${h === 'Prosecutors' ? `<p class="muted"><a href="/prosecutors#d-${c.district}">All district attorneys by judicial district</a></p>` : ''}<ul class="dirlist">${l.map(r => `<li><a href="/p/${r.id}">${escH(r.name)}</a> <span class="muted">${scoreLine(r)}</span></li>`).join('')}</ul></div>`).join('');
  const all = groups.flatMap(([, l]) => l), title = `${c.name} judges and prosecutors: ratings and reviews — Rate Your Judge Colorado`;
  const desc = c.kind === 'appellate' ? `The justices of the Colorado Supreme Court and the judges of the Colorado Court of Appeals: ratings and reviews from people who saw them at work.` : `${all.length} judges and prosecutors who work at ${c.name}, ${c.district ? `${ordEn(Number(c.district))} Judicial District, ` : ''}Colorado. Read how people rated them, or rate one anonymously in 30 seconds.`;
  return dirShell({ title, desc, canon: `${SITE}/judges/${c.id}`, h1: `${escH(c.name)} <em>judges and prosecutors</em>`, lead: escH(c.kind === 'appellate' ? 'Colorado Supreme Court and Court of Appeals, 2 E. 14th Ave., Denver.' : `Everyone on this site who works at ${c.name}, ${ordEn(Number(c.district))} Judicial District.`), body,
    ld: { '@context': 'https://schema.org', '@graph': [{ '@type': 'CollectionPage', name: title, url: `${SITE}/judges/${c.id}`, description: desc, mainEntity: { '@type': 'ItemList', numberOfItems: all.length, itemListElement: all.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/p/${r.id}`, name: r.name })) } },
      crumbsLd([['Rate Your Judge Colorado', SITE + '/'], ['Judges and prosecutors', `${SITE}/judges`], [c.name, `${SITE}/judges/${c.id}`]])] } });
}

// ---- routes ------------------------------------------------------------------------------------
async function api(req, res, url, isMod) {
  const net = netOf(req);
  if (req.method === 'GET' && url.pathname === '/api/courts') return json(res, 200, courts);

  if (req.method === 'GET' && url.pathname === '/api/challenge') {
    if (rateLimited('chal:' + net, 120, HOUR)) return json(res, 429, { error: 'slow down' });
    return json(res, 200, CAPTCHA ? makeChallenge(net) : { off: true });
  }
  if (req.method === 'POST' && ['/api/review', '/api/suggest', '/api/join', '/api/feedback'].includes(url.pathname) && !captchaOk(req)) return json(res, 400, { error: 'Please try again.' });

  if (req.method === 'POST' && url.pathname === '/api/session') {                    // a phone asks once for its anonymous, signed device token
    if (rateLimited('sess:' + net, SESSION_PER_DAY, DAY)) return json(res, 429, { error: 'slow down' });
    return json(res, 200, { device: await issueDevice() });
  }

  if (req.method === 'GET' && url.pathname === '/api/officials') {
    const court = url.searchParams.get('court');
    if (!courtById.has(court)) return json(res, 404, { error: 'unknown court' });
    const dist = courtById.get(court).district;
    const rows = (await db.prepare("SELECT id, type, name, demo, court_id, scope, title FROM officials WHERE court_id = ? OR scope = 'district' ORDER BY type, name").all(court))
      .filter(o => o.court_id === court || (o.scope === 'district' && courtById.get(o.court_id)?.district === dist))   // the elected DA and district-wide judges appear at every courthouse of their district
      .map(({ court_id, scope, ...o }) => o);
    if (courtById.get(court).kind === 'appellate') rows.sort((a, b) => benchRank(a.title) - benchRank(b.title) || a.name.localeCompare(b.name));   // chief justice, justices, chief judge, judges
    return json(res, 200, await Promise.all(rows.map(async o => ({ ...o, summary: (await aggregate(o.id)).all }))));
  }

  if (req.method === 'GET' && url.pathname === '/api/districts') {
    const rows = await db.prepare('SELECT o.court_id, COUNT(r.id) n, AVG(r.overall) avg FROM officials o LEFT JOIN reviews r ON r.official_id = o.id GROUP BY o.court_id').all();
    const byD = new Map();
    for (const row of rows) {
      const c = courtById.get(row.court_id), d = c.district || '?';
      const e = byD.get(d) || { district: d, n: 0, sum: 0, courts: [] };
      e.n += row.n; e.sum += (row.avg || 0) * row.n;
      e.courts.push({ id: c.id, name: c.name, county: c.county, n: row.n, overall: row.n >= MIN_N ? Math.round(row.avg * 10) / 10 : 0 });
      byD.set(d, e);
    }
    return json(res, 200, [...byD.values()].map(e => ({ district: e.district, n: e.n, overall: e.n >= MIN_N ? Math.round(e.sum / e.n * 10) / 10 : 0, courts: e.courts })));
  }
  if (req.method === 'GET' && url.pathname === '/api/search') {
    if (rateLimited('srch:' + net, 240, HOUR)) return json(res, 429, { error: 'slow down' });
    const q = String(url.searchParams.get('q') || '').toLowerCase().trim().slice(0, 40);
    if (q.length < 2) return json(res, 200, []);
    const cf = url.searchParams.get('court'), tf = url.searchParams.get('type');
    // word by word, best match first: "Warren Troy Hause" finds Judge Troy Hause, "judge zehe" finds Judge Matthew R. Zehe
    // (10-15: four visitors could not find a listed judge this way and suggested him instead)
    // accents ignored too: "Marquez" finds Justice Monica M. Márquez. ~400 officials, so match in memory (60 s cache).
    const toks = fold(q).replace(/[%_.,]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !NAME_NOISE.has(w)).slice(0, 4);
    if (!toks.length) return json(res, 200, []);
    if (!offCache || Date.now() - offCache.at > 60000) offCache = { at: Date.now(), rows: (await db.prepare('SELECT id, court_id, type, name, demo, title FROM officials').all()).map(o => ({ o, f: fold(o.name) })) };
    const rows = offCache.rows.filter(x => (!cf || x.o.court_id === cf) && (!tf || x.o.type === tf))
      .map(x => ({ o: x.o, hit: toks.filter(w => x.f.includes(w)).length, last: x.f.includes(toks[toks.length - 1]) }))
      .filter(x => x.hit && (toks.length < 3 || x.hit >= 2 || x.last))
      .sort((a, b) => b.hit - a.hit || a.o.name.localeCompare(b.o.name)).slice(0, 12).map(x => x.o);
    return json(res, 200, await Promise.all(rows.map(async o => ({ ...o, court: courtById.get(o.court_id).name, profile: profileFor(o), summary: (await aggregate(o.id)).all }))));
  }
  if (req.method === 'GET' && url.pathname === '/api/appeals/top') {   // home rail: real judges by number of appeals decided (a count, never a rate)
    if (!topAppeals || Date.now() - topAppeals.at > 10 * 60 * 1000) {
      const rows = await db.prepare(`SELECT o.id, o.name, o.type, o.court_id, a.outcome, COUNT(*) n FROM appeals a JOIN officials o ON o.id = a.official_id
        WHERE o.demo = 0 GROUP BY o.id, o.name, o.type, o.court_id, a.outcome`).all();
      const by = new Map();
      for (const r of rows) { if (!APPEAL_OUTCOMES.includes(r.outcome)) continue; const x = by.get(r.id) || by.set(r.id, { id: r.id, name: r.name, type: r.type, court: courtById.get(r.court_id)?.name || '', n: 0, counts: {} }).get(r.id); x.n += Number(r.n); x.counts[r.outcome] = Number(r.n); }
      const all = [...by.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
      topAppeals = { at: Date.now(), body: { judges: all.length, decisions: all.reduce((s, x) => s + x.n, 0), items: all.slice(0, 12) } };
    }
    return json(res, 200, topAppeals.body);
  }
  if (req.method === 'GET' && url.pathname === '/api/latest') {                  // home "Latest ratings": every new rating on a real person, with that person's own answers; a comment's TEXT only once a moderator approved it (the official's AVERAGE still waits for MIN_N)
    const me = validDevice(deviceOf(req)) ? deviceOf(req) : '';
    const rows = await db.prepare(`SELECT r.id, r.official_id, r.role, r.subrole, r.comment, r.status, r.device, r.created_at, r.overall, r.q1, r.q2, r.q3, r.q4, r.q5, o.name, o.type, o.court_id,
        (SELECT COUNT(*) FROM votes v WHERE v.review_id = r.id AND v.vote = 1) up, (SELECT COUNT(*) FROM votes v WHERE v.review_id = r.id AND v.vote = -1) down,
        (SELECT vote FROM votes v WHERE v.review_id = r.id AND v.device = ?) myvote
      FROM reviews r JOIN officials o ON o.id = r.official_id
      WHERE r.status IN ('none', 'published', 'pending') AND o.demo = 0 ORDER BY r.created_at DESC, r.id DESC LIMIT 10`).all(me || '-');   // 👍/👎 on a card here are the same votes as on the profile   // phones show 3, the desktop row moves through up to 10
    return json(res, 200, rows.map(r => ({ id: Number(r.id), official: Number(r.official_id), name: r.name, type: r.type, court: courtById.get(r.court_id)?.name || '', role: r.role, subrole: r.subrole || '', text: r.status === 'published' ? (r.comment || '') : '', at: Number(r.created_at),
      up: Number(r.up), down: Number(r.down), myVote: r.myvote == null ? 0 : Number(r.myvote), mine: !!me && r.device === me, canReact: !!me && r.device !== me && r.status === 'published' && !!(r.comment || '').trim(), overall: r.overall == null ? null : Number(r.overall), q: ['q1', 'q2', 'q3', 'q4', 'q5'].map(k => r[k] == null ? null : Number(r[k])) })));
  }
  if (req.method === 'GET' && url.pathname === '/api/featured') {
    return json(res, 200, (await Promise.all([1, 3].map(async id => { const o = await officialRow(id); return o && o.demo ? { ...o, court: courtById.get(o.court_id).name, profile: profileFor(o), summary: (await aggregate(id)).all } : null; }))).filter(Boolean));
  }

  let m;
  if (req.method === 'GET' && (m = url.pathname.match(/^\/api\/officials\/(\d+)$/))) {
    const o = await officialRow(idOf(m[1]));
    if (!o) return json(res, 404, { error: 'not found' });
    const stats = await aggregate(o.id);
    return json(res, 200, { ...o, profile: profileFor(o), trend: await trend(o.id, stats.all.n), court: courtById.get(o.court_id), stats, appeals: await appealsOf(o), opinions: await opinionsOf(o), comments: await publicComments(o.id, deviceOf(req)) });
  }

  if (req.method === 'POST' && url.pathname === '/api/review') {
    if (rateLimited('rev:' + net, 60, HOUR)) return json(res, 429, { error: 'slow down' });
    const b = await readBody(req);
    const device = deviceOf(req, b), o = await officialRow(idOf(b.official));
    if (!validDevice(device)) return badDevice(res);
    if (!o || !ROLES.includes(b.role)) return json(res, 400, { error: 'bad request' });
    if (courtById.get(o.court_id)?.kind === 'appellate' && !APPELLATE_ROLES.includes(b.role)) return json(res, 400, { error: 'At the Supreme Court and Court of Appeals, ratings come from attorneys and people who watched an oral argument.' });
    if (rateLimited('revd:' + device, 10, HOUR)) return json(res, 429, { error: 'slow down' });
    const q = METRICS.map(k => (b[k] === null ? 'na' : int15(b[k]))), overall = int15(b.overall);
    if (q.includes(null) || overall === null || q.filter(x => x !== 'na').length < 3) return json(res, 400, { error: 'ratings 1-5 required' });   // at least 3 of the 5 answered
    for (let i = 0; i < q.length; i++) if (q[i] === 'na') q[i] = null;
    const outcome = OUTCOMES.includes(b.outcome) ? b.outcome : '';
    const subrole = b.role === 'party' && SUBROLES.includes(b.subrole) ? b.subrole : '';
    const xs = o.type === 'prosecutor' && (subrole === 'victim' || subrole === 'witness') ? [int15(b.x1), int15(b.x2)] : [null, null];
    if (await db.prepare('SELECT 1 FROM reviews WHERE official_id = ? AND device = ? AND created_at > ?').get(o.id, device, Date.now() - REPEAT_DAYS * DAY))
      return json(res, 409, { error: 'You already rated this person recently.' });
    let present = 0;
    const court = courtById.get(o.court_id);
    if (b.lat != null && b.lon != null && Number.isFinite(b.lat) && Number.isFinite(b.lon))
      present = haversine(b.lat, b.lon, court.lat, court.lon) <= PRESENCE_METERS ? 1 : 0;   // coordinates are discarded right here
    const comment = clean(b.comment);
    const sc = comment ? screen(comment, o.name) : { verdict: 'none' };
    if (sc.verdict === 'block') return json(res, 400, { error: SCREEN_MESSAGES[sc.reason] || SCREEN_MESSAGES.language, screen: sc.reason });
    const cstatus = !comment ? 'none' : sc.verdict === 'hold' ? 'held' : 'pending';   // 'held' = only the author and moderators see it
    try {
      const r = await db.prepare(`INSERT INTO reviews (official_id, role, q1, q2, q3, q4, q5, overall, outcome, subrole, x1, x2, present, device, day, comment, status, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(o.id, b.role, ...q, overall, outcome, subrole, xs[0], xs[1], present, device, today(), comment, cstatus, hourFloor(Date.now()));
      return json(res, 200, { ok: true, id: Number(r.lastInsertRowid), present: !!present, commentStatus: cstatus, held: sc.verdict === 'hold' ? sc.reason : undefined });
    } catch (e) {
      if (e.code === '23505' || String(e.message).includes('UNIQUE')) return json(res, 409, { error: 'You already rated this person recently.' });
      throw e;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/vote') {
    // 👍/👎 on a comment. In 'peer' mode a vote on a PENDING comment is
    // still a publishing confirmation with its old rules; everywhere else it is a reader reaction: one per phone per comment,
    // pressing the same thumb again takes it back, and it never changes whether a comment is shown.
    if (rateLimited('vote:' + net, 200, HOUR)) return json(res, 429, { error: 'slow down' });
    const b = await readBody(req);
    const device = deviceOf(req, b), vote = b.vote === 1 ? 1 : b.vote === -1 ? -1 : 0;
    if (!validDevice(device)) return badDevice(res);
    if (!vote) return json(res, 400, { error: 'bad request' });
    const r = await db.prepare('SELECT id, device, status, comment FROM reviews WHERE id = ?').get(idOf(b.review));
    if (!r) return json(res, 404, { error: 'not found' });
    const confirming = PUBLISH_MODE === 'peer' && r.status === 'pending';
    if (!r.comment || !(confirming || r.status === 'published' || (r.status === 'pending' && PUBLISH_MODE === 'visible'))) return json(res, 409, { error: 'This comment is not public.' });
    if (r.device === device) return json(res, 403, { error: 'You cannot react to your own comment.' });
    if (confirming && !await eligibleVoter(device)) return json(res, 403, { error: 'Rate someone first, then you can confirm other reviews.' });
    const had = await db.prepare('SELECT vote FROM votes WHERE review_id = ? AND device = ?').get(r.id, device);
    if (had && Number(had.vote) === vote && !confirming) await db.prepare('DELETE FROM votes WHERE review_id = ? AND device = ?').run(r.id, device);   // same thumb again = take it back
    else await db.prepare('INSERT INTO votes (review_id, device, vote, created_at) VALUES (?,?,?,?) ON CONFLICT (review_id, device) DO UPDATE SET vote = excluded.vote, created_at = excluded.created_at').run(r.id, device, vote, hourFloor(Date.now()));
    if (confirming) await refreshStatus(r.id);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/suggest') {                   // "I can't find the judge/prosecutor"
    if (rateLimited('sg:' + net, 20, HOUR)) return json(res, 429, { error: 'slow down' });
    const b = await readBody(req, 4000);
    const device = deviceOf(req, b);
    if (!validDevice(device)) return badDevice(res);
    if (rateLimited('sgd:' + device, 5, HOUR)) return json(res, 429, { error: 'slow down' });
    if ((await db.prepare("SELECT COUNT(*) n FROM suggestions WHERE status = 'pending'").get()).n >= 300) return json(res, 503, { error: 'busy' });
    const name = clean(b.name).replace(/[^\p{L}\p{M}'’.\- ]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!courtById.has(b.court) || !TYPES.includes(b.type) || name.length < 3 || !/\p{L}{2}/u.test(name)) return json(res, 400, { error: 'bad request' });
    const words = fold(name).replace(/\./g, ' ').split(' ').filter(w => w.length > 2 && !NAME_NOISE.has(w)), last = words[words.length - 1];
    const near = (await db.prepare('SELECT id, name, type FROM officials WHERE court_id = ? AND type = ?').all(b.court, b.type)).filter(o => words.length && (words.every(w => fold(o.name).includes(w)) || fold(o.name).split(/[\s.,]+/).includes(last)));   // same surname at that court = probably them ("Warren Troy Hause" → Troy Hause)
    if (near.length && !b.force) return json(res, 200, { matches: near.slice(0, 5).map(o => ({ id: o.id, name: o.name })) });      // already on the list — don't create a duplicate
    if (await db.prepare("SELECT 1 FROM suggestions WHERE court_id = ? AND type = ? AND lower(name) = lower(?) AND status = 'pending'").get(b.court, b.type, name)) return json(res, 200, { ok: true, already: true });
    await db.prepare('INSERT INTO suggestions (created_at, court_id, type, name, note, device) VALUES (?,?,?,?,?,?)').run(hourFloor(Date.now()), b.court, b.type, name, clean(b.note).slice(0, 200), device); return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/feedback') {                 // pilot feedback: anonymous, no contact details asked
    if (rateLimited('fb:' + net, 30, HOUR)) return json(res, 429, { error: 'slow down' });
    const b = await readBody(req, 8000);
    const device = deviceOf(req, b);
    if (validDevice(device) && rateLimited('fbd:' + device, 6, HOUR)) return json(res, 429, { error: 'slow down' });
    if ((await db.prepare('SELECT COUNT(*) n FROM feedback').get()).n >= 5000) return json(res, 503, { error: 'busy' });
    const text = clean(b.text).slice(0, 600), questions = clean(b.questions).slice(0, 600);
    let held = false;                                                             // feedback is public, so it gets the comment screen (short is fine here)
    for (const x of [text, questions].filter(Boolean)) { const sc = screen(x); if (sc.verdict === 'block' && sc.reason !== 'short') return json(res, 400, { error: SCREEN_MESSAGES[sc.reason] || SCREEN_MESSAGES.language, screen: sc.reason }); if (sc.verdict === 'hold') held = true; }
    const parts = (Array.isArray(b.parts) ? b.parts : []).map(x => clean(x).slice(0, 40)).slice(0, 8).join(', ');
    const ease = int15(b.ease);
    if (!text && !questions && !parts && ease === null) return json(res, 400, { error: 'empty' });
    await db.prepare('INSERT INTO feedback (created_at, page, lang, ease, parts, questions, text, device, pub) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(hourFloor(Date.now()), clean(b.page).slice(0, 40), b.lang === 'es' ? 'es' : 'en', ease, parts, questions, text, validDevice(device) ? device : '', held ? 'held' : '');
    notify(`[Feedback] ease ${ease ?? '-'} · ${clean(b.page).slice(0, 30) || 'page'} · ${b.lang === 'es' ? 'ES' : 'EN'}`, [`Ease: ${ease ?? '-'}/5`, `Page: ${clean(b.page).slice(0, 40)}`, `Language: ${b.lang === 'es' ? 'ES' : 'EN'}`, `Confusing: ${parts || '-'}`, `Question wording: ${questions || '-'}`, `Comment: ${text || '-'}`]); return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/asks') {                      // "What people ask": everything people sent (minus held/removed), newest first, with reader 👍/👎
    const me = validDevice(deviceOf(req)) ? deviceOf(req) : '';
    const rows = await db.prepare(`SELECT f.id, f.created_at, f.lang, f.ease, f.parts, f.questions, f.text, f.device, f.pub,
        (SELECT COUNT(*) FROM feedback_votes v WHERE v.feedback_id = f.id AND v.vote = 1) up, (SELECT COUNT(*) FROM feedback_votes v WHERE v.feedback_id = f.id AND v.vote = -1) down,
        (SELECT vote FROM feedback_votes v WHERE v.feedback_id = f.id AND v.device = ?) myvote
      FROM feedback f WHERE f.pub IN ('', 'published') AND (COALESCE(f.text, '') != '' OR COALESCE(f.questions, '') != '' OR f.ease IS NOT NULL OR COALESCE(f.parts, '') != '') ORDER BY f.created_at DESC, f.id DESC LIMIT 10`).all(me || '-');
    return json(res, 200, rows.map(r => ({ id: Number(r.id), at: Number(r.created_at), lang: r.lang, ease: r.ease == null ? null : Number(r.ease), parts: r.parts || '', questions: r.questions || '', text: r.text || '', reviewed: r.pub === 'published', up: Number(r.up), down: Number(r.down),
      myVote: r.myvote == null ? 0 : Number(r.myvote), mine: !!me && r.device === me, canReact: !!me && r.device !== me })));
  }
  if (req.method === 'POST' && url.pathname === '/api/asks/vote') {                 // one 👍 or 👎 per phone per suggestion; the same thumb again takes it back; never your own
    if (rateLimited('askv:' + net, 200, HOUR)) return json(res, 429, { error: 'slow down' });
    const b = await readBody(req); const device = deviceOf(req, b), vote = b.vote === 1 ? 1 : b.vote === -1 ? -1 : 0;
    if (!validDevice(device)) return badDevice(res);
    if (!vote) return json(res, 400, { error: 'bad request' });
    const f = await db.prepare("SELECT id, device FROM feedback WHERE id = ? AND pub IN ('', 'published')").get(idOf(b.id));
    if (!f) return json(res, 404, { error: 'not found' });
    if (f.device && f.device === device) return json(res, 403, { error: 'You cannot vote on your own suggestion.' });
    const had = await db.prepare('SELECT vote FROM feedback_votes WHERE feedback_id = ? AND device = ?').get(f.id, device);
    if (had && Number(had.vote) === vote) await db.prepare('DELETE FROM feedback_votes WHERE feedback_id = ? AND device = ?').run(f.id, device);
    else await db.prepare('INSERT INTO feedback_votes (feedback_id, device, vote, created_at) VALUES (?,?,?,?) ON CONFLICT (feedback_id, device) DO UPDATE SET vote = excluded.vote, created_at = excluded.created_at').run(f.id, device, vote, hourFloor(Date.now()));
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/join') {                     // "I want to help": volunteers, coders, testers, promoters
    if (rateLimited('join:' + net, 8, HOUR)) return json(res, 429, { error: 'slow down' });
    const b = await readBody(req, 4000);
    if (String(b.website || '') !== '') return json(res, 200, { ok: true });          // honeypot field: real people never fill it
    if ((await db.prepare('SELECT COUNT(*) n FROM join_requests').get()).n >= 3000) return json(res, 503, { error: 'busy' });
    const ALLOWED = ['volunteer', 'developer', 'tester', 'promoter', 'legal', 'translator', 'other'];
    const interests = (Array.isArray(b.interests) ? b.interests : []).filter(x => ALLOWED.includes(x)).join(',');
    const contact = clean(b.contact).slice(0, 120), message = clean(b.message).slice(0, 500);
    if (!interests && !message) return json(res, 400, { error: 'empty' });
    await db.prepare('INSERT INTO join_requests (created_at, interests, contact, message, lang) VALUES (?,?,?,?,?)').run(hourFloor(Date.now()), interests, contact, message, b.lang === 'es' ? 'es' : 'en');
    notify(`[Get involved] ${interests || 'message'}`, [`Interests: ${interests || '-'}`, `Contact: ${contact || '-'}`, `Language: ${b.lang === 'es' ? 'ES' : 'EN'}`, `Message: ${message || '-'}`]); return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/report') {
    if (rateLimited('rep:' + net, 40, HOUR)) return json(res, 429, { error: 'slow down' });
    const b = await readBody(req);
    const device = deviceOf(req, b);
    const r = await db.prepare('SELECT id, device, status, comment, mod_decided FROM reviews WHERE id = ?').get(idOf(b.review));
    if (!validDevice(device)) return badDevice(res);
    if (!r || !r.comment) return json(res, 400, { error: 'bad request' });
    if (r.device === device) return json(res, 403, { error: 'You cannot report your own comment.' });
    if (!await eligibleVoter(device)) return json(res, 403, { error: 'Rate someone first, then you can report comments.' });   // no drive-by censorship with throwaway tokens
    await db.prepare('INSERT INTO reports (review_id, device, reason, created_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING').run(r.id, device, clean(b.reason).slice(0, 80), hourFloor(Date.now()));
    const n = (await db.prepare('SELECT COUNT(*) n FROM reports WHERE review_id = ?').get(r.id)).n;
    if (n >= 2 && !r.mod_decided && ['published', 'pending'].includes(r.status)) await db.prepare("UPDATE reviews SET status='flagged' WHERE id = ?").run(r.id);   // hidden until a moderator decides (never overrides a moderator's approval)
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/transcribe') {
    if (rateLimited('stt:' + net, 40, HOUR)) return json(res, 429, { error: 'Too many voice notes this hour.' });
    const device = deviceOf(req);
    if (!validDevice(device)) return badDevice(res);
    if (rateLimited('sttd:' + device, 8, HOUR)) return json(res, 429, { error: 'Too many voice notes this hour.' });
    const type = String(req.headers['content-type'] || '');
    const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm';
    const buf = await readRaw(req, 3_000_000);
    if (buf.length < 800) return json(res, 400, { error: 'Too short.' });
    const text = await transcribe(buf, ext);
    if (text === 'busy') return json(res, 503, { error: 'Could not understand the recording — please type instead.' });
    return text ? json(res, 200, { text: clean(text) }) : json(res, 502, { error: 'Could not understand the recording — please type instead.' });
  }

  if (req.method === 'GET' && url.pathname === '/api/log') { // PUBLIC transparency: decisions + how people voted
    const decisions = await Promise.all((await db.prepare('SELECT m.created_at AS at, m.action, m.note, m.mod, r.official_id, r.role FROM mod_log m JOIN reviews r ON r.id = m.review_id ORDER BY m.created_at DESC LIMIT 50').all())
      .map(async d => ({ at: d.at, action: d.action, note: d.note, mod: d.mod, role: d.role, official: await officialLabel(d.official_id) })));
    const comments = await Promise.all((await db.prepare(`SELECT id, official_id, role, comment, status, created_at,
        (SELECT COUNT(*) FROM votes v WHERE v.review_id = r.id AND v.vote = 1) up, (SELECT COUNT(*) FROM votes v WHERE v.review_id = r.id AND v.vote = -1) down
      FROM reviews r WHERE comment IS NOT NULL AND comment != '' ORDER BY created_at DESC LIMIT 50`).all())
      .map(async c => ({ id: c.id, at: c.created_at, role: c.role, status: c.status, up: c.up, down: c.down, text: c.status === 'published' ? c.comment : null, official: await officialLabel(c.official_id) })));
    return json(res, 200, { rules: { confirmsToPublish: CONFIRMS_TO_PUBLISH, presenceFeet: PRESENCE_FEET, publishMode: PUBLISH_MODE, minN: MIN_N, repeatDays: REPEAT_DAYS }, decisions, comments });
  }

  if (url.pathname.startsWith('/api/mod/')) {
    if (isMod && req.method === 'GET' && url.pathname === '/api/mod/login-info') return json(res, 200, { code: MOD_2FA });
    if (isMod && req.method === 'POST' && url.pathname === '/api/mod/login') return modLogin(req, res, net);
    if (isMod && req.method === 'POST' && url.pathname === '/api/mod/logout') { res.setHeader('set-cookie', [`__Host-modsess=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict; Secure`, `modsess=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`]); return json(res, 200, { ok: true }); }
    const mod = await modName(req, isMod, net);
    if (!mod) return json(res, isMod ? 401 : 404, { error: isMod ? 'Moderators only.' : 'no such route' });
    if (req.method === 'GET' && url.pathname === '/api/mod/whoami') return json(res, 200, { mod });
    if (req.method === 'GET' && url.pathname === '/api/mod/summary') {                // live dashboard numbers (the page polls this)
      const c = async q => (await db.prepare(q).get()).n, now = Date.now();
      return json(res, 200, { now, pending: await c("SELECT COUNT(*) n FROM reviews WHERE status IN ('pending','held') AND comment IS NOT NULL AND comment != ''"), flagged: await c("SELECT COUNT(*) n FROM reviews WHERE status = 'flagged'"),
        suggestions: await c("SELECT COUNT(*) n FROM suggestions WHERE status = 'pending'"), join: await c('SELECT COUNT(*) n FROM join_requests'), feedback: await c('SELECT COUNT(*) n FROM feedback'),
        ratings24h: await c(`SELECT COUNT(*) n FROM reviews WHERE created_at > ${now - DAY}`), recent: await db.prepare('SELECT at, mod, kind, from_status, to_status FROM mod_actions ORDER BY at DESC LIMIT 8').all() });
    }
    if (req.method === 'GET' && url.pathname === '/api/mod/suggestions')         // each with the people already listed at that court under the same surname
      return json(res, 200, await Promise.all((await db.prepare("SELECT id, created_at, court_id, type, name, note FROM suggestions WHERE status = 'pending' ORDER BY created_at").all())
        .map(async r => ({ ...r, court: courtById.get(r.court_id)?.name || r.court_id, matches: await sameSurnameAt(r.court_id, r.name) }))));
    if (req.method === 'POST' && url.pathname === '/api/mod/suggest-decide') {
      const b = await readBody(req);
      const r = await db.prepare("SELECT * FROM suggestions WHERE id = ? AND status = 'pending'").get(idOf(b.id));
      if (!r) return json(res, 404, { error: 'not found' });
      if (b.status === 'existing') {                                              // "already listed": link the request to that person, add nobody
        const o = await db.prepare('SELECT id, name FROM officials WHERE id = ? AND demo = 0').get(idOf(b.official));
        if (!o) return json(res, 404, { error: 'no such person' });
        await db.prepare("UPDATE suggestions SET status='added', decided_by=?, decided_at=?, official_id=? WHERE id=?").run(mod, Date.now(), Number(o.id), r.id);
        await audit(mod, 'suggestion', r.id, 'pending', 'already listed', o.name);
        return json(res, 200, { ok: true });
      }
      if (b.status === 'added') {
        const name = clean(b.name || r.name).slice(0, 80), type = TYPES.includes(b.type) ? b.type : r.type;
        const dup = await sameSurnameAt(r.court_id, name);
        if (dup.length && !b.force) return json(res, 409, { error: `Already listed at this court: ${dup.map(o => o.name).join(', ')}` });
        const ins = await db.prepare('INSERT INTO officials (court_id, type, name, demo) VALUES (?,?,?,0)').run(r.court_id, type, name);   // awaited: on Postgres an un-awaited run gave NaN after inserting (10-16: two duplicate rows)
        await db.prepare("UPDATE suggestions SET status='added', decided_by=?, decided_at=?, official_id=? WHERE id=?").run(mod, Date.now(), Number(ins.lastInsertRowid), r.id);
        await audit(mod, 'suggestion', r.id, 'pending', 'added', name);
      } else { await db.prepare("UPDATE suggestions SET status='rejected', decided_by=?, decided_at=? WHERE id=?").run(mod, Date.now(), r.id); await audit(mod, 'suggestion', r.id, 'pending', 'rejected', r.name); }
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/mod/join') return json(res, 200, await db.prepare('SELECT created_at, interests, contact, message, lang FROM join_requests ORDER BY created_at DESC LIMIT 200').all());
    if (req.method === 'POST' && url.pathname === '/api/mod/feedback-decide') {      // mark a suggestion reviewed, or remove it from the home page
      const b = await readBody(req); const pub = b.pub === 'published' ? 'published' : b.pub === 'hidden' ? 'hidden' : '';
      const f = await db.prepare('SELECT id FROM feedback WHERE id = ?').get(idOf(b.id));
      if (!f || !pub) return json(res, 400, { error: 'bad request' });
      await db.prepare('UPDATE feedback SET pub = ?, pub_by = ?, pub_at = ? WHERE id = ?').run(pub, mod, Date.now(), f.id);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/mod/feedback') return json(res, 200, { rows: await db.prepare('SELECT id, created_at, page, lang, ease, parts, questions, text, share, pub, pub_by FROM feedback ORDER BY created_at DESC LIMIT 100').all(), avg: await db.prepare('SELECT AVG(ease) a, COUNT(*) n FROM feedback').get() });
    if (req.method === 'GET' && url.pathname === '/api/mod/pending')
      return json(res, 200, await Promise.all((await db.prepare("SELECT id, official_id, role, comment, present, status, created_at, (SELECT COUNT(*) FROM reports x WHERE x.review_id = r.id) reports, (SELECT COUNT(*) FROM votes v WHERE v.review_id = r.id AND v.vote = 1) up, (SELECT COUNT(*) FROM votes v WHERE v.review_id = r.id AND v.vote = -1) down FROM reviews r WHERE status IN ('held','flagged','pending') AND comment IS NOT NULL AND comment != '' ORDER BY CASE status WHEN 'held' THEN 0 WHEN 'flagged' THEN 1 ELSE 2 END, created_at").all())
        .map(async r => ({ ...r, official: await officialLabel(r.official_id) }))));
    if (req.method === 'GET' && url.pathname === '/api/mod/people') {                 // every person with their LIVE numbers (not hidden below MIN_N: moderators see all)
      const rows = await db.prepare(`SELECT o.id, o.name, o.type, o.court_id, o.demo, COUNT(r.id) n, AVG(r.overall) avg, MAX(r.created_at) last,
        SUM(CASE WHEN r.comment IS NOT NULL AND r.comment != '' AND r.status = 'published' THEN 1 ELSE 0 END) pub,
        SUM(CASE WHEN r.status IN ('pending','flagged','held') AND r.comment IS NOT NULL AND r.comment != '' THEN 1 ELSE 0 END) waiting,
        SUM(CASE WHEN r.status = 'rejected' THEN 1 ELSE 0 END) rej
        FROM officials o LEFT JOIN reviews r ON r.official_id = o.id GROUP BY o.id, o.name, o.type, o.court_id, o.demo ORDER BY n DESC, o.name`).all();
      return json(res, 200, rows.map(o => ({ id: o.id, name: o.name, type: o.type, demo: !!o.demo, court: courtById.get(o.court_id)?.name || '', n: Number(o.n), avg: o.n ? Math.round(o.avg * 10) / 10 : null, last: o.last ? Number(o.last) : null, pub: Number(o.pub || 0), waiting: Number(o.waiting || 0), rej: Number(o.rej || 0) })));
    }
    if (req.method === 'GET' && url.pathname === '/api/mod/person') {
      const id = Number(url.searchParams.get('id')), o = await officialRow(id);
      if (!o) return json(res, 404, { error: 'not found' });
      const rows = await db.prepare(`SELECT id, role, overall, q1, q2, q3, q4, q5, present, comment, status, created_at, (SELECT COUNT(*) FROM reports x WHERE x.review_id = r.id) reports FROM reviews r WHERE official_id = ? ORDER BY created_at DESC LIMIT 60`).all(id);
      return json(res, 200, { id: o.id, name: o.name, type: o.type, court: courtById.get(o.court_id)?.name || '', reviews: rows.map(r => ({ ...r, id: Number(r.id), created_at: Number(r.created_at) })) });
    }
    if (req.method === 'POST' && url.pathname === '/api/mod/recheck') {                // re-open an earlier decision: back to the queue, held there (votes can't publish a 'flagged' comment)
      const b = await readBody(req);
      const r = await db.prepare("SELECT id, status FROM reviews WHERE id = ? AND comment IS NOT NULL AND comment != ''").get(idOf(b.review));
      if (!r) return json(res, 404, { error: 'not found' });
      if (r.status === 'flagged') return json(res, 200, { ok: true });
      await db.prepare("UPDATE reviews SET status = 'flagged', mod_decided = 1 WHERE id = ?").run(r.id);
      await audit(mod, 'recheck', r.id, r.status, 'flagged', clean(b.note).slice(0, 200));
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/mod/decide') {
      const b = await readBody(req);
      if (!['published', 'rejected'].includes(b.status)) return json(res, 400, { error: 'bad status' });
      const r = await db.prepare("SELECT id, status FROM reviews WHERE id = ? AND comment IS NOT NULL AND comment != ''").get(idOf(b.review));
      if (!r) return json(res, 404, { error: 'not found' });
      await db.prepare('UPDATE reviews SET status = ?, mod_decided = 1 WHERE id = ?').run(b.status, r.id);
      await db.prepare('DELETE FROM reports WHERE review_id = ?').run(r.id);                    // a moderator's decision closes the reports
      await db.prepare('INSERT INTO mod_log (review_id, action, note, mod, created_at) VALUES (?,?,?,?,?)').run(r.id, b.status, clean(b.note).slice(0, 200), mod, Date.now());
      await audit(mod, 'comment', r.id, r.status, b.status, clean(b.note).slice(0, 200));
      return json(res, 200, { ok: true });
    }
  }
  json(res, 404, { error: 'no such route' });
}

// ---- retention: the link between a person's token and their ratings is cut after RETENTION_DAYS -----------
async function cleanup() {
  const cut = Date.now() - RETENTION_DAYS * DAY;
  await db.prepare("UPDATE reviews SET device = 'r' || id WHERE created_at < ? AND device NOT LIKE 'r%' AND device NOT LIKE 'seed%'").run(cut);
  await db.prepare(`UPDATE votes SET device = 'r' || ${db.rnd} WHERE created_at < ? AND device NOT LIKE 'r%'`).run(cut);
  await db.prepare(`UPDATE reports SET device = 'r' || ${db.rnd} WHERE created_at < ? AND device NOT LIKE 'r%'`).run(cut);
  await db.prepare("UPDATE suggestions SET device = '' WHERE created_at < ?").run(cut);
  await db.prepare("UPDATE feedback SET device = '' WHERE created_at < ?").run(cut);
  await db.prepare("UPDATE join_requests SET contact = '' WHERE created_at < ? AND contact != ''").run(Date.now() - 180 * DAY);   // contact details are kept 180 days
  await db.prepare('DELETE FROM devices WHERE created_at < ?').run(Date.now() - 90 * DAY);
  for (const [k, v] of failedLogins) if (!v.some(t => Date.now() - t < 15 * 60e3)) failedLogins.delete(k);   // never grows without bound
}
await cleanup(); setInterval(() => cleanup().catch(e => console.error('cleanup', e.message)), HOUR).unref();

// ---- security headers on every response ---------------------------------------------------------------
const SEC = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; manifest-src 'self'; worker-src 'self'; frame-src https://www.youtube-nocookie.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cross-origin-opener-policy': 'same-origin', 'x-frame-options': 'DENY',
  'permissions-policy': 'geolocation=(self), microphone=(self), camera=()',
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
const PUBLIC_DIR = path.join(ROOT, 'public') + path.sep;
const MOD_ONLY = new Set(['/mod.html', '/mod.js']);                                  // never served on the public listener

function makeHandler(isMod) {
  return async (req, res) => {
    for (const k in SEC) res.setHeader(k, SEC[k]);
    if (isMod) res.setHeader('x-robots-tag', 'noindex, nofollow, noarchive');                      // the moderator host is never indexed
    try {
      const host = String(req.headers.host || '').toLowerCase();
      if (ALLOWED_HOSTS.length && !ALLOWED_HOSTS.includes(host)) { res.writeHead(421); return res.end('Misdirected'); }          // blocks DNS-rebinding
      const url = new URL(req.url, 'http://x');
      if (req.method === 'POST') {                                                                                                  // CSRF: same-origin JSON only
        const sfs = req.headers['sec-fetch-site'], origin = req.headers.origin, ct = String(req.headers['content-type'] || '');
        if ((sfs && !['same-origin', 'none'].includes(sfs)) || (origin && new URL(origin).host.toLowerCase() !== host)) return json(res, 403, { error: 'cross-site request refused' });
        if (url.pathname !== '/api/transcribe' && !ct.startsWith('application/json')) return json(res, 415, { error: 'JSON only' });
      }
      if (url.pathname.startsWith('/api/')) { res.setHeader('x-robots-tag', 'noindex'); return await api(req, res, url, isMod); }
      if (!isMod && MOD_ONLY.has(url.pathname)) { res.writeHead(404); return res.end('Not found'); }
      const dest = req.headers['sec-fetch-dest'];                                                   // the service worker's background pre-caching is not a visit
      let pm;
      if ((pm = url.pathname.match(/^\/archive\/(coa|ojpe)\/([\w.-]+\.pdf)$/))) {        // our saved copy of a court document (never a page view, never indexed)
        const file = path.join(ARCHIVE, pm[1], pm[2]);
        if (!file.startsWith(ARCHIVE) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
        res.removeHeader('content-security-policy');                                                   // the browser's own PDF viewer needs it off
        res.writeHead(200, { 'content-type': 'application/pdf', 'cache-control': 'public, max-age=31536000, immutable', 'x-robots-tag': 'noindex' });
        return fs.createReadStream(file).pipe(res);
      }
      if (url.pathname === '/prosecutors') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(await directoryProsecutors());
      }
      if (url.pathname === '/judges' || url.pathname === '/judges/' || (pm = url.pathname.match(/^\/judges\/([a-z0-9-]+)$/))) {   // the crawlable directory
        if (url.pathname === '/judges/') { res.writeHead(301, { location: '/judges' }); return res.end(); }
        const c = pm && pm[1] ? courtById.get(pm[1]) : null;
        if (pm && pm[1] && !c) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
        const html = c ? await directoryCourt(c) : await directoryIndex();
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(html);
      }
      if ((pm = url.pathname.match(/^\/p\/(\d+)$/))) {                    // shareable profile link with a link preview
        const o = await officialRow(idOf(pm[1]));
        let html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8').replace(/<!--seo-->[\s\S]*?<!--\/seo-->\n?/, '');
        const a = o ? (await aggregate(o.id)).all : null, place = o ? placeOf(o) : '';
        const title = o ? (o.demo ? `${o.name} — Rate Your Judge Colorado` : profileTitle(o)) : 'Rate Your Judge Colorado';
        const desc = o ? (a && !a.hidden ? `${place}. ${a.overall.toFixed(1)} out of 5 from ${a.n} ratings by people who were in the courtroom. Read every rating and comment, or add yours: anonymous, 30 seconds.`
          : a && a.n ? `${place}. ${a.n} ${a.n === 1 ? 'rating' : 'ratings'} so far from people who were in the courtroom. Read what they said, or add yours: anonymous, 30 seconds.`
          : `${place}. No ratings yet. Be the first to rate ${o.name}: anonymous, 30 seconds, from your phone.`) : 'Rate a Colorado judge or prosecutor in 30 seconds. Anonymous.';
        const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const real = o && !o.demo, court = o ? courtById.get(o.court_id) : null, url1 = `https://rateyourjudgecolorado.com/p/${o ? o.id : ''}`;
        const head = `<head>\n<base href="/">\n<meta name="robots" content="${real ? 'index, follow' : 'noindex'}">\n<meta name="description" content="${esc(desc)}">\n<link rel="canonical" href="${real ? url1 : 'https://rateyourjudgecolorado.com/'}">\n<meta property="og:title" content="${esc(title)}">\n<meta property="og:description" content="${esc(desc)}">\n<meta property="og:type" content="profile">\n<meta property="og:site_name" content="Rate Your Judge Colorado"><meta property="og:url" content="${real ? url1 : 'https://rateyourjudgecolorado.com/'}">\n<meta property="og:image" content="https://rateyourjudgecolorado.com/img/og-card.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">\n<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="https://rateyourjudgecolorado.com/img/og-card.jpg">`;
        html = html.replace(/<!--seo-->[\s\S]*?<!--\/seo-->\n?/, '')                // the home page's own SEO block would repeat (and contradict) the profile's: second canonical, second description
          .replace('<head>', () => head).replace(/<title>.*?<\/title>/, () => `<title>${esc(title)}</title>`);   // function replacers: no $-pattern injection
        if (real) {                                                     // indexable profile: own canonical, structured data, and the whole profile as text before JavaScript runs
          const bareName = o.name.replace(/^(Judge|Justice|Deputy DA|District Attorney)\s+/, ''), job = o.title ? o.title.replace(/,.*/, '') : o.type === 'judge' ? 'Judge' : o.name.startsWith('Deputy') ? 'Deputy District Attorney' : 'District Attorney';
          const ap = await appealsOf(o), op = await opinionsOf(o), cms = await publicComments(o.id, '');
          const AP = { affirmed: 'affirmed', affirmed_in_part: 'partly affirmed', reversed: 'reversed', vacated: 'vacated', disapproved: 'ruling disapproved', remanded: 'sent back', dismissed: 'appeal dismissed' };
          const QL = o.type === 'judge' ? ['Let each side be heard', 'Treated both sides the same', 'Respectful to everyone', 'Clear decisions', 'On time'] : ['Respectful to everyone', 'Prepared', 'Stuck to the facts', 'Easy to follow', 'Fair to witnesses and defendant'];
          const WHO = { party: 'In the case', observer: 'Watching', juror: 'Juror', attorney: 'Attorney or court staff', defendant: 'Defendant', plaintiff: 'Plaintiff', victim: 'Victim', witness: 'Witness', family: 'Family member', other: 'In the case' };
          const isoDay = ms => new Date(Number(ms)).toLocaleDateString('en-CA', { timeZone: 'America/Denver' }), longDay = ms => new Date(Number(ms)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Denver' });
          const counts = (x, M) => Object.keys(M).filter(k => x.counts[k]).map(k => `${x.counts[k]} ${M[k]}`).join(', ');
          const scores = a && !a.hidden ? `<h2>Scores</h2><ul><li>Overall: ${a.overall.toFixed(1)} out of 5</li>${METRICS.map((m, i) => a[m] ? `<li>${QL[i]}: ${a[m].toFixed(1)} out of 5</li>` : '').join('')}</ul>`
            : a && a.n ? `<p>Scores appear once there are ${MIN_N} ratings.</p>` : '';
          // comment TEXT only once a moderator has read it; an unreviewed comment is shown to people with a "Not reviewed yet" mark, never quoted to search engines
          const list = cms.length ? `<h2>Every rating</h2><ul class="ssr-ratings">${cms.map(c => { const txt = c.status === 'published' && c.text ? c.text : '';
            return `<li><p><b>${esc(WHO[c.subrole] || WHO[c.role] || 'Rating')}</b> · <time datetime="${isoDay(c.at)}">${longDay(c.at)}</time>${c.overall != null ? ` · overall ${c.overall} out of 5` : ''}${txt ? ' · reviewed by a moderator' : ''}</p>${txt ? `<blockquote>${esc(txt)}</blockquote>` : ''}</li>`; }).join('')}</ul>` : '';
          const apLine = ap ? `<p>Colorado Court of Appeals decisions on this judge’s rulings announced since June 2023: ${ap.items.length} (${counts(ap, AP)}).</p>` : '';
          const opLine = op ? `<p>Colorado Court of Appeals decisions this judge wrote: ${op.items.length} (${counts(op, AP)}).</p>` : '';
          const last = cms.length ? Math.max(...cms.map(c => c.at)) : 0;
          const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'ProfilePage', url: url1, name: title, description: desc, ...(last ? { dateModified: new Date(last).toISOString() } : {}),
            isPartOf: { '@type': 'WebSite', name: 'Rate Your Judge Colorado', url: 'https://rateyourjudgecolorado.com/' },
            breadcrumb: crumbsLd([['Rate Your Judge Colorado', SITE + '/'], ['Judges and prosecutors', `${SITE}/judges`], [court.name, `${SITE}/judges/${court.id}`], [o.name, url1]]),
            mainEntity: { '@type': 'Person', name: bareName, jobTitle: job,
              worksFor: { '@type': 'GovernmentOrganization', name: o.title ? o.title.replace(/^[^,]*,\s*/, '') : o.type === 'judge' ? (o.scope === 'district' ? `Colorado ${place}` : court.name + ' courts') : `District Attorney, ${ordEn(Number(court.district))} Judicial District of Colorado`, address: court.address } } }).replace(/</g, '\\u003c');
          html = html.replace(/<link rel="canonical"[^>]*>/, () => `<link rel="canonical" href="${url1}">`)
            .replace('</head>', () => `<script type="application/ld+json">${ld}</script>\n</head>`)
            .replace(/(<main id="app"[^>]*><!--ssr-->)[\s\S]*?(<\/main>)/, (m0, a1, a3) => `${a1}<div class="card doc"><nav aria-label="Breadcrumb"><a href="/judges">Judges and prosecutors</a> › <a href="/judges/${court.id}">${esc(court.name)}</a></nav><h1>${esc(o.name)}</h1><p>${esc(job)} · ${esc(place)}${o.title ? '' : ', Colorado'} · ${esc(court.address)}</p><p>${esc(desc)}</p>${scores}${list}${apLine}${opLine}<p><a href="/p/${o.id}">Rate ${esc(o.name)}</a> · <a href="/how.html">How it works</a> · <a href="/method.html">Our method</a></p></div>${a3}`);
        }
        res.writeHead(o ? 200 : 404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(html);
      }
      if (url.pathname === '/sitemap.xml') {                                  // static pages (build-seo.mjs) + every real official's profile
        const base = fs.readFileSync(path.join(ROOT, 'public', 'sitemap.xml'), 'utf8');
        const rows = await db.prepare("SELECT o.id, o.checked, MAX(r.created_at) last FROM officials o LEFT JOIN reviews r ON r.official_id = o.id WHERE o.demo = 0 GROUP BY o.id, o.checked ORDER BY o.id").all();
        const dir = [`  <url><loc>${SITE}/judges</loc></url>`, `  <url><loc>${SITE}/prosecutors</loc></url>`, ...courts.map(c => `  <url><loc>${SITE}/judges/${c.id}</loc></url>`)].join('\n') + '\n';   // the directory: lastmod left out, it changes with every rating
        const urls = dir + rows.map(r => `  <url><loc>https://rateyourjudgecolorado.com/p/${r.id}</loc><lastmod>${r.last ? new Date(Number(r.last)).toISOString().slice(0, 10) : (r.checked || '2026-10-15')}</lastmod></url>`).join('\n');
        res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(base.replace('</urlset>', () => urls + '\n</urlset>'));
      }
      let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
      if (p === '/' || p === '.') p = '/index.html';
      const file = path.join(ROOT, 'public', p);
      if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': p.startsWith('/fonts/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      if (!['aborted', 'closed', 'too large', 'bad body'].includes(e.message)) console.error(e);
      const dbDown = e.code && !/^22/.test(String(e.code)) && (/^[0-9A-Z]{5}$/.test(String(e.code)) || /^E(CONNREFUSED|CONNRESET|NOENT|PIPE)$/.test(String(e.code)));   // pg class 22 = bad input from the client
      if (!res.headersSent) json(res, e.message === 'too large' ? 413 : dbDown ? 503 : 400, { error: dbDown ? 'temporarily unavailable, try again in a minute' : 'bad request' });
    }
  };
}
function listen(isMod, port) {
  const s = http.createServer(makeHandler(isMod));
  s.requestTimeout = 30000; s.headersTimeout = 15000; s.keepAliveTimeout = 5000; s.maxHeadersCount = 60;
  s.listen(port, '127.0.0.1', () => console.log(`Rate Your Judge Colorado — ${isMod ? 'MODERATOR' : 'PUBLIC'} listener on 127.0.0.1:${port} (publish=${PUBLISH_MODE}, minN=${MIN_N})`));
}
listen(false, PORT);
if (MOD_PORT) listen(true, MOD_PORT);
