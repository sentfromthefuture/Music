// Reusable music UI components. All DOM is built with textContent/properties, never innerHTML with
// user-generated strings. Play buttons talk to the single shared player.
import { h, safeUrl } from '../lib/dom.js';
import { icon } from './icons.js';
import * as P from '../player/player.js';
import { isFav, toggleFav, onFavChange } from '../lib/favorites.js';
import { nameMap } from '../lib/api.js';

export const priceLabel = (item) => (item.item_type === 'track' && item.is_free ? 'Free' : `K${item.price}`);
export const countLabel = (item) => (item.item_type === 'track' && item.is_free
  ? `${item.download_count || 0} downloads`
  : `${item.play_count || 0} plays · ${item.purchase_count || 0} buys`);
export const detailHref = (item) => `detail.html?type=${encodeURIComponent(item.item_type)}&id=${encodeURIComponent(item.id)}`;
const nameOf = (item) => item.artistName || nameMap.get(item.owner_id) || '';

// A row is "playable" when it has an audio path we are allowed to stream. When the feed row
// doesn't carry path columns at all we can't tell, so the player resolves it lazily on click.
export function isPlayable(item) {
  const known = 'file_path' in item || 'preview_path' in item;
  if (!known) return true;
  const free = item.item_type === 'track' && item.is_free;
  return !!(free ? item.file_path : item.preview_path);
}

export function coverEl(url, type, cls = 'zs-cardcover') {
  const wrap = h('div', { class: cls });
  const src = safeUrl(url);
  const glyph = () => { wrap.append(h('span', { class: 'zs-cardcover-glyph', 'aria-hidden': 'true' }, type === 'beat' ? '♫' : '♪')); };
  if (src) {
    const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async', width: 300, height: 300 });
    img.addEventListener('error', () => { img.remove(); glyph(); });
    wrap.append(img);
  } else glyph();
  return wrap;
}

// Play from a list: builds the queue from every playable item in that list.
export function playFromList(items, item) {
  const playable = items.filter(isPlayable);
  const idx = playable.findIndex((i) => i.item_type === item.item_type && i.id === item.id);
  if (idx < 0) return;
  P.playQueue(playable.map((i) => P.trackFromRow(i, nameOf(i))), idx);
}

function playButton(item, getList, cls) {
  const key = `${item.item_type}-${item.id}`;
  const b = h('button', { type: 'button', class: `zs-playbtn ${cls || ''}`, dataset: { playKey: key } });
  b.innerHTML = icon('play', 22);
  b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); playFromList(getList(), item); });
  syncPlayButton(b);
  return b;
}
export function heartButton(item, cls = '') {
  const b = h('button', { type: 'button', class: `zs-heart ${cls}`, dataset: { favKey: `${item.item_type}-${item.id}` } });
  const sync = () => {
    const on = isFav(item.item_type, item.id);
    b.textContent = on ? '♥' : '♡';
    b.classList.toggle('favorited', on);
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? `Remove ${item.title} from favourites` : `Add ${item.title} to favourites`);
  };
  b.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation();
    b.disabled = true; await toggleFav(item.item_type, item.id); b.disabled = false; sync();
  });
  sync();
  return b;
}

export function itemCard(item, getList) {
  const art = nameOf(item);
  const media = h('div', { class: 'zs-card-media' },
    h('a', { class: 'zs-card-cover-link', href: detailHref(item), tabindex: -1, 'aria-hidden': 'true' }, coverEl(item.cover_url, item.item_type)),
    heartButton(item, 'zs-heart--card'),
    isPlayable(item) ? playButton(item, getList, 'zs-playbtn--card') : null);
  const info = h('a', { class: 'zs-card-link', href: detailHref(item) },
    h('div', { class: 'zs-card-info' },
      h('p', { class: 'zs-card-title' }, item.title),
      h('p', { class: 'zs-card-artist' }, art),
      h('p', { class: 'zs-card-price' }, priceLabel(item)),
      h('p', { class: 'zs-card-count' }, countLabel(item))));
  return h('article', { class: 'zs-card' }, media, info);
}

