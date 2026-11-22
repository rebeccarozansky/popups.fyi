// Builds every prerendered page from the parsed sheets: city pages (with the
// static This Week view inside #root), pop-up, vendor and residency pages,
// the shortcut redirects, 404.html, sitemap.xml and robots.txt. Pure apart
// from the clock; scripts/prerender.mjs does the fetching and file writing.
//
// To add a page type: build its page objects here (popupPage below shows the
// fields scripts/prerender.mjs expects), add its component next to
// PopupPage.jsx, and add a sample of it to scripts/seo-check.mjs.

import { renderToStaticMarkup } from 'react-dom/server';
import { DateTime, Settings } from 'luxon';
import { mapsUrlFor } from '../components/PopupCard.jsx';
import { CITIES, DEFAULT_CITY, SLUG_ALIASES, getCity, pathForCity, popupsInCity } from '../lib/cities.js';
import { CACHE_KEY, RESIDENCY_CACHE_KEY, SUBMIT_EMAIL } from '../lib/config.js';
import { formatCardDateTime, formatTimeRange } from '../lib/dateFilters.js';
import { byStart, emptyListMessage, filterListings, listSummary } from '../lib/listing.js';
import {
  SITE_NAME,
  SITE_ORIGIN,
  VENDOR_ACTIVE_DAYS,
  absoluteUrl,
  cityPageTitle,
  pagePathFor,
  popupHasPage,
  popupSlugs,
  residencyHasPage,
  residencySlugs,
  vendorKey,
  vendorPath,
  vendorSlugs,
} from '../lib/pages.js';
import {
  formatResidencyCaption,
  formatResidencyDays,
  formatResidencySchedule,
  occurrencesBetween,
  residencyEntryNow,
} from '../lib/residencies.js';
import CityShell from './CityShell.jsx';
import PopupPage from './PopupPage.jsx';
import ResidencyPage from './ResidencyPage.jsx';
import StaticPage from './StaticPage.jsx';
import VendorPage from './VendorPage.jsx';
import { escapeHtml, headTags, jsonForScript } from './head.js';
import { breadcrumbJsonLd, eventJsonLd, siteJsonLd } from './structuredData.js';

// Dates read the same wherever the build runs.
Settings.defaultLocale = 'en-US';

const dayLabel = (dt) => dt.toFormat('ccc LLL d'); // Wed Nov 25
const longDay = (dt) => dt.toFormat('cccc, LLLL d'); // Wednesday, November 25
const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

// Meta descriptions: cut at a word near 160 characters.
function clip(text, max = 160) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:.]+$/, '')}…`;
}

// The first sentence always (clipped if it has to be); each later one only if
// it fits whole, so a description never trails off mid-sentence.
function sentences(first, ...rest) {
  let text = first;
  for (const sentence of rest) {
    if (sentence && `${text} ${sentence}`.length <= 160) text = `${text} ${sentence}`;
  }
  return clip(text);
}

// " at Papa Kitchen in Roosevelt, Seattle". The neighborhood is left out when
// the venue's name already says it ("[solidcore] Capitol Hill").
function wherePhrase(item, city) {
  const venue = item.location_name;
  const hood =
    item.neighborhood && !(venue || '').toLowerCase().includes(item.neighborhood.toLowerCase())
      ? ` in ${item.neighborhood}`
      : '';
  return `${venue ? ` at ${venue}` : ''}${hood}, ${city.name}`;
}

function joinAnd(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// The vendor's profile from an Instagram link, however the sheet spelled it
// (with or without www, a trailing slash or ?hl=en).
function instagramProfile(url) {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return null;
    const handle = parsed.pathname.split('/').filter(Boolean)[0];
    if (!handle || ['p', 'reel', 'reels', 'stories', 'explore'].includes(handle.toLowerCase())) return null;
    return { url: `https://www.instagram.com/${handle}/`, handle: `@${handle}` };
  } catch {
    return null;
  }
}

