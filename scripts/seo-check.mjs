#!/usr/bin/env node
/**
 * popups.fyi — check the built site the way a crawler that doesn't run
 * JavaScript sees it.
 *
 * Serves dist/ with GitHub Pages' rules (scripts/serve-pages.mjs) and fetches
 * the home page, every city, every shortcut, sample pop-up / vendor /
 * residency pages, an ended pop-up, an unknown path, sitemap.xml and
 * robots.txt; then every URL in the sitemap and every internal link those
 * pages contain. Exits non-zero on any problem, so deploy.yml never uploads a
 * bad build.
 *
 *   npm run build && npm run seo:check
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITIES, DEFAULT_CITY, SLUG_ALIASES, getCity, pathForCity } from '../src/lib/cities.js';
import { SITE_ORIGIN } from '../src/lib/pages.js';
import { createPagesServer, listen } from './serve-pages.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const failures = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);

const server = createPagesServer(DIST);
const base = await listen(server, { port: 0 });

async function get(urlPath) {
  const res = await fetch(base + urlPath, { redirect: 'manual' });
  return { status: res.status, type: res.headers.get('content-type') || '', text: await res.text() };
}

// Small readers for the tags the prerender writes; no DOM needed.
const decode = (s) =>
  s === undefined
    ? undefined
    : s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
const attr = (tag, name) => decode((new RegExp(`\\s${name}="([^"]*)"`).exec(tag) || [])[1]);
const titleOf = (html) => decode((/<title>([^<]*)<\/title>/.exec(html) || [])[1] || '').trim();
const canonicalOf = (html) => attr((/<link rel="canonical"[^>]*>/.exec(html) || [''])[0], 'href');
const isNoindex = (html) => /<meta name="robots" content="[^"]*noindex/.test(html);
const hasAppScript = (html) => /<script type="module"[^>]*src="\/assets\//.test(html);
const h1Count = (html) => (html.match(/<h1[\s>]/g) || []).length;
const jsonLdBlocks = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
function meta(html, key) {
  for (const tag of html.match(/<meta\s[^>]*>/g) || []) {
    if (attr(tag, 'name') === key || attr(tag, 'property') === key) return attr(tag, 'content');
  }
  return undefined;
}
const bodyText = (html) =>
  decode(
    html
      .replace(/^[\s\S]*?<body[^>]*>/, '')
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();

const internalLinks = new Set();
const imageChecks = new Map();

async function checkImage(where, url) {
  if (!url.startsWith(`${SITE_ORIGIN}/`)) return fail(where, `og:image isn't on ${SITE_ORIGIN}: ${url}`);
  const local = url.slice(SITE_ORIGIN.length);
  if (!imageChecks.has(local)) imageChecks.set(local, get(local));
  const res = await imageChecks.get(local);
  if (res.status !== 200 || !res.type.startsWith('image/')) fail(where, `og:image ${local} -> HTTP ${res.status} ${res.type}`);
}

// Everything every page must have; `kind` adds the checks for its page type.
async function checkPage(urlPath, kind) {
  const where = `${urlPath} [${kind}]`;
  const res = await get(urlPath);
  if (res.status !== 200) {
    fail(where, `HTTP ${res.status}`);
    return null;
  }
  const html = res.text;
  const title = titleOf(html);
  const canonical = canonicalOf(html);
  if (!title) fail(where, 'no <title>');
  if (!meta(html, 'description')) fail(where, 'no meta description');
  if (!canonical || !canonical.startsWith(`${SITE_ORIGIN}/`)) fail(where, `canonical missing or not on ${SITE_ORIGIN}`);
  if (!meta(html, 'og:title')) fail(where, 'no og:title');
  const image = meta(html, 'og:image');
  if (!image) fail(where, 'no og:image');
  else await checkImage(where, image);
  if (meta(html, 'twitter:card') !== 'summary_large_image') fail(where, 'no summary_large_image twitter:card');
  if (h1Count(html) !== 1) fail(where, `${h1Count(html)} <h1> elements, want 1`);

  const data = [];
  for (const block of jsonLdBlocks(html)) {
    try {
      data.push(JSON.parse(block));
    } catch (err) {
      fail(where, `JSON-LD doesn't parse (${err.message})`);
    }
  }
  const types = data.flatMap((d) => (d['@graph'] ? d['@graph'] : [d])).map((d) => d['@type']);

  const text = bodyText(html);
  if (kind === 'city' || kind === 'home') {
    if (!hasAppScript(html)) fail(where, 'city page without the app script');
    const cards = (html.match(/data-popup-card=""/g) || []).length;
    if (cards === 0 && !/No pop-ups (happening|listed) in /.test(text)) fail(where, 'neither listings nor the empty-state message');
    const embedded = /<script type="application\/json" id="pf-sheet-data">([\s\S]*?)<\/script>/.exec(html);
    try {
      const sheets = JSON.parse(embedded[1]).sheets;
      if (!Object.values(sheets).every((s) => typeof s.csv === 'string' && s.csv.length > 0)) throw new Error('empty sheet');
    } catch (err) {
      fail(where, `embedded sheet data missing or broken (${err.message})`);
    }
    if (types.includes('Event')) fail(where, 'Event markup on a city page');
  } else {
    if (hasAppScript(html)) fail(where, 'plain page still loads the app');
    if (!/aria-label="Breadcrumb"/.test(html)) fail(where, 'no breadcrumbs');
    if (!types.includes('BreadcrumbList')) fail(where, 'no BreadcrumbList JSON-LD');
    if (kind === 'popup' && !types.includes('Event')) fail(where, 'no Event JSON-LD');
    if (kind === 'vendor' && types.includes('Event')) fail(where, 'Event markup on a vendor page');
    const h1 = bodyText((/<h1[\s\S]*?<\/h1>/.exec(html) || [''])[0]);
    if (text.length < h1.length + 80) fail(where, 'hardly any text besides the heading');
  }
  for (const event of data.filter((d) => d['@type'] === 'Event')) {
    for (const key of ['name', 'startDate', 'endDate', 'location', 'eventStatus', 'eventAttendanceMode', 'organizer']) {
      if (!event[key]) fail(where, `Event JSON-LD without ${key}`);
    }
    if (!/T\d\d:\d\d:\d\d[+-]\d\d:\d\d$/.test(event.startDate || '')) fail(where, `startDate without an offset: ${event.startDate}`);
    if (!event.location?.address || !event.location?.geo) fail(where, 'Event location without address or geo');
    if (!text.includes(event.location?.name || '')) fail(where, 'Event venue not shown on the page');
  }

  for (const [, href] of html.matchAll(/<a [^>]*href="(\/[^"]*)"/g)) internalLinks.add(decode(href));
  return { html, title, canonical, noindex: isNoindex(html) };
}

const pageFiles = async (dir) => {
  try {
    return (await readdir(path.join(DIST, dir))).filter((f) => f.endsWith('.html'));
  } catch {
    return [];
  }
};

// 1. Home, cities, shortcuts, unknown paths.
const home = await checkPage('/', 'home');
if (home) {
  if (home.canonical !== `${SITE_ORIGIN}${pathForCity(DEFAULT_CITY)}`) fail('/', `canonical is ${home.canonical}`);
  if (!/"@type":"WebSite"/.test(home.html) || !/"@type":"Organization"/.test(home.html)) fail('/', 'no WebSite/Organization JSON-LD');
}
for (const city of CITIES) {
  const page = await checkPage(pathForCity(city), 'city');
  if (page && page.canonical !== `${SITE_ORIGIN}${pathForCity(city)}`) fail(pathForCity(city), `canonical is ${page.canonical}`);
  if (page?.noindex) fail(pathForCity(city), 'noindex on a city page');
}
for (const [alias, slug] of Object.entries(SLUG_ALIASES)) {
  const target = pathForCity(getCity(slug));
  const res = await get(`/${alias}`);
  if (res.status !== 200) fail(`/${alias}`, `HTTP ${res.status}`);
  if (canonicalOf(res.text) !== `${SITE_ORIGIN}${target}`) fail(`/${alias}`, `canonical isn't ${target}`);
  if (!res.text.includes('location.replace(') || !res.text.includes(`http-equiv="refresh" content="0; url=${target}"`)) {
    fail(`/${alias}`, 'no redirect to the city');
  }
}
for (const unknown of ['/this-page-does-not-exist', '/seattle/popups/no-such-pop-up']) {
  const res = await get(unknown);
  if (res.status !== 404) fail(unknown, `HTTP ${res.status}, want 404`);
  if (!isNoindex(res.text)) fail(unknown, '404 page without noindex');
  if (!hasAppScript(res.text)) fail(unknown, "404 page doesn't boot the app");
}

// 2. robots.txt and sitemap.xml.
const robots = await get('/robots.txt');
if (robots.status !== 200) fail('/robots.txt', `HTTP ${robots.status}`);
if (!robots.text.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`)) fail('/robots.txt', 'no Sitemap line');
if (!/^Disallow: \/\*\.csv$/m.test(robots.text)) fail('/robots.txt', 'CSV files not disallowed');

const sitemap = await get('/sitemap.xml');
const urls = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]));
if (sitemap.status !== 200 || urls.length === 0) fail('/sitemap.xml', `HTTP ${sitemap.status}, ${urls.length} URLs`);
if (new Set(urls).size !== urls.length) fail('/sitemap.xml', 'duplicate URLs');
if (urls.includes(`${SITE_ORIGIN}/`)) fail('/sitemap.xml', 'lists / (canonical is the default city)');
for (const city of CITIES) {
  if (!urls.includes(`${SITE_ORIGIN}${pathForCity(city)}`)) fail('/sitemap.xml', `missing ${pathForCity(city)}`);
}

// 3. Every sitemap URL: 200, self-canonical, indexable. This covers the
//    sample pop-up, vendor and residency pages.
const KINDS = { popups: 'popup', vendors: 'vendor', residencies: 'residency' };
const kindOf = (urlPath) => KINDS[/^\/[^/]+\/(popups|vendors|residencies)\//.exec(urlPath)?.[1]] || 'city';
const titles = new Map();
const kinds = {};
for (const url of urls) {
  if (!url.startsWith(`${SITE_ORIGIN}/`)) {
    fail('/sitemap.xml', `not on ${SITE_ORIGIN}: ${url}`);
    continue;
  }
  const urlPath = url.slice(SITE_ORIGIN.length);
  const kind = kindOf(urlPath);
  kinds[kind] = (kinds[kind] || 0) + 1;
  const page = await checkPage(urlPath, kind);
  if (!page) continue;
  if (page.canonical !== url) fail(urlPath, `in the sitemap but canonical is ${page.canonical}`);
  if (page.noindex) fail(urlPath, 'in the sitemap but noindex');
  if (titles.has(page.title)) fail(urlPath, `same title as ${titles.get(page.title)}`);
  titles.set(page.title, urlPath);
}
for (const kind of ['city', 'popup', 'vendor']) {
  if (!kinds[kind]) fail('/sitemap.xml', `no ${kind} pages`);
}

// 4. Pop-ups and residencies that have ended: still pages, but noindex, out of
//    the sitemap, and saying so.
let endedChecked = 0;
for (const city of CITIES) {
  for (const [dir, kind, ended] of [
    ['popups', 'popup', /This pop-up has ended/],
    ['residencies', 'residency', /This residency has ended/],
  ]) {
    for (const file of await pageFiles(path.join(city.slug, dir))) {
      const urlPath = `/${city.slug}/${dir}/${file.replace(/\.html$/, '')}`;
      if (urls.includes(`${SITE_ORIGIN}${urlPath}`)) continue;
      const page = await checkPage(urlPath, kind);
      endedChecked += 1;
      if (page && !page.noindex) fail(urlPath, 'not in the sitemap but indexable');
      if (page && !ended.test(page.html)) fail(urlPath, "left out of the sitemap but doesn't say it has ended");
    }
  }
}

// 5. Internal links on every page checked go somewhere real.
const linkPaths = new Set([...internalLinks].map((href) => href.split(/[?#]/)[0]));
let linksChecked = 0;
for (const linkPath of linkPaths) {
  if (!linkPath || linkPath.startsWith('/assets/')) continue;
  const res = await fetch(base + linkPath, { redirect: 'manual', method: 'HEAD' });
  linksChecked += 1;
  if (res.status !== 200) fail(linkPath, `internal link -> HTTP ${res.status}`);
}

server.close();

const summary = Object.entries(kinds).map(([kind, n]) => `${n} ${kind}`).join(', ');
console.log(
  `Checked ${urls.length} sitemap URLs (${summary}), ${endedChecked} ended pages, ` +
    `${Object.keys(SLUG_ALIASES).length} shortcuts, ${linksChecked} internal links, robots.txt and 404s.`,
);
if (failures.length > 0) {
  console.error(`\n${failures.length} problem${failures.length === 1 ? '' : 's'}:`);
  for (const failure of failures.slice(0, 60)) console.error(`  ✗ ${failure}`);
  if (failures.length > 60) console.error(`  … and ${failures.length - 60} more`);
  process.exitCode = 1;
} else {
  console.log('✓ All SEO checks passed.');
}
