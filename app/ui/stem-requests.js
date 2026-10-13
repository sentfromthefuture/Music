// Producer-side inbox for "request stems / WAV" (My Uploads). Delivery happens off-platform.
import { loadCssOnce } from '../lib/licenses.js';

export async function mountStemRequests({ supabase, container, before, userId, titleFor }) {
  loadCssOnce('app/css/licensing.css');
  const { data, error } = await supabase.from('stem_requests').select('*').eq('producer_id', userId).order('created_at', { ascending: false });
  if (error || !data || !data.length) return;
  const box = document.createElement('section'); box.className = 'lic-requests';
  const h3 = document.createElement('h3'); h3.textContent = 'Stems & WAV requests'; box.append(h3);
  for (const r of data) {
    const row = document.createElement('div'); row.className = 'lic-req';
    const t = document.createElement('p'); const strong = document.createElement('strong'); strong.textContent = titleFor(r.beat_id) || 'A beat'; t.append(strong);
    const who = document.createElement('p'); who.textContent = `${r.buyer_name || 'Buyer'} · ${r.buyer_contact || 'no number'}`;
    const st = document.createElement('p'); st.className = 'lic-msg'; st.textContent = r.status === 'delivered' ? 'Delivered' : 'Waiting for you — send the files to this buyer, then mark it delivered.';
    row.append(t, who, st);
    if (r.status !== 'delivered') {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'lic-btn'; b.textContent = 'Mark delivered';
      b.addEventListener('click', async () => {
        b.disabled = true;
        const { error: e } = await supabase.from('stem_requests').update({ status: 'delivered' }).eq('id', r.id);
        if (e) { b.disabled = false; return; }
        st.textContent = 'Delivered'; b.remove();
      });
      row.append(b);
    }
    box.append(row);
  }
  container.insertBefore(box, before || container.firstChild);
}
