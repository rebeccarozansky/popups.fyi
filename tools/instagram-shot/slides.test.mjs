import assert from 'node:assert/strict';
import test from 'node:test';
import { DateTime } from 'luxon';
import {
  buildSlideHtml,
  describeSlide,
  paginate,
  planSections,
  renderSlides,
  sectionsHtml,
  slideLabel,
  timeRange,
  weekSchedule,
} from './slides.mjs';

const at = (iso) => DateTime.fromISO(iso, { setZone: true, locale: 'en-US' });
const pst = (date, time) => `${date}T${time}:00-08:00`;

function card(name, date, from, to, extra = {}) {
  return { name, venue: 'Venue', start: pst(date, from), end: pst(date, to), ...extra };
}

function residency(name, slots, extra = {}) {
  const occurrences = slots.map(([date, from, to]) => `${pst(date, from)}/${pst(date, to)}`);
  return {
    name,
    venue: 'Cafe',
    residency: 'Every ...',
    start: occurrences[0].split('/')[0],
    end: occurrences[0].split('/')[1],
    occurrences: occurrences.join(' '),
    ...extra,
  };
}

test('hours read like the site: compact, sharing AM/PM, naming a later end day', () => {
  assert.equal(timeRange(at(pst('2026-11-28', '10:00')), at(pst('2026-11-28', '14:00'))), '10 AM–2 PM');
  assert.equal(timeRange(at(pst('2026-11-28', '18:00')), at(pst('2026-11-28', '22:00'))), '6–10 PM');
  assert.equal(timeRange(at(pst('2026-11-28', '08:30')), at(pst('2026-11-28', '12:00'))), '8:30 AM–12 PM');
  assert.equal(timeRange(at(pst('2026-11-28', '23:00')), at(pst('2026-11-29', '02:00'))), '11 PM–2 AM');
  assert.equal(timeRange(at(pst('2026-11-26', '10:00')), at(pst('2026-11-28', '17:00'))), '10 AM – Sat 5 PM');
});

test('a residency lists only this week\'s days, grouped by hours', () => {
  const occurrences = (slots) =>
    slots.map(([date, from, to]) => ({ start: at(pst(date, from)), end: at(pst(date, to)) }));
  assert.equal(
    weekSchedule(occurrences([
      ['2026-11-26', '08:00', '13:00'], ['2026-11-27', '08:00', '13:00'],
      ['2026-11-28', '08:00', '13:00'], ['2026-12-01', '08:00', '13:00'],
    ])),
    'Thu–Sat & Tue 8 AM–1 PM',
  );
  assert.equal(
    weekSchedule(occurrences([['2026-12-01', '11:00', '17:00'], ['2026-11-27', '18:00', '22:00']])),
    'Fri 6–10 PM, Tue 11 AM–5 PM',
  );
  assert.equal(
    weekSchedule(occurrences([['2026-11-27', '08:00', '13:00'], ['2026-11-28', '08:00', '13:00']])),
    'Fri & Sat 8 AM–1 PM',
  );
  // Over more than a week, weekday names would be ambiguous.
  assert.equal(
    weekSchedule(occurrences([
      ['2026-11-26', '09:00', '14:00'], ['2026-11-27', '09:00', '14:00'],
      ['2026-11-28', '09:00', '14:00'], ['2026-12-03', '09:00', '14:00'],
    ])),
    'Nov 26–28 & Dec 3 9 AM–2 PM',
  );
});

test('Thursday joins Friday and Monday joins Tuesday; weekend days and Wednesday stand alone', () => {
  const plan = planSections([
    card('Tue', '2026-12-01', '10:00', '12:00'),
    card('Sat late', '2026-11-28', '13:00', '15:00'),
    card('Thu', '2026-11-26', '10:00', '12:00'),
    card('Sat early', '2026-11-28', '09:00', '11:00'),
    card('Fri', '2026-11-27', '10:00', '12:00'),
    card('Sun', '2026-11-29', '10:00', '12:00'),
    card('Mon', '2026-11-30', '10:00', '12:00'),
    card('Wed', '2026-12-02', '10:00', '12:00'),
  ]);
  const shape = plan.days.map((group) =>
    group.map((day) => `${day.date.toFormat('ccc')}: ${day.rows.map((r) => r.name).join(', ')}`));
  assert.deepEqual(shape, [
    ['Thu: Thu', 'Fri: Fri'],
    ['Sat: Sat early, Sat late'],
    ['Sun: Sun'],
    ['Mon: Mon', 'Tue: Tue'],
    ['Wed: Wed'],
  ]);
  assert.equal(plan.residencies, null);
});

