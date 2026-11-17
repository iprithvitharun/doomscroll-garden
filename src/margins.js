// Finds empty vertical bands beside a page's content, in CSS px: the window-edge margins, and also
// gaps inside the layout (Reddit's space between its nav and the comments, say).
// A point counts as empty unless something paints there: text, images, icons, controls, or a background,
// border or shadow that differs from the page. Shadow DOM is looked into.
(() => {
  const DG = globalThis.DG;
  const PAINT_TAGS = new Set(['IMG', 'SVG', 'svg', 'VIDEO', 'CANVAS', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'IFRAME', 'PICTURE', 'path', 'use', 'image']);

  const parseColor = (c) => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  // the deepest element at a point, through open shadow roots
  const deepAt = (x, y) => {
    let el = document.elementFromPoint(x, y);
    while (el && el.shadowRoot) { const inner = el.shadowRoot.elementFromPoint(x, y); if (!inner || inner === el) break; el = inner; }
    return el;
  };
  const parentOf = (el) => el.parentElement || (el.parentNode && el.parentNode.host) || null;

  // The background the margins actually show: the first opaque background above a point near each window edge.
  const bgAt = (x, y) => {
    let el = deepAt(x, y);
    while (el) { const c = parseColor(getComputedStyle(el).backgroundColor); if (c && c[3] > 0.5) return c; el = parentOf(el); }
    return null;
  };
  const same = (a, b) => a && b && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 12;
  DG.pageBackground = () => {
    const H = window.innerHeight, W = document.documentElement.clientWidth;
    const l = bgAt(3, H * 0.6), r = bgAt(W - 3, H * 0.6);
    if (same(l, r)) return l;
    for (const el of [document.body, document.documentElement]) {
      if (!el) continue;
      const c = parseColor(getComputedStyle(el).backgroundColor);
      if (c && c[3] > 0.5) return c;
    }
    return r || l || [255, 255, 255, 1];
  };
  DG.isDarkPage = () => { const c = DG.pageBackground(); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 < 0.35; };

  function paints(el, bg) {
    if (PAINT_TAGS.has(el.tagName)) return true;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'contents') return false;
    const c = parseColor(cs.backgroundColor);
    if (c && c[3] > 0.05 && (Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2])) > 10) return true;
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
    if (cs.boxShadow && cs.boxShadow !== 'none') return true;
    for (const side of ['Left', 'Right', 'Top', 'Bottom']) {
      if (parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== 'none') { const bc = parseColor(cs[`border${side}Color`]); if (bc && bc[3] > 0.05) return true; }
    }
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true;
    return false;
  }

  function occupied(x, y, bg, W, skip) {
    let el = deepAt(x, y);
    while (el && el !== document.body && el !== document.documentElement) {
      if (skip.has(el)) return false;
      const r = el.getBoundingClientRect();
      const hit = paints(el, bg);
      if (r.width >= W * 0.92) return hit;   // a full-width wrapper: only counts if it paints (a top bar, say)
      if (hit) return true;
      el = parentOf(el);
    }
    return false;
  }

  // a bar pinned across the top of the window (fixed or sticky): the garden starts below it
  function pinnedTop(W, H) {
    let top = 0;
    for (const x of [W * 0.15, W * 0.5, W * 0.85]) for (const el of document.elementsFromPoint(x, 4)) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      const r = el.getBoundingClientRect();
      if (r.top <= 4 && r.height > 16 && r.height < H * 0.25 && r.width > W * 0.5) top = Math.max(top, r.bottom);
    }
    return Math.ceil(top);
  }

  // Returns { bands: [{ side, x0, x1 }], top, W, H }: at most one band per side, the widest empty one.
  DG.detectMargins = (skip = new Set()) => {
    const W = document.documentElement.clientWidth, H = window.innerHeight;
    const bg = DG.pageBackground();
    const rows = [0.18, 0.3, 0.42, 0.54, 0.66, 0.78, 0.9].map(f => Math.round(H * f));
    const step = 6, cols = Math.floor(W / step), empty = [];
    for (let i = 0; i < cols; i++) { const x = i * step + 3; empty.push(!rows.some(y => occupied(x, y, bg, W, skip))); }
    const runs = [];
    for (let i = 0; i < cols;) { if (!empty[i]) { i++; continue; } let j = i; while (j + 1 < cols && empty[j + 1]) j++; runs.push([i * step, (j + 1) * step]); i = j + 1; }
    const bands = [];
    for (const side of ['left', 'right']) {
      let best = null;
      for (const [a, b] of runs) {
        // keep a small gap from content, but run right up to the window edge
        const x0 = a <= 0 ? 0 : a + 6, x1 = b >= cols * step ? W : b - 6;
        const mid = (x0 + x1) / 2;
        if ((side === 'left' ? mid >= W / 2 : mid < W / 2) || x1 - x0 < 40) continue;
        if (!best || x1 - x0 > best.x1 - best.x0) best = { side, x0, x1 };
      }
      if (best) bands.push(best);
    }
    // top: a pinned bar, or anything painted at the top of a band (probed downward)
    let top = pinnedTop(W, H);
    const xs = bands.flatMap(b => [b.x0 + (b.x1 - b.x0) * 0.3, b.x0 + (b.x1 - b.x0) * 0.7]);
    if (xs.length) for (let y = 2; y < H * 0.4; y += 4) { if (xs.some(x => occupied(x, y, bg, W, skip))) top = Math.max(top, y + 4); else if (y - top > 32) break; }
    return { bands, top, W, H };
  };
})();
