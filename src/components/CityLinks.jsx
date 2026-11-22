import { Fragment } from 'react';
import { pathForCity } from '../lib/cities.js';

// A line at the end of the list with plain links to the other cities, so
// search engines can follow them (the picker in the header is a <select>,
// which they don't). An ordinary click still switches city in place like the
// picker, keeping the filters; a new-tab click opens the page as normal.
export default function CityLinks({ city, cities, onSelect }) {
  const others = cities.filter((c) => c.slug !== city.slug);
  if (others.length === 0) return null;

  const onClick = (e, slug) => {
    if (!onSelect || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onSelect(slug);
  };

  return (
    <nav aria-label="Other cities" className="px-5 py-4 text-[12px] text-muted">
      Also on popups.fyi:{' '}
      {others.map((c, i) => (
        <Fragment key={c.slug}>
          {i > 0 && ' · '}
          <a
            href={pathForCity(c)}
            onClick={(e) => onClick(e, c.slug)}
            className="underline underline-offset-2 hover:text-ink"
          >
            {c.name}
          </a>
        </Fragment>
      ))}
    </nav>
  );
}
