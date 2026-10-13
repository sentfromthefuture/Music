// Browse / discovery. Same data and behaviour as the original browse.html (feed pagination,
// genre chips, title search, artist filter, featured artists, trending, top downloads, realtime),
// rebuilt on shared components + caching, with play buttons wired to the persistent player.
import { h, debounce } from '../lib/dom.js';
import * as api from '../lib/api.js';
import { loadFavorites } from '../lib/favorites.js';
import { loadPromo } from '../lib/promo.js';
import * as P from '../player/player.js';
import { MEDAL_DEFS } from '../ui/medals.js';
import { icon } from '../ui/icons.js';
import { itemCard, rankCard, artistChip, skeletonGrid, skeletonRail, wireGlobalSync, detailHref, coverEl } from '../ui/cards.js';
import { showToast } from '../ui/toast.js';
import { replaceQuery } from '../lib/router.js';

export const title = 'Browse — ZAMI';
export const css = 'css/views/browse.css';
export const markup = `${MEDAL_DEFS}
<div class="wrap">
  <div class="header-row"><h1>Browse</h1></div>
  <p class="sub">Tracks and beats from local artists.</p>

  <div class="search-wrap">
    <span class="search-ico" id="search-ico"></span>
    <input type="search" id="search-input" placeholder="Search tracks, beats, artists…" aria-label="Search tracks, beats, artists" autocomplete="off" enterkeyhint="search">
  </div>

  <div class="chips" id="genre-chips" role="group" aria-label="Genres">
    <button type="button" class="chip active" data-genre="all">All</button>
    <button type="button" class="chip" data-genre="new">New</button>
    <button type="button" class="chip" data-genre="Amapiano">Amapiano</button>
    <button type="button" class="chip" data-genre="Afrobeat">Afrobeat</button>
    <button type="button" class="chip" data-genre="Gospel">Gospel</button>
    <button type="button" class="chip" data-genre="Hip-hop">Hip-hop</button>
    <button type="button" class="chip" data-genre="Zed R&amp;B">Zed R&amp;B</button>
    <button type="button" class="chip" data-genre="Other">Other</button>
  </div>

  <div id="rails">
    <p class="section-title" style="margin:4px 0 10px;">🌟 Featured Artists</p>
    <div class="artist-strip" id="artist-strip" role="list"></div>

    <div id="recent-section" class="rail-hidden">
      <div class="rank-section-head"><p class="section-title">🕘 Recently played</p></div>
      <div class="rank-scroll" id="recent-list"></div>
    </div>

    <div class="rank-section-head rank-section-head--first">
      <p class="section-title">📈 Trending this week</p>
      <button type="button" class="see-all" data-target="trending-list">See all →</button>
    </div>
    <div class="rank-scroll" id="trending-list"></div>

    <div class="rank-section-head">
      <p class="section-title">🔥 Top Downloads</p>
      <button type="button" class="see-all" data-target="top-downloads-list">See all →</button>
    </div>
    <div class="rank-scroll" id="top-downloads-list"></div>
  </div>

  <div class="feed-head"><p class="section-title" id="feed-title">Latest music</p></div>
  <div id="artist-filter-pill"></div>
  <div class="grid" id="grid" aria-live="polite"></div>
  <button type="button" id="load-more-btn" class="hidden">Load more</button>
</div>`;

const RAIL_SKEL = 4;

