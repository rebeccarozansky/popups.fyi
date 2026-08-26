import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../lib/config.js';
import { formatCardDateTime, formatTimeRange } from '../lib/dateFilters.js';
import { dotColorFor } from './CategoryBadge.jsx';
import { buildIconMarkerSvg, IG_ICON_SCALE, MARKER_UNIT_PX } from '../lib/categoryIcons.js';
import { groupRepeats } from '../lib/repeats.js';

// Cluster icon factory — solid navy circle, white numeric label.
function createClusterIcon(cluster) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 28 : count < 100 ? 32 : 36;
  return L.divIcon({
    html: `<div class="pf-cluster" style="width:${size}px;height:${size}px">${count}</div>`,
    className: '',
    iconSize: L.point(size, size),
    iconAnchor: [size / 2, size / 2],
  });
}

function markerIcon(categories, isSelected, repeatCount = 1, iconScale = 1) {
  const { width, height, anchorX, svg } = buildIconMarkerSvg(
    categories,
    isSelected,
    repeatCount,
    iconScale,
  );
  return L.divIcon({
    html: `<div class="pf-marker${isSelected ? ' pf-marker--selected' : ''}">${svg}</div>`,
    className: '',
    iconSize: L.point(width, height),
    iconAnchor: [anchorX, height / 2],
  });
}

function userLocationIcon() {
  return L.divIcon({
    html: '<div class="pf-user-dot"></div>',
    className: '',
    iconSize: L.point(24, 24),
    iconAnchor: [12, 12],
  });
}

// Popup body for one marker. A marker can stand for several dates (a vendor
// running the same venue all weekend), in which case every date gets its own
// row and its own link, so tapping a date selects that specific occurrence.
function popupHtml(group) {
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
  return parts.join('');
}

// Instagram mode frames the map to fit every pop-up.
const FIT_MAX_ZOOM = 15;

