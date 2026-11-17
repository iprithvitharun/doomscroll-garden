// Toolbar popup: this page in miniature with its vines, cut them down, how long until a feed is overgrown,
// today's time per site, and pause. The developer drawer (click the version number) holds demo speed,
// the art style and a growth jump for recording.
(async () => {
  const DG = globalThis.DG;
  const $ = (id) => document.getElementById(id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const darkMq = matchMedia('(prefers-color-scheme: dark)');
  const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dur = (sec) => {
    sec = Math.round(sec);
    if (sec < 60) return `${sec} sec`;
    if (sec < 3600) return `${Math.round(sec / 60)} min`;
    const h = Math.floor(sec / 3600), mn = Math.round((sec % 3600) / 60);
    return mn ? `${h}h ${String(mn).padStart(2, '0')}m` : `${h} hr`;
  };
  const PREVIEW_M = 16;            // off a feed, the miniature shows what a feed looks like halfway in
  const PW = 1440, PH = 720;       // the page the miniature stands for: a laptop window under the browser bar
  const BANDS = [{ x0: 0, x1: 420 }, { x0: 1020, x1: PW }];   // the empty margins either side of its feed

  // ---- which site this tab is on
  let site = null, host = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) { const u = new URL(tab.url); host = u.hostname.replace(/^www\./, ''); site = DG.siteFor(u.hostname); }
  } catch { /* no tab access: show the general view */ }
  const siteName = site ? DG.SITES[site].name : '';

  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  for (const p of DG.PACES) {
    const label = document.createElement('label');
    const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'pace', value: String(p.min) });
    const face = document.createElement('span'), name = document.createElement('b'), time = document.createElement('small');
    name.textContent = p.name; time.textContent = p.label; face.append(name, time);
    label.append(input, face); $('pace').append(label);
  }
  for (const s of DG.STYLES) $('style').append(new Option(s.name, s.id));

  // ---- the miniature: the extension's own growth and renderer, on a mock feed
  const canvas = $('garden'), g = canvas.getContext('2d');
  const net = DG.buildOvergrowth({ W: PW, H: PH, bands: BANDS, seed: DG.hash(site || 'preview') });
  const hue = site ? DG.SITES[site].hue : 0;
  let style = null, styleId = '', imgs = {}, drawn = { m: -1, key: '' }, animating = false;
  const loadImg = (path) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = chrome.runtime.getURL(path); });
  function sizeCanvas() {
    const r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * d)); canvas.height = Math.max(1, Math.round(r.height * d));
    drawn.key = '';
  }
  async function useStyle(id) {
    if (id === styleId) return;
    styleId = id; style = DG.styleFor(id);
    await Promise.all((style.assets || []).filter((a) => !(a in imgs)).map(async (a) => { imgs[a] = await loadImg(a); }));
    canvas.style.imageRendering = style.pixelated ? 'pixelated' : 'auto';
    drawn.key = '';
  }
  function paint(mm) {
    if (!style) return;
    const key = `${styleId}|${darkMq.matches}|${canvas.width}`;
    if (Math.abs(mm - drawn.m) < 0.01 && key === drawn.key) return;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
    if (mm > 0) {
      try { DG.paintScene(g, DG.sceneAt(net, mm), { W: PW, H: PH, k: canvas.width / PW, theme: darkMq.matches ? 'dark' : 'light', hue, imgs }, style); }
      catch (e) { console.warn('[Doomscroll Garden]', e); }
    }
    drawn = { m: mm, key };
  }
  // on opening, the vines climb into place from the corners
  function growIn(target) {
    if (reduced.matches || target <= 0) { paint(target); return; }
    animating = true;
    const t0 = performance.now() + 120, ms = 1000;
    const step = (now) => {
      const u = Math.max(0, Math.min(1, (now - t0) / ms)), e = 1 - Math.pow(1 - u, 4);
      paint(target * e);
      if (u < 1 && animating) requestAnimationFrame(step); else { animating = false; paint(m); }
    };
    requestAnimationFrame(step);
  }

  // ---- state
  let settings = { ...DG.DEFAULT_SETTINGS }, gd = {}, today = {}, m = 0, dragging = false, todaySig = '';
  async function load() {
    const day = DG.dayKey(), keys = ['settings', `day:${day}`];
    if (site) keys.push(`garden:${site}`);
    const s = await chrome.storage.local.get(keys);
    settings = { ...DG.DEFAULT_SETTINGS, ...(s.settings || {}) };
    today = s[`day:${day}`] || {};
    gd = site ? s[`garden:${site}`] || {} : {};
    const away = gd.last && Date.now() - gd.last > DG.AWAY_RESET_MS;
    if (!dragging) m = site ? (away ? 0 : gd.m || 0) : PREVIEW_M;
  }
  const save = async (patch) => { settings = { ...settings, ...patch }; await chrome.storage.local.set({ settings }); render(); };

  function render() {
    const day = DG.dayKey(), now = Date.now();
    const pausedAll = settings.pausedUntil > now, pausedHere = !!site && (settings.pausedSites || {})[site] === day;
    const paused = pausedAll || pausedHere, pct = Math.round(DG.coverAt(m) * 100);

    // pause chip and menu
    $('pause').classList.toggle('on', paused);
    $('pause-label').textContent = paused ? 'Resume' : 'Pause';
    $('pause-icon').innerHTML = paused ? '<path d="M5.5 3.8v8.4l6.5-4.2z"/>' : '<path d="M5.5 3.5v9M10.5 3.5v9"/>';
    $('pause').setAttribute('aria-haspopup', paused ? 'false' : 'menu');
    $('pause-hour-until').textContent = `Until ${clock(now + 3600 * 1000)}`;
    $('pause-site').disabled = !site;
    $('pause-site-label').textContent = site ? `On ${siteName} today` : 'On this site today';

    // the miniature
    $('win-host').textContent = site ? host : 'preview';
    $('page').classList.toggle('paused', paused);
    $('paused-tag').hidden = !paused;
    $('paused-tag').textContent = pausedAll ? `Paused until ${clock(settings.pausedUntil)}` : `Paused on ${siteName} today`;
    $('window-caption').textContent = site ? `${host} in miniature, ${pct}% covered by vines.` : 'A feed in miniature, halfway to overgrown.';

    // status, cut and the line under it
    const cuts = gd.cutsDay === day ? gd.cuts || 0 : 0;
    $('cut').hidden = !site;
    if (site) {
      const meta = $('site'); meta.textContent = '';
      const b = document.createElement('b'); b.textContent = siteName;
      meta.append(b, ` · ${dur(today[site] || 0)} today`);
      $('cover').textContent = m > 0 ? `${pct}% covered` : '';
      $('stage').textContent = m > 0 ? DG.stageName(m) : 'Nothing growing yet';
      $('cut').disabled = m < 0.05;
      $('cut-label').textContent = m < 0.05 ? 'Nothing to cut yet' : 'Cut it all down';
      const note = cuts ? `Cut ${cuts === 1 ? 'once' : `${cuts} times`} today, so it grows back ${DG.regrow(gd, day)}× faster.`
        : m <= 0 ? 'Scroll and it starts in the corners.' : '';
      $('note').hidden = !note; $('note').textContent = note;
    } else {
      $('site').textContent = 'This tab isn’t a feed';
      $('cover').textContent = '';
      $('stage').textContent = 'Open a feed and start scrolling';
      $('note').hidden = false;
      $('note').textContent = 'Vines grow on X, Instagram, Reddit, LinkedIn, YouTube, Bluesky and Facebook.';
    }

    // pace
    const pace = DG.paceMinutes(settings);
    for (const r of document.querySelectorAll('input[name="pace"]')) r.checked = Number(r.value) === pace;

    // today: rebuilt only when the numbers change, so the bars grow in once
    const rows = Object.entries(today).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const sig = JSON.stringify([site, rows.slice(0, 3)]);
    if (sig !== todaySig) {
      const list = $('today'); list.textContent = ''; list.classList.toggle('settled', todaySig !== '');
      todaySig = sig;
      if (!rows.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'No scrolling yet today.'; list.append(li); }
      const top = rows.length ? rows[0][1] : 1;
      for (const [k, v] of rows.slice(0, 3)) {
        const li = document.createElement('li'); if (k === site) li.className = 'now';
        const name = document.createElement('span'); name.textContent = DG.SITES[k] ? DG.SITES[k].name : k;
        const track = document.createElement('span'); track.className = 'track';
        const fill = document.createElement('i'); fill.style.setProperty('--w', `${Math.max(4, v / top * 100)}%`); track.append(fill);
        const time = document.createElement('span'); time.textContent = dur(v);
        li.append(name, track, time); list.append(li);
      }
    }

    // developer drawer
    $('dev').hidden = !settings.dev;
    $('version').setAttribute('aria-expanded', String(!!settings.dev));
    $('test').checked = !!settings.testSpeed;
    const p = DG.PACES.find((x) => x.min === pace);
    $('test-hint').textContent = settings.testSpeed ? `${DG.DEMO_SPEEDUP}× faster, so ${p.name} takes ${dur(DG.fullSeconds(settings))}` : `Off: ${p.name} takes ${p.label}`;
    if (document.activeElement !== $('style')) $('style').value = settings.style;
    $('jump-row').hidden = !site;
    if (!dragging) $('jump').value = Math.min(34, m);
    $('jump-val').textContent = `${pct}% covered`;
  }

  // ---- first paint (the miniature's art loads at the end, so the controls work straight away)
  await load();
  render();

  // ---- pause: a small menu, or resume when paused
  const menu = $('pause-menu');
  let menuWasOpen = false;
  $('pause').addEventListener('pointerdown', () => { menuWasOpen = menu.matches(':popover-open'); });
  $('pause').addEventListener('click', () => {
    const day = DG.dayKey();
    if (settings.pausedUntil > Date.now() || (site && (settings.pausedSites || {})[site] === day)) {
      const ps = { ...(settings.pausedSites || {}) }; if (site) delete ps[site];
      save({ pausedUntil: 0, pausedSites: ps });
      return;
    }
    if (menuWasOpen) { menuWasOpen = false; return; }   // the outside click already closed it
    menu.togglePopover();
  });
  menu.addEventListener('beforetoggle', (e) => {
    if (e.newState !== 'open') return;
    const r = $('pause').getBoundingClientRect();
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.right = `${document.documentElement.clientWidth - r.right}px`;
  });
  menu.addEventListener('toggle', (e) => {
    const open = e.newState === 'open';
    $('pause').setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('button:not(:disabled)').focus(); else if (menu.contains(document.activeElement) || document.activeElement === document.body) $('pause').focus();
  });
  menu.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...menu.querySelectorAll('button:not(:disabled)')], i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
  });
  $('pause-hour').addEventListener('click', () => { menu.hidePopover(); save({ pausedUntil: Date.now() + 3600 * 1000 }); });
  $('pause-site').addEventListener('click', () => {
    menu.hidePopover();
    save({ pausedSites: { ...(settings.pausedSites || {}), [site]: DG.dayKey() } });
  });

  // ---- cut: the vines drop out of the miniature, and the page's own shears run
  $('cut').addEventListener('click', async () => {
    const day = DG.dayKey();
    animating = false;
    gd = { ...gd, m: 0, last: 0, reset: Date.now(), cuts: (gd.cutsDay === day ? gd.cuts || 0 : 0) + 1, cutsDay: day, cut: true };
    await chrome.storage.local.set({ [`garden:${site}`]: gd });
    if (!reduced.matches) { canvas.classList.add('falling'); await new Promise((r) => setTimeout(r, 460)); }
    m = 0; paint(0); canvas.classList.remove('falling'); render();
  });

  $('pace').addEventListener('change', (e) => save({ pace: Number(e.target.value) }));

  // ---- developer drawer
  $('version').addEventListener('click', async () => {
    await save({ dev: !settings.dev });
    if (settings.dev) $('dev').scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
  });
  $('test').addEventListener('change', (e) => save({ testSpeed: e.target.checked }));
  $('style').addEventListener('change', async (e) => { await save({ style: e.target.value }); await useStyle(settings.style); paint(m); });
  // jumping sets the garden straight to that point, for trying styles and lining up shots without waiting
  let jumpTimer = 0;
  const jump = () => chrome.storage.local.set({ [`garden:${site}`]: { ...gd, m: Number($('jump').value), last: Date.now(), reset: Date.now() } });
  $('jump').addEventListener('input', () => {
    dragging = true; animating = false; m = Number($('jump').value);
    paint(m); render();
    clearTimeout(jumpTimer); jumpTimer = setTimeout(jump, 60);
  });
  $('jump').addEventListener('change', async () => { clearTimeout(jumpTimer); await jump(); dragging = false; });

  darkMq.addEventListener('change', () => { drawn.key = ''; paint(m); });
  setInterval(async () => { await load(); render(); if (!animating && !dragging) paint(m); }, 1000);

  await new Promise(requestAnimationFrame);
  sizeCanvas();
  await useStyle(settings.style);
  growIn(m);
})();
