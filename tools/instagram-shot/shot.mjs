#!/usr/bin/env node
/**
 * popups.fyi — Instagram screenshot generator.
 *
 * Renders the map in "instagram mode" (?ig=1, which un-nests every pop-up and
 * hides the interactive chrome) and saves a post-ready PNG, a matching cover
 * JPG for the first slide, plus a caption file listing the vendors and their
 * handles so they're easy to tag, with residencies in a separate section and
 * the city's hashtags at the bottom.
 *
 * The page is rendered at HALF the target size with deviceScaleFactor 2 rather
 * than at full size with dsf 1. Both produce a 1080px-wide file, but a 1080px
 * CSS viewport would lay the app out as a desktop and every label would come
 * out microscopic once Instagram shows the image at phone size. Rendering at
 * 540 CSS px keeps the type at phone proportions and stays crisp.
 *
 * Requires the site to be running (npm run dev) or a deployed --url.
 *
 *   node tools/instagram-shot/shot.mjs --city seattle --out ./out
 *
 * Options:
 *   --city <seattle|sanfrancisco|raleigh>  Which city to render  (default seattle)
 *   --out <folder>                 Where to save             (default ./screenshots)
 *   --format <portrait|square|story>                         (default portrait)
 *   --when <today|weekend|week|custom>  Date filter          (default week)
 *   --from <YYYY-MM-DD>            Start of a custom range
 *   --to <YYYY-MM-DD>              End of a custom range (inclusive)
 *   --url <base>                   Site root                 (default http://localhost:5173)
 *   --scale <n>                    Device pixel ratio        (default 2)
 *   --name <file>                  Override the output filename
 *   --mascot <file>                Cover image instead of the site logo
 *   --no-caption                   Skip the .txt caption sidecar
 *   --keep-ui                      Leave the dropdown caret / legend close button in
 *   --help
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderCover } from './cover.mjs';

// 4:5 is the tallest aspect the Instagram feed will show without cropping, so
// it's the default — it gives the map the most room.
const FORMATS = {
  portrait: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};

const CITIES = {
  seattle: 'Seattle',
  sanfrancisco: 'San Francisco',
  raleigh: 'Raleigh',
};

const WHEN = ['today', 'weekend', 'week', 'custom'];

// Matches the site's own cap on a custom range (CUSTOM_MAX_DAYS in
// src/lib/dateFilters.js) — a longer range renders an empty map.
const CUSTOM_MAX_DAYS = 14;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULTS = {
  city: 'seattle',
  out: 'screenshots',
  format: 'portrait',
  when: 'week',
  from: '',
  to: '',
  url: 'http://localhost:5173',
  scale: 2,
  caption: true,
  keepUi: false,
  name: '',
  mascot: undefined,
  timeout: 45000,
};

function usage() {
  console.log(
    [
      'popups.fyi instagram screenshot',
      '',
      '  node tools/instagram-shot/shot.mjs --city seattle --out ./out',
      '',
      `  --city     ${Object.keys(CITIES).join(' | ')}        (default ${DEFAULTS.city})`,
      `  --out      folder to save into              (default ${DEFAULTS.out})`,
      `  --format   ${Object.keys(FORMATS).join(' | ')}   (default ${DEFAULTS.format})`,
      `  --when     ${WHEN.join(' | ')}          (default ${DEFAULTS.when})`,
      '  --from     YYYY-MM-DD start of a custom range',
      '  --to       YYYY-MM-DD end of a custom range (inclusive)',
      `  --url      site root                        (default ${DEFAULTS.url})`,
      `  --scale    device pixel ratio               (default ${DEFAULTS.scale})`,
      '  --name     override output filename',
      '  --mascot   cover image instead of the site logo',
      '  --no-caption   skip the caption .txt',
      '  --keep-ui      keep the dropdown caret + legend close button',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      return value;
    };
    switch (arg) {
      case '--city': opts.city = next().toLowerCase().replace(/[^a-z]/g, ''); break;
      case '--out': case '-o': opts.out = next(); break;
      case '--format': opts.format = next().toLowerCase(); break;
      case '--when': opts.when = next().toLowerCase(); break;
      case '--from': opts.from = next(); break;
      case '--to': opts.to = next(); break;
      case '--url': opts.url = next().replace(/\/+$/, ''); break;
      case '--scale': opts.scale = Number(next()); break;
      case '--name': opts.name = next(); break;
      case '--mascot': opts.mascot = path.resolve(next()); break;
      case '--no-caption': opts.caption = false; break;
      case '--keep-ui': opts.keepUi = true; break;
      case '--help': case '-h': opts.help = true; break;
      default: {
        if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
        // Positional fallback. `npm run shot -- --city seattle --out ./x`
        // arrives here as bare `seattle ./x`, because npm on Windows eats
        // unrecognised --flags into its own config before the script sees them.
        if (CITIES[arg.toLowerCase()]) opts.city = arg.toLowerCase();
        else opts.out = arg;
        break;
      }
    }
  }
  return opts;
}

function validate(opts) {
  if (!CITIES[opts.city]) {
    throw new Error(`--city must be one of: ${Object.keys(CITIES).join(', ')}`);
  }
  if (!FORMATS[opts.format]) {
    throw new Error(`--format must be one of: ${Object.keys(FORMATS).join(', ')}`);
  }
  // Giving a range implies a custom filter — otherwise it's easy to pass
  // --from/--to and silently get "this week" back.
  if (opts.from && opts.to) opts.when = 'custom';
  if (!WHEN.includes(opts.when)) {
    throw new Error(`--when must be one of: ${WHEN.join(', ')}`);
  }
  if (opts.when === 'custom') {
    if (!ISO_DATE.test(opts.from) || !ISO_DATE.test(opts.to)) {
      throw new Error('--from and --to are required as YYYY-MM-DD for a custom range');
    }
    if (opts.to < opts.from) throw new Error('--to is before --from');
    const days = Math.round((Date.parse(opts.to) - Date.parse(opts.from)) / 86400000) + 1;
    if (days > CUSTOM_MAX_DAYS) {
      throw new Error(`custom range is ${days} days; the site only renders up to ${CUSTOM_MAX_DAYS}`);
    }
  }
  if (!Number.isFinite(opts.scale) || opts.scale < 1 || opts.scale > 4) {
    throw new Error('--scale must be a number between 1 and 4');
  }
}

// Query string for the app. Shared by the screenshot and the caption scrape so
// the two can never end up describing different date ranges.
function queryFor(opts, extra = {}) {
  const params = new URLSearchParams({ when: opts.when });
  if (opts.when === 'custom') {
    params.set('from', opts.from);
    params.set('to', opts.to);
  }
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return params.toString();
}

// "this week" / "Sep 5–9" / "Sep 28 – Oct 2". Parsed as UTC so a date near
// midnight can't roll back a day in the runner's local timezone.
function whenLabel(opts) {
  if (opts.when !== 'custom') {
    return { today: 'today', weekend: 'this weekend', week: 'this week' }[opts.when];
  }
  const parse = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  const from = parse(opts.from);
  const to = parse(opts.to);
  const month = (d) => d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = (d) => d.getUTCDate();
  if (opts.from === opts.to) return `${month(from)} ${day(from)}`;
  return month(from) === month(to)
    ? `${month(from)} ${day(from)}–${day(to)}`
    : `${month(from)} ${day(from)} – ${month(to)} ${day(to)}`;
}

// Screenshot polish. These are affordances that only make sense when you can
// click them, so they're stripped from the render rather than from the app.
// The OpenFreeMap / OpenMapTiles / OpenStreetMap attribution deliberately
// stays: the map data licence requires it to be visible.
const SHOT_CSS = `
  .pf-city { border-bottom: 0 !important; }
  .pf-city-caret { display: none !important; }
  [aria-label="Hide legend"] span:last-child { visibility: hidden !important; }
  *:focus, *:focus-visible { outline: none !important; }
`;

async function waitForMapReady(page, timeout) {
  await page.waitForSelector('.pf-marker', { timeout });
  await page.evaluate(() => (document.fonts ? document.fonts.ready : null));

  // Wait until the map is fully drawn AND the layout has stopped moving, both
  // in the same sample. The app flags the map container once MapLibre goes
  // idle (every tile loaded, no camera move or fade running); fitBounds and the
  // declutter reposition markers asynchronously and can kick off fresh tile
  // loads, so poll the marker transforms until two consecutive samples match
  // while the map is idle, rather than guessing at a sleep.
  await page.waitForFunction(
    () => {
      const idle = Boolean(document.querySelector('[data-map-idle]'));
      const signature = [...document.querySelectorAll('.maplibregl-marker')]
        .map((el) => el.style.transform)
        .join('|');
      const previous = window.__pfShotSignature;
      window.__pfShotSignature = signature;
      return idle && signature.length > 0 && previous === signature;
    },
    null,
    { timeout, polling: 350 },
  );
}

// Pull vendor names + handles off the normal (non-ig) list so the post caption
// can tag everyone. Best effort: a caption is nice to have, an image is not.
async function scrapeCaption(browser, opts) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${opts.url}/${opts.city}?${queryFor(opts)}`, {
      waitUntil: 'load',
      timeout: opts.timeout,
    });
    await page.waitForSelector('aside .overflow-y-auto button', { timeout: opts.timeout });
    // Residencies come from a second sheet that can land after the first cards
    // render. The app flags when that sheet has settled (loaded, failed, or not
    // configured), so wait for that before reading the list. (Waiting for the
    // network to go idle doesn't work: MapLibre's worker request never reports
    // as finished.)
    await page.waitForSelector(
      '[data-residency-status]:not([data-residency-status="loading"])',
      { timeout: opts.timeout },
    );
    return await page.evaluate(() => {
      const list = document.querySelector('aside .overflow-y-auto > div');
      if (!list) return [];
      // Card text is laid out across nested elements, so collapse whitespace —
      // raw textContent carries newlines that would break the caption lines.
      const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
      return [...list.children]
        .filter((el) => el.tagName === 'BUTTON')
        .map((card) => {
          const title = card.querySelector('div > div');
          const venueEl = title ? title.querySelector('span') : null;
          const name = title
            ? clean(
                [...title.childNodes]
                  .filter((n) => n.nodeType === Node.TEXT_NODE)
                  .map((n) => n.textContent)
                  .join(' '),
              )
            : '';
          const rows = card.querySelectorAll('div > div');
          const instagram = card.querySelector('a[aria-label="Open Instagram"]');
          return {
            name,
            venue: clean(venueEl ? venueEl.textContent : '').replace(/^@\s*/, ''),
            when: clean(rows[1] ? rows[1].textContent : ''),
            instagram: instagram ? instagram.href : '',
            // Residency cards carry their weekly schedule; others have none.
            residency: card.dataset.residency || '',
          };
        })
        .filter((row) => row.name);
    });
  } catch {
    return [];
  } finally {
    await page.close();
  }
}

