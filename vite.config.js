import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from the apex custom domain popups.fyi, so assets live at /.
// (When deploying without a custom domain to rebeccarozansky.github.io/popups.fyi/,
// switch base back to '/popups.fyi/'.)
export default defineConfig({
  plugins: [react()],
  base: '/',
});
