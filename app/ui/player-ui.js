// Player UI: a mini bar (always available) plus a full "Now playing" sheet.
// Pure view of the player store — it holds no playback state of its own.
import { h, formatTime, safeUrl } from '../lib/dom.js';
import * as P from '../player/player.js';
import { icon, spinner } from './icons.js';

export function mountPlayerUI(host) {
  P.mountAudio(host);

  // ---------- mini bar ----------
  const miniSeek = h('input', { type: 'range', class: 'zs-range zs-range--mini', min: 0, max: 1000, step: 1, value: 0, 'aria-label': 'Seek', disabled: true });
  const miniCover = h('span', { class: 'zs-cover zs-cover--sm' });
  const miniTitle = h('span', { class: 'zs-p-title' });
  const miniSub = h('span', { class: 'zs-p-sub' });
  const metaBtn = h('button', { type: 'button', class: 'zs-p-meta', 'aria-label': 'Open now playing' }, miniCover, h('span', { class: 'zs-p-text' }, miniTitle, miniSub));
  const miniPrev = h('button', { type: 'button', class: 'zs-ibtn', 'aria-label': 'Previous track' });
  const miniPlay = h('button', { type: 'button', class: 'zs-ibtn zs-ibtn--primary' });
  const miniNext = h('button', { type: 'button', class: 'zs-ibtn', 'aria-label': 'Next track' });
  miniPrev.innerHTML = icon('prev'); miniNext.innerHTML = icon('next');
  const miniTime = h('span', { class: 'zs-p-time' }, '0:00 / 0:00');
  const miniMute = h('button', { type: 'button', class: 'zs-ibtn zs-hide-touch' });
  const miniVol = h('input', { type: 'range', class: 'zs-range zs-range--vol zs-hide-touch', min: 0, max: 100, step: 1, 'aria-label': 'Volume' });
  const miniShuffle = h('button', { type: 'button', class: 'zs-ibtn zs-hide-narrow', 'aria-label': 'Shuffle' });
  const miniRepeat = h('button', { type: 'button', class: 'zs-ibtn zs-hide-narrow' });
  miniShuffle.innerHTML = icon('shuffle'); 
  const miniExpand = h('button', { type: 'button', class: 'zs-ibtn', 'aria-label': 'Open now playing' }); miniExpand.innerHTML = icon('up');

  const bar = h('div', { id: 'zs-player', class: 'zs-player', role: 'region', 'aria-label': 'Music player', hidden: true },
    miniSeek,
    h('div', { class: 'zs-p-main' }, metaBtn,
      h('div', { class: 'zs-p-controls' }, miniShuffle, miniPrev, miniPlay, miniNext, miniRepeat),
      miniTime,
      h('div', { class: 'zs-p-extras' }, miniMute, miniVol, miniExpand)));

  // ---------- full sheet ----------
  const sheetCover = h('span', { class: 'zs-cover zs-cover--lg' });
  const sheetTitle = h('h2', { class: 'zs-sheet-title', id: 'zs-sheet-title' });
  const sheetSub = h('p', { class: 'zs-sheet-sub' });
  const sheetSeek = h('input', { type: 'range', class: 'zs-range zs-range--seek', min: 0, max: 1000, step: 1, value: 0, 'aria-label': 'Seek', disabled: true });
  const curT = h('span', null, '0:00'); const durT = h('span', null, '0:00');
  const sShuffle = h('button', { type: 'button', class: 'zs-ibtn zs-ibtn--lg', 'aria-label': 'Shuffle' }); sShuffle.innerHTML = icon('shuffle');
  const sPrev = h('button', { type: 'button', class: 'zs-ibtn zs-ibtn--lg', 'aria-label': 'Previous track' }); sPrev.innerHTML = icon('prev', 28);
  const sPlay = h('button', { type: 'button', class: 'zs-ibtn zs-ibtn--lg zs-ibtn--primary zs-ibtn--xl' });
  const sNext = h('button', { type: 'button', class: 'zs-ibtn zs-ibtn--lg', 'aria-label': 'Next track' }); sNext.innerHTML = icon('next', 28);
  const sRepeat = h('button', { type: 'button', class: 'zs-ibtn zs-ibtn--lg' });
  const sMute = h('button', { type: 'button', class: 'zs-ibtn zs-hide-touch' });
  const sVol = h('input', { type: 'range', class: 'zs-range zs-range--vol zs-hide-touch', min: 0, max: 100, step: 1, 'aria-label': 'Volume' });
  const sErr = h('p', { class: 'zs-sheet-err', role: 'alert' });
  const queueList = h('ol', { class: 'zs-queue', 'aria-label': 'Queue' });
  const closeBtn = h('button', { type: 'button', class: 'zs-ibtn', 'aria-label': 'Close now playing' }); closeBtn.innerHTML = icon('down');
  const sheet = h('div', { class: 'zs-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'zs-sheet-title', hidden: true },
    h('div', { class: 'zs-sheet-inner' },
      h('div', { class: 'zs-sheet-head' }, closeBtn, h('span', { class: 'zs-sheet-kicker' }, 'Now playing')),
      sheetCover, sheetTitle, sheetSub, sErr,
      h('div', { class: 'zs-seekrow' }, curT, sheetSeek, durT),
      h('div', { class: 'zs-sheet-controls' }, sShuffle, sPrev, sPlay, sNext, sRepeat),
      h('div', { class: 'zs-sheet-vol' }, sMute, sVol),
      h('h3', { class: 'zs-queue-h' }, 'Queue'), queueList));
  host.append(bar, sheet);

  // ---------- helpers ----------
  const setCover = (el, url, title) => {
    el.replaceChildren();
    const src = safeUrl(url);
    if (src) {
      const img = h('img', { src, alt: '', decoding: 'async', loading: 'lazy' });
      img.addEventListener('error', () => { img.remove(); el.innerHTML = icon('note', 22); });
      el.append(img);
    } else el.innerHTML = icon('note', 22);
    el.title = title || '';
  };
  const setPlayBtn = (btn, s, big) => {
    const sz = big ? 36 : 26;
    if (s.status === 'loading' || s.status === 'buffering') { btn.innerHTML = spinner; btn.setAttribute('aria-label', 'Loading'); btn.setAttribute('aria-busy', 'true'); }
    else { btn.removeAttribute('aria-busy');
      if (s.status === 'error') { btn.innerHTML = icon('retry', sz); btn.setAttribute('aria-label', 'Retry'); }
      else if (s.status === 'playing') { btn.innerHTML = icon('pause', sz); btn.setAttribute('aria-label', 'Pause'); }
      else { btn.innerHTML = icon('play', sz); btn.setAttribute('aria-label', 'Play'); } }
  };
  const setRepeat = (btn, r) => {
    btn.innerHTML = icon(r === 'one' ? 'repeat-one' : 'repeat');
    btn.setAttribute('aria-label', r === 'off' ? 'Repeat off' : r === 'all' ? 'Repeat all' : 'Repeat one');
    btn.setAttribute('aria-pressed', r === 'off' ? 'false' : 'true');
  };
  const setVol = (s) => {
    const v = s.muted ? 0 : Math.round(s.volume * 100);
    for (const [m, r] of [[miniMute, miniVol], [sMute, sVol]]) {
      m.innerHTML = icon(s.muted || s.volume === 0 ? 'mute' : 'volume');
      m.setAttribute('aria-label', s.muted ? 'Unmute' : 'Mute');
      if (document.activeElement !== r) r.value = v;
    }
  };

  let queueSig = '';
  function renderState(s) {
    const t = s.current;
    bar.hidden = !t;
    document.body.classList.toggle('zs-has-player', !!t);
    if (!t) { if (!sheet.hidden) closeSheet(); return; }
    miniTitle.textContent = t.title;
    const sub = s.status === 'error' ? s.error : (t.artist || (t.type === 'beat' ? 'Beat' : ''));
    miniSub.textContent = sub; miniSub.classList.toggle('zs-err', s.status === 'error');
    if (miniCover.dataset.k !== t.key) { miniCover.dataset.k = t.key; setCover(miniCover, t.cover, t.title); setCover(sheetCover, t.cover, t.title); }
    sheetTitle.textContent = t.title; sheetSub.textContent = t.artist || (t.type === 'beat' ? 'Beat' : '');
    sErr.textContent = s.status === 'error' ? s.error : '';
    setPlayBtn(miniPlay, s, false); setPlayBtn(sPlay, s, true);
    miniPrev.disabled = sPrev.disabled = !s.queue.length;
    miniNext.disabled = sNext.disabled = !s.queue.length;
    for (const b of [miniShuffle, sShuffle]) { b.setAttribute('aria-pressed', String(s.shuffle)); b.classList.toggle('is-on', s.shuffle); }
    for (const b of [miniRepeat, sRepeat]) { setRepeat(b, s.repeat); b.classList.toggle('is-on', s.repeat !== 'off'); }
    setVol(s);
    // queue
    const sig = s.queue.map((q) => q.key).join('|') + '#' + s.order.join(',') + '@' + s.pos;
    if (sig !== queueSig) {
      queueSig = sig;
      queueList.replaceChildren();
      s.order.forEach((qi, p) => {
        const q = s.queue[qi];
        const cur = p === s.pos;
        const jump = h('button', { type: 'button', class: 'zs-q-main', 'aria-current': cur ? 'true' : null, onclick: () => P.jumpTo(qi) },
          h('span', { class: 'zs-q-title' }, q.title), h('span', { class: 'zs-q-artist' }, q.artist || ''));
        const rm = h('button', { type: 'button', class: 'zs-ibtn zs-q-rm', 'aria-label': `Remove ${q.title} from queue`, disabled: cur, onclick: () => P.removeFromQueue(qi) });
        rm.innerHTML = icon('close', 18);
        queueList.append(h('li', { class: cur ? 'is-current' : '' }, jump, rm));
      });
    }
  }
  let dragging = false;
  function renderProgress(p) {
    const d = p.duration || 0;
    const frac = d ? Math.min(1, p.currentTime / d) : 0;
    const txt = `${formatTime(p.currentTime)} / ${formatTime(d)}`;
    miniTime.textContent = txt; curT.textContent = formatTime(p.currentTime); durT.textContent = formatTime(d);
    miniSeek.disabled = sheetSeek.disabled = !d;
    if (!dragging) { miniSeek.value = sheetSeek.value = Math.round(frac * 1000); }
    const pct = `${frac * 100}%`; const buf = d ? `${Math.min(100, (p.buffered / d) * 100)}%` : '0%';
    for (const r of [miniSeek, sheetSeek]) { r.style.setProperty('--p', pct); r.style.setProperty('--b', buf); r.setAttribute('aria-valuetext', `${formatTime(p.currentTime)} of ${formatTime(d)}`); }
  }

  // ---------- events ----------
  for (const r of [miniSeek, sheetSeek]) {
    r.addEventListener('input', () => { dragging = true; const d = P.progress.get().duration; curT.textContent = formatTime((r.value / 1000) * d); r.style.setProperty('--p', `${r.value / 10}%`); });
    r.addEventListener('change', () => { dragging = false; const d = P.progress.get().duration; if (d) P.seek((r.value / 1000) * d); });
    r.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); P.seek(P.progress.get().currentTime + (e.key === 'ArrowRight' ? 5 : -5)); }
    });
  }
  for (const [pl, pv, nx, sh, rp, mu, vol] of [[miniPlay, miniPrev, miniNext, miniShuffle, miniRepeat, miniMute, miniVol], [sPlay, sPrev, sNext, sShuffle, sRepeat, sMute, sVol]]) {
    pl.addEventListener('click', () => P.toggle());
    pv.addEventListener('click', () => P.prev());
    nx.addEventListener('click', () => P.next());
    sh.addEventListener('click', () => P.toggleShuffle());
    rp.addEventListener('click', () => P.cycleRepeat());
    mu.addEventListener('click', () => P.toggleMute());
    vol.addEventListener('input', () => P.setVolume(vol.value / 100));
  }

  let lastFocus = null;
  function openSheet() {
    if (!P.state.get().current) return;
    lastFocus = document.activeElement;
    sheet.hidden = false; document.body.classList.add('zs-lock');
    closeBtn.focus();
  }
  function closeSheet() {
    sheet.hidden = true; document.body.classList.remove('zs-lock');
    (lastFocus && lastFocus.isConnected ? lastFocus : miniExpand).focus?.();
  }
  metaBtn.addEventListener('click', openSheet); miniExpand.addEventListener('click', openSheet); closeBtn.addEventListener('click', closeSheet);
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
    if (e.key !== 'Tab') return;
    const f = [...sheet.querySelectorAll('button:not([disabled]),input:not([disabled])')].filter((n) => n.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // Close the sheet on in-app navigation so the page underneath is visible.
  window.addEventListener('zs:route', () => { if (!sheet.hidden) closeSheet(); });

  P.state.subscribe(renderState); P.progress.subscribe(renderProgress);
  renderState(P.state.get()); renderProgress(P.progress.get());
}
