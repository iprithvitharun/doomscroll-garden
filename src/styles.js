// Art styles. Every style draws the same scene (overgrowth.js) its own way.
// A style is { k(dpr): backing px per CSS px, pixelated, assets?, render(g, scene, env) }.
// env = { W, H, k, theme: 'light'|'dark', hue, imgs }.
//
// Round 1 (A–G) and round 2 renderers are ported from the art-direction comps; round 4 (photoreal) uses the
// keyed morning-glory photos; round 6 (pixel vines) uses the baked sprite atlas.
(() => {
  const DG = globalThis.DG;
  const { clamp, lerp, rng, TAU } = DG;
  const hex2 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgb = (c, a = 1) => `rgba(${c.map(v => Math.round(clamp(v, 0, 255))).join(',')},${a})`;
  const shade = (h, k) => { const c = Array.isArray(h) ? h : hex2(h); return k >= 0 ? c.map(v => v + (255 - v) * k) : c.map(v => v * (1 + k)); };
  const toHex = c => '#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const shadeHex = (h, k) => toHex(shade(h, k));
  const mixHex = (a, b, t) => { const A = hex2(a), B = hex2(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
  function hueRotate(hex, deg) {
    if (!deg) return hex;
    let [r, g, b] = hex2(hex).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    h = ((h + deg / 360) % 1 + 1) % 1;
    const f = (p, q, t) => { t = (t % 1 + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return toHex([f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(v => v * 255));
  }

  const PAL = {
    light: { hedge: '#2a5424', stem: '#4f7f3b', tendril: '#5d8f45', leaf: '#5aa047', leafAlt: '#4f9440', leafDark: '#3e7c36', vein: '#2f5f2a', petal: '#4760d8', petalLight: '#8d9ff4', throat: '#f5f6ff', center: '#f2cd45', ray: '#dfe4ff', bud: '#b4a8f2', budStripe: '#6152cf', sepal: '#4f7f3b' },
    dark: { hedge: '#22461f', stem: '#5f9449', tendril: '#6ea354', leaf: '#68b153', leafAlt: '#5ca44a', leafDark: '#468a3c', vein: '#2f5f2a', petal: '#5a74ef', petalLight: '#9dadfa', throat: '#f5f6ff', center: '#f2cd45', ray: '#e3e8ff', bud: '#bfb4f7', budStripe: '#6d5fe0', sepal: '#5f9449' },
  };
  const palCache = new Map();
  function palette(theme, hue) {
    const key = theme + hue; if (palCache.has(key)) return palCache.get(key);
    const P = { ...PAL[theme] };
    for (const k of ['petal', 'petalLight', 'ray', 'bud', 'budStripe']) P[k] = hueRotate(P[k], hue);
    palCache.set(key, P); return P;
  }

  // ------------------------------------------------------------------ shapes (CSS px)
  function stemRibbon(ctx, pts, m, k = 1) {
    const n = pts.length, tipS = pts[n - 1].s, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], w = DG.stemW(p, m) * k * Math.min(1, 0.35 + (tipS - p.s) / 24) / 2, nx = -Math.sin(p.a), ny = Math.cos(p.a);
      L.push(p.x + nx * w, p.y + ny * w); R.push(p.x - nx * w, p.y - ny * w);
    }
    ctx.beginPath(); ctx.moveTo(L[0], L[1]);
    for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i], L[i + 1]);
    for (let i = R.length - 2; i >= 0; i -= 2) ctx.lineTo(R[i], R[i + 1]);
    ctx.closePath();
  }
  const PET = 0.32;
  function leafFrame(ctx, lf) { ctx.translate(lf.x + Math.cos(lf.ang) * lf.size * PET, lf.y + Math.sin(lf.ang) * lf.size * PET); ctx.rotate(lf.ang); }
  function leafPath(ctx, L) {
    const w = L * 0.6;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-0.2 * L, -0.62 * w, 0.4 * L, -0.82 * w, L, 0);
    ctx.bezierCurveTo(0.4 * L, 0.82 * w, -0.2 * L, 0.62 * w, 0, 0);
    ctx.closePath();
  }
  function leafPolyLocal(L, n = 10) {
    const w = L * 0.6, out = [], bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; };
    for (let i = 0; i < n; i++) { const t = i / n; out.push([bez(0, -0.2 * L, 0.4 * L, L, t), bez(0, -0.62 * w, -0.82 * w, 0, t)]); }
    for (let i = 0; i < n; i++) { const t = i / n; out.push([bez(L, 0.4 * L, -0.2 * L, 0, t), bez(0, 0.82 * w, 0.62 * w, 0, t)]); }
    return out;
  }
  function flowerFrame(ctx, f) { ctx.translate(f.cx, f.cy); ctx.rotate(f.tilt); ctx.scale(1, f.squash); ctx.rotate(-f.tilt); }
  function flowerPath(ctx, R, rot) {
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) { const ph = i / 60 * TAU, rr = R * (0.9 + 0.1 * Math.cos(5 * (ph - rot))); i ? ctx.lineTo(Math.cos(ph) * rr, Math.sin(ph) * rr) : ctx.moveTo(Math.cos(ph) * rr, Math.sin(ph) * rr); }
    ctx.closePath();
  }
  function flowerPolyLocal(R, rot, n = 16) { const out = []; for (let i = 0; i < n; i++) { const ph = i / n * TAU, rr = R * (0.9 + 0.1 * Math.cos(5 * (ph - rot))); out.push([Math.cos(ph) * rr, Math.sin(ph) * rr]); } return out; }
  function budFrame(ctx, b) { ctx.translate(b.cx, b.cy); ctx.rotate(b.budA); }
  function budPath(ctx, l, w) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(0.15 * l, -0.7 * w, 0.75 * l, -0.35 * w, l, 0); ctx.bezierCurveTo(0.75 * l, 0.35 * w, 0.15 * l, 0.7 * w, 0, 0); ctx.closePath(); }
  const budSize = b => [b.R * 2.1 * (0.35 + 0.65 * b.g), b.R * 0.62 * (0.4 + 0.6 * b.g)];
  const flowerR = f => f.R * (0.5 + 0.5 * f.o);
  function tendrilPts(td) { const out = []; let a = td.a, x = td.x, y = td.y; for (let i = 0; i < 26; i++) { a += td.dir * (0.22 + i * 0.018); const step = td.size * 0.55 * Math.pow(0.93, i); x += Math.cos(a) * step; y += Math.sin(a) * step; out.push([x, y]); } return out; }
  function pedicel(ctx, from, x, y) { ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(x, y); ctx.stroke(); }

  // flat drawing of the whole scene (used directly by some styles, rasterised by others)
  function drawFlat(ctx, sc, P, o = {}) {
    const sw = o.stemW || 1;
    if (o.hedge !== false) { ctx.fillStyle = P.hedge; for (const h of sc.hedge) { ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.fill(); } }
    // back strands (in shade) first, then the front ones
    for (const back of [true, false]) {
      ctx.fillStyle = back ? P.vein : P.stem;
      for (const st of sc.stems) if (!!st.back === back) { stemRibbon(ctx, st.pts, sc.m, sw); ctx.fill(); }
      for (const lf of sc.leaves) {
        if (!!lf.back !== back) continue;
        ctx.save();
        ctx.strokeStyle = back ? P.vein : P.stem; ctx.lineWidth = Math.max(1, lf.size * 0.08) * sw; ctx.beginPath(); ctx.moveTo(lf.x, lf.y); ctx.lineTo(lf.x + Math.cos(lf.ang) * lf.size * 0.34, lf.y + Math.sin(lf.ang) * lf.size * 0.34); ctx.stroke();
        leafFrame(ctx, lf); leafPath(ctx, lf.size);
        ctx.fillStyle = back ? P.leafDark : lf.tone < 0.5 ? P.leaf : P.leafAlt; ctx.fill();
        ctx.save(); ctx.clip(); ctx.fillStyle = back ? P.vein : P.leafDark; ctx.fillRect(-lf.size, 0, lf.size * 3, lf.size * 2); ctx.restore();
        if (o.vein) { ctx.strokeStyle = P.vein; ctx.lineWidth = o.vein; ctx.beginPath(); ctx.moveTo(lf.size * 0.05, 0); ctx.lineTo(lf.size * 0.82, 0); ctx.stroke(); }
        ctx.restore();
      }
    }
    ctx.strokeStyle = P.tendril; ctx.lineWidth = 1.1 * sw; ctx.lineCap = 'round';
    for (const td of sc.tendrils) { const q = tendrilPts(td); ctx.beginPath(); ctx.moveTo(td.x, td.y); for (const [x, y] of q) ctx.lineTo(x, y); ctx.stroke(); }
    for (const b of sc.buds) {
      ctx.save(); ctx.strokeStyle = P.stem; ctx.lineWidth = 1.1 * sw; pedicel(ctx, b.p, b.cx, b.cy);
      budFrame(ctx, b); const [l, w] = budSize(b);
      budPath(ctx, l, w); ctx.fillStyle = P.bud; ctx.fill();
      if (o.budStripe !== false) { ctx.save(); ctx.clip(); ctx.strokeStyle = P.budStripe; ctx.lineWidth = Math.max(1, w * 0.45); ctx.beginPath(); ctx.moveTo(l * 0.15, w * 0.5 * b.twist); ctx.quadraticCurveTo(l * 0.55, -w * 0.6 * b.twist, l, 0); ctx.stroke(); ctx.restore(); }
      ctx.fillStyle = P.sepal; ctx.beginPath(); ctx.moveTo(0, -w * 0.6); ctx.lineTo(l * 0.32, 0); ctx.lineTo(0, w * 0.6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    for (const f of sc.flowers) {
      ctx.save(); ctx.strokeStyle = P.stem; ctx.lineWidth = 1.1 * sw; pedicel(ctx, f.p, f.cx, f.cy);
      flowerFrame(ctx, f); const R = flowerR(f) * (o.flowerScale || 1);
      flowerPath(ctx, R, f.rot); ctx.fillStyle = P.petal; ctx.fill();
      flowerPath(ctx, R * 0.66, f.rot); ctx.fillStyle = P.petalLight; ctx.fill();
      if (o.rays !== false) { ctx.strokeStyle = P.ray; ctx.lineWidth = Math.max(0.8, R * 0.09); for (let k = 0; k < 5; k++) { const a = f.rot + k * TAU / 5; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3); ctx.lineTo(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86); ctx.stroke(); } }
      ctx.beginPath(); ctx.arc(0, 0, R * 0.33, 0, TAU); ctx.fillStyle = P.throat; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, Math.max(1, R * 0.13), 0, TAU); ctx.fillStyle = P.center; ctx.fill();
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ raster helpers
  const work = (() => { let c, x; return (w, h) => { if (!c) { c = document.createElement('canvas'); x = c.getContext('2d', { willReadFrequently: true }); } if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, w, h); return x; }; })();
  function snap(d, pal, alphaCut) {
    const cache = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < alphaCut) { d[i + 3] = 0; continue; }
      const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; let q = cache.get(key);
      if (!q) { let bd = 1e9; for (const c of pal) { const dd = (c[0] - d[i]) ** 2 + (c[1] - d[i + 1]) ** 2 + (c[2] - d[i + 2]) ** 2; if (dd < bd) { bd = dd; q = c; } } cache.set(key, q); }
      d[i] = q[0]; d[i + 1] = q[1]; d[i + 2] = q[2]; d[i + 3] = 255;
    }
  }
  const palOf = P => [...new Set(Object.values(P))].map(hex2);
  // the flat scene at 1/S resolution, colours snapped to the palette, hard alpha
  function rasterise(sc, P, S, W, H, o = {}) {
    const w = Math.ceil(W / S), h = Math.ceil(H / S), x = work(w, h);
    x.setTransform(1 / S, 0, 0, 1 / S, 0, 0); drawFlat(x, sc, P, o); x.setTransform(1, 0, 0, 1, 0, 0);
    const img = x.getImageData(0, 0, w, h); snap(img.data, palOf(P), o.alphaCut || 110);
    return { img, w, h };
  }

  // ------------------------------------------------------------------ sprite helpers (vector styles)
  // A sprite is drawn once at canonical size; `o` is the origin inside it, in CSS units.
  function mk(w, h, ox, oy, k, draw) {
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w * k)); c.height = Math.max(1, Math.ceil(h * k));
    const x = c.getContext('2d'); x.scale(k, k); x.translate(ox, oy); draw(x);
    return { c, ox, oy, k };
  }
  function blit(g, spr, x, y, ang, s, k, flip = 1) {
    const c = Math.cos(ang) * s * k, si = Math.sin(ang) * s * k;
    g.setTransform(c, si, -si * flip, c * flip, x * k, y * k);
    g.drawImage(spr.c, -spr.ox, -spr.oy, spr.c.width / spr.k, spr.c.height / spr.k);
  }
  function blitXY(g, spr, x, y, ang, sx, sy, k) {
    const c = Math.cos(ang) * k, si = Math.sin(ang) * k;
    g.setTransform(c * sx, si * sx, -si * sy, c * sy, x * k, y * k);
    g.drawImage(spr.c, -spr.ox, -spr.oy, spr.c.width / spr.k, spr.c.height / spr.k);
  }
  function blitFlower(g, spr, f, R0, k) {
    const s = flowerR(f) / R0;
    g.setTransform(k, 0, 0, k, 0, 0); g.translate(f.cx, f.cy); g.rotate(f.tilt); g.scale(1, f.squash); g.rotate(-f.tilt); g.rotate(f.rot); g.scale(s, s);
    g.drawImage(spr.c, -spr.ox, -spr.oy, spr.c.width / spr.k, spr.c.height / spr.k);
  }
  const L0 = 52, R0 = 16, H0 = 40; // canonical leaf length, flower radius, hedge radius
  const spriteCache = new Map();
  function cached(key, make) { if (!spriteCache.has(key)) spriteCache.set(key, make()); return spriteCache.get(key); }
  function grainPattern(ctx) {
    return cached('grain', () => { const g = document.createElement('canvas'); g.width = g.height = 128; const gx = g.getContext('2d'), gd = gx.createImageData(128, 128), r = rng(5); for (let i = 0; i < gd.data.length; i += 4) { const v = r() * 255; gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v; gd.data[i + 3] = 26; } gx.putImageData(gd, 0, 0); return g; });
  }
  const leafBox = (draw, pad = 3) => (k) => mk(L0 * (1 + PET) + pad * 2, L0 * 0.8 + pad * 2, pad, L0 * 0.4 + pad, k, draw);
  function strokeStems(g, sc, k, color, wk, alpha = 1) {
    g.setTransform(k, 0, 0, k, 0, 0); g.globalAlpha = alpha; g.fillStyle = color;
    for (const st of sc.stems) { stemRibbon(g, st.pts, sc.m, wk); g.fill(); }
    g.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ styles
  const dpr = d => Math.min(2, d || 1);
  // the procedural flowers read small against a page of leaves, so they draw bigger than the network's size
  const bigger = (sc, f = 1.6) => ({ ...sc, flowers: sc.flowers.map(x => ({ ...x, R: x.R * f })), buds: sc.buds.map(x => ({ ...x, R: x.R * f })) });
  const S = {};

  // Round 1 A: chunky pixel art on a 3 px grid, palette-snapped, coloured outline, top-left rim light
  S.pixel = { single: true, k: () => 1 / 3, pixelated: true, render(g, sc, env) {
    sc = bigger(sc);
    const P = palette(env.theme, env.hue), R = rasterise(sc, P, 3, env.W, env.H, { stemW: 1.5, rays: false });
    const { w, h, img } = R, d = img.data, src = new Uint8ClampedArray(d), dark = env.theme === 'dark';
    const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] === 0) {
        let nb = -1; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (op(x + dx, y + dy)) { nb = ((y + dy) * w + x + dx) * 4; break; }
        if (nb >= 0) { const q = shade([src[nb], src[nb + 1], src[nb + 2]], dark ? -0.62 : -0.58); d[i] = q[0]; d[i + 1] = q[1]; d[i + 2] = q[2]; d[i + 3] = 255; }
      } else if (!op(x - 1, y - 1) || !op(x, y - 1)) { const q = shade([src[i], src[i + 1], src[i + 2]], 0.28); d[i] = q[0]; d[i + 1] = q[1]; d[i + 2] = q[2]; }
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.putImageData(img, 0, 0);
  } };

  // Round 1 B: 1-bit dither, two inks on paper, Bayer shading
  S.dither = { single: true, k: () => 1 / 2, pixelated: true, render(g, sc, env) {
    sc = bigger(sc);
    const P = palette(env.theme, env.hue), dark = env.theme === 'dark', R = rasterise(sc, P, 2, env.W, env.H, { stemW: 1.2, alphaCut: 100 });
    const { w, h, img } = R, d = img.data, src = new Uint8ClampedArray(d);
    const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const paper = hex2(dark ? '#18202c' : '#f7f3e8'), inkG = hex2(dark ? '#cfe8b8' : '#1f3a1c'), inkB = hex2(dark ? '#c8d0ff' : '#1d2a8a');
    const TONE = {}, tone = (hx, v, blue) => { TONE[hex2(hx).join(',')] = [v, blue]; };
    tone(P.hedge, dark ? 0.82 : 0.16, false); tone(P.stem, 0, false); tone(P.tendril, 0, false); tone(P.leaf, 0.42, false); tone(P.leafAlt, 0.36, false); tone(P.leafDark, 0.07, false); tone(P.vein, 0, false);
    tone(P.petal, 0.4, true); tone(P.petalLight, 0.78, true); tone(P.throat, 1.01, true); tone(P.center, 0.9, true); tone(P.ray, 0.9, true); tone(P.bud, 0.62, true); tone(P.budStripe, 0.06, true);
    const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] === 0) {
        let nb = -1; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (op(x + dx, y + dy)) { nb = ((y + dy) * w + x + dx) * 4; break; }
        if (nb >= 0) { const q = src[nb + 2] > src[nb + 1] + 20 ? inkB : inkG; d[i] = q[0]; d[i + 1] = q[1]; d[i + 2] = q[2]; d[i + 3] = 255; }
        continue;
      }
      const part = TONE[src[i] + ',' + src[i + 1] + ',' + src[i + 2]], lum = part ? part[0] : 0.4, blue = part ? part[1] : false;
      const q = lum < (B[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? (blue ? inkB : inkG) : paper;
      d[i] = q[0]; d[i + 1] = q[1]; d[i + 2] = q[2];
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.putImageData(img, 0, 0);
  } };

  // Round 1 C: ASCII, every leaf, petal and stem a character on a monospace grid, on a terminal-coloured ground
  S.ascii = { single: true, k: dpr, render(g, sc, env) {
    const P = palette(env.theme, env.hue), dark = env.theme === 'dark', k = env.k, cw = 6, ch = 9, cols = Math.ceil(env.W / cw), rows = Math.ceil(env.H / ch);
    const x = work(cols, rows); x.setTransform(1 / cw, 0, 0, 1 / ch, 0, 0);
    const sc2 = { ...sc, stems: [], tendrils: [], leaves: sc.leaves.map(l => ({ ...l, size: l.size * 1.25 })), flowers: sc.flowers.map(f => ({ ...f, R: f.R * 2 })), buds: sc.buds.map(b => ({ ...b, R: b.R * 2 })) };
    drawFlat(x, sc2, P, { rays: false, budStripe: false });
    const d = x.getImageData(0, 0, cols, rows).data;
    const types = [['hedge', P.hedge], ['leaf', P.leaf], ['leaf', P.leafAlt], ['leafD', P.leafDark], ['petal', P.petal], ['petalL', P.petalLight], ['throat', P.throat], ['center', P.center], ['bud', P.bud], ['stem', P.stem]].map(([t, h]) => [t, hex2(h)]);
    const grid = new Array(cols * rows).fill(null);
    for (let i = 0; i < cols * rows; i++) {
      if (d[i * 4 + 3] < 90) continue;
      let best = null, bd = 1e9; for (const [t, c] of types) { const dd = (c[0] - d[i * 4]) ** 2 + (c[1] - d[i * 4 + 1]) ** 2 + (c[2] - d[i * 4 + 2]) ** 2; if (dd < bd) { bd = dd; best = t; } }
      grid[i] = best;
    }
    for (const st of sc.stems) for (const p of st.pts) {
      const gx = Math.floor(p.x / cw), gy = Math.floor(p.y / ch); if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
      const i = gy * cols + gx; if (grid[i] && grid[i] !== 'hedge') continue;
      const dx = Math.cos(p.a); grid[i] = dx > 0.42 ? 'stem/' : dx < -0.42 ? 'stem\\' : 'stem|';
    }
    g.setTransform(k, 0, 0, k, 0, 0);
    // ground behind covered cells, so the page doesn't show between the characters
    g.fillStyle = dark ? '#0b100c' : '#f2f0e8';
    for (let gy = 0; gy < rows; gy++) { let run = -1; for (let gx = 0; gx <= cols; gx++) { const on = gx < cols && grid[gy * cols + gx]; if (on && run < 0) run = gx; if (!on && run >= 0) { g.fillRect(run * cw, gy * ch, (gx - run) * cw, ch); run = -1; } } }
    const glyph = { leaf: '#', leafD: '%', petal: '@', petalL: 'o', throat: '.', center: '*', bud: '0', stem: '|', 'stem/': '/', 'stem\\': '\\', 'stem|': '|' };
    const HG = [':', ';', '"', ':', '.', ','];
    const col = { hedge: dark ? '#3c6e33' : '#5f8a52', leaf: P.leaf, leafD: P.leafDark, petal: P.petal, petalL: P.petalLight, throat: dark ? '#f5f6ff' : '#9aa6e8', center: P.center, bud: P.bud, stem: P.stem, 'stem/': P.stem, 'stem\\': P.stem, 'stem|': P.stem };
    g.font = `700 ${ch + 0.5}px Menlo, Monaco, Consolas, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      const t = grid[gy * cols + gx]; if (!t) continue;
      const hsh = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
      let gl = t === 'hedge' ? HG[hsh % HG.length] : glyph[t];
      if (t === 'leaf' || t === 'leafD') { const e = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const j = grid[(gy + dy) * cols + gx + dx]; return !j || !j.startsWith('leaf'); }); if (e) gl = t === 'leaf' ? '*' : '+'; }
      if (t === 'petal' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const j = grid[(gy + dy) * cols + gx + dx]; return !j || !j.startsWith('petal'); })) gl = '&';
      g.fillStyle = rgb(shade(col[t], ((hsh % 100) / 100 - 0.5) * 0.3)); g.fillText(gl, gx * cw + cw / 2, gy * ch + ch / 2 + 0.5);
    }
  } };

  // Round 1 D: cross-stitch on cloth, X stitches on a 6 px grid, stems as backstitch
  S.stitch = { single: true, k: dpr, render(g, sc, env) {
    sc = bigger(sc);
    const P = palette(env.theme, env.hue), dark = env.theme === 'dark', k = env.k, Sx = 6;
    const R = rasterise({ ...sc, stems: [], tendrils: [] }, P, Sx, env.W, env.H, { rays: false, alphaCut: 120 });
    const { w, h, img } = R, d = img.data;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = dark ? '#1f2522' : '#efe9dc';   // aida cloth behind the stitches
    for (let y = 0; y < h; y++) { let run = -1; for (let x = 0; x <= w; x++) { const on = x < w && d[(y * w + x) * 4 + 3] > 0; if (on && run < 0) run = x; if (!on && run >= 0) { g.fillRect(run * Sx, y * Sx, (x - run) * Sx, Sx); run = -1; } } }
    g.lineCap = 'round';
    for (const st of sc.stems) {
      const pts = []; for (let i = 0; i < st.pts.length; i += 2) { const p = st.pts[i], q = [Math.round(p.x / Sx) * Sx, Math.round(p.y / Sx) * Sx]; if (!pts.length || pts[pts.length - 1][0] !== q[0] || pts[pts.length - 1][1] !== q[1]) pts.push(q); }
      g.strokeStyle = shadeHex(P.stem, -0.45); g.lineWidth = 2.8; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x + .4, y + .6) : g.moveTo(x + .4, y + .6)); g.stroke();
      g.strokeStyle = P.stem; g.lineWidth = 2.2; g.setLineDash([Sx * 0.8, Sx * 0.25]); g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.setLineDash([]);
    }
    const crossFor = c => cached(`x${c.join(',')}|${k}`, () => mk(Sx, Sx, 0, 0, k, (x) => {
      const p = 0.6;
      for (const [x1, y1, x2, y2] of [[p, Sx - p, Sx - p, p], [p, p, Sx - p, Sx - p]]) {
        x.strokeStyle = rgb(shade(c, -0.5), 0.5); x.lineWidth = 2.6; x.lineCap = 'round'; x.beginPath(); x.moveTo(x1 + .35, y1 + .5); x.lineTo(x2 + .35, y2 + .5); x.stroke();
        x.strokeStyle = rgb(c); x.lineWidth = 2.1; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke();
        x.strokeStyle = rgb(shade(c, 0.35)); x.lineWidth = 0.55; x.beginPath(); x.moveTo(x1 + .3, y1 - .3); x.lineTo(x2 - .2, y2 - .2); x.stroke();
      }
    }));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (d[i + 3] === 0) continue;
      const spr = crossFor([d[i], d[i + 1], d[i + 2]]); g.drawImage(spr.c, x * Sx, y * Sx, Sx, Sx);
    }
  } };

  // Round 1 E: botanical ink sketch, colour only in the flowers; covered areas become hatched paper
  S.ink = { k: dpr, render(g, sc, env) {
    sc = bigger(sc);
    const P = palette(env.theme, env.hue), dark = env.theme === 'dark', k = env.k, ink = dark ? '#e9e3d6' : '#1f2722', paper = dark ? '#161b19' : '#f6f3ea';
    const key = `ink${env.theme}${k}`;
    const leafS = cached(key + 'leaf', () => leafBox((x) => {
      x.strokeStyle = ink; x.lineCap = 'round'; x.lineJoin = 'round';
      x.lineWidth = 1; x.beginPath(); x.moveTo(0, 0); x.lineTo(L0 * 0.34, 0); x.stroke();
      x.translate(L0 * PET, 0); leafPath(x, L0); x.fillStyle = paper; x.fill(); x.fillStyle = dark ? 'rgba(104,177,83,0.2)' : 'rgba(90,160,71,0.16)'; x.fill(); x.lineWidth = 1.25; x.stroke();
      x.lineWidth = 0.75; x.beginPath(); x.moveTo(0.04 * L0, 0); x.quadraticCurveTo(0.5 * L0, 0.03 * L0, 0.88 * L0, 0); x.stroke();
      for (const v of [0.28, 0.5, 0.7]) for (const sg of [-1, 1]) { x.beginPath(); x.moveTo(v * L0, 0); x.quadraticCurveTo((v + 0.08) * L0, sg * 0.12 * L0, (v + 0.16) * L0, sg * 0.22 * L0 * (1 - v * 0.6)); x.stroke(); }
    })(k * 1.1));
    const hedgeS = cached(key + 'hedge', () => mk(H0 * 2 + 4, H0 * 2 + 4, H0 + 2, H0 + 2, k, (x) => {
      x.beginPath(); x.arc(0, 0, H0, 0, TAU); x.fillStyle = paper; x.fill(); x.clip();
      x.strokeStyle = ink; x.globalAlpha = 0.28; x.lineWidth = 0.8;
      for (let i = -H0 * 2; i < H0 * 2; i += 4.5) { x.beginPath(); x.moveTo(i, -H0); x.lineTo(i + H0 * 1.2, H0); x.stroke(); }
    }));
    for (const hd of sc.hedge) blit(g, hedgeS, hd.x, hd.y, hd.seed * TAU, hd.r / H0, k);
    g.setTransform(k, 0, 0, k, 0, 0); g.strokeStyle = ink; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const st of sc.stems) {
      const n = st.pts.length;
      for (let i = 1; i < n; i += 3) { const a = st.pts[i - 1], b = st.pts[Math.min(n - 1, i + 2)]; g.lineWidth = Math.max(0.7, DG.stemW(a, sc.m) * 0.5); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    }
    g.lineWidth = 0.8; for (const td of sc.tendrils) { const q = tendrilPts(td); g.beginPath(); g.moveTo(td.x, td.y); for (const [x, y] of q) g.lineTo(x, y); g.stroke(); }
    for (const lf of sc.leaves) blit(g, leafS, lf.x, lf.y, lf.ang, lf.size / L0, k, lf.tone < .5 ? 1 : -1);
    g.setTransform(k, 0, 0, k, 0, 0);
    for (const b of sc.buds) {
      g.save(); g.strokeStyle = ink; g.lineWidth = 0.9; pedicel(g, b.p, b.cx, b.cy);
      budFrame(g, b); const [l, w] = budSize(b);
      g.save(); g.translate(1.2, 1); budPath(g, l, w); g.fillStyle = P.bud; g.globalAlpha = 0.85; g.fill(); g.restore();
      budPath(g, l, w); g.lineWidth = 1; g.stroke();
      g.beginPath(); g.moveTo(l * 0.15, w * 0.45 * b.twist); g.quadraticCurveTo(l * 0.55, -w * 0.55 * b.twist, l, 0); g.lineWidth = 0.7; g.stroke();
      g.restore();
    }
    for (const f of sc.flowers) {
      g.save(); g.strokeStyle = ink; g.lineWidth = 0.9; pedicel(g, f.p, f.cx, f.cy);
      flowerFrame(g, f); const R = flowerR(f);
      g.save(); g.translate(1.6, 1.2); flowerPath(g, R * 0.97, f.rot); g.fillStyle = P.petal; g.globalAlpha = 0.9; g.fill(); flowerPath(g, R * 0.55, f.rot); g.fillStyle = P.petalLight; g.fill(); g.restore();
      flowerPath(g, R, f.rot); g.lineWidth = 1.15; g.stroke();
      g.lineWidth = 0.7; for (let i = 0; i < 5; i++) { const a = f.rot + i * TAU / 5; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.28, Math.sin(a) * R * 0.28); g.lineTo(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9); g.stroke(); }
      g.beginPath(); g.arc(0, 0, R * 0.26, 0, TAU); g.stroke();
      g.restore();
    }
  } };

  // Round 1 F: watercolour, layered translucent washes with darker edges
  S.water = { k: dpr, render(g, sc, env) {
    sc = bigger(sc);
    const P = palette(env.theme, env.hue), dark = env.theme === 'dark', k = env.k, boost = dark ? 1.5 : 1, key = `water${env.theme}${env.hue}${k}`;
    const r = rng(77);
    const deform = (poly, amt, depth) => { let p = poly; for (let d = 0; d < depth; d++) { const q = []; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; q.push(a); const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, gg = (r() - 0.5) * 2 * amt * len; q.push([mx + (b[1] - a[1]) / len * gg, my - (b[0] - a[0]) / len * gg]); } p = q; } return p; };
    const wash = (x, poly, color, layers, alpha, amt) => {
      for (let i = 0; i < layers; i++) {
        const q = deform(poly, amt, 3); x.beginPath(); q.forEach(([a, b], j) => j ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath();
        x.fillStyle = color; x.globalAlpha = Math.min(1, alpha * boost); x.fill();
        if (i % 3 === 0) { x.strokeStyle = shadeHex(color, -0.35); x.globalAlpha = Math.min(1, alpha * 1.1 * boost); x.lineWidth = 0.9; x.stroke(); }
      }
      x.globalAlpha = 1;
    };
    const leaves = cached(key + 'leaves', () => [0, 1, 2, 3, 4, 5].map(v => leafBox((x) => {
      x.translate(L0 * PET, 0); const poly = leafPolyLocal(L0, 10), c = v % 2 ? P.leafDark : P.leaf;
      wash(x, poly, c, 8, 0.15, 0.1); wash(x, poly.slice(0, 11).concat([poly[0]]), P.leafDark, 3, 0.12, 0.12);
    }, 5)(k * 1.1)));
    const flowers = cached(key + 'flowers', () => [0, 1, 2].map(() => mk(R0 * 2.6, R0 * 2.6, R0 * 1.3, R0 * 1.3, k * 1.2, (x) => {
      wash(x, flowerPolyLocal(R0, 0, 16), P.petal, 9, 0.15, 0.08); wash(x, flowerPolyLocal(R0 * 0.55, 0, 10), P.petalLight, 4, 0.18, 0.1); wash(x, flowerPolyLocal(R0 * 0.28, 0, 8), '#ffffff', 3, 0.35, 0.1);
      x.fillStyle = P.center; x.globalAlpha = 0.85; x.beginPath(); x.arc(0, 0, R0 * 0.11, 0, TAU); x.fill();
    })));
    const hedges = cached(key + 'hedge', () => [0, 1, 2].map(() => mk(H0 * 2.6, H0 * 2.6, H0 * 1.3, H0 * 1.3, k * 0.6, (x) => {
      const poly = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; poly.push([Math.cos(a) * H0, Math.sin(a) * H0]); }
      wash(x, poly, P.hedge, 7, dark ? 0.3 : 0.26, 0.12); wash(x, poly.map(([a, b]) => [a * .6, b * .6 - 6]), P.leafDark, 3, 0.2, 0.15);
    })));
    for (const hd of sc.hedge) blit(g, hedges[Math.floor(hd.seed * 3)], hd.x, hd.y, hd.seed * 20, hd.r / H0 * 1.05, k);
    g.setTransform(k, 0, 0, k, 0, 0); g.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) { g.strokeStyle = P.stem; g.globalAlpha = 0.4 * boost; for (const st of sc.stems) { g.lineWidth = DG.stemW(st.pts[0], sc.m) * (0.75 + pass * 0.3); g.beginPath(); st.pts.forEach((p, i) => i ? g.lineTo(p.x + (pass - .5) * .6, p.y) : g.moveTo(p.x, p.y)); g.stroke(); } }
    g.globalAlpha = 1;
    for (const lf of sc.leaves) blit(g, leaves[lf.id % 6], lf.x, lf.y, lf.ang, lf.size / L0, k);
    for (const b of sc.buds) { const [l, w] = budSize(b); g.setTransform(k, 0, 0, k, 0, 0); g.translate(b.cx, b.cy); g.rotate(b.budA); g.globalAlpha = Math.min(1, 0.55 * boost); g.fillStyle = P.bud; budPath(g, l, w); g.fill(); g.globalAlpha = 1; }
    for (const f of sc.flowers) blitFlower(g, flowers[f.id % 3], f, R0, k);
  } };

  // Round 1 G: paper cut-out, flat layers with soft shadows and grain
  S.paper = { k: dpr, render(g, sc, env) {
    sc = bigger(sc);
    const P0 = palette(env.theme, env.hue), dark = env.theme === 'dark', k = env.k, key = `paper${env.theme}${env.hue}${k}`;
    const P = { ...P0, leaf: '#6fae54', leafAlt: '#5f9e4a', leafDark: '#4e8a3e', stem: '#4f8a3c', hedge: dark ? '#24452a' : '#2f5e32' };
    const shadowCol = dark ? 'rgba(0,0,0,0.6)' : 'rgba(30,40,30,0.32)';
    const grain = (x, w, h) => { x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = x.createPattern(grainPattern(), 'repeat'); x.fillRect(0, 0, w, h); x.restore(); };
    const withShadow = (draw) => (x) => { x.shadowColor = shadowCol; x.shadowBlur = 5 * k; x.shadowOffsetY = 2.5 * k; x.shadowOffsetX = 1 * k; draw(x); };
    const leaves = cached(key + 'leaves', () => [0, 1].map(t => { const s = leafBox(withShadow((x) => {
      x.strokeStyle = P.stem; x.lineWidth = 3; x.lineCap = 'round'; x.beginPath(); x.moveTo(0, 0); x.lineTo(L0 * 0.34, 0); x.stroke();
      x.translate(L0 * PET, 0); leafPath(x, L0); x.fillStyle = t ? P.leafAlt : P.leaf; x.fill(); x.shadowColor = 'transparent';
      x.save(); x.clip(); x.fillStyle = P.leafDark; x.fillRect(-L0, 0, L0 * 3, L0 * 2); x.restore();
    }), 8)(k * 1.1); grain(s.c.getContext('2d'), s.c.width, s.c.height); return s; }));
    const flower = cached(key + 'flower', () => { const s = mk(R0 * 3, R0 * 3, R0 * 1.5, R0 * 1.4, k * 1.2, withShadow((x) => {
      flowerPath(x, R0, 0); x.fillStyle = P.petal; x.fill(); x.shadowColor = 'transparent';
      flowerPath(x, R0 * 0.66, 0); x.fillStyle = P.petalLight; x.fill();
      x.beginPath(); x.arc(0, 0, R0 * 0.33, 0, TAU); x.fillStyle = P.throat; x.fill(); x.beginPath(); x.arc(0, 0, R0 * 0.13, 0, TAU); x.fillStyle = P.center; x.fill();
    })); grain(s.c.getContext('2d'), s.c.width, s.c.height); return s; });
    const hedge = cached(key + 'hedge', () => { const s = mk(H0 * 2.5, H0 * 2.5, H0 * 1.25, H0 * 1.2, k * 0.7, withShadow((x) => { x.beginPath(); for (let i = 0; i <= 10; i++) { const a = i / 10 * TAU, rr = H0 * (0.92 + 0.08 * Math.cos(a * 3)); i ? x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath(); x.fillStyle = P.hedge; x.fill(); })); grain(s.c.getContext('2d'), s.c.width, s.c.height); return s; });
    for (const hd of sc.hedge) blit(g, hedge, hd.x, hd.y, hd.seed * TAU, hd.r / H0, k);
    g.setTransform(k, 0, 0, k, 0, 0); g.shadowColor = shadowCol; g.shadowBlur = 4 * k; g.shadowOffsetY = 2 * k;
    strokeStems(g, sc, k, P.stem, 1.25); g.shadowColor = 'transparent';
    for (const lf of sc.leaves) blit(g, leaves[lf.tone < .5 ? 0 : 1], lf.x, lf.y, lf.ang, lf.size / L0, k);
    for (const b of sc.buds) {
      g.setTransform(k, 0, 0, k, 0, 0); g.strokeStyle = P.stem; g.lineWidth = 1.4; pedicel(g, b.p, b.cx, b.cy);
      g.translate(b.cx, b.cy); g.rotate(b.budA); const [l, w] = budSize(b);
      g.shadowColor = shadowCol; g.shadowBlur = 3 * k; g.shadowOffsetY = 1.5 * k; budPath(g, l, w); g.fillStyle = P.bud; g.fill(); g.shadowColor = 'transparent';
      g.fillStyle = P.sepal; g.beginPath(); g.moveTo(0, -w * 0.6); g.lineTo(l * 0.32, 0); g.lineTo(0, w * 0.6); g.closePath(); g.fill();
    }
    for (const f of sc.flowers) { g.setTransform(k, 0, 0, k, 0, 0); g.strokeStyle = P.stem; g.lineWidth = 1.4; pedicel(g, f.p, f.cx, f.cy); blitFlower(g, flower, f, R0, k); }
  } };

  // Round 2: illustrated, gradients, soft shadows and an out-of-focus layer behind
  S.illus = { k: dpr, render(g, sc, env) {
    sc = bigger(sc);
    const P0 = palette(env.theme, env.hue), dark = env.theme === 'dark', k = env.k, key = `illus${env.theme}${env.hue}${k}`;
    const P = { ...P0, leafLight: dark ? '#86c96a' : '#7cc160', petalMid: mixHex(P0.petal, P0.petalLight, 0.5), band: shadeHex(P0.petalLight, 0.5) };
    const sh = (x, blur = 4, oy = 1.5) => { x.shadowColor = dark ? 'rgba(0,0,0,0.5)' : 'rgba(20,40,20,0.24)'; x.shadowBlur = blur * k; x.shadowOffsetY = oy * k; };
    const leaves = cached(key + 'leaves', () => [0, 1].map(t => leafBox((x) => {
      const colA = t ? P.leaf : P.leafLight;
      x.strokeStyle = P.stem; x.lineWidth = 3; x.lineCap = 'round'; x.beginPath(); x.moveTo(0, 0); x.lineTo(L0 * 0.32, 0); x.stroke();
      x.translate(L0 * PET, 0); leafPath(x, L0);
      const gr = x.createLinearGradient(0, 0, L0, 0); gr.addColorStop(0, P.leafDark); gr.addColorStop(1, colA); x.fillStyle = gr; sh(x); x.fill(); x.shadowColor = 'transparent';
      x.save(); x.clip(); x.fillStyle = 'rgba(0,30,0,0.16)'; x.fillRect(-L0, 0, L0 * 3, L0 * 2); x.restore();
      x.strokeStyle = rgb(shade(colA, 0.35), 0.75); x.lineWidth = 1.6; x.beginPath(); x.moveTo(L0 * 0.06, 0); x.quadraticCurveTo(L0 * 0.5, -L0 * 0.03, L0 * 0.9, 0); x.stroke();
    }, 8)(k * 1.1)));
    const flower = cached(key + 'flower', () => mk(R0 * 3, R0 * 3, R0 * 1.5, R0 * 1.4, k * 1.3, (x) => {
      flowerPath(x, R0, 0); const gr = x.createRadialGradient(0, 0, R0 * 0.1, 0, 0, R0); gr.addColorStop(0, P.throat); gr.addColorStop(0.24, P.petalLight); gr.addColorStop(0.55, P.petalMid); gr.addColorStop(1, P.petal); x.fillStyle = gr; sh(x, 5, 2); x.fill(); x.shadowColor = 'transparent';
      x.fillStyle = rgb(hex2(P.band), 0.55); for (let i = 0; i < 5; i++) { const a = i * TAU / 5; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a - 0.07) * R0 * 0.97, Math.sin(a - 0.07) * R0 * 0.97); x.lineTo(Math.cos(a + 0.07) * R0 * 0.97, Math.sin(a + 0.07) * R0 * 0.97); x.closePath(); x.fill(); }
      flowerPath(x, R0, 0); x.strokeStyle = rgb(shade(P.petal, -0.3), 0.5); x.lineWidth = 0.8; x.stroke();
      const g3 = x.createRadialGradient(0, 0, 0, 0, 0, R0 * 0.26); g3.addColorStop(0, P.center); g3.addColorStop(0.45, P.throat); g3.addColorStop(1, rgb(hex2(P.throat), 0)); x.fillStyle = g3; x.beginPath(); x.arc(0, 0, R0 * 0.26, 0, TAU); x.fill();
    }));
    const hedge = cached(key + 'hedge', () => mk(H0 * 3, H0 * 3, H0 * 1.5, H0 * 1.5, k * 0.5, (x) => {
      x.filter = 'blur(3px)'; const rr = rng(9);
      x.fillStyle = dark ? '#18321a' : '#244b22'; x.beginPath(); x.arc(0, 0, H0 * 0.95, 0, TAU); x.fill();
      for (let i = 0; i < 6; i++) { x.save(); x.rotate(rr() * TAU); x.translate(H0 * 0.2, 0); leafPath(x, H0 * 1.1); x.fillStyle = i % 2 ? (dark ? '#2b5427' : '#356b30') : (dark ? '#21431f' : '#2c5a28'); x.fill(); x.restore(); }
    }));
    for (const hd of sc.hedge) blit(g, hedge, hd.x, hd.y, hd.seed * TAU, hd.r / H0, k);
    g.setTransform(k, 0, 0, k, 0, 0);
    const gr = g.createLinearGradient(0, env.H, 0, 0); gr.addColorStop(0, shadeHex(P.stem, -0.25)); gr.addColorStop(1, shadeHex(P.stem, 0.15));
    sh(g, 3, 1); g.fillStyle = gr; for (const st of sc.stems) { stemRibbon(g, st.pts, sc.m, 1.15); g.fill(); } g.shadowColor = 'transparent';
    g.strokeStyle = P.stem; g.lineWidth = 1.3; g.lineCap = 'round'; for (const td of sc.tendrils) { const q = tendrilPts(td); g.beginPath(); g.moveTo(td.x, td.y); q.forEach(([x, y]) => g.lineTo(x, y)); g.stroke(); }
    for (const lf of sc.leaves) blit(g, leaves[lf.tone < .5 ? 0 : 1], lf.x, lf.y, lf.ang, lf.size / L0, k);
    for (const b of sc.buds) {
      g.setTransform(k, 0, 0, k, 0, 0); g.strokeStyle = P.stem; g.lineWidth = 1.3; pedicel(g, b.p, b.cx, b.cy);
      g.translate(b.cx, b.cy); g.rotate(b.budA); const [l, w] = budSize(b);
      budPath(g, l, w); const bg = g.createLinearGradient(0, 0, l, 0); bg.addColorStop(0, P.bud); bg.addColorStop(1, shadeHex(P.bud, 0.45)); g.fillStyle = bg; sh(g, 3, 1); g.fill(); g.shadowColor = 'transparent';
      g.save(); g.clip(); g.strokeStyle = rgb(hex2(P.budStripe), 0.7); g.lineWidth = Math.max(1, w * 0.4); g.beginPath(); g.moveTo(l * 0.15, w * 0.5 * b.twist); g.quadraticCurveTo(l * 0.55, -w * 0.6 * b.twist, l, 0); g.stroke(); g.restore();
      g.fillStyle = P.sepal; g.beginPath(); g.moveTo(0, -w * 0.65); g.quadraticCurveTo(l * 0.2, -w * 0.2, l * 0.34, 0); g.quadraticCurveTo(l * 0.2, w * 0.2, 0, w * 0.65); g.closePath(); g.fill();
    }
    for (const f of sc.flowers) { g.setTransform(k, 0, 0, k, 0, 0); g.strokeStyle = P.stem; g.lineWidth = 1.3; pedicel(g, f.p, f.cx, f.cy); blitFlower(g, flower, f, R0, k); }
  } };

  // Round 4: photoreal, the keyed morning-glory photos (anchor = attachment point, axis = anchor -> tip, degrees)
  const PH = {
    leafA: { w: 119, h: 141, src: 'art/photo/leafA.png', ax: 64.4, ay: 3.6, axis: 92, len: 136 },
    leafB: { w: 108, h: 124, src: 'art/photo/leafB.png', ax: 5.2, ay: 9.2, axis: 48, len: 150 },
    bud: { w: 50, h: 103, src: 'art/photo/bud.png', ax: 12.4, ay: 100, axis: -71, len: 100 },
    half: { w: 83, h: 109, src: 'art/photo/half.png', ax: 5.6, ay: 105.6, axis: -55, len: 120 },
    front: { w: 152, h: 151, src: 'art/photo/front.png', ax: 74.8, ay: 86.8, axis: 0, len: 150 },
    side: { w: 139, h: 160, src: 'art/photo/side.png', ax: 6, ay: 155.2, axis: -51, len: 160 },
    tendril: { w: 46, h: 146, src: 'art/photo/tendril.png', ax: 22.4, ay: 142, axis: -90, len: 140 },
  };
  const D2R = Math.PI / 180;
  function place(g, sp, im, x, y, dir, s, k, alpha = 1) {
    // flip when pointing left, so the light stays roughly from above
    const left = Math.cos(dir) < 0, rot = left ? dir - (180 - sp.axis) * D2R : dir - sp.axis * D2R;
    const c = Math.cos(rot) * s * k, si = Math.sin(rot) * s * k, f = left ? -1 : 1;
    g.globalAlpha = alpha; g.setTransform(c * f, si * f, -si, c, x * k, y * k);
    g.drawImage(im, -sp.ax, -sp.ay, sp.w, sp.h); g.globalAlpha = 1;
  }
  S.photo = { k: dpr, assets: Object.values(PH).map(p => p.src), render(g, sc, env) {
    const k = env.k, I = env.imgs, im = n => I[PH[n].src]; if (!im('leafA')) return;
    const key = `photo${env.hue}`;
    const tinted = (n) => cached(key + n, () => { const s = im(n), c = document.createElement('canvas'); c.width = s.width; c.height = s.height; const x = c.getContext('2d'); if (env.hue) x.filter = `hue-rotate(${env.hue}deg) saturate(1.2)`; x.drawImage(s, 0, 0); return c; });
    const darkLeaf = (n) => cached('photoDark' + n, () => { const s = im(n), c = document.createElement('canvas'); c.width = s.width; c.height = s.height; const x = c.getContext('2d'); x.filter = 'brightness(0.32) saturate(0.85) blur(1.5px)'; x.drawImage(s, 0, 0); return c; });
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = '#132211'; for (const hd of sc.hedge) { g.beginPath(); g.arc(hd.x, hd.y, hd.r * 0.82, 0, TAU); g.fill(); }
    for (const hd of sc.hedge) { const s = hd.r / 60; place(g, PH.leafA, darkLeaf('leafA'), hd.x, hd.y - hd.r * .3, hd.seed * TAU, s, k); place(g, PH.leafB, darkLeaf('leafB'), hd.x, hd.y, hd.seed * 9, s * .95, k); }
    g.setTransform(k, 0, 0, k, 0, 0); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [col, wk] of [['#1d2f14', 1.5], ['#557f31', 1], ['rgba(170,205,110,0.55)', 0.3]]) { g.strokeStyle = col; for (const st of sc.stems) { g.lineWidth = Math.max(0.8, DG.stemW(st.pts[Math.floor(st.pts.length / 3)], sc.m) * wk); g.beginPath(); st.pts.forEach((p, i) => i ? g.lineTo(p.x - (wk < .5 ? .5 : 0), p.y) : g.moveTo(p.x, p.y)); g.stroke(); } }
    for (const lf of sc.leaves) { const n = lf.tone < .5 ? 'leafA' : 'leafB'; place(g, PH[n], im(n), lf.x, lf.y, lf.ang, lf.size * 1.35 / PH[n].len, k, lf.growing !== undefined ? clamp(lf.growing * 4) : 1); }
    for (const td of sc.tendrils) place(g, PH.tendril, im('tendril'), td.x, td.y, td.a, 0.14, k, 0.9);
    for (const b of sc.buds) place(g, PH.bud, tinted('bud'), b.p.x, b.p.y, Math.atan2(b.cy - b.p.y, b.cx - b.p.x), b.R * 2.6 / PH.bud.len * (0.35 + 0.65 * b.g), k);
    for (const f of sc.flowers) {
      const dir = Math.atan2(f.cy - f.p.y, f.cx - f.p.x), s = f.R * 2.5 / PH.front.len * (0.3 + 0.7 * f.o);
      if (f.o < 0.35) place(g, PH.half, tinted('half'), f.p.x, f.p.y, dir, f.R * 2.4 / PH.half.len, k);
      else if (f.view === 'side') place(g, PH.side, tinted('side'), f.p.x, f.p.y, dir, s * 1.05, k);
      else { const c = tinted('front'); g.setTransform(s * k, 0, 0, s * k, f.cx * k, f.cy * k); g.rotate(f.rot * 0.2); g.drawImage(c, -PH.front.w / 2, -PH.front.h / 2, PH.front.w, PH.front.h); }
    }
  } };

  // Round 6: pixel vines from the baked sprite atlas, drawn at 2 CSS px per art pixel
  S.vines = { k: () => 1 / DG.ART, pixelated: true, assets: ['art/atlas.png'], render(g, sc, env) {
    const IMG = env.imgs['art/atlas.png'], A = DG.ATLAS; if (!IMG) return;
    const k = env.k, hue = env.hue;
    const tint = cached('vinesTint' + hue, () => { if (!hue) return IMG; const c = document.createElement('canvas'); c.width = IMG.width; c.height = IMG.height; const x = c.getContext('2d'); x.filter = `hue-rotate(${hue}deg) saturate(1.45) brightness(1.06)`; x.drawImage(IMG, 0, 0); return c; });
    const spr = (im, name, step, X, Y) => { const e = A[name] && A[name][step]; if (e) g.drawImage(im, e[0], e[1], e[2], e[3], Math.round(X) - e[4], Math.round(Y) - e[5], e[2], e[3]); };
    const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const hedgeS = cached('vinesHedge' + env.theme, () => [0, 1, 2].map(v => {
      const R = 20, c = document.createElement('canvas'); c.width = c.height = R * 2 + 2; const x = c.getContext('2d'), rr = rng(31 + v);
      for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) {
        const d = Math.hypot(xx - R, yy - R) + (rr() - .5) * 3; if (d > R) continue;
        const n = rr(); x.fillStyle = n < 0.12 ? '#2c5a25' : n < 0.3 ? '#0f2210' : d > R - 2 ? '#122812' : '#1a361a'; x.fillRect(xx, yy, 1, 1);
      }
      return c;
    }));
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
    for (const hd of sc.hedge) { const c = hedgeS[Math.floor(hd.seed * 3)], s = Math.max(0.2, hd.r * k / 20); g.drawImage(c, Math.round(hd.x * k - c.width * s / 2), Math.round(hd.y * k - c.height * s / 2), Math.round(c.width * s), Math.round(c.height * s)); }
    for (let pass = 0; pass < 3; pass++) for (const st of sc.stems) {
      const pts = st.pts, n = pts.length, tipS = pts[n - 1].s;
      for (let i = 0; i < n; i++) {
        const p = pts[i], x = Math.round(p.x * k), y = Math.round(p.y * k), w = Math.max(1, Math.round(DG.stemW(p, sc.m) * k * Math.min(1, 0.4 + (tipS - p.s) / 30)));
        if (pass === 0) px(x - (w >> 1) - 1, y - 1, w + 2, 3, '#14290f');
        else if (pass === 1) px(x - (w >> 1), y, w, 1, '#3f7f2c');
        else if (w > 1 && i % 7 < 3) px(x - (w >> 1), y, 1, 1, '#79b84a');
      }
    }
    for (const td of sc.tendrils) spr(IMG, td.dir < 0 ? 'ten1' : 'ten2', 2, td.x * k + 2, td.y * k);
    const opts = cached('vinesOpts', () => { const o = []; for (const [l, rr] of [['L4', 'R5'], ['L2', 'R3'], ['L0', 'R1']]) for (let st = 0; st < 3; st++) o.push({ l, r: rr, st, w: A[l][st][2] / k }); return o.sort((a, b) => a.w - b.w); });
    for (const lf of sc.leaves) {
      const X = lf.x * k, Y = lf.y * k, left = Math.cos(lf.ang) < 0, want = lf.size * 1.25;
      let best = opts[0]; for (const o of opts) if (Math.abs(o.w - want) < Math.abs(best.w - want)) best = o;
      spr(IMG, left ? best.l : best.r, best.st, X + (left ? -1 : 1), Y);
    }
    const fstep = (f, o) => Math.min(f.R < 11.5 * (sc.C / 26) ? 0 : 1, o < .6 ? 0 : 1);
    for (const b of sc.buds) spr(tint, 'bud', b.g < .4 ? 0 : b.g < .8 ? 1 : 2, b.cx * k, b.cy * k + 4);
    for (const f of sc.flowers) {
      const X = f.cx * k, Y = f.cy * k;
      if (f.o < 0.3) spr(tint, 'half', 1, X, Y + 6);
      else if (f.view === 'side') spr(tint, 'side', fstep(f, f.o), X - 2, Y + 8);
      else spr(tint, 'open', fstep(f, f.o), X, Y);
    }
  } };

  DG.STYLE_IMPL = S;
  DG.styleFor = id => S[id] || S.vines;

  // Paints a scene with a style: the back strands first, put in shade, then the front ones over them.
  // The flat styles shade their own back strands. Leaves g with a clean state.
  DG.paintScene = (g, sc, env, style) => {
    if (style.single) style.render(g, sc, env);
    else {
      const [back, front] = DG.layers(sc);
      style.render(g, back, env);
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-atop';
      g.fillStyle = env.theme === 'dark' ? 'rgba(0,0,0,0.45)' : 'rgba(10,32,12,0.38)'; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
      g.globalCompositeOperation = 'source-over';
      style.render(g, front, env);
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.shadowColor = 'transparent'; g.filter = 'none'; g.globalCompositeOperation = 'source-over';
  };
})();
