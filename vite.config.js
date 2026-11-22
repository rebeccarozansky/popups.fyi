import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from the apex custom domain popups.fyi, so assets live at /.
// (When deploying without a custom domain to rebeccarozansky.github.io/popups.fyi/,
// switch base back to '/popups.fyi/'.)
//
// `npm run build` runs this twice: once for the app (dist/) and once with
// --ssr for the page renderer in src/prerender (dist-ssr/), which
// scripts/prerender.mjs then uses to write every page into dist/ - 404.html
// included, so a direct hit on an unknown path still boots the app.
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  base: '/',
  build: {
    // The page renderer doesn't need its own copy of public/.
    copyPublicDir: !isSsrBuild,
  },
}));
