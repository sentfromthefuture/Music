"""Checks for Admin -> Purchased Items (all approved sales + rejected purchases + rejected uploads).
Runs against tests/stub-supabase.js. Flags: stub-licensing (beat SQL run), stub-songlic (song SQL run),
stub-rejections (supabase/upload-rejections.sql run). Verifies front-end behaviour only (SQL: tests/sql/rejections-scenarios.sql)."""
import sys, time, pathlib
sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import e2e
from e2e import Env, check
from playwright.sync_api import sync_playwright

def env(pw, user='u3', rejections=False, mobile=False):
    e = Env(pw, mobile=mobile, app_ua=False, user=user)
    flags = ['stub-licensing', 'stub-songlic'] + (['stub-rejections'] if rejections else [])
    e.ctx.add_init_script("try{" + ''.join(f"localStorage.setItem('{f}','1');" for f in flags) + "}catch(e){}")
    return e

def open_sales(p):
    p.wait_for_selector('.tab-btn[data-tab="sales"]', timeout=8000)
    p.locator('.tab-btn[data-tab="sales"]').click(); p.wait_for_selector('#tab-sales .sl-chip', timeout=8000); time.sleep(0.6)

def rows(p): return p.locator('#tab-sales .sl-row')
def seg(p, text): p.locator('#tab-sales .sl-chip', has_text=text).first.click(); time.sleep(0.3)

