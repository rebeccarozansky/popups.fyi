import { InstagramIcon } from '../components/PopupCard.jsx';
import { ActionLink, DateList, MapLink, Note, Section } from './StaticPage.jsx';

// What one vendor has coming up in a city: upcoming pop-ups and running
// residencies, with their Instagram. Past dates aren't listed. No Event markup
// here: Google's event results only use pages about a single event.
export default function VendorPage({ vendor, city, intro, upcoming, residencies, mapPath }) {
  return (
    <article className="mt-3">
      <h1 className="text-[24px] md:text-[28px] leading-tight font-semibold text-ink">{vendor.name}</h1>
      <p className="mt-2 text-[14px] text-muted">{intro}</p>

      {vendor.instagram && (
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionLink href={vendor.instagram.url} icon={<InstagramIcon />}>
            {vendor.instagram.handle}
          </ActionLink>
        </div>
      )}

      <Section title="Upcoming pop-ups">
        {upcoming.length > 0 ? (
          <DateList items={upcoming} />
        ) : (
          <Note>
            No upcoming pop-ups are listed in {city.name} right now.
            {vendor.instagram && ` Follow ${vendor.instagram.handle} on Instagram for their next date.`}
          </Note>
        )}
      </Section>

      {residencies.length > 0 && (
        <Section title="Residencies">
          <DateList items={residencies} />
        </Section>
      )}

      <div className="mt-8">
        <MapLink href={mapPath}>See {city.name}&apos;s pop-up map →</MapLink>
      </div>
    </article>
  );
}
