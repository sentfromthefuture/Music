// Adapter view generated from legacy/original/account.html (tools/convert-page.mjs).
// Page logic is unchanged; the shared Supabase client, router navigation and timer cleanup are injected.
import { navigate as __navigate, reload as __reload } from '../lib/router.js';
import { licensingEnabled } from '../lib/licenses.js';
import { addLicenseControls } from '../ui/license-controls.js';
import { addSongLicenseControls } from '../ui/song-license-controls.js';
import { complaintsEnabled, mountProducerComplaints } from '../ui/complaints.js';
import { revealList } from '../ui/paging.js';
import { shareArtist } from '../ui/share-link.js';

export const title = "My Account — Music Platform";
export const css = 'css/views/account.css';
export const markup = `<div class="bg-blobs" aria-hidden="true">
  <div class="blob blob-1"></div>
  <div class="blob blob-2"></div>
  <div class="blob blob-3"></div>
</div>

<div class="wrap">
  <div class="eq" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
  <div class="header-row">
    <div class="header-left">
      <a href="browse.html" id="back-link" aria-label="Back to Browse">←</a>
      <h1>My Account</h1>
    </div>
    <button type="button" id="logout-btn" class="hidden">Log out</button>
  </div>

  <div id="gate" class="gate-msg">Checking access…</div>

  <div id="content" class="hidden">
    <div class="card">
      <div id="profile-view">
        <div class="profile-head">
          <div class="avatar-ring"><div class="avatar" id="avatar-initials">?</div></div>
          <button type="button" id="edit-profile-btn">Edit Profile</button>
        </div>
        <p class="name" id="display-name">—</p>
        <p class="role" id="role-label">—</p>
        <p class="member-since hidden" id="member-since"></p>
        <p class="bio empty" id="bio-display">No bio yet.</p>
      </div>

      <div id="profile-edit" class="edit-form hidden">
        <label for="edit-display-name">Display name</label>
        <input type="text" id="edit-display-name" maxlength="60" />

        <label for="edit-bio" id="edit-bio-label" class="hidden">Bio</label>
        <textarea id="edit-bio" maxlength="280" class="hidden" placeholder="Tell listeners a bit about yourself…"></textarea>

        <p class="edit-error hidden" id="edit-error"></p>
        <div class="edit-actions">
          <button type="button" id="cancel-profile-btn">Cancel</button>
          <button type="button" id="save-profile-btn"><span>Save</span></button>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-tile"><p class="stat-value" id="stat-downloads">–</p><p class="stat-label">Downloads</p></div>
      <div class="stat-tile"><p class="stat-value" id="stat-purchases">–</p><p class="stat-label">Beats bought</p></div>
    </div>

    <div class="card hidden" id="artist-links">
      <a href="my-uploads.html" class="link-row">My Uploads <span class="arrow">→</span></a>
      <a href="balance.html" class="link-row">My Balance &amp; Withdrawals <span class="arrow">→</span></a>
      <a href="#" class="link-row" id="share-profile-link" data-no-router>Share my profile link <span class="arrow">↗</span></a>
    </div>

    <div id="producer-complaints"></div>

    <div class="card hidden" id="become-artist-card">
      <p style="font-size:13px;color:var(--ink-muted);margin:0 0 10px;">Want to sell your own tracks or beats?</p>
      <button type="button" id="become-artist-btn"><span>Become an Artist</span></button>
    </div>

    <h2>My Downloads</h2>
    <div id="downloads-list"><p class="empty-state">No downloads yet.</p></div>

    <h2>My Purchases</h2>
    <div id="purchases-list"><p class="empty-state">No purchases yet.</p></div>

    <h2>Favorites</h2>
    <div id="fav-grid" class="fav-grid"><p class="empty-state">No favorites yet.</p></div>

    <h2>Following</h2>
    <div id="following-list"><p class="empty-state">Not following anyone yet.</p></div>
  </div>
</div>`;

