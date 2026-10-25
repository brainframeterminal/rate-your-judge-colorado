import './scene.js';
import { modalOpen } from './modal.js';
import { captchaHeader, prefetchCaptcha } from './captcha.js';
import { t, plural, srv, ordinal, onLang, LANG, apType } from './i18n.js';
import { getDevice, currentDevice, resetDevice } from './device.js';
import { ago } from './common.js';
import { loaderScene } from './loader.js';
// Rate Your Judge Colorado v1 — phone-first flow: role → court → who → rate → live result. English + Spanish.
const $ = s => document.querySelector(s);
const app = $('#app');
const ROLE_IDS = [['party', '⚖️'], ['observer', '👀'], ['juror', '🧑‍⚖️'], ['attorney', '💼']];
const METRIC_IDS = ['q1', 'q2', 'q3', 'q4', 'q5'];
const S = { step: 0, role: null, court: null, official: null, type: 'judge', pos: null, courts: [], ratings: {}, overall: 0, outcome: '', subrole: '', caseType: '', x: {}, comment: '', redo: null };

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k.startsWith('aria-') && typeof v === 'boolean') e.setAttribute(k, String(v)); else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
let loadTimer = null, shownAt = 0, tipN = Math.floor(Math.random() * 5), forceN = 0;
function loader(on, text, tip, force) {
  const el = $('#loader');
  clearTimeout(loadTimer);
  if (on) {
    $('#loaderText').textContent = text || t('load.loading'); $('#loaderTip').textContent = tip || t('tip.' + (1 + tipN++ % 5));
    forceN = force ? 1 : 0;
    if (el.hidden) loadTimer = setTimeout(() => { el.hidden = false; shownAt = Date.now(); loaderScene(); }, force ? 0 : 150); // quick steps never flash it
  } else if (!el.hidden) {
    loadTimer = setTimeout(() => { el.hidden = true; }, Math.max(0, (forceN ? 900 : 600) - (Date.now() - shownAt))); // once seen, stays long enough to read
  }
}
async function api(path, body, retried) {   // reading never needs the device token: a search engine that cannot call /api/session still sees the page
  let r;
  try { const device = body ? await getDevice() : await getDevice().catch(() => ''), hdr = { 'content-type': 'application/json' }; if (device) hdr['x-device'] = device; if (body && /^\/api\/(review|suggest|join|feedback)$/.test(path)) hdr['x-captcha'] = await captchaHeader(); r = await fetch(path, { method: body ? 'POST' : 'GET', headers: hdr, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw Object.assign(new Error(t('err.offline')), { status: 0 }); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && j.code === 'device' && !retried) { resetDevice(); return api(path, body, true); }   // a stale anonymous token: get a fresh one, try once more
  if (!r.ok) throw Object.assign(new Error(srv(j.error || t('err.generic'))), { status: r.status, code: String(j.screen || j.code || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) });
  return j;
}
function steps(n) { const el = $('#steps'); el.replaceChildren(...[0, 1, 2, 3, 4].map(i => h('i', { class: i === n ? 'on' : '' }))); $('#back').hidden = n === 0; }
function show(node, n, redo) {
  if (!S.popping && n !== S.step && S.started) history.pushState({ n }, '');          // phone/Android back button walks the steps
  steps(n); S.step = n; S.redo = redo || null; S.started = true;
  app.dataset.screen = { 0: 'home', 1: redo === stepMap ? 'map' : 'court', 2: 'who', 3: 'rate', 4: 'result' }[n] || 'other';   // desktop layouts key off this
  app.replaceChildren(h('div', { class: S.keepScroll ? '' : 'fade' }, node)); if (!S.keepScroll) window.scrollTo({ top: 0 }); S.keepScroll = false; focusHeading();
}
function focusHeading() { const h1 = app.querySelector('h1'); if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); document.title = app.dataset.screen === 'home' ? t('page.title') : h1.textContent.replace(/\s+/g, ' ').trim() + ' — Rate Your Judge Colorado'; } else app.focus({ preventScroll: true }); }
function goBack() {
  const f = { 1: stepRole, 2: S.browse ? stepMap : stepCourt, 3: stepWho, 4: S.court ? stepWho : stepRole }[S.step];
  S.popping = true; Promise.resolve((f || stepRole)()).finally(() => { S.popping = false; });
}
{ const br = $('.top .brand'); if (br) { br.setAttribute('role', 'link'); br.tabIndex = 0; br.setAttribute('aria-label', 'Rate Your Judge Colorado — home');   // the name in the header goes home
  const home = () => { S.sent = null; S.after = null; S.browse = false; stepRole(); }; br.addEventListener('click', home); br.addEventListener('keydown', e => { if (e.key === 'Enter') home(); }); } }
$('#back').addEventListener('click', () => { if (S.step === 0) return; history.length > 1 ? history.back() : goBack(); });
addEventListener('popstate', () => { if (S.step > 0) goBack(); });
document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('paused', document.hidden));
onLang(() => { if (S.redo && S.step !== 3) S.redo(); else if (S.redo) S.redo(); });

const buzz = () => { try { navigator.vibrate && navigator.vibrate(8); } catch {} };
const dist = (a, b, c, d) => { const r = x => x * Math.PI / 180, R = 6371000;
  const q = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(q)); };
const fmtDist = m => { const ft = m * 3.28084; return ft < 1000 ? `${Math.max(10, Math.round(ft / 10) * 10)} ft` : `${(m / 1609.34).toFixed(m < 16093 ? 1 : 0)} mi`; };   // US units
const avg = v => (v ? v.toFixed(1) : '–');
const sumLine = s => (!s || !s.n) ? t('who.first') : s.hidden ? t('res.few', { n: s.n, min: 5 }) : `★ ${avg(s.overall)} · ${plural(s.n)}`;
// names are stored as "Judge Priya Sato" / "Deputy DA Rebecca Moreau"; in Spanish the title is shown on its own line instead
const ordEn = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const placeOf = d => d.title ? d.title.replace(/^[^,]*,\s*/, '') : d.scope === 'district' ? `${ordEn(Number(d.court.district))} Judicial District` : d.court.name;   // mirrors placeOf() in server.js
const profileTitle = d => `${d.name}, ${placeOf(d)}: ratings and reviews — Rate Your Judge Colorado`;
const bare = n => n.replace(/^(Judge|Justice|Deputy DA|Deputy District Attorney|District Attorney)\s+/, '');
const dName = n => (LANGNOW() === 'es' ? bare(n) : n);
const LANGNOW = () => document.documentElement.lang === 'es' ? 'es' : 'en';
const titleOf = type => t('title.' + type);

// ---- 1. role -------------------------------------------------------------------------------------
function stepRole() {
  if (/^\/(p\/\d+|judge\/|prosecutor\/)/.test(location.pathname)) history.replaceState(history.state, '', '/');   // leaving a deep-linked profile: the address bar follows
  const featuredH = h('h2', { style: 'margin-top:26px', hidden: true }, t('home.profile'));   // only when there is a featured profile
  show([
    h('div', { class: 'hero-grid' }, h('picture', { class: 'hero-logo' }, h('source', { media: '(min-width: 1024px)', srcset: 'img/logo-640.webp' }), h('img', { src: 'img/logo-128.webp', alt: '', width: 320, height: 320, decoding: 'async' })),   // desktop only: his logo (10-16) in place of the 3D scene; phones get the header's small file (already loaded), never the big one
      h('div', { class: 'hero-copy' },
      h('h1', { class: 'hero' }, t('home.h1a'), h('em', {}, t('home.h1b'))),   // phone: hero hidden to save the screen; h1 stays for screen readers
      h('p', { class: 'lead hero-lead' }, t('home.lead')))),
    h('h2', {}, t('home.who')),
    S.after && isAppellate(S.after.court) ? h('p', { class: 'appnote' }, t('app.only')) : null,
    h('div', { class: 'roles-grid' }, ROLE_IDS.filter(([id]) => !(S.after && isAppellate(S.after.court)) || APPELLATE_ROLES.includes(id)).map(([id, ico]) => h('button', { class: 'choice', onclick: () => { S.role = id; if (S.after) { S.court = S.after.court; S.official = S.after.official; S.ratings = {}; S.overall = 0; S.outcome = ''; S.subrole = ''; S.caseType = ''; S.x = {}; S.comment = ''; S.after = null; stepRate(); } else if (S.keepCourt && S.court) { S.keepCourt = false; stepWho(); } else stepCourt(); } },
      h('span', { class: 'ico' }, ico), h('span', {}, t('role.' + id), h('small', {}, t('role.' + id + '.sub'))), h('span', { class: 'go' }, '›')))),
    h('div', { class: 'home-tools' }, h('h2', { style: 'margin-top:26px' }, t('home.lookup')), searchBox(), searchOut,
    h('div', { class: 'home-btns' }, h('button', { class: 'btn ghost', style: 'margin-top:12px', onclick: stepMap }, t('home.map')),
    h('button', { class: 'btn ghost', style: 'margin-top:10px', onclick: openAppellate }, t('home.appellate')))),
    latest,
    added,
    asks,
    apHome,
    featuredH, featured,
  ], 0, stepRole);
  latestRail();
  addedRail();
  asksRail();
  appealsRail();
  api('/api/featured').then(list => (featuredH.hidden = !list.length, list)).then(list => featured.replaceChildren(...list.map(p => h('button', { class: 'choice', onclick: () => { S.sent = null; stepResult(p.id); } },
    avatar(p.name), h('span', {}, dName(p.name), h('small', {}, `${titleOf(p.type)} · ${p.court}`), h('small', {}, `${sumLine(p.summary)} · ${t('home.demo')}`)), h('span', { class: 'go' }, '›'))))).catch(() => {});
}
const featured = h('div');
// home: the newest comments a moderator approved, newest first — each card opens that person's profile.
// Each card shows that one person's own answers; the official's average still waits for MIN_N.
const latest = h('section', { class: 'latest', hidden: true, 'aria-labelledby': 'lth' });
function latestRail() {   // phones: the 3 newest, stacked. Desktop: up to 10 in a row that keeps moving; it stops under the mouse or keyboard focus
  api('/api/latest').then(list => {
    latest.hidden = !list.length;
    const thumbs = r => !r.text ? null : r.canReact ? h('div', { class: 'vote react lt-react' }, h('button', { 'aria-pressed': r.myVote === 1, 'aria-label': t('cm.like.a', { n: r.up }), onclick: () => latestVote(r.id, 1) }, `👍 ${r.up}`), h('button', { 'aria-pressed': r.myVote === -1, 'aria-label': t('cm.dislike.a', { n: r.down }), onclick: () => latestVote(r.id, -1) }, `👎 ${r.down}`))
      : h('div', { class: 'vote react mine lt-react' }, h('button', { disabled: true, title: r.mine ? t('cm.own') : '' }, `👍 ${r.up}`), h('button', { disabled: true, title: r.mine ? t('cm.own') : '' }, `👎 ${r.down}`),
          r.mine ? h('small', { class: 'muted' }, t('cm.own')) : null);   // a title tooltip never shows on a phone: say it in words (tester, 10-23: "the thumbs are not working" on his own comment)
    const card = r => h('div', { class: 'lt-card' }, h('button', { class: 'choice lt', onclick: () => { S.sent = null; stepResult(r.official); } },
        avatar(r.name), h('span', {}, dName(r.name), h('small', {}, `${titleOf(r.type)} · ${r.court}`),
          r.text ? h('span', { class: 'lt-q' }, r.text) : null, answersTable(r),
          h('small', {}, [r.subrole ? t('lt.' + r.subrole) : roleShort(r.role), caseLabel(r.caseType), ago(r.at)].filter(Boolean).join(' · '))), h('span', { class: 'go' }, '›')), thumbs(r));   // the thumbs sit outside the button: a button inside a button is not allowed
    const head = [h('h2', { id: 'lth', style: 'margin-top:26px' }, t('home.latest')), h('p', { class: 'apsub lt-sub' }, t('home.latest.sub'))];
    if (!matchMedia('(min-width: 1024px)').matches) return latest.replaceChildren(...head, ...list.slice(0, 3).map(card));
    // desktop: moves from the very first comment. The real cards come
    // once; eye-only repeats fill the row so the loop never shows a gap, however few ratings there are
    const echo = r => { const c = card(r); c.setAttribute('aria-hidden', 'true'); c.tabIndex = -1; c.inert = true; return c; };
    const laps = Math.max(1, Math.ceil(Math.min(innerWidth, 1200) / (list.length * 376)));
    const lap = [...list.map(card), ...Array.from({ length: laps - 1 }, () => list.map(echo)).flat()];
    const track = h('div', { class: 'lt-track' }, ...lap, ...lap.map((_, i) => echo(list[i % list.length])));
    latest.replaceChildren(...head, h('div', { class: 'lt-marquee', role: 'region', 'aria-labelledby': 'lth' }, track));
    requestAnimationFrame(() => track.style.setProperty('--lt-dur', Math.max(20, Math.round(track.scrollWidth / 2 / 40)) + 's'));   // ~40 px a second, whatever the count
  }).catch(() => {});
}
// home: judges and prosecutors a visitor asked us to list and a moderator added — newest first, 3 at most on every screen
const added = h('section', { class: 'latest added', hidden: true, 'aria-labelledby': 'adh' });
function addedRail() {
  api('/api/added').then(list => {
    added.hidden = !list.length; if (!list.length) return;
    added.replaceChildren(h('h2', { id: 'adh', style: 'margin-top:26px' }, t('home.added')), h('p', { class: 'apsub lt-sub' }, t('home.added.sub')),
      ...list.slice(0, 3).map(p => h('div', { class: 'lt-card' }, h('button', { class: 'choice lt', onclick: () => { S.sent = null; stepResult(p.id); } },
        avatar(p.name), h('span', {}, dName(p.name), h('small', {}, `${titleOf(p.type)} · ${p.court}`), h('small', {}, `${t('home.added.by')} · ${ago(p.at)}`)), h('span', { class: 'go' }, '›')))));
  }).catch(() => {});
}
async function latestVote(id, v) { try { await api('/api/vote', { review: id, vote: v }); latestRail(); } catch (e) { toast(e.message); } }
const roleShort = r => t('role.short.' + r);
// stars are drawn for the eye; a screen reader hears "1/5" (the card is a button, so its text is its name)
const dots = v => v == null ? h('span', { class: 'na' }, t('lt.na')) : h('span', { class: 'sc' }, h('b', { 'aria-hidden': 'true' }, '★'.repeat(v), h('i', {}, '★'.repeat(5 - v))), h('span', { class: 'srt' }, ` ${v}/5`));
const answersTable = r => h('span', { class: 'lt-t' },
  h('span', { class: 'ov' }, h('span', {}, t('rate.overall')), dots(r.overall)),
  ...METRIC_IDS.map((k, i) => h('span', {}, h('span', {}, t(`b.${r.type}.${k}`)), dots(r.q[i]))));
