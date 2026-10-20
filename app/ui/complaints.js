// "Report a problem" on a purchased beat. Stored in `purchase_complaints` (supabase/complaints.sql).
// Buyer files it (Account -> purchase), the producer replies / marks it fixed (My Uploads + Account),
// admins resolve it (Admin -> Complaints), and the buyer can reopen it. Hidden until the table exists.
let probe = null;
export function complaintsEnabled(supabase) {
  if (!probe) probe = Promise.resolve(supabase.from('purchase_complaints').select('id').limit(1)).then((r) => !r.error).catch(() => false);
  return probe;
}

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const day = (d) => new Date(d).toLocaleDateString();

// Producer's view: every complaint on their beats, with a reply box + "Mark as fixed" for the ones that need action.
export async function mountProducerComplaints({ supabase, container, before, userId, titleFor }) {
  const { data, error } = await supabase.from('purchase_complaints').select('*').eq('producer_id', userId).order('created_at', { ascending: false });
  if (error || !data || !data.length) return;
  let titles = new Map();
  if (!titleFor) {
    const { data: beats } = await supabase.from('beats').select('id, title').in('id', [...new Set(data.map((r) => r.item_id))]);
    titles = new Map((beats || []).map((b) => [String(b.id), b.title]));
    titleFor = (id) => titles.get(String(id));
  }
  const needs = (r) => r.status !== 'resolved' && !r.producer_fixed_at;
  const box = el('section', 'lic-requests');
  const h3 = el('h3'); box.append(h3);
  const render = () => {
    const open = data.filter(needs).length;
    h3.textContent = open ? `Buyer complaints (${open} need${open === 1 ? 's' : ''} your reply)` : 'Buyer complaints';
    h3.style.color = open ? 'var(--danger,#b3261e)' : '';
    box.replaceChildren(h3);
    for (const r of data) {
      const row = el('div', 'lic-req');
      const t = el('p'); t.append(el('strong', null, titleFor(r.item_id) || 'A beat'));
      row.append(t,
        el('p', null, `${r.buyer_name || 'Buyer'} · ${r.buyer_contact || 'no number'} · ${day(r.created_at)}`),
        el('p', null, r.message));
      if (r.reopened_at && needs(r)) row.append(el('p', 'lic-msg is-error', `The buyer reopened this on ${day(r.reopened_at)} — it is not fixed yet.`));
      if (r.producer_reply) row.append(el('p', 'lic-msg', `Your reply: ${r.producer_reply}`));
      if (r.status === 'resolved') row.append(el('p', 'lic-msg', 'Resolved by ZAMI management.'));
      else if (r.producer_fixed_at) row.append(el('p', 'lic-msg', `You marked this fixed on ${day(r.producer_fixed_at)}. Waiting for ZAMI to confirm.`));
      else {
        row.append(el('p', 'lic-msg', 'ZAMI management has also been notified. Contact the buyer, fix the problem, then tell them what you did.'));
        const ta = el('textarea'); ta.maxLength = 500; ta.rows = 3; ta.placeholder = 'What did you do to fix it? (the buyer will read this)';
        ta.style.cssText = 'width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--zs-border,#ddd);border-radius:10px;font:inherit;font-size:14px;margin-top:6px;';
        const btn = el('button', 'lic-btn lic-btn--primary', 'Mark as fixed'); btn.type = 'button';
        const msg = el('p', 'lic-msg'); msg.hidden = true;
        btn.addEventListener('click', async () => {
          const text = ta.value.trim();
          if (text.length < 5) { msg.hidden = false; msg.className = 'lic-msg is-error'; msg.textContent = 'Please write a short reply for the buyer.'; return; }
          btn.disabled = true;
          const { data: done, error: upErr } = await supabase.from('purchase_complaints').update({ producer_reply: text, producer_fixed_at: new Date().toISOString() }).eq('id', r.id).select('id');
          if (upErr || !done || !done.length) { btn.disabled = false; msg.hidden = false; msg.className = 'lic-msg is-error'; msg.textContent = `Couldn't save${upErr ? ': ' + upErr.message : ' — nothing was changed. Please try again.'}`; return; }
          r.producer_reply = text; r.producer_fixed_at = new Date().toISOString(); render();
        });
        row.append(ta, btn, msg);
      }
      box.append(row);
    }
  };
  render();
  container.insertBefore(box, before || container.firstChild);
}
