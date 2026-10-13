// Draws the license as a PNG on an HTML canvas — runs on the buyer's phone, so it costs the server
// nothing and the image is easy to share on WhatsApp. The image is only a convenience copy: the real
// proof is the license ID, which anyone can check on license.html (it reads the database record).
import { VERIFY_BASE, tierLabel, termsFor } from '../lib/licenses.js';

const W = 1080, PAD = 72;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/); const lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// data: { licenseId, tier, buyerName, beatTitle, producer, issuedAt, extras }
export function drawLicense(data) {
  const terms = termsFor(data.tier, data.producer, !!data.extras);
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `30px ${FONT}`;
  let termsH = 0; const termLines = terms.map((t) => { const l = wrap(probe, t, W - PAD * 2 - 44); termsH += l.length * 42 + 14; return l; });
  const H = 560 + termsH + 410;

  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f6f7f5'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(36, 36, W - 72, H - 72);
  ctx.strokeStyle = '#dfe2de'; ctx.lineWidth = 3; ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.fillStyle = '#1e6feb'; ctx.fillRect(36, 36, W - 72, 14);

  let y = 140;
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = '#14181c'; ctx.font = `800 40px ${FONT}`; ctx.fillText('ZAMI', PAD, y);
  ctx.fillStyle = '#5b6560'; ctx.font = `600 26px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText('BEAT LICENSE', W - PAD, y); ctx.textAlign = 'left';

  y += 84;
  ctx.fillStyle = '#1e6feb'; ctx.font = `700 30px ${FONT}`; ctx.fillText(tierLabel(data.tier).toUpperCase(), PAD, y);
  y += 24;
  ctx.fillStyle = '#14181c'; ctx.font = `800 62px ${FONT}`;
  for (const l of wrap(ctx, data.beatTitle || 'Untitled beat', W - PAD * 2).slice(0, 2)) { y += 70; ctx.fillText(l, PAD, y); }
  y += 52; ctx.fillStyle = '#5b6560'; ctx.font = `500 32px ${FONT}`; ctx.fillText(`Produced by ${data.producer || 'the producer'}`, PAD, y);

  y += 80; ctx.fillStyle = '#5b6560'; ctx.font = `600 24px ${FONT}`; ctx.fillText('LICENSED TO', PAD, y);
  y += 46; ctx.fillStyle = '#14181c'; ctx.font = `700 40px ${FONT}`; ctx.fillText((data.buyerName || '').slice(0, 40) || '—', PAD, y);
  y += 56; ctx.fillStyle = '#5b6560'; ctx.font = `500 28px ${FONT}`;
  const date = data.issuedAt ? new Date(data.issuedAt) : new Date();
  ctx.fillText(`Issued ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, PAD, y);

  y += 50; ctx.strokeStyle = '#dfe2de'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 28;
  ctx.font = `30px ${FONT}`;
  termLines.forEach((lines) => {
    ctx.fillStyle = '#2f8f5b'; ctx.fillText('✓', PAD, y + 34);
    ctx.fillStyle = '#14181c';
    lines.forEach((l, i) => ctx.fillText(l, PAD + 44, y + 34 + i * 42));
    y += lines.length * 42 + 14;
  });

  y += 30; ctx.strokeStyle = '#dfe2de'; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 70; ctx.fillStyle = '#5b6560'; ctx.font = `600 24px ${FONT}`; ctx.fillText('LICENSE ID', PAD, y);
  y += 56; ctx.fillStyle = '#14181c'; ctx.font = `800 52px "SFMono-Regular", Consolas, monospace`; ctx.fillText(data.licenseId || '—', PAD, y);
  y += 56; ctx.fillStyle = '#5b6560'; ctx.font = `500 25px ${FONT}`;
  ctx.fillText('Verify this license at:', PAD, y);
  y += 36; ctx.fillStyle = '#1e6feb'; ctx.font = `600 25px ${FONT}`;
  for (const l of wrap(ctx, VERIFY_BASE + (data.licenseId || ''), W - PAD * 2)) { ctx.fillText(l, PAD, y); y += 34; }
  return c;
}

export function canvasToBlob(canvas) { return new Promise((res) => canvas.toBlob((b) => res(b), 'image/png')); }

// Saves the PNG; on phones that support it, offers the share sheet (WhatsApp etc.) instead.
export async function saveLicense(data) {
  const canvas = drawLicense(data);
  const blob = await canvasToBlob(canvas);
  const name = `ZAMI-license-${data.licenseId || 'beat'}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: 'ZAMI beat license' });
      return 'shared';
    }
  } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
