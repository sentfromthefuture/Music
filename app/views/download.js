// Adapter view generated from legacy/original/download.html (tools/convert-page.mjs).
// Page logic is unchanged; the shared Supabase client, router navigation and timer cleanup are injected.
import { navigate as __navigate, reload as __reload } from '../lib/router.js';
import { loadScriptOnce as __loadScript } from '../lib/dom.js';

export const title = "Get the Zami App";
export const css = 'css/views/download.css';
export const markup = `<div class="wrap">

  <div class="logo-row">
    <div class="logo-mark">Z</div>
    <div>
      <p class="logo-word">ZAMI</p>
      <p class="logo-tag">WHERE ZAMBIA SOUNDS</p>
    </div>
  </div>

  <h1>Take Zami with you.</h1>
  <p class="lede">Download the Android app to browse, preview and download local tracks and beats — no browser tabs, quicker downloads, right from your home screen.</p>

  <div class="download-card">
    <div class="download-meta">
      <span>Android</span>
      <span id="version-label">Version —</span>
    </div>
    <a id="download-btn" href="#" download>Download for Android</a>
    <p class="file-note">.apk file · installs outside the Play Store</p>
  </div>

  <ul class="features">
    <li>Browse tracks and beats from Zambian artists</li>
    <li>Preview beats before producers list them for sale</li>
    <li>Faster downloads with progress you can track</li>
    <li>Works well on slower connections</li>
  </ul>

  <div class="steps">
    <h2>After it downloads</h2>
    <ol>
      <li>Open the downloaded file from your notifications or Downloads folder</li>
      <li>If prompted, allow <span>"Install unknown apps"</span> for your browser — this is normal for apps installed outside the Play Store</li>
      <li>Tap Install, then open Zami</li>
    </ol>
  </div>

  <footer>Zami is not on the Google Play Store yet. This file is safe — it's the same app, built and shared directly by Zami.</footer>
</div>`;

export async function mount({ supabase, timers: __t, document }) {
  await __loadScript(new URL('../../zami-download-config.js', import.meta.url).href);

  var url = window.ZAMI_APK_URL || "#";
  document.getElementById("download-btn").setAttribute("href", url);
  if (window.ZAMI_APK_VERSION) {
    document.getElementById("version-label").textContent = "Version " + window.ZAMI_APK_VERSION;
  }

}
