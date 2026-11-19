import { RESIDENCY_GLYPH_PATHS } from '../lib/categoryIcons.js';

// The residency house as an inline icon (cards, legend, toggle). Strokes in
// the surrounding text colour.
export default function ResidencyGlyph({ size = 12, strokeWidth = 1.5, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {RESIDENCY_GLYPH_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
