// Renders the printable flyer and postcards (public/flyer.html) to vector PDFs in public/print/, English and Spanish.
//   node tools/flyer/pdf.mjs        (the server must be running; RYG_BASE overrides http://127.0.0.1:8750/)
import { chromium } from 'playwright';
import path from 'node:path';
const B = process.env.RYG_BASE || 'http://127.0.0.1:8750/', OUT = path.join(new URL('../..', import.meta.url).pathname, 'public', 'print');
const b = await chromium.launch(); const p = await b.newPage();
for (const lang of ['en', 'es']) for (const [fmt, name] of [['flyer', 'flyer'], ['cards', 'postcards']]) {
  await p.goto(`${B}flyer.html?lang=${lang}&fmt=${fmt}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
  await p.pdf({ path: path.join(OUT, `rate-your-judge-${name}-${lang}.pdf`), format: 'Letter', printBackground: true, preferCSSPageSize: true });
  console.log(`public/print/rate-your-judge-${name}-${lang}.pdf`);
}
await b.close();
