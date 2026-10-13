// Shared favourites state (previously every page loaded and toggled favourites on its own).
import { supabase, getUser, onUserChange } from './supabase.js';
import { navigate } from './router.js';

const keys = new Set();
let loadedFor = null;
let loading = null;
const subs = new Set();
const emit = (key) => subs.forEach((fn) => { try { fn(key); } catch (e) { console.error(e); } });

onUserChange(() => { keys.clear(); loadedFor = null; loading = null; emit(null); });

export async function loadFavorites() {
  const { data: { user } } = await getUser();
  if (!user) { keys.clear(); loadedFor = null; return null; }
  if (loadedFor === user.id) return user;
  if (!loading) {
    loading = supabase.from('favorites').select('item_id, item_type').eq('user_id', user.id).then(({ data }) => {
      keys.clear();
      (data || []).forEach((f) => keys.add(`${f.item_type}-${f.item_id}`));
      loadedFor = user.id; loading = null; emit(null);
    });
  }
  await loading;
  return user;
}
export const isFav = (type, id) => keys.has(`${type}-${id}`);
export function onFavChange(fn) { subs.add(fn); return () => subs.delete(fn); }

// Same writes and same login prompt as the original pages.
export async function toggleFav(type, id) {
  const { data: { user } } = await getUser();
  if (!user) {
    if (confirm('Log in to save favorites. Go to login now?')) navigate('login.html');
    return { ok: false, needsLogin: true };
  }
  const key = `${type}-${id}`;
  if (keys.has(key)) {
    const { error } = await supabase.from('favorites').delete().eq('user_id', user.id).eq('item_id', id).eq('item_type', type);
    if (error) return { ok: false };
    keys.delete(key);
  } else {
    const { error } = await supabase.from('favorites').insert({ user_id: user.id, item_id: id, item_type: type });
    if (error) return { ok: false };
    keys.add(key);
  }
  emit(key);
  return { ok: true, fav: keys.has(key) };
}
