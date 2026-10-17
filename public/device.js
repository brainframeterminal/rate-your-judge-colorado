// The anonymous device token is issued and signed by the server (a client cannot invent one). Stored only on this phone.
const KEY = 'jx_dev2', OK = /^[a-f0-9]{16}\.[a-f0-9]{16}$/;
let device = ''; try { device = localStorage.getItem(KEY) || ''; } catch {}
let pending = null;
export function resetDevice() { device = ''; try { localStorage.removeItem(KEY); } catch {} }   // the server no longer accepts it (e.g. its signing key was rotated)
export function currentDevice() { return OK.test(device) ? device : ''; }
export async function getDevice() {
  if (OK.test(device)) return device;
  pending ||= fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('session'))).then(j => { device = j.device; try { localStorage.setItem(KEY, device); } catch {} return device; })
    .finally(() => { pending = null; });
  return pending;
}
