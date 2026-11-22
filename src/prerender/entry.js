// Entry for `vite build --ssr` (see package.json "build"). Bundling through
// Vite resolves import.meta.env exactly as the app's build does, so the
// prerender reads the same sheet URLs (and the same sample/off fallbacks) as
// the site it's prerendering. scripts/prerender.mjs imports the result from
// dist-ssr/.

export { SHEET_CSV_URL, RESIDENCY_CSV_URL } from '../lib/config.js';
export { parseCsv, parseResidencyCsv } from '../lib/csv.js';
export { buildSite } from './site.jsx';
export { escapeHtml } from './head.js';
