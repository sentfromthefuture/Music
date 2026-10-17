"""Clickjacking defence: app pages stay hidden when framed by another site, and show normally when opened directly."""
import sys, time, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import e2e
from e2e import Env, check, results
from playwright.sync_api import sync_playwright

PAGES = ['browse.html', 'account.html', 'admin.html', 'checkout.html', 'balance.html', 'my-uploads.html', 'upload.html', 'login.html']

def main():
    with sync_playwright() as pw:
        for name in PAGES:
            e = Env(pw, mobile=True, app_ua=False, user='u3')
            p = e.page
            p.goto(e2e.BASE + name); time.sleep(0.8)
            shown = p.evaluate("getComputedStyle(document.documentElement).display") != 'none'
            check(f'{name}: shows normally when opened directly', shown and p.locator('#zs-view, body').first.is_visible())
            # the same page inside an iframe on another origin
            p2 = e.ctx.new_page()
            p2.set_content(f'<iframe id="f" src="{e2e.BASE + name}" style="width:400px;height:700px"></iframe>'); time.sleep(1.2)
            fr = [f for f in p2.frames if name in f.url]
            hidden = bool(fr) and fr[0].evaluate("getComputedStyle(document.documentElement).display") == 'none'
            check(f'{name}: stays hidden when framed by another site', hidden or not fr)
            e.close()
        # the public landing page is intentionally left alone so it works without JavaScript
        e = Env(pw, mobile=True, app_ua=False); p = e.page; p.goto(e2e.BASE + 'index.html'); time.sleep(0.5)
        check('index.html still shows normally', p.evaluate("getComputedStyle(document.documentElement).display") != 'none'); e.close()
    bad = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(bad)}/{len(results)} security checks passed")
    for r in bad: print('FAILED:', r[0], r[2] if len(r) > 2 else '')
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
