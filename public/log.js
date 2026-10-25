import { $, h, ago, roleLabel, t } from './common.js';
import { onLang } from './i18n.js';
const app = $('#app');
let d = await (await fetch('/api/log')).json();
function draw() {
  app.replaceChildren(
    h('h1', {}, t('log.h1a'), h('em', {}, t('log.h1b'))),
    h('p', { class: 'lead' }, t('log.lead')),
    h('div', { class: 'card' }, h('h3', {}, t('log.rules')),
      h('p', {}, t('log.r1', { n: d.rules.confirmsToPublish })), h('p', {}, t('log.r2', { ft: d.rules.presenceFeet.toLocaleString() })), h('p', {}, t('log.r3')), h('p', {}, t('log.r4')), h('p', {}, t('log.r5'))),
    h('div', { class: 'card' }, h('h3', {}, t('log.dec')),
      d.decisions.length ? h('table', {}, d.decisions.map(x => x.kind === 'person'   // a judge or prosecutor a visitor asked us to list
        ? h('tr', {}, h('td', {}, ago(x.at)), h('td', {}, h('span', { class: 'chip ' + x.action }, t('log.p.' + x.action)), ' ',
            x.action === 'rejected' ? t('log.p.anon', { type: t('log.p.' + x.type).toLowerCase(), court: x.official.court }) : h('b', {}, x.official.name),
            h('div', { class: 'muted' }, `${t('log.p.' + x.type)} · ${x.official.court} · ${t('log.p.asked')} · ${x.mod}`)))
        : h('tr', {}, h('td', {}, ago(x.at)), h('td', {}, h('span', { class: 'chip ' + x.action }, x.action === 'published' ? t('log.approved') : t('log.rejected')), ' ', x.official.name, h('div', { class: 'muted' }, (x.note || t('log.nonote')) + ' · ' + x.mod))))) : h('p', { class: 'muted' }, t('log.nodec'))),
    h('div', { class: 'card' }, h('h3', {}, t('log.votes')),
      d.comments.length ? h('table', {}, d.comments.map(c => h('tr', {}, h('td', {}, ago(c.at)), h('td', {}, h('span', { class: 'chip ' + c.status }, { published: t('log.public'), pending: t('log.waiting'), rejected: t('log.rejected'), flagged: t('log.review') }[c.status] || c.status), ' ', h('b', {}, c.official.name), h('div', { class: 'muted' }, `${roleLabel(c.role)} · `, h('span', { class: 'tally' }, `👍 ${c.up}  👎 ${c.down}`)), c.text ? h('p', {}, c.text) : null)))) : h('p', { class: 'muted' }, t('log.nocm'))),
  );
}
draw(); onLang(draw);
