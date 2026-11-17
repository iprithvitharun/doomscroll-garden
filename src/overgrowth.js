// The overgrowth, modelled on real walls taken over by ivy and morning glory:
//   1. mounds in the bottom corners, with a few bare shoots reaching out
//   2. climbers up the window edges (and up any wide empty margin)
//   3. the edge climbers turn at the top corners and run along the top, building a dense band
//   4. from that band a curtain of strands hangs down, each one leaf wide, of very different lengths,
//      thick near the top and tapering to tiny leaves at the tip, with the page showing between them
// Each strand grows from its base; leaves open behind the tip; some strands sit behind the others in shade.
//
// Everything here is in CSS px and garden minutes. Styles draw the scene however they like (styles.js).
(() => {
  const DG = globalThis.DG;
  const { clamp, rng, lerp, ease } = DG;
  const LEAF_GROW = 0.7, BUD_GROW = 1.2, OPEN_GROW = 1;

  function noise1(r, n) {
    const v = []; for (let i = 0; i <= n; i++) v.push(r());
    return (u) => { const x = clamp(u) * n, i = Math.min(n - 1, Math.floor(x)), f = x - i, s = f * f * (3 - 2 * f); return lerp(v[i], v[i + 1], s); };
  }
  function cr(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return [0, 1].map(k => .5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
  }
  // a smooth path through control points, resampled every 3 px
  function resample(P) {
    const raw = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      const n = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2));
      for (let s = 0; s < n; s++) raw.push(cr(p0, p1, p2, p3, s / n));
    }
    raw.push(P[P.length - 1]);
    const pts = [{ x: raw[0][0], y: raw[0][1], s: 0 }]; let acc = 0;
    for (let i = 1; i < raw.length; i++) {
      acc += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
      if (acc - pts[pts.length - 1].s >= 3 || i === raw.length - 1) pts.push({ x: raw[i][0], y: raw[i][1], s: acc });
    }
    for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; pts[i].a = Math.atan2(b.y - a.y, b.x - a.x); }
    return pts;
  }

  DG.buildOvergrowth = ({ W, H, bands = [], seed = 1 }) => {
    const r = rng(seed);
    const stems = [], leaves = [], flowers = [], tendrils = [];
    const sc = Math.sqrt((W * H) / (1440 * 900));   // a little bigger on big screens

    // kind decides how leaves sit: hanging strands droop, climbers face out, mounds and the band spread
    function strand(o) {
      const pts = resample(o.path), L = pts[pts.length - 1].s; if (L < 6) return null;
      const { t0, t1 } = o, pw = o.pw || 1.5;
      for (const p of pts) { const u = p.s / L; p.t = t0 + (t1 - t0) * (1 - Math.pow(1 - u, 1 / pw)); p.w = lerp(o.w0, o.w1, u); }
      // role says how the strand comes down when it is cut; a side strand falls with the strand it split from
      const st = { pts, back: !!o.back, kind: o.kind, role: o.role || o.kind, id: stems.length };
      st.parent = o.parent != null ? o.parent : st.id;
      stems.push(st);
      let side = r() < .5 ? 1 : -1, bloomRun = 0;
      for (let s = o.gap * (0.4 + r() * 0.6); s < L - 1; s += o.gap * (0.75 + r() * 0.5)) {
        const i = Math.min(pts.length - 1, Math.round(s / L * (pts.length - 1))), p = pts[i], u = s / L;
        let size = lerp(o.size[0], o.size[1], Math.pow(u, o.taper || 1.1)) * (0.82 + r() * 0.36) * sc;
        let ang;
        if (o.kind === 'hang') ang = p.a + side * (0.35 + r() * 0.45);
        else if (o.kind === 'climb') ang = p.a + side * (1.0 + r() * 0.45);
        else if (o.kind === 'band') ang = Math.PI / 2 + (r() - .5) * 2.4;
        else ang = p.a + side * (0.5 + r() * 1.1);
        if (o.back) size *= 0.9;
        leaves.push({ x: p.x, y: p.y, ang, size, tone: r(), born: p.t + 0.08, back: st.back, id: leaves.length, sid: st.id });
        if (o.double && r() < o.double) leaves.push({ x: p.x, y: p.y, ang: ang + (r() - .5) * 1.2, size: size * 0.85, tone: r(), born: p.t + 0.25, back: st.back, id: leaves.length, sid: st.id });
        // morning glories open along the middle and lower part, often two or three together
        if (o.bloom && !st.back && u > (o.bloomFrom || 0.3) && (r() < o.bloom || (bloomRun > 0 && r() < 0.35))) {
          const sd = -side, pa = p.a + sd * (0.9 + r() * 0.5), ped = 5 + r() * 5, R = (8.5 + r() * 4.5) * sc;
          const budAt = p.t + 1.2 + r() * 1.8, openAt = budAt + 1.6 + r() * 1.8;
          flowers.push({ p: { x: p.x, y: p.y, a: p.a }, cx: p.x + Math.cos(pa) * ped, cy: p.y + Math.sin(pa) * ped, R, budAt, openAt,
            rot: r() * DG.TAU, tilt: r() * DG.TAU, squash: 0.7 + r() * 0.3, budA: pa - Math.PI * 0.15 * sd, twist: r() < .5 ? 1 : -1, view: r() < .3 ? 'side' : 'open', id: flowers.length, sid: st.id });
          bloomRun = bloomRun > 0 ? bloomRun - 1 : 1;
        } else if (bloomRun > 0) bloomRun--;
        side = -side;
      }
      if (o.tendril) { const e = pts[pts.length - 1]; tendrils.push({ x: e.x, y: e.y, a: e.a, dir: r() < .5 ? 1 : -1, size: (4 + r() * 3) * sc, born: e.t + 0.3, sid: st.id }); }
      return st;
    }
    const wob = (amp) => (r() - .5) * 2 * amp;
    const inward = (side) => side === 'left' ? 1 : -1;
    const edgeX = (side, d) => side === 'left' ? d : W - d;

    for (const side of ['left', 'right']) {
      const k = inward(side);
      // 1. corner mound: short shoots fanning up and inward, densely leaved
      for (let i = 0; i < 8; i++) {
        const x0 = edgeX(side, r() * 70 * sc), a = -Math.PI / 2 + k * (-0.25 + r() * 1.15), len = (60 + r() * 170) * sc;
        const P = [[x0, H + 12]]; let x = x0, y = H + 12, aa = a;
        for (let s = 0; s < len; s += 40) { aa += wob(0.25); x += Math.cos(aa) * 40; y += Math.sin(aa) * 40; P.push([x, y]); }
        const t0 = r() * 3;
        strand({ path: P, t0, t1: t0 + 4 + r() * 5, kind: 'mound', w0: 2.6, w1: 0.9, gap: 11, size: [30, 14], double: 0.5, bloom: 0.035, bloomFrom: 0.4, tendril: r() < .5, back: r() < .35 });
      }
      // a couple of long bare shoots reaching out across the page, leaves sparse, tiny at the tip
      for (let i = 0; i < 2; i++) {
        const x0 = edgeX(side, (20 + r() * 50) * sc), a = -Math.PI / 2 + k * (0.55 + r() * 0.45), len = (300 + r() * 260) * sc;
        const P = [[x0, H + 8]]; let x = x0, y = H + 8, aa = a;
        for (let s = 0; s < len; s += 55) { aa += wob(0.18) - k * 0.03; x += Math.cos(aa) * 55; y += Math.sin(aa) * 55; P.push([x, y]); }
        const t0 = 3 + r() * 4;
        strand({ path: P, t0, t1: t0 + 9 + r() * 5, kind: 'climb', role: 'reach', w0: 1.8, w1: 0.8, gap: 24, size: [22, 7], taper: 0.8, bloom: 0.04, tendril: true });
      }
      // 2. climbers up the window edge
      const ex = (12 + r() * 10) * sc;
      const up = [[edgeX(side, ex), H + 20]];
      for (let y = H - 60; y > 70; y -= 70 + r() * 40) up.push([edgeX(side, ex + wob(10) + 6), y]);
      up.push([edgeX(side, ex + 8), 36]);
      strand({ path: up, t0: 0.3, t1: 7.5, pw: 1.25, kind: 'climb', role: 'edge', w0: 3.4, w1: 1.6, gap: 13, size: [30, 18], taper: 0.6, double: 0.45, bloom: 0.04 });
      for (let j = 0; j < 2; j++) {
        const d = (36 + j * 26 + r() * 16) * sc, top = H * (0.18 + r() * 0.45);
        const P = [[edgeX(side, d), H + 20]];
        for (let y = H - 50; y > top; y -= 60 + r() * 40) P.push([edgeX(side, d + wob(14)), y]);
        const t0 = 1.2 + j * 1.5 + r();
        strand({ path: P, t0, t1: t0 + 6 + r() * 4, kind: 'climb', w0: 2.4, w1: 1, gap: 14, size: [28, 9], double: 0.3, bloom: 0.045, tendril: true, back: j === 1 });
      }
      // 3. the runner along the top: picks up where the edge climber reached the corner
      const reach = W * (0.52 + r() * 0.08), run = [[edgeX(side, ex + 8), 36], [edgeX(side, ex + 26), 14]];
      for (let x = 70; x < reach; x += 60 + r() * 30) run.push([edgeX(side, x), 10 + wob(7) + 6]);
      strand({ path: run, t0: 7, t1: 17, pw: 1.15, kind: 'band', w0: 3, w1: 1.6, gap: 10, size: [28, 20], taper: 0.5, double: 0.8 });
    }
    // empty margins get their own climbers, so a wide margin fills before the feed does
    for (const b of bands) {
      const w = b.x1 - b.x0; if (w < 100) continue;
      for (let j = 0; j < (w > 220 ? 2 : 1); j++) {
        const cx = b.x0 + w * (0.3 + 0.4 * r()), top = H * (0.08 + r() * 0.35);
        const P = [[cx, H + 20]];
        for (let y = H - 60; y > top; y -= 70 + r() * 40) P.push([cx + wob(w * 0.12), y]);
        const t0 = 1.5 + r() * 2;
        strand({ path: P, t0, t1: t0 + 7 + r() * 3, kind: 'climb', role: 'margin', w0: 2.8, w1: 1.1, gap: 13, size: [30, 10], double: 0.35, bloom: 0.045, tendril: true, back: j === 1 });
      }
    }

    // when the top band reaches each x (the two runners come in from the corners)
    const runners = stems.filter(s => s.kind === 'band');
    const bandAt = (x) => { let best = 99; for (const st of runners) for (const p of st.pts) if (Math.abs(p.x - x) < 12 && p.t < best) best = p.t; return best === 99 ? 16 : best; };

    // 4. the curtain
    // each wave gets its own length pattern, so the gaps one leaves, the next one partly fills
    const lenNs = [noise1(r, 7), noise1(r, 9), noise1(r, 6)], clumpN = noise1(r, 11);
    for (let wave = 0; wave < 3; wave++) {
      let x = 4 + r() * 10;
      while (x < W - 2) {
        const u = x / W, clump = clumpN(u), lenN = lenNs[wave];
        // longer over the middle of the page, where the feed usually is, so that is what gets veiled
        const centre = 1 - Math.abs(u - 0.5) * 2;
        const frac = clamp((0.12 + 0.88 * Math.pow(lenN(u), 0.85) * (0.62 + 0.38 * r())) * (0.8 + 0.45 * centre) * (wave === 2 ? 0.85 : 1), 0.08, 0.97);
        const L = frac * H, drift = wob(14), amp = 2 + r() * 6;
        const P = [[x, -6]];
        for (let y = 50 + r() * 30; y < L; y += 60 + r() * 30) P.push([x + drift * (y / H) + Math.sin(y * 0.02 + x) * amp, y]);
        P.push([x + drift * (L / H), L]);
        const tb = bandAt(x), t0 = tb + (wave === 0 ? 0.6 + r() * 2.5 : wave === 1 ? 5 + r() * 5 : 10 + r() * 6);
        let t1 = t0 + 5 + 11 * frac + r() * 3;
        if (t1 > 29.5) t1 = Math.max(t0 + 3, 29.5);
        const back = r() < (wave === 1 ? 0.55 : 0.35);
        const st = strand({ path: P, t0, t1, kind: 'hang', w0: 1.7, w1: 0.8, gap: 11 + r() * 3, size: [24 + r() * 6, 7], taper: 1.25, double: 0.12, bloom: 0.03, bloomFrom: 0.3, tendril: r() < .3, back });
        // now and then a side strand splits off and hangs beside it
        if (st && frac > 0.35 && r() < 0.3) {
          const p = st.pts[Math.floor(st.pts.length * (0.25 + r() * 0.25))], L2 = L * (0.25 + r() * 0.3), dx = (r() < .5 ? -1 : 1) * (8 + r() * 10);
          strand({ path: [[p.x, p.y], [p.x + dx * 0.6, p.y + 20], [p.x + dx, p.y + L2 * 0.6], [p.x + dx * 1.1, p.y + L2]], t0: p.t + 0.5, t1: Math.min(29.8, p.t + 4 + r() * 4), kind: 'hang', parent: st.id, w0: 1.2, w1: 0.7, gap: 11, size: [22, 7], taper: 1.2, bloom: 0.03, back });
        }
        x += (wave === 0 ? 26 : wave === 1 ? 40 : 54) * (0.6 + 0.8 * r()) * (1.25 - 0.5 * clump) * sc;
      }
    }

    // back strands draw first; newer leaves sit on top of older ones
    stems.sort((a, b) => (b.back - a.back));
    leaves.sort((a, b) => a.born - b.born);
    const byId = []; for (const st of stems) byId[st.id] = st;
    return { W, H, C: 26 * sc, stems, byId, leaves, flowers, tendrils };
  };

  const upper = (arr, m) => { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid].born <= m) lo = mid + 1; else hi = mid; } return lo; };

  // What is visible after m garden minutes.
  DG.sceneAt = (net, m) => {
    const sc = { m, C: net.C, W: net.W, H: net.H, stems: [], leaves: [], buds: [], flowers: [], tendrils: [], hedge: [] };
    for (const st of net.stems) {
      const pts = st.pts; let lo = 0, hi = pts.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid].t <= m) lo = mid + 1; else hi = mid; }
      if (lo >= 2) sc.stems.push({ pts: lo === pts.length ? pts : pts.slice(0, lo), back: st.back, id: st.id });
    }
    for (let i = 0, n = upper(net.leaves, m); i < n; i++) { const l = net.leaves[i], g = (m - l.born) / LEAF_GROW; sc.leaves.push(g >= 1 ? l : { ...l, size: l.size * (0.3 + 0.7 * ease(g)), growing: g }); }
    for (const f of net.flowers) {
      if (m < f.budAt) continue;
      if (m < f.openAt) sc.buds.push({ ...f, g: ease((m - f.budAt) / BUD_GROW) });
      else sc.flowers.push({ ...f, o: ease((m - f.openAt) / OPEN_GROW) });
    }
    for (const t of net.tendrils) if (m >= t.born) sc.tendrils.push(t);
    return sc;
  };
  // split a scene into the shaded back layer and the front layer (flowers are always in front)
  DG.layers = (sc) => [
    { ...sc, stems: sc.stems.filter(s => s.back), leaves: sc.leaves.filter(l => l.back), buds: [], flowers: [], tendrils: [] },
    { ...sc, stems: sc.stems.filter(s => !s.back), leaves: sc.leaves.filter(l => !l.back) },
  ];
  // the stem's width at a point, thinner while it is young
  DG.stemW = (p, m) => p.w * (0.5 + 0.5 * clamp((m - p.t) / 2.5));
})();
