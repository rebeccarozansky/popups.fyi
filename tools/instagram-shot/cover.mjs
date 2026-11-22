import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESIGN_WIDTH = 540;
// The landscape layout (link-preview cards, see scripts/og-images.mjs) is laid
// out on a wider page: 600 × 315 CSS pixels, 1200 × 630 at 2×.
const LANDSCAPE_WIDTH = 600;
const TEMPLATE_URL = new URL('./cover.html', import.meta.url);
const MASCOT_URL = new URL('../../public/logo.svg', import.meta.url);
const MASCOT_TYPES = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (character) => entities[character]);
}

// Same deterministic per-letter transforms as the website header and the
// approved design proof. Generate spans here so the template needs no JS.
function jitter(text, offset) {
  const seed = (i) => {
    const x = Math.sin((i + 1) * 9973.13) * 10000;
    return x - Math.floor(x);
  };
  return [...text].map((character, i) => {
    const index = offset + i;
    const rotate = (seed(index) - 0.5) * 8;
    const translateY = (seed(index + 100) - 0.5) * 3;
    return `<span class="glyph" style="transform: rotate(${rotate.toFixed(2)}deg) translateY(${translateY.toFixed(2)}px)">${escapeHtml(character)}</span>`;
  }).join('');
}

// `dateLabel` makes the cover's last line "for <dateLabel>"; `tagline`
// replaces that line outright ("this week"). `intro` is the first line.
export async function buildCoverHtml({
  cityName,
  dateLabel,
  tagline,
  intro = 'Pop-Ups in',
  layout = 'portrait',
  mascotPath = MASCOT_URL,
}) {
  if (!cityName || !(dateLabel || tagline)) throw new Error('A cover requires a city and date label.');

  // Overrides are local files; leave the site's logo and normal default intact.
  const mascotFile = mascotPath instanceof URL ? fileURLToPath(mascotPath) : mascotPath;
  const mascotType = MASCOT_TYPES[extname(mascotFile).toLowerCase()];
  if (!mascotType) throw new Error('Cover mascot must be an SVG, PNG, JPG, or WebP image.');

  const [template, mascot] = await Promise.all([
    readFile(TEMPLATE_URL, 'utf8'),
    readFile(mascotFile),
  ]);
  const lastLine = tagline || `for ${dateLabel}`;
  const content = {
    LAYOUT: layout === 'landscape' ? 'cover--landscape' : 'cover--portrait',
    MASCOT: `data:${mascotType};base64,${mascot.toString('base64')}`,
    HEADING: escapeHtml(`${intro} ${cityName} ${lastLine}`),
  };
  let offset = 0;
  for (const [key, text] of Object.entries({
    INTRO: intro,
    CITY: cityName,
    DATES: lastLine,
    WORDMARK: 'popups.fyi',
  })) {
    content[key] = jitter(text, offset);
    offset += text.length;
  }
  return template.replace(/\{\{([A-Z]+)\}\}/g, (_, key) => content[key]);
}

export async function renderCover(browser, {
  cityName,
  dateLabel,
  tagline,
  intro,
  layout = 'portrait',
  mascotPath,
  size,
  outputPath,
  timeout = 45000,
}) {
  const html = await buildCoverHtml({ cityName, dateLabel, tagline, intro, layout, mascotPath });
  // Keep the approved type sizes independent of the map's --scale option.
  // All current formats are 1080px wide, so this renders the artwork at 2×.
  const deviceScaleFactor = size.width / (layout === 'landscape' ? LANDSCAPE_WIDTH : DESIGN_WIDTH);
  const page = await browser.newPage({
    viewport: { width: size.width / deviceScaleFactor, height: Math.round(size.height / deviceScaleFactor) },
    deviceScaleFactor,
    colorScheme: 'light',
  });

  try {
    page.setDefaultTimeout(timeout);
    await page.setContent(html, { waitUntil: 'load', timeout });
    const clipped = await page.evaluate(async () => {
      const fonts = await document.fonts.load('60px "Indie Flower"');
      await document.fonts.ready;
      if (!fonts.length || fonts.some((font) => font.status !== 'loaded')) {
        throw new Error('Cover font Indie Flower could not load; refusing to save a fallback-font cover.');
      }
      await Promise.all([...document.images].map((image) => image.decode()));

      const bounds = document.querySelector('.cover').getBoundingClientRect();
      return [...document.querySelectorAll('.mascot, .glyph, .arrow-shaft, .arrow-head')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < bounds.left || rect.right > bounds.right ||
            rect.top < bounds.top || rect.bottom > bounds.bottom;
        })
        .map((element) => element.className);
    });
    if (clipped.length) throw new Error(`Cover layout would clip: ${[...new Set(clipped)].join(', ')}`);

    await page.locator('.cover').screenshot({
      path: outputPath,
      // Covers are JPEGs; link-preview cards are saved as PNG.
      ...(/\.png$/i.test(outputPath) ? { type: 'png' } : { type: 'jpeg', quality: 98 }),
      animations: 'disabled',
      scale: 'device',
    });
  } finally {
    await page.close();
  }
}