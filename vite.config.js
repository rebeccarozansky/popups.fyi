import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Repo deploys to https://rebeccarozansky.github.io/popups.fyi/ so all
// asset URLs must be prefixed with the repo name. If/when you point the
// custom domain (popups.fyi) at Pages and re-enable the CNAME file,
// change base back to '/'.
export default defineConfig({
  plugins: [react()],
  base: '/popups.fyi/',
});
