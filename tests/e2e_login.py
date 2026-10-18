"""Login success screen: everyone continues to Browse; only artist accounts also get a Go to Upload shortcut."""
import sys, time, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import e2e
from e2e import Env, check, results
from playwright.sync_api import sync_playwright

def login(p, phone):
    p.fill('#phone-input', phone); p.click('#send-code-btn'); p.wait_for_selector('#otp-input', state='visible', timeout=6000)
    p.fill('#otp-input', '123456'); p.click('#verify-btn'); p.wait_for_selector('#success-card:not(.hidden)', timeout=8000); time.sleep(0.3)

def main():
    with sync_playwright() as pw:
        e = Env(pw, mobile=True, app_ua=False); p = e.open('login.html'); p.wait_for_selector('#phone-input')
        check('account-type hint explains the toggle is for new accounts', 'new account' in p.locator('#role-hint').inner_text().lower())
        # even if "I'm an Artist" is picked, an existing listener account stays a listener
        p.locator('.type-toggle-btn[data-role="artist"]').click()
        login(p, '0977000004')
        check('listener: told they are a listener', 'listener' in p.locator('#role-note').inner_text().lower())
        check('listener: only offered Go to Browse', 'Browse' in p.locator('#go-to-upload-btn').inner_text() and not p.locator('#go-upload-secondary').is_visible())
        check('listener: no upload button anywhere on the screen', 'Upload' not in p.locator('#success-card').inner_text())
        p.click('#go-to-upload-btn'); p.wait_for_url('**/browse.html', timeout=6000)
        check('listener: Continue goes to Browse', 'browse.html' in p.url)
        check('no JS errors (listener login)', not e.errors, '; '.join(e.errors[:3])); e.close()

        e = Env(pw, mobile=True, app_ua=False); p = e.open('login.html'); p.wait_for_selector('#phone-input')
        login(p, '0976666666')
        check('artist: told they are an artist', 'artist' in p.locator('#role-note').inner_text().lower())
        check('artist: Browse is the main button and Go to Upload is a shortcut', 'Browse' in p.locator('#go-to-upload-btn').inner_text() and p.locator('#go-upload-secondary').is_visible())
        p.click('#go-upload-secondary'); p.wait_for_url('**/upload.html', timeout=6000)
        check('artist: shortcut goes to Upload', 'upload.html' in p.url)
        check('no JS errors (artist login)', not e.errors, '; '.join(e.errors[:3])); e.close()
    bad = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(bad)}/{len(results)} login checks passed")
    for r in bad: print('FAILED:', r[0], r[2] if len(r) > 2 else '')
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