function handleFrom(url) {
  const match = /instagram\.com\/([^/?#]+)/i.exec(url || '');
  return match ? `@${match[1]}` : '';
}

// Lead with the handle so each vendor is tagged inline, falling back to their
// name when the sheet has no Instagram link for them.
function bullet(row, when) {
  const who = handleFrom(row.instagram) || row.name;
  const where = row.venue ? ` @ ${row.venue}` : '';
  return `• ${who}${where} — ${when}`;
}

// Rules above and below the residency heading. Instagram collapses runs of
// blank lines, so whitespace alone wouldn't keep the two sections apart. The
// heading uses the plain-text house sign (U+2302), echoing the site's
// residency mark, rather than an emoji.
const RESIDENCY_RULE = '━'.repeat(18);
const RESIDENCY_HEADING = '⌂ RESIDENCIES';

// Closing hashtags per city. They always come last, below the residencies.
const HASHTAGS = {
  seattle: '#seattle #seattlepopups #popups',
  sanfrancisco: '#sanfrancisco #sfpopups #bayareapopups',
  raleigh: '#raleigh #raleighpopups #trianglepopups',
};

function buildCaption(rows, opts) {
  const label = whenLabel(opts);
  const lines = [
    `Full map → popups.fyi/${opts.city}`,
    '',
    `Pop-ups in ${CITIES[opts.city]} ${label}`,
    '',
  ];

  // Residencies get their own section after the week's one-off pop-ups, with
  // only the hashtags below them.
  const popups = rows.filter((row) => !row.residency);
  const residencies = rows.filter((row) => row.residency);

  for (const row of popups) lines.push(bullet(row, row.when));

  if (residencies.length > 0) {
    lines.push('', RESIDENCY_RULE, RESIDENCY_HEADING, RESIDENCY_RULE, '');
    for (const row of residencies) lines.push(bullet(row, row.residency));
  }

  if (HASHTAGS[opts.city]) lines.push('', HASHTAGS[opts.city]);
  return lines.join('\n');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return usage();
  validate(opts);

  const format = FORMATS[opts.format];
  const viewport = {
    width: Math.round(format.width / opts.scale),
    height: Math.round(format.height / opts.scale),
  };

  const outDir = path.resolve(process.cwd(), opts.out);
  await mkdir(outDir, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 10);
  // A custom range names itself; the relative filters get the run date so
  // successive weeks don't overwrite each other.
  const slug =
    opts.when === 'custom' ? `${opts.from}-to-${opts.to}` : `${opts.when}-${stamp}`;
  const base = opts.name
    ? opts.name.replace(/\.png$/i, '')
    : `popups-${opts.city}-${slug}`;
  const imagePath = path.join(outDir, `${base}.png`);

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: opts.scale,
      colorScheme: 'light',
    });
    const page = await context.newPage();

    const target = `${opts.url}/${opts.city}?${queryFor(opts, { ig: '1' })}`;
    console.log(`→ ${target}`);
    await page.goto(target, { waitUntil: 'load', timeout: opts.timeout });

    if (!opts.keepUi) await page.addStyleTag({ content: SHOT_CSS });
    await waitForMapReady(page, opts.timeout);

    await page.screenshot({ path: imagePath, type: 'png' });
    console.log(`✓ ${imagePath}  (${format.width}x${format.height})`);

    if (opts.caption) {
      const rows = await scrapeCaption(browser, opts);
      if (rows.length > 0) {
        const captionPath = path.join(outDir, `${base}.txt`);
        await writeFile(captionPath, `${buildCaption(rows, opts)}\n`, 'utf8');
        const residencyCount = rows.filter((row) => row.residency).length;
        const popupCount = rows.length - residencyCount;
        console.log(
          `✓ ${captionPath}  (${popupCount} pop-up${popupCount === 1 ? '' : 's'}, ` +
            `${residencyCount} ${residencyCount === 1 ? 'residency' : 'residencies'})`,
        );
      } else {
        console.log('! caption skipped — could not read the pop-up list');
      }
    }

    const coverPath = path.join(outDir, `${base}-cover.jpg`);
    await renderCover(browser, {
      cityName: CITIES[opts.city],
      dateLabel: whenLabel(opts),
      mascotPath: opts.mascot,
      size: format,
      outputPath: coverPath,
      timeout: opts.timeout,
    });
    console.log(`✓ ${coverPath}  (${format.width}x${format.height})`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED|net::/i.test(String(err))) {
    console.error('Is the site running? Start it with `npm run dev`, or pass --url.');
  }
  process.exitCode = 1;
});
