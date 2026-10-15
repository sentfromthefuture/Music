// Adapter view generated from legacy/original/checkout.html (tools/convert-page.mjs).
// Page logic is unchanged; the shared Supabase client, router navigation and timer cleanup are injected.
import { navigate as __navigate, reload as __reload } from '../lib/router.js';
import { readTiers, loadCssOnce } from '../lib/licenses.js';
import { saveLicense } from '../ui/license-canvas.js';
import { readSongLicenses, songTermsFor, BUYER_NOTE } from '../lib/song-licenses.js';
import { saveSongLicense } from '../ui/song-license-canvas.js';

export const title = "Checkout — Music Platform";
export const css = 'css/views/checkout.css';
export const markup = `<div class="wrap">
  <h1>Checkout</h1>

  <div id="loading" class="gate-msg">Loading…</div>

  <div id="content" class="hidden">
    <div class="card">
      <div class="row">
        <div class="thumb" id="item-thumb">♪</div>
        <div>
          <p class="title" id="item-title">—</p>
          <p class="meta" id="item-meta">—</p>
        </div>
      </div>

      <!-- Free track: instant download -->
      <div id="free-section" class="hidden">
        <p class="price"><span class="free">Free</span></p>
        <a href="#" id="free-download-link" class="download-link" download>Download now</a>
      </div>

      <!-- Paid item: buy flow -->
      <div id="buy-section" class="hidden">
        <p class="price" id="price-display">—</p>

        <div id="phone-step">
          <label for="phone-input">Your phone number</label>
          <input type="tel" id="phone-input" placeholder="0971234567" />
          <button type="button" class="primary" id="start-purchase-btn">Buy</button>
          <p class="status-line" id="phone-status"></p>
        </div>

        <div id="pay-step" class="hidden">
          <div class="ref-badge">
            <span>Reference</span>
            <strong id="ref-number">—</strong>
          </div>
          <p class="meta" id="pay-instructions"></p>
          <textarea id="sms-input" placeholder="Paste your payment confirmation SMS"></textarea>
          <button type="button" class="primary" id="sms-submit-btn">Submit for review</button>
          <p class="status-line" id="sms-status"></p>
        </div>

        <div id="waiting-step" class="hidden">
          <p class="status-line" style="margin-top:14px;">Submitted — waiting for confirmation. Once approved, your download link will appear on your account profile, so feel free to leave this page.</p>
        </div>

        <div id="fulfilled-step" class="hidden">
          <p class="success-text">✅ Payment confirmed!</p>
          <a href="#" id="paid-download-link" class="download-link" download>Download now</a>
        </div>
      </div>
    </div>
  </div>
</div>`;