export async function mount(ctx) {
  const { root, params, state, supabase } = ctx;
  const $ = (id) => root.querySelector('#' + id);
  const grid = $('grid'), loadMoreBtn = $('load-more-btn'), searchInput = $('search-input');
  const chips = $('genre-chips'), strip = $('artist-strip'), pill = $('artist-filter-pill');
  $('search-ico').innerHTML = icon('search', 20);
  wireGlobalSync();
  loadPromo();
  loadFavorites().catch(() => {});

  // ---- view state: survives back/forward (restored instantly, no refetch) ----
  let S = state.browse;
  const restored = !!S;
  if (!S) {
    S = state.browse = { genre: params.get('genre') || 'all', q: (params.get('q') || '').trim(), artistId: params.get('artist') || null, artistName: '', items: [], offset: 0, hasMore: true };
  }
  searchInput.value = S.q;
  const syncChips = () => chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.genre === S.genre));
  syncChips();
  const pushUrl = () => replaceQuery({ q: S.q || null, genre: S.genre !== 'all' ? S.genre : null, artist: S.artistId || null });
  const updateLayout = () => {
    $('rails').classList.toggle('rail-hidden', !!S.q);
    $('feed-title').textContent = S.q ? `Results for “${S.q}”` : S.genre === 'new' ? 'New this fortnight' : S.genre !== 'all' ? S.genre : 'Latest music';
  };

  // ---- feed ----
  let feedToken = 0;
  const list = () => S.items;
  function renderGrid() {
    grid.replaceChildren();
    if (!S.items.length) {
      grid.append(h('p', { class: 'empty-state' }, S.q || S.artistId ? 'No results found.' : 'Nothing here yet.'));
    } else {
      const frag = document.createDocumentFragment();
      for (const item of S.items) frag.append(itemCard(item, list));
      grid.append(frag);
    }
    loadMoreBtn.classList.toggle('hidden', !S.hasMore || !S.items.length);
    loadMoreBtn.disabled = false;
  }
  function renderFeedError(retry) {
    grid.replaceChildren(h('div', { class: 'state-box', role: 'alert' }, h('p', null, "Couldn't load music. Check your connection."), h('button', { type: 'button', class: 'zs-btn', onclick: retry }, 'Try again')));
    loadMoreBtn.classList.add('hidden');
  }
  async function loadFeed(reset) {
    const token = ++feedToken;
    if (reset) { S.offset = 0; S.items = []; S.hasMore = true; grid.replaceChildren(...skeletonGrid(8)); loadMoreBtn.classList.add('hidden'); }
    loadMoreBtn.disabled = true;
    try {
      const rows = await api.fetchFeedPageCached({ genre: S.genre, q: S.q, artistId: S.artistId, offset: S.offset }, reset ? 45_000 : 0);
      if (token !== feedToken || !ctx.isAlive()) return;
      S.items = reset ? rows : S.items.concat(rows);
      S.offset += api.PAGE_SIZE;
      S.hasMore = rows.length === api.PAGE_SIZE;
      renderGrid();
      ctx.ready();
    } catch (e) {
      if (token !== feedToken || !ctx.isAlive()) return;
      console.error(e);
      if (reset || !S.items.length) renderFeedError(() => loadFeed(true));
      else { showToast("Couldn't load more. Try again."); loadMoreBtn.disabled = false; }
    }
  }

  // ---- filters ----
  const runSearch = debounce(() => { loadFeed(true); }, 300);
  searchInput.addEventListener('input', () => { S.q = searchInput.value.trim(); updateLayout(); pushUrl(); runSearch(); });
  chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    S.genre = chip.dataset.genre; syncChips(); updateLayout(); pushUrl(); loadFeed(true);
  });
  loadMoreBtn.addEventListener('click', () => loadFeed(false));
  root.querySelectorAll('.see-all').forEach((btn) => btn.addEventListener('click', () => {
    const target = $(btn.dataset.target);
    if (target) target.scrollTo({ left: target.scrollWidth, behavior: 'smooth' });
  }));

  function setArtistFilter(id, name, { load = true } = {}) {
    S.artistId = id; S.artistName = name;
    strip.querySelectorAll('.artist-chip').forEach((c) => c.classList.toggle('active', c.dataset.artistId === id));
    pill.replaceChildren();
    if (id) {
      const clear = h('button', { type: 'button', id: 'clear-artist-btn', 'aria-label': 'Clear artist filter' }, '✕');
      clear.addEventListener('click', () => setArtistFilter(null, ''));
      pill.append(h('div', { class: 'filter-pill' }, `Filtering by ${name} `,
        h('a', { href: `artist.html?id=${encodeURIComponent(id)}`, style: { color: 'var(--accent)', fontWeight: '700', textDecoration: 'none' } }, 'View profile'), clear));
    }
    pushUrl();
    if (load) loadFeed(true);
  }

  // ---- rails ----
  const railMsg = (el, text, retry) => el.replaceChildren(h('p', { class: 'empty-state' }, text, retry ? ' ' : '', retry ? h('button', { type: 'button', class: 'see-all', onclick: retry }, 'Retry') : null));
  async function loadFeatured() {
    strip.replaceChildren(h('p', { style: { fontSize: '12px', color: 'var(--ink-muted)' } }, 'Loading…'));
    try {
      const artists = await api.fetchFeaturedArtists();
      if (!ctx.isAlive()) return;
      strip.replaceChildren();
      if (!artists.length) { strip.append(h('p', { style: { fontSize: '12px', color: 'var(--ink-muted)' } }, 'No artists yet.')); return; }
      artists.forEach((a) => strip.append(artistChip(a, (art) => setArtistFilter(S.artistId === art.id ? null : art.id, art.name), S.artistId === a.id)));
      if (S.artistId && !S.artistName) { S.artistName = api.artistName(S.artistId); if (S.artistName) setArtistFilter(S.artistId, S.artistName, { load: false }); }
    } catch (e) { console.error(e); if (ctx.isAlive()) strip.replaceChildren(h('p', { style: { fontSize: '12px', color: 'var(--ink-muted)' } }, "Couldn't load artists.")); }
  }
  async function loadRank(fetcher, el, emptyText) {
    if (!el.children.length) el.replaceChildren(...skeletonRail(RAIL_SKEL));
    try {
      const entries = await fetcher();
      if (!ctx.isAlive()) return;
      if (!entries.length) { railMsg(el, emptyText); return; }
      const items = entries.map((e) => e.item);
      el.replaceChildren(...entries.map((e) => rankCard(e.item, e.rank, e.label, e.trend, () => items)));
    } catch (e) { console.error(e); if (ctx.isAlive()) railMsg(el, "Couldn't load this.", () => loadRank(fetcher, el, emptyText)); }
  }
  const loadTrending = () => loadRank(api.fetchTrending, $('trending-list'), 'Nothing trending yet.');
  const loadTop = () => loadRank(api.fetchTopDownloads, $('top-downloads-list'), 'Nothing yet.');

  // Recently played (from the shared player history)
  let recentSig = '';
  function renderRecent() {
    const recent = P.state.get().recent;
    const sig = recent.map((r) => r.key).join('|');
    if (sig === recentSig) return; recentSig = sig;
    $('recent-section').classList.toggle('rail-hidden', !recent.length);
    const tracks = recent.map((r) => ({ ...r }));
    $('recent-list').replaceChildren(...recent.map((r, i) => {
      const play = h('button', { type: 'button', class: 'zs-playbtn zs-playbtn--card', 'aria-label': `Play ${r.title}`, onclick: () => P.playQueue(tracks, i) });
      play.innerHTML = icon('play', 22);
      return h('article', { class: 'zs-card zs-card--rail' },
        h('div', { class: 'zs-card-media' }, h('a', { class: 'zs-card-cover-link', href: detailHref({ item_type: r.type, id: r.id }), tabindex: -1, 'aria-hidden': 'true' }, coverEl(r.cover, r.type)), play),
        h('a', { class: 'zs-card-link', href: detailHref({ item_type: r.type, id: r.id }) }, h('div', { class: 'zs-card-info' }, h('p', { class: 'zs-card-title' }, r.title), h('p', { class: 'zs-card-artist' }, r.artist || ''))));
    }));
  }
  renderRecent();
  ctx.onCleanup(P.state.subscribe(renderRecent));

  // ---- realtime (same rules as before) ----
  const refreshTop = debounce(() => { api.invalidateTopDownloads(); loadTop(); }, 1500);
  ctx.onCleanup(() => refreshTop.cancel());
  async function onRealtime(itemType, payload) {
    refreshTop();
    api.invalidateFeed();
    if (payload.eventType === 'DELETE') {
      const oldId = payload.old?.id;
      S.items = S.items.filter((i) => !(i.item_type === itemType && i.id === oldId));
      renderGrid(); return;
    }
    const row = payload.new;
    if (!row || row.status !== 'approved') return;
    const idx = S.items.findIndex((i) => i.item_type === itemType && i.id === row.id);
    if (idx !== -1) { S.items[idx] = { ...S.items[idx], ...row }; renderGrid(); return; }
    const isDefaultView = (S.genre === 'all' || S.genre === 'new') && !S.q && !S.artistId;
    if (isDefaultView) {
      await api.ensureNames([row.owner_id]);
      if (!ctx.isAlive()) return;
      S.items = [{ ...row, item_type: itemType, artistName: api.artistName(row.owner_id) }, ...S.items];
      renderGrid();
    }
  }
  supabase.channel('browse-tracks').on('postgres_changes', { event: '*', schema: 'public', table: 'tracks' }, (p) => onRealtime('track', p)).subscribe();
  supabase.channel('browse-beats').on('postgres_changes', { event: '*', schema: 'public', table: 'beats' }, (p) => onRealtime('beat', p)).subscribe();

  // ---- "Search" nav shortcut (#search) ----
  const focusSearch = () => { if (location.hash === '#search') { searchInput.focus(); searchInput.scrollIntoView({ block: 'center', behavior: 'smooth' }); } };
  window.addEventListener('zs:hashchange', focusSearch);
  ctx.onCleanup(() => window.removeEventListener('zs:hashchange', focusSearch));

  // ---- go ----
  updateLayout();
  if (S.artistId) { await api.ensureNames([S.artistId]).catch(() => {}); S.artistName = api.artistName(S.artistId); if (S.artistName) setArtistFilter(S.artistId, S.artistName, { load: false }); }
  loadFeatured(); loadTrending(); loadTop();
  if (restored && S.items.length) { renderGrid(); ctx.ready(); } else loadFeed(true);
  focusSearch();
}
