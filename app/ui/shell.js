// App shell: header, mobile bottom navigation, routed outlet, persistent player host.
// The shell is created once per document and is never re-rendered on navigation.
import { h } from '../lib/dom.js';
import { icon } from './icons.js';
import { onRouteChange } from '../lib/router.js';

const NAV = [
  { href: 'browse.html', label: 'Browse', icon: 'browse', match: (u) => u.pathname.endsWith('/browse.html') && u.hash !== '#search' },
  { href: 'browse.html#search', label: 'Search', icon: 'search', match: (u) => u.pathname.endsWith('/browse.html') && u.hash === '#search' },
  { href: 'account.html', label: 'Library', icon: 'library', match: (u) => /\/(account|balance|my-uploads)\.html$/.test(u.pathname) },
  { href: 'upload.html', label: 'Upload', icon: 'upload', match: (u) => /\/upload\.html$/.test(u.pathname) },
];

export function buildShell(root) {
  const logo = new URL('../img/zami-logo-96.png', import.meta.url).href;
  const links = NAV.map((n) => {
    const a = h('a', { href: n.href, class: 'zs-nav-link' }, h('span', { class: 'zs-nav-ico' }), h('span', { class: 'zs-nav-label' }, n.label));
    a.firstChild.innerHTML = icon(n.icon, 24);
    return { n, a };
  });
  const account = h('a', { href: 'account.html', class: 'zs-account', 'aria-label': 'My account' });
  account.innerHTML = icon('user', 22);

  const header = h('header', { class: 'zs-header' },
    h('div', { class: 'zs-header-in' },
      h('a', { href: 'browse.html', class: 'zs-brand', 'aria-label': 'ZAMI home' },
        h('img', { src: logo, alt: '', width: 28, height: 28 }), h('span', null, 'ZAMI')),
      h('nav', { class: 'zs-topnav', 'aria-label': 'Primary' }, links.map(({ n }) => {
        const a = h('a', { href: n.href, class: 'zs-nav-link' }, h('span', { class: 'zs-nav-label' }, n.label));
        a.dataset.nav = n.href; return a;
      })),
      account));

  const bottom = h('nav', { class: 'zs-bottomnav', 'aria-label': 'Primary' }, links.map(({ n, a }) => { a.dataset.nav = n.href; return a; }));
  const outlet = h('main', { id: 'zs-view', class: 'zs-main', tabindex: -1 });
  const playerHost = h('div', { class: 'zs-player-host' });
  const live = h('div', { class: 'zs-sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const skip = h('a', { href: '#zs-view', class: 'zs-skip' }, 'Skip to content');
  skip.addEventListener('click', (e) => { e.preventDefault(); outlet.focus(); });

  root.replaceChildren(skip, header, outlet, playerHost, bottom, live);

  const setActive = () => {
    const u = new URL(location.href);
    const hit = NAV.find((n) => n.match(u));
    root.querySelectorAll('[data-nav]').forEach((a) => {
      const on = hit && a.dataset.nav === hit.href;
      a.classList.toggle('is-active', !!on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    
  };
  setActive();
  onRouteChange(setActive);
  window.addEventListener('zs:hashchange', setActive);
  window.addEventListener('popstate', setActive);

  let first = true;
  return {
    outlet, playerHost,
    announce(text) {
      live.textContent = '';
      setTimeout(() => { live.textContent = text; }, 50);
      if (first) { first = false; return; }
      outlet.focus({ preventScroll: true });
    },
  };
}
