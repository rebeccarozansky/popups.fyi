import Papa from 'papaparse';
import { DateTime } from 'luxon';

const REQUIRED = ['id', 'name', 'start_datetime', 'end_datetime', 'timezone', 'lat', 'lng', 'city'];

function clean(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function nonEmpty(v) {
  const s = clean(v);
  return s.length > 0 ? s : null;
}

// Parse a datetime cell against a given IANA zone. Accepts strict ISO 8601
// (`2026-05-20T09:00`) plus the looser shapes Google Sheets produces when
// a human types into a cell (`2026-05-20 9:00`, `2026-05-20 09:00:00`,
// `5/20/2026 9:00`, etc.). Returns an invalid DateTime if nothing matches.
const DATE_FORMATS = [
  'yyyy-MM-dd H:mm',
  'yyyy-MM-dd HH:mm',
  'yyyy-MM-dd H:mm:ss',
  'yyyy-MM-dd HH:mm:ss',
  'M/d/yyyy H:mm',
  'M/d/yyyy HH:mm',
  'M/d/yyyy H:mm:ss',
  'M/d/yyyy HH:mm:ss',
  'M/d/yy H:mm',
  'M/d/yy HH:mm',
];
function parseDate(raw, zone) {
  const s = clean(raw);
  if (!s) return DateTime.invalid('empty');
  const iso = DateTime.fromISO(s, { zone });
  if (iso.isValid) return iso;
  for (const fmt of DATE_FORMATS) {
    const d = DateTime.fromFormat(s, fmt, { zone });
    if (d.isValid) return d;
  }
  return DateTime.invalid('unparseable');
}

// Split a "category" cell into a deduped array of lowercase tokens.
// Vendors that fit multiple categories list them comma-separated, e.g.
// "coffee, matcha". Returns [] when the cell is empty.
// `pastry` is folded into `bakery` so legacy/typo rows still render as the
// bakery cookie icon rather than the generic "other" mark.
const CATEGORY_ALIASES = { pastry: 'bakery' };
function parseCategories(raw) {
  const s = clean(raw);
  if (!s) return [];
  const seen = new Set();
  const out = [];
  for (const part of s.split(',')) {
    const raw = part.trim().toLowerCase();
    const k = CATEGORY_ALIASES[raw] || raw;
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

// Convert one parsed CSV row into a normalized popup object.
// Returns null if the row is missing required fields or has invalid values.
export function normalizeRow(row) {
  for (const k of REQUIRED) {
    if (!clean(row[k])) return null;
  }
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const tz = clean(row.timezone);
  const start = parseDate(row.start_datetime, tz);
  const end = parseDate(row.end_datetime, tz);
  if (!start.isValid || !end.isValid) return null;

  return {
    id: clean(row.id),
    name: clean(row.name),
    location_name: nonEmpty(row.location_name),
    start, // Luxon DateTime in event tz
    end,   // Luxon DateTime in event tz
    timezone: tz,
    address: nonEmpty(row.address),
    lat,
    lng,
    city: clean(row.city),
    neighborhood: nonEmpty(row.neighborhood),
    instagram_url: nonEmpty(row.instagram_url),
    order_url: nonEmpty(row.order_url),
    categories: parseCategories(row.category),
    notes: nonEmpty(row.notes),
    image_url: nonEmpty(row.image_url),
  };
}

// Parse CSV text into an array of popup objects. Bad rows are skipped with a
// console warning so a single malformed row doesn't take the whole site down.
export function parseCsv(text) {
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  const out = [];
  for (const row of result.data) {
    try {
      const popup = normalizeRow(row);
      if (popup) {
        out.push(popup);
      } else {
        // eslint-disable-next-line no-console
        console.warn('[popups.fyi] skipping row missing required fields', row);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[popups.fyi] skipping malformed row', row, err);
    }
  }
  return out;
}

// Cache helpers: store CSV text + timestamp, re-parse on read so we hold
// Luxon DateTime objects in memory (they don't survive JSON serialization).
export function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.csv !== 'string' || typeof obj.cachedAt !== 'number') return null;
    return { csv: obj.csv, cachedAt: obj.cachedAt };
  } catch {
    return null;
  }
}

export function writeCache(key, csv) {
  try {
    localStorage.setItem(key, JSON.stringify({ csv, cachedAt: Date.now() }));
  } catch {
    // localStorage may be unavailable (Safari private mode etc.) — fine.
  }
}
