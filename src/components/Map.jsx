import { useEffect, useMemo, useRef, useState } from 'react';
import { LngLatBounds, Map as MapLibreMap, Marker, Popup, setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import Supercluster from 'supercluster';
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_STYLE_URL } from '../lib/config.js';
import { formatCardDateTime, formatTimeRange } from '../lib/dateFilters.js';
import { dotColorFor } from './CategoryBadge.jsx';
import {
  buildIconMarkerSvg,
  IG_ICON_SCALE,
  MARKER_UNIT_PX,
  residencyGlyphSvg,
} from '../lib/categoryIcons.js';
import { groupRepeats } from '../lib/repeats.js';
import { formatResidencyHours, formatResidencySpan, isResidency } from '../lib/residencies.js';

// MapLibre decodes tiles in a web worker. Vite has to bundle that worker
// itself, so hand MapLibre the URL of Vite's copy.
setWorkerUrl(maplibreWorkerUrl);

// Zoom levels in cities.js (and the thresholds below) are on Leaflet's scale,
// which counts 256px tiles. MapLibre counts 512px tiles, so the same view is
// exactly one level lower.
const toMapZoom = (leafletZoom) => leafletZoom - 1;

const MAX_ZOOM = toMapZoom(19);
// How close to come in when focusing a pop-up or the user's location.
const FOCUS_ZOOM = toMapZoom(14);
// Below this zoom, pins within CLUSTER_RADIUS_PX of each other merge into a
// numbered bubble. From here up only pins on the very same spot share a
// bubble, and tapping it fans them out.
const CLUSTER_BELOW_ZOOM = toMapZoom(11);
const CLUSTER_RADIUS_PX = 60;
const WORLD_BBOX = [-180, -85, 180, 85];

// Same-spot key: ~1m, matching repeats.js.
function spotKey(lat, lng) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function buildClusterIndex(groups) {
  const index = new Supercluster({ radius: CLUSTER_RADIUS_PX, maxZoom: CLUSTER_BELOW_ZOOM - 1 });
  index.load(
    groups.map((group, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [group.lng, group.lat] },
      properties: { i },
    })),
  );
  return index;
}

// Pins are DOM elements laid over the map canvas. A tap selects; the press
// position is checked so letting go after dragging the map from a pin doesn't
// count, and stopPropagation keeps MapLibre from also treating it as a click
// on the map (which closes popups and folds fans).
function makeTappable(el, label, onTap) {
  let down = null;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', label);
  el.addEventListener('pointerdown', (e) => {
    down = [e.clientX, e.clientY];
  });
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    onTap();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onTap();
  });
}

// Where each pin of a same-spot stack sits once fanned out, in px from the
// spot: a ring for small stacks, a spiral once a ring would get too wide.
// Same scheme as Leaflet.markercluster's spiderfy, spaced for our larger icons.
const FAN_SEPARATION = 36;
function fanOffsets(count) {
  if (count < 9) {
    const radius = (FAN_SEPARATION * (2 + count)) / (2 * Math.PI);
    const step = (2 * Math.PI) / count;
    return Array.from({ length: count }, (_, i) => {
      const angle = -Math.PI / 2 + i * step;
      return [radius * Math.cos(angle), radius * Math.sin(angle)];
    });
  }
  const out = [];
  let length = 14;
  let angle = 0;
  for (let i = 0; i < count; i++) {
    angle += FAN_SEPARATION / length + i * 0.0005;
    out.push([length * Math.cos(angle), length * Math.sin(angle)]);
    length += (10 * Math.PI) / angle;
  }
  return out;
}

// Thin legs from the spot out to each fanned pin.
function fanLegsElement(offsets) {
  const reach = Math.ceil(Math.max(...offsets.map(([x, y]) => Math.hypot(x, y)))) + 2;
  const size = reach * 2;
  const lines = offsets
    .map(
      ([x, y]) =>
        `<line x1="${reach}" y1="${reach}" x2="${(reach + x).toFixed(1)}" y2="${(reach + y).toFixed(1)}"/>`,
    )
    .join('');
  const el = document.createElement('div');
  el.className = 'pf-fan-legs';
  el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block"><g stroke="#0A1628" stroke-opacity="0.45" stroke-width="1.5" stroke-linecap="round">${lines}</g></svg>`;
  return el;
}

