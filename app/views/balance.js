// Adapter view generated from legacy/original/balance.html (tools/convert-page.mjs).
// Page logic is unchanged; the shared Supabase client, router navigation and timer cleanup are injected.
import { navigate as __navigate, reload as __reload } from '../lib/router.js';

export const title = "My Balance — Music Platform";
export const css = 'css/views/balance.css';
export const markup = `<div class="wrap">
  <h1>My Balance</h1>

  <div id="gate" class="gate-msg">Checking access…</div>

  <div id="content" class="hidden">
    <div class="card">
      <p class="balance-label">Available balance</p>
      <p class="balance-value" id="balance-value">K0</p>
      <p class="split-note">Artists receive 75% of all revenue — the rest covers running costs. For any queries, reach out to management at <a href="mailto:zamimusicltd@gmail.com">zamimusicltd@gmail.com</a>.</p>

      <div class="payout-row">
        <p class="balance-label">You'll receive (75%)</p>
        <p class="balance-value" id="balance-value-payout">K0</p>
      </div>

      <div id="pending-banner" class="pending-banner hidden"></div>
      <div id="paid-banner" class="paid-banner hidden"></div>

      <button type="button" class="primary" id="withdraw-btn">Request withdrawal</button>
      <p class="status-line" id="withdraw-status"></p>
      <p class="split-note" style="margin:10px 0 0;">Withdrawals are processed from Friday 09:00 to Monday 17:00. Thanks for doing business with ZAMI.</p>
    </div>

    <div class="card">
      <label for="momo-input">Payout MoMo number</label>
      <input type="tel" id="momo-input" placeholder="0971234567" />
      <button type="button" class="primary" id="save-momo-btn">Save</button>
      <p class="status-line" id="momo-status"></p>
    </div>

    <div class="stats-grid">
      <div class="stat-tile"><p class="stat-value" id="stat-live">–</p><p class="stat-label">Live uploads</p></div>
      <div class="stat-tile"><p class="stat-value" id="stat-sold">–</p><p class="stat-label">Beats sold</p></div>
    </div>

    <div class="card">
      <h2>Sales by item</h2>
      <div id="sales-list"><p class="empty-state" style="padding:10px 0;">No sales yet.</p></div>
    </div>
  </div>
</div>`;

