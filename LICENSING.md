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
