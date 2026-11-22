// The tags each prerendered page adds to the template's <head>: canonical,
// robots, Open Graph / Twitter cards and JSON-LD. The page's <title> and meta
// description replace the template's own (scripts/prerender.mjs).

import { SITE_NAME } from '../lib/pages.js';

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
}

// JSON that's safe inside a <script> element: "<" can't close the tag, and
// the line separators that old parsers choke on are escaped too.
export function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// `image` is an absolute URL to a 1200 x 630 card (public/og).
export function headTags({ url, title, description, image, imageAlt, noindex = false, jsonLd = [] }) {
  const meta = (attr, key, content) => `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
  return [
    url && `<link rel="canonical" href="${escapeHtml(url)}" />`,
    noindex && '<meta name="robots" content="noindex" />',
    meta('property', 'og:site_name', SITE_NAME),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:locale', 'en_US'),
    url && meta('property', 'og:url', url),
    meta('property', 'og:title', title),
    meta('property', 'og:description', description),
    meta('property', 'og:image', image),
    meta('property', 'og:image:width', '1200'),
    meta('property', 'og:image:height', '630'),
    meta('property', 'og:image:alt', imageAlt),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', title),
    meta('name', 'twitter:description', description),
    meta('name', 'twitter:image', image),
    meta('name', 'twitter:image:alt', imageAlt),
    ...jsonLd.map((data) => `<script type="application/ld+json">${jsonForScript(data)}</script>`),
  ]
    .filter(Boolean)
    .map((tag) => `    ${tag}`)
    .join('\n');
}