test('days without pop-ups are left out, and a pair can be one day on its own', () => {
  const plan = planSections([card('Fri', '2026-11-27', '14:00', '19:00'), card('Mon', '2026-11-30', '10:00', '14:00')]);
  assert.deepEqual(plan.days.map((group) => group.map((day) => day.date.toISODate())), [
    ['2026-11-27'],
    ['2026-11-30'],
  ]);
});

test('residencies leave the days for a section of their own, in order of their first date', () => {
  const plan = planSections([
    card('Pop-up', '2026-11-28', '10:00', '12:00', { neighborhood: 'Fremont', categories: 'bakery' }),
    residency('Standard Matcha', [['2026-11-27', '18:00', '22:00'], ['2026-12-01', '11:00', '17:00']], {
      neighborhood: 'Queen Anne', categories: 'matcha',
    }),
    residency('Numa', [['2026-11-26', '08:00', '13:00'], ['2026-11-27', '08:00', '13:00']]),
  ]);
  assert.deepEqual(plan.days.flat().flatMap((day) => day.rows.map((r) => r.name)), ['Pop-up']);
  assert.equal(plan.days[0][0].rows[0].meta, '10 AM–12 PM · Fremont');
  assert.deepEqual(plan.residencies.rows.map((r) => [r.name, r.meta, r.residency]), [
    ['Numa', 'Thu & Fri 8 AM–1 PM', true],
    ['Standard Matcha', 'Fri 6–10 PM, Tue 11 AM–5 PM · Queen Anne', true],
  ]);
});

test('cards without readable times are skipped', () => {
  const plan = planSections([{ name: 'Old site card', venue: 'X', when: 'Sat Nov 28' }]);
  assert.deepEqual(plan.days, []);
  assert.equal(plan.residencies, null);
});

// A slide holds CAPACITY units: a heading is one, and so is each row.
const CAPACITY = 8;
const fits = async (sections) => sections.reduce((sum, s) => sum + 1 + s.rows.length, 0) <= CAPACITY;
const day = (date, count) => ({
  kind: 'day',
  date: at(`${date}T00:00:00-08:00`),
  rows: Array.from({ length: count }, (_, i) => ({ name: `${date} #${i + 1}` })),
});
const layout = (slides) =>
  slides.map((slide) =>
    slide.map((s) => `${s.kind === 'day' ? s.date.toFormat('ccc') : 'Res'}${s.cont ? '+' : ''} ${s.rows.length}`));

test('a pair shares a slide when it fits, else each day gets its own', async () => {
  assert.deepEqual(layout(await paginate([[day('2026-11-26', 2), day('2026-11-27', 3)]], fits)), [['Thu 2', 'Fri 3']]);
  assert.deepEqual(layout(await paginate([[day('2026-11-26', 4), day('2026-11-27', 4)]], fits)), [['Thu 4'], ['Fri 4']]);
});

test('Saturday and Sunday never share a slide', async () => {
  const groups = planSections([
    card('Sat', '2026-11-28', '10:00', '12:00'),
    card('Sun', '2026-11-29', '10:00', '12:00'),
  ]).days;
  assert.deepEqual(layout(await paginate(groups, fits)), [['Sat 1'], ['Sun 1']]);
});

test('a day too long for one slide carries on to a slide of its own, evened out', async () => {
  assert.deepEqual(layout(await paginate([[day('2026-11-28', 10)]], fits)), [['Sat 5'], ['Sat+ 5']]);
  assert.deepEqual(layout(await paginate([[day('2026-11-28', 15)]], fits)), [['Sat 7'], ['Sat+ 4'], ['Sat+ 4']]);
});

test('the day after a split day never joins its continuation slide', async () => {
  assert.deepEqual(layout(await paginate([[day('2026-11-26', 9), day('2026-11-27', 2)]], fits)), [
    ['Thu 5'],
    ['Thu+ 4'],
    ['Fri 2'],
  ]);
});

test('a split day can start under the other day of its pair, when enough of it fits', async () => {
  assert.deepEqual(layout(await paginate([[day('2026-11-26', 2), day('2026-11-27', 9)]], fits)), [
    ['Thu 2', 'Fri 4'],
    ['Fri+ 5'],
  ]);
  // Only one row would fit under Thursday, so Friday starts afresh.
  assert.deepEqual(layout(await paginate([[day('2026-11-26', 5), day('2026-11-27', 9)]], fits)), [
    ['Thu 5'],
    ['Fri 5'],
    ['Fri+ 4'],
  ]);
});

test('residencies paginate the same way', async () => {
  const plan = planSections(
    Array.from({ length: 9 }, (_, i) => residency(`R${i}`, [['2026-11-27', '08:00', '13:00']])),
  );
  assert.deepEqual(layout(await paginate([[plan.residencies]], fits)), [['Res 5'], ['Res+ 4']]);
});