const CATEGORY_WORDS = { bakery: 'bakery', coffee: 'coffee', matcha: 'matcha', savory: 'savory' };

const filePath = (path) => (path === '/' ? 'index.html' : `${path.slice(1)}.html`);
const ogImage = (slug) => absoluteUrl(`/og/${slug}.png`);
const crumbsJsonLd = (crumbs) =>
  breadcrumbJsonLd(crumbs.map((crumb) => ({ name: crumb.name, url: absoluteUrl(crumb.path) })));

// Every vendor in a city, grouped by name (vendorKey), with what they have on.
function groupVendors(city, cityPopups, cityResidencies, now) {
  const groups = new Map();
  const add = (item, list) => {
    const key = vendorKey(item.name);
    if (!groups.has(key)) groups.set(key, { key, spellings: new Map(), popups: [], residencies: [] });
    const group = groups.get(key);
    const spelling = group.spellings.get(item.name) || { count: 0, latest: 0 };
    spelling.count += 1;
    spelling.latest = Math.max(spelling.latest, item.start ? item.start.toMillis() : 0);
    group.spellings.set(item.name, spelling);
    group[list].push(item);
  };
  cityPopups.forEach((popup) => add(popup, 'popups'));
  cityResidencies.forEach((residency) => add(residency, 'residencies'));

  const slugs = vendorSlugs(groups.keys());
  const activeSince = now.minus({ days: VENDOR_ACTIVE_DAYS });
  for (const vendor of groups.values()) {
    vendor.popups.sort(byStart);
    // The spelling used most; the newest one breaks ties.
    vendor.name = [...vendor.spellings].sort(
      (a, b) => b[1].count - a[1].count || b[1].latest - a[1].latest,
    )[0][0];
    // Rows don't agree on Instagram links, so use the newest row's.
    vendor.instagram =
      [...vendor.popups]
        .reverse()
        .concat(vendor.residencies)
        .map((item) => instagramProfile(item.instagram_url))
        .find(Boolean) || null;
    vendor.slug = slugs.get(vendor.key);
    vendor.path = vendorPath(city.slug, vendor.slug);
    vendor.url = absoluteUrl(vendor.path);
    vendor.upcoming = vendor.popups.filter((p) => p.end > now);
    vendor.recent = vendor.popups.filter((p) => p.end <= now && p.end > activeSince).reverse();
    vendor.liveResidencies = vendor.residencies.filter((r) => !r.lastDay || r.lastDay.endOf('day') > now);
    vendor.hasPage =
      vendor.upcoming.length > 0 ||
      vendor.recent.length > 0 ||
      vendor.residencies.some((r) => !r.lastDay || r.lastDay.endOf('day') > activeSince);
  }
  return groups;
}

// "7 pop-ups and 1 weekly residency in Seattle this week, including ..."
function cityDescription(city, list) {
  if (list.length === 0) {
    return `Bakery and café pop-ups in ${city.name} on a map, with dates, times and addresses. Nothing is listed for this week yet.`;
  }
  const residencyCount = list.filter((item) => item.kind === 'residency').length;
  const popupCount = list.length - residencyCount;
  const counts = [
    popupCount > 0 && `${popupCount} pop-up${popupCount === 1 ? '' : 's'}`,
    residencyCount > 0 && `${residencyCount} weekly ${residencyCount === 1 ? 'residency' : 'residencies'}`,
  ]
    .filter(Boolean)
    .join(' and ');
  const names = [...new Set(list.map((item) => item.name))];
  for (let n = Math.min(names.length, 4); n >= 1; n -= 1) {
    const more = names.length - n;
    const who = more > 0 ? `${names.slice(0, n).join(', ')} and ${more} more` : joinAnd(names.slice(0, n));
    const text = `${counts} in ${city.name} this week, including ${who}. Dates, times and addresses on a map.`;
    if (text.length <= 160) return text;
  }
  return clip(`${counts} in ${city.name} this week. Dates, times and addresses on a map.`);
}

