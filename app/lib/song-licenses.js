// Song licensing: license types, plain-language terms, the artist's authorisation wording and small helpers shared by
// the upload, My Uploads, detail, checkout, account and license pages.
//
// This file is separate from licenses.js (beats) on purpose, so song licensing can never change how beats behave.
// The terms below are PLACEHOLDERS written in plain language. Have a lawyer review them before you rely on them,
// then edit them here (one place) — every page and the license image read from this file.
import { supabase } from './supabase.js';

export const SONG_LICENSE_ORDER = ['creator', 'business', 'film', 'broadcast', 'live'];

// uses = the examples shown to artists and buyers; terms = what the license grants (the common terms are added below).
export const SONG_LICENSES = {
  creator: {
    label: 'Creator',
    blurb: 'Reels, TikTok, YouTube, podcasts',
    uses: ['TikTok and Instagram Reels', 'YouTube and Facebook videos', 'Vlogs and podcasts', 'Wedding and event videos'],
    grants: [
      'Use the song in your own videos, reels, shorts, vlogs, podcasts and social posts (TikTok, Instagram, YouTube, Facebook and similar)',
      'Monetised channels are allowed',
      'Not for paid adverts, TV or radio broadcast, or films',
    ],
  },
  business: {
    label: 'Business & ads',
    blurb: 'Adverts, shops, lodges, corporate videos',
    uses: ['Online, social media and billboard adverts', 'Background music in a shop, lodge, restaurant or office', 'Corporate, NGO, church and school videos', 'Product launches and promo videos'],
    grants: [
      'Use the song in adverts and promotional videos for one business, brand or organisation (online, social media and billboards)',
      'Play it as background music at that business\u2019s premises',
      'Use it in that organisation\u2019s own corporate, NGO, church or school videos',
      'Not for radio or TV broadcast or films',
    ],
  },
  film: {
    label: 'Film, series & games',
    blurb: 'Movies, series, documentaries, games',
    uses: ['Movies and short films', 'Series and documentaries', 'Video games and apps', 'Trailers for the same title'],
    grants: [
      'Use the song in 1 film, short film, documentary, series episode, video game or app (cinema, streaming or online release)',
      'Includes trailers and promotion of that same title',
      'One title only: each new title needs a new license',
    ],
  },
  broadcast: {
    label: 'Radio & TV',
    blurb: 'Radio play, TV shows and TV adverts',
    uses: ['Radio play on a station', 'TV shows and programmes', 'TV adverts'],
    grants: [
      'Broadcast the song on radio or TV, or use it in a TV show or TV advert, for 1 station or production company',
      'Includes the station\u2019s own online stream of that broadcast',
      'Not for live events or films',
    ],
  },
  live: {
    label: 'Live & DJ',
    blurb: 'Clubs, DJ sets, concerts, weddings, events',
    uses: ['Clubs and DJ sets', 'Concerts and festivals', 'Weddings and parties', 'Public events'],
    grants: [
      'Play the song publicly at clubs, DJ sets, concerts, festivals, weddings and events',
      'Not for radio or TV broadcast, and not for recording into another product',
    ],
  },
};

export const DURATIONS = [
  { months: 12, label: '1 year' },
  { months: 36, label: '3 years' },
  { months: 60, label: '5 years' },
  { months: 0, label: 'Lifetime' },
];
export const TERRITORIES = { zm: 'Zambia', africa: 'Africa', world: 'Worldwide' };

export const songLicenseLabel = (key) => SONG_LICENSES[key]?.label || key || '';
export const durationLabel = (months) => (DURATIONS.find((d) => d.months === Number(months)) || { label: `${months} months` }).label;
export const territoryLabel = (t) => TERRITORIES[t] || t || '';
export const isSongLicenseId = (id) => /^SL-[A-Z0-9]{8}$/.test(String(id || '').toUpperCase());

// Valid-until date: issue date + N months (day clamped to the month's length, like the database does). null = no expiry.
export function licenseExpiry(issuedAt, months) {
  const m = Number(months) || 0;
  if (!m || !issuedAt) return null;
  const d = new Date(issuedAt);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return target;
}
export const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// Terms printed on the license (and shown before buying). data: { artist, months, territory }
export function songTermsFor(key, { artist, months, territory } = {}) {
  const lic = SONG_LICENSES[key]; if (!lic) return [];
  const who = artist || 'the artist';
  const m = Number(months) || 0;
  return [
    ...lic.grants,
    `Valid ${m ? `for ${durationLabel(m)} from the issue date` : 'with no expiry date'}, ${territory === 'world' ? 'anywhere in the world' : `in ${territoryLabel(territory) || 'the agreed territory'} only`}`,
    `Credit required: \u201CMusic by ${who}\u201D`,
    'Non-exclusive: the song stays on sale and the artist can license it to others',
    'No sampling, remixing or re-recording, and no claiming the song with copyright-matching systems (e.g. YouTube Content ID)',
    'You may not resell, share or redistribute the song file. This license cannot be transferred',
    `The artist keeps ownership of the song. Granted by ${who} through ZAMI, acting as the artist\u2019s authorised licensing representative`,
  ];
}

// What the artist agrees to when they offer licenses (shown on the upload form and in My Uploads).
// Mirrors SONG-LICENSING-TERMS.md in the repository.
export const ARTIST_AUTH_POINTS = [
  'ZAMI is a music licensing intermediary. It does not own your song. It connects you with people who want to use music commercially and handles discovery, the licensing process and payment collection.',
  'You authorise ZAMI to market this song and to grant licenses on your behalf, only within the license types, prices, durations and territories you set here. ZAMI earns its usual commission on each sale; you receive the rest.',
  'You keep ownership of your song. Each license is non-exclusive. Licenses already sold stay valid for their full term, even if you later change your options, make the song paid, or remove it.',
  'You are responsible for holding the rights you license, including any rights held by co-writers, producers, performers or labels, any beat or sample you used (follow that licence\u2019s terms) and any rules of a collecting society you belong to. ZAMI does not verify ownership.',
];
export const ARTIST_AUTH_CHECK = 'I control the rights I\u2019m licensing here (including any held by co-writers, producers, performers or labels, and the terms of any beat or sample I used). I authorise ZAMI, as my licensing representative, to market this song and issue the licenses I set above on my behalf, collect payment, and keep its commission.';
export const BUYER_NOTE = 'Licensed by the artist through ZAMI. ZAMI is a licensing marketplace and does not own the song or verify ownership.';

// [{ key, label, blurb, uses, price, months, territory }] in a fixed order, or null for a song with no licenses.
export function readSongLicenses(item) {
  const raw = item && item.license_tiers;
  if (!raw || typeof raw !== 'object') return null;
  const out = [];
  for (const key of SONG_LICENSE_ORDER) {
    const t = raw[key]; const price = t && Number(t.price);
    if (t && Number.isFinite(price) && price > 0 && TERRITORIES[t.territory] && DURATIONS.some((d) => d.months === Number(t.months))) {
      out.push({ key, label: SONG_LICENSES[key].label, blurb: SONG_LICENSES[key].blurb, uses: SONG_LICENSES[key].uses, price, months: Number(t.months), territory: t.territory, song: true });
    }
  }
  return out.length ? out : null;
}

// One cheap probe per page load: does the database have the song-license columns yet?
let probe = null;
export function songLicensingEnabled() {
  if (!probe) {
    probe = Promise.resolve(supabase.from('tracks').select('license_tiers').limit(1))
      .then((res) => !res.error).catch(() => false);
  }
  return probe;
}
