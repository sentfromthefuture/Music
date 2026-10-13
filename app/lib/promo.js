// The "Get the Zami App" popup was loaded by browse.html and detail.html. Keep that behaviour:
// load the (unchanged) config + promo scripts once per document when those views mount.
import { loadScriptOnce } from './dom.js';
const root = (f) => new URL('../../' + f, import.meta.url).href;
export function loadPromo() {
  return loadScriptOnce(root('zami-download-config.js'))
    .then(() => loadScriptOnce(root('zami-app-promo.js')))
    .catch(() => {});
}
