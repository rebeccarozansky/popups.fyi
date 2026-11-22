import { filterPopups } from './dateFilters.js';
import { filterResidencies, isResidency } from './residencies.js';

// The list for a date filter, its summary line and its empty state. Shared by
// the app and the prerendered city pages (src/prerender), so the page a
// crawler reads and the list the app draws over it always agree.

export const byStart = (a, b) => a.start.toMillis() - b.start.toMillis();

// One-off pop-ups plus, when `residencies` is given, residencies - each placed
// at its first date inside the window - in date order.
export function filterListings(popups, residencies, filter, customRange, zone) {
  const list = filterPopups(popups, filter, customRange, zone);
  if (!residencies) return list;
  return [...list, ...filterResidencies(residencies, filter, customRange, zone)].sort(byStart);
}

// "7 pop-ups · 1 residency"
export function listSummary(list) {
  const residencyCount = list.filter(isResidency).length;
  const popupCount = list.length - residencyCount;
  return (
    `${popupCount} pop-up${popupCount === 1 ? '' : 's'}` +
    (residencyCount > 0
      ? ` · ${residencyCount} ${residencyCount === 1 ? 'residency' : 'residencies'}`
      : '')
  );
}

// City-aware empty copy, so a city with nothing upcoming doesn't read as a
// loading failure.
export function emptyListMessage({ cityName, saved = false, anyListed = true }) {
  if (saved) return 'No saved pop-ups yet. Tap the star on any card to save it.';
  return anyListed
    ? `No pop-ups happening in ${cityName} this week.`
    : `No pop-ups listed in ${cityName} yet.`;
}
