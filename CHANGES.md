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
