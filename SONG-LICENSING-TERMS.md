# Song licensing — how the arrangement works

Plain-language working draft of the arrangement between ZAMI and an artist who offers licenses on a song.
**It is not legal advice.** Have a lawyer review it (and the wording in `app/lib/song-licenses.js`) before you rely on it.
The artist-facing summary on the upload form and My Uploads is `ARTIST_AUTH_POINTS` / `ARTIST_AUTH_CHECK` in that file;
keep the two in step.

## Clear authorisation
This arrangement requires particularly clear authorisation. ZAMI should also establish that the artist controls the rights being
licensed, including any relevant rights held by co-writers, producers, performers or labels.

ZAMI operates as a music licensing intermediary, connecting artists with potential customers who want to use their music commercially.
Artists authorise ZAMI to market their music, reach potential licensees and grant licenses on their behalf within agreed terms and
conditions. ZAMI handles discovery, customer acquisition, the licensing process and payment collection, earning a commission on
successful transactions.

The artist retains ownership of their music, while ZAMI provides the infrastructure and distribution network that helps turn their
creative work into commercial opportunities. In essence, ZAMI does not need to own the music it licenses. Its value lies in connecting
the right music with the right customers and making the licensing process accessible, transparent and convenient.

## How it works
1. **The artist uploads a song.** During upload (or later, in My Uploads) the artist decides whether the song is available for licensing
   and defines the permitted uses, price, duration and territory for each license type.
2. **The artist authorises ZAMI.** By ticking the confirmation box, the artist gives ZAMI permission to market the song and issue
   licenses within the authority the artist has provided. The time of that authorisation is recorded on the song (`license_agreed_at`).
3. **ZAMI finds customers.** For example: advertising agencies looking for music for commercials; YouTubers and filmmakers looking for
   background music; businesses producing promotional videos; game developers looking for soundtracks.
4. **ZAMI facilitates the transaction.** Customers choose a license, accept its terms and pay through the platform. ZAMI issues the
   license according to the artist's authorisation, with a verifiable `SL-` ID.
5. **Revenue is shared.** ZAMI receives its commission and the artist receives the rest, the same way as other sales on the platform.

## The most important legal distinction
| Model | What ZAMI can do |
|---|---|
| Licensing agent | Market the music, find customers and facilitate licenses within the artist's authorisation. |
| Authorised licensing representative | Also **grant** licenses on the artist's behalf, provided the agreement explicitly grants that authority. |

ZAMI issues the license itself on the artist's behalf, so it needs the second model. The explicit grant is the artist's confirmation on
the upload form ("I authorise ZAMI, as my licensing representative, to market this song and issue the licenses I set above on my
behalf…"). Every license image repeats that it was granted by the artist through ZAMI as the artist's authorised licensing
representative. If you ever want ZAMI to act only as a licensing agent (introducing buyers, with the artist signing each license), the
wording and the flow must change.

## Responsibility for ownership
ZAMI is a platform and does not verify who owns a song. The artist is responsible for holding the rights they license, including:
- rights held by co-writers, producers, performers or labels;
- any beat or sample used in the song. A song made on a leased beat must respect that beat's license (its limits can restrict what the
  artist may license);
- the rules of any collecting society the artist belongs to (for example, a society may control public performance or broadcast rights).

ZAMI shows this to the artist before they can offer licenses, and to the buyer on every license ("ZAMI is a licensing marketplace and does
not own the song or verify ownership"). A checkbox shifts responsibility to the artist but does not remove ZAMI's own exposure, so
have the terms of service reviewed.

## License types
| Type | Covers (examples) |
|---|---|
| Creator | TikTok and Instagram Reels, YouTube and Facebook videos, vlogs, podcasts, wedding and event videos |
| Business & ads | Online, social and billboard adverts; background music in a shop, lodge, restaurant or office; corporate, NGO, church and school videos; product launches |
| Film, series & games | Movies and short films, series and documentaries, video games and apps, trailers for the same title |
| Radio & TV | Radio play on a station, TV shows and programmes, TV adverts |
| Live & DJ | Clubs and DJ sets, concerts and festivals, weddings and parties, public events |

For each type the artist chooses a **price**, a **duration** (1 year, 3 years, 5 years or lifetime) and a **territory** (Zambia, Africa or
worldwide). All song licenses are non-exclusive, require a credit to the artist, and do not allow sampling, remixing, resale, transfer
or claiming the song with copyright-matching systems (e.g. YouTube Content ID). A license purchase also includes the song file.

## After a license is sold
The terms (type, price, duration, territory, song title and artist name) are **frozen on the purchase** when it is bought. The artist can
later change their options, make the song paid, or remove it; they can only stop selling **new** licenses. Licenses already sold stay valid
and verifiable (`license.html?id=SL-XXXXXXXX`) for their full term. The verify page shows "Expired license" once the term has ended.

## Not covered (yet)
- Sample / remix licenses (another musician using part of the song). The current types do not grant sampling.
- Complaints ("Report a problem") for song licenses; the beat complaint flow stays beat-only.
- Revoking a license (for example after an ownership dispute). Today an admin would have to handle that in the database.
- A "licensable" badge on browse cards (needs a change to the `browse_feed` view).
