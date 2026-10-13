// Persistent music player: ONE <audio> element and ONE state store for the whole app.
// It lives in the app shell (outside the routed view), so navigating between pages never
// stops, restarts or recreates playback.
import { createStore } from '../lib/store.js';
import { supabase } from '../lib/supabase.js';
import { safeUrl } from '../lib/dom.js';
import { cached } from '../lib/cache.js';

const RECENT_KEY = 'zami-recently-played';
const VOLUME_KEY = 'zami-volume';
const MAX_RECENT = 20;

function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function writeJson(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage unavailable */ } }

const audio = document.createElement('audio');
audio.id = 'zs-audio';
audio.preload = 'none';
audio.setAttribute('playsinline', '');
audio.hidden = true;
audio.volume = Math.min(1, Math.max(0, Number(readJson(VOLUME_KEY, 1))));

export const state = createStore({
  queue: [], order: [], pos: -1, current: null,
  status: 'idle',          // idle | loading | playing | paused | buffering | error | ended
  error: '', shuffle: false, repeat: 'off', // off | all | one
  volume: audio.volume, muted: false,
  recent: readJson(RECENT_KEY, []),
});
export const progress = createStore({ currentTime: 0, duration: 0, buffered: 0 });

let loadSeq = 0;         // invalidates stale async work whenever the track changes
let countedSeq = -1;     // play-count RPC fired once per loaded track
let failStreak = 0;
let switching = false;   // true while we swap src, so the browser's transitional events are ignored
let retryAt = 0;

export function mountAudio(parent) { if (!audio.isConnected) parent.appendChild(audio); }

// ---- track descriptors ------------------------------------------------------
export function srcFromRow(row, type) {
  const free = type === 'track' && row.is_free;
  const path = free ? row.file_path : row.preview_path;
  if (!path) return null;
  return supabase.storage.from('public-previews').getPublicUrl(path).data.publicUrl;
}
export function trackFromRow(row, artistName = '') {
  const type = row.item_type || (row.full_path !== undefined || row.bpm !== undefined ? 'beat' : 'track');
  const t = { key: `${type}-${row.id}`, type, id: row.id, title: row.title || 'Untitled', artist: artistName || '', ownerId: row.owner_id, cover: row.cover_url || '' };
  const free = type === 'track' && row.is_free;
  if ((free && row.file_path) || row.preview_path) t.src = srcFromRow(row, type);
  return t;
}
async function resolveSrc(track) {
  if (track.src) return safeUrl(track.src);
  return cached(`src:${track.key}`, 10 * 60_000, async () => {
    const table = track.type === 'beat' ? 'beats' : 'tracks';
    const { data: row, error } = await supabase.from(table).select('*').eq('id', track.id).eq('status', 'approved').maybeSingle();
    if (error) throw error;
    if (!row) return null;
    return safeUrl(srcFromRow(row, track.type) || '');
  });
}

// ---- queue helpers ------------------------------------------------------------
function shuffled(n, firstIdx) {
  const rest = [...Array(n).keys()].filter((i) => i !== firstIdx);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return firstIdx >= 0 ? [firstIdx, ...rest] : rest;
}
const natural = (n) => [...Array(n).keys()];
const currentIndex = () => { const s = state.get(); return s.order[s.pos] ?? -1; };

export function isCurrent(key) { return state.get().current?.key === key; }
export function isPlaying(key) { const s = state.get(); return s.current?.key === key && (s.status === 'playing' || s.status === 'buffering' || s.status === 'loading'); }

// ---- public controls -----------------------------------------------------------
export function playQueue(tracks, startIndex = 0) {
  const list = tracks.filter(Boolean);
  if (!list.length) return;
  const start = Math.min(Math.max(startIndex, 0), list.length - 1);
  const target = list[start];
  const s = state.get();
  // Clicking the track that is already loaded just toggles it — never reloads.
  if (s.current?.key === target.key && s.status !== 'error') { toggle(); return; }
  const order = s.shuffle ? shuffled(list.length, start) : natural(list.length);
  failStreak = 0;
  state.set({ queue: list, order, pos: order.indexOf(start) });
  loadAndPlay();
}
export function playTrack(track) { playQueue([track], 0); }

