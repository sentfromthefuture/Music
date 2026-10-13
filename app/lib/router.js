// Path-compatible client-side router.
//
// Every legacy URL keeps working exactly as before (browse.html, detail.html?type=…&id=…,
// artist.html?id=…, login.html …): each of those files is a tiny bootstrap page that loads this
// app, so direct links, refreshes, shared links and the Android WebView start URL need no server
// rewrite rules. Inside the app, same-site links are intercepted and rendered without reloading
// the document, so the persistent player (and its <audio> element) is never torn down.
import { createViewClient } from './supabase.js';

const ROUTES = {
  'browse.html': () => import('../views/browse.js'),
  'detail.html': () => import('../views/detail.js'),
  'artist.html': () => import('../views/artist.js'),
  'account.html': () => import('../views/account.js'),
  'login.html': () => import('../views/login.js'),
  'checkout.html': () => import('../views/checkout.js'),
  'balance.html': () => import('../views/balance.js'),
  'my-uploads.html': () => import('../views/my-uploads.js'),
  'upload.html': () => import('../views/upload.js'),
  'admin.html': () => import('../views/admin.js'),
  'download.html': () => import('../views/download.js'),
};

const baseDir = new URL('.', location.href).pathname;
const entryState = new Map(); // history entry key -> state bag that survives back/forward
const scrollPos = new Map();  // history entry key -> scrollY

let outlet = null;
let current = null;
let renderToken = 0;
let lastPathSearch = location.pathname + location.search;
let announce = () => {};

const fileOf = (url) => url.pathname.split('/').pop() || '';
const routeFor = (url) => ROUTES[fileOf(url)];
const newKey = () => Math.random().toString(36).slice(2);
const currentKey = () => history.state?.key;

export function isRoutable(url) {
  return url.origin === location.origin && url.pathname.startsWith(baseDir) && !!routeFor(url);
}

export function navigate(to, { replace = false } = {}) {
  const url = new URL(to, location.href);
  if (!isRoutable(url)) { location.assign(url.href); return; }
  if (url.href === location.href) return;
  const samePage = url.pathname + url.search === location.pathname + location.search;
  saveScroll();
  history[replace ? 'replaceState' : 'pushState']({ key: newKey() }, '', url.href);
  lastPathSearch = url.pathname + url.search;
  if (samePage) { window.dispatchEvent(new Event('zs:hashchange')); return; }
  render({ restoreScroll: false });
}

// Update the query string of the current entry without adding history or re-rendering
// (used for search/filter state so refresh and shared links keep it).
export function replaceQuery(params) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(params)) { if (v == null || v === '') url.searchParams.delete(k); else url.searchParams.set(k, v); }
  if (url.href === location.href) return;
  history.replaceState(history.state, '', url.href);
  lastPathSearch = url.pathname + url.search;
}
export function reload() { render({ restoreScroll: false, keepState: false }); }
export function currentUrl() { return new URL(location.href); }
export function onRouteChange(fn) { window.addEventListener('zs:route', fn); return () => window.removeEventListener('zs:route', fn); }

function saveScroll() { const k = currentKey(); if (k) scrollPos.set(k, window.scrollY); }

