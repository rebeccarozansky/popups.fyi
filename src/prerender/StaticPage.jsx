import { Fragment } from 'react';
import { Jitter, PREFIX } from '../components/Header.jsx';
import { CITIES, pathForCity } from '../lib/cities.js';
import { SUBMIT_EMAIL } from '../lib/config.js';

// Shell for the prerendered pop-up, vendor and residency pages: the app's
// header look, visible breadcrumbs, one column of content and a footer that
// links every city. These pages ship without the app's JavaScript, so
// everything here is plain links.

// Small uppercase label, as in the map legend.
export const LABEL_CLASS = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-muted';

export default function StaticPage({ city, breadcrumbs, children }) {
  return (
    <div className="min-h-full bg-white flex flex-col">
      <header className="h-12 md:h-14 border-b border-hair bg-white flex items-center px-5">
        <a href={pathForCity(city)} className="flex items-center min-w-0" aria-label={`popups.fyi/${city.slug}`}>
          <img
            src="/logo.svg"
            alt=""
            aria-hidden="true"
            width={289}
            height={412}
            className="h-10 w-auto md:h-12 shrink-0 select-none mr-1.5"
          />
          <span className="pf-wordmark text-[22px] sm:text-[26px] leading-none text-ink select-none inline-flex items-center">
            <Jitter text={PREFIX} />
            {/* One span inside .pf-city, as in the app: its flex gap would
                otherwise space out every letter. */}
            <span className="pf-city">
              <span>
                <Jitter text={city.slug} offset={PREFIX.length} />
              </span>
            </span>
          </span>
        </a>
        <a
          href={pathForCity(city)}
          className="ml-auto shrink-0 whitespace-nowrap text-[12px] text-muted hover:text-ink underline underline-offset-2"
        >
          Open the map
        </a>
      </header>

      <main className="flex-1 w-full max-w-[640px] mx-auto px-5 pt-4 pb-12">
        <Breadcrumbs items={breadcrumbs} />
        {children}
      </main>

      <footer className="border-t border-hair">
        <div className="max-w-[640px] mx-auto px-5 py-6 text-[12px] text-muted space-y-2">
          <p>
            popups.fyi maps bakery and café pop-ups in{' '}
            {CITIES.map((c, i) => (
              <Fragment key={c.slug}>
                {i > 0 && (i === CITIES.length - 1 ? ' and ' : ', ')}
                <a href={pathForCity(c)} className="underline underline-offset-2 hover:text-ink">
                  {c.name}
                </a>
              </Fragment>
            ))}
            .
          </p>
          <p>
            Own a pop-up? Email{' '}
            <a href={`mailto:${SUBMIT_EMAIL}`} className="underline underline-offset-2 hover:text-ink">
              {SUBMIT_EMAIL}
            </a>{' '}
            to get it on the map.
          </p>
        </div>
      </footer>
    </div>
  );
}

// [{ name, path }, ...]; the last one is the current page.
function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[12px] text-muted">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((item, i) => (
          <li key={item.path} className="flex items-center gap-x-1.5">
            {i > 0 && <span aria-hidden="true">›</span>}
            {i < items.length - 1 ? (
              <a href={item.path} className="hover:text-ink hover:underline underline-offset-2">
                {item.name}
              </a>
            ) : (
              <span aria-current="page" className="text-ink">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

// Facts as a two-column list: "When", "Where", ...
export function Details({ children }) {
  return (
    <dl className="mt-5 grid grid-cols-[96px_1fr] border-t border-hair text-[14px]">
      {children}
    </dl>
  );
}

export function Detail({ label, children }) {
  return (
    <>
      <dt className="py-3 pr-4 border-b border-hair text-[13px] text-muted">{label}</dt>
      <dd className="py-3 border-b border-hair text-ink min-w-0">{children}</dd>
    </>
  );
}

// Outbound link styled like the card's icon buttons, with a label.
export function ActionLink({ href, icon, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 h-9 px-3 border border-hair text-[13px] text-ink hover:bg-surfacealt"
    >
      {icon}
      {children}
    </a>
  );
}

// The page's way back into the live map.
export function MapLink({ href, children }) {
  return (
    <a href={href} className="inline-flex items-center h-10 px-4 bg-ink text-white text-[13px] font-semibold">
      {children}
    </a>
  );
}

export function Section({ title, children }) {
  return (
    <section className="mt-10">
      <h2 className={LABEL_CLASS}>{title}</h2>
      {children}
    </section>
  );
}

// Dated rows: [{ key, path, title, detail }]. A row without a path (a past
// date whose page has expired) is plain text.
export function DateList({ items }) {
  return (
    <ul className="mt-2 border-t border-hair">
      {items.map((item) => {
        const body = (
          <>
            <span className="block text-[14px] font-semibold text-ink">{item.title}</span>
            {item.detail && <span className="block text-[13px] text-muted">{item.detail}</span>}
          </>
        );
        return (
          <li key={item.key} className="border-b border-hair">
            {item.path ? (
              <a href={item.path} className="block py-3 hover:bg-surfacealt">
                {body}
              </a>
            ) : (
              <div className="py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// A sentence or two of context in muted body text.
export function Note({ children }) {
  return <p className="mt-3 text-[14px] text-muted">{children}</p>;
}

// Shown on pages for pop-ups and residencies that have finished.
export function EndedNotice({ children }) {
  return (
    <p className="mt-4 border border-hair bg-surfacealt px-4 py-3 text-[13px] text-ink">{children}</p>
  );
}
