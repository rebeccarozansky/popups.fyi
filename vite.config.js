import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages has no server-side rewrites, so a direct hit on
// popups.fyi/seattle would 404. Pages serves 404.html for unmatched paths,
// so shipping a copy of index.html under that name boots the SPA and lets
// the client-side router read the city from the path.
function spaFallback() {
  return {
    name: 'popups-fyi-spa-fallback',
    apply: 'build',
    closeBundle() {
      const dir = resolve(__dirname, 'dist');
      const index = resolve(dir, 'index.html');
      if (existsSync(index)) copyFileSync(index, resolve(dir, '404.html'));
    },
  };
}

// Served from the apex custom domain popups.fyi, so assets live at /.
// (When deploying without a custom domain to rebeccarozansky.github.io/popups.fyi/,
// switch base back to '/popups.fyi/'.)
export default defineConfig({
  plugins: [react(), spaFallback()],
  base: '/',
});
