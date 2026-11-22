// Addresses for the prerendered pages (scripts/prerender.mjs): the slugs and
// paths of pop-up, vendor and residency pages, and which items get one. The
// app uses the same helpers, so its Share button and its 404 fallback always
// agree with the build.
//
// Kept free of config.js (and so of import.meta.env) so it also runs in plain
// Node for its tests (pages.test.mjs).

import { DateTime } from 'luxon';
import { cityForPopup, getCity } from './cities.js';

export const SITE_ORIGIN = 'https://popups.fyi';
export const SITE_NAME = 'popups.fyi';

// A pop-up or residency keeps its page this long after it ends, so shared
// links keep working for a while. Ended pages say so, point at the vendor's
// next dates and are noindex; after that the URL 404s.
export const ENDED_PAGE_DAYS = 30;

// Vendors get a page while they have something upcoming, a running residency,
// or a pop-up that ended within this many days.
export const VENDOR_ACTIVE_DAYS = 90;

// Letters that NFKD can't split into a base letter and an accent.
const LETTERS = { đ: 'd', ð: 'd', ø: 'o', ł: 'l', ß: 'ss', æ: 'ae', œ: 'oe', þ: 'th', ı: 'i' };

// "Béo Béo Bakery" -> "beo-beo-bakery", "Nâu Đá Café" -> "nau-da-cafe",
// "Salt & Crème" -> "salt-and-creme", "Nicho's Matcha" -> "nichos-matcha".
export function slugify(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[đðøłßæœþı]/g, (c) => LETTERS[c])
    .replace(/&/g, ' and ')
    .replace(/['’‘`´]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Which vendor a row belongs to. Like the map's repeat grouping and the
// residency merge it ignores case and spacing; it also ignores accents and
// punctuation, so "Thuc Cafe" and "Thức Cafe" share one vendor page.
export function vendorKey(name) {
  return slugify(name) || String(name ?? '').trim().toLowerCase();
}

const byId = new Intl.Collator('en', { numeric: true }).compare;

// A unique slug per item within its city. Items that share a base slug are
// ordered by id: the lowest keeps it, the rest get -2, -3, ... Sheet ids only
// grow as rows are added, so a new row never renames an existing page.
function assignSlugs(items, baseFor) {
  const groups = new Map();
  for (const item of items) {
    const city = cityForPopup(item);
    if (!city) continue;
    const base = baseFor(item) || 'listing';
    const key = `${city.slug}/${base}`;
    if (!groups.has(key)) groups.set(key, { city: city.slug, base, items: [] });
    groups.get(key).items.push(item);
  }
  // Every base is reserved up front, so a suffixed slug can't take one.
  const taken = new Set(groups.keys());
  const slugs = new Map();
  for (const { city, base, items: group } of groups.values()) {
    group.sort((a, b) => byId(String(a.id), String(b.id)));
    group.forEach((item, i) => {
      if (i === 0) {
        slugs.set(item.id, base);
        return;
      }
      let n = i + 1;
      while (taken.has(`${city}/${base}-${n}`)) n += 1;
      taken.add(`${city}/${base}-${n}`);
      slugs.set(item.id, `${base}-${n}`);
    });
  }
  return slugs;
}

// id -> slug: vendor, venue and local date, e.g. "beo-beo-bakery-parlour-2026-11-25".
export function popupSlugs(popups) {
  return assignSlugs(popups, (p) =>
    slugify([p.name, p.location_name, p.start.toISODate()].filter(Boolean).join(' ')),
  );
}

// id -> slug: vendor and venue, e.g. "standard-matcha-orange-goose-coffee".
export function residencySlugs(residencies) {
  return assignSlugs(residencies, (r) => slugify([r.name, r.location_name].filter(Boolean).join(' ')));
}

// vendor key -> slug. A key is already a slug unless the name had no letters
// or digits at all (emoji-only), which falls back to "vendor", "vendor-2", ...
export function vendorSlugs(keys) {
  const slugs = new Map();
  const taken = new Set();
  const sorted = [...keys].sort();
  for (const key of sorted) {
    const slug = slugify(key);
    if (slug) {
      slugs.set(key, slug);
      taken.add(slug);
    }
  }
  let n = 1;
  for (const key of sorted) {
    if (slugs.has(key)) continue;
    let slug;
    do {
      slug = n === 1 ? 'vendor' : `vendor-${n}`;
      n += 1;
    } while (taken.has(slug));
    taken.add(slug);
    slugs.set(key, slug);
  }
  return slugs;
}

export const popupPath = (citySlug, slug) => `/${citySlug}/popups/${slug}`;
export const vendorPath = (citySlug, slug) => `/${citySlug}/vendors/${slug}`;
export const residencyPath = (citySlug, slug) => `/${citySlug}/residencies/${slug}`;
export const absoluteUrl = (path) => `${SITE_ORIGIN}${path}`;

const cutoff = (now) => now.minus({ days: ENDED_PAGE_DAYS }).toMillis();

// Pop-ups have a page from when they're listed until ENDED_PAGE_DAYS after
// they end.
export function popupHasPage(popup, now = DateTime.now()) {
  return popup.end.toMillis() > cutoff(now);
}

// Residencies have a page while they run (or before they start) and for
// ENDED_PAGE_DAYS after their last day.
export function residencyHasPage(residency, now = DateTime.now()) {
  return !residency.lastDay || residency.lastDay.endOf('day').toMillis() > cutoff(now);
}

// The path of an item's page, or null when the build doesn't make one.
// `slugs` is { popups, residencies } from popupSlugs/residencySlugs.
export function pagePathFor(item, slugs, now = DateTime.now()) {
  const city = cityForPopup(item);
  if (!city) return null;
  if (item.kind === 'residency') {
    const slug = slugs.residencies?.get(item.id);
    return slug && residencyHasPage(item, now) ? residencyPath(city.slug, slug) : null;
  }
  const slug = slugs.popups?.get(item.id);
  return slug && popupHasPage(item, now) ? popupPath(city.slug, slug) : null;
}

// Every vendor page the build writes, as "<city>/<vendor key>" -> path, or
// null for a vendor with no page. A vendor has a page while they have a
// pop-up that ended within VENDOR_ACTIVE_DAYS (or hasn't ended), or a
// residency that's running or ended within that time. Slugs are worked out
// over every vendor in the city, page or not, so they never shift.
export function vendorPages(popups, residencies, now = DateTime.now()) {
  const activeSince = now.minus({ days: VENDOR_ACTIVE_DAYS }).toMillis();
  const byCity = new Map(); // city slug -> Map(vendor key -> active?)
  const note = (item, active) => {
    const city = cityForPopup(item);
    if (!city) return;
    if (!byCity.has(city.slug)) byCity.set(city.slug, new Map());
    const vendors = byCity.get(city.slug);
    const key = vendorKey(item.name);
    vendors.set(key, Boolean(vendors.get(key)) || active);
  };
  for (const popup of popups) note(popup, popup.end.toMillis() > activeSince);
  for (const residency of residencies) {
    note(residency, !residency.lastDay || residency.lastDay.endOf('day').toMillis() > activeSince);
  }
  const pages = new Map();
  for (const [citySlug, vendors] of byCity) {
    const slugs = vendorSlugs(vendors.keys());
    for (const [key, active] of vendors) {
      pages.set(`${citySlug}/${key}`, active ? vendorPath(citySlug, slugs.get(key)) : null);
    }
  }
  return pages;
}

// The path of the page for a pop-up's or residency's vendor, or null.
// `pages` comes from vendorPages.
export function vendorPagePathFor(item, pages) {
  const city = cityForPopup(item);
  return (city && pages.get(`${city.slug}/${vendorKey(item.name)}`)) || null;
}

const PAGE_KINDS = ['popups', 'vendors', 'residencies'];

// "/seattle/popups/<slug>" -> { city, kind: 'popups', slug }; null for any
// other path.
export function parsePagePath(pathname) {
  const parts = String(pathname || '').split('/').filter(Boolean);
  if (parts.length !== 3 || !PAGE_KINDS.includes(parts[1])) return null;
  const city = getCity(parts[0]);
  return city ? { city, kind: parts[1], slug: parts[2].toLowerCase() } : null;
}

// The city page's <h1> (visually hidden in the header) and the start of its
// title, which the app also sets as document.title.
export function cityHeading(city) {
  return `Bakery & café pop-ups in ${city.name}`;
}

export function cityPageTitle(city) {
  return `${cityHeading(city)} this week · ${SITE_NAME}`;
}
