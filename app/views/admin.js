// Adapter view generated from legacy/original/admin.html (tools/convert-page.mjs).
// Page logic is unchanged; the shared Supabase client, router navigation and timer cleanup are injected.
import { navigate as __navigate, reload as __reload } from '../lib/router.js';
import { tierLabel } from '../lib/licenses.js';

export const title = "Admin — Music Platform";
export const css = 'css/views/admin.css';
export const markup = `<div class="wrap">
  <div class="header-row">
    <div>
      <h1>Admin</h1>
      <p class="sub">Review uploads, purchases, and withdrawals.</p>
    </div>
    <button type="button" id="logout-btn" class="hidden">Log out</button>
  </div>

  <div id="gate" class="gate-msg">Checking access…</div>

  <div id="admin-area" class="hidden">
    <div class="stats-grid">
      <div class="stat-tile"><p class="stat-value" id="stat-review">–</p><p class="stat-label">Pending review</p></div>
      <div class="stat-tile"><p class="stat-value" id="stat-purchases">–</p><p class="stat-label">Pending purchases</p></div>
      <div class="stat-tile"><p class="stat-value" id="stat-withdrawals">–</p><p class="stat-label">Pending withdrawals</p></div>
      <div class="stat-tile"><p class="stat-value" id="stat-live">–</p><p class="stat-label">Live content</p></div>
    </div>

    <input type="text" id="search-input" placeholder="Search…" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--surface);color:var(--ink);font-family:inherit;margin-bottom:12px;" />

    <div class="tabs">
      <button type="button" class="tab-btn active" data-tab="review">Pending Review</button>
      <button type="button" class="tab-btn" data-tab="purchases">Purchases</button>
      <button type="button" class="tab-btn" data-tab="withdrawals">Withdrawals</button>
      <button type="button" class="tab-btn" data-tab="withdrawal-history">Withdrawal History</button>
      <button type="button" class="tab-btn" data-tab="live">Live Content</button>
      <button type="button" class="tab-btn" data-tab="taken-down">Taken Down</button>
      <button type="button" class="tab-btn" data-tab="users">Users</button>
      <button type="button" class="tab-btn" data-tab="complaints">Complaints</button>
    </div>

    <div id="tab-review"></div>
    <div id="tab-purchases" class="hidden"></div>
    <div id="tab-withdrawals" class="hidden"></div>
    <div id="tab-withdrawal-history" class="hidden"></div>
    <div id="tab-live" class="hidden"></div>
    <div id="tab-taken-down" class="hidden"></div>
    <div id="tab-users" class="hidden"></div>
    <div id="tab-complaints" class="hidden"></div>
  </div>
</div>`;

