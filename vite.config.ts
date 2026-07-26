// defineConfig comes from 'vitest/config' (a superset of Vite's own) so the
// `test` block below type-checks — it has no effect on `vite dev`/`vite build`
// or the Tauri toolchain, which only read the Vite-shaped fields.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },

  test: {
    // jsdom is a superset of what the existing pure-logic tests need, so this
    // is safe for the whole suite, not just the new component tests.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts']
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  // prevent vite from obscuring rust errors
  clearScreen: false,
  // tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    // The US Census geocoder sends no CORS headers, so the browser blocks a
    // direct fetch during dev. Proxy through Vite in dev; the packaged Tauri
    // app uses the native HTTP client (no CORS) instead — see geocode.ts.
    proxy: {
      '/census-geocode': {
        target: 'https://geocoding.geo.census.gov',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/census-geocode/, '')
      }
    }
  },
  // to make use of `TAURI_DEBUG` and other env variables
  // https://tauri.studio/v1/api/config#buildconfig.beforedevcommand
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Tauri supports es2021
    target: ['es2021', 'chrome100', 'safari13'],
    // don't minify for debug builds (default minifier otherwise -- vite 8
    // uses rolldown/oxc and no longer bundles esbuild)
    minify: process.env.TAURI_DEBUG ? false : undefined,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG
  }
});