function cityPages(city, { cityPopups, cityResidencies, slugs, now }) {
  const list = filterListings(
    cityPopups,
    cityResidencies.length > 0 ? cityResidencies : null,
    'week',
    { from: '', to: '' },
    city.timezone,
  );
  const root = renderToStaticMarkup(
    <CityShell
      city={city}
      cities={CITIES}
      list={list}
      summary={listSummary(list)}
      emptyMessage={emptyListMessage({ cityName: city.name, anyListed: cityPopups.length > 0 })}
      hasResidencies={cityResidencies.length > 0}
      linkFor={(item) => pagePathFor(item, slugs, now)}
    />,
  );
  const path = pathForCity(city);
  const url = absoluteUrl(path);
  const title = cityPageTitle(city);
  const description = cityDescription(city, list);
  const imageAlt = `Pop-Ups in ${city.name} this week, on popups.fyi`;
  const page = {
    kind: 'city',
    path,
    file: filePath(path),
    url,
    title,
    description,
    head: headTags({ url, title, description, image: ogImage(city.slug), imageAlt }),
    root,
    app: true,
    indexable: true,
    listed: list.length,
  };
  if (city.slug !== DEFAULT_CITY.slug) return [page];
  // The bare domain shows the default city too. It points search engines at
  // /seattle as the one address to index, and carries the site's name and
  // publisher (Google reads those from the home page).
  const home = {
    ...page,
    kind: 'home',
    path: '/',
    file: 'index.html',
    head: headTags({
      url,
      title,
      description,
      image: ogImage('default'),
      imageAlt: 'Bakery & café pop-ups near you this week, on popups.fyi',
      jsonLd: [siteJsonLd({ email: SUBMIT_EMAIL })],
    }),
    indexable: false,
  };
  return [page, home];
}

// A dated row for the lists on vendor and pop-up pages.
function popupRow(popup, slugs, now) {
  return {
    key: popup.id,
    path: pagePathFor(popup, slugs, now),
    title: formatCardDateTime(popup),
    detail: [popup.location_name, popup.neighborhood].filter(Boolean).join(' · '),
  };
}

function residencyRow(residency, slugs, now) {
  return {
    key: residency.id,
    path: pagePathFor(residency, slugs, now),
    title: `Residency${residency.location_name ? ` at ${residency.location_name}` : ''}`,
    detail: formatResidencySchedule(residency, now),
  };
}

// A vendor's next date, for pages that have ended.
function nextFor(vendor, slugs, now) {
  const popup = vendor.upcoming[0];
  if (popup) {
    return {
      path: pagePathFor(popup, slugs, now),
      label: `${dayLabel(popup.start)}${popup.location_name ? ` at ${popup.location_name}` : ''}`,
    };
  }
  const residency = vendor.liveResidencies[0];
  return residency
    ? {
        path: pagePathFor(residency, slugs, now),
        label: `${lowerFirst(formatResidencyDays(residency, now))} at ${residency.location_name}`,
      }
    : null;
}