async function openAppellate() {   // home → the justices and appeals judges, browse mode (tap a name = their profile)
  if (!S.courts.length) { loader(true, t('load.courts')); try { S.courts = await api('/api/courts'); } catch (e) { loader(false); return retryCard(e, openAppellate); } finally { loader(false); } }
  const c = S.courts.find(isAppellate); if (!c) return;
  S.court = c; S.browse = true; S.type = 'judge'; stepWho();
}
// home: real judges with the most Court of Appeals decisions — a swipeable rail on phones, a grid on wider screens.
// A count, never a rate (busy dockets get more appeals); each card opens the profile with the full list.
const apHome = h('section', { class: 'aphome', hidden: true, 'aria-labelledby': 'aph' });
const asks = h('section', { class: 'asks', hidden: true, 'aria-labelledby': 'askh' });   // "What people ask": opted-in, moderator-published suggestions with 👍/👎
function asksRail() {
  api('/api/asks').then(list => {
    asks.hidden = !list.length; if (!list.length) return;
    const card = x => h('div', { class: 'ask card' }, x.reviewed ? null : h('span', { class: 'pill warn ask-pill' }, t('asks.new')),
      x.ease != null ? h('p', { class: 'ask-ease' }, h('span', {}, t('asks.ease')), dots(x.ease)) : null,                     // how easy the site was for them
      x.parts ? (p => p.length ? h('p', { class: 'ask-parts' }, h('b', {}, t('asks.parts') + ' '), p.join(', ')) : h('p', { class: 'ask-parts' }, t('asks.none')))(x.parts.split(/,\s*(?=[A-ZÁÉÍÓÚÑ])/).filter(s => !/^(Nothing, it was clear|Nada, estuvo claro)/i.test(s))) : null,   // "nothing was hard" said plainly
      x.questions ? h('p', {}, h('b', {}, t('asks.q') + ' '), x.questions) : null, x.text ? h('p', {}, x.text) : null,
      h('div', { class: 'ask-foot' }, h('small', { class: 'muted' }, ago(x.at)),
        x.canReact ? h('div', { class: 'vote react' }, h('button', { 'aria-pressed': x.myVote === 1, 'aria-label': t('cm.like.a', { n: x.up }), onclick: () => askVote(x.id, 1) }, `👍 ${x.up}`), h('button', { 'aria-pressed': x.myVote === -1, 'aria-label': t('cm.dislike.a', { n: x.down }), onclick: () => askVote(x.id, -1) }, `👎 ${x.down}`))
        : h('div', { class: 'vote react mine' }, h('button', { disabled: true, title: t('asks.own') }, `👍 ${x.up}`), h('button', { disabled: true, title: t('asks.own') }, `👎 ${x.down}`))));
    // same shape as the appeals rail: swipe sideways on a phone, a grid on a computer, room under the subtitle
    const rail = h('div', { class: 'aprail asks-rail', role: 'list' }, list.map(x => h('div', { role: 'listitem' }, card(x))));
    const step = d => rail.scrollBy({ left: d * (rail.firstChild ? rail.firstChild.getBoundingClientRect().width + 12 : 280), behavior: 'smooth' });
    asks.replaceChildren(h('div', { class: 'aphead' }, h('h2', { id: 'askh' }, t('home.asks')),
        list.length > 1 ? h('span', { class: 'aparrows' }, h('button', { type: 'button', 'aria-label': t('home.ap.prev'), onclick: () => step(-1) }, '‹'), h('button', { type: 'button', 'aria-label': t('home.ap.next'), onclick: () => step(1) }, '›')) : null),
      h('p', { class: 'apsub' }, t('home.asks.sub')), rail);
  }).catch(() => {});
}
async function askVote(id, v) { try { await api('/api/asks/vote', { id, vote: v }); asksRail(); } catch (e) { toast(e.message); } }
let apData = null;
async function appealsRail() {
  try { apData = apData || await api('/api/appeals/top'); } catch { return; }
  if (!apData.items || !apData.items.length) return;
  const AFF = ['affirmed'], PART = ['affirmed_in_part'], NEG = ['reversed', 'vacated', 'disapproved'];
  const sum = (c, ks) => ks.reduce((s, k) => s + (c[k] || 0), 0);
  const rail = h('div', { class: 'aprail', role: 'list' });
  const step = d => rail.scrollBy({ left: d * (rail.firstChild ? rail.firstChild.getBoundingClientRect().width + 12 : 280), behavior: 'smooth' });
  apHome.replaceChildren(
    h('div', { class: 'aphead' }, h('h2', { id: 'aph' }, t('ap.h')),
      h('span', { class: 'aparrows' }, h('button', { type: 'button', 'aria-label': t('home.ap.prev'), onclick: () => step(-1) }, '‹'), h('button', { type: 'button', 'aria-label': t('home.ap.next'), onclick: () => step(1) }, '›'))),
    h('p', { class: 'apsub' }, t('home.ap.sub')),
    rail, h('p', { class: 'apsub apsmall' }, t('home.ap.total', { j: apData.judges, n: apData.decisions.toLocaleString() })));
  rail.replaceChildren(...apData.items.map((x, i) => {
      const a = sum(x.counts, AFF), p = sum(x.counts, PART), r = sum(x.counts, NEG), o = x.n - a - p - r;
      const line = [a && t('home.ap.aff', { n: a }), p && t('home.ap.part', { n: p }), r && t('home.ap.rev', { n: r })].filter(Boolean).join(' · ');
      const seg = (n, cls) => n ? h('i', { class: cls, style: `width:${(n / x.n * 100).toFixed(2)}%` }) : null;
      return h('div', { role: 'listitem' }, h('button', { class: 'apcard', 'aria-label': `${dName(x.name)}, ${x.court}. ${t('home.ap.n', { n: x.n })}: ${line}`, onclick: () => { S.sent = null; stepResult(x.id); } },
        h('span', { class: 'aptop' }, h('span', { class: 'aprank' }, '#' + (i + 1)), avatar(x.name)),
        h('b', { class: 'apname' }, dName(x.name)), h('small', {}, x.court),
        h('span', { class: 'apnum' }, h('b', {}, String(x.n)), h('span', {}, t('home.ap.n', { n: x.n }).replace(/^\d+\s*/, ''))),
        h('span', { class: 'apbar', 'aria-hidden': 'true' }, seg(a, 'a'), seg(p, 'p'), seg(r, 'r'), seg(o, 'o')),
        h('small', { class: 'apline' }, line)));
    }));
  apHome.hidden = false;
}
function avatar(name, big) {
  const ws = bare(name).replace(/,?\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '').split(/\s+/).filter(Boolean);   // first + last name ("Ted C. Tow III" → TT, not TC)
  const ini = ((ws[0] || '')[0] || '') + (ws.length > 1 ? ws[ws.length - 1][0] : '');
  const hue = [...name].reduce((x, c) => (x * 31 + c.charCodeAt(0)) % 360, 7);
  return h('span', { class: 'avatar' + (big ? ' big' : ''), style: `background:linear-gradient(135deg,hsl(${hue} 65% 30%),hsl(${(hue + 40) % 360} 70% 38%))` }, ini);
}

