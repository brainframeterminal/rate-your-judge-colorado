// Builds the crawler-facing files: robots.txt, sitemap.xml, llms.txt, llms-full.txt, per-page <head> SEO tags, and a pre-rendered copy of each
// page's text inside <main> (JavaScript replaces it on load; crawlers that do not run JavaScript, incl. most AI crawlers, read it as is).
// Run:  node tools/build-seo.mjs   (the server must be running on 127.0.0.1:8750).  Re-run after changing page texts.
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname, PUB = path.join(ROOT, 'public'), B = process.env.RYG_BASE || 'http://127.0.0.1:8750/', SITE = 'https://rateyourjudgecolorado.com';
const NAME = 'Rate Your Judge Colorado';
const SAME_AS = ['https://github.com/brainframeterminal/rate-your-judge-colorado', 'https://www.tiktok.com/@curiosterminal', 'https://x.com/couriosterminal', 'https://www.youtube.com/@curiousterminalco'];   // the footer's own links
const PAGES = [
  { f: 'index', url: '/', prio: '1.0', desc: 'Just left a Colorado courtroom? Rate the judge or prosecutor in 30 seconds, anonymously, from your phone. An independent, open-source public project for Colorado residents.' },
  { f: 'about', url: '/about.html', prio: '0.8', desc: 'Why this site exists: how few people take part in official judge evaluations in Colorado, and how an independent, open public project can help residents be heard.' },
  { f: 'how', url: '/how.html', prio: '0.8', desc: 'How rating a Colorado judge or prosecutor works: roles, the courthouse check, the five questions, comments reviewed by a human moderator, and every situation explained.' },
  { f: 'method', url: '/method.html', prio: '0.7', desc: 'The research behind the questions: procedural-justice studies, court-user surveys and the standards used to evaluate judges and prosecutors, with sources.' },
  { f: 'security', url: '/security.html', prio: '0.7', desc: 'Security and privacy: what we store, what we never store, how we resist fake ratings, and what can still go wrong. Stated honestly.' },
  { f: 'join', url: '/join.html', prio: '0.5', desc: 'Get involved: volunteer, program, test, translate, give legal help or spread the word about this independent Colorado public project.' },
  { f: 'terms', url: '/terms.html', prio: '0.3', desc: 'Terms of use for Rate Your Judge Colorado: the rules for rating, how comments are moderated, and the law the site rests on.' },
  { f: 'privacy', url: '/privacy.html', prio: '0.3', desc: 'Privacy policy for Rate Your Judge Colorado: what we keep, why and for how long.' },
  { f: 'corrections', url: '/corrections.html', prio: '0.3', desc: 'Corrections and removal: how a judge, prosecutor or commenter can ask for a correction, a reply or a removal.' },
];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1000, height: 900 } }); const p = await ctx.newPage();
const texts = {};
for (const pg of PAGES) {
  const file = path.join(PUB, pg.f + '.html'); let html = fs.readFileSync(file, 'utf8');
  let title = '', body = '', text = '';
  if (pg.f === 'index') {
    title = `${NAME} — rate Colorado judges and prosecutors`;
    body = `<div class="card doc"><h1>You just left a Colorado courtroom. <em>Tell us what happened.</em></h1><p>${esc(pg.desc)}</p><ul><li><a href="judges">All Colorado judges and prosecutors, by courthouse</a></li>${PAGES.slice(1, 6).map(x => `<li><a href="${x.url.slice(1)}">${esc(x.desc.split(':')[0].split('.')[0])}</a></li>`).join('')}</ul><p>JavaScript is needed to rate someone.</p></div>`;
    text = pg.desc;
  } else {
    await p.goto(B + pg.f + '.html'); await p.waitForTimeout(900);
    title = (await p.title()); body = await p.$eval('#app', e => e.innerHTML); text = await p.$eval('#app', e => e.innerText);
  }
  texts[pg.f] = { title, text };
  const ORG = { '@type': 'Organization', '@id': SITE + '/#org', name: NAME, url: SITE + '/', logo: { '@type': 'ImageObject', url: SITE + '/icons/icon-512.png', width: 512, height: 512 },
    description: 'An independent, open-source public project where people rate Colorado judges and prosecutors after a hearing.', sameAs: SAME_AS };
  const canon = SITE + pg.url, ld = pg.f === 'index'
    ? { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite', '@id': SITE + '/#site', name: NAME, url: SITE + '/', description: pg.desc, inLanguage: ['en', 'es'], publisher: { '@id': SITE + '/#org' } }, ORG] }
    : { '@context': 'https://schema.org', '@type': 'WebPage', name: title, url: canon, description: pg.desc, inLanguage: ['en', 'es'], isPartOf: { '@type': 'WebSite', '@id': SITE + '/#site', name: NAME, url: SITE + '/' } };
  const head = `<!--seo-->\n<meta name="description" content="${esc(pg.desc)}">\n<link rel="canonical" href="${canon}">\n<meta property="og:site_name" content="${NAME}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(pg.desc)}"><meta property="og:url" content="${canon}"><meta property="og:image" content="${SITE}/img/og-card.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Rate Your Judge Colorado logo: a Colorado C around a sun, mountains and a courthouse">\n<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${SITE}/img/og-card.jpg"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(pg.desc)}">\n<script type="application/ld+json">${JSON.stringify(ld)}</script>\n<!--/seo-->`;
  html = html.replace(/<!--seo-->[\s\S]*?<!--\/seo-->\n?/, '').replace(/(<title>[\s\S]*?<\/title>)/, `$1\n${head}`);
  if (pg.f === 'index') html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(/(<main id="app"[^>]*>)(<!--ssr-->[\s\S]*?<!--\/ssr-->)?/, (m, open) => `${open}<!--ssr-->${body}<!--/ssr-->`);
  fs.writeFileSync(file, html);
}
await b.close();
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(PUB, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map(x => `  <url><loc>${SITE}${x.url}</loc><lastmod>${today}</lastmod><priority>${x.prio}</priority></url>`).join('\n')}\n</urlset>\n`);
// The public READ endpoints stay open: a search engine renders a judge's page with JavaScript, and if it may not fetch the data
// it indexes an error screen instead of the judge (found 2026-10-17). Writes, tracking and the moderator API stay closed.
const READS = ['/api/officials', '/api/latest', '/api/asks', '/api/courts', '/api/districts', '/api/featured', '/api/appeals/top', '/api/log'];
fs.writeFileSync(path.join(PUB, 'robots.txt'), `# Rate Your Judge Colorado — everyone is welcome to read the public pages, including AI assistants and search engines.\nUser-agent: *\nAllow: /\n${READS.map(r => `Allow: ${r}\n`).join('')}Disallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
const link = x => `- [${texts[x.f].title.replace(/ — .*/, '')}](${SITE}${x.url}): ${x.desc}`;
fs.writeFileSync(path.join(PUB, 'llms.txt'), `# ${NAME}\n\n> An independent, open-source public project for the people of Colorado. After a hearing, a person can rate the judge or prosecutor in about 30 seconds from a phone, anonymously, in English or Spanish. Comments appear right away marked "Not reviewed yet"; an automated screen refuses insults, contact details and links and holds back possible private names, threats and accusations of crimes, and a moderator then approves, shortens or removes each comment. Scores stay hidden until at least 5 people have rated. Not affiliated with the State of Colorado, its courts or any commission.\n\nThe people listed are real Colorado officials taken from official court and district attorney lists: trial and appellate judges, Supreme Court justices, elected district attorneys and deputy district attorneys named on official pages. Ratings and comments are the opinions of the people who leave them, not statements by this project.\n\n## Profiles\n- Every official has a public profile at ${SITE}/p/<number> with their court, every rating, the moderator-reviewed comments, scores once there are 5 ratings, and for trial judges the Colorado Court of Appeals decisions on their rulings since June 2023 (public record, each linked to the opinion).\n- [All judges and prosecutors by courthouse](${SITE}/judges): one page per courthouse, each linking to every profile.\n- [District attorneys by judicial district](${SITE}/prosecutors): all 23 elected district attorneys and the deputies named on official pages.\n- The full list of profiles is also in the sitemap: ${SITE}/sitemap.xml\n- Every moderator decision is logged in public: ${SITE}/log.html\n\n## Read first\n${PAGES.slice(1, 5).map(link).join('\n')}\n\n## Participate\n- [Rate someone](${SITE}/): the rating tool (needs JavaScript; works best on a phone).\n${link(PAGES[5])}\n\n## Policies\n${PAGES.slice(6).map(link).join('\n')}\n\n## Source code\n- [rate-your-judge-colorado on GitHub](https://github.com/brainframeterminal/rate-your-judge-colorado): the full code, MIT license, including the scoring math and the comment screen.\n\n## Optional\n- [Full text of the main pages in one file](${SITE}/llms-full.txt)\n- Contact: hello@rateyourjudgecolorado.com · corrections@rateyourjudgecolorado.com · security@rateyourjudgecolorado.com\n`);
fs.writeFileSync(path.join(PUB, 'llms-full.txt'), `# ${NAME} — full text\n\n> Independent, open-source public project for Colorado residents. Pilot stage; the people listed are real Colorado officials from official lists. Source: ${SITE}\n\n` + PAGES.slice(1, 5).map(x => `---\n\n# ${texts[x.f].title}\nURL: ${SITE}${x.url}\n\n${texts[x.f].text.trim()}\n`).join('\n'));
console.log('seo built:', PAGES.length, 'pages');
