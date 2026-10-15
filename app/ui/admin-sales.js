// Admin -> "Purchased Items": every approved sale (plus rejected purchases and rejected uploads) with who bought,
// from which artist, what, when and the item details. Read-only: it only reads data an admin can already read.
import { loadCssOnce, tierLabel } from '../lib/licenses.js';
import { songLicenseLabel, durationLabel, territoryLabel } from '../lib/song-licenses.js';

const PAGE = 50;
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const fmt = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const money = (n) => `K${Math.round(Number(n) || 0).toLocaleString('en-GB')}`;
const UPLOAD_STATUS = { pending_payment: 'Awaiting payment', pending_review: 'Pending review (resubmitted)', approved: 'Live', removed: 'Taken down' };
const SEGMENTS = [['approved', 'Approved sales'], ['rejected', 'Rejected purchases'], ['uploads', 'Rejected uploads']];
const TYPES = [['all', 'All'], ['track', 'Songs'], ['beat', 'Beats'], ['license', 'Licenses']];
const DATES = [['all', 'All time'], ['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month']];

// opts: { supabase, container, escapeHtml, artistShare }
export function createSalesView({ supabase, container, escapeHtml: esc, artistShare = 0.75 }) {
  loadCssOnce('app/css/admin-sales.css');
  let loaded = false, loading = false;
  let sales = [], rejected = [], uploads = [], uploadsMissing = false, loadError = '';
  const f = { seg: 'approved', type: 'all', date: 'all', term: '', shown: PAGE };

  async function fetchAll(build) {
    const out = []; const size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await build().range(from, from + size - 1);
      if (error) return { data: out, error };
      out.push(...(data || []));
      if (!data || data.length < size) break;
    }
    return { data: out, error: null };
  }
  async function byIds(table, cols, ids) {
    const out = [];
    for (const part of chunk([...new Set(ids.filter((x) => x != null).map(String))], 100)) {
      const { data } = await supabase.from(table).select(cols).in('id', part);
      out.push(...(data || []));
    }
    return out;
  }

  async function load() {
    loading = true; loadError = '';
    render();
    try {
      const { data: purchases, error } = await fetchAll(() => supabase.from('purchases').select('*').in('status', ['fulfilled', 'rejected']).order('created_at', { ascending: false }));
      if (error) throw error;
      const [rej, tracks, beats] = await Promise.all([
        fetchAll(() => supabase.from('upload_rejections').select('*').order('rejected_at', { ascending: false })),
        byIds('tracks', 'id, title, owner_id, is_free, price, genre', purchases.filter((p) => p.item_type === 'track').map((p) => p.item_id)),
        byIds('beats', 'id, title, owner_id, price, genre', purchases.filter((p) => p.item_type === 'beat').map((p) => p.item_id)),
      ]);
      uploadsMissing = !!rej.error;
      const rejRows = rej.error ? [] : rej.data;
      const [rejTracks, rejBeats] = await Promise.all([
        byIds('tracks', 'id, title, status', rejRows.filter((r) => r.item_type === 'track').map((r) => r.item_id)),
        byIds('beats', 'id, title, status', rejRows.filter((r) => r.item_type === 'beat').map((r) => r.item_id)),
      ]);
      const items = new Map([...tracks.map((t) => [`track:${t.id}`, t]), ...beats.map((b) => [`beat:${b.id}`, b])]);
      const nowItems = new Map([...rejTracks.map((t) => [`track:${t.id}`, t]), ...rejBeats.map((b) => [`beat:${b.id}`, b])]);
      const ids = [...items.values()].map((i) => i.owner_id).concat(purchases.map((p) => p.buyer_id), rejRows.map((r) => r.owner_id));
      const profs = new Map((await byIds('profiles', 'id, display_name, momo_number', ids)).map((p) => [String(p.id), p]));

      const toRow = (p, i) => {
        const it = items.get(`${p.item_type}:${p.item_id}`); const t = p.license_terms || {};
        const owner = it && profs.get(String(it.owner_id)); const buyer = p.buyer_id && profs.get(String(p.buyer_id));
        let license = '';
        if (p.song_license_tier) license = `${songLicenseLabel(p.song_license_tier)} license${t.months != null ? ` (${t.months ? durationLabel(t.months) : 'Lifetime'}, ${territoryLabel(t.territory)})` : ''}`;
        else if (p.license_tier) license = tierLabel(p.license_tier);
        const amount = Number(p.amount);
        return {
          key: p.id != null ? String(p.id) : `x${i}`, status: p.status, type: p.item_type === 'beat' ? 'beat' : 'track',
          title: (it && it.title) || t.title || '(item not found)', itemFound: !!it, listPrice: it && it.price, isFree: !!(it && it.is_free),
          artist: (owner && owner.display_name) || t.artist || 'Unknown artist', artistMomo: owner && owner.momo_number,
          buyerAccount: buyer ? buyer.display_name || 'Unnamed account' : '', guest: !p.buyer_id, buyerName: p.buyer_name || '', phone: p.buyer_contact || '',
          amount: Number.isFinite(amount) ? amount : null, license, isLicense: !!(p.song_license_tier || p.license_tier), licenseId: p.license_id || '',
          ref: p.reference_number || '', sms: p.transaction_sms || '', downloadUrl: p.download_url || '',
          created: p.created_at, fulfilled: p.fulfilled_at, when: p.status === 'fulfilled' ? (p.fulfilled_at || p.created_at) : p.created_at,
        };
      };
      const rows = purchases.map(toRow).sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0));
      sales = rows.filter((r) => r.status === 'fulfilled'); rejected = rows.filter((r) => r.status === 'rejected');
      uploads = rejRows.map((r) => ({
        key: `u${r.id}`, type: r.item_type === 'beat' ? 'beat' : 'track', title: r.title || (nowItems.get(`${r.item_type}:${r.item_id}`) || {}).title || '(untitled)',
        artist: (profs.get(String(r.owner_id)) || {}).display_name || 'Unknown artist', genre: r.genre || '', ref: r.reference_number || '', sms: r.transaction_sms || '',
        when: r.rejected_at, nowStatus: (nowItems.get(`${r.item_type}:${r.item_id}`) || {}).status || '',
      }));
      loaded = true;
    } catch (e) { console.error(e); loadError = (e && e.message) || 'Could not load purchases.'; }
    loading = false;
    render();
  }

  const inDate = (when) => {
    if (f.date === 'all') return true; if (!when) return false;
    const d = new Date(when); const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (f.date === 'today') return d >= start;
    if (f.date === '7d') return d >= new Date(start.getTime() - 6 * 864e5);
    if (f.date === '30d') return d >= new Date(start.getTime() - 29 * 864e5);
    return d >= new Date(now.getFullYear(), now.getMonth(), 1);
  };
  const haystack = (r) => [r.title, r.artist, r.buyerAccount, r.buyerName, r.phone, (r.phone || '').replace(/\D/g, ''), r.license, r.licenseId, r.ref, r.genre, r.type === 'beat' ? 'beat' : 'song track'].join(' ').toLowerCase();
  function visible() {
    const base = f.seg === 'approved' ? sales : f.seg === 'rejected' ? rejected : uploads;
    const term = f.term.trim().toLowerCase();
    return base.filter((r) => {
      if (f.type === 'track' && r.type !== 'track') return false;
      if (f.type === 'beat' && r.type !== 'beat') return false;
      if (f.type === 'license' && f.seg !== 'uploads' && !r.isLicense) return false;
      return inDate(r.when) && (!term || haystack(r).includes(term));
    });
  }

  const waLink = (num) => { const d = String(num).replace(/\D/g, ''); return d ? `https://wa.me/${d.startsWith('0') ? '260' + d.slice(1) : d}` : ''; };
  const safeLink = (u) => (/^https:\/\//i.test(u) ? u : '');

  function purchaseRow(r) {
    const approved = r.status === 'fulfilled';
    const artistCut = r.amount != null ? Math.round(r.amount * artistShare) : null;
    const buyer = r.guest ? 'Guest (no account)' : esc(r.buyerAccount);
    const bits = [r.buyerName && r.buyerName !== r.buyerAccount ? `name on license: ${esc(r.buyerName)}` : ''].filter(Boolean);
    const wa = r.phone ? waLink(r.phone) : '';
    const more = [
      r.sms ? `<p class="sl-line"><b>Payment SMS</b><br>${esc(r.sms)}</p>` : '',
      safeLink(r.downloadUrl) ? `<p class="sl-line"><a href="${esc(safeLink(r.downloadUrl))}" target="_blank" rel="noopener">Open the file link</a> <span class="sl-muted">(expires after 24 hours)</span></p>` : '',
      `<p class="sl-line sl-muted">${r.isFree ? 'Free song (license only) · ' : ''}${r.listPrice != null && !r.isLicense ? `Listed price ${money(r.listPrice)} · ` : ''}${r.artistMomo ? `Artist MoMo ${esc(r.artistMomo)} · ` : ''}${r.itemFound ? '' : 'Item no longer exists · '}Purchase #${esc(r.key)}</p>`,
    ].join('');
    return `<div class="sl-row">
      <div class="sl-top"><span class="sl-title">${esc(r.title)}</span><span class="sl-badge">${r.type === 'beat' ? 'Beat' : 'Song'}</span><span class="sl-badge ${approved ? 'is-ok' : 'is-bad'}">${approved ? 'Approved' : 'Rejected'}</span></div>
      <p class="sl-line"><b>${r.amount != null ? money(r.amount) : '—'}</b>${r.license ? ` · ${esc(r.license)}` : ''}${r.licenseId ? ` · <code>${esc(r.licenseId)}</code>` : ''}</p>
      <p class="sl-line"><b>Bought by</b> ${buyer}${bits.length ? ` <span class="sl-muted">(${bits.join(', ')})</span>` : ''}${r.phone ? ` · <a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>${wa ? ` · <a href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}` : ''}</p>
      <p class="sl-line"><b>From</b> ${esc(r.artist)}${approved && artistCut != null ? ` <span class="sl-muted">→ artist ${money(artistCut)} · ZAMI ${money(r.amount - artistCut)}</span>` : ''}</p>
      <p class="sl-line sl-muted">${[r.created ? `Ordered ${esc(fmt(r.created))}` : '', approved && r.fulfilled ? `Approved ${esc(fmt(r.fulfilled))}` : '', r.ref ? `Ref ${esc(r.ref)}` : ''].filter(Boolean).join(' · ') || 'No dates recorded'}</p>
      <details><summary>More details</summary>${more}</details></div>`;
  }
  function uploadRow(r) {
    return `<div class="sl-row">
      <div class="sl-top"><span class="sl-title">${esc(r.title)}</span><span class="sl-badge">${r.type === 'beat' ? 'Beat' : 'Song'}</span><span class="sl-badge is-bad">Rejected upload</span></div>
      <p class="sl-line"><b>Artist</b> ${esc(r.artist)}${r.genre ? ` <span class="sl-muted">· ${esc(r.genre)}</span>` : ''}</p>
      <p class="sl-line sl-muted">Rejected ${esc(fmt(r.when) || '—')}${r.ref ? ` · Ref ${esc(r.ref)}` : ''}</p>
      ${r.nowStatus ? `<p class="sl-line"><b>Now</b> ${esc(UPLOAD_STATUS[r.nowStatus] || r.nowStatus)}</p>` : ''}
      <details><summary>More details</summary><p class="sl-line"><b>Payment SMS they sent</b><br>${esc(r.sms || '(none)')}</p></details></div>`;
  }

  function render() {
    const count = { approved: sales.length, rejected: rejected.length, uploads: uploads.length };
    const chips = (items, cur, attr, extra = (k) => '') => items.map(([k, label]) => `<button type="button" class="sl-chip${cur === k ? ' is-on' : ''}" data-${attr}="${k}">${label}${extra(k)}</button>`).join('');
    const types = TYPES.filter(([k]) => !(f.seg === 'uploads' && k === 'license'));
    let body = '';
    if (loading) body = '<p class="sl-note">Loading…</p>';
    else if (loadError) body = `<p class="sl-note">Could not load: ${esc(loadError)}</p>`;
    else if (f.seg === 'uploads' && uploadsMissing) body = '<div class="sl-note"><b>Rejected uploads are not being recorded yet.</b><br>Rejecting an upload used to send it back to the artist without leaving a trace. Run <code>supabase/upload-rejections.sql</code> once in Supabase → SQL Editor. From then on every upload you reject is listed here. Uploads rejected before that cannot be recovered.</div>';
    else {
      const list = visible();
      let summary = '';
      if (f.seg === 'approved') {
        const gross = list.reduce((n, r) => n + (r.amount || 0), 0); const artists = list.reduce((n, r) => n + (r.amount ? Math.round(r.amount * artistShare) : 0), 0);
        summary = `<strong>${list.length}</strong> approved ${list.length === 1 ? 'sale' : 'sales'} · <strong>${money(gross)}</strong> total<br><span class="sl-muted">Artists ${money(artists)} · ZAMI ${money(gross - artists)}</span>`;
      } else if (f.seg === 'rejected') summary = `<strong>${list.length}</strong> rejected ${list.length === 1 ? 'purchase' : 'purchases'} <span class="sl-muted">(payment not accepted)</span>`;
      else summary = `<strong>${list.length}</strong> rejected ${list.length === 1 ? 'upload' : 'uploads'}`;
      const shown = list.slice(0, f.shown);
      body = `<div class="sl-summary">${summary}</div>` + (shown.length ? shown.map((r) => (f.seg === 'uploads' ? uploadRow(r) : purchaseRow(r))).join('') : '<p class="sl-note">Nothing matches these filters.</p>')
        + (list.length > shown.length ? `<button type="button" class="sl-more" data-more>Show more (${list.length - shown.length} left)</button>` : '');
    }
    container.innerHTML = `<div class="sl-chips">${chips(SEGMENTS, f.seg, 'seg', (k) => (loaded && !loading ? ` (${count[k]})` : ''))}</div>
      <div class="sl-filters">${chips(types, f.type, 'type')}<select class="sl-select" data-date aria-label="Date range">${DATES.map(([k, l]) => `<option value="${k}"${f.date === k ? ' selected' : ''}>${l}</option>`).join('')}</select><button type="button" class="sl-chip" data-refresh>Refresh</button></div>${body}`;
  }

  container.addEventListener('click', (e) => {
    const t = e.target.closest('[data-seg],[data-type],[data-more],[data-refresh]'); if (!t || !container.contains(t)) return;
    if (t.dataset.seg) { f.seg = t.dataset.seg; f.shown = PAGE; if (f.seg === 'uploads' && f.type === 'license') f.type = 'all'; }
    else if (t.dataset.type) { f.type = t.dataset.type; f.shown = PAGE; }
    else if ('more' in t.dataset) f.shown += PAGE;
    else if ('refresh' in t.dataset) { load(); return; }
    render();
  });
  container.addEventListener('change', (e) => { if (e.target.matches('[data-date]')) { f.date = e.target.value; f.shown = PAGE; render(); } });

  return {
    open() { load(); },
    setSearch(term) { f.term = term || ''; f.shown = PAGE; if (loaded && !loading) render(); },
  };
}
