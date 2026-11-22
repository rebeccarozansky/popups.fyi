import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import Header from './components/Header.jsx';
import FilterChips from './components/FilterChips.jsx';
import BottomSheet, { COLLAPSED_HEIGHT } from './components/BottomSheet.jsx';
import PopupList from './components/PopupList.jsx';
import CityLinks from './components/CityLinks.jsx';
import NearMeButton from './components/NearMeButton.jsx';
import ExpandMapButton from './components/ExpandMapButton.jsx';
import SortToggle from './components/SortToggle.jsx';
import MapLegend from './components/MapLegend.jsx';
import SubmitPopupModal from './components/SubmitPopupModal.jsx';
import { usePopups, useResidencies } from './hooks/usePopups.js';
import { useGeolocation } from './hooks/useGeolocation.js';
import { useSavedPopups } from './hooks/useSavedPopups.js';
import { useCityRoute } from './hooks/useCityRoute.js';
import { cityForPopup, popupsInCity } from './lib/cities.js';
import { RESIDENCY_ID_PREFIX } from './lib/csv.js';
import { FILTERS } from './lib/dateFilters.js';
import { distanceMeters } from './lib/geo.js';
import { byStart, emptyListMessage, filterListings, listSummary } from './lib/listing.js';
import {
  pagePathFor,
  parsePagePath,
  popupSlugs,
  residencySlugs,
  vendorPagePathFor,
  vendorPages,
} from './lib/pages.js';
import { residencyEntryNow } from './lib/residencies.js';

// MapLibre is most of the app's JavaScript. Loading the map on its own lets
// the list render - and take over from the prerendered page - without waiting
// for it.
const MapView = lazy(() => import('./components/Map.jsx'));

// Mobile-layout header height. The header grows to 56px at md (768px), which
// is exactly where the layout switches to desktop and the bottom sheet stops
// rendering — so the sheet only ever sees the 48px header. Keep the header's
// md: breakpoint and DESKTOP_MIN_WIDTH in sync or this measurement drifts.
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
  const sharedId = params.get('id') || null;
  // "Instagram mode" (?ig=1): a screenshot layout. Clustering is turned off so
  // every pop-up shows as its own marker, the map fills the frame, and the
  // interactive chrome (list, map buttons, submit link) is hidden. Read once at
  // mount and never written back, so it survives filter changes but is only
  // ever entered deliberately via the URL.
  const instagramMode = params.get('ig') === '1';
  // Residencies are shown unless switched off; only the off state is kept in
  // the URL (?res=0), so ordinary links stay clean.
  const showResidencies = params.get('res') !== '0';
  // A pop-up or residency page address that reached the app instead of a
  // prerendered page - a row added since the last build, or a page more than
  // 30 days past its end - is treated like ?id= once the sheet has loaded.
  const pageLink = sharedId ? null : parsePagePath(window.location.pathname);
  return { filter, customRange: { from, to }, sharedId, instagramMode, showResidencies, pageLink };
}

