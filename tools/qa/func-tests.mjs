import { webkit, chromium, devices } from 'playwright';
const B = process.env.RYG_BASE || 'http://127.0.0.1:8750/';
const res = []; const ok = (n, c, d = '') => { res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); if (!c) process.exitCode = 1; };   // a FAIL must fail the run (2026-10-15: two FAILs hid behind exit 0)
// 1) browser BACK walks the steps; the page never leaves the app mid-flow
let b = await webkit.launch(); let ctx = await b.newContext({ ...devices['iPhone 13'], geolocation: { latitude: 39.9684, longitude: -104.7632 }, permissions: ['geolocation'] }); let p = await ctx.newPage();
await p.goto(B); await p.waitForSelector('#loader', { state: 'hidden' }); await p.waitForTimeout(500);
await p.click('.choice >> nth=0'); await p.waitForTimeout(1500); await p.fill('input[type=search]', 'Adams'); await p.waitForTimeout(300); await p.click('.choice >> nth=0'); await p.waitForTimeout(1100);
const h1 = async () => (await p.textContent('h1')).replace(/\s+/g, ' ').trim();
ok('step 2 (who) reached', /Who are you/.test(await h1()));
await p.goBack(); await p.waitForTimeout(1500); ok('hardware back → courthouse step', /Which courthouse/.test(await h1()), await h1());
await p.goBack(); await p.waitForTimeout(900); ok('hardware back → home', /You just left a Colorado courtroom/.test(await h1()), await h1());
// 2) header ‹ button works too
await p.click('.choice >> nth=0'); await p.waitForTimeout(1500); await p.click('#back'); await p.waitForTimeout(900); ok('‹ button → home', /You just left a Colorado courtroom/.test(await h1()), await h1());
// 3) sticky Send button stays in view on a long rating form + textarea focus doesn't hide it
await p.click('.choice >> nth=0'); await p.waitForTimeout(1500); await p.fill('input[type=search]', 'Adams'); await p.waitForTimeout(300); await p.click('.choice >> nth=0'); await p.waitForTimeout(1100); await p.click('.choice >> nth=0'); await p.waitForTimeout(600);
let box = await p.locator('.cta .btn').boundingBox(); const vh = p.viewportSize().height;
ok('Send button visible without scrolling (sticky)', box && box.y + box.height <= vh && box.y >= 0, JSON.stringify(box && { y: Math.round(box.y), h: Math.round(box.height), vh }));
// 4) no horizontal scroll at 320 on the long profile page
const c2 = await b.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }); const q = await c2.newPage();
await q.goto(B + 'p/1'); await q.waitForSelector('#loader', { state: 'hidden' }); await q.waitForTimeout(900);
ok('no horizontal scroll at 320px (profile)', await q.evaluate(() => document.documentElement.scrollWidth <= 320), String(await q.evaluate(() => document.documentElement.scrollWidth)));
await q.screenshot({ path: 'send/m320-profile.png' }); await b.close();
// 5) Chromium: slow 4G first load, offline error card, console clean, manifest + icons valid
const cb = await chromium.launch(); const cc = await cb.newContext({ ...devices['Pixel 7'] }); const cp = await cc.newPage(); const errs = []; cp.on('console', m => m.type() === 'error' && errs.push(m.text())); cp.on('pageerror', e => errs.push(String(e)));
const cdp = await cc.newCDPSession(cp); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
let bytes = 0, reqs = 0; cp.on('response', async r => { try { bytes += (await r.body()).length; reqs++; } catch {} });
const t0 = Date.now(); await cp.goto(B, { waitUntil: 'load' }); const loadMs = Date.now() - t0; await cp.waitForSelector('.choice', { timeout: 15000 }); const readyMs = Date.now() - t0;
ok(`slow-4G first load interactive in ≤ 3 s`, readyMs <= 3000, `load ${loadMs} ms, first button ${readyMs} ms, ${reqs} requests, ${(bytes / 1024).toFixed(0)} KB`);
const cls = await cp.evaluate(() => new Promise(r => { let v = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) v += e.value; }).observe({ type: 'layout-shift', buffered: true }); setTimeout(() => r(v), 600); }));
ok('layout shift (CLS) < 0.1', cls < .1, cls.toFixed(3));
ok('no console errors / CSP violations', errs.length === 0, errs.slice(0, 2).join(' | '));
const man = await (await fetch(B + 'manifest.webmanifest')).json(); const ics = await Promise.all(man.icons.map(i => fetch(B + i.src).then(r => r.status)));
ok('manifest valid + icons load', man.display === 'standalone' && ics.every(s => s === 200), ics.join(','));
await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await cp.click('.choice >> nth=4').catch(() => {}); await cp.waitForTimeout(1500);
ok('offline → friendly retry card (not a blank page)', await cp.locator('text=/No connection|Try again/').count() > 0);
await cb.close();
console.log(res.join('\n'));