// MapLibre puts a popup on whichever side of the pin has room. Give it the
// matching edge of the icon for each side so the tip touches the artwork
// rather than its centre; `dx, dy` shift everything for a fanned-out pin.
function popupOffsets({ left, right, top, bottom }, dx = 0, dy = 0) {
  const d = Math.SQRT1_2;
  return {
    center: [dx, dy],
    top: [dx, dy + bottom],
    bottom: [dx, dy - top],
    left: [dx + right, dy],
    right: [dx - left, dy],
    'top-left': [dx + right * d, dy + bottom * d],
    'top-right': [dx - left * d, dy + bottom * d],
    'bottom-left': [dx + right * d, dy - top * d],
    'bottom-right': [dx - left * d, dy - top * d],
  };
}

// Popup body for one marker. A marker can stand for several dates (a vendor
// running the same venue all weekend), in which case every date gets its own
// row and its own link, so tapping a date selects that specific occurrence.
// `vendorPath` is the vendor's own page (src/lib/pages.js), when it has one.
function popupHtml(group, vendorPath) {
  const safe = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
  const lead = group.lead;
  const parts = [`<div style="font-weight:600">${safe(lead.name)}</div>`];
  if (lead.location_name) {
    parts.push(`<div style="color:#6B7280;font-size:13px">@ ${safe(lead.location_name)}</div>`);
  }

  if (group.count > 1) {
    const rows = group.items
      .map(
        (p) =>
          `<div style="margin-top:2px"><a href="#" class="pf-detail-link" data-popup-id="${safe(p.id)}" style="font-size:13px">${safe(formatCardDateTime(p))}</a></div>`,
      )
      .join('');
    parts.push(
      `<div style="margin-top:6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#6B7280">${group.count} dates</div>${rows}`,
    );
  } else if (isResidency(lead)) {
    // A residency is about its standing slots, not one date: lead with the
    // weekly pattern (a line per set of hours) and how long it runs.
    parts.push(
      `<div style="margin-top:6px;display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#0A1628">${residencyGlyphSvg(11)}Residency</div>`,
    );
    const hours = formatResidencyHours(lead)
      .map((line) => `<div>${safe(line)}</div>`)
      .join('');
    parts.push(`<div style="margin-top:2px;font-size:13px;color:#6B7280">${hours}</div>`);
    const span = formatResidencySpan(lead);
    parts.push(
      `<div style="font-size:12px;color:#6B7280">${safe(span.charAt(0).toUpperCase() + span.slice(1))}</div>`,
    );
  } else {
    parts.push(`<div style="margin-top:4px;font-size:13px;color:#6B7280">${safe(formatTimeRange(lead))}</div>`);
  }

  if (lead.categories && lead.categories.length > 0) {
    const chips = lead.categories
      .map(
        (c) =>
          `<span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#0A1628"><span style="display:inline-block;width:6px;height:6px;border-radius:9999px;background:${dotColorFor(c)}"></span>${safe(c)}</span>`,
      )
      .join('<span style="display:inline-block;width:12px"></span>');
    parts.push(`<div style="margin-top:6px">${chips}</div>`);
  }

  if (group.count === 1) {
    parts.push(`<a href="#" class="pf-detail-link" data-popup-id="${safe(lead.id)}" style="display:inline-block;margin-top:8px">View details</a>`);
  }
  // A plain link: it leaves the map for the vendor's page.
  if (vendorPath) {
    parts.push(
      `<div style="margin-top:${group.count === 1 ? 4 : 8}px"><a href="${safe(vendorPath)}" class="pf-vendor-link">More from ${safe(lead.name)} →</a></div>`,
    );
  }
  return parts.join('');
}

// Instagram mode frames the map to fit every pop-up.
const FIT_MAX_ZOOM = toMapZoom(15);

// Breathing room around the fitted pop-ups, as a share of the smaller map
// dimension — a flat 70px was a quarter of the width on a phone-sized render,
// which left the map mostly margin.
function fitPadding(map) {
  const el = map.getContainer();
  return Math.min(Math.max(Math.round(Math.min(el.clientWidth, el.clientHeight) * 0.08), 24), 70);
}

function popupLatLngs(popups) {
  return (popups || [])
    .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
    .map((p) => [p.lat, p.lng]);
}

