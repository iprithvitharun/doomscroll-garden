// Shared helpers, constants and storage for Doomscroll Garden. Content scripts share one global: DG.
globalThis.DG = globalThis.DG || {};
(() => {
  const DG = globalThis.DG;

  DG.ART = 2;                          // CSS px per art pixel (pixel styles and the creatures)
  DG.FULL_MINUTES = 30;                // garden minutes until the page is overgrown (the growth scale; the pace sets how fast)
  // How long until a feed is overgrown, picked in the popup (real minutes of scrolling).
  DG.PACES = [{ min: 60, name: 'Gentle', label: '1 hour' }, { min: 30, name: 'Standard', label: '30 min' }, { min: 10, name: 'Touch grass', label: '10 min' }];
  DG.DEMO_SPEEDUP = 30;                // demo speed: everything 30x faster, so Standard is overgrown after 1 minute
  DG.ACTIVE_WINDOW_MS = 60 * 1000;     // counts as active if you touched the page in the last minute
  DG.AWAY_RESET_MS = 10 * 60 * 1000;   // 10 minutes away from a site clears its garden
  DG.REGROW_PER_CUT = 0.5;             // each cut today makes the vines grow back 50% faster...
  DG.REGROW_MAX = 3;                   // ...up to 3x
  DG.SCROLL_BOOST = 1.6;               // the vines grow 1.6x the base rate while you scroll...
  DG.STILL_RATE = 0.3;                 // ...and only 0.3x while you read, watch or type, so each flick is a push of growth
  DG.SCROLL_WINDOW_MS = 700;           // counts as scrolling until 0.7 s after the page last moved
  DG.FIRST_BURST = 2;                  // the first scroll on a fresh garden brings it to at least 2 garden minutes at once
  DG.SHOW_LAG = 0.35;                  // s: the drawn garden eases toward the real one, so growth comes in pushes, not steps

  DG.SITES = {
    x: { name: 'X', hosts: ['x.com', 'twitter.com'], hue: 20 },
    instagram: { name: 'Instagram', hosts: ['instagram.com'], hue: 75 },
    reddit: { name: 'Reddit', hosts: ['reddit.com'], hue: 160 },
    linkedin: { name: 'LinkedIn', hosts: ['linkedin.com'], hue: -18 },
    youtube: { name: 'YouTube', hosts: ['youtube.com'], hue: 125 },
    bluesky: { name: 'Bluesky', hosts: ['bsky.app'], hue: 0 },
    facebook: { name: 'Facebook', hosts: ['facebook.com'], hue: -8 },
  };
  DG.siteFor = (hostname) => {
    const h = hostname.replace(/^www\./, '').replace(/^m\./, '');
    for (const [key, s] of Object.entries(DG.SITES)) if (s.hosts.some(x => h === x || h.endsWith('.' + x))) return key;
    return null;
  };

  // The art styles from the exploration rounds, in the order the popup lists them.
  DG.STYLES = [
    { id: 'vines', name: 'Pixel vines', from: 'Round 6' },
    { id: 'photo', name: 'Photoreal', from: 'Round 4' },
    { id: 'pixel', name: 'Chunky pixel', from: 'Round 1 · A' },
    { id: 'dither', name: '1-bit dither', from: 'Round 1 · B' },
    { id: 'ascii', name: 'ASCII', from: 'Round 1 · C' },
    { id: 'stitch', name: 'Cross-stitch', from: 'Round 1 · D' },
    { id: 'ink', name: 'Ink line', from: 'Round 1 · E' },
    { id: 'water', name: 'Watercolour', from: 'Round 1 · F' },
    { id: 'paper', name: 'Paper cut-out', from: 'Round 1 · G' },
    { id: 'illus', name: 'Illustrated', from: 'Round 2' },
  ];

  // The day turns over at 4 am, so a late-night scroll still counts as tonight.
  DG.dayKey = (t = Date.now()) => { const d = new Date(t - 4 * 3600 * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // How much faster the vines come back after being cut today.
  DG.regrow = (garden, day = DG.dayKey()) => {
    const cuts = garden && garden.cutsDay === day ? garden.cuts || 0 : 0;
    return Math.min(DG.REGROW_MAX, 1 + DG.REGROW_PER_CUT * cuts);
  };
  // Garden minutes gained per real second on the page: mostly while scrolling. With the usual mix of flicking and
  // reading (about 45% of the time scrolling) that averages out near the base rate.
  DG.paceMinutes = (settings) => { const p = settings && Number(settings.pace); return DG.PACES.some(x => x.min === p) ? p : 30; };
  DG.fullSeconds = (settings) => DG.paceMinutes(settings) * 60 / (settings && settings.testSpeed ? DG.DEMO_SPEEDUP : 1);
  DG.rate = (settings, garden, scrolling = true) => DG.FULL_MINUTES / DG.fullSeconds(settings) * DG.regrow(garden) * (scrolling ? DG.SCROLL_BOOST : DG.STILL_RATE);

  // Roughly how much of the window is covered after m garden minutes (measured on a 1440x900 feed): the corners and
  // edges first, then a band along the top, then the curtain over the feed. It veils about half the page, not all of it.
  DG.COVER = [[0, 0], [2, 0.014], [4, 0.044], [8, 0.09], [12, 0.13], [16, 0.22], [20, 0.33], [26, 0.47], [30, 0.52]];
  DG.coverAt = (m) => { const C = DG.COVER; if (m <= 0) return 0; for (let i = 1; i < C.length; i++) if (m <= C[i][0]) { const [a, ca] = C[i - 1], [b, cb] = C[i]; return ca + (cb - ca) * (m - a) / (b - a); } return C[C.length - 1][1]; };
  DG.minuteFor = (c) => { const C = DG.COVER; for (let i = 1; i < C.length; i++) if (c <= C[i][1]) { const [a, ca] = C[i - 1], [b, cb] = C[i]; return a + (b - a) * (c - ca) / Math.max(1e-9, cb - ca); } return 30; };
  DG.stageName = (m) => m <= 0 ? 'Bare' : m < 4 ? 'Sprouting' : m < 9 ? 'Climbing the edges' : m < 15 ? 'Spilling over the top' : m < 24 ? 'The curtain is coming down' : 'Overgrown';

  // testSpeed is demo speed: everything 30x faster (turned on in the popup's developer drawer)
  DG.DEFAULT_SETTINGS = { testSpeed: false, pace: 30, style: 'photo', pausedUntil: 0, pausedSites: {}, dev: false };
  DG.isPaused = (settings, site, now = Date.now()) => !!settings && (settings.pausedUntil > now || (settings.pausedSites || {})[site] === DG.dayKey(now));

  DG.clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  DG.lerp = (a, b, t) => a + (b - a) * t;
  DG.ease = (t) => 1 - Math.pow(1 - DG.clamp(t), 3);
  DG.easeBack = (t) => { t = DG.clamp(t); const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  DG.rng = (seed) => { let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  DG.hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
  DG.rand = (a, b) => a + Math.random() * (b - a);
  DG.TAU = Math.PI * 2;
})();
