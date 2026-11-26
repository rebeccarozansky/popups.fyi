import { readFile } from 'node:fs/promises';
import { DateTime } from 'luxon';
import {
  buildIconMarkerSvg,
  MARKER_UNIT_PX,
  RESIDENCY_GLYPH_PATHS,
} from '../../src/lib/categoryIcons.js';
import { escapeHtml, jitter } from './cover.mjs';

// The slides between the cover and the map: the week's pop-ups day by day, in
// the site's own look. Thursday shares a slide with Friday and Monday with
// Tuesday; Saturday and Sunday (and Wednesday, when a range has one) get a
// slide each, and residencies get one of their own after the days. A day with
// more pop-ups than fit on one slide carries on over more slides that hold
// nothing but that day.

const DESIGN_WIDTH = 540;
const TEMPLATE_URL = new URL('./slides.html', import.meta.url);
const LOGO_URL = new URL('../../public/logo.svg', import.meta.url);
const LOCALE = 'en-US';
const ICON_PX = 26;
// Two categories stack in the same column, a size down so the pair is no
// taller than a row's two lines of text.
const PAIR_ICON_PX = 20;
// Luxon weekdays (Monday = 1): Friday joins the Thursday before it and Tuesday
// the Monday.
const JOINS_DAY_BEFORE = new Set([2, 5]);
// A day that has to be split starts on the slide before it (after the other
// day there) only when at least this many of its rows fit; otherwise it starts
// a slide of its own.
const MIN_SHARED_ROWS = 2;
const SWIPE_TEXT = 'swipe to see the map';

const parseTime = (iso) => DateTime.fromISO(iso || '', { setZone: true, locale: LOCALE });

// A calendar date as a whole number, so consecutive dates are always 1 apart,
// even when a daylight-saving change sits between them.
const dayNumber = (dt) => Date.UTC(dt.year, dt.month - 1, dt.day) / 86400000;

const clock = (dt) => dt.toFormat(dt.minute ? 'h:mm' : 'h');
const meridiem = (dt) => dt.toFormat('a');

// The site's compact hours (src/lib/residencies.js): "10 AM–2 PM", "6–10 PM".
// A pop-up that runs into a later day names the day it ends.
export function timeRange(start, end) {
  if (end.diff(start, 'hours').hours >= 24) {
    return `${clock(start)} ${meridiem(start)} – ${end.toFormat('ccc')} ${clock(end)} ${meridiem(end)}`;
  }
  return meridiem(start) === meridiem(end)
    ? `${clock(start)}–${clock(end)} ${meridiem(end)}`
    : `${clock(start)} ${meridiem(start)}–${clock(end)} ${meridiem(end)}`;
}

