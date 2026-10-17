// Printable flyer + 4-up postcards.
// One page, two formats, two languages; ?lang=es&fmt=cards picks them, and tools/flyer/pdf.mjs renders the PDFs from it.
const T = {
  en: {
    q: 'Just left a Colorado courtroom?', sub: 'Rate the judge and the prosecutor in 30 seconds.',
    chips: ['Judges', 'Prosecutors', 'Anonymous', 'No account', 'Free', 'English & Español'],
    how: 'How it works', steps: ['Scan the code with your phone camera.', 'Pick your courthouse, then the judge or prosecutor.', 'Answer five quick questions. Add a comment if you want.'],
    seen: 'Everyone sees the result. Your name never appears.',
    why: 'In 2024 the state invited 117,355 people to evaluate judges by email. Only 6% answered. Your view fills that gap.',
    scan: 'Scan to rate', foot: 'An independent, open-source public project. Not affiliated with the State of Colorado or its courts.',
    aboutH: 'Help every Colorado courtroom know about this',
    aboutP: 'Most people leave a courtroom with no way to say what they saw. This flyer changes that: one scan and they can rate the judge and the prosecutor. The more places it hangs, the more honest the picture becomes.',
    aboutL: ['Print it and hand it to people outside the courthouse, at legal aid clinics, libraries and community centers.',
      'Ask the court administrator or the clerk’s office whether you may leave postcards on the information table or a bulletin board. Always ask first: rules differ from courthouse to courthouse.',
      'Give it to your state senator and representative, county commissioners, the district attorney’s office, bar associations and victim advocates, and ask them to share it.',
      'Send the PDF by email or post it in community groups. Everyone is free to copy and print it.'],
    aboutJoin: 'Want to help organize this in your county? Tell us on Get involved.',
    back: 'Back to the site', flyer: 'Flyer', cards: '4 postcards', print: 'Print', pdf: 'Download PDF', hint: 'US Letter. Print at 100% (“actual size”). Postcards: cut along the dashed lines.',
  },
  es: {
    q: '¿Acabas de salir de un tribunal de Colorado?', sub: 'Califica al juez y al fiscal en 30 segundos.',
    chips: ['Jueces', 'Fiscales', 'Anónimo', 'Sin cuenta', 'Gratis', 'Español & English'],
    how: 'Cómo funciona', steps: ['Escanea el código con la cámara del teléfono.', 'Elige tu tribunal y luego el juez o fiscal.', 'Responde cinco preguntas rápidas. Agrega un comentario si quieres.'],
    seen: 'Todos ven el resultado. Tu nombre nunca aparece.',
    why: 'En 2024 el estado invitó por correo a 117.355 personas a evaluar a los jueces. Solo respondió el 6 %. Tu opinión llena ese vacío.',
    scan: 'Escanea para calificar', foot: 'Proyecto público independiente y de código abierto. No está afiliado al Estado de Colorado ni a sus tribunales.',
    aboutH: 'Ayuda a que todos los tribunales de Colorado lo conozcan',
    aboutP: 'Casi nadie que sale de un tribunal tiene cómo decir lo que vio. Este volante lo cambia: con un escaneo pueden calificar al juez y al fiscal. Cuantos más lugares lo tengan, más honesto será el resultado.',
    aboutL: ['Imprímelo y entrégalo a la gente afuera del tribunal, en clínicas de ayuda legal, bibliotecas y centros comunitarios.',
      'Pregunta al administrador del tribunal o a la oficina del secretario si puedes dejar tarjetas en la mesa de información o en un tablero. Pregunta siempre antes: las reglas cambian de un tribunal a otro.',
      'Entrégalo a tu senador y representante estatal, a los comisionados del condado, a la fiscalía, a las asociaciones de abogados y a los defensores de víctimas, y pídeles que lo compartan.',
      'Envía el PDF por correo o publícalo en grupos de tu comunidad. Cualquiera puede copiarlo e imprimirlo.'],
    aboutJoin: '¿Quieres ayudar a organizarlo en tu condado? Cuéntanos en Participa.',
    back: 'Volver al sitio', flyer: 'Volante', cards: '4 tarjetas', print: 'Imprimir', pdf: 'Descargar PDF', hint: 'Tamaño carta. Imprime al 100 % («tamaño real»). Tarjetas: corta por las líneas punteadas.',
  },
};
const URL_TEXT = 'rateyourjudgecolorado.com';
const p = new URLSearchParams(location.search);
let lang = p.get('lang') === 'es' ? 'es' : (p.get('lang') === 'en' ? 'en' : (navigator.language || '').startsWith('es') ? 'es' : 'en');
let fmt = p.get('fmt') === 'cards' ? 'cards' : 'flyer';
const h = (tag, cls, ...kids) => { const e = document.createElement(tag); if (cls) e.className = cls; for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k)); return e; };
const img = (src, cls, w) => { const i = document.createElement('img'); i.src = src; i.alt = ''; i.className = cls; if (w) { i.width = w; i.height = w; } return i; };
const brand = t => h('div', 'brand', img('img/logo-320.webp', 'logo', 160), h('div', 'name', h('b', '', 'Rate Your Judge'), h('span', '', 'COLORADO')));
const qr = (t, big) => h('figure', 'qr' + (big ? ' big' : ''), h('div', 'code', img('img/qr-site.svg', 'qrimg'), img('img/logo-128.webp', 'qrlogo', 64)), h('figcaption', '', h('b', '', t.scan), h('span', 'url', URL_TEXT)));
function flyer(t) {
  return h('article', 'page flyer',
    h('section', 'band', brand(t), h('h1', '', t.q), h('p', 'sub', t.sub), h('ul', 'chips', t.chips.map(c => h('li', '', c)))),
    h('section', 'body',
      h('div', 'steps', h('h2', '', t.how), h('ol', '', t.steps.map(s => h('li', '', s))), h('p', 'seen', t.seen), h('p', 'why', t.why)),
      qr(t, true)),
    h('footer', 'foot', t.foot));
}
const card = t => h('article', 'card',
  h('section', 'band', brand(t), h('h1', '', t.q), h('p', 'sub', t.sub)),
  qr(t, false),
  h('ol', 'mini', t.steps.map(s => h('li', '', s))),
  h('p', 'foot', t.foot));
function draw() {
  const t = T[lang]; document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach(e => { e.textContent = t[e.dataset.t]; });
  document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === lang));
  document.querySelectorAll('[data-fmt]').forEach(b => b.setAttribute('aria-pressed', b.dataset.fmt === fmt));
  document.querySelector('.pdf').href = `print/rate-your-judge-${fmt === 'cards' ? 'postcards' : 'flyer'}-${lang}.pdf`;
  const join = document.createElement('a'); join.href = 'join.html'; join.textContent = t.aboutJoin;
  const ah = h('h1', '', t.aboutH); ah.id = 'abouth';
  document.getElementById('about').replaceChildren(ah, h('p', '', t.aboutP), h('ul', '', t.aboutL.map(x => h('li', '', x))), h('p', 'join', join));
  document.getElementById('sheet').replaceChildren(fmt === 'flyer' ? flyer(t) : h('article', 'page cards', [0, 1, 2, 3].map(() => card(t))));
  history.replaceState(null, '', `?lang=${lang}&fmt=${fmt}`);
}
document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => { lang = b.dataset.lang; draw(); }));
document.querySelectorAll('[data-fmt]').forEach(b => b.addEventListener('click', () => { fmt = b.dataset.fmt; draw(); }));
document.querySelector('.print').addEventListener('click', () => print());
draw();
