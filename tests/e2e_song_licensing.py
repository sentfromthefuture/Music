"""Checks for SONG licensing (optional licenses next to the normal download).
Runs against tests/stub-supabase.js: LEGACY = database without supabase/song-licensing.sql, SONG = database with it.
Verifies front-end behaviour only, not the real SQL/RLS (that is tests/sql/song-scenarios.sql)."""
import sys, time, pathlib, struct
sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import e2e
from e2e import Env, check
from playwright.sync_api import sync_playwright

TONE = str(pathlib.Path(__file__).parent / 'tone-a.wav')

def song_env(pw, user=None, mobile=False, beats=False):
    e = Env(pw, mobile=mobile, app_ua=False, user=user)
    e.ctx.add_init_script("try{localStorage.setItem('stub-songlic','1')}catch(e){}")
    if beats: e.ctx.add_init_script("try{localStorage.setItem('stub-licensing','1')}catch(e){}")
    return e

def png_info(path):
    b = pathlib.Path(path).read_bytes()
    ok = b[:8] == b'\x89PNG\r\n\x1a\n'
    w, h = struct.unpack('>II', b[16:24]) if ok else (0, 0)
    return ok, w, h, len(b)

def no_overflow(p): return p.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1")

def run():
    with sync_playwright() as pw:
        # ------------------------------------------------ A. legacy database: nothing changes
        print('A. Legacy database (song-licensing.sql not run yet)')
        e = Env(pw, app_ua=False, user='u2'); p = e.open('upload.html'); p.wait_for_selector('#upload-form'); time.sleep(0.8)
        check('legacy: song license option is hidden on upload', not p.locator('#song-lic-field').is_visible())
        d = e.open('detail.html?type=track&id=1'); d.wait_for_selector('.title'); time.sleep(0.5)
        check('legacy: song page has no license block, normal Download stays', d.locator('.slic-block').count() == 0 and d.locator('.action-btn').inner_text() == 'Download')
        c = e.open('checkout.html?type=track&id=1&license=creator'); time.sleep(1.0)
        check('legacy: asking for a license that does not exist is refused', 'not offered' in c.locator('#loading').inner_text())
        c = e.open('checkout.html?type=track&id=1'); c.wait_for_selector('#free-section:not(.hidden)', timeout=6000)
        check('legacy: free song checkout still offers the free download', c.locator('#buy-section').is_hidden())
        m = Env(pw, app_ua=False, user='u1'); q = m.open('my-uploads.html'); q.wait_for_selector('.card', timeout=8000); time.sleep(0.8)
        check('legacy: My Uploads has no song license editor', q.locator('.slic-card').count() == 0)
        check('legacy: no JS errors', not e.errors and not m.errors, '; '.join((e.errors + m.errors)[:3])); e.close(); m.close()

        # ------------------------------------------------ B. detail page
        print('B. Song page with licenses')
        e = song_env(pw); d = e.open('detail.html?type=track&id=1'); d.wait_for_selector('.slic-block', timeout=8000); time.sleep(0.3)
        names = d.locator('.slic-block .lic-tier-name').all_inner_texts(); prices = d.locator('.slic-block .lic-tier-price').all_inner_texts()
        check('free song lists its 3 license types with prices', names == ['Creator', 'Business & ads', 'Live & DJ'] and prices == ['K50', 'K300', 'K120'], f'{names} {prices}')
        blurbs = ' | '.join(d.locator('.slic-block .lic-tier-blurb').all_inner_texts())
        check('each license shows its duration and territory', '1 year · Zambia' in blurbs and '3 years · Africa' in blurbs and 'Lifetime · Worldwide' in blurbs, blurbs)
        hrefs = [a.get_attribute('href') for a in d.locator('.slic-block a.lic-tier').all()]
        check('license buttons carry the chosen license to checkout', all('type=track' in h and 'id=1' in h and f'license={k}' in h for h, k in zip(hrefs, ['creator', 'business', 'live'])), str(hrefs))
        check('the normal free Download button is still there', d.locator('.action-btn').inner_text() == 'Download')
        d.locator('.slic-block .lic-terms summary').click(); time.sleep(0.2)
        terms = ' | '.join(d.locator('.slic-block .lic-terms li').all_inner_texts())
        check('terms name the artist, duration, territory and ZAMI\'s role', 'Music by Chanda Beats' in terms and 'Valid for 1 year from the issue date, in Zambia only' in terms and 'anywhere in the world' in terms and 'authorised licensing representative' in terms, terms[:300])
        d2 = e.open('detail.html?type=track&id=2'); d2.wait_for_selector('.slic-block', timeout=8000)
        check('paid song: Buy stays and licenses are listed too', d2.locator('.action-btn').inner_text() == 'Buy' and d2.locator('.slic-block .lic-tier-name').all_inner_texts() == ['Film, series & games', 'Radio & TV'])
        d3 = e.open('detail.html?type=track&id=5'); d3.wait_for_selector('.title'); time.sleep(0.5)
        check('a song without licenses looks exactly as before', d3.locator('.slic-block').count() == 0)
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()
        e = song_env(pw, mobile=True); d = e.open('detail.html?type=track&id=1'); d.wait_for_selector('.slic-block', timeout=8000); time.sleep(0.4)
        check('no horizontal overflow on a 390px phone', no_overflow(d)); e.close()

        # ------------------------------------------------ C. checkout with a song license
        print('C. Checkout with a song license')
        e = song_env(pw, user='u4'); p = e.open('checkout.html?type=track&id=2&license=film'); p.wait_for_selector('#buyer-name-input', timeout=8000)
        check('license price, name and what it includes are shown', p.locator('#price-display').inner_text() == 'K500' and 'Film, series & games license' in p.locator('#item-meta').inner_text() and p.locator('.lic-terms li').count() >= 8 and 'does not own the song' in p.locator('.lic-terms').inner_text())
        p.locator('#start-purchase-btn').click(); time.sleep(0.3)
        check('license name is required', 'name' in p.locator('#phone-status').inner_text().lower())
        p.fill('#buyer-name-input', 'Mulenga K'); p.fill('#phone-input', '0971234567'); p.locator('#start-purchase-btn').click(); time.sleep(1.0)
        ins = p.evaluate("() => (window.__ins || []).filter((i) => i.t === 'purchases').map((i) => i.payload)")
        check('purchase saved as a SONG license (not a beat tier)', len(ins) == 1 and ins[0].get('song_license_tier') == 'film' and 'license_tier' not in ins[0] and ins[0].get('buyer_name') == 'Mulenga K' and ins[0].get('item_type') == 'track' and ins[0].get('amount') == 500, str(ins))
        check('payment instructions use the license price', 'K500' in p.locator('#pay-instructions').inner_text())
        p.fill('#sms-input', 'Confirmed. You have sent K500 to ZAMI. Txn ID 1234567890'); p.locator('#sms-submit-btn').click(); time.sleep(0.8)
        check('pasted SMS saved through the narrow database function', p.evaluate("() => (window.__rpc || []).some((r) => r[0] === 'submit_purchase_sms')") and p.locator('#waiting-step').is_visible())
        p.evaluate("""() => { const row = (window.__ins.find((i) => i.t === 'purchases') || {}).payload;
          (window.__chan || []).forEach((c) => c.cb && c.cb({ new: { ...row, id: 101, status: 'fulfilled', download_url: 'https://example.com/x.wav', license_id: 'SL-TEST0101', fulfilled_at: new Date().toISOString(),
            license_terms: { v: 1, type: 'film', price: 500, months: 0, territory: 'world', title: 'Paid Groove', artist: 'Chanda Beats' } } })); }""")
        p.wait_for_selector('#fulfilled-step .lic-actions button', timeout=5000)
        with p.expect_download(timeout=8000) as dl:
            p.locator('#fulfilled-step .lic-actions button').click()
        dl.value.save_as('/tmp/song-license-checkout.png'); ok, w, h, n = png_info('/tmp/song-license-checkout.png')
        check('song license image downloads as a valid PNG', dl.value.suggested_filename == 'ZAMI-song-license-SL-TEST0101.png' and ok and w == 1080 and h > 1300 and n > 20000, f'{dl.value.suggested_filename} {ok} {w}x{h} {n}B')
        check('the download link for the song file appears', p.locator('#paid-download-link').get_attribute('href') == 'https://example.com/x.wav')
        p = e.open('checkout.html?type=track&id=1&license=creator'); p.wait_for_selector('#buyer-name-input', timeout=8000)
        check('a FREE song can be licensed (buy section, license price)', p.locator('#buy-section').is_visible() and p.locator('#free-section').is_hidden() and p.locator('#price-display').inner_text() == 'K50')
        p = e.open('checkout.html?type=track&id=1'); p.wait_for_selector('#free-section:not(.hidden)', timeout=6000)
        check('the plain free download is unchanged', p.locator('#buy-section').is_hidden())
        p = e.open('checkout.html?type=track&id=2&license=live'); time.sleep(1.0)
        check('a license the artist does not offer is refused', 'not offered' in p.locator('#loading').inner_text() and p.locator('#loading a').count() == 1)
        p = e.open('checkout.html?type=track&id=2'); p.wait_for_selector('#buy-section:not(.hidden)', timeout=6000)
        check('the regular paid purchase has no license name field', p.locator('#price-display').inner_text() == 'K20' and p.locator('#buyer-name-input').count() == 0)
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ------------------------------------------------ D. account
        print('D. Account page')
        e = song_env(pw, user='u4', beats=True); p = e.open('account.html'); p.wait_for_selector('.list-row .lic-actions', timeout=8000); time.sleep(0.6)
        row = p.locator('.list-row', has_text='Paid Groove')
        check('song license row shows type, duration, territory and ID', 'Film, series & games license · Lifetime · Worldwide · SL-TEST0001' in row.inner_text().replace('\n', ' '), row.inner_text())
        with p.expect_download(timeout=8000) as dl:
            row.locator('.lic-actions button', has_text='License').click()
        dl.value.save_as('/tmp/song-license-account.png')
        check('account song license image is a valid PNG', dl.value.suggested_filename == 'ZAMI-song-license-SL-TEST0001.png' and png_info('/tmp/song-license-account.png')[0])
        beat_btns = p.locator('.list-row', has_text='Night Drive Beat').locator('.lic-actions button').all_inner_texts()
        check('beat purchases keep their own buttons (License, Stems, Report)', beat_btns == ['License', 'Stems & WAV', 'Report a problem'], str(beat_btns))
        check('song license has no stems or report buttons', row.locator('.lic-actions button').all_inner_texts() == ['License'])
        p.evaluate("() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); }; }")
        p.locator('.list-row', has_text='Free Anthem').locator('.mini-btn').click(); time.sleep(0.5)
        row.locator('.mini-btn').click(); time.sleep(0.5)
        opened = p.evaluate("() => window.__opened")
        check('free song license gets the PUBLIC file link', len(opened) == 2 and '/object/public/public-previews/u1/a.wav' in opened[0], str(opened))
        check('paid song license gets a signed private link', '/object/sign/private-full/u1/full2.wav' in opened[1], str(opened))
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ------------------------------------------------ E. upload form
        print('E. Upload with licenses')
        e = song_env(pw, user='u2', mobile=True); p = e.open('upload.html'); p.wait_for_selector('#upload-form'); time.sleep(0.8)
        check('track form offers licenses as an optional extra', p.locator('#song-lic-field').is_visible() and p.locator('#song-lic-form').is_hidden() and p.locator('#price-field').is_visible())
        p.locator('#song-lic-offer').check(); time.sleep(0.3)
        check('five license types appear, with fields hidden until ticked', p.locator('.slic-row').count() == 5 and p.locator('.slic-fields:visible').count() == 0)
        p.locator('.type-toggle button[data-type="beat"]').tap(); time.sleep(0.3)
        check('the song license option is not shown for beats', p.locator('#song-lic-field').is_hidden())
        p.locator('.type-toggle button[data-type="track"]').tap(); time.sleep(0.3)
        check('...and returns for tracks', p.locator('#song-lic-field').is_visible() and p.locator('#song-lic-form').is_visible())
        p.locator('.price-toggle button[data-free="true"]').tap(); time.sleep(0.2)   # (existing page behaviour: Beat forces Paid, so pick Free again)
        p.set_input_files('#audio-input', TONE); p.fill('#title', 'Licensed Song'); p.select_option('#genre', index=1); time.sleep(1.2)
        p.locator('#submit-btn').tap(); time.sleep(0.4)
        check('needs at least one license type', 'at least one license' in p.locator('#status-line').inner_text().lower())
        p.locator('#up-creator-on').check(); time.sleep(0.2)
        check('ticking a type opens its price, duration and territory', p.locator('.slic-fields:visible').count() == 1 and p.locator('.slic-fields:visible select').count() == 2)
        p.locator('#submit-btn').tap(); time.sleep(0.4)
        check('needs a price', 'price' in p.locator('#status-line').inner_text().lower())
        p.locator('.slic-row').nth(0).locator('input[type=number]').fill('75')
        p.locator('#up-live-on').check(); p.locator('.slic-row').nth(4).locator('input[type=number]').fill('200')
        p.locator('.slic-row').nth(4).locator('select').nth(0).select_option('0'); p.locator('.slic-row').nth(4).locator('select').nth(1).select_option('world')
        p.locator('#submit-btn').tap(); time.sleep(0.4)
        check('rights confirmation + authorisation is required', 'confirm' in p.locator('#status-line').inner_text().lower())
        txt = p.locator('.slic .lic-terms').inner_text() if p.locator('.slic .lic-terms').count() else ''
        p.locator('.slic .lic-terms summary').click(); time.sleep(0.2)
        txt = p.locator('.slic .lic-terms').inner_text()
        check('the authorisation explains ZAMI\'s role and the artist\'s responsibility', 'intermediary' in txt and 'does not own your song' in txt and 'on your behalf' in txt and 'co-writers' in txt and 'does not verify ownership' in txt, txt[:200])
        check('no horizontal overflow on a 390px phone', no_overflow(p))
        p.locator('#up-rights').check(); p.locator('#submit-btn').tap()
        p.wait_for_function("() => (window.__ins || []).some((i) => i.t === 'tracks')", timeout=20000)
        pl = p.evaluate("() => (window.__ins || []).filter((i) => i.t === 'tracks').map((i) => i.payload)[0]")
        check('song saved with its licenses and the authorisation', pl.get('license_tiers') == {'creator': {'price': 75, 'months': 12, 'territory': 'zm'}, 'live': {'price': 200, 'months': 0, 'territory': 'world'}} and pl.get('license_rights_confirmed') is True and pl.get('is_free') is True, str(pl)[:400])
        check('no JS errors', not e.errors, '; '.join(e.errors[:3]))
        p = e.open('upload.html'); p.wait_for_selector('#upload-form'); time.sleep(0.8)
        p.set_input_files('#audio-input', TONE); p.fill('#title', 'Plain Song'); p.select_option('#genre', index=1); time.sleep(1.2)
        p.locator('#submit-btn').tap()
        p.wait_for_function("() => (window.__ins || []).some((i) => i.t === 'tracks')", timeout=20000)
        pl = p.evaluate("() => (window.__ins || []).filter((i) => i.t === 'tracks').map((i) => i.payload)[0]")
        check('a song uploaded WITHOUT licenses sends no license fields at all', 'license_tiers' not in pl and 'license_rights_confirmed' not in pl, str(pl)[:300])
        e.close()

        # ------------------------------------------------ F. My Uploads editor
        print('F. My Uploads: licenses on an existing song')
        e = song_env(pw, user='u1'); p = e.open('my-uploads.html'); p.wait_for_selector('.slic-card', timeout=8000); time.sleep(0.8)
        card = p.locator('.card[data-item-type="track"][data-item-id="1"]')
        check('existing song shows how many licenses it offers', 'Song licenses (3 offered)' in card.locator('.slic-card > summary').inner_text())
        check('a song with none offers to add them', p.locator('.card[data-item-id="10"] .slic-card > summary, .card[data-item-id="11"] .slic-card > summary').first.inner_text() == 'Offer licenses for this song')
        card.locator('.slic-card > summary').click(); time.sleep(0.4)
        check('the editor is pre-filled from the song', card.locator('#mu1-creator-on').is_checked() and card.locator('.slic-row').nth(0).locator('input[type=number]').input_value() == '50' and not card.locator('#mu1-film-on').is_checked())
        card.locator('.slic-row').nth(0).locator('input[type=number]').fill('60')
        card.locator('button', has_text='Save licenses').click(); time.sleep(0.6)
        check('rights confirmation is kept for an already-authorised song', p.evaluate("() => window.__tables.tracks.find((t) => t.id === 1).license_tiers.creator.price") == 60 and p.evaluate("() => window.__tables.tracks.find((t) => t.id === 1).license_rights_confirmed") is True and 'Saved' in card.locator('.slic-card .lic-msg').inner_text())
        card.locator('button', has_text='Stop offering licenses').click(); time.sleep(0.6)
        check('the artist can stop offering licenses', p.evaluate("() => window.__tables.tracks.find((t) => t.id === 1).license_tiers") is None and card.locator('.slic-card > summary').inner_text() == 'Offer licenses for this song' and 'stay valid' in card.locator('.slic-card .lic-msg').inner_text())
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ------------------------------------------------ G. verify page
        print('G. License verify page')
        e = song_env(pw); p = e.open('license.html?id=sl-test0001'); p.wait_for_selector('.lic-card', timeout=8000); time.sleep(0.4)
        txt = p.locator('.lic-card').inner_text()
        check('valid song license shows the frozen terms', all(x in txt for x in ['Valid license', 'Paid Groove', 'Chanda Beats', 'Film, series & games', 'Worldwide', 'Lifetime', 'No expiry date', 'Mulenga K']), txt)
        check('it says ZAMI does not own the song', 'does not own the song' in txt)
        with p.expect_download(timeout=8000) as dl:
            p.locator('.lic-card button').click()
        dl.value.save_as('/tmp/song-license-verify.png'); check('verify page can save the song license image', png_info('/tmp/song-license-verify.png')[0] and dl.value.suggested_filename == 'ZAMI-song-license-SL-TEST0001.png')
        p = e.open('license.html?id=SL-TEST0003'); p.wait_for_selector('.lic-card', timeout=8000)
        check('an expired license is shown as expired', 'Expired license' in p.locator('.lic-card').inner_text() and 'Valid license' not in p.locator('.lic-card').inner_text())
        p = e.open('license.html?id=SL-ZZZZZZZZ'); p.wait_for_selector('.lic-card', timeout=8000)
        check('unknown song license id is not valid', 'No valid license' in p.locator('.lic-card').inner_text())
        p = e.open('license.html?id=SL-12'); p.wait_for_selector('.lic-card', timeout=8000)
        check('malformed id is rejected without a lookup', 'not a valid license ID' in p.locator('.lic-card').inner_text() and p.evaluate("() => !(window.__rpc || []).length"))
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ------------------------------------------------ H. admin approval
        print('H. Admin approves song licenses')
        e = song_env(pw, user='u3', beats=True); p = e.open('admin.html'); p.wait_for_selector('.tab-btn[data-tab="purchases"]', timeout=8000)
        p.locator('.tab-btn[data-tab="purchases"]').click(); p.wait_for_selector('#tab-purchases .card .paid', timeout=6000); time.sleep(0.4)
        t = p.locator('#tab-purchases').inner_text()
        check('admin sees the license type, duration and territory', 'Song license: Business & ads (3 years, Africa)' in t and 'Song license: Radio & TV (5 years, Zambia)' in t, t[:300])
        p.locator('#tab-purchases .card', has_text='Free Anthem').locator('.paid').click(); time.sleep(0.8)
        p.locator('#tab-purchases .card', has_text='Paid Groove').locator('.paid').click(); time.sleep(0.8)
        free = p.evaluate("() => window.__tables.purchases.find((x) => x.id === 603)"); paid = p.evaluate("() => window.__tables.purchases.find((x) => x.id === 604)")
        check('license on a FREE song is approved with the public file link', free['status'] == 'fulfilled' and '/object/public/public-previews/u1/a.wav' in (free.get('download_url') or ''), str(free)[:300])
        check('license on a PAID song is approved with a signed private link', paid['status'] == 'fulfilled' and '/object/sign/private-full/u1/full2.wav' in (paid.get('download_url') or ''), str(paid)[:300])
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

    bad = [r for r in e2e.results if not r[1]]
    print(f"\n{len(e2e.results) - len(bad)}/{len(e2e.results)} song licensing checks passed")
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(run())
