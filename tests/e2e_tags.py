"""Evidence for the reviewer: tags read from an uploaded file in the browser, saved with the upload, and shown on the
admin review card with search links. Tags are the file's own claims, so the tests also cover hostile/broken files."""
import sys, time, pathlib, struct
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import e2e
from e2e import Env, check, results
from playwright.sync_api import sync_playwright

TONE = pathlib.Path(__file__).parent / 'tone-a.wav'

def synchsafe(n): return bytes([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127])
def frame23(fid, enc, text_bytes): body = bytes([enc]) + text_bytes; return fid.encode() + struct.pack('>I', len(body)) + b'\0\0' + body
def frame24(fid, enc, text_bytes): body = bytes([enc]) + text_bytes; return fid.encode() + synchsafe(len(body)) + b'\0\0' + body
def frame22(fid, enc, text_bytes): body = bytes([enc]) + text_bytes; return fid.encode() + len(body).to_bytes(3, 'big') + body
def id3(ver, frames, pad=200): body = b''.join(frames) + b'\0' * pad; return b'ID3' + bytes([ver, 0, 0]) + synchsafe(len(body)) + body

def wav_with_info(fields):
    raw = TONE.read_bytes()
    info = b'INFO' + b''.join(k.encode() + struct.pack('<I', len(v.encode()) + 1) + v.encode() + b'\0' + (b'\0' if (len(v.encode()) + 1) % 2 else b'') for k, v in fields.items())
    chunk = b'LIST' + struct.pack('<I', len(info)) + info
    out = raw + chunk
    return out[:4] + struct.pack('<I', len(out) - 8) + out[8:]

def v1(title, artist, album, year): return b'TAG' + title.encode().ljust(30, b'\0') + artist.encode().ljust(30, b'\0') + album.encode().ljust(30, b'\0') + year.encode().ljust(4, b'\0') + b'\0' * 31

AUDIO = b'\xff\xfb\x90\x00' * 50

CASES = {
    'v23_latin1_and_utf16': id3(3, [frame23('TIT2', 0, b'Midnight'), frame23('TPE1', 1, b'\xff\xfe' + 'John Banda'.encode('utf-16le')), frame23('TCOP', 0, b'2025 John Banda Music'),
                                     frame23('TSRC', 0, b'ZMABC2600001'), frame23('TALB', 0, b'The Journey'), frame23('TYER', 0, b'2025')]) + AUDIO,
    'v24_utf8_synchsafe': id3(4, [frame24('TIT2', 3, 'Mulenga \u00e9\u00e8'.encode()), frame24('TPE1', 3, b'Chanda Beats'), frame24('TDRC', 3, b'2024-05-01'), frame24('TPUB', 3, b'Lusaka Records')]) + AUDIO,
    'v22_three_letter': id3(2, [frame22('TT2', 0, b'Old Song'), frame22('TP1', 0, b'Old Artist')]) + AUDIO,
    'v1_only': AUDIO + v1('Legacy Title', 'Legacy Artist', 'Legacy Album', '1999'),
    'no_tags': AUDIO,
    'truncated_huge_frame': b'ID3\x03\x00\x00' + synchsafe(40) + b'TIT2' + struct.pack('>I', 0x7fffffff) + b'\0\0\0abc',
    'control_chars_and_long': id3(3, [frame23('TIT2', 0, b'Bad\x00\x01\x1bTitle'), frame23('TPE1', 0, b'A' * 500)]) + AUDIO,
    'html_in_tags': id3(3, [frame23('TIT2', 0, b'<img src=x onerror="window.__xss=1">'), frame23('TPE1', 0, b'<script>window.__xss=1</script>')]) + AUDIO,
}