// Instagram markers are drawn smaller, and the spacing they need follows from
// that rather than from a hardcoded number.
const IG_ICON_PX = MARKER_UNIT_PX * IG_ICON_SCALE;

// How much of that box the artwork actually fills. The hand-drawn icons sit
// inside their 24-unit cell with margin to spare, so ink + white halo measures
// ~92% of the box (22.6px of 24.5px). Spacing pins by the nominal box instead
// left ~4px of pure air between every pair and made clusters read as looser
// than they needed to be.
const IG_INK_RATIO = 0.92;
const IG_MIN_SEPARATION = IG_ICON_PX * IG_INK_RATIO;

// Owns every pin, bubble and popup on the map. A plain imperative class:
// MapLibre markers are DOM elements it positions itself, and clustering,
// fanning and the Instagram packing all redraw on map events, not on React
// renders.
class PinLayer {
  constructor(map, { instagramMode, onSelect, findPopup, vendorPathFor }) {
    this.map = map;
    this.instagramMode = instagramMode;
    // Screenshot mode draws smaller pins; the live site is unchanged.
    this.iconScale = instagramMode ? IG_ICON_SCALE : 1;
    this.onSelect = onSelect;
    this.findPopup = findPopup;
    this.vendorPathFor = vendorPathFor;
    this.groups = [];
    this.index = buildClusterIndex([]);
    this.spots = new Map(); // spot key -> { key, lat, lng, groups }
    this.selectedId = null;
    this.fanKey = null; // the same-spot stack currently fanned out
    this.drawnFor = null; // what the pins were last drawn for, see view()
    this.markers = [];
    this.pins = new Map(); // group key -> { group, marker, dx, dy, box }
    this.popup = null;
    this.popupKey = null;
    this.focusToken = 0;

    // Redraw only when a zoom crosses into a different clustering level, not
    // on every frame of it.
    this.handleZoom = () => {
      if (this.view() !== this.drawnFor) this.draw();
    };
    // Like markercluster, zooming by hand folds a fanned-out stack back up;
    // programmatic moves (focusing a pin inside the fan) leave it open.
    this.handleZoomStart = (e) => {
      if (e.originalEvent && this.fanKey) this.foldFan();
    };
    this.handleMapClick = () => {
      if (this.fanKey) this.foldFan();
    };
    this.handleSettle = () => this.declutter();

    map.on('zoom', this.handleZoom);
    map.on('zoomstart', this.handleZoomStart);
    map.on('click', this.handleMapClick);
    if (instagramMode) {
      map.on('moveend', this.handleSettle);
      map.on('resize', this.handleSettle);
    }
  }

  destroy() {
    const { map } = this;
    map.off('zoom', this.handleZoom);
    map.off('zoomstart', this.handleZoomStart);
    map.off('click', this.handleMapClick);
    map.off('moveend', this.handleSettle);
    map.off('resize', this.handleSettle);
    this.clearMarkers();
    this.closePopup();
  }

  setGroups(groups) {
    this.groups = groups;
    this.index = buildClusterIndex(groups);
    this.spots = new Map();
    for (const group of groups) {
      const key = spotKey(group.lat, group.lng);
      if (!this.spots.has(key)) {
        this.spots.set(key, { key, lat: group.lat, lng: group.lng, groups: [] });
      }
      this.spots.get(key).groups.push(group);
    }
    if (this.fanKey && !(this.spots.get(this.fanKey)?.groups.length > 1)) this.fanKey = null;
    this.draw();
  }

  setSelected(id) {
    this.selectedId = id;
    this.draw();
  }

  // What the pins should be drawn for at the current zoom.
  view() {
    if (this.instagramMode) return 'all';
    const zoom = this.map.getZoom();
    return zoom < CLUSTER_BELOW_ZOOM ? `clusters@${Math.floor(zoom)}` : 'spots';
  }

  // The same-spot stack a group belongs to, if it shares its spot.
  stackOf(group) {
    const spot = this.spots.get(spotKey(group.lat, group.lng));
    return spot && spot.groups.length > 1 ? spot : null;
  }

  foldFan() {
    this.fanKey = null;
    this.draw();
  }

  clearMarkers() {
    for (const marker of this.markers) marker.remove();
    this.markers = [];
    this.pins.clear();
  }

