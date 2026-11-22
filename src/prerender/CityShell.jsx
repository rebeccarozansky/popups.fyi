import { COLLAPSED_HEIGHT } from '../components/BottomSheet.jsx';
import CityLinks from '../components/CityLinks.jsx';
import ExpandMapButton from '../components/ExpandMapButton.jsx';
import FilterChips from '../components/FilterChips.jsx';
import Header from '../components/Header.jsx';
import MapLegend from '../components/MapLegend.jsx';
import NearMeButton from '../components/NearMeButton.jsx';
import PopupList from '../components/PopupList.jsx';
import SortToggle from '../components/SortToggle.jsx';

const noop = () => {};

// The static copy of a city page that the build puts inside #root: the This
// Week view, drawn with the app's own components so that when main.jsx's
// createRoot replaces it, the app's first frame lands on the same pixels.
//
// One set of markup covers both layouts through md: classes (the app picks
// its layout in JavaScript): on phones the list is the bottom sheet (same
// classes as BottomSheet.jsx) at its half-height snap point over the map;
// from 768px it's the 420px panel beside the map. The map area stays blank
// until MapLibre draws into it.
//
// The cards' titles link to each pop-up's page (`linkFor`), so search engines
// and visitors who tap before the app loads can reach it.
export default function CityShell({ city, cities, list, summary, emptyMessage, hasResidencies, linkFor }) {
  return (
    <div className="app-shell h-screen flex flex-col">
      <Header city={city} cities={cities} onCityChange={noop} onSubmitClick={noop} />
      <FilterChips
        value="week"
        onChange={noop}
        customRange={{ from: '', to: '' }}
        onCustomRangeChange={noop}
        residency={hasResidencies ? { on: true, onToggle: noop } : null}
      />
      <main className="relative flex-1 overflow-hidden md:flex md:flex-row">
        <aside className="pf-sheet absolute left-0 right-0 top-1/2 bottom-0 z-[500] bg-white border-t border-hair flex flex-col md:static md:w-[420px] md:shrink-0 md:border-t-0 md:border-r">
          {/* Phones: the sheet's grab handle and summary. */}
          <div className="md:hidden pt-3 pb-3 flex flex-col items-center select-none">
            <span aria-hidden="true" className="block w-12 h-1.5 rounded-full bg-handle" />
            <div className="mt-2 text-[13px] text-muted h-4">{summary}</div>
          </div>
          {/* Desktop: the list panel's summary line. */}
          <div className="hidden md:block px-5 py-3 border-b border-hair text-[13px] text-muted">
            {summary}
          </div>
          <SortToggle value="date" onChange={noop} distanceAvailable={false} savedCount={0} />
          <div className="pf-sheet-scroll flex-1 overflow-y-auto">
            <PopupList
              popups={list}
              onSelect={noop}
              status="ready"
              onToggleSave={noop}
              emptyMessage={emptyMessage}
              linkFor={linkFor}
            />
            <CityLinks city={city} cities={cities} />
          </div>
        </aside>
        <section className="absolute inset-0 md:relative md:inset-auto md:flex-1 md:min-w-0">
          <MapLegend showResidency={hasResidencies} />
          {/* The map buttons sit above the collapsed sheet on phones. */}
          <div className="md:hidden">
            <ExpandMapButton expanded={false} onClick={noop} bottomOffset={COLLAPSED_HEIGHT} />
            <NearMeButton onClick={noop} bottomOffset={COLLAPSED_HEIGHT} />
          </div>
          <div className="hidden md:block">
            <ExpandMapButton expanded={false} onClick={noop} bottomOffset={0} />
            <NearMeButton onClick={noop} bottomOffset={0} />
          </div>
        </section>
      </main>
    </div>
  );
}
