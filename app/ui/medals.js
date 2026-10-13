// Static gold/silver/bronze rank-badge SVG symbols (copied unchanged from the original browse page).
export const MEDAL_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="medalGoldGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff6d9"/>
      <stop offset="45%" stop-color="#f4bb3f"/>
      <stop offset="100%" stop-color="#a1690c"/>
    </linearGradient>
    <linearGradient id="medalSilverGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="45%" stop-color="#cad2d8"/>
      <stop offset="100%" stop-color="#767f88"/>
    </linearGradient>
    <linearGradient id="medalBronzeGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f3d0a6"/>
      <stop offset="45%" stop-color="#c1803f"/>
      <stop offset="100%" stop-color="#6f451e"/>
    </linearGradient>

    <path id="shieldPath" d="M24 3 L43 10 V27 C43 41 34 51 24 55 C14 51 5 41 5 27 V10 Z"/>
    <clipPath id="shieldClip"><use href="#shieldPath"/></clipPath>
    <g id="crownShape">
      <path d="M11 15 L15 4 L20 11 L24 2 L28 11 L33 4 L37 15 Z"/>
      <rect x="11" y="15" width="26" height="4" rx="1"/>
    </g>
    <path id="leafShape" d="M0 0 C4 -1 7 2 5 6 C2 5 -1 3 0 0 Z"/>
  </defs>

  <symbol id="medal-badge-1" viewBox="0 0 48 56">
    <use href="#shieldPath" fill="url(#medalGoldGrad)" stroke="#7a5108" stroke-width="1.5"/>
    <g clip-path="url(#shieldClip)"><polygon points="4,12 25,1 34,9 9,26" fill="#ffffff" opacity="0.3"/></g>
    <g fill="#c98f1e">
      <use href="#leafShape" transform="translate(4,42) rotate(200)"/>
      <use href="#leafShape" transform="translate(2,34) rotate(215)"/>
      <use href="#leafShape" transform="translate(2,26) rotate(230)"/>
      <use href="#leafShape" transform="translate(4,18) rotate(245)"/>
    </g>
    <g fill="#c98f1e" transform="translate(48,0) scale(-1,1)">
      <use href="#leafShape" transform="translate(4,42) rotate(200)"/>
      <use href="#leafShape" transform="translate(2,34) rotate(215)"/>
      <use href="#leafShape" transform="translate(2,26) rotate(230)"/>
      <use href="#leafShape" transform="translate(4,18) rotate(245)"/>
    </g>
    <use href="#crownShape" fill="#f8dfa0" stroke="#7a5108" stroke-width="0.75"/>
    <text x="24" y="41" text-anchor="middle" font-size="21" font-weight="800" font-family="Arial, sans-serif" fill="#3c2400">1</text>
  </symbol>

  <symbol id="medal-badge-2" viewBox="0 0 48 56">
    <use href="#shieldPath" fill="url(#medalSilverGrad)" stroke="#5b6167" stroke-width="1.5"/>
    <g clip-path="url(#shieldClip)"><polygon points="4,12 25,1 34,9 9,26" fill="#ffffff" opacity="0.35"/></g>
    <g fill="#9aa3aa">
      <use href="#leafShape" transform="translate(4,42) rotate(200)"/>
      <use href="#leafShape" transform="translate(2,34) rotate(215)"/>
      <use href="#leafShape" transform="translate(2,26) rotate(230)"/>
      <use href="#leafShape" transform="translate(4,18) rotate(245)"/>
    </g>
    <g fill="#9aa3aa" transform="translate(48,0) scale(-1,1)">
      <use href="#leafShape" transform="translate(4,42) rotate(200)"/>
      <use href="#leafShape" transform="translate(2,34) rotate(215)"/>
      <use href="#leafShape" transform="translate(2,26) rotate(230)"/>
      <use href="#leafShape" transform="translate(4,18) rotate(245)"/>
    </g>
    <use href="#crownShape" fill="#eef1f3" stroke="#5b6167" stroke-width="0.75"/>
    <text x="24" y="41" text-anchor="middle" font-size="21" font-weight="800" font-family="Arial, sans-serif" fill="#2c3135">2</text>
  </symbol>

  <symbol id="medal-badge-3" viewBox="0 0 48 56">
    <use href="#shieldPath" fill="url(#medalBronzeGrad)" stroke="#4a2f14" stroke-width="1.5"/>
    <g clip-path="url(#shieldClip)"><polygon points="4,12 25,1 34,9 9,26" fill="#ffffff" opacity="0.25"/></g>
    <g fill="#8a5a2c">
      <use href="#leafShape" transform="translate(4,42) rotate(200)"/>
      <use href="#leafShape" transform="translate(2,34) rotate(215)"/>
      <use href="#leafShape" transform="translate(2,26) rotate(230)"/>
      <use href="#leafShape" transform="translate(4,18) rotate(245)"/>
    </g>
    <g fill="#8a5a2c" transform="translate(48,0) scale(-1,1)">
      <use href="#leafShape" transform="translate(4,42) rotate(200)"/>
      <use href="#leafShape" transform="translate(2,34) rotate(215)"/>
      <use href="#leafShape" transform="translate(2,26) rotate(230)"/>
      <use href="#leafShape" transform="translate(4,18) rotate(245)"/>
    </g>
    <use href="#crownShape" fill="#e3ad78" stroke="#4a2f14" stroke-width="0.75"/>
    <text x="24" y="41" text-anchor="middle" font-size="21" font-weight="800" font-family="Arial, sans-serif" fill="#2c1707">3</text>
  </symbol>
</svg>`;