// `withTime` adds the start time to the title and breadcrumb, for a vendor
// with two sittings at one venue on the same day.
function popupPage(popup, city, vendor, slugs, now, withTime = false) {
  const path = pagePathFor(popup, slugs, now);
  const url = absoluteUrl(path);
  const ended = popup.end <= now;
  const venue = popup.location_name;
  const name = venue ? `${popup.name} at ${venue}` : popup.name;
  const when = withTime ? `${dayLabel(popup.start)}, ${popup.start.toFormat('h:mm a')}` : dayLabel(popup.start);
  const title = `${name}, ${when} · ${city.name} pop-up`;
  const where = wherePhrase(popup, city);
  const next = ended ? nextFor(vendor, slugs, now) : null;
  const description = ended
    ? sentences(
        `${popup.name} popped up${where} on ${longDay(popup.start)}.`,
        next ? `Next: ${next.label}.` : 'No upcoming dates are listed yet.',
      )
    : popup.notes
      ? clip(`${popup.name} pops up${where} on ${longDay(popup.start)}, ${formatTimeRange(popup)}. ${popup.notes}`)
      : sentences(
          `${popup.name} pops up${where} on ${longDay(popup.start)}, ${formatTimeRange(popup)}.`,
          'Address, map and Instagram on popups.fyi.',
        );
  const crumbs = [
    { name: city.name, path: pathForCity(city) },
    { name: vendor.name, path: vendor.path },
    { name: when, path },
  ];
  const moreDates = [
    ...vendor.upcoming.filter((p) => p.id !== popup.id).map((p) => popupRow(p, slugs, now)),
    ...vendor.liveResidencies.map((r) => residencyRow(r, slugs, now)),
  ];
  const body = renderToStaticMarkup(
    <StaticPage city={city} breadcrumbs={crumbs}>
      <PopupPage
        popup={popup}
        vendor={vendor}
        ended={ended}
        instagram={vendor.instagram}
        mapsUrl={mapsUrlFor(popup)}
        mapPath={`${pathForCity(city)}?id=${encodeURIComponent(popup.id)}`}
        moreDates={moreDates}
        next={next}
      />
    </StaticPage>,
  );
  const jsonLd = [
    eventJsonLd({ name, url, start: popup.start, end: popup.end, item: popup, city, vendor }),
    crumbsJsonLd(crumbs),
  ];
  return {
    kind: 'popup',
    path,
    file: filePath(path),
    url,
    title,
    description,
    head: headTags({
      url,
      title,
      description,
      image: ogImage(city.slug),
      imageAlt: `Pop-Ups in ${city.name} this week, on popups.fyi`,
      noindex: ended,
      jsonLd,
    }),
    root: body,
    app: false,
    indexable: !ended,
  };
}

function residencyPage(residency, city, vendor, slugs, now) {
  const path = pagePathFor(residency, slugs, now);
  const url = absoluteUrl(path);
  const ended = Boolean(residency.lastDay) && residency.lastDay.endOf('day') < now;
  // The next occurrence (the last one, once it has ended).
  const next = residencyEntryNow(residency, now);
  const upcoming = occurrencesBetween(residency, now.minus({ days: 1 }), now.plus({ days: 28 })).filter(
    (occurrence) => occurrence.end > now,
  );
  const venue = residency.location_name;
  const name = venue ? `${residency.name} at ${venue}` : residency.name;
  const title = `${name}, ${lowerFirst(formatResidencyDays(residency, now))} · ${city.name} residency`;
  const where = wherePhrase(residency, city);
  const description = ended
    ? sentences(`${residency.name}'s weekly residency${where} has ended.`, 'See their other dates on popups.fyi.')
    : sentences(
        `${residency.name} has a weekly residency${where}: ${lowerFirst(formatResidencyCaption(residency, now))}.`,
        next ? `Next: ${formatCardDateTime(next)}.` : '',
      );
  const crumbs = [
    { name: city.name, path: pathForCity(city) },
    { name: vendor.name, path: vendor.path },
    { name: `Residency${venue ? ` at ${venue}` : ''}`, path },
  ];
  const body = renderToStaticMarkup(
    <StaticPage city={city} breadcrumbs={crumbs}>
      <ResidencyPage
        residency={residency}
        vendor={vendor}
        ended={ended}
        next={next}
        nextDates={upcoming.map((occurrence) => ({
          key: occurrence.start.toISO(),
          title: formatCardDateTime(occurrence),
        }))}
        instagram={vendor.instagram}
        mapsUrl={mapsUrlFor(residency)}
        mapPath={`${pathForCity(city)}?id=${encodeURIComponent(residency.id)}`}
        now={now}
      />
    </StaticPage>,
  );
  const jsonLd = [
    next && eventJsonLd({ name, url, start: next.start, end: next.end, item: residency, city, vendor }),
    crumbsJsonLd(crumbs),
  ].filter(Boolean);
  return {
    kind: 'residency',
    path,
    file: filePath(path),
    url,
    title,
    description,
    head: headTags({
      url,
      title,
      description,
      image: ogImage(city.slug),
      imageAlt: `Pop-Ups in ${city.name} this week, on popups.fyi`,
      noindex: ended,
      jsonLd,
    }),
    root: body,
    app: false,
    indexable: !ended,
  };
}

