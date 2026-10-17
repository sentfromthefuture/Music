// TEST-ONLY stand-in for @supabase/supabase-js. Implements just the query-builder surface the app
// uses, over in-memory tables, and records every call in window.__calls / window.__rpc.
const HOST = 'https://tradvpjpxshngjemnoaq.supabase.co';
const pub = (b, p) => `${HOST}/storage/v1/object/public/${b}/${p}`;
const cover = pub('public-previews', 'covers/1.png');
const now = Date.now();
const iso = (d) => new Date(now - d * 3600e3).toISOString();
// Licensing mode simulates a database where supabase/beat-licensing.sql HAS been run (off = legacy database).
const LIC = (() => { try { return localStorage.getItem('stub-licensing') === '1'; } catch { return false; } })();

const profiles = [
  { id: 'u1', display_name: 'Chanda Beats', bio: 'Lusaka producer.', role: 'artist', is_admin: false },
  { id: 'u2', display_name: 'Mwaka', bio: '', role: 'artist', is_admin: false, momo_number: '0977329815' },
  { id: 'u3', display_name: 'Admin', role: 'listener', is_admin: true },
  { id: 'u4', display_name: 'Listener', role: 'listener', is_admin: false },
];
const tracks = [
  { id: 1, owner_id: 'u1', title: 'Free Anthem', genre: 'Amapiano', is_free: true, price: 0, file_path: 'u1/a.wav', cover_url: cover, status: 'approved', play_count: 5, download_count: 12, purchase_count: 0, created_at: iso(1) },
  { id: 2, owner_id: 'u1', title: 'Paid Groove', genre: 'Afrobeat', is_free: false, price: 20, preview_path: 'u1/b.wav', file_path: 'u1/full2.wav', cover_url: cover, status: 'approved', play_count: 9, download_count: 0, purchase_count: 3, created_at: iso(2) },
  { id: 4, owner_id: 'u2', title: 'Broken File', genre: 'Gospel', is_free: true, price: 0, file_path: 'u2/missing.wav', cover_url: '', status: 'approved', play_count: 1, download_count: 1, purchase_count: 0, created_at: iso(3) },
  { id: 5, owner_id: 'u2', title: 'Gospel Joy', genre: 'Gospel', is_free: true, price: 0, file_path: 'u2/b.wav', cover_url: cover, status: 'approved', play_count: 2, download_count: 4, purchase_count: 0, created_at: iso(4) },
  { id: 6, owner_id: 'u2', title: 'No Preview Yet', genre: 'Other', is_free: false, price: 15, cover_url: '', status: 'approved', play_count: 0, download_count: 0, purchase_count: 0, created_at: iso(5) },
];
const beats = [
  { id: 3, owner_id: 'u2', title: 'Night Drive Beat', genre: 'Hip-hop', price: 50, bpm: 90, preview_path: 'u2/b.wav', full_path: 'u2/fullbeat.wav', cover_url: cover, status: 'approved', play_count: 4, purchase_count: 1, created_at: iso(6) },
];
for (let i = 10; i < 40; i++) tracks.push({ id: i, owner_id: i % 2 ? 'u1' : 'u2', title: `Filler Track ${i}`, genre: 'Amapiano', is_free: true, price: 0, file_path: 'u1/a.wav', cover_url: cover, status: 'approved', play_count: i, download_count: i, purchase_count: 0, created_at: iso(10 + i) });