// Rank card keeps the original medal/rank markup + classes so the existing medal styling applies.
export function rankCard(item, rank, label, trend, getList) {
  const medal = rank >= 1 && rank <= 3;
  const art = nameOf(item);
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '–';
  const thumb = h('div', { class: 'rank-card-thumb' }, coverEl(item.cover_url, item.item_type, 'rank-card-art'),
    medal ? null : h('span', { class: 'rank-card-badge' }, String(rank)),
    isPlayable(item) ? playButton(item, getList, 'zs-playbtn--rank') : null);
  const body = h('div', { class: 'rank-card-body' }, thumb);
  const link = h('a', { class: 'rank-card-link', href: detailHref(item) },
    h('div', { class: 'rank-card-info' },
      h('p', { class: 'rank-card-title' }, item.title),
      h('p', { class: 'rank-card-artist' }, art),
      h('div', { class: 'rank-card-stat-row' },
        h('span', { class: `rank-stat-icon trend-${trend}`, 'aria-label': `Rank ${trend === 'up' ? 'moved up' : trend === 'down' ? 'moved down' : 'unchanged'}` }, arrow),
        h('p', { class: 'rank-card-stat' }, label))));
  body.append(link);
  const card = h('div', { class: medal ? `rank-card medal-${rank}` : 'rank-card' }, body);
  if (medal) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'rank-medal-badge'); s.setAttribute('viewBox', '0 0 48 56'); s.setAttribute('aria-hidden', 'true'); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', `#medal-badge-${rank}`); s.append(u); card.prepend(s); }
  return card;
}

export function artistChip(artist, onPick, active) {
  const b = h('button', { type: 'button', class: 'artist-chip' + (active ? ' active' : ''), dataset: { artistId: artist.id }, onclick: () => onPick(artist) },
    h('div', { class: 'artist-avatar' }, artist.name.slice(0, 2).toUpperCase()), h('span', { class: 'artist-name' }, artist.name));
  return b;
}

export function skeletonGrid(n = 8) {
  return Array.from({ length: n }, () => h('div', { class: 'zs-card zs-card--skel', 'aria-hidden': 'true' },
    h('div', { class: 'zs-cardcover zs-skel' }), h('div', { class: 'zs-card-info' }, h('div', { class: 'zs-skel', style: { height: '12px', width: '80%', marginBottom: '8px' } }), h('div', { class: 'zs-skel', style: { height: '10px', width: '50%' } }))));
}
export function skeletonRail(n = 4) {
  return Array.from({ length: n }, () => h('div', { class: 'zs-rail-skel zs-skel', 'aria-hidden': 'true' }));
}

// ---- keep every play/heart button in sync with the shared stores ----
function syncPlayButton(b) {
  const s = P.state.get();
  const mine = s.current?.key === b.dataset.playKey;
  const active = mine && (s.status === 'playing' || s.status === 'buffering' || s.status === 'loading');
  b.classList.toggle('is-active', mine);
  b.innerHTML = icon(active ? 'pause' : 'play', 22);
  b.setAttribute('aria-label', active ? 'Pause' : 'Play');
  b.setAttribute('aria-pressed', String(active));
}
let wired = false;
export function wireGlobalSync() {
  if (wired) return; wired = true;
  P.state.subscribe(() => document.querySelectorAll('[data-play-key]').forEach(syncPlayButton));
  onFavChange(() => document.querySelectorAll('[data-fav-key]').forEach((b) => {
    const [type, ...rest] = b.dataset.favKey.split('-'); const id = rest.join('-');
    const on = isFav(type, id); b.textContent = on ? '♥' : '♡'; b.classList.toggle('favorited', on); b.setAttribute('aria-pressed', String(on));
  }));
}
