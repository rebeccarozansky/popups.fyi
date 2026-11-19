// Configuration for popups.fyi.
// Set VITE_SHEET_CSV_URL at build time to point at a Google Sheet
// published as CSV (File -> Share -> Publish to web -> CSV).
// When unset (local dev, first run), we fall back to the committed sample.
import { DEFAULT_CITY } from './cities.js';

export const SHEET_CSV_URL =
  import.meta.env.VITE_SHEET_CSV_URL || '/popups.sample.csv';

// Residencies (vendors with a standing weekly slot) come from their own sheet,
// with one row per weekly slot instead of one per date. Like the main sheet,
// its CSV URL comes from VITE_RESIDENCY_CSV_URL: .env.local locally and the
// repo secret of the same name for deploys. Unlike the main sheet there is NO
// sample fallback: Instagram posts are rendered from the local dev server, so
// a missing setting hides residencies rather than slipping sample vendors into
// a real post. To preview with the committed sample, set
// VITE_RESIDENCY_CSV_URL=/residencies.sample.csv in .env.local.
export const RESIDENCY_CSV_URL = import.meta.env.VITE_RESIDENCY_CSV_URL || '';

// Per-city map view and timezone now live in src/lib/cities.js; these remain
// as the app-level defaults (used before a city is resolved from the URL).
export const DEFAULT_CENTER = DEFAULT_CITY.center;
export const DEFAULT_ZOOM = DEFAULT_CITY.zoom;

// --- Basemap -------------------------------------------------------------
// Vector basemap drawn by MapLibre GL on the GPU, so zooming is continuous and
// labels stay sharp at every level (the old raster tiles were stretched while
// the next zoom level downloaded). OpenFreeMap's public instance is free with
// no key and no usage limits; the map credit is added automatically from the
// style. VITE_MAP_STYLE_URL swaps in any other MapLibre style, e.g. CARTO's
// vector Positron: https://basemaps.cartocdn.com/gl/positron-gl-style/style.json?key=YOUR_KEY
export const MAP_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/positron';

// IANA zone used as the anchor for "today" / "this weekend" / "this week".
// Callers that know the active city pass its zone explicitly; this is the
// fallback for anything that doesn't.
export const ANCHOR_TIMEZONE = DEFAULT_CITY.timezone;

// localStorage cache settings.
export const CACHE_KEY = 'popups.fyi:cache';
export const RESIDENCY_CACHE_KEY = 'popups.fyi:residency-cache';
export const CACHE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

// --- "Own a pop-up?" submission form -------------------------------------
// Where submissions land.
export const SUBMIT_EMAIL = 'popupsfyi@gmail.com';

// The site is a static bundle with no backend, so the form posts to a
// third-party form-to-email relay. FormSubmit needs no account: the first
// submission triggers a one-time confirmation email to SUBMIT_EMAIL, and
// everything after that is delivered straight to the inbox.
//
// Set VITE_FORM_ENDPOINT to override — e.g. FormSubmit's hashed alias (so the
// address isn't published in the JS bundle), Formspree, or Web3Forms.
// If the request fails the form falls back to opening a pre-filled mailto:
// draft, so a submission is never silently lost.
export const FORM_ENDPOINT =
  import.meta.env.VITE_FORM_ENDPOINT ||
  `https://formsubmit.co/ajax/${SUBMIT_EMAIL}`;