tracks.push({ id: 99, owner_id: 'u1', title: '<img src=x onerror="window.__xss=1">', genre: 'Other', is_free: true, price: 0, file_path: 'u1/a.wav', cover_url: 'javascript:window.__xss=1', status: 'approved', play_count: 0, download_count: 0, purchase_count: 0, created_at: iso(500) });
if (LIC) {
  beats[0].license_tiers = { basic: { price: 50 }, premium: { price: 120, extras: true }, exclusive: { price: 600, extras: true } };
  beats.push({ id: 8, owner_id: 'u2', title: 'Gone Exclusive', genre: 'Hip-hop', price: 40, bpm: 95, preview_path: 'u2/b.wav', full_path: 'u2/gone.wav', cover_url: cover, status: 'removed', exclusive_sold: true, license_tiers: { exclusive: { price: 300 } }, play_count: 0, download_count: 0, purchase_count: 1, created_at: iso(40) });
  beats.push({ id: 7, owner_id: 'u2', title: 'Old Beat', genre: 'Hip-hop', price: 30, bpm: 100, preview_path: 'u2/b.wav', full_path: 'u2/oldbeat.wav', cover_url: cover, status: 'approved', play_count: 1, download_count: 0, purchase_count: 0, created_at: iso(30) });
}
// Song licensing mode simulates a database where supabase/song-licensing.sql HAS been run.
const SONG = (() => { try { return localStorage.getItem('stub-songlic') === '1'; } catch { return false; } })();
if (SONG) {
  tracks.find((t) => t.id === 1).license_tiers = { creator: { price: 50, months: 12, territory: 'zm' }, business: { price: 300, months: 36, territory: 'africa' }, live: { price: 120, months: 0, territory: 'world' } };
  tracks.find((t) => t.id === 2).license_tiers = { film: { price: 500, months: 0, territory: 'world' }, broadcast: { price: 800, months: 60, territory: 'zm' } };
}
// Rejections mode simulates a database where supabase/upload-rejections.sql HAS been run (flag: localStorage stub-rejections=1).
const REJ = (() => { try { return localStorage.getItem('stub-rejections') === '1'; } catch { return false; } })();
const feedCols = (r, type) => ({ item_type: type, id: r.id, owner_id: r.owner_id, title: r.title, genre: r.genre, cover_url: r.cover_url, price: r.price, is_free: type === 'track' ? r.is_free : false, play_count: r.play_count, download_count: r.download_count || 0, purchase_count: r.purchase_count, created_at: r.created_at });
const tables = {
  profiles, tracks, beats,
  browse_feed: [...tracks.map((r) => feedCols(r, 'track')), ...beats.map((r) => feedCols(r, 'beat'))],
  downloads: [{ track_id: 1, downloaded_at: iso(2) }, { track_id: 1, downloaded_at: iso(3) }, { track_id: 5, downloaded_at: iso(4) }],
  purchases: [{ item_id: 2, item_type: 'track', status: 'fulfilled', fulfilled_at: iso(5) },
    ...(LIC ? [{ id: 500, buyer_id: 'u4', item_id: 3, item_type: 'beat', status: 'fulfilled', amount: 120, license_tier: 'premium', license_id: 'ZL-TEST0001', buyer_name: 'Mulenga K', buyer_contact: '+260971111111', fulfilled_at: iso(1) }] : [])],
  favorites: [], follows: [], withdrawals: [], purchase_complaints: LIC ? [{ id: 1, purchase_id: '999', item_id: '3', item_type: 'beat', buyer_id: 'u9', producer_id: 'u2', buyer_name: 'Chanda B', buyer_contact: '+260972222222', message: 'The stems link does not open', status: 'open', created_at: iso(1) },
    { id: 2, purchase_id: '500', item_id: '3', item_type: 'beat', buyer_id: 'u9', producer_id: 'u2', buyer_name: 'Mulenga K', buyer_contact: '+260971111111', message: 'Old report about the WAV', status: 'open', producer_reply: 'I re-uploaded the link', producer_fixed_at: iso(0), created_at: iso(3) }] : [],
  beat_extras: LIC ? [{ beat_id: '3', owner_id: 'u2', link: 'https://drive.example.com/stems-3' }] : [], stem_requests: LIC ? [{ id: 1, purchase_id: '999', beat_id: '3', buyer_id: 'u9', producer_id: 'u2', buyer_name: 'Chanda B', buyer_contact: '+260972222222', status: 'requested', created_at: iso(2) }] : [],
  artist_follow_counts: [{ artist_id: 'u1', follower_count: 7 }],
};
if (SONG) {
  const terms = (type, price, months, territory, title) => ({ v: 1, type, price, months, territory, title, artist: 'Chanda Beats' });
  tables.purchases.push(
    { id: 600, buyer_id: 'u4', item_id: 2, item_type: 'track', status: 'fulfilled', amount: 500, song_license_tier: 'film', license_id: 'SL-TEST0001', buyer_name: 'Mulenga K', buyer_contact: '+260971111111', fulfilled_at: iso(1), license_terms: terms('film', 500, 0, 'world', 'Paid Groove') },
    { id: 601, buyer_id: 'u4', item_id: 1, item_type: 'track', status: 'fulfilled', amount: 50, song_license_tier: 'creator', license_id: 'SL-TEST0002', buyer_name: 'Mulenga K', buyer_contact: '+260971111111', fulfilled_at: iso(2), license_terms: terms('creator', 50, 12, 'zm', 'Free Anthem') },
    { id: 602, buyer_id: 'u9', item_id: 1, item_type: 'track', status: 'fulfilled', amount: 300, song_license_tier: 'business', license_id: 'SL-TEST0003', buyer_name: 'Old Buyer', fulfilled_at: iso(24 * 800), license_terms: terms('business', 300, 12, 'africa', 'Free Anthem') },
    { id: 603, buyer_id: 'u9', item_id: 1, item_type: 'track', status: 'requested', amount: 300, song_license_tier: 'business', license_id: 'SL-TEST0004', buyer_name: 'New Buyer', buyer_contact: '+260972222222', reference_number: 'ORD-AAAA', transaction_sms: 'Confirmed K300', license_terms: terms('business', 300, 36, 'africa', 'Free Anthem') },
    { id: 604, buyer_id: 'u9', item_id: 2, item_type: 'track', status: 'requested', amount: 800, song_license_tier: 'broadcast', license_id: 'SL-TEST0005', buyer_name: 'Radio Z', buyer_contact: '+260973333333', reference_number: 'ORD-BBBB', transaction_sms: 'Confirmed K800', license_terms: terms('broadcast', 800, 60, 'zm', 'Paid Groove') });
}
tables.upload_rejections = REJ ? [{ id: 1, item_type: 'track', item_id: '6', owner_id: 'u2', title: 'No Preview Yet', genre: 'Other', reference_number: 'TRK-ZZZZ', transaction_sms: 'Confirmed K25 sent', rejected_at: iso(30) }] : null;
tables.purchases.push({ id: 605, buyer_id: 'u9', item_id: 2, item_type: 'track', status: 'rejected', amount: 20, buyer_contact: '+260974444444', reference_number: 'ORD-REJ1', transaction_sms: 'fake sms', created_at: iso(10) });
// Artist-sales mode (localStorage stub-artistsales=1): two more song licenses on Free Anthem, so item sorting can be told apart.
if (SONG && (() => { try { return localStorage.getItem('stub-artistsales') === '1'; } catch { return false; } })()) {
  const lt = (m, t) => ({ v: 1, type: 'creator', price: 50, months: m, territory: t, title: 'Free Anthem', artist: 'Chanda Beats' });
  tables.purchases.push(
    { id: 610, buyer_id: 'u9', item_id: 1, item_type: 'track', status: 'fulfilled', amount: 50, song_license_tier: 'creator', license_id: 'SL-TEST0010', buyer_name: 'Third Buyer', buyer_contact: '+260975555555', fulfilled_at: iso(0.1), license_terms: lt(12, 'zm') },
    { id: 611, buyer_id: 'u9', item_id: 1, item_type: 'track', status: 'fulfilled', amount: 50, song_license_tier: 'creator', license_id: 'SL-TEST0011', buyer_name: 'Fourth Buyer', buyer_contact: '+260976666666', fulfilled_at: iso(3), license_terms: lt(12, 'zm') });
}
window.__calls = window.__calls || []; window.__rpc = window.__rpc || [];
window.__tables = tables;

