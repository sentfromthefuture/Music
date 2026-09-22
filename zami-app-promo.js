/*
  ZAMI APP PROMO POPUP
  ---------------------
  Include this on any page (after zami-download-config.js) to show a
  small "Get the Zami App" popup. It:
    - waits a couple seconds so it doesn't block the page loading
    - skips itself entirely if the page is already open inside the
      Zami Android app (see IS_INSIDE_APP check below)
    - won't nag: once someone dismisses it, it stays quiet for 14 days
    - "Download" starts the APK download immediately
    - "Learn more" sends them to the full download.html page instead
*/
(function () {
  // If you build the Android WebView app so it sets a custom user-agent
  // suffix (e.g. WebView.setUserAgentString(ua + " ZamiApp/1.0")), this
  // check will correctly hide the popup for people already using the app.
  var IS_INSIDE_APP = /ZamiApp/i.test(navigator.userAgent);
  if (IS_INSIDE_APP) return;

  var STORAGE_KEY = "zami_app_promo_dismissed_until";
  var SNOOZE_DAYS = 14;
  var SHOW_DELAY_MS = 2500;

  try {
    var dismissedUntil = localStorage.getItem(STORAGE_KEY);
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) return;
  } catch (e) { /* localStorage unavailable, just show it */ }

  function buildPopup() {
    var apkUrl = window.ZAMI_APK_URL || "download.html";

    var style = document.createElement("style");
    style.textContent = [
      "#zami-promo-backdrop{position:fixed;inset:0;background:rgba(20,24,28,0.45);z-index:9998;",
      "display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .25s ease;}",
      "#zami-promo-backdrop.show{opacity:1;}",
      "@media (min-width:480px){#zami-promo-backdrop{align-items:center;}}",
      "#zami-promo-card{width:100%;max-width:400px;background:#ffffff;border-radius:16px 16px 0 0;",
      "padding:20px 20px 24px;box-shadow:0 -8px 30px rgba(0,0,0,0.18);transform:translateY(24px);",
      "transition:transform .25s ease;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}",
      "@media (min-width:480px){#zami-promo-card{border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,0.22);}}",
      "#zami-promo-backdrop.show #zami-promo-card{transform:translateY(0);}",
      "#zami-promo-row{display:flex;align-items:center;gap:12px;margin-bottom:14px;}",
      "#zami-promo-icon{width:44px;height:44px;border-radius:12px;flex-shrink:0;",
      "background:linear-gradient(135deg,#1e6feb,#65a30d);display:flex;align-items:center;justify-content:center;",
      "color:#fff;font-weight:700;font-size:15px;}",
      "#zami-promo-title{font-size:15px;font-weight:700;color:#14181c;margin:0;}",
      "#zami-promo-sub{font-size:12px;color:#5b6560;margin:2px 0 0;}",
      "#zami-promo-close{margin-left:auto;background:none;border:none;color:#5b6560;font-size:18px;",
      "cursor:pointer;padding:4px;line-height:1;}",
      "#zami-promo-body{font-size:13px;color:#14181c;line-height:1.5;margin:0 0 16px;}",
      "#zami-promo-actions{display:flex;gap:10px;}",
      "#zami-promo-download{flex:1;background:#1e6feb;color:#fff;border:none;border-radius:10px;",
      "padding:12px;font-size:14px;font-weight:700;cursor:pointer;text-align:center;text-decoration:none;display:block;}",
      "#zami-promo-later{background:none;border:none;color:#5b6560;font-size:13px;cursor:pointer;padding:12px 4px;}"
    ].join("");
    document.head.appendChild(style);

    var backdrop = document.createElement("div");
    backdrop.id = "zami-promo-backdrop";
    backdrop.innerHTML =
      '<div id="zami-promo-card" role="dialog" aria-label="Get the Zami app">' +
        '<div id="zami-promo-row">' +
          '<div id="zami-promo-icon">Z</div>' +
          '<div>' +
            '<p id="zami-promo-title">Get the Zami app</p>' +
            '<p id="zami-promo-sub">Faster browsing, easier downloads</p>' +
          '</div>' +
          '<button id="zami-promo-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<p id="zami-promo-body">Install the Zami app for Android to browse, download and preview tracks without opening your browser every time.</p>' +
        '<div id="zami-promo-actions">' +
          '<button id="zami-promo-later">Maybe later</button>' +
          '<a id="zami-promo-download" href="' + apkUrl + '" download>Download</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(backdrop);

    requestAnimationFrame(function () {
      backdrop.classList.add("show");
    });

    function dismiss() {
      backdrop.classList.remove("show");
      setTimeout(function () { backdrop.remove(); }, 250);
      try {
        var until = Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
        localStorage.setItem(STORAGE_KEY, String(until));
      } catch (e) { /* ignore */ }
    }

    backdrop.querySelector("#zami-promo-close").addEventListener("click", dismiss);
    backdrop.querySelector("#zami-promo-later").addEventListener("click", dismiss);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) dismiss();
    });
    backdrop.querySelector("#zami-promo-download").addEventListener("click", function () {
      // Downloading counts as "converted" too, so stop nagging them.
      dismiss();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(buildPopup, SHOW_DELAY_MS);
    });
  } else {
    setTimeout(buildPopup, SHOW_DELAY_MS);
  }
})();
