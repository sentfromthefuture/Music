# Beat licensing — how to switch it on

The code is already deployed but **dormant**: the site only shows license tiers once it detects the new
database columns, so nothing changes (and nothing can break) until you run the SQL.

## Switch on
1. Supabase dashboard → **SQL Editor** → New query.
2. Paste the whole of `supabase/beat-licensing.sql` → **Run**. It is safe to run twice.
3. If it shows an error, copy the message — usually a column type or a status value that differs from what the script assumes.

## What it adds
- **Tiers per beat** (Basic / Premium / Exclusive), each with its own price. `beats.price` stays the lowest tier price, so browse cards keep working.
- **Server-side price and license ID** (trigger on `purchases`): the amount comes from the database, never from the browser.
- **Exclusive rule**: approving an exclusive purchase sets `exclusive_sold`, delists the beat, and blocks relisting. Earlier leases stay valid. To undo one by hand: `begin; set local zami.allow_reset = 'on'; update beats set exclusive_sold=false, status='approved' where id=...; commit;`
- **License image** (HTML canvas, generated on the buyer's phone) with a license ID checked at `license.html?id=ZL-XXXXXXXX`.
- **Stems / WAV without server storage**: the producer pastes a private link at upload (visible only to Premium/Exclusive buyers after approval), and buyers can tap **Request stems** — the producer sees it in My Uploads and delivers off-platform.
- Optional **key**, **mood tags** and a **rights confirmation** on beat uploads.

## Test after running the SQL (about 10 minutes)
1. Upload a beat with all three tiers → approve it in Admin.
2. With a second account, buy Premium → approve the payment → the buyer sees **Save your license**; check the ID at `license.html`.
3. Buy Exclusive → approve → the beat disappears from Browse and My Uploads shows "Sold exclusively".
4. Buyer taps **Stems & WAV → Request**; the producer sees it in My Uploads.

## Roll back
`git revert` the licensing commit, or leave it: without the columns the new UI stays hidden. The SQL only adds things; existing rows are untouched.

## Edit the terms
The license wording and limits (stream caps etc.) live in `app/lib/licenses.js`. They are plain-language placeholders — have them reviewed before relying on them.

## Not covered
RLS policies on existing tables were not visible when this was written. Check that buyers cannot edit `status`, `amount` or `license_*` on their own `purchases` rows (see DEPLOY.md follow-ups).

## Buyer complaints ("Report a problem")
Run `supabase/complaints.sql` once (adds one table, `purchase_complaints`; safe to re-run). Until then the button stays hidden.
- Under each beat purchase in **Account** the buyer gets **Report a problem**: a message with their name and phone number.
- The **producer** sees it in **My Uploads → Buyer complaints**; **you** see it in **Admin → Complaints** (open ones first) and can **Mark resolved**.
- Buyers can only file against beats they bought (max 10 a day); only admins can change a complaint's status.
- The Stems & WAV panel now shows the producer's Google Drive link first; "Ask the producer" is the fallback if the link doesn't work.

### Resolving complaints
Run `supabase/complaints-update.sql` once after `complaints.sql` (a fresh install gets it from `complaints.sql`).
- **Producer** (My Uploads and the Account page): sees each complaint, writes a short reply and taps **Mark as fixed**. The buyer reads the reply; admins see "Producer says fixed".
- **Buyer**: can tap **Still not fixed? Reopen** once the producer says fixed or it is resolved.
- **Admin**: only admins can **Mark resolved**. The rules are enforced in the database (a trigger), not just the screens.

### Producer contact numbers (admin only)
Run `supabase/admin-phones.sql` once. Admin → Complaints then shows each producer's verified **login number** (with call + WhatsApp links), falling back to their payout MoMo number if the lookup isn't set up. The numbers stay in Supabase's auth system and are only returned to admins by a function; they are never copied into public tables.

---

# Song licensing — optional licenses next to the normal download

Artists can optionally offer licenses on a song (free or paid) so people can legally use it in videos, adverts, films, radio/TV or at
events. The regular Free/Paid download is unchanged; a license is a separate purchase that also includes the file. The arrangement between
ZAMI and the artist is explained in `SONG-LICENSING-TERMS.md`.

## Switch on
Run `supabase/song-licensing.sql` once in Supabase → SQL Editor (after `beat-licensing.sql` and `hardening.sql`; it is safe to run again).
Until you do, the site behaves exactly as before: the new screens switch themselves on only when they detect the new columns.
It is independent of beat licensing: it adds new columns, a new trigger and a new function, and does not change any beat column, rule or
function, so re-running the beat SQL later cannot undo it.

## What it adds
- **Upload:** an optional "Also offer licenses for this song" section for tracks: five license types (Creator, Business & ads, Film/series/games,
  Radio & TV, Live & DJ), each with a price, duration and territory, plus the rights confirmation that authorises ZAMI.
- **My Uploads:** the same editor for songs that are already live (add, change or stop offering licenses).
- **Song page:** a "License this song" block under the normal Download/Buy button.
- **Checkout:** `checkout.html?type=track&id=…&license=creator|business|film|broadcast|live`. The server sets the price, an `SL-` license ID and a
  frozen copy of the terms.
- **License image + verify page:** `license.html?id=SL-XXXXXXXX` shows the frozen terms and whether the license has expired.
- **Admin / Account:** license type shown on purchases; a license on a *free* song is approved with the public file link (free songs live in the
  public bucket), a license on a paid song with a signed link as before.

## Test after running the SQL (about 10 minutes)
1. Upload a song, tick "Also offer licenses", choose a type, set a price, tick the confirmation.
2. Approve it in Admin. Open the song page: the "License this song" block appears under Download/Buy.
3. As a buyer, license it, send the payment SMS, then in Admin → Purchases tap **Mark Paid**. The buyer's Account shows the license and a
   **License** button that saves the image. Open `license.html?id=SL-…` from the image to check it.
4. Edit the song's licenses in My Uploads, then re-open the license you bought: it still shows the original (frozen) terms.

## Pause
`update public.tracks set license_tiers = null;` hides every song's license options. Licenses already sold stay valid and verifiable.

## Edit the terms
Everything (license types, examples, term wording, the artist authorisation text, the note shown to buyers) is in `app/lib/song-licenses.js`.
Have a lawyer review the wording first.

## Tests
`tests/sql/song-scenarios.sql` (run after the beat scenarios; see `tests/sql/README.md`) tries to cheat the database: forged prices and terms,
unapproved songs, unoffered license types, editing a sold license. `tests/e2e_song_licensing.py` covers the screens.