  draw() {
    this.clearMarkers();
    this.drawnFor = this.view();
    if (this.drawnFor === 'all') {
      // Instagram mode: every pop-up as its own pin, packed apart below.
      for (const group of this.groups) this.addPin(group);
      this.declutter();
    } else if (this.drawnFor === 'spots') {
      for (const spot of this.spots.values()) {
        if (spot.groups.length === 1) {
          this.addPin(spot.groups[0]);
        } else if (spot.key === this.fanKey) {
          this.addFan(spot);
        } else {
          this.addBubble(spot.groups.length, spot, () => {
            this.fanKey = spot.key;
            this.draw();
          });
        }
      }
    } else {
      this.fanKey = null;
      const zoom = Math.floor(this.map.getZoom());
      for (const feature of this.index.getClusters(WORLD_BBOX, zoom)) {
        const { cluster, cluster_id: id, point_count: count, i } = feature.properties;
        if (!cluster) {
          this.addPin(this.groups[i]);
          continue;
        }
        const [lng, lat] = feature.geometry.coordinates;
        this.addBubble(count, { lat, lng }, () => {
          this.map.easeTo({
            center: [lng, lat],
            zoom: Math.max(this.index.getClusterExpansionZoom(id), zoom + 1),
          });
        });
      }
    }
    this.syncPopup();
  }

  addPin(group, dx = 0, dy = 0) {
    const isSelected = group.items.some((p) => p.id === this.selectedId);
    const { width, height, anchorX, svg } = buildIconMarkerSvg(
      group.lead.categories,
      isSelected,
      group.count,
      this.iconScale,
      isResidency(group.lead),
    );
    const el = document.createElement('div');
    el.className = 'pf-pin';
    el.innerHTML = `<div class="pf-marker${isSelected ? ' pf-marker--selected' : ''}">${svg}</div>`;
    // Selected pin on top, then fanned-out pins over their legs.
    if (isSelected) el.style.zIndex = '3';
    else if (dx || dy) el.style.zIndex = '2';
    makeTappable(el, group.lead.name, () => {
      this.openPopup(group);
      this.onSelect(group.lead, 'marker');
    });
    // The centre of the icon block sits on the coordinate (anchorX leaves out
    // any superscript), shifted by the fan offset when fanned out.
    const marker = new Marker({
      element: el,
      anchor: 'top-left',
      offset: [dx - anchorX, dy - height / 2],
    })
      .setLngLat([group.lng, group.lat])
      .addTo(this.map);
    this.markers.push(marker);
    this.pins.set(group.key, {
      group,
      marker,
      dx,
      dy,
      box: { left: anchorX, right: width - anchorX, top: height / 2, bottom: height / 2 },
    });
  }

  // Solid navy circle, white count.
  addBubble(count, { lat, lng }, onTap) {
    const size = count < 10 ? 28 : count < 100 ? 32 : 36;
    const el = document.createElement('div');
    el.className = 'pf-pin';
    el.innerHTML = `<div class="pf-cluster" style="width:${size}px;height:${size}px">${count}</div>`;
    makeTappable(el, `${count} pop-ups here`, onTap);
    this.markers.push(new Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(this.map));
  }

  addFan(spot) {
    const offsets = fanOffsets(spot.groups.length);
    const legs = fanLegsElement(offsets);
    legs.style.zIndex = '1';
    this.markers.push(
      new Marker({ element: legs, anchor: 'center' }).setLngLat([spot.lng, spot.lat]).addTo(this.map),
    );
    spot.groups.forEach((group, i) => this.addPin(group, offsets[i][0], offsets[i][1]));
  }

  openPopup(group) {
    this.closePopup();
    const popup = new Popup({ maxWidth: '300px', focusAfterOpen: false })
      .setLngLat([group.lng, group.lat])
      .setHTML(popupHtml(group, this.vendorPathFor(group.lead)));
    this.popup = popup;
    this.popupKey = group.key;
    this.syncPopup();
    if (this.popup !== popup) return; // its pin isn't on the map
    popup.addTo(this.map);
    popup.on('close', () => {
      if (this.popup !== popup) return;
      this.popup = null;
      this.popupKey = null;
    });
    // A repeat pin lists one link per date, so bind them all.
    for (const link of popup.getElement().querySelectorAll('.pf-detail-link')) {
      link.addEventListener('click', (evt) => {
        evt.preventDefault();
        const target = this.findPopup(link.getAttribute('data-popup-id'));
        if (target) this.onSelect(target, 'detail-link');
      });
    }
  }

