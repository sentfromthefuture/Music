"""Regression check for the converted pages: render the ORIGINAL standalone page and the new in-app view
under the same stubbed backend and compare what the user sees (text, form fields, buttons, links)."""
import sys, time, re, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from e2e import *

def snapshot(page, scope):
    return page.evaluate("""(scope) => {
      const root = scope === 'view' ? document.querySelector('#zs-view .zs-view-root') : document.body;
      if (!root) return null;
      const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const text = [...root.querySelectorAll('h1,h2,h3,p,label,button,a,th,td,li,option,span.status,.status-line,.empty-state,.gate-msg')]
        .filter(vis).map(e => (e.innerText || '').trim().replace(/\\s+/g, ' ')).filter(t => t && t.length < 160);
      const fields = [...root.querySelectorAll('input,select,textarea')].filter(vis).map(e => (e.tagName + ':' + (e.type || '') + ':' + (e.id || e.name || '') + ':' + (e.placeholder || '')));
      const links = [...root.querySelectorAll('a[href]')].filter(vis).map(a => a.getAttribute('href'));
      return { text, fields, links };
    }""", scope)

def norm(items): return sorted(set(i for i in items if i))

pages = ['account.html', 'login.html', 'checkout.html?type=track&id=2', 'checkout.html?type=beat&id=3', 'balance.html', 'my-uploads.html', 'upload.html', 'admin.html', 'download.html']
diffs = 0
with sync_playwright() as pw:
    for who, user in [('guest', None), ('artist', 'u1'), ('listener', 'u4'), ('admin', 'u3')]:
        e = Env(pw, user=user)
        for path in pages:
            base = path.split('?')[0]
            # original page, untouched, from legacy/original (same origin so relative links resolve the same way)
            orig = e.page
            orig.goto(BASE + 'legacy/original/' + path); time.sleep(1.4)
            if 'legacy/original' not in orig.url: orig_url = 'redirected->' + orig.url.split('/')[-1]
            else: orig_url = None
            so = snapshot(orig, 'body')
            new = e.ctx.new_page(); new.goto(BASE + path); time.sleep(1.4)
            sn = snapshot(new, 'view')
            new_url = new.url.split('/')[-1] if base.split('?')[0] not in new.url else None
            ok = True
            if so is None or sn is None: ok = False; why = 'missing root'
            else:
                for k in ('text', 'fields'):
                    a, b = norm(so[k]), norm(sn[k])
                    if a != b: ok = False; why = f'{k}: only-original={sorted(set(a)-set(b))[:4]} only-new={sorted(set(b)-set(a))[:4]}'
                # links: ignore the shell's own nav links (outside the view root)
            redir_same = (orig_url is None) == (new_url is None)
            if not redir_same: ok = False; why = f'redirect mismatch orig={orig_url} new={new_url}'
            n = (len(norm(so['text'])), len(norm(so['fields']))) if so else (0, 0)
            print(('  SAME ' if ok else '  DIFF ') + f'{who:8s} {path:34s} text={n[0]:3d} fields={n[1]:2d}' + ('' if ok else f'  -> {why}'))
            diffs += 0 if ok else 1
            new.close()
        e.close()
print('\nadapter differences:', diffs)
sys.exit(1 if diffs else 0)
