let host;
export function showToast(message, { ms = 3500 } = {}) {
  if (!host) {
    host = document.createElement('div');
    host.className = 'zs-toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = 'zs-toast';
  t.textContent = message;
  host.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
