/*
  ZAMI APP DOWNLOAD CONFIG
  ------------------------
  Edit ONLY the line below. Everything else (the popup, the download
  page) reads from this file, so you only have to update the link
  in one place whenever you publish a new APK build.

  How to get this URL:
  1. In your GitHub repo, go to the "Releases" tab -> "Draft a new release".
  2. Upload your .apk file as a release asset and publish the release.
  3. Right-click (or long-press on mobile) the asset's file name and
     copy its link. It will look like:
     https://github.com/<you>/<repo>/releases/download/v1.0/zami.apk
  4. Paste it below, replacing the placeholder.

  Tip: if you always want the LATEST release without editing this file
  every time, you can instead use:
     https://github.com/<you>/<repo>/releases/latest/download/zami.apk
  (this requires your release asset to always be named exactly the same,
  e.g. always "zami.apk").
*/
window.ZAMI_APK_URL = "https://github.com/YOUR-USERNAME/YOUR-REPO/releases/latest/download/zami.apk";

// Optional: bump this when you release a new version so the download
// page can display it (purely cosmetic, doesn't affect the link above).
window.ZAMI_APK_VERSION = "1.0.0";