function retryCard(e, again) {
  if (e && e.status === 404) return show([h('h1', {}, t('err.nf.h')), h('div', { class: 'card' }, h('p', {}, t('err.nf.p')), h('button', { class: 'btn', onclick: () => { history.replaceState(null, '', '/'); stepRole(); } }, t('err.home')))], 0, null);   // a dead link: say so, offer home (a retry could never work)
  show([h('h1', {}, '…'), h('div', { class: 'card' }, h('p', {}, e.message || t('err.generic')), h('button', { class: 'btn', onclick: again }, t('err.retry')))], S.step || 0, null);
}
const searchOut = h('div'); let searchSeq = 0;
function searchBox() {
  let tm = null;
  return h('input', { type: 'search', placeholder: t('home.search'), 'aria-label': t('home.search.aria'), oninput: e => {
    clearTimeout(tm); const q = e.target.value.trim();
    if (q.length < 2) { searchSeq++; searchOut.replaceChildren(); return; }
    const my = ++searchSeq;
    tm = setTimeout(async () => {
      const r = await api('/api/search?q=' + encodeURIComponent(q)).catch(() => []);
      if (my !== searchSeq) return;                                                // typed on (or cleared) since: drop this stale answer
      searchOut.replaceChildren(...(r.length ? r.map(p => h('button', { class: 'choice', onclick: () => { S.sent = null; stepResult(p.id); } },
        avatar(p.name), h('span', {}, dName(p.name), h('small', {}, p.title ? t('jt.' + p.title) : `${titleOf(p.type)} · ${p.court}`)), h('span', { class: 'go' }, '›'))) : [h('p', { class: 'muted', style: 'color:#fff;background:rgba(6,14,58,.5);border-radius:12px;padding:8px 12px' }, t('home.none'))]));
    }, 220);
  } });
}

// ---- explore: Colorado map coloured by district average ---------------------------------------------
const TONES = ['#bcc6fb', '#a6d9ec', '#d3c0f6', '#9db4e8'];   // unrated districts: neighbours never share a tint (tools/build_map.py)
const heat = v => !v ? '#c9cde6' : `hsl(${Math.round((Math.min(5, Math.max(1, v)) - 1) / 4 * 125)} 62% ${v >= 4 ? 40 : 46}%)`;
// ---- the Colorado map, district by district (used by "Explore" and by the courthouse step) ----------------
// Tints until a district has ratings, then red→green. The picked district is lifted into a top group with ONE outline
// around the whole district (an SVG filter: Safari ignores CSS filters on SVG groups) and filled gold; the rest fade.
let mapGeo = null;
const loadMapGeo = async () => mapGeo || (mapGeo = await fetch('co-map.json').then(r => { if (!r.ok) throw new Error('map'); return r.json(); }));
function coMap(map, byD, onPick) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${map.w} ${map.h}`); svg.setAttribute('class', 'comap'); svg.setAttribute('role', 'group'); svg.setAttribute('aria-label', t('map.aria'));
  const paths = [], gAll = document.createElementNS(NS, 'g'), gSel = document.createElementNS(NS, 'g');
  gSel.setAttribute('class', 'selg');   // the picked district is drawn LAST, so no neighbour paints over its outline
  const defs = document.createElementNS(NS, 'defs'); defs.innerHTML = '<filter id="selout" x="-15%" y="-15%" width="130%" height="140%" color-interpolation-filters="sRGB">'
    + '<feMorphology in="SourceAlpha" operator="dilate" radius="2.2" result="d"/><feFlood flood-color="#0a1f5c"/><feComposite in2="d" operator="in" result="o"/>'
    + '<feGaussianBlur in="d" stdDeviation="5" result="b"/><feOffset in="b" dy="4" result="bo"/><feFlood flood-color="#050a32" flood-opacity=".38"/><feComposite in2="bo" operator="in" result="sh"/>'
    + '<feMerge><feMergeNode in="sh"/><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
  svg.append(defs, gAll, gSel);
  const select = dnum => {
    const f = document.activeElement;
    paths.forEach(p => { p.el.classList.toggle('on', p.d === dnum); p.el.setAttribute('aria-pressed', String(p.d === dnum)); (p.d === dnum ? gSel : gAll).append(p.el); });
    svg.classList.toggle('picked', paths.some(p => p.d === dnum));
    gSel.setAttribute('filter', `url(${location.href.split('#')[0]}#selout)`);   // full URL: <base href="/"> would send a bare #selout to "/" on /p/N and /judge/<name> pages
    if (f && f.isConnected && svg.contains(f)) f.focus({ preventScroll: true });
    document.querySelectorAll('.chipbtn[data-d]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.d === dnum)));
    onPick(dnum);
  };
  for (const c of map.counties) {
    const d = byD.get(String(c.district)), el = document.createElementNS(NS, 'path');
    el.setAttribute('d', c.d); el.setAttribute('fill', d && d.n ? heat(d.overall) : TONES[c.tone || 0]); el.setAttribute('class', d && d.n ? 'cty' : 'cty unr'); el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button'); el.setAttribute('aria-label', t('map.county', { c: c.county, d: c.district }));
    el.addEventListener('click', () => select(String(c.district))); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(String(c.district)); } });
    gAll.append(el); paths.push({ el, d: String(c.district) });
  }
  const legend = [...byD.values()].some(d => d.n) ? h('div', { class: 'legend' }, h('span', {}, t('map.lower')), h('i'), h('span', {}, t('map.higher'))) : h('div', { class: 'legend' }, t('map.tints'));
  return { svg, select, card: h('div', { class: 'card mapcard' }, svg, legend) };
}
const APPELLATE_ID = 'carr-judicial-center', APPELLATE_ROLES = ['observer', 'attorney'];
const isAppellate = c => !!c && (c.kind === 'appellate' || c.id === APPELLATE_ID);

// ---- explore: Colorado map coloured by district average ---------------------------------------------
async function stepMap() {
  loader(true, t('load.map'), undefined, true);
  let map, dists; try { [map, dists] = await Promise.all([loadMapGeo(), api('/api/districts'), S.courts.length ? 0 : api('/api/courts').then(c => { S.courts = c; })]); } catch (e) { loader(false); return retryCard(e, stepMap); } finally { loader(false); }
  const byD = new Map(dists.map(d => [String(d.district), d]));
  const panel = h('div', { class: 'card', role: 'region', 'aria-live': 'polite', 'aria-label': t('map.panel') }, h('p', { class: 'muted' }, t('map.tap')));
  const m = coMap(map, byD, dnum => {
    const d = byD.get(dnum); if (!d) return;
    panel.replaceChildren(h('h3', {}, dnum === 'Statewide' ? t('map.statewide') : t('map.district', { n: dnum, o: ordinal(dnum) })),
      h('div', { class: 'muted' }, d.n ? t('map.avg', { avg: d.overall.toFixed(1), n: d.n }) : t('map.none')),
      ...d.courts.map(c => h('button', { class: 'choice', style: 'min-height:56px;font-size:16px;box-shadow:none;background:#f2f4ff', onclick: () => { S.court = courtFrom(c.id); S.browse = true; stepWho(); } },
        h('span', {}, c.name, h('small', {}, c.n ? `★ ${c.overall.toFixed(1)} · ${plural(c.n)}` : t('map.none'))), h('span', { class: 'go' }, '›'))));
    const r = panel.getBoundingClientRect(); if (r.top > innerHeight - 120 || r.bottom > innerHeight) panel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });   // the list was below the fold
  });
  show([h('h1', {}, t('map.h1a'), h('em', {}, t('map.h1b'))), h('p', { class: 'lead' }, t('map.lead')),
    m.card, panel,   // the picked district's courts sit right under the map, not below 24 buttons
    h('div', { class: 'card' }, h('h3', { id: 'dlist' }, t('map.list')), h('div', { class: 'chips', role: 'group', 'aria-labelledby': 'dlist' }, [...byD.keys()].sort((x, y) => (+x || 99) - (+y || 99)).map(k => h('button', { type: 'button', class: 'chipbtn', 'data-d': k, 'aria-pressed': 'false', onclick: () => { m.select(k); m.svg.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }, k === 'Statewide' ? t('map.statewide') : k)))),
    h('button', { class: 'btn ghost', onclick: () => { S.browse = false; stepRole(); } }, t('map.back'))], 1, stepMap);
}
const courtFrom = id => S.courts.find(c => c.id === id) || { id, name: id, address: '' };