const cmp = (a, b) => String(a) === String(b);
class Q {
  constructor(table) { this.t = table; this.f = []; this.ord = null; this.rng = null; this.lim = null; this.op = 'select'; this.payload = null; this.sg = false; this.sel = false; this.cols = ''; }
  select(c) { this.cols = c || ''; if (this.op !== 'select') this.sel = true; return this; }
  insert(p) { this.op = 'insert'; this.payload = p; return this; }
  upsert(p, o) { this.op = 'upsert'; this.payload = p; this.conflict = (o && o.onConflict) || 'id'; return this; }
  update(p) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.f.push((r) => cmp(r[c], v)); return this; }
  neq(c, v) { this.f.push((r) => !cmp(r[c], v)); return this; }
  in(c, vs) { this.f.push((r) => vs.some((v) => cmp(r[c], v))); return this; }
  gte(c, v) { this.f.push((r) => r[c] >= v); return this; }
  lte(c, v) { this.f.push((r) => r[c] <= v); return this; }
  ilike(c, p) { const s = p.replace(/%/g, '').toLowerCase(); this.f.push((r) => String(r[c] ?? '').toLowerCase().includes(s)); return this; }
  not() { return this; }
  or(spec) { // supports col.ilike.%x%, col.eq.x and col.in.(a,b) joined by commas (enough for the admin searches)
    const parts = []; let depth = 0, cur = '';
    for (const ch of String(spec)) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
    if (cur) parts.push(cur);
    const tests = parts.map((p) => { const m = p.match(/^([^.]+)\.(ilike|eq|in)\.(.*)$/); if (!m) return () => true; const [, c, op, v] = m;
      if (op === 'ilike') { const x = v.replace(/%/g, '').toLowerCase(); return (r) => String(r[c] ?? '').toLowerCase().includes(x); }
      if (op === 'eq') return (r) => String(r[c]) === v;
      const list = v.replace(/^\(|\)$/g, '').split(','); return (r) => list.some((x) => String(r[c]) === x); });
    this.f.push((r) => tests.some((t) => t(r))); return this; } is(c, v) { this.f.push((r) => (r[c] ?? null) === v); return this; }
  order(c, o) { this.ord = [c, o?.ascending !== false]; return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  limit(n) { this.lim = n; return this; }
  maybeSingle() { this.sg = 'maybe'; return this; }
  single() { this.sg = 'one'; return this; }
  single_() { return this; }
  then(res, rej) {
    window.__calls.push(`${this.t}:${this.op}`);
    if (this.op === 'select' && this.t === 'beats' && !LIC && /license_tiers/.test(String(this.cols))) return Promise.resolve({ data: null, error: { code: '42703', message: 'column beats.license_tiers does not exist' } }).then(res, rej);
    if (this.op === 'select' && this.t === 'tracks' && !SONG && /license_tiers/.test(String(this.cols))) return Promise.resolve({ data: null, error: { code: '42703', message: 'column tracks.license_tiers does not exist' } }).then(res, rej);
    if (this.t === 'upload_rejections' && !REJ) return Promise.resolve({ data: null, error: { code: '42P01', message: 'relation "public.upload_rejections" does not exist' } }).then(res, rej);
    const rows = tables[this.t] || (tables[this.t] = []);
    let out; let error = null;
    if (this.op === 'insert') { const ins = [].concat(this.payload).map((r, i) => {
        const row = { id: rows.length + 100 + i, ...r };
        if (this.t === 'purchases' && row.license_tier) { // emulate the purchase guard trigger: server sets price + license id
          const b = tables.beats.find((x) => cmp(x.id, row.item_id)); const tier = b && b.license_tiers && b.license_tiers[row.license_tier];
          if (tier) { row.amount = tier.price; row.license_id = 'ZL-TEST' + String(rows.length + 100 + i).padStart(4, '0'); }
        }
        if (this.t === 'purchases' && row.song_license_tier) { // emulate zami_song_license_guard: server sets price, id and frozen terms
          const tr = tables.tracks.find((x) => cmp(x.id, row.item_id)); const st = tr && tr.license_tiers && tr.license_tiers[row.song_license_tier];
          if (st) { const ar = tables.profiles.find((x) => x.id === tr.owner_id); row.amount = st.price; row.license_id = 'SL-TEST' + String(rows.length + 100 + i).padStart(4, '0'); row.license_terms = { v: 1, type: row.song_license_tier, price: st.price, months: st.months, territory: st.territory, title: tr.title, artist: ar && ar.display_name }; }
        }
        return row;
      });
      (window.__ins = window.__ins || []).push({ t: this.t, payload: this.payload });
      rows.push(...ins); out = this.sel ? (this.sg ? ins[0] : ins) : null; }
    else if (this.op === 'upsert') { [].concat(this.payload).forEach((r) => { const ex = rows.find((x) => cmp(x[this.conflict], r[this.conflict])); if (ex) Object.assign(ex, r); else rows.push({ ...r }); });
      (window.__ins = window.__ins || []).push({ t: this.t + ':upsert', payload: this.payload }); out = null; }
    else if (this.op === 'delete') { const keep = rows.filter((r) => !this.f.every((fn) => fn(r))); tables[this.t] = keep; out = null; }
    else if (this.op === 'update') { const hit = rows.filter((r) => this.f.every((fn) => fn(r))); hit.forEach((r) => Object.assign(r, this.payload)); out = this.sel ? hit : null; }
    else {
      out = rows.filter((r) => this.f.every((fn) => fn(r)));
      if (this.ord) { const [c, asc] = this.ord; out = [...out].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)); }
      if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim != null) out = out.slice(0, this.lim);
      if (this.sg) out = out[0] ?? null;
    }
    return Promise.resolve({ data: out, error }).then(res, rej);
  }
}
const authSubs = new Set();
const curUser = () => { try { const id = localStorage.getItem('stub-user'); return id ? { id, phone: '+260970000000' } : null; } catch { return null; } };
export function createClient() {
  return {
    from: (t) => new Q(t),
    rpc: (name, args) => {
      window.__rpc.push([name, args]);
      if (name === 'verify_license') {
        const p = tables.purchases.find((x) => x.license_id === String(args.p_license_id).toUpperCase() && x.status === 'fulfilled');
        const b = p && tables.beats.find((x) => cmp(x.id, p.item_id)); const pr = b && tables.profiles.find((x) => x.id === b.owner_id);
        return Promise.resolve({ data: p ? [{ license_id: p.license_id, tier: p.license_tier, buyer_name: p.buyer_name, beat_title: b.title, producer_name: pr && pr.display_name, issued_at: p.fulfilled_at, extras: !!(b.license_tiers && b.license_tiers[p.license_tier] && b.license_tiers[p.license_tier].extras) }] : [], error: null });
      }
      if (name === 'verify_song_license') {
        const p = tables.purchases.find((x) => x.license_id === String(args.p_license_id).toUpperCase().trim() && x.status === 'fulfilled' && x.song_license_tier);
        const t = (p && p.license_terms) || {}; let exp = null;
        if (p && t.months > 0) { const d = new Date(p.fulfilled_at); d.setUTCMonth(d.getUTCMonth() + t.months); exp = d.toISOString(); }
        return Promise.resolve({ data: p ? [{ license_id: p.license_id, license_type: p.song_license_tier, buyer_name: p.buyer_name, song_title: t.title, artist_name: t.artist, issued_at: p.fulfilled_at, months: t.months, territory: t.territory, expires_at: exp }] : [], error: null });
      }
      if (name === 'admin_user_phones') return Promise.resolve({ data: curUser() && curUser().id === 'u3' ? [{ id: 'u2', phone: '260977111222' }] : null, error: curUser() && curUser().id === 'u3' ? null : { message: 'Not allowed' } });
      if (name === 'reopen_complaint') { const c = tables.purchase_complaints.find((x) => cmp(x.id, args.p_id)); if (c) { c.status = 'open'; c.producer_fixed_at = null; c.reopened_at = new Date().toISOString(); } return Promise.resolve({ data: null, error: c ? null : { message: 'Complaint not found' } }); }
      return Promise.resolve({ data: null, error: null });
    },
    auth: {
      getUser: () => { window.__calls.push('auth:getUser'); return Promise.resolve({ data: { user: curUser() }, error: null }); },
      getSession: () => Promise.resolve({ data: { session: curUser() ? { user: curUser(), access_token: 't' } : null }, error: null }),
      onAuthStateChange: (cb) => { authSubs.add(cb); return { data: { subscription: { unsubscribe() { authSubs.delete(cb); } } } }; },
      signOut: () => { localStorage.removeItem('stub-user'); authSubs.forEach((cb) => cb('SIGNED_OUT', null)); return Promise.resolve({ error: null }); },
      signInWithOtp: (a) => { window.__rpc.push(['signInWithOtp', a]); return Promise.resolve({ data: {}, error: null }); },
      verifyOtp: (a) => { if (a && a.phone === '+260975555555') { try { localStorage.setItem('stub-user', 'u3'); } catch {} } return Promise.resolve({ data: { user: curUser(), session: {} }, error: null }); },
    },
    storage: { from: (b) => ({
      getPublicUrl: (p, o) => ({ data: { publicUrl: pub(b, p) + (o?.download ? `?download=${encodeURIComponent(o.download)}` : '') } }),
      createSignedUrl: (p) => Promise.resolve({ data: { signedUrl: `${HOST}/storage/v1/object/sign/${b}/${p}?token=t` }, error: null }),
      upload: () => Promise.resolve({ data: {}, error: null }),
      remove: () => Promise.resolve({ data: {}, error: null }),
    }) },
    functions: { invoke: () => Promise.resolve({ data: {}, error: null }) },
    channel: (name) => { window.__calls.push(`channel:${name}`); const c = { on(ev, cfg, cb) { (window.__chan = window.__chan || []).push({ ev, cfg, cb }); return c; }, subscribe() { return c; }, name }; return c; },
    removeChannel: (c) => { window.__calls.push(`removeChannel:${c?.name}`); return Promise.resolve('ok'); },
  };
}
