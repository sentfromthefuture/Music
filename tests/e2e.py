"""End-to-end checks for the modernised ZAMI shell, run in headless Chromium.
Supabase is replaced by tests/stub-supabase.js and audio by generated WAV tones, so this verifies the
front-end behaviour (routing, persistent player, caching, rendering) — NOT the live database/RLS."""
import re, sys, time, json, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).parent
BASE = 'http://localhost:8765/Music/'
STUB = (ROOT / 'stub-supabase.js').read_text()
TONE = {'a': (ROOT / 'tone-a.wav').read_bytes(), 'b': (ROOT / 'tone-b.wav').read_bytes()}
COVER = (ROOT / 'cover.png').read_bytes()
HOST = 'https://tradvpjpxshngjemnoaq.supabase.co/storage/v1/object/public/'

INIT = """
window.__loads = 0; window.__plays = 0; window.__audios = 0;
const _load = HTMLMediaElement.prototype.load; HTMLMediaElement.prototype.load = function(){ window.__loads++; return _load.apply(this, arguments); };
const _play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function(){ window.__plays++; return _play.apply(this, arguments); };
const _A = window.Audio; window.Audio = function(){ window.__audios++; return new _A(...arguments); };
"""

results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('  PASS ' if cond else '  FAIL ') + name + (f'  [{detail}]' if (detail and not cond) else ''))

def serve_media(route):
    url = route.request.url
    path = url.split('/public-previews/')[-1].split('?')[0]
    if path.endswith('missing.wav'): return route.fulfill(status=404, body='nope')
    if path.endswith('.png'): return route.fulfill(status=200, content_type='image/png', body=COVER)
    body = TONE['b'] if path.endswith('b.wav') else TONE['a']
    rng = route.request.headers.get('range')
    hdr = {'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Content-Type': 'audio/wav'}
    if rng:
        m = re.match(r'bytes=(\d+)-(\d*)', rng); a = int(m.group(1)); b = int(m.group(2)) if m.group(2) else len(body) - 1
        hdr.update({'Content-Range': f'bytes {a}-{b}/{len(body)}', 'Content-Length': str(b - a + 1)})
        return route.fulfill(status=206, headers=hdr, body=body[a:b + 1])
    hdr['Content-Length'] = str(len(body)); return route.fulfill(status=200, headers=hdr, body=body)

