// Adapter view generated from legacy/original/upload.html (tools/convert-page.mjs).
// Page logic is unchanged; the shared Supabase client, router navigation and timer cleanup are injected.
import { readAudioTags, uploadTagsEnabled } from '../lib/tags.js';
import { navigate as __navigate, reload as __reload } from '../lib/router.js';
import { licensingEnabled, TIERS, loadCssOnce } from '../lib/licenses.js';
import { songLicensingEnabled } from '../lib/song-licenses.js';
import { createSongLicenseForm } from '../ui/song-license-form.js';

export const title = "Upload — Music Platform";
export const css = 'css/views/upload.css';
export const markup = `<div class="bg-blobs" aria-hidden="true">
  <div class="blob blob-1"></div>
  <div class="blob blob-2"></div>
  <div class="blob blob-3"></div>
</div>

<div class="wrap">
  <div class="eq" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
  <div class="header-row">
    <a href="browse.html" id="back-link" aria-label="Back to Browse">←</a>
    <div>
      <h1>Upload</h1>
      <p class="sub">Share a track or a beat with your listeners.</p>
    </div>
  </div>

  <form id="upload-form" class="card">
    <label>Type</label>
    <div class="type-toggle">
      <button type="button" data-type="track" class="active">Track</button>
      <button type="button" data-type="beat">Beat</button>
    </div>

    <label for="title">Title</label>
    <input type="text" id="title" required placeholder="e.g. Naiwe" />

    <label for="genre">Genre</label>
    <select id="genre" required>
      <option value="">Select genre</option>
      <option>Amapiano</option>
      <option>Afrobeat</option>
      <option>Gospel</option>
      <option>Hip-hop</option>
      <option>Zed R&B</option>
      <option>Other</option>
    </select>

    <div id="bpm-field" class="hidden">
      <label for="bpm">BPM</label>
      <input type="number" id="bpm" min="40" max="220" placeholder="e.g. 112" />
    </div>

    <div id="price-field">
      <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        Price
        <button type="button" id="price-info-btn" style="width:16px;height:16px;border-radius:50%;border:1px solid var(--border);background:var(--surface-alt);color:var(--ink-muted);font-size:11px;line-height:1;cursor:pointer;padding:0;">?</button>
      </label>
      <div id="price-info" class="hidden" style="background:var(--surface-alt);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:var(--ink-muted);">
        <strong style="color:var(--ink);">Free</strong> — anyone can download this at no cost.<br/>
        <strong style="color:var(--ink);">Paid</strong> — set the amount buyers pay to download it. This is separate from the listing fee you'll pay to get your upload published.
      </div>
      <div class="price-toggle">
        <button type="button" data-free="true" class="active">Free</button>
        <button type="button" data-free="false">Paid</button>
      </div>
      <div id="amount-field" class="hidden" style="margin-top:10px;">
        <input type="number" id="price" min="1" step="1" placeholder="Amount in Kwacha" />
      </div>
    </div>

    <div id="tiers-field" class="hidden">
      <label>Licenses you sell</label>
      <div class="lic-form">
        <div class="lic-form-row" data-tier-row="basic"><label><input type="checkbox" data-tier-on checked /><span>Basic lease<small>MP3 · 1 song · non-exclusive</small></span></label><input type="number" min="1" step="1" placeholder="Price (K)" data-tier-price aria-label="Basic lease price in Kwacha" /></div>
        <div class="lic-form-row" data-tier-row="premium"><label><input type="checkbox" data-tier-on /><span>Premium lease<small>Wider use · non-exclusive</small></span></label><input type="number" min="1" step="1" placeholder="Price (K)" data-tier-price aria-label="Premium lease price in Kwacha" /></div>
        <div class="lic-form-row" data-tier-row="exclusive"><label><input type="checkbox" data-tier-on /><span>Exclusive license<small>Beat leaves the store once sold</small></span></label><input type="number" min="1" step="1" placeholder="Price (K)" data-tier-price aria-label="Exclusive license price in Kwacha" /></div>
        <label class="lic-check"><input type="checkbox" id="offer-extras" /><span>I can provide WAV and stems on request (Premium and Exclusive buyers)</span></label>
        <label for="extras-link">WAV / stems link (optional)</label>
        <input type="text" id="extras-link" inputmode="url" placeholder="https://drive.google.com/…" />
        <p class="lic-note">Only Premium and Exclusive buyers can see this link, and only after you are paid. It uses none of your storage.</p>
      </div>
      <label for="music-key">Key (optional)</label>
      <input type="text" id="music-key" maxlength="20" placeholder="e.g. F# minor" />
      <label for="beat-tags">Mood tags (optional)</label>
      <input type="text" id="beat-tags" maxlength="80" placeholder="e.g. dark, party, chill" />
      <label class="lic-check"><input type="checkbox" id="rights-confirm" /><span>I made this beat, or I have the right to license it (any samples in it are cleared).</span></label>
    </div>

    <div id="song-lic-field" class="hidden">
      <label class="lic-check"><input type="checkbox" id="song-lic-offer" /><span><strong>Also offer licenses for this song</strong> (optional) — so people can legally use it in videos, adverts, films, radio/TV or events. The normal download stays as you set it above.</span></label>
      <div id="song-lic-form" class="hidden"></div>
    </div>

    <label>Cover image</label>
    <div class="file-drop" id="cover-drop">Tap to choose an image (optional)</div>
    <input type="file" id="cover-input" accept="image/*" class="hidden" />

    <label>Audio file</label>
    <div class="file-drop" id="audio-drop">Tap to choose an audio file</div>
    <input type="file" id="audio-input" accept="audio/*" class="hidden" />

    <div id="waveform-field" class="hidden">
      <label>Choose preview section (30s)</label>
      <div class="waveform-wrap">
        <canvas id="waveform-canvas" width="352" height="80"></canvas>
        <div id="preview-window"></div>
      </div>
      <input type="range" id="preview-start-slider" min="0" max="0" step="0.1" value="0" />
      <p id="preview-range-label">0:00 – 0:00</p>
    </div>

    <button type="submit" class="primary" id="submit-btn"><span>Upload</span></button>
    <p class="status-line" id="status-line"></p>
  </form>

  <!-- Shown after a successful upload, replaces the form -->
  <div id="pending-card" class="card pending-card hidden">
    <div class="row">
      <div class="thumb">♪</div>
      <div>
        <p style="margin:0;font-size:13px;font-weight:600;" id="pending-title">—</p>
        <p style="margin:0;font-size:12px;color:var(--ink-muted);" id="pending-status-label">Awaiting payment</p>
      </div>
    </div>

    <div id="review-flow">
      <div class="ref-badge">
        <span>Reference</span>
        <strong id="ref-number">—</strong>
      </div>
      <p class="pay-instructions">Send <strong>K50</strong> to <strong>0573678363</strong> using <strong>Send Money</strong> (not Withdraw, so there's no extra charge). Then paste your payment SMS below.</p>
      <p class="fee-note" style="font-size:12px;color:var(--ink-muted);margin:-8px 0 14px;">Why we charge this: it helps us check every upload and stops fake or spam uploads. You only pay it once per upload — it's not a subscription.</p>
      <textarea id="sms-input" placeholder="Paste your payment confirmation SMS"></textarea>
      <button type="button" class="primary" id="sms-submit-btn"><span>Submit for review</span></button>
      <p class="status-line" id="sms-status-line"></p>
      <p class="done-msg hidden" id="done-msg">Submitted — waiting for approval. This page will update automatically.</p>
    </div>

    <div id="approved-flow" class="hidden">
      <p class="done-msg" style="margin-bottom:14px;">🎉 It's live! Your upload is now visible to everyone.</p>
      <button type="button" class="primary" id="upload-another-btn"><span>Upload another</span></button>
      <a href="my-uploads.html" style="display:block;text-align:center;font-size:12px;color:var(--ink-muted);margin-top:12px;">View all my uploads</a>
    </div>
  </div>
</div>`;

