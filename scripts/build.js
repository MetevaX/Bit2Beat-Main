#!/usr/bin/env node
/**
 * Builds dist/Bit2Beat-Studio.html: one self-contained file (all scripts, styles and images
 * inlined) that opens by double-click, with no server and no internet.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const dataUri = (rel) => {
  const ext = path.extname(rel).slice(1).toLowerCase();
  const mime = { svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext];
  return `data:${mime};base64,${fs.readFileSync(path.join(root, rel)).toString('base64')}`;
};

let html = read('index.html');

// Styles
html = html.replace(/<link rel="stylesheet" href="([^"]+)">\n?/g, (_, href) => `<style>\n${read(href)}\n</style>\n`);

// Images referenced from HTML (src="assets/…", href="assets/…")
html = html.replace(/(src|href)="(assets\/[^"]+)"/g, (_, attr, rel) => `${attr}="${dataUri(decodeURIComponent(rel))}"`);

// Scripts, plus the world map for code that loads it at run time
const assets = `<script>(self.Bit2Beat = self.Bit2Beat || {}).assets = { worldMap: ${JSON.stringify(dataUri('assets/img/world-map.jpg'))} };</script>\n`;
let first = true;
html = html.replace(/<script src="([^"]+)"><\/script>\n?/g, (_, src) => {
  const code = read(src).replace(/<\/script/gi, '<\\/script');
  const out = (first ? assets : '') + `<script>/* ${src} */\n${code}\n</script>\n`;
  first = false;
  return out;
});

const licence = read('vendor/abcjs/LICENSE.txt').replace(/--/g, '—');
html = html.replace('</head>', `<!-- abcjs licence:\n${licence}\n-->\n</head>`);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const target = path.join(root, 'dist', 'Bit2Beat-Studio.html');
fs.writeFileSync(target, html);
console.log(`Built dist/Bit2Beat-Studio.html (${(fs.statSync(target).size / 1024).toFixed(0)} KB)`);
