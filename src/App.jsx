import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header.jsx';
import FilterChips from './components/FilterChips.jsx';
import MapView from './components/Map.jsx';
import BottomSheet, { COLLAPSED_HEIGHT } from './components/BottomSheet.jsx';
import PopupList from './components/PopupList.jsx';
import NearMeButton from './components/NearMeButton.jsx';
import ExpandMapButton from './components/ExpandMapButton.jsx';
import SortToggle from './components/SortToggle.jsx';
import MapLegend from './components/MapLegend.jsx';
import { usePopups } from './hooks/usePopups.js';
import { useGeolocation } from './hooks/useGeolocation.js';
import { filterPopups, FILTERS } from './lib/dateFilters.js';
import { distanceMeters } from './lib/geo.js';

const HEADER_HEIGHT = 48;
const CHIPS_HEIGHT = 48;
const CUSTOM_PANEL_HEIGHT = 56;
const DESKTOP_MIN_WIDTH = 768;

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('when');
  const filter = FILTERS.includes(v) ? v : 'week';
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  return { filter, customRange: { from, to } };
}

function writeUrlState({ filter, customRange }) {
  const url = new URL(window.location.href);
  url.searchParams.set('when', filter);
  if (filter === 'custom') {
    if (customRange.from) url.searchParams.set('from', customRange.from);
    else url.searchParams.delete('from');
    if (customRange.to) url.searchParams.set('to', customRange.to);
    else url.searchParams.delete('to');
  } else {
    url.searchParams.delete('from');
    url.searchParams.delete('to');
  }
  window.history.replaceState(null, '', url);
}

function useIsDesktop() {
  const query = `(min-width: ${DESKTOP_MIN_WIDTH}px)`;
  const [match, setMatch] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e) => setMatch(e.matches);
    if (mql.addEventListener) mql.addEventListener('change', handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', handler);
      else mql.removeListener(handler);
    };
  }, [query]);
  return match;
}

