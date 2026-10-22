"""Shareable artist profile link: Share button on the artist page, 'Share my profile link' for artists on their account page."""
import sys, time, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import e2e
from e2e import Env, check, results
from playwright.sync_api import sync_playwright

LINK = 'https://zami.site/artist.html?id=u1'
SHARE_STUB = "window.__shared = []; navigator.share = (d) => { window.__shared.push(d); return Promise.resolve(); };"
NO_SHARE = "Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); window.__copied = []; Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } }, configurable: true });"

def toasts(p): return p.evaluate("() => [...document.querySelectorAll('.zs-toast')].map((t) => t.textContent)")

def main():
    with sync_playwright() as pw:
        # artist page, device with a share sheet
        e = Env(pw, mobile=True, app_ua=False); e.ctx.add_init_script(SHARE_STUB); p = e.open('artist.html?id=u1'); p.wait_for_selector('#share-btn', timeout=8000)
        check('artist page has a Share button next to Follow', p.locator('#profile-card .profile-actions #share-btn').count() == 1 and p.locator('#follow-btn').count() == 1)
        p.click('#share-btn'); time.sleep(0.3)
        got = p.evaluate('window.__shared')
        check('Share opens the phone share sheet with the public profile link', len(got) == 1 and got[0]['url'] == LINK, str(got))
        check('share text names the artist', 'Chanda Beats' in (got[0]['title'] + got[0]['text']), str(got))
        check('the shared link opens that artist', (e.open('artist.html?id=u1'), e.page.wait_for_selector('.profile-name'), 'Chanda Beats' in e.page.locator('.profile-name').inner_text())[2])
        # closing the share sheet is not an error and copies nothing
        e.ctx.add_init_script("navigator.share = () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' }));")
        q = e.ctx.new_page(); q.goto(e2e.BASE + 'artist.html?id=u1'); q.wait_for_selector('#share-btn'); q.click('#share-btn'); time.sleep(0.4)
        check('dismissing the share sheet shows no toast', toasts(q) == [], str(toasts(q)))
        check('no JS errors (artist, share sheet)', not e.errors, '; '.join(e.errors[:3])); e.close()

        # no share sheet (desktop / WebView): link is copied and the user is told
        e = Env(pw, mobile=True, app_ua=False); e.ctx.add_init_script(NO_SHARE); p = e.open('artist.html?id=u1'); p.wait_for_selector('#share-btn')
        p.click('#share-btn'); time.sleep(0.3)
        check('without a share sheet the link is copied', p.evaluate('window.__copied') == [LINK], str(p.evaluate('window.__copied')))
        check('and a confirmation toast appears', any('copied' in t.lower() for t in toasts(p)), str(toasts(p)))
        check('no JS errors (copy)', not e.errors, '; '.join(e.errors[:3])); e.close()

        # clipboard API unavailable: legacy copy path still copies
        e = Env(pw, mobile=True, app_ua=False)
        e.ctx.add_init_script("Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); window.__legacy = []; document.execCommand = (c) => { if (c === 'copy') window.__legacy.push(document.activeElement && document.activeElement.value); return true; };")
        p = e.open('artist.html?id=u1'); p.wait_for_selector('#share-btn'); p.click('#share-btn'); time.sleep(0.3)
        check('legacy copy fallback copies the link', p.evaluate('window.__legacy') == [LINK], str(p.evaluate('window.__legacy')))
        check('no JS errors (legacy copy)', not e.errors, '; '.join(e.errors[:3])); e.close()

        # account page: artists get their own link, listeners do not
        e = Env(pw, mobile=True, app_ua=False, user='u1'); e.ctx.add_init_script(SHARE_STUB); p = e.open('account.html'); p.wait_for_selector('#share-profile-link', state='visible', timeout=8000)
        check('artist account shows "Share my profile link"', 'Share my profile link' in p.locator('#share-profile-link').inner_text())
        p.click('#share-profile-link'); time.sleep(0.3)
        got = p.evaluate('window.__shared')
        check('it shares the artist\'s own profile link', len(got) == 1 and got[0]['url'] == LINK, str(got))
        check('and stays on the account page', 'account.html' in p.url, p.url)
        check('no JS errors (account)', not e.errors, '; '.join(e.errors[:3])); e.close()

        e = Env(pw, mobile=True, app_ua=False, user='u3'); p = e.open('account.html'); p.wait_for_selector('#become-artist-card:not(.hidden)', timeout=8000)
        check('listener account does not show the profile link', not p.locator('#share-profile-link').is_visible())
        check('no JS errors (listener account)', not e.errors, '; '.join(e.errors[:3])); e.close()
    bad = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(bad)}/{len(results)} artist-link checks passed")
    for r in bad: print('FAILED:', r[0], r[2] if len(r) > 2 else '')
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
