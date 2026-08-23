// Configuration for popups.fyi.
// Set VITE_SHEET_CSV_URL at build time to point at a Google Sheet
// published as CSV (File -> Share -> Publish to web -> CSV).
// When unset (local dev, first run), we fall back to the committed sample.
import { DEFAULT_CITY } from './cities.js';

export const SHEET_CSV_URL =
  import.meta.env.VITE_SHEET_CSV_URL || '/popups.sample.csv';

// Per-city map view and timezone now live in src/lib/cities.js; these remain
// as the app-level defaults (used before a city is resolved from the URL).
export const DEFAULT_CENTER = DEFAULT_CITY.center;
export const DEFAULT_ZOOM = DEFAULT_CITY.zoom;

// IANA zone used as the anchor for "today" / "this weekend" / "this week".
// Callers that know the active city pass its zone explicitly; this is the
// fallback for anything that doesn't.
export const ANCHOR_TIMEZONE = DEFAULT_CITY.timezone;

// localStorage cache settings.
export const CACHE_KEY = 'popups.fyi:cache';
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
