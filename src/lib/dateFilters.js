import { DateTime } from 'luxon';
import { ANCHOR_TIMEZONE } from './config.js';

export const FILTERS = ['today', 'weekend', 'week', 'custom'];

// Custom range may not exceed 14 days end-to-end (inclusive of both endpoints).
export const CUSTOM_MAX_DAYS = 14;

// Anchor "now" used for all comparisons. Pure function -> easy to reason about.
function anchorNow() {
  return DateTime.now().setZone(ANCHOR_TIMEZONE);
}

// Returns true if the popup's end is still in the future (in its own tz).
export function isUpcoming(popup, now = DateTime.now()) {
  return popup.end.toMillis() > now.toMillis();
}

// "Today": event's start is on the current calendar date in the anchor tz.
function isToday(popup, now) {
  const startLocal = popup.start.setZone(ANCHOR_TIMEZONE);
  return startLocal.hasSame(now, 'day');
}

// Compute the upcoming (or current) Sat/Sun window in the anchor tz.
// - Mon..Thu (1..4): next Sat and Sun
// - Fri (5): upcoming Sat and Sun
// - Sat (6): today (Sat) and tomorrow (Sun)
// - Sun (7): today only (Sun)
function weekendRange(now) {
  const dow = now.weekday; // 1=Mon..7=Sun
  let satOffset;
  let sunOffset;
  if (dow === 7) {
    // Sunday — weekend is just today
    satOffset = null;
    sunOffset = 0;
  } else if (dow === 6) {
    satOffset = 0;
    sunOffset = 1;
  } else {
    satOffset = 6 - dow; // Mon=5, Tue=4, Wed=3, Thu=2, Fri=1
    sunOffset = satOffset + 1;
  }
  const start =
    satOffset !== null
      ? now.plus({ days: satOffset }).startOf('day')
      : now.plus({ days: sunOffset }).startOf('day');
  const end = now.plus({ days: sunOffset }).endOf('day');
  return { start, end };
}

function isThisWeekend(popup, now) {
  const { start, end } = weekendRange(now);
  const startLocal = popup.start.setZone(ANCHOR_TIMEZONE);
  return startLocal >= start && startLocal <= end;
}

// "This week": from now through end-of-day Sunday in anchor tz.
// Past-event filtering (end < now) already happens upstream, so events that
// are currently in progress show up naturally.
function isThisWeek(popup, now) {
  const dow = now.weekday; // 1..7, where 7=Sun
  const daysUntilSunday = 7 - dow; // Sun=0
  const windowEnd = now.plus({ days: daysUntilSunday }).endOf('day');
  const startLocal = popup.start.setZone(ANCHOR_TIMEZONE);
  return startLocal <= windowEnd;
}

// Filter+sort the popup list. Past events (end < now in their own tz) are
// always hidden, regardless of which filter is active.
// `customRange` is { from, to } as 'YYYY-MM-DD' strings (anchor-tz dates),
// only consulted when filter === 'custom'.
export function filterPopups(popups, filter, customRange) {
  const now = anchorNow();
  const realNow = DateTime.now();
  let fn;
  if (filter === 'today') {
    fn = isToday;
  } else if (filter === 'weekend') {
    fn = isThisWeekend;
  } else if (filter === 'custom') {
    const range = validateCustomRange(customRange);
    if (!range) return [];
    fn = (p) => isInCustomRange(p, range);
  } else {
    fn = isThisWeek;
  }
  return popups
    .filter((p) => isUpcoming(p, realNow))
    .filter((p) => fn(p, now))
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());
}

// Returns { startDt, endDt } in anchor tz if the range is valid (both dates
// parse, end >= start, span <= CUSTOM_MAX_DAYS). Otherwise null.
export function validateCustomRange(range) {
  if (!range || !range.from || !range.to) return null;
  const startDt = DateTime.fromISO(range.from, { zone: ANCHOR_TIMEZONE }).startOf('day');
  const endDt = DateTime.fromISO(range.to, { zone: ANCHOR_TIMEZONE }).endOf('day');
  if (!startDt.isValid || !endDt.isValid) return null;
  if (endDt < startDt) return null;
  const days = endDt.startOf('day').diff(startDt, 'days').days + 1;
  if (days > CUSTOM_MAX_DAYS) return null;
  return { startDt, endDt };
}

function isInCustomRange(popup, range) {
  const startLocal = popup.start.setZone(ANCHOR_TIMEZONE);
  return startLocal >= range.startDt && startLocal <= range.endDt;
}

// Pretty card label: "Wed May 20 · 9:00 AM – 3:00 PM" in event's tz.
export function formatCardDateTime(popup) {
  const day = popup.start.toFormat('ccc LLL d');
  const s = popup.start.toFormat('h:mm a');
  const e = popup.end.toFormat('h:mm a');
  return `${day} · ${s} – ${e}`;
}

// Short label for marker popups.
export function formatTimeRange(popup) {
  return `${popup.start.toFormat('h:mm a')} – ${popup.end.toFormat('h:mm a')}`;
}
