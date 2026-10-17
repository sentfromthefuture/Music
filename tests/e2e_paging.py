"""Checks for 12-at-a-time lists: admin lists are paged and searched in the database, small queues reveal on scroll.
Runs against tests/stub-supabase.js (front-end behaviour only)."""
import sys, time, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import e2e
from e2e import Env, check, results
from playwright.sync_api import sync_playwright

def admin(pw):
    e = Env(pw, mobile=True, app_ua=False, user='u3')
    p = e.open('admin.html'); p.wait_for_selector('.tab-btn[data-tab="users"]', timeout=8000); time.sleep(0.8)
    return e, p

def tab(p, name, wait=0.9):
    p.locator(f'.tab-btn[data-tab="{name}"]').click(); time.sleep(wait)

def cards(p, name): return p.locator(f'#tab-{name} .card').count()
def scroll_end(p, n=2):
    for _ in range(n):
        p.evaluate("window.scrollTo(0, document.body.scrollHeight)"); time.sleep(1.1)

def main():
    with sync_playwright() as pw:
        # ---- Users: 12 first, more on scroll, searched in the database
        e, p = admin(pw)
        p.evaluate("""() => { const T = window.__tables; for (let i = 0; i < 40; i++) T.profiles.push({ id: 'x' + i, display_name: 'Listener ' + i, role: 'listener', is_admin: false, momo_number: i === 33 ? '0961234567' : '', created_at: new Date(2026, 0, 1, 0, i).toISOString() }); }""")
        tab(p, 'users')
        first = cards(p, 'users')
        check('users: only the first 12 load', first == 12, str(first))
        scroll_end(p)
        check('users: scrolling loads more', cards(p, 'users') > 12, str(cards(p, 'users')))
        p.fill('#search-input', 'Listener 25'); time.sleep(1.2)
        check('users: search runs in the database and finds the match', cards(p, 'users') == 1 and 'Listener 25' in p.locator('#tab-users').inner_text(), p.locator('#tab-users').inner_text()[:120])
        p.fill('#search-input', '0961234567'); time.sleep(1.2)
        check('users: search by phone number', cards(p, 'users') == 1 and 'Listener 33' in p.locator('#tab-users').inner_text())
        p.fill('#search-input', 'zzznomatch'); time.sleep(1.2)
        check('users: no match shows a message', 'match' in p.locator('#tab-users').inner_text().lower() and cards(p, 'users') == 1)
        p.fill('#search-input', ''); time.sleep(1.2)
        check('users: clearing search returns to the first page', cards(p, 'users') == 12, str(cards(p, 'users')))
        check('no JS errors (users)', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ---- Withdrawal history
        e, p = admin(pw)
        p.evaluate("""() => { const T = window.__tables; for (let i = 0; i < 30; i++) T.withdrawals.push({ id: 100 + i, artist_id: 'u2', amount: 100 + i, momo_number: '09770000' + String(i).padStart(2, '0'), status: 'paid', paid_at: new Date(2026, 5, 1, 0, i).toISOString() }); }""")
        tab(p, 'withdrawal-history', 1.2)
        check('withdrawal history: 12 first', cards(p, 'withdrawal-history') == 12, str(cards(p, 'withdrawal-history')))
        scroll_end(p)
        check('withdrawal history: more load on scroll', cards(p, 'withdrawal-history') > 12)
        p.fill('#search-input', '0977000017'); time.sleep(1.3)
        check('withdrawal history: search by number in the database', cards(p, 'withdrawal-history') == 1 and 'K117' in p.locator('#tab-withdrawal-history').inner_text())
        p.fill('#search-input', 'Mwaka'); time.sleep(1.3)
        check('withdrawal history: search by artist name', cards(p, 'withdrawal-history') >= 12)
        check('no JS errors (withdrawal history)', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ---- Live content (tracks + beats merged) and taken down
        e, p = admin(pw)
        tab(p, 'live', 1.2)
        n0 = cards(p, 'live')
        total = p.evaluate("() => window.__tables.tracks.filter((t) => t.status === 'approved').length + window.__tables.beats.filter((b) => b.status === 'approved').length")
        check('live: not everything is drawn at first', 0 < n0 < total, f'{n0} of {total}')
        scroll_end(p, 3)
        n1 = cards(p, 'live')
        check('live: scrolling loads more', n1 > n0, f'{n0} -> {n1}')
        p.fill('#search-input', 'Filler Track 25'); time.sleep(1.3)
        check('live: search in the database finds an item that was not loaded yet', cards(p, 'live') == 1 and 'Filler Track 25' in p.locator('#tab-live').inner_text(), p.locator('#tab-live').inner_text()[:100])
        p.fill('#search-input', ''); time.sleep(1.3)
        p.evaluate("""() => { const T = window.__tables; for (let i = 0; i < 20; i++) T.tracks.push({ id: 900 + i, owner_id: 'u1', title: 'Removed ' + i, genre: 'Gospel', is_free: true, price: 0, status: 'removed', removed_at: new Date(2026, 4, 1, 0, i).toISOString(), created_at: new Date(2026, 4, 1).toISOString() }); }""")
        tab(p, 'taken-down', 1.2)
        rem_total = p.evaluate("() => window.__tables.tracks.filter((t) => t.status === 'removed').length + window.__tables.beats.filter((b) => b.status === 'removed').length")
        check('taken down: not everything is drawn at first', 0 < cards(p, 'taken-down') < rem_total, f"{cards(p, 'taken-down')} of {rem_total}")
        scroll_end(p, 3)
        check('taken down: more on scroll', cards(p, 'taken-down') > 12 and cards(p, 'taken-down') >= 18, str(cards(p, 'taken-down')))
        check('no JS errors (live/taken down)', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ---- Pending queue: reveals 12 at a time, search still sees every card
        e, p = admin(pw)
        p.evaluate("""() => { const T = window.__tables; for (let i = 0; i < 30; i++) T.tracks.push({ id: 800 + i, owner_id: 'u1', title: 'Pending ' + i, genre: 'Gospel', is_free: true, price: 0, status: 'pending_review', file_path: 'u1/p.wav', created_at: new Date(2026, 4, 2, 0, i).toISOString() }); }""")
        tab(p, 'review', 1.2)
        shown = p.locator('#tab-review .card:not(.hidden)').count()
        check('pending review: only 12 drawn at first', shown == 12, str(shown))
        scroll_end(p, 3)
        check('pending review: more appear on scroll', p.locator('#tab-review .card').count() > 12)
        p.fill('#search-input', 'Pending 29'); time.sleep(0.8)
        check('pending review: search finds a card that was not drawn yet', p.locator('#tab-review .card:not(.hidden)').count() == 1)
        check('no JS errors (pending review)', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ---- Library (Account): purchases list reveals 12 at a time
        e = Env(pw, mobile=True, app_ua=False, user='u4'); p = e.open('account.html'); p.wait_for_selector('#purchases-list', timeout=8000); time.sleep(1)
        p.evaluate("""() => { const T = window.__tables; for (let i = 0; i < 30; i++) T.purchases.push({ id: 7000 + i, buyer_id: 'u4', item_id: 10 + i, item_type: 'track', status: 'fulfilled', amount: 5, fulfilled_at: new Date(2026, 6, 1, 0, i).toISOString(), download_url: 'https://example.com/x' + i }); }""")
        p.locator('a.zs-nav-link[data-nav="browse.html"]:visible').first.click(); time.sleep(0.8)
        p.locator('a.zs-nav-link[data-nav="account.html"]:visible').first.click(); p.wait_for_selector('#purchases-list .list-row', timeout=8000); time.sleep(1)
        rows = p.locator('#purchases-list .list-row').count()
        check('library: purchases show 12 first', rows == 12, str(rows))
        p.locator('#purchases-list').scroll_into_view_if_needed(); scroll_end(p)
        check('library: scrolling reveals more purchases', p.locator('#purchases-list .list-row').count() > 12)
        check('no JS errors (library)', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ---- My Uploads (artist): 12 cards first
        e = Env(pw, mobile=True, app_ua=False, user='u2'); p = e.open('account.html'); p.wait_for_selector('#artist-links:not(.hidden)', timeout=8000)
        p.evaluate("""() => { const T = window.__tables; for (let i = 0; i < 30; i++) T.tracks.push({ id: 600 + i, owner_id: 'u2', title: 'Mine ' + i, genre: 'Gospel', is_free: true, price: 0, status: 'approved', file_path: 'u2/m.wav', created_at: new Date(2026, 6, 2, 0, i).toISOString() }); }""")
        p.locator('a[href="my-uploads.html"]').first.click(); p.wait_for_selector('#uploads-list .card, .card[data-item-id]', timeout=8000); time.sleep(1)
        n = p.locator('.card[data-item-id]').count()
        check('my uploads: 12 cards first', n == 12, str(n))
        scroll_end(p)
        check('my uploads: more cards on scroll', p.locator('.card[data-item-id]').count() > 12)
        check('no JS errors (my uploads)', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ---- Artist page grid
        e = Env(pw, mobile=True, app_ua=False, user='u4'); p = e.open('browse.html'); p.wait_for_selector('.zs-card', timeout=8000); time.sleep(0.8)
        p.evaluate("""() => { const T = window.__tables; for (let i = 0; i < 30; i++) T.tracks.push({ id: 500 + i, owner_id: 'u2', title: 'Gospel hit ' + i, genre: 'Gospel', is_free: true, price: 0, status: 'approved', file_path: 'u2/g.wav', preview_path: 'u2/g.wav', created_at: new Date(2026, 6, 3, 0, i).toISOString() }); }""")
        p.evaluate("() => document.querySelector('.artist-chip')")
        p.locator('a[href*="artist.html?id=u2"], .artist-chip:has-text("Mwaka")').first.click(); p.wait_for_selector('#grid .zs-card, .zs-card', timeout=8000); time.sleep(1)
        cards_n = p.locator('.zs-card').count()
        check('artist page: only 12 tracks drawn first', cards_n == 12, str(cards_n))
        scroll_end(p)
        check('artist page: more on scroll', p.locator('.zs-card').count() > 12)
        check('no JS errors (artist)', not e.errors, '; '.join(e.errors[:3])); e.close()

    bad = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(bad)}/{len(results)} paging checks passed")
    for r in bad: print('FAILED:', r[0], r[2] if len(r) > 2 else '')
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
