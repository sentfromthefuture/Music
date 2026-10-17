// Artist balance page -> "Sales by item": totals, this month, best seller, and for every item what sold, what you earn,
// which licenses, and (tap to open) each sale. Read-only. It deliberately never asks for buyers' phone numbers or
// payment SMS: the artist sees the name printed on the license, the date, the license and the amount, nothing more.
import { loadCssOnce, licensingEnabled, tierLabel } from '../lib/licenses.js';
import { songLicensingEnabled, songLicenseLabel, durationLabel, territoryLabel, licenseExpiry, fmtDate } from '../lib/song-licenses.js';

const SHARE = 0.75; // artists receive 75% (same figure the rest of this page uses)
const STATUS = { approved: 'Live', pending_payment: 'Awaiting payment', pending_review: 'In review', removed: 'Taken down' };
const FILTERS = [['all', 'All'], ['track', 'Songs'], ['beat', 'Beats'], ['license', 'Licenses']];
const SORTS = [['revenue', 'Most revenue'], ['sold', 'Most sold'], ['latest', 'Latest sale']];
const money = (n) => `K${Math.round(Number(n) || 0).toLocaleString('en-GB')}`;
const earn = (n) => Math.round((Number(n) || 0) * SHARE);
import { autoMore, moreButtonHtml, LIST_PAGE } from './paging.js';
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