export function toggle() {
  const s = state.get();
  if (!s.current || s.status === 'loading') return;   // ignore repeated clicks while a track is resolving
  if (s.status === 'error') { retry(); return; }
  if (s.status === 'ended') { audio.currentTime = 0; }
  if (audio.paused) {
    audio.play().catch((e) => { if (e?.name !== 'AbortError') failCurrent('Playback was blocked. Tap play again.', false); });
  } else audio.pause();
}
export function pause() { if (!audio.paused) audio.pause(); }
export function next({ auto = false } = {}) {
  const s = state.get();
  if (!s.queue.length) return;
  let pos = s.pos + 1;
  if (pos >= s.order.length) {
    if (s.repeat === 'all' || !auto) pos = 0;
    else { state.set({ status: 'ended' }); audio.pause(); return; }
  }
  failStreak = 0;
  state.set({ pos });
  loadAndPlay();
}
export function prev() {
  const s = state.get();
  if (!s.queue.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  const pos = s.pos > 0 ? s.pos - 1 : (s.repeat === 'all' ? s.order.length - 1 : 0);
  failStreak = 0;
  state.set({ pos });
  loadAndPlay();
}
export function jumpTo(queueIndex) {
  const s = state.get();
  const pos = s.order.indexOf(queueIndex);
  if (pos < 0) return;
  failStreak = 0;
  if (pos === s.pos && s.status !== 'error') { toggle(); return; }
  state.set({ pos });
  loadAndPlay();
}
export function removeFromQueue(queueIndex) {
  const s = state.get();
  if (queueIndex === currentIndex()) return; // the playing item can't be removed
  const queue = s.queue.filter((_, i) => i !== queueIndex);
  const order = s.order.filter((i) => i !== queueIndex).map((i) => (i > queueIndex ? i - 1 : i));
  const cur = currentIndex();
  const newCur = cur > queueIndex ? cur - 1 : cur;
  state.set({ queue, order, pos: order.indexOf(newCur) });
}
export function seek(sec) {
  if (!Number.isFinite(sec) || !state.get().current) return;
  const d = audio.duration;
  audio.currentTime = Number.isFinite(d) ? Math.min(Math.max(0, sec), d) : Math.max(0, sec);
  progress.set({ currentTime: audio.currentTime });
}
export function setVolume(v) {
  audio.volume = Math.min(1, Math.max(0, v));
  audio.muted = false;
  writeJson(VOLUME_KEY, audio.volume);
}
export function toggleMute() { audio.muted = !audio.muted; }
export function toggleShuffle() {
  const s = state.get();
  const shuffle = !s.shuffle;
  const cur = currentIndex();
  const order = shuffle ? shuffled(s.queue.length, cur) : natural(s.queue.length);
  state.set({ shuffle, order, pos: cur >= 0 ? order.indexOf(cur) : -1 });
}
export function cycleRepeat() {
  const r = state.get().repeat;
  state.set({ repeat: r === 'off' ? 'all' : r === 'all' ? 'one' : 'off' });
}
export function retry() {
  const s = state.get();
  if (!s.current) return;
  retryAt = progress.get().currentTime;
  failStreak = 0;
  loadAndPlay({ resumeAt: retryAt });
}

// ---- loading ----------------------------------------------------------------------
async function loadAndPlay({ resumeAt = 0 } = {}) {
  const seq = ++loadSeq;
  const s = state.get();
  const track = s.queue[s.order[s.pos]];
  if (!track) return;
  switching = true;
  if (!audio.paused) audio.pause();          // never let the previous track keep playing under a new title
  state.set({ current: track, status: 'loading', error: '' });
  progress.set({ currentTime: resumeAt, duration: 0, buffered: 0 });
  updateMediaSession(track);

  let src = '';
  try { src = await resolveSrc(track); }
  catch (e) { if (seq !== loadSeq) return; console.error(e); return failCurrent('Could not load this track.', true); }
  if (seq !== loadSeq) return;
  if (!src) return failCurrent('No preview available for this item.', true);

  audio.src = src;
  audio.load();
  if (resumeAt > 0) audio.addEventListener('loadedmetadata', () => { if (seq === loadSeq) audio.currentTime = resumeAt; }, { once: true });
  switching = false;
  try { await audio.play(); }
  catch (e) {
    if (seq !== loadSeq || e?.name === 'AbortError') return;       // superseded by a newer request
    if (e?.name === 'NotAllowedError') { state.set({ status: 'paused' }); return; }
    failCurrent('This audio could not be played.', true);
  }
}

function failCurrent(message, canSkip) {
  switching = false;
  state.set({ status: 'error', error: message });
  const s = state.get();
  failStreak += 1;
  if (canSkip && s.queue.length > 1 && failStreak < s.queue.length) {
    const seq = loadSeq;
    setTimeout(() => { if (seq === loadSeq && state.get().status === 'error') next({ auto: true }); }, 1200);
  }
}

// ---- <audio> events ----------------------------------------------------------------
audio.addEventListener('playing', () => {
  if (switching) return;
  failStreak = 0;
  state.set({ status: 'playing', error: '' });
  setPlaybackState('playing');
  if (countedSeq !== loadSeq) {
    countedSeq = loadSeq;
    const t = state.get().current;
    if (t) {
      // same counter the detail page always incremented, once per started play
      supabase.rpc('increment_play_count', { p_item_type: t.type, p_item_id: t.id }).then(() => {}, () => {});
      pushRecent(t);
    }
  }
});
audio.addEventListener('pause', () => {
  if (switching || audio.ended) return;
  if (state.get().status === 'playing' || state.get().status === 'buffering') { state.set({ status: 'paused' }); setPlaybackState('paused'); }
});
audio.addEventListener('waiting', () => { if (!switching && state.get().status === 'playing') state.set({ status: 'buffering' }); });
audio.addEventListener('stalled', () => { if (!switching && state.get().status === 'playing') state.set({ status: 'buffering' }); });
audio.addEventListener('canplay', () => { if (state.get().status === 'buffering' && !audio.paused) state.set({ status: 'playing' }); });
audio.addEventListener('timeupdate', () => { progress.set({ currentTime: audio.currentTime }); updatePosition(); });
audio.addEventListener('durationchange', () => progress.set({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 }));
audio.addEventListener('progress', () => {
  try { const b = audio.buffered; progress.set({ buffered: b.length ? b.end(b.length - 1) : 0 }); } catch { /* ignore */ }
});
audio.addEventListener('ended', () => {
  const s = state.get();
  if (s.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
  next({ auto: true });
});
audio.addEventListener('error', () => {
  if (switching || !audio.getAttribute('src')) return;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  failCurrent(offline ? "You're offline. Reconnect and tap play to retry." : 'This audio could not be played.', !offline);
});
audio.addEventListener('volumechange', () => state.set({ volume: audio.volume, muted: audio.muted }));
window.addEventListener('online', () => { if (state.get().status === 'error' && /offline/i.test(state.get().error)) retry(); });

function pushRecent(t) {
  const item = { key: t.key, type: t.type, id: t.id, title: t.title, artist: t.artist, ownerId: t.ownerId, cover: t.cover };
  const recent = [item, ...state.get().recent.filter((r) => r.key !== t.key)].slice(0, MAX_RECENT);
  state.set({ recent });
  writeJson(RECENT_KEY, recent);
}

// ---- Media Session (lock screen / headset / system controls) -----------------------------
const ms = 'mediaSession' in navigator ? navigator.mediaSession : null;
function setPlaybackState(s) { if (ms) ms.playbackState = s; }
function updateMediaSession(track) {
  if (!ms || typeof MediaMetadata === 'undefined') return;
  const cover = safeUrl(track.cover);
  try {
    ms.metadata = new MediaMetadata({
      title: track.title, artist: track.artist || 'ZAMI', album: track.type === 'beat' ? 'Beat' : 'ZAMI',
      artwork: cover ? [{ src: cover, sizes: '512x512' }] : [],
    });
  } catch { /* unsupported artwork etc. */ }
}
let lastPos = 0;
function updatePosition() {
  if (!ms || !ms.setPositionState || Date.now() - lastPos < 1000 || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
  lastPos = Date.now();
  try { ms.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate || 1, position: Math.min(audio.currentTime, audio.duration) }); } catch { /* ignore */ }
}
if (ms) {
  const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch { /* action unsupported */ } };
  set('play', () => { if (audio.paused) toggle(); });
  set('pause', () => pause());
  set('previoustrack', () => prev());
  set('nexttrack', () => next());
  set('seekto', (d) => { if (d.seekTime != null) seek(d.seekTime); });
  set('seekbackward', (d) => seek(audio.currentTime - (d.seekOffset || 10)));
  set('seekforward', (d) => seek(audio.currentTime + (d.seekOffset || 10)));
}

// exposed for tests/debugging only (read-only access to the single audio element)
export const _audio = audio;
