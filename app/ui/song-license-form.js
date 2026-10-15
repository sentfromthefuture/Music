// The artist-side "Offer licenses" form for a song: pick license types, then set price, duration and territory for each,
// and confirm the rights + authorise ZAMI. Used by the upload page and by My Uploads (existing songs).
import { loadCssOnce } from '../lib/licenses.js';
import { SONG_LICENSES, SONG_LICENSE_ORDER, DURATIONS, TERRITORIES, ARTIST_AUTH_POINTS, ARTIST_AUTH_CHECK } from '../lib/song-licenses.js';

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

// initial: the song's current license_tiers (or null). Returns { el, collect() }.
export function createSongLicenseForm({ initial = null, idPrefix = 'slic' } = {}) {
  loadCssOnce('app/css/licensing.css');
  const root = el('div', 'slic');
  const rows = {};

  for (const key of SONG_LICENSE_ORDER) {
    const def = SONG_LICENSES[key];
    const cur = initial && initial[key];
    const row = el('div', 'slic-row');
    const head = el('label', 'slic-head');
    const on = el('input'); on.type = 'checkbox'; on.checked = !!cur; on.id = `${idPrefix}-${key}-on`;
    const txt = el('span'); const b = el('b', null, def.label); const sm = el('small', null, def.blurb); txt.append(b, sm);
    head.append(on, txt);

    const fields = el('div', 'slic-fields'); fields.hidden = !on.checked;
    fields.append(el('p', 'slic-uses', 'Covers: ' + def.uses.join(' \u00B7 ')));
    const grid = el('div', 'slic-grid');
    const priceLab = el('label'); priceLab.append('Price (K)');
    const price = el('input'); price.type = 'number'; price.min = '1'; price.max = '100000'; price.step = '1'; price.placeholder = 'e.g. 100'; price.inputMode = 'numeric';
    price.setAttribute('aria-label', `${def.label} license price in Kwacha`); if (cur) price.value = cur.price; priceLab.append(price);
    const durLab = el('label'); durLab.append('Valid for');
    const dur = el('select'); dur.setAttribute('aria-label', `${def.label} license duration`);
    for (const d of DURATIONS) { const o = el('option', null, d.label); o.value = String(d.months); dur.append(o); }
    dur.value = String(cur ? cur.months : 12); durLab.append(dur);
    const terLab = el('label'); terLab.append('Where');
    const ter = el('select'); ter.setAttribute('aria-label', `${def.label} license territory`);
    for (const [k, v] of Object.entries(TERRITORIES)) { const o = el('option', null, v); o.value = k; ter.append(o); }
    ter.value = cur ? cur.territory : 'zm'; terLab.append(ter);
    grid.append(priceLab, durLab, terLab); fields.append(grid);

    on.addEventListener('change', () => { fields.hidden = !on.checked; });
    row.append(head, fields); root.append(row);
    rows[key] = { on, price, dur, ter };
  }

  const info = el('details', 'lic-terms');
  info.append(el('summary', null, 'How song licensing works on ZAMI'));
  const ul = el('ul'); for (const p of ARTIST_AUTH_POINTS) ul.append(el('li', null, p)); info.append(ul);
  info.append(el('p', 'lic-note', 'This is a plain-language summary, not legal advice. If you are unsure who owns or controls the rights to your song, ask before you license it.'));
  root.append(info);

  const checkLab = el('label', 'lic-check');
  const check = el('input'); check.type = 'checkbox'; check.id = `${idPrefix}-rights`; check.checked = !!initial;
  checkLab.append(check, el('span', null, ARTIST_AUTH_CHECK)); root.append(checkLab);

  function collect() {
    const tiers = {};
    for (const key of SONG_LICENSE_ORDER) {
      const r = rows[key]; if (!r.on.checked) continue;
      const price = Math.round(Number(r.price.value || 0));
      if (!(price >= 1 && price <= 100000)) return { error: `Set a price (K1 to K100000) for the ${SONG_LICENSES[key].label} license.` };
      tiers[key] = { price, months: Number(r.dur.value), territory: r.ter.value };
    }
    if (!Object.keys(tiers).length) return { error: 'Choose at least one license type and set its price.' };
    if (!check.checked) return { error: 'Please confirm you control the rights and authorise ZAMI to issue these licenses.' };
    return { tiers };
  }
  return { el: root, collect };
}
