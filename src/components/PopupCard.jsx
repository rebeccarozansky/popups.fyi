import { forwardRef, useId } from 'react';
import CategoryBadge from './CategoryBadge.jsx';
import ResidencyGlyph from './ResidencyGlyph.jsx';
import { formatCardDateTime } from '../lib/dateFilters.js';
import { formatResidencyCaption, formatResidencySchedule, isResidency } from '../lib/residencies.js';

// Hand-drawn inline icons. Wobbly bezier paths + slightly imperfect shapes
// to match the marker / legend aesthetic. All single-stroke, ink #0A1628.
// The Instagram, order and map icons are shared with the prerendered pages.
const ICON_STROKE = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: '#0A1628',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

export function InstagramIcon() {
  return (
    <svg {...ICON_STROKE}>
      {/* wobbly rounded square — drawn as a single path so corners feel sketched */}
      <path d="M6.8 3.4 C 5 3.7 3.7 5.1 3.4 6.9 C 3.1 9 3.1 15 3.4 17.1 C 3.7 18.9 5.1 20.3 6.9 20.6 C 9 20.9 15 20.9 17.1 20.6 C 18.9 20.3 20.3 18.9 20.6 17.1 C 20.9 15 20.9 9 20.6 6.9 C 20.3 5.1 18.9 3.7 17.1 3.4 C 15 3.1 9 3.1 6.8 3.4 Z" />
      {/* lens — slightly off-round */}
      <path d="M12.1 8 C 9.8 8 8 9.9 8 12.1 C 8 14.3 9.9 16.1 12.1 16.1 C 14.3 16.1 16.1 14.2 16.1 12 C 16.1 9.8 14.2 8 12.1 8 Z" />
      {/* dot */}
      <circle cx="17.4" cy="6.6" r="0.7" fill="#0A1628" stroke="none" />
    </svg>
  );
}

export function OrderIcon() {
  return (
    <svg {...ICON_STROKE}>
      {/* shopping bag — wobbly trapezoid body */}
      <path d="M5.3 7.6 C 5.3 7.6 8.4 7.5 12 7.5 C 15.6 7.5 18.8 7.6 18.8 7.6 C 18.7 8 18 19.4 17.9 19.8 C 17.7 20.2 17.3 20.4 16.8 20.4 C 14.6 20.5 9.4 20.5 7.2 20.4 C 6.7 20.4 6.3 20.2 6.1 19.8 C 6 19.4 5.4 8 5.3 7.6 Z" />
      {/* handle — two wobbly arcs */}
      <path d="M8.6 7.5 C 8.6 5.4 10 4 12 4 C 14 4 15.4 5.5 15.4 7.5" />
    </svg>
  );
}

export function MapPinIcon() {
  return (
    <svg {...ICON_STROKE}>
      {/* teardrop pin — wobbly bezier outline */}
      <path d="M12 20.8 C 12 20.8 7.2 15.6 6 12.2 C 4.8 8.7 7 4.4 11.4 4 C 16 3.6 18.8 7.4 18 11.2 C 17.2 14.9 12 20.8 12 20.8 Z" />
      {/* inner dot — slightly off-round */}
      <path d="M12.1 7.6 C 10.7 7.6 9.6 8.7 9.6 10.1 C 9.6 11.5 10.7 12.6 12.1 12.6 C 13.5 12.6 14.6 11.5 14.6 10.1 C 14.6 8.7 13.5 7.6 12.1 7.6 Z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg {...ICON_STROKE}>
      {/* three nodes connected by two wobbly lines — sketchy share glyph */}
      <path d="M7.4 9.8 C 5.9 9.8 4.8 11 4.8 12.4 C 4.8 13.9 6 15 7.4 15 C 8.9 15 10 13.8 10 12.4 C 10 11 8.8 9.8 7.4 9.8 Z" />
      <path d="M16.6 4.2 C 15.2 4.2 14 5.4 14 6.8 C 14 8.2 15.2 9.4 16.6 9.4 C 18 9.4 19.2 8.2 19.2 6.8 C 19.2 5.4 18 4.2 16.6 4.2 Z" />
      <path d="M16.6 14.6 C 15.2 14.6 14 15.8 14 17.2 C 14 18.6 15.2 19.8 16.6 19.8 C 18 19.8 19.2 18.6 19.2 17.2 C 19.2 15.8 18 14.6 16.6 14.6 Z" />
      {/* connectors */}
      <path d="M9.6 11.2 C 11.1 10.4 12.7 9.5 14.3 8.1" />
      <path d="M9.6 13.6 C 11.1 14.4 12.7 15.3 14.3 16.4" />
    </svg>
  );
}