const HOUSE_ES = { 'District Court': 'Tribunal de Distrito', 'County Court': 'Tribunal del Condado', 'Juvenile Court': 'Tribunal de Menores', 'Probate Court': 'Tribunal Testamentario', 'Supreme Court': 'Corte Suprema', 'Court of Appeals': 'Corte de Apelaciones' };
const houseName = n => LANG === 'es' ? (HOUSE_ES[n] || n.replace('Water Court Division', 'Tribunal de Aguas, División')) : n;
const houseLine = c => (c.district && c.district !== 'Statewide' ? t('court.dist', { n: c.district }) + (c.houses && c.houses.length ? ' · ' : '') : '') + (c.houses || []).map(houseName).join(', ');
// ---- 2. court (geolocation first, search as fallback) --------------------------------------------
async function stepCourt() {
  S.keepCourt = false;
  if (!S.courts.length) { loader(true, t('load.courts')); try { S.courts = await api('/api/courts'); } finally { loader(false); } }
  let map = null, dists = [];
  try { [map, dists] = await Promise.all([loadMapGeo(), api('/api/districts').catch(() => [])]); } catch {}   // no map → search + location still work
  const list = h('div', { class: 'clist' }), msg = h('p', { class: 'nearby' });
  const pick = c => { S.court = c; stepWho(); };
  const courtBtn = c => h('button', { class: 'choice', onclick: () => pick(c) },
    h('span', { class: 'ico' }, isAppellate(c) ? '⚖️' : '🏛️'), h('span', {}, c.name + (/court/i.test(c.name) ? '' : t('court.suffix')),
      h('small', {}, `${c.address}${c.pos != null ? ' · ' + fmtDist(c.pos) : ''}`), h('small', {}, houseLine(c))), h('span', { class: 'go' }, '›'));
  const draw = (items, head) => list.replaceChildren(...(items.length && head ? [h('h2', { class: 'courthead' }, head)] : []), ...items.map(courtBtn));
  const rank = () => S.pos ? S.courts.map(c => ({ ...c, pos: dist(S.pos.lat, S.pos.lon, c.lat, c.lon) })).sort((a, b) => a.pos - b.pos) : S.courts;
  // the map: tap a district → its courthouses, right under the map
  const byD = new Map(dists.map(d => [String(d.district), d]));
  const inDist = h('div', { class: 'card', role: 'region', 'aria-live': 'polite', 'aria-label': t('map.panel') }, h('p', { class: 'muted', style: 'margin:0' }, t('court.maptap')));
  const m = map ? coMap(map, byD, dnum => {
    const cs = S.courts.filter(c => String(c.district) === dnum);
    inDist.replaceChildren(h('h3', {}, t('map.district', { n: dnum, o: ordinal(dnum) })), ...cs.map(c => h('button', { class: 'choice', style: 'min-height:56px;font-size:16px;box-shadow:none;background:#f2f4ff', onclick: () => pick(c) },
      h('span', {}, c.name, h('small', {}, houseLine(c))), h('span', { class: 'go' }, '›'))));
    inDist.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }) : null;
  const appellate = S.courts.find(isAppellate);
  const mapPart = h('div', {}, h('h2', { class: 'courthead' }, t('court.byMap')), m ? m.card : null, m ? inDist : null,
    appellate ? h('button', { class: 'choice', onclick: () => pick(appellate) }, h('span', { class: 'ico' }, '⚖️'), h('span', {}, t('court.appellate'), h('small', {}, t('court.appellate.sub'))), h('span', { class: 'go' }, '›')) : null);
  const search = h('input', { type: 'search', placeholder: t('court.search'), 'aria-label': t('court.search.aria'),
    oninput: e => { const q = e.target.value.toLowerCase().trim(); mapPart.hidden = !!q;
      if (q) draw(rank().filter(c => (c.name + c.county + c.address + ' district ' + c.district + ' ' + houseLine(c)).toLowerCase().includes(q)).slice(0, 12)); else nearest(); } });
  const nearest = () => draw(S.pos ? rank().slice(0, 3) : [], t('court.nearest'));
  const locate = () => {
    if (!navigator.geolocation) { msg.textContent = t('court.noloc'); return; }
    msg.textContent = t('court.finding');
    navigator.geolocation.getCurrentPosition(p => {
      S.pos = { lat: p.coords.latitude, lon: p.coords.longitude };
      const r = rank(); msg.textContent = r[0].pos < 5000 ? t('court.near') : t('court.far');
      if (!search.value.trim()) nearest();
    }, () => { msg.textContent = t('court.denied'); },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };
  show([
    h('h1', {}, t('court.h1a'), h('em', {}, t('court.h1b')), t('court.h1c')),
    h('button', { class: 'btn', onclick: locate }, t('court.loc')),
    msg, h('div', { style: 'height:8px' }), search, list, mapPart,
  ], 1, stepCourt);
  if (!map) draw(S.courts.slice(0, 12)); else nearest();
}

// ---- 3. who -------------------------------------------------------------------------------------
// "Rate someone else" from a profile opened by search, a home card or a shared link: no courthouse or role was ever picked
// (his report 10-16: "Cannot read properties of null (reading 'id')"). Use that person's court; ask the role first if needed.
function rateSomeoneElse(d) {
  S.court = d.court; S.browse = false;                                         // someone else at THIS person's court
  S.type = d.type;
  if (!S.role) { S.keepCourt = true; return stepRole(); }
  stepWho();
}
async function stepWho() {
  if (!S.court) return stepRole();                                              // never a crash: no court yet means start at the beginning
  loader(true, t('load.who'));
  let people; try { people = await api('/api/officials?court=' + encodeURIComponent(S.court.id)); } catch (e) { loader(false); return retryCard(e, stepWho); } finally { loader(false); }
  const body = h('div', { class: 'plist' }), app = isAppellate(S.court);
  if (app) S.type = 'judge';   // no prosecutors at the appeals courts
  if (app && !S.browse && !APPELLATE_ROLES.includes(S.role)) {   // party / juror picked first: explain, offer the two roles that do see these judges
    return show([h('h1', {}, t('court.appellate')), h('div', { class: 'card' }, h('p', { class: 'appnote', style: 'margin-top:0' }, t('app.only')),
      ...APPELLATE_ROLES.map(r => h('button', { class: 'choice', style: 'box-shadow:none;background:#f2f4ff', onclick: () => { S.role = r; stepWho(); } }, h('span', {}, t('app.as.' + r)), h('span', { class: 'go' }, '›'))))], 2, stepWho);
  }
  const draw = () => body.replaceChildren(...people.filter(p => p.type === S.type).map(p => h('button', { class: 'choice', onclick: () => { if (S.browse) { S.sent = null; return stepResult(p.id); } S.official = p; S.ratings = {}; S.overall = 0; S.outcome = ''; S.subrole = ''; S.caseType = ''; S.x = {}; S.comment = ''; stepRate(); } },
    h('span', { class: 'ico' }, { judge: '⚖️', prosecutor: '📜' }[p.type]),
    h('span', {}, dName(p.name), p.title ? h('small', {}, t('jt.' + p.title)) : null, h('small', {}, sumLine(p.summary))),
    h('span', { class: 'go' }, '›'))));
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, ['judge', 'prosecutor'].map(id =>
    h('button', { class: 'tab' + (id === S.type ? ' on' : ''), role: 'tab', 'aria-selected': id === S.type, onclick: e => { S.type = id; tabs.querySelectorAll('.tab').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-selected', 'false'); }); e.currentTarget.classList.add('on'); e.currentTarget.setAttribute('aria-selected', 'true'); draw(); } }, t('type.' + id))));
  const addBtn = h('button', { class: 'addcard', type: 'button', onclick: () => addPerson(S.type) }, h('span', { class: 'plus', 'aria-hidden': 'true' }, '+'), h('span', {}, t('add.cta.' + S.type)));
  const redrawAdd = () => addBtn.lastChild.textContent = t('add.cta.' + S.type);
  tabs.addEventListener('click', () => setTimeout(redrawAdd, 0));
  show([S.browse ? h('h1', {}, t('who.browse.a'), h('em', {}, t('who.browse.b'))) : h('h1', {}, t('who.h1a'), h('em', {}, t('who.h1b')), t('who.h1c')), h('p', { class: 'lead' }, S.court.name + ' · ' + S.court.address), app ? null : tabs, body, addBtn], 2, stepWho);
  draw();
}

// ---- "I can't find them": suggest a judge or prosecutor (matches shown first, otherwise goes to a moderator) ----
function addPerson(type) {
  const sheet = h('div', { class: 'fbsheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'addTitle' }); document.body.append(sheet); document.body.classList.add('noscroll');
  let release = null; const close = () => { if (!sheet.isConnected) return; sheet.remove(); document.body.classList.remove('noscroll'); release && release(); };
  let name = '', note = '', matches = null, done = null, busy = false;
  const draw = () => {
    const err = h('div', { class: 'err', role: 'alert', hidden: true }, t('add.err'));
    const body = done ? h('div', {}, h('p', { class: 'fbthanks' }, '✅ ' + t(done)), h('button', { class: 'btn', type: 'button', onclick: close }, t('fb.close')))
      : matches ? h('div', {}, h('div', { class: 'q' }, t('add.match')), matches.map(m => h('button', { class: 'choice', style: 'box-shadow:none;background:#f2f4ff', onclick: () => { close(); S.sent = null; S.browse = false; S.official = { id: m.id, name: m.name, type }; S.ratings = {}; S.overall = 0; S.outcome = ''; S.subrole = ''; S.caseType = ''; S.x = {}; S.comment = ''; stepRate(); } }, h('span', {}, t('add.match.yes', { n: dName(m.name) })), h('span', { class: 'go' }, '›'))),
          h('button', { class: 'btn ghost', style: 'background:#eef0ff;color:#12358f;margin-top:8px', type: 'button', onclick: () => submit(true) }, t('add.match.no')))
      : h('div', {}, h('p', { class: 'muted' }, t('add.sub')), h('p', { class: 'muted' }, t('add.court', { c: S.court.name })),
        h('label', { class: 'q', for: 'addName' }, t('add.name')), h('input', { id: 'addName', type: 'text', value: name, placeholder: t('add.name.ph'), maxlength: 60, autocomplete: 'off', autocapitalize: 'words', oninput: e => { name = e.target.value; } }),
        h('label', { class: 'q', for: 'addNote' }, t('add.note')), h('input', { id: 'addNote', type: 'text', value: note, placeholder: t('add.note.ph'), maxlength: 200, oninput: e => { note = e.target.value; } }),
        err, h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn', type: 'button', onclick: () => submit(false) }, t('add.send'))));
    sheet.replaceChildren(h('div', { class: 'fbback', onclick: close }), h('div', { class: 'fbpanel' }, h('div', { class: 'fbhead' }, h('h2', { id: 'addTitle' }, t('add.title.' + type)), h('button', { class: 'icon', type: 'button', 'aria-label': t('fb.close'), onclick: close }, '×')), body));
    sheet._err = err;
  };
  async function submit(force) {
    if (busy) return; if (name.trim().length < 3) { if (sheet._err) { sheet._err.textContent = t('add.short'); sheet._err.hidden = false; } return; } busy = true;
    try { const r = await api('/api/suggest', { court: S.court.id, type, name, note, force: !!force }); if (r.matches) matches = r.matches; else done = r.already ? 'add.already' : 'add.thanks'; draw(); }
    catch { if (sheet._err) { sheet._err.textContent = t('add.err'); sheet._err.hidden = false; } } finally { busy = false; }
  }
  draw(); release = modalOpen(sheet, close);
}
// ---- voice note → text (server-side whisper; the recording is never stored) ------------------------
function mic(ta) {
  const btn = h('button', { class: 'btn ghost mic', type: 'button' }, t('mic.btn'));
  let rec = null, chunks = [], tick = null, t0 = 0;
  const pick = () => ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find(x => window.MediaRecorder && MediaRecorder.isTypeSupported(x)) || '';
  if (!navigator.mediaDevices || !window.MediaRecorder) { btn.disabled = true; btn.textContent = t('mic.na'); return btn; }
  const stop = () => { if (rec && rec.state === 'recording') rec.stop(); };
  btn.addEventListener('click', async () => {
    if (rec && rec.state === 'recording') return stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = pick(); chunks = [];
      rec = new MediaRecorder(stream, type ? { mimeType: type } : {});
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        clearInterval(tick); stream.getTracks().forEach(x => x.stop());
        btn.classList.remove('rec'); btn.textContent = t('mic.btn');
        const blob = new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' });
        if (blob.size < 800) return;
        loader(true, t('load.voice'));
        try {
          const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'content-type': blob.type, 'x-device': await getDevice() }, body: blob });
          const j = await r.json();
          if (!r.ok) throw new Error(srv(j.error || t('err.generic')));
          ta.value = (ta.value ? ta.value + ' ' : '') + j.text; S.comment = ta.value;
        } catch (e) { toast(e.message); } finally { loader(false); }
      };
      rec.start(); t0 = Date.now(); btn.classList.add('rec');
      tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); btn.textContent = t('mic.rec', { s }); if (s >= 45) stop(); }, 250);
    } catch { toast(t('mic.perm')); }
  });
  return btn;
}

