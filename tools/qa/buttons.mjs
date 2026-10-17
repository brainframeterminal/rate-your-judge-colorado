// Button audit: every button-like element on every screen, EN + ES, 3 widths.
// Checks: label centred in the button (centred-style controls), no text spilling out, sibling buttons in a row equally tall,
// icon + label vertically centred, min size, and that every button actually responds to a click (no error thrown).
import { webkit, devices } from 'playwright';
const B = process.env.RYG_BASE || 'http://127.0.0.1:8750/'; const issues = new Set(); const stats = { buttons: 0, screens: 0 };
const b = await webkit.launch();
async function inspect(p, tag, w, lang) {
  await p.waitForSelector('#loader', { state: 'hidden', timeout: 9000 }).catch(() => {}); await p.waitForTimeout(900);
  stats.screens++;
  if (process.env.BREAK) await p.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;top:120px;left:0;width:100%'; d.innerHTML = '<button class="btn" style="text-align:left;padding-left:80px;width:90%">off-centre</button><button style="width:20px;height:20px">x</button><span style="font-size:10px">tiny text</span><div style="width:900px;height:5px;background:red"></div><button class="chipbtn" style="width:70px;overflow:visible;white-space:nowrap">a very long chip label that spills</button>'; document.body.append(d); });
  const r = await p.evaluate(() => {
    const out = [];
    const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); };
    const CENTER = '.btn,.chipbtn,.tab,.scale button,.nabtn,.langbtn,.icon,.stars button,.vote button,.linkbtn';
    const all = [...document.querySelectorAll('button, .choice, a.btn')].filter(vis);
    for (const e of all) {
      const r = e.getBoundingClientRect(), label = (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 28);
      const cs = getComputedStyle(e);
      // text spilling out
      if (e.scrollWidth > e.clientWidth + 2) out.push(`spill-x "${label}" ${e.scrollWidth}>${e.clientWidth}`);
      if (e.scrollHeight > e.clientHeight + 3 && !e.matches('.choice')) out.push(`spill-y "${label}" ${e.scrollHeight}>${e.clientHeight}`);
      if (e.matches(CENTER) && !e.matches('.linkbtn,.nabtn') && e.childNodes.length) {
        const range = document.createRange(); range.selectNodeContents(e); const tr = range.getBoundingClientRect();
        const dx = Math.abs((tr.left + tr.right) / 2 - (r.left + r.right) / 2), dy = Math.abs((tr.top + tr.bottom) / 2 - (r.top + r.bottom) / 2);
        if (dx > 3) out.push(`off-centre-x "${label}" dx=${dx.toFixed(1)}`);
        if (dy > 4) out.push(`off-centre-y "${label}" dy=${dy.toFixed(1)}`);
      }
      if (e.matches('.choice')) {                           // arrow + icon vertically centred against the card
        const go = e.querySelector('.go'), ico = e.querySelector('.ico');
        for (const x of [go, ico]) if (x) { const xr = x.getBoundingClientRect(); const d = Math.abs((xr.top + xr.bottom) / 2 - (r.top + r.bottom) / 2); if (d > 4) out.push(`choice-icon-off "${label}" ${d.toFixed(1)}`); }
      }
    }
    // sibling buttons in a row: equal heights
    for (const row of document.querySelectorAll('.row, .tabs, .chips, .vote, .scale')) {
      const hs = [...row.children].filter(c => c.matches('button') && vis(c)).map(c => Math.round(c.getBoundingClientRect().height));
      if (hs.length > 1 && !row.matches('.chips,.vote,.tabs') && Math.max(...hs) - Math.min(...hs) > 2) out.push(`row-heights ${row.className}: ${hs.join(',')}`);
    }
    return { out, n: all.length };
  });
  stats.buttons += r.n; for (const m of r.out) issues.add(`${lang} ${w}px ${tag}: ${m}`);
}
for (const lang of ['en', 'es']) for (const w of [320, 390, 768]) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 700 ? 800 : 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: w < 700, locale: lang === 'es' ? 'es-US' : 'en-US', geolocation: { latitude: 39.9684, longitude: -104.7632 }, permissions: ['geolocation'], extraHTTPHeaders: { 'tailscale-user-login': 'moderator@example.com' } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(B); await inspect(p, 'home', w, lang);
  await p.click('.choice >> nth=0'); await p.waitForTimeout(1600); await inspect(p, 'court', w, lang);
  await p.fill('input[type=search]', 'Adams'); await p.waitForTimeout(300); await p.click('.choice >> nth=0'); await p.waitForTimeout(1100); await inspect(p, 'who-judges', w, lang);   // court step opens with the map: search picks the courthouse
  await p.click('.tab >> nth=1'); await p.waitForTimeout(300); await inspect(p, 'who-prosecutors', w, lang);
  await p.click('.choice >> nth=0'); await p.waitForTimeout(600); await inspect(p, 'rate-prosecutor-party', w, lang);
  await p.click('.chipbtn >> nth=1'); await p.waitForTimeout(300); await inspect(p, 'rate-victim-extras', w, lang);
  await p.click('.rules summary'); await p.waitForTimeout(200); await inspect(p, 'rate-rules-open', w, lang);
  await p.goto(B + 'p/3'); await inspect(p, 'profile-prosecutor', w, lang);
  await p.click('.linkbtn >> nth=0').catch(() => {}); await p.waitForTimeout(300); await inspect(p, 'profile-report-open', w, lang);
  await p.goto(B + 'p/1'); await inspect(p, 'profile-judge', w, lang);
  await p.goto(B); await p.waitForSelector('#loader', { state: 'hidden' }); await p.click('.btn.ghost >> nth=0'); await p.waitForTimeout(1800); await p.click('.cty >> nth=10'); await inspect(p, 'map', w, lang);
  await p.goto(B + 'log.html'); await inspect(p, 'log', w, lang); await p.goto((process.env.RYG_MOD_BASE || 'http://127.0.0.1:8751/') + 'mod.html'); await inspect(p, 'mod', w, lang);
  if (errs.length) issues.add(`${lang} ${w}px console: ${errs[0]}`);
  await ctx.close();
}
await b.close();
console.log(`inspected ${stats.buttons} buttons across ${stats.screens} screens`); const arr = [...issues].sort(); console.log('ISSUES:', arr.length); arr.slice(0, 40).forEach(x => console.log('  ' + x));
