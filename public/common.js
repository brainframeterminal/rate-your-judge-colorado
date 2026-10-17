import './scene.js';
import { t, plural, LANG } from './i18n.js';
export { t, plural };
export const $ = s => document.querySelector(s);
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k.startsWith('aria-') && typeof v === 'boolean') e.setAttribute(k, String(v)); else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v); }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
export const ago = ts => { const m = Math.max(1, Math.round((Date.now() - ts) / 60000)); return m < 60 ? t('ago.m', { n: m }) : m < 1440 ? t('ago.h', { n: Math.round(m / 60) }) : t('ago.d', { n: Math.round(m / 1440) }); };
export const roleLabel = r => t('role.short.' + r);