export async function mount({ supabase, timers: __t, document }) {
  const gate = document.getElementById('gate');
  const adminArea = document.getElementById('admin-area');
  const logoutBtn = document.getElementById('logout-btn');

  // --- Access check ---
  (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      gate.innerHTML = 'Please <a href="login.html">log in</a> first.';
      return;
    }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (!profile || !profile.is_admin) {
      gate.textContent = "You don't have access to this page.";
      return;
    }
    gate.classList.add('hidden');
    adminArea.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    loadStats();
    loadReview();
  })();

  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    __navigate('login.html');
  });

  // --- Tabs ---
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
      const target = document.getElementById(`tab-${btn.dataset.tab}`);
      target.classList.remove('hidden');
      if (btn.dataset.tab === 'review') loadReview();
      if (btn.dataset.tab === 'purchases') loadPurchases();
      if (btn.dataset.tab === 'withdrawals') loadWithdrawals();
      if (btn.dataset.tab === 'withdrawal-history') loadWithdrawalHistory();
      if (btn.dataset.tab === 'live') loadLive();
      if (btn.dataset.tab === 'taken-down') loadTakenDown();
      if (btn.dataset.tab === 'users') loadUsers();
      if (btn.dataset.tab === 'complaints') loadComplaints();
    });
  });

  function cardShell(innerHtml) {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = innerHtml;
    return div;
  }

  // --- Search (filters cards in the currently visible tab, by matching any text in the card) ---
  const searchInput = document.getElementById('search-input');
  function applySearchFilter() {
    const term = searchInput.value.trim().toLowerCase();
    const activeTab = document.querySelector('.tab-btn.active');
    if (!activeTab) return;
    const container = document.getElementById(`tab-${activeTab.dataset.tab}`);
    if (!container) return;
    container.querySelectorAll('.card').forEach(card => {
      const matches = !term || card.textContent.toLowerCase().includes(term);
      card.classList.toggle('hidden', !matches);
    });
  }
  searchInput.addEventListener('input', applySearchFilter);

  // --- Withdrawal History (paid) ---
  async function loadWithdrawalHistory() {
    const container = document.getElementById('tab-withdrawal-history');
    container.innerHTML = 'Loading…';

    const { data: withdrawals } = await supabase.from('withdrawals').select('*').eq('status', 'paid').order('paid_at', { ascending: false });

    container.innerHTML = '';
    if (!withdrawals || withdrawals.length === 0) {
      container.appendChild(cardShell('<p class="empty-state" style="margin:0;padding:0;">No withdrawals paid yet.</p>'));
      return;
    }

    const artistIds = [...new Set(withdrawals.map(w => w.artist_id))];
    const { data: artists } = artistIds.length
      ? await supabase.from('profiles').select('id, display_name').in('id', artistIds)
      : { data: [] };
    const nameMap = new Map((artists || []).map(a => [a.id, a.display_name || 'Unnamed']));

    for (const w of withdrawals) {
      const paidDate = w.paid_at ? new Date(w.paid_at).toLocaleString() : '';
      const card = cardShell(`
        <p class="title">K${payoutOf(w)} paid (75% of K${w.amount}) — ${escapeHtml(nameMap.get(w.artist_id) || 'Unknown')}</p>
        <p class="meta">Sent to ${escapeHtml(w.momo_number)} · ${escapeHtml(paidDate)}</p>
        <div class="wd-items"><p class="meta">Loading items…</p></div>
      `);
      breakdownHtml(w).then(html => { card.querySelector('.wd-items').innerHTML = html; })
        .catch(() => { card.querySelector('.wd-items').innerHTML = ''; });
      container.appendChild(card);
    }
    applySearchFilter();
  }

  // --- Taken Down (removed content, with restore) ---
  async function loadTakenDown() {
    const container = document.getElementById('tab-taken-down');
    container.innerHTML = 'Loading…';

    const [{ data: tracks }, { data: beats }] = await Promise.all([
      supabase.from('tracks').select('*').eq('status', 'removed'),
      supabase.from('beats').select('*').eq('status', 'removed'),
    ]);

    const items = [
      ...(tracks || []).map(t => ({ ...t, itemType: 'track' })),
      ...(beats || []).map(b => ({ ...b, itemType: 'beat' })),
    ].sort((a, b) => new Date(b.removed_at || 0) - new Date(a.removed_at || 0));

    container.innerHTML = '';
    if (items.length === 0) {
      container.appendChild(cardShell('<p class="empty-state" style="margin:0;padding:0;">Nothing taken down.</p>'));
      return;
    }

    for (const item of items) {
      const removedDate = item.removed_at ? new Date(item.removed_at).toLocaleString() : 'unknown time';
      const card = cardShell(`
        <p class="title">${escapeHtml(item.title)} <span style="font-weight:400;color:var(--ink-muted);">(${item.itemType})</span></p>
        <p class="meta">Removed ${escapeHtml(removedDate)}</p>
        <div class="row-actions">
          <button class="approve" style="flex:none;width:100%;">Restore</button>
        </div>
      `);
      card.querySelector('.approve').addEventListener('click', async (e) => {
        e.target.disabled = true;
        const table = item.itemType === 'beat' ? 'beats' : 'tracks';
        const { error } = await supabase.from(table).update({ status: 'approved', removed_at: null }).eq('id', item.id);
        if (error) { alert(error.message); e.target.disabled = false; return; }
        card.remove();
        loadStats();
      });
      container.appendChild(card);
    }
    applySearchFilter();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  // --- Stats bar ---
  async function loadStats() {
    const [reviewTracks, reviewBeats, purchasesCount, withdrawalsCount, liveTracks, liveBeats] = await Promise.all([
      supabase.from('tracks').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase.from('beats').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase.from('purchases').select('*', { count: 'exact', head: true }).eq('status', 'requested'),
      supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'requested'),
      supabase.from('tracks').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('beats').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    ]);
    document.getElementById('stat-review').textContent = (reviewTracks.count || 0) + (reviewBeats.count || 0);
    document.getElementById('stat-purchases').textContent = purchasesCount.count || 0;
    document.getElementById('stat-withdrawals').textContent = withdrawalsCount.count || 0;
    document.getElementById('stat-live').textContent = (liveTracks.count || 0) + (liveBeats.count || 0);
  }

  // --- Tab 1: Pending Review (tracks + beats) ---
  async function loadReview() {
    const container = document.getElementById('tab-review');
    container.innerHTML = 'Loading…';

    const [{ data: tracks }, { data: beats }] = await Promise.all([
      supabase.from('tracks').select('*').eq('status', 'pending_review'),
      supabase.from('beats').select('*').eq('status', 'pending_review'),
    ]);

    const items = [
      ...(tracks || []).map(t => ({ ...t, itemType: 'track' })),
      ...(beats || []).map(b => ({ ...b, itemType: 'beat' })),
    ];

    container.innerHTML = '';
    if (items.length === 0) {
      container.appendChild(cardShell('<p class="empty-state" style="margin:0;padding:0;">Nothing pending review.</p>'));
      return;
    }

    // Duplicate-check results from the fingerprint service (one query for all items)
    const { data: fpRows } = await supabase
      .from('audio_fingerprints')
      .select('item_type, item_id, match_item_id, match_title, match_score')
      .in('item_id', items.map(i => String(i.id)));
    const fpMap = new Map((fpRows || []).map(r => [`${r.item_type}-${r.item_id}`, r]));

    for (const item of items) {
      const fp = fpMap.get(`${item.itemType}-${item.id}`);
      let dupHtml = '<p class="fp-note">⏳ Duplicate check not finished yet. Approve unlocks when it is done. Reload the page in a minute.</p>';
      if (fp && fp.match_item_id) {
        dupHtml = `<div class="dup-badge">⚠ Possible duplicate: ${Math.round(fp.match_score * 100)}% match with "${escapeHtml(fp.match_title || 'unknown')}"</div>`;
      } else if (fp) {
        dupHtml = '<p class="fp-note">✓ Duplicate check done: no match found</p>';
      }
      const card = cardShell(`
        <p class="title">${escapeHtml(item.title)} <span style="font-weight:400;color:var(--ink-muted);">(${item.itemType})</span></p>
        <p class="meta">${escapeHtml(item.genre || '')}</p>
        ${dupHtml}
        <div class="ref-badge">${escapeHtml(item.reference_number)}</div>
        <div class="sms-box">${escapeHtml(item.transaction_sms || '(no SMS text)')}</div>
        <div class="row-actions">
          <button class="approve" ${fp ? '' : 'disabled'}>${fp ? 'Approve' : 'Waiting for check…'}</button>
          <button class="reject">Reject</button>
        </div>
      `);
      card.querySelector('.approve').addEventListener('click', async (e) => {
        e.target.disabled = true;
        const table = item.itemType === 'beat' ? 'beats' : 'tracks';
        const { error } = await supabase.from(table).update({ status: 'approved' }).eq('id', item.id);
        if (error) { alert(error.message); e.target.disabled = false; return; }
        card.remove();
        loadStats();
      });
      card.querySelector('.reject').addEventListener('click', async (e) => {
        e.target.disabled = true;
        const table = item.itemType === 'beat' ? 'beats' : 'tracks';
        const { error } = await supabase.from(table).update({ status: 'pending_payment', transaction_sms: null }).eq('id', item.id);
        if (error) { alert(error.message); e.target.disabled = false; return; }
        card.remove();
        loadStats();
      });
      container.appendChild(card);
    }
    applySearchFilter();
  }

  // --- Tab 2: Pending Purchases ---
  async function loadPurchases() {
    const container = document.getElementById('tab-purchases');
    container.innerHTML = 'Loading…';

    const { data: purchasesData } = await supabase.from('purchases').select('*').eq('status', 'requested');
    const purchases = purchasesData || [];

    const trackIds = purchases.filter(p => p.item_type === 'track').map(p => p.item_id);
    const beatIds = purchases.filter(p => p.item_type === 'beat').map(p => p.item_id);

    const [{ data: trackItems }, { data: beatItems }] = await Promise.all([
      trackIds.length ? supabase.from('tracks').select('id, title, file_path').in('id', trackIds) : { data: [] },
      beatIds.length ? supabase.from('beats').select('id, title, full_path').in('id', beatIds) : { data: [] },
    ]);

    const itemMap = new Map();
    (trackItems || []).forEach(t => itemMap.set(`track-${t.id}`, { title: t.title, path: t.file_path }));
    (beatItems || []).forEach(b => itemMap.set(`beat-${b.id}`, { title: b.title, path: b.full_path }));

    container.innerHTML = '';
    if (purchases.length === 0) {
      container.appendChild(cardShell('<p class="empty-state" style="margin:0;padding:0;">No pending purchases.</p>'));
      return;
    }

    for (const purchase of purchases) {
      const item = itemMap.get(`${purchase.item_type}-${purchase.item_id}`) || { title: '(item not found)', path: null };
      const card = cardShell(`
        <p class="title">${escapeHtml(item.title)}</p>
        <p class="meta">Buyer: ${escapeHtml(purchase.buyer_contact)} · K${purchase.amount}${purchase.license_tier ? ' · ' + escapeHtml(tierLabel(purchase.license_tier)) : ''}</p>
        <div class="ref-badge">${escapeHtml(purchase.reference_number)}</div>
        <div class="sms-box">${escapeHtml(purchase.transaction_sms || '(no SMS text)')}</div>
        <div class="row-actions">
          <button class="approve paid">Mark Paid</button>
          <button class="reject">Reject</button>
        </div>
        <div class="signed-url-result"></div>
      `);
      card.querySelector('.paid').addEventListener('click', async (e) => {
        e.target.disabled = true;
        if (!item.path) { alert('Could not find the file for this item.'); e.target.disabled = false; return; }

        const ext = (item.path.split('.').pop() || 'mp3').toLowerCase();
        const safeTitle = (item.title || 'track').replace(/[\\/:*?"<>|]/g, '').trim();
        const { data: signedData, error: signedErr } = await supabase.storage
          .from('private-full')
          .createSignedUrl(item.path, 86400, { download: `${safeTitle}.${ext}` }); // 24h — buyer may not check back within an hour
        if (signedErr) { alert(signedErr.message); e.target.disabled = false; return; }

        const { error } = await supabase.from('purchases')
          .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString(), download_url: signedData.signedUrl })
          .eq('id', purchase.id);
        if (!error) {
          supabase.rpc('increment_purchase_count', { p_item_type: purchase.item_type, p_item_id: purchase.item_id }).then(() => {});
        }
        if (error) { alert(error.message); e.target.disabled = false; return; }

        const resultBox = card.querySelector('.signed-url-result');
        resultBox.innerHTML = `
          <div class="signed-url-box">
            <span>${signedData.signedUrl}</span>
            <button type="button" class="copy-link-btn">Copy</button>
          </div>
        `;
        resultBox.querySelector('.copy-link-btn').addEventListener('click', () => {
          navigator.clipboard.writeText(signedData.signedUrl);
        });
        card.querySelector('.row-actions').remove();
        loadStats();
      });
      card.querySelector('.reject').addEventListener('click', async (e) => {
        e.target.disabled = true;
        const { error } = await supabase.from('purchases').update({ status: 'rejected' }).eq('id', purchase.id);
        if (error) { alert(error.message); e.target.disabled = false; return; }
        card.remove();
        loadStats();
      });
      container.appendChild(card);
    }
    applySearchFilter();
  }

  // Artists receive 75% of a withdrawal; the request stores the full balance, so admins pay 75% of it.
  const ARTIST_SHARE = 0.75;
  const payoutOf = (w) => Math.round(Number(w.amount) * ARTIST_SHARE);
  // Itemised breakdown of a withdrawal: which sales make up the amount. Built from existing data
  // (no new tables): an artist's fulfilled purchases, oldest first, minus what earlier PAID withdrawals
  // already covered, up to this withdrawal's amount. Cached per artist for the current render.
  const salesCache = new Map();
  function artistSales(artistId) {
    if (!salesCache.has(artistId)) salesCache.set(artistId, (async () => {
      const [{ data: tracks }, { data: beats }, { data: paid }] = await Promise.all([
        supabase.from('tracks').select('id, title').eq('owner_id', artistId),
        supabase.from('beats').select('id, title').eq('owner_id', artistId),
        supabase.from('withdrawals').select('id, amount, paid_at').eq('artist_id', artistId).eq('status', 'paid'),
      ]);
      const titles = new Map([...(tracks || []).map(t => ['track:' + t.id, t.title]), ...(beats || []).map(b => ['beat:' + b.id, b.title])]);
      const q = (type, ids) => ids.length
        ? supabase.from('purchases').select('*').eq('item_type', type).eq('status', 'fulfilled').in('item_id', ids)
        : { data: [] };
      const [{ data: tp }, { data: bp }] = await Promise.all([q('track', (tracks || []).map(t => t.id)), q('beat', (beats || []).map(b => b.id))]);
      const sales = [...(tp || []), ...(bp || [])]
        .sort((x, y) => new Date(x.fulfilled_at || x.created_at || 0) - new Date(y.fulfilled_at || y.created_at || 0));
      return { sales, titles, paid: paid || [] };
    })());
    return salesCache.get(artistId);
  }
  async function breakdownHtml(w) {
    const { sales, titles, paid } = await artistSales(w.artist_id);
    const cutoff = w.paid_at ? new Date(w.paid_at).getTime() : Infinity;
    let skip = paid.filter(x => x.id !== w.id && x.paid_at && new Date(x.paid_at).getTime() < cutoff)
      .reduce((n, x) => n + Number(x.amount), 0);
    const target = Number(w.amount);
    let total = 0;
    const rows = [];
    for (const sale of sales) {
      if (total >= target) break;
      let part = Number(sale.amount) || 0;
      if (part <= 0 || skip >= part) { skip -= Math.max(part, 0); continue; }
      part -= skip; skip = 0;
      if (total + part > target) part = target - total;
      total += part;
      const title = titles.get(sale.item_type + ':' + sale.item_id) || 'Unknown item';
      const tier = sale.license_tier ? ` · ${escapeHtml(tierLabel(sale.license_tier))}` : '';
      const date = sale.fulfilled_at ? ` · ${escapeHtml(new Date(sale.fulfilled_at).toLocaleDateString())}` : '';
      const ref = sale.license_id ? ` · ${escapeHtml(sale.license_id)}` : '';
      const partial = part !== (Number(sale.amount) || 0) ? ' (part)' : '';
      rows.push(`<li style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;"><span style="min-width:0;">${escapeHtml(title)}<span style="color:var(--ink-muted);"> (${escapeHtml(sale.item_type)}${tier}${date}${ref})</span></span><span style="flex:none;font-weight:600;">K${part}${partial}</span></li>`);
    }
    const mismatch = total !== target
      ? `<p class="meta" style="color:#b3261e;">Items found total K${total} but this request is K${target} — check manually.</p>` : '';
    return `<ul style="list-style:none;margin:6px 0;padding:0;font-size:13px;">${rows.join('') || '<li>No matching sales found.</li>'}</ul>
      <p class="meta" style="font-weight:600;">Total K${target} → artist gets K${payoutOf(w)} (75%)</p>${mismatch}`;
  }

  // --- Tab 3: Withdrawals ---
  async function loadWithdrawals() {
    const container = document.getElementById('tab-withdrawals');
    container.innerHTML = 'Loading…';

    const { data: withdrawals } = await supabase.from('withdrawals').select('*').eq('status', 'requested');

    container.innerHTML = '';
    if (!withdrawals || withdrawals.length === 0) {
      container.appendChild(cardShell('<p class="empty-state" style="margin:0;padding:0;">No pending withdrawals.</p>'));
      return;
    }

    for (const w of withdrawals) {
      const card = cardShell(`
        <p class="title">K${w.amount} requested</p>
        <p class="meta" style="font-weight:700;color:var(--accent);font-size:15px;">Pay K${payoutOf(w)} (75%)</p>
        <p class="meta">Send to: ${escapeHtml(w.momo_number)}</p>
        <div class="wd-items"><p class="meta">Loading items…</p></div>
        <div class="row-actions">
          <button class="approve paid">Mark Paid</button>
        </div>
      `);
      breakdownHtml(w).then(html => { card.querySelector('.wd-items').innerHTML = html; })
        .catch(() => { card.querySelector('.wd-items').innerHTML = '<p class="meta">Couldn\'t load items.</p>'; });
      card.querySelector('.paid').addEventListener('click', async (e) => {
        e.target.disabled = true;
        const { error } = await supabase.from('withdrawals')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', w.id);
        if (error) { alert(error.message); e.target.disabled = false; return; }
        card.remove();
        loadStats();
      });
      container.appendChild(card);
    }
    applySearchFilter();
  }

  // --- Tab 4: Live Content (approved tracks + beats, with take-down) ---
  async function loadLive() {
    const container = document.getElementById('tab-live');
    container.innerHTML = 'Loading…';

    const [{ data: tracks }, { data: beats }] = await Promise.all([
      supabase.from('tracks').select('*').eq('status', 'approved'),
      supabase.from('beats').select('*').eq('status', 'approved'),
    ]);

    const items = [
      ...(tracks || []).map(t => ({ ...t, itemType: 'track' })),
      ...(beats || []).map(b => ({ ...b, itemType: 'beat' })),
    ];

    container.innerHTML = '';
    if (items.length === 0) {
      container.appendChild(cardShell('<p class="empty-state" style="margin:0;padding:0;">Nothing live yet.</p>'));
      return;
    }

    for (const item of items) {
      const priceLabel = item.itemType === 'track' ? (item.is_free ? 'Free' : `K${item.price}`) : `K${item.price}`;
      const card = cardShell(`
        <p class="title">${escapeHtml(item.title)} <span style="font-weight:400;color:var(--ink-muted);">(${item.itemType})</span></p>
        <p class="meta">${escapeHtml(item.genre || '')} · ${priceLabel}</p>
        <div class="row-actions">
          <button class="reject" style="flex:none;width:100%;">Take down</button>
        </div>
      `);
      card.querySelector('.reject').addEventListener('click', async (e) => {
        if (!confirm(`Take down "${item.title}"? It will no longer be visible to anyone.`)) return;
        e.target.disabled = true;
        const table = item.itemType === 'beat' ? 'beats' : 'tracks';
        const { error } = await supabase.from(table).update({ status: 'removed', removed_at: new Date().toISOString() }).eq('id', item.id);
        if (error) { alert(error.message); e.target.disabled = false; return; }
        card.remove();
        loadStats();
      });
      container.appendChild(card);
    }
    applySearchFilter();
  }

  // --- Complaints (buyer "Report a problem" messages; needs supabase/complaints.sql) ---
  async function loadComplaints() {
    const container = document.getElementById('tab-complaints');
    container.innerHTML = 'Loading…';
    const { data: rows, error } = await supabase.from('purchase_complaints').select('*').order('created_at', { ascending: false });
    container.innerHTML = '';
    if (error) {
      container.appendChild(cardShell(`<p class="empty-state" style="margin:0;padding:0;">Could not load complaints: ${escapeHtml(error.message || 'unknown error')}. If the table is missing, run supabase/complaints.sql in the Supabase SQL editor.</p>`));
      return;
    }
    if (!rows || rows.length === 0) {
      container.appendChild(cardShell('<p class="empty-state" style="margin:0;padding:0;">No complaints.</p>'));
      return;
    }
    const beatIds = [...new Set(rows.map(r => r.item_id))];
    const producerIds = [...new Set(rows.map(r => r.producer_id))];
    const [{ data: beats }, { data: producers }] = await Promise.all([
      supabase.from('beats').select('id, title').in('id', beatIds),
      supabase.from('profiles').select('id, display_name').in('id', producerIds),
    ]);
    const titleMap = new Map((beats || []).map(b => [String(b.id), b.title]));
    const prodMap = new Map((producers || []).map(a => [a.id, a.display_name || 'Unnamed']));
    for (const r of [...rows].sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1))) {
      const open = r.status !== 'resolved';
      const card = cardShell(`
        <p class="title">${escapeHtml(titleMap.get(String(r.item_id)) || 'Beat #' + r.item_id)} <span style="font-weight:400;color:${open ? '#b3261e' : 'var(--ink-muted)'};">(${open ? 'open' : 'resolved'})</span></p>
        <p class="meta">Buyer: ${escapeHtml(r.buyer_name || 'Unknown')} · ${escapeHtml(r.buyer_contact || 'no contact')}</p>
        <p class="meta">Producer: ${escapeHtml(prodMap.get(r.producer_id) || 'Unknown')} · ${escapeHtml(new Date(r.created_at).toLocaleString())}</p>
        <p style="margin:8px 0;font-size:14px;white-space:pre-wrap;">${escapeHtml(r.message)}</p>
        ${open ? '<div class="row-actions"><button class="approve resolve">Mark resolved</button></div>' : ''}
      `);
      const btn = card.querySelector('.resolve');
      if (btn) btn.addEventListener('click', async (e) => {
        e.target.disabled = true;
        const { error: upErr } = await supabase.from('purchase_complaints').update({ status: 'resolved' }).eq('id', r.id);
        if (upErr) { alert(upErr.message); e.target.disabled = false; return; }
        loadComplaints();
      });
      container.appendChild(card);
    }
    applySearchFilter();
  }

  // --- Tab 5: Users (with computed artist balances) ---
  async function computeArtistBalance(artistId) {
    const [{ data: tracks }, { data: beats }] = await Promise.all([
      supabase.from('tracks').select('id').eq('owner_id', artistId),
      supabase.from('beats').select('id').eq('owner_id', artistId),
    ]);
    const trackIds = (tracks || []).map(t => t.id);
    const beatIds = (beats || []).map(b => b.id);

    let earned = 0;
    if (trackIds.length) {
      const { data } = await supabase.from('purchases').select('amount').eq('item_type', 'track').eq('status', 'fulfilled').in('item_id', trackIds);
      earned += (data || []).reduce((s, p) => s + Number(p.amount), 0);
    }
    if (beatIds.length) {
      const { data } = await supabase.from('purchases').select('amount').eq('item_type', 'beat').eq('status', 'fulfilled').in('item_id', beatIds);
      earned += (data || []).reduce((s, p) => s + Number(p.amount), 0);
    }

    const { data: paidWithdrawals } = await supabase.from('withdrawals').select('amount').eq('artist_id', artistId).eq('status', 'paid');
    const withdrawn = (paidWithdrawals || []).reduce((s, w) => s + Number(w.amount), 0);

    return earned - withdrawn;
  }

  async function loadUsers() {
    const container = document.getElementById('tab-users');
    container.innerHTML = 'Loading…';

    const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });

    container.innerHTML = '';
    if (!profiles || profiles.length === 0) {
      container.appendChild(cardShell('<p class="empty-state" style="margin:0;padding:0;">No users yet.</p>'));
      return;
    }

    for (const p of profiles) {
      const card = cardShell(`
        <p class="title">${escapeHtml(p.display_name || 'Unnamed')} ${p.is_admin ? '<span class="admin-tag">(admin)</span>' : ''}</p>
        <p class="meta">${escapeHtml(p.role)}${p.momo_number ? ' · MoMo: ' + escapeHtml(p.momo_number) : ''}</p>
        <p class="meta balance-line">${p.role === 'artist' ? 'Loading balance…' : ''}</p>
        ${p.is_admin ? '' : '<div class="row-actions"><button class="reject delete-user-btn" style="flex:none;width:100%;">Delete account</button></div>'}
      `);
      container.appendChild(card);

      if (p.role === 'artist') {
        computeArtistBalance(p.id).then(balance => {
          card.querySelector('.balance-line').textContent = `Balance: K${balance}`;
        });
      }

      const deleteBtn = card.querySelector('.delete-user-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          if (!confirm(`Delete "${p.display_name || 'this user'}"? This permanently removes their account and everything they uploaded. This cannot be undone.`)) return;
          deleteBtn.disabled = true;
          const { data, error } = await supabase.functions.invoke('admin-delete-user', { body: { userId: p.id } });
          if (error) {
            let message = error.message;
            try {
              if (error.context && typeof error.context.json === 'function') {
                const body = await error.context.json();
                if (body?.error) message = body.error;
              }
            } catch (_) { /* fall back to generic message */ }
            alert(message);
            deleteBtn.disabled = false;
            return;
          }
          if (data?.error) {
            alert(data.error);
            deleteBtn.disabled = false;
            return;
          }
          card.remove();
          loadStats();
        });
      }
    }
    applySearchFilter();
  }

}