class Env:
    def __init__(self, pw, mobile=False, app_ua=True, user=None):
        self.browser = pw.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        kw = dict(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True) if mobile else dict(viewport={'width': 1280, 'height': 800})
        if app_ua: kw['user_agent'] = 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36 ZamiApp/1.0'
        self.ctx = self.browser.new_context(**kw)
        self.ctx.add_init_script(INIT)
        if user: self.ctx.add_init_script(f"try{{localStorage.setItem('stub-user','{user}')}}catch(e){{}}")
        # Playwright gives priority to the most recently registered route, so the catch-all goes first.
        self.ctx.route(re.compile(r'^https://.*'), lambda r: r.abort())
        self.ctx.route('**/@supabase/supabase-js@2/+esm', lambda r: r.fulfill(content_type='application/javascript', headers={'Access-Control-Allow-Origin': '*'}, body=STUB))
        self.ctx.route(HOST + '**', serve_media)
        self.page = self.ctx.new_page()
        self.errors = []
        self.page.on('pageerror', lambda e: self.errors.append(f'pageerror: {e}'))
        self.page.on('console', lambda m: self.errors.append(f'console.error: {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text and 'missing.wav' not in m.text and 'MEDIA_ELEMENT_ERROR' not in m.text else None)
    def open(self, path):
        self.page.goto(BASE + path); return self.page
    def close(self): self.browser.close()

def audio(p): return p.evaluate("""() => { const a = document.getElementById('zs-audio'); return a ? { paused: a.paused, t: a.currentTime, d: a.duration, src: a.currentSrc, n: document.querySelectorAll('audio').length, vol: a.volume } : null }""")
def calls(p, prefix): return p.evaluate("(pre) => window.__calls.filter(c => c.startsWith(pre)).length", prefix)
def wait_playing(p, timeout=8000):
    p.wait_for_function("() => { const a = document.getElementById('zs-audio'); return a && !a.paused && a.currentTime > 0.4 }", timeout=timeout)

def run():
    with sync_playwright() as pw:
        # ---------------------------------------------------------------- 1. boot + direct links
        print('1. Boot, legacy URLs, direct links')
        e = Env(pw); p = e.open('browse.html')
        p.wait_for_selector('.zs-card')
        check('browse renders shell + cards', p.locator('.zs-header').count() == 1 and p.locator('.zs-card').count() >= 8)
        check('primary nav marks Browse active', 'Browse' in (p.locator('.zs-topnav .is-active').inner_text() or ''))
        check('featured artists + trending + top downloads render', p.locator('.artist-chip').count() >= 1 and p.locator('#trending-list .trend-row').count() >= 1 and p.locator('#top-downloads-list .rank-card').count() >= 1)
        check('medal badge for rank 1', p.locator('#top-downloads-list .rank-card.medal-1 .rank-medal-badge').count() == 1)
        check('only ONE <audio> element in the document', audio(p)['n'] == 1)
        for path in ['detail.html?type=track&id=1', 'detail.html?type=beat&id=3', 'artist.html?id=u1', 'login.html', 'download.html']:
            q = e.open(path); q.wait_for_selector('#zs-view .zs-view-root > *', timeout=8000); time.sleep(0.4)
        d = e.open('detail.html?type=track&id=1'); d.wait_for_selector('.title')
        check('legacy detail URL works on direct load', 'Free Anthem' in d.locator('.title').inner_text())
        check('invalid detail shows message', (e.open('detail.html?type=track&id=424242'), e.page.wait_for_selector('#loading:not(.hidden)'), 'not available' in e.page.locator('#loading').inner_text())[2])
        check('no JS errors during boot/direct loads', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ---------------------------------------------------------------- 2. SPA nav + persistent playback
        print('2. SPA navigation keeps music playing')
        e = Env(pw); p = e.open('browse.html'); p.wait_for_selector('.zs-card')
        p.evaluate("window.__marker = 'same-document'")
        p.locator('#grid .zs-card').first.locator('.zs-playbtn').click(force=True)
        wait_playing(p)
        a0 = audio(p)
        check('clicking a card play button starts audio', not a0['paused'] and a0['t'] > 0.3, str(a0))
        check('mini player appears with title', p.locator('#zs-player').is_visible() and 'Free Anthem' in p.locator('.zs-p-title').inner_text())
        loads_after_start = p.evaluate('window.__loads')
        seq = []
        def step(label, action):
            before = audio(p); action(); time.sleep(0.9); after = audio(p)
            same_doc = p.evaluate("window.__marker") == 'same-document'
            ok = same_doc and not after['paused'] and after['t'] >= before['t'] and after['n'] == 1 and after['src'] == a0['src']
            check(f'{label}: same document, still playing, time advanced, same src', ok, f'before={before["t"]:.2f} after={after["t"]:.2f} doc={same_doc}')
        step('browse -> detail', lambda: p.locator('#grid .zs-card-link').nth(1).click())
        p.wait_for_selector('.detail-grid')
        check('URL changed without reload', 'detail.html?type=' in p.url)
        step('detail -> artist', lambda: p.locator('.artist-link').click())
        p.wait_for_selector('.profile-card .profile-name')
        step('artist -> browse (nav)', lambda: p.locator('.zs-topnav a[href="browse.html"]').click())
        p.wait_for_selector('.zs-card')
        step('browse -> library (adapter view)', lambda: p.locator('.zs-topnav a[href="account.html"]').click())
        step('library -> upload (adapter view)', lambda: p.locator('.zs-topnav a[href="upload.html"]').click())
        check('audio.load() was called exactly once for the whole session', p.evaluate('window.__loads') == loads_after_start == 1, str(p.evaluate('window.__loads')))
        check('no extra Audio() instances were created', p.evaluate('window.__audios') == 0)
        check('mini player persisted across every route', p.locator('#zs-player').is_visible())
        p.go_back(); time.sleep(0.6)
        check('back button works and audio keeps playing', 'account.html' in p.url and not audio(p)['paused'])
        p.go_forward(); time.sleep(0.6)
        check('forward button works', 'upload.html' in p.url)
        check('no JS errors during SPA navigation', not e.errors, '; '.join(e.errors[:4])); e.close()

        # ---------------------------------------------------------------- 3. player behaviours
        print('3. Player controls, errors, queue')
        e = Env(pw); p = e.open('browse.html'); p.wait_for_selector('.zs-card')
        btn = p.locator('#grid .zs-card').first.locator('.zs-playbtn')
        for _ in range(6): btn.click(force=True); time.sleep(0.05)
        time.sleep(1.0)
        a = audio(p); label = p.locator('#zs-player .zs-p-controls .zs-ibtn--primary').get_attribute('aria-label')
        check('rapid repeated clicks: UI state matches audio state', (label == 'Pause') == (not a['paused']), f'label={label} paused={a["paused"]}')
        check('rapid repeated clicks: audio loaded once, no duplicate players', p.evaluate('window.__loads') == 1 and a['n'] == 1, str(p.evaluate('window.__loads')))
        if a['paused']: p.locator('#zs-player .zs-p-controls .zs-ibtn--primary').click(); wait_playing(p)
        # seek / sheet
        p.locator('.zs-p-meta').click(); p.wait_for_selector('.zs-sheet:not([hidden])')
        check('now-playing sheet opens with title + queue', 'Free Anthem' in p.locator('.zs-sheet-title').inner_text() and p.locator('.zs-queue li').count() >= 5)
        p.evaluate("() => { const r = document.querySelector('.zs-range--seek'); r.value = 500; r.dispatchEvent(new Event('input', {bubbles:true})); r.dispatchEvent(new Event('change', {bubbles:true})); }")
        time.sleep(0.5); a = audio(p)
        check('seek slider jumps to ~50%', a['d'] and abs(a['t'] - a['d'] / 2) < 2.5, f't={a["t"]:.1f} d={a["d"]}')
        p.locator('.zs-sheet .zs-sheet-controls button[aria-label="Next track"]').click(); time.sleep(0.8)
        check('next track advances the queue', 'Paid Groove' in p.locator('.zs-sheet-title').inner_text())
        p.locator('.zs-sheet .zs-sheet-controls button[aria-label="Previous track"]').click(); time.sleep(0.8)
        check('previous returns (restarts or goes back)', p.locator('.zs-sheet-title').inner_text() in ('Free Anthem', 'Paid Groove'))
        sh = p.locator('.zs-sheet button[aria-label="Shuffle"]'); sh.click()
        check('shuffle toggles aria-pressed', sh.get_attribute('aria-pressed') == 'true'); sh.click()
        rp = p.locator('.zs-sheet .zs-sheet-controls button[aria-label^="Repeat"]'); labs = []
        for _ in range(3): rp.click(); labs.append(rp.get_attribute('aria-label'))
        check('repeat cycles all -> one -> off', labs == ['Repeat all', 'Repeat one', 'Repeat off'], str(labs))
        p.evaluate("() => { const r = document.querySelector('.zs-range--vol'); r.value = 30; r.dispatchEvent(new Event('input', {bubbles:true})); }")
        check('volume slider sets audio volume', abs(audio(p)['vol'] - 0.3) < 0.02, str(audio(p)['vol']))
        ms = p.evaluate("() => navigator.mediaSession && navigator.mediaSession.metadata ? navigator.mediaSession.metadata.title : null")
        check('Media Session metadata is set', ms and ms in ('Free Anthem', 'Paid Groove'), str(ms))
        p.keyboard.press('Escape'); time.sleep(0.2)
        check('Escape closes the sheet', p.locator('.zs-sheet').is_hidden())
        # error handling: broken file auto-skips; item with no preview shows error then skips
        p.reload(); p.wait_for_selector('.zs-card')
        cards = p.locator('#grid .zs-card')
        broken = [i for i in range(cards.count()) if cards.nth(i).locator('.zs-card-title').inner_text() == 'Broken File'][0]
        cards.nth(broken).locator('.zs-playbtn').click(force=True)
        p.wait_for_function("() => document.querySelector('.zs-p-sub.zs-err')", timeout=6000)
        check('failed audio URL shows an error state', 'could not be played' in p.locator('.zs-p-sub').inner_text())
        p.wait_for_function("() => document.querySelector('.zs-p-title') && document.querySelector('.zs-p-title').textContent === 'Gospel Joy'", timeout=6000)
        wait_playing(p)
        check('player auto-skips the broken track and plays the next', 'Gospel Joy' in p.locator('.zs-p-title').inner_text())
        nop = [i for i in range(cards.count()) if cards.nth(i).locator('.zs-card-title').inner_text() == 'No Preview Yet'][0]
        cards.nth(nop).locator('.zs-playbtn').click(force=True)
        p.wait_for_function("() => /No preview/.test((document.querySelector('.zs-p-sub')||{}).textContent||'')", timeout=6000)
        check('item without a preview reports "No preview available"', 'No preview' in p.locator('.zs-p-sub').inner_text() or p.locator('.zs-p-title').inner_text() != 'No Preview Yet')
        rpc = p.evaluate('window.__rpc.filter(r => r[0] === "increment_play_count").length')
        check('play counts are recorded via the existing RPC', rpc >= 1, str(rpc))
        # keyboard: space toggles
        p.mouse.click(5, 5); p.keyboard.press('Space'); time.sleep(0.3)
        check('no JS errors in player flows', not e.errors, '; '.join(e.errors[:4])); e.close()

        # ---------------------------------------------------------------- 4. caching, back/forward, realtime cleanup
        print('4. Caching, scroll restore, subscriptions')
        e = Env(pw); p = e.open('browse.html'); p.wait_for_selector('.zs-card'); time.sleep(0.8)
        first_visit = calls(p, 'browse_feed:')
        check('channels subscribed on browse', calls(p, 'channel:browse-tracks') == 1 and calls(p, 'channel:browse-beats') == 1)
        p.mouse.wheel(0, 900); time.sleep(0.4); y0 = p.evaluate('window.scrollY')
        p.locator('#grid .zs-card-link').nth(2).click(); p.wait_for_selector('.detail-grid')
        check('realtime channels removed when leaving browse', calls(p, 'removeChannel:browse') == 2)
        n_before = calls(p, 'browse_feed:')
        p.go_back(); p.wait_for_selector('.zs-card'); time.sleep(0.9)
        check('back to browse: feed restored without refetching', calls(p, 'browse_feed:') == n_before, f'{calls(p, "browse_feed:")} vs {n_before}')
        check('back to browse: scroll position restored', abs(p.evaluate('window.scrollY') - y0) < 40, f'{p.evaluate("window.scrollY")} vs {y0}')
        p.locator('.zs-topnav a[href="account.html"]').click(); time.sleep(0.5)
        n2 = calls(p, 'browse_feed:')
        p.locator('.zs-topnav a[href="browse.html"]').click(); p.wait_for_selector('.zs-card'); time.sleep(0.8)
        check('revisiting browse within TTL reuses cached rails/feed', calls(p, 'browse_feed:') - n2 == 0, str(calls(p, 'browse_feed:') - n2))
        check('auth.getUser is cached (not once per page)', calls(p, 'auth:getUser') <= 2, str(calls(p, 'auth:getUser')))
        # search
        n3 = calls(p, 'browse_feed:')
        p.fill('#search-input', 'gospel'); time.sleep(0.9)
        check('typing "gospel" does a single debounced request', calls(p, 'browse_feed:') - n3 == 1, str(calls(p, 'browse_feed:') - n3))
        check('search results filtered + rails hidden + URL updated', p.locator('#grid .zs-card').count() == 1 and p.locator('#rails').is_hidden() and 'q=gospel' in p.url)
        p.fill('#search-input', ''); time.sleep(0.7)
        p.locator('.chip[data-genre="Hip-hop"]').click(); time.sleep(0.6)
        check('genre chip filters the feed', p.locator('#grid .zs-card').count() == 1 and 'Night Drive' in p.locator('#grid .zs-card-title').inner_text())
        p.reload(); p.wait_for_selector('.zs-card'); time.sleep(0.5)
        check('refresh keeps the genre filter from the URL', p.locator('.chip.active').get_attribute('data-genre') == 'Hip-hop')
        # infinite scroll: only the first page loads; scrolling to the end brings the next page without a click
        p.goto(BASE + 'browse.html'); p.wait_for_selector('#grid .zs-card'); time.sleep(0.8)
        first = p.locator('#grid .zs-card').count()
        check('browse loads only the first page at first', 0 < first <= 20, str(first))
        p.evaluate("window.scrollTo(0, document.body.scrollHeight)"); time.sleep(1.2)
        p.evaluate("window.scrollTo(0, document.body.scrollHeight)"); time.sleep(1.2)
        check('scrolling down loads the next page automatically', p.locator('#grid .zs-card').count() > first, f"{first} -> {p.locator('#grid .zs-card').count()}")
        # artist filter + load more
        p.goto(BASE + 'browse.html'); p.wait_for_selector('.zs-card')
        n_cards = p.locator('#grid .zs-card').count()
        p.locator('#load-more-btn').click(); time.sleep(0.8)
        check('load more appends the next page', p.locator('#grid .zs-card').count() > n_cards)
        p.locator('.artist-chip').first.click(); time.sleep(0.7)
        check('artist chip filters + pill shows', p.locator('.filter-pill').count() == 1)
        # XSS safety
        p.goto(BASE + 'browse.html?q=onerror'); p.wait_for_selector('#grid .zs-card'); time.sleep(0.6)
        check('hostile title is rendered as text, never executed', p.evaluate('window.__xss') is None and 'onerror' in p.locator('#grid .zs-card-title').first.inner_text())
        check('javascript: cover URL is rejected', p.locator('#grid .zs-card img').count() == 0)
        check('no JS errors in caching/search flows', not e.errors, '; '.join(e.errors[:4])); e.close()

        # ---------------------------------------------------------------- 5. detail page behaviours
        print('5. Detail page')
        e = Env(pw, user='u4'); p = e.open('detail.html?type=track&id=1'); p.wait_for_selector('.title')
        check('detail shows free price + Download link with filename', p.locator('.price.free').count() == 1 and 'download=Free%20Anthem.wav' in p.locator('.action-btn').get_attribute('href'))
        check('waveform scrubber is present', p.locator('.wf canvas').count() == 1)
        time.sleep(1.2)
        check('waveform decoded (bars drawn with varying height)', p.evaluate("""() => { const c = document.querySelector('.wf canvas'); const g = c.getContext('2d'); const w = c.width; const row = g.getImageData(0, 0, w, c.height).data; let cols = new Set(); for (let x = 0; x < w; x += 3) { let n = 0; for (let y = 0; y < c.height; y++) if (row[(y * w + x) * 4 + 3] > 0) n++; cols.add(n); } return cols.size > 3 }"""))
        p.locator('.play-btn').click(); wait_playing(p)
        check('detail play button starts the shared player', 'Free Anthem' in p.locator('.zs-p-title').inner_text())
        p.locator('.wf').click(position={'x': p.locator('.wf').bounding_box()['width'] * 0.5, 'y': 20}); time.sleep(0.5)
        a = audio(p); check('clicking the waveform seeks the shared audio', abs(a['t'] - a['d'] / 2) < 2.5, f't={a["t"]:.1f}')
        p.locator('.zs-heart--cover').click(); time.sleep(0.4)
        check('favourite toggles and persists via favourites table', p.locator('.zs-heart--cover').get_attribute('aria-pressed') == 'true' and any(r.get('item_id') == 1 for r in p.evaluate('window.__tables.favorites')))
        p.locator('.action-btn').evaluate("el => el.addEventListener('click', ev => ev.preventDefault())"); p.locator('.action-btn').click(); time.sleep(0.4)
        check('free download records download + increments counter', p.evaluate('window.__rpc.some(r => r[0] === "increment_download_count")') and any(r.get('track_id') == 1 for r in p.evaluate('window.__tables.downloads')))
        check('"More from artist" section renders', p.locator('.more .zs-card').count() >= 1)
        p.goto(BASE + 'detail.html?type=track&id=2'); p.wait_for_selector('.title')
        check('paid item: Buy button links to checkout', 'checkout.html?type=track&id=2' in p.locator('.action-btn').get_attribute('href') and p.locator('.price').inner_text() == 'K20')
        p.locator('.action-btn').click(); p.wait_for_selector('#zs-view .zs-view-root > *'); time.sleep(0.6)
        check('Buy navigates in-app to checkout view', 'checkout.html' in p.url)
        p.goto(BASE + 'detail.html?type=track&id=6'); p.wait_for_selector('.title')
        check('paid item with no preview shows no player', p.locator('.player-block').count() == 0 and p.locator('.price').inner_text() == 'K15')
        check('no JS errors on detail flows', not e.errors, '; '.join(e.errors[:4])); e.close()

        # ---------------------------------------------------------------- 6. transactional pages (adapter views)
        print('6. Existing pages still mount (guest + logged-in artist/admin)')
        for who, user in [('guest', None), ('artist', 'u1'), ('admin', 'u3')]:
            e = Env(pw, user=user)
            for path in ['account.html', 'login.html', 'checkout.html?type=track&id=2', 'balance.html', 'my-uploads.html', 'upload.html', 'admin.html', 'download.html']:
                p = e.open(path); time.sleep(1.1)
                body_len = p.evaluate("document.querySelector('#zs-view').innerText.length")
                check(f'{who}: {path.split("?")[0]} renders', body_len > 20 and p.locator('.zs-state--error').count() == 0, str(body_len))
            check(f'{who}: no JS errors across all pages', not e.errors, '; '.join(sorted(set(e.errors))[:4])); e.close()
        # in-app link between adapter pages
        e = Env(pw); p = e.open('login.html'); p.wait_for_selector('#zs-view .zs-view-root > *'); p.evaluate("window.__m = 1")
        p.locator('.zs-topnav a[href="browse.html"]').click(); p.wait_for_selector('.zs-card')
        check('adapter -> new view without reload', p.evaluate('window.__m') == 1); e.close()

        # ---------------------------------------------------------------- 7. mobile layout
        print('7. Mobile layout')
        e = Env(pw, mobile=True); p = e.open('browse.html'); p.wait_for_selector('.zs-card')
        check('bottom nav visible, top nav hidden', p.locator('.zs-bottomnav').is_visible() and p.locator('.zs-topnav').is_hidden())
        p.locator('#grid .zs-card').first.locator('.zs-playbtn').tap(force=True); wait_playing(p)
        geo = p.evaluate("() => { const n = document.querySelector('.zs-bottomnav').getBoundingClientRect(); const pl = document.querySelector('#zs-player').getBoundingClientRect(); return { navTop: n.top, playerBottom: pl.bottom, playerH: pl.height, sw: document.documentElement.scrollWidth, iw: innerWidth } }")
        check('mini player sits directly above the bottom nav', abs(geo['playerBottom'] - geo['navTop']) < 2, str(geo))
        check('no horizontal page overflow on a 390px phone', geo['sw'] <= geo['iw'] + 1, str(geo))
        p.locator('.zs-p-meta').tap(); p.wait_for_selector('.zs-sheet:not([hidden])')
        check('sheet is usable on mobile (controls visible)', p.locator('.zs-sheet .zs-ibtn--xl').is_visible())
        btn_sizes = p.evaluate("() => [...document.querySelectorAll('.zs-sheet button:not([disabled]), #zs-player button')].filter(b => b.offsetParent).map(b => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height))")
        check('touch targets are >= 36px', min(btn_sizes) >= 36, str(sorted(btn_sizes)[:3]))
        check('no JS errors on mobile', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ---------------------------------------------------------------- 8. promo script unchanged
        print('8. App promo popup (outside the app) still works')
        e = Env(pw, app_ua=False); p = e.open('browse.html'); p.wait_for_selector('.zs-card'); time.sleep(3.2)
        check('promo popup appears for normal browsers', p.evaluate("document.body.innerText.toLowerCase().includes('zami app')"))
        e.close(); e = Env(pw, app_ua=True); p = e.open('browse.html'); p.wait_for_selector('.zs-card'); time.sleep(3.2)
        check('promo popup is NOT shown inside the Android app (ZamiApp UA)', not p.evaluate("document.body.innerText.toLowerCase().includes('get the zami app')"))
        e.close()

    bad = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(bad)}/{len(results)} checks passed')
    for n, _, d in bad: print('  FAILED:', n, d)
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(run())