export async function mount({ supabase, timers: __t, document }) {

  // --- Fill these in from your Supabase project settings ---
  const LISTING_FEE_TEXT = 'K50'; // shown in the pay instructions, adjust as needed
  // -----------------------------------------------------------
  // Toggles a primary button between its normal label and a spinner + label,
  // and disables it while a request is in flight (prevents double-submits).
  function setButtonLoading(btn, loading, loadingLabel) {
    const label = btn.querySelector('span');
    if (loading) {
      btn.dataset.originalLabel = label.textContent;
      label.textContent = loadingLabel;
      btn.insertAdjacentHTML('afterbegin', '<span class="spinner"></span>');
      btn.disabled = true;
    } else {
      const spinner = btn.querySelector('.spinner');
      if (spinner) spinner.remove();
      if (btn.dataset.originalLabel) label.textContent = btn.dataset.originalLabel;
      btn.disabled = false;
    }
  }

  const form = document.getElementById('upload-form');
  const statusLine = document.getElementById('status-line');
  const submitBtn = document.getElementById('submit-btn');

  let selectedType = 'track';
  let isFree = true;

  // Beat license tiers: shown only once the database upgrade (supabase/beat-licensing.sql) has been run.
  let licensingOn = false;
  function syncTiersUi() {
    const useTiers = selectedType === 'beat' && licensingOn;
    document.getElementById('tiers-field').classList.toggle('hidden', !useTiers);
    document.getElementById('price-field').classList.toggle('hidden', useTiers);
  }
  licensingEnabled().then((on) => { licensingOn = on; if (on) loadCssOnce('app/css/licensing.css'); syncTiersUi(); });
  function collectTiers() {
    const out = {}; const extras = document.getElementById('offer-extras').checked;
    for (const key of ['basic', 'premium', 'exclusive']) {
      const row = document.querySelector(`[data-tier-row="${key}"]`);
      if (!row.querySelector('[data-tier-on]').checked) continue;
      const price = Math.round(Number(row.querySelector('[data-tier-price]').value || 0));
      if (!(price > 0)) return { error: `Set a price for the ${TIERS[key].label}.` };
      out[key] = key === 'basic' ? { price } : { price, extras };
    }
    if (!Object.keys(out).length) return { error: 'Choose at least one license and set its price.' };
    return { tiers: out };
  }

  // Optional song licenses: shown for tracks only once the database upgrade (supabase/song-licensing.sql) has been run.
  let songLicOn = false, songLicForm = null;
  function syncSongLicUi() {
    document.getElementById('song-lic-field').classList.toggle('hidden', !(selectedType === 'track' && songLicOn));
  }
  songLicensingEnabled().then((on) => { songLicOn = on; if (on) loadCssOnce('app/css/licensing.css'); syncSongLicUi(); });
  document.getElementById('song-lic-offer').addEventListener('change', (e) => {
    const box = document.getElementById('song-lic-form');
    if (e.target.checked && !songLicForm) { songLicForm = createSongLicenseForm({ idPrefix: 'up' }); box.append(songLicForm.el); }
    box.classList.toggle('hidden', !e.target.checked);
  });
  const wantsSongLic = () => selectedType === 'track' && songLicOn && document.getElementById('song-lic-offer').checked && !!songLicForm;

  // Type toggle
  document.querySelectorAll('.type-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-toggle button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedType = btn.dataset.type;
      document.getElementById('bpm-field').classList.toggle('hidden', selectedType !== 'beat');
      // Beats are always paid — hide the Free/Paid toggle and force paid
      const priceField = document.getElementById('price-field');
      if (selectedType === 'beat') {
        priceField.querySelectorAll('.price-toggle button').forEach(b => b.classList.remove('active'));
        priceField.querySelector('[data-free="false"]').classList.add('active');
        isFree = false;
        document.getElementById('amount-field').classList.remove('hidden');
      }
      syncTiersUi();
      syncSongLicUi();
      maybeShowWaveform();
    });
  });

  // Free/Paid toggle
  document.querySelectorAll('.price-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (selectedType === 'beat') return; // beats always paid
      document.querySelectorAll('.price-toggle button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      isFree = btn.dataset.free === 'true';
      document.getElementById('amount-field').classList.toggle('hidden', isFree);
      maybeShowWaveform();
    });
  });

  // File pickers
  function wireFileDrop(dropId, inputId, labelWhenFilled) {
    const drop = document.getElementById(dropId);
    const input = document.getElementById(inputId);
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files[0]) {
        drop.textContent = input.files[0].name;
        drop.classList.add('filled');
      }
    });
  }
  wireFileDrop('cover-drop', 'cover-input');
  wireFileDrop('audio-drop', 'audio-input');

  document.getElementById('price-info-btn').addEventListener('click', () => {
    document.getElementById('price-info').classList.toggle('hidden');
  });

  // --- Waveform preview selector (beats only) ---
  let decodedBuffer = null;

  // --- Beat preview watermark ---
  // Upload a short (~1-1.5s) audio stinger somewhere public (e.g. a
  // "public-previews" or dedicated "assets" bucket in Supabase) and paste
  // its public URL below. This plays on a loop through the *full* beat
  // preview so buyers can hear the whole arrangement without being able to
  // lift a clean, usable copy. Leave BEAT_TAG_URL empty to skip tagging
  // (preview will just be the full beat, downsampled).
  const BEAT_TAG_URL = 'https://tradvpjpxshngjemnoaq.supabase.co/storage/v1/object/public/public-previews/0.mp3';
  const BEAT_TAG_INTERVAL = 45; // seconds between tag repeats
  const BEAT_TAG_OFFSET = 10; // seconds before the first tag plays
  const BEAT_TAG_GAIN = 0.55; // 0-1: how loud the tag is relative to the beat when it plays
  const BEAT_PREVIEW_SAMPLE_RATE = 22050; // downsample beat previews to keep upload size reasonable
  let previewStartSeconds = 0;
  const PREVIEW_LENGTH = 30;

  const waveformField = document.getElementById('waveform-field');
  const waveformCanvas = document.getElementById('waveform-canvas');
  const previewWindow = document.getElementById('preview-window');
  const previewSlider = document.getElementById('preview-start-slider');
  const previewRangeLabel = document.getElementById('preview-range-label');

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function drawWaveform(buffer) {
    const ctx = waveformCanvas.getContext('2d');
    const width = waveformCanvas.width;
    const height = waveformCanvas.height;
    ctx.clearRect(0, 0, width, height);

    // Mix down to mono
    const channels = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
    const length = channels[0].length;

    const samplesPerPixel = Math.max(1, Math.floor(length / width));
    ctx.fillStyle = '#9aa39c';
    const mid = height / 2;

    for (let x = 0; x < width; x++) {
      const start = x * samplesPerPixel;
      let min = 0, max = 0;
      for (let i = 0; i < samplesPerPixel; i++) {
        let sampleSum = 0;
        for (let ch = 0; ch < channels.length; ch++) sampleSum += channels[ch][start + i] || 0;
        const sample = sampleSum / channels.length;
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
      const y1 = mid + min * mid;
      const y2 = mid + max * mid;
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
  }

  function updatePreviewWindowPosition() {
    const duration = decodedBuffer ? decodedBuffer.duration : 0;
    if (!duration) return;
    const width = waveformCanvas.clientWidth;
    const startPx = (previewStartSeconds / duration) * width;
    const windowSeconds = Math.min(PREVIEW_LENGTH, duration);
    const windowPx = (windowSeconds / duration) * width;
    previewWindow.style.left = `${startPx}px`;
    previewWindow.style.width = `${windowPx}px`;
    previewRangeLabel.textContent = `${formatTime(previewStartSeconds)} – ${formatTime(Math.min(previewStartSeconds + PREVIEW_LENGTH, duration))}`;
  }

  previewSlider.addEventListener('input', () => {
    previewStartSeconds = Number(previewSlider.value);
    updatePreviewWindowPosition();
  });

  function needsPreview() {
    return selectedType === 'beat' || (selectedType === 'track' && !isFree);
  }

  async function maybeShowWaveform() {
    const audioFile = document.getElementById('audio-input').files[0];
    if (!needsPreview() || !audioFile) {
      waveformField.classList.add('hidden');
      decodedBuffer = null;
      return;
    }
    waveformField.classList.remove('hidden');
    const arrayBuffer = await audioFile.arrayBuffer();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    audioCtx.close();

    drawWaveform(decodedBuffer);
    const waveformLabel = document.querySelector('#waveform-field label');

    if (selectedType === 'beat') {
      // Beats preview the whole track (with a watermark tag) — no clip to pick.
      waveformLabel.textContent = 'Preview';
      previewWindow.classList.add('hidden');
      previewSlider.classList.add('hidden');
      previewRangeLabel.textContent = 'Buyers hear the whole beat with a repeating watermark tag — no clip to choose.';
      return;
    }

    waveformLabel.textContent = 'Choose preview section (30s)';
    previewWindow.classList.remove('hidden');
    previewSlider.classList.remove('hidden');
    previewStartSeconds = 0;
    const maxStart = Math.max(0, decodedBuffer.duration - PREVIEW_LENGTH);
    previewSlider.min = 0;
    previewSlider.max = maxStart;
    previewSlider.value = 0;
    previewSlider.disabled = maxStart === 0;
    updatePreviewWindowPosition();
  }

  document.getElementById('audio-input').addEventListener('change', maybeShowWaveform);

  function setStatus(msg, isError = false) {
    statusLine.textContent = msg;
    statusLine.classList.toggle('error', isError);
  }

  function genRef(prefix) {
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${prefix}-${rand}`;
  }

  // Trim a window of an already-decoded AudioBuffer and return a WAV Blob
  function trimBufferToWav(buffer, startSeconds, seconds = 30) {
    const sampleRate = buffer.sampleRate;
    const startFrame = Math.floor(startSeconds * sampleRate);
    const frameCount = Math.min(buffer.length - startFrame, sampleRate * seconds);
    const AudioCtxForBuffer = window.AudioContext || window.webkitAudioContext;
    const tmpCtx = new AudioCtxForBuffer();
    const trimmed = tmpCtx.createBuffer(buffer.numberOfChannels, frameCount, sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      trimmed.copyToChannel(buffer.getChannelData(ch).slice(startFrame, startFrame + frameCount), ch);
    }
    tmpCtx.close();
    return audioBufferToWav(trimmed);
  }

  // Minimal WAV encoder (16-bit PCM)
  function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numChannels * 2 + 44;
    const arrBuf = new ArrayBuffer(length);
    const view = new DataView(arrBuf);

    const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };

    writeStr(0, 'RIFF');
    view.setUint32(4, length - 8, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, length - 44, true);

    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([arrBuf], { type: 'audio/wav' });
  }

  // Resample (and optionally remix channel count of) an AudioBuffer using
  // OfflineAudioContext, which does proper interpolation (much better than
  // naive sample-dropping) and handles stereo<->mono conversion for free.
  async function resampleBuffer(buffer, targetSampleRate, targetChannels) {
    const channels = targetChannels || buffer.numberOfChannels;
    const frameCount = Math.ceil(buffer.duration * targetSampleRate);
    const offline = new OfflineAudioContext(channels, frameCount, targetSampleRate);
    const src = offline.createBufferSource();
    src.buffer = buffer;
    src.connect(offline.destination);
    src.start();
    return offline.startRendering();
  }

  // Fetches and decodes the watermark tag once, cached at the sample rate
  // it's needed at (so it lines up sample-for-sample when mixed in).
  let cachedTagBuffer = null;
  let cachedTagRate = null;
  async function loadTagBuffer(targetSampleRate) {
    if (cachedTagBuffer && cachedTagRate === targetSampleRate) return cachedTagBuffer;
    const res = await fetch(BEAT_TAG_URL);
    if (!res.ok) throw new Error('Could not fetch watermark tag audio');
    const arrayBuffer = await res.arrayBuffer();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    ctx.close();
    const resampled = decoded.sampleRate === targetSampleRate
      ? decoded
      : await resampleBuffer(decoded, targetSampleRate, decoded.numberOfChannels);
    cachedTagBuffer = resampled;
    cachedTagRate = targetSampleRate;
    return resampled;
  }

  // Loops `tagBuffer` on top of `buffer` every `intervalSeconds`, ducking the
  // underlying beat under each tag hit so it stays clearly audible.
  function mixTagRepeating(buffer, tagBuffer, intervalSeconds, gain, offsetSeconds = 0) {
    const sampleRate = buffer.sampleRate;
    const numChannels = buffer.numberOfChannels;
    const AudioCtxForBuffer = window.AudioContext || window.webkitAudioContext;
    const tmpCtx = new AudioCtxForBuffer();
    const out = tmpCtx.createBuffer(numChannels, buffer.length, sampleRate);
    const intervalFrames = Math.floor(intervalSeconds * sampleRate);
    const offsetFrames = Math.floor(offsetSeconds * sampleRate);
    const tagFrames = tagBuffer.length;
    for (let ch = 0; ch < numChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = out.getChannelData(ch);
      dst.set(src);
      const tagCh = tagBuffer.getChannelData(Math.min(ch, tagBuffer.numberOfChannels - 1));
      for (let start = offsetFrames; start < dst.length; start += intervalFrames) {
        for (let i = 0; i < tagFrames && start + i < dst.length; i++) {
          dst[start + i] = Math.max(-1, Math.min(1, dst[start + i] * (1 - gain) + tagCh[i] * gain));
        }
      }
    }
    tmpCtx.close();
    return out;
  }

  // Builds a full-length, watermarked, size-reduced preview for a beat.
  // Falls back to an un-tagged (but still downsampled) preview if the tag
  // asset isn't configured or fails to load, so uploads never break on it.
  async function buildBeatPreview(fullBuffer) {
    const shrunk = await resampleBuffer(fullBuffer, BEAT_PREVIEW_SAMPLE_RATE, 1);
    if (!BEAT_TAG_URL) return audioBufferToWav(shrunk);
    try {
      const tag = await loadTagBuffer(BEAT_PREVIEW_SAMPLE_RATE);
      const tagged = mixTagRepeating(shrunk, tag, BEAT_TAG_INTERVAL, BEAT_TAG_GAIN, BEAT_TAG_OFFSET);
      return audioBufferToWav(tagged);
    } catch (err) {
      console.error('Watermark tag failed, uploading un-tagged preview:', err);
      return audioBufferToWav(shrunk);
    }
  }

  async function getAudioDuration(file) {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => resolve(Math.round(audio.duration));
      audio.src = URL.createObjectURL(file);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setButtonLoading(submitBtn, true, 'Uploading…');
    setStatus('Checking your session…');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setStatus('Please log in before uploading.', true);
      setButtonLoading(submitBtn, false);
      return;
    }

    // This page is artist-only — account type is chosen explicitly at login,
    // not auto-assigned just by visiting this page.
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile || profile.role !== 'artist') {
      setStatus('This page is for artists. Log in with an Artist account to upload.', true);
      setButtonLoading(submitBtn, false);
      return;
    }

    const title = document.getElementById('title').value.trim();
    const genre = document.getElementById('genre').value;
    const bpm = document.getElementById('bpm').value || null;
    const useTiers = selectedType === 'beat' && licensingOn;
    const tiersResult = useTiers ? collectTiers() : null;
    const price = useTiers
      ? (tiersResult.tiers ? Math.min(...Object.values(tiersResult.tiers).map((t) => t.price)) : 0)
      : (isFree ? 0 : Number(document.getElementById('price').value || 0));
    const coverFile = document.getElementById('cover-input').files[0];
    const audioFile = document.getElementById('audio-input').files[0];

    if (!title || !genre || !audioFile) {
      setStatus('Please fill in title, genre, and choose an audio file.', true);
      setButtonLoading(submitBtn, false);
      return;
    }
    let extrasLink = '', musicKey = '', tagList = [];
    if (useTiers) {
      if (tiersResult.error) { setStatus(tiersResult.error, true); setButtonLoading(submitBtn, false); return; }
      extrasLink = document.getElementById('extras-link').value.trim();
      if (extrasLink && !/^https?:\/\/\S+$/i.test(extrasLink)) { setStatus('The WAV / stems link must start with https://', true); setButtonLoading(submitBtn, false); return; }
      if (!document.getElementById('rights-confirm').checked) { setStatus('Please confirm you made this beat or have the right to license it.', true); setButtonLoading(submitBtn, false); return; }
      musicKey = document.getElementById('music-key').value.trim().slice(0, 20);
      tagList = [...new Set(document.getElementById('beat-tags').value.split(',').map((t) => t.trim().toLowerCase().slice(0, 20)).filter(Boolean))].slice(0, 6);
    }
    let songLicResult = null;
    if (wantsSongLic()) {
      songLicResult = songLicForm.collect();
      if (songLicResult.error) { setStatus(songLicResult.error, true); setButtonLoading(submitBtn, false); return; }
    }
    if (!isFree && (!price || price <= 0)) {
      setStatus('Please set a price.', true);
      setButtonLoading(submitBtn, false);
      return;
    }

    try {
      const ts = Date.now();
      const ext = audioFile.name.split('.').pop();

      // 1. Cover image (optional) -> public-previews
      let coverUrl = null;
      if (coverFile) {
        setStatus('Uploading cover image…');
        const coverExt = coverFile.name.split('.').pop();
        const coverPath = `${user.id}/cover-${ts}.${coverExt}`;
        const { error: coverErr } = await supabase.storage
          .from('public-previews')
          .upload(coverPath, coverFile, { cacheControl: '31536000' });
        if (coverErr) throw coverErr;
        coverUrl = supabase.storage.from('public-previews').getPublicUrl(coverPath).data.publicUrl;
      }

      // 2. Full audio file. Free tracks go to public-previews (so they're
      // instantly downloadable by anyone); paid tracks and beats go to
      // private-full (gated behind a purchase and a signed URL).
      setStatus('Uploading audio file…');
      const fullPath = `${user.id}/${ts}-full.${ext}`;
      const fullBucket = (selectedType === 'track' && isFree) ? 'public-previews' : 'private-full';
      const { error: fullErr } = await supabase.storage
        .from(fullBucket)
        .upload(fullPath, audioFile, { cacheControl: '31536000' });
      if (fullErr) throw fullErr;

      const duration = decodedBuffer ? Math.round(decodedBuffer.duration) : await getAudioDuration(audioFile);

      // 3. Preview clip -> public-previews, trimmed from the user's chosen
      // start point. Applies to beats and paid tracks (free tracks don't
      // need one — the full file is already public).
      let previewPath = null;
      if (selectedType === 'beat' || (selectedType === 'track' && !isFree)) {
        const bufferForTrim = decodedBuffer || await (async () => {
          const ab = await audioFile.arrayBuffer();
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          const ctx = new AudioCtx();
          const b = await ctx.decodeAudioData(ab);
          ctx.close();
          return b;
        })();

        let previewBlob;
        if (selectedType === 'beat') {
          setStatus('Adding preview watermark… this can take a few seconds');
          previewBlob = await buildBeatPreview(bufferForTrim);
        } else {
          setStatus('Trimming preview clip…');
          previewBlob = trimBufferToWav(bufferForTrim, previewStartSeconds, PREVIEW_LENGTH);
        }
        previewPath = `${user.id}/${ts}-preview.wav`;
        const { error: previewErr } = await supabase.storage
          .from('public-previews')
          .upload(previewPath, previewBlob, { cacheControl: '31536000' });
        if (previewErr) throw previewErr;
      }

      // 4. Insert DB row with a reference number, retrying on collision
      setStatus('Saving…');
      const table = selectedType === 'beat' ? 'beats' : 'tracks';
      const prefix = selectedType === 'beat' ? 'BEAT' : 'TRK';
      // what the file itself says (title, artist, copyright, ISRC...), saved for the admin reviewing it.
      // Only when supabase/upload-tags.sql has been run; a failure here never blocks the upload.
      let fileTags = null;
      try { if (await uploadTagsEnabled(supabase)) fileTags = await readAudioTags(audioFile); } catch (e) { console.error(e); }
      let insertedRow = null;
      for (let attempt = 0; attempt < 5 && !insertedRow; attempt++) {
        const reference_number = genRef(prefix);
        const payload = selectedType === 'beat'
          ? { owner_id: user.id, title, genre, bpm: bpm ? Number(bpm) : null, price, preview_path: previewPath, full_path: fullPath, cover_url: coverUrl, ...(useTiers ? { license_tiers: tiersResult.tiers, music_key: musicKey || null, tags: tagList.length ? tagList : null, rights_confirmed: true } : {}), status: 'pending_payment', reference_number, duration_seconds: duration }
          : { owner_id: user.id, title, genre, is_free: isFree, price, preview_path: previewPath, file_path: fullPath, cover_url: coverUrl, ...(songLicResult ? { license_tiers: songLicResult.tiers, license_rights_confirmed: true } : {}), status: 'pending_payment', reference_number, duration_seconds: duration };

        if (fileTags) payload.upload_tags = fileTags;
        const { data, error } = await supabase.from(table).insert(payload).select().single();
        if (!error) { insertedRow = data; break; }
        if (error.code !== '23505') throw error; // not a reference-number collision, give up
      }
      if (!insertedRow) throw new Error('Could not generate a unique reference number, please try again.');

      if (useTiers && extrasLink) {
        // Private link for Premium/Exclusive buyers (RLS-protected table); a failure here must not block the upload.
        try {
          const { error: exErr } = await supabase.from('beat_extras').insert({ beat_id: String(insertedRow.id), link: extrasLink });
          if (exErr) { console.error(exErr); setStatus("Beat uploaded, but the stems link couldn't be saved. Add it later in My Uploads.", true); }
        } catch (e) { console.error(e); }
      }

      // 5. Show the pending-payment card
      showPendingCard(insertedRow, table);
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Something went wrong, please try again.', true);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  function showPendingCard(row, table) {
    form.classList.add('hidden');
    const card = document.getElementById('pending-card');
    card.classList.remove('hidden');
    document.getElementById('pending-title').textContent = row.title;
    document.getElementById('ref-number').textContent = row.reference_number;
    document.querySelector('.pay-instructions').innerHTML =
      `Send <strong>${LISTING_FEE_TEXT}</strong> to <strong>0573678363</strong> using <strong>Send Money</strong> (not Withdraw, so there's no extra charge). Then paste your payment SMS below.`;

    const statusLabel = document.getElementById('pending-status-label');
    const reviewFlow = document.getElementById('review-flow');
    const approvedFlow = document.getElementById('approved-flow');
    const smsInput = document.getElementById('sms-input');
    const smsSubmitBtn = document.getElementById('sms-submit-btn');
    const smsStatus = document.getElementById('sms-status-line');
    const doneMsg = document.getElementById('done-msg');

    let submitting = false;

    function renderPendingPayment(wasRejected) {
      statusLabel.textContent = wasRejected ? 'Payment not confirmed — please try again' : 'Awaiting payment';
      reviewFlow.classList.remove('hidden');
      approvedFlow.classList.add('hidden');
      smsInput.value = '';
      smsInput.classList.remove('hidden');
      smsSubmitBtn.classList.remove('hidden');
      setButtonLoading(smsSubmitBtn, false);
      doneMsg.classList.add('hidden');
      smsStatus.textContent = '';
      smsStatus.classList.remove('error');
    }

    function renderPendingReview() {
      statusLabel.textContent = 'Pending review';
      reviewFlow.classList.remove('hidden');
      approvedFlow.classList.add('hidden');
      smsInput.classList.add('hidden');
      smsSubmitBtn.classList.add('hidden');
      smsStatus.textContent = '';
      doneMsg.classList.remove('hidden');
    }

    function renderApproved() {
      statusLabel.textContent = 'Live';
      reviewFlow.classList.add('hidden');
      approvedFlow.classList.remove('hidden');
    }

    smsSubmitBtn.addEventListener('click', async () => {
      if (submitting) return;
      const smsText = smsInput.value.trim();
      if (!smsText) {
        smsStatus.textContent = 'Please paste your confirmation SMS.';
        smsStatus.classList.add('error');
        return;
      }
      submitting = true;
      setButtonLoading(smsSubmitBtn, true, 'Submitting…');
      smsStatus.textContent = '';
      smsStatus.classList.remove('error');
      const { error } = await supabase.from(table)
        .update({ transaction_sms: smsText, status: 'pending_review' })
        .eq('id', row.id);
      submitting = false;
      if (error) {
        smsStatus.textContent = error.message;
        smsStatus.classList.add('error');
        setButtonLoading(smsSubmitBtn, false);
        return;
      }
      renderPendingReview();
    });

    // Live status tracking — so this page updates the moment an admin
    // approves or rejects, without the artist needing to refresh (which
    // would otherwise just land them on a blank new upload form).
    supabase
      .channel(`upload-status-${row.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table,
        filter: `id=eq.${row.id}`,
      }, (payload) => {
        const newStatus = payload.new.status;
        if (newStatus === 'approved') {
          renderApproved();
        } else if (newStatus === 'pending_payment') {
          renderPendingPayment(true);
        } else if (newStatus === 'pending_review') {
          renderPendingReview();
        }
      })
      .subscribe();

    document.getElementById('upload-another-btn').addEventListener('click', () => {
      __reload();
    });

    renderPendingPayment(false);
  }

}