export async function mount({ supabase, timers: __t, document }) {
  const gate = document.getElementById('gate');
  const content = document.getElementById('content');

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  // Toggles a primary button between its normal label and a spinner + label,
  // and disables it while a request is in flight.
  function setButtonLoading(btn, loading, loadingLabel) {
    const label = btn.querySelector('span');
    if (loading) {
      btn.dataset.originalLabel = label.textContent;
      label.textContent = loadingLabel;
      btn.insertAdjacentHTML('afterbegin', '<span class="spinner"></span>');
      btn.disabled = true;
    } else {
      const spinner = btn.querySelector('.spinner');
      if (spinner) spinner.remove();
      if (btn.dataset.originalLabel) label.textContent = btn.dataset.originalLabel;
      btn.disabled = false;
    }
  }

  (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      gate.innerHTML = 'Please <a href="login.html">log in</a> first.';
      return;
    }
    gate.classList.add('hidden');
    content.classList.remove('hidden');
    document.getElementById('logout-btn').classList.remove('hidden');

    let profile = (await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()).data;
    renderProfileView(profile);
    setupProfileEditing(user.id, () => profile, (updated) => { profile = updated; });

    if (profile?.role === 'artist') {
      document.getElementById('artist-links').classList.remove('hidden');
      document.getElementById('share-profile-link').addEventListener('click', (e) => { e.preventDefault(); shareArtist(user.id, profile?.display_name); });
      complaintsEnabled(supabase).then((on) => {
        if (on) mountProducerComplaints({ supabase, container: document.getElementById('producer-complaints'), userId: user.id });
      }).catch(() => {});
    } else {
      const becomeCard = document.getElementById('become-artist-card');
      becomeCard.classList.remove('hidden');
      document.getElementById('become-artist-btn').addEventListener('click', async (e) => {
        setButtonLoading(e.currentTarget, true, 'Updating…');
        const { error } = await supabase.from('profiles').update({ role: 'artist' }).eq('id', user.id);
        if (!error) {
          __reload();
        } else {
          setButtonLoading(e.currentTarget, false);
        }
      });
    }

    const [{ count: downloadsCount }, { count: purchasesCount }] = await Promise.all([
      supabase.from('downloads').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('purchases').select('*', { count: 'exact', head: true }).eq('buyer_id', user.id).eq('status', 'fulfilled'),
    ]);
    document.getElementById('stat-downloads').textContent = downloadsCount || 0;
    document.getElementById('stat-purchases').textContent = purchasesCount || 0;

    await loadDownloads(user.id);
    await loadPurchases(user.id);
    await loadFavorites(user.id);
    await loadFollowing(user.id);
  })();

  function renderProfileView(profile) {
    const displayName = profile?.display_name || 'Unnamed';
    document.getElementById('display-name').textContent = displayName;
    document.getElementById('role-label').textContent = profile?.role === 'artist' ? 'Artist' : 'Listener';
    document.getElementById('avatar-initials').textContent = displayName.slice(0, 2).toUpperCase();

    const memberSinceEl = document.getElementById('member-since');
    if (profile?.created_at) {
      const joined = new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      memberSinceEl.textContent = `Member since ${joined}`;
      memberSinceEl.classList.remove('hidden');
    } else {
      memberSinceEl.classList.add('hidden');
    }

    const bioEl = document.getElementById('bio-display');
    if (profile?.role === 'artist') {
      bioEl.classList.remove('hidden');
      if (profile?.bio) {
        bioEl.textContent = profile.bio;
        bioEl.classList.remove('empty');
      } else {
        bioEl.textContent = 'No bio yet.';
        bioEl.classList.add('empty');
      }
    } else {
      // Bio is only shown on the public artist profile page, so listeners don't need it here.
      bioEl.classList.add('hidden');
    }
  }

  function setupProfileEditing(userId, getProfile, setProfile) {
    const viewEl = document.getElementById('profile-view');
    const editEl = document.getElementById('profile-edit');
    const nameInput = document.getElementById('edit-display-name');
    const bioLabel = document.getElementById('edit-bio-label');
    const bioInput = document.getElementById('edit-bio');
    const errorEl = document.getElementById('edit-error');
    const saveBtn = document.getElementById('save-profile-btn');

    document.getElementById('edit-profile-btn').addEventListener('click', () => {
      const profile = getProfile();
      nameInput.value = profile?.display_name || '';
      errorEl.classList.add('hidden');

      const isArtist = profile?.role === 'artist';
      bioLabel.classList.toggle('hidden', !isArtist);
      bioInput.classList.toggle('hidden', !isArtist);
      bioInput.value = isArtist ? (profile?.bio || '') : '';

      viewEl.classList.add('hidden');
      editEl.classList.remove('hidden');
      nameInput.focus();
    });

    document.getElementById('cancel-profile-btn').addEventListener('click', () => {
      editEl.classList.add('hidden');
      viewEl.classList.remove('hidden');
    });

    saveBtn.addEventListener('click', async () => {
      const newName = nameInput.value.trim();
      if (!newName) {
        errorEl.textContent = 'Display name can\'t be empty.';
        errorEl.classList.remove('hidden');
        return;
      }

      const profile = getProfile();
      const isArtist = profile?.role === 'artist';
      const updates = { display_name: newName };
      if (isArtist) updates.bio = bioInput.value.trim() || null;

      setButtonLoading(saveBtn, true, 'Saving…');
      const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
      setButtonLoading(saveBtn, false);

      if (error) {
        errorEl.textContent = 'Something went wrong — try again.';
        errorEl.classList.remove('hidden');
        return;
      }

      const updatedProfile = { ...profile, ...updates };
      setProfile(updatedProfile);
      renderProfileView(updatedProfile);
      editEl.classList.add('hidden');
      viewEl.classList.remove('hidden');
    });
  }

  async function loadDownloads(userId) {
    const { data: downloads } = await supabase.from('downloads').select('*').eq('user_id', userId).order('downloaded_at', { ascending: false });
    const container = document.getElementById('downloads-list');
    if (!downloads || downloads.length === 0) {
      container.innerHTML = '<p class="empty-state">No downloads yet.</p>';
      return;
    }

    const trackIds = [...new Set(downloads.map(d => d.track_id))];
    const { data: tracks } = trackIds.length ? await supabase.from('tracks').select('id, title, file_path').in('id', trackIds) : { data: [] };
    const trackMap = new Map((tracks || []).map(t => [t.id, t]));

    container.innerHTML = '<div class="list-card"></div>';
    const listCard = container.querySelector('.list-card');
    const rows = [];
    for (const d of downloads) {
      const track = trackMap.get(d.track_id);
      if (!track) continue;
      const ext = (track.file_path.split('.').pop() || 'mp3').toLowerCase();
      const safeTitle = (track.title || 'track').replace(/[\\/:*?"<>|]/g, '').trim();
      const publicUrl = supabase.storage.from('public-previews').getPublicUrl(track.file_path, { download: `${safeTitle}.${ext}` }).data.publicUrl;
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <div><p class="name">${escapeHtml(track.title)}</p><p class="sub">${new Date(d.downloaded_at).toLocaleDateString()}</p></div>
        <a class="mini-btn" href="${publicUrl}" download>Download</a>
      `;
      rows.push(row);
    }
    if (rows.length === 0) container.innerHTML = '<p class="empty-state">No downloads yet.</p>';
    else revealList(listCard, rows);
  }

  async function loadPurchases(userId) {
    const { data: purchases } = await supabase.from('purchases').select('*').eq('buyer_id', userId).eq('status', 'fulfilled').order('fulfilled_at', { ascending: false });
    const container = document.getElementById('purchases-list');
    if (!purchases || purchases.length === 0) {
      container.innerHTML = '<p class="empty-state">No purchases yet.</p>';
      return;
    }

    const trackIds = purchases.filter(p => p.item_type === 'track').map(p => p.item_id);
    const beatIds = purchases.filter(p => p.item_type === 'beat').map(p => p.item_id);
    const lic = await licensingEnabled();
    const [{ data: trackItems }, { data: beatItems }] = await Promise.all([
      trackIds.length ? supabase.from('tracks').select('id, title, file_path, is_free').in('id', trackIds) : { data: [] },
      beatIds.length ? supabase.from('beats').select(lic ? 'id, title, full_path, owner_id, license_tiers' : 'id, title, full_path').in('id', beatIds) : { data: [] },
    ]);
    const itemMap = new Map();
    (trackItems || []).forEach(t => itemMap.set(`track-${t.id}`, { title: t.title, path: t.file_path, isFree: !!t.is_free }));
    (beatItems || []).forEach(b => itemMap.set(`beat-${b.id}`, { title: b.title, path: b.full_path, owner_id: b.owner_id, license_tiers: b.license_tiers }));

    container.innerHTML = '<div class="list-card"></div>';
    const listCard = container.querySelector('.list-card');
    const rows = [];
    for (const purchase of purchases) {
      const item = itemMap.get(`${purchase.item_type}-${purchase.item_id}`);
      if (!item) continue;
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <div><p class="name">${escapeHtml(item.title)}</p><p class="sub">K${purchase.amount}</p></div>
        <button type="button" class="mini-btn" data-path="${escapeHtml(item.path)}">Get link</button>
      `;
      row.querySelector('.mini-btn').addEventListener('click', async (e) => {
        e.target.disabled = true;
        e.target.textContent = 'Loading…';
        const ext = (item.path.split('.').pop() || 'mp3').toLowerCase();
        const safeTitle = (item.title || 'track').replace(/[\\/:*?"<>|]/g, '').trim();
        // a free song (bought only as a license) lives in the public bucket
        const { data: signedData, error } = item.isFree
          ? { data: { signedUrl: supabase.storage.from('public-previews').getPublicUrl(item.path, { download: `${safeTitle}.${ext}` }).data.publicUrl }, error: null }
          : await supabase.storage.from('private-full').createSignedUrl(item.path, 3600, { download: `${safeTitle}.${ext}` });
        if (error) {
          e.target.textContent = 'Failed';
          return;
        }
        window.open(signedData.signedUrl, '_blank');
        e.target.textContent = 'Get link';
        e.target.disabled = false;
      });
      rows.push(row);
      if (purchase.song_license_tier) addSongLicenseControls({ row, purchase, item });
      else if (lic && purchase.license_id) addLicenseControls({ supabase, row, purchase, item });
    }
    if (rows.length === 0) container.innerHTML = '<p class="empty-state">No purchases yet.</p>';
    else revealList(listCard, rows);
  }

  async function loadFavorites(userId) {
    const { data: favs } = await supabase.from('favorites').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    const favGrid = document.getElementById('fav-grid');
    if (!favs || favs.length === 0) {
      favGrid.innerHTML = '<p class="empty-state">No favorites yet.</p>';
      return;
    }

    const trackIds = favs.filter(f => f.item_type === 'track').map(f => f.item_id);
    const beatIds = favs.filter(f => f.item_type === 'beat').map(f => f.item_id);

    const [{ data: trackItems }, { data: beatItems }] = await Promise.all([
      trackIds.length ? supabase.from('tracks').select('*').in('id', trackIds) : { data: [] },
      beatIds.length ? supabase.from('beats').select('*').in('id', beatIds) : { data: [] },
    ]);

    const ownerIds = [...new Set([...(trackItems || []), ...(beatItems || [])].map(i => i.owner_id))];
    const { data: profiles } = ownerIds.length ? await supabase.from('profiles').select('id, display_name').in('id', ownerIds) : { data: [] };
    const nameMap = new Map((profiles || []).map(p => [p.id, p.display_name || 'Unknown artist']));

    const itemMap = new Map();
    (trackItems || []).forEach(t => itemMap.set(`track-${t.id}`, { ...t, itemType: 'track' }));
    (beatItems || []).forEach(b => itemMap.set(`beat-${b.id}`, { ...b, itemType: 'beat' }));

    favGrid.innerHTML = '';
    const favCards = [];
    for (const fav of favs) {
      const item = itemMap.get(`${fav.item_type}-${fav.item_id}`);
      if (!item) continue; // item may have been removed/deleted since favoriting
      const card = document.createElement('a');
      card.className = 'fav-card';
      card.href = `detail.html?type=${item.itemType}&id=${item.id}`;
      card.innerHTML = `
        <div class="fav-cover" style="${item.cover_url ? `background-image:url(${item.cover_url})` : ''}">${item.cover_url ? '' : (item.itemType === 'beat' ? '♫' : '♪')}</div>
        <div class="fav-info">
          <p class="fav-title">${escapeHtml(item.title)}</p>
          <p class="fav-artist">${escapeHtml(nameMap.get(item.owner_id) || '')}</p>
        </div>
      `;
      favCards.push(card);
    }
    if (favCards.length === 0) {
      favGrid.innerHTML = '<p class="empty-state">No favorites yet.</p>';
    } else revealList(favGrid, favCards);
  }

  async function loadFollowing(userId) {
    const { data: follows } = await supabase.from('follows').select('artist_id, created_at').eq('follower_id', userId).order('created_at', { ascending: false });
    const container = document.getElementById('following-list');
    if (!follows || follows.length === 0) {
      container.innerHTML = '<p class="empty-state">Not following anyone yet.</p>';
      return;
    }

    const artistIds = follows.map(f => f.artist_id);
    const { data: artistProfiles } = await supabase.from('profiles').select('id, display_name').in('id', artistIds);
    const nameMap = new Map((artistProfiles || []).map(p => [p.id, p.display_name || 'Unknown artist']));

    container.innerHTML = '<div class="list-card"></div>';
    const listCard = container.querySelector('.list-card');
    const rows = [];
    for (const f of follows) {
      const name = nameMap.get(f.artist_id);
      if (!name) continue; // artist profile may have been deleted since following
      const row = document.createElement('a');
      row.className = 'list-row';
      row.href = `artist.html?id=${encodeURIComponent(f.artist_id)}`;
      row.style.textDecoration = 'none';
      row.style.color = 'inherit';
      row.innerHTML = `
        <div><p class="name">${escapeHtml(name)}</p></div>
        <span class="mini-btn" style="pointer-events:none;">View →</span>
      `;
      rows.push(row);
    }
    if (rows.length === 0) container.innerHTML = '<p class="empty-state">Not following anyone yet.</p>';
    else revealList(listCard, rows);
  }

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    __navigate('login.html');
  });

}
