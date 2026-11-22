import assert from 'node:assert/strict';
import test from 'node:test';
import { DateTime } from 'luxon';
import {
  pagePathFor,
  parsePagePath,
  popupHasPage,
  popupSlugs,
  residencySlugs,
  slugify,
  vendorKey,
  vendorPagePathFor,
  vendorPages,
  vendorSlugs,
} from './pages.js';

const zone = 'America/Los_Angeles';
function popup(id, name, venue, start, extra = {}) {
  const s = DateTime.fromISO(start, { zone });
  return {
    id: String(id),
    name,
    location_name: venue,
    start: s,
    end: s.plus({ hours: 4 }),
    lat: 47.6,
    lng: -122.33,
    city: 'Seattle',
    ...extra,
  };
}

test('slugs fold accents, special letters, ampersands and apostrophes', () => {
  assert.equal(slugify('Béo Béo Bakery'), 'beo-beo-bakery');
  assert.equal(slugify('Nâu Đá Café'), 'nau-da-cafe');
  assert.equal(slugify('Ngõ - Vietnamese Street Food ＆ Tea'), 'ngo-vietnamese-street-food-and-tea');
  assert.equal(slugify("Nicho's Matcha Cafe"), 'nichos-matcha-cafe');
  assert.equal(slugify('[solidcore] Capitol Hill'), 'solidcore-capitol-hill');
  assert.equal(slugify('  ☕  '), '');
});

test('vendor key ignores case, spacing, accents and punctuation', () => {
  assert.equal(vendorKey('Thức Cafe'), vendorKey('thuc  cafe'));
  assert.equal(vendorKey("NICHO'S Matcha Cafe"), vendorKey('Nichos Matcha Cafe'));
  assert.notEqual(vendorKey('Salt & Creme'), vendorKey('Salt Creme'));
});

test('pop-up slugs use vendor, venue and local date', () => {
  const slugs = popupSlugs([popup(1, 'Béo Béo Bakery', 'Parlour', '2026-11-25T09:00')]);
  assert.equal(slugs.get('1'), 'beo-beo-bakery-parlour-2026-11-25');
});

test('collisions are deterministic and new rows never rename old pages', () => {
  const a = popup(344, 'Em Studio Cafe', 'Seattle Center', '2025-10-10T11:00');
  const b = popup(345, 'Em Studio Cafe', 'Seattle Center', '2025-10-10T11:00');
  const later = popup(1000, 'Em Studio Cafe', 'Seattle Center', '2025-10-10T15:00');
  const first = popupSlugs([b, a]);
  assert.equal(first.get('344'), 'em-studio-cafe-seattle-center-2025-10-10');
  assert.equal(first.get('345'), 'em-studio-cafe-seattle-center-2025-10-10-2');
  assert.deepEqual(popupSlugs([a, b]), first);
  const withLater = popupSlugs([later, a, b]);
  assert.equal(withLater.get('344'), first.get('344'));
  assert.equal(withLater.get('345'), first.get('345'));
  assert.equal(withLater.get('1000'), 'em-studio-cafe-seattle-center-2025-10-10-3');
});

test('a suffixed slug never takes another listing\'s plain slug', () => {
  const r = (id, name, venue) => ({ id, name, location_name: venue, lat: 47.6, lng: -122.33, city: 'Seattle' });
  const slugs = residencySlugs([r('res-1', 'Foo', 'Bar'), r('res-2', 'Foo', 'Bar'), r('res-3', 'Foo', 'Bar 2')]);
  assert.equal(slugs.get('res-1'), 'foo-bar');
  assert.equal(slugs.get('res-3'), 'foo-bar-2');
  assert.equal(slugs.get('res-2'), 'foo-bar-3');
});

test('the same slug is fine in two different cities', () => {
  const sf = popup(2, 'Béo Béo Bakery', 'Parlour', '2026-11-25T09:00', { city: 'San Francisco', lat: 37.77, lng: -122.42 });
  const slugs = popupSlugs([popup(1, 'Béo Béo Bakery', 'Parlour', '2026-11-25T09:00'), sf]);
  assert.equal(slugs.get('1'), slugs.get('2'));
});

test('vendor slugs fall back for names without letters', () => {
  const slugs = vendorSlugs(['beo-beo-bakery', '☕', '🍩']);
  assert.equal(slugs.get('beo-beo-bakery'), 'beo-beo-bakery');
  assert.deepEqual([slugs.get('☕'), slugs.get('🍩')].sort(), ['vendor', 'vendor-2']);
});

test('pages exist until 30 days after a pop-up ends', () => {
  const p = popup(1, 'Béo Béo Bakery', 'Parlour', '2026-11-01T09:00');
  const slugs = { popups: popupSlugs([p]), residencies: new Map() };
  const soon = DateTime.fromISO('2026-11-20T12:00', { zone });
  const late = DateTime.fromISO('2026-12-05T12:00', { zone });
  assert.equal(popupHasPage(p, soon), true);
  assert.equal(pagePathFor(p, slugs, soon), '/seattle/popups/beo-beo-bakery-parlour-2026-11-01');
  assert.equal(popupHasPage(p, late), false);
  assert.equal(pagePathFor(p, slugs, late), null);
});

test('page paths parse back to city, kind and slug', () => {
  assert.equal(parsePagePath('/seattle/popups/beo-beo-bakery-parlour-2026-11-25').slug, 'beo-beo-bakery-parlour-2026-11-25');
  assert.equal(parsePagePath('/sf/vendors/mackbox-desserts').city.slug, 'sanfrancisco');
  assert.equal(parsePagePath('/seattle'), null);
  assert.equal(parsePagePath('/seattle/menus/x'), null);
  assert.equal(parsePagePath('/nowhere/popups/x'), null);
});

test('vendors have a page while active in the last 90 days, one per city', () => {
  const now = DateTime.fromISO('2026-11-21T12:00', { zone });
  const sf = { city: 'San Francisco', lat: 37.77, lng: -122.42 };
  const rows = [
    popup(1, 'Béo Béo Bakery', 'Parlour', '2026-11-25T09:00'), // upcoming
    popup(2, 'Thức Cafe', 'Chibi Tings', '2026-10-01T09:00'), // 51 days ago
    popup(3, 'Thuc Cafe', 'Chibi Tings', '2026-06-01T09:00'), // same vendor, older
    popup(4, 'Old Bakery', 'Somewhere', '2026-05-01T09:00'), // inactive
    popup(5, 'Béo Béo Bakery', 'Parlour', '2026-11-26T09:00', sf), // same vendor, SF
  ];
  const residency = {
    kind: 'residency',
    id: 'res-1',
    name: 'Standard Matcha',
    lat: 47.6,
    lng: -122.33,
    city: 'Seattle',
    lastDay: DateTime.fromISO('2026-09-30', { zone }), // ended 52 days ago
  };
  const pages = vendorPages(rows, [residency], now);
  assert.equal(vendorPagePathFor(rows[0], pages), '/seattle/vendors/beo-beo-bakery');
  assert.equal(vendorPagePathFor(rows[4], pages), '/sanfrancisco/vendors/beo-beo-bakery');
  assert.equal(vendorPagePathFor(rows[2], pages), '/seattle/vendors/thuc-cafe');
  assert.equal(vendorPagePathFor(rows[1], pages), vendorPagePathFor(rows[2], pages));
  assert.equal(vendorPagePathFor(residency, pages), '/seattle/vendors/standard-matcha');
  assert.equal(vendorPagePathFor(rows[3], pages), null);
  assert.equal(vendorPagePathFor({ ...rows[0], lat: 0, lng: 0, city: 'Nowhere' }, pages), null);
});
