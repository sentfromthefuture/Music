// Buyer-side line + button on a purchased song license (Account page): shows what was bought and saves the license image.
import { loadCssOnce } from '../lib/licenses.js';
import { songLicenseLabel, durationLabel, territoryLabel, licenseExpiry, fmtDate } from '../lib/song-licenses.js';
import { saveSongLicense } from './song-license-canvas.js';

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

// purchase: row from `purchases` (song_license_tier, license_terms, license_id ...); item: { title }
export function addSongLicenseControls({ row, purchase, item }) {
  loadCssOnce('app/css/licensing.css');
  const t = purchase.license_terms || {};
  const exp = licenseExpiry(purchase.fulfilled_at, t.months);
  row.style.flexWrap = 'wrap';
  const info = el('p', 'lic-msg', `${songLicenseLabel(purchase.song_license_tier)} license \u00B7 ${t.months ? durationLabel(t.months) : 'Lifetime'} \u00B7 ${territoryLabel(t.territory)}${exp ? ` \u00B7 valid until ${fmtDate(exp)}` : ''} \u00B7 ${purchase.license_id}`);
  info.style.flexBasis = '100%';
  row.append(info);
  if (purchase.status && purchase.status !== 'fulfilled') return;
  const box = el('div', 'lic-actions'); box.style.flexBasis = '100%';
  const btn = el('button', 'lic-btn', 'License'); btn.type = 'button';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await saveSongLicense({ licenseId: purchase.license_id, type: purchase.song_license_tier, buyerName: purchase.buyer_name, title: t.title || item.title, artist: t.artist || '', issuedAt: purchase.fulfilled_at, months: t.months, territory: t.territory });
    btn.disabled = false;
  });
  box.append(btn); row.append(box);
}
