import { useState } from 'react';
import { buildIconMarkerSvg, buildResidencyLegendSvg, MARKER_UNIT_PX } from '../lib/categoryIcons.js';

const ITEMS = [
  { key: 'coffee', label: 'coffee' },
  { key: 'matcha', label: 'matcha' },
  { key: 'bakery', label: 'bakery' },
  { key: 'savory', label: 'savory' },
  { key: 'other',  label: 'other'  },
];

// Small absolute-positioned legend that sits in the top-right of the map
// area. Tap to collapse to a single "legend" pill on mobile so it doesn't
// crowd the view. Rendered above the map (z-index 450+).
// `showResidency` explains the residency exponent while residencies are on the
// map.
export default function MapLegend({ showResidency = false }) {
  const [open, setOpen] = useState(true);
  const residencySample = showResidency ? buildResidencyLegendSvg() : null;

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
            {residencySample && (
              <li className="flex items-center gap-2 pt-1.5 border-t border-hair">
                <span
                  className="inline-flex items-center justify-center"
                  style={{ width: 22, height: 22 }}
                >
                  {/* Left padding equal to the exponent's overhang keeps the
                      stand-in icon centred in line with the icons above. */}
                  <span
                    style={{
                      transform: 'scale(0.65)',
                      transformOrigin: 'center',
                      display: 'inline-block',
                      paddingLeft: residencySample.width - MARKER_UNIT_PX,
                    }}
                    dangerouslySetInnerHTML={{ __html: residencySample.svg }}
                  />
                </span>
                <span className="text-[11px] tracking-[0.06em] uppercase text-ink">residency</span>
              </li>
            )}
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
