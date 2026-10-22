// Shareable public link to an artist profile + the share/copy action behind the "Share" buttons.
// Uses the same public origin as the song share poster, so links are right even when the page is opened from another host.
import { showToast } from './toast.js';

const BASE = 'https://zami.site/';
export const artistLink = (id) => `${BASE}artist.html?id=${encodeURIComponent(id)}`;

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through (WebView / older browsers) */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
  let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ }
  ta.remove(); return ok;
}

// Opens the phone's share sheet when there is one, otherwise copies the link.
export async function shareArtist(id, name) {
  const url = artistLink(id);
  const who = name || 'this artist';
  if (navigator.share) {
    try { await navigator.share({ title: `${who} on ZAMI`, text: `Listen to ${who} on ZAMI`, url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; /* closed the sheet: nothing to do; real failures fall through to copy */ }
  }
  if (await copy(url)) showToast('Profile link copied');
  else showToast(url, { ms: 8000 });   // last resort: show it so it can be long-pressed and copied
}
