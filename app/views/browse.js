// Browse / discovery. Same data and behaviour as the original browse.html (feed pagination,
// genre chips, title search, artist filter, featured artists, trending, top downloads, realtime),
// rebuilt on shared components + caching, with play buttons wired to the persistent player.
import { h, debounce, safeUrl } from '../lib/dom.js';
import * as api from '../lib/api.js';
import { loadFavorites } from '../lib/favorites.js';
import { loadPromo } from '../lib/promo.js';
import * as P from '../player/player.js';
import { MEDAL_DEFS } from '../ui/medals.js';
import { icon } from '../ui/icons.js';
import { itemCard, rankCard, artistChip, skeletonGrid, skeletonRail, wireGlobalSync, detailHref, coverEl, playButton, isPlayable } from '../ui/cards.js';
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
    <section id="featured-banner" class="fbanner rail-hidden" aria-label="Featured music">
      <div class="fbanner-track" id="fbanner-track"></div>
      <div class="fbanner-dots" id="fbanner-dots" role="tablist" aria-label="Featured tracks"></div>
    </section>

    <p class="section-title" style="margin:4px 0 10px;">🌟 Featured Artists</p>
    <div class="artist-strip" id="artist-strip" role="list"></div>

    <div class="rank-section-head rank-section-head--first">
      <p class="section-title">📈 Trending Now</p>
      <button type="button" class="see-all" id="trending-more" hidden>See all →</button>
    </div>
    <div class="trend-list" id="trending-list"></div>

    <div id="recent-section" class="rail-hidden">
      <div class="rank-section-head"><p class="section-title">🕘 Recently played</p></div>
      <div class="rank-scroll" id="recent-list"></div>
    </div>

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

const itemArtist = (item) => item.artistName || api.artistName(item.owner_id) || '';

// One compact Trending Now row: rank, square cover, title/artist, play/pause (shared player button).
function trendRow(item, rank, label, getList) {
  const href = detailHref(item);
  return h('article', { class: 'trend-row' },
    h('span', { class: 'trend-rank', 'aria-label': `Rank ${rank}` }, String(rank)),
    h('a', { class: 'trend-art', href, tabindex: -1, 'aria-hidden': 'true' }, coverEl(item.cover_url, item.item_type, 'trend-cover')),
    h('a', { class: 'trend-info', href },
      h('p', { class: 'trend-title' }, item.title),
      h('p', { class: 'trend-artist' }, [itemArtist(item), label].filter(Boolean).join(' · '))),
    isPlayable(item) ? playButton(item, getList, 'zs-playbtn--trend') : null);
}


// Banner backdrop drawn on an HTML canvas: the release's own cover, blurred and tinted with the ZAMI
// blue gradient, plus soft shapes and equaliser bars. Pixels are never read back, so it also works
// when the image host sends no CORS headers (falls back to a plain gradient if the image fails).
function bannerCanvas(item) {
  const W = 720, H = 260;
  const cv = h('canvas', { class: 'fbanner-bg', width: W, height: H, 'aria-hidden': 'true' });
  const ctx2 = cv.getContext('2d');
  const paint = (img) => {
    const g = ctx2.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0d3f8f'); g.addColorStop(1, '#1e6feb');
    ctx2.fillStyle = g; ctx2.fillRect(0, 0, W, H);
    if (img) {
      const r = Math.max(W / img.width, H / img.height) * 1.2, w = img.width * r, hh = img.height * r;
      ctx2.save(); ctx2.filter = 'blur(18px)'; ctx2.globalAlpha = 0.55;
      ctx2.drawImage(img, (W - w) / 2, (H - hh) / 2, w, hh); ctx2.restore();
      const t = ctx2.createLinearGradient(0, 0, W, 0);
      t.addColorStop(0, 'rgba(13,63,143,.85)'); t.addColorStop(1, 'rgba(30,111,235,.55)');
      ctx2.fillStyle = t; ctx2.fillRect(0, 0, W, H);
    }
    ctx2.fillStyle = 'rgba(255,255,255,.07)';
    ctx2.beginPath(); ctx2.arc(W * 0.86, H * 0.1, 150, 0, Math.PI * 2); ctx2.fill();
    ctx2.beginPath(); ctx2.arc(W * 0.62, H * 1.05, 110, 0, Math.PI * 2); ctx2.fill();
    ctx2.fillStyle = 'rgba(255,255,255,.12)';
    const bars = 22, bw = 9, gap = 7;
    for (let i = 0; i < bars; i++) {
      const bh = 14 + Math.abs(Math.sin(i * 0.9 + 1)) * 46 + (i % 3) * 6;
      ctx2.fillRect(W - 24 - (bars - i) * (bw + gap) + 130, H - 16 - bh, bw, bh);
    }
  };
  paint(null);
  const src = safeUrl(item.cover_url);
  if (src) {
    const load = (cors) => {
      const img = new Image(); if (cors) img.crossOrigin = 'anonymous';
      img.onload = () => paint(img);
      img.onerror = () => { if (cors) load(false); };
      img.src = src;
    };
    load(true);
  }
  return cv;
}

