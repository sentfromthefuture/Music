// "Report a problem" on a purchased beat. Stored in `purchase_complaints` (supabase/complaints.sql);
// the producer sees it in My Uploads and admins see it in Admin -> Complaints. Hidden until the table exists.
let probe = null;
export function complaintsEnabled(supabase) {
  if (!probe) probe = Promise.resolve(supabase.from('purchase_complaints').select('id').limit(1)).then((r) => !r.error).catch(() => false);
  return probe;
}

// Producer inbox (read-only) on My Uploads.
export async function mountProducerComplaints({ supabase, container, before, userId, titleFor }) {
  const { data, error } = await supabase.from('purchase_complaints').select('*').eq('producer_id', userId).order('created_at', { ascending: false });
  if (error || !data || !data.length) return;
  const box = document.createElement('section'); box.className = 'lic-requests';
  const h3 = document.createElement('h3'); h3.textContent = 'Buyer complaints'; box.append(h3);
  for (const r of data) {
    const row = document.createElement('div'); row.className = 'lic-req';
    const t = document.createElement('p'); const s = document.createElement('strong'); s.textContent = titleFor(r.item_id) || 'A beat'; t.append(s);
    const who = document.createElement('p'); who.textContent = `${r.buyer_name || 'Buyer'} · ${r.buyer_contact || 'no number'} · ${new Date(r.created_at).toLocaleDateString()}`;
    const msg = document.createElement('p'); msg.textContent = r.message;
    const st = document.createElement('p'); st.className = 'lic-msg';
    st.textContent = r.status === 'resolved' ? 'Resolved by ZAMI management' : 'Open — ZAMI management has also been notified. Please contact the buyer to fix it.';
    row.append(t, who, msg, st); box.append(row);
  }
  container.insertBefore(box, before || container.firstChild);
}
