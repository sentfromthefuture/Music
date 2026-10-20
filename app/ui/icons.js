// Inline SVG icons (static markup only — never built from user data).
const P = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  prev: 'M6 6h2v12H6zM9.5 12 18 6v12z',
  next: 'M16 6h2v12h-2zM6 18V6l8.5 6z',
  shuffle: 'M10.6 9.2 5.4 4 4 5.4l5.2 5.2 1.4-1.4zM14.5 4l2.1 2.1L4 18.6 5.4 20 18 7.4 20 9.5V4h-5.5zM14.8 13.4l-1.4 1.4 3.2 3.2L14.5 20H20v-5.5l-2.1 2.1-3.1-3.2z',
  repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
  'repeat-one': 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z',
  volume: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z',
  mute: 'M16.5 12A4.5 4.5 0 0 0 14 8v2.2l2.4 2.4c.1-.2.1-.4.1-.6zM19 12c0 .9-.2 1.8-.6 2.6l1.5 1.5A8.8 8.8 0 0 0 21 12c0-4.3-3-7.9-7-8.8v2.1c2.9.9 5 3.5 5 6.7zM4.3 3 3 4.3 7.7 9H3v6h4l5 5v-6.7l4.3 4.3c-.7.5-1.4.9-2.3 1.2v2.1a9 9 0 0 0 3.6-1.8l2.1 2.1 1.3-1.3L4.3 3zM12 4 9.9 6.1 12 8.2V4z',
  queue: 'M3 13h12v-2H3v2zm0-6h12V5H3v2zm0 12h8v-2H3v2zm14-8v6.2a3 3 0 1 0 2 2.8V13h3v-2h-5z',
  up: 'M7.4 15.4 12 10.8l4.6 4.6L18 14l-6-6-6 6z',
  down: 'M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z',
  close: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',
  alert: 'M12 2 1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z',
  retry: 'M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.3L13 11h7V4l-2.3 2.3z',
  browse: 'M12 3 2 12h3v8h6v-6h2v6h6v-8h3L12 3z',
  search: 'M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z',
  library: 'M4 6H2v14a2 2 0 0 0 2 2h14v-2H4V6zm16-4H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-2 9-3.5-2.1V15a2 2 0 1 1-1-1.7V6h4.5v3z',
  upload: 'M5 20h14v-2H5v2zm0-10h4v6h6v-6h4l-7-7-7 7z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z',
  note: 'M12 3v10.6A4 4 0 1 0 14 17V7h4V3h-6z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM11 1h2v3h-2zM11 20h2v3h-2zM1 11h3v2H1zM20 11h3v2h-3zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4zM16.3 17.7l1.4-1.4 2.1 2.1-1.4 1.4zM17.7 4.2l1.4 1.4-2.1 2.1-1.4-1.4zM5.6 19.8l-1.4-1.4 2.1-2.1 1.4 1.4z',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  heart: 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.8 5 6 5c1.9 0 3.4 1 4.4 2.3L12 9l1.6-1.7C14.6 6 16.1 5 18 5c3.2 0 5.1 3.4 3.6 6.8C19.5 16.4 12 21 12 21z',
};
export function icon(name, size = 24) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false" fill="currentColor"><path d="${P[name] || ''}"/></svg>`;
}
export const spinner = '<svg class="zs-spin" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="42 100"/></svg>';
