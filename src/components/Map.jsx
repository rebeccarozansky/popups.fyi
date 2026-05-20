import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../lib/config.js';
import { formatTimeRange } from '../lib/dateFilters.js';
import { dotColorFor } from './CategoryBadge.jsx';
import { buildIconMarkerSvg } from '../lib/categoryIcons.js';

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

function markerIcon(categories, isSelected) {
  const { width, height, svg } = buildIconMarkerSvg(categories, isSelected);
  return L.divIcon({
    html: `<div class="pf-marker${isSelected ? ' pf-marker--selected' : ''}">${svg}</div>`,
    className: '',
    iconSize: L.point(width, height),
    iconAnchor: [width / 2, height / 2],
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

function popupHtml(popup) {
  const safe = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
  const parts = [`<div style="font-weight:600">${safe(popup.name)}</div>`];
  if (popup.location_name) {
    parts.push(`<div style="color:#6B7280;font-size:13px">@ ${safe(popup.location_name)}</div>`);
  }
  parts.push(`<div style="margin-top:4px;font-size:13px;color:#6B7280">${safe(formatTimeRange(popup))}</div>`);
  if (popup.categories && popup.categories.length > 0) {
    const chips = popup.categories
      .map(
        (c) =>
          `<span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#0A1628"><span style="display:inline-block;width:6px;height:6px;border-radius:9999px;background:${dotColorFor(c)}"></span>${safe(c)}</span>`,
      )
      .join('<span style="display:inline-block;width:12px"></span>');
    parts.push(`<div style="margin-top:6px">${chips}</div>`);
  }
  parts.push(`<a href="#" class="pf-detail-link" data-popup-id="${safe(popup.id)}" style="display:inline-block;margin-top:8px">View details</a>`);
  return parts.join('');
}

// Imperative layer manager. Lives inside MapContainer so useMap() works.
function MarkersLayer({ popups, selectedId, requestSeq, userCoord, onMarkerSelect }) {
  const map = useMap();
  const clusterRef = useRef(null);
  const markersRef = useRef(new Map()); // id -> L.marker
  const userMarkerRef = useRef(null);
  const onMarkerSelectRef = useRef(onMarkerSelect);
  onMarkerSelectRef.current = onMarkerSelect;

  // Create the cluster group once.
  useEffect(() => {
    const group = L.markerClusterGroup({
      iconCreateFunction: createClusterIcon,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 16,
      maxClusterRadius: (zoom) => (zoom >= 11 ? 0 : 60),
    });
    map.addLayer(group);
    clusterRef.current = group;

    // Delegated click handler for "View details" link inside popups.
    const onPopupOpen = (e) => {
      const el = e.popup.getElement();
      if (!el) return;
      const link = el.querySelector('.pf-detail-link');
      if (!link) return;
      link.addEventListener('click', (evt) => {
        evt.preventDefault();
        const id = link.getAttribute('data-popup-id');
        const popup = (popupsRef.current || []).find((p) => p.id === id);
        if (popup) onMarkerSelectRef.current?.(popup, { source: 'detail-link' });
      });
    };
    map.on('popupopen', onPopupOpen);

    return () => {
      map.off('popupopen', onPopupOpen);
      map.removeLayer(group);
      clusterRef.current = null;
      markersRef.current.clear();
    };
  }, [map]);

  const popupsRef = useRef(popups);
  popupsRef.current = popups;

  // Sync markers whenever the popup list changes.
  useEffect(() => {
    const group = clusterRef.current;
    if (!group) return;
    group.clearLayers();
    markersRef.current.clear();
    for (const p of popups) {
      const m = L.marker([p.lat, p.lng], { icon: markerIcon(p.categories, false) });
      m.bindPopup(popupHtml(p), { closeButton: true, autoPan: true });
      m.on('click', () => {
        onMarkerSelectRef.current?.(p, { source: 'marker' });
      });
      markersRef.current.set(p.id, m);
      group.addLayer(m);
    }
  }, [popups]);

  // Highlight selected marker (grow it). Re-run when selection changes.
  useEffect(() => {
    for (const [id, m] of markersRef.current.entries()) {
      const p = popupsRef.current.find((pp) => pp.id === id);
      m.setIcon(markerIcon(p?.categories, id === selectedId));
    }
  }, [selectedId, popups]);

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

export default function MapView({
  popups,
  selectedId,
  selectedSeq,
  userCoord,
  flyToUserSeq,
  onMarkerSelect,
  resizeKey,
}) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
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
      />
      <FlyTo coord={userCoord} seq={flyToUserSeq} />
      <MapResizer trigger={resizeKey} />
    </MapContainer>
  );
}
