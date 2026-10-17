// Mobile audit: every screen at 5 widths. Flags horizontal overflow, small tap targets (<44px), tiny text (<13px),
// inputs under 16px (iOS zooms the page), clipped text, console errors; plus load weight and timing on throttled 4G.
import { webkit, chromium } from 'playwright';
const B = process.env.RYG_BASE || 'http://127.0.0.1:8750/';
const VIEWS = [[320, 568], [360, 740], [390, 844], [430, 932], [768, 1024]];
const issues = {}; const add = (k, m) => { (issues[k] ||= new Set()).add(m); };
const b = await webkit.launch();
async function check(p, screen, w) {
  await p.waitForSelector('#loader', { state: 'hidden', timeout: 9000 }).catch(() => {}); await p.waitForTimeout(900);
  if (process.env.BREAK) await p.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;top:120px;left:0;width:100%'; d.innerHTML = '<button class="btn" style="text-align:left;padding-left:80px;width:90%">off-centre</button><button style="width:20px;height:20px">x</button><span style="font-size:10px">tiny text</span><div style="width:900px;height:5px;background:red"></div><button class="chipbtn" style="width:70px;overflow:visible;white-space:nowrap">a very long chip label that spills</button>'; document.body.append(d); });
  const r = await p.evaluate((w) => {
    const out = { over: [], small: [], tiny: [], inputs: [], clip: [] };
    // visually hidden on purpose (screen-reader only: 1px box + clip, e.g. the phone hero h1 since 10-15) → not a layout issue
    const srOnly = e => { for (let x = e; x && x !== document.body; x = x.parentElement) { const c = getComputedStyle(x); if (c.clipPath === 'inset(50%)' || (c.position === 'absolute' && c.overflow === 'hidden' && x.getBoundingClientRect().width <= 1)) return true; } return false; };
    const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]') && !e.closest('#loader[hidden]') && !srOnly(e); };
    if (document.documentElement.scrollWidth > w + 1) out.over.push('page scrollWidth ' + document.documentElement.scrollWidth + ' > ' + w);
    for (const e of document.querySelectorAll('main *, header *, footer *')) {
      if (!vis(e)) continue; const r = e.getBoundingClientRect();
      if (e.closest('svg') && e.tagName !== 'svg') continue;
      if (r.right > w + 1 && !e.closest('.tabs')) out.over.push(`${e.tagName}.${(e.className && e.className.baseVal === undefined ? e.className : '').toString().slice(0, 24)} right=${Math.round(r.right)}`);
    }
    for (const e of document.querySelectorAll('button, a, input, textarea, summary, [role=button], .cty')) {
      if (!vis(e)) continue; const r = e.getBoundingClientRect();
      if (e.classList.contains('cty')) continue;                       // map regions are big touch areas by nature
      if ((r.width < 44 || r.height < 44) && !(e.tagName === 'A' && e.closest('.foot')) ) out.small.push(`${e.tagName.toLowerCase()} "${(e.innerText || e.placeholder || e.getAttribute('aria-label') || '').trim().slice(0, 22)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) { const n = walker.currentNode; if (!n.textContent.trim()) continue; const e = n.parentElement; if (!e || !vis(e) || e.closest('svg')) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 13) out.tiny.push(`${fs}px "${n.textContent.trim().slice(0, 24)}"`); }
    for (const e of document.querySelectorAll('input, textarea')) { if (vis(e) && parseFloat(getComputedStyle(e).fontSize) < 16) out.inputs.push(e.tagName + ' ' + getComputedStyle(e).fontSize); }
    for (const e of document.querySelectorAll('main *')) { if (!vis(e)) continue; const cs = getComputedStyle(e); if ((cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0) out.clip.push(`${e.tagName} ${e.scrollWidth}>${e.clientWidth}`); }
    return out;
  }, w);
  for (const k of Object.keys(r)) for (const m of r[k]) add(`${screen}|${k}`, `${w}px: ${m}`);
}
for (const [w, h] of VIEWS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: w < 700, geolocation: { latitude: 39.9684, longitude: -104.7632 }, permissions: ['geolocation'], extraHTTPHeaders: { 'tailscale-user-login': 'moderator@example.com' } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(B); await check(p, 'home', w);
  await p.click('.choice >> nth=0'); await p.waitForTimeout(1600); await check(p, 'court', w);
  await p.fill('input[type=search]', 'Adams'); await p.waitForTimeout(300); await p.click('.choice >> nth=0'); await p.waitForTimeout(1200); await check(p, 'who', w);   // court step opens with the map: search picks the courthouse
  await p.click('.choice >> nth=0'); await p.waitForTimeout(700); await check(p, 'rate', w);
  await p.goto(B + 'p/1'); await check(p, 'profile', w);
  await p.goto(B); await p.waitForSelector('#loader', { state: 'hidden' }); await p.click('text=/Explore Colorado|Explora Colorado/'); await p.waitForTimeout(1800); await p.click('.cty >> nth=10'); await check(p, 'map', w);
  await p.goto(B + 'log.html'); await check(p, 'log', w); await p.goto((process.env.RYG_MOD_BASE || 'http://127.0.0.1:8751/') + 'mod.html'); await check(p, 'mod', w);
  for (const pg of ['about', 'how', 'method', 'security']) { await p.goto(B + pg + '.html'); await check(p, pg, w); }
  if (errs.length) add('console|errors', `${w}px: ${errs.slice(0, 2).join(' / ')}`);
  await ctx.close();
}
await b.close();
for (const [k, v] of Object.entries(issues).sort()) { const arr = [...v]; console.log(`${k}  (${arr.length})`); arr.slice(0, 5).forEach(x => console.log('    ' + x)); }
console.log('TOTAL issue lines:', Object.values(issues).reduce((a, s) => a + s.size, 0));