function vendorPage(vendor, city, slugs, now) {
  const { path, url } = vendor;
  const title = `${vendor.name} pop-ups in ${city.name} · ${SITE_NAME}`;
  const counts = new Map();
  for (const item of [...vendor.popups, ...vendor.residencies]) {
    for (const category of item.categories) {
      if (CATEGORY_WORDS[category]) counts.set(category, (counts.get(category) || 0) + 1);
    }
  }
  const kinds = [...counts].sort((a, b) => b[1] - a[1]).map(([category]) => CATEGORY_WORDS[category]);
  const intro = kinds.length > 0 ? `${joinAnd(kinds)} pop-ups in ${city.name}` : `Pop-ups in ${city.name}`;
  // As many of the next dates as fit (up to three), then "and N more".
  const upcomingSentence = () => {
    const dates = vendor.upcoming.map((p) => `${dayLabel(p.start)}${p.location_name ? ` at ${p.location_name}` : ''}`);
    let text = '';
    for (let n = Math.min(dates.length, 3); n >= 1; n -= 1) {
      const more = dates.length - n;
      text = `Upcoming ${vendor.name} pop-ups in ${city.name}: ${dates.slice(0, n).join('; ')}${more > 0 ? ` and ${more} more` : ''}.`;
      if (text.length <= 160) break;
    }
    return text;
  };
  const residency = vendor.liveResidencies[0];
  const last = vendor.recent[0];
  const description =
    vendor.upcoming.length > 0
      ? sentences(upcomingSentence(), 'Times, addresses and Instagram on popups.fyi.')
      : residency
        ? sentences(
            `${vendor.name} has a weekly residency at ${residency.location_name} in ${city.name}: ${lowerFirst(formatResidencyCaption(residency, now))}.`,
            'Hours, address and Instagram on popups.fyi.',
          )
        : sentences(
            `${vendor.name} has no upcoming pop-ups listed in ${city.name} right now.`,
            last ? `Most recently: ${dayLabel(last.start)}${last.location_name ? ` at ${last.location_name}` : ''}.` : '',
            'Past dates and Instagram on popups.fyi.',
          );
  const crumbs = [
    { name: city.name, path: pathForCity(city) },
    { name: vendor.name, path },
  ];
  const first = vendor.upcoming[0] || vendor.liveResidencies[0];
  const body = renderToStaticMarkup(
    <StaticPage city={city} breadcrumbs={crumbs}>
      <VendorPage
        vendor={vendor}
        city={city}
        intro={`${intro.charAt(0).toUpperCase()}${intro.slice(1)}.`}
        upcoming={vendor.upcoming.map((p) => popupRow(p, slugs, now))}
        residencies={vendor.residencies.filter((r) => residencyHasPage(r, now)).map((r) => residencyRow(r, slugs, now))}
        recent={vendor.recent.map((p) => popupRow(p, slugs, now))}
        mapPath={first ? `${pathForCity(city)}?id=${encodeURIComponent(first.id)}` : pathForCity(city)}
      />
    </StaticPage>,
  );
  return {
    kind: 'vendor',
    path,
    file: filePath(path),
    url,
    title,
    description,
    head: headTags({
      url,
      title,
      description,
      image: ogImage(city.slug),
      imageAlt: `Pop-Ups in ${city.name} this week, on popups.fyi`,
      jsonLd: [crumbsJsonLd(crumbs)],
    }),
    root: body,
    app: false,
    indexable: true,
  };
}

