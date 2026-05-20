import { forwardRef } from 'react';
import CategoryBadge from './CategoryBadge.jsx';
import { formatCardDateTime } from '../lib/dateFilters.js';

// Inline icons — used only where they communicate function.
function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0A1628" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="#0A1628" />
    </svg>
  );
}

function OrderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0A1628" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18l-2 12H5L3 6Z" />
      <path d="M8 10v4" />
      <path d="M16 10v4" />
    </svg>
  );
}

function stop(e) {
  e.stopPropagation();
}

const PopupCard = forwardRef(function PopupCard({ popup, onClick }, ref) {
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

        {(popup.instagram_url || popup.order_url) && (
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
          </div>
        )}

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