def main():
    with sync_playwright() as pw:
        # ---------- 1. the parser, on real-world and hostile bytes
        e = Env(pw, mobile=True, app_ua=False); p = e.open('browse.html'); time.sleep(0.8)
        def parse(name, data):
            return p.evaluate("""async ([bytes, name]) => { const m = await import('/Music/app/lib/tags.js'); return await m.readAudioTags(new File([new Uint8Array(bytes)], name)); }""", [list(data), name])
        r = parse('a.mp3', CASES['v23_latin1_and_utf16'])
        check('ID3v2.3: title, UTF-16 artist, copyright, ISRC, album, year', r == {'title': 'Midnight', 'artist': 'John Banda', 'copyright': '2025 John Banda Music', 'isrc': 'ZMABC2600001', 'album': 'The Journey', 'year': '2025'}, str(r))
        r = parse('b.mp3', CASES['v24_utf8_synchsafe'])
        check('ID3v2.4: UTF-8 text, year from TDRC, publisher', r.get('title') == 'Mulenga \u00e9\u00e8' and r.get('artist') == 'Chanda Beats' and r.get('year') == '2024' and r.get('publisher') == 'Lusaka Records', str(r))
        r = parse('c.mp3', CASES['v22_three_letter'])
        check('ID3v2.2 three-letter frames', r == {'title': 'Old Song', 'artist': 'Old Artist'}, str(r))
        r = parse('d.mp3', CASES['v1_only'])
        check('ID3v1 fallback', r == {'title': 'Legacy Title', 'artist': 'Legacy Artist', 'album': 'Legacy Album', 'year': '1999'}, str(r))
        check('file without tags gives an empty result', parse('e.mp3', CASES['no_tags']) == {})
        check('truncated tag with a huge frame size does not crash or hang', parse('f.mp3', CASES['truncated_huge_frame']) == {})
        r = parse('g.mp3', CASES['control_chars_and_long'])
        check('control characters are stripped and long values are cut to 200', r.get('title') == 'Bad Title' and len(r.get('artist', '')) == 200, str(r)[:120])
        r = parse('h.wav', wav_with_info({'INAM': 'Wav Title', 'IART': 'Wav Artist', 'ICOP': '(c) Wav Records'}))
        check('WAV INFO chunk (title, artist, copyright)', r == {'title': 'Wav Title', 'artist': 'Wav Artist', 'copyright': '(c) Wav Records'}, str(r))
        check('a plain WAV without tags gives an empty result', parse('i.wav', TONE.read_bytes()) == {})
        check('no JS errors (parser)', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ---------- 2. upload: tags saved only when the database has the column
        tagged = pathlib.Path('/tmp/tone-tagged.wav'); tagged.write_bytes(wav_with_info({'INAM': 'Midnight', 'IART': 'John Banda', 'ICOP': '2025 John Banda Music'}))
        for column_exists in (True, False):
            e = Env(pw, mobile=True, app_ua=False, user='u1')
            if column_exists: e.ctx.add_init_script("try{localStorage.setItem('stub-upload-tags','1')}catch(e){}")
            p = e.open('upload.html'); p.wait_for_selector('#upload-form'); time.sleep(0.6)
            p.set_input_files('#audio-input', str(tagged)); p.fill('#title', 'Midnight'); p.select_option('#genre', index=1); time.sleep(1.2)
            p.locator('#submit-btn').tap()
            p.wait_for_function("() => (window.__ins || []).some((i) => i.t === 'tracks')", timeout=20000)
            pl = p.evaluate("() => (window.__ins || []).filter((i) => i.t === 'tracks').map((i) => i.payload)[0]")
            if column_exists:
                check('upload saves the tags found in the file', pl.get('upload_tags') == {'title': 'Midnight', 'artist': 'John Banda', 'copyright': '2025 John Banda Music'}, str(pl.get('upload_tags')))
            else:
                check('without the database column the upload still works and sends no tags', 'upload_tags' not in pl and pl.get('title') == 'Midnight')
            check(f'no JS errors (upload, column {"present" if column_exists else "missing"})', not e.errors, '; '.join(e.errors[:3])); e.close()

        # ---------- 3. the admin review card
        e = Env(pw, mobile=True, app_ua=False, user='u3'); p = e.open('admin.html'); p.wait_for_selector('.tab-btn[data-tab="review"]', timeout=8000); time.sleep(0.8)
        p.evaluate("""() => { const T = window.__tables; const base = { owner_id: 'u2', genre: 'Gospel', is_free: true, price: 0, status: 'pending_review', file_path: 'u2/p.wav', transaction_sms: 'sms', created_at: new Date().toISOString() };
          T.tracks.push({ ...base, id: 3001, title: 'Midnight', reference_number: 'TRK-A', upload_tags: { title: 'Midnight', artist: 'John Banda', copyright: '2025 John Banda Music', isrc: 'ZMABC2600001' } });
          T.tracks.push({ ...base, id: 3002, title: 'Mwaka Song', reference_number: 'TRK-B', upload_tags: { title: 'Mwaka Song', artist: 'Mwaka' } });
          T.tracks.push({ ...base, id: 3003, title: 'Quiet One', reference_number: 'TRK-C', upload_tags: {} });
          T.tracks.push({ ...base, id: 3004, title: 'Old Upload', reference_number: 'TRK-D' });
          T.tracks.push({ ...base, id: 3005, title: 'Sneaky', reference_number: 'TRK-E', upload_tags: { title: '<img src=x onerror="window.__xss=1">', artist: '<script>window.__xss=1</script>' } }); }""")
        p.locator('.tab-btn[data-tab="review"]').click(); time.sleep(1.2)
        for _ in range(3): p.evaluate("window.scrollTo(0, document.body.scrollHeight)"); time.sleep(0.5)
        card = lambda ref: p.locator('#tab-review .card', has_text=ref)
        t = card('TRK-A').inner_text()
        check('card shows what the file says', 'John Banda' in t and '2025 John Banda Music' in t and 'ZMABC2600001' in t and 'Uploaded by' in t and 'Mwaka' in t, t[:300])
        check('artist in the file differs from uploader -> flagged', 'differs from the uploader' in t)
        check('matching artist is not flagged', 'differs' not in card('TRK-B').inner_text())
        links = {a.inner_text(): a.get_attribute('href') for a in card('TRK-A').locator('a[target=_blank]').all()}
        check('one-tap Google, YouTube and MusicBrainz searches use the title and uploader',
              'google.com/search?q=' in links.get('Google', '') and 'Midnight' in links.get('Google', '') and 'youtube.com/results' in links.get('YouTube', '') and 'musicbrainz.org/search' in links.get('MusicBrainz', ''), str(links)[:300])
        check('a valid ISRC gets a direct MusicBrainz ISRC link', links.get('ISRC') == 'https://musicbrainz.org/isrc/ZMABC2600001', str(links.get('ISRC')))
        check('links open in a new tab without leaking the page', all(a.get_attribute('rel') == 'noopener noreferrer' for a in card('TRK-A').locator('a[target=_blank]').all()))
        check('no tags in the file is explained, not alarming', 'none found' in card('TRK-C').inner_text() and 'not a warning' in card('TRK-C').inner_text())
        check('older uploads say tags were not recorded but still get search links', 'not recorded' in card('TRK-D').inner_text() and card('TRK-D').locator('a[target=_blank]').count() >= 3)
        check('HTML inside tags is shown as text and never runs', p.evaluate("() => !window.__xss") and '<script>' in card('TRK-E').inner_text())
        check('no JS errors (review card)', not e.errors, '; '.join(e.errors[:3])); e.close()

    bad = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(bad)}/{len(results)} tag checks passed")
    for r in bad: print('FAILED:', r[0], r[2] if len(r) > 2 else '')
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