function bannerSlide(item, i, n, getList) {
  const href = detailHref(item);
  const meta = [item.genre, item.item_type === 'beat' ? 'Beat' : null].filter(Boolean).join(' · ');
  return h('article', { class: 'fbanner-slide', 'aria-label': `${i + 1} of ${n}` },
    bannerCanvas(item),
    h('a', { class: 'fbanner-art', href, tabindex: -1, 'aria-hidden': 'true' }, coverEl(item.cover_url, item.item_type, 'fbanner-cover')),
    h('div', { class: 'fbanner-info' },
      h('span', { class: 'fbanner-badge' }, 'New release'),
      h('a', { class: 'fbanner-title', href }, item.title),
      h('p', { class: 'fbanner-artist' }, itemArtist(item)),
      meta ? h('p', { class: 'fbanner-meta' }, meta) : null),
    playButton(item, getList, 'zs-playbtn--banner'));
}

export async function mount(ctx) {
  const { root, params, state, supabase } = ctx;
  const $ = (id) => root.querySelector('#' + id);
  const grid = $('grid'), loadMoreBtn = $('load-more-btn'), searchInput = $('search-input');
  let loadMoreObserver = null; // auto-loads the next page as the user nears the bottom (button stays as a fallback)
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
      // re-check whether the end of the list is already in view (tall screens) so the next page can follow
      if (loadMoreObserver && S.hasMore) { loadMoreObserver.unobserve(loadMoreBtn); loadMoreObserver.observe(loadMoreBtn); }
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
  if ('IntersectionObserver' in window) {
    loadMoreObserver = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting) && S.hasMore && !loadMoreBtn.disabled && !loadMoreBtn.classList.contains('hidden')) loadFeed(false);
    }, { rootMargin: '300px 0px' });
    loadMoreObserver.observe(loadMoreBtn);
    ctx.onCleanup(() => loadMoreObserver.disconnect());
  }
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
  // Trending Now: the same real "this week" ranking as before (downloads + fulfilled purchases),
  // shown as a compact playable list. No numbers are invented; the label is the real count.
  const TREND_SHORT = 5;
  let trendEntries = [], trendExpanded = false;
  function renderTrending() {
    const el = $('trending-list'), more = $('trending-more');
    if (!trendEntries.length) { railMsg(el, 'Nothing trending yet.'); more.hidden = true; return; }
    const shown = trendExpanded ? trendEntries : trendEntries.slice(0, TREND_SHORT);
    const items = shown.map((e) => e.item);
    el.replaceChildren(...shown.map((e) => trendRow(e.item, e.rank, e.label, () => items)));
    more.hidden = trendEntries.length <= TREND_SHORT;
    more.textContent = trendExpanded ? 'Show less' : 'See all →';
  }
  async function loadTrending() {
    const el = $('trending-list');
    if (!el.children.length) el.replaceChildren(...Array.from({ length: 4 }, () => h('div', { class: 'trend-row trend-row--skel zs-skel', 'aria-hidden': 'true' })));
    try {
      trendEntries = await api.fetchTrending();
      if (!ctx.isAlive()) return;
      renderTrending();
    } catch (e) { console.error(e); if (ctx.isAlive()) railMsg(el, "Couldn't load this.", loadTrending); }
  }
  $('trending-more').addEventListener('click', () => { trendExpanded = !trendExpanded; renderTrending(); });

  // Featured banner: the newest playable releases from the default feed (same cached request as the
  // feed below, so no extra fetch). Uses the shared play button, so it drives the one persistent player.
  async function loadBanner() {
    try {
      const rows = await api.fetchFeedPageCached({ genre: 'all', q: '', artistId: null, offset: 0 }, 45_000);
      if (!ctx.isAlive()) return;
      const picks = rows.filter(isPlayable).slice(0, 3);
      const section = $('featured-banner');
      if (!picks.length) { section.classList.add('rail-hidden'); return; }
      section.classList.remove('rail-hidden');
      const trackEl = $('fbanner-track'), dots = $('fbanner-dots');
      trackEl.replaceChildren(...picks.map((item, i) => bannerSlide(item, i, picks.length, () => picks)));
      dots.replaceChildren(...picks.map((_, i) => h('span', { class: 'fbanner-dot' + (i === 0 ? ' active' : ''), 'aria-hidden': 'true' })));
      dots.classList.toggle('rail-hidden', picks.length < 2);
      trackEl.onscroll = () => {
        const i = Math.round(trackEl.scrollLeft / Math.max(1, trackEl.clientWidth));
        [...dots.children].forEach((d, k) => d.classList.toggle('active', k === i));
      };
    } catch (e) { console.error(e); }
  }
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
  loadFeatured(); loadBanner(); loadTrending(); loadTop();
  if (restored && S.items.length) { renderGrid(); ctx.ready(); } else loadFeed(true);
  focusSearch();
}
