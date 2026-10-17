// Contrast audit: for every visible text node, read its colour+rect, then screenshot the screen with all text
// transparent and sample the real background (gradients included) behind each rect.
import { webkit, devices } from 'playwright';
import fs from 'node:fs';
const out = new URL('./audit/', import.meta.url).pathname;
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], geolocation: { latitude: 39.9684, longitude: -104.7632 }, permissions: ['geolocation'], extraHTTPHeaders: { 'tailscale-user-login': 'moderator@example.com' } });
const p = await ctx.newPage();
const B = process.env.RYG_BASE || 'http://127.0.0.1:8750/';
async function grab(name) {
  await p.waitForTimeout(1000);
  const items = await p.evaluate(() => {
    const res = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode; const t = n.textContent.trim(); if (!t) continue;
      const el = n.parentElement; if (!el || ['SCRIPT', 'STYLE', 'TITLE'].includes(el.tagName)) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      let op = 1, e = el; while (e) { op *= parseFloat(getComputedStyle(e).opacity); e = e.parentElement; }
      const r = document.createRange(); r.selectNodeContents(n); const rc = r.getBoundingClientRect();
      if (rc.width < 2 || rc.height < 2) continue;
      res.push({ t: t.slice(0, 40), x: rc.x + scrollX, y: rc.y + scrollY, w: rc.width, h: rc.height, color: cs.color, size: parseFloat(cs.fontSize), weight: +cs.fontWeight, op });
    }
    return res;
  });
  await p.addStyleTag({ content: '*{color:transparent!important;text-shadow:none!important;-webkit-text-fill-color:transparent!important} svg text{fill:transparent!important}' });
  await p.screenshot({ path: out + name + '.png', fullPage: true });
  fs.writeFileSync(out + name + '.json', JSON.stringify(items));
  await p.reload(); // clear injected style for the next screen
}
const go = async (u) => { await p.goto(B + u); await p.waitForTimeout(900); };
await go(''); await grab('home');
await p.click('.choice >> nth=0'); await p.waitForTimeout(1500); await grab('court');
await go(''); await p.click('.choice >> nth=0'); await p.waitForTimeout(1500); await p.click('.choice >> nth=0'); await p.waitForTimeout(900); await grab('who');
await go(''); await p.click('.choice >> nth=0'); await p.waitForTimeout(1500); await p.click('.choice >> nth=0'); await p.waitForTimeout(800); await p.click('.choice >> nth=0'); await p.waitForTimeout(600);
await p.click('.scale >> nth=0 >> button >> nth=3'); await p.click('.stars button >> nth=3'); await grab('rate');
await go(''); await p.click('.choice >> nth=4'); await p.waitForTimeout(1500); await grab('profile');
await go(''); await p.click('text=Explore Colorado'); await p.waitForTimeout(1500); await p.click('.cty >> nth=3'); await p.waitForTimeout(500); await grab('map');
await go('log.html'); await grab('log'); await p.goto((process.env.RYG_MOD_BASE || 'http://127.0.0.1:8751/') + 'mod.html'); await p.waitForTimeout(900); await grab('mod');
await b.close();
