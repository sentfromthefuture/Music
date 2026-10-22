// Artist profile. Same data, follow/favourite behaviour and messages as the original artist.html.
import { revealList } from '../ui/paging.js';
import { h } from '../lib/dom.js';
import { supabase, getUser } from '../lib/supabase.js';
import { loadFavorites } from '../lib/favorites.js';
import * as P from '../player/player.js';
import { icon } from '../ui/icons.js';
import { shareArtist } from '../ui/share-link.js';
import { itemCard, isPlayable, wireGlobalSync, skeletonGrid, playFromList } from '../ui/cards.js';
import { nameMap } from '../lib/api.js';

export const title = 'Artist — ZAMI';
export const css = 'css/views/artist.css';
export const markup = `<div class="wrap">
  <div class="header-row">
    <a href="browse.html" id="back-link" aria-label="Back to Browse">←</a>
    <h1>Artist</h1>
  </div>
  <div class="profile-card" id="profile-card"><p class="loading-state">Loading…</p></div>
  <p class="section-title">Tracks &amp; Beats</p>
  <div class="grid" id="grid"></div>
</div>`;

export async function mount(ctx) {
  const { root, params, navigate } = ctx;
  const $ = (id) => root.querySelector('#' + id);
  const profileCard = $('profile-card'), grid = $('grid');
  wireGlobalSync();
  grid.replaceChildren(...skeletonGrid(5));
  const artistId = params.get('id');

  const missing = () => { profileCard.replaceChildren(h('p', { class: 'empty-state' }, 'Artist not found.')); grid.replaceChildren(); ctx.ready(); };
  if (!artistId) { missing(); return; }

  let currentUserId = null, isFollowing = false;
  const { data: { user } } = await getUser();
  if (user) {
    currentUserId = user.id;
    const [, { data: followRow }] = await Promise.all([
      loadFavorites().catch(() => {}),
      supabase.from('follows').select('artist_id').eq('follower_id', user.id).eq('artist_id', artistId).maybeSingle(),
    ]);
    isFollowing = !!followRow;
  }

  let profile, items, followCountRow;
  try {
    const [p, i, f] = await Promise.all([
      supabase.from('profiles').select('id, display_name, bio').eq('id', artistId).maybeSingle(),
      supabase.from('browse_feed').select('*').eq('owner_id', artistId).order('created_at', { ascending: false }),
      supabase.from('artist_follow_counts').select('follower_count').eq('artist_id', artistId).maybeSingle(),
    ]);
    profile = p.data; items = i.data; followCountRow = f.data;
    if (p.error && !profile) throw p.error;
  } catch (e) {
    console.error(e);
    profileCard.replaceChildren(h('p', { class: 'empty-state' }, "Couldn't load this artist. Check your connection."), h('button', { type: 'button', class: 'zs-btn', onclick: () => ctx.reload() }, 'Try again'));
    grid.replaceChildren(); ctx.ready(); return;
  }
  if (!ctx.isAlive()) return;
  if (!profile) { missing(); return; }

  const name = profile.display_name || 'Unknown artist';
  nameMap.set(artistId, name);
  ctx.setTitle(`${name} — ZAMI`);
  const rows = (items || []).map((r) => ({ ...r, artistName: name }));
  const totals = rows.reduce((a, r) => ({ plays: a.plays + (r.play_count || 0), downloads: a.downloads + (r.download_count || 0) }), { plays: 0, downloads: 0 });
  const followerCount = followCountRow?.follower_count || 0;

  const stat = (value, label, id) => h('div', { class: 'stat' }, h('span', { class: 'stat-value', id }, String(value)), h('span', { class: 'stat-label' }, label));
  const followBtn = h('button', { type: 'button', id: 'follow-btn', class: isFollowing ? 'following' : '' }, isFollowing ? '✓ Following' : '+ Follow');
  const updateFollowerCount = (d) => { const el = $('follower-count-value'); if (el) el.textContent = String(Math.max(0, (parseInt(el.textContent, 10) || 0) + d)); };
  followBtn.addEventListener('click', async () => {
    if (!currentUserId) { if (confirm('Log in to follow artists. Go to login now?')) navigate('login.html'); return; }
    followBtn.disabled = true;
    if (isFollowing) {
      const { error } = await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('artist_id', artistId);
      if (!error) { isFollowing = false; followBtn.classList.remove('following'); followBtn.textContent = '+ Follow'; updateFollowerCount(-1); }
      else { console.error('Unfollow failed:', error); alert("Couldn't unfollow — try again."); }
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: currentUserId, artist_id: artistId });
      if (!error) { isFollowing = true; followBtn.classList.add('following'); followBtn.textContent = '✓ Following'; updateFollowerCount(1); }
      else { console.error('Follow failed:', error); alert("Couldn't follow — try again."); }
    }
    followBtn.disabled = false;
  });

  const actions = [followBtn];
  if (rows.some(isPlayable)) {
    const playAll = h('button', { type: 'button', id: 'play-all-btn' });
    playAll.innerHTML = `${icon('play', 20)} Play all`;
    playAll.addEventListener('click', () => { const first = rows.find(isPlayable); if (first) playFromList(rows, first); });
    actions.push(playAll);
  }

  const shareBtn = h('button', { type: 'button', id: 'share-btn' });
  shareBtn.innerHTML = `${icon('share', 20)} Share`;
  shareBtn.addEventListener('click', () => shareArtist(artistId, name));
  actions.push(shareBtn);

  profileCard.replaceChildren(
    h('div', { class: 'profile-avatar' }, name.slice(0, 2).toUpperCase()),
    h('p', { class: 'profile-name' }, name),
    h('p', { class: 'profile-bio' + (profile.bio ? '' : ' empty') }, profile.bio || 'No bio yet.'),
    h('div', { class: 'stat-row' }, stat(rows.length, 'Tracks'), stat(totals.plays, 'Plays'), stat(totals.downloads, 'Downloads'), stat(followerCount, 'Followers', 'follower-count-value')),
    h('div', { class: 'profile-actions' }, ...actions));

  grid.replaceChildren();
  if (!rows.length) grid.append(h('p', { class: 'empty-state' }, 'Nothing here yet.'));
  else revealList(grid, rows.map((item) => itemCard(item, () => rows)));
  ctx.ready();
}
