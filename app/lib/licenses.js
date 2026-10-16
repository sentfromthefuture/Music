// Beat licensing: tier definitions, default terms and small helpers shared by the upload, detail,
// checkout, account, my-uploads and license pages.
//
// The terms below are PLACEHOLDERS written in plain language. Have a lawyer review them before you
// rely on them, then edit them here (one place) — every page and the license image read from this file.
import { supabase } from './supabase.js';

export const TIER_ORDER = ['basic', 'premium', 'exclusive'];

export const TIERS = {
  basic: {
    label: 'Basic lease',
    blurb: 'MP3 · 1 song · non-exclusive',
    terms: [
      'Non-exclusive license to use this beat in 1 song or project',
      'Up to 50,000 streams in total',
      'No radio or TV broadcast',
      'Producer credit required: "Prod. by {producer}"',
      'The beat stays on sale to other artists',
    ],
  },
  premium: {
    label: 'Premium lease',
    blurb: 'Wider use · MP3',
    blurbExtras: 'Wider use · WAV & stems on request',
    terms: [
      'Non-exclusive license to use this beat in 1 song or project',
      'Up to 500,000 streams in total',
      'Live shows and radio play allowed',
      'WAV and stems on request, when the producer offers them',
      'Producer credit required: "Prod. by {producer}"',
      'The beat stays on sale to other artists',
    ],
  },
  exclusive: {
    label: 'Exclusive license',
    blurb: 'Beat leaves the store · unlimited use',
    blurbExtras: 'Unlimited use · WAV & stems on request',
    terms: [
      'Exclusive license: the beat is removed from the store after purchase',
      'Unlimited streams, radio, TV and live use of your song',
      'WAV and stems on request, when the producer offers them',
      'Producer credit required: "Prod. by {producer}"',
      'Leases sold earlier stay valid',
      'The producer keeps ownership of the beat itself; you own your song',
    ],
  },
};

export const VERIFY_BASE = 'https://zami.site/license.html?id=';

export const tierLabel = (key) => TIERS[key]?.label || key || '';
// extras=false hides the "WAV and stems on request" line for beats whose producer does not offer them.
export const termsFor = (key, producer, extras = true) => (TIERS[key]?.terms || [])
  .filter((t) => extras || !/WAV and stems/.test(t))
  .map((t) => t.replace('{producer}', producer || 'the producer'));

// [{ key, label, blurb, price, extras }] in basic → exclusive order, or null for a beat with no tiers
// (every beat uploaded before licensing existed, or when the database upgrade has not been run).
export function readTiers(item) {
  const raw = item && item.license_tiers;
  if (!raw || typeof raw !== 'object') return null;
  const out = [];
  for (const key of TIER_ORDER) {
    const t = raw[key];
    const price = t && Number(t.price);
    if (t && Number.isFinite(price) && price > 0) {
      const extras = !!t.extras && key !== 'basic';
      out.push({ key, label: TIERS[key].label, blurb: extras && TIERS[key].blurbExtras ? TIERS[key].blurbExtras : TIERS[key].blurb, price, extras });
    }
  }
  return out.length ? out : null;
}
export const lowestPrice = (tiers) => Math.min(...tiers.map((t) => t.price));

// One cheap probe per page load: does the database have the licensing columns yet?
let licensingProbe = null;
export function licensingEnabled() {
  if (!licensingProbe) {
    licensingProbe = Promise.resolve(supabase.from('beats').select('license_tiers').limit(1))
      .then((res) => !res.error).catch(() => false);
  }
  return licensingProbe;
}

const cssLoaded = new Set();
export function loadCssOnce(path) {
  const href = new URL('../../' + path, import.meta.url).href;
  if (cssLoaded.has(href)) return;
  cssLoaded.add(href);
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
}
