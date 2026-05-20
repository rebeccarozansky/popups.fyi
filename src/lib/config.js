// Configuration for popups.fyi.
// Set VITE_SHEET_CSV_URL at build time to point at a Google Sheet
// published as CSV (File -> Share -> Publish to web -> CSV).
// When unset (local dev, first run), we fall back to the committed sample.
export const SHEET_CSV_URL =
  import.meta.env.VITE_SHEET_CSV_URL || '/popups.sample.csv';

// Default map view. Seattle for v1.
export const DEFAULT_CENTER = [47.6062, -122.3321];
export const DEFAULT_ZOOM = 12;

// IANA zone used as the anchor for "today" / "this weekend" / "this week".
// v1 dataset is Seattle; future multi-city work would derive this from the
// user's locale or a city picker.
export const ANCHOR_TIMEZONE = 'America/Los_Angeles';

// localStorage cache settings.
export const CACHE_KEY = 'popups.fyi:cache';
export const CACHE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