def run():
    with sync_playwright() as pw:
        print('A. Purchased Items (rejections SQL not run yet)')
        e = env(pw); p = e.open('admin.html'); open_sales(p)
        chips = ' | '.join(p.locator('#tab-sales .sl-chips .sl-chip').all_inner_texts())
        check('three sections with counts', 'Approved sales (5)' in chips and 'Rejected purchases (1)' in chips and 'Rejected uploads (0)' in chips, chips)
        summ = p.locator('#tab-sales .sl-summary').inner_text()
        check('summary: sale count, total, artists\' share and ZAMI\'s share', '5 approved sales' in summ and 'K970' in summ and 'Artists K728' in summ and 'ZAMI K242' in summ, summ)
        check('every approved sale is listed', rows(p).count() == 5)
        song = rows(p).filter(has_text='SL-TEST0001'); st = song.inner_text().replace('\n', ' ')
        check('song license row: what, price, license, ID', all(x in st for x in ['Paid Groove', 'Song', 'Approved', 'K500', 'Film, series & games license (Lifetime, Worldwide)', 'SL-TEST0001']), st)
        check('row says who bought it (account + name on the license) with call + WhatsApp links', 'Listener' in st and 'name on license: Mulenga K' in st and song.locator('a[href="tel:+260971111111"]').count() == 1 and song.locator('a[href="https://wa.me/260971111111"]').count() == 1, st)
        check('row says from which artist and the split', 'From Chanda Beats' in st and 'artist K375' in st and 'ZAMI K125' in st, st)
        check('row says when it was approved (and no empty "Ordered —" when no order date is recorded)', 'Approved ' in st and '2026' in st and 'Ordered' not in st, st)
        beat = rows(p).filter(has_text='ZL-TEST0001'); bt = beat.inner_text().replace('\n', ' ')
        check('beat sale shows tier, license ID and its producer', all(x in bt for x in ['Night Drive Beat', 'Beat', 'Premium lease', 'K120', 'From Mwaka', 'artist K90', 'ZAMI K30']), bt)
        guest = rows(p).filter(has_text='Guest (no account)')
        check('a guest purchase (no account, no amount recorded) still lists without breaking', guest.count() == 1 and '—' in guest.inner_text())
        song.locator('summary').click(); time.sleep(0.2)
        check('more details: purchase number and item info', 'Purchase #600' in song.inner_text())
        # filters
        seg(p, 'Songs'); check('filter: songs', rows(p).count() == 4)
        seg(p, 'Beats'); check('filter: beats', rows(p).count() == 1)
        seg(p, 'Licenses'); check('filter: licenses (song + beat)', rows(p).count() == 4)
        seg(p, 'All')
        p.locator('#tab-sales .sl-select').select_option('7d'); time.sleep(0.3)
        check('filter: last 7 days hides the 800-day-old sale', rows(p).count() == 4 and rows(p).filter(has_text='SL-TEST0003').count() == 0)
        p.locator('#tab-sales .sl-select').select_option('all'); time.sleep(0.3)
        # the page's existing search box drives this list
        p.fill('#search-input', 'SL-TEST0002'); time.sleep(0.4)
        check('search by license ID', rows(p).count() == 1 and 'Free Anthem' in rows(p).first.inner_text())
        p.fill('#search-input', '971111111'); time.sleep(0.4)
        check('search by phone number', rows(p).count() == 3)
        p.fill('#search-input', 'mwaka'); time.sleep(0.4)
        check('search by artist', rows(p).count() == 1 and 'Night Drive Beat' in rows(p).first.inner_text())
        p.fill('#search-input', ''); time.sleep(0.4)
        check('clearing the search shows everything again', rows(p).count() == 5)
        seg(p, 'Rejected purchases')
        rt = rows(p).first.inner_text().replace('\n', ' ')
        check('rejected purchases are listed with a Rejected label', rows(p).count() == 1 and all(x in rt for x in ['Paid Groove', 'Rejected', 'K20', 'ORD-REJ1', '+260974444444', 'Ordered ']) and '1 rejected purchase' in p.locator('#tab-sales .sl-summary').inner_text(), rt)
        seg(p, 'Rejected uploads')
        check('rejected uploads: explains the SQL step when it has not been run', 'not being recorded yet' in p.locator('#tab-sales').inner_text() and 'upload-rejections.sql' in p.locator('#tab-sales').inner_text())
        # rejecting still works without the SQL
        p.evaluate("() => window.__tables.tracks.push({ id: 77, owner_id: 'u2', title: 'Needs Work', genre: 'Gospel', is_free: true, price: 0, status: 'pending_review', reference_number: 'TRK-WORK', transaction_sms: 'Confirmed K25', created_at: new Date().toISOString() })")
        p.locator('.tab-btn[data-tab="review"]').click(); p.wait_for_selector('#tab-review .card .reject', timeout=6000)
        p.locator('#tab-review .card', has_text='Needs Work').locator('.reject').click(); time.sleep(0.8)
        check('rejecting an upload still works before the SQL is run', p.evaluate("() => window.__tables.tracks.find((t) => t.id === 77).status") == 'pending_payment')
        # paging
        p.evaluate("() => { for (let i = 0; i < 60; i++) window.__tables.purchases.push({ id: 1000 + i, buyer_id: 'u4', item_id: 1, item_type: 'track', status: 'fulfilled', amount: 10, buyer_contact: '+260970000000', fulfilled_at: new Date(Date.now() - i * 60000).toISOString(), created_at: new Date(Date.now() - i * 60000).toISOString() }); }")
        open_sales(p); seg(p, 'Approved sales')   # the tab remembers the last section, so go back to sales
        check('long lists show 50 at a time', rows(p).count() == 50 and 'Show more (15 left)' in p.locator('#tab-sales .sl-more').inner_text())
        p.locator('#tab-sales .sl-more').click(); time.sleep(0.3)
        check('Show more reveals the rest', rows(p).count() == 65 and p.locator('#tab-sales .sl-more').count() == 0)
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

        print('B. Rejected uploads (rejections SQL run)')
        e = env(pw, rejections=True); p = e.open('admin.html'); open_sales(p)
        check('rejected uploads count shown', 'Rejected uploads (1)' in ' | '.join(p.locator('#tab-sales .sl-chips .sl-chip').all_inner_texts()))
        seg(p, 'Rejected uploads'); ut = rows(p).first.inner_text().replace('\n', ' ')
        check('rejected upload shows what, who uploaded it, when, reference and where it is now', all(x in ut for x in ['No Preview Yet', 'Rejected upload', 'Song', 'Mwaka', 'Other', 'TRK-ZZZZ', 'Rejected ', 'Now Live']), ut)
        rows(p).first.locator('summary').click(); time.sleep(0.2)
        check('...and the payment SMS they sent', 'Confirmed K25 sent' in rows(p).first.inner_text())
        p.evaluate("() => window.__tables.tracks.push({ id: 77, owner_id: 'u2', title: 'Needs Work', genre: 'Gospel', is_free: true, price: 0, status: 'pending_review', reference_number: 'TRK-WORK', transaction_sms: 'Confirmed K25', created_at: new Date().toISOString() })")
        p.locator('.tab-btn[data-tab="review"]').click(); p.wait_for_selector('#tab-review .card .reject', timeout=6000)
        p.locator('#tab-review .card', has_text='Needs Work').locator('.reject').click(); time.sleep(0.8)
        log = p.evaluate("() => (window.__ins || []).filter((i) => i.t === 'upload_rejections').map((i) => i.payload)")
        check('rejecting logs what was rejected', len(log) == 1 and log[0].get('title') == 'Needs Work' and log[0].get('item_id') == '77' and log[0].get('item_type') == 'track' and log[0].get('owner_id') == 'u2' and log[0].get('reference_number') == 'TRK-WORK' and log[0].get('transaction_sms') == 'Confirmed K25', str(log))
        check('...and the upload goes back to the artist as before', p.evaluate("() => window.__tables.tracks.find((t) => t.id === 77).status") == 'pending_payment')
        open_sales(p); seg(p, 'Rejected uploads')
        check('the new rejection shows up, with where it is now', rows(p).count() == 2 and rows(p).filter(has_text='Needs Work').count() == 1 and 'Awaiting payment' in rows(p).filter(has_text='Needs Work').inner_text())
        seg(p, 'Beats'); check('type filter works on rejected uploads', rows(p).count() == 0)
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

        print('C. Phone layout')
        e = env(pw, rejections=True, mobile=True); p = e.open('admin.html'); open_sales(p)
        check('no horizontal overflow on a 390px phone', p.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1"))
        p.screenshot(path='/tmp/admin-sales-mobile.png', full_page=False)
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

    bad = [r for r in e2e.results if not r[1]]
    print(f"\n{len(e2e.results) - len(bad)}/{len(e2e.results)} admin sales checks passed")
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(run())
