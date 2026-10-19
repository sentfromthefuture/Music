"""Decline an upload / delete a song WITH A REASON the artist can read (Duplicate, Not original...)."""
import sys, time, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import e2e
from e2e import Env, check, results
from playwright.sync_api import sync_playwright

BASE_ROW = "{ owner_id: 'u2', genre: 'Gospel', is_free: true, price: 0, file_path: 'u2/p.wav', transaction_sms: 'Confirmed K50 sent', created_at: new Date().toISOString() }"

def admin(pw, column_exists):
    e = Env(pw, mobile=True, app_ua=False, user='u3')
    if column_exists: e.ctx.add_init_script("try{localStorage.setItem('stub-moderation','1')}catch(e){}")
    p = e.open('admin.html'); p.wait_for_selector('.tab-btn[data-tab="review"]', timeout=8000); time.sleep(0.8)
    e.dialogs = []
    p.on('dialog', lambda d: (e.dialogs.append(d.message), d.accept()))
    return e, p

def updates(p): return p.evaluate("() => (window.__upd || []).filter((u) => u.t === 'tracks' || u.t === 'beats').map((u) => u.payload)")

def main():
    with sync_playwright() as pw:
        # ---------------- reasons are saved when the database has the columns
        e, p = admin(pw, True)
        p.evaluate(f"""() => {{ const T = window.__tables, b = {BASE_ROW};
          T.tracks.push({{ ...b, id: 4001, title: 'Dup Song', status: 'pending_review', reference_number: 'TRK-D1' }});
          T.tracks.push({{ ...b, id: 4002, title: 'Other Song', status: 'pending_review', reference_number: 'TRK-D2' }});
          T.tracks.push({{ ...b, id: 4003, title: 'Live Copy', status: 'approved', created_at: new Date(2026, 8, 1).toISOString() }}); }}""")
        p.locator('.tab-btn[data-tab="review"]').click(); time.sleep(1.2)
        for _ in range(3): p.evaluate("window.scrollTo(0, document.body.scrollHeight)"); time.sleep(0.4)
        card = lambda ref: p.locator('#tab-review .card', has_text=ref)
        check('pending card offers Approve, Decline and Reject payment', all(card('TRK-D1').get_by_role('button', name=n).count() == 1 for n in ('Approve', 'Decline', 'Reject payment')) or card('TRK-D1').locator('button.decline').count() == 1)
        check('the card explains the difference between Decline and Reject payment', 'artist sees why' in card('TRK-D1').inner_text())
        card('TRK-D1').locator('.decline').click(); time.sleep(0.4)
        check('Decline opens a reason sheet with the four reasons', p.locator('input[name="zami-reason"]').count() == 4 and 'Duplicate' in p.locator('body').inner_text())
        p.get_by_role('button', name='Cancel').click(); time.sleep(0.3)
        check('Cancel changes nothing', len(updates(p)) == 0 and card('TRK-D1').count() == 1 and p.locator('input[name="zami-reason"]').count() == 0)
        card('TRK-D1').locator('.decline').click(); time.sleep(0.3)
        p.locator('input[name="zami-reason"][value="other"]').check(); p.get_by_role('button', name='Decline upload').click(); time.sleep(0.3)
        check('"Other" needs a note', 'short note' in p.locator('body').inner_text() and len(updates(p)) == 0)
        p.locator('input[name="zami-reason"][value="not_original"]').check(); p.fill('textarea', 'Matches a release on YouTube.'); p.get_by_role('button', name='Decline upload').click(); time.sleep(1)
        u = updates(p)
        check('declined: status removed with kind and the reason the artist will read', len(u) == 1 and u[0].get('status') == 'removed' and u[0].get('removal_kind') == 'declined' and u[0].get('removed_reason', '').startswith('Not original.') and 'Matches a release on YouTube.' in u[0].get('removed_reason', '') and u[0].get('removed_at'), str(u))
        check('declined card leaves the review list', card('TRK-D1').count() == 0)
        card('TRK-D2').locator('.decline').click(); time.sleep(0.3); p.get_by_role('button', name='Decline upload').click(); time.sleep(1)
        u = updates(p)
        check('default reason is Duplicate', len(u) == 2 and u[1].get('removed_reason') == 'Duplicate. This song is already on ZAMI.', str(u[-1]))
        # live song -> Delete song
        p.fill('#search-input', ''); p.locator('.tab-btn[data-tab="live"]').click(); time.sleep(1.0)
        p.fill('#search-input', 'Live Copy'); time.sleep(1.3)
        lc = p.locator('#tab-live .card', has_text='Live Copy')
        check('live card now says Delete song', lc.count() == 1 and lc.locator('.reject').inner_text().strip() == 'Delete song')
        lc.locator('.reject').click(); time.sleep(0.4); p.locator('input[name="zami-reason"][value="duplicate"]').check(); p.get_by_role('button', name='Delete song').last.click(); time.sleep(1)
        u = updates(p)
        check('deleted: kind deleted with a reason', u[-1].get('removal_kind') == 'deleted' and u[-1].get('status') == 'removed' and 'Duplicate' in u[-1].get('removed_reason', ''), str(u[-1]))
        # taken down tab shows reasons + sensible restore targets
        p.evaluate(f"""() => {{ const T = window.__tables, b = {BASE_ROW};
          T.tracks.push({{ ...b, id: 4010, title: 'Was Declined', status: 'removed', removal_kind: 'declined', removed_reason: 'Not original. <b>x</b>', removed_at: new Date(2026, 9, 2).toISOString() }});
          T.tracks.push({{ ...b, id: 4011, title: 'Was Deleted', status: 'removed', removal_kind: 'deleted', removed_reason: 'Duplicate.', removed_at: new Date(2026, 9, 3).toISOString() }}); }}""")
        p.fill('#search-input', ''); p.locator('.tab-btn[data-tab="taken-down"]').click(); time.sleep(1.3)
        td = lambda t: p.locator('#tab-taken-down .card', has_text=t)
        check('taken down shows the kind and the reason (as text)', 'Declined' in td('Was Declined').inner_text() and 'Not original. <b>x</b>' in td('Was Declined').inner_text() and 'Deleted' in td('Was Deleted').inner_text())
        n = len(updates(p)); td('Was Declined').get_by_role('button', name='Send back to review').click(); time.sleep(0.8)
        u = updates(p)
        check('a declined upload goes back to review (not straight to live) and its reason is cleared', len(u) == n + 1 and u[-1].get('status') == 'pending_review' and u[-1].get('removed_reason') is None and u[-1].get('removal_kind') is None, str(u[-1]))
        td('Was Deleted').get_by_role('button', name='Restore').click(); time.sleep(0.8)
        u = updates(p)
        check('a deleted song restores to live', u[-1].get('status') == 'approved' and u[-1].get('removed_reason') is None, str(u[-1]))
        check('no JS errors (moderation, columns present)', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ---------------- without the SQL: still works, tells the admin the reason was not saved
        e, p = admin(pw, False)
        p.evaluate(f"() => {{ window.__tables.tracks.push({{ ...{BASE_ROW}, id: 4020, title: 'No Cols', status: 'pending_review', reference_number: 'TRK-N1' }}); }}")
        p.locator('.tab-btn[data-tab="review"]').click(); time.sleep(1.2)
        p.locator('#tab-review .card', has_text='TRK-N1').locator('.decline').click(); time.sleep(0.3); p.get_by_role('button', name='Decline upload').click(); time.sleep(1)
        u = updates(p)
        check('without the columns the decline still works but saves no reason fields', len(u) == 1 and u[0].get('status') == 'removed' and 'removed_reason' not in u[0] and 'removal_kind' not in u[0], str(u))
        check('admin is told to run the SQL', any('moderation-reasons.sql' in m for m in e.dialogs), str(e.dialogs))
        check('no JS errors (moderation, columns missing)', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ---------------- the artist sees it in My Uploads
        e = Env(pw, mobile=True, app_ua=False, user='u2'); p = e.open('account.html'); p.wait_for_selector('#artist-links:not(.hidden)', timeout=8000)
        p.evaluate(f"""() => {{ const T = window.__tables, b = {BASE_ROW};
          T.tracks.push({{ ...b, id: 4030, title: 'Rejected One', status: 'removed', removal_kind: 'declined', removed_reason: 'Duplicate. This song is already on ZAMI.', removed_at: new Date().toISOString() }});
          T.tracks.push({{ ...b, id: 4031, title: 'Removed One', status: 'removed', removal_kind: 'deleted', removed_reason: 'Not original. <script>window.__xss=1</script>', removed_at: new Date().toISOString() }}); }}""")
        p.locator('a[href="my-uploads.html"]').first.click(); p.wait_for_selector('.card[data-item-id]', timeout=8000); time.sleep(1)
        p.evaluate("() => { const l = document.getElementById('list'); if (l && l._revealAll) l._revealAll(); }"); time.sleep(0.3)
        c1 = p.locator('.card[data-item-id]', has_text='Rejected One'); c2 = p.locator('.card[data-item-id]', has_text='Removed One')
        check('artist sees a Declined badge and the reason', 'Declined' in c1.inner_text() and 'Duplicate. This song is already on ZAMI.' in c1.inner_text() and 'zamimusicltd@gmail.com' in c1.inner_text(), c1.inner_text()[:200])
        check('deleted song is labelled Removed and the reason is shown as plain text', 'Removed' in c2.inner_text() and '<script>' in c2.inner_text() and p.evaluate("() => !window.__xss"))
        check('no JS errors (my uploads)', not e.errors, '; '.join(e.errors[:3])); e.close()

    bad = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(bad)}/{len(results)} moderation checks passed")
    for r in bad: print('FAILED:', r[0], r[2] if len(r) > 2 else '')
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
