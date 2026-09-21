/*!
 * zami-share.js — promotional poster generator for the Share button.
 *
 * Classic script (no imports) so it works from file://, https:// and Android WebView.
 * Exposes window.ZamiShare:
 *   ZamiShare.config                  -> set baseUrl (your public https domain) once
 *   ZamiShare.songFromItem(row, opts) -> maps a tracks/beats row to a "song" object
 *   ZamiShare.open(song)              -> opens the preview modal (generates on demand)
 *   ZamiShare.generate(song)          -> { blob, file, warnings }  (no UI)
 *
 * Song object (nothing is hard-coded):
 *   { id, type:'track'|'beat', title, artist, genre, kind, isFree, price, plays, buys,
 *     downloads, artwork, url, peaks? }
 */
(function (global) {
  'use strict';

  // ───────────────────────── config ─────────────────────────
  const config = {
    baseUrl: '',                       // e.g. 'https://zami.example.com'  (REQUIRED for real links)
    detailPath: 'detail.html',
    tagline: 'MUSIC • VIBES • LIFESTYLE',
    slogan: 'WHERE ZAMBIA SOUNDS',
    cacheTtlMs: 5 * 60 * 1000,
    cacheMax: 3,
    imageTimeoutMs: 12000,
  };

  const W = 1080, H = 1350;
  const FONT = '"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
  const BRAND_BLUE = [216, 0.83, 0.52];
  const BRAND_GREEN = [84, 0.72, 0.45];
  const ART = 620, ART_X = (W - ART) / 2, ART_Y = 140, TEXT_W = 900;

  // ───────────────────────── small utils ─────────────────────────
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const str = (v) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const k = Math.floor(h / 60);
    const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
    return [(t[0] + m) * 255, (t[1] + m) * 255, (t[2] + m) * 255];
  }

  const css = (c, a = 1) => `hsla(${Math.round(c[0])},${Math.round(c[1] * 100)}%,${Math.round(c[2] * 100)}%,${a})`;

  function luminance(c) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const [r, g, b] = hslToRgb(c[0], c[1], c[2]);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }

  // Text colour that stays readable on a fill made from these HSL colours.
  const readableOn = (...cols) =>
    cols.reduce((s, c) => s + luminance(c), 0) / cols.length > 0.3 ? '#0b0d12' : '#ffffff';

  // ───────────────────────── canvas helpers ─────────────────────────
  function createCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    return { canvas, ctx: canvas.getContext('2d') };
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function makeGradient(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }

  function drawGradient(ctx, x, y, w, h, stops, dir = 'v') {
    ctx.fillStyle = dir === 'v' ? makeGradient(ctx, x, y, x, y + h, stops) : makeGradient(ctx, x, y, x + w, y, stops);
    ctx.fillRect(x, y, w, h);
  }

  function measureTracked(ctx, text, tracking) {
    if (!tracking) return ctx.measureText(text).width;
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + tracking;
    return Math.max(0, w - tracking);
  }

  // Manual letter-spacing (ctx.letterSpacing is missing in older WebViews).
  function drawText(ctx, text, x, y, o = {}) {
    const { size = 32, weight = 600, color = '#fff', align = 'left', tracking = 0, alpha = 1 } = o;
    ctx.save();
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    const w = measureTracked(ctx, text, tracking);
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    if (!tracking) ctx.fillText(text, cx, y);
    else for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + tracking; }
    ctx.restore();
    return w;
  }

  function ellipsize(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  }

  function wrap(ctx, text, maxW) {
    const lines = []; let line = '';
    for (const word of text.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width <= maxW) { line = test; continue; }
      if (line) lines.push(line);
      line = '';
      let chunk = word;
      while (ctx.measureText(chunk).width > maxW && chunk.length > 1) {   // very long single word
        let i = chunk.length;
        while (i > 1 && ctx.measureText(chunk.slice(0, i)).width > maxW) i--;
        lines.push(chunk.slice(0, i)); chunk = chunk.slice(i);
      }
      line = chunk;
    }
    if (line) lines.push(line);
    return lines;
  }

  function fitTitle(ctx, text) {
    for (let s = 76; s >= 52; s -= 2) {
      ctx.font = `800 ${s}px ${FONT}`;
      if (ctx.measureText(text).width <= TEXT_W) return { lines: [text], size: s };
    }
    for (let s = 58; s >= 42; s -= 2) {
      ctx.font = `800 ${s}px ${FONT}`;
      const lines = wrap(ctx, text, TEXT_W);
      if (lines.length <= 2) return { lines, size: s };
    }
    ctx.font = `800 42px ${FONT}`;
    const all = wrap(ctx, text, TEXT_W);
    return { lines: [all[0], ellipsize(ctx, all.slice(1).join(' '), TEXT_W)], size: 42 };
  }

  function drawCoverImage(ctx, img, x, y, w, h) {       // object-fit: cover, centred
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const scale = Math.max(w / iw, h / ih);
    const sw = w / scale, sh = h / scale;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  }

  // ───────────────────────── image loading (CORS-safe) ─────────────────────────
  async function fetchBlob(url, extra) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), config.imageTimeoutMs);
    try {
      const res = await fetch(url, Object.assign({ mode: 'cors', signal: ctl && ctl.signal }, extra));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.blob();
    } finally { clearTimeout(timer); }
  }

  function decodeBlob(blob) {
    return new Promise((resolve, reject) => {
      const u = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(u); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(u); reject(new Error('Image decode failed')); };
      img.src = u;
    });
  }

  // fetch() -> blob -> blob: URL image. The blob image is same-origin, so the canvas can never
  // be tainted. If the server sends no CORS headers, fetch() fails loudly and we report it.
  async function loadImage(url) {
    if (!url) throw new Error('No artwork URL');
    let blob;
    try { blob = await fetchBlob(url); }
    catch (e) { blob = await fetchBlob(url, { cache: 'reload' }); }   // skip a cached non-CORS copy
    return decodeBlob(blob);
  }

  // ───────────────────────── colour system ─────────────────────────
  function brandPalette() {
    return {
      dominant: BRAND_BLUE, secondary: BRAND_GREEN, accent: [84, 0.75, 0.62],
      bg: [216, 0.5, 0.06], bg2: [216, 0.55, 0.14], fromArt: false,
    };
  }

  function extractPalette(img) {
    const S = 48;
    const { ctx } = createCanvas(S, S);
    ctx.drawImage(img, 0, 0, S, S);
    const d = ctx.getImageData(0, 0, S, S).data;
    const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
    let total = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
      const w = s * (1 - Math.abs(2 * l - 1));            // favour vivid, mid-lightness pixels
      if (w < 0.04) continue;
      const b = bins[Math.floor(h / 30) % 12];
      b.w += w; b.r += d[i] * w; b.g += d[i + 1] * w; b.b += d[i + 2] * w; total += w;
    }
    if (total / (S * S) < 0.03) return brandPalette();    // greyscale artwork -> brand colours
    const toHsl = (b) => rgbToHsl(b.r / b.w, b.g / b.w, b.b / b.w);
    const sorted = bins.filter((b) => b.w > 0).sort((a, b) => b.w - a.w);
    const dom = toHsl(sorted[0]);
    const hueDist = (a, b) => { const x = Math.abs(a - b) % 360; return x > 180 ? 360 - x : x; };
    const other = sorted.slice(1).find((b) => b.w >= sorted[0].w * 0.25 && hueDist(toHsl(b)[0], dom[0]) >= 35);
    const sec = other ? toHsl(other) : [(dom[0] + 35) % 360, dom[1], dom[2]];
    const dominant = [dom[0], clamp(dom[1], 0.55, 0.95), clamp(dom[2], 0.45, 0.6)];
    const secondary = [sec[0], clamp(sec[1], 0.55, 0.95), clamp(sec[2], 0.45, 0.6)];
    return {
      dominant, secondary,
      accent: [secondary[0], 0.9, 0.68],
      bg: [dominant[0], Math.min(0.5, dominant[1]), 0.055],
      bg2: [dominant[0], 0.55, 0.13],
      fromArt: true,
    };
  }

  // ───────────────────────── waveform (decorative, deterministic) ─────────────────────────
  function hashSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makePeaks(song, n) {
    if (Array.isArray(song.peaks) && song.peaks.length > 1) {          // real data wins
      const src = song.peaks.map((v) => Math.abs(num(v))), max = Math.max(...src) || 1, out = [];
      for (let i = 0; i < n; i++) {
        const a = Math.floor((i / n) * src.length), b = Math.max(a + 1, Math.floor(((i + 1) / n) * src.length));
        out.push(clamp(Math.max(...src.slice(a, b)) / max, 0.1, 1));
      }
      return out;
    }
    const rnd = mulberry32(hashSeed(`${song.id || ''}|${song.title}|${song.artist}`));
    const p1 = rnd() * 6.28, p2 = rnd() * 6.28, f1 = 2 + rnd() * 2, f2 = 5 + rnd() * 3;
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      const env = 0.55 + 0.25 * Math.sin(t * f1 * Math.PI + p1) + 0.15 * Math.sin(t * f2 * Math.PI + p2);
      const taper = 0.4 + 0.6 * Math.pow(Math.sin(Math.PI * t), 0.6);
      return clamp(env * (0.7 + 0.3 * rnd()) * taper, 0.12, 1);
    });
  }

  function drawWaveform(ctx, x, cy, w, maxH, peaks, p, progress = 0.38) {
    const barW = 8, gap = 6, n = peaks.length;
    const total = n * (barW + gap) - gap, x0 = x + (w - total) / 2;
    const played = makeGradient(ctx, x0, 0, x0 + total, 0, [[0, css(p.dominant)], [1, css(p.accent)]]);
    peaks.forEach((v, i) => {
      const h = Math.max(8, v * maxH);
      ctx.fillStyle = i / n <= progress ? played : 'rgba(255,255,255,0.22)';
      drawRoundedRect(ctx, x0 + i * (barW + gap), cy - h / 2, barW, h, 4);
      ctx.fill();
    });
  }

  function drawPlayIcon(ctx, cx, cy, r, p) {
    ctx.save();
    ctx.shadowColor = css(p.dominant, 0.6); ctx.shadowBlur = 24;
    ctx.fillStyle = makeGradient(ctx, cx - r, cy - r, cx + r, cy + r, [[0, css(p.dominant)], [1, css(p.secondary)]]);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = readableOn(p.dominant, p.secondary);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.24, cy - r * 0.38);
    ctx.lineTo(cx + r * 0.42, cy);
    ctx.lineTo(cx - r * 0.24, cy + r * 0.38);
    ctx.closePath(); ctx.fill();
  }

  // ───────────────────────── poster sections ─────────────────────────
  function softScale(src, w, h) {                        // cheap blur: repeated up-scaling with smoothing
    let cur = src;
    const sizes = [[Math.round(w / 6), Math.round(h / 6)], [w, h]];
    sizes.forEach(([sw, sh]) => {
      const { canvas, ctx } = createCanvas(sw, sh);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(cur, 0, 0, sw, sh);
      cur = canvas;
    });
    return cur;
  }

  function drawBackground(ctx, img, p) {
    drawGradient(ctx, 0, 0, W, H, [[0, css(p.bg2)], [1, css(p.bg)]]);
    if (img) {
      const { canvas, ctx: t } = createCanvas(20, 25);
      t.imageSmoothingQuality = 'high';
      drawCoverImage(t, img, 0, 0, 20, 25);
      ctx.save(); ctx.globalAlpha = 0.45;
      ctx.drawImage(softScale(canvas, 216, 270), 0, 0, W, H);
      ctx.restore();
    }
    drawGradient(ctx, 0, 0, W, H, [[0, 'rgba(0,0,0,0.35)'], [0.5, 'rgba(0,0,0,0.30)'], [1, css(p.bg, 0.92)]]);
    let g = ctx.createRadialGradient(W / 2, 450, 60, W / 2, 450, 640);
    g.addColorStop(0, css(p.dominant, 0.38)); g.addColorStop(1, css(p.dominant, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(W, H, 40, W, H, 620);
    g.addColorStop(0, css(p.secondary, 0.28)); g.addColorStop(1, css(p.secondary, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function drawBranding(ctx) {
    const heights = [22, 40, 54, 34], cols = [BRAND_BLUE, BRAND_GREEN, BRAND_BLUE, BRAND_GREEN], base = 104;
    heights.forEach((h, i) => {
      ctx.fillStyle = css(cols[i]);
      drawRoundedRect(ctx, 90 + i * 17, base - h, 10, h, 5); ctx.fill();
    });
    drawText(ctx, 'ZAMI', 170, base, { size: 44, weight: 900, tracking: 6 });
    drawText(ctx, config.tagline, W - 90, base - 4, { size: 20, weight: 600, tracking: 3, alpha: 0.55, align: 'right' });
  }

  function drawFallbackArt(ctx, x, y, s, p) {
    ctx.fillStyle = makeGradient(ctx, x, y, x + s, y + s, [[0, css(p.dominant)], [1, css(p.secondary)]]);
    ctx.fillRect(x, y, s, s);
    const cx = x + s / 2, cy = y + s / 2;                  // simple eighth-note glyph
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.ellipse(cx - 40, cy + 90, 56, 42, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(cx + 4, cy - 150, 20, 235);
    ctx.lineWidth = 20; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + 14, cy - 145); ctx.quadraticCurveTo(cx + 110, cy - 110, cx + 90, cy - 20); ctx.stroke();
  }

  function drawArtwork(ctx, img, x, y, s, r, p) {
    ctx.save();                                            // glow + shadow
    ctx.shadowColor = css(p.dominant, 0.65); ctx.shadowBlur = 90; ctx.shadowOffsetY = 30;
    ctx.fillStyle = '#000'; drawRoundedRect(ctx, x, y, s, s, r); ctx.fill();
    ctx.restore();
    ctx.save();
    drawRoundedRect(ctx, x, y, s, s, r); ctx.clip();
    if (img) drawCoverImage(ctx, img, x, y, s, s); else drawFallbackArt(ctx, x, y, s, p);
    ctx.restore();
    ctx.lineWidth = 4;
    ctx.strokeStyle = makeGradient(ctx, x, y, x + s, y + s, [[0, css(p.dominant, 0.95)], [1, css(p.secondary, 0.95)]]);
    drawRoundedRect(ctx, x, y, s, s, r); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    drawRoundedRect(ctx, x + 4, y + 4, s - 8, s - 8, r - 4); ctx.stroke();
  }

  function drawCTA(ctx, x, y, w, h, label, p) {
    ctx.save();
    ctx.shadowColor = css(p.dominant, 0.55); ctx.shadowBlur = 40; ctx.shadowOffsetY = 10;
    ctx.fillStyle = makeGradient(ctx, x, y, x + w, y, [[0, css(p.dominant)], [1, css(p.secondary)]]);
    drawRoundedRect(ctx, x, y, w, h, h / 2); ctx.fill();
    ctx.restore();
    const fg = readableOn(p.dominant, p.secondary);
    ctx.font = `800 34px ${FONT}`;
    const tw = measureTracked(ctx, label, 3), iconW = 30, gap = 18, start = x + (w - (iconW + gap + tw)) / 2;
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(start, y + h / 2 - 18); ctx.lineTo(start + iconW, y + h / 2); ctx.lineTo(start, y + h / 2 + 18);
    ctx.closePath(); ctx.fill();
    drawText(ctx, label, start + iconW + gap, y + h / 2 + 12, { size: 34, weight: 800, color: fg, tracking: 3 });
  }

  // ───────────────────────── poster composition ─────────────────────────
  function statsText(s) {
    const parts = [];
    if (s.plays > 0) parts.push(`${s.plays} ${s.plays === 1 ? 'play' : 'plays'}`);
    if (s.buys > 0) parts.push(`${s.buys} ${s.buys === 1 ? 'buy' : 'buys'}`);
    if (s.downloads > 0) parts.push(`${s.downloads} ${s.downloads === 1 ? 'download' : 'downloads'}`);
    return parts.join(' · ');
  }

  function renderPoster(canvas, s, img) {
    const warnings = [];
    const ctx = canvas.getContext('2d');
    let p = brandPalette();
    if (img) {
      try { p = extractPalette(img); }
      catch (e) { warnings.push('Could not read artwork colours; using Zami colours.'); console.error('[ZamiShare] palette failed', e); }
    }

    drawBackground(ctx, img, p);
    drawBranding(ctx);
    drawArtwork(ctx, img, ART_X, ART_Y, ART, 44, p);

    // Title (auto-fit to 1–2 lines)
    const title = fitTitle(ctx, s.title);
    const lh = Math.round(title.size * 1.08);
    let y = ART_Y + ART + 52 + title.size * 0.78 + (title.lines.length === 1 ? 26 : 0);
    title.lines.forEach((ln, i) => drawText(ctx, ln, W / 2, y + i * lh, { size: title.size, weight: 800, align: 'center' }));
    y += (title.lines.length - 1) * lh;

    // Artist
    let aSize = 40; ctx.font = `600 ${aSize}px ${FONT}`;
    while (aSize > 28 && ctx.measureText(s.artist).width > TEXT_W) { aSize -= 2; ctx.font = `600 ${aSize}px ${FONT}`; }
    y += 58;
    drawText(ctx, ellipsize(ctx, s.artist, TEXT_W), W / 2, y, { size: aSize, weight: 600, color: css(p.accent), align: 'center' });

    // Genre pill + stats
    const genre = [s.genre, s.kind === 'beat' ? 'Beat' : ''].filter(Boolean).join(' · ').toUpperCase();
    const stats = statsText(s);
    let rowBottom = y + 20;
    if (genre || stats) {
      const pillH = 48, top = y + 30, cy = top + pillH / 2;
      ctx.font = `700 24px ${FONT}`;
      const gText = genre ? ellipsize(ctx, genre, 480) : '';
      const pillW = gText ? measureTracked(ctx, gText, 3) + 48 : 0;
      ctx.font = `500 26px ${FONT}`;
      const stW = stats ? ctx.measureText(stats).width : 0;
      const total = pillW + (pillW && stW ? 24 : 0) + stW;
      let x = (W - total) / 2;
      if (pillW) {
        ctx.fillStyle = css(p.dominant, 0.2); ctx.strokeStyle = css(p.dominant, 0.9); ctx.lineWidth = 2;
        drawRoundedRect(ctx, x, top, pillW, pillH, pillH / 2); ctx.fill(); ctx.stroke();
        drawText(ctx, gText, x + 24, cy + 8, { size: 24, weight: 700, tracking: 3 });
        x += pillW + 24;
      }
      if (stats) drawText(ctx, stats, x, cy + 9, { size: 26, weight: 500, alpha: 0.72 });
      rowBottom = top + pillH;
    }

    // Play icon + waveform (decorative)
    const wy = rowBottom + 30 + 36;
    drawPlayIcon(ctx, 126, wy, 36, p);
    drawWaveform(ctx, 190, wy, 800, 60, makePeaks(s, 57), p);

    // Bottom: price chip + CTA
    const by = 1196, bh = 84;
    let cx = 90, cw = 900;
    const chip = s.isFree ? 'FREE' : s.price;
    if (chip) {
      ctx.font = `800 46px ${FONT}`;
      const chipW = clamp(ctx.measureText(chip).width + 56, 170, 260);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.strokeStyle = css(p.dominant, 0.85); ctx.lineWidth = 2.5;
      drawRoundedRect(ctx, 90, by, chipW, bh, bh / 2); ctx.fill(); ctx.stroke();
      drawText(ctx, ellipsize(ctx, chip, chipW - 30), 90 + chipW / 2, by + bh / 2 + 16, { size: 46, weight: 800, align: 'center' });
      cx = 90 + chipW + 20; cw = 990 - cx;
    }
    drawCTA(ctx, cx, by, cw, bh, 'LISTEN ON ZAMI', p);
    drawText(ctx, `ZAMI  •  ${config.slogan}`, W / 2, 1322, { size: 20, weight: 600, tracking: 4, alpha: 0.5, align: 'center' });
    return warnings;
  }

  function exportCanvas(canvas) {
    return new Promise((resolve, reject) => {
      try {
        if (canvas.toBlob) {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export returned null'))), 'image/png');
        } else {
          const [head, data] = canvas.toDataURL('image/png').split(',');
          const bin = atob(data), arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: /:(.*?);/.exec(head)[1] }));
        }
      } catch (e) { reject(e); }      // SecurityError here == tainted canvas (CORS)
    });
  }

  // ───────────────────────── song data ─────────────────────────
  let warnedBase = false;
  function buildSongUrl(type, id) {
    let base = config.baseUrl;
    if (!base) {
      if (/^https?:$/.test(location.protocol)) base = location.href;
      else if (!warnedBase) { warnedBase = true; console.warn('[ZamiShare] Set ZamiShare.config.baseUrl to your public https URL, otherwise shared links will not open for other people.'); }
    }
    return new URL(`${config.detailPath}?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, base || location.href).href;
  }

  // Maps a row from `tracks` / `beats` (as detail.html already loads it) to a song object.
  function songFromItem(item, { type, artistName }) {
    return {
      id: item.id, type,
      title: item.title, artist: artistName, genre: item.genre,
      kind: type === 'beat' ? 'beat' : 'track',
      isFree: type === 'track' && !!item.is_free,
      price: item.price,
      plays: item.play_count, buys: item.purchase_count, downloads: item.download_count,
      artwork: item.cover_url,
      url: buildSongUrl(type, item.id),
    };
  }

  function normalizeSong(song) {
    const n = num(song.price);
    const price = song.isFree || song.price == null || song.price === '' ? null
      : typeof song.price === 'number' || /^\d+(\.\d+)?$/.test(String(song.price)) ? `K${Number.isInteger(n) ? n : n.toFixed(2)}`
      : str(song.price);
    return {
      id: song.id, type: song.type,
      title: str(song.title) || 'Untitled',
      artist: str(song.artist) || 'Unknown artist',
      genre: str(song.genre), kind: song.kind,
      isFree: !!song.isFree, price,
      plays: num(song.plays), buys: num(song.buys), downloads: num(song.downloads),
      artwork: song.artwork || '', url: song.url || (song.id ? buildSongUrl(song.type || 'track', song.id) : ''),
      peaks: song.peaks,
    };
  }

  // ───────────────────────── generate + cache ─────────────────────────
  const cache = new Map();   // key -> { promise, t }

  function pruneCache() {
    const now = Date.now();
    for (const [k, v] of cache) if (now - v.t > config.cacheTtlMs) cache.delete(k);
    while (cache.size > config.cacheMax) cache.delete(cache.keys().next().value);
  }

  async function generateShareImage(song) {
    const s = normalizeSong(song);
    const warnings = [];
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, sleep(1500)]);

    let img = null;
    if (!s.artwork) warnings.push('No artwork for this song — using a default cover.');
    else {
      try { img = await loadImage(s.artwork); }
      catch (e) {
        console.error('[ZamiShare] Artwork failed to load. If this is a CORS error, the storage bucket must send Access-Control-Allow-Origin.', s.artwork, e);
        warnings.push('Artwork could not be loaded (network or CORS) — using a default cover.');
      }
    }

    const { canvas } = createCanvas(W, H);
    warnings.push(...renderPoster(canvas, s, img));
    let blob;
    try { blob = await exportCanvas(canvas); }
    finally { canvas.width = canvas.height = 0; }          // release the bitmap memory
    const filename = `${s.title.replace(/[\\/:*?"<>|]/g, '').trim() || 'song'}-zami.png`;
    const file = typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null;
    return { blob, file, filename, warnings, song: s };
  }

  function getShareImage(song) {
    pruneCache();
    const s = normalizeSong(song);
    const key = [s.id, s.title, s.artist, s.artwork, s.price, s.isFree, s.plays, s.buys, s.downloads, s.genre].join('|');
    const hit = cache.get(key);
    if (hit) return hit.promise;
    const promise = generateShareImage(song);
    cache.set(key, { promise, t: Date.now() });
    promise.catch(() => cache.delete(key));
    setTimeout(pruneCache, config.cacheTtlMs + 1000);
    return promise;
  }

  // ───────────────────────── sharing / saving ─────────────────────────
  const hasBridge = (fn) => !!(global.ZamiAndroid && fn in global.ZamiAndroid);
  const isWebView = () => /; wv\)|Version\/[\d.]+ Chrome\/[\d.]+ Mobile/.test(navigator.userAgent);

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  // returns: 'shared' | 'native' | 'link-only' | 'cancelled' | 'unsupported'
  async function shareImage(res) {
    const { song, file, blob, filename } = res;
    const title = `${song.title} — ${song.artist}`;
    // Put the link INSIDE the text: many share targets drop `url` when files are attached.
    const text = `Listen to ${song.title} by ${song.artist} on Zami${song.url ? '\n' + song.url : ''}`;

    if (hasBridge('shareImage')) {
      global.ZamiAndroid.shareImage(await blobToBase64(blob), filename, text);
      return 'native';
    }
    if (navigator.share) {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title, text }); return 'shared'; }
        catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; console.warn('[ZamiShare] file share failed, falling back', e); }
      }
      try { await navigator.share({ title, text, url: song.url || undefined }); return 'link-only'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    }
    return 'unsupported';
  }

  // returns: 'saved' | 'downloaded' | 'webview-no-bridge' | 'failed'
  async function saveImage(res, objectUrl) {
    if (hasBridge('saveImage')) {
      const ok = global.ZamiAndroid.saveImage(await blobToBase64(res.blob), res.filename);
      return ok === false ? 'failed' : 'saved';
    }
    const a = document.createElement('a');
    a.href = objectUrl; a.download = res.filename;
    document.body.appendChild(a); a.click(); a.remove();
    return isWebView() ? 'webview-no-bridge' : 'downloaded';
  }

  async function copyLink(url) {
    try { await navigator.clipboard.writeText(url); return true; } catch (e) { /* fall through */ }
    const ta = document.createElement('textarea');
    ta.value = url; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, url.length);
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove(); return ok;
  }

  // ───────────────────────── preview modal ─────────────────────────
  const CSS = `
.zs-backdrop{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:rgba(8,12,20,.72);padding:12px;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.zs-backdrop.zs-open{display:flex}
.zs-sheet{position:relative;width:100%;max-width:420px;max-height:100%;overflow:auto;background:#fff;border-radius:20px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.4);font-family:${FONT};color:#14181c}
.zs-close{position:absolute;top:8px;right:8px;width:44px;height:44px;border:none;border-radius:50%;background:rgba(20,24,28,.06);font-size:18px;cursor:pointer;z-index:1}
.zs-stage{display:flex;align-items:center;justify-content:center;min-height:200px;margin:28px 0 12px}
.zs-img{display:block;width:auto;max-width:100%;max-height:56vh;max-height:56dvh;aspect-ratio:1080/1350;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.25)}
.zs-img[hidden],.zs-loading[hidden],.zs-note[hidden]{display:none!important}
.zs-loading{display:flex;flex-direction:column;align-items:center;gap:14px;width:100%}
.zs-skel{position:relative;width:min(100%,300px);aspect-ratio:1080/1350;border-radius:14px;overflow:hidden;background:linear-gradient(160deg,#10203a,#0a0f1a);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 28px rgba(0,0,0,.25)}
.zs-skel::after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.12) 50%,transparent 70%);transform:translateX(-100%);animation:zs-sheen 1.6s ease-in-out infinite}
@keyframes zs-sheen{to{transform:translateX(100%)}}
.zs-eq{display:flex;align-items:flex-end;gap:7px;height:64px}
.zs-eq i{width:9px;height:100%;border-radius:5px;background:#1e6feb;transform-origin:bottom;animation:zs-bar 1s ease-in-out infinite}
.zs-eq i:nth-child(even){background:#7cbf1f}
.zs-eq i:nth-child(2){animation-delay:.15s}.zs-eq i:nth-child(3){animation-delay:.3s}.zs-eq i:nth-child(4){animation-delay:.45s}.zs-eq i:nth-child(5){animation-delay:.6s}
@keyframes zs-bar{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}
.zs-msg{margin:0;font-size:14px;color:#5b6570;text-align:center;min-height:20px}
.zs-err .zs-skel{display:none}
@media (prefers-reduced-motion:reduce){.zs-eq i,.zs-skel::after{animation:none}}
@keyframes zs-pulse{0%,100%{opacity:.5}50%{opacity:1}}
.zs-note{margin:0 0 10px;font-size:13px;line-height:1.35;color:#5b6570;text-align:center}
.zs-row{display:flex;gap:10px}
.zs-btn{flex:1;min-height:52px;border:1px solid #cfd8e6;border-radius:12px;background:#eef3fb;color:#1e6feb;font:600 16px ${FONT};cursor:pointer}
.zs-btn.zs-primary{background:linear-gradient(135deg,#1e6feb,#3a7ff0);border-color:transparent;color:#fff;box-shadow:0 4px 14px rgba(30,111,235,.25)}
.zs-btn:disabled{opacity:.55}
.zs-link{display:block;width:100%;min-height:48px;margin-top:6px;border:none;background:none;color:#1e6feb;font:600 15px ${FONT};cursor:pointer}
`;

  const LOADING_MSGS = ['Reading your cover art…', 'Picking the colors…', 'Tuning the waveform…', 'Adding the finishing touches…'];
  const modal = { el: null, img: null, loading: null, msg: null, timer: null, note: null, ac: null, url: null, res: null, token: 0, prevFocus: null, prevOverflow: '' };

  function ensureModal() {
    if (modal.el) return;
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    const el = document.createElement('div');
    el.className = 'zs-backdrop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Share song');
    el.innerHTML =
      '<div class="zs-sheet">' +
      '<button type="button" class="zs-close" data-a="close" aria-label="Close">✕</button>' +
      '<div class="zs-stage"><div class="zs-loading"><div class="zs-skel"><div class="zs-eq"><i></i><i></i><i></i><i></i><i></i></div></div><p class="zs-msg"></p></div><img class="zs-img" alt="Song promo poster" hidden></div>' +
      '<p class="zs-note" hidden></p>' +
      '<div class="zs-row"><button type="button" class="zs-btn zs-primary" data-a="share" disabled>Share</button>' +
      '<button type="button" class="zs-btn" data-a="save" disabled>Save Image</button></div>' +
      '<button type="button" class="zs-link" data-a="copy">Copy Song Link</button>' +
      '</div>';
    document.body.appendChild(el);
    modal.el = el; modal.img = el.querySelector('.zs-img'); modal.loading = el.querySelector('.zs-loading'); modal.msg = el.querySelector('.zs-msg'); modal.note = el.querySelector('.zs-note');
  }

  function startLoading() {
    stopLoading();
    modal.loading.hidden = false; modal.loading.classList.remove('zs-err');
    let i = 0; modal.msg.textContent = LOADING_MSGS[0];
    modal.timer = setInterval(() => { i = (i + 1) % LOADING_MSGS.length; modal.msg.textContent = LOADING_MSGS[i]; }, 1800);
  }
  function stopLoading() { if (modal.timer) { clearInterval(modal.timer); modal.timer = null; } }

  function setNote(msg) { modal.note.textContent = msg || ''; modal.note.hidden = !msg; }
  function setBusy(disabled) { modal.el.querySelectorAll('.zs-btn').forEach((b) => { b.disabled = disabled; }); }

  function closeModal() {
    if (!modal.el || !modal.el.classList.contains('zs-open')) return;
    modal.token++;                                         // invalidates any in-flight generation
    stopLoading();
    if (modal.ac) { modal.ac.abort(); modal.ac = null; }   // removes all listeners
    if (modal.url) { URL.revokeObjectURL(modal.url); modal.url = null; }
    modal.img.removeAttribute('src'); modal.img.hidden = true; modal.res = null;
    modal.el.classList.remove('zs-open');
    document.documentElement.style.overflow = modal.prevOverflow;
    if (modal.prevFocus && modal.prevFocus.focus) modal.prevFocus.focus();
  }

  async function openShareModal(song) {
    ensureModal();
    closeModal();
    const token = ++modal.token;
    modal.prevFocus = document.activeElement;
    modal.prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    startLoading();
    modal.img.hidden = true; setNote(''); setBusy(true);
    modal.el.querySelector('[data-a="copy"]').disabled = false;
    modal.el.classList.add('zs-open');

    const ac = modal.ac = new AbortController();
    const opts = { signal: ac.signal };
    const songUrl = () => normalizeSong(song).url;

    modal.el.addEventListener('click', async (e) => {
      if (e.target === modal.el) return closeModal();
      const btn = e.target.closest('[data-a]'); if (!btn) return;
      const a = btn.dataset.a;
      if (a === 'close') return closeModal();
      if (a === 'copy') { setNote((await copyLink(songUrl())) ? 'Link copied ✓' : 'Could not copy — long-press the link to copy.'); return; }
      if (!modal.res || btn.disabled) return;
      setBusy(true);
      try {
        if (a === 'share') {
          const r = await shareImage(modal.res);
          if (r === 'unsupported') setNote('Sharing isn’t supported here. Use Save Image, then post it and paste the copied link.');
          else if (r === 'link-only') setNote('Your device shared the link only. Use Save Image to attach the poster.');
          else setNote('');
        } else if (a === 'save') {
          const r = await saveImage(modal.res, modal.url);
          setNote({ saved: 'Saved to your Pictures/Zami folder ✓', downloaded: 'Image downloaded ✓',
            'webview-no-bridge': 'Saving isn’t available in this app version yet. Update Zami, or use Share.', failed: 'Could not save the image.' }[r]);
        }
      } catch (err) { console.error('[ZamiShare]', err); setNote('Something went wrong. Please try again.'); }
      finally { if (modal.res) setBusy(false); }
    }, opts);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); }, opts);

    try {
      const res = await getShareImage(song);
      if (token !== modal.token) return;                   // closed / reopened while generating
      modal.res = res;
      modal.url = URL.createObjectURL(res.blob);
      modal.img.src = modal.url; modal.img.hidden = false; stopLoading(); modal.loading.hidden = true;
      setNote(res.warnings[0] || ''); setBusy(false);
      const first = modal.el.querySelector('[data-a="share"]'); if (first) first.focus();
    } catch (e) {
      if (token !== modal.token) return;
      console.error('[ZamiShare] generation failed', e);
      stopLoading(); modal.loading.classList.add('zs-err');
      modal.msg.textContent = 'Could not create the poster. You can still copy the link below.';
    }
  }

  global.ZamiShare = { config, open: openShareModal, close: closeModal, generate: generateShareImage, songFromItem, buildSongUrl, _render: renderPoster };
})(window);
