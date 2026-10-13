// Buyer-side controls on a purchased beat: save the license image, see the producer's WAV/stems link,
// and ask the producer for stems (delivered off-platform, so it costs no storage).
import { loadCssOnce } from '../lib/licenses.js';
import { saveLicense } from './license-canvas.js';
import { complaintsEnabled } from './complaints.js';

const producerNames = new Map();
async function producerName(supabase, ownerId) {
  if (producerNames.has(ownerId)) return producerNames.get(ownerId);
  let name = '';
  try { const { data } = await supabase.from('profiles').select('display_name').eq('id', ownerId).maybeSingle(); name = (data && data.display_name) || ''; } catch { /* optional */ }
  producerNames.set(ownerId, name);
  return name;
}

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

// purchase: row from `purchases`; item: { title, owner_id, license_tiers }
export function addLicenseControls({ supabase, row, purchase, item }) {
  loadCssOnce('app/css/licensing.css');
  const tierCfg = (item.license_tiers && item.license_tiers[purchase.license_tier]) || {};
  const extras = !!tierCfg.extras && purchase.license_tier !== 'basic';
  row.style.flexWrap = 'wrap';
  const box = el('div', 'lic-actions'); box.style.flexBasis = '100%';
  const msg = el('p', 'lic-msg'); msg.style.flexBasis = '100%'; msg.hidden = true;
  const panel = el('div'); panel.style.flexBasis = '100%'; panel.hidden = true;

  const licBtn = el('button', 'lic-btn', 'License'); licBtn.type = 'button';
  licBtn.addEventListener('click', async () => {
    licBtn.disabled = true;
    await saveLicense({ licenseId: purchase.license_id, tier: purchase.license_tier, buyerName: purchase.buyer_name, beatTitle: item.title, producer: await producerName(supabase, item.owner_id), issuedAt: purchase.fulfilled_at, extras });
    licBtn.disabled = false;
  });
  box.append(licBtn);

  if (extras) {
    const stemBtn = el('button', 'lic-btn', 'Stems & WAV'); stemBtn.type = 'button';
    let loaded = false;
    stemBtn.addEventListener('click', async () => {
      panel.hidden = !panel.hidden;
      if (panel.hidden || loaded) return;
      loaded = true; panel.replaceChildren(el('p', 'lic-msg', 'Loading…'));
      const [{ data: ex }, { data: req }] = await Promise.all([
        supabase.from('beat_extras').select('link').eq('beat_id', String(purchase.item_id)).maybeSingle(),
        supabase.from('stem_requests').select('status').eq('purchase_id', String(purchase.id)).maybeSingle(),
      ]);
      panel.replaceChildren();
      const hasLink = !!(ex && /^https?:\/\//i.test(ex.link || ''));
      if (hasLink) {
        const a = el('a', 'lic-btn lic-btn--primary', 'Open your WAV / stems folder'); a.href = ex.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
        panel.append(a, el('p', 'lic-msg', 'This is the Google Drive link the producer uploaded for you. Please keep it private.'));
      } else {
        panel.append(el('p', 'lic-msg', 'The producer has not added a download link yet. Request the files below and they will send them to you.'));
      }
      const reqBtn = el('button', 'lic-btn', hasLink ? 'Link not working? Ask the producer' : 'Request stems / WAV'); reqBtn.type = 'button';
      const note = el('p', 'lic-msg', 'The producer sends the files themselves, usually on WhatsApp. Your name and phone number are shared with them so they can reach you.');
      const setState = (status) => {
        if (status === 'delivered') { reqBtn.textContent = 'Producer marked as delivered'; reqBtn.disabled = true; }
        else if (status === 'requested') { reqBtn.textContent = 'Requested — waiting for the producer'; reqBtn.disabled = true; }
      };
      if (req) setState(req.status);
      reqBtn.addEventListener('click', async () => {
        reqBtn.disabled = true;
        const { error } = await supabase.from('stem_requests').insert({ purchase_id: String(purchase.id), beat_id: String(purchase.item_id), producer_id: item.owner_id, buyer_name: purchase.buyer_name || null, buyer_contact: purchase.buyer_contact || null });
        if (error && error.code !== '23505') { reqBtn.disabled = false; msg.hidden = false; msg.className = 'lic-msg is-error'; msg.textContent = "Couldn't send the request. Please try again."; return; }
        msg.hidden = true; setState('requested');
      });
      panel.append(reqBtn, note);
    });
    box.append(stemBtn);
  }

  // "Report a problem": message goes to ZAMI management (Admin -> Complaints) and to the producer.
  complaintsEnabled(supabase).then((on) => {
    if (!on) return;
    const cBtn = el('button', 'lic-btn', 'Report a problem'); cBtn.type = 'button';
    const cPanel = el('div'); cPanel.style.flexBasis = '100%'; cPanel.hidden = true;
    let built = false;
    cBtn.addEventListener('click', async () => {
      cPanel.hidden = !cPanel.hidden;
      if (cPanel.hidden || built) return;
      built = true;
      const past = el('div');
      const ta = el('textarea'); ta.maxLength = 1000; ta.rows = 4; ta.placeholder = 'Describe the problem (e.g. the link does not work, the files are missing, wrong beat…)';
      ta.style.cssText = 'width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--zs-border,#ddd);border-radius:10px;font:inherit;font-size:14px;margin-top:6px;';
      const send = el('button', 'lic-btn lic-btn--primary', 'Send to ZAMI & the producer'); send.type = 'button';
      const info = el('p', 'lic-msg', 'Your message, name and phone number go to ZAMI management and the producer so they can help you.');
      const showPast = (rows) => past.replaceChildren(...rows.map((r) => el('p', 'lic-msg', `Sent ${new Date(r.created_at).toLocaleDateString()} — ${r.status === 'resolved' ? 'resolved' : 'open'}: ${r.message}`)));
      try {
        const { data } = await supabase.from('purchase_complaints').select('message, status, created_at').eq('purchase_id', String(purchase.id)).order('created_at', { ascending: false });
        if (data && data.length) showPast(data);
      } catch { /* optional */ }
      send.addEventListener('click', async () => {
        const text = ta.value.trim();
        if (text.length < 5) { info.className = 'lic-msg is-error'; info.textContent = 'Please describe the problem (at least a few words).'; return; }
        send.disabled = true;
        const { error } = await supabase.from('purchase_complaints').insert({ purchase_id: String(purchase.id), item_id: String(purchase.item_id), item_type: 'beat', producer_id: item.owner_id, buyer_name: purchase.buyer_name || null, buyer_contact: purchase.buyer_contact || null, message: text });
        if (error) { send.disabled = false; info.className = 'lic-msg is-error'; info.textContent = "Couldn't send your message. Please try again."; return; }
        past.prepend(el('p', 'lic-msg', `Sent just now — open: ${text}`));
        ta.value = ''; send.disabled = false; info.className = 'lic-msg'; info.textContent = 'Sent. ZAMI management and the producer have been notified.';
      });
      cPanel.append(past, ta, send, info);
    });
    box.append(cBtn); row.append(cPanel);
  }).catch(() => {});
  row.append(box, msg, panel);
}
