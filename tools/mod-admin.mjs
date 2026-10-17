#!/usr/bin/env node
// Moderator accounts.  node tools/mod-admin.mjs add <email> "<Name>" | list | disable <email> | enable <email> | reset <email> | revoke <email>
// Uses the same database as the server (DATABASE_URL, else JUDEX_DB / data/judex.db). Prints a one-time password and the authenticator setup URL.
import crypto from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { openDb } from '../db.js'; import { b32, scrypt } from '../modauth.js';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = await openDb({ url: process.env.DATABASE_URL, file: process.env.JUDEX_DB || path.join(ROOT, 'data', 'judex.db') });
const [cmd, emailRaw, ...rest] = process.argv.slice(2), email = String(emailRaw || '').trim().toLowerCase();
const creds = async () => { const pw = crypto.randomBytes(12).toString('base64url'), salt = crypto.randomBytes(16).toString('hex'), totp = b32(crypto.randomBytes(20)); return { pw, salt, hash: await scrypt(pw, salt), totp }; };
const show = (email, c) => console.log(`\nAccount: ${email}\nOne-time password: ${c.pw}   (change nothing — give it to the moderator over a private channel)\nAuthenticator setup (any TOTP app): otpauth://totp/Rate%20Your%20Judge%20Colorado:${encodeURIComponent(email)}?secret=${c.totp}&issuer=Rate%20Your%20Judge%20Colorado\nSecret: ${c.totp}\n`);
if (cmd === 'add' && email && rest.length) {
  const c = await creds();
  await db.prepare('INSERT INTO mods (email, name, pw_salt, pw_hash, totp, created_at) VALUES (?,?,?,?,?,?)').run(email, rest.join(' ').slice(0, 60), c.salt, c.hash, c.totp, Date.now()); show(email, c);
} else if (cmd === 'reset' && email) {
  const c = await creds(); const r = await db.prepare('UPDATE mods SET pw_salt = ?, pw_hash = ?, totp = ?, ver = ver + 1 WHERE email = ?').run(c.salt, c.hash, c.totp, email);
  r.changes ? show(email, c) : console.log('no such moderator');
} else if (['disable', 'enable', 'revoke'].includes(cmd) && email) {
  const r = await db.prepare(cmd === 'revoke' ? 'UPDATE mods SET ver = ver + 1 WHERE email = ?' : 'UPDATE mods SET active = ? WHERE email = ?').run(...(cmd === 'revoke' ? [email] : [cmd === 'enable' ? 1 : 0, email]));
  console.log(r.changes ? `${cmd}: ok` : 'no such moderator');
} else if (cmd === 'list') {
  for (const m of await db.prepare('SELECT email, name, active, created_at, last_login FROM mods ORDER BY id').all()) console.log(`${m.active ? '✔' : '✖'} ${m.email} — ${m.name} — last login ${m.last_login ? new Date(m.last_login).toISOString() : 'never'}`);
} else console.log('usage: add <email> "<Name>" | list | disable|enable|revoke|reset <email>');
await db.close();