test('slide labels and log lines name the days', () => {
  const thu = day('2026-11-26', 2);
  const fri = day('2026-11-27', 1);
  assert.equal(slideLabel([thu, fri]), 'thu-fri');
  assert.equal(slideLabel([{ ...fri, cont: true }]), 'fri-cont');
  assert.equal(slideLabel([{ kind: 'residencies', rows: [] }]), 'residencies');
  assert.equal(describeSlide([thu, fri]), 'Thursday & Friday, 3 pop-ups');
  assert.equal(describeSlide([{ ...fri, cont: true }]), 'Friday (continued), 1 pop-up');
  assert.equal(describeSlide([{ kind: 'residencies', rows: [{}] }]), 'Residencies, 1 residency');
});

test('slide text is escaped and residencies wear the house mark', () => {
  const plan = planSections([
    card('<b>Cakes</b> & Co', '2026-11-28', '10:00', '12:00', { venue: '"Cafe" <x>' }),
    residency('Numa', [['2026-11-27', '08:00', '13:00']], { categories: 'coffee' }),
  ]);
  const html = sectionsHtml([plan.days[0][0], { ...plan.residencies, cont: true }], 'Nov 26 – Dec 1');
  assert.ok(html.includes('&lt;b&gt;Cakes&lt;/b&gt; &amp; Co'));
  assert.ok(html.includes('@ &quot;Cafe&quot; &lt;x&gt;'));
  assert.ok(!html.includes('<b>'));
  assert.ok(html.includes('aria-label="Saturday Nov 28"'));
  assert.ok(html.includes('aria-label="Residencies Nov 26 – Dec 1 (continued)"'));
  assert.ok(html.includes('class="heading-mark"'));
  assert.ok(html.includes('>continued</span>'));
});

test('the slide frame carries the site header for the city and the swipe note', async () => {
  const html = await buildSlideHtml({ citySlug: 'sanfrancisco' });
  assert.ok(html.includes('aria-label="popups.fyi/sanfrancisco"'));
  assert.ok(html.includes('aria-label="Swipe to see the map"'));
  assert.ok(html.includes("font-family: 'Indie Flower'"));
  assert.ok(html.includes('src="data:image/svg+xml;base64,'));
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(html));
  assert.ok(!html.includes('<script'));
  await assert.rejects(buildSlideHtml({}), /require a city/);
});

function fakeBrowser() {
  const calls = { shots: [], pages: 0 };
  const page = {
    setDefaultTimeout(value) { calls.timeout = value; },
    async setContent(html) { calls.html = html; },
    async evaluate(fn) { return fn.name === 'findClipped' ? [] : true; },
    locator(selector) {
      return { async screenshot(options) { calls.shots.push({ selector, ...options }); } };
    },
    async close() { calls.closed = true; },
  };
  return {
    calls,
    browser: { async newPage(options) { calls.pages++; calls.pageOptions = options; return page; } },
  };
}

test('renderSlides saves one JPEG per slide, in carousel order, at the cover\'s scale', async () => {
  const { browser, calls } = fakeBrowser();
  const saved = await renderSlides(browser, {
    cards: [
      card('Sat', '2026-11-28', '10:00', '12:00'),
      card('Thu', '2026-11-26', '10:00', '12:00'),
      residency('Numa', [['2026-11-27', '08:00', '13:00']]),
    ],
    citySlug: 'seattle',
    dateLabel: 'Nov 26 – Dec 1',
    size: { width: 1080, height: 1350 },
    outputPathFor: (number, label) => `slide-${number}-${label}.jpg`,
    timeout: 12000,
  });
  assert.deepEqual(saved.map((s) => s.path), ['slide-1-thu.jpg', 'slide-2-sat.jpg', 'slide-3-residencies.jpg']);
  assert.deepEqual(calls.pageOptions.viewport, { width: 540, height: 675 });
  assert.equal(calls.pageOptions.deviceScaleFactor, 2);
  assert.equal(calls.timeout, 12000);
  assert.deepEqual(calls.shots[0], {
    selector: '.slide', path: 'slide-1-thu.jpg', type: 'jpeg', quality: 98,
    animations: 'disabled', scale: 'device',
  });
  assert.equal(calls.closed, true);
});

test('renderSlides makes nothing, and opens no page, when nothing is listed', async () => {
  const { browser, calls } = fakeBrowser();
  const saved = await renderSlides(browser, {
    cards: [],
    citySlug: 'seattle',
    dateLabel: 'this week',
    size: { width: 1080, height: 1350 },
    outputPathFor: () => 'unused.jpg',
  });
  assert.deepEqual(saved, []);
  assert.equal(calls.pages, 0);
});
