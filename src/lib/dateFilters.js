import { DateTime } from 'luxon';
import { ANCHOR_TIMEZONE } from './config.js';

export const FILTERS = ['today', 'weekend', 'week', 'custom'];

// Custom range may not exceed 14 days end-to-end (inclusive of both endpoints).
export const CUSTOM_MAX_DAYS = 14;

// Anchor "now" used for all comparisons. Pure function -> easy to reason about.
function anchorNow(zone = ANCHOR_TIMEZONE) {
  return DateTime.now().setZone(zone);
}

// Returns true if the popup's end is still in the future (in its own tz).
export function isUpcoming(popup, now = DateTime.now()) {
  return popup.end.toMillis() > now.toMillis();
}

// "Today": event's start is on the current calendar date in the anchor tz.
function isToday(popup, now, zone) {
  const startLocal = popup.start.setZone(zone);
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

function isThisWeekend(popup, now, zone) {
  const { start, end } = weekendRange(now);
  const startLocal = popup.start.setZone(zone);
  return startLocal >= start && startLocal <= end;
}

// "This week": the next 7 days - today and the six days after it, through
// end of day in the anchor tz - rather than the calendar week, so a visit on
// a Saturday or Sunday still shows the week ahead instead of a day or two.
// Past-event filtering (end < now) already happens upstream, so events that
// are currently in progress show up naturally.
const WEEK_DAYS = 7;
function isThisWeek(popup, now, zone) {
  const windowEnd = now.plus({ days: WEEK_DAYS - 1 }).endOf('day');
  const startLocal = popup.start.setZone(zone);
  return startLocal <= windowEnd;
}

// Filter+sort the popup list. Past events (end < now in their own tz) are
// always hidden, regardless of which filter is active.
// `customRange` is { from, to } as 'YYYY-MM-DD' strings (anchor-tz dates),
// only consulted when filter === 'custom'.
// `zone` anchors the relative windows to the active city's timezone.
export function filterPopups(popups, filter, customRange, zone = ANCHOR_TIMEZONE) {
  const now = anchorNow(zone);
  const realNow = DateTime.now();
  let fn;
  if (filter === 'today') {
    fn = isToday;
  } else if (filter === 'weekend') {
    fn = isThisWeekend;
  } else if (filter === 'custom') {
    const range = validateCustomRange(customRange, zone);
    if (!range) return [];
    fn = (p) => isInCustomRange(p, range, zone);
  } else {
    fn = isThisWeek;
  }
  return popups
    .filter((p) => isUpcoming(p, realNow))
    .filter((p) => fn(p, now, zone))
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());
}

// Returns { startDt, endDt } in anchor tz if the range is valid (both dates
// parse, end >= start, span <= CUSTOM_MAX_DAYS). Otherwise null.
export function validateCustomRange(range, zone = ANCHOR_TIMEZONE) {
  if (!range || !range.from || !range.to) return null;
  const startDt = DateTime.fromISO(range.from, { zone }).startOf('day');
  const endDt = DateTime.fromISO(range.to, { zone }).endOf('day');
  if (!startDt.isValid || !endDt.isValid) return null;
  if (endDt < startDt) return null;
  const days = endDt.startOf('day').diff(startDt, 'days').days + 1;
  if (days > CUSTOM_MAX_DAYS) return null;
  return { startDt, endDt };
}

function isInCustomRange(popup, range, zone) {
  const startLocal = popup.start.setZone(zone);
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
