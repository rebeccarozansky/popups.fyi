import { forwardRef } from 'react';
import CategoryBadge from './CategoryBadge.jsx';
import { formatCardDateTime } from '../lib/dateFilters.js';

// Hand-drawn inline icons. Wobbly bezier paths + slightly imperfect shapes
// to match the marker / legend aesthetic. All single-stroke, ink #0A1628.
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

function InstagramIcon() {
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

function OrderIcon() {
  return (
    <svg {...ICON_STROKE}>
      {/* shopping bag — wobbly trapezoid body */}
      <path d="M5.3 7.6 C 5.3 7.6 8.4 7.5 12 7.5 C 15.6 7.5 18.8 7.6 18.8 7.6 C 18.7 8 18 19.4 17.9 19.8 C 17.7 20.2 17.3 20.4 16.8 20.4 C 14.6 20.5 9.4 20.5 7.2 20.4 C 6.7 20.4 6.3 20.2 6.1 19.8 C 6 19.4 5.4 8 5.3 7.6 Z" />
      {/* handle — two wobbly arcs */}
      <path d="M8.6 7.5 C 8.6 5.4 10 4 12 4 C 14 4 15.4 5.5 15.4 7.5" />
    </svg>
  );
}

function MapPinIcon() {
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

function shareUrlFor(popup) {
  const url = new URL(window.location.href);
  // Strip existing query so the share link is clean and unambiguous.
  url.search = '';
  url.hash = '';
  url.searchParams.set('id', popup.id);
  return url.toString();
}

async function sharePopup(popup) {
  const url = shareUrlFor(popup);
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

function mapsUrlFor(popup) {
  // Prefer a human address (more accurate pin + name), fall back to lat/lng.
  const label = [popup.location_name, popup.address].filter(Boolean).join(' ');
  if (label) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
  }
  if (popup.lat != null && popup.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${popup.lat},${popup.lng}`;
  }
  return null;
}

function stop(e) {
  e.stopPropagation();
}

const PopupCard = forwardRef(function PopupCard({ popup, onClick }, ref) {
  const mapsUrl = mapsUrlFor(popup);
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onClick?.(popup)}
      className="w-full text-left bg-white border-b border-hair active:bg-surfacealt px-5 py-4 flex items-start gap-4"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[16px] font-semibold text-ink leading-tight">
          {popup.name}
          {popup.location_name && (
            <span className="font-normal text-muted"> @ {popup.location_name}</span>
          )}
        </div>

        <div className="mt-1 text-[13px] text-muted">
          {formatCardDateTime(popup)}
        </div>

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
                onClick={stop}
                aria-label="Open Instagram"
                className="w-8 h-8 border border-hair flex items-center justify-center active:bg-surfacealt"
              >
                <InstagramIcon />
              </a>
            )}
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={stop}
                aria-label="Open in Google Maps"
                className="w-8 h-8 border border-hair flex items-center justify-center active:bg-surfacealt"
              >
                <MapPinIcon />
              </a>
            )}
            {popup.order_url && (
              <a
                href={popup.order_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={stop}
                aria-label="Open order page"
                className="w-8 h-8 border border-hair flex items-center justify-center active:bg-surfacealt"
              >
                <OrderIcon />
              </a>
            )}
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                sharePopup(popup);
              }}
              aria-label="Share this pop-up"
              className="w-8 h-8 border border-hair flex items-center justify-center active:bg-surfacealt"
            >
              <ShareIcon />
            </button>
          </div>

        {popup.notes && (
          <div className="mt-2 text-[13px] text-muted">{popup.notes}</div>
        )}
      </div>

      {popup.image_url && (
        <img
          src={popup.image_url}
          alt=""
          className="w-16 h-16 object-cover flex-shrink-0"
          loading="lazy"
        />
      )}
    </button>
  );
});

export default PopupCard;
