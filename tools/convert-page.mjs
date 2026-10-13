// One-off converter: turns a legacy standalone page into an app view module.
// Keeps the page's own logic verbatim; only swaps the per-page Supabase client for the
// shared one, routes location changes through the router, and tracks timers for cleanup.
import fs from 'node:fs';
import { scopeCss } from './scope-css.mjs';

const [,, name, titleOverride] = process.argv;
const src = fs.readFileSync(`legacy/original/${name}.html`, 'utf8');

const styles = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const title = titleOverride || (src.match(/<title>([^<]*)<\/title>/) || [,''])[1].trim();
const bodyHtml = src.split(/<body[^>]*>/)[1].split('</body>')[0];
const markup = bodyHtml.replace(/<script[\s\S]*?<\/script>/g, '').trim();
let moduleScript = (bodyHtml.match(/<script type="module">([\s\S]*?)<\/script>/) || [,''])[1];
// Pages with no module script (e.g. download.html) use classic scripts: load their external
// <script src> files first, then run the inline script.
const extScripts = [...bodyHtml.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
let prelude = '';
if (!moduleScript) {
  moduleScript = [...bodyHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  prelude = extScripts.map(f => `  await __loadScript(new URL('../../${f}', import.meta.url).href);\n`).join('');
}

let js = moduleScript
  .replace(/^\s*import \{ createClient \} from [^\n]+\n/m, '')
  .replace(/^\s*const SUPABASE_URL = [^\n]+\n/m, '')
  .replace(/^\s*const SUPABASE_ANON_KEY = [^\n]+\n/m, '')
  .replace(/^\s*const supabase = createClient\([^\n]*\);\s*\n/m, '')
  .replace(/window\.location\.href\s*=\s*([^;\n]+);/g, '__navigate($1);')
  .replace(/window\.location\.reload\(\)/g, '__reload()')
  .replace(/\bsetTimeout\(/g, '__t.setTimeout(')
  .replace(/\bsetInterval\(/g, '__t.setInterval(');

if (/createClient|SUPABASE_ANON_KEY|SUPABASE_URL/.test(js)) throw new Error(`${name}: Supabase bootstrap not fully stripped`);

const esc = s => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
fs.writeFileSync(`app/css/views/${name}.css`, `/* generated from legacy/original/${name}.html by tools/convert-page.mjs */\n` + scopeCss(styles));
fs.writeFileSync(`app/views/${name}.js`, `// Adapter view generated from legacy/original/${name}.html (tools/convert-page.mjs).
// Page logic is unchanged; the shared Supabase client, router navigation and timer cleanup are injected.
import { navigate as __navigate, reload as __reload } from '../lib/router.js';
import { loadScriptOnce as __loadScript } from '../lib/dom.js';

export const title = ${JSON.stringify(title)};
export const css = 'css/views/${name}.css';
export const markup = \`${esc(markup)}\`;

export async function mount({ supabase, timers: __t, document }) {
${prelude}${js}
}
`);
console.log(`${name}: css ${styles.length}b -> scoped, markup ${markup.length}b, script ${js.length}b`);
