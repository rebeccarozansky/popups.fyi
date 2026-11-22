// schema.org JSON-LD for the prerendered pages, built only from what the sheet
// says. Google's event results only cover pages about a single event, so
// Event markup goes on pop-up pages (and residency pages, for the next date)
// and never on city or vendor pages. Everything here is also shown on the
// page itself.

import { SITE_NAME, SITE_ORIGIN } from '../lib/pages.js';

const SCHEMA = 'https://schema.org';

// Drop empty fields rather than emit nulls.
function compact(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

// ISO 8601 with the event's own UTC offset: 2026-11-25T09:00:00-08:00.
const iso = (dt) => dt.toISO({ suppressMilliseconds: true });

// "4611 36th Ave SW, Seattle, WA 98116" -> street, town, state and ZIP. An
// address in any other shape goes in whole as the street address, with the
// row's town and the city's state around it.
const US_ADDRESS =
  /^(.+?),\s*([^,]+?),\s*([A-Z]{2})(?:\s+(\d{5})(?:-\d{4})?)?(?:,\s*(?:USA|US|United States))?$/;

export function postalAddress(item, city) {
  const match = US_ADDRESS.exec(item.address || '');
  const parts = match
    ? {
        streetAddress: match[1],
        addressLocality: match[2],
        addressRegion: match[3],
        postalCode: match[4],
      }
    : {
        streetAddress: item.address,
        addressLocality: item.city || city.name,
        addressRegion: city.region,
      };
  return compact({ '@type': 'PostalAddress', ...parts, addressCountry: city.country });
}

function place(item, city) {
  return {
    '@type': 'Place',
    name: item.location_name || item.name,
    address: postalAddress(item, city),
    geo: { '@type': 'GeoCoordinates', latitude: item.lat, longitude: item.lng },
  };
}

// One dated event: a pop-up, or a residency's next occurrence. There's no
// status column in the sheet, so it's always EventScheduled - never a
// cancellation or a move. Offers only when there's an order link, without a
// price the sheet doesn't have.
export function eventJsonLd({ name, url, start, end, item, city, vendor }) {
  return compact({
    '@context': SCHEMA,
    '@type': 'Event',
    name,
    url,
    description: item.notes,
    startDate: iso(start),
    endDate: iso(end),
    eventStatus: `${SCHEMA}/EventScheduled`,
    eventAttendanceMode: `${SCHEMA}/OfflineEventAttendanceMode`,
    location: place(item, city),
    organizer: compact({
      '@type': 'Organization',
      name: vendor.name,
      url: vendor.url,
      sameAs: vendor.instagram?.url,
    }),
    image: item.image_url ? [item.image_url] : undefined,
    offers: item.order_url ? { '@type': 'Offer', url: item.order_url } : undefined,
  });
}

// [{ name, url }, ...] from the city down to the current page.
export function breadcrumbJsonLd(items) {
  return {
    '@context': SCHEMA,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// The home page: the site's name and who runs it.
export function siteJsonLd({ email }) {
  return {
    '@context': SCHEMA,
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_ORIGIN}/#website`,
        name: SITE_NAME,
        url: `${SITE_ORIGIN}/`,
        publisher: { '@id': `${SITE_ORIGIN}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_ORIGIN}/#organization`,
        name: SITE_NAME,
        url: `${SITE_ORIGIN}/`,
        logo: `${SITE_ORIGIN}/og/logo.png`,
        email,
      },
    ],
  };
}