export async function mount({ supabase, timers: __t, document }) {
  const params = new URLSearchParams(window.location.search);
  const itemType = params.get('type'); // 'track' or 'beat'
  const itemId = params.get('id');

  const loading = document.getElementById('loading');
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

  function genRef() {
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `ORD-${rand}`;
  }

  (async () => {
    if (!itemType || !itemId || !['track', 'beat'].includes(itemType)) {
      loading.textContent = 'Invalid or missing item.';
      return;
    }

    const table = itemType === 'beat' ? 'beats' : 'tracks';
    const { data: item, error } = await supabase.from(table).select('*').eq('id', itemId).eq('status', 'approved').maybeSingle();

    if (error || !item) {
      loading.textContent = 'This item is not available.';
      return;
    }

    // Beats with license tiers need a chosen tier (?tier=basic|premium|exclusive); older beats don't.
    const tiers = itemType === 'beat' ? readTiers(item) : null;
    let chosen = null;
    if (tiers) {
      chosen = tiers.find((t) => t.key === params.get('tier')) || null;
      if (!chosen) {
        loading.textContent = '';
        const a = document.createElement('a');
        a.href = `detail.html?type=beat&id=${encodeURIComponent(item.id)}`;
        a.textContent = 'Choose a license on the beat page';
        loading.append('Please choose which license you want. ', a, '.');
        return;
      }
    }

    // Songs: an optional license (?license=creator|business|film|broadcast|live) instead of the regular download.
    if (itemType === 'track' && params.get('license')) {
      chosen = (readSongLicenses(item) || []).find((l) => l.key === params.get('license')) || null;
      if (!chosen) {
        loading.textContent = '';
        const a = document.createElement('a');
        a.href = `detail.html?type=track&id=${encodeURIComponent(item.id)}`;
        a.textContent = 'See the licenses on the song page';
        loading.append('This license is not offered for this song. ', a, '.');
        return;
      }
    }

    loading.classList.add('hidden');
    content.classList.remove('hidden');

    document.getElementById('item-title').textContent = item.title;
    document.getElementById('item-meta').textContent = `${item.genre || ''}${itemType === 'beat' ? ' · Beat' : ''}${chosen ? ' · ' + chosen.label + (chosen.song ? ' license' : '') : ''}`;
    if (item.cover_url) {
      const thumb = document.getElementById('item-thumb');
      thumb.style.backgroundImage = `url(${item.cover_url})`;
      thumb.textContent = '';
    }

    const isFreeTrack = itemType === 'track' && item.is_free && !chosen;

    if (isFreeTrack) {
      document.getElementById('free-section').classList.remove('hidden');
      const ext = (item.file_path.split('.').pop() || 'mp3').toLowerCase();
      const safeTitle = (item.title || 'track').replace(/[\\/:*?"<>|]/g, '').trim();
      const publicUrl = supabase.storage.from('public-previews').getPublicUrl(item.file_path, { download: `${safeTitle}.${ext}` }).data.publicUrl;
      document.getElementById('free-download-link').href = publicUrl;
    } else {
      document.getElementById('buy-section').classList.remove('hidden');
      document.getElementById('price-display').textContent = `K${chosen ? chosen.price : item.price}`;
      if (chosen && chosen.song) {
        loadCssOnce('app/css/licensing.css');
        let artist = '';
        try { const { data } = await supabase.from('profiles').select('display_name').eq('id', item.owner_id).maybeSingle(); artist = (data && data.display_name) || ''; } catch { /* name is optional */ }
        const det = document.createElement('details'); det.className = 'lic-terms'; det.open = true;
        const sum = document.createElement('summary'); sum.textContent = 'What this license includes'; det.append(sum);
        const ul = document.createElement('ul');
        for (const t of songTermsFor(chosen.key, { artist, months: chosen.months, territory: chosen.territory })) { const li = document.createElement('li'); li.textContent = t; ul.append(li); }
        const note = document.createElement('p'); note.className = 'lic-note'; note.textContent = BUYER_NOTE + ' You also get the song file.';
        det.append(ul, note);
        const priceEl = document.getElementById('price-display'); priceEl.parentNode.insertBefore(det, priceEl.nextSibling);
      }
      wireBuyFlow(item, table, chosen);
    }
  })();

  function wireBuyFlow(item, table, chosen) {
    const unitPrice = chosen ? chosen.price : item.price;
    // License beats ask for the name printed on the license.
    let nameInput = null;
    if (chosen) {
      loadCssOnce('app/css/licensing.css');
      const startBtn = document.getElementById('start-purchase-btn');
      const lab = document.createElement('label'); lab.setAttribute('for', 'buyer-name-input'); lab.textContent = 'Name on your license';
      nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.id = 'buyer-name-input'; nameInput.maxLength = 60; nameInput.placeholder = 'Your name or artist name'; nameInput.autocomplete = 'name';
      startBtn.parentNode.insertBefore(lab, document.getElementById('phone-input').previousElementSibling);
      startBtn.parentNode.insertBefore(nameInput, document.getElementById('phone-input').previousElementSibling);
    }
    const phoneStep = document.getElementById('phone-step');
    const payStep = document.getElementById('pay-step');
    const waitingStep = document.getElementById('waiting-step');
    const fulfilledStep = document.getElementById('fulfilled-step');
    const phoneStatus = document.getElementById('phone-status');
    const smsStatus = document.getElementById('sms-status');

    let purchaseRow = null;
    let submitting = false;

    document.getElementById('start-purchase-btn').addEventListener('click', async () => {
      if (submitting) return;
      const buyerName = nameInput ? nameInput.value.trim() : '';
      if (nameInput && !buyerName) {
        phoneStatus.textContent = 'Enter the name to print on your license.';
        phoneStatus.classList.add('error');
        return;
      }
      const rawPhone = document.getElementById('phone-input').value;
      const phone = normalizeZambianPhone(rawPhone);
      if (!phone) {
        phoneStatus.textContent = 'Enter a valid Zambian number, e.g. 0971234567';
        phoneStatus.classList.add('error');
        return;
      }
      submitting = true;
      phoneStatus.textContent = 'Starting your order…';
      phoneStatus.classList.remove('error');

      let inserted = null;
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
        const reference_number = genRef();
        const { data, error } = await supabase.from('purchases').insert({
          buyer_id: currentUser ? currentUser.id : null,
          buyer_contact: phone,
          item_id: item.id,
          item_type: table === 'beats' ? 'beat' : 'track',
          amount: unitPrice,
          reference_number,
          ...(chosen ? (chosen.song ? { song_license_tier: chosen.key, buyer_name: buyerName } : { license_tier: chosen.key, buyer_name: buyerName }) : {}),
        }).select().single();
        if (!error) { inserted = data; break; }
        if (error.code !== '23505') {
          phoneStatus.textContent = error.message;
          phoneStatus.classList.add('error');
          submitting = false;
          return;
        }
      }
      submitting = false;
      if (!inserted) {
        phoneStatus.textContent = 'Something went wrong, please try again.';
        phoneStatus.classList.add('error');
        return;
      }

      purchaseRow = inserted;
      document.getElementById('ref-number').textContent = inserted.reference_number;
      document.getElementById('pay-instructions').innerHTML =
        `Send Money for <strong>K${unitPrice}</strong> (the exact amount) via MoMo to <strong>0573 678 363</strong>, then paste your payment confirmation SMS below. Once your payment is approved, a download link will appear on your account profile — you're free to leave this page after submitting.`;
      phoneStep.classList.add('hidden');
      payStep.classList.remove('hidden');

      subscribeToPurchase(inserted.id);
    });

    document.getElementById('sms-submit-btn').addEventListener('click', async () => {
      if (submitting || !purchaseRow) return;
      const smsText = document.getElementById('sms-input').value.trim();
      if (!smsText) {
        smsStatus.textContent = 'Please paste your confirmation SMS.';
        smsStatus.classList.add('error');
        return;
      }
      submitting = true;
      smsStatus.textContent = 'Submitting…';
      smsStatus.classList.remove('error');

      // Buyers have no UPDATE permission on purchases (by design), so the SMS goes through a narrow database
      // function (supabase/hardening.sql). Until that is installed, fall back to the old direct update.
      let error = null;
      const viaRpc = await supabase.rpc('submit_purchase_sms', { p_purchase_id: String(purchaseRow.id), p_sms: smsText });
      if (viaRpc.error) {
        ({ error } = await supabase.from('purchases').update({ transaction_sms: smsText }).eq('id', purchaseRow.id));
      } else if (viaRpc.data === false) {
        error = { message: 'We could not save your message. Please refresh and try again.' };
      }
      submitting = false;
      if (error) {
        smsStatus.textContent = error.message;
        smsStatus.classList.add('error');
        return;
      }
      payStep.classList.add('hidden');
      waitingStep.classList.remove('hidden');
    });

    function showLicenseButton(row) {
      const box = document.getElementById('fulfilled-step');
      if (box.querySelector('.lic-actions')) return;
      const wrap = document.createElement('div'); wrap.className = 'lic-actions';
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'lic-btn lic-btn--primary'; btn.textContent = 'Save your license';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        let producer = '';
        try { const { data } = await supabase.from('profiles').select('display_name').eq('id', item.owner_id).maybeSingle(); producer = (data && data.display_name) || ''; } catch { /* name is optional */ }
        if (chosen.song) {
          const t = row.license_terms || {};
          await saveSongLicense({ licenseId: row.license_id, type: row.song_license_tier || chosen.key, buyerName: row.buyer_name, title: t.title || item.title, artist: t.artist || producer, issuedAt: row.fulfilled_at, months: t.months != null ? t.months : chosen.months, territory: t.territory || chosen.territory });
        } else {
          await saveLicense({ licenseId: row.license_id, tier: row.license_tier, buyerName: row.buyer_name, beatTitle: item.title, producer, issuedAt: row.fulfilled_at, extras: chosen.extras });
        }
        btn.disabled = false;
      });
      wrap.append(btn);
      box.append(wrap);
      if (chosen.extras) {
        const note = document.createElement('p'); note.className = 'lic-msg';
        note.textContent = 'Need the WAV or stems? Open your account, find this purchase and tap "Stems & WAV".';
        box.append(note);
      }
    }

    function subscribeToPurchase(id) {
      supabase
        .channel(`purchase-${id}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'purchases', filter: `id=eq.${id}`,
        }, (payload) => {
          if (payload.new.status === 'fulfilled' && payload.new.download_url) {
            payStep.classList.add('hidden');
            waitingStep.classList.add('hidden');
            fulfilledStep.classList.remove('hidden');
            document.getElementById('paid-download-link').href = payload.new.download_url;
            if (chosen) showLicenseButton(payload.new);
          }
        })
        .subscribe();
    }
  }

}
