// Entry point for every page of the site. Each legacy URL (browse.html, detail.html, …) is a tiny
// HTML file that loads this module; the shell, router and player are created once and survive
// in-app navigation.
import { buildShell } from './ui/shell.js';
import { mountPlayerUI } from './ui/player-ui.js';
import { startRouter } from './lib/router.js';
import * as P from './player/player.js';

const shell = buildShell(document.getElementById('zs-root'));
mountPlayerUI(shell.playerHost);

// Space toggles play/pause when focus isn't on something that uses Space itself.
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t.closest?.('input,textarea,select,button,a,summary,[contenteditable],[role="slider"],[role="dialog"]')) return;
  if (!P.state.get().current) return;
  e.preventDefault();
  P.toggle();
});

startRouter({ outlet: shell.outlet, announceFn: shell.announce });
