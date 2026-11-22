#!/usr/bin/env node
/**
 * popups.fyi — share images for link previews (Open Graph / Twitter cards).
 *
 * Writes public/og/<city>.png for every city in src/lib/cities.js, a
 * city-less public/og/default.png, and public/og/logo.png (the logo on white,
 * for the site's Organization structured data). The cards reuse the Instagram
 * cover's hand-drawn design in its landscape layout
 * (tools/instagram-shot/cover.html), so this needs Playwright's Chromium and
 * an internet connection for the Indie Flower font.
 *
 *   npm run og:images
 *
 * The PNGs are committed, so the build never renders them. Re-run this after
 * adding a city, and look at the results before committing.
 */

import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { CITIES } from '../src/lib/cities.js';
import { renderCover } from '../tools/instagram-shot/cover.mjs';

const OUT = new URL('../public/og/', import.meta.url);
const SIZE = { width: 1200, height: 630 };
const out = (name) => fileURLToPath(new URL(name, OUT));

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const city of CITIES) {
    await renderCover(browser, {
      cityName: city.name,
      tagline: 'this week',
      layout: 'landscape',
      size: SIZE,
      outputPath: out(`${city.slug}.png`),
    });
    console.log(`✓ public/og/${city.slug}.png`);
  }

  await renderCover(browser, {
    intro: 'Bakery & café',
    cityName: 'Pop-Ups',
    tagline: 'near you this week',
    layout: 'landscape',
    size: SIZE,
    outputPath: out('default.png'),
  });
  console.log('✓ public/og/default.png');

  // Google wants a square-ish raster logo for Organization markup.
  const svg = await readFile(new URL('../public/logo.svg', import.meta.url));
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await page.setContent(
    `<body style="margin:0;width:512px;height:512px;display:flex;align-items:center;justify-content:center;background:#fff">
       <img src="data:image/svg+xml;base64,${svg.toString('base64')}" style="height:448px;width:auto" alt="" />
     </body>`,
  );
  await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode())));
  await page.screenshot({ path: out('logo.png'), type: 'png' });
  await page.close();
  console.log('✓ public/og/logo.png');
} finally {
  await browser.close();
}
