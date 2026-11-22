import { DateTime } from 'luxon';
import { ANCHOR_TIMEZONE } from './config.js';
import { filterPopups, validateCustomRange } from './dateFilters.js';

// Residencies arrive as weekly slots (see normalizeResidencyRow in csv.js): one
// per sheet row, several when a vendor keeps different hours on different days
// at the same venue. Everything downstream - date filters, sorting, the map,
// the "already happened" check - works on concrete { start, end } times, so
// these helpers expand the slots into dated occurrences and hand back a
// pop-up-shaped "entry": the residency's own fields plus the start/end of the
// occurrence being featured.
//
// A residency is ONE card and ONE marker however many of its days fall inside
// the active filter. Otherwise a Fri-Sun residency would put three identical
// cards in "This Week" and every standing slot would crowd out the one-offs.

export function isResidency(popup) {
  return popup?.kind === 'residency';
}

// Every occurrence, across all of the residency's weekly slots, whose calendar
// day (in the residency's own timezone) falls between `from` and `to`
// inclusive, minus skip dates. In time order.
export function occurrencesBetween(res, from, to) {
  const zone = res.timezone;
  const out = [];
  for (const slot of res.slots) {
    let day = DateTime.max(from.setZone(zone).startOf('day'), slot.firstDay);
    let last = to.setZone(zone).startOf('day');
    if (slot.lastDay && slot.lastDay < last) last = slot.lastDay;

    for (; day <= last; day = day.plus({ days: 1 })) {
      if (!slot.days.includes(day.weekday)) continue;
      if (slot.skipDates.has(day.toISODate())) continue;
      const start = day.set({ hour: slot.startTime.hour, minute: slot.startTime.minute });
      let end = day.set({ hour: slot.endTime.hour, minute: slot.endTime.minute });
      // A slot that ends at or before its start time runs past midnight.
      if (end <= start) end = end.plus({ days: 1 });
      out.push({ start, end });
    }
  }
  return out.sort((a, b) => a.start.toMillis() - b.start.toMillis());
}

function entryFor(res, occurrences) {
  return { ...res, start: occurrences[0].start, end: occurrences[0].end, occurrences };
}

// Residencies with at least one occurrence inside the active date filter, each
// featuring its first such occurrence. The occurrences go through filterPopups
// so "today", "weekend", "this week" and custom ranges mean exactly what they
// mean for one-off pop-ups - including hiding ones that have already finished.
export function filterResidencies(residencies, filter, customRange, zone = ANCHOR_TIMEZONE) {
  let from;
  let to;
  if (filter === 'custom') {
    const range = validateCustomRange(customRange, zone);
    if (!range) return [];
    from = range.startDt;
    to = range.endDt;
  } else {
    // Every relative filter ends within the next 7 days. Starting a day back
    // keeps a late-night slot that began yesterday and is still going.
    const now = DateTime.now().setZone(zone);
    from = now.minus({ days: 1 });
    to = now.plus({ days: 7 });
  }

  const out = [];
  for (const res of residencies) {
    const inRange = filterPopups(occurrencesBetween(res, from, to), filter, customRange, zone);
    if (inRange.length > 0) out.push(entryFor(res, inRange));
  }
  return out;
}

// Outside a date filter (saved list, shared links) feature the next occurrence
// that hasn't finished. Once the run is over, feature its final occurrence
// instead, so the card reads as ended rather than vanishing.
export function residencyEntryNow(res, now = DateTime.now()) {
  const upcoming = occurrencesBetween(res, now.minus({ days: 1 }), now.plus({ days: 366 })).filter(
    (occurrence) => occurrence.end > now,
  );
  if (upcoming.length > 0) return entryFor(res, upcoming.slice(0, 1));
  if (res.lastDay) {
    const finalWeek = occurrencesBetween(res, res.lastDay.minus({ days: 6 }), res.lastDay);
    if (finalWeek.length > 0) return entryFor(res, finalWeek.slice(-1));
  }
  return null;
}

