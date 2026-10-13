// Adapter view generated from legacy/original/login.html (tools/convert-page.mjs).
// Page logic is unchanged; the shared Supabase client, router navigation and timer cleanup are injected.
import { navigate as __navigate, reload as __reload } from '../lib/router.js';

export const title = "Log in — Music Platform";
export const css = 'css/views/login.css';
export const markup = `<div class="bg-blobs" aria-hidden="true">
  <div class="blob blob-1"></div>
  <div class="blob blob-2"></div>
  <div class="blob blob-3"></div>
</div>

<div class="wrap">
  <div class="eq" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
  <h1>Log in</h1>
  <p class="sub">Enter your phone number to get a one-time code.</p>

  <div class="card" id="type-card">
    <button type="button" class="type-toggle-btn active" data-role="listener">I'm a Listener</button>
    <button type="button" class="type-toggle-btn" data-role="artist">I'm an Artist</button>
  </div>

  <!-- Step 1: phone number -->
  <div id="phone-card" class="card">
    <label for="phone-input">Phone number</label>
    <input type="tel" id="phone-input" placeholder="0971234567" />
    <button type="button" class="primary" id="send-code-btn"><span>Send code</span></button>
    <p class="status-line" id="phone-status"></p>
  </div>

  <!-- Step 2: OTP code -->
  <div id="otp-card" class="card hidden">
    <label for="otp-input">Enter the 6-digit code</label>
    <input type="text" id="otp-input" inputmode="numeric" maxlength="6" placeholder="123456" />
    <button type="button" class="primary" id="verify-btn"><span>Verify</span></button>
    <button type="button" class="link" id="change-number-btn">Use a different number</button>
    <p class="status-line" id="otp-status"></p>
  </div>

  <!-- Success -->
  <div id="success-card" class="card success-card hidden">
    <div class="check-circle"><svg viewBox="0 0 24 24"><polyline points="4 12 9 17 20 6"/></svg></div>
    <p>You're logged in.</p>
    <button type="button" class="primary" id="go-to-upload-btn"><span>Continue</span></button>
  </div>
</div>`;

export async function mount({ supabase, timers: __t, document }) {
  const phoneCard = document.getElementById('phone-card');
  const otpCard = document.getElementById('otp-card');
  const successCard = document.getElementById('success-card');

  const phoneInput = document.getElementById('phone-input');
  const otpInput = document.getElementById('otp-input');
  const phoneStatus = document.getElementById('phone-status');
  const otpStatus = document.getElementById('otp-status');

  const sendCodeBtn = document.getElementById('send-code-btn');
  const verifyBtn = document.getElementById('verify-btn');

  let currentPhone = '';
  let selectedRole = 'listener';

  document.querySelectorAll('.type-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRole = btn.dataset.role;
    });
  });

  // Toggles a primary button between its normal label and a spinner + label,
  // and disables it while a request is in flight (prevents double-submits,
  // e.g. someone tapping "Send code" twice before the first request returns).
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

  // Normalizes 0XXXXXXXXX, XXXXXXXXX, 260XXXXXXXXX, +260XXXXXXXXX -> +260XXXXXXXXX
  function normalizeZambianPhone(raw) {
    const cleaned = raw.trim().replace(/[\s\-()]/g, '');
    let normalized = null;
    if (cleaned.startsWith('+260')) {
      normalized = cleaned;
    } else if (cleaned.startsWith('260')) {
      normalized = '+' + cleaned;
    } else if (cleaned.startsWith('0')) {
      normalized = '+260' + cleaned.slice(1);
    } else if (/^\d{9}$/.test(cleaned)) {
      normalized = '+260' + cleaned;
    }
    // A valid normalized Zambian number is +260 followed by exactly 9 digits
    if (normalized && /^\+260\d{9}$/.test(normalized)) return normalized;
    return null;
  }

  // If already logged in, skip straight to success — fetching the actual
  // stored role first (previously this called showSuccess() with no role,
  // which always fell back to "Go to Browse" even for artists).
  (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: existingProfile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      showSuccess(existingProfile?.role);
    }
  })();

  sendCodeBtn.addEventListener('click', async () => {
    const rawPhone = phoneInput.value.trim();
    const phone = normalizeZambianPhone(rawPhone);
    if (!phone) {
      phoneStatus.textContent = 'Enter a valid Zambian number, e.g. 0971234567 or +260971234567';
      phoneStatus.classList.add('error');
      return;
    }
    phoneStatus.textContent = '';
    phoneStatus.classList.remove('error');
    setButtonLoading(sendCodeBtn, true, 'Sending…');

    const { error } = await supabase.auth.signInWithOtp({ phone });
    setButtonLoading(sendCodeBtn, false);

    if (error) {
      phoneStatus.textContent = error.message;
      phoneStatus.classList.add('error');
      return;
    }

    currentPhone = phone;
    phoneCard.classList.add('hidden');
    otpCard.classList.remove('hidden');
    otpInput.focus();
  });

  verifyBtn.addEventListener('click', async () => {
    const token = otpInput.value.trim();
    if (token.length !== 6) {
      otpStatus.textContent = 'Enter the 6-digit code from the SMS.';
      otpStatus.classList.add('error');
      return;
    }
    otpStatus.textContent = '';
    otpStatus.classList.remove('error');
    setButtonLoading(verifyBtn, true, 'Verifying…');

    const { data, error } = await supabase.auth.verifyOtp({
      phone: currentPhone,
      token,
      type: 'sms',
    });

    setButtonLoading(verifyBtn, false);

    if (error) {
      otpStatus.textContent = error.message;
      otpStatus.classList.add('error');
      return;
    }

    // First login for this user — make sure they have a profile row,
    // using whichever account type they selected above. Returning users
    // keep their existing stored role regardless of what's selected here
    // (the toggle only decides brand-new signups).
    const user = data.user;
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    let finalRole = 'listener';
    if (!existingProfile) {
      await supabase.from('profiles').insert({ id: user.id, role: selectedRole });
      finalRole = selectedRole;
    } else {
      finalRole = existingProfile.role;
    }

    showSuccess(finalRole);
  });

  document.getElementById('change-number-btn').addEventListener('click', () => {
    otpCard.classList.add('hidden');
    phoneCard.classList.remove('hidden');
    otpInput.value = '';
    otpStatus.textContent = '';
  });

  document.getElementById('go-to-upload-btn').addEventListener('click', () => {
    __navigate(document.getElementById('go-to-upload-btn').dataset.href || 'browse.html');
  });

  function showSuccess(role) {
    phoneCard.classList.add('hidden');
    otpCard.classList.add('hidden');
    successCard.classList.remove('hidden');
    const goBtn = document.getElementById('go-to-upload-btn');
    const label = goBtn.querySelector('span');
    if (role === 'artist') {
      label.textContent = 'Go to Upload';
      goBtn.dataset.href = 'upload.html';
    } else {
      label.textContent = 'Go to Browse';
      goBtn.dataset.href = 'browse.html';
    }
  }

}
