/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Content-Security-Policy, injected only into the production build.
 * (Vite's dev server needs inline scripts + a websocket for HMR, so dev runs without it.)
 * The game never talks to any server, so everything is locked to 'self'.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:", // Phaser builds its default textures from data:/blob: URLs
  "media-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'", // fetching our own assets/manifest only
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!--CSP-->',
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

/**
 * Minimal offline service worker generator (replaces vite-plugin-pwa/workbox to avoid
 * pulling a large build-time dependency tree). After the build it lists every file in
 * dist/, hashes them into a cache version, and writes dist/sw.js from src/platform/sw-template.js.
 */
function serviceWorkerPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'generate-sw',
    apply: 'build',
    configResolved(cfg) {
      outDir = cfg.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(full);
        }
      };
      walk(outDir);
      const hash = createHash('sha256');
      const urls: string[] = [];
      for (const f of files.sort()) {
        const rel = relative(outDir, f).split(sep).join('/');
        if (rel === 'sw.js' || rel.endsWith('.map')) continue;
        hash.update(rel).update(readFileSync(f));
        urls.push('./' + rel);
      }
      urls.unshift('./'); // start_url / navigation root
      const template = readFileSync('src/platform/sw-template.js', 'utf8');
      const sw = template
        .replace('__CACHE_VERSION__', JSON.stringify(hash.digest('hex').slice(0, 16)))
        .replace('__PRECACHE_URLS__', JSON.stringify(urls));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  // Relative base so the build works from any sub-path (e.g. GitHub Pages /repo/).
  base: './',
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) },
  plugins: [cspPlugin(), serviceWorkerPlugin()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2000, // Phaser itself is ~1.2MB
  },
  server: {
    // Only listens on localhost unless started with `npm run dev:host`.
    host: false,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
