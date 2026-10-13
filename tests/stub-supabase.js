// TEST-ONLY stand-in for @supabase/supabase-js. Implements just the query-builder surface the app
// uses, over in-memory tables, and records every call in window.__calls / window.__rpc.
const HOST = 'https://tradvpjpxshngjemnoaq.supabase.co';
const pub = (b, p) => `${HOST}/storage/v1/object/public/${b}/${p}`;
const cover = pub('public-previews', 'covers/1.png');
const now = Date.now();
const iso = (d) => new Date(now - d * 3600e3).toISOString();

const profiles = [
  { id: 'u1', display_name: 'Chanda Beats', bio: 'Lusaka producer.', role: 'artist', is_admin: false },
  { id: 'u2', display_name: 'Mwaka', bio: '', role: 'artist', is_admin: false },
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
const feedCols = (r, type) => ({ item_type: type, id: r.id, owner_id: r.owner_id, title: r.title, genre: r.genre, cover_url: r.cover_url, price: r.price, is_free: type === 'track' ? r.is_free : false, play_count: r.play_count, download_count: r.download_count || 0, purchase_count: r.purchase_count, created_at: r.created_at });
const tables = {
  profiles, tracks, beats,
  browse_feed: [...tracks.map((r) => feedCols(r, 'track')), ...beats.map((r) => feedCols(r, 'beat'))],
  downloads: [{ track_id: 1, downloaded_at: iso(2) }, { track_id: 1, downloaded_at: iso(3) }, { track_id: 5, downloaded_at: iso(4) }],
  purchases: [{ item_id: 2, item_type: 'track', status: 'fulfilled', fulfilled_at: iso(5) }],
  favorites: [], follows: [], withdrawals: [],
  artist_follow_counts: [{ artist_id: 'u1', follower_count: 7 }],
};
window.__calls = window.__calls || []; window.__rpc = window.__rpc || [];
window.__tables = tables;

const cmp = (a, b) => String(a) === String(b);
class Q {
  constructor(table) { this.t = table; this.f = []; this.ord = null; this.rng = null; this.lim = null; this.op = 'select'; this.payload = null; this.single = false; this.sel = false; }
  select() { if (this.op !== 'select') this.sel = true; return this; }
  insert(p) { this.op = 'insert'; this.payload = p; return this; }
  update(p) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.f.push((r) => cmp(r[c], v)); return this; }
  neq(c, v) { this.f.push((r) => !cmp(r[c], v)); return this; }
  in(c, vs) { this.f.push((r) => vs.some((v) => cmp(r[c], v))); return this; }
  gte(c, v) { this.f.push((r) => r[c] >= v); return this; }
  lte(c, v) { this.f.push((r) => r[c] <= v); return this; }
  ilike(c, p) { const s = p.replace(/%/g, '').toLowerCase(); this.f.push((r) => String(r[c] ?? '').toLowerCase().includes(s)); return this; }
  not() { return this; } or() { return this; } is(c, v) { this.f.push((r) => (r[c] ?? null) === v); return this; }
  order(c, o) { this.ord = [c, o?.ascending !== false]; return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  limit(n) { this.lim = n; return this; }
  maybeSingle() { this.single = 'maybe'; return this; }
  single_() { return this; }
  then(res, rej) {
    window.__calls.push(`${this.t}:${this.op}`);
    const rows = tables[this.t] || (tables[this.t] = []);
    let out; let error = null;
    if (this.op === 'insert') { const ins = [].concat(this.payload).map((r, i) => ({ id: rows.length + 100 + i, ...r })); rows.push(...ins); out = this.sel ? ins : null; }
    else if (this.op === 'delete') { const keep = rows.filter((r) => !this.f.every((fn) => fn(r))); tables[this.t] = keep; out = null; }
    else if (this.op === 'update') { rows.filter((r) => this.f.every((fn) => fn(r))).forEach((r) => Object.assign(r, this.payload)); out = null; }
    else {
      out = rows.filter((r) => this.f.every((fn) => fn(r)));
      if (this.ord) { const [c, asc] = this.ord; out = [...out].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)); }
      if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim != null) out = out.slice(0, this.lim);
      if (this.single) out = out[0] ?? null;
    }
    return Promise.resolve({ data: out, error }).then(res, rej);
  }
}
const authSubs = new Set();
const curUser = () => { try { const id = localStorage.getItem('stub-user'); return id ? { id, phone: '+260970000000' } : null; } catch { return null; } };
export function createClient() {
  return {
    from: (t) => new Q(t),
    rpc: (name, args) => { window.__rpc.push([name, args]); return Promise.resolve({ data: null, error: null }); },
    auth: {
      getUser: () => { window.__calls.push('auth:getUser'); return Promise.resolve({ data: { user: curUser() }, error: null }); },
      getSession: () => Promise.resolve({ data: { session: curUser() ? { user: curUser(), access_token: 't' } : null }, error: null }),
      onAuthStateChange: (cb) => { authSubs.add(cb); return { data: { subscription: { unsubscribe() { authSubs.delete(cb); } } } }; },
      signOut: () => { localStorage.removeItem('stub-user'); authSubs.forEach((cb) => cb('SIGNED_OUT', null)); return Promise.resolve({ error: null }); },
      signInWithOtp: () => Promise.resolve({ data: {}, error: null }),
      verifyOtp: () => Promise.resolve({ data: { user: curUser(), session: {} }, error: null }),
    },
    storage: { from: (b) => ({
      getPublicUrl: (p, o) => ({ data: { publicUrl: pub(b, p) + (o?.download ? `?download=${encodeURIComponent(o.download)}` : '') } }),
      createSignedUrl: (p) => Promise.resolve({ data: { signedUrl: `${HOST}/storage/v1/object/sign/${b}/${p}?token=t` }, error: null }),
      upload: () => Promise.resolve({ data: {}, error: null }),
      remove: () => Promise.resolve({ data: {}, error: null }),
    }) },
    functions: { invoke: () => Promise.resolve({ data: {}, error: null }) },
    channel: (name) => { window.__calls.push(`channel:${name}`); const c = { on() { return c; }, subscribe() { return c; }, name }; return c; },
    removeChannel: (c) => { window.__calls.push(`removeChannel:${c?.name}`); return Promise.resolve('ok'); },
  };
}
