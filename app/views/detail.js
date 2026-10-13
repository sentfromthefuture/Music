// Track / beat detail. Same behaviour as the original detail.html (buy, free download + counters,
// favourites, share poster, play counting) with playback delegated to the persistent player.
import { h } from '../lib/dom.js';
import { supabase, getUser } from '../lib/supabase.js';
import * as api from '../lib/api.js';
import * as P from '../player/player.js';
import { loadFavorites } from '../lib/favorites.js';
import { loadPromo } from '../lib/promo.js';
import { loadScriptOnce } from '../lib/dom.js';
import { readTiers, termsFor, loadCssOnce } from '../lib/licenses.js';
import { icon } from '../ui/icons.js';
import { coverEl, heartButton, itemCard, countLabel, wireGlobalSync } from '../ui/cards.js';
import { createWaveform } from '../ui/waveform.js';

export const title = 'ZAMI';
export const css = 'css/views/detail.css';
export const markup = `<div class="wrap">
  <div class="header-row">
    <a href="browse.html" class="back" aria-label="Back to Browse">←</a>
  </div>
  <div id="loading" class="gate-msg" role="status">Loading…</div>
  <div id="content" class="hidden"></div>
</div>`;

const SHARE_BASE = 'https://sentfromthefuture.github.io/Music/';

