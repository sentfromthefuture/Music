// Waveform display + scrubber for the detail page. Same look as the original WaveSurfer setup
// (56px high, 2px bars, 1px gap, #c9cdc7 / #1e6feb) but driven by the ONE shared <audio> element:
// it only draws peaks and seeks the shared player, so it can never create a second audio instance
// or restart playback when you navigate. Peaks are decoded at a low sample rate to keep memory small
// and cached per URL so revisiting a track costs nothing.
import { h } from '../lib/dom.js';
import * as P from '../player/player.js';

const peaksCache = new Map();   // src -> Float32Array(RES)
const RES = 1000;
const MAX_BYTES = 30 * 1024 * 1024;
const FLAT = new Float32Array(RES).fill(0.3);

async function decodePeaks(src, signal) {
  if (peaksCache.has(src)) return peaksCache.get(src);
  const res = await fetch(src, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length')) || 0;
  if (len > MAX_BYTES) throw new Error('file too large to draw');
  const data = await res.arrayBuffer();
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let actx;
  try { actx = new Ctx(1, 1, 8000); } catch { actx = new Ctx(1, 1, 22050); }
  const audio = await actx.decodeAudioData(data);
  const chs = [...Array(audio.numberOfChannels).keys()].map((i) => audio.getChannelData(i));
  const seg = Math.max(1, Math.floor(audio.length / RES));
  const peaks = new Float32Array(RES);
  let max = 0;
  for (let i = 0; i < RES; i++) {
    let m = 0;
    for (const c of chs) for (let j = i * seg, e = Math.min(j + seg, c.length); j < e; j++) { const v = Math.abs(c[j]); if (v > m) m = v; }
    peaks[i] = m; if (m > max) max = m;
  }
  if (max > 0) for (let i = 0; i < RES; i++) peaks[i] /= max;
  peaksCache.set(src, peaks);
  return peaks;
}

export function createWaveform({ track, src, height = 56 }) {
  const canvas = h('canvas', { class: 'wf-canvas', 'aria-hidden': 'true' });
  const box = h('div', { class: 'wf', role: 'slider', tabindex: 0, 'aria-label': 'Seek', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 }, canvas);
  let peaks = FLAT, frac = 0, destroyed = false;
  const abort = new AbortController();
  const g = canvas.getContext('2d');

  function draw() {
    const w = box.clientWidth || 300, dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(height * dpr); canvas.style.width = '100%'; canvas.style.height = height + 'px'; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, height);
    const step = 3, n = Math.max(1, Math.floor(w / step));
    for (let i = 0; i < n; i++) {
      const from = Math.floor((i / n) * RES), to = Math.max(from + 1, Math.floor(((i + 1) / n) * RES));
      let m = 0; for (let k = from; k < to; k++) if (peaks[k] > m) m = peaks[k];
      const bh = Math.max(3, m * height);
      g.fillStyle = (i + 0.5) / n <= frac ? '#1e6feb' : '#c9cdc7';
      g.fillRect(i * step, (height - bh) / 2, 2, bh);
    }
  }
  const isMine = () => P.state.get().current?.key === track.key;
  function onProgress() {
    const p = P.progress.get();
    const f = isMine() && p.duration ? Math.min(1, p.currentTime / p.duration) : 0;
    if (Math.abs(f - frac) < 0.0005) return;
    frac = f; box.setAttribute('aria-valuenow', String(Math.round(f * 100))); draw();
  }
  const unsubs = [P.progress.subscribe(onProgress), P.state.subscribe(onProgress)];

  function seekTo(f) {
    f = Math.min(1, Math.max(0, f));
    if (isMine()) { const d = P.progress.get().duration; if (d) P.seek(f * d); return; }
    // not loaded yet: start this track, then jump to the clicked position once its length is known
    P.playTrack(track);
    const off = P.progress.subscribe((p) => { if (p.duration > 0 && isMine()) { off(); clearTimeout(t); P.seek(f * p.duration); } });
    const t = setTimeout(off, 10_000);
  }
  const fracFrom = (e) => { const r = box.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
  let dragging = false;
  box.addEventListener('pointerdown', (e) => { dragging = true; box.setPointerCapture?.(e.pointerId); seekTo(fracFrom(e)); });
  box.addEventListener('pointermove', (e) => { if (dragging && isMine()) { const d = P.progress.get().duration; if (d) P.seek(fracFrom(e) * d); } });
  const up = () => { dragging = false; };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); if (isMine()) P.seek(P.progress.get().currentTime + (e.key === 'ArrowRight' ? 5 : -5)); }
  });

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(box);
  draw();

  const saveData = navigator.connection?.saveData;
  if (src && !saveData) {
    box.classList.add('is-loading');
    decodePeaks(src, abort.signal).then((p) => { if (!destroyed) { peaks = p; draw(); } })
      .catch(() => { /* keep the flat scrub bar: playback and seeking still work */ })
      .finally(() => { if (!destroyed) box.classList.remove('is-loading'); });
  }
  onProgress();
  return { el: box, destroy() { destroyed = true; abort.abort(); unsubs.forEach((u) => u()); ro?.disconnect(); } };
}
