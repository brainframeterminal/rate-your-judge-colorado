// Black-box security tests against throw-away server instances (own DB, own ports). Run: node tools/qa/security-tests.mjs
import { spawn, execSync } from 'node:child_process';
import { totpAt } from '../../modauth.js'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
const ROOT = new URL('../..', import.meta.url).pathname, res = [];
const ok = (n, c, d = '') => res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
function start(env, port, mport) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jxsec-')); fs.writeFileSync(path.join(dir, 'secret.txt'), 'test-secret-' + port);
  const pgEnv = {}; if (process.env.TEST_PG) { const dbn = 'jxsec_' + port + '_' + Date.now(); execSync(`createdb ${dbn}`); pgEnv.DATABASE_URL = `postgresql://${process.env.USER || 'rate'}@/${dbn}?host=/var/run/postgresql`; }   // TEST_PG=1: each instance gets its own throw-away Postgres database
  const p = spawn('node', ['--no-warnings', process.env.SERVER_JS || path.join(ROOT, 'server.js')], { env: { ...process.env, ...pgEnv, PORT: String(port), MOD_PORT: String(mport), JUDEX_DB: path.join(dir, 'j.db'), JUDEX_SECRET: 'test-secret-' + port, TRUST_PROXY: '1', ...env }, stdio: 'ignore' });
  return { p, dir, env: { ...process.env, ...pgEnv, JUDEX_DB: path.join(dir, 'j.db') } };
}
const req = (port, method, url, { headers = {}, body, raw } = {}) => new Promise(resolve => {
  const r = http.request({ host: '127.0.0.1', port, method, path: url, headers: { host: `127.0.0.1:${port}`, ...headers } }, rs => { let b = ''; rs.on('data', d => b += d); rs.on('end', () => { let j = null; try { j = JSON.parse(b); } catch {} resolve({ status: rs.statusCode, json: j, text: b, headers: rs.headers }); }); });
  r.on('error', e => resolve({ status: 0, text: String(e) })); if (body !== undefined) r.write(raw ? body : JSON.stringify(body)); r.end();
});
const J = { 'content-type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const A = start({ SEED_DEMO: '1', PUBLISH_MODE: 'peer' }, 8760, 8761), B = start({ SEED_DEMO: '0', PUBLISH_MODE: 'mod' }, 8762, 8763), C = start({ SEED_DEMO: '1', PUBLISH_MODE: 'mod', CAPTCHA: '1' }, 8774, 8775);
process.on('exit', () => [A, B, C].forEach(x => { try { x.p.kill(); } catch {} }));   // never leave orphan instances behind if a test throws
await sleep(process.env.TEST_PG ? 9000 : 1800);
const P = 8760, M = 8761;
function addMod(inst, email, name) { const out = execSync(`node ${ROOT}tools/mod-admin.mjs add ${email} "${name}"`, { env: inst.env, encoding: 'utf8' }); return { email, pw: out.match(/One-time password: (\S+)/)[1], totp: out.match(/Secret: (\S+)/)[1] }; }
const modLogin = (port, m, over = {}) => req(port, 'POST', '/api/mod/login', { headers: { ...J, ...xff('9.9.9.9') }, body: { email: m.email, password: m.pw, code: totpAt(m.totp, Date.now()), ...over } });
const cookieFrom = r => String(r.headers['set-cookie'] || '').split(';')[0];
const xff = ip => ({ 'x-forwarded-for': ip });
const session = async (ip = '9.9.9.1') => (await req(P, 'POST', '/api/session', { headers: { ...J, ...xff(ip) }, body: {} })).json.device;

// 1) device tokens must be server-issued
const forged = 'a'.repeat(16) + '.' + 'b'.repeat(16);
let r = await req(P, 'POST', '/api/review', { headers: { ...J, ...xff('1.1.1.1') }, body: { official: 1, role: 'party', q1: 4, q2: 4, q3: 4, q4: 4, q5: 4, overall: 4, device: forged } });
ok('forged device token rejected', r.status === 401 && r.json.code === 'device');   // 401 + code since 10-16: the page renews the token
r = await req(P, 'POST', '/api/review', { headers: { ...J, ...xff('1.1.1.1') }, body: { official: 1, role: 'party', q1: 4, q2: 4, q3: 4, q4: 4, q5: 4, overall: 4, device: 'a'.repeat(32) } });
ok('old client-minted 32-hex token rejected', r.status === 401 && r.json.code === 'device');
// 2) session issuing is limited per network
let last; for (let i = 0; i < 70; i++) last = await req(P, 'POST', '/api/session', { headers: { ...J, ...xff('7.7.7.7') }, body: {} });
ok('session issuing limited (≤60/day per network)', last.status === 429);
// 3) spoofing the LEFT side of X-Forwarded-For must not create new rate buckets
const d1 = await session('8.8.8.8');
let got429 = false; for (let i = 0; i < 260; i++) { const q = await req(P, 'GET', '/api/search?q=pr', { headers: { ...xff(`1.2.${i % 250}.${i % 200}, 8.8.8.8`) } }); if (q.status === 429) { got429 = true; break; } }
ok('rate limit keyed on the trusted hop: 260 searches with spoofed LEFT xff entries hit one bucket', got429);
const other = await req(P, 'GET', '/api/search?q=pr', { headers: { ...xff('5.5.5.5') } }); ok('a different network is not affected', other.status === 200);
// 4) moderator surface
r = await req(P, 'GET', '/api/mod/pending', { headers: { 'tailscale-user-login': 'moderator@example.com' } }); ok('moderator API is 404 on the PUBLIC listener even with the identity header', r.status === 404);
r = await req(P, 'POST', '/api/mod/login', { headers: { ...J }, body: { email: 'a@b.c', password: 'x', code: '123456' } }); ok('moderator login does not exist on the PUBLIC listener', r.status === 404);
r = await req(P, 'GET', '/mod.html'); ok('mod.html not served on the public listener', r.status === 404);
r = await req(M, 'GET', '/api/mod/pending'); ok('moderator listener refuses without identity (401)', r.status === 401);
r = await req(M, 'GET', '/api/mod/pending', { headers: { 'tailscale-user-login': 'moderator@example.com' } }); ok('the old proxy identity header no longer grants anything', r.status === 401);
const mod1 = addMod(A, 'mod1@example.com', 'Test Mod');
r = await modLogin(M, mod1, { password: 'wrong-password' }); ok('wrong password refused', r.status === 401);
r = await modLogin(M, mod1, { code: '000000' }); ok('wrong one-time code refused', r.status === 401);
r = await modLogin(M, mod1); const ck = cookieFrom(r); ok('correct password + code signs in and sets a session cookie', r.status === 200 && ck.startsWith('modsess='));
const MH = { Cookie: ck };
r = await req(M, 'GET', '/api/mod/pending', { headers: MH }); ok('moderator listener accepts the session cookie', r.status === 200);
r = await req(M, 'GET', '/api/mod/pending', { headers: { Cookie: ck.slice(0, -3) + 'abc' } }); ok('tampered session cookie refused', r.status === 401);
r = await req(M, 'GET', '/api/mod/summary', { headers: MH }); ok('live summary available to a signed-in moderator', r.status === 200 && typeof r.json.pending === 'number');
for (let i = 0; i < 5; i++) await modLogin(M, mod1, { password: 'nope' + i });
r = await modLogin(M, mod1); ok('account locks after 5 failures (even with the right password)', r.status === 429);
execSync(`node ${ROOT}tools/mod-admin.mjs revoke ${mod1.email}`, { env: A.env });
r = await req(M, 'GET', '/api/mod/pending', { headers: MH }); ok('revoking a moderator ends their existing sessions', r.status === 401);
const mod2 = addMod(A, 'mod2@example.com', 'Second Mod'); { const l = await req(M, 'POST', '/api/mod/login', { headers: { ...J, ...xff('9.9.9.8') }, body: { email: mod2.email, password: mod2.pw, code: totpAt(mod2.totp, Date.now()) } }); globalThis.MH2 = { Cookie: cookieFrom(l) }; }
r = await modLogin(M, { email: 'nobody@example.com', pw: 'x', totp: 'AAAA' }); ok('unknown account refused with the same answer', r.status === 401);
r = await req(M, 'GET', '/mod.html'); ok('mod.html served on the moderator listener', r.status === 200);
// 5) CSRF / Host / content-type
r = await req(P, 'POST', '/api/session', { headers: { 'content-type': 'text/plain', ...xff('2.2.2.2') }, body: '{}', raw: true }); ok('text/plain POST refused (415)', r.status === 415);
r = await req(P, 'POST', '/api/session', { headers: { ...J, origin: 'https://evil.example', ...xff('2.2.2.2') }, body: {} }); ok('cross-origin POST refused (403)', r.status === 403);
r = await req(P, 'POST', '/api/session', { headers: { ...J, 'sec-fetch-site': 'cross-site', ...xff('2.2.2.2') }, body: {} }); ok('Sec-Fetch-Site: cross-site refused', r.status === 403);
r = await req(P, 'POST', '/api/review', { headers: { ...J, ...xff('2.2.2.3') }, body: 'null', raw: true }); ok('JSON null body → 400, not a crash', r.status === 400);
// 6) trust model: eligibility, flagged stays hidden, moderator approval cannot be undone by reports
const dev = [await session('3.3.3.1'), await session('3.3.3.2'), await session('3.3.3.3'), await session('3.3.3.4')];
const rate = (device, official, extra = {}) => req(P, 'POST', '/api/review', { headers: { ...J, ...xff('3.3.3.9'), 'x-device': device }, body: { official, role: 'observer', q1: 4, q2: 4, q3: 4, q4: 4, q5: 4, overall: 4, ...extra } });
r = await rate(dev[0], 40, { comment: 'Test comment about courtroom conduct.' }); const rid = r.json.id; ok('rating with a comment accepted', r.status === 200 && rid > 0);
r = await req(P, 'POST', '/api/report', { headers: { ...J, ...xff('3.3.3.5'), 'x-device': dev[3] }, body: { review: rid, reason: 'x' } }); ok('report by a device that never rated is refused', r.status === 403);
await rate(dev[1], 41); await rate(dev[2], 42);
r = await req(P, 'POST', '/api/vote', { headers: { ...J, ...xff('3.3.3.6'), 'x-device': dev[1] }, body: { review: rid, vote: 1 } }); ok('eligible device may confirm', r.status === 200);
r = await req(P, 'POST', '/api/vote', { headers: { ...J, ...xff('3.3.3.7'), 'x-device': dev[2] }, body: { review: rid, vote: 1 } });
r = await req(P, 'GET', '/api/officials/40', { headers: { ...xff('3.3.3.8') } }); ok('two confirmations publish (peer mode)', (r.json.comments.find(c => c.id === rid) || {}).status === 'published');
await req(P, 'POST', '/api/report', { headers: { ...J, ...xff('3.3.3.10'), 'x-device': dev[1] }, body: { review: rid, reason: 'x' } }); await req(P, 'POST', '/api/report', { headers: { ...J, ...xff('3.3.3.11'), 'x-device': dev[2] }, body: { review: rid, reason: 'x' } });
r = await req(P, 'GET', '/api/officials/40'); { const c = r.json.comments.find(x => x.id === rid); ok('two eligible reports hide a published comment', !c || (!c.text && !c.hasText)); }   // since 10-16 every rating is listed; the reported TEXT must be gone
const dec = await req(M, 'POST', '/api/mod/decide', { headers: { ...J, ...globalThis.MH2 }, body: { review: rid, status: 'published', note: 'ok' } }); ok('moderator can republish', dec.status === 200);
await req(P, 'POST', '/api/report', { headers: { ...J, ...xff('3.3.3.12'), 'x-device': dev[1] }, body: { review: rid, reason: 'again' } }); await req(P, 'POST', '/api/report', { headers: { ...J, ...xff('3.3.3.13'), 'x-device': dev[2] }, body: { review: rid, reason: 'again' } });
r = await req(P, 'GET', '/api/officials/40'); ok('new reports cannot undo a moderator\'s approval', !!((r.json.comments.find(c => c.id === rid) || {}).text));
r = await req(P, 'POST', '/api/vote', { headers: { ...J, ...xff('3.3.3.14'), 'x-device': dev[3] }, body: { review: rid, vote: 1 } }); ok('votes on non-pending comments refused', r.status === 403 || r.status === 409);
// 7) repeat rating, small-group privacy
r = await rate(dev[0], 40); ok('same device cannot rate the same official again within 30 days', r.status === 409);
const courtsList = (await req(P, 'GET', '/api/courts')).json; const empty = (await req(P, 'GET', '/api/officials?court=' + courtsList[4].id)).json[0];
r = await req(P, 'GET', '/api/officials/' + empty.id); ok('stats hidden while a person has 0 ratings', r.json.stats.all.hidden === true);
for (let i = 0; i < 3; i++) await rate(await session(`6.6.6.${i}`), empty.id);
r = await req(P, 'GET', '/api/officials/' + empty.id); ok('stats still hidden at 3 of 5 ratings', r.json.stats.all.hidden === true && r.json.stats.all.n === 3);
for (let i = 3; i < 5; i++) await rate(await session(`6.6.6.${i}`), empty.id);
r = await req(P, 'GET', '/api/officials/' + empty.id); ok('stats appear at 5 ratings', r.json.stats.all.hidden === undefined && r.json.stats.all.n === 5);
r = await req(P, 'GET', '/api/officials/1'); ok('seeded demo profile (n≥5) shows scores', r.json.stats.all.hidden === undefined);
// 8) token in header is not logged in the URL; path traversal; prefix check
r = await req(P, 'GET', '/..%2fdata%2fsecret.txt'); ok('path traversal refused', r.status === 404);
r = await req(P, 'GET', '/%2e%2e/public-old/x'); ok('prefix escape refused', r.status === 404);
// 9) moderator-only mode: pending text never exposed, votes disabled
const bs = async ip => (await req(8762, 'POST', '/api/session', { headers: { ...J, ...xff(ip) }, body: {} })).json.device;
const MODEMOD = 8763;
const modAdd = await req(MODEMOD, 'GET', '/api/officials?court=adams-adams-county'); ok('production-style instance (no demo) starts with an empty roster', Array.isArray(modAdd.json) && modAdd.json.length === 0);
r = await req(8762, 'POST', '/api/vote', { headers: { ...J, ...xff('4.4.4.4'), 'x-device': await bs('4.4.4.4') }, body: { review: 1, vote: 1 } }); ok('peer confirmation is OFF in moderator mode', r.status === 403);
// 10) headers
r = await req(P, 'GET', '/'); ok('security headers present', !!r.headers['content-security-policy'] && r.headers['x-content-type-options'] === 'nosniff' && r.headers['referrer-policy'] === 'no-referrer');
// 11) proof-of-work captcha: required, single-use, unforgeable
{
  const crypto = await import('node:crypto'); const sha = x => crypto.createHash('sha256').update(x).digest('hex');
  const solve = async () => { const c = (await req(8774, 'GET', '/api/challenge', { headers: xff('6.6.6.6') })).json; let n = 0; while (sha(c.salt + n) !== c.challenge) n++; return { c, hdr: Buffer.from(JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number: n, salt: c.salt, signature: c.signature })).toString('base64') }; };
  const dev = (await req(8774, 'POST', '/api/session', { headers: { ...J, ...xff('6.6.6.6') }, body: {} })).json.device;
  const body = { official: 2, role: 'party', q1: 4, q2: 4, q3: 4, q4: 4, q5: 4, overall: 4 };
  const go = h => req(8774, 'POST', '/api/review', { headers: { ...J, ...xff('6.6.6.6'), 'x-device': dev, ...(h ? { 'x-captcha': h } : {}) }, body });
  ok('submission without a solved puzzle is refused', (await go('')).status === 400);
  const { c, hdr } = await solve();
  const forged = Buffer.from(JSON.stringify({ algorithm: 'SHA-256', challenge: c.challenge, number: 0, salt: c.salt, signature: 'x'.repeat(64) })).toString('base64');
  ok('forged puzzle answer is refused', (await go(forged)).status === 400);
  ok('a solved puzzle is accepted', (await go(hdr)).status === 200);
  const rp = await req(8774, 'POST', '/api/feedback', { headers: { ...J, ...xff('6.6.6.6'), 'x-device': dev, 'x-captcha': hdr }, body: { text: 'again' } });
  ok('the same solved puzzle cannot be replayed', rp.status === 400);
  ok('challenge difficulty is bounded', c.maxnumber <= 400000);
}
for (const x of [A, B, C]) { x.p.kill(); fs.rmSync(x.dir, { recursive: true, force: true }); }
console.log(res.join('\n')); console.log(res.filter(x => x.startsWith('FAIL')).length ? 'SOME FAILED' : 'ALL PASSED');