function writeUrlState({ filter, customRange, showResidencies }) {
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
  if (showResidencies) url.searchParams.delete('res');
  else url.searchParams.set('res', '0');
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
  const { popups: everyPopup, status, retry } = usePopups();
  const { residencies: everyResidency, status: residencyStatus } = useResidencies();
  const { city, cities, selectCity } = useCityRoute();

  // Everything downstream (filters, saved list, map, deep links) operates on
  // the active city's pop-ups only.
  const allPopups = useMemo(() => popupsInCity(everyPopup, city), [everyPopup, city]);
  const allResidencies = useMemo(
    () => popupsInCity(everyResidency, city),
    [everyResidency, city],
  );

  const initial = useRef(readUrlState()).current;
  const [filter, setFilter] = useState(initial.filter);
  const [customRange, setCustomRange] = useState(initial.customRange);
  const [showResidencies, setShowResidencies] = useState(initial.showResidencies);
  // Nothing to toggle in a city without residencies (or with no residency
  // sheet configured) - the switch is hidden there.
  const residenciesOn = showResidencies && allResidencies.length > 0;
  // Deep link: ?id=<popup.id>. Held in state (not a ref) so the shared pop-up
  // can be force-injected into the list/map even when the active date filter
  // — or the pop-up having already ended — would normally hide it.
  const [sharedId, setSharedId] = useState(initial.sharedId);
  const [pageLink, setPageLink] = useState(initial.pageLink);
  const instagramMode = initial.instagramMode;

  const [selectedId, setSelectedId] = useState(null);
  const [mapSelectSeq, setMapSelectSeq] = useState(0);
  const [scrollToId, setScrollToId] = useState(null);
  const [snapTo, setSnapTo] = useState(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [sortMode, setSortMode] = useState('date');
  const [submitOpen, setSubmitOpen] = useState(false);

  const isDesktop = useIsDesktop();

  const [containerHeight, setContainerHeight] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800,
  );
  const shellRef = useRef(null);

  const geo = useGeolocation();
  const [flyToUserSeq, setFlyToUserSeq] = useState(0);
  const { saved, isSaved, toggle: toggleSaved } = useSavedPopups();

  // Page addresses for every pop-up and residency, from the same helpers the
  // build uses (src/lib/pages.js), so Share links to the pages it writes.
  const slugs = useMemo(
    () => ({ popups: popupSlugs(everyPopup), residencies: residencySlugs(everyResidency) }),
    [everyPopup, everyResidency],
  );
  const shareUrlFor = useCallback(
    (item) => {
      const path = pagePathFor(item, slugs);
      return path ? new URL(path, window.location.origin).toString() : null;
    },
    [slugs],
  );
  // The map's popups link to the vendor's page, when the build makes one.
  const vendorPageList = useMemo(
    () => vendorPages(everyPopup, everyResidency),
    [everyPopup, everyResidency],
  );
  const vendorPathFor = useCallback(
    (item) => vendorPagePathFor(item, vendorPageList),
    [vendorPageList],
  );

  // Measured before paint, so on a prerendered page the sheet stays exactly
  // where the static copy drew it instead of jumping for a frame.
  useLayoutEffect(() => {
    const measure = () => {
      const node = shellRef.current;
      if (node) setContainerHeight(node.clientHeight);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    writeUrlState({ filter, customRange, showResidencies });
  }, [filter, customRange, showResidencies]);

  // Residencies slot into the same date order as one-off pop-ups, each placed
  // at its first date inside the active window.
  const filtered = useMemo(
    () =>
      filterListings(
        allPopups,
        residenciesOn ? allResidencies : null,
        filter,
        customRange,
        city.timezone,
      ),
    [allPopups, allResidencies, residenciesOn, filter, customRange, city.timezone],
  );

  // In saved mode we bypass the date filter entirely and show every saved
  // pop-up (past and future). Otherwise apply the active date filter, and
  // optionally sort by distance from the user.
  const sorted = useMemo(() => {
    let list;
    if (sortMode === 'saved') {
      const savedResidencies = residenciesOn
        ? allResidencies
            .filter((r) => saved.has(r.id))
            .map((r) => residencyEntryNow(r))
            .filter(Boolean)
        : [];
      list = [...allPopups.filter((p) => saved.has(p.id)), ...savedResidencies].sort(byStart);
    } else if (sortMode === 'distance' && geo.coord) {
      list = [...filtered].sort(
        (a, b) =>
          distanceMeters(geo.coord, [a.lat, a.lng]) -
          distanceMeters(geo.coord, [b.lat, b.lng]),
      );
    } else {
      list = filtered;
    }
    // Deep-link override: keep a shared pop-up visible on the list + map even
    // if the active filter would hide it — most importantly, after it has
    // ended. Without this, opening a link to a finished pop-up shows nothing.
    if (sharedId && !list.some((p) => p.id === sharedId)) {
      const sharedResidency = allResidencies.find((r) => r.id === sharedId);
      const shared =
        allPopups.find((p) => p.id === sharedId) ||
        (sharedResidency ? residencyEntryNow(sharedResidency) : null);
      if (shared) list = [shared, ...list];
    }
    return list;
  }, [sortMode, allPopups, allResidencies, residenciesOn, saved, filtered, geo.coord, sharedId]);

  // "Already happened" check — anything whose end time is in the past.
  const isPast = useCallback((p) => p.end < DateTime.now(), []);

  useEffect(() => {
    if (selectedId && !sorted.some((p) => p.id === selectedId)) {
      setSelectedId(null);
    }
  }, [sorted, selectedId]);

  // Resolve a ?id=... deep link once the popup data is available. We do NOT
  // touch the date filter here — the `sorted` memo injects the shared pop-up
  // so it shows even after it has ended. We just select + focus it. (The old
  // approach switched to a custom date range, which both failed for finished
  // pop-ups and caused an infinite render loop that blanked the page.)
  useEffect(() => {
    if (!sharedId) return;
    // Wait for whichever sheet the shared id comes from.
    const residencyLink = sharedId.startsWith(RESIDENCY_ID_PREFIX);
    if (residencyLink ? residencyStatus === 'loading' : everyPopup.length === 0) return;
    const target = (residencyLink ? everyResidency : everyPopup).find((p) => p.id === sharedId);
    if (!target) {
      setSharedId(null);
      return;
    }
    // A shared link may point at a pop-up in another city — follow it there
    // and let this effect re-run once the route has switched.
    const targetCity = cityForPopup(target);
    if (targetCity && targetCity.slug !== city.slug) {
      selectCity(targetCity.slug);
      return;
    }
    setSelectedId(sharedId);
    setScrollToId(sharedId);
    setMapSelectSeq((n) => n + 1);
    if (!isDesktop) setSnapTo('half');
    // Strip the id from the URL so reloads / in-app navigation don't re-fire
    // this, while a fresh visit to the shared link still works.
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    window.history.replaceState(null, '', url);
    // sharedId stays set so the pop-up remains visible until the user starts
    // browsing (changes filter/sort), at which point the handlers clear it.
  }, [sharedId, everyPopup, everyResidency, residencyStatus, isDesktop, city, selectCity]);

  // Resolve a page address (see readUrlState) to its pop-up or residency and
  // hand it to the ?id= handling above. Vendor pages have no single pop-up to
  // show, so they just open the city.
  useEffect(() => {
    if (!pageLink) return;
    const residencyPage = pageLink.kind === 'residencies';
    if (pageLink.kind === 'popups' && everyPopup.length === 0) return;
    if (residencyPage && residencyStatus === 'loading') return;
    setPageLink(null);
    if (pageLink.kind === 'vendors') return;
    const items = residencyPage ? everyResidency : everyPopup;
    const pageSlugs = residencyPage ? slugs.residencies : slugs.popups;
    const target = items.find(
      (item) =>
        pageSlugs.get(item.id) === pageLink.slug && cityForPopup(item)?.slug === pageLink.city.slug,
    );
    if (target) setSharedId(target.id);
  }, [pageLink, everyPopup, everyResidency, residencyStatus, slugs]);

  // Clearing the deep-link override once the user starts browsing normally.
  const onFilterChange = useCallback((next) => {
    setSharedId(null);
    setFilter(next);
  }, []);
  const onCustomRangeChange = useCallback((next) => {
    setSharedId(null);
    setCustomRange(next);
  }, []);
  const onResidencyToggle = useCallback((next) => {
    setSharedId(null);
    setShowResidencies(next);
  }, []);

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
      // Switching sort means the user is browsing — drop the deep-link override.
      setSharedId(null);
      if (mode === 'distance' && !geo.coord) geo.request();
      setSortMode(mode);
    },
    [geo],
  );

  useEffect(() => {
    if (sortMode === 'distance' && geo.error) setSortMode('date');
  }, [sortMode, geo.error]);

  const summary = status === 'loading' ? 'Loading' : listSummary(sorted);

  // City-aware empty copy so a city with no upcoming rows doesn't read as a
  // loading failure.
  const emptyMessage = emptyListMessage({
    cityName: city.name,
    saved: sortMode === 'saved',
    anyListed: allPopups.length > 0,
  });

  const topAreaHeight =
    HEADER_HEIGHT + CHIPS_HEIGHT + (filter === 'custom' ? CUSTOM_PANEL_HEIGHT : 0);

  // Re-measure the map when the layout shape changes.
  const resizeKey = `${isDesktop ? 'd' : 'm'}-${mapExpanded ? 'x' : 'n'}-${filter === 'custom' ? 'c' : 's'}-${city.slug}`;

  const buttonsBottomOffset = isDesktop
    ? 0
    : mapExpanded
    ? 0
    : COLLAPSED_HEIGHT;

  return (
    <div
      ref={shellRef}
      className="app-shell h-screen flex flex-col"
      // The Instagram caption script waits for the residency sheet to settle
      // before reading the list (tools/instagram-shot).
      data-residency-status={residencyStatus}
    >
      <Header
        city={city}
        cities={cities}
        onCityChange={selectCity}
        onSubmitClick={() => setSubmitOpen(true)}
        showSubmit={!instagramMode}
      />
      <FilterChips
        value={filter}
        onChange={onFilterChange}
        customRange={customRange}
        onCustomRangeChange={onCustomRangeChange}
        residency={
          !instagramMode && allResidencies.length > 0
            ? { on: showResidencies, onToggle: onResidencyToggle }
            : null
        }
      />

      <main className={isDesktop ? 'flex-1 overflow-hidden flex flex-row' : 'relative flex-1 overflow-hidden'}>
        {isDesktop ? (
          <>
            {!mapExpanded && !instagramMode && (
              <aside className="w-[420px] shrink-0 border-r border-hair bg-white flex flex-col">
                <div className="px-5 py-3 border-b border-hair text-[13px] text-muted">
                  {summary}
                </div>
                <SortToggle
                  value={sortMode}
                  onChange={onSortChange}
                  distanceAvailable={Boolean(geo.coord)}
                  savedCount={saved.size}
                />
                <div className="flex-1 overflow-y-auto">
                  <PopupList
                    popups={sorted}
                    onSelect={onCardSelect}
                    scrollToId={scrollToId}
                    status={status}
                    onRetry={retry}
                    isSaved={isSaved}
                    onToggleSave={toggleSaved}
                    isPast={isPast}
                    emptyMessage={emptyMessage}
                    shareUrlFor={shareUrlFor}
                  />
                  <CityLinks city={city} cities={cities} onSelect={selectCity} />
                </div>
              </aside>
            )}
            <section className="relative flex-1 min-w-0">
              <div className="absolute inset-0">
                <Suspense fallback={null}>
                  <MapView
                    popups={sorted}
                    selectedId={selectedId}
                    selectedSeq={mapSelectSeq}
                    userCoord={geo.coord}
                    flyToUserSeq={flyToUserSeq}
                    onMarkerSelect={onMarkerSelect}
                    resizeKey={resizeKey}
                    center={city.center}
                    zoom={city.zoom}
                    instagramMode={instagramMode}
                    vendorPathFor={vendorPathFor}
                  />
                </Suspense>
              </div>

              <MapLegend showResidency={residenciesOn} />

              {status === 'stale' && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white border border-hair px-3 py-1 text-[12px] text-muted z-[450]">
                  data may be stale
                </div>
              )}

              {!instagramMode && (
                <>
                  <ExpandMapButton
                    expanded={mapExpanded}
                    onClick={() => setMapExpanded((v) => !v)}
                    bottomOffset={buttonsBottomOffset}
                  />
                  <NearMeButton
                    onClick={geo.request}
                    bottomOffset={buttonsBottomOffset}
                  />
                </>
              )}

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
              <Suspense fallback={null}>
                <MapView
                  popups={sorted}
                  selectedId={selectedId}
                  selectedSeq={mapSelectSeq}
                  userCoord={geo.coord}
                  flyToUserSeq={flyToUserSeq}
                  onMarkerSelect={onMarkerSelect}
                  resizeKey={resizeKey}
                  center={city.center}
                  zoom={city.zoom}
                  instagramMode={instagramMode}
                  vendorPathFor={vendorPathFor}
                />
              </Suspense>
            </div>

            <MapLegend showResidency={residenciesOn} />

            {status === 'stale' && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white border border-hair px-3 py-1 text-[12px] text-muted z-[450]">
                data may be stale
              </div>
            )}

            {!instagramMode && (
              <>
                <ExpandMapButton
                  expanded={mapExpanded}
                  onClick={() => setMapExpanded((v) => !v)}
                  bottomOffset={buttonsBottomOffset}
                />
                <NearMeButton
                  onClick={geo.request}
                  bottomOffset={buttonsBottomOffset}
                />
              </>
            )}

            {geo.error && (
              <div className="absolute left-4 right-4 bottom-[100px] mx-auto max-w-xs bg-white border border-hair px-4 py-2 text-[13px] text-ink z-[600] text-center">
                {geo.error}
              </div>
            )}

            {!mapExpanded && !instagramMode && (
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
                  savedCount={saved.size}
                />
                <PopupList
                  popups={sorted}
                  onSelect={onCardSelect}
                  scrollToId={scrollToId}
                  status={status}
                  onRetry={retry}
                  isSaved={isSaved}
                  onToggleSave={toggleSaved}
                  isPast={isPast}
                  emptyMessage={emptyMessage}
                  shareUrlFor={shareUrlFor}
                />
                <CityLinks city={city} cities={cities} onSelect={selectCity} />
              </BottomSheet>
            )}
          </>
        )}
      </main>

      <SubmitPopupModal open={submitOpen} onClose={() => setSubmitOpen(false)} />
    </div>
  );
}
