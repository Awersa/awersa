// Packs the production build into one self-contained HTML body (CSS + JS inlined) for publishing
// as a claude.ai Artifact. Run after `npm run build`: node scripts/build-artifact.mjs [outFile]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const html = readFileSync('dist/index.html', 'utf8');
const js = html.match(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"/)?.[1];
const css = html.match(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)"/)?.[1];
if (!js || !css) throw new Error('could not find bundle in dist/index.html');
const code = readFileSync(join('dist', js), 'utf8');
const style = readFileSync(join('dist', css), 'utf8');
if (/<\/script/i.test(code) || /<\/style/i.test(style)) throw new Error('bundle contains a closing tag; cannot inline safely');

const out = process.argv[2] ?? 'dist-artifact/clash-duel.html';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  `<title>Clash Duel</title>
<meta name="theme-color" content="#120d0b">
<style>${style}</style>
<div id="game"></div>
<script type="module">${code}</script>
`,
);
console.log(`wrote ${out} (${(Buffer.byteLength(code) / 1024).toFixed(0)} KB js)`);