  closePopup() {
    const { popup } = this;
    this.popup = null;
    this.popupKey = null;
    popup?.remove();
  }

  // Keep an open popup pointing at its pin: re-aim it whenever pins are
  // redrawn (a selected pin is bigger, a fanned pin sits off its spot) and
  // close it once the pin folds into a bubble, as Leaflet did.
  syncPopup() {
    if (!this.popup) return;
    const pin = this.pins.get(this.popupKey);
    if (!pin) {
      this.closePopup();
      return;
    }
    this.popup.setOffset(popupOffsets(pin.box, pin.dx, pin.dy));
  }

  // Bring a pop-up's pin into view and open its popup (card taps, marker
  // taps, deep links). A pin inside a bubble only exists once zoomed in and,
  // for a same-spot stack, fanned out, so then the popup waits for the camera.
  focus(id) {
    const group = this.groups.find((g) => g.items.some((p) => p.id === id));
    if (!group) return;
    const { map } = this;
    const token = ++this.focusToken;
    const camera = {
      center: [group.lng, group.lat],
      zoom: Math.max(map.getZoom(), FOCUS_ZOOM),
      duration: 600,
    };
    if (this.pins.has(group.key)) {
      // Already its own pin: open now and let the popup ride along.
      if (this.popupKey !== group.key) this.openPopup(group);
      map.flyTo(camera);
      return;
    }
    let done = false;
    const finish = () => {
      if (done || token !== this.focusToken) return;
      done = true;
      const stack = this.instagramMode ? null : this.stackOf(group);
      if (stack && this.fanKey !== stack.key) {
        this.fanKey = stack.key;
        this.draw();
      }
      this.openPopup(group);
    };
    map.flyTo(camera);
    // Listening after flyTo so an interrupted earlier flight's moveend doesn't
    // count; the timer covers moves that end without one.
    map.once('moveend', finish);
    setTimeout(finish, camera.duration + 400);
  }

  // Instagram mode: nudge overlapping pins apart until every pop-up is
  // visible, and leave it at that — no leader lines, no rings.
  //
  // Exact position is deliberately not preserved here. A screenshot only has
  // to say "roughly this neighbourhood"; anyone who wants the address goes to
  // the site. Dropping the leader lines means the displacement no longer has
  // to be explained to the viewer, which in turn means each pin only has to
  // move the minimum needed to stop overlapping, so clusters read as a tight
  // clump rather than a fan.
  //
  // Recomputed after every move and resize. Positions are always re-derived
  // from the group's true coordinate, never from the marker's current (already
  // nudged) position, so repeated runs can't drift outward.
  declutter() {
    if (!this.instagramMode) return;
    const { map } = this;
    // Container pixels, so pins can be clamped back inside the frame —
    // packing pushes outward, and on a narrow phone that shoved pins
    // off-screen entirely.
    const el = map.getContainer();
    const width = el.clientWidth;
    const height = el.clientHeight;
    const margin = IG_ICON_PX / 2 + 4;
    // Until the container has been measured it is 0x0, which would clamp every
    // pin onto the same point. The resize handler re-runs this.
    if (width < margin * 2 || height < margin * 2) return;
    const clamp = ({ x, y }) => ({
      x: Math.min(Math.max(x, margin), Math.max(margin, width - margin)),
      y: Math.min(Math.max(y, margin), Math.max(margin, height - margin)),
    });

    const entries = [...this.pins.values()].map(({ group, marker }) => {
      const home = map.project([group.lng, group.lat]);
      return { marker, home, pos: home };
    });

    // Relaxation can't separate two points that are exactly coincident —
    // there's no direction to push in — so seed each pin with a sub-pixel
    // offset. The golden angle spreads those seeds evenly and keeps the
    // result deterministic between runs.
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    entries.forEach((entry, i) => {
      const angle = i * goldenAngle;
      entry.pos = clamp({
        x: entry.home.x + Math.cos(angle) * 0.5,
        y: entry.home.y + Math.sin(angle) * 0.5,
      });
    });

    // Move a pin, returning whatever movement the frame refused to allow so
    // its partner can absorb it. Without this, a pin pinned against the edge
    // silently swallows half of every push and the pair stays overlapping.
    const move = (entry, dx, dy) => {
      const desired = { x: entry.pos.x + dx, y: entry.pos.y + dy };
      entry.pos = clamp(desired);
      return { x: desired.x - entry.pos.x, y: desired.y - entry.pos.y };
    };

    // Push any overlapping pair apart by exactly the shortfall, repeatedly.
    // Because each pass moves pins the minimum required, the result settles
    // into a tight packing that stays close to where things actually are.
    const minSeparation = IG_MIN_SEPARATION;
    for (let pass = 0; pass < 60; pass++) {
      let moved = false;
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i];
          const b = entries[j];
          const dx = b.pos.x - a.pos.x;
          const dy = b.pos.y - a.pos.y;
          const distance = Math.hypot(dx, dy);
          if (distance >= minSeparation) continue;
          if (distance < 0.001) {
            // Coincident pins have no push direction, so shove one along x
            // and let the next pass square it up.
            move(b, minSeparation, 0);
            moved = true;
            continue;
          }
          const push = (minSeparation - distance) / 2;
          const ux = (dx / distance) * push;
          const uy = (dy / distance) * push;
          const blockedA = move(a, -ux, -uy);
          const blockedB = move(b, ux, uy);
          if (blockedA.x || blockedA.y) move(b, -blockedA.x, -blockedA.y);
          if (blockedB.x || blockedB.y) move(a, -blockedB.x, -blockedB.y);
          moved = true;
        }
      }
      if (!moved) break;
    }

    for (const entry of entries) {
      entry.marker.setLngLat(map.unproject([entry.pos.x, entry.pos.y]));
    }
  }
}

