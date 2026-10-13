// Prefixes every selector in a plain CSS string with a scope selector so a page's
// stylesheet only affects the view container. Handles @media/@supports nesting,
// leaves @keyframes/@font-face bodies alone, maps :root/html/body to the scope itself.
export function scopeCss(css, scope = '#zs-view') {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  function scopeSelector(sel) {
    return sel.split(',').map(s => s.trim()).filter(Boolean).map(s => {
      if (/^(:root|html|body)$/i.test(s)) return scope;
      if (/^(html|body)\s+/i.test(s)) return s.replace(/^(html|body)\s+/i, scope + ' ');
      if (/^:root\b/.test(s)) return s.replace(/^:root/, scope);
      if (s === '*' ) return `${scope} *`;
      if (/^\*(::before|::after|:before|:after)$/.test(s)) return `${scope} ${s}`;
      return `${scope} ${s}`;
    }).join(',\n');
  }
  function parseBlock(untilClose) {
    let out = '';
    while (i < css.length) {
      const ch = css[i];
      if (ch === '}') { if (untilClose) { i++; return out; } i++; continue; }
      // read prelude up to { or ;
      let start = i;
      while (i < css.length && css[i] !== '{' && css[i] !== ';' && css[i] !== '}') i++;
      const prelude = css.slice(start, i).trim();
      if (css[i] === ';') { i++; if (prelude) out += prelude + ';\n'; continue; }
      if (css[i] === '}') { if (prelude) out += prelude; continue; }
      if (css[i] !== '{') break;
      i++; // skip {
      if (/^@(media|supports|container|layer)/i.test(prelude)) {
        out += `${prelude} {\n${parseBlock(true)}}\n`;
      } else if (/^@/.test(prelude)) { // keyframes, font-face, etc: copy verbatim, balanced braces
        let depth = 1, bs = i;
        while (i < css.length && depth) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
        out += `${prelude} {${css.slice(bs, i - 1)}}\n`;
      } else {
        let bs = i; while (i < css.length && css[i] !== '}') i++;
        const body = css.slice(bs, i).trim(); i++;
        out += `${scopeSelector(prelude)} {\n  ${body}\n}\n`;
      }
    }
    return out;
  }
  return parseBlock(false);
}
