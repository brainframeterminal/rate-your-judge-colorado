// Procedural vector scene: stars, sun with rays, drifting clouds, four mountain ridges with snow caps, pines.
// Built once at load from a fixed seed (stable look), pure SVG + CSS animation, no images.
const NS = 'http://www.w3.org/2000/svg', H = 520, SCENE_FRAC = .62;
let W = 1200, seed = 20261011; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.append(e); return e; };

function ridgeline(base, amp, rough, steps = 8) {            // midpoint displacement → natural jagged skyline
  let pts = [[0, base + (rnd() - .5) * amp * .6], [W, base + (rnd() - .5) * amp * .6]], disp = amp;
  for (let s = 0; s < steps; s++) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      next.push(pts[i], [(x0 + x1) / 2, (y0 + y1) / 2 + (rnd() - .5) * disp]);
    }
    next.push(pts[pts.length - 1]); pts = next; disp *= rough;
  }
  return pts.map(([x, y]) => [x, Math.max(60 + rnd() * 25, Math.min(H - 20, y))]);
}
function snowCaps(pts, parent, depthMax, fill, minY) {         // caps follow the real ridge so they never float off the mountain
  for (let i = 3; i < pts.length - 3; i++) {
    const y = pts[i][1];
    if (y > minY || !(y < pts[i - 1][1] && y <= pts[i + 1][1] && y < pts[i - 2][1] && y <= pts[i + 2][1])) continue;
    const d = depthMax * (.6 + rnd() * .5), px = pts[i][0]; let l = i, r = i;
    while (l > 0 && pts[l][1] < y + d && px - pts[l][0] < 70) l--; while (r < pts.length - 1 && pts[r][1] < y + d && pts[r][0] - px < 70) r++;
    const top = pts.slice(l, r + 1), xl = pts[l][0], xr = pts[r][0], yAt = x => { let k = l; while (k < r && pts[k + 1][0] < x) k++; const [x0, y0] = pts[k], [x1, y1] = pts[Math.min(k + 1, r)]; return x1 === x0 ? y0 : y0 + (y1 - y0) * (x - x0) / (x1 - x0); };
    const m = 5, zig = [];
    for (let j = 0; j <= m; j++) { const x = xr - (xr - xl) * j / m, yy = Math.max(yAt(x) + 1, y + d * (j % 2 ? .45 + rnd() * .15 : .85 + rnd() * .3)); zig.push([x, yy]); }
    el('path', { d: 'M' + top.map(p => p.join(' ')).join('L') + 'L' + zig.map(p => p.map(v => +v.toFixed(1)).join(' ')).join('L') + 'Z', fill }, parent);
  }
}
function pines(pts, parent, count, color, size) {
  for (let k = 0; k < count; k++) {
    const p = pts[Math.floor(rnd() * pts.length)], h = size * (.6 + rnd() * .8), w = h * .42, x = p[0], y = p[1] + 2;
    el('path', { d: `M${x} ${y - h}L${x + w * .55} ${y - h * .55}L${x + w * .25} ${y - h * .55}L${x + w * .8} ${y - h * .12}L${x + w * .3} ${y - h * .12}L${x + w} ${y}L${x - w} ${y}L${x - w * .3} ${y - h * .12}L${x - w * .8} ${y - h * .12}L${x - w * .25} ${y - h * .55}L${x - w * .55} ${y - h * .55}Z`, fill: color }, parent);
  }
}
function layer(svg, id, base, amp, rough, stops, opts = {}) {
  const defs = svg.querySelector('defs') || el('defs', {}, svg);
  const g = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  stops.forEach(([o, c]) => el('stop', { offset: o, 'stop-color': c }, g));
  const pts = ridgeline(base, amp, rough), grp = el('g', { class: 'lay ' + (opts.cls || '') }, svg);
  el('path', { d: 'M0 ' + H + 'L' + pts.map(p => p.join(' ')).join('L') + 'L' + W + ' ' + H + 'Z', fill: `url(#${id})`, opacity: opts.opacity ?? 1 }, grp);
  if (opts.snow) snowCaps(pts, grp, opts.snow.depth, opts.snow.fill, opts.snow.maxY);
  if (opts.pines) pines(pts, grp, opts.pines.n, opts.pines.color, opts.pines.size);
  return grp;
}

function build() {
  const sky = document.querySelector('.sky'); if (!sky) return;
  sky.replaceChildren(); seed = 20261011;
  const vw = Math.max(320, window.innerWidth), vh = Math.max(480, window.innerHeight);
  W = Math.round(vw * H / (SCENE_FRAC * vh));                    // viewBox width that matches the screen, so nothing is cropped
  const k = .55 + .45 * Math.min(1, W / 1000);                   // narrow screens get gentler peaks
  const add = (cls) => { const d = document.createElement('div'); d.className = cls; sky.append(d); return d; };
  const stars = add('stars');
  for (let i = 0; i < 0; i++) { const s = document.createElement('i'); // stars removed: specks behind text hurt readability
    s.style.cssText = `left:${rnd() * 100}%;top:${rnd() * 9}%;--d:${2 + rnd() * 4}s;--o:${.25 + rnd() * .3};width:${rnd() < .15 ? 3 : 2}px;height:${rnd() < .15 ? 3 : 2}px;animation-delay:${rnd() * 4}s`; stars.append(s); }
  add('rays'); add('sun');
  ['c1', 'c2', 'c3'].forEach(c => add('cloud ' + c));
  const svg = el('svg', { class: 'scene', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMax meet', 'aria-hidden': 'true' });
  sky.append(svg);
  layer(svg, 'g-far', 262, 215 * k, .66, [[0, '#8b78d6'], [1, '#4f4fb0']], { cls: 'far', opacity: .9, snow: { depth: 34, fill: 'rgba(255,238,232,.92)', maxY: 222 } });
  layer(svg, 'g-mid', 335, 165 * k, .64, [[0, '#4a4cb8'], [1, '#232a82']], { cls: 'mid', snow: { depth: 26, fill: 'rgba(235,230,255,.85)', maxY: 300 }, pines: { n: 30, color: '#1b2272', size: 22 } });
  layer(svg, 'g-near', 412, 115 * k, .62, [[0, '#1a2270'], [1, '#0a1042']], { cls: 'near', pines: { n: 70, color: '#080e3a', size: 34 } });
  layer(svg, 'g-fore', 478, 50 * k, .6, [[0, '#0a1040'], [1, '#050a2c']], { cls: 'fore', pines: { n: 46, color: '#050a2c', size: 54 } });
  sky.append(svg);
}
build();
let lastW = innerWidth, t;
addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (Math.abs(innerWidth - lastW) > 40) { lastW = innerWidth; build(); } }, 250); });
