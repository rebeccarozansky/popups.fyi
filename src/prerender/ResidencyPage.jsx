import CategoryBadge from '../components/CategoryBadge.jsx';
import { InstagramIcon, MapPinIcon, OrderIcon } from '../components/PopupCard.jsx';
import ResidencyGlyph from '../components/ResidencyGlyph.jsx';
import { formatCardDateTime } from '../lib/dateFilters.js';
import { formatResidencyHours, formatResidencySchedule, formatResidencySpan } from '../lib/residencies.js';
import { ActionLink, DateList, Detail, Details, EndedNotice, MapLink, Note, Section } from './StaticPage.jsx';

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// A residency: its weekly schedule, how long it runs, the next date (which the
// page's Event JSON-LD describes) and the dates after that.
export default function ResidencyPage({ residency, vendor, ended, next, nextDates, instagram, mapsUrl, mapPath, now }) {
  return (
    <article className="mt-3">
      <h1 className="text-[24px] md:text-[28px] leading-tight font-semibold text-ink">
        {residency.name}
        {residency.location_name && (
          <span className="font-normal text-muted"> at {residency.location_name}</span>
        )}
      </h1>
      <p className="mt-2 text-[13px] text-muted flex flex-wrap items-center gap-2">
        <span className="inline-block uppercase tracking-wide text-[11px] font-semibold text-ink border border-hair px-1.5 py-0.5">
          <ResidencyGlyph size={11} strokeWidth={1.6} className="inline-block mr-1 align-[-1px]" />
          Residency
        </span>
        {formatResidencySchedule(residency, now)}
      </p>

      {ended && (
        <EndedNotice>
          This residency has ended. See{' '}
          <a href={vendor.path} className="underline underline-offset-2 font-semibold">
            {vendor.name}&apos;s other dates
          </a>
          .
        </EndedNotice>
      )}

      <Details>
        <Detail label="Hours">
          {formatResidencyHours(residency, now).map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </Detail>
        <Detail label="Runs">{capitalize(formatResidencySpan(residency, now))}</Detail>
        {next && <Detail label={ended ? 'Last date' : 'Next'}>{formatCardDateTime(next)}</Detail>}
        <Detail label="Where">
          {residency.location_name || residency.name}
          {residency.address && <span className="block text-[13px] text-muted">{residency.address}</span>}
        </Detail>
        {residency.neighborhood && <Detail label="Neighborhood">{residency.neighborhood}</Detail>}
        {residency.categories.length > 0 && (
          <Detail label="Category">
            <CategoryBadge categories={residency.categories} />
          </Detail>
        )}
      </Details>

      {residency.notes && <p className="mt-4 text-[14px] text-ink">{residency.notes}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        {instagram && (
          <ActionLink href={instagram.url} icon={<InstagramIcon />}>
            {instagram.handle}
          </ActionLink>
        )}
        {mapsUrl && (
          <ActionLink href={mapsUrl} icon={<MapPinIcon />}>
            Google Maps
          </ActionLink>
        )}
        {residency.order_url && (
          <ActionLink href={residency.order_url} icon={<OrderIcon />}>
            Order
          </ActionLink>
        )}
      </div>

      <div className="mt-6">
        <MapLink href={mapPath}>See it on the map →</MapLink>
      </div>

      {!ended && (
        <Section title="Coming up">
          {nextDates.length > 0 ? <DateList items={nextDates} /> : <Note>No dates in the next four weeks.</Note>}
        </Section>
      )}

      <Section title={`More from ${vendor.name}`}>
        <p className="mt-2 text-[13px]">
          <a href={vendor.path} className="underline underline-offset-2 text-ink">
            All {vendor.name} dates
          </a>
        </p>
      </Section>
    </article>
  );
}