// Small pages for the URL shortcuts (/sf, /rdu, ...): straight on to the
// city, keeping the query string, with a meta refresh if scripts are off.
function aliasPage(alias, target) {
  const city = getCity(target);
  const path = pathForCity(city);
  return {
    file: `${alias}.html`,
    target: path,
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(cityPageTitle(city))}</title>
    <link rel="canonical" href="${absoluteUrl(path)}" />
    <script>location.replace(${JSON.stringify(path)} + location.search + location.hash);</script>
    <meta http-equiv="refresh" content="0; url=${path}" />
  </head>
  <body>
    <p><a href="${path}">popups.fyi${path}</a></p>
  </body>
</html>
`,
  };
}

function robotsTxt() {
  return `# popups.fyi
User-agent: *
Allow: /
# The sample CSVs in public/ are only for local development.
Disallow: /*.csv

# To keep the site out of AI model training while staying in search results
# (and in AI search answers), uncomment the groups below. Googlebot, Bingbot
# and the AI search crawlers (OAI-SearchBot, Claude-SearchBot, PerplexityBot)
# are not affected.
#
# User-agent: GPTBot
# Disallow: /
#
# User-agent: ClaudeBot
# Disallow: /
#
# User-agent: Google-Extended
# Disallow: /

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
}

// Only canonical, indexable URLs. No <lastmod>: stamping the build time on
// every URL each hour would just teach crawlers to ignore it.
function sitemapXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n')}
</urlset>
`;
}

// `sheets` is { popups: { csv, fetchedAt }, residencies: { csv, fetchedAt } | null }.
export function buildSite({ popups, residencies, sheets, now = DateTime.now() }) {
  const slugs = { popups: popupSlugs(popups), residencies: residencySlugs(residencies) };
  const pages = [];
  for (const city of CITIES) {
    const cityPopups = popupsInCity(popups, city);
    const cityResidencies = popupsInCity(residencies, city);
    const vendors = groupVendors(city, cityPopups, cityResidencies, now);
    const vendorOf = (item) => vendors.get(vendorKey(item.name));

    pages.push(...cityPages(city, { cityPopups, cityResidencies, slugs, now }));
    const withPages = cityPopups.filter((popup) => popupHasPage(popup, now));
    const sameDay = (popup) => `${vendorKey(popup.name)}|${popup.location_name || ''}|${popup.start.toISODate()}`;
    const sittings = new Map();
    for (const popup of withPages) sittings.set(sameDay(popup), (sittings.get(sameDay(popup)) || 0) + 1);
    for (const popup of withPages) {
      pages.push(popupPage(popup, city, vendorOf(popup), slugs, now, sittings.get(sameDay(popup)) > 1));
    }
    for (const residency of cityResidencies) {
      if (residencyHasPage(residency, now)) pages.push(residencyPage(residency, city, vendorOf(residency), slugs, now));
    }
    for (const vendor of vendors.values()) {
      if (vendor.hasPage) pages.push(vendorPage(vendor, city, slugs, now));
    }
  }

  const embedded = { sheets: { [CACHE_KEY]: sheets.popups } };
  if (sheets.residencies) embedded.sheets[RESIDENCY_CACHE_KEY] = sheets.residencies;

  return {
    pages,
    aliases: Object.entries(SLUG_ALIASES).map(([alias, target]) => aliasPage(alias, target)),
    // Unknown paths still boot the app (it falls back to a city), but aren't
    // pages search engines should keep.
    notFound: {
      title: `${SITE_NAME} — bakery and café pop-ups`,
      head: '    <meta name="robots" content="noindex" />',
    },
    embedScript: `<script type="application/json" id="pf-sheet-data">${jsonForScript(embedded)}</script>`,
    sitemapXml: sitemapXml(pages.filter((page) => page.indexable).map((page) => page.url)),
    robotsTxt: robotsTxt(),
  };
}
