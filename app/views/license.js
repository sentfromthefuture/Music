// Public license check: license.html?id=ZL-XXXXXXXX. Reads only what is printed on the license.
import { h } from '../lib/dom.js';
import { supabase } from '../lib/supabase.js';
import { tierLabel, loadCssOnce } from '../lib/licenses.js';
import { saveLicense } from '../ui/license-canvas.js';

export const title = 'License check — ZAMI';
export const markup = `<div class="lic-verify"><div id="lic-out" role="status">Checking…</div></div>`;

export async function mount(ctx) {
  loadCssOnce('app/css/licensing.css');
  const out = ctx.root.querySelector('#lic-out');
  const id = (ctx.params.get('id') || '').trim().toUpperCase();
  if (!/^ZL-[A-Z0-9]{8}$/.test(id)) { out.replaceChildren(card(false, 'That is not a valid license ID.', 'License IDs look like ZL-1A2B3C4D.')); ctx.ready(); return; }
  try {
    const { data, error } = await supabase.rpc('verify_license', { p_license_id: id });
    if (!ctx.isAlive()) return;
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) { out.replaceChildren(card(false, 'No valid license found.', `Nothing was found for ${id}. Check the ID, or ask the buyer for the original.`)); ctx.ready(); return; }
    const date = row.issued_at ? new Date(row.issued_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const dl = h('dl', { class: 'lic-dl' },
      h('dt', null, 'Beat'), h('dd', null, row.beat_title || '—'),
      h('dt', null, 'Producer'), h('dd', null, row.producer_name || '—'),
      h('dt', null, 'License'), h('dd', null, tierLabel(row.tier)),
      h('dt', null, 'Licensed to'), h('dd', null, row.buyer_name || '—'),
      h('dt', null, 'Issued'), h('dd', null, date),
      h('dt', null, 'ID'), h('dd', null, row.license_id));
    const btn = h('button', { type: 'button', class: 'lic-btn lic-btn--primary' }, 'Save license image');
    btn.addEventListener('click', () => saveLicense({ licenseId: row.license_id, tier: row.tier, buyerName: row.buyer_name, beatTitle: row.beat_title, producer: row.producer_name, issuedAt: row.issued_at, extras: row.extras }));
    out.replaceChildren(h('div', { class: 'lic-card' }, h('p', { class: 'lic-ok' }, '✓ Valid license'), dl, h('div', { class: 'lic-actions' }, btn)));
  } catch (e) {
    console.error(e);
    out.replaceChildren(card(false, "Couldn't check this license.", 'Check your connection and try again.'));
  }
  ctx.ready();
}

function card(ok, headline, detail) {
  return h('div', { class: 'lic-card' }, h('p', { class: ok ? 'lic-ok' : 'lic-bad' }, headline), h('p', { class: 'lic-note' }, detail));
}
