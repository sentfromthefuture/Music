// Shared "show 12 first, load more as you scroll" helpers used by every long list.
//  - autoMore(): calls a loader when a "Show more" button nears the screen (button stays as a fallback)
//  - revealList(): lists that are already fetched; draws 12 cards, reveals 12 more on scroll
//  - createPager(): lists fetched from Supabase 12 at a time, with the search done in the database
export const LIST_PAGE = 12;

const MORE_STYLE = 'display:block;width:100%;box-sizing:border-box;margin:12px 0;padding:12px;border:1px solid var(--border,#ddd);border-radius:12px;background:var(--surface,#fff);color:var(--accent,#1a6cf0);font:inherit;font-size:14px;font-weight:600;cursor:pointer;';

// markup version for lists that render with innerHTML (the owner wires the click / autoMore)
export const moreButtonHtml = (label) => `<button type="button" data-more style="${MORE_STYLE}">${label}</button>`;

function moreButton(label) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label; b.setAttribute('data-more', ''); b.style.cssText = MORE_STYLE;
  return b;
}

// Calls onMore() whenever `btn` is (or comes) within ~300px of the screen. Returns { recheck, stop }.
export function autoMore(btn, onMore) {
  if (!('IntersectionObserver' in window)) return { recheck() {}, stop() {} };
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && !btn.hidden && !btn.disabled) onMore();
  }, { rootMargin: '300px 0px' });
  io.observe(btn);
  return { recheck() { io.unobserve(btn); io.observe(btn); }, stop() { io.disconnect(); } };
}

// Already-fetched list: container gets the first `size` nodes, the rest appear as the user scrolls.
// container._revealAll() draws everything (used so the in-page search can see every card).
export function revealList(container, nodes, { size = LIST_PAGE, initial = size } = {}) {
  let shown = 0;
  const btn = moreButton('Show more');
  btn.style.gridColumn = '1 / -1'; // also works inside card grids
  const step = (n = size) => {
    const next = nodes.slice(shown, shown + (typeof n === 'number' ? n : size));
    next.forEach((n) => container.insertBefore(n, btn));
    shown += next.length;
    btn.hidden = shown >= nodes.length;
    btn.textContent = `Show more (${nodes.length - shown} left)`;
    if (!btn.hidden) auto.recheck();
  };
  container.appendChild(btn);
  const auto = autoMore(btn, () => step());
  btn.addEventListener('click', () => step());
  step(initial);
  container._revealAll = () => { while (shown < nodes.length) step(); };
  container._shownCount = () => shown; // lets a re-render keep what the user had already scrolled through
  return { revealAll: container._revealAll, count: nodes.length };
}

// Server-paged list. fetchPage({ cursor, limit, term }) -> { rows, hasMore } (it may keep its own state in `cursor`,
// which is reset on every reload). renderRows(rows) -> array of DOM nodes (may be async).
export function createPager({ container, size = LIST_PAGE, fetchPage, renderRows, emptyNode, errorText = "Couldn't load this list." }) {
  const list = document.createElement('div');
  const btn = moreButton('Show more');
  const note = document.createElement('p'); note.style.cssText = 'margin:8px 0;color:var(--ink-muted,#666);font-size:14px;';
  let gen = 0, term = '', cursor = {}, hasMore = false, loading = false, count = 0;
  const auto = autoMore(btn, () => loadMore());
  btn.addEventListener('click', () => loadMore());

  async function loadMore() {
    if (loading || !hasMore) return;
    loading = true; btn.disabled = true;
    const g = gen;
    try {
      const { rows, hasMore: more } = await fetchPage({ cursor, limit: size, term });
      if (g !== gen) return;
      const nodes = rows.length ? await renderRows(rows) : [];
      if (g !== gen) return;
      note.textContent = '';
      nodes.forEach((n) => list.appendChild(n));
      count += rows.length; hasMore = !!more;
      if (!count) { list.replaceChildren(emptyNode ? emptyNode(term) : Object.assign(document.createElement('p'), { textContent: 'Nothing here.' })); }
    } catch (e) {
      console.error(e);
      if (g === gen) { note.textContent = errorText; hasMore = false; }
    } finally {
      if (g === gen) { loading = false; btn.disabled = false; btn.hidden = !hasMore; if (hasMore) auto.recheck(); }
    }
  }
  function reload(newTerm) {
    if (newTerm !== undefined) term = String(newTerm || '').trim();
    gen++; cursor = {}; hasMore = true; loading = false; count = 0;
    list.replaceChildren(); note.textContent = 'Loading…'; btn.hidden = true;
    container.replaceChildren(list, note, btn);
    loadMore();
  }
  return { reload, loadMore, stop: auto.stop };
}

// PostgREST .or() filters break on these characters, so strip them from user search text
export const cleanTerm = (t) => String(t || '').replace(/[,()%*\\:]/g, ' ').replace(/\s+/g, ' ').trim();