const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function joinWords(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`;
}

// [6, 7] -> "Sat & Sun", [5, 6, 7] -> "Fri–Sun", all 7 -> "day".
function weekdayList(days) {
  if (days.length === 7) return 'day';
  const runs = [];
  for (const d of days) {
    const run = runs[runs.length - 1];
    if (run && d === run[1] + 1) run[1] = d;
    else runs.push([d, d]);
  }
  const parts = runs.flatMap(([a, b]) => {
    if (b - a >= 2) return [`${SHORT_DAYS[a - 1]}–${SHORT_DAYS[b - 1]}`];
    return a === b ? [SHORT_DAYS[a - 1]] : [SHORT_DAYS[a - 1], SHORT_DAYS[b - 1]];
  });
  return joinWords(parts);
}

// [6, 7] -> "Every Sat & Sun", [5, 6, 7] -> "Every Fri–Sun", all 7 -> "Daily".
function formatWeekdays(days) {
  return days.length === 7 ? 'Daily' : `Every ${weekdayList(days)}`;
}

const clock = ({ hour, minute }) =>
  `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}`;
const meridiem = ({ hour }) => (hour < 12 ? 'AM' : 'PM');

// 4pm-8pm -> "4–8 PM", 9am-1pm -> "9 AM–1 PM". Compact, for the card.
function shortHours({ startTime, endTime }) {
  return meridiem(startTime) === meridiem(endTime)
    ? `${clock(startTime)}–${clock(endTime)} ${meridiem(endTime)}`
    : `${clock(startTime)} ${meridiem(startTime)}–${clock(endTime)} ${meridiem(endTime)}`;
}

// 9am-1pm -> "9:00 AM – 1:00 PM", the same shape as formatTimeRange.
function fullHours({ startTime, endTime }) {
  const time = (t) => `${t.hour % 12 || 12}:${String(t.minute).padStart(2, '0')} ${meridiem(t)}`;
  return `${time(startTime)} – ${time(endTime)}`;
}

// The residency's weekly hours, with slots that keep the same hours read as one
// (Tue 11-5 and Thu 11-5 rows -> "Every Tue & Thu"), in weekday order. Slots
// that have already finished drop out while any are still running, so a slot
// that ended early stops being listed.
function hoursGroups(res, now = DateTime.now()) {
  const today = now.setZone(res.timezone).startOf('day');
  const running = res.slots.filter((slot) => !slot.lastDay || slot.lastDay >= today);
  const groups = new Map();
  for (const slot of running.length > 0 ? running : res.slots) {
    const { startTime: s, endTime: e } = slot;
    const key = `${s.hour}:${s.minute}-${e.hour}:${e.minute}`;
    if (!groups.has(key)) groups.set(key, { startTime: s, endTime: e, days: [] });
    const group = groups.get(key);
    for (const d of slot.days) if (!group.days.includes(d)) group.days.push(d);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, days: [...group.days].sort((a, b) => a - b) }))
    .sort((a, b) => a.days[0] - b.days[0]);
}

// Just the days, across every set of hours: "Every Tue & Fri", "Daily". Used
// in page titles, where the hours would be too long.
export function formatResidencyDays(res, now) {
  const days = [...new Set(hoursGroups(res, now).flatMap((group) => group.days))];
  return formatWeekdays(days.sort((a, b) => a - b));
}

// One line per set of hours, for the map popup:
// ["Every Tue · 11:00 AM – 5:00 PM", "Every Fri · 6:00 PM – 10:00 PM"].
export function formatResidencyHours(res, now) {
  return hoursGroups(res, now).map((group) => `${formatWeekdays(group.days)} · ${fullHours(group)}`);
}

// How long the residency runs, relative to today: "through Dec 20",
// "ongoing", "Dec 5 – Feb 27, 2027" (not started yet), "ended Aug 16".
export function formatResidencySpan(res, now = DateTime.now()) {
  const today = now.setZone(res.timezone).startOf('day');
  const fmt = (d) => d.toFormat(d.year === today.year ? 'LLL d' : 'LLL d, yyyy');
  if (res.lastDay && res.lastDay < today) return `ended ${fmt(res.lastDay)}`;
  if (res.firstDay > today) {
    return res.lastDay ? `${fmt(res.firstDay)} – ${fmt(res.lastDay)}` : `from ${fmt(res.firstDay)}`;
  }
  return res.lastDay ? `through ${fmt(res.lastDay)}` : 'ongoing';
}

// Card subtitle. One set of hours: "Every Sat & Sun · through Dec 20" (the
// card's date line already shows the hours). Different hours on different
// days: "Every Tue 11 AM–5 PM, Fri 6–10 PM · ongoing".
export function formatResidencySchedule(res, now) {
  const groups = hoursGroups(res, now);
  const span = formatResidencySpan(res, now);
  if (groups.length === 1) return `${formatWeekdays(groups[0].days)} · ${span}`;
  return `${formatResidencyWeek(res, now)} · ${span}`;
}

// The weekly pattern with its hours: "Every Sat & Sun 9 AM–1 PM",
// "Every Tue 11 AM–5 PM, Fri 6–10 PM".
function formatResidencyWeek(res, now) {
  const groups = hoursGroups(res, now);
  if (groups.length === 1) return `${formatWeekdays(groups[0].days)} ${shortHours(groups[0])}`;
  const hours = groups.map((group) => `${weekdayList(group.days)} ${shortHours(group)}`);
  return `Every ${hours.join(', ')}`;
}

// One self-contained line for the Instagram caption, which has no date line to
// lean on: "Every Sat & Sun 9 AM–1 PM · through Dec 20". An open-ended run
// just leaves the end off.
export function formatResidencyCaption(res, now) {
  const span = formatResidencySpan(res, now);
  const week = formatResidencyWeek(res, now);
  return span === 'ongoing' ? week : `${week} · ${span}`;
}