function joinWords(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`;
}

// Thu, Fri, Sat, Tue -> "Thu–Sat & Tue". With `byDate` the dates are named
// instead: "Nov 26–28 & Dec 3".
function dayList(days, byDate) {
  const runs = [];
  for (const day of days) {
    const run = runs[runs.length - 1];
    if (run && dayNumber(day) - dayNumber(run[1]) === 1) run[1] = day;
    else runs.push([day, day]);
  }
  const label = (day) => day.toFormat(byDate ? 'LLL d' : 'ccc');
  return joinWords(
    runs.flatMap(([first, last]) => {
      const length = dayNumber(last) - dayNumber(first);
      if (length === 0) return [label(first)];
      if (length === 1) return [label(first), label(last)];
      const end = byDate && first.month === last.month ? last.toFormat('d') : label(last);
      return [`${label(first)}–${end}`];
    }),
  );
}

// When a residency is on inside the listed window, its hours grouped like the
// site's schedule line, minus the "Every": "Thu–Sat & Tue 8 AM–1 PM",
// "Fri 6–10 PM, Tue 11 AM–5 PM". Weekday names only read right within a week,
// so dates that span more than one are named by date instead.
export function weekSchedule(occurrences) {
  const sorted = [...occurrences].sort((a, b) => a.start.toMillis() - b.start.toMillis());
  const groups = new Map();
  for (const { start, end } of sorted) {
    const key = `${start.toFormat('HH:mm')}-${end.toFormat('HH:mm')}`;
    if (!groups.has(key)) groups.set(key, { start, end, days: [] });
    const days = groups.get(key).days;
    if (!days.some((day) => dayNumber(day) === dayNumber(start))) days.push(start);
  }
  const span = sorted.length > 0 ? dayNumber(sorted[sorted.length - 1].start) - dayNumber(sorted[0].start) : 0;
  return [...groups.values()]
    .map((group) => `${dayList(group.days, span >= 7)} ${timeRange(group.start, group.end)}`)
    .join(', ');
}

// One scraped list card (see scrapeList in shot.mjs) -> what a slide needs.
// Cards without readable times are dropped.
function parseCard(card, index) {
  const start = parseTime(card.start);
  const end = parseTime(card.end);
  if (!card.name || !start.isValid || !end.isValid) return null;
  const occurrences = (card.occurrences || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => {
      const [from, to] = pair.split('/');
      return { start: parseTime(from), end: parseTime(to) };
    })
    .filter((occurrence) => occurrence.start.isValid && occurrence.end.isValid);
  return {
    index,
    name: card.name,
    venue: card.venue || '',
    neighborhood: card.neighborhood || '',
    categories: (card.categories || '').split(',').map((c) => c.trim()).filter(Boolean),
    residency: Boolean(card.residency),
    start,
    end,
    occurrences: occurrences.length > 0 ? occurrences : [{ start, end }],
  };
}

const byStart = (a, b) => a.start.toMillis() - b.start.toMillis() || a.index - b.index;

function row(item, when) {
  return {
    name: item.name,
    venue: item.venue,
    meta: [when, item.neighborhood].filter(Boolean).join(' · '),
    categories: item.categories,
    residency: item.residency,
  };
}

// Groups of day sections, one group per slide-sharing run of days (Thu + Fri,
// Sat, Sun, Mon + Tue, ...), in date order, plus the residency section (or
// null). Days without pop-ups are left out.
export function planSections(cards) {
  const items = cards.map(parseCard).filter(Boolean);

  const days = new Map();
  for (const item of items.filter((i) => !i.residency).sort(byStart)) {
    const key = item.start.toISODate();
    if (!days.has(key)) days.set(key, { kind: 'day', date: item.start.startOf('day'), rows: [] });
    days.get(key).rows.push(row(item, timeRange(item.start, item.end)));
  }

  const groups = new Map();
  for (const day of [...days.values()].sort((a, b) => dayNumber(a.date) - dayNumber(b.date))) {
    const anchor = JOINS_DAY_BEFORE.has(day.date.weekday) ? day.date.minus({ days: 1 }) : day.date;
    const key = anchor.toISODate();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(day);
  }

  const residencies = items
    .filter((i) => i.residency)
    .sort(byStart)
    .map((item) => row(item, weekSchedule(item.occurrences)));

  return {
    days: [...groups.values()],
    residencies: residencies.length > 0 ? { kind: 'residencies', rows: residencies } : null,
  };
}

// Lay sections out on slides. `fits(sections)` resolves whether those sections
// fit on one slide. Each group fills a slide while its days fit together; a
// day that doesn't fit on a slide of its own is split, and the slides it
// carries on to hold nothing else. Returns an array of slides, each an array
// of sections; a section carried on from the slide before has `cont: true`.
export async function paginate(groups, fits) {
  const slides = [];
  // How many of `rows`, from the top, fit on a slide after `before`.
  const fitting = async (before, section, rows) => {
    let count = 0;
    while (
      count < rows.length &&
      (await fits([...before, { ...section, rows: rows.slice(0, count + 1) }]))
    ) {
      count++;
    }
    return count;
  };

  for (const group of groups) {
    let open = null; // this group's slide that can still take a day
    for (const section of group) {
      if (open && (await fits([...open, section]))) {
        open.push(section);
        continue;
      }
      if (await fits([section])) {
        open = [section];
        slides.push(open);
        continue;
      }

      const parts = [];
      let rest = section.rows;
      if (open) {
        const count = await fitting(open, section, rest);
        if (count >= MIN_SHARED_ROWS) {
          const part = { ...section, rows: rest.slice(0, count) };
          open.push(part);
          parts.push(part);
          rest = rest.slice(count);
        }
      }
      while (rest.length > 0) {
        const head = { ...section, cont: parts.length > 0 };
        const count = await fitting([], head, rest);
        if (count === 0) throw new Error(`"${rest[0].name}" is too long to fit on a slide`);
        const part = { ...head, rows: rest.slice(0, count) };
        slides.push([part]);
        parts.push(part);
        rest = rest.slice(count);
      }
      await balance(parts, fits);
      open = null;
    }
  }
  return slides;
}

// Even out the last two slides of a split day, so it doesn't end on one lonely
// row: move rows down from the slide before while the last one has fewer. The
// last part always has its slide to itself.
async function balance(parts, fits) {
  if (parts.length < 2) return;
  const previous = parts[parts.length - 2];
  const last = parts[parts.length - 1];
  while (previous.rows.length - last.rows.length >= 2) {
    const rows = [previous.rows[previous.rows.length - 1], ...last.rows];
    if (!(await fits([{ ...last, rows }]))) break;
    previous.rows = previous.rows.slice(0, -1);
    last.rows = rows;
  }
}

const dayName = (section) => (section.kind === 'residencies' ? 'Residencies' : section.date.toFormat('cccc'));

// For file names: "thu-fri", "sat", "sat-cont", "residencies".
export function slideLabel(sections) {
  const names = sections.map((s) => (s.kind === 'residencies' ? 'residencies' : s.date.toFormat('ccc').toLowerCase()));
  return [...new Set(names)].join('-') + (sections.some((s) => s.cont) ? '-cont' : '');
}

// For the log: "Thursday & Friday, 5 pop-ups", "Saturday (continued), 4 pop-ups".
export function describeSlide(sections) {
  const count = sections.reduce((sum, s) => sum + s.rows.length, 0);
  const names = joinWords([...new Set(sections.map(dayName))]);
  const noun = sections[0].kind === 'residencies'
    ? (count === 1 ? 'residency' : 'residencies')
    : (count === 1 ? 'pop-up' : 'pop-ups');
  return `${names}${sections.some((s) => s.cont) ? ' (continued)' : ''}, ${count} ${noun}`;
}

const HOUSE_MARK =
  '<svg class="heading-mark" viewBox="0 0 12 12" fill="none" stroke="#0a1628" stroke-width="1" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  RESIDENCY_GLYPH_PATHS.map((d) => `<path d="${d}"/>`).join('') +
  '</svg>';

function headingHtml(section, dateLabel, offset) {
  const main = dayName(section);
  const sub = section.kind === 'residencies' ? dateLabel : section.date.toFormat('LLL d');
  const label = `${main} ${sub}${section.cont ? ' (continued)' : ''}`;
  return (
    `<h2 class="heading" aria-label="${escapeHtml(label)}">` +
    (section.kind === 'residencies' ? HOUSE_MARK : '') +
    `<span class="heading-main hand" aria-hidden="true">${jitter(main, offset)}</span>` +
    `<span class="heading-sub hand" aria-hidden="true">${jitter(sub, offset + main.length)}</span>` +
    (section.cont ? '<span class="heading-cont" aria-hidden="true">continued</span>' : '') +
    '</h2>'
  );
}

// The map's category icons, stacked when a vendor has more than one; a
// residency wears the house exponent on its first icon, as on the map.
function rowHtml(item) {
  const categories = (item.categories.length > 0 ? item.categories : ['other']).slice(0, 2);
  const scale = (categories.length > 1 ? PAIR_ICON_PX : ICON_PX) / MARKER_UNIT_PX;
  const icons = categories
    .map((category, i) => buildIconMarkerSvg([category], false, 1, scale, item.residency && i === 0).svg)
    .join('');
  const venue = item.venue ? `<span class="venue"> @ ${escapeHtml(item.venue)}</span>` : '';
  return (
    '<li class="row">' +
    `<span class="icons" aria-hidden="true">${icons}</span>` +
    '<span class="text">' +
    `<span class="title">${escapeHtml(item.name)}${venue}</span>` +
    `<span class="meta">${escapeHtml(item.meta)}</span>` +
    '</span></li>'
  );
}

// The inside of a slide's content area. `dateLabel` is the residency heading's
// date, the same label the cover and caption use.
export function sectionsHtml(sections, dateLabel) {
  return sections
    .map((section, i) =>
      `<section class="section">${headingHtml(section, dateLabel, 20 + i * 23)}` +
      `<ul class="rows">${section.rows.map(rowHtml).join('')}</ul></section>`)
    .join('');
}

// The empty slide: the site header for `citySlug` and the swipe note.
export async function buildSlideHtml({ citySlug, layout = 'portrait' }) {
  if (!citySlug) throw new Error('Slides require a city.');
  const [template, logo] = await Promise.all([readFile(TEMPLATE_URL, 'utf8'), readFile(LOGO_URL)]);
  const wordmark = `popups.fyi/${citySlug}`;
  const content = {
    LAYOUT: `slide--${layout}`,
    LABEL: escapeHtml(`Pop-ups on ${wordmark}`),
    LOGO: `data:image/svg+xml;base64,${logo.toString('base64')}`,
    WORDMARK_LABEL: escapeHtml(wordmark),
    WORDMARK: jitter(wordmark, 0),
    SWIPE: jitter(SWIPE_TEXT, 60),
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => content[key]);
}

// Runs in the page: shows `html` in the content area and says whether it fits.
function showSections(html) {
  const content = document.querySelector('.content');
  content.innerHTML = html;
  const last = content.lastElementChild;
  return !last || last.getBoundingClientRect().bottom <= content.getBoundingClientRect().bottom + 0.5;
}

// Runs in the page: anything drawn outside the slide, or a heading too wide
// for the content area.
function findClipped() {
  const bounds = document.querySelector('.slide').getBoundingClientRect();
  const outside = [...document.querySelectorAll('.logo, .glyph, .arrow-shaft, .arrow-head, .heading-mark, .heading-cont, .row')]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < bounds.left - 0.5 || rect.right > bounds.right + 0.5 ||
        rect.top < bounds.top - 0.5 || rect.bottom > bounds.bottom + 0.5;
    })
    .map((element) => element.getAttribute('class'));
  const wide = [...document.querySelectorAll('.heading')]
    .filter((heading) => heading.scrollWidth > heading.clientWidth + 0.5)
    .map(() => 'heading');
  return [...outside, ...wide];
}

// Renders the slides for the scraped list `cards` and saves each as a JPEG at
// `outputPathFor(number, label)`. Resolves to [{ path, description }], empty
// when there is nothing to list.
export async function renderSlides(browser, {
  cards,
  citySlug,
  dateLabel,
  size,
  layout = 'portrait',
  outputPathFor,
  timeout = 45000,
}) {
  const plan = planSections(cards);
  const groups = [...plan.days, ...(plan.residencies ? [[plan.residencies]] : [])];
  if (groups.length === 0) return [];

  const html = await buildSlideHtml({ citySlug, layout });
  const deviceScaleFactor = size.width / DESIGN_WIDTH;
  const page = await browser.newPage({
    viewport: { width: DESIGN_WIDTH, height: Math.round(size.height / deviceScaleFactor) },
    deviceScaleFactor,
    colorScheme: 'light',
  });

  try {
    page.setDefaultTimeout(timeout);
    await page.setContent(html, { waitUntil: 'load', timeout });
    await page.evaluate(async () => {
      const fonts = await document.fonts.load('36px "Indie Flower"');
      await document.fonts.ready;
      if (!fonts.length || fonts.some((font) => font.status !== 'loaded')) {
        throw new Error('Slide font Indie Flower could not load; refusing to save fallback-font slides.');
      }
      await Promise.all([...document.images].map((image) => image.decode()));
    });

    const fits = (sections) => page.evaluate(showSections, sectionsHtml(sections, dateLabel));
    const slides = await paginate(groups, fits);

    const saved = [];
    for (const [i, sections] of slides.entries()) {
      if (!(await fits(sections))) throw new Error(`Slide ${i + 1} overflows: ${describeSlide(sections)}`);
      const clipped = await page.evaluate(findClipped);
      if (clipped.length) throw new Error(`Slide layout would clip: ${[...new Set(clipped)].join(', ')}`);
      const outputPath = outputPathFor(i + 1, slideLabel(sections));
      await page.locator('.slide').screenshot({
        path: outputPath,
        type: 'jpeg',
        quality: 98,
        animations: 'disabled',
        scale: 'device',
      });
      saved.push({ path: outputPath, description: describeSlide(sections) });
    }
    return saved;
  } finally {
    await page.close();
  }
}
