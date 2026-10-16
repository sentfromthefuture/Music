"""Checks for the artist balance page -> richer "Sales by item".
Runs against tests/stub-supabase.js. Flags: stub-licensing (beat SQL run), stub-songlic (song SQL run), stub-artistsales (extra sales)."""
import sys, time, pathlib
from datetime import datetime, timedelta
sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import e2e
from e2e import Env, check
from playwright.sync_api import sync_playwright

def env(pw, user, flags=('stub-licensing', 'stub-songlic', 'stub-artistsales'), mobile=False):
    e = Env(pw, mobile=mobile, app_ua=False, user=user)
    if flags: e.ctx.add_init_script("try{" + ''.join(f"localStorage.setItem('{f}','1');" for f in flags) + "}catch(e){}")
    return e

def item(p, key): return p.locator(f'#sales-list .as-item[data-key="{key}"]')
def txt(loc): return loc.inner_text().replace('\n', ' ')
def titles(p): return p.locator('#sales-list .as-item .as-title').all_inner_texts()

def run():
    with sync_playwright() as pw:
        print('A. Legacy database (no licensing SQL): still works, counts only real sales')
        e = env(pw, 'u1', flags=()); p = e.open('balance.html'); p.wait_for_selector('#sales-list .as-item', timeout=8000); time.sleep(0.5)
        t = txt(item(p, 'track:2'))
        check('plain sales show as regular downloads (rejected/pending purchases are not counted)', '1 sold' in t and 'Regular download ×1' in t, t)
        check('tile is relabelled to Items sold', 'Items sold' in p.locator('.stats-grid').inner_text() and 'Beats sold' not in p.locator('.stats-grid').inner_text())
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

        print('B. Artist with song licenses')
        e = env(pw, 'u1'); p = e.open('balance.html'); p.wait_for_selector('#sales-list .as-item', timeout=8000); time.sleep(0.6)
        now = datetime.now()
        mstart = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month = [(h, a) for h, a in [(5, 0), (1, 500), (2, 50), (0.1, 50), (3, 50)] if now - timedelta(hours=h) >= mstart]
        mg, mc = sum(a for _, a in month), len(month)
        tiles = txt(p.locator('#sales-list .as-tiles'))
        check('summary: sales, customers paid, you receive (75%)', all(x in tiles for x in ['6 Sales', 'K950 Customers paid', 'K713 You receive (75%)']), tiles)
        check('summary: this month', f'K{mg} This month · {mc} {"sale" if mc == 1 else "sales"}' in tiles, f'{tiles} expected K{mg}/{mc}')
        check('summary: best seller', 'Free Anthem Best seller · 4 sold · K450' in tiles, tiles)
        fa = txt(item(p, 'track:1')); pg = txt(item(p, 'track:2'))
        check('item: what sold, gross, what you earn, license mix, pending', all(x in fa for x in ['Free Anthem', 'Song', 'Live', '4 sold', 'K450', 'you earn K338', 'Last sale', 'Creator ×3', 'Business & ads ×1', '1 waiting for approval (K300)']), fa)
        check('item: paid song with a regular download and a license', all(x in pg for x in ['2 sold', 'K500', 'you earn K375', 'Film, series & games ×1', 'Regular download ×1', '1 waiting for approval (K800)']), pg)
        check('sorting: most revenue first by default', titles(p)[0] == 'Paid Groove', str(titles(p)))
        p.locator('#sales-list .as-select').select_option('sold'); time.sleep(0.2)
        check('sorting: most sold', titles(p)[0] == 'Free Anthem')
        p.locator('#sales-list .as-select').select_option('latest'); time.sleep(0.2)
        check('sorting: latest sale', titles(p)[0] == 'Free Anthem')
        p.locator('#sales-list .as-select').select_option('revenue'); time.sleep(0.2)
        check('items with no sales are listed greyed and cannot be opened', item(p, 'track:99').count() == 1 and 'No sales yet' in txt(item(p, 'track:99')) and item(p, 'track:99').locator('button').is_disabled())
        check('an item title with HTML is shown as text, never run', '<img src=x' in txt(item(p, 'track:99')) and p.evaluate('() => window.__xss') is None)
        item(p, 'track:1').locator('.as-head').click(); time.sleep(0.2)
        rows = item(p, 'track:1').locator('.as-sale')
        check('open an item: every sale plus the one waiting for approval', rows.count() == 5 and item(p, 'track:1').locator('.as-head').get_attribute('aria-expanded') == 'true')
        old = txt(rows.filter(has_text='SL-TEST0003')); cur = txt(rows.filter(has_text='SL-TEST0002'))
        check('sale: license, ID, name on the license, amount, your cut, expired', all(x in old for x in ['Business & ads license (1 year, Africa)', 'Old Buyer', 'K300', 'you receive K225', 'Expired']), old)
        check('sale: still-valid license shows when it is valid until', all(x in cur for x in ['Creator license (1 year, Zambia)', 'Mulenga K', 'you receive K38', 'valid until']) and 'Expired' not in cur, cur)
        check('the pending purchase is clearly marked and shows no earnings yet', 'Waiting for approval' in txt(rows.filter(has_text='SL-TEST0004')) and 'you receive' not in txt(rows.filter(has_text='SL-TEST0004')))
        p.locator('#sales-list .as-select').select_option('sold'); time.sleep(0.2)
        check('an opened item stays open when you sort', item(p, 'track:1').locator('.as-sale').count() == 5)
        item(p, 'track:2').locator('.as-head').click(); time.sleep(0.2)
        r2 = txt(item(p, 'track:2').locator('.as-sales'))
        check('regular download and lifetime license rows', 'Regular download' in r2 and 'Film, series & games license (Lifetime, Worldwide)' in r2 and 'no expiry date' in r2 and 'you receive K375' in r2, r2)
        p.locator('#sales-list .as-chip', has_text='Beats').click(); time.sleep(0.2)
        check('filter: beats (this artist has none)', 'Nothing here.' in p.locator('#sales-list').inner_text())
        p.locator('#sales-list .as-chip', has_text='Licenses').click(); time.sleep(0.2)
        check('filter: licenses shows only items with license sales', sorted(titles(p)) == ['Free Anthem', 'Paid Groove'], str(titles(p)))
        p.locator('#sales-list .as-chip', has_text='Songs').click(); time.sleep(0.2)
        check('filter: songs', len(titles(p)) >= 3)
        page = p.locator('#sales-list').inner_text()
        src = (pathlib.Path(__file__).parent.parent / 'app/ui/artist-sales.js').read_text()
        check('buyers\' phone numbers and payment SMS are never requested or shown', '+260971111111' not in page and '+26097' not in page and 'Confirmed K' not in page and 'buyer_contact' not in src and 'transaction_sms' not in src)
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

        print('C. Beat producer')
        e = env(pw, 'u2'); p = e.open('balance.html'); p.wait_for_selector('#sales-list .as-item', timeout=8000); time.sleep(0.6)
        bt = txt(item(p, 'beat:3'))
        check('beat: sold, gross, your cut, tier', all(x in bt for x in ['Night Drive Beat', 'Beat', '1 sold', 'K120', 'you earn K90', 'Premium lease ×1']), bt)
        item(p, 'beat:3').locator('.as-head').click(); time.sleep(0.2)
        bs = txt(item(p, 'beat:3').locator('.as-sale'))
        check('beat sale: tier, license ID, name on the license', all(x in bs for x in ['Premium lease', 'ZL-TEST0001', 'Licensed to Mulenga K', 'you receive K90']), bs)
        p.locator('#sales-list .as-chip', has_text='Songs').click(); time.sleep(0.2)
        check('filter: songs hides the beat from the list (the summary stays whole)', 'Night Drive Beat' not in titles(p) and 'Best seller' in p.locator('#sales-list .as-tiles').inner_text())
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

        print('D. Phone layout')
        e = env(pw, 'u1', mobile=True); p = e.open('balance.html'); p.wait_for_selector('#sales-list .as-item', timeout=8000); time.sleep(0.5)
        item(p, 'track:1').locator('.as-head').click(); time.sleep(0.3)
        check('no horizontal overflow on a 390px phone', p.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1"))
        p.locator('#sales-list').scroll_into_view_if_needed(); p.screenshot(path='/tmp/artist-sales-mobile.png', full_page=False)
        check('no JS errors', not e.errors, '; '.join(e.errors[:3])); e.close()

    bad = [r for r in e2e.results if not r[1]]
    print(f"\n{len(e2e.results) - len(bad)}/{len(e2e.results)} artist sales checks passed")
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(run())
