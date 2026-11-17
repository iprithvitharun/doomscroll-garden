// Garden visitors: butterflies, dragonflies and fireflies. Pixel versions for the pixel styles, smooth ones for the rest.
//
// The butterfly and dragonfly flight and wing shapes are ported from ascii-animals
// (https://github.com/DesignerStephen1/ascii-animals, MIT, Copyright (c) 2026 drewdi; see THIRD_PARTY_NOTICES.md):
// the butterfly's flutter random walk, downstroke thrust, glides and foreshortened flap, its fan-shaped wing lobes,
// and the dragonfly's hover / dart / cruise cycle. Here they fly to points and flowers inside a margin instead of
// along a course across the screen, and they are drawn as pixels instead of ASCII glyphs.
(() => {
  const DG = globalThis.DG;
  const { clamp, rand, TAU } = DG;
  const angleDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const frac = (x) => x - Math.floor(x);

  // ---- butterfly wing shape (ascii-animals/src/animals/butterflies.ts)
  const FORE = { from: -0.3, to: 1.0, reach: 0.56, peak: 0.55, round: 0.5, scallop: 0 };
  const HIND = { from: -1.45, to: 0.15, reach: 0.44, peak: 0.48, round: 0.42, scallop: 0.04 };
  const FORE_ROOT = 0.06, HIND_ROOT = -0.02, FLAP_HZ = 2.6, GLIDE = 0.35;
  function lobeReach(l, phi, t) {
    if (t <= 0 || t >= 1) return 0;
    const s = t < l.peak ? (t / l.peak) * 0.5 : 0.5 + ((t - l.peak) / (1 - l.peak)) * 0.5;
    const R = l.reach * Math.pow(Math.sin(Math.PI * s), l.round);
    return l.scallop ? R * (1 - l.scallop * (0.5 + 0.5 * Math.cos(t * Math.PI * 14))) : R;
  }
  function bodyHalfWidth(u) {
    if (u > 0.17 || u < -0.32) return 0;
    if (u > 0.11) return Math.sqrt(Math.max(0, 0.03 * 0.03 - (u - 0.14) ** 2));
    if (u > -0.04) return 0.034;
    return 0.03 * (1 - 0.6 * ((-0.04 - u) / 0.28));
  }
  const lobe = { t: 0, r: 0 };
  function inLobe(l, du, vw) {
    const phi = Math.atan2(du, vw), t = (phi - l.from) / (l.to - l.from), R = lobeReach(l, phi, t), r = Math.hypot(du, vw);
    if (r > R) return false;
    lobe.t = t; lobe.r = r / R; return true;
  }
  // wing paint per kind: [base dark, base light] blend by r, margin, spots
  const KINDS = {
    morpho: (part, t, r) => r > 0.86 ? (part === 0 && r < 0.95 && Math.abs(frac(t * 5) - 0.5) < 0.14 ? [236, 240, 255] : [22, 28, 62]) : r < 0.08 ? [26, 44, 110] : part === 0 && t > 0.9 ? [30, 50, 120] : [50 + 70 * r, 135 + 60 * r, 255],
    monarch: (part, t, r) => r > 0.84 ? (r < 0.95 && Math.abs(frac(t * 6) - 0.5) < 0.16 ? [250, 246, 236] : [26, 18, 14]) : Math.abs(frac(t * (part ? 5 : 6)) - 0.5) > 0.44 && r > 0.2 ? [40, 24, 16] : r < 0.1 ? [120, 50, 16] : [236 + 14 * r, 120 + 50 * r, 24 + 20 * r],
    white: (part, t, r) => part === 0 && t > 0.62 && r > 0.66 ? [52, 52, 58] : part === 0 && r > 0.45 && r < 0.6 && Math.abs(t - 0.45) < 0.08 ? [60, 60, 66] : [236 - 20 * (1 - r), 238 - 14 * (1 - r), 226],
  };
  const BODY = [30, 30, 42];

  function inBox(c, mg, H, pad = 4) { return { x0: mg.x0 + pad, x1: mg.x1 - pad, y0: 8, y1: H - 8 }; }
  function pickGoal(c, mg, H, flowers) {
    const f = flowers.filter(fl => fl.mg === mg && !fl.taken);
    if (f.length && Math.random() < 0.7) { const fl = f[Math.floor(Math.random() * f.length)]; fl.taken = true; c.goal = { x: fl.x, y: fl.y, flower: fl }; return; }
    const b = inBox(c, mg, H, 8); c.goal = { x: rand(b.x0, b.x1), y: rand(b.y0 + 20, b.y1 - 30), flower: null };
  }
  // keep a creature inside its margin: a soft push near the edges, a hard stop at the feed
  function confine(c, mg, H, acc) {
    const b = inBox(c, mg, H);
    if (c.x < b.x0 + 6) acc.x += (b.x0 + 6 - c.x) * 30; if (c.x > b.x1 - 6) acc.x -= (c.x - b.x1 + 6) * 30;
    if (c.y < b.y0 + 6) acc.y += (b.y0 + 6 - c.y) * 30; if (c.y > b.y1 - 6) acc.y -= (c.y - b.y1 + 6) * 30;
  }
  function clampIn(c, mg, H) { const b = inBox(c, mg, H, 2); if (c.x < b.x0) { c.x = b.x0; c.vx = Math.abs(c.vx); } if (c.x > b.x1) { c.x = b.x1; c.vx = -Math.abs(c.vx); } c.y = clamp(c.y, b.y0, b.y1); }

  // ---- butterflies
  DG.makeButterfly = (mg, H, i) => {
    const depth = 0.55 + Math.random() * 0.45, kinds = ['morpho', 'monarch', 'white'];
    return { kind: kinds[i % 3], depth, span: 13 + depth * 7, x: rand(mg.x0 + 8, mg.x1 - 8), y: H + 10, vx: 0, vy: -30, heading: -Math.PI / 2,
      phase: rand(0, TAU), open: 1, glide: 0, glideUntil: 0, flutterX: 0, flutterY: 0, startledUntil: 0, mode: 'fly', until: 0, goal: null, mg, id: i };
  };
  DG.updateButterfly = (b, dt, t, H, flowers) => {
    const cruise = 24 * (0.55 + 0.45 * b.depth);
    if (!b.goal) pickGoal(b, b.mg, H, flowers);
    if (b.mode === 'land') {
      // resting on a flower: wings open and close slowly
      b.x = b.goal.x; b.y = b.goal.y; b.vx = b.vy = 0;
      b.heading += angleDiff(b.heading, -Math.PI / 2 + 0.25 * Math.sin(t * 0.7 + b.id)) * Math.min(1, dt * 3);
      b.open = 0.2 + 0.8 * (0.5 + 0.5 * Math.cos(t * 2.1 + b.id));
      if (t > b.until) { if (b.goal.flower) b.goal.flower.taken = false; b.mode = 'fly'; b.vy = -cruise * 1.5; pickGoal(b, b.mg, H, flowers); }
      return;
    }
    const acc = { x: 0, y: 0 };
    const dx = b.goal.x - b.x, dy = b.goal.y - b.y, dist = Math.hypot(dx, dy);
    const want = b.goal.flower ? cruise * clamp(dist / 30, 0.35, 1) : cruise;
    acc.x += (Math.cos(Math.atan2(dy, dx)) * want - b.vx) * 3;
    acc.y += (Math.sin(Math.atan2(dy, dx)) * want - b.vy) * 3;
    // flutter: a random walk that decays back to zero, so the path zigzags without drifting
    const kick = Math.sqrt(dt) * 140 * (1 - 0.8 * b.glide) * (0.5 + 0.5 * b.depth);
    b.flutterX += -b.flutterX * 3 * dt + (Math.random() * 2 - 1) * kick;
    b.flutterY += -b.flutterY * 3 * dt + (Math.random() * 2 - 1) * kick;
    acc.x += b.flutterX; acc.y += b.flutterY;
    // every downstroke shoves it forward a little
    const down = Math.max(0, -Math.sin(b.phase)) * (1 - b.glide);
    acc.x += Math.cos(b.heading) * down * cruise * 1.4; acc.y += Math.sin(b.heading) * down * cruise * 1.4;
    confine(b, b.mg, H, acc);
    b.vx += acc.x * dt; b.vy += acc.y * dt;
    let speed = Math.hypot(b.vx, b.vy); const cap = cruise * 2.2 + (t < b.startledUntil ? 90 : 0);
    if (speed > cap) { b.vx *= cap / speed; b.vy *= cap / speed; speed = cap; }
    b.x += b.vx * dt; b.y += b.vy * dt; clampIn(b, b.mg, H);
    if (speed > 4) b.heading += clamp(angleDiff(b.heading, Math.atan2(b.vy, b.vx)), -7 * dt, 7 * dt);
    if (b.glide < 0.5 && t > b.glideUntil && speed > cruise * 0.5 && Math.random() < GLIDE * 2.75 * dt) b.glideUntil = t + rand(0.5, 1.4);
    b.glide += ((t < b.glideUntil ? 1 : 0) - b.glide) * Math.min(1, dt * 6);
    const urgency = clamp(speed / (cruise * 2), 0, 1);
    b.phase += dt * TAU * FLAP_HZ * (0.8 + 0.6 * urgency) * (1 - 0.9 * b.glide);
    b.open = 0.1 + 0.9 * (Math.pow(0.5 + 0.5 * Math.cos(b.phase), 0.8) * (1 - b.glide) + 0.96 * b.glide);
    if (b.goal.flower && dist < 2.5) { b.mode = 'land'; b.until = t + rand(2.5, 6); }
    else if (!b.goal.flower && dist < 8) pickGoal(b, b.mg, H, flowers);
  };
  DG.drawButterfly = (g, b) => {
    const S = b.span, open = Math.max(0.08, b.open), h = b.heading + 0.06 * Math.sin(b.phase);
    const ch = Math.cos(h), sh = Math.sin(h), R = Math.ceil(S * 0.62), paint = KINDS[b.kind];
    const shade = 0.75 + 0.25 * b.open;
    for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) {
      const dx = xx + 0.5, dy = yy + 0.5, u = (dx * ch + dy * sh) / S, v = (-dx * sh + dy * ch) / S, av = Math.abs(v);
      let col = null;
      const bw = bodyHalfWidth(u);
      if (bw > 0 && av * S <= Math.max(bw * S, 0.5)) col = BODY;
      else {
        const vw = av / open; let part = -1;
        if (inLobe(FORE, u - FORE_ROOT, vw)) part = 0; else if (inLobe(HIND, u - HIND_ROOT, vw)) part = 1;
        if (part >= 0) { const c = paint(part, lobe.t, lobe.r); col = [c[0] * shade, c[1] * shade, c[2] * shade]; }
      }
      if (col) { g.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`; g.fillRect(Math.round(b.x) + xx, Math.round(b.y) + yy, 1, 1); }
    }
    // feelers
    g.fillStyle = 'rgb(30,30,42)';
    for (const sd of [-1, 1]) for (let k = 1; k <= 3; k++) {
      const u = 0.16 + k * 0.07, v = (0.02 + k * 0.035) * sd;
      g.fillRect(Math.round(b.x + (u * ch - v * sh) * S), Math.round(b.y + (u * sh + v * ch) * S), 1, 1);
    }
  };
  DG.startleButterfly = (b, x, y, t, H, flowers) => {
    const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy) || 1; if (d > 46) return;
    if (b.goal && b.goal.flower) b.goal.flower.taken = false;
    b.mode = 'fly'; b.vx += (dx / d) * 110 * b.depth; b.vy += (dy / d) * 110 * b.depth - 30;
    b.startledUntil = t + rand(0.6, 1.2); b.glideUntil = 0; pickGoal(b, b.mg, H, []);
  };

  // ---- dragonflies (ascii-animals/src/animals/dragonflies.ts: hover, dart, cruise)
  DG.makeDragonfly = (mg, H, i) => {
    const depth = 0.6 + Math.random() * 0.4;
    return { depth, span: 24 + depth * 8, x: rand(mg.x0 + 10, mg.x1 - 10), y: rand(H * .2, H * .7), vx: 0, vy: 0, heading: -Math.PI / 2, phase: 0,
      mode: 'hover', until: 0, aim: -Math.PI / 2, startledUntil: 0, mg, id: i + 50 };
  };
  DG.updateDragonfly = (d, dt, t, H) => {
    const cruise = 30 * (0.55 + 0.45 * d.depth);
    const b = inBox(d, d.mg, H, 10);
    const aimAt = () => Math.atan2(rand(b.y0 + 20, b.y1 - 20) - d.y, rand(b.x0, b.x1) - d.x);
    if (t >= d.until) {
      const from = d.mode;
      const next = from === 'hover' ? 'dart' : from === 'dart' ? (Math.random() < 0.5 ? 'cruise' : 'hover') : Math.random() < 0.35 ? 'dart' : 'hover';
      d.mode = next;
      if (next === 'dart') { d.until = t + rand(0.15, 0.45); if (from === 'cruise') d.aim = d.heading + rand(-0.4, 0.4) * 0.26; }
      else if (next === 'cruise') { d.until = t + rand(1.2, 4.5); d.aim = aimAt(); }
      else { d.until = t + Math.min(3, Math.max(0.15, -Math.log(1 - Math.random()) * 0.7)) * 1.3; d.aim = aimAt(); }
    }
    const acc = { x: 0, y: 0 };
    const steer = (dir, speed, grip) => { acc.x += (Math.cos(dir) * speed - d.vx) * grip; acc.y += (Math.sin(dir) * speed - d.vy) * grip; };
    if (d.mode === 'dart') steer(d.aim, cruise * 4 * 1.5, 10);
    else if (d.mode === 'cruise') { d.aim += rand(-1, 1) * dt * 1.2; steer(d.aim, cruise * 1.8, 3); }
    else { steer(d.aim, cruise * 0.05, 20); acc.x += Math.cos(t * 3 + d.id) * 40; acc.y += Math.sin(t * 4.3 + d.id * 2) * 40; }
    confine(d, d.mg, H, acc);
    d.vx += acc.x * dt; d.vy += acc.y * dt;
    let speed = Math.hypot(d.vx, d.vy); const cap = cruise * 4.5 * 1.5;
    if (speed > cap) { d.vx *= cap / speed; d.vy *= cap / speed; }
    d.x += d.vx * dt; d.y += d.vy * dt; clampIn(d, d.mg, H);
    // bounce the aim off the margin walls
    if (d.x <= b.x0 || d.x >= b.x1) d.aim = Math.PI - d.aim;
    const rate = d.mode === 'dart' ? 14 : d.mode === 'cruise' ? 4 : 2.5, face = d.mode === 'cruise' ? Math.atan2(d.vy, d.vx) : d.aim;
    d.heading += clamp(angleDiff(d.heading, face), -rate * dt, rate * dt);
    d.phase += dt * TAU * 7;
  };
  DG.drawDragonfly = (g, d) => {
    const S = d.span, ch = Math.cos(d.heading), sh = Math.sin(d.heading), R = Math.ceil(S * 0.6);
    const openF = 0.86 + 0.14 * Math.cos(d.phase), openH = 0.86 + 0.14 * Math.cos(d.phase + 1.7);
    const glint = frac(d.phase / TAU);
    for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) {
      const dx = xx + 0.5, dy = yy + 0.5, u = (dx * ch + dy * sh) / S, v = (-dx * sh + dy * ch) / S, av = Math.abs(v);
      let col = null, a = 1;
      if (u > 0.2 && u < 0.29 && av < 0.06) col = av > 0.025 && S > 24 ? [235, 240, 236] : [20, 60, 40];                // head and eyes
      else if (u > 0.05 && u <= 0.2 && av < 0.05) col = Math.floor((u + av) * 40) % 2 ? [60, 200, 120] : [20, 90, 50];   // striped thorax
      else if (u > -0.62 && u <= 0.05 && av < 0.026 + (u > -0.1 ? 0.01 : 0)) col = Math.floor(-u * 16) % 2 ? [36, 170, 104] : [18, 96, 60];
      else {
        // four long clear wings held straight out, flickering
        for (const [wu, len, wid, open] of [[0.13, 0.5, 0.06, openF], [0.05, 0.46, 0.075, openH]]) {
          const along = av / open, across = Math.abs(u - wu + along * 0.08);
          if (along > 0.04 && along < len && across < wid * Math.sin(Math.PI * Math.min(1, along / len * 0.9 + 0.1))) {
            const lead = u > wu && across > wid * 0.6, spot = along > len * 0.82;
            const lit = Math.abs(along / len - glint) < 0.08;
            col = lead ? [222, 176, 100] : spot ? [160, 86, 52] : lit ? [255, 255, 255] : [210, 232, 245]; a = lead || spot ? 0.9 : lit ? 0.85 : 0.55;
            break;
          }
        }
      }
      if (col) { g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`; g.fillRect(Math.round(d.x) + xx, Math.round(d.y) + yy, 1, 1); }
    }
  };
  DG.startleDragonfly = (d, x, y, t) => { if (Math.hypot(d.x - x, d.y - y) > 50) return; d.mode = 'dart'; d.aim = Math.atan2(d.y - y, d.x - x); d.until = t + 0.5; d.startledUntil = d.until; };

  // ---- fireflies (dark pages)
  DG.makeFirefly = (mg, H, i) => ({ x: rand(mg.x0 + 4, mg.x1 - 4), y: rand(H * 0.15, H - 10), ph: rand(0, TAU), sp: rand(0.6, 1.4), born: 0, mg, id: i });
  const fireflyAt = (f, t, H) => {
    const x = f.x + Math.sin(t * f.sp + f.ph) * 6, y = ((f.y - t * 5 * f.sp) % (H - 30) + (H - 30)) % (H - 30) + 20 + Math.cos(t * f.sp * 1.4 + f.ph) * 4;
    return x < f.mg.x0 + 2 || x > f.mg.x1 - 3 ? null : { x, y, p: 0.5 + 0.5 * Math.sin(t * 5.5 * f.sp + f.ph) };
  };
  DG.drawFirefly = (g, f, t, H) => {
    const q = fireflyAt(f, t, H); if (!q) return;
    const x = Math.round(q.x), y = Math.round(q.y), p = q.p;
    const gr = g.createRadialGradient(x + 1, y + 1, 0, x + 1, y + 1, 8); gr.addColorStop(0, `rgba(255,232,130,${0.42 * p})`); gr.addColorStop(1, 'rgba(190,230,90,0)');
    g.fillStyle = gr; g.fillRect(x - 7, y - 7, 16, 16);
    g.fillStyle = `rgba(255,250,205,${p})`; g.fillRect(x, y, 2, 2);
  };

  // ---- smooth versions, for the styles that aren't pixel art. Units are still art px; the caller scales the context.
  // Wings are painted once per kind at high resolution with the same shapes and colours, then drawn scaled:
  // flapping squashes each wing across the body, which is how the pixel version foreshortens them too.
  const WS = 160, U0 = -0.5, U1 = 0.62, V1 = 0.62, wings = {};
  function wingSprite(kind, part) {
    const key = kind + part; if (wings[key]) return wings[key];
    const w = Math.ceil((U1 - U0) * WS), h = Math.ceil(V1 * WS), c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data;
    const l = part === 0 ? FORE : HIND, root = part === 0 ? FORE_ROOT : HIND_ROOT, paint = KINDS[kind];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const u = U0 + (i + 0.5) / WS, vw = (j + 0.5) / WS;
      if (!inLobe(l, u - root, vw)) continue;
      const col = paint(part, lobe.t, lobe.r), a = clamp((1 - lobe.r) * l.reach * WS * 0.7, 0, 1), k = (j * w + i) * 4;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255 * a;
    }
    x.putImageData(img, 0, 0);
    return (wings[key] = c);
  }
  DG.drawButterflySmooth = (g, b) => {
    const S = b.span, open = Math.max(0.08, b.open), h = b.heading + 0.06 * Math.sin(b.phase);
    g.save(); g.translate(b.x, b.y); g.rotate(h);
    for (const side of [1, -1]) for (const part of [1, 0]) {
      const c = wingSprite(b.kind, part);
      g.save(); g.scale(1, side * open); g.drawImage(c, U0 * S, 0, (U1 - U0) * S, V1 * S); g.restore();
    }
    g.fillStyle = 'rgb(30,28,38)';
    g.beginPath(); g.ellipse(-0.17 * S, 0, 0.15 * S, 0.026 * S, 0, 0, DG.TAU); g.fill();
    g.beginPath(); g.ellipse(0.035 * S, 0, 0.08 * S, 0.036 * S, 0, 0, DG.TAU); g.fill();
    g.beginPath(); g.arc(0.14 * S, 0, 0.032 * S, 0, DG.TAU); g.fill();
    g.strokeStyle = 'rgb(30,28,38)'; g.lineWidth = Math.max(0.25, 0.012 * S); g.lineCap = 'round';
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(0.16 * S, 0.01 * sd * S); g.quadraticCurveTo(0.27 * S, 0.06 * sd * S, 0.37 * S, 0.125 * sd * S); g.stroke(); g.beginPath(); g.arc(0.37 * S, 0.125 * sd * S, 0.018 * S, 0, DG.TAU); g.fill(); }
    g.restore();
  };
  let dfly = null; const DS = 200;
  function dragonflySprite() {
    if (dfly) return dfly;
    const R = Math.ceil(DS * 0.62), c = document.createElement('canvas'); c.width = c.height = R * 2;
    const x = c.getContext('2d'), img = x.createImageData(R * 2, R * 2), d = img.data;
    for (let yy = 0; yy < R * 2; yy++) for (let xx = 0; xx < R * 2; xx++) {
      const u = (xx + 0.5 - R) / DS, v = (yy + 0.5 - R) / DS, av = Math.abs(v);
      let col = null, a = 1;
      if (u > 0.2 && u < 0.29 && av < 0.06) col = av > 0.025 ? [228, 236, 232] : [20, 60, 40];
      else if (u > 0.05 && u <= 0.2 && av < 0.05) col = Math.floor((u + av) * 40) % 2 ? [60, 200, 120] : [20, 90, 50];
      else if (u > -0.62 && u <= 0.05 && av < 0.026 + (u > -0.1 ? 0.01 : 0)) col = Math.floor(-u * 16) % 2 ? [36, 170, 104] : [18, 96, 60];
      else for (const [wu, len, wid] of [[0.13, 0.5, 0.06], [0.05, 0.46, 0.075]]) {
        const along = av, across = Math.abs(u - wu + along * 0.08);
        if (along > 0.04 && along < len && across < wid * Math.sin(Math.PI * Math.min(1, along / len * 0.9 + 0.1))) {
          const lead = u > wu && across > wid * 0.6, spot = along > len * 0.82, vein = Math.abs(Math.sin(along * 90)) < 0.08;
          col = lead ? [222, 176, 100] : spot ? [160, 86, 52] : vein ? [170, 200, 215] : [215, 235, 248]; a = lead || spot ? 0.9 : vein ? 0.6 : 0.4;
          break;
        }
      }
      if (col) { const k = (yy * R * 2 + xx) * 4; d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255 * a; }
    }
    x.putImageData(img, 0, 0);
    return (dfly = c);
  }
  DG.drawDragonflySmooth = (g, d) => {
    const c = dragonflySprite(), s = d.span / DS;
    g.save(); g.translate(d.x, d.y); g.rotate(d.heading); g.scale(1, 0.88 + 0.12 * Math.cos(d.phase));
    g.drawImage(c, -c.width / 2 * s, -c.height / 2 * s, c.width * s, c.height * s); g.restore();
  };
  DG.drawFireflySmooth = (g, f, t, H) => {
    const q = fireflyAt(f, t, H); if (!q) return;
    const gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, 9); gr.addColorStop(0, `rgba(255,236,140,${0.5 * q.p})`); gr.addColorStop(0.35, `rgba(220,240,120,${0.18 * q.p})`); gr.addColorStop(1, 'rgba(190,230,90,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, 9, 0, DG.TAU); g.fill();
    g.fillStyle = `rgba(255,252,215,${0.4 + 0.6 * q.p})`; g.beginPath(); g.arc(q.x, q.y, 0.9, 0, DG.TAU); g.fill();
  };
})();
