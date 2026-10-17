// Loader scene: Colorado rises as a tilted slab, a Themis figure lights up glowing blue at
// every courthouse, and a judge's head turns in the middle. One 2D canvas with its own perspective maths: CSS 3D billboards
// (rotateX(-a) inside a rotateX(a) plane) flattened in Chrome but not in WebKit, so the scene is drawn, not composed.
// Light on purpose: no WebGL, one 47 KB sprite (24 frames of a Meshy-made bust, rendered offline), county lines from the
// co-map.json the map step already uses (cached by the service worker).

// courthouses, pre-projected to the 545.6 × 400 frame of co-map.json (tools/build_map.py), in % of width / height
const PINS = [[3.7,22.8],[7.0,48.2],[2.2,80.7],[21.6,12.1],[18.2,36.5],[14.1,56.2],[6.8,91.0],[17.0,62.9],[31.8,12.8],[19.8,74.3],[16.9,92.5],[19.9,79.4],[32.0,33.3],[39.5,6.9],[24.9,74.1],[32.0,45.1],[30.4,61.2],[42.2,23.1],[30.4,78.5],[39.4,43.6],[28.6,93.1],[43.0,37.6],[43.7,44.3],[47.9,32.3],[38.6,82.8],[43.7,61.4],[41.7,72.7],[56.8,10.3],[54.0,24.6],[58.0,31.4],[45.5,88.1],[43.5,97.8],[62.3,14.4],[61.3,25.7],[51.3,71.5],[55.3,56.2],[60.3,35.4],[54.5,63.8],[59.9,40.6],[60.4,54.1],[50.9,97.6],[65.5,41.3],[63.4,68.0],[75.2,18.7],[61.0,84.2],[83.5,9.3],[65.0,95.5],[83.3,20.8],[79.6,46.4],[75.6,69.4],[78.7,75.2],[96.9,0.3],[96.4,10.4],[83.3,73.2],[97.5,23.0],[89.6,62.9],[96.9,42.3],[95.7,54.3],[91.8,72.6],[91.9,89.7]];
const MW = 545.6, MH = 400;
const THEMIS = new Path2D('M10 7.3C7.6 7.3 6.8 9.6 6.8 12L5.2 30.4Q10 31.7 14.8 30.4L13.2 12C13.2 9.6 12.4 7.3 10 7.3ZM12.5 4.4A2.5 2.5 0 1 1 7.5 4.4A2.5 2.5 0 1 1 12.5 4.4ZM11.6 8.4H15A1.7 1.1 0 0 1 11.6 8.4ZM17.6 8.4H21A1.7 1.1 0 0 1 17.6 8.4Z');
const THEMIS_LINES = new Path2D('M12.6 9.2L16.4 5.2M12.8 4.4H19.6M13.2 4.4L12 8.4M13.2 4.4L14.4 8.4M19.2 4.4L18 8.4M19.2 4.4L20.4 8.4M7.4 10.4L3.6 22.4');
const FRAMES = 24, HEAD_W = 74, HEAD_H = 85;
const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
// colour: a slow red → violet → blue → violet → red flow across the state
const STOPS = [[168, 36, 63], [91, 47, 168], [42, 63, 191], [91, 47, 168]];          // slab: deep tones so the lines and figures pop
const GLOW = [[255, 107, 136], [195, 140, 255], [127, 220, 255], [195, 140, 255]];    // lit figures
const mix = (pal, u) => { u = ((u % 1) + 1) % 1; const f = u * pal.length, i = Math.floor(f), k = f - i, a = pal[i], b = pal[(i + 1) % pal.length];
  return a.map((v, j) => Math.round(v + (b[j] - v) * k)); };
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const TINTS = 16;

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let rings = null, ringsP = null, head = null;            // shared by every scene: county outlines and the head sprite load once
function loadShared() {
  if (!head) { head = new Image(); head.decoding = 'async'; head.src = 'img/judge-turn.webp'; }
  if (!ringsP) ringsP = fetch('co-map.json').then(r => r.json()).then(m => {       // county outlines: "M x y L x y … Z" rings, absolute coordinates
    rings = m.counties.flatMap(c => c.d.split(/(?=M)/).map(seg => (seg.match(/-?\d+(\.\d+)?/g) || []).map(Number).reduce((a, v, i, arr) => (i % 2 ? a : a.concat([[v, arr[i + 1]]])), [])));
  }).catch(() => {});
}
function makeScene(host, o = {}) {            // o.spread: the most of the width the state may take (fit() may shrink it)
  let cv, cx, raf = 0, t0 = 0, glyphs = null, dpr = 1, W = 0, H = 0, PW0 = 0, CY = 0;

function glyph(color, glow) {           // one Themis figure, pre-drawn once per state (scaled when placed)
  const c = document.createElement('canvas'), s = 3 * dpr; c.width = 32 * s; c.height = 40 * s;
  const g = c.getContext('2d'); g.scale(s, s); g.translate(6, 5);
  if (glow) { g.shadowColor = glow; g.shadowBlur = 6; }
  g.fillStyle = color; g.strokeStyle = color; g.lineWidth = 1.3; g.lineCap = 'round';
  g.fill(THEMIS); g.stroke(THEMIS_LINES); if (glow) { g.fill(THEMIS); g.stroke(THEMIS_LINES); }
  return c;
}
function size() {
  const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
  W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  fit();
  glyphs = { dim: glyph('rgba(232,226,255,.5)'), lit: Array.from({ length: TINTS }, (_, i) => { const c = mix(GLOW, i / TINTS); return glyph(rgb(c), rgb(c, .95)); }) };
}
// the largest slab — near corners widened by perspective, the head above, the front face below — that fits this canvas
// at the final tilt (10-16: on a 505 px hero column the near corners ran past both edges)
function fit() {
  const tl = 56 * Math.PI / 180, c = Math.cos(tl), s = Math.sin(tl), D = 820;
  const box = pw => { const ph = pw * MH / MW, kN = D / (D - ph / 2 * s), kF = D / (D + ph / 2 * s);
    return { w: pw * kN, top: Math.min(-ph / 2 * c * kF - 22, 0.06 * ph * c - HEAD_H), bot: ph / 2 * c * kN + 16 * kN }; };
  let pw = W * (o.spread || 0.78);
  for (let i = 0; i < 4; i++) { const b = box(pw); pw *= Math.min(1, (W * 0.96) / b.w, (H * 0.94) / (b.bot - b.top)); }
  const b = box(pw); PW0 = pw; CY = H / 2 - (b.top + b.bot) / 2;
}
// plane coordinates (map units) → screen: tilt about the plane's middle, then a simple perspective toward the stage centre
function projector(tilt, lift, scale) {
  const PW = PW0 * scale, PH = PW * MH / MW, D = 820, c = Math.cos(tilt), s = Math.sin(tilt), cx0 = W / 2, cy0 = CY + lift;
  return (mx, my, up = 0) => {
    const X = (mx / MW - 0.5) * PW, Y = (my / MH - 0.5) * PH, z = -Y * s, k = D / (D + z);
    return [cx0 + X * k, cy0 + (Y * c - up) * k, k];
  };
}
function draw(now) {
  if (!cv.isConnected || cv.closest('[hidden]')) { raf = 0; return; }
  const t = (now - t0) / 1000, rm = still();
  const p = rm ? 1 : ease(t / 1.1), tilt = (80 - 24 * p) * Math.PI / 180, P = projector(tilt, 46 * (1 - p), 0.8 + 0.2 * p);
  cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H); cx.globalAlpha = rm ? 1 : Math.min(1, t / 0.5);
  // slab: front face (thickness), top face, county lines, rim
  const c4 = [[0, 0], [MW, 0], [MW, MH], [0, MH]].map(([x, y]) => P(x, y)), th = 14;
  const [bl, br] = [c4[3], c4[2]];
  cx.beginPath(); cx.moveTo(bl[0], bl[1]); cx.lineTo(br[0], br[1]); cx.lineTo(br[0], br[1] + th * br[2]); cx.lineTo(bl[0], bl[1] + th * bl[2]); cx.closePath();
  const flow = 0.6 + t * 0.32;                                  // a full colour cycle every ~3 s: a visitor sees every colour pass over every region
                                                               // (a slow flow froze into 'blue west, red east' at the moment the splash closed)
  let g = cx.createLinearGradient(bl[0], 0, br[0], 0);
  for (let k = 0; k <= 4; k++) { const c = mix(STOPS, k / 4 * 0.75 + flow); g.addColorStop(k / 4, rgb(c.map(v => Math.round(v * 0.45)))); }
  cx.fillStyle = g; cx.fill();
  cx.beginPath(); c4.forEach(([x, y], i) => i ? cx.lineTo(x, y) : cx.moveTo(x, y)); cx.closePath();
  g = cx.createLinearGradient(c4[0][0], c4[0][1], c4[2][0], c4[2][1]);
  for (let k = 0; k <= 4; k++) g.addColorStop(k / 4, rgb(mix(STOPS, k / 4 * 0.75 + flow)));
  cx.fillStyle = g; cx.fill();
  if (rings) { cx.beginPath(); for (const r of rings) r.forEach(([x, y], i) => { const q = P(x, y); i ? cx.lineTo(q[0], q[1]) : cx.moveTo(q[0], q[1]); }); cx.strokeStyle = 'rgba(236,228,255,.24)'; cx.lineWidth = 0.8; cx.stroke(); }
  cx.beginPath(); c4.forEach(([x, y], i) => i ? cx.lineTo(x, y) : cx.moveTo(x, y)); cx.closePath(); cx.strokeStyle = 'rgba(236,228,255,.85)'; cx.lineWidth = 1.6; cx.stroke();
  // figures, back to front; each lights up in turn, west to east (a full sweep in ~1.2 s, then they stay lit and breathe)
  const n = PINS.length, order = PINS.map((v, i) => [v, i]).sort((a, b) => a[0][1] - b[0][1]);
  for (const [[px, py], i] of order) {
    const [sx, sy, k] = P(px / 100 * MW, py / 100 * MH), d = 0.4 + 1.6 * i / n, on = rm ? 1 : Math.min(1, Math.max(0, (t - d) / 0.45));
    const w = 12 * k, h = 15 * k;
    const u = (px / 100 + py / 100) * 0.375 + flow, tint = mix(GLOW, u);       // the same flow as the slab under it
    if (on > 0) { cx.save(); cx.globalAlpha *= on; const rg = cx.createRadialGradient(sx, sy, 0, sx, sy, 9 * k); rg.addColorStop(0, rgb(tint, .85)); rg.addColorStop(1, rgb(tint, 0));
      cx.fillStyle = rg; cx.beginPath(); cx.ellipse(sx, sy, 9 * k, 9 * k * Math.cos(tilt), 0, 0, 7); cx.fill(); cx.restore(); }
    cx.drawImage(glyphs.dim, sx - w * 0.8, sy - h * 1.17, w * 1.6, h * 1.33);
    if (on > 0) { cx.save(); cx.globalAlpha *= on * (rm ? 1 : 0.85 + 0.15 * Math.sin(t * 3 + i)); cx.drawImage(glyphs.lit[Math.floor((((u % 1) + 1) % 1) * TINTS) % TINTS], sx - w * 0.8, sy - h * 1.17, w * 1.6, h * 1.33); cx.restore(); }
  }
  // the judge's head, standing in the middle of the state
  if (head && head.complete && head.naturalWidth) {
    const a = rm ? 1 : ease((t - 0.25) / 0.8); if (a > 0) {
      const [hx, hy, k] = P(MW * 0.5, MH * 0.56), f = rm ? 0 : Math.floor(t * 10) % FRAMES, sw = head.naturalWidth / FRAMES, sh = head.naturalHeight;
      const hw = HEAD_W * k * (0.75 + 0.25 * a), hh = HEAD_H * k * (0.75 + 0.25 * a);
      cx.save(); cx.globalAlpha *= a; cx.fillStyle = 'rgba(5,10,50,.45)'; cx.beginPath(); cx.ellipse(hx, hy, hw * 0.42, hw * 0.42 * Math.cos(tilt), 0, 0, 7); cx.fill();
      cx.drawImage(head, f * sw, 0, sw, sh, hx - hw / 2, hy - hh * 0.97, hw, hh); cx.restore();
    }
  }
  raf = requestAnimationFrame(draw);
}
  function start() {
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'lcv'; host.append(cv); cx = cv.getContext('2d'); addEventListener('resize', () => { if (cv && cv.isConnected) size(); }); }
    loadShared(); size(); t0 = performance.now(); if (!raf) raf = requestAnimationFrame(draw);
  }
  return { start };
}
let loaderInst = null;
export function loaderScene() {              // the full-screen loader: replays from the start every time it is shown
  const st = document.querySelector('.lstage'); if (!st || matchMedia('(min-width: 1024px)').matches) return;   // desktop has no 3D scene
  (loaderInst || (loaderInst = makeScene(st))).start();
}
