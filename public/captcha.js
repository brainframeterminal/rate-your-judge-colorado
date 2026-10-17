// Proof-of-work puzzle (self-hosted, no third party). Solved quietly in the background while the person fills in the form.
let next = null;
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function solve() {
  const r = await fetch('/api/challenge'); if (!r.ok) throw new Error('challenge');
  const c = await r.json(); if (c.off) return '';
  const enc = new TextEncoder();
  for (let from = 0; from <= c.maxnumber; from += 256) {
    const batch = await Promise.all(Array.from({ length: Math.min(256, c.maxnumber - from + 1) }, (_, i) => crypto.subtle.digest('SHA-256', enc.encode(c.salt + (from + i))).then(hex)));
    const hit = batch.indexOf(c.challenge);
    if (hit >= 0) return btoa(JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number: from + hit, salt: c.salt, signature: c.signature }));
  }
  throw new Error('unsolved');
}
export function prefetchCaptcha() { next ||= solve().catch(() => { next = null; return ''; }); }
export async function captchaHeader() { prefetchCaptcha(); const v = await next; next = null; return v || (await solve().catch(() => '')); }