// Hand-drawn 5-point star. Slightly off-symmetric points so it reads as
// sketched, not geometric. `filled` swaps to a solid ink fill for the saved
// state.
function StarIcon({ filled }) {
  return (
    <svg {...ICON_STROKE} fill={filled ? '#0A1628' : 'none'}>
      <path d="M12 3.6 C 12.4 4.6 13.5 7 14 7.9 C 15.1 8.1 17.7 8.4 18.9 8.6 C 18.1 9.5 16.3 11.3 15.5 12.1 C 15.7 13.2 16.2 16 16.4 17.1 C 15.4 16.6 13 15.3 12 14.8 C 11 15.3 8.6 16.6 7.6 17.2 C 7.8 16 8.3 13.2 8.5 12.1 C 7.7 11.3 5.9 9.5 5.1 8.6 C 6.3 8.4 8.9 8.1 10 8 C 10.5 7 11.6 4.6 12 3.6 Z" />
    </svg>
  );
}

// Fallback when the pop-up has no page of its own (see pagePathFor in
// src/lib/pages.js): the map with the pop-up selected.
function idShareUrl(popup) {
  const url = new URL(window.location.href);
  // Strip existing query so the share link is clean and unambiguous.
  url.search = '';
  url.hash = '';
  url.searchParams.set('id', popup.id);
  return url.toString();
}

