// Data access: every query here is the same Supabase query the original pages made
// (same tables, views, columns, filters); this module only centralises them and adds caching.
import { supabase } from './supabase.js';
import { cached, invalidate } from './cache.js';

export const nameMap = new Map(); // owner id -> display name, shared across all views

export async function ensureNames(ownerIds) {
  const missing = [...new Set(ownerIds)].filter((id) => id && !nameMap.has(id));
  if (!missing.length) return;
  const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', missing);
  (profiles || []).forEach((p) => nameMap.set(p.id, p.display_name || 'Unknown artist'));
}
export const artistName = (id) => nameMap.get(id) || '';

export const PAGE_SIZE = 12;

export async function fetchFeedPage({ genre = 'all', q = '', artistId = null, offset = 0, limit = PAGE_SIZE }) {
  let query = supabase.from('browse_feed').select('*');
  if (genre === 'new') {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('created_at', since);
  } else if (genre !== 'all') {
    query = query.eq('genre', genre);
  }
  if (q) query = query.ilike('title', `%${q}%`);
  if (artistId) query = query.eq('owner_id', artistId);
  const { data, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  await ensureNames((data || []).map((i) => i.owner_id));
  return (data || []).map((i) => ({ ...i, artistName: nameMap.get(i.owner_id) }));
}

// First page of the default feed is cached briefly so coming back to Browse is instant.
export function fetchFeedPageCached(params, ttl = 45_000) {
  const key = `feed:${params.genre || 'all'}|${params.q || ''}|${params.artistId || ''}|${params.offset || 0}`;
  return cached(key, ttl, () => fetchFeedPage(params));
}
export const invalidateFeed = () => invalidate('feed:');

// Featured artists: ranked by total engagement across the whole catalogue (lightweight 4-column scan).
export function fetchFeaturedArtists() {
  return cached('featured-artists', 5 * 60_000, async () => {
    const { data, error } = await supabase.from('browse_feed').select('owner_id, play_count, download_count, purchase_count');
    if (error) throw error;
    const scores = new Map();
    (data || []).forEach((row) => {
      const score = (row.play_count || 0) + (row.download_count || 0) + (row.purchase_count || 0);
      scores.set(row.owner_id, (scores.get(row.owner_id) || 0) + score);
    });
    const ids = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);
    await ensureNames(ids);
    return ids.map((id) => ({ id, name: nameMap.get(id) || 'Unknown artist' }));
  });
}

// ---- rank memory (trend arrows survive reloads, tracked per section) ----
function loadRankHistory(section) { try { return JSON.parse(localStorage.getItem(`zami-rank-history:${section}`) || '{}'); } catch { return {}; } }
function saveRankHistory(section, obj) { try { localStorage.setItem(`zami-rank-history:${section}`, JSON.stringify(obj)); } catch { /* neutral trend */ } }
function computeTrend(prev, cur) { if (prev == null) return 'same'; return cur < prev ? 'up' : cur > prev ? 'down' : 'same'; }
function withTrends(section, entries) {
  const prev = loadRankHistory(section); const next = {};
  const out = entries.map((e, i) => { const rank = i + 1; const key = `${e.item.item_type}-${e.item.id}`; next[key] = rank; return { ...e, rank, trend: computeTrend(prev[key], rank) }; });
  saveRankHistory(section, next);
  return out;
}

export function fetchTopDownloads() {
  return cached('top-downloads', 2 * 60_000, async () => {
    const { data, error } = await supabase.from('browse_feed').select('*')
      .eq('item_type', 'track').eq('is_free', true)
      .order('download_count', { ascending: false }).limit(20);
    if (error) throw error;
    await ensureNames((data || []).map((i) => i.owner_id));
    return withTrends('top-downloads', (data || []).map((item) => ({ item, label: `${item.download_count || 0} downloads` })))
      .map((e) => ({ ...e, item: { ...e.item, artistName: nameMap.get(e.item.owner_id) } }));
  });
}
export const invalidateTopDownloads = () => invalidate('top-downloads');

export function fetchTrending() {
  return cached('trending', 2 * 60_000, async () => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: recentDownloads }, { data: recentPurchases }] = await Promise.all([
      supabase.from('downloads').select('track_id').gte('downloaded_at', since),
      supabase.from('purchases').select('item_id, item_type').eq('status', 'fulfilled').gte('fulfilled_at', since),
    ]);
    const scores = new Map();
    (recentDownloads || []).forEach((d) => { const k = `track-${d.track_id}`; scores.set(k, (scores.get(k) || 0) + 1); });
    (recentPurchases || []).forEach((p) => { const k = `${p.item_type}-${p.item_id}`; scores.set(k, (scores.get(k) || 0) + 1); });
    const trackIds = [...scores.keys()].filter((k) => k.startsWith('track-')).map((k) => k.slice(6));
    const beatIds = [...scores.keys()].filter((k) => k.startsWith('beat-')).map((k) => k.slice(5));
    const [{ data: trackRows }, { data: beatRows }] = await Promise.all([
      trackIds.length ? supabase.from('browse_feed').select('*').eq('item_type', 'track').in('id', trackIds) : { data: [] },
      beatIds.length ? supabase.from('browse_feed').select('*').eq('item_type', 'beat').in('id', beatIds) : { data: [] },
    ]);
    const byId = new Map([...(trackRows || []), ...(beatRows || [])].map((i) => [`${i.item_type}-${i.id}`, i]));
    await ensureNames([...byId.values()].map((i) => i.owner_id));
    const ranked = [...scores.entries()]
      .map(([key, count]) => (byId.has(key) ? { item: byId.get(key), count } : null))
      .filter(Boolean).sort((a, b) => b.count - a.count).slice(0, 10);
    return withTrends('trending', ranked.map(({ item, count }) => ({ item: { ...item, artistName: nameMap.get(item.owner_id) }, label: `${count} this week` })));
  });
}

// ---- single items (detail page) ----
export function fetchItem(type, id) {
  return cached(`item:${type}:${id}`, 30_000, async () => {
    const table = type === 'beat' ? 'beats' : 'tracks';
    const { data, error } = await supabase.from(table).select('*').eq('id', id).eq('status', 'approved').maybeSingle();
    if (error) throw error;
    return data;
  });
}
export async function fetchProfileName(ownerId) {
  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', ownerId).maybeSingle();
  const name = profile?.display_name || 'Unknown artist';
  nameMap.set(ownerId, name);
  return name;
}
