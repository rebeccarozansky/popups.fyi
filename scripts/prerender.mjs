#!/usr/bin/env node
/**
 * popups.fyi — write real HTML for every public page into dist/.
 *
 * The last step of `npm run build`, after `vite build` (the app) and
 * `vite build --ssr` (src/prerender, into dist-ssr/). It fetches both sheets,
 * renders the pages with src/prerender/site.jsx and writes them using the
 * built dist/index.html as the template, so the hashed asset tags stay right:
 *
 *   dist/index.html, dist/<city>.html          city pages, app included
 *   dist/<city>/popups|vendors|residencies/<slug>.html   plain pages
 *   dist/<shortcut>.html                       redirects (/sf, /rdu, ...)
 *   dist/404.html, dist/sitemap.xml, dist/robots.txt
 *
 * Pages are written as <route>.html: GitHub Pages serves /seattle from
 * seattle.html with a 200, while a seattle/index.html would redirect to
 * /seattle/ first.
 *
 * If the main sheet can't be fetched or parses to zero rows - or a configured
 * residency sheet can't be fetched - this exits non-zero and the deploy stops,
 * so the last good site stays live. The sheet URLs are never printed.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = path.join(ROOT, 'dist');
const PUBLIC = path.join(ROOT, 'public');
const SSR_ENTRY = path.join(ROOT, 'dist-ssr', 'entry.js');

const ATTEMPTS = 3;
const TIMEOUT_MS = 20_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Why a fetch failed, with the URL taken out (fetch errors can include it).
function reason(err, url) {
  const text = String(err?.cause?.code || err?.message || err);
  return text.split(url).join('<sheet URL>');
}

// The sheet's CSV text. A path such as /popups.sample.csv is a file in
// public/, which is how the app serves it too.
async function loadSheet(label, url) {
  if (url.startsWith('/')) {
    const file = path.resolve(PUBLIC, `.${url.split('?')[0]}`);
    if (!file.startsWith(PUBLIC + path.sep)) throw new Error(`${label} sheet path points outside public/`);
    return { text: await readFile(file, 'utf8'), fetchedAt: Date.now() };
  }
  let lastReason = '';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      // Same cache-buster as the app, so Google's edge cache can't serve a
      // copy from before the latest edit.
      const sep = url.includes('?') ? '&' : '?';
      const res = await fetch(`${url}${sep}_=${Date.now()}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (/<!DOCTYPE html>/i.test(text.slice(0, 200))) {
        throw new Error('got a web page instead of CSV - is the sheet shared publicly?');
      }
      return { text, fetchedAt: Date.now() };
    } catch (err) {
      lastReason = reason(err, url);
      console.warn(`  ${label} sheet: attempt ${attempt} of ${ATTEMPTS} failed (${lastReason})`);
      if (attempt < ATTEMPTS) await sleep(attempt * 3000);
    }
  }
  throw new Error(`${label} sheet could not be fetched (${lastReason})`);
}

// csv.js warns once per skipped row (useful in a browser console); here a
// count is enough.
function parseQuietly(parse, text) {
  const warn = console.warn;
  let skipped = 0;
  console.warn = () => {
    skipped += 1;
  };
  try {
    return { rows: parse(text), skipped };
  } finally {
    console.warn = warn;
  }
}

// Swap one marker in the template, failing loudly if index.html has changed
// shape and the marker isn't there exactly once.
function replaceOnce(html, marker, replacement) {
  const matches = typeof marker === 'string' ? html.split(marker).length - 1 : (html.match(new RegExp(marker, 'g')) || []).length;
  if (matches !== 1) throw new Error(`dist/index.html: expected one ${marker}, found ${matches}`);
  return html.replace(marker, () => replacement);
}

function fillTemplate(template, escapeHtml, { title, description, head, root, app, embed }) {
  let html = replaceOnce(template, /<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  if (description) {
    html = replaceOnce(
      html,
      /<meta name="description" content="[^"]*" \/>/,
      `<meta name="description" content="${escapeHtml(description)}" />`,
    );
  }
  if (!app) {
    // Plain pages: no app, so no module script or module preloads.
    html = html
      .replace(/\s*<script type="module"[^>]*><\/script>/g, '')
      .replace(/\s*<link rel="modulepreload"[^>]*>/g, '');
  }
  html = replaceOnce(html, /\n[ \t]*<\/head>/, `\n${head}\n  </head>`);
  return replaceOnce(html, '<div id="root"></div>', `<div id="root">${root}</div>${embed ? `\n    ${embed}` : ''}`);
}

async function write(relative, contents) {
  const file = path.join(DIST, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
}

async function main() {
  // Production React for renderToStaticMarkup (it's loaded by the SSR bundle).
  process.env.NODE_ENV ??= 'production';
  const ssr = await import(pathToFileURL(SSR_ENTRY).href);
  console.log('Prerendering pages');

  // The template is the app's own index.html, straight from `vite build`. Once
  // prerendered it has been filled in, so this step can't run twice in a row.
  const template = await readFile(path.join(DIST, 'index.html'), 'utf8');
  if (!template.includes('<div id="root"></div>')) {
    throw new Error('dist/index.html is not a fresh `vite build` (already prerendered?) - run `npm run build`');
  }

  const mainSheet = await loadSheet('Main', ssr.SHEET_CSV_URL);
  const popups = parseQuietly(ssr.parseCsv, mainSheet.text);
  if (popups.rows.length === 0) throw new Error('Main sheet parsed to zero rows');
  console.log(`  main sheet: ${popups.rows.length} rows${popups.skipped ? ` (${popups.skipped} skipped)` : ''}`);

  let residencySheet = null;
  let residencies = [];
  if (ssr.RESIDENCY_CSV_URL) {
    residencySheet = await loadSheet('Residency', ssr.RESIDENCY_CSV_URL);
    residencies = parseQuietly(ssr.parseResidencyCsv, residencySheet.text).rows;
    console.log(`  residency sheet: ${residencies.length} residencies`);
  } else {
    console.log('  residency sheet: not configured');
  }

  const site = ssr.buildSite({
    popups: popups.rows,
    residencies,
    sheets: {
      popups: { csv: mainSheet.text, fetchedAt: mainSheet.fetchedAt },
      residencies: residencySheet ? { csv: residencySheet.text, fetchedAt: residencySheet.fetchedAt } : null,
    },
  });

  const fill = (page) => fillTemplate(template, ssr.escapeHtml, page);
  for (const page of site.pages) {
    await write(page.file, fill({ ...page, embed: page.app ? site.embedScript : '' }));
  }
  for (const alias of site.aliases) await write(alias.file, alias.html);
  // 404.html still boots the app, which falls back to a city for unknown
  // paths and opens pop-ups whose pages have expired.
  await write('404.html', fill({ ...site.notFound, root: '', app: true }));
  await write('sitemap.xml', site.sitemapXml);
  await write('robots.txt', site.robotsTxt);

  const count = (kind, indexable) =>
    site.pages.filter((page) => page.kind === kind && (indexable === undefined || page.indexable === indexable)).length;
  const sitemapCount = site.pages.filter((page) => page.indexable).length;
  console.log(`  city pages: ${count('city')} + the home page`);
  console.log(`  pop-up pages: ${count('popup', true)} upcoming, ${count('popup', false)} ended (noindex)`);
  console.log(`  vendor pages: ${count('vendor')}`);
  console.log(`  residency pages: ${count('residency', true)} running, ${count('residency', false)} ended (noindex)`);
  console.log(`  shortcut redirects: ${site.aliases.length}`);
  console.log(`  sitemap.xml: ${sitemapCount} URLs`);
}

main().catch((err) => {
  console.error(`\nPrerender failed: ${err.message}`);
  process.exitCode = 1;
});