// Bridges React props to the PinLayer.
function MarkersLayer({ map, popups, selectedId, requestSeq, onMarkerSelect, instagramMode, vendorPathFor }) {
  // One pin per vendor+venue. Repeat dates collapse into a single icon
  // carrying a superscript instead of stacking into a cluster bubble.
  const groups = useMemo(() => groupRepeats(popups), [popups]);
  const latest = useRef({});
  latest.current = { popups, selectedId, onMarkerSelect, vendorPathFor };
  const [layer, setLayer] = useState(null);

  useEffect(() => {
    const pins = new PinLayer(map, {
      instagramMode,
      onSelect: (popup, source) => latest.current.onMarkerSelect?.(popup, { source }),
      findPopup: (id) => (latest.current.popups || []).find((p) => p.id === id),
      vendorPathFor: (item) => latest.current.vendorPathFor?.(item) || null,
    });
    setLayer(pins);
    return () => {
      pins.destroy();
      setLayer(null);
    };
  }, [map, instagramMode]);

  useEffect(() => {
    layer?.setGroups(groups);
  }, [layer, groups]);

  useEffect(() => {
    layer?.setSelected(selectedId);
  }, [layer, selectedId]);

  // Pan/zoom + open popup on request from the parent (card taps, marker taps,
  // deep links).
  useEffect(() => {
    if (requestSeq) layer?.focus(latest.current.selectedId);
  }, [layer, requestSeq]);

  return null;
}

// The user's location, once known.
function UserDot({ map, coord }) {
  useEffect(() => {
    if (!coord) return undefined;
    // MapLibre positions the outer element; .pf-user-dot styles the inner one.
    const el = document.createElement('div');
    el.style.pointerEvents = 'none';
    el.innerHTML = '<div class="pf-user-dot"></div>';
    const marker = new Marker({ element: el, anchor: 'center' })
      .setLngLat([coord[1], coord[0]])
      .addTo(map);
    return () => marker.remove();
  }, [map, coord]);
  return null;
}

// Imperative "fly to user" trigger.
function FlyTo({ map, coord, seq }) {
  useEffect(() => {
    if (!seq || !coord) return;
    map.flyTo({
      center: [coord[1], coord[0]],
      zoom: Math.max(map.getZoom(), FOCUS_ZOOM),
      duration: 800,
    });
  }, [seq, coord, map]);
  return null;
}

