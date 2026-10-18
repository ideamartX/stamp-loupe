// Build a single self-contained HTML file for publishing as a Claude artifact
// (or for opening straight from disk). The hosted site is built separately by
// scripts/build-site.mjs, which bundles the app and copies this file beside it.
//
//   npm run build        -> dist/stamp-loupe.html

import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function between(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end);
  if (a < 0 || b < 0 || b < a) throw new Error('Marker not found: ' + start);
  return text.slice(a + start.length, b).trim();
}

const html = await readFile(join(root, 'index.html'), 'utf8');
const head = between(html, '<!-- app:head:start -->', '<!-- app:head:end -->');
const body = between(html, '<!-- app:body:start -->', '<!-- app:body:end -->');
const css = await readFile(join(root, 'src/styles.css'), 'utf8');

const result = await build({
  entryPoints: [join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  write: false,
  minify: process.argv.includes('--minify'),
  legalComments: 'none'
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const out = [
  head,
  '<style>',
  css.trim(),
  '</style>',
  body,
  '<script>',
  js.trim(),
  '</script>',
  ''
].join('\n');

await mkdir(join(root, 'dist'), { recursive: true });
await writeFile(join(root, 'dist/stamp-loupe.html'), out);
console.log('Wrote dist/stamp-loupe.html (' + Math.round(out.length / 1024) + ' KB)');
