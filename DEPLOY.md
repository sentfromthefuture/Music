# Deploying the modernised ZAMI front-end

No build step, no new services, no database changes. It is the same kind of static site as before,
served by GitHub Pages from the same path (`https://sentfromthefuture.github.io/Music/`).

## 1. Apply it to your repo (manual copy is fine)

```bash
cd Music                                  # your local clone
git checkout -b modernize                 # keep main untouched until you've tested
# copy the contents of this ZIP over the repo folder (overwrite when asked), then:
git mv zami.apk.apk legacy/zami.apk.apk   # byte-identical duplicate of zami.apk, moved out of the root
git rm "account 5.html" "detail 8.html"   # stale copies; they are preserved in legacy/ already
git add -A && git commit -m "Modernise front-end: app shell, router, persistent player"
```

* **Keep `zami.apk` in the repo root** — `zami-download-config.js` and the download page point at it. The ZIP does not
  include the APKs, so your existing ones stay as they are.
* Keep your existing `CNAME`/Pages settings if you have any. Nothing in Pages settings needs to change.
* Safe preview: push the branch and set Pages to that branch temporarily, or run locally:
  `python3 -m http.server 8000` from the folder **above** a directory named `Music`, then open
  `http://localhost:8000/Music/browse.html`.

## 2. Android app

* Start URL `…/Music/browse.html` still works; every old URL still works. No app rebuild is needed *unless* the
  Kotlin `WebViewClient` restricts navigation in a way that conflicts with the items below.
* Hosts used are the same as before (`sentfromthefuture.github.io`, `*.supabase.co`, `cdn.jsdelivr.net`);
  `esm.sh` (old WaveSurfer import) is **no longer used**.
* In-app moves use the History API (no real navigation), so `shouldOverrideUrlLoading` is not called for them and the
  hardware Back button's `canGoBack()/goBack()` walks the in-app history. **Please test Back on a real device**:
  if your `onBackPressed` closes the app when the *current URL* is `browse.html`, it will still behave as before on that page.
* The `ZamiApp` user-agent suffix still hides the "Get the app" popup (verified in tests).
* Background audio when the screen is off is controlled by the Android app/WebView settings, not by the web code —
  unchanged by this work.

## 3. Manual checklist on the live site (what the stub-based tests cannot cover)

1. Log in with phone OTP (new + existing user); log out.
2. Browse: feed loads, search, genre chips, featured artist filter, load more, trending / top downloads.
3. Press play on a card, then open other pages (detail, artist, Library, Upload): **music must keep playing**.
   Check Back/Forward, refresh on a detail URL, and open a shared poster link.
4. Free track: Download works and appears in *My Downloads*; counters go up.
5. Paid track/beat: checkout → paste MoMo SMS → admin approves → buyer's download link appears (Realtime) and works.
6. Artist: upload (cover + audio + preview), pay listing fee flow, My Uploads, edit/delete, balance & withdrawal request.
7. Admin: each of the 7 tabs, approve/reject, payouts, user delete.
8. Favourites and follows (logged in and logged out prompts).
9. Phone: bottom nav, mini player above it, now-playing sheet, lock-screen / notification controls.

## 4. Rollback

`git revert` the commit, or copy `legacy/original/*.html` back over the root pages. The originals are byte-for-byte what
was in your repo.

## 5. Known limitations (honest list)

* Tests ran in headless **Chromium** against a **stubbed Supabase** — not Safari, Firefox, a real Android WebView, or your
  live database. Section 3 is how you close that gap.
* Browse, Detail and Artist were rebuilt on the new components. The eight transactional pages (Account, Login, Checkout,
  Balance, My Uploads, Upload, Admin, Download) deliberately keep their original logic (so money and upload flows are not
  rewritten); they run inside the new shell with scoped CSS and look as before, with the new header / bottom nav / player around them.
  They were compared against the originals under the same stub (identical text, fields and redirects for guest, listener,
  artist and admin). Redesigning them is a sensible next stage.
* Search still matches **titles only** (as before), although the placeholder mentions artists. Matching artist names needs a
  profiles lookup; I left the search logic unchanged on purpose.
* "Albums" and "Playlists" do not exist in your data model, so none were invented.
* Supabase-js is still loaded from `cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm` exactly as before (unpinned minor
  versions). Pinning an exact version is advisable but needs testing against your project, so I did not change it.

## 6. Recommended follow-ups (need your decision — none applied)

These come from reading the client code; I could not see your RLS policies, so please verify them in Supabase:

1. **Purchases:** the browser sends `amount` and `item` itself. Make sure an RLS policy/trigger forces the amount from the
   item's price and only allows `status = 'pending'` inserts by the buyer.
2. **Counters:** `increment_play_count` / `increment_download_count` are callable by anyone and feed "Trending". Consider
   rate-limiting or de-duplicating server-side.
3. **Admin:** `is_admin` and `role` live on `profiles`, which users can update for themselves. Confirm RLS prevents users from
   changing `is_admin` (and ideally `role` to anything but listener/artist).
4. **Private files:** confirm the `private-full` bucket policy only lets the buyer/owner/admin create signed URLs.
5. **Performance:** "Featured artists" scans every row of `browse_feed` and "Trending" scans a week of downloads. A SQL view or
   RPC that returns the top 10 directly would cut that to one tiny query (needs a DB change, so it is yours to approve).
