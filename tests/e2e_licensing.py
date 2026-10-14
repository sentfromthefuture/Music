"""Checks for beat licensing (tiers, checkout, license image, stems requests, verify page).
Runs against tests/stub-supabase.js: LEGACY mode = database without supabase/beat-licensing.sql,
LICENSING mode = database with it. Verifies front-end behaviour only, not the real SQL/RLS."""
import sys, time, pathlib, struct
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import e2e
from e2e import Env, check, results
from playwright.sync_api import sync_playwright

TONE = str(pathlib.Path(__file__).parent / 'tone-a.wav')
COVER = str(pathlib.Path(__file__).parent / 'cover.png')

def lic_env(pw, user=None, mobile=False):
    e = Env(pw, mobile=mobile, app_ua=False, user=user)
    e.ctx.add_init_script("try{localStorage.setItem('stub-licensing','1')}catch(e){}")
    return e

def png_info(path):
    b = pathlib.Path(path).read_bytes()
    ok = b[:8] == b'\x89PNG\r\n\x1a\n'
    w, h = struct.unpack('>II', b[16:24]) if ok else (0, 0)
    return ok, w, h, len(b)

def run():
    with sync_playwright() as pw:
        # ------------------------------------------------ A. legacy database: nothing changes
        print('A. Legacy database (licensing SQL not run yet)')
        e = Env(pw, app_ua=False, user='u2'); p = e.open('upload.html'); p.wait_for_selector('#upload-form'); time.sleep(0.6)
        p.locator('.type-toggle button[data-type="beat"]').click(); time.sleep(0.3)
        check('legacy: beat upload keeps the single price field', p.locator('#price-field').is_visible() and not p.locator('#tiers-field').is_visible())
        d = e.open('detail.html?type=beat&id=3'); d.wait_for_selector('.title'); time.sleep(0.5)
        check('legacy: beat detail has no license tiers', d.locator('.lic-tier').count() == 0 and d.locator('.action-row .primary, .action-row button').count() >= 1)
        check('legacy: no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ------------------------------------------------ B. detail page tiers
        print('B. Detail page with license tiers')
        e = lic_env(pw); d = e.open('detail.html?type=beat&id=3'); d.wait_for_selector('.lic-tier'); time.sleep(0.4)
        names = d.locator('.lic-tier-name').all_inner_texts(); prices = d.locator('.lic-tier-price').all_inner_texts()
        check('three tiers listed with prices', names == ['Basic lease', 'Premium lease', 'Exclusive license'] and prices == ['K50', 'K120', 'K600'], f'{names} {prices}')
        hrefs = [a.get_attribute('href') for a in d.locator('a.lic-tier').all()]
        check('tier buttons carry the chosen tier to checkout', all(f'tier={t}' in h and 'type=beat' in h and 'id=3' in h for h, t in zip(hrefs, ['basic', 'premium', 'exclusive'])), str(hrefs))
        d.locator('.lic-terms summary').click(); time.sleep(0.2)
        check('terms list per tier, extras line only where offered', d.locator('.lic-terms h4').count() == 3 and d.locator('.lic-terms li', has_text='WAV and stems').count() == 2)
        d2 = e.open('detail.html?type=beat&id=7'); d2.wait_for_selector('.title'); time.sleep(0.4)
        check('a beat without tiers still shows the old single Buy', d2.locator('.lic-tier').count() == 0)
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ------------------------------------------------ C. checkout with tier + license image
        print('C. Checkout with a tier')
        e = lic_env(pw, user='u4'); p = e.open('checkout.html?type=beat&id=3'); time.sleep(1.0)
        check('missing tier asks the buyer to choose one', 'choose' in p.locator('#loading').inner_text().lower() and p.locator('#loading a').count() == 1)
        p = e.open('checkout.html?type=beat&id=3&tier=premium'); p.wait_for_selector('#buyer-name-input', timeout=8000)
        check('premium price and name shown', p.locator('#price-display').inner_text() == 'K120' and 'Premium lease' in p.locator('#item-meta').inner_text())
        p.locator('#start-purchase-btn').click(); time.sleep(0.3)
        check('license name is required', 'name' in p.locator('#phone-status').inner_text().lower())
        p.fill('#buyer-name-input', 'Mulenga K'); p.fill('#phone-input', '0971234567'); p.locator('#start-purchase-btn').click(); time.sleep(1.0)
        ins = p.evaluate("() => (window.__ins || []).filter((i) => i.t === 'purchases').map((i) => i.payload)")
        check('purchase saved with tier + license name', len(ins) == 1 and ins[0].get('license_tier') == 'premium' and ins[0].get('buyer_name') == 'Mulenga K' and ins[0].get('amount') == 120, str(ins))
        check('payment instructions use the tier price', 'K120' in p.locator('#pay-instructions').inner_text())
        p.fill('#sms-input', 'Confirmed. You have sent K120 to ZAMI. Txn ID 1234567890'); p.locator('#sms-submit-btn').click(); time.sleep(0.8)
        check('pasted SMS is saved through the narrow database function', p.evaluate("() => (window.__rpc || []).some((r) => r[0] === 'submit_purchase_sms' && /Txn ID/.test(r[1].p_sms))") and p.locator('#waiting-step').is_visible())
        # simulate admin approval arriving over realtime
        p.evaluate("() => { const row = (window.__ins.find((i) => i.t === 'purchases') || {}).payload; (window.__chan || []).forEach((c) => c.cb && c.cb({ new: { ...row, id: 101, status: 'fulfilled', download_url: 'https://example.com/x.wav', license_id: 'ZL-TEST0101', fulfilled_at: new Date().toISOString() } })); }")
        p.wait_for_selector('#fulfilled-step .lic-actions button', timeout=5000)
        check('license button appears after approval, with stems hint', p.locator('#fulfilled-step .lic-msg').count() == 1)
        with p.expect_download(timeout=8000) as dl:
            p.locator('#fulfilled-step .lic-actions button').click()
        path = '/tmp/license-checkout.png'; dl.value.save_as(path)
        ok, w, h, n = png_info(path)
        check('license image downloads as a valid PNG', dl.value.suggested_filename == 'ZAMI-license-ZL-TEST0101.png' and ok and w == 1080 and h > 1200 and n > 20000, f'{dl.value.suggested_filename} {ok} {w}x{h} {n}B')
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ------------------------------------------------ D. account: license + stems request
        print('D. Account page: license, stems & WAV')
        e = lic_env(pw, user='u4'); p = e.open('account.html'); p.wait_for_selector('.lic-actions', timeout=8000); time.sleep(0.4)
        btns = p.locator('.lic-actions button').all_inner_texts()
        check('license + stems buttons on a Premium purchase', btns == ['License', 'Stems & WAV', 'Report a problem'], str(btns))
        with p.expect_download(timeout=8000) as dl:
            p.locator('.lic-actions button', has_text='License').click()
        dl.value.save_as('/tmp/license-account.png'); ok, w, h, n = png_info('/tmp/license-account.png')
        check('account license image is a valid PNG', ok and n > 20000)
        p.locator('.lic-actions button', has_text='Stems').click(); p.wait_for_selector('a.lic-btn--primary', timeout=5000)
        check('producer link visible to the Premium buyer', p.locator('a.lic-btn--primary').get_attribute('href') == 'https://drive.example.com/stems-3')
        p.locator('button', has_text='Ask the producer').click(); time.sleep(0.8)
        req = p.evaluate("() => (window.__ins || []).filter((i) => i.t === 'stem_requests').map((i) => i.payload)")
        check('stems request saved for the right purchase and producer', len(req) == 1 and req[0].get('purchase_id') == '500' and req[0].get('producer_id') == 'u2' and req[0].get('buyer_name') == 'Mulenga K', str(req))
        check('button shows the waiting state', 'waiting' in p.locator('button', has_text='Requested').inner_text().lower())
        # complaint: "Report a problem" -> saved for the right purchase/producer, shown to the buyer
        p.locator('.lic-actions button', has_text='Report a problem').click()
        p.fill('.lic-actions ~ div textarea', 'The WAV folder is empty'); p.locator('button', has_text='Send to ZAMI').click(); time.sleep(0.8)
        comp = p.evaluate("() => (window.__ins || []).filter((i) => i.t === 'purchase_complaints').map((i) => i.payload)")
        check('complaint saved for the right purchase, producer and buyer', len(comp) == 1 and comp[0].get('purchase_id') == '500' and comp[0].get('producer_id') == 'u2' and comp[0].get('buyer_name') == 'Mulenga K' and comp[0].get('message') == 'The WAV folder is empty', str(comp))
        check('buyer sees confirmation', 'notified' in p.locator('.lic-msg', has_text='notified').inner_text().lower())
        check('buyer sees the producer reply and a Reopen button', 'I re-uploaded the link' in p.locator('.list-row').first.inner_text() and p.locator('button', has_text='Reopen').count() >= 1)
        p.locator('button', has_text='Reopen').first.click(); time.sleep(0.8)
        check('buyer can reopen a complaint marked fixed (via reopen_complaint)', p.evaluate("() => window.__rpc.some((c) => c[0] === 'reopen_complaint')") and p.locator('button', has_text='Reopen').count() == 0 and 'Reopened' in p.locator('.lic-msg', has_text='Reopened').first.inner_text())
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ------------------------------------------------ E. producer: requests inbox + exclusive badge
        print('E. My Uploads (producer)')
        e = lic_env(pw, user='u2'); p = e.open('my-uploads.html'); p.wait_for_selector('.lic-req', timeout=8000); time.sleep(0.8)
        check('producer sees the stems request with buyer contact', 'Chanda B' in p.locator('.lic-req', has_text='Mark delivered').inner_text() and '+260972222222' in p.locator('.lic-req', has_text='Mark delivered').inner_text())
        p.locator('.lic-req button', has_text='Mark delivered').click(); time.sleep(0.6)
        check('mark delivered updates the request', 'Delivered' in p.locator('.lic-req', has_text='Chanda B').first.inner_text() and e.page.evaluate("() => window.__calls.includes('stem_requests:update')"))
        # producer can add/fix the Drive link from My Uploads (beat_extras upsert)
        p.wait_for_selector('.card input[type=url]', timeout=6000)
        p.locator('.card input[type=url]').first.fill('https://drive.google.com/drive/folders/NEWLINK')
        p.locator('.card button', has_text='Save link').first.click(); time.sleep(0.8)
        ups = p.evaluate("() => (window.__ins || []).filter((i) => i.t === 'beat_extras:upsert').map((i) => i.payload)")
        check('producer can save the stems link from My Uploads', len(ups) == 1 and ups[0].get('link', '').endswith('NEWLINK') and ups[0].get('owner_id') == 'u2', str(ups))
        check('save confirms to the producer', p.locator('.card', has_text='Link saved').count() >= 1)
        # producer replies + marks fixed
        p.wait_for_selector('.lic-req textarea', timeout=6000)
        check('producer sees how many complaints need a reply', 'need' in p.locator('.lic-requests h3', has_text='Buyer complaints').first.inner_text())
        p.locator('.lic-req textarea').first.fill('I fixed the link and sent it on WhatsApp'); p.locator('button', has_text='Mark as fixed').first.click(); time.sleep(0.8)
        upd = p.evaluate("() => window.__calls.filter((c) => c === 'purchase_complaints:update').length")
        check('producer can mark a complaint fixed with a reply', upd == 1 and p.locator('.lic-req', has_text='Waiting for ZAMI').count() >= 1)
        check('producer sees the buyer complaint', 'stems link does not open' in ' '.join(p.locator('.lic-requests').all_inner_texts()) and 'Buyer complaints' in ' '.join(p.locator('.lic-requests').all_inner_texts()))
        check('exclusively sold beat is labelled', 'Sold exclusively' in p.locator('.card', has_text='Gone Exclusive').inner_text())
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

        # admin: Complaints tab lists it and can resolve it
        e = lic_env(pw, user='u3'); p = e.open('admin.html'); p.wait_for_selector('.tab-btn[data-tab="complaints"]', timeout=8000)
        p.locator('.tab-btn[data-tab="complaints"]').click(); p.wait_for_selector('#tab-complaints .card .resolve', timeout=6000)
        ct = p.locator('#tab-complaints').inner_text()
        check('admin sees the complaint with buyer, producer and message', 'Chanda B' in ct and 'Mwaka' in ct and 'stems link does not open' in ct and 'Night Drive Beat' in ct, ct[:200])
        p.locator('#tab-complaints .resolve').first.click(); time.sleep(0.8)
        check('admin can mark it resolved', p.evaluate("() => window.__calls.includes('purchase_complaints:update')"))
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ------------------------------------------------ F. verify page
        print('F. License verify page')
        e = lic_env(pw); p = e.open('license.html?id=zl-test0001'); p.wait_for_selector('.lic-card', timeout=8000); time.sleep(0.4)
        txt = p.locator('.lic-card').inner_text()
        check('valid license shows beat, tier, buyer', 'Valid license' in txt and 'Night Drive Beat' in txt and 'Premium lease' in txt and 'Mulenga K' in txt, txt)
        with p.expect_download(timeout=8000) as dl:
            p.locator('.lic-card button').click()
        dl.value.save_as('/tmp/license-verify.png'); check('verify page can save the image', png_info('/tmp/license-verify.png')[0])
        p = e.open('license.html?id=ZL-NOPE0000'); p.wait_for_selector('.lic-card', timeout=8000)
        check('unknown id is not valid', 'No valid license' in p.locator('.lic-card').inner_text())
        p = e.open('license.html?id=hello'); p.wait_for_selector('.lic-card', timeout=8000)
        check('malformed id is rejected without a lookup', 'not a valid license ID' in p.locator('.lic-card').inner_text() and p.evaluate("() => !(window.__rpc || []).length"))
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ------------------------------------------------ G. upload form in licensing mode
        print('G. Beat upload with tiers')
        e = lic_env(pw, user='u2', mobile=True); p = e.open('upload.html'); p.wait_for_selector('#upload-form'); time.sleep(0.6)
        p.locator('.type-toggle button[data-type="beat"]').tap(); time.sleep(0.4)
        check('tier form replaces the single price', p.locator('#tiers-field').is_visible() and not p.locator('#price-field').is_visible())
        p.screenshot(path='/tmp/upload-tiers.png', full_page=True)
        p.set_input_files('#audio-input', TONE); p.fill('#title', 'Test Beat'); p.select_option('#genre', index=1); p.fill('#bpm', '92')
        time.sleep(1.5)
        p.locator('#submit-btn').tap(); time.sleep(0.4)
        check('needs at least a priced tier', 'price' in p.locator('#status-line').inner_text().lower())
        p.fill('[data-tier-row="basic"] [data-tier-price]', '50')
        p.locator('[data-tier-row="premium"] [data-tier-on]').check(); p.fill('[data-tier-row="premium"] [data-tier-price]', '120')
        p.locator('#offer-extras').check(); p.fill('#extras-link', 'not a link'); p.locator('#submit-btn').tap(); time.sleep(0.4)
        check('bad stems link is rejected', 'https' in p.locator('#status-line').inner_text().lower())
        p.fill('#extras-link', 'https://drive.example.com/my-stems'); p.locator('#submit-btn').tap(); time.sleep(0.4)
        check('rights confirmation is required', 'confirm' in p.locator('#status-line').inner_text().lower())
        p.locator('#rights-confirm').check(); p.fill('#music-key', 'F# minor'); p.fill('#beat-tags', 'Dark, party, dark')
        p.locator('#submit-btn').tap()
        p.wait_for_function("() => (window.__ins || []).some((i) => i.t === 'beat_extras')", timeout=20000)
        ins = p.evaluate("() => (window.__ins || []).filter((i) => i.t === 'beats').map((i) => i.payload)")
        pl = ins[0] if ins else {}
        check('beat saved with tiers, lowest price, key, tags', pl.get('license_tiers') == {'basic': {'price': 50}, 'premium': {'price': 120, 'extras': True}} and pl.get('price') == 50 and pl.get('music_key') == 'F# minor' and pl.get('tags') == ['dark', 'party'] and pl.get('rights_confirmed') is True, str(pl)[:400])
        ex = p.evaluate("() => (window.__ins || []).filter((i) => i.t === 'beat_extras').map((i) => i.payload)")
        check('private stems link saved separately', len(ex) == 1 and ex[0].get('link') == 'https://drive.example.com/my-stems', str(ex))
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

    bad = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(bad)}/{len(results)} licensing checks passed")
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(run())