// `pageUrl` is the pop-up's own page, which previews properly in group chats.
async function sharePopup(popup, pageUrl) {
  const url = pageUrl || idShareUrl(popup);
  const title = popup.location_name
    ? `${popup.name} @ ${popup.location_name}`
    : popup.name;
  const text = `${title} on popups.fyi`;
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (err) {
      // User cancelled or share failed — fall through to clipboard.
      if (err && err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    // Lightweight feedback — no toast system in the app yet.
    // eslint-disable-next-line no-alert
    window.alert('Link copied to clipboard');
  } catch {
    // eslint-disable-next-line no-alert
    window.prompt('Copy this link', url);
  }
}

export function mapsUrlFor(popup) {
  // Always use the lat/lng from the sheet — that's the source of truth and
  // matches the pin shown on our map. Address strings sometimes resolve to
  // the wrong place in Google Maps (chain locations, ambiguous names, etc.).
  if (popup.lat != null && popup.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${popup.lat},${popup.lng}`;
  }
  return null;
}

// Links and buttons inside the card. `relative` lifts them above the card's
// full-size select button (or the prerendered title link).
const ACTION_CLASS =
  'relative w-8 h-8 border border-hair flex items-center justify-center active:bg-surfacealt';

// `shareUrlFor(popup)` returns the pop-up's page URL, or null to share ?id=.
// `href` is only set on prerendered pages (src/prerender), where the card's
// title links to the pop-up's page until the app takes over.
const PopupCard = forwardRef(function PopupCard(
  { popup, onClick, isSaved, onToggleSave, isPast, shareUrlFor, href },
  ref,
) {
  const mapsUrl = mapsUrlFor(popup);
  const residency = isResidency(popup);
  const titleId = useId();
  const when = formatCardDateTime(popup);
  const title = (
    <>
      {popup.name}
      {popup.location_name && (
        <span className="font-normal text-muted"> @ {popup.location_name}</span>
      )}
    </>
  );
  return (
    <article
      ref={ref}
      // Explicit fields for the Instagram caption script (tools/instagram-shot),
      // so it doesn't depend on this markup. Residency cards also carry their
      // weekly schedule, which the caption lists in a section of its own.
      data-popup-card=""
      data-popup-id={popup.id}
      data-name={popup.name}
      data-venue={popup.location_name || undefined}
      data-when={when}
      data-instagram={popup.instagram_url || undefined}
      data-residency={residency ? formatResidencyCaption(popup) : undefined}
      className="relative w-full text-left bg-white border-b border-hair active:bg-surfacealt px-5 py-4 flex items-start gap-4"
    >
      {!href && (
        // Selecting the card: a transparent button over the whole card, so the
        // tap target and focus ring are the card's as before, while the links
        // and buttons below sit on top of it instead of nested inside it.
        <button
          type="button"
          aria-labelledby={titleId}
          onClick={() => onClick?.(popup)}
          className="absolute inset-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <div id={titleId} className="text-[16px] font-semibold text-ink leading-tight">
          {href ? (
            <a href={href} className="after:absolute after:inset-0">
              {title}
            </a>
          ) : (
            title
          )}
        </div>

        <div className="mt-1 text-[13px] text-muted">
          {when}
          {residency && (
            <>
              {' '}
              <span className="ml-1 inline-block uppercase tracking-wide text-[11px] font-semibold text-ink border border-hair px-1.5 py-0.5">
                <ResidencyGlyph size={11} strokeWidth={1.6} className="inline-block mr-1 align-[-1px]" />
                Residency
              </span>
            </>
          )}
          {isPast && (
            <span className="ml-2 inline-block uppercase tracking-wide text-[11px] font-semibold text-faint border border-hair px-1.5 py-0.5">
              {residency ? 'Ended' : 'Already happened'}
            </span>
          )}
        </div>

        {residency && (
          <div className="mt-0.5 text-[12px] text-muted">{formatResidencySchedule(popup)}</div>
        )}

        {(popup.neighborhood || (popup.categories && popup.categories.length > 0)) && (
          <div className="mt-2 flex items-center gap-3 text-[13px] text-muted flex-wrap">
            {popup.neighborhood && <span>{popup.neighborhood}</span>}
            {popup.categories && popup.categories.length > 0 && (
              <CategoryBadge categories={popup.categories} />
            )}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
            {popup.instagram_url && (
              <a
                href={popup.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open Instagram"
                className={ACTION_CLASS}
              >
                <InstagramIcon />
              </a>
            )}
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open in Google Maps"
                className={ACTION_CLASS}
              >
                <MapPinIcon />
              </a>
            )}
            {popup.order_url && (
              <a
                href={popup.order_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open order page"
                className={ACTION_CLASS}
              >
                <OrderIcon />
              </a>
            )}
            <button
              type="button"
              onClick={() => sharePopup(popup, shareUrlFor?.(popup))}
              aria-label="Share this pop-up"
              className={ACTION_CLASS}
            >
              <ShareIcon />
            </button>
            {onToggleSave && (
              <button
                type="button"
                onClick={() => onToggleSave(popup.id)}
                aria-label={isSaved ? 'Unsave this pop-up' : 'Save this pop-up'}
                aria-pressed={!!isSaved}
                className={ACTION_CLASS}
              >
                <StarIcon filled={!!isSaved} />
              </button>
            )}
          </div>

        {popup.notes && (
          <div className="mt-2 text-[13px] text-muted">{popup.notes}</div>
        )}
      </div>

      {popup.image_url && (
        <img
          src={popup.image_url}
          alt=""
          width={64}
          height={64}
          className="w-16 h-16 object-cover flex-shrink-0"
          loading="lazy"
        />
      )}
    </article>
  );
});

export default PopupCard;
