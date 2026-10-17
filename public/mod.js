import { $, h, ago, roleLabel } from './common.js';
const app = $('#app');
async function api(p, body) { const r = await fetch(p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'error'), { status: r.status }); return j; }
let lastSig = '', timer = null;
async function loginView(msg) {
  document.body.classList.remove('moddash');
  const need = await api('/api/mod/login-info').then(d => d.code, () => true);
  const email = h('input', { id: 'le', type: 'text', autocomplete: 'username', inputmode: 'email', autocapitalize: 'off', 'aria-label': 'Email' }), pw = h('input', { id: 'lp', type: 'password', autocomplete: 'current-password', 'aria-label': 'Password' }),
    code = h('input', { id: 'lc', type: 'text', autocomplete: 'one-time-code', inputmode: 'numeric', maxlength: 6, 'aria-label': 'Code from your authenticator app' }), err = h('div', { class: 'err', role: 'alert', hidden: !msg }, msg || '');
  const go = async () => { err.hidden = true; try { await api('/api/mod/login', { email: email.value, password: pw.value, code: code.value }); draw(true); } catch (e) { err.textContent = e.message; err.hidden = false; } };
  for (const i of [email, pw, code]) i.addEventListener('keydown', e => e.key === 'Enter' && go());
  app.replaceChildren(h('h1', {}, 'Moderators ', h('em', {}, 'sign in')), h('p', { class: 'lead' }, need ? 'For approved moderators only. You need your email, your password and the 6-digit code from your authenticator app.' : 'For approved moderators only. Sign in with your email and password.'),
    h('div', { class: 'card' }, h('label', { class: 'q', for: 'le' }, 'Email'), email, h('label', { class: 'q', for: 'lp' }, 'Password'), pw, need ? h('label', { class: 'q', for: 'lc' }, 'Code') : null, need ? code : null, err, h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn', type: 'button', onclick: go }, 'Sign in'))));
}
async function tick() {                                  // live: poll the small summary; redraw the queue only when something changed
  if (document.hidden) return;
  try { const d = await api('/api/mod/summary'); const sig = `${d.pending}/${d.flagged}/${d.suggestions}/${d.join}/${d.feedback}`; document.title = (d.pending + d.flagged ? `(${d.pending + d.flagged}) ` : '') + 'Moderation — Rate Your Judge Colorado'; if (sig !== lastSig) { lastSig = sig; draw(); } }
  catch (e) { if (e.status === 401) { clearInterval(timer); loginView('Your session ended. Please sign in again.'); } }
}
async function draw(fresh) {
  let who, list, sum;
  try { who = await api('/api/mod/whoami'); list = await api('/api/mod/pending'); sum = await api('/api/mod/summary'); }
  catch (e) { if (e.status === 401) return loginView(fresh ? 'Email, password or code is wrong.' : ''); app.replaceChildren(h('h1', {}, 'Moderators ', h('em', {}, 'only')), h('p', { class: 'lead' }, 'This page is for approved moderators.')); return; }
  clearInterval(timer); timer = setInterval(tick, 8000); lastSig = `${sum.pending}/${sum.flagged}/${sum.suggestions}/${sum.join}/${sum.feedback}`;
  const stat = (n, l) => h('div', { class: 'xbox', style: 'flex:1;min-width:92px;text-align:center;padding:10px' }, h('b', { style: 'font-size:24px;display:block;color:#12358f' }, String(n)), h('span', { class: 'muted' }, l));
  document.body.classList.add('moddash');
  app.replaceChildren(h('h1', { class: 'dfull' }, 'Moderation ', h('em', {}, 'queue')), h('p', { class: 'lead dfull' }, `Signed in as ${who.mod}. Every decision is public with your note. This page updates by itself.`),
    h('div', { class: 'dfull', style: 'display:flex;gap:8px;flex-wrap:wrap;margin:8px 0' }, stat(sum.pending, 'comments waiting'), stat(sum.flagged, 'reported'), stat(sum.suggestions, 'suggested people'), stat(sum.ratings24h, 'ratings, 24 h')),
    h('button', { class: 'btn ghost dfull', type: 'button', style: 'margin:4px 0 8px', onclick: async () => { try { await api('/api/mod/logout', {}); } catch {} clearInterval(timer); loginView(''); } }, 'Sign out'),
    h('div', { class: 'card' }, list.length ? list.map(r => {
      const note = h('textarea', { placeholder: 'Reason (shown publicly) — e.g. “factual, no private details”', maxlength: 200 });
      const go = async status => { try { await api('/api/mod/decide', { review: r.id, status, note: note.value }); draw(); } catch (e) { note.insertAdjacentElement('beforebegin', Object.assign(document.createElement('div'), { className: 'err', role: 'alert', textContent: e.message })); } };
      return h('div', { class: 'modrow' }, h('b', {}, r.official.name), ' ', h('span', { class: 'muted' }, `${r.status === 'flagged' ? '⚑ REPORTED ×' + r.reports + ' · ' : ''}${r.official.court} · ${roleLabel(r.role)} · ${r.present ? '✅ at courthouse' : 'not verified'} · ${ago(r.created_at)} · 👍 ${r.up} 👎 ${r.down}`),
        h('p', {}, r.comment), note, h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn', onclick: () => go('published') }, 'Approve'), h('button', { class: 'btn ghost', style: 'background:#ffe3e0;color:#9b1c13', onclick: () => go('rejected') }, 'Reject')));
    }) : h('p', { class: 'muted' }, 'Nothing waiting. 🎉')));
  ppl(); sug(); fb(); jn();
}
const stars = v => v == null ? '–' : v.toFixed(1);
async function ppl() {                                   // everyone, with live numbers; tap a person to see and re-check their ratings
  let d; try { d = await api('/api/mod/people'); } catch { return; }
  const q = h('input', { type: 'text', placeholder: 'Find a person or court…', 'aria-label': 'Find a person or court' }), box = h('div', {});
  const draw2 = () => {
    const f = q.value.trim().toLowerCase(), rows = d.filter(o => !f || (o.name + ' ' + o.court).toLowerCase().includes(f));
    box.replaceChildren(...rows.map(o => {
      const det = h('div', { hidden: true });
      const head = h('button', { type: 'button', class: 'prow', 'aria-expanded': 'false' },
        h('span', { class: 'pn' }, h('b', {}, o.name), h('small', {}, `${o.court}${o.demo ? ' · demo' : ''}`)),
        h('span', { class: 'ps' }, h('b', {}, stars(o.avg)), h('small', {}, `${o.n} ratings`)),
        h('span', { class: 'pc' }, o.waiting ? h('em', {}, `${o.waiting} waiting`) : null, o.pub ? h('small', {}, `${o.pub} comments live`) : null));
      let loaded = false;
      head.addEventListener('click', async () => {
        det.hidden = !det.hidden; head.setAttribute('aria-expanded', String(!det.hidden));
        if (det.hidden || loaded) return; loaded = true;
        try { const p = await api('/api/mod/person?id=' + o.id); det.replaceChildren(...(p.reviews.length ? p.reviews.map(r => {
          const note = h('input', { type: 'text', placeholder: 'Why re-check? (kept in the audit log)', maxlength: 200, 'aria-label': 'Reason' });
          const again = async () => { try { await api('/api/mod/recheck', { review: r.id, note: note.value }); draw(); } catch (e) { note.insertAdjacentElement('beforebegin', Object.assign(document.createElement('div'), { className: 'err', role: 'alert', textContent: e.message })); } };
          return h('div', { class: 'modrow' }, h('span', { class: 'muted' }, `${roleLabel(r.role)} · overall ${r.overall}/5 · ${r.present ? '✅ at courthouse' : 'not verified'} · ${ago(r.created_at)} · ${r.status === 'none' ? 'no comment' : r.status}${r.reports ? ' · ⚑ ×' + r.reports : ''}`),
            r.comment ? h('p', {}, r.comment) : null, r.comment && (r.status === 'published' || r.status === 'rejected') ? h('div', {}, note, h('button', { class: 'btn ghost', type: 'button', style: 'margin-top:8px', onclick: again }, 'Re-check: send back to queue')) : null);
        }) : [h('p', { class: 'muted' }, 'No ratings yet.')])); } catch (e) { det.replaceChildren(h('p', { class: 'err' }, e.message)); }
      });
      return h('div', { class: 'person' }, head, det);
    }), ...(rows.length ? [] : [h('p', { class: 'muted' }, 'Nobody matches.')]));
  };
  q.addEventListener('input', draw2); draw2();
  app.append(h('div', { class: 'card pplcard' }, h('h3', {}, `People and ratings (${d.length})`), h('p', { class: 'muted' }, 'Live numbers, including people with too few ratings to be shown publicly. Tap a person to see every rating and re-check one.'), q, box));
}
async function sug() {
  try { const d = await api('/api/mod/suggestions'); if (!d.length) return;
    app.append(h('div', { class: 'card' }, h('h3', {}, `Suggested people (${d.length})`), d.map(r => {
      const nm = h('input', { type: 'text', value: r.name, 'aria-label': 'Name' });
      const go = async (status, extra = {}) => { if (row.dataset.busy) return; row.dataset.busy = '1'; row.querySelectorAll('button').forEach(b => { b.disabled = true; });   // one click, one request
        try { await api('/api/mod/suggest-decide', { id: r.id, status, name: nm.value, type: r.type, ...extra }); draw(); } catch (e) { delete row.dataset.busy; row.querySelectorAll('button').forEach(b => { b.disabled = false; }); nm.insertAdjacentElement('beforebegin', Object.assign(document.createElement('div'), { className: 'err', role: 'alert', textContent: e.message })); } };
      const m = r.matches || [];
      const row = h('div', { class: 'modrow' }, h('span', { class: 'muted' }, `${r.type} · ${r.court} · ${ago(r.created_at)}${r.note ? ' · ' + r.note : ''}`), nm,
        m.length ? h('p', { style: 'margin:8px 0 0' }, h('b', {}, 'Already listed here: '), m.map((o, i) => [i ? ', ' : '', h('a', { href: 'https://rateyourjudgecolorado.com/p/' + o.id, target: '_blank', rel: 'noopener' }, o.name)])) : null,
        h('div', { class: 'row', style: 'margin-top:8px' },
          m.length ? h('button', { class: 'btn', onclick: () => go('existing', { official: m[0].id }) }, m.length > 1 ? `Already listed (${m[0].name})` : 'Already listed') : null,
          h('button', { class: m.length ? 'btn ghost' : 'btn', onclick: () => go('added', m.length ? { force: true } : {}) }, m.length ? 'Add anyway (different person)' : 'Add to list'),
          h('button', { class: 'btn ghost', style: 'background:#ffe3e0;color:#9b1c13', onclick: () => go('rejected') }, 'Reject')));
      return row;
    }))); } catch {}
}
async function jn() {
  try { const d = await api('/api/mod/join'); if (!d.length) return;
    app.append(h('div', { class: 'card' }, h('h3', {}, `Want to help (${d.length})`), d.map(r => h('div', { class: 'modrow' }, h('span', { class: 'muted' }, `${ago(r.created_at)} · ${r.interests || '—'} · ${r.lang}`), h('p', {}, (r.contact ? r.contact + ' — ' : '') + (r.message || ''))))));
  } catch {}
}
async function fbDecide(id, pub) { try { await api('/api/mod/feedback-decide', { id, pub }); app.querySelectorAll('.card').forEach(c => { if (/Pilot feedback/.test(c.textContent)) c.remove(); }); fb(); } catch (e) { const m = h('p', { class: 'err', role: 'alert' }, e.message); app.prepend(m); setTimeout(() => m.remove(), 6000); } }   // "What people ask"
async function fb() {
  try { const d = await api('/api/mod/feedback'); if (!d.rows.length) return;
    app.append(h('div', { class: 'card' }, h('h3', {}, `Pilot feedback (${d.avg.n}) · ease ${d.avg.a ? d.avg.a.toFixed(1) : '–'}/5`), d.rows.map(r => h('div', { class: 'modrow' }, h('span', { class: 'muted' }, `${ago(r.created_at)} · ${r.page} · ${r.lang}${r.ease ? ' · ease ' + r.ease : ''}`), r.parts ? h('p', {}, 'Confusing: ' + r.parts) : null, r.questions ? h('p', {}, 'Questions: ' + r.questions) : null, r.text ? h('p', {}, r.text) : null,
      h('div', { class: 'modbtns' }, h('span', { class: 'muted' }, r.pub === 'published' ? `Public · reviewed (${r.pub_by})` : r.pub === 'hidden' ? `Removed (${r.pub_by})` : r.pub === 'held' ? 'Held by the screen: possible private name or threat' : 'Public · not reviewed yet'),
        r.pub !== 'published' ? h('button', { class: 'btn ghost', onclick: () => fbDecide(r.id, 'published') }, 'Mark reviewed / publish') : null,
        r.pub !== 'hidden' ? h('button', { class: 'btn ghost', onclick: () => fbDecide(r.id, 'hidden') }, 'Remove') : null))))); } catch {}
}
draw();