// Builds a safe "Track Title.mp3" filename for Supabase's `download` option (same rule as before).
function downloadFilename(t, storagePath) {
  const ext = (storagePath.split('.').pop() || 'mp3').toLowerCase();
  const safeTitle = (t || 'track').replace(/[\\/:*?"<>|]/g, '').trim();
  return `${safeTitle}.${ext}`;
}

export async function mount(ctx) {
  const { root, params } = ctx;
  const $ = (id) => root.querySelector('#' + id);
  const loading = $('loading'), content = $('content');
  wireGlobalSync(); loadPromo();

  const itemType = params.get('type'); const itemId = params.get('id');
  if (!itemType || !itemId || !['track', 'beat'].includes(itemType)) { loading.textContent = 'Invalid or missing item.'; ctx.ready(); return; }

  let item;
  try { item = await api.fetchItem(itemType, itemId); }
  catch (e) {
    console.error(e);
    loading.replaceChildren(h('p', null, "Couldn't load this item. Check your connection."), h('button', { type: 'button', class: 'zs-btn', onclick: () => ctx.reload() }, 'Try again'));
    ctx.ready(); return;
  }
  if (!ctx.isAlive()) return;
  if (!item) { loading.textContent = 'This item is not available.'; ctx.ready(); return; }

  const artistName = api.artistName(item.owner_id) || await api.fetchProfileName(item.owner_id);
  if (!ctx.isAlive()) return;
  ctx.setTitle(`${item.title} · ${artistName} — ZAMI`);

  const isFreeTrack = itemType === 'track' && item.is_free;
  const row = { ...item, item_type: itemType, artistName };
  const track = P.trackFromRow(row, artistName);

  // ---- layout ----
  const heart = heartButton(row, 'zs-heart--cover');
  const cover = h('div', { class: 'cover-frame' }, h('div', { class: 'cover' }, coverEl(item.cover_url, itemType, 'cover-art'), heart));
  const meta = h('p', { class: 'meta' },
    h('a', { href: `artist.html?id=${encodeURIComponent(item.owner_id)}`, class: 'artist-link' }, artistName),
    ` · ${item.genre || ''}${itemType === 'beat' ? ' · Beat' : ''}`);
  const info = [h('h1', { class: 'title' }, item.title), meta, h('p', { class: 'meta counts' }, countLabel(row))];

  // ---- player block (only when something is streamable, same rule as before) ----
  let playerBlock = null, wf = null;
  const playSrc = isFreeTrack ? supabase.storage.from('public-previews').getPublicUrl(item.file_path).data.publicUrl
    : item.preview_path ? supabase.storage.from('public-previews').getPublicUrl(item.preview_path).data.publicUrl : null;
  if (playSrc) {
    track.src = playSrc;
    const playBtn = h('button', { type: 'button', class: 'zs-playbtn play-btn', dataset: { playKey: track.key } });
    playBtn.innerHTML = icon('play', 30);
    playBtn.addEventListener('click', () => (P.isCurrent(track.key) ? P.toggle() : P.playTrack(track)));
    wf = createWaveform({ track, src: playSrc });
    ctx.onCleanup(() => wf.destroy());
    playerBlock = h('div', { class: 'player-block' }, wf.el, playBtn);
  }

  // ---- price + action row ----
  const price = h('p', { class: 'price' + (isFreeTrack ? ' free' : '') }, isFreeTrack ? 'Free' : `K${item.price}`);
  const actionBtn = h('a', { class: 'action-btn', href: '#' });
  if (isFreeTrack) {
    const filename = downloadFilename(item.title, item.file_path);
    actionBtn.textContent = 'Download';
    actionBtn.href = supabase.storage.from('public-previews').getPublicUrl(item.file_path, { download: filename }).data.publicUrl;
    actionBtn.addEventListener('click', async () => {
      const { data: { user } } = await getUser();
      supabase.from('downloads').insert({ user_id: user ? user.id : null, track_id: item.id }).then(() => {});
      supabase.rpc('increment_download_count', { p_track_id: item.id }).then(() => {});
    });
  } else {
    actionBtn.textContent = 'Buy';
    actionBtn.href = `checkout.html?type=${itemType}&id=${item.id}`;
  }
  // ---- beat license tiers (only when the beat has them; older beats keep the single Buy button) ----
  const tiers = itemType === 'beat' ? readTiers(item) : null;
  let tiersBlock = null;
  if (tiers) {
    loadCssOnce('app/css/licensing.css');
    const list = h('div', { class: 'lic-tiers' }, ...tiers.map((t) => h('a', { class: 'lic-tier', href: `checkout.html?type=beat&id=${encodeURIComponent(item.id)}&tier=${t.key}` },
      h('span', { class: 'lic-tier-main' }, h('span', { class: 'lic-tier-name' }, t.label), h('span', { class: 'lic-tier-blurb' }, t.blurb)),
      h('span', { class: 'lic-tier-price' }, `K${t.price}`), h('span', { class: 'lic-tier-buy' }, 'Buy'))));
    const terms = h('details', { class: 'lic-terms' }, h('summary', null, 'What each license includes'),
      ...tiers.flatMap((t) => [h('h4', null, t.label), h('ul', null, ...termsFor(t.key, artistName, t.extras).map((x) => h('li', null, x)))]),
      h('p', { class: 'lic-note' }, 'You get a license image with a verifiable ID after your payment is approved. This is a plain-language summary of the terms.'));
    tiersBlock = h('div', null, list, terms);
  }
  const shareBtn = h('button', { type: 'button', class: 'share-btn', 'aria-label': 'Share' });
  shareBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg> Share';
  shareBtn.addEventListener('click', async () => {
    try {
      await loadScriptOnce(new URL('../../zami-share.js', import.meta.url).href);
      window.ZamiShare.config.baseUrl = SHARE_BASE;
      window.ZamiShare.open(window.ZamiShare.songFromItem(item, { type: itemType, artistName }));
    } catch (e) { console.error(e); alert("Couldn't open sharing. Check your connection and try again."); }
  });

  content.replaceChildren(
    h('div', { class: 'detail-grid' }, cover,
      h('div', { class: 'detail-main' }, ...info, playerBlock, tiersBlock || price, h('div', { class: 'action-row' }, ...(tiersBlock ? [] : [actionBtn]), shareBtn))),
    h('section', { class: 'more', id: 'more', hidden: true }));
  loading.classList.add('hidden'); content.classList.remove('hidden');
  ctx.ready();
  loadFavorites().catch(() => {});

  // ---- more from this artist (same browse_feed query the artist page uses) ----
  try {
    const { data } = await supabase.from('browse_feed').select('*').eq('owner_id', item.owner_id).order('created_at', { ascending: false }).limit(9);
    if (!ctx.isAlive()) return;
    const others = (data || []).filter((i) => !(i.item_type === itemType && String(i.id) === String(item.id))).slice(0, 8).map((i) => ({ ...i, artistName }));
    if (others.length) {
      const more = $('more'); more.hidden = false;
      more.append(h('h2', { class: 'more-h' }, `More from ${artistName}`), h('div', { class: 'grid' }, ...others.map((i) => itemCard(i, () => others))));
    }
  } catch { /* optional section */ }
}
