import { useState } from 'react';
import { buildIconMarkerSvg } from '../lib/categoryIcons.js';

const ITEMS = [
  { key: 'coffee', label: 'coffee' },
  { key: 'matcha', label: 'matcha' },
  { key: 'bakery', label: 'bakery' },
  { key: 'other',  label: 'other'  },
];

// Small absolute-positioned legend that sits in the top-right of the map
// area. Tap to collapse to a single "legend" pill on mobile so it doesn't
// crowd the view. Rendered above Leaflet's tile layer (z-index 450+).
export default function MapLegend() {
  const [open, setOpen] = useState(true);

  return (
    <div className="absolute top-3 right-3 z-[450] select-none">
      {open ? (
        <div className="bg-white border border-hair shadow-[0_1px_0_rgba(0,0,0,0.04)]">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full flex items-center justify-between px-3 py-1.5 border-b border-hair text-[10px] tracking-[0.08em] uppercase text-faint hover:text-muted"
            aria-label="Hide legend"
          >
            <span>legend</span>
            <span aria-hidden="true" className="text-ink leading-none">×</span>
          </button>
          <ul className="px-3 py-2 space-y-1.5">
            {ITEMS.map((item) => {
              const { svg } = buildIconMarkerSvg([item.key], false);
              return (
                <li key={item.key} className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center justify-center"
                    style={{ width: 22, height: 22 }}
                    // The marker SVG already sets width/height in px; we
                    // re-scale it down by overriding via a wrapper. Use
                    // a transform so the intrinsic stroke widths scale
                    // proportionally rather than getting clipped.
                  >
                    <span
                      style={{ transform: 'scale(0.65)', transformOrigin: 'center', display: 'inline-block' }}
                      dangerouslySetInnerHTML={{ __html: svg }}
                    />
                  </span>
                  <span className="text-[11px] tracking-[0.06em] uppercase text-ink">{item.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="bg-white border border-hair px-3 py-1.5 text-[10px] tracking-[0.08em] uppercase text-ink hover:text-muted"
          aria-label="Show legend"
        >
          legend
        </button>
      )}
    </div>
  );
}