export async function mount({ supabase, timers: __t, document }) {
  const gate = document.getElementById('gate');
  const content = document.getElementById('content');

  function normalizeZambianPhone(raw) {
    const cleaned = raw.trim().replace(/[\s\-()]/g, '');
    let normalized = null;
    if (cleaned.startsWith('+260')) normalized = cleaned;
    else if (cleaned.startsWith('260')) normalized = '+' + cleaned;
    else if (cleaned.startsWith('0')) normalized = '+260' + cleaned.slice(1);
    else if (/^\d{9}$/.test(cleaned)) normalized = '+260' + cleaned;
    if (normalized && /^\+260\d{9}$/.test(normalized)) return normalized;
    return null;
  }

  let currentUser = null;
  let artistItemIds = { track: new Set(), beat: new Set() };

  async function init() {
    gate.classList.remove('hidden');
    gate.innerHTML = 'Checking access…';
    content.classList.add('hidden');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        gate.innerHTML = 'Please <a href="login.html">log in</a> first.';
        return;
      }
      const { data: roleCheck } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (!roleCheck || roleCheck.role !== 'artist') {
        gate.textContent = 'This page is for artists only.';
        return;
      }
      currentUser = user;
      gate.classList.add('hidden');
      content.classList.remove('hidden');

      // Run independently so one slow/failed query doesn't block the rest —
      // each piece shows its own state if it fails, instead of the whole page hanging.
      await Promise.allSettled([
        loadProfile(),
        loadBalanceAndStats(),
        loadPendingWithdrawal(),
      ]);
      subscribeToWithdrawals();
      subscribeToSales();
      subscribeToOwnItems();
    } catch (err) {
      gate.classList.remove('hidden');
      content.classList.add('hidden');
      gate.innerHTML = `Couldn't load your balance — check your connection.<br><button type="button" class="primary" id="retry-btn" style="margin-top:10px;">Retry</button>`;
      document.getElementById('retry-btn').addEventListener('click', init);
    }
  }

  init();

  async function loadProfile() {
    const { data: profile } = await supabase.from('profiles').select('momo_number').eq('id', currentUser.id).maybeSingle();
    if (profile?.momo_number) document.getElementById('momo-input').value = profile.momo_number;
  }

  document.getElementById('save-momo-btn').addEventListener('click', async () => {
    const momoStatus = document.getElementById('momo-status');
    const phone = normalizeZambianPhone(document.getElementById('momo-input').value);
    if (!phone) {
      momoStatus.textContent = 'Enter a valid Zambian number, e.g. 0971234567';
      momoStatus.classList.add('error');
      return;
    }
    momoStatus.textContent = 'Saving…';
    momoStatus.classList.remove('error');
    const { error } = await supabase.from('profiles').update({ momo_number: phone }).eq('id', currentUser.id);
    momoStatus.textContent = error ? error.message : 'Saved.';
    momoStatus.classList.toggle('error', !!error);
  });

  async function computeArtistBalance(artistId) {
    const [{ data: tracks }, { data: beats }] = await Promise.all([
      supabase.from('tracks').select('id, title').eq('owner_id', artistId),
      supabase.from('beats').select('id, title').eq('owner_id', artistId),
    ]);
    const trackIds = (tracks || []).map(t => t.id);
    const beatIds = (beats || []).map(b => b.id);

    const [{ data: trackSales }, { data: beatSales }] = await Promise.all([
      trackIds.length ? supabase.from('purchases').select('amount, item_id').eq('item_type', 'track').eq('status', 'fulfilled').in('item_id', trackIds) : { data: [] },
      beatIds.length ? supabase.from('purchases').select('amount, item_id').eq('item_type', 'beat').eq('status', 'fulfilled').in('item_id', beatIds) : { data: [] },
    ]);

    const { data: paidWithdrawals } = await supabase.from('withdrawals').select('amount').eq('artist_id', artistId).eq('status', 'paid');

    const earned = [...(trackSales || []), ...(beatSales || [])].reduce((s, p) => s + Number(p.amount), 0);
    const withdrawn = (paidWithdrawals || []).reduce((s, w) => s + Number(w.amount), 0);

    return {
      balance: earned - withdrawn,
      soldCount: (trackSales || []).length + (beatSales || []).length,
      tracks: tracks || [],
      beats: beats || [],
      trackSales: trackSales || [],
      beatSales: beatSales || [],
    };
  }

  let currentBalance = 0;

  async function loadBalanceAndStats() {
    const result = await computeArtistBalance(currentUser.id);
    currentBalance = result.balance;
    artistItemIds.track = new Set(result.tracks.map(t => t.id));
    artistItemIds.beat = new Set(result.beats.map(b => b.id));
    document.getElementById('balance-value').textContent = `K${result.balance}`;
    document.getElementById('balance-value-payout').textContent = `K${Math.round(result.balance * 0.75)}`;
    document.getElementById('stat-sold').textContent = result.soldCount;

    const [{ count: liveTracks }, { count: liveBeats }] = await Promise.all([
      supabase.from('tracks').select('*', { count: 'exact', head: true }).eq('owner_id', currentUser.id).eq('status', 'approved'),
      supabase.from('beats').select('*', { count: 'exact', head: true }).eq('owner_id', currentUser.id).eq('status', 'approved'),
    ]);
    document.getElementById('stat-live').textContent = (liveTracks || 0) + (liveBeats || 0);

    // Sales by item
    const salesByItem = new Map();
    const titleMap = new Map();
    result.tracks.forEach(t => titleMap.set(`track-${t.id}`, t.title));
    result.beats.forEach(b => titleMap.set(`beat-${b.id}`, b.title));
    [...result.trackSales.map(s => ({ ...s, type: 'track' })), ...result.beatSales.map(s => ({ ...s, type: 'beat' }))].forEach(sale => {
      const key = `${sale.type}-${sale.item_id}`;
      const existing = salesByItem.get(key) || { count: 0, total: 0 };
      existing.count += 1;
      existing.total += Number(sale.amount);
      salesByItem.set(key, existing);
    });

    const salesList = document.getElementById('sales-list');
    if (salesByItem.size === 0) {
      salesList.innerHTML = '<p class="empty-state" style="padding:10px 0;">No sales yet.</p>';
    } else {
      salesList.innerHTML = '';
      for (const [key, stats] of salesByItem) {
        const row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML = `
          <span class="name">${escapeHtml(titleMap.get(key) || 'Unknown')}</span>
          <span class="sold">${stats.count} sold · K${stats.total}</span>
        `;
        salesList.appendChild(row);
      }
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  let activeWithdrawalId = null;

  async function loadPendingWithdrawal() {
    const { data: pending } = await supabase.from('withdrawals').select('*').eq('artist_id', currentUser.id).eq('status', 'requested').maybeSingle();
    const withdrawBtn = document.getElementById('withdraw-btn');
    const pendingBanner = document.getElementById('pending-banner');
    if (pending) {
      activeWithdrawalId = pending.id;
      pendingBanner.textContent = `Withdrawal of K${pending.amount} requested — awaiting payment.`;
      pendingBanner.classList.remove('hidden');
      withdrawBtn.disabled = true;
    }
  }

  document.getElementById('withdraw-btn').addEventListener('click', async () => {
    const withdrawStatus = document.getElementById('withdraw-status');
    const { data: profile } = await supabase.from('profiles').select('momo_number').eq('id', currentUser.id).maybeSingle();
    if (!profile?.momo_number) {
      withdrawStatus.textContent = 'Please save your MoMo number first.';
      withdrawStatus.classList.add('error');
      return;
    }
    if (currentBalance <= 0) {
      withdrawStatus.textContent = 'No balance available to withdraw.';
      withdrawStatus.classList.add('error');
      return;
    }
    const btn = document.getElementById('withdraw-btn');
    btn.disabled = true;
    withdrawStatus.textContent = 'Submitting request…';
    withdrawStatus.classList.remove('error');

    const { data, error } = await supabase.from('withdrawals').insert({
      artist_id: currentUser.id,
      amount: currentBalance,
      momo_number: profile.momo_number,
    }).select().single();

    if (error) {
      withdrawStatus.textContent = error.message;
      withdrawStatus.classList.add('error');
      btn.disabled = false;
      return;
    }

    activeWithdrawalId = data.id;
    withdrawStatus.textContent = '';
    const pendingBanner = document.getElementById('pending-banner');
    pendingBanner.textContent = `Withdrawal of K${data.amount} requested — awaiting payment.`;
    pendingBanner.classList.remove('hidden');
  });

  function subscribeToWithdrawals() {
    supabase
      .channel(`withdrawals-${currentUser.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'withdrawals', filter: `artist_id=eq.${currentUser.id}`,
      }, (payload) => {
        if (payload.new.status === 'paid' && payload.new.id === activeWithdrawalId) {
          document.getElementById('pending-banner').classList.add('hidden');
          const paidBanner = document.getElementById('paid-banner');
          paidBanner.textContent = `K${payload.new.amount} sent to your MoMo number.`;
          paidBanner.classList.remove('hidden');
          document.getElementById('withdraw-btn').disabled = false;
          activeWithdrawalId = null;
          loadBalanceAndStats();
        }
      })
      .subscribe();
  }

  // Purchases aren't scoped to artist_id, so this listens broadly and checks
  // client-side whether the changed row is one of this artist's items —
  // covers a sale being marked paid on another device/tab (e.g. by the admin).
  let salesRefreshTimer = null;
  function subscribeToSales() {
    supabase
      .channel(`sales-${currentUser.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'purchases',
      }, (payload) => {
        const row = payload.new || payload.old;
        if (!row) return;
        const isOwnItem = (row.item_type === 'track' && artistItemIds.track.has(row.item_id)) ||
                           (row.item_type === 'beat' && artistItemIds.beat.has(row.item_id));
        if (!isOwnItem) return;
        // Debounce in case several sale updates land at once.
        clearTimeout(salesRefreshTimer);
        salesRefreshTimer = __t.setTimeout(loadBalanceAndStats, 300);
      })
      .subscribe();
  }

  // Keeps "Live uploads" accurate if an item's status changes elsewhere
  // (e.g. admin approves/takes down) while this page is open.
  function subscribeToOwnItems() {
    supabase
      .channel(`own-items-${currentUser.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'tracks', filter: `owner_id=eq.${currentUser.id}`,
      }, () => loadBalanceAndStats())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'beats', filter: `owner_id=eq.${currentUser.id}`,
      }, () => loadBalanceAndStats())
      .subscribe();
  }

}
