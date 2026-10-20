// Adapter view generated from legacy/original/my-uploads.html (tools/convert-page.mjs).
// Page logic is unchanged; the shared Supabase client, router navigation and timer cleanup are injected.
import { navigate as __navigate, reload as __reload } from '../lib/router.js';
import { licensingEnabled } from '../lib/licenses.js';
import { songLicensingEnabled } from '../lib/song-licenses.js';
import { createSongLicenseForm } from '../ui/song-license-form.js';
import { mountStemRequests } from '../ui/stem-requests.js';
import { complaintsEnabled, mountProducerComplaints } from '../ui/complaints.js';
import { revealList, LIST_PAGE } from '../ui/paging.js';

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
    const removedLabel = item.removal_kind === 'declined' ? 'Declined' : item.removal_kind === 'deleted' ? 'Removed' : null;
    const label = item.exclusive_sold ? 'Sold exclusively' : (item.status === 'removed' && removedLabel) || (STATUS_LABELS[item.status] || item.status);
    // why ZAMI declined / removed it (set by an admin), so the artist is never left guessing
    const reasonSection = item.status === 'removed' && item.removed_reason ? `
      <div class="pay-section" style="border-color:var(--danger,#b3261e);">
        <p class="pay-instructions" style="margin:0 0 6px;"><strong style="color:var(--danger,#b3261e);">${escapeHtml(removedLabel || 'Taken down')} by ZAMI.</strong> Reason: ${escapeHtml(item.removed_reason)}</p>
        <p class="status-line" style="margin:0;">Think this is a mistake? Contact management at <a href="mailto:zamimusicltd@gmail.com">zamimusicltd@gmail.com</a>.</p>
      </div>` : '';
    const paySection = item.status === 'pending_payment' ? `
      <div class="pay-section" data-pay-section>
        <div class="ref-badge">
          <span>Reference</span>
          <strong>${escapeHtml(item.reference_number)}</strong>
        </div>
        <p class="pay-instructions">Pay the listing fee of <strong>K50</strong> via MoMo <strong>Send Money</strong> to <strong>0573 678 363</strong> — no extra withdrawal charges. Then paste your payment confirmation SMS below.</p>
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
      ${paySection}${reasonSection}
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
  let stemsMounted = false;

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
    if (!stemsMounted) {
      stemsMounted = true;
      licensingEnabled().then((on) => {
        if (!on) return;
        mountStemRequests({ supabase, container: list.parentNode, before: list, userId: currentUserId,
          titleFor: (beatId) => (uploads.find((u) => u.itemType === 'beat' && String(u.id) === String(beatId)) || {}).title });
      }).catch(() => {});
      complaintsEnabled(supabase).then((on) => {
        if (!on) return;
        mountProducerComplaints({ supabase, container: list.parentNode, before: list, userId: currentUserId,
          titleFor: (beatId) => (uploads.find((u) => u.itemType === 'beat' && String(u.id) === String(beatId)) || {}).title });
      }).catch(() => {});
    }
  }

  function renderList() {
    const keep = list._shownCount ? list._shownCount() : 0; // a live update re-renders: keep what was already scrolled through
    list.innerHTML = '';
    if (uploads.length === 0) {
      list.innerHTML = '<p class="empty-state">No uploads yet.</p>';
      return;
    }
    const nodes = [];
    for (const item of uploads) {
      const cardEl = document.createElement('div');
      cardEl.className = 'card';
      cardEl.dataset.itemId = item.id;
      cardEl.dataset.itemType = item.itemType;
      cardEl.innerHTML = cardHtml(item);
      wireCardActions(cardEl, item);
      nodes.push(cardEl);
      if (item.itemType === 'beat') licensingEnabled().then((on) => { if (on) mountStemsLinkEditor(cardEl, item); }).catch(() => {});
      if (item.itemType === 'track') songLicensingEnabled().then((on) => { if (on) mountSongLicenseEditor(cardEl, item); }).catch(() => {});
    }
    revealList(list, nodes, { initial: Math.max(keep, LIST_PAGE) });
  }

  // Optional licenses for a song the artist already uploaded: add, change or stop offering them.
  // Licenses that were already sold keep the terms they were bought with.
  function mountSongLicenseEditor(cardEl, item) {
    if (item.status === 'removed') return;
    const det = document.createElement('details'); det.className = 'slic-card';
    const sum = document.createElement('summary');
    const label = () => { const n = item.license_tiers ? Object.keys(item.license_tiers).length : 0; return n ? `Song licenses (${n} offered)` : 'Offer licenses for this song'; };
    sum.textContent = label();
    const body = document.createElement('div');
    const msg = document.createElement('p'); msg.className = 'lic-msg';
    const actions = document.createElement('div'); actions.className = 'lic-actions';
    const save = document.createElement('button'); save.type = 'button'; save.className = 'lic-btn lic-btn--primary'; save.textContent = 'Save licenses';
    const stop = document.createElement('button'); stop.type = 'button'; stop.className = 'lic-btn'; stop.textContent = 'Stop offering licenses';
    actions.append(save); if (item.license_tiers) actions.append(stop);
    const note = document.createElement('p'); note.className = 'lic-note';
    note.textContent = 'Licenses already sold stay valid for their full term, even if you change or stop offering them. Your regular download is not affected.';
    body.append(actions, msg, note); det.append(sum, body);
    let form = null;
    det.addEventListener('toggle', () => {
      if (det.open && !form) { form = createSongLicenseForm({ initial: item.license_tiers, idPrefix: `mu${item.id}` }); body.prepend(form.el); }
    });
    const run = async (patch, doneText) => {
      save.disabled = stop.disabled = true; msg.className = 'lic-msg'; msg.textContent = 'Saving\u2026';
      const { data, error } = await supabase.from('tracks').update(patch).eq('id', item.id).eq('owner_id', currentUserId).select('license_tiers');
      save.disabled = stop.disabled = false;
      if (error || !data || !data.length) { msg.className = 'lic-msg is-error'; msg.textContent = `Couldn't save: ${(error && error.message) || 'please try again'}`; return; }
      item.license_tiers = data[0].license_tiers; sum.textContent = label(); msg.textContent = doneText;
    };
    save.addEventListener('click', () => {
      if (!form) return;
      const r = form.collect();
      if (r.error) { msg.className = 'lic-msg is-error'; msg.textContent = r.error; return; }
      run({ license_tiers: r.tiers, license_rights_confirmed: true }, 'Saved \u2713 Your licenses are now on the song page.');
    });
    stop.addEventListener('click', () => run({ license_tiers: null }, 'Licenses switched off. Sold licenses stay valid.'));
    cardEl.appendChild(det);
  }

  // Producer's private Stems / WAV link (Google Drive) for Premium & Exclusive buyers. Saved in beat_extras.
  async function mountStemsLinkEditor(cardEl, item) {
    const box = document.createElement('div');
    box.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid var(--border,#e5e5e5);';
    const label = document.createElement('p'); label.className = 'meta';
    label.style.cssText = 'margin:0 0 6px;font-size:12px;color:var(--ink-muted);';
    label.textContent = 'Stems / WAV link (Google Drive) — only Premium & Exclusive buyers can open it';
    const input = document.createElement('input'); input.type = 'url'; input.placeholder = 'https://drive.google.com/…';
    input.style.cssText = 'width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border,#ddd);border-radius:10px;font:inherit;font-size:14px;';
    const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Save link'; save.className = 'primary';
    save.style.cssText = 'margin-top:8px;';
    const status = document.createElement('p'); status.style.cssText = 'margin:6px 0 0;font-size:12px;color:var(--ink-muted);';
    box.append(label, input, save, status); cardEl.appendChild(box);
    const key = String(item.id);
    const { data: cur, error: curErr } = await supabase.from('beat_extras').select('link').eq('beat_id', key).maybeSingle();
    if (curErr) { status.textContent = `Couldn't load the saved link (${curErr.message}).`; }
    else if (cur && cur.link) { input.value = cur.link; status.textContent = 'Link saved — buyers of Premium & Exclusive can open it.'; }
    else { status.textContent = 'No link saved yet — buyers have nothing to download until you add one.'; }
    save.addEventListener('click', async () => {
      const link = input.value.trim();
      if (!/^https?:\/\//i.test(link)) { status.textContent = 'Paste a full link starting with https://'; return; }
      save.disabled = true;
      const { error } = await supabase.from('beat_extras').upsert({ beat_id: key, owner_id: currentUserId, link, updated_at: new Date().toISOString() }, { onConflict: 'beat_id' });
      save.disabled = false;
      status.textContent = error ? `Couldn't save the link: ${error.message}` : 'Link saved ✓';
    });
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
    if (previousStatus !== 'removed' && newRow.status === 'removed') {
      notifyRemoved(uploads[idx]);
    }
  }

  function notifyRemoved(item) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(item.removal_kind === 'declined' ? 'Your upload was declined' : 'Your song was removed', { body: `${item.title}${item.removed_reason ? ': ' + item.removed_reason : ''}` });
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
