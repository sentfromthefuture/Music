// Buyer-side controls on a purchased beat: save the license image, see the producer's WAV/stems link,
// and ask the producer for stems (delivered off-platform, so it costs no storage).
import { loadCssOnce } from '../lib/licenses.js';
import { saveLicense } from './license-canvas.js';

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
      if (ex && /^https?:\/\//i.test(ex.link || '')) {
        const a = el('a', 'lic-btn lic-btn--primary', 'Open the producer’s WAV / stems link'); a.href = ex.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
        panel.append(a, el('p', 'lic-msg', 'Link provided by the producer. Please keep it private.'));
      }
      const reqBtn = el('button', 'lic-btn', 'Request stems / WAV'); reqBtn.type = 'button';
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
  row.append(box, msg, panel);
}
