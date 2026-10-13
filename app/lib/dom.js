// Small DOM helpers. Views build DOM with h() / textContent so user-generated strings are never
// parsed as HTML.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && k !== 'list' && k !== 'form') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// Only allow http(s) image/audio URLs (blocks javascript:, data: html, etc.). Returns '' if unsafe.
export function safeUrl(u) {
  if (!u || typeof u !== 'string') return '';
  try {
    const parsed = new URL(u, location.href);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
  } catch { return ''; }
}

export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

const scriptPromises = new Map();
export function loadScriptOnce(src) {
  if (!scriptPromises.has(src)) {
    scriptPromises.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { scriptPromises.delete(src); reject(new Error(`Failed to load ${src}`)); };
      document.head.appendChild(s);
    }));
  }
  return scriptPromises.get(src);
}
