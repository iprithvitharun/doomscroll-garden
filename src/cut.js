// Cutting the garden down: a pair of shears runs along the band at the top, snipping as it goes. Each hanging
// strand drops whole the moment its top is cut and goes slack as it falls; the band comes away in pieces; the
// climbers peel off the window edges; the corner mounds sink out of sight. A few leaves come loose and flutter.
//
// Every piece is painted once by the current style (at the start of the cut) and then only moved.
(() => {
  const DG = globalThis.DG;
  const { rand, clamp, ease, TAU } = DG;
  const GRID = 18;          // pieces start on an 18 px grid, so the pixel styles' own grids line up with the garden's
  const SNIP = 0.18;        // s before the shears start moving
  const CLOSE_HZ = 11;      // the shears close 11 times a second
  const BIN = 40, CHUNK = 90;  // hanging strands fall in clumps 40 px wide; the band comes away 90 px at a time
  const BUDGET = 60e6;      // bytes for all the pieces together; on big, sharp screens they are painted a little softer

  // the part of a scene that belongs to one piece, moved so the piece's box starts at 0,0
  function shift(sc, part, x0, y0, W, H) {
    const P = (p) => ({ ...p, x: p.x - x0, y: p.y - y0 });
    const F = (f) => ({ ...f, cx: f.cx - x0, cy: f.cy - y0, p: P(f.p) });
    return { m: sc.m, C: sc.C, W, H, hedge: [], stems: part.stems.map(s => ({ ...s, pts: s.pts.map(P) })), leaves: part.leaves.map(P), buds: part.buds.map(F), flowers: part.flowers.map(F), tendrils: part.tendrils.map(P) };
  }

  // net: the overgrowth, sc: the scene as drawn now, env: { W, H, k, theme, hue, imgs }, (ox, oy): where the cut started
  DG.makeCut = ({ net, sc, style, env, ox }) => {
    const { W, H, k } = env, s = net.C / 26, info = net.byId;
    const parts = new Map();
    const part = (key, kind, ax, base) => { let p = parts.get(key); if (!p) parts.set(key, p = { key, kind, ax, base, stems: [], leaves: [], buds: [], flowers: [], tendrils: [] }); return p; };
    // which piece a bit of strand `id` near x belongs to
    const pieceOf = (id, x) => {
      const st = info[id];
      if (st.role === 'hang') { const root = info[st.parent], b = Math.floor(root.pts[0].x / (BIN * s)); return part('h' + b, 'hang', (b + 0.5) * BIN * s); }
      if (st.role === 'band') { const c = Math.floor(x / (CHUNK * s)); return part(`b${id}:${c}`, 'band', (c + 0.5) * CHUNK * s); }
      return part('s' + id, st.role, st.pts[0].x, st.pts[0]);
    };
    for (const st of sc.stems) {
      if (info[st.id].role !== 'band') { pieceOf(st.id, 0).stems.push(st); continue; }
      // the band's stem is split where its pieces meet, overlapping by a point so no gap shows before they fall
      const pts = st.pts, ci = (p) => Math.floor(p.x / (CHUNK * s));
      for (let a = 0, b = 1; b <= pts.length; b++) {
        if (b < pts.length && ci(pts[b]) === ci(pts[a])) continue;
        const seg = pts.slice(Math.max(0, a - 1), Math.min(pts.length, b + 1));
        if (seg.length >= 2) pieceOf(st.id, pts[a].x).stems.push({ ...st, pts: seg });
        a = b;
      }
    }
    // a few grown leaves on the curtain and the band come loose and flutter down on their own
    const loose = [];
    for (const l of sc.leaves) {
      const p = pieceOf(l.sid, l.x);
      if ((p.kind === 'hang' || p.kind === 'band') && !l.back && !l.growing && loose.length < 40 && Math.random() < 0.05) {
        const q = part('l' + l.id, 'leaf', l.x); q.leaves.push(l); q.from = p; loose.push(q);
      } else p.leaves.push(l);
    }
    for (const f of sc.buds) pieceOf(f.sid, f.p.x).buds.push(f);
    for (const f of sc.flowers) pieceOf(f.sid, f.p.x).flowers.push(f);
    for (const t of sc.tendrils) pieceOf(t.sid, t.x).tendrils.push(t);

    // when the shears pass x: they start at the side nearest where you cut
    const dir = ox > W / 2 ? -1 : 1, xs0 = dir < 0 ? W + 12 : -12, sweep = clamp(W / 1100, 0.55, 1.1), speed = (W + 24) / sweep;
    const passes = (x) => SNIP + clamp((x - xs0) * dir / speed, 0, sweep), end = SNIP + sweep;
    const G = 2.9 * H;

    const boxes = [];
    let area = 0;
    for (const p of parts.values()) {
      if (!p.stems.length && !p.leaves.length && !p.flowers.length && !p.buds.length) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = (x, y, r) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
      for (const st of p.stems) for (const q of st.pts) add(q.x, q.y, 5);
      for (const l of p.leaves) add(l.x, l.y, l.size * 1.6 + 6);
      for (const f of p.buds) add(f.cx, f.cy, f.R * 4.4 + 6);
      for (const f of p.flowers) add(f.cx, f.cy, f.R * 2.6 + 8);
      for (const t of p.tendrils) add(t.x, t.y, t.size * 5 + 4);
      x0 = Math.floor(Math.max(-60, x0) / GRID) * GRID; y0 = Math.floor(Math.max(-60, y0) / GRID) * GRID;
      x1 = Math.ceil(Math.min(W + 60, x1) / GRID) * GRID; y1 = Math.ceil(Math.min(H + 60, y1) / GRID) * GRID;
      if (x1 <= x0 || y1 <= y0) continue;
      boxes.push({ p, x0, y0, x1, y1 }); area += (x1 - x0) * (y1 - y0);
    }
    // a few fixed steps down in sharpness, so the styles' sprite caches only ever see these
    const kc = [1, 0.7, 0.5].map(f => k * f).find(q => area * q * q * 4 <= BUDGET) || k * 0.5;
    const pieces = [];
    let bytes = 0;
    for (const { p, x0, y0, x1, y1 } of boxes) {
      const bw = x1 - x0, bh = y1 - y0, c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(bw * kc)); c.height = Math.max(1, Math.ceil(bh * kc)); bytes += c.width * c.height * 4;
      try { DG.paintScene(c.getContext('2d'), shift(sc, p, x0, y0, bw, bh), { ...env, W: bw, H: bh, k: kc }, style); } catch (e) { console.warn('[Doomscroll Garden]', e); }
      const side = (p.base ? p.base.x : p.ax) < W / 2 ? 1 : -1;   // 1 on the left half: inward is +x
      const pc = { c, x0, y0, bw, bh, kind: p.kind, src: p, ph: rand(0, TAU) };
      if (p.kind === 'hang') Object.assign(pc, { t: passes(p.ax) + rand(0, 0.04), px: p.ax, py: 0, lean: rand(-0.1, 0.1), skew: rand(-0.16, 0.16) });
      else if (p.kind === 'band') Object.assign(pc, { t: passes(p.ax) + 0.03 + rand(0, 0.05), px: (x0 + x1) / 2, py: (y0 + y1) / 2, vx: dir * rand(10, 70), vy: rand(20, 90), vr: rand(-2.2, 2.2) });
      else if (p.kind !== 'leaf') {
        const bx = p.base.x, by = Math.min(H + 10, p.base.y);
        if (p.kind === 'mound' || p.kind === 'reach') Object.assign(pc, { t: end - 0.15 + rand(0, 0.25), px: bx, py: by, sink: true, tilt: -side * rand(0.05, 0.2) });
        // climbers come off when the shears reach their corner (one in a wide margin when they pass above it),
        // tipping away from the page as they fall
        else Object.assign(pc, { t: (p.kind === 'margin' ? passes(bx) : passes(side > 0 ? 0 : W)) + 0.05 + rand(0, 0.18), px: bx, py: by, peel: -side * rand(0.06, 0.14) });
      }
      pieces.push(pc);
    }
    // loose leaves let go just after the piece they hung on
    for (const pc of pieces) if (pc.kind === 'leaf') {
      const host = pieces.find(q => q.src === pc.src.from);
      Object.assign(pc, { t: (host ? host.t : passes(pc.x0)) + rand(0.02, 0.3), px: pc.x0 + pc.bw / 2, py: pc.y0 + pc.bh / 2, flutter: true, vx: rand(-60, 60), vy: -rand(10, 60), vr: rand(-1.5, 1.5), amp: rand(25, 60) });
    }
    // order: the climbers and mounds at the back, then the curtain, the band over its top, loose leaves in front
    const rank = { mound: 0, reach: 0, edge: 1, climb: 1, margin: 1, hang: 2, band: 3, leaf: 4 };
    pieces.sort((a, b) => (rank[a.kind] ?? 1) - (rank[b.kind] ?? 1));
    const snips = []; for (let n = 1; SNIP + n / CLOSE_HZ < end; n++) snips.push(SNIP + n / CLOSE_HZ);
    return { pieces, W, H, k, kc, s, G, dir, xs0, speed, sweep, end, snips, bytes, t0: performance.now() / 1000 };
  };

  // the shears, pointing the way they travel; open is the angle of each blade
  function shears(g, k, x, y, size, dir, open, alpha) {
    g.setTransform(k, 0, 0, k, 0, 0); g.translate(x, y); g.scale(dir * size, size); g.globalAlpha = alpha;
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (const sg of [-1, 1]) {
      g.save(); g.rotate(sg * open);
      g.beginPath(); g.moveTo(-6, sg * 3.6); g.lineTo(0, 0); g.strokeStyle = '#e8892c'; g.lineWidth = 2.4; g.stroke();
      g.beginPath(); g.arc(-9.5, sg * 5.6, 4.4, 0, TAU); g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.stroke(); g.lineWidth = 2.2; g.strokeStyle = '#f2a541'; g.stroke();
      g.beginPath(); g.moveTo(-2, 0); g.quadraticCurveTo(6, sg * 3.4, 21, sg * 0.5); g.lineTo(21.5, 0); g.closePath();
      g.fillStyle = '#eef2f0'; g.fill(); g.lineWidth = 0.8; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.stroke();
      g.restore();
    }
    g.beginPath(); g.arc(0, 0, 1.4, 0, TAU); g.fillStyle = '#3a4a3c'; g.fill();
    g.globalAlpha = 1; g.setTransform(1, 0, 0, 1, 0, 0);
  }

  // draws one frame onto g (cleared by the caller); returns false once every piece is gone
  DG.drawCut = (g, cut, now, smooth) => {
    const t = now / 1000 - cut.t0, { k, H, G } = cut; let alive = false;
    g.imageSmoothingEnabled = smooth;
    for (const p of cut.pieces) {
      const u = Math.max(0, t - p.t);
      let dx = 0, dy = 0, rot = 0, skew = 0, sy = 1;
      if (u > 0) {
        if (p.kind === 'hang') {
          // drops whole, swinging a little and going slack
          dy = 0.5 * G * u * u; rot = p.lean * ease(u / 0.5) + Math.sin(u * 7 + p.ph) * 0.04 * clamp(u * 3);
          skew = p.skew * ease(u / 0.5); sy = 1 - 0.2 * ease(u / 0.6);
        } else if (p.kind === 'band') { dx = p.vx * u; dy = -p.vy * u + 0.5 * G * u * u; rot = p.vr * u; }
        else if (p.flutter) {
          dy = p.vy * u + 0.5 * 700 * Math.min(u, 0.6) ** 2 + Math.max(0, u - 0.6) * 520;
          dx = p.vx * u * 0.6 + Math.sin(u * 4 + p.ph) * p.amp * clamp(u * 2); rot = Math.sin(u * 4 + p.ph) * 0.6 + p.vr * u;
        } else if (p.sink) { dy = 0.5 * G * u * u; rot = p.tilt * ease(u / 0.6); }
        else { rot = p.peel * ease(u / 0.4); dy = 0.5 * G * Math.max(0, u - 0.06) ** 2; }   // comes off the wall and falls
      }
      if (p.y0 + dy - Math.abs(dx) * 0.2 > H + 40) continue;
      alive = true;
      g.setTransform(k, 0, 0, k, 0, 0); g.translate(p.px + dx, p.py + dy); g.rotate(rot);
      if (skew) g.transform(1, 0, skew, 1, 0, 0);
      if (sy !== 1) g.scale(1, sy);
      g.translate(-p.px, -p.py);
      g.drawImage(p.c, p.x0, p.y0, p.bw, p.bh);
    }
    // the shears run along the top band
    const ts = t - SNIP;
    if (ts > -0.12 && ts < cut.sweep + 0.2) {
      const x = cut.xs0 + cut.dir * cut.speed * clamp(ts, 0, cut.sweep), y = 28 * cut.s + 14;
      const a = clamp((ts + 0.12) / 0.12) * clamp((cut.sweep + 0.2 - ts) / 0.18);
      shears(g, k, x, y, Math.max(2.2, cut.s * 2.6), cut.dir, 0.06 + 0.34 * Math.abs(Math.sin(Math.PI * CLOSE_HZ * Math.max(0, ts))), a);
      alive = true;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    return alive && t < 4;
  };
})();
