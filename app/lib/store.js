// Minimal observable store. Subscribers are notified synchronously after each set().
export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
      if (next === state) return;
      state = next;
      subs.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } });
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
