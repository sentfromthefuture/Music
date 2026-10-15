// "License this song" block on the song page: sits under the normal Free/Buy action and never replaces it.
import { loadCssOnce } from '../lib/licenses.js';
import { readSongLicenses, songTermsFor, durationLabel, territoryLabel, BUYER_NOTE } from '../lib/song-licenses.js';

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

// Returns the block, or null when the song offers no licenses.
export function songLicenseBlock(item, artistName) {
  const lics = readSongLicenses(item);
  if (!lics) return null;
  loadCssOnce('app/css/licensing.css');
  const wrap = el('section', 'slic-block');
  wrap.append(el('h2', 'slic-h', 'License this song'));
  wrap.append(el('p', 'lic-note', 'The regular download is for personal listening. To use this song in your videos, adverts, films, broadcasts or events, choose a license.'));
  const list = el('div', 'lic-tiers');
  for (const l of lics) {
    const a = el('a', 'lic-tier'); a.href = `checkout.html?type=track&id=${encodeURIComponent(item.id)}&license=${l.key}`;
    const main = el('span', 'lic-tier-main');
    main.append(el('span', 'lic-tier-name', l.label), el('span', 'lic-tier-blurb', l.blurb), el('span', 'lic-tier-blurb', `${l.months ? durationLabel(l.months) : 'Lifetime'} \u00B7 ${territoryLabel(l.territory)}`));
    a.append(main, el('span', 'lic-tier-price', `K${l.price}`), el('span', 'lic-tier-buy', 'License'));
    list.append(a);
  }
  wrap.append(list);
  const terms = el('details', 'lic-terms');
  terms.append(el('summary', null, 'What each license includes'));
  for (const l of lics) {
    terms.append(el('h4', null, l.label));
    const ul = el('ul'); for (const t of songTermsFor(l.key, { artist: artistName, months: l.months, territory: l.territory })) ul.append(el('li', null, t)); terms.append(ul);
  }
  terms.append(el('p', 'lic-note', 'After your payment is approved you get a license image with a verifiable ID, and the song file. This is a plain-language summary of the terms. ' + BUYER_NOTE));
  wrap.append(terms);
  return wrap;
}