function scopedDocument(root) {
  return new Proxy(document, {
    get(t, p) {
      if (p === 'getElementById') return (id) => root.querySelector('#' + CSS.escape(id));
      if (p === 'querySelector') return (s) => root.querySelector(s);
      if (p === 'querySelectorAll') return (s) => root.querySelectorAll(s);
      const v = t[p];
      return typeof v === 'function' ? v.bind(t) : v;
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

function makeCtx(url, root, key, restoreScroll) {
  const timerIds = new Set();
  const channels = [];
  const cleanups = [];
  let alive = true;
  let readyDone = false;
  const supabase = createViewClient((ch) => channels.push(ch));
  const timers = {
    setTimeout(fn, ms, ...a) { const id = setTimeout(() => { timerIds.delete(id); fn(...a); }, ms); timerIds.add(id); return id; },
    setInterval(fn, ms, ...a) { const id = setInterval(fn, ms, ...a); timerIds.add(id); return id; },
  };
  const ready = () => {
    if (readyDone) return; readyDone = true;
    if (restoreScroll) { const y = scrollPos.get(key) || 0; requestAnimationFrame(() => window.scrollTo(0, y)); }
    else if (!url.hash) window.scrollTo(0, 0);
  };
  timers.setTimeout(ready, 700); // fallback for views that never call ready()
  return {
    root, url, params: url.searchParams, supabase, timers,
    document: scopedDocument(root),
    state: entryState.get(key) || entryState.set(key, {}).get(key),
    navigate, reload, ready, replaceQuery,
    isAlive: () => alive,
    onCleanup: (fn) => cleanups.push(fn),
    setTitle: (t) => { document.title = t; },
    _dispose() {
      alive = false;
      timerIds.forEach((id) => { clearTimeout(id); clearInterval(id); });
      cleanups.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
      channels.forEach((ch) => { try { supabase.removeChannel(ch); } catch { /* ignore */ } });
    },
  };
}

function loadCss(href) {
  return new Promise((resolve) => {
    if (!href) return resolve(null);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('../' + href, import.meta.url).href;
    link.dataset.zsView = '1';
    const done = () => resolve(link);
    link.onload = done; link.onerror = done;
    setTimeout(done, 4000);
    document.head.appendChild(link);
  });
}

function teardown() {
  if (!current) return;
  const c = current; current = null;
  try { if (typeof c.cleanup === 'function') c.cleanup(); } catch (e) { console.error(e); }
  c.ctx._dispose();
  c.link?.remove();
  c.root.remove();
}

function showMessage(kind, title, detail) {
  outlet.replaceChildren();
  const box = document.createElement('div');
  box.className = 'zs-state zs-state--' + kind;
  box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  const t = document.createElement('p'); t.className = 'zs-state-title'; t.textContent = title;
  box.append(t);
  if (detail) { const d = document.createElement('p'); d.className = 'zs-state-detail'; d.textContent = detail; box.append(d); }
  if (kind === 'error') {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'zs-btn'; b.textContent = 'Try again';
    b.addEventListener('click', () => reload());
    box.append(b);
  }
  outlet.append(box);
}

async function render({ restoreScroll, keepState = true } = {}) {
  const token = ++renderToken;
  const url = new URL(location.href);
  const loader = routeFor(url);
  if (!loader) { location.reload(); return; }
  if (!history.state?.key) history.replaceState({ key: newKey() }, '', location.href);
  const key = currentKey();
  if (!keepState) entryState.delete(key);

  teardown();
  outlet.setAttribute('aria-busy', 'true');
  const slow = setTimeout(() => { if (token === renderToken) showMessage('loading', 'Loading…'); }, 160);

  let mod;
  try { mod = await loader(); }
  catch (e) {
    clearTimeout(slow);
    if (token !== renderToken) return;
    console.error(e);
    showMessage('error', 'Could not load this page', 'Check your connection and try again.');
    outlet.setAttribute('aria-busy', 'false');
    return;
  }
  const link = await loadCss(mod.css);
  clearTimeout(slow);
  if (token !== renderToken) { link?.remove(); return; }

  outlet.replaceChildren();
  const root = document.createElement('div');
  root.className = 'zs-view-root';
  if (mod.markup) root.innerHTML = mod.markup;
  outlet.append(root);
  document.title = mod.title || document.title;

  const ctx = makeCtx(url, root, key, restoreScroll);
  current = { mod, link, root, ctx, cleanup: null };
  outlet.setAttribute('aria-busy', 'false');
  window.dispatchEvent(new CustomEvent('zs:route', { detail: { url } }));
  announce(document.title);

  try {
    const result = mod.mount(ctx);
    Promise.resolve(result).then((cleanup) => {
      if (current && current.ctx === ctx && typeof cleanup === 'function') current.cleanup = cleanup;
      else if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
    }).catch((e) => {
      if (!ctx.isAlive()) return;
      console.error(e);
      ctx.root.prepend(Object.assign(document.createElement('p'), { className: 'zs-inline-error', role: 'alert', textContent: 'Something went wrong loading this page. Please try again.' }));
    });
  } catch (e) {
    console.error(e);
    showMessage('error', 'Something went wrong', 'Please try again.');
  }
}

function onClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest?.('a[href]');
  if (!a || a.target === '_blank' || a.hasAttribute('download') || a.dataset.noRouter != null) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) return;
  const url = new URL(a.href, location.href);
  if (!isRoutable(url)) return;
  e.preventDefault();
  navigate(url.href);
}

export function startRouter({ outlet: el, announceFn }) {
  outlet = el;
  if (announceFn) announce = announceFn;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  document.addEventListener('click', onClick);
  window.addEventListener('popstate', () => {
    const now = location.pathname + location.search;
    if (now === lastPathSearch) { window.dispatchEvent(new Event('zs:hashchange')); return; }
    lastPathSearch = now;
    render({ restoreScroll: true });
  });
  render({ restoreScroll: false });
}
