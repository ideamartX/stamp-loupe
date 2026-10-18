// Build the hosted site: a launch page at the root and the app at /app/.
//
//   npm run build:site   -> dist/site/
//
//   dist/site/
//     index.html            launch page (copied from site/, or a placeholder)
//     app/                  the app: bundled, minified, hashed, works offline
//       index.html
//       build/app-[hash].js, build/chunk-[hash].js, build/app-[hash].css
//       manifest.webmanifest, assets/ (icons), sw.js
//     docs/                 the documentation
//     stamp-loupe.html      the single-file Claude artifact build
//
// The raw files still run with no build (npm run serve). Only this build
// defines __SL_BUILD__, which turns on the service worker in src/app/pwa.js.

import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm, cp, readdir, stat, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist/site');
const app = join(out, 'app');
const posix = p => p.split(sep).join('/');
const exists = p => access(p).then(() => true, () => false);

async function walk(dir) {
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...await walk(p));
    else files.push(p);
  }
  return files;
}

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

await rm(out, { recursive: true, force: true });
await mkdir(join(app, 'build'), { recursive: true });

// 1. The single-file artifact build, made first if it is missing.
if (!(await exists(join(root, 'dist/stamp-loupe.html')))) {
  await import('./build-artifact.mjs');
}

// 2. JavaScript: ES modules, split, minified, content-hashed.
const js = await build({
  absWorkingDir: root,
  entryPoints: { app: 'src/main.js' },
  bundle: true,
  format: 'esm',
  splitting: true,
  minify: true,
  target: ['es2020'],
  outdir: 'dist/site/app/build',
  entryNames: '[name]-[hash]',
  chunkNames: 'chunk-[hash]',
  legalComments: 'none',
  metafile: true,
  define: { __SL_BUILD__: JSON.stringify({ sw: true, version: pkg.version }) },
  logLevel: 'warning'
});

// 3. CSS: minified, content-hashed.
const css = await build({
  absWorkingDir: root,
  entryPoints: { app: 'src/styles.css' },
  bundle: true,
  minify: true,
  outdir: 'dist/site/app/build',
  entryNames: '[name]-[hash]',
  metafile: true,
  logLevel: 'warning'
});

const jsOutputs = Object.entries(js.metafile.outputs);
const entry = jsOutputs.find(([, o]) => o.entryPoint === 'src/main.js');
if (!entry) throw new Error('Could not find the bundled entry point.');
const cssOut = Object.keys(css.metafile.outputs).find(p => p.endsWith('.css'));
if (!cssOut) throw new Error('Could not find the bundled stylesheet.');
const fromApp = p => posix(relative(app, join(root, p)));
const entryUrl = fromApp(entry[0]);
const cssUrl = fromApp(cssOut);
const preloads = (entry[1].imports || []).filter(i => i.kind === 'import-statement').map(i => fromApp(i.path));

// 4. The app page: same markup, pointed at the built files.
let html = await readFile(join(root, 'index.html'), 'utf8');
const styleTag = /<link rel="stylesheet" href="src\/styles\.css">/;
const scriptTag = /<script type="module" src="src\/main\.js"><\/script>/;
if (!styleTag.test(html) || !scriptTag.test(html)) {
  throw new Error('index.html must link src/styles.css and load src/main.js as a module.');
}
html = html
  .replace(styleTag, `<link rel="stylesheet" href="${cssUrl}">`)
  .replace(scriptTag, [
    ...preloads.map(p => `<link rel="modulepreload" href="${p}">`),
    `<script type="module" src="${entryUrl}"></script>`
  ].join('\n'));
await writeFile(join(app, 'index.html'), html);

// 5. Manifest and icons.
await cp(join(root, 'manifest.webmanifest'), join(app, 'manifest.webmanifest'));
await cp(join(root, 'assets'), join(app, 'assets'), { recursive: true });

// 6. Service worker with the precache list and a version taken from the files.
const shellFiles = (await walk(app)).map(p => posix(relative(app, p))).sort();
const hash = createHash('sha256');
for (const f of shellFiles) {
  hash.update(f);
  hash.update(await readFile(join(app, f)));
}
const version = pkg.version + '-' + hash.digest('hex').slice(0, 10);
const precache = shellFiles.map(f => './' + f);
const sw = await readFile(join(root, 'sw.js'), 'utf8');
const buildLine = /^const BUILD = .*\/\* @sl-build \*\/$/m;
if (!buildLine.test(sw)) throw new Error('sw.js is missing its BUILD line.');
await writeFile(join(app, 'sw.js'), sw.replace(buildLine, 'const BUILD = ' + JSON.stringify({ version, precache }) + '; /* @sl-build */'));

// 7. Docs, the single-file build, and the launch page.
await cp(join(root, 'docs'), join(out, 'docs'), { recursive: true });
await cp(join(root, 'dist/stamp-loupe.html'), join(out, 'stamp-loupe.html'));
if (await exists(join(root, 'site'))) {
  await cp(join(root, 'site'), out, { recursive: true });
}
if (!(await exists(join(out, 'index.html')))) {
  await writeFile(join(out, 'index.html'), [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Stamp Loupe</title>',
    '<meta http-equiv="refresh" content="0; url=app/">',
    '</head>',
    '<body>',
    '<p><a href="app/">Open Stamp Loupe</a></p>',
    '</body>',
    '</html>',
    ''
  ].join('\n'));
}

// 8. Sizes.
const kb = n => (n / 1024).toFixed(1) + ' KB';
let rawSrc = 0;
for (const f of await walk(join(root, 'src'))) {
  if (/\.(js|css)$/.test(f)) rawSrc += (await stat(f)).size;
}
let bundled = 0, gz = 0;
for (const f of shellFiles.filter(f => f.startsWith('build/'))) {
  const buf = await readFile(join(app, f));
  bundled += buf.length;
  gz += gzipSync(buf, { level: 9 }).length;
}
console.log(`Wrote dist/site (app version ${version})`);
console.log(`  source js+css ${kb(rawSrc)} -> bundled ${kb(bundled)}, gzipped ${kb(gz)}`);
console.log(`  precached files: ${precache.length}`);
