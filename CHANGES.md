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

