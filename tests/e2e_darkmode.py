"""Dark mode: follows the device setting, header toggle overrides it and persists, no flash on first paint,
works with storage blocked, covers every page (admin included) with no JS errors."""
import sys, time, re, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import e2e
from e2e import Env, check, results
from playwright.sync_api import sync_playwright

def env(pw, scheme, user=None):
    e = Env(pw, mobile=True, app_ua=False, user=user); e.ctx.close()
    e.ctx = e.browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, color_scheme=scheme)
    e.ctx.add_init_script(e2e.INIT)
    if user: e.ctx.add_init_script(f"try{{localStorage.setItem('stub-user','{user}')}}catch(e){{}}")
    e.ctx.route(re.compile(r'^https://.*'), lambda r: r.abort())
    e.ctx.route('**/@supabase/supabase-js@2/+esm', lambda r: r.fulfill(content_type='application/javascript', headers={'Access-Control-Allow-Origin': '*'}, body=e2e.STUB))
    e.ctx.route(e2e.HOST + '**', e2e.serve_media)
    e.page = e.ctx.new_page(); e.errors = []
    e.page.on('pageerror', lambda x: e.errors.append(f'pageerror: {x}'))
    return e

theme = lambda p: p.evaluate("document.documentElement.getAttribute('data-theme')")
bodybg = lambda p: p.evaluate("getComputedStyle(document.body).backgroundColor")

def main():
    with sync_playwright() as pw:
        # toggle + persistence (device is light)
        e = env(pw, 'light'); p = e.page; p.goto(e2e.BASE + 'browse.html'); p.wait_for_selector('.zs-card')
        check('device light, nothing stored: light', theme(p) == 'light'); light_bg = bodybg(p)
        p.click('.zs-theme'); time.sleep(0.2)
        check('toggle switches to dark and changes the page colour', theme(p) == 'dark' and bodybg(p) != light_bg)
        check('toggle label flips', 'light' in p.get_attribute('.zs-theme', 'aria-label').lower())
        p.reload(); p.wait_for_selector('.zs-card'); check('dark survives a reload', theme(p) == 'dark')
        p.click('.zs-bottomnav a[data-nav="upload.html"]'); time.sleep(0.6); check('dark survives in-app navigation', theme(p) == 'dark')
        p.click('.zs-theme'); time.sleep(0.2); p.reload(); p.wait_for_selector('.zs-header')
        check('an explicit light choice survives a reload', theme(p) == 'light')
        check('no JS errors (toggle)', not e.errors, '; '.join(e.errors[:3])); e.close()

        # follows the device until the visitor chooses
        e = env(pw, 'dark'); p = e.page; p.goto(e2e.BASE + 'browse.html'); p.wait_for_selector('.zs-card')
        check('device dark, nothing stored: dark', theme(p) == 'dark')
        p.emulate_media(color_scheme='light'); time.sleep(0.3); check('follows the device live', theme(p) == 'light')
        p.click('.zs-theme'); time.sleep(0.2); p.emulate_media(color_scheme='light'); p.emulate_media(color_scheme='dark'); time.sleep(0.3)
        check('after an explicit choice the device no longer overrides it', theme(p) == 'dark'); e.close()

        # no flash: attribute is set before the document finishes parsing
        e = env(pw, 'dark'); p = e.page
        p.add_init_script("document.addEventListener('DOMContentLoaded',()=>{window.__t0=document.documentElement.getAttribute('data-theme')})")
        p.goto(e2e.BASE + 'admin.html'); time.sleep(0.4)
        check('theme is set before first paint', p.evaluate('window.__t0') == 'dark'); e.close()

        # storage blocked (private mode / strict WebView): still switches for the visit
        e = env(pw, 'light'); p = e.page
        p.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}})")
        p.goto(e2e.BASE + 'login.html'); p.wait_for_selector('.zs-header'); p.click('.zs-theme'); time.sleep(0.2)
        check('toggle works with storage blocked', theme(p) == 'dark'); e.close()

        # every page renders dark with no errors; nothing is left white
        pages = [('browse.html', None, '.zs-card'), ('detail.html?type=track&id=1', None, '.title'), ('artist.html?id=u1', None, '#zs-view .zs-view-root > *'),
                 ('login.html', None, '#phone-input'), ('account.html', 'u1', '#zs-view .zs-view-root > *'), ('upload.html', 'u2', '#zs-view .zs-view-root > *'),
                 ('balance.html', 'u2', '#zs-view .zs-view-root > *'), ('my-uploads.html', 'u2', '#zs-view .zs-view-root > *'),
                 ('download.html', None, '#zs-view .zs-view-root > *'), ('admin.html', 'u3', '.tab-btn[data-tab="review"]')]
        for path, user, sel in pages:
            e = env(pw, 'dark', user); p = e.page; p.goto(e2e.BASE + path); p.wait_for_selector(sel, timeout=8000); time.sleep(0.5)
            check(f'{path.split("?")[0]}: dark, page background is dark', theme(p) == 'dark' and bodybg(p) == 'rgb(14, 17, 19)', bodybg(p))
            check(f'{path.split("?")[0]}: no JS errors', not e.errors, '; '.join(e.errors[:2])); e.close()
        # admin tabs, including the ones with pills and the delete/decline sheet appended to <body>
        e = env(pw, 'dark', 'u3'); p = e.page
        e.ctx.add_init_script("try{localStorage.setItem('stub-moderation','1')}catch(e){}")
        p.goto(e2e.BASE + 'admin.html'); p.wait_for_selector('.tab-btn[data-tab="review"]', timeout=8000); time.sleep(0.5)
        for t in p.eval_on_selector_all('.tab-btn', 'els => els.map(x => x.dataset.tab)'):
            p.click(f'.tab-btn[data-tab="{t}"]'); time.sleep(0.4)
        check('every admin tab opens in dark with no JS errors', not e.errors, '; '.join(e.errors[:2]))
        p.click('.tab-btn[data-tab="live"]'); time.sleep(0.4); p.locator('#zs-view button:has-text("Delete song")').first.click(); time.sleep(0.4)
        sheet = p.evaluate("(() => { const o=[...document.body.children].find(x=>x.style&&x.style.zIndex==='9999'); return o ? getComputedStyle(o.firstChild).backgroundColor : null })()")
        check('admin delete/decline sheet is dark', sheet == 'rgb(23, 27, 31)', str(sheet)); e.close()

        # the public landing page follows the same setting
        e = env(pw, 'dark'); p = e.page; p.goto(e2e.BASE + 'index.html'); time.sleep(0.4)
        check('index.html is dark when the device is dark', theme(p) == 'dark' and bodybg(p) == 'rgb(14, 17, 19)', bodybg(p)); e.close()
    bad = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(bad)}/{len(results)} dark-mode checks passed")
    for r in bad: print('FAILED:', r[0], r[2] if len(r) > 2 else '')
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
