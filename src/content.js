// Doomscroll Garden content script: lets vines take over a feed site while you scroll on it: the edges first,
// then a curtain over the feed. Each flick of the feed pushes them further; reading on its own barely does.
// A button cuts them down (they grow back faster each time). Everything stays in chrome.storage.local.
(() => {
  const DG = globalThis.DG;
  if (window.top !== window) return;
  const site = DG.siteFor(location.hostname);
  if (!site || document.getElementById('dg-garden')) return;

  const ART = DG.ART, gardenKey = `garden:${site}`, hue = DG.SITES[site].hue;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let settings = { ...DG.DEFAULT_SETTINGS };
  let gd = { m: 0, last: 0, reset: 0, cuts: 0, cutsDay: '' };   // the stored garden record
  let m = 0, day = DG.dayKey(), dayStats = {}, lastInput = 0, lastScroll = 0, dirty = 0;
  let mv = 0;            // the garden as drawn: eases toward m, so each flick shows as a push of growth
  let canBurst = true;   // the first scroll on a fresh garden sprouts a little at once

  // ---- when the extension is reloaded, updated or removed, Chrome leaves this script running on the page
  // but cut off from the extension: chrome.* calls then throw. Notice it, take the vines away and stop.
  const off = new AbortController(), on = { signal: off.signal };
  let gone = false, tickTimer = 0;
  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  function retire() {
    if (gone) return;
    gone = true; off.abort(); clearInterval(tickTimer); clearTimeout(noteTimer); clearTimeout(resizeTimer);
    host.remove();
  }
  const store = (items) => {
    if (!alive()) return retire();
    try { chrome.storage.local.set(items).catch(() => {}); } catch { retire(); }
  };

  // ---- overlay, in a shadow root so the page's CSS can't reach it
  const host = document.createElement('div');
  host.id = 'dg-garden';
  host.style.cssText = 'position:fixed!important;left:0!important;top:0!important;pointer-events:none!important;z-index:2147483646!important;margin:0!important;padding:0!important;border:0!important;display:block!important;contain:strict!important;';
  const root = host.attachShadow({ mode: 'open' });
  const gc = document.createElement('canvas'), fx = document.createElement('canvas');
  gc.setAttribute('aria-hidden', 'true'); fx.setAttribute('aria-hidden', 'true');
  for (const c of [gc, fx]) c.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;';
  fx.style.imageRendering = 'pixelated';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = 'Cut the vines down. Each cut today makes them grow back faster.';
  btn.style.cssText = 'position:absolute;right:16px;bottom:16px;pointer-events:auto;display:none;align-items:center;gap:7px;padding:8px 14px 8px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(15,19,16,.9);color:#eef3ec;font:600 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.01em;box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer;outline:none;transition:background .15s,transform .1s;';
  const svgNS = 'http://www.w3.org/2000/svg', icon = document.createElementNS(svgNS, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('width', '16'); icon.setAttribute('height', '16'); icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', 'currentColor'); icon.setAttribute('stroke-width', '2'); icon.setAttribute('stroke-linecap', 'round');
  for (const [tag, attrs] of [['circle', { cx: 6, cy: 6, r: 3 }], ['circle', { cx: 6, cy: 18, r: 3 }], ['path', { d: 'M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12' }]]) { const el = document.createElementNS(svgNS, tag); for (const [a, v] of Object.entries(attrs)) el.setAttribute(a, v); icon.append(el); }
  const label = document.createElement('span'); label.textContent = 'Cut it down';
  btn.append(icon, label);
  btn.addEventListener('pointerenter', () => { btn.style.background = 'rgba(34,46,36,.96)'; });
  btn.addEventListener('pointerleave', () => { btn.style.background = 'rgba(15,19,16,.9)'; btn.style.transform = ''; });
  btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); btn.style.transform = 'scale(.96)'; });
  btn.addEventListener('pointerup', () => { btn.style.transform = ''; });
  btn.addEventListener('focus', () => { btn.style.boxShadow = '0 0 0 2px #7ed957, 0 4px 14px rgba(0,0,0,.35)'; });
  btn.addEventListener('blur', () => { btn.style.boxShadow = '0 4px 14px rgba(0,0,0,.35)'; });
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const r = btn.getBoundingClientRect(); cutDown(r.left + r.width / 2, r.top, true); });
  // after a cut: says how much faster it will come back
  const note = document.createElement('div');
  note.setAttribute('role', 'status');
  note.style.cssText = 'position:absolute;right:16px;bottom:16px;max-width:280px;padding:9px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(15,19,16,.92);color:#eef3ec;font:500 13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.35);opacity:0;transform:translateY(6px);transition:opacity .25s,transform .25s;pointer-events:none;';
  let noteTimer = 0;
  function showNote(text) {
    note.textContent = text; note.style.opacity = '1'; note.style.transform = 'none';
    clearTimeout(noteTimer); noteTimer = setTimeout(() => { note.style.opacity = '0'; note.style.transform = 'translateY(6px)'; }, 3200);
  }
  root.append(gc, fx, btn, note);
  document.documentElement.appendChild(host);
  const g = gc.getContext('2d'), fg = fx.getContext('2d');

  // ---- size, style and the vine network
  let W = 0, H = 0, aW = 0, aH = 0, k = 1, dark = false, net = null, bands = [];
  let style = DG.styleFor(settings.style), styleId = '', imgs = {};
  const seed = DG.hash(site);
  const dpr = () => window.devicePixelRatio || 1;
  function sizeCanvas() {
    k = style.k(dpr());
    gc.width = Math.max(1, Math.ceil(W * k)); gc.height = Math.max(1, Math.ceil(H * k));
    gc.style.width = `${W}px`; gc.style.height = `${H}px`;
    gc.style.imageRendering = style.pixelated ? 'pixelated' : 'auto';
    needDraw = true; drawCost = 0; firstDraw = true;
    sizeFx();
  }
  // creatures: pixel art at art resolution for the pixel styles, smooth at screen resolution for the rest
  let fxSmooth = false, fk = 1;
  function sizeFx() {
    fxSmooth = !style.pixelated; fk = fxSmooth ? Math.min(2, dpr()) * ART : 1;
    fx.width = Math.max(1, Math.ceil(aW * fk)); fx.height = Math.max(1, Math.ceil(aH * fk));
    fx.style.width = `${aW * ART}px`; fx.style.height = `${aH * ART}px`; fx.style.imageRendering = fxSmooth ? 'auto' : 'pixelated';
    fxClear = true;
  }
  function build() {
    W = document.documentElement.clientWidth || window.innerWidth; H = window.innerHeight;
    aW = Math.ceil(W / ART); aH = Math.ceil(H / ART);
    host.style.setProperty('width', `${W}px`, 'important'); host.style.setProperty('height', `${H}px`, 'important');
    sizeFx();
    try { bands = DG.detectMargins(new Set([host])).bands; } catch { bands = []; }
    dark = DG.isDarkPage();
    net = DG.buildOvergrowth({ W, H, bands, seed });
    flies.b = []; flies.d = []; flies.f = [];
    sizeCanvas();
  }
  // the sprite images; if a site's security policy blocks one, read it as a bitmap instead
  const loadImg = (path) => new Promise((res) => {
    let url; try { url = chrome.runtime.getURL(path); } catch { return res(null); }
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => fetch(url).then(r => r.blob()).then(createImageBitmap).then(res).catch(() => res(null));
    img.src = url;
  });
  async function setStyle(id) {
    if (id === styleId) return;
    styleId = id; style = DG.styleFor(id);
    for (const a of style.assets || []) if (!(a in imgs)) imgs[a] = await loadImg(a);
    if (styleId !== id) return;
    if (W) sizeCanvas();
  }

  // ---- drawing the garden: only when it changed, and no more often than it can afford
  let needDraw = true, lastDrawM = -1, lastDrawAt = 0, drawCost = 0, firstDraw = true, scene = null, cut = null;
  function renderGarden(force) {
    if (!net) return;
    const now = performance.now();
    if (!force && !needDraw && Math.abs(mv - lastDrawM) < 1e-4) return;
    if (!force && now - lastDrawAt < Math.min(500, Math.max(33, drawCost * 3))) return;
    scene = DG.sceneAt(net, mv);
    const t0 = performance.now();
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, gc.width, gc.height);
    try { DG.paintScene(g, scene, envNow(), style); } catch (e) { console.warn('[Doomscroll Garden]', e); }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.shadowColor = 'transparent'; g.filter = 'none'; g.globalCompositeOperation = 'source-over';
    // the first draw after a style or size change builds sprite caches, so it doesn't count
    const cost = performance.now() - t0; if (!firstDraw) drawCost = drawCost ? drawCost * 0.7 + cost * 0.3 : cost; firstDraw = false;
    lastDrawM = mv; lastDrawAt = now; needDraw = false;
  }
  const envNow = () => ({ W, H, k, theme: dark ? 'dark' : 'light', hue, imgs });

  // ---- cutting it down
  // the shears run along the top and the strands drop (see cut.js); with reduced motion it just fades
  function cutDown(ox, oy, mine) {
    if (cut) return;
    if (mv > 0.05 && !reduced.matches && net) {
      try { cut = DG.makeCut({ net, sc: DG.sceneAt(net, mv), style, env: envNow(), ox, oy }); } catch (e) { console.warn('[Doomscroll Garden]', e); cut = null; }
    }
    if (!cut && mv > 0.05) { gc.style.transition = 'opacity .4s'; gc.style.opacity = '0'; setTimeout(() => { gc.style.transition = ''; gc.style.opacity = '1'; needDraw = true; }, 450); }
    m = 0; mv = 0; canBurst = false; flies.b = []; flies.d = []; flies.f = [];
    if (mine) {
      const today = DG.dayKey();
      gd = { ...gd, m: 0, last: 0, reset: Date.now(), cuts: (gd.cutsDay === today ? gd.cuts || 0 : 0) + 1, cutsDay: today, cut: true };
      store({ [gardenKey]: gd });
      setTimeout(() => showNote(`Cut. It grows back ${DG.regrow(gd)}× faster now.`), reduced.matches ? 300 : 1400);
    }
    btn.style.display = 'none';
  }

  // ---- activity: tab visible + focused + touched in the last minute
  const touch = () => { lastInput = Date.now(); };
  for (const ev of ['wheel', 'keydown', 'pointerdown', 'pointermove', 'touchmove']) window.addEventListener(ev, touch, { passive: true, capture: true, ...on });
  // scrolling is what grows it: the page moved (any scroller on it), or a wheel or swipe
  const scrolled = () => {
    lastInput = lastScroll = Date.now();
    // the first scroll on a fresh garden sprouts a little at once, so you can see it start
    if (canBurst && !cut && !paused() && document.visibilityState === 'visible') { canBurst = false; m = Math.max(m, DG.FIRST_BURST); }
  };
  for (const ev of ['scroll', 'wheel', 'touchmove']) window.addEventListener(ev, scrolled, { passive: true, capture: true, ...on });
  const paused = () => DG.isPaused(settings, site);
  const active = () => document.visibilityState === 'visible' && document.hasFocus() && Date.now() - lastInput < DG.ACTIVE_WINDOW_MS && !paused() && !cut;

  function tick() {
    if (!alive()) return retire();
    const now = Date.now();
    if (DG.dayKey(now) !== day) { day = DG.dayKey(now); dayStats = {}; }
    if (active()) {
      dayStats[site] = (dayStats[site] || 0) + 1;
      if (++dirty >= 3) save();
    }
    const hide = paused() || !!document.fullscreenElement;
    host.style.setProperty('display', hide ? 'none' : 'block', 'important');
    btn.style.display = !hide && !cut && mv >= 1 ? 'flex' : 'none';
    const d = DG.isDarkPage(); if (d !== dark) { dark = d; needDraw = true; }
  }
  function save() {
    dirty = 0;
    gd = { ...gd, m, last: Date.now() }; delete gd.cut;
    store({ [gardenKey]: gd, [`day:${day}`]: dayStats, current: { site, at: Date.now() } });
  }

  // ---- creatures: butterflies visit open flowers; a dragonfly; fireflies on dark pages
  const flies = { b: [], d: [], f: [] };
  const whole = () => ({ x0: 0, x1: aW, side: 'left' });
  let habitat = whole();
  function syncCreatures() {
    if (habitat.x1 !== aW) { habitat = whole(); flies.b = []; flies.d = []; flies.f = []; }
    const wantB = mv < 12 ? 0 : Math.min(3, 1 + Math.floor((mv - 12) / 6)), wantD = mv < 18 ? 0 : 1, wantF = dark && mv >= 16 ? 14 : 0;
    while (flies.b.length < wantB) flies.b.push(DG.makeButterfly(habitat, aH, flies.b.length));
    while (flies.d.length < wantD) flies.d.push(DG.makeDragonfly(habitat, aH, flies.d.length));
    while (flies.f.length < wantF) flies.f.push(DG.makeFirefly(habitat, aH, flies.f.length));
    if (!wantB) flies.b = []; if (!wantD) flies.d = []; if (!wantF) flies.f = [];
  }
  let fxClear = true;
  const clearFx = () => { fg.setTransform(1, 0, 0, 1, 0, 0); fg.clearRect(0, 0, fx.width, fx.height); };
  function drawCreatures(dt, t) {
    if (reduced.matches || cut) { if (!fxClear) { clearFx(); fxClear = true; } return; }
    syncCreatures();
    if (!flies.b.length && !flies.d.length && !flies.f.length) { if (!fxClear) { clearFx(); fxClear = true; } return; }
    clearFx(); fxClear = false; fg.setTransform(fk, 0, 0, fk, 0, 0);
    const open = (scene ? scene.flowers : []).filter(f => f.o > 0.9).map(f => ({ x: f.cx / ART, y: f.cy / ART - 3, mg: habitat }));
    for (const b of flies.b) if (b.goal && b.goal.flower) { const same = open.find(f => Math.abs(f.x - b.goal.x) < 1 && Math.abs(f.y - b.goal.y) < 1); if (same) { same.taken = true; b.goal.flower = same; } }
    for (const b of flies.b) DG.updateButterfly(b, dt, t, aH, open);
    for (const d of flies.d) DG.updateDragonfly(d, dt, t, aH);
    for (const d of flies.d) (fxSmooth ? DG.drawDragonflySmooth : DG.drawDragonfly)(fg, d);
    for (const b of flies.b) (fxSmooth ? DG.drawButterflySmooth : DG.drawButterfly)(fg, b);
    fg.globalCompositeOperation = 'lighter'; for (const f of flies.f) (fxSmooth ? DG.drawFireflySmooth : DG.drawFirefly)(fg, f, t, aH); fg.globalCompositeOperation = 'source-over';
  }

  // ---- the frame loop: grow, draw, animate (~30 fps)
  let tPrev = performance.now(), frameAt = 0;
  function loop(now) {
    if (gone) return;
    requestAnimationFrame(loop);
    if (now - frameAt < 33) return;
    const dt = Math.min(0.25, (now - tPrev) / 1000); tPrev = now; frameAt = now;
    if (active()) {
      if (gd.last && Date.now() - gd.last > DG.AWAY_RESET_MS && m > 0) { m = 0; mv = 0; canBurst = true; needDraw = true; } // been away 10+ minutes: a fresh start
      m += DG.rate(settings, gd, Date.now() - lastScroll < DG.SCROLL_WINDOW_MS) * dt; gd.last = Date.now();
    }
    // the drawn garden catches up with the real one (straight away with reduced motion, or if it went back)
    mv = reduced.matches || m < mv ? m : mv + (m - mv) * (1 - Math.exp(-dt / DG.SHOW_LAG));
    if (m - mv < 1e-3) mv = m;
    if (document.visibilityState !== 'visible' || host.style.display === 'none') return;
    if (cut) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, gc.width, gc.height);
      if (!DG.drawCut(g, cut, now, !style.pixelated)) { cut = null; needDraw = true; }
    } else renderGarden(reduced.matches);
    drawCreatures(dt, now / 1000);
  }

  window.addEventListener('pointerdown', (e) => {
    const x = e.clientX / ART, y = e.clientY / ART, t = performance.now() / 1000;
    for (const b of flies.b) DG.startleButterfly(b, x, y, t, aH, []);
    for (const d of flies.d) DG.startleDragonfly(d, x, y, t);
  }, { passive: true, capture: true, ...on });

  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (W !== (document.documentElement.clientWidth || window.innerWidth) || H !== window.innerHeight) build(); else if (k !== style.k(dpr())) sizeCanvas(); }, 300); }, { passive: true, ...on });

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.settings) {
      settings = { ...DG.DEFAULT_SETTINGS, ...(ch.settings.newValue || {}) };
      setStyle(settings.style);
    }
    if (ch[gardenKey]) {
      const v = ch[gardenKey].newValue || { m: 0, last: 0, reset: Date.now() };
      if ((v.reset || 0) > (gd.reset || 0)) {
        // a cut or a jump from the popup
        if (v.cut) cutDown(W / 2, H * 0.55, false);
        gd = { ...v }; delete gd.cut; m = mv = v.m || 0; canBurst = !v.cut && m < DG.FIRST_BURST; needDraw = true; flies.b = []; flies.d = []; flies.f = [];
      } else if (!active()) { gd = { ...gd, ...v }; m = mv = v.m || 0; needDraw = true; }
    }
    if (ch[`day:${day}`] && !active()) dayStats = ch[`day:${day}`].newValue || {};
  });

  // ---- start
  chrome.storage.local.get(['settings', gardenKey, `day:${day}`]).then(async (s) => {
    settings = { ...DG.DEFAULT_SETTINGS, ...(s.settings || {}) };
    gd = { ...gd, ...(s[gardenKey] || {}) }; delete gd.cut;
    m = gd.m || 0;
    if (gd.last && Date.now() - gd.last > DG.AWAY_RESET_MS) m = 0;
    mv = m; canBurst = m < DG.FIRST_BURST;
    dayStats = s[`day:${day}`] || {};
    await setStyle(settings.style);
    build();
    // the feed may still be laying out: look at the margins again shortly, while the garden is young
    setTimeout(() => { if (m < 8 && !gone) build(); }, 3500);
    tickTimer = setInterval(tick, 1000);
    requestAnimationFrame(loop);
  });
})();
