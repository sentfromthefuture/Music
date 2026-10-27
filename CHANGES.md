# Change list

## Replaced (now thin bootstraps that load `app/main.js`)
`browse.html` `detail.html` `artist.html` `account.html` `login.html` `checkout.html` `balance.html`
`my-uploads.html` `upload.html` `admin.html` `download.html` — originals preserved in `legacy/original/`.

## Modified
`index.html` — only the logo `src` (830 KB → 13 KB copy). Everything else identical.

## Added
`app/` (shell, router, player, views, styles), `legacy/`, `tools/`, `tests/`, `MODERNIZATION.md`, `DEPLOY.md`, `CHANGES.md`.

## Moved
`account 5.html`, `detail 8.html` → `legacy/` (stale, unreferenced copies). `zami.apk.apk` → `legacy/` (do this one with `git mv`;
it is not in the ZIP).

## Untouched
`zami-share.js`, `zami-app-promo.js`, `zami-download-config.js`, `street-rush.html`, `zami.apk`, `zami-logo.png`,
the database, storage buckets, edge function, RLS policies, environment/keys.

## Song licensing (optional licenses for songs)
**Added:** `supabase/song-licensing.sql`, `app/lib/song-licenses.js`, `app/ui/song-license-{form,block,canvas,controls}.js`, `SONG-LICENSING-TERMS.md`,
`tests/e2e_song_licensing.py`, `tests/sql/song-scenarios.sql`.
**Modified (song-only branches; beat code paths unchanged):** `upload.js`, `my-uploads.js`, `detail.js`, `checkout.js`, `account.js`, `admin.js`,
`license.js`, `app/css/licensing.css`, `tests/stub-supabase.js`.
**Also fixed:** Admin approval and Account "Get link" now use the public file link for free songs (they used to assume the private bucket).
**Not touched:** `supabase/beat-licensing.sql`, `supabase/hardening.sql`, `app/lib/licenses.js`, `app/ui/license-canvas.js`, `app/ui/license-controls.js`.

## Admin: Purchased Items
**Added:** the **Purchased Items** tab on the Admin page (`app/ui/admin-sales.js`, `app/css/admin-sales.css`). Lists every approved sale: what was bought
(song or beat, license type and ID), who bought it (account, name on the license, phone with call/WhatsApp links), from which artist, the price, the
artist/ZAMI split, and when it was ordered and approved. Also lists rejected purchases and rejected uploads. Filters: songs/beats/licenses and a date range;
the page's own search box searches it; 50 rows at a time with Show more. Read-only; it only reads data an admin can already read.
**Rejected uploads:** rejecting an upload in Pending Review used to send it back to the artist as "Awaiting payment" with no trace. `supabase/upload-rejections.sql`
(run once; admin-only log table) makes every rejection recorded from then on. Rejections made before cannot be recovered. Until the SQL is run, rejecting works exactly as
before and the Rejected uploads section explains the missing step.
**Modified:** `app/views/admin.js` (new tab, shared search, best-effort rejection log), `tests/stub-supabase.js`.
**Tests:** `tests/e2e_admin_sales.py` (34 checks), `tests/sql/rejections-scenarios.sql`.

## Artist balance page: richer "Sales by item"
**Added:** `app/ui/artist-sales.js`, `app/css/artist-sales.css`. The "Sales by item" card on `balance.html` now shows: sales count, what customers paid, what the artist
receives (75%), this month, and the best seller; filters (All / Songs / Beats / Licenses) and sorting (most revenue / most sold / latest sale). Each item shows how many
sold, the gross, what the artist earns, the date of the last sale, a license mix (e.g. "Creator x3, Business & ads x1") and how many purchases are still waiting for approval.
Tap an item to see every sale: date, license type and ID, the name printed on the license, the amount, the artist's cut, and (song licenses) valid-until / Expired.
Items with no sales are listed greyed out. Buyers' phone numbers and payment SMS are never requested or shown. No SQL change: artists could already read the purchases of their own items.
**Modified:** `app/views/balance.js` (uses the new module; the balance, withdrawal and payout logic is untouched; the "Beats sold" tile, which counted songs too, is now "Items sold"),
`tests/stub-supabase.js`. **Tests:** `tests/e2e_artist_sales.py` (30 checks).


## Lists load 12 at a time
- **Shared helper** `app/ui/paging.js`: lists draw 12 items and load 12 more as you scroll near the bottom (a "Show more" button stays as a fallback).
- **Admin**: Users, Withdrawal History, Live Content and Taken Down are fetched from Supabase 12 at a time and searched in the database. Pending Review, Purchases, Withdrawals and Complaints are small queues: 12 drawn first, search still checks every card. Purchased Items shows 12 at a time (its filters stay in the page).
- **Other pages**: Library (downloads, purchases, favourites, following), Artist page, My Uploads and Balance "Sales by item" show 12 first.
- Browse page size is 12 (`PAGE_SIZE` in `app/lib/api.js`).
- Tests: `tests/e2e_paging.py`.

## Dark mode
Follows the device setting until the visitor picks a theme with the sun/moon button in the header; the choice is saved in
`localStorage` (`zami-theme`). Light mode is unchanged.
**Added:** `app/css/dark.css` (token overrides + the few hard-coded colours), `app/ui/theme.js` (toggle + live device-follow), `tests/e2e_darkmode.py`.
**Modified:** every page in `<head>` (one inline line that sets `data-theme` before first paint + the `dark.css` link), `index.html`
(own dark tokens), `app/ui/shell.js` + `app/css/shell.css` + `app/ui/icons.js` (toggle button), `app/ui/waveform.js` (bar colours),
`admin.js` / `my-uploads.js` / `complaints.js` (hard-coded red → `var(--danger,#b3261e)`, same colour in light mode).
**Not themed:** `street-rush.html` (the game), the generated share/licence poster images (they are images, not UI).

## Shareable artist profile link
Every artist profile now has a public link, `https://zami.site/artist.html?id=<artist id>` (the page already existed; this makes it
easy to share). **Artist page:** new Share button next to Follow / Play all. **My Account (artists only):** new "Share my profile link" row.
Both open the phone's share sheet when available, otherwise copy the link (clipboard API, then a legacy copy fallback for WebViews) and show a toast.
**Added:** `app/ui/share-link.js`, `tests/e2e_artist_link.py`, `share` icon. **Modified:** `app/views/artist.js`, `app/views/account.js`,
`tools/css-src/artist.css` (+ regenerated `app/css/views/artist.css`).

## Browse page: visual redesign (look only)
Same data, filters, search, player, paging and links as before — only styling and the static page template changed.
**Layout:** every section (New Release, Featured Artists, Trending Now, Recently played, Top Downloads) is now a white panel with a
light-blue border, an icon tile, a title, a divider line and a "See all" pill; "Latest music" gets a gradient divider bar and icon header.
The New Release banner is a light-blue card with the cover on the right; Trending Now is a ranked list with hairline dividers;
a soft wave graphic sits beside the page title; the page background is a very light blue. On screens ≥ 900px, Trending Now and
Top Downloads sit side by side. Dark mode has matching tints.
**Modified:** `tools/css-src/browse.css` (+ regenerated `app/css/views/browse.css`), `app/views/browse.js` (template only: panel wrappers and
SVG section icons replace the emoji; all ids, classes and logic unchanged), `app/css/dark.css` (Browse tints).
