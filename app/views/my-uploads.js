// Adapter view generated from legacy/original/my-uploads.html (tools/convert-page.mjs).
// Page logic is unchanged; the shared Supabase client, router navigation and timer cleanup are injected.
import { navigate as __navigate, reload as __reload } from '../lib/router.js';

export const title = "My Uploads — Music Platform";
export const css = 'css/views/my-uploads.css';
export const markup = `<div class="wrap">
  <div class="header-row">
    <div>
      <h1>My Uploads</h1>
      <p class="sub">Track the status of everything you've uploaded.</p>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
      <a href="upload.html" id="new-upload-link" style="background:var(--accent);color:var(--accent-ink);border-radius:8px;font-size:12px;font-weight:600;padding:8px 12px;text-decoration:none;white-space:nowrap;">+ New Upload</a>
      <button type="button" id="notif-btn" class="hidden">Enable notifications</button>
    </div>
  </div>

  <div id="gate" class="gate-msg">Checking access…</div>
  <div id="list" class="hidden"></div>
</div>`;

export async function mount({ supabase, timers: __t, document }) {
  const gate = document.getElementById('gate');
  const list = document.getElementById('list');
  const notifBtn = document.getElementById('notif-btn');

  const STATUS_LABELS = {
    pending_payment: 'Awaiting payment',
    pending_review: 'Pending review',
    approved: 'Live',
    removed: 'Taken down',
  };

  let currentUserId = null;

  (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      gate.innerHTML = 'Please <a href="login.html">log in</a> first.';
      return;
    }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile || profile.role !== 'artist') {
      gate.textContent = 'This page is for artists only.';
      return;
    }
    currentUserId = user.id;
    gate.classList.add('hidden');
    list.classList.remove('hidden');

    if ('Notification' in window && Notification.permission === 'default') {
      notifBtn.classList.remove('hidden');
    }

    await loadUploads();
    subscribeToChanges();
  })();

  notifBtn.addEventListener('click', async () => {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      notifBtn.textContent = 'Notifications on';
      notifBtn.disabled = true;
    }
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function cardHtml(item) {
    const label = STATUS_LABELS[item.status] || item.status;
    const paySection = item.status === 'pending_payment' ? `
      <div class="pay-section" data-pay-section>
        <div class="ref-badge">
          <span>Reference</span>
          <strong>${escapeHtml(item.reference_number)}</strong>
        </div>
        <p class="pay-instructions">Pay the listing fee of <strong>K25</strong> via MoMo <strong>Send Money</strong> to <strong>0573 678 363</strong> — no extra withdrawal charges. Then paste your payment confirmation SMS below.</p>
        <textarea placeholder="Paste your payment confirmation SMS" data-sms-input></textarea>
        <button type="button" class="primary" data-sms-submit>Submit for review</button>
        <p class="status-line" data-sms-status></p>
      </div>
    ` : '';

    return `
      <div class="row">
        <div class="thumb">${item.itemType === 'beat' ? '♫' : '♪'}</div>
        <div>
          <p class="title">${escapeHtml(item.title)} <span style="font-weight:400;color:var(--ink-muted);">(${item.itemType})</span></p>
          <span class="badge ${item.status}">${escapeHtml(label)}</span>
        </div>
      </div>
      ${paySection}
    `;
  }

  function wireCardActions(cardEl, item) {
    const submitBtn = cardEl.querySelector('[data-sms-submit]');
    if (!submitBtn) return;
    const smsInput = cardEl.querySelector('[data-sms-input]');
    const smsStatus = cardEl.querySelector('[data-sms-status]');
    let submitting = false;

    submitBtn.addEventListener('click', async () => {
      if (submitting) return;
      const smsText = smsInput.value.trim();
      if (!smsText) {
        smsStatus.textContent = 'Please paste your confirmation SMS.';
        smsStatus.classList.add('error');
        return;
      }
      submitting = true;
      submitBtn.disabled = true;
      smsStatus.textContent = 'Submitting…';
      smsStatus.classList.remove('error');

      const table = item.itemType === 'beat' ? 'beats' : 'tracks';
      const { error } = await supabase.from(table)
        .update({ transaction_sms: smsText, status: 'pending_review' })
        .eq('id', item.id);

      submitting = false;
      if (error) {
        smsStatus.textContent = error.message;
        smsStatus.classList.add('error');
        submitBtn.disabled = false;
        return;
      }
      smsInput.disabled = true;
      smsStatus.classList.remove('error');
      smsStatus.textContent = 'Thank you for the purchase and supporting Zambian music! We\u2019re confirming your payment \u2014 this page will update automatically.';
      // The realtime subscription will re-render this card automatically once approved.
    });
  }

  let uploads = [];

  async function loadUploads() {
    const [{ data: tracks }, { data: beats }] = await Promise.all([
      supabase.from('tracks').select('*').eq('owner_id', currentUserId),
      supabase.from('beats').select('*').eq('owner_id', currentUserId),
    ]);

    uploads = [
      ...(tracks || []).map(t => ({ ...t, itemType: 'track' })),
      ...(beats || []).map(b => ({ ...b, itemType: 'beat' })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    renderList();
  }

  function renderList() {
    list.innerHTML = '';
    if (uploads.length === 0) {
      list.innerHTML = '<p class="empty-state">No uploads yet.</p>';
      return;
    }
    for (const item of uploads) {
      const cardEl = document.createElement('div');
      cardEl.className = 'card';
      cardEl.dataset.itemId = item.id;
      cardEl.dataset.itemType = item.itemType;
      cardEl.innerHTML = cardHtml(item);
      wireCardActions(cardEl, item);
      list.appendChild(cardEl);
    }
  }

  function updateItemInPlace(itemType, newRow) {
    const idx = uploads.findIndex(u => u.id === newRow.id && u.itemType === itemType);
    if (idx === -1) return;
    const previousStatus = uploads[idx].status;
    uploads[idx] = { ...uploads[idx], ...newRow, itemType };
    renderList();

    if (previousStatus !== 'approved' && newRow.status === 'approved') {
      notifyApproved(uploads[idx]);
    }
  }

  function notifyApproved(item) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Your upload is live!', { body: item.title });
    }
  }

  function subscribeToChanges() {
    supabase
      .channel('my-uploads-tracks')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'tracks', filter: `owner_id=eq.${currentUserId}`,
      }, (payload) => updateItemInPlace('track', payload.new))
      .subscribe();

    supabase
      .channel('my-uploads-beats')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'beats', filter: `owner_id=eq.${currentUserId}`,
      }, (payload) => updateItemInPlace('beat', payload.new))
      .subscribe();
  }

}
