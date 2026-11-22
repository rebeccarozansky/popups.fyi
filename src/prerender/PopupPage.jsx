import CategoryBadge from '../components/CategoryBadge.jsx';
import { InstagramIcon, MapPinIcon, OrderIcon } from '../components/PopupCard.jsx';
import { formatCardDateTime } from '../lib/dateFilters.js';
import { ActionLink, DateList, Detail, Details, EndedNotice, MapLink, Note, Section } from './StaticPage.jsx';

// A single pop-up: what, where, when, links, and the vendor's other dates.
// The page's Event JSON-LD (src/prerender/site.jsx) describes exactly this.
export default function PopupPage({ popup, vendor, ended, instagram, mapsUrl, mapPath, moreDates, next }) {
  return (
    <article className="mt-3">
      <h1 className="text-[24px] md:text-[28px] leading-tight font-semibold text-ink">
        {popup.name}
        {popup.location_name && <span className="font-normal text-muted"> at {popup.location_name}</span>}
      </h1>

      {ended && (
        <EndedNotice>
          This pop-up has ended.{' '}
          {next ? (
            <>
              {vendor.name}&apos;s next date is{' '}
              <a href={next.path} className="underline underline-offset-2 font-semibold">
                {next.label}
              </a>
              .
            </>
          ) : (
            <>No upcoming dates are listed for {vendor.name} yet.</>
          )}
        </EndedNotice>
      )}

      <Details>
        <Detail label="When">{formatCardDateTime(popup)}</Detail>
        <Detail label="Where">
          {popup.location_name || popup.name}
          {popup.address && <span className="block text-[13px] text-muted">{popup.address}</span>}
        </Detail>
        {popup.neighborhood && <Detail label="Neighborhood">{popup.neighborhood}</Detail>}
        {popup.categories.length > 0 && (
          <Detail label="Category">
            <CategoryBadge categories={popup.categories} />
          </Detail>
        )}
      </Details>

      {popup.notes && <p className="mt-4 text-[14px] text-ink">{popup.notes}</p>}

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
        {popup.order_url && (
          <ActionLink href={popup.order_url} icon={<OrderIcon />}>
            Order
          </ActionLink>
        )}
      </div>

      <div className="mt-6">
        <MapLink href={mapPath}>See it on the map →</MapLink>
      </div>

      <Section title={`More from ${vendor.name}`}>
        {moreDates.length > 0 ? (
          <DateList items={moreDates} />
        ) : (
          <Note>No other upcoming dates are listed right now.</Note>
        )}
        <p className="mt-3 text-[13px]">
          <a href={vendor.path} className="underline underline-offset-2 text-ink">
            All upcoming {vendor.name} dates
          </a>
        </p>
      </Section>
    </article>
  );
}
