import Papa from 'papaparse';
import { DateTime } from 'luxon';
import { distanceMeters } from './geo.js';

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
  return parseRows(text, normalizeRow);
}

function parseRows(text, normalize) {
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  const out = [];
  for (const row of result.data) {
    try {
      const item = normalize(row);
      if (item) {
        out.push(item);
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

// --- Residency sheet ------------------------------------------------------
// A residency is a vendor holding a regular weekly slot at a host venue
// ("every Sat & Sun, 9-1, Oct 3 - Dec 20"). The residency sheet stores ONE row
// per weekly slot instead of one row per date; a vendor with several slots at
// the same venue (Tue 11-5 and Fri 6-10) has one row per slot, merged back
// into a single residency by mergeResidencyRows. src/lib/residencies.js
// expands the slots into dates when needed.

// Residency ids share a namespace with pop-up ids (saved list, ?id= links,
// React keys, map markers), so they're prefixed to stop the two sheets from
// colliding when both number their rows 1, 2, 3...
export const RESIDENCY_ID_PREFIX = 'res-';

const RESIDENCY_REQUIRED = [
  'id',
  'name',
  'days',
  'start_time',
  'end_time',
  'start_date',
  'timezone',
  'lat',
  'lng',
  'city',
];

const WEEKDAY_NUMBERS = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
const DAY_GROUPS = {
  daily: ALL_DAYS,
  everyday: ALL_DAYS,
  weekdays: [1, 2, 3, 4, 5],
  weekends: [6, 7],
  weekend: [6, 7],
};

function weekdayNumber(token) {
  return WEEKDAY_NUMBERS[String(token || '').replace(/[^a-z]/g, '').slice(0, 3)] || null;
}

// "Sat, Sun" / "Sat & Sun" / "Fri-Sun" / "Wed to Fri" / "Saturdays" / "daily" /
// "weekends" -> sorted ISO weekday numbers (1 = Mon ... 7 = Sun). Ranges may
// wrap ("Fri-Mon"). Unrecognised words are ignored; a cell with no days at
// all rejects the row.
function parseWeekdays(raw) {
  const s = clean(raw)
    .toLowerCase()
    .replace(/\bevery\s+day\b/g, 'daily')
    .replace(/\s*(?:-|\u2013|\u2014|\bto\b|\bthru\b|\bthrough\b)\s*/g, '-');
  const days = new Set();
  for (const token of s.split(/[\s,&/+;]+/)) {
    const group = DAY_GROUPS[token.replace(/[^a-z]/g, '')];
    if (group) {
      group.forEach((d) => days.add(d));
      continue;
    }
    const [from, to] = token.split('-').map(weekdayNumber);
    if (!from) continue;
    if (!to) {
      days.add(from);
      continue;
    }
    for (let d = from; ; d = (d % 7) + 1) {
      days.add(d);
      if (d === to) break;
    }
  }
  return [...days].sort((a, b) => a - b);
}

// "9:00" / "09:00:00" (how Sheets exports a time cell) / "9:00 AM" / "9am" /
// "9:30 p.m." -> { hour, minute }. English locale is pinned so AM/PM still
// parse in a browser set to another language.
const TIME_FORMATS = ['H:mm', 'H:mm:ss', 'h:mm a', 'h:mm:ss a', 'h a'];
function parseTimeOfDay(raw) {
  const s = clean(raw)
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/(\d)\s*(AM|PM)$/, '$1 $2');
  for (const fmt of TIME_FORMATS) {
    const t = DateTime.fromFormat(s, fmt, { zone: 'UTC', locale: 'en-US' });
    if (t.isValid) return { hour: t.hour, minute: t.minute };
  }
  return null;
}

// A calendar day in the residency's zone. Accepts ISO and the US-style dates
// Sheets exports for date cells; a trailing time ("9/2/2026 0:00:00") is
// ignored.
const DAY_FORMATS = ['yyyy-MM-dd', 'M/d/yyyy', 'M/d/yy'];
function parseDay(raw, zone) {
  const s = clean(raw).split(/[\sT]/)[0];
  for (const fmt of DAY_FORMATS) {
    const d = DateTime.fromFormat(s, fmt, { zone, locale: 'en-US' });
    if (d.isValid) return d.startOf('day');
  }
  return null;
}

// "2026-11-26, 2026-12-24" -> Set of ISO dates the residency is off.
function parseSkipDates(raw, zone) {
  const out = new Set();
  for (const part of clean(raw).split(/[,;\s]+/)) {
    const day = part ? parseDay(part, zone) : null;
    if (day) out.add(day.toISODate());
  }
  return out;
}

// Convert one residency-sheet row into a normalized residency holding a single
// weekly slot. The shared display fields match normalizeRow so cards, the map
// and city matching treat both kinds alike. Returns null when a required field
// is missing or invalid.
export function normalizeResidencyRow(row) {
  for (const k of RESIDENCY_REQUIRED) {
    if (!clean(row[k])) return null;
  }
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const tz = clean(row.timezone);
  const days = parseWeekdays(row.days);
  const startTime = parseTimeOfDay(row.start_time);
  const endTime = parseTimeOfDay(row.end_time);
  const firstDay = parseDay(row.start_date, tz);
  // A blank end_date means the residency is open-ended.
  const hasEnd = Boolean(nonEmpty(row.end_date));
  const lastDay = hasEnd ? parseDay(row.end_date, tz) : null;
  if (days.length === 0 || !startTime || !endTime || !firstDay) return null;
  if (hasEnd && (!lastDay || lastDay < firstDay)) return null;

  return {
    kind: 'residency',
    id: `${RESIDENCY_ID_PREFIX}${clean(row.id)}`,
    name: clean(row.name),
    location_name: nonEmpty(row.location_name),
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
    slots: [
      {
        days, // ISO weekdays, 1 = Mon ... 7 = Sun
        startTime, // { hour, minute } wall clock in `timezone`
        endTime,
        firstDay, // Luxon DateTime, start of the first day
        lastDay, // Luxon DateTime or null (ongoing)
        skipDates: parseSkipDates(row.skip_dates, tz),
      },
    ],
    // The whole run across every slot: earliest start, latest end (null while
    // any slot is ongoing).
    firstDay,
    lastDay,
  };
}

// Rows are the same residency when the vendor name matches (ignoring case and
// spacing) and they sit within this distance of each other, so a second row
// geocoded a few metres off still joins the first.
const SAME_RESIDENCY_RADIUS_M = 50;
const vendorName = (residency) => residency.name.toLowerCase().replace(/\s+/g, ' ');

// One residency per vendor and venue, however many slot rows it has: one card,
// one pin, one saved item. The merged residency keeps its first row's id, so
// share links and saved items survive more slot rows being added below it.
function mergeResidencyRows(rows) {
  const merged = [];
  for (const row of rows) {
    const same = merged.find(
      (r) =>
        vendorName(r) === vendorName(row) &&
        distanceMeters([r.lat, r.lng], [row.lat, row.lng]) <= SAME_RESIDENCY_RADIUS_M,
    );
    if (!same) {
      merged.push(row);
      continue;
    }
    same.slots.push(...row.slots);
    same.firstDay = DateTime.min(same.firstDay, row.firstDay);
    same.lastDay = same.lastDay && row.lastDay ? DateTime.max(same.lastDay, row.lastDay) : null;
    for (const c of row.categories) {
      if (!same.categories.includes(c)) same.categories.push(c);
    }
    // Optional details: the first row that has one wins. Notes from every row
    // are kept, since they may be about a particular slot.
    for (const k of ['location_name', 'address', 'neighborhood', 'instagram_url', 'order_url', 'image_url']) {
      same[k] = same[k] || row[k];
    }
    if (row.notes && !(same.notes || '').includes(row.notes)) {
      same.notes = same.notes ? `${same.notes} · ${row.notes}` : row.notes;
    }
  }
  return merged;
}

export function parseResidencyCsv(text) {
  // A sheet laid out with the pop-up columns (start_datetime, ...) instead of
  // the residency ones would otherwise just come back empty with no hint why.
  const header = Papa.parse(text, { preview: 1 }).data[0] || [];
  const missing = RESIDENCY_REQUIRED.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[popups.fyi] residency sheet is missing columns: ${missing.join(', ')}`);
  }
  return mergeResidencyRows(parseRows(text, normalizeResidencyRow));
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