// ---- 4. rate ------------------------------------------------------------------------------------
function stepRate() {
  prefetchCaptcha();
  const o = S.official, sub = subroleBlock(o);
  const submit = h('button', { class: 'btn', disabled: true, onclick: send }, t('rate.send'));
  const err = h('div', { class: 'err', role: 'alert', hidden: true });
  const answered = () => METRIC_IDS.filter(k => typeof S.ratings[k] === 'number').length;
  const need = h('p', { class: 'sendhint' }, t('rate.need'));                   // why Send is still grey
  const check = () => { submit.disabled = !(METRIC_IDS.every(k => S.ratings[k] !== undefined) && answered() >= 3 && S.overall); need.hidden = !submit.disabled; };
  const blocks = METRIC_IDS.map(k => {
    const btns = [1, 2, 3, 4, 5].map(n => h('button', { 'aria-pressed': S.ratings[k] === n, 'aria-label': t('rate.of5', { n }), onclick: () => { buzz(); S.ratings[k] = n; btns.forEach((b, i) => b.setAttribute('aria-pressed', i + 1 === n)); na.setAttribute('aria-pressed', 'false'); check(); } }, String(n)));
    const ty = o.type || S.type;
    const na = h('button', { type: 'button', class: 'nabtn', 'aria-describedby': 'q-' + k, 'aria-pressed': S.ratings[k] === 'na', onclick: () => { const on = S.ratings[k] !== 'na'; if (on) { S.ratings[k] = 'na'; btns.forEach(b => b.setAttribute('aria-pressed', 'false')); } else delete S.ratings[k]; na.setAttribute('aria-pressed', String(on)); check(); } }, t('na.btn'));
    return h('div', { role: 'group', 'aria-labelledby': 'q-' + k }, h('div', { class: 'q', id: 'q-' + k }, t(`m.${ty}.${k}`)), h('div', { class: 'scale' }, btns), h('div', { class: 'ends' }, h('span', {}, t(`m.${ty}.${k}.lo`)), h('span', {}, t(`m.${ty}.${k}.hi`))), na);
  });
  const stars = [1, 2, 3, 4, 5].map(n => h('button', { type: 'button', 'aria-label': t('rate.stars', { n }), 'aria-pressed': n === S.overall, class: n <= S.overall ? 'on' : '', onclick: () => { buzz(); S.overall = n; stars.forEach((s, i) => { s.classList.toggle('on', i < n); s.setAttribute('aria-pressed', String(i + 1 === n)); }); check(); } }, '★'));
  const ta = h('textarea', { id: 'cmt', 'aria-label': t('rate.ph'), placeholder: t('rate.ph'), maxlength: 600, enterkeyhint: 'done', autocomplete: 'off', oninput: e => { S.comment = e.target.value; }, onfocus: e => setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 320) }); ta.value = S.comment || '';
  async function send() {
    submit.disabled = true; err.hidden = true; loader(true, t('load.send'), undefined, true);
    try {
      const rs = Object.fromEntries(Object.entries(S.ratings).map(([k, v]) => [k, v === 'na' ? null : v]));
      const r = await api('/api/review', { official: o.id, role: S.role, ...rs, overall: S.overall, outcome: S.outcome, subrole: S.subrole, case_type: S.caseType, x1: S.x.x1 ?? null, x2: S.x.x2 ?? null, comment: S.comment, lat: S.pos?.lat, lon: S.pos?.lon });
      S.sent = r; await stepResult(o.id);
    } catch (e) { loader(false); err.textContent = e.message; err.hidden = false; submit.disabled = false; if (e.status === 409) setTimeout(() => stepResult(o.id), 1200); }
  }
  show([
    h('h1', {}, t('rate.h1'), h('em', {}, dName(o.name))),
    h('div', { class: 'card' }, caseTypeBlock(() => mark('casetype')), sub[0], ...blocks, sub[1], h('div', { class: 'q', id: 'q-overall' }, t('rate.overall')), h('div', { class: 'stars', role: 'group', 'aria-labelledby': 'q-overall' }, stars),
      h('div', { class: 'q' }, t('oc.ask')), outcomeChips(),
      h('div', { class: 'q' }, t('rate.more')), h('details', { class: 'rules' }, h('summary', {}, t('rate.rules')), h('ul', {}, ['r1', 'r2', 'r3', 'r4'].map(k => h('li', {}, t('rate.' + k)))), h('a', { class: 'inlink', href: 'method.html' }, t('why.q'))), mic(ta), ta, h('p', { class: 'muted' }, t('rate.hint'))),
    h('div', { class: 'cta' }, err, need, submit),
  ], 3, stepRate);
  check();
}

// "changed on appeal" = reversed, partly affirmed, vacated or sent back; "affirmed and remanded with directions" stays affirmed (mirrors server.js)
const CHANGED_ON_APPEAL = new Set(['reversed', 'affirmed_in_part', 'vacated', 'remanded']);
const changedOnAppeal = x => CHANGED_ON_APPEAL.has(x.outcome);
const pubOf = note => /Unpublished opinion\./.test(note || '') ? 'unpublished' : /Published opinion\./.test(note || '') ? 'published' : '';   // the announcement's own words, kept in note
const AP_GROUP = { 'Domestic relations appeal': 'family', 'Adoption appeal': 'family', 'Relinquishment appeal': 'family',   // the same groups the rating form asks about (10-23)
  'Criminal appeal': 'criminal', 'Misdemeanor appeal': 'criminal', 'Traffic appeal': 'criminal',
  'Civil appeal': 'civil', 'County civil appeal': 'civil', 'Small claims appeal': 'civil', 'Water appeal': 'civil' };   // the filter chips; everything else (dependency and neglect, mental health, probate…) is "Other"