// Breathing room around the fitted pop-ups, as a share of the smaller map
// dimension — a flat 70px was a quarter of the width on a phone-sized render,
// which left the map mostly margin.
function fitPadding(map) {
  const size = map.getSize();
  const pad = Math.min(Math.max(Math.round(Math.min(size.x, size.y) * 0.08), 24), 70);
  return L.point(pad, pad);
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

// Imperative layer manager. Lives inside MapContainer so useMap() works.
function MarkersLayer({ popups, selectedId, requestSeq, userCoord, onMarkerSelect, instagramMode }) {
  const map = useMap();
  const clusterRef = useRef(null);
  const markersRef = useRef(new Map()); // popup id -> L.marker (repeats share one)
  const groupMarkersRef = useRef([]); // [{ group, marker }]
  const userMarkerRef = useRef(null);
  const onMarkerSelectRef = useRef(onMarkerSelect);
  onMarkerSelectRef.current = onMarkerSelect;

  // One marker per vendor+venue. Repeat dates collapse into a single icon
  // carrying a superscript instead of stacking into a cluster bubble.
  const groups = useMemo(() => groupRepeats(popups), [popups]);

  // Screenshot mode draws smaller pins; the live site is unchanged.
  const iconScale = instagramMode ? IG_ICON_SCALE : 1;

  // Create the layer once per clustering mode. Instagram mode uses a plain
  // layer group and fans co-located pins out itself (see below) rather than
  // clustering: markercluster only ever keeps one cluster spiderfied and
  // retracts it on the next map click, which is exactly wrong for a
  // screenshot, and forcing it open fights `_spiderfied` bookkeeping.
  useEffect(() => {
    const group = instagramMode
      ? L.layerGroup()
      : L.markerClusterGroup({
          iconCreateFunction: createClusterIcon,
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          disableClusteringAtZoom: 16,
          maxClusterRadius: (zoom) => (zoom >= 11 ? 0 : 60),
        });

    map.addLayer(group);
    clusterRef.current = group;

    // Delegated click handling for the date / "View details" links inside a
    // marker popup. A repeat marker renders one link per date, so bind them all.
    const onPopupOpen = (e) => {
      const el = e.popup.getElement();
      if (!el) return;
      for (const link of el.querySelectorAll('.pf-detail-link')) {
        link.addEventListener('click', (evt) => {
          evt.preventDefault();
          const id = link.getAttribute('data-popup-id');
          const popup = (popupsRef.current || []).find((p) => p.id === id);
          if (popup) onMarkerSelectRef.current?.(popup, { source: 'detail-link' });
        });
      }
    };
    map.on('popupopen', onPopupOpen);

    return () => {
      map.off('popupopen', onPopupOpen);
      map.removeLayer(group);
      clusterRef.current = null;
      markersRef.current.clear();
      groupMarkersRef.current = [];
    };
  }, [map, instagramMode]);

  const popupsRef = useRef(popups);
  popupsRef.current = popups;

  // Sync markers whenever the grouped list changes.
  useEffect(() => {
    const layer = clusterRef.current;
    if (!layer) return;
    layer.clearLayers();
    markersRef.current.clear();
    groupMarkersRef.current = [];
    for (const group of groups) {
      const m = L.marker([group.lat, group.lng], {
        icon: markerIcon(group.lead.categories, false, group.count, iconScale),
      });
      m.bindPopup(popupHtml(group), { closeButton: true, autoPan: true });
      m.on('click', () => {
        onMarkerSelectRef.current?.(group.lead, { source: 'marker' });
      });
      // Every occurrence resolves to this marker so list -> map selection and
      // ?id= deep links keep working for the dates that share it.
      for (const p of group.items) markersRef.current.set(p.id, m);
      groupMarkersRef.current.push({ group, marker: m });
      layer.addLayer(m);
    }
  }, [groups, instagramMode, iconScale]);

  // Highlight selected marker (grow it). Re-run when selection changes.
  useEffect(() => {
    for (const { group, marker } of groupMarkersRef.current) {
      const isSelected = group.items.some((p) => p.id === selectedId);
      marker.setIcon(markerIcon(group.lead.categories, isSelected, group.count, iconScale));
    }
  }, [selectedId, groups, iconScale]);

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
  // Recomputed on zoom and resize. Positions are always re-derived from the
  // group's true coordinate, never from the marker's current (already nudged)
  // position, so repeated runs can't drift outward.
  useEffect(() => {
    if (!instagramMode) return;

    const declutter = () => {
      // Container points (relative to the visible map box) rather than layer
      // points, so pins can be clamped back inside the frame — packing pushes
      // outward, and on a narrow phone that shoved pins off-screen entirely.
      const size = map.getSize();
      const margin = IG_ICON_PX / 2 + 4;
      const clamp = (point) =>
        L.point(
          Math.min(Math.max(point.x, margin), Math.max(margin, size.x - margin)),
          Math.min(Math.max(point.y, margin), Math.max(margin, size.y - margin)),
        );

      const entries = groupMarkersRef.current.map(({ group, marker }) => {
        const home = map.latLngToContainerPoint(L.latLng(group.lat, group.lng));
        return { marker, home, pos: home };
      });

      // Relaxation can't separate two points that are exactly coincident —
      // there's no direction to push in — so seed each pin with a sub-pixel
      // offset. The golden angle spreads those seeds evenly and keeps the
      // result deterministic between runs.
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      entries.forEach((entry, i) => {
        const angle = i * goldenAngle;
        entry.pos = clamp(
          entry.home.add(L.point(Math.cos(angle) * 0.5, Math.sin(angle) * 0.5)),
        );
      });

      // Move a pin, returning whatever movement the frame refused to allow so
      // its partner can absorb it. Without this, a pin pinned against the edge
      // silently swallows half of every push and the pair stays overlapping.
      const move = (entry, dx, dy) => {
        const desired = L.point(entry.pos.x + dx, entry.pos.y + dy);
        entry.pos = clamp(desired);
        return L.point(desired.x - entry.pos.x, desired.y - entry.pos.y);
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
        entry.marker.setLatLng(map.containerPointToLatLng(entry.pos));
      }
    };

    declutter();
    map.on('zoomend', declutter);
    map.on('resize', declutter);
    return () => {
      map.off('zoomend', declutter);
      map.off('resize', declutter);
    };
  }, [instagramMode, groups, map]);

  // Pan/zoom + open popup on request from parent (list-card tap).
  useEffect(() => {
    if (!requestSeq) return;
    const m = markersRef.current.get(selectedId);
    if (!m) return;
    const latlng = m.getLatLng();
    const targetZoom = Math.max(map.getZoom(), 14);
    map.flyTo(latlng, targetZoom, { duration: 0.4 });
    // Wait for any cluster spiderfy before opening popup.
    setTimeout(() => {
      try {
        const group = clusterRef.current;
        if (group && typeof group.zoomToShowLayer === 'function') {
          group.zoomToShowLayer(m, () => m.openPopup());
        } else {
          m.openPopup();
        }
      } catch {
        m.openPopup();
      }
    }, 250);
  }, [requestSeq, selectedId, map]);

  // User location marker.
  useEffect(() => {
    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }
    if (userCoord) {
      const m = L.marker(userCoord, {
        icon: userLocationIcon(),
        interactive: false,
        keyboard: false,
      });
      m.addTo(map);
      userMarkerRef.current = m;
    }
    return () => {
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
    };
  }, [userCoord, map]);

  return null;
}

