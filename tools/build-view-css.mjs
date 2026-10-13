// Scopes hand-written view stylesheets (tools/css-src/*.css) under #zs-view into app/css/views/.
import fs from 'node:fs';
import { scopeCss } from './scope-css.mjs';
for (const f of fs.readdirSync('tools/css-src').filter((n) => n.endsWith('.css'))) {
  const css = fs.readFileSync(`tools/css-src/${f}`, 'utf8');
  fs.writeFileSync(`app/css/views/${f}`, `/* generated from tools/css-src/${f} by tools/build-view-css.mjs */\n` + scopeCss(css));
  console.log('built', f);
}