// opts: { supabase, container, escapeHtml }
export function createArtistSales({ supabase, container, escapeHtml: esc }) {
  let model = null, failed = false;
  let moreAuto = null;
  const view = { type: 'all', sort: 'revenue' , shown: LIST_PAGE };
  const open = new Set();

  async function purchasesFor(type, ids, cols) {
    const out = [];
    for (const part of chunk(ids, 100)) {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('purchases').select(cols).eq('item_type', type).in('item_id', part).in('status', ['fulfilled', 'requested']).range(from, from + 999);
        if (error) return { error };
        out.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
    }
    return { data: out };
  }

  async function load(artistId) {
    loadCssOnce('app/css/artist-sales.css');
    try {
      const [beatSql, songSql] = await Promise.all([licensingEnabled(), songLicensingEnabled()]);
      const [t, b] = await Promise.all([
        supabase.from('tracks').select('id, title, status').eq('owner_id', artistId),
        supabase.from('beats').select('id, title, status').eq('owner_id', artistId),
      ]);
      const items = new Map();
      (t.data || []).forEach((r) => items.set(`track:${r.id}`, { key: `track:${r.id}`, type: 'track', title: r.title, status: r.status, sales: [], pending: [] }));
      (b.data || []).forEach((r) => items.set(`beat:${r.id}`, { key: `beat:${r.id}`, type: 'beat', title: r.title, status: r.status, sales: [], pending: [] }));
      const base = 'id, item_id, item_type, amount, status, fulfilled_at, created_at';
      const cols = base + (beatSql || songSql ? ', license_tier, license_id, buyer_name' : '') + (songSql ? ', song_license_tier, license_terms' : '');
      const rows = [];
      for (const [type, list] of [['track', t.data || []], ['beat', b.data || []]]) {
        const ids = list.map((r) => r.id); if (!ids.length) continue;
        let res = await purchasesFor(type, ids, cols);
        if (res.error) res = await purchasesFor(type, ids, base); // a column is missing: show the basics rather than nothing
        if (res.error) throw res.error;
        rows.push(...res.data);
      }
      const now = new Date();
      for (const p of rows) {
        const item = items.get(`${p.item_type}:${p.item_id}`); if (!item) continue;
        const terms = p.license_terms || {}; const when = p.fulfilled_at || p.created_at;
        let short = 'Regular download', long = 'Regular download', exp = null;
        if (p.song_license_tier) {
          short = songLicenseLabel(p.song_license_tier);
          long = `${short} license${terms.months != null ? ` (${terms.months ? durationLabel(terms.months) : 'Lifetime'}, ${territoryLabel(terms.territory)})` : ''}`;
          exp = p.status === 'fulfilled' ? licenseExpiry(p.fulfilled_at, terms.months) : null;
        } else if (p.license_tier) { short = long = tierLabel(p.license_tier); }
        const sale = { id: p.id, amount: Number.isFinite(Number(p.amount)) ? Number(p.amount) : 0, when, short, long, licenseId: p.license_id || '', buyer: p.buyer_name || '',
          isLicense: !!(p.song_license_tier || p.license_tier), song: !!p.song_license_tier, expired: !!(exp && exp < now), validUntil: exp };
        (p.status === 'fulfilled' ? item.sales : item.pending).push(sale);
      }
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      let gross = 0, count = 0, mGross = 0, mCount = 0;
      const list = [...items.values()].map((it) => {
        it.sales.sort((a, b2) => new Date(b2.when || 0) - new Date(a.when || 0));
        it.pending.sort((a, b2) => new Date(b2.when || 0) - new Date(a.when || 0));
        it.gross = it.sales.reduce((n, s) => n + s.amount, 0);
        it.last = it.sales.length ? new Date(it.sales[0].when || 0).getTime() : 0;
        const mix = new Map(); it.sales.forEach((s) => mix.set(s.short, (mix.get(s.short) || 0) + 1));
        it.mix = [...mix.entries()].sort((a, b2) => b2[1] - a[1] || a[0].localeCompare(b2[0]));
        it.hasLicense = it.sales.some((s) => s.isLicense);
        gross += it.gross; count += it.sales.length;
        it.sales.forEach((s) => { if (s.when && new Date(s.when) >= monthStart) { mGross += s.amount; mCount += 1; } });
        return it;
      }).filter((it) => it.status !== 'removed' || it.sales.length || it.pending.length);
      const best = list.filter((it) => it.sales.length).sort((a, b2) => b2.sales.length - a.sales.length || b2.gross - a.gross)[0] || null;
      model = { items: list, gross, count, mGross, mCount, best };
      failed = false;
    } catch (e) { console.error(e); failed = true; }
    render();
  }

  function visibleItems() {
    const cmp = {
      revenue: (a, b) => b.gross - a.gross || b.sales.length - a.sales.length,
      sold: (a, b) => b.sales.length - a.sales.length || b.gross - a.gross,
      latest: (a, b) => b.last - a.last,
    }[view.sort];
    return model.items
      .filter((it) => (view.type === 'all' || (view.type === 'license' ? it.hasLicense : it.type === view.type)))
      .sort((a, b) => (!!b.sales.length - !!a.sales.length) || cmp(a, b) || a.title.localeCompare(b.title));
  }

  function saleRow(s, waiting) {
    const detail = waiting ? 'Waiting for approval' : s.expired ? '<span class="as-bad">Expired</span>' : s.validUntil ? `valid until ${esc(fmtDate(s.validUntil))}` : s.song ? 'no expiry date' : '';
    return `<div class="as-sale${waiting ? ' is-wait' : ''}">
      <div class="as-sale-top"><span>${esc(s.when ? fmtDate(s.when) : '—')}</span><b>${money(s.amount)}</b></div>
      <div class="as-sale-line">${esc(s.long)}${s.licenseId ? ` · <code>${esc(s.licenseId)}</code>` : ''}</div>
      <div class="as-sale-line muted">${[s.buyer ? `Licensed to ${esc(s.buyer)}` : '', waiting ? '' : `you receive ${money(earn(s.amount))}`, detail].filter(Boolean).join(' · ')}</div></div>`;
  }

  function itemHtml(it) {
    const isOpen = open.has(it.key); const sold = it.sales.length;
    const pendingAmt = it.pending.reduce((n, s) => n + s.amount, 0);
    const nums = sold ? `<b>${sold} sold</b> · ${money(it.gross)} · you earn ${money(earn(it.gross))}` : 'No sales yet';
    const sub = sold ? `Last sale ${esc(fmtDate(it.sales[0].when))}${it.mix.length ? ` · ${it.mix.map(([l, n]) => `${esc(l)} ×${n}`).join(' · ')}` : ''}` : '';
    const wait = it.pending.length ? `<span class="as-sub is-wait">${it.pending.length} waiting for approval (${money(pendingAmt)})</span>` : '';
    const body = it.sales.map((s) => saleRow(s, false)).join('') + it.pending.map((s) => saleRow(s, true)).join('');
    const canOpen = !!body;
    return `<div class="as-item${sold ? '' : ' is-empty'}" data-key="${esc(it.key)}">
      <button type="button" class="as-head"${canOpen ? ` data-toggle aria-expanded="${isOpen}"` : ' disabled'}>
        <span class="as-top"><span class="as-title">${esc(it.title)}</span><span class="as-badge">${it.type === 'beat' ? 'Beat' : 'Song'}</span><span class="as-badge${it.status === 'approved' ? ' is-live' : ' is-wait'}">${esc(STATUS[it.status] || it.status || '')}</span>${canOpen ? `<span class="as-chev">${isOpen ? '▲' : '▼'}</span>` : ''}</span>
        <span class="as-nums">${nums}</span>${sub ? `<span class="as-sub">${sub}</span>` : ''}${wait}
      </button>${canOpen ? `<div class="as-sales"${isOpen ? '' : ' hidden'}>${body}</div>` : ''}</div>`;
  }

  function render() {
    if (failed) { container.innerHTML = '<p class="as-note">Could not load your sales right now. Pull to refresh and try again.</p>'; return; }
    if (!model) return;
    if (!model.items.length) { container.innerHTML = '<p class="as-note">Nothing uploaded yet. Your sales will appear here.</p>'; return; }
    const tile = (big, small) => `<div class="as-tile"><b>${big}</b><span>${small}</span></div>`;
    const list = visibleItems();
    container.innerHTML = `<div class="as-tiles">
        ${tile(String(model.count), 'Sales')}${tile(money(model.gross), 'Customers paid')}
        ${tile(money(earn(model.gross)), 'You receive (75%)')}${tile(`${money(model.mGross)}`, `This month · ${model.mCount} ${model.mCount === 1 ? 'sale' : 'sales'}`)}
        ${model.best ? `<div class="as-tile" style="grid-column:1 / -1"><b>${esc(model.best.title)}</b><span>Best seller · ${model.best.sales.length} sold · ${money(model.best.gross)}</span></div>` : ''}
      </div>
      <div class="as-controls">${FILTERS.map(([k, l]) => `<button type="button" class="as-chip${view.type === k ? ' is-on' : ''}" data-type="${k}">${l}</button>`).join('')}
        <select class="as-select" data-sort aria-label="Sort items">${SORTS.map(([k, l]) => `<option value="${k}"${view.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      ${list.length ? list.slice(0, view.shown).map(itemHtml).join('') : '<p class="as-note">Nothing here.</p>'}${list.length > view.shown ? moreButtonHtml(`Show more (${list.length - view.shown} left)`) : ''}`;
    if (moreAuto) moreAuto.stop();
    const moreBtn = container.querySelector('[data-more]');
    moreAuto = moreBtn ? autoMore(moreBtn, () => moreBtn.click()) : null;
  }

  container.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-type]'); const head = e.target.closest('[data-toggle]'); const more = e.target.closest('[data-more]');
    if (more && container.contains(more)) { view.shown += LIST_PAGE; render(); return; }
    if (chip && container.contains(chip)) { view.type = chip.dataset.type; view.shown = LIST_PAGE; render(); return; }
    if (head && container.contains(head)) { const key = head.closest('.as-item').dataset.key; open.has(key) ? open.delete(key) : open.add(key); render(); }
  });
  container.addEventListener('change', (e) => { if (e.target.matches('[data-sort]')) { view.sort = e.target.value; view.shown = LIST_PAGE; render(); } });

  return { load };
}
