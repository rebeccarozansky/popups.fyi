// A vendor doing a multi-day residency — the same bakery on Saturday *and*
// Sunday — arrives as several rows that share a venue, so their markers land
// on identical coordinates. The map's clustering would then stack them into a
// numbered navy bubble, which reads as "two different pop-ups here" when it is
// really one vendor, twice. Collapsing them into a single marker keeps the
// vendor's category icon visible and lets the repeat count ride along as a
// superscript instead.
//
// The list deliberately does NOT use this — there each date is its own card,
// because "when is it on?" is the question the list answers.

// ~1m of precision. Repeat rows are normally geocoded from the same address
// string and match exactly; rounding just absorbs float noise.
const COORD_DP = 5;

function vendorKey(popup) {
  const vendor = String(popup.name || '').trim().toLowerCase();
  const lat = Number(popup.lat).toFixed(COORD_DP);
  const lng = Number(popup.lng).toFixed(COORD_DP);
  // A residency keeps its own marker (and its residency mark) even when the
  // same vendor also has a one-off date listed at that venue.
  const kind = popup.kind === 'residency' ? 'residency:' : '';
  return `${kind}${vendor}@${lat},${lng}`;
}

function startMillis(popup) {
  const start = popup?.start;
  return start && typeof start.toMillis === 'function' ? start.toMillis() : 0;
}

// One entry per vendor+venue, in the order that vendor first appears in
// `popups` — so a date- or distance-sorted list keeps its ordering. Each entry
// carries every occurrence, sorted chronologically.
export function groupRepeats(popups) {
  const byKey = new Map();
  const groups = [];

  for (const popup of popups || []) {
    if (!Number.isFinite(popup?.lat) || !Number.isFinite(popup?.lng)) continue;
    const key = vendorKey(popup);
    let group = byKey.get(key);
    if (!group) {
      group = { key, lat: popup.lat, lng: popup.lng, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(popup);
  }

  for (const group of groups) {
    group.items.sort((a, b) => startMillis(a) - startMillis(b));
    group.lead = group.items[0];
    group.count = group.items.length;
  }

  return groups;
}