// Imperative "fly to user" trigger.
function FlyTo({ coord, seq }) {
  const map = useMap();
  useEffect(() => {
    if (!seq || !coord) return;
    map.flyTo(coord, Math.max(map.getZoom(), 14), { duration: 0.5 });
  }, [seq, coord, map]);
  return null;
}

// Recenter when the user switches cities. Tracks the last view it acted on
// rather than a "first run" flag: StrictMode double-invokes effects, which
// would flip a boolean flag on the first pass and then fly on mount — before
// the container has a size, which makes Leaflet throw on a NaN LatLng.
function CityView({ center, zoom }) {
  const map = useMap();
  const lat = center[0];
  const lng = center[1];
  const applied = useRef(`${lat},${lng},${zoom}`);
  useEffect(() => {
    const key = `${lat},${lng},${zoom}`;
    if (applied.current === key) return;
    applied.current = key;
    map.flyTo([lat, lng], zoom, { duration: 0.6 });
  }, [lat, lng, zoom, map]);
  return null;
}

// Call invalidateSize whenever the container dimensions change (layout switch,
// expand toggle, breakpoint flip). Leaflet doesn't always pick this up on its
// own when the parent flex layout reshuffles.
function MapResizer({ trigger }) {
  const map = useMap();
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 60);
    return () => clearTimeout(id);
  }, [trigger, map]);
  return null;
}

// Instagram mode frames every visible pop-up in one shot, so the view is
// derived from the markers rather than from the city's default center/zoom.
// The delay lets MapResizer's invalidateSize land first — fitting bounds
// against a stale container size crops markers out of frame.
function FitAll({ popups, enabled, trigger }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled) return;
    const points = popupLatLngs(popups);
    if (points.length === 0) return;
    const id = setTimeout(() => {
      map.fitBounds(L.latLngBounds(points), {
        padding: fitPadding(map),
        maxZoom: FIT_MAX_ZOOM,
        animate: false,
      });
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
}) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      zoomControl={false}
      className="w-full h-full"
      preferCanvas={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
        subdomains={['a', 'b', 'c', 'd']}
        maxZoom={19}
      />
      <MarkersLayer
        popups={popups}
        selectedId={selectedId}
        requestSeq={selectedSeq}
        userCoord={userCoord}
        onMarkerSelect={onMarkerSelect}
        instagramMode={instagramMode}
      />
      <FlyTo coord={userCoord} seq={flyToUserSeq} />
      <CityView center={center} zoom={zoom} />
      <MapResizer trigger={resizeKey} />
      <FitAll popups={popups} enabled={instagramMode} trigger={resizeKey} />
    </MapContainer>
  );
}
