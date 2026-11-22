// City registry + path routing for popups.fyi.
//
// The site is served per-city at popups.fyi/<slug> (popups.fyi/seattle,
// popups.fyi/sanfrancisco, popups.fyi/raleigh). The bare domain popups.fyi
// renders the default city, so existing links keep working.
//
// A pop-up belongs to a city when its `city` cell matches one of that city's
// aliases, or — failing that — when its coordinates fall inside the metro
// bounding box. The bounds fallback is what keeps suburb rows (Bothell,
// Oakland, …) attached to the metro they belong to without having to
// enumerate every town in the sheet.
//
// `region` and `country` fill in pop-up addresses for search engines
// (structured data on the prerendered pages, see src/prerender).

export const CITIES = [
  {
    slug: 'seattle',
    name: 'Seattle',
    region: 'WA',
    country: 'US',
    timezone: 'America/Los_Angeles',
    center: [47.6062, -122.3321],
    zoom: 12,
    // Puget Sound metro.
    bounds: { minLat: 46.9, maxLat: 48.4, minLng: -123.4, maxLng: -121.4 },
    aliases: [
      'seattle',
      'bothell',
      'bellevue',
      'redmond',
      'kirkland',
      'renton',
      'shoreline',
      'burien',
      'tukwila',
      'edmonds',
      'lynnwood',
      'everett',
      'tacoma',
      'kent',
      'issaquah',
      'sammamish',
      'white center',
    ],
  },
  {
    slug: 'sanfrancisco',
    name: 'San Francisco',
    region: 'CA',
    country: 'US',
    timezone: 'America/Los_Angeles',
    center: [37.7749, -122.4194],
    zoom: 12,
    // Bay Area.
    bounds: { minLat: 36.9, maxLat: 38.3, minLng: -123.2, maxLng: -121.5 },
    aliases: [
      'san francisco',
      'sf',
      'oakland',
      'berkeley',
      'daly city',
      'south san francisco',
      'alameda',
      'emeryville',
      'san mateo',
      'burlingame',
      'san jose',
      'palo alto',
    ],
  },
  {
    slug: 'raleigh',
    name: 'Raleigh',
    region: 'NC',
    country: 'US',
    timezone: 'America/New_York',
    center: [35.7796, -78.6382],
    zoom: 12,
    // Research Triangle: Raleigh, Durham, Chapel Hill and the towns between.
    bounds: { minLat: 35.4, maxLat: 36.3, minLng: -79.4, maxLng: -78.2 },
    aliases: [
      'raleigh',
      'durham',
      'chapel hill',
      'carrboro',
      'cary',
      'apex',
      'morrisville',
      'wake forest',
      'garner',
      'holly springs',
      'fuquay-varina',
      'knightdale',
      'wendell',
      'clayton',
      'hillsborough',
    ],
  },
];

export const DEFAULT_CITY_SLUG = 'seattle';

// Alternate URL spellings that redirect to a canonical slug. The build writes
// a small redirect page for each (scripts/prerender.mjs).
export const SLUG_ALIASES = {
  'san-francisco': 'sanfrancisco',
  san_francisco: 'sanfrancisco',
  sf: 'sanfrancisco',
  sea: 'seattle',
  rdu: 'raleigh',
};

export const DEFAULT_CITY = CITIES.find((c) => c.slug === DEFAULT_CITY_SLUG);

export function getCity(slug) {
  if (!slug) return null;
  const key = String(slug).trim().toLowerCase();
  const canonical = SLUG_ALIASES[key] || key;
  return CITIES.find((c) => c.slug === canonical) || null;
}

// Read the city slug out of a pathname. Returns null when the path doesn't
// name a known city (bare domain, unknown slug, deep asset path, …).
export function cityFromPath(pathname) {
  const segment = String(pathname || '')
    .split('/')
    .filter(Boolean)[0];
  return getCity(segment);
}

export function pathForCity(city) {
  return `/${city.slug}`;
}

function normalize(v) {
  return String(v || '').trim().toLowerCase();
}

function inBounds(city, lat, lng) {
  const b = city.bounds;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

// Which city does this pop-up belong to? Name match first (the sheet's `city`
// column is authoritative when we recognize it), then a geographic fallback.
export function cityForPopup(popup) {
  const name = normalize(popup.city);
  if (name) {
    const byName = CITIES.find((c) => c.aliases.includes(name));
    if (byName) return byName;
  }
  if (Number.isFinite(popup.lat) && Number.isFinite(popup.lng)) {
    const byBounds = CITIES.find((c) => inBounds(c, popup.lat, popup.lng));
    if (byBounds) return byBounds;
  }
  return null;
}

export function popupsInCity(popups, city) {
  if (!city) return popups;
  return popups.filter((p) => cityForPopup(p)?.slug === city.slug);
}
