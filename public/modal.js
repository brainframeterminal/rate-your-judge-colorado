// Accessible modal behaviour for bottom sheets: background becomes inert, Tab stays inside, Escape closes, focus returns to the opener.
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
export function modalOpen(sheet, close) {
  const opener = document.activeElement, inerted = [];
  for (const el of document.body.children) if (el !== sheet && !el.matches('script,.toast,#toastbox') && !el.inert) { el.inert = true; inerted.push(el); }
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...sheet.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !sheet.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !sheet.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey);
  setTimeout(() => (sheet.querySelector('textarea,input,.fbpanel button') || sheet).focus?.(), 0);
  return function release() { document.removeEventListener('keydown', onKey); inerted.forEach(el => { el.inert = false; }); opener && opener.focus && opener.focus(); };
}