const apGroup = name => AP_GROUP[name] || 'other';
const longDay = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString(LANG === 'es' ? 'es' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });   // 2023-06-01 → June 1, 2023 / 1 de junio de 2023
function appealsBlock(d) {   // public appellate record of a trial judge: listed with citations, no percentage (no public caseload to divide by)
  const a = d.appeals; if (!a || !a.items) return [];
  if (!a.items.length) return a.since ? [h('h3', {}, t('ap.h')), h('p', {}, t('ap.none', { since: longDay(a.since), until: longDay(a.until) })), h('p', { class: 'muted' }, t('ap.none.why')), ...olderBlock(a)] : [];   // nothing found: say so, with the dates searched
  const order = ['affirmed', 'affirmed_in_part', 'reversed', 'vacated', 'disapproved', 'remanded', 'dismissed'].filter(k => a.counts[k]);
  // by type of case: the same four groups as the filter chips below and the same outcomes as the counts above (a tester, 10-23:
  // "the top section has 3 buckets and the appeals by type has different classifications"); "Other" names the kinds it holds
  const groups = new Map(), pub = { published: 0, unpublished: 0 };
  for (const x of a.items) {
    const g = apGroup(x.case_name), y = groups.get(g) || groups.set(g, { n: 0, c: {}, kinds: new Map() }).get(g);
    y.n++; y.c[x.outcome] = (y.c[x.outcome] || 0) + 1; y.kinds.set(x.case_name, (y.kinds.get(x.case_name) || 0) + 1);
    const p = pubOf(x.note); if (p) pub[p]++;
  }
  const G = ['family', 'criminal', 'civil', 'other'];
  const meaning = (() => { const id = `apo-${d.id}`, box = h('div', { class: 'muted apwhat', id, hidden: true }, order.map(k => h('p', {}, h('b', {}, t('ap.' + k)), ': ', t('apw.' + k))));
    return h('div', { class: 'apline' }, h('button', { type: 'button', class: 'linkbtn apinfo', 'aria-expanded': 'false', 'aria-controls': id, onclick: e => { box.hidden = !box.hidden; e.currentTarget.setAttribute('aria-expanded', String(!box.hidden)); } }, t('ap.what')), box); })();
  const what = k => { const id = `apw-${k}-${d.id}`, p = h('p', { class: 'muted apwhat', id, hidden: true }, t(k === 'published' ? 'pub.what' : 'unpub.what'));   // one plain-language explanation behind a toggle
    return h('div', { class: 'apline' }, h('span', {}, `${t('ap.' + k)}: `, h('b', {}, String(pub[k]))),
      h('button', { type: 'button', class: 'linkbtn apinfo', 'aria-expanded': 'false', 'aria-controls': id, onclick: e => { p.hidden = !p.hidden; e.currentTarget.setAttribute('aria-expanded', String(!p.hidden)); } }, t('ap.what')), p); };
  return [h('h3', {}, t('ap.h')), h('div', { class: 'jp-why' }, h('b', {}, t('apx.why.h')), ' ', t('apx.why')),
    ...outcomeBar(a, order), meaning, ...rateBlock(d), h('p', { class: 'muted' }, t('ap.note')),
    h('h4', {}, t('ap.bytype')),
    h('ul', { class: 'aptypes' }, [...groups].sort((p, q) => q[1].n - p[1].n || G.indexOf(p[0]) - G.indexOf(q[0])).map(([g, y]) => h('li', {}, h('b', {}, t('af.' + g)), `: ${t(y.n === 1 ? 'ap.appealed.one' : 'ap.appealed.other', { n: y.n })} · `,
      order.filter(k => y.c[k]).map(k => `${y.c[k]} ${t('ap.' + k).toLowerCase()}`).join(' · '),
      g === 'other' ? h('small', { class: 'muted' }, ` (${[...y.kinds].sort((p, q) => q[1] - p[1]).map(([k, n]) => apType(k).toLowerCase() + (y.kinds.size > 1 ? ` ${n}` : '')).join(', ')})`) : null))),
    h('h4', {}, t('ap.pubh')), what('published'), what('unpublished'),
    appealsList(a.items, true), ...olderBlock(a)];
}
function ojpeBlock(d) {   // the state's own evaluation per retention cycle, newest first, each linked to the state's page (tester 10-23)
  const x = d.ojpe; if (!x) return [];
  const rec = c => t(`oj.${c.rec}${c.year <= 2016 ? '.2016' : ''}`);
  return [h('h3', {}, t('oj.h')), h('p', { class: 'muted' }, t('oj.lead')),
    x.cycles.length ? h('ul', { class: 'appeals' }, x.cycles.map(c => h('li', {}, h('b', {}, String(c.year)), ' ', h('span', { class: 'pill' + (c.rec === 'meets' ? ' ok' : ' warn') }, rec(c)),
      h('small', {}, c.as ? `${t('oj.as', { c: c.as })} · ` : '', c.vote ? `${t('oj.vote', { v: c.vote.replace('-', '–') })} · ` : '', h('a', { href: c.url, target: '_blank', rel: 'noopener' }, t('oj.read'))),
      c.vote_text ? h('small', { class: 'jp-q' }, `“${c.vote_text}”`) : null, c.note ? h('small', { class: 'jp-q' }, c.note[LANG] || c.note.en) : null)))
      : h('p', {}, t('oj.none')),
    x.appointed ? h('p', {}, t('oj.bench', { y: x.appointed.year })) : null, h('p', { class: 'muted' }, t('oj.src'))];
}
function rateBlock(d) {   // appeals decided per year on the bench: a data point beside the statewide middle, never a rate of reversals
  const r = d.ojpe && d.ojpe.rate; if (!r) return [];
  const late = d.ojpe.appointed && String(d.ojpe.appointed.day || `${d.ojpe.appointed.year}-07-01`) > d.ojpe.since;
  const max = Math.max(r.perYear, r.median || 0) * 1.08 || 1, pos = v => `${Math.min(97, Math.max(3, v / max * 100)).toFixed(1)}%`;
  return [h('h4', {}, t('ar.h')),
    r.median != null ? h('div', { class: 'jp-gauge', 'aria-hidden': 'true' }, h('div', { class: 'tr' }),
      h('div', { class: 'pin me', style: `left:${pos(r.perYear)}` }, t('ar.me', { r: num(r.perYear) }), h('b')),
      h('div', { class: 'pin mid', style: `left:${pos(r.median)}` }, h('b'), t('ar.mid', { m: num(r.median) }))) : null,
    h('p', {}, late ? t('ar.line.late', { r: num(r.perYear), y: d.ojpe.appointed.year }) : t('ar.line', { r: num(r.perYear), since: longDay(d.ojpe.since) })),
    r.median != null ? h('p', {}, t('ar.cmp', { j: r.judges, m: num(r.median), p: Math.round(r.above * 100) })) : null, h('p', { class: 'muted' }, t('ar.note'))];
}
// ---- judge page: who the judge is, the state's evaluation, then the record ----------------
const num = (v, o) => Number(v).toLocaleString(LANG === 'es' ? 'es' : 'en-US', o);
const OUT_COLORS = { affirmed: '#2fb36b', affirmed_in_part: '#f0a800', reversed: '#e8590c', vacated: '#c2255c', disapproved: '#8a3ffc', remanded: '#d9480f', dismissed: '#9aa3c7' };
function outcomeBar(a, order) {   // one colour per outcome code, widths from the counts; the legend carries the numbers
  const n = order.reduce((s, k) => s + a.counts[k], 0) || 1;
  return [h('div', { class: 'jp-obar', role: 'img', 'aria-label': order.map(k => `${a.counts[k]} ${t('ap.' + k)}`).join(', ') }, order.map(k => h('i', { style: `width:${(a.counts[k] / n * 100).toFixed(2)}%;background:${OUT_COLORS[k]}` }))),
    h('div', { class: 'jp-leg' }, order.map(k => h('span', { style: `--c:${OUT_COLORS[k]}` }, `${a.counts[k]} ${t('ap.' + k).toLowerCase()}`)))];
}
function heroBlock(d, rateBtn) {   // who this judge is: official photo, court, appointment, a short biography from the state's own pages
  const w = d.who || {}, oj = d.ojpe || {}, ap = oj.appointed, bio = w.bio && (w.bio[LANG] || w.bio.en);
  const pic = w.photo ? h('img', { class: 'jp-photo', src: w.photo.src, alt: dName(d.name), width: 96, height: 128, loading: 'eager', decoding: 'async' }) : avatar(d.name, true);
  const tags = [ap ? t('hero.since', { y: ap.year }) : null, w.docket ? (w.docket[LANG] || w.docket.en) : null].filter(Boolean);
  const src = [bio ? h('a', { href: w.bio.source, target: '_blank', rel: 'noopener' }, t('hero.biosrc')) : null, w.photo ? h('a', { href: w.photo.page, target: '_blank', rel: 'noopener' }, w.photo.from === 'ojpe' ? t('hero.photosrc.oj', { y: w.photo.year }) : t('hero.photosrc')) : null].filter(Boolean);
  return h('div', { class: 'card jp-hero' },
    h('div', { class: 'jp-top' }, pic, h('div', {}, h('h2', {}, dName(d.name)),
      h('p', { class: 'jp-sub' }, d.title ? t('jt.' + d.title) : `${titleOf(d.type)} · ${d.court.name}`, d.court.district ? [h('br'), t('court.dist', { n: d.court.district })] : null),
      tags.length ? h('div', { class: 'jp-tags' }, tags.map(x => h('span', { class: 'jp-tag' }, x))) : null)),
    ap && ap.by ? h('p', { class: 'jp-appt' }, t('hero.by', { g: ap.by, y: ap.year })) : null,
    ...(bio ? bio.split(/\n\n+/).map(p => h('p', { class: 'jp-bio' }, p)) : []),
    src.length ? h('p', { class: 'jp-src' }, src.flatMap((x, i) => i ? [' · ', x] : [x])) : null,
    rateBtn);
}
function glanceBlock(d) {   // four tiles: our rating, the state's evaluation, appeals, the state's own survey
  const a = d.stats.all || { n: 0 }, oj = d.ojpe || {}, c = (oj.cycles || [])[0], ap = d.appeals, sv = oj.survey;
  const tile = (cls, k, v, n) => h('div', { class: 'jp-tile ' + cls }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), n ? h('div', { class: 'n' }, n) : null);
  const ch = ap && ap.items ? ap.items.filter(changedOnAppeal).length : 0, an = ap && ap.items ? ap.items.length : 0;
  const tot = sv ? sv.groups.filter(g => g.sent > 0).reduce((s, g) => ({ sent: s.sent + g.sent, answered: s.answered + g.answered }), { sent: 0, answered: 0 }) : null;
  const appellate = d.court && d.court.kind === 'appellate', op = d.opinions && d.opinions.items ? d.opinions.items.length : 0;   // appellate judges have no trial appeals record: their own opinions instead
  return h('div', { class: 'card' }, h('h3', {}, t('gl.h')), h('div', { class: 'jp-glance' },
    !a.n ? tile('grey', t('gl.ours'), t('gl.none'), t('gl.first')) : a.hidden ? tile('', t('gl.ours'), plural(a.n), t('gl.few', { min: d.stats.min })) : tile('', t('gl.ours'), `★ ${avg(a.overall)}`, plural(a.n)),
    c ? tile(c.rec === 'meets' && !c.note ? 'ok' : 'warn', t('gl.state', { y: c.year }), t(c.rec === 'meets' ? 'gl.meets' : 'gl.not'), c.note ? t('gl.split') : c.vote ? t('oj.vote', { v: c.vote.replace('-', '–') }) : c.vote_text ? t('gl.voted') : null) : tile('grey', t('gl.state0'), t('gl.noeval'), null),
    appellate ? (op ? tile('', t('gl.op'), t('gl.opn', { n: op }), null) : tile('grey', t('gl.op'), t('gl.op0'), null)) :
    ap && an ? tile('warn', t('gl.ap'), t('gl.apn', { n: an }), t('gl.apch', { c: ch, p: Math.round(ch / an * 100) }) + (oj.rate ? ' · ' + t('gl.apy', { r: num(oj.rate.perYear) }) : '')) : tile('grey', t('gl.ap'), t('gl.ap0'), null),
    tot && tot.sent ? tile('', t('gl.sv', { y: sv.year }), t('gl.svn', { a: num(tot.answered), s: num(tot.sent) }), t('gl.svp', { p: num(tot.answered / tot.sent * 100, { maximumFractionDigits: 1 }) })) : tile('grey', t('gl.sv0'), t('gl.svnone'), null)));   // the tile counts the email invitations only: the people invited about THIS judge
}
function surveyBlock(d, rateBtn) {   // how the state heard about this judge: official numbers, the district's population, what is not published
  const sv = d.ojpe && d.ojpe.survey && { ...d.ojpe.survey, groups: d.ojpe.survey.groups.filter(g => g.sent > 0) }; if (!sv || !sv.groups.length) return null;   // a row with nothing sent has no share to show
  const tot = sv.groups.reduce((s, g) => ({ sent: s.sent + g.sent, answered: s.answered + g.answered }), { sent: 0, answered: 0 });
  const pct = (a, s) => num(a / s * 100, { maximumFractionDigits: 1 }) + '%', dist = sv.district, all = sv.answered_total ?? tot.answered;
  const dname = dist ? t('sv.dist', { n: dist.number, o: ordinal(dist.number), c: dist.counties.join(', '), y: dist.year }) : '';
  const dots = tot.sent <= 2000 ? h('div', { class: 'jp-dots', 'aria-hidden': 'true' }, Array.from({ length: tot.sent }, (_, i) => h('i', { class: i < tot.answered ? 'on' : '' }))) : null;
  return h('div', { class: 'card' }, h('h3', {}, t('sv.h')), h('span', { class: 'pill' }, t('sv.official')),
    h('p', { class: 'jp-lead' }, t('sv.lead', { y: sv.year })),
    h('div', { class: 'jp-survey' }, sv.groups.map(g => h('div', { class: 'jp-srow' }, h('div', { class: 'l' }, h('span', {}, t('sv.row', { g: t('sv.g.' + g.group), a: num(g.answered), s: num(g.sent) })), h('b', {}, pct(g.answered, g.sent))),
      h('div', { class: 'sb' }, h('i', { style: `width:${Math.max(1, g.answered / g.sent * 100).toFixed(2)}%` }))))),
    sv.extra && sv.extra.length ? h('ul', { class: 'jp-extra' }, sv.extra.map(e => h('li', {}, `${e.key ? t(e.key) : e.label}: ` + (e.sent != null ? t('sv.ex', { a: num(e.answered), s: num(e.sent) }) : t('sv.ex0', { a: num(e.answered) }))))) : null,
    h('div', { class: 'jp-big' }, h('b', {}, num(all)), h('span', {}, dist ? t('sv.big', { p: num(dist.population), d: dname, sh: num(all / dist.population * 100, { maximumSignificantDigits: 2 }) }) : t('sv.big0'))),
    dots, dots ? h('p', { class: 'jp-src' }, t('sv.dots', { a: num(tot.answered), s: num(tot.sent) })) : null,
    h('div', { class: 'jp-note' }, h('b', {}, t('sv.note.h')), ' ', t('sv.note')),
    h('p', { class: 'jp-src' }, h('a', { href: sv.pdf, target: '_blank', rel: 'noopener' }, t('sv.pdf', { y: sv.year })), sv.copy ? [' · ', h('a', { href: sv.copy, target: '_blank', rel: 'noopener' }, t('ap.copy'))] : null,
      dist && dist.source ? [' · ', h('a', { href: dist.source, target: '_blank', rel: 'noopener' }, t('sv.census'))] : null),
    h('p', { class: 'jp-lead' }, t('sv.us')), rateBtn);
}
function newsBlock(d) {   // public reporting that names the judge: reputable outlets only, checked by hand; 3 shown, the rest behind one tap
  const ns = d.who && d.who.news; if (!ns || !ns.length) return null;
  const li = n => h('li', {}, h('a', { href: n.url, target: '_blank', rel: 'noopener' }, n.title), h('small', {}, `${n.outlet} · ${longDay(n.date)}`));
  const ul = h('ul', { class: 'jp-news' }, ns.slice(0, 3).map(li));
  const more = ns.length > 3 ? h('button', { type: 'button', class: 'linkbtn', onclick: e => { ul.replaceChildren(...ns.map(li)); e.currentTarget.remove(); } }, t('nw.more', { n: ns.length - 3 })) : null;
  return h('div', { class: 'card' }, h('h3', {}, t('nw.h')), ul, more, h('p', { class: 'jp-src' }, t('nw.note')));
}
function opinionsBlock(a) {
  const order = ['affirmed', 'affirmed_in_part', 'reversed', 'vacated', 'disapproved', 'remanded', 'dismissed'].filter(k => a.counts[k]);
  return [h('h3', {}, t('op.h')), h('p', { class: 'muted' }, t('op.note')),
    h('div', { class: 'roles' }, h('div', {}, h('b', {}, String(a.items.length)), h('span', {}, t('op.h'))), h('div', {}, h('b', {}, String(a.published)), h('span', {}, t('op.pub', { n: '' }).trim())),
      ...order.map(k => h('div', {}, h('b', {}, String(a.counts[k])), h('span', {}, t('ap.' + k))))),
    appealsList(a.items)];
}
function olderBlock(a) {   // 2013 → May 2023 (his choice 10-24): listed apart, never counted — unpublished only for those years
  const o = a.older; if (!o || !o.items || !o.items.length) return [];
  return [h('details', { class: 'apolder' }, h('summary', {}, t('apo.h', { n: o.items.length })), h('p', { class: 'muted' }, t('apo.note')), appealsList(o.items, true))];
}
function appealsList(items, filters) {   // newest 10, the rest behind one tap (a busy judge has 50+); on a trial judge's profile, chips narrow the WHOLE list first
  const SHOW = 10, ul = h('ul', { class: 'appeals' });
  const li = x => { const k = t('ak.' + x.case_name);
    return h('li', {}, h('span', { class: 'pill' + (x.outcome === 'affirmed' ? ' ok' : x.outcome === 'dismissed' ? '' : ' warn') }, t('ap.' + x.outcome)), ' ',   // dismissed: the ruling stands, not a loss
      h('a', { href: x.url, target: '_blank', rel: 'noopener' }, k.startsWith('ak.') ? x.case_name : k), h('small', {}, `${x.citation} · ${x.decided} · ${x.court === 'csc' ? t('ap.csc') : t('ap.coa')}`, x.copy ? [' · ', h('a', { href: x.copy, target: '_blank', rel: 'noopener' }, t('ap.copy'))] : null),
      x.reason ? h('p', { class: 'jp-reason' }, h('b', {}, t('rs.why')), ' ', x.reason[LANG] || x.reason.en, x.reason.pdf ? [' ', h('a', { href: x.reason.pdf, target: '_blank', rel: 'noopener' }, t('rs.read'))] : null) : null,   // tester point 7: the court's reason in one plain line
      x.note ? h('p', {}, x.note) : null); };
  let group = 'all', changedOnly = false, shown = items;
  const more = h('button', { class: 'btn ghost', style: 'margin-top:8px', hidden: true, onclick: () => { ul.replaceChildren(...shown.map(li)); more.hidden = true; } });
  const none = h('p', { class: 'muted', hidden: true }, t('af.none'));
  const draw = () => {
    shown = items.filter(x => (group === 'all' || apGroup(x.case_name) === group) && (!changedOnly || changedOnAppeal(x)));
    ul.replaceChildren(...shown.slice(0, SHOW).map(li));
    more.textContent = t('ap.more', { n: shown.length }); more.hidden = shown.length <= SHOW; none.hidden = shown.length > 0;
  };
  let chips = null;
  if (filters) {   // a type chip appears only for types this judge has; one type alone needs no chips. "Changed only" combines with the type
    const groups = ['family', 'criminal', 'civil', 'other'].filter(g => items.some(x => apGroup(x.case_name) === g)), all = groups.length > 1 ? ['all', ...groups] : [];
    const gb = all.map(g => h('button', { type: 'button', class: 'chipbtn', 'aria-pressed': g === group, onclick: () => { group = g; gb.forEach((b, i) => b.setAttribute('aria-pressed', String(all[i] === g))); draw(); } }, t('af.' + g)));
    const cb = h('button', { type: 'button', class: 'chipbtn', 'aria-pressed': false, onclick: e => { changedOnly = !changedOnly; e.currentTarget.setAttribute('aria-pressed', String(changedOnly)); draw(); } }, t('af.changed'));
    chips = h('div', { class: 'chips apchips', role: 'group', 'aria-label': t('af.aria') }, ...gb, cb);
  }
  draw();
  return h('div', {}, chips, ul, none, more);
}
function subroleBlock(o) {
  if (S.role !== 'party') return [null, null];
  const IDS = ['defendant', 'plaintiff', 'victim', 'witness', 'family', 'other'], chipsEl = h('div'), extraEl = h('div');
  const draw = () => {
    chipsEl.replaceChildren(h('div', { class: 'q' }, t('sub.ask')), h('div', { class: 'chips' }, IDS.map(k => h('button', { type: 'button', class: 'chipbtn', 'aria-pressed': S.subrole === k, onclick: () => { S.subrole = S.subrole === k ? '' : k; if (S.subrole !== 'victim' && S.subrole !== 'witness') S.x = {}; draw(); } }, t('sub.' + k)))));
    const show = o.type === 'prosecutor' && (S.subrole === 'victim' || S.subrole === 'witness');
    extraEl.replaceChildren(...(show ? [h('div', { class: 'xbox' }, h('h3', {}, t('x.title')), ['x1', 'x2'].map((k, qi) => {
      const kk = 'x.q' + (qi + 1), btns = [1, 2, 3, 4, 5].map(n => h('button', { 'aria-pressed': S.x[k] === n, 'aria-label': t('rate.of5', { n }), onclick: () => { buzz(); S.x[k] = n; btns.forEach((b, i) => b.setAttribute('aria-pressed', i + 1 === n)); } }, String(n)));
      return h('div', { role: 'group', 'aria-labelledby': 'q-' + k }, h('div', { class: 'q', id: 'q-' + k }, t(kk)), h('div', { class: 'scale' }, btns), h('div', { class: 'ends' }, h('span', {}, t(kk + '.lo')), h('span', {}, t(kk + '.hi'))));
    }))] : []));
  };
  draw(); return [chipsEl, extraEl];
}
// "What kind of case was it?" — optional, the same four groups as the appeals filter (tester 10-23: a family case had no place in the form)
const CASE_TYPES = ['family', 'criminal', 'civil', 'other'];
function caseTypeBlock(onPick = () => {}) {
  const btns = CASE_TYPES.map(k => h('button', { type: 'button', class: 'chipbtn', 'aria-pressed': S.caseType === k, onclick: () => { S.caseType = S.caseType === k ? '' : k; btns.forEach((b, i) => b.setAttribute('aria-pressed', String(S.caseType === CASE_TYPES[i]))); } }, t('ct.' + k)));
  return h('div', { role: 'group', 'aria-labelledby': 'q-ct' }, h('div', { class: 'q', id: 'q-ct' }, t('ct.ask')), h('div', { class: 'chips' }, btns), h('p', { class: 'muted cthint' }, t('ct.hint')));
}
const caseLabel = k => CASE_TYPES.includes(k) ? t('ct.case.' + k) : '';
function outcomeChips() {
  const btns = ['won', 'lost', 'mixed', 'watching'].map(k => h('button', { type: 'button', class: 'chipbtn', 'aria-pressed': S.outcome === k, onclick: () => { S.outcome = S.outcome === k ? '' : k; btns.forEach((b, i) => b.setAttribute('aria-pressed', S.outcome === ['won', 'lost', 'mixed', 'watching'][i])); } }, t('oc.' + k)));
  return h('div', { class: 'chips' }, btns);
}
function sparkline(tr) {
  const pts = tr.map((x, i) => x.avg == null ? null : [i, x.avg]).filter(Boolean);
  if (pts.length < 2) return h('p', { class: 'muted' }, t('tr.none'));
  const i0 = pts[0][0], i1 = pts[pts.length - 1][0];
  const W = 300, H = 84, x = i => 10 + (i - i0) * (W - 20) / Math.max(1, i1 - i0), y = v => H - 8 - (v - 1) / 4 * (H - 22);
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'spark'); svg.setAttribute('role', 'img');
  const first = pts[0][1], last = pts[pts.length - 1][1], dir = last - first > .15 ? 'up' : first - last > .15 ? 'down' : 'steady';
  svg.setAttribute('aria-label', t('tr.aria', { a: first, b: last, d: t('tr.' + dir).replace(/^[^\p{L}]+/u, '') }));
  const line = pts.map(([i, v]) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('L');
  const mk = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); svg.append(e); return e; };
  const defs = mk('defs', {}); defs.innerHTML = '<linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a7bff" stop-opacity=".35"/><stop offset="1" stop-color="#5a7bff" stop-opacity="0"/></linearGradient>';
  mk('path', { d: `M${x(pts[0][0])} ${H - 4}L${line}L${x(pts[pts.length - 1][0])} ${H - 4}Z`, fill: 'url(#sg)' });
  mk('path', { d: 'M' + line, fill: 'none', stroke: '#12358f', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  pts.forEach(([i, v]) => mk('circle', { cx: x(i), cy: y(v), r: 3.6, fill: '#fff', stroke: '#12358f', 'stroke-width': 2.2 }));
  return h('div', {}, svg, h('div', { class: 'ends' }, h('span', {}, i1 === i0 ? '' : t('tr.ago', { n: i1 - i0 + 1 })), h('span', {}, t('tr.' + dir)), h('span', {}, t('tr.now'))));
}
async function shareProfile(d) {
  const url = location.origin + (d.path || `/p/${d.id}`), a = d.stats.all;
  const text = (a.n && !a.hidden) ? t('share.text', { name: dName(d.name), avg: a.overall, n: a.n }) : t('share.first', { name: dName(d.name) });
  try { if (navigator.share) { await navigator.share({ title: dName(d.name), text, url }); return; } } catch { return; }
  try { await navigator.clipboard.writeText(url); toast(t('share.copied')); } catch { prompt(t('share.copy'), url); }
}
const toastBox = h('div', { id: 'toastbox', role: 'status', 'aria-live': 'polite' }); document.body.append(toastBox);   // exists before the first message, so screen readers announce it
function toast(msg) { const x = h('div', { class: 'toast' }, msg); toastBox.append(x); setTimeout(() => x.remove(), 2600); }
async function report(review, id, why) {
  try { await api('/api/report', { review, reason: why }); toast(t('rep.thanks')); await again(id); } catch (e) { toast(e.message); }
}
function reportMenu(c, id) {
  const menu = h('div', { class: 'vote', hidden: true }, [['insult', 'Insult or threat'], ['private', 'Private details'], ['offtopic', 'Not about the courtroom'], ['other', 'Other']].map(([k, en]) => h('button', { onclick: () => report(c.id, id, en) }, t('rep.' + k))));
  return h('div', {}, h('button', { class: 'linkbtn', 'aria-expanded': 'false', onclick: e => { menu.hidden = !menu.hidden; e.currentTarget.setAttribute('aria-expanded', String(!menu.hidden)); } }, t('cm.report')), menu);
}

function extrasCard(d) {
  const e = d.stats.extras; if (!e) return null;
  return h('div', { class: 'xres' }, h('h3', { style: 'margin:0 0 4px' }, t('x.card')), h('div', { class: 'muted' }, t('x.n', { n: e.n })),
    ['x1', 'x2'].map((k, qi) => h('div', { class: 'bar' }, h('div', { class: 'l' }, h('span', {}, t('x.b' + (qi + 1))), h('span', {}, avg(e[k]))), h('div', { class: 't' }, h('i', { 'data-w': (e[k] || 0) * 20 })))));
}
function outcomeStat(d) {
  const o = d.stats.outcome || {}, bits = [];
  if (o.lost && !o.lost.hidden) bits.push(t('oc.stat', { avg: avg(o.lost.overall), n: o.lost.n }));
  if (o.won && !o.won.hidden) bits.push(t('oc.stat.won', { avg: avg(o.won.overall), n: o.won.n }));
  return bits.length ? h('div', { class: 'ocstat' }, bits.map(x => h('p', {}, x))) : null;
}
async function again(id) { const y = window.scrollY; S.keepScroll = true; await stepResult(id); window.scrollTo({ top: y }); }   // re-render in place: do not throw the reader back to the top
// ---- 5. live result -----------------------------------------------------------------------------
async function stepResult(id) {
  loader(true, t('load.result'), undefined, true);
  let d; try { d = await api(`/api/officials/${id}`); } catch (e) { loader(false); return retryCard(e, () => stepResult(id)); } finally { loader(false); }
  const a = d.stats.all || { n: 0 }, pf = d.profile;
  const hasBio = pf.since != null;                                           // invented biographies exist only for demo officials
  const unit = !hasBio ? '' : d.type === 'judge' ? pf.room : t('pu.' + pf.unitIdx);
  const bio = !hasBio ? '' : d.type === 'judge' ? t('bio.judge', { y: pf.since, f: t('bio.f.' + pf.focus) }) : t('bio.prosecutor', { y: pf.since, u: unit.toLowerCase() });
  const bars = h('div', {}, ...METRIC_IDS.map(k => h('div', { class: 'bar' }, h('div', { class: 'l' }, h('span', {}, t(`b.${d.type}.${k}`)), h('span', {}, avg(a[k]))), h('div', { class: 't' }, h('i', { 'data-w': (a[k] || 0) * 20 })))));
  const roles = h('div', { class: 'roles' }, ['party', 'observer', 'juror', 'attorney'].map(r => { const s = d.stats[r];   // a group under MIN_N shows its count, never its average
    return h('div', {}, h('b', {}, s && !s.hidden ? avg(s.overall) : '–'), h('span', {}, `${t('rl.' + r)}${s && !s.hidden ? ' · ' + s.n : s && s.n ? ' · ' + t('res.sofar', { n: s.n }) : ''}`)); }));
  const SUBS = ['defendant', 'plaintiff', 'victim', 'witness', 'family', 'other'].filter(k => d.stats.sub && d.stats.sub[k] && d.stats.sub[k].n);
  const subs = SUBS.length ? [h('h3', { style: 'margin-top:14px' }, t('res.bysub')), h('div', { class: 'roles' }, SUBS.map(k => { const s = d.stats.sub[k]; return h('div', {}, h('b', {}, s.hidden ? '–' : avg(s.overall)), h('span', {}, `${t('sl.' + k)} · ${s.n}`)); }))] : [];
  const cm = d.comments.map(c => h('div', { class: 'cmt' },
    h('div', { class: 'cmt-who' }, h('b', {}, c.subrole ? t('lt.' + c.subrole) : roleShort(c.role)), h('span', { class: 'muted' }, [caseLabel(c.caseType), ago(c.at)].filter(Boolean).map(x => ' · ' + x).join('')),
      c.hasText ? [' ', h('span', { class: 'pill' + (c.status === 'published' ? ' ok' : ' warn') }, c.status === 'published' ? t('cm.confirmed') : c.status === 'held' ? t('cm.held') : t('cm.waiting'))] : null),
    answersTable({ type: d.type, overall: c.overall, q: c.q }),
    c.hasText ? h('p', { 'data-nosnippet': c.status !== 'published' }, c.text || (c.pendingText ? c.pendingText : t('cm.hidden'))) : null,   // search engines may quote only what a moderator has read
    c.canVote ? h('div', { class: 'vote' }, h('button', { onclick: () => vote(c.id, 1, d.id) }, t('cm.up', { n: c.up })), h('button', { onclick: () => vote(c.id, -1, d.id) }, t('cm.down', { n: c.down })))
      : c.canReact ? h('div', { class: 'vote react' }, h('button', { 'aria-pressed': c.myVote === 1, 'aria-label': t('cm.like.a', { n: c.up }), onclick: () => vote(c.id, 1, d.id) }, `👍 ${c.up}`), h('button', { 'aria-pressed': c.myVote === -1, 'aria-label': t('cm.dislike.a', { n: c.down }), onclick: () => vote(c.id, -1, d.id) }, `👎 ${c.down}`))
      : c.mine && c.text ? h('div', { class: 'vote react mine' }, h('button', { disabled: true, title: t('cm.own') }, `👍 ${c.up}`), h('button', { disabled: true, title: t('cm.own') }, `👎 ${c.down}`), h('small', { class: 'muted' }, t('cm.own')))   // your own comment: you see the thumbs and the counts, but cannot press them
      : c.hasText && (c.up || c.down) ? h('p', { class: 'muted react-n' }, `👍 ${c.up} · 👎 ${c.down}`) : null,
    c.text && !c.mine ? reportMenu(c, d.id) : null));
  const sent = S.sent;
  const rateBtn = () => h('button', { class: 'btn', style: 'margin-top:12px', onclick: () => { S.after = { court: d.court, official: { id: d.id, name: d.name, type: d.type } }; stepRole(); } }, t('res.rate', { name: dName(d.name) }));
  show([
    h('h1', {}, sent ? h('span', {}, t('res.thanks'), h('em', {}, t('res.counted'))) : h('span', {}, t('res.profile'))),
    sent ? h('p', { class: 'lead' }, sent.present ? t('res.ver') : t('res.notver')) : null,
    h('div', { class: 'pcols' }, h('div', { class: 'pcol-l' },
    d.demo || d.type !== 'judge' ? h('div', { class: 'card profile' }, avatar(d.name, true), h('div', {}, h('h2', { style: 'margin:0' }, dName(d.name)),
      h('div', { class: 'muted' }, d.title ? t('jt.' + d.title) : `${titleOf(d.type)} · ${d.court.name}`), hasBio ? h('div', { class: 'muted' }, `${t('unit.' + d.type)}: ${unit} · ${t('since', { y: pf.since })}`) : null,
      hasBio ? h('p', { style: 'margin:6px 0 0' }, bio) : null, d.demo ? h('span', { class: 'pill warn' }, t('res.demo')) : null), rateBtn())
      : heroBlock(d, rateBtn()),
    d.type === 'judge' && !d.demo ? glanceBlock(d) : null,
    a.hidden ? h('div', { class: 'card' }, h('h3', {}, plural(a.n)), h('p', {}, a.n ? `${t(a.n === 1 ? 'res.fewline.one' : 'res.fewline.other', { n: a.n })} ${t('res.few.min', { min: d.stats.min })}` : t('res.few', { n: a.n, min: d.stats.min })), h('button', { class: 'btn ghost', style: 'margin-top:8px;background:#eef0ff;color:#12358f', onclick: () => shareProfile(d) }, t('res.share')))   // a neutral count, never a hidden average
    : h('div', { class: 'card' }, h('div', { class: 'muted' }, plural(a.n)), a.n ? h('div', { class: 'muted' }, t('res.verified', { v: a.verified || 0, n: a.n })) : null,
      h('div', { class: 'ring', style: `--p:${(a.overall || 0) * 20}` }, h('div', {}, h('div', {}, h('b', {}, avg(a.overall)), h('br'), h('span', {}, t('res.of5'))))),
      bars, h('h3', { style: 'margin-top:14px' }, t('res.by')), roles, ...subs, outcomeStat(d), extrasCard(d), h('h3', { style: 'margin-top:14px' }, t('res.trend')), sparkline(d.trend), h('button', { class: 'btn ghost', style: 'margin-top:12px;background:#eef0ff;color:#12358f', onclick: () => shareProfile(d) }, t('res.share'))),
    ), h('div', { class: 'pcol-r' },
    // comments right under the rating, then the appeals history
    h('div', { class: 'card every' }, h('h3', {}, t('res.comments')), cm.length ? h('div', { class: 'cmts' }, cm) : h('p', { class: 'muted' }, t('res.nocomments'))),
    appealsBlock(d).length ? h('div', { class: 'card' }, ...appealsBlock(d)) : null,
    surveyBlock(d, rateBtn()), newsBlock(d),
    ojpeBlock(d).length ? h('div', { class: 'card' }, ...ojpeBlock(d)) : null,
    d.opinions && d.opinions.items.length ? h('div', { class: 'card' }, ...opinionsBlock(d.opinions)) : null,   // appellate judges: the decisions they wrote
    d.type === 'judge' && !d.demo ? h('div', { class: 'card' }, h('h3', {}, t('disc.h')), h('p', { class: 'muted', style: 'margin:6px 0 0' }, t('disc.p')), h('a', { href: 'method.html', style: 'display:inline-block;padding:8px 0;font-weight:600' }, t('disc.more'))) : null,   // statewide numbers from the discipline commission's report — never about this judge   // public record: shown with or without ratings (every real judge starts at 0)
    )),
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => { S.sent = null; rateSomeoneElse(d); } }, t('res.else')), h('button', { class: 'btn ghost', onclick: () => { S.sent = null; stepRole(); } }, t('res.start'))),
  ], 4, () => stepResult(id));
  if (!d.demo) document.title = profileTitle(d);   // the same <title> the server sends, so a search engine that runs JavaScript keeps it
  requestAnimationFrame(() => setTimeout(() => app.querySelectorAll('.bar i').forEach(i => { i.style.width = i.dataset.w + '%'; }), 60));
}
async function vote(review, v, id) {
  try { await api('/api/vote', { review, vote: v }); await again(id); } catch (e) { toast(e.message); }
}

// first open: splash with the one-line explanation, then the app
loaderScene();
$('#loaderTip').textContent = t('splash.tip');
let splashOn = true; const endSplash = () => { if (splashOn) { splashOn = false; $('#loader').hidden = true; $('#loader').classList.remove('splash'); } };   // .splash: the logo shows on the opening screen only
setTimeout(endSplash, 3200);   // one second longer than before
$('#loader').addEventListener('click', endSplash);   // a tap skips the opening splash (never an in-app loading screen)
shownAt = Date.now();
const metaId = document.querySelector('meta[name="ryg-profile"]')?.content;   // /judge/<name>, /prosecutor/<name>: the server names the id in the page
const deep = location.pathname.match(/^\/p\/(\d+)$/) || (metaId ? [, metaId] : null) || (location.search.match(/[?&]p=(\d+)/) || []);
if (deep && deep[1]) { S.sent = null; stepResult(Number(deep[1])).catch(stepRole); } else stepRole();
if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