export default function App() {
  const { popups: allPopups, status, retry } = usePopups();

  const initial = useRef(readUrlState()).current;
  const [filter, setFilter] = useState(initial.filter);
  const [customRange, setCustomRange] = useState(initial.customRange);

  const [selectedId, setSelectedId] = useState(null);
  const [mapSelectSeq, setMapSelectSeq] = useState(0);
  const [scrollToId, setScrollToId] = useState(null);
  const [snapTo, setSnapTo] = useState(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [sortMode, setSortMode] = useState('date');

  const isDesktop = useIsDesktop();

  const [containerHeight, setContainerHeight] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800,
  );
  const shellRef = useRef(null);

  const geo = useGeolocation();
  const [flyToUserSeq, setFlyToUserSeq] = useState(0);

  useEffect(() => {
    const measure = () => {
      const node = shellRef.current;
      if (node) setContainerHeight(node.clientHeight);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    writeUrlState({ filter, customRange });
  }, [filter, customRange]);

  const filtered = useMemo(
    () => filterPopups(allPopups, filter, customRange),
    [allPopups, filter, customRange],
  );

  const sorted = useMemo(() => {
    if (sortMode !== 'distance' || !geo.coord) return filtered;
    return [...filtered].sort(
      (a, b) =>
        distanceMeters(geo.coord, [a.lat, a.lng]) -
        distanceMeters(geo.coord, [b.lat, b.lng]),
    );
  }, [filtered, sortMode, geo.coord]);

  useEffect(() => {
    if (selectedId && !filtered.some((p) => p.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filtered, selectedId]);

  const onCardSelect = useCallback(
    (popup) => {
      setSelectedId(popup.id);
      setMapSelectSeq((n) => n + 1);
      if (mapExpanded) setMapExpanded(false);
    },
    [mapExpanded],
  );

  const onMarkerSelect = useCallback(
    (popup) => {
      setSelectedId(popup.id);
      setScrollToId(popup.id);
      if (mapExpanded) setMapExpanded(false);
      // On mobile, also snap the sheet to half so the selected card is
      // visible. On desktop the list panel is always on screen.
      if (!isDesktop) setSnapTo('half');
      setMapSelectSeq((n) => n + 1);
    },
    [mapExpanded, isDesktop],
  );

  useEffect(() => {
    if (geo.coord) setFlyToUserSeq((n) => n + 1);
  }, [geo.coord]);

  useEffect(() => {
    if (!geo.error) return;
    const id = setTimeout(geo.clearError, 4000);
    return () => clearTimeout(id);
  }, [geo.error, geo.clearError]);

  const onSortChange = useCallback(
    (mode) => {
      if (mode === 'distance' && !geo.coord) geo.request();
      setSortMode(mode);
    },
    [geo],
  );

  useEffect(() => {
    if (sortMode === 'distance' && geo.error) setSortMode('date');
  }, [sortMode, geo.error]);

  const summary =
    status === 'loading'
      ? 'Loading'
      : `${sorted.length} pop-up${sorted.length === 1 ? '' : 's'}`;

  const topAreaHeight =
    HEADER_HEIGHT + CHIPS_HEIGHT + (filter === 'custom' ? CUSTOM_PANEL_HEIGHT : 0);

  // Trigger Leaflet's invalidateSize when the layout shape changes.
  const resizeKey = `${isDesktop ? 'd' : 'm'}-${mapExpanded ? 'x' : 'n'}-${filter === 'custom' ? 'c' : 's'}`;

  const buttonsBottomOffset = isDesktop
    ? 0
    : mapExpanded
    ? 0
    : COLLAPSED_HEIGHT;

  return (
    <div ref={shellRef} className="app-shell h-screen flex flex-col">
      <Header />
      <FilterChips
        value={filter}
        onChange={setFilter}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
      />

      <main className={isDesktop ? 'flex-1 overflow-hidden flex flex-row' : 'relative flex-1 overflow-hidden'}>
        {isDesktop ? (
          <>
            {!mapExpanded && (
              <aside className="w-[420px] shrink-0 border-r border-hair bg-white flex flex-col">
                <div className="px-5 py-3 border-b border-hair text-[13px] text-muted">
                  {summary}
                </div>
                <SortToggle
                  value={sortMode}
                  onChange={onSortChange}
                  distanceAvailable={Boolean(geo.coord)}
                />
                <div className="flex-1 overflow-y-auto">
                  <PopupList
                    popups={sorted}
                    onSelect={onCardSelect}
                    scrollToId={scrollToId}
                    status={status}
                    onRetry={retry}
                  />
                </div>
              </aside>
            )}
            <section className="relative flex-1 min-w-0">
              <div className="absolute inset-0">
                <MapView
                  popups={sorted}
                  selectedId={selectedId}
                  selectedSeq={mapSelectSeq}
                  userCoord={geo.coord}
                  flyToUserSeq={flyToUserSeq}
                  onMarkerSelect={onMarkerSelect}
                  resizeKey={resizeKey}
                />
              </div>

              <MapLegend />

              {status === 'stale' && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white border border-hair px-3 py-1 text-[12px] text-muted z-[450]">
                  data may be stale
                </div>
              )}

              <ExpandMapButton
                expanded={mapExpanded}
                onClick={() => setMapExpanded((v) => !v)}
                bottomOffset={buttonsBottomOffset}
              />
              <NearMeButton
                onClick={geo.request}
                bottomOffset={buttonsBottomOffset}
              />

              {geo.error && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-6 bg-white border border-hair px-4 py-2 text-[13px] text-ink z-[600]">
                  {geo.error}
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <div className="absolute inset-0">
              <MapView
                popups={sorted}
                selectedId={selectedId}
                selectedSeq={mapSelectSeq}
                userCoord={geo.coord}
                flyToUserSeq={flyToUserSeq}
                onMarkerSelect={onMarkerSelect}
                resizeKey={resizeKey}
              />
            </div>

            <MapLegend />

            {status === 'stale' && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white border border-hair px-3 py-1 text-[12px] text-muted z-[450]">
                data may be stale
              </div>
            )}

            <ExpandMapButton
              expanded={mapExpanded}
              onClick={() => setMapExpanded((v) => !v)}
              bottomOffset={buttonsBottomOffset}
            />
            <NearMeButton
              onClick={geo.request}
              bottomOffset={buttonsBottomOffset}
            />

            {geo.error && (
              <div className="absolute left-4 right-4 bottom-[100px] mx-auto max-w-xs bg-white border border-hair px-4 py-2 text-[13px] text-ink z-[600] text-center">
                {geo.error}
              </div>
            )}

            {!mapExpanded && (
              <BottomSheet
                containerHeight={Math.max(containerHeight - topAreaHeight, 0)}
                topOffset={0}
                snapTo={snapTo}
                onSnapped={() => setSnapTo(null)}
                collapsedSummary={summary}
              >
                <SortToggle
                  value={sortMode}
                  onChange={onSortChange}
                  distanceAvailable={Boolean(geo.coord)}
                />
                <PopupList
                  popups={sorted}
                  onSelect={onCardSelect}
                  scrollToId={scrollToId}
                  status={status}
                  onRetry={retry}
                />
              </BottomSheet>
            )}
          </>
        )}
      </main>
    </div>
  );
}
