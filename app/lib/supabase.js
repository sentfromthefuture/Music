// Single shared Supabase client for the whole app (previously every page created its own).
// Same project, same anon key, same CDN import as the original pages — the anon key is
// public by design; access control is enforced by Supabase RLS / storage policies.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://tradvpjpxshngjemnoaq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYWR2cGpweHNobmdqZW1ub2FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NDQ5NTksImV4cCI6MjEwNDUyMDk1OX0.6guQxGOLId1MqlFa79i4lS2-l63FDthS7svRmWySQ94';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- cached current user -------------------------------------------------
// Every legacy page called auth.getUser() (a network round-trip) on load. In the shell the
// user is fetched once, shared, and refreshed whenever the auth state changes.
let userPromise = null;
const userListeners = new Set();
let lastUser;

export function getUser() {
  if (!userPromise) {
    userPromise = supabase.auth.getUser().then((res) => {
      lastUser = res?.data?.user ?? null;
      return res;
    }).catch((error) => { userPromise = null; return { data: { user: null }, error }; });
  }
  return userPromise;
}
export function peekUser() { return lastUser; }
export function onUserChange(fn) { userListeners.add(fn); return () => userListeners.delete(fn); }

supabase.auth.onAuthStateChange((event, session) => {
  userPromise = null;
  lastUser = session?.user ?? null;
  userListeners.forEach((fn) => { try { fn(lastUser, event); } catch (e) { console.error(e); } });
});

// ---- per-view client -------------------------------------------------------
// Views receive a thin proxy of the shared client that (a) serves auth.getUser() from the
// cache and (b) records realtime channels so the router can remove them on navigation.
export function createViewClient(trackChannel) {
  const bindIfFn = (target, prop) => {
    const v = target[prop];
    return typeof v === 'function' ? v.bind(target) : v;
  };
  const authProxy = new Proxy(supabase.auth, {
    get(target, prop) {
      if (prop === 'getUser') return () => getUser();
      return bindIfFn(target, prop);
    },
  });
  return new Proxy(supabase, {
    get(target, prop) {
      if (prop === 'auth') return authProxy;
      if (prop === 'channel') return (...args) => { const ch = target.channel(...args); trackChannel(ch); return ch; };
      return bindIfFn(target, prop);
    },
  });
}
