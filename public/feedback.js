// Pilot feedback: a slim banner on every page + a bottom sheet with a very simple form (ease 1–5, what was confusing, what to change in the questions, free text).
import { t, onLang, LANG } from './i18n.js';
const h = (tag, at = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(at)) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k.startsWith('aria-') && typeof v === 'boolean') e.setAttribute(k, String(v)); else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v); } for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k)); return e; };
import { getDevice } from './device.js';
import { modalOpen } from './modal.js';
import { captchaHeader, prefetchCaptcha } from './captcha.js';
let hidden = false; try { hidden = sessionStorage.getItem('jx_fb_hide') === '1'; } catch {}
const PARTS = ['role', 'court', 'questions', 'buttons', 'results', 'language', 'none'];
const bar = document.querySelector('#pilotbar'), sheet = h('div', { class: 'fbsheet', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'fbTitle' });
document.body.append(sheet);
let state = { ease: 0, parts: new Set(), q: '', t: '', sent: false };
const tab = h('button', { class: 'fbtab', type: 'button', hidden: true, onclick: () => open() });        // after the banner is closed, a small tab stays so feedback can always be reopened
function drawTab() { tab.replaceChildren(h('span', { 'aria-hidden': 'true' }, '💬'), h('span', {}, t('fb.btn'))); tab.hidden = !hidden; }
document.body.append(tab);
function drawBar() { if (bar) bar.hidden = hidden; drawTab(); }
if (bar) {
  bar.querySelector('.pb-main').addEventListener('click', () => open());
  bar.querySelector('.pb-x').addEventListener('click', () => { hidden = true; try { sessionStorage.setItem('jx_fb_hide', '1'); } catch {} drawBar(); });
}
function drawSheet() {
  const send = h('button', { class: 'btn', type: 'button', onclick: submit }, t('fb.send')), err = h('div', { class: 'err', role: 'alert', hidden: true }, t('fb.err'));
  const ease = [1, 2, 3, 4, 5].map(n => h('button', { type: 'button', 'aria-pressed': state.ease === n, 'aria-label': `${n} / 5`, onclick: () => { state.ease = n; ease.forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === n))); } }, String(n)));
  async function submit() {
    send.disabled = true; err.hidden = true;
    try {
      const r = await fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json', 'x-device': await getDevice().catch(() => ''), 'x-captcha': await captchaHeader() }, body: JSON.stringify({ ease: state.ease || null, parts: [...state.parts].map(k => t('fb.p.' + k)), questions: state.q, text: state.t, page: location.pathname, lang: LANG }) });
      if (!r.ok) throw new Error(); state = { ease: 0, parts: new Set(), q: '', t: '', sent: true }; drawSheet();
    } catch { err.hidden = false; send.disabled = false; }
  }
  sheet.replaceChildren(h('div', { class: 'fbback', onclick: close }), h('div', { class: 'fbpanel' },
    h('div', { class: 'fbhead' }, h('h2', { id: 'fbTitle' }, t('fb.title')), h('button', { class: 'icon', type: 'button', 'aria-label': t('fb.close'), onclick: close }, '×')),
    state.sent ? h('div', {}, h('p', { class: 'fbthanks' }, '✅ ' + t('fb.thanks')), h('button', { class: 'btn', type: 'button', onclick: () => { state.sent = false; close(); } }, t('fb.close')))
    : h('div', {}, h('p', { class: 'muted' }, t('fb.sub')),
      h('div', { class: 'q' }, t('fb.ease')), h('div', { class: 'scale' }, ease), h('div', { class: 'ends' }, h('span', {}, t('fb.ease.lo')), h('span', {}, t('fb.ease.hi'))),
      h('div', { class: 'q' }, t('fb.where')), h('div', { class: 'chips' }, PARTS.map(k => h('button', { type: 'button', class: 'chipbtn', 'aria-pressed': state.parts.has(k), onclick: e => { state.parts.has(k) ? state.parts.delete(k) : state.parts.add(k); e.currentTarget.setAttribute('aria-pressed', String(state.parts.has(k))); } }, t('fb.p.' + k)))),
      h('label', { class: 'q', for: 'fbq' }, t('fb.q')), h('textarea', { id: 'fbq', placeholder: t('fb.q.ph'), maxlength: 600, oninput: e => { state.q = e.target.value; } }, state.q),
      h('label', { class: 'q', for: 'fbt' }, t('fb.t')), h('textarea', { id: 'fbt', placeholder: t('fb.t.ph'), maxlength: 600, oninput: e => { state.t = e.target.value; } }, state.t),
      err, h('div', { style: 'margin-top:12px' }, send))));
}
let release = null;
function open() { prefetchCaptcha(); drawSheet(); sheet.hidden = false; document.body.classList.add('noscroll'); release = modalOpen(sheet, close); }
function close() { if (sheet.hidden) return; sheet.hidden = true; document.body.classList.remove('noscroll'); release && release(); release = null; }
drawBar(); onLang(() => { drawBar(); if (!sheet.hidden) drawSheet(); });