// Recenter when the user switches cities. Tracks the last view it acted on
// rather than a "first run" flag: StrictMode double-invokes effects, which
// would flip a boolean flag on the first pass and then fly on mount.
function CityView({ map, center, zoom }) {
  const lat = center[0];
  const lng = center[1];
  const applied = useRef(`${lat},${lng},${zoom}`);
  useEffect(() => {
    const key = `${lat},${lng},${zoom}`;
    if (applied.current === key) return;
    applied.current = key;
    map.flyTo({ center: [lng, lat], zoom: toMapZoom(zoom), duration: 1000 });
  }, [lat, lng, zoom, map]);
  return null;
}

// Re-measure whenever the layout reshapes the container (layout switch,
// expand toggle, breakpoint flip), on top of MapLibre's own resize tracking.
function MapResizer({ map, trigger }) {
  useEffect(() => {
    const id = setTimeout(() => map.resize(), 60);
    return () => clearTimeout(id);
  }, [trigger, map]);
  return null;
}

// Instagram mode frames every visible pop-up in one shot, so the view is
// derived from the markers rather than from the city's default center/zoom.
// The delay lets MapResizer's resize land first — fitting bounds against a
// stale container size crops markers out of frame.
function FitAll({ map, popups, enabled, trigger }) {
  useEffect(() => {
    if (!enabled) return;
    const points = popupLatLngs(popups);
    if (points.length === 0) return;
    const id = setTimeout(() => {
      const bounds = new LngLatBounds();
      for (const [lat, lng] of points) bounds.extend([lng, lat]);
      map.fitBounds(bounds, { padding: fitPadding(map), maxZoom: FIT_MAX_ZOOM, animate: false });
    }, 150);
    return () => clearTimeout(id);
  }, [enabled, popups, trigger, map]);
  return null;
}

export default function MapView({
  popups,
  selectedId,
  selectedSeq,
  userCoord,
  flyToUserSeq,
  onMarkerSelect,
  resizeKey,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  instagramMode = false,
  vendorPathFor,
}) {
  const containerRef = useRef(null);
  const [map, setMap] = useState(null);
  // Built once at the first city's view; later city switches fly (CityView).
  const initial = useRef({ center, zoom, instagramMode }).current;

  useEffect(() => {
    let instance;
    try {
      instance = new MapLibreMap({
        container: containerRef.current,
        style: MAP_STYLE_URL,
        center: [initial.center[1], initial.center[0]],
        zoom: toMapZoom(initial.zoom),
        maxZoom: MAX_ZOOM,
        // North stays up: rotating or tilting a pop-up map only disorients.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        // Screenshots must carry the full credit line; elsewhere MapLibre
        // folds it into an "i" button on narrow screens.
        attributionControl: initial.instagramMode ? { compact: false } : {},
      });
    } catch (err) {
      // No WebGL: leave the map area blank rather than taking the list down.
      // eslint-disable-next-line no-console
      console.warn('[popups.fyi] map failed to start', err);
      return undefined;
    }
    instance.touchZoomRotate.disableRotation();
    instance.keyboard.disableRotation();
    // The Instagram screenshot tool waits on this instead of guessing with a
    // sleep: MapLibre fires `idle` once every requested tile has loaded and no
    // camera move or fade is still running.
    const container = containerRef.current;
    instance.on('idle', () => {
      container.dataset.mapIdle = 'true';
    });
    const markBusy = () => {
      delete container.dataset.mapIdle;
    };
    instance.on('movestart', markBusy);
    instance.on('dataloading', markBusy);
    setMap(instance);
    return () => {
      instance.remove();
      setMap(null);
    };
  }, [initial]);

  return (
    <>
      <div ref={containerRef} className="w-full h-full" />
      {map && (
        <>
          <MarkersLayer
            map={map}
            popups={popups}
            selectedId={selectedId}
            requestSeq={selectedSeq}
            onMarkerSelect={onMarkerSelect}
            instagramMode={instagramMode}
            vendorPathFor={vendorPathFor}
          />
          <UserDot map={map} coord={userCoord} />
          <FlyTo map={map} coord={userCoord} seq={flyToUserSeq} />
          <CityView map={map} center={center} zoom={zoom} />
          <MapResizer map={map} trigger={resizeKey} />
          <FitAll map={map} popups={popups} enabled={instagramMode} trigger={resizeKey} />
        </>
      )}
    </>
  );
}
