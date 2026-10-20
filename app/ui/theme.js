// Light/dark theme. The choice is stored in localStorage ('zami-theme'); with no stored choice the
// site follows the device setting. Pages set <html data-theme> from a tiny inline snippet in <head>
// (so there is no flash of the wrong theme); this module only handles the toggle and live OS changes.
const KEY = 'zami-theme';
const root = document.documentElement;
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function stored() {
  try { const v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : null; } catch { return null; }
}
function apply(t) {
  root.setAttribute('data-theme', t);
  window.dispatchEvent(new CustomEvent('zs:theme', { detail: t }));
}

export function currentTheme() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, next); } catch { /* storage blocked: still switch for this visit */ }
  apply(next);
  return next;
}

// Follow the device setting live, but only while the visitor hasn't picked a theme themselves.
if (mq && mq.addEventListener) {
  mq.addEventListener('change', (e) => { if (!stored()) apply(e.matches ? 'dark' : 'light'); });
}
